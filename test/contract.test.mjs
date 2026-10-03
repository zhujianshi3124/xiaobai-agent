// DSH Sub-Plugin Contract v1 单测（REQ-1）：类型出口 + 版本常量 + semver 范围
// + manifest/绑定校验（正反 fixture，精确错误定位）+ 命名前缀。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  PLUGIN_CONTRACT_VERSION,
  parseSemver,
  compareSemver,
  versionSatisfies,
  isValidRange,
  validateManifest,
  validateModuleExports,
  KNOWN_LEGACY_FIELDS,
  LEGACY_ERROR_FIELDS,
  LEGACY_INFO_FIELDS,
  manifestHasContract,
  CONTRACT_EVENT_NAMES,
  contractServiceName,
  contractEventName,
  isValidServicePrefix,
} from 'xiaobai-agent/contract';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(join(here, 'fixtures', 'contract', name), 'utf8'));

// ── 契约身份 ──────────────────────────────────────────────────────────────

test('契约版本常量为 1.3.0 且 semver 合法（EXE-BOOT-028 用户裁决②升次版本；钉的命题不变＝常量是当前生效契约版本且可解析）', () => {
  assert.equal(PLUGIN_CONTRACT_VERSION, '1.3.0');
  assert.ok(parseSemver(PLUGIN_CONTRACT_VERSION));
});

// ── 批 11：版本提升的对偶与红线解除 ─────────────────────────────────────────
// recon §1 第 6 项/§4-⑤ 的实测对偶：^1.0 放行 1.1.0（旧 manifest 零迁移）；
// ^1.1 在 1.0.0 上判不通过 ⇒ "勿提前写 ^1.1"红线曾由此得证。批 11 落地后
// ^1.1 自此可写（红线解除，migration 说明同步）；破坏性变更才升主版本的红线未触碰。

test('批11·对偶：常量被 ^1.0 放行、^1.1 自此放行而 1.0.0 仍被拒（修前红：常量未升）', () => {
  assert.ok(versionSatisfies(PLUGIN_CONTRACT_VERSION, '^1.0'), '旧清单 ^1.0 继续可用（零迁移）');
  assert.ok(versionSatisfies(PLUGIN_CONTRACT_VERSION, '^1.1'), '^1.1 红线解除（实现已在位）');
  assert.ok(!versionSatisfies('1.0.0', '^1.1'), '对偶成立：^1.1 确实拒绝旧版本');
});

test('批11·contract 值错误的提示串引用常量（防升版漏改，recon §4-③ 漏项；修前红：提示串硬编码 1.0.0）', () => {
  const verdict = validateManifest({ id: 'dsh/x', displayName: 'X', version: '1.0.0', contract: '^2.0' });
  assert.equal(verdict.ok, false);
  const err = verdict.errors.find((e) => e.path === 'contract' && e.code === 'value');
  assert.ok(err, '存在 contract 值错误');
  assert.ok(
    String(err.expected).includes(PLUGIN_CONTRACT_VERSION),
    `expected 提示须含当前常量值 ${PLUGIN_CONTRACT_VERSION}，实际：${JSON.stringify(err.expected)}`,
  );
});

// ── semver 解析与比较 ─────────────────────────────────────────────────────

test('semver 解析：核心、prerelease、build 元数据忽略、非法拒绝', () => {
  assert.deepEqual(parseSemver('1.2.3'), { major: 1, minor: 2, patch: 3, prerelease: [] });
  assert.deepEqual(parseSemver('1.2.3-rc.1'), { major: 1, minor: 2, patch: 3, prerelease: ['rc', '1'] });
  assert.deepEqual(parseSemver('1.2.3-rc.1+build.5'), { major: 1, minor: 2, patch: 3, prerelease: ['rc', '1'] });
  assert.equal(parseSemver('1.2'), null);
  assert.equal(parseSemver('v1.2.3'), null); // 完整版本不含 v 前缀（范围比较器里才剥离）
  assert.equal(parseSemver(''), null);
});

test('semver 比较：prerelease 低于正式版、数字标识符低于字母数字、逐段比较', () => {
  const c = (a, b) => Math.sign(compareSemver(parseSemver(a), parseSemver(b)));
  assert.equal(c('1.2.3', '1.2.3'), 0);
  assert.equal(c('1.2.4', '1.2.3'), 1);
  assert.equal(c('1.3.0', '1.2.9'), 1);
  assert.equal(c('2.0.0', '1.9.9'), 1);
  assert.equal(c('1.2.3-rc.1', '1.2.3'), -1);
  assert.equal(c('1.2.3-rc.1', '1.2.3-rc.2'), -1);
  assert.equal(c('1.2.3-1', '1.2.3-alpha'), -1); // 数字 < 字母数字
  assert.equal(c('1.2.3-rc.1.1', '1.2.3-rc.1'), 1); // 前缀相同，长的一方更高
});

