// DOCTOR_CLI ↔ 契约 行为对账（题 2 裁定的"分权边界"守卫；契约 v1.1 批 2 进门禁，每轮复跑）。
//
// 为什么需要它：本仓契约与独立 doctor 仓是**两套校验器**，裁定分工是"契约管解析行为、doctor 管必填性"
// （docs/contract.md §4 末两仓分权条）。分权最怕的是**静默打脸**——同一份 manifest 一边过一边红，
// 或某侧悄悄放宽。历史上就打过一次：`provides` 落地前若 doctor 白名单未先行，两闸同时判"未知根字段"
// （docs/contract-v1.1-recon.md §1 第 1 条顺序约束）。本脚本把三件事钉成可复跑断言：
//   A 存量 7 份 manifest：契约判 ok ⇒ doctor 不得对同一文件报 schema 级 error（不得互相打脸）
//   B 纯契约 manifest（无 legacy 三必填）：两侧都放行根必填面；requirements **在场才管**、
//     缺席时的整段跳过由本段钉成可见断言（契约 v1.2 前置①，recon §8.3 连带修正）
//   C provides：doctor 放行键名（批 1）且对拼错名仍判非法；契约对槽形状与未知子键收紧（批 2 三槽；
//     v1.3 扩槽后为五名单槽＋entry 单值槽，C8～C10 三格钉新槽的两侧接缝，EXE-BOOT-020 扩槽笔）
//   D 重叠面**逐规则**对账（契约 v1.2 题一终批＝案二"维持两引擎＋对账网扩面"，EXE-BOOT-016 笔 2）：
//     两套校验器都管的每一条字段规则，逐条钉住"各侧判什么"——同向红／契约严 doctor 宽／方向相反
//     三类各按实况登记，不许混成一句"大致一致"。夹具与判据先经实测（probe-overlap-faces.mjs）。
//   E 根字段**键集**对账＝清单正典 H4 的活体钉：S3 甲'收紧后契约`在册`（不报 unknown-field）14 键
//     vs doctor 白名单 14 键，两侧各差一名（契约独有 healthCheck／doctor 独有 manifestVersion——
//     后者是甲'收紧只推契约一档、冻结 CLI 仍认旧键名的必然投影）。任一侧改键表 ⇒ 当场翻红。
// 手动脚本不算守卫（裁定 21 条件 a）⇒ 本文件由 scripts/ci-local.mjs 作为独立一步调用。
//
// 【新规则两仓同批落】口径（W9 先例；随契约 v1.2 入册）：凡新增/改动**两仓重叠面**上的判据，
// 必须在同一批次内同时落 toolkit（契约/面板/registry）与 doctor 仓，并互引 commit hash——
// 只落一侧即视为"把另一侧的静默分叉合法化"。本步（A–E）就是这条口径的执行面：分两次提交会让
// 中间态在门禁里可见（差集格或同向格先红），因此顺序不可调换（先扩网、后动行为码）。
//
// DOCTOR_CLI 与门禁第 3 步同一枚 env 与同一缺省值；取不到 CLI 即 fail（不 skip ⇒ 不静默放宽）。
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// S2.5 合并批：doctor CLI 成员入桶，parity 对账对象改桶内 CLI（doctor/cli/src/cli.mjs）——
// 两实现语义锁不变（toolkit 内嵌 TS doctor ↔ 桶内 JS CLI 成员）；DOCTOR_CLI 环境变量仍可覆盖。
const DOCTOR_CLI = process.env.DOCTOR_CLI || join(ROOT, 'doctor', 'cli', 'src', 'cli.mjs')

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
// S3 甲'收紧后本夹具**不再携带 manifestVersion**（带契约面＋manifestVersion＝双写 error＝契约拒；
// 该名的新状态由 D22 单格钉住）。留下的 name/requirements 属 info 档，正是本仓五份带契约清单今天的真实形态。
const LEGACY_TRIAD = { name: 'dsh-toolkit/parity', requirements: { runtime: {}, binaries: [], packages: {}, registers: {}, exports: { '.': './index.js' } } }

