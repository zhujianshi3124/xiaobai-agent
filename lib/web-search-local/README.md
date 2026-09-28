# web-search-local（本地网页搜索与抓取）

`@local/dsh-toolkit/web-search-local`（manifest id `dsh/web-search-local`）——提供不依赖官方
接口的本地搜索引擎，可自选搜索源（权威卡面文案）。

## 它做什么（代码实况）

- **两个 provider**：`local-multi`（多引擎聚合搜索）＋`local-fetch`（网页抓取）——宿主 `web`
  面的本地半边（部署行 `web` 的 `searchProvider: auto-search`／`fetchProvider: local-fetch`
  即指向它们/auto-search）。
- **引擎池与部署名单**：实现内置引擎注册表；**部署名单**以 patch 行 `config.engines` 为准
  （现部署 6 项：`searxng, google, duckduckgo, mojeek, bing, baidu`；searxng 需
  `searxngBaseUrl`）。**点名受部署名单约束**：`engine: <名>` 显式指名只放行部署名单内引擎，
  越界点名在发出任何请求前拒绝（错误文案列出部署名单）；自动链只用部署名单。
  模型可见的引擎清单与闸同源（`engineList(currentCfg())` 生成，不冒充未部署引擎）。
- **分层名单**：默认名单 → patch 行 → settings 节（settings 层经核查不存在，部署 patch 行
  即完全生效层）。

## 配置（manifest configSchema）

`engines: string[]`（部署名单；其余引擎级参数在代码内建默认）。

---
*本 README 由 EXE-BOOT-010 续用批按用户基本要求令补齐（2026-09-28）；内容以仓内实况为据
（manifest／index.js 源码／cordis.patch.yml／docs/debt.md #25/#27 既有裁定），不发明功能。*
