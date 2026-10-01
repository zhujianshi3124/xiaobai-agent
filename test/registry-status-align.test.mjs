// 批 5-2（★11 面板状态实时化）· registry 的 fiber 实况对齐器
//
// 钉的是这一格：cordis 的 inject 门控在依赖离场时把 fiber 从 ACTIVE 撤回 PENDING，
// 而 registry 的 `status` 是"装入那一次"的结论（A#18/A#20 的状态源单点）——此前两者
// 之间没有任何回写通路，于是面板同屏两套真相（`docs/add-sub-plugin.md` §3 把这条
// 如实写成了"语义边界"）。对齐器补的就是这条通路，五条件各有一组钉子：
//   ① 周期对齐走 registry **既有** timers 封装，且纳入 `stop()` ⇒ 句柄计数前后对照；
//     启动口归**装配现场**（`panel/manager/registry-host.mjs` 的 hasEvents 分支，与 doctor
//     巡检同一条"最小宿主不留悬挂定时器"规则），不在 `registry.start()` 里 ⇒ 本文件各用例
//     显式调 `startStatusAlign()`。
//   ② fiber→status 映射（含"隔离后不自动重试"不被打破、不碰装载在飞的条目）；
//   ③ 与 doctor 巡检的分工：对齐器只说"当前没在跑"，成因（service-missing）仍归 doctor
//      ⇒ 降级方向**不写 lastError**（写了就是抢 doctor 的活、并把"会自己回来"说成错误）；
//   ④ 去抖：降级需连续 `statusAlignConfirmCount` 次观察，恢复方向即时；
//   ⑤ 契约面零变更：`toEntry()` 不泄漏任何新字段（面板与 SSE 不改一行）。
//
// 夹具 fiber 的 state 取的是 cordis 真值常量（FIBER_*），那组数值由
// `test/cordis-fiber-state.test.mjs` 用真 cordis 对账 ⇒ 替身不引入第二套语义。
// 用替身（HostContext 是 registry 的公共注入面）的唯一理由是"精确控制观察次数"，
// 即去抖与映射逐格那几条；撤依赖/回恢复两条一律走真 cordis + 真 registry。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'

import {
  createRegistry,
  ToolkitRegistryCore,
  FIBER_PENDING,
  FIBER_ACTIVE,
  FIBER_FAILED,
  FIBER_DISPOSED,
  FIBER_UNLOADING,
} from 'dsh-toolkit/registry'
import { contractEventName } from 'dsh-toolkit/contract'

const fixtureDir = (name) => join(import.meta.dirname, 'fixtures', 'registry', name)
const consumerFixture = fixtureDir('inject-consumer-plugin')
const consumerId = 'fixture/inject-consumer'
const pendingFixture = fixtureDir('pending-inject-plugin')
// 该夹具没有 dsh.plugin.json ⇒ 走 legacy 合成，id 由模块的 `name` 派生（实测值）。
const pendingId = 'legacy/fixture-pending-inject'
const NEED = 'fixture/needed'
const STATUS_EVENT = contractEventName('toolkit', 'registry:status-changed')

const silent = { info: () => {}, warn: () => {}, error: () => {} }
const tick = (ms = 40) => new Promise((r) => setTimeout(r, ms))
const timeouts = () => process.getActiveResourcesInfo().filter((h) => h === 'Timeout').length

function tmpStatePath(t, label) {
  const dir = mkdtempSync(join(tmpdir(), `${label}-`))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return join(dir, 'state.json')
}

