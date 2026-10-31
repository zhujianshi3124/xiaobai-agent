// governance-context-audit —— 上下文开销审计（批次 5A 续）
//
// 职责：一次性只读盘点「skill / 插件 / MCP 的注入开销（token 成本）」，把结果写成
// 一份结构化报告，落在 <toolkitRoot>/.toolkit-governance/governance-context-audit/latest.json。
//
// 形态照 governance-preflight 样板，五条纪律逐条对应实现：
//   ① 默认静默＝不注入、不出声，**不是不运行**：默认挂载、apply() 会执行、会产出报告；
//      但绝不向对话上下文注入任何内容。
//   ② 不自带面板：不调用 ctx.slots，模块不导出 panels，manifest 的 panels 面留空。
//   ③ 不注册 prompt / skill：不 inject 'systemPrompt' / 'skills'。
//   ④ 可独立卸载：不订阅事件、不建 fiber、不起定时器、不注册 service/command/provider
//      ⇒ 摘掉 lib/governance-context-audit/ 与那一条 patch 行即零残留。
//   ⑤ 本文件只依赖 node:fs / node:path / node:url 三个内置模块：不 import 任何
//      lib/ 兄弟插件（pluggable-lint 的 isSibling 判据），也不 import panel/manager
//      （p4-no-subplugin-import-check 的 module 规则）。
//
// **零 ctx.on（本批硬要求）**：不订阅任何事件，只读「当前快照 + 磁盘文件」。
// ctx.tokenMeter 走 ctx.get() 只读探测（不 inject）：inject 为空数组时直接属性访问
// 会被 cordis 的 Proxy 判 "cannot get property ... without inject" 而抛错，
// 故必须用 ctx.get 的软取通道；取不到就如实降级，绝不为此引入 ctx.on。
//
// 为什么 apply() 整段 try/catch 且绝不 throw（裁决 C 的硬要求）：
// 本插件默认启用、随宿主加载运行。它是新代码，若自己有 bug 却把异常抛给装载器，
// 就有可能影响宿主启动。捕获后静默失败，最坏结果是「没有报告文件」，不会拖垮宿主。
// 这条比「能不能工作」优先级更高。

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'governance-context-audit'
/** 空数组＝不依赖任何宿主服务：ctx.tokenMeter 走 ctx.get 软探测，缺席即降级。 */
export const inject = []

/** 报告根目录名（与批次 4 面板区块、governance-preflight 的约定路径同源）。 */
export const REPORT_DIR_NAME = '.toolkit-governance'
/** 本插件在报告根下的子目录名。 */
export const REPORT_PLUGIN_DIR = 'governance-context-audit'
/** 报告文件 schema 标识，供后续批次读取方按版本解析。 */
export const REPORT_SCHEMA = 'toolkit-governance/context-audit@1'

/**
 * 模块位置推导仓根：本文件在 lib/governance-context-audit/ 下，上溯两级即仓根。
 * 与 panel/manager/toolkit-root.mjs 的 moduleToolkitRoot() 数学等价——但**不 import 它**：
 * 跨包引用 panel/manager 会被 p4-no-subplugin-import-check 判红。
 * 符号链接/别名安装下推导可能算错，故结果同时写进报告的 toolkitRootResolved 字段，
 * 一旦算错，报告里能直接看出来，不会静默错下去（批次 5 裁决一）。
 */
export function moduleToolkitRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
}

/** 归一后的报告根（显式 config 优先，否则落在推导出的仓根下）。 */
export function resolveReportRoot(toolkitRoot) {
  return join(toolkitRoot, REPORT_DIR_NAME, REPORT_PLUGIN_DIR)
}

function readJsonSafe(abs) {
  try {
    return JSON.parse(readFileSync(abs, 'utf8'))
  } catch {
    return undefined
  }
}

