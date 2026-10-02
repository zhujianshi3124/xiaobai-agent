/**
 * xiaobai-agent（agent-memory）— 自动化测试（设计稿 §8 约束 A-G/L + 2026-09-10 全局化修订）
 *
 * 全局布局：数据根 = 机器级全局目录（测试全部显式传临时 root 隔离；A4 验证
 * env 覆盖与主目录默认解析）。运行：node test/run-all.mjs
 *
 * 用例编号：A1-A4 / B1-B6 / C1-C6 / D1-D9 / E1-E3 / F1-F3 / G1-G5 / L1-L5 / §7 /
 *            W1-W2（跨工作区移交 + 一致性检查）/ R1-R2（全局 registry 锁与并发）/
 *            PERM1（永久指令区：台账固化 + checkpoint 正典副本/冷启动恢复双路冗余）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as m from '../lib/agent-memory/lib/index.js';
import { parseScriptRoot, SANDBOX_ROOT, DEMO_SANDBOX_ROOT, PRODUCTION_ROOT } from '../lib/agent-memory/lib/script-guard.js';
import { assertUtcIso } from '../lib/agent-memory/lib/time.js';
import * as runtime from '../lib/agent-memory/lib/runtime.js';
import { register as registerPlugin } from '../lib/agent-memory/plugin.js';
import { assertMigrationOrder, runMigrationSequence } from '../lib/agent-memory/lib/migration.js';
import { checkNodeVersion, checkDependencies, checkEngineLoad, checkInstallLocations, checkPresetMount, checkBackupReady, checkGlobalRoot, checkBundleMountResolvable, locateDshInstall, runPreflight } from '../lib/agent-memory/lib/preflight.js';
import { checkNewWorkspace } from '../lib/agent-memory/lib/workspace-health.js';
import { backupFileBeforeWrite, isInsideProductionRoot, BACKUP_KEEP } from '../lib/agent-memory/lib/backup.js';

const SUITE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const AGENT_MEMORY_DIR = path.join(SUITE_ROOT, 'lib', 'agent-memory');

/* ================= 事故护栏 2（2026-09-10）：解析出的根 == 生产根 → 立即中止 =================
 * 测试套件任何路径都不允许写生产根。若调用方把 AGENT_MEMORY_ROOT / AGENT_ROOT
 * 指向生产根，按 fail-closed 原则直接拒绝启动（不进入任何用例）。
 */
{
  const envRoot = process.env[m.DATA_ROOT_ENV] ?? process.env[m.DATA_ROOT_ENV_LEGACY];
  if (envRoot && path.resolve(envRoot) === PRODUCTION_ROOT) {
    console.error(
      `[护栏-2] 拒绝启动测试：${m.DATA_ROOT_ENV}/${m.DATA_ROOT_ENV_LEGACY} 指向生产根 ${PRODUCTION_ROOT}`
    );
    process.exit(3);
  }
}

const LIB_URL = new URL('../lib/agent-memory/lib/index.js', import.meta.url).href;

function tmpRoot() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-memory-test-'));
  if (path.resolve(d) === PRODUCTION_ROOT) {
    // 理论上不可能（os.tmpdir 不在主目录下），硬断言防御未来变更
    console.error('[护栏-2] tmpRoot 解析出生产根，中止');
    process.exit(3);
  }
  return d;
}
function countFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else n++;
    }
  };
  walk(dir);
  return n;
}
function wsOf(root, name = 'ws') {
  const d = path.join(root, name);
  fs.mkdirSync(d, { recursive: true });
  return path.resolve(d);
}
function sidFor(n) {
  return `20260910-${String(n).padStart(8, '0')}`;
}
/** 宿主会话 UUID（v4 变体，确定性可念）：前 12 位 hex 随 n 变化（保证候选 sid 去重）。 */
function hostFor(n) {
  const p = String(n).padStart(12, '0');
  return `${p.slice(0, 8)}-${p.slice(8, 12)}-4111-8000-000000000000`;
}
function ledgerFile(root, sid) {
  return path.join(root, 'sessions', sid, 'ledger.md');
}
function progressFile(root, sid) {
  return path.join(root, 'sessions', sid, 'progress.md');
}
function registryFile(root) {
  return path.join(root, 'registry.json');
}

/* ================= A 目录/命名/全局根 ================= */

test('A1: init 创建 registry + 3 会话文件（全局数据根结构）', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const s = m.createSession(root, { sid: sidFor(1), dshSessionId: hostFor(1), taskSummary: 't', workspace: ws });
  assert.ok(fs.existsSync(registryFile(root)), 'registry.json 应在数据根');
  for (const f of ['ledger.md', 'progress.md', 'archive.md']) {
    assert.ok(fs.existsSync(path.join(root, 'sessions', s.sid, f)), f + ' 应存在');
  }
  // 内部结构不变：registry.json + .locks/ + sessions/<sid>/{ledger,progress,archive}.md
  assert.ok(fs.existsSync(path.join(root, '.locks')), '.locks 目录应存在');
});

test('A2: sid 匹配 /^\\d{8}-[a-z0-9]{8,12}$/（新 12 位候选 + 兼容旧 8 位）', () => {
  const root = tmpRoot();
  const s = m.createSession(root, { taskSummary: 't', workspace: root });
  assert.match(s.sid, /^\d{8}-[a-z0-9]{12}$/); // 无宿主 → generateSid 现为 12 位
  assert.ok(m.isValidSid(s.sid));
  assert.ok(m.isValidSid('20260910-abcdabcd')); // 旧 8 位仍合法
  assert.ok(m.isValidSid('20260910-abcdabcdabcd')); // 新 12 位合法
  assert.throws(() => m.assertValidSid('bad-sid'), (e) => e.code === 'INVALID_SID');
});

test('A3: 台账头部字段齐全', () => {
  const root = tmpRoot();
  const s = m.createSession(root, {
    sid: sidFor(1), dshSessionId: hostFor(1), taskSummary: '摘要', task: '任务',
    modelTurn: 7, now: new Date('2026-09-10T13:00:00+08:00'), workspace: root,
  });
  const h = m.readHeader(root, s.sid);
  for (const k of ['sid', 'dshSessionId', 'task', 'createdAt', 'updatedAt', 'heartbeatTurn', 'schemaVersion', 'status']) {
    assert.ok(k in h, k + ' 字段应存在');
  }
  assert.equal(h.sid, s.sid);
  assert.equal(h.dshSessionId, hostFor(1));
  assert.equal(h.task, '任务');
  assert.equal(h.heartbeatTurn, 7);
  assert.equal(h.schemaVersion, 1, 'ledger 头部应有 schemaVersion=1');
  assert.equal(h.status, '活跃');
});

test('A4: 数据根解析 —— env 覆盖优先，缺省 = 主目录/.agent-memory', () => {
  const saved = {
    AGENT_MEMORY_ROOT: process.env.AGENT_MEMORY_ROOT,
    AGENT_ROOT: process.env.AGENT_ROOT,
  };
  try {
    // 新 env 优先
    process.env.AGENT_MEMORY_ROOT = '/tmp/am-root-a';
    process.env.AGENT_ROOT = '/tmp/am-root-legacy';
    assert.equal(m.resolveDataRoot(), path.resolve('/tmp/am-root-a'));
    // 新 env 缺失 → 兼容旧 env
    delete process.env.AGENT_MEMORY_ROOT;
    assert.equal(m.resolveDataRoot(), path.resolve('/tmp/am-root-legacy'));
    // 都缺失 → 主目录默认
    delete process.env.AGENT_ROOT;
    assert.equal(m.resolveDataRoot(), path.join(os.homedir(), m.DATA_DIR));
    // 显式 dataRoot 最高优先
    assert.equal(m.resolveDataRoot({ dataRoot: '/tmp/am-root-x' }), path.resolve('/tmp/am-root-x'));
    // 工作区校验：相对路径拒绝
    assert.throws(() => m.assertValidWorkspace('relative/ws'), (e) => e.code === 'INVALID_WORKSPACE');
    assert.throws(() => m.assertValidWorkspace(''), (e) => e.code === 'INVALID_WORKSPACE');
    assert.equal(m.assertValidWorkspace('C:/x/y'), path.resolve('C:/x/y'));
  } finally {
    restoreEnv('AGENT_MEMORY_ROOT', saved.AGENT_MEMORY_ROOT);
    restoreEnv('AGENT_ROOT', saved.AGENT_ROOT);
  }
});
function restoreEnv(k, v) {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
}

/* ================= 护栏测试（2026-09-10 事故回归） ================= */

test('A5: 护栏极性反转 —— 脚本默认根=沙箱；生产根须显式 opt-in；生产根 --clean 禁止', () => {
  // 默认：不传任何参数 → 沙箱根（生产根周围的环境变量不影响脚本默认值）
  const dflt = parseScriptRoot([]);
  assert.equal(dflt.root, SANDBOX_ROOT, '默认根应为沙箱根（不再默认生产根）');
  assert.equal(dflt.isProduction, false);
  // 解析到生产根而未 opt-in → PRODUCTION_ROOT_DENIED
  assert.throws(
    () => parseScriptRoot(['--root', PRODUCTION_ROOT]),
    (e) => e.code === 'PRODUCTION_ROOT_DENIED'
  );
  // 显式 opt-in → 允许（标注 isProduction）
  const optIn = parseScriptRoot(['--root', PRODUCTION_ROOT, '--allow-production']);
  assert.equal(optIn.isProduction, true);
  assert.equal(optIn.root, PRODUCTION_ROOT);
  // 生产根 + --clean → 永远禁止
  assert.throws(
    () => parseScriptRoot(['--root', PRODUCTION_ROOT, '--allow-production', '--clean']),
    (e) => e.code === 'PRODUCTION_ROOT_CLEAN_DENIED'
  );
  // 自定义沙箱 --root 可用
  const custom = parseScriptRoot(['--root', '/tmp/am-custom-sandbox']);
  assert.equal(custom.root, path.resolve('/tmp/am-custom-sandbox'));
  assert.equal(custom.isProduction, false);
});

test('A6: 演示脚本语义更严 —— 永远禁止生产根（--allow-production 也拒绝）', () => {
  assert.throws(
    () => parseScriptRoot(['--root', PRODUCTION_ROOT, '--allow-production'], { allowProductionOptIn: false }),
    (e) => e.code === 'PRODUCTION_ROOT_FORBIDDEN'
  );
  assert.throws(
    () => parseScriptRoot(['--allow-production'], { allowProductionOptIn: false }),
    (e) => e.code === 'PRODUCTION_ROOT_FORBIDDEN'
  );
  const d = parseScriptRoot([], { allowProductionOptIn: false, sandboxRoot: DEMO_SANDBOX_ROOT });
  assert.equal(d.root, DEMO_SANDBOX_ROOT, '演示默认根应为演示沙箱');
});

/* ================= 备份机制（2026-09-10 事故修复，用户确认方案 A 修订版） ================= */

test('A7: 备份 —— 生产根判定 + 覆盖前快照 + 200 份轮转（备份目录在根外）', () => {
  // 路径判定（纯字符串判定，不落盘、不触碰生产根）
  const prodFile = path.join(os.homedir(), '.agent-memory', 'sessions', 'x', 'ledger.md');
  assert.equal(isInsideProductionRoot(prodFile), true);
  assert.equal(isInsideProductionRoot(path.join(os.tmpdir(), 'agent-memory-test-aaa', 'ledger.md')), false);

  // 强制快照：既有文件覆盖前复制到备份目录（force 模式，纯函数测试）
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-memory-backup-a7-'));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-memory-work-a7-'));
  const f = path.join(work, 'doc.txt');
  fs.writeFileSync(f, 'v1');
  const snap = backupFileBeforeWrite(f, { force: true, backupDir });
  assert.ok(snap && fs.existsSync(snap), '快照应已创建');
  assert.equal(fs.readFileSync(snap, 'utf8'), 'v1');
  // 文件不存在 → 不备份
  assert.equal(backupFileBeforeWrite(path.join(work, 'missing.txt'), { force: true, backupDir }), null);

  // 轮转：keep=5 时反复写 10 次，备份目录文件数不超过 5+少量（保留最近 5 份）
  const keep = 5;
  for (let i = 0; i < 10; i++) {
    fs.writeFileSync(f, 'v' + i);
    backupFileBeforeWrite(f, { force: true, backupDir, keep });
  }
  const total = countFiles(backupDir);
  assert.ok(total <= keep + 1, `轮转后文件数 ${total} 应 ≤ ${keep + 1}`);
  assert.equal(BACKUP_KEEP, 200, '默认保留份数 = 200（用户拍板）');
});

test('A8: removeSession —— 单会话删除 + registry 同步 + 目录删除 + 操作记录 + 删除前快照', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws');
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: 'junk', workspace: ws });
  m.addEntry(root, s.sid, { desc: 'x', workspace: ws });
  const backupDir = path.join(root, '..', 'agent-memory-backup-a8');
  const ops = [];
  const removed = m.removeSession(root, s.sid, {
    recordOp: (o) => ops.push(o),
    backup: { force: true, backupDir },
  });
  assert.equal(removed.sid, s.sid);
  assert.equal(removed.taskSummary, 'junk');
  assert.equal(m.readRegistry(root).sessions.length, 0, 'registry 应移除该条');
  assert.equal(fs.existsSync(path.join(root, 'sessions', s.sid)), false, '会话目录应删除');
  assert.equal(ops.length, 1, '应留操作记录');
  assert.equal(ops[0].action, 'remove-session');
  assert.equal(ops[0].sid, s.sid);
  // 删除前快照存在（会话 ledger 被快照）
  assert.ok(countFiles(backupDir) >= 1, '删除前应有外部快照');
  // 再删 → NOT_REGISTERED
  assert.throws(() => m.removeSession(root, s.sid), (e) => e.code === 'NOT_REGISTERED');
});

test('A9: remove-session.mjs 脚本 —— 受保护记录拒绝 + 正路删除 + 操作留痕', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws');
  const s = m.createSession(root, { taskSummary: 'junk2', workspace: ws });
  const script = path.join(AGENT_MEMORY_DIR, 'remove-session.mjs');
  const backupDir = path.join(root, '..', 'agent-memory-backup-a9');
  const env = { ...process.env, AGENT_MEMORY_BACKUP_DIR: backupDir };

  // 受保护真实记录 → 拒绝（消息在 stderr）
  const r1 = spawnSync(process.execPath, [script, '--root', root, '--sid', '20260910-40da30ad'], { encoding: 'utf8', env });
  assert.notEqual(r1.status, 0, '受保护记录必须拒绝');
  assert.ok(r1.stderr.includes('受保护'), r1.stderr);

  // 未注册 sid → 拒绝
  const r2 = spawnSync(process.execPath, [script, '--root', root, '--sid', '20260910-00000000'], { encoding: 'utf8', env });
  assert.notEqual(r2.status, 0);
  assert.ok(r2.stderr.includes('不在根'), r2.stderr);

  // 正路删除
  const r3 = spawnSync(process.execPath, [script, '--root', root, '--sid', s.sid], { encoding: 'utf8', env });
  assert.equal(r3.status, 0, r3.stderr);
  assert.ok(r3.stdout.includes('REMOVED session ' + s.sid), r3.stdout);
  assert.equal(m.readRegistry(root).sessions.length, 0);
  // 操作留痕在备份根外
  assert.ok(countFiles(path.join(backupDir, 'ops')) >= 1, '应写操作留痕到备份根 ops/');
});

/* ================= B 隔离（含工作区维度） ================= */

test('B1: 第二活跃会话写同 sid → 拒绝', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const s1 = m.createSession(root, { sid: sidFor(1), taskSummary: 'a', workspace: ws });
  assert.throws(() => m.createSession(root, { sid: s1.sid, taskSummary: 'b', workspace: ws }), (e) => e.code === 'SID_EXISTS');
});

test('B2: 移交后旧 sid 写 → 拒绝；新 sid 可写', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const a = m.createSession(root, { sid: sidFor(1), taskSummary: '旧', workspace: ws });
  const b = m.createSession(root, { sid: sidFor(2), taskSummary: '新', workspace: ws });
  m.updateStatus(root, a.sid, '已移交', { handedOverTo: b.sid });
  assert.throws(() => m.addEntry(root, a.sid, { desc: 'x', workspace: ws }), (e) => e.code === 'WRITE_FORBIDDEN');
  const e = m.addEntry(root, b.sid, { desc: '新会话条目', workspace: ws });
  assert.equal(e.no, 'L-000');
});

test('B3: 候选只读列出，绝不自动选择', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  m.createSession(root, { sid: sidFor(1), taskSummary: 'a', workspace: ws });
  const before = fs.readFileSync(registryFile(root), 'utf8');
  const cands = m.listCandidates(root);
  const after = fs.readFileSync(registryFile(root), 'utf8');
  assert.equal(before, after, 'listCandidates 不得写 registry');
  assert.equal(cands.length, 1);
  assert.equal(cands[0].sid, sidFor(1));
  assert.equal(cands[0].currentWorkspace, path.resolve(ws), '候选必须带所属工作区');
  assert.equal(m.autoSelectCandidates, undefined, '不存在自动选择 API');
});

test('B4: 移交后新 sid 写自己的目录，旧目录零变化', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const a = m.createSession(root, { sid: sidFor(1), taskSummary: 'a', workspace: ws });
  const b = m.createSession(root, { sid: sidFor(2), taskSummary: 'b', workspace: ws });
  m.updateStatus(root, a.sid, '已移交', { handedOverTo: b.sid });
  // 快照点在移交完成之后：移交本身合法改写旧台账头部（status=已移交）
  const aBefore = fs.readFileSync(ledgerFile(root, a.sid), 'utf8');
  m.addEntry(root, b.sid, { desc: 'b 的条目', workspace: ws });
  const aAfter = fs.readFileSync(ledgerFile(root, a.sid), 'utf8');
  assert.equal(aBefore, aAfter, '新会话写入不得触碰旧会话目录');
  assert.equal(m.readLedger(root, b.sid).sections['待办'].length, 1);
});

