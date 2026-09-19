// 后台任务型夹具：apply 返回永不完成的 Promise。
// cordis 对模块命名空间插件的返回 Promise 视为后台任务（fiber 立即 ACTIVE）——
// 本夹具钉住该语义（docs/p0-recon.md §6 R2 结论），registry 以 fiber 状态判定装入完成。
export const name = 'fixture-background-task'

export function apply() {
  return new Promise(() => {})
}
