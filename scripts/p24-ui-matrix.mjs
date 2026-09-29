#!/usr/bin/env node
// P2.4 施工批 1 UI 收尾 · **面板级完整矩阵**（p24-test-plan-batch1.md §3.2 A1–C3）
//
// 与 p24-verify 的分工：
//   - p24-verify  = 引擎级（直接调 manager/*.mjs）。
//   - 本文件      = **面板级**：把真实 panel/index.js 注册的**四条 API**（uninstall/plan+execute、
//                   custody、restore/plan+execute）在进程内跑通端到端（真 guard / 真 body 解析 /
//                   真 executePlan 唯一通道），再叠加**两套真实渲染器**的渲染断言。
//
// 纪律：全部落盘测试走 os.tmpdir 副本；真实 cordis.patch.yml 零写入（末尾断言基准 sha）。
// 预设桥用假脚本/假预设（不触碰真实 shipped presets / ~/.dsh）。
//
// 用法：node scripts/p24-ui-matrix.mjs

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const patchPath = join(root, "cordis.patch.yml");
// 基准滚存：ce0b0b81… →（H5 加引号修 360）→ bb7af96f… →（Pack I 删除 360/搜狗，引擎 8→6）→ e8051fe9… →（D-19 行级原生 inject:×3 落行块末尾，C1-007 用户拍板案一）→ a663f61b… →（EXE-BOOT-011 施工笔3，C1-007 施工令批准案 C：agent-memory 行加 inject: [systemPrompt]——agentMemory 变量接线）→ b0f304c9…。
// 与 scripts/p24-verify.mjs 同步；四次都是**数据**变更，守卫机制未放宽。成因全文与该文件内注释、
// panel/docs/evidence/H-REAL-HOST-REVERIFY.md、docs/debt.md A#24 / A#25 / 计划 §29。
const BASE_SHA_EXPECT = "b0f304c94818bf9aba106ea0fdd9a69ce52ac5b3e0de579a1e883ac8d58bd7f1";
const BASE_SHA = createHash("sha256").update(readFileSync(patchPath, "utf8")).digest("hex");
if (BASE_SHA !== BASE_SHA_EXPECT) {
  console.error("ABORT: 真实 cordis.patch.yml 基线漂移（" + BASE_SHA.slice(0, 12) + "）——拒绝在非基准态跑矩阵");
  process.exit(1);
}

const DOCTOR_CLI = "D:\\dsh-test-sandbox\\projects\\doctor\\src\\cli.mjs";
// 批 2 操作台文案常量（与两渲染器逐字一致；矩阵断言 = 环节在产品面，叠加 8.3 规则）
const CONSOLE_EMPTY_ROLLBACK = "还没有可以回滚的体检操作——体检操作台还没有改过任何东西。";
const CONSOLE_EMPTY_SNAPSHOT = "还没有可恢复的配置快照——面板每次改动配置前都会自动留一份，做过改动后这里就有了。";
const CONSOLE_EMPTY_RECEIPTS = "还没有删除收据——你还没有用面板做过真卸载。";
const CONSOLE_RECEIPT_NOTE = "收据只是删除的账单：里面只有被删文件的清单、校验值和你填写的原因，没有文件内容，不能用来恢复。";
const sha = (t) => createHash("sha256").update(t).digest("hex");
const shaFile = (p) => sha(readFileSync(p, "utf8"));

let pass = 0;
const fails = [];
function check(name, ok, detail = "") {
  if (ok) { pass++; }
  else { fails.push(name + " — " + detail); console.log("FAIL " + name + " — " + detail); }
}
function section(t) { console.log("\n── " + t + " ──"); }

/** 供失败诊断：返回两段文本首个不同行的上下文。 */
function firstDiff(label, aText, bText) {
  const a = String(aText).split(/\r?\n/);
  const b = String(bText).split(/\r?\n/);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return label + " 首处差异 @L" + (i + 1) + " 期望[" + JSON.stringify(a[i]) + "] 实际[" + JSON.stringify(b[i]) + "]";
  }
  return label + " 无行级差异（长度 " + a.length + " vs " + b.length + "）";
}

// ════════════════════════════════════════════════════════════
// 1. 副本构造（与 p24-verify 同构：插件树 + exports 桩 + peer 依赖桩）
// ════════════════════════════════════════════════════════════
const work = mkdtempSync(join(tmpdir(), "p24-ui-matrix-"));
const PLUGIN_DIRS = ["agent-memory", "compact-router", "rate-throttle", "search-router", "web-search-local"];

/**
 * 副本构造（与 p24-verify 同构：插件树 + exports 桩 + peer 依赖桩）。
 * `withPresetBridge` 默认 true：真实基线里 compact-router 由预设补丁挂载（preset-patched），
 * 夹具必须同构，否则副本里 compact-router 会落在 installed-unmounted，doctor 也不回 0/0/0。
 */
function makeCopy(name, { withPresetBridge = true } = {}) {
  const dir = join(work, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "cordis.patch.yml"), readFileSync(patchPath, "utf8"), "utf8");
  for (const f of ["doctor-signals.json", "dsh.plugin.json", "package.json"]) cpSync(join(root, f), join(dir, f));
  for (const p of PLUGIN_DIRS) {
    mkdirSync(join(dir, "lib", p), { recursive: true });
    cpSync(join(root, "lib", p, "dsh.plugin.json"), join(dir, "lib", p, "dsh.plugin.json"));
    writeFileSync(join(dir, "lib", p, "body.js"), "// body of " + p + "\n", "utf8");
    writeFileSync(join(dir, "lib", p, "extra.js"), "// extra of " + p + "\n", "utf8");
    const manifest = JSON.parse(readFileSync(join(dir, "lib", p, "dsh.plugin.json"), "utf8"));
    for (const target of Object.values((manifest.requirements || {}).exports || {})) {
      const stubAbs = join(dir, "lib", p, String(target).replace(/^\.\//, ""));
      if (!existsSync(stubAbs)) {
        mkdirSync(join(stubAbs, ".."), { recursive: true });
        writeFileSync(stubAbs, "// stub\n", "utf8");
      }
    }
  }
  const depVersions = {
    "@deepseek-ai/dsh-compaction-basic": "0.1.5-rc.2",
    "@deepseek-ai/dsh-web": "0.1.5-rc.2",
    "@deepseek-ai/schemastery": "3.18.1",
  };
  for (const [dep, ver] of Object.entries(depVersions)) {
    const pd = join(dir, "node_modules", ...dep.split("/"));
    mkdirSync(pd, { recursive: true });
    writeFileSync(join(pd, "package.json"), JSON.stringify({ name: dep, version: ver, main: "index.js" }));
    writeFileSync(join(pd, "index.js"), "// stub\n");
  }
  if (withPresetBridge) {
    // 假预设：original(.bak) / patched(.patched) 两态 + 假 apply-preset-patch.mjs
    const state = {};
    mkdirSync(join(dir, "presets"), { recursive: true });
    mkdirSync(join(dir, "preset-backups"), { recursive: true });
    for (const id of ["liangshen", "standard", "ptc", "cordis"]) {
      const f = join(dir, "presets", id + ".agent.cordis.yml");
      const bak = join(dir, "preset-backups", id + ".agent.cordis.yml.bak");
      const patched = f + ".patched";
      writeFileSync(f, "# original " + id + "\r\n", "utf8");
      writeFileSync(bak, "# original " + id + "\r\n", "utf8");
      writeFileSync(patched, "# original " + id + "\r\n- id: compact-router\r\n", "utf8");
      state[id] = { file: f, backup: bak, patchedSha: shaFile(patched), originalSha: shaFile(bak) };
    }
    mkdirSync(join(dir, "scripts"), { recursive: true });
    writeFileSync(join(dir, "scripts", "apply-preset-patch.mjs"), [
      "import { readFileSync, writeFileSync, existsSync } from 'node:fs';",
      "import { join, dirname } from 'node:path';",
      "import { fileURLToPath } from 'node:url';",
      "const root = dirname(dirname(fileURLToPath(import.meta.url)));",
      "const state = JSON.parse(readFileSync(join(root, 'preset-patch-state.json'), 'utf8'));",
      "const undo = process.argv.includes('--undo');",
      "for (const [id, e] of Object.entries(state)) {",
      "  const src = undo ? e.backup : e.file + '.patched';",
      "  if (!existsSync(src)) { console.log('REFUSED ' + id); continue; }",
      "  writeFileSync(e.file, readFileSync(src, 'utf8'), 'utf8');",
      "  console.log(id + ' ' + (undo ? 'undone' : 'patched'));",
      "}",
      "",
    ].join("\n"), "utf8");
    writeFileSync(join(dir, "preset-patch-state.json"), JSON.stringify(state, null, 2), "utf8");
    for (const id of Object.keys(state)) writeFileSync(join(dir, "presets", id + ".agent.cordis.yml"), readFileSync(join(dir, "presets", id + ".agent.cordis.yml.patched"), "utf8"), "utf8");
  }
  // 批 2（D2/D1）：doctor 域 config 根（面板经 CLI --config-root 指到副本，真实 ~/.dsh 零触碰）。
  // 结构同 engine 要求：configRoot 存在 + profiles/web 存在。
  mkdirSync(join(dir, "doctor-config", "profiles", "web"), { recursive: true });
  return dir;
}

function runDoctor(dir) {
  let out = "";
  try {
    out = execFileSync(process.execPath, [DOCTOR_CLI, "--json", "--scope", dir], { encoding: "utf8", timeout: 120000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) { out = (e && e.stdout) || ""; }
  return JSON.parse(out);
}

// ════════════════════════════════════════════════════════════
// 2. 进程内 HTTP harness —— 跑**真实** panel/index.js 注册的路由
// ════════════════════════════════════════════════════════════
const panelMod = await import(new URL("../panel/index.js", import.meta.url).href);

function makeRequest({ method, body, headers }) {
  const emitter = new EventEmitter();
  const req = {
    method,
    url: "/",
    headers: Object.assign({ host: "127.0.0.1:3080" }, headers || {}),
    socket: { remoteAddress: "127.0.0.1" },
    on: (ev, cb) => { emitter.on(ev, cb); return req; },
  };
  process.nextTick(() => {
    if (body !== undefined) emitter.emit("data", Buffer.from(Buffer.from(JSON.stringify(body)).toString("binary"), "binary"));
    emitter.emit("end");
  });
  return req;
}
function makeResponse() {
  const res = { statusCode: 0, headers: {}, raw: "" };
  res.writeHead = (code, h) => { res.statusCode = code; res.headers = h || {}; };
  res.end = (payload) => { res.raw = payload === undefined ? "" : String(payload); };
  return res;
}

function makeApi(toolkitRoot) {
  const routes = [];
  const hits = {};
  const ctx = {
    effect: (cb) => { cb(); },
    get: () => undefined,
    webServer: { register: (route) => { routes.push(route); return () => {}; } },
  };
  panelMod.apply(ctx, {
    toolkitRoot,
    backupRoot: join(toolkitRoot, ".panel-write-backups"),
    doctorCli: DOCTOR_CLI,
    doctorConfigRoot: join(toolkitRoot, "doctor-config"),
    devicesFile: join(toolkitRoot, "no-such-devices.json"),
  });
  async function call(path, opts = {}) {
    const route = routes.find((r) => r.path === path);
    if (!route) throw new Error("路由未注册：" + path);
    hits[path] = (hits[path] || 0) + 1;
    const req = makeRequest({ method: opts.method || "GET", body: opts.body, headers: opts.headers });
    const res = makeResponse();
    await route.handler(req, res);
    let json = null;
    try { json = JSON.parse(res.raw); } catch { /* 非 JSON 响应（如 ui 页） */ }
    return { status: res.statusCode, json, raw: res.raw };
  }
  return {
    routes,
    hits,
    call,
    paths: routes.map((r) => r.path),
    snapshot: () => call("/api/toolkit-panel/snapshot"),
    ui: () => call("/api/toolkit-panel/ui"),
    uninstallPlan: (plugin, mode, confirm, reason) => call("/api/toolkit-panel/uninstall/plan", { method: "POST", body: { plugin, mode, confirm, reason } }),
    uninstallExecute: (token) => call("/api/toolkit-panel/uninstall/execute", { method: "POST", body: { token } }),
    custody: () => call("/api/toolkit-panel/custody"),
    restorePlan: (plugin, extra) => call("/api/toolkit-panel/restore/plan", { method: "POST", body: Object.assign({ plugin }, extra || {}) }),
    restoreExecute: (token, extra) => call("/api/toolkit-panel/restore/execute", { method: "POST", body: Object.assign({ token }, extra || {}) }),
    // 批 2：操作台/双回滚
    doctorStates: () => call("/api/toolkit-panel/doctor/states"),
    doctorApplyPlan: (issueId) => call("/api/toolkit-panel/doctor/apply/plan", { method: "POST", body: { issueId } }),
    doctorApplyExecute: (token) => call("/api/toolkit-panel/doctor/apply/execute", { method: "POST", body: { token } }),
    doctorRollbackPlan: (stamp) => call("/api/toolkit-panel/doctor/rollback/plan", { method: "POST", body: { stamp } }),
    doctorRollbackExecute: (token) => call("/api/toolkit-panel/doctor/rollback/execute", { method: "POST", body: { token } }),
    snapshotRestorePlan: (stamp) => call("/api/toolkit-panel/snapshot-restore/plan", { method: "POST", body: { stamp } }),
    snapshotRestoreExecute: (token) => call("/api/toolkit-panel/snapshot-restore/execute", { method: "POST", body: { token } }),
  };
}

/** 一次完整卸载动作（前端的两段式：输入插件名 → plan → execute；reason=§3.6a 可选删除原因）。 */
async function uninstall(api, plugin, mode, reason) {
  const confirm = mode === "true" ? [plugin, plugin] : [plugin];
  const planned = await api.uninstallPlan(plugin, mode, confirm, reason);
  if (!planned.json || !planned.json.ok) return { planned, executed: null };
  const executed = await api.uninstallExecute(planned.json.plan.token);
  return { planned, executed };
}
async function restore(api, plugin, extra) {
  const planned = await api.restorePlan(plugin, extra);
  if (!planned.json || planned.json.ok !== true) return { planned, executed: null };
  const executed = await api.restoreExecute(planned.json.plan.token, extra && extra.custodyId ? { custodyId: extra.custodyId } : undefined);
  return { planned, executed };
}

// ════════════════════════════════════════════════════════════
// 3. 两套真实渲染器 harness
// ════════════════════════════════════════════════════════════
const snapMod = await import(new URL("../panel/manager/snapshot.mjs", import.meta.url).href);

/**
 * 收集节点下的全部**可见文本**。
 * headless createElement 不会调用函数组件，所以这里对函数组件元素递归渲染一次
 * （DialogLine 等纯呈现组件；stateful 组件不会出现在待测子树的内部，见下）。
 */
function textOf(node, out = [], depth = 0) {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (depth > 8) return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const c of node) textOf(c, out, depth + 1); return out; }
  if (typeof node.type === "function") {
    // 子树内部只可能出现纯呈现组件（DialogLine）；stateful 组件一律不在此层
    const rendered = node.type(node.props || {});
    textOf(rendered, out, depth + 1);
    return out;
  }
  if (node.children) textOf(node.children, out, depth + 1);
  return out;
}
function findAll(node, pred, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) { for (const c of node) findAll(c, pred, out); return out; }
  if (pred(node)) out.push(node);
  if (node.children) findAll(node.children, pred, out);
  return out;
}
const namedOf = (node, name) => findAll(node, (n) => typeof n.type === "function" && n.type.name === name);
/** 调用一个函数组件的**渲染结果**（headless createElement 不会调用组件体，必须自己调一次）。 */
const render1 = (el) => (el ? el.type(el.props) : null);

