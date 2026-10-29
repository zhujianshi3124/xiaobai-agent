// 债 7 · 面向用户的治理报告读取通道（只读）。
//
// 为什么要有这个文件：治理报告此前**只有插件之间在读**（分层读用量、清理读分层），
// 面板服务端、根入口、v2 管理面、快照都没有读它 ⇒ 报告写出来了，用户一个字节也看不到。
// 本模块把 <toolkitRoot>/.toolkit-governance/<插件目录>/latest.json 归一成一份**面向用户
// 的只读摘要**，供面板 HTTP 面（GET …/governance/reports）与两个渲染器消费。
//
// 三条硬口径：
//   ① 只读：本模块只 existsSync / readdirSync / readFileSync，**没有任何写调用**（测试静态钉）。
//   ② 不出本机绝对路径：报告正文含 toolkitRootResolved / reportRoot / target 等本机路径，
//      一律经 redactPaths() 归一成占位符后再下发（不把用户目录结构送到浏览器）。
//   ③ 不假装可用：目录不在场、某份报告坏掉，都如实申报（available:false / readable:false），
//      绝不抛错，也绝不把缺失写成「正常」。
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** 治理报告根目录名（相对 toolkitRoot）。与各治理插件的 REPORT_DIR_NAME 同值，此处是读侧常量。 */
export const GOVERNANCE_REPORT_DIR = ".toolkit-governance";

/** 目录名白名单：挡路径穿越与隐藏目录，只收正常插件目录形态。 */
const SAFE_DIR_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** 单份报告最多列出的问题条数（其余只报条数，不无界下发）。 */
export const MAX_ISSUE_LINES = 12;

/** 报告目录最多枚举的份数（防御性上限，正常仓内是个位数）。 */
const MAX_REPORTS = 64;

const LEVELS = ["error", "warn", "info"];

/**
 * 本机绝对路径归一：盘符形态（D:\x、D:/x）与 file:// URL 一律换成占位符。
 * 全角标点（U+FF00–FFEF）与 CJK 标点（U+3000–303F）算路径结束，避免把中文正文一起吃掉。
 */
const WIN_ABS_RE = /[A-Za-z]:[\\/][^\s"'<>|,;)\]}\u3000-\u303F\uFF00-\uFFEF]*/g;
const FILE_URL_RE = /file:\/\/[^\s"'<>|,;)\]}\u3000-\u303F\uFF00-\uFFEF]*/g;
export const PATH_PLACEHOLDER = "<本机路径>";

/** 把一段文本里的本机绝对路径换成占位符。非字符串一律按空串处理。 */
export function redactPaths(value) {
  const text = typeof value === "string" ? value : (value == null ? "" : String(value));
  return text.replace(FILE_URL_RE, PATH_PLACEHOLDER).replace(WIN_ABS_RE, PATH_PLACEHOLDER);
}

function emptyIssues() {
  return { total: 0, error: 0, warn: 0, info: 0 };
}

function readOneReport(root, plugin) {
  const entry = {
    plugin,
    present: false,
    readable: false,
    schema: "",
    generatedAt: "",
    issues: emptyIssues(),
    issueLines: [],
    note: "",
  };
  const file = join(root, plugin, "latest.json");
  if (!existsSync(file)) {
    entry.note = "latest.json 尚未生成";
    return entry;
  }
  entry.present = true;
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    entry.note = "latest.json 不可读";
    return entry;
  }
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch {
    entry.note = "latest.json 不是合法 JSON";
    return entry;
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    entry.note = "latest.json 顶层不是对象";
    return entry;
  }
  entry.readable = true;
  entry.schema = redactPaths(doc.schema);
  entry.generatedAt = typeof doc.generatedAt === "string" ? doc.generatedAt : "";

  const issues = Array.isArray(doc.issues) ? doc.issues : [];
  for (const item of issues) {
    const level = item && LEVELS.includes(item.level) ? item.level : "info";
    entry.issues[level] += 1;
    entry.issues.total += 1;
  }
  entry.issueLines = issues.slice(0, MAX_ISSUE_LINES).map((item) => {
    const level = item && LEVELS.includes(item.level) ? item.level : "info";
    // 治理插件的问题行有 message / detail 两种形态（清理用 detail），两种都收。
    const text = item && (item.message != null ? item.message : item.detail);
    return {
      level,
      code: redactPaths(item && item.code),
      message: redactPaths(text),
    };
  });
  if (issues.length > MAX_ISSUE_LINES) {
    entry.note = "另有 " + (issues.length - MAX_ISSUE_LINES) + " 条问题未列出";
  }
  return entry;
}

/**
 * 归一后的治理报告视图（纯函数：入参 toolkitRoot，出参可直接 JSON 化的对象）。
 * 恒不抛错——任何读取失败都退化成 available/readable 的如实申报。
 */
export function buildGovernanceReportView(toolkitRoot) {
  const view = {
    ok: true,
    reportDir: GOVERNANCE_REPORT_DIR + "/",
    available: false,
    pluginCount: 0,
    issueTotals: emptyIssues(),
    reports: [],
  };
  const root = join(toolkitRoot, GOVERNANCE_REPORT_DIR);
  if (!existsSync(root)) return view;

  let names = [];
  try {
    names = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return view;
  }
  names = names.filter((name) => SAFE_DIR_RE.test(name)).sort().slice(0, MAX_REPORTS);

  view.available = true;
  view.reports = names.map((name) => readOneReport(root, name));
  view.pluginCount = view.reports.length;
  for (const entry of view.reports) {
    for (const level of LEVELS) view.issueTotals[level] += entry.issues[level];
    view.issueTotals.total += entry.issues.total;
  }
  return view;
}
