# P0 侦察报告 —— toolkit 泛化改造（G1–G4）

> 日期：2026-09-19。本文是《toolkit 泛化规格》P0 阶段产物：现状映射表 + 规格落地映射 + 风险清单 + 开放问题答案。
> 依据纪律：先侦察后动工，本文完成后停下等待用户确认。
> 引用格式 `文件:行号`，行号为 2026-09-19 工作树快照（toolkit @ d1371cf，工作树干净）。

---

## 0. 运行环境事实（侦察基线）

| 项 | 事实 | 证据 |
|---|---|---|
| 宿主 CLI | `@deepseek-ai/dsh@0.1.5-rc.1`（全局 npm），描述"boot a DeepSeek Harness profile / plugin management" | `dsh --help`；npm 全局列表 |
| 运行时 | `@deepseek-ai/cordis@4.0.2`，导出 context/events/fiber/registry/service 标准机制（`ctx.plugin`、`ctx.effect`、Service 基类、事件总线、DI inject） | toolkit `node_modules/@deepseek-ai/cordis/src/index.ts`、`node_modules/@deepseek-ai/cordis/src/registry.ts`（第 1-80 行，当时） |
| 宿主 cordis 插件 | dsh CLI 依赖 `cordis-plugin-loader / hmr / include / timer` | 全局 dsh `package.json` dependencies |
| profile | `~/.dsh/profiles/web`，pnpm workspace；`dsh.profile.bundles` 声明 bundle 装载序 | profile `~/.dsh/profiles/web/package.json`（第 11-22 行，当时） |
| 装载模型 | patch 层合成：各 bundle 的 `dsh.bundle.patch` → profile `cordis.patch.yml` → `--patch` 覆盖；`- insert` 行 `name:` = 模块说明符，宿主 import 后按 cordis 约定实例化 | profile `~/.dsh/profiles/web/cordis.yml`（第 1-4 行，当时） 注释；toolkit `toolkit:package.json`（第 26-30 行，当时） |
| 子插件导出约定 | ESM 命名导出 `name` / `inject` / `apply(ctx, config)`（或 default 对象）；无统一 Config Schema 导出 | `lib/rate-throttle/index.js`（第 66-67、149 行，当时）、`lib/search-router/index.js`（第 27-29 行，当时）、`lib/agent-memory/plugin.js`（第 19、105、276-277 行，当时） |
| Schema 体系 | 宿主标准为 schemastery（toolkit 依赖 `@deepseek-ai/schemastery`）；但 web-search-local 实际用 **zod** 导出 `Config` | `web-search-local` （已随 S1 剔除批出包） 原 index.js 的 `Config`；toolkit `toolkit:package.json`（第 36 行，当时） |
| 动态装载先例 | toolkit 全仓 **无任何 `ctx.plugin(` 调用**——装载权全在宿主，toolkit 是"被动装载的兄弟集合"，不是运行时意义上的桶 | 全 lib+panel grep 零命中 |
| 运行版本 | Node v24.19.0（engines >=22 满足）、pnpm 11.22.0、Windows 10 22631 | 实测 |
| 测试/CI | `npm test` = `pluggable-lint` + `node --test`；**无 .github/CI 配置、无 typecheck**（全仓纯 JS，无 tsconfig） | `package.json`（第 5-7 行，当时）；`scripts/pluggable-lint.mjs` |
| 仓库纪律 | git 仓库，台账式提交（Conventional Commits + L-编号判定流），AGENTS.md 六条红线（兄弟零静态 import、零 eager re-export、doctor 声明文件驱动等） | `AGENTS.md`（第 1-12 行，当时）；git log |

---

## 1. 现状映射表

### 1.1 五个子插件 + 面板的装载方式