function loadReactClient(initialPatchText) {
  const src = readFileSync(join(root, "panel", "client", "index.js"), "utf8");
  let factory = null;
  new Function("window", src)({ __ModuleLoader__: { load: (o) => { factory = o.factory; } } });
  if (!factory) throw new Error("client/index.js 没有调用 window.__ModuleLoader__.load");

  let idx = 0;
  let indexOverrides = {};
  let queue = [];
  const noop = () => {};
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat() }),
    useState: (init) => {
      const i = idx++;
      if (queue.length) return [queue.shift(), noop];
      if (Object.prototype.hasOwnProperty.call(indexOverrides, i)) return [indexOverrides[i], noop];
      return [init, noop];
    },
    useCallback: (fn) => fn,
    useEffect: () => {},
    useRef: (v) => ({ current: v }),
    useMemo: (fn) => fn(),
  };
  const mod = factory((name) => {
    if (name === "react") return react;
    throw new Error("bundle 请求了未 stub 的模块：" + name);
  });
  const api = mod && mod.apply ? mod : (mod && mod.exports);
  let captured = null;
  api.apply({ slots: { inject: (n, cb) => cb(), register: (meta, comp) => { captured = comp; return () => {}; } } });
  if (!captured) throw new Error("apply() 没有注册面板组件");

  const cardByDir = (tree, dir) => findAll(tree, (n) => typeof n.type === "function" && n.type.name === "PluginCard" && n.props.plugin && n.props.plugin.dir === dir)[0] || null;
  /** P24Controls 用默认 state（dlg=null / busy=false / error=""）渲染一次，返回其子树。 */
  const p24Body = (p24El) => { if (!p24El) return null; idx = 0; queue = []; indexOverrides = {}; const t = p24El.type(p24El.props); idx = 0; queue = []; return t; };
  const buttonsOf = (tree) => (tree ? findAll(tree, (n) => n.type === "button") : []);

  return {
    panelName: captured.name,
    render: (snap, patchText) => {
      idx = 0;
      indexOverrides = { 0: snap, 2: patchText === undefined ? "" : patchText };
      queue = [];
      return captured();
    },
    cardsOf: (tree) => findAll(tree, (n) => typeof n.type === "function" && n.type.name === "PluginCard"),
    cardByDir,
    /** 直接调用某组件并注入其前 N 个 useState 的值（用于打开弹窗等状态）。 */
    direct: (el, overrides = []) => { idx = 0; queue = overrides.slice(); indexOverrides = {}; const t = el.type(el.props); idx = 0; queue = []; return t; },
    p24Of: (cardEl) => (cardEl ? namedOf(render1(cardEl), "P24Controls")[0] || null : null),
    p24Body,
    /** P24Controls 在默认态下是否渲染出「恢复」按钮（恢复入口接线断言）。 */
    hasRestoreButton: (p24El) => buttonsOf(p24Body(p24El)).some((b) => textOf(b).join("") === "恢复"),
    /** P24Controls 默认态：软卸载 + 真卸载（销毁式）两入口并存。 */
    hasUninstallButtons: (p24El) => {
      const labels = buttonsOf(p24Body(p24El)).map((b) => textOf(b).join(""));
      return labels.some((t) => t.indexOf("软卸载") === 0) && labels.some((t) => t.indexOf("真卸载") === 0);
    },
    absenceOf: (cardEl) => {
      const el = cardEl ? namedOf(render1(cardEl), "AbsenceBanner")[0] || null : null;
      return el ? el.type(el.props) : null; // 已渲染结果：mounted 时 AbsenceBanner 返回 null
    },
    stateLabelOf: (cardEl) => {
      const sub = render1(cardEl);
      const hit = namedOf(sub, "StateRow")[0];
      return hit ? hit.props.state.label : null;
    },
  };
}

function loadHtmlClient() {
  const html = readFileSync(join(root, "panel", "client", "panel.html"), "utf8");
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  if (!m) throw new Error("panel.html 里找不到内联 script");
  const node = (id) => ({
    id, textContent: "", innerHTML: "", className: "", value: "", disabled: false, checked: false,
    addEventListener: () => {}, appendChild: () => {}, querySelector: () => null, querySelectorAll: () => [],
  });
  const fakeDoc = { getElementById: (id) => node(id), createElement: (t) => node(t) };
  const fn = new Function("document", "fetch", m[1] + "\nreturn {" + [
    "stateOf", "toggleHtml", "dualSwitchNotice", "absenceBanner", "uninstallDialogHtml",
    "restoreDialogHtml", "p24SectionHtml", "p24Banner", "p24Name",
    "ABSENCE_COPY_FALLBACK", "RESTORE_DONE_BANNER", "UNINSTALL_COPY", "P24_CN",
    "setPatch: (t) => { PATCH_TEXT = t; }",
  ].join(", ") + "};");
  return fn(fakeDoc, () => new Promise(() => {}));
}

const realSnap = await snapMod.buildSnapshot({ toolkitRoot: root, hotRouterPath: join(root, "no-hot.json"), envMode: undefined });
const reactR = loadReactClient(realSnap.patch.text);
const htmlR = loadHtmlClient();
htmlR.setPatch(realSnap.patch.text);
check("react 渲染器：apply() 注册了 ToolkitPanel", reactR.panelName === "ToolkitPanel", reactR.panelName);
check("html 渲染器：内联脚本可用（uninstallDialogHtml 可调）", typeof htmlR.uninstallDialogHtml === "function");

// ════════════════════════════════════════════════════════════
// 4. §2 全稿文案保真（两渲染器逐句）
// ════════════════════════════════════════════════════════════
section("§2 弹窗/确认页文案逐句保真（两渲染器）");

