#!/usr/bin/env node
// P2.2 UI 全卡覆盖 —— 把 5 张卡**分别**喂给两套真实渲染器，逐卡断言。
//
// 为什么单独一个文件：p22-verify 证的是引擎与服务端；而「面板有 5 张卡、
// 只证过 1 张 toggle」这个缺口属于**呈现层**，必须用真实的渲染代码跑出来，
// 不能靠读源码推断。
//
// 两套渲染器都是**真跑**，不是文本匹配：
//   1) client/index.js  —— 捕获 ModuleLoader 工厂 → 假 react → 调 apply 拿到组件 →
//      渲染 → 从元素树里取出 PluginCard / ToggleControls 并调用 → 收集文本
//   2) client/panel.html —— 抽出内联 <script> → 假 document/fetch → 直接调
//      toggleHtml() / stateOf() / renderConfirm()
//
// 全程只读，不碰任何真实文件。
import { readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const snapMod = await import(new URL("../panel/manager/snapshot.mjs", import.meta.url).href);

let passed = 0;
let failed = 0;
function check(label, ok, detail) {
  if (ok) { passed += 1; console.log("PASS " + label + (detail ? " — " + detail : "")); }
  else { failed += 1; console.log("FAIL " + label + (detail ? " — " + detail : "")); }
}

const snap = await snapMod.buildSnapshot({ toolkitRoot: root });
const PATCH_TEXT = snap.patch.text;

// ============================================================
// 渲染器 1：client/index.js（真实 React bundle）
// ============================================================

/** 从元素树里收集全部文本。 */
function textOf(node, out = []) {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const c of node) textOf(c, out); return out; }
  if (node.children) textOf(node.children, out);
  return out;
}
/** 从元素树里找出全部满足条件的节点。 */
function findAll(node, pred, out = []) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) { for (const c of node) findAll(c, pred, out); return out; }
  if (pred(node)) out.push(node);
  if (node.children) findAll(node.children, pred, out);
  return out;
}

function loadReactClient() {
  const src = readFileSync(join(root, "panel", "client", "index.js"), "utf8");
  let factory = null;
  const fakeWindow = { __ModuleLoader__: { load: (opts) => { factory = opts.factory; } } };
  new Function("window", src)(fakeWindow);          // 执行 bundle，捕获 factory
  if (!factory) throw new Error("bundle 没有调用 window.__ModuleLoader__.load");

  // ---- 假 react：只够这个组件用 ----
  let useStateIndex = 0;
  let snapshotOverride = null;
  let patchTextOverride = null;
  let firstStateOverride = "__UNSET__";
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat() }),
    useState: (init) => {
      const i = useStateIndex++;
      if (i === 0 && snapshotOverride) return [snapshotOverride, () => {}];
      if (i === 2) return [patchTextOverride || PATCH_TEXT, () => {}];     // patchText
      if (i >= 6 && firstStateOverride !== "__UNSET__") return [firstStateOverride, () => {}];
      return [init, () => {}];
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
  // bundle 的 factory 直接 return module.exports（不是 { exports } 包装）
  const api = mod && mod.apply ? mod : (mod && mod.exports);
  if (!api || typeof api.apply !== "function") throw new Error("factory 没有导出 apply()");

  let captured = null;
  api.apply({
    slots: {
      inject: (name, cb) => { cb(); },
      register: (meta, comp) => { captured = comp; return () => {}; },
    },
  });
  if (!captured) throw new Error("apply() 没有注册面板组件");

  return {
    panelName: captured.name,
    /** 渲染整页，返回元素树。 */
    render: (snapOverride, patchText) => {
      useStateIndex = 0;
      snapshotOverride = snapOverride || snap;
      patchTextOverride = patchText || null;
      return captured();
    },
    /** 从整页树里取出每张卡的 PluginCard 元素。 */
    cardsOf: (tree) => findAll(tree, (n) => typeof n.type === "function" && n.type.name === "PluginCard"),
    /**
     * 调用 PluginCard → 取其 ToggleControls 的**渲染结果**。
     *
     * 注意：`createElement(ToggleControls, …)` 只是把组件**按引用**放进树，
     * 组件体并不会被调用（真实 React 才负责调用它）。所以这里必须自己调一次：
     * compact-router 正是靠 `ToggleControls` 返回 null 来"不渲染开关"的 ——
     * 只看元素是否存在会误判成"有开关"。
     */
    toggleOf: (cardEl) => {
      const sub = cardEl.type(cardEl.props);
      const hits = findAll(sub, (n) => typeof n.type === "function" && n.type.name === "ToggleControls");
      if (!hits[0]) return null;
      const rendered = hits[0].type(hits[0].props);
      return rendered === null || rendered === undefined || rendered === false ? null : hits[0];
    },
    /**
     * 取状态行标签。StateRow 同样只是被放进树，没被调用，
     * 所以标签要从它的 props 里读，而不是从文本里找。
     */
    stateLabelOf: (cardEl) => {
      const sub = cardEl.type(cardEl.props);
      const hit = findAll(sub, (n) => typeof n.type === "function" && n.type.name === "StateRow")[0];
      return hit ? hit.props.state.label : null;
    },
    /** 用一份伪造的 plan 渲染 ToggleControls，拿到确认页文本。 */
    confirmTextOf: (toggleEl, plan) => {
      useStateIndex = 6;                 // 让 ToggleControls 的 pending 首次 useState 命中覆盖值
      firstStateOverride = plan;
      const tree = toggleEl.type(toggleEl.props);
      useStateIndex = 0;
      firstStateOverride = "__UNSET__";
      return textOf(tree).join(" ");
    },
    /** 调用 PluginCard 取整卡文本（用于确认页等）。 */
    cardText: (cardEl) => textOf(cardEl.type(cardEl.props)).join(" "),
  };
}