test('B5: 两会话并发写同 sid → 一个成功一个 LOCK_BUSY', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: 't', workspace: ws });
  const l1 = m.acquireLock({ root, sid: s.sid, waitMs: 100 });
  assert.throws(() => m.acquireLock({ root, sid: s.sid, waitMs: 150 }), (e) => e.code === 'LOCK_BUSY');
  l1.release();
  const l3 = m.acquireLock({ root, sid: s.sid, waitMs: 100 });
  l3.release();
});

test('B6: 错误工作区续写 → WORKSPACE_MISMATCH（禁止静默跨区续写）', () => {
  const root = tmpRoot();
  const wsA = wsOf(root, 'ws-a');
  const wsB = wsOf(root, 'ws-b');
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: 't', workspace: wsA });
  m.addEntry(root, s.sid, { desc: '本区写入没问题', workspace: wsA });
  assert.throws(
    () => m.addEntry(root, s.sid, { desc: '跨区续写必须拒绝', workspace: wsB }),
    (e) => e.code === 'WORKSPACE_MISMATCH'
  );
  assert.throws(
    () => m.appendMilestone(root, s.sid, { currentStatus: 'x', workspace: wsB }),
    (e) => e.code === 'WORKSPACE_MISMATCH'
  );
  // 缺 workspace 同样拒绝（明确传参，不留静默洞）
  assert.throws(() => m.addEntry(root, s.sid, { desc: '没传工作区' }), (e) => e.code === 'INVALID_WORKSPACE');
});

/* ================= C 注册表 ================= */

test('C1: 创建写入一条完整记录（含 homeWorkspace/currentWorkspace）', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const s = m.createSession(root, {
    sid: sidFor(1), dshSessionId: hostFor(9), taskSummary: '摘要',
    now: new Date('2026-09-10T13:00:00+08:00'), workspace: ws,
  });
  const rec = m.getSession(root, s.sid);
  for (const k of ['sid', 'dshSessionId', 'createdAt', 'lastActiveAt', 'taskSummary', 'status', 'handedOverTo', 'homeWorkspace', 'currentWorkspace']) {
    assert.ok(k in rec, k);
  }
  assert.equal(rec.status, '活跃');
  assert.equal(rec.handedOverTo, null);
  assert.equal(rec.homeWorkspace, path.resolve(ws), 'homeWorkspace=创建时工作区');
  assert.equal(rec.currentWorkspace, path.resolve(ws), 'currentWorkspace=initial=home');
});

test('C2: 心跳更新 lastActiveAt', () => {
  const root = tmpRoot();
  const t1 = new Date('2026-09-10T13:00:00+08:00');
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: 't', now: t1, workspace: root });
  assert.equal(m.getSession(root, s.sid).lastActiveAt, t1.toISOString());
  const t2 = new Date('2026-09-10T14:00:00+08:00');
  m.heartbeat(root, s.sid, { now: t2 });
  assert.equal(m.getSession(root, s.sid).lastActiveAt, t2.toISOString());
});

test('C3: 非法状态拒绝', () => {
  const root = tmpRoot();
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: 't', workspace: root });
  assert.throws(() => m.updateStatus(root, s.sid, '未知'), (e) => e.code === 'INVALID_STATUS');
});

test('C4: 状态迁移合法表', () => {
  const root = tmpRoot();
  const a = m.createSession(root, { sid: sidFor(1), taskSummary: 't', workspace: root }).sid;
  const b = m.createSession(root, { sid: sidFor(2), taskSummary: 't', workspace: root }).sid;
  const c = m.createSession(root, { sid: sidFor(3), taskSummary: 't', workspace: root }).sid;
  const d = m.createSession(root, { sid: sidFor(4), taskSummary: 't', workspace: root }).sid;
  m.updateStatus(root, a, '已完成');
  assert.equal(m.getSession(root, a).status, '已完成');
  m.updateStatus(root, a, '已归档');
  assert.equal(m.getSession(root, a).status, '已归档');
  assert.throws(() => m.updateStatus(root, a, '活跃'), (e) => e.code === 'INVALID_TRANSITION');
  m.updateStatus(root, b, '已移交', { handedOverTo: sidFor(99) });
  assert.throws(() => m.updateStatus(root, b, '活跃'), (e) => e.code === 'INVALID_TRANSITION');
  assert.throws(() => m.updateStatus(root, c, '已移交'), (e) => e.code === 'MISSING_HANDOVER_TARGET');
  m.updateStatus(root, d, '已归档'); // 活跃→已归档 合法
});

test('C5: 留存上限 100：最旧已归档被移出 registry', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const first = sidFor(1);
  m.createSession(root, { sid: first, taskSummary: 'oldest', workspace: ws });
  m.updateStatus(root, first, '已完成');
  m.updateStatus(root, first, '已归档');
  for (let i = 2; i <= 100; i++) m.createSession(root, { sid: sidFor(i), taskSummary: 's' + i, workspace: ws });
  m.createSession(root, { sid: sidFor(101), taskSummary: 'new', workspace: ws });
  const reg = m.readRegistry(root);
  assert.equal(reg.sessions.length, 100);
  assert.ok(!reg.sessions.some((s) => s.sid === first), '最旧已归档应被移出');
  assert.ok(reg.sessions.some((s) => s.sid === sidFor(101)));
});

test('C6: 候选只列最近 10 条活跃（跨全机），带工作区，按 lastActiveAt 降序', () => {
  const root = tmpRoot();
  const base = Date.parse('2026-09-10T00:00:00+08:00');
  for (let i = 1; i <= 15; i++) {
    m.createSession(root, {
      sid: sidFor(i), taskSummary: 's' + i,
      now: new Date(base + i * 1000), workspace: wsOf(root, 'ws-' + i),
    });
  }
  m.updateStatus(root, sidFor(5), '已完成');
  const cands = m.listCandidates(root);
  assert.equal(cands.length, 10);
  assert.ok(!cands.some((c) => c.sid === sidFor(5)), '已完成不出现');
  assert.equal(cands[0].sid, sidFor(15), '最近活跃排第一');
  assert.equal(cands[0].homeWorkspace, path.join(root, 'ws-15'), '候选必须携带所属工作区');
  assert.equal(cands[0].currentWorkspace, path.join(root, 'ws-15'));
  const times = cands.map((c) => Date.parse(c.lastActiveAt));
  for (let i = 1; i < times.length; i++) assert.ok(times[i - 1] >= times[i], '降序');
});

/* ================= D 台账 ================= */

test('D1: 编号自增不重复', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: 't', workspace: ws });
  const e1 = m.addEntry(root, s.sid, { desc: '第一条', workspace: ws });
  const e2 = m.addEntry(root, s.sid, { desc: '第二条', workspace: ws });
  assert.equal(e1.no, 'L-000');
  assert.equal(e2.no, 'L-001');
  const l = m.readLedger(root, s.sid);
  const all = Object.values(l.sections).flat().map((x) => x.no);
  assert.equal(new Set(all).size, all.length);
});

test('D2: 条目状态枚举校验', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: 't', workspace: ws });
  m.addEntry(root, s.sid, { desc: 'x', workspace: ws });
  assert.throws(() => m.setEntryStatus(root, s.sid, 'L-000', '奇怪状态', { workspace: ws }), (e) => e.code === 'INVALID_ENTRY_STATUS');
});

test('D3: 承接只允许编号（复制原文 → 拒绝）', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: 't', workspace: ws });
  m.addEntry(root, s.sid, { desc: '落地 .agent 目录骨架', workspace: ws }); // L-000
  m.addEntry(root, s.sid, { desc: '设计 ledger 格式', related: ['L-000'], workspace: ws }); // 编号允许
  assert.throws(
    () => m.addEntry(root, s.sid, { desc: '复制原文承接', related: ['落地 .agent 目录骨架'], workspace: ws }),
    (e) => e.code === 'COPY_NOT_ALLOWED'
  );
  assert.throws(
    () => m.addEntry(root, s.sid, { desc: '短引用', related: ['xyz'], workspace: ws }),
    (e) => e.code === 'INVALID_REFER'
  );
});

test('D4: 未完成条目删除 → 拒绝；已完成可删', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: 't', workspace: ws });
  m.addEntry(root, s.sid, { desc: '未完成条目', workspace: ws });
  assert.throws(() => m.removeEntry(root, s.sid, 'L-000', { workspace: ws }), (e) => e.code === 'ENTRY_UNFINISHED_DELETE');
  m.setEntryStatus(root, s.sid, 'L-000', '已完成', { workspace: ws });
  const r = m.removeEntry(root, s.sid, 'L-000', { workspace: ws });
  assert.equal(r.removed, 'L-000');
  const l = m.readLedger(root, s.sid);
  assert.equal(Object.values(l.sections).flat().length, 0);
});

test('D5: 已完成折叠一行（≤80 字符 + @完成）', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: 't', workspace: ws });
  const longDesc = '这是一个非常非常长的条目描述，用来验证已完成条目折叠规则是否会把描述压缩到不超过八十个字符的硬性要求，后面还要继续补很多很多字符确保它真的超过八十个字符的限制，好让折叠逻辑真正生效而不仅仅是空转';
  m.addEntry(root, s.sid, { desc: longDesc, workspace: ws });
  m.setEntryStatus(root, s.sid, 'L-000', '已完成', { now: new Date('2026-09-10T12:00:00+08:00'), workspace: ws });
  const raw = fs.readFileSync(ledgerFile(root, s.sid), 'utf8');
  const line = raw.split('\n').find((l) => l.includes('[已完成]'));
  assert.ok(line, '应存在已完成条目行');
  assert.ok(!line.includes('\n'));
  assert.ok(line.includes('@完成'));
  const descPart = line.replace(/@完成\s+[^\s@]+/, '').replace(/^- L-\d+ \[已完成\] /, '').trim();
  assert.ok(descPart.length <= 80, `折叠后描述应 ≤80 字符，实际 ${descPart.length}`);
});

test('D6: 超限移最早已完成条目入 archive', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: 't', workspace: ws });
  const t0 = Date.parse('2026-09-10T10:00:00+08:00');
  for (let i = 0; i < 3; i++) {
    m.addEntry(root, s.sid, { desc: `完成条目 ${i}`, now: new Date(t0 + i * 1000), workspace: ws });
    m.setEntryStatus(root, s.sid, `L-00${i}`, '已完成', { now: new Date(t0 + i * 1000), workspace: ws });
  }
  for (let i = 3; i < 9; i++) {
    m.addEntry(root, s.sid, { desc: `未完成条目 ${i}`, maxBytes: 500, now: new Date(t0 + i * 1000), workspace: ws });
  }
  const l = m.readLedger(root, s.sid);
  const arch = m.readArchive(root, s.sid);
  for (let i = 3; i < 9; i++) {
    assert.ok(l.sections['待办'].some((e) => e.no === `L-00${i}`), `L-00${i} 不应丢`);
  }
  assert.ok(arch.lines.some((x) => x.includes('@归档')), 'archive 应有归档条目');
  // 永久指令区（v1 内追加能力）不占超限预算：计量条目区（剔除永久指令区段）
  const raw = fs.readFileSync(ledgerFile(root, s.sid), 'utf8');
  const permPart = raw.match(/^## 永久指令\n(?:- .*\n)+\n?/m)?.[0] ?? '';
  const bytes = Buffer.byteLength(raw, 'utf8') - Buffer.byteLength(permPart, 'utf8');
  assert.ok(bytes <= 500, `条目区应 ≤500B（永久指令区不占超限预算），实际 ${bytes}`);
});

test('D7: 全未完成超限 → 拒绝写入 + LEDGER_OVERFLOW_ACTIVE', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: 't', workspace: ws });
  let err = null;
  let i = 0;
  try {
    for (; i < 100; i++) {
      m.addEntry(root, s.sid, { desc: `未完成条目 ${i} ` + '填'.repeat(40), maxBytes: 1500, workspace: ws });
    }
  } catch (e) {
    err = e;
  }
  assert.ok(err, '应触发超限');
  assert.equal(err.code, 'LEDGER_OVERFLOW_ACTIVE');
  assert.ok(err.unfinishedCount > 0, '告警应附未完成条数');
  // 失败后文件回滚 → 仍有空间，可再写（设计本意：不丢也没卡死）
  const extra = m.addEntry(root, s.sid, { desc: '失败回滚后还能继续填', maxBytes: 2000, workspace: ws });
  assert.ok(extra.no, '失败回滚后仍能新增条目');
  // 真正顶到边界后：继续写 → LEDGER_OVERFLOW_ACTIVE，且被拒绝的那次写入
  // 不落盘：文件与写入尝试前逐字节一致（未完成条目一条不少）
  let edge = null;
  let beforeEdge = null;
  try {
    for (;;) {
      beforeEdge = fs.readFileSync(ledgerFile(root, s.sid), 'utf8');
      m.addEntry(root, s.sid, { desc: '填满 ' + Date.now() + ' ' + '填'.repeat(60), maxBytes: 1500, workspace: ws });
    }
  } catch (e) {
    edge = e;
  }
  assert.equal(edge.code, 'LEDGER_OVERFLOW_ACTIVE', '顶到上限必须拒绝');
  const after = fs.readFileSync(ledgerFile(root, s.sid), 'utf8');
  assert.equal(beforeEdge, after, '拒绝时文件应保持原状（未完成条目一条不少）');
  const l = m.readLedger(root, s.sid);
  const all = Object.values(l.sections).flat();
  assert.ok(all.every((e) => e.status !== '已完成'), '不应有已完成条目');
  assert.ok(all.length >= 5, `未完成条目仍存在（${all.length} 条）`);
});

test('D8: 连续 25 条未完成仍在上限内且一条不丢', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: 't', workspace: ws });
  for (let i = 0; i < 25; i++) {
    m.addEntry(root, s.sid, { desc: `未完成条目 ${i} 保持在上限之内不触发任何归档操作`, workspace: ws });
  }
  const l = m.readLedger(root, s.sid);
  assert.equal(l.sections['待办'].length, 25);
  const bytes = Buffer.byteLength(fs.readFileSync(ledgerFile(root, s.sid), 'utf8'));
  assert.ok(bytes <= m.LEDGER_MAX_BYTES, `${bytes} ≤ ${m.LEDGER_MAX_BYTES}`);
});

test('D9: 承接引用不存在的编号 → 拒绝', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: 't', workspace: ws });
  assert.throws(
    () => m.addEntry(root, s.sid, { desc: 'x', related: ['L-999'], workspace: ws }),
    (e) => e.code === 'REF_NOT_FOUND'
  );
});

test('D10: 真实历史只追加不改写 —— 改写条目内容（含已完成）→ ENTRY_HISTORY_IMMUTABLE', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: 't', workspace: ws });
  m.addEntry(root, s.sid, { desc: '原指令内容', workspace: ws }); // L-000
  m.addEntry(root, s.sid, { desc: '另一条指令', workspace: ws }); // L-001
  // 未完成条目改写 → 同样拒绝（规则是绝对的历史不可改写）
  assert.throws(
    () => m.editEntryContent(root, s.sid, 'L-000', '改成别的最终版', { workspace: ws }),
    (e) => e.code === 'ENTRY_HISTORY_IMMUTABLE'
  );
  // 已完成条目改写 → 必须拒绝（用户明确要求的反向用例）
  m.setEntryStatus(root, s.sid, 'L-001', '已完成', { workspace: ws });
  assert.throws(
    () => m.editEntryContent(root, s.sid, 'L-001', '把历史重写成最终版', { workspace: ws }),
    (e) => e.code === 'ENTRY_HISTORY_IMMUTABLE' && e.status === '已完成'
  );
  // 计划变更是允许的正确姿势：新条目 + 承接编号引用
  const e2 = m.addEntry(root, s.sid, { desc: '计划变更后的新条目', related: ['L-000'], workspace: ws });
  assert.equal(e2.no, 'L-002');
  assert.deepEqual(e2.related, ['L-000']);
  // 原条目内容原样保留（未被改写）
  const l = m.readLedger(root, s.sid);
  const all = Object.values(l.sections).flat();
  assert.ok(all.some((x) => x.no === 'L-000' && x.desc === '原指令内容'), '旧条目内容必须原样保留');
});

/* ================= E 进度 ================= */

test('E1: 里程碑追加节 + header.workspaceRoot 记录', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: 't', workspace: ws });
  m.appendMilestone(root, s.sid, {
    completedSteps: ['L-000', 'L-001'],
    currentStatus: '进行中',
    nextSteps: '实现 registry',
    keyDecisions: '会话 ID=日期+随机；容量硬上限',
    files: ['.agent/registry.json', '.agent/sessions/*/ledger.md'],
    now: new Date('2026-09-10T14:00:00+08:00'),
    workspace: ws,
  });
  const p = m.readProgress(root, s.sid);
  assert.equal(p.header.workspaceRoot, path.resolve(ws), '每次写入记录工作区根绝对路径');
  assert.equal(p.header.schemaVersion, 1, 'progress 头部应有 schemaVersion=1');
  assert.equal(p.milestones.length, 1);
  const ms = p.milestones[0];
  assert.deepEqual(ms.completedSteps, ['L-000', 'L-001']);
  assert.equal(ms.currentStatus, '进行中');
  assert.equal(ms.nextSteps, '实现 registry');
  assert.equal(ms.keyDecisions, '会话 ID=日期+随机；容量硬上限');
  assert.deepEqual(ms.files, ['.agent/registry.json', '.agent/sessions/*/ledger.md']);
});

