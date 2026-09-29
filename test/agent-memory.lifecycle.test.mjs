/**
 * @local/dsh-toolkit（agent-memory）— 生命周期整轮钉（EXE-BOOT-009 开工令 3，素材建议①）
 *
 * 定位：以**公开 API**（createSession / addEntry / setEntryStatus / appendMilestone /
 * updateStatus(已移交) / onSessionDisposed）在临时数据根驱动整轮生命周期，断言
 * registry / ledger / progress 三面文件与会话状态机（流转 / 新鲜度 / 锁清理）的
 * **集成不变式**——补的是"链路上"的钉，不是分片矩阵的重复：
 *   - 结构/编号/折叠/承接/溢出/历史不可改 → 归 agent-memory.test.mjs A1/D1-D10（不重）；
 *   - 移交矩阵（旧拒新可、工作区一致性、HANDOVER_NOT_CONFIRMED）→ B1-B6/W1-W2（不重）；
 *   - 新鲜度矩阵（G1-G5 纯头判据 / HF1-HF4 交接门）→ 本文件只在整轮链上取检查点；
 *   - 锁行为（拿锁/释放/残留清理）→ L1-L5；本文件只断言"每段操作后锁零残留"。
 * 隔离：全部显式传临时 root（os.tmpdir 下 mkdtemp），生产根 ~/.dsh 零触碰；
 *       事故护栏同族——tmpRoot 解析出生产根立即中止（fail-closed）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as m from '../lib/agent-memory/lib/index.js';
import * as runtime from '../lib/agent-memory/lib/runtime.js';
import { register as registerPlugin } from '../lib/agent-memory/plugin.js';
import { assertUtcIso } from '../lib/agent-memory/lib/time.js';
import { PRODUCTION_ROOT } from '../lib/agent-memory/lib/script-guard.js';

function tmpRoot() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-memory-lifecycle-'));
  if (path.resolve(d) === PRODUCTION_ROOT) {
    console.error('[护栏] tmpRoot 解析出生产根，中止');
    process.exit(3);
  }
  return d;
}
function wsOf(root, name = 'ws') {
  const d = path.join(root, name);
  fs.mkdirSync(d, { recursive: true });
  return path.resolve(d);
}
/** 显式 sid（YYYYMMDD-小写字母数字8-12位；"lc"前缀避免与既有夹具编号空间相撞） */
function lcSid(n) {
  return `20260927-lc${String(n).padStart(6, '0')}`;
}
function hostFor(n) {
  const p = String(n).padStart(12, '0');
  return `${p.slice(0, 8)}-${p.slice(8, 12)}-4111-8000-000000000000`;
}
function registryOf(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'registry.json'), 'utf8'));
}
function ledgerRaw(root, sid) {
  return fs.readFileSync(path.join(root, 'sessions', sid, 'ledger.md'), 'utf8');
}
function progressRaw(root, sid) {
  return fs.readFileSync(path.join(root, 'sessions', sid, 'progress.md'), 'utf8');
}
/** 锁零残留：.locks 目录不存在，或存在但为空（每个锁目录用毕即删） */
function assertNoLockResidue(root, label) {
  const locks = path.join(root, '.locks');
  const n = fs.existsSync(locks) ? fs.readdirSync(locks).length : 0;
  assert.equal(n, 0, `[${label}] 锁残留应为零（.locks 内无条目）`);
}

