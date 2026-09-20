/**
 * cordis 宿主适配器（spike 结论见 docs/p0-recon.md §6 与 R2）：
 * - ctx.plugin() 返回 fiber（thenable + dispose + state），await 失败即 reject；
 * - 服务注册走 ctx.reflect.provide(name, value)（fiber 级自动注销，见 reflect.ts）；
 * - 事件用 ctx.emit；服务可用性探测见 hasService 的注释。
 *
 * ⚠️ 监听器异常纪律（A1，本适配器的使用前提）：cordis 的 `emit` 对监听器是裸调用
 * （events.ts 里 `.map(cb => cb(...))`，不逐条 try/catch、不 await），任一监听器同步
 * 抛错都会中断后续监听器并把异常抛回发射方。发射方（registry.notify）只做兜底捕获，
 * **拿不到监听器列表、无法逐条隔离**。所以规则是：
 * **toolkit 自有监听器一律自带异常防御，不依赖发射方隔离**——
 * 监听器内部自己 try/catch（面板 SSE 转发 v2-api.mjs、审计落盘 audit-sink.mjs、
 * 健康回写 registry-host.mjs 三处订阅点均按此实现）。新增订阅者必须照做。
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
    /**
     * 服务可用性探测：**直读 ctx 代理属性**（`ctx[name]`），不是 `ctx.get(name)`。
     * 两者语义不同，这里是按"缺席即 false、不抛错"的探测需求选的：
     * 未声明/未注入的名字在代理 get 陷阱里会 throw（`cannot get property … without
     * inject`），故包 try/catch 收敛成 false；注入了但提供方 fiber 未 ACTIVE 同样落到
     * catch → false。这与 ctx.get(name) 的默认 strict 分支（strict=true 只认 ACTIVE
     * fiber 的实现）在结果上一致。
     *
     * 已知边界（尚未裁决，勿在此顺手改）：代理 get 陷阱先走 `Reflect.has(target, prop)`，
     * 它会沿原型链命中 `Object.prototype` 的成员——实测 hasService('toString') /
     * ('constructor') / ('valueOf') / ('hasOwnProperty') / ('__proto__') 均返回 true。
     * 影响面：precheck 的 service-missing 阻断与 doctor 的 requires/services 规则会把这些
     * 名字误判为"服务在场"。改用 ctx.get(name, false) 可闭合（它只查 isolate/store，
     * 不碰原型链），但那是行为变更，留待裁决。
     */
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