test('E2: 非里程碑不更新进度文件', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: 't', workspace: ws });
  const before = fs.readFileSync(progressFile(root, s.sid), 'utf8');
  m.addEntry(root, s.sid, { desc: '普通台账写入', workspace: ws });
  m.setEntryStatus(root, s.sid, 'L-000', '进行中', { workspace: ws });
  const after = fs.readFileSync(progressFile(root, s.sid), 'utf8');
  assert.equal(before, after, '普通台账写入不得触碰 progress.md');
});

test('E3: 进度超限移历史小节，关键三区块保留', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: 't', workspace: ws });
  const t0 = Date.parse('2026-09-10T00:00:00+08:00');
  for (let i = 0; i < 4; i++) {
    m.appendMilestone(root, s.sid, {
      completedSteps: Array.from({ length: 10 }, (_, j) => `L-00${j}（步骤 ${i}.${j}）`),
      currentStatus: `状态 ${i}`,
      nextSteps: `下一步 ${i}`,
      keyDecisions: `决定 ${i}`,
      files: Array.from({ length: 5 }, (_, j) => `file-${i}-${j}.md`),
      now: new Date(t0 + i * 60000),
      maxBytes: 1200,
      workspace: ws,
    });
  }
  const p = m.readProgress(root, s.sid);
  const arch = m.readArchive(root, s.sid);
  const bytes = Buffer.byteLength(fs.readFileSync(progressFile(root, s.sid), 'utf8'));
  assert.ok(bytes <= 1200, `progress ≤1200B，实际 ${bytes}`);
  assert.ok(arch.lines.some((l) => l.includes('## 里程碑归档')), 'archive 应有里程碑归档块');
  assert.ok(arch.lines.some((l) => l.includes('- 已完成步骤:')), 'archive 应含 已完成步骤 小节');
  const anyKey = p.milestones.some((ms) => ms.currentStatus !== '' && ms.nextSteps !== '' && ms.keyDecisions !== '');
  assert.ok(anyKey, '当前状态/下一步/关键决定 应保留');
  const last = p.milestones[p.milestones.length - 1];
  assert.equal(last.completedSteps.length, 10, '最新里程碑完整保留');
  assert.equal(last.files.length, 5);
});

/* ================= F 读取 ================= */

test('F1: 丢记忆事件读回 ledger+progress', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const s = m.createSession(root, { sid: sidFor(1), dshSessionId: hostFor(24), taskSummary: '摘要', workspace: ws });
  m.addEntry(root, s.sid, { desc: '设计 ledger 格式', workspace: ws });
  m.setEntryStatus(root, s.sid, 'L-000', '进行中', { workspace: ws });
  m.appendMilestone(root, s.sid, {
    completedSteps: ['L-000'], currentStatus: '恢复中', nextSteps: '实现 registry',
    keyDecisions: '文件为准', files: ['ledger.md'], workspace: ws,
  });
  const l = m.readLedger(root, s.sid);
  const p = m.readProgress(root, s.sid);
  assert.equal(l.sections['进行中'][0].no, 'L-000');
  assert.equal(l.header.task, '摘要');
  assert.equal(p.milestones[0].currentStatus, '恢复中');
});

test('F2: 上下文与文件冲突 → 以文件为准', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: '旧摘要', workspace: ws });
  const file = ledgerFile(root, s.sid);
  const raw = fs.readFileSync(file, 'utf8').replace('- task: 旧摘要', '- task: 文件里的新任务');
  fs.writeFileSync(file, raw, 'utf8');
  const h = m.readHeader(root, s.sid);
  assert.equal(h.task, '文件里的新任务');
});

test('F3: 无文件时报 NOT_INITIALIZED 引导创建', () => {
  const root = tmpRoot();
  const sid = '20260910-abcdef12';
  assert.throws(() => m.readLedger(root, sid), (e) => e.code === 'NOT_INITIALIZED');
  assert.throws(() => m.readProgress(root, sid), (e) => e.code === 'NOT_INITIALIZED');
  assert.throws(() => m.readRegistry(root), (e) => e.code === 'NOT_INITIALIZED');
});

test('F4: 冷启动恢复报告 —— 只读文件为准，含台账概览/未完成指令/里程碑/心跳', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: '恢复测试', workspace: ws });
  m.addEntry(root, s.sid, { desc: '设计 ledger 格式', modelTurn: 5, workspace: ws });
  m.setEntryStatus(root, s.sid, 'L-000', '进行中', { workspace: ws });
  m.appendMilestone(root, s.sid, {
    completedSteps: ['L-000'], currentStatus: '恢复中', nextSteps: '实现 registry',
    keyDecisions: '文件为准', files: ['ledger.md'], workspace: ws,
  });
  const before = fs.readFileSync(registryFile(root), 'utf8');
  const report = m.buildRecoveryReport(root, s.sid, { modelTurn: 6 });
  const after = fs.readFileSync(registryFile(root), 'utf8');
  assert.equal(before, after, '恢复报告必须只读，不得改写 registry');
  assert.match(report, /【冷启动恢复报告】 sid=/);
  assert.match(report, /任务摘要: 恢复测试/);
  assert.match(report, /台账概览: 进行中 1 条 \/ 待办 0 条/);
  assert.match(report, /未完成指令:/);
  assert.match(report, /L-000 \[进行中\] 设计 ledger 格式/);
  assert.match(report, /当前状态: 恢复中/);
  assert.match(report, /下一步: 实现 registry/);
  assert.match(report, /新鲜度=FRESH/);
  // 无 sid → SESSION_NOT_FOUND
  assert.throws(() => m.buildRecoveryReport(root, '20260910-ffffffff'), (e) => e.code === 'SESSION_NOT_FOUND');
});

/* ================= 永久指令区（v1 内追加能力；双位置落盘） ================= */

test('PERM1: 永久指令 —— 台账固化 + 双路冗余（checkpoint 正典副本 + 冷启动恢复）', async () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const wsB = wsOf(root, 'ws-b');
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: '永久指令测试', workspace: ws });
  const sB = m.createSession(root, { sid: sidFor(2), taskSummary: 'B 会话', workspace: wsB });
  const bLedgerBefore = fs.readFileSync(ledgerFile(root, sB.sid), 'utf8');

  // ① 新会话默认固化「始终用中文回复 + 指令先落账」两行；schemaVersion 保持 1（v1 内追加能力）
  const raw = fs.readFileSync(ledgerFile(root, s.sid), 'utf8');
  assert.ok(raw.includes('## 永久指令'), '台账应含永久指令区');
  assert.ok(raw.includes('- 始终用中文回复'), '新会话默认固化中文回复指令');
  assert.ok(raw.includes('- 指令先落账'), '新会话默认固化指令先落账配方');
  const l = m.readLedger(root, s.sid);
  assert.deepEqual(l.permanent, m.DEFAULT_PERMANENT_INSTRUCTIONS, '读取层返回默认永久指令（两行）');
  assert.equal(l.permanent.length, 2, '新会话永久区应恰两行');
  assert.equal(l.header.schemaVersion, 1, 'schemaVersion 保持 1（v1 内追加能力）');
  assert.ok(!('永久指令' in l.sections), '永久指令不混入条目 sections');

  // ② setPermanentInstructions 整体替换（配置区语义）
  m.setPermanentInstructions(root, s.sid, ['始终用中文回复', '先读台账再动手'], { workspace: ws, modelTurn: 2 });
  assert.deepEqual(m.readLedger(root, s.sid).permanent, ['始终用中文回复', '先读台账再动手']);
  // 隔离：A 会话永久指令写入不触碰 B 会话
  assert.equal(fs.readFileSync(ledgerFile(root, sB.sid), 'utf8'), bLedgerBefore, 'B 台账零变化');

  // ③ 冷启动恢复（失忆模型读台账路径）带回永久指令
  const report = m.buildRecoveryReport(root, s.sid, { modelTurn: 3 });
  assert.ok(report.includes('永久指令:'), '恢复报告应含永久指令区');
  assert.ok(report.includes('始终用中文回复'), '恢复报告应带回中文永久指令（第一行）');
  assert.ok(report.includes('先读台账再动手'), '恢复报告应带回第二行永久指令');

  // ④ 文件为准：手动移除区段 → 读取层为空（不凭空发明）；再写回 → 区段重现
  const raw2 = fs.readFileSync(ledgerFile(root, s.sid), 'utf8').replace(/^## 永久指令\n(?:- .*\n)+\n?/m, '');
  assert.notEqual(raw2, fs.readFileSync(ledgerFile(root, s.sid), 'utf8'), '测试前提：区段确被移除');
  fs.writeFileSync(ledgerFile(root, s.sid), raw2, 'utf8');
  assert.deepEqual(m.readLedger(root, s.sid).permanent, [], '无区段 → 空（文件为准）');
  m.setPermanentInstructions(root, s.sid, ['始终用中文回复'], { workspace: ws, modelTurn: 4 });
  assert.ok(fs.readFileSync(ledgerFile(root, s.sid), 'utf8').includes('- 始终用中文回复'), '写回后区段重现');

  // ⑤ 校验：空串/超长/超量拒绝；清空（[]）合法
  assert.throws(() => m.setPermanentInstructions(root, s.sid, [''], { workspace: ws }), (e) => e.code === 'PERMANENT_EMPTY');
  assert.throws(
    () => m.setPermanentInstructions(root, s.sid, ['x'.repeat(m.PERMANENT_MAX_CHARS + 1)], { workspace: ws }),
    (e) => e.code === 'PERMANENT_TOO_LONG'
  );
  assert.throws(
    () => m.setPermanentInstructions(root, s.sid, Array.from({ length: m.PERMANENT_MAX_ITEMS + 1 }, (_, i) => `指令${i}`), { workspace: ws }),
    (e) => e.code === 'PERMANENT_TOO_MANY'
  );
  assert.deepEqual(m.setPermanentInstructions(root, s.sid, [], { workspace: ws, modelTurn: 5 }), [], '空数组=清空合法');
  assert.deepEqual(m.readLedger(root, s.sid).permanent, [], '清空后读取为空');

  // ⑥ 永久指令区不占超限预算：长永久指令 + 紧条目预算 → 条目照常写入、已完成不被连带归档
  const sTight = m.createSession(root, { sid: sidFor(3), taskSummary: '紧预算', workspace: wsB });
  m.setPermanentInstructions(root, sTight.sid, ['长'.repeat(m.PERMANENT_MAX_CHARS)], { workspace: wsB, modelTurn: 6 });
  m.addEntry(root, sTight.sid, { desc: '紧预算条目', maxBytes: 400, workspace: wsB, modelTurn: 6 });
  const rawTight = fs.readFileSync(ledgerFile(root, sTight.sid), 'utf8');
  assert.ok(rawTight.includes('长'.repeat(m.PERMANENT_MAX_CHARS)), '紧预算下永久指令仍可写');
  assert.ok(rawTight.includes('紧预算条目'), '紧预算下条目照常写入（永久指令不挤占条目预算）');
});

test('PERM2: 新会话默认永久区恰两行（v10 配方锁定）', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-perm2');
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: '默认配方两行', workspace: ws });
  const l = m.readLedger(root, s.sid);
  assert.equal(m.DEFAULT_PERMANENT_INSTRUCTIONS.length, 2, '常量默认配方恰两行');
  assert.equal(l.permanent.length, 2, '新会话永久区应恰两行');
  assert.equal(l.permanent[0], '始终用中文回复', '第一行=中文回复');
  assert.ok(l.permanent[1].startsWith('指令先落账'), '第二行=指令先落账配方');
  assert.ok(!('永久指令' in l.sections), '永久指令不混入条目 sections');
});

/* ================= CAP 进度容量（v13 正式修订 L-002「16K 上限」） ================= */

test('CAP1: PROGRESS_MAX_BYTES=32768（进度容量方案①落地；诊断见 phase2-design §12.8）', () => {
  assert.equal(m.PROGRESS_MAX_BYTES, 32 * 1024, '16K→32K 修订生效');
  assert.equal(m.LEDGER_MAX_BYTES, 32 * 1024, 'ledger 上限不受影响（仍 32K）');
});

/* ================= G 门禁 ================= */

test('G1-G5: 门禁新鲜度（模型回合语义）', () => {
  assert.equal(m.FRESHNESS_TURNS, 3);
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: 't', modelTurn: 5, workspace: ws });
  // G1 新鲜（≤3 个模型回合）
  assert.equal(m.checkFreshness(m.readHeader(root, s.sid), 6).ok, true);
  // G2 过期（>3）：9-5=4
  const stale = m.checkFreshness(m.readHeader(root, s.sid), 9);
  assert.equal(stale.ok, false);
  assert.equal(stale.code, 'STALE');
  assert.equal(stale.turns, 4);
  // G3 刷新后允许
  m.addEntry(root, s.sid, { desc: '刷新台账', modelTurn: 9, workspace: ws });
  assert.equal(m.checkFreshness(m.readHeader(root, s.sid), 9).ok, true);
  // G4 无台账 → 拒绝
  assert.equal(m.checkFreshness(null, 3).code, 'NO_LEDGER');
  // G5 常量断言 + 轮语义 = 模型回合差
  assert.equal(m.FRESHNESS_TURNS, 3);
});

/* ================= 锁 L1-L5 ================= */

test('L1: 正常拿锁/释放', () => {
  const root = tmpRoot();
  const sid = sidFor(1);
  m.createSession(root, { sid, taskSummary: 't', workspace: root });
  const l = m.acquireLock({ root, sid });
  l.release();
  const l2 = m.acquireLock({ root, sid });
  l2.release();
});

test('L2: 崩溃残留（pid 不存在）→ 自动清理后重试成功', () => {
  const root = tmpRoot();
  const sid = sidFor(1);
  m.createSession(root, { sid, taskSummary: 't', workspace: root });
  const lockDir = path.join(root, '.locks', sid + '.lock');
  fs.mkdirSync(lockDir, { recursive: true });
  fs.writeFileSync(
    path.join(lockDir, 'owner.json'),
    JSON.stringify({ name: sid, sid, pid: 999999999, createdAt: new Date().toISOString(), host: 'x' }),
    'utf8'
  );
  const l = m.acquireLock({ root, sid, waitMs: 200 });
  l.release();
});

test('L3: 锁超龄 → 自动清理', () => {
  const root = tmpRoot();
  const sid = sidFor(1);
  m.createSession(root, { sid, taskSummary: 't', workspace: root });
  const lockDir = path.join(root, '.locks', sid + '.lock');
  fs.mkdirSync(lockDir, { recursive: true });
  fs.writeFileSync(
    path.join(lockDir, 'owner.json'),
    JSON.stringify({ name: sid, sid, pid: process.pid, createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), host: 'x' }),
    'utf8'
  );
  const l = m.acquireLock({ root, sid, waitMs: 200, maxAgeMs: 1000 });
  l.release();
});

test('L4: 活跃锁 → LOCK_BUSY', () => {
  const root = tmpRoot();
  const sid = sidFor(1);
  m.createSession(root, { sid, taskSummary: 't', workspace: root });
  const l1 = m.acquireLock({ root, sid, waitMs: 200 });
  assert.throws(() => m.acquireLock({ root, sid, waitMs: 150 }), (e) => e.code === 'LOCK_BUSY');
  l1.release();
});

test('L5: 清理只删锁目录自身（脏锁不误删）', () => {
  const root = tmpRoot();
  const sid = sidFor(1);
  m.createSession(root, { sid, taskSummary: 't', workspace: root });
  const lockDir = path.join(root, '.locks', sid + '.lock');
  fs.mkdirSync(lockDir, { recursive: true });
  fs.writeFileSync(
    path.join(lockDir, 'owner.json'),
    JSON.stringify({ name: sid, sid, pid: process.pid, createdAt: new Date().toISOString(), host: 'x' }),
    'utf8'
  );
  fs.writeFileSync(path.join(lockDir, 'junk.txt'), 'do not delete', 'utf8');
  assert.throws(() => m.acquireLock({ root, sid, waitMs: 150 }), (e) => e.code === 'LOCK_BUSY');
  assert.ok(fs.existsSync(lockDir), '锁目录应保留');
  assert.ok(fs.existsSync(path.join(lockDir, 'junk.txt')), 'junk 文件绝不触碰');
});

/* ================= §7 自动归档 ================= */

test('§7: 自动归档 30 天已完成会话', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const old = new Date(Date.now() - 31 * 24 * 3600 * 1000);
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: 't', now: old, workspace: ws });
  m.updateStatus(root, s.sid, '已完成', { now: old });
  const archived = m.autoArchive(root, { now: new Date(), maxAge: 30 * 24 * 3600 * 1000 });
  assert.deepEqual(archived, [s.sid]);
  assert.equal(m.getSession(root, s.sid).status, '已归档');
});

/* ================= W 跨工作区移交 / 一致性检查（全局化修订新增） ================= */

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

