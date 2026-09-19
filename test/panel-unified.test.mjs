// P6 归一面板测试：唯一 toolkit-panel 标签页同时承载 registry 通用管理区（V2Section）
// 与 patch 域工具区（P2.4 资产）。用「可重渲染」假 react 驱动**真实 client bundle**
// （与 p22-cards-ui 同族，但支持 setState 重渲 + useEffect deps 语义，可走完整交互流）：
//   1) 归一结构（管理区 + 工具区同页可达）
//   2) 免刷新自适应（SSE plugin-added → 新卡片自动出现，连接器不重建）
//   3) 安装向导 E2E（真实 v2 API + 真实 registry + 本地路径夹具）
//   4) 启停 confirm E2E（勾选确认 → registry 真实生效）
//   5) 健康详情（items+fix 渲染；拉取失败降级提示）
//   6) 数据面降级容错（registry 快照失败 → 本区降级、工具区照常）
//   7) 内联孪生 connector 双路径（断连降级轮询 / 恢复切回 / 命名事件直达）
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtempSync, rmSync, writeFileSync, unlinkSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'

import { ToolkitRegistryCore, cordisHost } from '@local/dsh-toolkit/registry'
import { createDoctor } from '@local/dsh-toolkit/doctor'
import { createV2Api, toPanelRoutes } from '../panel/manager/v2-api.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixtureDir = (name) => join(root, 'test', 'fixtures', 'registry', name)
const contractPlugin = fixtureDir('contract-plugin')
const markerPath = join(contractPlugin, 'marker.flag')
function setMarker(exists) {
  if (exists) writeFileSync(markerPath, '', 'utf8')
  else if (existsSync(markerPath)) unlinkSync(markerPath)
}

// ── 树工具（与 p22-cards-ui 同族）───────────────────────────────────────────
function textOf(node, out = []) {
  if (node === null || node === undefined || typeof node === 'boolean') return out
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out }
  if (Array.isArray(node)) { for (const c of node) textOf(c, out); return out }
  if (node.children) textOf(node.children, out)
  return out
}
function findAll(node, pred, out = []) {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) { for (const c of node) findAll(c, pred, out); return out }
  if (pred(node)) out.push(node)
  if (node.children) findAll(node.children, pred, out)
  return out
}
const text = (tree) => textOf(tree).join(' ')
function buttonOf(tree, label) {
  return findAll(tree, (n) => n.type === 'button' && textOf(n).join('') === label)[0] || null
}
function inputOf(tree, placeholder) {
  return findAll(tree, (n) => n.type === 'input' && n.props && n.props.placeholder === placeholder)[0] || null
}

