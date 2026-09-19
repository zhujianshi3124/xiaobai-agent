// 永远抛错的反面夹具（S4 隔离验证用；无 manifest → 会走 legacy 包装，但装入仍失败）。
export const name = 'fixture-broken'

export function apply() {
  throw new Error('fixture-broken always throws (S4)')
}
