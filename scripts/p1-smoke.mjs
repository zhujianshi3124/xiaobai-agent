#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { writeFileSync, unlinkSync, readFileSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const panelDir = join(root, "panel");
const defaultDoctorCli = "D:/dsh-test-sandbox/projects/doctor/src/cli.mjs";
const doctorCli = process.env.DOCTOR_CLI || defaultDoctorCli;
const baseUrl = process.env.PANEL_BASE_URL || "";
const TUNNEL_HOST = "95c04a90ca73e397.dsh-market.com";
const FIXTURE_DEVICE = "0123456789abcdef0123456789abcdef";
const fixtureFile = join(tmpdir(), "toolkit-panel-smoke-" + process.pid + "-" + Date.now() + ".json");
writeFileSync(fixtureFile, JSON.stringify({ [FIXTURE_DEVICE]: { createdAt: Date.now() - 60e3, lastSeenAt: Date.now() - 1e3 } }), "utf8");

let passed = 0;
let failed = 0;
function check(label, ok, detail) {
  if (ok) { passed += 1; console.log("PASS " + label + (detail ? " — " + detail : "")); }
  else { failed += 1; console.log("FAIL " + label + (detail ? " — " + detail : "")); }
}

const syntaxFiles = [
  join(panelDir, "index.js"),
  join(panelDir, "manager", "snapshot.mjs"),
  join(panelDir, "manager", "doctor-runner.mjs"),
  join(panelDir, "manager", "backup.mjs"),
];
for (const abs of syntaxFiles) {
  const r = spawnSync(process.execPath, ["--check", abs], { encoding: "utf8", windowsHide: true });
  check("syntax " + abs.slice(root.length + 1), r.status === 0, r.stderr.trim().slice(0, 200));
}

const routes = [];
const fakeCtx = {
  effect(cb) { cb(); return () => {}; },
  webServer: { register(route) { routes.push(route); return () => {}; } },
  get(name) { throw new Error("probe: no cordis service " + name); },
};
const panelMod = await import(pathToFileURL(join(panelDir, "index.js")).href);
panelMod.apply(fakeCtx, { toolkitRoot: root, doctorCli, devicesFile: fixtureFile });
check("routes count == 3", routes.length === 3, String(routes.length));

const expectedWhenAllowed = {
  "/api/toolkit-panel/ui": ["GET", 200],
  "/api/toolkit-panel/snapshot": ["GET", 200],
  "/api/toolkit-panel/doctor/dry-run": ["GET", 405],
};

async function send(route, method, opts = {}) {
  let status = null;
  const res = { writeHead(s) { status = s; }, end() {} };
  const headers = { host: opts.host || "127.0.0.1:3080" };
  if (opts.origin !== undefined) headers.origin = opts.origin;
  if (opts.cookie !== undefined) headers.cookie = opts.cookie;
  if (opts.site !== undefined) headers["sec-fetch-site"] = opts.site;
  await route.handler({ method, socket: { remoteAddress: opts.remote }, headers }, res);
  return status || 500;
}

for (const route of routes) {
  const allowed = expectedWhenAllowed[route.path];
  const blocked = await send(route, allowed[0], { remote: "10.0.0.9", host: TUNNEL_HOST, cookie: "dsh_pair=" + FIXTURE_DEVICE });
  check("gate blocked non-loopback " + route.path, blocked === 403, "status " + blocked);
  const desktop = await send(route, allowed[0], { remote: "127.0.0.1", host: "127.0.0.1:3080" });
  check("gate allows desktop loopback " + route.path, desktop === allowed[1], "expected " + allowed[1] + " got " + desktop);
  const nocookie = await send(route, allowed[0], { remote: "127.0.0.1", host: TUNNEL_HOST });
  check("gate blocks tunneled no-cookie " + route.path, nocookie === 403, "status " + nocookie);
  const badcookie = await send(route, allowed[0], { remote: "127.0.0.1", host: TUNNEL_HOST, cookie: "dsh_pair=ffffffffffffffffffffffffffffffff" });
  check("gate blocks tunneled bad-cookie " + route.path, badcookie === 403, "status " + badcookie);
  const goodcookie = await send(route, allowed[0], { remote: "127.0.0.1", host: TUNNEL_HOST, cookie: "dsh_pair=" + FIXTURE_DEVICE });
  check("gate allows tunneled paired-cookie " + route.path, goodcookie === allowed[1], "expected " + allowed[1] + " got " + goodcookie);
}

