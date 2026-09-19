// 契约插件夹具：marker.flag 存在才正常装入；否则 apply 抛错（S4 修复后重载用）。
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const state = { disposed: 0, events: 0, loadedCount: 0 }

const marker = join(dirname(fileURLToPath(import.meta.url)), 'marker.flag')

export const name = 'fixture-contract-plugin'
export const inject = []

export function apply(ctx, config) {
  if (!existsSync(marker)) {
    throw new Error('fixture marker missing (simulated broken load)')
  }
  state.loadedCount++
  state[Symbol.for('lastConfig')] = config
  ctx.on('fixture/event', () => {
    state.events++
  })
  ctx.effect(() => () => {
    state.disposed++
  })
}