| 成员 | 代码位置 | 导出形态 | 装载路径（boot 时谁插入它） | manifest |
|---|---|---|---|---|
| rate-throttle | `lib/rate-throttle/index.js` | `name`/`inject:["llm","tokenMeter"]`/`apply` | toolkit bundle patch `- insert: id: rate-throttle`（`cordis.patch.yml`（第 14 行，当时）） | 有（`lib/rate-throttle/dsh.plugin.json`） |
| web-search-local | `web-search-local` （已随 S1 剔除批出包） 原 index.js | `Config`(zod)/default | 同上，`id: web-search-local`（`cordis.patch.yml`（第 58 行，当时）） | 有 |
| search-router | `lib/search-router/index.js` | `name`/`inject:["web"]`/default | 同上，`id: web-search-router`（`cordis.patch.yml`（第 64 行，当时）） | 有 |
| agent-memory | `lib/agent-memory/plugin.js`（运行时入口）+ `lib/agent-memory/lib/index.js`（被兄弟惰性探测的库入口） | `name:'agent-memory-runtime'`/`register`=apply，**双入口** | patch insert `id: agent-memory-runtime, name: '@local/dsh-toolkit/agent-memory/plugin'`（`cordis.patch.yml`（第 74 行，当时）） | 有 |
| compact-router | `lib/compact-router/index.js` | `name`/inject/default | **特殊**：不在 cordis.patch.yml；由 `scripts/apply-preset-patch.mjs` 改写 agent 预设 `~/.dsh/.agent-presets/*/agent.cordis.yml`（实测 liangshen 预设 :286），状态记于 `preset-patch-state.json` | 有（含 `optionalDeps: [agent-memory]`） |
| 面板 toolkit-manager | `panel/index.js` | `name`/`inject:["webServer"]`/`apply` | patch insert `name: file:///D:/dsh-plugins/dsh-toolkit/panel/index.js`——**file:// 绝对路径**（`cordis.patch.yml`（第 82 行，当时）） | 有 |

要点：

1. **"静态/半静态"的本质**：装载 = patch 文本里的 `insert` 行 + 预设文件改写。增删插件 = 改 patch 文本 + **重启 dsh web 生效**。toolkit 对装载过程零参与。
2. 顶层 `dsh.plugin.json` 的 `aliases` 把五个旧包名映射到 toolkit 子路径导出（`dsh.plugin.json#aliases`），兼容旧引用；doctor 的引用完整性检查消费它。
3. 每个 lib 子插件已有自己的 `dsh.plugin.json`（`manifestVersion: 1`），声明 `requirements{runtime{node,dsh}, binaries, packages, registers{inject,events,services,commands,providers}, exports}` 与部分 `optionalDeps`——**已存在一套 manifest 体系 v1**，由 doctor 消费（宿主运行时不读它，grep 宿主 lib 无 `dsh.plugin.json` 命中）。

### 1.2 Doctor（1 个）

| 维度 | 事实 |
|---|---|
| 位置 | **独立仓** `@local/dsh-toolkit-doctor` @ `D:\dsh-test-sandbox\projects\doctor`（不在桶内），零 npm 依赖，4 个源文件 |
| 架构 | `cli.mjs`（参数/确认/退出码，默认 dry-run）→ `engine.mjs runDoctor`（纯只读检查，~1600 行）→ `executor.mjs`（apply/rollback 写侧：文件锁、doctor-backups、"doctor-patch-state.json" 回滚链（运行时产物、非仓内可核，读写在 `doctor仓:src/executor.mjs`）） |
| 检查清单（8 类） | ① schema 语法/清单校验（utf8-bom/json/yaml/required/requirements）② 声明自检（alias/exports 目标存在性）③ 引用完整性（热配置与预设/patch 里的 `@local/…` 引用可解析、stale-in-backup）④ 环境预检（node/dsh 版本、PATH 二进制）⑤ 包依赖（manifest packages.$from + createRequire 模拟解析、版本域）⑥ 跨目录链接（pkg.resolution-outside-scope）⑦ 注册冲突（reg.name-collision、inject face 未知，对照 `host-faces.json`）⑧ 挂载/provider 三检查（body-without-row / row-without-body / custody-archived / provider.dangling / missing-provider） |
| 去硬编码机制 | `doctor-signals.json`（toolkit 根）声明 hostProviderKeys/providerDependencies；engine 零插件名，事实全部来自声明文件 + 磁盘 manifest。**残留硬编码**：默认 scope `D:\dsh-plugins\dsh-toolkit`、yaml 从宿主全局安装路径动态 import（`doctor仓:src/engine.mjs#YAML_DEFAULT_URL` 绝对 URL）、面板侧 doctorCli 硬编码沙箱路径 |
| 输出结构 | `schemaVersion / generatedAt / scope{plugins} / environment / summary{error,warning,info,safe,rewrite,destructive,manual,fixable} / issues[]{id,category,severity,file,line,occurrence,message,old,new,fix{class,plan}}` |
| 验收纪律 | `0/0/0`（error/warning/info 全零），AGENTS.md 红线 6；缺席/缺依赖类只产 info/warning 绝不 error |
| 运行时监测 | **没有**。纯一次性静态扫描；无 setInterval/watch/服务；被面板以 `execFile` 子进程按需调起（**缺省 180s、`--states` 用 60s**，见 `panel/manager/doctor-runner.mjs` 的 `spawnDoctor`。本行原写"120s @ `:3-32`"：120s 是 2026-09-18 诞生时的真值，`b3b1575`（09-19）放宽后未回填，且该过期值被 `docs/migration.md` §6 复制过一次 —— 两处已于 2026-09-22 条文审定轮一并更正） |

