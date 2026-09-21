// P4：toolkit 服务装配器——面板插件 apply() 时创建并接线 registry + doctor。
//
// 数据源纪律（REQ-5 / 用户要求 1）：本模块只 import 共享基础模块
// （@local/dsh-toolkit/registry 与 /doctor，含其依赖 /contract），
// 禁止 import 任何具体子插件模块（lib/*）——自适应的前提。
// 配置全部来自插件 config（patch 行），无固定端口（D5）。toolkitRoot 的缺省值来自
// **模块自身位置**（manager/toolkit-root.mjs），不再是进程 cwd——H1 / 债务 D-11。

import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
// panel/ 是嵌套包：对父包名自引用不可用，共享模块走相对路径引用构建产物。
import { ToolkitRegistryCore, cordisHost } from '../../registry/dist/index.js'
import { DoctorService } from '../../doctor/dist/index.js'
import { normalizeServicePrefix } from '../../contract/dist/index.js'
import { createAuditSink } from './audit-sink.mjs'
import { resolveToolkitRoot } from './toolkit-root.mjs'

/** 落点不可用时的可执行建议（参照 doctor 的可执行化口径：点名缺什么、下一步做什么）。 */
function landingAdvice(path, error) {
  const reason = String(error && error.message ? error.message : error)
  return {
    path,
    error: reason,
    advice: [
      `确认该路径可写（当前失败原因：${reason}）`,
      '若这是宿主进程的启动目录副作用：给 toolkit-manager 行补 config.toolkitRoot，或给 registry.statePath / registry.auditFile 填一个绝对可写路径后重启宿主',
    ],
  }
}

/**
 * @param {object} ctx        cordis 宿主 ctx（面板插件自身的派生 ctx）
 * @param {object} config     toolkit-manager 行 config（servicePrefix/registry/doctor 段）
 * @param {object} logger     面板日志器（info/warn/error）
 * @returns {{ registry: object, doctor: object, servicePrefix: string, statePath: string, stop: () => Promise<void>, durability: () => object }}
 */
