// H3 · 双通道一致性守卫（债务 D-12 关账）
//
// 同一个内置插件可以被两条通道装进 cordis：
//   通道 H（宿主）：`cordis-plugin-loader` 读配置行 → `unwrapExports(模块)` → `ctx.registry.plugin(plugin, config)`
//   通道 R（面板 registry）：本仓 `resolveLocalSource()`（含 B2 保守合并）→ `host.plugin(...)`
// cordis 只认**交给它的那个对象**上的 `name` / `inject` / `Config`（4.0.2
// `lib/index.js:1622-1634`，`runtime = {name, callback, fibers, Config}`、
// `Inject.resolve(plugin.inject)`），配置校验按 `runtime.Config["~standard"].validate`
// （同文件 `:956-957`，无 Config 即原样放行）。两通道交给 cordis 的对象不一致，
// 就会出现"同一插件在宿主里叫 A、在面板里叫 B"或"一边校验配置一边不校验"。
//
// 为什么这份副本可信（不是照着记忆瞎写的）：
//  1. `hostUnwrap` 逐字抄自本机实装的 `@deepseek-ai/cordis-plugin-loader@1.0.3`
//     `lib/index.js:745-751`（等价 TS 源 `src/index.ts:191-199`），非推测；
//  2. 若本机那份真 loader 可及（默认查全局 dsh 的嵌套依赖路径，或用 env
//     `TOOLKIT_HOST_LOADER_PATH` 指定），最后一例会**拿真 loader 复核这份副本**；
//     不可及就 skip（红线：环境性缺席不得翻红）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Inject } from '@deepseek-ai/cordis'

import { resolveLocalSource } from '../registry/dist/index.js'

const ROOT = resolve(import.meta.dirname, '..')
const HOST_LOADER_CANDIDATES = [
  process.env.TOOLKIT_HOST_LOADER_PATH,
  'C:/Users/LENOVO/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis-plugin-loader/lib/index.js',
].filter(Boolean)

/** 官方 unwrapExports 的逐字副本（出处见文件头）。 */
function hostUnwrap(exports) {
  const isNullable = (v) => v === undefined || v === null
  if (isNullable(exports)) return exports
  exports = exports.default ?? exports
  if (!exports.__esModule) return exports
  return exports.default ?? exports
}

/** 按 cordis 4.0.2 的取值口径，看它从插件对象上实际读到什么。 */
function cordisSees(plugin) {
  if (typeof plugin !== 'object' && typeof plugin !== 'function') {
    throw new Error(`cordis 不接受的插件形态：${typeof plugin}`)
  }
  let name = plugin.name
  if (name === 'apply') name = undefined
  return {
    name,
    inject: Object.keys(Inject.resolve(plugin.inject) ?? {}).sort(),
    hasConfig: plugin.Config !== undefined,
  }
}

const ENTRIES = [
  { label: '桶根 index.js', path: join(ROOT, 'index.js') },
  { label: 'rate-throttle', path: join(ROOT, 'lib', 'rate-throttle') },
  { label: 'compact-router', path: join(ROOT, 'lib', 'compact-router') },
  { label: 'search-router', path: join(ROOT, 'lib', 'search-router') },
  { label: 'web-search-local', path: join(ROOT, 'lib', 'web-search-local') },
  { label: 'agent-memory/plugin.js', path: join(ROOT, 'lib', 'agent-memory', 'plugin.js') },
]

async function bothChannels(entry) {
  const target = entry.path.endsWith('.js') ? entry.path : join(entry.path, 'index.js')
  const ns = await import(pathToFileURL(target).href)
  const H = cordisSees(hostUnwrap(ns))
  const resolved = await resolveLocalSource({ kind: 'local', path: entry.path })
  const R = cordisSees(resolved.plugin)
  return { H, R, entrySource: resolved.entrySource }
}