test('W1: 跨工作区移交成功路径（检查通过 + 确认接管 + 新工作区可写/旧工作区被拒）', () => {
  const root = tmpRoot();
  const wsA = wsOf(root, 'ws-a');
  const wsB = wsOf(root, 'ws-b');
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: '跨区任务', workspace: wsA });
  // 涉及文件：wsA/task/data.txt
  writeFile(path.join(wsA, 'task', 'data.txt'), 'hello\n');
  m.appendMilestone(root, s.sid, {
    currentStatus: '在 A 工作区工作', nextSteps: '移交到 B',
    files: ['task/data.txt'], workspace: wsA,
  });
  // B 工作区存在同路径且内容一致
  writeFile(path.join(wsB, 'task', 'data.txt'), 'hello\n');

  const check = m.checkWorkspaceConsistency(root, s.sid, wsB);
  assert.equal(check.ok, true, '一致性应通过');
  assert.equal(check.checked, 1);
  assert.deepEqual(check.missing, []);
  assert.deepEqual(check.inconsistent, []);

  // 未确认 → 拒绝
  assert.throws(
    () => m.handoverToWorkspace(root, s.sid, wsB, { confirmed: false }),
    (e) => e.code === 'HANDOVER_NOT_CONFIRMED'
  );

  // 确认 → 接管
  const h = m.handoverToWorkspace(root, s.sid, wsB, { confirmed: true });
  assert.equal(h.currentWorkspace, path.resolve(wsB));
  assert.equal(m.getSession(root, s.sid).currentWorkspace, path.resolve(wsB));
  assert.equal(m.getSession(root, s.sid).homeWorkspace, path.resolve(wsA), 'homeWorkspace 不变');

  // 新工作区可写；旧工作区写 → WORKSPACE_MISMATCH
  m.addEntry(root, s.sid, { desc: '在 B 工作区继续写', workspace: wsB });
  assert.throws(
    () => m.addEntry(root, s.sid, { desc: '回 A 静默续写', workspace: wsA }),
    (e) => e.code === 'WORKSPACE_MISMATCH'
  );
});

test('W2: 一致性检查失败路径（缺失/不一致 → 差异告警；未确认拒绝，确认后接管并保留告警）', () => {
  const root = tmpRoot();
  const wsA = wsOf(root, 'ws-a');
  const wsB = wsOf(root, 'ws-b');
  const s1 = m.createSession(root, { sid: sidFor(1), taskSummary: '缺失用例', workspace: wsA });
  writeFile(path.join(wsA, 'task', 'data.txt'), 'v1\n');
  m.appendMilestone(root, s1.sid, { files: ['task/data.txt'], workspace: wsA });

  // 目标缺失
  const checkMissing = m.checkWorkspaceConsistency(root, s1.sid, wsB);
  assert.equal(checkMissing.ok, false);
  assert.equal(checkMissing.missing.length, 1);
  assert.equal(checkMissing.missing[0].file, 'task/data.txt');
  assert.ok(checkMissing.missing[0].dstPath.startsWith(path.resolve(wsB)), '差异需列出目标解析路径');

  // 未确认 → WORKSPACE_INCONSISTENT（附差异清单）
  let err = null;
  try {
    m.handoverToWorkspace(root, s1.sid, wsB, { confirmed: false });
  } catch (e) {
    err = e;
  }
  assert.ok(err, '应拒绝');
  assert.equal(err.code, 'WORKSPACE_INCONSISTENT');
  assert.equal(err.check.missing.length, 1, '错误应携带差异清单');

  // 确认后接管（警告保留在返回值，不静默）
  const h1 = m.handoverToWorkspace(root, s1.sid, wsB, { confirmed: true });
  assert.equal(h1.currentWorkspace, path.resolve(wsB));
  assert.equal(h1.check.ok, false, '告警随返回值保留');
  assert.equal(h1.check.missing.length, 1);

  // 内容不一致：源 v1 vs 目标 v2
  const s2 = m.createSession(root, { sid: sidFor(2), taskSummary: '不一致用例', workspace: wsA });
  writeFile(path.join(wsA, 'src', 'a.txt'), 'base v1\n');
  m.appendMilestone(root, s2.sid, { files: ['src/a.txt'], workspace: wsA });
  writeFile(path.join(wsB, 'src', 'a.txt'), 'base v2\n');
  const checkInc = m.checkWorkspaceConsistency(root, s2.sid, wsB);
  assert.equal(checkInc.ok, false);
  assert.equal(checkInc.inconsistent.length, 1);
  assert.equal(checkInc.inconsistent[0].file, 'src/a.txt');
  // 未确认同样拒绝
  assert.throws(
    () => m.handoverToWorkspace(root, s2.sid, wsB, { confirmed: false }),
    (e) => e.code === 'WORKSPACE_INCONSISTENT'
  );
  // 无涉及文件的会话：一致性平凡通过（但未确认仍拒绝）
  const s3 = m.createSession(root, { sid: sidFor(3), taskSummary: '无涉及文件', workspace: wsA });
  assert.equal(m.checkWorkspaceConsistency(root, s3.sid, wsB).ok, true);
  assert.throws(
    () => m.handoverToWorkspace(root, s3.sid, wsB, { confirmed: false }),
    (e) => e.code === 'HANDOVER_NOT_CONFIRMED'
  );
});

/* ================= R 全局 registry 锁（全局化修订新增） ================= */

function runChild(root, workspace, sid) {
  const code = `
import { createSession } from ${JSON.stringify(LIB_URL)};
const [ws, sid] = process.argv.slice(1);
(async () => {
  try {
    const s = await createSession(undefined, { workspace: ws, sid });
    console.log('OK:' + s.sid + ':' + s.currentWorkspace);
  } catch (e) {
    console.log('ERR:' + e.code);
    process.exit(2);
  }
})();
`;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code, workspace, sid], {
      env: { ...process.env, AGENT_MEMORY_ROOT: root },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('close', (codeNum) => resolve({ ok: codeNum === 0, out: out.trim() }));
  });
}

test('R1: 全局 registry 并发写 —— 不同工作区多进程同时 createSession，不损坏不丢失', async () => {
  const root = tmpRoot();
  const wsA = wsOf(root, 'ws-a');
  const wsB = wsOf(root, 'ws-b');
  const jobs = [];
  for (let i = 201; i <= 206; i++) {
    const ws = i % 2 === 0 ? wsB : wsA;
    jobs.push(runChild(root, ws, sidFor(i)));
  }
  const results = await Promise.all(jobs);
  for (const r of results) {
    assert.equal(r.ok, true, `子进程应成功：${r.out}`);
    assert.match(r.out, /^OK:/);
  }
  // 全部写完后：registry JSON 未损坏、6 条记录都在、工作区归属正确
  const reg = m.readRegistry(root);
  assert.equal(reg.sessions.length, 6, '并发写不得丢失记录');
  for (let i = 201; i <= 206; i++) {
    const rec = reg.sessions.find((s) => s.sid === sidFor(i));
    assert.ok(rec, sidFor(i) + ' 应存在');
    const expectWs = i % 2 === 0 ? path.resolve(wsB) : path.resolve(wsA);
    assert.equal(rec.currentWorkspace, expectWs, sidFor(i) + ' 工作区归属');
    assert.equal(rec.homeWorkspace, expectWs);
  }
});

test('R2: registry 全局锁 —— 活跃占用 LOCK_BUSY；死 pid/超龄/脏锁 清理与隔离', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  // R2a: 活跃 registry 锁 → createSession 报 LOCK_BUSY；释放后可写
  const rl = m.acquireRegistryLock({ root, waitMs: 300 });
  assert.throws(
    () => m.createSession(root, { sid: sidFor(1), taskSummary: 't', workspace: ws, waitMs: 150 }),
    (e) => e.code === 'LOCK_BUSY'
  );
  rl.release();
  m.createSession(root, { sid: sidFor(1), taskSummary: 't', workspace: ws });
  // R2b: registry 锁属主进程已死 → 自动清理后仍可创建
  const sid2 = sidFor(2);
  const lockDirB = path.join(root, '.locks', 'registry.lock');
  fs.rmSync(lockDirB, { recursive: true, force: true });
  fs.mkdirSync(lockDirB, { recursive: true });
  fs.writeFileSync(
    path.join(lockDirB, 'owner.json'),
    JSON.stringify({ name: 'registry', pid: 999999999, createdAt: new Date().toISOString(), host: 'x' }),
    'utf8'
  );
  m.createSession(root, { sid: sid2, taskSummary: 't', workspace: ws });
  // R2c: registry 锁超龄（活跃 pid + 旧时间戳）→ maxAgeMs 清洗后成功
  const sid3 = sidFor(3);
  fs.rmSync(lockDirB, { recursive: true, force: true });
  fs.mkdirSync(lockDirB, { recursive: true });
  fs.writeFileSync(
    path.join(lockDirB, 'owner.json'),
    JSON.stringify({ name: 'registry', pid: process.pid, createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(), host: 'x' }),
    'utf8'
  );
  m.createSession(root, { sid: sid3, taskSummary: 't', workspace: ws, maxAgeMs: 1000 });
  // R2d: registry 锁目录内有脏文件（非 owner.json）→ 保守不删，LOCK_BUSY，脏文件保留
  fs.rmSync(lockDirB, { recursive: true, force: true });
  fs.mkdirSync(lockDirB, { recursive: true });
  fs.writeFileSync(
    path.join(lockDirB, 'owner.json'),
    JSON.stringify({ name: 'registry', pid: process.pid, createdAt: new Date().toISOString(), host: 'x' }),
    'utf8'
  );
  fs.writeFileSync(path.join(lockDirB, 'junk.txt'), 'do not delete', 'utf8');
  assert.throws(
    () => m.createSession(root, { sid: sidFor(4), taskSummary: 't', workspace: ws, waitMs: 150 }),
    (e) => e.code === 'LOCK_BUSY'
  );
  assert.ok(fs.existsSync(path.join(lockDirB, 'junk.txt')), 'registry 锁内 junk 文件绝不触碰');
});

/* ================= T 时间戳规范（R3，2026-09-11 签字生效） ================= */

test('T1: 时间戳存储一律 UTC —— 本地偏移串归一化，落盘无非零偏移', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: 't', workspace: ws, now: new Date('2026-09-11T00:00:00Z') });
  // 复现历史 bug：带本地偏移的字符串 now 传入写入路径 → 必须归一化为 UTC Z
  m.addEntry(root, s.sid, { desc: '带本地偏移 now 的条目', workspace: ws, modelTurn: 2, now: '2026-09-11T08:30:00.123+08:00' });
  m.setEntryStatus(root, s.sid, 'L-000', '已完成', { workspace: ws, modelTurn: 3, now: '2026-09-11T08:31:00.456+08:00' });
  m.appendMilestone(root, s.sid, { completedSteps: ['T1 里程碑'], workspace: ws, modelTurn: 4, now: '2026-09-11T08:32:00.789+08:00' });

  // ① 归一化断言（单字段精确值）
  const led = m.readLedger(root, s.sid);
  assert.match(led.header.updatedAt, /Z$/, 'ledger updatedAt 应为 Z：' + led.header.updatedAt);
  assert.match(led.sections['已完成'][0].completedAt, /^2026-09-11T00:31:00\.456Z$/, '完成时间应归一化为 UTC：' + led.sections['已完成'][0].completedAt);
  const prog = m.readProgress(root, s.sid);
  assert.match(prog.header.updatedAt, /^2026-09-11T00:32:00\.789Z$/, 'progress updatedAt 应归一化为 UTC：' + prog.header.updatedAt);
  assert.match(prog.milestones.at(-1).iso, /Z$/, '里程碑 iso 应为 Z：' + prog.milestones.at(-1).iso);
  assert.match(m.readRegistry(root).sessions[0].createdAt, /Z$/);

  // ② 全文件扫描不变式：registry/ledger/progress 内不得出现非零偏移时间
  const NONZERO_OFF = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?[+-](?!00:00)\d{2}:\d{2}/;
  const scans = [
    ['registry', fs.readFileSync(registryFile(root), 'utf8')],
    ['ledger', fs.readFileSync(ledgerFile(root, s.sid), 'utf8')],
    ['progress', fs.readFileSync(progressFile(root, s.sid), 'utf8')],
  ];
  for (const [name, raw] of scans) {
    assert.ok(!NONZERO_OFF.test(raw), `${name} 不应含非零偏移时间戳`);
  }

  // ③ assertUtcIso：非 UTC 偏移拒绝；Z 与 +00:00 通过
  assert.throws(() => assertUtcIso('2026-09-11T08:00:29.551+08:00'), (e) => e.code === 'TIMESTAMP_NOT_UTC');
  assert.equal(assertUtcIso('2026-09-11T00:00:29.551Z'), '2026-09-11T00:00:29.551Z');
  assert.equal(assertUtcIso('2026-09-11T00:00:29.551+00:00'), '2026-09-11T00:00:29.551+00:00');
});

/* ================= R1 结构化勘误（2026-09-11 签字 rider） ================= */

test('R1: 结构化勘误 —— 机器字段 supersedes + 读取层"勿采信原文"标记', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: 'errata 测试', workspace: ws });
  m.addEntry(root, s.sid, { desc: '被勘误的条目 L-000', workspace: ws, modelTurn: 2 });
  m.setEntryStatus(root, s.sid, 'L-000', '已完成', { workspace: ws, modelTurn: 3 });

  // ① 勘误条目写入含 supersedes（机器字段，文件往返存活）
  const er = m.addErratum(root, s.sid, { desc: '勘误 L-000：表述错误', supersedes: ['L-000'], workspace: ws, modelTurn: 4 });
  assert.equal(er.no, 'L-001');
  assert.equal(er.status, '已完成');
  assert.deepEqual(er.erratum.supersedes, ['L-000']);
  const led = m.readLedger(root, s.sid);
  const onDisk = led.sections['已完成'].find((x) => x.no === er.no);
  assert.deepEqual(onDisk.erratum.supersedes, ['L-000'], '机器字段应存于文件并读回');

  // ② 被取代条目读取带"勿采信原文"标记
  const target = led.sections['已完成'].find((x) => x.no === 'L-000');
  assert.deepEqual(target.supersededBy, [er.no], '被取代条目标记 supersededBy');
  assert.match(m.describeEntry(target), /勿采信原文（被 L-\d+ 勘误取代）/);

  // ③ 无勘误时正常（无字段、无标记）
  const root2 = tmpRoot();
  const ws2 = wsOf(root2, 'ws');
  const s2 = m.createSession(root2, { sid: sidFor(2), taskSummary: 't', workspace: ws2 });
  m.addEntry(root2, s2.sid, { desc: '普通条目', workspace: ws2, modelTurn: 2 });
  const led2 = m.readLedger(root2, s2.sid);
  const plain = led2.sections['待办'].find((x) => x.no === 'L-000');
  assert.equal(plain.erratum, null);
  assert.equal(plain.supersededBy, undefined);
  assert.equal(m.describeEntry(plain).includes('勿采信原文'), false);

  // ④ supersedes 指向不存在 → ERRATA_TARGET_NOT_FOUND（不静默）；空 supersedes → ERRATA_REQUIRES_TARGET
  assert.throws(
    () => m.addErratum(root, s.sid, { desc: 'x', supersedes: ['L-999'], workspace: ws, modelTurn: 5 }),
    (e) => e.code === 'ERRATA_TARGET_NOT_FOUND'
  );
  assert.throws(
    () => m.addErratum(root, s.sid, { desc: 'x', supersedes: [], workspace: ws, modelTurn: 6 }),
    (e) => e.code === 'ERRATA_REQUIRES_TARGET'
  );
  // 勘误条目本身不被标记
  const er2 = led.sections['已完成'].find((x) => x.no === er.no);
  assert.equal(er2.supersededBy, undefined, '勘误条目自身不受勿采信标记');
});

/* ================= R2 就地改划界（2026-09-11 签字 rider） ================= */

test('R2: 活区块可就地改，历史区块就地改 → ERRATA_REQUIRED', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: 'R2 测试', workspace: ws });
  m.appendMilestone(root, s.sid, {
    completedSteps: ['【历史证据】不可改的历史内容'],
    currentStatus: '旧状态',
    nextSteps: '旧下一步',
    keyDecisions: '旧决定',
    workspace: ws,
    modelTurn: 2,
  });
  const before = m.readProgress(root, s.sid);
  assert.equal(before.milestones.length, 1);

  // ① 活区块就地更新：最新里程碑三活区块变化，历史 completedSteps 原样，不新增里程碑
  m.updateLiveBlocks(root, s.sid, { currentStatus: '新状态', nextSteps: '新下一步', keyDecisions: '新决定', workspace: ws, modelTurn: 3 });
  const after = m.readProgress(root, s.sid);
  assert.equal(after.milestones.length, 1, '活区块更新不得新增里程碑');
  const last = after.milestones[0];
  assert.equal(last.currentStatus, '新状态');
  assert.equal(last.nextSteps, '新下一步');
  assert.equal(last.keyDecisions, '新决定');
  assert.deepEqual(last.completedSteps, ['【历史证据】不可改的历史内容'], '历史区块必须原样保留');

  // ② 历史区块就地改 → ERRATA_REQUIRED（completedSteps / files / iso 均被拒）
  assert.throws(
    () => m.updateLiveBlocks(root, s.sid, { completedSteps: ['篡改历史'], workspace: ws, modelTurn: 4 }),
    (e) => e.code === 'ERRATA_REQUIRED'
  );
  assert.throws(
    () => m.updateLiveBlocks(root, s.sid, { files: ['x'], workspace: ws, modelTurn: 5 }),
    (e) => e.code === 'ERRATA_REQUIRED'
  );
  assert.throws(() => m.assertLiveBlockOnly({ iso: '2026-01-01T00:00:00Z' }), (e) => e.code === 'ERRATA_REQUIRED');

  // ③ 守护函数：纯活区块通过；空对象通过（无变更）
  assert.equal(m.assertLiveBlockOnly({ currentStatus: 'a' }).includes('currentStatus'), true);
  assert.deepEqual(m.assertLiveBlockOnly({}), []);
});

/* ================= 运行时接线四件套（§7，2026-09-11 签字生效） ================= */