// ── 范围匹配 ──────────────────────────────────────────────────────────────

test('caret 范围：^1.0 / ^0.2 / ^0.0.3 锁定左起首个非零分量', () => {
  assert.ok(versionSatisfies('1.0.0', '^1.0'));
  assert.ok(versionSatisfies('1.9.9', '^1.0'));
  assert.ok(!versionSatisfies('2.0.0', '^1.0'));
  assert.ok(!versionSatisfies('2.0.0-rc.1', '^1.0')); // 预发版不被无 prerelease 的范围命中
  assert.ok(versionSatisfies('0.2.5', '^0.2'));
  assert.ok(!versionSatisfies('0.3.0', '^0.2'));
  assert.ok(versionSatisfies('0.0.3', '^0.0.3'));
  assert.ok(!versionSatisfies('0.0.4', '^0.0.3'));
});

test('tilde 与 x 范围：~1.2.3 / 1.x / 1.2 / *', () => {
  assert.ok(versionSatisfies('1.2.9', '~1.2.3'));
  assert.ok(!versionSatisfies('1.3.0', '~1.2.3'));
  assert.ok(versionSatisfies('1.9.0', '1.x'));
  assert.ok(!versionSatisfies('2.0.0', '1.x'));
  assert.ok(versionSatisfies('1.2.7', '1.2'));
  assert.ok(!versionSatisfies('1.3.0', '1.2'));
  assert.ok(versionSatisfies('0.0.1', '*'));
  assert.ok(!versionSatisfies('1.0.0-rc.1', '*'));
});

test('带比较符的部分版本：补零无上界（engines.node: ">=20" 语义，P4 回归）', () => {
  assert.ok(versionSatisfies('24.19.0', '>=20'), 'node 24 满足 >=20');
  assert.ok(versionSatisfies('20.0.0', '>=20'));
  assert.ok(!versionSatisfies('19.9.9', '>=20'));
  assert.ok(versionSatisfies('1.9.0', '>1'));
  assert.ok(!versionSatisfies('1.0.0', '>1'));
  assert.ok(!versionSatisfies('2.0.0', '>=20'), '不得误加上界');
  assert.ok(versionSatisfies('0.1.9', '<0.2'));
  assert.ok(!versionSatisfies('0.2.0', '<0.2'));
});

test('DSH 生态范围语义：>=0.1.2-rc.1 <0.2.0 命中 0.1.5-rc.1（显式偏差，见 semver.ts 头注）', () => {
  const range = '>=0.1.2-rc.1 <0.2.0';
  assert.ok(versionSatisfies('0.1.5-rc.1', range));
  assert.ok(versionSatisfies('0.1.2-rc.1', range));
  assert.ok(versionSatisfies('0.1.9', range));
  assert.ok(!versionSatisfies('0.2.0', range));
  assert.ok(!versionSatisfies('0.1.1', range));
});

test('OR 与精确匹配：|| 分组、=1.2.3', () => {
  assert.ok(versionSatisfies('1.9.0', '^1.0 || ^2.0'));
  assert.ok(versionSatisfies('2.5.0', '^1.0 || ^2.0'));
  assert.ok(!versionSatisfies('3.0.0', '^1.0 || ^2.0'));
  assert.ok(versionSatisfies('1.2.3', '=1.2.3'));
  assert.ok(!versionSatisfies('1.2.4', '=1.2.3'));
  assert.ok(versionSatisfies('1.2.3-rc.1', '1.2.3-rc.1')); // 精确含 prerelease
});

test('非法范围显式拒绝：连字符范围、^1.x、空串', () => {
  assert.equal(isValidRange('1.2.3 - 2.3.4'), false);
  assert.equal(isValidRange('^1.x'), false);
  assert.equal(isValidRange(''), false);
  assert.equal(isValidRange('latest'), false);
  assert.equal(versionSatisfies('1.2.3', 'garbage'), false);
});

// ── manifest 校验（正反 fixture）──────────────────────────────────────────