function listLibDirs(toolkitRoot) {
  try {
    return readdirSync(join(toolkitRoot, 'lib'), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
  } catch {
    return []
  }
}

function asArray(v) {
  return Array.isArray(v) ? v : []
}

/**
 * 软取宿主服务：inject 为空数组时，直接 ctx.tokenMeter 会被 Proxy 拒绝并抛错，
 * 故一律走 ctx.get()。任何异常都归为「不可用」，不影响报告落盘。
 * @returns {unknown|undefined} 服务实例，或 undefined（缺席/取不到）
 */
function softService(ctx, serviceName) {
  try {
    if (!ctx || typeof ctx.get !== 'function') return undefined
    const service = ctx.get(serviceName)
    return service === null ? undefined : service
  } catch {
    return undefined
  }
}

/**
 * 读 ctx.tokenMeter 当前快照。
 * tokenMeter 的公开面是 measure(session)，需要 session 实例；本插件不 inject 'sessions'，
 * 故同样用 ctx.get 软探测。逐会话测量，单会话失败不影响其它会话。
 * 取不到就是取不到——如实记录 unavailableReason，**不为此引入 ctx.on**。
 */
export function collectTokenMeterSnapshot(ctx) {
  const result = {
    available: false,
    unavailableReason: null,
    sessionCount: 0,
    measuredCount: 0,
    totalTokens: null,
    sessions: [],
  }
  const meter = softService(ctx, 'tokenMeter')
  if (!meter || typeof meter.measure !== 'function') {
    result.unavailableReason = 'ctx.tokenMeter 不可用（服务缺席或未提供 measure）'
    return result
  }
  result.available = true
  const store = softService(ctx, 'sessions')
  if (!store || typeof store.list !== 'function') {
    result.unavailableReason = 'ctx.sessions 不可用，无法取得会话以调用 measure()'
    return result
  }
  let sessions = []
  try {
    sessions = store.list()
  } catch (error) {
    result.unavailableReason = 'ctx.sessions.list() 抛错：' + String((error && error.message) || error)
    return result
  }
  result.sessionCount = Array.isArray(sessions) ? sessions.length : 0
  if (result.sessionCount === 0) {
    result.unavailableReason = '当前无活动会话（apply 期常为空），无 per-turn 用量可取'
    return result
  }
  let total = 0
  for (const session of sessions) {
    try {
      const m = meter.measure(session)
      if (!m) continue
      const id = typeof session?.id === 'string' ? session.id : null
      const tokens = typeof m.totalTokens === 'number' ? m.totalTokens : 0
      total += tokens
      result.measuredCount += 1
      result.sessions.push({
        id,
        totalTokens: tokens,
        surfaceTokens: typeof m.surfaceTokens === 'number' ? m.surfaceTokens : null,
        surfaceDeltaTokens: typeof m.surfaceDeltaTokens === 'number' ? m.surfaceDeltaTokens : null,
        baselineKind: m.baseline && typeof m.baseline.kind === 'string' ? m.baseline.kind : null,
        logRevision: typeof m.logRevision === 'number' ? m.logRevision : null,
        nodeCount: Array.isArray(m.nodes) ? m.nodes.length : null,
      })
    } catch (error) {
      result.sessions.push({
        id: typeof session?.id === 'string' ? session.id : null,
        error: String((error && error.message) || error),
      })
    }
  }
  result.totalTokens = result.measuredCount > 0 ? total : null
  if (result.measuredCount === 0) {
    result.unavailableReason = '所有会话 measure() 均失败，无可用读数'
  }
  return result
}

/**
 * 读 usage-ledger.json 历史数据（**只读该文件，不订阅写入事件**）。
 * 已知 shape：{version, days:{YYYY-MM-DD:{provider:{model:{inputTokens,outputTokens,
 * cacheReadTokens,cacheWriteTokens,reasoningTokens,calls,cost}}}}}
 * 缺失/不可解析一律降级为 absent，不抛。
 */
export function collectUsageLedger(ledgerPath) {
  const result = {
    path: ledgerPath,
    present: false,
    readable: false,
    version: null,
    dayCount: 0,
    firstDay: null,
    lastDay: null,
    totals: null,
    byProvider: [],
  }
  if (!ledgerPath) {
    result.present = false
    return result
  }
  result.present = existsSync(ledgerPath)
  if (!result.present) return result
  const data = readJsonSafe(ledgerPath)
  if (data === undefined || data === null || typeof data !== 'object') return result
  result.readable = true
  result.version = typeof data.version === 'number' ? data.version : null
  const days = data.days && typeof data.days === 'object' ? data.days : {}
  const dayKeys = Object.keys(days).sort()
  result.dayCount = dayKeys.length
  result.firstDay = dayKeys.length > 0 ? dayKeys[0] : null
  result.lastDay = dayKeys.length > 0 ? dayKeys[dayKeys.length - 1] : null
  const totals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, calls: 0 }
  const providers = new Map()
  for (const day of dayKeys) {
    const providersOfDay = days[day] && typeof days[day] === 'object' ? days[day] : {}
    for (const providerName of Object.keys(providersOfDay)) {
      const modelsOfProvider = providersOfDay[providerName] && typeof providersOfDay[providerName] === 'object' ? providersOfDay[providerName] : {}
      if (!providers.has(providerName)) providers.set(providerName, { provider: providerName, models: 0, inputTokens: 0, outputTokens: 0, calls: 0 })
      const bucket = providers.get(providerName)
      for (const modelName of Object.keys(modelsOfProvider)) {
        const rec = modelsOfProvider[modelName] && typeof modelsOfProvider[modelName] === 'object' ? modelsOfProvider[modelName] : {}
        bucket.models += 1
        for (const key of Object.keys(totals)) {
          const v = typeof rec[key] === 'number' && Number.isFinite(rec[key]) ? rec[key] : 0
          totals[key] += v
          if (key in bucket) bucket[key] += v
        }
      }
    }
  }
  result.totals = totals
  result.byProvider = [...providers.values()].sort((a, b) => b.inputTokens - a.inputTokens)
  return result
}

