import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { runDoctor } from '../src/engine.mjs';

function mkFixture(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-doctor-4a-' + name + '-'));
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
  const manifest = { manifestVersion: 1, name, requirements };
  for (const [key, value] of Object.entries(extra || {})) {
    if (key === 'name') continue;
    if (key === 'runtime' || key === 'binaries' || key === 'packages') requirements[key] = value;
    else if (key === 'registers') requirements.registers = value;
    else if (key === 'provides') manifest.provides = value;
    else throw new Error('unsupported extra: ' + key);
  }
  return manifest;
}

function baseFixture(fixture, pkgExtra) {
  fs.mkdirSync(path.join(fixture.scope, 'lib', 'a'), { recursive: true });
  fs.mkdirSync(path.join(fixture.scope, 'lib', 'b'), { recursive: true });
  const pkg = { name: '@local/dsh-toolkit', version: '0.1.0', type: 'module', exports: { './a': './lib/a/index.js', './b': './lib/b/index.js' } };
  for (const [key, value] of Object.entries(pkgExtra || {})) pkg[key] = value;
  writeJson(path.join(fixture.scope, 'package.json'), pkg);
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
    // R4 后引擎不再冒充宿主版本（未知即跳过 runtime.dsh 比对）。本套件的既有判定（含
    // env.dsh-version-mismatch 那条）都以"宿主 = 0.1.2-rc.1"为前提，故把该值**显式钉住**：
    // 与 R4 之前的隐式缺省逐字同值 ⇒ 8 条用例的判定面零漂移，且不再依赖机器上有没有真 dsh。
    hostVersion: '0.1.2-rc.1',
  };
  if (extra) Object.assign(opts, extra);
  return runDoctor(opts);
}

function ids(report, id) {
  return report.issues.filter(function (issue) { return issue.id === id; });
}

let passed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('env.node-version-mismatch：两个子插件 node 范围不满足当前运行时', async function () {
  const fix = mkFixture('node');
  baseFixture(fix);
  writeJson(path.join(fix.scope, 'lib', 'a', 'dsh.plugin.json'), subManifest('@local/dsh-toolkit/a', { runtime: { node: '>=99', dsh: '>=0.1.2-rc.1' } }));
  writeJson(path.join(fix.scope, 'lib', 'b', 'dsh.plugin.json'), subManifest('@local/dsh-toolkit/b', { runtime: { node: '>=98', dsh: '>=0.1.2-rc.1' } }));
  const report = await run(fix);
  const hits = ids(report, 'env.node-version-mismatch');
  assert.equal(hits.length, 2, '应命中两个 node 版本不满足');
  assert.ok(hits.every(function (i) { return i.severity === 'error' && i.fix.class === 'manual' && i.category === 'env'; }));
});

test('env.dsh-version-mismatch：两个子插件 dsh 范围不满足宿主版本', async function () {
  const fix = mkFixture('dsh');
  baseFixture(fix);
  writeJson(path.join(fix.scope, 'lib', 'a', 'dsh.plugin.json'), subManifest('@local/dsh-toolkit/a', { runtime: { dsh: '>=9.0.0' } }));
  writeJson(path.join(fix.scope, 'lib', 'b', 'dsh.plugin.json'), subManifest('@local/dsh-toolkit/b', { runtime: { dsh: '>=8.0.0 <9.0.0' } }));
  const report = await run(fix);
  const hits = ids(report, 'env.dsh-version-mismatch');
  assert.equal(hits.length, 2, '应命中两个 dsh 版本不满足');
  assert.ok(hits.every(function (i) { return i.severity === 'error' && i.fix.class === 'manual'; }));
});

