// P4：toolkit 服务装配器——面板插件 apply() 时创建并接线 registry + doctor。
//
// 数据源纪律（REQ-5 / 用户要求 1）：本模块只 import 共享基础模块
// （@local/dsh-toolkit/registry 与 /doctor，含其依赖 /contract），
// 禁止 import 任何具体子插件模块（lib/*）——自适应的前提。
// 配置全部来自插件 config（patch 行），无固定端口/绝对路径（D5）。

import { resolve, join } from 'node:path'
// panel/ 是嵌套包：对父包名自引用不可用，共享模块走相对路径引用构建产物。
import { ToolkitRegistryCore, cordisHost } from '../../registry/dist/index.js'
import { DoctorService } from '../../doctor/dist/index.js'

/**
 * @param {object} ctx        cordis 宿主 ctx（面板插件自身的派生 ctx）
 * @param {object} config     toolkit-manager 行 config（servicePrefix/registry/doctor 段）
 * @param {object} logger     面板日志器（info/warn/error）
 * @returns {{ registry: object, doctor: object, servicePrefix: string, statePath: string, stop: () => Promise<void> }}
 */
export function createToolkitServices(ctx, config = {}, logger = console) {
  const servicePrefix = String(config.servicePrefix || 'toolkit')
  const toolkitRoot = config.toolkitRoot ? resolve(String(config.toolkitRoot)) : resolve(process.cwd(), '..')
  const registryCfg = config.registry || {}
  const doctorCfg = config.doctor || {}

  const statePath = resolve(
    registryCfg.statePath
      || (registryCfg.dataDir ? join(registryCfg.dataDir, 'state.json') : join(toolkitRoot, '.registry', 'state.json')),
  )

  const host = cordisHost(ctx)
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

  // 接线（REQ-3/REQ-4）：安装预检走 doctor；健康报告回落到 registry 条目，
  // 供面板快照直接呈现（面板不另开旁路状态，用户要求 3）。
  registry.setPrecheck((source) => doctor.precheck(source))
  ctx.on?.(`${servicePrefix}/registry:health-changed`, (payload) => {
    if (payload && payload.id && payload.report) registry.setHealth(payload.id, payload.report)
  })

  registry.start()
  if ((doctorCfg.watchInterval ?? 30000) > 0) doctor.startWatch()

  return {
    registry,
    doctor,
    servicePrefix,
    statePath,
    stop: async () => {
      doctor.stopWatch()
      await registry.stop()
    },
  }
}
