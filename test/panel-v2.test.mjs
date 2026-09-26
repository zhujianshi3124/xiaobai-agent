// P4 面板 v2 API 测试：SSE 真流（Q3）、connector 断连降级轮询/恢复切回（Q3 双路径）、
// confirm 校验（用户要求 3）、失败反馈 error.code/message、snapshot 结构、config 写回。
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtempSync, rmSync, writeFileSync, unlinkSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'

import { ToolkitRegistryCore, cordisHost } from '@local/dsh-toolkit/registry'
import { createDoctor } from '@local/dsh-toolkit/doctor'
// panel 内部模块走相对路径（package exports 只暴露 contract/registry/doctor 三个公共子路径）
import { createV2Api, toPanelRoutes } from '../panel/manager/v2-api.mjs'
import { createRealtimeConnector } from '../panel/manager/realtime-connector.mjs'

const fixtureDir = (name) => join(import.meta.dirname, 'fixtures', 'registry', name)
const contractPlugin = fixtureDir('contract-plugin')
// D-10：本文件独占的夹具开关（与 registry.test.mjs / panel-unified.test.mjs 同构）——
// 三家过去共用仓内那一枚 marker.flag，并行跑文件时互相覆盖，复用夹具的新用例偶发翻红。
const markerPath = join(tmpdir(), `dsh-fixture-marker-${process.pid}-panel-v2`)
process.env.FIXTURE_MARKER = markerPath
process.on('exit', () => { try { unlinkSync(markerPath) } catch { /* 已清 */ } })
function setMarker(exists) {
  if (exists) writeFileSync(markerPath, '', 'utf8')
  else if (existsSync(markerPath)) unlinkSync(markerPath)
}

function fakeProbes() {
  return {
    nodeVersion: () => '24.19.0',
    dshVersion: () => '0.1.5-rc.1',
    hasEnv: () => true,
    hasBinary: () => true,
    portFree: async () => true,
    fsAccessible: async () => true,
    apiReachable: async () => true,
    hasService: () => false,
  }
}

async function makeStack(t) {
  const tmp = mkdtempSync(join(tmpdir(), 'panel-v2-'))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const ctx = new Context()
  const registry = new ToolkitRegistryCore(cordisHost(ctx), {
    servicePrefix: 'toolkit',
    statePath: join(tmp, 'state.json'),
    retryBackoffMs: 1,
    loadTimeoutMs: 250,
    autoload: false,
  })
  const doc = createDoctor(ctx, { servicePrefix: 'toolkit', watchInterval: 0, probes: fakeProbes() }, registry)
  registry.setPrecheck((source) => doc.doctor.precheck(source))

  // subscribe 用真实 cordis 事件总线（与生产 panel/index.js 相同语义）
  const v2 = createV2Api({
    registry,
    doctor: doc.doctor,
    servicePrefix: 'toolkit',
    subscribe: (name, cb) => {
      const disposer = ctx.on(name, cb)
      return () => {
        try { disposer() } catch { /* noop */ }
      }
    },
  })
  const routes = toPanelRoutes(v2.routes)

  const server = http.createServer(async (request, response) => {
    const path = request.url.split('?')[0]
    const route = routes.find((r) => r.path === path)
    if (!route) {
      response.writeHead(404)
      response.end()
      return
    }
    if (request.method !== route.method) {
      response.writeHead(405, { allow: route.method })
      response.end()
      return
    }
    await route.handler(request, response)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  t.after(() => {
    doc.stop()
    void registry.stop()
    server.close()
  })
  return { ctx, registry, doctor: doc.doctor, base }
}

function post(base, path, body) {
  return fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  }).then(async (r) => ({ status: r.status, json: await r.json() }))
}

async function waitFor(predicate, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (predicate()) return
    if (Date.now() > deadline) throw new Error(message + `（等待超时 ${timeoutMs}ms）`)
    await new Promise((r) => setTimeout(r, 15))
  }
}

// ── SSE 真流（Q3 裁决：事件流 + install 操作实时可见）──────────────────────

