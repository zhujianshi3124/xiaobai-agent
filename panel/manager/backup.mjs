import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function createBackup({ backupRoot, files, reason = null, note = null }) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = join(backupRoot, stamp);
  mkdirSync(dir, { recursive: true });
  const manifest = { stamp, createdAt: new Date().toISOString(), reason, note, files: [] };
  for (const abs of files) {
    if (!existsSync(abs)) continue;
    const text = readFileSync(abs);
    // D-01 修复：必须同时净化 Windows 盘符冒号。
    // 旧写法只替换 `\` 与 `/`，于是 `D:\a\x.yml` → `D:__a__x.yml`；而 `D:` 会被
    // Windows 解析为「盘符 / 备用数据流(ADS) 说明符」，copyFileSync 遂把内容写进
    // NTFS ADS，目录里只剩一个 0 字节的同名文件 `D` —— 肉眼与常规工具都读不到，
    // 属静默损坏。不用 path.basename 是为了**保留路径唯一性**（不同目录可能同名）。
    const name = abs.replace(/[:\\/]/g, "__").replace(/^__/, "");
    copyFileSync(abs, join(dir, name));
    manifest.files.push({ abs, savedAs: name, sha256: sha256(text) });
  }
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  return dir;
}

export function listBackups(backupRoot) {
  if (!existsSync(backupRoot)) return [];
  return readdirSync(backupRoot)
    .filter((name) => existsSync(join(backupRoot, name, "manifest.json")))
    .sort()
    .reverse();
}

// 快照 stamp 由 createBackup 生成：ISO 串的 `:`/`.` 全部替换为 `-`。恢复入口用它做
// 路径白名单（防 `../` 之类穿越），同时把「目录名即时间」的约定固定下来。
const SNAPSHOT_STAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;

/**
 * 读取一份写前快照中**指定文件**的镜像（D3 restoreSnapshot 的数据源）。
 * @returns {Object|null} { dir, manifest, entry, savedPath }；stamp 非法 / manifest 缺失 /
 *   不含该文件 / 镜像文件缺失 ⇒ null（调用方转成人话报错，绝不猜）。
 */
export function readSnapshotEntry(backupRoot, stamp, abs) {
  if (!SNAPSHOT_STAMP_RE.test(String(stamp || ""))) return null;
  const dir = join(backupRoot, stamp);
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) return null;
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return null;
  }
  const entry = (manifest.files || []).find((f) => f && f.abs === abs);
  if (!entry || !entry.savedAs) return null;
  const savedPath = join(dir, entry.savedAs);
  if (!existsSync(savedPath)) return null;
  return { dir, manifest, entry, savedPath };
}

/**
 * 列出包含指定文件的写前快照（新→旧）。配置快照恢复段（设计稿 §4.2）的数据源。
 */
export function listRestoreSnapshots(backupRoot, abs) {
  const out = [];
  for (const stamp of listBackups(backupRoot)) {
    const found = readSnapshotEntry(backupRoot, stamp, abs);
    if (!found) continue;
    const text = readFileSync(found.savedPath, "utf8");
    out.push({
      stamp,
      createdAt: found.manifest.createdAt ?? null,
      reason: found.manifest.reason ?? null,
      note: found.manifest.note ?? null,
      sha256: sha256(text),
      bytes: Buffer.byteLength(text, "utf8"),
    });
  }
  return out;
}
