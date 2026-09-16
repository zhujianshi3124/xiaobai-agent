/** agent-memory × compact-router 集成用例（兄弟存在性探测门控）。
 * 只有当 compact-router 插件物理存在时才运行；缺席时 describe/test skip（不红）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as m from '../lib/agent-memory/lib/index.js';

const SUITE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const COMPACT_MANIFEST = fileURLToPath(new URL('../lib/compact-router/dsh.plugin.json', import.meta.url));
const ENABLED = fs.existsSync(COMPACT_MANIFEST);

function tmpRoot() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-memory-compact-int-'));
  return d;
}
function wsOf(root) {
  const d = path.join(root, 'ws');
  fs.mkdirSync(d, { recursive: true });
  return path.resolve(d);
}
function sidFor(n) { return '20260910-' + String(n).padStart(8, '0'); }
function ledgerFile(root, sid) { return path.join(root, 'sessions', sid, 'ledger.md'); }
function rawOf(root, sid, name) {
  const p = path.join(root, 'sessions', sid, name);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

async function loadCompactImports() {
  const adapter = await import(pathToFileURL(path.join(SUITE_ROOT, 'lib', 'compact-router', 'agent-memory.js')).href);
  const digest = await import(pathToFileURL(path.join(SUITE_ROOT, 'lib', 'compact-router', 'instant-digest.js')).href);
  return { compAdapter: adapter, instantDigest: digest.instantDigest };
}

test('PERM1-CROSS: checkpoint 正典副本携带中文永久指令 → 压缩产物可见', { skip: !ENABLED }, async () => {
  const { compAdapter, instantDigest } = await loadCompactImports();
  const root = tmpRoot();
  const ws = wsOf(root);
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: '永久指令测试', workspace: ws });
  m.setPermanentInstructions(root, s.sid, ['始终用中文回复', '先读台账再动手'], { workspace: ws, modelTurn: 1 });
  const canon = await compAdapter.buildCanonicalFromLedger({ agentMemoryLib: m, root, sid: s.sid });
  assert.ok(canon.includes('[永久] 始终用中文回复'), '正典副本应含中文永久指令（第一行）');
  assert.ok(canon.includes('[永久] 先读台账再动手'), '正典副本应含第二行永久指令');
  const digest = instantDigest({ messages: [{ role: 'user', content: '继续。' }] }, { agentMemoryCanonical: canon });
  assert.ok(digest.includes('[永久] 始终用中文回复'), '压缩产物应含中文永久指令（第一行）');
  assert.ok(digest.includes('[永久] 先读台账再动手'), '压缩产物应含第二行永久指令');
});

test('PERM3-CROSS: checkpoint 正典自检 —— 缺默认永久行 → 告警不崩溃（非阻断）', { skip: !ENABLED }, async () => {
  const { compAdapter } = await loadCompactImports();
  const root = tmpRoot();
  const ws = wsOf(root);
  const s = m.createSession(root, { sid: sidFor(1), taskSummary: '正典自检', workspace: ws });
  m.setPermanentInstructions(root, s.sid, ['始终用中文回复'], { workspace: ws });
  const warnings = [];
  const orig = process.emitWarning;
  process.emitWarning = (msg) => { warnings.push(String(msg)); };
  try {
    const canon = await compAdapter.buildCanonicalFromLedger({ agentMemoryLib: m, root, sid: s.sid });
    assert.ok(canon && canon.includes('- [永久] 始终用中文回复'), '退化为 1 行时仍返回正典（非崩溃）');
    assert.ok(warnings.some((w) => w.includes('[正典自检]') && w.includes('指令先落账=false')), '正典自检告警缺第二行');
  } finally {
    process.emitWarning = orig;
  }
});

test('ISOLATE1-CROSS: A 会话压缩（读数据源+纯 digest）时 B 会话目录零变化', { skip: !ENABLED }, async () => {
  const { compAdapter, instantDigest } = await loadCompactImports();
  const root = tmpRoot();
  const wsA = wsOf(root);
  const wsB = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-memory-compact-b-'));
  const a = m.createSession(root, { sid: sidFor(1), taskSummary: 'A', workspace: wsA });
  const b = m.createSession(root, { sid: sidFor(2), taskSummary: 'B', workspace: wsB });
  m.addEntry(root, a.sid, { desc: 'A 的指令条目', workspace: wsA, modelTurn: 1 });
  m.addEntry(root, b.sid, { desc: 'B 的指令条目', workspace: wsB, modelTurn: 1 });
  const bLed = rawOf(root, b.sid, 'ledger.md');
  const bProg = rawOf(root, b.sid, 'progress.md');
  const bLedM = fs.statSync(path.join(root, 'sessions', b.sid, 'ledger.md')).mtimeMs;
  const bProgM = fs.statSync(path.join(root, 'sessions', b.sid, 'progress.md')).mtimeMs;
  const canon = await compAdapter.buildCanonicalFromLedger({ agentMemoryLib: m, root, sid: a.sid });
  assert.ok(canon && canon.includes('[台账]'), 'A 台账正典副本生成');
  const digest = instantDigest(
    { messages: [{ role: 'user', content: 'A 的会话消息，请继续任务。' }] },
    { agentMemoryGuidance: '## Agent-memory guidance', agentMemoryCanonical: canon },
  );
  assert.ok(digest.includes('## Agent-memory guidance'), 'digest 含引导注入');
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(rawOf(root, b.sid, 'ledger.md'), bLed, 'B 台账内容零变化');
  assert.equal(rawOf(root, b.sid, 'progress.md'), bProg, 'B 进度内容零变化');
  assert.equal(fs.statSync(path.join(root, 'sessions', b.sid, 'ledger.md')).mtimeMs, bLedM, 'B 台账 mtime 零变化');
  assert.equal(fs.statSync(path.join(root, 'sessions', b.sid, 'progress.md')).mtimeMs, bProgM, 'B 进度 mtime 零变化');
});
