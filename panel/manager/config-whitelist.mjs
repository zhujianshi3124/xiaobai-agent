// P2.3 配置编辑 · 值白名单（服务端唯一权威，不信任前端）。
//
// 依据（设计稿 p23-design.md §二/§八/§九，判定侧第 19 轮批准）：
//   - 可写入口仅限 rate-throttle（唯一有 config.enabled / 参数真实消费的插件）；
//   - 18 个字段（顶层 6 + routing 12），全部为标量（布尔 / 数值）——数组、对象、
//     文件路径一律不在白名单（任意路径写风险 / 被热通道遮蔽，见 §二「不开放」表）；
//   - 有源码校验的 13 个字段：面板合法域 ⊆ 源码校验域（**只收窄、不放宽**，判定侧
//     第 19 轮批准要求 ②）；
//   - 无源码校验的 5 个字段（minIntervalMs / maxRequestsPerMinute / maxIntervalMs /
//     backoffFactor / routing.maxDowngradeCompactsPerTurn）：合法域依据见 §九
//     （0 陷阱 / 反语义 / 除零 / 区间倒挂，全部源码实证）。
//
// 生效路径（§八已钉死）：18/18 字段生效值 = patch 值（插件激活快照 cfg :156-190），
// 唯一生效方式 = 重启 dsh web；热 JSON / settings / env 均不聚合、不覆盖白名单字段。

/** 字段元数据：type / 合法域 / 源码锚点（定义行 + 消费行）。 */
export const CONFIG_WHITELIST = {
  // ---- 顶层（config: 直下）----
  "enabled":                  { type: "bool",   def: "config.enabled !== false（缺省 true）", src: ":157", use: ":224" },
  "minIntervalMs":            { type: "int",    min: 0, max: 3600000,  src: ":159", use: ":220/:234/:280" },
  "maxRequestsPerMinute":     { type: "int",    min: 1, max: 600,      src: ":160", use: ":240" },
  "adaptive":                 { type: "bool",   def: "config.adaptive !== false（缺省 true）", src: ":161", use: ":273" },
  "maxIntervalMs":            { type: "int",    min: 1, max: 86400000, src: ":162", use: ":279", cross: "minIntervalMs" },
  "backoffFactor":            { type: "number", min: 1, max: 10,       src: ":163", use: ":234/:280" },
  // ---- routing: 子块 ----
  "routing.enabled":                     { type: "bool",   def: "routingCfg.enabled !== false（缺省 true）", src: ":167", use: ":656/:781" },
  "routing.autoGroups":                  { type: "bool",   def: "routingCfg.autoGroups !== false（缺省 true）", src: ":168", use: ":524/:583" },
  "routing.autoGroupTtlMs":              { type: "int",    min: 1, max: 86400000, src: ":169（posNum >0）", use: ":587" },
  "routing.cooldownMs":                  { type: "int",    min: 1, max: 86400000, src: ":174（posNum >0）", use: ":606" },
  "routing.tpmTurnSkip":                 { type: "bool",   def: "routingCfg.tpmTurnSkip !== false（缺省 true）", src: ":175", use: ":621/:656" },
  "routing.tpmCooldownMs":               { type: "int",    min: 0, max: 86400000, src: ":152-158（>=0，0=关闭短除名）", use: ":1003-1019" },
  "routing.downgradeContextMargin":      { type: "number", min: 0.1, max: 1,    src: ":177（posNum >0）", use: ":839" },
  "routing.maxDowngradeCompactsPerTurn": { type: "int",    min: 0, max: 10,       src: ":178（无源码校验）", use: ":855" },
  "routing.metricsWindowMs":             { type: "int",    min: 1, max: 86400000, src: ":179（posNum >0）", use: ":327/:355/:373" },
  "routing.metricsLogIntervalMs":        { type: "int",    min: 1, max: 86400000, src: ":180（posNum >0）", use: ":368" },
  "routing.clearCooldownOnUserSwitch":   { type: "bool",   def: "routingCfg... !== false（缺省 true）", src: ":181", use: ":1047" },
  "routing.syncSelectionOnFailover":     { type: "bool",   def: "routingCfg... !== false（缺省 true）", src: ":182", use: ":948" },
};

/** 服务端唯一可写的插件行。 */
export const CONFIG_EDITABLE_ROW = "rate-throttle";

/**
 * 校验并归一一个白名单字段的值。
 * @returns {{ ok: true, value: boolean|number }} 或 {{ ok: false, error: string }}
 */
export function validateConfigValue(path, value) {
  const rule = CONFIG_WHITELIST[path];
  if (!rule) {
    return { ok: false, error: "字段不在白名单内（拒绝写入）：" + String(path) };
  }
  // 拒绝一切含换行 / YAML 结构字符的输入（防御性：理论上类型检查已挡住，双保险）。
  if (typeof value === "string" && /[\r\n:#{}\[\]&*!|>%@`"'\\]/.test(value)) {
    return { ok: false, error: "值含非法字符（换行或 YAML 结构字符），拒绝写入" };
  }
  if (rule.type === "bool") {
    if (value === true || value === "true") return { ok: true, value: true };
    if (value === false || value === "false") return { ok: true, value: false };
    return { ok: false, error: path + " 必须是布尔（true / false）" };
  }
  // 数值字段：接受 number 或纯数字字符串（UI 数字框可能回传字符串）
  const n = typeof value === "number" ? value : (typeof value === "string" && /^-?[0-9]+(\.[0-9]+)?$/.test(value) ? Number(value) : NaN);
  if (!Number.isFinite(n)) {
    return { ok: false, error: path + " 必须是数字" };
  }
  if (rule.type === "int" && !Number.isInteger(n)) {
    return { ok: false, error: path + " 必须是整数" };
  }
  if (n < rule.min || n > rule.max) {
    return { ok: false, error: path + " 超出合法范围（" + rule.min + "–" + rule.max + "）" };
  }
  return { ok: true, value: n };
}

/**
 * 跨字段校验：maxIntervalMs ≥ minIntervalMs（防倒置值写入，判定侧第 19 轮预认可）。
 * @param {boolean|number} nextMaxInterval 新写入的 maxIntervalMs
 * @param {boolean|number|null} currentMinInterval 当前 patch 里的 minIntervalMs（读不到传 null = 跳过）
 */
export function checkCrossField(nextMaxInterval, currentMinInterval) {
  if (typeof nextMaxInterval !== "number") return { ok: false, error: "maxIntervalMs 必须是数字" };
  if (typeof currentMinInterval === "number" && nextMaxInterval < currentMinInterval) {
    return {
      ok: false,
      error: "跨字段校验失败：maxIntervalMs（" + nextMaxInterval + "）不得小于当前 minIntervalMs（" + currentMinInterval + "），否则退避区间倒挂",
    };
  }
  return { ok: true };
}
