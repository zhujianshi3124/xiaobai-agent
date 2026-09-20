// B2 反面对照夹具：default 自己**已声明** name/inject/Config。
// 保守合并只允许"补 default 缺的"，绝不允许盖它已有的——本夹具钉这条边界。
export const name = 'should-not-win'
export const inject = ['should-not-win']
export const Config = { from: 'namespace' }

export default {
  name: 'default-wins',
  inject: ['from-default'],
  Config: { from: 'default' },
  apply() {},
}
