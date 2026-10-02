# 把 toolkit 嵌进宿主 / 把 toolkit 当普通插件装载（P7，REQ-8）

> 建立：2026-09-20。两条方向分开说：**A. 宿主装 toolkit**（G4 的"被装载"方向）；
> **B. toolkit 装别人**（G1，见 `docs/add-sub-plugin.md`）。边界与没做到的事在 §5，不夸大。

## 1. 装载面事实：toolkit 是一个普通 DSH 插件

- 包级入口：`package.json` `exports["."] = "./index.js"`；另有 `exports["./panel"]`（R12：
  面板挂载行可由 `file://` 绝对路径迁到包子路径）。
  **别把这一句当入口解析的全部事实**：本仓根 manifest 的 `requirements.exports` 写的是
  `{"$from":"package.json#exports"}`（**套件根的强制继承形式**），所以最终仍解析到 `./index.js`。
  四级顺位、legacy 顶层位的告警、`$from` 的两条硬规则、"显式声明不回退"红线与可观测面的**正本叙述**
  在 `docs/add-sub-plugin.md` §2 要点 1（行为口径归本仓契约 §4，必填性归独立 doctor ⇒ §7 D-7）。
- 模块形态（`index.js`）：`name = 'dsh-toolkit'`、`inject = ['webServer']`（与面板同源）、
  `apply(ctx, config)` **委派给** `panel/index.js`——面板一直是 registry + doctor 的装配现场，
  根入口不复制逻辑，避免出现第二个装配点。
- 自描述：根入口 `export const manifest`，内容 = 读盘上 `dsh.plugin.json` 过
  `validateManifest`（**唯一事实来源是那份 JSON**；校验失败即抛，宁可装不上也不带错误自描述去预检别人）。
  `id = dsh/toolkit`、`requires.services = ["webServer"]`（**语义是"本插件依赖宿主注入 webServer"**，
  与模块的 `inject` 是两处独立声明、互不桥接；另注意该字段当前还被装载器归一进"注册面"并被冲突检查
  当提供面比对 ⇒ 经面板装 toolkit 根之后再装任何需要 `webServer` 的插件，会被 `reg.name-collision`
  拒装。`docs/contract.md` §2.1 与 §7 D-10，批 2 纠正）、
  `panels` 只有一个描述符（宿主不读它，见 §5 第 1 条与 `docs/contract.md` §7 D-8）。
- 装载本入口与装载 `dsh-toolkit/panel` 是同一个面板的两种入口写法，**同一进程内二选一**
  （两个都装 = 同名路由注册两次；前缀不同则各管各的）。
- 装载本入口与装载 `dsh-toolkit/panel` 是同一个面板的两种入口写法，**同一进程内二选一**
  （两个都装 = 同名路由注册两次；前缀不同则各管各的）。

## 2. 宿主只需要做两件事

```js
const toolkit = await import('dsh-toolkit')      // 或按宿主自己的插件装载机制
toolkit.apply(ctx, { servicePrefix: 'mybucket' })       // config 全部可选，缺省=历史行为
```

`config` 可用的键（`configSchema` 逐键声明，且由 `test/p7-embed.test.mjs` 反向锁死"新增 config 键
必须同步 schema"）：

