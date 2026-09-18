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