/** 装到"稳定在 active"，返回栈 + 依赖服务的撤销句柄 + 状态事件收集器。 */
async function activeStack(t, opts = {}) {
  const ctx = new Context()
  const { state } = await import(`file:///${consumerFixture.replace(/\\/g, '/')}/index.js`)
  // 夹具模块是进程内单例，loads 跨用例累加 ⇒ 每条用例开头归零（环境注记①）。
  state.loads = 0
  const created = createRegistry(ctx, {
    servicePrefix: 'toolkit',
    statePath: tmpStatePath(t, 'align-real'),
    retryBackoffMs: 1,
    loadTimeoutMs: 4000,
    autoload: false,
    logger: silent,
    ...opts,
  })
  t.after(() => created.stop())
  // 启动口由装配现场决定（生产在 `registry-host.mjs` 的 hasEvents 分支）；用例里显式启一次。
  created.registry.startStatusAlign()
  const transitions = []
  ctx.on(STATUS_EVENT, (payload) => transitions.push(payload))
  const installing = created.registry.install({ kind: 'local', path: consumerFixture }, { force: true })
  await tick()
  const unprovide = ctx.reflect.provide(NEED, { ok: 1 })
  await installing
  assert.equal(created.registry.get(consumerId).status, 'active', '前置：已稳定在 active')
  transitions.length = 0
  return { ctx, registry: created.registry, state, transitions, unprovide }
}

async function waitForStatus(registry, id, status, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const entry = registry.get(id)
    if (entry?.status === status) return entry
    if (Date.now() > deadline) {
      throw new Error(`等待 ${id} → ${status} 超时；当前 = ${entry?.status ?? 'absent'}`)
    }
    await tick(5)
  }
}

// ── ①②③ 真 cordis 链：撤依赖降级 / 回恢复 / 分工 ─────────────────────────────

test('批5-2 真机链①：依赖离场 → 对齐器把 active 修正为 loading，且只发一条 status-changed', async (t) => {
  const { registry, state, transitions, unprovide } = await activeStack(t, {
    statusAlignIntervalMs: 5,
    statusAlignConfirmCount: 2,
  })
  unprovide()
  await waitForStatus(registry, consumerId, 'loading')

  assert.equal(state.loads, 1, 'apply 不因对齐器重跑（cordis 只是把 fiber 撤下，对齐器不越权重装）')
  const mine = transitions.filter((p) => p.id === consumerId)
  assert.equal(mine.length, 1, `降级只发一条事件，实际 ${JSON.stringify(mine)}`)
  assert.deepEqual(
    { from: mine[0].from, to: mine[0].to, reason: mine[0].reason },
    { from: 'active', to: 'loading', reason: 'align-gated' },
    '事件面复用既有 registry:status-changed（面板与 SSE 零改动）',
  )
  assert.equal(mine[0].error, undefined, '③ 分工：只报"没在跑"，不附带错误（成因归 doctor）')
  assert.equal(registry.get(consumerId).lastError, undefined, '③ 降级方向不得写 lastError')
})

test('批5-2 真机链②：依赖回来 → 一轮观察内即回 active（恢复方向不去抖）', async (t) => {
  const { ctx, registry, state, transitions, unprovide } = await activeStack(t, {
    statusAlignIntervalMs: 5,
    statusAlignConfirmCount: 3,
  })
  unprovide()
  await waitForStatus(registry, consumerId, 'loading')
  transitions.length = 0

  const reProvide = ctx.reflect.provide(NEED, { ok: 2 })
  await waitForStatus(registry, consumerId, 'active')
  const mine = transitions.filter((p) => p.id === consumerId)
  assert.equal(mine.length, 1, `恢复只发一条事件，实际 ${JSON.stringify(mine)}`)
  assert.deepEqual(
    { from: mine[0].from, to: mine[0].to, reason: mine[0].reason },
    { from: 'loading', to: 'active', reason: 'align-recovered' },
  )
  assert.equal(state.loads, 2, '第二次 apply 是 cordis 自己放的（对齐器不触发装载）')
  reProvide()
})

// ── ④⑤ 去抖与映射逐格：替身宿主 + 手工时钟 ──────────────────────────────────
// 与 doctor 巡检的分工（条件④）那一格落在 `test/cordis-inject-lifecycle.test.mjs`
// 的翻面用例里：同一次撤依赖，registry 面报 loading、doctor 面报 service-missing
// error，两条同时成立才算"两面各有其位、互不冒充"。

