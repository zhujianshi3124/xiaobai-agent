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
//
// 【2026-09-25 批 5-2（★11）翻面记录 —— 这一段是本文件的承重变更】
// 原第 3 条用例的名字与断言钉的是"依赖离开后 cordis 已把插件撤下、registry 却**仍报
// active**"这一假象（当时的两套真相，`docs/add-sub-plugin.md` §3 把它写成"语义边界"）。
// 批 5-2 落了 registry 的 fiber 实况对齐器 ⇒ 那条假象不再成立，故按"翻面不删命题"办：
//   · 用例改名，撤依赖那一半改为断言 **registry 报 loading**（`reason: 'align-gated'`）；
//   · doctor 那一半**原样保留**（同一次撤依赖，`service-missing` 仍是 error）⇒ 两面同屏
//     各说各的：registry 说"当前没在跑"，doctor 说"为什么没在跑"，这正是五条件之④的口径；
//   · 回恢复那一半新增在再激活用例里（依赖回来 → 一次观察内回 active，reason
//     'align-recovered'，且 apply 第 2 次由 cordis 自己放、不是对齐器装的）。
// 未开对齐器的缺省口径（`statusAlignIntervalMs` 缺省 5000、用例内等待远低于该值）在本文件
// 其余用例里保持不变 —— 只有这三条显式开闸，避免把"装载链本身"与"对齐器"混在一条红里。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'

import { createRegistry, cordisHost, resolveLocalSource, FIBER_ACTIVE } from '@local/dsh-toolkit/registry'
import { DoctorService } from '@local/dsh-toolkit/doctor'
import { contractEventName } from '@local/dsh-toolkit/contract'

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
  // 批 5-2：实况对齐器的启动口（缺省周期 5000ms，本文件只有显式传 statusAlignIntervalMs
  // 的那两条用例会真的在窗口内跑到；其余用例的等待都远短于缺省周期 ⇒ 行为与 HEAD 一致）。
  created.registry.startStatusAlign()
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

test('E1 分歧面【批 5-2 已合流】：依赖离开 → registry 如实改报 loading，doctor 仍独立报 service-missing', async (t) => {
  const { ctx, registry, state } = await makeStack(t, { statusAlignIntervalMs: 5, statusAlignConfirmCount: 2 })
  const transitions = []
  ctx.on(contractEventName('toolkit', 'registry:status-changed'), (p) => transitions.push(p))
  const installing = registry.install({ kind: 'local', path: consumerFixture }, { force: true })
  await tick()
  const unprovide = ctx.reflect.provide(NEED, { ok: 1 })
  await installing
  assert.equal(state.loads, 1)
  transitions.length = 0

  unprovide()
  await waitFor(registry, ID, 'loading', 2000)
  assert.equal(ctx[NEED], undefined, 'cordis 侧：服务已下线')
  // 这里原来是 `assert.equal(registry.get(ID).status, 'active')`（钉假象）。翻面后钉的是实况：
  // registry 不再持有"装入那一次"的结论，而是随 fiber 回写。
  assert.equal(registry.get(ID).status, 'loading', 'registry 侧随 fiber 回写为 loading（对齐器已生效）')
  assert.equal(state.loads, 1, 'apply 不重跑（fiber 只是被撤下，没被销毁）')
  const downgrades = transitions.filter((p) => p.reason === 'align-gated')
  assert.equal(downgrades.length, 1, `降级只播报一次，实际 ${JSON.stringify(transitions)}`)
  assert.equal(registry.get(ID).lastError, undefined, '③ 分工：对齐器只说"没在跑"，不把成因写成错误')

  // 补偿控制确实在（原样保留）：doctor 那一面独立查出"为什么没在跑"。
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

test('E1 再激活：依赖回来 → cordis 重新跑 apply（effect 重建），registry 一轮观察内如实回 active', async (t) => {
  const { ctx, registry, state } = await makeStack(t, { statusAlignIntervalMs: 5, statusAlignConfirmCount: 2 })
  const transitions = []
  ctx.on(contractEventName('toolkit', 'registry:status-changed'), (p) => transitions.push(p))
  const installing = registry.install({ kind: 'local', path: consumerFixture }, { force: true })
  await tick()
  const un1 = ctx.reflect.provide(NEED, { ok: 1 })
  await installing
  assert.equal(state.loads, 1)

  un1()
  await waitFor(registry, ID, 'loading', 2000)
  transitions.length = 0
  const un2 = ctx.reflect.provide(NEED, { ok: 2 })
  await waitFor(registry, ID, 'active', 2000)
  assert.equal(state.loads, 2, '依赖回来 ⇒ apply 第 2 次执行（这是 cordis inject 的既有语义，registry 只是别把它当一次性事件）')
  assert.equal(registry.get(ID).status, 'active')
  const recoveries = transitions.filter((p) => p.reason === 'align-recovered')
  assert.equal(recoveries.length, 1, `恢复只播报一次，实际 ${JSON.stringify(transitions)}`)
  assert.deepEqual(
    { from: recoveries[0].from, to: recoveries[0].to },
    { from: 'loading', to: 'active' },
    '恢复方向走的是既有 registry:status-changed（面板与 SSE 零改动）',
  )
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
