/**
 * @local/agent-memory — 会话注册表（设计稿 §3/§4/§6/§7，约束 C/B；2026-09-10 全局化修订）
 *
 * registry.json：version / updatedAt / sessions[]（sid、dshSessionId、createdAt、
 * lastActiveAt、taskSummary、status、handedOverTo、homeWorkspace、currentWorkspace）。
 *
 * 全局化修订要点：
 * - registry 为「全机共享」文件，所有读改写必须在 .locks/registry.lock 全局锁内
 *   （锁顺序：会话锁在外、registry 锁在内），防止不同工作区的会话并发写坏；
 * - 每条记录带 homeWorkspace（创建时工作区）与 currentWorkspace（当前工作区）；
 * - 单活跃写入校验扩展：写前必须处于同一工作区（currentWorkspace === 调用方工作区），
 *   否则 WORKSPACE_MISMATCH —— 跨工作区续写必须先走 handoverToWorkspace 一致性检查 + 用户确认；
 * - 留存上限 100 条（修订 50 → 100）；候选仍只列最近 10 条活跃并显示所属工作区。
 *
 * 其余不变：心跳同步 lastActiveAt；状态迁移合法表（C4）；自动归档 30 天（§7）；
 * 候选只读、绝不自动选择（B3）。
 */
import fs from 'node:fs';
import {
  REGISTRY_MAX_SESSIONS, CANDIDATE_LIMIT, SESSION_STATUSES, STATUS_TRANSITIONS,
  AUTO_ARCHIVE_AFTER_MS,
} from './constants.js';
import {
  registryPath, sessionDir, generateSid, assertValidSid, isValidSid,
  assertValidWorkspace, rootOrGlobal,
} from './paths.js';
import { tryNormalizeHostId, candidateSid } from './normalize.js';
import { atomicWrite, readJson } from './atomic.js';
import { withSessionLock, withRegistryLock } from './lock.js';
import { toUtcIso } from './time.js';
import { backupTreeBeforeRemove } from './backup.js';
import { initLedger, patchLedgerCore } from './ledger.js';
import { initProgress } from './progress.js';
import { initArchive } from './archive.js';

export function makeEmptyRegistry() {
  return { version: 1, updatedAt: null, sessions: [] };
}

export function readRegistry(root, opts = {}) {
  const { create = false } = opts;
  return readJson(registryPath(root), create ? 'create' : 'strict', makeEmptyRegistry);
}

function iso(now) {
  return toUtcIso(now ?? new Date());
}

export function findSession(reg, sid) {
  return (reg.sessions ?? []).find((s) => s.sid === sid) ?? null;
}

/** 留存上限：移除最旧 已归档 记录直到 ≤ REGISTRY_MAX_SESSIONS；无归档可移 → REGISTRY_OVERFLOW */
export function pruneRegistry(reg) {
  const max = REGISTRY_MAX_SESSIONS;
  while (reg.sessions.length > max) {
    const archived = reg.sessions
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => s.status === '已归档')
      .sort((a, b) => {
        const at = (x) => Date.parse(x.lastActiveAt) || 0;
        const d = at(a) - at(b);
        if (d !== 0) return d;
        return a.i - b.i;
      });
    if (archived.length === 0) {
      const e = new Error(
        `REGISTRY_OVERFLOW: 注册表已满（${reg.sessions.length} ≥ ${max}）且没有可归档移除的 已归档 会话；请先归档/移交`
      );
      e.code = 'REGISTRY_OVERFLOW';
      e.count = reg.sessions.length;
      e.max = max;
      throw e;
    }
    const victim = archived[0];
    reg.sessions.splice(victim.i, 1);
  }
}

/**
 * 持久化 registry（内部用）：调用方必须已持有 .locks/registry.lock 全局锁（§3 修订）。
 * 原子写：tmp + rename。
 */
export function persistRegistry(root, reg, now) {
  pruneRegistry(reg);
  reg.updatedAt = iso(now);
  atomicWrite(registryPath(root), JSON.stringify(reg, null, 2) + '\n');
  return reg;
}

/** 心跳：仅更新 lastActiveAt（台账/进度写入后调用；只需 registry 锁，不碰会话文件） */
export function heartbeat(root, sid, opts = {}) {
  assertValidSid(sid);
  return withRegistryLock(root, () => {
    const reg = readRegistry(root, { create: false });
    const s = findSession(reg, sid);
    if (!s) {
      const e = new Error(`SESSION_NOT_FOUND: 注册表中没有 ${sid}`);
      e.code = 'SESSION_NOT_FOUND';
      throw e;
    }
    s.lastActiveAt = iso(opts.now);
    persistRegistry(root, reg, opts.now);
    return s;
  }, opts);
}