// 期望值 = panel/docs/p24-test-plan-batch1.md §2 的逐句原文（测试侧独立重述，不复用生产常量）
const S2 = {
  "rate-throttle": {
    soft: {
      title: "软卸载「限流 rate-throttle」",
      lines: [
        "让 DSH 下次启动时不再加载「限流」功能模块（不删除磁盘上的源代码文件，源码保留在本地）。",
        "重启后，平台不再按当前面板里的限流参数进行限速；重启前仍按当前状态运行。",
        "本次执行后，将于下次重启时停用；重启前仍按当前状态运行。",
        "无需存档，源代码文件保留。",
        "面板 →「限流 rate-throttle」卡片 → 点「恢复」。",
        "恢复后需要重启才生效。",
        "请手动输入 rate-throttle 后点「确认软卸载」，或点「取消」。",
      ],
      archiveKey: "已存档", inputs: 1, button: "确认软卸载",
    },
    true: {
      title: "真卸载「限流 rate-throttle」——彻底删除，不留副本",
      lines: [
        "确认执行后：① 让 DSH 下次启动时不再加载该功能模块；② 彻底删除磁盘上的限流源代码目录（lib/rate-throttle），不保留任何副本。",
        "重启后，平台不再按当前面板里的限流参数进行限速；重启前仍按当前状态运行。",
        "⚠ 本次是彻底删除，面板不会留下任何副本。当前版本尚未开源，删除后无法恢复，也无法重新安装。等项目开源后，你可以重新下载安装，届时面板会检测到「已安装未挂载」并帮你重新挂载。",
        "面板只留下一份删除收据：被删文件的清单、逐个校验值和你的填写原因。收据仅用于事后对账，不含文件内容，不能用来恢复。",
        "注意：删除不进回收站。文件是直接从磁盘上移除的，系统回收站里也找不到，无法通过回收站找回。",
        "确认执行后立即删除；对运行中的系统，将在下次重启时停用；重启前仍按当前状态运行。",
        "本次删除不可恢复。等项目开源后，你可以重新下载安装，届时面板会检测到「已安装未挂载」并帮你重新挂载。",
        "恢复后需要重启才生效。",
        "请手动输入 rate-throttle 两次并点「确认彻底删除」，或点「取消」。",
      ],
      warningKey: "不可恢复（空窗期）", topWarning: "开源前删除不可恢复", inputs: 2, button: "确认彻底删除",
    },
  },
  "agent-memory": {
    soft: {
      title: "软卸载「记忆 agent-memory」",
      lines: [
        "让 DSH 下次启动时不再加载「记忆」功能模块（不删除磁盘上的源代码文件，源码与已有记忆数据都保留）。",
        "重启后，记忆内容在压缩结果里不再显示；重启前仍按当前状态运行。",
        "本次执行后，将于下次重启时停用；重启前仍按当前状态运行。",
        "无需存档，源代码与已有记忆数据保留。",
        "面板 →「记忆 agent-memory」卡片 → 点「恢复」。",
        "恢复后需要重启才生效。",
        "请手动输入 agent-memory 后点「确认软卸载」，或点「取消」。",
      ],
      archiveKey: "已存档", inputs: 1, button: "确认软卸载",
    },
    true: {
      title: "真卸载「记忆 agent-memory」——彻底删除，不留副本",
      lines: [
        "确认执行后：① 让 DSH 下次启动时不再加载该功能模块；② 彻底删除磁盘上的记忆源代码目录（lib/agent-memory），不保留任何副本。",
        "重启后，记忆内容在压缩结果里不再显示；重启前仍按当前状态运行。",
        "⚠ 本次是彻底删除，面板不会留下任何副本。当前版本尚未开源，删除后无法恢复，也无法重新安装。等项目开源后，你可以重新下载安装，届时面板会检测到「已安装未挂载」并帮你重新挂载。",
        "面板只留下一份删除收据：被删文件的清单、逐个校验值和你的填写原因。收据仅用于事后对账，不含文件内容，不能用来恢复。",
        "注意：删除不进回收站。文件是直接从磁盘上移除的，系统回收站里也找不到，无法通过回收站找回。",
        "确认执行后立即删除；对运行中的系统，将在下次重启时停用；重启前仍按当前状态运行。",
        "本次删除不可恢复。等项目开源后，你可以重新下载安装，届时面板会检测到「已安装未挂载」并帮你重新挂载。",
        "恢复后需要重启才生效。",
        "请手动输入 agent-memory 两次并点「确认彻底删除」，或点「取消」。",
      ],
      warningKey: "不可恢复（空窗期）", topWarning: "开源前删除不可恢复", inputs: 2, button: "确认彻底删除",
    },
  },
  "compact-router": {
    soft: {
      title: "软卸载「压缩 compact-router」",
      lines: [
        "让 DSH 下次启动时不再加载「压缩」功能模块的增强版本，恢复为系统自带版本（不删除磁盘上的源代码文件，源码保留在本地）。",
        "重启后，平台使用系统自带的压缩功能；限流的自动换源降级功能会退化；记忆功能本身不受影响；重启前仍按当前状态运行。",
        "本次执行后，将于下次重启时停用本面板的压缩增强；重启前仍按当前状态运行。",
        "无需存档，源代码文件保留。",
        "面板 →「压缩 compact-router」卡片 → 点「恢复」。",
        "恢复后需要重启才生效。",
        "请手动输入 compact-router 后点「确认软卸载」，或点「取消」。",
      ],
      archiveKey: "已存档", inputs: 1, button: "确认软卸载",
    },
    true: {
      title: "真卸载「压缩 compact-router」——彻底删除，不留副本",
      lines: [
        "确认执行后：① 让 DSH 下次启动时恢复为系统自带压缩版本；② 彻底删除磁盘上的压缩源代码目录（lib/compact-router），不保留任何副本。",
        "重启后，平台使用系统自带的压缩功能；限流的自动换源降级功能会退化；记忆功能本身不受影响；重启前仍按当前状态运行。",
        "⚠ 本次是彻底删除，面板不会留下任何副本。当前版本尚未开源，删除后无法恢复，也无法重新安装。等项目开源后，你可以重新下载安装，届时面板会检测到「已安装未挂载」并帮你重新挂载。",
        "面板只留下一份删除收据：被删文件的清单、逐个校验值和你的填写原因。收据仅用于事后对账，不含文件内容，不能用来恢复。",
        "注意：删除不进回收站。文件是直接从磁盘上移除的，系统回收站里也找不到，无法通过回收站找回。",
        "确认执行后立即删除；对运行中的系统，将在下次重启时停用；重启前仍按当前状态运行。",
        "本次删除不可恢复。等项目开源后，你可以重新下载安装，届时面板会检测到「已安装未挂载」并帮你重新挂载。",
        "恢复后需要重启才生效。",
        "请手动输入 compact-router 两次并点「确认彻底删除」，或点「取消」。",
      ],
      warningKey: "不可恢复（空窗期）", topWarning: "开源前删除不可恢复", inputs: 2, button: "确认彻底删除",
    },
  },
  "search-router": {
    soft: {
      title: "软卸载「搜索路由 search-router」",
      lines: [
        "让 DSH 下次启动时不再加载「搜索路由」功能模块；把面板里一项网页搜索系统设置改回「系统默认（未指定）」（不删除磁盘上的源代码文件，源码保留在本地）。",
        "重启后，网页搜索退回到系统默认行为：有哪个可用就用哪个，而不是指定本面板的搜索路由；重启前仍按当前状态运行。",
        "本次执行后，将于下次重启时停用；重启前仍按当前状态运行。",
        "无需存档，源代码文件保留。",
        "面板 →「搜索路由 search-router」卡片 → 点「恢复」。恢复时若那项系统设置已被其他程序改掉，面板会先提示你选择「保留当前值」还是「恢复成卸载前的值」，不会自动覆盖。",
        "恢复后需要重启才生效。",
        "请手动输入 search-router 后点「确认软卸载」，或点「取消」。",
      ],
      archiveKey: "已存档", inputs: 1, button: "确认软卸载",
    },
    true: {
      title: "真卸载「搜索路由 search-router」——彻底删除，不留副本",
      lines: [
        "确认执行后：① 让 DSH 下次启动时不再加载该功能模块；② 把面板里一项网页搜索系统设置改回「系统默认（未指定）」；③ 彻底删除磁盘上的搜索路由源代码目录（lib/search-router），不保留任何副本。",
        "重启后，网页搜索退回到系统默认行为；重启前仍按当前状态运行。",
        "⚠ 本次是彻底删除，面板不会留下任何副本。当前版本尚未开源，删除后无法恢复，也无法重新安装。等项目开源后，你可以重新下载安装，届时面板会检测到「已安装未挂载」并帮你重新挂载。",
        "面板只留下一份删除收据：被删文件的清单、逐个校验值和你的填写原因。收据仅用于事后对账，不含文件内容，不能用来恢复。",
        "注意：删除不进回收站。文件是直接从磁盘上移除的，系统回收站里也找不到，无法通过回收站找回。",
        "确认执行后立即删除；对运行中的系统，将在下次重启时停用；重启前仍按当前状态运行。",
        "本次删除不可恢复。等项目开源后，你可以重新下载安装，届时面板会检测到「已安装未挂载」并帮你重新挂载。",
        "恢复后需要重启才生效。",
        "请手动输入 search-router 两次并点「确认彻底删除」，或点「取消」。",
      ],
      warningKey: "不可恢复（空窗期）", topWarning: "开源前删除不可恢复", inputs: 2, button: "确认彻底删除",
    },
  },
  "web-search-local": {
    soft: {
      title: "软卸载「本地搜索 web-search-local」",
      lines: [
        "让 DSH 下次启动时不再加载「本地搜索」功能模块；把面板里一项网页抓取系统设置改回「系统默认（未指定）」（不删除磁盘上的源代码文件，源码保留在本地）。",
        "重启后，网页抓取退回到系统默认行为；「搜索路由」的搜索功能将不可用（它依赖本插件）；若需搜索请同时卸载或保留其一；重启前仍按当前状态运行。",
        "本次执行后，将于下次重启时停用；重启前仍按当前状态运行。",
        "无需存档，源代码文件保留。",
        "面板 →「本地搜索 web-search-local」卡片 → 点「恢复」。恢复时若那项系统设置已被其他程序改掉，面板会先提示你选择「保留当前值」还是「恢复成卸载前的值」，不会自动覆盖。",
        "恢复后需要重启才生效。",
        "请手动输入 web-search-local 后点「确认软卸载」，或点「取消」。",
      ],
      archiveKey: "已存档", inputs: 1, button: "确认软卸载",
    },
    true: {
      title: "真卸载「本地搜索 web-search-local」——彻底删除，不留副本",
      lines: [
        "确认执行后：① 让 DSH 下次启动时不再加载该功能模块；② 把面板里一项网页抓取系统设置改回「系统默认（未指定）」；③ 彻底删除磁盘上的本地搜索源代码目录（lib/web-search-local），不保留任何副本。",
        "重启后，网页抓取退回到系统默认行为；「搜索路由」的搜索功能将不可用（它依赖本插件）；重启前仍按当前状态运行。",
        "⚠ 本次是彻底删除，面板不会留下任何副本。当前版本尚未开源，删除后无法恢复，也无法重新安装。等项目开源后，你可以重新下载安装，届时面板会检测到「已安装未挂载」并帮你重新挂载。",
        "面板只留下一份删除收据：被删文件的清单、逐个校验值和你的填写原因。收据仅用于事后对账，不含文件内容，不能用来恢复。",
        "注意：删除不进回收站。文件是直接从磁盘上移除的，系统回收站里也找不到，无法通过回收站找回。",
        "确认执行后立即删除；对运行中的系统，将在下次重启时停用；重启前仍按当前状态运行。",
        "本次删除不可恢复。等项目开源后，你可以重新下载安装，届时面板会检测到「已安装未挂载」并帮你重新挂载。",
        "恢复后需要重启才生效。",
        "请手动输入 web-search-local 两次并点「确认彻底删除」，或点「取消」。",
      ],
      warningKey: "不可恢复（空窗期）", topWarning: "开源前删除不可恢复", inputs: 2, button: "确认彻底删除",
    },
  },
};

const snapByDir = {};
for (const p of realSnap.plugins) snapByDir[p.dir] = p;

for (const dir of Object.keys(S2)) {
  const plugin = snapByDir[dir];
  const cardEl = reactR.cardByDir(reactR.render(realSnap, realSnap.patch.text), dir);
  const p24El = reactR.p24Of(cardEl);
  check("[" + dir + "] 卡片渲染出 P24Controls（卸载/恢复入口）", !!p24El);

  for (const mode of ["soft", "true"]) {
    const exp = S2[dir][mode];
    // 软卸载分区名 = 「已存档」；真卸载（销毁式）分区名 = 「不可恢复（空窗期）」（文案 v2 §6.1）
    const keyName = mode === "true" ? exp.warningKey : exp.archiveKey;

    // ---- html 渲染器 ----
    const h = htmlR.uninstallDialogHtml(plugin, mode);
    check("§2[" + dir + "/" + mode + "] html 标题逐字", h.includes(exp.title), exp.title);
    for (const line of exp.lines) check("§2[" + dir + "/" + mode + "] html 含「" + line.slice(0, 16) + "…」", h.includes(line), line);
    check("§2[" + dir + "/" + mode + "] html 分区名「" + keyName + "」", h.includes(keyName));
    check("§2[" + dir + "/" + mode + "] html 按钮「" + exp.button + "」+ 取消", h.includes(exp.button) && h.includes(">取消<"));
    check("§2[" + dir + "/" + mode + "] html 输入框数 = " + exp.inputs,
      (h.match(/data-confirm-idx=/g) || []).length === exp.inputs, String((h.match(/data-confirm-idx=/g) || []).length));
    if (mode === "true") {
      // 两补强 (a)：顶部重复短句
      check("§2[" + dir + "/true] html 顶部重复短句「" + exp.topWarning + "」", h.includes(exp.topWarning));
      // 两补强 (b)：将删文件清单 + 总字节数
      check("§2[" + dir + "/true] html 含「将删除」清单行（文件数/字节数）", h.includes("将删除") && /共 \d+ 个文件，合计 \d+ 字节/.test(h));
      // §3.6(a)：可选「删除原因」格（段标题/说明/占位逐字；位置=输名之前）
      check("§2[" + dir + "/true] html 含「删除原因（可不填）」段（说明+占位+不填如实记）",
        h.includes("删除原因（可不填）") && h.includes("可选：写一句话，最多 200 字") && h.includes("不填也可以，收据会如实记「（未填写）」"), "");
    }

    // ---- react 渲染器 ----
    const dlgEls = namedOf(reactR.direct(p24El, [{ kind: "uninstall", mode }]), "UninstallDialog");
    check("§2[" + dir + "/" + mode + "] react 弹窗已渲染", dlgEls.length === 1, "count=" + dlgEls.length);
    if (dlgEls.length === 1) {
      const dlg = dlgEls[0];
      const txt = textOf(render1(dlg)).join(" ");
      if (dir === "rate-throttle" && mode === "soft") console.log("  · react 弹窗实际文本（前 400 字）：" + txt.slice(0, 400));
      check("§2[" + dir + "/" + mode + "] react 标题逐字", txt.includes(exp.title), "actual=" + txt.slice(0, 160));
      for (const line of exp.lines) check("§2[" + dir + "/" + mode + "] react 含「" + line.slice(0, 16) + "…」", txt.includes(line), "actual=" + txt.slice(0, 200));
      check("§2[" + dir + "/" + mode + "] react 分区名「" + keyName + "」+ 按钮逐字",
        txt.includes(keyName) && txt.includes(exp.button) && txt.includes("取消"), "actual=" + txt.slice(0, 200));
      const inputs = findAll(render1(dlg), (n) => n.type === "input");
      // §3.6a 口径更新：真卸载输入框 = 输名×2 ＋ 可选原因格×1（软卸载不变）
      const expInputs = exp.inputs + (mode === "true" ? 1 : 0);
      check("§2[" + dir + "/" + mode + "] react 输入框数 = " + expInputs + (mode === "true" ? "（含可选原因格）" : ""), inputs.length === expInputs, String(inputs.length));
      if (mode === "true") {
        check("§2[" + dir + "/true] react 顶部重复短句 + 将删清单行",
          txt.includes(exp.topWarning) && /共 \d+ 个文件，合计 \d+ 字节/.test(txt), "actual=" + txt.slice(0, 260));
        // 占位符是 props 不是可见文本 ⇒ 用 input 元素断言（文本断言只查标题与说明句）
        const reasonInput = inputs.find((n) => n.props && n.props.placeholder === "可选：写一句话，最多 200 字");
        check("§2[" + dir + "/true] react 含「删除原因（可不填）」段（标题+说明句+占位 200+不填如实记）",
          txt.includes("删除原因（可不填）") && txt.includes("不填也可以，收据会如实记「（未填写）」") && !!reasonInput && reasonInput.props.maxLength === 200, "");
      }
    }
  }
}

