import Schema from '@deepseek-ai/schemastery'

// Config 真校验夹具：region 必填（安装时无配置 → 预检阻断，REQ-3 §11）
export const Config = Schema.object({
  region: Schema.string().required(),
  retries: Schema.number(),
})

export const name = 'fixture-schema-plugin'

export function apply() {}
