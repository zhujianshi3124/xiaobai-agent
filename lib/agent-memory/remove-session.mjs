#!/usr/bin/env node
/**
 * @local/agent-memory — 窄口径清理工具（2026-09-10 事故修复，用户拍板）
 *
 * 用法：
 *   node remove-session.mjs --sid <sid> [--root <自定义根>] [--allow-production]
 *
 * 语义：
 *   - 单会话、显式授权：生产根必须显式 --allow-production（护栏 parseScriptRoot 强制），
 *     默认只允许沙箱根；
 *   - 操作留痕：删除前对会话目录做外部备份快照，并把操作记录写入
 *     <备份根>/ops/（<备份根> 默认 <主目录>/.agent-memory-backup，位于生产根之外，
 *     整根消失时审计与快照不陪葬）；
 *   - 受保护真实记录（20260910-40da30ad 验收狗粮）禁止删除；
 *   - 用于清除生产根测试垃圾（ad0997ee / afb2e128），不用于任何真实会话。
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseScriptRoot, handleScriptGuardError, PRODUCTION_ROOT } from './lib/script-guard.js';
import { removeSession, readRegistry } from './lib/index.js';
import { BACKUP_DIR } from './lib/backup.js';

const PROTECTED = ['20260910-40da30ad'];

function usage() {
  console.error('用法: node remove-session.mjs --sid <sid> [--root <自定义根>] [--allow-production]');
  process.exit(2);
}

const args = process.argv;
const sidArg = args.indexOf('--sid');
const sid = sidArg !== -1 ? args[sidArg + 1] : null;
if (!sid) usage();

// --allow-production = 显式授权作用于生产根（无需手敲路径）；否则默认沙箱/自定义 --root。
const productionRequested = args.includes('--allow-production') || process.env.AGENT_MEMORY_ALLOW_PRODUCTION === '1';
let guard;
try {
  guard = productionRequested
    ? parseScriptRoot([...args, '--root', PRODUCTION_ROOT])
    : parseScriptRoot(args);
} catch (err) {
  handleScriptGuardError(err);
}
const { root, isProduction } = guard;

if (PROTECTED.includes(sid)) {
  console.error(`[remove-session] 拒绝：${sid} 为受保护的真实记录（验收狗粮），不允许删除`);
  process.exit(3);
}

const reg = readRegistry(root, { create: false });
const found = (reg.sessions ?? []).find((s) => s.sid === sid);
if (!found) {
  console.error(`[remove-session] 会话 ${sid} 不在根 ${root} 的注册表中`);
  process.exit(1);
}

const backupDir = BACKUP_DIR();
const opsDir = path.join(backupDir, 'ops');
fs.mkdirSync(opsDir, { recursive: true });

function recordOp(op) {
  const file = path.join(opsDir, `${new Date().toISOString().replace(/[:.]/g, '-')}__remove-session-${sid}.json`);
  fs.writeFileSync(file, JSON.stringify(op, null, 2), 'utf8');
  return file;
}

const removed = removeSession(root, sid, { recordOp, by: 'remove-session.mjs' });
console.log(
  `REMOVED session ${sid} (taskSummary=${JSON.stringify(removed.taskSummary)}) ` +
  `from ${root}${isProduction ? ' [生产根 · 显式 opt-in]' : ' [沙箱根]'}`
);
console.log(`操作留痕目录：${opsDir}`);