### 1.3 管理面板栈

| 维度 | 事实 |
|---|---|
| 双入口 | ① React client bundle：`window.__ModuleLoader__.load({id, factory})` + `ctx.slots.inject("settings.plugins.tab")`（slot id `toolkit-panel`、order 90 硬编码，`panel/client/index.js`（第 1339-1347 行，当时）），使用宿主提供的 React；包侧声明 `dsh.client.platform:"web"`（`panel/package.json`（第 12-15 行，当时））。② 独立兜底页 `panel.html`：服务端内存直出 `GET /api/toolkit-panel/ui`（`panel/index.js`（第 276-285 行，当时）），原生 JS 无框架 |
| 服务端 | `toolkit-manager` 插件（`panel/index.js`（第 40-41 行，当时）），inject `webServer`，注册 15 条 exact 路由 `/api/toolkit-panel/*`（snapshot / plan / execute / toggle / config / uninstall / restore / mount / custody / doctor dry-run / plan-status） |
| 安全 guard | 写路由 = loopback socket + (Host loopback OR `remoteWebUiPairing` 服务严格校验，fail-closed) + CSRF（sec-fetch-site/origin）；读路由允许配对设备 hasOwn 兜底（`panel/index.js`（第 229-249 行，当时）） |
| 实时通道 | **没有**。无 WS/SSE/EventSource/轮询（全文 grep 零命中）；更新 = 手动点刷新 + 每个写操作成功后重新拉 `/snapshot` |
| 交互范式 | 全部操作 plan → 确认 → execute 两段式：diff 预览、expectedSha 冲突检测、有效期、写前备份（`.panel-write-backups`）；卸载需知情确认（手动输入插件名，软 1 次/真 2 次）；生效 = 重启 dsh web |
| 硬编码盘点（D2 违规面） | 服务端：`plugin-registry.mjs` PLUGINS 五项 + DEPENDENCIES（:10-61）；`config-whitelist.mjs` 18 字段且仅 rate-throttle 可编辑（CONFIG_EDITABLE_ROW）；`snapshot.mjs` ORIGINS/ROW_IDS 映射（:17-34）。客户端：`CN_NAMES`/`DESCRIPTIONS`/`P24_CN`/`UNINSTALL_COPY`/`CONFIG_FIELDS` 常量表；逻辑分支：compact-router 不渲染启停且恒报"运行中"（`panel/client/index.js`（第 247-250、392 行，当时））、search-router 只读 mode 行（:360-362） |
| 深度生命周期资产 | 软卸载（台账可恢复）/ 真卸载（销毁式 v2，无副本，出收据）/ 保管区 `.panel-custody` / 恢复冲突三态（hostKey A/B/C）/ 重装后挂载——REQ-5 重做面板时**必须保留语义**（这是最近一个大批次验收成果） |

### 1.4 配置持久化

| 层 | 位置 | 语义 |
|---|---|---|
| boot 权威 | patch 层（bundle `cordis.patch.yml` + profile patch + `--patch`），行内 `config:` | 重启生效；面板 P2.3 结论"18/18 = patch 激活快照 ⇒ 重启生效，无遮蔽" |
| 热配置 | `~/.dsh/dsh-*.json`：`dsh-search-router.json`（每次调用重读，热切换）、`dsh-rate-throttle.json` + `dsh-rate-throttle-learned.json`（主配置 + 学习 limits） | 插件自读自管，panel 不碰 |
| 面板写回 | plan/execute 文本改写 `cordis.patch.yml`，sha 校验 + 备份 | 仅白名单标量（18 字段）+ 启停（patch-row.disabled，`!!js` 条件表达式拒绝改写） |
| 其他 | `~/.dsh/settings.yaml`（dsh-settings 服务体系）；`preset-patch-state.json` + `preset-backups/`（compact-router 预设挂载态）；`.panel-custody/`（真卸载收据/保管区） | doctor 检查消费 |

