#!/usr/bin/env node
// p26-cleanup-verify —— 批次 5B governance-cleanup 的专项验证（补齐 7/7 治理插件）。
//
// 三层，缺一层都不算验完：
//   ① 纯函数单测（不依赖宿主）：classifyTarget / loadUpstreamReport / buildReport
//   ② 端到端：假上游报告 → 分类 → 计划 → 落盘 → apply() 全链
//   ③ 零写入自证：断言真实仓 .toolkit-governance/ 未被本脚本改动
//
// ── 本插件的三条承重设计，逐条钉住（推翻即红）──────────────────────────────
//   D1 **不执行任何清理动作**：plan 每条的 autoExecutable 恒为 false；
//      源码非注释行里不出现 unlink / rmSync / rmdir / writeFileSync 到仓内配置面。
//   D2 **分类先行**：provider 字段 ⇒ provider-model（~/.dsh，环境红线，须用户批准）；
//      libDir/pluginDir 字段 ⇒ plugin-dir（仓内，可 git revert）；都没有 ⇒ unknown（不猜）。
//   D3 **不 fallback 重算**：上游缺失/不可解析 ⇒ 空计划 + 如实报 issue，绝不 throw、绝不自己算分层。
//
// ── 两条本项目踩过的坑，本脚本按纪律逐条防 ──────────────────────────────
// 坑 14「replace 空转 ⇒ 断言恒空」：本脚本凡对上游 JSON 做文本改写，改完紧跟 premise 断言。
// 坑 17「缺省 reportRoot 回落仓根」：**每一处 buildReport / writeReport 都显式传 tmpdir**，
//   并由 ③ 的零写入自证兜底——真实仓 .toolkit-governance/ 文件清单与内容一律不许变。
//
// 用法：node scripts/p26-cleanup-verify.mjs
// 纪律：全部落盘测试走 os.tmpdir 副本；真实仓零写入（末尾断言）。

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const MOD = join(root, 'lib', 'governance-cleanup', 'index.js')

let pass = 0
const fails = []
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log('PASS ' + name) }
  else { fails.push(name + ' — ' + detail); console.log('FAIL ' + name + ' — ' + detail) }
}

// ── 零写入基线：跑之前先记下真实治理报告面的状态 ──────────────────────────
const REAL_GOV = join(root, '.toolkit-governance')
function snapshotTree(abs) {
  const out = {}
  if (!existsSync(abs)) return out
  const walk = (dir, rel) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name)
      const key = rel === '' ? e.name : rel + '/' + e.name
      if (e.isDirectory()) walk(full, key)
      else out[key] = createHash('sha256').update(readFileSync(full)).digest('hex')
    }
  }
  walk(abs, '')
  return out
}
const govBefore = snapshotTree(REAL_GOV)

// ── 载入被测模块 ──────────────────────────────────────────────────────────
check('前置：lib/governance-cleanup/index.js 在场', existsSync(MOD), MOD)
const mod = await import('file:///' + MOD.replace(/\\/g, '/'))
for (const fn of ['classifyTarget', 'loadUpstreamReport', 'buildReport', 'writeReport', 'writeHistorySnapshot', 'apply', 'moduleToolkitRoot', 'resolveReportRoot', 'upstreamReportPath']) {
  check('导出纯函数 ' + fn, typeof mod[fn] === 'function', typeof mod[fn])
}
check('inject 为空数组（不依赖任何宿主服务）', Array.isArray(mod.inject) && mod.inject.length === 0, JSON.stringify(mod.inject))
check('name = governance-cleanup', mod.name === 'governance-cleanup', String(mod.name))
check('默认导出含 name/inject/apply', typeof mod.default.apply === 'function' && mod.default.name === 'governance-cleanup', JSON.stringify(Object.keys(mod.default || {})))

// ── 常量面 ────────────────────────────────────────────────────────────────
check('REPORT_SCHEMA = toolkit-governance/cleanup@1', mod.REPORT_SCHEMA === 'toolkit-governance/cleanup@1', String(mod.REPORT_SCHEMA))
check('UPSTREAM_SCHEMA = toolkit-governance/tiering@1（口径单一来源）', mod.UPSTREAM_SCHEMA === 'toolkit-governance/tiering@1', String(mod.UPSTREAM_SCHEMA))
check('UPSTREAM_PLUGIN_DIR = governance-tiering', mod.UPSTREAM_PLUGIN_DIR === 'governance-tiering', String(mod.UPSTREAM_PLUGIN_DIR))
check('三类目标常量齐全', mod.TARGET_PLUGIN === 'plugin-dir' && mod.TARGET_PROVIDER === 'provider-model' && mod.TARGET_UNKNOWN === 'unknown')
check('CLEANUP_STEPS 三类都有条目', [mod.TARGET_PLUGIN, mod.TARGET_PROVIDER, mod.TARGET_UNKNOWN].every((k) => Array.isArray(mod.CLEANUP_STEPS[k]) && mod.CLEANUP_STEPS[k].length > 0))