// ============================================================
// 渲染器 2：client/panel.html（直连后备页）
// ============================================================
function loadHtmlClient() {
  const html = readFileSync(join(root, "panel", "client", "panel.html"), "utf8");
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  if (!m) throw new Error("panel.html 里找不到内联 script");
  const node = (id) => ({ id, textContent: "", innerHTML: "", addEventListener: () => {}, appendChild: () => {}, querySelector: () => null, className: "" });
  const fakeDoc = { getElementById: (id) => node(id), createElement: (t) => node(t) };
  const fn = new Function(
    "document", "fetch",
    m[1] + "\nreturn { toggleHtml, stateOf, renderConfirm, setPatch: (t) => { PATCH_TEXT = t; }, dualSwitchNotice };",
  );
  return fn(fakeDoc, () => new Promise(() => {}));
}

const reactR = loadReactClient();
const htmlR = loadHtmlClient();
htmlR.setPatch(PATCH_TEXT);

check("react renderer: component captured from apply()", reactR.panelName === "ToolkitPanel", reactR.panelName);
check("html renderer: inline script evaluated and toggleHtml reachable", typeof htmlR.toggleHtml === "function");

// ============================================================
// A. 逐卡：toggle 该不该出现 + 两层是否分立
// ============================================================
const EXPECT = [
  { dir: "agent-memory", toggle: true, layer2: "该插件没有内部开关" },
  { dir: "compact-router", toggle: false, layer2: null },
  { dir: "rate-throttle", toggle: true, layer2: "关闭" },
  { dir: "search-router", toggle: true, layer2: "该插件没有内部开关" },
  { dir: "web-search-local", toggle: true, layer2: "该插件没有内部开关" },
];

const tree = reactR.render(snap);
const cards = reactR.cardsOf(tree);
check("react renderer: every plugin produced a card (5)", cards.length === 5, "cards=" + cards.length);
check("react renderer: card order matches snapshot.plugins", cards.every((c, i) => c.props.plugin.dir === snap.plugins[i].dir));

