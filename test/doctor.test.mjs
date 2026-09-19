// Doctor 单测（P3，REQ-3/4）：合成规则、precheck 全量、S3 故障注入（依赖服务
// 下线 → 阈值内降级 + doctor:issue-found → 恢复回 healthy）、环形历史、
// 规则超时、healthCheck 异常计入。
import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'

import { createRegistry } from '@local/dsh-toolkit/registry'
import { createDoctor } from '@local/dsh-toolkit/doctor'
import { contractEventName } from '@local/dsh-toolkit/contract'

const fixtureDir = (name) => join(import.meta.dirname, 'fixtures', 'registry', name)
const ENV_KEY = 'FIXTURE_REQUIRED_VAR'

function fakeProbes(overrides = {}) {
  return {
    nodeVersion: () => '24.19.0',
    dshVersion: () => '0.1.5-rc.1',
    hasEnv: (key) => key === ENV_KEY,
    hasBinary: (name) => name === 'node',
    portFree: async () => true,
    fsAccessible: async () => true,
    apiReachable: async () => true,
    hasService: () => false,
    ...overrides,
  }
}

function tmpdirFor(t) {
  const dir = mkdtempSync(join(tmpdir(), 'doctor-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

function makeStack(t, { probes = fakeProbes(), doctorOpts = {}, registryOpts = {} } = {}) {
  const ctx = new Context()
  const created = createRegistry(ctx, {
    servicePrefix: 'toolkit',
    statePath: join(tmpdirFor(t), 'state.json'),
    retryBackoffMs: 1,
    loadTimeoutMs: 250,
    autoload: false,
    ...registryOpts,
  })
  const doc = createDoctor(ctx, {
    servicePrefix: 'toolkit',
    watchInterval: 0,
    ...doctorOpts,
    probes,
  }, created.registry)
  return { ctx, registry: created.registry, doctor: doc.doctor, stopAll: async () => { await created.stop(); doc.stop() } }
}

// ── 合成规则（manifest.requires → 规则）──────────────────────────────────

test('合成规则：envVars 必填缺失=error / 可选缺失=warn（只报存在性，不出现值）', async (t) => {
  const { doctor, stopAll } = makeStack(t, {
    probes: fakeProbes({ hasEnv: (key) => key !== ENV_KEY && key !== 'FIXTURE_OPT_VAR' }),
  })
  const manifest = {
    id: 'fixture/x', displayName: 'X', version: '1.0.0', contract: '^1.0',
    requires: { envVars: [
      { key: ENV_KEY, required: true, describe: '必需变量' },
      { key: 'FIXTURE_OPT_VAR', required: false },
    ] },
  }
  const accessor = { list: () => [{ manifest, status: 'active', config: {}, legacy: false }], get: () => ({ manifest, status: 'active', config: {}, legacy: false }) }
  doctor.attachRegistry(accessor)
  const inspection = await doctor.inspect('fixture/x')
  const items = inspection.reports[0].items
  const requiredMiss = items.find((i) => i.code === 'env.var-missing' && i.message.includes(ENV_KEY))
  const optionalMiss = items.find((i) => i.code === 'env.var-missing' && i.message.includes('FIXTURE_OPT_VAR'))
  assert.ok(requiredMiss && requiredMiss.level === 'error', '必填缺失 = error')
  assert.ok(requiredMiss.fix, '带 fix 指引')
  assert.ok(optionalMiss && optionalMiss.level === 'warn', '可选缺失 = warn')
  assert.ok(!JSON.stringify(items).includes('secret-value'), '不出现环境变量的值')
  await stopAll()
})

test('合成规则：端口占用（shared 仅提示不阻断）与 fsPaths/二进制/运行时范围', async (t) => {
  const blocker = net.createServer()
  await new Promise((resolve) => blocker.listen(0, '127.0.0.1', resolve))
  const port = blocker.address().port
  t.after(() => blocker.close())

  const { doctor, stopAll } = makeStack(t, {
    probes: fakeProbes({
      fsAccessible: async () => false,
      hasBinary: (name) => name !== 'missing-bin',
      dshVersion: () => '9.9.9',
      portFree: async (p) => p !== port && p !== port + 1,
    }),
  })
  const manifest = {
    id: 'fixture/y', displayName: 'Y', version: '1.0.0', contract: '^1.0',
    requires: {
      dshRuntime: '>=0.1.2-rc.1 <0.2.0',
      binaries: [{ name: 'missing-bin' }],
      ports: [
        { port, protocol: 'tcp' },
        { port: port + 1, protocol: 'tcp', shared: true },
      ],
      fsPaths: [{ path: '~/.dsh', access: 'rw' }],
    },
  }
  const accessor = { list: () => [{ manifest, status: 'active', config: {}, legacy: false }], get: () => ({ manifest, status: 'active', config: {}, legacy: false }) }
  doctor.attachRegistry(accessor)
  const inspection = await doctor.inspect('fixture/y')
  const items = inspection.reports[0].items
  assert.ok(items.some((i) => i.code === 'env.dsh-version-mismatch' && i.level === 'error'))
  assert.ok(items.some((i) => i.code === 'env.binary-missing' && i.level === 'error'))
  const occupied = items.filter((i) => i.code === 'port-occupied')
  assert.equal(occupied.length, 2, '两个端口都被记录')
  assert.ok(occupied.some((i) => i.level === 'error'), '未声明 shared 的占用 = error')
  assert.ok(occupied.some((i) => i.level === 'warn'), 'shared 占用 = warn')
  assert.ok(items.some((i) => i.code === 'fs.inaccessible' && i.level === 'error'))
  await stopAll()
})

// ── precheck（REQ-3 全量：S1 的"缺 env → 阻断并给出精确修复清单"）─────────

test('S1-完整分支：缺 env → doctor.precheck 阻断 → 补齐 → 安装成功 → active', async (t) => {
  delete process.env[ENV_KEY]
  t.after(() => { delete process.env[ENV_KEY] })
  const { registry, doctor, stopAll } = makeStack(t, {
    probes: fakeProbes({ hasEnv: (key) => Boolean(process.env[key]) }),
    registryOpts: { precheck: (source) => doctor.precheck(source) },
  })
  const blocked = await registry.install({ kind: 'local', path: fixtureDir('env-plugin') })
  assert.equal(blocked.ok, false)
  if (!blocked.ok) {
    const envIssue = blocked.precheck.blocking.find((b) => b.code === 'env.var-missing')
    assert.ok(envIssue, '阻断项 = env.var-missing')
    assert.ok(envIssue.fix?.summary, '含可执行修复指引')
    assert.match(envIssue.message, /FIXTURE_REQUIRED_VAR/)
  }
  assert.equal(registry.get('fixture/env-plugin'), undefined, '阻断时不注册')

  process.env[ENV_KEY] = '1'
  const ok = await registry.install({ kind: 'local', path: fixtureDir('env-plugin') })
  assert.equal(ok.ok, true)
  assert.equal(registry.get('fixture/env-plugin').status, 'active')
  await stopAll()
})

test('precheck：legacy 插件 → legacyMode + 检查受限提示；manifest 非法 → 精确字段路径', async (t) => {
  const { doctor, stopAll } = makeStack(t, {})
  const legacy = await doctor.precheck({ kind: 'local', path: fixtureDir('legacy-plugin') })
  assert.equal(legacy.legacyMode, true)
  assert.ok(legacy.warnings.some((w) => w.code === 'legacy-mode'))
  assert.ok(legacy.changes.some((c) => c.target === 'manifest'))

  const bad = await doctor.precheck({ kind: 'local', path: fixtureDir('invalid-manifest-plugin') })
  assert.equal(bad.pass, false)
  assert.ok(bad.blocking.some((b) => b.message.includes('contract')), '阻断消息含字段路径 contract')
  await stopAll()
})

// ── S3：运行时故障注入 → 降级 + issue-found → 恢复 ────────────────────────

test('S3：依赖服务下线 → 阈值内降级并 issue-found → 恢复回 healthy（面板事件全程可观测）', async (t) => {
  const { ctx, registry, doctor, stopAll } = makeStack(t, { doctorOpts: { failureThreshold: 2 } })
  doctor.attachRegistry(registry)

  const events = { issue: [], health: [] }
  ctx.on(contractEventName('toolkit', 'doctor:issue-found'), (p) => events.issue.push(p))
  ctx.on(contractEventName('toolkit', 'registry:health-changed'), (p) => events.health.push(p))

  await registry.install({ kind: 'local', path: fixtureDir('provider-plugin') })
  const consumer = await registry.install({ kind: 'local', path: fixtureDir('consumer-plugin') })
  assert.equal(consumer.ok, true, '服务在场时预检通过并装入')

  await doctor.inspect()
  // 首次巡检：每个条目发布一次 healthy（面板初绘需要）——provider + consumer
  assert.equal(events.health.length, 2)
  assert.ok(events.health.every((p) => p.report.status === 'healthy'))

  // 故障注入：provider 下线 → consumer 依赖缺失
  await registry.setEnabled('legacy/fixture-provider', false)
  await doctor.inspect() // 第 1 次失败（阈值内：不发布）
  assert.equal(events.issue.length, 0)
  await doctor.inspect() // 第 2 次失败（达阈值：发布）
  assert.ok(events.issue.some((p) => p.id === 'fixture/consumer' && p.item.code === 'service-missing'), 'issue-found 已发')
  assert.ok(events.health.some((p) => p.id === 'fixture/consumer' && p.report.status === 'unhealthy'))

  // 恢复：provider 回来 → 下一次巡检 healthy 自动回调
  await registry.setEnabled('legacy/fixture-provider', true)
  await doctor.inspect()
  assert.ok(events.health.some((p) => p.id === 'fixture/consumer' && p.report.status === 'healthy'), '恢复自动回调 healthy')
  await stopAll()
})

test('S3-周期巡检：watchInterval 小间隔生效（阈值 1 → issue-found 自动发出）', async (t) => {
  const { ctx, registry, doctor, stopAll } = makeStack(t, {
    doctorOpts: { watchInterval: 20, failureThreshold: 1 },
  })
  doctor.attachRegistry(registry)
  doctor.startWatch()

  const issues = []
  ctx.on(contractEventName('toolkit', 'doctor:issue-found'), (p) => issues.push(p))
  await registry.install({ kind: 'local', path: fixtureDir('provider-plugin') })
  await registry.install({ kind: 'local', path: fixtureDir('consumer-plugin') })
  await registry.setEnabled('legacy/fixture-provider', false)
  const deadline = Date.now() + 2000
  while (!issues.some((p) => p.id === 'fixture/consumer') && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 20))
  }
  doctor.stopWatch()
  assert.ok(issues.some((p) => p.id === 'fixture/consumer'), '周期巡检在阈值(1)后发 issue-found')
  await stopAll()
})

// ── 环形历史 / 规则超时 / healthCheck 计入 ────────────────────────────────

test('环形历史：historySize=3 保留最近 3 份', async (t) => {
  const { registry, doctor, stopAll } = makeStack(t, { doctorOpts: { historySize: 3 } })
  doctor.attachRegistry(registry)
  await registry.install({ kind: 'local', path: fixtureDir('provider-plugin') })
  await registry.install({ kind: 'local', path: fixtureDir('consumer-plugin') })
  for (let i = 0; i < 5; i++) await doctor.inspect()
  assert.equal(doctor.history('fixture/consumer').length, 3)
  await stopAll()
})

test('规则超时与第三方规则：registerRule 生效；永不返回的规则按 rule-error 计入', async (t) => {
  const { registry, doctor, stopAll } = makeStack(t, { doctorOpts: { ruleTimeoutMs: 40 } })
  doctor.attachRegistry(registry)
  doctor.registerRule({
    id: 'third-party/always-fails',
    check: () => new Promise(() => {}),
  })
  doctor.registerRule({
    id: 'third-party/ok',
    check: async () => [{ code: 'tp.ok', level: 'ok', message: 'all good' }],
  })
  await registry.install({ kind: 'local', path: fixtureDir('provider-plugin') })
  await registry.install({ kind: 'local', path: fixtureDir('consumer-plugin') })
  const inspection = await doctor.inspect('fixture/consumer')
  const items = inspection.reports[0].items
  assert.ok(items.some((i) => i.code === 'rule-error' && i.message.includes('third-party/always-fails')), '超时规则 → rule-error')
  assert.ok(items.some((i) => i.code === 'tp.ok'), '第三方 ok 规则输出保留')
  await stopAll()
})

test('healthCheck：异常计入（healthcheck-failed）；恢复后 healthy', async (t) => {
  let shouldThrow = true
  const { registry, doctor, stopAll } = makeStack(t, { doctorOpts: { failureThreshold: 1 } })
  doctor.attachRegistry(registry)
  await registry.install({ kind: 'local', path: fixtureDir('provider-plugin') })
  await registry.install({ kind: 'local', path: fixtureDir('consumer-plugin') })

  // 用带 healthCheck 的条目视图替换 registry 访问器（manifest.healthCheck 是函数，落不了盘）
  const real = registry.get('fixture/consumer')
  const withHealth = {
    ...real,
    manifest: {
      ...real.manifest,
      healthCheck: async () => {
        if (shouldThrow) throw new Error('boom from healthCheck')
        return []
      },
    },
  }
  doctor.attachRegistry({ list: () => [withHealth], get: () => withHealth })

  const failing = await doctor.inspect('fixture/consumer')
  assert.ok(failing.reports[0].items.some((i) => i.code === 'healthcheck-failed'), 'healthCheck 异常 → healthcheck-failed')
  shouldThrow = false
  const ok = await doctor.inspect('fixture/consumer')
  assert.equal(ok.reports[0].status, 'healthy')
  await stopAll()
})
