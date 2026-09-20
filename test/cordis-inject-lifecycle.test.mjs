// E1 · cordis 原生 inject 的正向语义钉子
//
// 现状（审计发现）：契约的 `requires.services` 与 cordis 的 `inject` **互不桥接**，
// 而 inject 门控此前只有一条负向用例（缺席 → 永久 PENDING → 超时隔离）。
// 本文件补的是正向那一半，并如实记录"注册中心视角"与"cordis 视角"的分歧面。
//
// 实测基线（真 cordis 4.0.2，不含 registry）：
//   依赖缺席 → PENDING 且 apply 一次都不跑；
//   依赖到位 → ACTIVE，apply 跑 1 次；
//   依赖离开 → 回到 PENDING（apply 不重跑，effect 被拆）；
//   依赖再来 → 再 ACTIVE，apply 第 2 次跑。
//
// 不改动任何装载语义：不合成 inject、不改装载次序（那是 debt.md C-1 契约 v1.1 的活）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'

import { createRegistry, cordisHost, resolveLocalSource, FIBER_ACTIVE } from '@local/dsh-toolkit/registry'
import { DoctorService } from '@local/dsh-toolkit/doctor'

const fixtureDir = (name) => join(import.meta.dirname, 'fixtures', 'registry', name)
const consumerFixture = fixtureDir('inject-consumer-plugin')
const NEED = 'fixture/needed'
const ID = 'fixture/inject-consumer'

const silent = { info: () => {}, warn: () => {}, error: () => {} }
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms))

async function makeStack(t, registryOpts = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'inject-lc-'))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const ctx = new Context()
  const { state } = await import(`file:///${consumerFixture.replace(/\\/g, '/')}/index.js`)
  // 夹具模块是进程内单例，state.loads 会跨用例累加 ⇒ 每条用例开跑前归零，
  // 断言才是"本用例内跑了几次"的绝对值。
  state.loads = 0
  const created = createRegistry(ctx, {
    servicePrefix: 'toolkit',
    statePath: join(tmp, 'state.json'),
    retryBackoffMs: 1,
    loadTimeoutMs: 4000,
    logger: silent,
    ...registryOpts,
  })
  t.after(() => created.stop())
  return { ctx, registry: created.registry, state, tmp }
}

test('E1 前提：模块 inject 与 manifest requires.services 是两套声明，只有 inject 会让 cordis 设门', async () => {
  const resolved = await resolveLocalSource({ kind: 'local', path: consumerFixture })
  assert.equal(resolved.legacy, false, '带 contract 的夹具走契约路径')
  assert.deepEqual(resolved.manifest.requires.services, [NEED], 'manifest 侧声明了依赖')
  assert.deepEqual(resolved.plugin.inject, [NEED], '模块侧也声明了 inject')

  // 对照组：consumer-plugin 只有 manifest 声明、模块没有 inject ⇒ cordis 不设门
  const noInject = await resolveLocalSource({ kind: 'local', path: fixtureDir('consumer-plugin') })
  assert.deepEqual(noInject.manifest.requires.services, [NEED])
  assert.equal(noInject.plugin.inject, undefined, '对照夹具故意不带 inject——这正是两套声明脱节的样本')
  const bare = new Context()
  const f = bare.plugin(noInject.plugin)
  await f
  assert.equal(f.state, FIBER_ACTIVE, '没有 inject ⇒ 依赖缺席也直接 ACTIVE（cordis 无从设门）')
  await f.dispose()
})

test('E1 正向：依赖后到 → cordis 把 fiber 从 PENDING 放成 ACTIVE，registry 如实报 active', async (t) => {
  const { ctx, registry, state } = await makeStack(t)
  // 依赖缺席时预检会阻断，force 是为专测装载轨道（预检覆盖在 doctor.test.mjs S3）
  const installing = registry.install({ kind: 'local', path: consumerFixture }, { force: true })
  await tick()

  assert.equal(registry.get(ID).status, 'loading', '依赖未到位前停在 loading')
  assert.equal(state.loads, 0, 'apply 一次都没跑——cordis 确实按 inject 把插件挡在门外')

  const unprovide = ctx.reflect.provide(NEED, { ok: 1 })
  const result = await installing
  assert.equal(result.ok, true, 'install 应随依赖到位而成功')
  assert.equal(registry.get(ID).status, 'active', 'registry 报 active')
  assert.equal(state.loads, 1, '依赖到位后 apply 恰好跑 1 次')
  unprovide()
})

