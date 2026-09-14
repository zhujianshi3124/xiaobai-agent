/**
 * .agent 体系 — 指令台账（设计稿 §2.1/§4/§5，约束 D）
 *
 * 结构：文件头（sid/dshSessionId/task/createdAt/updatedAt/heartbeatTurn/status）
 *       + 四个固定分区：进行中 / 待办 / 已完成 / 已搁置。
 * 条目：- L-NNN [状态] 描述；承接仅允许引用编号（D3）；未完成条目永不删除（D4）；
 *       已完成折叠一行 ≤80 字符并附 @完成（D5）；超限时最早已完成条目整体移入
 *       archive.md（D6）；全部未完成超限 → 拒绝写入 + LEDGER_OVERFLOW_ACTIVE（D7）。
 */
import fs from 'node:fs';
import {
  LEDGER_MAX_BYTES,
  ENTRY_STATUSES,
  FOLD_MAX_CHARS,
  COPY_MIN_CHARS,
  SCHEMA_VERSION,
  DEFAULT_PERMANENT_INSTRUCTIONS,
  PERMANENT_MAX_ITEMS,
  PERMANENT_MAX_CHARS,
} from './constants.js';
import { ledgerPath, archivePath } from './paths.js';
import { atomicWrite } from './atomic.js';
import { withSessionLock } from './lock.js';
import { toUtcIso } from './time.js';
import * as archive from './archive.js';

export const SECTION_ORDER = ['进行中', '待办', '已完成', '已搁置'];

/** 永久指令区（v1 内追加能力，2026-09-11）：常驻指令固化进台账；不参与条目计数/超限迁移。 */
export const PERMANENT_SECTION = '永久指令';

const ENTRY_LINE_RE = /^- (L-\d+) \[([^\]]+)\] (.*)$/;
const REF_RE = /承接\s+((?:L-\d+)(?:[、,， ]\s*L-\d+)*)/g;

/* ---------- 解析 / 渲染 ---------- */

