/**
 * 来源解析与 legacy 适配器（REQ-2）。
 *
 * P2 支持 PluginSource = { kind: 'local', path }（Q1 裁决：仅本地路径；
 * npm 为契约预留分支，遇到即抛 source-not-supported，追加时不改本模块主流程）。
 *
 * 解析顺序：
 *   1. dir：读 <dir>/dsh.plugin.json
 *      - 存在且带 contract 字段 → 契约插件（契约校验在 precheck，见 precheck.ts）
 *      - 存在但只有旧 manifestVersion:1 字段（无 contract）→ **legacy**（术语表：
 *        "未实现契约的普通 DSH 插件"），合成契约 manifest
 *      - 不存在 → legacy
 *   2. 入口解析（D-7 裁定 2026-09-21；v1.3 扩槽 C-3 一.2 加 ⓪ 级；实现见 resolveEntry）：
 *      ⓪ `provides.entry` —— **v1.3 新正典**（相对本成员根的模块路径；与 legacy 并存时新正典赢并 warn）。
 *      ① `requirements.exports['.']` —— **legacy 正典（迁移期回落位）**（doctor 仓把 `exports` 定为
 *         `requirements` 的必填键并逐条断言目标真实存在；顶层 `exports` 不在其
 *         `MANIFEST_TOP_KEYS` 白名单里）。套件根写法 `{"$from":"package.json#exports"}`
 *         按继承语义把表换成 `package.json#exports`。
 *      ② 顶层 `exports['.']` —— legacy 兼容位，命中必打 warn；与正典并存时正典赢并
 *         warn 指出忽略了哪一份重复声明。
 *      ③ `package.json` 的 `exports['.']` → `main`（宿主 Node 约定，T0/G1）。package.json
 *         同样是作者显式写的声明 ⇒ **★10 红线（批 6）已扩到本级**。
 *      ④ `index.js`/`index.mjs` 目录惯例 —— 仅当前四级都没有声明时才兜底。
 *      **任一显式声明（①②③）指向不存在的文件即报 entry-not-found，绝不静默回退**
 *      （manifest 与实现同步是红线；回退就是在掩盖）。找不到入口时报可执行 fix 文案
 *      （含 monorepo 根的插件子包候选指引）。
 *   3. 动态 import 入口；插件对象形态归一（default / 命名导出 / 函数）。
 *      选中 default 时按 mergeNamespaceStatics 保守补齐模块命名级静态面
 *      （name/inject/Config/…），避免"模块声明了依赖、cordis 没看到"（B2）
 *
 * legacy id 规则：包名（package.json name）否则入口文件名；不带命名空间时
 * 归一到 `legacy/<name>`，避免与契约 id 的 `<scope>/<name>` 冲突。
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { manifestHasContract, validateManifest, validateModuleExports } from 'dsh-toolkit/contract'
import type { DshSubPluginManifest, ManifestIssue, PluginSource } from 'dsh-toolkit/contract'
import type { EntrySource, PluginRegisters, ResolvedPlugin } from './types.js'

/**
 * 归一提取**提供面**：逐槽优先读新契约 `provides.{services,commands,providers,inject,tools}`（名单槽，
 * v1.3 扩槽补后两名），缺席才回落到旧 `requirements.registers.*`（回落属迁移期行为，正源在批 10 的数据落地）。
 * v1.3 扩槽（C-3 一.2）同族双读：`provides.inject`／`provides.tools` 优先，legacy
 * `requirements.registers.{inject,tools}` 回落。`requires.services` 是**纯依赖面**，不再被借用为
 * 提供面 —— 借用会让"共同依赖同一服务"的第二个插件被 `reg.name-collision` 误阻断
 * （契约 v1.1 的 P0-2 假阳性，实证见 docs/contract-v1.1-recon.md §7）。
 * tools 槽边界（C-3 一.2 原文随行）：宿主运行时装配面未证；本仓类型面无 tools 服务——
 * 本提取只承载**声明**，供注册冲突检查与体检对账，装配语义归宿主。
 */
export function extractRegisters(m: Record<string, unknown> | undefined): PluginRegisters | undefined {
  if (!m) return undefined
  const provides = m['provides'] as Record<string, unknown> | undefined
  const legacyRequirements = m['requirements'] as Record<string, unknown> | undefined
  const legacyRegisters = legacyRequirements?.['registers'] as Record<string, unknown> | undefined
  const pickSlot = function (slot: 'services' | 'commands' | 'providers' | 'inject' | 'tools'): string[] | undefined {
    const fromProvides = provides?.[slot]
    if (Array.isArray(fromProvides)) return fromProvides as string[]
    const fromLegacy = legacyRegisters?.[slot]
    return Array.isArray(fromLegacy) ? (fromLegacy as string[]) : undefined
  }
  const services = pickSlot('services')
  const commands = pickSlot('commands')
  const providers = pickSlot('providers')
  const inject = pickSlot('inject')
  const tools = pickSlot('tools')
  if (!services && !commands && !providers && !inject && !tools) return undefined
  return {
    ...(services ? { services } : {}),
    ...(commands ? { commands } : {}),
    ...(providers ? { providers } : {}),
    ...(inject ? { inject } : {}),
    ...(tools ? { tools } : {}),
  }
}