test('LC1: 整轮生命周期·写入半环 —— create→addEntry×2→setEntryStatus 流转→appendMilestone→新鲜度门（文件×3＋锁清理逐段断言）', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const t0 = new Date('2026-09-27T08:00:00Z');
  const t1 = new Date('2026-09-27T08:01:00Z');
  const t2 = new Date('2026-09-27T08:02:00Z');
  const t3 = new Date('2026-09-27T08:03:00Z');
  const t4 = new Date('2026-09-27T08:04:00Z');

  // ---- 段1 create：registry 条目＋三会话文件＋头部字段 ----
  const s = m.createSession(root, {
    sid: lcSid(1), dshSessionId: hostFor(1), taskSummary: '整轮生命周期', workspace: ws, modelTurn: 10, now: t0,
  });
  assert.equal(s.sid, lcSid(1));
  assert.equal(s.status, '活跃');
  assert.equal(s.homeWorkspace, ws);
  assert.equal(s.currentWorkspace, ws);
  assert.equal(s.handedOverTo, null);
  assertUtcIso(s.createdAt);
  const reg1 = registryOf(root);
  const rec1 = reg1.sessions.find((x) => x.sid === s.sid);
  assert.ok(rec1, 'registry.json 应有本会话条目');
  assert.equal(rec1.status, '活跃');
  for (const f of ['ledger.md', 'progress.md', 'archive.md']) {
    assert.ok(fs.existsSync(path.join(root, 'sessions', s.sid, f)), f + ' 应存在');
  }
  const h1 = m.readHeader(root, s.sid);
  assert.equal(h1.status, '活跃');
  assert.equal(h1.heartbeatTurn, 10, 'createSession 的 modelTurn 应固化进台账头部');
  assert.ok(progressRaw(root, s.sid).length > 0);
  assertNoLockResidue(root, '段1 create 后');

  // ---- 段2 addEntry×2：编号顺延＋心跳推进 lastActiveAt＋heartbeatTurn 随写推进 ----
  const e1 = m.addEntry(root, s.sid, { desc: '第一步：落账条目', workspace: ws, modelTurn: 11, now: t1 });
  const e2 = m.addEntry(root, s.sid, { desc: '第二步：验收证据', workspace: ws, modelTurn: 11, now: t1 });
  assert.equal(e1.no, 'L-000');
  assert.equal(e2.no, 'L-001');
  assert.equal(e1.status, '待办');
  const raw2 = ledgerRaw(root, s.sid);
  assert.ok(raw2.includes('第一步：落账条目') && raw2.includes('第二步：验收证据'), '两条 desc 应入台账正文');
  assert.equal(m.readHeader(root, s.sid).heartbeatTurn, 11, '台账写入应推进 heartbeatTurn（新鲜度数据源）');
  const rec2 = registryOf(root).sessions.find((x) => x.sid === s.sid);
  assert.ok(rec2.lastActiveAt > rec2.createdAt, '写入后心跳应推进 lastActiveAt');
  assertUtcIso(rec2.lastActiveAt);
  assertNoLockResidue(root, '段2 addEntry 后');

  // ---- 段3 setEntryStatus：条目状态机流转（待办→进行中→已完成） ----
  m.setEntryStatus(root, s.sid, 'L-000', '进行中', { workspace: ws, modelTurn: 12, now: t2 });
  const rawMid = ledgerRaw(root, s.sid);
  assert.ok(rawMid.includes('[进行中]'), 'L-1 应入进行中区');
  m.setEntryStatus(root, s.sid, 'L-000', '已完成', { workspace: ws, modelTurn: 12, now: t2 });
  const raw3 = ledgerRaw(root, s.sid);
  assert.ok(raw3.includes('[已完成]'), 'L-1 应入已完成区（折叠）');
  assert.ok(raw3.includes('[待办]'), 'L-2 应仍在待办区');
  assert.equal(m.readHeader(root, s.sid).heartbeatTurn, 12);
  assertNoLockResidue(root, '段3 setEntryStatus 后');

  // ---- 段4 appendMilestone：进度文件写入；台账心跳数据源不被里程碑推进 ----
  m.appendMilestone(root, s.sid, {
    completedSteps: ['落账与流转'], currentStatus: '验证中', nextSteps: '移交后销毁',
    keyDecisions: '整轮只走公开 API', files: [], workspace: ws, now: t3,
  });
  const p4 = progressRaw(root, s.sid);
  assert.ok(p4.includes('验证中') && p4.includes('移交后销毁') && p4.includes('整轮只走公开 API'), '里程碑四要素应入进度文件');
  assert.equal(m.readHeader(root, s.sid).heartbeatTurn, 12, '里程碑只写进度文件，不推进台账 heartbeatTurn（新鲜度判据语义）');
  assertNoLockResidue(root, '段4 appendMilestone 后');

  // ---- 段5 新鲜度门（整轮链上的交接检查点；矩阵归 G1-G5/HF1-HF4） ----
  assert.equal(m.assertFreshForHandover(root, s.sid, { turn: 15 }).ok, true, '15−12=3 ≤ 上限 → 新鲜放行');
  assert.throws(
    () => m.assertFreshForHandover(root, s.sid, { turn: 16 }),
    (e) => e.code === 'FRESHNESS_STALE' && e.turns === 4,
    '16−12=4 > 上限 → fail-closed',
  );
  m.addEntry(root, s.sid, { desc: '刷新台账以通过门禁', workspace: ws, modelTurn: 16, now: t4 });
  assert.equal(m.assertFreshForHandover(root, s.sid, { turn: 16 }).ok, true, '写一次台账（heartbeatTurn→16）后重新放行');
  assertNoLockResidue(root, '段5 新鲜度门后');
});

