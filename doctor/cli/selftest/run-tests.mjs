import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { runDoctor } from '../src/engine.mjs';
import { executeApply, executeRollback, readPatchState } from '../src/executor.mjs';

function mkFixture(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-doctor-' + name + '-'));
  const dirs = {
    root,
    scope: path.join(root, 'scope'),
    config: path.join(root, 'config'),
    profile: path.join(root, 'profiles', 'web'),
  };
  for (const d of [dirs.scope, dirs.config, dirs.profile]) fs.mkdirSync(d, { recursive: true });
  return dirs;
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}

function suiteManifest() {
  return {
    manifestVersion: 1,
    name: '@local/dsh-toolkit',
    aliases: {
      '@local/dsh-compact-router': '@local/dsh-toolkit/compact-router',
      '@local/agent-memory': '@local/dsh-toolkit/agent-memory',
    },
    requirements: {
      runtime: {},
      binaries: [],
      packages: {},
      registers: {},
      exports: {
        '$from': 'package.json#exports',
      },
    },
  };
}

function baseFixture(fixture) {
  writeJson(path.join(fixture.scope, 'package.json'), { name: '@local/dsh-toolkit', version: '0.1.0', type: 'module', exports: { './compact-router': './lib/compact-router/index.js', './agent-memory': './lib/agent-memory/index.js' } });
  writeJson(path.join(fixture.scope, 'dsh.plugin.json'), suiteManifest());
  writeText(path.join(fixture.profile, 'cordis.patch.yml'), '[]\n');
  writeJson(path.join(fixture.profile, 'package.json'), {
    name: 'dsh-profile-web',
    private: true,
    dependencies: { '@local/dsh-toolkit': 'link:D:/dsh-plugins/dsh-toolkit' },
    dsh: { profile: { bundles: ['@local/dsh-toolkit'] } },
  });
}

async function run(fixture, extra) {
  const opts = {
    scopeRoot: fixture.scope,
    configRoot: fixture.config,
    profileRoot: fixture.profile,
    now: '2026-09-14T08:00:00.000Z',
    // R4 测试隔离：本套件的宿主版本探测一律走替身 —— 宿主不在场的机器必须给出同一读数，
    // 且 15+ 个用例不该各自 spawn 一次真 dsh。需要验证探测面时用 extra 覆盖本项。
    hostVersionProbe: function () { return '0.0.0-fixture'; },
  };
  if (extra) Object.assign(opts, extra);
  return runDoctor(opts);
}

let passed = 0;
const testCases = [];
function test(name, fn) {
  testCases.push({ name, fn });
}

test('预设旧名回归：root/file/old/occurrence 唯一定位', async function () {
  const fixture = mkFixture('regression');
  baseFixture(fixture);
  writeText(path.join(fixture.config, '.agent-presets', 'liangshen', 'agent.cordis.yml'),
    'compaction:\n  name: \'@local/dsh-compact-router\'\n\nfallback:\n  name: \'@local/dsh-compact-router\'\n');
  const report = await run(fixture);
  const hits = report.issues.filter(function (issue) {
    return issue.id === 'ref.unresolvable-local' && issue.root === 'config' && issue.file === '.agent-presets/liangshen/agent.cordis.yml';
  });
  assert.equal(hits.length, 2, 'liangshen 预设应命中两次旧名引用');
  assert.equal(hits[0].old, '@local/dsh-compact-router');
  assert.equal(hits[0].new, '@local/dsh-toolkit/compact-router');
  assert.equal(hits[0].occurrence, 1);
  assert.equal(hits[0].line, 2);
  assert.equal(hits[1].occurrence, 2);
  assert.equal(hits[1].line, 5);
  assert.equal(hits[0].fix.class, 'rewrite');
  assert.equal(hits[0].fix.plan[0].op, 'replace');
  assert.equal(hits[0].fix.plan[0].occurrence, 1);
});

test('整词匹配：@local/dsh-web 不命中 @local/dsh-web-all', async function () {
  const fixture = mkFixture('word-boundary');
  baseFixture(fixture);
  writeText(path.join(fixture.config, 'dsh-search-router.json'), '{\n  "provider": "@local/dsh-web-all"\n}\n');
  const report = await run(fixture, { registryPlugins: ['@local/dsh-web'] });
  const hits = report.issues.filter(function (issue) { return issue.old === '@local/dsh-web-all'; });
  assert.equal(hits.length, 1, '只应报告完整未解析名 @local/dsh-web-all');
  assert.equal(report.issues.some(function (issue) { return issue.old === '@local/dsh-web'; }), false, '不得误报子串 @local/dsh-web');
});

