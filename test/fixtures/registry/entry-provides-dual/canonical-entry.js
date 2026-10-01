/**
 * v1.3 扩槽入口夹具：与 provides.entry 并存的 legacy 正典声明位（requirements.exports['.']）。
 * 本夹具里它**不该生效**——⓪ 级命中时双声明并存必须 warn 并点名这一份。
 */
export const name = 'fixture-entry-provides-dual-canonical'
export const inject = []
export function apply() {}
