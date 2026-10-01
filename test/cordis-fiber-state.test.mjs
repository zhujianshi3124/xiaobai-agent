// A3 · cordis FiberState 编号守卫（R13 的显式回归保护）
//
// 本测试钉住 cordis **4.0.2** 的 FiberState 数值。若红，先查 cordis 版本变更，
// 对照 `registry/src/registry.ts` 的 FIBER_* 常量与 `docs/debt.md` D-5，
// **禁止直接改数字了事**——数字对了但语义错了，是本仓最贵的一种失败。
//
// 为什么必须硬编码数字：cordis 把 FiberState 声明成 `export const enum`
// （src/fiber.ts），构建产物里被完全擦除（lib/index.js 中该符号出现 0 次），
// 运行时拿不到这个枚举。所以本用例的做法是：**用真 cordis 实测出每个终态的
// 数值，再与 registry 导出的常量逐一对账**——两边任何一头漂移都会红。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'

import {
  FIBER_PENDING,
  FIBER_LOADING,
  FIBER_ACTIVE,
  FIBER_FAILED,
  FIBER_DISPOSED,
  FIBER_UNLOADING,
} from 'dsh-toolkit/registry'
import { versionSatisfies } from 'dsh-toolkit/contract'

const CORDIS_MIN_CALIBRATED = '4.0.2'

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms))

test('守卫前提：FiberState 在 cordis 运行时确实不可得（拿不到就必须继续硬编码，别以为可以改 import）', async () => {
  const cordis = await import('@deepseek-ai/cordis')
  assert.equal(cordis.FiberState, undefined, 'FiberState 是 const enum，运行时被擦除；若哪天 cordis 改发真枚举，本断言会红——那时应改为 import 枚举并删除本守卫的硬编码侧')
})

test('ACTIVE：真 cordis 装入成功的 fiber，state 实测值必须等于 registry.FIBER_ACTIVE', async (t) => {
  const ctx = new Context()
  const fiber = ctx.plugin({
    name: 'guard-active',
    inject: [],
    // 一律用对象方法简写（无 prototype），确保 cordis 走函数调用而不是 new 构造，
    // 否则 isConstructor 判定会改变执行语义（见 docs/p0-recon.md §6 R2）。
    apply(pluginCtx) {
      pluginCtx.effect(() => () => {})
    },
  })
  t.after(() => fiber.dispose())
  await fiber
  assert.equal(fiber.state, FIBER_ACTIVE, 'ACTIVE 语义与数值必须同时成立')
  assert.equal(FIBER_ACTIVE, 2, 'cordis 4.0.2 实测 ACTIVE === 2')
})

test('FAILED：apply 抛错的 fiber，state 实测值必须等于 registry.FIBER_FAILED', async () => {
  const ctx = new Context()
  const fiber = ctx.plugin({
    name: 'guard-failed',
    inject: [],
    // 用对象方法形态（无 prototype）确保走函数调用路径；`function apply(){}` 会被
    // cordis 的 isConstructor 判成构造器（见 docs/p0-recon.md §6 R2），语义完全不同。
    apply() {
      throw new Error('guard-failed boom')
    },
  })
  await assert.rejects(async () => await fiber, /guard-failed boom/)
  assert.equal(fiber.state, FIBER_FAILED)
  assert.equal(FIBER_FAILED, 3, 'cordis 4.0.2 实测 FAILED === 3')
})

test('DISPOSED：dispose 后的 fiber，state 实测值必须等于 registry.FIBER_DISPOSED', async () => {
  const ctx = new Context()
  const fiber = ctx.plugin({ name: 'guard-disposed', inject: ['guard/never-comes'], apply() {} })
  await tick()
  assert.equal(fiber.state, FIBER_PENDING, '前置：inject 缺席应停在 PENDING')
  assert.equal(FIBER_PENDING, 0)
  await fiber.dispose()
  assert.equal(fiber.state, FIBER_DISPOSED)
  assert.equal(FIBER_DISPOSED, 4, 'cordis 4.0.2 实测 DISPOSED === 4')
})

