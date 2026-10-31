// governance-router —— 规则路由 + 机械守卫（批次 5C）
//
// 职责：**只做一件事**——用户没点名、但意图明确命中某条规则时，主动注入该技能**正文**。
// 报告落在 <toolkitRoot>/.toolkit-governance/governance-router/latest.json。
//
// ── 为什么是规则路由，不是打分路由（裁决 23，用户 2026-10-21 采纳）─────────────
//   ① 本机技能目录 15 个里 14 个属两个高度同质家族（7 个 planning 变体 + 7 个 office），
//      打分路由在「总会有最高分」时必然把相近变体选歪；
//   ② 每注入一条技能正文约 1000~1600 token，与项目定位「面向免费 API 优化」直接冲突；
//   ③ 硬约束 24 要求「用户无感知」，打分路由靠阈值调参实现静默，阈值错配会变成
//      「用户没要求却被塞技能」的可见行为；规则路由未命中天然静默；
//   ④ 规则表的过期可被机械检出（接进回归链），阈值配错不能。
//
// ── 与宿主的分工（不许重复造，重复即浪费）──────────────────────────────────
//   @deepseek-ai/dsh-tool-skill 已在 agent/pre-step 里做了三件事：
//     1. 注册 skill 工具（模型主动加载正文）
//     2. 注入**目录消息**（每条 skill 的 name + description，截断 500 字符），用 digest 判重
//     3. 用户点名 /name 时注入该技能正文
//   ⇒ 本插件**绝不注入目录**（宿主已在做），**只注入正文**，且**自己判重**。
//
// ── pre-step 契约（asar 内 dsh-agent-loop 实测，非文档推测）───────────────────
//   waterfall("agent/pre-step", { messages, turn, step, signal, agent }, defaultDecision)
//   agent 由 dsh-agent 的 agentEvents 融合注入（lib/index.js:242-246 fused(payload)）；
//   turn/step 来自 ReactLoopAgent.preStep 的 ...position（dsh-agent-loop lib/index.js:909-912）。
//   两个宿主订阅者都是「先 await next() 再改 decision」，且把新消息**追加到末尾**：
//     tool-skill lib/index.js:926-929 / 960-963 均为 [...decision.messages, ...]
//   ⇒ 本插件同形：await next() → 追加末尾。实测链序（探针 FINAL=["u1","B","C","A"]）证明
//     后执行者追加在最后，与宿主的正文注入同位，互不覆盖。
//
// ── inject 为空数组（裁决 2026-10-21，协调侧裁决 1 = B 案）──────────────────
//   为什么不用 inject: ['skills']：那样当 skills 服务缺席时 **本插件静默不加载**——
//   不产报告、不报 issue，就是「看起来有保护，其实根本没跑」。本项目整会话在打这个结构
//   （坑 1 npm test 不读 bundle 通道、坑 12 npm test 不调 regression-all、坑 15 在场前提不符）。
//   inject: [] ⇒ 永远加载、永远产报告；skills 缺席时如实写 skills-unavailable issue，**看得见**。
//   实测（cordis 4.0.2）：inject 门控只拦**直接属性访问**，不拦 ctx.get()，也不拦 ctx.on()：
//     ctx.skills            → THROW: cannot get property "skills" without inject（lib/index.js:675）
//     ctx.get('skills')     → OK（拿到服务对象，可调 snapshot/get）
//     ctx.on('agent/pre-step', ...) → OK，订阅真的被 waterfall 调到
//   ⇒ 全程走 ctx.get() 软探测，与 governance-overlap-detect:99-107 同款。
//
// ── 五条纪律逐条对应 ──────────────────────────────────────────────────────
//   ① 默认静默＝不注入、不出声，**不是不运行**：默认 rules: [] ⇒ 永不注入，但照常产报告；
//      配置了规则且命中才注入，未命中零 token（这是规则路由的核心优势）。
//   ② 不自带面板：不调用 ctx.slots，模块不导出 panels，manifest 的 panels 面留空。
//   ③ 不注册 prompt / skill、不写 AGENTS.md、不写 skill 目录：只读 ctx.skills，只 ctx.on。
//   ④ 可独立卸载：摘掉 lib/governance-router/ 与那一条 patch 行即零残留
//      （ctx.on 由 cordis fiber 托管，随插件卸载自动解绑）。
//   ⑤ 本文件只依赖 node: 内置模块：不 import 任何 lib/ 兄弟插件（pluggable-lint 的 isSibling
//      判据），也不 import panel/manager（p4-no-subplugin-import-check 的 module 规则）。
//      **连宿主包也不 import**（不 import @deepseek-ai/dsh-llm 的 createUserMessage、
//      不 import @deepseek-ai/dsh-skill 的 renderSkillContent）：那会让本插件在宿主包
//      版本漂移或缺席时**整块加载失败**，与「可独立卸载、无残留、无报错」直接冲突。
//      消息对象与 <skill_content> 帧在本文件内自建，形状与宿主逐字对齐（见 renderSkillContent）。
//
// 为什么 apply() 整段 try/catch 且绝不 throw（裁决 C 的硬要求）：
// 本插件默认启用、随宿主加载运行。它是新代码，若自己有 bug 却把异常抛给装载器，
// 就有可能影响宿主启动。捕获后静默失败，最坏结果是「没有报告文件」，不会拖垮宿主。
// 这条比「能不能工作」优先级更高。pre-step 监听体内同样全程 try/catch：任何异常都放行。

