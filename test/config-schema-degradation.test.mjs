// ★16 / 批 5-1 —— 校验降级不得谎称"已通过"（F-17 契约正本挂账的批 5 那一处）
//
// 修复前：`validateConfigAgainstSchema` 在 schemastery 构建/重建失败、或 schema 形态根本不认识时
// 返回 `ok:true`（只把原因塞进 issues），而两个调用方（`registry.setConfig` 写回、
// 体检 `config-schema-invalid` 规则）**只看 ok** ⇒ "任意配置都能落盘"。
// 修复后：新增 `verified` 轴（这次到底跑没跑校验），降级一律 `ok:false + verified:false`，
// 两个调用方各自把原因说清楚：写回拒、错误码 `config-schema-unverified`；体检另开同码阻断项，
// 而 `config-schema-invalid`（默认配置真不合法）的既有语义与断言**一字未放宽**。
//
// 覆盖三层：契约校验器本身（八种形态）→ registry 写回 → doctor 预检。
// 反向钉两条：① 仓内 6 份真实 manifest 的 configSchema 必须仍 verified:true（正常路径不受影响）；
// ② 合法 schema 的 setConfig 必须仍然写得进去。
import test from 'node:test'
import { after } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'

import { validateConfigAgainstSchema } from '@local/dsh-toolkit/contract'
import { createRegistry } from '@local/dsh-toolkit/registry'
import { createDoctor } from '@local/dsh-toolkit/doctor'

const fixtureDir = (name) => join(import.meta.dirname, 'fixtures', 'registry', name)

// ── D-21 · 注入替身（C1-006 批复裁方案 (a)；注入面先例＝doctor 仓 R4 探测替身）──────────
// 债务 D-21：`#isUsableSchema` 由 ③（{type} 纯定义构建后不可执行校验）与 ④（{uid,refs} 重建后
// 不可执行校验）共用，但真实 schemastery 造不出"③ 构建不抛错却返回不可执行值"（债条原文：
// 本笔不编造触发条件）⇒ ③ 格此前无钉，守卫被摘不会翻红。本区块把注入替身做成 resolve 钩子：
// 默认放行（`__d21SchemasteryDouble` 未配置 ⇒ 一切照旧，下面既有十格证据形态零变化）；
// 仅当替身配置后，config-schema.ts 里的 `await import('@deepseek-ai/schemastery')` 被短接到
// data: URL 替身模块——其 default(def) 回读 globalThis 上的替身工厂，返回"构建不抛错但
// 不可执行校验"的值。registerHooks 是线程内同步钩子，测试与钩子共享同一 globalThis
// （须 Node ≥ 23.5；本机门禁 Node 24.19 实测）。文件末尾 after() 注销钩子（装配现场收尾）。
const D21_TYPE_DEF = { type: 'object', dict: { a: { type: 'string' } } }
const D21_MOCK_URL = 'data:text/javascript,' + encodeURIComponent(
  'export default function (definition) {\n'
  + '  const make = globalThis.__d21SchemasteryDouble\n'
  + '  if (typeof make !== "function") throw new Error("D-21: 替身未配置")\n'
  + '  return make(definition)\n'
  + '}\n',
)
const unregisterD21Hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@deepseek-ai/schemastery' && globalThis.__d21SchemasteryDouble) {
      return { url: D21_MOCK_URL, format: 'module', shortCircuit: true }
    }
    return nextResolve(specifier, context)
  },
})
after(() => unregisterD21Hooks.deregister())

// 两个装配口都返回 createRegistry 的产物本身（{ registry, stop }），用例走 .registry.xxx
function makeRegistry(t, registryOpts = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'cfg-degradation-'))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const ctx = new Context()
  const created = createRegistry(ctx, {
    servicePrefix: 'toolkit',
    statePath: join(tmp, 'state.json'),
    retryBackoffMs: 1,
    loadTimeoutMs: 250,
    autoload: false,
    ...registryOpts,
  })
  t.after(() => created.stop())
  return created
}

function makeStack(t) {
  const ctx = new Context()
  const tmp = mkdtempSync(join(tmpdir(), 'cfg-deg-doc-'))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  let doc
  const created = createRegistry(ctx, {
    servicePrefix: 'toolkit',
    statePath: join(tmp, 'state.json'),
    retryBackoffMs: 1,
    loadTimeoutMs: 250,
    autoload: false,
    precheck: (source) => doc.doctor.precheck(source),
  })
  doc = createDoctor(ctx, { servicePrefix: 'toolkit', watchInterval: 0 }, created.registry)
  t.after(() => { doc.stop(); created.stop() })
  return created
}

