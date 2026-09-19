/**
 * Registry 内部类型（P2，REQ-2/6/7）。对外契约类型一律从 contract 模块引用。
 */

import type { Context } from '@deepseek-ai/cordis'
import type {
  DshSubPluginManifest,
  PluginEntry,
  PluginSource,
  PluginStatus,
  PrecheckReport,
} from '@local/dsh-toolkit/contract'

/** cordis fiber 句柄（ctx.plugin() 的返回值，spike 已验证：thenable + dispose + state）。 */
export interface FiberLike {
  state: number
  dispose(): unknown
  await(): Promise<unknown>
}

export interface RegistryLogger {
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

export interface RegistryOptions {
  /** 服务/事件前缀（D5）。必填，由宿主（P6 根入口或测试）给定。 */
  servicePrefix: string
  /** 注册中心状态文件路径（安装记录/enabled/config/隔离原因/lastError）。 */
  statePath: string
  /** 重启后按记录自动恢复（REQ-7）。默认 true。 */
  autoload?: boolean
  /** 装入失败自动重试上限；达到上限进入 quarantined（REQ-6）。默认 3。 */
  retryLimit?: number
  /** 重试退避基数 ms（指数：base * 2^n）。默认 500。 */
  retryBackoffMs?: number
  /** 单次装入超时 ms（inject 服务缺席会永久 PENDING，超时判失败）。默认 30000。 */
  loadTimeoutMs?: number
  /** 状态写入防抖 ms（0 = 立即写）。默认 0。 */
  saveDebounceMs?: number
  /** 预检实现（P2 内置契约级预检；P3 doctor.precheck 注入替换）。 */
  precheck?: (source: PluginSource, resolved: ResolvedPlugin) => Promise<PrecheckReport>
  logger?: RegistryLogger
  timers?: Timers
}

/** 插件对外注册面（用于注册冲突检查；从 manifest 新旧两种形态归一提取）。 */
export interface PluginRegisters {
  services?: string[] | undefined
  commands?: string[] | undefined
  providers?: string[] | undefined
}

/** 解析来源得到的模块与 manifest（legacy 已合成）。 */
export interface ResolvedPlugin {
  manifest: DshSubPluginManifest
  plugin: unknown
  /** 无 manifest 的普通 DSH 插件经适配器包装（REQ-2）。 */
  legacy: boolean
  /** 来源记录（持久化用，重启后可重新 resolve）。 */
  source: PluginSource
  /** 实际入口说明（诊断用）。 */
  entryPath: string
  /** 注册面（P5 注册冲突检查用；legacy 从旧 manifest.requirements.registers 提取）。 */
  registers?: PluginRegisters | undefined
}

/** 持久化单插件记录。 */
export interface PersistedPlugin {
  source: PluginSource
  enabled: boolean
  config: unknown
  quarantined: boolean
  lastError?: { code: string; message: string; at: number }
}

export interface RegistryStateFile {
  schemaVersion: 1
  plugins: Record<string, PersistedPlugin>
}

/** 内部条目：契约 PluginEntry + 运行时句柄。 */
export interface RegistryEntry extends PluginEntry {
  source: PluginSource
  /** 解析得到的插件对象（原样传给 host.plugin，不改写——保持宿主语义）。 */
  pluginObject?: unknown | undefined
  /** 注册面（注册冲突检查用）。 */
  registers?: PluginRegisters | undefined
  fiber?: FiberLike | undefined
  /** 当前已尝试装入次数（含首次）；手动 enable/reload 时清零。 */
  retryAttempts?: number | undefined
  /** 正在进行中的重试句柄（卸载/重载时必须取消）。 */
  retryHandle?: unknown | undefined
}

export type StatusListener = (payload: {
  id: string
  from: PluginStatus
  to: PluginStatus
  reason?: string | undefined
  error?: { code: string; message: string } | undefined
}) => void

/**
 * registry 运行时需要宿主提供的最小能力面。
 * 生产宿主用 cordisHost() 适配真实 Context；测试可用同款适配（S4 用真实 cordis）。
 */
export interface HostContext {
  /** 派生 ctx 装入插件，返回 fiber 句柄（thenable + dispose + state）。 */
  plugin(p: unknown, config?: unknown): FiberLike
  /** 发射事件（registry 侧只发带前缀的契约事件名）。 */
  emit(event: string, ...args: unknown[]): unknown
  /** 注册对外服务（如 `${prefix}/registry`）。 */
  provideService(name: string, value: unknown): void
  /** 预检服务可用性探测（缺服务返回 false，不抛）。 */
  hasService(name: string): boolean
}

export type { Context }
