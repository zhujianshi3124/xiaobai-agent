#!/usr/bin/env node
/**
 * I1（债务 D-16 关账）：按**宿主通道语义**校验 cordis.patch.yml 里每个插件行的 config 块。
 *
 * 为什么需要它（真机教训，见 panel/docs/evidence/H-REAL-HOST-REVERIFY.md §二）：
 * `cordis.patch.yml:61` 的 engines 第 8 项 `360` 不带引号 ⇒ 真 YAML 解析成**整数** ⇒
 * H3 起宿主通道开始真校验该插件配置 ⇒ ValidationError 冒到 dsh-app-boot 顶层 ⇒ **整个宿主 exit 1**。
 * 仓内 293/293 全绿抓不到它，因为没有任何环节把"真实 patch 文件 + 真 YAML 语义 + 宿主通道校验"
 * 串起来。本脚本就是那条缺失的链路，跑在正本门禁里。
 *
 * 三条口径：
 * 1. **解析必须与宿主同语义**。本仓无 YAML 依赖（`js-yaml`/`yaml` 均不在 node_modules），
 *    而面板自己的 `parseRootRows`（panel/manager/snapshot.mjs:34）把 config 值**一律当字符串**
 *    ——复用它会把 `360` 读成 `'360'`，正好掩盖本脚本要抓的这一类 bug。所以这里自带一个
 *    **严格到 fail-closed 的 YAML 子集解析器**：核心 schema 标量转换（整数/浮点/布尔/null/引号串）、
 *    flow 序列与映射、块序列、嵌套映射；遇到不认识的构造（块标量 `|`/`>`、锚点/别名、
 *    `!!js` 表达式、多文档、下划线数字、y/n/on/off 这类 YAML 1.1 与 1.2 结论不同的写法）
 *    直接报错退出**，绝不猜——猜错就是假绿。解析器自身的语义钉成 20 条断言（`selfcheckCases()`）：
 *    `--selfcheck` 逐条打印，缺省跑法每次也在门禁里复验一遍，任一条翻红即判定"本校验器不可信"
 *    并以不同文案退出——否则解析器哪天退化成把 `360` 读成 `'360'`，门禁会安静地变成假绿。
 * 2. **校验走宿主通道**：`import(name)` → 官方 `unwrapExports`（逐字抄自
 *    `@deepseek-ai/cordis-plugin-loader@1.0.3`，与 test/dual-channel-parity.test.mjs 同一份）
 *    → 读**那个对象**上的 `Config` → `Config['~standard'].validate(config)`。
 *    没有 Config 的入口跳过（与 cordis 4.0.2 `if (!runtime.Config) return config` 一致）。
 * 3. **只声明"完整 config"的行才判类型**：本仓自己 insert 的行（bundle 层）config 是完整声明；
 *    宿主既有行（只有 id、如 `web`）的 config 是**覆盖片段**，其 schema 需逐字段有默认值才
 *    判得准——这类行照常校验，但一旦报"缺必填"就按提示人工确认，不要直接放宽。
 *    认不出模块的行（只有 id 且不在 HOST_ROW_MODULES 表里）**判红**：安全网必须逼人来加表。
 *
 * 报错质量按 H5 §二的评估补齐了 cordis 原文缺的三样：**文件名 + 行号 + 修法**。
 * 用法：node scripts/patch-config-check.mjs [--selfcheck] [--verbose]
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PATCH_FILE = 'cordis.patch.yml'
const PATCH_PATH = resolve(ROOT, PATCH_FILE)

/** 只有 id、没有 name 的宿主既有行 ⇒ 模块来源表（新增宿主行需要覆盖 config 时往这里加一条）。 */
const HOST_ROW_MODULES = {
  web: '@deepseek-ai/dsh-web',
  // web-search-deepseek 行目前只有 disabled，无 config ⇒ 不需要解析；若将来加 config，在此补表。
}

/* ────────────────────────────── YAML 子集解析 ────────────────────────────── */

class YamlError extends Error {}

