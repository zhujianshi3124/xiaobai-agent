/**
 * F3（lastError 生命周期）专用夹具：marker.flag 缺席时 apply 抛错，模拟"装不动"。
 *
 * 为什么不复用 contract-plugin 夹具：node --test 的**测试文件之间是并发跑的**，
 * 而 marker.flag 是磁盘上的共享文件——registry.test.mjs / panel-v2.test.mjs 的
 * S4 系列都会翻它。本文件要"先失败后成功"，与它们抢同一个开关必然偶发翻红
 * （实测：单跑 6/6 绿、全量批跑红一条）。所以自带一份夹具，互不干扰。
 */
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const marker = join(dirname(fileURLToPath(import.meta.url)), 'marker.flag')

export const name = 'fixture-last-error-plugin'
export const inject = []

export function apply(ctx, config) {
  if (!existsSync(marker)) {
    throw new Error('fixture marker missing (simulated broken load)')
  }
  ctx.effect(() => () => {})
}