test('UNLOADING：注入服务被摘除的瞬间，state 实测值必须等于 registry.FIBER_UNLOADING', async () => {
  const ctx = new Context()
  const unprovide = ctx.reflect.provide('guard/dep', { ok: 1 })
  const fiber = ctx.plugin({ name: 'guard-unloading', inject: ['guard/dep'], apply() {} })
  await fiber
  assert.equal(fiber.state, FIBER_ACTIVE)
  unprovide()
  // 同步即可观测：_setEpoch → _updateState 显式置 UNLOADING，随后 _unload 收敛到 PENDING。
  assert.equal(fiber.state, FIBER_UNLOADING)
  assert.equal(FIBER_UNLOADING, 5, 'cordis 4.0.2 实测 UNLOADING === 5（registry 轮询必须继续等它收敛，A2）')
  await tick()
  assert.equal(fiber.state, FIBER_PENDING, '收敛后回 PENDING（依赖回来了还会自动转 ACTIVE）')
})

test('枚举顺序不变式：六个状态必须互不相同，registry 的终态判定不得有两个码撞同一个数', async () => {
  const values = [FIBER_PENDING, FIBER_LOADING, FIBER_ACTIVE, FIBER_FAILED, FIBER_DISPOSED, FIBER_UNLOADING]
  assert.equal(new Set(values).size, values.length, `FIBER_* 出现重复数值：${values.join(',')}`)
  assert.deepEqual(values.slice().sort((a, b) => a - b), [0, 1, 2, 3, 4, 5], '与 cordis 4.0.2 的 FiberState 声明顺序一一对应')
})

// ── E2 · cordis 范围守卫 ─────────────────────────────────────────────────
// 装入判定按 cordis 4.0.2 的 fiber 行为校准（docs/debt.md D-5 / docs/contract.md §7 D-5），
// 原先依赖声明写成 ">=4.0.0-rc <5"，把未经校准的 4.0.0/4.0.1/更早 rc 全放进来，
// 且本地 devDependencies 钉住 4.0.2 会掩盖这个差异（本仓装了才"看着没事"）。
// 收紧后声明面必须只放行 >=4.0.2；这里用**本仓自己的 semver 引擎**判定，
// 与上面 FiberState 数值守卫配套：范围放行 + 数值对得上，才算校准过。
// S2 正名批 G8（2026-10-01）起 cordis 自 peerDependencies 转正为 dependencies（vendor 撤除、
// 公共源实装）——校准纪律不变，声明位置随依赖形态从 peer 挪到 dependencies（守卫命题不变）。
test('E2：cordis 依赖范围必须排除未经 fiber 行为校准的版本（G8 转正后验 dependencies）', () => {
  const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'))
  const dep = pkg.dependencies['@deepseek-ai/cordis']
  assert.equal(dep, `^${CORDIS_MIN_CALIBRATED}`, 'dependencies 范围应恰为 ^4.0.2（放行 >=4.0.2 <5.0.0）')
  assert.equal(pkg.peerDependencies['@deepseek-ai/cordis'], undefined, 'G8 起 cordis 不再声明为 peer（防双声明语义漂移）')

  for (const tooOld of ['4.0.0', '4.0.1', '4.0.0-rc.3', '4.0.2-rc.1']) {
    assert.equal(
      versionSatisfies(tooOld, dep),
      false,
      `${tooOld} 未经校准，不得被依赖范围放行（R13/D-5 纪律）`,
    )
  }
  assert.equal(versionSatisfies(CORDIS_MIN_CALIBRATED, dep), true, '校准基线本身必须在范围内')
  assert.equal(versionSatisfies('4.9.0', dep), true, '4.x 仍在范围内——升级由 S1/S4 + 本守卫把关，不由范围声明一刀切')
  assert.equal(versionSatisfies('5.0.0', dep), false, '跨主版本必须被范围声明挡下')

  // 本地开发钉的版本不得低于校准基线，否则"本仓绿了"不代表嵌进宿主也绿
  const dev = pkg.devDependencies['@deepseek-ai/cordis']
  assert.equal(dev, CORDIS_MIN_CALIBRATED, 'devDependencies 应精确钉在校准基线上')
})
