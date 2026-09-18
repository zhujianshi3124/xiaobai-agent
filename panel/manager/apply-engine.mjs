// P2.1 两段式写框架：plan → 用户确认 → execute。
//
// 设计要点（对应 handoff 11.7 的 P2.1 行与安全模型）：
//   1. **两段式**：plan 只做只读计算（目标文件 / diff 预览 / 有效期 / 期望 SHA），
//      不落盘；execute 时才真正写。
//   2. **SHA 冲突检测**：plan 记录目标文件当时的 sha256；execute 前**重读文件**
//      比对，不一致即拒绝并报 409（文件已被他处改动，plan 已失效）。
//   3. **有效期**：plan 带 createdAt / expiresAt，过期 execute 拒绝（409）。
//   4. **写前备份 + manifest + 保留策略**：落盘前先 `createBackup`，随后按
//      「最近 20 份 或 30 天」裁剪，防止备份目录无限增长。
//   5. **锚点唯一**：任何文本改写都必须先定位锚点，命中数 ≠ 1 一律拒绝
//      （0 表示目标不存在，≥2 表示歧义 —— 两种情况都不得猜）。
//   6. **值白名单**：由调用方（P2.2/P2.3）提供校验函数，本层负责在执行前复验。
//
// 并发防线（plugin-manager 并发）：所有 plan 都是**现读现算**，不缓存任何文件
// 内容；execute 同样**重读**而非复用 plan 期间的读取结果。这样即便期间有外部
// 写入，也会被 SHA 比对兜住。

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { createBackup, listBackups } from "./backup.mjs";

export const DEFAULT_PLAN_TTL_MS = 5 * 60 * 1000; // 5 分钟
export const BACKUP_KEEP_COUNT = 20; // 保留策略：最近 20 份
export const BACKUP_KEEP_DAYS = 30; // 保留策略：或 30 天

export function sha256Of(text) {
  return createHash("sha256").update(text).digest("hex");
}

export class PlanError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PlanError";
    this.code = code;
  }
}

/** 统一的行尾归一化：比较/展示时忽略 CRLF 与 LF 的差异。 */
function normalizeEol(text) {
  return String(text).replace(/\r\n/g, "\n");
}

/** 按行拆分并保留行尾信息，便于原样回写。 */
function splitLines(text) {
  const hasCrlf = /\r\n/.test(text);
  const lines = text.split(/\r?\n/);
  return { lines, hasCrlf };
}

function joinLines(lines, hasCrlf) {
  return lines.join(hasCrlf ? "\r\n" : "\n");
}

/**
 * 定位锚点行：`- id: <rowId>` 必须**恰好命中 1 次**。
 * 返回 { lineIndex, indent }；命中 0 或 ≥2 时抛 PlanError。
 */