// ⚠ 顺序有意义：registry 通道的 B2 保守合并是**就地改写**插件对象（给函数/类的 `name`
// 上 defineProperty），一次 R 通道解析之后，同一个模块对象的 `name` 就已经变成面板给的名字，
// 之后再读 H 通道就测不到"未经改写的原始模块"。所以下面两条绝对期望必须排在遍历式对账之前
// （node --test 在同一文件内按源码顺序执行）。
test('分歧已修死：三个内置入口在两条通道里都给出声明名 / Config（不是"两边一起错"）', async () => {
  const cases = [
    // compact-router 的 Config 是从基类 `BasicCompactionEngine` 继承来的静态面（cordis 读
    // `plugin.Config` 走原型链），两条通道同样继承 ⇒ 一致，不是分歧。
    ['compact-router', { name: 'compact-router', inject: ['commands', 'llm', 'sessions', 'tokenMeter'], hasConfig: true }],
    ['agent-memory/plugin.js', { name: 'agent-memory-runtime', inject: [], hasConfig: false }],
    ['web-search-local', { name: 'web-search-local', inject: ['web'], hasConfig: true }],
  ]
  for (const [label, want] of cases) {
    const entry = ENTRIES.find((e) => e.label === label)
    const target = entry.path.endsWith('.js') ? entry.path : join(entry.path, 'index.js')
    // 先读 H（此刻模块尚未被 B2 改写过），再走 R，两边都必须等于**绝对期望**。
    const H = cordisSees(hostUnwrap(await import(pathToFileURL(target).href)))
    assert.deepEqual(H, want, `通道 H（宿主装载器实际看到的）不符预期（${label}）`)
    const resolved = await resolveLocalSource({ kind: 'local', path: entry.path })
    assert.deepEqual(cordisSees(resolved.plugin), want, `通道 R（面板 registry 实际看到的）不符预期（${label}）`)
  }
})

test('修复前分叉点复现（非空洞证明）：官方纯替换会丢模块级 name，只有自带到 default 才留得住', async () => {
  const ns = await import(pathToFileURL(join(ROOT, 'lib', 'compact-router', 'index.js')).href)
  assert.equal(ns.name, 'compact-router', '模块级 export const name 仍在（供命名空间形态消费）')
  const unwrapped = hostUnwrap(ns)
  assert.equal(typeof unwrapped, 'function')
  assert.equal(unwrapped.name, 'compact-router', '类上不带 static name 时，官方通道读到的就是 JS 推断名')
  const fakeLegacy = { default: class RouterCompactionEngine2 {}, name: 'compact-router' }
  assert.equal(hostUnwrap(fakeLegacy).name, 'RouterCompactionEngine2', '没有 static name 时官方通道必然读到推断名')
})

for (const entry of ENTRIES) {
  test(`双通道一致：${entry.label} 交给 cordis 的 name/inject/Config 三元组必须相同`, async () => {
    const { H, R } = await bothChannels(entry)
    assert.deepEqual(H, R, `两通道分歧：宿主 ${JSON.stringify(H)} vs 面板 ${JSON.stringify(R)}`)
  })
}

test('面板入口不经 registry 通道自举（D-15 文案指对成因）', async () => {
  // 面板是装配现场（REQ-8），装载它等于让它自己装自己 ⇒ 维持拒绝；
  // 但拒绝理由必须是"缺 contract 字段"，而不是含糊的"legacy 合成校验失败"。
  await assert.rejects(
    () => resolveLocalSource({ kind: 'local', path: join(ROOT, 'panel', 'index.js') }),
    (error) => {
      assert.equal(error.code, 'plugin-shape-invalid')
      assert.match(error.message, /缺非空 `contract` 字段/, '必须点名真实成因')
      assert.match(error.message, /panel[\\/]dsh\.plugin\.json/, '必须点名是哪份 manifest')
      assert.match(error.message, /@local\/dsh-toolkit/, '必须点名被拿去当 id 的包名')
      assert.match(error.message, /修法/, '必须给下一步（不许只报 errno）')
      return true
    },
  )
})

test('副本可信性：本机真 loader 在场时，unwrapExports 与本副本对同一输入同结果（缺席则 skip）', async (t) => {
  const real = HOST_LOADER_CANDIDATES.map((p) => resolve(p)).find((p) => existsSync(p))
  if (!real) {
    t.skip('本机没有 cordis-plugin-loader（环境性缺席，不算失败）')
    return
  }
  const { default: Loader } = await import(pathToFileURL(real).href)
  const unwrap = Loader.prototype.unwrapExports
  const samples = []
  for (const entry of ENTRIES) {
    const target = entry.path.endsWith('.js') ? entry.path : join(entry.path, 'index.js')
    samples.push(await import(pathToFileURL(target).href))
  }
  const classNs = { default: class Foo {}, name: 'x' }
  const fnNs = { default: function bar() {} }
  const plainObj = { apply() {} }
  const esmCjs = Object.assign({ default: { apply() {} }, __esModule: true }, {})
  samples.push(classNs, fnNs, plainObj, esmCjs, null, undefined)
  for (const s of samples) {
    assert.equal(unwrap.call(null, s), hostUnwrap(s), '真 loader 与副本对同一输入给出不同对象')
  }
})
