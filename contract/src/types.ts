/**
 * DSH Sub-Plugin Contract v1 —— 公共类型单一出口（REQ-1 / 规格 §4）。
 *
 * - 桶（宿主）与子插件使用同一份契约；嵌入场景（G4）不另造接口（D1）。
 * - 磁盘 manifest 是本类型的 JSON 子集；`configSchema` / `panels` / `healthCheck`
 *   属于模块运行时导出，JSON manifest 缺省它们是合法的（见 validate.ts 的绑定校验）。
 * - 与存量 `dsh.plugin.json`（manifestVersion:1）的关系：旧字段属于
 *   KNOWN_LEGACY_FIELDS（见 validate.ts），迁移期（REQ-9）内被容忍并标记。
 *
 * 本模块零依赖（不 import node 内建），可在任何 ≥ES2022 运行时使用。
 */

/** 契约版本，semver 管理；破坏性变更必须升主版本并提供适配层（规格 §8）。
 *  1.0.0 → 1.1.0（批 11，2026-09-26）：新增 `provides` 提供面与 events/panels 形状收紧，
 *  均为非破坏增量；旧 manifest 的 `^1.0` 范围继续放行（versionSatisfies 对偶已钉）。 */
export const PLUGIN_CONTRACT_VERSION = '1.1.0'

// ── manifest ──────────────────────────────────────────────────────────────

/** `requires.envVars[]`：只声明存在性，禁止在任何日志/报告中输出变量值（规格 §9）。 */
export interface ManifestEnvVar {
  key: string
  required: boolean
  describe?: string
  example?: string
}

export interface ManifestBinary {
  name: string
  minVersion?: string
  describe?: string
}

export interface ManifestPort {
  port: number
  protocol?: 'tcp' | 'udp'
  purpose?: string
  /** shared: true 表示可与其他组件共用，预检仅提示不阻断（REQ-3 §8）。 */
  shared?: boolean
}

export interface ManifestFsPath {
  path: string
  access: 'r' | 'rw'
  purpose?: string
}

export interface ManifestExternalApi {
  name: string
  url?: string
  /** 存放鉴权凭据的环境变量名；同样只声明名字，不出现值。 */
  authEnv?: string
}

export interface ManifestRequirements {
  /** DSH 运行时版本范围，如 ">=0.1.2-rc.1 <0.2.0"。 */
  dshRuntime?: string
  node?: string
  /**
   * 依赖的 cordis 服务名（**纯依赖面**）。它不桥接 cordis 的 `inject`（门控只认模块导出的 `inject`），
   * 也**不是提供面**——"本插件注册了什么"由 `provides` 承载（契约 v1.1；见 docs/contract.md §2.1 与
   * docs/contract-v1.1-recon.md §5 P0-2）。
   */
  services?: string[]
  /** 依赖的其他子插件 id（全局唯一 id，非路径）。 */
  subPlugins?: string[]
  envVars?: ManifestEnvVar[]
  binaries?: ManifestBinary[]
  ports?: ManifestPort[]
  fsPaths?: ManifestFsPath[]
  externalApis?: ManifestExternalApi[]
}

/**
 * 自定义面板片段描述符。挂载方式（组件约定/插槽）由 P4 按现有面板栈定夺，
 * P1 只固定最小结构：`id` 必填，其余为开放键值。
 */
export interface PanelDescriptor {
  id: string
  title?: string
  [key: string]: unknown
}

/** 自定义健康检查的执行上下文。ctx 为宿主派生 cordis ctx（结构由宿主侧收敛）。 */
export interface HealthCheckCtx {
  config: unknown
  ctx: unknown
}

/**
 * 子插件契约 manifest。字段语义见规格 §4；与规格的偏差（已裁决允许的微调）：
 * `requires` 整体可选（零需求的插件不必写空对象），其余字段名未变。
 */
/**
 * 提供面（契约 v1.1 新增，C-1 第 1 项；v1.3 扩槽，C-3/F-87）：本插件**注册进环境**的东西。
 * 与 `requires` 严格分向——`requires.services` 是"我要用的"，`provides.services` 是"我登记的"。
 * 事件的订阅面不在这里：它留在 legacy `requirements.registers.events`（2026-09-22 裁定采甲，
 * 本仓无事件发出方 ⇒ `provides` 不设 events 槽；见 docs/contract.md §2.1 末）。
 *
 * **v1.3 扩槽三面**（C-3 一.2 落码；迁移期 legacy 正典位继续回落，双读顺序见 loader）：
 * - `entry`：装载入口声明（相对本成员根的模块路径）——新正典位，替代 legacy
 *   `requirements.exports['.']`（D-7 追加的"."语义裁定随落）。
 * - `inject`：装载时注入宿主面名单——替代 legacy `requirements.registers.inject`。
 * - `tools`：本插件经宿主 tools 服务注册的工具名单（F-87）。边界随行（C-3 一.2 原文）：
 *   宿主运行时是否真把该 tool 装配进模型可见面**未证**；本仓 node_modules 类型面**没有**
 *   `tools` 服务（该面只在宿主 bundle、仓外）——manifest 只承载声明，装配语义归宿主。
 */
export interface ManifestProvides {
  services?: string[]
  commands?: string[]
  providers?: string[]
  entry?: string
  inject?: string[]
  tools?: string[]
}

export interface DshSubPluginManifest {
  /** 全局唯一，命名空间式 `<scope>/<name>`，如 `dsh/rate-throttle`。 */
  id: string
  displayName: string
  /** semver。 */
  version: string
  /** 兼容的契约版本范围，如 "^1.0"。 */
  contract: string
  requires?: ManifestRequirements
  /** 本插件的提供面（注册进环境的服务/命令/实现）。缺席 = 未申报提供面。 */
  provides?: ManifestProvides
  /** 沿用项目现有 Schema 体系（schemastery）；面板据此自动生成配置表单（REQ-5）。 */
  configSchema?: unknown
  panels?: PanelDescriptor[]
  healthCheck?: (c: HealthCheckCtx) => Promise<HealthItem[]>
}