test('env.binary-missing：两个子插件声明的二进制缺失', async function () {
  const fix = mkFixture('binary');
  baseFixture(fix);
  writeJson(path.join(fix.scope, 'lib', 'a', 'dsh.plugin.json'), subManifest('@local/dsh-toolkit/a', { binaries: [{ name: '__dsh_doctor_4a_ghost_a__' }] }));
  writeJson(path.join(fix.scope, 'lib', 'b', 'dsh.plugin.json'), subManifest('@local/dsh-toolkit/b', { binaries: [{ name: '__dsh_doctor_4a_ghost_b__' }] }));
  const report = await run(fix);
  const hits = ids(report, 'env.binary-missing');
  assert.equal(hits.length, 2, '应命中两个二进制缺失');
  assert.ok(hits.every(function (i) { return i.severity === 'error' && i.fix.class === 'manual' && i.category === 'env'; }));
});

test('pkg.missing-dependency：$from 指向真实 package.json，但 npm 包未安装', async function () {
  const fix = mkFixture('missing-dep');
  baseFixture(fix, { dependencies: { '@dsh-doctor/missing-a': '^1.0.0', '@dsh-doctor/missing-b': '^1.0.0' } });
  writeJson(path.join(fix.scope, 'lib', 'a', 'dsh.plugin.json'), subManifest('@local/dsh-toolkit/a', { packages: { '@dsh-doctor/missing-a': { '$from': 'package.json#dependencies' } } }));
  writeJson(path.join(fix.scope, 'lib', 'b', 'dsh.plugin.json'), subManifest('@local/dsh-toolkit/b', { packages: { '@dsh-doctor/missing-b': { '$from': 'package.json#dependencies' } } }));
  const report = await run(fix);
  const hits = ids(report, 'pkg.missing-dependency');
  assert.equal(hits.length, 2, '应命中两个未安装依赖');
  assert.ok(hits.every(function (i) { return i.severity === 'error' && i.fix.class === 'rewrite' && i.category === 'package' && i.fix.plan[0].op === 'install-package' && i.fix.plan[0].new === '^1.0.0'; }));
  assert.ok(hits.every(function (i) { return i.old === '@dsh-doctor/missing-a' || i.old === '@dsh-doctor/missing-b'; }));
});

test('pkg.version-violation：真实 node_modules 解析成功，但安装版本不满足声明范围', async function () {
  const fix = mkFixture('version-violation');
  baseFixture(fix, { dependencies: { '@dsh-doctor/fake-pkg': '^2.0.0' } });
  fs.mkdirSync(path.join(fix.scope, 'node_modules', '@dsh-doctor', 'fake-pkg'), { recursive: true });
  writeJson(path.join(fix.scope, 'node_modules', '@dsh-doctor', 'fake-pkg', 'package.json'), { name: '@dsh-doctor/fake-pkg', version: '1.0.0', main: './index.js' });
  writeText(path.join(fix.scope, 'node_modules', '@dsh-doctor', 'fake-pkg', 'index.js'), 'module.exports = {};\n');
  writeJson(path.join(fix.scope, 'lib', 'a', 'dsh.plugin.json'), subManifest('@local/dsh-toolkit/a', { packages: { '@dsh-doctor/fake-pkg': { '$from': 'package.json#dependencies' } } }));
  writeJson(path.join(fix.scope, 'lib', 'b', 'dsh.plugin.json'), subManifest('@local/dsh-toolkit/b', { packages: { '@dsh-doctor/fake-pkg': { '$from': 'package.json#dependencies' } } }));
  const report = await run(fix);
  const hits = ids(report, 'pkg.version-violation');
  assert.equal(hits.length, 2, '应命中两个版本不满足');
  assert.ok(hits.every(function (i) { return i.severity === 'error' && i.fix.class === 'manual' && i.category === 'package'; }));
});

