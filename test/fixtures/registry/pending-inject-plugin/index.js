// 永久 PENDING 夹具：inject 声明了永不出现的服务（装入超时验证用；
// install 须 force:true 绕过预检的 service-missing 阻断）。
export const name = 'fixture-pending-inject'
export const inject = ['fixture/no-such-service']

export function apply() {}
