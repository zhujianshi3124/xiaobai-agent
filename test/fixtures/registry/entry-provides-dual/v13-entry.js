/**
 * v1.3 扩槽入口夹具：provides.entry 指向的真实入口（⓪ 级命中那份）。
 * 模块 `inject` 与清单 provides.inject 同步声明（红线 5：manifest 与实现同步）。
 */
export const name = 'fixture-entry-provides-v13'
export const inject = ['webServer']
export function apply() {}