test('schema.$from-dangling：$from 指向不存在的 package.json 节点', async function () {
  const fix = mkFixture('dangling');
  baseFixture(fix, { dependencies: {} });
  writeJson(path.join(fix.scope, 'lib', 'a', 'dsh.plugin.json'), subManifest('@local/dsh-toolkit/a', { packages: { '@dsh-doctor/no-such-peer': { '$from': 'package.json#peerDependencies' } } }));
  writeJson(path.join(fix.scope, 'lib', 'b', 'dsh.plugin.json'), subManifest('@local/dsh-toolkit/b', { packages: { '@dsh-doctor/no-such-optional': { '$from': 'package.json#optionalDependencies' } } }));
  const report = await run(fix);
  const hits = ids(report, 'schema.$from-dangling');
  assert.equal(hits.length, 2, '应命中两个悬空指针');
  assert.ok(hits.every(function (i) { return i.severity === 'error' && i.fix.class === 'manual' && i.category === 'schema'; }));
});

test('reg.name-collision：services 与 providers 各自跨子插件重名', async function () {
  const fix = mkFixture('collision');
  baseFixture(fix);
  writeJson(path.join(fix.scope, 'lib', 'a', 'dsh.plugin.json'), subManifest('@local/dsh-toolkit/a', { registers: { inject: [], events: [], services: ['shared'], commands: [], providers: ['dup-prov'] } }));
  writeJson(path.join(fix.scope, 'lib', 'b', 'dsh.plugin.json'), subManifest('@local/dsh-toolkit/b', { registers: { inject: [], events: [], services: ['shared'], commands: [], providers: ['dup-prov'] } }));
  const report = await run(fix);
  const hits = ids(report, 'reg.name-collision');
  assert.equal(hits.length, 2, '应命中服务与提供者两处冲突');
  assert.ok(hits.every(function (i) { return i.severity === 'error' && i.fix.class === 'manual' && i.category === 'registration'; }));
});

// ---- F-62（W9 第一段）：撞名规则改读 provides 正典（与 toolkit loader extractRegisters 同口径）----
test('reg.name-collision：provides 正典声明撞名可查出（F-62 复现钉）', async function () {
  const fix = mkFixture('collision-provides');
  baseFixture(fix);
  writeJson(path.join(fix.scope, 'lib', 'a', 'dsh.plugin.json'), subManifest('@local/dsh-toolkit/a', { provides: { services: ['shared-prov'] } }));
  writeJson(path.join(fix.scope, 'lib', 'b', 'dsh.plugin.json'), subManifest('@local/dsh-toolkit/b', { provides: { services: ['shared-prov'] } }));
  const report = await run(fix);
  const hits = ids(report, 'reg.name-collision');
  assert.equal(hits.length, 1, 'provides.services 跨清单重名应被撞名规则查出（修前此格红＝规则不读 provides）');
  assert.ok(hits.every(function (i) { return i.severity === 'error' && i.fix.class === 'manual' && i.category === 'registration'; }));
});

test('reg.name-collision：provides 与 legacy registers 跨清单混声明同样撞名（F-62 回落格）', async function () {
  const fix = mkFixture('collision-mixed');
  baseFixture(fix);
  writeJson(path.join(fix.scope, 'lib', 'a', 'dsh.plugin.json'), subManifest('@local/dsh-toolkit/a', { provides: { commands: ['mixed-slot'] } }));
  writeJson(path.join(fix.scope, 'lib', 'b', 'dsh.plugin.json'), subManifest('@local/dsh-toolkit/b', { registers: { inject: [], events: [], services: [], commands: ['mixed-slot'], providers: [] } }));
  const report = await run(fix);
  const hits = ids(report, 'reg.name-collision');
  assert.equal(hits.length, 1, '一方 provides、一方 legacy 的同命令名应撞（provides 优先、legacy 回落，两读法并存）');
  assert.ok(hits.every(function (i) { return i.severity === 'error' && i.fix.class === 'manual' && i.category === 'registration'; }));
});