// ── 一、校验器本身的八种形态 ───────────────────────────────────────────────────────
test('批5-1 · 没有 schema ⇒ ok:true 但 verified:false（"没东西可验"不等于"验过了"）', async () => {
  for (const schema of [undefined, null]) {
    const r = await validateConfigAgainstSchema(schema, { anything: 1 })
    assert.equal(r.ok, true, '无 schema 不该阻断写回（否则不带配置的插件全废）')
    assert.equal(r.verified, false)
    assert.equal(r.via, 'skipped')
  }
})

test('批5-1 · 可调用 Schema 两向都 verified:true', async () => {
  const good = () => ({})
  const bad = () => { throw new Error('必填缺失') }
  const pass = await validateConfigAgainstSchema(good, {})
  assert.equal(pass.ok, true)
  assert.equal(pass.verified, true)
  const fail = await validateConfigAgainstSchema(bad, {})
  assert.equal(fail.ok, false)
  assert.equal(fail.verified, true, '真跑了校验才发现不合法 ⇒ 与降级必须分得开')
})

test('批5-1 · zod 两向都 verified:true（②形态此前零直测，顺手补）', async () => {
  const passShape = { safeParse: () => ({ success: true }) }
  const failShape = { safeParse: () => ({ success: false, error: { issues: [{ path: ['region'], message: '必填' }] } }) }
  const pass = await validateConfigAgainstSchema(passShape, {})
  assert.equal(pass.ok, true)
  assert.equal(pass.verified, true)
  assert.equal(pass.via, 'zod-safeparse')
  const fail = await validateConfigAgainstSchema(failShape, {})
  assert.equal(fail.ok, false)
  assert.equal(fail.verified, true)
  assert.equal(fail.issues[0].path, 'region')
})

test('批5-1 · ④ 重建结果不可执行校验 ⇒ 降级（修复前这里是 ok:true 谎称通过）', async () => {
  const r = await validateConfigAgainstSchema({ uid: 1, refs: { 0: { type: '__not_a_real_schemastery_type__' } } }, {})
  assert.equal(r.ok, false, '降级绝不能算通过')
  assert.equal(r.verified, false)
  assert.equal(r.via, 'skipped')
  assert.match(r.issues[0].message, /未执行校验/)
})

test('批5-1 · 形态完全不认识 ⇒ 降级（同一条静默放行面）', async () => {
  for (const schema of [{ notAType: 1 }, 'oops', 42, []]) {
    const r = await validateConfigAgainstSchema(schema, {})
    assert.equal(r.ok, false, JSON.stringify(schema) + ' 不该被当成已通过')
    assert.equal(r.verified, false)
  }
})

test('批5-1 · 反向钉：仓内 6 份真实 manifest 的 configSchema 仍走真校验（verified:true）', async () => {
  const files = [
    'dsh.plugin.json',
    join('lib', 'agent-memory', 'dsh.plugin.json'),
    join('lib', 'compact-router', 'dsh.plugin.json'),
    join('lib', 'rate-throttle', 'dsh.plugin.json'),
    join('lib', 'search-router', 'dsh.plugin.json'),
    join('lib', 'web-search-local', 'dsh.plugin.json'),
  ]
  for (const rel of files) {
    const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '..', rel), 'utf8'))
    assert.ok(manifest.configSchema, rel + ' 应带 configSchema（本钉的前提）')
    const r = await validateConfigAgainstSchema(manifest.configSchema, {})
    assert.equal(r.verified, true, rel + ' 必须真的被校验：' + JSON.stringify(r.issues))
    assert.notEqual(r.via, 'skipped')
  }
})

// ── 二、registry.setConfig：降级拒写、正常路径不受影响 ──────────────────────────────
test('批5-1 · setConfig 遇降级配置 ⇒ 拒写且错误码点名"无法校验"', async (t) => {
  const registry = makeRegistry(t).registry
  const installed = await registry.install({ kind: 'local', path: fixtureDir('unverified-schema') })
  assert.equal(installed.ok, true, '本栈不接 precheck ⇒ 先让插件进得来，才测得到写回那一格')
  const before = registry.get('dsh/unverified-schema').config
  let code = null
  let message = ''
  try {
    await registry.setConfig('dsh/unverified-schema', { whatever: true })
  } catch (error) {
    code = error.code
    message = String(error.message)
  }
  assert.equal(code, 'config-schema-unverified', '实得: ' + String(code) + ' / ' + message)
  assert.match(message, /无法校验|未执行/)
  assert.deepEqual(registry.get('dsh/unverified-schema').config, before, '拒写必须真的没落进配置（不预设初值形状）')
})

