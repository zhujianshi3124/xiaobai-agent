/**
 * search-index.js — 本机检索索引（S4 F-37 检索半边；设计正本 docs/f37-search-design-c1-007.md §A）
 *
 * 索引是**派生缓存、不是正本**：三正本文件（ledger/progress/archive）零改动是硬红线，
 * 索引永不写回；<dataRoot>/search/ 目录可随时整目录删除自愈（超限即弃，正本才是资产）。
 *
 * 形态（§A2）：
 *   <dataRoot>/search/MANIFEST.json = {version, updatedAt, sessions:{sid:{gen,src,error?}}, totalBytes}
 *   <dataRoot>/search/<sid>.json    = {gen, src, entries:[{file,sec,no,status,text,ts,archived}]}
 * 逐会话段整档原子写（tmp＋rename，沿 atomic.js 既有惯例），不追加不改写他段。
 * 派生缓存写盘不走 atomicWrite/backupFileBeforeWrite——备份面只保正本，可再生缓存不入备份。
 * tmp 名沿用 `.tmp-<pid>-<hex>` 形状 ⇒ sweepTmpOrphans 天然覆盖本目录的写崩残件。
 *
 * 更新时机（§A3，全 best-effort，绝不影响正本读写路径）：
 *   ① 变更挂钩——组合层写路径（lib/index.js）正本提交后调 reindexSession，失败 emitWarning
 *     （段留旧值＝stale，读时自愈兜底）；
 *   ② 读时漂移——searchMemory 先比对 mtime/size，漂移会话先重建再查（自愈主路径，
 *     面板侧唯一强依赖的更新路径）；单会话正本读不了 ⇒ 记 error 跳过（同 src 不反复重建）；
 *   ③ 无启动钩子（纯懒，零启动负担）。
 *
 * 体积控制（§A4）：条目文本 500 字符截断；search/ 总量 >16MB 或 >2×正本 .md 总量 ⇒
 * 整目录弃置、本次全量重建。排除面：checkpoint-evidence.jsonl（在场证据日志）与 logs/
 * （插件自日志）不入索引——本索引只读 sessions/<sid>/ 三正本文件，两者天然不在读取面。
 *
 * 检索口径（§A5，裁3 v1）：大小写不敏感子串；范围＝registry 全量会话（含已归档/已移交），
 * workspace 可选前缀过滤；按 lastActiveAt 降序、limit 截断（缺省 20、上限 50）。
 * 解析复用 parseLedger/parseProgress/ENTRY_LINE_RE 族既有实现（同源，不二建解析器）。
 * 只读（绝不改任何记忆正本）＋零外传（零 fetch、零遥测、只读本机文件）。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { isValidSid } from './paths.js';
import {
  rootOrGlobal, ledgerPath, progressPath, archivePath,
  searchDir, searchManifestPath, searchSegmentPath,
} from './paths.js';
import { readRegistry } from './registry.js';
import { parseLedger, parseEntry, ENTRY_LINE_RE } from './ledger.js';
import { parseProgress, PROGRESS_FIELD_LINE_RE } from './progress.js';

/** search/ 全局体积上限（字节）：超过即整目录弃置重建（§A4） */
export const SEARCH_DIR_MAX_BYTES = 16 * 1024 * 1024;
/** 全局预算第二判据：search/ 总量超过正本 .md 总量的该倍数即弃置（§A4「>2×正本」） */
export const SEARCH_BUDGET_FACTOR = 2;
/** 单条目文本截断长度（§A2/§A4：条目文本 500 字符截断） */
export const ENTRY_TEXT_MAX_CHARS = 500;
/** 查询关键词长度上限（§B1：q≤200；超长＝查询非法，空结果＋参数提示） */
export const SEARCH_QUERY_MAX_CHARS = 200;
/** workspace 过滤参数长度上限（§B1：workspace≤256） */
export const SEARCH_WORKSPACE_MAX_CHARS = 256;
/** 返回条数缺省值（§B1：limit 缺省 20） */
export const SEARCH_LIMIT_DEFAULT = 20;
/** 返回条数上限（§B1/裁3：limit≤50） */
export const SEARCH_LIMIT_MAX = 50;
/** 索引结构版本（MANIFEST/段双写；升级不兼容时读侧按版本不符全量重建） */
export const SEARCH_INDEX_VERSION = 1;

