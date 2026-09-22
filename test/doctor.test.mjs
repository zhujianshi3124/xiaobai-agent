// Doctor 单测（P3，REQ-3/4）：合成规则、precheck 全量、S3 故障注入（依赖服务
// 下线 → 阈值内降级 + doctor:issue-found → 恢复回 healthy）、环形历史、
// 规则超时、healthCheck 异常计入。
import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
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

// ── P5 债务 #1/#2/#3：binary minVersion 真探测 / configSchema 真校验 / 注册冲突 ──

test('P5-#1：binary minVersion 真探测——版本低于下限=error、达标=无发现、取不到版本=warn', async (t) => {
  const base = { ...fakeProbes(), hasBinary: () => true }
  const manifestOf = (version) => ({
    id: 'fixture/bin', displayName: 'B', version: '1.0.0', contract: '^1.0',
    requires: { binaries: [{ name: 'tool.exe', minVersion: version }] },
  })

  // 低于下限 → error
  const low = makeStack(t, { probes: { ...base, binaryVersion: async () => '1.2.3' } })
  low.doctor.attachRegistry({ list: () => [], get: () => undefined })
  const lowManifest = manifestOf('1.3.0')
  low.doctor.attachRegistry({
    list: () => [{ manifest: lowManifest, status: 'active', config: {}, legacy: false }],
    get: () => ({ manifest: lowManifest, status: 'active', config: {}, legacy: false }),
  })
  const lowReport = await low.doctor.inspect('fixture/bin')
  const lowItem = lowReport.reports[0].items.find((i) => i.code === 'env.binary-version-mismatch')
  assert.ok(lowItem && lowItem.level === 'error', '低于下限 = error')
  assert.match(lowItem.message, /1\.2\.3/)
  await low.stopAll()

  // 达标 → 无发现
  const ok = makeStack(t, { probes: { ...base, binaryVersion: async () => '1.3.0' } })
  ok.doctor.attachRegistry({ list: () => [], get: () => undefined })
  const okManifest = manifestOf('1.3.0')
  ok.doctor.attachRegistry({
    list: () => [{ manifest: okManifest, status: 'active', config: {}, legacy: false }],
    get: () => ({ manifest: okManifest, status: 'active', config: {}, legacy: false }),
  })
  const okReport = await ok.doctor.inspect('fixture/bin')
  assert.ok(!okReport.reports[0].items.some((i) => i.code === 'env.binary-version-mismatch'), '达标无发现')
  await ok.stopAll()

  // 取不到版本 → warn（不阻断）
  const unknown = makeStack(t, { probes: { ...base, binaryVersion: async () => null } })
  unknown.doctor.attachRegistry({ list: () => [], get: () => undefined })
  const unknownManifest = manifestOf('1.0.0')
  unknown.doctor.attachRegistry({
    list: () => [{ manifest: unknownManifest, status: 'active', config: {}, legacy: false }],
    get: () => ({ manifest: unknownManifest, status: 'active', config: {}, legacy: false }),
  })
  const unknownReport = await unknown.doctor.inspect('fixture/bin')
  assert.ok(unknownReport.reports[0].items.some((i) => i.code === 'env.binary-version-unknown' && i.level === 'warn'))
  await unknown.stopAll()
})

test('P5-#2：configSchema 真校验——必填缺失 → 安装阻断并列出缺失项', async (t) => {
  const { registry, doctor, stopAll } = makeStack(t, {
    registryOpts: { precheck: (source) => doctor.precheck(source) },
  })
  const blocked = await registry.install({ kind: 'local', path: fixtureDir('schema-plugin') })
  assert.equal(blocked.ok, false)
  if (!blocked.ok) {
    const issue = blocked.precheck.blocking.find((b) => b.code === 'config-schema-invalid')
    assert.ok(issue, '存在 config-schema-invalid 阻断项')
    assert.match(issue.message, /region|必填|校验/, '指出缺失/校验细节')
  }
  assert.equal(registry.get('dsh/schema-plugin'), undefined, '阻断不注册')
  await stopAll()
})

test('批 2-②：对偶——两插件共同依赖同一服务（只写 requires.services）不得判撞名（P0-2 假阳性回归钉）', async (t) => {
  // 依赖名取容器里**真实存在**的 `toolkit/registry`（createRegistry 注册的服务）：
  // 这样 service-missing（error）不会因别的原因阻断，用例只测"共同依赖会不会被判冲突"这一件事。
  // 借用未断时（把 doctor.ts 的 ownServices/otherServices 改回 requires.services）本用例必红。
  const { registry, doctor, stopAll } = makeStack(t, {
    registryOpts: { precheck: (source) => doctor.precheck(source) },
  })
  const a = await registry.install({ kind: 'local', path: fixtureDir('requires-twin-a') })
  assert.equal(a.ok, true, '第一个依赖者安装成功: ' + JSON.stringify(a.ok ? {} : a.precheck.blocking.map((x) => x.code + ':' + x.message)))
  const b = await registry.install({ kind: 'local', path: fixtureDir('requires-twin-b') })
  const blocking = b.ok ? [] : b.precheck.blocking.map((x) => x.code + ':' + x.message)
  assert.ok(!blocking.some((x) => x.startsWith('reg.name-collision')), '回归钉：requires.services 不再被借用为提供面 ⇒ 共同依赖不判冲突。实际=' + JSON.stringify(blocking))
  assert.equal(b.ok, true, '第二个依赖者应照常安装。实际=' + JSON.stringify(blocking))
  await stopAll()
})