test('正向 fixture：全量合法 manifest 通过，存量字段降级为 info', () => {
  const result = validateManifest(fixture('valid-manifest.json'));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.manifest.id, 'dsh/rate-throttle');
    // 甲'收紧后该夹具不再携带 manifestVersion（带契约面＝双写 error）；name 属 info 档，仍降级不判红。
    assert.ok(result.info.some((i) => i.path === 'name'));
    assert.ok(result.info.every((i) => i.severity === 'info'));
  }
  // 名单本身的强度由下方「v1.2 前置④」整节守（原此行的 includes('manifestVersion') 是 1/8 钉，
  // 收紧动作不允许建立在只钉住一个名字的名单上 ⇒ 已换成 deepEqual 全清单 + 逐名 info/error 分面钉）。
});

// ── v1.2 前置④：KNOWN_LEGACY_FIELDS 全清单守卫（EXE-BOOT-016 笔 1）─────────────
// 为什么现在立它：收紧动作（迁移期 info ⇒ error）一旦在无全清单钉时进行，名单被增删一格
// 无人发现，"收紧了什么"就成了账面猜。前置④ 要求这是开工第一笔，且数据复用既有枚举面。
// 名单正典：contract/src/validate.ts 的 KNOWN_LEGACY_FIELDS（八名，顺序即声明序）。

const LEGACY_NAMES_CANON = [
  'aliases',
  'exports',
  'manifestVersion',
  'name',
  'optionalDeps',
  'registers',
  'requiredAliases',
  'requirements',
];

// S3 拆档后的两档正典名单（deepEqual 钉在下方「S3 拆档」节；这里先立常量供逐名格与并集格复用）
const LEGACY_ERROR_NAMES_CANON = ['exports', 'manifestVersion', 'registers'];
const LEGACY_INFO_NAMES_CANON = ['aliases', 'name', 'optionalDeps', 'requiredAliases', 'requirements'];

test('v1.2 前置④·全清单钉：KNOWN_LEGACY_FIELDS deepEqual 八名（增/删/改名任一格即红）', () => {
  assert.deepEqual([...KNOWN_LEGACY_FIELDS].sort(), LEGACY_NAMES_CANON);
  assert.equal(KNOWN_LEGACY_FIELDS.length, 8, '名单长度另钉一格：deepEqual 靠 sort 抵消声明序，长度格防"并号"');
});

// ── S3 甲'收紧：名单拆两档（C1-007 甲'终裁，2026-10-01）────────────────────────
// 拆档后"收紧了什么"必须各自可钉——并集一格、两档各一格、两档互斥且并起来恰等于并集
// （任何一名同时进两档或两边都不进，当场翻红）；error 档的**条件位**（带契约面才判）另由
// 「收紧本体」与「纯宿主原生形态」两格对举钉死。

test("S3 拆档·全清单钉：error 档 deepEqual 三名＋info 档 deepEqual 五名（任一档改动即红）", () => {
  assert.deepEqual([...LEGACY_ERROR_FIELDS].sort(), ['exports', 'manifestVersion', 'registers'],
    "error 档＝有契约替代表达的三个名（替代面写在 validate.ts 常量注与 docs/contract.md §2）");
  assert.deepEqual([...LEGACY_INFO_FIELDS].sort(), ['aliases', 'name', 'optionalDeps', 'requiredAliases', 'requirements'],
    'info 档＝无替代或表达不完整的五个名（逐名成因＝docs/debt.md C-4）');
  assert.equal(LEGACY_ERROR_FIELDS.length, 3, '长度格防"并号"');
  assert.equal(LEGACY_INFO_FIELDS.length, 5, '长度格防"并号"');
});

test("S3 拆档·两档并集恰等于 KNOWN_LEGACY_FIELDS 且互斥（收紧不许建立在部分名字的名单上）", () => {
  const union = [...LEGACY_ERROR_FIELDS, ...LEGACY_INFO_FIELDS].sort();
  assert.deepEqual(union, [...KNOWN_LEGACY_FIELDS].sort(), '两档并起来必须恰是存量字段全名单（多一名少一名都红）');
  assert.deepEqual(LEGACY_ERROR_FIELDS.filter((k) => LEGACY_INFO_FIELDS.includes(k)), [], '两档必须互斥');
  assert.deepEqual(union, LEGACY_NAMES_CANON, '并集与历史全名单同集合（收紧没有悄悄扩名单）');
});

