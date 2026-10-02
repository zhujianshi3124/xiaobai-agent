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
    m[1] + "\nreturn { toggleHtml, stateOf, renderConfirm, setPatch: (t) => { PATCH_TEXT = t; }, dualSwitchNotice, effectNoteHtml, techDetails"
      + ", SEARCH_COPY, memorySearchUnavailableHtml, memorySearchNoResultHtml, memorySearchRowHtml };",
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
];

const tree = reactR.render(snap);
const cards = reactR.cardsOf(tree);
check("react renderer: every plugin produced a card (4)", cards.length === 4, "cards=" + cards.length);
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
// A-inject. 技术详情 inject 行端到端钉（inject 修法笔，EXE-BOOT-009 开工令 2）
//   归因（计划 §30.b）：snapshot 曾读 requirements.inject 顶层＝从来空（B 型缺口，
//   起源 f95b751 挪错层级），真声明在 requirements.registers.inject。
//   本节三面钉死，堵"无钉断言过 inject 行端到端值"的工装盲区：
//   ① snapshot 真值格（manifest registers.inject 实况硬编码：四卡有值＋agent-memory
//     无声明＝空，各自断言）——修前红正中四卡这一格（现值空、预期有值）；
//   ②③ react TechRow / html techRow 逐卡＝snapshot 真值格式化（双通道 parity，
//     随 snapshot 同步，恒绿）。
// ============================================================
const INJECT_EXPECT = {
  "compact-router": ["llm", "tokenMeter", "sessions", "commands"],
  "rate-throttle": ["llm", "tokenMeter"],
  "search-router": ["web"],
  "agent-memory": ["systemPrompt"], // EXE-BOOT-011 施工笔3（案 C）：agentMemory 系统提示词变量接线
};
const fmtInject = (a) => (a && a.length > 0) ? a.join(", ") : "（无）";

// ① snapshot 真值（与 manifest registers.inject 实况逐字对表）（S1 剔除批四→三枚举）
check("inject: snapshot 三卡真值＝manifest registers.inject 实况（compact-router/rate-throttle/search-router）",
  ["compact-router", "rate-throttle", "search-router"].every((d) =>
    JSON.stringify((snap.plugins.find((x) => x.dir === d) || {}).inject) === JSON.stringify(INJECT_EXPECT[d])));
check("inject: snapshot agent-memory 真值＝[systemPrompt]（EXE-BOOT-011 施工笔3：agentMemory 变量接线）",
  JSON.stringify((snap.plugins.find((x) => x.dir === "agent-memory") || {}).inject) === JSON.stringify(["systemPrompt"]));

// ②③ 双通道逐卡 parity（对 snapshot 真值，格式化逐字）
for (const exp of EXPECT) {
  const p = snap.plugins.find((x) => x.dir === exp.dir);
  const want = fmtInject(p && p.inject);

  // react：TechDetails 元素须调用一次才有子树（headless createElement 陷阱同族）
  const injCard = cards.find((c) => c.props.plugin.dir === exp.dir);
  const injCardTree = injCard ? injCard.type(injCard.props) : null;
  const tdEl = injCardTree ? findAll(injCardTree, (n) => typeof n.type === "function" && n.type.name === "TechDetails")[0] : null;
  const tdTree = tdEl ? tdEl.type(tdEl.props) : null;
  const row = tdTree ? findAll(tdTree, (n) => typeof n.type === "function" && n.type.name === "TechRow" && n.props.label === "inject（依赖的服务）")[0] : null;
  check("[" + exp.dir + "] react: inject 行 == snapshot 真值格式化",
    !!row && row.props.value === want, row ? String(row.props.value) : "(TechRow 缺席)");

  // html：兜底页 techDetails 直连（同卡同值同格式）
  const hrow = htmlR.techDetails(p);
  check("[" + exp.dir + "] html: inject 行 == snapshot 真值格式化",
    typeof hrow === "string" && hrow.includes('<span class="techKey">inject（依赖的服务） : </span>' + want),
    typeof hrow === "string" ? hrow.slice(0, 0) || undefined : "(techDetails 非字符串)");
}

