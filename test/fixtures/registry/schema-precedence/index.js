// 批 4 夹具：configSchema 与 panels **两处都在**（落盘 JSON + 模块导出），内容刻意不同，
// 用来钉 ★3/panels 的优先级——生效的必须是模块那份（contract.md §5 与 §7 D-12）。
import Schema from '@deepseek-ai/schemastery'

export const name = 'fixture-schema-precedence'
export const inject = []

export const Config = Schema.object({ fromModule: Schema.string().required() })

export const panels = [{ id: 'from-module', title: '模块那份面板' }]

export function apply() {}
