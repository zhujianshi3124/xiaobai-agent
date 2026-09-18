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
check("routes count == 15 (P2.4 +7 卸载/恢复/挂载路由)", routes.length === 15, String(routes.length));
check("P2.1 plan route registered", routes.some((r) => r.path === "/api/toolkit-panel/plan"));
check("P2.1 execute route registered", routes.some((r) => r.path === "/api/toolkit-panel/execute"));
check("P2.1 plan/status route registered", routes.some((r) => r.path === "/api/toolkit-panel/plan/status"));
check("P2.2 toggle plan route registered", routes.some((r) => r.path === "/api/toolkit-panel/toggle/plan"));

const expectedWhenAllowed = {
  "/api/toolkit-panel/ui": ["GET", 200],
  "/api/toolkit-panel/snapshot": ["GET", 200],
  "/api/toolkit-panel/doctor/dry-run": ["GET", 405],
  "/api/toolkit-panel/plan": ["GET", 405],
  "/api/toolkit-panel/execute": ["GET", 405],
  "/api/toolkit-panel/plan/status": ["GET", 404],
  "/api/toolkit-panel/toggle/plan": ["GET", 405],
  "/api/toolkit-panel/config/plan": ["GET", 405],
  "/api/toolkit-panel/uninstall/plan": ["GET", 405],
  "/api/toolkit-panel/uninstall/execute": ["GET", 405],
  "/api/toolkit-panel/custody": ["GET", 200],
  "/api/toolkit-panel/restore/plan": ["GET", 405],
  "/api/toolkit-panel/restore/execute": ["GET", 405],
  // 销毁式 v2（L-060）：挂载路由（重装后）
  "/api/toolkit-panel/mount/plan": ["GET", 405],
  "/api/toolkit-panel/mount/execute": ["GET", 405],
};

// 写路径（options.change === true）路由集合：tunneled 无服务一律 403。
const WRITE_ROUTES = new Set([
  "/api/toolkit-panel/doctor/dry-run",
  "/api/toolkit-panel/plan",
  "/api/toolkit-panel/execute",
  "/api/toolkit-panel/toggle/plan",
  "/api/toolkit-panel/config/plan",
  "/api/toolkit-panel/uninstall/plan",
  "/api/toolkit-panel/uninstall/execute",
  "/api/toolkit-panel/restore/plan",
  "/api/toolkit-panel/restore/execute",
  // 销毁式 v2（L-060）：挂载是写路由
  "/api/toolkit-panel/mount/plan",
  "/api/toolkit-panel/mount/execute",
]);

// 每个场景独立 apply 一次，通过 ctx.get 注入不同形态的 remoteWebUiPairing。
// 提到模块作用域，供 P2.0② 与 P2.1 两个测试块共用。
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

async function send(route, method, opts = {}) {
  let status = null;
  let body = null;
  const res = {
    writeHead(s) { status = s; },
    end(payload) { if (typeof payload === "string") { try { body = JSON.parse(payload); } catch { body = payload; } } },
  };
  const headers = { host: opts.host || "127.0.0.1:3080" };
  if (opts.origin !== undefined) headers.origin = opts.origin;
  if (opts.cookie !== undefined) headers.cookie = opts.cookie;
  if (opts.site !== undefined) headers["sec-fetch-site"] = opts.site;
  await route.handler(makeRequest(method, headers, opts.remote, opts.json), res);
  return status || 500;
}

/**
 * 构造一个最小可用的请求替身：支持 `on("data")` / `on("end")`，
 * 以便被测代码里的 readJsonBody 能正常收到请求体。
 */
function makeRequest(method, headers, remote, jsonBody) {
  const listeners = { data: [], end: [], error: [] };
  const request = {
    method,
    headers,
    socket: { remoteAddress: remote },
    on(event, cb) {
      if (listeners[event]) listeners[event].push(cb);
      return request;
    },
  };
  // 异步投递，模拟真实流：先 data 后 end
  queueMicrotask(() => {
    if (jsonBody !== undefined) {
      const chunk = Buffer.from(typeof jsonBody === "string" ? jsonBody : JSON.stringify(jsonBody), "utf8");
      for (const cb of listeners.data) cb(chunk);
    }
    for (const cb of listeners.end) cb();
  });
  return request;
}