/**
 * 会话初始化：建目录 + 写 3 个文件 + 注册 registry 条目。
 * @param {string} [root] 数据根目录（省略 → 全局默认解析）
 * @param {object} opts
 * @param {string} [opts.sid] 显式 sid（缺省时：dshSessionId 为宿主 UUID → 派生候选 sid；
 *   否则 generateSid 随机 12 位 hex）；显式 sid 未知格式 → 拒绝入册返回 null（不抛错）
 * @param {string} [opts.dshSessionId] 宿主会话 ID（通用 UUID 时经 lib/normalize.js 归一化并派生 sid；
 *   非 UUID 视为 opaque 元数据原样入册，兼容旧调用方）
 * @param {string} [opts.taskSummary] 注册表摘要
 * @param {string} [opts.task] 台账头部任务
 * @param {number} [opts.modelTurn]
 * @param {string} opts.workspace 创建会话时的工作区根（绝对路径）→ homeWorkspace=currentWorkspace
 * @returns 注册表记录；显式 sid 未知格式 → null（拒绝入册，不抛错——方案 b 修订版）
 */
export function createSession(root, opts = {}) {
  const { sid, dshSessionId = null, taskSummary = '', task = taskSummary, modelTurn = 0, now = new Date(), workspace } = opts;
  const ws = assertValidWorkspace(workspace);
  // 显式 sid：未知格式 → 拒绝入册（返回 null，不抛错——方案 b 修订版"未知格式拒绝入册不抛错"）。
  if (sid != null && !isValidSid(sid)) {
    process.emitWarning(`[agent-memory] createSession 拒绝入册：显式 sid 未知格式（sid="${String(sid)}"）→ null`);
    return null;
  }
  // 宿主 ID 归一化：UUID → 小写并作为派生候选 sid 的权威（权威反转）；
  // 非 UUID（opaque，如旧脚本的标签）→ 原样保留为元数据，不派生、不抛错。
  let finalDsh = null;
  let hostDerived = false;
  if (dshSessionId != null) {
    const norm = tryNormalizeHostId(dshSessionId);
    if (norm) { finalDsh = norm; hostDerived = true; }
    else { finalDsh = dshSessionId; }
  }
  // sid 缺省：有宿主 UUID → 派生候选（注册表分配并固化）；否则随机 12 位 hex
  const finalSid = sid ?? (hostDerived ? candidateSid(finalDsh, now) : generateSid(now));
  assertValidSid(finalSid);
  const createdAt = iso(now);
  return withSessionLock(root, finalSid, () =>
    withRegistryLock(root, () => {
      const reg = readRegistry(root, { create: true });
      if (findSession(reg, finalSid)) {
        const e = new Error(`SID_EXISTS: 会话 ${finalSid} 已注册`);
        e.code = 'SID_EXISTS';
        throw e;
      }
      const dir = sessionDir(root, finalSid);
      fs.mkdirSync(dir, { recursive: true });
      initLedger(root, finalSid, { dshSessionId: finalDsh, task, createdAt, heartbeatTurn: modelTurn, status: '活跃' });
      initProgress(root, finalSid, { updatedAt: createdAt, workspaceRoot: ws });
      initArchive(root, finalSid);
      const record = {
        sid: finalSid,
        dshSessionId: finalDsh,
        createdAt,
        lastActiveAt: createdAt,
        taskSummary,
        status: '活跃',
        handedOverTo: null,
        homeWorkspace: ws,
        currentWorkspace: ws,
      };
      reg.sessions.push(record);
      persistRegistry(root, reg, now);
      return record;
    }, opts), opts);
}

export function getSession(root, sid) {
  const dr = rootOrGlobal(root);
  const reg = readRegistry(dr, { create: false });
  return findSession(reg, sid);
}

/**
 * 工作区相等判（EXE-BOOT-011 施工笔 G）：win32 路径大小写不敏感，字串全等会把
 * 同区不同大小写误拦（生产根实证：9/19 启动记 `C:\Windows\system32`、9/21 记
 * `C:\Windows\System32`——同一目录两代大小写）；归一只作用于比较，错误信息保留原值。
 * 任一侧空值（未记录）≠ 相等（维持"未记录不可续写"fail-closed 语义）。
 */
