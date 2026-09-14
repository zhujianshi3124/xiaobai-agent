/**
 * @local/agent-memory — mkdir 原子锁（设计稿 §6，缺口 c；2026-09-10 全局化修订）
 *
 * 拿锁：mkdir <数据根>/.locks/<锁名>.lock（原子性 = 拿锁），写入 owner.json。
 * 释放：删除 owner.json 后 rmdir 空锁目录。
 * 冲突：读 owner 判定——
 *   - pid 已不存在（进程死亡）→ 自动清理后重试；
 *   - createdAt 超过 LOCK_MAX_AGE_MS → 视为崩溃残留，清理后重试；
 *   - 否则（同机活跃属主）→ 等待至超时，报 LOCK_BUSY。
 * 清理只允许删除 owner 与空锁目录本身；锁目录外文件绝不触碰（L5）。
 *
 * 锁分两类（同一机制）：
 *   - 会话锁 .locks/<sid>.lock：写任何会话文件前必须持有（单活跃写者隔离，B）；
 *   - 全局注册表锁 .locks/registry.lock：所有 registry 读改写前必须持有
 *     （全机共享 registry，防止不同工作区的会话并发写坏注册表，§3 修订）。
 * 锁顺序约定：会话锁在外、registry 锁在内（全局一致，避免死锁）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LOCK_MAX_AGE_MS, LOCK_WAIT_MS } from './constants.js';
import { lockPath, registryLockPath, assertValidSid } from './paths.js';

function isPidAlive(pid) {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return false;
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM'; // EPERM: 存在但无权限；ESRCH: 不存在
  }
}

function readOwner(lockDir) {
  try {
    const raw = fs.readFileSync(path.join(lockDir, 'owner.json'), 'utf8');
    const owner = JSON.parse(raw);
    return {
      name: owner.name ?? null,
      pid: typeof owner.pid === 'number' ? owner.pid : null,
      createdAt: owner.createdAt ?? null,
      host: owner.host ?? null,
      createdAtMs: owner.createdAt ? Date.parse(owner.createdAt) : NaN,
    };
  } catch {
    return null;
  }
}

function dirAgeMs(dir, nowMs) {
  try {
    const st = fs.statSync(dir);
    return nowMs - st.mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * 判定锁是否过期可清理。
 * @param {object|null} owner
 * @param {number} nowMs
 * @param {number} maxAgeMs
 */
export function isLockStale(owner, nowMs, maxAgeMs) {
  if (!owner) {
    // owner.json 缺失：崩溃可能发生在 mkdir 与写 owner 之间；
    // 目录超龄才视为残留，否则保守等待（避免误删正在初始化中的锁）。
    return false; // 由调用方用目录年龄判定
  }
  if (owner.pid === null || !isPidAlive(owner.pid)) return true; // 属主进程已死
  if (Number.isNaN(owner.createdAtMs)) return true; // owner 损坏（无时间戳）→ 超龄等价
  return nowMs - owner.createdAtMs > maxAgeMs; // 超龄 → 崩溃残留
}

/**
 * 清理：只删除 owner.json；若锁目录已空则删除锁目录本身。
 * 返回 true 表示锁目录已被整体移除（可以立即重试拿锁）。
 * 返回 false 表示目录内仍有其他内容（绝不触碰，视为脏锁）。
 */
export function cleanupLock(lockDir) {
  const ownerFile = path.join(lockDir, 'owner.json');
  try {
    fs.rmSync(ownerFile, { force: true });
  } catch {
    /* 已不存在则忽略 */
  }
  try {
    const rest = fs.readdirSync(lockDir);
    if (rest.length === 0) {
      fs.rmdirSync(lockDir);
      return true;
    }
    return false; // 目录内还有别的文件 → 保守不删（L5）
  } catch {
    return false; // 目录本身也不存在了
  }
}

function sleepMs(ms) {
  const sab = new SharedArrayBuffer(4);
  const arr = new Int32Array(sab);
  Atomics.wait(arr, 0, 0, ms);
}

