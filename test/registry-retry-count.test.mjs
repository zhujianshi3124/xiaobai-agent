// D-9 · 重试计数跨段结转（H4）
//
// 语义：`retryAttempts` 是"**当前这段**连续失败次数"。修复前只有 unloadEntry /
// setEnabled(true) / reload 会清零 ⇒ 上一段留下的计数结转进下一段故障，最坏情形
// （默认 retryLimit=3）第 2 次真故障就被隔离，且隔离提示里的"连续失败 N 次达到上限"
// 那个 N 比实际大。现在转 ACTIVE 即归零（与 D-8 的 lastError 同走状态源 setStatus）。
//
// 计时用"混合 fake timer"：退避定时器（≥50ms）抓在手里由用例手动放行，
// fiber 轮询的 5ms 仍走真定时器——否则 loadEntry 的轮询 await 永远不推进。
// 等待一律用条件轮询（不用固定 sleep）：全量批跑时机器满载，固定延时会假红。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'

import { createRegistry } from 'xiaobai-agent/registry'
import { contractEventName } from 'xiaobai-agent/contract'

const ROOT = resolve(import.meta.dirname, '..')
const FIXTURE = join(ROOT, 'test', 'fixtures', 'registry', 'flaky-probe-plugin')
const ID = 'fixture/flaky-probe-plugin'
/** 本栈显式钉住的对齐器周期（不用实现缺省值，免得缺省一改本文件的分账就失真）。 */
const ALIGN_MS = 5000
const probe = await import(pathToFileURL(join(FIXTURE, 'index.js')).href)
const silent = { info: () => {}, warn: () => {}, error: () => {} }

async function waitFor(label, predicate, timeoutMs = 5000) {
  const t0 = Date.now()
  for (;;) {
    let value
    try {
      value = predicate()
    } catch {
      value = false
    }
    if (value) return value
    if (Date.now() - t0 > timeoutMs) throw new Error(`等待超时：${label}`)
    await new Promise((r) => setTimeout(r, 5))
  }
}

function makeTimers() {
  const queued = new Map()
  const label = { alignMs: 0 }
  let seq = 0
  const isAlign = (t) => t.ms === label.alignMs && label.alignMs > 0
  return {
    timers: {
      setTimeout: (fn, ms) => {
        if (ms < 50) return setTimeout(fn, ms) // fiber 轮询等短延时走真定时器
        const id = ++seq
        queued.set(id, { fn, ms })
        return id
      },
      clearTimeout: (handle) => {
        if (typeof handle === 'number' && queued.has(handle)) queued.delete(handle)
        else clearTimeout(handle)
      },
    },
    /**
     * 放行当前排队的**重试**定时器（不等它们跑完，由 waitFor 收敛）。
     * 【批 5-2 起本栈里有两枚常驻 ≥50ms 定时器】重试退避 + fiber 实况对齐器。
     * 对齐器那一枚**按周期点名、不混进重试计数**（`pendingAlign()`），
     * 这样"恰好一次重试"这句话仍然是它原来的意思 —— 不是放宽，是把新增那只句柄记账清楚。
     */
    fireAll: () => {
      const list = [...queued.entries()].filter(([, t]) => !isAlign(t))
      for (const [id] of list) queued.delete(id)
      for (const [, t] of list) t.fn()
      return list.length
    },
    pending: () => [...queued.values()].filter((t) => !isAlign(t)).length,
    /** 对齐器定时器当前挂着几枚（0 = 已关或被清）。 */
    pendingAlign: () => [...queued.values()].filter(isAlign).length,
    setAlignMs: (ms) => {
      label.alignMs = ms
    },
  }
}