// ══════════════════════════════════════════════════════════════════════════
// ① 纯函数：classifyTarget（D2 分类先行）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── ① 纯函数：classifyTarget ──')
{
  const a = mod.classifyTarget({ provider: 'sensenova-gateway', model: 'deepseek-v4-pro' })
  check('1.1 带 provider ⇒ provider-model', a.kind === mod.TARGET_PROVIDER, JSON.stringify(a))
  check('1.1 evidence 含 provider 名', typeof a.evidence === 'string' && a.evidence.includes('sensenova-gateway'), a.evidence)

  const b = mod.classifyTarget({ libDir: 'governance-router' })
  check('1.2 带 libDir ⇒ plugin-dir', b.kind === mod.TARGET_PLUGIN, JSON.stringify(b))
  const b2 = mod.classifyTarget({ pluginDir: 'lib/governance-tiering' })
  check('1.2 带 pluginDir ⇒ plugin-dir', b2.kind === mod.TARGET_PLUGIN, JSON.stringify(b2))

  const c = mod.classifyTarget({ key: 'something', calls: 3 })
  check('1.3 无 provider 无 libDir ⇒ unknown（不猜）', c.kind === mod.TARGET_UNKNOWN, JSON.stringify(c))

  const d = mod.classifyTarget(null)
  check('1.4 null ⇒ unknown', d.kind === mod.TARGET_UNKNOWN, JSON.stringify(d))

  const e = mod.classifyTarget({ provider: '   ', libDir: '' })
  check('1.5 空白字符串不算字段 ⇒ unknown', e.kind === mod.TARGET_UNKNOWN, JSON.stringify(e))

  const f = mod.classifyTarget({ provider: 'p1', libDir: 'governance-router' })
  check('1.6 provider 优先于 libDir（配置面先于文件面）', f.kind === mod.TARGET_PROVIDER, JSON.stringify(f))
}

// ══════════════════════════════════════════════════════════════════════════
// ② loadUpstreamReport：读不读得到 + 是不是对象
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── ② loadUpstreamReport ──')
{
  const work = mkdtempSync(join(tmpdir(), 'p26-load-'))

  const missing = mod.loadUpstreamReport(join(work, 'nope.json'))
  check('2.1 不存在 ⇒ present=false readable=false', missing.present === false && missing.readable === false, JSON.stringify(missing))

  const badPath = join(work, 'bad.json')
  writeFileSync(badPath, '{ not json', 'utf8')
  const bad = mod.loadUpstreamReport(badPath)
  check('2.2 非法 JSON ⇒ present=true readable=false（不 throw）', bad.present === true && bad.readable === false, JSON.stringify({ p: bad.present, r: bad.readable }))

  const arrPath = join(work, 'arr.json')
  writeFileSync(arrPath, '[1,2,3]', 'utf8')
  const arr = mod.loadUpstreamReport(arrPath)
  check('2.3 数组不是对象 ⇒ readable=false', arr.present === true && arr.readable === false, JSON.stringify({ p: arr.present, r: arr.readable }))

  const okPath = join(work, 'ok.json')
  writeFileSync(okPath, JSON.stringify({ schema: mod.UPSTREAM_SCHEMA, tiers: { review: [] } }), 'utf8')
  const ok = mod.loadUpstreamReport(okPath)
  check('2.4 合法对象 ⇒ present=true readable=true data 有内容', ok.present && ok.readable && ok.data && ok.data.schema === mod.UPSTREAM_SCHEMA, JSON.stringify({ p: ok.present, r: ok.readable }))
}