/**
 * 通用目录锁核心：独占 mkdir <dir>，owner.json 记录 { name, pid, createdAt, host }。
 * @param {string} dir 锁目录绝对路径
 * @param {string} name 锁名（记录到 owner.json，用于排查）
 * @param {object} [opts]
 * @param {number} [opts.waitMs] 活跃锁等待超时（默认 LOCK_WAIT_MS=3000）
 * @param {number} [opts.maxAgeMs] 锁最大寿命（默认 LOCK_MAX_AGE_MS）
 * @param {() => number} [opts.now] 时间源（测试注入）
 * @returns {{ release: () => void }}
 */
export function acquireDirLock(dir, name, opts = {}) {
  const {
    waitMs = LOCK_WAIT_MS,
    maxAgeMs = LOCK_MAX_AGE_MS,
    now = Date.now,
  } = opts ?? {};
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const start = now();
  let dirty = false; // 已发现脏锁（清理不掉），避免无限紧循环

  for (;;) {
    try {
      fs.mkdirSync(dir);
      // 拿锁成功：写 owner.json
      const owner = {
        name,
        pid: process.pid,
        createdAt: new Date(now()).toISOString(),
        host: os.hostname(),
      };
      fs.writeFileSync(path.join(dir, 'owner.json'), JSON.stringify(owner, null, 2), 'utf8');
      let released = false;
      return {
        release() {
          if (released) return;
          released = true;
          cleanupLock(dir);
        },
      };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      const nowMs = now();
      const owner = readOwner(dir);
      let stale;
      if (owner) {
        stale = isLockStale(owner, nowMs, maxAgeMs);
      } else {
        // owner 缺失：仅当锁目录本身超龄才判残留
        stale = dirty || dirAgeMs(dir, nowMs) > maxAgeMs;
      }
      if (stale && !dirty) {
        const removed = cleanupLock(dir);
        if (removed) continue; // 清掉了，立即重试
        dirty = true; // 目录内还有别的文件，不可清 → 转等待/超时
      }
      if (nowMs - start >= waitMs) {
        const e = new Error(
          `LOCK_BUSY: ${name} 的写锁被占用 (owner=${JSON.stringify(owner)})，等待 ${waitMs}ms 超时`
        );
        e.code = 'LOCK_BUSY';
        throw e;
      }
      sleepMs(50);
    }
  }
}

/**
 * 获取会话写锁。
 * @param {object} opts
 * @param {string} [opts.root] 数据根目录（省略 → 全局默认解析）
 * @param {string} opts.sid 会话 ID
 * @param {number} [opts.waitMs] 活跃锁等待超时（默认 LOCK_WAIT_MS=3000）
 * @param {number} [opts.maxAgeMs] 锁最大寿命（默认 LOCK_MAX_AGE_MS）
 * @param {() => number} [opts.now] 时间源（测试注入）
 * @returns {{ release: () => void }}
 */
export function acquireLock(opts) {
  const { root, sid } = opts ?? {};
  assertValidSid(sid);
  return acquireDirLock(lockPath(root, sid), sid, opts);
}

/**
 * 获取全局注册表锁 .locks/registry.lock。
 * 任何 registry 的读改写（createSession/updateStatus/heartbeat/handover 改
 * currentWorkspace）都必须持有此锁，防止不同工作区并发写坏 registry。
 */
export function acquireRegistryLock(opts = {}) {
  const { root } = opts;
  return acquireDirLock(registryLockPath(root), 'registry', opts);
}

/**
 * 在持有会话写锁的前提下执行 fn，无论成功失败都释放锁。
 * 仅转发锁相关选项（waitMs/maxAgeMs），避免把 now/modelTurn 等业务参数误传给锁。
 * @returns fn() 的返回值
 */
export function withSessionLock(root, sid, fn, opts = {}) {
  const lock = acquireLock({
    root,
    sid,
    waitMs: opts.waitMs,
    maxAgeMs: opts.maxAgeMs,
  });
  try {
    return fn();
  } finally {
    lock.release();
  }
}

/** 在持有全局 registry 锁的前提下执行 fn（锁顺序：在会话锁之内调用）。 */
export function withRegistryLock(root, fn, opts = {}) {
  const lock = acquireRegistryLock({
    root,
    waitMs: opts.waitMs,
    maxAgeMs: opts.maxAgeMs,
  });
  try {
    return fn();
  } finally {
    lock.release();
  }
}

/** 测试辅助：当前进程 pid 是否存活 */
export { isPidAlive };