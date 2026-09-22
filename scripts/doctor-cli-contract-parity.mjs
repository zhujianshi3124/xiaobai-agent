// DOCTOR_CLI ↔ 契约 行为对账（题 2 裁定的"分权边界"守卫；契约 v1.1 批 2 进门禁，每轮复跑）。
//
// 为什么需要它：本仓契约与独立 doctor 仓是**两套校验器**，裁定分工是"契约管解析行为、doctor 管必填性"
// （docs/contract.md §4 末两仓分权条）。分权最怕的是**静默打脸**——同一份 manifest 一边过一边红，
// 或某侧悄悄放宽。历史上就打过一次：`provides` 落地前若 doctor 白名单未先行，两闸同时判"未知根字段"
// （docs/contract-v1.1-recon.md §1 第 1 条顺序约束）。本脚本把三件事钉成可复跑断言：
//   A 存量 7 份 manifest：契约判 ok ⇒ doctor 不得对同一文件报 schema 级 error（不得互相打脸）
//   B 纯契约 manifest（无 legacy 三必填）：契约必须放行、doctor 必须判 required-missing（分权边界在位）
//   C provides：doctor 放行键名（批 1）且对拼错名仍判非法；契约对三槽形状与未知子键收紧（批 2）
// 手动脚本不算守卫（裁定 21 条件 a）⇒ 本文件由 scripts/ci-local.mjs 作为独立一步调用。
//
// DOCTOR_CLI 与门禁第 3 步同一枚 env 与同一缺省值；取不到 CLI 即 fail（不 skip ⇒ 不静默放宽）。
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DOCTOR_CLI = process.env.DOCTOR_CLI || 'D:/dsh-test-sandbox/projects/doctor/src/cli.mjs'

let passed = 0
const failures = []
function check(name, ok, detail) {
  if (ok) {
    passed++
    console.log('ok - ' + name)
  } else {
    failures.push(name + (detail ? ' :: ' + detail : ''))
    console.log('NOT OK - ' + name + (detail ? ' :: ' + detail : ''))
  }
}

const contract = await import(pathToFileURL(join(ROOT, 'contract', 'dist', 'index.js')).href)
const { validateManifest } = contract

function runDoctorJson(scopeRoot) {
  const r = spawnSync(process.execPath, [DOCTOR_CLI, '--json', '--scope', scopeRoot], { encoding: 'utf8', maxBuffer: 1 << 24 })
  if (r.status !== 0 && !r.stdout) {
    throw new Error('DOCTOR_CLI 调用失败（status=' + r.status + '）：' + String(r.stderr).slice(0, 300))
  }
  const start = r.stdout.indexOf('{')
  if (start < 0) throw new Error('DOCTOR_CLI 无 JSON 输出：' + String(r.stdout).slice(0, 200))
  return JSON.parse(r.stdout.slice(start))
}

/** 在 tmp 里搭一个最小 scope，避免任何写盘落到两仓。 */
function tmpScope(name, manifest) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-parity-' + name + '-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@local/dsh-parity-' + name, version: '0.0.1', type: 'module', exports: { '.': './index.js' } }, null, 2) + '\n')
  writeFileSync(join(root, 'dsh.plugin.json'), JSON.stringify(manifest, null, 2) + '\n')
  writeFileSync(join(root, 'index.js'), 'export const name = \'parity\'\nexport function apply() {}\n')
  return root
}

const CONTRACT_BASE = { id: 'parity/unit', displayName: '对账夹具', version: '1.0.0', contract: '^1.0' }
const LEGACY_TRIAD = { manifestVersion: 1, name: '@local/dsh-toolkit/parity', requirements: { runtime: {}, binaries: [], packages: {}, registers: {}, exports: { '.': './index.js' } } }

check('前置：DOCTOR_CLI 可解析', existsSync(DOCTOR_CLI), DOCTOR_CLI)
check('前置：契约 dist 暴露 validateManifest 与 provides 面', typeof validateManifest === 'function' && typeof contract.PLUGIN_CONTRACT_VERSION === 'string')

