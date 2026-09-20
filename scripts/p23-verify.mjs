#!/usr/bin/env node
/**
 * p23-verify.mjs — P2.3 配置编辑验证套件（判定侧第 19 轮批准后的施工验证）。
 *
 * 铁律：**测试一律走副本** —— 真实 `cordis.patch.yml` 全程只读（仅用于取当前值），
 * 所有 plan/execute 落盘都发生在 os.tmpdir 的临时副本上。
 *
 * 覆盖（设计稿 p23-design.md §六测试计划）：
 *   ① 白名单合法性：18 字段合法值放行 + 越界 / 错类型 / 非整数 / 注入串拒绝；
 *   ② 假写拒绝路径：白名单外字段（logPath / staticGroups / excludeProviders / mode / routing.foo）；
 *   ③ 遮蔽与生效值：search-router mode 来源三分支（env > 热 JSON > patch）+ 各卡 configPanel 口径；
 *   ④ 引擎：config 子树定位 / 原地替换 / 插入回退 / CRLF 保持 / 锚点歧义拒绝；
 *   ⑤ 端到端：plan → execute（副本）+ 写前备份 manifest（reason/note 传真值）+ sha 链；
 *   ⑥ 跨字段校验：maxIntervalMs ≥ 当前 minIntervalMs（读真实 patch 现值，只读）；
 *   ⑦ UI 两渲染器：新增区块存在 + 既有断言字符串（P2.3 配置编辑 / 本面板只负责第一层）未被破坏。
 *
 * 输出：stdout 计数；退出码 = 全绿 0，否则 1。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const realPatch = join(root, "cordis.patch.yml");
const realText = readFileSync(realPatch, "utf8");

let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else { fail++; failures.push(name + (detail ? " :: " + detail : "")); console.log("  FAIL  " + name + (detail ? "  :: " + detail : "")); }
}
function section(title) { console.log("\n=== " + title + " ==="); }

const wl = await import("../panel/manager/config-whitelist.mjs");
const engine = await import("../panel/manager/apply-engine.mjs");
const snap = await import("../panel/manager/snapshot.mjs");

// ---------- ① 白名单合法性 ----------
section("① 白名单合法性（合法值放行）");
const okCases = [
  ["enabled", true, true], ["enabled", "false", false],
  ["minIntervalMs", 0, 0], ["minIntervalMs", 3600000, 3600000], ["minIntervalMs", "3000", 3000],
  ["maxRequestsPerMinute", 1, 1], ["maxRequestsPerMinute", 600, 600],
  ["maxIntervalMs", 86400000, 86400000],
  ["backoffFactor", 1, 1], ["backoffFactor", 10, 10], ["backoffFactor", 2.5, 2.5],
  ["adaptive", false, false],
  ["routing.enabled", true, true],
  ["routing.autoGroups", "false", false],
  ["routing.autoGroupTtlMs", 300000, 300000],
  ["routing.cooldownMs", 1, 1],
  ["routing.tpmTurnSkip", false, false],
  ["routing.tpmCooldownMs", 0, 0],
  ["routing.downgradeContextMargin", 0.5, 0.5],
  ["routing.maxDowngradeCompactsPerTurn", 0, 0],
  ["routing.metricsWindowMs", 600000, 600000],
  ["routing.metricsLogIntervalMs", 60000, 60000],
  ["routing.clearCooldownOnUserSwitch", true, true],
  ["routing.syncSelectionOnFailover", false, false],
];
for (const [p, v, expect] of okCases) {
  const r = wl.validateConfigValue(p, v);
  check("合法放行 " + p + " = " + JSON.stringify(v), r.ok === true && r.value === expect, r.ok ? "" : r.error);
}

section("①b 白名单拒绝（越界 / 错类型 / 非整数 / 注入串）");
const badCases = [
  ["minIntervalMs", -1], ["minIntervalMs", 3600001], ["minIntervalMs", 1.5], ["minIntervalMs", "abc"],
  ["maxRequestsPerMinute", 0], ["maxRequestsPerMinute", 601],
  ["maxIntervalMs", 0], ["maxIntervalMs", 86400001],
  ["backoffFactor", 0.5], ["backoffFactor", 11], ["backoffFactor", 0],
  ["adaptive", "yes"],
  ["routing.tpmCooldownMs", -1],
  ["routing.downgradeContextMargin", 0.05], ["routing.downgradeContextMargin", 1.5],
  ["routing.maxDowngradeCompactsPerTurn", 11], ["routing.maxDowngradeCompactsPerTurn", -1],
  ["enabled", "true\nrm -rf"], ["minIntervalMs", "1;rm"], ["enabled", "!!js process.exit()"],
  ["minIntervalMs", "{}"], ["backoffFactor", "[a]"], ["enabled", "true #comment"],
];
for (const [p, v] of badCases) {
  const r = wl.validateConfigValue(p, v);
  check("拒绝 " + p + " = " + JSON.stringify(v), r.ok === false, r.ok ? "被放行！" : "");
}

// ---------- ② 假写拒绝路径 ----------
section("② 假写拒绝（白名单外字段）");
const notAllowed = ["logPath", "logProviders", "throttleProviders", "staticGroups", "excludeProviders", "mode", "routing.foo", "routing.staticGroups", "dataRoot", "defaultWorkspace"];
for (const p of notAllowed) {
  const r = wl.validateConfigValue(p, p.startsWith("routing") || p === "mode" ? "auto" : "/tmp/x");
  check("白名单外拒绝 " + p, r.ok === false, r.ok ? "被放行！" : "");
}
check("服务端可写行锁 = rate-throttle", wl.CONFIG_EDITABLE_ROW === "rate-throttle");
check("白名单字段总数 = 18", Object.keys(wl.CONFIG_WHITELIST).length === 18, String(Object.keys(wl.CONFIG_WHITELIST).length));

// ---------- ⑥ 跨字段校验（读真实 patch 现值，只读） ----------
section("⑥ 跨字段校验 maxIntervalMs ≥ minIntervalMs");
const scalars = snap.parseConfigScalars(realText, "rate-throttle");
const curMin = Number(scalars.top.minIntervalMs);
check("当前 patch minIntervalMs 可解析（现值 " + curMin + "）", Number.isFinite(curMin));
check("拒绝倒置：maxIntervalMs = " + (curMin - 1) + " < minIntervalMs " + curMin, wl.checkCrossField(curMin - 1, curMin).ok === false);
check("放行：maxIntervalMs = 86400000 ≥ " + curMin, wl.checkCrossField(86400000, curMin).ok === true);
check("放行：maxIntervalMs = minIntervalMs（等值合法）", wl.checkCrossField(curMin, curMin).ok === true);

// ---------- ④ 引擎：config 子树定位 / 替换 / 插入 / CRLF ----------
section("④ 引擎：planConfigEdit（副本上计算）");
const tmp = mkdtempSync(join(tmpdir(), "p23-verify-"));
const copyPath = join(tmp, "cordis.patch.yml");
writeFileSync(copyPath, realText, "utf8");
const copyText = readFileSync(copyPath, "utf8");
check("副本与真实文件逐字节一致", engine.sha256Of(copyText) === engine.sha256Of(realText));

const r1 = engine.planConfigEdit(copyText, { rowId: "rate-throttle", path: "minIntervalMs", value: 2500 });
check("原地替换：changed = true", r1.changed === true);
check("替换行正确（minIntervalMs: 2500）", r1.nextText.includes("minIntervalMs: 2500"));
check("替换前后行成对（diff）", r1.before !== null && r1.after !== null && r1.before !== r1.after);
check("CRLF 保持", /\r\n/.test(r1.nextText) && !/(?<!\r)\n/.test(r1.nextText.replace(/\r\n/g, "")));
check("目标行号落在 rate-throttle 块内", r1.targetLine > 10 && r1.targetLine < 60, String(r1.targetLine));

const r2 = engine.planConfigEdit(copyText, { rowId: "rate-throttle", path: "routing.cooldownMs", value: 250000 });
check("routing 子键原地替换", r2.changed === true && r2.nextText.includes("cooldownMs: 250000"));
check("routing 目标行在 config 块内（行号大于顶层 config 行）", r2.targetLine > r1.targetLine, r2.targetLine + " vs " + r1.targetLine);

const noChange = engine.planConfigEdit(copyText, { rowId: "rate-throttle", path: "minIntervalMs", value: 3000 });
check("同值 = changed false（无谓写盘被挡）", noChange.changed === false);

// 插入回退：从副本删掉 cooldownMs 行再 plan
const linesNoCooldown = copyText.split(/\r\n/).filter((l) => !/^\s*cooldownMs:/.test(l)).join("\r\n");
const insPath = join(tmp, "insert-case.patch.yml");
writeFileSync(insPath, linesNoCooldown, "utf8");
const r3 = engine.planConfigEdit(linesNoCooldown, { rowId: "rate-throttle", path: "routing.cooldownMs", value: 250000 });
check("键缺失 → 插入（before = null）", r3.changed === true && r3.before === null);
check("插入位置 = routing: 行正下方", /^\s*cooldownMs: 250000$/.test((r3.nextText.split(/\r?\n/)[r3.targetLine - 1] || "")));
check("插入后 routing 子树仍含 tpmTurnSkip（结构未破坏）", /tpmTurnSkip:/.test(r3.nextText));

// 锚点歧义拒绝
const dupText = copyText + "\r\n- insert:\r\n    - id: rate-throttle\r\n";
let dupCaught = false;
try { engine.locateConfigKeyLine(dupText, "rate-throttle", "enabled"); } catch (e) { dupCaught = e.code === "anchor-ambiguous"; }
check("锚点歧义 → anchor-ambiguous 拒绝", dupCaught);
let pathCaught = false;
try { engine.locateConfigKeyLine(copyText, "rate-throttle", "a.b.c"); } catch (e) { pathCaught = e.code === "path-invalid"; }
check("三层路径 → path-invalid 拒绝", pathCaught);

// ---------- ⑤ 端到端：plan → execute（副本）+ 备份 ----------
section("⑤ 端到端 plan → execute（全部发生在副本上）");
const backupRoot = join(tmp, "backups");
mkdirSync(backupRoot, { recursive: true });
const plan = engine.createConfigPlan({
  file: copyPath, rowId: "rate-throttle", path: "minIntervalMs", value: 2500,
  backupRoot, reason: "panel-config-edit", note: "rate-throttle.minIntervalMs = 2500（P2.3 配置编辑）",
});
check("plan.kind = config-edit", plan.kind === "config-edit");
check("plan.reason / note 传真值", plan.reason === "panel-config-edit" && plan.note.includes("P2.3 配置编辑"));
check("plan.expectedSha = 当前副本 sha", plan.expectedSha === engine.sha256Of(copyText));
engine.putPlan(plan);
const result = engine.executePlan(plan.token);
check("execute ok", result.ok === true);
check("写入后 sha = plan.nextSha", result.shaAfter === plan.nextSha);
check("副本确被写入（不再是原值）", readFileSync(copyPath, "utf8").includes("minIntervalMs: 2500"));
check("真实 cordis.patch.yml 未被触碰", engine.sha256Of(readFileSync(realPatch, "utf8")) === engine.sha256Of(realText));
const backupDirs = readdirSync(backupRoot);
check("写前备份存在", backupDirs.length === 1, backupDirs.join(","));
const manifest = JSON.parse(readFileSync(join(backupRoot, backupDirs[0], "manifest.json"), "utf8"));
check("备份 manifest reason/note 传真值", manifest.reason === "panel-config-edit" && String(manifest.note || "").includes("P2.3 配置编辑"));
let backupPayloadOk = false;
try {
  const files = readdirSync(join(backupRoot, backupDirs[0])).filter((f) => f.endsWith(".yml"));
  backupPayloadOk = files.length >= 1 && readFileSync(join(backupRoot, backupDirs[0], files[0]), "utf8").includes("minIntervalMs: 3000");
} catch { /* noop */ }
check("备份载荷是写前内容（minIntervalMs: 3000）", backupPayloadOk);
let expiredHandled = false;
try {
  const p2 = engine.createConfigPlan({ file: copyPath, rowId: "rate-throttle", path: "minIntervalMs", value: 2600, backupRoot });
  engine.putPlan(p2);
  engine.executePlan(p2.token, { now: Date.now() + 10 * 60 * 1000 });
} catch (e) { expiredHandled = e.code === "plan-expired"; }
check("过期 plan → plan-expired 拒绝", expiredHandled);