import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'governance-router'
/** 空数组＝不依赖任何宿主服务：ctx.skills / ctx.workingDirectory 走 ctx.get 软探测，缺席即降级。 */
export const inject = []

/** 报告根目录名（与批次 4 面板区块、其它治理插件的约定路径同源）。 */
export const REPORT_DIR_NAME = '.toolkit-governance'
/** 本插件在报告根下的子目录名。 */
export const REPORT_PLUGIN_DIR = 'governance-router'
/** 报告文件 schema 标识，供后续批次读取方按版本解析。 */
export const REPORT_SCHEMA = 'toolkit-governance/router@1'
/** 报告文件名。 */
export const REPORT_FILE = 'latest.json'

/** 注入消息的 source.kind（判重与自识别都靠它；绝不与宿主的 'user'/'skill-catalog' 撞名）。 */
export const INJECTION_SOURCE_KIND = 'router-rule'
/** 注入消息的 source.form（与 tool-skill 的 form: 'instructions' 同形）。 */
export const INJECTION_FORM = 'instructions'

/** 三类 issue 的 code（施工单 2.2 逐条实现，不许合并）。 */
export const ISSUE_RULE_TARGET_MISSING = 'rule-target-missing'
export const ISSUE_SKILL_UNROUTED = 'skill-unrouted'
export const ISSUE_SKILLS_UNAVAILABLE = 'skills-unavailable'
/** 配置了尚未实现的 dedupeScope ⇒ info 级如实报（不静默接受一个不生效的配置）。 */
export const ISSUE_DEDUPE_SCOPE_UNSUPPORTED = 'dedupe-scope-unsupported'

/** 单回合最多注入条数的缺省值。 */
export const DEFAULT_MAX_INJECT_PER_TURN = 1
/** 去重作用域的缺省值（当前只实现 session；其它值一律回落 session，不静默换语义）。 */
export const DEFAULT_DEDUPE_SCOPE = 'session'

/**
 * 模块位置推导仓根：本文件在 lib/governance-router/ 下，上溯两级即仓根。
 * 与 panel/manager/toolkit-root.mjs 的 moduleToolkitRoot() 数学等价——但**不 import 它**：
 * 跨包引用 panel/manager 会被 p4-no-subplugin-import-check 判红。
 */
export function moduleToolkitRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
}

/** 归一后的报告根（显式 config 优先，否则落在推导出的仓根下）。 */
export function resolveReportRoot(toolkitRoot) {
  return join(toolkitRoot, REPORT_DIR_NAME, REPORT_PLUGIN_DIR)
}