function fakeClock() {
  const pending = new Map()
  let seq = 0
  const clock = {
    setTimeout: (fn, ms) => {
      const id = ++seq
      pending.set(id, { fn, ms })
      return id
    },
    clearTimeout: (handle) => {
      pending.delete(handle)
    },
    list: () => [...pending.entries()].map(([id, t]) => ({ id, ms: t.ms })),
    /** 只放"周期 == alignMs"那一枚定时器：证明推进的就是对齐器本身。 */
    step: (label = 'align') => {
      const hit = [...pending.entries()].find(([, t]) => t.ms === clock.alignMs)
      assert.ok(hit, `${label}：对齐器定时器不在场（挂起项 = ${JSON.stringify(clock.list())}）`)
      const [id, task] = hit
      pending.delete(id)
      task.fn()
    },
    /** 放行全部挂起项（含 loadEntry 的 5ms 轮询）——用于"让装载链自己走完归因"。 */
    stepAll: () => {
      const list = [...pending.entries()]
      pending.clear()
      for (const [, task] of list) task.fn()
      return list.length
    },
    alignMs: 0,
  }
  return clock
}

function fakeHost(fiberState = FIBER_ACTIVE) {
  const host = {
    pluginCalls: 0,
    fibers: [],
    events: [],
    plugin() {
      host.pluginCalls += 1
      const fiber = {
        state: fiberState,
        disposeCalls: 0,
        dispose() {
          fiber.disposeCalls += 1
          fiber.state = FIBER_DISPOSED
        },
        await: () => Promise.resolve(undefined),
      }
      host.fibers.push(fiber)
      return fiber
    },
    emit(event, payload) {
      host.events.push({ event, payload })
    },
    provideService() {},
    hasService: () => true,
  }
  return host
}

/** 替身宿主栈：默认装一条 active 条目；`fiberState` 决定新 fiber 的初态。 */
async function fakeStack(opts = {}, { autoInstall = true, fiberState = FIBER_ACTIVE } = {}) {
  const clock = fakeClock()
  clock.alignMs = opts.statusAlignIntervalMs ?? 5000
  const host = fakeHost(fiberState)
  const dir = mkdtempSync(join(tmpdir(), 'align-fake-'))
  const registry = new ToolkitRegistryCore(host, {
    servicePrefix: 'toolkit',
    statePath: join(dir, 'state.json'),
    autoload: false,
    logger: silent,
    timers: clock,
    ...opts,
  })
  registry.start()
  registry.startStatusAlign() // 同上：显式走装配现场的启动口
  if (autoInstall) await registry.install({ kind: 'local', path: consumerFixture }, { force: true })
  // 只统计"install 之后"的事件：`installed→loading→active` 那两条是装载链自己的，
  // 不是对齐器的叙事，混进来会把"零事件"这类判据变成永真。
  const baseline = host.events.length
  const transitions = () => host.events.slice(baseline).filter((e) => e.event === STATUS_EVENT).map((e) => e.payload)
  return { clock, host, registry, transitions, cleanup: async () => { await registry.stop(); rmSync(dir, { recursive: true, force: true }) } }
}

test('批5-2 去抖判据：单次非 ACTIVE 观察不翻面，连续两次才翻（confirmCount=2）', async () => {
  const s = await fakeStack({ statusAlignIntervalMs: 5000, statusAlignConfirmCount: 2 })
  try {
    assert.equal(s.registry.get(consumerId).status, 'active', '前置：active')
    assert.equal(s.transitions().length, 0, '前置：install 之后无残留状态事件')
    assert.equal(s.clock.list().length, 1, `对齐器只占一枚常驻定时器，实际 ${JSON.stringify(s.clock.list())}`)

    s.host.fibers[0].state = FIBER_PENDING
    s.clock.step('第一次观察')
    assert.equal(s.registry.get(consumerId).status, 'active', '未达连续次数 ⇒ 不动状态')
    assert.equal(s.transitions().length, 0, '未达连续次数 ⇒ 不发事件（事件风暴防线）')

    s.clock.step('第二次观察')
    assert.equal(s.registry.get(consumerId).status, 'loading', '连续两次 ⇒ 修正为实况')
    assert.equal(s.transitions().length, 1, '翻面恰好一条')
  } finally {
    await s.cleanup()
  }
})

