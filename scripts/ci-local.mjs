#!/usr/bin/env node
// 本机 CI 门禁（债务 #5 的可执行部分）：一条命令跑完全链，单一退出码。
//
// 为什么不是"只放一个 .github/workflows"：本仓**没有 git 远端**，且门禁依赖本机 doctor CLI
// 绝对路径（DOCTOR_CLI）与 Windows 宿主面。@deepseek-ai/* 依赖自 S2 正名批（G8）起全部经
// 公共 registry 解析（lock 全 resolved、npm ci 实证可复装）——历史"私有源装不出来"陈述已过时废止。
// 所以正本门禁仍在本机跑；`.github/workflows/ci.yml` 只是远端 runner 的预留结构，
// **未在本环境执行过**（如实申报，见 workflows 文件头注）。
//
// 用法：node scripts/ci-local.mjs [--with-scan]
//   默认跑：build×3 + pluggable-lint + no-subplugin-import-check + typecheck×3 + node --test
//         + 回归全跑 14 项 + 真实仓 doctor dry-run（须 0/0/0）+ patch 行配置校验（I1 / D-16）
//   --with-scan：追加 p23-verify（不在 regression-all 清单里的两项之一）
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DOCTOR_CLI = process.env.DOCTOR_CLI || 'D:/dsh-test-sandbox/projects/doctor/src/cli.mjs'
const withScan = process.argv.includes('--with-scan')

const steps = [
  ['npm test（build×3 + lint + 零子插件引用守卫 + typecheck×3 + node --test）', 'npm', ['test', '--prefix', ROOT]],
  ['回归全跑（14 专项脚本 + node --test）', process.execPath, [resolve(ROOT, 'scripts/regression-all.mjs')]],
  ['doctor 真实仓 dry-run 必须 0/0/0', process.execPath, [DOCTOR_CLI, '--scope', ROOT]],
  // 题 2 裁定的分权边界守卫（契约 v1.1 批 2）：本仓契约与独立 doctor 是两套校验器，
  // "契约管解析行为、doctor 管必填性"最怕静默打脸。裁定条件 a 明写"手动脚本不算守卫"
  // ⇒ 作为独立一步每轮复跑（摘掉它 ⇒ 门禁步数可查，这是批 2 变异第三发的抓手）。
  ['DOCTOR_CLI ↔ 契约行为对账（根必填撤销后的在场/缺席分权 + provides 接缝 + 重叠面逐规则/键集对账）', process.execPath, [resolve(ROOT, 'scripts/doctor-cli-contract-parity.mjs')]],
  // I1（债务 D-16）：patch 行的 config 按**宿主通道语义**校验——真 YAML 标量解析 + unwrap + Config。
  // 这一环在 H5 之前是缺的，于是 cordis.patch.yml:61 一个未加引号的 360 让宿主整机起不来，
  // 而仓内 293/293 全绿。脚本自带 --selfcheck（解析器语义 20 条断言），见该文件头注。
  ['patch 行配置校验（宿主通道语义，含真 YAML 标量解析）', process.execPath, [resolve(ROOT, 'scripts/patch-config-check.mjs')]],
]
// D-3 修法后 p23-verify 已入 regression-all 本体（第 2 步，见 scripts/regression-all.mjs 清单第 8 项）；
// 本步原是"防有人从 regression-all 摘掉 p23-verify"的双跑冗余守卫，脚本头注早写明"摘除/重整随收口批
// 门禁 6→7 定"。收口批（EXE-BOOT-014）按 012 施工图 §六 摘除：**--with-scan 步数 7→6**（默认链 5 步不变），
// 显式记录两次步数变化（dc00a34 建 C-1 守卫步＝6→7；本笔摘双跑＝7→6）。覆盖面不减的两条依据：
// ① p23-verify 的调用位在 regression-all 清单里，该清单另有"清单 vs 脚本文件"的守卫（D-3 笔已落），
//    日后从清单摘除会当场翻红，不需要再靠双跑兜；② 摘除笔自身的门禁全链读数须证明 p23 仍被跑到（本批判末实档）。
// 文档引用守卫（D-20/C-1）自此是 --with-scan 链的第 6 步（末位）。
// 收口批 C-1（D-20）：文档引用守卫——docs/*.md 与 panel/docs/evidence/*.md 的 path[:#]anchor
// 引用存在性＋#符号可 grep＋行号形态判红（活文档）。守卫上岗首日抓存量失效＝本职，红集即
// D-20 存量清理清单（§9.6：步数 6→7 并被显式记录）。
if (withScan) steps.push(['文档引用守卫（D-20/C-1：引用存在性＋行号形态判红）', process.execPath, [resolve(ROOT, 'scripts/doc-ref-guard.mjs')]])

let bad = 0
const started = Date.now()
console.log('════════════════════════════════════════════════════════')
console.log('本机 CI 门禁  ' + new Date().toISOString() + (withScan ? '  (+scan)' : ''))
console.log('════════════════════════════════════════════════════════')
for (const [label, cmd, args] of steps) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26, shell: cmd === 'npm' })
  const out = String(r.stdout || '') + String(r.stderr || '')
  const ok = r.status === 0
  // doctor dry-run 额外判一次数字（CLI 退出码 0 只代表"跑完了"，不代表 0/0/0）
  let extra = ''
  if (label.includes('dry-run')) {
    const m = out.match(/issues:\s*(\d+)\s*\(error\s+(\d+),\s*warning\s+(\d+),\s*info\s+(\d+)/)
    if (!m) { bad++; console.log('  ✗ ' + label + '  (无 summary 行)'); continue }
    const [, total, e, w, i] = m
    extra = `issues=${total} (e${e}/w${w}/i${i})`
    if (e !== '0' || w !== '0' || i !== '0') { bad++; console.log('  ✗ ' + label + '  ' + extra); continue }
  }
  if (!ok) bad++
  const tailLine = (out.trim().split(/\r?\n/).filter(Boolean).pop() || '').slice(0, 90)
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (extra ? '  ' + extra : '') + (ok ? '' : '  → ' + tailLine))
  if (!ok) process.stdout.write(out.split(/\r?\n/).slice(-30).join('\n') + '\n')
}
console.log('────────────────────────────────────────────────────')
console.log(bad === 0 ? `全部通过（${((Date.now() - started) / 1000).toFixed(1)}s）` : `存在 ${bad} 项异常`)
process.exit(bad === 0 ? 0 : 1)