function asArray(v) {
  return Array.isArray(v) ? v : []
}

function strOr(v, fallback) {
  return typeof v === 'string' ? v : fallback
}

// ── 规则归一与编译 ────────────────────────────────────────────────────────

/**
 * 把一条 pattern 编译成大小写不敏感的 RegExp。
 *
 * 「正则/关键词」两种写法都要能写（施工单 1.2）：字符串本身就是正则源，普通关键词
 * （"规划"、"excel"）在正则下等价于子串匹配，故一套规则覆盖两种用法。
 * 唯一例外：**正则源非法时不得 throw**，回落为转义字面量（并把此事记进报告 notes），
 * 因为「规则表写错」不该让整个插件在 pre-step 里炸掉。
 *
 * @param {string} pattern - 规则里的模式串
 * @returns {{re: RegExp|null, fallback: boolean}}
 */
export function compilePattern(pattern) {
  if (typeof pattern !== 'string' || pattern === '') return { re: null, fallback: false }
  try {
    return { re: new RegExp(pattern, 'i'), fallback: false }
  } catch {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    try {
      return { re: new RegExp(escaped, 'i'), fallback: true }
    } catch {
      return { re: null, fallback: false }
    }
  }
}

/**
 * 归一规则表：丢弃结构非法的条目并记录原因，编译 pattern。
 * **不 throw**——规则表是配置，配置写错是常态，不该让宿主挂掉。
 *
 * @param {unknown} rules - config.rules 原值
 * @returns {{rules: Array, dropped: Array}}
 */
export function normalizeRules(rules) {
  const out = []
  const dropped = []
  asArray(rules).forEach((raw, index) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      dropped.push({ index, reason: 'rule-not-object' })
      return
    }
    const skill = typeof raw.skill === 'string' ? raw.skill.trim() : ''
    if (skill === '') {
      dropped.push({ index, reason: 'rule-skill-missing' })
      return
    }
    const patterns = asArray(raw.patterns).filter((p) => typeof p === 'string' && p !== '')
    if (patterns.length === 0) {
      dropped.push({ index, reason: 'rule-patterns-empty', skill })
      return
    }
    const compiled = []
    let fellBack = false
    for (const p of patterns) {
      const { re, fallback } = compilePattern(p)
      if (re === null) continue
      if (fallback) fellBack = true
      compiled.push({ source: p, re })
    }
    if (compiled.length === 0) {
      dropped.push({ index, reason: 'rule-patterns-uncompilable', skill })
      return
    }
    const priority = typeof raw.priority === 'number' && Number.isFinite(raw.priority) ? raw.priority : 100
    out.push({ index, skill, patterns: compiled, priority, patternFallback: fellBack })
  })
  // 按 priority 升序；同 priority 保持声明顺序（稳定排序，先声明先用）。
  out.sort((a, b) => (a.priority - b.priority) || (a.index - b.index))
  return { rules: out, dropped }
}

/**
 * 逐条匹配规则表：按 priority 升序、先命中先用。
 *
 * @param {string} text - 最后一条 user 消息的文本
 * @param {Array} rules - normalizeRules() 的 rules 输出
 * @returns {{matched: object|null, reason: string}}
 */
export function matchRules(text, rules) {
  const list = asArray(rules)
  if (list.length === 0) return { matched: null, reason: 'no-rules' }
  if (typeof text !== 'string' || text === '') return { matched: null, reason: 'no-user-text' }
  for (const rule of list) {
    for (const p of asArray(rule.patterns)) {
      if (p && p.re && p.re.test(text)) {
        return { matched: rule, reason: 'matched:' + p.source }
      }
    }
  }
  return { matched: null, reason: 'no-match' }
}

// ── 机械守卫：规则表 vs 真实技能目录 ──────────────────────────────────────

/** 从 summary 数组或名字数组里取名字集（两种输入都接受，调用方不必先归一）。 */
function skillNamesOf(availableSkills) {
  const names = new Set()
  for (const item of asArray(availableSkills)) {
    if (typeof item === 'string') { if (item !== '') names.add(item); continue }
    if (item && typeof item === 'object' && typeof item.name === 'string' && item.name !== '') names.add(item.name)
  }
  return names
}