for (const exp of EXPECT) {
  const cardEl = cards.find((c) => c.props.plugin.dir === exp.dir);
  check("[" + exp.dir + "] card exists", !!cardEl);

  // ---- react ----
  const tEl = cardEl ? reactR.toggleOf(cardEl) : null;
  check("[" + exp.dir + "] react: toggle UI present == " + exp.toggle, !!tEl === exp.toggle);
  if (exp.toggle && tEl) {
    const txt = textOf(tEl.type(tEl.props)).join(" ");
    check("[" + exp.dir + "] react: shows BOTH layer labels separately",
      txt.includes("第一层 · 配置文件（patch-row.disabled）") && txt.includes("第二层 · 插件内部（config.enabled）"));
    check("[" + exp.dir + "] react: layer-2 reads「" + exp.layer2 + "」", txt.includes(exp.layer2), txt.slice(0, 0) || undefined);
    check("[" + exp.dir + "] react: layer-1 reads「已加载」（真实文件里該行为启用）", txt.includes("已加载"));
  }

  // ---- html ----
  const p = snap.plugins.find((x) => x.dir === exp.dir);
  const html = htmlR.toggleHtml(p);
  check("[" + exp.dir + "] html: toggle UI present == " + exp.toggle, (html.length > 0) === exp.toggle);
  if (exp.toggle) {
    check("[" + exp.dir + "] html: shows BOTH layer labels separately",
      html.includes("第一层 · 配置文件（patch-row.disabled）") && html.includes("第二层 · 插件内部（config.enabled）"));
    check("[" + exp.dir + "] html: layer-2 reads「" + exp.layer2 + "」", html.includes(exp.layer2));
  }
}

