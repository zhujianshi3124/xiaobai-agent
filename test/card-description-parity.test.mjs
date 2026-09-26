// W2 余件 · 卡片静态描述落差族（清单 :198 compact-router 描述未提三模式 / :221 rate-throttle
// 描述只说默认关闭那半）——两通道描述表逐字对齐钉＋能力词格＋未动条目快照反向钉。
//
// 复算（2026-09-26，依功能全量清单在案区）：compact-router 压缩三模式 auto／llm／instant
// （/compact-mode 可切换）；rate-throttle 主功能＝自动换路／冷却／降档（默认开）＋主动节流
// （默认关）。旧描述各只说一半 ⇒ 本笔翻正两卡文案（client/index.js 与 client/panel.html
// 双通道同笔同文），其余三卡描述不动（快照反向钉）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')

// 两通道都是 `var DESCRIPTIONS = { "dir": "文案", ... };` 形态，按块解析成键值表。
function parseDescriptions(rel) {
  const src = readFileSync(join(root, rel), 'utf8')
  const start = src.indexOf('var DESCRIPTIONS = {')
  assert.ok(start >= 0, rel + ' 必须含 DESCRIPTIONS 表（锚与真代码形态共振）')
  const end = src.indexOf('};', start)
  const block = src.slice(start, end)
  const out = {}
  const re = /"([a-z-]+)":\s*"([^"]*)"/g
  let m
  while ((m = re.exec(block))) out[m[1]] = m[2]
  assert.ok(Object.keys(out).length >= 5, rel + ' 描述表应解析出 5 卡: ' + JSON.stringify(Object.keys(out)))
  return out
}

const reactDesc = parseDescriptions('panel/client/index.js')
const htmlDesc = parseDescriptions('panel/client/panel.html')

test('描述落差族 · 两通道 DESCRIPTIONS 逐字一致（React bundle 与兜底页同源）', () => {
  assert.deepEqual(reactDesc, htmlDesc)
})

test('描述落差族 · compact-router 描述点名三模式（auto/llm/instant 白话三档·双通道各探）', () => {
  for (const [ch, table] of [['react', reactDesc], ['html', htmlDesc]]) {
    const d = table['compact-router']
    assert.ok(d.includes('自动'), ch + ' 三模式之一「自动」: ' + d)
    assert.ok(d.includes('LLM 摘要'), ch + ' 三模式之二「LLM 摘要」: ' + d)
    assert.ok(d.includes('即时抽取'), ch + ' 三模式之三「即时抽取」: ' + d)
  }
})

test('描述落差族 · rate-throttle 描述两半齐：主功能（换路/冷却/降档）＋默认关的限速开关（双通道各探）', () => {
  for (const [ch, table] of [['react', reactDesc], ['html', htmlDesc]]) {
    const d = table['rate-throttle']
    assert.ok(d.includes('换路'), ch + ' 主功能「换路」: ' + d)
    assert.ok(d.includes('冷却'), ch + ' 主功能「冷却」: ' + d)
    assert.ok(d.includes('降档'), ch + ' 主功能「降档」: ' + d)
    assert.ok(d.includes('默认关闭'), ch + ' 限速开关默认关闭那半: ' + d)
  }
})

test('描述落差族 · 反向钉：其余三卡描述不被本批翻动（快照逐字·双通道）', () => {
  for (const table of [reactDesc, htmlDesc]) {
    assert.equal(table['agent-memory'], '记住你说过的话和项目里的重要信息，下次对话还能用上。')
    assert.equal(table['search-router'], '决定每次联网搜索走哪条路：官方搜索还是本地搜索。')
    assert.equal(table['web-search-local'], '提供不依赖官方接口的本地搜索引擎，可自选搜索源。')
  }
})
