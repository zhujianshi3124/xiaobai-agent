#!/usr/bin/env node
// p27-governance-report-verify —— 债 7 治理报告用户可见通道的专项验证。
//
// 被测对象是 node --test 形态的测试文件（test/panel-governance-report.test.mjs，10 条用例）。
// 回归链只吃「一行结果行」⇒ 本脚本跑它、解析 ℹ pass / ℹ fail、归一出 RESULT 行。
//
// 三层，缺一层都不算验完：
//   ① 前置：被跑对象在场（先断言锚点存在，再断言结果）
//   ② 实跑：execFileSync(process.execPath, ['--test', …])，解析 ℹ pass / ℹ fail 计数
//   ③ 零写入自证：非注释源码里无任何写盘调用，子进程只走 execFileSync
//
// ── 本项目踩过的坑，本脚本按纪律逐条防 ──────────────────────────────────
// 坑 14「断言锚点不先验证」：先 check 测试文件在场，不存在即 FAIL + exit 1，不进入解析段。
// 坑 19 的口径：本脚本自身零写入——判据是跑完 git status 不新增任何条目（③ 自证）。
//
// 用法：node scripts/p27-governance-report-verify.mjs
// 纪律：本脚本不写任何文件；被测测试文件自身全程走 mkdtemp，真实仓 .toolkit-governance/ 零触碰。

import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const TEST_REL = 'test/panel-governance-report.test.mjs'
const TEST_ABS = join(root, TEST_REL)
const EXPECTED = 10

let checksPassed = 0
const fails = []
function check(name, ok, detail = '') {
  if (ok) { checksPassed++; console.log('PASS ' + name) }
  else { fails.push(name + ' — ' + detail); console.log('FAIL ' + name + ' — ' + detail) }
}

// ══════════════════════════════════════════════════════════════════════════
// ① 前置：被跑对象在场（坑 14：先断言锚点，再断言结果）
// ══════════════════════════════════════════════════════════════════════════
console.log('── ① 前置 ──')
check('1.1 测试文件在场：' + TEST_REL, existsSync(TEST_ABS), TEST_ABS)
if (!existsSync(TEST_ABS)) {
  console.log('FAIL 1.1 被测测试文件不存在，不进入实跑段')
  console.log('RESULT: 0/' + EXPECTED + ' PASS, ' + (fails.length + 1) + ' FAIL')
  for (const f of fails) console.log('  ✖ ' + f)
  process.exit(1)
}

// ══════════════════════════════════════════════════════════════════════════
// ② 零写入自证：本脚本自身（非注释源码）无写盘能力
// ══════════════════════════════════════════════════════════════════════════
// 判据：跑完 git status 不新增任何条目。下面两条是把该判据钉在源码层面——
// 源码没有写盘调用 ⇒ 运行期无论走哪条分支都不可能落盘。
console.log('── ② 零写入自证 ──')
{
  const selfSrc = readFileSync(join(root, 'scripts', 'p27-governance-report-verify.mjs'), 'utf8')
  const code = selfSrc.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  check('2.1 非注释源码无写盘调用', !/\b(writeFileSync|appendFileSync|writeFile|appendFile|createWriteStream|mkdirSync|mkdtempSync|rmSync|rmdirSync|unlinkSync|copyFileSync|cpSync|renameSync|truncateSync|openSync)\s*\(/.test(code), '出现写盘类调用')
  const fsImport = (code.match(/import\s*\{([^}]+)\}\s*from\s*'node:fs'/) || [])[1] || ''
  const members = fsImport.split(',').map((s) => s.trim()).filter(Boolean)
  check('2.2 node:fs 只取只读成员', members.length > 0 && members.every((m) => ['existsSync', 'readFileSync'].includes(m)), JSON.stringify(members))
  check('2.3 子进程只走 execFileSync', /execFileSync\s*\(/.test(code) && !/\b(spawnSync|spawn|execSync|exec)\s*\(/.test(code), '出现别的子进程调用')
}

// ══════════════════════════════════════════════════════════════════════════
// ③ 实跑：node --test 单测文件，解析计数
// ══════════════════════════════════════════════════════════════════════════
console.log('── ③ 实跑 ──')
let out = ''
let code = 0
try {
  out = execFileSync(process.execPath, ['--test', TEST_REL], { cwd: root, maxBuffer: 1 << 26, encoding: 'utf8' })
} catch (e) {
  out = String(e.stdout || '') + String(e.stderr || '')
  code = e.status ?? 1
}

const passM = out.match(/ℹ pass (\d+)/)
const failM = out.match(/ℹ fail (\d+)/)
check('3.1 输出含 ℹ pass 计数', passM !== null, '未解析到 ℹ pass')
check('3.2 输出含 ℹ fail 计数', failM !== null, '未解析到 ℹ fail')
const passN = passM ? Number(passM[1]) : 0
const failN = failM ? Number(failM[1]) : 1
check('3.3 用例总数 = ' + EXPECTED, passN + failN === EXPECTED, 'pass=' + passN + ' fail=' + failN)
check('3.4 退出码与 fail 计数一致', (failN === 0) === (code === 0), 'exit=' + code + ' fail=' + failN)

// 失败用例名：spec reporter 的 ✖ 行（去掉表头与耗时尾巴）
const failNames = []
for (const line of out.split(/\r?\n/)) {
  const m = line.match(/^\s*✖\s+(.+)$/)
  if (!m) continue
  const name = m[1].replace(/\s*\(\d+(\.\d+)?ms\)\s*$/, '').trim()
  if (name === 'failing tests:') continue
  if (name && !failNames.includes(name)) failNames.push(name)
}
check('3.5 fail=0 时无 ✖ 行 / fail>0 时 ✖ 名可列', failN === 0 ? failNames.length === 0 : failNames.length >= failN, '✖=' + failNames.length + ' fail=' + failN)

// ══════════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60))
const allOk = fails.length === 0 && failN === 0 && passN === EXPECTED && code === 0
if (allOk) {
  console.log('RESULT: ' + passN + '/' + EXPECTED + ' PASS')
  process.exit(0)
} else {
  console.log('RESULT: ' + passN + '/' + EXPECTED + ' PASS, ' + (failN || fails.length) + ' FAIL')
  for (const n of failNames) console.log('  ✖ ' + n)
  for (const f of fails) console.log('  ✖ ' + f)
  process.exit(1)
}