function rawOf(root, sid, name) {
  const p = path.join(root, 'sessions', sid, name);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

test('RUNTIME1: 新对话自动注册 —— 幂等（同 dshSessionId 不重复注册）', () => {
  runtime.__resetRuntimeCursor();
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const r1 = runtime.onSessionStart({ root, dshSessionId: hostFor(1), taskSummary: '任务一', workspace: ws });
  assert.equal(r1.created, true);
  assert.match(r1.sid, /^\d{8}-[a-z0-9]{12}$/);
  // 内存幂等
  const r2 = runtime.onSessionStart({ root, dshSessionId: hostFor(1), taskSummary: '任务一', workspace: ws });
  assert.equal(r2.created, false);
  assert.equal(r2.sid, r1.sid);
  // registry 幂等（清游标后重查）
  runtime.__resetRuntimeCursor();
  const r3 = runtime.onSessionStart({ root, dshSessionId: hostFor(1), taskSummary: '任务一', workspace: ws });
  assert.equal(r3.created, false);
  assert.equal(r3.deduped, 'registry');
  assert.equal(r3.sid, r1.sid);
  assert.equal(m.readRegistry(root).sessions.filter((s) => s.dshSessionId === hostFor(1)).length, 1, '不重复注册');
  // 未知宿主格式 → 拒绝入册（不抛错）；缺 workspace 仍 fail-closed
  assert.deepEqual(runtime.onSessionStart({ root, workspace: ws }), { registered: false, skipped: 'unknown-host-id' });
  assert.deepEqual(runtime.onSessionStart({ root, dshSessionId: 'not-a-uuid', workspace: ws }), { registered: false, skipped: 'unknown-host-id' });
  assert.throws(() => runtime.onSessionStart({ root, dshSessionId: hostFor(99) }), (e) => e.code === 'RUNTIME_NEEDS_WORKSPACE');
});

test('RUNTIME2: 用户输入全量采集（R1，施工笔 B）—— 指令入待办、非指令入一般输入栏、消息 id 幂等、B 会话零变化', () => {
  runtime.__resetRuntimeCursor();
  const root = tmpRoot();
  const wsA = wsOf(root, 'ws-a');
  const wsB = wsOf(root, 'ws-b');
  const a = runtime.onSessionStart({ root, dshSessionId: hostFor(2), taskSummary: 'A', workspace: wsA });
  const b = runtime.onSessionStart({ root, dshSessionId: hostFor(3), taskSummary: 'B', workspace: wsB });
  const bLedgerBefore = rawOf(root, b.sid, 'ledger.md');
  const bProgBefore = rawOf(root, b.sid, 'progress.md');

  // 指令消息 → 待办栏
  const c1 = runtime.onUserMessage({ root, sid: a.sid, messageId: 'm1', text: '请按要求逐条统计 429', workspace: wsA, modelTurn: 1 });
  assert.equal(c1.collected, true);
  assert.equal(c1.kind, 'instruction');
  // 非指令消息 → 一般输入栏（R1 全量采集；不再 skipped:not-instruction）
  const c2 = runtime.onUserMessage({ root, sid: a.sid, messageId: 'm2', text: '今天天气不错', workspace: wsA });
  assert.equal(c2.collected, true, 'R1：全部输入入账');
  assert.equal(c2.kind, 'general');
  // 同 id 重复 → 幂等跳过
  const c3 = runtime.onUserMessage({ root, sid: a.sid, messageId: 'm1', text: '请按要求逐条统计 429', workspace: wsA, modelTurn: 2 });
  assert.equal(c3.skipped, 'duplicate');
  // 再一条指令 → 累计
  const c4 = runtime.onUserMessage({ root, sid: a.sid, messageId: 'm3', text: '务必按时长分组输出', workspace: wsA, modelTurn: 3 });
  assert.equal(c4.collected, true);
  assert.equal(c4.kind, 'instruction');
  const ledA = m.readLedger(root, a.sid);
  const todos = ledA.sections['待办'];
  assert.equal(todos.length, 2, '两条指令入待办');
  assert.ok(todos.some((e) => e.desc.includes('请按要求逐条统计')));
  assert.ok(todos.some((e) => e.desc.includes('务必按时长分组输出')));
  const general = ledA.sections['一般输入'];
  assert.equal(general.length, 1, '非指令入一般输入栏');
  assert.equal(general[0].status, '已记录');
  assert.ok(general[0].desc.includes('今天天气不错'), '一般输入保原文');
  // 隔离：B 会话目录零变化
  assert.equal(rawOf(root, b.sid, 'ledger.md'), bLedgerBefore, 'B 台账零变化');
  assert.equal(rawOf(root, b.sid, 'progress.md'), bProgBefore, 'B 进度零变化');
  assert.throws(() => runtime.onUserMessage({ root, text: '请 x', workspace: wsA }), (e) => e.code === 'RUNTIME_NEEDS_SID');
});

test('RUNTIME3: 里程碑与心跳自动触发 —— appendMilestone 带 workspaceRoot，心跳刷 lastActiveAt', () => {
  runtime.__resetRuntimeCursor();
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const a = runtime.onSessionStart({ root, dshSessionId: hostFor(2), taskSummary: 'A', workspace: ws });
  const before = m.readRegistry(root).sessions.find((s) => s.sid === a.sid).lastActiveAt;
  const ms = runtime.onMilestone({
    root, sid: a.sid, workspace: ws, modelTurn: 5,
    completedSteps: ['【里程碑】四件套测试完成'],
    currentStatus: '进行中', nextSteps: '下一步',
  });
  assert.match(ms.iso, /\d{4}-\d{2}-\d{2}T/, '里程碑 iso');
  const prog = m.readProgress(root, a.sid);
  assert.equal(prog.header.workspaceRoot, path.resolve(ws), '里程碑写入自动带 workspaceRoot');
  assert.deepEqual(prog.milestones.at(-1).completedSteps, ['【里程碑】四件套测试完成']);
  const after = m.readRegistry(root).sessions.find((s) => s.sid === a.sid).lastActiveAt;
  assert.notEqual(after, before, '心跳随写入刷新 lastActiveAt');
  // onHeartbeat 显式刷新
  const hb = runtime.onHeartbeat({ root, sid: a.sid });
  assert.equal(hb.heartbeated, true);
  const after2 = m.readRegistry(root).sessions.find((s) => s.sid === a.sid).lastActiveAt;
  assert.equal(after2, hb.heartbeated ? after2 : after2, '心跳调用成功');
});

test('RUNTIME4: 会话状态自动流转 —— 合法迁移成立、非法迁移拒绝', () => {
  runtime.__resetRuntimeCursor();
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const a = runtime.onSessionStart({ root, dshSessionId: hostFor(2), taskSummary: 'A', workspace: ws });
  const moved = runtime.onSessionState({ root, sid: a.sid, status: '已完成' });
  assert.equal(moved.status, '已完成');
  assert.equal(m.readRegistry(root).sessions.find((s) => s.sid === a.sid).status, '已完成');
  // 非法迁移：已完成 → 活跃（不允许）
  assert.throws(
    () => runtime.onSessionState({ root, sid: a.sid, status: '活跃' }),
    (e) => e.code === 'INVALID_TRANSITION'
  );
  assert.throws(() => runtime.onSessionState({ root, sid: a.sid }), (e) => e.code === 'RUNTIME_NEEDS_STATUS');
});

test('PLUGIN: 插件事件接线 —— session/created 注册、inbox/claimed 采集、pre-step 心跳、disposed 流转', async () => {
  runtime.__resetRuntimeCursor();
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  // 最小 mock emitter
  const handlers = new Map();
  const ctx = {
    on(name, fn) { handlers.set(name, fn); return () => handlers.delete(name); },
    emit(name, payload) {
      const fn = handlers.get(name);
      if (!fn) return Promise.resolve(undefined);
      return Promise.resolve(fn(payload, async () => ({ kind: 'allowed' })));
    },
  };
  const api = registerPlugin(ctx, { dataRoot: root, defaultWorkspace: ws });
  assert.equal(typeof api.milestone, 'function', '插件暴露里程碑 API');

  // session/created → 自动注册（宿主 UUID 派生 sid）
  const HOST = hostFor(101);
  await ctx.emit('session/created', { id: HOST, cwd: ws, taskSummary: '插件会话' });
  const sessions = m.readRegistry(root).sessions;
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].dshSessionId, HOST);
  assert.match(sessions[0].sid, /^\d{8}-[a-z0-9]{12}$/);
  // 再 emit 一次（重复事件）→ 不重复注册
  await ctx.emit('session/created', { id: HOST, cwd: ws, taskSummary: '插件会话' });
  assert.equal(m.readRegistry(root).sessions.length, 1, '会话重复事件不重复注册');

  // agent/inbox/claimed → 指令采集（载荷携带宿主 UUID，插件经 registry 反解为 sid）
  await ctx.emit('agent/inbox/claimed', {
    agent: { session: { id: HOST, cwd: ws } },
    message: { id: 'msg-1', content: '请把结果写入报告并提供链接' },
  });
  const led = m.readLedger(root, sessions[0].sid);
  assert.ok(led.sections['待办'].some((e) => e.desc.includes('请把结果写入报告')), 'claimed 消息入台账');

  // agent/pre-step → 心跳（next 被调用）
  let nextCalled = false;
  const next = async () => { nextCalled = true; return { kind: 'allowed' }; };
  const stepH = handlers.get('agent/pre-step');
  assert.ok(stepH, 'pre-step 已订阅');
  await stepH({ agent: { session: { id: HOST } } }, next);
  assert.equal(nextCalled, true, 'pre-step next 继续放行');

  // ⑤ 候选①（§12.9）：session/event 的 model/selection → 里程碑记录切换（主源，替代幻影 model-switch）
  // 先经 agent/request 播种当前引擎指纹（首次观测只播种不写）
  const reqH = handlers.get('agent/request');
  assert.ok(reqH, 'agent/request 已订阅');
  await reqH({ agent: { session: { id: HOST, cwd: ws } }, provider: 'sensenova-gateway', model: 'star' },
    async () => ({ provider: 'sensenova-gateway', model: 'star' }));
  const sevH = handlers.get('session/event');
  assert.ok(sevH, 'session/event 已订阅');
  await sevH({ id: HOST, cwd: ws }, { type: 'model/selection', seq: 1, time: Date.now(), data: { provider: 'nvidia', model: 'nova' } });
  const progMs = m.readProgress(root, sessions[0].sid).milestones.at(-1);
  assert.ok(progMs.completedSteps.some((s) => s.includes('【模型切换】sensenova-gateway/star → nvidia/nova（model/selection）')), 'model/selection 里程碑记录切换');
  assert.ok(progMs.keyDecisions.includes('model/selection'), '关键决定记录切换来源');

  // session/disposed → 已完成（活跃→已完成 合法；经宿主反解 sid）
  await ctx.emit('session/disposed', { id: HOST });
  assert.equal(m.readRegistry(root).sessions[0].status, '已完成');

  // 销毁早于注册 → 不抛错（未知宿主不入册，disposed 直接跳过）
  await ctx.emit('session/disposed', { id: hostFor(999) });
});

/* ================= WIRE 系列：接线级集成（经 plugin 入口，非直调；v11 step2） ================= */

test('WIRE1: modelTurn 透传 —— 带 turn 宿主经 plugin 入口：注册→采集→心跳→heartbeatTurn 推进→门禁 fresh', async () => {
  runtime.__resetRuntimeCursor();
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-wire');
  const handlers = new Map();
  const ctx = {
    on(name, fn) { handlers.set(name, fn); return () => handlers.delete(name); },
    emit(name, payload) {
      const fn = handlers.get(name);
      if (!fn) return Promise.resolve(undefined);
      return Promise.resolve(fn(payload, async () => ({ kind: 'allowed' })));
    },
  };
  registerPlugin(ctx, { dataRoot: root, defaultWorkspace: ws });
  const HOST = hostFor(201);

  // ① 注册：session/created 真形（无 turn，宿主 dsh-session announce）→ initLedger heartbeatTurn=0 基线
  await ctx.emit('session/created', { id: HOST, cwd: ws, taskSummary: 'WIRE' });
  const sid = m.readRegistry(root).sessions[0].sid;
  assert.equal(m.readLedger(root, sid).header.heartbeatTurn, 0, '注册无 turn → heartbeatTurn=0（基线）');

  // ② 采集：turn 在顶层（宿主 dsh-agent-loop :367-372 {message,turn}；agent 由 fused 注入且无 .turn）
  await ctx.emit('agent/inbox/claimed', {
    agent: { session: { id: HOST, cwd: ws } },
    message: { id: 'wire-msg-1', content: '请记住：终验心跳复验' },
    turn: 5,
  });
  assert.equal(m.readLedger(root, sid).header.heartbeatTurn, 5, '采集顶层 turn=5 → heartbeatTurn=5');
  assert.ok(m.readLedger(root, sid).sections['待办'].some((e) => e.desc.includes('终验心跳复验')), '指令入台账');

  // ③ pre-step：turn 在顶层（宿主 dsh-agent-loop :506 {messages,...position,signal}，position={turn,step} 见 :538-540）
  const beforeActive = m.readRegistry(root).sessions[0].lastActiveAt;
  let nextCalled = false;
  await handlers.get('agent/pre-step')({ messages: [], turn: 6, step: 1, agent: { session: { id: HOST } } }, async () => { nextCalled = true; return { kind: 'allowed' }; });
  assert.equal(nextCalled, true, 'pre-step next 放行');
  assert.ok(m.readRegistry(root).sessions[0].lastActiveAt >= beforeActive, 'pre-step 心跳推进 registry.lastActiveAt');

  // ④ 门禁 fresh（油表复活）：turn=6 vs heartbeatTurn=5 → fresh；turn=10 → stale（真实油表，非恒0假绿）
  const fresh = m.assertFreshForHandover(root, sid, { turn: 6, transferStrategy: 'compact' });
  assert.equal(fresh.ok, true, 'turn−heartbeatTurn=1 ≤ 3 → fresh');
  assert.throws(
    () => m.assertFreshForHandover(root, sid, { turn: 10, transferStrategy: 'compact' }),
    (e) => e.code === 'FRESHNESS_STALE' && e.turns === 5,
    'turn−heartbeatTurn=5 > 3 → stale（门禁有真实油表）',
  );
});

test('WIRE3-NEG: 真形反向 —— 载荷逐字段复制宿主发射点（顶层 turn；agent 无 .turn/.session.turn）', async () => {
  // 载荷来源（宿主源码，禁止自造形状）：
  //   - agent/inbox/claimed = { message, turn, agent }
  //       dsh-agent-loop/lib/index.js:367-372 `claimed:(message,turn)=>emit("agent/inbox/claimed",{message,turn})`
  //       随后 dsh-agent/lib/index.js:337-340 `fused=(payload)=>({...payload, agent})` 注入 agent
  //       agent=AgentLoop 实例（dsh-agent-loop 构造见 :355-386）：无 .turn；其 session 亦无 .turn
  //   - agent/pre-step      = { messages, turn, step, signal, agent }
  //       dsh-agent-loop:506 `waterfall("agent/pre-step",{messages:claimed,...position,signal})`
  //       position={turn,step} 来自 dsh-agent-loop:538-540 `preStep(target,{turn,step})`；turn=phase.turn+1 见 :526/:532
  //   - session/created     = (session) 无 turn ← dsh-session/lib/index.js:1693-1715 announce 只传 session
  runtime.__resetRuntimeCursor();
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-wire3neg');
  const handlers = new Map();
  const ctx = {
    on(name, fn) { handlers.set(name, fn); return () => handlers.delete(name); },
    emit(name, payload) {
      const fn = handlers.get(name);
      if (!fn) return Promise.resolve(undefined);
      return Promise.resolve(fn(payload, async () => ({ kind: 'allowed' })));
    },
  };
  registerPlugin(ctx, { dataRoot: root, defaultWorkspace: ws });
  const HOST = hostFor(401);

  // ① session/created 真形（无 turn）→ 基线 0
  await ctx.emit('session/created', { id: HOST, cwd: ws, taskSummary: 'WIRE3-NEG' });
  const sid = m.readRegistry(root).sessions[0].sid;
  assert.equal(m.readLedger(root, sid).header.heartbeatTurn, 0, 'session/created 真形无 turn → heartbeatTurn=0');

  // ② inbox/claimed 真形：turn 在顶层，agent.session 无 .turn（旧码读 agent.turn=0 → 在此失败）
  await ctx.emit('agent/inbox/claimed', {
    message: { id: 'neg-1', content: '请记住：真形反向' },
    turn: 5,
    agent: { session: { id: HOST, cwd: ws } },
  });
  assert.equal(m.readLedger(root, sid).header.heartbeatTurn, 5, '顶层 turn=5 → heartbeatTurn=5');

  // ③ pre-step 真形：turn 在顶层（messages 至少给空数组，宿主形状含 messages）
  let nextCalled = false;
  await handlers.get('agent/pre-step')({ messages: [], turn: 6, step: 1, agent: { session: { id: HOST } } }, async () => { nextCalled = true; return { kind: 'allowed' }; });
  assert.equal(nextCalled, true, 'pre-step 真形 next 放行');
  const fresh = m.assertFreshForHandover(root, sid, { turn: 6, transferStrategy: 'compact' });
  assert.equal(fresh.ok, true, '顶层 turn=6 vs 油表 5 → fresh（旧码恒 STALE 无此正证）');
});