export function parseLedger(raw) {
  const lines = String(raw).split(/\r?\n/);
  const header = {
    sid: null, dshSessionId: null, task: null,
    createdAt: null, updatedAt: null, heartbeatTurn: 0, schemaVersion: null, status: null,
  };
  const sections = { 进行中: [], 待办: [], 已完成: [], 已搁置: [] };
  const permanent = [];
  let current = null;
  const title = lines[0] ?? '';

  for (const line of lines) {
    const sec = line.match(/^## (.+)$/);
    if (sec) {
      current = sec[1];
      if (current !== PERMANENT_SECTION && !(current in sections)) sections[current] = [];
      continue;
    }
    const hm = line.match(/^- ([^:]+): (.*)$/);
    if (current === null && hm) {
      const key = hm[1].trim();
      if (key in header) {
        if (key === 'heartbeatTurn' || key === 'schemaVersion') header[key] = Number.parseInt(hm[2].trim(), 10) || 0;
        else header[key] = hm[2].trim() || null;
      }
      continue;
    }
    if (current !== null) {
      // 永久指令区：普通子弹行 → permanent（非 L-NNN 条目，不参与计数/迁移）
      if (current === PERMANENT_SECTION) {
        const pm = line.match(/^-\s+(.+)$/);
        if (pm) permanent.push(pm[1].trim());
        continue;
      }
      const em = line.match(ENTRY_LINE_RE);
      if (em) {
        sections[current].push(parseEntry(em[1], em[2], em[3]));
      }
    }
  }
  if (!header.sid) {
    const m = title.match(/^# Ledger — (.+)$/);
    if (m) header.sid = m[1].trim();
  }
  // R1（2026-09-11）：读取层推导"被勘误取代"标记（supersededBy，不落盘）
  const byNo = new Map();
  for (const sec of Object.keys(sections)) {
    for (const e of sections[sec]) byNo.set(e.no, e);
  }
  for (const sec of Object.keys(sections)) {
    for (const e of sections[sec]) {
      if (e.erratum?.supersedes?.length) {
        for (const t of e.erratum.supersedes) {
          const target = byNo.get(t);
          if (target) {
            target.supersededBy = target.supersededBy ?? [];
            if (!target.supersededBy.includes(e.no)) target.supersededBy.push(e.no);
          }
        }
      }
    }
  }
  return { header, sections, permanent, title };
}

function parseEntry(no, status, payload) {
  const completedAt = payload.match(/@完成\s+([^\s@]+)/)?.[1] ?? null;
  const archivedAt = payload.match(/@归档\s+([^\s@]+)/)?.[1] ?? null;
  // R1（2026-09-11）：机器可读勘误字段 @勘误 supersedes=L-NNN(,L-NNN)*
  const erratumRaw = payload.match(/@勘误\s+supersedes=([^\s@]+)/)?.[1] ?? null;
  const erratum = erratumRaw
    ? { supersedes: erratumRaw.split(',').map((s) => s.trim()).filter((s) => /^L-\d+$/.test(s)) }
    : null;
  const related = [];
  let desc = payload
    .replace(/@完成\s+[^\s@]+/g, '')
    .replace(/@归档\s+[^\s@]+/g, '')
    .replace(/@勘误\s+supersedes=[^\s@]+/g, '');
  desc = desc.replace(REF_RE, (_, list) => {
    for (const r of list.split(/[、,， ]+/)) {
      const t = r.trim();
      if (t) related.push(t);
    }
    return '';
  });
  desc = desc.replace(/^[；;,\s]+|[；;,\s]+$/g, '').trim();
  return { no, status, desc, related, completedAt, archivedAt, erratum };
}

function renderEntry(e) {
  const parts = [e.desc];
  if (e.related && e.related.length) parts.push(`承接 ${e.related.join('、')}`);
  let line = `- ${e.no} [${e.status}] ${parts.join('；')}`;
  if (e.completedAt) line += ` @完成 ${e.completedAt}`;
  if (e.archivedAt) line += ` @归档 ${e.archivedAt}`;
  if (e.erratum && e.erratum.supersedes?.length) line += ` @勘误 supersedes=${e.erratum.supersedes.join(',')}`;
  return line;
}

/** 读取层展示：被勘误取代的条目附「勿采信原文」标记（推导字段，不写盘）。 */
export function describeEntry(e) {
  let line = `- ${e.no} [${e.status}] ${e.desc}`;
  if (e.completedAt) line += ` @完成 ${e.completedAt}`;
  if (e.supersededBy?.length) line += ` 【勿采信原文（被 ${e.supersededBy.join('、')} 勘误取代）】`;
  return line;
}

export function renderLedger(ledger) {
  const h = ledger.header;
  const lines = [
    `# Ledger — ${h.sid}`,
    `- sid: ${h.sid}`,
    `- dshSessionId: ${h.dshSessionId ?? ''}`,
    `- task: ${h.task ?? ''}`,
    `- createdAt: ${h.createdAt ?? ''}`,
    `- updatedAt: ${h.updatedAt ?? ''}`,
    `- heartbeatTurn: ${h.heartbeatTurn ?? 0}`,
    `- schemaVersion: ${h.schemaVersion ?? SCHEMA_VERSION}`,
    `- status: ${h.status ?? '活跃'}`,
    '',
  ];
  // 永久指令区（v1 内追加能力）：紧邻头部之后，最显眼位置；空区不渲染（文件为准，不凭空发明）
  const permanent = Array.isArray(ledger.permanent) ? ledger.permanent : [];
  if (permanent.length > 0) {
    lines.push(`## ${PERMANENT_SECTION}`);
    for (const p of permanent) lines.push(`- ${p}`);
    lines.push('');
  }
  for (const sec of SECTION_ORDER) {
    lines.push(`## ${sec}`);
    for (const e of ledger.sections[sec] ?? []) lines.push(renderEntry(e));
    lines.push('');
  }
  return lines.join('\n').replace(/\n+$/, '\n');
}

/* ---------- 读写（锁内核心 + 公开带锁入口） ---------- */

export function readLedgerCore(root, sid) {
  const file = ledgerPath(root, sid);
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      const e = new Error(`NOT_INITIALIZED: ${file} 不存在，请先 createSession 引导创建台账`);
      e.code = 'NOT_INITIALIZED';
      throw e;
    }
    throw err;
  }
  const parsed = parseLedger(raw);
  if (parsed.header.sid !== sid) {
    const e = new Error(`SID_MISMATCH: 台账头部 sid=${parsed.header.sid} 与目录 ${sid} 不一致`);
    e.code = 'SID_MISMATCH';
    throw e;
  }
  return { header: parsed.header, sections: parsed.sections, permanent: parsed.permanent };
}