test('root 归属优先级：profile 文件归 profile，且不重复报告', async function () {
  const fixture = mkFixture('root-priority');
  baseFixture(fixture);
  writeText(path.join(fixture.config, 'profiles', 'web', 'package.json'), '{\n  "bundles": ["@local/dsh-compact-router"]\n}\n');
  fs.mkdirSync(path.join(fixture.config, 'profiles', 'web'), { recursive: true });
  writeText(path.join(fixture.profile, 'package.json'), '{\n  "bundles": ["@local/dsh-compact-router"]\n}\n');
  const report = await run(fixture);
  const hits = report.issues.filter(function (issue) { return issue.id === 'ref.unresolvable-local' && issue.old === '@local/dsh-compact-router'; });
  assert.equal(hits.length, 1, '同一 profile 文件不得被 config 根重复报告');
  assert.equal(hits[0].root, 'profile');
  assert.equal(hits[0].file, 'package.json');
});

test('schema 检出 JSON 语法错、UTF-8 BOM、必填字段缺失', async function () {
  const fixture = mkFixture('schema');
  writeJson(path.join(fixture.scope, 'package.json'), { name: '@local/dsh-toolkit', version: '0.1.0', type: 'module', exports: { './compact-router': './lib/compact-router/index.js', './agent-memory': './lib/agent-memory/index.js' } });
  writeJson(path.join(fixture.scope, 'dsh.plugin.json'), suiteManifest());
  writeText(path.join(fixture.profile, 'cordis.patch.yml'), '[]\n');
  writeJson(path.join(fixture.profile, 'package.json'), { name: 'dsh-profile-web' });
  writeText(path.join(fixture.scope, 'lib', 'bad', 'dsh.plugin.json'), '{ invalid json\n');
  const bomFile = path.join(fixture.scope, 'lib', 'bom', 'dsh.plugin.json');
  fs.mkdirSync(path.dirname(bomFile), { recursive: true });
  fs.writeFileSync(bomFile, '\uFEFF' + JSON.stringify({ manifestVersion: 1, name: '@local/dsh-toolkit/agent-memory', requirements: {'binarys': []} }, null, 2) + '\n', 'utf8');
  writeJson(path.join(fixture.scope, 'lib', 'missing', 'dsh.plugin.json'), { manifestVersion: 1, name: '@local/dsh-toolkit/rate-throttle' });
  const report = await run(fixture);
  const ids = report.issues.map(function (issue) { return issue.id; });
  assert.ok(ids.includes('schema.json-syntax'), '应检出 JSON 语法错');
  assert.ok(ids.includes('schema.utf8-bom'), '应检出 UTF-8 BOM');
  assert.ok(ids.includes('schema.required-missing'), '应检出必填字段缺失');
});

test('契约 v1.1 批 1：provides 为合法根字段（零值校验）+ 拼错名仍判非法（防白名单放行过宽）', async function () {
  const fixture = mkFixture('manifest-provides');
  baseFixture(fixture);
  // provides 的形状按 contract.md §2 定稿（services/commands/providers 三槽）。本 CLI 只管"是不是已知根字段"，
  // 值语义归契约层（批 2 在 toolkit 侧校验）⇒ 这里用值上无可挑剔的完整形态，批 2 若日后收紧本断言仍成立。
  const ok = suiteManifest();
  ok.provides = { services: ['webServer'], commands: ['toolkit.status'], providers: ['compaction'] };
  writeJson(path.join(fixture.scope, 'dsh.plugin.json'), ok);
  const clean = await run(fixture);
  assert.equal(clean.issues.filter(function (issue) { return issue.category === 'schema'; }).length, 0,
    'provides 不得产生任何 schema issue: ' + JSON.stringify(clean.issues.filter(function (i) { return i.category === 'schema'; })));
  assert.equal(clean.issues.some(function (issue) { return String(issue.message).indexOf('provides') !== -1; }), false,
    '任何 issue 文案都不得点名 provides');
  assert.equal(clean.summary.error, 0, '夹具 + provides 应 0 error');
  // 对照组：只放行 provides 这一个已知名，拼错/未知根字段仍须 error（否则白名单等于放行一切）
  const typo = suiteManifest();
  typo.provides = { services: ['webServer'] };
  typo.provids = { services: ['webServer'] };
  writeJson(path.join(fixture.scope, 'dsh.plugin.json'), typo);
  const red = await run(fixture);
  const illegal = red.issues.filter(function (issue) { return issue.id === 'schema.requirements-invalid'; });
  assert.equal(illegal.length, 1, '未知根字段必须且只报一条: ' + JSON.stringify(illegal));
  assert.equal(illegal[0].severity, 'error', '未知根字段维持 error 级（P0-1 定稿口径：不降级）');
  assert.match(illegal[0].message, /^清单根字段非法: provids。$/);
  assert.equal(illegal[0].file, 'dsh.plugin.json');
});

