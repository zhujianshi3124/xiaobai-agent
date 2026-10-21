// governance-overlap-detect —— 重叠冲突检测（批次 5A 收尾）
//
// 职责：一次性只读盘点「skill / 插件的功能重叠与冲突」，把结果写成一份结构化报告，
// 落在 <toolkitRoot>/.toolkit-governance/governance-overlap-detect/latest.json。
//
// 形态照 governance-preflight 样板，五条纪律逐条对应实现：
//   ① 默认静默＝不注入、不出声，**不是不运行**：默认挂载、apply() 会执行、会产出报告；
//      但绝不向对话上下文注入任何内容。
//   ② 不自带面板：不调用 ctx.slots，模块不导出 panels，manifest 的 panels 面留空。
//   ③ 不注册 prompt / skill：不 inject 'systemPrompt' / 'skills'。
//   ④ 可独立卸载：不订阅事件、不建 fiber、不起定时器、不注册 service/command/provider
//      ⇒ 摘掉 lib/governance-overlap-detect/ 与那一条 patch 行即零残留。
//   ⑤ 本文件只依赖 node:fs / node:path / node:url 三个内置模块：不 import 任何
//      lib/ 兄弟插件（pluggable-lint 的 isSibling 判据），也不 import panel/manager
//      （p4-no-subplugin-import-check 的 module 规则）。
//
// **零 ctx.on（本批硬要求）**：不订阅任何事件，只读「当前快照 + 磁盘文件」。
// ctx.skills 走 ctx.get() 只读软探测（不 inject）：inject 为空数组时直接属性访问
// 会被 cordis 的 Proxy 判 "cannot get property ... without inject" 而抛错，
// 故必须用 ctx.get 的软取通道；取不到就如实降级，绝不为此引入 ctx.on。
//
// 同步/异步的处置（本插件唯一的形态难点）：
// ctx.skills.list() / snapshot() 是 **async**，而 apply() 是 **同步**。故分两段：
//   段一（同步）：manifest 声明面分析（services/commands/providers/entry）→ 立即落盘；
//   段二（异步）：一次性 await skills.list() 取得 summary → 合并后重写同一份报告。
// 段二是一个**一次性浮空 Promise**（非 fiber、非定时器、非事件订阅），且末尾必有
// .catch 兜底，保证任何失败都不会变成 unhandledRejection 冒泡到宿主。
// 即便段二永不完成，段一的报告也已经在盘上——这是「最坏结果只是少一个维度」的设计。
//
// 为什么 apply() 整段 try/catch 且绝不 throw（裁决 C 的硬要求）：
// 本插件默认启用、随宿主加载运行。它是新代码，若自己有 bug 却把异常抛给装载器，
// 就有可能影响宿主启动。捕获后静默失败，最坏结果是「没有报告文件」，不会拖垮宿主。
// 这条比「能不能工作」优先级更高。

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'governance-overlap-detect'
/** 空数组＝不依赖任何宿主服务：ctx.skills 走 ctx.get 软探测，缺席即降级。 */
export const inject = []

/** 报告根目录名（与批次 4 面板区块、其它治理插件的约定路径同源）。 */
export const REPORT_DIR_NAME = '.toolkit-governance'
/** 本插件在报告根下的子目录名。 */
export const REPORT_PLUGIN_DIR = 'governance-overlap-detect'
/** 报告文件 schema 标识，供后续批次读取方按版本解析。 */
export const REPORT_SCHEMA = 'toolkit-governance/overlap-detect@1'
/** 文本相似度阈值缺省（0..1）：超过即判「高度相似」。 */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.6

