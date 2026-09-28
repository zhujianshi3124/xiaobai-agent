# search-router（搜索路由）

`@local/dsh-toolkit/search-router`（manifest id `dsh/search-router`）——决定每次联网搜索走
哪条路：官方搜索还是本地搜索（权威卡面文案）。

## 它做什么（代码实况）

- **auto-search provider**：向宿主提供 `providers: [auto-search]`——按会话所用模型在官方搜索
  与本地搜索（web-search-local）之间选路。
- **三模式**（`mode`）：`auto`（按模型自动判定）／`official`（固定官方）／`local`（固定本地）；
  判定依据＝`officialProviders` 名单＋`officialProviderPatterns`／`officialModelPatterns` 通配
  （会话模型命中官方面→走官方搜索，否则走本地）；认不出时按 `defaultWhenUnknown`
  （`official`｜`local`）回落。
- **依赖注入**：`inject: [web]`；本地半边消费 web-search-local 的 `local-multi`。

## 部署实况（cordis.patch.yml）

`mode: auto`、`officialProviders: [llm-deepseek]`、两组 pattern 空、
`defaultWhenUnknown: local`、`inject: [web]`。

---
*本 README 由 EXE-BOOT-010 续用批按用户基本要求令补齐（2026-09-28）；内容以仓内实况为据
（manifest／index.js 源码／cordis.patch.yml），不发明功能。*
