/**
 * @local/agent-memory — 运行时接线四件套（§7，2026-09-11 签字生效）
 *
 * 事件驱动写入（正典），启发式降为兜底。每个 handler 均 fail-closed：
 * 参数缺失/非法 → 抛错（不静默跳过）；只触碰给定会话（隔离天然满足）。
 * 部署后仅新对话入册：注册只发生在 onSessionStart（session/created 事件），不回填旧对话。
 *
 * 本模块为纯处理层（可单测）；dsh 事件适配在 plugin.js（真实 harness 事件 → 本层调用）。
 */
import { resolveDataRoot } from './paths.js';
import { createSession, addEntry, addGeneralEntry, appendMilestone, updateStatus, readRegistry, heartbeat } from './index.js';
import { tryNormalizeHostId } from './normalize.js';

/* ---------- 进程内幂等游标（按 root|sid|messageId / root|sid|dshSessionId） ---------- */
const seenMessages = new Map(); // `${root}|${sid}|${messageId}` → true
const seenSessions = new Map(); // `${root}|${dshSessionId}` → sid
const lastTurns = new Map(); // `${root}|${sid}` → 记忆侧最后见到的宿主模型回合数（4b 压缩提示用；进程内不落盘）

function rootOf(root) {
  return root ?? resolveDataRoot();
}
function req(cond, code, msg) {
  if (!cond) {
    const e = new Error(msg);
    e.code = code;
    throw e;
  }
}

