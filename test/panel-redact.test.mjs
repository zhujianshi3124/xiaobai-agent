// E4 主张2（审核意见 13-§7）验收测试：面板下发面字段级脱敏。
// 覆盖三层：① redact.mjs 单元（凭据形态/本机身份路径/深度遍历）；
// ② buildSoftReceipt（软卸载收据里的备份绝对路径）；
// ③ buildSnapshot（快照级：home 前缀 toolkitRoot → ~，patch 原文里的凭据形态被掩）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { redactSecretText, redactHomePath, redactViewDeep } from '../panel/manager/redact.mjs'
import { buildSoftReceipt, buildSnapshot } from '../panel/manager/snapshot.mjs'

test('redactSecretText：凭据形态掩码（保留前 6 字符），普通文本零改动', () => {
  const samples = [
    ['sk-AbCdEfGhIjKlMnOpQrStUvWx', 'sk-AbC…(redacted)'],
    ['ghp_0123456789abcdefghijklmnopqrstuvwxyz', 'ghp_01…(redacted)'],
    ['github_pat_0123456789abcdefghij_TOKEN', 'github…(redacted)'],
    ['AKIAIOSFODNN7EXAMPLE', 'AKIAIO…(redacted)'],
    // JWT 形态先行命中（Bearer 后的值以 eyJ 开头）⇒ 实际产物是 JWT 掩码接在 Bearer 后
    ['Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMifQ.SflKxwRJSMeKKF2QT4', 'Bearer eyJhbG…(redacted)'],
  ]
  for (const [input, expected] of samples) assert.equal(redactSecretText(input), expected)
  // 私钥块整体掩码（含首尾行）
  const pem = '-----BEGIN PRIVATE KEY-----\nMIIEvQ\n-----END PRIVATE KEY-----'
  assert.equal(redactSecretText(pem), '-----B…(redacted)')
  // 非凭据文本原样；行结构（面板 - id: 行解析依赖）不受影响
  const patchLine = '- id: governance-router\n  name: xiaobai-agent/governance-router\n  timeoutMs: 250'
  assert.equal(redactSecretText(patchLine), patchLine)
  // 非字符串输入原样返回
  assert.equal(redactSecretText(null), null)
  assert.equal(redactSecretText(42), 42)
})

test('redactHomePath：homedir 前缀 → ~；\\Users\\<名>\\ 中段掩为 …；非家目录路径原样', () => {
  const home = homedir()
  assert.equal(redactHomePath(join(home, '.dsh', 'x.json')), join('~', '.dsh', 'x.json'))
  assert.match(redactHomePath('C:\\Users\\alice\\AppData\\Roaming\\npm'), /^[A-Za-z]:\\Users\\…\\/)
  assert.equal(redactHomePath('D:\\dsh-toolkit-isolated\\cordis.patch.yml'), 'D:\\dsh-toolkit-isolated\\cordis.patch.yml')
  assert.equal(redactHomePath(''), '')
  assert.equal(redactHomePath(null), null)
})

test('redactViewDeep：深度遍历掩凭据；路径族键加本机身份掩码；结构与键原样', () => {
  const input = {
    apiKey: 'sk-AbCdEfGhIjKlMnOpQrStUvWx',
    nested: { list: ['ghp_0123456789abcdefghijklmnopqrstuvwxyz', 7, null] },
    state: { ok: true, path: join(homedir(), '.dsh', 'state.json') },
    untouched: { keep: 'plain-value' },
  }
  const out = redactViewDeep(input)
  assert.equal(out.apiKey, 'sk-AbC…(redacted)')
  assert.equal(out.nested.list[0], 'ghp_01…(redacted)')
  assert.equal(out.nested.list[1], 7)
  assert.match(out.state.path, /^~/)
  assert.equal(out.untouched.keep, 'plain-value')
  assert.deepEqual(Object.keys(out), Object.keys(input), '键与结构不得改变')
  // 原对象不被改写（纯函数）
  assert.equal(input.apiKey, 'sk-AbCdEfGhIjKlMnOpQrStUvWx')
})

test('buildSoftReceipt：备份绝对路径按本机身份段掩码后进文案', () => {
  const home = homedir()
  const record = {
    recordedAt: '2026-11-01T00:00:00.000Z',
    backupDir: join(home, 'somewhere', 'backup'),
  }
  const receipt = buildSoftReceipt(record, 'some-plugin', 'key')
  const backupLine = receipt.lines.find((l) => l.includes('改动前备份'))
  assert.ok(backupLine, '收据必须含备份位置行')
  assert.ok(backupLine.includes('~'), `备份路径须已脱敏为 ~ 形态：${backupLine}`)
  assert.ok(!backupLine.includes(home), '收据不得原样携带 homedir 全路径')
})

test('buildSnapshot：home 前缀 toolkitRoot → ~；patch 原文里的凭据形态被掩；行结构保留', async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'panel-redact-snap-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'lib', 'agent-memory'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'xiaobai-agent', version: '9.9.9' }), 'utf8')
  writeFileSync(join(root, 'dsh.plugin.json'), JSON.stringify({ id: 'dsh/toolkit' }), 'utf8')
  writeFileSync(
    join(root, 'cordis.patch.yml'),
    [
      'patch:',
      '  - insert:',
      '      - id: probe-row',
      '        name: probe/plugin',
      "        timeoutMs: sk-AbCdEfGhIjKlMnOpQrStUvWx",
      '        inject: []',
    ].join('\n'),
    'utf8',
  )
  const snap = await buildSnapshot({ toolkitRoot: root })
  assert.ok(snap.toolkitRoot.startsWith('~'), `toolkitRoot 须脱敏为 ~ 形态：${snap.toolkitRoot}`)
  assert.ok(!snap.toolkitRoot.includes(homedir()), '快照不得原样携带 homedir 前缀')
  assert.ok(snap.patch.text.includes('sk-AbC…(redacted)'), 'patch 原文里的凭据形态须被掩')
  assert.ok(!snap.patch.text.includes('sk-AbCdEfGhIjKlMnOpQrStUvWx'), '凭据全文不得出现在快照')
  assert.ok(snap.patch.rows.some((r) => r.id === 'probe-row'), '行解析不受掩码影响（probe-row 仍在）')
  assert.ok(snap.patch.path.startsWith('~'), `patch.path 须脱敏：${snap.patch.path}`)
})
