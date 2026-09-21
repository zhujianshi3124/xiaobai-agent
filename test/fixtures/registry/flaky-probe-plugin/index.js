// D-9 私有夹具：失败/成功由**进程内开关**控制（不落盘、不共享文件——
// 债务 D-10 的教训：跨文件共享的磁盘开关会让"偶发红"看起来像产品 bug）。
// 开关与计数都是模块单例状态，用例必须在开头 reset()。
let failing = true
export const state = { loads: 0 }

export function setFailing(value) {
  failing = value === true
}

export function reset() {
  failing = true
  state.loads = 0
}

export const name = 'fixture-flaky-probe-plugin'
export const inject = []

export function apply() {
  state.loads += 1
  if (failing) throw new Error('夹具按开关失败（D-9 重试计数用例）')
}