/**
 * 盘点各子插件 manifest 的 provides.inject（声明注入了哪些服务）。
 * inject 是「向宿主索取服务」的声明面，每多注入一个服务就多一份上下文/生命周期开销。
 */
export function collectPluginInjectFace(toolkitRoot) {
  const plugins = []
  for (const dir of listLibDirs(toolkitRoot)) {
    const pluginDir = join(toolkitRoot, 'lib', dir)
    const manifestPath = join(pluginDir, 'dsh.plugin.json')
    const manifest = readJsonSafe(manifestPath)
    if (manifest === undefined) {
      plugins.push({ dir, manifestPresent: false, name: null, inject: [], legacyInject: [], declaredEvents: [], injectCount: 0 })
      continue
    }
    const provides = manifest.provides && typeof manifest.provides === 'object' ? manifest.provides : {}
    const requirements = manifest.requirements && typeof manifest.requirements === 'object' ? manifest.requirements : {}
    const registers = requirements.registers && typeof requirements.registers === 'object' ? requirements.registers : {}
    const injectList = asArray(provides.inject).filter((x) => typeof x === 'string')
    const legacyInject = asArray(registers.inject).filter((x) => typeof x === 'string')
    plugins.push({
      dir,
      manifestPresent: true,
      name: typeof manifest.name === 'string' ? manifest.name : null,
      inject: injectList,
      legacyInject,
      declaredEvents: asArray(registers.events),
      injectCount: injectList.length,
    })
  }
  return plugins
}

/**
 * 组装报告对象（纯函数：只读文件系统与服务快照，不写任何东西）。
 * @param {string} toolkitRoot 已 resolve 的仓根
 * @param {object} [opts] {reportRoot, rootSource, usageLedgerPath, ctx}
 */