| 键 | 作用 | 缺省 |
|---|---|---|
| `servicePrefix` | 服务名 / 事件名 / **HTTP 路由基址**三张表的命名空间 | `toolkit` ⇒ 与历史逐字节相同 |
| `toolkitRoot` | 面板 patch 域操作的仓根（读 `cordis.patch.yml`、写回也在此），**同时也是安装记录/审计流水的锚定根** | `panel/` 的上一级——按**模块自身位置**推导（唯一推导点 `panel/manager/toolkit-root.mjs`），**与宿主进程 cwd 无关**（H1 / D-11；修复前 registry 侧按 `resolve(process.cwd(),"..")` 算，落点会随启动方式漂到 `C:\Windows\.registry` 这类位置）。优先级：显式 `config.toolkitRoot` > 模块位置推导 |
| `registry.statePath` / `registry.dataDir` | 安装记录 / enabled / config / 隔离原因 / lastError 落盘位置 | `<toolkitRoot>/.registry/state.json` |
| `registry.autoload` | 重启后按记录自动恢复（REQ-7） | `true` |
| `registry.retryLimit` / `retryBackoffMs` / `loadTimeoutMs` / `saveDebounceMs` | 错误隔离与退避（REQ-6） | 3 / 500 / 30000 / 0 |
| `doctor.watchInterval` / `failureThreshold` / `historySize` | 周期巡检、连续失败降级、环形历史 | 30000 / 3 / 20 |
| `doctorCli` | 仓级文件面检查的 CLI 路径（**按裁决留在独立仓**） | config → env `TOOLKIT_PANEL_DOCTOR_CLI` → 本机开发布局现值 |
| `devicesFile` / `backupRoot` / `doctorConfigRoot` | 配对设备表 / 写前备份根 / doctor `--config-root`（测试用） | 各自 env 兜底后为 `~/.dsh/...`、`<toolkitRoot>/.panel-write-backups`、不传 |

## 3. 前缀化后你得到什么（同进程多实例）

`servicePrefix` 一改，三张表同时跟着走，缺省值下**一切 URL 与名字零变化**：

| 面 | 缺省 `toolkit` | 换成 `tk2` |
|---|---|---|
| 服务 | `toolkit/registry`、`toolkit/doctor` | `tk2/registry`、`tk2/doctor` |
| 事件（契约枚举内 5 个） | `toolkit/registry:plugin-added`、`…plugin-removed`、`…status-changed`、`…health-changed`、`toolkit/doctor:issue-found` | `tk2/…` 同名一套 |
| 事件（审计 8 个，**当前不经 `contractEventName`**） | `toolkit/audit:{installed,removed,enabled,disabled,reloaded,quarantined,config-changed,state-save-failed}` | `tk2/audit:…` 同名一套 |
| HTTP（33 条） | `/api/toolkit-panel/{ui,snapshot,plan,execute,plan/status,toggle/plan,config/plan,uninstall/plan,uninstall/execute,custody,restore/plan,restore/execute,mount/plan,mount/execute,doctor/dry-run,doctor/states,doctor/apply/plan,doctor/apply/execute,doctor/rollback/plan,doctor/rollback/execute,snapshot-restore/plan,snapshot-restore/execute}` + `/v2/{snapshot,health,memory/search,install/precheck,install/confirm,uninstall,enabled,reload,config,events}` + `/v2/connector.js` | 同样 33 条，整体前缀换成 `/api/tk2-panel/…` |

验收证据：`test/p7-embed.test.mjs`（双实例路由零冲突、A 装的插件不进 B、B 的 SSE 收不到 A 的事件、
缺省实例 33 条路由与 p1-smoke 逐条一致）；`panel/docs/evidence/P7-MOCK-BUCKET-LOOP.md` 第 8 步
（真浏览器打开 `/api/tk2-panel/ui`，页内 `PANEL_API` 已随前缀改写，交叉访问两侧互 404）。
（S4 F-37 批随批：`GET /v2/memory/search` 入表 ⇒ 32→33，只读闸 10→11；见 §4.1。）

同进程双实例的表行由 `test/toolkit-services.test.mjs` 锁死：两个实例挂在**同一个**根
ctx 上，`toolkit/*` 与 `tk2/*` 两组服务名各自可查、互不撞名（cordis 对同名重复注册直接
抛错，撞名当场就装不上）。服务面的注册现场唯一，在面板装配器
`panel/manager/registry-host.mjs`（`registry` 经 `registry.start()`、`doctor` 紧随其后），
两者都由 cordis 的 fiber 归属自动随面板卸出而注销。