test('批5-1 · 反向：合法 schema 的 setConfig 照常写入（正常路径不受影响）', async (t) => {
  const registry = makeRegistry(t).registry
  const installed = await registry.install({ kind: 'local', path: fixtureDir('schema-plugin') })
  assert.equal(installed.ok, true)
  await registry.setConfig('dsh/schema-plugin', { region: 'cn', retries: 2 })
  assert.deepEqual(registry.get('dsh/schema-plugin').config, { region: 'cn', retries: 2 })
  let code = null
  try {
    await registry.setConfig('dsh/schema-plugin', { retries: 2 })
  } catch (error) { code = error.code }
  assert.equal(code, 'value-invalid', '真不合法仍是 value-invalid（不与降级混码）')
})

// ── 三、doctor 预检：另开一码，config-schema-invalid 既有语义不放宽 ──────────────────
test('批5-1 · 预检把降级报成 config-schema-unverified，不再混进 config-schema-invalid', async (t) => {
  const registry = makeStack(t).registry
  const blocked = await registry.install({ kind: 'local', path: fixtureDir('unverified-schema') })
  assert.equal(blocked.ok, false, '未验证的配置不得静默装进来')
  const codes = blocked.precheck.blocking.map((x) => x.code)
  assert.ok(codes.includes('config-schema-unverified'), '实得: ' + codes.join(','))
  assert.equal(codes.includes('config-schema-invalid'), false, '降级不是"配置不合法"，两码不得互串')
})

test('批5-1 · 反向：真不合法的默认配置仍走 config-schema-invalid（既有断言未放宽）', async (t) => {
  const registry = makeStack(t).registry
  const blocked = await registry.install({ kind: 'local', path: fixtureDir('schema-plugin') })
  assert.equal(blocked.ok, false)
  const codes = blocked.precheck.blocking.map((x) => x.code)
  assert.ok(codes.includes('config-schema-invalid'), '实得: ' + codes.join(','))
  assert.equal(codes.includes('config-schema-unverified'), false, 'schema 能验、只是默认配置不合法 ⇒ 不该报降级')
})

// ── 四、D-21 · ③ 判据格单独成口（注入替身三格；C1-006 批复裁方案 (a)）──────────────────
// 真实 schemastery 造不出"③ 构建不抛错却返回不可执行值"⇒ 由注入替身供给该条件。
// 三格互斥点：③ 文案"构建结果不可执行校验"、④ 文案"重建结果不可执行校验"、通杀格（第⑤支）
// 文案"无法识别的 configSchema 形态"——③ 守卫被摘时替身产物落进第⑤支，本区第一格即翻红。
test('D-21 · ③ 判据格单独成口：{type} 纯定义＋替身返回不可执行校验的值 ⇒ 降级且文案点名③', async () => {
  globalThis.__d21SchemasteryDouble = () => ({})
  try {
    const r = await validateConfigAgainstSchema(D21_TYPE_DEF, { a: 'x' })
    assert.equal(r.ok, false, '降级绝不能算通过')
    assert.equal(r.verified, false)
    assert.equal(r.via, 'skipped')
    assert.equal(r.issues[0].path, 'config')
    assert.match(
      r.issues[0].message,
      /schemastery 构建结果不可执行校验（得到 object）/,
      '③ 专属文案；守卫被摘会落到第⑤通杀格（"无法识别的 configSchema 形态"）⇒ 此断言翻红',
    )
  } finally {
    delete globalThis.__d21SchemasteryDouble
  }
})

test('D-21 · ③④ 不共用命中：同一替身下 {uid,refs} 命中④专属文案，与③文案互斥', async () => {
  globalThis.__d21SchemasteryDouble = () => ({})
  try {
    const third = await validateConfigAgainstSchema(D21_TYPE_DEF, {})
    const fourth = await validateConfigAgainstSchema({ uid: 1, refs: { 0: { type: 'string' } } }, {})
    assert.equal(fourth.ok, false)
    assert.equal(fourth.verified, false)
    assert.equal(fourth.via, 'skipped')
    assert.match(
      fourth.issues[0].message,
      /schemastery 重建结果不可执行校验（得到 object）/,
      '④ 专属文案（真实行为钉见本文件批5-1 的 ④ 格，替身钉与其同命题双证）',
    )
    assert.notEqual(third.issues[0].message, fourth.issues[0].message, '③ 与 ④ 的命中必须分得开，不共用同一格')
  } finally {
    delete globalThis.__d21SchemasteryDouble
  }
})

test('D-21 · 反向钉：钩子在、门控关 ⇒ 动态导入走真实 schemastery，正常路径零污染', async () => {
  const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'dsh.plugin.json'), 'utf8'))
  const real = await validateConfigAgainstSchema(manifest.configSchema, {})
  assert.equal(real.verified, true, '真实 manifest 必须仍走真校验: ' + JSON.stringify(real.issues))
  assert.notEqual(real.via, 'skipped')
  const handBuilt = await validateConfigAgainstSchema(D21_TYPE_DEF, {})
  assert.equal(handBuilt.verified, true, '同一 {type} 定义门控关时必须真的构建并调用（真实 schemastery）')
})
