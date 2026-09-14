// dsh-compact-router / guidance.js
//
// 二阶段①引导指令注入（2026-09-11）：压缩/交接后注入固定引导，内嵌全局数据根 + 会话 sid +
// ledger/progress 路径。注入文本**只从会话元数据（root/sid）生成**，不从 user 消息提取（§9-1/§12-2）。
// 全局数据根为固定绝对路径（跨工作区一致，§12-2），由部署配置提供（agentMemoryRoot），
// 缺省按主目录/.agent-memory（与 agent-memory resolveDataRoot 默认一致）。

import os from 'node:os';
import path from 'node:path';

export const GUIDANCE_SECTION = '## Agent-memory guidance';

export function defaultDataRoot() {
  return path.join(os.homedir(), '.agent-memory');
}

/** 固定注入引导全文（唯一模板）。root 尾部反斜杠归一化；sid 原样内嵌。 */
export function buildLedgerGuidance(root, sid) {
  const r = String(root ?? '').replace(/[\\/]+$/, '');
  const s = String(sid ?? '').trim();
  return `[ledger/progress] 会话 ${s}：请先读取 ${r}/sessions/${s}/ledger.md 与 progress.md，汇报任务清单与下一步后继续。`;
}

/** 完整注入区段（含标题）。 */
export function buildGuidanceSection(root, sid) {
  return `${GUIDANCE_SECTION}\n\n${buildLedgerGuidance(root, sid)}`;
}