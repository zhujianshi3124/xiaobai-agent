// H1（D-11 落盘可见性）私有夹具：不依赖任何跨文件共享开关（债务 D-10 的教训——
// 复用 contract-plugin 的 marker.flag 会让新用例偶发翻红）。装入恒成功。
export const name = 'fixture-save-probe-plugin'
export const inject = []

export function apply() {}