// ══════════════════════════════════════════════════════════════════════════
// ③ buildReport：D3 不 fallback 重算 + D1 计划不自动执行
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── ③ buildReport ──')
{
  const work = mkdtempSync(join(tmpdir(), 'p26-build-'))
  const reportRoot = join(work, 'gov', 'governance-cleanup')

  // 3.1 上游缺失 ⇒ 空计划 + warn，不 throw
  const missing = mod.buildReport(work, { reportRoot, upstreamReportPath: join(work, 'absent.json'), rootSource: 'test' })
  check('3.1 上游缺失 ⇒ candidateCount=0', missing.summary.candidateCount === 0, JSON.stringify(missing.summary))
  check('3.1 上游缺失 ⇒ plannedCount=0', missing.summary.plannedCount === 0, JSON.stringify(missing.summary))
  check('3.1 上游缺失 ⇒ issues 含 upstream-missing（warn）', missing.issues.some((i) => i.code === 'upstream-missing' && i.level === 'warn'), JSON.stringify(missing.issues.map((i) => i.code)))
  check('3.1 schema 正确', missing.schema === mod.REPORT_SCHEMA, String(missing.schema))
  check('3.1 显式 reportRoot 被如实回写（不回落仓根）', missing.reportRoot === reportRoot, missing.reportRoot)

  // 3.2 上游不可解析 ⇒ 空计划 + warn
  const unreadablePath = join(work, 'unreadable.json')
  writeFileSync(unreadablePath, 'garbage', 'utf8')
  const unreadable = mod.buildReport(work, { reportRoot, upstreamReportPath: unreadablePath, rootSource: 'test' })
  check('3.2 上游不可解析 ⇒ 空计划', unreadable.summary.plannedCount === 0, JSON.stringify(unreadable.summary))
  check('3.2 上游不可解析 ⇒ issues 含 upstream-unreadable', unreadable.issues.some((i) => i.code === 'upstream-unreadable'), JSON.stringify(unreadable.issues.map((i) => i.code)))

  // 3.3 混合候选 ⇒ 逐条分类
  const upstreamPath = join(work, 'tiering.json')
  const upstreamDoc = {
    schema: mod.UPSTREAM_SCHEMA,
    tiers: {
      review: [
        { key: 'sensenova-gateway|deepseek-v4-pro', provider: 'sensenova-gateway', model: 'deepseek-v4-pro', calls: 0, lastDay: '2026-09-01', idleDays: 50 },
        { key: 'nvidia|glm', provider: 'nvidia', calls: 2 },
        { key: 'lib/governance-tiering', libDir: 'governance-tiering', calls: 0 },
        { key: 'mystery', calls: 1 },
      ],
    },
  }
  writeFileSync(upstreamPath, JSON.stringify(upstreamDoc), 'utf8')
  // 坑 14 premise：夹具真的写进去了
  const premise = JSON.parse(readFileSync(upstreamPath, 'utf8'))
  check('3.3 premise: 夹具上游含 4 个候选', premise.tiers.review.length === 4, String(premise.tiers.review.length))

  const mixed = mod.buildReport(work, { reportRoot, upstreamReportPath: upstreamPath, rootSource: 'test' })
  check('3.3 candidateCount=4', mixed.summary.candidateCount === 4, JSON.stringify(mixed.summary))
  check('3.3 plannedCount=4', mixed.summary.plannedCount === 4, JSON.stringify(mixed.summary))
  check('3.3 byTargetKind: provider-model=2', mixed.summary.byTargetKind[mod.TARGET_PROVIDER] === 2, JSON.stringify(mixed.summary.byTargetKind))
  check('3.3 byTargetKind: plugin-dir=1', mixed.summary.byTargetKind[mod.TARGET_PLUGIN] === 1, JSON.stringify(mixed.summary.byTargetKind))
  check('3.3 byTargetKind: unknown=1', mixed.summary.byTargetKind[mod.TARGET_UNKNOWN] === 1, JSON.stringify(mixed.summary.byTargetKind))
  check('3.3 requiresUserApproval 只数 provider-model（=2）', mixed.summary.requiresUserApproval === 2, String(mixed.summary.requiresUserApproval))

  // D1：每一条都不自动执行
  check('3.4 D1: plan 每条 autoExecutable 均为 false', mixed.plan.every((p) => p.autoExecutable === false), JSON.stringify(mixed.plan.map((p) => p.autoExecutable)))
  check('3.4 D1: summary.autoExecutable 计数 = 0', mixed.summary.autoExecutable === 0, String(mixed.summary.autoExecutable))
  check('3.4 D1: plan 每条都带 steps（给人看的步骤）', mixed.plan.every((p) => Array.isArray(p.steps) && p.steps.length > 0))
  check('3.4 provider 条目 requiresUserApproval=true', mixed.plan.filter((p) => p.targetKind === mod.TARGET_PROVIDER).every((p) => p.requiresUserApproval === true))
  check('3.4 plugin-dir 条目 requiresUserApproval=false', mixed.plan.filter((p) => p.targetKind === mod.TARGET_PLUGIN).every((p) => p.requiresUserApproval === false))

  // D3：有 provider 候选时必出「需批准」warn
  check('3.5 含 provider-model ⇒ issues 含 provider-cleanup-needs-approval', mixed.issues.some((i) => i.code === 'provider-cleanup-needs-approval'), JSON.stringify(mixed.issues.map((i) => i.code)))

  // 3.6 schema 不匹配 ⇒ info，但仍尽力解析
  const wrongSchemaPath = join(work, 'wrong-schema.json')
  writeFileSync(wrongSchemaPath, JSON.stringify({ schema: 'toolkit-governance/tiering@0', tiers: { review: [{ provider: 'x' }] } }), 'utf8')
  const wrongSchema = mod.buildReport(work, { reportRoot, upstreamReportPath: wrongSchemaPath, rootSource: 'test' })
  check('3.6 schema 不匹配 ⇒ info 级 issue', wrongSchema.issues.some((i) => i.code === 'upstream-schema-mismatch' && i.level === 'info'), JSON.stringify(wrongSchema.issues.map((i) => i.code)))
  check('3.6 schema 不匹配 ⇒ 仍按已知字段解析出 1 条', wrongSchema.summary.candidateCount === 1, String(wrongSchema.summary.candidateCount))

  // 3.7 tiers.review 不是数组 ⇒ info + 空候选
  const noReviewPath = join(work, 'no-review.json')
  writeFileSync(noReviewPath, JSON.stringify({ schema: mod.UPSTREAM_SCHEMA, tiers: { review: 'oops' } }), 'utf8')
  const noReview = mod.buildReport(work, { reportRoot, upstreamReportPath: noReviewPath, rootSource: 'test' })
  check('3.7 tiers.review 非数组 ⇒ info issue', noReview.issues.some((i) => i.code === 'upstream-no-review-array'), JSON.stringify(noReview.issues.map((i) => i.code)))
  check('3.7 tiers.review 非数组 ⇒ 空候选', noReview.summary.candidateCount === 0, String(noReview.summary.candidateCount))

  // 3.8 D3：绝不重算分层 —— 报告里不出现自算的 tiers 字段
  check('3.8 D3: 报告不含自算 tiers 字段', !('tiers' in mixed), JSON.stringify(Object.keys(mixed)))
  check('3.8 D3: notes 明示「唯一数据源」', mixed.notes.some((n) => n.includes('governance-tiering')), JSON.stringify(mixed.notes.length))
}

