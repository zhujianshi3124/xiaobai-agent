import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { runDoctor } from '../src/engine.mjs';
import { executeApply, readPatchState } from '../src/executor.mjs';

function mkFixture(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-doctor-4b-' + name + '-'));
  const dirs = { root, scope: path.join(root, 'scope'), config: path.join(root, 'config'), profile: path.join(root, 'profiles', 'web') };
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

function subManifest(name, extra) {
  const requirements = {
    runtime: {},
    binaries: [],
    packages: {},
    registers: { inject: [], events: [], services: [], commands: [], providers: [] },
    exports: { '.': './index.js' },
  };
  for (const [key, value] of Object.entries(extra || {})) {
    if (key === 'name') continue;
    if (key === 'runtime' || key === 'binaries' || key === 'packages') requirements[key] = value;
    else if (key === 'registers') requirements.registers = value;
    else throw new Error('unsupported extra: ' + key);
  }
  return { manifestVersion: 1, name, requirements };
}

function baseFixture(fixture) {
  fs.mkdirSync(path.join(fixture.scope, 'lib'), { recursive: true });
  writeJson(path.join(fixture.scope, 'package.json'), { name: '@local/dsh-toolkit', version: '0.1.0', type: 'module', exports: { './a': './lib/a/index.js', './b': './lib/b/index.js' } });
  writeJson(path.join(fixture.scope, 'dsh.plugin.json'), subManifest('@local/dsh-toolkit', { packages: {}, registers: { inject: [], events: [], services: [], commands: [], providers: [] } }));
  writeText(path.join(fixture.profile, 'cordis.patch.yml'), '[]\n');
  writeJson(path.join(fixture.profile, 'package.json'), { name: 'dsh-profile-web', private: true });
}

async function run(fixture, extra) {
  const opts = {
    scopeRoot: fixture.scope,
    configRoot: fixture.config,
    profileRoot: fixture.profile,
    now: '2026-09-14T08:00:00.000Z',
    // R4 测试隔离：本套件夹具不声明 runtime.dsh 范围（判定面与此值无关），但引擎在缺旗标/缺 env 时
    // 会去探测真宿主 ⇒ 每个用例白 spawn 一次、且读数随机器上有没有 dsh 而变。钉一个夹具值消除这两点。
    hostVersion: '0.1.2-rc.1',
  };
  if (extra) Object.assign(opts, extra);
  return runDoctor(opts);
}

function ids(report, id) {
  return report.issues.filter(function (issue) { return issue.id === id; });
}

function makePackageSource(dir, name, version) {
  fs.mkdirSync(path.join(dir), { recursive: true });
  writeJson(path.join(dir, 'package.json'), { name, version, main: './index.js' });
  writeText(path.join(dir, 'index.js'), 'module.exports = {};\n');
}

function makeReport(fixture, configRoot) {
  return {
    environment: { configRoot: configRoot || fixture.config, roots: { scope: fixture.scope, config: configRoot || fixture.config, profile: fixture.profile } },
    issues: [],
  };
}

function installIssue(report, root, pkg, declared) {
  report.issues.push({ id: 'pkg.missing-dependency', severity: 'error', root, file: null, line: 1, occurrence: 1, message: 'x', old: pkg, new: declared, fix: { class: 'rewrite', plan: [{ op: 'install-package', root, file: null, old: pkg, new: declared, occurrence: 1 }] } });
}

let passed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('pkg.resolution-outside-scope：scope 内 node_modules 真实目录包不报', async function () {
  const fix = mkFixture('inside');
  baseFixture(fix);
  makePackageSource(path.join(fix.scope, 'node_modules', 'inside-pkg'), 'inside-pkg', '1.0.0');
  writeText(path.join(fix.scope, 'lib', 'index.js'), "import x from 'inside-pkg';\n");
  const report = await run(fix);
  assert.equal(ids(report, 'pkg.resolution-outside-scope').length, 0, 'scope 内包不应报');
});

test('pkg.resolution-outside-scope：junction 指向外部目录报出且链路完整', async function () {
  const fix = mkFixture('junction');
  baseFixture(fix);
  const outside = path.join(fix.root, 'outside-pkg');
  makePackageSource(outside, '@dsh-doctor/link-pkg', '1.0.0');
  const linkParent = path.join(fix.scope, 'node_modules', '@dsh-doctor');
  fs.mkdirSync(linkParent, { recursive: true });
  const link = path.join(linkParent, 'link-pkg');
  fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  writeText(path.join(fix.scope, 'lib', 'index.js'), "import x from '@dsh-doctor/link-pkg';\n");
  const report = await run(fix);
  const hits = ids(report, 'pkg.resolution-outside-scope');
  assert.equal(hits.length, 1, '应报出 junction 外部落点');
  const h = hits[0];
  assert.equal(h.severity, 'warning');
  assert.equal(h.root, 'scope');
  assert.equal(h.file, 'lib/index.js');
  assert.equal(h.old, '@dsh-doctor/link-pkg');
  assert.equal(h.occurrence, 1);
  assert.deepEqual(h.fix, { class: 'manual', plan: [] });
  assert.ok(h.message.includes(outside), 'message 应含外部 realpath 落点: ' + h.message);
  assert.ok(h.message.includes('node_modules' + path.sep + '@dsh-doctor' + path.sep + 'link-pkg'), 'message 应含解析链 node_modules 实体路径');
});

test('pkg.resolution-outside-scope：真实外部目录（非 symlink）同样报出', async function () {
  const fix = mkFixture('external-real');
  baseFixture(fix);
  makePackageSource(path.join(fix.root, 'node_modules', 'outside-real'), 'outside-real', '1.0.0');
  writeText(path.join(fix.scope, 'lib', 'index.js'), "import x from 'outside-real';\n");
  const report = await run(fix);
  const hits = ids(report, 'pkg.resolution-outside-scope');
  assert.equal(hits.length, 1, '应报出外部真实目录');
  assert.equal(hits[0].old, 'outside-real');
  assert.equal(hits[0].root, 'scope');
  assert.equal(hits[0].file, 'lib/index.js');
});

test('install-package 影子：file: 本地包成功安装且版本写入 patch-state', async function () {
  const fix = mkFixture('install-ok');
  baseFixture(fix);
  const src = path.join(fix.root, 'ok-src');
  makePackageSource(src, '@dsh-doctor/ok-pkg', '1.0.0');
  const report = makeReport(fix);
  installIssue(report, 'config', '@dsh-doctor/ok-pkg', '^1.0.0');
  const result = await executeApply(report, { confirm: async function () { return true; }, installSources: { '@dsh-doctor/ok-pkg': src } });
  assert.equal(result.ok, true, '应安装成功: ' + JSON.stringify(result));
  assert.ok(fs.existsSync(path.join(fix.config, 'node_modules', '@dsh-doctor', 'ok-pkg', 'package.json')), '包应安装到 node_modules');
  const state = readPatchState(fix.config);
  assert.ok(state.installedPackages.some(function (p) { return p.package === '@dsh-doctor/ok-pkg' && p.version === '1.0.0'; }), 'patch-state 应记录实际解析版本');
});

test('install-package 影子：本地包版本与声明范围冲突', async function () {
  const fix = mkFixture('install-conflict');
  baseFixture(fix);
  const src = path.join(fix.root, 'conflict-src');
  makePackageSource(src, '@dsh-doctor/conflict-pkg', '2.0.0');
  const report = makeReport(fix);
  installIssue(report, 'config', '@dsh-doctor/conflict-pkg', '^1.0.0');
  const result = await executeApply(report, { confirm: async function () { return true; }, installSources: { '@dsh-doctor/conflict-pkg': src } });
  assert.equal(result.ok, false);
  assert.equal(result.results[0].status, 'failed');
  assert.equal(result.results[0].code, 'INSTALL_PACKAGE_VERSION_CONFLICT');
  assert.equal(fs.existsSync(path.join(fix.config, 'node_modules', '@dsh-doctor', 'conflict-pkg')), false, '冲突不应写入');
});

test('install-package 影子：*.bak-* 根路径整轮 protected 拒绝', async function () {
  const fix = mkFixture('install-protected');
  baseFixture(fix);
  const bakConfig = path.join(fix.root, 'legacy.bak-2026', 'config');
  fs.mkdirSync(bakConfig, { recursive: true });
  const src = path.join(fix.root, 'protected-src');
  makePackageSource(src, '@dsh-doctor/protected-pkg', '1.0.0');
  const report = makeReport(fix, bakConfig);
  installIssue(report, 'config', '@dsh-doctor/protected-pkg', '^1.0.0');
  const result = await executeApply(report, { confirm: async function () { return true; }, installSources: { '@dsh-doctor/protected-pkg': src } });
  assert.equal(result.code, 'PROTECTED_TARGET');
  assert.equal(fs.existsSync(path.join(bakConfig, 'node_modules')), false, 'protected 拒绝零写入');
});

test('install-package 影子：目标 node_modules 为 symlink/junction 拒绝', async function () {
  const fix = mkFixture('install-symlink');
  baseFixture(fix);
  const outside = path.join(fix.root, 'nm-target');
  fs.mkdirSync(outside, { recursive: true });
  fs.symlinkSync(outside, path.join(fix.scope, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const src = path.join(fix.root, 'sym-src');
  makePackageSource(src, '@dsh-doctor/sym-pkg', '1.0.0');
  const report = makeReport(fix);
  installIssue(report, 'scope', '@dsh-doctor/sym-pkg', '^1.0.0');
  const result = await executeApply(report, { confirm: async function () { return true; }, installSources: { '@dsh-doctor/sym-pkg': src } });
  assert.equal(result.ok, false);
  assert.equal(result.results[0].status, 'failed');
  assert.equal(result.results[0].code, 'INSTALL_PACKAGE_NODE_MODULES_SYMLINK');
});

for (const item of tests) {
  try {
    await item.fn();
    passed++;
    process.stdout.write('PASS ' + item.name + '\n');
  } catch (err) {
    process.stdout.write('FAIL ' + item.name + '\n');
    process.stdout.write(String(err && err.stack || err) + '\n');
  }
}
process.stdout.write('\n' + passed + '/' + tests.length + ' stage4b fixture tests passed\n');
if (passed !== tests.length) process.exitCode = 1;
