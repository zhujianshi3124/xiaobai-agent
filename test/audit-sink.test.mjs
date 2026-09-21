// 审计持久化（REQ-10 / 债务 #4）测试：走 createToolkitServices 真装配（面板用的就是它），
// 断言 audit.jsonl 的行形状、白名单字段（绝不落配置内容）、卸出后不再追加、多实例各写各的文件。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'

import { createToolkitServices } from '../panel/manager/registry-host.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const fixturePlugin = join(ROOT, 'test', 'fixtures', 'registry', 'contract-plugin')
// D-10：本夹具靠一枚 marker 决定"装得起来"。过去路径定死在仓内，既会被并行跑的其它
// 测试文件翻来覆去，也让本文件在**干净克隆**（marker 是 gitignore 的运行产物）下直接失红。
// 现在自带一份：指到 pid 专属路径并写出来，退出即清。
const markerPath = join(tmpdir(), `dsh-fixture-marker-${process.pid}-audit-sink`)
process.env.FIXTURE_MARKER = markerPath
writeFileSync(markerPath, '', 'utf8')
process.on('exit', () => { try { rmSync(markerPath, { force: true }) } catch { /* 已清 */ } })

function stack(t, prefix = 'toolkit') {
  const tmp = mkdtempSync(join(tmpdir(), `audit-${prefix}-`))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const ctx = new Context()
  const services = createToolkitServices(ctx, {
    servicePrefix: prefix,
    toolkitRoot: ROOT,
    registry: { autoload: false, statePath: join(tmp, 'state.json') },
    doctor: { watchInterval: 0 },
  }, { info() {}, warn() {}, error() {} })
  t.after(() => { void services.stop() })
  return { services, file: services.auditFile }
}

const lines = (file) => readFileSync(file, 'utf8').trim().split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l))

test('装入插件即落审计行（event/pluginId/durationMs/at 齐备）', async (t) => {
  const { services, file } = stack(t)
  assert.ok(file, 'createToolkitServices 必须报出审计文件路径')
  const result = await services.registry.install({ kind: 'local', path: fixturePlugin })
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.ok(existsSync(file), 'audit.jsonl 未生成')
  const rows = lines(file)
  const installed = rows.find((r) => r.event === 'installed')
  assert.ok(installed, `未记到 installed：${JSON.stringify(rows)}`)
  assert.equal(installed.pluginId, 'fixture/contract-plugin')
  assert.equal(typeof installed.durationMs, 'number')
  assert.equal(typeof installed.at, 'number')
})

test('审计面是白名单字段：配置内容绝不落盘（REQ-10 禁泄口径）', async (t) => {
  const { services, file } = stack(t)
  await services.registry.install({ kind: 'local', path: fixturePlugin })
  await services.registry.setConfig('fixture/contract-plugin', { token: 'SECRET-DO-NOT-LOG', retries: 3 })
  await services.registry.setEnabled('fixture/contract-plugin', false)
  const raw = readFileSync(file, 'utf8')
  assert.equal(raw.includes('SECRET-DO-NOT-LOG'), false, '配置值泄进审计文件')
  assert.equal(raw.includes('"config"'), false, '审计行不应携带配置对象')
  assert.ok(raw.includes('config-changed'), 'config-changed 事件本身要记到')
  assert.ok(raw.includes('"enabled"') || raw.includes('disabled'), '启停事件要记到')
  // 每行只允许白名单键
  for (const row of lines(file)) {
    assert.deepEqual(
      Object.keys(row).sort(),
      ['at', 'durationMs', 'event', 'pluginId'].sort(),
      `审计行出现额外键：${JSON.stringify(row)}`,
    )
  }
})

test('stop() 之后不再追加（订阅随级联清理解除）', async (t) => {
  const { services, file } = stack(t)
  await services.registry.install({ kind: 'local', path: fixturePlugin })
  const before = lines(file).length
  await services.stop()
  await services.registry.setEnabled('fixture/contract-plugin', false).catch(() => {})
  assert.equal(lines(file).length, before, '卸出后仍在写审计')
})

test('双实例各写自己的审计文件（前缀命名空间，互不串扰）', async (t) => {
  const a = stack(t, 'toolkit')
  const b = stack(t, 'tk2')
  await a.services.registry.install({ kind: 'local', path: fixturePlugin })
  assert.equal(lines(a.file).some((r) => r.event === 'installed'), true)
  assert.equal(existsSync(b.file), false, 'B 实例不该因为 A 的事件产生审计文件')
})