/**
 * ★2（契约 v1.1 批 3）：把**模块导出**携带的 `healthCheck` / `panels` 绑进 manifest，接通
 * "读方已在、写方从未存在"的半截消费链 —— 体检读的是 `manifest.healthCheck`
 * （`doctor/src/doctor.ts` 的 `inspectEntry`）、面板透传读的是 `entry.manifest.panels`
 * （`panel/manager/v2-api.mjs`），而此前没有任何一处把模块上的它们写进 manifest（contract.md §7 D-9）。
 *
 * 取值顺序：**先插件对象、再模块命名空间**。命名导出在 `export const healthCheck` 这种
 * default 对象形态下不会出现在 default 上（`mergeNamespaceStatics` 只补 `PLUGIN_STATIC_KEYS` 六键，
 * 不含这两个），只读插件对象就会重蹈"声明了却读不到"的同一个洞（B2 的教训形）。
 *
 * 优先级：`healthCheck` 只能是函数 ⇒ JSON 落盘那份恒缺席，绑定必然是补位；
 * `panels` 两处都在时**模块导出赢**（契约 v1.1 批 4 与 ★3 同族同向裁定，2026-09-22 批 3 验收令第二节），
 * 与 `configSchema` 同序、同一批实现。
 */
function bindRuntimeStatics(manifest: DshSubPluginManifest, pluginLike: unknown, modLike: unknown): void {
  const read = function (key: string): unknown {
    for (const src of [pluginLike, modLike]) {
      if (!src || typeof src !== 'object') continue
      const value = (src as Record<string, unknown>)[key]
      if (value !== undefined) return value
    }
    return undefined
  }
  if (manifest.healthCheck === undefined) {
    const runtimeHealthCheck = read('healthCheck')
    if (typeof runtimeHealthCheck === 'function') {
      manifest.healthCheck = runtimeHealthCheck as NonNullable<DshSubPluginManifest['healthCheck']>
    }
  }
  const runtimePanels = read('panels')
  if (runtimePanels !== undefined) {
    // ★panels 最小形状守卫（契约 v1.1 批 10；批 3 验收令遗留项）：模块绑定路径此前绕过
    // validateManifest，"数组 + 每项非空 id"承诺只在落盘清单一路成立——成员缺 id 被带病
    // 绑定、非数组被静默忽略（fail-open）。这里对**将被绑定的那个值**复用
    // validateModuleExports 的同一判据（"非空"与落盘清单同判：纯空白也拒），违例
    // fail-closed，与 manifest 校验失败同码 plugin-shape-invalid。
    const panelIssues = validateModuleExports({ panels: runtimePanels })
    if (panelIssues.length > 0) {
      const first = panelIssues[0]!
      throw new SourceError(
        'plugin-shape-invalid',
        `模块导出的 panels 未过最小形状守卫（数组 + 每项非空 id）：${first.path} ${first.message}`,
        panelIssues,
      )
    }
    manifest.panels = runtimePanels as NonNullable<DshSubPluginManifest['panels']>
  }
}

export class SourceError extends Error {
  readonly code: 'source-not-supported' | 'path-not-found' | 'entry-not-found' | 'module-load-failed' | 'plugin-shape-invalid'
  /** manifest 校验的逐条 issue（精确字段路径），供预检报告直接引用。 */
  issues?: ManifestIssue[] | undefined

  constructor(code: 'source-not-supported' | 'path-not-found' | 'entry-not-found' | 'module-load-failed' | 'plugin-shape-invalid', message: string, issues?: ManifestIssue[]) {
    super(message)
    this.code = code
    this.issues = issues
  }
}

