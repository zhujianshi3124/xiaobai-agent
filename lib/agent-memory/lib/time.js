/**
 * @local/agent-memory — 时间戳规范（R3，2026-09-11 签字生效）
 *
 * 存储一律 UTC ISO（`Z` / `+00:00`），显示由展示层转本地（+08:00）。
 * 任何落盘时间必须走 toUtcIso 归一化；assertUtcIso 供读取/测试断言不变式。
 */
export const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
export const ISO_OFFSET_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?([+-]\d{2}:\d{2}|Z)$/;

/**
 * 归一化为 UTC ISO（Z）：接受 Date / epoch 毫秒数 / 任意可解析的 ISO 字符串
 * （含带本地偏移的 "+08:00" 串 → 转成对应时刻的 UTC Z）。
 * 无法解析 → 抛 INVALID_TIMESTAMP（不静默入库）。
 */
export function toUtcIso(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return new Date(value).toISOString();
  const s = String(value ?? '').trim();
  if (!s) return new Date().toISOString();
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    const e = new Error(`INVALID_TIMESTAMP: "${s}" 无法解析为时间`);
    e.code = 'INVALID_TIMESTAMP';
    throw e;
  }
  return d.toISOString(); // 一律归一化到 UTC (Z)
}

/**
 * 断言时间为 UTC（Z 或 +00:00），否则抛 TIMESTAMP_NOT_UTC。
 * @param {string} value
 * @param {string} label 出错时展示的字段名
 */
export function assertUtcIso(value, label = 'timestamp') {
  const s = String(value ?? '');
  if (ISO_OFFSET_RE.test(s)) {
    // 允许 Z 或 +00:00/-00:00；禁止任何非零偏移
    const off = ISO_OFFSET_RE.exec(s)[1];
    if (off === 'Z' || off === '+00:00' || off === '-00:00') return s;
  }
  const e = new Error(`TIMESTAMP_NOT_UTC: ${label}=${s} 不是 UTC 时间（应为 Z/+00:00）`);
  e.code = 'TIMESTAMP_NOT_UTC';
  throw e;
}

/** 展示层：UTC ISO → 本地时区（如 +08:00）可读串；仅供显示，不入库。 */
export function formatLocalTime(iso, tzOffsetMin = 8 * 60) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const shifted = new Date(d.getTime() + tzOffsetMin * 60000);
  const pad = (n) => String(n).padStart(2, '0');
  const date = shifted.toISOString().slice(0, 10);
  const time = `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`;
  const sign = tzOffsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(tzOffsetMin);
  return `${date} ${time} (UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)})`;
}