// ---- §2.9 / §2.9b 恢复确认页（含冲突三态）+ 完成后横幅 ----
section("§2.9 / §2.9b 恢复确认页 + 冲突三态 + 完成后横幅");
{
  const sr = snapByDir["search-router"];
  const rt = snapByDir["rate-throttle"];
  const rtCard = reactR.cardByDir(reactR.render(realSnap, realSnap.patch.text), "rate-throttle");
  const rtP24 = reactR.p24Of(rtCard);

  const R29B_TITLE_RT = "恢复「限流 rate-throttle」（软卸载恢复）";
  const R29B_BODY_RT = "将重新打开面板到「限流 rate-throttle」的启动入口，源代码文件一直在本地，不涉及文件恢复；若卸载时改动了系统设置项，将一并恢复。";
  const MOUNT_TITLE_SR = "挂载「搜索路由 search-router」（重新安装后）";
  const MOUNT_BODY_SR = "将把「搜索路由 search-router」的启动入口重新写回挂载面（行块与系统设置项按卸载收据复原）。源代码文件已由你重新安装放回本地，本操作不涉及文件写入。";
  const RESTART_LINE = "恢复完成后需要重启才生效。";
  const CONFIRM_LINE = "点「确认恢复」，或点「取消」。";
  const BANNER_LINE = "恢复完成，重启后生效";

  // html：软卸载恢复（2.9b）——F-73 收口后签名 (p, kind, conflict, choices)，custody 位已摘
  const hSoft = htmlR.restoreDialogHtml(rt, "soft", null);
  check("§2.9b html 标题逐字", hSoft.includes(R29B_TITLE_RT));
  check("§2.9b html 正文逐字", hSoft.includes(R29B_BODY_RT), R29B_BODY_RT);
  check("§2.9b html 含重启句 + 按钮", hSoft.includes(RESTART_LINE) && hSoft.includes(">确认恢复<"));

  // html：挂载确认页（**重装后**；销毁式 v2 §5 —— 真卸载唯一恢复途径）
  const hMount = htmlR.restoreDialogHtml(sr, "mount", null);
  check("§2.9' html 挂载标题逐字", hMount.includes(MOUNT_TITLE_SR), MOUNT_TITLE_SR);
  check("§2.9' html 挂载正文逐字", hMount.includes(MOUNT_BODY_SR), MOUNT_BODY_SR);
  check("§2.9' html 挂载含重启句 + 按钮", hMount.includes(">确认恢复<") && hMount.includes(">取消<"));

  // html：冲突三态（带真实 cur/backup）
  const conflict = { key: "searchProvider", currentValue: "official-only", backupValue: "searchProvider: auto-search" };
  const choices = [
    { id: "A", label: "保留当前值（不覆盖）", hostKeyChoice: "keep-current" },
    { id: "B", label: "恢复成卸载前的值", hostKeyChoice: "restore-backup" },
    { id: "C", label: "取消本次恢复" },
  ];
  const hCf = htmlR.restoreDialogHtml(sr, "soft", conflict, choices);
  check("§2.9 冲突三态 html 逐字（含 cur/backup 代入）",
    hCf.includes("若恢复时发现某项系统设置已被其他程序改掉（当前值是 official-only，卸载前是 searchProvider: auto-search），弹窗三选一：A. 保留当前值（不覆盖）；B. 恢复成卸载前的值；C. 取消本次恢复。面板不会自动覆盖。"));
  check("§2.9 冲突三态 html 三按钮 = 服务端 choices 标签",
    hCf.includes(">保留当前值（不覆盖）<") && hCf.includes(">恢复成卸载前的值<") && hCf.includes(">取消本次恢复<"));

  // react：2.9b + 挂载 + 冲突三态
  const dlgSoft = namedOf(reactR.direct(rtP24, [{ kind: "restore", mode: "soft" }]), "RestoreDialog")[0];
  const txtSoft = dlgSoft ? textOf(render1(dlgSoft)).join(" ") : "";
  check("§2.9b react 标题 + 正文逐字", txtSoft.includes(R29B_TITLE_RT) && txtSoft.includes(R29B_BODY_RT));

  const srP24 = reactR.p24Of(reactR.cardByDir(reactR.render(realSnap, realSnap.patch.text), "search-router"));
  const dlgMount = namedOf(reactR.direct(srP24, [{ kind: "restore", mode: "mount" }]), "RestoreDialog")[0];
  const txtMount = dlgMount ? textOf(render1(dlgMount)).join(" ") : "";
  check("§2.9' react 挂载标题 + 正文逐字", txtMount.includes(MOUNT_TITLE_SR) && txtMount.includes(MOUNT_BODY_SR), "actual=" + txtMount.slice(0, 200));

  const dlgCf = namedOf(reactR.direct(rtP24, [{ kind: "restore", mode: "soft", conflict, choices }]), "RestoreDialog")[0];
  const txtCf = dlgCf ? textOf(render1(dlgCf)).join(" ") : "";
  check("§2.9 冲突三态 react 逐字",
    txtCf.includes("当前值是 official-only，卸载前是 searchProvider: auto-search")
    && txtCf.includes("A. 保留当前值（不覆盖）；B. 恢复成卸载前的值；C. 取消本次恢复。面板不会自动覆盖。")
    && txtCf.includes("保留当前值（不覆盖）") && txtCf.includes("恢复成卸载前的值") && txtCf.includes("取消本次恢复"));

  // 完成后横幅
  check("§2.9 html 横幅常量逐字 =「" + BANNER_LINE + "」", htmlR.RESTORE_DONE_BANNER === BANNER_LINE, htmlR.RESTORE_DONE_BANNER);
  const tree = reactR.render(realSnap, realSnap.patch.text);
  const bannerEl = namedOf(tree, "RestoreBanner")[0];
  check("§2.9 react 页面横幅组件在树上", !!bannerEl);
  const bannerTxt = bannerEl ? textOf(render1({ type: bannerEl.type, props: { show: true }, children: [] })).join(" ") : "";
  check("§2.9 react 横幅文案逐字", bannerTxt === BANNER_LINE, bannerTxt);

  // F-73 产品级（C1-007 开工令 2）：软卸载收据块——服务端组稿（buildSoftReceipt 导出循 buildConfigPanel
  // 先例）＋恢复弹窗双通道只渲染不加字。两条断言：①react 收据行内容在场（服务端 lines 逐字）＋挂载弹窗
  // 零收据块（收据卡反向）；②html 同（覆盖双通道）。
  const receiptRec = {
    recordedAt: "2026-09-27T00:00:00.000Z",
    hostKey: { key: "searchProvider", raw: "searchProvider: auto-search" },
    backupDir: "D:/tmp/backup-demo",
    userReason: "演示收据",
  };
  const receipt = snapMod.buildSoftReceipt(receiptRec, "rate-throttle", "rate-throttle");
  const rtSoftCard = Object.assign({}, rt, { status: "soft-unmounted", restoreAvailable: true, softReceipt: receipt });
  const rtSoftSnap = Object.assign({}, realSnap, { plugins: realSnap.plugins.map((x) => (x.dir === "rate-throttle" ? rtSoftCard : x)) });
  const rtSoftP24 = reactR.p24Of(reactR.cardByDir(reactR.render(rtSoftSnap, rtSoftSnap.patch.text), "rate-throttle"));
  const dlgRc = namedOf(reactR.direct(rtSoftP24, [{ kind: "restore", mode: "soft" }]), "RestoreDialog")[0];
  const txtRc = dlgRc ? textOf(render1(dlgRc)).join(" ") : "";
  const dlgMountRc = namedOf(reactR.direct(rtSoftP24, [{ kind: "restore", mode: "mount" }]), "RestoreDialog")[0];
  const txtMountRc = dlgMountRc ? textOf(render1(dlgMountRc)).join(" ") : "";
  check("F-73 react 收据行内容在场（服务端 lines 逐字）＋挂载弹窗零收据块",
    txtRc.includes("卸载收据（只读）")
    && Array.isArray(receipt.lines) && receipt.lines.length >= 4 && receipt.lines.every((ln) => txtRc.includes(ln))
    && !txtMountRc.includes("卸载收据（只读）"),
    "lines=" + (receipt.lines || []).length);
  const hSoftRc = htmlR.restoreDialogHtml(rtSoftCard, "soft", null);
  const hMountRc = htmlR.restoreDialogHtml(Object.assign({}, rtSoftCard), "mount", null);
  check("F-73 html 收据行内容在场（同文逐字）＋挂载弹窗零收据块（双通道覆盖）",
    hSoftRc.includes("卸载收据（只读）")
    && receipt.lines.every((ln) => hSoftRc.includes(ln))
    && !hMountRc.includes("卸载收据（只读）"));
}

// ---- 缺席态六态渲染（本地合成六态快照，逐态断言两渲染器）----
section("缺席态六态渲染（两渲染器逐态）");
{
  const CASES = [
    { status: "mounted", copy: null, restore: false, gone: false },
    { status: "soft-unmounted", copy: "已软卸载 · 本体保留 · 可一键恢复", restore: true, gone: true },
    { status: "true-uninstalled", copy: "已卸载（真）· 本体已移入保管区 · 可一键恢复", restore: true, gone: true },
    { status: "installed-unmounted", copy: "已安装未挂载（不是面板卸载的）· 可从面板重新挂载", restore: true, gone: false },
    { status: "dangling-mount", copy: "挂载行存在，但本体缺失 · 异常态", restore: false, gone: false },
    { status: "dependency-broken", copy: "已加载，但依赖的本地搜索未安装——搜索功能不可用", warn: true, restore: false, gone: false },
  ];
  for (const c of CASES) {
    const plugin = Object.assign({}, snapByDir["search-router"], {
      status: c.status, statusCopy: c.copy, restoreAvailable: c.restore,
      mounted: c.status === "mounted" || c.status === "dependency-broken",
    });
    // html
    const hb = htmlR.absenceBanner(plugin);
    if (c.status === "mounted") check("六态[mounted] html 不渲染缺席横幅", hb === "");
    else {
      check("六态[" + c.status + "] html 横幅含 statusCopy 逐字", hb.includes(c.copy), c.copy);
      check("六态[" + c.status + "] html " + (c.warn ? "用警示样式（warn）" : "用普通样式"), c.warn ? hb.includes("absBox warn") : (hb.includes("absBox") && !hb.includes("absBox warn")));
      check("六态[" + c.status + "] html 状态行文案 = statusCopy（stateOf 吃快照字段）", htmlR.stateOf(plugin).label === c.copy, htmlR.stateOf(plugin).label);
    }
    // react
    const tree = reactR.render({ plugins: [plugin], patch: realSnap.patch, self: realSnap.self, toolkitName: "x", toolkitVersion: "0" }, realSnap.patch.text);
    const cardEl = reactR.cardsOf(tree)[0];
    const ab = cardEl ? reactR.absenceOf(cardEl) : null;
    if (c.status === "mounted") check("六态[mounted] react absenceBanner 返回 null", ab === null);
    else {
      const txt = ab ? textOf(ab).join(" ") : "";
      check("六态[" + c.status + "] react 横幅含 statusCopy 逐字", txt.includes(c.copy), txt.slice(0, 120));
      check("六态[" + c.status + "] react 状态行文案 = statusCopy", reactR.stateLabelOf(cardEl) === c.copy, String(reactR.stateLabelOf(cardEl)));
    }
    // 卸载 / 恢复入口可见性（两渲染器同口径，D-UI-01 回归位）
    const sec = htmlR.p24SectionHtml(plugin);
    const p24El = cardEl ? reactR.p24Of(cardEl) : null;
    check("六态[" + c.status + "] 两渲染器都渲染出 p24 区块", sec !== "" && !!p24El, "html=" + (sec !== "") + " react=" + !!p24El);
    check("六态[" + c.status + "] html 卸载入口可见（软+真） == " + (!c.gone), (sec.includes("软卸载") && sec.includes("真卸载")) === !c.gone);
    check("六态[" + c.status + "] react 卸载入口可见 == " + (!c.gone), reactR.hasUninstallButtons(p24El) === !c.gone);
    check("六态[" + c.status + "] html 恢复入口可见 == restoreAvailable(" + c.restore + ")", sec.includes(">恢复<") === c.restore, sec.slice(0, 90));
    check("六态[" + c.status + "] react 恢复入口可见 == restoreAvailable(" + c.restore + ")", reactR.hasRestoreButton(p24El) === c.restore);
  }
}

// ════════════════════════════════════════════════════════════
// 5. 面板级完整矩阵 A1–C3（四条 API 端到端 + 渲染断言）
// ════════════════════════════════════════════════════════════
section("面板级隔离性矩阵 A1–C3");