export function readLedger(root, sid) {
  return readLedgerCore(root, sid);
}

/** 仅读头部（门禁/心跳用），文件不存在抛 NOT_INITIALIZED */
export function readHeader(root, sid) {
  return readLedgerCore(root, sid).header;
}

export function writeLedgerCore(root, sid, ledger, opts = {}) {
  const { modelTurn, now = new Date(), maxBytes = LEDGER_MAX_BYTES } = opts;
  const nowIso = toUtcIso(now);
  const h = ledger.header;
  h.updatedAt = nowIso;
  if (modelTurn !== undefined && modelTurn !== null) {
    const t = Number(modelTurn);
    if (!Number.isNaN(t)) h.heartbeatTurn = t;
  }
  // 先模拟：超限则把最早已完成条目移入 archive，全部未完成仍超限 → 拒绝（不落盘）
  // 永久指令区（v1 内追加能力）不参与字节预算/超限迁移：计量时剔除该区段，
  // 永久指令再长也不挤占条目预算、不触发已完成条目归档。
  const moves = [];
  let cur = structuredClone(ledger);
  let rendered = renderLedger(cur);
  const budgetBytes = () => Buffer.byteLength(renderLedger({ ...cur, permanent: [] }), 'utf8');
  let bytes = budgetBytes();
  while (bytes > maxBytes && (cur.sections['已完成'] ?? []).length > 0) {
    const done = cur.sections['已完成'];
    done.sort((a, b) => {
      const at = (x) => (x.completedAt ? Date.parse(x.completedAt) : Number.POSITIVE_INFINITY);
      const d = at(a) - at(b);
      if (d !== 0) return d;
      return a.no.localeCompare(b.no);
    });
    const oldest = done.shift(); // 从已完成区最旧一条开始移
    oldest.archivedAt = nowIso;
    moves.push(oldest);
    rendered = renderLedger(cur);
    bytes = budgetBytes();
  }
  if (bytes > maxBytes) {
    const e = new Error(
      `LEDGER_OVERFLOW_ACTIVE: 台账 ${sid} 超限且全部为未完成条目（未完成 ${countUnfinished(cur)} 条，${bytes} 字节 ≥ ${maxBytes}）——已拒绝写入，文件保持原状；建议拆会话 / 移交 / 用户确认搁置`
    );
    e.code = 'LEDGER_OVERFLOW_ACTIVE';
    e.unfinishedCount = countUnfinished(cur);
    e.bytes = bytes;
    e.maxBytes = maxBytes;
    throw e;
  }
  // 落盘：先追加 archive（保持追加式），再原子写台账
  for (const ent of moves) archive.appendEntryLine(root, sid, renderEntry(ent));
  atomicWrite(ledgerPath(root, sid), rendered);
  return { bytesMove: bytes, moved: moves.length };
}

function countUnfinished(ledger) {
  let n = 0;
  for (const sec of SECTION_ORDER) {
    if (sec === '已完成') continue;
    n += (ledger.sections[sec] ?? []).length;
  }
  return n;
}

/* ---------- 会话初始化 / 头部更新 ---------- */

