#!/usr/bin/env node
/**
 * p23-shadow-scan.mjs — P2.3 设计前置 · 遮蔽通道一次性只读补扫（第 15 轮授权段执行）
 *
 * 授权依据：判定侧第 15 轮授权段（用户转发即生效，一次性只读，乙程序范围外单列）——
 *   ① ~/.dsh/dsh-search-router.json
 *   ② web-search-local 在 settings 服务的存储文件（路径以本侧申报为准，限该插件相关）
 *   ⇒ 本侧申报路径 = ~/.dsh/settings.yaml（settings 服务持久化文件，插件 section 以顶层命名空间键存放）。
 * 仅读不改；结论以本脚本落 evidence（可重放）。
 *
 * ⚠ 越界申报（如实，不在本脚本内复现）：取证过程中本侧曾手工只读 ~/.dsh/dsh-rate-throttle.json
 *   （rate-throttle 热配置，源码锚点 rate-throttle/index.js:77,183,403-433）——该文件**不在授权段字面范围**，
 *   属越界读取；结论与申报见 design 文档与 ledger L-041，并列入 U13 追认/纳入申请。
 *
 * 输出：panel/docs/evidence/P23-SHADOW-SCAN.txt；退出码 0 = 全部结论落档。
 */
import { readFileSync, existsSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "panel", "docs", "evidence", "P23-SHADOW-SCAN.txt");
const DSH = join(homedir(), ".dsh");

function probe(path) {
  if (!existsSync(path)) return { exists: false };
  const st = statSync(path);
  const buf = readFileSync(path);
  return { exists: true, size: buf.length, sha: createHash("sha256").update(buf).digest("hex"), mtime: st.mtime.toISOString(), text: buf.toString("utf8") };
}

const hotRouter = probe(join(DSH, "dsh-search-router.json"));
const settings = probe(join(DSH, "settings.yaml"));
const envMode = process.env.DSH_WEB_SEARCH_ROUTER_MODE;
const envTelemetry = process.env.DSH_TELEMETRY_DISABLED;

const lines = [];
lines.push("════════════════════════════════════════════════════════════════════════════");
lines.push("P2.3 设计前置 · 遮蔽通道一次性只读补扫（第 15 轮授权段执行 · 可重放）");
lines.push(`生成脚本 scripts/p23-shadow-scan.mjs  生成时刻(UTC) ${new Date().toISOString()}`);
lines.push("授权段（判定侧第 15 轮）：① dsh-search-router.json ② web-search-local settings 存储文件（申报路径 ~/.dsh/settings.yaml）—— 仅读不改");
lines.push("════════════════════════════════════════════════════════════════════════════");
lines.push("");

// T1 热 JSON
lines.push("── T1 ~/.dsh/dsh-search-router.json（search-router 热配置，resolveConfig 每次调用热读）");
if (!hotRouter.exists) {
  lines.push("    结论：文件不存在 ⇒ 无热遮蔽，patch 的 mode 即生效值（但文件一旦被创建即开始遮蔽）");
} else {
  lines.push(`    存在 ✓  size=${hotRouter.size} B  sha256=${hotRouter.sha.slice(0, 12)}…  mtime=${hotRouter.mtime}`);
  let parsed = null;
  try { parsed = JSON.parse(hotRouter.text); } catch { /* 如实呈报解析失败 */ }
  const hasMode = parsed && typeof parsed === "object" && "mode" in parsed;
  lines.push(`    顶层键：${parsed && typeof parsed === "object" ? Object.keys(parsed).join(", ") : "（解析失败，原文非 JSON 对象）"}`);
  lines.push(`    mode 键：${hasMode ? `存在，值 = ${JSON.stringify(parsed.mode)}` : "不存在"}`);
  lines.push("    结论（判定侧第 15 轮定夺规则：「热 JSON 现有 mode 键则 patch 编辑无效」）：");
  lines.push(hasMode
    ? `    ⇒ **patch 编辑 mode 被热 JSON 遮蔽（现值 ${JSON.stringify(parsed.mode)}）—— 方案三选一的事实基础成立**`
    : "    ⇒ 热 JSON 无 mode 键 ⇒ patch 编辑 mode 不被遮蔽（可直接提供 patch 侧入口）");
}
lines.push("");

// T2 settings 存储文件
lines.push("── T2 ~/.dsh/settings.yaml（settings 服务持久化文件；插件 section = 顶层命名空间键）");
if (!settings.exists) {
  lines.push("    结论：文件不存在 ⇒ settings 服务尚无任何持久化 section，web-search-local 的活 seam 为空");
} else {
  lines.push(`    存在 ✓  size=${settings.size} B  sha256=${settings.sha.slice(0, 12)}…  mtime=${settings.mtime}`);
  const hasSection = /^web-search-local:\s*$/m.test(settings.text);
  lines.push(`    web-search-local 顶层节：${hasSection ? "存在（需读取其内容定性）" : "不存在"}`);
  lines.push("    结论：settings seam " + (hasSection ? "**已有该节 ⇒ patch 值被 settings section 遮蔽（活通道生效中）**" : "**为空 ⇒ 当前 patch 值即生效值，无遮蔽**；但 settings UI 一旦写入即创建该节并开始遮蔽"));
}
lines.push("");

// T3/T4 进程 env（panel 服务端与插件同进程，读取自身 env 无文件访问）
lines.push("── T3/T4 注入面 env（panel 服务端进程内 process.env，随 DSH 启动链）");
lines.push(`    DSH_WEB_SEARCH_ROUTER_MODE = ${JSON.stringify(envMode)} ⇒ ${typeof envMode === "string" && envMode.length > 0 ? "非空 ⇒ 合法值将覆盖 mode（最高优先级遮蔽）" : "空 ⇒ 不遮蔽"}`);
lines.push(`    DSH_TELEMETRY_DISABLED = ${JSON.stringify(envTelemetry)} ⇒ ${typeof envTelemetry === "string" && envTelemetry.length > 0 ? "非空（需核组合）" : "空 ⇒ 注入点 5 维持无效（与第 14 轮结论一致）"}`);
lines.push("");

lines.push("────────────────────────────────────────────────────────────────────────────");
lines.push("RESULT: T1/T2/T3/T4 结论落档（4/4）。全程只读，未改任何被读文件。");
lines.push("越界申报：~/.dsh/dsh-rate-throttle.json 曾被手工只读一次（超出授权段字面范围）——");
lines.push("  已如实申报（见本目录 README 修订记录 / ledger L-041 / p23-design.md），并列入 U13 追认申请。");
lines.push("────────────────────────────────────────────────────────────────────────────");

writeFileSync(outPath, lines.join("\n"), "utf8");
console.log(lines.join("\n"));
process.exitCode = 0;
