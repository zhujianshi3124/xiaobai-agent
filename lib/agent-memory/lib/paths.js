/**
 * @local/agent-memory — 路径与会话 ID（设计稿 §1；2026-09-10 全局化修订）
 *
 * 全局化：数据根目录 = 机器级全局目录。所有路径函数以「数据根」为基准：
 *   <数据根>/registry.json
 *   <数据根>/.locks/<sid>.lock | registry.lock
 *   <数据根>/sessions/<sid>/{ledger,progress,archive}.md
 *
 * 数据根解析（resolveDataRoot）：
 *   1) 显式 opts.dataRoot / 函数参数 root（最高优先）；
 *   2) 环境变量 AGENT_MEMORY_ROOT（新），AGENT_ROOT（兼容别名）；
 *   3) 默认 <用户主目录>/.agent-memory。
 *
 * 「工作区」是独立概念：调用方以 opts.workspace 传工作区根绝对路径；
 * registry 记录 homeWorkspace/currentWorkspace，跨工作区续写被禁止（§6）。
 */
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  DATA_DIR, DATA_ROOT_ENV, DATA_ROOT_ENV_LEGACY,
  LOCKS_DIR, SESSIONS_DIR, REGISTRY_LOCK_NAME, SID_RE,
} from './constants.js';

/** 会话 ID 生成：YYYYMMDD-xxxxxxxxxxxx（8 位日期 + 12 位随机小写 hex；旧 8 位由 SID_RE 兼容） */
export function generateSid(now = new Date()) {
  const y = String(now.getFullYear()).padStart(4, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = crypto.randomBytes(6).toString('hex'); // 12 hex chars
  return `${y}${m}${d}-${rand}`;
}

export function isValidSid(sid) {
  return typeof sid === 'string' && SID_RE.test(sid);
}

export function assertValidSid(sid) {
  if (!isValidSid(sid)) {
    const err = new Error(`INVALID_SID: "${sid}" 不匹配 /^\\d{8}-[a-z0-9]{8,12}$/`);
    err.code = 'INVALID_SID';
    throw err;
  }
}

/**
 * 解析全局数据根：
 *   opts.dataRoot（显式）> 环境变量 AGENT_MEMORY_ROOT > AGENT_ROOT（兼容）> 主目录/.agent-memory
 */
export function resolveDataRoot(opts = {}) {
  const explicit = opts?.dataRoot;
  const env = process.env[DATA_ROOT_ENV] ?? process.env[DATA_ROOT_ENV_LEGACY];
  const base = explicit || env || path.join(os.homedir(), DATA_DIR);
  return path.resolve(base);
}

/**
 * 归一化根参数：显式 root（=数据根）优先，否则按 opts/环境/主目录解析全局默认。
 * 所有内部路径函数都走这里，因此调用方省略 root 时自动落到全局数据根。
 */
export function rootOrGlobal(root, opts) {
  return root ?? resolveDataRoot(opts);
}

/** 工作区校验：必须是非空字符串且为绝对路径（跨工作区语义的前提） */
export function assertValidWorkspace(workspace) {
  if (typeof workspace !== 'string' || workspace.trim() === '' || !path.isAbsolute(workspace)) {
    const e = new Error(
      `INVALID_WORKSPACE: 工作区必须是绝对路径（收到 ${JSON.stringify(workspace)}）；请以 opts.workspace 传入工作区根目录`
    );
    e.code = 'INVALID_WORKSPACE';
    throw e;
  }
  return path.resolve(workspace);
}

/** 数据根目录本身（兼容旧导出名；root 参数即数据根） */
export function agentRoot(root, opts) {
  return rootOrGlobal(root, opts);
}

/** registry.json */
export function registryPath(root, opts) {
  return path.join(rootOrGlobal(root, opts), 'registry.json');
}

/** .locks 目录 */
export function locksDir(root, opts) {
  return path.join(rootOrGlobal(root, opts), LOCKS_DIR);
}

/** 单个会话锁目录：.locks/<sid>.lock */
export function lockPath(root, sid, opts) {
  assertValidSid(sid);
  return path.join(locksDir(root, opts), `${sid}.lock`);
}

/** 全局注册表锁目录：.locks/registry.lock（全机共享 registry 的写锁，§3/§6） */
export function registryLockPath(root, opts) {
  return path.join(locksDir(root, opts), `${REGISTRY_LOCK_NAME}.lock`);
}

/** 会话目录：sessions/<sid> */
export function sessionDir(root, sid, opts) {
  assertValidSid(sid);
  return path.join(rootOrGlobal(root, opts), SESSIONS_DIR, sid);
}

export function ledgerPath(root, sid, opts) {
  return path.join(sessionDir(root, sid, opts), 'ledger.md');
}

export function progressPath(root, sid, opts) {
  return path.join(sessionDir(root, sid, opts), 'progress.md');
}

export function archivePath(root, sid, opts) {
  return path.join(sessionDir(root, sid, opts), 'archive.md');
}

/**
 * 检索派生缓存目录：<dataRoot>/search/（S4 F-37 批2）。
 * 索引是派生缓存、不是正本：三正本文件零改动是硬红线，索引永不写回；
 * 本目录可随时整目录删除自愈（超限即弃，正本才是资产）。
 */
export function searchDir(root, opts) {
  return path.join(rootOrGlobal(root, opts), 'search');
}

/** 检索索引全局清单：<dataRoot>/search/MANIFEST.json */
export function searchManifestPath(root, opts) {
  return path.join(searchDir(root, opts), 'MANIFEST.json');
}

/** 检索索引逐会话段：<dataRoot>/search/<sid>.json */
export function searchSegmentPath(root, sid, opts) {
  assertValidSid(sid);
  return path.join(searchDir(root, opts), `${sid}.json`);
}