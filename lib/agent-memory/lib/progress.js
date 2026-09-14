/**
 * @local/agent-memory — 进度文件（设计稿 §2.2/§5，约束 E；2026-09-10 全局化修订）
 *
 * 只在里程碑追加一节（E1/E2）；超限时把最旧里程碑的 已完成步骤/涉及文件
 * 移入 archive.md（E3），当前状态/下一步/关键决定 三区块永不归档（拍板 §10-6）。
 *
 * 全局化修订：header 增加 workspaceRoot —— 每次写入时记录当时的工作区根绝对路径，
 * 使跨区核验可机械执行（handoverToWorkspace 的一致性检查读取它/涉及文件）。
 * workspaceRoot 只在显式传入 opts.workspace 时更新（appendMilestone 组合层总是传入）。
 */
import fs from 'node:fs';
import { PROGRESS_MAX_BYTES, SCHEMA_VERSION } from './constants.js';
import { progressPath, assertValidWorkspace } from './paths.js';
import { atomicWrite } from './atomic.js';
import { withSessionLock } from './lock.js';
import { toUtcIso } from './time.js';
import * as archive from './archive.js';

export function initProgress(root, sid, init = {}) {
  const file = progressPath(root, sid);
  if (fs.existsSync(file)) return;
  const nowIso = toUtcIso(init.updatedAt ?? new Date());
  const ws = init.workspaceRoot ? assertValidWorkspace(init.workspaceRoot) : '';
  const raw = `# Progress — ${sid}\n- sid: ${sid}\n- updatedAt: ${nowIso}\n- workspaceRoot: ${ws}\n- schemaVersion: ${SCHEMA_VERSION}\n`;
  atomicWrite(file, raw);
}

const FIELD_MAP = {
  '已完成步骤': 'completedSteps',
  '当前状态': 'currentStatus',
  '下一步': 'nextSteps',
  '关键决定': 'keyDecisions',
  '涉及文件': 'files',
};

export function parseProgress(raw) {
  const lines = String(raw).split(/\r?\n/);
  const header = { sid: null, updatedAt: null, workspaceRoot: null, schemaVersion: null };
  const milestones = [];
  let current = null;
  const title = lines[0] ?? '';
  for (const line of lines) {
    const hm = line.match(/^- ([^:]+): (.*)$/);
    if (current === null && hm) {
      const key = hm[1].trim();
      if (key in header) {
        header[key] = key === 'schemaVersion' ? (Number.parseInt(hm[2].trim(), 10) || 0) : (hm[2].trim() || null);
      }
      continue;
    }
    const ms = line.match(/^## 里程碑 (.+)$/);
    if (ms) {
      current = { iso: ms[1].trim(), completedSteps: [], currentStatus: '', nextSteps: '', keyDecisions: '', files: [] };
      milestones.push(current);
      continue;
    }
    if (current) {
      const fm = line.match(/^- (已完成步骤|当前状态|下一步|关键决定|涉及文件): (.*)$/);
      if (fm) {
        const key = FIELD_MAP[fm[1]];
        const val = fm[2].trim();
        if (key === 'completedSteps') current.completedSteps = val ? val.split(/、/) : [];
        else if (key === 'files') current.files = val ? val.split(/;\s*/) : [];
        else if (key) current[key] = val;
      }
    }
  }
  if (!header.sid) {
    const m = title.match(/^# Progress — (.+)$/);
    if (m) header.sid = m[1].trim();
  }
  return { header, milestones };
}

export function renderProgress(p) {
  const lines = [
    `# Progress — ${p.header.sid}`,
    `- sid: ${p.header.sid}`,
    `- updatedAt: ${p.header.updatedAt ?? ''}`,
    `- workspaceRoot: ${p.header.workspaceRoot ?? ''}`,
    `- schemaVersion: ${p.header.schemaVersion ?? SCHEMA_VERSION}`,
    '',
  ];
  for (const ms of p.milestones) {
    lines.push(`## 里程碑 ${ms.iso}`);
    if (ms.completedSteps.length) lines.push(`- 已完成步骤: ${ms.completedSteps.join('、')}`);
    if (ms.currentStatus) lines.push(`- 当前状态: ${ms.currentStatus}`);
    if (ms.nextSteps) lines.push(`- 下一步: ${ms.nextSteps}`);
    if (ms.keyDecisions) lines.push(`- 关键决定: ${ms.keyDecisions}`);
    if (ms.files.length) lines.push(`- 涉及文件: ${ms.files.join('; ')}`);
    lines.push('');
  }
  return lines.join('\n').replace(/\n+$/, '\n');
}

export function readProgressCore(root, sid) {
  const file = progressPath(root, sid);
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      const e = new Error(`NOT_INITIALIZED: ${file} 不存在，请先 createSession 引导创建进度文件`);
      e.code = 'NOT_INITIALIZED';
      throw e;
    }
    throw err;
  }
  return parseProgress(raw);
}

export function readProgress(root, sid) {
  return readProgressCore(root, sid);
}

