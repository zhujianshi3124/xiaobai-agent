// P2.4 插件登记表：卸载/恢复的知识单一来源（snapshot ROW_IDS 的超集，六态与卸载共用）。
// 口径（p24-design.md §1 分类定案表）：
//   - 联动三插件（限流/压缩/记忆）默认软卸载；搜索两插件默认真卸载；软/真入口并存。
//   - toolkit-manager 不提供自我卸载（面板自我保护，同「不自带开关」先例）。
//   - hostKey：搜索插件真/软卸载时需同步 unset 的 web 宿主键（方案 A，§6）。
//   - 恢复方向冲突三态：宿主键被占用 → 引擎抛 host-key-occupied → 路由转三态弹窗。

export const PANEL_ROW_ID = "toolkit-manager";

export const PLUGINS = {
  "agent-memory": {
    rowId: "agent-memory-runtime",
    pkg: "@local/dsh-toolkit/agent-memory",
    category: "linkage",
    defaultMode: "soft",
    hostKey: null,
    managedBy: "patch",
  },
  "compact-router": {
    rowId: null,
    pkg: "@local/dsh-toolkit/compact-router",
    category: "linkage",
    defaultMode: "soft",
    hostKey: null,
    managedBy: "preset",
  },
  "rate-throttle": {
    rowId: "rate-throttle",
    pkg: "@local/dsh-toolkit/rate-throttle",
    category: "linkage",
    defaultMode: "soft",
    hostKey: null,
    managedBy: "patch",
  },
  "search-router": {
    rowId: "web-search-router",
    pkg: "@local/dsh-toolkit/search-router",
    category: "search",
    defaultMode: "true",
    hostKey: "searchProvider",
    managedBy: "patch",
  },
  "web-search-local": {
    rowId: "web-search-local",
    pkg: "@local/dsh-toolkit/web-search-local",
    category: "search",
    defaultMode: "true",
    hostKey: "fetchProvider",
    managedBy: "patch",
  },
};

// 联动感知（P24-EVIDENCE §①③，证据阶段定案）：search-router 挂载而 web-search-local
// 缺席 ⇒ dependency-broken（搜索功能不可用；doctor 以 missing-provider warning 标注）。
export const DEPENDENCIES = [
  {
    plugin: "search-router",
    requires: "web-search-local",
    note: "已加载，但依赖的本地搜索未安装——搜索功能不可用",
  },
];

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
