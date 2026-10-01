/**
 * Doctor 内部类型（P3，REQ-3/4）。对外契约类型从 contract 引用。
 */

import type { DshSubPluginManifest, DoctorRule, HealthItem, HealthReport } from 'dsh-toolkit/contract'

export interface DoctorLogger {
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

export interface DoctorOptions {
  /** 服务/事件前缀（D5）。必填。 */
  servicePrefix: string
  /** 周期巡检间隔 ms；0 = 关闭（REQ-4）。默认 30000。 */
  watchInterval?: number
  /** 连续失败 N 次才降级（REQ-4）。默认 3。 */
  failureThreshold?: number
  /** 每插件保留最近 N 份报告（环形缓存）。默认 20。 */
  historySize?: number
  /** 单条规则执行超时 ms（REQ-3 只读带超时）。默认 5000。 */
  ruleTimeoutMs?: number
  /** manifest.healthCheck 执行超时 ms。默认 5000（REQ-4）。 */
  healthCheckTimeoutMs?: number
  /** 外部 API 可达性探测超时 ms（0 = 跳过探测）。默认 3000。 */
  probeTimeoutMs?: number
  logger?: DoctorLogger
  timers?: Timers
  /** 运行时探测面（缺省用内置探测：process.versions.node / env / PATH / net）。 */
  probes?: Probes
}

/** 环境探测面——测试可注入替身（S3 故障注入即替换/直接改真实环境）。 */
export interface Probes {
  /** 当前 node 版本，如 "22.11.0"。 */
  nodeVersion(): string
  /** 当前 DSH 运行时版本（读宿主包或 DSH 版本注入）。 */
  dshVersion(): string | undefined
  /** 环境变量是否存在且非空（只返回布尔，禁止返回值）。 */
  hasEnv(key: string): boolean
  /** 二进制是否可用（PATH 探测）。 */
  hasBinary(name: string): boolean
  /** 二进制版本探测（best-effort：`--version` 输出中的首个 semver；取不到返回 null）。 */
  binaryVersion(name: string): Promise<string | null>
  /** TCP 端口占用探测：true = 可绑定（未被占用）。 */
  portFree(port: number): Promise<boolean>
  /** 文件路径访问能力探测。 */
  fsAccessible(path: string, access: 'r' | 'rw'): Promise<boolean>
  /** 外部 API 可达性。 */
  apiReachable(url: string): Promise<boolean>
  /** cordis 服务可用性。 */
  hasService(name: string): boolean
}

/** 规则运行上下文（contract DoctorRuleContext 的运行时形态）。 */
export interface RuleRuntime {
  pluginId: string
  manifest: DshSubPluginManifest
  config: unknown
  /** 宿主派生 ctx（ DoctorRuleContext.ctx 对齐；进程内规则一般用不到）。 */
  ctx: unknown
  /** 服务可用性探测（由宿主注入）。 */
  hasService(name: string): boolean
}

export type { DoctorRule, HealthItem, HealthReport }

/** 规则执行结果（带来源标注）。 */
export interface RuleResult {
  ruleId: string
  items: HealthItem[]
  error?: Error
}
