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

const panelSrc = readFileSync(join(panelDir, "index.js"), "utf8");

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
  // P2.0② 后写路由（doctor dry-run）在服务缺席时不再接受 cookie 兜底，故此处期望 403；
  // 只读路由仍走 fallback，期望其正常状态码。方法不匹配的情况（GET→405）不适用于写路由。
  const expectGood = route.path === "/api/toolkit-panel/doctor/dry-run" ? 403 : allowed[1];
  check("gate " + (expectGood === 403 ? "blocks" : "allows") + " tunneled paired-cookie " + route.path,
    goodcookie === expectGood, "expected " + expectGood + " got " + goodcookie);
}

const doctorRoute = routes.find((r) => r.path === "/api/toolkit-panel/doctor/dry-run");
const csrf = await send(doctorRoute, "POST", { remote: "127.0.0.1", host: "127.0.0.1:3080", origin: "https://evil.example", site: "cross-site" });
check("CSRF blocks doctor cross-site POST", csrf === 403, "status " + csrf);

// ---------- P2.0② 写路由 guard 升级：配对必须走服务，写操作禁 fallback ----------
// 读路径：loopback AND (Host loopback OR 服务校验 OR devicesFile hasOwn 兜底)
// 写路径：loopback AND (Host loopback OR 服务校验)，**服务缺失一律拒绝，不看 cookie**
{
  // 每个场景独立 apply 一次，通过 ctx.get 注入不同形态的 remoteWebUiPairing
  function applyWith(pairingService) {
    const collected = [];
    const ctx = {
      effect(cb) { cb(); return () => {}; },
      webServer: { register(r) { collected.push(r); return () => {}; } },
      get(n) {
        if (n !== "remoteWebUiPairing") throw new Error("probe: unexpected service " + n);
        if (pairingService === undefined) throw new Error("probe: service absent");
        return pairingService;
      },
    };
    panelMod.apply(ctx, { toolkitRoot: root, doctorCli, devicesFile: fixtureFile });
    return collected;
  }
  const SNAP = "/api/toolkit-panel/snapshot";
  const DOC = "/api/toolkit-panel/doctor/dry-run";
  const NONLOOP = { remote: "127.0.0.1", host: TUNNEL_HOST, cookie: "dsh_pair=" + FIXTURE_DEVICE };
  const WRITE_HEADERS = { site: "same-origin", origin: "https://" + TUNNEL_HOST };

  // A. 服务在场且已配对 → 读放行、写放行
  const svcPaired = applyWith({ isPairedDevice: () => true });
  const aSnap = svcPaired.find((r) => r.path === SNAP);
  const aDoc = svcPaired.find((r) => r.path === DOC);
  check("P2.0② paired service: read allowed", (await send(aSnap, "GET", NONLOOP)) === 200);
  check("P2.0② paired service: write allowed",
    (await send(aDoc, "POST", Object.assign({}, NONLOOP, WRITE_HEADERS))) === 200);

  // B. 服务在场但未配对 → 读 403、写 403
  const svcUnpaired = applyWith({ isPairedDevice: () => false });
  const bSnap = svcUnpaired.find((r) => r.path === SNAP);
  const bDoc = svcUnpaired.find((r) => r.path === DOC);
  check("P2.0② unpaired service: read 403", (await send(bSnap, "GET", NONLOOP)) === 403);
  check("P2.0② unpaired service: write 403",
    (await send(bDoc, "POST", Object.assign({}, NONLOOP, WRITE_HEADERS))) === 403);

  // C. 服务缺席 + devicesFile 中**存在**该 key：
  //    读 → 允许 fallback（200）；写 → **必须 403**（禁 fallback，这是本阶段的核心断言）
  const svcAbsent = applyWith(undefined);
  const cSnap = svcAbsent.find((r) => r.path === SNAP);
  const cDoc = svcAbsent.find((r) => r.path === DOC);
  const cRead = await send(cSnap, "GET", NONLOOP);
  const cWrite = await send(cDoc, "POST", Object.assign({}, NONLOOP, WRITE_HEADERS));
  check("P2.0② service absent: read allowed via devicesFile fallback", cRead === 200, "status " + cRead);
  check("P2.0② service absent: write 403 (fallback disabled)", cWrite === 403, "status " + cWrite);

  // D. 写路由 CSRF：坏 origin / cross-site → 403；正确 origin → 非 403
  const dDoc = svcPaired.find((r) => r.path === DOC);
  check("P2.0② write CSRF: cross-site 403",
    (await send(dDoc, "POST", Object.assign({}, NONLOOP, { site: "cross-site", origin: "https://evil.example" }))) === 403);
  check("P2.0② write CSRF: bad origin 403",
    (await send(dDoc, "POST", Object.assign({}, NONLOOP, { site: "same-site", origin: "https://evil.example" }))) === 403);
  check("P2.0② write CSRF: good origin passes",
    (await send(dDoc, "POST", Object.assign({}, NONLOOP, WRITE_HEADERS))) !== 403);

  // E. 非 loopback socket 一律拒绝（读与写）
  check("P2.0② non-loopback socket: read 403",
    (await send(dDoc, "GET", { remote: "8.8.8.8" })) === 403);
  check("P2.0② non-loopback socket: write 403",
    (await send(dDoc, "POST", { remote: "8.8.8.8" })) === 403);

  // F. 源码契约：写路径必须调用严格版，且严格版函数体内不引用 devicesFile
  check("P2.0② source has pairedByServiceStrict", panelSrc.includes("function pairedByServiceStrict"));
  check("P2.0② write path uses strict pairing", /isAllowedWrite[\s\S]{0,200}pairedByServiceStrict/.test(panelSrc));
  {
    // 精确截取 pairedByServiceStrict 的函数体（花括号配对），断言体内无 devicesFile
    const start = panelSrc.indexOf("function pairedByServiceStrict");
    let body = "";
    if (start >= 0) {
      const open = panelSrc.indexOf("{", start);
      let depth = 0;
      for (let i = open; i < panelSrc.length; i++) {
        if (panelSrc[i] === "{") depth++;
        else if (panelSrc[i] === "}") { depth--; if (depth === 0) { body = panelSrc.slice(open, i + 1); break; } }
      }
    }
    check("P2.0② strict pairing body is device-file free",
      body.length > 0 && !body.includes("devicesFile"),
      body.length ? "body " + body.length + " chars" : "body not extracted");
  }
}

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
const snapshotSrc = readFileSync(join(panelDir, "manager", "snapshot.mjs"), "utf8");

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
// doctor dry-run 允许以「英文原名 + 中文注释」形态出现在标题里，但不允许作为按钮文案
check("no bare doctor dry-run button", !/>\s*doctor dry-run\s*</.test(clientSrc) && !/>\s*doctor dry-run\s*</.test(htmlSrc));
check("no P1 skeleton subtitle", !clientSrc.includes("P1 只读骨架") && !htmlSrc.includes("P1 只读骨架"));
check("refresh button humanized", clientSrc.includes("重新读取状态") && htmlSrc.includes("重新读取状态"));