/** 把一次矩阵用例的收尾动作统一：快照 → 两渲染器 → 断言。 */
async function renderCase(dir) {
  const snap = await snapMod.buildSnapshot({ toolkitRoot: dir, hotRouterPath: join(dir, "no-hot.json"), envMode: undefined });
  const tree = reactR.render(snap, snap.patch.text);
  const cards = reactR.cardsOf(tree);
  return { snap, tree, cards, byDir: (d) => reactR.cardByDir(tree, d) };
}
/** 硬断言：5 卡恒渲染 + 逐卡状态文案 + 两渲染器缺席横幅一致。 */
function assertCards(tag, r, expect) {
  check(tag + " 面板 5 卡恒渲染（react）", r.cards.length === 5, "cards=" + r.cards.length);
  check(tag + " 面板 5 卡恒渲染（html）", r.snap.plugins.length === 5 && r.snap.plugins.every((p) => htmlR.p24SectionHtml(p) !== undefined));
  for (const dir of Object.keys(expect)) {
    const status = expect[dir];
    const p = r.snap.plugins.find((x) => x.dir === dir);
    check(tag + "[" + dir + "] 快照 status=" + status, p && p.status === status, p && p.status);
    const cardEl = r.byDir(dir);
    const abEl = cardEl ? reactR.absenceOf(cardEl) : null;
    const reactBanner = abEl ? textOf(abEl).join(" ") : "";
    const htmlBanner = htmlR.absenceBanner(p);
    const wantCopy = p.status === "mounted" ? "" : (p.statusCopy || "");
    if (status === "mounted") {
      check(tag + "[" + dir + "] 两渲染器都不渲染缺席横幅", reactBanner === "" && htmlBanner === "");
    } else {
      check(tag + "[" + dir + "] react 横幅 = 快照 statusCopy", reactBanner.includes(wantCopy) && wantCopy.length > 0, reactBanner);
      check(tag + "[" + dir + "] html 横幅 = 快照 statusCopy", htmlBanner.includes(wantCopy) && wantCopy.length > 0, htmlBanner);
    }
    // 卸载/恢复入口可见性 = 快照 restoreAvailable 接线（唯一真源，不被 gone 抵消——D-UI-01）
    const wantRestore = p.restoreAvailable === true;
    const secHtml = htmlR.p24SectionHtml(p);
    check(tag + "[" + dir + "] html 恢复入口 == restoreAvailable(" + wantRestore + ")", secHtml.includes(">恢复<") === wantRestore, "sec=" + secHtml.slice(0, 80));
    check(tag + "[" + dir + "] react 恢复入口 == restoreAvailable(" + wantRestore + ")",
      (() => { const el = r.byDir(dir); const p24 = el ? reactR.p24Of(el) : null; return (p24 ? reactR.hasRestoreButton(p24) : false) === wantRestore; })());
  }
}

// ---------- 销毁式真卸载 · 共用断言（L-060）----------
// 真卸载 = **彻底删除、不留副本**（p24-design-v2-destroy.md §1/§2）。本组锁死：
//   ① 走真实 API 完成一次销毁式真卸载（输入插件名两次）；
//   ② **5 条销毁式硬判据**：收据在案无 body/ · custody 全域无源码 · 无恢复用字段 · lib 已删 · 收据内容自洽；
//   ③ 真卸载态下两渲染器**均无「恢复」「挂载」入口**（无副本 ⇒ 不可恢复）。
const SOURCE_RE = /\.(js|mjs|cjs|ts)$/;
function anySourceUnder(d) {
  if (!existsSync(d)) return false;
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) {
      if (anySourceUnder(p)) return true;
    } else if (SOURCE_RE.test(e.name)) return true;
  }
  return false;
}
async function destroyTrue(tag, api, plugin) {
  const { planned, executed } = await uninstall(api, plugin, "true");
  check(
    tag + " 真卸载(销毁式) plan+execute 均 ok",
    planned.status === 200 && planned.json.ok === true && !!executed && executed.status === 200 && executed.json.ok === true,
    JSON.stringify({ planned: planned.json && (planned.json.code || planned.json.error), exec: executed && executed.json })
  );
  check(
    tag + " 回执含 deletedFiles / deletedBytes（收据计数）",
    !!executed && executed.json.deletedFiles > 0 && executed.json.deletedBytes > 0,
    JSON.stringify(executed && executed.json)
  );
  return executed.json;
}
function assertDestroyHard(tag, dir, plugin, execJson) {
  const m = JSON.parse(readFileSync(join(dir, ".panel-custody", execJson.custodyId, "manifest.json"), "utf8"));
  check(tag + " 硬判据① 收据在案且 kind=true-uninstall-receipt", m.kind === "true-uninstall-receipt" && m.schemaVersion === 2);
  check(
    tag + " 硬判据② 收据目录**无 body/**（不留副本）",
    !existsSync(join(dir, ".panel-custody", execJson.custodyId, "body")) && m.bodyStored === false
  );
  check(tag + " 硬判据③ .panel-custody 全域无任何源码副本", !anySourceUnder(join(dir, ".panel-custody")));
  check(tag + " 硬判据④ 收据无恢复用字段（body / restore）", m.body === undefined && m.restore === undefined);
  check(tag + " 硬判据⑤ lib/" + plugin + " 已彻底删除", !existsSync(join(dir, "lib", plugin)));
  check(
    tag + " 收据内容：逐文件 sha 齐 + totals 自洽 + rebuild 行块齐（重装挂载依据）",
    Array.isArray(m.deleted.body) && m.deleted.body.length > 0 && m.deleted.body.every((f) => f.sha256)
      && m.deleted.totals.files === m.deleted.body.length && !!m.rebuild.rowBlock,
    JSON.stringify({ files: m.deleted && m.deleted.body && m.deleted.body.length, totals: m.deleted && m.deleted.totals })
  );
  return m;
}
function assertNoRestoreNoMount(tag, r, plugin) {
  const el = reactR.p24Of(r.byDir(plugin));
  const sec = htmlR.p24SectionHtml(r.snap.plugins.find((x) => x.dir === plugin));
  check(
    tag + " 真卸载态：两渲染器均无「恢复」「挂载」入口（无副本）",
    reactR.hasRestoreButton(el) === false && sec.includes(">恢复<") === false && sec.includes("挂载") === false,
    sec.slice(0, 140)
  );
}

// ---------- A0 前置基线（§3.2 每例前置：基线 sha / doctor 0/0/0 / 5 卡 mounted）----------
{
  const tag = "A0";
  const dir = makeCopy("a0");
  const api = makeApi(dir);
  check(tag + " 前置：副本 cordis.patch.yml = 基线 sha", shaFile(join(dir, "cordis.patch.yml")) === BASE_SHA_EXPECT);
  const doc = runDoctor(dir);
  check(tag + " 前置：doctor 0/0/0", doc.summary.error === 0 && doc.summary.warning === 0 && doc.summary.info === 0,
    JSON.stringify(doc.summary) + " " + JSON.stringify(doc.issues.map((i) => [i.id, i.severity, i.message, i.file])));
  check(tag + " 前置：GET /snapshot = 200", (await api.snapshot()).status === 200);
  const r = await renderCase(dir);
  check(tag + " 前置：5 卡恒渲染且全 mounted", r.cards.length === 5 && r.snap.plugins.every((p) => p.status === "mounted"),
    JSON.stringify(r.snap.plugins.map((p) => [p.dir, p.status])));
}

// ---------- A1 单删 rate-throttle（软）----------
{
  const tag = "A1";
  const dir = makeCopy("a1");
  const api = makeApi(dir);
  const before = readFileSync(join(dir, "cordis.patch.yml"), "utf8");
  const libBefore = shaFile(join(dir, "lib", "rate-throttle", "body.js"));
  const { planned, executed } = await uninstall(api, "rate-throttle", "soft");
  check(tag + " uninstall/plan 200 + ok", planned.status === 200 && planned.json.ok === true, JSON.stringify(planned.json));
  check(tag + " uninstall/execute ok", executed && executed.status === 200 && executed.json.ok === true, JSON.stringify(executed && executed.json));

  // ① snapshot 200
  const snapRes = await api.snapshot();
  check(tag + " ① GET /snapshot = 200", snapRes.status === 200 && snapRes.json.ok === true);
  // ②③ 渲染
  const r = await renderCase(dir);
  assertCards(tag, r, { "rate-throttle": "soft-unmounted", "agent-memory": "mounted", "compact-router": "mounted", "search-router": "mounted", "web-search-local": "mounted" });
  // ④ 本体在 + sha 不变
  check(tag + " ④ lib/rate-throttle 存在且本体 sha 不变", existsSync(join(dir, "lib", "rate-throttle")) && shaFile(join(dir, "lib", "rate-throttle", "body.js")) === libBefore);
  // ⑤ 行块摘除 + 宿主键未动 + 形状合法（doctor 解析通过见 ⑦）
  const after = readFileSync(join(dir, "cordis.patch.yml"), "utf8");
  check(tag + " ⑤ patch 无 rate-throttle 插入块", !/- id: rate-throttle/.test(after));
  check(tag + " ⑤ 其余四卡行仍在 + web 行未动", ["- id: agent-memory-runtime", "- id: web-search-router", "- id: web-search-local", "searchProvider: auto-search"].every((s) => after.includes(s)));
  // ⑥ 备份 manifest（reason/note 非空、savedAs 无冒号）
  const bdirs = readdirSync(join(dir, ".panel-write-backups"));
  const mf = JSON.parse(readFileSync(join(dir, ".panel-write-backups", bdirs[bdirs.length - 1], "manifest.json"), "utf8"));
  check(tag + " ⑥ 新增备份 manifest 且 reason/note 非空", bdirs.length >= 1 && !!mf.reason && !!mf.note, JSON.stringify({ reason: mf.reason, note: mf.note }));
  check(tag + " ⑥ manifest savedAs 无盘符冒号（D-01）", (mf.files || []).every((f) => !String(f.savedAs || "").includes(":")));
  // ⑦ doctor
  const doc = runDoctor(dir);
  const mount = doc.issues.filter((i) => i.category === "mount");
  check(tag + " ⑦ doctor error=0", doc.summary.error === 0, JSON.stringify(doc.summary));
  check(tag + " ⑦ doctor 含 rate-throttle 缺席提示且 severity≠error", mount.some((i) => i.severity !== "error" && JSON.stringify(i).includes("rate-throttle")), JSON.stringify(mount));
  // ⑧ 恢复后 sha 回基线
  const { executed: re } = await restore(api, "rate-throttle");
  check(tag + " ⑧ 恢复 execute ok", re && re.json.ok === true, JSON.stringify(re && re.json));
  check(tag + " ⑧ cordis.patch.yml sha 回基线（字节级）", shaFile(join(dir, "cordis.patch.yml")) === sha(before));
  const r2 = await renderCase(dir);
  assertCards(tag + "·恢复后", r2, { "rate-throttle": "mounted" });
  check(tag + " ⑧ 四 API 全链路均被触达", ["uninstall/plan", "uninstall/execute", "snapshot", "restore/plan", "restore/execute"].every((k) => api.hits["/api/toolkit-panel/" + k] > 0), JSON.stringify(api.hits));
}

// ---------- A2 单删 compact-router（软，预设桥）----------
{
  const tag = "A2";
  const dir = makeCopy("a2", { withPresetBridge: true });
  const api = makeApi(dir);
  const presetState = JSON.parse(readFileSync(join(dir, "preset-patch-state.json"), "utf8"));
  const beforeShas = {};
  for (const id of Object.keys(presetState)) beforeShas[id] = shaFile(presetState[id].file);
  const libBefore = shaFile(join(dir, "lib", "compact-router", "body.js"));

  const { planned, executed } = await uninstall(api, "compact-router", "soft");
  check(tag + " uninstall/plan+execute ok", planned.json.ok === true && executed.json.ok === true, JSON.stringify(planned.json));
  const r = await renderCase(dir);
  assertCards(tag, r, { "compact-router": "soft-unmounted", "rate-throttle": "mounted" });
  check(tag + " ③ lib/compact-router 存在且 sha 不变", existsSync(join(dir, "lib", "compact-router")) && shaFile(join(dir, "lib", "compact-router", "body.js")) === libBefore);
  let allUndo = true;
  for (const id of Object.keys(presetState)) if (shaFile(presetState[id].file) !== shaFile(presetState[id].backup)) allUndo = false;
  check(tag + " ④ 四预设 --undo 后 = .bak sha", allUndo);
  check(tag + " ⑥ A2⑥ 留痕：preset-undo-evidence.json 落盘", readdirSync(join(dir, ".panel-write-backups")).some((n) => existsSync(join(dir, ".panel-write-backups", n, "preset-undo-evidence.json"))));
  const doc = runDoctor(dir);
  check(tag + " ⑤ doctor error=0 + compact-router 提示 severity≠error",
    doc.summary.error === 0 && doc.issues.filter((i) => i.category === "mount").every((i) => i.severity !== "error"));
  const presetRestore = await restore(api, "compact-router");
  const re = presetRestore.executed;
  check(tag + " ⑦ 恢复 plan+execute 均 ok", re && re.json.ok === true,
    "planned=" + JSON.stringify(presetRestore.planned.json) + " executed=" + JSON.stringify(re && re.json));
  let allReapply = true;
  for (const id of Object.keys(presetState)) if (shaFile(presetState[id].file) !== beforeShas[id]) allReapply = false;
  check(tag + " ⑦ afterReapply == beforeUndo（四预设）", allReapply);
  const r2 = await renderCase(dir);
  assertCards(tag + "·恢复后", r2, { "compact-router": "mounted" });
  check(tag + " ⑦ doctor 回 0/0/0", runDoctor(dir).summary.error === 0);
}

