// B2 · 模块命名级静态面必须到达 cordis
//
// 考的是 loader.normalizePlugin 选中 `mod.default` 之后，兄弟命名导出
// （export const name / inject）有没有被整批丢掉。丢掉的后果不是"名字不好看"，
// 而是 **cordis 读不到 inject ⇒ 依赖门控静默失效**（fiber 直接 ACTIVE 而不是
// 等依赖），这是装载语义级别的错。
import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'

import { resolveLocalSource, FIBER_PENDING, FIBER_ACTIVE } from 'dsh-toolkit/registry'

const fixtureDir = (name) => join(import.meta.dirname, 'fixtures', 'registry', name)
const ROOT = join(import.meta.dirname, '..')

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms))

test('B2：name/inject 在命名空间、apply 在 default → 装载后 cordis 两样都看见', async (t) => {
  const resolved = await resolveLocalSource({ kind: 'local', path: fixtureDir('split-exports-plugin') })
  const plugin = resolved.plugin
  assert.equal(plugin.name, 'fixture-split-exports', '模块级 name 必须补进 default')
  assert.deepEqual(plugin.inject, ['fixture/still-absent-service'], '模块级 inject 必须补进 default')
  assert.equal(typeof plugin.apply, 'function', 'default 自身的 apply 保持不动')

  // 真 cordis 端到端：runtime.name 与 inject 门控都必须生效（不只是字段看着对）
  const ctx = new Context()
  const fiber = ctx.plugin(plugin)
  t.after(() => fiber.dispose())
  assert.equal(fiber.runtime && fiber.runtime.name, 'fixture-split-exports', 'cordis 的 runtime.name 必须来自模块级声明')
  await tick()
  assert.equal(fiber.state, FIBER_PENDING, 'inject 缺席必须停在 PENDING——补上的 inject 真被 cordis 用上了')
})

test('B2：不覆盖 default 自身已声明的静态面', async () => {
  const resolved = await resolveLocalSource({ kind: 'local', path: fixtureDir('default-statics-win-plugin') })
  const plugin = resolved.plugin
  assert.equal(plugin.name, 'default-wins', 'default 自己的 name 是有意的声明，模块级值不得盖掉它')
  assert.deepEqual(plugin.inject, ['from-default'], 'default 自己的 inject 不被模块级值替换')
  assert.deepEqual(plugin.Config, { from: 'default' }, 'default 已有的其余静态面同样保留')
})

test('B2：真实内置插件 compact-router——fiber 名取模块级 name，inject 语义不回归', async (t) => {
  // 该插件 extends 外部 BasicCompactionEngine；依赖缺席时按红线 3 跳过而不是判红。
  let resolved
  try {
    resolved = await resolveLocalSource({ kind: 'local', path: join(ROOT, 'lib', 'compact-router') })
  } catch (error) {
    t.skip(`compact-router 入口不可解析（依赖缺席）：${String(error && error.message).slice(0, 80)}`)
    return
  }
  const plugin = resolved.plugin
  assert.equal(typeof plugin, 'function', 'compact-router 是 Service 子类（Constructor 形态）')
  assert.equal(plugin.name, 'compact-router', 'class 的推断名 RouterCompactionEngine 应被模块级 export const name 取代')
  assert.deepEqual(
    plugin.inject,
    ['llm', 'tokenMeter', 'sessions', 'commands'],
    'static inject 必须原样保留（不得被模块级缺席清掉）',
  )
  assert.equal(typeof plugin.Config, 'function', 'static Config 保留')

  const ctx = new Context()
  const fiber = ctx.plugin(plugin)
  t.after(() => fiber.dispose())
  assert.equal(fiber.runtime && fiber.runtime.name, 'compact-router')
  await tick()
  assert.equal(fiber.state, FIBER_PENDING, '四个依赖服务都不在场 ⇒ cordis 按 inject 门控停在 PENDING')
})

test('B2 回归面：default 与命名空间静态一致时行为不变（legacy-plugin 装载路径零变化）', async () => {
  const resolved = await resolveLocalSource({ kind: 'local', path: fixtureDir('legacy-plugin') })
  assert.equal(resolved.legacy, true)
  assert.equal(resolved.manifest.id, 'legacy/legacy-plugin')
  assert.deepEqual(resolved.plugin.inject, [], '原本就有的 inject 不被改写')
  const ctx = new Context()
  const fiber = ctx.plugin(resolved.plugin)
  await fiber
  assert.equal(fiber.state, FIBER_ACTIVE, '无依赖的 legacy 插件照旧直接 ACTIVE')
  await fiber.dispose()
})