check('前置：DOCTOR_CLI 可解析', existsSync(DOCTOR_CLI), DOCTOR_CLI)
check('前置：契约 dist 暴露 validateManifest 与 provides 面', typeof validateManifest === 'function' && typeof contract.PLUGIN_CONTRACT_VERSION === 'string')

// ── A 存量 6 份 manifest（S1 剔除批 7→6）：契约 ok ⇒ doctor 不得对同一文件报 schema error ──
const builtinManifests = ['dsh.plugin.json', 'panel/dsh.plugin.json']
for (const e of readdirSync(join(ROOT, 'lib'), { withFileTypes: true })) {
  const rel = 'lib/' + e.name + '/dsh.plugin.json'
  if (e.isDirectory() && existsSync(join(ROOT, rel))) builtinManifests.push(rel)
}
check('A0 内置 manifest 计数 = 6（4 lib + 桶根 + panel）', builtinManifests.length === 6, builtinManifests.join(', '))

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

// ── B 纯契约 manifest：两侧都放行根必填面（前置① 撤销后的分权新形态，EXE-BOOT-016 笔 3）─────
// 本段在 2026-09-29 前钉的是"契约放行、doctor 判三个根必填缺失"（题 2 旧口径：必填性归 doctor 独占）。
// recon §8.3 的连带修正把管辖权改述为「`requirements` **在场时**其键集与 ./ 目标存在性归 doctor；
// provides/requires 合法性归契约」⇒ 根必填撤销后，本段的命题从"谁判缺"换成"在场管、缺席整段跳过且
// **跳过本身是断言**"。旧 B2/B3 的字面期望随改述翻面，这是**已裁条文的落码**、不是改测试凑绿；
// 判据来源逐条写在格名与 debt C-2 前置①（toolkit:docs/debt.md）与启动包第八节 3d。
{
  const scope = tmpScope('pure-contract', { ...CONTRACT_BASE })
  const verdict = validateManifest(JSON.parse(readFileSync(join(scope, 'dsh.plugin.json'), 'utf8')))
  const report = runDoctorJson(scope)
  // 只断言"三个根必填"这一件事：doctor 另有套件级规则（aliases 表、套件根 exports 须 $from、
  // @local 引用须可解析），那是它的管辖面、与本对账命题无关 ⇒ 不把它们的出现与否写进断言，
  // 否则本步会替 doctor 的规则面背书（那是另一种打脸）。
  const rootMissing = (issues) => (issues || [])
    .filter((i) => i.id === 'schema.required-missing' && /^缺少必填字段/.test(String(i.message)))
    .map((i) => String(i.message).replace(/^缺少必填字段: /, '').replace(/。$/, '').split(', '))
    .flat()
  const reqIssues = (issues) => (issues || []).filter((i) => /requirements/.test(String(i.message)))
  const missing1 = rootMissing(report.issues)
  check('B1 纯契约 manifest 过契约（契约不管必填性）', verdict.ok === true, JSON.stringify(verdict.errors && verdict.errors.map((e) => e.code + '@' + e.path)))
  check('B2 同一份在 doctor 侧不再产根必填缺失（前置① 撤销在位，旧"三根必填"口径作废）',
    missing1.length === 0, 'missing=' + missing1.join('/'))
  check('B5 空转可见断言：requirements 缺席时 doctor 对它零 issue（跳过＝被断言的行为，不是隐患）',
    reqIssues(report.issues).length === 0, JSON.stringify(reqIssues(report.issues).map((i) => i.message)))
  // 在场才管：requirements 写了但键集不齐 ⇒ 本 CLI 仍逐名报"requirements 缺少必填字段"（题 2 交给 doctor 的那半保留）
  const partial = { ...CONTRACT_BASE, requirements: { runtime: {}, binaries: [] } }
  const scopeP = tmpScope('req-partial', partial)
  const reportP = runDoctorJson(scopeP)
  const reqMissing = (reportP.issues || [])
    .filter((i) => i.id === 'schema.required-missing' && /^requirements 缺少必填字段/.test(String(i.message)))
    .map((i) => String(i.message).replace(/^requirements 缺少必填字段: /, '').replace(/。$/, ''))
  check('B3 requirements 在场时键集仍归 doctor（缺 packages/registers/exports 三名逐名报，管辖权未丢）',
    ['packages', 'registers', 'exports'].every((k) => reqMissing.includes(k)), 'reported=' + reqMissing.join('/'))
  check('B4 契约对同一份带 requirements 的混合形态仍判 ok（两侧不互相打脸）', validateManifest(partial).ok === true)
  const triad = { ...CONTRACT_BASE, ...JSON.parse(JSON.stringify(LEGACY_TRIAD)) }
  check("B6 齐载 legacy 双根（name/requirements）的同一份：两侧都不报根必填缺失（撤销未误伤存量形态；manifestVersion 已随甲'收紧转 error 档、由 D22 单独钉）",
    rootMissing(runDoctorJson(tmpScope('with-triad', triad)).issues).length === 0 && validateManifest(triad).ok === true)
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

  // C8～C10（v1.3 扩槽，debt C-3 一.2／F-87）：新三槽 entry/inject/tools 的两侧接缝。
  // 分工不变＝"形状与未知子键归契约、根键名在册归 doctor"；doctor 对 provides 的值面零校验
  // 是已裁边界（本段把它保持为可见断言，不偷偷扩成"doctor 也开始校验"）。
  const six = {
    ...CONTRACT_BASE,
    ...LEGACY_TRIAD,
    provides: {
      services: ['parity.svc'], commands: ['parity.cmd'], providers: ['parity.prov'],
      entry: './index.js', inject: ['parity.face'], tools: ['parity_tool'],
    },
  }
  const scopeSix = tmpScope('provides-six-slots', six)
  const reportSix = runDoctorJson(scopeSix)
  const sixIllegal = (reportSix.issues || []).filter((i) => /清单根字段非法/.test(String(i.message)))
  check('C8 契约接受六槽齐载的 provides（v1.3 扩槽 entry/inject/tools）', validateManifest(six).ok === true,
    JSON.stringify((validateManifest(six).errors || []).map((e) => e.code + '@' + e.path)))
  check('C8b doctor 对六槽齐载不报根字段非法（provides 仍是它认识的根键）', sixIllegal.length === 0,
    sixIllegal.map((i) => i.message).join(' / '))

  const badEntry = { ...six, provides: { ...six.provides, entry: 42 } }
  const vEntry = validateManifest(badEntry)
  check('C9 契约拒 entry 非字符串（单值槽与名单槽分形），doctor 侧仍不报根字段非法',
    vEntry.ok === false && (vEntry.errors || []).some((e) => e.path === 'provides.entry' && e.code === 'type'),
    JSON.stringify((vEntry.errors || []).map((e) => e.code + '@' + e.path)))

  const typoNew = { ...six, provides: { ...six.provides, entries: './index.js' } }
  const vTypoNew = validateManifest(typoNew)
  const typoChild = (vTypoNew.errors || []).filter((e) => e.code === 'unknown-field' && e.path === 'provides.entries')
  check('C10 契约对新槽族的拼错名仍拒（entries 不得静默失效；expected 含六槽名）',
    vTypoNew.ok === false && typoChild.length === 1 && /inject/.test(String(typoChild[0].expected)) && /entry/.test(String(typoChild[0].expected)),
    'ok=' + vTypoNew.ok + ' expected=' + String(typoChild[0] && typoChild[0].expected))

  // C11/C12（S3 迁移笔，甲案终批）：迁移后的两种形态各自钉一面——
  //   纯契约（零 legacy 根字段）＋provides 三面；混合形态（provides 已迁＋info 级遗留骨架在场）
  //   ＝本仓六份清单今天的真实形状。doctor 侧仍按"根字段在册与否"取样（套件级规则如 aliases 表、
  //   exports macro 由本文件 B/D 段与 doctor 自有四套件负责，此处不替整张规则表背书）。
  const pure = {
    ...CONTRACT_BASE,
    provides: { services: ['parity.svc'], inject: ['parity.face'], entry: './index.js' },
  }
  const reportPure = runDoctorJson(tmpScope('mig-pure', pure))
  const pureIllegal = (reportPure.issues || []).filter((i) => /清单根字段非法/.test(String(i.message)))
  const vPure = validateManifest(pure)
  check('C11 纯契约 manifest（无 requirements＋provides 三面齐载）：契约 ok、doctor 不报根字段非法',
    vPure.ok === true && pureIllegal.length === 0 && (vPure.info || []).length === 0,
    'contract.ok=' + vPure.ok + ' errors=' + JSON.stringify((vPure.errors || []).map((e) => e.code + '@' + e.path))
    + ' info=' + JSON.stringify((vPure.info || []).map((i) => i.path)) + ' doctor=' + JSON.stringify(pureIllegal.map((i) => i.message)))

  const mixed = {
    ...CONTRACT_BASE,
    // 迁移后的遗留残留＝requirements 骨架 + 无替代根字段三名；manifestVersion/name 已删（有替代）
    requirements: LEGACY_TRIAD.requirements,
    provides: { services: ['parity.svc'], inject: ['parity.face'], entry: './index.js' },
    aliases: { 'old-parity': 'parity/unit' }, optionalDeps: ['@local/optional'],
  }
  const reportMixed = runDoctorJson(tmpScope('mig-mixed', mixed))
  const mixedIllegal = (reportMixed.issues || []).filter((i) => /清单根字段非法/.test(String(i.message)))
  const vMixed = validateManifest(mixed)
  const mixedInfo = (vMixed.info || []).map((i) => i.path)
  check('C12 混合形态（provides 已迁＋遗留骨架在场）：契约 ok 且 info 恰含该三名、doctor 不报根字段非法',
    vMixed.ok === true && mixedIllegal.length === 0
    && mixedInfo.includes('requirements') && mixedInfo.includes('aliases') && mixedInfo.includes('optionalDeps')
    && !mixedInfo.includes('manifestVersion') && !mixedInfo.includes('name'),
    'ok=' + vMixed.ok + ' info=' + JSON.stringify(mixedInfo) + ' doctor=' + JSON.stringify(mixedIllegal.map((i) => i.message)))
}

