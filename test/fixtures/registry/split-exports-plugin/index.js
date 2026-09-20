// B2 夹具：把 cordis 要的静态面拆在两处——name/inject 是模块命名级导出，
// apply 在 default 对象上。旧 normalizePlugin 直接返回 default，注入依赖与显示名
// 会整批丢掉；合并后 cordis 必须两样都看见。
export const name = 'fixture-split-exports'
export const inject = ['fixture/still-absent-service']

export default {
  apply() {
    /* 空装即可，本夹具只考静态面是否到达 cordis */
  },
}
