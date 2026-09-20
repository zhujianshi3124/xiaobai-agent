// E1 夹具：用 **cordis 原生 inject** 声明依赖的消费者（契约插件形态）。
// 与 consumer-plugin 的区别：那个只在 manifest 里写 requires.services、模块没有
// inject，所以 cordis 完全不设门；这个两头都写，专门用来钉
// "依赖服务后到 → fiber 由 PENDING 自动转 ACTIVE"这条正向语义（此前零覆盖）。
export const state = { loads: 0 }

export const name = 'fixture-inject-consumer'
export const inject = ['fixture/needed']

export function apply() {
  state.loads += 1
}
