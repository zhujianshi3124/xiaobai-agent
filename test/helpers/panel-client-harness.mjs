// test/helpers/panel-client-harness.mjs —— 面板客户端测试工装（真实 client bundle + 可重渲染假 react）
//
// 为什么在 helper 里：`panel/client/index.js` 是浏览器 IIFE，只能按宿主的方式取（readFileSync →
// new Function('window', src) → 取 window.__ModuleLoader__.load 的 factory → 喂假 react）。
// 2026-09-23 之前这套工装只有 test/panel-unified.test.mjs 一份，第二份要测客户端行为就得复制它 ⇒
// 与仓内"孪生表漂移"同族的风险。故整体抽出，两个使用方共享同一份工装（本文件不含任何产品代码）。
// 从 panel-unified.test.mjs **逐字搬入**（行为零变更）；搬入笔与使用笔分开，便于单独 revert。
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HELPERS_DIR = dirname(fileURLToPath(import.meta.url))
const root = resolve(HELPERS_DIR, '..', '..')

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
// 安装向导的路径输入框：按 placeholder 前缀认（placeholder 本身是产品文案，逐字改不得让测试跟着抖）
function pluginPathInput(tree) {
  return findAll(tree, (n) => n.type === 'input' && String((n.props && n.props.placeholder) || '').startsWith('本地插件目录的绝对路径'))[0] || null
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

export {
  textOf, findAll, text, buttonOf, pluginPathInput,
  makeReact, FakeES, makeRouter, flush, mountUnifiedPanel,
  patchSnapshotPayload, v2SnapshotPayload, v2Entry, baseRoutes,
}
