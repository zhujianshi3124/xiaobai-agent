// 批 8 · ★19 · `install/confirm` 补逐字 confirm（F-17 契约五挂账第 3 处）的服务端面双向钉
//
// 为什么单独一个文件：v2 写路由里 uninstall/enabled/reload/config 四条都在 handler 首行过
// `requireConfirm`（逐字等于目标 id，缺省/不符 ⇒ 400 confirm-missing），唯独 `install/confirm`
// 以"预检通过"为闸、不要求 confirm（recon A-32：契约"所有写操作都要逐字 confirm"的违例格）。
// 既有覆盖里没有一行钉它 ⇒ 任意进程/页面能无声装入插件。本文件钉四格 + 一格闸序：
//   ①缺 confirm ⇒ 400 confirm-missing 且零装入；②逐字不符（尾随空白 / 大小写各异）⇒ 400 且零装入；
//   ③逐字一致 ⇒ 照常安装（闸不打死正常通道）；④npm 来源 confirm 逐字等于 spec 后照常走到
//   npm 拒装（预检报告整体下发不受伤，闸不改变下游语义）；⑤source 形状非法 ⇒ value-invalid
//   （闸在形状校验之后，不是用它吞形状错误）。
// 逐字确认的对象＝安装源自身的标识：kind:"local" ⇒ 用户在向导第一步亲手输入的绝对路径；
// kind:"npm" ⇒ spec。装前无插件 id 可用（PrecheckReport 不带独立 id 字段），路径/ spec 是
// 双方在请求前都已知的同一事实，服务端零成本核验、零契约形状变更。
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

const fixtureDir = (name) => join(import.meta.dirname, 'fixtures', 'registry', name)
const contractPlugin = fixtureDir('contract-plugin')
// D-10：本文件独占的夹具开关（与 panel-v2.test.mjs 同构，避免并行互抢）
const markerPath = join(tmpdir(), `dsh-fixture-marker-${process.pid}-install-confirm-gate`)
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

// 与 panel-v2.test.mjs 的 makeStack 同构（真 registry + 真 doctor.precheck + 真 v2 路由）
async function makeStack(t) {
  const tmp = mkdtempSync(join(tmpdir(), 'install-confirm-gate-'))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const ctx = new Context()
  const registry = new ToolkitRegistryCore(cordisHost(ctx), {
    servicePrefix: 'toolkit',
    statePath: join(tmp, 'state.json'),
    retryBackoffMs: 1,
    // flake 两振立案（010 首振/017 二振，同签名：满载首跑文件级红、独立 nt 同树绿）：250ms 是本文件自设
    // 的装载预算（生产缺省 30_000），实测空闲 p99=35ms、32 进程风暴 max=130ms，系统级突发可偶发击穿 250ms
    // ⇒ 裕度放宽到 3000（12× idle p99），五格断言与真装载覆盖零改动（禁为绿弱化断言）。档：debt 环境注记。
    loadTimeoutMs: 3000,
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
  return { registry, base }
}

function post(base, path, body) {
  return fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  }).then(async (r) => ({ status: r.status, json: await r.json() }))
}

const INSTALL = '/api/toolkit-panel/v2/install/confirm'

test('★19 闸①：缺 confirm ⇒ 400 confirm-missing 且零装入', async (t) => {
  setMarker(true)
  const { registry, base } = await makeStack(t)
  const res = await post(base, INSTALL, { source: { kind: 'local', path: contractPlugin } })
  assert.equal(res.status, 400)
  assert.equal(res.json.ok, false)
  assert.equal(res.json.code, 'confirm-missing')
  assert.match(res.json.error, /逐字/)
  assert.equal(registry.get('fixture/contract-plugin'), undefined, 'confirm 缺失不得装入')
  assert.equal(registry.list().length, 0, 'registry 零副作用')
})

test('★19 闸②a：逐字不符（尾随空白）⇒ 400 且零装入', async (t) => {
  setMarker(true)
  const { registry, base } = await makeStack(t)
  const trailing = await post(base, INSTALL, { source: { kind: 'local', path: contractPlugin }, confirm: contractPlugin + ' ' })
  assert.equal(trailing.status, 400)
  assert.equal(trailing.json.code, 'confirm-missing')
  assert.equal(registry.list().length, 0, '尾随空白 ≠ 逐字一致，不得装入')
})

test('★19 闸②b：逐字不符（大小写各异）⇒ 400 且零装入', async (t) => {
  setMarker(true)
  const { registry, base } = await makeStack(t)
  // 大小写逐字不同（文件系统可能不区分大小写，但"逐字确认"比的是字面量）
  const cased = await post(base, INSTALL, { source: { kind: 'local', path: contractPlugin }, confirm: contractPlugin.replace(/[a-z]/g, (c) => c.toUpperCase()) })
  assert.equal(cased.status, 400)
  assert.equal(cased.json.code, 'confirm-missing')
  assert.equal(registry.list().length, 0, '大小写各异 ≠ 逐字一致，不得装入')
})

test('★19 闸③：逐字一致 ⇒ 照常安装（闸不打死正常通道）', async (t) => {
  setMarker(true)
  const { registry, base } = await makeStack(t)
  const res = await post(base, INSTALL, { source: { kind: 'local', path: contractPlugin }, confirm: contractPlugin })
  assert.equal(res.status, 200)
  assert.equal(res.json.ok, true, JSON.stringify(res.json))
  const entry = registry.get('fixture/contract-plugin')
  assert.ok(entry, '逐字确认后安装真实生效')
  assert.equal(entry.status, 'active')
})

test('★19 闸④：npm 来源 confirm 逐字等于 spec ⇒ 照常走到 npm 拒装（下游语义不受伤）', async (t) => {
  setMarker(true)
  const { registry, base } = await makeStack(t)
  const res = await post(base, INSTALL, { source: { kind: 'npm', spec: 'x' }, confirm: 'x' })
  assert.equal(res.status, 200, 'npm 拒装是业务结论不是闸拒绝')
  assert.equal(res.json.ok, false)
  assert.ok(res.json.precheck.blocking.some((b) => /npm 来源在 P2 尚未实现/.test(b.message)), '预检报告整体下发')
  assert.equal(registry.list().length, 0)
})

test('★19 闸⑤：source 形状非法 ⇒ value-invalid（闸在形状校验之后）', async (t) => {
  setMarker(true)
  const { base } = await makeStack(t)
  const res = await post(base, INSTALL, {})
  assert.equal(res.status, 400)
  assert.equal(res.json.code, 'value-invalid', '缺 source 报形状错，不被 confirm 闸吞掉')
})