### 1.5 dsh-web-all 与宿主接入

- `@linxin666/dsh-web-all@0.3.21` **真实存在于当前 profile 且作为 bundle 启用**（profile `~/.dsh/profiles/web/package.json`（第 5、17 行，当时））。第三方项目（Apache-2.0，repo `github.com/zhu1090093659/dsh-web`），聚合 20+ 子模块：plugin-manager / market / doctor / task-board / remote-web-ui / skin-center / community-plugins 等，每个子路径都是同一 shell 出口。
- 它自带 **plugin-manager**（`@linxin666/dsh-client-ui-plugin-manager`）：与本面板功能重叠——同样编辑 patch 行（`setRowEnabled` + `writePatchAtomic`）、同样 loopback 自护、路由前缀 `/api/plugin-manager`；client 侧有 connection rpc channel 先例。api-notes.md（`panel/docs/api-notes.md`，前任 P0 产物）已对其做过源码级核实。
- 安装渠道现状四条：`dsh plugin add <pkg>`（转发 pnpm 装进 profile，`dsh --help`）、dshmarket 市场 bundle、dsh-web-all PM 的行管理、toolkit 面板（仅限 5 插件卸装/恢复/挂载）。
- toolkit 面板与 dsh-web-all 各 tab 在 `settings.plugins.tab` slot 共存，靠 order 排序，互不感知。

---

## 2. 规格落地映射（REQ → 现状 → 落点）

| REQ | 现状基础 | 落点与做法 |
|---|---|---|
| REQ-1 契约 | 已有 manifest v1（JSON，doctor 消费）；无契约版本概念 | 新建 `contract` 模块（类型 + 校验 + `PLUGIN_CONTRACT_VERSION='1.0.0'`）。**关键映射决策**：磁盘 manifest 沿用 `dsh.plugin.json` 就地扩展（新增 `id/displayName/version/contract/requires.envVars/ports/fsPaths/externalApis`），**函数型成员（configSchema 校验器/panels/healthCheck）放模块命名导出**（JSON 放不下函数）；`contract` 与旧 `manifestVersion` 字段并存、互不替代 |
| REQ-2 Registry | 无任何运行时 registry；装载权在宿主 patch | 新增 registry 服务：install = 解析来源 → 读 manifest → precheck → 落安装记录 → `ctx.plugin()` 装入派生 ctx → active。legacy 适配器包装无 manifest 插件。状态持久化走新状态文件（见 Q4） |
| REQ-3 Precheck | doctor engine 已覆盖 1/2/4/7/11 的一半（node/dsh/二进制/包解析/config 引用） | 把 doctor engine 的**只读检查函数**抽为可进程内复用模块；新增 envVars（存在性、禁打印值）/端口/fsPaths/externalApis/configSchema 默认值校验/legacy 可加载性；输出对齐 `PrecheckReport{blocking,warnings,changes,legacyMode}`，issue→fix 映射到 `fix.summary/steps/docsUrl` |
| REQ-4 Doctor 服务 | 纯静态 CLI，无周期、无事件 | 桶内新建 doctor **服务**（规则引擎）：内置规则 = 现有 engine 检查迁入（行为向后兼容）+ `doctor-signals.json` 机制保留 + `registerRule` 扩展点；manifest.requires 自动合成规则；watchInterval 周期巡检 + failureThreshold 降级 + 环形 historySize。CLI 保留为薄壳（调同一 engine，向后兼容面板 dry-run 与验收脚本） |
| REQ-5 面板 | 双入口（React 页与 `panel/client/panel.html`）；卡片数据驱动但文案/字段/分支硬编码；无实时 | 数据源改为 registry/doctor 服务 + 事件流；文案/配置表单由 manifest 驱动（configSchema → 表单自动生成）；保留 plan/execute + guard 安全范式用于危险操作；P2.4 卸装/恢复/挂载语义原样保留为 registry 的操作实现层；实时通道选型见 Q3 |
| REQ-6 错误隔离 | 红线体系已保证"静态零耦合"；无动态隔离 | 每子插件独立派生 ctx；加载/运行错误捕获 → status=error/quarantined + lastError；指数退避重试（默认 3）；toolkit dispose 级联清理；新增监听器/定时器计数归零的验收测试（S5） |
| REQ-7 持久化恢复 | patch 行 = boot 权威；无安装记录 | 安装记录/enabled/config/隔离原因/lastError 落状态文件；autoload 重启恢复；与 patch 行的优先级模型见 R2 |
| REQ-8 嵌入 | toolkit **无包级入口**（无 `.` 导出）；面板行是 file:// 绝对路径 | 新增包级入口（`exports['.']`）：装配 registry+doctor+panel；导出自身 manifest（id 建议 `dsh/toolkit`，requires 自述）；服务/事件名全部 `${servicePrefix}/…` 可配置；doctor 独立巡检自己的子插件 |
| REQ-9 迁移 | 5 子插件各有 manifest v1；doctor 独立仓；面板硬编码见 1.3 | 逐插件补齐契约字段（id 沿用 `<scope>/<name>`：`dsh/rate-throttle` 等）、doctor 硬编码检查迁 requires、补 configSchema（rate-throttle 18 白名单字段为起点）、面板去硬编码；旧导出与配置键留 @deprecated 别名一个次要版本 |
| REQ-10 可观测 | console 日志；无结构化字段 | 用 cordis logger facade；统一 `pluginId/event/durationMs/errorCode`；审计事件 7 类 |