// ============================================================
// A2. 黄警告「恢复指引」文案（第 11 轮 ⑤ 文案优化）
//   —— 两类警告都必须给出人话恢复路径，并点明面板的责任边界。
// ============================================================
{
  const pRt = snap.plugins.find((x) => x.dir === "rate-throttle");

  // ① react：DualSwitchNotice 是**函数组件**，且只存在于 `PluginCard` 的**渲染产物**里
  //    （整页树里只有 PluginCard 元素本身，其 children 不在树中）。
  //    所以要：先调用 PluginCard → 在产物里找到 DualSwitchNotice 元素 → 再用它当次的
  //    真实 props 调一次取文本。（与「headless createElement 陷阱」同族：不调用无文本。）
  const rtEl = cards.find((c) => c.props.plugin.dir === "rate-throttle");
  const cardTree = rtEl ? rtEl.type(rtEl.props) : null;
  const noticeEls = cardTree
    ? findAll(cardTree, (n) => typeof n.type === "function" && n.type.name === "DualSwitchNotice")
    : [];
  const whole = noticeEls.map((el) => textOf(el.type(el.props)).join(" ")).join(" ");
  check("[rate-throttle] react 卡内存在 DualSwitchNotice 元素", noticeEls.length > 0, "count=" + noticeEls.length);
  check("[rate-throttle] react 黄警告含恢复指引（要让它真正工作 + enabled）",
    whole.includes("要让它真正工作") && whole.includes("enabled"));
  check("[rate-throttle] react 恢复指引点明「本面板只负责第一层」", whole.includes("本面板只负责第一层"));
  check("[rate-throttle] react 恢复指引指向「P2.3 配置编辑」", whole.includes("P2.3 配置编辑"));

  // ② html：同一段文案必须同步
  const notice = htmlR.dualSwitchNotice(pRt);
  check("[rate-throttle] html 黄警告含恢复指引", notice.includes("要让它真正工作"));
  check("[rate-throttle] html 恢复指引点明「本面板只负责第一层」", notice.includes("本面板只负责第一层"));
  check("[rate-throttle] html 恢复指引指向「P2.3 配置编辑」", notice.includes("P2.3 配置编辑"));

  // ③ 停用态警告的恢复指引（人工构造一次「层1关闭」验证另一分支）
  const offP = JSON.parse(JSON.stringify(pRt));
  offP.patchRow.enabled = false;
  const offNotice = htmlR.dualSwitchNotice(offP);
  check("[停用态] html 恢复指引点明「启停开关改的就是这一层」",
    offNotice.includes("本卡的启停开关改的就是这一层"), offNotice.slice(0, 0) || undefined);
}

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
    provides: base.provides, events: base.events,
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

// ============================================================
// E. 批 5-3：两处显示失真（F-45 compact-router 状态行 / F-49 rate-throttle 双同名 enabled）
//    钉子先行：E1/E2/E3 断的是**修后应有的读数**，实现前必红。
// ============================================================

// 专案判据的唯一来源：服务端已下发的 configPanel.values.routing（值=patch 原文）。
// 面板不臆断——这一层取不到时沿用现语义，取到了才按主功能判定。
const rtBase = snap.plugins.find((x) => x.dir === "rate-throttle");
if (!rtBase.configPanel || !rtBase.configPanel.values || !rtBase.configPanel.values.routing
  || rtBase.configPanel.values.routing.enabled !== "true") {
  throw new Error("fixture 自检失败：真实 patch 里 routing.enabled 必须为 \"true\"，否则 E1 三态没有对照面");
}
const RT_LABEL = {
  bothOn: "运行中 · 路由/冷却/降档与主动节流都开着",
  mainOn: "运行中 · 路由/冷却/降档开着，主动节流未开",
  throttleOnly: "运行中 · 主动节流开着，路由/冷却/降档未开",
  bothOff: "已加载 · 功能开关关闭，暂不生效",
};
const COMPACT_LABEL = "运行中 · 预设托管，预设的改动要重启 DSH 才生效";

/** 造一张 rate-throttle 卡：层1、层2（主动节流）、routing 层各取一个值。 */
function rtCombo(rowEnabled, cfgEnabled, routing) {
  const plug = combo(rowEnabled, cfgEnabled);
  if (routing === "__no_panel__") return plug;          // 服务端没下发 routing ⇒ 面板不该臆断
  const cp = JSON.parse(JSON.stringify(rtBase.configPanel));
  if (routing === "__no_key__") delete cp.values.routing.enabled;  // 键缺席 = 源码缺省 true
  else cp.values.routing.enabled = routing;
  plug.configPanel = cp;
  return plug;
}

