// dsh-compact-router / agent-memory.js — ④/§11：压缩插件读台账/进度/registry 作门禁与注入数据源
//
// 只读数据源：压缩时读取该会话 ledger 的进行中/待办条目，生成"指令正典副本 + 指针"
// （§11：checkpoint 指令区 = 台账副本 + 指针，文件为准；启发式降为兜底）。
// agent-memory lib 通过注入（agentMemoryLib，测试/部署接线传入）或懒加载
// '@local/agent-memory' 获得；不可用 → 返回 null（引擎降级启发式，不崩溃）。

/** 指令正典区段标题（§11） */
import * as suiteAgentMemory from '../agent-memory/lib/index.js';

export const CANONICAL_SECTION = '## Active instructions（正典副本，文件为准）';

/** 正典区段内永久指令渲染上限（防台账膨胀挤占压缩预算） */
const PERMANENT_MAX_RENDER = 8;

function normRoot(root) {
  return String(root ?? '').replace(/[\\/]+$/, '');
}

/** 指针行：固定标注正典文件路径（全局固定绝对路径，§12-2）。 */
export function buildLedgerPointer(root, sid) {
  const r = normRoot(root);
  const s = String(sid ?? '').trim();
  return `（正典：${r}/sessions/${s}/ledger.md，文件为准）`;
}

/** 解析 agent-memory lib：优先注入，其次懒加载 @local/agent-memory。 */
export async function loadAgentMemory(agentMemoryLib) {
  if (agentMemoryLib) return agentMemoryLib;
  return suiteAgentMemory;
}

/**
 * 宿主会话 id → agent-memory sid（2026-09-13 sid 一致性修复）。
 * agent.session.id 是宿主 UUID，而 memory 数据根按其自有 sid（YYYYMMDD-<12位>）建目录；
 * 直接用宿主 UUID 拼路径会指向不存在的台账（交接断链）。此 helper 走 memory 的
 * resolveSidByHostId 正规反向解析；lib 不可用或未入册 → 返回宿主 id 兜底（不抛错）。
 */
export async function resolveMemorySid({ agentMemoryLib, root, hostId }) {
  const raw = String(hostId ?? '').trim();
  if (!raw) return raw;
  try {
    const am = await loadAgentMemory(agentMemoryLib);
    const resolved = am && typeof am.resolveSidByHostId === 'function'
      ? am.resolveSidByHostId(root, raw)
      : null;
    if (am && !resolved) {
      // P3 加固（2026-09-13 夜）：lib 可用但反解失败 = 会话未入册（或宿主 id 非法）。
      // 兜底路径（宿主 id 拼 ledger/存档路径）必然指向不存在的文件——把静默降级
      // 改为显式告警，避免交接断链无人知晓。正常部署下新会话由 session/created
      // 自动入册，不应走到这里；持续出现请查 agent-memory 挂载。
      process.emitWarning(
        `[compact-router] 会话 ${raw} 未能从 agent-memory registry 反解出 sid（未入册或 id 非法）；` +
          '交接包按宿主 id 兜底，其台账/存档路径不可用。若持续出现请检查 agent-memory 是否挂载。',
      );
    }
    return resolved || raw;
  } catch {
    return raw;
  }
}

/**
 * 读台账：进行中/待办条目 + 永久指令（no/status/desc，永久指令带 permanent:true 标记）。
 * lib 不可用或台账缺失 → null（不抛）。
 */
export async function readLedgerItems({ agentMemoryLib, root, sid }) {
  const am = await loadAgentMemory(agentMemoryLib);
  if (!am || typeof am.readLedger !== 'function') return null;
  let led;
  try {
    led = am.readLedger(root, sid);
  } catch {
    return null;
  }
  const rows = [];
  // 永久指令（v1 内追加能力）：正典副本第一优先，随台账副本自然携带
  for (const p of Array.isArray(led?.permanent) ? led.permanent : []) {
    rows.push({ no: '永久', status: '', desc: String(p ?? ''), permanent: true });
  }
  for (const sec of ['进行中', '待办']) {
    for (const e of led?.sections?.[sec] ?? []) {
      rows.push({ no: e.no, status: e.status, desc: String(e.desc ?? '') });
    }
  }
  return rows;
}

/** 生成指令正典区段（副本 + 指针）；永久指令在前，条目在后；全空时给出显式占位（不静默）。 */
export function buildCanonicalInstructions(root, sid, items) {
  const list = Array.isArray(items) ? items : [];
  const permItems = list.filter((it) => it.permanent);
  const taskItems = list.filter((it) => !it.permanent);
  const lines = [CANONICAL_SECTION, '', buildLedgerPointer(root, sid)];
  if (permItems.length > 0) {
    lines.push('');
    for (const it of permItems.slice(0, PERMANENT_MAX_RENDER)) {
      lines.push(`- [永久] ${it.desc}`);
    }
  }
  if (taskItems.length > 0) {
    lines.push('');
    for (const it of taskItems.slice(0, 8)) {
      lines.push(`- [台账] ${it.no} [${it.status}] ${it.desc}`);
    }
  } else if (permItems.length === 0) {
    lines.push('', '- [台账] （无进行中/待办条目）');
  }
  return lines.join('\n');
}

/** 引擎入口：读台账副本 → 指令正典区段字符串（不可用返回 null，引擎降级启发式）。 */
export async function buildCanonicalFromLedger({ agentMemoryLib, root, sid }) {
  if (!sid) return null;
  const items = await readLedgerItems({ agentMemoryLib, root, sid });
  if (items === null) return null; // lib 不可用/台账缺失 → 启发式兜底
  const canon = buildCanonicalInstructions(root, sid, items);
  // §12.7 [永久] 自检（非阻断）：默认配方双行须进正典副本；缺失 → 告警留证（保持启发式兜底不崩溃）。
  const perms = (items ?? []).filter((it) => it.permanent).map((it) => String(it.desc ?? ''));
  const hasFirst = perms.some((d) => d.includes('始终用中文回复'));
  const hasSecond = perms.some((d) => d.startsWith('指令先落账'));
  if (!hasFirst || !hasSecond) {
    process.emitWarning(`[agent-memory][正典自检] 会话 ${sid} 正典副本缺默认永久行：始终用中文回复=${hasFirst}，指令先落账=${hasSecond}（永久行共 ${perms.length}）`);
  }
  return canon;
}

/**
 * 4b（2026-09-13）：台账陈旧提示。压缩出口用记忆侧 lastSeenTurn 比对台账 heartbeatTurn，
 * 台账落后（STALE）→ 返回一句提示：提醒新模型被压缩部分可能含未入账指令，可按存档指针查全文。
 * lib 不可用 / 无回合数据 / 新鲜 → 空串（不猜、不打扰；不阻断压缩）。
 */
export async function buildStaleHint({ agentMemoryLib, root, sid }) {
  if (!sid) return '';
  try {
    const am = await loadAgentMemory(agentMemoryLib);
    if (!am || typeof am.lastSeenTurn !== 'function' || typeof am.peekFreshness !== 'function') return '';
    const f = am.peekFreshness(root, sid, am.lastSeenTurn(root, sid));
    if (!f?.stale) return '';
    return `（台账提示：台账已落后约 ${f.behind} 个模型回合（新鲜上限 ${f.freshnessTurns}），被压缩部分可能含未入账指令——需要原始上下文时按存档指针查阅全文。）`;
  } catch {
    return '';
  }
}