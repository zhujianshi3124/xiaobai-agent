/**
 * agent-memory 自日志钉（EXE-BOOT-010 开工令 1）—— <dataRoot>/logs/agent-memory.jsonl 五事件行。
 *
 * 双向钉：正向＝经插件入口（mock ctx）驱动各事件 → 对应行在场且字段正确（register/created/
 * claimed/pre-step/disposed，sid 解析成败＋原因码）；反向＝节流窗内不重复落行（缺席断言）、
 * 落盘失败不炸调用方（written:false + 开发通道 warning）。
 *
 * 静态钉锚共振：register 行 events 名单 ↔ dsh.plugin.json registers.events 逐名相等。
 *
 * 隔离：全部 mkdtemp 临时 root（对齐家族生产根护栏），生产根零触碰。
 * 修前红口径：selflog.js 本体在场、plugin.js 接线未动 ⇒ 插件驱动面红、单元面绿。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { register as registerPlugin } from '../lib/agent-memory/plugin.js';
import * as runtime from '../lib/agent-memory/lib/runtime.js';
import {
  selflogPath, appendSelflog, logHeartbeat, __resetSelflogCursor, SELFLOG_MAX_BYTES,
} from '../lib/agent-memory/lib/selflog.js';
import { assertUtcIso } from '../lib/agent-memory/lib/time.js';
import { PRODUCTION_ROOT } from '../lib/agent-memory/lib/script-guard.js';

const SID_RE = /^\d{8}-[a-z0-9]{8,12}$/;

function tmpRoot() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-memory-selflog-'));
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
function hostFor(n) {
  const p = String(n).padStart(12, '0');
  return `${p.slice(0, 8)}-${p.slice(8, 12)}-4111-8000-000000000000`;
}
/** 读自日志全部行（JSON 解析；空/缺文件 → []）。 */
function linesOf(root) {
  const file = selflogPath(root);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}
