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
    const name = abs.replace(/[\\/]/g, "__").replace(/^__/, "");
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
