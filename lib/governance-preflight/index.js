// governance-preflight —— 治理预检（批次 5A 形态样板）
//
// 职责：一次性只读扫描「本套件装了什么、声明了什么、有没有违规面」，把结果写成
// 一份结构化报告，落在 <toolkitRoot>/.toolkit-governance/governance-preflight/latest.json。
//
// 五条不可动的纪律（红线原文，逐条对应实现）：
//   ① 默认静默＝不注入、不出声，**不是不运行**：本插件默认挂载、apply() 会执行、
//      会产出报告；但它绝不向对话上下文注入任何内容（不监听 agent/pre-step，
//      那是唯一能改 decision.messages 的钩子）。
//   ② 不自带面板：不调用 ctx.slots，模块不导出 panels，manifest 的 panels 面留空。
//   ③ 不注册 prompt / skill：不 inject 'systemPrompt' / 'skills'，也就不可能
//      调用 ctx.systemPrompt.section() 或 ctx.skills.registerProvider()。
//   ④ 可独立卸载：不订阅事件、不建 fiber、不起定时器、不注册 service/command/provider
//      ⇒ 摘掉 lib/governance-preflight/ 与那一条 patch 行即零残留，也不会留下
//      名字冲突（doctor 的 reg.name-collision 只比 services/commands/providers 三面）。
//   ⑤ 本文件只依赖 node:fs / node:path / node:url 三个内置模块：不 import 任何
//      lib/ 兄弟插件（pluggable-lint 的 isSibling 判据），也不 import panel/manager
//      （p4-no-subplugin-import-check 的 module 规则）。
//
// 为什么 apply() 整段 try/catch 且绝不 throw（裁决 C 的硬要求）：
// 本插件默认启用、随宿主加载运行。它是新代码，若自己有 bug 却把异常抛给装载器，
// 就有可能影响宿主启动。捕获后静默失败，最坏结果是「没有报告文件」，不会拖垮宿主。
// 这条比「能不能工作」优先级更高。

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'governance-preflight'
/** 空数组＝不依赖任何宿主服务：读文件不需要注入。 */
export const inject = []

/** 报告根目录名（与批次 4 面板区块的约定路径同源）。 */
export const REPORT_DIR_NAME = '.toolkit-governance'
/** 本插件在报告根下的子目录名。 */
export const REPORT_PLUGIN_DIR = 'governance-preflight'
/** 报告文件 schema 标识，供后续批次读取方按版本解析。 */
export const REPORT_SCHEMA = 'toolkit-governance/preflight@1'

/**
 * 模块位置推导仓根：本文件在 lib/governance-preflight/ 下，上溯两级即仓根。
 * 与 panel/manager/toolkit-root.mjs 的 moduleToolkitRoot() 数学等价
 * （那边在 panel/manager/ 下，同样上溯两级）——但**不 import 它**：
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

function readTextSafe(abs) {
  try {
    return readFileSync(abs, 'utf8')
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

/**
 * 极简 patch 行扫描：只认「- id:」「name:」「disabled:」「inject:」四类行。
 * 不做 YAML 语义解析——preflight 只需要行清单与三个开关位，解析器会带来
 * 依赖与失败面，而这里要的是「宁可少说，不可崩」。
 */
