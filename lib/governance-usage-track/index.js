// governance-usage-track —— 长期使用追踪与僵尸识别（批次 5B 首件）
//
// 职责：跨时间盘点 usage-ledger.json，产出「每 provider/model 的按天时间序列 +
// 使用频次分层 + 僵尸识别 + 趋势」，写成一份结构化报告，落在
// <toolkitRoot>/.toolkit-governance/governance-usage-track/latest.json。
//
// 与 governance-context-audit 的分工（本插件存在的理由）：
//   context-audit = **某一时刻的注入开销快照**（当前 ctx.tokenMeter + ledger 汇总）。
//   usage-track   = **跨时间的趋势与僵尸识别**（按天序列、频次分层、停用检测、走向）。
// 两者都读同一份 ledger，但看的是不同维度：一个是"现在多重"，一个是"还活着吗、在变多还是变少"。
//
// 形态照 governance-preflight 样板，五条纪律逐条对应实现：
//   ① 默认静默＝不注入、不出声，**不是不运行**：默认挂载、apply() 会执行、会产出报告；
//      但绝不向对话上下文注入任何内容。
//   ② 不自带面板：不调用 ctx.slots，模块不导出 panels，manifest 的 panels 面留空。
//   ③ 不注册 prompt / skill：不 inject 'systemPrompt' / 'skills'。
//   ④ 可独立卸载：不订阅事件、不建 fiber、不起定时器、不注册 service/command/provider
//      ⇒ 摘掉 lib/governance-usage-track/ 与那一条 patch 行即零残留。
//   ⑤ 本文件只依赖 node:fs / node:path / node:url 三个内置模块：不 import 任何
//      lib/ 兄弟插件（pluggable-lint 的 isSibling 判据），也不 import panel/manager
//      （p4-no-subplugin-import-check 的 module 规则）。
//
// **零 ctx.on（本批硬要求）**：不订阅任何事件。本插件连 ctx 服务都不需要——
// usage-ledger.json 是普通磁盘文件，manifest 也是；故 apply() 全程同步、无浮空 Promise。
//
// 为什么 apply() 整段 try/catch 且绝不 throw（裁决 C 的硬要求）：
// 本插件默认启用、随宿主加载运行。它是新代码，若自己有 bug 却把异常抛给装载器，
// 就有可能影响宿主启动。捕获后静默失败，最坏结果是「没有报告文件」，不会拖垮宿主。
// 这条比「能不能工作」优先级更高。

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'governance-usage-track'
/** 空数组＝不依赖任何宿主服务：本插件只读磁盘文件，不需要 ctx。 */
export const inject = []

/** 报告根目录名（与批次 4 面板区块、其它治理插件的约定路径同源）。 */
export const REPORT_DIR_NAME = '.toolkit-governance'
/** 本插件在报告根下的子目录名。 */
export const REPORT_PLUGIN_DIR = 'governance-usage-track'
/** 报告文件 schema 标识，供后续批次读取方按版本解析。 */
export const REPORT_SCHEMA = 'toolkit-governance/usage-track@1'

/**
 * 判定阈值（缺省值，均可在 manifest config 覆盖）。
 *
 * 为什么是这三个数（依据本机 29 天真实分布，见报告 baseline 段）：
 *   highFreqCalls=500：本机 21 个 provider|model 里，前 6 个都 ≥445 次，第 7 名骤降到 206。
 *                      500 恰好落在"主力通道"与"备用通道"的自然断层上。
 *   midFreqCalls=50 ：第 15 名 42 次、第 16 名 24 次——50 是"偶发使用"与"几乎不用"的分界。
 *   zombieDays=14    ：两周。低于此数的静默可能只是"这两周没切到那条路"，超过两周
 *                      基本可判定为事实停用。与"前 7 天"相比，14 天抗单周偶发更强。
 */
export const DEFAULT_ZOMBIE_DAYS = 14
export const DEFAULT_HIGH_FREQ_CALLS = 500
export const DEFAULT_MID_FREQ_CALLS = 50
/** 趋势对比窗口（天）：最近 N 天 vs 之前 N 天。 */
export const DEFAULT_TREND_WINDOW_DAYS = 7
/** 趋势判定：变化率绝对值低于此值算「平稳」。 */
export const TREND_FLAT_RATIO = 0.15

