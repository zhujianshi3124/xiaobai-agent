# G · 真实 dsh-web-all 宿主冒烟 · 验收证据（Pack F 三项修复生效验证）

> 时刻：2026-09-21 12:24–12:45（GMT+8）。对应提交：toolkit@`b399623`(F1) + `57ebc24`(F3) +
> `23de06a`(F2) + `a6e7457`(收尾文档)。
> 授权：用户在本轮任务书内明确批准重启真实宿主（"允许验证"），并按 G1 九项清单执行。
> 宿主：`@deepseek-ai/dsh@0.1.5-rc.1`（全局安装），profile `web`，`@linxin666/dsh-web-all` 在场，
> 端口 127.0.0.1:3080，cloudflared 为 dsh web 子进程。宿主自带 `@deepseek-ai/cordis@4.0.2`。
> 纪律兑现：**零宿主改造**；`~/.dsh` 全程未读写；唯一被改过的仓内文件是 toolkit 自己的
> `cordis.patch.yml`（注释 3 行 → 还原，见 §六）。本轮不用 `scripts/p23-shadow-scan.mjs`
> 生成任何证据（它会覆写历史证据文件，D-2 在案）。

## 〇、结论一览

| 项 | 内容 | 结果 |
|---|---|---|
| ① | toolkit 装入 dsh-web-all、面板路由可达 | **PASS** |
| ② | 32 条路由抽样 | **PASS 32/32**（读路由 7 条全 200，其余按 p1-smoke 声明期望应答） |
| ③ | 5 个内置子插件全部在位 + F2 负路径真机 | **PASS**（5/5 mounted；目录路径 ⇒ 情形 A 结构化可执行报错） |
| ④ | SSE 可连、可推事件、断连后轮询可用 | **PASS**（同进程事件推送实测；降级轮询的边界见 §二④） |
| ⑤ | 面板卸出：路由 401 + 监听归零 + 活动流终止 | **PASS**（边界见 §二⑤：本项经**进程重启**达成，非同进程 dispose） |
| ⑥ | `ctx['toolkit/doctor']` 可取且能干活 | **PASS**（宿主进程内探针实测，含 F1 两格现场观测） |
| ⑦ | lastError 清空抽查（失败 → 恢复成功 → 无残留） | **PASS** |
| ⑧ | fiber 状态编号守卫在宿主 cordis 下跑一次 | **PASS**（六值全对，LOADING 按仓内守卫同口径由不变式覆盖） |
| ⑨ | 宿主会话内一次真实联网搜索 | **未验 · 阻塞在会话凭据**（G2 协议：即停即报，不擅自绕行）。见 §三 |

## 一、重启手段与三轮时刻

仍用既有权威脚本 `scripts/restart-trigger.ps1 -DelaySeconds 0`（v2.1：`.NET Process.Kill()`
逐 PID、叶子优先；唯一启动闸门 = 端口释放；失败即 exit 1 不双开）。日志三份在
`.panel-backups/restart-logs/restart-trigger-20260921-{122504,124223,124349}.log`；
本轮四个探针/取证脚本与两份原始日志副本在
`.panel-backups/g-real-host-smoke-20260921/`（`g1-routes.mjs`、`g1-live-round1.mjs`、
`g5-sse-watch.mjs`、`g8-fiber-guard-host.mjs`、`sse-watch.log`、`round1-audit.jsonl`、
`probe-doctor-service/`）。

| 轮 | 时刻 | 目的 | 杀树 | 新 pid | 端口回来 |
|---|---|---|---|---|---|
| 1 | 12:25:04 | 新版本 toolkit 首次进宿主 | 2632 cloudflared + 21480 node | 30760 | 12:25:26（19s） |
| 2 | 12:42:25 | 面板卸出态（patch 3 行注释） | 14252 + 26024 + 30760 | 25472 | 12:42:44（17s） |
| 3 | 12:43:50 | 还原挂载行 | 15136 + 27020 + 25472 | 29948 | 12:44:10（18s） |

cloudflared 随每次重启一并被杀，**三轮均由 dsh web 自己重新拉起**（与 P7 同）。

**改造前基线（旧代码，12:24:28 取）**：`/v2/snapshot` `ok:true`、`plugins:[]`；工具区 5/5 mounted。
⇒ 下面所有"新版生效"的判断都有改造前对照，不以"看起来一样"充当证据。