// ── 可重渲染假 react（setState 触发重渲；useEffect 带 deps 与清理）──────────
function makeReact() {
  const instances = new Map()
  const pendingEffects = []
  let current = null
  let rootEl = null
  let tree = null
  let scheduled = false
  let renderCount = 0

  function createElement(type, props, ...children) {
    return { type, props: props || {}, children: children.flat() }
  }
  function useState(init) {
    const inst = current.inst
    const i = current.idx++
    if (!(i in inst.hooks)) inst.hooks[i] = typeof init === 'function' ? init() : init
    return [inst.hooks[i], (v) => {
      const next = typeof v === 'function' ? v(inst.hooks[i]) : v
      if (next !== inst.hooks[i]) { inst.hooks[i] = next; schedule() }
    }]
  }
  function useCallback(fn, deps) {
    const inst = current.inst
    const i = current.idx++
    const slot = inst.hooks[i]
    const changed = !slot || !deps || !slot.deps || deps.length !== slot.deps.length || deps.some((d, j) => d !== slot.deps[j])
    if (changed) inst.hooks[i] = { fn, deps: deps ? deps.slice() : undefined }
    return inst.hooks[i].fn
  }
  function useEffect(fn, deps) {
    const inst = current.inst
    const i = current.idx++
    const slot = inst.effectSlots[i] || (inst.effectSlots[i] = { deps: undefined, cleanup: undefined })
    const changed = !deps || !slot.deps || deps.length !== slot.deps.length || deps.some((d, j) => d !== slot.deps[j])
    if (!changed) return
    slot.deps = deps ? deps.slice() : undefined
    pendingEffects.push(() => {
      if (slot.cleanup) { try { slot.cleanup() } catch { /* ignore */ } slot.cleanup = undefined }
      const c = fn()
      if (typeof c === 'function') slot.cleanup = c
    })
  }
  function useRef(v) {
    const inst = current.inst
    const i = current.idx++
    if (!(i in inst.hooks)) inst.hooks[i] = { current: v }
    return inst.hooks[i]
  }
  function useMemo(fn) { return fn() }

  function walk(node, key) {
    if (node === null || node === undefined || typeof node === 'boolean') return node
    if (Array.isArray(node)) return node.map((c, i) => walk(c, key + '/' + i))
    if (typeof node !== 'object') return node
    if (typeof node.type === 'function') {
      const instKey = key + '::' + (node.type.name || 'anon') + ':' + (node.props && node.props.key !== undefined ? String(node.props.key) : '')
      let inst = instances.get(instKey)
      if (!inst) { inst = { hooks: [], effectSlots: [] }; instances.set(instKey, inst) }
      const saved = current
      current = { inst, idx: 0 }
      let out
      try { out = node.type(node.props) } finally { current = saved }
      return walk(out, instKey)
    }
    const kids = node.children === undefined ? [] : (Array.isArray(node.children) ? node.children : [node.children])
    return { type: node.type, props: node.props, children: kids.map((c, i) => walk(c, key + '/' + i)) }
  }

  function render(el) {
    rootEl = el
    renderCount++
    pendingEffects.length = 0
    tree = walk(el, 'root')
    const runs = pendingEffects.splice(0)
    for (const run of runs) run()
    return tree
  }
  function schedule() {
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => { scheduled = false; render(rootEl) })
  }

  return { createElement, useState, useCallback, useEffect, useRef, useMemo, render, schedule, instances, get tree() { return tree }, get renderCount() { return renderCount } }
}

// ── EventSource 替身（内联孪生 connector 直接 new 全局 EventSource）─────────
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

// ── fetch 替身：路由表匹配（可透传真实 v2 服务器）──────────────────────────
function makeRouter() {
  const routes = []
  const calls = []
  const router = async (url, opts) => {
    const u = String(url)
    calls.push(u)
    for (const r of routes) {
      if (u.includes(r.match)) return r.handler(opts && opts.body ? JSON.parse(opts.body) : undefined, u)
    }
    return { status: 404, json: async () => ({ ok: false, error: 'no route: ' + u }) }
  }
  router.routes = routes
  router.calls = calls
  return router
}

async function flush(rounds = 6) {
  // setTimeout 而非 setImmediate：setImmediate-only 循环会饿死事件循环 poll 阶段，
  // 导致 loopback HTTP 响应无法推进（实测踩坑）。
  for (let i = 0; i < rounds; i++) await new Promise((r) => setTimeout(r, 2))
}