export function writeProgressCore(root, sid, p, opts = {}) {
  const { now = new Date(), maxBytes = PROGRESS_MAX_BYTES } = opts;
  const nowIso = toUtcIso(now);
  p.header.updatedAt = nowIso;
  if (opts.workspace !== undefined && opts.workspace !== null) {
    // 每次写入记录当时的工作区根绝对路径（跨区核验的可机械执行锚点）
    p.header.workspaceRoot = assertValidWorkspace(opts.workspace);
  }
  let rendered = renderProgress(p);
  let bytes = Buffer.byteLength(rendered, 'utf8');
  // E3：超限 → 最旧里程碑的 已完成步骤/涉及文件 移入 archive；关键三区块保留
  const idxs = p.milestones
    .map((ms, i) => ({ ms, i }))
    .filter(({ ms }) => ms.completedSteps.length || ms.files.length)
    .sort((a, b) => a.i - b.i);
  for (const { ms } of idxs) {
    if (bytes <= maxBytes) break;
    archive.appendProgressBlock(root, sid, {
      msIso: ms.iso,
      completedSteps: ms.completedSteps,
      files: ms.files,
      archivedAtIso: nowIso,
    });
    ms.completedSteps = [];
    ms.files = [];
    rendered = renderProgress(p);
    bytes = Buffer.byteLength(rendered, 'utf8');
  }
  if (bytes > maxBytes) {
    const e = new Error(`PROGRESS_OVERFLOW: 进度 ${sid} 超限（${bytes} ≥ ${maxBytes}），关键三区块永不归档且仍超限`);
    e.code = 'PROGRESS_OVERFLOW';
    e.bytes = bytes;
    e.maxBytes = maxBytes;
    throw e;
  }
  atomicWrite(progressPath(root, sid), rendered);
  return { bytes };
}

export function appendMilestoneCore(root, sid, opts = {}) {
  const {
    completedSteps = [],
    currentStatus = '',
    nextSteps = '',
    keyDecisions = '',
    files = [],
    now = new Date(),
  } = opts;
  const iso = toUtcIso(now);
  let p;
  try {
    p = readProgressCore(root, sid);
  } catch (err) {
    if (err.code === 'NOT_INITIALIZED') {
      initProgress(root, sid, { workspaceRoot: opts.workspace });
      p = readProgressCore(root, sid);
    } else throw err;
  }
  p.milestones.push({
    iso,
    completedSteps: Array.isArray(completedSteps) ? completedSteps : [],
    currentStatus,
    nextSteps,
    keyDecisions,
    files: Array.isArray(files) ? files : [],
  });
  writeProgressCore(root, sid, p, opts); // opts.workspace 一并转发 → header.workspaceRoot 刷新
  return { iso };
}

export function appendMilestone(root, sid, opts = {}) {
  return withSessionLock(root, sid, () => appendMilestoneCore(root, sid, opts), opts);
}

/* ---------------- R2 就地改划界（2026-09-11 签字 rider） ----------------
 * 签字后仅「活区块」（当前状态/下一步/关键决定）可就地改；
 * 历史区块（已完成步骤/涉及文件/里程碑 iso 等）就地改 → ERRATA_REQUIRED 拒绝，
 * 只能追加勘误条目或新里程碑。
 */

const LIVE_BLOCK_KEYS = ['currentStatus', 'nextSteps', 'keyDecisions'];
// 写入链路基础设施键（透传给 writeProgressCore / heartbeat），不构成区块数据
const INFRA_KEYS = ['workspace', 'modelTurn', 'now', 'maxBytes'];

/** 守护：校验 patch 只含三个活区块键（+基础设施键）；含任何历史区块键 → ERRATA_REQUIRED。 */
export function assertLiveBlockOnly(patch = {}) {
  const ks = Object.keys(patch).filter((k) => patch[k] !== undefined && !INFRA_KEYS.includes(k));
  const bad = ks.filter((k) => !LIVE_BLOCK_KEYS.includes(k));
  if (bad.length > 0) {
    const e = new Error(
      `ERRATA_REQUIRED: 历史区块不可就地改（${bad.join(',')}）——只能追加勘误条目或新里程碑`
    );
    e.code = 'ERRATA_REQUIRED';
    throw e;
  }
  return ks;
}

export function updateLiveBlocksCore(root, sid, opts = {}) {
  const live = assertLiveBlockOnly(opts); // 历史区块就地改 → ERRATA_REQUIRED
  const p = readProgressCore(root, sid);
  if (p.milestones.length === 0) {
    const e = new Error('PROGRESS_NO_MILESTONE: 无里程碑可更新活区块，请先 appendMilestone');
    e.code = 'PROGRESS_NO_MILESTONE';
    throw e;
  }
  const last = p.milestones[p.milestones.length - 1];
  for (const k of live) last[k] = String(opts[k] ?? '');
  writeProgressCore(root, sid, p, opts); // workspace/now 透传 → header.workspaceRoot/updatedAt 刷新
  return { milestoneIso: last.iso, updated: live };
}

export function updateLiveBlocks(root, sid, opts = {}) {
  return withSessionLock(root, sid, () => updateLiveBlocksCore(root, sid, opts), opts);
}

/** 仅读 header（跨区核验用） */
export function readProgressHeader(root, sid) {
  return readProgressCore(root, sid).header;
}