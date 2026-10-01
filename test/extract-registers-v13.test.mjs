// v1.3 扩槽 · 提供面归一提取的双读行为（S3 / debt C-3 一.2／F-87）
//
// extractRegisters 是"注册冲突检查"与"面板技术详情"的唯一取数源（改名批单源化），
// 本批它随 provides 扩槽同族加两名：`inject`／`tools`。这里钉的是**取数优先级行为**，
// 与 test/provides-data.test.mjs（钉盘上清单的数据 1:1）分属两面。
//
// 口径纪律（与 C-3 一.2 原文随行）：
// - 逐槽 provides 优先、缺席回落 legacy `requirements.registers.*`，`Array.isArray` 即视为
//   "已声明"（空数组遮蔽 legacy）——这条判据与 services/commands/providers 三旧槽逐字同源，
//   新槽不另开一套（doctor 仓 engine.mjs 的撞名收集格同口径，见其 F-62 注）。
// - `tools` 只是**声明面**：宿主运行时是否真把该 tool 装配进模型可见面未证，本仓类型面也
//   没有 tools 服务（该面只在宿主 bundle、仓外）⇒ 本函数不校验取值、不探测装配，只搬运声明。
// - `entry` 不属注册面（它是入口解析位，见 loader 的 resolveEntry ⓪ 级）⇒ 单独在场时
//   extractRegisters 必须产出 undefined，不得把它当成一槽而"发明"出提供面对象。
import test from 'node:test'
import assert from 'node:assert/strict'

import { extractRegisters } from '../registry/dist/loader.js'

const legacyOnly = (registers) => ({ requirements: { registers } })

test('v1.3·inject/tools 逐槽 provides 优先（两侧不同值时取新正典）', () => {
  const m = {
    provides: { inject: ['webServer'], tools: ['real_tool'] },
    requirements: { registers: { inject: ['staleLegacy'], tools: ['staleTool'] } },
  }
  assert.deepEqual(extractRegisters(m), { inject: ['webServer'], tools: ['real_tool'] })
})

test('v1.3·provides 缺席时回落 legacy registers.inject / registers.tools（迁移期行为）', () => {
  const m = legacyOnly({ inject: ['llm', 'tokenMeter'], tools: ['legacy_tool'], services: ['compaction'] })
  assert.deepEqual(extractRegisters(m), {
    services: ['compaction'],
    inject: ['llm', 'tokenMeter'],
    tools: ['legacy_tool'],
  })
})

test('v1.3·空数组＝已声明为空，遮蔽 legacy（与三旧槽 Array.isArray 判据同口径）', () => {
  const m = {
    provides: { inject: [], tools: [] },
    requirements: { registers: { inject: ['webServer'], tools: ['hidden_by_declaration'] } },
  }
  assert.deepEqual(extractRegisters(m), { inject: [], tools: [] },
    '空数组不得被当作"没声明"而回落 legacy（否则删声明与声明为空两事混淆）')
})

test('v1.3·五槽皆无 ⇒ undefined（不发明提供面）；仅 entry 在场同样不产出注册面', () => {
  assert.equal(extractRegisters(undefined), undefined)
  assert.equal(extractRegisters({}), undefined)
  assert.equal(extractRegisters({ provides: { entry: './index.js' } }), undefined,
    'entry 是入口解析位，不是注册面的一槽')
  assert.equal(extractRegisters(legacyOnly({ events: ['agent/request'] })), undefined,
    'events 留 legacy 订阅面，扩槽后仍不进提供面')
})

test('v1.3 回归钉：三旧槽的取值与优先级零翻面（services/commands/providers 逐槽不变）', () => {
  const m = {
    provides: { services: ['registry'], commands: ['c1'] },
    requirements: { registers: { services: ['stale'], providers: ['p1'] } },
  }
  assert.deepEqual(extractRegisters(m), { services: ['registry'], commands: ['c1'], providers: ['p1'] })
})