/**
 * 模块位置推导仓根：本文件在 lib/governance-usage-track/ 下，上溯两级即仓根。
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

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** 日期字符串（YYYY-MM-DD）加减天数，纯字符串→UTC 计算，避免本地时区漂移。 */
export function addDays(dateStr, delta) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr))
  if (!m) return null
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + delta * 86400000
  const d = new Date(t)
  const pad = (n) => String(n).padStart(2, '0')
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate())
}

/** 两个日期相差的天数（b - a）。 */
export function daysBetween(a, b) {
  const pa = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(a))
  const pb = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(b))
  if (!pa || !pb) return null
  const ta = Date.UTC(Number(pa[1]), Number(pa[2]) - 1, Number(pa[3]))
  const tb = Date.UTC(Number(pb[1]), Number(pb[2]) - 1, Number(pb[3]))
  return Math.round((tb - ta) / 86400000)
}

/**
 * 读 usage-ledger.json。缺失/不可解析一律降级，绝不抛。
 * 已知 shape：{version, days:{YYYY-MM-DD:{provider:{model:{inputTokens,outputTokens,
 * cacheReadTokens,cacheWriteTokens,reasoningTokens,calls,cost}}}}}
 */
export function loadLedger(ledgerPath) {
  const result = { path: ledgerPath, present: false, readable: false, version: null, days: {}, dayKeys: [] }
  if (!ledgerPath) return result
  result.present = existsSync(ledgerPath)
  if (!result.present) return result
  const data = readJsonSafe(ledgerPath)
  if (!data || typeof data !== 'object') return result
  const days = data.days && typeof data.days === 'object' ? data.days : null
  if (!days) return result
  result.readable = true
  result.version = typeof data.version === 'number' ? data.version : null
  result.days = days
  result.dayKeys = Object.keys(days).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort()
  return result
}

/**
 * 把 ledger 摊平成「每个 provider|model 一条记录」，含按天序列。
 * 这是后续所有维度（分层/僵尸/趋势）的唯一底座。
 */
export function buildSeries(ledger) {
  const map = new Map()
  for (const day of ledger.dayKeys) {
    const providers = ledger.days[day] && typeof ledger.days[day] === 'object' ? ledger.days[day] : {}
    for (const provider of Object.keys(providers)) {
      const models = providers[provider] && typeof providers[provider] === 'object' ? providers[provider] : {}
      for (const model of Object.keys(models)) {
        const rec = models[model] && typeof models[model] === 'object' ? models[model] : {}
        const key = provider + ' | ' + model
        if (!map.has(key)) {
          map.set(key, {
            provider,
            model,
            key,
            activeDays: 0,
            calls: 0,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            reasoningTokens: 0,
            firstDay: day,
            lastDay: day,
            series: [],
          })
        }
        const e = map.get(key)
        const calls = num(rec.calls)
        e.activeDays += 1
        e.calls += calls
        e.inputTokens += num(rec.inputTokens)
        e.outputTokens += num(rec.outputTokens)
        e.cacheReadTokens += num(rec.cacheReadTokens)
        e.cacheWriteTokens += num(rec.cacheWriteTokens)
        e.reasoningTokens += num(rec.reasoningTokens)
        if (day < e.firstDay) e.firstDay = day
        if (day > e.lastDay) e.lastDay = day
        e.series.push({ day, calls, inputTokens: num(rec.inputTokens), outputTokens: num(rec.outputTokens) })
      }
    }
  }
  for (const e of map.values()) e.series.sort((a, b) => a.day.localeCompare(b.day))
  return [...map.values()].sort((a, b) => b.calls - a.calls || a.key.localeCompare(b.key))
}

/**
 * 频次分层。四档（与阈值一一对应）：
 *   high   ≥ highFreqCalls   主力通道
 *   mid    ≥ midFreqCalls    常用备用
 *   low    > 0               偶发
 *   none   = 0               记录在案但零调用
 */
export function classifyFrequency(calls, opts = {}) {
  const high = num(opts.highFreqCalls) || DEFAULT_HIGH_FREQ_CALLS
  const mid = num(opts.midFreqCalls) || DEFAULT_MID_FREQ_CALLS
  if (calls >= high) return 'high'
  if (calls >= mid) return 'mid'
  if (calls > 0) return 'low'
  return 'none'
}