// ---------- A3 单删 agent-memory（软）----------
{
  const tag = "A3";
  const dir = makeCopy("a3");
  const api = makeApi(dir);
  const before = readFileSync(join(dir, "cordis.patch.yml"), "utf8");
  const libBefore = shaFile(join(dir, "lib", "agent-memory", "body.js"));
  const { planned, executed } = await uninstall(api, "agent-memory", "soft");
  check(tag + " uninstall ok", planned.json.ok === true && executed.json.ok === true);
  const r = await renderCase(dir);
  assertCards(tag, r, { "agent-memory": "soft-unmounted", "compact-router": "mounted" });
  check(tag + " ③ 本体 sha 不变", shaFile(join(dir, "lib", "agent-memory", "body.js")) === libBefore);
  check(tag + " ④ patch 无 agent-memory 行", !/- id: agent-memory-runtime/.test(readFileSync(join(dir, "cordis.patch.yml"), "utf8")));
  check(tag + " ⑤ .panel-write-backups 新增 manifest", readdirSync(join(dir, ".panel-write-backups")).length >= 1);
  const doc = runDoctor(dir);
  check(tag + " ⑥ doctor error=0 + 缺席提示非 error", doc.summary.error === 0 && doc.issues.filter((i) => i.category === "mount").every((i) => i.severity !== "error"));
  const { executed: re } = await restore(api, "agent-memory");
  check(tag + " ⑦ sha 回基线", re.json.ok === true && shaFile(join(dir, "cordis.patch.yml")) === sha(before));
  assertCards(tag + "·恢复后", await renderCase(dir), { "agent-memory": "mounted" });
}

// ---------- A4 单删 search-router（真 · 销毁式）----------
{
  const tag = "A4";
  const dir = makeCopy("a4");
  const api = makeApi(dir);
  const exec = await destroyTrue(tag, api, "search-router");
  assertDestroyHard(tag, dir, "search-router", exec);
  const after = readFileSync(join(dir, "cordis.patch.yml"), "utf8");
  check(tag + " 行块摘除（无 web-search-router 行）", !/- id: web-search-router/.test(after));
  check(tag + " 宿主键 searchProvider 已 unset", !/^    searchProvider:/m.test(after));
  check(tag + " web-search-local 未受影响（本体在 + 行在）", existsSync(join(dir, "lib", "web-search-local")) && /- id: web-search-local/.test(after));
  const r = await renderCase(dir);
  assertCards(tag, r, { "search-router": "true-uninstalled", "web-search-local": "mounted" });
  const sr = r.snap.plugins.find((p) => p.dir === "search-router");
  check(tag + " 快照：「无副本」文案逐字 + restoreAvailable=false", sr.statusCopy === "已卸载（无副本）· 重新安装后面板可挂载" && sr.restoreAvailable === false, sr.statusCopy);
  assertNoRestoreNoMount(tag, r, "search-router");
  check(tag + " 保管区清单 API 可见该收据且 mountable", (await api.custody()).json.custody.entries.some((e) => e.plugin === "search-router" && e.kind === "true-uninstall-receipt" && e.mountable === true));
  const doc = runDoctor(dir);
  const mount = doc.issues.filter((i) => i.category === "mount");
  check(tag + " doctor error=0 且无 dangling 引用", doc.summary.error === 0 && !mount.some((i) => i.id === "provider.dangling-reference"), JSON.stringify(doc.summary));
}

// ---------- A5 单删 web-search-local（真 · 销毁式）→ dependency-broken ----------
{
  const tag = "A5";
  const dir = makeCopy("a5");
  const api = makeApi(dir);
  const exec = await destroyTrue(tag, api, "web-search-local");
  assertDestroyHard(tag, dir, "web-search-local", exec);
  const after = readFileSync(join(dir, "cordis.patch.yml"), "utf8");
  check(tag + " 行块摘除 + 宿主键 fetchProvider unset", !/- id: web-search-local/.test(after) && !/^    fetchProvider:/m.test(after));
  const r = await renderCase(dir);
  const wsl = r.snap.plugins.find((p) => p.dir === "web-search-local");
  const sr = r.snap.plugins.find((p) => p.dir === "search-router");
  check(tag + " 快照：web-search-local=true-uninstalled（无副本、不可恢复）", wsl.status === "true-uninstalled" && wsl.restoreAvailable === false && wsl.canMount === false);
  check(tag + " 快照：search-router=dependency-broken 且 mounted=true", sr.status === "dependency-broken" && sr.mounted === true, sr.status);
  check(tag + " dependency-broken 文案逐字命中", sr.statusCopy === "已加载，但依赖的本地搜索未安装——搜索功能不可用", sr.statusCopy);
  assertCards(tag, r, { "web-search-local": "true-uninstalled", "search-router": "dependency-broken" });
  const doc = runDoctor(dir);
  const mount = doc.issues.filter((i) => i.category === "mount");
  check(tag + " doctor error=0 + missing-provider warning 在案", doc.summary.error === 0 && mount.some((i) => i.id === "provider.missing-provider" && i.severity === "warning"));
  check(tag + " 无 dangling provider 警告", !mount.some((i) => i.id === "provider.dangling-reference"));
}

// ---------- B1 搜索对同删（真 · 销毁式）----------
{
  const tag = "B1";
  const dir = makeCopy("b1");
  const api = makeApi(dir);
  const ea = await destroyTrue(tag + "·search-router", api, "search-router");
  const eb = await destroyTrue(tag + "·web-search-local", api, "web-search-local");
  assertDestroyHard(tag + "·search-router", dir, "search-router", ea);
  assertDestroyHard(tag + "·web-search-local", dir, "web-search-local", eb);
  check(tag + " 两收据并存（互不覆盖）", ea.custodyId !== eb.custodyId);
  const after = readFileSync(join(dir, "cordis.patch.yml"), "utf8");
  check(tag + " 两行 + 两宿主键均清",
    !/- id: web-search-router/.test(after) && !/- id: web-search-local/.test(after)
    && !/^    searchProvider:/m.test(after) && !/^    fetchProvider:/m.test(after));
  const r = await renderCase(dir);
  assertCards(tag, r, { "search-router": "true-uninstalled", "web-search-local": "true-uninstalled", "rate-throttle": "mounted", "compact-router": "mounted" });
  check(tag + " 其余 3 卡 mounted（含 compact-router，预设挂载面）",
    r.snap.plugins.filter((p) => !["search-router", "web-search-local"].includes(p.dir)).every((p) => p.status === "mounted"));
  const doc = runDoctor(dir);
  const mount = doc.issues.filter((i) => i.category === "mount");
  check(tag + " doctor error=0、无 dangling、无 missing-provider",
    doc.summary.error === 0 && !mount.some((i) => i.id === "provider.dangling-reference") && !mount.some((i) => i.id === "provider.missing-provider"), JSON.stringify(mount.map((i) => i.id)));
  assertNoRestoreNoMount(tag, r, "search-router");
}

// ---------- C1 联动全软 ----------
{
  const tag = "C1";
  const dir = makeCopy("c1", { withPresetBridge: true });
  const api = makeApi(dir);
  const before = readFileSync(join(dir, "cordis.patch.yml"), "utf8");
  for (const p of ["rate-throttle", "compact-router", "agent-memory"]) {
    const x = await uninstall(api, p, "soft");
    check(tag + " 软卸载 " + p + " ok", x.planned.json.ok === true && x.executed.json.ok === true);
  }
  const r = await renderCase(dir);
  assertCards(tag, r, { "rate-throttle": "soft-unmounted", "compact-router": "soft-unmounted", "agent-memory": "soft-unmounted", "search-router": "mounted", "web-search-local": "mounted" });
  const after = readFileSync(join(dir, "cordis.patch.yml"), "utf8");
  check(tag + " ④ patch 无 rate-throttle / agent-memory 行", !/- id: rate-throttle/.test(after) && !/- id: agent-memory-runtime/.test(after));
  const presetState = JSON.parse(readFileSync(join(dir, "preset-patch-state.json"), "utf8"));
  check(tag + " ④ 四预设均非 patched", Object.keys(presetState).every((id) => shaFile(presetState[id].file) === shaFile(presetState[id].backup)));
  check(tag + " ② 搜索两卡无 dependency-broken", r.snap.plugins.filter((p) => ["search-router", "web-search-local"].includes(p.dir)).every((p) => p.status === "mounted"));
  check(tag + " ⑤ doctor error=0 + 三缺席提示非 error", runDoctor(dir).summary.error === 0);
  for (const p of ["rate-throttle", "compact-router", "agent-memory"]) {
    const x = await restore(api, p);
    check(tag + " 恢复 " + p + " ok", !!x.executed && x.executed.json.ok === true, "planned=" + JSON.stringify(x.planned.json));
  }
  check(tag + " ⑥ sha 回基线 + 四预设回 patched", shaFile(join(dir, "cordis.patch.yml")) === sha(before) && Object.keys(presetState).every((id) => shaFile(presetState[id].file) === presetState[id].patchedSha));
  assertCards(tag + "·恢复后", await renderCase(dir), { "rate-throttle": "mounted", "compact-router": "mounted", "agent-memory": "mounted" });
  check(tag + " ⑥ doctor 回 0/0/0", runDoctor(dir).summary.error === 0);
}