test('夹具≠在案本体（D-UI-06 同族·两线碰撞裁决 b）：test/ 目录不在扫描面——故意无效夹具零检出，lib/ 对照组与 lib/test 例外仍检出', async function () {
  const fixture = mkFixture('fixture-scope');
  baseFixture(fixture);
  // 与泛化线 registry 夹具同构的「故意无效」manifest（schema.required-missing / json-syntax），
  // 落 test/ 下各深度 ⇒ 不得产生任何 issue；同型内容落 lib/ 下 ⇒ 必须仍检出。
  writeJson(path.join(fixture.scope, 'test', 'fixtures', 'registry', 'invalid-manifest-plugin', 'dsh.plugin.json'), { manifestVersion: 1, name: '@local/dsh-toolkit/fixture-a' });
  writeText(path.join(fixture.scope, 'test', 'fixtures', 'registry', 'broken-plugin', 'dsh.plugin.json'), '{ invalid json\n');
  writeText(path.join(fixture.scope, 'panel', 'test', 'fixtures', 'nested', 'dsh.plugin.json'), '{ invalid json\n');
  writeText(path.join(fixture.scope, 'lib', 'test', 'dsh.plugin.json'), '{ invalid json\n');
  writeText(path.join(fixture.scope, 'lib', 'broken-lib', 'dsh.plugin.json'), '{ invalid json\n');
  const report = await run(fixture);
  const underTestDir = function (rel) {
    const segs = String(rel || '').split('/');
    for (let i = 0; i < segs.length - 1; i++) {
      if (segs[i] === 'test' && segs[i - 1] !== 'lib') return true;
    }
    return false;
  };
  const fromTest = report.issues.filter(function (issue) {
    return issue.root === 'scope' && underTestDir(issue.file);
  });
  assert.equal(fromTest.length, 0, 'test/ 下夹具不得产生任何 issue: ' + JSON.stringify(fromTest));
  const syntaxFiles = report.issues
    .filter(function (issue) { return issue.id === 'schema.json-syntax' && issue.root === 'scope'; })
    .map(function (issue) { return issue.file; })
    .sort();
  assert.deepEqual(syntaxFiles, ['lib/broken-lib/dsh.plugin.json', 'lib/test/dsh.plugin.json'], 'lib/ 下无效 manifest（含名为 test 的本体位）必须仍被检出');
});

test('幂等：固定 --now 连跑两次逐字节一致', async function () {
  const fixture = mkFixture('idempotent');
  baseFixture(fixture);
  writeText(path.join(fixture.config, '.agent-presets', 'liangshen', 'agent.cordis.yml'), 'name: \'@local/dsh-compact-router\'\n');
  const a = await run(fixture);
  const b = await run(fixture);
  assert.equal(JSON.stringify(a), JSON.stringify(b), '报告必须逐字节一致');
});

test('apply：旧名引用修复 → 复检 0 error → 字节级备份存在', async function () {
  const fixture = mkFixture('apply');
  baseFixture(fixture);
  const presetFile = path.join(fixture.config, '.agent-presets', 'liangshen', 'agent.cordis.yml');
  writeText(presetFile, 'compaction:\n  name: \'@local/dsh-compact-router\'\n');
  const report = await run(fixture);
  assert.ok(report.summary.fixable > 0, '应存在可修复 issue');
  const result = await executeApply(report, { confirm: async function () { return true; } });
  assert.equal(result.ok, true, 'apply 应成功');
  const backupFile = path.join(fixture.config, 'doctor-backups', result.stamp, 'config', '.agent-presets', 'liangshen', 'agent.cordis.yml');
  assert.ok(fs.existsSync(backupFile), '备份文件应存在');
  const rescan = await run(fixture);
  assert.equal(rescan.summary.error, 0, '复检应归零');
  assert.equal(fs.readFileSync(presetFile, 'utf8'), 'compaction:\n  name: \'@local/dsh-toolkit/compact-router\'\n');
  const state = readPatchState(fixture.config);
  assert.ok(state.rollbackChain.length >= 1, '状态链应记录 apply');
  assert.ok(state.files['config|.agent-presets/liangshen/agent.cordis.yml'].file, 'preset 兼容字段 file 应落盘');
});

