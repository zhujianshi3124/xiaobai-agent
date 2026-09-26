// W2 余件 F-78 · v2 配置表单 draft 形态防翻面钉（复算判"不复现"，照 F-71 先例钉行为不修码）
//
// 复算（2026-09-26）：清单原判"draft 以扁平 path 为键，v2RenderField 回传嵌套对象，嵌套
// schema 下可同屏"（代理推断，未实测）——本会话复算**推翻**：扁平 path 键的 draft 属
// rate-throttle patch 域 ConfigEditor（editValues[f.path]，:665），嵌套对象形态的 draft 属
// v2 RegistryPluginCard（:1975 setDraft(v)，v 为整根嵌套对象），两者分属互斥渲染面、
// 各有独立 state、全仓无共享写入点 ⇒ "同一 draft 被两种形态写入而同屏"的前提不成立。
// 本钉把"嵌套 schema 编辑→保存载荷"的正确形态钉死防翻面：编辑嵌套叶子后保存，
// /config 载荷必须是**纯嵌套对象**（零扁平点键）且含编辑值（T0 修复语义：draft 生效）。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  baseRoutes, buttonOf, flush, makeRouter, mountUnifiedPanel,
  text, v2SnapshotPayload, v2Entry,
} from './helpers/panel-client-harness.mjs'
import { findAll } from './helpers/panel-client-harness.mjs'

const SCHEMA = {
  type: 'object',
  dict: {
    a: { type: 'string' },
    sub: { type: 'object', dict: { b: { type: 'number' } } },
  },
}

test('F-78 · 嵌套 schema 编辑叶子 → 保存载荷为纯嵌套形态且编辑生效（防翻面）', async () => {
  const router = makeRouter()
  baseRoutes(router)
  let savedBody = null
  router.routes.push(
    {
      match: '/api/toolkit-panel/v2/snapshot',
      handler: () => ({
        status: 200,
        json: async () => v2SnapshotPayload([v2Entry('f78-probe', { config: { a: 'x', sub: { b: 1 } }, configSchemaJSON: SCHEMA })]),
      }),
    },
    {
      match: '/api/toolkit-panel/v2/config',
      handler: (body) => {
        savedBody = body
        return { status: 200, json: async () => ({ ok: true }) }
      },
    },
  )
  const panel = mountUnifiedPanel({ router })
  try {
    await panel.done()

    // 打开配置表单
    const cfgBtn = buttonOf(panel.tree, '配置')
    assert.ok(cfgBtn, 'v2 卡上必须有「配置」按钮')
    cfgBtn.props.onClick()
    await flush(6)
    assert.ok(text(panel.tree).includes('保存配置（写回 registry）'), '表单应已展开')

    // 编辑嵌套叶子 sub.b（本 schema 唯一 number 输入框）1 → 2
    const numInputs = findAll(panel.tree, (n) => n.type === 'input' && n.props && n.props.type === 'number')
    assert.equal(numInputs.length, 1, '嵌套 schema 应渲染出恰一个 number 输入框')
    numInputs[0].props.onChange({ target: { value: '2' } })
    await flush(6)

    // 保存
    const saveBtn = buttonOf(panel.tree, '保存配置（写回 registry）')
    assert.ok(saveBtn, '保存按钮必须在')
    saveBtn.props.onClick()
    await flush(10)

    // 载荷断言：纯嵌套、无扁平点键、编辑值生效（T0 语义：draft 覆盖 p.config）
    assert.ok(savedBody, '/config 应已发出')
    assert.equal(savedBody.id, 'f78-probe')
    assert.deepEqual(savedBody.config, { a: 'x', sub: { b: 2 } })
    for (const key of Object.keys(savedBody.config)) {
      assert.ok(!key.includes('.'), '载荷顶层不得出现扁平点键: ' + key)
    }
  } finally {
    panel.dispose()
  }
})