const doctorRoute = routes.find((r) => r.path === "/api/toolkit-panel/doctor/dry-run");
const csrf = await send(doctorRoute, "POST", { remote: "127.0.0.1", host: "127.0.0.1:3080", origin: "https://evil.example", site: "cross-site" });
check("CSRF blocks doctor cross-site POST", csrf === 403, "status " + csrf);

const snapMod = await import(pathToFileURL(join(panelDir, "manager", "snapshot.mjs")).href);
const snap = await snapMod.buildSnapshot({ toolkitRoot: root });
check("snapshot sees 5 business plugins", Array.isArray(snap.plugins) && snap.plugins.length === 5, "n=" + (snap.plugins && snap.plugins.length));
const wsl = snap.plugins.find((p) => p.dir === "web-search-local");
check("web-search-local marked derived/gausszhou", !!(wsl && wsl.origin === "derived" && wsl.upstream === "@gausszhou/dsh-web-search-local"));
check("self id is toolkit-manager", snap.self && snap.self.id === "toolkit-manager", snap.self && snap.self.id);
check("self panel patch-mounted", snap.self && snap.self.managedBy === "patch");

const docMod = await import(pathToFileURL(join(panelDir, "manager", "doctor-runner.mjs")).href);
const doctor = await docMod.runDoctorDryRun({ cliPath: doctorCli, scopeRoot: root });
check("doctor dry-run ok", doctor.ok && doctor.report, doctor.error || "exit " + doctor.exitCode);
if (doctor.report && doctor.report.summary) {
  check("doctor issue counts 0/0/0", doctor.report.summary.error === 0 && doctor.report.summary.warning === 0 && doctor.report.summary.info === 0,
    JSON.stringify(doctor.report.summary));
}

// ---------- P1.6 面板人话化 ----------
// 客户端是纯静态 bundle，跑不起来也无法 import；按源码文本断言其"人话化"契约。
// 验收标准：用户不读任何说明，就能说出每个插件是干嘛的、当前是否在工作。
const clientSrc = readFileSync(join(panelDir, "client", "index.js"), "utf8");
const htmlSrc = readFileSync(join(panelDir, "client", "panel.html"), "utf8");

