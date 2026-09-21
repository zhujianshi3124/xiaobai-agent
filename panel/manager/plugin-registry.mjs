// P2.4 插件登记表：卸载/恢复的知识单一来源（snapshot ROW_IDS 的超集，六态与卸载共用）。
// 口径（p24-design.md §1 分类定案表）：
//   - 联动三插件（限流/压缩/记忆）默认软卸载；搜索两插件默认真卸载；软/真入口并存。
//   - toolkit-manager 不提供自我卸载（面板自我保护，同「不自带开关」先例）。
//   - hostKey：搜索插件真/软卸载时需同步 unset 的 web 宿主键（方案 A，§6）。
//   - 恢复方向冲突三态：宿主键被占用 → 引擎抛 host-key-occupied → 路由转三态弹窗。

export const PANEL_ROW_ID = "toolkit-manager";

// providers：该插件向宿主 `ctx.web` 注册的 **provider id**（H2 / 债务 D-14）。
// 为什么面板要自己存一份：patch 文本里的引用是 provider id（`searchProvider: auto-search`），
// 不是行 id；停用/卸载预检原先只按行 id 找引用，恰好漏掉这一类——正是要防的那一类。
// 这份表与 `lib/<plugin>/dsh.plugin.json` 的 `requirements.registers.providers` 必须一致，
// 由 test/panel-crossrefs.test.mjs 的漂移守卫逐条钉住（改 manifest 不改这里即翻红）。
export const PLUGINS = {
  "agent-memory": {
    rowId: "agent-memory-runtime",
    pkg: "@local/dsh-toolkit/agent-memory",
    category: "linkage",
    defaultMode: "soft",
    hostKey: null,
    managedBy: "patch",
    providers: [],
  },
  "compact-router": {
    rowId: null,
    pkg: "@local/dsh-toolkit/compact-router",
    category: "linkage",
    defaultMode: "soft",
    hostKey: null,
    managedBy: "preset",
    providers: [],
  },
  "rate-throttle": {
    rowId: "rate-throttle",
    pkg: "@local/dsh-toolkit/rate-throttle",
    category: "linkage",
    defaultMode: "soft",
    hostKey: null,
    managedBy: "patch",
    providers: [],
  },
  "search-router": {
    rowId: "web-search-router",
    pkg: "@local/dsh-toolkit/search-router",
    category: "search",
    defaultMode: "true",
    hostKey: "searchProvider",
    managedBy: "patch",
    providers: ["auto-search"],
  },
  "web-search-local": {
    rowId: "web-search-local",
    pkg: "@local/dsh-toolkit/web-search-local",
    category: "search",
    defaultMode: "true",
    hostKey: "fetchProvider",
    managedBy: "patch",
    providers: ["local-multi", "local-fetch"],
  },
};

/** 行 id → 插件名（`web` 等平台行不属本表，返回 null）。 */
export function pluginByRowId(rowId) {
  if (typeof rowId !== "string" || rowId === "") return null;
  for (const [name, meta] of Object.entries(PLUGINS)) {
    if (meta.rowId === rowId) return name;
  }
  return null;
}

/**
 * 交叉引用预检的**额外匹配词**（H2）：该插件注册的 provider id。
 * 行 id 本身由调用方作为 needle 传入，这里只补"文本里引用它的方式"。
 */
export function crossRefNeedles(rowId) {
  const plugin = pluginByRowId(rowId);
  return plugin ? [...(PLUGINS[plugin].providers ?? [])] : [];
}

// 联动感知（P24-EVIDENCE §①③，证据阶段定案）：search-router 挂载而 web-search-local
// 缺席 ⇒ dependency-broken（搜索功能不可用；doctor 以 missing-provider warning 标注）。
export const DEPENDENCIES = [
  {
    plugin: "search-router",
    requires: "web-search-local",
    note: "已加载，但依赖的本地搜索未安装——搜索功能不可用",
  },
];

/**
 * 声明式依赖的反向查询（H2）：摘除/停用 `plugin` 时，哪些插件按登记表会失去依赖。
 * 这一类**在 patch 文本里没有字面引用**（`web-search-router` 那行不会写 web-search-local），
 * 光靠扫文本永远看不见，所以必须单独列出来——它恰恰是后果最重的那类（搜索整条链断掉）。
 * @returns {Array<{ plugin: string, note: string }>}
 */
export function declaredDependents(plugin) {
  return DEPENDENCIES.filter((d) => d.requires === plugin).map((d) => ({ plugin: d.plugin, note: d.note }));
}

export function assertUninstallable(plugin) {
  if (plugin === PANEL_ROW_ID) {
    const err = new Error("面板不提供自我卸载（toolkit-manager 无卸载入口）");
    err.code = "self-uninstall-forbidden";
    throw err;
  }
  const meta = PLUGINS[plugin];
  if (!meta) {
    const err = new Error("未知插件：" + plugin);
    err.code = "plugin-unknown";
    throw err;
  }
  return meta;
}