function sameWorkspace(a, b) {
  if (a == null || b == null) return false;
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/**
 * 单活跃写入校验（B1/B2 + 全局化工作区校验）：
 * 1) 会话必须存在、status=活跃 且 handedOverTo=null；
 * 2) 调用方工作区必须等于记录 currentWorkspace（win32 大小写归一比较；否则 WORKSPACE_MISMATCH，
 *    跨工作区续写必须先 handoverToWorkspace 走一致性检查 + 用户确认）。
 */
export function assertWritable(root, sid, workspace) {
  const ws = assertValidWorkspace(workspace);
  const s = getSession(root, sid);
  if (!s) {
    const e = new Error(`NOT_REGISTERED: 会话 ${sid} 未在注册表中，请先 createSession`);
    e.code = 'NOT_REGISTERED';
    throw e;
  }
  if (s.status !== '活跃' || s.handedOverTo !== null) {
    const e = new Error(
      `WRITE_FORBIDDEN: 会话 ${sid} 状态=${s.status}, handedOverTo=${s.handedOverTo ?? 'null'} —— 已移交/已归档/已完成 会话禁止写入`
    );
    e.code = 'WRITE_FORBIDDEN';
    e.session = s;
    throw e;
  }
  if (!sameWorkspace(s.currentWorkspace, ws)) {
    const e = new Error(
      `WORKSPACE_MISMATCH: 会话 ${sid} 当前所属工作区=${s.currentWorkspace ?? '(未记录)'}，调用方工作区=${ws} —— 禁止静默在错误工作区续写；跨工作区续写请先 handoverToWorkspace(一致性检查 + 用户确认)`
    );
    e.code = 'WORKSPACE_MISMATCH';
    e.session = s;
    e.callerWorkspace = ws;
    throw e;
  }
  return s;
}

/** 状态迁移（C3/C4）。已移交必须带 handedOverTo=newSid（B2）。 */
export function updateStatus(root, sid, newStatus, opts = {}) {
  const { handedOverTo, now = new Date() } = opts;
  if (!SESSION_STATUSES.includes(newStatus)) {
    const e = new Error(`INVALID_STATUS: "${newStatus}" 不在 ${SESSION_STATUSES.join('/')} 中`);
    e.code = 'INVALID_STATUS';
    throw e;
  }
  assertValidSid(sid);
  return withSessionLock(root, sid, () => {
    const s = withRegistryLock(root, () => {
      const reg = readRegistry(root, { create: false });
      const rec = findSession(reg, sid);
      if (!rec) {
        const e = new Error(`SESSION_NOT_FOUND: 注册表中没有 ${sid}`);
        e.code = 'SESSION_NOT_FOUND';
        throw e;
      }
      const allowed = STATUS_TRANSITIONS[rec.status] ?? [];
      if (!allowed.includes(newStatus)) {
        const e = new Error(`INVALID_TRANSITION: 会话 ${sid} 不允许 ${rec.status} → ${newStatus}（合法：${allowed.join(' / ') || '无'}）`);
        e.code = 'INVALID_TRANSITION';
        e.from = rec.status;
        e.to = newStatus;
        throw e;
      }
      if (newStatus === '已移交') {
        if (!handedOverTo || !isValidSid(handedOverTo)) {
          const e = new Error('MISSING_HANDOVER_TARGET: 移交必须指定新会话 sid（handedOverTo）');
          e.code = 'MISSING_HANDOVER_TARGET';
          throw e;
        }
        rec.handedOverTo = handedOverTo;
      }
      rec.status = newStatus;
      persistRegistry(root, reg, now);
      return rec;
    }, opts);
    // 同步台账头部 status（锁内核心，避免重复拿锁；registry 锁已释放，会话锁仍持有）
    try {
      patchLedgerCore(root, sid, { status: newStatus }, { now });
    } catch {
      /* 台账缺失则跳过（registry 为准） */
    }
    return s;
  }, opts);
}

/** 摘要回填（摘要接线修复 2026-09-13）：session/title → taskSummary。幂等；同值不改动 updatedAt 语义仍走持久化。 */
export function setTaskSummary(root, sid, taskSummary, opts = {}) {
  const { now = new Date() } = opts;
  assertValidSid(sid);
  return withSessionLock(root, sid, () => {
    const s = withRegistryLock(root, () => {
      const reg = readRegistry(root, { create: false });
      const rec = findSession(reg, sid);
      if (!rec) {
        const e = new Error(`SESSION_NOT_FOUND: 注册表中没有 ${sid}`);
        e.code = 'SESSION_NOT_FOUND';
        throw e;
      }
      rec.taskSummary = taskSummary;
      if (rec.task === undefined) rec.task = taskSummary;
      persistRegistry(root, reg, now);
      return rec;
    }, opts);
    // 同步台账头部 task 字段（registry 锁已释放，会话锁仍持有；台账缺失则跳过）
    try {
      patchLedgerCore(root, sid, { task: taskSummary }, { now });
    } catch {
      /* 台账缺失则跳过（registry 为准） */
    }
    return s;
  }, opts);
}

/** 候选列表：只列最近 limit 条 活跃（跨全机），按 lastActiveAt 降序（C6）；只读不改（B3） */
export function listCandidates(root, opts = {}) {
  const { limit = CANDIDATE_LIMIT } = opts;
  const reg = readRegistry(root, { create: false });
  return (reg.sessions ?? [])
    .filter((s) => s.status === '活跃')
    .sort((a, b) => Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt))
    .slice(0, limit)
    .map((s) => ({
      sid: s.sid,
      dshSessionId: s.dshSessionId,
      taskSummary: s.taskSummary,
      lastActiveAt: s.lastActiveAt,
      homeWorkspace: s.homeWorkspace ?? null,
      currentWorkspace: s.currentWorkspace ?? null,
    }));
}