// 原生 SSE 测试客户端（Node 无全局 EventSource；直接验证线协议）
async function openSSE(base) {
  const controller = new AbortController()
  const response = await fetch(base + '/api/toolkit-panel/v2/events', {
    signal: controller.signal,
    headers: { accept: 'text/event-stream' },
  })
  assert.equal(response.status, 200)
  const events = []
  let buffer = ''
  const pump = async () => {
    const decoder = new TextDecoder()
    const reader = response.body.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) return
        buffer += decoder.decode(value, { stream: true })
        let idx
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 2)
          const lines = block.split('\n')
          const nameLine = lines.find((l) => l.startsWith('event: '))
          const dataLine = lines.find((l) => l.startsWith('data: '))
          if (nameLine) {
            events.push({ name: nameLine.slice(7).trim(), data: dataLine ? JSON.parse(dataLine.slice(6)) : null })
          }
        }
      }
    } catch {
      // 连接被中止：正常结束路径
    }
  }
  void pump()
  return { events, close: () => controller.abort() }
}

test('SSE 真流：连接 → hello → install → plugin-added 与 status-changed 实时到达', async (t) => {
  setMarker(true)
  const { registry, base } = await makeStack(t)
  const stream = await openSSE(base)
  t.after(() => stream.close())

  await waitFor(() => stream.events.some((e) => e.name === 'hello'), 2000, 'hello 未到达')

  const result = await registry.install({ kind: 'local', path: contractPlugin })
  assert.equal(result.ok, true)

  await waitFor(
    () => stream.events.some((e) => e.name === 'plugin-added') &&
          stream.events.some((e) => e.name === 'status-changed' && e.data?.to === 'active'),
    2000,
    'install 事件未实时到达：' + JSON.stringify(stream.events.map((e) => e.name)),
  )
})

// ── connector 双路径（Q3 裁决原文：断连降级轮询 + 恢复切回，都要有测试）────

test('connector：SSE 断连 → 自动降级轮询 → SSE 恢复 → 自动切回（两条路径）', async (t) => {
  // 可手动驱动的 EventSource 替身（onopen/onerror 属性 + addEventListener 双形态）
  class FakeES {
    constructor(url) { this.url = url; this.handlers = {}; FakeES.instances.push(this) }
    addEventListener(name, cb) { (this.handlers[name] ??= []).push(cb) }
    fire(type, event = { data: '{}' }) {
      const on = this['on' + type]
      if (typeof on === 'function') on.call(this, event)
      for (const cb of this.handlers[type] ?? []) cb(event)
    }
    close() { this.closed = true }
  }
  FakeES.instances = []

  let fetchCount = 0
  const snapshots = []
  const modes = []
  const connector = createRealtimeConnector({
    sseUrl: 'http://fake/events',
    snapshotUrl: 'http://fake/snapshot',
    eventNames: ['status-changed'],
    eventSourceFactory: (url) => new FakeES(url),
    fetchFn: async () => {
      fetchCount++
      return { json: async () => ({ ok: true, plugins: [], fetchNo: fetchCount }) }
    },
    pollIntervalMs: 10,
    onSnapshot: (s) => snapshots.push(s),
    onEvent: () => {},
    onModeChange: (m) => modes.push(m),
  })

  connector.start()
  assert.equal(modes.at(-1), 'connecting')
  FakeES.instances.at(-1).fire('open') // SSE 上线
  assert.equal(connector.mode, 'sse')
  assert.equal(connector.polling, false)
  const sseFetchCount = fetchCount

  // 断连：error → 自动降级轮询
  FakeES.instances.at(-1).fire('error')
  assert.equal(connector.mode, 'poll')
  assert.equal(connector.polling, true)
  await new Promise((r) => setTimeout(r, 60))
  assert.ok(fetchCount > sseFetchCount, '断连后开始轮询快照')
  assert.ok(snapshots.length > 0, '轮询快照经 onSnapshot 上抛（无旁路状态）')

  // 恢复：open → 自动停轮询切回 SSE
  const afterPoll = fetchCount
  FakeES.instances.at(-1).fire('open')
  assert.equal(connector.mode, 'sse')
  assert.equal(connector.polling, false)
  await new Promise((r) => setTimeout(r, 60))
  assert.equal(fetchCount, afterPoll, '切回 SSE 后轮询停止')

  connector.stop()
})

