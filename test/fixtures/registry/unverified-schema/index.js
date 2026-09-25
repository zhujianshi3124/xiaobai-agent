// ★16（批 5）降级夹具：**故意不导出 Config**，让生效的 schema 只能是 manifest 那份
// {uid,refs} 坏 JSON —— schemastery 对它"不抛错但产出不可执行校验的值"，
// 正是修复前会静默返回 ok:true 的那一格。
export const name = 'fixture-unverified-schema'
export const inject = []

export function apply() {}
