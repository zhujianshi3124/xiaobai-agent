#!/usr/bin/env node
// P4 验收证据（用户要求 1）+ ★13 泛化（批 7）：面板与引擎的数据面不得依赖具体插件。
//
// 判据三块（任一命中即非零退出）：
//   name     子插件名字面引用。**名字集是从仓内派生的**（`lib/*/` 目录名 ∪ 套件 manifest
//            `aliases` 各值的末段），不再手写"5 个内置名" ⇒ 以后加第 6 个内置插件，
//            这条判据自己就长出来，不必回来改脚本（P2-10 ① 的"对第三方新插件名完全失明"
//            有一半就是这么治的）。
//   identity 插件身份形状：任何 `"@scope/name"` 字面量，只要那个名字**不是 package.json 里
//            声明过的依赖/开发依赖**，就按插件身份算 ⇒ 为一家第三方插件改面板代码，现在
//            会被抓到（P2-10 ① 的另一半）。反过来说：真依赖（`@deepseek-ai/*` 那族）不误报。
//   module   `lib/` 模块引用（from / import() / require 三形态，P4 原始那条，一字未改）。
//
// 三条刻意的设计口径（都有对应钉子，见 test/p4-panel-guard.test.mjs）：
//   ① 注释行不参与判据。这条纪律管的是"面板代码依赖具体插件"，散文里提一个名字不是依赖；
//      不这么做的话，扩面后 8 处解释性注释会变成假违规（apply-engine.mjs 首当其冲）。
//   ② 扫描面动态走 `panel/manager/*.mjs` 全量（recon 批 7 格要求的"覆盖其余文件"），
//      新增文件自动进面，不再靠手写清单。
//   ③ 豁免只免"点名"（name/identity），**从不免 `lib/` import**。P2.4/P2.3 的生命周期资产
//      可以在面板里点插件名，但一样不许 import 兄弟插件模块。
//
// 用法：node scripts/p4-no-subplugin-import-check.mjs [文件...]（缺省扫 listScannedFiles()）
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const MODULE_PATTERNS = [
  /\bfrom\s+['"][^'"]*\blib\//,
  /import\(\s*['"][^'"]*\blib\//,
  /require\(\s*['"][^'"]*\blib\//,
]
/** `"@scope/name"` 形状的字符串字面量（单引号/双引号/反引号都收）。 */
const IDENTITY_RE = /['"``](@[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)['"``]/g

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const pkgCache = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const manifestCache = JSON.parse(fs.readFileSync(path.join(root, 'dsh.plugin.json'), 'utf8'))

/** 真依赖（含 devDependencies）不算插件身份——面板/引擎引框架库是合法的。 */
export function isFrameworkDependency(name) {
  const d = { ...(pkgCache.dependencies || {}), ...(pkgCache.devDependencies || {}), ...(pkgCache.optionalDependencies || {}) }
  return Object.prototype.hasOwnProperty.call(d, name)
}

/**
 * 派生的子插件名字集：`lib/` 下每个子目录名 ∪ manifest aliases 各值末段（去掉 `dsh-` 前缀）。
 * 入参可注入（默认读仓内真实面）——不然"判据是派生的不是手写的"这条谁也证不了。
 */
export function collectSubPluginNames({ libDir = path.join(root, 'lib'), aliases = manifestCache.aliases } = {}) {
  const names = new Set()
  if (fs.existsSync(libDir)) {
    for (const e of fs.readdirSync(libDir, { withFileTypes: true })) if (e.isDirectory()) names.add(e.name)
  }
  for (const v of Object.values(aliases || {})) {
    const tail = String(v).split('/').pop()
    if (tail) names.add(tail.replace(/^dsh-/, ''))
  }
  return [...names].sort()
}

/**
 * 点名豁免登记（★13 要求"有意保留的例外必须显式列入并写清依据"）。
 * 只免 name/identity 两条，**从免不掉 module（lib/ 引用）**；死条目由测试判红（防豁免腐烂）。
 */
export const NAME_EXEMPTIONS = [
  {
    file: 'panel/manager/plugin-registry.mjs',
    reason: 'P2.4 patch 域生命周期资产：插件登记表（dir/rowId/pkg）与 DEPENDENCIES 依赖声明必须点名插件才能算挂载与联动。`docs/migration.md` §4 前置 2 明文"仍在使用…要求原样保留"。',
  },
  {
    file: 'panel/manager/snapshot.mjs',
    reason: '同上族：ORIGINS/ROW_IDS 映射与 P2.3 `buildConfigPanel` 的按插件分支（rate-throttle 唯一可写行、search-router mode 只读展示）。依据 `docs/migration.md` §4 前置 2 与 `panel/docs/p23-design.md` §一范围收敛。',
  },
  {
    file: 'panel/manager/config-whitelist.mjs',
    reason: 'P2.3 配置编辑白名单：`CONFIG_EDITABLE_ROW` 与 18 键 `CONFIG_WHITELIST` 按设计只对唯一可写插件开放（判定侧第 19 轮批准），点名即判据本身。依据 `panel/docs/p23-design.md` §二/§八/§九。',
  },
  {
    file: 'panel/manager/uninstall.mjs',
    reason: 'P2.4 卸载/恢复通路：compact-router 由预设脚本托管、在 patch 里没有自己的行 ⇒ 软卸载/真卸载/恢复三张 plan 必须按包名扫引用与写留痕。依据 `docs/migration.md` §4 前置 2 与 `panel/docs/p24-design-v2-destroy.md`。',
  },
]

function exemptSet() {
  return new Set(NAME_EXEMPTIONS.map((e) => e.file.replace(/\\/g, '/')))
}

/**
 * 扫一段文本。names=派生名字集；exemptNames=true 时跳过点名两条（module 照查）。
 * 返回 [{line, rule, text}]。
 */
export function scanText({ text, names, exemptNames = false }) {
  const hits = []
  // 整词形：kebab 名里的 `-` 算名字的一部分，否则 `web-search-local-extra` 会被误判成点名
  // （同族先例见 panel/manager/apply-engine.mjs 的"避免 rate-throttle 命中 rate-throttle-x"）。
  const nameRes = names.map((n) => new RegExp(`(^|[^A-Za-z0-9_-])${escapeRe(n)}([^A-Za-z0-9_-]|$)`))
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim()
    // 注释行不参与判据（口径 ①）：整行 // 、JSDoc 的 * 与 /* 开头都算。
    if (line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) return
    if (!exemptNames) {
      nameRes.forEach((re, k) => {
        if (re.test(line)) hits.push({ line: i + 1, rule: 'name', matched: names[k], text: line.slice(0, 160) })
      })
      for (const m of line.matchAll(IDENTITY_RE)) {
        const nm = m[1]
        if (!isFrameworkDependency(nm)) hits.push({ line: i + 1, rule: 'identity', matched: nm, text: line.slice(0, 160) })
      }
    }
    for (const re of MODULE_PATTERNS) {
      if (re.test(line)) hits.push({ line: i + 1, rule: 'module', matched: 'lib/ 引用', text: line.slice(0, 160) })
    }
  })
  return hits
}

/** 扫描面（口径 ②）：动态走 panel/manager 全量 .mjs；客户端两文件只查 import 形态。 */
export function listScannedFiles() {
  const out = [
    { rel: 'index.js', mode: 'all' }, // P7 根入口：自描述装配壳，同样禁止点名子插件
    { rel: 'panel/index.js', mode: 'all' },
  ]
  const mgr = path.join(root, 'panel', 'manager')
  for (const f of fs.readdirSync(mgr).filter((f) => f.endsWith('.mjs')).sort()) {
    out.push({ rel: `panel/manager/${f}`, mode: 'all' })
  }
  // 客户端两文件：UI 文案常量（DESCRIPTIONS/CN_NAMES/UNINSTALL_COPY…）按设计点名五个目录名，
  // 属呈现资产不属数据面 ⇒ 只查 lib/ import 形态（P6 原口径，本批把 panel.html 一并纳面）。
  out.push({ rel: 'panel/client/index.js', mode: 'module' })
  out.push({ rel: 'panel/client/panel.html', mode: 'module' })
  return out.map((e) => ({ ...e, abs: path.join(root, e.rel) }))
}

/** 真跑一遍（测试与 CLI 共用）。 */
export function runCheck(argvFiles = []) {
  const names = collectSubPluginNames()
  const ex = exemptSet()
  const files = argvFiles.length
    ? argvFiles.map((f) => {
        const rel = path.relative(root, path.resolve(root, f)).replace(/\\/g, '/')
        return { rel, abs: path.resolve(root, f), mode: rel.endsWith('client/index.js') || rel.endsWith('client/panel.html') ? 'module' : 'all' }
      })
    : listScannedFiles()
  const hits = []
  for (const f of files) {
    if (!fs.existsSync(f.abs)) { hits.push({ rel: f.rel, line: 0, rule: 'missing', matched: 'file', text: '文件不存在' }); continue }
    for (const h of scanText({ text: fs.readFileSync(f.abs, 'utf8'), names, exemptNames: f.mode === 'module' || ex.has(f.rel) })) {
      hits.push({ ...h, rel: f.rel })
    }
  }
  return { files, hits, names, exempted: [...ex] }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isMain) {
  const r = runCheck(process.argv.slice(2))
  for (const h of r.hits) console.log(`命中 ${h.rel}:${h.line} [${h.rule}${h.matched ? ` ${h.matched}` : ''}]  ${h.text}`)
  console.log(`[no-subplugin-import-check] 扫描 ${r.files.length} 个文件（判据名字集 ${r.names.length} 个、点名豁免登记 ${r.exempted.length} 个），命中 ${r.hits.length} 处。`)
  process.exit(r.hits.length === 0 ? 0 : 1)
}