test('reg.name-collision：provides 空数组视为"声明为空"遮蔽 legacy（extractRegisters 同口径格）', async function () {
  const fix = mkFixture('collision-shadow');
  baseFixture(fix);
  writeJson(path.join(fix.scope, 'lib', 'a', 'dsh.plugin.json'), subManifest('@local/dsh-toolkit/a', { provides: { services: [] }, registers: { inject: [], events: [], services: ['ghost-slot'], commands: [], providers: [] } }));
  writeJson(path.join(fix.scope, 'lib', 'b', 'dsh.plugin.json'), subManifest('@local/dsh-toolkit/b', { registers: { inject: [], events: [], services: ['ghost-slot'], commands: [], providers: [] } }));
  const report = await run(fix);
  const hits = ids(report, 'reg.name-collision');
  assert.equal(hits.length, 0, 'a 的 provides.services=[] 已声明为空 ⇒ 遮蔽其 legacy（与 loader Array.isArray 判据同），不得与 b 撞名');
});

test('reg.inject-face-unknown：inject 面不在宿主提供面清单，warning + manual', async function () {
  const fix = mkFixture('inject');
  baseFixture(fix);
  writeJson(path.join(fix.scope, 'lib', 'a', 'dsh.plugin.json'), subManifest('@local/dsh-toolkit/a', { registers: { inject: ['llm', 'ghost-a'], events: [], services: [], commands: [], providers: [] } }));
  writeJson(path.join(fix.scope, 'lib', 'b', 'dsh.plugin.json'), subManifest('@local/dsh-toolkit/b', { registers: { inject: ['web', 'ghost-b'], events: [], services: [], commands: [], providers: [] } }));
  const report = await run(fix);
  const hits = ids(report, 'reg.inject-face-unknown');
  assert.equal(hits.length, 2, '应命中两个未知注入面');
  assert.ok(hits.every(function (i) { return i.severity === 'warning' && i.fix.class === 'manual' && i.category === 'registration'; }));
});

// ---- v1.3 迁移笔（S3／C-3 一.3）：inject 与 provider 面的正典读法延伸到本规则 ----
// F-62 只把**撞名格**改成 provides 优先；inject-face 与 provider 在案集合（bodies.providers）
// 是同族另外两处只读 legacy 的点。清单把 inject/providers 迁进 provides 后，这两处若不跟着同源，
// 表现是"集体安静"（不报错、只是不再检查）——比报错更坏，故各立一格钉住。
test('reg.inject-face-unknown：provides.inject 正典声明的未知面照样查出（迁移笔复现钉，修前此格红）', async function () {
  const fix = mkFixture('inject-provides');
  baseFixture(fix);
  writeJson(path.join(fix.scope, 'lib', 'a', 'dsh.plugin.json'), subManifest('@local/dsh-toolkit/a', { provides: { inject: ['ghost-from-provides'] } }));
  const report = await run(fix);
  const hits = ids(report, 'reg.inject-face-unknown');
  assert.equal(hits.length, 1, '只在 provides.inject 声明的未知注入面必须被查出（legacy 直读会静默漏检）');
  assert.ok(String(hits[0].message).includes('ghost-from-provides'), '要点名被声明的那个面');
});

test('reg.inject-face-unknown：provides.inject 空数组遮蔽 legacy（与 registerSlotOf／extractRegisters 同口径）', async function () {
  const fix = mkFixture('inject-shadow');
  baseFixture(fix);
  writeJson(path.join(fix.scope, 'lib', 'a', 'dsh.plugin.json'), subManifest('@local/dsh-toolkit/a', {
    provides: { inject: [] },
    registers: { inject: ['ghost-legacy-only'], events: [], services: [], commands: [], providers: [] },
  }));
  const report = await run(fix);
  assert.equal(ids(report, 'reg.inject-face-unknown').length, 0,
    'provides.inject=[] 是"已声明为空"⇒ 遮蔽 legacy，不得再从旧表取到 ghost-legacy-only');
});

for (const t of tests) {
  try {
    await t.fn();
    passed++;
    console.log('PASS ' + t.name);
  } catch (err) {
    console.log('FAIL ' + t.name);
    console.log(err && err.stack || err);
  }
}
console.log(passed + '/' + tests.length + ' stage4a fixture tests passed');
process.exit(passed === tests.length ? 0 : 1);
