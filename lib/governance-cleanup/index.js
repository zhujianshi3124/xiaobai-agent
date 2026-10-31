// governance-cleanup —— 安全卸载与残留清理（批次 5B 第三件，补齐 7/7；第 11 个治理插件 governance-output-gate 落地后为 8/8）
//
// 职责：读上游 governance-tiering 的 review 候选，产出**可执行的清理计划**，
// 写成一份结构化报告，落在
// <toolkitRoot>/.toolkit-governance/governance-cleanup/latest.json。
//
// 与上游的分工（本插件存在的理由）：
//   usage-track = 数据面：摊平 ledger、频次分层、僵尸识别。
//   tiering     = 决策面：把上游事实映射成四档建议，review 档＝卸载候选。
//   cleanup     = 执行面：把 review 候选变成**分步骤、可回滚、带残留检查**的清理计划。
//
// **本插件不执行任何清理动作。** 它只产出计划（plan），不删文件、不改配置、不碰 git。
// 真正执行需要人工逐条确认（红线：卸载属 cleanup 批次且必须人工确认）。
//
// 三条硬边界（本插件的全部安全性来自这三条）：
//   ① 只读：不 deleteFile、不 writeFile 到插件目录之外、不 spawn 任何进程。
//   ② 只读 tiering 报告：不重读 ledger，不自己重算分层（口径单一来源）。
//   ③ 上游缺失 ⇒ 报 issue、产空计划、绝不 throw、绝不 fallback。
//
// 形态照 governance-tiering 样板，五条纪律逐条对应实现：
//   ① 默认静默＝不注入、不出声，**不是不运行**：默认挂载、apply() 会执行、会产出报告。
//   ② 不自带面板：不调用 ctx.slots，模块不导出 panels。
//   ③ 不注册 prompt / skill。
//   ④ 可独立卸载：不订阅事件、不建 fiber、不起定时器、不注册 service/command/provider。
//   ⑤ 只依赖 node:fs / node:path / node:url；不 import 任何 lib/ 兄弟插件，也不 import panel/manager。
//
// 为什么 apply() 整段 try/catch 且绝不 throw（裁决 C 的硬要求）：
// 本插件默认启用、随宿主加载运行。若自己有 bug 却把异常抛给装载器，
// 就有可能影响宿主启动。捕获后静默失败，最坏结果是「没有报告文件」。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'governance-cleanup'
/** 空数组＝不依赖任何宿主服务：本插件只读磁盘文件，不需要 ctx。 */
export const inject = []

/** 报告根目录名（与其它治理插件同源）。 */
export const REPORT_DIR_NAME = '.toolkit-governance'
/** 本插件在报告根下的子目录名。 */
export const REPORT_PLUGIN_DIR = 'governance-cleanup'
/** 报告文件 schema 标识。 */
export const REPORT_SCHEMA = 'toolkit-governance/cleanup@1'

/** 上游（决策面）插件在报告根下的子目录名——本插件唯一的数据源。 */
export const UPSTREAM_PLUGIN_DIR = 'governance-tiering'
/** 上游报告文件名。 */
export const UPSTREAM_REPORT_FILE = 'latest.json'
/** 上游 schema 标识。 */
export const UPSTREAM_SCHEMA = 'toolkit-governance/tiering@1'

/**
 * 清理对象的三种类型。**这个分类是本插件存在的核心理由**：
 * 批次 5B 曾把「清理 review 候选」当成删插件目录，但实测 11 个候选全是
 * provider-model 通道（配置在 ~/.dsh 里），不是 lib/ 下的插件目录。
 * 两者清理方式、风险、回滚路径完全不同，必须先分类再谈清理。
 */
export const TARGET_PLUGIN = 'plugin-dir'
export const TARGET_PROVIDER = 'provider-model'
export const TARGET_UNKNOWN = 'unknown'

/**
 * 每类目标的清理步骤模板。**步骤是给人看的，不是给程序执行的。**
 * 每条都写明：动什么、风险、怎么回滚。
 */