test('批 2-③：provides 与旧 registers 双在场 ⇒ 逐槽 provides 赢（优先读，不是拼合）', async (t) => {
  const { registry, stopAll } = makeStack(t)
  const r = await registry.install({ kind: 'local', path: fixtureDir('provides-precedence') })
  assert.equal(r.ok, true, '双在场夹具应装入成功: ' + JSON.stringify(r.ok ? {} : r.precheck.blocking.map((x) => x.code)))
  const regs = registry.registersOf('fixture/provides-precedence')
  assert.deepEqual(regs?.commands, ['fixture.from-provides'], 'commands 槽取 provides 那份（旧 registers 那份被覆盖而非并存）')
  await stopAll()
})

test('P5-#3：注册冲突——同 commands 注册面的第二个插件被 reg.name-collision 阻断', async (t) => {
  const { registry, doctor, stopAll } = makeStack(t, {
    registryOpts: { precheck: (source) => doctor.precheck(source) },
  })
  const a = await registry.install({ kind: 'local', path: fixtureDir('conflict-a') })
  assert.equal(a.ok, true, '第一个安装成功')
  const b = await registry.install({ kind: 'local', path: fixtureDir('conflict-b') })
  assert.equal(b.ok, false)
  if (!b.ok) {
    const issue = b.precheck.blocking.find((x) => x.code === 'reg.name-collision')
    assert.ok(issue, '第二个被 reg.name-collision 阻断')
    assert.match(issue.message, /fixture\.shared-cmd/)
  }
  await stopAll()
})

test('批 2-①：provides 撞名——同 provides.services 的第二个插件被 reg.name-collision 阻断（提供面正源已切到 provides）', async (t) => {
  const { registry, doctor, stopAll } = makeStack(t, {
    registryOpts: { precheck: (source) => doctor.precheck(source) },
  })
  const a = await registry.install({ kind: 'local', path: fixtureDir('provides-a') })
  assert.equal(a.ok, true, '第一个登记该服务的插件安装成功: ' + JSON.stringify(a.ok ? {} : a.precheck.blocking.map((x) => x.code + ':' + x.message)))
  const b = await registry.install({ kind: 'local', path: fixtureDir('provides-b') })
  const detail = b.ok ? [] : b.precheck.blocking.map((x) => x.code + ':' + x.message)
  assert.equal(b.ok, false, 'provides.services 撞名须被阻断（不写进 legacy registers 也要拦）。实际=' + JSON.stringify(detail))
  if (!b.ok) {
    const issue = b.precheck.blocking.find((x) => x.code === 'reg.name-collision')
    assert.ok(issue, '阻断码为 reg.name-collision，且来源是 provides 槽')
    assert.match(issue.message, /服务 fixture\.shared-svc/)
  }
  await stopAll()
})

// ── 批 3（★2 模块静态面绑定）：一律走真装载链，不许再用手工注入条目视图替代 ──────────

test('批 3-①：模块导出的 healthCheck/panels 经装载链绑进 manifest，并被体检真消费（正常与异常两条路）', async (t) => {
  const mod = await import('./fixtures/registry/runtime-statics/index.js')
  mod.state.fail = false
  const { registry, doctor, stopAll } = makeStack(t, { doctorOpts: { failureThreshold: 1 } })
  doctor.attachRegistry(registry)
  const installed = await registry.install({ kind: 'local', path: fixtureDir('runtime-statics') })
  assert.equal(installed.ok, true, '夹具安装成功: ' + JSON.stringify(installed.ok ? {} : installed.precheck.blocking.map((x) => x.code + ':' + x.message)))

  const entry = registry.get('fixture/runtime-statics')
  assert.equal(typeof entry.manifest.healthCheck, 'function',
    '★2 绑定在场：此前 healthCheck 在装载链上不可达（读方一直读 manifest.healthCheck，写方从未存在）')
  assert.deepEqual((entry.manifest.panels || []).map((p) => p.id), ['runtime-statics.main'], 'panels 同样由模块导出绑进')

  const okReport = await doctor.inspect('fixture/runtime-statics')
  assert.ok(okReport.reports[0].items.some((i) => i.code === 'runtime-statics.ok'),
    '模块 healthCheck 的产出必须出现在体检报告里（证明读方真拿到并调用，不是只挂了个字段）')

  mod.state.fail = true
  const badReport = await doctor.inspect('fixture/runtime-statics')
  assert.ok(badReport.reports[0].items.some((i) => i.code === 'healthcheck-failed' && i.level === 'error'),
    '同一条真链上的异常路径也计入 healthcheck-failed（与既有手工注入用例同语义，但走的是装载链）')
  mod.state.fail = false
  await stopAll()
})