test('LC2: 整轮生命周期·流转收尾半环 —— 移交（旧拒新可＋台账头部同步）→ dispose（活跃→已完成）→ 终态三面对账＋锁零残留', () => {
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-b');
  const t0 = new Date('2026-09-27T09:00:00Z');
  const t1 = new Date('2026-09-27T09:01:00Z');
  const t2 = new Date('2026-09-27T09:02:00Z');
  const t3 = new Date('2026-09-27T09:03:00Z');

  // ---- 前置：在册会话 A（带条目与里程碑）＋继任会话 B ----
  const a = m.createSession(root, { sid: lcSid(11), dshSessionId: hostFor(11), taskSummary: '移交方', workspace: ws, modelTurn: 20, now: t0 });
  const b = m.createSession(root, { sid: lcSid(12), dshSessionId: hostFor(12), taskSummary: '继任方', workspace: ws, modelTurn: 20, now: t0 });
  m.addEntry(root, a.sid, { desc: '移交前落账', workspace: ws, modelTurn: 20, now: t1 });
  m.appendMilestone(root, a.sid, { currentStatus: '移交前状态', nextSteps: '交接', workspace: ws, now: t1 });

  // ---- 段1 移交：活跃→已移交（handedOverTo 必填）＋台账头部同步 ----
  m.updateStatus(root, a.sid, '已移交', { handedOverTo: b.sid, now: t2 });
  const ra = registryOf(root).sessions.find((x) => x.sid === a.sid);
  assert.equal(ra.status, '已移交');
  assert.equal(ra.handedOverTo, b.sid);
  assert.equal(m.readHeader(root, a.sid).status, '已移交', '台账头部 status 应随 registry 迁移同步');
  assert.throws(
    () => m.addEntry(root, a.sid, { desc: '移交后偷写', workspace: ws, now: t2 }),
    (e) => e.code === 'WRITE_FORBIDDEN',
    '已移交会话禁止写入',
  );
  const bEntry = m.addEntry(root, b.sid, { desc: '继任方接续落账', workspace: ws, modelTurn: 20, now: t2 });
  assert.equal(bEntry.no, 'L-000', '继任会话可写且编号自起');
  assert.ok(ledgerRaw(root, a.sid).includes('移交前落账'), '移交后方历史文件零变化（只追加语义不被状态迁移破坏）');
  assert.ok(progressRaw(root, a.sid).includes('移交前状态'), '移交方进度文件不受状态迁移影响');
  assertNoLockResidue(root, '段1 移交后');

  // ---- 段2 dispose：销毁钩子把活跃继任会话流转为已完成 ----
  const d = runtime.onSessionDisposed({ root, sid: b.sid, now: t3 });
  assert.equal(d.disposed, true);
  assert.equal(d.status, '已完成');
  assert.equal(d.sid, b.sid);
  const rb = registryOf(root).sessions.find((x) => x.sid === b.sid);
  assert.equal(rb.status, '已完成');
  assert.equal(m.readHeader(root, b.sid).status, '已完成', '台账头部 status 应随 dispose 同步');
  assert.throws(
    () => m.addEntry(root, b.sid, { desc: '销毁后偷写', workspace: ws, now: t3 }),
    (e) => e.code === 'WRITE_FORBIDDEN',
    '已完成会话禁止写入',
  );
  assertNoLockResidue(root, '段2 dispose 后');

  // ---- 段3 终态三面对账：registry 状态机终态 × 台账 × 进度互证 ----
  const regEnd = registryOf(root);
  assert.equal(regEnd.sessions.length, 2, '两条会话记录俱在');
  const raEnd = regEnd.sessions.find((x) => x.sid === a.sid);
  const rbEnd = regEnd.sessions.find((x) => x.sid === b.sid);
  assert.equal(raEnd.status, '已移交');
  assert.equal(raEnd.handedOverTo, b.sid, '移交链指向继任');
  assert.equal(rbEnd.status, '已完成');
  assert.ok(ledgerRaw(root, a.sid).includes('[待办]'), '移交方条目历史仍在（不因状态终态被改写）');
  assert.ok(ledgerRaw(root, b.sid).includes('继任方接续落账'), '继任方台账正文仍在');
  assertNoLockResidue(root, '整轮结束后');
});

