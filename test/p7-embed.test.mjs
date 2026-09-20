// P7 嵌入（REQ-8 / G4 / D5）验收测试。
//
//  ① 路由基址从 servicePrefix 派生：缺省前缀下 URL 逐字节不变，三处孪生基址同源；
//  ② 同进程双实例（不同前缀）挂在同一台"宿主自有"的根 webServer 上：路由零冲突、
//     两个面板同时可达、A 装的插件与 A 的事件都不进 B（服务/事件/HTTP 全链路隔离）；
//  ③ mock 桶装入 → 卸出：HTTP 路由全部注销、事件订阅全部解除、活动句柄回到基线；
//  ④ 根入口 dsh/toolkit 自描述：manifest 过契约校验、requires 如实声明对 webServer 的依赖、
//     panels 只有归一后的那一个（P6 面板纪律）、configSchema 覆盖 apply() 真正读取的键；
//  ⑤ 面板 guard 不假设 toolkit 拥有根 webServer：webServer 由外部注入、写路由 fail-closed。
//
// 装配走 panel/index.js / index.js 真身（registry-host 的真 registry+doctor 服务、真 cordis
// 事件总线），只对 webServer / effect / on 三处套捕获 Proxy——它们正是"归宿主所有"的那一层。
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'

import {
  contractHttpBase,
  contractServiceName,
  contractEventName,
  normalizeServicePrefix,
  isValidServicePrefix,
  validateManifest,
  DEFAULT_SERVICE_PREFIX,
} from '@local/dsh-toolkit/contract'

const ROOT = resolve(import.meta.dirname, '..')
const asUrl = (p) => pathToFileURL(p).href // Windows 下动态 import 必须走 file:// URL
const panelMod = await import(asUrl(join(ROOT, 'panel', 'index.js')))
const rootEntry = await import(asUrl(join(ROOT, 'index.js')))
const clientSrc = readFileSync(join(ROOT, 'panel', 'client', 'index.js'), 'utf8')
const fallbackSrc = readFileSync(join(ROOT, 'panel', 'client', 'panel.html'), 'utf8')
const UI_API_TOKEN = '__TOOLKIT_PANEL_API_BASE__'
const FIXTURE_DEFAULT_ROUTES = 32 // p1-smoke 同一口径：P2.4 22 + v2 管理 9 + connector 1
const fixturePlugin = join(ROOT, 'test', 'fixtures', 'registry', 'contract-plugin')

function activeHandles() {
  return process.getActiveResourcesInfo().slice().sort()
}

/** 一个实例的装配现场：状态文件/备份根/设备表都进各自 tmpdir，互不重叠。 */
function stackDir(t, name, prefix) {
  const tmp = mkdtempSync(join(tmpdir(), `p7-${name}-`))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const devicesFile = join(tmp, 'devices.json')
  writeFileSync(devicesFile, '{}', 'utf8')
  return {
    config: {
      servicePrefix: prefix,
      toolkitRoot: ROOT,
      devicesFile,
      backupRoot: join(tmp, 'backups'),
      doctorCli: join(tmp, 'doctor-unused.mjs'), // 本文件不触发 dry-run 路由，占位即可
      registry: { statePath: join(tmp, 'state.json'), autoload: false },
      doctor: { watchInterval: 0 },
    },
  }
}

/**
 * 以"被宿主装载"的形态装配一次工具箱。
 * @param {Context} ctx 真实 cordis 上下文（服务名/事件名由它承载，前缀隔离在此验证）
 * @param {object} config 插件 config（patch 行形态）
 * @param {{apply: Function}} mod 装配入口（面板本体或 toolkit 根入口）
 */