test('apply：干净环境 0 fixable、无新备份、状态不变', async function () {
  const fixture = mkFixture('apply-clean');
  baseFixture(fixture);
  const stateBefore = JSON.stringify(readPatchState(fixture.config));
  const backupRoot = path.join(fixture.config, 'doctor-backups');
  const beforeDirs = fs.existsSync(backupRoot) ? fs.readdirSync(backupRoot).length : 0;
  const report = await run(fixture);
  assert.equal(report.summary.fixable, 0, 'fixture 应干净');
  const result = await executeApply(report, { confirm: async function () { return true; } });
  assert.equal(result.applied, false, '无 fixable 不应 apply');
  assert.equal(fs.existsSync(backupRoot) ? fs.readdirSync(backupRoot).length : 0, beforeDirs, '不应有新备份目录');
  const stateAfter = JSON.stringify(readPatchState(fixture.config));
  assert.equal(stateAfter, stateBefore, '状态文件不应变化');
});

test('protected 负向：*.bak-* 与 preset-backups 目标整轮拒绝、零写入', async function () {
  const fixture = mkFixture('apply-protected');
  baseFixture(fixture);
  const a = path.join(fixture.scope, 'legacy.bak-2026', 'a.cordis.yml');
  const b = path.join(fixture.scope, 'preset-backups', 'b.cordis.yml');
  writeText(a, 'old');
  writeText(b, 'old');
  const report = {
    environment: { configRoot: fixture.config, roots: { scope: fixture.scope, config: fixture.config, profile: fixture.profile } },
    issues: [
      { id: 'ref.unresolvable-local', severity: 'error', root: 'scope', file: 'legacy.bak-2026/a.cordis.yml', line: 1, occurrence: 1, message: 'x', old: '@local/dsh-compact-router', new: '@local/dsh-toolkit/compact-router', fix: { class: 'rewrite', plan: [{ op: 'replace', root: 'scope', file: 'legacy.bak-2026/a.cordis.yml', old: '@local/dsh-compact-router', new: '@local/dsh-toolkit/compact-router', occurrence: 1 }] } },
      { id: 'ref.unresolvable-local', severity: 'error', root: 'scope', file: 'preset-backups/b.cordis.yml', line: 1, occurrence: 1, message: 'x', old: '@local/dsh-compact-router', new: '@local/dsh-toolkit/compact-router', fix: { class: 'rewrite', plan: [{ op: 'replace', root: 'scope', file: 'preset-backups/b.cordis.yml', old: '@local/dsh-compact-router', new: '@local/dsh-toolkit/compact-router', occurrence: 1 }] } },
    ],
  };
  const result = await executeApply(report, { confirm: async function () { return true; } });
  assert.equal(result.code, 'PROTECTED_TARGET', '应触发 protected 硬断言');
  assert.equal(fs.readFileSync(a, 'utf8'), 'old');
  assert.equal(fs.readFileSync(b, 'utf8'), 'old');
  assert.equal(fs.existsSync(path.join(fixture.config, 'doctor-backups')), false, '零写入，不得有备份树');
});

test('锚点漂移：dry-run 后改动目标 → step 失败、零写入', async function () {
  const fixture = mkFixture('apply-drift');
  baseFixture(fixture);
  const file = path.join(fixture.config, 'dsh-search-router.json');
  writeText(file, '{\n  "provider": "@local/dsh-compact-router"\n}\n');
  const report = await run(fixture);
  const afterDryRun = fs.readFileSync(file, 'utf8').replace('"@local/dsh-compact-router"', '"@local/dsh-toolkit/compact-router"');
  fs.writeFileSync(file, afterDryRun, 'utf8');
  const result = await executeApply(report, { confirm: async function () { return true; } });
  assert.equal(result.ok, false, 'apply 应判失败');
  assert.equal(result.results[0].status, 'failed');
  assert.equal(result.results[0].code, 'ANCHOR_DRIFT');
  assert.equal(fs.readFileSync(file, 'utf8'), afterDryRun, '目标文件应保持 dr​​y-run 后内容');
  assert.equal(fs.existsSync(path.join(fixture.config, 'doctor-backups')), false, '锚点失败不产生备份');
});