/** 核心 schema 的 plain scalar → JS 值。拿不准的一律抛错（fail-closed），不猜。 */
function plainScalar(raw, line, path) {
  const s = raw.trim()
  if (s === '') return ''
  if (s === '~' || /^null$/i.test(s)) return null
  if (s === 'true') return true
  if (s === 'false') return false
  // YAML 1.1 与 1.2 对这些写法结论相反 ⇒ 本文件里出现即视为歧义，交给人确认。
  if (/^(y|n|yes|no|on|off|true|false|null|~)$/i.test(s) && !['true', 'false'].includes(s)) {
    throw new YamlError(`${path}（第 ${line} 行）值 "${s}" 在 YAML 1.1/1.2 下类型不同，禁止使用`)
  }
  if (/^[-+]?\d+$/.test(s)) return Number(s)
  if (/^[-+]?0o[0-7]+$/.test(s)) return Number(BigInt(s.replace(/_/g, '')))
  if (/^[-+]?0x[0-9a-f]+$/i.test(s)) return Number(BigInt(s))
  if (/^[-+]?(\d*\.\d+|\d+\.\d*)([eE][-+]?\d+)?$/.test(s)) return Number(s)
  if (/^[-+]?\d[eE][-+]?\d+$/.test(s)) return Number(s)
  // 数字形状但不被核心 schema 认的写法（下划线、二进制、前导 0 八进制、.5、1.）⇒ 歧义
  if (/^[+-]?[\d._]/.test(s) && /^[\d._eExXoObBa-fA-F+-]+$/.test(s)) {
    throw new YamlError(`${path}（第 ${line} 行）值 "${s}" 是 YAML 数字的边缘写法，类型不确定，禁止使用`)
  }
  return s
}

function unquote(raw, line, path) {
  const s = raw.trim()
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) return s.slice(1, -1).replace(/''/g, "'")
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    try { return JSON.parse(s) } catch { throw new YamlError(`${path}（第 ${line} 行）双引号串内含非法转义`) }
  }
  throw new YamlError(`${path}（第 ${line} 行）引号不成对：${s}`)
}

/** 按顶层逗号切分（忽略引号内与嵌套括号内的逗号）。 */
function splitTop(body) {
  const out = []
  let depth = 0, quote = null, cur = ''
  for (const ch of body) {
    if (quote) {
      cur += ch
      if (ch === quote) quote = null
      continue
    }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue }
    if (ch === '[' || ch === '{') depth++
    if (ch === ']' || ch === '}') depth--
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  if (cur.trim() !== '' || out.length === 0) out.push(cur)
  return out.map((x) => x.trim()).filter((x, i) => !(x === '' && i === out.length - 1 && out.length > 1))
}

/** flow 值（`[...]` / `{...}`）与标量的统一入口。line 为该值所在行。 */
function parseValue(raw, line, path, linesOf) {
  const s = raw.trim()
  if (s === '') return undefined // 值在后续缩进块里
  if (s.startsWith('[') && s.endsWith(']')) {
    const arr = []
    const inner = s.slice(1, -1).trim()
    if (inner === '') return arr
    splitTop(inner).forEach((item, i) => {
      arr.push(parseValue(item, line, `${path}[${i}]`, linesOf))
    })
    return arr
  }
  if (s.startsWith('{') && s.endsWith('}')) {
    const obj = {}
    const inner = s.slice(1, -1).trim()
    if (inner === '') return obj
    for (const pair of splitTop(inner)) {
      const ci = findKeyColon(pair)
      if (ci < 0) throw new YamlError(`${path}（第 ${line} 行）flow 映射项缺冒号：${pair}`)
      const k = String(parseValue(pair.slice(0, ci), line, `${path}.${pair.slice(0, ci).trim()}`, linesOf))
      obj[k] = parseValue(pair.slice(ci + 1), line, `${path}.${k}`, linesOf)
    }
    return obj
  }
  if (s.startsWith("'") || s.startsWith('"')) return unquote(s, line, path)
  if (s.startsWith('&') || s.startsWith('*') || s.startsWith('!') || s.startsWith('|') || s.startsWith('>')) {
    throw new YamlError(`${path}（第 ${line} 行）用了本校验器不认的 YAML 构造（锚点/别名/标签/块标量）：${s}`)
  }
  if (s.includes(': ') || s.endsWith(':')) {
    throw new YamlError(`${path}（第 ${line} 行）flow 值里出现裸映射，本校验器不支持该写法：${s}`)
  }
  return plainScalar(s, line, path)
}

/** 找 `key: value` 里属于本层的冒号（跳过引号内）。 */
function findKeyColon(pair) {
  let quote = null
  for (let i = 0; i < pair.length; i++) {
    const ch = pair[i]
    if (quote) { if (ch === quote) quote = null; continue }
    if (ch === "'" || ch === '"') { quote = ch; continue }
    if (ch === ':' && (i + 1 === pair.length || pair[i + 1] === ' ')) return i
  }
  return -1
}