// ── D 重叠面逐规则对账（契约 v1.2 题一终批＝案二：维持两引擎＋对账网扩面）────────────
// 三类结论各按实况登记，不混成"大致一致"：
//   同向红   ＝两侧都拒（判据同名或异名都在断言里写明）
//   契约严   ＝契约拒、doctor 放行（值语义归契约，doctor 只看"是不是已知根字段"）
//   方向相反 ＝契约按迁移期容忍、doctor 判非法根字段＝清单正典 H4 的在册分叉（本批不判谁对，只钉住现状）
// doctor 侧只按**本条规则的消息形态**取样：其余套件级规则（aliases 表、exports macro 等）不入断言，
// 否则这一步会替 doctor 的整张规则表背书（与 B 段同一条纪律）。
{
  const M = (extra) => ({ ...CONTRACT_BASE, ...LEGACY_TRIAD, ...extra })
  const contractDigest = (m) => {
    const v = validateManifest(m)
    return v.ok === true
      ? { ok: true, errors: [], info: (v.info || []).map((i) => i.path) }
      : { ok: false, errors: (v.errors || []).map((e) => e.code + '@' + e.path), info: (v.info || []).map((i) => i.path) }
  }
  const RULES = [
    // n=格名，m=夹具，c=契约侧期望（red 时给 code@path 形态），d=doctor 侧期望（给消息形态）
    { n: 'D01 id 非命名空间式', m: M({ id: 'Bad Id' }), c: ['red', /format@id/], d: ['red', /id 必须为命名空间式/] },
    { n: 'D02 displayName 空串', m: M({ displayName: '' }), c: ['red', /type@displayName/], d: ['red', /displayName 必须为非空字符串/] },
    { n: 'D03 version 空串', m: M({ version: '' }), c: ['red', /format@version/], d: ['red', /version 必须为非空字符串/] },
    { n: 'D04 version 非 semver（"1"）＝契约严', m: M({ version: '1' }), c: ['red', /format@version/], d: ['green', /version 必须/] },
    { n: 'D05 contract 非法范围（"garbage"）＝契约严', m: M({ contract: 'garbage' }), c: ['red', /format@contract/], d: ['green', /contract 必须/] },
    { n: 'D06 contract 值不放行当前契约版本（"1.0.0"）＝契约严', m: M({ contract: '1.0.0' }), c: ['red', /value@contract/], d: ['green', /contract 必须/] },
    { n: 'D07 configSchema 非对象', m: M({ configSchema: 'nope' }), c: ['red', /type@configSchema/], d: ['red', /configSchema 必须为 Schema 定义对象/] },
    { n: 'D08 panels 项缺 id＝契约严（doctor 零校验 panels 值）', m: M({ panels: [{ title: 'x' }] }), c: ['red', /@panels\[0\]\.id/], d: ['green', /panels/] },
    { n: 'D09 requires.services 非数组＝契约严', m: M({ requires: { services: 'llm' } }), c: ['red', /type@requires\.services/], d: ['green', /requires/] },
    { n: 'D10 provides 未知子键＝契约严', m: M({ provides: { prividers: ['a'] } }), c: ['red', /unknown-field@provides\.prividers/], d: ['green', /provides/] },
    { n: 'D11 provides.services 非数组＝契约严', m: M({ provides: { services: 'a' } }), c: ['red', /type@provides\.services/], d: ['green', /provides/] },
    // D19～D21（v1.3 扩槽随新槽扩的对账面）：新三槽都在"契约管形状、doctor 管键名"的既有分权里，
    // 各格给该槽自己的违例形态；doctor 侧一律 green＝它对 provides 的值面零校验（已裁边界，不背书）。
    { n: 'D19 provides.entry 非字符串＝契约严（单值槽）', m: M({ provides: { entry: 42 } }), c: ['red', /type@provides\.entry/], d: ['green', /provides/] },
    { n: 'D20 provides.tools 非数组＝契约严（F-87 新槽与三旧槽同族）', m: M({ provides: { tools: 'parity_tool' } }), c: ['red', /type@provides\.tools/], d: ['green', /provides/] },
    { n: 'D21 provides.inject 成员空白＝契约严（按下标定位）', m: M({ provides: { inject: ['ok.face', '  '] } }), c: ['red', /type@provides\.inject\[1\]/], d: ['green', /provides/] },
    // D12/D13：S3 甲'收紧把这两个顶层形态（带契约面时）从 info 转成 error ⇒ 原来的"方向相反（H4 在册）"
    // 自此**合流为同向红**（两侧都拒，成因不同名：契约报"与契约面双写"，doctor 报"清单根字段非法"）。
    // 历史方向相反那条陈述照录不改（错账不回改），以本行为准；无契约面时的容忍面由 D23 单独钉。
    { n: "D12 顶层 registers＝同向红（甲'收紧后契约也拒＝双写）", m: M({ registers: { services: ['a'] } }), c: ['red', /unknown-field@registers/], d: ['red', /清单根字段非法: registers/] },
    { n: "D13 顶层 exports＝同向红（甲'收紧后契约也拒＝双写）", m: M({ exports: { '.': './index.js' } }), c: ['red', /unknown-field@exports/], d: ['red', /清单根字段非法: exports/] },
    { n: 'D22 manifestVersion＝收紧本体（契约拒、doctor 仍认该键名）', m: M({ manifestVersion: 1 }), c: ['red', /unknown-field@manifestVersion/], d: ['green', /manifestVersion/] },
    { n: "D23 纯宿主原生形态带顶层 exports＝契约容忍（零 unknown-field、exports 落 info）、doctor 冻结线照旧判非法", m: { manifestVersion: 1, name: 'dsh-toolkit/parity-native', requirements: { runtime: {}, binaries: [], packages: {}, registers: {}, exports: { '.': './index.js' } }, exports: { '.': './index.js' } }, c: ['required-only', 'exports'], d: ['red', /清单根字段非法: exports/] },
    { n: 'D14 顶层 healthCheck＝同向红、成因不同名', m: M({ healthCheck: 'x' }), c: ['red', /type@healthCheck/], d: ['red', /清单根字段非法: healthCheck/] },
    { n: 'D15 未知根字段 zzNote＝同向红', m: M({ zzNote: 1 }), c: ['red', /unknown-field@zzNote/], d: ['red', /清单根字段非法: zzNote/] },
    { n: 'D16 纯契约 manifest（无 legacy 三必填）＝根必填已撤', m: { ...CONTRACT_BASE }, c: ['ok', null], d: ['green', /缺少必填字段/] },
    { n: 'D18 requirements 在场而键集不齐＝契约 ok、doctor 逐名报（在场才管）', m: { ...CONTRACT_BASE, requirements: { runtime: {}, binaries: [] } }, c: ['ok', null], d: ['red', /requirements 缺少必填字段/] },
    { n: 'D17 正向齐载＝两侧都放行重叠规则', m: M({}), c: ['ok', null], d: ['green', /清单根字段非法|缺少必填字段|id 必须|displayName 必须|version 必须|configSchema 必须|contract 必须/] },
  ]
  for (const rule of RULES) {
    const cRes = contractDigest(rule.m)
    const dMsgs = (runDoctorJson(tmpScope('overlap-' + rule.n.slice(0, 3), rule.m)).issues || [])
      .filter((i) => i.id && String(i.id).startsWith('schema.'))
      .map((i) => String(i.message))
    const [cMode, cMatch] = rule.c
    const [dMode, dMatch] = rule.d
    let cOk
    if (cMode === 'red') cOk = cRes.errors.some((s) => cMatch.test(s))
    else if (cMode === 'required-only') cOk = cRes.errors.length > 0 && cRes.errors.every((s) => s.startsWith('required@')) && cRes.info.includes(cMatch)
    else if (cMatch) cOk = cRes.ok === true && cRes.info.includes(cMatch)
    else cOk = cRes.ok === true
    const dHit = dMsgs.some((s) => dMatch.test(s))
    const dOk = dMode === 'red' ? dHit : !dHit
    check(rule.n + '（契约 ' + cMode + '／doctor ' + dMode + '）', cOk && dOk,
      'contract.ok=' + cRes.ok + ' errors=' + JSON.stringify(cRes.errors) + ' info=' + JSON.stringify(cRes.info)
      + ' doctor=' + JSON.stringify(dMsgs))
  }
}

