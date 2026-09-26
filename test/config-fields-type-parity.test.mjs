// W2 余件 F-77 · CONFIG_FIELDS 类型字面对账钉（常设化）
//
// 复算（2026-09-26）：服务端白名单 CONFIG_WHITELIST 18 键、类型字面集 {bool,int,number}；
// 客户端两通道 CONFIG_FIELDS 各 18 字段与服务端集合相等，唯一漂移＝backoffFactor 与
// routing.downgradeContextMargin 客户端写 "num"（服务端 "number"）。客户端 type 只驱动
// bool/非 bool 控件分支 ⇒ 字面对齐零行为变化，纯口径统一。
// 本钉常设化三面：两通道逐字段一致 / 客户端集合===白名单集合（双向）/ 逐字段 type 与
// 服务端相同（服务端将来加第四种字面时，"字面集恰三种"反向钉即翻红提醒客户端同步）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CONFIG_WHITELIST } from '../panel/manager/config-whitelist.mjs'

const root = join(import.meta.dirname, '..')
const serverTypes = Object.fromEntries(Object.entries(CONFIG_WHITELIST).map(([k, v]) => [k, v.type]))

function parseClientFields(rel) {
  const src = readFileSync(join(root, rel), 'utf8')
  const s = src.indexOf('CONFIG_FIELDS = [')
  assert.ok(s >= 0, rel + ' 必须含 CONFIG_FIELDS 表（锚与真代码形态共振）')
  const e = src.indexOf('];', s)
  const block = src.slice(s, e)
  const re = /path:\s*"([^"]+)"[^{}]*?type:\s*"([^"]+)"/g
  const out = {}
  let m
  while ((m = re.exec(block))) out[m[1]] = m[2]
  return out
}

const reactFields = parseClientFields('panel/client/index.js')
const htmlFields = parseClientFields('panel/client/panel.html')

test('F-77 · 两通道 CONFIG_FIELDS 逐字段一致（path→type）', () => {
  assert.deepEqual(reactFields, htmlFields)
})

test('F-77 · 客户端字段集合与服务端白名单集合双向相等（18=18，无缺失无多余）', () => {
  assert.deepEqual(Object.keys(reactFields).sort(), Object.keys(serverTypes).sort())
})

test('F-77 · 逐字段 type 与服务端白名单相同（双通道各探；"num" 漂移格即此翻红）', () => {
  for (const [ch, table] of [['react', reactFields], ['html', htmlFields]]) {
    const drift = Object.entries(table).filter(([k, v]) => serverTypes[k] !== v)
    assert.deepEqual(drift, [], ch + ' 客户端 type 必须逐字段对齐服务端: ' + JSON.stringify(drift))
  }
})

test('F-77 · 反向钉：服务端类型字面集恰 {bool,int,number}（新增字面须客户端同步）', () => {
  assert.deepEqual([...new Set(Object.values(serverTypes))].sort(), ['bool', 'int', 'number'])
})