export function createToolkitServices(ctx, config = {}, logger = console) {
  // 前缀归一走 contract.normalizeServicePrefix（与面板 HTTP 基址同源，缺省值单点定义）。
  const servicePrefix = normalizeServicePrefix(config.servicePrefix)
  // H1（债务 D-11）：以前这一行是 `resolve(process.cwd(), '..')`，于是状态与审计的落点
  // 随"谁怎么把宿主拉起来"而变（实测在 C:\Windows\.registry 与 D:\dsh-plugins\.registry
  // 之间漂移过两次）。现在与面板同源：显式 config 优先，缺省按模块位置锚定，与 cwd 无关。
  const toolkitRoot = resolveToolkitRoot(config)
  const registryCfg = config.registry || {}
  const doctorCfg = config.doctor || {}

  const statePath = resolve(
    registryCfg.statePath
      || (registryCfg.dataDir ? join(registryCfg.dataDir, 'state.json') : join(toolkitRoot, '.registry', 'state.json')),
  )
  // 装配期就确认状态落点可用（H1 失效模式①：不许裸抛，也不许等到第一次落盘才炸）。
  // 建不出来只降级为"如实申报 + 面板可见"，不阻断装配——面板装不上比状态没落盘严重得多。
  let stateLanding = { ok: true, path: statePath }
  try {
    mkdirSync(dirname(statePath), { recursive: true })
  } catch (error) {
    stateLanding = { ok: false, ...landingAdvice(statePath, error) }
    logger.warn(`状态落点不可用：${statePath} —— ${stateLanding.error}`)
  }

  const host = cordisHost(ctx)
  // 最小宿主容错（如并行线 ui-matrix 的 mock ctx 无 reflect/on）：无服务面时跳过
  // 服务注册，无事件面时不启动周期巡检（避免留下悬挂定时器）。
  const hasRealHost = !!(ctx.reflect && typeof ctx.reflect.provide === 'function')
  const hasEvents = typeof ctx.on === 'function'
  if (!hasRealHost) {
    host.provideService = () => {}
  }
  const registry = new ToolkitRegistryCore(host, {
    servicePrefix,
    statePath,
    autoload: registryCfg.autoload !== false,
    retryLimit: registryCfg.retryLimit ?? 3,
    retryBackoffMs: registryCfg.retryBackoffMs ?? 500,
    loadTimeoutMs: registryCfg.loadTimeoutMs ?? 30000,
    logger,
  })

  const doctor = new DoctorService({
    servicePrefix,
    watchInterval: doctorCfg.watchInterval ?? 30000,
    failureThreshold: doctorCfg.failureThreshold ?? 3,
    historySize: doctorCfg.historySize ?? 20,
    logger,
  })
  doctor.attachHost(host)
  doctor.attachRegistry(registry)
  // Pack C：把 doctor 也注册成 cordis 服务 `${servicePrefix}/doctor`。
  // 为什么在面板装配现场注册、而不是改走 doctor 的 createDoctor()：面板是 REQ-8 裁定
  // 保留的**唯一装配现场**（docs/embed-toolkit.md §1），另起一个 createDoctor 现场会
  // 造出第二个装配点。这里只是把已有实例的引用交给容器，不复制任何装配逻辑。
  // 为什么用 ctx.reflect.provide（经 host.provideService）：注册权归**当前 fiber**，
  // 也就是面板自己的派生 ctx——面板被卸出时 cordis 自动摘除该服务
  // （reflect.ts 的 provide 把注册包进 fiber.effect，卸载即回收），
  // toolkit 不需要写任何补偿式 cleanup。
  // 与 registry 的注册方式同源（registry.start() → 同一个 host）。mock ctx 缺服务面时
  // host.provideService 已被上面降级为 noop，这里无需再判一次。
  host.provideService(doctor.serviceName, doctor)

  // 接线（REQ-3/REQ-4）：安装预检走 doctor；健康报告回落到 registry 条目，
  // 供面板快照直接呈现（面板不另开旁路状态，用户要求 3）。
  registry.setPrecheck((source) => doctor.precheck(source))
  if (hasEvents) {
    // 订阅归入 ctx.effect 生命周期：面板卸出即解除，不依赖派生 ctx 何时被宿主回收
    // （P7 验收「卸载级联清理计数归零」要求监听器与 HTTP 路由同批清）。
    // 监听器自带异常防御（A1 纪律，见 registry/src/host.ts 头注）：cordis 的 emit
    // 不逐监听器隔离，这里抛出去会中断同批其它订阅者。
    ctx.effect(() => {
      const disposer = ctx.on(`${servicePrefix}/registry:health-changed`, (payload) => {
        try {
          if (payload && payload.id && payload.report) registry.setHealth(payload.id, payload.report)
        } catch (error) {
          logger.warn(`健康回写失败（忽略，不影响被通知方）：${String(error && error.message || error)}`)
        }
      })
      return () => {
        try {
          disposer()
        } catch {
          // 订阅已失效
        }
      }
    })
  }

  // 审计落盘（债务 #4）：状态文件同目录的 audit.jsonl，与安装记录同生命周期、同前缀命名空间。
  // 必须在 registry.start()（含 autoload 恢复）之前挂上，否则首批 audit 事件会漏记。
  const auditEnabled = registryCfg.auditLog !== false
  const auditFile = resolve(registryCfg.auditFile || join(dirname(statePath), 'audit.jsonl'))
  // H1（失效模式①的另一半）：createAuditSink 现在自己不抛了（落点建不出来时返回降级面），
  // 修复前它那一句无 try/catch 的 mkdirSync 会把整个面板装配炸掉。
  const auditSink = hasEvents && auditEnabled
    ? createAuditSink({ servicePrefix, file: auditFile, on: (name, cb) => ctx.on(name, cb), logger })
    : { ok: false, file: auditFile, error: hasEvents ? 'registry.auditLog=false（显式关闭）' : '宿主无事件面', advice: [] }
  if (hasEvents && auditEnabled && auditSink.ok !== true) {
    // 真的尝试过建 sink 却没建成才申报（显式关闭 / 无事件面不是故障）。
    logger.warn(`审计落点不可用：${auditFile} —— ${auditSink.error}`)
  }

  registry.start()
  if (hasEvents && (doctorCfg.watchInterval ?? 30000) > 0) doctor.startWatch()

  /**
   * 两面"是否真在落盘"的单一事实源（H1 / D-11 可见化）：
   * state = 安装记录（重启后能否恢复），audit = 审计流水（事后能否可查）。
   * 面板与 /v2/snapshot 都是读取方，不各自缓存（与 D-8 的"状态源唯一"同一口径）。
   * 装配期就连目录都建不出来 ⇒ 一律不 ok（此后每次写盘失败由 registry 覆盖为更具体的原因）。
   */
  const durability = () => ({
    state: stateLanding.ok === false
      ? stateLanding
      : (typeof registry.stateSaveStatus === 'function' ? registry.stateSaveStatus() : { ok: true, path: statePath }),
    audit: {
      ok: auditSink.ok === true,
      file: auditFile,
      ...(auditSink.error ? { error: auditSink.error, advice: auditSink.advice ?? [] } : {}),
    },
  })

  return {
    registry,
    doctor,
    servicePrefix,
    statePath,
    auditFile: auditSink.ok === true ? auditSink.file : null,
    durability,
    stop: async () => {
      doctor.stopWatch()
      await registry.stop()
      if (typeof auditSink.dispose === 'function') auditSink.dispose()
    },
  }
}