/**
 * 校验规则表与真实技能目录是否对得上。
 *
 * 三类 issue（施工单 2.2）：
 *   rule-target-missing  规则引用的 skill 不在目录里          **error**  规则表过期，必须修
 *   skill-unrouted       目录里有 skill 但无任何规则覆盖       info       不是错，只是提示
 *   skills-unavailable   ctx.skills 读不到                    info       与其余治理插件同口径如实报
 *
 * rule-target-missing 用 error 级是关键设计：它让「规则表过期」变成回归链上的红，
 * 而不是靠人记得去看报告。
 *
 * @param {unknown} rules - 归一后的规则表
 * @param {unknown} availableSkills - summary 数组 / 名字数组；null 或 undefined 表示读不到
 * @returns {{ok: boolean, issues: Array}}
 */
export function validateRules(rules, availableSkills) {
  const issues = []
  const list = asArray(rules)

  if (availableSkills === null || availableSkills === undefined) {
    issues.push({
      code: ISSUE_SKILLS_UNAVAILABLE,
      level: 'info',
      message: 'ctx.skills 读数不可用（服务缺席或未提供 snapshot/get）⇒ 无法校验规则表是否过期。',
      skill: null,
    })
    return { ok: true, issues }
  }

  const names = skillNamesOf(availableSkills)
  const routed = new Set()
  for (const rule of list) {
    if (typeof rule.skill === 'string' && rule.skill !== '') routed.add(rule.skill)
  }

  for (const rule of list) {
    if (!names.has(rule.skill)) {
      issues.push({
        code: ISSUE_RULE_TARGET_MISSING,
        level: 'error',
        message: '规则引用的技能 "' + String(rule.skill) + '" 不在当前技能目录里 ⇒ 规则表过期，必须修。',
        skill: String(rule.skill),
      })
    }
  }
  for (const n of [...names].sort()) {
    if (!routed.has(n)) {
      issues.push({
        code: ISSUE_SKILL_UNROUTED,
        level: 'info',
        message: '技能 "' + n + '" 无任何规则覆盖 ⇒ 本插件不会主动注入它的正文（不是错，只是提示）。',
        skill: n,
      })
    }
  }
  return { ok: !issues.some((i) => i.level === 'error'), issues }
}

// ── 文本抽取与消息构造 ────────────────────────────────────────────────────

/**
 * 取本步最后一条**用户直接输入**的文本。
 * 只看 source.kind === 'user'：宿主注入的目录消息（skill-catalog）、技能正文
 * （skill-invocation）、本插件自己的注入（router-rule）都不算用户输入。
 *
 * @param {unknown} messages - payload.messages
 * @returns {string|null}
 */
export function extractLastUserText(messages) {
  const list = asArray(messages)
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const m = list[i]
    if (!m || typeof m !== 'object') continue
    if (!m.source || m.source.kind !== 'user') continue
    const parts = []
    for (const block of asArray(m.content)) {
      if (block && block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
    }
    if (parts.length > 0) return parts.join('\n')
  }
  return null
}

function escapeAttr(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
}

