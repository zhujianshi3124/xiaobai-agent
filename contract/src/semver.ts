/**
 * 最小 semver 与范围引擎（零依赖，覆盖契约所需的常用子集）。
 *
 * 支持的版本形式：`1.2.3`、`1.2.3-rc.1`、`1.2.3+build`（build 元数据忽略）。
 * 支持的范围形式（空格 = AND，`||` = OR）：
 *   - 精确：`1.2.3`、`=1.2.3`
 *   - 比较符：`>=1.2.3` `>1.2.3` `<1.2.3` `<=1.2.3`
 *   - 脱字符：`^1.2.3`、`^1.0`、`^0.2`、`^0.0.3`
 *   - 波浪符：`~1.2.3`、`~1.2`、`~1`
 *   - x 范围：`*`、`1.x`、`1.2.x`、裸部分版本 `1`、`1.2`
 *
 * prerelease 语义：遵循 npm 规则并做一处**显式偏差**——
 *   - `*`、`^1.0`、`<0.2.0` 这类范围不命中预发版（同 npm）；
 *   - 范围的**任一比较器带 prerelease**（如 `>=0.1.2-rc.1 <0.2.0`）即视为
 *     整个范围放行预发版。偏差理由：存量生态用该形式约束运行时且宿主
 *     实际版本是预发版（`0.1.5-rc.1`），npm 的逐 core 准入会错误拒绝；
 *     契约校验按 DSH 生态意图执行。
 *
 * 明确不支持：连字符范围（`1.2.3 - 2.3.4`，报错并提示改用比较符形式）。
 * 存量运行时范围（如 `">=0.1.2-rc.1 <0.2.0"`）属于比较符形式，已覆盖。
 */

export interface Semver {
  major: number
  minor: number
  patch: number
  prerelease: string[]
}

const VERSION_RE =
  /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/

/** 解析完整 semver；非法输入返回 null。 */
export function parseSemver(input: string): Semver | null {
  const m = VERSION_RE.exec(input)
  if (!m) return null
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] === undefined ? [] : m[4].split('.'),
  }
}

export function isValidSemver(input: string): boolean {
  return parseSemver(input) !== null
}

function isNumeric(id: string): boolean {
  return /^\d+$/.test(id)
}

/** semver 优先级比较：负数表示 a < b。prerelease 版本低于正式版。 */
export function compareSemver(a: Semver, b: Semver): number {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  if (a.patch !== b.patch) return a.patch - b.patch
  const ap = a.prerelease
  const bp = b.prerelease
  if (ap.length === 0 && bp.length === 0) return 0
  // 无 prerelease 的一方更高。
  if (ap.length === 0) return 1
  if (bp.length === 0) return -1
  const len = Math.min(ap.length, bp.length)
  for (let i = 0; i < len; i++) {
    const x = ap[i]!
    const y = bp[i]!
    if (x === y) continue
    const xn = isNumeric(x)
    const yn = isNumeric(y)
    if (xn && yn) return Number(x) - Number(y)
    if (xn) return -1 // 数字标识符低于字母数字标识符
    if (yn) return 1
    return x < y ? -1 : 1
  }
  return ap.length - bp.length // 前缀相同：短的一方更低
}

interface Comparator {
  op: '>=' | '>' | '<' | '<=' | '='
  version: Semver | null // null 表示无上/下界语义（如 `*`）
}

function cmp(op: Comparator['op'], a: Semver, b: Semver): boolean {
  const c = compareSemver(a, b)
  switch (op) {
    case '>=':
      return c >= 0
    case '>':
      return c > 0
    case '<':
      return c < 0
    case '<=':
      return c <= 0
    case '=':
      return c === 0
  }
}

interface ParsedComparator {
  op: Comparator['op']
  /** 完整版本（缺省补 0）；x 范围另行展开为上下界。 */
  version: Semver
  /** x 范围的上界（不含）；null 表示无上界。 */
  upper: Semver | null
  /** x 范围的上界是否带 prerelease 语义（npm 用 -0 上界拦截预发版）。 */
  upperPrerelease: boolean
}