## 二、逐项实测

### ① toolkit 装入 + 新版代码在场

- `GET /api/toolkit-panel/v2/snapshot` → 200 `{"ok":true,"servicePrefix":"toolkit","doctorAvailable":true,"plugins":[]}`
- **新版在场的直接证据不是路由 200，而是 ③ 的负路径报错**：precheck 返回的 blocking 文案含
  F2 才有的"`requirements.exports` 表…装载器不代为挑选"措辞（旧实现此处只会报
  `entry-not-found`，且不会提到同表子路径）。

### ② 32 条路由抽样（清单取自 `scripts/p1-smoke.mjs` 的表，单一事实源，不手抄）

**32 条全部符合 p1-smoke 声明的期望状态码。** 逐条：

| 路由 | 实测 | 期望 | | 路由 | 实测 | 期望 |
|---|---|---|---|---|---|---|
| `/ui` | 200 | 200 | | `/mount/plan` | 405 | 405 |
| `/snapshot` | 200 | 200 | | `/mount/execute` | 405 | 405 |
| `/doctor/dry-run` | 405 | 405 | | `/doctor/states` | 200 | 200 |
| `/plan` | 405 | 405 | | `/doctor/apply/plan` | 405 | 405 |
| `/execute` | 405 | 405 | | `/doctor/apply/execute` | 405 | 405 |
| `/plan/status` | 404 `plan-not-found` | 404 | | `/doctor/rollback/plan` | 405 | 405 |
| `/toggle/plan` | 405 | 405 | | `/doctor/rollback/execute` | 405 | 405 |
| `/config/plan` | 405 | 405 | | `/snapshot-restore/plan` | 405 | 405 |
| `/uninstall/plan` | 405 | 405 | | `/snapshot-restore/execute` | 405 | 405 |
| `/uninstall/execute` | 405 | 405 | | `/v2/snapshot` | 200 | 200 |
| `/custody` | 200 | 200 | | `/v2/health` | 400 `plugin-unknown` | 400 |
| `/restore/plan` | 405 | 405 | | `/v2/install/precheck` | 405 | 405 |
| `/restore/execute` | 405 | 405 | | `/v2/install/confirm` | 405 | 405 |
| `/v2/uninstall` | 405 | 405 | | `/v2/events` | 200 + hello 首帧 | 200 |
| `/v2/enabled` | 405 | 405 | | `/v2/connector.js` | 200 | 200 |
| `/v2/reload` | 405 | 405 | | `/v2/config` | 405 | 405 |

**"全部 200"这一条按任务书字面理解不成立，如实改写**：32 条里只有 **7 条是读路由**
（`/ui`、`/snapshot`、`/custody`、`/doctor/states`、`/v2/snapshot`、`/v2/events`、`/v2/connector.js`），
这 7 条实测**全部 200** ✓；其余 25 条是写路由与参数路由，GET 它们按设计返回 405/404/400
（405 恰恰证明"写路由只认 POST"的门禁仍在位）。判据取 `scripts/p1-smoke.mjs` 的期望表，
不另立标准。

### ③ 五个内置子插件在位 + F2 负路径

`GET /api/toolkit-panel/snapshot` → `snapshot.plugins` 五条全 `mounted`：
`agent-memory` / `compact-router` / `rate-throttle` / `search-router` / `web-search-local`。

agent-memory 的挂载行（宿主 patch 第 74 行）与 manifest 声明同时可见：

```json
"patchRow": { "id": "agent-memory-runtime", "line": 74,
  "name": "@local/dsh-toolkit/agent-memory/plugin",
  "config": { "dataRoot": "C:\\Users\\LENOVO\\.agent-memory", "defaultWorkspace": "null" } },
"entry": { ".": "./lib/index.js", "./plugin": "./plugin.js" }
```

⇒ **F2 对真宿主的影响**：宿主侧 agent-memory 一直按**显式子路径**挂载（不经目录解析），
所以三级解析改动不影响它；面板如实把 manifest 的导出表连同 `.` 指向数据库这一事实一起呈现。

**负路径真机验证（情形 A）**：经宿主安装 API 提交目录路径
`D:\dsh-plugins\dsh-toolkit\lib\agent-memory`：

- `POST /v2/install/precheck` → 200，`blocking[0].code = source/plugin-shape-invalid`，带 `fix`；
  文案点名同表 `'./plugin' → …\plugin.js` 并声明"装载器不代为挑选" ⇒ 情形 A 的
  **结构化可执行报错**成立（B1 本轮改判的口径）。