// ── 归一面板挂载：真实 client bundle + 可重渲染假 react ────────────────────
function mountUnifiedPanel({ router }) {
  const realFetch = globalThis.fetch
  globalThis.fetch = router
  globalThis.EventSource = FakeES
  FakeES.instances = []

  const react = makeReact()
  const bundleSrc = readFileSync(join(root, 'panel', 'client', 'index.js'), 'utf8')
  let factory = null
  new Function('window', bundleSrc)({ __ModuleLoader__: { load: (o) => { factory = o.factory } } })
  if (!factory) throw new Error('client/index.js 没有调用 window.__ModuleLoader__.load')
  const mod = factory((name) => {
    if (name === 'react') return react
    throw new Error('bundle 请求了未 stub 的模块：' + name)
  })
  const api = mod && mod.apply ? mod : (mod && mod.exports)
  const registrations = []
  api.apply({ slots: { inject: (n, cb) => cb(), register: (meta, comp) => { registrations.push({ meta, comp }); return () => {} } } })
  const main = registrations.find((r) => r.meta.id === 'toolkit-panel')
  if (!main) throw new Error('toolkit-panel 主标签页未注册')

  react.render(react.createElement(main.comp, null))
  return {
    api, react, registrations,
    get tree() { return react.tree },
    // 稳定等待：强制 soak ≥250ms（网络/装纤程耗时），随后渲染数+拉取数连续 5 轮（各 3ms）
    // 不变即认为收敛；上限 200 轮防死循环挂测。
    async done() {
      const start = Date.now()
      let stable = 0, lastR = -1, lastF = -1
      for (let i = 0; i < 200; i++) {
        await new Promise((r) => setTimeout(r, 3))
        if (Date.now() - start < 250) { stable = 0; continue }
        const r = react.renderCount
        const f = router.calls.length
        if (r === lastR && f === lastF) stable++
        else { stable = 0; lastR = r; lastF = f }
        if (stable >= 5) break
      }
      return this
    },
    dispose() {
      globalThis.fetch = realFetch
      delete globalThis.EventSource
      FakeES.instances = []
    },
  }
}

// node:fs 命名导入已在文件顶部（readFileSync 供 mountUnifiedPanel 使用）

// ── patch 域快照夹具（工具区数据源，/api/toolkit-panel/snapshot 桩）─────────
function patchSnapshotPayload() {
  return {
    ok: true,
    snapshot: {
      toolkitName: '@local/dsh-toolkit',
      toolkitVersion: '0.1.0',
      self: { enabled: true },
      patch: { text: '- insert:\n  - id: rate-throttle\n    config:\n      enabled: false\n' },
      plugins: [
        {
          dir: 'rate-throttle', name: '@local/dsh-toolkit/rate-throttle', origin: 'local',
          status: 'mounted', statusCopy: null, restoreAvailable: false, canMount: false,
          registers: {}, inject: [], managedBy: 'bundle', enabled: true, note: null, bodyStats: null,
          patchRow: { id: 'rate-throttle', enabled: true, disabledExpr: null, config: { enabled: 'false' } },
          configPanel: { editable: true, rowId: 'rate-throttle', values: { enabled: 'false' }, effectNote: '重启后生效' },
        },
        {
          dir: 'search-router', name: '@local/dsh-toolkit/search-router', origin: 'local',
          status: 'mounted', statusCopy: null, restoreAvailable: false, canMount: false,
          registers: {}, inject: [], managedBy: 'bundle', enabled: true, note: null, bodyStats: null,
          patchRow: { id: 'web-search-router', enabled: true, disabledExpr: null, config: {} },
          configPanel: { editable: false, rowId: 'web-search-router', values: {}, mode: { value: 'auto', source: 'patch' }, note: '' },
        },
      ],
    },
  }
}

function v2SnapshotPayload(entries) {
  return { ok: true, servicePrefix: 'toolkit', doctorAvailable: true, plugins: entries }
}
function v2Entry(id, over = {}) {
  return Object.assign({
    id, displayName: '显示名 ' + id, version: '1.0.0', contract: '^1.0',
    status: 'active', legacy: false, config: {},
    lastError: null, health: null, healthSummary: null,
    configSchemaJSON: null, hasHealthCheck: false, panels: [],
  }, over)
}

function baseRoutes(router) {
  router.routes.push(
    { match: '/api/toolkit-panel/doctor/states', handler: () => ({ status: 200, json: async () => ({ ok: false, degraded: true, error: 'doctor 不可用（测试桩）', states: null, snapshots: [] }) }) },
    { match: '/api/toolkit-panel/custody', handler: () => ({ status: 200, json: async () => ({ ok: true, custody: { entries: [], presetState: null } }) }) },
    { match: '/api/toolkit-panel/snapshot', handler: () => ({ status: 200, json: async () => patchSnapshotPayload() }) },
  )
}

