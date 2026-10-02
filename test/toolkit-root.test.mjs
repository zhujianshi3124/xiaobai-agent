// H1 · toolkitRoot 根治（债务 D-11 关账）
//
// 钉死四件事：
//  ① toolkitRoot 推导与**进程 cwd 完全无关**（修复前 registry-host 用 `resolve(process.cwd(),'..')`，
//     Pack G 实测落点在 `C:\Windows\.registry` 与 `D:\dsh-plugins\.registry` 之间漂移两次）；
//  ② 显式 config 优先级最高，空白值不算显式（回落模块位置推导）；
//  ③ 失效模式①「落点连目录都建不出来」：装配不许裸抛（修复前 audit sink 的无 try/catch
//     mkdirSync 会把整个面板炸掉），改为不 ok + 点名路径 + 可执行建议；
//  ④ 失效模式②「写得进内存、写不进磁盘」：不许静默——stateSaveStatus() 可查 +
//     发 `audit:state-save-failed` + 快照 durability 如实呈现 + 条目 persisted=false。
//
// 不用真 http+fetch（Node 24/Win 全量批跑命中 libuv 断言，见 docs/debt.md《环境注记》）：
// ⑤ 需要看 API 面时直接驱动 route handler + 受控 response 桩。
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'

import { moduleToolkitRoot, resolveToolkitRoot } from '../panel/manager/toolkit-root.mjs'
import { createToolkitServices } from '../panel/manager/registry-host.mjs'
import { createV2Api } from '../panel/manager/v2-api.mjs'
import { createRegistry } from 'xiaobai-agent/registry'
import { AUDIT_EVENTS } from 'xiaobai-agent/contract'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const FIXTURE = join(REPO_ROOT, 'test', 'fixtures', 'registry', 'save-probe-plugin')
const silent = { info: () => {}, warn: () => {}, error: () => {} }

/** 装配一次面板服务（真 cordis ctx，与 test/toolkit-services.test.mjs 同构）。 */
async function mount(t, config, logger = silent) {
  const ctx = new Context()
  let services = null
  const fiber = ctx.plugin({
    name: 'h1-root-probe',
    inject: [],
    apply(pluginCtx) {
      services = createToolkitServices(pluginCtx, config, logger)
    },
  })
  await fiber
  t.after(() => fiber.dispose())
  t.after(() => services.stop())
  return services
}

/** 造一个"父路径是普通文件"的位置：任何在其下建目录的操作必然失败（ENOTDIR/EPERM）。 */
function blockedDir(t) {
  const tmp = mkdtempSync(join(tmpdir(), 'h1-blocked-'))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const blocker = join(tmp, 'blocker')
  writeFileSync(blocker, 'x', 'utf8')
  return { tmp, blocked: (name) => join(blocker, name) }
}

test('① toolkitRoot 缺省与进程 cwd 无关（子进程换两个 cwd 实测同一结果）', (t) => {
  const script = `import(${JSON.stringify(pathToFileURL(join(REPO_ROOT, 'panel', 'manager', 'toolkit-root.mjs')).href)})
    .then((m) => process.stdout.write(m.resolveToolkitRoot({})))`
  const run = (cwd) => {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd, encoding: 'utf8' })
    assert.equal(r.status, 0, `子进程应正常退出（cwd=${cwd}）：${r.stderr}`)
    return r.stdout.trim()
  }
  const systemRoot = process.env.SystemRoot || 'C:\\Windows'
  const tmp = mkdtempSync(join(tmpdir(), 'h1-cwd-'))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))

  const fromSystem32 = run(join(systemRoot, 'System32'))
  const fromTmp = run(tmp)
  const fromRoot = run(REPO_ROOT)
  assert.equal(fromSystem32, REPO_ROOT, '从 System32 拉起宿主时，缺省根必须仍是仓根（修复前这里是 C:\\Windows）')
  assert.equal(fromTmp, REPO_ROOT)
  assert.equal(fromRoot, REPO_ROOT)
  assert.equal(moduleToolkitRoot(), REPO_ROOT, '同进程内的推导必须与子进程一致')
  // 非空洞性：旧公式 resolve(cwd,'..') 在这两个 cwd 下给出的正是 D-11 记录的两个漂移根。
  assert.equal(resolve(join(systemRoot, 'System32'), '..').toLowerCase(), systemRoot.toLowerCase())
  assert.notEqual(fromSystem32, resolve(join(systemRoot, 'System32'), '..'))
})

