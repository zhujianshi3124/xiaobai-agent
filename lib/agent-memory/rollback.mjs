#!/usr/bin/env node
/**
 * rollback.mjs — §11/§12 一键回滚：从外部备份（~/.agent-memory-backup，AGENT_MEMORY_BACKUP_DIR 覆盖）
 * 恢复生产根文件。快照路径映射：<备份根>/**  →  <数据根>/**（替换根前缀）。
 *
 * 用法：
 *   node rollback.mjs --list                       # 列出全部快照（新→旧）
 *   node rollback.mjs --restore <快照路径>          # 恢复单份快照（先备份当前文件再覆盖）
 *   node rollback.mjs --restore <快照路径> --dry-run
 * 安全：只允许恢复到生产根（PRODUCTION_ROOT）内的映射路径；沙箱根不允许回滚。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { PRODUCTION_ROOT } from './lib/script-guard.js';
import { atomicWrite } from './lib/index.js';

const BACKUP_ROOT = process.env.AGENT_MEMORY_BACKUP_DIR || path.join(os.homedir(), '.agent-memory-backup');

function allSnapshots(root) {
  const out = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(root);
  return out.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

/** 快照路径 → 生产根内原文件路径；不在生产根映射内 → null。 */
export function mapSnapshotToProd(snapshotPath, prodRoot = PRODUCTION_ROOT) {
  const rel = path.relative(BACKUP_ROOT, snapshotPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const segs = rel.split(path.sep);
  // COW 快照布局（backupFileBeforeWrite 产物）：<dir>/snapshots/<ts>__<name>
  // → 生产根 <prod>/<dir>/<name>（剥掉 snapshots/ 与时间戳前缀，否则会恢复成
  // 生产根内一个 snapshots/ 垃圾文件，2026-09-11 演练中发现并修复）。
  const snapIdx = segs.indexOf('snapshots');
  if (snapIdx !== -1 && snapIdx === segs.length - 2) {
    const name = segs[segs.length - 1].replace(/^\d{4}-\d{2}-\d{2}T[\d-]+Z__/, '');
    if (name && name !== segs[segs.length - 1]) {
      return path.resolve(prodRoot, ...segs.slice(0, snapIdx), name);
    }
  }
  return path.resolve(prodRoot, rel);
}

export function listSnapshots() {
  const snaps = allSnapshots(BACKUP_ROOT);
  return snaps.map((p) => ({ path: p, mtime: fs.statSync(p).mtimeMs, size: fs.statSync(p).size }));
}

export function restore(snapshotPath, { dryRun = false, prodRoot = PRODUCTION_ROOT } = {}) {
  if (!fs.existsSync(snapshotPath)) {
    const e = new Error(`SNAPSHOT_NOT_FOUND: ${snapshotPath}`);
    e.code = 'SNAPSHOT_NOT_FOUND';
    throw e;
  }
  const target = mapSnapshotToProd(snapshotPath, prodRoot);
  if (!target) {
    const e = new Error('ROLLBACK_TARGET_OUTSIDE_ROOT: 快照不在生产根映射内，拒绝');
    e.code = 'ROLLBACK_TARGET_OUTSIDE_ROOT';
    throw e;
  }
  if (path.resolve(target).startsWith(path.resolve(prodRoot) + path.sep) === false && path.resolve(target) !== path.resolve(prodRoot)) {
    const e = new Error('ROLLBACK_TARGET_OUTSIDE_ROOT: 目标不在生产根内');
    e.code = 'ROLLBACK_TARGET_OUTSIDE_ROOT';
    throw e;
  }
  const content = fs.readFileSync(snapshotPath, 'utf8');
  // 生产根内的目标文件先快照（覆盖前 COW，链式可回滚）
  if (dryRun) {
    return { target, bytes: Buffer.byteLength(content, 'utf8'), dryRun: true };
  }
  atomicWrite(target, content);
  return { target, bytes: Buffer.byteLength(content, 'utf8'), dryRun: false };
}

const args = process.argv.slice(2);
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (!isDirectRun) {
  // 被测试/其他模块导入：仅导出函数，不执行 CLI
} else if (args[0] === '--list') {
  const snaps = listSnapshots();
  console.log(`快照（${snaps.length}）：`);
  for (const s of snaps.slice(0, 30)) {
    console.log(`  ${new Date(s.mtime).toISOString()}  ${s.size}B  ${s.path}`);
  }
  if (snaps.length === 0) console.log('（备份根为空）');
} else if (args[0] === '--restore') {
  const snap = args[1];
  if (!snap) {
    console.error('用法：node rollback.mjs --restore <快照路径> [--dry-run]');
    process.exit(2);
  }
  const dryRun = args.includes('--dry-run');
  try {
    const r = restore(snap, { dryRun });
    console.log(`${dryRun ? '[dry-run] 将恢复' : '已恢复'}：${r.target}（${r.bytes}B）`);
  } catch (err) {
    console.error(`回滚失败：${err?.code ?? err?.message}`);
    process.exit(3);
  }
} else {
  console.error('用法：node rollback.mjs --list | --restore <快照> [--dry-run]');
  process.exit(2);
}