const htmlLabelOf = (p) => htmlR.stateOf(p).label;
const reactCardOf = (p, patchText) => {
  const t = reactR.render({ plugins: [p], patch: snap.patch, self: snap.self, toolkitName: "x", toolkitVersion: "0" }, patchText || PATCH_TEXT);
  return reactR.cardsOf(t)[0] || null;
};
const reactLabelOf = (p, patchText) => { const c = reactCardOf(p, patchText); return c ? reactR.stateLabelOf(c) : null; };
const reactNoticeOf = (p, patchText) => {
  const c = reactCardOf(p, patchText);
  const tree = c ? c.type(c.props) : null;
  const els = tree ? findAll(tree, (n) => typeof n.type === "function" && n.type.name === "DualSwitchNotice") : [];
  return els.map((el) => textOf(el.type(el.props)).join(" ")).join(" ");
};
htmlR.setPatch(PATCH_TEXT);

// ---- E1 · F-49 三态真值表（两渲染器同判） ----
const RT_TABLE = [
  { cfg: "false", routing: "true", expect: RT_LABEL.mainOn, why: "顶层关 + 路由开 ⇒ 主功能开着（F-49 实况）" },
  { cfg: "true", routing: "true", expect: RT_LABEL.bothOn, why: "顶层开 + 路由开" },
  { cfg: "true", routing: "false", expect: RT_LABEL.throttleOnly, why: "顶层开、路由关 ⇒ 只剩主动节流" },
  { cfg: "false", routing: "false", expect: RT_LABEL.bothOff, why: "两层全关 ⇒「暂不生效」方诚实" },
  { cfg: "false", routing: "__no_key__", expect: RT_LABEL.mainOn, why: "routing 键缺席 ⇒ 源码缺省 true（rate-throttle/index.js:167）" },
  { cfg: "false", routing: "__no_panel__", expect: RT_LABEL.bothOff, why: "面板取不到 routing ⇒ 不臆断，沿用现语义" },
  // 主动节流那层同理：config.enabled 整键缺席 ⇒ 源码缺省 `config.enabled !== false` = 开着（:157）
  { cfg: "__absent__", routing: "true", patch: PATCH_NO_INNER, expect: RT_LABEL.bothOn, why: "顶层键缺席 ⇒ 主动节流缺省开 + 路由开" },
  { cfg: "__absent__", routing: "false", patch: PATCH_NO_INNER, expect: RT_LABEL.throttleOnly, why: "顶层键缺席 ⇒ 主动节流缺省开、路由关" },
];
for (const r of RT_TABLE) {
  const plug = rtCombo(true, r.cfg, r.routing);
  const patchForCase = r.patch || PATCH_TEXT;
  htmlR.setPatch(patchForCase);
  check("E1 html [" + r.why + "] → " + r.expect, htmlLabelOf(plug) === r.expect, htmlLabelOf(plug));
  check("E1 react [" + r.why + "] → " + r.expect, reactLabelOf(plug, patchForCase) === r.expect, String(reactLabelOf(plug, patchForCase)));
}
htmlR.setPatch(PATCH_TEXT);
// 主功能开着时，整卡任何一处都不得再宣称"暂不生效"
for (const [caseName, plug] of [["实况", rtCombo(true, "false", "true")], ["缺省", rtCombo(true, "false", "__no_key__")], ["顶层缺省", rtCombo(true, "__absent__", "true")]]) {
  const patchForCase = caseName === "顶层缺省" ? PATCH_NO_INNER : PATCH_TEXT;
  htmlR.setPatch(patchForCase);
  const hTxt = htmlLabelOf(plug) + " " + htmlR.dualSwitchNotice(plug);
  const rTxt = reactLabelOf(plug, patchForCase) + " " + reactNoticeOf(plug, patchForCase);
  check("E1 " + caseName + ": html 整卡不宣称「暂不生效」", !hTxt.includes("暂不生效"), hTxt.slice(0, 120));
  check("E1 " + caseName + ": react 整卡不宣称「暂不生效」", !rTxt.includes("暂不生效"), rTxt.slice(0, 120));
}
htmlR.setPatch(PATCH_TEXT);