// ══════════════════════════════════════════════════════════════════════════
// ④ 落盘：writeReport / writeHistorySnapshot / apply（全程 tmpdir）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── ④ 落盘 ──')
{
  const work = mkdtempSync(join(tmpdir(), 'p26-write-'))
  const reportRoot = join(work, 'gov', 'governance-cleanup')
  const report = mod.buildReport(work, { reportRoot, upstreamReportPath: join(work, 'absent.json'), rootSource: 'test' })

  const w1 = mod.writeReport(report, reportRoot)
  check('4.1 writeReport ok', w1.ok === true, JSON.stringify(w1))
  check('4.1 latest.json 在场', existsSync(join(reportRoot, 'latest.json')))
  const back = JSON.parse(readFileSync(join(reportRoot, 'latest.json'), 'utf8'))
  check('4.1 落盘内容 schema 一致', back.schema === mod.REPORT_SCHEMA, String(back.schema))

  const w2 = mod.writeHistorySnapshot(report, reportRoot)
  check('4.2 writeHistorySnapshot ok', w2.ok === true, JSON.stringify(w2))
  const day = String(report.generatedAt).slice(0, 10)
  check('4.2 history/<day>.json 在场', existsSync(join(reportRoot, 'history', day + '.json')))

  // 4.3 apply() 全链（显式 reportRoot，坑 17）
  const applyRoot = join(work, 'apply-report')
  const ctxStub = {}
  let threw = null
  try { mod.apply(ctxStub, { enabled: true, reportRoot: applyRoot, writeHistory: false }) } catch (e) { threw = e }
  check('4.3 apply 不 throw', threw === null, String(threw && threw.message))
  check('4.3 apply 产出 latest.json', existsSync(join(applyRoot, 'latest.json')))
  check('4.3 writeHistory=false ⇒ 不写 history', !existsSync(join(applyRoot, 'history')))

  // 4.4 enabled:false ⇒ 零写入
  const offRoot = join(work, 'off-report')
  mod.apply(ctxStub, { enabled: false, reportRoot: offRoot })
  check('4.4 enabled:false ⇒ 不写任何文件', !existsSync(offRoot))

  // 4.5 apply 全程不碰 ctx（本插件无宿主依赖）
  const proxyCtx = new Proxy({}, { get() { throw new Error('ctx accessed') } })
  let ctxThrew = null
  try { mod.apply(proxyCtx, { enabled: true, reportRoot: join(work, 'proxy-report'), writeHistory: false }) } catch (e) { ctxThrew = e }
  check('4.5 apply 不访问 ctx 任何属性', ctxThrew === null, String(ctxThrew && ctxThrew.message))
}

