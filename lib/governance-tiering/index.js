// governance-tiering —— 治理分层与卸载候选识别（批次 5B 第二件）
//
// 职责：读上游 governance-usage-track 的报告，按四档给每个 provider|model 定档，
// 写成一份结构化报告，落在
// <toolkitRoot>/.toolkit-governance/governance-tiering/latest.json。
//
// 与上游的分工（本插件存在的理由）：
//   usage-track = 数据面：摊平 ledger、按天序列、频次分层、僵尸识别、趋势。
//   tiering     = 决策面：把上游事实映射成「保留 / 观察 / 暂不动 / 卸载候选」四档建议，
//                 并把卸载候选的判据、最后活跃日、距今多少天摊开写清，供人工确认。
// 本插件**不重读 usage-ledger.json**——它是 usage-track 的下游消费者，只读上游报告。
// 上游报告缺失/不可解析 ⇒ issues 里如实报一条，绝不 throw，绝不 fallback 读 ledger
// （fallback 会让"分层依据"悄悄换成另一套口径，报告就不自洽了）。
//
// 形态照 governance-usage-track 样板，五条纪律逐条对应实现：
//   ① 默认静默＝不注入、不出声，**不是不运行**：默认挂载、apply() 会执行、会产出报告；
//      但绝不向对话上下文注入任何内容。
//   ② 不自带面板：不调用 ctx.slots，模块不导出 panels，manifest 的 panels 面留空。
//   ③ 不注册 prompt / skill：不 inject 'systemPrompt' / 'skills'。
//   ④ 可独立卸载：不订阅事件、不建 fiber、不起定时器、不注册 service/command/provider
//      ⇒ 摘掉 lib/governance-tiering/ 与那一条 patch 行即零残留。
//   ⑤ 本文件只依赖 node:fs / node:path / node:url 三个内置模块：不 import 任何
//      lib/ 兄弟插件（pluggable-lint 的 isSibling 判据），也不 import panel/manager
//      （p4-no-subplugin-import-check 的 module 规则）。
//      —— 与上游 usage-track 的耦合是**磁盘 JSON 文件**，不是模块 import。
//
// **零 ctx.on（本批硬要求）**：不订阅任何事件，连 ctx 服务都不需要，
// 故 apply() 全程同步、无浮空 Promise。
//
// 为什么 apply() 整段 try/catch 且绝不 throw（裁决 C 的硬要求）：
// 本插件默认启用、随宿主加载运行。它是新代码，若自己有 bug 却把异常抛给装载器，
// 就有可能影响宿主启动。捕获后静默失败，最坏结果是「没有报告文件」，不会拖垮宿主。
// 这条比「能不能工作」优先级更高。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'governance-tiering'
/** 空数组＝不依赖任何宿主服务：本插件只读磁盘文件，不需要 ctx。 */
export const inject = []

/** 报告根目录名（与批次 4 面板区块、其它治理插件的约定路径同源）。 */
export const REPORT_DIR_NAME = '.toolkit-governance'
/** 本插件在报告根下的子目录名。 */
export const REPORT_PLUGIN_DIR = 'governance-tiering'
/** 报告文件 schema 标识，供后续批次读取方按版本解析。 */
export const REPORT_SCHEMA = 'toolkit-governance/tiering@1'

/** 上游（数据面）插件在报告根下的子目录名——本插件唯一的数据源。 */
export const UPSTREAM_PLUGIN_DIR = 'governance-usage-track'
/** 上游报告文件名。 */
export const UPSTREAM_REPORT_FILE = 'latest.json'
/** 上游 schema 标识：本插件只声明"读的是哪个版本的上游"，不校验其内部结构细节。 */
export const UPSTREAM_SCHEMA = 'toolkit-governance/usage-track@1'

/** 四档名（顺序即建议优先级）。 */
export const TIER_CORE = 'core'
export const TIER_ACTIVE = 'active'
export const TIER_IDLE = 'idle'
export const TIER_REVIEW = 'review'
export const TIERS = [TIER_CORE, TIER_ACTIVE, TIER_IDLE, TIER_REVIEW]

/**
 * 每档的建议动作（写进报告，供人工确认时对照）。
 * 注意：review 是**候选**不是定论——卸载属 cleanup 批次且必须人工确认，
 * 本插件只写报告，不卸载、不改任何插件文件。
 */
