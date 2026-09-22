// 批 3 夹具：healthCheck 与 panels 只由**模块导出**携带（落盘那份刻意缺席），
// 用来钉 ★2 的绑定链——装载后 manifest.healthCheck 必须是函数、体检必须真跑到它。
export const state = { fail: false }

export const name = 'fixture-runtime-statics'
export const inject = []

export const panels = [
  { id: 'runtime-statics.main', title: '绑定夹具面板' },
]

export async function healthCheck() {
  if (state.fail) throw new Error('boom from runtime-statics healthCheck')
  return [{ code: 'runtime-statics.ok', level: 'ok', message: '模块 healthCheck 经真装载链被消费' }]
}

export function apply() {}
