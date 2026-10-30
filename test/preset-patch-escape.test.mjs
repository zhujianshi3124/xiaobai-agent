// R2 · 预设补丁脚本的 Windows 路径转义守卫（落差条目 F-44 / 计划 §2 高危③）
//
// 钉死三件事：
//  ① `ROW_NEW` 的 agentMemoryRoot 行**求值之后**必须是带真反斜杠的 Windows 路径 ——
//     单反斜杠形态里 `\U` `\.` 是 JS 的未知转义，求值会把反斜杠整个吞掉，
//     实际写进预设的是 `C:Users<用户>.agent-memory`（一条不存在的路径）；
//  ② `OLD_ROW_V2` 同理，且两行各自独立成案 —— 只坏一处时只有对应那条翻红（命题分离，
//     变异自检才有靶子）；
//  ③ 全脚本 agentMemoryRoot 真源**恰一处**（AGENT_MEMORY_ROOT）—— 多出一处即说明又有路径副本在漂移。
//
// 2026-10-29 开源清理批改写：原先两行各持一份硬编码家根字面量（`C:\Users\<作者>\.agent-memory`），
// 清理后改为单一真源 AGENT_MEMORY_ROOT＝join(homedir(), '.agent-memory')，路径字面量不再存在，
// 于是"单反斜杠转义被求值吞掉"这条缺陷形态在结构上消失——①②从"解字面量真值"改为
// "钉住两行都取自同一真源"，③从"字面量恰两处"改为"真源恰一处"，并补一条 F-44 复发钉
// （脚本内出现硬编码家根字面量即红）。**"求值后是真反斜杠路径"的端到端证据**由
// test/preset-patch-020.test.mjs 承担（真跑脚本副本，断言写进预设的就是 join(homedir(),'.agent-memory')），
// 那里是运行时文本，转义坏掉必红。
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

function blockOf(constName) {
  const start = SOURCE.indexOf('const ' + constName + ' = [')
  assert.ok(start >= 0, `脚本里找不到 \`const ${constName} = [\` —— 结构变了，本守卫须同步改写`)
  const end = SOURCE.indexOf('].join(', start)
  assert.ok(end > start, `\`const ${constName}\` 的 \`].join(\` 收尾结构不见了 —— 同上`)
  return SOURCE.slice(start, end)
}

// 块内 agentMemoryRoot 行（必须恰好一行）：返回该行原文，供结构断言。
function agentMemoryRootLine(constName) {
  const hits = blockOf(constName).split('\n').filter((l) => l.includes('agentMemoryRoot:'))
  assert.equal(hits.length, 1, `${constName}: agentMemoryRoot 行应恰 1 处，实到 ${hits.length} 处`)
  return hits[0].trim()
}

// 单值来源：AGENT_MEMORY_ROOT 的定义行（开源清理批后，路径只剩这一处真源）。
const SOURCE_OF_TRUTH = (() => {
  const hits = SOURCE.split('\n').filter((l) => /^const AGENT_MEMORY_ROOT = /.test(l))
  assert.equal(hits.length, 1, `脚本里 AGENT_MEMORY_ROOT 定义应恰 1 处，实到 ${hits.length} 处`)
  return hits[0]
})()

test('R2 · ROW_NEW 的 agentMemoryRoot 行取自单一真源（块内无第二份路径副本）', () => {
  assert.equal(agentMemoryRootLine('ROW_NEW'), '"        agentMemoryRoot: " + AGENT_MEMORY_ROOT,')
})

test('R2 · OLD_ROW_V2 的 agentMemoryRoot 行取自同一真源（两行各自独立成案）', () => {
  assert.equal(agentMemoryRootLine('OLD_ROW_V2'), '"        agentMemoryRoot: " + AGENT_MEMORY_ROOT,')
})

test('R2 · 真源按 homedir() 推导、含 env 逃生口，且脚本内零硬编码家根字面量', () => {
  assert.match(SOURCE_OF_TRUTH, /process\.env\.AGENT_MEMORY_ROOT \?\?/, 'env 逃生口在场')
  assert.match(SOURCE_OF_TRUTH, /join\(homedir\(\), "\.agent-memory"\)/, '缺省值按 homedir() 推导')
  // F-44 复发钉：路径值不得再以字面量形态出现在 agentMemoryRoot 行里（只允许拼 AGENT_MEMORY_ROOT）。
  // 只看"值位置"，不看注释——注释里讲这条缺陷史是允许的。
  assert.doesNotMatch(SOURCE, /"\s*agentMemoryRoot:\s*[A-Za-z]:/, 'agentMemoryRoot 行不得硬编码盘符路径')
})