test('rollback：默认最近一次，目标文件与修复前逐字节一致', async function () {
  const fixture = mkFixture('rollback');
  baseFixture(fixture);
  const file = path.join(fixture.config, 'dsh-search-router.json');
  writeText(file, '{"provider":"@local/dsh-compact-router"}\n');
  const before = fs.readFileSync(file);
  const report = await run(fixture);
  const applyResult = await executeApply(report, { confirm: async function () { return true; } });
  assert.equal(applyResult.ok, true);
  const rollbackReport = await run(fixture);
  const rb = await executeRollback(rollbackReport, {});
  assert.equal(rb.ok, true, 'rollback 应成功');
  assert.deepEqual(fs.readFileSync(file), before, '文件应逐字节恢复');
  const state = readPatchState(fixture.config);
  assert.equal(state.rollbackChain.length, 2, '状态链应包含 apply 与 rollback');
});

test('文件 op：insert/delete/create-file 按 plan 执行', async function () {
  const fixture = mkFixture('apply-ops');
  baseFixture(fixture);
  const report = {
    environment: { configRoot: fixture.config, roots: { scope: fixture.scope, config: fixture.config, profile: fixture.profile } },
    issues: [
      { id: 'x', severity: 'error', root: 'scope', file: 'lib/a.txt', line: 1, occurrence: 1, message: 'insert', old: '锚点', new: '插入行', fix: { class: 'safe', plan: [{ op: 'insert', root: 'scope', file: 'lib/a.txt', old: '锚点', new: '插入行', occurrence: 1 }] } },
      { id: 'x', severity: 'error', root: 'scope', file: 'lib/b.txt', line: 1, occurrence: 1, message: 'delete', old: '待删', new: null, fix: { class: 'destructive', plan: [{ op: 'delete', root: 'scope', file: 'lib/b.txt', old: '待删', new: null, occurrence: 1 }] } },
      { id: 'x', severity: 'error', root: 'scope', file: 'lib/c.txt', line: 1, occurrence: 1, message: 'create', old: null, new: '新建内容\n', fix: { class: 'safe', plan: [{ op: 'create-file', root: 'scope', file: 'lib/c.txt', old: null, new: '新建内容\n', occurrence: 1 }] } },
    ],
  };
  writeText(path.join(fixture.scope, 'lib', 'a.txt'), '前一行\n锚点\n后一行\n');
  writeText(path.join(fixture.scope, 'lib', 'b.txt'), 'keep 待删 tail\n');
  const result = await executeApply(report, { confirm: async function () { return true; } });
  assert.equal(result.ok, true, '三个文件 op 应成功');
  assert.equal(fs.readFileSync(path.join(fixture.scope, 'lib', 'a.txt'), 'utf8'), '前一行\n锚点\n插入行\n后一行\n');
  assert.equal(fs.readFileSync(path.join(fixture.scope, 'lib', 'b.txt'), 'utf8'), 'keep  tail\n');
  assert.equal(fs.readFileSync(path.join(fixture.scope, 'lib', 'c.txt'), 'utf8'), '新建内容\n');
});