function escapeText(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function renderResourceHint(resourceBase) {
  if (!resourceBase || typeof resourceBase !== 'object') return null
  if (resourceBase.kind === 'directory' && typeof resourceBase.path === 'string') {
    return ['Base directory for this skill: ' + escapeText(resourceBase.path), 'Resolve relative paths mentioned by this skill against the base directory before using them. Load referenced resources only as needed.']
  }
  if (resourceBase.kind === 'url' && typeof resourceBase.url === 'string') {
    return ['Base URL for this skill: ' + escapeText(resourceBase.url), 'Resolve relative URLs mentioned by this skill against the base URL before using them. Load referenced resources only as needed.']
  }
  if (resourceBase.kind === 'opaque' && typeof resourceBase.description === 'string') {
    return ['Resources for this skill: ' + escapeText(resourceBase.description), 'Load referenced resources only as needed.']
  }
  return null
}

/**
 * 渲染一条已加载技能，形状与宿主 @deepseek-ai/dsh-skill 的 renderSkillContent 逐字对齐：
 * 模型在「用户点名」与「规则命中」两条路径上看到同一个 <skill_content> 帧。
 *
 * @param {object} skill - ctx.skills.get() 的返回值
 * @returns {string}
 */
export function renderSkillContent(skill) {
  const hint = renderResourceHint(skill && skill.resourceBase)
  const resources = hint || ['Resources for this skill are managed by provider "' + escapeText(skill && skill.provider) + '".', 'Load referenced resources only as needed.']
  return [
    '<skill_content name="' + escapeAttr(skill && skill.name) + '">',
    '<skill_resources>',
    ...resources,
    '</skill_resources>',
    '',
    '<skill_instructions>',
    String((skill && skill.content) || ''),
    '</skill_instructions>',
    '</skill_content>',
  ].join('\n')
}

/**
 * 构造一条注入用的 user 消息。
 * 形状按宿主 session 的 assertMessageEventShape 要求（id 非空串 / role=user /
 * source.kind 非空串 / content 为数组），见 dsh-session lib/index.js:1194-1219。
 *
 * @param {string} text - 消息正文
 * @param {{name: string, reason?: string}} meta - 注入来源
 * @returns {object}
 */
export function buildInjectionMessage(text, meta) {
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: {
      kind: INJECTION_SOURCE_KIND,
      name: meta && meta.name ? meta.name : '',
      form: INJECTION_FORM,
      ...(meta && meta.reason ? { reason: meta.reason } : {}),
    },
  }
}

// ── 报告 ──────────────────────────────────────────────────────────────────

/**
 * 构造报告对象。**不含易变字段参与 digest**（turn/step/时刻），否则每回合都要重写盘。
 *
 * @param {object} opts
 * @returns {object}
 */
export function buildReport(opts = {}) {
  const o = opts && typeof opts === 'object' ? opts : {}
  const validation = o.validation || { ok: true, issues: [] }
  const skills = o.skills || { probed: false }
  return {
    schema: REPORT_SCHEMA,
    plugin: name,
    phase: strOr(o.phase, 'init'),
    generatedAt: new Date().toISOString(),
    toolkitRootResolved: strOr(o.toolkitRoot, ''),
    reportRoot: strOr(o.reportRoot, ''),
    config: {
      enabled: o.enabled !== false,
      maxInjectPerTurn: typeof o.maxInjectPerTurn === 'number' ? o.maxInjectPerTurn : DEFAULT_MAX_INJECT_PER_TURN,
      dedupeScope: strOr(o.dedupeScope, DEFAULT_DEDUPE_SCOPE),
      ruleCount: asArray(o.rules).length,
    },
    rules: asArray(o.rules).map((r) => ({
      skill: r.skill,
      priority: r.priority,
      patterns: asArray(r.patterns).map((p) => p.source),
      patternFallback: r.patternFallback === true,
    })),
    droppedRules: asArray(o.dropped),
    skills,
    validation: { ok: validation.ok !== false, issues: asArray(validation.issues) },
    issues: asArray(validation.issues),
    stats: o.stats && typeof o.stats === 'object' ? o.stats : { steps: 0, injected: [], skipped: [] },
    notes: [
      '本报告只读产出：不修改任何插件、配置或用户文件。',
      '本插件只注入技能**正文**，绝不注入技能目录（宿主 @deepseek-ai/dsh-tool-skill 已在做目录注入）。',
      '默认 rules: [] ⇒ 永不注入（默认静默＝不注入不出声，不是不运行；报告照常产出）。',
      'inject 为空数组 ⇒ skills 服务缺席时本插件照常加载，并如实记 skills-unavailable。',
      '治理报告根约定：<toolkitRoot>/.toolkit-governance/',
    ],
  }
}

