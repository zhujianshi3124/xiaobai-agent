// W11-a · 通用 /execute 的 kind 白名单（落差条目 F-75：token 跨种消费）
//
// 缺陷面：`PLAN_STORE` 是**单一共享池**，池里 13 类 kind 混放；`/uninstall|restore|mount/execute`
// 与 `/doctor/{apply,rollback}/execute`、`/snapshot-restore/execute` 六族**都判 plan.kind**，
// 唯独通用 `/execute` 只 `executePlan(token)` 不判 kind ⇒ 拿别的族的 token 打这里，会绕开那条族
// 自己的专用路由（语义、确认层、副作用序列都不同），而 SHA 闸/锚点复验这些共同防线看不出来。
// 与已修的 R1 同构：R1 把客户端兜底改 fail-closed，本笔把服务端兜底改 fail-closed。
//
// 手法：直驱 panel/index.js 注册的真实 route.handler（真 guard / 真 body 解析 / 真 executePlan 唯一
// 通道），不用真 http+fetch（Node 24/Win 全量批跑命中 libuv 断言，见 docs/debt.md《环境注记》）。
// 所有写盘都落在 os.tmpdir 的假 toolkitRoot 里，真仓与 ~/.dsh 零触碰。
//
// 放行的族用真实构造器产出（apply-engine 的 createPlan/createTogglePlan/createConfigPlan，与各
// plan 路由存进池里的同一形状）；被拒的族用"逐字段照抄该族路由 putPlan 载荷"的合成 plan —— 本闸
// 只读 `token` 与 `plan.kind` 两项，其余字段不参与判定，故合成面与被测命题一致；那些族自己的
// 端到端链在 scripts/p24-ui-matrix.mjs 已各自覆盖。
import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const panelMod = await import(pathToFileURL(join(root, 'panel', 'index.js')).href)
const engine = await import(pathToFileURL(join(root, 'panel', 'manager', 'apply-engine.mjs')).href)

const PATCH_TEXT = [
  '- insert:',
  "    - id: probe-row",
  "      name: '@probe/nothing'",
  '      config:',
  '        disabled: false',
  '        timeoutMs: 100',
  '',
].join('\n')

function makeApi(t) {
  const kitRoot = mkdtempSync(join(tmpdir(), 'wsl-execute-kind-'))
  t.after(() => rmSync(kitRoot, { recursive: true, force: true }))
  writeFileSync(join(kitRoot, 'cordis.patch.yml'), PATCH_TEXT, 'utf8')
  const routes = []
  const ctx = {
    effect: (cb) => { cb(); return () => {} },
    get: () => undefined,
    webServer: { register: (route) => { routes.push(route); return () => {} } },
  }
  panelMod.apply(ctx, {
    toolkitRoot: kitRoot,
    backupRoot: join(kitRoot, '.panel-write-backups'),
    doctorCli: join(kitRoot, 'no-such-doctor.mjs'),
    doctorConfigRoot: join(kitRoot, 'doctor-config'),
    devicesFile: join(kitRoot, 'no-such-devices.json'),
  })
  const base = '/api/toolkit-panel'

  function makeRequest(method, body) {
    const emitter = new EventEmitter()
    const request = {
      method,
      url: '/',
      headers: { host: '127.0.0.1:3080' },
      socket: { remoteAddress: '127.0.0.1' },
      on: (event, cb) => { emitter.on(event, cb); return request },
    }
    process.nextTick(() => {
      if (body !== undefined) emitter.emit('data', Buffer.from(JSON.stringify(body), 'utf8'))
      emitter.emit('end')
    })
    return request
  }

  async function call(path, method, body) {
    const route = routes.find((r) => r.path === base + path)
    assert.ok(route, '路由未注册: ' + path)
    const res = { statusCode: 0, raw: '' }
    res.writeHead = (code) => { res.statusCode = code }
    res.end = (payload) => { res.raw = payload === undefined ? '' : String(payload) }
    await route.handler(makeRequest(method, body), res)
    let json = null
    try { json = JSON.parse(res.raw) } catch { json = null }
    return { status: res.statusCode || 500, json }
  }

  return {
    kitRoot,
    patchFile: () => join(kitRoot, 'cordis.patch.yml'),
    callExecute: (token) => call('/execute', 'POST', { token }),
    callSnapshotRestoreExecute: (token) => call('/snapshot-restore/execute', 'POST', { token }),
  }
}

