/**
 * @local/agent-memory — 跨工作区一致性检查与移交（设计稿 §6 修订，2026-09-10）
 *
 * 全局化后会话文件在机器级数据根，但会话与「工作区」绑定（registry 的
 * homeWorkspace/currentWorkspace）。跨工作区续写必须：
 *
 *   1) collectInvolvedFiles(root, sid)：收集会话「涉及文件」——进度文件各里程碑
 *      记录的 涉及文件（相对路径，相对工作区根）；
 *   2) checkWorkspaceConsistency(root, sid, targetWorkspace)：逐项核对涉及文件在
 *      「目标工作区」的存在与一致性——
 *        - 目标缺失 → missing[]（列出路径）；
 *        - 与源工作区同路径文件内容不一致（以源为基准）→ inconsistent[]（列出路径）；
 *        - 源文件已不存在时只要求目标存在（不做内容比对）；
 *   3) handoverToWorkspace(root, sid, targetWorkspace, { confirmed })：
 *      未确认（confirmed=false）→ 拒绝 + 附检查差异清单；确认后 → 更新
 *      currentWorkspace=目标工作区，之后只允许在新工作区续写（旧工作区写被拒）。
 *
 * 禁止静默在错误工作区续写：组合层 assertWritable 发现工作区不符 → WORKSPACE_MISMATCH。
 */
import fs from 'node:fs';
import path from 'node:path';
import { getSession, findSession, persistRegistry, readRegistry } from './registry.js';
import { readProgressCore } from './progress.js';
import { withSessionLock, withRegistryLock } from './lock.js';
import { assertValidWorkspace, rootOrGlobal } from './paths.js';

/** 收集会话涉及文件：进度文件各里程碑 涉及文件 的并集（去重保序） */
export function collectInvolvedFiles(root, sid) {
  let p;
  try {
    p = readProgressCore(root, sid);
  } catch (err) {
    if (err.code === 'NOT_INITIALIZED') return [];
    throw err;
  }
  const seen = new Set();
  const files = [];
  for (const ms of p.milestones ?? []) {
    for (const f of ms.files ?? []) {
      if (typeof f === 'string' && f.trim() !== '' && !seen.has(f)) {
        seen.add(f);
        files.push(f);
      }
    }
  }
  return files;
}

/**
 * 工作区一致性检查（只读，不落盘、不改注册表）。
 * @param {string} [root] 数据根
 * @param {string} sid
 * @param {string} targetWorkspace 目标工作区根（绝对路径）
 * @returns {{ ok, source, target, checked, missing, inconsistent }}
 */
export function checkWorkspaceConsistency(root, sid, targetWorkspace) {
  const dr = rootOrGlobal(root);
  const target = assertValidWorkspace(targetWorkspace);
  const rec = getSession(dr, sid);
  if (!rec) {
    const e = new Error(`NOT_REGISTERED: 会话 ${sid} 未在注册表中`);
    e.code = 'NOT_REGISTERED';
    throw e;
  }
  if (!rec.currentWorkspace) {
    const e = new Error(`NO_CURRENT_WORKSPACE: 会话 ${sid} 未记录当前工作区，无法做一致性检查；请先确认其 homeWorkspace`);
    e.code = 'NO_CURRENT_WORKSPACE';
    throw e;
  }
  const source = path.resolve(rec.currentWorkspace);
  const files = collectInvolvedFiles(dr, sid);
  const missing = [];
  const inconsistent = [];
  for (const f of files) {
    const srcPath = path.isAbsolute(f) ? f : path.join(source, f);
    const dstPath = path.isAbsolute(f) ? f : path.join(target, f);
    if (!fs.existsSync(dstPath)) {
      missing.push({ file: f, srcPath, dstPath });
      continue;
    }
    // 源存在 && 目标存在：内容必须一致（以源为基准）；源已不存在 → 只要求目标存在
    if (fs.existsSync(srcPath) && fs.statSync(srcPath).isFile() && fs.statSync(dstPath).isFile()) {
      const a = fs.readFileSync(srcPath);
      const b = fs.readFileSync(dstPath);
      if (!a.equals(b)) {
        inconsistent.push({ file: f, srcPath, dstPath });
      }
    }
  }
  return {
    ok: missing.length === 0 && inconsistent.length === 0,
    source,
    target,
    checked: files.length,
    missing,
    inconsistent,
  };
}

/**
 * 跨工作区移交：
 * - confirmed=false（默认）→ 只要检查不通过即抛 HANDOVER_NOT_CONFIRMED（附 check 差异清单）；
 *   检查通过但未确认时同样拒绝（移交是用户可见动作，必须显式确认）。
 * - confirmed=true → 以用户确认为准：即使存在缺失/不一致，也接管并在返回值携带
 *   告警清单（警告但不静默）；更新 registry currentWorkspace=目标（registry 锁内）。
 * @returns {{ sid, currentWorkspace, check }}
 */
export function handoverToWorkspace(root, sid, targetWorkspace, opts = {}) {
  const { confirmed = false, now = new Date() } = opts;
  const dr = rootOrGlobal(root);
  const target = assertValidWorkspace(targetWorkspace);
  const check = checkWorkspaceConsistency(dr, sid, target);
  if (!confirmed) {
    if (!check.ok) {
      const e = new Error(
        `WORKSPACE_INCONSISTENT: 会话 ${sid} 跨工作区移交一致性检查未通过 —— 缺失 ${check.missing.length} 项、不一致 ${check.inconsistent.length} 项（详见 check 字段）；请补齐/核对后再移交，或显式 confirmed:true 确认接管`
      );
      e.code = 'WORKSPACE_INCONSISTENT';
      e.check = check;
      throw e;
    }
    const e = new Error(
      `HANDOVER_NOT_CONFIRMED: 跨工作区移交 ${sid} → ${target} 需要用户显式确认（confirmed: true）。当前一致性检查：缺失 ${check.missing.length} 项、不一致 ${check.inconsistent.length} 项`
    );
    e.code = 'HANDOVER_NOT_CONFIRMED';
    e.check = check;
    throw e;
  }
  const result = withSessionLock(dr, sid, () =>
    withRegistryLock(dr, () => {
      const reg = readRegistry(dr, { create: false });
      const rec = findSession(reg, sid);
      if (!rec) {
        const e = new Error(`SESSION_NOT_FOUND: 注册表中没有 ${sid}`);
        e.code = 'SESSION_NOT_FOUND';
        throw e;
      }
      rec.currentWorkspace = target;
      persistRegistry(dr, reg, now);
      return rec;
    }, opts), opts);
  return { sid, currentWorkspace: result.currentWorkspace, check };
}