// ---- E1b · 黄警告框在专案下要说清两层真况（不得再说"所以现在没生效"） ----
{
  const onNoticeH = htmlR.dualSwitchNotice(rtCombo(true, "false", "true"));
  const onNoticeR = reactNoticeOf(rtCombo(true, "false", "true"));
  for (const [face, n] of [["html", onNoticeH], ["react", onNoticeR]]) {
    check("E1b " + face + ": 路由开着时不说「所以现在没生效」", !n.includes("所以现在没生效"), n.slice(0, 120));
    check("E1b " + face + ": 并列点名两个同名开关", n.includes("主动节流") && n.includes("路由"));
    // A2 的三条既有文案要求在专案分支上继续成立（防把恢复指引改掉）
    check("E1b " + face + ": 仍给恢复指引三件套",
      n.includes("要让它真正工作") && n.includes("本面板只负责第一层") && n.includes("P2.3 配置编辑"));
  }
  const offNoticeH = htmlR.dualSwitchNotice(rtCombo(true, "false", "false"));
  const offNoticeR = reactNoticeOf(rtCombo(true, "false", "false"));
  check("E1b html: 两层全关时「所以现在没生效」仍是实话", offNoticeH.includes("两层开关不一致") && offNoticeH.includes("所以现在没生效"));
  check("E1b react: 两层全关时「所以现在没生效」仍是实话", offNoticeR.includes("两层开关不一致") && offNoticeR.includes("所以现在没生效"));
}

// ---- E2 · F-49 反向钉：专案不得外溢到其余四卡 ----
{
  const am = JSON.parse(JSON.stringify(snap.plugins.find((x) => x.dir === "agent-memory")));
  am.patchRow.config = Object.assign({}, am.patchRow.config, { enabled: "false" });
  check("E2 html: agent-memory 的内部开关关 ⇒ 仍报「已加载 · 功能开关关闭，暂不生效」",
    htmlLabelOf(am) === RT_LABEL.bothOff, htmlLabelOf(am));
  check("E2 react: agent-memory 同上", reactLabelOf(am) === RT_LABEL.bothOff, String(reactLabelOf(am)));
  const amNotice = htmlR.dualSwitchNotice(am);
  check("E2 html: agent-memory 的黄警告文案一字未动",
    amNotice.includes("两层开关不一致，所以现在没生效") && amNotice.includes("第二层（插件内部）")
    && amNotice.includes(">关闭</span> —— 功能被自己关掉了"), amNotice.slice(0, 120));
  const amNoticeR = reactNoticeOf(am);
  check("E2 react: agent-memory 的黄警告文案一字未动",
    amNoticeR.includes("两层开关不一致，所以现在没生效") && amNoticeR.includes("第二层（插件内部）")
    && amNoticeR.includes("关闭") && amNoticeR.includes("功能被自己关掉了"), amNoticeR.slice(0, 120));
  // 专案的边界钉在"只认 rate-throttle 这一家"：伪造一张带同名嵌套开关的别家卡，专案也不许接管。
  // （第二家真出现时按 debt.md#31 边界行泛化，那时这条钉要同时翻面。）
  const impostor = JSON.parse(JSON.stringify(am));
  impostor.configPanel = JSON.parse(JSON.stringify(rtBase.configPanel));
  check("E2 html: 别家卡即使出现 routing.enabled 也不被专案接管",
    htmlLabelOf(impostor) === RT_LABEL.bothOff, htmlLabelOf(impostor));
  check("E2 react: 别家卡即使出现 routing.enabled 也不被专案接管",
    reactLabelOf(impostor) === RT_LABEL.bothOff, String(reactLabelOf(impostor)));
  for (const dir of ["agent-memory", "search-router"]) {
    const p = snap.plugins.find((x) => x.dir === dir);
    check("E2 反向钉 " + dir + ": 真实卡状态行不受牵连（html）", htmlLabelOf(p) === "运行中 · 正在生效", htmlLabelOf(p));
    check("E2 反向钉 " + dir + ": 真实卡状态行不受牵连（react）", reactLabelOf(p) === "运行中 · 正在生效", String(reactLabelOf(p)));
  }
}

// ---- E3 · F-45：compact-router 状态行去掉无判据的"正在生效"，并如实标注重启边界 ----
{
  const cr = snap.plugins.find((x) => x.dir === "compact-router");
  check("E3 html: compact-router 不再宣称「正在生效」", !htmlLabelOf(cr).includes("正在生效"), htmlLabelOf(cr));
  check("E3 react: compact-router 不再宣称「正在生效」", !String(reactLabelOf(cr)).includes("正在生效"), String(reactLabelOf(cr)));
  check("E3 html: compact-router 如实标注预设托管+重启", htmlLabelOf(cr) === COMPACT_LABEL, htmlLabelOf(cr));
  check("E3 react: compact-router 如实标注预设托管+重启", reactLabelOf(cr) === COMPACT_LABEL, String(reactLabelOf(cr)));
  // 可观测性自证：缺席态确实走 status 那条拦截（F-45 原文"卸载后仍说它在生效"高估的成因面）
  const crOff = JSON.parse(JSON.stringify(cr));
  crOff.status = "soft-unmounted";
  check("E3 html: 软卸载态被 status 拦截（不是运行中）",
    htmlLabelOf(crOff) === "已软卸载 · 本体保留 · 可一键恢复", htmlLabelOf(crOff));
  check("E3 react: 软卸载态被 status 拦截（不是运行中）",
    reactLabelOf(crOff) === "已软卸载 · 本体保留 · 可一键恢复", String(reactLabelOf(crOff)));
}