export function locateRowAnchor(text, rowId) {
  if (typeof rowId !== "string" || rowId === "") {
    throw new PlanError("anchor-invalid", "锚点 id 为空，拒绝写盘");
  }
  const { lines } = splitLines(text);
  const hits = [];
  const pattern = new RegExp("^(\\s*)- id:\\s*" + rowId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*(?:#.*)?$");
  for (let i = 0; i < lines.length; i++) {
    const match = pattern.exec(lines[i]);
    if (match) hits.push({ lineIndex: i, indent: match[1].length });
  }
  if (hits.length === 0) {
    throw new PlanError("anchor-missing", "在配置文件里找不到 `- id: " + rowId + "`（命中 0 次），拒绝写盘");
  }
  if (hits.length > 1) {
    throw new PlanError("anchor-ambiguous", "`- id: " + rowId + "` 在配置文件里出现 " + hits.length + " 次（要求恰好 1 次），拒绝写盘");
  }
  return hits[0];
}

/**
 * 读取某个 row 块的直接子级键（缩进 = `- id:` 缩进 + 2）的行位置。
 * 返回 [{ lineIndex, key, value, raw }]。
 */
export function readRowOwnKeys(lines, anchor) {
  const ownKeyIndent = anchor.indent + 2;
  const found = [];
  for (let j = anchor.lineIndex + 1; j < lines.length; j++) {
    const line = lines[j];
    if (/^\s*- id:/.test(line)) break;
    const keyMatch = /^(\s+)([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (!keyMatch) continue;
    const keyIndent = keyMatch[1].length;
    if (keyIndent <= anchor.indent) break;
    if (keyIndent > ownKeyIndent) continue; // 嵌套分支不属于直接子级
    found.push({ lineIndex: j, key: keyMatch[2], value: keyMatch[3].trim(), raw: line });
  }
  return found;
}

/**
 * 计算「把 row 的某个直接子级布尔键设为指定值」的文本改写。
 *
 * 语义：
 *   - 键已存在 → 原地替换该行的值，保留原缩进与注释之外的书写风格。
 *   - 键不存在 → 若 value 为 true 且已有 `disabled` 之类的对偶键，则删除对偶键；
 *     否则在块内最后一个直接子级之后插入新行。
 *
 * 返回 { nextText, anchor, before, after, changed }。
 */
export function planRowFlag(text, { rowId, key, value, indentUnit = "  " }) {
  const { lines, hasCrlf } = splitLines(text);
  const anchor = locateRowAnchor(text, rowId);
  const own = readRowOwnKeys(lines, anchor);
  const target = own.find((entry) => entry.key === key);
  const next = lines.slice();
  const anchorIndentStr = " ".repeat(anchor.indent + 2);

  if (target) {
    const before = target.raw;
    const after = anchorIndentStr + key + ": " + String(value);
    if (before === after) {
      return { nextText: text, anchor, before, after, changed: false };
    }
    next[target.lineIndex] = after;
    return { nextText: joinLines(next, hasCrlf), anchor, before, after, changed: true };
  }

  // 键不存在：插入到锚点行**正下方**（缩进 = 锚点缩进 + 2）。
  //
  // 为什么不用「块内最后一个直接子级的下一行」作插入点：`config:` 本身是直接子级，
  // 但它后面跟着整棵 config 子树（缩进更深）。在它之后插入会把新键塞进 config 内部，
  // 语义完全错位（真实案例：`disabled: true` 被写到 rate-throttle 的 config 里）。
  // 锚点行正下方永远是合法的同级位置。
  const insertAt = anchor.lineIndex + 1;
  const newLine = anchorIndentStr + key + ": " + String(value);
  next.splice(insertAt, 0, newLine);
  return {
    nextText: joinLines(next, hasCrlf),
    anchor,
    before: null,
    after: newLine,
    changed: true,
  };
}

/** 生成人类可读的 unified 风格 diff（仅本行改写，故为极简实现）。 */
export function renderDiff({ before, after, changed }) {
  if (!changed) {
    return [
      "（无变化：目标键已是该值）",
    ];
  }
  const out = [];
  if (before === null) {
    out.push("+ " + after);
  } else {
    out.push("- " + before);
    out.push("+ " + after);
  }
  return out;
}

// ---------------- P2.2 启停开关专用 ----------------

/**
 * 交叉引用检查：停用某个插件行之前，扫描 patch 全文，看**其它行块**是否引用了
 * 该插件的 id 或包名。
 *
 * 动机：cordis 的 patch 行之间可能存在引用（例如某行以 `name:` / `inject:` /
 * 字符串值指向另一个插件）。若被引用方被停用，引用方会指向一个不存在/未加载的
 * 目标。停用前必须把这种关系摆到台面上，**由用户决定**，而不是默默写盘。
 *
 * 检查口径（宽松但可解释）：逐行扫描，命中即记；跳过该 id 自己所在的那个行块。
 * 命中项里若同时出现该插件的**包名尾部**（如 `rate-throttle`）也算引用。
 *
 * @returns {Array<{ line: number, text: string }>} 命中列表（可能为空）
 */
export function findCrossReferences(text, { rowId, alsoMatch = [] }) {
  const { lines } = splitLines(text);
  const needles = [rowId].concat(alsoMatch.filter((s) => typeof s === "string" && s !== "")).filter(Boolean);
  if (needles.length === 0) return [];

  // 先定位所有行块的边界，用于排除「自己所在块」
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)- id:\s*([^#\s]+)/.exec(lines[i]);
    if (m) blocks.push({ start: i, id: m[2] });
  }
  for (let b = 0; b < blocks.length; b++) {
    blocks[b].end = b + 1 < blocks.length ? blocks[b + 1].start - 1 : lines.length - 1;
  }
  const own = blocks.find((b) => b.id === rowId);
  const isSelf = (lineIndex) => own && lineIndex >= own.start && lineIndex <= own.end;

  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    if (isSelf(i)) continue;
    const line = lines[i];
    if (/^\s*#/.test(line)) continue; // 注释行不算引用
    for (const needle of needles) {
      // 整词匹配：避免 `rate-throttle` 命中 `rate-throttle-x`
      const re = new RegExp("(^|[^A-Za-z0-9_-])" + needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^A-Za-z0-9_-]|$)");
      if (re.test(line)) {
        hits.push({ line: i + 1, text: line.trim() });
        break;
      }
    }
  }
  return hits;
}

/** `disabled` 能被本面板安全改写的**字面量**取值。其它形态一律拒绝改写。 */
export const LITERAL_DISABLED_VALUES = ["true", "false"];

/**
 * 读出某行现有的 `disabled` 原始文本（不存在则返回 null）。
 *
 * 存在的意义是把「字面量」与「表达式」区分开：`disabled` 在 DSH 里除了
 * `true` / `false`，还可以写 `!!js <表达式>`（由 cordis Loader 在条目激活时
 * 用 `Boolean(eval(expr))` 求值，见 cordis-plugin-loader 的 `_disabled`）。
 * 这类条件表达式**本面板不解释**，改写会抹掉条件，因此必须拒绝。
 */
export function readRowDisabledLiteral(text, rowId) {
  const { lines } = splitLines(text);
  const anchor = locateRowAnchor(text, rowId);
  const own = readRowOwnKeys(lines, anchor);
  const hit = own.find((entry) => entry.key === "disabled");
  if (!hit) return null;
  return { line: hit.lineIndex + 1, raw: hit.value, literal: LITERAL_DISABLED_VALUES.includes(hit.value) };
}

/**
 * 生成「启停某插件行」的 plan（**只读**）。
 *
 * `enabled = true`  → 写 `disabled: false`（显式声明为启用；不删键，语义更明确）
 * `enabled = false` → 写 `disabled: true`
 *
 * 停用（`enabled = false`）时会附带交叉引用报告；**报告非空不自动阻止**，
 * 而是把决定权交给调用方（UI 需展示并要求用户确认）。
 *
 * **非字面量 disabled 一律拒绝**（Q1 安全闸）：若该行现有的 `disabled` 是
 * `!!js <表达式>` 这类平台条件写法，本面板既无法正确呈现它，改写又会把条件
 * 抹成硬布尔 —— 两个方向都错。此时 fail-closed，让用户手工编辑。
 */
export function createTogglePlan({ file, rowId, enabled, backupRoot, ttlMs = DEFAULT_PLAN_TTL_MS, alsoMatch = [] }) {
  if (typeof enabled !== "boolean") {
    throw new PlanError("value-invalid", "启停值必须是布尔（true / false）");
  }
  if (!existsSync(file)) {
    throw new PlanError("target-missing", "目标文件不存在：" + file);
  }
  const text = readFileSync(file, "utf8");

  // Q1 安全闸：先看现有 disabled 是不是字面量。不是就停手，绝不覆盖。
  const existing = readRowDisabledLiteral(text, rowId);
  if (existing && !existing.literal) {
    throw new PlanError(
      "value-not-literal",
      "该行第 " + existing.line + " 行的 disabled 不是普通布尔值，而是条件写法（`" + existing.raw + "`）。"
        + "面板不解释平台条件表达式，直接改写会抹掉条件，故拒绝写盘。请手工编辑这一行。",
    );
  }

  // 锚点唯一性由 planRowFlag → locateRowAnchor 保证（0 或 ≥2 都会抛）
  const result = planRowFlag(text, { rowId, key: "disabled", value: enabled ? "false" : "true" });
  const crossRefs = enabled ? [] : findCrossReferences(text, { rowId, alsoMatch });
  const now = Date.now();

  return {
    token: createHash("sha256")
      .update(file + "|toggle|" + rowId + "|" + String(enabled) + "|" + sha256Of(text) + "|" + now)
      .digest("hex")
      .slice(0, 32),
    kind: "toggle",
    file,
    rowId,
    key: "disabled",
    value: enabled ? "false" : "true",
    targetEnabled: enabled,
    backupRoot: backupRoot || null,
    expectedSha: sha256Of(text),
    nextSha: sha256Of(result.nextText),
    changed: result.changed,
    anchorLine: result.anchor.lineIndex + 1,
    diff: renderDiff(result),
    crossRefs,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
    nextText: result.nextText,
  };
}

// ---------------- 备份保留策略 ----------------

/**
 * 裁剪备份目录，防无限增长。
 *
 * 语义（对应验收要求「最近 20 份**或** 30 天」的工程化落地）：
 *
 *   keep  =  (属于最新的 keepCount 份)  OR  (mtime 在 keepDays 天内)
 *   但整体受 maxTotal 绝对上限约束 —— 超出绝对上限的，**无论多新都按份数裁掉**。
 *
 * 三条规则的取舍理由：
 *   - 纯「或」语义（不加绝对上限）在**密集写入**时会退化为一份不删：连续 25 次写入
 *     都在 30 天内 → 时间窗把全部兜住 → 保留策略形同虚设。这正是它要防的场景。
 *   - 纯「份数」语义则会误删近期但份数超出的备份，与「30 天」的意图冲突。
 *   - 因此取「或」语义 + 绝对上限：日常稀疏写入时按 30 天宽限保留，密集写入时由
 *     绝对上限兜住，任何情况下都不会无限增长。默认 maxTotal = keepCount * 2 = 40。
 *
 * 返回 { kept, removed }。
 */
export function pruneBackups(
  backupRoot,
  { keepCount = BACKUP_KEEP_COUNT, keepDays = BACKUP_KEEP_DAYS, maxTotal = keepCount * 2, now = Date.now() } = {},
) {
  const all = listBackups(backupRoot); // 已按名字倒序（最新在前）
  const kept = [];
  const removed = [];
  const cutoff = now - keepDays * 24 * 60 * 60 * 1000;
  all.forEach((name, index) => {
    const dir = join(backupRoot, name);
    let keep;
    if (index >= maxTotal) {
      keep = false; // 绝对上限之外，无论多新都裁掉
    } else if (index < keepCount) {
      keep = true; // 最新 keepCount 份，无条件保留
    } else {
      try {
        keep = statSync(dir).mtimeMs >= cutoff; // 超出的部分，仅时间窗内保留
      } catch {
        keep = false;
      }
    }
    if (keep) {
      kept.push(name);
      return;
    }
    try {
      rmSync(dir, { recursive: true, force: true });
      removed.push(name);
    } catch {
      kept.push(name); // 删不掉就留着，不因清理失败影响主流程
    }
  });
  return { kept, removed };
}

// ---------------- 两段式主流程 ----------------

/**
 * 生成 plan（**只读**，绝不落盘）。
 *
 * @param {object} args
 * @param {string} args.file            目标文件绝对路径
 * @param {string} args.rowId           锚点行 id（必须恰好命中 1 次）
 * @param {string} args.key             要改的直接子级键
 * @param {string|boolean} args.value   目标值
 * @param {string} [args.backupRoot]    备份根目录
 * @param {number} [args.ttlMs]         有效期
 * @returns plan 对象（含 token、期望 SHA、diff 预览、有效期）
 */
export function createPlan({ file, rowId, key, value, backupRoot, ttlMs = DEFAULT_PLAN_TTL_MS }) {
  if (!existsSync(file)) {
    throw new PlanError("target-missing", "目标文件不存在：" + file);
  }
  const text = readFileSync(file, "utf8");
  const result = planRowFlag(text, { rowId, key, value: String(value) });
  const now = Date.now();
  const plan = {
    token: createHash("sha256")
      .update(file + "|" + rowId + "|" + key + "|" + String(value) + "|" + sha256Of(text) + "|" + now)
      .digest("hex")
      .slice(0, 32),
    file,
    rowId,
    key,
    value: String(value),
    backupRoot: backupRoot || null,
    expectedSha: sha256Of(text),
    nextSha: sha256Of(result.nextText),
    changed: result.changed,
    anchorLine: result.anchor.lineIndex + 1,
    diff: renderDiff(result),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
    nextText: result.nextText,
  };
  return plan;
}

/** 内存 plan 存储（**短生命周期**；进程重启即清空，符合"现读不缓存"原则）。 */
const PLAN_STORE = new Map();

export function putPlan(plan) {
  PLAN_STORE.set(plan.token, plan);
  return plan;
}

export function getPlan(token) {
  return PLAN_STORE.get(token);
}

export function dropPlan(token) {
  PLAN_STORE.delete(token);
}

export function planCount() {
  return PLAN_STORE.size;
}

/**
 * 执行 plan（**唯一落盘入口**）。
 *
 * 顺序（不可调换）：
 *   1. 取出 plan；不存在 → 404
 *   2. 过期校验 → 409
 *   3. **重读文件**比对 SHA → 不一致 409（并发防线核心）
 *   4. 复验锚点仍恰好命中 1 次
 *   5. **写前备份**（含 manifest）
 *   6. 落盘
 *   7. 裁剪备份（保留策略）
 *
 * @returns {Object} 结果对象；失败时抛 PlanError（含 code 与建议的状态码）
 */
export function executePlan(token, { now = Date.now() } = {}) {
  const plan = PLAN_STORE.get(token);
  if (!plan) {
    throw new PlanError("plan-not-found", "方案不存在或已失效，请重新生成");
  }
  if (Date.parse(plan.expiresAt) <= now) {
    PLAN_STORE.delete(token);
    throw new PlanError("plan-expired", "方案已过期（有效期 5 分钟），请重新生成");
  }
  if (!existsSync(plan.file)) {
    throw new PlanError("target-missing", "目标文件已不存在：" + plan.file);
  }

  // 3. 并发防线：重读 + SHA 比对
  const currentText = readFileSync(plan.file, "utf8");
  const currentSha = sha256Of(currentText);
  if (currentSha !== plan.expectedSha) {
    throw new PlanError(
      "sha-conflict",
      "文件在方案生成后被改动过（期望 " + plan.expectedSha.slice(0, 12) + "…，实际 " + currentSha.slice(0, 12) + "…），已拒绝写入",
    );
  }

  // 4. 锚点复验（即便 SHA 一致也不跳过 —— 防的是"plan 本身构造有误"）
  const anchor = locateRowAnchor(currentText, plan.rowId);
  if (anchor.lineIndex + 1 !== plan.anchorLine) {
    throw new PlanError("anchor-moved", "锚点行位置与方案记录不一致，已拒绝写入");
  }

  // 5. 写前备份
  let backupDir = null;
  if (plan.backupRoot) {
    mkdirSync(plan.backupRoot, { recursive: true });
    backupDir = createBackup({ backupRoot: plan.backupRoot, files: [plan.file] });
  }

  // 6. 落盘
  writeFileSync(plan.file, plan.nextText, "utf8");

  // 7. 保留策略
  let pruned = { kept: [], removed: [] };
  if (plan.backupRoot) {
    pruned = pruneBackups(plan.backupRoot);
  }

  PLAN_STORE.delete(token);

  const writtenText = readFileSync(plan.file, "utf8");
  return {
    ok: true,
    file: plan.file,
    rowId: plan.rowId,
    key: plan.key,
    value: plan.value,
    changed: plan.changed,
    shaBefore: plan.expectedSha,
    shaAfter: sha256Of(writtenText),
    backupDir,
    backupsRemoved: pruned.removed.length,
    diff: plan.diff,
  };
}