test('批 3-②：JSON 落盘边界——磁盘上两份形态都不含函数，绑定只活在内存面', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'doctor-batch3-'))
  const statePath = join(dir, 'state.json')
  const onDisk = JSON.parse(readFileSync(join(fixtureDir('runtime-statics'), 'dsh.plugin.json'), 'utf8'))
  assert.equal('healthCheck' in onDisk, false, '夹具的落盘 manifest 不含 healthCheck（函数装不进 JSON）')
  assert.equal('panels' in onDisk, false, '夹具的落盘 manifest 不含 panels ⇒ 内存面那份只可能来自模块绑定')

  const { registry, stopAll } = makeStack(t, { registryOpts: { statePath } })
  const installed = await registry.install({ kind: 'local', path: fixtureDir('runtime-statics') })
  assert.equal(installed.ok, true)
  const persistedText = readFileSync(statePath, 'utf8')
  assert.equal(persistedText.includes('healthCheck'), false, '状态文件不得出现 healthCheck（PersistedPlugin 不含 manifest）')
  assert.doesNotThrow(() => JSON.parse(persistedText), '状态文件必须可解析（函数不炸盘）')
  const persisted = JSON.parse(persistedText)
  assert.equal(Object.prototype.hasOwnProperty.call(persisted.plugins['fixture/runtime-statics'], 'manifest'), false,
    '守卫：持久化条目形状仍不含 manifest —— 若哪天把 manifest 整体落盘，本断言会先响（函数会被静默丢掉）')
  const entry = registry.get('fixture/runtime-statics')
  assert.equal(typeof entry.manifest.healthCheck, 'function', '内存面绑定在场（与落盘面互不污染）')
  assert.equal('healthCheck' in JSON.parse(JSON.stringify(entry.manifest)), false, '整份 manifest 被序列化时函数静默消失而非抛错')
  rmSync(dir, { recursive: true, force: true })
  await stopAll()
})

// ── 批 4（★3 优先级 + panels 同族同向）──────────────────────────────────────

test('批 4-①：configSchema 与 panels 双在场 ⇒ 生效的是模块那份（引用相等 + 写回行为双向证明）', async (t) => {
  const mod = await import('./fixtures/registry/schema-precedence/index.js')
  const { registry, stopAll } = makeStack(t)
  const id = 'fixture/schema-precedence'
  const installed = await registry.install({ kind: 'local', path: fixtureDir('schema-precedence') })
  assert.equal(installed.ok, true, '双在场夹具应装入: ' + JSON.stringify(installed.ok ? {} : installed.precheck.blocking.map((x) => x.code + ':' + x.message)))
  const entry = registry.get(id)
  assert.equal(entry.manifest.configSchema, mod.Config, '内存面 configSchema 必须是模块 Config（引用相等，不是深合并）')
  assert.deepEqual(entry.manifest.panels.map((p) => p.id), ['from-module'], 'panels 与 configSchema 同序：模块那份赢')

  let acceptedManifestOnly = true
  try {
    await registry.setConfig(id, { fromManifest: 'x' })
  } catch {
    acceptedManifestOnly = false
  }
  assert.equal(acceptedManifestOnly, false,
    '只满足"落盘那份"的配置必须被拒 ⇒ 若优先级翻回 manifest 赢，这里会误通过（变异自检的抓手）')
  await registry.setConfig(id, { fromModule: 'ok' })
  await stopAll()
})

test('批 4-②：doctor 预检同序——默认配置按**模块** schema 判，缺 fromModule 阻断且点名模块字段', async (t) => {
  const { registry, doctor, stopAll } = makeStack(t, {
    registryOpts: { precheck: (source) => doctor.precheck(source) },
  })
  const blocked = await registry.install({ kind: 'local', path: fixtureDir('schema-precedence') })
  assert.equal(blocked.ok, false, '空默认配置不满足模块 Config 的 fromModule 必填 ⇒ 应阻断')
  if (!blocked.ok) {
    const issue = blocked.precheck.blocking.find((x) => x.code === 'config-schema-invalid')
    assert.ok(issue, '阻断码为 config-schema-invalid（既有断言语义未放宽）')
    assert.match(issue.message, /fromModule/, '点名的是**模块那份**的必填字段，而非落盘的 fromManifest')
    assert.equal(/fromManifest/.test(issue.message), false, '不得同时把落盘那份的字段算进判据')
  }
  await stopAll()
})
