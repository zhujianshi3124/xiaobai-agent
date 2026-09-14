/**
 * 原子写（tmp + rename）
 *
 * 2026-09-10 事故修复：写生产根内既有文件前，先做外部 COW 快照（见 backup.js；
 * 备份目录在 <主目录>/.agent-memory-backup，位于生产根之外——整根消失备份不陪葬）。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { backupFileBeforeWrite } from './backup.js';

export function atomicWrite(filePath, content) {
  backupFileBeforeWrite(filePath); // 生产根内既有文件覆盖前快照（沙箱根自动跳过）
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`);
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, filePath);
}

/** 读 JSON，文件缺失时按 mode 决定：'create' 建默认 / 'strict' 抛 NOT_INITIALIZED */
export function readJson(filePath, mode = 'strict', makeDefault = () => ({})) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      if (mode === 'create') {
        const def = makeDefault();
        atomicWrite(filePath, JSON.stringify(def, null, 2));
        return def;
      }
      const e = new Error(`NOT_INITIALIZED: ${filePath} 不存在`);
      e.code = 'NOT_INITIALIZED';
      throw e;
    }
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch {
    const e = new Error(`CORRUPT_JSON: ${filePath} 无法解析`);
    e.code = 'CORRUPT_JSON';
    throw e;
  }
}