// ---------- ③ 遮蔽与生效值（search-router mode 三分支 + 各卡口径） ----------
section("③ 遮蔽与生效值（snapshot）");
const hotOk = join(tmp, "hot-router.json");
writeFileSync(hotOk, JSON.stringify({ mode: "auto" }), "utf8");
const s1 = await snap.buildSnapshot({ toolkitRoot: root, hotRouterPath: hotOk, envMode: undefined });
const sr1 = s1.plugins.find((p) => p.dir === "search-router");
check("热 JSON 有 mode → 生效值 auto / 来源热 JSON", sr1.configPanel.mode.value === "auto" && sr1.configPanel.mode.source.includes("热 JSON"));
const s2 = await snap.buildSnapshot({ toolkitRoot: root, hotRouterPath: hotOk, envMode: "official" });
const sr2 = s2.plugins.find((p) => p.dir === "search-router");
check("env 覆盖热 JSON → 生效值 official / 来源 env", sr2.configPanel.mode.value === "official" && sr2.configPanel.mode.source.includes("环境变量"));
const hotNoMode = join(tmp, "hot-nomode.json");
writeFileSync(hotNoMode, JSON.stringify({}), "utf8");
const s3 = await snap.buildSnapshot({ toolkitRoot: root, hotRouterPath: hotNoMode, envMode: undefined });
const sr3 = s3.plugins.find((p) => p.dir === "search-router");
check("热 JSON 无 mode 且无 env → 走 patch", sr3.configPanel.mode.value === null && sr3.configPanel.mode.source.includes("patch"));
const rt = s1.plugins.find((p) => p.dir === "rate-throttle");
check("rate-throttle configPanel.editable = true", rt.configPanel.editable === true);
check("rate-throttle 当前值含 enabled=false / routing.enabled=true（与 patch 一致）",
  rt.configPanel.values.enabled === "false" && rt.configPanel.values.routing.enabled === "true");
