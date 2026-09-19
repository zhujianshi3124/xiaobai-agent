/**
 * cordis 宿主适配器（spike 结论见 docs/p0-recon.md §6 与 R2）：
 * - ctx.plugin() 返回 fiber（thenable + dispose + state），await 失败即 reject；
 * - 服务注册走 ctx.reflect.provide(name, value)；
 * - 事件用 ctx.emit；服务可用性探测 ctx.get(name) 包 try/catch。
 */

import type { Context } from '@deepseek-ai/cordis'
import type { FiberLike, HostContext } from './types.js'

export function cordisHost(ctx: Context): HostContext {
  // cordis 的 Plugin / keyof Events 收窄过严，适配层在此统一放宽到运行时面。
  const loose = ctx as unknown as {
    plugin(p: unknown, config?: unknown): FiberLike
    emit(event: string, ...args: unknown[]): unknown
    reflect: { provide(name: string, value: unknown, check?: unknown): unknown }
  }
  return {
    plugin(p: unknown, config?: unknown): FiberLike {
      return loose.plugin(p, config)
    },
    emit(event: string, ...args: unknown[]): unknown {
      return loose.emit(event, ...args)
    },
    provideService(name: string, value: unknown): void {
      loose.reflect.provide(name, value)
    },
    hasService(name: string): boolean {
      try {
        const value = (ctx as unknown as Record<string, unknown>)[name]
        return value !== undefined && value !== null
      } catch {
        return false
      }
    },
  }
}
