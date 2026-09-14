/**
 * @local/agent-memory — 指令台账 + 进度文件体系（第一阶段；2026-09-10 全局化修订）
 *
 * 全局布局：数据根目录 = 机器级全局目录（默认 <主目录>/.agent-memory，
 * 环境变量 AGENT_MEMORY_ROOT 覆盖）。所有函数第一个参数 root 可省略，省略即全局默认根。
 *
 * 组合层约定：凡修改会话内容的公开函数（addEntry / setEntryStatus / removeEntry /
 * appendMilestone）都会：
 *   1) 先做单活跃写入校验（assertWritable：status=活跃 且 handedOverTo=null，B1/B2）
 *      + 工作区校验（调用方 opts.workspace === 记录 currentWorkspace，跨工作区续写
 *      必须先 handoverToWorkspace，B6/§6 修订）；
 *   2) 在 .locks/<sid>.lock 会话写锁内完成原子写
 *      （registry 本体更新额外在 .locks/registry.lock 全局锁内，§3 修订）；
 *   3) 写后同步 registry 心跳 lastActiveAt（§4 心跳规则）。
 */
import * as registry from './registry.js';
import * as ledger from './ledger.js';
import * as progress from './progress.js';
import * as archive from './archive.js';

export {
  DATA_DIR, AGENT_DIR, DATA_ROOT_ENV, DATA_ROOT_ENV_LEGACY,
  SESSIONS_DIR, LOCKS_DIR, REGISTRY_LOCK_NAME, SID_RE, HOST_ID_RE, SCHEMA_VERSION,
  LEDGER_MAX_BYTES, PROGRESS_MAX_BYTES, FRESHNESS_TURNS, LOCK_MAX_AGE_MS,
  LOCK_WAIT_MS, AUTO_ARCHIVE_AFTER_MS, REGISTRY_MAX_SESSIONS, CANDIDATE_LIMIT,
  FOLD_MAX_CHARS, COPY_MIN_CHARS, SESSION_STATUSES, ENTRY_STATUSES,
  ENTRY_NO_RE, STATUS_TRANSITIONS,
  DEFAULT_PERMANENT_INSTRUCTIONS, PERMANENT_MAX_ITEMS, PERMANENT_MAX_CHARS,
} from './constants.js';

export {
  generateSid, isValidSid, assertValidSid, assertValidWorkspace,
  resolveDataRoot, agentRoot, registryPath, locksDir, lockPath,
  registryLockPath, sessionDir, ledgerPath, progressPath, archivePath,
} from './paths.js';

/* ---------- 宿主会话 ID 归一化（二阶段后半：宿主 UUID → 候选 sid 的唯一入口） ---------- */
export { assertValidHostId, normalizeHostId, tryNormalizeHostId, candidateSuffix, candidateSid } from './normalize.js';

export { atomicWrite, readJson } from './atomic.js';
export {
  acquireLock, acquireRegistryLock, withSessionLock, withRegistryLock,
  isLockStale, cleanupLock, isPidAlive,
} from './lock.js';
export * from './gate.js';

/* ---------- 命名空间（供高级用法） ---------- */
export { registry, ledger, progress, archive };

/* ---------- 注册表 / 会话生命周期 ---------- */
export {
  readRegistry, createSession, getSession, updateStatus,
  listCandidates, autoArchive, heartbeat, assertWritable, removeSession,
} from './registry.js';

/* ---------- 跨工作区一致性检查 / 移交（全局化修订 §6） ---------- */
export {
  collectInvolvedFiles, checkWorkspaceConsistency, handoverToWorkspace,
} from './workspace.js';

/* ---------- 台账（组合层：门禁 + 心跳） ---------- */
export { readLedger, readHeader, parseLedger, renderLedger, SECTION_ORDER, editEntryContent, describeEntry, PERMANENT_SECTION } from './ledger.js';

export function addEntry(root, sid, opts = {}) {
  registry.assertWritable(root, sid, opts.workspace);
  const entry = ledger.addEntry(root, sid, opts);
  registry.heartbeat(root, sid, { now: opts.now });
  return entry;
}

