/**
 * @local/agent-memory — §12-4 新工作区首次使用轻量健康检查（2026-09-11）
 *
 * 新工作区首次使用时验证：全局数据根可读、registry 可解析、registry 可锁、
 * 引导路径可解析（固定全局绝对路径）、schema 版本一致。
 * 失败给出明确引导而非静默降级。
 */
import fs from 'node:fs';
import path from 'node:path';
import { acquireRegistryLock, readRegistry, SCHEMA_VERSION } from './index.js';

/**
 * @param {object} opts
 * @param {string} opts.root       全局数据根（固定绝对路径）
 * @param {string} [opts.workspace] 新工作区绝对路径（仅记录）
 * @returns {{ ok: boolean, checks: Array<{name,ok,detail}> }}
 */
function defaultBuildLedgerGuidance(root, sid) {
  const r = String(root ?? '').replace(/[\\/]+$/, '');
  const s = String(sid ?? '').trim();
  return '[ledger/progress] 会话 ' + s + '：请先读取 ' + r + '/sessions/' + s + '/ledger.md 与 progress.md，汇报任务清单与下一步后继续。';
}

export function checkNewWorkspace({ root, workspace, buildLedgerGuidance } = {}) {
  const resolveGuidance = typeof buildLedgerGuidance === 'function'
    ? buildLedgerGuidance
    : defaultBuildLedgerGuidance;
  const checks = [];
  // ① 全局数据根存在且可读
  const rootOk = fs.existsSync(root);
  let writableProbe = false;
  if (rootOk) {
    try {
      fs.accessSync(root, fs.constants.W_OK);
      writableProbe = true;
    } catch {
      writableProbe = false;
    }
  }
  checks.push({
    name: '全局数据根可读写',
    ok: rootOk && writableProbe,
    detail: rootOk ? `${root}（可写=${writableProbe}）` : `数据根缺失：${root}（请先 createSession 初始化）`,
  });
  // ② registry 可解析
  let regOk = false;
  let regN = 0;
  if (rootOk) {
    try {
      const reg = readRegistry(root, { create: false });
      regOk = Array.isArray(reg.sessions);
      regN = (reg.sessions ?? []).length;
    } catch {
      regOk = false;
    }
  }
  checks.push({ name: 'registry 可解析', ok: regOk, detail: regOk ? `${regN} 条会话` : 'registry.json 缺失或损坏（请初始化数据根）' });
  // ③ registry 可锁（拿锁→释放；只产生临时锁目录）
  let lockOk = false;
  if (rootOk) {
    const lock = acquireRegistryLock({ root, waitMs: 500, maxAgeMs: 2000 });
    try {
      lockOk = true;
    } finally {
      lock.release();
    }
  }
  checks.push({ name: 'registry 可锁', ok: lockOk, detail: lockOk ? 'registry.lock 获取/释放成功' : '无法获取 registry 锁' });
  // ④ 引导路径可解析（固定全局绝对路径 + sid 占位）
  const probeSid = '20260101-00000000';
  const guidance = resolveGuidance(root, probeSid);
  const guidanceOk = guidance.includes('/sessions/' + probeSid + '/ledger.md');
  checks.push({ name: '引导路径可解析', ok: guidanceOk, detail: guidance });
  // ⑤ schema 版本一致（propag / registry version）
  checks.push({ name: 'schema 版本', ok: SCHEMA_VERSION === 1, detail: `schemaVersion=${SCHEMA_VERSION}` });

  const failed = checks.filter((c) => !c.ok);
  return { ok: failed.length === 0, checks };
}