# dsh-toolkit（DSH 工具箱）

`@local/dsh-toolkit`（manifest id `dsh/toolkit`）——DSH 宿主的插件桶：一个 bundle 层总装
registry／doctor／管理面板，并携带五个子插件。本 README 是**桶总览**（用户基本要求令，
2026-09-28 补齐）；各子插件细节见 `lib/<插件名>/README.md`。

## 子插件清单（五个）

| 子插件 | 一句话（权威卡面文案） | 目录 |
|---|---|---|
| agent-memory（智能体内存台账） | 记住你说过的话和项目里的重要信息，下次对话还能用上。 | [`lib/agent-memory`](lib/agent-memory/README.md) |
| compact-router（压缩路由） | 对话变长时自动压缩历史内容，省上下文又不断片；压缩方式有自动、LLM 摘要、即时抽取三种，可随时切换。 | [`lib/compact-router`](lib/compact-router/README.md) |
| rate-throttle（速率限制与换源路由） | 在多个模型服务之间自动换路、出错冷却与降档压缩，避开限额和故障；另有请求限速开关（默认关闭）。 | [`lib/rate-throttle`](lib/rate-throttle/README.md) |
| search-router（搜索路由） | 决定每次联网搜索走哪条路：官方搜索还是本地搜索。 | [`lib/search-router`](lib/search-router/README.md) |
| web-search-local（本地网页搜索与抓取） | 提供不依赖官方接口的本地搜索引擎，可自选搜索源。 | [`lib/web-search-local`](lib/web-search-local/README.md) |

## 桶本体提供什么

- **services：`registry` + `doctor`**（`dsh.plugin.json` `provides`）——插件装载/状态对齐器与体检引擎；doctor 的检查知识在独立仓 `projects/doctor`（engine 零硬编码插件名）。
- **面板**：`toolkit-panel`（`settings.plugins.tab` 槽位，部署行 id `toolkit-manager`，挂 `panel/index.js`）——插件开关、体检、配置编辑、审计视图的唯一管理入口（用户明确要求，长期有效）。
- **契约**：`contract/`（contract v1.1 正典，`^1.0` 消费）。

## 目录地图

```
lib/            五个子插件（各有 dsh.plugin.json + README.md）
panel/          管理面板（服务端 + 客户端 React + 兜底页 HTML）
registry/       插件注册表/装载器/状态对齐（registry 服务实现）
contract/       契约（TS 源码 + 构建）
docs/           契约文档／修改计划（repair-plan）／债务（debt）／功能全量清单等
scripts/        门禁与专项验证脚本（ci-local 为正本门禁入口）
test/           测试（node --test）
```

## 挂载与部署实况

- 部署行在 `cordis.patch.yml`（基准 sha256 `b0f304c9…`/3190B，EXE-BOOT-018 实读复核更正；
  前值 `a663f61b…`/3160B 系 09-29 第 4 次滚存前旧基准，随 011 批 agentMemory 接线滚存即已过期）：
  `web`／`web-search-deepseek`
  既有行 config，`rate-throttle`／`web-search-local`／`web-search-router`／
  `agent-memory-runtime`／`toolkit-manager` 五行为 insert；**compact-router 不在 patch**——
  由 `scripts/apply-preset-patch.mjs` 改写预设 compaction 行名（预设托管）。
- 桶与子插件均为宿主 patch/预设通道挂载，不进 registry 状态面（内置插件路径）。

## 改动前必读

- [`AGENTS.md`](AGENTS.md)：仓内修改红线（禁止跨插件静态 import／eager re-export；改动后必跑
  本插件全部测试＋受影响方测试＋doctor dry-run 0/0/0；提交 `fix|feat|perf(<插件名>): <主题>`，
  一个主题一个 commit）。
- 门禁：`node scripts/ci-local.mjs --with-scan`（**6 步**：build×3＋lint＋零子插件引用守卫＋typecheck×3
  ＋node --test＋回归 14 项（D-3 起含 p23-verify）＋doctor 真实仓 dry-run 0/0/0＋CLI↔契约对账＋patch 行配置校验
  ＋文档引用守卫 D-20/C-1；默认链 5 步＝去掉守卫步。步数账：dc00a34 建守卫步 6→7，收口批摘 p23-verify 双跑 7→6）。
- 账面：`docs/repair-plan-20260923.md`（施工计划）、`docs/debt.md`（债务）、
  `docs/feature-inventory-20260923.md`（功能全量清单 · **2026-09-29 起定稿为正典**：F/H 编号空间冻结，
  终数＝重建件 23／覆盖账 68＋23＝91，口径以该文件《正典化》一节为唯一依据）、
  [`CHANGELOG.md`](CHANGELOG.md)（对外可见变更）。

---
*本 README 由 EXE-BOOT-010 续用批按用户基本要求令补齐（2026-09-28）；内容以仓内实况为据
（manifest／cordis.patch.yml／卡面文案），不发明功能。*
