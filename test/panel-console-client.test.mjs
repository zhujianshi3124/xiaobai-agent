// R1-a · 体检操作台（ConsoleSection）的**客户端面**双向钉
//
// 为什么单独一个文件：操作台三条 execute 通路的既有覆盖全在**服务端**（p1-smoke 的"路由已注册 + 405"、
// p24-ui-matrix 直调 execute 端点且自己传 token）。客户端怎么选 URL 这一步全仓零覆盖 ⇒
// "beginFix/beginRollback/beginSnapshot 的 setDlg 漏传 kind，消费侧三目恒落兜底"这个缺陷
// 能让修正与回滚**每次都吃 400**，而三道锁一路全绿。本文件按"直驱真实 client bundle"钉这一格。
//
// 双向口径（协调侧 C1-004 回执第六节）：
//   正向 —— kind 赋值后三条 URL 分派各自正确；
//   反向 —— 兜底分支不得被误打（点修正/回滚时 `snapshot-restore/execute` 出现零次），
//           三个症状（修正 400、回滚 400、"将执行"/"变化预览"两屏恒不渲染）各自断言。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  mountUnifiedPanel, makeRouter, buttonOf, text,
  patchSnapshotPayload, v2SnapshotPayload,
} from './helpers/panel-client-harness.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ── 操作台的三份数据桩 ─────────────────────────────────────────────────────
const FIX_ISSUE = {
  id: 'ref.unresolvable-local', file: 'package.json', line: 12, severity: 'error',
  message: '旧包名引用已失效',
  fix: { class: 'rewrite', plan: [{ op: 'replace', file: 'package.json', old: '@local/dsh-compact-router', new: '@local/dsh-toolkit/compact-router' }] },
}
const APPLY_PLAN = { token: 'T-FIX', kind: 'doctor-apply', steps: [{ op: 'replace', file: 'package.json', old: '@local/dsh-compact-router', new: '@local/dsh-toolkit/compact-router' }] }
const ROLLBACK_PLAN = { token: 'T-RB', kind: 'doctor-rollback', steps: [{ op: 'replace', file: 'x.json', old: 'a', new: 'b' }] }
const SNAPSHOT_PLAN = { token: 'T-SN', kind: 'snapshot-restore', steps: [], diff: ['-  old line', '+  new line'] }
const APPLY_ENTRY = { action: 'apply', stamp: '2026-09-23T01-00-00.000Z', files: 1, packages: 0 }
const SNAPSHOT_ROW = { stamp: '2026-09-23T02-00-00.000Z', reason: 'panel', sha256: 'abcdef1234567890', bytes: 3085 }

function consoleRoutes(router) {
  // 顺序要紧两回：① harness 的 router 取**先注册**者；② '/api/toolkit-panel/snapshot' 是
  // '/api/toolkit-panel/snapshot-restore/plan' 的前缀 ⇒ 泛化那条必须排在 snapshot-restore 之后，
  // 否则恢复通路的请求会被面板快照桩吞掉（表现为"预览屏没渲染"的假产品 bug）。
  const exec = (path) => {
    const seen = []
    router.routes.push({
      match: path,
      handler: (body) => { seen.push(body && body.token); return { status: 200, json: async () => ({ ok: true, applied: 1, token: body && body.token }) } },
    })
    return seen
  }
  router.routes.push(
    { match: '/api/toolkit-panel/doctor/dry-run', handler: () => ({ status: 200, json: async () => ({ ok: true, report: { summary: { error: 1, warning: 0, info: 0 }, issues: [FIX_ISSUE] } }) }) },
    { match: '/api/toolkit-panel/doctor/states', handler: () => ({ status: 200, json: async () => ({ ok: true, states: [APPLY_ENTRY], snapshots: [SNAPSHOT_ROW] }) }) },
    { match: '/api/toolkit-panel/custody', handler: () => ({ status: 200, json: async () => ({ ok: true, custody: { entries: [], presetState: null } }) }) },
    { match: '/api/toolkit-panel/v2/snapshot', handler: () => ({ status: 200, json: async () => v2SnapshotPayload([]) }) },
    { match: '/api/toolkit-panel/snapshot-restore/plan', handler: () => ({ status: 200, json: async () => ({ ok: true, plan: SNAPSHOT_PLAN }) }) },
  )
  const sn = exec('/api/toolkit-panel/snapshot-restore/execute')
  router.routes.push(
    { match: '/api/toolkit-panel/doctor/apply/plan', handler: () => ({ status: 200, json: async () => ({ ok: true, plan: APPLY_PLAN }) }) },
    { match: '/api/toolkit-panel/doctor/rollback/plan', handler: () => ({ status: 200, json: async () => ({ ok: true, plan: ROLLBACK_PLAN }) }) },
  )
  const fix = exec('/api/toolkit-panel/doctor/apply/execute')
  const rb = exec('/api/toolkit-panel/doctor/rollback/execute')
  router.routes.push(
    { match: '/api/toolkit-panel/snapshot', handler: () => ({ status: 200, json: async () => patchSnapshotPayload() }) },
  )
  return { fix, rb, sn }
}
const countHits = (router, frag) => router.calls.filter((u) => u.includes(frag)).length