/** 自动归档：lastActiveAt 超过 maxAge 且 status=已完成 → 已归档（§7，拍板 §10-4） */
export function autoArchive(root, opts = {}) {
  const { now = new Date(), maxAge = AUTO_ARCHIVE_AFTER_MS } = opts;
  const reg = readRegistry(root, { create: false });
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const victims = (reg.sessions ?? [])
    .filter((s) => s.status === '已完成' && nowMs - Date.parse(s.lastActiveAt) > maxAge)
    .map((s) => s.sid);
  const archived = [];
  for (const sid of victims) {
    updateStatus(root, sid, '已归档', { now });
    archived.push(sid);
  }
  return archived;
}

/**
 * 窄口径删除（2026-09-10 事故修复，用户拍板）：单会话、显式授权、留操作记录。
 *
 * - 只能删除「已注册且存在」的会话；调用方必须是受护栏管理的工具（remove-session.mjs），
 *   生产根必须显式 opt-in；受保护的真实记录由脚本层拒绝。
 * - 删除前对整棵会话目录做外部备份快照（backupTreeBeforeRemove → <备份根>，根外）；
 * - 删除后 registry 同步移除该条（走全局锁 + 会话锁，先快照 registry 再原子写）；
 * - 操作记录经 opts.recordOp 落盘（默认写 <备份根>/ops/，位于生产根之外——
 *   整根消失时审计不陪葬）。
 */
export function removeSession(root, sid, opts = {}) {
  assertValidSid(sid);
  const dr = rootOrGlobal(root);
  return withSessionLock(dr, sid, () =>
    withRegistryLock(dr, () => {
      const reg = readRegistry(dr, { create: false });
      const idx = (reg.sessions ?? []).findIndex((s) => s.sid === sid);
      if (idx === -1) {
        const e = new Error(`NOT_REGISTERED: 会话 ${sid} 未在注册表中`);
        e.code = 'NOT_REGISTERED';
        throw e;
      }
      const removed = reg.sessions[idx];
      const dir = sessionDir(dr, sid);
      backupTreeBeforeRemove(dir, { ...(opts.backup ?? {}) });
      reg.sessions.splice(idx, 1);
      persistRegistry(dr, reg, opts.now ?? new Date());
      fs.rmSync(dir, { recursive: true, force: true });
      if (opts.recordOp) {
        opts.recordOp({
          action: 'remove-session',
          root: dr,
          sid,
          removed: {
            taskSummary: removed.taskSummary,
            createdAt: removed.createdAt,
            lastActiveAt: removed.lastActiveAt,
            status: removed.status,
            currentWorkspace: removed.currentWorkspace,
          },
          at: new Date().toISOString(),
          by: opts.by ?? `pid:${process.pid}`,
        });
      }
      return removed;
    }, opts), opts);
}

export { REGISTRY_MAX_SESSIONS, CANDIDATE_LIMIT };