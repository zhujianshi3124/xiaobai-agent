# P7 嵌入 · mock 桶真浏览器闭环验收证据

> 归档时刻：2026-09-20 19:5x（GMT+8）。对应提交：toolkit@8bb4d13（P7 主体 + 第五步 UX）、
> doctor@6839cc1（manifest 根字段白名单补 requires/panels）。
> 被装插件：`D:\dsh-test-sandbox\dsh-repo-spec\packages\dsh-plugin`（用户本地开发项目的插件子包，
> legacy 形态：无 dsh.plugin.json，package.json exports["."] 为对象形态、无 main）。
> 零宿主改造、零 toolkit 产品代码特判、零被装插件改动。

## 一、harness 形态：这一次验的是「装载 toolkit」而不是「装载 toolkit 的零件」

`D:\dsh-test-sandbox\var\scratch\p7-coldstart-v4\harness.mjs`（临时工装，不入 toolkit 仓）。
与 T0 harness 的关键差别（T0 见 `T0-REAL-PLUGIN-LOOP.md`，那版是手工装配 registry/doctor/v2 三件）：

| 项 | 本 harness 的做法 | 为什么这才算 G4 的检验 |
|---|---|---|
| 装载动作 | `await import('file:///D:/dsh-plugins/dsh-toolkit/index.js')` → `toolkit.apply(ctx, config)` | 与 dsh-web-all 类桶把 toolkit 当**普通插件**装载走同一条路径（根入口 + cordis 插件形态） |
| webServer | 宿主自有的一个数组替身，只有 `register/unregister` | toolkit 不拥有根服务器，只能"被允许注册路由"；P7.4 面板 guard 的前提 |
| 面板数据面 | **无任何接口桩**：32 条路由全由 toolkit 自己注册，snapshot/doctor/custody/v2 全部真身直出 | 面板里看到的 5 张工具卡、18 个参数编辑字段、体检操作台、patch 原文，都是真读 `cordis.patch.yml` 的结果 |
| 服务面 | 真实 cordis `Context`；`tools`/`systemPrompt` 两个 stub 服务（真实 dsh web 本来就有） | 让真实插件的 `apply` 完整执行，而不是停在 inject 缺席 |
| 前缀 | `servicePrefix` 由 config 给（跑了两轮：`toolkit` 与 `tk2`） | 同一份代码、只改 config，即换出另一套完整部署 |

harness 自报（`/__harness`）：`routeCount=32`，`servicePrefix=toolkit` 时全部挂在
`/api/toolkit-panel/*`；`servicePrefix=tk2` 时全部挂在 `/api/tk2-panel/*`。

## 二、闭环实测（真浏览器，逐步留证）