/** 放行进池：真实构造器 + 面板同一 backupRoot */
function putAllowedPlan(api, kind) {
  const file = api.patchFile()
  const backupRoot = join(api.kitRoot, '.panel-write-backups')
  if (kind === 'patch-edit') {
    return engine.createPlan({ file, rowId: 'probe-row', key: 'timeoutMs', value: '250', backupRoot })
  }
  if (kind === 'toggle') {
    // 探针行的 disabled 现值是 false ⇒ 用"停用"方向才有真实变更可写（executePlan 没有 no-change 闸）
    return engine.createTogglePlan({ file, rowId: 'probe-row', enabled: false, backupRoot })
  }
  return engine.createConfigPlan({ file, rowId: 'probe-row', path: 'timeoutMs', value: 250, backupRoot })
}

/** 被拒族合成 plan：字段照抄 panel/index.js 对应路由 putPlan 的载荷形状 */
function putForeignPlan(api, kind) {
  const now = Date.now()
  const plan = {
    token: 'w11a-' + kind,
    kind,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 5 * 60 * 1000).toISOString(),
  }
  if (kind === 'doctor-apply') Object.assign(plan, { issueId: 'probe/issue', stamp: null, steps: [] })
  if (kind === 'doctor-rollback') Object.assign(plan, { stamp: '20260925-000000', action: 'rollback' })
  if (kind === 'snapshot-restore') Object.assign(plan, { file: api.patchFile(), stamp: '20260925-000000' })
  if (kind === 'uninstall-soft-patch') Object.assign(plan, { file: api.patchFile(), rowId: 'probe-row' })
  engine.putPlan(plan)
  return plan
}

// ── 正向：白名单三族放行且真的走唯一落盘通道 ─────────────────────────────────────
for (const kind of ['patch-edit', 'toggle', 'config-edit']) {
  test('W11-a · /execute 放行 ' + kind + ' 族并落盘（白名单不是把路由打死）', async (t) => {
    const api = makeApi(t)
    const plan = putAllowedPlan(api, kind)
    engine.putPlan(plan)
    const before = readFileSync(api.patchFile(), 'utf8')
    const { status, json } = await api.callExecute(plan.token)
    assert.equal(status, 200, kind + ' 族应被放行，实得 ' + JSON.stringify(json))
    assert.equal(json.ok, true)
    const after = readFileSync(api.patchFile(), 'utf8')
    assert.notEqual(after, before, '放行后必须真的写盘')
    assert.equal(engine.getPlan(plan.token), undefined, '执行完 token 必须出池（不可重放）')
  })
}

// ── 反向：其余六族 token 打 /execute 一律拒，且不消耗 ─────────────────────────────
for (const kind of ['doctor-apply', 'doctor-rollback', 'snapshot-restore', 'uninstall-soft-patch']) {
  test('W11-a · ' + kind + ' 的 token 打 /execute ⇒ 拒、点名该走的专用路由、且不被消耗', async (t) => {
    const api = makeApi(t)
    const plan = putForeignPlan(api, kind)
    const before = readFileSync(api.patchFile(), 'utf8')
    const { status, json } = await api.callExecute(plan.token)
    assert.equal(status, 400, '实得 ' + JSON.stringify(json))
    assert.equal(json.ok, false)
    assert.equal(json.code, 'plan-kind-not-allowed')
    assert.match(json.error, /doctor\/apply\/execute|doctor\/rollback\/execute|snapshot-restore\/execute|uninstall\/execute/,
      '文案必须点名该走的专用路由，实得: ' + json.error)
    assert.ok(engine.getPlan(plan.token), '拒绝不得把别族的 token 顺手吃掉（否则专用路由就废了）')
    assert.equal(readFileSync(api.patchFile(), 'utf8'), before, '拒绝必须零写入')
  })
}

