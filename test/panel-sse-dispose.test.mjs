// Pack D · SSE 与面板卸载联动
//
// 要钉住的是这一格：**客户端一直挂着 SSE 连接、面板被卸出**。
// 已打开的 response 和心跳 setInterval 都不是 cordis 的 effect，光靠
// `response.on('close'|'error')` 永远不会触发；不修的话面板拆完还会留一个
// 每 15s 往死面板写 ping 的定时器，流也永远不结束。
//
// 两条层次：
//   ① createV2Api 单元面：登记表计数、end 被调、订阅解除、心跳句柄归零、幂等；
//   ② 真 cordis 卸载面：面板挂在真插件的派生 ctx 上，走真 fiber.dispose()
//      （不是手调 disposer），断言同一条 SSE response 被 end、心跳句柄回到基线。
//
// 为什么 ② 用"直接驱动 route handler + 受控 response 桩"而不是真 http+fetch：
// Node 24/Windows 上，本文件与其它测试文件同批并发跑时会命中 libuv 断言
// `!(handle->flags & UV_HANDLE_CLOSING)`（src\win\async.c:94）从而把整个文件判失败
// ——单独跑正常、两文件并跑正常、全量批跑必崩，与被测产品无关。真 socket 层的
// SSE 端到端可达性已由 test/p7-embed.test.mjs 的 hello 帧 + 前缀隔离两条用例覆盖
// （那两条不动）。本文件因此把断言做在**产品自己的卸载链**上，且比读 socket 更确定：
// 直接数 response.end 的调用次数与进程活动句柄。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'

import { createV2Api } from '../panel/manager/v2-api.mjs'
import { AUDIT_EVENTS } from '../contract/dist/index.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// Windows 下动态 import 必须走 file:// URL（与 p7-embed 同口径）
const panelMod = await import(pathToFileURL(join(ROOT, 'panel', 'index.js')).href)

const EVENTS_PATH = '/api/toolkit-panel/v2/events'
const activeResources = () => process.getActiveResourcesInfo().slice().sort()
function countKind(list, kind) {
  return list.filter((h) => h === kind).length
}
const timeouts = () => countKind(activeResources(), 'Timeout')
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms))