/** 永久指令区（v1 内追加能力）：整体替换常驻指令列表（组合层：门禁 + 心跳）。 */
export function setPermanentInstructions(root, sid, list, opts = {}) {
  registry.assertWritable(root, sid, opts.workspace);
  const out = ledger.setPermanentInstructions(root, sid, list, opts);
  registry.heartbeat(root, sid, { now: opts.now });
  return out;
}

/** [永久] 自然触发监测（§12.7）：默认配方双行是否在场（只读核对；供 model-switch 里程碑 / checkpoint 正典自检使用）。 */
export function verifyPermanentPresence(root, sid) {
  const led = ledger.readLedger(root, sid);
  const perms = Array.isArray(led?.permanent) ? led.permanent.map((p) => String(p ?? '')) : [];
  const hasFirst = perms.some((p) => p.includes('始终用中文回复'));
  const hasSecond = perms.some((p) => p.startsWith('指令先落账'));
  return { ok: hasFirst && hasSecond, hasFirst, hasSecond, count: perms.length, perms };
}

/**
 * 摘要接线修复（2026-09-13）：宿主 `session/title` 事件（经 session/event 投影信道）
 * 到达时回填会话摘要。走正规注册表写入路径（双锁 + persistRegistry），并同步台账
 * 头部 task 字段；标题为空串时拒绝（避免把有效摘要清空）。幂等：同值重复写无副作用。
 */
export function setTaskSummary(root, sid, taskSummary, opts = {}) {
  const summary = String(taskSummary ?? '').trim();
  if (!summary) {
    const e = new Error('EMPTY_TASK_SUMMARY: 拒绝写入空摘要（保留原值）');
    e.code = 'EMPTY_TASK_SUMMARY';
    throw e;
  }
  return registry.setTaskSummary(root, sid, summary, opts);
}

export function setEntryStatus(root, sid, no, newStatus, opts = {}) {
  registry.assertWritable(root, sid, opts.workspace);
  const entry = ledger.setEntryStatus(root, sid, no, newStatus, opts);
  registry.heartbeat(root, sid, { now: opts.now });
  return entry;
}

export function removeEntry(root, sid, no, opts = {}) {
  registry.assertWritable(root, sid, opts.workspace);
  const res = ledger.removeEntry(root, sid, no, opts);
  registry.heartbeat(root, sid, { now: opts.now });
  return res;
}

/* ---------- R1 结构化勘误（2026-09-11 签字 rider） ---------- */
export function addErratum(root, sid, opts = {}) {
  registry.assertWritable(root, sid, opts.workspace);
  const entry = ledger.addErratum(root, sid, opts);
  registry.heartbeat(root, sid, { now: opts.now });
  return entry;
}

/* ---------- 进度（组合层：门禁 + 心跳；每次写入记录 workspaceRoot） ---------- */
export { readProgress, readProgressHeader, parseProgress, renderProgress, assertLiveBlockOnly } from './progress.js';

export function appendMilestone(root, sid, opts = {}) {
  registry.assertWritable(root, sid, opts.workspace);
  const res = progress.appendMilestone(root, sid, opts);
  registry.heartbeat(root, sid, { now: opts.now });
  return res;
}

/** R2 就地改划界（2026-09-11 签字 rider）：仅更新最新里程碑的活区块（当前状态/下一步/关键决定）。 */
export function updateLiveBlocks(root, sid, opts = {}) {
  registry.assertWritable(root, sid, opts.workspace);
  const res = progress.updateLiveBlocks(root, sid, opts);
  registry.heartbeat(root, sid, { now: opts.now });
  return res;
}

/* ---------- 归档（只读 + 内部追加；追加由台账/进度超限触发） ---------- */
export { readArchive } from './archive.js';

/* ---------- checkpoint 在场证据日志（§12.9 候选②专用落点；节流 JSONL） ---------- */
export { recordCheckpointEvidence, evidencePath } from './evidence.js';

/* ---------- 冷启动恢复（只读，文件为准，§F） ---------- */
export { buildRecoveryReport } from './recover.js';

/* ---------- 宿主 id 反向解析 + 回合备忘（sid 一致性 2026-09-13 / 4b 2026-09-13）：压缩插件等外部消费方经包入口懒加载时可用 ---------- */
export { resolveSidByHostId, noteTurn, lastSeenTurn } from './runtime.js';