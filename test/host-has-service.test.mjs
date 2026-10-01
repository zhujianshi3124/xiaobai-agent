// D-6 · hasService 语义修正（Pack F1）
//
// 这三枚钉子钉的是 **cordis 代理的原型链语义**，不是 toolkit 自己的实现细节：
// `Object.prototype` 上确实挂着 `toString` / `constructor`，`__proto__` 也确实能取到值，
// 所以旧实现（直读 `ctx[name]`）对这三个名字一律返回 true，precheck 的 service-missing
// 阻断与 doctor 的 requires/services 规则就会放过一个真缺依赖的插件。
// 若哪天 cordis 改了代理的 get/has 陷阱（不再沿原型链命中），本文件仍应全绿——
// 它保证的是"这三个名字**没有**被注册时必须是 false"这个结论不随代理实现漂移。
//
// 反向钉子（最后一例）钉住唯一可能翻面的情形：真的以 `toString` 为服务名注册进容器。
// 现实里不存在这种服务名（契约要求 `<scope>/<name>` 小写命名空间式，见 naming.ts），
// 但"理论上唯一受影响的形态"必须用测试说明而不是用嘴说明。
import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'

import { cordisHost } from 'dsh-toolkit/registry'

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms))

/**
 * 以生产同构形态装配：host 由插件自己的派生 ctx 造出（`registry-host.mjs` 就是这么做
 * 的），服务经 `host.provideService` 进容器，探测经同一个 host。
 */
async function mountProbe(t, providedNames) {
  const ctx = new Context()
  let host = null
  const fiber = ctx.plugin({
    name: 'd6-has-service-probe',
    inject: [],
    // 对象方法简写（无 prototype），避免 cordis 的 isConstructor 判定改变执行语义（R2）。
    apply(pluginCtx) {
      host = cordisHost(pluginCtx)
      for (const name of providedNames) host.provideService(name, { name })
    },
  })
  await fiber // apply 在 _reload 里异步跑，不 await 等于"装配还没发生就断言"
  t.after(() => fiber.dispose())
  return { ctx, host, fiber }
}

test('F1 钉子一：与 Object.prototype 同名的服务，未注册时一律 false（旧实现全为 true）', async (t) => {
  const { host } = await mountProbe(t, ['toolkit/registry', 'toolkit/doctor'])
  for (const name of ['toString', 'constructor', '__proto__']) {
    assert.equal(host.hasService(name), false, `hasService('${name}') 必须为 false：容器里没有这个名字的服务`)
  }
  // 顺带把 D-6 记录里另外两个实测误报的名字钉住
  assert.equal(host.hasService('valueOf'), false)
  assert.equal(host.hasService('hasOwnProperty'), false)
})

test('F1 钉子二：真注册过的服务为 true（含宿主 webServer 与两个 toolkit 服务名）', async (t) => {
  const { host } = await mountProbe(t, ['toolkit/registry', 'toolkit/doctor', 'webServer'])
  assert.equal(host.hasService('toolkit/registry'), true)
  assert.equal(host.hasService('toolkit/doctor'), true)
  assert.equal(host.hasService('webServer'), true, 'precheck 的 service-missing 阻断依赖的就是这一侧为 true')
})

test('F1 钉子三：缺失服务 false 且不抛错（探测面契约：缺席即 false）', async (t) => {
  const { host } = await mountProbe(t, ['toolkit/registry'])
  for (const name of ['sessions', 'llm', 'toolkit/doctor', 'no-such-service']) {
    assert.doesNotThrow(() => host.hasService(name), `hasService('${name}') 不得抛错`)
    assert.equal(host.hasService(name), false)
  }
})

test('F1 判定收口：只有"服务名恰好与 JS 原型成员同名且真被注册"才会翻面，且翻面结果为 true', async (t) => {
  const { host } = await mountProbe(t, ['toString'])
  assert.equal(host.hasService('toString'), true, '容器里真有一个名为 toString 的服务时，true 是正确答案')
})

test('F1 回收面：提供方 fiber 卸出后，服务名与原型名同样回到 false', async (t) => {
  const { host, fiber } = await mountProbe(t, ['toolkit/doctor'])
  assert.equal(host.hasService('toolkit/doctor'), true, '前置：装上的时候在')
  fiber.dispose()
  await tick(30)
  assert.equal(host.hasService('toolkit/doctor'), false, '卸出后必须回到 false（不靠 toolkit 侧补偿 cleanup）')
})