test('connector：SSE 在场时事件经 onEvent 直达（onmessage 与命名事件）', async () => {
  class FakeES {
    constructor() { this.handlers = {} }
    addEventListener(name, cb) { (this.handlers[name] ??= []).push(cb) }
    fire(type, event) {
      const on = this['on' + type]
      if (typeof on === 'function') on.call(this, event)
      for (const cb of this.handlers[type] ?? []) cb(event)
    }
    close() {}
  }
  const received = []
  let instance
  const connector = createRealtimeConnector({
    sseUrl: 'http://fake/events',
    snapshotUrl: 'http://fake/snapshot',
    eventNames: ['status-changed'],
    eventSourceFactory: () => (instance = new FakeES()),
    fetchFn: async () => ({ json: async () => ({ ok: true }) }),
    pollIntervalMs: 100000,
    onEvent: (name, payload) => received.push([name, payload]),
    onSnapshot: () => {},
  })
  connector.start()
  instance.fire('open')
  instance.fire('status-changed', { data: JSON.stringify({ id: 'a', from: 'loading', to: 'active' }) })
  instance.fire('message', { data: JSON.stringify({ hello: 1 }) })
  assert.ok(received.some(([n, p]) => n === 'status-changed' && p.to === 'active'), '命名事件直达')
  assert.ok(received.some(([n, p]) => n === 'message' && p.hello === 1), '默认消息直达')
  connector.stop()
})

// ── confirm 校验与失败反馈（用户要求 3）───────────────────────────────────

test('管理操作 confirm 校验：缺失/不符 → 400 confirm-missing；正确 → 生效', async (t) => {
  setMarker(true)
  const { registry, base } = await makeStack(t)
  await registry.install({ kind: 'local', path: contractPlugin })

  // 卸载：缺 confirm
  const noConfirm = await post(base, '/api/toolkit-panel/v2/uninstall', { id: 'fixture/contract-plugin' })
  assert.equal(noConfirm.status, 400)
  assert.equal(noConfirm.json.code, 'confirm-missing')
  assert.ok(registry.get('fixture/contract-plugin'), 'confirm 缺失不得生效')

  // 启停：confirm 不符
  const badConfirm = await post(base, '/api/toolkit-panel/v2/enabled', { id: 'fixture/contract-plugin', enabled: false, confirm: 'wrong' })
  assert.equal(badConfirm.json.code, 'confirm-missing')

  // 正确 confirm → 真实生效
  const okDisable = await post(base, '/api/toolkit-panel/v2/enabled', { id: 'fixture/contract-plugin', enabled: false, confirm: 'fixture/contract-plugin' })
  assert.equal(okDisable.json.ok, true)
  assert.equal(okDisable.json.entry.status, 'disabled')
  assert.equal(registry.get('fixture/contract-plugin').status, 'disabled')

  const okUninstall = await post(base, '/api/toolkit-panel/v2/uninstall', { id: 'fixture/contract-plugin', confirm: 'fixture/contract-plugin' })
  assert.equal(okUninstall.json.ok, true)
  assert.equal(registry.get('fixture/contract-plugin'), undefined, '卸载真实生效（registry API 唯一通道）')
})

