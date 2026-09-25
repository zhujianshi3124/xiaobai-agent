// W11-b · 通用 /plan 的写目标收紧（落差条目 F-19："target != patch 时可指任意本地文件"）
//
// 修复前：`const file = target === "patch" ? <仓内 patch> : String(body.file || "")`
// ⇒ 客户端传什么路径就往哪签写方案，唯一护栏是"该文件里得有唯一 `- id:` 锚"+ loopback/配对/
// CSRF/64KiB。文档与注释全篇按"改 cordis.patch.yml"叙述，从未披露可指任意文件。
// 修复后：本路由**只接受 patch 目标**，且整个 `body.file` 通道关闭（不再读它）。
// 全仓对账（C1-006 批复）：两套界面与全部 scripts/test 里没有任何调用方使用非 patch 目标；
// 保管区与预设面走各自的 plan/execute 路由，不经本通道 ⇒ 收紧零功能损失。
//
// 手法与隔壁 panel-execute-kind 一致：直驱真实 route.handler（真 guard / 真 createPlan），
// 全部落 os.tmpdir 的假 toolkitRoot，真仓与 ~/.dsh 零触碰。
import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const panelMod = await import(pathToFileURL(join(root, 'panel', 'index.js')).href)

const PATCH_TEXT = [
  '- insert:',
  "    - id: probe-row",
  "      name: '@probe/nothing'",
  '      config:',
  '        disabled: false',
  '',
].join('\n')

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function makeApi(t) {
  const kitRoot = mkdtempSync(join(tmpdir(), 'w11b-plan-'))
  t.after(() => rmSync(kitRoot, { recursive: true, force: true }))
  const patchFile = join(kitRoot, 'cordis.patch.yml')
  writeFileSync(patchFile, PATCH_TEXT, 'utf8')
  const routes = []
  panelMod.apply({
    effect: (cb) => { cb(); return () => {} },
    get: () => undefined,
    webServer: { register: (route) => { routes.push(route); return () => {} } },
  }, {
    toolkitRoot: kitRoot,
    backupRoot: join(kitRoot, '.panel-write-backups'),
    doctorCli: join(kitRoot, 'no-such-doctor.mjs'),
    doctorConfigRoot: join(kitRoot, 'doctor-config'),
    devicesFile: join(kitRoot, 'no-such-devices.json'),
  })

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

  async function call(path, body) {
    const route = routes.find((r) => r.path === '/api/toolkit-panel' + path)
    assert.ok(route, '路由未注册: ' + path)
    const res = { statusCode: 0, raw: '' }
    res.writeHead = (code) => { res.statusCode = code }
    res.end = (payload) => { res.raw = payload === undefined ? '' : String(payload) }
    await route.handler(makeRequest('POST', body), res)
    let json = null
    try { json = JSON.parse(res.raw) } catch { json = null }
    return { status: res.statusCode || 500, json }
  }

  return { kitRoot, patchFile, call }
}

test('W11-b · target=patch 正常签发，且 /execute 端到端仍写得动（收紧没把正路打死）', async (t) => {
  const api = makeApi(t)
  const planned = await api.call('/plan', { target: 'patch', rowId: 'probe-row', key: 'disabled', value: 'true' })
  assert.equal(planned.status, 200, JSON.stringify(planned.json))
  assert.equal(planned.json.ok, true)
  assert.equal(planned.json.plan.file, api.patchFile, '目标必须钉死在仓内 patch 文件')
  const executed = await api.call('/execute', { token: planned.json.plan.token })
  assert.equal(executed.status, 200, JSON.stringify(executed.json))
  assert.match(readFileSync(api.patchFile, 'utf8'), /disabled: true/)
})

test('W11-b · 不带 target ⇒ 仍按 patch（既有缺省语义不变）', async (t) => {
  const api = makeApi(t)
  const planned = await api.call('/plan', { rowId: 'probe-row', key: 'disabled', value: 'true' })
  assert.equal(planned.status, 200, JSON.stringify(planned.json))
  assert.equal(planned.json.plan.file, api.patchFile)
})

test('W11-b · 越界目标 ⇒ 400 plan-target-unsupported，且诱饵文件零写入', async (t) => {
  const api = makeApi(t)
  const decoy = join(api.kitRoot, 'decoy.yml')
  writeFileSync(decoy, '- id: probe-row\n  config:\n    disabled: false\n', 'utf8')
  const before = sha256(decoy)
  const patchBefore = sha256(api.patchFile)
  for (const target of ['file', 'custody', 'preset', 'absolute']) {
    const res = await api.call('/plan', { target, file: decoy, rowId: 'probe-row', key: 'disabled', value: 'true' })
    assert.equal(res.status, 400, 'target=' + target + ' 实得 ' + JSON.stringify(res.json))
    assert.equal(res.json.code, 'plan-target-unsupported', 'target=' + target + ' 实得 ' + JSON.stringify(res.json))
    assert.match(res.json.error, /只接受 target="patch"/, '文案要点名唯一合法目标')
  }
  assert.equal(sha256(decoy), before, '被点名的文件必须一字节未动')
  assert.equal(sha256(api.patchFile), patchBefore, '拒绝路径也不得顺手动 patch 文件')
})

test('W11-b · 反向钉：target=patch 时塞 body.file 也无效（整条通道关闭，不是"越界才拦"）', async (t) => {
  const api = makeApi(t)
  const decoy = join(api.kitRoot, 'decoy2.yml')
  writeFileSync(decoy, '- id: probe-row\n  config:\n    disabled: false\n', 'utf8')
  const before = sha256(decoy)
  const planned = await api.call('/plan', { target: 'patch', file: decoy, rowId: 'probe-row', key: 'disabled', value: 'true' })
  assert.equal(planned.status, 200, JSON.stringify(planned.json))
  assert.equal(planned.json.plan.file, api.patchFile, '签出的目标必须仍是 patch 文件，不能是被塞进来的那个')
  assert.equal(sha256(decoy), before, '诱饵文件全程未被当作写目标')
})

test('W11-b · 防回潮静态钉：panel/index.js 里不再出现 body.file', () => {
  const source = readFileSync(join(root, 'panel', 'index.js'), 'utf8')
  assert.equal(source.includes('body.file'), false,
    '通用 /plan 一旦重新读 body.file，就是把这扇越权写门重新打开')
})