export function buildReport(toolkitRoot, opts = {}) {
  const root = String(toolkitRoot || '')
  const issues = []
  const addIssue = (code, level, message, target) =>
    issues.push({ code, level, message, target: target === undefined ? null : target })

  const plugins = collectPluginInjectFace(root)
  const tokenMeter = collectTokenMeterSnapshot(opts.ctx)
  const usageLedger = collectUsageLedger(opts.usageLedgerPath)

  if (tokenMeter.available === false) {
    addIssue('token-meter-unavailable', 'info', 'ctx.tokenMeter 读数不可用：' + String(tokenMeter.unavailableReason), null)
  }
  if (usageLedger.present === false) {
    addIssue('usage-ledger-absent', 'info', 'usage-ledger.json 不在场：' + String(usageLedger.path || '(未指定路径)'), usageLedger.path)
  } else if (usageLedger.readable === false) {
    addIssue('usage-ledger-unreadable', 'warn', 'usage-ledger.json 在场但不可解析', usageLedger.path)
  }
  for (const p of plugins) {
    if (!p.manifestPresent) addIssue('sub-manifest-missing', 'warn', '子插件目录里没有可读的 dsh.plugin.json', join(root, 'lib', p.dir))
    else if (p.legacyInject.length > 0) addIssue('legacy-inject-declared', 'info', '仍走 legacy requirements.registers.inject 声明注入面：' + p.legacyInject.join(', '), join(root, 'lib', p.dir, 'dsh.plugin.json'))
  }

  const totalInjectRefs = plugins.reduce((n, p) => n + p.injectCount, 0)

  return {
    schema: REPORT_SCHEMA,
    plugin: 'governance-context-audit',
    generatedAt: new Date().toISOString(),
    // 批次 5 裁决一：推导出的仓根必须进报告元信息，算错时能一眼看出来。
    toolkitRootResolved: root,
    toolkitRootSource: opts.rootSource === undefined ? 'module-location' : String(opts.rootSource),
    reportRoot: opts.reportRoot === undefined ? resolveReportRoot(root) : String(opts.reportRoot),
    inputs: {
      libDir: join(root, 'lib'),
      usageLedgerPath: usageLedger.path,
      tokenMeterReadable: tokenMeter.available === true,
      usageLedgerReadable: usageLedger.readable === true,
    },
    summary: {
      subPlugins: plugins.length,
      manifestsPresent: plugins.filter((p) => p.manifestPresent).length,
      totalInjectRefs,
      pluginsWithInject: plugins.filter((p) => p.injectCount > 0).length,
      tokenMeterAvailable: tokenMeter.available === true,
      tokenMeterSessionsMeasured: tokenMeter.measuredCount,
      tokenMeterTotalTokens: tokenMeter.totalTokens,
      usageLedgerPresent: usageLedger.present === true,
      usageLedgerDays: usageLedger.dayCount,
      usageLedgerSpan: usageLedger.firstDay && usageLedger.lastDay ? usageLedger.firstDay + '..' + usageLedger.lastDay : null,
      usageLedgerCalls: usageLedger.totals ? usageLedger.totals.calls : null,
      usageLedgerInputTokens: usageLedger.totals ? usageLedger.totals.inputTokens : null,
      issues: issues.length,
      issuesByLevel: {
        error: issues.filter((i) => i.level === 'error').length,
        warn: issues.filter((i) => i.level === 'warn').length,
        info: issues.filter((i) => i.level === 'info').length,
      },
    },
    tokenMeter,
    usageLedger,
    plugins,
    issues,
    notes: [
      '本报告只读产出：不修改任何插件、配置或用户文件。',
      '零 ctx.on：本插件不订阅任何事件，只读当前快照与磁盘文件。',
      'usage-ledger.json 仅只读解析，不订阅其写入事件。',
      '治理报告根约定：<toolkitRoot>/.toolkit-governance/',
    ],
  }
}

/**
 * 落盘一份报告。只写自己的子目录，不碰父级之外的任何路径。
 * @returns {{ok: boolean, path?: string, error?: string}}
 */
export function writeReport(report, reportRoot) {
  try {
    mkdirSync(reportRoot, { recursive: true })
    const out = join(reportRoot, 'latest.json')
    writeFileSync(out, JSON.stringify(report, null, 2) + '\n', 'utf8')
    return { ok: true, path: out }
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) }
  }
}

/** 缺省 usage-ledger 路径：<home>/.dsh/dsh-usage/usage-ledger.json（只读）。 */
export function defaultUsageLedgerPath(homeDir) {
  try {
    return join(homeDir, '.dsh', 'dsh-usage', 'usage-ledger.json')
  } catch {
    return ''
  }
}

/**
 * 插件入口。整段 try/catch，**绝不 throw**（裁决 C：新插件不能因自身 bug 影响宿主）。
 * 全程不使用 ctx.on / ctx.slots / ctx.systemPrompt / ctx.tools。
 * ctx.tokenMeter / ctx.sessions 走 ctx.get 只读软探测，缺席即降级。
 */
export function apply(ctx, config = {}) {
  try {
    const cfg = config && typeof config === 'object' ? config : {}
    if (cfg.enabled === false) return
    const explicitRoot = typeof cfg.reportRoot === 'string' ? cfg.reportRoot.trim() : ''
    const toolkitRoot = moduleToolkitRoot()
    const reportRoot = explicitRoot !== '' ? resolve(explicitRoot) : resolveReportRoot(toolkitRoot)
    const cfgLedger = typeof cfg.usageLedgerPath === 'string' ? cfg.usageLedgerPath.trim() : ''
    const homeDir =
      (typeof process !== 'undefined' && process.env && (process.env.USERPROFILE || process.env.HOME)) || ''
    const usageLedgerPath = cfgLedger !== '' ? resolve(cfgLedger) : defaultUsageLedgerPath(homeDir)
    const report = buildReport(toolkitRoot, {
      reportRoot,
      rootSource: 'module-location',
      usageLedgerPath,
      ctx,
    })
    writeReport(report, reportRoot)
  } catch (error) {
    // 静默失败：最坏结果是没有报告文件，绝不让本插件的 bug 冒泡到宿主装载链。
    // 隔离原则不变（绝不冒泡），但失败必须可见，不得伪装成「正常没报告」。
    console.error('[governance-context-audit] 报告生成失败（不影响宿主装载）:', error?.message ?? error);
  }
}

export default { name, inject, apply }