function makeRegistry(t, opts) {
  const dir = mkdtempSync(join(tmpdir(), 'd9-retry-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const ctx = new Context()
  const clock = makeTimers()
  clock.setAlignMs(ALIGN_MS) // 先登记周期，再 start() ⇒ 对齐器那枚可被单独点名
  const created = createRegistry(ctx, {
    servicePrefix: 'toolkit',
    statePath: join(dir, 'state.json'),
    autoload: false,
    retryBackoffMs: 500,
    loadTimeoutMs: 300,
    statusAlignIntervalMs: ALIGN_MS,
    logger: silent,
    timers: clock.timers,
    ...opts,
  })
  // 批 5-2：对齐器的启动口归装配现场（生产在 registry-host 的 hasEvents 分支），
  // 这里显式启一次，让"退避定时器 + 对齐器定时器"两枚同栈共存的分账被真跑到。
  created.registry.startStatusAlign()
  const registry = created.registry
  t.after(() => registry.stop())
  const transitions = []
  ctx.on(contractEventName('toolkit', 'registry:status-changed'), (payload) => transitions.push(payload))
  const status = () => registry.get(ID)?.status
  const attempts = () => registry.retryAttemptsOf(ID)
  return { registry, clock, transitions, status, attempts }
}

test('D-9：重试若干次后成功 ⇒ 计数归零（修复前会把上一段的计数留着）', async (t) => {
  probe.reset()
  probe.setFailing(true)
  const { registry, clock, status, attempts } = makeRegistry(t, { retryLimit: 5 })
  const result = await registry.install({ kind: 'local', path: FIXTURE })
  assert.equal(result.ok, true)
  assert.equal(status(), 'error')
  assert.equal(attempts(), 1, '首段第一次失败')
  assert.equal(clock.pendingAlign(), 1, '批 5-2 记账：对齐器那枚定时器在场，且与重试分开数（不许混进"重试次数"）')

  assert.equal(clock.fireAll(), 1, '应当恰好排着一次重试')
  await waitFor('第二次尝试失败', () => attempts() === 2)
  assert.equal(status(), 'error')

  // 依赖回来了：下一次重试即成功。
  probe.setFailing(false)
  assert.equal(clock.fireAll(), 1)
  await waitFor('转 ACTIVE', () => status() === 'active')
  assert.equal(registry.get(ID).lastError, undefined, 'D-8 语义保持：转 ACTIVE 即清当前错误')
  assert.equal(attempts(), 0, 'D-9 本体：成功即归零，不得把上一段的 2 次结转进下一段')
})

test('D-9 旁证：新故障段按当段计数、到上限才隔离（注：这条不由本笔修复单独决定，见文末）', async (t) => {
  probe.reset()
  probe.setFailing(false)
  const { registry, clock, status, attempts } = makeRegistry(t, { retryLimit: 2 })
  await registry.install({ kind: 'local', path: FIXTURE })
  assert.equal(status(), 'active')

  probe.setFailing(true)
  await registry.setConfig(ID, { again: true })
  assert.equal(status(), 'error')
  assert.equal(attempts(), 1, '新故障段从 1 开始')

  probe.setFailing(false)
  clock.fireAll()
  await waitFor('重试成功转 ACTIVE', () => status() === 'active')
  assert.equal(attempts(), 0, '成功即归零（本笔的不变式）')

  probe.setFailing(true)
  await registry.setConfig(ID, { again: false })
  assert.equal(attempts(), 1, 'setConfig 在 active 态先 unload 再 load ⇒ 新段仍从 1 开始（不是叠在旧段上）')
  assert.equal(status(), 'error')
  clock.fireAll() // 第 2 次
  await waitFor('第 2 次失败', () => attempts() === 2)
  assert.notEqual(status(), 'quarantined', 'retryLimit=2 ⇒ 还没到上限')
  clock.fireAll() // 第 3 次 > 2 → 隔离
  await waitFor('进隔离', () => status() === 'quarantined')
  assert.equal(attempts(), 3, '计数按当段累计（跨段不结转）')
})

test('D-9：隔离提示里的 N 就是当段连续失败次数（不再是跨段的虚高值）', async (t) => {
  probe.reset()
  probe.setFailing(true)
  const { registry, clock, transitions, attempts } = makeRegistry(t, { retryLimit: 2 })
  await registry.install({ kind: 'local', path: FIXTURE })
  clock.fireAll()
  await waitFor('第 2 次失败', () => attempts() === 2)
  clock.fireAll()
  await waitFor('第 3 次失败 → 隔离', () => attempts() === 3)
  const quarantined = transitions.find((x) => x.to === 'quarantined')
  assert.ok(quarantined, 'retryLimit=2 时第 3 次失败应进隔离')
  assert.match(quarantined.reason ?? '', /连续失败 2 次达到上限/,
    `提示须报当段真实值：实际文案 "${quarantined.reason}"`)
})

// 注（如实申报，写进 D-9 关账）：变异自检 = 把成功路径的归零摘掉（重建 dist 后跑），
// 前两条用例精确翻红、第三条（纯失败段、中间没有成功）仍绿 —— 与本笔的语义范围一致。
// 另外一条更正过程值得留着：第一次跑变异时"只有第一条翻红"，原因是我摘完实现忘了
// 重建 registry/dist，用例读的是陈旧产物；重建后第二条也被证明是有效守卫。
// 还有一格如实收窄：D-9 原文担心"跨段结转 ⇒ 更早隔离"，实测现存的每段入口路径
// （setEnabled(true) / reload / active 态 setConfig）都会先经 unloadEntry 清零，所以真实
// 暴露面是"经重试转成功"后留在条目上的计数（诊断面/后续改动会读）与隔离文案 N 的口径。
// 本笔把不变式收到状态源（setStatus）上：计数从此只有"当段"一个含义；不夸大它挡掉的事故。
