/**
 * 服务与事件命名（D5 无根假设 / REQ-8）。
 *
 * 一切对外服务名与事件名都必须带可配置的 servicePrefix 前缀：
 *   - 服务名：`${servicePrefix}/registry`、`${servicePrefix}/doctor`
 *   - 事件名：`${servicePrefix}/${ContractEventName}`，如 `toolkit/registry:status-changed`
 *
 * 前缀缺省建议值 `toolkit`；同进程多实例（S5）或嵌入 dsh-web-all 时改前缀消除冲突。
 * 禁止出现无前缀的全局事件名（禁止事项 §9）。
 *
 * 前缀同时决定面板 HTTP 路由基址（P7 嵌入 / REQ-8）：见 `contractHttpBase`。
 */

/** 契约定义的基础事件名（不带前缀）。 */
export const CONTRACT_EVENT_NAMES = [
  'registry:plugin-added',
  'registry:plugin-removed',
  'registry:status-changed',
  'registry:health-changed',
  'doctor:issue-found',
] as const

export type ContractEventName = (typeof CONTRACT_EVENT_NAMES)[number]

export type ContractServiceName = 'registry' | 'doctor'

/** 校验前缀：非空、不含 `/`（前缀就是命名空间本身）。 */
export function isValidServicePrefix(prefix: string): boolean {
  return typeof prefix === 'string' && prefix.length > 0 && !prefix.includes('/') && prefix.trim() === prefix
}

/** 拼出完整服务名，如 `toolkit/registry`。 */
export function contractServiceName(servicePrefix: string, service: ContractServiceName): string {
  assertPrefix(servicePrefix)
  return `${servicePrefix}/${service}`
}

/** 拼出完整事件名，如 `toolkit/registry:status-changed`。 */
export function contractEventName(servicePrefix: string, event: ContractEventName): string {
  assertPrefix(servicePrefix)
  return `${servicePrefix}/${event}`
}

/** 缺省服务前缀。取该值时服务名/事件名/HTTP 路由与 P6 之前逐字节相同。 */
export const DEFAULT_SERVICE_PREFIX = 'toolkit'

/**
 * 面板 HTTP 路由基址（P7 嵌入 / REQ-8）：`/api/${servicePrefix}-panel`。
 * 缺省前缀下恰等于历史硬编码字面量 `/api/toolkit-panel`——对外 URL 零变化；
 * 同进程多实例各带自己的前缀即路由零冲突。面板客户端的孪生常量见
 * `panel/client/index.js` 的 `PANEL_PREFIX`/`PANEL_API`，一致性由 p7-embed 测试锁死。
 */
export function contractHttpBase(servicePrefix: string): string {
  assertPrefix(servicePrefix)
  return `/api/${servicePrefix}-panel`
}

/**
 * 归一插件 config 里的 servicePrefix：非字符串 / 空串 / 仅空白 → 回落缺省值。
 * 非法前缀（含 `/`）不在此抛错，交由上面三个拼装函数 fail-closed。
 */
export function normalizeServicePrefix(prefix: unknown): string {
  const value = typeof prefix === 'string' ? prefix.trim() : ''
  return value === '' ? DEFAULT_SERVICE_PREFIX : value
}

function assertPrefix(prefix: string): void {
  if (!isValidServicePrefix(prefix)) {
    throw new TypeError(`非法 servicePrefix："${String(prefix)}"（须为非空且不含 "/" 的字符串）`)
  }
}