---

## 3. 风险清单

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| R1 | **双 manifest 体系**：规格 `DshSubPluginManifest` vs 现存 `dsh.plugin.json` manifestVersion:1；字段有交集（requirements/binaries）也有新增（contract/envVars/ports…）。`contract` 与 `manifestVersion` 语义须切割清楚 | 契约落地混乱、doctor 双轨解析 | 就地扩展 dsh.plugin.json，`contract` 为新字段；contract 模块统一校验新旧全集；P1 出正反 fixture |
| R2 | **运行时 reload 无先例**：现有一切管理 = patch 文本 + 重启生效；`ctx.plugin()` 动态装入在 DSH web 运行时未验证（cordis-plugin-hmr 在宿主依赖里存在，但 web profile 是否接线未知）。patch 行（boot 权威）与 registry 状态（运行时）会成为双事实源 | G1/G3 的"真实生效"可能退化为"重启生效" | P2 开工前先做装载 spike（在真实 profile 上以一个最小插件验证动态装入/卸出/重载）；定义优先级模型：boot=patch 行，运行时=registry 状态，重启后 registry autoload 以记录为准 |
| R3 | **G1 范围歧义**："任何 DSH 插件动态装入"——若是 npm 新包，运行中进程改 profile node_modules（pnpm add）风险高，与宿主 `dsh plugin add` 职责重叠 | 越界与稳定性 | 建议分期：P2 仅支持"本地路径/已可解析模块"；npm 来源后置并复用 profile 级 pnpm（见 Q1） |
| R4 | **doctor 在桶外 + 三处绝对路径**（面板 doctorCli→沙箱、doctor 默认 scope、doctor yaml URL→宿主全局），直接违反 D5 无根假设 | 嵌入场景必然失效 | P3 把 doctor engine 迁入桶内为服务模块；三处路径改为：scope=toolkitRoot 推导、yaml 用本仓依赖、doctorCli 变为进程内调用 |
| R5 | **compact-router 预设装载路径特殊**：由 apply-preset-patch.mjs 改写预设文件，registry 接管生命周期会与预设机制双轨 | S6 回归红 | registry 将"预设"作为一种安装来源/挂载面保留；compact-router 迁移时预设改写脚本保留为 legacy 适配，实测走查 |
| R6 | **双 Schema 体系**：schemastery（包依赖）vs zod（web-search-local 实际用）；宿主表单标准是 schemastery | configSchema 契约选型摇摆 | 契约规定 configSchema = **schemastery Schema 对象或其可序列化描述**；zod 的在迁移期做适配转换；P1 定稿 |
| R7 | **面板双渲染器**（React client + panel.html）与大量硬编码文案/分支 | REQ-5 工作量 ×2 | 建议通用渲染只做 React client 一份，panel.html 降级为"受限只读视图"或废弃（见 Q 决策 N3） |
| R8 | **P2.4 深度生命周期回归面大**：软/真卸载、保管区、恢复三态、挂载的验收资产（p24-verify 53 项、ui-matrix 666 项）必须全绿 | S6 红 | registry 的卸装/恢复/挂载直接复用 `panel/manager/uninstall.mjs` 既有实现层，面板只换数据源，不重写语义 |
| R9 | **无 CI、无 typecheck**：DoD 要求 CI（typecheck/lint/unit/contract/e2e）全绿 | 门禁无载体 | P1 一并补 GitHub Actions（或本地 gate 脚本），TS 范围见 Q 决策 N1 |
| R10 | **Windows 特有**：junction 链接问题有前科（.doctor-link-backup 现场）、路径大小写、fs.watch 行为 | fsPaths 探测、包解析预检不可靠 | 预检用 realpath 归一（doctor 已有同款处理）；S 场景在 Windows 实机跑 |
| R11 | **安全红线**：新 registry 路由必须沿用 loopback+配对+CSRF guard（写 fail-closed）；禁止在日志/报告输出 envVar 值 | 安全回退 | guard 抽公共模块复用；precheck 的 envVar 检查只输出"存在/缺失"布尔 |
| R12 | **面板行 file:// 绝对路径装载**（`cordis.patch.yml`（第 82 行，当时））违反无根假设 | 嵌入失败 | 迁移为包子路径 `@local/dsh-toolkit/panel`（panel 已有 manifest 与 exports，仅改 patch 行 name） |
| R13 | **registry 装入判定依赖 cordis 内部实现**（P2/R2 结论）：fiber.state 枚举值（2=ACTIVE/3=FAILED/4=DISPOSED）、FAILED 时 `fiber.await()` 以启动错误 reject、模块命名空间插件 apply 返回 Promise 被视为后台任务（立即 ACTIVE）——均为 cordis 4.0.2 的实现行为而非稳定契约 | cordis 升级可能使装入判定失效（误判 active/failed） | 装入判定收敛在 registry/src/registry.ts 单点（FIBER_* 常量 + 轮询循环）；cordis 升级时必跑 S1/S4 场景回归；该依赖已写入 registry.ts 头注 |