/**
 * 模块位置推导仓根：本文件在 lib/governance-overlap-detect/ 下，上溯两级即仓根。
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

function strArr(v) {
  return asArray(v).filter((x) => typeof x === 'string' && x !== '')
}

/**
 * 软取宿主服务：inject 为空数组时，直接 ctx.skills 会被 Proxy 拒绝并抛错，
 * 故一律走 ctx.get()。任何异常都归为「不可用」，不影响报告落盘。
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

// ── 文本相似度：判定「重叠」的公共底座 ─────────────────────────────────────
//
// 为什么用 token 集合的 Jaccard 而不是编辑距离：
// skill 的 description / whenToUse 是**自然语言短语**，同义改写（"生成周报" vs "写周报"）
// 在字符级编辑距离上很远、在词集合上很近；而重叠检测要抓的恰恰是"说法不同、干的是同一件事"。
// Jaccard 对语序不敏感、对增删词稳健，且无需依赖（纯 node: 实现，不引第三方 NLP 库）。

/** 归一：小写、非字母数字汉字一律作分隔、去空串。中英混排都按「字/词块」切。 */
export function tokenize(text) {
  const s = String(text === undefined || text === null ? '' : text).toLowerCase()
  return s
    .split(/[^a-z0-9\u4e00-\u9fa5]+/u)
    .filter((t) => t.length > 0)
}

/** Jaccard 相似度：|A∩B| / |A∪B|；两者皆空时返回 0（不把"都没写"当成"完全一样"）。 */
export function jaccard(a, b) {
  const A = new Set(a)
  const B = new Set(b)
  if (A.size === 0 && B.size === 0) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter += 1
  const union = A.size + B.size - inter
  return union === 0 ? 0 : inter / union
}

/**
 * 名称相似度：kebab 名按 '-' 切词后求 Jaccard，再与"整名相同"取并。
 * 例：governance-preflight vs governance-context-audit ⇒ 共享 governance ⇒ 1/3。
 */
export function nameSimilarity(a, b) {
  if (a === b) return 1
  return jaccard(tokenize(String(a).replace(/[-_/]/g, ' ')), tokenize(String(b).replace(/[-_/]/g, ' ')))
}

// ── 段一：插件声明面（同步，纯磁盘读） ─────────────────────────────────────

/**
 * 盘点各子插件 manifest 的 provides 声明面。
 * 只读 provides（v1.3 正典），legacy requirements.registers 作为回落并单独标注，
 * 避免"清单迁进 provides 后此处仍直读 legacy"导致的重叠失明（与 doctor 同族坑）。
 */
export function collectPluginFaces(toolkitRoot) {
  const plugins = []
  for (const dir of listLibDirs(toolkitRoot)) {
    const pluginDir = join(toolkitRoot, 'lib', dir)
    const manifestPath = join(pluginDir, 'dsh.plugin.json')
    const manifest = readJsonSafe(manifestPath)
    if (manifest === undefined) {
      plugins.push({ dir, manifestPresent: false, name: null, entry: null, services: [], commands: [], providers: [], inject: [], source: 'none' })
      continue
    }
    const provides = manifest.provides && typeof manifest.provides === 'object' ? manifest.provides : {}
    const requirements = manifest.requirements && typeof manifest.requirements === 'object' ? manifest.requirements : {}
    const registers = requirements.registers && typeof requirements.registers === 'object' ? requirements.registers : {}
    const pick = (key) => {
      const fromProvides = strArr(provides[key])
      if (fromProvides.length > 0) return { list: fromProvides, source: 'provides' }
      return { list: strArr(registers[key]), source: strArr(registers[key]).length > 0 ? 'legacy-registers' : 'none' }
    }
    const services = pick('services')
    const commands = pick('commands')
    const providers = pick('providers')
    const sources = new Set([services.source, commands.source, providers.source].filter((s) => s !== 'none'))
    plugins.push({
      dir,
      manifestPresent: true,
      name: typeof manifest.name === 'string' ? manifest.name : null,
      entry: typeof provides.entry === 'string' ? provides.entry : null,
      services: services.list,
      commands: commands.list,
      providers: providers.list,
      inject: strArr(provides.inject),
      source: sources.size === 0 ? 'none' : [...sources].join('+'),
    })
  }
  return plugins
}