**双实例必须各自给 `registry.statePath`（或 `dataDir`）**：缺省状态文件按 `toolkitRoot` 推导，
同一 `toolkitRoot` 的两份实例会共用同一份安装记录——这是配置责任，不是路由冲突。
（H1 之后"缺省"是稳定的仓根，不再随启动目录漂移；但两份实例同仓根 ⇒ 仍共用记录，照旧要显式给。）

**落盘是否真的在落，面板会说**（H1 / D-11）：`/v2/snapshot` 带 `durability`（`state` = 安装记录、
`audit` = 审计流水两面），任一面写不下去时面板顶部点名路径 + 给可执行建议，插件卡片状态标注
"未落盘（重启会丢）"，同时发 `audit:state-save-failed`。装配期落点连目录都建不出来**不再让面板
装不上**（只降级并申报）；但请注意显式 `auditLog: false` 或宿主无事件面时审计本来就不落盘，
那时 `durability.audit.ok` 为 `false` 是配置结果，不是故障。

## 4. 面板 guard 的前提（P7.4）

面板**不假设自己拥有根 webServer**：它只用被注入的 `ctx.webServer.register(route)`，
卸出时逐条注销（`test/p7-embed.test.mjs` 断言 33 条全部注销、活动句柄不增一个）。安全判定：

- 只读：loopback socket **AND**（Host 是 loopback **OR** 宿主 `remoteWebUiPairing` 服务判定已配对
  **OR** 该服务缺席时退到 `devicesFile` hasOwn 兜底）。
- 写：loopback socket **AND**（Host loopback **OR** 服务严格校验），**禁止 hasOwn 兜底**（P2.0②），
  外加 CSRF（`sec-fetch-site ≠ cross-site` 且 `origin.host == Host`）。
- **"loopback"的取值域（★5 定稿，此前两份文档都没界定过，害得 `curl localhost:3080` 按字面执行必 403）**：
  socket 对端与 Host 都只认字面量 **`127.0.0.1`** 与 **`::1`**（可带 `::ffff:` 前缀与 `[]` 包裹），
  **`localhost` 判为非本机** ⇒ 落到配对校验、匿名请求 403。经宿主隧道访问还需配对凭据；宿主自身的
  `/api/*` 面匿名一律 401（本侧不取用凭据）。历史上从未支持过 `localhost` 识别。
- 配对服务归宿主：toolkit 只 `ctx.get('remoteWebUiPairing')`，取不到就 fail-closed（拒绝），
  绝不自己造一个。

### 4.1 门禁分级口径（F-19 的"成文半边" · 2026-09-29 EXE-BOOT-015 正典化批笔 B）

> 本节只做一件事：把**现行实现里已经在跑的分级口径**写成可对照的文字（防口径漂移、给后续新增路由立基准）。
> 内容全部取自代码与实数，**没有新增约束、没有改动任何一条路由的标注或行为**。
> 归属考据见 `docs/feature-inventory-20260923.md`《C-3 两处错账复算结论》二（八锚互证）与
> `docs/repair-plan-20260923.md` §15.3；立项口径见同计划 W11 行"precheck 读目录维持、门禁分级口径统一成文"。

**一、分级怎么落成的（判据在注册处，不在 HTTP 方法上）**
每条路由注册时经 `panel/index.js#guard` 的第二个参数显式标注：`{ change: true }` ⇒ **写闸**；不给标注 ⇒
**只读闸**（`panel/manager/v2-api.mjs` 的 v2 表把 `change` 做成表字段，由同一 `guard` 消费，口径相同）。
⇒ 归类看**标注**，不看路由名字、也不机械看方法：现行表里既有"名字带 dry-run、零落盘却走写闸"的
`POST {base}/doctor/dry-run`，也有"带请求体却走只读闸"的 `POST {base}/v2/install/precheck`。

**二、两闸的实测差异（写闸＝只读闸的全部＋两重加压）**
- 只读闸（`isAllowedRead`）：loopback socket **AND**（Host 是 loopback **OR** 宿主配对服务判已配对
  **OR** 服务缺席时退 `devicesFile` hasOwn 兜底）。