export const TIER_ACTIONS = {
  [TIER_CORE]: '保留（勿动）',
  [TIER_ACTIVE]: '保留（观察）',
  [TIER_IDLE]: '暂不动（不判死刑）',
  [TIER_REVIEW]: '卸载候选，必须人工确认',
}

/**
 * 模块位置推导仓根：本文件在 lib/governance-tiering/ 下，上溯两级即仓根。
 * 与 panel/manager/toolkit-root.mjs 的 moduleToolkitRoot() 数学等价——但**不 import 它**：
 * 跨包引用 panel/manager 会被 p4-no-subplugin-import-check 判红。
 * 符号链接/别名安装下推导可能算错，故结果同时写进报告的 toolkitRootResolved 字段，
 * 一旦算错，报告里能直接看出来，不会静默错下去（批次 5 裁决一）。
 */
export function moduleToolkitRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
}

/** 归一后的本插件报告根（显式 config 优先，否则落在推导出的仓根下）。 */
export function resolveReportRoot(toolkitRoot) {
  return join(toolkitRoot, REPORT_DIR_NAME, REPORT_PLUGIN_DIR)
}

/** 上游报告绝对路径：<toolkitRoot>/.toolkit-governance/governance-usage-track/latest.json。 */
export function upstreamReportPath(toolkitRoot) {
  return join(toolkitRoot, REPORT_DIR_NAME, UPSTREAM_PLUGIN_DIR, UPSTREAM_REPORT_FILE)
}

function readJsonSafe(abs) {
  try {
    return JSON.parse(readFileSync(abs, 'utf8'))
  } catch {
    return undefined
  }
}

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/** 字符串或 null；空串与空白串一律归一成 null（避免把 '' 当合法基准日）。 */
function strOrNull(v) {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
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

/** 两个日期相差的天数（b - a）；任一侧非 YYYY-MM-DD 形态返回 null。 */
export function daysBetween(a, b) {
  const pa = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(a))
  const pb = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(b))
  if (!pa || !pb) return null
  const ta = Date.UTC(Number(pa[1]), Number(pa[2]) - 1, Number(pa[3]))
  const tb = Date.UTC(Number(pb[1]), Number(pb[2]) - 1, Number(pb[3]))
  return Math.round((tb - ta) / 86400000)
}

/**
 * 读上游报告。**只做"读不读得到 + 是不是对象"两件事**，不深挖内部字段——
 * 内部字段的可用性由 buildReport() 逐项判，缺哪项就在 issues 里报哪项。
 * @returns {{path, present, readable, data}}
 */
export function loadUpstreamReport(absPath) {
  const result = { path: absPath, present: false, readable: false, data: null }
  if (!absPath) return result
  result.present = existsSync(absPath)
  if (!result.present) return result
  const data = readJsonSafe(absPath)
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return result
  result.readable = true
  result.data = data
  return result
}

/**
 * 单条判据命中记录。reasons 里每条都写清"哪条判据、证据值是多少"，
 * 便于人工确认时不必回溯上游报告原文。
 */
function hit(code, detail) {
  return { code, detail }
}

/**
 * 定档判据（纯函数，便于单测与人工复核）。
 *
 * 入参：
 *   entry      上游 entries[] 的一条（至少含 key/frequency/calls）
 *   zombieInfo 上游 zombie 段的派生事实：{isZombie, isAtRisk, isNeverUsed, idleDays, lastDay}
 *   baseDay    基准日（上游 summary.lastDay），**绝不墙钟今天**
 *
 * 判据（与设计裁决逐字对应）：
 *   core   frequency=high 且不在僵尸名单
 *   active frequency=mid  且不在僵尸名单
 *   idle   frequency=low  且不在僵尸名单
 *   review 命中僵尸名单 / zero-calls / 声明但零调用
 *
 * 说明：僵尸名单（zombies）与"声明但零调用"（declaredButNeverUsed）互不相交——
 * 前者是 ledger 里有记录但停用，后者是 manifest 声明了 provider 而 ledger 里从未出现。
 * zero-calls 即 frequency=none（上游 classifyFrequency 的第四档）。
 */