async function openConsole() {
  const router = makeRouter()
  const exec = consoleRoutes(router)
  const panel = mountUnifiedPanel({ router })
  await panel.done()
  buttonOf(panel.tree, '一键体检（只查不改）').props.onClick()
  await panel.done()
  return { router, panel, exec }
}

test('修正通路：确认后必须打 /doctor/apply/execute，且"将执行"清单真的渲染（三症状之①与②）', async () => {
  const { router, panel, exec } = await openConsole()
  try {
    const run = buttonOf(panel.tree, '执行')
    assert.ok(run, '体检报告里那条 rewrite 问题必须出"执行"按钮')
    run.props.onClick()
    await panel.done()
    assert.equal(countHits(router, '/doctor/apply/plan'), 1, '点执行只发一次 plan 请求')

    const shown = text(panel.tree)
    assert.ok(shown.includes('将执行'), '"将执行"清单屏必须渲染（缺 kind 时这屏恒不出现）')
    assert.ok(shown.includes('replace') && shown.includes('@local/dsh-toolkit/compact-router'), '步骤行含算子与新值')

    buttonOf(panel.tree, '确认修正').props.onClick()
    await panel.done()
    assert.deepEqual(exec.fix, ['T-FIX'], 'execute 必须带 plan.token 打 apply 端点')
    assert.equal(exec.rb.length, 0, '不得串到回滚端点')
    assert.equal(countHits(router, '/snapshot-restore/execute'), 0, '不得落三目兜底（这正是原缺陷的表征）')
  } finally { panel.dispose() }
})

test('回滚通路：确认后必须打 /doctor/rollback/execute（三症状之①在回滚方向的同格）', async () => {
  const { router, panel, exec } = await openConsole()
  try {
    buttonOf(panel.tree, '回滚').props.onClick()
    await panel.done()
    assert.equal(countHits(router, '/doctor/rollback/plan'), 1)
    buttonOf(panel.tree, '确认回滚').props.onClick()
    await panel.done()
    assert.deepEqual(exec.rb, ['T-RB'], 'execute 必须带 plan.token 打 rollback 端点')
    assert.equal(exec.fix.length, 0, '不得串到修正端点')
    assert.equal(countHits(router, '/snapshot-restore/execute'), 0, '不得落三目兜底')
    assert.ok(text(panel.tree).includes('回滚完成'), '完成态文案须按 rollback 取（恒取末支即错）')
  } finally { panel.dispose() }
})

test('快照恢复通路：端点今天恰好落对（兜底位），但"变化预览"屏同样恒不渲染 ⇒ 预览行必须出', async () => {
  const { router, panel, exec } = await openConsole()
  try {
    buttonOf(panel.tree, '恢复').props.onClick()
    await panel.done()
    assert.equal(countHits(router, '/snapshot-restore/plan'), 1)
    const shown = text(panel.tree)
    assert.ok(shown.includes('变化预览'), '"变化预览"屏必须渲染（缺 kind 时这屏同样恒不出现）')
    assert.ok(shown.includes('-  old line'), 'diff 行逐条出示')
    buttonOf(panel.tree, '确认恢复').props.onClick()
    await panel.done()
    assert.deepEqual(exec.sn, ['T-SN'], '快照恢复本就落在兜底位，改后仍须精确落此端点')
    assert.equal(exec.fix.length, 0, '对照：修正端点不得被牵连')
    assert.equal(exec.rb.length, 0, '对照：回滚端点不得被牵连')
    assert.ok(text(panel.tree).includes('快照恢复完成'), '完成态文案须按 snapshot 取')
  } finally { panel.dispose() }
})

test('命题分离：三条 execute URL 互不混用，且 kind 未知时不得静默选端点（源码形状钉）', async () => {
  const { panel, router } = await openConsole()
  try {
    // 三条 URL 各点一次，逐次核对"只多了一条、且多在对的位置"
    const before = { fix: 0, rb: 0, sn: 0 }
    buttonOf(panel.tree, '执行').props.onClick(); await panel.done()
    buttonOf(panel.tree, '确认修正').props.onClick(); await panel.done()
    assert.equal(countHits(router, '/doctor/apply/execute'), before.fix + 1)
    assert.equal(countHits(router, '/doctor/rollback/execute'), 0)
    assert.equal(countHits(router, '/snapshot-restore/execute'), 0)
  } finally { panel.dispose() }

  // 反向的形状钉：兜底分支不得再是"静默选一个端点"。
  // 摘掉 fail-closed（改回三目末支直接打 snapshot-restore）⇒ 本断言翻红。
  const src = readFileSync(join(root, 'panel', 'client', 'index.js'), 'utf8')
  const region = /var confirmDlg = react\.useCallback\([\s\S]*?await fetch\(execUrl/.exec(src)
  assert.ok(region, 'confirmDlg 里"选端点 → 发请求"这段必须仍在（改名即提示本钉要跟着挪，不许静默失守）')
  const body = region[0]
  const guardAt = body.search(/if\s*\(\s*!dlg\.kind/)
  assert.ok(guardAt >= 0, 'kind 未知须有显式本地拦截（不许只靠端点表恰好落空）')
  assert.ok(guardAt < body.search(/await fetch\(execUrl/), '拦截必须发生在发请求**之前**——否则未知 kind 仍会打到某个端点')
  assert.ok(!/dlg\.kind === "fix" \?/.test(body), '旧的三目式端点选择不得回来（末支静默兜底正是原缺陷）')
})
