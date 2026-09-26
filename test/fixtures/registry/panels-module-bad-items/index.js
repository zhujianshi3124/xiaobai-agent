// 批 10 夹具：模块导出**畸形** panels（首项缺 id、次项非对象）——守卫必须 fail-closed。
// 修前事实：bindRuntimeStatics 只判 Array.isArray ⇒ 这份被静默绑定（"每项非空 id"承诺单路成立）。
export const name = 'fixture-panels-module-bad-items'

export const panels = [{ title: 'no-id' }, 'junk']

export function apply() {}