test('批5-2 抖动零事件：非 ACTIVE 与 ACTIVE 在窗口内往复 ⇒ 一条事件都不发', async () => {
  const s = await fakeStack({ statusAlignIntervalMs: 5000, statusAlignConfirmCount: 2 })
  try {
    const fiber = s.host.fibers[0]
    for (let i = 0; i < 3; i++) {
      fiber.state = FIBER_PENDING
      s.clock.step('抖动：非 ACTIVE')
      fiber.state = FIBER_ACTIVE
      s.clock.step('抖动：回 ACTIVE')
    }
    assert.equal(s.registry.get(consumerId).status, 'active')
    assert.equal(s.transitions().length, 0, `抖动不应产生事件，实际 ${JSON.stringify(s.transitions())}`)
  } finally {
    await s.cleanup()
  }
})

test('批5-2 映射 FAILED → error（错误码复用契约 fiber-failed）', async () => {
  const s = await fakeStack({ statusAlignIntervalMs: 1000, statusAlignConfirmCount: 1 })
  try {
    s.host.fibers[0].state = FIBER_FAILED
    s.clock.step('FAILED')
    const entry = s.registry.get(consumerId)
    assert.equal(entry.status, 'error', 'fiber 真失败必须落到 error 面')
    assert.equal(entry.lastError?.code, 'fiber-failed', '不新增错误码（契约 FIBER_LOAD_ERROR_CODES 已有）')
    assert.equal(s.transitions().length, 1)
  } finally {
    await s.cleanup()
  }
})

test('批5-2 映射 DISPOSED → error（fiber 已销毁，对齐器不复活它）', async () => {
  const s = await fakeStack({ statusAlignIntervalMs: 1000, statusAlignConfirmCount: 1 })
  try {
    const fiber = s.host.fibers[0]
    fiber.state = FIBER_DISPOSED
    s.clock.step('DISPOSED')
    const entry = s.registry.get(consumerId)
    assert.equal(entry.status, 'error')
    assert.equal(entry.lastError?.code, 'fiber-disposed')
    assert.equal(fiber.disposeCalls, 0, '对齐器只读实况，绝不去 dispose 别人持有的 fiber')
    s.clock.step('再来一轮')
    assert.equal(s.transitions().length, 1, 'error 面已定型 ⇒ 不反复播报')
  } finally {
    await s.cleanup()
  }
})

test('批5-2 映射 UNLOADING：过渡态计入观察但不判错，回 ACTIVE 即清零计数', async () => {
  const s = await fakeStack({ statusAlignIntervalMs: 1000, statusAlignConfirmCount: 2 })
  try {
    const fiber = s.host.fibers[0]
    fiber.state = FIBER_UNLOADING
    s.clock.step('UNLOADING 第一次')
    assert.equal(s.registry.get(consumerId).status, 'active', '单次观察不翻面')
    fiber.state = FIBER_ACTIVE
    s.clock.step('中间回到 ACTIVE')
    fiber.state = FIBER_UNLOADING
    s.clock.step('UNLOADING 又一次')
    assert.equal(s.registry.get(consumerId).status, 'active', 'ACTIVE 那一轮必须清零计数（过渡态抖动不累计成降级）')
    s.clock.step('UNLOADING 第二次')
    assert.equal(s.registry.get(consumerId).status, 'loading', '持续非 ACTIVE 才修正，且归 loading 不归 error')
    assert.equal(s.registry.get(consumerId).lastError, undefined)
    assert.equal(s.transitions().length, 1)
  } finally {
    await s.cleanup()
  }
})