test("v1.2 前置④·S3 拆档后逐名 info：无替代的五名（带契约面在场）各自只产一条 info、不产 error", () => {
  const base = { id: 'dsh/parity-legacy', displayName: '前置④夹具', version: '1.0.0', contract: '^1.0' };
  // 值取各名字的现实形态，防"值形状碰巧触发别的校验"混进这一格的判据里
  const values = {
    aliases: { 'old-name': 'dsh/parity-legacy' },
    name: 'xiaobai-agent/parity-legacy',
    optionalDeps: ['@local/optional'],
    requiredAliases: { 'old-name': 'dsh/parity-legacy' },
    requirements: { runtime: { node: '>=22' }, binaries: [], packages: [], registers: {}, exports: {} },
  };
  for (const key of LEGACY_INFO_NAMES_CANON) {
    const result = validateManifest({ ...base, [key]: values[key] });
    const errDigest = JSON.stringify((result.errors || []).map((e) => e.code + '@' + e.path));
    assert.equal(result.ok, true, `${key} 属 info 档（契约无替代），不该判红，实得 errors=${errDigest}`);
    const hits = result.info.filter((i) => i.path === key);
    assert.equal(hits.length, 1, `${key} 应恰有一条 info，实得 ${hits.length} 条`);
    assert.equal(hits[0].severity, 'info');
    assert.equal(hits[0].code, 'unknown-field');
    assert.match(String(hits[0].message), /debt\.md C-4|无替代|表达不完整/, `${key} 的 info 文案要指路到成因清单`);
  }
});

test("S3 收紧本体·逐名 error：error 档三名**带契约面**在场各产一条 unknown-field error（且不再是 info）", () => {
  const base = { id: 'dsh/parity-tight', displayName: '收紧夹具', version: '1.0.0', contract: '^1.0' };
  const values = {
    manifestVersion: 1,
    registers: { services: ['parity'], events: [], commands: [], providers: [] },
    exports: { '.': './index.js' },
  };
  for (const key of LEGACY_ERROR_NAMES_CANON) {
    const result = validateManifest({ ...base, [key]: values[key] });
    assert.equal(result.ok, false, `${key} 带契约面再声明＝双写 ⇒ 转 error（这条就是"收紧本体"本身）`);
    const hits = (result.errors || []).filter((e) => e.code === 'unknown-field' && e.path === key);
    assert.equal(hits.length, 1, `${key} 应恰一条 unknown-field error，实得 ${JSON.stringify((result.errors || []).map((e) => e.code + '@' + e.path))}`);
    assert.equal(hits[0].severity, 'error');
    assert.equal((result.info || []).filter((i) => i.path === key).length, 0, `${key} 不得同时再产 info（两档互斥）`);
    assert.match(String(hits[0].message), /双写|替代/, `${key} 的 error 文案要写清双写语义与替代品`);
  }
});

test("S3 甲'分层·纯宿主原生形态：error 档三名**无契约面**在场不产 error、降为 info（条件位的另一侧）", () => {
  // 与上一格对举：同一批字段、同一批值，唯一的差别是契约面在场与否 ⇒ error/info 翻面。
  // 无契约面清单本就按既有口径报 required@contract（不在本笔收紧面），此处只钉 legacy 字段不受牵连。
  const base = { id: 'dsh/parity-native', displayName: '原生形态夹具', version: '1.0.0' };
  const values = {
    manifestVersion: 1,
    registers: { services: ['parity'], events: [], commands: [], providers: [] },
    exports: { '.': './index.js' },
  };
  for (const key of LEGACY_ERROR_NAMES_CANON) {
    const result = validateManifest({ ...base, [key]: values[key] });
    const unknownErrors = (result.errors || []).filter((e) => e.code === 'unknown-field');
    assert.deepEqual(unknownErrors, [], `${key} 在纯宿主原生形态（无契约面）下不得判双写 error，实得 ${JSON.stringify(unknownErrors)}`);
    assert.ok((result.errors || []).some((e) => e.code === 'required' && e.path === 'contract'),
      '无契约面本身仍报 required@contract（既有行为，保持可见）');
    const hits = (result.info || []).filter((i) => i.path === key);
    assert.equal(hits.length, 1, `${key} 应恰有一条 info（容忍＋提醒），实得 ${hits.length} 条`);
    assert.match(String(hits[0].message), /纯宿主原生形态|容忍/, `${key} 的 info 文案要点明甲'容忍面`);
  }
});

test("S3 甲'分层·判据同源：manifestHasContract 与 loader 分支判据同一份实现（非空字符串才带契约面）", () => {
  assert.equal(manifestHasContract({ contract: '^1.0' }), true);
  assert.equal(manifestHasContract({ contract: '' }), false, '空串不算契约面（loader 同判：空 contract 落 legacy 合成）');
  assert.equal(manifestHasContract({ contract: 42 }), false, '非字符串不算契约面');
  assert.equal(manifestHasContract({}), false, '缺席不算契约面');
});