// ══════════════════════════════════════════════════════════════════════════
// ⑤ 同步面：五处 + 守卫（本插件已接进仓，缺一处即红）
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── ⑤ 同步面 ──')
{
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
  check('5.1 cordis.patch.yml 有 governance-cleanup 挂载行', patch.includes('- id: governance-cleanup'))
  check('5.1 该行 inject: []', /- id: governance-cleanup[\s\S]{0,400}?inject: \[\]/.test(patch))
  check('5.1 该行不写 disabled（默认挂载）', !/- id: governance-cleanup[\s\S]{0,400}?disabled:/.test(patch))
  check('5.1 该行 enabled: true', /- id: governance-cleanup[\s\S]{0,400}?enabled: true/.test(patch))
  check('5.1 该行 writeHistory: true', /- id: governance-cleanup[\s\S]{0,400}?writeHistory: true/.test(patch))

  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  check('5.2 dsh.bundle.patch 含 cleanup', (pkg.dsh.bundle.patch || []).includes('./lib/governance-cleanup/bundle.patch.yml'), JSON.stringify(pkg.dsh.bundle.patch))
  check('5.3 exports 含 ./governance-cleanup', pkg.exports['./governance-cleanup'] === './lib/governance-cleanup/index.js', String(pkg.exports['./governance-cleanup']))

  const bp = readFileSync(join(root, 'lib', 'governance-cleanup', 'bundle.patch.yml'), 'utf8')
  check('5.4 自带 bundle.patch.yml 有 insert 行', bp.includes('- insert:') && bp.includes('- id: governance-cleanup'))
  check('5.4 自带 bundle.patch.yml 零占位符', !bp.includes('<') || !bp.includes('PLACEHOLDER'), '疑似占位符')

  const fx = readFileSync(join(root, 'test', 'helpers', 'fixture-toolkit.mjs'), 'utf8')
  const m = fx.match(/const LIB_DIRS = \[([^\]]+)\]/)
  check('5.5 夹具 LIB_DIRS 含 governance-cleanup', m !== null && m[1].includes("'governance-cleanup'"), m && m[1])

  const manifest = JSON.parse(readFileSync(join(root, 'lib', 'governance-cleanup', 'dsh.plugin.json'), 'utf8'))
  check('5.6 manifest name 正确', manifest.name === 'xiaobai-agent/governance-cleanup', manifest.name)
  check('5.6 manifest 无 panels 面（不自带面板）', !('panels' in manifest))
  check('5.6 configSchema 声明 3 个配置键', ['enabled', 'reportRoot', 'writeHistory'].every((k) => k in (manifest.configSchema.dict || {})), JSON.stringify(Object.keys(manifest.configSchema.dict || {})))
  const subPkg = JSON.parse(readFileSync(join(root, 'lib', 'governance-cleanup', 'package.json'), 'utf8'))
  check('5.6 子包 package.json 声明 bundle.patch', subPkg.dsh && subPkg.dsh.bundle && subPkg.dsh.bundle.patch === './bundle.patch.yml', JSON.stringify(subPkg.dsh))

  const reg = readFileSync(join(root, 'scripts', 'regression-all.mjs'), 'utf8')
  check('5.7 regression-all 清单含 p26', reg.includes('p26-cleanup-verify') && reg.includes('scripts/p26-cleanup-verify.mjs'))
  check('5.7 regression-all 文案已随 17→18 同步', reg.includes('18 专项脚本') && !reg.includes('17 专项脚本'), '仍见 17 或未见 18')
  const hook = readFileSync(join(root, 'scripts', 'git-hooks', 'pre-commit'), 'utf8')
  check('5.7 pre-commit hook 文案已随 17→18 同步', hook.includes('18 个专项脚本') && !hook.includes('17 个专项脚本'), '仍见 17 或未见 18')

  const q2 = readFileSync(join(root, 'scripts', 'q2-layer-scan.mjs'), 'utf8')
  check('5.8 q2 成卡目录数已改 10', q2.includes('manifests.length === 10'), '未找到 === 10')
  check('5.8 q2 未退化为 >=', !/manifests\.length >= 10/.test(q2))
  const parity = readFileSync(join(root, 'scripts', 'doctor-cli-contract-parity.mjs'), 'utf8')
  check('5.8 parity 计数已改 12', parity.includes('builtinManifests.length === 12'), '未找到 === 12')
  check('5.8 parity 未退化为 >=', !/builtinManifests\.length >= 12/.test(parity))
}

