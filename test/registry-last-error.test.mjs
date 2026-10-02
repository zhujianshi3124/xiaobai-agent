// D-8 · lastError 生命周期（Pack F3）
//
// `lastError` 是**当前状态**字段，不是历史台账。旧实现只在失败路径写它、转 ACTIVE
// 后不回空 ⇒ E1 实测到面板同屏显示"运行中"和"最近错误 fiber-load-timeout"。
// 修在状态源（registry 的 setStatus，五条到 ACTIVE 的路径都经过它），本文件把
// **内存 / 磁盘 / API 载荷** 三个消费面各自钉一遍，另加一条防过度修复的用例
// （失败仍留在 error 态时 lastError 必须还在，否则错误就没了着落）。
//
// 夹具是本目录专用的 last-error-plugin，不复用 contract-plugin：测试文件之间并发跑，
// 而 marker.flag 是磁盘上的共享开关，与 registry/panel-v2 的 S4 系列互抢必然偶发翻红。
// 为什么第 5 例直驱 route handler + response 桩而不开真 http server：Node 24/Windows
// 上本文件与其他测试同批并发跑会命中 libuv 断言（src\win\async.c:94）把整个文件判
// 失败，与被测产品无关（同一结论见 test/panel-sse-dispose.test.mjs 头注）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'

import { createRegistry, ToolkitRegistryCore, cordisHost } from 'xiaobai-agent/registry'
import { createV2Api } from '../panel/manager/v2-api.mjs'

const fixtureDir = (name) => join(import.meta.dirname, 'fixtures', 'registry', name)
const lastErrorPlugin = fixtureDir('last-error-plugin')
const markerPath = join(lastErrorPlugin, 'marker.flag')
const PLUGIN_ID = 'fixture/last-error-plugin'

function setMarker(exists) {
  if (exists) writeFileSync(markerPath, '', 'utf8')
  else if (existsSync(markerPath)) unlinkSync(markerPath)
}

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms))

async function waitForStatus(registry, id, status, timeoutMs = 2000) {
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

function makeRegistry(t, opts = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'last-error-'))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const ctx = new Context()
  const statePath = join(tmp, 'state', 'registry-state.json')
  const created = createRegistry(ctx, {
    servicePrefix: 'toolkit',
    statePath,
    retryBackoffMs: 1,
    loadTimeoutMs: 250,
    retryLimit: 0,
    autoload: false,
    ...opts,
  })
  t.after(() => created.stop())
  return { ...created, ctx, tmp, statePath }
}

function readRecord(statePath, id = PLUGIN_ID) {
  const raw = JSON.parse(readFileSync(statePath, 'utf8'))
  return raw.plugins[id]
}

test('F3：quarantined → enable 成功 → 内存条目与磁盘记录同时不再带 lastError', async (t) => {
  setMarker(false)
  const { registry, statePath } = makeRegistry(t)
  const installed = await registry.install({ kind: 'local', path: lastErrorPlugin })
  assert.equal(installed.ok, true, '注册 ≠ 装入成功（隔离语义）')
  const quarantined = await waitForStatus(registry, PLUGIN_ID, 'quarantined')
  assert.ok(quarantined.lastError, '前置：隔离态必须带 lastError')
  assert.ok(readRecord(statePath).lastError, '前置：磁盘记录也带 lastError')

  setMarker(true)
  await registry.setEnabled(PLUGIN_ID, true)
  const active = await waitForStatus(registry, PLUGIN_ID, 'active')
  assert.equal('lastError' in active, false, 'ACTIVE 的条目不得再有 lastError 键（toEntry 的条件展开）')
  assert.equal(readRecord(statePath).lastError, undefined, '磁盘记录同步回空（内存与磁盘同进退）')
  assert.equal('lastError' in readRecord(statePath), false)
})

test('F3：install 失败 → 卸载 → 修好后同 id 重装成功 → 同样干净（E1 实测路径）', async (t) => {
  setMarker(false)
  const { registry, statePath } = makeRegistry(t)
  await registry.install({ kind: 'local', path: lastErrorPlugin })
  const failed = await waitForStatus(registry, PLUGIN_ID, 'quarantined')
  assert.match(failed.lastError.message, /marker missing/, '前置：apply 抛错原文如实保留')

  await registry.uninstall(PLUGIN_ID)
  assert.equal(registry.get(PLUGIN_ID), undefined)
  setMarker(true)
  const again = await registry.install({ kind: 'local', path: lastErrorPlugin })
  assert.equal(again.ok, true)
  assert.equal(again.entry.status, 'active')
  assert.equal('lastError' in again.entry, false, 'install 返回的条目本身就要是干净的')
  assert.equal('lastError' in readRecord(statePath), false)
})

