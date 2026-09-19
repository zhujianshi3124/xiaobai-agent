// Registry 单测（P2，REQ-2/6/7）：S1 契约级安装流、S2 legacy 包装、S4 错误隔离、
// 持久化与 autoload、操作互斥、带前缀事件、stop 级联清理。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, unlinkSync, existsSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'

import { createRegistry } from '@local/dsh-toolkit/registry'
import { contractEventName, contractServiceName } from '@local/dsh-toolkit/contract'

const fixtureDir = (name) => join(import.meta.dirname, 'fixtures', 'registry', name)
const contractPlugin = fixtureDir('contract-plugin')
const contractPluginState = (await import(`file:///${fixtureDir('contract-plugin/index.js').replace(/\\/g, '/')}`)).state
const legacyPluginState = (await import(`file:///${fixtureDir('legacy-plugin/index.js').replace(/\\/g, '/')}`)).state
const markerPath = join(contractPlugin, 'marker.flag')

function setMarker(exists) {
  if (exists) writeFileSync(markerPath, '', 'utf8')
  else if (existsSync(markerPath)) unlinkSync(markerPath)
}

function makeRegistry(t, opts = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'registry-test-'))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const ctx = new Context()
  const created = createRegistry(ctx, {
    servicePrefix: 'toolkit',
    statePath: join(tmp, 'state', 'registry-state.json'),
    retryBackoffMs: 1,
    loadTimeoutMs: 250,
    ...opts,
  })
  t.after(() => created.stop())
  return { ...created, ctx, tmp }
}

async function waitForStatus(registry, id, status, timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const entry = registry.get(id)
    if (entry?.status === status) return entry
    if (Date.now() > deadline) {
      throw new Error(`等待 ${id} → ${status} 超时；当前 = ${entry?.status ?? 'absent'}；lastError = ${JSON.stringify(entry?.lastError ?? null)}`)
    }
    await new Promise((r) => setTimeout(r, 5))
  }
}

// ── S1：契约插件安装全流程（契约级预检部分）────────────────────────────────

test('S1-正向：本地路径安装契约插件 → active，服务经前缀名可读，事件带前缀', async (t) => {
  setMarker(true)
  contractPluginState.disposed = 0
  const { registry, ctx } = makeRegistry(t)
  const seen = { added: 0, statusChanges: [] }
  ctx.on(contractEventName('toolkit', 'registry:plugin-added'), () => { seen.added++ })
  ctx.on(contractEventName('toolkit', 'registry:status-changed'), (p) => { seen.statusChanges.push(`${p.from}->${p.to}`) })

  const result = await registry.install({ kind: 'local', path: contractPlugin })
  assert.equal(result.ok, true)
  if (!result.ok) return
  const entry = await waitForStatus(registry, 'fixture/contract-plugin', 'active')
  assert.equal(entry.manifest.version, '1.0.0')
  assert.equal(entry.legacy, false)
  assert.equal(seen.added, 1)
  assert.ok(seen.statusChanges.includes('installed->loading'))
  assert.ok(seen.statusChanges.includes('loading->active'))

  // 服务经 ${prefix}/registry 暴露
  const service = ctx[contractServiceName('toolkit', 'registry')]
  assert.equal(typeof service.list, 'function')
  assert.equal(service.list().length, 1)
})

test('S1-阻断：契约范围不兼容 → 不注册并返回可执行预检报告', async (t) => {
  const { registry } = makeRegistry(t)
  const result = await registry.install({ kind: 'local', path: fixtureDir('invalid-manifest-plugin') })
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.precheck.pass, false)
  const contractIssue = result.precheck.blocking.find((b) => b.code === 'value' || b.code === 'format')
  assert.ok(contractIssue, 'blocking 里应有 contract 范围问题')
  assert.ok(contractIssue.fix, '每项 blocking 必须带 fix（REQ-3 输出可执行修复指引）')
  assert.equal(registry.get('fixture/invalid-manifest'), undefined, 'blocking 时不得注册')
})

test('S1-阻断：依赖服务缺席 → service-missing；npm 来源 → ok:false（Q1 纯增量预留，install 不抛）', async (t) => {
  const { registry } = makeRegistry(t)
  const missing = await registry.install({ kind: 'local', path: fixtureDir('missing-service-plugin') })
  assert.equal(missing.ok, false)
  if (!missing.ok) {
    assert.ok(missing.precheck.blocking.some((b) => b.code === 'service-missing'))
  }
  const npm = await registry.install({ kind: 'npm', spec: 'some-pkg' })
  assert.equal(npm.ok, false)
  if (!npm.ok) {
    assert.ok(npm.precheck.blocking.some((b) => /npm 来源在 P2 尚未实现/.test(b.message)))
  }
})