- 写闸（`isAllowedWrite`）：loopback socket **AND**（Host loopback **OR** 服务严格校验），**禁止 hasOwn 兜底**
  （P2.0②），随后再加 `isSafeStateChange`：`sec-fetch-site ≠ cross-site` 且 `Origin.host == Host`。
  ⇒ CSRF 这一重**只加压在写闸上**；两闸都要求 socket 对端是 loopback 字面量（`127.0.0.1`/`::1`，
  `localhost` 判非本机——取值域见上 §4 第三条，★5 定稿）。

**三、现行全表（33 条，实数取自代码；复跑口径见本节末）**
- **只读闸 11 条**：`GET {base}/ui`、`GET {base}/snapshot`、`GET {base}/custody`、`GET {base}/plan/status`、
  `GET {base}/doctor/states`、`GET {base}/v2/connector`（下发连接件的 route），以及 v2 的
  `GET {base}/v2/snapshot`、`GET {base}/v2/health`、`GET {base}/v2/memory/search`（S4 F-37 检索路由，
  GET 形态自然归只读闸）、`GET {base}/v2/events` ＋ 下条第四项例外。
- **写闸 22 条**：v1 域 17 条＝`POST` 的 `doctor/dry-run`、`plan`、`toggle/plan`、`config/plan`、
  `uninstall/plan`、`uninstall/execute`、`restore/plan`、`restore/execute`、`mount/plan`、`mount/execute`、
  `execute`、`doctor/apply/plan`、`doctor/apply/execute`、`doctor/rollback/plan`、`doctor/rollback/execute`、
  `snapshot-restore/plan`、`snapshot-restore/execute`；v2 域 5 条＝`POST` 的 `install/confirm`、`uninstall`、
  `enabled`、`reload`、`config`。
- 两条对账：**11＋22＝33**（S4 F-37 检索路由入表前为 10＋22＝32，随批更新）；写闸 22 条的组成＝
  v1 域 **plan 族 9 条＋execute 族 7 条＋dry-run 1 条**（＝17）＋ **v2 写面 5 条**。plan 族自身零落盘，
  但它签发 5 分钟内可被对应 `execute` 消费的 token（`apply-engine` 的 `DEFAULT_PLAN_TTL_MS`，重启即空）
  ⇒ 属写链一环，与 execute 同闸顺理成章。检索路由虽会写 `<dataRoot>/search/` **派生缓存**
  （批2 批准的独立写面，读时自愈），正本零触碰、不签任何写凭据，与只读闸的 HTTP 语义（无 CSRF 加压必要）一致。
- **一条反直觉的现行标注，如实登记而不补理由**：`POST {base}/doctor/dry-run` 名带 dry-run、实现只是经
  `panel/manager/doctor-runner.mjs` 起一次 CLI 子进程做只读体检（不落盘、不签 token），却标 `change: true`
  走写闸。本节按"判据在注册标注"这条**实况**成文，**不替它发明一个代码里没有的归类理由**——
  它连同 precheck 一起说明：现行分级不是"是否落盘"的逐条机械判定，而是注册处的显式标注，
  这正是本节要把口径写下来、留给后续批次对照的原因。

**四、precheck 为何是例外（全表唯一"带请求体的 POST 走只读闸"）**
`panel/manager/v2-api.mjs#installPrecheck` 走只读闸，是因为它**不落盘、不签发任何写凭据、不改 registry 状态**：
它只做四件读事——按来源解析入口（`registry/src/loader.ts` 的 `resolveLocalSource`，**这一步会 import 候选模块，
故模块顶层代码随之执行**）、撞 id 比对（读内存 registry 实况）、按 `manifest.requires` 跑合成规则的真探测
（PATH 查二进制、端口试绑、外部 API 发 GET、env 只判存在不打印值）、对 `configSchema` 拿空配置真校验。
护栏只有 §4 那一套（loopback＋配对/兜底＋64 KiB 请求体上限）。
⇒ 它的"读任意本地目录"能力是**既裁维持**（裁决 4：`precheck` 读目录维持），本节点不改动、不收紧；
清单里 F-19 的状态判定仍为"有出入：与 v2 写路由口径不齐"（成文≠翻正，见 `docs/feature-inventory-20260923.md`
《正典化》第四节随批注）。
**给未来新增路由的基准用法**（是把上面这套口径对照着用，不是新立规矩）：带请求体的 POST 默认**归写闸**；
若确要按只读闸放行，须能在本节第一、四段这两条判据上说清"不落盘、不签写凭据"，并随批把该归类呈协调侧过裁
——现行 32 条里这样的例子**只有 1 条**，援引它不等于获得同样的豁免权。