/** 在若干插件间找「同一名字被 ≥2 个插件声明」的面。 */
function findSharedDeclarations(plugins, key) {
  const map = new Map()
  for (const p of plugins) {
    for (const value of p[key]) {
      if (!map.has(value)) map.set(value, [])
      map.get(value).push(p.dir)
    }
  }
  const out = []
  for (const [value, dirs] of map) {
    if (dirs.length > 1) out.push({ kind: key.slice(0, -1), value, plugins: dirs.slice().sort() })
  }
  return out.sort((a, b) => a.value.localeCompare(b.value))
}

// ── 段二：skill 面（异步，需 await ctx.skills.list()） ─────────────────────

/**
 * 取 skill summary 列表。ctx.skills 缺席 / list 抛错 / 超时一律降级为 unavailable。
 * **不订阅任何事件**：这是一次性拉取当前快照。
 */
export async function collectSkillSummaries(ctx, options = {}) {
  const result = { available: false, unavailableReason: null, count: 0, skills: [], complete: null }
  const skills = softService(ctx, 'skills')
  if (!skills || typeof skills.list !== 'function') {
    result.unavailableReason = 'ctx.skills 不可用（服务缺席或未提供 list()）'
    return result
  }
  let list
  try {
    list = await skills.list(options.listOptions === undefined ? {} : options.listOptions)
  } catch (error) {
    result.unavailableReason = 'ctx.skills.list() 抛错：' + String((error && error.message) || error)
    return result
  }
  if (!Array.isArray(list)) {
    result.unavailableReason = 'ctx.skills.list() 返回非数组'
    return result
  }
  result.available = true
  result.count = list.length
  result.skills = list.map((s) => {
    const summary = s && typeof s === 'object' ? s : {}
    return {
      name: typeof summary.name === 'string' ? summary.name : null,
      description: typeof summary.description === 'string' ? summary.description : '',
      whenToUse: typeof summary.whenToUse === 'string' ? summary.whenToUse : '',
      invocation: summary.invocation && typeof summary.invocation === 'object'
        ? { modelInvocable: summary.invocation.modelInvocable === true, userInvocable: summary.invocation.userInvocable === true }
        : null,
      source: typeof summary.source === 'string' ? summary.source : null,
      provider: typeof summary.provider === 'string' ? summary.provider : null,
      hasResourceBase: summary.resourceBase !== undefined,
    }
  })
  return result
}

/**
 * skill 两两重叠判定。维度：
 *   ① 同名（注册表按 name 去重，出现即异常，直接报 error 级重叠）
 *   ② 名称高度相似（kebab 词集合 Jaccard ≥ 阈值）
 *   ③ description 文本相似（词集合 Jaccard ≥ 阈值）
 *   ④ whenToUse 文本相似（词集合 Jaccard ≥ 阈值）
 * 三条文本维度各自独立记录，便于定位"到底哪一面撞了"。
 */
export function detectSkillOverlaps(skills, threshold = DEFAULT_SIMILARITY_THRESHOLD) {
  const overlaps = []
  const valid = skills.filter((s) => typeof s.name === 'string' && s.name !== '')
  for (let i = 0; i < valid.length; i += 1) {
    for (let j = i + 1; j < valid.length; j += 1) {
      const a = valid[i]
      const b = valid[j]
      const dims = []
      if (a.name === b.name) dims.push({ dimension: 'same-name', score: 1 })
      const ns = nameSimilarity(a.name, b.name)
      if (ns >= threshold) dims.push({ dimension: 'name-similar', score: Number(ns.toFixed(4)) })
      const ds = jaccard(tokenize(a.description), tokenize(b.description))
      if (ds >= threshold) dims.push({ dimension: 'description-similar', score: Number(ds.toFixed(4)) })
      const ws = jaccard(tokenize(a.whenToUse), tokenize(b.whenToUse))
      if (ws >= threshold) dims.push({ dimension: 'when-to-use-similar', score: Number(ws.toFixed(4)) })
      if (dims.length === 0) continue
      const top = Math.max(...dims.map((d) => d.score))
      overlaps.push({
        a: a.name,
        b: b.name,
        severity: dims.some((d) => d.dimension === 'same-name') ? 'error' : top >= 0.85 ? 'warn' : 'info',
        score: Number(top.toFixed(4)),
        dimensions: dims,
      })
    }
  }
  return overlaps.sort((x, y) => y.score - x.score || x.a.localeCompare(y.a))
}