export const CLEANUP_STEPS = {
  [TARGET_PLUGIN]: [
    '1. 确认该插件目录 lib/<name>/ 当前未被其它插件静态 import（跑 scripts/pluggable-lint.mjs）',
    '2. 从 cordis.patch.yml 摘除对应 insert 行',
    '3. 从根 package.json 的 dsh.bundle.patch 数组摘除该条',
    '4. 从根 package.json 的 exports 摘除 ./<name> 子路径',
    '5. 从 test/helpers/fixture-toolkit.mjs 的 LIB_DIRS 摘除',
    '6. 同步三处快照守卫 +1（q2 成卡目录数 / parity manifest 计数 / p24 副本插件目录）及其镜像点（p25 / p26）',
    '7. 删除 lib/<name>/ 目录',
    '8. 跑 npm run regression -- --scripts-only，必须 18/18 全绿',
    '回滚：git revert 该提交（上述 8 步必须在同一笔提交内）',
  ],
  [TARGET_PROVIDER]: [
    '1. **本类型不在本仓内**：配置位于 ~/.dsh（用户个人配置，环境红线）',
    '2. 清理前必须取得用户明确批准（纪律 7.3 例外流程）',
    '3. 备份 ~/.dsh 对应文件（带时间戳）',
    '4. 从 cordis.patch.yml 的 llm-pi-ai.config.providers 摘除该 provider 条目',
    '5. 若 dsh-rate-throttle.json 的 declaredLimits 有同名键，一并摘除',
    '6. 不动 .credentials.yaml 里的 API Key（保留，便于将来恢复）',
    '回滚：还原备份文件',
  ],
  [TARGET_UNKNOWN]: [
    '无法判定目标类型 ⇒ **不生成清理步骤**，只登记待人工判定',
  ],
}

/**
 * 模块位置推导仓根：本文件在 lib/governance-cleanup/ 下，上溯两级即仓根。
 * 不 import panel/manager/toolkit-root.mjs（会被 p4 判红）。
 */
export function moduleToolkitRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
}

/** 归一后的本插件报告根。 */
export function resolveReportRoot(toolkitRoot) {
  return join(toolkitRoot, REPORT_DIR_NAME, REPORT_PLUGIN_DIR)
}

/** 上游报告绝对路径。 */
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