**五、本节的取证（可复跑）**
分级表由只读工装从现行实现抽取：`var/scratch/exe-boot-015-20260929/fn-gate-route-classes.mjs`
⇒ 实档 `var/scratch/exe-boot-015-20260929/gate-route-classes-baseline.txt`（32＝只读闸 10＋写闸 22；
只读闸内带 POST 的条数＝1）。S4 F-37 检索路由入表后同式复跑（工装副本指向副本仓，原 015 实档
照留不覆写）⇒ 实档 `var/scratch/exe-boot-022-20261001/gate-route-classes-s4.txt`
（**33**＝只读闸 **11**＋写闸 22；只读闸内带 POST 的条数仍＝1）。日后路由增删，本节数字与实档须随批更新（README 基本要求令同口径）。

## 5. 边界如实陈述（这几条是"没做到的"，别当已交付）

1. **宿主不认 `panels` 描述符 ⇒ 不融合布局。** 当前 `@linxin666/dsh-web-all` 不读契约的 `panels`
   字段，所以 toolkit 面板在它里面是"**自有路由可达可用**"（宿主设置页的 `settings.plugins.tab`
   插槽 + `/api/<prefix>-panel/*`），不与桶内其它 tab 融合、不接管它的布局。只有认 `panels` 描述符的
   宿主才可能融合。这是 D1"不另造接口"的下限实现，不是融合完成。
2. **React 标签页的基址是 bundle 内常量。** `panel/client/index.js` 里 `PANEL_API` 固定为缺省基址
   （由 `test/p7-embed.test.mjs` 断言它等于 `contractHttpBase(DEFAULT_SERVICE_PREFIX)`）。原因：客户端
   bundle 由宿主的客户端加载器按**固定模块 id** 装载，服务端没有注入点。⇒ 非缺省 `servicePrefix` 的
   实例，其 React 标签页仍指向缺省基址；该实例的**完整管理面**经 `${apiBase}/ui` 兜底页可达（已实测）。
   同页多实例的标签页隔离需要宿主提供"按实例注入基址/模块 id"的能力，超出零宿主改造范围（Q2 裁决）。
   **声明面与标签页面的分界（F-21 收边界，2026-09-26）**：`dsh.plugin.json` `panels.httpBase`
   `"/api/{servicePrefix}-panel"` 里的 `{servicePrefix}` 是**给人读的约定占位符**——本仓产品码零替换点、
   宿主侧消费者未证（矩阵 N-13 在案）；它描述的是**服务端路由面**（`/api/<prefix>-panel/*` 的
   snapshot/ui/connector 等路由确实随前缀），**不代表 React 标签页跟随前缀**——标签页 API 基址就是
   上面那句 bundle 内常量。即：跟随 `servicePrefix` 的＝服务端路由；不跟随的＝React 标签页。
   要让标签页也跟随，需宿主按实例注入基址，见上句边界。
