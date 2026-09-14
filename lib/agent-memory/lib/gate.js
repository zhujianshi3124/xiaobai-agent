/**
 * .agent 体系 — 压缩前置门禁（设计稿 §4/§5/§8 约束 G，缺口 b）
 *
 * 新鲜度 N = 3 个模型回合（不是用户回合），写死常量 FRESHNESS_TURNS。
 * 台账头部 heartbeatTurn = 最近一次台账更新的模型回合数；
 * 当前模型回合 modelTurn - heartbeatTurn ≤ 3 → 新鲜允许；> 3 → 拒绝并提示刷新；
 * 刷新（写一次台账，更新 heartbeatTurn）后重新允许；无台账 → 拒绝（G4）。
 */
import { FRESHNESS_TURNS } from './constants.js';
import { readHeader } from './ledger.js';

export { FRESHNESS_TURNS };

/**
 * @param {object|null} header 台账头部（readLedger().header / readHeader()），无台账传 null
 * @param {number} modelTurn 当前模型回合数
 */
export function checkFreshness(header, modelTurn) {
  if (!header) {
    return {
      ok: false,
      code: 'NO_LEDGER',
      modelTurn,
      freshnessTurns: FRESHNESS_TURNS,
      message: '门禁拒绝：会话未初始化（无台账文件），请先 createSession 引导创建台账与进度文件',
    };
  }
  const last = header.heartbeatTurn;
  if (typeof last !== 'number' || Number.isNaN(last)) {
    return {
      ok: false,
      code: 'BAD_HEADER',
      modelTurn,
      heartbeatTurn: last,
      freshnessTurns: FRESHNESS_TURNS,
      message: '门禁拒绝：台账头部 heartbeatTurn 缺失或非法',
    };
  }
  const turns = Number(modelTurn) - last;
  if (turns <= FRESHNESS_TURNS) {
    return { ok: true, code: 'FRESH', turns, freshnessTurns: FRESHNESS_TURNS };
  }
  return {
    ok: false,
    code: 'STALE',
    turns,
    freshnessTurns: FRESHNESS_TURNS,
    message: `门禁拒绝：台账已过期 ${turns} 个模型回合（上限 ${FRESHNESS_TURNS}）。请先刷新台账（写一次台账更新 heartbeatTurn）后再压缩`,
  };
}

/** 便捷：直接读台账头部判新鲜度；无台账抛 NOT_INITIALIZED（G4 由调用方捕获） */
export function checkFreshnessByFile(root, sid, modelTurn) {
  return checkFreshness(readHeader(root, sid), modelTurn);
}

/**
 * 上下文交接前置检查点（§1，2026-09-11 新语义）：任何交接（完整/压缩传递、路由切模型）
 * 发出下一条请求之前统一调用；**独立于传递策略**（transferStrategy 仅记录，不参与判定）。
 *
 * 新鲜（≤ maxAgeTurns 个模型回合）→ { ok: true }；否则 fail-closed 抛错：
 *   FRESHNESS_STALE     过期（含 turns / 上限 / strategy）
 *   FRESHNESS_NO_LEDGER 未初始化（无台账）
 *   FRESHNESS_BAD_HEADER heartbeatTurn 缺失/非法
 *   HANDOVER_NEEDS_TURN 缺 turn 参数
 */
export function assertFreshForHandover(root, sid, opts = {}) {
  const { turn, maxAgeTurns = FRESHNESS_TURNS, transferStrategy } = opts ?? {};
  if (typeof turn !== 'number' || Number.isNaN(turn)) {
    const e = new Error('HANDOVER_NEEDS_TURN: assertFreshForHandover 需要当前模型回合数 turn');
    e.code = 'HANDOVER_NEEDS_TURN';
    throw e;
  }
  let header;
  try {
    header = readHeader(root, sid);
  } catch (err) {
    if (err?.code === 'NOT_INITIALIZED') {
      const e = new Error('FRESHNESS_NO_LEDGER: 会话未初始化，交接前必须先初始化台账（createSession）');
      e.code = 'FRESHNESS_NO_LEDGER';
      throw e;
    }
    throw err;
  }
  const last = header.heartbeatTurn;
  if (typeof last !== 'number' || Number.isNaN(last)) {
    const e = new Error('FRESHNESS_BAD_HEADER: 台账头部 heartbeatTurn 缺失或非法，交接被拒');
    e.code = 'FRESHNESS_BAD_HEADER';
    throw e;
  }
  const turns = Number(turn) - last;
  if (turns <= maxAgeTurns) {
    return { ok: true, turns, freshTurns: maxAgeTurns, transferStrategy: transferStrategy ?? null };
  }
  const e = new Error(
    `FRESHNESS_STALE: 台账过期 ${turns} 个模型回合（上限 ${maxAgeTurns}）；交接（strategy=${transferStrategy ?? 'any'}）前必须先刷新台账`
  );
  e.code = 'FRESHNESS_STALE';
  e.turns = turns;
  throw e;
}

/**
 * 软性新鲜度探针（4b，2026-09-13）：assertFreshForHandover 的不抛错版。
 * 压缩插件在压缩出口用「记忆侧最后见到的回合数」比对台账 heartbeatTurn：
 * STALE → { stale, behind, freshnessTurns }（提示数据）；FRESH/无台账/缺回合数 → null（不猜）。
 */
export function peekFreshness(root, sid, currentTurn) {
  if (typeof currentTurn !== 'number' || Number.isNaN(currentTurn)) return null;
  let header;
  try {
    header = readHeader(root, sid);
  } catch {
    return null; // 无台账/未初始化 → 无提示（正典构建侧已有降级路径）
  }
  const r = checkFreshness(header, currentTurn);
  if (r.ok) return null;
  return { stale: r.code === 'STALE', code: r.code, behind: r.turns, freshnessTurns: r.freshnessTurns };
}