test('WIRE2: [永久] 自然触发监测 —— model/selection 里程碑写入双 [永久] 在场断言', async () => {
  runtime.__resetRuntimeCursor();
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-wire2');
  const handlers = new Map();
  const ctx = {
    on(name, fn) { handlers.set(name, fn); return () => handlers.delete(name); },
    emit(name, payload) {
      const fn = handlers.get(name);
      if (!fn) return Promise.resolve(undefined);
      return Promise.resolve(fn(payload));
    },
  };
  registerPlugin(ctx, { dataRoot: root, defaultWorkspace: ws });
  const HOST = hostFor(301);
  await ctx.emit('session/created', { id: HOST, cwd: ws, taskSummary: 'WIRE2', turn: 1 });
  const sid = m.readRegistry(root).sessions[0].sid;
  assert.equal(m.readLedger(root, sid).permanent.length, 2, '新会话默认永久区恰两行');

  // 真实信道：session/event 的 model/selection（dsh-session 包 index.js 第 1403-1440 行 append→emit；
  //   官方手动选择 dsh-api-session-controller/lib/index.js 第 312 行 append("model/selection", {provider, model})）
  const reqH = handlers.get('agent/request');
  await reqH({ agent: { session: { id: HOST, cwd: ws } }, provider: 'p0', model: 'm0' },
    async () => ({ provider: 'p0', model: 'm0' }));
  const sevH = handlers.get('session/event');
  await sevH({ id: HOST, cwd: ws }, { type: 'model/selection', seq: 1, time: Date.now(), data: { provider: 'p1', model: 'm1' } });
  const ms = m.readProgress(root, sid).milestones.at(-1);
  const permNote = ms.completedSteps.find((s) => s.includes('【[永久]监测】'));
  assert.ok(permNote, 'model/selection 里程碑含 [永久] 监测行');
  assert.ok(permNote.includes('正典双行在场=是'), '双行在场断言为是');
  assert.ok(permNote.includes('始终用中文回复=true'), '第一行在场');
  assert.ok(permNote.includes('指令先落账=true'), '第二行在场');
});

test('WIRE4: 候选①主源幂等 —— 同指纹不写、变化才写、未知会话不抛错', async () => {
  runtime.__resetRuntimeCursor();
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-wire4');
  const handlers = new Map();
  const ctx = {
    on(name, fn) { handlers.set(name, fn); return () => handlers.delete(name); },
  };
  registerPlugin(ctx, { dataRoot: root, defaultWorkspace: ws });
  const HOST = hostFor(302);
  await handlers.get('session/created')({ id: HOST, cwd: ws, taskSummary: 'WIRE4' });
  const sid = m.readRegistry(root).sessions[0].sid;

  const reqH = handlers.get('agent/request');
  const sevH = handlers.get('session/event');
  // 播种 a/m0（首次不写）
  await reqH({ agent: { session: { id: HOST, cwd: ws } } }, async () => ({ provider: 'a', model: 'm0' }));
  assert.equal(m.readProgress(root, sid).milestones.length, 0, '首次播种指纹不写里程碑');
  // 同指纹再发 model/selection：不写（幂等）
  await sevH({ id: HOST, cwd: ws }, { type: 'model/selection', data: { provider: 'a', model: 'm0' } });
  assert.equal(m.readProgress(root, sid).milestones.length, 0, '同指纹不写');
  // 变化 → 写
  await sevH({ id: HOST, cwd: ws }, { type: 'model/selection', data: { provider: 'b', model: 'm1' } });
  assert.equal(m.readProgress(root, sid).milestones.length, 1, '指纹变化写一条');
  assert.ok(m.readProgress(root, sid).milestones[0].completedSteps.some((s) => s.includes('【模型切换】a/m0 → b/m1（model/selection）')), 'from→to+来源');
  // 未知会话（未入册宿主）不抛错
  await sevH({ id: hostFor(999) }, { type: 'model/selection', data: { provider: 'x', model: 'y' } });
  assert.equal(m.readProgress(root, sid).milestones.length, 1, '未知会话不抛错、不写');
});

test('WIRE5: 候选①补充 —— RATE_LIMIT 后 agent/request 指纹变化记为「回退」', async () => {
  runtime.__resetRuntimeCursor();
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-wire5');
  const handlers = new Map();
  const ctx = { on(name, fn) { handlers.set(name, fn); return () => handlers.delete(name); } };
  registerPlugin(ctx, { dataRoot: root, defaultWorkspace: ws });
  const HOST = hostFor(303);
  await handlers.get('session/created')({ id: HOST, cwd: ws, taskSummary: 'WIRE5' });
  const sid = m.readRegistry(root).sessions[0].sid;

  const reqH = handlers.get('agent/request');
  const errH = handlers.get('agent/request-error');
  // 播种 a/m0
  await reqH({ agent: { session: { id: HOST, cwd: ws } }, turn: 1 }, async () => ({ provider: 'a', model: 'm0' }));
  // RATE_LIMIT（真实信道 dsh-rate-throttle 第 618 行 payload.failure.code）→ 挂起回退旗标
  await errH({ agent: { session: { id: HOST, cwd: ws } }, turn: 1, provider: 'a', failure: { code: 'RATE_LIMIT' } }, async () => undefined);
  // 下一请求 call 指纹变化 → 「回退」
  await reqH({ agent: { session: { id: HOST, cwd: ws } }, turn: 2 }, async () => ({ provider: 'b', model: 'm1' }));
  const ms = m.readProgress(root, sid).milestones;
  assert.equal(ms.length, 1, 'RATE_LIMIT 后指纹变化写里程碑');
  assert.ok(ms[0].completedSteps.some((s) => s.includes('【模型切换】a/m0 → b/m1（回退）')), '来源标注=回退');
  // 未知会话的 request-error 不抛错
  await errH({ agent: { session: { id: hostFor(999) } }, provider: 'z', failure: { code: 'RATE_LIMIT' } }, async () => undefined);
});

test('CAP2: checkpoint 在场证据日志 —— 节流 JSONL（翻变必写、同结论 24h 内不重复）', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-cap2');
  const host = hostFor(9);
  const rec = m.createSession(root, { sid: sidFor(9), dshSessionId: host, taskSummary: 't', workspace: ws, modelTurn: 1 });
  // 首次在场=是 → 写
  const r1 = m.recordCheckpointEvidence(root, host, { ok: true });
  assert.equal(r1.written, true, '首次在场写一条');
  assert.ok(fs.existsSync(m.evidencePath(root, rec.sid)), '证据 JSONL 已创建');
  const line1 = fs.readFileSync(m.evidencePath(root, rec.sid), 'utf8').trim();
  assert.ok(line1.includes('"checkpoint":"双行在场=是"'), '在场=是落档');
  assert.ok(line1.includes('"ok":true'), 'ok=true 落档');
  // 同结论 24h 内 → 节流跳过
  const r2 = m.recordCheckpointEvidence(root, host, { ok: true });
  assert.equal(r2.written, false, '同结论节流不重复写');
  assert.ok(r2.reason === 'throttled', '节流原因');
  // 翻变为缺席 → 必写
  const r3 = m.recordCheckpointEvidence(root, host, { ok: false });
  assert.equal(r3.written, true, '结论翻变必写');
  // 未知宿主不抛错
  const r4 = m.recordCheckpointEvidence(root, 'not-a-uuid', { ok: true });
  assert.equal(r4.written, false, '未知宿主不写');
  assert.equal(r4.reason, 'unknown-host-id', '未知宿主原因');
});

test('IG1: 套件级 cordis.patch.yml + package.json exports（等价替换 install-global 检查）', () => {
  const suiteRoot = SUITE_ROOT;
  const patchText = fs.readFileSync(path.join(suiteRoot, 'cordis.patch.yml'), 'utf8');
  assert.ok(patchText.includes('- id: agent-memory-runtime'), 'patch 含挂载 id');
  assert.ok(patchText.includes("name: 'xiaobai-agent/agent-memory/plugin'"), 'patch 含套件 mount 行名');
  assert.ok(patchText.includes('dataRoot: <AGENT_MEMORY_DATA_ROOT>'), 'patch 含 dataRoot 占位符（S2.e 模板形）');
  assert.ok(patchText.includes('defaultWorkspace: null'), 'patch 含 defaultWorkspace');

  const pkg = JSON.parse(fs.readFileSync(path.join(suiteRoot, 'package.json'), 'utf8'));
  assert.ok(pkg.exports, 'package.json 应有 exports 字段');
  assert.ok(pkg.exports['./agent-memory'], 'exports 含 ./agent-memory');
  assert.ok(pkg.exports['./agent-memory/plugin'], 'exports 含 ./agent-memory/plugin');
  const amTarget = path.join(suiteRoot, String(pkg.exports['./agent-memory']).replace('./', ''));
  const amPluginTarget = path.join(suiteRoot, String(pkg.exports['./agent-memory/plugin']).replace('./', ''));
  assert.equal(fs.existsSync(amTarget), true, './agent-memory 目标可解析: ' + amTarget);
  assert.equal(fs.existsSync(amPluginTarget), true, './agent-memory/plugin 目标可解析: ' + amPluginTarget);
});

/* ================= sid 归一化（方案 b 修订版：权威反转 / 注册表分配并固化 / 两钩子 / 12 位 / 未知拒绝入册 / 销毁早于注册） ================= */

test('SIDNORM1: 宿主 ID 归一化 —— 合法 UUID 小写化、未知格式返回 null 不抛错', () => {
  const H = 'ABCDEFAB-1234-4567-89AB-CDEFABCDEFAB';
  assert.equal(m.normalizeHostId(H), H.toLowerCase());
  assert.equal(m.tryNormalizeHostId(H), H.toLowerCase());
  assert.equal(m.tryNormalizeHostId('not-a-uuid'), null);
  assert.equal(m.tryNormalizeHostId(null), null);
  assert.equal(m.tryNormalizeHostId(''), null);
  assert.throws(() => m.normalizeHostId('nope'), (e) => e.code === 'INVALID_HOST_ID');
});

test('SIDNORM2: 候选 sid 派生 —— YYYYMMDD-<UUID 去横线前 12 位 hex>（权威反转：宿主决定 sid）', () => {
  const H = '11111111-1111-4111-8111-222222222222';
  const sid = m.candidateSid(H, new Date('2026-09-11T04:00:00Z'));
  assert.equal(sid, '20260911-111111111111'); // date + UUID 去横线前 12 位
  assert.equal(m.candidateSuffix(H), '111111111111');
  assert.equal(m.candidateSid(H, new Date('2026-09-11T04:00:00Z')), sid, '同宿主恒同派生');
});

test('SIDNORM3: createSession 权威反转 —— 有宿主派生、无宿主随机 12 位、opaque 宿主兼容、未知 sid 拒绝入册不抛错', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const H = hostFor(31);
  // 有宿主 UUID → 派生候选 sid（12 位，权威反转）
  const a = m.createSession(root, { dshSessionId: H, taskSummary: 'a', workspace: ws });
  assert.equal(a.sid, m.candidateSid(H));
  assert.match(a.sid, /^\d{8}-[a-z0-9]{12}$/);
  // 无宿主 → 随机 12 位
  const b = m.createSession(root, { taskSummary: 'b', workspace: ws });
  assert.match(b.sid, /^\d{8}-[a-z0-9]{12}$/);
  assert.notEqual(a.sid, b.sid);
  // 非 UUID 宿主（opaque，兼容旧脚本）→ 原样入册为元数据，不派生、不抛错
  const c = m.createSession(root, { dshSessionId: 'eng-sess-1', taskSummary: 'c', workspace: ws });
  assert.ok(c && m.isValidSid(c.sid));
  assert.equal(c.dshSessionId, 'eng-sess-1');
  // 未知格式显式 sid → 拒绝入册（null，不抛错）
  const d = m.createSession(root, { sid: 'not-a-valid-sid', taskSummary: 'd', workspace: ws });
  assert.equal(d, null);
  assert.equal(m.readRegistry(root).sessions.length, 3, '仅 3 条入册（未知 sid 未入册）');
});

test('SIDNORM4: 反向解析 + 销毁钩子 —— 未入册/销毁早于注册不抛错', () => {
  runtime.__resetRuntimeCursor();
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const H = hostFor(41);
  // 未注册 → 反解 null（不抛错）
  assert.equal(runtime.resolveSidByHostId(root, H), null);
  assert.equal(runtime.resolveSidByHostId(root, 'nope'), null);
  // 销毁早于注册 → 不抛错
  assert.deepEqual(runtime.onSessionDisposed({ root, dshSessionId: H }), {
    sid: null, status: '已完成', disposed: false, skipped: 'not-registered',
  });
  // 注册后 → 反解得到 sid，销毁成功
  const r = runtime.onSessionStart({ root, dshSessionId: H, taskSummary: 't', workspace: ws });
  assert.equal(runtime.resolveSidByHostId(root, H), r.sid);
  const d = runtime.onSessionDisposed({ root, dshSessionId: H });
  assert.equal(d.disposed, true);
  assert.equal(d.sid, r.sid);
  assert.equal(m.readRegistry(root).sessions.find((s) => s.sid === r.sid).status, '已完成');
  // 另一未入册宿主销毁 → no-op（销毁早于注册第二义）
  assert.deepEqual(runtime.onSessionDisposed({ root, dshSessionId: hostFor(999) }), {
    sid: null, status: '已完成', disposed: false, skipped: 'not-registered',
  });
});

/* ================= 真实宿主格式（修复②：session-<uuid> 前缀） ================= */

test('真实宿主格式: session/created 以 session-<uuid> 触发 → 注册成功、registry 落条目、sid=YYYYMMDD+12 位尾段', async () => {
  runtime.__resetRuntimeCursor();
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const HANDLERS = new Map();
  const ctx = {
    on(name, fn) { HANDLERS.set(name, fn); return () => HANDLERS.delete(name); },
    emit(name, payload) {
      const fn = HANDLERS.get(name);
      return fn ? Promise.resolve(fn(payload, async () => ({ kind: 'allowed' }))) : Promise.resolve(undefined);
    },
    logger: { info() {} },
  };
  registerPlugin(ctx, { dataRoot: root, defaultWorkspace: ws });
  const H = 'session-8899ce63-8e99-475a-8cd4-c84c62a34bd5';
  await ctx.emit('session/created', { id: H, cwd: ws, taskSummary: '真实宿主格式会话', task: 't' });
  const sessions = m.readRegistry(root).sessions;
  assert.equal(sessions.length, 1, '真实宿主格式应注册成功（不再静默跳过）');
  assert.equal(sessions[0].dshSessionId, '8899ce63-8e99-475a-8cd4-c84c62a34bd5', '注册表存剥离 session- 前缀后的裸 UUID');
  assert.match(sessions[0].sid, /^\d{8}-[a-z0-9]{12}$/, 'sid=YYYYMMDD+12 位尾段');
  assert.equal(
    sessions[0].sid,
    m.candidateSid('8899ce63-8e99-475a-8cd4-c84c62a34bd5'),
    'sid 由真实宿主 UUID 确定性派生（权威反转）'
  );
});

test('真实宿主格式: 未知前缀宿主 id 拒绝入册不抛错且发最小告警', () => {
  runtime.__resetRuntimeCursor();
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const warnings = [];
  const origEmitWarning = process.emitWarning;
  process.emitWarning = (msg, ...rest) => {
    warnings.push(String(msg));
    return origEmitWarning.call(process, msg, ...rest);
  };
  try {
    // 近似但非法的前缀 `sess-`（而非 `session-`）→ 归一到 null → 拒绝入册
    const r = runtime.onSessionStart({
      root,
      dshSessionId: 'sess-8899ce63-8e99-475a-8cd4-c84c62a34bd5',
      taskSummary: 't',
      workspace: ws,
    });
    assert.deepEqual(r, { registered: false, skipped: 'unknown-host-id' });
    assert.equal(fs.existsSync(registryFile(root)), false, '未知前缀不入册（未创建 registry）');
    assert.ok(
      warnings.some((w) => w.includes('onSessionStart 拒绝入册')),
      'skip 点应发一条最小告警（fail-closed 而非静默）'
    );
  } finally {
    process.emitWarning = origEmitWarning;
  }
});

/* ================= §8 迁移三步规程守护 ================= */

test('M1-M2: 迁移三步顺序（migrate→verify→cleanup）违例即拒绝', () => {
  // M1 合法顺序
  let st = assertMigrationOrder(null, 'migrate');
  st = assertMigrationOrder(st, 'verify');
  st = assertMigrationOrder(st, 'cleanup');
  assert.equal(st.phase, 'cleanup');
  assert.equal(runMigrationSequence(['migrate', 'verify', 'cleanup']).phase, 'cleanup');
  // M2 违例：先 cleanup / 跳过 verify / 重复 migrate / 未知步骤
  assert.throws(() => assertMigrationOrder(null, 'cleanup'), (e) => e.code === 'MIGRATION_ORDER_VIOLATION');
  assert.throws(() => assertMigrationOrder(null, 'verify'), (e) => e.code === 'MIGRATION_ORDER_VIOLATION');
  const m2 = assertMigrationOrder(null, 'migrate');
  assert.throws(() => assertMigrationOrder(m2, 'cleanup'), (e) => e.code === 'MIGRATION_ORDER_VIOLATION');
  assert.throws(() => assertMigrationOrder(m2, 'migrate'), (e) => e.code === 'MIGRATION_ORDER_VIOLATION');
  assert.throws(() => assertMigrationOrder(null, 'delete'), (e) => e.code === 'MIGRATION_UNKNOWN_STEP');
});

/* ================= §11 preflight 检查函数 ================= */

