/**
 * @local/agent-memory — 宿主会话 ID 归一化模块（二阶段后半，2026-09-11）
 *
 * 职责：宿主（dsh harness）的会话 id 是通用 UUID（如 11111111-1111-4111-8111-111111111111）。
 * agent-memory 的 sid 改为「候选 ID」：YYYYMMDD-<宿主 UUID 去横线后前 12 位 hex>。
 *
 * 约束（设计稿二阶段后半）：
 * - 宿主 ID 只经本模块进入体系（HOST_ID_RE 校验 → 归一化小写 → 派生候选 sid）；
 *   任何调用方不得把宿主 UUID 直接当 sid 使用。
 * - SID_RE 兼容旧 8 位随机 sid 与新的 12 位候选 sid（8|12）。
 *
 * 导出：
 *   HOST_ID_RE（来自 constants） / assertValidHostId / normalizeHostId /
 *   candidateSuffix（前 12 位 hex）/ candidateSid（YYYYMMDD-<candidateSuffix>）。
 */
import { HOST_ID_RE } from './constants.js';

/** 真实 dsh 会话 id 前缀（2026-09-11 真机定位：宿主 id 实为 `session-<uuid>`，非裸 UUID）。 */
const HOST_PREFIX_RE = /^session-/i;

/** 剥离 `session-` 前缀（如有）；非字符串原样返回（后续统一由 HOST_ID_RE 校验）。 */
function stripHostPrefix(hostId) {
  if (typeof hostId !== 'string') return hostId;
  return hostId.replace(HOST_PREFIX_RE, '');
}

/** 校验宿主会话 ID 必须是通用 UUID（先剥离 `session-` 前缀）；非法抛 INVALID_HOST_ID（fail-closed）。 */
export function assertValidHostId(hostId) {
  const bare = stripHostPrefix(hostId);
  if (typeof bare !== 'string' || !HOST_ID_RE.test(bare)) {
    const e = new Error(
      `INVALID_HOST_ID: "${hostId}" 不是合法宿主会话 UUID（接受 session-<uuid> 或裸 UUID；HOST_ID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i）`
    );
    e.code = 'INVALID_HOST_ID';
    throw e;
  }
  return bare;
}

/** 校验 + 归一化（剥离 `session-` 前缀 + 小写）宿主会话 ID。 */
export function normalizeHostId(hostId) {
  return assertValidHostId(hostId).toLowerCase();
}

/**
 * 宽容归一化（方案 b 修订版 + 真机 session- 前缀）：宿主 ID 未知格式 → null（拒绝，不抛错）；
 * `session-<uuid>` 先剥离前缀、再按裸 UUID 归一化为小写。注册钩子（onSessionStart）与
 * 反向解析（resolveSidByHostId）据此「拒绝入册/跳过」而非崩溃。
 */
export function tryNormalizeHostId(hostId) {
  const bare = stripHostPrefix(hostId);
  if (typeof bare !== 'string' || !HOST_ID_RE.test(bare)) return null;
  return bare.toLowerCase();
}

/** 候选后缀：宿主 UUID 去横线后前 12 位 hex（确定性派生，同宿主恒同）。 */
export function candidateSuffix(hostId) {
  return normalizeHostId(hostId).replace(/-/g, '').slice(0, 12);
}

/** 候选 sid：YYYYMMDD-<candidateSuffix>（date = 创建日期，createSession 时确定）。 */
export function candidateSid(hostId, now = new Date()) {
  const y = String(now.getFullYear()).padStart(4, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}-${candidateSuffix(hostId)}`;
}