test('批5-2 真 cordis 面对照：在飞条目从 PENDING 到超时隔离，全程无 align 事件', async (t) => {
  const ctx = new Context()
  const created = createRegistry(ctx, {
    servicePrefix: 'toolkit',
    statePath: tmpStatePath(t, 'align-inflight'),
    autoload: false,
    logger: silent,
    statusAlignIntervalMs: 5,
    statusAlignConfirmCount: 1,
    retryBackoffMs: 1,
    retryLimit: 0,
    loadTimeoutMs: 120,
  })
  t.after(() => created.stop())
  created.registry.startStatusAlign()
  const transitions = []
  ctx.on(STATUS_EVENT, (payload) => transitions.push(payload))
  // 该夹具 inject 了一个永不出现的服务 ⇒ fiber 恒 PENDING，loadEntry 自己盯到超时。
  const result = await created.registry.install({ kind: 'local', path: pendingFixture }, { force: true })
  assert.equal(result.ok, true, '注册成功但装入失败（REQ-2 隔离语义）')
  assert.equal(created.registry.get(pendingId).status, 'quarantined', '超时归因仍由 loadEntry 那一套说了算')
  const alignEvents = transitions.filter((p) => String(p.reason ?? '').startsWith('align-'))
  assert.equal(alignEvents.length, 0, `在飞/隔离条目不得出现对齐器事件：${JSON.stringify(transitions)}`)
})

test('批5-2 越权防线（可观测版）：在飞条目的失败归因必须出自 loadEntry，对齐器不抢发', async () => {
  // 这一发钉的是"只碰 active / 只碰自己降过级的条目"那道守卫的**可观测面**：
  // 抢发的形态 = 对齐器先于装载链把在飞条目写成 error 并挂上 `align-*` 归因
  // ⇒ 同一次失败出现两个作者，A2 那套错误码归因面被扰动。
  // 如实记一条方法教训：本发之前的那条（真 cordis 面）只断言"没出现 align 事件"，
  // 对这道守卫**并不充分** —— 状态没变时 `setStatus` 是 no-op、不发事件，M3 变异首跑
  // 因此 0 红。要把守卫钉住，就得让守卫被摘掉后确实有一次"抢发的翻面"可观察，本发就是。
  const s = await fakeStack(
    { statusAlignIntervalMs: 1000, statusAlignConfirmCount: 1, loadTimeoutMs: 60_000, retryLimit: 0, retryBackoffMs: 60_000 },
    { autoInstall: false, fiberState: FIBER_PENDING },
  )
  try {
    const installing = s.registry.install({ kind: 'local', path: consumerFixture }, { force: true })
    for (let i = 0; i < 10 && s.registry.get(consumerId)?.status !== 'loading'; i++) {
      s.clock.stepAll()
      await tick(3)
    }
    assert.equal(s.registry.get(consumerId).status, 'loading', '前置：条目卡在装载里（fiber PENDING，loadEntry 自己盯着）')

    s.host.fibers[0].state = FIBER_FAILED
    s.clock.step('只放对齐器一轮')
    await tick(5)
    const stolen = s.transitions().filter((p) => String(p.reason ?? '').startsWith('align-'))
    assert.equal(stolen.length, 0, `对齐器不得抢发在飞条目的归因：${JSON.stringify(stolen)}`)
    assert.equal(s.registry.get(consumerId).status, 'loading', '守卫在位 ⇒ 对齐器这一轮之后仍是 loadEntry 的 loading')

    s.clock.stepAll()
    await tick(5)
    const seq = s.transitions().map((p) => `${p.from}->${p.to}:${p.reason}`)
    assert.ok(
      seq.some((line) => line === 'loading->error:load-failed'),
      `失败须由 loadEntry 自己判定，实际序列 ${JSON.stringify(seq)}`,
    )
    assert.equal(s.registry.get(consumerId).lastError?.code, 'fiber-failed', '错误码出自装载链的 fiber 归因（A2），不是对齐器编的')
    assert.equal(s.transitions().filter((p) => String(p.reason ?? '').startsWith('align-')).length, 0,
      '全程零抢发：归因面只有装载链一个作者')
    await installing
  } finally {
    await s.cleanup()
  }
})