- `POST /v2/install/confirm` → 200 `{"ok":false}`，同一 blocking；
- 紧接 `GET /v2/snapshot` → `plugins: []` ⇒ **负路径不污染 live registry**（A1 事务性在真宿主成立）。

### ④ SSE 可连 / 可推事件 / 断连后轮询

- 首帧线协议：`retry: 2000` + `event: hello` + `data: {"servicePrefix":"toolkit","at":1789965093658}`。
- **可推事件（同进程真实写入触发）**：在一次"装探针 → 装坏插件 → 启用 → 卸载"序列期间挂着
  SSE 客户端，抓到 6 帧、事件类型齐全：
  `hello, plugin-added, status-changed, audit:installed, audit:enabled, plugin-removed, audit:removed`。
- 心跳：本轮观察器实测每 15s 一帧 `: ping <ts>`（12:41:48 / 12:42:03 / 12:42:18 三条，间隔 15.0s）✓；
  §二中那次 4 秒窗口的抓取里 ping=0 属窗口短，不是心跳缺失。
- SSE 关闭后 `GET /v2/snapshot` 仍 200 ⇒ 轮询端点在位。

**边界如实**：「断连 ⇒ 客户端 connector 自动降级轮询、恢复后再切回 SSE」是**客户端**行为，
其完整链路证据在 mock 桶真浏览器闭环（`P7-MOCK-BUCKET-LOOP.md` 第 8 步、`T0-REAL-PLUGIN-LOOP.md`）。
真宿主侧本轮只证到"事件可推 + 端点在位 + 旧流会被终止"，不以此冒充浏览器内降级已验。

### ⑤ 面板卸出（第 2 轮：`cordis.patch.yml` 第 80–82 行整体注释后重启）

手段与 P7 一致：注释 toolkit-manager 挂载 3 行（`git diff` 仅 3 行变更）→ 重启 → 复测 → 还原。

| 探测（卸出态） | 结果 |
|---|---|
| `/api/toolkit-panel/{ui,snapshot,custody,doctor/states,v2/snapshot,v2/events,v2/connector.js,plan/status}` 8 条 | **全部 401**（挂载态为 200）⇒ 路由不再由 toolkit 应答，落回宿主鉴权闸 |
| 新 pid 25472 的监听面 | **仅 `127.0.0.1:3080` 一个监听** ⇒ toolkit 无旁路端口、无残留监听 |
| 宿主自身 | `/`、`/api/health` 均返回宿主鉴权响应（401，非崩溃/非 502） |
| 跨重启的活动 SSE 连接（卸出前已建立） | 12:42:25.883 `closed: TypeError terminated`——**旧流当场终止，之后未再收到任何帧**（含 ping） |

**必须写清的边界（这条不是 Pack D 的同进程首验）**：本轮"流被 end"是**宿主进程被杀**导致的
连接终止。Pack D 修的那一格是"**进程还活着、面板 fiber 被 dispose** 时活动流被显式 `end()`、
心跳 `setInterval` 句柄归零"。真宿主里面板由 patch 行挂载、**不经 toolkit 自己的注册中心**，
外部没有任何正当入口能在同进程内 dispose 它（要做到就得改宿主或 `~/.dsh`，两者都在红线上）。
所以那一格的命门证据仍是 `test/panel-sse-dispose.test.mjs`（真 `fiber.dispose()` +
`process.getActiveResourcesInfo()` 句柄计数 + teardown 单次幂等，5 例）。
本轮 additionally 给出的是宿主侧的**可观测后果**：卸出后不再有服务、不再有端口、旧连接不再有心跳。

### ⑥ `ctx['toolkit/doctor']` 可取且能干活（宿主进程内容器面探针）

面板所有 doctor 路由都用直连实例应答（`v2-api` 读 `deps.doctor`，不读容器），所以"路由 200"
证明不了容器面。做法：借 toolkit 自己的安装 API 把探针插件
（`.panel-backups/g-real-host-smoke-20260921/probe-doctor-service/`）装进宿主，靠 cordis
`inject: ['toolkit/doctor']` 在**宿主进程内**做一次真实服务查找，写完报告即卸载。探针报告由宿主写入
（`pid: 30760` = 第 1 轮监听 pid，可证明确实发生在宿主进程内）：