test('v1.2 前置④·第 9 名必 error：名单外的拼写不得被当作 legacy 容忍', () => {
  // 'registrs' 是 registers 的漏字母形式：若名单判定写成前缀/模糊匹配，它会混进 info 而当场翻红。
  const result = validateManifest({
    id: 'dsh/parity-legacy',
    displayName: '前置④夹具',
    version: '1.0.0',
    contract: '^1.0',
    registrs: { services: ['parity'] },
  });
  assert.equal(result.ok, false);
  const unknown = result.errors.find((e) => e.path === 'registrs');
  assert.ok(unknown, '名单外字段必须产 error，实得 ' + JSON.stringify(result.errors.map((e) => e.code + '@' + e.path)));
  assert.equal(unknown.code, 'unknown-field');
  assert.equal(unknown.severity, 'error');
  assert.equal(result.info.filter((i) => i.path === 'registrs').length, 0, 'error 侧不得同时混入 info（两套口径不许打同一格）');
});

test('v1.2 前置④·影响面实测复用：六份内置 manifest 的顶层 legacy 键全在册（收紧前必读）', () => {
  // 数据复用：recon §4 的"7 份 manifest 根字段枚举"在此变成可跑断言，而不是文档里的一段话。
  // （S1 剔除批后枚举面 7→6：web-search-local 已出包，v1.3 迁移清单同口径 6 份。）
  const roots = [
    'lib/agent-memory', 'lib/compact-router', 'lib/rate-throttle',
    'lib/search-router', '.', 'panel',
  ];
  const seenTop = new Set();
  const seenReq = new Set();
  let count = 0;
  for (const rel of roots) {
    const file = join(here, '..', rel, 'dsh.plugin.json');
    const m = JSON.parse(readFileSync(file, 'utf8'));
    count++;
    for (const k of Object.keys(m)) if (LEGACY_NAMES_CANON.includes(k)) seenTop.add(k);
    if (m.requirements && typeof m.requirements === 'object') {
      for (const k of Object.keys(m.requirements)) seenReq.add(k);
    }
  }
  assert.equal(count, 6, '枚举面＝有 manifest 的单元 6（4 lib + 桶根 + panel），与 recon §4 的数法一致（S1 剔除批 7→6）');
  // 顶层实况六名（registers/exports 在内置清单里只作为 requirements 的子键出现，不在顶层）。
  // 甲'收紧后的当场影响面＝零：五份带契约清单只剩 info 档五名（manifestVersion 已随迁移笔删除），
  // panel 无契约面（manifestVersion 属原生形态容忍）——这枚枚举格钉的是"影响面计算前提仍在"。
  assert.deepEqual([...seenTop].sort(), ['aliases', 'manifestVersion', 'name', 'optionalDeps', 'requiredAliases', 'requirements']);
  assert.deepEqual([...seenReq].sort(), ['binaries', 'exports', 'packages', 'registers', 'runtime']);
  // 顶层六名必须是名单子集：收紧为 error 时，这六名就是内置清单的当场影响面（防后来人以为只动 exports）
  for (const k of seenTop) assert.ok(KNOWN_LEGACY_FIELDS.includes(k), `${k} 在册才有"收紧"这一说`);
});

test('反向 fixture：缺必填字段 / 非法 version，逐条给出精确路径', () => {
  const result = validateManifest(fixture('invalid-missing-required.json'));
  assert.equal(result.ok, false);
  const paths = result.errors.map((e) => e.path).sort();
  assert.deepEqual(paths, ['contract', 'id', 'version']);
  assert.ok(result.errors.every((e) => e.severity === 'error'));
});

test('反向 fixture：id 必须是命名空间式 <scope>/<name>', () => {
  const result = validateManifest(fixture('invalid-bad-id.json'));
  assert.equal(result.ok, false);
  const idIssue = result.errors.find((e) => e.path === 'id');
  assert.ok(idIssue);
  assert.equal(idIssue.code, 'format');
  assert.match(idIssue.message, /命名空间/);
});