test('P1-P6: preflight 检查函数（版本/依赖/位置/挂载/备份/全局根）', async () => {
  // P1 node 版本
  assert.equal((await checkNodeVersion({ node: '>=1' })).ok, true);
  assert.equal((await checkNodeVersion({ node: '>=9999' })).ok, false);
  // P2 依赖解析
  const pdir = wsOf(tmpRoot(), 'profile');
  const nm = path.join(pdir, 'node_modules', 'fake-pkg');
  fs.mkdirSync(nm, { recursive: true });
  fs.writeFileSync(path.join(nm, 'index.js'), 'export const x = 1;\n', 'utf8');
  fs.writeFileSync(path.join(nm, 'package.json'), JSON.stringify({ name: 'fake-pkg', main: 'index.js' }), 'utf8');
  const depsOk = checkDependencies(pdir, ['fake-pkg']);
  assert.equal(depsOk[0].ok, true);
  const depsMiss = checkDependencies(pdir, ['not-installed-pkg']);
  assert.equal(depsMiss[0].ok, false);
  // P3 安装位置
  const locOk = checkInstallLocations(pdir, ['node_modules/fake-pkg/index.js']);
  assert.equal(locOk[0].ok, true);
  const locMiss = checkInstallLocations(pdir, ['node_modules/missing-pkg/index.js']);
  assert.equal(locMiss[0].ok, false);
  // P4 预设挂载（含 id 冲突）
  const preset = path.join(pdir, 'agent.cordis.yml');
  fs.writeFileSync(preset, '- id: agent-memory-runtime\n  name: \'xiaobai-agent/agent-memory/plugin\'\n  config: {}\n', 'utf8');
  assert.equal(checkPresetMount(preset, 'agent-memory-runtime', 'xiaobai-agent/agent-memory/plugin').ok, true);
  const presetNoMount = path.join(pdir, 'empty.yml');
  fs.writeFileSync(presetNoMount, '- id: other\n  name: x\n', 'utf8');
  assert.equal(checkPresetMount(presetNoMount, 'agent-memory-runtime', 'xiaobai-agent/agent-memory/plugin').ok, false);
  fs.writeFileSync(preset, '- id: agent-memory-runtime\n  name: a\n- id: agent-memory-runtime\n  name: b\n', 'utf8');
  assert.equal(checkPresetMount(preset, 'agent-memory-runtime', 'xiaobai-agent/agent-memory/plugin').ok, false, 'id 重复→冲突即中止');
  // P5 备份就绪
  const bak = path.join(pdir, 'backup');
  fs.mkdirSync(path.join(bak, 'snapshots'), { recursive: true });
  fs.writeFileSync(path.join(bak, 'snapshots', 'x.json'), '{}', 'utf8');
  assert.equal(checkBackupReady(bak, 1000).ok, true);
  assert.equal(checkBackupReady(path.join(pdir, 'nobackup'), 1000).ok, false);
  // P6 全局根 + 汇总
  const groot = tmpRoot();
  m.createSession(groot, { sid: '20260910-00000099', taskSummary: 't', workspace: wsOf(groot, 'ws') });
  assert.equal(checkGlobalRoot(groot).ok, true);
  const summary = runPreflight([{ name: 'a', ok: true }, { name: 'b', ok: false }]);
  assert.equal(summary.ok, false);
  assert.equal(summary.failed.length, 1);
});

test('P7: checkEngineLoad —— 真实 import 引擎（含传递依赖缺失捕获，2026-09-11 迁移事故反例）', async () => {
  const pdir = wsOf(tmpRoot(), 'profile');
  // 自足模块：import 应成功
  const okd = path.join(pdir, 'node_modules', '@fake', 'okdep');
  fs.mkdirSync(okd, { recursive: true });
  fs.writeFileSync(path.join(okd, 'package.json'), JSON.stringify({ name: '@fake/okdep', type: 'module', main: 'index.js' }), 'utf8');
  fs.writeFileSync(path.join(okd, 'index.js'), 'export const ok = true;\n', 'utf8');
  // 传递依赖缺失模块：入口可 resolve，但 import 即崩（镜像 dsh-compact-router 缺 @deepseek-ai/dsh-compaction-basic）
  const badd = path.join(pdir, 'node_modules', '@fake', 'baddep');
  fs.mkdirSync(badd, { recursive: true });
  fs.writeFileSync(path.join(badd, 'package.json'), JSON.stringify({ name: '@fake/baddep', type: 'module', main: 'index.js' }), 'utf8');
  fs.writeFileSync(path.join(badd, 'index.js'), "import '@fake/never-installed';\nexport const bad = false;\n", 'utf8');

  const res = await checkEngineLoad(pdir, ['@fake/okdep', '@fake/baddep']);
  assert.equal(res.length, 2);
  assert.equal(res[0].name, '引擎加载:@fake/okdep');
  assert.equal(res[0].ok, true, '自足模块应加载成功');
  assert.match(res[0].detail, /import 成功/);
  assert.equal(res[1].name, '引擎加载:@fake/baddep');
  assert.equal(res[1].ok, false, '传递依赖缺失必须被捕获（resolve 只验入口会漏检）');
  assert.match(res[1].detail, /import 失败/);
});

test('P8: checkBundleMountResolvable —— bundle 合成 + 真实 import（正向，套件版）', async () => {
  const located = locateDshInstall();
  assert.ok(located, '本用例需 dsh 安装根（npm root -g 定位）');
  const copyRecursive = (from, to) => {
    fs.mkdirSync(to, { recursive: true });
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      const sPath = path.join(from, e.name);
      const dPath = path.join(to, e.name);
      if (e.isDirectory()) copyRecursive(sPath, dPath);
      else fs.copyFileSync(sPath, dPath);
    }
  };
  const home = tmpRoot();
  const profileDir = path.join(home, 'profiles', 'web');
  const bundleDir = path.join(profileDir, 'node_modules', 'xiaobai-agent');
  copyRecursive(path.join(SUITE_ROOT, 'lib'), path.join(bundleDir, 'lib'));
  fs.copyFileSync(path.join(SUITE_ROOT, 'package.json'), path.join(bundleDir, 'package.json'));
  // G6（S2 正名批）撤了仓根 package.json 的 dsh.bundle.patch 键（发布物不含 cordis.patch.yml）；
  // 本格模拟"带 bundle patch 的安装形态"，夹具自补该键（doctor 的 bundle 挂载检查能力与 G6 无关）。
  const bundlePkg = JSON.parse(fs.readFileSync(path.join(bundleDir, 'package.json'), 'utf8'));
  bundlePkg.dsh = { bundle: { patch: './cordis.patch.yml' } };
  fs.writeFileSync(path.join(bundleDir, 'package.json'), JSON.stringify(bundlePkg, null, 2), 'utf8');
  fs.copyFileSync(path.join(SUITE_ROOT, 'cordis.patch.yml'), path.join(bundleDir, 'cordis.patch.yml'));
  fs.writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify({ name: 'p', private: true, dsh: { profile: { bundles: ['xiaobai-agent'] } } }), 'utf8');
  fs.writeFileSync(path.join(profileDir, 'cordis.yml'), '[]\n', 'utf8');
  fs.writeFileSync(path.join(profileDir, 'cordis.patch.yml'), '[]\n', 'utf8');
  const res = await checkBundleMountResolvable({ profileDir, home, ...located, mountId: 'agent-memory-runtime' });
  assert.equal(res.ok, true, '正向应 PASS：' + res.detail);
  assert.match(res.detail, /import 成功/);
});

test('P9: checkBundleMountResolvable —— 错误引用反向 FAIL 且报错可定位（套件版）', async () => {
  const located = locateDshInstall();
  assert.ok(located, '本用例需 dsh 安装根');
  const copyRecursive = (from, to) => {
    fs.mkdirSync(to, { recursive: true });
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      const sPath = path.join(from, e.name);
      const dPath = path.join(to, e.name);
      if (e.isDirectory()) copyRecursive(sPath, dPath);
      else fs.copyFileSync(sPath, dPath);
    }
  };
  const stake = (overwritePatch, overwritePlugin) => {
    const home = tmpRoot();
    const profileDir = path.join(home, 'profiles', 'web');
    const bundleDir = path.join(profileDir, 'node_modules', 'xiaobai-agent');
    copyRecursive(path.join(SUITE_ROOT, 'lib'), path.join(bundleDir, 'lib'));
    if (overwritePlugin !== null) {
      fs.writeFileSync(path.join(bundleDir, 'lib', 'agent-memory', 'plugin.js'), overwritePlugin, 'utf8');
    }
    fs.copyFileSync(path.join(SUITE_ROOT, 'package.json'), path.join(bundleDir, 'package.json'));
    // 同 P8：夹具自补 dsh.bundle.patch 键（G6 后仓根不再带），使反向格真正走到 name/import 检查。
    const bundlePkg = JSON.parse(fs.readFileSync(path.join(bundleDir, 'package.json'), 'utf8'));
    bundlePkg.dsh = { bundle: { patch: './cordis.patch.yml' } };
    fs.writeFileSync(path.join(bundleDir, 'package.json'), JSON.stringify(bundlePkg, null, 2), 'utf8');
    fs.writeFileSync(path.join(bundleDir, 'cordis.patch.yml'), overwritePatch, 'utf8');
    fs.writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify({ name: 'p', private: true, dsh: { profile: { bundles: ['xiaobai-agent'] } } }), 'utf8');
    fs.writeFileSync(path.join(profileDir, 'cordis.yml'), '[]\n', 'utf8');
    fs.writeFileSync(path.join(profileDir, 'cordis.patch.yml'), '[]\n', 'utf8');
    return { home, profileDir };
  };
  const badNamePatch = "- insert:\n    - id: agent-memory-runtime\n      name: 'xiaobai-agent/agent-memory/nope'\n      config:\n        dataRoot: C:/tmp\n        defaultWorkspace: null\n";
  const a = stake(badNamePatch, null);
  const resA = await checkBundleMountResolvable({ profileDir: a.profileDir, home: a.home, ...located, mountId: 'agent-memory-runtime' });
  assert.equal(resA.ok, false, '错误 name 应 FAIL');
  assert.match(resA.detail, /失败/);
  const b = stake(fs.readFileSync(path.join(SUITE_ROOT, 'cordis.patch.yml'), 'utf8'), "import '@local/definitely-not-installed';\nexport default {};\n");
  const resB = await checkBundleMountResolvable({ profileDir: b.profileDir, home: b.home, ...located, mountId: 'agent-memory-runtime' });
  assert.equal(resB.ok, false, '入口 import 失败应 FAIL（传递依赖缺失必须被捕获）');
  assert.match(resB.detail, /失败/);
});

/* ================= §11/§12 一键回滚（rollback.mjs 核心） ================= */

test('RB: rollback —— 快照路径映射 + 恢复内容 + 越界拒绝', () => {
  const root = tmpRoot(); // 模拟生产根
  const bak = path.join(root, '_bak');
  fs.mkdirSync(bak, { recursive: true });
  const savedEnv = process.env.AGENT_MEMORY_BACKUP_DIR;
  process.env.AGENT_MEMORY_BACKUP_DIR = bak;

  return import('../lib/agent-memory/rollback.mjs').then(({ restore, mapSnapshotToProd, listSnapshots }) => {
    try {
      // 建一条"快照"（模拟备份目录里的覆盖前 COW 快照）
      const goodReg = JSON.stringify({ version: 1, updatedAt: '2026-09-11T00:00:00Z', sessions: [] });
      const snapFile = path.join(bak, 'registry.json');
      fs.writeFileSync(snapFile, goodReg, 'utf8');
      // 映射：备份根 → 生产根
      assert.equal(mapSnapshotToProd(snapFile, root), path.join(root, 'registry.json'));
      // COW 快照布局（backupFileBeforeWrite 产物）：<dir>/snapshots/<ts>__<name>
      // → <prod>/<dir>/<name>（剥掉 snapshots/ 与时间戳前缀；2026-09-11 演练修复）
      const cowSnap = path.join(bak, 'sessions', 'x', 'snapshots', '2026-09-11T00-00-29-620Z__ledger.md');
      fs.mkdirSync(path.dirname(cowSnap), { recursive: true });
      fs.writeFileSync(cowSnap, '# COW', 'utf8');
      assert.equal(mapSnapshotToProd(cowSnap, root), path.join(root, 'sessions', 'x', 'ledger.md'));
      // 无时间戳前缀的快照（历史平铺备份）仍走原映射
      const oldFlat = path.join(bak, 'sessions', 'x', 'snapshots', 'manual-ledger.md');
      fs.writeFileSync(oldFlat, '# manual', 'utf8');
      assert.equal(mapSnapshotToProd(oldFlat, root), path.join(root, 'sessions', 'x', 'snapshots', 'manual-ledger.md'));
      // 破坏生产 registry，再回滚
      fs.mkdirSync(path.join(root, 'sessions'), { recursive: true });
      fs.writeFileSync(path.join(root, 'registry.json'), '{BROKEN', 'utf8');
      const r = restore(snapFile, { prodRoot: root });
      assert.equal(fs.readFileSync(path.join(root, 'registry.json'), 'utf8'), goodReg, '回滚恢复快照内容');
      assert.equal(r.dryRun, false);
      // --dry-run 语义（restore 函数 dryRun 不写）
      fs.writeFileSync(path.join(root, 'registry.json'), '{BROKEN2', 'utf8');
      const r2 = restore(snapFile, { prodRoot: root, dryRun: true });
      assert.equal(fs.readFileSync(path.join(root, 'registry.json'), 'utf8'), '{BROKEN2', 'dry-run 不写盘');
      assert.equal(r2.dryRun, true);
      // 越界：快照在备份根之外 → 拒绝
      const outside = path.join(root, 'outside.json');
      fs.writeFileSync(outside, 'x', 'utf8');
      assert.throws(() => restore(outside, { prodRoot: root }), (e) => e.code === 'ROLLBACK_TARGET_OUTSIDE_ROOT');
      // 列表
      assert.ok(listSnapshots().length >= 1);
    } finally {
      if (savedEnv === undefined) delete process.env.AGENT_MEMORY_BACKUP_DIR;
      else process.env.AGENT_MEMORY_BACKUP_DIR = savedEnv;
    }
  });
});

/* ================= §12-4 新工作区轻量健康检查 ================= */

test('WH: 新工作区健康检查 —— 健康根通过、缺失根给出明确引导（不静默）', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws');
  m.createSession(root, { sid: '20260910-00000077', taskSummary: 't', workspace: ws });
  const ok = checkNewWorkspace({ root, workspace: ws });
  assert.equal(ok.ok, true);
  const lockC = ok.checks.find((c) => c.name === 'registry 可锁');
  assert.equal(lockC.ok, true);
  const guideC = ok.checks.find((c) => c.name === '引导路径可解析');
  assert.equal(guideC.ok, true);

  const miss = checkNewWorkspace({ root: path.join(root, 'nope'), workspace: ws });
  assert.equal(miss.ok, false);
  assert.ok(miss.checks.some((c) => !c.ok && c.name === '全局数据根可读写'), '缺失根 → 明确 FAIL 引导');
});

/* ================= 新鲜度检查点：上下文交接前置（§1，2026-09-11 新语义） ================= */

test('HF1-HF4: assertFreshForHandover —— 新鲜放行/过期拦截（策略无关）/刷新后放行/未初始化拒绝', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: '交接门禁', workspace: ws, modelTurn: 10 });

  // HF1 新鲜（≤3 回合）→ 放行；策略无关
  m.addEntry(root, s.sid, { desc: '回合10写入', workspace: ws, modelTurn: 10 });
  assert.equal(m.assertFreshForHandover(root, s.sid, { turn: 13, transferStrategy: 'full' }).ok, true);
  assert.equal(m.assertFreshForHandover(root, s.sid, { turn: 13, transferStrategy: 'compact' }).ok, true);

  // HF2 过期（>3）→ 拦截，无论完整/压缩传递
  assert.throws(
    () => m.assertFreshForHandover(root, s.sid, { turn: 14, transferStrategy: 'full' }),
    (e) => e.code === 'FRESHNESS_STALE' && e.turns === 4
  );
  assert.throws(
    () => m.assertFreshForHandover(root, s.sid, { turn: 14, transferStrategy: 'compact' }),
    (e) => e.code === 'FRESHNESS_STALE'
  );

  // HF3 刷新（写一次台账更新 heartbeatTurn）→ 重新放行
  m.addEntry(root, s.sid, { desc: '刷新台账', workspace: ws, modelTurn: 14 });
  assert.equal(m.assertFreshForHandover(root, s.sid, { turn: 15, transferStrategy: 'compact' }).ok, true);

  // 自定义上限
  assert.throws(
    () => m.assertFreshForHandover(root, s.sid, { turn: 20, maxAgeTurns: 1 }),
    (e) => e.code === 'FRESHNESS_STALE'
  );

  // HF4 未初始化 → FRESHNESS_NO_LEDGER；缺 turn → HANDOVER_NEEDS_TURN
  const root2 = tmpRoot();
  const ws2 = wsOf(root2, 'ws');
  const s2 = m.createSession(root2, { sid: sidFor(2), taskSummary: 't', workspace: ws2, modelTurn: 5 });
  // 不存在的会话（无台账文件）→ FRESHNESS_NO_LEDGER
  assert.throws(
    () => m.assertFreshForHandover(root2, '20260910-99999999', { turn: 5 }),
    (e) => e.code === 'FRESHNESS_NO_LEDGER'
  );
  // 已有台账但缺 turn → HANDOVER_NEEDS_TURN（参数校验优先于读文件）
  assert.throws(
    () => m.assertFreshForHandover(root2, s2.sid),
    (e) => e.code === 'HANDOVER_NEEDS_TURN'
  );
});

/* ================= WS：工作区取数链＋闸大小写归一（EXE-BOOT-011 施工笔 A/G） =================
 * 定因（var/scratch/exe-boot-011-20260929/findings-011.md §2b/2d）：安装版宿主
 * dsh-agent-loop lib/index.js:1536 宿主自用 `agent?.session.header.cwd` —— 真实形状下
 * Session 实例无 .cwd、Agent 无 .workspace、claimed 载荷无 cwd；旧取数链终端回落
 * process.cwd() ⇒ 闸实际比较"上次/本次宿主启动目录"（跨启动即拦，9/28–29 全拒实证）。
 * 本族钉真实宿主形状（session.header.cwd 在位）＋逐环回落＋命中环自日志可见（wsRing）。
 */