export function parsePatchRows(patchText) {
  const rows = []
  let cur = null
  for (const raw of String(patchText || '').split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '')
    if (/^\s*#/.test(line) || /^\s*$/.test(line)) continue
    const idMatch = /^(\s*)-\s+id:\s*(.+)$/.exec(line)
    if (idMatch) {
      // 只把顶格层级（缩进 ≤ 6）的行当插件行：cordis.patch.yml 里插件行缩进 4 空格，
      // 而 config 内部的列表项（staticGroups[].id 之类）缩进更深。行扫描器若不分层级，
      // 会把分组名误记成插件行——报告是给人看的，宁可少记不可记错。
      if (idMatch[1].length > 6) continue
      cur = { id: idMatch[2].trim().replace(/^['"]|['"]$/g, ''), name: null, disabled: null, hasConfig: false }
      rows.push(cur)
      continue
    }
    if (!cur) continue
    const nameMatch = /^\s+name:\s*(.+)$/.exec(line)
    if (nameMatch) { cur.name = nameMatch[1].trim().replace(/^['"]|['"]$/g, ''); continue }
    const disMatch = /^\s+disabled:\s*(.+)$/.exec(line)
    if (disMatch) { cur.disabled = disMatch[1].trim(); continue }
    if (/^\s+config:\s*$/.test(line)) { cur.hasConfig = true; continue }
  }
  return rows
}

function asArray(v) {
  return Array.isArray(v) ? v : []
}

/**
 * 组装报告对象（纯函数：只读文件系统，不写任何东西）。
 * @param {string} toolkitRoot 已 resolve 的仓根
 * @param {{reportRoot?: string, rootSource?: string}} [opts]
 */
export function buildReport(toolkitRoot, opts = {}) {
  const root = String(toolkitRoot || '')
  const issues = []
  const addIssue = (code, level, message, target) => issues.push({ code, level, message, target: target === undefined ? null : target })

  const rootManifestPath = join(root, 'dsh.plugin.json')
  const patchPath = join(root, 'cordis.patch.yml')
  const rootManifest = readJsonSafe(rootManifestPath)
  const patchText = readTextSafe(patchPath)

  if (rootManifest === undefined) addIssue('root-manifest-unreadable', 'error', '仓根 dsh.plugin.json 缺失或不是合法 JSON', rootManifestPath)
  if (patchText === undefined) addIssue('patch-unreadable', 'error', '仓根 cordis.patch.yml 缺失或不可读', patchPath)

  const patchRows = parsePatchRows(patchText)

  const plugins = []
  for (const dir of listLibDirs(root)) {
    const pluginDir = join(root, 'lib', dir)
    const manifestPath = join(pluginDir, 'dsh.plugin.json')
    const manifest = readJsonSafe(manifestPath)
    if (manifest === undefined) {
      plugins.push({ dir, manifestPresent: false, id: null, name: null, version: null, entry: null, entryExists: null, inject: [], events: [], hasConfigSchema: false, panelsDeclared: null })
      addIssue('sub-manifest-missing', 'warn', '子插件目录里没有可读的 dsh.plugin.json（不成卡）', pluginDir)
      continue
    }
    const provides = manifest.provides || {}
    const requirements = manifest.requirements || {}
    const registers = requirements.registers || {}
    const entry = typeof provides.entry === 'string' && provides.entry !== '' ? provides.entry : null
    const entryExists = entry === null ? null : existsSync(join(pluginDir, entry))
    const declaredInject = asArray(provides.inject)
    const declaredEvents = asArray(registers.events)
    const panels = manifest.panels

    plugins.push({
      dir,
      manifestPresent: true,
      id: typeof manifest.id === 'string' ? manifest.id : null,
      name: typeof manifest.name === 'string' ? manifest.name : null,
      version: typeof manifest.version === 'string' ? manifest.version : null,
      entry,
      entryExists,
      inject: declaredInject,
      events: declaredEvents,
      hasConfigSchema: manifest.configSchema !== undefined,
      panelsDeclared: Array.isArray(panels) ? panels.length : null,
    })

    for (const key of ['id', 'displayName', 'version', 'contract']) {
      if (manifest[key] === undefined) addIssue('manifest-field-missing', 'error', '子插件 manifest 缺必填字段 ' + key, manifestPath)
    }
    if (entry !== null && entryExists === false) addIssue('entry-not-found', 'error', 'provides.entry 指向的文件不存在：' + entry, pluginDir)
    if (Array.isArray(panels) && panels.length > 0) addIssue('panel-declared', 'error', '子插件自带面板（红线：禁子插件自带面板）', manifestPath)
    if (declaredEvents.length > 0) addIssue('events-declared', 'info', '声明了 ' + declaredEvents.length + ' 个事件订阅面：' + declaredEvents.join(', '), manifestPath)
    if (declaredInject.length > 0) addIssue('inject-declared', 'info', '声明了注入面：' + declaredInject.join(', '), manifestPath)
  }

  const manifestsByName = new Map()
  for (const p of plugins) if (p.name) manifestsByName.set(p.name, p)
  for (const row of patchRows) {
    if (!row.name) continue
    const base = row.name.split('/').slice(0, 2).join('/')
    if (!manifestsByName.has(row.name) && !manifestsByName.has(base)) {
      addIssue('patch-row-orphan', 'info', 'patch 行引用的包在 lib/ 清单里找不到同名 manifest：' + row.name, row.id)
    }
  }

  return {
    schema: REPORT_SCHEMA,
    plugin: 'governance-preflight',
    generatedAt: new Date().toISOString(),
    // 批次 5 裁决一：推导出的仓根必须进报告元信息，算错时能一眼看出来。
    toolkitRootResolved: root,
    toolkitRootSource: opts.rootSource === undefined ? 'module-location' : String(opts.rootSource),
    reportRoot: opts.reportRoot === undefined ? resolveReportRoot(root) : String(opts.reportRoot),
    inputs: {
      rootManifestPath,
      patchPath,
      libDir: join(root, 'lib'),
      rootManifestReadable: rootManifest !== undefined,
      patchReadable: patchText !== undefined,
    },
    summary: {
      subPlugins: plugins.length,
      manifestsPresent: plugins.filter((p) => p.manifestPresent).length,
      patchRows: patchRows.length,
      totalDeclaredEvents: plugins.reduce((n, p) => n + p.events.length, 0),
      pluginsWithInject: plugins.filter((p) => p.inject.length > 0).length,
      pluginsWithPanels: plugins.filter((p) => (p.panelsDeclared || 0) > 0).length,
      issues: issues.length,
      issuesByLevel: {
        error: issues.filter((i) => i.level === 'error').length,
        warn: issues.filter((i) => i.level === 'warn').length,
        info: issues.filter((i) => i.level === 'info').length,
      },
    },
    plugins,
    patchRows,
    issues,
    notes: [
      '本报告只读产出：不修改任何插件、配置或用户文件。',
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
 * 插件入口。整段 try/catch，**绝不 throw**（裁决 C：新插件不能因自身 bug 影响宿主）。
 * 全程不使用 ctx：不 ctx.on / ctx.slots / ctx.systemPrompt / ctx.skills / ctx.tools。
 */
export function apply(ctx, config = {}) {
  try {
    const cfg = config && typeof config === 'object' ? config : {}
    if (cfg.enabled === false) return
    const explicitRoot = typeof cfg.reportRoot === 'string' ? cfg.reportRoot.trim() : ''
    const toolkitRoot = moduleToolkitRoot()
    const reportRoot = explicitRoot !== '' ? resolve(explicitRoot) : resolveReportRoot(toolkitRoot)
    const report = buildReport(toolkitRoot, { reportRoot, rootSource: 'module-location' })
    writeReport(report, reportRoot)
  } catch {
    // 静默失败：最坏结果是没有报告文件，绝不让本插件的 bug 冒泡到宿主装载链。
  }
}

export default { name, inject, apply }
