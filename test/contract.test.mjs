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
  CONTRACT_EVENT_NAMES,
  contractServiceName,
  contractEventName,
  isValidServicePrefix,
} from '@local/dsh-toolkit/contract';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(join(here, 'fixtures', 'contract', name), 'utf8'));

// ── 契约身份 ──────────────────────────────────────────────────────────────

test('契约版本常量为 1.0.0 且 semver 合法', () => {
  assert.equal(PLUGIN_CONTRACT_VERSION, '1.0.0');
  assert.ok(parseSemver(PLUGIN_CONTRACT_VERSION));
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
    assert.ok(result.info.some((i) => i.path === 'manifestVersion'));
    assert.ok(result.info.every((i) => i.severity === 'info'));
  }
  assert.ok(KNOWN_LEGACY_FIELDS.includes('manifestVersion'));
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

test('反向 fixture：contract 范围必须兼容当前契约版本 1.0.0', () => {
  const result = validateManifest(fixture('invalid-contract-range.json'));
  assert.equal(result.ok, false);
  const contractIssue = result.errors.find((e) => e.path === 'contract');
  assert.ok(contractIssue);
  assert.equal(contractIssue.code, 'value');
  assert.match(contractIssue.message, /1\.0\.0/);
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