test('install-package：file: 本地源安装成功并写入 patch-state 版本', async function () {
  const fixture = mkFixture('apply-install-pkg');
  baseFixture(fixture);
  const src = path.join(fixture.root, 'pkg-src');
  fs.mkdirSync(src, { recursive: true });
  writeJson(path.join(src, 'package.json'), { name: '@dsh-doctor/local-pkg', version: '1.2.3', main: './index.js' });
  writeText(path.join(src, 'index.js'), 'module.exports = {};\n');
  const report = {
    environment: { configRoot: fixture.config, roots: { scope: fixture.scope, config: fixture.config, profile: fixture.profile } },
    issues: [
      { id: 'pkg.missing-dependency', severity: 'error', root: 'config', file: null, line: 1, occurrence: 1, message: 'x', old: '@dsh-doctor/local-pkg', new: 'file:../pkg-src', fix: { class: 'rewrite', plan: [{ op: 'install-package', root: 'config', file: null, old: '@dsh-doctor/local-pkg', new: 'file:../pkg-src', occurrence: 1 }] } },
    ],
  };
  const result = await executeApply(report, { confirm: async function () { return true; } });
  assert.equal(result.ok, true, 'install-package 应成功: ' + JSON.stringify(result));
  const installedPkg = path.join(fixture.config, 'node_modules', '@dsh-doctor', 'local-pkg');
  assert.ok(fs.existsSync(path.join(installedPkg, 'package.json')), 'node_modules 包应已安装');
  const state = readPatchState(fixture.config);
  assert.ok(state.installedPackages.some(function (p) { return p.package === '@dsh-doctor/local-pkg' && p.version === '1.2.3'; }), 'patch-state 应记录实际解析版本');
});

test('并发锁：apply 持有文件锁时第二个实例直接失败', async function () {
  const fixture = mkFixture('apply-lock');
  baseFixture(fixture);
  const file = path.join(fixture.config, 'dsh-search-router.json');
  writeText(file, '{"provider":"@local/dsh-compact-router"}\n');
  const report = await run(fixture);
  const lockPath = path.join(fixture.config, 'doctor-apply.lock');
  fs.writeFileSync(lockPath, JSON.stringify({ pid: 99999, createdAt: new Date().toISOString() }), { flag: 'wx' });
  let code = null;
  try {
    await executeApply(report, { confirm: async function () { return true; } });
  } catch (err) {
    code = err.code;
  }
  assert.equal(code, 'LOCK_BUSY', '第二个 apply 应 LOCK_BUSY');
  assert.equal(fs.readFileSync(file, 'utf8'), '{"provider":"@local/dsh-compact-router"}\n');
  fs.unlinkSync(lockPath);
});

// ── R4 · hostVersion 取宿主自述、未知即跳过（落差条目 F-61 / 令面高危④）───────────────
// 旧实现 = `process.env.DSH_DOCTOR_HOST_VERSION || '0.1.2-rc.1'`：宿主升版后仍拿一个 09-15
// 快照值冒充当前宿主参与 runtime.dsh 比对 ⇒ "升版即整仓误判"，且账面没有任何对出面。
// 新顺位：显式 opts.hostVersion（CLI 的 --host-version）> DSH_DOCTOR_HOST_VERSION > 宿主自述探测
// > 'unknown'（**跳过比对、不产 issue、summary 如实写 unknown**）。
// 测试隔离硬要求：探测一律注入替身 —— 宿主不在场的机器必须给出同一读数，用例绝不 spawn 真 dsh。
function withDshRange(fixture, range) {
  const manifest = suiteManifest();
  manifest.requirements.runtime = { dsh: range };
  writeJson(path.join(fixture.scope, 'dsh.plugin.json'), manifest);
}

function withoutHostVersionEnv() {
  const saved = process.env.DSH_DOCTOR_HOST_VERSION;
  delete process.env.DSH_DOCTOR_HOST_VERSION;
  return function restore() {
    if (saved !== undefined) process.env.DSH_DOCTOR_HOST_VERSION = saved;
  };
}

function withHostVersionEnv(value) {
  const saved = process.env.DSH_DOCTOR_HOST_VERSION;
  process.env.DSH_DOCTOR_HOST_VERSION = value;
  return function restore() {
    if (saved === undefined) delete process.env.DSH_DOCTOR_HOST_VERSION;
    else process.env.DSH_DOCTOR_HOST_VERSION = saved;
  };
}

test('R4 静态防回潮：引擎源码里不得再出现写死的宿主版本缺省字面量', async function () {
  const src = fs.readFileSync(new URL('../src/engine.mjs', import.meta.url), 'utf8');
  assert.ok(!src.includes("'0.1.2-rc.1'"), 'engine.mjs 仍含单引号形态的写死 0.1.2-rc.1 缺省');
  assert.ok(!src.includes('"0.1.2-rc.1"'), 'engine.mjs 仍含双引号形态的写死 0.1.2-rc.1 缺省');
});