// ── 健康 / 预检 ───────────────────────────────────────────────────────────

export type PluginStatus =
  | 'installed'
  | 'loading'
  | 'active'
  | 'error'
  | 'disabled'
  | 'quarantined'

export interface HealthItemFix {
  summary: string
  steps?: string[]
  docsUrl?: string
  autoFixId?: string
}

export interface HealthItem {
  code: string
  level: 'ok' | 'warn' | 'error'
  message: string
  fix?: HealthItemFix
}

export interface HealthReport {
  pluginId: string
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  checkedAt: number
  items: HealthItem[]
}

export interface PrecheckChange {
  target: 'manifest' | 'config' | 'env' | 'deps' | 'code'
  summary: string
  detail: string
}

export interface PrecheckReport {
  pass: boolean
  /** 不修复则拒绝安装。 */
  blocking: HealthItem[]
  /** 可继续但需提示。 */
  warnings: HealthItem[]
  /** 可执行修复指引：直接回答"缺什么环境、哪些地方要改"（REQ-3）。 */
  changes: PrecheckChange[]
  /** 被检插件是否为 legacy 包装。 */
  legacyMode: boolean
}

// ── 来源 / 注册中心 ───────────────────────────────────────────────────────

/**
 * 装入等待期间 fiber 状态机判定的错误码（公共枚举，供面板/doctor 按码分流）。
 * 与 cordis FiberState 的对应关系见 `registry.ts` 的 FIBER_* 常量与
 * `test/cordis-fiber-state.test.mjs`（编号守卫）。
 */
export const FIBER_LOAD_ERROR_CODES = [
  /** fiber 停在 FAILED：apply/配置校验抛错（错误原文经 fiber 的 rejection 取回时保留原文）。 */
  'fiber-failed',
  /** fiber 到达 DISPOSED：装入期间插件被外部卸载。 */
  'fiber-disposed',
  /** fiber 处于 UNLOADING 且直到超时都未收敛到终态：语义仍是"被卸载"，不是"装得太慢"。 */
  'fiber-unloading-timeout',
  /** fiber 长期 PENDING/ACTIVE 前的等待超时（典型成因：inject 的服务始终缺席）。 */
  'fiber-load-timeout',
] as const

export type FiberLoadErrorCode = (typeof FIBER_LOAD_ERROR_CODES)[number]

/**
 * 安装来源。Q1 裁决（2026-09-19）：P2 仅实现 `local`；`npm` 为预留判别分支，
 * 后续追加必须保持纯增量——不改本契约、不改 registry 主流程。
 */
export type PluginSource =
  | { kind: 'local'; path: string }
  | { kind: 'npm'; spec: string }

export interface PluginEntryLastError {
  code: string
  message: string
  at: number
}

export interface PluginEntry {
  manifest: DshSubPluginManifest
  status: PluginStatus
  config: unknown
  lastError?: PluginEntryLastError
  health?: HealthReport
  legacy: boolean
}

export interface InstallOk {
  ok: true
  entry: PluginEntry
}

export interface InstallBlocked {
  ok: false
  precheck: PrecheckReport
}

export type InstallResult = InstallOk | InstallBlocked

/**
 * 注册中心服务（服务名 `${servicePrefix}/registry`，见 naming.ts）。
 * 实现在 P2（REQ-2）；本契约只固定接口面。
 */
export interface ToolkitRegistry {
  list(): PluginEntry[]
  get(id: string): PluginEntry | undefined
  install(source: PluginSource, opts?: { force?: boolean }): Promise<InstallResult>
  uninstall(id: string): Promise<void>
  setEnabled(id: string, on: boolean): Promise<void>
  reload(id: string): Promise<void>
}

// ── Doctor ────────────────────────────────────────────────────────────────

export interface DoctorRuleContext {
  pluginId: string
  manifest?: DshSubPluginManifest
  config: unknown
  ctx: unknown
}

/** doctor 规则扩展点（REQ-4）：内置规则 / manifest 合成规则 / 第三方规则同构。 */
export interface DoctorRule {
  id: string
  description?: string
  check(c: DoctorRuleContext): Promise<HealthItem[]>
}

export interface InspectionReport {
  generatedAt: number
  reports: HealthReport[]
}

/**
 * Doctor 服务（服务名 `${servicePrefix}/doctor`，见 naming.ts）。
 * 实现在 P3（REQ-3/4）；本契约只固定接口面。
 */
export interface ToolkitDoctor {
  /** 安装前预检（只读、幂等、带超时）。 */
  precheck(source: PluginSource): Promise<PrecheckReport>
  /** 运行时检查；缺省全量。 */
  inspect(pluginId?: string): Promise<InspectionReport>
  /** 规则扩展点。 */
  registerRule(rule: DoctorRule): void
}

// ── 审计（REQ-10）─────────────────────────────────────────────────────────

export const AUDIT_EVENTS = [
  'installed',
  'removed',
  'enabled',
  'disabled',
  'reloaded',
  'quarantined',
  'config-changed',
  /**
   * 状态落盘失败（H1 / 债务 D-11 可见化）：内存里的条目生效了、磁盘上没有，
   * 重启即丢。此前这条只有一行 error 日志（面板仍显示 active，无人知晓不持久），
   * 现在升级为可发现面：随 `/v2/snapshot.durability.state` 呈现，面板如实标注未落盘。
   */
  'state-save-failed',
] as const

export type AuditEvent = (typeof AUDIT_EVENTS)[number]
