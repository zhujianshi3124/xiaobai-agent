/**
 * 面板记忆检索路由钉（S4 F-37；设计正本 docs/f37-search-design-c1-007.md §B/§C3，批1-3/裁1-3）
 *
 * MS-1  路由形态：GET /v2/memory/search 注册在 v2 表、change 缺省＝只读闸（§4.1 判据在注册处）
 * MS-2  参数面：空查询＝空结果＋参数提示（§C3 第 5 行）；超长/非法 limit 提示随应答回带
 * MS-3  降级面①：检索函数装载失败 ⇒ 200＋available:false＋批准原文（§C3 第 2 行，裁2）
 * MS-4  降级面②：数据根不可读 ⇒ 200＋available:false＋reason 点名（§C3 第 3 行，裁2）
 * MS-5  成功面：临时数据根真会话命中；行形状与 searchMemory 同源；恒 200
 * MS-6  零外传红线：路由链源文件零 fetch（§B3）
 * MS-7  两降级文案常量逐字＝设计 §五批准原文（三方同步基准：路由应答＋两渲染器）
 *
 * 隔离：AGENT_MEMORY_ROOT 指向 mkdtemp 临时根（finally 还原），生产根零触碰。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'

import { createV2Api, toPanelRoutes } from '../panel/manager/v2-api.mjs'
import { SEARCH_COPY } from '../panel/manager/memory-search.mjs'

function makeV2() {
  return createV2Api({
    registry: { list: () => [], get: () => null },
    doctor: undefined,
    servicePrefix: 'toolkit',
    subscribe: () => () => {},
  })
}

function withServer(t, v2) {
  const routes = toPanelRoutes(v2.routes)
  const server = http.createServer(async (request, response) => {
    const path = request.url.split('?')[0]
    const route = routes.find((r) => r.path === path)
    if (!route) { response.writeHead(404); response.end(); return }
    if (request.method !== route.method) { response.writeHead(405, { allow: route.method }); response.end(); return }
    await route.handler(request, response)
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => server.close(),
  })))
}

test('MS-1: 路由形态——v2 表注册 GET /v2/memory/search，无 change 标注＝只读闸（§4.1 判据在注册处）', () => {
  const v2 = makeV2()
  const row = v2.routes.find((r) => r.path.endsWith('/v2/memory/search'))
  assert.ok(row, '路由行在场')
  assert.equal(row.method, 'GET', 'GET 形态（裁1：GET 不标 change ⇒ 自然归只读闸）')
  assert.notEqual(row.change, true, 'change 非 true＝只读闸')
  assert.equal(typeof row.handler, 'function', 'handler 在位')
  const wrapped = toPanelRoutes(v2.routes).find((r) => r.path.endsWith('/v2/memory/search'))
  assert.equal(wrapped.kind, 'exact', 'exact 路由随 toPanelRoutes 形态')
})

test('MS-2: 参数面——空查询/超长/非法 limit＝200 空结果＋参数提示（§C3 第 5 行）', async (t) => {
  const v2 = makeV2()
  const { base, close } = await withServer(t, v2)
  t.after(close)
  const empty = await fetch(`${base}/api/toolkit-panel/v2/memory/search`).then((r) => ({ status: r.status, json: r.json() }))
  assert.equal(empty.status, 200)
  const emptyBody = await empty.json
  assert.equal(emptyBody.ok, true)
  assert.equal(emptyBody.available, true, '参数面不算故障')
  assert.deepEqual(emptyBody.results, [], '空查询＝空结果')
  assert.ok(emptyBody.notices.length > 0, '参数提示在案')

  const long = await fetch(`${base}/api/toolkit-panel/v2/memory/search?q=${'x'.repeat(201)}`).then((r) => r.json())
  assert.deepEqual(long.results, [], '超长查询＝空结果')
  assert.ok(long.notices.some((n) => n.includes('200')), '超长提示点名上限')
})

test('MS-3: 降级面①——检索函数装载失败 ⇒ 200＋available:false＋批准原文（§C3 第 2 行）', async (t) => {
  const { createMemorySearchHandler } = await import('../panel/manager/memory-search.mjs')
  // 注入失败的加载器＝与 lib 缺席/装载失败同一条 catch 路径
  const row = createMemorySearchHandler('/api/toolkit-panel/v2', {
    loadSearchMemory: async () => { throw new Error('lib not present') },
  })
  assert.equal(row.change, false, '降级路由形态不变')
  const server = http.createServer(async (request, response) => { await row.handler(request, response) })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => server.close())
  const base = `http://127.0.0.1:${server.address().port}`
  const res = await fetch(`${base}/memory/search?q=任何词`)
  assert.equal(res.status, 200, '降级不 5xx（裁2）')
  const body = await res.json()
  assert.equal(body.ok, true)
  assert.equal(body.available, false)
  assert.equal(body.reason, SEARCH_COPY.libAbsent, '降级文案＝批准原文逐字')
})

test('MS-4: 降级面②——数据根不可读 ⇒ 200＋available:false＋reason 点名（§C3 第 3 行）', async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'memory-search-degrade-'))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  writeFileSync(join(tmp, 'registry.json'), '{broken!!', 'utf8')
  const prevRoot = process.env.AGENT_MEMORY_ROOT
  process.env.AGENT_MEMORY_ROOT = tmp
  t.after(() => {
    if (prevRoot === undefined) delete process.env.AGENT_MEMORY_ROOT
    else process.env.AGENT_MEMORY_ROOT = prevRoot
  })
  const v2 = makeV2()
  const { base, close } = await withServer(t, v2)
  t.after(close)
  const res = await fetch(`${base}/api/toolkit-panel/v2/memory/search?q=任何词`)
  assert.equal(res.status, 200, '数据根不可读降级不 5xx（裁2）')
  const body = await res.json()
  assert.equal(body.available, false)
  assert.ok(body.reason.startsWith(SEARCH_COPY.rootUnreadable.split('<reason>')[0]), 'reason 以批准模板开头')
  assert.ok(body.reason.endsWith(SEARCH_COPY.rootUnreadable.split('<reason>')[1]), 'reason 以批准模板结尾')
  assert.ok(body.reason.includes('CORRUPT_JSON') || body.reason.includes('无法解析'), 'reason 点名成因')
})

test('MS-5: 成功面——临时数据根真会话命中；行形状同源；恒 200', async (t) => {
  const { pathToFileURL } = await import('node:url')
  const am = await import(pathToFileURL(join(import.meta.dirname, '..', 'lib', 'agent-memory', 'lib', 'index.js')).href)
  const tmp = mkdtempSync(join(tmpdir(), 'memory-search-ok-'))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const ws = join(tmp, 'ws')
  mkdirSync(ws, { recursive: true })
  const rec = am.createSession(tmp, { workspace: ws, taskSummary: '路由成功面格' })
  am.addEntry(tmp, rec.sid, { desc: '路由成功面检索词月岩', workspace: ws })

  const prevRoot = process.env.AGENT_MEMORY_ROOT
  process.env.AGENT_MEMORY_ROOT = tmp
  t.after(() => {
    if (prevRoot === undefined) delete process.env.AGENT_MEMORY_ROOT
    else process.env.AGENT_MEMORY_ROOT = prevRoot
  })
  const v2 = makeV2()
  const { base, close } = await withServer(t, v2)
  t.after(close)
  const res = await fetch(`${base}/api/toolkit-panel/v2/memory/search?q=${encodeURIComponent('月岩')}`)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.ok, true)
  assert.equal(body.available, true)
  assert.equal(body.results.length, 1, '临时根真会话命中')
  assert.deepEqual(
    Object.keys(body.results[0]).sort(),
    ['file', 'no', 'sec', 'sid', 'snippet', 'status', 'text', 'ts', 'workspace'],
    '结果行形状与 searchMemory 同源'
  )
  assert.equal(body.sessions, 1)
  assert.equal(body.unreadable, 0)
})

test('MS-6: 零外传红线——路由链源文件零 fetch（§B3；静态源扫描钉）', () => {
  for (const rel of ['panel/manager/memory-search.mjs', 'lib/agent-memory/lib/search-index.js']) {
    const src = readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
    assert.equal(/fetch\s*\(/.test(src), false, `${rel} 不得出现 fetch（零外传）`)
    assert.equal(/XMLHttpRequest|WebSocket|navigator\.sendBeacon/.test(src), false, `${rel} 零上报通道`)
  }
})

test('MS-7: 两降级文案常量逐字＝设计 §五批准原文（三方同步基准）', () => {
  assert.equal(SEARCH_COPY.libAbsent, 'agent-memory 不在位，检索暂不可用。记忆台账功能本身不受影响。')
  assert.equal(SEARCH_COPY.rootUnreadable, '记忆数据根不可读（<reason>）。检索暂不可用，记忆正本不受影响。')
})