test('R4 顺位①：显式 hostVersion（CLI --host-version）赢过环境变量，且此时不探测', async function () {
  const fixture = mkFixture('hv-flag');
  baseFixture(fixture);
  const restore = withHostVersionEnv('0.9.9-env');
  try {
    const report = await run(fixture, {
      hostVersion: '0.8.8-flag',
      hostVersionProbe: function () { throw new Error('设了旗标就不该探测'); },
    });
    assert.equal(report.environment.hostVersion, '0.8.8-flag');
  } finally {
    restore();
  }
});

test('R4 顺位②：env 覆盖生效，且设了 env 就绝不触发探测', async function () {
  const fixture = mkFixture('hv-env');
  baseFixture(fixture);
  const restore = withHostVersionEnv('0.7.7-env');
  let probes = 0;
  try {
    const report = await run(fixture, {
      hostVersionProbe: function () { probes++; return '0.1.5-rc.1'; },
    });
    assert.equal(report.environment.hostVersion, '0.7.7-env');
    assert.equal(probes, 0, 'env 在场时探测次数必须为 0（env 就是逃生口）');
  } finally {
    restore();
  }
});

test('R4 顺位③：无旗标无 env 时取探测真值，范围满足 ⇒ 零 issue', async function () {
  const fixture = mkFixture('hv-probe');
  baseFixture(fixture);
  withDshRange(fixture, '>=0.1.2-rc.1 <0.2.0');
  const restore = withoutHostVersionEnv();
  try {
    const report = await run(fixture, { hostVersionProbe: function () { return '0.1.5-rc.1'; } });
    assert.equal(report.environment.hostVersion, '0.1.5-rc.1');
    assert.equal(report.issues.filter(function (i) { return i.id === 'env.dsh-version-mismatch'; }).length, 0);
  } finally {
    restore();
  }
});

test('R4 未知即跳过：探测不可达 ⇒ hostVersion=unknown、跳过比对、不产 issue（绝不冒充旧值）', async function () {
  const fixture = mkFixture('hv-unknown');
  baseFixture(fixture);
  // 范围故意写成永远满足不了：冒充任何具体版本都会报错，只有真·跳过才 0 error
  withDshRange(fixture, '>=9.9.9 <10.0.0');
  const restore = withoutHostVersionEnv();
  try {
    const report = await run(fixture, { hostVersionProbe: function () { return null; } });
    assert.equal(report.environment.hostVersion, 'unknown');
    assert.equal(report.summary.error, 0, 'unknown 不得冒充一个具体版本去参与比对');
    assert.equal(report.issues.filter(function (i) { return i.id === 'env.dsh-version-mismatch'; }).length, 0);
  } finally {
    restore();
  }
});

test('R4 反向不放宽：探测到的版本不满足清单范围 ⇒ 仍产 env.dsh-version-mismatch（error）', async function () {
  const fixture = mkFixture('hv-strict');
  baseFixture(fixture);
  withDshRange(fixture, '>=0.1.2-rc.1 <0.2.0');
  const restore = withoutHostVersionEnv();
  try {
    const report = await run(fixture, { hostVersionProbe: function () { return '0.3.0'; } });
    const hits = report.issues.filter(function (i) { return i.id === 'env.dsh-version-mismatch'; });
    assert.equal(hits.length, 1, '"取真值"不等于"放宽门禁"：越界必须照报');
    assert.equal(hits[0].severity, 'error');
    assert.ok(hits[0].message.includes('0.3.0'), '消息要点名实际宿主版本');
  } finally {
    restore();
  }
});

