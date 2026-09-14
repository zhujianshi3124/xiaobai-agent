// dsh-compact-router / archive.js
//
// Compaction archives — the "not a total loss" guarantee. Every compaction
// writes the FULL shadowed messages to a per-session JSONL file next to the
// agent-memory ledger (same data root), and the compacted summary carries a
// pointer to that file so a later model (or the user) can recover any detail
// the summarizer dropped. Write failures are never fatal: compaction proceeds
// without a pointer rather than blocking the conversation.

import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const ARCHIVE_PREFIX = "compaction-";
export const ARCHIVE_EXT = ".jsonl";
export const ARCHIVE_DIR_NAME = "compaction";

function sessionsDir(root) {
  return join(String(root ?? ""), "sessions");
}

function archiveDir(root, sid) {
  return join(sessionsDir(root), String(sid ?? ""), ARCHIVE_DIR_NAME);
}

function isArchiveFile(name) {
  return name.startsWith(ARCHIVE_PREFIX) && name.endsWith(ARCHIVE_EXT);
}

/** One JSONL line per message; oversized content is truncated with a marker. */
function archiveLine(seq, msg, maxCharsPerMessage) {
  const record = { seq, role: msg?.role ?? `message-${seq}`, content: msg?.content ?? "" };
  let line = JSON.stringify(record);
  if (line.length > maxCharsPerMessage) {
    record.content = String(record.content).slice(0, Math.max(0, maxCharsPerMessage));
    record.truncated = true;
    line = JSON.stringify(record);
  }
  return line;
}

/**
 * Write the full shadowed region to `<root>/sessions/<sid>/compaction/compaction-<ts>.jsonl`
 * and prune older archives down to `keep` files per session.
 * @returns { path, count, bytes } or null when nothing could be written.
 */
export function writeCompactionArchive({ root, sid, messages, keep = 10, maxBytes = 24 * 1024 * 1024 }) {
  try {
    const list = Array.isArray(messages) ? messages : [];
    if (!root || !sid || list.length === 0) return null;
    const dir = archiveDir(root, sid);
    mkdirSync(dir, { recursive: true });
    const perMessageCap = Math.max(1000, Math.floor(maxBytes / Math.max(1, list.length)));
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const path = join(dir, `${ARCHIVE_PREFIX}${stamp}${ARCHIVE_EXT}`);
    const lines = [];
    let bytes = 2;
    let count = 0;
    for (let i = 0; i < list.length; i += 1) {
      if (bytes >= maxBytes) {
        lines.push(JSON.stringify({ truncated: true, reason: "archive size cap", total: list.length, written: count }));
        break;
      }
      const line = archiveLine(i, list[i], perMessageCap);
      lines.push(line);
      bytes += line.length + 1;
      count += 1;
    }
    writeFileSync(path, lines.join("\n") + "\n");
    pruneArchives(dir, keep);
    const size = statSync(path).size;
    return { path, count, bytes: size };
  } catch {
    return null;
  }
}

/** Delete the oldest archives beyond `keep`. Best-effort; never throws. */
export function pruneArchives(dir, keep) {
  try {
    const n = Number(keep) > 0 ? Math.floor(Number(keep)) : 10;
    const files = readdirSync(dir)
      .filter(isArchiveFile)
      .map((name) => {
        const full = join(dir, name);
        try {
          return { name, full, mtime: statSync(full).mtimeMs };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime);
    for (const f of files.slice(n)) {
      try {
        rmSync(f.full, { force: true });
      } catch {
        // best-effort retention
      }
    }
  } catch {
    // directory may not exist yet — nothing to prune
  }
}

/** List a session's archives, newest first. Never throws. */
export function listCompactionArchives({ root, sid }) {
  try {
    const dir = archiveDir(root, sid);
    return readdirSync(dir)
      .filter(isArchiveFile)
      .map((name) => {
        const full = join(dir, name);
        try {
          const st = statSync(full);
          let count = 0;
          try {
            count = readFileSync(full, "utf8").split("\n").filter((l) => l.trim().length > 0).length;
          } catch {
            // unreadable content still lists with size/mtime
          }
          return { name, path: full, mtime: st.mtime, size: st.size, lines: count };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}

/** The pointer line appended to every compacted summary when an archive exists. */
export function buildArchivePointer(archive) {
  if (!archive || !archive.path) return "";
  return (
    `- [压缩存档] 本次被压缩的 ${archive.count} 条完整原文已存档：${archive.path}` +
    `（摘要可能省略细节；需要原文时用 read 工具按需查阅该文件）`
  );
}

/**
 * Enrichment appended to LLM-mode summaries (which otherwise contain neither
 * the memory guidance nor the ledger canon): canonical ledger instructions +
 * the read-the-ledger directive + the archive pointer. Bounded so the
 * engine's "summary must be smaller" token guard stays comfortable.
 */
export function buildEnrichmentText({ canonical, guidance, archivePointer, maxChars = 6000 }) {
  const parts = [];
  for (const p of [canonical, guidance, archivePointer]) {
    if (typeof p === "string" && p.trim().length > 0) parts.push(p.trim());
  }
  if (parts.length === 0) return "";
  let text = parts.join("\n\n");
  if (text.length > maxChars) text = text.slice(0, maxChars) + `\n…[enrichment truncated at ${maxChars} chars]`;
  return text;
}