/* ---------- 指令启发式（兜底；正典=台账） ---------- */
const INSTRUCTION_RE =
  /(请|务必|必须|不要|禁止|不允许|记住|规则|要求|目标|指令|重要|注意|确保|优先|始终|always|never|must not|must|remember|important|instruction|rule|requirement|goal|do not|don't|should|shall|strictly)/i;
const NEGATION_RE =
  /(没有.{0,2}指令|无.{0,1}指令|不是.{0,2}指令|非指令)(要求|事项|内容)?|no instructions?|not an instruction/gi;

/** 判定一条 user 文本是否携带操作性指令（兜底启发式；与 compact-router 一致）。 */
export function isInstructionText(text) {
  const t = String(text ?? '');
  const probe = t.replace(NEGATION_RE, ' ').replace(/\s+/g, ' ').trim();
  return INSTRUCTION_RE.test(probe);
}

function entryDesc(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > 300 ? `${t.slice(0, 297)}…` : t;
}

/**
 * 1) 新对话自动注册（session/created）——幂等：同 dshSessionId 已有记录 → 返回现有，不重复注册。
 *    宿主 ID 只经归一化模块进入：dshSessionId 必须是通用 UUID；
 *    未知格式 → 拒绝入册（返回 {registered:false, skipped:'unknown-host-id'}，不抛错——方案 b 修订版）。
 */
export function onSessionStart(opts = {}) {
  const root = rootOf(opts.root);
  const { dshSessionId, taskSummary = '', task = taskSummary, workspace } = opts;
  const host = tryNormalizeHostId(dshSessionId); // 接受 session-<uuid>/裸 UUID；未知格式 → null（拒绝，不抛错）
  if (!host) {
    process.emitWarning(`[agent-memory] onSessionStart 拒绝入册：宿主 id 未知格式（dshSessionId="${String(dshSessionId)}"）→ skipped:unknown-host-id`);
    return { registered: false, skipped: 'unknown-host-id' };
  }
  req(workspace, 'RUNTIME_NEEDS_WORKSPACE', 'onSessionStart 需要 workspace');
  const key = `${root}|${host}`;
  if (seenSessions.has(key)) {
    return { sid: seenSessions.get(key), created: false, deduped: 'in-memory' };
  }
  let existing = null;
  try {
    const reg = readRegistry(root);
    // 兼容历史记录（2026-09-13）：归一化模块落地前，个别记录把带 session- 前缀的
    // 宿主 id 原样入册。查找两侧都归一化，历史会话也能去重命中。
    existing = (reg.sessions ?? []).find((s) => {
      const stored = tryNormalizeHostId(s.dshSessionId);
      return stored !== null && stored === host;
    }) ?? null;
  } catch (err) {
    if (err?.code !== 'NOT_INITIALIZED') throw err; // 注册表尚不存在 = 无历史会话，直接创建
  }
  if (existing) {
    seenSessions.set(key, existing.sid);
    return { sid: existing.sid, created: false, deduped: 'registry' };
  }
  const created = createSession(root, {
    dshSessionId: host,
    taskSummary,
    task,
    workspace,
    modelTurn: opts.modelTurn ?? 0,
    now: opts.now,
  });
  seenSessions.set(key, created.sid);
  return { sid: created.sid, created: true, record: created };
}

/**
 * 宿主 UUID → agent-memory sid 的反向解析（插件事件用）：
 * 先查进程内幂等游标，再回退 registry（按 dshSessionId 精确匹配）。
 * 宿主 ID 只经归一化模块进入；未知格式或查不到 → null（调用方决定跳过/告警，不抛错）。
 */
export function resolveSidByHostId(root, dshSessionId) {
  const r = rootOf(root);
  const host = tryNormalizeHostId(dshSessionId); // 未知格式 → null（不抛错）
  if (!host) return null;
  const key = `${r}|${host}`;
  if (seenSessions.has(key)) return seenSessions.get(key);
  try {
    const reg = readRegistry(r);
    // 兼容历史记录（2026-09-13）：存量个别记录 dshSessionId 带 session- 前缀（如
    // 20260911-1f4a6ded），精确匹配会 MISS → 交接静默退化。两侧归一化后可反解。
    const rec = (reg.sessions ?? []).find((s) => {
      const stored = tryNormalizeHostId(s.dshSessionId);
      return stored !== null && stored === host;
    }) ?? null;
    if (rec) {
      seenSessions.set(key, rec.sid);
      return rec.sid;
    }
  } catch (err) {
    if (err?.code !== 'NOT_INITIALIZED') throw err;
  }
  return null;
}

/**
 * 2) 用户输入逐消息全量采集（R1 全量，EXE-BOOT-011 施工笔2·用户批甲案）：
 *    全部 claimed 用户消息入账——指令性（isInstructionText 判据，职责由"入账闸"重定义为
 *    "分栏判据"）→ 待办（现行编号/流转不变）；非指令 → 一般输入栏（只追加、status=已记录、
 *    不参与未完成计数）。消息 id 幂等（进程内 Map）。禁止只在压缩/切换时刻补采。
 */
export function onUserMessage(opts = {}) {
  const root = rootOf(opts.root);
  const { sid, messageId, text, workspace, modelTurn } = opts;
  req(sid, 'RUNTIME_NEEDS_SID', 'onUserMessage 需要 sid');
  const body = String(text ?? '');
  const key = `${root}|${sid}|${messageId ?? ''}`;
  if (messageId && seenMessages.has(key)) return { skipped: 'duplicate', sid };
  const instruction = isInstructionText(body);
  const entry = instruction
    ? addEntry(root, sid, { desc: entryDesc(body), workspace, modelTurn, now: opts.now })
    : addGeneralEntry(root, sid, { desc: entryDesc(body), workspace, modelTurn, now: opts.now });
  if (messageId) seenMessages.set(key, true);
  return { entry, sid, collected: true, kind: instruction ? 'instruction' : 'general' };
}

/**
 * 3) 里程碑与心跳自动触发（阶段完成 / 心跳）——里程碑追加（自动带 workspaceRoot），心跳随写入。
 */
export function onMilestone(opts = {}) {
  const root = rootOf(opts.root);
  const { sid, workspace, modelTurn, now } = opts;
  req(sid, 'RUNTIME_NEEDS_SID', 'onMilestone 需要 sid');
  req(workspace, 'RUNTIME_NEEDS_WORKSPACE', 'onMilestone 需要 workspace');
  const res = appendMilestone(root, sid, {
    completedSteps: opts.completedSteps ?? [],
    currentStatus: opts.currentStatus ?? '',
    nextSteps: opts.nextSteps ?? '',
    keyDecisions: opts.keyDecisions ?? '',
    files: opts.files ?? [],
    workspace,
    modelTurn,
    now,
  });
  return { sid, iso: res.iso };
}

/** 3b) 心跳（agent/pre-step）：刷新 registry lastActiveAt（不新增里程碑；FRESHNESS 门禁数据源）。 */
export function onHeartbeat(opts = {}) {
  const root = rootOf(opts.root);
  const { sid, now } = opts;
  req(sid, 'RUNTIME_NEEDS_SID', 'onHeartbeat 需要 sid');
  heartbeat(root, sid, { now });
  return { sid, heartbeated: true };
}

/**
 * 4) 会话状态自动流转（生命周期事件）——活跃→已完成/已归档/已移交；移交仍须用户确认（handedOverTo）。
 */
export function onSessionState(opts = {}) {
  const root = rootOf(opts.root);
  const { sid, status, now, handedOverTo } = opts;
  req(sid, 'RUNTIME_NEEDS_SID', 'onSessionState 需要 sid');
  req(status, 'RUNTIME_NEEDS_STATUS', 'onSessionState 需要 status');
  const rec = updateStatus(root, sid, status, { now, handedOverTo });
  return { sid, status, record: rec };
}

/**
 * 5) 会话销毁钩子（session/disposed，方案 b 修订版）——活跃 → 已完成。
 *    - 只给宿主 dshSessionId → 先反向解析成 registry sid；
 *    - 销毁早于注册 / 未入册 → {disposed:false, skipped:'not-registered'}（不抛错）；
 *    - 合法的状态迁移错误（如已归档）仍正常抛出。
 */
export function onSessionDisposed(opts = {}) {
  const root = rootOf(opts.root);
  const { sid, dshSessionId, now } = opts;
  let targetSid = sid;
  if (!targetSid && dshSessionId) targetSid = resolveSidByHostId(root, dshSessionId);
  if (!targetSid) return { sid: null, status: '已完成', disposed: false, skipped: 'not-registered' };
  try {
    const rec = updateStatus(root, targetSid, '已完成', { now });
    return { sid: targetSid, status: '已完成', record: rec, disposed: true };
  } catch (err) {
    if (['NOT_REGISTERED', 'SESSION_NOT_FOUND', 'INVALID_SID'].includes(err?.code)) {
      return { sid: targetSid, status: '已完成', disposed: false, skipped: 'not-registered' };
    }
    throw err;
  }
}

/**
 * 6) 回合数备忘（4b，2026-09-13）：agent/pre-step 每步记录当前宿主模型回合数（进程内，不落盘）。
 * 压缩与模型步进同进程；compact-router 在压缩出口用 lastSeenTurn − 台账 heartbeatTurn
 * 判断台账是否落后。宿主不在 summarize() 里传回合数，这是唯一不打扰宿主接口的取数路径。
 */
export function noteTurn(opts = {}) {
  const root = rootOf(opts.root);
  const { sid, turn } = opts;
  if (!sid || typeof turn !== 'number' || Number.isNaN(turn)) return { noted: false };
  lastTurns.set(`${root}|${sid}`, turn);
  return { noted: true, sid, turn };
}

/** 读回记忆侧最后见到的回合数（未见过的会话 → undefined；调用方缺数不猜）。 */
export function lastSeenTurn(root, sid) {
  return lastTurns.get(`${rootOf(root)}|${sid}`);
}

/** 测试钩子：重置进程内幂等游标。 */
export function __resetRuntimeCursor() {
  seenMessages.clear();
  seenSessions.clear();
  lastTurns.clear();
}