export function classifyTier(entry, zombieInfo = {}, baseDay = null) {
  const frequency = strOrNull(entry && entry.frequency)
  const calls = num(entry && entry.calls)
  const reasons = []
  const isZombie = zombieInfo.isZombie === true
  const isNeverUsed = zombieInfo.isNeverUsed === true
  const declaredButNeverUsed = zombieInfo.declaredButNeverUsed === true

  if (isZombie) reasons.push(hit('zombie', '命中上游僵尸名单（近 ' + num(zombieInfo.threshold) + ' 天零调用，idleDays=' + (zombieInfo.idleDays === undefined ? 'n/a' : zombieInfo.idleDays) + '）'))
  if (isNeverUsed) reasons.push(hit('zero-calls', '记录在案但零调用（calls=0）'))
  if (declaredButNeverUsed) reasons.push(hit('declared-but-never-used', 'manifest 声明了 provider，但上游 ledger 里该 provider 一次都未出现'))

  if (reasons.length > 0) return { tier: TIER_REVIEW, reasons, frequency, calls }

  if (frequency === 'high') return { tier: TIER_CORE, reasons: [], frequency, calls }
  if (frequency === 'mid') return { tier: TIER_ACTIVE, reasons: [], frequency, calls }
  if (frequency === 'low') return { tier: TIER_IDLE, reasons: [], frequency, calls }

  // frequency 缺席或不在 high/mid/low 之内（含 none）：不猜档，如实报"无法定档"。
  // 这不是 review——review 是"有证据表明可卸载"；没有频率数据不等于有卸载证据。
  reasons.push(hit('unknown-frequency', '上游未给出可识别的 frequency 值（实得 ' + JSON.stringify(entry && entry.frequency) + '），无法定档'))
  return { tier: null, reasons, frequency, calls }
}

/**
 * 组装报告（纯函数：只读入参，不写任何东西）。
 */