test('批5-2 隔离语义不打架：quarantined 条目对齐器不动、不重装、不播报', async () => {
  const s = await fakeStack(
    { statusAlignIntervalMs: 1000, statusAlignConfirmCount: 1, retryLimit: 0, retryBackoffMs: 1, loadTimeoutMs: 10 },
    { autoInstall: false, fiberState: FIBER_FAILED },
  )
  try {
    await s.registry.install({ kind: 'local', path: consumerFixture }, { force: true })
    const entry = s.registry.get(consumerId)
    assert.equal(entry.status, 'quarantined', `前置：隔离态，实际 ${entry.status}`)
    const callsAfter = s.host.pluginCalls
    const eventsAfter = s.transitions().length
    for (let i = 0; i < 4; i++) s.clock.step('隔离后')
    assert.equal(s.registry.get(consumerId).status, 'quarantined', '隔离态维持原样（对齐器不复活、不重试）')
    assert.equal(s.host.pluginCalls, callsAfter, '对齐器绝不新建 fiber')
    assert.equal(s.transitions().length, eventsAfter, '隔离后零新事件')
  } finally {
    await s.cleanup()
  }
})

// ── ① 句柄账 / ⑤ 契约面零泄漏 ───────────────────────────────────────────────

test('批5-2 句柄账：对齐器复用 timers 封装，start 后在场、stop() 后回到基线', async (t) => {
  const before = timeouts()
  const created = createRegistry(new Context(), {
    servicePrefix: 'toolkit',
    statePath: tmpStatePath(t, 'align-handle'),
    autoload: false,
    logger: silent,
    statusAlignIntervalMs: 200,
  })
  created.registry.startStatusAlign()
  const during = timeouts()
  assert.ok(during >= before + 1, `start() 后对齐器定时器必须在场：before=${before} during=${during}`)
  await created.stop()
  const after = timeouts()
  assert.ok(after <= before, `stop() 必须清掉对齐器定时器（否则污染 panel-sse-dispose 的句柄计数）：before=${before} after=${after}`)
})

test('批5-2 显式关闭可见：statusAlignIntervalMs<=0 ⇒ 不留句柄，也不半途生效', async (t) => {
  const before = timeouts()
  const { registry, state, unprovide } = await activeStack(t, { statusAlignIntervalMs: 0 })
  assert.equal(timeouts(), before, `关闭时不留句柄：before=${before} now=${timeouts()}`)
  assert.equal(registry.statusAlignRunning(), false, 'interval<=0 ⇒ 启动口拒绝启动（可见，不是半途生效）')
  assert.equal(registry.get(consumerId).status, 'active')
  unprovide()
  await tick(150)
  assert.equal(registry.get(consumerId).status, 'active', '关闭即保持旧口径（可预期），不是"改了但不干净"')
  assert.equal(state.loads, 1)
})

test('批5-2 契约面零变更：对齐器不往条目视图泄漏新字段（面板与 SSE 不改一行）', async () => {
  const s = await fakeStack({ statusAlignIntervalMs: 1000, statusAlignConfirmCount: 1 })
  try {
    const keys = Object.keys(s.registry.get(consumerId)).sort()
    assert.deepEqual(keys, ['config', 'legacy', 'manifest', 'status'], 'toEntry() 的字段集合与 HEAD 相同')
    s.host.fibers[0].state = FIBER_PENDING
    s.clock.step()
    assert.deepEqual(
      Object.keys(s.registry.get(consumerId)).sort(),
      ['config', 'legacy', 'manifest', 'status'],
      '降级后同样不加字段（fiber state 不外露）',
    )
    const listed = s.registry.list()[0]
    assert.equal('fiberState' in listed, false, 'list() 也不泄漏内部观察字段')
    assert.equal('alignObserved' in listed, false)
  } finally {
    await s.cleanup()
  }
})