function mount(ctx, config, mod = panelMod) {
  const cap = { routes: [], unregistered: [], subs: [], disposed: [], disposers: [] }
  const hostCtx = new Proxy(ctx, {
    get(target, prop) {
      if (prop === 'webServer') {
        return {
          register(route) {
            cap.routes.push(route)
            return () => cap.unregistered.push(route.path)
          },
        }
      }
      if (prop === 'effect') {
        return (cb) => {
          const disposer = cb()
          if (typeof disposer === 'function') cap.disposers.push(disposer)
        }
      }
      if (prop === 'on') {
        return (name, handler) => {
          cap.subs.push(name)
          const disposer = target.on(name, handler)
          return () => {
            cap.disposed.push(name)
            disposer()
          }
        }
      }
      const value = target[prop]
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  mod.apply(hostCtx, config)
  return cap
}

/** 宿主自有的根 webServer 替身：所有实例只往里 register，路径撞了立刻可见。 */
async function serve(t, routeSets) {
  const byPath = new Map()
  for (const routes of routeSets) {
    for (const route of routes) {
      assert.equal(byPath.has(route.path), false, `路由冲突：${route.path} 被注册了两次`)
      byPath.set(route.path, route)
    }
  }
  const server = http.createServer(async (request, response) => {
    const route = byPath.get(request.url.split('?')[0])
    if (!route) {
      response.writeHead(404)
      response.end()
      return
    }
    await route.handler(request, response)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  t.after(() => new Promise((r) => server.close(r)))
  return { base, byPath }
}

/** 直接驱动 handler（不经网络）——guard 用例要精确控制 socket/Host/CSRF 头。 */
async function call(route, method, opts = {}) {
  let status = null
  let payload = ''
  const headers = { host: opts.host ?? '127.0.0.1:3080' }
  if (opts.origin !== undefined) headers.origin = opts.origin
  if (opts.site !== undefined) headers['sec-fetch-site'] = opts.site
  if (opts.cookie !== undefined) headers.cookie = opts.cookie
  const listeners = { data: [], end: [] }
  const request = {
    method,
    headers,
    socket: { remoteAddress: opts.remote ?? '127.0.0.1' },
    on(event, cb) {
      if (listeners[event]) listeners[event].push(cb)
      return request
    },
  }
  queueMicrotask(() => {
    if (opts.json !== undefined) {
      const chunk = Buffer.from(JSON.stringify(opts.json), 'utf8')
      for (const cb of listeners.data) cb(chunk)
    }
    for (const cb of listeners.end) cb()
  })
  const response = {
    writeHead(code) {
      status = code
    },
    end(body) {
      if (typeof body === 'string') payload = body
    },
    on() {},
    once() {},
    removeListener() {},
    write() {},
    headersSent: false,
    writableEnded: false,
  }
  await route.handler(request, response)
  return { status: status ?? 500, payload }
}

const v2post = (base, path, body) =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then((r) => r.json())

const getJson = (base, path) => fetch(base + path).then((r) => r.json())

// ── ① 基址派生 ─────────────────────────────────────────────────────────
test('contractHttpBase：缺省前缀恰等于历史硬编码字面量（对外 URL 零变化）', () => {
  assert.equal(DEFAULT_SERVICE_PREFIX, 'toolkit')
  assert.equal(contractHttpBase(DEFAULT_SERVICE_PREFIX), '/api/toolkit-panel')
  assert.equal(contractHttpBase('tk2'), '/api/tk2-panel')
  assert.throws(() => contractHttpBase(''), TypeError)
  assert.throws(() => contractHttpBase('a/b'), TypeError)
})

test('normalizeServicePrefix：空/非串回落缺省；非法前缀由拼装函数 fail-closed', () => {
  for (const bad of [undefined, null, '', '   ', 42, {}, []]) {
    assert.equal(normalizeServicePrefix(bad), DEFAULT_SERVICE_PREFIX)
  }
  assert.equal(normalizeServicePrefix('tk2'), 'tk2')
  assert.equal(isValidServicePrefix('a/b'), false)
  assert.throws(() => contractServiceName('a/b', 'registry'), TypeError)
  assert.throws(() => contractEventName('', 'registry:status-changed'), TypeError)
})

test('面板客户端孪生基址与 contract 同源，且不再散落路由字面量', () => {
  const m = clientSrc.match(/var PANEL_API = "([^"]+)";/)
  assert.ok(m, 'client/index.js 必须有 PANEL_API 单一基址常量')
  assert.equal(m[1], contractHttpBase(DEFAULT_SERVICE_PREFIX))
  const leftovers = [...clientSrc.matchAll(/["'`]\/api\/toolkit-panel\//g)].length
  assert.equal(leftovers, 0, `客户端仍有 ${leftovers} 处硬编码基址`)
  assert.match(clientSrc, /var V2_API = PANEL_API \+ "\/v2";/, 'V2_API 必须由 PANEL_API 派生')
})

test('兜底页只留一处基址标记，服务端装配时按 apiBase 改写；残留硬编码即失败', () => {
  assert.equal((fallbackSrc.match(new RegExp(UI_API_TOKEN, 'g')) || []).length, 1)
  assert.equal((fallbackSrc.match(/["'`]\/api\/toolkit-panel\//g) || []).length, 0)
  assert.match(fallbackSrc, /var PANEL_API = "__TOOLKIT_PANEL_API_BASE__";/)
})

// ── ④ 根入口自描述 ─────────────────────────────────────────────────────
test('根入口导出自身 manifest：过契约校验、id=dsh/toolkit、requires 如实含 webServer', () => {
  const result = validateManifest(rootEntry.manifest)
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.equal(rootEntry.manifest.id, 'dsh/toolkit')
  assert.equal(rootEntry.manifest.contract, '^1.0')
  assert.equal(rootEntry.name, 'dsh-toolkit')
  assert.deepEqual(rootEntry.inject, ['webServer'], '面板要 webServer ⇒ 根入口就要 webServer')
  assert.deepEqual(rootEntry.manifest.requires.services, ['webServer'])
  assert.equal(rootEntry.manifest.requires.node, '>=22')
  const panels = rootEntry.manifest.panels
  assert.equal(panels.length, 1, '归一后面板只有一个（P6 纪律），自描述不得出现第二个')
  assert.equal(panels[0].id, 'toolkit-panel')
  assert.equal(panels[0].slot, 'settings.plugins.tab')
})

test('根入口导出的 manifest 与盘上 dsh.plugin.json 是同一份事实（无第二现场）', () => {
  const onDisk = JSON.parse(readFileSync(join(ROOT, 'dsh.plugin.json'), 'utf8'))
  assert.deepEqual(rootEntry.manifest, onDisk)
})

test('根 manifest 的 configSchema 覆盖 apply() 真正读取的配置键（纯定义、零默认）', () => {
  const schema = rootEntry.manifest.configSchema
  assert.equal(schema.type, 'object')
  for (const key of ['servicePrefix', 'toolkitRoot', 'doctorCli', 'devicesFile', 'backupRoot', 'doctorConfigRoot', 'registry', 'doctor']) {
    assert.ok(schema.dict[key], `configSchema 缺字段 ${key}`)
  }
  for (const key of ['statePath', 'dataDir', 'autoload', 'auditLog', 'auditFile', 'retryLimit', 'retryBackoffMs', 'loadTimeoutMs', 'saveDebounceMs']) {
    assert.ok(schema.dict.registry.dict[key], `registry.${key} 未在 configSchema 中`)
  }
  for (const key of ['watchInterval', 'failureThreshold', 'historySize']) {
    assert.ok(schema.dict.doctor.dict[key], `doctor.${key} 未在 configSchema 中`)
  }
  assert.equal(/"default"/.test(JSON.stringify(schema)), false, 'configSchema 是纯定义，不得携带默认值')
})

test('包导出面：宿主可按 Node 约定解析 "."（根入口）与 "./panel"（R12 迁包子路径的前提）', async () => {
  const req = createRequire(join(ROOT, 'package.json'))
  const dot = req.resolve('@local/dsh-toolkit')
  const panel = req.resolve('@local/dsh-toolkit/panel')
  assert.equal(resolve(dot), resolve(ROOT, 'index.js'))
  assert.equal(resolve(panel), resolve(ROOT, 'panel', 'index.js'))
  // loader 与宿主同源：以目录形态安装 toolkit 自己，必须解析到同一个根入口
  const { resolveLocalSource } = await import('@local/dsh-toolkit/registry')
  const resolved = await resolveLocalSource({ kind: 'local', path: ROOT })
  assert.equal(resolve(resolved.entryPath), resolve(ROOT, 'index.js'))
  assert.equal(resolved.legacy, false, '根 dsh.plugin.json 带 contract ⇒ 契约插件而非 legacy')
  assert.equal(resolved.manifest.id, 'dsh/toolkit')
})

test('根入口 apply() 就是面板的装配点：缺省前缀下注册同一张 32 条路由表', (t) => {
  const stack = stackDir(t, 'entry', DEFAULT_SERVICE_PREFIX)
  const cap = mount(new Context(), stack.config, rootEntry)
  assert.equal(cap.routes.length, FIXTURE_DEFAULT_ROUTES)
  assert.ok(cap.routes.every((r) => r.path.startsWith('/api/toolkit-panel/')))
  for (const d of cap.disposers) d()
})

// ── ② 双实例 ───────────────────────────────────────────────────────────
test('同进程双实例（toolkit / tk2）挂在同一根 webServer 上：路由零冲突、逐面镜像前缀', (t) => {
  const A = stackDir(t, 'i1', DEFAULT_SERVICE_PREFIX)
  const B = stackDir(t, 'i2', 'tk2')
  const capA = mount(new Context(), A.config)
  const capB = mount(new Context(), B.config)
  assert.equal(capA.routes.length, FIXTURE_DEFAULT_ROUTES)
  assert.equal(capB.routes.length, FIXTURE_DEFAULT_ROUTES)
  const pathsB = new Set(capB.routes.map((r) => r.path))
  assert.equal(capA.routes.filter((r) => pathsB.has(r.path)).length, 0, '两套路由必须无交集')
  for (const suffix of ['/snapshot', '/doctor/states', '/ui', '/v2/snapshot', '/v2/events', '/v2/connector.js']) {
    assert.ok(capA.routes.some((r) => r.path === `/api/toolkit-panel${suffix}`), `缺省实例缺 ${suffix}`)
    assert.ok(capB.routes.some((r) => r.path === `/api/tk2-panel${suffix}`), `第二实例缺 ${suffix}`)
  }
  // 服务名/事件名与 HTTP 基址同源同一个前缀
  assert.equal(contractServiceName('tk2', 'registry'), 'tk2/registry')
  assert.equal(contractEventName('tk2', 'registry:plugin-added'), 'tk2/registry:plugin-added')
  for (const d of [...capA.disposers, ...capB.disposers]) d()
})

test('双实例真 HTTP：两个面板同时可达，A 装的插件不出现在 B', async (t) => {
  const A = stackDir(t, 'httpA', DEFAULT_SERVICE_PREFIX)
  const B = stackDir(t, 'httpB', 'tk2')
  const capA = mount(new Context(), A.config)
  const capB = mount(new Context(), B.config)
  t.after(() => {
    for (const d of [...capA.disposers, ...capB.disposers]) d()
  })
  const { base } = await serve(t, [capA.routes, capB.routes])

  for (const [prefix, expectBase] of [['toolkit', '/api/toolkit-panel'], ['tk2', '/api/tk2-panel']]) {
    const res = await fetch(`${base}/api/${prefix}-panel/ui`)
    assert.equal(res.status, 200, `${prefix} 兜底页不可达`)
    const html = await res.text()
    assert.ok(html.includes(`var PANEL_API = "${expectBase}";`), `${prefix} 兜底页基址未随前缀改写`)
    assert.equal(html.includes(UI_API_TOKEN), false, `${prefix} 兜底页标记未被替换`)
  }

  const pre = await v2post(base, '/api/toolkit-panel/v2/install/precheck', { source: { kind: 'local', path: fixturePlugin } })
  assert.equal(pre.ok, true, JSON.stringify(pre))
  const conf = await v2post(base, '/api/toolkit-panel/v2/install/confirm', { source: { kind: 'local', path: fixturePlugin } })
  assert.equal(conf.ok, true, JSON.stringify(conf))

  const sA = await getJson(base, '/api/toolkit-panel/v2/snapshot')
  const sB = await getJson(base, '/api/tk2-panel/v2/snapshot')
  assert.deepEqual(sA.plugins.map((p) => p.id), ['fixture/contract-plugin'], 'A 有且只有那个插件')
  assert.deepEqual(sB.plugins.map((p) => p.id), [], `B 被串扰：${JSON.stringify(sB.plugins)}`)
  // 第二实例的写面照常可用（不是只读影子），且它不认识 A 装的插件
  const bEnable = await v2post(base, '/api/tk2-panel/v2/enabled', {
    id: 'fixture/contract-plugin', enabled: false, confirm: 'fixture/contract-plugin',
  })
  assert.equal(bEnable.ok, false)
  assert.equal(bEnable.code, 'plugin-unknown', `B 的 registry 竟认识 A 的插件：${JSON.stringify(bEnable)}`)
})

test('B 的 SSE 收不到 A 的事件：事件名前缀链路端到端隔离', async (t) => {
  const A = stackDir(t, 'sseA', DEFAULT_SERVICE_PREFIX)
  const B = stackDir(t, 'sseB', 'tk2')
  const capA = mount(new Context(), A.config)
  const capB = mount(new Context(), B.config)
  t.after(() => {
    for (const d of [...capA.disposers, ...capB.disposers]) d()
  })
  const { base } = await serve(t, [capA.routes, capB.routes])
  const controller = new AbortController()
  const resB = await fetch(`${base}/api/tk2-panel/v2/events`, { signal: controller.signal })
  assert.equal(resB.status, 200)
  const reader = resB.body.getReader()
  const decoder = new TextDecoder()
  const collect = async (ms) => {
    const until = Date.now() + ms
    let text = ''
    while (Date.now() < until) {
      const race = await Promise.race([
        reader.read(),
        new Promise((r) => setTimeout(() => r('timeout'), Math.max(1, until - Date.now()))),
      ])
      if (race === 'timeout') continue
      if (race.done) break
      text += decoder.decode(race.value, { stream: true })
    }
    return text
  }
  const hello = await collect(900)
  assert.match(hello, /event: hello/, 'SSE 首帧必须是 hello')
  assert.ok(hello.includes('tk2'), `hello 帧须携带本实例前缀：${hello.slice(0, 200)}`)

  await v2post(base, '/api/toolkit-panel/v2/install/precheck', { source: { kind: 'local', path: fixturePlugin } })
  await v2post(base, '/api/toolkit-panel/v2/install/confirm', { source: { kind: 'local', path: fixturePlugin } })
  const after = await collect(700)
  assert.equal(after.includes('plugin-added'), false, `B 收到了 A 的事件：${after}`)
  controller.abort()
  await reader.cancel().catch(() => {})
})

// ── ③ 装入/卸出级联清理 ────────────────────────────────────────────────
function multisetGrowth(before, after) {
  const counts = new Map()
  for (const h of before) counts.set(h, (counts.get(h) || 0) + 1)
  const grown = []
  for (const h of after) {
    const left = counts.get(h) || 0
    if (left > 0) counts.set(h, left - 1)
    else grown.push(h)
  }
  return grown
}

test('mock 桶装入 → 卸出：路由全部注销、订阅全部解除、巡检定时器与句柄不增一个', async (t) => {
  const stack = stackDir(t, 'casc', DEFAULT_SERVICE_PREFIX)
  // 让装配真的留下定时器：doctor 周期巡检开着（500ms），卸出后必须被 stopWatch 清掉
  stack.config.doctor = { watchInterval: 500 }
  const ctx = new Context()
  const baseline = activeHandles()
  const cap = mount(ctx, stack.config)
  assert.equal(cap.routes.length, FIXTURE_DEFAULT_ROUTES)
  assert.equal(cap.unregistered.length, 0)
  assert.ok(cap.subs.length > 0, '装配必须建立事件订阅（健康回写/SSE 转发）')
  const mountedTimeouts = activeHandles().filter((h) => h === 'Timeout').length
  assert.ok(
    mountedTimeouts > baseline.filter((h) => h === 'Timeout').length,
    '装配后应存在巡检定时器（否则本用例没测到定时器清理）',
  )

  for (const d of cap.disposers) d()
  await new Promise((r) => setTimeout(r, 150))

  assert.deepEqual(
    cap.unregistered.slice().sort(),
    cap.routes.map((r) => r.path).slice().sort(),
    '卸出后 HTTP 路由未全部注销',
  )
  assert.equal(cap.disposed.length, cap.subs.length, `订阅未全部解除：${cap.disposed.length}/${cap.subs.length}`)
  assert.deepEqual(multisetGrowth(baseline, activeHandles()), [], '卸出后仍有残留活动句柄（定时器/管道/子进程）')
})

// ── ⑤ guard 不假设拥有根 webServer ─────────────────────────────────────
test('guard 用被注入的 webServer 与宿主配对服务：读放行、跨站写拒、无配对的外部 Host 拒', async (t) => {
  const stack = stackDir(t, 'guard', DEFAULT_SERVICE_PREFIX)
  // 该 ctx 上没有 remoteWebUiPairing（配对服务归宿主），webServer 也归宿主 —— 面板必须照用不误
  const cap = mount(new Context(), stack.config)
  t.after(() => {
    for (const d of cap.disposers) d()
  })
  const byPath = new Map(cap.routes.map((r) => [r.path, r]))

  const read = await call(byPath.get('/api/toolkit-panel/snapshot'), 'GET')
  assert.equal(read.status, 200, 'loopback socket + loopback Host ⇒ 只读放行')

  const crossSiteWrite = await call(byPath.get('/api/toolkit-panel/plan'), 'POST', {
    site: 'cross-site',
    origin: 'https://evil.example',
    json: {},
  })
  assert.equal(crossSiteWrite.status, 403, '跨站写请求必须被拒')

  const tunneledRead = await call(byPath.get('/api/toolkit-panel/snapshot'), 'GET', {
    host: 'example.invalid:3080',
  })
  assert.equal(tunneledRead.status, 403, '配对服务缺席时外部 Host 的只读请求一律拒（fail-closed）')

  const tunneledWrite = await call(byPath.get('/api/toolkit-panel/v2/enabled'), 'POST', {
    host: 'example.invalid:3080',
    site: 'same-origin',
    json: {},
  })
  assert.equal(tunneledWrite.status, 403, '写路由禁止 devicesFile 兜底（P2.0② 语义在前缀化后不变）')

  // 单实例装配不得出现别的前缀的面（缺省实例只管自己的基址）
  assert.equal([...byPath.keys()].every((p) => p.startsWith('/api/toolkit-panel/')), true)
  assert.equal(byPath.has('/api/tk2-panel/snapshot'), false)
})