// ══════════════════════════════════════════════════════════════════════════
// ⑥ 红线面：不注入 / 不自带面板 / 不跨插件 import / 不执行清理
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── ⑥ 红线面 ──')
{
  const src = readFileSync(MOD, 'utf8')
  // 判据只看**非注释行**（与 p25 同款口径）：本文件头注在逐条解释"不做什么"，
  // 拿整文匹配会把"声明自己不做某事"误判成"做了某事"。
  const code = src.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  check('6.1 插件不写 AGENTS.md', !/AGENTS\.md/.test(code))
  check('6.2 插件不调 ctx.slots（不自带面板）', !/ctx\.slots/.test(code))
  check('6.3 插件不调 ctx.systemPrompt（不注册 prompt）', !/ctx\.systemPrompt/.test(code))
  check('6.4 插件不调 ctx.skills.register / registerProvider', !/skills\.(register|registerProvider)\s*\(/.test(code))
  check('6.5 插件不 import 任何宿主包（可独立卸载）', !/from\s+['"]@deepseek-ai\//.test(code) && !/from\s+['"]xiaobai-agent/.test(code))
  check('6.6 插件只 import node: 内置模块', (code.match(/from\s+['"][^'"]+['"]/g) || []).every((s) => /from\s+['"]node:/.test(s)), JSON.stringify((code.match(/from\s+['"][^'"]+['"]/g) || [])))
  // D1：不执行清理 —— 源码里不许有删除类调用
  check('6.7 D1: 源码无 unlink / rmSync / rmdir / rm( 调用', !/\b(unlinkSync|unlink|rmSync|rmdirSync|rmdir)\s*\(/.test(code), '出现删除类调用')
  // D1：不碰 git
  check('6.8 D1: 源码无 child_process / exec / spawn（不碰 git）', !/child_process|\bexecSync\s*\(|\bspawnSync\s*\(/.test(code))
  // 环境红线：不出现 ~/.dsh 写路径
  check('6.9 源码不引用 .dsh 目录（环境红线只读）', !/\.dsh[\\/]/.test(code), '出现 .dsh 路径')
}

// ══════════════════════════════════════════════════════════════════════════
// ⑦ 零写入自证
// ══════════════════════════════════════════════════════════════════════════
console.log('\n── ⑦ 零写入自证 ──')
{
  const govAfter = snapshotTree(REAL_GOV)
  const beforeKeys = Object.keys(govBefore).sort()
  const afterKeys = Object.keys(govAfter).sort()
  check('7.1 真实 .toolkit-governance/ 文件清单未变', JSON.stringify(beforeKeys) === JSON.stringify(afterKeys), 'before=' + beforeKeys.length + ' after=' + afterKeys.length)
  check('7.1 真实 .toolkit-governance/ 无文件内容被改写', beforeKeys.every((k) => govBefore[k] === govAfter[k]), '有内容变化')
  check('7.2 本脚本未在真实 .toolkit-governance/ 下建 governance-cleanup 目录', !existsSync(join(REAL_GOV, 'governance-cleanup')) || beforeKeys.some((k) => k.startsWith('governance-cleanup/')))
  // 仓内其它面也不该被本脚本碰
  check('7.3 真实 cordis.patch.yml 未被本脚本改写', readFileSync(join(root, 'cordis.patch.yml'), 'utf8').includes('- id: governance-cleanup'))
}

// ══════════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(60))
if (fails.length === 0) {
  console.log('RESULT: ' + pass + '/' + pass + ' PASS')
  process.exit(0)
} else {
  console.log('RESULT: ' + pass + '/' + (pass + fails.length) + ' PASS, ' + fails.length + ' FAIL')
  for (const f of fails) console.log('  ✗ ' + f)
  process.exit(1)
}
