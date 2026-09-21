// 契约插件夹具：marker 存在才正常装入；否则 apply 抛错（S4 修复后重载用）。
//
// D-10（H4）：marker 路径改为**每次调用时解析**，并支持 `process.env.FIXTURE_MARKER` 覆盖。
// 原先路径是模块加载期定死的磁盘文件，而 `node --test` 会在**同一台机器上并行跑多个测试
// 文件**（registry.test.mjs / panel-v2.test.mjs / panel-unified.test.mjs 三家共用这一个开关）⇒
// 谁最后写盘谁赢，任何新用例复用该夹具做"先失败后成功"都会偶发翻红（症状：单跑全绿、
// 全量批跑红一条 —— 见 docs/debt.md《环境注记》③）。现在每个测试文件把 env 指到自己
// pid 专属的路径，彼此不再抢同一枚磁盘文件。
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_MARKER = join(dirname(fileURLToPath(import.meta.url)), 'marker.flag')

/** 当前生效的 marker 路径（env 优先，缺省仍是仓内那枚，供人工/脚本手工翻牌）。 */
export function markerPath() {
  return process.env.FIXTURE_MARKER || DEFAULT_MARKER
}

export const state = { disposed: 0, events: 0, loadedCount: 0 }

export const name = 'fixture-contract-plugin'
export const inject = []

export function apply(ctx, config) {
  if (!existsSync(markerPath())) {
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