test('W11-a · 未知 kind 与无 kind 的 token 一律拒（fail-closed，不放行静默形态）', async (t) => {
  const api = makeApi(t)
  for (const kind of ['made-up-kind', undefined]) {
    const now = Date.now()
    engine.putPlan({
      token: 'w11a-' + String(kind),
      kind,
      file: api.patchFile(),
      rowId: 'probe-row',
      key: 'timeoutMs',
      value: '250',
      expectedSha: engine.sha256Of(readFileSync(api.patchFile(), 'utf8')),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 5 * 60 * 1000).toISOString(),
    })
    const { status, json } = await api.callExecute('w11a-' + String(kind))
    assert.equal(status, 400, 'kind=' + String(kind) + ' 必须被拒，实得 ' + JSON.stringify(json))
    assert.equal(json.code, 'plan-kind-not-allowed')
  }
})

test('W11-a · 不存在的 token ⇒ 仍走 plan-not-found（本闸不改变既有语义）', async (t) => {
  const api = makeApi(t)
  const { status, json } = await api.callExecute('no-such-token-at-all')
  assert.equal(status, 404, 'plan-not-found 在 PLAN_ERROR_STATUS 里就是 404（本笔不改既有映射）')
  assert.equal(json.code, 'plan-not-found')
})

test('W11-a · 反向不对称：patch-edit 的 token 打 /snapshot-restore/execute 仍被该路由自己的 kind 闸拒', async (t) => {
  const api = makeApi(t)
  const plan = putAllowedPlan(api, 'patch-edit')
  engine.putPlan(plan)
  const before = readFileSync(api.patchFile(), 'utf8')
  const { status, json } = await api.callSnapshotRestoreExecute(plan.token)
  assert.equal(status, 400, JSON.stringify(json))
  assert.equal(json.code, 'plan-kind-mismatch')
  assert.equal(readFileSync(api.patchFile(), 'utf8'), before, '拒绝必须零写入')
})

test('W11-a · 池里现存族必须被白名单/指路表显式覆盖（新增族不落进"没人管"的缝里）', () => {
  assert.ok(engine.GENERIC_EXECUTE_KINDS instanceof Set, 'apply-engine 未导出 GENERIC_EXECUTE_KINDS')
  assert.equal(typeof engine.DEDICATED_EXECUTE_ROUTE_BY_KIND, 'object', 'apply-engine 未导出 DEDICATED_EXECUTE_ROUTE_BY_KIND')
  const source = readFileSync(join(root, 'panel', 'manager', 'apply-engine.mjs'), 'utf8')
    + readFileSync(join(root, 'panel', 'manager', 'uninstall.mjs'), 'utf8')
  // 池里的 kind 有两种写法：字符串字面量，或引用本模块导出的 PLAN_KIND_* 常量。两种都解析，
  // 否则"把字面量换成常量"这种无害重构就会把这条钉削弱（第一版就踩过）。
  const poolKinds = new Set()
  for (const match of source.matchAll(/\bkind:\s*(?:"([a-z0-9-]+)"|'([a-z0-9-]+)'|([A-Z][A-Z0-9_]+))/g)) {
    const [, dq, sq, ident] = match
    if (dq || sq) { poolKinds.add(dq || sq); continue }
    const value = engine[ident]
    assert.ok(typeof value === 'string', 'kind 引用了常量 ' + ident + '，但它不在 apply-engine 导出面里（枚举漏了）')
    poolKinds.add(value)
  }
  assert.ok(poolKinds.size >= 12, '应能扫到池里的 kind 全集（含白名单三族 + 专用路由各族），实得 ' + poolKinds.size + ' 个: ' + [...poolKinds].join(','))
  for (const kind of poolKinds) {
    const allowed = engine.GENERIC_EXECUTE_KINDS.has(kind)
    const routed = Object.prototype.hasOwnProperty.call(engine.DEDICATED_EXECUTE_ROUTE_BY_KIND, kind)
    assert.ok(allowed || routed, 'kind ' + kind + ' 既不在 /execute 白名单、也没有专用路由指路 ⇒ 成了没人管的缝')
  }
})