---

## 4. 开放问题答案（Q1–Q5）+ 新发现决策点

### Q1 安装来源范围

现状渠道四条（见 1.5）。**建议**：toolkit registry 的 `PluginSource` 分期实现——
1. **P2 必做：本地路径**（含目录/子路径模块说明符；`link:` 安装的 toolkit 自身即范例）；
2. **后置：npm 包**——复用 profile 级 `dsh plugin add`（pnpm）语义，运行中安装需重启窗口，不承诺热装；
3. **不做：内部 registry / 市场**（dshmarket 已是独立市场，重复建设无收益，除非用户另有要求）。

### Q2 dsh-web-all 是否我方控制

**事实**：`@linxin666/dsh-web-all` 是第三方 GitHub 项目（zhu1090093659/dsh-web），经包管理器安装进 profile。除非用户即该仓库作者/维护者，否则**不可提 PR**。默认按"不控制"处理：toolkit 以普通 bundle 身份被其宿主装载（现状已共存），REQ-8 的"可选集成补丁"不做，G4 验收用 mock 桶 + 同进程双实例。

### Q3 面板技术栈与实时通道现状

- 技术栈：React client bundle（宿主 ModuleLoader + slots）+ 独立 panel.html 兜底页（见 1.3）。
- 实时通道现状：**无任何推送/轮询机制**，纯手动刷新 + 操作后刷新。
- **建议**：P4 新增轻量通道——首选 **SSE**（`webServer` exact 路由拿到原生 res 可流式，零新依赖，复用现有 guard），registry/doctor 事件推给面板；连接失败自动退化为对 `/snapshot` 的 3s 版本号轮询。次选：纯版本号轮询（最保守）。不采用 dsh-web-all PM 的 rpc channel（依赖第三方实现细节，违反 D5）。

### Q4 配置持久化位置与格式现状

