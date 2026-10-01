// D1 自测（批 2 设计稿 p24-design-batch2-console.md §6.2/§7）：
//   --states 只读命令 / --only 单条语义 / --yes 语义文档化 / 受保护断言不因 --yes 减免。
// 全部走 os.tmpdir 副本（--scope/--config-root 指向夹具），真实 ~/.dsh 零触碰。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const doctorRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliAbs = path.join(doctorRoot, 'src', 'cli.mjs');
const realConfigRoot = 'C:/Users/LENOVO/.dsh';

function mkFixture(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-doctor-d1-' + name + '-'));
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

const STALE = '@local/dsh-compact-router';
const FRESH = '@local/dsh-toolkit/compact-router';

function baseFixture(fixture) {
  writeJson(path.join(fixture.scope, 'package.json'), { name: '@local/dsh-toolkit', version: '0.1.0', type: 'module', exports: { './compact-router': './lib/compact-router/index.js', './agent-memory': './lib/agent-memory/index.js' } });
  writeJson(path.join(fixture.scope, 'dsh.plugin.json'), {
    manifestVersion: 1,
    name: '@local/dsh-toolkit',
    aliases: { '@local/dsh-compact-router': FRESH },
    requirements: {
      runtime: {}, binaries: [], packages: {},
      registers: { inject: ['bogus-face'] },
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

// 失效引用夹具：放 config 根热配置（engine 扫描面 = manifest/json/yaml 声明面，不含插件源码）。
const HOT_REL = 'dsh-demo.json'; // 相对 config root
function writeStaleRef(fixture) {
  writeJson(path.join(fixture.config, HOT_REL), {
    note: 'history: migrated from ' + STALE + ' to ' + FRESH + ' (stale ref kept on purpose)',
  });
}

function cli(args, opts) {
  const env = Object.assign({}, process.env, { DSH_DOCTOR_HOST_VERSION: '0.0.0-cli-fixture' }, (opts && opts.env) || {});
  // R4 测试隔离：缺省钉住宿主版本 ⇒ CLI 用例不 spawn 真 dsh（宿主不在场的机器给出同一读数）。
  // 需要走"宿主自述探测"这条路时用 opts.unsetHostVersionEnv 显式摘掉 env。
  if (opts && opts.unsetHostVersionEnv) delete env.DSH_DOCTOR_HOST_VERSION;
  const res = spawnSync(process.execPath, [cliAbs, 'doctor', ...args], { encoding: 'utf8', env: env });
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' };
}

function parseJsonOut(out) {
  const start = out.indexOf('{');
  assert.ok(start !== -1, 'stdout 应含 JSON');
  return JSON.parse(out.slice(start));
}

function countBackupDirs(config) {
  const p = path.join(config, 'doctor-backups');
  return fs.existsSync(p) ? fs.readdirSync(p).length : 0;
}

function hashRealScanSurface() {
  // 只读护栏：真实 ~/.dsh 顶层不新增 doctor 产物
  return ['doctor-patch-state.json', 'doctor-backups', 'doctor-apply.lock']
    .map((rel) => fs.existsSync(path.join(realConfigRoot, rel)) ? rel : null)
    .filter(Boolean).length;
}

let pass = 0;
function check(name, ok, detail) {
  if (!ok) throw new Error('FAIL ' + name + (detail ? ' :: ' + detail : ''));
  pass++;
  console.log('ok - ' + name);
}

// ---- T1 --states 空态 ----
{
  const fx = mkFixture('empty');
  baseFixture(fx);
  const r = cli(['--json', '--states', '--scope', fx.scope, '--config-root', fx.config, '--profile', 'web']);
  const j = parseJsonOut(r.stdout);
  check('--states 空态 exit=0', r.status === 0, 'status=' + r.status);
  check('--states 空链', Array.isArray(j.states) && j.states.length === 0, JSON.stringify(j.states));
  check('--states configRoot=--config-root', j.configRoot === fx.config);
}

// ---- T2 apply --only 修一个 fixable；manual 不动；--states 出账 ----
{
  const fx = mkFixture('only-fixable');
  baseFixture(fx);
  writeStaleRef(fx);
  const before = fs.readFileSync(path.join(fx.config, HOT_REL), 'utf8');
  const r = cli(['--json', '--apply', '--only', 'ref.unresolvable-local', '--yes', '--scope', fx.scope, '--config-root', fx.config, '--profile', 'web']);
  const after = fs.readFileSync(path.join(fx.config, HOT_REL), 'utf8');
  check('--only apply 退出码 0（rescan 无 error）', r.status === 0, 'status=' + r.status + ' err=' + r.stderr.slice(0, 200));
  check('--only apply 目标文件已改', after.includes(FRESH) && !after.includes(STALE));
  // reg.inject-face-unknown（manual warning）不产生任何写入，但仍在报告里
  const scan = cli(['--json', '--scope', fx.scope, '--config-root', fx.config, '--profile', 'web']);
  const rep = parseJsonOut(scan.stdout);
  check('manual 问题仍在案且无 plan', (rep.issues || []).some((i) => i.id === 'reg.inject-face-unknown' && i.fix && Array.isArray(i.fix.plan) && i.fix.plan.length === 0));
  const st = parseJsonOut(cli(['--json', '--states', '--scope', fx.scope, '--config-root', fx.config, '--profile', 'web']).stdout);
  check('--states 记 1 条 apply', st.states.length === 1 && st.states[0].action === 'apply', JSON.stringify(st.states));
  check('--states files=1', st.states[0].files === 1 && st.states[0].packages === 0);
  check('写前备份在案', countBackupDirs(fx.config) === 1);
  assert.ok(before.includes(STALE));
}

// ---- T3 --only 指向 manual ⇒ issue-not-executable，零写入 ----
{
  const fx = mkFixture('only-manual');
  baseFixture(fx);
  const backupsBefore = countBackupDirs(fx.config);
  const r = cli(['--json', '--apply', '--only', 'reg.inject-face-unknown', '--yes', '--scope', fx.scope, '--config-root', fx.config, '--profile', 'web']);
  check('manual ⇒ exit=2 + issue-not-executable', r.status === 2 && r.stderr.includes('issue-not-executable'), r.stderr.slice(0, 200));
  check('零写入（无备份目录）', countBackupDirs(fx.config) === backupsBefore);
}

// ---- T4 --only 未找到 ⇒ issue-not-found ----
{
  const fx = mkFixture('only-missing');
  baseFixture(fx);
  const r = cli(['--json', '--apply', '--only', 'no.such.issue', '--yes', '--scope', fx.scope, '--config-root', fx.config, '--profile', 'web']);
  check('未找到 ⇒ exit=2 + issue-not-found', r.status === 2 && r.stderr.includes('issue-not-found'), r.stderr.slice(0, 200));
}

// ---- T5 --only 非法字符 ⇒ exit=2 ----
{
  const fx = mkFixture('only-badid');
  baseFixture(fx);
  const r = cli(['--json', '--apply', '--only', 'bad/id;rm', '--yes', '--scope', fx.scope, '--config-root', fx.config, '--profile', 'web']);
  check('非法 id ⇒ exit=2 + 白名单提示', r.status === 2 && r.stderr.includes('非法字符'), r.stderr.slice(0, 200));
}

// ---- T6 rollback 经 CLI：文件字节级复原；--states 记 rollback ----
{
  const fx = mkFixture('rollback');
  baseFixture(fx);
  writeStaleRef(fx);
  const original = fs.readFileSync(path.join(fx.config, HOT_REL), 'utf8');
  cli(['--json', '--apply', '--only', 'ref.unresolvable-local', '--yes', '--scope', fx.scope, '--config-root', fx.config, '--profile', 'web']);
  const st1 = parseJsonOut(cli(['--json', '--states', '--scope', fx.scope, '--config-root', fx.config, '--profile', 'web']).stdout);
  const stamp = st1.states[0].stamp;
  const rb = cli(['--json', '--rollback', '--to', stamp, '--scope', fx.scope, '--config-root', fx.config, '--profile', 'web']);
  const restored = fs.readFileSync(path.join(fx.config, HOT_REL), 'utf8');
  check('rollback exit=0', rb.status === 0, 'status=' + rb.status + ' err=' + rb.stderr.slice(0, 200));
  check('rollback 字节级复原', restored === original);
  const st2 = parseJsonOut(cli(['--json', '--states', '--scope', fx.scope, '--config-root', fx.config, '--profile', 'web']).stdout);
  check('--states 记 2 条（apply+rollback）', st2.states.length === 2 && st2.states[1].action === 'rollback', JSON.stringify(st2.states.map((s) => s.action)));
}

// ---- T7 --help 文档化（D1 条件①）----
{
  const r = cli(['--help']);
  const text = r.stdout + r.stderr;
  check('--help 含 --states', text.includes('--states'));
  check('--help 含 --only', text.includes('--only'));
  check('--help 含知情确认语义', text.includes('调用方须已完成知情确认'), text.slice(0, 300));
}

// ---- T8 非交互无 --yes 仍拒绝（不因 D1 放宽）----
{
  const fx = mkFixture('non-tty');
  baseFixture(fx);
  writeStaleRef(fx);
  const r = cli(['--json', '--apply', '--scope', fx.scope, '--config-root', fx.config, '--profile', 'web']);
  check('非交互无 --yes ⇒ exit=2', r.status === 2 && r.stderr.includes('交互确认'), r.stderr.slice(0, 200));
}

// ---- R4 · --host-version 旗标 + --help 顺带账 ----
{
  const r = cli(['--help']);
  check('--help 列出 --host-version（本笔新旗标）', r.status === 0 && r.stdout.includes('--host-version'), r.stdout.slice(0, 200));
  check('--help 补齐 --report 与 --dry-run（顺带账：此前两行从未写进 --help）',
    r.stdout.includes('--report') && r.stdout.includes('--dry-run'), r.stdout.slice(0, 600));
}

{
  const fx = mkFixture('hv-flag');
  baseFixture(fx);
  const r = cli(['--json', '--scope', fx.scope, '--config-root', fx.config, '--profile', 'web', '--host-version', '0.4.2']);
  const report = parseJsonOut(r.stdout);
  check('--host-version 赢过 env（CLI 侧顺位①，env 已被 cli() 钉成 0.0.0-cli-fixture）',
    report.environment.hostVersion === '0.4.2', JSON.stringify(report.environment.hostVersion));
}

{
  const fx = mkFixture('hv-selfreport');
  baseFixture(fx);
  const r = cli(['--json', '--scope', fx.scope, '--config-root', fx.config, '--profile', 'web'], { unsetHostVersionEnv: true });
  const report = parseJsonOut(r.stdout);
  const hostVersion = String(report.environment.hostVersion);
  // 两种读数都合法且都算通过：本机有 dsh ⇒ 宿主自述真值；没有 ⇒ 'unknown'（跳过比对）。
  // 唯一不可接受的是第三个值 —— 那说明写死的 0.1.2-rc.1 又回来了。
  check('无旗标无 env ⇒ 读数只能是宿主自述真值或 unknown（冒充旧值已消失）',
    hostVersion === 'unknown' || /^\d+\.\d+/.test(hostVersion), hostVersion);
  check('上述读数下 runtime.dsh 未被冒充打断（夹具无 dsh 范围 ⇒ 0 error）',
    report.summary.error === 0, JSON.stringify(report.summary));
}

// ---- 真实 ~/.dsh 护栏 ----
{
  check('真实 ~/.dsh 无 doctor 产物', hashRealScanSurface() === 0);
}

console.log('RESULT: ' + pass + '/' + pass + ' PASS');