function parsePartial(raw: string): { parts: (number | 'x')[]; prerelease: string[]; plusPrerelease: boolean } | null {
  let s = raw.replace(/^[vV]/, '')
  let prerelease: string[] = []
  const plus = s.indexOf('+')
  if (plus >= 0) s = s.slice(0, plus)
  const dash = s.indexOf('-')
  if (dash >= 0) {
    prerelease = s.slice(dash + 1).split('.')
    s = s.slice(0, dash)
  }
  const segs = s.split('.')
  if (segs.length === 0 || segs.length > 3) return null
  const parts: (number | 'x')[] = []
  let seenX = false
  for (const seg of segs) {
    if (seg === 'x' || seg === 'X' || seg === '*') {
      seenX = true
      parts.push('x')
      continue
    }
    if (seenX) return null // x 之后不允许再出现数字段
    if (!/^\d+$/.test(seg)) return null
    parts.push(Number(seg))
  }
  return { parts, prerelease, plusPrerelease: prerelease.length > 0 }
}

function buildSemver(major: number, minor: number, patch: number, prerelease: string[]): Semver {
  return { major, minor, patch, prerelease }
}

function upperBound(major: number, minor: number, patch: number, withPrereleaseFloor: boolean): Semver {
  const v = buildSemver(major, minor, patch, [])
  if (withPrereleaseFloor) v.prerelease = ['0'] // -0 拦截：2.0.0-alpha 不满足 <2.0.0-0 之外的语义
  return v
}

/** 把单个比较器 token 解析为可测试的形式；非法返回 null（由调用方报错）。 */
function parseComparator(token: string): ParsedComparator | null {
  let op: Comparator['op'] = '='
  let rest = token
  const opMatch = /^(>=|<=|>|<|=|\^|~)/.exec(rest)
  if (opMatch && opMatch[1] !== undefined) {
    const raw = opMatch[1]
    if (raw === '^' || raw === '~') {
      const p = parsePartial(rest.slice(raw.length))
      if (!p) return null
      const pr = p.prerelease
      if (p.parts.includes('x')) return null // ^1.x / ~1.x 不是合法 caret/tilde 形式
      const num = (n: number | 'x' | undefined): number => (typeof n === 'number' ? n : 0)
      const ma = num(p.parts[0])
      const mi = num(p.parts[1])
      const pa = num(p.parts[2])
      if (raw === '^') {
        // 左起第一个非零分量锁死：1.2.3 → <2.0.0；0.2.3 → <0.3.0；0.0.3 → <0.0.4
        let upper: Semver
        if (ma > 0) upper = upperBound(ma + 1, 0, 0, pr.length > 0)
        else if (mi > 0) upper = upperBound(0, mi + 1, 0, pr.length > 0)
        else upper = upperBound(0, 0, pa + 1, pr.length > 0)
        return { op: '>=', version: buildSemver(ma, mi, pa, pr), upper, upperPrerelease: pr.length > 0 }
      }
      // ~：锁定到 minor（除非只给了 major）
      if (p.parts.length === 1) {
        return {
          op: '>=',
          version: buildSemver(ma, 0, 0, pr),
          upper: upperBound(ma + 1, 0, 0, pr.length > 0),
          upperPrerelease: pr.length > 0,
        }
      }
      return {
        op: '>=',
        version: buildSemver(ma, mi, pa, pr),
        upper: upperBound(ma, mi + 1, 0, pr.length > 0),
        upperPrerelease: pr.length > 0,
      }
    }
    op = raw as Comparator['op']
    rest = rest.slice(raw.length)
  }
  const p = parsePartial(rest)
  if (!p) return null
  const [ma = 'x', mi = 'x', pa = 'x'] = p.parts
  if (ma === 'x') {
    // `*` / 空：无任何界限
    return { op: '>=', version: buildSemver(0, 0, 0, []), upper: null, upperPrerelease: false }
  }
  const major = ma
  if (mi === 'x' || pa === 'x') {
    // 部分版本：裸（或 =）按 x 范围展开；带 >/>=/</<= 比较符的补零为无上界比较器
    //（>=20 → >=20.0.0，而非误加 <21 上界——DSH 生态 `engines.node: ">=20"` 语义）。
    const lower = buildSemver(major, mi === 'x' ? 0 : mi, 0, [])
    if (op !== '=') {
      return { op, version: lower, upper: null, upperPrerelease: false }
    }
    if (mi === 'x') {
      return {
        op: '>=',
        version: buildSemver(major, 0, 0, []),
        upper: upperBound(major + 1, 0, 0, false),
        upperPrerelease: false,
      }
    }
    return {
      op: '>=',
      version: buildSemver(major, mi, 0, []),
      upper: upperBound(major, mi + 1, 0, false),
      upperPrerelease: false,
    }
  }
  if (op === '=') return { op: '=', version: buildSemver(major, mi, pa, p.prerelease), upper: null, upperPrerelease: false }
  return { op, version: buildSemver(major, mi, pa, p.prerelease), upper: null, upperPrerelease: false }
}

