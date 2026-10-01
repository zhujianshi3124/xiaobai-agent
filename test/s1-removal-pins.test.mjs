// S1 剔除批（C1-007 G1/G2(b)/G3）· 出包负向钉两枚（G3 行为钉在 test/search-router.test.mjs）
// 钉①：registry/登记面四卡——PLUGINS 无 web-search-local、DEPENDENCIES 清空（机制保留）。
// 钉②：出包面词面清零——文档守卫（门禁第 6 步）管 md 引用存在性；本钉管**活跃词面**：
//       patch/manifest/exports/signals/client/兜底页不得再含 web-search-local / local-multi /
//       local-fetch / @gausszhou 字样；lib 目录已出包；G2(b)/G3 的位常量与警示文案在场。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { PLUGINS, DEPENDENCIES } from '../panel/manager/plugin-registry.mjs'

const root = join(import.meta.dirname, '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')

test('S1钉① 登记面四卡：PLUGINS 无 web-search-local 且 DEPENDENCIES 清空', () => {
  assert.ok(!('web-search-local' in PLUGINS), '登记表不得再有 web-search-local')
  assert.deepEqual(
    Object.keys(PLUGINS).sort(),
    ['agent-memory', 'compact-router', 'rate-throttle', 'search-router'],
    '登记面恰为四卡（S1 剔除批 5→4）',
  )
  assert.deepEqual(DEPENDENCIES, [], '依赖登记清空（declaredDependents 机制保留待用）')
})

test('S1钉② 出包面词面清零：patch/manifest/exports/signals/client 无残留词面', () => {
  for (const rel of [
    'cordis.patch.yml',
    'dsh.plugin.json',
    'package.json',
    'doctor-signals.json',
    'panel/client/index.js',
    'panel/client/panel.html',
  ]) {
    const raw = read(rel)
    // patch 头注的滚存台账按"历史照录"口径允许提及被剔件名（p22-verify 注释行跳过格以此为前提）——
    // 本钉只断言**非注释行**（# 开头）无词面；其余文件（JSON/JS/HTML）整文断言。
    const t = rel === 'cordis.patch.yml'
      ? raw.split(/\r?\n/).filter((l) => !/^\s*#/.test(l)).join('\n')
      : raw
    assert.ok(!t.includes('web-search-local'), rel + ' 非注释面不得再含 web-search-local 词面')
    assert.ok(!t.includes('local-multi') && !t.includes('local-fetch'), rel + ' 非注释面不得再含被剔 provider id 词面')
    assert.ok(!t.includes('@gausszhou'), rel + ' 不得再含 upstream 署名（出处归 upstream 自述）')
  }
  assert.ok(!existsSync(join(root, 'lib', 'web-search-local')), 'lib/web-search-local 目录已出包')
  // G2(b)：本地搜索位常量保留（位在、实现可缺席）；G3：缺席回落＋警示文案在场。
  const sr = read('lib/search-router/index.js')
  assert.match(sr, /DELEGATE_LOCAL = "local-multi"/, 'G2(b)：本地搜索位常量保留')
  assert.match(sr, /本地搜索未配置/, 'G3：缺席警示文案在场')
})
