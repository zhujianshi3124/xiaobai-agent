// Pack C · toolkit 两张服务名都必须真的进 cordis 容器
//
// 装配现场只有一个（panel/manager/registry-host.mjs 的 createToolkitServices，
// REQ-8 裁定的唯一装配点）。本文件钉的是**容器面**：
//   `${prefix}/registry` 与 `${prefix}/doctor` 都要能被 ctx 查找出来、能真干活；
//   并且面板 fiber 一拆，两个键同时消失——回收靠 cordis 的 fiber 归属，
//   toolkit 不写任何补偿式 cleanup。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'

import { createToolkitServices } from '../panel/manager/registry-host.mjs'
import { contractServiceName } from 'dsh-toolkit/contract'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const silent = { info: () => {}, warn: () => {}, error: () => {} }

/**
 * 以"被宿主装载"的形态装配一次：服务注册发生在探针插件自己的派生 ctx 上，
 * 所以 fiber.dispose() 就是面板卸出等价物（真 cordis 卸载路径，不是手调 disposer）。
 */
async function mountServices(t, servicePrefix = 'toolkit') {
  const tmp = mkdtempSync(join(tmpdir(), `pack-c-${servicePrefix}-`))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const ctx = new Context()
  let services = null
  const fiber = ctx.plugin({
    name: `pack-c-probe-${servicePrefix}`,
    inject: [],
    apply(pluginCtx) {
      services = createToolkitServices(pluginCtx, {
        servicePrefix,
        toolkitRoot: ROOT,
        registry: { statePath: join(tmp, 'state.json'), autoload: false },
        doctor: { watchInterval: 0 },
      }, silent)
      // 批 5-2 顺带补的收尾：本 harness 直接调 createToolkitServices（不经 panel/index.js），
      // 而面板那条链上的 `ctx.effect(() => void services.stop())` 在这里并不存在 ⇒
      // 装配现场起了常驻定时器（实况对齐）却没人停它，`node --test`（无 force-exit）会挂住。
      // 与 panel/index.js 同一件事：谁装配谁负责停。
      t.after(async () => { await services.stop() })
    },
  })
  // cordis 的 apply 在 _reload 里异步跑；不 await 就等于"装配还没发生就断言"。
  await fiber
  t.after(() => fiber.dispose())
  return { ctx, services, fiber }
}

test('Pack C：装配后 ${prefix}/registry 与 ${prefix}/doctor 双双可经 ctx 服务查找取到', async (t) => {
  const { ctx, services } = await mountServices(t)
  assert.equal(services.servicePrefix, 'toolkit')

  const registry = ctx[contractServiceName('toolkit', 'registry')]
  const doctor = ctx[contractServiceName('toolkit', 'doctor')]
  assert.ok(registry, 'toolkit/registry 必须可取（原有行为，防回归）')
  assert.ok(doctor, 'toolkit/doctor 必须可取（本 Pack 修复面：文档 embed-toolkit.md §3 承诺过它，装配路径却没注册）')
  assert.equal(doctor, services.doctor, '取到的必须是同一个实例，不是第二份 doctor')
  assert.equal(typeof doctor.precheck, 'function')
  assert.equal(typeof doctor.inspect, 'function')
  assert.equal(typeof doctor.registerRule, 'function')
})

test('Pack C：经容器取到的 doctor 真能干活（跑一次预检，结论与直连实例一致）', async (t) => {
  const { ctx, services } = await mountServices(t)
  const doctor = ctx[contractServiceName('toolkit', 'doctor')]
  const report = await doctor.precheck({ kind: 'local', path: join(ROOT, 'test', 'fixtures', 'registry', 'invalid-manifest-plugin') })
  assert.equal(report.pass, false, '契约范围不兼容的夹具必须被阻断')
  assert.ok(report.blocking.length > 0)
  assert.ok(report.blocking.every((b) => b.fix), '每条阻断都要带可执行修复指引（REQ-3）')
  const direct = await services.doctor.precheck({ kind: 'local', path: join(ROOT, 'test', 'fixtures', 'registry', 'invalid-manifest-plugin') })
  assert.deepEqual(report.blocking.map((b) => b.code), direct.blocking.map((b) => b.code), '容器面与直连面必须是同一实现')
})

test('Pack C：面板 fiber 卸出 → 两个服务键一起消失（靠 cordis fiber 归属，无补偿 cleanup）', async (t) => {
  const { ctx, services, fiber } = await mountServices(t)
  assert.ok(ctx['toolkit/doctor'] && ctx['toolkit/registry'], '前置：装上的时候两个都在')
  await fiber.dispose() // mountServices 的 t.after 会再调一次，cordis 的 disposer 幂等
  assert.equal(ctx['toolkit/doctor'], undefined, 'doctor 服务必须随面板 fiber 自动注销')
  assert.equal(ctx['toolkit/registry'], undefined, 'registry 服务同上（对称性）')
  assert.equal(services.registry.list().length, 0, '子插件 fiber 也已级联清理')
})

