/**
 * evidence.js — checkpoint 在场证据日志（§12.9 候选②专用落点）
 *
 * 落点选择：专用 JSONL 证据日志（非里程碑）。理由：压缩(清上下文)是高频事件，
 * 若写成里程碑会让 progress 关键三区块随里程碑线性增长——2(a) 诊断已证里程碑是
 * 超限主因（三区块占正文 94.8%），32K 是买时间、绝不能拿高频压缩去加速烧穿。
 * 专用日志与 progress/台账解耦，按频率控制只增极少行，仍可审计（每条含 iso+sid+在场布尔）。
 *
 * 频率控制（模块内进程级节流）：按 `${root}|${dshSessionId}` 记忆上次结论；
 * 只有「在场结论翻变」或「距上次记录 ≥ 24h」才追加一行，其余直接跳过。
 * 宿主 id 只经统一归一化入口 tryNormalizeHostId → registry 反解 sid；未知会话不抛错。
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolveDataRoot, sessionDir } from './paths.js';
import { tryNormalizeHostId } from './normalize.js';
import { readRegistry } from './registry.js';

/** 最短重训间隔：满 24h 写一条在场/缺席心跳证据，防长会话期间证据链断档。 */
const EVIDENCE_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** 进程内节流状态：`${root}|${dshSessionId}` → { sid, ok, iso }。 */
const evidenceState = new Map();

export function evidencePath(root, sid) {
  return `${sessionDir(root, sid)}/checkpoint-evidence.jsonl`;
}

/** 归一化进程内反解缓存命中（只读，不落盘）。 */
function resolveSidOrNull(root, host) {
  const key = `${root}|${host}`;
  const cached = evidenceState.get(key);
  if (cached) return cached.sid;
  try {
    const reg = readRegistry(root);
    // 兼容历史记录（2026-09-13）：存量个别 dshSessionId 带 session- 前缀，两侧归一化后匹配。
    const rec = (reg.sessions ?? []).find((s) => {
      const stored = tryNormalizeHostId(s.dshSessionId);
      return stored !== null && stored === host;
    }) ?? null;
    return rec?.sid ?? null;
  } catch (err) {
    if (err?.code !== 'NOT_INITIALIZED') throw err;
    return null;
  }
}

/**
 * 追加一条 checkpoint 在场证据（节流后）。
 * @param root 数据根（缺省=全局默认根）
 * @param dshSessionId 宿主会话 UUID（只经归一化入口）
 * @param opts.ok 在场布尔：true=压缩产物含 [永久] 双行；false=缺席
 * @returns { sid, written, ok, reason?, path? }
 */
export function recordCheckpointEvidence(root, dshSessionId, opts = {}) {
  const r = root ?? resolveDataRoot();
  const host = tryNormalizeHostId(dshSessionId);
  if (!host) return { sid: null, written: false, reason: 'unknown-host-id' };
  const sid = resolveSidOrNull(r, host);
  if (!sid) return { sid: null, written: false, reason: 'unknown-sid' };

  const ok = opts.ok === true;
  const now = new Date();
  const key = `${r}|${host}`;
  const prev = evidenceState.get(key);
  const stale = !prev || now.getTime() - new Date(prev.iso).getTime() >= EVIDENCE_MIN_INTERVAL_MS;
  if (prev && prev.ok === ok && !stale) {
    return { sid, ok, written: false, reason: 'throttled' };
  }

  const path = evidencePath(r, sid);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify({
    iso: now.toISOString(),
    sid,
    checkpoint: ok ? '双行在场=是' : '双行缺席=否',
    ok,
  })}\n`, 'utf8');
  evidenceState.set(key, { sid, ok, iso: now.toISOString() });
  return { sid, ok, written: true, path };
}