/**
 * 组装报告（纯函数：只读入参，不写任何东西）。
 * @param {string} toolkitRoot 已 resolve 的仓根
 * @param {object} [opts] {reportRoot, rootSource, threshold, skillResult, ctx, phase}
 */
export function buildReport(toolkitRoot, opts = {}) {
  const root = String(toolkitRoot || '')
  const threshold = typeof opts.threshold === 'number' && Number.isFinite(opts.threshold) ? opts.threshold : DEFAULT_SIMILARITY_THRESHOLD
  const issues = []
  const addIssue = (code, level, message, target) =>
    issues.push({ code, level, message, target: target === undefined ? null : target })

  const plugins = collectPluginFaces(root)
  const skillResult = opts.skillResult === undefined
    ? { available: false, unavailableReason: 'skills 面尚未采集（同步阶段）', count: 0, skills: [], complete: null }
    : opts.skillResult

  const pluginOverlaps = [
    ...findSharedDeclarations(plugins, 'services'),
    ...findSharedDeclarations(plugins, 'commands'),
    ...findSharedDeclarations(plugins, 'providers'),
  ].sort((a, b) => a.kind.localeCompare(b.kind) || a.value.localeCompare(b.value))

  // entry 目标重复：两个插件指向同一入口文件 ⇒ 必然重复注册。
  const entryMap = new Map()
  for (const p of plugins) {
    if (!p.entry) continue
    const abs = join(root, 'lib', p.dir, p.entry)
    if (!entryMap.has(abs)) entryMap.set(abs, [])
    entryMap.get(abs).push(p.dir)
  }
  const sharedEntries = [...entryMap.entries()]
    .filter(([, dirs]) => dirs.length > 1)
    .map(([entry, dirs]) => ({ kind: 'entry', value: entry, plugins: dirs.slice().sort() }))

  const skillOverlaps = detectSkillOverlaps(skillResult.skills, threshold)

  for (const p of plugins) {
    if (!p.manifestPresent) addIssue('sub-manifest-missing', 'warn', '子插件目录里没有可读的 dsh.plugin.json', join(root, 'lib', p.dir))
    else if (p.source.includes('legacy-registers')) addIssue('legacy-registers-face', 'info', '仍走 legacy requirements.registers 声明面：' + p.dir, join(root, 'lib', p.dir, 'dsh.plugin.json'))
  }
  if (skillResult.available === false) {
    addIssue('skills-unavailable', 'info', 'ctx.skills 读数不可用：' + String(skillResult.unavailableReason), null)
  }
  for (const o of skillOverlaps) {
    if (o.severity === 'error') addIssue('skill-same-name', 'error', '两个 skill 同名：' + o.a, null)
  }

  return {
    schema: REPORT_SCHEMA,
    plugin: 'governance-overlap-detect',
    generatedAt: new Date().toISOString(),
    // 批次 5 裁决一：推导出的仓根必须进报告元信息，算错时能一眼看出来。
    toolkitRootResolved: root,
    toolkitRootSource: opts.rootSource === undefined ? 'module-location' : String(opts.rootSource),
    reportRoot: opts.reportRoot === undefined ? resolveReportRoot(root) : String(opts.reportRoot),
    // phase 让读取方一眼看出这份报告是否已并入 skills 面。
    phase: opts.phase === undefined ? 'sync' : String(opts.phase),
    threshold,
    inputs: {
      libDir: join(root, 'lib'),
      skillsAvailable: skillResult.available === true,
      skillsCount: skillResult.count,
    },
    summary: {
      subPlugins: plugins.length,
      manifestsPresent: plugins.filter((p) => p.manifestPresent).length,
      declaredServices: plugins.reduce((n, p) => n + p.services.length, 0),
      declaredCommands: plugins.reduce((n, p) => n + p.commands.length, 0),
      declaredProviders: plugins.reduce((n, p) => n + p.providers.length, 0),
      pluginOverlaps: pluginOverlaps.length,
      sharedEntries: sharedEntries.length,
      skillsAvailable: skillResult.available === true,
      skillsCount: skillResult.count,
      skillOverlaps: skillOverlaps.length,
      totalOverlaps: pluginOverlaps.length + sharedEntries.length + skillOverlaps.length,
      issues: issues.length,
      issuesByLevel: {
        error: issues.filter((i) => i.level === 'error').length,
        warn: issues.filter((i) => i.level === 'warn').length,
        info: issues.filter((i) => i.level === 'info').length,
      },
    },
    plugins,
    pluginOverlaps,
    sharedEntries,
    skills: skillResult.skills,
    skillOverlaps,
    issues,
    notes: [
      '本报告只读产出：不修改任何插件、配置或用户文件。',
      '零 ctx.on：本插件不订阅任何事件，只读当前快照与磁盘文件。',
      'phase=sync 表示 skills 面尚未并入；phase=enriched 表示已并入 ctx.skills 快照。',
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

/** 段二：取 skills 面后重写报告（async）。任何异常都吞掉，绝不外抛。 */
export async function enrichWithSkills(ctx, toolkitRoot, opts = {}) {
  try {
    const skillResult = await collectSkillSummaries(ctx, opts)
    const report = buildReport(toolkitRoot, { ...opts, skillResult, phase: 'enriched' })
    writeReport(report, report.reportRoot)
    return report
  } catch {
    return undefined
  }
}

/**
 * 插件入口。整段 try/catch，**绝不 throw**（裁决 C：新插件不能因自身 bug 影响宿主）。
 * 全程不使用 ctx.on / ctx.slots / ctx.systemPrompt / ctx.tools。
 * ctx.skills 走 ctx.get 只读软探测，缺席即降级。
 */
export function apply(ctx, config = {}) {
  try {
    const cfg = config && typeof config === 'object' ? config : {}
    if (cfg.enabled === false) return
    const explicitRoot = typeof cfg.reportRoot === 'string' ? cfg.reportRoot.trim() : ''
    const toolkitRoot = moduleToolkitRoot()
    const reportRoot = explicitRoot !== '' ? resolve(explicitRoot) : resolveReportRoot(toolkitRoot)
    const threshold = typeof cfg.similarityThreshold === 'number' && Number.isFinite(cfg.similarityThreshold)
      ? cfg.similarityThreshold
      : DEFAULT_SIMILARITY_THRESHOLD

    // 段一（同步）：先落一份 manifest 面报告——即便段二永不完成，盘上也已有产物。
    const syncReport = buildReport(toolkitRoot, { reportRoot, rootSource: 'module-location', threshold, phase: 'sync', ctx })
    writeReport(syncReport, reportRoot)

    // 段二（异步）：一次性浮空 Promise，末尾 .catch 兜底，杜绝 unhandledRejection。
    void enrichWithSkills(ctx, toolkitRoot, { reportRoot, rootSource: 'module-location', threshold }).catch(() => {})
  } catch {
    // 静默失败：最坏结果是没有报告文件，绝不让本插件的 bug 冒泡到宿主装载链。
  }
}

export default { name, inject, apply }
