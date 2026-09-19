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
 *   2. 入口解析：manifest.exports['.'] → package.json main → index.{js,mjs}
 *   3. 动态 import 入口；插件对象形态归一（default / 命名导出 / 函数）
 *
 * legacy id 规则：包名（package.json name）否则入口文件名；不带命名空间时
 * 归一到 `legacy/<name>`，避免与契约 id 的 `<scope>/<name>` 冲突。
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { validateManifest } from '@local/dsh-toolkit/contract'
import type { DshSubPluginManifest, ManifestIssue, PluginSource } from '@local/dsh-toolkit/contract'
import type { ResolvedPlugin } from './types.js'

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

function resolveEntry(dir: string, manifest: Record<string, unknown> | undefined): string {
  const exportsMap = manifest?.['exports']
  if (exportsMap && typeof exportsMap === 'object' && !Array.isArray(exportsMap)) {
    const dot = (exportsMap as Record<string, unknown>)['.']
    if (typeof dot === 'string') {
      const p = join(dir, dot)
      if (existsSync(p)) return p
    }
  }
  const pkg = readJson(join(dir, 'package.json'))
  const main = pkg?.['main']
  if (typeof main === 'string') {
    const p = join(dir, main)
    if (existsSync(p)) return p
  }
  for (const name of ['index.js', 'index.mjs']) {
    const p = join(dir, name)
    if (existsSync(p)) return p
  }
  throw new SourceError('entry-not-found', `目录 ${dir} 下找不到插件入口（exports['.'] / package.json main / index.js）`)
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

function synthLegacyManifest(dir: string, entryPath: string, mod: unknown, source: PluginSource): DshSubPluginManifest {
  const pkg = readJson(join(dir, 'package.json'))
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
  if (!existsSync(p)) throw new SourceError('path-not-found', `路径不存在：${p}`)
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
    return { manifest, plugin, legacy: false, source: input, entryPath }
  }

  const legacyManifest = synthLegacyManifest(baseDir, entryPath, plugin, input)
  // legacy 也必须通过 id/命名空间等基础校验（合成的不好使就是我们的 bug）。
  const check = validateManifest(legacyManifest)
  if (!check.ok) {
    const first = check.errors[0]!
    throw new SourceError('plugin-shape-invalid', `legacy 合成 manifest 校验失败：${first.path} ${first.message}`, check.errors)
  }
  return { manifest: check.manifest, plugin, legacy: true, source: input, entryPath }
}