```json
{ "ctxLookup": { "got": true, "hasPrecheck": true, "hasInspect": true,
                 "hasRegisterRule": true, "registryAlsoVisible": true },
  "inspect":  { "reports": 1, "statuses": ["legacy/pack-g-probe-doctor:healthy"] },
  "f1":       { "directReadToString": true,
                "getToStringNonStrict": "undefined(缺席)",
                "getToolkitDoctorStrict": "有值" } }
```

- **Pack C 成立**：`toolkit/doctor` 与 `toolkit/registry` 在宿主容器里同时可见，且 `inspect()`
  真跑出巡检报告（healthy，不虚报）。
- **F1（D-6）的宿主现场观测**：直读 `ctx['toString']` 在宿主里**取到了值**（旧实现据此误判"服务在场"），
  而修正后的 `ctx.get('toString', false)` 返回 undefined（缺席）⇒ 原型链误判在真实宿主环境
  确实存在，且修正口径确实闭合它。这一格从"本仓断言"升级为"宿主现场实测"。
- 探针装/卸均 200，收尾 `plugins: []`。
- `POST /api/toolkit-panel/doctor/dry-run` → 200 `{"ok":true,…,"issues":[],"dryRun":true}`
  （真实 CLI 在宿主进程内被调起，零发现）。

### ⑦ lastError 生命周期（F3 / D-8）

夹具：仓内 `test/fixtures/registry/last-error-plugin`（marker 缺席即 apply 抛错）。序列全部
经宿主 API：

| 步 | 操作 | 载荷读数 |
|---|---|---|
| ① | marker 缺席时装入 | `ok:true`，条目 `status:"error"` |
| ② | 轮询 `/v2/snapshot` | `lastError = {code:"internal", message:"fixture marker missing (simulated broken load)", at:1789965347301}` |
| ③ | 修复 marker → `POST /v2/enabled {id, confirm, enabled:true}` | 返回 `status:"active"`、`hasLastError:false` |
| ④ | 再读 `/v2/snapshot` | `{"status":"active","lastError":null}` ⇒ **面板/API 无历史错误残留** ✓ |
| ⑤ | `POST /v2/uninstall` | `ok:true`，收尾 `plugins:[]` |

**历史没丢**（F3 的另一半要求）：`audit.jsonl` 里这次失败与恢复全程在案——

```json
{"at":1789965347305,"event":"installed","pluginId":"fixture/last-error-plugin","durationMs":16,"errorCode":"internal"}
{"at":1789965347351,"event":"enabled","pluginId":"fixture/last-error-plugin","durationMs":0}
{"at":1789965347360,"event":"removed","pluginId":"fixture/last-error-plugin","durationMs":0}
```
（副本：`.panel-backups/g-real-host-smoke-20260921/round1-audit.jsonl`）
⇒ "当前状态字段清空、历史台账保留"这一分工在真宿主成立。

### ⑧ fiber 状态编号守卫（宿主 cordis 跑一次）

宿主装的是 `@deepseek-ai/cordis@4.0.2`（与本仓 devDependency 同版本；宿主还额外带
`cordis-plugin-loader@1.0.3`，见 §七发现项）。用**宿主那份 cordis** 重新实测，与本仓
`registry/dist` 导出的 `FIBER_*` 对账：

```
PASS  PENDING   宿主实测=0 常量=0
PASS  ACTIVE    宿主实测=2 常量=2
PASS  FAILED    宿主实测=3 常量=3
PASS  DISPOSED  宿主实测=4 常量=4
PASS  UNLOADING 宿主实测=5 常量=5
PASS  枚举顺序不变式：[0,1,2,3,4,5] 互不相同、排序恰为 0..5
守卫前提：宿主 cordis 运行时仍取不到 FiberState（const enum 被擦除）= true
```
**如实口径**：`LOADING=1` **没有单独实测样本**，与仓内守卫同一口径（由"六值互不相同 + 排序
0..5"不变式覆盖）。不假称多测了一格。

## 三、⑨ 联网搜索：未验，即停即报（G2 协议）

- 先按只读方式探宿主搜索面：`GET/POST /api/web/{search,providers}` 从 127.0.0.1 直连一律
  **401 unauthorized**（与 P7、D-4 记录一致：面板自己的 loopback 放行分支不适用于宿主 `/api/*` 闸）。
