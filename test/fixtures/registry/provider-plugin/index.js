// S3 夹具：提供 fixture/needed 服务的插件（disable/卸载即"服务下线"）。
export const name = 'fixture-provider'

export function apply(ctx) {
  ctx.reflect.provide('fixture/needed', { ok: true })
}
