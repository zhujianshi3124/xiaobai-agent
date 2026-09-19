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
 *   2. 入口解析：manifest.exports['.'] → package.json exports['.']（字符串或
 *      {".":{"default":…}} 对象形态，对齐宿主 Node 解析约定，T0/G1）→
 *      package.json main → index.{js,mjs}；找不到时报可执行 fix 文案
 *      （含 monorepo 根的插件子包候选指引）
 *   3. 动态 import 入口；插件对象形态归一（default / 命名导出 / 函数）
 *
 * legacy id 规则：包名（package.json name）否则入口文件名；不带命名空间时
 * 归一到 `legacy/<name>`，避免与契约 id 的 `<scope>/<name>` 冲突。
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { validateManifest } from '@local/dsh-toolkit/contract'
import type { DshSubPluginManifest, ManifestIssue, PluginSource } from '@local/dsh-toolkit/contract'
import type { PluginRegisters, ResolvedPlugin } from './types.js'

/** 归一提取注册面：新契约 requires.services + 旧 requirements.registers.{services,commands,providers}。 */
function extractRegisters(m: Record<string, unknown> | undefined): PluginRegisters | undefined {
  if (!m) return undefined
  const requires = m['requires'] as Record<string, unknown> | undefined
  const contractServices = Array.isArray(requires?.['services']) ? (requires!['services'] as string[]) : undefined
  const legacyRequirements = m['requirements'] as Record<string, unknown> | undefined
  const legacyRegisters = legacyRequirements?.['registers'] as Record<string, unknown> | undefined
  const legacyServices = legacyRegisters && Array.isArray(legacyRegisters['services']) ? (legacyRegisters['services'] as string[]) : undefined
  const commands = legacyRegisters && Array.isArray(legacyRegisters['commands']) ? (legacyRegisters['commands'] as string[]) : undefined
  const providers = legacyRegisters && Array.isArray(legacyRegisters['providers']) ? (legacyRegisters['providers'] as string[]) : undefined
  const services = contractServices ?? legacyServices
  if (!services && !commands && !providers) return undefined
  return {
    ...(services ? { services } : {}),
    ...(commands ? { commands } : {}),
    ...(providers ? { providers } : {}),
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

function manifestHasContract(m: Record<string, unknown>): boolean {
  return typeof m['contract'] === 'string' && m['contract'] !== ''
}

/** package.json 的 exports['.'] 目标解析（字符串形态 + 对象形态 default/node）。返回存在的文件路径。 */
function resolvePkgExportsTarget(dir: string, exportsField: unknown): string | undefined {
  let dot: unknown = exportsField
  if (exportsField && typeof exportsField === 'object' && !Array.isArray(exportsField)) {
    dot = (exportsField as Record<string, unknown>)['.']
    if (dot && typeof dot === 'object' && !Array.isArray(dot)) {
      const rec = dot as Record<string, unknown>
      let found: string | undefined
      for (const key of ['default', 'node'] as const) {
        const v = rec[key]
        if (typeof v === 'string' && v !== '') { found = v; break }
      }
      dot = found
    }
  }
  if (typeof dot !== 'string' || dot === '') return undefined
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

function resolveEntry(dir: string, manifest: Record<string, unknown> | undefined): string {
  // 1. dsh.plugin.json 的 exports['.']（契约 manifest 的显式声明，优先级最高）
  const exportsMap = manifest?.['exports']
  if (exportsMap && typeof exportsMap === 'object' && !Array.isArray(exportsMap)) {
    const dot = (exportsMap as Record<string, unknown>)['.']
    if (typeof dot === 'string') {
      const p = join(dir, dot)
      if (existsSync(p)) return p
    }
  }
  // 2. package.json（对齐宿主 Node 解析约定：exports['.'] → main；字符串与
  //    对象 {".":{"default":…}} 两种形态都收。本 loader 按文件路径 import，
  //    比"按包说明符 import"宽容：exports 存在但 '.' 未映射时仍依次尝试
  //    main 与 index——目标是宿主能装的我们也能装（G1 双向兼容）。
  const pkg = readJson(join(dir, 'package.json'))
  const fromExports = pkg ? resolvePkgExportsTarget(dir, pkg['exports']) : undefined
  if (fromExports) return fromExports
  const main = pkg?.['main']
  if (typeof main === 'string') {
    const p = join(dir, main)
    if (existsSync(p)) return p
  }
  for (const name of ['index.js', 'index.mjs']) {
    const p = join(dir, name)
    if (existsSync(p)) return p
  }
  throw new SourceError('entry-not-found', `未找到插件入口：${entryNotFoundMessage(dir)}`)
}

/** 归一插件对象：接受 default 导出、命名导出集合、函数形态。 */
function normalizePlugin(mod: unknown, entryPath: string): unknown {
  if (typeof mod === 'function') return mod
  if (mod && typeof mod === 'object') {
    const rec = mod as Record<string, unknown>
    const def = rec['default']
    if (def && (typeof def === 'object' || typeof def === 'function')) {
      const d = def as Record<string, unknown>
      if (typeof d['apply'] === 'function' || typeof def === 'function') return def
    }
    if (typeof rec['apply'] === 'function' || typeof rec['register'] === 'function' || typeof rec['configSchema'] === 'object') {
      return mod
    }
  }
  throw new SourceError('plugin-shape-invalid', `${entryPath} 未导出可识别的插件形态（default/apply/register）`)
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
  const entryPath = isFile ? p : resolveEntry(baseDir, manifestRaw)

  let mod: unknown
  try {
    mod = await import(pathToFileURL(entryPath).href)
  } catch (error) {
    throw new SourceError('module-load-failed', `入口加载失败 ${entryPath}：${String((error as Error)?.message ?? error)}`)
  }
  const plugin = normalizePlugin(mod, entryPath)

  if (manifestRaw && manifestHasContract(manifestRaw)) {
    const result = validateManifest(manifestRaw)
    if (!result.ok) {
      const first = result.errors[0]!
      throw new SourceError('plugin-shape-invalid', `manifest 校验失败 ${manifestPath}:${first.path} ${first.message}`, result.errors)
    }
    // configSchema 优先用模块导出（函数型 Schema 落不了盘）。
    const rec = (plugin && typeof plugin === 'object' ? plugin : {}) as Record<string, unknown>
    const runtimeSchema = rec['Config'] ?? rec['configSchema']
    const manifest = result.manifest
    if (runtimeSchema !== undefined && manifest.configSchema === undefined) {
      manifest.configSchema = runtimeSchema
    }
    return { manifest, plugin, legacy: false, source: input, entryPath, registers: extractRegisters(manifestRaw) }
  }

  const legacyManifest = synthLegacyManifest(baseDir, entryPath, plugin, input)
  // legacy 也必须通过 id/命名空间等基础校验（合成的不好使就是我们的 bug）。
  const check = validateManifest(legacyManifest)
  if (!check.ok) {
    const first = check.errors[0]!
    throw new SourceError('plugin-shape-invalid', `legacy 合成 manifest 校验失败：${first.path} ${first.message}`, check.errors)
  }
  return { manifest: check.manifest, plugin, legacy: true, source: input, entryPath, registers: extractRegisters(manifestRaw) }
}