test('①b 真实装配路径：宿主从 System32 拉起时，statePath 仍锚在仓根（D-11 直接复现位）', () => {
  // 这一格测的是**装配现场**而非纯函数：修复前 `registry-host.mjs:24` 在这里给出
  // `C:\Windows\.registry\state.json`（Pack G 实测漂移点之一）。子进程跑，避免污染本进程 cwd。
  const cordisUrl = pathToFileURL(join(REPO_ROOT, 'node_modules', '@deepseek-ai', 'cordis', 'lib', 'index.js')).href
  const script = `
    import { Context } from ${JSON.stringify(cordisUrl)}
    import { createToolkitServices } from ${JSON.stringify(pathToFileURL(join(REPO_ROOT, 'panel', 'manager', 'registry-host.mjs')).href)}
    let out = null
    const ctx = new Context()
    const fiber = ctx.plugin({ name: 'h1-cwd-probe', inject: [], apply(c) {
      out = createToolkitServices(c, { servicePrefix: 'toolkit-h1-probe', registry: { autoload: false }, doctor: { watchInterval: 0 } },
        { info() {}, warn() {}, error() {} })
    } })
    await fiber
    console.log(JSON.stringify({ statePath: out.statePath, auditFile: out.auditFile, durability: out.durability() }))
    await out.stop()
    fiber.dispose()
  `
  const system32 = join(process.env.SystemRoot || 'C:\\Windows', 'System32')
  const existedBefore = existsSync(join(REPO_ROOT, '.registry'))
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: system32, encoding: 'utf8' })
  assert.equal(r.status, 0, `子进程装配应成功（修复前这里会因落点不可写而抛错）：${r.stderr}`)
  const seen = JSON.parse(r.stdout.trim().split('\n').pop())
  assert.equal(seen.statePath, resolve(join(REPO_ROOT, '.registry', 'state.json')),
    '缺省 statePath 必须锚在仓根，不能跟着启动器 cwd 走')
  assert.equal(seen.auditFile, resolve(join(REPO_ROOT, '.registry', 'audit.jsonl')))
  assert.equal(seen.durability.state.ok, true, '仓根可写 ⇒ 装配期自查应通过')
  // 子进程只会被 mkdir 出一个空目录（没有安装动作，不会写 state.json）：用后即清，不留在仓里。
  if (!existedBefore) rmSync(join(REPO_ROOT, '.registry'), { recursive: true, force: true })
})

test('② 显式 config.toolkitRoot 优先；空白值不算显式，回落模块位置推导', (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'h1-explicit-'))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  assert.equal(resolveToolkitRoot({ toolkitRoot: tmp }), resolve(tmp))
  assert.equal(resolveToolkitRoot({ toolkitRoot: '  ' }), REPO_ROOT, '只有空白的显式值不等于显式配置')
  assert.equal(resolveToolkitRoot({}), REPO_ROOT)
  assert.equal(resolveToolkitRoot(), REPO_ROOT, '连 config 都不给也不能抛')
  // 装配面也必须认这个显式值（面板传下去的就是已 resolve 的 toolkitRoot）。
  const services = createToolkitServices(new Context(), { servicePrefix: 'toolkit', toolkitRoot: tmp, registry: { autoload: false, statePath: join(tmp, 'state.json') }, doctor: { watchInterval: 0 } }, silent)
  assert.equal(services.statePath, resolve(join(tmp, 'state.json')))
  return services.stop()
})

test('③ 失效模式①：落点建不出来时装配不抛，降级为不 ok + 点名路径 + 可执行建议', async (t) => {
  const { tmp, blocked } = blockedDir(t)
  const warnings = []
  const badAudit = blocked('audit.jsonl')
  const services = await mount(t, {
    servicePrefix: 'toolkit',
    toolkitRoot: tmp,
    registry: { autoload: false, statePath: join(tmp, 'state.json'), auditFile: badAudit },
    doctor: { watchInterval: 0 },
  }, { ...silent, warn: (m) => warnings.push(String(m)) })

  const d = services.durability()
  assert.equal(d.state.ok, true, '状态落点本身可写，不应被审计面的失败牵连')
  assert.equal(d.audit.ok, false, '审计落点建不出来必须报不 ok（修复前：直接把面板 apply 炸掉）')
  assert.ok(d.audit.file.endsWith('audit.jsonl'), '必须点名是哪个文件')
  assert.ok(d.audit.error && d.audit.error.length > 0, '必须带失败原因')
  assert.ok(Array.isArray(d.audit.advice) && d.audit.advice.length >= 2, '必须给可执行建议（参照 doctor 口径），不许只抛原始 errno')
  assert.ok(d.audit.advice.some((s) => /auditFile|toolkitRoot/.test(s)), '建议要点名可配的字段')
  assert.ok(warnings.some((w) => w.includes('审计落点不可用') && w.includes(badAudit)), '装配现场要 warn 一次，且不裸抛')
  assert.equal(services.auditFile, null, '降级后不再对外宣称审计文件路径')
})

test('③b 失效模式①（状态面）：statePath 落点不可用时同样不抛、如实申报', async (t) => {
  const { blocked } = blockedDir(t)
  const warnings = []
  const badState = blocked('state.json')
  const services = await mount(t, {
    servicePrefix: 'toolkit',
    registry: { autoload: false, statePath: badState },
    doctor: { watchInterval: 0 },
    toolkitRoot: blocked('unused'),
  }, { ...silent, warn: (m) => warnings.push(String(m)) })

  const d = services.durability()
  assert.equal(d.state.ok, false)
  assert.equal(d.state.path, badState)
  assert.ok(d.state.error, '要带失败原因')
  assert.ok(d.state.advice.length >= 2, '要带可执行建议')
  assert.ok(warnings.some((w) => w.includes('状态落点不可用') && w.includes(badState)))
})

