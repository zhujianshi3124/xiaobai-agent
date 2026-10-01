// 批 9 · audit:* 入枚举（F-17 契约五挂账第 4 条 / 债务 #11b "并入契约 v1.1"裁定）
//
// 已裁验收口径（docs/contract.md §3 批 9 落地段）：收编是**零线格式变更**——
// `contractEventName(p,'audit:'+x)` 与 registry 旧手工模板串对 8/8 **逐字节相同** ⇒
// 对外事件名、审计流水、SSE 帧全不变；收益在编译期类型约束（AuditEvent → ContractEventName）。
// 四格：
//   ① 枚举完整性：CONTRACT_EVENT_NAMES ＝ 5 条契约事件 + `audit:`+AUDIT_EVENTS 派生 8 条（逐字同序）；
//   ② 零线格式变更：contractEventName 对 8 条审计名的输出逐字节等于收编前手工模板
//      （参照表**硬编码**、不派生——枚举或基础名任何一侧漂移都翻红）；
//   ③ 静态防回潮：registry 的 audit() 发名必须经 contractEventName，`${…}/audit:` 手工模板不得回潮；
//   ④ 条数联动：5 + AUDIT_EVENTS.length === CONTRACT_EVENT_NAMES.length
//      （panel-sse-dispose 的订阅计数口径保持派生、不被手改字面量）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AUDIT_EVENTS, CONTRACT_EVENT_NAMES, contractEventName, DEFAULT_SERVICE_PREFIX } from 'dsh-toolkit/contract'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const LEGACY = [
  'registry:plugin-added',
  'registry:plugin-removed',
  'registry:status-changed',
  'registry:health-changed',
  'doctor:issue-found',
]

// 收编前真机在场的对外名（硬编码参照；与客户端孪生表、toolkit-root ⑤ 的订阅名同源同字面）
const BEFORE_WIRE = [
  'toolkit/audit:installed',
  'toolkit/audit:removed',
  'toolkit/audit:enabled',
  'toolkit/audit:disabled',
  'toolkit/audit:reloaded',
  'toolkit/audit:quarantined',
  'toolkit/audit:config-changed',
  'toolkit/audit:state-save-failed',
]

test('批 9 ① 枚举完整性：CONTRACT_EVENT_NAMES = 5 条契约事件 + audit: 派生 8 条（逐字同序）', () => {
  const auditTail = AUDIT_EVENTS.map((a) => `audit:${a}`)
  assert.deepEqual([...CONTRACT_EVENT_NAMES], [...LEGACY, ...auditTail])
})

test('批 9 ② 零线格式变更：contractEventName 对 8 条审计名逐字节等于收编前手工模板', () => {
  const after = AUDIT_EVENTS.map((a) => contractEventName(DEFAULT_SERVICE_PREFIX, `audit:${a}`))
  assert.deepEqual(after, BEFORE_WIRE, '缺省前缀下对外事件名必须与收编前逐字节相同')
  // 非缺省前缀（同进程多实例 S5）同一性质：拼法经 contractEventName，不带死前缀
  const tk2 = AUDIT_EVENTS.map((a) => contractEventName('tk2', `audit:${a}`))
  assert.deepEqual(tk2, AUDIT_EVENTS.map((a) => `tk2/audit:${a}`))
})

test('批 9 ③ 静态防回潮：registry audit() 发名必须经 contractEventName，手工模板串不得回潮', () => {
  const src = readFileSync(join(root, 'registry', 'src', 'registry.ts'), 'utf8')
  assert.ok(!src.includes('}/audit:${'), 'audit 发名不得手工拼 `${prefix}/audit:` 模板串（收编点回潮）')
  assert.ok(src.includes('contractEventName('), 'audit() 必须经 contractEventName 发名')
})

test('批 9 ④ 条数联动：5 + AUDIT_EVENTS.length === CONTRACT_EVENT_NAMES.length（sse-dispose 计数口径）', () => {
  assert.equal(5 + AUDIT_EVENTS.length, CONTRACT_EVENT_NAMES.length)
})