// ---------- C2 极端组合（三软 + 两真·销毁式）----------
{
  const tag = "C2";
  const dir = makeCopy("c2", { withPresetBridge: true });
  const api = makeApi(dir);
  for (const p of ["rate-throttle", "compact-router", "agent-memory"]) {
    const x = await uninstall(api, p, "soft");
    check(tag + " 软卸载 " + p + " ok", x.planned.json.ok === true && x.executed.json.ok === true);
  }
  // 「开源后重新下载」的源码暂存（放**副本仓之外**——避免被 doctor 当作在案本体重复登记）
  const stash = join(work, "c2-reinstall-stash");
  cpSync(join(dir, "lib", "search-router"), join(stash, "search-router"), { recursive: true });
  cpSync(join(dir, "lib", "web-search-local"), join(stash, "web-search-local"), { recursive: true });

  const ea = await destroyTrue(tag + "·search-router", api, "search-router");
  const eb = await destroyTrue(tag + "·web-search-local", api, "web-search-local");
  assertDestroyHard(tag + "·search-router", dir, "search-router", ea);
  assertDestroyHard(tag + "·web-search-local", dir, "web-search-local", eb);

  const r = await renderCase(dir);
  assertCards(tag, r, {
    "rate-throttle": "soft-unmounted", "compact-router": "soft-unmounted", "agent-memory": "soft-unmounted",
    "search-router": "true-uninstalled", "web-search-local": "true-uninstalled",
  });
  check(tag + " 五卡全为缺席态（三软二真）",
    r.snap.plugins.filter((p) => p.status === "soft-unmounted").length === 3
    && r.snap.plugins.filter((p) => p.status === "true-uninstalled").length === 2,
    JSON.stringify(r.snap.plugins.map((p) => [p.dir, p.status])));
  const after = readFileSync(join(dir, "cordis.patch.yml"), "utf8");
  check(tag + " ④ patch 无四插件行 + :7/:8 回缺省",
    !/- id: rate-throttle/.test(after) && !/- id: agent-memory-runtime/.test(after)
    && !/- id: web-search-router/.test(after) && !/- id: web-search-local/.test(after)
    && !/^    searchProvider:/m.test(after) && !/^    fetchProvider:/m.test(after));
  const presetState = JSON.parse(readFileSync(join(dir, "preset-patch-state.json"), "utf8"));
  check(tag + " ④ 四预设均非 patched", Object.keys(presetState).every((id) => shaFile(presetState[id].file) === shaFile(presetState[id].backup)));
  const doc = runDoctor(dir);
  check(tag + " ⑤ doctor error=0（五插件缺席仅提示级）", doc.summary.error === 0 && doc.issues.filter((i) => i.category === "mount").every((i) => i.severity !== "error"), JSON.stringify(doc.summary));
  check(tag + " ⑥ 面板管理页仍可操作（/snapshot 与 /custody 均 200）", (await api.snapshot()).status === 200 && (await api.custody()).status === 200);

  // ---------- C3 三软恢复 + 两真「重装 → 挂载」（销毁式唯一恢复途径）----------
  const tag3 = "C3";
  for (const p of ["rate-throttle", "compact-router", "agent-memory"]) {
    const x = await restore(api, p);
    check(tag3 + " ① 软恢复 " + p + " RPC ok", x.planned.json.ok === true && !!x.executed && x.executed.json.ok === true, JSON.stringify(x.planned.json));
  }
  {
    const mid = readFileSync(join(dir, "cordis.patch.yml"), "utf8");
    check(tag3 + " ② 三软恢复后：三软行块已插回",
      /- id: rate-throttle/.test(mid) && /- id: agent-memory-runtime/.test(mid));
    check(tag3 + " ② 三软恢复后：两搜索仍缺席（**销毁式不可恢复**，符合语义）",
      !/- id: web-search-router/.test(mid) && !/- id: web-search-local/.test(mid)
      && !/^    searchProvider:/m.test(mid) && !/^    fetchProvider:/m.test(mid));
    check(tag3 + " ② 三软恢复后 sha ≠ 基线（两搜索未回）", shaFile(join(dir, "cordis.patch.yml")) !== BASE_SHA_EXPECT);
  }

  // 模拟重装：把源码从暂存放回 lib（= 用户开源后重新下载安装）
  cpSync(join(stash, "search-router"), join(dir, "lib", "search-router"), { recursive: true });
  cpSync(join(stash, "web-search-local"), join(dir, "lib", "web-search-local"), { recursive: true });
  const r2 = await renderCase(dir);
  const sr2 = r2.snap.plugins.find((p) => p.dir === "search-router");
  const wl2 = r2.snap.plugins.find((p) => p.dir === "web-search-local");
  check(tag3 + " ③ 重装后两搜索卡 = installed-unmounted 且 canMount=true",
    sr2.status === "installed-unmounted" && wl2.status === "installed-unmounted" && sr2.canMount === true && wl2.canMount === true,
    JSON.stringify([sr2.status, wl2.status, sr2.canMount, wl2.canMount]));
  check(tag3 + " ③ 两渲染器均出现「挂载（重装后）」入口",
    reactR.p24Of(r2.byDir("search-router")) !== null
    && htmlR.p24SectionHtml(r2.snap.plugins.find((p) => p.dir === "search-router")).includes("挂载（重装后）"));

  // 挂载走真实 /mount API（复用插回算子 + 宿主键回写）
  for (const p of ["search-router", "web-search-local"]) {
    const mp = await api.call("/api/toolkit-panel/mount/plan", { method: "POST", body: { plugin: p } });
    check(tag3 + " ④ mount/plan(" + p + ") 200 + ok", mp.status === 200 && mp.json.ok === true, JSON.stringify(mp.json));
    const me = await api.call("/api/toolkit-panel/mount/execute", { method: "POST", body: { token: mp.json.plan.token } });
    check(tag3 + " ④ mount/execute(" + p + ") ok", me.status === 200 && me.json.ok === true, JSON.stringify(me.json));
  }
  const c3After = readFileSync(join(dir, "cordis.patch.yml"), "utf8");
  check(tag3 + " ⑤ 两搜索挂载后 sha 回基线（字节级）", shaFile(join(dir, "cordis.patch.yml")) === BASE_SHA_EXPECT,
    firstDiff("patch", readFileSync(patchPath, "utf8"), c3After));
  check(tag3 + " ⑤ 宿主键 :7 searchProvider 回原值", /^    searchProvider: auto-search/m.test(c3After));
  check(tag3 + " ⑤ 宿主键 :8 fetchProvider 回原值", /^    fetchProvider: local-fetch/m.test(c3After));
  const r3 = await renderCase(dir);
  assertCards(tag3 + "·全恢复后", r3, {
    "rate-throttle": "mounted", "agent-memory": "mounted", "compact-router": "mounted", "search-router": "mounted", "web-search-local": "mounted",
  });
  check(tag3 + " ⑥ doctor 0/0/0", (() => { const d = runDoctor(dir); return d.summary.error === 0 && d.summary.warning === 0 && d.summary.info === 0; })(), (() => { const d = runDoctor(dir); return JSON.stringify(d.summary) + " issues=" + JSON.stringify(d.issues.map((i) => [i.id || i.category, i.severity, i.message, i.file])); })());
  check(tag3 + " ⑥ 四预设回 patched", Object.keys(presetState).every((id) => shaFile(presetState[id].file) === presetState[id].patchedSha));
  check(tag3 + " ⑥ 收据仍保留（对账账本不清档）", existsSync(join(dir, ".panel-custody", ea.custodyId, "manifest.json")) && existsSync(join(dir, ".panel-custody", eb.custodyId, "manifest.json")));
  check(tag3 + " ⑥ 挂载后真卸载态卡片回 mounted，无 dependency-broken", r3.snap.plugins.every((p) => p.status === "mounted"));
  const p24El = reactR.p24Of(r3.byDir("rate-throttle"));
  check(tag3 + " p24Controls 仍在（软/真卸载入口可见）", !!p24El && reactR.hasUninstallButtons(p24El) === true);
}