现状三层（见 1.4）。**建议**新体系落点：
- 契约配置（`servicePrefix/autoload/doctor/registry/plugins`）：toolkit 根插件 patch 行 `config`（boot 权威，与现有体系一致，面板可继续用 plan/execute 修改）；
- registry 运行状态（安装记录/隔离原因/lastError/健康历史）：独立状态文件（建议 `<toolkitRoot>/.registry/state.json` 或 `~/.dsh/toolkit-registry.json`，**待定**，默认取前者并 gitignore）；
- 子插件 config：写回仍走 plan/execute 改 patch 行（boot 权威），同时支持运行时热生效（registry 派发到活动插件）；`~/.dsh/dsh-*.json` 热配置仍归各插件自管。

### Q5 是否需要 CLI

按规格默认：**面板优先，CLI 后置**。`dsh plugin add` 已覆盖 profile 级安装；toolkit 级 CLI（`toolkit install/list`）挂起，待面板稳定后评估。

### 新发现决策点（规格未覆盖，需用户裁决）

- **N1 TypeScript strict 的范围**：规格 §8 要求 TS strict，但现状全仓纯 JS（无 tsconfig）。选项 A：仅新模块（contract/registry/doctor 服务）用 TS strict，存量 JS 保留 + JSDoc（推荐——符合"映射仓库现有代码风格"与禁止破坏存量）；选项 B：全仓迁 TS（工程量大、S6 回归风险高）。
- **N2 doctor 仓库归宿**：建议 engine 迁入桶内（`lib/doctor` 或 `doctor/`）作为服务模块，沙箱仓保留 CLI 薄壳转发（或废弃）；`doctor-live-report` 等验收脚本路径随之更新。
- **N3 panel.html 兜底页去留**：建议降级为只读受限视图（保留 403/loopback 场景可用性），不再承载写操作；或直接废弃。
- **N4 toolkit 根入口 id**：建议 `dsh/toolkit`（`<scope>/<name>` 与 spec 示例一致）；子插件 id 建议 `dsh/rate-throttle` 等。

---

## 5. 结论与下一步

现状与规格的最大差距按序：① 装载权在宿主 patch（G1 需反转到 toolkit 内 `ctx.plugin` 派生 ctx，且运行时动态装载未验证——R2 spike 必须最先做）；② doctor 是桶外静态 CLI（G2 需进程内规则引擎 + 周期巡检，R4 路径三处硬编码）；③ 面板是"patch 文本编辑器"（G3 需数据源整体切到 registry/doctor 事件流，且 P2.4 深度生命周期资产必须原样保留）；④ toolkit 无包级入口、面板行 file:// 装载（G4 前置改造）。

P0 产出完毕。**按执行纪律停下，等待用户确认后进入 P1（契约模块）。** 上表 N1–N4 与 Q1/Q3 的建议若被否决，请直接批注。

---

## 6. 用户裁决记录（2026-09-19，P0 确认通过，即日开工 P1）

| # | 裁决 | 附加要求（对后续阶段的硬约束） |
|---|---|---|
| Q1 | 安装来源：**P2 仅做本地路径**；npm 后置 | PluginSource 抽象保证追加 npm 来源是**纯增量**（不改契约、不改 registry 主流程）；precheck 对任何本地路径一视同仁，禁止为特定插件特判 |
| Q2 | dsh-web-all **不控制**：不提 PR、不做集成补丁；G4 用 mock 桶 + 同进程双实例验收 | P6 完成后追加一次**真实 dsh-web-all 手工冒烟**：不改对方任何代码，把 toolkit 当普通插件装入、运行、卸载；装不上或有残留 = toolkit 自身违反 D5 的 bug，修 toolkit 不许改宿主 |
| Q3 | 实时通道：**SSE + 版本号轮询兜底** | 断连自动降级轮询、恢复自动切回 SSE，两条路径都要有测试；SSE 推送内容必须来自带 servicePrefix 前缀的 registry/doctor 事件流，**禁止另开旁路状态** |
| N1 | TS 范围：**仅新模块（contract/registry/doctor）TS strict**，独立 tsconfig；存量 5 插件与 panel 保持 JS + JSDoc | ① 这是对规格 §8 的**正式豁免**，写进文档和 CHANGELOG；② CI 增加 typecheck 门禁跑新 tsconfig，不能只放文件不检查；③ contract 模块产出 `.d.ts` 供 JS 侧 JSDoc 引用，公共类型仍统一从 contract 导出 |

N2/N3/N4（doctor 迁桶内、panel.html 降级只读、id 前缀 `dsh/`）按报告建议执行，未收到否决。