test('契约 v1.2 前置①：根字段必填集撤销——纯契约子清单不再报"缺少必填字段"；requirements 在场时键集仍逐名报（在场才管）', async function () {
  // 令面出处：toolkit:docs/debt.md C-2 前置清单第 1 项＋toolkit:docs/contract-v1.1-recon.md §8.3 修法
  // ＋EXE-BOOT-016 启动包第八节 3d。管辖权改述＝「requirements 在场时其键集与 ./ 目标存在性归本 CLI；
  // provides/requires 合法性归契约」⇒ 撤销的是**根字段必填**，不是键集校验。
  const fixture = mkFixture('v12-required-revoked');
  baseFixture(fixture);
  // ① 纯契约形态（无 manifestVersion/name/requirements）作子插件清单：三根必填撤销后不得再报
  writeJson(path.join(fixture.scope, 'lib', 'pure', 'dsh.plugin.json'), {
    id: 'dsh/pure-contract', displayName: '纯契约夹具', version: '1.0.0', contract: '^1.0',
    requires: { services: ['llm'] }, provides: { services: ['dsh/pure-contract/svc'] },
  });
  let report = await run(fixture);
  let mine = report.issues.filter(function (i) { return i.file === 'lib/pure/dsh.plugin.json'; });
  assert.equal(mine.filter(function (i) { return i.id === 'schema.required-missing' && /^缺少必填字段/.test(String(i.message)); }).length, 0,
    '根字段必填集已撤销，纯契约清单不得再报"缺少必填字段": ' + JSON.stringify(mine.map(function (i) { return i.message; })));
  assert.equal(mine.filter(function (i) { return /requirements/.test(String(i.message)); }).length, 0,
    'requirements 缺席时整段跳过＝本断言钉住的"可见空转"，不得有任何 requirements 文案');
  assert.equal(mine.filter(function (i) { return i.category === 'schema'; }).length, 0,
    '纯契约子清单不得有任何 schema issue（撤销覆盖的是整面：缺席字段连校值都不做）: '
    + JSON.stringify(mine.map(function (i) { return i.id + '|' + i.message; })));
  // ② requirements 在场但键集不齐：三名逐名仍报（题 2 交给本 CLI 的那半没丢）
  writeJson(path.join(fixture.scope, 'lib', 'partial', 'dsh.plugin.json'), {
    manifestVersion: 1, name: '@local/dsh-toolkit/partial', requirements: { runtime: {}, binaries: [] },
  });
  report = await run(fixture);
  mine = report.issues.filter(function (i) { return i.file === 'lib/partial/dsh.plugin.json'; });
  const reqMissing = mine
    .filter(function (i) { return i.id === 'schema.required-missing' && /^requirements 缺少必填字段/.test(String(i.message)); })
    .map(function (i) { return String(i.message).replace(/^requirements 缺少必填字段: /, '').replace(/。$/, ''); });
  assert.deepEqual(reqMissing.sort(), ['exports', 'packages', 'registers'], '在场键集校验必须逐名报齐三名，实得 ' + JSON.stringify(reqMissing));
  // ③ 撤销只撤"必填"，不撤"给了就查"：manifestVersion/name 给了坏值仍 error（防把撤销做成整面放宽）
  writeJson(path.join(fixture.scope, 'lib', 'badtypes', 'dsh.plugin.json'), {
    manifestVersion: 2, name: '', requirements: { runtime: {}, binaries: [], packages: {}, registers: {}, exports: {} },
  });
  report = await run(fixture);
  mine = report.issues.filter(function (i) { return i.file === 'lib/badtypes/dsh.plugin.json'; });
  const msgs = mine.map(function (i) { return i.message; });
  assert.ok(msgs.some(function (m) { return /^manifestVersion 必须为 1。$/.test(m); }), 'manifestVersion 在场仍须校值: ' + JSON.stringify(msgs));
  assert.ok(msgs.some(function (m) { return /^name 必须为非空字符串。$/.test(m); }), 'name 在场仍须校值: ' + JSON.stringify(msgs));
  assert.equal(mine.filter(function (i) { return /^缺少必填字段/.test(String(i.message)); }).length, 0,
    '齐载形态不得报根必填缺失（撤销未误伤存量形态）');
  // ④ 套件根 requirements 在场**独缺 exports**：不得抛崩溃，须按键集缺名报（笔 3 暴露的既存潜在
  //    崩溃形态——原码在此处 Object.keys(undefined) 当场 TypeError，此前零用例覆盖）
  const suiteNoExports = suiteManifest();
  delete suiteNoExports.requirements.exports;
  writeJson(path.join(fixture.scope, 'dsh.plugin.json'), suiteNoExports);
  report = await run(fixture);
  const suiteMine = report.issues.filter(function (i) { return i.file === 'dsh.plugin.json'; });
  assert.ok(suiteMine.some(function (i) { return /^requirements 缺少必填字段: exports。$/.test(String(i.message)); }),
    '套件根 exports 缺席须按键集缺名报，实得 ' + JSON.stringify(suiteMine.map(function (i) { return i.message; })));
});

for (const item of testCases) {
  try {
    await item.fn();
    passed++;
    process.stdout.write('PASS ' + item.name + '\n');
  } catch (err) {
    process.stdout.write('FAIL ' + item.name + '\n');
    throw err;
  }
}
process.stdout.write('\n' + passed + '/' + testCases.length + ' fixture tests passed\n');