function readJson(path: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

// manifestHasContract（契约面在判据）自 S3 收紧笔（甲'，2026-10-01）起从契约包 import——
// 与 validateManifest 的分层条件（LEGACY_ERROR_FIELDS 只对带契约面清单判双写 error）**同一份实现**。
// 原本两处各写一份逐字相同的判据：判据一旦漂移，"走契约分支校验的清单集合"与"error 档生效的清单集合"
// 就会各管各的，甲'的分层语义即静默分叉。

/**
 * 读 package.json `exports` 里 `"."` 的**声明值**（不判存在性）：裸字符串、映射里的字符串、
 * 或 `{".":{default|node}}` 对象形态。都没有 ⇒ undefined（= 本级没声明入口，可继续往下兜底）。
 * 只有一种情形刻意算"没声明"：对象形态里既无 default 也无 node（例如只有 types）——今天就不产出入口。
 */
function pkgDotDeclaration(exportsField: unknown): string | undefined {
  if (typeof exportsField === 'string') return exportsField !== '' ? exportsField : undefined
  if (!exportsField || typeof exportsField !== 'object' || Array.isArray(exportsField)) return undefined
  let dot: unknown = (exportsField as Record<string, unknown>)['.']
  if (typeof dot === 'string') return dot !== '' ? dot : undefined
  if (dot && typeof dot === 'object' && !Array.isArray(dot)) {
    const rec = dot as Record<string, unknown>
    for (const key of ['default', 'node'] as const) {
      const v = rec[key]
      if (typeof v === 'string' && v !== '') return v
    }
  }
  return undefined
}

/** package.json 的 exports['.'] 目标解析（字符串形态 + 对象形态 default/node）。返回存在的文件路径。 */
function resolvePkgExportsTarget(dir: string, exportsField: unknown): string | undefined {
  const dot = pkgDotDeclaration(exportsField)
  if (dot === undefined) return undefined
  const p = join(dir, dot)
  return existsSync(p) ? p : undefined
}

/** 子包是否可直接解析出入口（monorepo 候选判定用；不做递归）。 */
function hasDirectEntry(sub: string): boolean {
  const pkg = readJson(join(sub, 'package.json'))
  if (pkg) {
    if (resolvePkgExportsTarget(sub, pkg['exports']) !== undefined) return true
    const main = pkg['main']
    if (typeof main === 'string' && existsSync(join(sub, main))) return true
  }
  return existsSync(join(sub, 'index.js')) || existsSync(join(sub, 'index.mjs'))
}

/**
 * entry-not-found 的可执行 fix 文案（T0 裁决：写清"找到了什么、缺什么、补哪个字段、
 * 长什么样"，不许只列尝试过的位置）。monorepo 根是高频踩坑：扫 packages/* 给出
 * 可直接改装的插件子包候选（只读，最多扫 8 个）。
 */
function entryNotFoundMessage(dir: string): string {
  const parts: string[] = []
  const pkg = readJson(join(dir, 'package.json'))
  if (pkg) {
    const mainNote = typeof pkg['main'] === 'string' ? `main="${String(pkg['main'])}" 指向的文件不存在` : '没有 main 字段'
    parts.push(`已读取 package.json（name=${typeof pkg['name'] === 'string' ? pkg['name'] : '（缺 name）'}），但缺可加载入口：exports 不含 "." 映射、${mainNote}，目录下也没有 index.js/index.mjs`)
  } else {
    parts.push('该目录没有 dsh.plugin.json，也没有 package.json 和 index.js/index.mjs 入口文件')
  }
  const candidates: string[] = []
  try {
    const subs = readdirSync(join(dir, 'packages'), { withFileTypes: true })
      .filter((d) => d.isDirectory()).map((d) => d.name).slice(0, 8)
    for (const name of subs) {
      const sub = join(dir, 'packages', name)
      if (hasDirectEntry(sub)) candidates.push(`${sub}（name=${String(readJson(join(sub, 'package.json'))?.['name'] ?? name)}）`)
    }
  } catch { /* 无 packages/ 目录：非 monorepo，跳过候选提示 */ }
  if (candidates.length > 0) {
    parts.push(`该目录像是 monorepo 根（插件本体在子包里），含可加载入口的子包：${candidates.join('；')}——请改装其中的 DSH 插件子包`)
  }
  parts.push('修复二选一：① 改装上面列出的插件子包目录；② 若本目录本身就是插件，在 package.json 补入口字段并保存后重试，例如 "main": "dist/index.js" 或 "exports": { ".": "./dist/index.js" }（指向已构建的入口文件）')
  return parts.join('。') + '。'
}

/**
 * 入口解析结果（D-7 裁定：来源必须可观测，legacy 位置与重复声明要能带出 warn）。
 */
interface EntryResolution {
  path: string
  source: EntrySource
  warnings: string[]
}

/** 读一张 exports 表里的 `"."` 字符串声明；没有或非字符串则 undefined。 */
function dotDeclaration(exportsField: unknown): string | undefined {
  if (!exportsField || typeof exportsField !== 'object' || Array.isArray(exportsField)) return undefined
  const dot = (exportsField as Record<string, unknown>)['.']
  return typeof dot === 'string' && dot !== '' ? dot : undefined
}

/** 套件根的继承指针形态：`{ "$from": "package.json#exports" }`（doctor 只允许套件根这么写）。 */
function isExportsMacro(exportsField: unknown): boolean {
  return !!exportsField && typeof exportsField === 'object' && !Array.isArray(exportsField)
    && (exportsField as Record<string, unknown>)['$from'] === 'package.json#exports'
}

/** 同表还声明了别的子路径时，把整张表列进报错文案（只复述 manifest，不去 import 猜形状）。 */
function declaredExportsHint(manifest: Record<string, unknown> | undefined, baseDir: string): string | undefined {
  const requirements = manifest?.['requirements'] as Record<string, unknown> | undefined
  const rawTable = requirements?.['exports']
  if (!rawTable || typeof rawTable !== 'object' || Array.isArray(rawTable) || isExportsMacro(rawTable)) return undefined
  const table = rawTable as Record<string, unknown>
  const keys = Object.keys(table).filter((k) => k !== '$from')
  if (keys.length <= 1) return undefined
  const listing = keys.map((k) => `'${k}' → ${join(baseDir, String(table[k]))}`).join('；')
  return `同一张 requirements.exports 表还声明了 ${keys.length} 条：${listing}。本次按 "." 解析到的模块不是插件形态；`
    + `若插件入口是其中某个子路径，请直接改装该文件路径（manifest 声明为准，装载器不代为挑选）`
}

/**
 * 入口解析（D-7 裁定 2026-09-21，顺序与 loader.ts 头注、add-sub-plugin.md §1 同源；
 * 契约 v1.3 扩槽 C-3 一.2 在最前加 ⓪ 级）：
 *   ⓪ provides.entry（**v1.3 新正典**，相对本成员根的模块路径字符串；与 legacy 并存时它赢并 warn）
 *   ① requirements.exports['.']（legacy 正典＝迁移期回落位；$from 则按继承语义换成 package.json#exports 的表）
 *   ② 顶层 exports['.']（legacy 兼容位，命中打 warn；与正典并存时正典赢并 warn）
 *   ③ package.json 的 exports['.'] → main（宿主 Node 约定，T0/G1）
 *   ④ index.js / index.mjs 目录惯例（前面各级都没有声明时才兜底）
 *
 * 红线：⓪①②③ 这类**显式声明**指向不存在的文件 ⇒ 直接 entry-not-found 并给出该绝对路径，
 * 绝不静默回退到后面的顺位（回退就是拿惯例掩盖 manifest 与实现不同步）。
 */
function resolveEntry(dir: string, manifest: Record<string, unknown> | undefined): EntryResolution {
  const warnings: string[] = []
  const pkg = readJson(join(dir, 'package.json'))
  // ⓪ v1.3 新正典（C-3 一.2 扩槽）：provides.entry —— 最高优先。
  const provides = manifest?.['provides'] as Record<string, unknown> | undefined
  const providesEntry = provides?.['entry']
  const requirements = manifest?.['requirements'] as Record<string, unknown> | undefined
  const canonicalTable = requirements?.['exports']
  const inheritsFromPkg = isExportsMacro(canonicalTable)
  const effectiveCanonicalTable = inheritsFromPkg ? pkg?.['exports'] : canonicalTable
  const canonicalDot = dotDeclaration(effectiveCanonicalTable)
  const legacyDot = dotDeclaration(manifest?.['exports'])

  if (typeof providesEntry === 'string' && providesEntry.trim() !== '') {
    const p = join(dir, providesEntry)
    if (!existsSync(p)) {
      throw new SourceError('entry-not-found', declaredMissingMessage(
        'v1.3 正典位置 provides.entry', providesEntry, p, dir, manifest,
        `provides.entry="${providesEntry}"`,
      ))
    }
    // 双声明并存一律可见（legacy 两份都点名）：静默忽略等于把"哪一份生效"留给读者猜。
    const ignored: string[] = []
    if (canonicalDot !== undefined) ignored.push(`requirements.exports['.']="${canonicalDot}"`)
    if (legacyDot !== undefined) ignored.push(`顶层 exports['.']="${legacyDot}"`)
    if (ignored.length > 0) {
      warnings.push(
        `双声明并存：入口按 v1.3 正典 provides.entry="${providesEntry}" 解析，已忽略 legacy ${ignored.join('、')}`
        + '（迁移期请删掉 legacy 那一份；两套同时在场时，改其一而忘改其二即声明与实装分叉）',
      )
    }
    return { path: p, source: 'manifest.provides.entry', warnings }
  }

  if (inheritsFromPkg && canonicalDot === undefined && pkg?.['exports'] !== undefined) {
    warnings.push(
      'requirements.exports 用 {"$from":"package.json#exports"} 继承指针，但 package.json 的 exports 里没有 "." 映射；'
      + '已按后续顺位解析（套件根应当让 "." 指到真实入口）',
    )
  }

  // ① 正典
  if (canonicalDot !== undefined) {
    const p = join(dir, canonicalDot)
    if (!existsSync(p)) {
      throw new SourceError('entry-not-found', declaredMissingMessage(
        '正典位置 requirements.exports', canonicalDot, p, dir, manifest,
      ))
    }
    if (legacyDot !== undefined) {
      warnings.push(
        `双声明并存：入口按正典 requirements.exports['.']="${canonicalDot}" 解析，`
        + `已忽略顶层重复声明 exports['.']="${legacyDot}"。顶层 exports 不在 doctor 的清单根字段白名单里`
        + '（写了会被判 `清单根字段非法: exports`），请删掉它',
      )
    }
    return {
      path: p,
      source: inheritsFromPkg ? 'manifest.requirements.exports($from)' : 'manifest.requirements.exports',
      warnings,
    }
  }

  // ② legacy 顶层声明
  if (legacyDot !== undefined) {
    const p = join(dir, legacyDot)
    if (!existsSync(p)) {
      throw new SourceError('entry-not-found', declaredMissingMessage(
        'legacy 位置（顶层）exports', legacyDot, p, dir, manifest,
      ))
    }
    warnings.push(
      `入口取自 legacy 位置：顶层 exports['.']="${legacyDot}"。声明入口的正典位置是`
      + ` requirements.exports['.']（顶层 exports 不在 doctor 的清单根字段白名单里），请把该声明迁入`
      + ` requirements.exports 后删除顶层那一份`,
    )
    return { path: p, source: 'manifest.exports(legacy)', warnings }
  }

  // ③ 宿主 Node 约定（T0/G1：裸字符串、映射里的字符串、{".":{default|node}} 三种形态都收）
  // ★10 红线扩到本级（批 6）：package.json 同样是作者显式写的声明 ⇒ 声明了却指向不存在的文件
  // 就报 entry-not-found，**不静默落到 ④ 目录惯例**（回退即拿惯例掩盖声明与实现不同步）。
  // 只有"本级确实没声明"才继续兜底：exports 表里没有 "." 键、对象形态只带 types、或没有 package.json。
  const pkgExportsDot = pkgDotDeclaration(pkg?.['exports'])
  if (pkgExportsDot !== undefined) {
    const p = join(dir, pkgExportsDot)
    if (!existsSync(p)) throw new SourceError('entry-not-found', pkgDeclaredMissingMessage('exports["."]', pkgExportsDot, p, dir))
    return { path: p, source: 'package.json#exports', warnings }
  }
  const main = pkg?.['main']
  if (typeof main === 'string' && main !== '') {
    const p = join(dir, main)
    if (!existsSync(p)) throw new SourceError('entry-not-found', pkgDeclaredMissingMessage('main', main, p, dir))
    return { path: p, source: 'package.json#main', warnings }
  }

  // ④ 目录惯例兜底（仅当上面各级都没有声明/都没有命中）
  for (const name of ['index.js', 'index.mjs']) {
    const p = join(dir, name)
    if (existsSync(p)) return { path: p, source: 'index-convention', warnings }
  }
  throw new SourceError('entry-not-found', `未找到插件入口：${entryNotFoundMessage(dir)}`)
}

/** 显式声明（正典或 legacy）指向不存在文件时的可执行文案：给绝对路径 + 同表其他声明。 */
function declaredMissingMessage(
  positionLabel: string,
  dot: string,
  absPath: string,
  dir: string,
  manifest: Record<string, unknown> | undefined,
  /** 声明形态的可读渲染；缺省按 exports 表的 `位置['.']="值"` 形。v1.3 的 provides.entry 是单值槽，不是表项。 */
  declarationLabel?: string,
): string {
  const parts = [
    `manifest 声明了入口却指向不存在的文件：${declarationLabel ?? `${positionLabel}['.']="${dot}"`} → ${absPath}（该文件不存在）`,
    'manifest 与实现必须同步，装载器**不会**回退到 package.json 或 index.js 惯例去猜一个能用的入口',
  ]
  const requirements = manifest?.['requirements'] as Record<string, unknown> | undefined
  const table = requirements?.['exports']
  if (table && typeof table === 'object' && !Array.isArray(table) && !isExportsMacro(table)) {
    const others = Object.keys(table).filter((k) => k !== '$from')
    parts.push(`该 requirements.exports 表声明的键：${others.map((k) => `'${k}'`).join('、')}`)
  }
  parts.push(`修复：把 "${dot}" 指向 ${dir} 下真实存在的入口文件，或改正拼写后重装`)
  return `${parts.join('。')}。`
}

/** ③ 级（package.json）显式声明指向不存在文件时的文案：与 ①② 同构，但不涉及 manifest 表。 */
function pkgDeclaredMissingMessage(field: string, value: string, absPath: string, dir: string): string {
  const parts = [
    `package.json 声明了入口却指向不存在的文件：${field}="${value}" → ${absPath}（该文件不存在）`,
    '声明与实现必须同步，装载器**不会**回退到 index.js/index.mjs 目录惯例去猜一个能用的入口',
    `修复：把 package.json 的 ${field} 指向 ${dir} 下真实存在的入口文件（本体未构建请先构建），或改正拼写后重装`,
  ]
  return `${parts.join('。')}。`
}

/**
 * cordis 与 toolkit 都会从插件对象上读取的静态面：
 * `name`/`inject`/`Config`/`provide`/`intercept` 来自 cordis 的 `Plugin.Base`
 * （registry.ts），`configSchema` 是本仓 manifest/registry/doctor 三处的消费键。
 */
const PLUGIN_STATIC_KEYS = ['name', 'inject', 'Config', 'configSchema', 'provide', 'intercept'] as const

/**
 * 保守合并（B2）：当 `mod.default` 被选中为插件对象时，把**模块命名空间上声明了、
 * 而 default 自身没有声明**的静态面补到 default 上；default 自身已有的属性一律不覆盖。
 *
 * 为什么需要：cordis 从插件对象本身读 `plugin.inject` / `plugin.name` / `plugin.Config`
 * （registry.ts 的 `Inject.resolve(plugin.inject)` 与 runtime.name）。原先直接返回
 * `mod.default` 会把兄弟命名导出（`export const inject` / `export const name`）整批丢掉，
 * 于是"模块声明了依赖、cordis 却没看到"——装载门控静默失效。
 *
 * `name` 是唯一需要额外规则的一个：函数/类的 `name` 是 JS 推断出的标识符
 * （`class RouterCompactionEngine` → `'RouterCompactionEngine'`），不是插件级的显示名
 * 声明，cordis 自己也按这个前提办（`if (name === 'apply') name = undefined`）。所以模块级
 * `export const name` 应当优先于推断名；对象的 own `name` 则是有意声明，不覆盖。
 *
 * 语义边界（H3 / 债务 D-12 已对照完毕，原文的"无法对照"前提作废）：宿主装载器
 * `@deepseek-ai/cordis-plugin-loader@1.0.3` 的 `unwrapExports` 是**纯替换**
 * （`exports.default ?? exports`，两跳，见其 `lib/index.js:745-751`），命名导出的元数据
 * 不在它手上处理。也就是说本函数比宿主装载器**更宽**——这是有意的兜底（第三方插件常把
 * `inject` 写成模块级命名导出，纯替换会让 cordis 读不到依赖门控）。
 * 但**本仓内置入口不再依赖这份宽度**：三个曾因此分叉的入口已把元数据自带到 default 上
 * （compact-router 的 `static name`、agent-memory 的 `{name, apply}` default、
 * web-search-local 的 `Config`——该件已随开源 S1 剔除批出包），两通道逐字一致由 `test/dual-channel-parity.test.mjs` 钉住。
 *
 * 一处必须知道的副作用：合并是**就地改写**插件对象（函数/类的 `name` 只能通过
 * `defineProperty` 换），作用在模块里那个对象本身，不是副本。所以同一模块对象一旦被本
 * 通道解析过，之后哪怕走宿主那条纯替换路径，读到的也是改写后的名字（内置入口因 H3 两边
 * 同名而不受影响；第三方插件的这条性质由上面的守卫用例顺序注释兜住）。
 */
function mergeNamespaceStatics(def: object, ns: Record<string, unknown>): void {
  const isFn = typeof def === 'function'
  for (const key of PLUGIN_STATIC_KEYS) {
    const fromNs = ns[key]
    if (fromNs === undefined) continue
    const inferredFunctionName = key === 'name' && isFn
    if (!inferredFunctionName && Object.prototype.hasOwnProperty.call(def, key)) continue
    if (inferredFunctionName) {
      if (typeof fromNs !== 'string' || fromNs === '') continue
      if ((def as { name: string }).name === fromNs) continue
      // 函数/类的 name 是 [[ writable: false, configurable: true ]]，只能 defineProperty。
      try {
        Object.defineProperty(def, 'name', { value: fromNs, configurable: true, writable: false, enumerable: false })
      } catch {
        /* 不可扩展/不可重定义：放弃改名，装载本身不受影响 */
      }
      continue
    }
    try {
      ;(def as Record<string, unknown>)[key] = fromNs
    } catch {
      /* default 被冻结：保留原样，不改写别人的模块导出 */
    }
  }
}

/** 归一插件对象：接受 default 导出、命名导出集合、函数形态。 */
function normalizePlugin(mod: unknown, entryPath: string, shapeHint?: string): unknown {
  if (typeof mod === 'function') return mod
  if (mod && typeof mod === 'object') {
    const rec = mod as Record<string, unknown>
    const def = rec['default']
    if (def && (typeof def === 'object' || typeof def === 'function')) {
      const d = def as Record<string, unknown>
      if (typeof d['apply'] === 'function' || typeof def === 'function') {
        mergeNamespaceStatics(def as object, rec)
        return def
      }
    }
    if (typeof rec['apply'] === 'function' || typeof rec['register'] === 'function' || typeof rec['configSchema'] === 'object') {
      return mod
    }
  }
  throw new SourceError('plugin-shape-invalid', `${entryPath} 未导出可识别的插件形态（default/apply/register）${shapeHint ? `。${shapeHint}` : ''}`)
}

function synthLegacyManifest(dir: string, entryPath: string, mod: unknown, source: PluginSource): DshSubPluginManifest {  const pkg = readJson(join(dir, 'package.json'))
  const rawName = typeof pkg?.['name'] === 'string' && pkg['name'] !== ''
    ? pkg['name']
    : entryPath.replace(/\\/g, '/').split('/').pop()!.replace(/\.(js|mjs)$/, '')
  const id = rawName.includes('/') ? rawName : `legacy/${rawName}`
  const rec = (mod && typeof mod === 'object' ? mod : {}) as Record<string, unknown>
  const configSchema = rec['Config'] ?? rec['configSchema']
  return {
    id,
    displayName: typeof pkg?.['description'] === 'string' && pkg['description'] !== '' ? pkg['description'] : rawName,
    version: typeof pkg?.['version'] === 'string' ? pkg['version'] : '0.0.0',
    contract: '^1.0',
    requires: {},
    ...(configSchema !== undefined && (typeof configSchema === 'object' || typeof configSchema === 'function') ? { configSchema } : {}),
  } as DshSubPluginManifest
}

/**
 * 解析本地来源。目录或入口文件路径均可（相对路径按 cwd 解析）。
 * 抛 SourceError（code 可供面板与 doctor 呈现）；不做任何针对特定插件的特判（Q1 裁决）。
 */
export async function resolveLocalSource(input: PluginSource): Promise<ResolvedPlugin> {
  if (input.kind === 'npm') {
    throw new SourceError('source-not-supported', 'npm 来源在 P2 尚未实现（Q1 裁决：仅本地路径；追加须为纯增量）')
  }
  if (input.kind !== 'local' || typeof input.path !== 'string' || input.path.trim() === '') {
    throw new SourceError('path-not-found', '非法来源：local 来源需要非空 path')
  }
  let p = isAbsolute(input.path) ? resolve(input.path) : resolve(process.cwd(), input.path)
  if (!existsSync(p)) {
    throw new SourceError('path-not-found', `路径不存在：${p}。请填插件目录或入口文件的绝对路径（如 D:\\plugins\\my-plugin 或 D:\\plugins\\my-plugin\\dist\\index.js）；相对路径会按服务进程的工作目录解析，极易指错位置`)
  }
  const isFile = /\.(js|mjs)$/.test(p)
  const baseDir = isFile ? dirname(p) : p
  const manifestPath = join(baseDir, 'dsh.plugin.json')
  const manifestRaw = readJson(manifestPath)
  // 来源直接给文件路径时不经解析顺位（显式即显式）；目录才走 resolveEntry。
  const resolvedEntry = isFile ? undefined : resolveEntry(baseDir, manifestRaw)
  const entryPath = isFile ? p : resolvedEntry!.path
  const entrySource: EntrySource = isFile ? 'explicit-file' : resolvedEntry!.source
  const entryWarnings = resolvedEntry?.warnings ?? []

  let mod: unknown
  try {
    mod = await import(pathToFileURL(entryPath).href)
  } catch (error) {
    throw new SourceError('module-load-failed', `入口加载失败 ${entryPath}：${String((error as Error)?.message ?? error)}`)
  }
  const plugin = normalizePlugin(mod, entryPath, declaredExportsHint(manifestRaw, baseDir))

  if (manifestRaw && manifestHasContract(manifestRaw)) {
    const result = validateManifest(manifestRaw)
    if (!result.ok) {
      const first = result.errors[0]!
      throw new SourceError('plugin-shape-invalid', `manifest 校验失败 ${manifestPath}:${first.path} ${first.message}`, result.errors)
    }
    // ★3（契约 v1.1 批 4）：configSchema **模块导出赢**——两处都在时用模块那份覆盖落盘那份。
    // 此前是反的（manifest 有值即不采纳模块值），令 contract.md §5 的承诺句长期失真（D-12），
    // 可观测后果：web-search-local 生效的是 manifest 的 1 键 schema，不是模块 14 键 Config。
    // （历史例；该件已随开源 S1 剔除批出包，口径由 test/config-schema-degradation.test.mjs 沿用。）
    // Config / configSchema 都在 PLUGIN_STATIC_KEYS 六键内 ⇒ default 形态下已由
    // mergeNamespaceStatics 补到插件对象上，故这里读 rec 就够，不需要命名空间回退。
    const rec = (plugin && typeof plugin === 'object' ? plugin : {}) as Record<string, unknown>
    const runtimeSchema = rec['Config'] ?? rec['configSchema']
    const manifest = result.manifest
    if (runtimeSchema !== undefined) {
      manifest.configSchema = runtimeSchema as typeof manifest.configSchema
    }
    bindRuntimeStatics(manifest, rec, mod)
    return { manifest, plugin, legacy: false, source: input, entryPath, entrySource, entryWarnings, registers: extractRegisters(manifestRaw) }
  }

  // D-15 显式闸（C1-007 S2 批裁定重建，2026-10-01）：面板是装配现场（REQ-8），装载它等于让它
  // 自己装自己 ⇒ 不经 registry 通道装载面板目录。G4 前本闸由偶然机制兜住——panel/package.json#name
  // 的 "@scope" 使 legacy 合成 id 非法而拒绝；包名去 scope 后合成 id 合法 ⇒ 偶然闸失效，显式判据
  // 接管：manifest 在场、缺非空 `contract` 字段（即必然落 legacy 合成）、且 manifest name 以
  // "/panel" 收尾 ⇒ 拒绝。判据刻意收窄在 legacy 容忍面内：契约形态（有 contract）的面板类插件走
  // 上方正典分支，完全不受影响。
  if (manifestRaw && !manifestHasContract(manifestRaw)) {
    const mName = (manifestRaw as Record<string, unknown>)['name']
    if (typeof mName === 'string' && mName.endsWith('/panel')) {
      throw new SourceError(
        'plugin-shape-invalid',
        `插件入口可用，但 ${manifestPath} **缺非空 \`contract\` 字段**（manifestHasContract 判据：字符串且非空），`
          + `且 manifest name "${mName}" 以 /panel 收尾＝面板装配现场（REQ-8）：装载它等于让它自己装自己，`
          + `不经 registry 通道装载（D-15 显式闸；G4 去 scope 后原偶然闸失效，本闸为显式重建）。`
          + `修法：面板经宿主 bundle/patch 行或 file:// 直挂装载（见 README），勿经 registry 安装面板目录`,
      )
    }
  }

  const legacyManifest = synthLegacyManifest(baseDir, entryPath, plugin, input)
  // legacy 也必须通过 id/命名空间等基础校验（合成的不好使就是我们的 bug）。
  const check = validateManifest(legacyManifest)
  if (!check.ok) {
    const first = check.errors[0]!
    // D-15：文案必须指对**真实成因**。修复前这里一律报"legacy 合成 manifest 校验失败：<id 格式>"，
    // 而缺口其实在别处——目录里那份 dsh.plugin.json 没有 `contract` 字段（或为空），装载器才
    // 落进 legacy 合成分支，随后拿包名当 id 被命名空间式规则拒绝（`@scope/name` 里的 `@` 不合法）。
    // 典型现场：装载本仓 panel/ 目录（它有 manifest，但 manifestVersion 形态无 contract）。
    const pkgName = (readJson(join(baseDir, 'package.json')) as Record<string, unknown> | undefined)?.['name']
    const cause = manifestRaw
      ? `原因不是"legacy 形态"，而是 ${manifestPath} **缺非空 \`contract\` 字段**（`
        + `manifestHasContract 判据：字符串且非空），装载器因此按 legacy 合成 id`
      : `原因：${baseDir} 没有 dsh.plugin.json，装载器按 legacy 合成 id`
    throw new SourceError(
      'plugin-shape-invalid',
      `插件入口可用，但 manifest 无法成形：${cause}。`
        + `合成 id 取自 ${typeof pkgName === 'string' && pkgName !== '' ? `package.json#name="${pkgName}"` : '入口文件名'}，`
        + `未过契约校验（${first.path}：${first.message}）。`
        + `修法：给 dsh.plugin.json 补 "contract": "^1.0"（推荐），或改 package.json#name / 显式声明 id 为 <scope>/<name> 形式`,
      check.errors,
    )
  }
  // legacy 分支同样绑定：D-9 那句"作者按文档写了不会跑"对 legacy 作者一样成立，
  // 只修契约分支等于把同一个半截设计留给无 contract 字段的清单（本仓 panel/ 就是活例）。
  bindRuntimeStatics(check.manifest, plugin, mod)
  return { manifest: check.manifest, plugin, legacy: true, source: input, entryPath, entrySource, entryWarnings, registers: extractRegisters(manifestRaw) }
}
