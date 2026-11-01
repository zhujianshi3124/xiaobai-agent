// E4 主张2（审核意见 13-§7）：面板下发面（快照 patch 原文 / 配置 / 绝对路径 / 审计位置）的
// 字段级脱敏。只做「形状识别 + 掩码」，不做加密；目标是让凭据形态与本机身份不出现在
// 面板响应里（面板 loopback-only，但按审核意见做纵深防御，不把回环当保密边界）。
//
// 两类判据：
//   ① 凭据形态 —— 与仓内 credential-scan 同一族正则（sk- / ghp_ / github_pat_ / AKIA /
//      私钥块），另加 JWT 三段与 Bearer 形态；命中保留前 6 字符，值体替换 …(redacted)。
//   ② 本机身份路径 —— os.homedir() 前缀替换为 ~，\Users\<名>\ 中段替换为 \Users\…\；
//      其余路径原样保留（面板 UI 需可辨识；真正的身份泄密点在用户名段）。
// 深度遍历：redactSecretDeep 对任意 JSON 值递归（字符串掩码、结构原样、不改变键）。
// 安全边界：这些函数只用于**展示面**。凡客户端会回传给服务端落盘的值（config/plan 的
// value、两段式执行走 plan token），服务端按真实文件计算，不经过本模块——掩码不会
// 进入任何写路径。
import { homedir } from 'node:os'

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9]{20,}/g,
  /ghp_[A-Za-z0-9]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /Bearer\s+[A-Za-z0-9._-]{16,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
]

/** 掩码凭据形态子串（字符串原样返回非字符串输入）。 */
export function redactSecretText(text) {
  if (typeof text !== 'string') return text
  let out = text
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (m) => m.slice(0, 6) + '…(redacted)')
  }
  return out
}

/** 掩码路径里的本机身份段：homedir 前缀 → ~，\Users\<名>\ → \Users\…\。 */
export function redactHomePath(p) {
  if (typeof p !== 'string' || p === '') return p
  let out = p
  try {
    const home = homedir()
    if (home && out.length >= home.length && out.slice(0, home.length).toLowerCase() === home.toLowerCase()) {
      out = '~' + out.slice(home.length)
    }
  } catch {
    // homedir 不可得时跳过前缀规则，中段规则照做
  }
  out = out.replace(/([\\/]+Users[\\/]+)[^\\/]+([\\/])/, '$1…$2')
  return out
}

/** 递归掩码（仅凭据形态）：结构原样、所有字符串过 redactSecretText。用于 diff 等展示面。 */
export function redactSecretDeep(value) {
  if (typeof value === 'string') return redactSecretText(value)
  if (Array.isArray(value)) return value.map((v) => redactSecretDeep(v))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = redactSecretDeep(v)
    return out
  }
  return value
}

/** 递归掩码：所有字符串过凭据形态识别；键名命中路径族（path/file/root/dir/audit/home）的字符串值再做本机身份掩码。 */
export function redactViewDeep(value) {
  if (typeof value === 'string') return redactSecretText(value)
  if (Array.isArray(value)) return value.map((v) => redactViewDeep(v))
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'string' && /path|file|root|dir|audit|home/i.test(k)) {
        out[k] = redactHomePath(redactSecretText(v))
      } else {
        out[k] = redactViewDeep(v)
      }
    }
    return out
  }
  return value
}