/**
 * 趋势判定：最近 window 天 vs 之前 window 天，比较调用数。
 *   rising   变化率 ≥ +TREND_FLAT_RATIO
 *   falling  变化率 ≤ -TREND_FLAT_RATIO
 *   flat     其余
 *   new      之前窗口为 0、最近窗口 > 0（新启用，上升的特例）
 *   dormant  之前窗口 > 0、最近窗口 = 0（停用，下降的特例）
 * 分母取 max(prev, 1) 避免除零；prev=0 时用 new/dormant 单独表达，不混入比例。
 */
export function classifyTrend(series, lastDay, windowDays = DEFAULT_TREND_WINDOW_DAYS) {
  const cut = addDays(lastDay, -windowDays + 1)
  const prevStart = addDays(lastDay, -2 * windowDays + 1)
  let recent = 0
  let previous = 0
  for (const p of series) {
    if (p.day >= cut) recent += p.calls
    else if (p.day >= prevStart) previous += p.calls
  }
  if (previous === 0 && recent === 0) return { trend: 'flat', recent, previous, ratio: 0 }
  if (previous === 0) return { trend: 'new', recent, previous, ratio: null }
  if (recent === 0) return { trend: 'dormant', recent, previous, ratio: -1 }
  const ratio = (recent - previous) / Math.max(previous, 1)
  const trend = ratio >= TREND_FLAT_RATIO ? 'rising' : ratio <= -TREND_FLAT_RATIO ? 'falling' : 'flat'
  return { trend, recent, previous, ratio: Number(ratio.toFixed(4)) }
}

/**
 * 僵尸识别：**声明存在但近 N 天零调用**。
 *
 * 判据（三档，全部基于「相对 ledger 最后一天」而非墙钟今天——
 * 否则一份陈旧 ledger 会让所有条目集体变僵尸，那是读数假象不是事实）：
 *   zombie         lastDay 距今 > zombieDays            ⇒ 停用
 *   at-risk        lastDay 距今 在 (zombieDays/2, zombieDays] ⇒ 接近停用
 *   active         lastDay 距今 ≤ zombieDays/2          ⇒ 活跃
 *
 * 另有一条独立维度：declaredButNeverUsed —— manifest 声明了 provider，
 * 但 ledger 里该 provider 一次都没出现（"登记了从没用过"）。
 */
export function detectZombies(series, lastDay, zombieDays = DEFAULT_ZOMBIE_DAYS) {
  const out = []
  for (const e of series) {
    const idle = daysBetween(e.lastDay, lastDay)
    const idleDays = idle === null ? null : idle
    let state
    if (e.calls === 0) state = 'never-used'
    else if (idleDays !== null && idleDays > zombieDays) state = 'zombie'
    else if (idleDays !== null && idleDays > zombieDays / 2) state = 'at-risk'
    else state = 'active'
    out.push({ key: e.key, provider: e.provider, model: e.model, lastDay: e.lastDay, idleDays, calls: e.calls, activeDays: e.activeDays, state })
  }
  return out.sort((a, b) => (b.idleDays === null ? -1 : b.idleDays) - (a.idleDays === null ? -1 : a.idleDays))
}

/** 读各子插件 manifest 的 provides 声明面（用于"登记了但从未使用"对照）。 */
export function collectDeclaredPlugins(toolkitRoot) {
  const plugins = []
  for (const dir of listLibDirs(toolkitRoot)) {
    const manifest = readJsonSafe(join(toolkitRoot, 'lib', dir, 'dsh.plugin.json'))
    if (manifest === undefined) {
      plugins.push({ dir, manifestPresent: false, name: null, services: [], commands: [], providers: [] })
      continue
    }
    const provides = manifest.provides && typeof manifest.provides === 'object' ? manifest.provides : {}
    const requirements = manifest.requirements && typeof manifest.requirements === 'object' ? manifest.requirements : {}
    const registers = requirements.registers && typeof requirements.registers === 'object' ? requirements.registers : {}
    const pick = (key) => {
      const a = Array.isArray(provides[key]) ? provides[key].filter((x) => typeof x === 'string') : []
      if (a.length > 0) return a
      return Array.isArray(registers[key]) ? registers[key].filter((x) => typeof x === 'string') : []
    }
    plugins.push({
      dir,
      manifestPresent: true,
      name: typeof manifest.name === 'string' ? manifest.name : null,
      services: pick('services'),
      commands: pick('commands'),
      providers: pick('providers'),
    })
  }
  return plugins
}