// ════════════════════════════════════════════════════════════
// 5.5 批 2 操作台/双回滚矩阵（设计稿 p24-design-batch2-console.md §7 D1–D10）
// ════════════════════════════════════════════════════════════
section("批2 操作台/双回滚（D 段）");
{
  const rendererHtml = readFileSync(join(root, "panel", "client", "panel.html"), "utf8");
  const rendererReact = readFileSync(join(root, "panel", "client", "index.js"), "utf8");

  // ---------- D1 别名修正往返（doctor 域 apply → rollback，经面板两步） ----------
  const dirD1 = makeCopy("doc-d1");
  const apiD1 = makeApi(dirD1);
  // 造 fixable：套件 manifest 加 aliases 表（旧名→新名），把旧名写进 doctor-signals.json（scope 扫描面）
  const suiteManifest = JSON.parse(readFileSync(join(dirD1, "dsh.plugin.json"), "utf8"));
  suiteManifest.aliases = Object.assign({}, suiteManifest.aliases, { "@local/dsh-compact-router": "@local/dsh-toolkit/compact-router" });
  writeFileSync(join(dirD1, "dsh.plugin.json"), JSON.stringify(suiteManifest, null, 2) + "\n", "utf8");
  const signalsPath = join(dirD1, "doctor-signals.json");
  const signalsOriginal = readFileSync(signalsPath, "utf8");
  const signalsModified = signalsOriginal.replace(/\}\s*$/, "  ,\"_legacyNote\": \"migrated from @local/dsh-compact-router\"\n}\n");
  writeFileSync(signalsPath, signalsModified, "utf8");
  const doc0 = runDoctor(dirD1);
  check("D1 前置：夹具触发 ref.unresolvable-local（fixable=rewrite）", doc0.issues.some((i) => i.id === "ref.unresolvable-local" && i.fix.class === "rewrite" && i.fix.plan.length > 0), JSON.stringify(doc0.summary));
  const planRes = await apiD1.doctorApplyPlan("ref.unresolvable-local");
  check("D1 plan：ok + steps[0]=replace", planRes.json && planRes.json.ok && planRes.json.plan.steps[0].op === "replace", JSON.stringify(planRes.json && planRes.json.error));
  check("D1 plan：确认页要素齐（做什么/影响面/回滚/失败表现/确认操作）", planRes.json.plan && typeof planRes.json.plan.message === "string" && Array.isArray(planRes.json.plan.steps));
  const exRes = await apiD1.doctorApplyExecute(planRes.json.plan.token);
  check("D1 execute：applied + 有备份根", exRes.json && exRes.json.ok && exRes.json.applied === true && !!exRes.json.backupRoot, JSON.stringify(exRes.json && exRes.json.error));
  check("D1 execute：目标文件已修正为 新名", !readFileSync(signalsPath, "utf8").includes("@local/dsh-compact-router"), "");
  check("D1 execute：rescan 回 0 error", exRes.json.rescan && exRes.json.rescan.error === 0, JSON.stringify(exRes.json.rescan));
  const st1 = await apiD1.doctorStates();
  check("D1 states：记 1 条 apply（files=1）", st1.json.ok && st1.json.states.length === 1 && st1.json.states[0].action === "apply" && st1.json.states[0].files === 1, JSON.stringify(st1.json.states));
  const rbPlan = await apiD1.doctorRollbackPlan(st1.json.states[0].stamp);
  check("D1 rollback plan：ok", rbPlan.json && rbPlan.json.ok, JSON.stringify(rbPlan.json && rbPlan.json.error));
  const rbEx = await apiD1.doctorRollbackExecute(rbPlan.json.plan.token);
  // 回滚语义 = 复原到「apply 前」字节（含夹具注入的 _legacyNote），非更早的原始态
  check("D1 rollback execute：ok + 字节级复原（apply 前态）", rbEx.json && rbEx.json.ok && readFileSync(signalsPath, "utf8") === signalsModified, JSON.stringify(rbEx.json && rbEx.json.error));
  const st2 = await apiD1.doctorStates();
  check("D1 states：apply+rollback 两条", st2.json.ok && st2.json.states.length === 2 && st2.json.states[1].action === "rollback", JSON.stringify(st2.json.states.map((s) => s.action)));
  // id 白名单与未找到（面板侧复刻 CLI 语义）
  const badId = await apiD1.doctorApplyPlan("bad/id;rm");
  check("D1 非法 id ⇒ issue-id-invalid", badId.json && badId.json.ok === false && badId.json.code === "issue-id-invalid", JSON.stringify(badId.json));
  const noId = await apiD1.doctorApplyPlan("no.such.issue");
  check("D1 未找到 ⇒ issue-not-found", noId.json && noId.json.ok === false && noId.json.code === "issue-not-found", JSON.stringify(noId.json));

  // ---------- D2 补装包往返（file: 本地源） ----------
  const dirD2 = makeCopy("doc-d2");
  const apiD2 = makeApi(dirD2);
  const rtManifestPath = join(dirD2, "lib", "rate-throttle", "dsh.plugin.json");
  const rtManifest = JSON.parse(readFileSync(rtManifestPath, "utf8"));
  rtManifest.requirements = rtManifest.requirements || {};
  rtManifest.requirements.packages = Object.assign({}, rtManifest.requirements.packages, { "@local/dsh-fake": { "$from": "package.json#dependencies" } });
  writeFileSync(rtManifestPath, JSON.stringify(rtManifest, null, 2) + "\n", "utf8");
  const rootPkgPath = join(dirD2, "package.json");
  const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf8"));
  rootPkg.dependencies = Object.assign({}, rootPkg.dependencies, { "@local/dsh-fake": "file:./vendor/fake-pkg" });
  writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + "\n", "utf8");
  mkdirSync(join(dirD2, "vendor", "fake-pkg"), { recursive: true });
  writeFileSync(join(dirD2, "vendor", "fake-pkg", "package.json"), JSON.stringify({ name: "@local/dsh-fake", version: "1.0.0", main: "index.js" }, null, 2) + "\n", "utf8");
  writeFileSync(join(dirD2, "vendor", "fake-pkg", "index.js"), "// fake\n", "utf8");
  const docD2 = runDoctor(dirD2);
  check("D2 前置：pkg.missing-dependency fixable", docD2.issues.some((i) => i.id === "pkg.missing-dependency" && i.fix.class === "rewrite"), JSON.stringify(docD2.issues.filter((i) => i.id === "pkg.missing-dependency").map((i) => i.message)));
  const planD2 = await apiD2.doctorApplyPlan("pkg.missing-dependency");
  check("D2 plan：extra 带本地源/版本/范围", planD2.json && planD2.json.ok && planD2.json.plan.extra && planD2.json.plan.extra.source && planD2.json.plan.extra.version === "1.0.0" && planD2.json.plan.extra.range === "file:./vendor/fake-pkg", JSON.stringify(planD2.json && planD2.json.error));
  const exD2 = await apiD2.doctorApplyExecute(planD2.json.plan.token);
  check("D2 execute：包已装到 scope node_modules", exD2.json && exD2.json.ok === true && existsSync(join(dirD2, "node_modules", "@local", "dsh-fake", "package.json")), JSON.stringify(exD2.json && exD2.json.error));
  const stD2 = await apiD2.doctorStates();
  check("D2 states：apply 记 packages=1", stD2.json.ok && stD2.json.states.some((s) => s.action === "apply" && s.packages === 1), JSON.stringify(stD2.json.states));
  const rbD2 = await apiD2.doctorRollbackPlan(stD2.json.states.find((s) => s.action === "apply").stamp);
  const rbD2x = await apiD2.doctorRollbackExecute(rbD2.json.plan.token);
  check("D2 rollback：安装目录已移除", rbD2x.json && rbD2x.json.ok && !existsSync(join(dirD2, "node_modules", "@local", "dsh-fake")), JSON.stringify(rbD2x.json && rbD2x.json.error));

  // ---------- D3 无源拒装（面板 plan 即拒，人话如实告知） ----------
  const dirD3 = makeCopy("doc-d3");
  const apiD3 = makeApi(dirD3);
  const rt3 = JSON.parse(readFileSync(join(dirD3, "lib", "rate-throttle", "dsh.plugin.json"), "utf8"));
  rt3.requirements = rt3.requirements || {};
  rt3.requirements.packages = Object.assign({}, rt3.requirements.packages, { "@local/dsh-nosource": { "$from": "package.json#dependencies" } });
  writeFileSync(join(dirD3, "lib", "rate-throttle", "dsh.plugin.json"), JSON.stringify(rt3, null, 2) + "\n", "utf8");
  const pkg3 = JSON.parse(readFileSync(join(dirD3, "package.json"), "utf8"));
  pkg3.dependencies = Object.assign({}, pkg3.dependencies, { "@local/dsh-nosource": "^9.9.9" });
  writeFileSync(join(dirD3, "package.json"), JSON.stringify(pkg3, null, 2) + "\n", "utf8");
  check("D3 前置：missing-dependency 在案", runDoctor(dirD3).issues.some((i) => i.id === "pkg.missing-dependency"), "");
  const planD3 = await apiD3.doctorApplyPlan("pkg.missing-dependency");
  check("D3 无 file: 源 ⇒ plan 拒（issue-not-executable + 不联网人话）", planD3.json && planD3.json.ok === false && planD3.json.code === "issue-not-executable" && String(planD3.json.error).includes("不会联网下载"), JSON.stringify(planD3.json));

  // ---------- D4 protected/id 白名单（CLI 层由 doctor 仓自测覆盖：run-tests-d1 + 既有 protected 负向） ----------
  check("D4 面板侧：issueId 白名单拦截（跨线佐证：CLI protected 断言见 doctor 仓 run-tests-d1/既有负向）", (await apiD3.doctorApplyPlan("../escape")).json.code === "issue-id-invalid", "");

  // ---------- D5 锚点漂移：plan 后篡改目标 ⇒ step 失败零写入 ----------
  const dirD5 = makeCopy("doc-d5");
  const apiD5 = makeApi(dirD5);
  const suiteM5 = JSON.parse(readFileSync(join(dirD5, "dsh.plugin.json"), "utf8"));
  suiteM5.aliases = Object.assign({}, suiteM5.aliases, { "@local/dsh-compact-router": "@local/dsh-toolkit/compact-router" });
  writeFileSync(join(dirD5, "dsh.plugin.json"), JSON.stringify(suiteM5, null, 2) + "\n", "utf8");
  const sig5 = join(dirD5, "doctor-signals.json");
  writeFileSync(sig5, readFileSync(sig5, "utf8").replace(/\}\s*$/, "  ,\"_legacyNote\": \"stale @local/dsh-compact-router\"\n}\n"), "utf8");
  const planD5 = await apiD5.doctorApplyPlan("ref.unresolvable-local");
  // 篡改 = 把锚点整个移走（出现次数 0 < occurrence 1 ⇒ ANCHOR_DRIFT，而非改位次）
  const tampered = readFileSync(sig5, "utf8").replace("stale @local/dsh-compact-router", "stale (name removed)");
  writeFileSync(sig5, tampered, "utf8");
  const exD5 = await apiD5.doctorApplyExecute(planD5.json.plan.token);
  // 面板流语义：篡改让引用消失 ⇒ CLI fresh dry-run 直接 issue-not-found（404，比 ANCHOR_DRIFT
  // 更前置的防错位闸）；纯位次漂移触发的 ANCHOR_DRIFT 由 doctor 仓 run-tests.mjs 既有负向覆盖。
  check("D5 篡改移除锚点 ⇒ issue-not-found（CLI fresh 闸）", exD5.json && exD5.json.ok === false && exD5.json.code === "issue-not-found", JSON.stringify(exD5.json));
  check("D5 失败后零写入（文件保持篡改态，无部分改写）", readFileSync(sig5, "utf8") === tampered, "");

  // ---------- D6 配置快照恢复往返（D3 restoreSnapshot 经面板两步） ----------
  const dirD6 = makeCopy("doc-d6");
  const apiD6 = makeApi(dirD6);
  const base6 = readFileSync(join(dirD6, "cordis.patch.yml"), "utf8");
  const un6 = await uninstall(apiD6, "rate-throttle", "soft");
  check("D6 前置：软卸载成功", un6.executed && un6.executed.json.ok, JSON.stringify(un6.executed && un6.executed.json.error));
  const snaps6 = (await apiD6.doctorStates()).json.snapshots;
  check("D6 快照列表 ≥1（写前备份链）", snaps6.length >= 1, JSON.stringify(snaps6.length));
  const plan6 = await apiD6.snapshotRestorePlan(snaps6[0].stamp);
  check("D6 plan：diff 两行（删/增全文）+ nextSha", plan6.json && plan6.json.ok && Array.isArray(plan6.json.plan.diff) && plan6.json.plan.diff.length === 2, JSON.stringify(plan6.json && plan6.json.error));
  const ex6 = await apiD6.snapshotRestoreExecute(plan6.json.plan.token);
  check("D6 execute：patch 字节级回该快照（= 卸载前基线）", ex6.json && ex6.json.ok && readFileSync(join(dirD6, "cordis.patch.yml"), "utf8") === base6, firstDiff("D6", base6, readFileSync(join(dirD6, "cordis.patch.yml"), "utf8")));
  const snaps6b = (await apiD6.doctorStates()).json.snapshots;
  check("D6 恢复自身再留快照（可再回滚）", snaps6b.length === snaps6.length + 1, JSON.stringify(snaps6b.length));
  const dup6 = await apiD6.snapshotRestorePlan(snaps6[0].stamp);
  check("D6 快照=当前 ⇒ snapshot-identical", dup6.json && dup6.json.ok === false && dup6.json.code === "snapshot-identical", JSON.stringify(dup6.json));

  // ---------- D7 体检回滚空态 / 坏态 ----------
  const dirD7 = makeCopy("doc-d7");
  const apiD7 = makeApi(dirD7);
  const empty7 = await apiD7.doctorStates();
  check("D7 空态：states=[] 且快照 0", empty7.json.ok && empty7.json.states.length === 0 && empty7.json.snapshots.length === 0, JSON.stringify(empty7.json));
  writeFileSync(join(dirD7, "doctor-config", "doctor-patch-state.json"), "{ broken", "utf8");
  const bad7 = await apiD7.doctorStates();
  check("D7 坏态：degraded（不假装可用）", bad7.json.ok === false && bad7.json.degraded === true, JSON.stringify(bad7.json));

  // ---------- D8 禁用/降级 渲染断言（两渲染器逐字，叠加 8.3 规则：环节在产品面） ----------
  const uiD8 = await (makeApi(makeCopy("doc-d8")).ui());
  const uiText = uiD8.raw;
  const reactText = readFileSync(join(root, "panel", "client", "index.js"), "utf8");
  check("D8 内联渲染器：操作台空态句在产品面（回滚/快照/收据三句）", uiText.includes(CONSOLE_EMPTY_ROLLBACK) && uiText.includes(CONSOLE_EMPTY_SNAPSHOT) && uiText.includes(CONSOLE_EMPTY_RECEIPTS), "");
  check("D8 React 渲染器：操作台空态句在产品面", reactText.includes(CONSOLE_EMPTY_ROLLBACK) && reactText.includes(CONSOLE_EMPTY_SNAPSHOT) && reactText.includes(CONSOLE_EMPTY_RECEIPTS), "");
  check("D8 两渲染器：收据定位句逐字一致", reactText.includes(CONSOLE_RECEIPT_NOTE) && uiText.includes(CONSOLE_RECEIPT_NOTE), "");
  check("D8 面板 h2：体检与操作台（内联）", uiText.includes("体检与操作台"), "");

  // ---------- D9 真实 ~/.dsh doctor 三件套零触碰（收尾还有真实仓 custody 守卫） ----------
  check("D9 真实 ~/.dsh 无 doctor-patch-state.json / doctor-backups / doctor-apply.lock", ["doctor-patch-state.json", "doctor-backups", "doctor-apply.lock"].every((n) => !existsSync(join("C:", "Users", "LENOVO", ".dsh", n))), "");

  // ---------- D10 删除原因输入（§3.6a：选填/200 截断/null，两渲染器逐字在产品面） ----------
  const dirD10 = makeCopy("doc-d10");
  const apiD10 = makeApi(dirD10);
  const longReason = "很长的原因很长的原因".repeat(30).slice(0, 250);
  const unR = await uninstall(apiD10, "rate-throttle", "true", longReason);
  check("D10 真卸载（带原因）成功", unR.executed && unR.executed.json.ok, JSON.stringify(unR.executed && unR.executed.json.error));
  const rec10 = (await apiD10.custody()).json.custody.entries[0];
  check("D10 收据 userReason 截到 200 字", rec10 && rec10.userReason && rec10.userReason.length === 200, String(rec10 && rec10.userReason ? rec10.userReason.length : rec10 && rec10.userReason));
  const unN = await uninstall(apiD10, "search-router", "true");
  check("D10 真卸载（不填原因）成功", unN.executed && unN.executed.json.ok, JSON.stringify(unN.executed && unN.executed.json.error));
  const rec10b = (await apiD10.custody()).json.custody.entries;
  const reasonB = rec10b.find((e) => e.plugin === "search-router");
  check("D10 不填 ⇒ 收据 userReason=null（对账段显示规则=「（未填写）」由 UI 层实现）", reasonB && reasonB.userReason === null, JSON.stringify(reasonB));
  check("D10 两渲染器：原因段逐字在产品面（段标题/说明/占位/上限）",
    reactText.includes("删除原因（可不填）") && reactText.includes("可选：写一句话，最多 200 字") && reactText.includes("不填也可以，收据会如实记「（未填写）」")
    && rendererHtml.includes("删除原因（可不填）") && rendererHtml.includes("可选：写一句话，最多 200 字") && rendererHtml.includes("不填也可以，收据会如实记「（未填写）」"), "");
  check("D10 两渲染器：请求体带 reason（环节在产品面，非仅 schema）", reactText.includes("planPayload.reason") && rendererHtml.includes("planPayload.reason"), "");
  check("D10 两渲染器：三句必含仍逐字在产品面（回归位）", reactText.includes("⚠ 本次是彻底删除，面板不会留下任何副本") && rendererHtml.includes("⚠ 本次是彻底删除，面板不会留下任何副本"), "");
}

// ════════════════════════════════════════════════════════════
// 6. 收尾：真实仓零写入自证
// ════════════════════════════════════════════════════════════
section("收尾");
check("真实 cordis.patch.yml 全程零写入（基准 a663f61b… 不变）", sha(readFileSync(patchPath, "utf8")) === BASE_SHA, sha(readFileSync(patchPath, "utf8")).slice(0, 12));
// 守卫口径（Q1' 修正，L-059）：放行「面板运行期合法的长期落痕」，只拦本矩阵**新增**产物。
//   soft-uninstalls.json —— 软卸载台账（面板发起）
//   row-adjacency.json    —— 行块邻接留痕（D-UI-05 长期证据，与清账解耦、只增不减）
// 此前白名单只列 soft-uninstalls.json，用户真机操作产生 row-adjacency.json 后误报（真机验收抓到
// 的覆盖盲区）。批 2 候选改进：改为「矩阵运行前后快照 diff」以根治同类白名单遗漏。
const RUNTIME_ARTIFACTS = new Set(["soft-uninstalls.json", "row-adjacency.json"]);
check("真实仓 .panel-custody 无矩阵新增产物（放行运行期落痕 soft-uninstalls/row-adjacency）", !existsSync(join(root, ".panel-custody")) || readdirSync(join(root, ".panel-custody")).filter((n) => !RUNTIME_ARTIFACTS.has(n)).length === 0);
rmSync(work, { recursive: true, force: true });

console.log("\n════════════════════════════════");
console.log("RESULT passed=" + pass + " failed=" + fails.length);
if (fails.length > 0) {
  for (const f of fails) console.log("  ✗ " + f);
  process.exit(1);
}
console.log("ALL PASS");