check("rate-throttle effectNote 提示重启生效且无遮蔽", (rt.configPanel.effectNote || "").includes("重启"));
for (const d of ["agent-memory", "compact-router", "web-search-local"]) {
  const p = s1.plugins.find((x) => x.dir === d);
  check(d + " = 无内部开关 / 不可编辑", p.configPanel.editable === false && p.configPanel.noInternalSwitch === true);
}
check("search-router configPanel.editable = false（方案 1）", sr1.configPanel.editable === false);

// ---------- ⑦ UI 两渲染器 ----------
section("⑦ UI 两渲染器（新增区块 + 既有断言字符串未破坏）");
const reactSrc = readFileSync(join(root, "panel", "client", "index.js"), "utf8");
const htmlSrc = readFileSync(join(root, "panel", "client", "panel.html"), "utf8");
check("react 含「参数编辑」区块", reactSrc.includes("参数编辑"));
check("html 含「参数编辑」区块", htmlSrc.includes("参数编辑"));
// P7 路由前缀化：两个渲染器的基址集中在 PANEL_API（client 常量 / 兜底页装配期标记），
// 端点断言改为按 PANEL_API 派生形态匹配，语义不变（config/plan 调用必须在场）。
check("react 含 config/plan 调用", reactSrc.includes('PANEL_API + "/config/plan"'));
check("html 含 config/plan 调用", htmlSrc.includes('PANEL_API + "/config/plan"'));
check("react 含 search-router mode 只读展示", reactSrc.includes("SearchRouterModeRow"));
check("html 含 search-router mode 只读展示", htmlSrc.includes("modeHtml"));
check("既有断言字符串保留：P2.3 配置编辑（react/html）", reactSrc.includes("P2.3 配置编辑") && htmlSrc.includes("P2.3 配置编辑"));
check("既有断言字符串保留：本面板只负责第一层（react/html）", reactSrc.includes("本面板只负责第一层") && htmlSrc.includes("本面板只负责第一层"));
check("两渲染器确认页含「重启后生效」（config 编辑）", reactSrc.includes("重启后即按新值运行") && htmlSrc.includes("重启后即按新值运行"));

// ---------- 清理 ----------
rmSync(tmp, { recursive: true, force: true });

console.log("\n────────────────────────────────────────────────");
console.log("RESULT: " + pass + " PASS / " + fail + " FAIL");
if (fail > 0) for (const f of failures) console.log("  ✗ " + f);
console.log("────────────────────────────────────────────────");
process.exitCode = fail === 0 ? 0 : 1;
