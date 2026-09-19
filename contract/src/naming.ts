/**
 * 服务与事件命名（D5 无根假设 / REQ-8）。
 *
 * 一切对外服务名与事件名都必须带可配置的 servicePrefix 前缀：
 *   - 服务名：`${servicePrefix}/registry`、`${servicePrefix}/doctor`
 *   - 事件名：`${servicePrefix}/${ContractEventName}`，如 `toolkit/registry:status-changed`
 *
 * 前缀缺省建议值 `toolkit`；同进程多实例（S5）或嵌入 dsh-web-all 时改前缀消除冲突。
 * 禁止出现无前缀的全局事件名（禁止事项 §9）。
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

function assertPrefix(prefix: string): void {
  if (!isValidServicePrefix(prefix)) {
    throw new TypeError(`非法 servicePrefix："${String(prefix)}"（须为非空且不含 "/" 的字符串）`)
  }
}