/** 发一个"返回体可读"的请求，用于需要断言响应内容的场景。 */
async function sendCaptured(route, method, opts = {}) {
  let status = null;
  let body = null;
  const res = {
    writeHead(s) { status = s; },
    end(payload) { if (typeof payload === "string") { try { body = JSON.parse(payload); } catch { body = payload; } } },
  };
  const headers = { host: opts.host || "127.0.0.1:3080" };
  if (opts.origin !== undefined) headers.origin = opts.origin;
  if (opts.cookie !== undefined) headers.cookie = opts.cookie;
  if (opts.site !== undefined) headers["sec-fetch-site"] = opts.site;
  await route.handler(makeRequest(method, headers, opts.remote, opts.json), res);
  return { status: status || 500, body };
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
  // P2.0② 后写路由不再接受 cookie 兜底，故此处期望 403；只读路由仍走 fallback。
  const expectGood = WRITE_ROUTES.has(route.path) ? 403 : allowed[1];
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
  // applyWith / SNAP / DOC / NONLOOP / WRITE_HEADERS 均在模块作用域定义，此处直接使用。

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
  // P2.4 起 snapshot.mjs 引入兄弟模块（plugin-registry/custody），tmpdir 拷贝法会断链；
  // parseRootRows 已正式 export，直接 import 真实模块。
  const probe = snapMod;
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

// ---------- P2.1 两段式框架：路由层契约 ----------
// 说明：apply-engine 的**行为**由 scripts/p21-verify.mjs 深度验收（真实文件读写 +
// 真实备份产物 + SHA 冲突 409）。这里只断言路由层的接线与守卫语义，避免重复。
{
  const engineSrc = readFileSync(join(panelDir, "manager", "apply-engine.mjs"), "utf8");
  const PLAN = "/api/toolkit-panel/plan";
  const EXEC = "/api/toolkit-panel/execute";

  // 写路径守卫：服务缺席时 plan / execute 都必须 403（不因"只是生成方案"就放宽）
  const svcAbsent = applyWith(undefined);
  const aPlan = svcAbsent.find((r) => r.path === PLAN);
  const aExec = svcAbsent.find((r) => r.path === EXEC);
  check("P2.1 plan route is write-guarded (service absent → 403)",
    (await send(aPlan, "POST", Object.assign({}, NONLOOP, WRITE_HEADERS, { json: {} }))) === 403);
  check("P2.1 execute route is write-guarded (service absent → 403)",
    (await send(aExec, "POST", Object.assign({}, NONLOOP, WRITE_HEADERS, { json: {} }))) === 403);
  check("P2.1 plan/status route is read-only (service absent + fixture cookie → fallback allows)",
    (await send(svcAbsent.find((r) => r.path === "/api/toolkit-panel/plan/status"), "GET", NONLOOP)) === 404,
    "预期 404（方案不存在），说明未被写守卫拦下");

  // 配对放行时，plan 返回可用的方案对象（含 diff / expectedSha / expiresAt）
  const svcPaired = applyWith({ isPairedDevice: () => true });
  const okPlan = svcPaired.find((r) => r.path === PLAN);
  const planRes = await sendCaptured(okPlan, "POST", Object.assign({}, NONLOOP, WRITE_HEADERS, {
    json: { target: "patch", rowId: "rate-throttle", key: "disabled", value: "true" },
  }));
  const planBody = planRes.body;
  check("P2.1 plan returns ok", !!(planBody && planBody.ok), JSON.stringify(planBody && planBody.error));
  check("P2.1 plan carries diff preview", !!(planBody && planBody.plan && Array.isArray(planBody.plan.diff)), JSON.stringify(planBody));
  check("P2.1 plan carries expectedSha", !!(planBody && planBody.plan && /^[0-9a-f]{64}$/.test(planBody.plan.expectedSha || "")));
  check("P2.1 plan carries expiry", !!(planBody && planBody.plan && Date.parse(planBody.plan.expiresAt) > Date.now()));
  check("P2.1 plan resolves the anchor in the real patch file", !!(planBody && planBody.plan && planBody.plan.anchorLine > 0),
    "anchorLine=" + (planBody && planBody.plan && planBody.plan.anchorLine));
  check("P2.1 plan does NOT leak nextText to client", !(planBody && planBody.plan && "nextText" in planBody.plan));

  // execute 用不存在的 token → 404（而不是 500）
  const okExec = svcPaired.find((r) => r.path === EXEC);
  const execRes = await sendCaptured(okExec, "POST", Object.assign({}, NONLOOP, WRITE_HEADERS, {
    json: { token: "deadbeefdeadbeefdeadbeefdeadbeef" },
  }));
  check("P2.1 execute with unknown token → 404", execRes.status === 404, "status " + execRes.status);
  check("P2.1 execute 404 carries plan-not-found code", !!(execRes.body && execRes.body.code === "plan-not-found"), JSON.stringify(execRes.body));

  // 空 body / 缺字段 → 400 且为锚点类错误（不是崩溃）
  const badPlan = await sendCaptured(okPlan, "POST", Object.assign({}, NONLOOP, WRITE_HEADERS, { json: {} }));
  check("P2.1 plan with empty body → 400 anchor-invalid", badPlan.status === 400 && badPlan.body && badPlan.body.code === "anchor-invalid",
    JSON.stringify(badPlan.body));

  // CSRF 对新增写路由同样生效
  check("P2.1 CSRF blocks cross-site plan POST",
    (await send(okPlan, "POST", { remote: "127.0.0.1", host: TUNNEL_HOST, site: "cross-site", origin: "https://evil.example", json: {} })) === 403);
  check("P2.1 CSRF blocks bad-origin execute POST",
    (await send(okExec, "POST", { remote: "127.0.0.1", host: TUNNEL_HOST, site: "same-site", origin: "https://evil.example", json: {} })) === 403);

  // 引擎源码契约（安全模型硬要求）
  check("P2.1 engine implements SHA conflict detection", engineSrc.includes("sha-conflict"));
  check("P2.1 engine re-reads the file before write (no cached text reuse)",
    /executePlan[\s\S]{0,1200}readFileSync\(plan\.file/.test(engineSrc));
  check("P2.1 engine backs up before writing",
    /backupDir = createBackup/.test(engineSrc) &&
    engineSrc.indexOf("createBackup") < engineSrc.indexOf("writeFileSync(plan.file"));
  check("P2.1 engine enforces unique anchor", engineSrc.includes("anchor-ambiguous") && engineSrc.includes("anchor-missing"));
  check("P2.1 engine has a retention policy", engineSrc.includes("pruneBackups") && engineSrc.includes("BACKUP_KEEP_COUNT"));
  check("P2.1 backup.mjs records a reason on the manifest", readFileSync(join(panelDir, "manager", "backup.mjs"), "utf8").includes("reason"));
}

// ---------- P2.2 启停开关：路由层契约 ----------
// 行为由 scripts/p22-verify.mjs 深度验收（真实文件 + 真实备份 + CRLF 兼容）。
{
  const engineSrc = readFileSync(join(panelDir, "manager", "apply-engine.mjs"), "utf8");
  const clientSrc2 = readFileSync(join(panelDir, "client", "index.js"), "utf8");
  const htmlSrc2 = readFileSync(join(panelDir, "client", "panel.html"), "utf8");
  const TGL = "/api/toolkit-panel/toggle/plan";
  const EXEC2 = "/api/toolkit-panel/execute";

  // 写守卫：服务缺席时 toggle/plan 必须 403（它签发写令牌）
  const svcAbsent2 = applyWith(undefined);
  const tglAbsent = svcAbsent2.find((r) => r.path === TGL);
  check("P2.2 toggle route is write-guarded (service absent → 403)",
    (await send(tglAbsent, "POST", Object.assign({}, NONLOOP, WRITE_HEADERS, { json: { rowId: "rate-throttle", enabled: false } }))) === 403);

  // CSRF 同样生效
  const svcPaired2 = applyWith({ isPairedDevice: () => true });
  const tglOk = svcPaired2.find((r) => r.path === TGL);
  check("P2.2 CSRF blocks cross-site toggle POST",
    (await send(tglOk, "POST", { remote: "127.0.0.1", host: TUNNEL_HOST, site: "cross-site", origin: "https://evil.example", json: {} })) === 403);
  check("P2.2 CSRF blocks bad-origin toggle POST",
    (await send(tglOk, "POST", { remote: "127.0.0.1", host: TUNNEL_HOST, site: "same-site", origin: "https://evil.example", json: {} })) === 403);

  // 非法值：enabled 非布尔 → 400 value-invalid（不信任前端）
  const badValue = await sendCaptured(tglOk, "POST", Object.assign({}, NONLOOP, WRITE_HEADERS, {
    json: { rowId: "rate-throttle", enabled: "yes" },
  }));
  check("P2.2 non-boolean enabled → 400 value-invalid",
    badValue.status === 400 && badValue.body && badValue.body.code === "value-invalid", JSON.stringify(badValue.body));

  // 未知 rowId → 400 anchor-missing
  const badRow = await sendCaptured(tglOk, "POST", Object.assign({}, NONLOOP, WRITE_HEADERS, {
    json: { rowId: "no-such-row", enabled: false },
  }));
  check("P2.2 unknown rowId → 400 anchor-missing",
    badRow.status === 400 && badRow.body && badRow.body.code === "anchor-missing", JSON.stringify(badRow.body));

  // 正常 plan：返回 token / layer / diff / crossRefs / 有效期，且不含 nextText
  const okToggle = await sendCaptured(tglOk, "POST", Object.assign({}, NONLOOP, WRITE_HEADERS, {
    json: { rowId: "rate-throttle", enabled: false },
  }));
  const tp = okToggle.body && okToggle.body.plan;
  check("P2.2 toggle plan returns ok", !!(okToggle.body && okToggle.body.ok), JSON.stringify(okToggle.body && okToggle.body.error));
  check("P2.2 toggle plan declares layer = patch-row.disabled", !!(tp && tp.layer === "patch-row.disabled"), tp && tp.layer);
  check("P2.2 toggle plan carries diff preview", !!(tp && Array.isArray(tp.diff) && tp.diff.length > 0));
  check("P2.2 toggle plan carries crossRefs array", !!(tp && Array.isArray(tp.crossRefs)));
  check("P2.2 toggle plan carries expiry", !!(tp && Date.parse(tp.expiresAt) > Date.now()));
  check("P2.2 toggle plan resolves the anchor", !!(tp && tp.anchorLine > 0), "anchorLine=" + (tp && tp.anchorLine));
  check("P2.2 toggle plan does NOT leak nextText", !(tp && "nextText" in tp));

  // 交叉引用的**真实正例**：构造一份含引用的临时 patch，确认服务端能报出来
  // （走引擎层直接调用，避免改动真实文件）
  const eng2 = await import(pathToFileURL(join(panelDir, "manager", "apply-engine.mjs")).href);
  const refText = readFileSync(join(root, "cordis.patch.yml"), "utf8").replace(
    /(\r?\n)(- insert:\r?\n    - id: web-search-local)/,
    "$1- id: other-row$1  config:$1    uses: rate-throttle$1$1$2",
  );
  const refHits = eng2.findCrossReferences(refText, { rowId: "rate-throttle" });
  check("P2.2 cross-reference detection has a real positive case", refHits.length >= 1, JSON.stringify(refHits));

  // 引擎源码契约
  check("P2.2 engine exports createTogglePlan", engineSrc.includes("export function createTogglePlan"));
  check("P2.2 engine exports findCrossReferences", engineSrc.includes("export function findCrossReferences"));
  check("P2.2 toggle reuses the two-phase plan/execute path (no direct writeFileSync)",
    !/export function createTogglePlan[\s\S]{0,2000}writeFileSync/.test(engineSrc));
  check("P2.2 toggle refuses non-boolean enabled", engineSrc.includes("启停值必须是布尔"));
  // 锚点唯一由既有 locateRowAnchor 保证
  check("P2.2 toggle relies on unique-anchor enforcement",
    engineSrc.includes("anchor-missing") && engineSrc.includes("anchor-ambiguous"));

  // 双层分立：两个渲染器都不得把两层合并成一个值
  check("P2.2 client renders layer 1 as patch-row.disabled", clientSrc2.includes("patch-row.disabled"));
  check("P2.2 client renders layer 2 as config.enabled", clientSrc2.includes("config.enabled"));
  check("P2.2 fallback page renders both layers too",
    htmlSrc2.includes("patch-row.disabled") && htmlSrc2.includes("config.enabled"));
  check("P2.2 client shows a confirm step before writing", clientSrc2.includes("confirmBox") && clientSrc2.includes("确认写入"));
  check("P2.2 fallback page shows a confirm step before writing", htmlSrc2.includes("confirmBox") && htmlSrc2.includes("确认写入"));
  check("P2.2 client surfaces cross-reference warnings", clientSrc2.includes("有其它配置引用这个插件"));
  check("P2.2 fallback page surfaces cross-reference warnings", htmlSrc2.includes("有其它配置引用这个插件"));

  // ---- P2.2b 确认页人话（生效时机 + disabled 解释）----
  check("P2.2b client states WHEN the change takes effect (disable direction)",
    clientSrc2.includes("执行后此插件将于下次重启时停用（当前仍运行）。"));
  check("P2.2b fallback page states WHEN the change takes effect (disable direction)",
    htmlSrc2.includes("执行后此插件将于下次重启时停用（当前仍运行）。"));
  check("P2.2b client states the enable direction too",
    clientSrc2.includes("执行后此插件将于下次重启时启用"));
  check("P2.2b fallback page states the enable direction too",
    htmlSrc2.includes("执行后此插件将于下次重启时启用"));
  check("P2.2b client explains what disabled: true means",
    clientSrc2.includes("下次启动时跳过加载") && clientSrc2.includes("要重启才会生效"));
  check("P2.2b fallback page explains what disabled: true means",
    htmlSrc2.includes("下次启动时跳过加载") && htmlSrc2.includes("要重启才会生效"));

  // ---- P2.2b Q1：条件开关（!!js）不解释、不改写 ----
  const panelSrc2 = readFileSync(join(panelDir, "index.js"), "utf8");
  const snapshotSrc2 = readFileSync(join(panelDir, "manager", "snapshot.mjs"), "utf8");
  check("P2.2b engine exports readRowDisabledLiteral", engineSrc.includes("export function readRowDisabledLiteral"));
  check("P2.2b engine refuses to clobber a non-literal disabled",
    engineSrc.includes("value-not-literal") && engineSrc.includes("面板不解释平台条件表达式"));
  check("P2.2b server maps value-not-literal → 400", /"value-not-literal":\s*400/.test(panelSrc2));
  check("P2.2b snapshot surfaces a conditional disabled instead of guessing a boolean",
    snapshotSrc2.includes("disabledExpr"));
  check("P2.2b client says the conditional switch is not interpreted",
    clientSrc2.includes("条件开关（面板不解释）"));
  check("P2.2b fallback page says the conditional switch is not interpreted",
    htmlSrc2.includes("条件开关（面板不解释）"));
  check("P2.2b client tells the user to edit a conditional row by hand",
    clientSrc2.includes("请手工编辑"));
  check("P2.2b fallback page tells the user to edit a conditional row by hand",
    htmlSrc2.includes("请手工编辑"));

  // ---- P2.2b 全卡覆盖：4 张可 toggle 卡的锚点行号与真实文件对账 ----
  // （agent-memory 的 74 行是用户实际点击时看到的行号，必须逐字对上）
  const patchLines = readFileSync(join(root, "cordis.patch.yml"), "utf8").split(/\r?\n/);
  const CARD_LINES = [["rate-throttle", 14], ["web-search-local", 58], ["web-search-router", 64], ["agent-memory-runtime", 74]];
  for (const [id, line] of CARD_LINES) {
    const found = patchLines.findIndex((l) => new RegExp("^\\s*- id:\\s*" + id + "\\s*$").test(l));
    check("P2.2b anchor line reconciled for " + id, found + 1 === line, "line " + (found + 1) + " (expected " + line + ")");
  }
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