interface RangeGroup {
  comparators: ParsedComparator[]
  /** 组内是否存在带 prerelease 的比较器（npm prerelease 准入规则用）。 */
  hasPrerelease: boolean
}

function parseRangeGroup(group: string): RangeGroup | null {
  const trimmed = group.trim()
  if (trimmed === '') return { comparators: [], hasPrerelease: false } // 空串 = `*`
  const rawTokens = trimmed.split(/\s+/)
  // 允许 `>= 1.2.3`（操作符与版本间有空格）：合并纯操作符 token。
  const tokens: string[] = []
  for (const t of rawTokens) {
    if (/^(>=|<=|>|<|=|\^|~)$/.test(t)) {
      tokens.push(t) // 与下一个 token 在下方合并
      continue
    }
    const prev = tokens[tokens.length - 1]
    if (prev !== undefined && /^(>=|<=|>|<|=|\^|~)$/.test(prev)) {
      tokens[tokens.length - 1] = prev + t
    } else {
      tokens.push(t)
    }
  }
  const comparators: ParsedComparator[] = []
  let hasPrerelease = false
  for (const token of tokens) {
    const c = parseComparator(token)
    if (!c) return null
    comparators.push(c)
    if (c.version.prerelease.length > 0) hasPrerelease = true
    if (c.upper !== null && c.upperPrerelease) hasPrerelease = true
  }
  return { comparators, hasPrerelease }
}

export interface ParsedRange {
  groups: RangeGroup[]
}

/** 解析范围；非法（含连字符范围、^1.x 等）返回 null。 */
export function parseRange(input: string): ParsedRange | null {
  const s = input.trim()
  if (s === '') return null
  const groups: RangeGroup[] = []
  for (const part of s.split('||')) {
    if (/\s-\s/.test(part) || /^\s*-\s/.test(part)) return null // 连字符范围显式拒绝
    const g = parseRangeGroup(part)
    if (!g) return null
    groups.push(g)
  }
  return { groups }
}

export function isValidRange(input: string): boolean {
  return parseRange(input) !== null
}

function testGroup(v: Semver, group: RangeGroup): boolean {
  const isPrerelease = v.prerelease.length > 0
  if (isPrerelease && !group.hasPrerelease) return false
  for (const c of group.comparators) {
    if (c.upper !== null) {
      if (!cmp('<', v, c.upper)) return false
      if (!cmp('>=', v, c.version)) return false
      continue
    }
    if (!cmp(c.op, v, c.version)) return false
    // prerelease 精确匹配语义：比较器带 prerelease 且 op 为 '=' 时 core 必须一致（cmp 已保证）。
  }
  return true
}

/** 版本是否满足范围。 */
export function versionSatisfies(version: string | Semver, range: string): boolean {
  const v = typeof version === 'string' ? parseSemver(version) : version
  const r = parseRange(range)
  if (!v || !r) return false
  return r.groups.some((g) => testGroup(v, g))
}
