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
    get(name: string, strict?: boolean): unknown
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
     * 服务可用性探测：`ctx.get(name, false)`（D-6 修正，2026-09-21 裁定）。
     *
     * 语义：**缺席即 false，且不抛错**。`ReflectService.get(name, strict)` 只查
     * isolate 映射与 store（两者都是 `Object.create(null)`），命中实现则返回其值，
     * 未命中直接 `return`（undefined）——源码见 cordis 4.0.2 `src/reflect.ts:233-243`。
     * `strict = false` 表示**不要求提供方 fiber 已 ACTIVE**：与探测需求一致
     * （"这个名字有没有人提供"），也与旧直读路径在这一口径上的实际行为一致。
     *
     * 为什么不再直读 `ctx[name]`：代理 get 陷阱先走 `Reflect.has(target, prop)`，
     * 它会沿原型链命中 `Object.prototype` 的成员；且 `isSpecialProperty` 把 `_` 前缀
     * 与 `prototype` 等保留字直接放行成 `Reflect.get`，所以 `hasService('toString')` /
     * ('constructor') / ('valueOf') / ('hasOwnProperty') / ('__proto__') 在旧实现下
     * 全部误报 true ⇒ precheck 的 service-missing 阻断与 doctor 的 requires/services
     * 规则会放过一个真缺依赖的插件。改 `ctx.get` 后这条误判路径被整体闭合，
     * 影响面收敛为"确实以这些名字注册过的服务"（见 test/host-has-service.test.mjs
     * 的三枚钉子）。
     */
    hasService(name: string): boolean {
      const value = loose.get(name, false)
      return value !== undefined && value !== null
    },
  }
}
