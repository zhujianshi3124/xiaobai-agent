import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// ── S2.5 合并批：doctor CLI 并桶后的"独立可用"实证钉（C1-007 用户终裁）────────────
// 终裁原文（节录）："doctor 作为桶里的质检工具并进去；并且并进去之后，doctor 必须仍然可以
// 单独拿去用——就像 dsh-web-all 里的每个插件都能单独拿出来用一样，桶只是分发形式。"
// 本文件钉四格：成员四件在场＋零依赖、CLI 真跑（对桶根 dry-run 0/0/0）、整体抠出单独运行、
// 独立入口三件（bin/exports/files）接线正确。

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const CLI = path.join(ROOT, 'doctor', 'cli', 'src', 'cli.mjs')

test('S2.5-1: doctor CLI 成员四件在场且零 npm 依赖（import 自洽）', async () => {
  for (const f of ['cli.mjs', 'engine.mjs', 'executor.mjs', 'host-faces.json']) {
    assert.equal(fs.existsSync(path.join(ROOT, 'doctor', 'cli', 'src', f)), true, 'doctor/cli/src/' + f)
  }
  // engine 零依赖自证：动态 import 成功即全链 import 解析通过（node: 前缀之外零外部说明符）
  const eng = await import(pathToFileURL0(path.join(ROOT, 'doctor', 'cli', 'src', 'engine.mjs')))
  assert.equal(typeof eng.runDoctor, 'function', 'engine.runDoctor 导出在场')
})

test('S2.5-2: 桶内 CLI 真跑 —— 对桶根 dry-run 0/0/0（exit 0）', () => {
  const out = execFileSync(process.execPath, [CLI, '--json', '--scope', ROOT], {
    encoding: 'utf8', maxBuffer: 1 << 26,
  })
  const j = JSON.parse(out)
  const s = j.summary
  assert.equal(`${s.error}/${s.warning}/${s.info}`, '0/0/0', 'dry-run 须 0/0/0：' + JSON.stringify(s))
})

test('S2.5-3: 整体抠出单独运行 —— doctor/cli/src 四件拷至临时目录后 CLI 可用（桶只是分发形式）', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-doctor-extract-'))
  try {
    const dst = path.join(tmp, 'extracted')
    fs.mkdirSync(dst, { recursive: true })
    for (const f of ['cli.mjs', 'engine.mjs', 'executor.mjs', 'host-faces.json']) {
      fs.copyFileSync(path.join(ROOT, 'doctor', 'cli', 'src', f), path.join(dst, f))
    }
    const out = execFileSync(process.execPath, [path.join(dst, 'cli.mjs'), '--json', '--scope', ROOT], {
      encoding: 'utf8', maxBuffer: 1 << 26,
    })
    const j = JSON.parse(out)
    const s = j.summary
    assert.equal(`${s.error}/${s.warning}/${s.info}`, '0/0/0', '抠出后 dry-run 仍 0/0/0：' + JSON.stringify(s))
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
})

test('S2.5-4: 独立入口三件接线 —— bin/exports/files（含 signals 随包、test 不随包）', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  assert.equal(pkg.bin['dsh-doctor'], './doctor/cli/src/cli.mjs', 'bin 命令 dsh-doctor')
  assert.equal(fs.existsSync(path.join(ROOT, pkg.bin['dsh-doctor'])), true, 'bin 目标在场')
  assert.equal(pkg.exports['./doctor/cli'], './doctor/cli/src/cli.mjs', 'exports 子路径 ./doctor/cli')
  assert.ok(pkg.files.includes('doctor-signals.json'), 'files 含 doctor-signals.json（engine 协议文件随包）')
  assert.ok(pkg.files.includes('!doctor/cli/selftest'), 'files 排除 doctor/cli/test（G6 同口径）')
  assert.equal(pkg.version, '1.3.0', 'doctor 成员随桶版本（一个版本号管全部）')
  assert.equal(fs.existsSync(path.join(ROOT, 'doctor', 'README.md')), true, 'doctor 成员 README 在场')
})

function pathToFileURL0(p) {
  return 'file:///' + p.replace(/\\/g, '/').replace(/^\//, '')
}