function strOrNull(v) {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/**
 * 读上游报告。只做「读不读得到 + 是不是对象」两件事。
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
 * 判定一个 review 候选属于哪类清理目标。
 *
 * **判据（这是本插件的核心逻辑）**：
 *   - 若上游条目带 provider 字段 ⇒ provider-model（配置在 ~/.dsh，属环境红线）
 *   - 若上游条目带 path/libDir 字段且指向 lib/ 下 ⇒ plugin-dir
 *   - 否则 ⇒ unknown（不猜）
 *
 * 实测背景：tiering 的 11 个 review 候选**全部**带 provider 字段
 * （sensenova-gateway | deepseek-v4-pro 之类），无一是 lib/ 下的插件目录。
 * 所以 plugin-dir 分支目前是「为将来准备」，不是当前会用到的路径。
 */
export function classifyTarget(entry) {
  if (!entry || typeof entry !== 'object') {
    return { kind: TARGET_UNKNOWN, evidence: 'entry 非对象' }
  }
  const provider = strOrNull(entry.provider)
  if (provider) {
    return {
      kind: TARGET_PROVIDER,
      evidence: 'entry.provider=' + provider + (strOrNull(entry.model) ? ' | model=' + entry.model : ''),
    }
  }
  const libDir = strOrNull(entry.libDir) || strOrNull(entry.pluginDir)
  if (libDir) {
    return { kind: TARGET_PLUGIN, evidence: 'entry.libDir=' + libDir }
  }
  return { kind: TARGET_UNKNOWN, evidence: '既无 provider 也无 libDir 字段，不猜' }
}

/**
 * 从上游 tiering 报告构造清理计划。纯函数，便于单测。
 *
 * @returns 报告对象（含 schema / plan / issues / notes）
 */
export function buildReport(toolkitRoot, opts = {}) {
  const root = strOrNull(toolkitRoot) || moduleToolkitRoot()
  const reportRoot = opts.reportRoot ? String(opts.reportRoot) : resolveReportRoot(root)
  const upstreamPath = opts.upstreamReportPath || upstreamReportPath(root)
  const upstream = loadUpstreamReport(upstreamPath)

  const issues = []
  const plan = []
  let candidates = []

  if (!upstream.present) {
    issues.push({
      level: 'warn',
      code: 'upstream-missing',
      detail: '上游 tiering 报告不存在：' + upstreamPath + '。清理计划为空，绝不 fallback 自行重算分层。',
    })
  } else if (!upstream.readable) {
    issues.push({
      level: 'warn',
      code: 'upstream-unreadable',
      detail: '上游 tiering 报告存在但不可解析为 JSON 对象：' + upstreamPath,
    })
  } else {
    const upstreamSchema = strOrNull(upstream.data.schema)
    if (upstreamSchema !== UPSTREAM_SCHEMA) {
      issues.push({
        level: 'info',
        code: 'upstream-schema-mismatch',
        detail: '上游 schema=' + String(upstreamSchema) + '，本插件声明读 ' + UPSTREAM_SCHEMA + '（继续按已知字段尽力解析）',
      })
    }
    const tiers = upstream.data.tiers && typeof upstream.data.tiers === 'object' ? upstream.data.tiers : {}
    const review = Array.isArray(tiers.review) ? tiers.review : []
    if (!Array.isArray(tiers.review)) {
      issues.push({
        level: 'info',
        code: 'upstream-no-review-array',
        detail: '上游 tiers.review 不是数组（实际 ' + typeof tiers.review + '），按空候选处理',
      })
    }
    candidates = review
  }

  // 逐候选分类 + 生成计划条目
  const byKind = {}
  for (const entry of candidates) {
    const target = classifyTarget(entry)
    byKind[target.kind] = (byKind[target.kind] || 0) + 1
    const steps = CLEANUP_STEPS[target.kind] || CLEANUP_STEPS[TARGET_UNKNOWN]
    plan.push({
      key: strOrNull(entry && entry.key) || '(no-key)',
      provider: strOrNull(entry && entry.provider),
      model: strOrNull(entry && entry.model),
      calls: typeof (entry && entry.calls) === 'number' ? entry.calls : null,
      lastDay: strOrNull(entry && entry.lastDay),
      idleDays: typeof (entry && entry.idleDays) === 'number' ? entry.idleDays : null,
      targetKind: target.kind,
      targetEvidence: target.evidence,
      requiresUserApproval: target.kind === TARGET_PROVIDER,
      autoExecutable: false,
      steps,
    })
  }

  if (plan.some((p) => p.targetKind === TARGET_PROVIDER)) {
    issues.push({
      level: 'warn',
      code: 'provider-cleanup-needs-approval',
      detail: '清理对象含 provider-model 类型：其配置位于 ~/.dsh（环境红线），必须用户明确批准后才能执行。本插件只出计划。',
    })
  }

  return {
    schema: REPORT_SCHEMA,
    plugin: 'governance-cleanup',
    generatedAt: new Date().toISOString(),
    toolkitRootResolved: root,
    toolkitRootSource: opts.rootSource === undefined ? 'module-location' : String(opts.rootSource),
    reportRoot,
    inputs: {
      upstreamReportPath: upstreamPath,
      upstreamPresent: upstream.present,
      upstreamReadable: upstream.readable,
      upstreamSchema: upstream.readable ? strOrNull(upstream.data.schema) : null,
      upstreamPlugin: UPSTREAM_PLUGIN_DIR,
    },
    summary: {
      candidateCount: candidates.length,
      plannedCount: plan.length,
      byTargetKind: byKind,
      requiresUserApproval: plan.filter((p) => p.requiresUserApproval).length,
      autoExecutable: 0,
      issues: issues.length,
      issuesByLevel: {
        error: issues.filter((i) => i.level === 'error').length,
        warn: issues.filter((i) => i.level === 'warn').length,
        info: issues.filter((i) => i.level === 'info').length,
      },
    },
    plan,
    issues,
    notes: [
      '**本插件不执行任何清理动作**：只产出计划（plan），不删文件、不改配置、不碰 git。',
      '本插件是 governance-tiering 的下游消费者：唯一数据源是 ' + upstreamPath + '（schema ' + UPSTREAM_SCHEMA + '），不重读 ledger。',
      '上游缺失/不可解析时如实报 issue、产空计划，绝不 throw，也绝不 fallback 自行重算分层。',
      '清理对象必须先分类：plugin-dir（仓内，可 git revert）与 provider-model（~/.dsh，环境红线）风险与回滚路径完全不同。',
      'provider-model 类必须用户明确批准后才能执行（纪律 7.3 例外流程）；本插件只登记 requiresUserApproval。',
      'autoExecutable 恒为 false：清理永不由本插件自动执行。',
      '治理报告根约定：<toolkitRoot>/.toolkit-governance/',
    ],
  }
}

/**
 * 落盘一份报告。只写自己的子目录。
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
 * 可选历史快照：写 <reportRoot>/history/<YYYY-MM-DD>.json。
 * 用报告生成日（墙钟）而非上游基准日——本插件的"今天"就是它跑的那天。
 */
export function writeHistorySnapshot(report, reportRoot) {
  try {
    const day = String(report && report.generatedAt || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, error: 'no-day' }
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
 * 插件入口。整段 try/catch，**绝不 throw**。
 * 全程不使用 ctx；全程同步。
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
    console.error('[governance-cleanup] 报告生成失败（不影响宿主装载）:', error?.message ?? error);
  }
}

export default { name, inject, apply }
