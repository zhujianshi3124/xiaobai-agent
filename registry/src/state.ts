/**
 * 注册中心状态持久化（REQ-7）。原子写（tmp + rename）；读失败视为无状态
 * （返回空文件），由调用方记录告警——不允许持久化层把 toolkit 拖崩（D3）。
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { RegistryStateFile } from './types.js'

export const STATE_SCHEMA_VERSION: 1 = 1

export function emptyState(): RegistryStateFile {
  return { schemaVersion: STATE_SCHEMA_VERSION, plugins: {} }
}

export function loadState(statePath: string): { state: RegistryStateFile; error?: Error } {
  let raw: string
  try {
    raw = readFileSync(statePath, 'utf8')
  } catch {
    return { state: emptyState() }
  }
  try {
    const parsed = JSON.parse(raw) as RegistryStateFile
    if (!parsed || typeof parsed !== 'object' || parsed.schemaVersion !== 1 || typeof parsed.plugins !== 'object') {
      return { state: emptyState(), error: new Error('state file schema mismatch, starting empty') }
    }
    return { state: parsed }
  } catch (error) {
    return { state: emptyState(), error: error as Error }
  }
}

export function saveState(statePath: string, state: RegistryStateFile): void {
  const json = JSON.stringify(state, null, 2)
  const dir = dirname(statePath)
  mkdirSync(dir, { recursive: true })
  // NTFS 安全：tmp 文件名不含 ':'，rename 原子替换。
  const tmp = `${statePath}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, json, 'utf8')
  renameSync(tmp, statePath)
}
