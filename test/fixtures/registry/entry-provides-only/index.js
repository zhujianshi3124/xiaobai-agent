/**
 * v1.3 扩槽入口解析夹具：可识别的插件形态（named apply）。
 * name 带 DECOY- 前缀的是**哨兵不是缺陷**：目录惯例专用诱饵一旦被选中，断言
 * （"身份必须等于被声明的那份"）立即翻红 ⇒ 摘掉某一级解析的用例精确失败。
 */
export const name = 'fixture-entry-provides-only-DECOY-indexjs'
export const inject = []
export function apply() {}