test('Pack C：同进程双实例共用一个根 ctx 时，前缀决定服务名且互不撞名', async (t) => {
  // 关键设计：两个实例挂在**同一个** Context 上。cordis 的 provide 对同名重复注册
  // 直接抛错（"service X has been registered at <fiber>"），所以只要前缀被忽略或
  // 拼错，装配当场就炸——这比"各挂各的 ctx 再互相看不见"强得多。
  const ctx = new Context()
  const made = []
  for (const prefix of ['toolkit', 'tk2']) {
    const tmp = mkdtempSync(join(tmpdir(), `pack-c-dual-${prefix}-`))
    t.after(() => rmSync(tmp, { recursive: true, force: true }))
    const fiber = ctx.plugin({
      name: `pack-c-dual-${prefix}`,
      inject: [],
      apply(pluginCtx) {
        t.after(async () => {
          // 同 mountServices：本 harness 不经 panel/index.js 那条 effect 清理链，
          // 起了实况对齐器就得自己停（批 5-2 起这是**必须**的一步，否则 `node --test`
          // 无 force-exit 会被常驻定时器钉住不退出）。
          for (const s of made) await s.stop()
        })
        made.push(createToolkitServices(pluginCtx, {
          servicePrefix: prefix,
          toolkitRoot: ROOT,
          registry: { statePath: join(tmp, 'state.json'), autoload: false },
          doctor: { watchInterval: 0 },
        }, silent))
      },
    })
    t.after(() => fiber.dispose())
    await fiber // 等 apply() 真跑完（同 mountServices 的理由）
  }
  assert.equal(made.length, 2, '两个实例都装配成功（没因同名服务被 provide 拒掉）')
  assert.ok(ctx[contractServiceName('toolkit', 'doctor')], '缺省实例：toolkit/doctor')
  assert.ok(ctx[contractServiceName('tk2', 'doctor')], '第二实例：tk2/doctor 独立存在')
  assert.ok(ctx[contractServiceName('toolkit', 'registry')] && ctx[contractServiceName('tk2', 'registry')])
  assert.notEqual(ctx[contractServiceName('toolkit', 'doctor')], ctx[contractServiceName('tk2', 'doctor')], '两个服务键必须指向各自实例')
})

// ── 批 5-2（★11）：实况对齐器的"谁来启动"这一格 ──────────────────────────────
// 装配面守卫，两发各钉一头：
//   正向 = 真宿主（有 ctx.on）⇒ 对齐器必须真的在跑，否则面板继续撒谎、本批等于没做；
//   反向 = 最小宿主/mock ctx（无 ctx.on）⇒ 一律不起，与 doctor 巡检同一条规则
//          （本文件上面那条"避免留下悬挂定时器"的原注）。反向这一发不是形式：
//          对齐器最初挂在 `registry.start()` 上时，`scripts/p24-ui-matrix.mjs`
//          （无 on 的 mock ctx、跑完不 stop）直接被常驻定时器钉住不退出 —— 该发就是那条回归的钉。
test('批5-2 装配面：真宿主（有事件面）⇒ registry-host 启动实况对齐器', async (t) => {
  const { services } = await mountServices(t)
  assert.equal(services.registry.statusAlignRunning(), true,
    '生产装配现场必须把对齐器启起来（启停在 registry-host 的 hasEvents 分支，不在 registry.start() 里）')
  await services.stop()
  assert.equal(services.registry.statusAlignRunning(), false, 'stop() 之后不得仍在跑（句柄交回，不靠进程退出兜底）')
})

test('批5-2 装配面反向：最小宿主无事件面 ⇒ 对齐器与 doctor 巡检一样不启动、不留句柄', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'pack-c-minhost-'))
  const ctx = {
    effect: (cb) => { cb() },
    get: () => undefined,
    webServer: { register: () => () => {} },
  }
  const services = createToolkitServices(ctx, {
    servicePrefix: 'toolkit',
    toolkitRoot: ROOT,
    registry: { statePath: join(tmp, 'state.json'), autoload: false },
  }, silent)
  try {
    assert.equal(services.registry.statusAlignRunning(), false, '无事件面 ⇒ 不启对齐器（挂钟不许由最小宿主吞下）')
  } finally {
    await services.stop()
    rmSync(tmp, { recursive: true, force: true })
  }
})