test('F3 防过度修复：仍停在 error 态时 lastError 必须保留（不是无条件删）', async (t) => {
  setMarker(false)
  const { registry } = makeRegistry(t, { retryLimit: 5 })
  await registry.install({ kind: 'local', path: lastErrorPlugin })
  const errored = await waitForStatus(registry, PLUGIN_ID, 'error')
  assert.match(errored.lastError.message, /marker missing/)
  assert.ok(errored.lastError.at > 0, '关联时间字段随 lastError 一起在失败态保留')
  await tick(30)
  assert.match(registry.get(PLUGIN_ID).lastError.message, /marker missing/, '自动重试期间不清当前错误')
})

test('F3：/v2/snapshot 载荷里 lastError 由对象回到 null（面板卡片读的就是这一格）', async (t) => {
  setMarker(false)
  const { registry } = makeRegistry(t)
  await registry.install({ kind: 'local', path: lastErrorPlugin })
  await waitForStatus(registry, PLUGIN_ID, 'quarantined')

  const v2 = createV2Api({ registry, doctor: undefined, servicePrefix: 'toolkit', subscribe: () => () => {} })
  const route = v2.routes.find((r) => r.method === 'GET' && r.path.endsWith('/snapshot'))
  const readSnapshot = async () => {
    const chunks = []
    const response = {
      writeHead() { return response },
      end(body) { chunks.push(String(body ?? '')) },
    }
    await route.handler({}, response)
    return JSON.parse(chunks.join(''))
  }

  const before = await readSnapshot()
  const row0 = before.plugins.find((p) => p.id === PLUGIN_ID)
  assert.equal(row0.status, 'quarantined')
  assert.match(row0.lastError.message, /marker missing/, '前置：API 载荷如实带错误原文')

  setMarker(true)
  await registry.setEnabled(PLUGIN_ID, true)
  await waitForStatus(registry, PLUGIN_ID, 'active')
  const after = await readSnapshot()
  const row1 = after.plugins.find((p) => p.id === PLUGIN_ID)
  assert.equal(row1.status, 'active')
  assert.equal(row1.lastError, null, '面板渲染判的是 `p.lastError ? …`，必须是 null 才不再画红条')
})

test('F3：autoload 恢复成功 → 内存与磁盘记录一起回空（跨进程重启的真实形态）', async (t) => {
  setMarker(false)
  const first = makeRegistry(t)
  await first.registry.install({ kind: 'local', path: lastErrorPlugin })
  await waitForStatus(first.registry, PLUGIN_ID, 'quarantined')
  const stale = readRecord(first.statePath)
  assert.ok(stale.lastError, '前置：上一进程的失败已落盘')
  await first.stop()

  setMarker(true)
  const ctx2 = new Context()
  const tmp2 = mkdtempSync(join(tmpdir(), 'last-error-restart-'))
  t.after(() => rmSync(tmp2, { recursive: true, force: true }))
  const core2 = new ToolkitRegistryCore(cordisHost(ctx2), {
    servicePrefix: 'toolkit',
    statePath: first.statePath,
    retryBackoffMs: 1,
    loadTimeoutMs: 250,
    retryLimit: 0,
    autoload: true,
  })
  core2.start()
  t.after(() => core2.stop())
  const restored = await waitForStatus(core2, PLUGIN_ID, 'active')
  assert.equal('lastError' in restored, false, '恢复成功的项不得把上一进程的失败当当前状态')
  assert.equal('lastError' in readRecord(first.statePath), false, '磁盘记录随恢复成功一起回空')
})

test('F3：同一条目 reload 失败 → 修复 → 再 reload 成功 → 当前错误回空（不经 uninstall 重建条目）', async (t) => {
  setMarker(false)
  const { registry, statePath } = makeRegistry(t)
  await registry.install({ kind: 'local', path: lastErrorPlugin })
  await waitForStatus(registry, PLUGIN_ID, 'quarantined')

  setMarker(true)
  // 命门：这一条走的是 reload（unloadEntry + loadEntry，同一条目对象），
  // 不像 uninstall + install 那样换掉条目、天然不留旧字段。
  await registry.reload(PLUGIN_ID)
  const active = await waitForStatus(registry, PLUGIN_ID, 'active')
  assert.equal(active.status, 'active')
  assert.equal('lastError' in active, false, 'reload 成功后当前状态面必须干净')
  assert.equal('lastError' in readRecord(statePath), false)
})