截图原始文件按用户 workspace 的 dsh-repo-spec 归位规则落在
`D:\dsh-test-sandbox\assets\images\2026-09-20\`（不入库）；**运行中途 in-app browser 面板被隐藏**
（`visibilityState=hidden`，截图能力不可用），故第 4 步之后改为 DOM 文本断言 + 服务端快照核验，
下表"证据"列逐行标明是哪一种，不混称。

| # | 步骤 | 实测结论 | 证据 |
|---|---|---|---|
| 0 | 装载 toolkit 根入口 | `name=dsh-toolkit`、`manifest.id=dsh/toolkit`、`inject=["webServer"]`；toolkit 自注册 32 条路由到宿主 webServer；页面渲染出**唯一**标签页（`window.__tabCount==1`、id `toolkit-panel`），管理区 + 内置插件工具区（5 张真卡）+ 体检操作台 + 配置快照 + 删除收据 + patch 原文同页可达；数据源徽标=**实时 SSE** | 00-panel-loaded.png + DOM 断言 |
| 1 | 相对路径提交（用户真实踩坑形态） | 输入 `dsh-repo-spec\packages\dsh-plugin` 点「① 预检」→ 面板逐字回显 `need-absolute-path 请输入绝对路径（如 D:\plugins\my-plugin）。相对路径 "dsh-repo-spec\packages\dsh-plugin" 会按服务进程的工作目录解析，多半指向你想不到的地方。`；向导标题与帮助文案已写明「仅本地插件目录 / 只接受本地插件目录的**绝对路径**（npm 包安装暂未开放）/ 相对路径会按**服务进程的工作目录**解析」 | 01-relative-path-blocked.png + DOM 断言；"零请求"由 panel-unified 新增用例断言（本环境网络记录器未捕获请求，故不以截图声称） |
| 2 | 绝对路径预检 | `D:\dsh-test-sandbox\dsh-repo-spec\packages\dsh-plugin` → 「预检结论：通过，可以安装（legacy 模式）」+ 如实提示「legacy 模式：无契约 manifest，检查受限（健康检查退化为通用项）」+ 建议新增契约 manifest；「确认安装」按钮出现 | DOM 断言 |
| 3 | 确认安装（免刷新自适应） | 绿条 `已installed：legacy/dsh-repo-spec`；卡片**未刷新页面**自动出现，状态 `active`，徽标 `legacy 模式` + `契约 ^1.0` + `v0.2.0`，五操作齐备（停用/重载/卸载/健康详情/配置）；顶部仍为「实时 SSE」，`__tabCount` 仍为 1（没有新增标签页/独立页） | 02-installed-card-sse.png（人工目视核对过该图内容） |
| 4 | 配置表单与保存 | 「配置」展开 schemastery 纯定义表单 5 字段（specDir/autoInject/autoOrganize/lockTimeout/claudeCompat）；填 `specDir=.dsh-spec-p7`、`lockTimeout=7000`、`claudeCompat=true` 三字段 → 保存 → 服务端快照核验 `config={"specDir":".dsh-spec-p7","lockTimeout":7000,"claudeCompat":true}`（**三字段全存活**，T0 修的多字段覆盖问题在本形态下不复现） | DOM 断言 + `curl /api/toolkit-panel/v2/snapshot` |
| 5 | 停用（知情确认闸） | 确认文案「确认停用 legacy/dsh-repo-spec？」；勾选前「执行」`disabled=true` → 勾选后 `disabled=false` → 执行后 toast `已disabled`、状态徽标 `disabled`、按钮切「启用」 | DOM 断言 |
| 6 | 启用 | 同样走确认闸（勾选+执行）→ toast `已enabled：legacy/dsh-repo-spec`、状态回 `active` | DOM 断言 |
| 7 | 健康详情（如实呈现） | 「当前状态：healthy · 无发现 · 历史：healthy ×12」——doctor 周期巡检（watchInterval 30000）在场下真实写入环形历史；无发现就是无发现，不虚报 | DOM 断言 + 服务端 `health.status=healthy` |
| 8 | 非缺省前缀（tk2 轮） | 另起一个 harness 进程、config 只改 `servicePrefix=tk2`：32 条路由整体迁到 `/api/tk2-panel/*`；浏览器打开 `/api/tk2-panel/ui` → 页内 `window.PANEL_API=="/api/tk2-panel"`（装配期改写基址标记生效）、插件卡与体检照常渲染；交叉验证：tk2 进程上 `/api/toolkit-panel/snapshot`=**404**、缺省进程上 `/api/tk2-panel/snapshot`=**404**，各自只认自己的基址 | DOM 断言 + HTTP 状态码 |

## 三、双向兼容的两句结论（不夸大）

1. **任意 dsh 插件可装入 toolkit**：真实插件（legacy 形态、exports 对象入口）经面板预检→安装→
   启停→配置→健康全链可用，零代码改动、零特判（本轮 + T0 轮 + p7-embed 双实例用例）。
2. **toolkit 可被当普通插件装载**：mock 桶只做 `import 根入口 + apply(ctx, config)` 两件事，
   toolkit 自带 32 条路由、服务名/事件名/HTTP 基址全部随 `servicePrefix` 走，缺省前缀下对外 URL
   与 P6 之前逐字节相同。

**边界如实陈述（写进 docs/embed-toolkit.md，此处先记账）**：
- 当前 dsh-web-all **不认** `panels` 描述符 ⇒ toolkit 面板在宿主进程内以**自有路由**可达可用
  （`/api/<prefix>-panel/*` 与宿主 slot 标签页），不与它的布局融合；认描述符的宿主才可能融合。
- **React 标签页的基址是 bundle 内常量**（`PANEL_API`），因为客户端 bundle 由宿主的客户端加载器
  按固定模块 id 装载、服务端无从注入前缀 ⇒ 非缺省 `servicePrefix` 的实例，其 **React 标签页**仍指向
  缺省基址；该实例的完整管理面经 `${apiBase}/ui` 兜底页可达（本轮第 8 步实测）。同进程双实例的
  路由/服务/事件/状态隔离由 p7-embed 用例证明；两实例 React 标签页并存需要宿主提供按实例注入
  基址的能力，不在我方改造范围（Q2 裁决：零宿主改造）。
- 双实例必须各自给 `registry.statePath`/`dataDir`：缺省状态文件按 `toolkitRoot` 推导，
  同一 `toolkitRoot` 的两份实例会共用同一份安装记录（这是配置责任，非路由冲突）。

## 四、门禁状态

`node --test` **190/0**（P7 前基线 175 + p7-embed 14 + panel-unified UX 1）；build×3、pluggable-lint、
no-subplugin-import-check（6 文件 0 命中，扫描面已含根入口）、typecheck×3 全绿；回归全跑 14 项全通过
（p1-smoke **314/0 一条断言未改** ⇒ 缺省 URL 零变化；p22-verify 104→105 含新增"基址单一来源"断言；
p23-verify 107/0；p24-ui-matrix 718/0；p22-cards-ui 79/79；p21 53/53；p24-verify 63/63；p22b 17/17；
q2 14/14 与 21/21；master-merge-fidelity 38/38；backup-write-test 23/23；p2-smoke 16/16）。
单标签页断言（`registrations==1`）原样通过，P6 面板纪律未被破坏。