test('失败反馈：未知插件 → error.code=plugin-unknown；安装阻断 → precheck 整体下发', async (t) => {
  const { registry, base } = await makeStack(t)
  const unknown = await post(base, '/api/toolkit-panel/v2/reload', { id: 'fixture/nope', confirm: 'fixture/nope' })
  assert.equal(unknown.status, 400)
  assert.equal(unknown.json.code, 'plugin-unknown')
  assert.match(unknown.json.error, /不存在/)

  const npm = await post(base, '/api/toolkit-panel/v2/install/confirm', { source: { kind: 'npm', spec: 'x' }, confirm: 'x' })
  assert.equal(npm.status, 200)
  assert.equal(npm.json.ok, false)
  assert.ok(npm.json.precheck.blocking.some((b) => /npm 来源在 P2 尚未实现/.test(b.message)))

  const badManifest = await post(base, '/api/toolkit-panel/v2/install/precheck', { source: { kind: 'local', path: fixtureDir('invalid-manifest-plugin') } })
  assert.equal(badManifest.json.ok, true, '预检路由本身成功')
  assert.equal(badManifest.json.precheck.pass, false)
  assert.ok(badManifest.json.precheck.blocking.some((b) => b.message.includes('contract')), '阻断含字段路径')
})

// ── snapshot 结构与 config 写回 ───────────────────────────────────────────

test('snapshot：结构完整（status/legacy/health/configSchemaJSON），doctor 在场标注', async (t) => {
  setMarker(true)
  const { registry, base } = await makeStack(t)
  await registry.install({ kind: 'local', path: fixtureDir('legacy-plugin') })
  const response = await fetch(base + '/api/toolkit-panel/v2/snapshot')
  const data = await response.json()
  assert.equal(data.ok, true)
  assert.equal(data.doctorAvailable, true)
  assert.equal(data.servicePrefix, 'toolkit')
  const entry = data.plugins.find((p) => p.id === 'legacy/legacy-plugin')
  assert.ok(entry, 'legacy 插件出现在快照中')
  assert.equal(entry.legacy, true)
  assert.equal(entry.status, 'active')
  assert.ok('configSchemaJSON' in entry)
  assert.ok('healthSummary' in entry)
  assert.ok(Array.isArray(entry.panels))
})

test('config 写回：POST /config → entry.config 更新且持久层可见', async (t) => {
  setMarker(true)
  const { registry, base } = await makeStack(t)
  await registry.install({ kind: 'local', path: fixtureDir('contract-plugin') })
  const result = await post(base, '/api/toolkit-panel/v2/config', {
    id: 'fixture/contract-plugin',
    config: { hello: 'world', n: 3 },
    confirm: 'fixture/contract-plugin',
  })
  assert.equal(result.json.ok, true)
  assert.deepEqual(result.json.entry.config, { hello: 'world', n: 3 })
  assert.equal(registry.get('fixture/contract-plugin').config.hello, 'world')
  assert.equal(registry.get('fixture/contract-plugin').status, 'active', '配置写回后重载仍 active')
})

test('snapshot：schemastery Config 的 refs 间接引用形态解引用为内联定义（T0：真实插件 dsh-repo-spec 即此形态，不解引用则面板配置表单空白）', async (t) => {
  setMarker(true)
  const { registry, base } = await makeStack(t)
  // region 必填：无配置预检会按设计阻断；本测试只验证快照的 schema 解引用，用 force 装入
  assert.equal((await registry.install({ kind: 'local', path: fixtureDir('schema-plugin') }, { force: true })).ok, true)
  const response = await fetch(base + '/api/toolkit-panel/v2/snapshot')
  const data = await response.json()
  const entry = data.plugins.find((p) => p.id === 'dsh/schema-plugin')
  assert.ok(entry, 'schema-plugin 在快照')
  const schema = entry.configSchemaJSON
  assert.ok(schema && typeof schema === 'object' && schema.type, 'configSchemaJSON 为内联定义')
  assert.ok(!('uid' in schema && schema.refs), 'refs 间接引用已解引用')
  assert.equal(schema.type, 'object')
  assert.equal(schema.dict.region.type, 'string', 'dict 值为内联定义（递归表单可直接渲染）')
  assert.equal(schema.dict.retries.type, 'number')
  assert.ok(schema.dict.region.meta && schema.dict.region.meta.required, '必填标注保留')
})