function tmpFor(t, label) {
  const dir = mkdtempSync(join(tmpdir(), `${label}-`))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

/** 受控 response：能记 writeHead/write/end，能手工触发 close/error。 */
function fakeStream() {
  const rec = {
    head: null,
    writes: [],
    ended: 0,
    listeners: {},
    writeHead(code, headers) {
      rec.head = { code, headers }
      return rec
    },
    write(chunk) {
      rec.writes.push(String(chunk))
      return true
    },
    end() {
      rec.ended += 1
    },
    on(event, cb) {
      ;(rec.listeners[event] ||= []).push(cb)
      return rec
    },
    emitEvent(event) {
      for (const cb of rec.listeners[event] || []) cb()
    },
  }
  return rec
}

const sseRequest = { method: 'GET', url: EVENTS_PATH, headers: { host: '127.0.0.1:3080' }, socket: { remoteAddress: '127.0.0.1' } }

/**
 * 只替换 webServer，其余（effect/on/reflect…）全部走真 ctx——被测的正是真卸载链。
 * webServer 用**活的路由表**：register 写入、返回的注销函数移除，卸载后这条路
 * 径就查不到，与真宿主的语义一致（不是测试里留着一份过期快照）。
 */
function withWebServer(ctx, sink) {
  return new Proxy(ctx, {
    get(target, prop) {
      if (prop === 'webServer') {
        return {
          register(route) {
            sink.byPath.set(route.path, route)
            sink.routes.push(route)
            return () => {
              sink.byPath.delete(route.path)
              sink.unregistered.push(route.path)
            }
          },
        }
      }
      const value = target[prop]
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

/** 面板配置：状态文件/备份根/设备表全进各自 tmpdir，不碰仓内真实资产。 */
function panelConfig(t) {
  const tmp = tmpFor(t, 'pack-d-panel')
  const devicesFile = join(tmp, 'devices.json')
  writeFileSync(devicesFile, '{}', 'utf8')
  return {
    servicePrefix: 'toolkit',
    toolkitRoot: ROOT,
    devicesFile,
    backupRoot: join(tmp, 'backups'),
    doctorCli: join(tmp, 'doctor-unused.mjs'),
    registry: { statePath: join(tmp, 'state.json'), autoload: false },
    doctor: { watchInterval: 0 },
  }
}

/** 以"被宿主装载"的形态装一次面板，返回真 fiber 与活路由表。 */
async function mountPanel(t, pluginName = 'pack-d-panel') {
  const ctx = new Context()
  const sink = { routes: [], unregistered: [], byPath: new Map() }
  const config = panelConfig(t)
  const fiber = ctx.plugin({
    name: pluginName,
    inject: [],
    apply(pluginCtx) {
      panelMod.apply(withWebServer(pluginCtx, sink), config)
    },
  })
  await fiber // cordis 的 apply 异步跑，不 await 就是"装配还没发生就断言"
  t.after(() => fiber.dispose())
  return { ctx, fiber, sink }
}

// ── ① createV2Api 单元面 ───────────────────────────────────────────────────

test('Pack D 单元：closeAllStreams 结束连接、清心跳、解除订阅，且幂等不重复计数', async () => {
  const subs = { on: 0, off: 0 }
  const v2 = createV2Api({
    registry: { list: () => [], get: () => undefined },
    doctor: {},
    servicePrefix: 'toolkit',
    subscribe: () => {
      subs.on += 1
      let live = true
      return () => {
        if (!live) return // 自己也幂等，配合验证调用方不重复计数
        live = false
        subs.off += 1
      }
    },
  })
  assert.equal(v2.liveStreamCount(), 0)

  const before = timeouts()
  const stream = fakeStream()
  const events = v2.routes.find((r) => r.path.endsWith('/v2/events'))
  await events.handler(sseRequest, stream)
  assert.equal(v2.liveStreamCount(), 1, '打开一条流就该进登记表')
  // 计数按定义式给（5 条契约短名 + 全部审计事件）：新增审计事件时这里不必跟着改字面量，
  // 而客户端孪生表若漏改会由 test/toolkit-root.test.mjs 的"孪生表一致"用例翻红。
  assert.equal(subs.on, 5 + AUDIT_EVENTS.length, `${5 + AUDIT_EVENTS.length} 类事件（5 契约 + ${AUDIT_EVENTS.length} 审计）各订阅一次`)
  assert.ok(timeouts() > before, `心跳定时器必须在场，否则没测到句柄清理：before=${before}`)

  assert.equal(v2.closeAllStreams(), 1, 'closeAll 报回被关掉的连接数')
  assert.equal(v2.liveStreamCount(), 0)
  assert.equal(stream.ended, 1, 'response.end 必须被调用（旧实现从不调）')
  assert.equal(subs.off, subs.on, '订阅全部解除')
  assert.ok(timeouts() <= before, `closeAll 之后心跳定时器必须清零：now=${timeouts()} before=${before}`)
  assert.equal(v2.closeAllStreams(), 0, '再调一次不重复处理')

  // 客户端稍后才断开：close/error 不得二次触发计数
  stream.emitEvent('close')
  stream.emitEvent('error')
  assert.equal(subs.off, subs.on, 'teardown 必须幂等：close/error 不得二次计数')
  assert.equal(stream.ended, 1, 'end 也只调一次')
})

test('Pack D 单元：客户端自己断开（close）即出登记，closeAll 不再重复处理', async () => {
  const v2 = createV2Api({
    registry: { list: () => [] },
    doctor: {},
    servicePrefix: 'toolkit',
    subscribe: () => () => {},
  })
  const stream = fakeStream()
  const events = v2.routes.find((r) => r.path.endsWith('/v2/events'))
  await events.handler(sseRequest, stream)
  assert.equal(v2.liveStreamCount(), 1)
  stream.emitEvent('close')
  assert.equal(v2.liveStreamCount(), 0, '正常断连要把它从登记表摘掉')
  assert.equal(stream.ended, 0, '客户端自己断的场景不该由服务端再 end 一次')
  assert.equal(v2.closeAllStreams(), 0)
})

test('Pack D 单元：多条并发流全部收尾，计数与实际连接数一致', async () => {
  const v2 = createV2Api({
    registry: { list: () => [] },
    doctor: {},
    servicePrefix: 'toolkit',
    subscribe: () => () => {},
  })
  const events = v2.routes.find((r) => r.path.endsWith('/v2/events'))
  const streams = [fakeStream(), fakeStream(), fakeStream()]
  for (const s of streams) await events.handler(sseRequest, s)
  assert.equal(v2.liveStreamCount(), 3)
  assert.equal(v2.closeAllStreams(), 3)
  for (const s of streams) assert.equal(s.ended, 1, '每条流各 end 一次')
  assert.equal(v2.liveStreamCount(), 0)
})

// ── ② 真 cordis fiber 卸载面 ───────────────────────────────────────────────

test('Pack D：SSE 流存活期间真 fiber.dispose → 流被 end、心跳句柄归零、路由与订阅同批清', async (t) => {
  const { fiber, sink } = await mountPanel(t)
  assert.equal(sink.routes.length, 33, '面板装载的是完整 33 条路由（S4 F-37 起含 GET /v2/memory/search）')

  const baseline = timeouts()
  const events = sink.byPath.get(EVENTS_PATH)
  assert.ok(events, 'SSE 路由已注册')
  const stream = fakeStream()
  await events.handler(sseRequest, stream)
  assert.match(stream.writes.join(''), /event: hello/, '流是真通着的（hello 帧已写出）')
  const mounted = timeouts()
  assert.ok(mounted > baseline, `前置：心跳定时器在场，否则本用例没测到东西（baseline=${baseline}）`)
  assert.equal(sink.unregistered.length, 0, '前置：还没卸载')

  // 客户端**不**断开，直接拆面板——旧实现漏掉的正是这一格
  await fiber.dispose()
  await tick(80) // 让 teardown 期间派生的瞬时定时器退场

  assert.equal(sink.unregistered.length, 33, '33 条路由全部注销（S4 F-37 起含 GET /v2/memory/search）')
  assert.equal(sink.byPath.has(EVENTS_PATH), false, 'SSE 路由从活表中摘除，之后不可能再来新连接')
  assert.equal(stream.ended, 1, '已打开的流必须被服务端 end()（旧实现：永不调用）')
  const after = timeouts()
  assert.ok(after <= baseline, `心跳句柄必须回到基线以内：baseline=${baseline} mounted=${mounted} now=${after}`)
})

test('Pack D：SSE 收尾抛错不外溢——面板卸载链继续走完 services.stop()', async (t) => {
  // 断言的是**性质**而不是某一层实现：一条半死的流在收尾时抛错，不能拖累
  // registry/doctor 的拆除（REQ-6 级联清理）。panel/index.js 里的 try/catch 是第一道，
  // cordis 的 _unload 也会把 disposer 异常收进 ctx.logger——所以本用例不专门证明
  // try/catch 那一层存在（去掉它也照样绿），它证明的是端到端行为成立。
  const { ctx, fiber, sink } = await mountPanel(t, 'pack-d-throw')
  const stream = fakeStream()
  await sink.byPath.get(EVENTS_PATH).handler(sseRequest, stream)
  stream.end = () => {
    throw new Error('simulated end failure')
  }
  await fiber.dispose() // 不应抛出
  assert.equal(sink.unregistered.length, 33, '路由注销仍完成（S4 F-37 起 33 条同批注销）')
  assert.equal(ctx['toolkit/registry'], undefined, 'registry 服务仍被摘除 ⇒ services.stop() 确实跑到了')
  assert.equal(ctx['toolkit/doctor'], undefined, 'doctor 服务同上（Pack C 注册面在异常路径下也生效）')
})