- 再试浏览器侧：本机浏览器打开 `http://127.0.0.1:3080/` 得到
  `dsh web authentication required; reopen the URL printed by dsh web.`
  ⇒ 会话凭据不在我这侧；**且本轮第 1 次重启后宿主的访问 URL/token 已轮换**，你原来开着的
  标签页需要重新用 dsh web 打印的 URL 打开（这是重启的既有副作用，不是缺陷）。
- 要拿到那一口有两条路，都需要你点头：**(a)** 你把 dsh web 打印的带 token 访问 URL 给我，
  我在浏览器里发一次最小化搜索；**(b)** 你自己在会话里点一次联网搜索，我看结果就行。
  本侧**没有**读 `~/.dsh` 下的凭据/配置来绕行（红线），因此 D-4 保持未关闭，
  debt.md 里只加一条"本轮再尝试、仍阻塞在凭据"的注记。

## 四、live 状态收尾自证

- 三轮结束后 `GET /v2/snapshot` → `plugins: []`；`D:\dsh-plugins\.registry\state.json` 内容为
  `{"schemaVersion":1,"plugins":{}}`（本轮冒烟期间产生，随后随该目录一并清除）。
- 该 `D:\dsh-plugins\.registry\`（state.json + audit.jsonl）是**本侧第 1 轮重启的副作用**：
  `toolkitRoot` 缺省按 `resolve(process.cwd(), '..')` 推导，而我用 `Start-Process` 拉起时子进程
  继承了脚本的工作目录。第 3 轮已把宿主拉回 `C:\Windows\System32` 形态，`auditFile` 复现
  为改造前的同一枚路径 `C:\Windows\.registry\audit.jsonl`；`.registry`（D 盘那份）已删除，
  不留在你的插件目录里。**这条 cwd 依赖已登记为债务 D-11**（不是本轮引入，是本轮显影）。
- 测试夹具 `test/fixtures/registry/last-error-plugin/marker.flag`（gitignored）在收尾时移除，
  与仓内 `contract-plugin/marker.flag` 的"默认不存在"惯例一致。

## 五、本轮明确没做的事（避免被当成做过）

- 没读/写 `~/.dsh` 下任何文件（含 settings.yaml、profile patch、凭据）。
- 没改宿主代码、没动 doctor 独立仓（其工作树收尾仍为空）。
- 没在 live registry 里留下任何安装记录（探针与夹具插件均已卸载）。
- 没调用面板的销毁式写路由（`/plan`、`/execute`、`/mount/*`、`/uninstall/execute`、
  `/restore/*`、`/doctor/apply/*` 等）；只用过只读路由、`doctor/dry-run`，以及
  registry 自己的 `/v2/install/*`、`/v2/enabled`、`/v2/uninstall`（⑦ 授权项）。
- 没做⑨（见 §三），也没以任何探针结果冒充"宿主会话内真实搜索已完成"。

## 六、还原自证

- `cordis.patch.yml`：三轮结束后 `sha256 = ce0b0b81c91ca4c420bb5302b2dbe951de0347ca729122511be288aa7c2b76b9`，
  与本轮开始前取的那一枚（`/tmp/patch-before.txt` 记录）**逐字节一致**，也与 P7 台账
  （L-060 关账基准，3097 B / CRLF）同一枚哈希。
- toolkit 工作树：`git status --porcelain` 为空；doctor 独立仓 `git status --porcelain` 为空。
- 最终门禁见 §七。

## 七、附带发现（只登记，不擅动）

1. **D-11**：`toolkitRoot` 缺省由宿主进程 `cwd` 推导（`resolve(process.cwd(), '..')`），
   于是 registry 状态文件与 `audit.jsonl` 的落点会随启动方式漂移（本次实测在
   `C:\Windows\.registry` 与 `D:\dsh-plugins\.registry` 之间跳过两次）。审计"事后可查"的前提
   是落点稳定，建议 v1.1 里把 statePath 锚到 toolkitRoot 或显式配置。
2. **D-12**：宿主侧装有 `@deepseek-ai/cordis-plugin-loader@1.0.3`，而本仓 `loader.ts` 的 B2
   注记写的是"宿主装载器在本仓未安装，无法逐条对照其解包规则，故只做保守近似"。
   ⇒ 该近似现在**具备了可对照的条件**（读宿主那份源码即可），B2 的口径可以在下一轮收紧。
