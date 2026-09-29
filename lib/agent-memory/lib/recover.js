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
 * @param {boolean} [opts.lenient] 宽和态（EXE-BOOT-011 施工笔3，F）：未注册/无台账 → 返回 ''
 *   而非抛错（供自动接线调用方免逐个 try/catch）；缺省 false 维持既有抛错语义。
 * @returns {string}
 */
export function buildRecoveryReport(root, sid, opts = {}) {
  const { modelTurn, lenient = false } = opts;
  let rec = null;
  try {
    const reg = readRegistry(root, { create: false });
    rec = (reg.sessions ?? []).find((s) => s.sid === sid) ?? null;
  } catch (err) {
    if (lenient) return '';
    throw err;
  }
  if (!rec) {
    if (lenient) return '';
    const e = new Error(`SESSION_NOT_FOUND: 注册表中没有 ${sid}`);
    e.code = 'SESSION_NOT_FOUND';
    throw e;
  }
  let ledger;
  let p;
  try {
    ledger = readLedger(root, sid);
    p = readProgress(root, sid);
  } catch (err) {
    if (lenient) return '';
    throw err;
  }
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

/**
 * 恢复要点节选（EXE-BOOT-011 施工笔3；R4/R6 注入接线内容源，批准案 C）：
 * lenient 内建（未注册/无台账 → ''，渲染层空值节自动丢弃、零负担）＋限长（默认 1200 字符）。
 * 四要素：任务摘要 / 未完成指令（≤8 条、单条 ≤80 字符）/ 永久指令（≤4 行）/ 新鲜度。
 * 消费方＝plugin.js 的 agentMemory 系统提示词变量（R6/R4 接线）与未来任何"接手即读"调用面。
 */
export function buildRecoveryBrief(root, sid, opts = {}) {
  const { maxChars = 1200, modelTurn } = opts;
  let rec = null;
  try {
    const reg = readRegistry(root, { create: false });
    rec = (reg.sessions ?? []).find((x) => x.sid === sid) ?? null;
  } catch {
    return '';
  }
  if (!rec) return '';
  let led = null;
  try {
    led = readLedger(root, sid);
  } catch {
    return '';
  }
  if (!led) return '';
  const turn = modelTurn ?? led.header.heartbeatTurn;
  const g = checkFreshness(led.header, turn);
  const lines = [];
  lines.push(`【会话记忆】${rec.taskSummary || '(无摘要)'}（状态=${rec.status}）`);
  const unfinished = [];
  for (const sec of ['进行中', '待办', '已搁置']) {
    for (const e of led.sections[sec] ?? []) unfinished.push(e);
  }
  if (unfinished.length > 0) {
    lines.push('未完成指令:');
    for (const e of unfinished.slice(0, 8)) {
      lines.push(`  - ${e.no} [${e.status}] ${String(e.desc ?? '').slice(0, 80)}`);
    }
    if (unfinished.length > 8) lines.push(`  …另有 ${unfinished.length - 8} 条`);
  }
  const permanent = Array.isArray(led.permanent) ? led.permanent : [];
  if (permanent.length > 0) {
    lines.push('永久指令:');
    for (const line of permanent.slice(0, 4)) lines.push(`  - ${line}`);
  }
  lines.push(`新鲜度: ${g.code}${g.ok ? '' : `（落后 ${g.turns} 个模型回合，需先刷新台账）`}`);
  const text = lines.join('\n');
  return text.length > maxChars ? text.slice(0, maxChars) : text;
}