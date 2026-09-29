/**
 * @local/agent-memory — 冷启动恢复报告（设计稿 §F；2026-09-10 恢复演示补课）
 *
 * 丢记忆事件（压缩后/切模型/重启/冷启动）后，以文件为准读回会话状态：
 * registry 记录 + ledger 台账 + progress 最新里程碑，生成人类可读恢复报告。
 * 只读不改（F1/F2：文件为准）。
 */
import { readRegistry } from './registry.js';
import { readLedger } from './ledger.js';
import { readProgress } from './progress.js';
import { checkFreshness } from './gate.js';

/**
 * 生成冷启动恢复报告（纯文本，多行）。
 * @param {string} [root] 数据根（省略 → 全局默认）
 * @param {string} sid
 * @param {object} [opts]
 * @param {number} [opts.modelTurn] 当前模型回合（缺省取台账 heartbeatTurn → 报告为 FRESH）
 * @returns {string}
 */
export function buildRecoveryReport(root, sid, opts = {}) {
  const { modelTurn } = opts;
  const reg = readRegistry(root, { create: false });
  const rec = (reg.sessions ?? []).find((s) => s.sid === sid) ?? null;
  if (!rec) {
    const e = new Error(`SESSION_NOT_FOUND: 注册表中没有 ${sid}`);
    e.code = 'SESSION_NOT_FOUND';
    throw e;
  }
  const ledger = readLedger(root, sid);
  const p = readProgress(root, sid);
  const last = p.milestones?.[p.milestones.length - 1] ?? null;
  const turn = modelTurn ?? ledger.header.heartbeatTurn;
  const g = checkFreshness(ledger.header, turn);
  const count = (sec) => (ledger.sections[sec] ?? []).length;

  const lines = [];
  lines.push(`【冷启动恢复报告】 sid=${sid}`);
  lines.push(`数据根: ${root ?? '(全局默认)'}`);
  lines.push(`任务摘要: ${rec.taskSummary || '(空)'}`);
  lines.push(`状态: ${rec.status}；homeWorkspace=${rec.homeWorkspace ?? '(未记录)'}；currentWorkspace=${rec.currentWorkspace ?? '(未记录)'}`);
  lines.push(`台账概览: 进行中 ${count('进行中')} 条 / 待办 ${count('待办')} 条 / 已完成 ${count('已完成')} 条 / 已搁置 ${count('已搁置')} 条 / 一般输入 ${count('一般输入')} 条`);
  const unfinished = [];
  for (const sec of ['进行中', '待办', '已搁置']) {
    for (const e of ledger.sections[sec] ?? []) unfinished.push(e);
  }
  if (unfinished.length) {
    lines.push('未完成指令:');
    for (const e of unfinished) lines.push(`  - ${e.no} [${e.status}] ${e.desc}`);
  } else {
    lines.push('未完成指令: (无)');
  }
  // 永久指令区（v1 内追加能力）：冷启动恢复（失忆模型读台账路径）必须带回常驻指令
  const permanent = Array.isArray(ledger.permanent) ? ledger.permanent : [];
  if (permanent.length) {
    lines.push('永久指令:');
    for (const p of permanent) lines.push(`  - ${p}`);
  }
  if (last) {
    lines.push('最新里程碑:');
    if (last.currentStatus) lines.push(`  当前状态: ${last.currentStatus}`);
    if (last.nextSteps) lines.push(`  下一步: ${last.nextSteps}`);
    if (last.keyDecisions) lines.push(`  关键决定: ${last.keyDecisions}`);
    if (last.files.length) lines.push(`  涉及文件: ${last.files.join('; ')}`);
  }
  lines.push(`心跳: heartbeatTurn=${ledger.header.heartbeatTurn}；模型回合=${turn}；新鲜度=${g.code}${g.ok ? '' : `（turns=${g.turns}，需先刷新台账）`}`);
  return lines.join('\n');
}