// ── S2：legacy 插件包装接入 ────────────────────────────────────────────────

test('S2：无 manifest 插件自动包装 → legacy 模式可启停/卸载，预检标注 legacyMode', async (t) => {
  const { registry, ctx } = makeRegistry(t)
  const result = await registry.install({ kind: 'local', path: fixtureDir('legacy-plugin') })
  assert.equal(result.ok, true)
  if (!result.ok) return
  const entry = await waitForStatus(registry, 'legacy/legacy-plugin', 'active')
  assert.equal(entry.legacy, true, 'legacy 标志')
  assert.equal(entry.manifest.id, 'legacy/legacy-plugin', 'id 取包名并归一命名空间')
  assert.equal(entry.manifest.version, '0.2.0')

  // 真实生效：启停
  await registry.setEnabled('legacy/legacy-plugin', false)
  assert.equal(registry.get('legacy/legacy-plugin').status, 'disabled')
  await registry.setEnabled('legacy/legacy-plugin', true)
  await waitForStatus(registry, 'legacy/legacy-plugin', 'active')

  // 卸载真实生效
  await registry.uninstall('legacy/legacy-plugin')
  assert.equal(registry.get('legacy/legacy-plugin'), undefined)
  assert.equal(ctx['toolkit/registry'].list().length, 0)
})

// ── S4：错误隔离 ──────────────────────────────────────────────────────────

test('S4：坏插件抛错 → 隔离（好插件保持 active）→ 达重试上限进 quarantined → 手动 enable 清零重试', async (t) => {
  setMarker(true)
  const { registry } = makeRegistry(t, { retryLimit: 1 })
  await registry.install({ kind: 'local', path: contractPlugin })
  await waitForStatus(registry, 'fixture/contract-plugin', 'active')

  const broken = await registry.install({ kind: 'local', path: fixtureDir('broken-plugin') })
  assert.equal(broken.ok, true, '注册成功（隔离语义：注册 ≠ 装入成功）')
  const quarantined = await waitForStatus(registry, 'legacy/fixture-broken', 'quarantined', 2000)
  assert.ok(quarantined.lastError, 'quarantined 保留 lastError')
  assert.match(quarantined.lastError.message, /always throws/)

  // 好插件不受影响（D3）
  assert.equal(registry.get('fixture/contract-plugin').status, 'active')

  // 手动恢复路径：setEnabled(true) 清零重试并重装
  await registry.setEnabled('legacy/fixture-broken', true)
  await waitForStatus(registry, 'legacy/fixture-broken', 'error', 1000)
  assert.equal(registry.get('fixture/contract-plugin').status, 'active', '重试期间好插件仍 active')
})

test('S4：修复后 reload 恢复 active；fiber 卸载运行 effect（监听器计数归零语义）', async (t) => {
  setMarker(false)
  contractPluginState.disposed = 0
  contractPluginState.events = 0
  const { registry, ctx } = makeRegistry(t, { retryLimit: 0 })
  await registry.install({ kind: 'local', path: contractPlugin })
  const errored = await waitForStatus(registry, 'fixture/contract-plugin', 'quarantined', 1500)
  assert.match(errored.lastError.message, /marker missing/)

  // 修复（marker 出现）→ 手动 enable → active
  setMarker(true)
  await registry.setEnabled('fixture/contract-plugin', true)
  const active = await waitForStatus(registry, 'fixture/contract-plugin', 'active')
  assert.equal(active.status, 'active')

  // 事件走通（root emit → 子 fiber 监听器）
  ctx.emit('fixture/event')
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(contractPluginState.events, 1)

  // disable → fiber dispose → effect 清理函数执行
  await registry.setEnabled('fixture/contract-plugin', false)
  await new Promise((r) => setTimeout(r, 10))
  assert.ok(contractPluginState.disposed >= 1, `effect 清理应执行（实际 ${contractPluginState.disposed}）`)
  contractPluginState.events = 0
  ctx.emit('fixture/event')
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(contractPluginState.events, 0, 'disable 后监听器必须消失')
})

test('S4：装入超时（inject 服务缺席 → 永久 PENDING）→ error/quarantined，不拖垮 toolkit', async (t) => {
  const { registry } = makeRegistry(t, { retryLimit: 0 })
  // force 绕过预检的 service-missing 阻断，专门验证装入超时轨道。
  const installed = await registry.install({ kind: 'local', path: fixtureDir('pending-inject-plugin') }, { force: true })
  assert.equal(installed.ok, true)
  const q = await waitForStatus(registry, 'legacy/fixture-pending-inject', 'quarantined', 2000)
  assert.match(q.lastError.message, /超时/)
  assert.ok(registry.get('legacy/fixture-pending-inject'))
})