export function initLedger(root, sid, init = {}) {
  const { dshSessionId = null, task = '', createdAt, heartbeatTurn = 0, status = '活跃' } = init;
  const h = {
    sid,
    dshSessionId,
    task,
    createdAt: createdAt ? toUtcIso(createdAt) : new Date().toISOString(),
    updatedAt: createdAt ? toUtcIso(createdAt) : new Date().toISOString(),
    heartbeatTurn,
    schemaVersion: SCHEMA_VERSION,
    status,
  };
  const raw = renderLedger({
    header: h,
    sections: { 进行中: [], 待办: [], 已完成: [], 已搁置: [] },
    // 新会话固化默认永久指令（v1 内追加能力；双位置落盘=台账本身 + checkpoint 正典副本）
    permanent: [...DEFAULT_PERMANENT_INSTRUCTIONS],
  });
  atomicWrite(ledgerPath(root, sid), raw);
  return h;
}

/** 锁内核心：给头部打补丁（status 同步等）。调用方须已持有该 sid 的写锁。 */
export function patchLedgerCore(root, sid, patch, opts = {}) {
  const l = readLedgerCore(root, sid);
  Object.assign(l.header, patch);
  writeLedgerCore(root, sid, l, opts);
  return l.header;
}

export function patchLedger(root, sid, patch, opts = {}) {
  return withSessionLock(root, sid, () => patchLedgerCore(root, sid, patch, opts), opts);
}

/* ---------- 条目操作 ---------- */

function findEntry(sections, no) {
  for (const sec of SECTION_ORDER) {
    const e = (sections[sec] ?? []).find((x) => x.no === no);
    if (e) return { entry: e, section: sec };
  }
  return null;
}

function existsNo(sections, no) {
  return SECTION_ORDER.some((sec) => (sections[sec] ?? []).some((x) => x.no === no));
}