test('④ 失效模式②：内存生效但写盘失败时不静默（审计事件 + 可查状态）', async (t) => {
  const { blocked } = blockedDir(t)
  const statePath = blocked('state.json')
  const ctx = new Context()
  const errors = []
  const auditEvents = []
  const { registry } = createRegistry(ctx, {
    servicePrefix: 'toolkit',
    statePath,
    autoload: false,
    retryBackoffMs: 1,
    loadTimeoutMs: 1000,
    logger: { ...silent, error: (m, meta) => errors.push({ m: String(m), meta }) },
  })
  t.after(() => registry.stop())
  ctx.on('toolkit/audit:state-save-failed', (payload) => auditEvents.push(payload))

  const result = await registry.install({ kind: 'local', path: FIXTURE })
  assert.equal(result.ok, true, '写盘失败不改变本次装入结果（不引入重试、不假装失败）')
  assert.equal(result.entry.status, 'active')

  const status = registry.stateSaveStatus()
  assert.equal(status.ok, false, '但必须留下"未落盘"的可查事实（修复前只有一行 console 日志）')
  assert.equal(status.path, statePath, '点名是哪个文件没落')
  assert.ok(status.error, '带失败原因')
  assert.ok(status.advice.some((s) => /重启后不会自动恢复|statePath|toolkitRoot/.test(s)), '建议要指到下一步')
  assert.ok(errors.some((e) => e.m.includes('状态落盘失败') && e.meta.statePath === statePath), '日志要带路径')
  assert.ok(auditEvents.length >= 1, '必须发审计事件（面板 toast / SSE 据此可见）')
  assert.equal(auditEvents[0].errorCode, 'state-save-failed')
  assert.equal(auditEvents[0].pluginId, 'fixture/save-probe-plugin')
})

test('⑥ 事件名孪生表一致：服务端 SSE 清单 == 面板客户端 V2_EVENT_NAMES（新增审计事件必同步）', () => {
  // H1 新增了 `audit:state-save-failed`。服务端清单由 AUDIT_EVENTS 派生，客户端那份是
  // 手写字面量（ModuleLoader 环境无法 import ESM 的孪生实现）——两边漏一处，事件就静默收不到。
  const clientSrc = readFileSync(join(REPO_ROOT, 'panel', 'client', 'index.js'), 'utf8')
  const m = /var V2_EVENT_NAMES = \[([\s\S]*?)\];/.exec(clientSrc)
  assert.ok(m, '客户端必须仍能找到 V2_EVENT_NAMES 孪生表（改名/改结构请连带更新本用例）')
  const clientNames = (m[1].match(/"([^"]+)"/g) ?? []).map((s) => s.slice(1, -1))
  const serverNames = [
    'plugin-added', 'plugin-removed', 'status-changed', 'health-changed', 'issue-found',
    ...AUDIT_EVENTS.map((a) => `audit:${a}`),
  ]
  assert.deepEqual([...clientNames].sort(), [...serverNames].sort(),
    '两份清单必须逐名一致（缺：' + serverNames.filter((n) => !clientNames.includes(n)).join(',') + '）')
  assert.ok(clientNames.includes('audit:state-save-failed'), 'H1 的未落盘事件必须能被客户端订阅到')
})

test('⑤ 面板面：/v2/snapshot 带出 durability，未落盘的条目 persisted=false（不得谎报）', async (t) => {
  const { blocked } = blockedDir(t)
  const statePath = blocked('state.json')
  const ctx = new Context()
  const { registry } = createRegistry(ctx, {
    servicePrefix: 'toolkit',
    statePath,
    autoload: false,
    loadTimeoutMs: 1000,
    logger: silent,
  })
  t.after(() => registry.stop())
  const services = { registry, durability: () => ({ state: registry.stateSaveStatus(), audit: { ok: true, file: 'x' } }) }
  const v2 = createV2Api({
    registry,
    doctor: undefined,
    servicePrefix: 'toolkit',
    subscribe: () => () => {},
    durability: services.durability,
  })
  await registry.install({ kind: 'local', path: FIXTURE })

  const route = v2.routes.find((r) => r.path.endsWith('/snapshot'))
  const chunks = []
  const response = {
    statusCode: 0,
    writeHead(code) { this.statusCode = code },
    write(c) { chunks.push(String(c)) },
    end(c) { if (c !== undefined) chunks.push(String(c)) },
    on() {},
    once() {},
    destroy() {},
  }
  await route.handler({ url: '/api/toolkit-panel/v2/snapshot', method: 'GET', headers: {}, socket: { remoteAddress: '127.0.0.1' } }, response)
  assert.equal(response.statusCode, 200)
  const data = JSON.parse(chunks.join(''))
  assert.equal(data.ok, true)
  assert.equal(data.durability.state.ok, false, '快照必须带出未落盘事实')
  assert.ok(data.durability.state.path.endsWith('state.json'))
  assert.equal(data.plugins.length, 1)
  assert.equal(data.plugins[0].status, 'active')
  assert.equal(data.plugins[0].persisted, false, '条目卡片据此标注"未落盘（重启会丢）"，不能只报 active')
})