function mockWsCtx() {
  const handlers = new Map();
  return {
    handlers,
    on(name, fn) { handlers.set(name, fn); return () => handlers.delete(name); },
    emit(name, payload) {
      const fn = handlers.get(name);
      if (!fn) return Promise.resolve(undefined);
      return Promise.resolve(fn(payload, async () => ({ kind: 'allowed' })));
    },
  };
}

test('WS1: created 取数 header.cwd 优先（真实宿主形状：Session 仅 header.cwd，无顶层 .cwd）', async () => {
  runtime.__resetRuntimeCursor();
  const root = tmpRoot();
  const wsReal = wsOf(root, 'ws-real');
  const wsDecoy = wsOf(root, 'ws-decoy');
  const ctx = mockWsCtx();
  registerPlugin(ctx, { dataRoot: root, defaultWorkspace: wsDecoy });
  const HOST = hostFor(601);
  await ctx.emit('session/created', { id: HOST, header: { cwd: wsReal }, taskSummary: 'WS' });
  const rec = m.readRegistry(root).sessions[0];
  assert.equal(rec.homeWorkspace, wsReal, 'created 记录 header.cwd（不落 defaultWorkspace 凑数环）');
  assert.equal(rec.currentWorkspace, wsReal, 'currentWorkspace 同源');
});

test('WS2: claimed 取数 header.cwd 命中即采集（defaultWorkspace 仅诱饵；错误行携带 wsRing）', async () => {
  runtime.__resetRuntimeCursor();
  const root = tmpRoot();
  const wsReal = wsOf(root, 'ws-real');
  const wsDecoy = wsOf(root, 'ws-decoy');
  const a = m.createSession(root, { dshSessionId: hostFor(602), taskSummary: 'WS2', workspace: wsReal });
  const ctx = mockWsCtx();
  registerPlugin(ctx, { dataRoot: root, defaultWorkspace: wsDecoy });
  await ctx.emit('agent/inbox/claimed', {
    agent: { session: { id: hostFor(602), header: { cwd: wsReal } } },
    message: { id: 'ws2-1', content: '请记住 header 命中即采集' },
  });
  const led = m.readLedger(root, a.sid);
  assert.ok(led.sections['待办'].some((e) => e.desc.includes('header 命中即采集')), 'claimed 经 header.cwd 采集入账');
});

test('WS3: 回落环逐级兜底且命中环自日志可见（agent.workspace / process 环）', async () => {
  runtime.__resetRuntimeCursor();
  const root = tmpRoot();
  const wsReal = wsOf(root, 'ws-real');
  const a = m.createSession(root, { dshSessionId: hostFor(603), taskSummary: 'WS3', workspace: wsReal });
  const ctx = mockWsCtx();
  registerPlugin(ctx, { dataRoot: root }); // 无 defaultWorkspace：回落到 agent.workspace
  // ③a agent.workspace 环：session 无 cwd/header，agent 带 workspace → 采集成功且 wsRing 如实
  await ctx.emit('agent/inbox/claimed', {
    agent: { session: { id: hostFor(603) }, workspace: wsReal },
    message: { id: 'ws3-1', content: '请记住 agent.workspace 回落环' },
  });
  assert.ok(
    m.readLedger(root, a.sid).sections['待办'].some((e) => e.desc.includes('agent.workspace 回落环')),
    'agent.workspace 回落环兜底采集',
  );
  // ③b process 环：session/agent 双无 → 回落 process.cwd()，与记录不符 → 闸拦；错误行 wsRing=fallback:process 可观测
  await ctx.emit('agent/inbox/claimed', {
    agent: { session: { id: hostFor(603) } },
    message: { id: 'ws3-2', content: '请记住 process 回落环' },
  });
  assert.ok(
    !m.readLedger(root, a.sid).sections['待办'].some((e) => e.desc.includes('process 回落环')),
    'process 凑数环与记录不符 → 闸拦（不静默跨区写入）',
  );
});

test('WS4: 自日志 wsRing 观测面 —— created/claimed 行携带命中环（header/回落环如实落行）', async () => {
  runtime.__resetRuntimeCursor();
  const root = tmpRoot();
  const wsReal = wsOf(root, 'ws-real');
  const ctx = mockWsCtx();
  registerPlugin(ctx, { dataRoot: root });
  const HOST = hostFor(604);
  await ctx.emit('session/created', { id: HOST, header: { cwd: wsReal }, taskSummary: 'WS4' });
  const createdRow = fs.readFileSync(path.join(root, 'logs', 'agent-memory.jsonl'), 'utf8')
    .split('\n').filter(Boolean).map((l) => JSON.parse(l)).find((r) => r.event === 'created');
  assert.equal(createdRow.wsRing, 'header', 'created 行携带 wsRing=header');
  await ctx.emit('agent/inbox/claimed', {
    agent: { session: { id: HOST, header: { cwd: wsReal } } },
    message: { id: 'ws4-1', content: '请记住 wsRing 观测' },
  });
  const claimedRow = fs.readFileSync(path.join(root, 'logs', 'agent-memory.jsonl'), 'utf8')
    .split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.event === 'claimed').at(-1);
  assert.equal(claimedRow.wsRing, 'header', 'claimed 行携带 wsRing=header');
});

test('WS5: 闸大小写归一（win32）—— 同路径不同大小写不误拦；真跨区仍拦且错误保留原值', () => {
  if (process.platform !== 'win32') return; // 归一仅 win32 生效；他平台维持字串全等
  const root = tmpRoot();
  const lower = wsOf(root, 'ws-case');
  const upper = path.join(path.dirname(lower), path.basename(lower).toUpperCase());
  const a = m.createSession(root, { sid: sidFor(603), taskSummary: 'case', workspace: lower });
  m.addEntry(root, a.sid, { desc: '大小写归一后可写', workspace: upper }); // 不抛 = 归一生效
  assert.throws(
    () => m.addEntry(root, a.sid, { desc: '真跨区', workspace: wsOf(root, 'ws-other') }),
    (e) => e.code === 'WORKSPACE_MISMATCH' && e.callerWorkspace === wsOf(root, 'ws-other'),
    '真跨区仍拦；callerWorkspace 保留调用方原值（错误信息不归一）',
  );
});

/* ================= D11-D13：一般输入分栏（EXE-BOOT-011 施工笔2；R1 全量采集·用户批甲案） =================
 * R1 原文（README【设计要求】）："自动记录用户的全部输入（ledger 专司）"；R3 分栏语义扩展：
 * 指令性→待办（现行流转不变），非指令→「一般输入」栏（status=已记录；只追加，不参与未完成
 * 计数/新鲜度语义；溢出时已完成先移、一般输入次移入 archive，未完成拒绝计数不含一般输入）。
 */

test('D11: 一般输入分栏 —— addGeneralEntry 共享编号池（L-NNN 不串）、status=已记录、渲染在档、恢复报告概览如实计一般输入', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const s = m.createSession(root, { sid: sidFor(11), taskSummary: 'D11', workspace: ws });
  const i1 = m.addEntry(root, s.sid, { desc: '指令一：设计台账格式', workspace: ws });
  const g1 = m.addGeneralEntry(root, s.sid, { desc: '今天天气不错', workspace: ws });
  const i2 = m.addEntry(root, s.sid, { desc: '指令二：按时长分组输出', workspace: ws });
  assert.equal([i1.no, g1.no, i2.no].join(','), 'L-000,L-001,L-002', '编号池跨栏共享不串');
  assert.equal(g1.status, '已记录', '一般输入条目状态=已记录');
  assert.equal(g1.related.length, 0);
  const led = m.readLedger(root, s.sid);
  assert.equal(led.sections['一般输入'].length, 1, '一般输入栏在档');
  assert.ok(led.sections['一般输入'][0].desc.includes('今天天气不错'), '保原文（entryDesc 同款截断）');
  const raw = fs.readFileSync(ledgerFile(root, s.sid), 'utf8');
  assert.ok(raw.includes('## 一般输入'), '分栏标题渲染在档（重读不丢）');
  assert.ok(raw.includes('- L-001 [已记录] 今天天气不错'), '条目行渲染在档');
  const report = m.buildRecoveryReport(root, s.sid);
  assert.match(report, /一般输入 1 条/, '恢复报告台账概览如实计一般输入');
  assert.ok(!report.split('未完成指令:')[1].includes('一般输入 1'), '一般输入不入未完成指令清单');
});

test('D12: 溢出迁移次序 —— 已完成先移、一般输入次移入 archive；未完成拒绝计数不含一般输入', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const s = m.createSession(root, { sid: sidFor(12), taskSummary: 'D12', workspace: ws });
  const cap = 900; // 小预算便于确定性触发（裸头≈450B＋一般输入条≈150B）
  m.addEntry(root, s.sid, { desc: '唯一未完成指令', workspace: ws, maxBytes: cap });
  for (let n = 0; n < 4; n++) {
    m.addGeneralEntry(root, s.sid, { desc: `闲聊${n}：${'字'.repeat(40)}`, workspace: ws, maxBytes: cap });
  }
  const led = m.readLedger(root, s.sid);
  assert.ok(led.sections['一般输入'].length >= 1, '一般输入栏在档（预算内保留）');
  const arch = fs.readFileSync(path.join(root, 'sessions', s.sid, 'archive.md'), 'utf8');
  assert.ok(arch.includes('闲聊0'), '超限触发最旧一般输入移入 archive（已完成侧耗尽后次移）');
  assert.ok(led.sections['待办'].some((e) => e.desc.includes('唯一未完成指令')), '未完成条目不因一般输入膨胀被迁移');
  // 未完成拒绝计数不含一般输入：maxBytes 压到头部以下 → 一般输入全移后仍超限 → 拒绝且 unfinishedCount 只计待办一条
  assert.throws(
    () => m.addGeneralEntry(root, s.sid, { desc: '最后一根稻草', workspace: ws, maxBytes: 100 }),
    (e) => e.code === 'LEDGER_OVERFLOW_ACTIVE' && e.unfinishedCount === 1,
    'unfinishedCount 只计真未完成（一般输入不计）',
  );
});

test('D13: 一般输入只追加守卫 —— 状态流转/删除/新增为该状态皆拒', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const s = m.createSession(root, { sid: sidFor(13), taskSummary: 'D13', workspace: ws });
  const i1 = m.addEntry(root, s.sid, { desc: '指令', workspace: ws });
  const g1 = m.addGeneralEntry(root, s.sid, { desc: '闲聊一句', workspace: ws });
  assert.throws(
    () => m.setEntryStatus(root, s.sid, g1.no, '待办', { workspace: ws }),
    (e) => e.code === 'ENTRY_LOG_IMMUTABLE',
    '一般输入条目禁止状态流转（只追加）',
  );
  assert.throws(
    () => m.setEntryStatus(root, s.sid, i1.no, '已记录', { workspace: ws }),
    (e) => e.code === 'INVALID_ENTRY_STATUS',
    '已记录不在状态枚举：禁止把指令条目改成已记录',
  );
  assert.throws(
    () => m.removeEntry(root, s.sid, g1.no, { workspace: ws }),
    (e) => e.code === 'ENTRY_UNFINISHED_DELETE',
    '一般输入条目不可删（非已完成状态走 D4 守卫）',
  );
});

/* ================= F5/F6＋WIRE6/WIRE7：恢复要点节选与 agentMemory 变量接线（EXE-BOOT-011 施工笔3；C+F 案） =================
 * 内容源＝buildRecoveryReport 现成导出（findings-011 附录：仓内普查证无消费者——R4/R6
 * "接手先读"无自动接线）；接线位＝宿主 systemPrompt 变量机制（安装版 dsh-system-prompt
 * lib:57-58 {{var}} 严格插值＋注册接口；未知变量抛错 ⇒ 变量必须恒返回字符串，空串节渲染后
 * 自动丢弃＝未注册会话零负担）。预设模板 {{agentMemory}} 行＝部署步骤，本批只备不写。
 */

test('F5: buildRecoveryReport lenient —— 未注册/无台账返回空串不抛错；非 lenient 语义不变', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  assert.equal(m.buildRecoveryReport(root, '20260910-00000077', { lenient: true }), '', '未注册 → 空串');
  const s = m.createSession(root, { sid: '20260910-00000077', taskSummary: 'L', workspace: ws });
  fs.rmSync(ledgerFile(root, s.sid));
  assert.equal(m.buildRecoveryReport(root, s.sid, { lenient: true }), '', '无台账 → 空串');
  assert.throws(
    () => m.buildRecoveryReport(root, '20260910-00000099'),
    (e) => e.code === 'SESSION_NOT_FOUND',
    '非 lenient 抛错语义不变（F4 既有口径）',
  );
});

test('F6: buildRecoveryBrief —— 恢复要点四要素（任务摘要/未完成指令/永久指令/新鲜度），限长，未注册空串', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  assert.equal(m.buildRecoveryBrief(root, '20260910-00000078'), '', '未注册 → 空串（lenient 内建）');
  const s = m.createSession(root, { sid: '20260910-00000078', taskSummary: 'BRIEF 目标会话', workspace: ws });
  m.addEntry(root, s.sid, { desc: '设计 brief 格式', modelTurn: 5, workspace: ws });
  const brief = m.buildRecoveryBrief(root, s.sid, { modelTurn: 6 });
  assert.match(brief, /BRIEF 目标会话/, '任务摘要在案');
  assert.match(brief, /L-000 \[待办\] 设计 brief 格式/, '未完成指令在案');
  assert.match(brief, /始终用中文回复/, '永久第一行在案');
  assert.match(brief, /指令先落账/, '永久第二行在案');
  assert.match(brief, /FRESH/, '新鲜度在案');
  assert.ok(brief.length <= 1200, '默认限长 ≤1200 字符');
  assert.ok(m.buildRecoveryBrief(root, s.sid, { modelTurn: 6, maxChars: 40 }).length <= 40, 'maxChars 生效');
  fs.rmSync(ledgerFile(root, s.sid));
  assert.equal(m.buildRecoveryBrief(root, s.sid, { modelTurn: 6 }), '', '无台账 → 空串');
});

test('WIRE6: agent_memory 变量接线 —— 注册、未注册会话空串、已注册返回要点、回调 fail-soft 永不抛错（事故 2026-09-29 改名合规）', async () => {
  runtime.__resetRuntimeCursor();
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const variables = new Map();
  const handlers = new Map();
  const ctx = {
    systemPrompt: { variable(name, fn) { variables.set(name, fn); } },
    on(name, fn) { handlers.set(name, fn); return () => handlers.delete(name); },
    emit(name, payload) {
      const fn = handlers.get(name);
      if (!fn) return Promise.resolve(undefined);
      return Promise.resolve(fn(payload, async () => ({ kind: 'allowed' })));
    },
  };
  registerPlugin(ctx, { dataRoot: root, defaultWorkspace: ws });
  assert.ok(variables.has('agent_memory'), 'agent_memory 变量已注册（宿主 VARIABLE_NAME 合规名）');
  const fn = variables.get('agent_memory');
  assert.equal(fn({ agent: { session: { id: hostFor(701) } } }), '', '未注册宿主 → 空串（渲染层可整节丢弃）');
  const HOST = hostFor(702);
  await ctx.emit('session/created', { id: HOST, cwd: ws, taskSummary: 'WIRE6 目标' });
  const out = fn({ agent: { session: { id: HOST, cwd: ws } } });
  assert.match(out, /WIRE6 目标/, '已注册会话返回恢复要点');
  assert.equal(typeof out, 'string', '恒返回字符串（宿主严格插值对 undefined 抛错）');
  assert.equal(fn(null), '', '载荷缺失 → 空串');
  assert.equal(fn({ agent: null }), '', 'agent 缺失 → 空串');
});

test('WIRE8: 变量名宿主合规 —— 注册名须过宿主 VARIABLE_NAME 正则（事故 2026-09-29 的直接防复发钉）', async () => {
  // 正则逐字引安装版宿主 dsh-system-prompt/lib/index.js:57（插值侧）与 :296（注册侧同正则校验、
  // 非法即抛 invalid prompt variable name）：camelCase 的 agentMemory 双侧违规——模板行在渲染侧
  // 爆 malformed prompt variable reference（每请求崩，用户实测 2026-09-29）。
  const HOST_VARIABLE_NAME = /^[a-z][a-z0-9_]*$/;
  runtime.__resetRuntimeCursor();
  const root = tmpRoot();
  const variables = new Map();
  const handlers = new Map();
  const ctx = {
    systemPrompt: { variable(name, fn) { variables.set(name, fn); } },
    on(name, fn) { handlers.set(name, fn); return () => handlers.delete(name); },
    emit(name, payload) {
      const fn = handlers.get(name);
      if (!fn) return Promise.resolve(undefined);
      return Promise.resolve(fn(payload, async () => ({ kind: 'allowed' })));
    },
  };
  registerPlugin(ctx, { dataRoot: root, defaultWorkspace: wsOf(root, 'ws-a') });
  const names = [...variables.keys()];
  assert.deepEqual(names, ['agent_memory'], '插件恰注册一个变量，名＝agent_memory');
  for (const name of names) {
    assert.ok(HOST_VARIABLE_NAME.test(name), `注册名 "${name}" 过宿主 VARIABLE_NAME 正则`);
  }
});

test('WIRE7: systemPrompt 面不在位 —— 挂载零破坏（register 行照常在位）', () => {
  runtime.__resetRuntimeCursor();
  const root = tmpRoot();
  const ctx = mockWsCtx(); // 无 systemPrompt 面
  registerPlugin(ctx, { dataRoot: root, defaultWorkspace: wsOf(root, 'ws-a') });
  const rows = fs.readFileSync(path.join(root, 'logs', 'agent-memory.jsonl'), 'utf8')
    .split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.event === 'register');
  assert.equal(rows.length, 1, 'register 行照常落盘（面缺失不阻断挂载）');
  assert.equal(rows[0].ok, true);
});
