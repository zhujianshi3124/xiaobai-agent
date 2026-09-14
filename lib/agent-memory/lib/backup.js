/**
 * @local/agent-memory — 生产根自动备份（2026-09-10 事故修复，用户确认方案 A 修订版）
 *
 * 原则（用户拍板）：
 *   - 备份目录必须在生产根之外：默认 <主目录>/.agent-memory-backup（AGENT_MEMORY_BACKUP_DIR
 *     可覆盖）。本次事故是整根消失——备份在根内会同归于尽，故禁止 <根>/.backup/。
 *   - 写入前 COW 快照：凡「生产根内、即将被覆盖/删除的既有文件」，写入前复制到备份目录
 *     （保留最近 200 份，自动轮转）。
 *   - 只对生产根生效（测试/演示沙箱不产生备份噪音）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { PRODUCTION_ROOT } from './script-guard.js';

export { PRODUCTION_ROOT } from './script-guard.js';

/** 备份根（外部，默认 <主目录>/.agent-memory-backup；env 可覆盖） */
export const BACKUP_DIR = () => process.env.AGENT_MEMORY_BACKUP_DIR
  ? path.resolve(process.env.AGENT_MEMORY_BACKUP_DIR)
  : path.resolve(path.join(os.homedir(), '.agent-memory-backup'));

/** 保留快照份数（用户拍板：200） */
export const BACKUP_KEEP = 200;

/** 目标文件是否位于生产根内（只做路径判定，不落盘）。 */
export function isInsideProductionRoot(filePath) {
  const p = path.resolve(filePath);
  const pr = path.resolve(PRODUCTION_ROOT);
  return p === pr || p.startsWith(pr + path.sep);
}

/** 时间戳文件名段（Windows 安全字符） */
function tsName(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, '-');
}

/**
 * 对「生产根内已存在的」文件做覆盖前快照。
 * @param filePath 即将被覆盖/删除的文件
 * @param opts.force 强制备份（跳过生产根判定，单测用）
 * @param opts.backupDir 覆盖备份根（单测用）
 * @param opts.keep 保留份数
 * @returns 快照文件路径；无需备份时返回 null
 */
export function backupFileBeforeWrite(filePath, opts = {}) {
  if (!opts.force && !isInsideProductionRoot(filePath)) return null;
  if (!fs.existsSync(filePath)) return null;
  const backupDir = path.resolve(opts.backupDir ?? BACKUP_DIR());
  // 相对路径：生产根内 → sessions/<sid>/x；force（单测/删除前快照）→ forced/<hash>/<name>
  let rel = opts.force
    ? path.join('forced', crypto.createHash('sha1').update(path.resolve(filePath)).digest('hex').slice(0, 12), path.basename(filePath))
    : path.relative(PRODUCTION_ROOT, path.resolve(filePath));
  if (!opts.force && (rel.startsWith('..') || path.isAbsolute(rel))) return null; // 防御：偏移出根的路径不备份
  const destDir = path.join(backupDir, path.dirname(rel), 'snapshots');
  const dest = path.join(destDir, `${tsName()}__${path.basename(filePath)}`);
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(filePath, dest);
  rotateBackup(backupDir, opts.keep ?? BACKUP_KEEP);
  return dest;
}

/** 轮转：备份目录下文件数超过 keep 时删最旧（按 mtime）。 */
export function rotateBackup(backupDir, keep = BACKUP_KEEP) {
  if (!fs.existsSync(backupDir)) return;
  const files = [];
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(backupDir);
  if (files.length <= keep) return;
  files.sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
  for (const f of files.slice(0, files.length - keep)) {
    try { fs.rmSync(f, { force: true }); } catch { /* 容忍瞬时占用 */ }
  }
  // 清理空目录（由深到浅）
  const dirs = [];
  const walkDirs = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) { walkDirs(p); dirs.push(p); }
    }
  };
  if (fs.existsSync(backupDir)) walkDirs(backupDir);
  dirs.sort((a, b) => b.length - a.length);
  for (const d of dirs) { try { fs.rmdirSync(d); } catch { /* 非空则跳过 */ } }
}

/**
 * 对一整棵目录树做删除前快照（remove-session 删除会话目录前调用）。
 * 逐个文件 backupFileBeforeWrite；返回快照文件路径数组。
 */
export function backupTreeBeforeRemove(dirPath, opts = {}) {
  if (!fs.existsSync(dirPath)) return [];
  const out = [];
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else {
        const snap = backupFileBeforeWrite(p, opts);
        if (snap) out.push(snap);
      }
    }
  };
  walk(dirPath);
  return out;
}