const isBlank = (ln) => ln.text.trim() === ''
/** 从 idx 起跳过空行后的第一个有效行下标（越界则返回 lines.length）。 */
function nextContent(lines, idx) {
  let i = idx
  while (i < lines.length && isBlank(lines[i])) i++
  return i
}

/** 在已知行号处判型并解析一个块（序列或映射），缩进取该行的实际缩进。 */
function parseNode(lines, i, path, linesOf) {
  return lines[i].text.startsWith('-')
    ? parseSeq(lines, i, lines[i].indent, path, linesOf)
    : parseMap(lines, i, lines[i].indent, path, linesOf)
}

/** 收一个 `key: value` 对进 obj；返回下一行下标（子块会向前吃行）。
 *  ln 是正在处理的行（可以是合成行，如 `- key: v` 的首键），idx 是它在源数组里的下标。 */
function takePair(obj, lines, ln, idx, indent, path, linesOf) {
  const ci = findKeyColon(ln.text)
  if (ci < 0) throw new YamlError(`${path}（第 ${ln.no} 行）不是 key: value 写法：${ln.text}`)
  const key = ln.text.slice(0, ci).trim().replace(/^['"]|['"]$/g, '')
  const rawVal = ln.text.slice(ci + 1).trim()
  const kp = `${path}.${key}`
  linesOf.set(kp, ln.no)
  if (rawVal !== '') {
    obj[key] = parseValue(rawVal, ln.no, kp, linesOf)
    return idx + 1
  }
  const k = nextContent(lines, idx + 1)
  if (k >= lines.length || lines[k].indent <= indent) {
    obj[key] = {} // `key:` 后面什么都不跟（本文件未出现，留个合法空值而不是崩）
    return k
  }
  const sub = parseNode(lines, k, kp, linesOf)
  obj[key] = sub.value
  return sub.next
}

function parseMap(lines, start, indent, path, linesOf) {
  const obj = {}
  let i = start
  while (i < lines.length) {
    if (isBlank(lines[i])) { i++; continue }
    const ln = lines[i]
    if (ln.indent < indent) break
    if (ln.indent > indent) throw new YamlError(`${path}（第 ${ln.no} 行）缩进比所属映射更深，写法不认识：${ln.text}`)
    if (ln.text.startsWith('-')) throw new YamlError(`${path}（第 ${ln.no} 行）序列与映射同缩进混排，写法不认识：${ln.text}`)
    i = takePair(obj, lines, ln, i, indent, path, linesOf)
  }
  return { value: obj, next: i }
}

/** `- key: v` 形态：首键与 `-` 同行，其余键缩进对齐到该键（= indent + 2）。 */
function parseMapFirstInline(lines, ln, idx, path, linesOf) {
  const innerIndent = ln.indent + 2
  const virtual = { no: ln.no, indent: innerIndent, text: ln.text.slice(1).trim() }
  const obj = {}
  let i = takePair(obj, lines, virtual, idx, innerIndent, path, linesOf)
  while (i < lines.length) {
    if (isBlank(lines[i])) { i++; continue }
    const nx = lines[i]
    if (nx.indent < innerIndent) break
    if (nx.indent > innerIndent) throw new YamlError(`${path}（第 ${nx.no} 行）缩进异常：${nx.text}`)
    if (nx.text.startsWith('-')) break
    i = takePair(obj, lines, nx, i, innerIndent, path, linesOf)
  }
  return { value: obj, next: i }
}

function parseSeq(lines, start, indent, path, linesOf) {
  const arr = []
  let i = start
  while (i < lines.length) {
    if (isBlank(lines[i])) { i++; continue }
    const ln = lines[i]
    if (ln.indent < indent) break
    if (ln.indent > indent) throw new YamlError(`${path}（第 ${ln.no} 行）缩进比所属序列更深，写法不认识：${ln.text}`)
    if (!ln.text.startsWith('-')) throw new YamlError(`${path}（第 ${ln.no} 行）期待序列项（- ...），实际：${ln.text}`)
    const rest = ln.text.slice(1).trim()
    const itemPath = `${path}[${arr.length}]`
    linesOf.set(itemPath, ln.no)
    if (rest === '') {
      const k = nextContent(lines, i + 1)
      if (k >= lines.length || lines[k].indent <= indent) { arr.push(null); i = k; continue }
      const sub = parseNode(lines, k, itemPath, linesOf)
      arr.push(sub.value)
      i = sub.next
      continue
    }
    if (rest.startsWith('{') || rest.startsWith('[')) {
      arr.push(parseValue(rest, ln.no, itemPath, linesOf))
      i++
      continue
    }
    if (findKeyColon(rest) >= 0) {
      const r = parseMapFirstInline(lines, ln, i, itemPath, linesOf)
      arr.push(r.value)
      i = r.next
      continue
    }
    arr.push(plainScalar(rest, ln.no, itemPath))
    i++
  }
  return { value: arr, next: i }
}

function loadPatch() {
  const text = readFileSync(PATCH_PATH, 'utf8')
  if (text.includes('\t')) throw new YamlError('文件含制表符缩进，YAML 禁止')
  const lines = text.split(/\r?\n/).map((raw, idx) => {
    const no = idx + 1
    const stripped = raw.replace(/(^|\s)#(?![^'"]*['"][^'"]*$).*$/, '')
    const indent = (stripped.match(/^ */)?.[0] ?? '').length
    return { no, indent, text: stripped.trim(), raw }
  })
  for (const ln of lines) {
    if (/^\s*---\s*$/.test(ln.raw)) throw new YamlError(`第 ${ln.no} 行出现多文档分隔符 ---，本校验器不支持`)
    if (/:\s*[&*|>][\s\d-]/.test(ln.raw) || /:\s*!!/.test(ln.raw)) {
      throw new YamlError(`第 ${ln.no} 行用了块标量/锚点/别名/自定义标签，本校验器不支持：${ln.text}`)
    }
  }
  const linesOf = new Map()
  const start = nextContent(lines, 0)
  const parsed = start >= lines.length ? { value: [], next: start } : parseNode(lines, start, '', linesOf)
  return { entries: parsed.value ?? [], linesOf }
}

/* ──────────────────────────── 宿主通道解包 ──────────────────────────── */

/** 逐字抄自 cordis-plugin-loader@1.0.3（src/index.ts:192-199；同 test/dual-channel-parity.test.mjs）。 */
function unwrapExports(exports) {
  if (exports === null || exports === undefined) return exports
  exports = exports.default ?? exports
  if (!exports.__esModule) return exports
  return exports.default ?? exports
}

/* ─────────────────────────────── 主流程 ─────────────────────────────── */

function iterRows(entries) {
  const rows = []
  for (const item of Array.isArray(entries) ? entries : []) {
    if (!item || typeof item !== 'object') continue
    if (Array.isArray(item.insert)) {
      for (const r of item.insert) rows.push({ ...r, __wrapped: 'insert' })
    } else if (item.id !== undefined) {
      rows.push(item)
    } else {
      throw new YamlError(`顶层条目既没有 id 也没有 insert：${JSON.stringify(item)}`)
    }
  }
  return rows
}

/** 把 schema 路径映射回文件行号：逐级回落（去掉数组下标、去掉尾部键），命中即报。 */
function keyLine(linesOf, path) {
  let p = String(path ?? '')
  for (let guard = 0; guard < 32 && p; guard++) {
    if (linesOf.has(p)) return linesOf.get(p)
    if (/\[\d+\]$/.test(p)) {
      const q = p.replace(/\[\d+\]$/, '')
      if (linesOf.has(q)) return linesOf.get(q)
      p = q
      continue
    }
    const cut = p.lastIndexOf('.')
    if (cut < 0) break
    p = p.slice(0, cut)
  }
  return null
}

function hintFor(issue, valueAt) {
  const msg = String(issue.message ?? '')
  if (/expected string/.test(msg) && typeof valueAt === 'number') {
    return 'YAML 把它解析成了数字 —— 给该值加单引号（例：\'360\'）'
  }
  if (/expected string/.test(msg) && valueAt === null) return 'YAML 把 null 给了一个要求字符串的字段 —— 删掉该键或给一个字符串值'
  if (/expected /.test(msg)) return '值类型与 schema 不符，按 message 里的期望类型改写'
  return '按 schema 修正该键，或确认该插件是否应声明 Config'
}

async function main() {
  const verbose = process.argv.includes('--verbose')
  const net = selfcheckCases()
  if (process.argv.includes('--selfcheck')) {
    let bad = 0
    for (const [label, fn] of net) {
      let ok = false
      try { ok = !!fn() } catch (e) { ok = false; label += `（抛错：${e?.message}）` }
      if (!ok) bad++
      console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`)
    }
    console.log(`RESULT ${net.length - bad}/${net.length} 解析器语义自证`)
    process.exit(bad === 0 ? 0 : 1)
  }
  // 缺省跑法也要证明"网本身是好的"：解析器语义每条都在门禁里复验一次，
  // 否则解析器哪天退化成把 360 读成 '360'，门禁会安静地变成假绿（正是本脚本要防的那类事）。
  const failed = []
  for (const [label, fn] of net) {
    try { if (!fn()) failed.push(label) } catch (e) { failed.push(`${label}（抛错：${e?.message}）`) }
  }
  if (failed.length) {
    console.log('  ✗ 解析器语义自证翻红 —— 本校验器不可信，先修它再谈 patch 校验')
    for (const f of failed) console.log('      ' + f)
    console.log('RESULT 解析器自证失败')
    process.exit(1)
  }

  const { entries, linesOf } = loadPatch()
  const rows = iterRows(entries)
  const report = { checked: [], skipped: [], unresolved: [], issues: [] }

  for (const row of rows) {
    const id = String(row.id ?? '(无 id)')
    const cfg = row.config
    if (cfg === undefined || cfg === null || (typeof cfg === 'object' && Object.keys(cfg).length === 0)) {
      report.skipped.push({ id, reason: '无 config 块（没有什么可校验）' })
      continue
    }
    // 找到该行的 config 在 linesOf 里的路径前缀（用于把 schema 报错映射回文件行号）
    const prefix = rowPrefixOf(entries, id)
    const spec = row.name ?? HOST_ROW_MODULES[id]
    if (!spec) {
      report.unresolved.push({ id, reason: '该行只有 id 且不在 HOST_ROW_MODULES 表里，无法解析到模块' })
      continue
    }
    let mod
    try {
      const abs = spec.startsWith('file:') ? spec : null
      mod = await import(abs ?? spec)
    } catch (e) {
      report.unresolved.push({ id, reason: `模块 import 失败：${e?.message ?? e}` })
      continue
    }
    const plugin = unwrapExports(mod)
    const Cfg = plugin?.Config
    if (!Cfg) {
      report.skipped.push({ id, reason: '入口无 Config（与 cordis `if (!runtime.Config) return config` 一致）' })
      continue
    }
    const std = Cfg['~standard']
    if (typeof std?.validate !== 'function') {
      report.unresolved.push({ id, reason: 'Config 在场但取不到 ~standard.validate —— 本校验器只认 Standard Schema' })
      continue
    }
    const result = std.validate(cfg)
    const issues = result?.issues ?? []
    for (const issue of issues) {
      const ipath = (issue.path ?? []).map((s) => (typeof s === 'object' && s !== null ? s.key : s)).join('.')
      const full = ipath ? `${prefix}.config.${ipath}` : `${prefix}.config`
      const ln = keyLine(linesOf, full) ?? keyLine(linesOf, `${prefix}.config`)
      const valueAt = ipath ? ipath.split('.').reduce((o, k) => (o === undefined ? undefined : o[/^\d+$/.test(k) ? Number(k) : k]), cfg) : cfg
      report.issues.push({
        id, fieldPath: ipath || '(整块 config)', line: ln,
        expected: issue.message, got: JSON.stringify(valueAt) ?? String(valueAt),
        fix: hintFor(issue, valueAt),
      })
    }
    report.checked.push({ id, via: 'host-channel unwrap → Config[~standard].validate', keys: Object.keys(cfg).length, issues: issues.length })
  }

  console.log(`patch 配置校验（宿主通道语义） ${PATCH_FILE}`)
  console.log(`  解析器自证=${net.length}/${net.length}（本行数字来自缺省复验，失败时根本走不到这里）`)
  console.log(`  行数=${rows.length}  已校验=${report.checked.length}  跳过=${report.skipped.length}  解析不到=${report.unresolved.length}  问题=${report.issues.length}`)
  for (const c of report.checked) console.log(`  ✓ ${c.id}：${c.keys} 个顶层 config 键，${c.issues} 个问题（${c.via}）`)
  for (const s of report.skipped) if (verbose) console.log(`  - ${s.id}：跳过 —— ${s.reason}`)
  if (report.skipped.length && !verbose) {
    console.log(`  - 跳过 ${report.skipped.length} 行：${report.skipped.map((s) => `${s.id}（${s.reason.split('（')[0]}）`).join('、')}`)
  }
  for (const u of report.unresolved) console.log(`  ✗ ${u.id}：${u.reason}`)
  for (const i of report.issues) {
    console.log(`  ✗ ${i.id}：${PATCH_FILE}:${i.line ?? '?'} 的 ${i.fieldPath} —— ${i.expected}；实际值 ${i.got}`)
    console.log(`      修法：${i.fix}`)
  }
  const bad = report.issues.length + report.unresolved.length
  console.log(bad === 0 ? 'RESULT 0 问题' : `RESULT ${bad} 项异常`)
  process.exit(bad === 0 ? 0 : 1)
}

/** 找到某 id 行在解析树里的路径前缀（用于把 schema 路径映射回 linesOf 键）。 */
function rowPrefixOf(entries, id) {
  const list = Array.isArray(entries) ? entries : []
  for (let i = 0; i < list.length; i++) {
    const item = list[i]
    if (item && String(item.id) === id) return `[${i}]`
    if (item && Array.isArray(item.insert)) {
      for (let j = 0; j < item.insert.length; j++) {
        if (String(item.insert[j]?.id) === id) return `[${i}].insert[${j}]`
      }
    }
  }
  return ''
}

/* ────────────────────────────── selfcheck ────────────────────────────── */

/** 解析器语义断言表：--selfcheck 逐条打印；缺省跑法也整体复验一次（失败即红）。 */
function selfcheckCases() {
  const linesOf = new Map()
  const P = (s, line = 1, path = 'x') => parseValue(s, line, path, linesOf)
  return [
    ['[searxng, bing, 360] 末项是数字（本脚本存在的理由）', () => typeof P('[searxng, bing, 360]')[2] === 'number'],
    ["['360'] 引号后是字符串", () => P("[searxng, '360']")[1] === '360'],
    ['[a, \'b c\'] 逗号在引号内不切分', () => P("[a, 'b, c']")[1] === 'b, c'],
    ['裸 true/false ⇒ 布尔', () => P('true') === true && P('false') === false],
    ['裸 null / ~ ⇒ null', () => P('null') === null && P('~') === null],
    ['整数与带符号整数 ⇒ number', () => P('42') === 42 && P('-7') === -7],
    ['浮点与科学计数 ⇒ number', () => P('0.9') === 0.9 && P('1e3') === 1000],
    ['0x/0o ⇒ number', () => P('0x1f') === 31 && P('0o17') === 15],
    ['普通词 ⇒ 字符串', () => P('auto-search') === 'auto-search'],
    ["'' ⇒ 空串", () => P("''") === ''],
    ['[] ⇒ 空数组', () => Array.isArray(P('[]')) && P('[]').length === 0],
    ['{} ⇒ 空对象', () => Object.keys(P('{}')).length === 0],
    ['{ provider: nvidia, model: a/b-c } ⇒ 对象', () => P('{ provider: nvidia, model: deepseek-ai/x }').model === 'deepseek-ai/x'],
    ['CRLF 行尾与缩进解析：整文件可解析且行数>0', () => loadPatch().entries.length > 0],
    ['歧义布尔写法 on/off/y/n ⇒ 抛错（不猜）', () => { try { P('on'); return false } catch (e) { return e instanceof YamlError } }],
    ['下划线数字 1_000 ⇒ 抛错', () => { try { P('1_000'); return false } catch (e) { return e instanceof YamlError } }],
    ['锚点 &x ⇒ 抛错', () => { try { P('&x y'); return false } catch (e) { return e instanceof YamlError } }],
    ['引号不成对 ⇒ 抛错', () => { try { P("'abc"); return false } catch (e) { return e instanceof YamlError } }],
    ['unwrapExports：default 优先 + __esModule 再跳一层', () => {
      const a = unwrapExports({ default: { name: 'A' }, name: 'X' })
      const b = unwrapExports({ __esModule: true, default: { name: 'B' }, name: 'X' })
      const c = unwrapExports({ name: 'C' })
      return a.name === 'A' && b.name === 'B' && c.name === 'C'
    }],
    ['行号映射：enabled 的键能定位到 cordis.patch.yml 的真实行', () => {
      // S1 剔除批改例：原用例锚 web-search-local 行的 engines 键，该行已随 MIT 外来件出包；
      // 换 rate-throttle 行的 config.enabled——本条验证的是行号映射机制本身，不锚特定行。
      const { entries, linesOf: lo } = loadPatch()
      const prefix = rowPrefixOf(entries, 'rate-throttle')
      const ln = lo.get(`${prefix}.config.enabled`)
      const text = readFileSync(PATCH_PATH, 'utf8').split(/\r?\n/)[ln - 1] ?? ''
      return text.includes('enabled:')
    }],
  ]
}

main().catch((e) => {
  console.error('patch 配置校验异常：', e?.message ?? e)
  process.exit(1)
})
