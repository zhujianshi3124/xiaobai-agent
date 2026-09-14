/**
 * @local/agent-memory — §8 迁移三步规程守护（2026-09-11 签字生效）
 *
 * 数据布局变更必须按顺序：migrate（迁移）→ verify（校验）→ cleanup（再清理）。
 * 禁止先删后迁；cleanup 前必须 verify 通过。本模块提供顺序状态机：
 * 任何乱序/跳过/重复步骤 → MIGRATION_ORDER_VIOLATION（fail-closed，不静默）。
 *
 * 配套红线（§8）：数据根禁 rm -rf，整目录/整根删除一律走 remove-session（窄口径+外部快照+ops 留痕）。
 */
export const MIGRATION_ORDER = ['migrate', 'verify', 'cleanup'];

const STEP_IDX = Object.fromEntries(MIGRATION_ORDER.map((s, i) => [s, i]));

/**
 * @param {null|{phase: string}} state 上一步返回的状态；首次调用传 null（必须从 migrate 开始）
 * @param {string} requested 请求的步骤：migrate|verify|cleanup
 * @returns {{phase: string, at: number}} 新状态（应传给下一步）
 */
export function assertMigrationOrder(state, requested) {
  const want = String(requested ?? '').trim();
  if (!(want in STEP_IDX)) {
    const e = new Error(`MIGRATION_UNKNOWN_STEP: "${want}" 不是合法迁移步骤（${MIGRATION_ORDER.join('→')}）`);
    e.code = 'MIGRATION_UNKNOWN_STEP';
    throw e;
  }
  const wantIdx = STEP_IDX[want];
  if (state === null) {
    if (wantIdx !== 0) {
      const e = new Error('MIGRATION_ORDER_VIOLATION: 迁移必须从 migrate 开始（禁止先删后迁）');
      e.code = 'MIGRATION_ORDER_VIOLATION';
      throw e;
    }
    return { phase: want, at: Date.now() };
  }
  const prevIdx = STEP_IDX[state.phase];
  if (prevIdx === undefined || wantIdx !== prevIdx + 1) {
    const e = new Error(
      `MIGRATION_ORDER_VIOLATION: 步骤顺序错误（当前=${state.phase}，请求=${want}），合法顺序=${MIGRATION_ORDER.join('→')}`
    );
    e.code = 'MIGRATION_ORDER_VIOLATION';
    e.from = state.phase ?? null;
    e.to = want;
    throw e;
  }
  return { phase: want, at: Date.now() };
}

/** 便捷：三步走完校验（返回 true 或抛错）。 */
export function runMigrationSequence(steps) {
  let state = null;
  for (const s of steps) state = assertMigrationOrder(state, s);
  return state;
}