test('反向 fixture：requires 各子段的精确定位（端口/协议/访问位/环境变量名）', () => {
  const result = validateManifest(fixture('invalid-bad-requires.json'));
  assert.equal(result.ok, false);
  const paths = result.errors.map((e) => e.path);
  assert.ok(paths.includes('requires.dshRuntime'));
  assert.ok(paths.includes('requires.services[1]'));
  assert.ok(paths.includes('requires.subPlugins[0]'));
  assert.ok(paths.includes('requires.envVars[0].key'));
  assert.ok(paths.includes('requires.envVars[0].required'));
  assert.ok(paths.includes('requires.ports[0].port'));
  assert.ok(paths.includes('requires.ports[0].protocol'));
  assert.ok(paths.includes('requires.fsPaths[0].access'));
  assert.ok(paths.includes('requires.externalApis[0].url'));
  assert.ok(paths.includes('requires.externalApis[0].authEnv'));
});

test('反向 fixture：未知顶层字段（拼写错误）按 error 拒绝', () => {
  const result = validateManifest(fixture('invalid-unknown-field.json'));
  assert.equal(result.ok, false);
  const unknown = result.errors.find((e) => e.path === 'versionn');
  assert.ok(unknown);
  assert.equal(unknown.code, 'unknown-field');
});

test('反向 fixture：contract 范围必须兼容当前契约版本（消息点名常量现值；批 11 起钉常量不钉字面）', () => {
  const result = validateManifest(fixture('invalid-contract-range.json'));
  assert.equal(result.ok, false);
  const contractIssue = result.errors.find((e) => e.path === 'contract');
  assert.ok(contractIssue);
  assert.equal(contractIssue.code, 'value');
  assert.match(contractIssue.message, new RegExp(PLUGIN_CONTRACT_VERSION.replace(/\./g, '\\.')));
});

test('manifest 校验边界：非对象、healthCheck 落盘、panels 结构', () => {
  assert.equal(validateManifest('nope').ok, false);
  assert.equal(validateManifest(null).ok, false);

  const withBadHealthCheck = validateManifest({
    id: 'dsh/x',
    displayName: 'X',
    version: '1.0.0',
    contract: '^1.0',
    healthCheck: 'not-a-function',
  });
  assert.equal(withBadHealthCheck.ok, false);
  assert.ok(withBadHealthCheck.errors.some((e) => e.path === 'healthCheck'));

  const withPanels = validateManifest({
    id: 'dsh/x',
    displayName: 'X',
    version: '1.0.0',
    contract: '^1.0',
    panels: [{ id: 'main' }, { title: '缺 id' }],
  });
  assert.equal(withPanels.ok, false);
  assert.ok(withPanels.errors.some((e) => e.path === 'panels[1].id'));
});

// ── events 订阅面最小形状（D-13 ①，批 10 邻近笔）──────────────────────────
//
// 裁定口径（docs/contract.md §7 D-13）：甲案"位置不动"——events 仍写在 legacy
// `requirements.registers.events`，契约单层校验"字符串数组且成员非空"（与 provides
// 三槽同族收紧）；独立 doctor 对该面零校验是已裁边界（两仓分权不动）。

test('D-13①：requirements.registers.events 须为字符串数组且成员非空（修前红）', () => {
  const base = { id: 'dsh/x', displayName: 'X', version: '1.0.0', contract: '^1.0' };

  // 非数组 → error，路径点到位
  const nonArray = validateManifest({ ...base, requirements: { registers: { events: 'agent/request' } } });
  assert.equal(nonArray.ok, false);
  assert.ok(nonArray.errors.some((e) => e.path === 'requirements.registers.events' && e.code === 'type'));

  // 空串 / 纯空白 / 非字符串成员 → error，成员下标定位
  const withBlank = validateManifest({ ...base, requirements: { registers: { events: ['ok/event', ''] } } });
  assert.equal(withBlank.ok, false);
  assert.ok(withBlank.errors.some((e) => e.path === 'requirements.registers.events[1]'));

  const withSpace = validateManifest({ ...base, requirements: { registers: { events: ['ok/event', '   '] } } });
  assert.equal(withSpace.ok, false);
  assert.ok(withSpace.errors.some((e) => e.path === 'requirements.registers.events[1]'));

  const withNumber = validateManifest({ ...base, requirements: { registers: { events: ['ok/event', 42] } } });
  assert.equal(withNumber.ok, false);
  assert.ok(withNumber.errors.some((e) => e.path === 'requirements.registers.events[1]'));
});

