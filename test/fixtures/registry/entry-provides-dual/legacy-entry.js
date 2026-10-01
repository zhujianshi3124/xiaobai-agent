/**
 * v1.3 扩槽入口夹具：与 provides.entry 并存的 legacy 顶层声明位（顶层 exports['.']）。
 * 本夹具里它**不该生效**——⓪ 级命中时双声明并存必须 warn 并点名这一份。
 */
export const name = 'fixture-entry-provides-dual-legacy'
export const inject = []
export function apply() {}