/* ================= LC3（EXE-BOOT-011 施工笔 A）：跨实例 resume =================
 * 真实病灶（var/scratch/exe-boot-011-20260929/findings-011.md §2d）：会话注册于启动
 * 目录 X 的宿主进程；重启后宿主自目录 Y 启动 resume 同一会话 —— 旧取数链两侧都回落
 * process.cwd()（X≠Y）⇒ 闸全拦、零入账（9/28–29 自日志 3× WORKSPACE_MISMATCH 实证）。
 * 修后取数链读 session.header.cwd（同会话同源）⇒ 跨实例 claimed 仍入账；真跨工作区仍拦。
 */
test('LC3: 跨实例 resume —— 两启＋启动目录变更，同会话 claimed 仍入账（真跨区仍拦）', async () => {
  runtime.__resetRuntimeCursor();
  const root = tmpRoot();
  const wsReal = wsOf(root, 'ws-lc3');
  const decoy = wsOf(root, 'ws-lc3-decoy');
  const HOST = hostFor(3);
  const mockCtx = () => {
    const handlers = new Map();
    return {
      on(name, fn) { handlers.set(name, fn); return () => handlers.delete(name); },
      emit(name, payload) {
        const fn = handlers.get(name);
        if (!fn) return Promise.resolve(undefined);
        return Promise.resolve(fn(payload, async () => ({ kind: 'allowed' })));
      },
    };
  };
  // 启动 1：created（真实形状：Session 仅 header.cwd；defaultWorkspace 是凑数诱饵）→ 注册
  const ctx1 = mockCtx();
  registerPlugin(ctx1, { dataRoot: root, defaultWorkspace: decoy });
  await ctx1.emit('session/created', { id: HOST, header: { cwd: wsReal }, taskSummary: 'LC3' });
  const sid = registryOf(root).sessions[0].sid;
  assert.equal(m.getSession(root, sid).homeWorkspace, wsReal, '启动1 记录 header.cwd');
  // 启动 2：游标清空＋新挂载实例（不同宿主进程模拟）→ 同会话 claimed 仅 header.cwd
  runtime.__resetRuntimeCursor();
  const ctx2 = mockCtx();
  registerPlugin(ctx2, { dataRoot: root, defaultWorkspace: decoy });
  await ctx2.emit('agent/inbox/claimed', {
    agent: { session: { id: HOST, header: { cwd: wsReal } } },
    message: { id: 'lc3-1', content: '请记住跨实例续写' },
  });
  assert.ok(
    m.readLedger(root, sid).sections['待办'].some((e) => e.desc.includes('跨实例续写')),
    '跨实例 claimed 入账（collected）——启动目录变更不再拦同会话',
  );
  // 反向：真跨工作区（header.cwd 换他区）→ 闸照拦（归一不放宽）
  await ctx2.emit('agent/inbox/claimed', {
    agent: { session: { id: HOST, header: { cwd: wsOf(root, 'ws-other') } } },
    message: { id: 'lc3-2', content: '请记住他区消息' },
  });
  assert.ok(
    !m.readLedger(root, sid).sections['待办'].some((e) => e.desc.includes('他区消息')),
    '真跨工作区 claimed 仍被拦',
  );
  assertNoLockResidue(root, 'LC3 结束后');
});