/* ---------- 派生缓存原子写（不走备份面，见文件头） ---------- */

function atomicWriteCache(filePath, content) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`);
  try {
    fs.writeFileSync(tmp, content, 'utf8');
    fs.renameSync(tmp, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* tmp 不在场即无物可清 */ }
    throw err;
  }
}

/* ---------- 正本 src 指纹（mtime/size；漂移判据 §A3②） ---------- */

function statOrNull(file) {
  try {
    const st = fs.statSync(file);
    return { mtimeMs: Math.round(st.mtimeMs * 1000) / 1000, size: st.size };
  } catch {
    return null; // ENOENT 等：该正本不在场（旧会话可能没有 archive/progress）
  }
}

function srcStats(dr, sid) {
  return {
    ledger: statOrNull(ledgerPath(dr, sid)),
    progress: statOrNull(progressPath(dr, sid)),
    archive: statOrNull(archivePath(dr, sid)),
  };
}

function srcChanged(a, b) {
  return JSON.stringify(a ?? null) !== JSON.stringify(b ?? null);
}

/* ---------- 三正本 → 条目（解析同源；只读，零写回） ---------- */

function readTextOrNull(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err; // 非缺席的读失败＝该会话正本读不了（单会话跳过判据 §C3）
  }
}

function clip(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > ENTRY_TEXT_MAX_CHARS ? t.slice(0, ENTRY_TEXT_MAX_CHARS) + '…' : t;
}

function ledgerEntries(raw) {
  const parsed = parseLedger(raw);
  const out = [];
  const task = clip(parsed.header.task);
  if (task) out.push({ file: 'ledger', sec: '头部', no: null, status: parsed.header.status ?? null, text: task, ts: null, archived: false });
  for (const line of parsed.permanent) {
    const text = clip(line);
    if (text) out.push({ file: 'ledger', sec: '永久指令', no: null, status: null, text, ts: null, archived: false });
  }
  for (const sec of Object.keys(parsed.sections)) {
    for (const e of parsed.sections[sec]) {
      const text = clip(e.desc);
      if (!text) continue;
      out.push({ file: 'ledger', sec, no: e.no, status: e.status, text, ts: e.completedAt ?? e.archivedAt ?? null, archived: !!e.archivedAt });
    }
  }
  return out;
}

const MILESTONE_FIELDS = [
  ['completedSteps', '已完成步骤', (v) => v.join('、')],
  ['currentStatus', '当前状态', (v) => v],
  ['nextSteps', '下一步', (v) => v],
  ['keyDecisions', '关键决定', (v) => v],
  ['files', '涉及文件', (v) => v.join('; ')],
];

function progressEntries(raw) {
  const parsed = parseProgress(raw);
  const out = [];
  for (const ms of parsed.milestones) {
    for (const [key, label, fmt] of MILESTONE_FIELDS) {
      const rawVal = ms[key];
      const val = Array.isArray(rawVal) ? fmt(rawVal) : String(rawVal ?? '');
      const text = clip(`${label}：${val}`);
      if (text === `${label}：` || text === '') continue;
      out.push({ file: 'progress', sec: `里程碑 ${ms.iso}`, no: null, status: null, text, ts: ms.iso, archived: false });
    }
  }
  return out;
}

function archiveEntries(raw) {
  // archive.md 无固定分区头，parseLedger 的「条目须在 ## 区段内」前提不成立 ⇒
  // 按行扫：台账条目行走同源 ENTRY_LINE_RE＋parseEntry（@完成/@归档/@勘误 语义零复制）；
  // 里程碑归档块（appendProgressBlock 形态）走同源 PROGRESS_FIELD_LINE_RE。
  const out = [];
  let currentSec = '归档';
  for (const line of String(raw).split(/\r?\n/)) {
    const t = line.trim();
    if (t === '') continue;
    if (t.startsWith('## 里程碑归档')) {
      currentSec = '里程碑归档块';
      const text = clip(t.replace(/^##\s+/, ''));
      const ts = t.match(/@归档\s+([^\s@]+)/)?.[1] ?? null;
      if (text) out.push({ file: 'archive', sec: '里程碑归档', no: null, status: null, text, ts, archived: true });
      continue;
    }
    if (t.startsWith('#')) continue; // 标题行
    const em = t.match(ENTRY_LINE_RE);
    if (em) {
      const e = parseEntry(em[1], em[2], em[3]);
      const text = clip(e.desc);
      if (text) out.push({ file: 'archive', sec: '归档条目', no: e.no, status: e.status, text, ts: e.archivedAt ?? e.completedAt ?? null, archived: true });
      continue;
    }
    const fm = t.match(PROGRESS_FIELD_LINE_RE);
    if (fm) {
      const text = clip(t.replace(/^- /, ''));
      if (text) out.push({ file: 'archive', sec: currentSec, no: null, status: null, text, ts: null, archived: true });
      continue;
    }
    const text = clip(t);
    if (text) out.push({ file: 'archive', sec: '其他', no: null, status: null, text, ts: null, archived: true });
  }
  return out;
}

function collectEntries(dr, sid) {
  const out = [];
  const ledgerRaw = readTextOrNull(ledgerPath(dr, sid));
  if (ledgerRaw !== null) out.push(...ledgerEntries(ledgerRaw));
  const progressRaw = readTextOrNull(progressPath(dr, sid));
  if (progressRaw !== null) out.push(...progressEntries(progressRaw));
  const archiveRaw = readTextOrNull(archivePath(dr, sid));
  if (archiveRaw !== null) out.push(...archiveEntries(archiveRaw));
  return out;
}

/* ---------- MANIFEST / 段读写 ---------- */

function emptyManifest() {
  return { version: SEARCH_INDEX_VERSION, updatedAt: null, sessions: {}, totalBytes: 0 };
}

function readManifest(dr) {
  let raw;
  try {
    raw = fs.readFileSync(searchManifestPath(dr), 'utf8');
  } catch {
    return null; // 缺席/不可读 ⇒ 全量重建（§C3 自愈，用户无感）
  }
  try {
    const m = JSON.parse(raw);
    if (m && m.version === SEARCH_INDEX_VERSION && m.sessions && typeof m.sessions === 'object' && !Array.isArray(m.sessions)) return m;
  } catch { /* 损坏 ⇒ 全量重建 */ }
  return null;
}

/** 段文件整档读取；损坏/形状不符返回 null（调用方按正本重建，§C3 第 1 行） */
function readSegment(dr, sid) {
  let raw;
  try {
    raw = fs.readFileSync(searchSegmentPath(dr, sid), 'utf8');
  } catch {
    return null;
  }
  try {
    const seg = JSON.parse(raw);
    if (seg && typeof seg === 'object' && Array.isArray(seg.entries) && seg.src && typeof seg.src === 'object') return seg;
  } catch { /* 损坏 ⇒ 重建 */ }
  return null;
}

/** 重建单会话段：读三正本 → 条目 → 原子写段。正本读不了时抛错（调用方记 error 防反复）。 */
function rebuildSegment(dr, sid, prevGen) {
  const src = srcStats(dr, sid);
  const entries = collectEntries(dr, sid);
  const seg = { gen: (prevGen ?? 0) + 1, src, entries };
  atomicWriteCache(searchSegmentPath(dr, sid), JSON.stringify(seg));
  return seg;
}

function writeManifest(dr, manifest) {
  manifest.updatedAt = new Date().toISOString();
  manifest.totalBytes = 0;
  try {
    for (const name of fs.readdirSync(searchDir(dr))) {
      if (!name.endsWith('.json') || name === 'MANIFEST.json') continue;
      try { manifest.totalBytes += fs.statSync(path.join(searchDir(dr), name)).size; } catch { /* 瞬时消失按 0 计 */ }
    }
  } catch { /* 目录不在场＝0 */ }
  atomicWriteCache(searchManifestPath(dr), JSON.stringify(manifest, null, 2));
}

/** 全局预算（§A4）：超限整目录弃置，返回是否弃置（弃置后调用方按全量重建走） */
function enforceBudget(dr, manifest, sourceBytes) {
  if (!manifest) return false;
  const overAbsolute = (manifest.totalBytes ?? 0) > SEARCH_DIR_MAX_BYTES;
  const overFactor = sourceBytes > 0 && (manifest.totalBytes ?? 0) > SEARCH_BUDGET_FACTOR * sourceBytes;
  if (!overAbsolute && !overFactor) return false;
  try { fs.rmSync(searchDir(dr), { recursive: true, force: true }); } catch { /* 尽力而为；失败则本次仍按旧 manifest 走（下次再弃） */ }
  return true;
}

/* ---------- 变更挂钩（§A3①；组合层写路径在正本提交后调用） ---------- */

/**
 * 重建单会话段＋刷新 MANIFEST。挂钩/测试/工装入口；抛错由调用方决定形态
 * （组合层挂钩 catch 后 emitWarning，绝不影响正本写入路径）。
 */
export function reindexSession(root, sid) {
  if (!isValidSid(sid)) return null;
  const dr = rootOrGlobal(root);
  const manifest = readManifest(dr) ?? emptyManifest();
  const seg = rebuildSegment(dr, sid, manifest.sessions[sid]?.gen);
  manifest.sessions[sid] = { gen: seg.gen, src: seg.src };
  writeManifest(dr, manifest);
  return { sid, gen: seg.gen, entries: seg.entries.length };
}

/* ---------- 检索入口（§A5；面板路由唯一强依赖面） ---------- */

function snippetOf(text, lowerText, needle) {
  const idx = lowerText.indexOf(needle);
  if (idx < 0) return text;
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + needle.length + 60);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

/**
 * 本机检索（只读；零外传）。root 省略时按 resolveDataRoot 顺序（显式 > env > 缺省）解析。
 * 返回 { available:true, q, results, unreadable, sessions, notices, elapsedMs }；
 * registry 不可读等根级故障抛错（调用方降级 available:false），单会话正本损坏只计数跳过。
 */
export function searchMemory(root, opts = {}) {
  const started = Date.now();
  const dr = rootOrGlobal(root, opts);
  const notices = [];
  const q = typeof opts.q === 'string' ? opts.q.trim() : '';
  if (!q) notices.push('未提供查询关键词：输入关键词后检索（范围＝全部会话，含已归档）。');
  if (q.length > SEARCH_QUERY_MAX_CHARS) notices.push(`查询超长（上限 ${SEARCH_QUERY_MAX_CHARS} 字符），本次按空结果处理。`);
  let limit = SEARCH_LIMIT_DEFAULT;
  if (opts.limit !== undefined) {
    const n = Number(opts.limit);
    if (!Number.isInteger(n) || n < 1) notices.push(`limit 非法（应为 1–${SEARCH_LIMIT_MAX} 的整数），已按缺省 ${SEARCH_LIMIT_DEFAULT} 处理。`);
    else if (n > SEARCH_LIMIT_MAX) { limit = SEARCH_LIMIT_MAX; notices.push(`limit 上限 ${SEARCH_LIMIT_MAX}，已截断。`); }
    else limit = n;
  }
  let workspace = null;
  if (opts.workspace !== undefined && opts.workspace !== null && String(opts.workspace) !== '') {
    const ws = String(opts.workspace);
    if (ws.length > SEARCH_WORKSPACE_MAX_CHARS) notices.push(`workspace 参数超长（上限 ${SEARCH_WORKSPACE_MAX_CHARS} 字符），本次不过滤。`);
    else workspace = ws;
  }
  const empty = () => ({ available: true, q, results: [], unreadable: 0, sessions: 0, notices, elapsedMs: Date.now() - started });
  if (!q || q.length > SEARCH_QUERY_MAX_CHARS) return empty();

  let reg;
  try {
    reg = readRegistry(dr);
  } catch (err) {
    if (err?.code === 'NOT_INITIALIZED') return empty(); // 数据根尚无记忆：如实空结果，不算故障
    throw err; // 根级不可读：交调用方按 available:false 降级（§C3 第 3 行）
  }
  const sessions = (reg.sessions ?? []).filter((s) => {
    if (!workspace) return true;
    const low = workspace.toLowerCase();
    return [s.currentWorkspace, s.homeWorkspace].some((w) => typeof w === 'string' && w.toLowerCase().startsWith(low));
  });
  sessions.sort((a, b) => (Date.parse(b.lastActiveAt) || 0) - (Date.parse(a.lastActiveAt) || 0));

  // 全局预算：srcStats 顺带算正本总量（预算第二判据的分子），超限即弃置（§A4）
  const srcBySid = new Map();
  let sourceBytes = 0;
  for (const s of sessions) {
    const src = srcStats(dr, s.sid);
    srcBySid.set(s.sid, src);
    for (const k of ['ledger', 'progress', 'archive']) sourceBytes += src[k]?.size ?? 0;
  }
  let manifest = readManifest(dr);
  if (enforceBudget(dr, manifest, sourceBytes)) {
    notices.push('检索缓存超限已整目录弃置并重建（派生缓存超限即弃，正本不受影响）。');
    manifest = null;
  }

  // 漂移自愈主路径（§A3②）：比 src、缺段/坏段重建；单会话正本读不了 ⇒ 计数跳过（§C3 第 4 行）
  let manifestDirty = manifest === null;
  if (manifest === null) manifest = emptyManifest();
  // registry 已不含的 sid（会话被移除）⇒ 清 MANIFEST 记录＋删孤儿段（派生面随手清，正本面零触碰）
  for (const sid of Object.keys(manifest.sessions)) {
    if (!srcBySid.has(sid)) {
      delete manifest.sessions[sid];
      try { fs.rmSync(searchSegmentPath(dr, sid), { force: true }); } catch { /* 尽力而为 */ }
      manifestDirty = true;
    }
  }  let unreadable = 0;
  const segs = new Map();
  for (const s of sessions) {
    const sid = s.sid;
    const want = srcBySid.get(sid);
    const have = manifest.sessions[sid];
    let seg = null;
    const segmentMissing = have !== undefined && !fs.existsSync(searchSegmentPath(dr, sid));
    if (have?.error && !srcChanged(have.src, want)) {
      unreadable += 1; // 同一正本指纹的上次重建已失败：不反复重建（gen 防反复），本次继续跳过
      continue;
    }
    if (have === undefined || have.error || segmentMissing || srcChanged(have.src, want)) {
      try {
        seg = rebuildSegment(dr, sid, have?.gen);
        manifest.sessions[sid] = { gen: seg.gen, src: seg.src };
        manifestDirty = true;
      } catch (err) {
        unreadable += 1;
        manifest.sessions[sid] = { gen: (have?.gen ?? 0) + 1, src: want, error: String(err?.code ?? err?.message) };
        manifestDirty = true;
        continue;
      }
    } else {
      seg = readSegment(dr, sid);
      if (seg === null) {
        try {
          seg = rebuildSegment(dr, sid, have.gen);
          manifest.sessions[sid] = { gen: seg.gen, src: seg.src };
          manifestDirty = true;
        } catch (err) {
          unreadable += 1;
          manifest.sessions[sid] = { gen: (have?.gen ?? 0) + 1, src: want, error: String(err?.code ?? err?.message) };
          manifestDirty = true;
          continue;
        }
      }
    }
    segs.set(sid, seg);
  }
  if (manifestDirty) writeManifest(dr, manifest);

  // 匹配（裁3 v1：大小写不敏感子串；按 lastActiveAt 降序＝sessions 已排序；limit 截断）
  const needle = q.toLowerCase();
  const results = [];
  for (const s of sessions) {
    const seg = segs.get(s.sid);
    if (!seg) continue; // unreadable（已计数）
    for (const entry of seg.entries) {
      const lowerText = entry.text.toLowerCase();
      if (!lowerText.includes(needle)) continue;
      results.push({
        sid: s.sid,
        status: s.status ?? null,
        workspace: s.currentWorkspace ?? s.homeWorkspace ?? null,
        file: entry.file,
        sec: entry.sec,
        no: entry.no,
        text: entry.text,
        ts: entry.ts,
        snippet: snippetOf(entry.text, lowerText, needle),
      });
      if (results.length >= limit) break;
    }
    if (results.length >= limit) break;
  }
  return { available: true, q, results, unreadable, sessions: sessions.length, notices, elapsedMs: Date.now() - started };
}
