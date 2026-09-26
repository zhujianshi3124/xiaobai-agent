// W2 余件 F-23 · archivedExpected 反义字段移除钉（静态源码钉）
//
// 复算（2026-09-26，现 HEAD :648）：`archivedExpected: mode === "true"` 双向反义——
//   mode="true"（销毁式 v2 真卸载）：返 true 而 v2 语义恰是**零副本、不可恢复**（Q2'-a）；
//   mode="soft"：返 false 而软卸载本体保留在 lib/。字段概念整个是"真卸载移入保管区存档"
//   的 v2 前旧思维残留。全仓零消费（客户端两通道零引用、测试零引用——grep 在案）⇒
//   修法＝整字段移除（诚实收口、输出面零消费者）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')

test('F-23 · 服务端 /uninstall/plan 不再下发反义字段 archivedExpected', () => {
  const src = readFileSync(join(root, 'panel', 'index.js'), 'utf8')
  assert.ok(!src.includes('archivedExpected'), '反义字段必须移除（v2 下 true/soft 两向都与实况相反）')
})

test('F-23 · 反向钉：客户端两通道零消费该字段（移除的消费者前提可观测）', () => {
  for (const rel of ['panel/client/index.js', 'panel/client/panel.html']) {
    const src = readFileSync(join(root, rel), 'utf8')
    assert.ok(!src.includes('archivedExpected'), rel + ' 不得消费 archivedExpected')
  }
})