// ── A 存量 7 份 manifest：契约 ok ⇒ doctor 不得对同一文件报 schema error ─────────────────
const builtinManifests = ['dsh.plugin.json', 'panel/dsh.plugin.json']
for (const e of readdirSync(join(ROOT, 'lib'), { withFileTypes: true })) {
  const rel = 'lib/' + e.name + '/dsh.plugin.json'
  if (e.isDirectory() && existsSync(join(ROOT, rel))) builtinManifests.push(rel)
}
check('A0 内置 manifest 计数 = 7（5 lib + 桶根 + panel）', builtinManifests.length === 7, builtinManifests.join(', '))

const realReport = runDoctorJson(ROOT)
const schemaIssuesByFile = new Map()
for (const issue of realReport.issues || []) {
  if (issue.id && String(issue.id).startsWith('schema.')) {
    const key = String(issue.file || '').replace(/\\/g, '/')
    if (!schemaIssuesByFile.has(key)) schemaIssuesByFile.set(key, [])
    schemaIssuesByFile.get(key).push(issue.id)
  }
}
for (const rel of builtinManifests) {
  const parsed = JSON.parse(readFileSync(join(ROOT, rel), 'utf8').replace(/^/, ''))
  const verdict = validateManifest(parsed)
  const doctorSays = schemaIssuesByFile.get(rel) || []
  if (rel === 'panel/dsh.plugin.json') {
    // 唯一无契约字段的一份（docs/contract-v1.1-recon.md §4：panel 仍走 legacy 合成分支，D-15）。
    // ⇒ 契约判 required 是**在册事实**，doctor 判 0 error 也是在册事实；本步把它钉成"钉住现状"的断言，
    //   若哪天 panel 补上 contract 或 doctor 开始对它报错，这里会先响。
    check('A panel/dsh.plugin.json：契约按 legacy 判缺契约字段、doctor 不报 schema error（在册分叉）',
      verdict.ok === false && (verdict.errors || []).every((e) => e.code === 'required') && doctorSays.length === 0,
      'contract.ok=' + verdict.ok + ' errors=' + JSON.stringify((verdict.errors || []).map((e) => e.code + '@' + e.path)) + ' doctor=' + doctorSays.join('/'))
    continue
  }
  check('A ' + rel + '：契约 ok 与 doctor 无 schema error 同向', verdict.ok === true && doctorSays.length === 0,
    'contract.ok=' + verdict.ok + ' doctor.schema=' + doctorSays.join('/') + (verdict.ok ? '' : ' errors=' + JSON.stringify(verdict.errors.map((e) => e.code + '@' + e.path))))
}

// ── B 纯契约 manifest：契约放行、doctor 判必填缺失（分权边界在位）────────────────────────
{
  const scope = tmpScope('pure-contract', { ...CONTRACT_BASE })
  const verdict = validateManifest(JSON.parse(readFileSync(join(scope, 'dsh.plugin.json'), 'utf8')))
  const report = runDoctorJson(scope)
  // 只断言"三个根必填"这一件事：doctor 另有套件级规则（aliases 表、套件根 exports 须 $from、
  // @local 引用须可解析），那是它的管辖面、与本对账命题无关 ⇒ 不把它们的出现与否写进断言，
  // 否则本步会替 doctor 的规则面背书（那是另一种打脸）。
  const rootKeysMissing = (issues) => (issues || [])
    .filter((i) => i.id === 'schema.required-missing')
    .map((i) => String(i.message).replace(/^缺少必填字段: /, '').replace(/。$/, '').split(', '))
    .flat()
  const missing1 = rootKeysMissing(report.issues)
  check('B1 纯契约 manifest 过契约（契约不管必填性）', verdict.ok === true, JSON.stringify(verdict.errors && verdict.errors.map((e) => e.code + '@' + e.path)))
  check('B2 同一份在 doctor 侧判三个根必填缺失（必填性归 doctor 独占）',
    ['manifestVersion', 'name', 'requirements'].every((k) => missing1.includes(k)), 'missing=' + missing1.join('/'))
  const triad = { ...CONTRACT_BASE, ...JSON.parse(JSON.stringify(LEGACY_TRIAD)) }
  const scope2 = tmpScope('with-triad', triad)
  const report2 = runDoctorJson(scope2)
  const missing2 = rootKeysMissing(report2.issues)
  check('B3 补齐三个根必填后这三条归零（边界只卡这三项，不多卡）',
    ['manifestVersion', 'name', 'requirements'].every((k) => !missing2.includes(k)), 'missing=' + missing2.join('/'))
  check('B4 契约对同一份仍判 ok（两侧不互相打脸）', validateManifest(triad).ok === true)
}