function linesOfEvent(root, event) {
  return linesOf(root).filter((r) => r.event === event);
}
/** 最小 mock emitter（对齐家族 PLUGIN 测试挂具）。 */
function mockCtx() {
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
function assertNoTextLeak(line, needle) {
  assert.ok(!('text' in line), '自日志行不得携带消息正文字段');
  assert.ok(!JSON.stringify(line).includes(needle), '自日志行不得携带消息正文内容');
}

test('SELFLOG-R: register 行在位自证 —— 挂载即落一行（ok/events/dataRoot），事件名单与 manifest 共振', () => {
  runtime.__resetRuntimeCursor();
  __resetSelflogCursor();
  const root = tmpRoot();
  const ctx = mockCtx();
  registerPlugin(ctx, { dataRoot: root, defaultWorkspace: wsOf(root, 'ws-a') });
  const rows = linesOfEvent(root, 'register');
  assert.equal(rows.length, 1, 'register 恰一行');
  const row = rows[0];
  assert.equal(row.ok, true, '在位自证=成功');
  assert.equal(row.dataRoot, path.resolve(root));
  assertUtcIso(row.ts);
  assert.ok(Number.isInteger(row.pid), '行携带 pid');
  const manifest = JSON.parse(fs.readFileSync(
    new URL('../lib/agent-memory/dsh.plugin.json', import.meta.url), 'utf8'));
  assert.deepEqual(row.events, manifest.requirements.registers.events,
    'register 行事件名单与 manifest registers.events 逐名相等（静态钉锚共振）');
});

test('SELFLOG-R2: register 失败行 —— 挂载中途抛错 ⇒ ok:false 行落盘且异常照传（成败各落一行）', () => {
  runtime.__resetRuntimeCursor();
  __resetSelflogCursor();
  const root = tmpRoot();
  const throwingCtx = {
    on(name) {
      if (name === 'agent/pre-step') throw Object.assign(new Error('boom'), { code: 'MOUNT_BOOM' });
    },
  };
  assert.throws(() => registerPlugin(throwingCtx, { dataRoot: root }), /boom/,
    '挂载异常语义零变化（照传调用方）');
  const rows = linesOfEvent(root, 'register');
  assert.equal(rows.length, 1, 'register 失败恰一行');
  assert.equal(rows[0].ok, false);
  assert.equal(rows[0].code, 'MOUNT_BOOM');
});

test('SELFLOG-C1: created 行 —— 注册成功（sid 已解析、outcome=created、无原因码）', async () => {
  runtime.__resetRuntimeCursor();
  __resetSelflogCursor();
  const root = tmpRoot();
  const ctx = mockCtx();
  registerPlugin(ctx, { dataRoot: root, defaultWorkspace: wsOf(root, 'ws-a') });
  const HOST = hostFor(101);
  await ctx.emit('session/created', { id: HOST, cwd: wsOf(root, 'ws-a'), taskSummary: '插件会话' });
  const rows = linesOfEvent(root, 'created');
  assert.equal(rows.length, 1, 'created 恰一行');
  assert.equal(rows[0].hostId, HOST);
  assert.match(rows[0].sid, SID_RE);
  assert.equal(rows[0].code, null);
  assert.equal(rows[0].outcome, 'created');
});

test('SELFLOG-C2: created 行 —— 未知宿主 id 拒绝入册（原因码 unknown-host-id）', async () => {
  runtime.__resetRuntimeCursor();
  __resetSelflogCursor();
  const root = tmpRoot();
  const ctx = mockCtx();
  registerPlugin(ctx, { dataRoot: root, defaultWorkspace: wsOf(root, 'ws-a') });
  await ctx.emit('session/created', { id: 'not-a-uuid', cwd: wsOf(root, 'ws-a'), taskSummary: 'x' });
  const rows = linesOfEvent(root, 'created');
  assert.equal(rows.length, 1, 'created 恰一行（拒绝入册也落观测行）');
  assert.equal(rows[0].sid, null);
  assert.equal(rows[0].code, 'unknown-host-id');
  assert.equal(rows[0].outcome, 'skipped');
});

test('SELFLOG-L1: claimed 行 —— 指令与非指令全量采集各自落行（kind 字段）；行内零消息正文（R1 施工笔 B）', async () => {
  runtime.__resetRuntimeCursor();
  __resetSelflogCursor();
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const ctx = mockCtx();
  registerPlugin(ctx, { dataRoot: root, defaultWorkspace: ws });
  const HOST = hostFor(102);
  await ctx.emit('session/created', { id: HOST, cwd: ws, taskSummary: '插件会话' });
  await ctx.emit('agent/inbox/claimed', {
    agent: { session: { id: HOST, cwd: ws } },
    message: { id: 'msg-1', content: '请把结果写入报告并提供链接' },
  });
  await ctx.emit('agent/inbox/claimed', {
    agent: { session: { id: HOST, cwd: ws } },
    message: { id: 'msg-2', content: '今天天气不错' },
  });
  const rows = linesOfEvent(root, 'claimed');
  assert.equal(rows.length, 2, 'claimed 两行（指令/非指令各一，全量采集）');
  const collected = rows.find((r) => r.messageId === 'msg-1');
  const general = rows.find((r) => r.messageId === 'msg-2');
  assert.ok(collected && general, '两行各自带 messageId');
  assert.equal(collected.outcome, 'collected');
  assert.equal(collected.kind, 'instruction');
  assert.equal(collected.code, null);
  assert.match(collected.sid, SID_RE);
  assert.equal(general.outcome, 'collected', 'R1：非指令亦入账');
  assert.equal(general.kind, 'general');
  for (const row of rows) assertNoTextLeak(row, '请把结果写入报告');
});

test('SELFLOG-L2: claimed 行 —— sid 未解析原因码（未入册宿主 → unresolved/skipped:no-sid）', async () => {
  runtime.__resetRuntimeCursor();
  __resetSelflogCursor();
  const root = tmpRoot();
  const ctx = mockCtx();
  registerPlugin(ctx, { dataRoot: root, defaultWorkspace: wsOf(root, 'ws-a') });
  await ctx.emit('agent/inbox/claimed', {
    agent: { session: { id: hostFor(999), cwd: wsOf(root, 'ws-a') } },
    message: { id: 'msg-9', content: '请务必记住这条规则' },
  });
  const rows = linesOfEvent(root, 'claimed');
  assert.equal(rows.length, 1, 'claimed 恰一行（sid 解析失败也落观测行）');
  assert.equal(rows[0].sid, null);
  assert.equal(rows[0].code, 'unresolved');
  assert.equal(rows[0].outcome, 'skipped:no-sid');
  assert.equal(rows[0].hostId, hostFor(999));
});

test('SELFLOG-P1: pre-step 行（插件级）—— 首步落行；同窗抑制不发（缺席断言）；结论翻变必写', async () => {
  runtime.__resetRuntimeCursor();
  __resetSelflogCursor();
  const root = tmpRoot();
  const ctx = mockCtx();
  registerPlugin(ctx, { dataRoot: root, defaultWorkspace: wsOf(root, 'ws-a') });
  const HOST = hostFor(103);
  await ctx.emit('session/created', { id: HOST, cwd: wsOf(root, 'ws-a'), taskSummary: '插件会话' });
  await ctx.emit('agent/pre-step', { agent: { session: { id: HOST } }, turn: 7 });
  let rows = linesOfEvent(root, 'pre-step');
  assert.equal(rows.length, 1, 'pre-step 首步恰一行');
  assert.equal(rows[0].outcome, 'heartbeated');
  assert.equal(rows[0].code, null);
  assert.equal(rows[0].turn, 7);
  assert.match(rows[0].sid, SID_RE);
  // 同窗重发：被抑制 ⇒ 无新行（反向缺席断言）
  await ctx.emit('agent/pre-step', { agent: { session: { id: HOST } }, turn: 8 });
  assert.equal(linesOfEvent(root, 'pre-step').length, 1, '节流窗内重发不落新行');
  // 结论翻变：未入册宿主 ⇒ 立即落行（原因码在案）
  await ctx.emit('agent/pre-step', { agent: { session: { id: hostFor(998) } }, turn: 9 });
  rows = linesOfEvent(root, 'pre-step');
  assert.equal(rows.length, 2, '结论翻变必写');
  const flipped = rows[1];
  assert.equal(flipped.sid, null);
  assert.equal(flipped.code, 'unresolved');
  assert.equal(flipped.outcome, 'skipped:no-sid');
});

test('SELFLOG-P2: pre-step 节流窗（单元级，注入时钟）—— 满窗必写并带回抑制数', () => {
  __resetSelflogCursor();
  const root = tmpRoot();
  const t0 = 1_700_000_000_000;
  const sid = '20260910-00000001';
  assert.equal(logHeartbeat(root, { sid }, { now: t0 }).written, true, '首条必写');
  const th = logHeartbeat(root, { sid }, { now: t0 + 59 * 1000 });
  assert.equal(th.written, false);
  assert.equal(th.throttled, true);
  assert.equal(th.suppressed, 1, '窗内抑制计数累加');
  assert.equal(linesOfEvent(root, 'pre-step').length, 1, '窗内未落新行');
  const res = logHeartbeat(root, { sid, turn: 3 }, { now: t0 + 61 * 1000 });
  assert.equal(res.written, true, '满窗必写');
  const rows = linesOfEvent(root, 'pre-step');
  assert.equal(rows.length, 2);
  assert.equal(rows[1].suppressed, 1, '抑制数随行带回');
  assert.equal(rows[1].turn, 3);
  // 翻变：带原因码的下一条不受窗限制
  const flip = logHeartbeat(root, { sid: null, code: 'unresolved' }, { now: t0 + 62 * 1000 });
  assert.equal(flip.written, true, '结论翻变不受窗限制');
  const rows2 = linesOfEvent(root, 'pre-step');
  assert.equal(rows2.length, 3);
  assert.equal(rows2[2].code, 'unresolved');
  assert.ok(!('suppressed' in rows2[2]), '翻变行抑制数已归零不落字段');
});

test('SELFLOG-D1: disposed 行 —— 活跃→已完成流转与未入册跳过各自落行', async () => {
  runtime.__resetRuntimeCursor();
  __resetSelflogCursor();
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  const ctx = mockCtx();
  registerPlugin(ctx, { dataRoot: root, defaultWorkspace: ws });
  const HOST = hostFor(104);
  await ctx.emit('session/created', { id: HOST, cwd: ws, taskSummary: '插件会话' });
  await ctx.emit('session/disposed', { id: HOST });
  await ctx.emit('session/disposed', { id: hostFor(997) });
  const rows = linesOfEvent(root, 'disposed');
  assert.equal(rows.length, 2, 'disposed 两行');
  const disposed = rows.find((r) => r.hostId === HOST);
  const skipped = rows.find((r) => r.hostId === hostFor(997));
  assert.equal(disposed.outcome, 'disposed');
  assert.match(disposed.sid, SID_RE);
  assert.equal(disposed.code, null);
  assert.equal(skipped.sid, null);
  assert.equal(skipped.outcome, 'skipped:not-registered');
  assert.equal(skipped.code, 'not-registered');
});

test('SELFLOG-ROT: 单档 2 MiB 轮转 —— 超限旧档改名 .1（单代），新档仅新行', async () => {
  runtime.__resetRuntimeCursor();
  __resetSelflogCursor();
  const root = tmpRoot();
  const file = selflogPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const seed = `${'x'.repeat(SELFLOG_MAX_BYTES)}\n`;
  fs.writeFileSync(file, seed, 'utf8');
  assert.equal(fs.statSync(file).size, SELFLOG_MAX_BYTES + 1, '种子超限 1 字节');
  const ctx = mockCtx();
  registerPlugin(ctx, { dataRoot: root, defaultWorkspace: wsOf(root, 'ws-a') });
  await ctx.emit('session/created', { id: hostFor(105), cwd: wsOf(root, 'ws-a'), taskSummary: '插件会话' });
  assert.equal(fs.existsSync(file + '.1'), true, '旧档轮转为 .1');
  assert.equal(fs.statSync(file + '.1').size, SELFLOG_MAX_BYTES + 1, '.1 逐字节保留旧档');
  const fresh = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  assert.equal(fresh.length, 2, '新档＝轮转触发行（register）＋其后的 created 行');
  assert.equal(JSON.parse(fresh[0]).event, 'register');
  assert.equal(JSON.parse(fresh[1]).event, 'created');
});

test('SELFLOG-FAIL: 落盘失败不炸调用方 —— written:false＋开发通道 warning（emitWarning 保留）', async () => {
  runtime.__resetRuntimeCursor();
  __resetSelflogCursor();
  const root = tmpRoot();
  const ws = wsOf(root, 'ws-a');
  fs.writeFileSync(path.join(root, 'logs'), 'not-a-dir', 'utf8'); // logs 被文件占位 ⇒ mkdir 必败
  // 1) 插件面：事件处理照常完成（日志降级为开发通道，宿主零感知）
  const ctx = mockCtx();
  registerPlugin(ctx, { dataRoot: root, defaultWorkspace: ws });
  await ctx.emit('agent/inbox/claimed', {
    agent: { session: { id: hostFor(106), cwd: ws } },
    message: { id: 'msg-f', content: '请务必执行' },
  });
  // 2) 观测面：失败原因在返回值（可观测）
  const direct = appendSelflog(root, 'claimed', { sid: null, code: 'unresolved' });
  assert.equal(direct.written, false);
  assert.ok(direct.error, '失败原因在返回值（可观测）');
  // 3) 开发通道：emitWarning 异步投递 —— 先挂监听再触发，让位一个宏任务确保投递
  const warnings = [];
  const onWarning = (w) => { if (String(w?.message ?? '').includes('selflog 写入失败')) warnings.push(w); };
  process.on('warning', onWarning);
  try {
    appendSelflog(root, 'disposed', { sid: null, code: 'no-host-id' });
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    process.off('warning', onWarning);
  }
  assert.ok(warnings.length >= 1, '落盘失败经 emitWarning 开发通道告警（不静默）');
});