function nextNo(sections) {
  let max = -1;
  for (const sec of SECTION_ORDER) {
    for (const e of sections[sec] ?? []) {
      const n = Number.parseInt(e.no.replace(/^L-/, ''), 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
  }
  return `L-${String(max + 1).padStart(3, '0')}`;
}

function validateRelated(related, sections, sid) {
  if (related === null || related === undefined) return [];
  const list = typeof related === 'string' ? [related] : related;
  if (!Array.isArray(list)) {
    const e = new Error('INVALID_REFER: 承接字段必须是编号数组');
    e.code = 'INVALID_REFER';
    throw e;
  }
  const refs = [];
  for (const r of list) {
    if (typeof r !== 'string' || r.trim() === '') {
      const e = new Error('INVALID_REFER: 承接引用必须是字符串编号');
      e.code = 'INVALID_REFER';
      throw e;
    }
    const t = r.trim();
    if (/^L-\d+$/.test(t)) {
      if (!existsNo(sections, t)) {
        const e = new Error(`REF_NOT_FOUND: 承接引用的 ${t} 在台账中不存在`);
        e.code = 'REF_NOT_FOUND';
        throw e;
      }
      refs.push(t);
    } else if (t.length >= COPY_MIN_CHARS) {
      // D3：承接只允许编号，复制原文 → 拒绝
      const e = new Error(`COPY_NOT_ALLOWED: 承接只允许引用编号（L-NNN），禁止复制原文（${t.slice(0, 20)}…）`);
      e.code = 'COPY_NOT_ALLOWED';
      throw e;
    } else {
      const e = new Error(`INVALID_REFER: "${t}" 不是合法条目编号`);
      e.code = 'INVALID_REFER';
      throw e;
    }
  }
  return refs;
}

export function addEntryCore(root, sid, opts = {}) {
  const { desc, related, modelTurn, now, maxBytes } = opts;
  if (typeof desc !== 'string' || desc.trim() === '') {
    const e = new Error('EMPTY_DESC: 条目描述不能为空');
    e.code = 'EMPTY_DESC';
    throw e;
  }
  const l = readLedgerCore(root, sid);
  const refs = validateRelated(related, l.sections, sid);
  const entry = {
    no: nextNo(l.sections),
    status: '待办',
    desc: desc.trim(),
    related: refs,
    completedAt: null,
    archivedAt: null,
  };
  l.sections['待办'].push(entry);
  writeLedgerCore(root, sid, l, { modelTurn, now, maxBytes });
  return entry;
}

export function addEntry(root, sid, opts = {}) {
  return withSessionLock(root, sid, () => addEntryCore(root, sid, opts), opts);
}

/** R1 结构化勘误（2026-09-11 签字 rider）：创建机器可读勘误条目（@勘误 supersedes=L-NNN）。 */
export function addErratumCore(root, sid, opts = {}) {
  const { desc, supersedes = [], modelTurn, now = new Date(), maxBytes } = opts;
  if (typeof desc !== 'string' || desc.trim() === '') {
    const e = new Error('EMPTY_DESC: 条目描述不能为空');
    e.code = 'EMPTY_DESC';
    throw e;
  }
  if (!Array.isArray(supersedes) || supersedes.length === 0) {
    const e = new Error('ERRATA_REQUIRES_TARGET: 勘误必须指定 supersedes 目标条目');
    e.code = 'ERRATA_REQUIRES_TARGET';
    throw e;
  }
  const l = readLedgerCore(root, sid);
  const nos = new Set(Object.values(l.sections).flat().map((x) => x.no));
  const missing = supersedes.filter((n) => !nos.has(n));
  if (missing.length > 0) {
    const e = new Error(`ERRATA_TARGET_NOT_FOUND: ${missing.join(',')} 不存在，勘误被拒`);
    e.code = 'ERRATA_TARGET_NOT_FOUND';
    throw e;
  }
  const entry = {
    no: nextNo(l.sections),
    status: '已完成',
    desc: foldDesc(desc.trim()),
    related: [],
    completedAt: toUtcIso(now),
    archivedAt: null,
    erratum: { supersedes: [...supersedes] },
  };
  l.sections['已完成'].push(entry);
  writeLedgerCore(root, sid, l, { modelTurn, now, maxBytes });
  return entry;
}

export function addErratum(root, sid, opts = {}) {
  return withSessionLock(root, sid, () => addErratumCore(root, sid, opts), opts);
}

function moveTo(entry, from, to, sections) {
  const idx = sections[from].indexOf(entry);
  if (idx >= 0) sections[from].splice(idx, 1);
  sections[to].push(entry);
}

function foldDesc(desc) {
  const d = String(desc);
  if (d.length <= FOLD_MAX_CHARS) return d;
  // 折叠后总长 ≤ FOLD_MAX_CHARS（含省略号）：截到 FOLD_MAX_CHARS-1 再补 '…'
  return d.slice(0, FOLD_MAX_CHARS - 1) + '…';
}

export function setEntryStatusCore(root, sid, no, newStatus, opts = {}) {
  const { modelTurn, now = new Date(), maxBytes } = opts;
  if (!ENTRY_STATUSES.includes(newStatus)) {
    const e = new Error(`INVALID_ENTRY_STATUS: "${newStatus}" 不在 ${ENTRY_STATUSES.join('/')} 中`);
    e.code = 'INVALID_ENTRY_STATUS';
    throw e;
  }
  const l = readLedgerCore(root, sid);
  const hit = findEntry(l.sections, no);
  if (!hit) {
    const e = new Error(`ENTRY_NOT_FOUND: 条目 ${no} 不存在`);
    e.code = 'ENTRY_NOT_FOUND';
    throw e;
  }
  const { entry, section } = hit;
  entry.status = newStatus;
  if (newStatus === '已完成') {
    entry.desc = foldDesc(entry.desc);
    entry.completedAt = toUtcIso(now);
  } else {
    entry.completedAt = null; // 重新打开则撤销折叠时间戳
  }
  moveTo(entry, section, newStatus, l.sections);
  writeLedgerCore(root, sid, l, { modelTurn, now, maxBytes });
  return entry;
}

export function setEntryStatus(root, sid, no, newStatus, opts = {}) {
  return withSessionLock(root, sid, () => setEntryStatusCore(root, sid, no, newStatus, opts), opts);
}

export function removeEntryCore(root, sid, no, opts = {}) {
  const l = readLedgerCore(root, sid);
  const hit = findEntry(l.sections, no);
  if (!hit) {
    const e = new Error(`ENTRY_NOT_FOUND: 条目 ${no} 不存在`);
    e.code = 'ENTRY_NOT_FOUND';
    throw e;
  }
  if (hit.entry.status !== '已完成') {
    // D4：未完成条目永不删除
    const e = new Error(`ENTRY_UNFINISHED_DELETE: 未完成条目 ${no} 永不删除`);
    e.code = 'ENTRY_UNFINISHED_DELETE';
    throw e;
  }
  const idx = l.sections[hit.section].indexOf(hit.entry);
  l.sections[hit.section].splice(idx, 1);
  writeLedgerCore(root, sid, l, opts);
  return { removed: no };
}

export function removeEntry(root, sid, no, opts = {}) {
  return withSessionLock(root, sid, () => removeEntryCore(root, sid, no, opts), opts);
}

/**
 * 真实历史只追加不改写（设计稿 §13，2026-09-10 用户新增）：
 * 既有条目（无论状态）的内容一律不可改写；计划变更为「新条目 + 承接 L-NNN 引用」。
 * 本函数是守卫 API：任何改写尝试统一抛 ENTRY_HISTORY_IMMUTABLE（含已完成条目）。
 * 唯一允许的既有条目修改是状态字段（setEntryStatus）；其中置「已完成」时的自动折叠
 * 属状态迁移的既定格式化副作用，不算内容改写。
 */
export function editEntryContentCore(root, sid, no, newDesc, opts = {}) {
  const l = readLedgerCore(root, sid);
  const hit = findEntry(l.sections, no);
  if (!hit) {
    const e = new Error(`ENTRY_NOT_FOUND: 条目 ${no} 不存在`);
    e.code = 'ENTRY_NOT_FOUND';
    throw e;
  }
  const e = new Error(
    `ENTRY_HISTORY_IMMUTABLE: 条目 ${no}（状态=${hit.entry.status}）内容不可改写——真实历史只追加不改写（设计稿 §13）；计划变更请新增条目并用承接 L-NNN 引用`
  );
  e.code = 'ENTRY_HISTORY_IMMUTABLE';
  e.no = no;
  e.status = hit.entry.status;
  throw e;
}

export function editEntryContent(root, sid, no, newDesc, opts = {}) {
  return withSessionLock(root, sid, () => editEntryContentCore(root, sid, no, newDesc, opts), opts);
}

/* ---------- 永久指令区（v1 内追加能力） ---------- */

/** 校验永久指令列表：数组（或单串）；去空白；非空；条数/单条长度上限。 */
export function validatePermanentInstructions(list) {
  const arr = Array.isArray(list) ? list : [list];
  if (arr.length > PERMANENT_MAX_ITEMS) {
    const e = new Error(`PERMANENT_TOO_MANY: 永久指令最多 ${PERMANENT_MAX_ITEMS} 条，收到 ${arr.length}`);
    e.code = 'PERMANENT_TOO_MANY';
    throw e;
  }
  const cleaned = [];
  for (const x of arr) {
    const t = String(x ?? '').trim();
    if (t.length === 0) {
      const e = new Error('PERMANENT_EMPTY: 永久指令不能为空字符串');
      e.code = 'PERMANENT_EMPTY';
      throw e;
    }
    if (t.length > PERMANENT_MAX_CHARS) {
      const e = new Error(`PERMANENT_TOO_LONG: 单条永久指令最长 ${PERMANENT_MAX_CHARS} 字符，收到 ${t.length}`);
      e.code = 'PERMANENT_TOO_LONG';
      throw e;
    }
    cleaned.push(t);
  }
  return cleaned;
}

/** 锁内核心：整体替换永久指令列表（配置区语义；空数组=清空区段）。 */
export function setPermanentInstructionsCore(root, sid, list, opts = {}) {
  const l = readLedgerCore(root, sid);
  l.permanent = validatePermanentInstructions(list);
  writeLedgerCore(root, sid, l, opts);
  return l.permanent;
}

export function setPermanentInstructions(root, sid, list, opts = {}) {
  return withSessionLock(root, sid, () => setPermanentInstructionsCore(root, sid, list, opts), opts);
}

/** 供 archive.js 复用渲染（已完成条目的归档行） */
export { renderEntry, ENTRY_LINE_RE };