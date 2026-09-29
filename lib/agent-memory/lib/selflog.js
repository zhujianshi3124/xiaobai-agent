/**
 * selflog.js — 插件自日志（诊断可达性结构缺口③的 agent-memory 半边；EXE-BOOT-010 开工令 1）
 *
 * 落点：<dataRoot>/logs/agent-memory.jsonl。事件行五种＝register（每启动实例在位自证，
 * 成败各落一行）＋created/claimed/pre-step/disposed（sid 解析成败＋原因码；created/claimed
 * 另带工作区取数命中环 wsRing——header=宿主真值环，fallback:*=回落环，EXE-BOOT-011 施工笔
 * 二.2 取数可见件：回落即观测、不再静默潜伏）。
 *
 * JSONL 形态对齐 rate-throttle（logs/llm-requests.jsonl）：一行一 JSON、appendFileSync
 * 尽力而为、失败经 emitWarning 走开发通道（保留）。为什么不用 atomic.js 逐行重写：
 * 追加型日志逐行整文件 tmp+rename＝O(n²)，且 atomicWrite 的 backupFileBeforeWrite 会在
 * 生产根对既有日志逐行做覆盖前快照（备份膨胀）——与"节流防膨胀"相抵；仓内三先例
 * （rate-throttle 日志、evidence.js CAP2 节流 JSONL、audit-sink 审计面）均为追加型，本模块循之。
 *
 * 膨胀双闸（"节流防膨胀"）：
 *   ① pre-step 节流（evidence.js CAP2 同款进程级 Map）：同 (root|sid) 结论未翻变且
 *      < 60s → 跳过；翻变（sid 解析结论变化）或满窗 → 必写，抑制数随行带回；
 *   ② 单档 2 MiB 轮转（audit-sink 同款）：超限 renameSync → .1 单代，防无限增长。
 *
 * 纯观测面：不触碰 ledger/progress/registry 任何写路径；appendSelflog 永不抛错
 * （调用方语义零变化），日志写不进去时诊断面降级为 emitWarning，宿主零感知。
 */
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** 单档上限：2 MiB（对齐 audit-sink AUDIT_MAX_BYTES），超限轮转到 .1（单代）。 */
export const SELFLOG_MAX_BYTES = 2 * 1024 * 1024;

/** pre-step 最短重写间隔：同结论 60s 内只抑制不写（正常寿命 <100ms 的事件，60s 足证翻变）。 */
export const SELFLOG_PRESTEP_MIN_INTERVAL_MS = 60 * 1000;

/** 自日志路径：<dataRoot>/logs/agent-memory.jsonl */
export function selflogPath(root) {
  return join(root, 'logs', 'agent-memory.jsonl');
}

function warn(msg) {
  if (typeof process !== 'undefined' && typeof process.emitWarning === 'function') {
    process.emitWarning(`[agent-memory-runtime] ${msg}`);
  }
}

/**
 * 追加一条事件行（尽力而为，永不抛错）。
 * @returns {written:true,path} | {written:false,error} 落盘失败（开发通道已告警）
 */
export function appendSelflog(root, event, fields = {}) {
  const file = selflogPath(root);
  // 帧字段（ts/pid/event）后置展开：调用方 fields 不得覆盖日志行骨架
  const record = { ...fields, ts: new Date().toISOString(), pid: process.pid, event };
  try {
    mkdirSync(dirname(file), { recursive: true });
    try {
      if (statSync(file).size > SELFLOG_MAX_BYTES) renameSync(file, file + '.1');
    } catch (err) {
      if (err?.code !== 'ENOENT') throw err; // 旧档不在场=首写，轮转检查无事可做
    }
    appendFileSync(file, JSON.stringify(record) + '\n', 'utf8');
    return { written: true, path: file };
  } catch (err) {
    warn(`selflog 写入失败（event=${event}）：${err?.code ?? err?.message}`);
    return { written: false, error: String(err?.code ?? err?.message) };
  }
}

/* ---------- pre-step 节流（进程内状态；`${root}|${sid ?? hostId ?? ''}` → 摘要） ---------- */
const prestepState = new Map();

/**
 * pre-step 事件行（节流后）：同 (root|sid) 的结论（sid 解析成败＋原因码）未翻变且
 * 距上次 < 间隔 → 跳过（抑制计数累加）；翻变必写；满窗必写并带回抑制数。
 * @param opts.now 可注入时间（测试用；缺省真实时钟），毫秒数。
 */
export function logHeartbeat(root, fields = {}, opts = {}) {
  const nowMs = Number.isFinite(opts.now) ? opts.now : Date.now();
  const key = `${root}|${fields.sid ?? fields.hostId ?? ''}`;
  const outcome = fields.code != null ? `err:${fields.code}` : 'ok';
  const prev = prestepState.get(key);
  if (prev && prev.outcome === outcome && nowMs - prev.atMs < SELFLOG_PRESTEP_MIN_INTERVAL_MS) {
    prev.suppressed += 1;
    return { written: false, throttled: true, suppressed: prev.suppressed };
  }
  const suppressed = prev?.suppressed ?? 0;
  const res = appendSelflog(root, 'pre-step', {
    ...fields,
    ...(suppressed > 0 ? { suppressed } : {}),
  });
  if (res.written) prestepState.set(key, { outcome, atMs: nowMs, suppressed: 0 });
  return res;
}

/** 测试钩子：清空 pre-step 节流游标（对齐 runtime.__resetRuntimeCursor 惯例）。 */
export function __resetSelflogCursor() {
  prestepState.clear();
}