// ── C provides 接缝：doctor 放行键名 / 拼错仍非法；契约收紧三槽形状 ──────────────────────
{
  const good = { ...CONTRACT_BASE, ...LEGACY_TRIAD, provides: { services: ['parity.svc'], commands: ['parity.cmd'], providers: ['parity.prov'] } }
  const scope = tmpScope('provides-ok', good)
  const report = runDoctorJson(scope)
  const illegal = (report.issues || []).filter((i) => /清单根字段非法/.test(String(i.message)))
  check('C1 doctor 放行 provides 键名（批 1 白名单在位）', illegal.length === 0, illegal.map((i) => i.message).join(' / '))
  check('C2 契约接受三槽齐载的 provides', validateManifest(good).ok === true, JSON.stringify(validateManifest(good).errors && validateManifest(good).errors.map((e) => e.code + '@' + e.path)))

  const typo = { ...good, provides: { services: ['parity.svc'], prividers: ['typo'] } }
  const verdictTypo = validateManifest(typo)
  const unknownChild = (verdictTypo.errors || []).filter((e) => e.code === 'unknown-field' && e.path === 'provides.prividers')
  check('C3 契约拒绝 provides 未知子键（拼错槽位名不得静默失效）', verdictTypo.ok === false && unknownChild.length === 1,
    'ok=' + verdictTypo.ok + ' errors=' + JSON.stringify((verdictTypo.errors || []).map((e) => e.code + '@' + e.path)))
  const scopeTypo = tmpScope('provides-typo-doctor', { ...good, provides: { services: ['parity.svc'] }, provids: {} })
  const reportTypo = runDoctorJson(scopeTypo)
  const caught = (reportTypo.issues || []).filter((i) => /清单根字段非法: provids/.test(String(i.message)))
  check('C4 doctor 对拼错的 provids 仍判非法（放行面未扩大）', caught.length === 1,
    'issues=' + (reportTypo.issues || []).map((i) => i.message).join(' / '))

  const shape = { ...good, provides: { services: 'parity.svc' } }
  const vShape = validateManifest(shape)
  check('C5 契约拒绝非数组槽位', vShape.ok === false && (vShape.errors || []).some((e) => e.path === 'provides.services' && e.code === 'type'), JSON.stringify((vShape.errors || []).map((e) => e.code + '@' + e.path)))
  const blank = { ...good, provides: { commands: ['ok.cmd', '  '] } }
  const vBlank = validateManifest(blank)
  check('C6 契约拒绝空串/纯空白成员', vBlank.ok === false && (vBlank.errors || []).some((e) => e.path === 'provides.commands[1]'), JSON.stringify((vBlank.errors || []).map((e) => e.code + '@' + e.path)))
  const evSlot = { ...good, provides: { events: ['parity/event'] } }
  const vEv = validateManifest(evSlot)
  check('C7 provides.events 被拒且点名 requirements.registers.events（裁定采甲）',
    vEv.ok === false && (vEv.errors || []).some((e) => e.path === 'provides.events' && /registers\.events/.test(String(e.expected) + String(e.message))),
    JSON.stringify((vEv.errors || []).map((e) => e.code + '@' + e.path + '#' + (e.expected || ''))))
}

console.log('')
console.log('RESULT: ' + passed + '/' + (passed + failures.length) + ' PASS' + (failures.length ? '  FAILED=' + failures.length : ''))
if (failures.length) {
  console.log(failures.map((f) => '  × ' + f).join('\n'))
  process.exit(1)
}
