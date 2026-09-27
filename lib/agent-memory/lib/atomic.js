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
  try {
    fs.writeFileSync(tmp, content, 'utf8');
    fs.renameSync(tmp, filePath);
  } catch (err) {
    try {
      fs.unlinkSync(tmp); // 失败路径不留 .tmp 孤儿（EXE-BOOT-010 开工令 2）；回收尽力而为，原错误照传
    } catch {
      /* tmp 不在场即无物可清 */
    }
    throw err;
  }
}

/** atomicWrite 的 tmp 命名形状：.tmp-<pid>-<hex>。回收面只认这个形状；目录一律不动。 */
const TMP_NAME_RE = /^\.tmp-\d+-[0-9a-f]+$/;

/** 启动清扫最短年龄：60s——tmp 正常寿命 <100ms，60s 足证写入方不在场（防误扫并发实例的在飞 tmp）。 */
export const TMP_SWEEP_MIN_AGE_MS = 60 * 1000;

/**
 * 启动清扫 .tmp 孤儿（EXE-BOOT-010 开工令 2）：原子写失败路径之外的第二道回收——
 * 写入方进程崩溃（write 与 rename 之间）留下的 tmp 无法自清，由下一次启动按年龄回收
 * （9/14 生产根残件即此形态）。手写递归走层，尽力而为：单文件失败记 errors 继续，
 * 目录一律不碰，root 不在场视为无事可做。
 * @param opts.now 注入时间（毫秒，测试用）；opts.maxAgeMs 覆盖默认年龄闸。
 * @returns { removed: string[], errors: {path, code}[] }
 */
export function sweepTmpOrphans(root, opts = {}) {
  const removed = [];
  const errors = [];
  const nowMs = Number.isFinite(opts.now) ? opts.now : Date.now();
  const maxAgeMs = Number.isFinite(opts.maxAgeMs) ? opts.maxAgeMs : TMP_SWEEP_MIN_AGE_MS;
  if (!root || !fs.existsSync(root)) return { removed, errors };
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      errors.push({ path: dir, code: err?.code ?? String(err) });
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile() || !TMP_NAME_RE.test(entry.name)) continue;
      try {
        if (nowMs - fs.statSync(abs).mtimeMs <= maxAgeMs) continue; // 新鲜/在飞 tmp 不动
        fs.unlinkSync(abs);
        removed.push(abs);
      } catch (err) {
        errors.push({ path: abs, code: err?.code ?? String(err) });
      }
    }
  };
  walk(root);
  return { removed, errors };
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