// ── 真实 v2 API 服务器（registry/doctor 服务真身，与 panel-v2 同构）─────────
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
async function makeV2Stack(t) {
  const tmp = mkdtempSync(join(tmpdir(), 'panel-unified-'))
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
  const v2 = createV2Api({
    registry,
    doctor: doc.doctor,
    servicePrefix: 'toolkit',
    subscribe: (name, cb) => {
      const disposer = ctx.on(name, cb)
      return () => { try { disposer() } catch { /* noop */ } }
    },
  })
  const routes = toPanelRoutes(v2.routes)
  const server = http.createServer(async (request, response) => {
    const path = request.url.split('?')[0]
    const route = routes.find((r) => r.path === path)
    if (!route) { response.writeHead(404); response.end(); return }
    if (request.method !== route.method) { response.writeHead(405, { allow: route.method }); response.end(); return }
    await route.handler(request, response)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  t.after(() => { doc.stop(); void registry.stop(); server.close() })
  return { registry, doctor: doc.doctor, base }
}

// ═══════════════════════════════════════════════════════════════════════════
test('归一结构：toolkit-panel 主标签页同时承载 registry 管理区与 patch 工具区', async () => {
  const router = makeRouter()
  baseRoutes(router)
  router.routes.push({
    match: '/api/toolkit-panel/v2/snapshot',
    handler: () => ({ status: 200, json: async () => v2SnapshotPayload([
      v2Entry('legacy/legacy-one', { legacy: true, status: 'active' }),
      v2Entry('fixture/with-schema', {
        configSchemaJSON: { type: 'object', dict: { region: { type: 'string', meta: { required: true } }, retries: { type: 'number' } } },
      }),
    ]) }),
  })
  const panel = mountUnifiedPanel({ router })
  try {
    await panel.done()
    const t1 = text(panel.tree)
    // ── 管理区（V2Section）
    assert.ok(t1.includes('插件管理（registry · 自适应）'), '管理区标题')
    assert.ok(t1.includes('安装新插件（本地路径）'), '安装向导入口')
    assert.ok(t1.includes('数据源：registry/doctor 服务与事件流'), '数据源行')
    assert.ok(t1.includes('legacy 模式'), 'legacy 标注')
    assert.ok(t1.includes('legacy/legacy-one'), 'registry 卡片渲染')
    assert.ok(t1.includes('健康：未知'), '健康摘要行')
    for (const label of ['停用', '重载', '卸载', '健康详情', '配置']) {
      assert.ok(buttonOf(panel.tree, label), '卡片操作按钮：「' + label + '」')
    }
    // ── configSchema 纯定义表单：点开第二张卡（with-schema）的「配置」后渲染
    const cfgBtns = findAll(panel.tree, (n) => n.type === 'button' && textOf(n).join('') === '配置')
    assert.equal(cfgBtns.length, 2, '两张 registry 卡各带配置入口')
    cfgBtns[0].props.onClick()
    await panel.done()
    assert.ok(text(panel.tree).includes('插件未声明 configSchema'), '无 schema 卡：降级说明（不崩）')
    cfgBtns[1].props.onClick()
    await panel.done()
    const tForm = text(panel.tree)
    assert.ok(tForm.includes('region：'), 'schema 表单字段 region')
    assert.ok(tForm.includes('retries：'), 'schema 表单字段 retries')
    assert.ok(tForm.includes('必填'), '必填标注')
    assert.ok(tForm.includes('保存配置（写回 registry）'), '保存入口')
    // ── patch 工具区（P2.4 资产原样保留）
    assert.ok(t1.includes('内置插件工具区（patch 域 · 开关 / 参数 / 卸载恢复）'), '工具区标题')
    assert.ok(t1.includes('第一层 · 配置文件（patch-row.disabled）'), '两层开关（层一）')
    assert.ok(t1.includes('第二层 · 插件内部（config.enabled）'), '两层开关（层二）')
    assert.ok(t1.includes('卸载 / 恢复'), 'P2.4 卸载/恢复入口')
    assert.ok(t1.includes('操作台（可执行项 · 确认一次改一处）'), '体检操作台')
    assert.ok(t1.includes('配置文件原文（cordis.patch.yml · 插件开关所在）'), 'patch 原文')
  } finally {
    panel.dispose()
  }
})

test('免刷新自适应：SSE plugin-added → 新插件卡片自动出现（连接器不重建、零代码改动）', async () => {
  const router = makeRouter()
  baseRoutes(router)
  let entries = [v2Entry('fixture/first')]
  router.routes.push({
    match: '/api/toolkit-panel/v2/snapshot',
    handler: () => ({ status: 200, json: async () => v2SnapshotPayload(entries) }),
  })
  const panel = mountUnifiedPanel({ router })
  try {
    await panel.done()
    assert.ok(text(panel.tree).includes('fixture/first'), '初始 1 张卡片')
    assert.ok(!text(panel.tree).includes('fixture/second'), '初始无第 6 插件')
    const esCount = FakeES.instances.length
    assert.equal(esCount, 1, '恰好一条 SSE 连接')

    // 「装入第 6 个插件」：快照更新 + 服务端事件推送——面板不刷新、不重挂载
    entries = entries.concat([v2Entry('fixture/second')])
    FakeES.instances[0].fire('plugin-added', { data: JSON.stringify({ id: 'fixture/second' }) })
    await panel.done()
    assert.ok(text(panel.tree).includes('fixture/first') && text(panel.tree).includes('fixture/second'), '新插件卡片自动出现')
    assert.equal(FakeES.instances.length, 1, '连接器未重建（非刷新/非重挂载）')
  } finally {
    panel.dispose()
  }
})

test('安装向导 E2E：预检报告 → 确认安装 → 真实 registry 装入且卡片自动出现', async (t) => {
  setMarker(true)
  const stack = await makeV2Stack(t)
  const router = makeRouter()
  baseRoutes(router)
  const realFetch = globalThis.fetch
  router.routes.push({
    match: '/api/toolkit-panel/v2/',
    handler: async (body, u) => {
      const path = u.slice(u.indexOf('/api/toolkit-panel/v2/'))
      const res = await realFetch(stack.base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return { status: res.status, json: () => res.json() }
    },
  })
  const panel = mountUnifiedPanel({ router })
  try {
    await panel.done()
    const input = inputOf(panel.tree, '插件目录或入口文件路径')
    assert.ok(input, '本地路径输入框')
    input.props.onChange({ target: { value: contractPlugin } })
    await panel.done()
    const pre = buttonOf(panel.tree, '① 预检')
    assert.ok(pre, '预检按钮')
    pre.props.onClick()
    await panel.done()
    assert.ok(text(panel.tree).includes('预检结论：'), '预检报告区出现')
    assert.ok(text(panel.tree).includes('通过，可以安装'), '预检通过')

    const confirmBtn = buttonOf(panel.tree, '确认安装')
    assert.ok(confirmBtn, '确认安装按钮')
    confirmBtn.props.onClick()
    await panel.done(16)

    assert.ok(text(panel.tree).includes('已installed：fixture/contract-plugin'), '安装结果反馈')
    const entry = stack.registry.get('fixture/contract-plugin')
    assert.ok(entry, 'registry 真实装入')
    assert.equal(entry.status, 'active', '装入后 active')
    assert.ok(text(panel.tree).includes('fixture/contract-plugin'), '新插件卡片自动出现（免刷新）')
  } finally {
    panel.dispose()
  }
})

test('启停 confirm E2E：未勾选不可执行；勾选后 registry 真实生效并反馈', async (t) => {
  setMarker(true)
  const stack = await makeV2Stack(t)
  assert.equal((await stack.registry.install({ kind: 'local', path: contractPlugin })).ok, true)
  const router = makeRouter()
  baseRoutes(router)
  const realFetch = globalThis.fetch
  router.routes.push({
    match: '/api/toolkit-panel/v2/',
    handler: async (body, u) => {
      const path = u.slice(u.indexOf('/api/toolkit-panel/v2/'))
      const res = await realFetch(stack.base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return { status: res.status, json: () => res.json() }
    },
  })
  const panel = mountUnifiedPanel({ router })
  try {
    await panel.done()
    assert.ok(text(panel.tree).includes('fixture/contract-plugin'), '卡片在')
    const stopBtn = buttonOf(panel.tree, '停用')
    assert.ok(stopBtn, '停用按钮（active 态）')
    stopBtn.props.onClick()
    await panel.done()
    assert.ok(text(panel.tree).includes('确认停用 fixture/contract-plugin？'), 'confirm 文案逐字校验语义')
    const exec = buttonOf(panel.tree, '执行')
    assert.ok(exec, '执行按钮出现')
    assert.equal(exec.props.disabled, true, '未勾选确认前不可执行')
    const checkbox = findAll(panel.tree, (n) => n.type === 'input' && n.props && n.props.type === 'checkbox')[0]
    assert.ok(checkbox, '知情确认勾选框')
    checkbox.props.onChange({ target: { checked: true } })
    await panel.done()
    const exec2 = buttonOf(panel.tree, '执行')
    assert.equal(exec2.props.disabled, false, '勾选后可执行')
    exec2.props.onClick()
    await panel.done(16)
    assert.equal(stack.registry.get('fixture/contract-plugin').status, 'disabled', 'registry 真实生效')
    assert.ok(buttonOf(panel.tree, '启用'), '卡片切换为启用入口')
  } finally {
    panel.dispose()
  }
})

test('健康详情：items+fix 渲染；拉取失败 → 降级提示（不静默）', async (t) => {
  setMarker(true)
  const stack = await makeV2Stack(t)
  assert.equal((await stack.registry.install({ kind: 'local', path: contractPlugin })).ok, true)
  stack.registry.setHealth('fixture/contract-plugin', {
    status: 'warn',
    at: new Date().toISOString(),
    items: [{ code: 'demo-check', level: 'warn', message: '示例发现', fix: { summary: '做点什么', steps: ['第一步'] } }],
  })
  const router = makeRouter()
  baseRoutes(router)
  const realFetch = globalThis.fetch
  router.routes.push({
    match: '/api/toolkit-panel/v2/',
    handler: async (body, u) => {
      const path = u.slice(u.indexOf('/api/toolkit-panel/v2/'))
      const res = await realFetch(stack.base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return { status: res.status, json: () => res.json() }
    },
  })
  const panel = mountUnifiedPanel({ router })
  try {
    await panel.done()
    const btn = buttonOf(panel.tree, '健康详情')
    btn.props.onClick()
    await panel.done()
    const t1 = text(panel.tree)
    assert.ok(t1.includes('当前状态：'), '健康详情打开')
    assert.ok(t1.includes('demo-check'), '发现项 code')
    assert.ok(t1.includes('示例发现'), '发现项 message')
    assert.ok(t1.includes('修复：做点什么'), 'fix 摘要')
    assert.ok(t1.includes('历史：'), '环形历史行')
  } finally {
    panel.dispose()
  }

  // 失败分支：health 拉取 reject → 降级提示
  const router2 = makeRouter()
  baseRoutes(router2)
  router2.routes.push({ match: '/api/toolkit-panel/v2/snapshot', handler: () => ({ status: 200, json: async () => v2SnapshotPayload([v2Entry('fixture/x')]) }) })
  router2.routes.push({ match: '/api/toolkit-panel/v2/health', handler: () => { throw new Error('health down') } })
  const panel2 = mountUnifiedPanel({ router: router2 })
  try {
    await panel2.done()
    buttonOf(panel2.tree, '健康详情').props.onClick()
    await panel2.done()
    assert.ok(text(panel2.tree).includes('健康详情暂不可用'), '降级提示可见（不静默、不崩）')
  } finally {
    panel2.dispose()
  }
})

test('数据面降级：registry 快照失败 → 管理区降级提示，patch 工具区照常渲染', async () => {
  const router = makeRouter()
  baseRoutes(router)
  router.routes.push({
    match: '/api/toolkit-panel/v2/snapshot',
    handler: () => ({ status: 200, json: async () => ({ ok: false, error: 'registry down（测试桩）' }) }),
  })
  const panel = mountUnifiedPanel({ router })
  try {
    await panel.done()
    const t1 = text(panel.tree)
    assert.ok(t1.includes('插件管理（registry）数据暂不可用'), '管理区降级提示')
    assert.ok(t1.includes('下方 patch 域工具区不受影响'), '降级说明')
    assert.ok(!t1.includes('安装新插件（本地路径）'), '管理区主体不渲染（无半残状态）')
    assert.ok(t1.includes('内置插件工具区（patch 域 · 开关 / 参数 / 卸载恢复）'), '工具区照常')
    assert.ok(t1.includes('第一层 · 配置文件（patch-row.disabled）'), '工具区开关照常')
    assert.ok(buttonOf(panel.tree, '一键体检（只查不改）'), '体检入口照常')
  } finally {
    panel.dispose()
  }
})

test('内联孪生 connector：SSE 断连降级轮询 → 恢复切回 → 命名事件直达（归一面板实际传输代码）', async () => {
  const realFetch = globalThis.fetch
  globalThis.EventSource = FakeES
  FakeES.instances = []
  let fetchCount = 0
  const snapshots = []
  const modes = []
  const events = []
  globalThis.fetch = async () => {
    fetchCount++
    return { json: async () => { const data = { ok: true, plugins: [], fetchNo: fetchCount }; snapshots.push(data); return data } }
  }
  const react = makeReact()
  const bundleSrc = readFileSync(join(root, 'panel', 'client', 'index.js'), 'utf8')
  let factory = null
  new Function('window', bundleSrc)({ __ModuleLoader__: { load: (o) => { factory = o.factory } } })
  const mod = factory((name) => { if (name === 'react') return react; throw new Error('stub: ' + name) })
  const api = mod && mod.apply ? mod : (mod && mod.exports)
  assert.equal(typeof api.createV2Connector, 'function', 'client 导出内联孪生 connector（测试接入点）')

  try {
    const connector = api.createV2Connector({
      onSnapshot: (s) => snapshots.push(s),
      onMode: (m) => modes.push(m),
      onEvent: (name, payload) => events.push([name, payload]),
    })
    const es = FakeES.instances.at(-1)
    assert.ok(es, 'EventSource 已建立（/events）')

    es.fire('open')
    assert.equal(modes.at(-1), 'sse', 'SSE 在场')
    const sseFetchCount = fetchCount

    es.fire('error')
    assert.equal(modes.at(-1), 'poll', '断连自动降级轮询')
    await flush(4)
    assert.ok(fetchCount > sseFetchCount, '降级后轮询快照')

    const afterPoll = fetchCount
    es.fire('open')
    assert.equal(modes.at(-1), 'sse', '恢复自动切回 SSE')
    await flush(4)
    assert.equal(fetchCount, afterPoll, '切回后轮询停止')

    es.fire('status-changed', { data: JSON.stringify({ id: 'a', to: 'active' }) })
    es.fire('message', { data: JSON.stringify({ hello: 1 }) })
    assert.ok(events.some(([n, p]) => n === 'status-changed' && p.to === 'active'), '命名事件直达')
    assert.ok(events.some(([n, p]) => n === 'message' && p.hello === 1), '默认消息直达')

    connector.close()
    assert.equal(es.closed, true, 'close 关闭 SSE')
  } finally {
    globalThis.fetch = realFetch
    delete globalThis.EventSource
    FakeES.instances = []
  }
})