// ── E 根字段键集对账＝清单正典 H4 的活体钉（差集恰三名，多一名少一名都红）───────────
{
  // 取值一律给"该键自己的合法形态"，确保测的是**键名在册与否**、不是值语义（值面归 D 段）。
  const KEY_VALUES = {
    // 契约侧 9 键
    id: 'parity/unit', displayName: '键集对账', version: '1.0.0', contract: '^1.0',
    requires: { services: ['llm'] }, configSchema: { type: 'object', properties: {} },
    panels: [{ id: 'main' }],
    // healthCheck 给**非函数**值：JSON 落盘丢函数（第一版探针就栽在这里，function 被 stringify 成
    // 键都不剩 ⇒ doctor 侧"放行 healthCheck"是夹具假象）。契约侧对它报 type 而非 unknown-field，
    // 本节判据是"键名在册与否"，故字符串值正是想要的形态（值语义在 D14 格里钉）。
    healthCheck: 'x',
    provides: { services: ['parity.svc'] },
    // legacy 侧 8 键
    manifestVersion: 1, name: 'dsh-toolkit/parity-keyset',
    requirements: { runtime: {}, binaries: [], packages: {}, registers: {}, exports: { '.': './index.js' } },
    registers: { services: ['parity-legacy'] }, exports: { '.': './index.js' },
    aliases: { 'old-parity': 'parity/unit' }, optionalDeps: ['@local/optional'], requiredAliases: { 'old-parity': 'parity/unit' },
  }
  const allKeys = Object.keys(KEY_VALUES)
  // 契约侧"在册"判据＝不因该键报 unknown-field（healthCheck 落盘被 type 拒是另一条在册规则）
  const contractUnknown = new Set()
  for (const k of allKeys) {
    const v = validateManifest({ ...CONTRACT_BASE, ...LEGACY_TRIAD, [k]: KEY_VALUES[k] })
    const errs = (v.errors || []).filter((e) => e.code === 'unknown-field')
    if (errs.some((e) => e.path === k)) contractUnknown.add(k)
  }
  const contractListed = allKeys.filter((k) => !contractUnknown.has(k))
  // doctor 侧"在册"判据＝不报"清单根字段非法: k"（一次合并探针取全部键名，省 31 次子进程）
  const merged = { ...CONTRACT_BASE }
  for (const k of allKeys) merged[k] = KEY_VALUES[k]
  const mergedScope = tmpScope('keyset-merged', merged)
  const illegal = (runDoctorJson(mergedScope).issues || [])
    .map((i) => String(i.message))
    .filter((s) => /清单根字段非法: /.test(s))
    .map((s) => (s.match(/清单根字段非法: ([A-Za-z]+)/) || [])[1])
  const doctorListed = allKeys.filter((k) => !illegal.includes(k))
  const onlyContract = contractListed.filter((k) => !doctorListed.includes(k)).sort()
  const onlyDoctor = doctorListed.filter((k) => !contractListed.includes(k)).sort()
  check("E1 契约在册根字段 = 14 键（9 契约 + 5 info 档；甲'收紧后 error 面三名不算在册，H4 的 17 键口径自此作废）", contractListed.length === 14,
    '实得 ' + contractListed.length + '：' + contractListed.sort().join(','))
  check('E2 doctor 白名单 = 14 键（数量与契约在册集相等，但**不再是子集关系**——见 E3/E4 两侧各差一名）',
    doctorListed.length === 14, '实得 ' + doctorListed.length + '：' + doctorListed.join(','))
  check('E3 契约独有恰 {healthCheck}（doctor 仍认它是非法根字段，契约认它＝在册、值面另判）',
    JSON.stringify(onlyContract) === JSON.stringify(['healthCheck']), '实得 ' + JSON.stringify(onlyContract))
  // E4 原判据"反向差集必空"自 S3 甲'收紧起**作废**（错账不回改，此注为准）：error 面三名转 error 后，
  // doctor 仍认 manifestVersion 这个键名 ⇒ 差集恰一名。这不是新缺陷，是"分层收紧只动契约一档"的必然投影，钉成可见断言。
  check("E4 doctor 独有恰 {manifestVersion}（甲'收紧只推契约一档，冻结 CLI 仍认旧键名）",
    JSON.stringify(onlyDoctor) === JSON.stringify(['manifestVersion']), '实得 ' + JSON.stringify(onlyDoctor))
  check('E5 合并探针里 doctor 恰好只报三名 {exports, healthCheck, registers}（探针自身无越界命中）',
    [...new Set(illegal.filter((k) => allKeys.includes(k)))].sort().join(',') === 'exports,healthCheck,registers',
    'doctor 非法名=' + JSON.stringify([...new Set(illegal)].sort()))
}

console.log('')
console.log('RESULT: ' + passed + '/' + (passed + failures.length) + ' PASS' + (failures.length ? '  FAILED=' + failures.length : ''))
if (failures.length) {
  console.log(failures.map((f) => '  × ' + f).join('\n'))
  process.exit(1)
}