// ③b 标识符「英文原名 + 中文注释」：标题恢复英文原名，中文降为副标题
const cnBlock = /var CN_NAMES = \{([\s\S]*?)\n\t\t\};/.exec(clientSrc);
check("has CN_NAMES map", !!cnBlock);
// 逐行取 "key": "值" —— 末行无逗号，故不依赖逗号。
const cnVals = cnBlock
  ? (cnBlock[1].match(/:\s*"([^"]+)"/g) || []).map((s) => s.replace(/^:\s*"/, "").replace(/"$/, ""))
  : [];
for (const label of ["记忆", "上下文压缩", "限流", "搜索路由", "本地网页搜索"]) {
  check("cn annotation " + label, cnVals.includes(label));
}
check("no DISPLAY_NAMES map anymore", !clientSrc.includes("DISPLAY_NAMES") && !htmlSrc.includes("DISPLAY_NAMES"));
check("has originalName helper", clientSrc.includes("function originalName") && htmlSrc.includes("function originalName"));
check("has annotated helper", clientSrc.includes("function annotated"));
// 卡片标题必须用英文原名（originalName），中文只作副标题
check("card title uses originalName", /esc\(originalName\(p\)\)/.test(htmlSrc) && /originalName\(plugin\)/.test(clientSrc));
check("cn name is subtitle not title", /styles\.subtitle/.test(clientSrc) && /class="subtitle"/.test(htmlSrc));
// 五个英文原名必须以标识形态出现
for (const en of ["agent-memory", "compact-router", "rate-throttle", "search-router", "web-search-local"]) {
  check("english original name " + en, clientSrc.includes(en) && htmlSrc.includes(en));
}
// 页面其它标识符位置同样「英文原名 + 中文注释」
check("tech labels annotated", clientSrc.includes("插件目录（dir）") && clientSrc.includes("managedBy（由谁挂载）") && clientSrc.includes("enabled（配置文件开关）"));
check("tech labels annotated in html", htmlSrc.includes("插件目录（dir）") && htmlSrc.includes("enabled（配置文件开关）"));
check("patch heading annotated", clientSrc.includes("cordis.patch.yml · 插件开关所在") && htmlSrc.includes("cordis.patch.yml · 插件开关所在"));
check("doctor heading annotated", clientSrc.includes("doctor dry-run · 只查不改") && htmlSrc.includes("doctor dry-run · 只查不改"));

// ④ 体检报告人话化
check("severity humanized", clientSrc.includes("必须修") && clientSrc.includes("建议修"));
check("healthy report humanized", clientSrc.includes("没有发现任何问题") && htmlSrc.includes("没有发现任何问题"));
check("no issue -> not shown as '0 issue'", !clientSrc.includes("0 issue") && !htmlSrc.includes("0 issue"));

// ⑤ 纯 client 层：服务端路由与 guard 未引入任何人话化文案
check("server routes untouched (no UI copy)", !/必须修|一键体检|运行中/.test(readFileSync(join(panelDir, "index.js"), "utf8")));

// ⑥ 缩进感知：服务端 parseRootRows() 必须按缩进收集 config，
// 避免嵌套同名键覆盖（P2.0 修复）。client 侧保留防御性回退。
check("server parser is indent-aware (P2.0)", snapshotSrc.includes("ownKeyIndent") && snapshotSrc.includes("configKeyIndent"));
check("server parser scopes config to direct children", snapshotSrc.includes("if (keyIndent !== ownKeyIndent) continue") || snapshotSrc.includes("keyIndent > ownKeyIndent"));
check("client keeps defensive fallback", clientSrc.includes("rowAnchorFromPatch") && htmlSrc.includes("rowAnchorFromPatch"));
{
  // 直接执行服务端 parseRootRows，用真实 patch 文本断言 rate-throttle 自身 enabled === false
  const parserProbe = join(tmpdir(), "toolkit-parser-probe-" + process.pid + ".mjs");
  writeFileSync(parserProbe, snapshotSrc.replace("function parseRootRows(", "export function parseRootRows("), "utf8");
  const probe = await import(pathToFileURL(parserProbe).href);
  const patchText = readFileSync(join(root, "cordis.patch.yml"), "utf8");
  const rows = probe.parseRootRows(patchText);

  const rt = rows.find((r) => r.id === "rate-throttle");
  check("rate-throttle row parsed", !!rt);
  check("rate-throttle own config.enabled === 'false' (nested true no longer wins)",
    rt && rt.config.enabled === "false", rt ? "config.enabled=" + JSON.stringify(rt.config.enabled) : "");
  check("nested routing keys not flattened", !(rt && Object.keys(rt.config).some((k) => k.includes("."))));
  check("rate-throttle config-layer enabled still true", rt && rt.enabled === true);

  const tm = rows.find((r) => r.id === "toolkit-manager");
  check("toolkit-manager path-like name survives", !!tm && String(tm.name).startsWith("file:"), tm ? tm.name : "");

  // 边界用例（内联，不依赖外部 fixture）
  const nested = ["- insert:", "    - id: e1", "      config:", "        enabled: false", "        routing:", "          enabled: true"].join("\n");
  const e1 = probe.parseRootRows(nested).find((r) => r.id === "e1");
  check("edge: nested same-name does not overwrite", e1 && e1.config.enabled === "false", e1 ? JSON.stringify(e1.config.enabled) : "");

  const sib = ["- insert:", "    - id: e2", "      config:", "        enabled: false", "- insert:", "    - id: e3", "      config:", "        enabled: true"].join("\n");
  const rows2 = probe.parseRootRows(sib);
  check("edge: sibling rows isolated (false)", rows2.find((r) => r.id === "e2").config.enabled === "false");
  check("edge: sibling rows isolated (true)", rows2.find((r) => r.id === "e3").config.enabled === "true");

  const dis = ["- id: e4", "  disabled: true", "  config:", "    enabled: true"].join("\n");
  const e4 = probe.parseRootRows(dis).find((r) => r.id === "e4");
  check("edge: row disabled:true still marks disabled", e4 && e4.enabled === false && e4.disabledExplicit === true);
  check("edge: empty input safe", probe.parseRootRows("").length === 0);
  check("edge: CRLF input parsed", (probe.parseRootRows("- id: e5\r\n  disabled: true\r\n")[0] || {}).enabled === false);

  try { unlinkSync(parserProbe); } catch {}
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