test('D-13①：合法 events 形状与边界不受牵连（正向，修前即绿）', () => {
  const base = { id: 'dsh/x', displayName: 'X', version: '1.0.0', contract: '^1.0' };

  // 空数组 / 合法数组 / 缺席 → 照旧放行
  assert.equal(validateManifest({ ...base, requirements: { registers: { events: [] } } }).ok, true);
  assert.equal(validateManifest({ ...base, requirements: { registers: { events: ['agent/request', 'session/event'] } } }).ok, true);
  assert.equal(validateManifest({ ...base, requirements: { registers: {} } }).ok, true);
  assert.equal(validateManifest(base).ok, true);

  // 边界钉（防收紧过围）：registers 非对象维持既有容忍——D-13 只裁 events 形状，
  // registers 本体与"声明事件名 vs 宿主发出面"的深度校验都归 C-2/v1.2，本批不动。
  assert.equal(validateManifest({ ...base, requirements: { registers: 'nope' } }).ok, true);
  assert.equal(validateManifest({ ...base, requirements: { registers: { events: undefined } } }).ok, true);
});

// ── 模块导出（运行时绑定）校验 ────────────────────────────────────────────

test('绑定校验：configSchema/panels/healthCheck 的函数型导出形态', () => {
  assert.deepEqual(validateModuleExports(undefined), []);
  assert.deepEqual(validateModuleExports({}), []);

  const bad = validateModuleExports({ healthCheck: 'nope', configSchema: 42, panels: 'main' });
  assert.ok(bad.some((e) => e.path === 'healthCheck'));
  assert.ok(bad.some((e) => e.path === 'configSchema'));
  assert.ok(bad.some((e) => e.path === 'panels'));

  // 批 10：模块路径与落盘清单对"非空 id"同判（纯空白也拒）——守卫接线前此格形同虚设
  const withSpaceId = validateModuleExports({ panels: [{ id: '   ' }] });
  assert.equal(withSpaceId.length, 1);
  assert.ok(withSpaceId.some((e) => e.path === 'panels[0]'));

  const schemaFn = () => {};
  schemaFn.toJSON = () => ({ type: 'object' });
  const good = validateModuleExports({
    configSchema: schemaFn,
    panels: [{ id: 'main', title: '概览' }],
    healthCheck: async () => [],
  });
  assert.deepEqual(good, []);
});

// ── 命名前缀（D5 / REQ-8）─────────────────────────────────────────────────

test('服务与事件名：一律 ${servicePrefix}/…，非法前缀抛错', () => {
  assert.equal(contractServiceName('toolkit', 'registry'), 'toolkit/registry');
  assert.equal(contractServiceName('web-all.toolkit', 'doctor'), 'web-all.toolkit/doctor');
  assert.equal(contractEventName('toolkit', 'registry:status-changed'), 'toolkit/registry:status-changed');
  assert.ok(CONTRACT_EVENT_NAMES.includes('doctor:issue-found'));

  assert.equal(isValidServicePrefix('toolkit'), true);
  assert.equal(isValidServicePrefix(''), false);
  assert.equal(isValidServicePrefix('a/b'), false);
  assert.equal(isValidServicePrefix(' padded'), false);
  assert.throws(() => contractServiceName('a/b', 'registry'), TypeError);
  assert.throws(() => contractEventName('', 'registry:plugin-added'), TypeError);
});

// ── v1.3 扩槽（S3 / debt C-3 一.2）：provides 的 entry 单值槽＋inject/tools 名单槽 ──────
//
// 施工图正本＝`docs/debt.md` C-3 一.2：给入口声明与 inject 声明以契约替代表达（现正典位仍是
// `requirements.exports` 的 `.` 项与 `requirements.registers.inject`），F-87 tools 槽随同批。
// 两条边界（宿主运行时是否真把 tool 装配进模型可见面**未证**／本仓类型面无 `tools` 服务）
// 随行写在 `contract/src/types.ts` 的该槽注释里，本节不替宿主背书。
//
// 另立 **provides 槽名全清单守卫**——与 C-2 前置④ 的 KNOWN_LEGACY_FIELDS 全清单钉同一条纪律：
// 迁移与收紧都不允许建立在只钉住部分名字的名单上，名单增删改名必须当场翻红。取值一律给
// "该键自己的合法形态"，确保测的是**槽名在册与否**、不是值语义（值面归下面两节）。

const V13_BASE = { id: 'dsh/v13', displayName: '扩槽夹具', version: '1.0.0', contract: '^1.0' };
const PROVIDES_SLOT_NAMES_CANON = ['commands', 'entry', 'inject', 'providers', 'services', 'tools'];

