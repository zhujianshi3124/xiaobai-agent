# 把 toolkit 嵌进宿主 / 把 toolkit 当普通插件装载（P7，REQ-8）

> 建立：2026-09-20。两条方向分开说：**A. 宿主装 toolkit**（G4 的"被装载"方向）；
> **B. toolkit 装别人**（G1，见 `docs/add-sub-plugin.md`）。边界与没做到的事在 §5，不夸大。

## 1. 装载面事实：toolkit 是一个普通 DSH 插件

- 包级入口：`package.json` `exports["."] = "./index.js"`；另有 `exports["./panel"]`（R12：
  面板挂载行可由 `file://` 绝对路径迁到包子路径）。
- 模块形态（`index.js`）：`name = 'dsh-toolkit'`、`inject = ['webServer']`（与面板同源）、
  `apply(ctx, config)` **委派给** `panel/index.js`——面板一直是 registry + doctor 的装配现场，
  根入口不复制逻辑，避免出现第二个装配点。
- 自描述：根入口 `export const manifest`，内容 = 读盘上 `dsh.plugin.json` 过
  `validateManifest`（**唯一事实来源是那份 JSON**；校验失败即抛，宁可装不上也不带错误自描述去预检别人）。
  `id = dsh/toolkit`、`requires.services = ["webServer"]`、`panels` 只有一个描述符。
- 装载本入口与装载 `@local/dsh-toolkit/panel` 是同一个面板的两种入口写法，**同一进程内二选一**
  （两个都装 = 同名路由注册两次；前缀不同则各管各的）。

## 2. 宿主只需要做两件事

```js
const toolkit = await import('@local/dsh-toolkit')      // 或按宿主自己的插件装载机制
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
| 事件 | `toolkit/registry:plugin-added` … `toolkit/audit:installed` | `tk2/…` 同名一套 |
| HTTP（32 条） | `/api/toolkit-panel/{ui,snapshot,plan,execute,plan/status,toggle/plan,config/plan,uninstall/plan,uninstall/execute,custody,restore/plan,restore/execute,mount/plan,mount/execute,doctor/dry-run,doctor/states,doctor/apply/plan,doctor/apply/execute,doctor/rollback/plan,doctor/rollback/execute,snapshot-restore/plan,snapshot-restore/execute}` + `/v2/{snapshot,health,install/precheck,install/confirm,uninstall,enabled,reload,config,events}` + `/v2/connector.js` | 同样 32 条，整体前缀换成 `/api/tk2-panel/…` |

验收证据：`test/p7-embed.test.mjs`（双实例路由零冲突、A 装的插件不进 B、B 的 SSE 收不到 A 的事件、
缺省实例 32 条路由与 p1-smoke 逐条一致）；`panel/docs/evidence/P7-MOCK-BUCKET-LOOP.md` 第 8 步
（真浏览器打开 `/api/tk2-panel/ui`，页内 `PANEL_API` 已随前缀改写，交叉访问两侧互 404）。

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
卸出时逐条注销（`test/p7-embed.test.mjs` 断言 32 条全部注销、活动句柄不增一个）。安全判定：

- 只读：loopback socket **AND**（Host 是 loopback **OR** 宿主 `remoteWebUiPairing` 服务判定已配对
  **OR** 该服务缺席时退到 `devicesFile` hasOwn 兜底）。
- 写：loopback socket **AND**（Host loopback **OR** 服务严格校验），**禁止 hasOwn 兜底**（P2.0②），
  外加 CSRF（`sec-fetch-site ≠ cross-site` 且 `origin.host == Host`）。
- 配对服务归宿主：toolkit 只 `ctx.get('remoteWebUiPairing')`，取不到就 fail-closed（拒绝），
  绝不自己造一个。

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
3. **`apply-engine.PLAN_STORE` 仍是模块级 Map**（同进程双实例共用待确认 plan 池）。曾改为按实例持有，
   连带 7 项回归红（`uninstall.mjs` 10 个函数与 6 个验收脚本都以 `putPlan/getPlan/dropPlan` 模块函数为
   契约），已撤回。风险与重做触发条件见 `docs/debt.md` #11(a)。
4. **`doctorCli` 缺省值是本机开发布局的绝对路径**（仓级文件面按裁决留在独立仓）。嵌入别的机器请用
   `config.doctorCli` 或 `TOOLKIT_PANEL_DOCTOR_CLI`；CLI 不在场时体检路由返回 `degraded`，不假装可用。
5. **npm 来源未实现**（Q1）：`{kind:'npm'}` 一律 `source-not-supported`，并给"仅本地路径"的如实指引。
6. **真实生效仍需重启宿主**：面板写的是 patch 文本（boot 权威，18/18 生效路径已钉死，见 P2.3 结论）；
   registry 的运行时装入/卸出是另一条通道，两者优先级模型见 `docs/migration.md` §3。

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
