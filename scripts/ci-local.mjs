#!/usr/bin/env node
// 本机 CI 门禁（债务 #5 的可执行部分）：一条命令跑完全链，单一退出码。
//
// 为什么不是"只放一个 .github/workflows"：本仓**没有 git 远端**，且依赖 @deepseek-ai/* 私有源
// （cordis / dsh-web / dsh-settings / dsh-compaction-basic）——公共 runner 上 `npm ci` 直接装不出来。
// 所以正本门禁必须在本机跑；`.github/workflows/ci.yml` 只是给"能取到私有源的 self-hosted runner"
// 预留的结构，**未在本环境执行过**（如实申报，见 workflows 文件头注）。
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
  ['回归全跑（13 专项脚本 + node --test）', process.execPath, [resolve(ROOT, 'scripts/regression-all.mjs')]],
  ['doctor 真实仓 dry-run 必须 0/0/0', process.execPath, [DOCTOR_CLI, '--scope', ROOT]],
  // I1（债务 D-16）：patch 行的 config 按**宿主通道语义**校验——真 YAML 标量解析 + unwrap + Config。
  // 这一环在 H5 之前是缺的，于是 cordis.patch.yml:61 一个未加引号的 360 让宿主整机起不来，
  // 而仓内 293/293 全绿。脚本自带 --selfcheck（解析器语义 20 条断言），见该文件头注。
  ['patch 行配置校验（宿主通道语义，含真 YAML 标量解析）', process.execPath, [resolve(ROOT, 'scripts/patch-config-check.mjs')]],
]
if (withScan) steps.push(['p23-verify（regression-all 未含）', process.execPath, [resolve(ROOT, 'scripts/p23-verify.mjs')]])

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