/**
 * 报告内容摘要，用于「内容没变就不重写盘」的判重。
 * 排除 generatedAt（时刻必然变，含进去等于每回合都写）。
 */
export function reportDigest(report) {
  const { generatedAt, ...stable } = report || {}
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex')
}

/**
 * 落盘一份报告。只写自己的子目录，不碰父级之外的任何路径。
 * @returns {{ok: boolean, path?: string, error?: string}}
 */
export function writeReport(report, reportRoot) {
  try {
    if (typeof reportRoot !== 'string' || reportRoot === '') return { ok: false, error: 'reportRoot 为空' }
    mkdirSync(reportRoot, { recursive: true })
    const out = join(reportRoot, REPORT_FILE)
    writeFileSync(out, JSON.stringify(report, null, 2) + '\n', 'utf8')
    return { ok: true, path: out }
  } catch (error) {
    return { ok: false, error: String((error && error.message) || error) }
  }
}

// ── 宿主服务软探测 ────────────────────────────────────────────────────────

/**
 * 软取宿主服务：inject 为空数组时直接属性访问会被 cordis 的 Proxy 拒绝并抛错，
 * 故一律走 ctx.get()。任何异常都归为「不可用」。
 */
export function softService(ctx, serviceName) {
  try {
    if (!ctx || typeof ctx.get !== 'function') return undefined
    const service = ctx.get(serviceName)
    return service === null ? undefined : service
  } catch {
    return undefined
  }
}

/** 一次技能目录读数：{ available, skills, complete, unavailableReason }。 */
export async function readSkillCatalog(ctx, agent, signal) {
  const skills = softService(ctx, 'skills')
  if (!skills || typeof skills.snapshot !== 'function') {
    return { available: false, skills: null, complete: false, unavailableReason: 'ctx.skills 不可用（服务缺席或未提供 snapshot()）' }
  }
  let cwd
  try {
    const wd = softService(ctx, 'workingDirectory')
    cwd = wd && typeof wd.ensure === 'function' ? await wd.ensure(agent, signal) : undefined
  } catch {
    cwd = undefined
  }
  try {
    const snap = await skills.snapshot({ cwd, scope: agent, signal })
    if (!snap || !Array.isArray(snap.skills)) {
      return { available: false, skills: null, complete: false, unavailableReason: 'ctx.skills.snapshot() 返回形状非法' }
    }
    return { available: true, skills: snap.skills, complete: snap.complete === true, unavailableReason: null }
  } catch (error) {
    return { available: false, skills: null, complete: false, unavailableReason: 'ctx.skills.snapshot() 抛错：' + String((error && error.message) || error) }
  }
}

/** 技能是否允许被注入（与宿主 isModelInvocable 同判据，缺 invocation 视为允许）。 */
function isInvocable(skill) {
  if (!skill || typeof skill !== 'object') return false
  if (!skill.invocation || typeof skill.invocation !== 'object') return true
  return skill.invocation.modelInvocable !== false
}

// ── 插件入口 ──────────────────────────────────────────────────────────────

/**
 * 插件入口。整段 try/catch，**绝不 throw**（裁决 C）。
 *
 * @param {object} ctx - cordis 上下文
 * @param {object} [config] - manifest configSchema 声明的配置
 */