test('v1.3 扩槽·全清单钉：未知子键的 expected 恰列六槽名（deepEqual＋长度格，增/删/改名任一格即红）', () => {
  const probe = validateManifest({ ...V13_BASE, provides: { zzzSlot: ['a'] } });
  const unknown = (probe.errors || []).filter((e) => e.code === 'unknown-field' && e.path === 'provides.zzzSlot');
  assert.equal(unknown.length, 1, '未知子键必须恰一条 unknown-field');
  assert.deepEqual(String(unknown[0].expected).split(' | ').sort(), PROVIDES_SLOT_NAMES_CANON);
  assert.equal(String(unknown[0].expected).split(' | ').length, 6, '槽名长度另钉一格：deepEqual 靠 sort 抵消声明序，长度格防"并号"');
});

test('v1.3 扩槽·全清单钉：六槽各自单独在场都 ok（名单槽给合法值、entry 给字符串）', () => {
  const values = {
    services: ['parity.svc'], commands: ['parity.cmd'], providers: ['parity.prov'],
    inject: ['webServer'], tools: ['parity_tool'], entry: './index.js',
  };
  for (const slot of PROVIDES_SLOT_NAMES_CANON) {
    const verdict = validateManifest({ ...V13_BASE, provides: { [slot]: values[slot] } });
    assert.equal(verdict.ok, true, `${slot} 单独在场应放行：${JSON.stringify((verdict.errors || []).map((e) => e.code + '@' + e.path))}`);
  }
});

test('v1.3 扩槽·新槽拼错名仍 unknown-field（entries／tool／injects 三形，替代表达不得开静默口子）', () => {
  for (const typo of ['entries', 'tool', 'injects']) {
    const verdict = validateManifest({ ...V13_BASE, provides: { [typo]: 'x' } });
    const hit = (verdict.errors || []).filter((e) => e.code === 'unknown-field' && e.path === `provides.${typo}`);
    assert.equal(verdict.ok, false, `provides.${typo} 拼错名必须拒`);
    assert.equal(hit.length, 1, `provides.${typo} 应恰一条 unknown-field：${JSON.stringify((verdict.errors || []).map((e) => e.code + '@' + e.path))}`);
  }
});

test('v1.3 扩槽·entry 是单值非空字符串（数组/数字/空串/纯空白都 error 且路径点名 provides.entry）', () => {
  for (const bad of [['./index.js'], 42, '', '   ']) {
    const verdict = validateManifest({ ...V13_BASE, provides: { entry: bad } });
    assert.equal(verdict.ok, false, `entry=${JSON.stringify(bad)} 必须拒`);
    assert.ok(
      (verdict.errors || []).some((e) => e.path === 'provides.entry' && e.code === 'type'),
      `要按 provides.entry 路径点到位：${JSON.stringify((verdict.errors || []).map((e) => e.code + '@' + e.path))}`,
    );
  }
});

test('v1.3 扩槽·inject/tools 与三旧槽同族形状（非数组拒、成员空白按下标定位）', () => {
  for (const slot of ['inject', 'tools']) {
    const nonArray = validateManifest({ ...V13_BASE, provides: { [slot]: 'webServer' } });
    assert.equal(nonArray.ok, false);
    assert.ok((nonArray.errors || []).some((e) => e.path === `provides.${slot}` && e.code === 'type'));

    const withBlank = validateManifest({ ...V13_BASE, provides: { [slot]: ['ok-name', '  '] } });
    assert.equal(withBlank.ok, false);
    assert.ok(
      (withBlank.errors || []).some((e) => e.path === `provides.${slot}[1]`),
      `成员下标要定位：${JSON.stringify((withBlank.errors || []).map((e) => e.code + '@' + e.path))}`,
    );
  }
});

test('v1.3 扩槽·六槽齐载整体 ok，且 events 仍专属 legacy（provides.events 照旧拒并指回）', () => {
  const allSix = validateManifest({
    ...V13_BASE,
    provides: {
      services: ['parity.svc'], commands: ['parity.cmd'], providers: ['parity.prov'],
      inject: ['webServer'], tools: ['parity_tool'], entry: './index.js',
    },
  });
  assert.equal(allSix.ok, true, JSON.stringify((allSix.errors || []).map((e) => e.code + '@' + e.path)));

  const withEvents = validateManifest({ ...V13_BASE, provides: { events: ['parity/event'] } });
  assert.equal(withEvents.ok, false, '扩槽不改 events 归属（2026-09-22 裁定采甲：订阅面留在 legacy registers）');
  assert.ok(
    (withEvents.errors || []).some((e) => e.path === 'provides.events' && /registers\.events/.test(String(e.expected) + String(e.message))),
  );
});