// ---- W2 余件 · 断点修复批②：非可写卡"改完要重启"提示位（两渲染器 + rate-throttle 不双渲染）----
// （S1 剔除批：非可写卡 4→3，web-search-local 已出包。）
{
  const THREE = ["agent-memory", "compact-router", "search-router"];
  for (const dir of ["agent-memory", "compact-router", "rate-throttle", "search-router"]) {
    const isNote = THREE.includes(dir);
    const p = snap.plugins.find((x) => x.dir === dir);
    const serverCopy = p && p.configPanel ? p.configPanel.effectNote : undefined;

    // react：EffectNoteRow 是函数组件，同样要手动调用才取得到文本（headless createElement 陷阱）
    const cardEl = cards.find((c) => c.props.plugin.dir === dir);
    const cardTree = cardEl ? cardEl.type(cardEl.props) : null;
    const noteEl = cardTree
      ? findAll(cardTree, (n) => typeof n.type === "function" && n.type.name === "EffectNoteRow")[0]
      : null;
    const rendered = noteEl ? noteEl.type(noteEl.props) : null;
    const rtxt = rendered ? textOf(rendered).join(" ") : "";
    check("[" + dir + "] react: restart hint " + (isNote ? "present" : "absent（在 ConfigEditor 内，不双渲染）"), (rtxt.length > 0) === isNote, rtxt.slice(0, 30));
    if (isNote) {
      check("[" + dir + "] react: hint == server effectNote 逐字", rtxt === serverCopy, String(serverCopy).slice(0, 30));
      check("[" + dir + "] react: hint 点出重启边界", rtxt.includes("重启 DSH 才生效"));
    }

    // html：兜底页 effectNoteHtml
    const hhtml = htmlR.effectNoteHtml(p);
    check("[" + dir + "] html: restart hint " + (isNote ? "present" : "absent"), (hhtml.length > 0) === isNote);
    if (isNote) {
      check("[" + dir + "] html: hint == server effectNote 逐字", hhtml === '<div class="effectNote">' + serverCopy + "</div>", String(serverCopy).slice(0, 30));
      check("[" + dir + "] html: hint 点出重启边界", hhtml.includes("重启 DSH 才生效"));
    }
  }
}

// ============================================================
// F. S4 F-37 记忆检索卡：两渲染器真跑钉（批1 文案原文；卡底固定句＝移交制维持明示）
//    MemorySearchCard 是纯呈现组件（props 进树出），四种状态逐个真渲染。
// ============================================================
const SEARCH_TITLE = "记忆检索";
const SEARCH_DESC = "在你的本机记忆台账里查找历史会话的指令、进度与归档。结果只在本机显示，不外传。";
const SEARCH_EMPTY = "输入关键词，回车检索。范围：全部会话（含已归档）。";
const SEARCH_NO_RESULT = "没有命中。试试更短的关键词；一般输入栏的对话记录也在检索范围内。";
const SEARCH_FOOTER = "检索帮你找，接手新会话仍需走移交确认。";
const SEARCH_LIB_ABSENT = "agent-memory 不在位，检索暂不可用。记忆台账功能本身不受影响。";
const SEARCH_ROOT_UNREADABLE_PREFIX = "记忆数据根不可读（";
const SEARCH_ROOT_UNREADABLE_SUFFIX = "）。检索暂不可用，记忆正本不受影响。";

