/**
 * DSH Sub-Plugin Contract v1 —— 唯一公共出口（D1 单一契约）。
 *
 * JS 侧（存量插件/面板）以 `import('@local/dsh-toolkit/contract')` 引用；
 * 类型从本模块的 .d.ts 获取（JSDoc `@type {import('@local/dsh-toolkit/contract').DshSubPluginManifest}`）。
 * 禁止在其他位置复制契约类型定义。
 */

export { PLUGIN_CONTRACT_VERSION } from './types.js'
export type {
  ManifestEnvVar,
  ManifestBinary,
  ManifestPort,
  ManifestFsPath,
  ManifestExternalApi,
  ManifestRequirements,
  PanelDescriptor,
  HealthCheckCtx,
  DshSubPluginManifest,
  PluginStatus,
  FiberLoadErrorCode,
  HealthItemFix,
  HealthItem,
  HealthReport,
  PrecheckChange,
  PrecheckReport,
  PluginSource,
  PluginEntryLastError,
  PluginEntry,
  InstallOk,
  InstallBlocked,
  InstallResult,
  ToolkitRegistry,
  DoctorRuleContext,
  DoctorRule,
  InspectionReport,
  ToolkitDoctor,
  AuditEvent,
} from './types.js'
export { AUDIT_EVENTS, FIBER_LOAD_ERROR_CODES } from './types.js'

export type { Semver } from './semver.js'
export {
  parseSemver,
  isValidSemver,
  compareSemver,
  versionSatisfies,
  parseRange,
  isValidRange,
} from './semver.js'

export type { ManifestIssue, IssueSeverity, ManifestValidation } from './validate.js'
export { validateManifest, validateModuleExports, KNOWN_LEGACY_FIELDS } from './validate.js'

export type { ConfigSchemaIssue, ConfigSchemaResult } from './config-schema.js'
export { validateConfigAgainstSchema } from './config-schema.js'

export type { ContractEventName, ContractServiceName } from './naming.js'
export {
  CONTRACT_EVENT_NAMES,
  DEFAULT_SERVICE_PREFIX,
  isValidServicePrefix,
  normalizeServicePrefix,
  contractServiceName,
  contractEventName,
  contractHttpBase,
} from './naming.js'