3. **`apply-engine.PLAN_STORE` 仍是模块级 Map**（同进程双实例共用待确认 plan 池）。曾改为按实例持有，
   连带 7 项回归红（`uninstall.mjs` 的 plan/execute 函数与验收脚本都以 `putPlan/getPlan/dropPlan` 模块函数为
   契约），已撤回。风险与重做触发条件见 **`docs/debt.md` B-1**（本文原写"#11(a)"，该编号已在四类归档
   重排中变为 B-1）。**基数已按 2026-09-22 实测更正**：`uninstall.mjs` 现导出 **15 个** plan/execute 函数
   （7 plan + 8 execute），以那三个模块函数为契约的验收脚本是 **5 个**
   （`backup-write-test`/`p21`/`p22`/`p23`/`p24-verify`；`p24-ui-matrix` 不引用它们）——
   原文的"10 个 / 6 个"是 P7 落账后的扩面未回填，裁定结论不变（函数更多 ⇒ 维持现状的理由更强）。
4. **`doctorCli` 缺省值是本机开发布局的绝对路径**（仓级文件面按裁决留在独立仓）。嵌入别的机器请用
   `config.doctorCli` 或 `TOOLKIT_PANEL_DOCTOR_CLI`；CLI 不在场时**按路由分述**（★15 定稿，原句笼统）：
   `/doctor/states` → `200 {ok:false, degraded:true}`；`/doctor/dry-run` → `500 {ok:false}`（无 `degraded`
   字段）；apply/rollback/快照恢复 → `500` + `doctor-spawn-failed`。三条都不假装可用，但只有第一条带
   `degraded` 标记。spawn 超时缺省 **180s**（`--states` 用 60s）。
5. **npm 来源未实现**（Q1）：`{kind:'npm'}` 一律 `source-not-supported`，并给"仅本地路径"的如实指引。
6. **真实生效仍需重启宿主**：面板写的是 patch 文本（boot 权威，18/18 生效路径已钉死，见 P2.3 结论
   —— 注意其中含只在全链扫描下才跑的 `p23-verify`，`docs/debt.md` D-3 挂着未并）；
   registry 的运行时装入/卸出是另一条通道，两者优先级模型见 **`docs/migration.md` §2**
   （本文原写"§3"，§3 是 compact-router 预设挂载特例，指向错了）。
   同一插件既在 patch 行又被 registry 装入 ⇒ 两份 fiber，面板不替你合并（`migration.md` §2 末句）。

> **本节条数会随复核增长**：`docs/debt.md` 与 CHANGELOG 里"§5 六条边界"的说法是 2026-09-20 的快照，
> 后续每加一条"没做到的事"，那个数字就成假账 —— 已按实况改为不锁条数。

## 6. 装载 toolkit 后如何确认"装上了 / 卸干净了"

- 装上了：`GET /api/<prefix>-panel/v2/snapshot` → `{ok:true, servicePrefix, doctorAvailable, plugins:[]}`；
  `GET /api/<prefix>-panel/v2/events` → 首帧 `event: hello` + `data {"servicePrefix":...}`（SSE 通道真通）。
- 卸干净：宿主重启后（或 fiber dispose 后）上述路由不再由 toolkit 应答；宿主自身监听面不新增端口。
  实测记录：`panel/docs/evidence/P7-REAL-HOST-SMOKE.md` §二③（8 条抽样 200→401、仅剩 3080 一个监听）。
- 卸干净（进程内，运行时装入/卸出通道）：面板 fiber 被拆时，除 32 条路由逐条注销、事件订阅逐条解除、
  doctor 巡检定时器清零之外，**已打开的 SSE 流也会被服务端 `end()` 且心跳定时器被回收**
  （`v2-api.mjs` 的 `liveStreams`/`closeAllStreams`，挂在 `panel/index.js` 的 `ctx.effect` 卸载链上）。
  这两项都是 2026-09-21 复核补齐的：此前"客户端挂着流、面板被拆"会留下永不结束的流与每 15s 写一次的
  ping 定时器。回归钉子：`test/panel-sse-dispose.test.mjs`（真 `fiber.dispose()` 路径）
  + `test/toolkit-services.test.mjs`（`${prefix}/registry`、`${prefix}/doctor` 两个服务键随 fiber 消失）。
