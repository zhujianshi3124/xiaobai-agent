// W2 余件 F-72 · "健康详情"第二次点击不折叠且恒重发请求 —— 真实 bundle 行为钉（先钉后修）
//
// 复算（前任代理实读＋本会话现 HEAD 快核成立）：panel/client/index.js 的 toggleHealth
// 守卫判 `open === "health" || open === "health-error"` 字面，而载入成功后 open 被写成
// "health:"+JSON（渲染分支判的是前缀 `indexOf("health:") === 0`）⇒ "health" 字面在载入后
// 永不被读到 ⇒ 二次点击既不折叠、还恒重发 /v2/health。修法＝守卫补前缀判据（与渲染分支同判）。
//
// 本文件经共享工装（真实 client bundle + 可重渲染假 react + 路由桩，panel-client-harness）
// 钉行为三步：开（请求 1 次）→ 载入后点第二次：必须折叠且不再发请求 → 点第三次：重开并
// 重新拉取（不是卡死在折叠态、数据新鲜）。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  baseRoutes, buttonOf, flush, makeRouter, mountUnifiedPanel,
  text, v2SnapshotPayload, v2Entry,
} from './helpers/panel-client-harness.mjs'

const ENTRY = v2Entry('fold-probe', {
  health: { status: 'active' },
  healthSummary: { errors: 0, warnings: 0 },
})

function healthCalls(router) {
  return router.calls.filter((u) => u.includes('/v2/health?')).length
}

test('F-93 · 挂起态二次点击：折叠意图优先于回调重开（F-72 施工邻接自曝，C1-006 批复立项）', async () => {
  // 复算（本会话 F-72 施工时邻接发现、批复令先复现）：点击 1 后 open==="health"（挂起态），
  // 此时点击 2 命中既有守卫字面 ⇒ 折叠；但决议回调无条件 setOpen("health:"+json) ⇒
  // 用户刚表达的折叠意图被回调推翻（重开）。修法＝决议写入改函数式 setState，
  // prev===""（用户已折叠）时不写。
  const router = makeRouter()
  baseRoutes(router)
  let resolveHealth = null
  router.routes.push(
    {
      match: '/api/toolkit-panel/v2/snapshot',
      handler: () => ({ status: 200, json: async () => v2SnapshotPayload([ENTRY]) }),
    },
    {
      match: '/api/toolkit-panel/v2/health',
      handler: () => ({
        status: 200,
        json: () => new Promise((resolve) => { resolveHealth = resolve }),
      }),
    },
  )
  const panel = mountUnifiedPanel({ router })
  try {
    await panel.done()

    // 点击 1：发出请求并停在挂起态（open === "health"，详情未上屏）
    const btn1 = buttonOf(panel.tree, '健康详情')
    assert.ok(btn1, 'v2 卡上必须有「健康详情」按钮')
    btn1.props.onClick()
    await flush(6)
    assert.ok(resolveHealth, 'health 请求应已发出且停在挂起')
    assert.equal(healthCalls(router), 1)
    assert.ok(!text(panel.tree).includes('当前状态：'), '挂起态详情未上屏（等待决议）')

    // 点击 2（挂起中）：折叠意图——既有守卫已折叠（F-72 前笔已钉此格）
    const btn2 = buttonOf(panel.tree, '健康详情')
    assert.ok(btn2, '挂起态按钮仍在')
    btn2.props.onClick()
    await flush(6)
    assert.ok(!text(panel.tree).includes('当前状态：'), '挂起态二次点击应折叠')

    // F-93 本格：决议到达，不得推翻用户折叠意图
    resolveHealth({ ok: true, report: { status: 'active', items: [] }, history: [{ status: 'active' }] })
    await flush(10)
    assert.ok(!text(panel.tree).includes('当前状态：'), '决议后必须保持折叠（修前：then 回调无条件重开）')
    assert.equal(healthCalls(router), 1, '决议不重开 ⇒ 不得补发请求')

    // 用户再点：重新展开并重新拉取（折叠不是卡死）
    const btn3 = buttonOf(panel.tree, '健康详情')
    assert.ok(btn3, '折叠态按钮仍在')
    btn3.props.onClick()
    await flush(6)
    assert.ok(resolveHealth, '第三次点击应重新发出请求')
    assert.equal(healthCalls(router), 2)
    resolveHealth({ ok: true, report: { status: 'active', items: [] }, history: [{ status: 'active' }] })
    await flush(10)
    assert.ok(text(panel.tree).includes('当前状态：'), '用户再次展开后详情正常上屏')
  } finally {
    panel.dispose()
  }
})

test('F-72 · 健康详情：二次点击折叠且不重发，三次点击重开并重新拉取', async () => {
  const router = makeRouter()
  baseRoutes(router)
  router.routes.push(
    {
      match: '/api/toolkit-panel/v2/snapshot',
      handler: () => ({ status: 200, json: async () => v2SnapshotPayload([ENTRY]) }),
    },
    {
      match: '/api/toolkit-panel/v2/health',
      handler: () => ({
        status: 200,
        json: async () => ({ ok: true, report: { status: 'active', items: [] }, history: [{ status: 'active' }] }),
      }),
    },
  )
  const panel = mountUnifiedPanel({ router })
  try {
    await panel.done()

    // 第一次点击：发出请求，详情载入（"当前状态："上屏）
    const btn1 = buttonOf(panel.tree, '健康详情')
    assert.ok(btn1, 'v2 卡上必须有「健康详情」按钮')
    btn1.props.onClick()
    await flush(10)
    assert.ok(text(panel.tree).includes('当前状态：'), '第一次点击后健康详情应载入上屏')
    assert.equal(healthCalls(router), 1, '首次点击恰好发一次 /v2/health')

    // 第二次点击：折叠 + 不重发（F-72 判据；修前此格红——open 已是 health:json，守卫判字面）
    const btn2 = buttonOf(panel.tree, '健康详情')
    assert.ok(btn2, '折叠后按钮仍在')
    btn2.props.onClick()
    await flush(10)
    assert.ok(!text(panel.tree).includes('当前状态：'), '第二次点击必须折叠（修前：不折叠）')
    assert.equal(healthCalls(router), 1, '第二次点击不得重发 /v2/health（修前：恒重发）')

    // 第三次点击：重开 + 重新拉取（不是卡死在折叠态，数据新鲜）
    const btn3 = buttonOf(panel.tree, '健康详情')
    assert.ok(btn3, '折叠态下按钮仍在')
    btn3.props.onClick()
    await flush(10)
    assert.ok(text(panel.tree).includes('当前状态：'), '第三次点击应重新展开')
    assert.equal(healthCalls(router), 2, '第三次点击重新拉取一次（数据新鲜）')
  } finally {
    panel.dispose()
  }
})
