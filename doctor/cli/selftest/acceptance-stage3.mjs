import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runDoctor } from '../src/engine.mjs';
import { executeApply, executeRollback, readPatchState } from '../src/executor.mjs';

const doctorRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliAbs = path.join(doctorRoot, 'src', 'cli.mjs');
const realConfigRoot = path.join(os.homedir(), '.dsh');
const realScopeRoot = 'D:/dsh-plugins/dsh-toolkit';

function mkFixture(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-doctor-stage3-' + name + '-'));
  const dirs = {
    root,
    scope: path.join(root, 'scope'),
    config: path.join(root, 'config'),
    profile: path.join(root, 'config', 'profiles', 'web'),
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

function baseFixture(fixture) {
  writeJson(path.join(fixture.scope, 'package.json'), { name: '@local/dsh-toolkit', version: '0.1.0', type: 'module', exports: { './compact-router': './lib/compact-router/index.js', './agent-memory': './lib/agent-memory/index.js' } });
  writeJson(path.join(fixture.scope, 'dsh.plugin.json'), {
    manifestVersion: 1,
    name: '@local/dsh-toolkit',
    aliases: {
      '@local/dsh-compact-router': '@local/dsh-toolkit/compact-router',
      '@local/agent-memory': '@local/dsh-toolkit/agent-memory',
    },
    requirements: {
      runtime: {}, binaries: [], packages: {}, registers: {},
      exports: { '$from': 'package.json#exports' },
    },
  });
  writeText(path.join(fixture.profile, 'cordis.patch.yml'), '[]\n');
  writeJson(path.join(fixture.profile, 'package.json'), {
    name: 'dsh-profile-web',
    private: true,
    dependencies: { '@local/dsh-toolkit': 'link:D:/dsh-plugins/dsh-toolkit' },
    dsh: { profile: { bundles: ['@local/dsh-toolkit'] } },
  });
}

function doctorOpts(fixture) {
  return {
    scopeRoot: fixture.scope,
    configRoot: fixture.config,
    profile: 'web',
    profileRoot: fixture.profile,
    now: '2026-09-14T08:00:00.000Z',
  };
}

function cli(args) {
  const res = spawnSync(process.execPath, [cliAbs, 'doctor', ...args], { encoding: 'utf8' });
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function countBackupDirs(config) {
  const p = path.join(config, 'doctor-backups');
  if (!fs.existsSync(p)) return 0;
  return fs.readdirSync(p).length;
}

function hashRealScanSurface() {
  const files = [];
  const rootAbs = path.resolve(realConfigRoot);
  function pushByRel(rel) {
    const abs = path.join(rootAbs, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) files.push({ rel: rel.replace(/\\/g, '/'), abs });
  }
  const presetDir = path.join(rootAbs, '.agent-presets');
  if (fs.existsSync(presetDir)) {
    const walk = function (dir, relDir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = relDir ? path.join(relDir, entry.name) : entry.name;
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(abs, rel);
        else if (entry.isFile() && entry.name.endsWith('.cordis.yml')) pushByRel(rel);
      }
    };
    walk(presetDir, '');
  }
  if (fs.existsSync(rootAbs)) {
    for (const entry of fs.readdirSync(rootAbs, { withFileTypes: true })) {
      if (entry.isFile() && /^dsh-[^/]+\.json$/.test(entry.name)) pushByRel(entry.name);
    }
  }
  pushByRel(path.join('profiles', 'web', 'package.json'));
  pushByRel(path.join('profiles', 'web', 'cordis.patch.yml'));
  const homePatch = path.join(rootAbs, 'cordis.patch.yml');
  if (fs.existsSync(homePatch)) pushByRel('cordis.patch.yml');

  files.sort(function (a, b) { return a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0; });
  const h = crypto.createHash('sha256');
  for (const f of files) {
    h.update(f.rel);
    h.update('\0');
    h.update(sha256File(f.abs));
    h.update('\n');
  }
  return { hash: h.digest('hex'), fileCount: files.length };
}

async function main() {
  console.log('=== a) fixture 注入旧名引用 → dry-run → apply → 复检 0 error ===');
  const a = mkFixture('a');
  baseFixture(a);
  const presetA = path.join(a.config, '.agent-presets', 'liangshen', 'agent.cordis.yml');
  writeText(presetA, 'compaction:\n  name: \'@local/dsh-compact-router\'\n');
  const dryA = cli(['--scope', a.scope, '--config-root', a.config, '--now', '2026-09-14T08:00:00.000Z']);
  assert.equal(dryA.status, 1, 'dry-run 应退出 1');
  console.log('dry-run exit=' + dryA.status + ' (期望 1)');
  const beforeApplyA = fs.readFileSync(presetA);
  const applyA = cli(['--apply', '--yes', '--scope', a.scope, '--config-root', a.config, '--now', '2026-09-14T08:00:00.000Z']);
  assert.equal(applyA.status, 0, 'apply 应归零并退出 0: ' + applyA.stderr + applyA.stdout);
  console.log('apply exit=' + applyA.status + ' (期望 0)');
  assert.notEqual(fs.readFileSync(presetA).toString(), beforeApplyA.toString(), '文件应已修复');
  const stampA = JSON.parse(fs.readFileSync(path.join(a.config, 'doctor-patch-state.json'), 'utf8')).rollbackChain[0].stamp;
  assert.ok(fs.existsSync(path.join(a.config, 'doctor-backups', stampA, 'config', '.agent-presets', 'liangshen', 'agent.cordis.yml')), '备份文件应存在');
  const rescanA = await runDoctor(doctorOpts(a));
  assert.equal(rescanA.summary.error, 0, '复检应 0 error');
  console.log('PASS a\n');

  console.log('=== b) 干净环境再 apply → 0 fixable、无新备份、状态不变 ===');
  {
    const b = mkFixture('b');
    baseFixture(b);
    const stateFileB = path.join(b.config, 'doctor-patch-state.json');
    const stateBeforeB = fs.existsSync(stateFileB) ? fs.readFileSync(stateFileB, 'utf8') : null;
    const backupsBeforeB = countBackupDirs(b.config);
    const clean = cli(['--apply', '--yes', '--scope', b.scope, '--config-root', b.config, '--now', '2026-09-14T08:00:00.000Z']);
    assert.equal(clean.status, 0, '干净环境 apply 应退出 0: ' + clean.stderr + clean.stdout);
    assert.equal(countBackupDirs(b.config), backupsBeforeB, '不应有新备份目录');
    const stateAfterB = fs.existsSync(stateFileB) ? fs.readFileSync(stateFileB, 'utf8') : null;
    assert.equal(stateAfterB, stateBeforeB, '状态文件不变');
    console.log('PASS b\n');
  }

  console.log('=== c) protected 负向：*.bak-* 与 preset-backups/ 目标整轮拒绝 ===');
  {
    const c = mkFixture('c');
    baseFixture(c);
    const dirA = path.join(c.scope, 'legacy.bak-2026');
    const dirB = path.join(c.scope, 'preset-backups');
    fs.mkdirSync(dirA, { recursive: true });
    fs.mkdirSync(dirB, { recursive: true });
    const fileA = path.join(dirA, 'a.cordis.yml');
    const fileB = path.join(dirB, 'b.cordis.yml');
    writeText(fileA, 'name: \'@local/dsh-compact-router\'\n');
    writeText(fileB, 'name: \'@local/dsh-compact-router\'\n');
    const report = {
      scope: { root: c.scope, profile: 'web' },
      summary: { error: 2, warning: 0, info: 0, safe: 0, rewrite: 2, destructive: 0, manual: 0, fixable: 2 },
      environment: { configRoot: c.config, roots: { scope: c.scope, config: c.config, profile: c.profile } },
      issues: [
        { id: 'ref.unresolvable-local', severity: 'error', root: 'scope', file: 'legacy.bak-2026/a.cordis.yml', line: 1, occurrence: 1, message: 'x', old: '@local/dsh-compact-router', new: '@local/dsh-toolkit/compact-router', fix: { class: 'rewrite', plan: [{ op: 'replace', root: 'scope', file: 'legacy.bak-2026/a.cordis.yml', old: '@local/dsh-compact-router', new: '@local/dsh-toolkit/compact-router', occurrence: 1 }] } },
        { id: 'ref.unresolvable-local', severity: 'error', root: 'scope', file: 'preset-backups/b.cordis.yml', line: 1, occurrence: 1, message: 'x', old: '@local/dsh-compact-router', new: '@local/dsh-toolkit/compact-router', fix: { class: 'rewrite', plan: [{ op: 'replace', root: 'scope', file: 'preset-backups/b.cordis.yml', old: '@local/dsh-compact-router', new: '@local/dsh-toolkit/compact-router', occurrence: 1 }] } },
      ],
    };
    const reportPath = path.join(c.root, 'protected-report.json');
    writeJson(reportPath, report);
    const protectedCli = cli(['--apply', '--yes', '--report', reportPath]);
    assert.equal(protectedCli.status, 2, 'protected apply CLI 应退出 2: ' + protectedCli.stdout + protectedCli.stderr);
    assert.match(protectedCli.stderr, /protected 硬断言失败/);
    assert.equal(fs.readFileSync(fileA, 'utf8'), 'name: \'@local/dsh-compact-router\'\n');
    assert.equal(fs.readFileSync(fileB, 'utf8'), 'name: \'@local/dsh-compact-router\'\n');
    assert.equal(fs.existsSync(path.join(c.config, 'doctor-backups')), false);
    console.log('PASS c (CLI exit=2)\n');
  }

  console.log('=== d) 锚点漂移：dry-run 之后改动目标文件 → apply step 失败、零写入 ===');
  {
    const d = mkFixture('d');
    baseFixture(d);
    const file = path.join(d.config, 'dsh-search-router.json');
    writeText(file, '{"provider":"@local/dsh-compact-router"}\n');
    const report = await runDoctor(doctorOpts(d));
    fs.writeFileSync(file, '{"provider":"@local/dsh-toolkit/compact-router"}\n', 'utf8');
    const result = await executeApply(report, { confirm: async function () { return true; } });
    assert.equal(result.ok, false);
    assert.equal(result.results[0].code, 'ANCHOR_DRIFT');
    assert.equal(fs.readFileSync(file, 'utf8'), '{"provider":"@local/dsh-toolkit/compact-router"}\n');
    assert.equal(fs.existsSync(path.join(d.config, 'doctor-backups')), false);
    console.log('PASS d (step 失败且目标文件未再写入)\n');
  }

  console.log('=== e) 真实影子验证：复制真实 configRoot 扫描相关子集到临时目录 ===');
  {
    const hashBefore = hashRealScanSurface();
    console.log('real configRoot scan-surface hash before=' + hashBefore.hash + ' (' + hashBefore.fileCount + ' files)');
    const shadowRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-doctor-shadow-'));
    const shadowConfig = path.join(shadowRoot, 'config');
    fs.mkdirSync(path.join(shadowConfig, 'profiles', 'web'), { recursive: true });
    fs.mkdirSync(path.join(shadowConfig, '.agent-presets', 'liangshen'), { recursive: true });

    const realProfilePkg = path.join(realConfigRoot, 'profiles', 'web', 'package.json');
    const realProfilePatch = path.join(realConfigRoot, 'profiles', 'web', 'cordis.patch.yml');
    const realPreset = path.join(realConfigRoot, '.agent-presets', 'liangshen', 'agent.cordis.yml');
    fs.copyFileSync(realProfilePkg, path.join(shadowConfig, 'profiles', 'web', 'package.json'));
    fs.copyFileSync(realProfilePatch, path.join(shadowConfig, 'profiles', 'web', 'cordis.patch.yml'));
    const shadowPreset = path.join(shadowConfig, '.agent-presets', 'liangshen', 'agent.cordis.yml');
    let presetText = fs.readFileSync(realPreset, 'utf8');
    const oldName = '@local/dsh-compact-router';
    const newName = '@local/dsh-toolkit/compact-router';
    assert.ok(presetText.includes(newName), '真实预设当前应为新名，才能注入旧名做影子验证');
    presetText = presetText.replace(newName, oldName);
    fs.writeFileSync(shadowPreset, presetText, 'utf8');

    const shadowReport = await runDoctor({ scopeRoot: realScopeRoot, configRoot: shadowConfig, profile: 'web', profileRoot: path.join(shadowConfig, 'profiles', 'web'), now: '2026-09-14T08:00:00.000Z' });
    assert.ok(shadowReport.issues.some(function (issue) { return issue.id === 'ref.unresolvable-local' && issue.old === oldName; }), '影子应检出旧名引用');
    const shadowApply = await executeApply(shadowReport, { confirm: async function () { return true; } });
    assert.equal(shadowApply.ok, true);
    const shadowRescan = await runDoctor({ scopeRoot: realScopeRoot, configRoot: shadowConfig, profile: 'web', profileRoot: path.join(shadowConfig, 'profiles', 'web'), now: '2026-09-14T08:00:00.000Z' });
    assert.equal(shadowRescan.summary.error, 0, '影子复检应 0 error');
    assert.ok(fs.readFileSync(shadowPreset, 'utf8').includes(newName), '影子预设应已修复');

    const hashAfter = hashRealScanSurface();
    console.log('real configRoot scan-surface hash after =' + hashAfter.hash + ' (' + hashAfter.fileCount + ' files)');
    assert.equal(hashAfter.hash, hashBefore.hash, '真实 configRoot 医生扫描面 hash 必须一致');
    console.log('PASS e\n');
  }

  console.log('=== f) rollback → 目标文件与修复前逐字节一致 ===');
  {
    const f = mkFixture('f');
    baseFixture(f);
    const file = path.join(f.config, 'dsh-search-router.json');
    writeText(file, '{"provider":"@local/dsh-compact-router"}\n');
    const before = fs.readFileSync(file);
    const report = await runDoctor(doctorOpts(f));
    await executeApply(report, { confirm: async function () { return true; } });
    assert.notEqual(fs.readFileSync(file).toString(), before.toString());
    const rb = cli(['--rollback', '--scope', f.scope, '--config-root', f.config, '--now', '2026-09-14T08:00:00.000Z']);
    assert.equal(rb.status, 0, 'rollback CLI 应退出 0: ' + rb.stderr + rb.stdout);
    assert.deepEqual(fs.readFileSync(file), before, '回滚后应与修复前逐字节一致');
    const chain = readPatchState(f.config).rollbackChain;
    assert.equal(chain.length, 2, '状态链应包含 apply 与 rollback');
    console.log('PASS f (rollback CLI exit=0, 字节级恢复)\n');
  }

  console.log('=== g) 退出码符合表 ===');
  {
    const g = mkFixture('g');
    baseFixture(g);
    writeText(path.join(g.config, '.agent-presets', 'liangshen', 'agent.cordis.yml'), 'name: \'@local/dsh-compact-router\'\n');
    const dry = cli(['--scope', g.scope, '--config-root', g.config, '--now', '2026-09-14T08:00:00.000Z']);
    assert.equal(dry.status, 1, 'dry-run 发现问题应退出 1');
    const apply = cli(['--apply', '--yes', '--scope', g.scope, '--config-root', g.config, '--now', '2026-09-14T08:00:00.000Z']);
    assert.equal(apply.status, 0, 'apply 归零应退出 0');
    const clean = cli(['--apply', '--yes', '--scope', g.scope, '--config-root', g.config, '--now', '2026-09-14T08:00:00.000Z']);
    assert.equal(clean.status, 0, '0 fixable 应退出 0');
    console.log('dry-run=' + dry.status + ' apply=' + apply.status + ' clean=' + clean.status);
    console.log('0=绿或成功归零；1=dry-run 发现问题；2=apply 后残留或 step 失败（protected 已在 c 中验证）；130=用户取消（代码路径 confirmIssue 返回 false）');
  }

  console.log('ALL STAGE-3 ACCEPTANCE PASS');
}

main().catch(function (err) {
  console.error('ACCEPTANCE FAIL: ' + (err && err.stack || err));
  process.exit(1);
});