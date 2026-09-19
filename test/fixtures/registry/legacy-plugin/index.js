// legacy 夹具：无 dsh.plugin.json，只有常规 name/inject/apply 导出。
export const state = { events: 0 }

export const name = 'fixture-legacy'
export const inject = []

export function apply(ctx, config) {
  ctx.on('fixture/event', () => {
    state.events++
  })
}