export function apply(ctx, config = {}) {
  try {
    const cfg = config && typeof config === 'object' ? config : {}
    if (cfg.enabled === false) return

    const toolkitRoot = moduleToolkitRoot()
    const explicitRoot = typeof cfg.reportRoot === 'string' ? cfg.reportRoot.trim() : ''
    const reportRoot = explicitRoot !== '' ? resolve(explicitRoot) : resolveReportRoot(toolkitRoot)

    const { rules, dropped } = normalizeRules(cfg.rules)
    const maxInjectPerTurn = Number.isInteger(cfg.maxInjectPerTurn) && cfg.maxInjectPerTurn >= 0
      ? cfg.maxInjectPerTurn
      : DEFAULT_MAX_INJECT_PER_TURN
    // dedupeScope：当前**只实现 session 一种语义**（按 agent 对象分桶，随 agent 释放回收）。
    // 传了别的值不静默接受：如实记一条 info issue 并回落 session，让"配了但没生效"在盘上看得见。
    const requestedDedupeScope = strOr(cfg.dedupeScope, DEFAULT_DEDUPE_SCOPE)
    const dedupeScope = requestedDedupeScope === DEFAULT_DEDUPE_SCOPE ? DEFAULT_DEDUPE_SCOPE : DEFAULT_DEDUPE_SCOPE
    const configIssues = requestedDedupeScope === DEFAULT_DEDUPE_SCOPE ? [] : [{
      code: ISSUE_DEDUPE_SCOPE_UNSUPPORTED,
      level: 'info',
      message: 'dedupeScope="' + requestedDedupeScope + '" 尚未实现，已回落 session（按 agent 分桶）。',
      skill: null,
    }]

    // 进程内状态：按 agent 对象分桶（WeakMap ⇒ agent 释放即回收，不留残留）。
    const injectedByAgent = new WeakMap()   // agent -> Set<skillName>
    const turnBudget = new WeakMap()        // agent -> { turn, count }
    const stats = { steps: 0, injected: [], skipped: [] }

    // 首落盘（init 相）：即便没有任何一个回合跑起来，盘上也已有产物。
    // 与 overlap-detect「段一先落盘」同理由：最坏结果只是少一个维度，不是没有报告。
    let lastDigest = ''
    const persist = (report) => {
      const digest = reportDigest(report)
      if (digest === lastDigest) return
      lastDigest = digest
      writeReport(report, reportRoot)
    }
    persist(buildReport({
      phase: 'init',
      toolkitRoot,
      reportRoot,
      enabled: true,
      maxInjectPerTurn,
      dedupeScope,
      rules,
      dropped,
      validation: { ok: dropped.length === 0 && configIssues.length === 0, issues: configIssues },
      skills: { probed: false },
      stats,
    }))

    if (rules.length === 0) {
      // 默认态：不订阅任何事件，零成本、零注入、行为与改动前完全一致。
      return
    }

    // 上一次已知的技能面读数（跳过路径复用它，避免为了写报告再探测一次）。
    let lastSkillsFace = { probed: false }

    /** 记一条跳过原因（环形上限 50，避免长会话里无界增长）。 */
    const noteSkip = (turn, reason) => {
      stats.skipped.push({ turn, reason })
      if (stats.skipped.length > 50) stats.skipped.splice(0, stats.skipped.length - 50)
    }

    /** 落一份 active 相报告。跳过路径也落盘：让「为什么没注入」在盘上看得见。 */
    const persistActive = (validation, skillsFace) => {
      lastSkillsFace = skillsFace
      persist(buildReport({
        phase: 'active', toolkitRoot, reportRoot, maxInjectPerTurn, dedupeScope,
        rules, dropped, validation, skills: skillsFace, stats,
      }))
    }

    const handler = async (payload, next) => {
      let decision
      try {
        decision = typeof next === 'function' ? await next() : payload
      } catch (error) {
        throw error
      }
      try {
        if (!decision || decision.kind === 'reject') return decision
        const signal = payload && payload.signal
        if (signal && signal.aborted) return decision
        const agent = payload && payload.agent
        const turn = payload && typeof payload.turn === 'number' ? payload.turn : 0
        stats.steps += 1

        // 1. 取最后一条 user 消息文本；本步无 user 消息 ⇒ 直接放行，零成本退出。
        const text = extractLastUserText(payload && payload.messages)
        if (text === null) return decision

        // 2/3. 逐条匹配；未命中 ⇒ 放行（零 token，且**不读 ctx.skills**）。
        const { matched, reason } = matchRules(text, rules)
        if (!matched) {
          noteSkip(turn, reason)
          persistActive({ ok: configIssues.length === 0, issues: configIssues }, lastSkillsFace)
          return decision
        }

        // 4. 去重：本会话该技能是否已注入过。
        let seen = injectedByAgent.get(agent)
        if (!seen) { seen = new Set(); injectedByAgent.set(agent, seen) }
        if (seen.has(matched.skill)) {
          noteSkip(turn, 'dedupe:' + matched.skill)
          persistActive({ ok: configIssues.length === 0, issues: configIssues }, lastSkillsFace)
          return decision
        }

        // 4b. 单回合注入上限。
        let budget = turnBudget.get(agent)
        if (!budget || budget.turn !== turn) { budget = { turn, count: 0 }; turnBudget.set(agent, budget) }
        if (budget.count >= maxInjectPerTurn) {
          noteSkip(turn, 'turn-cap:' + matched.skill)
          persistActive({ ok: configIssues.length === 0, issues: configIssues }, lastSkillsFace)
          return decision
        }

        // 5. 取正文 + 目录校验（一次读数，两用）。
        const catalog = await readSkillCatalog(ctx, agent, signal)
        const validationRaw = validateRules(rules, catalog.available ? catalog.skills : null)
        const validation = { ok: validationRaw.ok && configIssues.length === 0, issues: [...configIssues, ...validationRaw.issues] }
        const skillsFace = {
          probed: true,
          available: catalog.available,
          count: catalog.available ? catalog.skills.length : 0,
          complete: catalog.complete,
          unavailableReason: catalog.unavailableReason,
        }

        if (!catalog.available) {
          // skills-unavailable 已在 validation.issues 里；放行，绝不 throw。
          noteSkip(turn, 'skills-unavailable:' + matched.skill)
          persistActive(validation, skillsFace)
          return decision
        }

        const skills = softService(ctx, 'skills')
        let skill
        try {
          skill = await skills.get(matched.skill, { cwd: undefined, scope: agent, signal })
        } catch {
          skill = undefined
        }
        if (!skill || typeof skill.content !== 'string' || skill.content === '') {
          // 技能不存在 / 取不到正文 ⇒ 记 issue，放行（绝不 throw）。
          const missing = {
            code: ISSUE_RULE_TARGET_MISSING,
            level: 'error',
            message: '规则引用的技能 "' + matched.skill + '" 在目录里但取不到正文 ⇒ 规则表或技能源有问题。',
            skill: matched.skill,
          }
          noteSkip(turn, 'skill-unloadable:' + matched.skill)
          persistActive({ ok: false, issues: [...validation.issues, missing] }, skillsFace)
          return decision
        }
        if (!isInvocable(skill)) {
          const notAllowed = {
            code: ISSUE_RULE_TARGET_MISSING,
            level: 'error',
            message: '技能 "' + matched.skill + '" 的 invocation 不允许模型调用 ⇒ 规则表指向了不可注入的技能。',
            skill: matched.skill,
          }
          noteSkip(turn, 'skill-not-invocable:' + matched.skill)
          persistActive({ ok: false, issues: [...validation.issues, notAllowed] }, skillsFace)
          return decision
        }

        // 6/7. 构造注入消息并**追加到 decision.messages 末尾**（与 tool-skill 同形）。
        const message = buildInjectionMessage(renderSkillContent(skill), { name: matched.skill, reason: reason })
        seen.add(matched.skill)
        budget.count += 1
        stats.injected.push({ skill: matched.skill, turn })
        if (stats.injected.length > 50) stats.injected.splice(0, stats.injected.length - 50)

        persistActive(validation, skillsFace)

        return { ...decision, messages: [...asArray(decision.messages), message] }
      } catch {
        // pre-step 监听体内任何异常一律放行：本插件的 bug 不得影响宿主步进。
        return decision
      }
    }

    if (typeof ctx.on === 'function') ctx.on('agent/pre-step', handler)
  } catch (error) {
    // 静默失败：最坏结果是没有报告文件，绝不让本插件的 bug 冒泡到宿主装载链。
    // 隔离原则不变（绝不冒泡），但失败必须可见，不得伪装成「正常没报告」。
    console.error('[governance-router] 报告生成失败（不影响宿主装载）:', error?.message ?? error);
  }
}

export default { name, inject, apply }
