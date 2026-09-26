// W2 余件 · 断点修复批② —— 四卡"改完要重启"提示位
//
// 断点取证（panel/docs/evidence/BREAKPOINT-FORENSICS-20260923.md）：五卡"重载"列恒不可达
// 是设计（patch 域改配置须重启），但用户视角无提示——仅 rate-throttle 的 effectNote 有一句，
// 其余四卡零说明位。本笔＝服务端逐卡下发 effectNote（snapshot.mjs RESTART_EFFECT_NOTE，
// 文案按各卡真实配置来源逐卡给词）＋客户端两渲染支（React EffectNoteRow／兜底页
// effectNoteHtml，editable 卡不双渲染——渲染面钉在 p22-cards-ui）。
//
// 本文件钉服务端权威面（buildSnapshot 真实仓取数，只读）；p22 钉两渲染器呈现面。
// 各卡配置来源复算（2026-09-26）：agent-memory-runtime／web-search-local／web-search-router
// 三行 config 块实测在 cordis.patch.yml；compact-router 无 patch 行、预设托管。
import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { buildSnapshot, buildConfigPanel } from '../panel/manager/snapshot.mjs'

const repoRoot = join(import.meta.dirname, '..')
const FOUR = ['agent-memory', 'compact-router', 'web-search-local', 'search-router']

test('W2-余件 · 四卡提示位：服务端逐卡下发 effectNote 且文案点名真实配置来源', async () => {
  const snap = await buildSnapshot({ toolkitRoot: repoRoot })
  for (const dir of FOUR) {
    const p = snap.plugins.find((x) => x.dir === dir)
    assert.ok(p, dir + ' 卡必须在快照里')
    assert.ok(p.configPanel, dir + ' 必须有 configPanel')
    assert.notEqual(p.configPanel.editable, true, dir + ' 属非可写卡（可写卡的提示位在参数框内，另一支）')
    assert.ok(p.configPanel.effectNote, dir + ' 必须下发 effectNote（提示位本体）')
    assert.ok(
      p.configPanel.effectNote.includes('重启 DSH 才生效'),
      dir + ' 文案必须点出重启边界: ' + p.configPanel.effectNote,
    )
  }
  assert.match(snap.plugins.find((x) => x.dir === 'agent-memory').configPanel.effectNote, /agent-memory-runtime 行/)
  assert.match(snap.plugins.find((x) => x.dir === 'web-search-local').configPanel.effectNote, /web-search-local 行/)
  assert.match(snap.plugins.find((x) => x.dir === 'compact-router').configPanel.effectNote, /预设托管/)
})

test('W2-余件 · search-router 提示位两半：热 JSON 即生效 + patch 重启生效（且被盖住）', async () => {
  const snap = await buildSnapshot({ toolkitRoot: repoRoot })
  const p = snap.plugins.find((x) => x.dir === 'search-router')
  assert.match(p.configPanel.effectNote, /热改即生效（无需重启）/, '热 JSON 半边')
  assert.match(p.configPanel.effectNote, /patch 行改动要重启 DSH 才生效/, 'patch 半边')
  assert.match(p.configPanel.effectNote, /会被它盖住/, '遮蔽关系不得丢（searchRouterModeShadow 顺位事实）')
  // 既有 mode 展示面不受本批牵动
  assert.ok(p.configPanel.mode, 'mode 生效值+来源展示必须在')
  assert.ok(p.configPanel.note.includes('不提供 mode 编辑'), '既有 note 原样保留')
})

test('W2-余件 · 反向钉：rate-throttle 维持可写与自带 effectNote（既有文案不翻动）', async () => {
  const snap = await buildSnapshot({ toolkitRoot: repoRoot })
  const p = snap.plugins.find((x) => x.dir === 'rate-throttle')
  assert.equal(p.configPanel.editable, true)
  assert.ok(
    p.configPanel.effectNote.includes('重启 DSH 后生效'),
    'rate-throttle 既有提示位语义（参数框内那句）原样保留: ' + p.configPanel.effectNote,
  )
})

test('W2-余件 · 严格映射：不在表内的目录不发明文案（缺席如实不下发）', () => {
  const r = buildConfigPanel('some-future-plugin', null, '')
  assert.equal(r.editable, false)
  assert.equal(r.noInternalSwitch, true)
  assert.equal(r.effectNote, undefined, '未知目录不得给通抄文案——真树零发明')
})
