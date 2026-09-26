// 批 10 夹具：模块导出**合法** panels（数组 + 每项非空 id）⇒ 守卫放行、照常绑定。
export const name = 'fixture-panels-module-ok'

export const panels = [{ id: 'main', title: 'OK' }]

export function apply() {}