// ① 每卡片一句中文功能描述：五个插件全覆盖
const descBlock = /var DESCRIPTIONS = \{([\s\S]*?)\n\t\t\};/.exec(clientSrc);
check("client has DESCRIPTIONS map", !!descBlock);
const descKeys = descBlock ? (descBlock[1].match(/"([a-z][a-z0-9-]*)":/g) || []).map((s) => s.replace(/[":]/g, "")) : [];
for (const dir of ["agent-memory", "compact-router", "rate-throttle", "search-router", "web-search-local"]) {
  check("desc covers " + dir, descKeys.includes(dir));
}
check("desc count == 5", descKeys.length === 5, String(descKeys.length));

// ① 状态三态人话
check("state running label", clientSrc.includes("运行中 · 正在生效"));
check("state loaded-but-off label", clientSrc.includes("已加载 · 功能开关关闭，暂不生效"));
check("state config-off label", clientSrc.includes("配置层停用 · 未加载"));

// ① 双层开关醒目提示
check("dual-switch notice present", clientSrc.includes("两层开关不一致"));
check("dual-switch layer wording", clientSrc.includes("第一层（配置文件）") && clientSrc.includes("第二层（插件内部）"));

// ② 技术详情折叠、默认收起
check("tech details uses <details>", clientSrc.includes('"details"') && clientSrc.includes("技术详情"));
check("tech details default collapsed", !/<details[^>]*\bopen\b/.test(clientSrc) && !/<details[^>]*\bopen\b/.test(htmlSrc));
check("tech details carries engineer fields", ["managedBy", "inject", "services", "commands"].every((k) => clientSrc.includes(k)));

// ③ 去工程黑话：标题与按钮
check("button renamed to 一键体检", clientSrc.includes("一键体检（只查不改）") && htmlSrc.includes("一键体检（只查不改）"));
check("no doctor dry-run jargon in UI", !clientSrc.includes("doctor dry-run") && !htmlSrc.includes("doctor dry-run"));
check("no P1 skeleton subtitle", !clientSrc.includes("P1 只读骨架") && !htmlSrc.includes("P1 只读骨架"));
check("refresh button humanized", clientSrc.includes("重新读取状态") && htmlSrc.includes("重新读取状态"));

// ③b 标题用中文功能名，不暴露目录名
const dispBlock = /var DISPLAY_NAMES = \{([\s\S]*?)\n\t\t\};/.exec(clientSrc);
check("has DISPLAY_NAMES map", !!dispBlock);
// 逐行取 "key": "值" —— 末行无逗号，故不依赖逗号。
const dispVals = dispBlock
  ? (dispBlock[1].match(/:\s*"([^"]+)"/g) || []).map((s) => s.replace(/^:\s*"/, "").replace(/"$/, ""))
  : [];
for (const label of ["记忆", "上下文压缩", "限流", "搜索路由", "本地网页搜索"]) {
  check("display name " + label, dispVals.includes(label));
}
check("card title uses DISPLAY_NAMES", /DISPLAY_NAMES\[plugin\.dir\]/.test(clientSrc) && /DISPLAY_NAMES\[p\.dir\]/.test(htmlSrc));

// ④ 体检报告人话化
check("severity humanized", clientSrc.includes("必须修") && clientSrc.includes("建议修"));
check("healthy report humanized", clientSrc.includes("没有发现任何问题") && htmlSrc.includes("没有发现任何问题"));
check("no issue -> not shown as '0 issue'", !clientSrc.includes("0 issue") && !htmlSrc.includes("0 issue"));

// ⑤ 纯 client 层：服务端路由与 guard 未引入任何人话化文案
check("server routes untouched (no UI copy)", !/必须修|一键体检|运行中/.test(readFileSync(join(panelDir, "index.js"), "utf8")));

// ⑥ 缩进感知：内部开关必须避开嵌套 enabled 的覆盖（服务端 parser 缺陷的 client 侧规避）
// 服务端 parseRootRows() 不区分缩进，rate-throttle 自身 enabled:false 会被嵌套 routing.enabled:true 覆盖。
// client 侧改为按缩进取键；这里用真实 patch 文本断言该路径存在且生效。
check("client parses own enabled by indent", clientSrc.includes("rowAnchorFromPatch") && clientSrc.includes("cfgIndent + 2"));
{
  // 用真实 patch 文本验证：rate-throttle 的"自身 enabled"应为 false（缩进 8），而非被覆盖的 true（缩进 10）
  const patchText = readFileSync(join(root, "cordis.patch.yml"), "utf8");
  const lines = patchText.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*- id:\s*rate-throttle\s*$/.test(lines[i])) { start = i; break; }
  }
  let cfgIndent = -1;
  for (let j = start + 1; j < lines.length && start >= 0; j++) {
    if (/^(\s*)- id:/.test(lines[j])) break;
    const c = /^(\s+)config:\s*$/.exec(lines[j]);
    if (c) { cfgIndent = c[1].length; break; }
  }
  let ownEnabled = null;
  for (let k = start + 1; k < lines.length && start >= 0; k++) {
    if (/^(\s*)- id:/.test(lines[k])) break;
    const kv = /^(\s+)enabled:\s*(\S+)\s*$/.exec(lines[k]);
    if (kv && kv[1].length === cfgIndent + 2) { ownEnabled = kv[2]; break; }
  }
  check("rate-throttle own enabled resolves to false (not the nested true)", ownEnabled === "false", String(ownEnabled));
}

if (baseUrl) {
  try {
    const res = await fetch(baseUrl + "/api/toolkit-panel/snapshot", { cache: "no-store" });
    const body = await res.json();
    check("live snapshot reachable", res.status === 200 && body.ok && body.snapshot, "HTTP " + res.status);
  } catch (e) {
    check("live snapshot reachable", false, String(e && e.message || e));
  }
} else {
  console.log("SKIP live snapshot (set PANEL_BASE_URL to test against a running DSH)");
}

unlinkSync(fixtureFile);
console.log("RESULT passed=" + passed + " failed=" + failed);
if (failed > 0) process.exit(1);