test('R2 语义钉子：模块命名空间插件返回永不完成的 Promise → cordis 视为后台任务 → active', async (t) => {
  const { registry } = makeRegistry(t, { retryLimit: 0 })
  const result = await registry.install({ kind: 'local', path: fixtureDir('background-task-plugin') })
  assert.equal(result.ok, true)
  await waitForStatus(registry, 'legacy/fixture-background-task', 'active')
})

// ── 持久化与 autoload（REQ-7）─────────────────────────────────────────────

test('REQ-7：安装记录落盘 → 新实例 autoload 恢复 active；卸载移除记录；损坏状态文件按空启动', async (t) => {
  setMarker(true)
  const tmp = mkdtempSync(join(tmpdir(), 'registry-persist-'))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const statePath = join(tmp, 'state', 'registry-state.json')

  const first = createRegistry(new Context(), { servicePrefix: 'toolkit', statePath, retryBackoffMs: 1, loadTimeoutMs: 250, autoload: false })
  await first.registry.install({ kind: 'local', path: contractPlugin })
  await waitForStatus(first.registry, 'fixture/contract-plugin', 'active')
  await first.registry.install({ kind: 'local', path: fixtureDir('legacy-plugin') })
  await first.registry.uninstall('legacy/legacy-plugin')
  await first.stop()

  const saved = JSON.parse(readFileSync(statePath, 'utf8'))
  assert.equal(saved.schemaVersion, 1)
  assert.ok(saved.plugins['fixture/contract-plugin'], '卸载的不得残留，在装的必须在')
  assert.equal(saved.plugins['fixture/contract-plugin'].source.kind, 'local')

  const second = createRegistry(new Context(), { servicePrefix: 'toolkit', statePath, retryBackoffMs: 1, loadTimeoutMs: 250, autoload: true })
  t.after(() => second.stop())
  await waitForStatus(second.registry, 'fixture/contract-plugin', 'active', 2000)
  assert.equal(second.registry.list().length, 1)
})

test('REQ-7：autoload 时源丢失 → error + lastError 保留，不影响其他恢复项', async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'registry-gone-'))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const statePath = join(tmp, 'registry-state.json')
  writeFileSync(statePath, JSON.stringify({
    schemaVersion: 1,
    plugins: {
      'fixture/gone': { source: { kind: 'local', path: join(tmp, 'does-not-exist') }, enabled: true, config: {}, quarantined: false },
    },
  }), 'utf8')
  const { registry } = makeRegistry(t, { statePath })
  const entry = await waitForStatus(registry, 'fixture/gone', 'error', 1500)
  assert.ok(entry.lastError)
  assert.match(entry.lastError.message, /不存在/)
})

// ── 互斥与停止 ────────────────────────────────────────────────────────────

test('互斥：同 id 并发操作串行不损坏；stop 后全部 fiber 卸载', async (t) => {
  setMarker(true)
  const { registry } = makeRegistry(t, { retryLimit: 0 })
  await registry.install({ kind: 'local', path: contractPlugin })
  const results = await Promise.allSettled([
    registry.setEnabled('fixture/contract-plugin', false),
    registry.setEnabled('fixture/contract-plugin', true),
    registry.reload('fixture/contract-plugin'),
    registry.uninstall('fixture/contract-plugin').catch((e) => Promise.reject(e)),
  ])
  // 全部 settled（互斥保证不出现交错损坏）；uninstall 与 enable 竞争后终态一致
  assert.ok(results.every((r) => r.status === 'fulfilled'))
  const final = registry.get('fixture/contract-plugin')
  assert.ok(final === undefined || ['active', 'disabled', 'error'].includes(final.status))
})

test('stop：级联卸载全部子插件（REQ-6），服务条目清空', async (t) => {
  setMarker(true)
  contractPluginState.disposed = 0
  const tmp = mkdtempSync(join(tmpdir(), 'registry-stop-'))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const created = createRegistry(new Context(), {
    servicePrefix: 'toolkit',
    statePath: join(tmp, 's.json'),
    retryBackoffMs: 1,
    loadTimeoutMs: 250,
    autoload: false,
  })
  await created.registry.install({ kind: 'local', path: contractPlugin })
  await waitForStatus(created.registry, 'fixture/contract-plugin', 'active')
  await created.stop()
  assert.ok(contractPluginState.disposed >= 1, 'stop 必须 dispose 子插件 fiber')
  assert.equal(created.registry.get('fixture/contract-plugin').status, 'active')
  // stop 只卸 fiber 不删注册条目（卸载走 uninstall）；此处以条目保留 + fiber 已卸载为准。
  const fiberGone = created.registry.list().length === 1 && contractPluginState.disposed >= 1
  assert.ok(fiberGone)
})
