// 批 10 夹具：模块导出 panels **非数组**——守卫必须 fail-closed。
// 修前事实：非数组走不进 Array.isArray 分支 ⇒ 被静默忽略（fail-open，声明了却无踪）。
export const name = 'fixture-panels-module-nonarray'

export const panels = 'nope'

export function apply() {}