/**
 * 组装报告（纯函数：只读入参，不写任何东西）。
 */
export function buildReport(toolkitRoot, opts = {}) {
  const root = String(toolkitRoot || '')
  const zombieDays = num(opts.zombieDays) || DEFAULT_ZOMBIE_DAYS
  const highFreqCalls = num(opts.highFreqCalls) || DEFAULT_HIGH_FREQ_CALLS
  const midFreqCalls = num(opts.midFreqCalls) || DEFAULT_MID_FREQ_CALLS
  const windowDays = num(opts.trendWindowDays) || DEFAULT_TREND_WINDOW_DAYS

  const issues = []
  const addIssue = (code, level, message, target) =>
    issues.push({ code, level, message, target: target === undefined ? null : target })

  const ledger = loadLedger(opts.usageLedgerPath)
  const series = ledger.readable ? buildSeries(ledger) : []
  const lastDay = ledger.dayKeys.length > 0 ? ledger.dayKeys[ledger.dayKeys.length - 1] : null
  const firstDay = ledger.dayKeys.length > 0 ? ledger.dayKeys[0] : null

  const enriched = series.map((e) => {
    const trend = lastDay === null ? { trend: 'unknown', recent: 0, previous: 0, ratio: null } : classifyTrend(e.series, lastDay, windowDays)
    return {
      key: e.key,
      provider: e.provider,
      model: e.model,
      calls: e.calls,
      activeDays: e.activeDays,
      firstDay: e.firstDay,
      lastDay: e.lastDay,
      inputTokens: e.inputTokens,
      outputTokens: e.outputTokens,
      cacheReadTokens: e.cacheReadTokens,
      cacheWriteTokens: e.cacheWriteTokens,
      reasoningTokens: e.reasoningTokens,
      frequency: classifyFrequency(e.calls, { highFreqCalls, midFreqCalls }),
      trend: trend.trend,
      trendRecentCalls: trend.recent,
      trendPreviousCalls: trend.previous,
      trendRatio: trend.ratio,
      series: e.series,
    }
  })

  const zombies = lastDay === null ? [] : detectZombies(series, lastDay, zombieDays)
  const zombieList = zombies.filter((z) => z.state === 'zombie')
  const atRiskList = zombies.filter((z) => z.state === 'at-risk')
  const neverUsedList = zombies.filter((z) => z.state === 'never-used')

  const declaredPlugins = collectDeclaredPlugins(root)
  const ledgerProviders = new Set(series.map((e) => e.provider))
  const declaredButNeverUsed = declaredPlugins
    .filter((p) => p.providers.length > 0)
    .map((p) => ({ dir: p.dir, providers: p.providers.filter((x) => !ledgerProviders.has(x)) }))
    .filter((x) => x.providers.length > 0)

  if (ledger.present === false) {
    addIssue('usage-ledger-absent', 'info', 'usage-ledger.json 不在场：' + String(opts.usageLedgerPath || '(未指定路径)'), opts.usageLedgerPath)
  } else if (ledger.readable === false) {
    addIssue('usage-ledger-unreadable', 'info', 'usage-ledger.json 在场但不可解析或缺少 days 段', opts.usageLedgerPath)
  } else if (lastDay === null) {
    addIssue('usage-ledger-empty', 'info', 'usage-ledger.json 的 days 段为空', opts.usageLedgerPath)
  }
  for (const z of zombieList) {
    addIssue('zombie-provider-model', 'info', '近 ' + zombieDays + ' 天零调用：' + z.key + '（最后活跃 ' + z.lastDay + '）', null)
  }

  const byFrequency = { high: [], mid: [], low: [], none: [] }
  for (const e of enriched) byFrequency[e.frequency].push(e.key)
  const byTrend = { rising: 0, falling: 0, flat: 0, new: 0, dormant: 0, unknown: 0 }
  for (const e of enriched) byTrend[e.trend] = (byTrend[e.trend] || 0) + 1

  return {
    schema: REPORT_SCHEMA,
    plugin: 'governance-usage-track',
    generatedAt: new Date().toISOString(),
    // 批次 5 裁决一：推导出的仓根必须进报告元信息，算错时能一眼看出来。
    toolkitRootResolved: root,
    toolkitRootSource: opts.rootSource === undefined ? 'module-location' : String(opts.rootSource),
    reportRoot: opts.reportRoot === undefined ? resolveReportRoot(root) : String(opts.reportRoot),
    thresholds: { zombieDays, highFreqCalls, midFreqCalls, trendWindowDays: windowDays, trendFlatRatio: TREND_FLAT_RATIO },
    inputs: {
      usageLedgerPath: ledger.path,
      usageLedgerPresent: ledger.present,
      usageLedgerReadable: ledger.readable,
      libDir: join(root, 'lib'),
    },
    summary: {
      ledgerVersion: ledger.version,
      dayCount: ledger.dayKeys.length,
      firstDay,
      lastDay,
      // 观测窗长＝首末日之差+1，避免"29 天数据"与"dayCount"两个口径混淆。
      spanDays: firstDay !== null && lastDay !== null ? (daysBetween(firstDay, lastDay) === null ? null : daysBetween(firstDay, lastDay) + 1) : null,
      providerModelCount: enriched.length,
      providerCount: new Set(enriched.map((e) => e.provider)).size,
      totalCalls: enriched.reduce((n, e) => n + e.calls, 0),
      byFrequency: { high: byFrequency.high.length, mid: byFrequency.mid.length, low: byFrequency.low.length, none: byFrequency.none.length },
      byTrend,
      zombieCount: zombieList.length,
      atRiskCount: atRiskList.length,
      neverUsedCount: neverUsedList.length,
      declaredButNeverUsedPlugins: declaredButNeverUsed.length,
      issues: issues.length,
      issuesByLevel: {
        error: issues.filter((i) => i.level === 'error').length,
        warn: issues.filter((i) => i.level === 'warn').length,
        info: issues.filter((i) => i.level === 'info').length,
      },
    },
    frequencyLayers: byFrequency,
    zombie: { threshold: zombieDays, zombies: zombieList, atRisk: atRiskList, neverUsed: neverUsedList },
    declaredButNeverUsed,
    declaredPlugins,
    entries: enriched,
    issues,
    notes: [
      '本报告只读产出：不修改任何插件、配置或用户文件。',
      '零 ctx.on：本插件不订阅任何事件，只读磁盘文件，连 ctx 服务都不需要。',
      '僵尸判据以 ledger 最后一天为基准，而非墙钟今天——避免陈旧 ledger 造成"集体僵尸"假象。',
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

/**
 * 可选历史快照：写 <reportRoot>/history/<lastDay>.json。
 * 只写自己的子目录；失败静默（历史快照是附加价值，不该影响主报告）。
 */
export function writeHistorySnapshot(report, reportRoot) {
  try {
    const day = report && report.summary && report.summary.lastDay
    if (!day) return { ok: false, error: 'no-lastDay' }
    const dir = join(reportRoot, 'history')
    mkdirSync(dir, { recursive: true })
    const out = join(dir, day + '.json')
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
 * 全程不使用 ctx：不 ctx.on / ctx.slots / ctx.systemPrompt / ctx.skills / ctx.tools。
 * 全程同步——没有浮空 Promise，没有未处理拒绝的可能。
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
      zombieDays: cfg.zombieDays,
      highFreqCalls: cfg.highFreqCalls,
      midFreqCalls: cfg.midFreqCalls,
      trendWindowDays: cfg.trendWindowDays,
    })
    writeReport(report, reportRoot)
    if (cfg.writeHistory !== false) writeHistorySnapshot(report, reportRoot)
  } catch (error) {
    // 静默失败：最坏结果是没有报告文件，绝不让本插件的 bug 冒泡到宿主装载链。
    // 隔离原则不变（绝不冒泡），但失败必须可见，不得伪装成「正常没报告」。
    console.error('[governance-usage-track] 报告生成失败（不影响宿主装载）:', error?.message ?? error);
  }
}

export default { name, inject, apply }