test('E1 分歧面（如实记录）：依赖离开后 cordis 已把插件撤下，registry 却仍报 active', async (t) => {
  const { ctx, registry, state } = await makeStack(t)
  const installing = registry.install({ kind: 'local', path: consumerFixture }, { force: true })
  await tick()
  const unprovide = ctx.reflect.provide(NEED, { ok: 1 })
  await installing
  assert.equal(state.loads, 1)

  unprovide()
  await tick(80)
  const viaCtx = ctx[NEED]
  assert.equal(viaCtx, undefined, 'cordis 侧：服务已下线')
  // registry 的 status 是"装入那次"的结论，此后不随 inject 门变化回写——
  // 这就是两套真相。不掩盖，直接钉住，等 C-1 决定怎么桥接。
  assert.equal(registry.get(ID).status, 'active', 'registry 侧仍报 active（已知分歧，非本用例引入）')
  assert.equal(state.loads, 1, 'apply 不重跑（fiber 只是被撤下，没被销毁）')

  // 补偿控制确实在：doctor 下一轮巡检会把这条差异查出来
  const doctor = new DoctorService({ servicePrefix: 'toolkit', watchInterval: 0, failureThreshold: 1, historySize: 5, logger: silent })
  doctor.attachHost(cordisHost(ctx))
  doctor.attachRegistry(registry)
  const report = await doctor.inspect(ID)
  const items = report.reports[0].items
  assert.ok(
    items.some((i) => i.code === 'service-missing' && i.level === 'error'),
    `doctor 必须发现依赖已缺席：${JSON.stringify(items.map((i) => i.code))}`,
  )
})

test('E1 再激活：依赖回来 → cordis 重新跑 apply（effect 重建），registry 无需任何动作', async (t) => {
  const { ctx, registry, state } = await makeStack(t)
  const installing = registry.install({ kind: 'local', path: consumerFixture }, { force: true })
  await tick()
  const un1 = ctx.reflect.provide(NEED, { ok: 1 })
  await installing
  assert.equal(state.loads, 1)

  un1()
  await tick(80)
  const un2 = ctx.reflect.provide(NEED, { ok: 2 })
  await tick(80)
  assert.equal(state.loads, 2, '依赖回来 ⇒ apply 第 2 次执行（这是 cordis inject 的既有语义，registry 只是别把它当一次性事件）')
  assert.equal(registry.get(ID).status, 'active')
  await registry.uninstall(ID)
  assert.equal(registry.get(ID), undefined)
  un2()
})

test('E1 已知限制 + 真实解锁路径：install 全局互斥挡住 provider，consumer 靠重试退避才转 active', async (t) => {
  // 实测（本仓真 cordis + 真 registry）四件事，一次钉全：
  //   ① consumer 卡在 inject 门外时 apply 完全不跑；
  //   ② install 是**全局互斥**的 ⇒ "再装一个 provider 来解锁 consumer"这条路走不通，
  //      provider 的 install 只能排在 consumer 后面；
  //   ③ 首个装载窗口超时后 install 仍返回 ok:true（REQ-2 隔离语义：注册 ≠ 装入成功），
  //      并把 lastError.code 记成 fiber-load-timeout（Pack A2 的归因码）；
  //   ④ 真正把 consumer 救活的是 **REQ-6 的指数退避重试**：provider 在锁后面装完、
  //      服务上线，consumer 的下一次重试就撞上 ACTIVE 了。
  // 结论：inject 门控能与重试轨道协同，但代价是至少一次可观测的超时失败。
  // 这条限制留给 debt.md C-1（requires.services ↔ inject 桥接）一并处理。
  const { registry, state } = await makeStack(t, { loadTimeoutMs: 600, retryBackoffMs: 1 })
  const consumerInstalling = registry.install({ kind: 'local', path: consumerFixture }, { force: true })
  await tick()
  assert.equal(registry.get(ID).status, 'loading', 'consumer 停在 loading')
  assert.equal(state.loads, 0, '① apply 一次都没跑')

  let providerDone = false
  const providerInstalling = registry.install({ kind: 'local', path: fixtureDir('provider-plugin') }).then((r) => {
    providerDone = true
    return r
  })
  await tick(80)
  assert.equal(providerDone, false, '② provider 的 install 必须还在排队（install 全局互斥）')

  const consumerResult = await consumerInstalling
  assert.equal(consumerResult.ok, true, '③ 首轮装载超时不算注册失败')
  const duringFirstWindow = registry.get(ID)
  assert.equal(duringFirstWindow.lastError?.code, 'fiber-load-timeout', `③ 归因码：${duringFirstWindow.lastError?.code}`)

  const providerResult = await providerInstalling
  assert.equal(providerResult.ok, true, 'provider 随后装上了')
  const active = await waitFor(registry, ID, 'active', 3000)
  assert.equal(state.loads, 1, '④ 重试撞上服务上线 ⇒ apply 恰好跑 1 次')
  assert.equal(active.status, 'active')
})

/** 等 registry 条目到目标状态。 */
async function waitFor(registry, id, status, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const entry = registry.get(id)
    if (entry?.status === status) return entry
    if (Date.now() > deadline) {
      throw new Error(`等待 ${id} → ${status} 超时；当前 = ${entry?.status ?? 'absent'}；lastError = ${JSON.stringify(entry?.lastError ?? null)}`)
    }
    await new Promise((r) => setTimeout(r, 5))
  }
}