// 不得有任何一个渲染器把两层合并成一个值
check("react renderer: never emits a merged layer value",
  !cards.some((c) => { const t = reactR.toggleOf(c); return t && /layer\s*[:=]\s*["']merged/.test(textOf(t.type(t.props)).join(" ")); }));

// ============================================================
// B. 层间真值表（Q2）：两套渲染器对 (层1, 层2) 四种组合的判定
// ============================================================
const base = snap.plugins.find((x) => x.dir === "rate-throttle");
const combo = (rowEnabled, cfgEnabled, expr) => {
  const cfg = Object.assign({}, base.patchRow.config);
  if (cfgEnabled === "__absent__") delete cfg.enabled;   // 真正没有内部开关的插件
  else cfg.enabled = cfgEnabled;
  return {
    dir: "rate-throttle",
    name: base.name,
    origin: base.origin,
    registers: base.registers,
    managedBy: base.managedBy,
    enabled: rowEnabled,
    patchRow: Object.assign({}, base.patchRow, { enabled: rowEnabled, disabledExpr: expr || null, config: cfg }),
  };
};
// fixture 自检：三种构造都必须真的成立，否则后面的真值表没有意义
if (combo(true, "true").patchRow.config.enabled !== "true") throw new Error("fixture 构造失败：enabled 未设为 'true'");
if ("enabled" in combo(true, "__absent__").patchRow.config) throw new Error("fixture 构造失败：__absent__ 仍有 enabled 键");

// "无内部开关" 的用例还需要**原文也一致** —— client 在服务端值缺失时会回退到
// 从 patch 原文按缩进自算（防御性回退），若原文仍留着 `enabled: false`，
// 回退就会把它算出来，用例就不成立了。
const PATCH_NO_INNER = PATCH_TEXT
  .replace(/\r\n/g, "\n")
  .replace("        enabled: false\n        throttleProviders: []", "        throttleProviders: []");
if (PATCH_NO_INNER.includes("        enabled: false\n        throttleProviders")) {
  throw new Error("fixture 构造失败：没能把 rate-throttle 的 config.enabled 从原文里去掉");
}

const TABLE = [
  { row: true, cfg: "true", expect: "运行中 · 正在生效", why: "两层都开" },
  { row: true, cfg: "false", expect: "已加载 · 功能开关关闭，暂不生效", why: "层1开、层2关" },
  { row: true, cfg: "__absent__", expect: "运行中 · 正在生效", why: "层1开、无内部开关", patch: PATCH_NO_INNER },
  { row: false, cfg: "true", expect: "配置层停用 · 未加载", why: "层1关（层2取值不再相关）" },
  { row: false, cfg: "false", expect: "配置层停用 · 未加载", why: "两层都关" },
  { row: true, cfg: "false", expr: "!!js process.platform === 'win32'", expect: "配置层是条件开关 · 实际是否加载取决于该表达式，面板不解释", why: "条件表达式：面板不解释" },
];

for (const row of TABLE) {
  const plug = combo(row.row, row.cfg, row.expr);
  const patchForCase = row.patch || PATCH_TEXT;
  // html
  htmlR.setPatch(patchForCase);
  const htmlState = htmlR.stateOf(plug);
  check("truth-table html [" + row.why + "] → " + row.expect, htmlState.label === row.expect, htmlState.label);
  // react：渲染这张卡，读 StateRow 的 props.state.label
  const t2 = reactR.render(
    { plugins: [plug], patch: snap.patch, self: snap.self, toolkitName: "x", toolkitVersion: "0" },
    patchForCase,
  );
  const oneCard = reactR.cardsOf(t2)[0];
  const label = oneCard ? reactR.stateLabelOf(oneCard) : null;
  check("truth-table react [" + row.why + "] → " + row.expect, label === row.expect, String(label));
}
htmlR.setPatch(PATCH_TEXT);

// ============================================================
// C. 确认页元数据 + 两句人话（本轮 UI 小补丁）
// ============================================================
const planFixture = {
  token: "0".repeat(32),
  kind: "toggle",
  file: "D:\\dsh-plugins\\dsh-toolkit\\cordis.patch.yml",
  rowId: "rate-throttle",
  layer: "patch-row.disabled",
  targetEnabled: false,
  anchorLine: 14,
  diff: ["+       disabled: true"],
  crossRefs: [],
  expectedSha: "a".repeat(64),
  expiresAt: new Date(Date.now() + 60000).toISOString(),
};
const planFixtureOn = Object.assign({}, planFixture, { targetEnabled: true, diff: ["-       disabled: true", "+       disabled: false"] });

const rateEl = cards.find((c) => c.props.plugin.dir === "rate-throttle");
const rateToggle = rateEl ? reactR.toggleOf(rateEl) : null;

for (const [label, plan, effectSentence] of [
  ["停用", planFixture, "执行后此插件将于下次重启时停用（当前仍运行）。"],
  ["启用", planFixtureOn, "执行后此插件将于下次重启时启用（当前未加载的不会立刻加载）。"],
]) {
  // react
  const txt = rateToggle ? reactR.confirmTextOf(rateToggle, plan) : "";
  check("confirm react [" + label + "]: keeps ① file / ② line / ③ diff",
    txt.includes("目标文件") && txt.includes("改动位置") && txt.includes("disabled: true"));
  check("confirm react [" + label + "]: adds the 生效时机 sentence", txt.includes(effectSentence), effectSentence);
  check("confirm react [" + label + "]: explains what disabled: true means",
    txt.includes("disabled: true") && txt.includes("下次启动时跳过加载") && txt.includes("要重启才会生效"));

  // html
  const host = { innerHTML: "", querySelector: () => ({ onclick: null, disabled: false }) };
  htmlR.renderConfirm(host, {}, { _plan: plan });
  const h = host.innerHTML;
  check("confirm html [" + label + "]: keeps ① file / ② line / ③ diff",
    h.includes("目标文件") && h.includes("改动位置") && h.includes("diffPre"));
  check("confirm html [" + label + "]: adds the 生效时机 sentence", h.includes(effectSentence));
  check("confirm html [" + label + "]: explains what disabled: true means",
    h.includes("下次启动时跳过加载") && h.includes("要重启才会生效"));
}

// ============================================================
// D. Q1：条件开关在 UI 上不解释、且按钮禁用
// ============================================================
{
  const plug = combo(true, "false", "!!js process.platform === 'win32'");
  const t = reactR.render({ plugins: [plug], patch: snap.patch, self: snap.self });
  const cardEl = reactR.cardsOf(t)[0];
  const tEl = cardEl ? reactR.toggleOf(cardEl) : null;
  check("Q1 react: conditional row renders a toggle box (so the user can read why)", !!tEl);
  if (tEl) {
    const sub = tEl.type(tEl.props);
    const flat = textOf(sub).join(" ");
    check("Q1 react: layer-1 shows「条件开关（面板不解释）」", flat.includes("条件开关（面板不解释）"));
    check("Q1 react: explains the expression and tells the user to edit by hand",
      flat.includes("请手工编辑") && flat.includes("disabled"));
    const btns = findAll(sub, (n) => n.type === "button");
    check("Q1 react: the write button is disabled", btns.length > 0 && btns[0].props.disabled === true);
  }
  const hp = htmlR.toggleHtml(plug);
  check("Q1 html: layer-1 shows「条件开关（面板不解释）」", hp.includes("条件开关（面板不解释）"));
  check("Q1 html: tells the user to edit by hand", hp.includes("请手工编辑"));
  check("Q1 html: the write button is disabled", /class="tglAsk"[^>]*\sdisabled/.test(hp));
}

console.log("\n" + passed + "/" + (passed + failed) + " PASS");
process.exit(failed === 0 ? 0 : 1);
