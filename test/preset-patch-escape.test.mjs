// R2 · 预设补丁脚本的 Windows 路径转义守卫（落差条目 F-44 / 计划 §2 高危③）
//
// 钉死三件事：
//  ① `ROW_NEW` 的 agentMemoryRoot 行**求值之后**必须是带真反斜杠的 Windows 路径 ——
//     单反斜杠形态里 `\U` `\.` 是 JS 的未知转义，求值会把反斜杠整个吞掉，
//     实际写进预设的是 `C:UsersLENOVO.agent-memory`（一条不存在的路径）；
//  ② `OLD_ROW_V2` 同理，且两行各自独立成案 —— 只坏一处时只有对应那条翻红（命题分离，
//     变异自检才有靶子）；
//  ③ 全脚本 agentMemoryRoot 字面量**恰两处** —— 多出一处即说明又有第三份路径副本在漂移。
//
// 本文件是纯静态断言：不 import 生产脚本、不 eval、不跑 `--apply` / `--undo`、不碰 `~/.dsh`
// （红线：探针与取证只读）。成因与两处会真写坏的暴露路径见 docs/repair-plan-20260923.md §10.1 R2。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'apply-preset-patch.mjs')
const SOURCE = readFileSync(SCRIPT, 'utf8')

// 期望真值：八个空格缩进 + 单枚真反斜杠（String.raw 保形，别让本文件自己也丢转义）
const EXPECTED_VALUE = String.raw`        agentMemoryRoot: C:\Users\LENOVO\.agent-memory`

function blockOf(constName) {
  const start = SOURCE.indexOf('const ' + constName + ' = [')
  assert.ok(start >= 0, `脚本里找不到 \`const ${constName} = [\` —— 结构变了，本守卫须同步改写`)
  const end = SOURCE.indexOf('].join(', start)
  assert.ok(end > start, `\`const ${constName}\` 的 \`].join(\` 收尾结构不见了 —— 同上`)
  return SOURCE.slice(start, end)
}

// 取块内 agentMemoryRoot 那一行字面量，并解出它的**求值真值**
function evaluatedValue(constName) {
  const block = blockOf(constName)
  const hit = block.match(/"([^"]*agentMemoryRoot:[^"]*)"/)
  if (!hit) assert.fail(`${constName}: 块内没有 agentMemoryRoot 字符串字面量`)
  const raw = hit[1]
  let value
  try {
    // 单反斜杠形态在 JSON 里是非法转义 ⇒ 这里必抛，正是我们要点名报出的缺陷形态
    value = JSON.parse('"' + raw + '"')
  } catch {
    assert.fail(
      `${constName}: 字面量原文逐字为「${raw}」—— 用的是单枚反斜杠转义，` +
      `JS 求值会把反斜杠吞掉（写成 C:UsersLENOVO.agent-memory），必须双写。`,
    )
  }
  return value
}

test('R2 · ROW_NEW 的 agentMemoryRoot 求值后是真反斜杠 Windows 路径', () => {
  assert.equal(evaluatedValue('ROW_NEW'), EXPECTED_VALUE)
})

test('R2 · OLD_ROW_V2 的 agentMemoryRoot 求值后是真反斜杠 Windows 路径', () => {
  assert.equal(evaluatedValue('OLD_ROW_V2'), EXPECTED_VALUE)
})

test('R2 · 全脚本 agentMemoryRoot 字面量恰两处，且两处求值真值一致', () => {
  const all = SOURCE.match(/"[^"]*agentMemoryRoot:[^"]*"/g) || []
  assert.equal(all.length, 2, `agentMemoryRoot 字面量应恰 2 处（ROW_NEW + OLD_ROW_V2），实到 ${all.length} 处`)
  assert.equal(evaluatedValue('ROW_NEW'), evaluatedValue('OLD_ROW_V2'))
})