{
  // react：页面树里有独立卡（不是 agent-memory 插件卡内分区——批1 卡位裁决）
  const pageTree = reactR.render(snap);
  const searchEls = findAll(pageTree, (n) => typeof n.type === "function" && n.type.name === "MemorySearchSection");
  check("[memory-search] react: 独立卡 MemorySearchSection 在页面树中", searchEls.length === 1, "count=" + searchEls.length);
  const h2s = textOf(pageTree).join(" ").includes(SEARCH_TITLE);
  check("[memory-search] react: h2「记忆检索」在页面中", h2s);
  const sectionEl = searchEls[0];
  const sectionTree = sectionEl ? sectionEl.type(sectionEl.props) : null;
  const cardEl = sectionTree ? findAll(sectionTree, (n) => typeof n.type === "function" && n.type.name === "MemorySearchCard")[0] : null;
  check("[memory-search] react: MemorySearchCard 元素在 Section 内", !!cardEl);
  if (cardEl) {
    const call = (res) => textOf(cardEl.type({ query: "", setQuery: () => {}, busy: false, res, onSearch: () => {} })).join(" ");
    check("[memory-search] react: 空态＝卡说明＋空态＋卡底固定句逐字",
      call(null).includes(SEARCH_DESC) && call(null).includes(SEARCH_EMPTY) && call(null).includes(SEARCH_FOOTER));
    check("[memory-search] react: 降级态＝服务端 reason 如实展示（不 5xx、卡面说明）",
      call({ phase: "unavailable", reason: SEARCH_LIB_ABSENT }).includes(SEARCH_LIB_ABSENT));
    check("[memory-search] react: 无结果态文案逐字",
      call({ phase: "done", q: "x", data: { results: [], sessions: 3, elapsedMs: 1, unreadable: 0, notices: [] } }).includes(SEARCH_NO_RESULT));
    const hitTree = cardEl.type({
      query: "琥珀", setQuery: () => {}, busy: false, onSearch: () => {},
      res: { phase: "done", q: "琥珀", data: { sessions: 7, elapsedMs: 9, unreadable: 1, notices: [], results: [
        { sid: "20260928-aabbccdd1122", status: "已归档", workspace: "D:\\proj\\demo", file: "ledger", sec: "待办", no: "L-012", text: "琥珀任务描述", ts: "2026-09-28T10:00:00+00:00", snippet: "…琥珀任务描述…" },
      ] } },
    });
    const hitTxt = textOf(hitTree).join(" ");
    check("[memory-search] react: 命中行＝sid 短码·状态·工作区尾段｜来源·栏位·编号｜日期｜片段",
      hitTxt.includes("20260928") && hitTxt.includes("已归档") && hitTxt.includes("demo") && hitTxt.includes("ledger·待办 L-012") && hitTxt.includes("2026-09-28"));
    check("[memory-search] react: 不可读会话如实计数", hitTxt.includes("1 个会话无法读取"));
    const bolds = findAll(hitTree, (n) => n.type === "b");
    check("[memory-search] react: 命中词加粗（<b> 元素在树中）", bolds.length > 0 && textOf(bolds[0]).join("") === "琥珀");
    check("[memory-search] react: 卡底固定句在结果态仍在（移交制维持不因有结果而隐去）", hitTxt.includes(SEARCH_FOOTER));
  }

  // html：兜底页同文案同形态
  check("[memory-search] html: 卡说明逐字（页面骨架）", readFileSync(join(root, "panel", "client", "panel.html"), "utf8").includes(SEARCH_DESC));
  check("[memory-search] html: 卡底固定句逐字（页面骨架）", readFileSync(join(root, "panel", "client", "panel.html"), "utf8").includes(SEARCH_FOOTER));
  check("[memory-search] html: 降级函数 reason 直出", htmlR.memorySearchUnavailableHtml(SEARCH_LIB_ABSENT).includes(SEARCH_LIB_ABSENT));
  check("[memory-search] html: 无结果函数文案逐字", htmlR.memorySearchNoResultHtml().includes(SEARCH_NO_RESULT));
  const rowHtml = htmlR.memorySearchRowHtml(
    { sid: "20260928-aabbccdd1122", status: "已归档", workspace: "D:\\proj\\demo", file: "ledger", sec: "待办", no: "L-012", ts: "2026-09-28T10:00:00+00:00", snippet: "…琥珀任务…" },
    "琥珀",
  );
  check("[memory-search] html: 命中行四段齐备", rowHtml.includes("20260928") && rowHtml.includes("已归档") && rowHtml.includes("demo") && rowHtml.includes("ledger·待办 L-012") && rowHtml.includes("2026-09-28"));
  check("[memory-search] html: 命中词加粗", rowHtml.includes("<b>琥珀</b>"));
  check("[memory-search] html: 两渲染器卡底固定句同串", htmlR.SEARCH_COPY.footer === SEARCH_FOOTER);
  check("[memory-search] html: 两渲染器无结果文案同串", htmlR.SEARCH_COPY.noResult === SEARCH_NO_RESULT);
}

console.log("\n" + passed + "/" + (passed + failed) + " PASS");
process.exit(failed === 0 ? 0 : 1);