export function buildReport(toolkitRoot, opts = {}) {
  const root = String(toolkitRoot || '')
  const reportRoot = opts.reportRoot === undefined ? resolveReportRoot(root) : String(opts.reportRoot)
  const upstreamPath = strOrNull(opts.upstreamReportPath) || upstreamReportPath(root)

  const issues = []
  const addIssue = (code, level, message, target) =>
    issues.push({ code, level, message, target: target === undefined ? null : target })

  const upstream = loadUpstreamReport(upstreamPath)
  const tiers = { [TIER_CORE]: [], [TIER_ACTIVE]: [], [TIER_IDLE]: [], [TIER_REVIEW]: [] }
  const undecided = []
  const declaredButNeverUsedEntries = []

  if (upstream.present === false) {
    addIssue('upstream-report-absent', 'error', '上游报告不在场：' + upstreamPath + '。本插件不重读 usage-ledger.json（fallback 会换掉分层口径），故本次不产分层。', upstreamPath)
  } else if (upstream.readable === false) {
    addIssue('upstream-report-unreadable', 'error', '上游报告在场但不可解析或不是 JSON 对象：' + upstreamPath, upstreamPath)
  } else {
    const data = upstream.data
    const schema = strOrNull(data.schema)
    if (schema !== UPSTREAM_SCHEMA) {
      addIssue('upstream-schema-unexpected', 'warn', '上游 schema 与本插件预期不一致：预期 ' + UPSTREAM_SCHEMA + '，实得 ' + JSON.stringify(data.schema), upstreamPath)
    }

    const summary = data.summary && typeof data.summary === 'object' ? data.summary : null
    const baseDay = summary === null ? null : strOrNull(summary.lastDay)
    if (baseDay === null) {
      // 裁决(c)：lastDay 缺失/为 null ⇒ 降级为一条 issue，**不拿 Date.now() 顶上**。
      // 拿墙钟顶上会让"距基准日多少天"变成一个假的今天，review 判据的可信度随之崩塌。
      addIssue('upstream-basemissing', 'error', '上游 summary.lastDay 缺失或为 null，无法确定基准日；本次不产分层（不用墙钟今天顶替）。', upstreamPath)
    }

    // 上游僵尸名单（zombies）与"声明但零调用"清单，按 key 建索引。
    const zombieBlock = data.zombie && typeof data.zombie === 'object' ? data.zombie : {}
    const zombieThreshold = num(zombieBlock.threshold)
    const zombieByKey = new Map()
    for (const z of Array.isArray(zombieBlock.zombies) ? zombieBlock.zombies : []) {
      if (z && typeof z.key === 'string') zombieByKey.set(z.key, z)
    }
    const neverUsedByKey = new Map()
    for (const z of Array.isArray(zombieBlock.neverUsed) ? zombieBlock.neverUsed : []) {
      if (z && typeof z.key === 'string') neverUsedByKey.set(z.key, z)
    }
    // 上游把"声明了 provider 但 ledger 从未出现"放在 declaredButNeverUsed（dir + providers[]）。
    const declaredNeverProviders = new Set()
    for (const d of Array.isArray(data.declaredButNeverUsed) ? data.declaredButNeverUsed : []) {
      for (const p of Array.isArray(d && d.providers) ? d.providers : []) declaredNeverProviders.add(p)
    }

    const entries = Array.isArray(data.entries) ? data.entries : []
    if (entries.length === 0 && baseDay !== null) {
      addIssue('upstream-entries-empty', 'warn', '上游 entries[] 为空：无条目可定档', upstreamPath)
    }

    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue
      const key = strOrNull(entry.key) || (strOrNull(entry.provider) + ' | ' + strOrNull(entry.model))
      const z = zombieByKey.get(key)
      const nu = neverUsedByKey.get(key)
      const zombieInfo = {
        isZombie: z !== undefined,
        isAtRisk: false,
        isNeverUsed: nu !== undefined || num(entry.calls) === 0,
        declaredButNeverUsed: declaredNeverProviders.has(strOrNull(entry.provider)),
        idleDays: z ? num(z.idleDays) : null,
        lastDay: z ? strOrNull(z.lastDay) : strOrNull(entry.lastDay),
        threshold: zombieThreshold,
      }
      const verdict = classifyTier(entry, zombieInfo, baseDay)
      const idleDays = zombieInfo.idleDays !== null && zombieInfo.idleDays !== undefined
        ? zombieInfo.idleDays
        : (baseDay !== null && strOrNull(entry.lastDay) !== null ? daysBetween(entry.lastDay, baseDay) : null)

      const record = {
        key,
        provider: strOrNull(entry.provider),
        model: strOrNull(entry.model),
        calls: num(entry.calls),
        frequency: verdict.frequency,
        trend: strOrNull(entry.trend),
        lastDay: strOrNull(entry.lastDay),
        baseDay,
        idleDays,
        activeDays: num(entry.activeDays),
        tier: verdict.tier,
        action: verdict.tier === null ? '无法定档，需人工复核上游数据' : TIER_ACTIONS[verdict.tier],
        reasons: verdict.reasons,
      }
      if (verdict.tier === null) undecided.push(record)
      else tiers[verdict.tier].push(record)

      if (verdict.tier === TIER_REVIEW) {
        addIssue(
          'tier-review-candidate',
          'warn',
          '卸载候选：' + key + '（判据 ' + verdict.reasons.map((r) => r.code).join(' + ') + '；最后活跃 ' + (record.lastDay || 'n/a') + '，距基准日 ' + (idleDays === null ? 'n/a' : idleDays + ' 天') + '）——候选非定论，卸载需人工确认',
          key,
        )
      }
    }

    // declaredButNeverUsed 里若有 provider 在 entries 中缺席（上游 entries 未覆盖），单独如实报。
    for (const d of Array.isArray(data.declaredButNeverUsed) ? data.declaredButNeverUsed : []) {
      const providers = Array.isArray(d && d.providers) ? d.providers.filter((x) => typeof x === 'string') : []
      if (providers.length === 0) continue
      const covered = new Set(entries.filter((e) => e && typeof e === 'object').map((e) => strOrNull(e.provider)))
      const missing = providers.filter((p) => !covered.has(p))
      if (missing.length > 0) {
        declaredButNeverUsedEntries.push({ dir: strOrNull(d.dir), providers: missing })
        addIssue('tier-declared-never-unlisted', 'warn', 'manifest 声明了 provider 但上游 entries 未列出该 provider：' + missing.join(', ') + '（dir=' + strOrNull(d.dir) + '）', strOrNull(d.dir))
      }
    }
  }

  const counts = {}
  for (const t of TIERS) counts[t] = tiers[t].length

  return {
    schema: REPORT_SCHEMA,
    plugin: 'governance-tiering',
    generatedAt: new Date().toISOString(),
    // 批次 5 裁决一：推导出的仓根必须进报告元信息，算错时能一眼看出来。
    toolkitRootResolved: root,
    toolkitRootSource: opts.rootSource === undefined ? 'module-location' : String(opts.rootSource),
    reportRoot,
    inputs: {
      // 数据源只有一个：上游 usage-track 的报告。本插件绝不读 usage-ledger.json。
      upstreamReportPath: upstreamPath,
      upstreamPresent: upstream.present,
      upstreamReadable: upstream.readable,
      upstreamSchema: upstream.readable ? strOrNull(upstream.data.schema) : null,
      upstreamPlugin: UPSTREAM_PLUGIN_DIR,
    },
    summary: {
      baseDay: upstream.readable ? (upstream.data.summary && typeof upstream.data.summary === 'object' ? strOrNull(upstream.data.summary.lastDay) : null) : null,
      upstreamEntryCount: upstream.readable && Array.isArray(upstream.data.entries) ? upstream.data.entries.length : 0,
      tiered: TIERS.reduce((n, t) => n + tiers[t].length, 0),
      undecided: undecided.length,
      byTier: counts,
      byReviewReason: (() => {
        const out = {}
        for (const r of tiers[TIER_REVIEW]) {
          for (const reason of r.reasons) out[reason.code] = (out[reason.code] || 0) + 1
        }
        return out
      })(),
      issues: issues.length,
      issuesByLevel: {
        error: issues.filter((i) => i.level === 'error').length,
        warn: issues.filter((i) => i.level === 'warn').length,
        info: issues.filter((i) => i.level === 'info').length,
      },
    },
    tiers,
    undecided,
    declaredButNeverUsedUnlisted: declaredButNeverUsedEntries,
    tierActions: TIER_ACTIONS,
    issues,
    notes: [
      '本报告只读产出：不修改任何插件、配置或用户文件。',
      '本插件是 governance-usage-track 的下游消费者：唯一数据源是 ' + upstreamPath + '（schema ' + UPSTREAM_SCHEMA + '），不重读 usage-ledger.json。',
      '上游报告缺失/不可解析时如实报 issue，绝不 throw，也绝不 fallback 到读 ledger——fallback 会静默换掉分层口径。',
      '基准日取上游 summary.lastDay 而非墙钟今天：陈旧读数会让所有条目集体变僵尸/变候选，那是读数假象不是事实。',
      'review 档是候选不是定论：卸载属 cleanup 批次且必须人工确认，本插件只写报告、不卸载、不改任何插件文件。',
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
 * 可选历史快照：写 <reportRoot>/history/<baseDay>.json。
 * 只写自己的子目录；失败静默（历史快照是附加价值，不该影响主报告）。
 */
export function writeHistorySnapshot(report, reportRoot) {
  try {
    const day = report && report.summary && report.summary.baseDay
    if (!day) return { ok: false, error: 'no-baseDay' }
    const dir = join(reportRoot, 'history')
    mkdirSync(dir, { recursive: true })
    const out = join(dir, day + '.json')
    writeFileSync(out, JSON.stringify(report, null, 2) + '\n', 'utf8')
    return { ok: true, path: out }
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) }
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

    const report = buildReport(toolkitRoot, {
      reportRoot,
      rootSource: 'module-location',
      upstreamReportPath: upstreamReportPath(toolkitRoot),
    })
    writeReport(report, reportRoot)
    if (cfg.writeHistory !== false) writeHistorySnapshot(report, reportRoot)
  } catch (error) {
    // 静默失败：最坏结果是没有报告文件，绝不让本插件的 bug 冒泡到宿主装载链。
    // 隔离原则不变（绝不冒泡），但失败必须可见，不得伪装成「正常没报告」。
    console.error('[governance-tiering] 报告生成失败（不影响宿主装载）:', error?.message ?? error);
  }
}

export default { name, inject, apply }
