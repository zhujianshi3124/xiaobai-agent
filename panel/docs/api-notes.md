# api-notes.md — DSH WebUI 面板插件 API 事实清单

> P0 产物，2026-09-17 从已安装组件源码核实。v1 的 API 假设全部作废，P1 起以本文件为准。
> 引用基准：
> - WS  = C:\Users\LENOVO\.dsh\profiles\web\node_modules
> - DWA = WS\@linxin666\dsh-web-all
> - PM  = WS\@linxin666\dsh-client-ui-plugin-manager
> - OPS = WS\dsh-ops-console（仅用于 subprocess 事实，不作为代码来源）

## 0. 四问结论摘要

| # | 问题 | 结论 | 证明 |
|---|---|---|---|
| Q1 | 服务端路由真实注册方式 | 属实：`{ kind: "exact", path, handler }` + `ctx.webServer.register(route)` | DWA lib/index.js:68,101,129-137；PM lib/index.js:2330 |
| Q2 | 标准注入名 | `webServer` 属实；`subprocess` 属实 | PM lib/index.js:2311；OPS lib/index.js:458,470-477 |
| Q3 | 客户端面板挂载方式 | `window.__ModuleLoader__.load({ id, factory })`，factory 导出 `apply(ctx)`；UI 注册到 `ctx.slots.inject("settings.plugins.tab", ...)` + `ctx.slots.register(...)` | PM lib/client.js:1,1686,1702 |
| Q4 | 鉴权模型 | 无登录会话；管理路由必须自做 loopback 防护 | PM lib/index.js:1694-1712,1984-1986 |

## Q1 服务端路由注册方式（v1 假设属实）

- route 对象就是 `{ kind: "exact", path: "...", handler: async (req, res) => {...} }`。
  出处：DWA lib/index.js:68（`kind: "exact"`）、DWA lib/index.js:101（`kind: "exact"`）。
- 注册 API：`webServer.register(route)` 返回一个取消注册函数。
  出处：DWA lib/index.js:134（`const unregisterDegraded = webServer.register(makeDegradedRoute())`）、137。
- PM 的批量注册写法：`routes.map((route) => ctx.webServer.register(route))`。
  出处：PM lib/index.js:2330。PM 路由清单见 PM lib/index.js:2262-2302。
- 延迟到服务就绪：`ctx.inject(["webServer"], (scoped) => { ... })` 在 webServer 出现后才执行，适合注入面为空的内壳插件。
  出处：DWA lib/index.js:129。PM 则直接 `inject = ["webServer"]`，`apply(ctx)` 里用法同。

## Q2 标准注入名（属实）

- `webServer`：PM lib/index.js:2311（`const inject = ["webServer"]`）。
- `subprocess`：OPS lib/index.js:458（`export const inject = ['webServer', 'subprocess']`）；
  OPS lib/index.js:470-477 展示 `ctx.subprocess.spawn({ argv, stdio, graceMs })` + `handle.done` + `handle.collected`。
- 结论：服务端注入名至少 `webServer`、`subprocess` 两个可用；写面板时先用 `ctx.inject(["webServer"])` 或声明 `inject = ["webServer"]`，需要跑 doctor/读写脚本时再用 `subprocess`（缺失时 fail-closed）。

## Q3 客户端面板挂载方式（属实）

- 模块包装：
  出处：PM lib/client.js:1（`window.__ModuleLoader__.load({`）。
  形态：
  ```js
  window.__ModuleLoader__.load({
    id: "<客户端模块唯一名>",
    factory: (require) => { ...; exports.apply = apply; return module.exports; }
  });
  ```
  （DWA lib/client.js 开头同款，见 DWA lib/client.js:1。）
- factory 的 `require` 可以引用 react、@deepseek-ai/cordis、@deepseek-ai/dsh-client-ui-primitives 等（PM lib/client.js:7-9）。
- factory 导出 `apply(ctx)`（PM lib/client.js:1702 `exports.apply = apply`）。
- UI 挂载槽：`ctx.slots.inject("settings.plugins.tab", () => { return ctx.slots.register({ name, id, order, label, locale, inject }, Component); })`。
  出处：PM lib/client.js:1686-1700。
- 客户端依赖声明在包的 `package.json` 的 `dsh.client.inject`（platform: "web"）。
  出处：PM package.json `dsh.client.inject`（含 @deepseek-ai/dsh-client-connection、dsh-client-ui-settings 等）。
- 客户端与服务端通信：浏览器 fetch 同源 `/api/...` 路由（PM lib/client.js:1424 后 gatewayJson，GATEWAY_PREFIX = "/api/plugin-manager"），另有 connection rpc channel（PM lib/client.js 中 CONTROL_CHANNEL）。我们 P1 用 fetch 同源路由即可。

## Q4 鉴权模型（无登录会话，loopback 自护）

- DSH WebUI 没有强制登录态；面板写操作接口必须自己加 loopback 防护。
- 生产级参考实现 PM isLoopbackRequest（PM lib/index.js:1694-1712）四条件：
  1. `request.socket.remoteAddress` 是 loopback（127.0.0.1 / ::1）；
  2. `request.headers.host` 解析后是 loopback hostname；
  3. `sec-fetch-site` 不是 `cross-site`；
  4. 若带 `origin`，其 host 必须等于 Host。
- guard 包装：非 loopback 直接 403 `{ ok:false, error:"forbidden: loopback-only" }`。
  出处：PM lib/index.js:1984-1999。
- DWA 的 degraded 路由也做同样 loopback 拦截（"forbidden: loopback-only"），rows 路由不拦因为内容公共。
  出处：DWA lib/index.js 约 70-90。
- 项目裁定（2026-09-17，与实现对齐）：**全部路由一律 guard**，包括只读快照、doctor dry-run 和 UI 页面路由。放弃 Q4 原先“只读路由可按公共 rows 放宽”的选项。guard 逻辑按 api-notes 上述条件自写，不复制 PM 代码。
- **Q4 第三次修正（P1 人工验收失败后，2026-09-17）**：`api/gate` 是死监听器——`dsh-host-webserver` 的 `register()` 只把 route 写入 `exact/prefixes` Map，宿主不发射 `api/gate`；remote-web-ui 自己的配对门禁只覆盖其 `/remote` 前缀与 `/pair*` 页面，**不覆盖任何插件注册的 exact 路由**（本地复现：Host=公网域名无 cookie，panel 200，WebUI 正门 401，plugin-manager 403）。自护范式三证据：(1) plugin-manager 自做 loopback guard（PM lib/index.js:1694-1712,1984-1986）；(2) remote-web-ui 对 /remote 前缀自做 pairedDeviceIdOf（remote-web-ui lib/index.js:1858 起）；(3) 本面板 guard 公式升级为 **socket loopback AND (Host loopback OR 有效配对校验)**。api/gate 死监听器见 remote-web-ui src/gate.ts 注释「NOTHING emits api/gate in the official runtime」。

## Q5 启停机制：disabled 行级标志（源码级定案）

- 平台对 `cordis.patch.yml` 的 insert 行支持行级 `disabled` 字段，参考实现正是平台自己的插件管理器：
  PM lib/index.js:320 setRowEnabled(text, filename, id, name, enabled, baseEnabled)
  PM lib/index.js:2186 调用 `setRowEnabled(...)`；2188 与原文不同才 `writePatchAtomic(...)` 写盘。
- 语义：insert 行找到目标 `id` 后 `insertRow.set("disabled", document.createNode(!enabled))`（中被截断，完整见 PM lib/index.js:320-368）。
- DWA shell 注释也佐证：未被 loader 应用的行（被用户 patch `disabled`）不会出现在活动行表中（见 DWA lib/index.js 顶部 rows.ts 注释）。
- 备选策略（防止对某些行 disabled 不生效）：将对应 `- insert:` 子项整块改写为不可达（注释）或移出活动 patch 层。此策略暂列为 fallback，不写进 P1 默认实现。
- 手工验证状态：源码级验证完成（平台自己的插件管理器生产代码即此法）；真实 reload 验证需在 DSH Web 进程运行时做，留到 P1 集成冒烟时执行并记录结果。

## Q6 @gausszhou/dsh-web-search-local license（P0 结论）

- package.json：name @gausszhou/dsh-web-search-local；license: MIT；author: gausszhou（/d/dsh-plugins/dsh-web-search-local/package.json:2,7,8）。
- LICENSE：MIT，Copyright (c) 2026 sun1chao, gausszhou（/d/dsh-plugins/dsh-web-search-local/LICENSE:1-3）。
- 结论：MIT 允许使用/修改/分发，只需保留版权声明。P3 处置由"必须剔除"改为"可归属打包（保留原包名 + LICENSE + Attribution）"；是否随开源包发布仍取决于你的意愿，但法律上可选。


## P1.1 配对校验接入（2026-09-17 修复定案）

- 服务定位：remote-web-ui 注册 Cordis 服务 remoteWebUiPairing（lib/index.js:607 REMOTE_WEB_UI_PAIRING），实例方法 isPairedDevice(request)（lib/index.js:627），applyImpl 中 new RemoteWebUiPairing(ctx, ...)（lib/index.js:4344）。
- 判据：该服务走 isPairedDeviceRequest -> cookie dsh_pair + service.touchDevice(deviceId)，活 session 才 true，并刷新 lastSeen。
- dsh_pair Set-Cookie 属性：Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000（365 天），见 lib/index.js:886,1264,1459,1507。
- dsh_pair 值 = deviceId = randomBytes(16).toString("hex")（32 hex，128-bit 随机），不可伪造；需本机 devices 文件或 Cordis 服务才能验证。
- fallback hasOwn 语义差异：服务校验 = 动态 touchDevice（revoke/stop/idle 都拒）；fallback 仅校验 devices.json 中是否存在该 key，不反映内存态。**P2 必须走服务校验**；fallback 只作为服务缺失时的 fail-closed 兜底。
- 运行时探测记录：本轮 hot-reload 不可用，真实运行态 ctx.get 探测将在新版 panel 加载后的 live smoke 中复验；离线 harness 已覆盖服务缺失 fallback 路径与配对放行/拒绝断言。

## 附注：panel.html 与 Q3 ModuleLoader 模式的关系

- Q3 的 `window.__ModuleLoader__.load({ id, factory })` + `ctx.slots.inject("settings.plugins.tab", ...)` 是 DSH 官方 **client bundle** 挂载 Settings tab 的机制，证据来自 PM 单包（package.json 有 `dsh.client.inject` + `platform: web`）。
- P1 的 UI 载体是 `panel/client/panel.html`，**不经过 ModuleLoader**：它由 panel 服务端插件的 `webServer` 路由 `/api/toolkit-panel/ui` 直接返回同源 HTML 页面，页面内 fetch 同源 JSON 路由。
- 原因：`@local/dsh-toolkit` 是单 package.json 多子路径本地套件，而 ModuleLoader 的 client bundle 发现机制只被独立包 `dsh.client` 字段证实（P0 未查到子路径包的 client 发现结论）；为避免臆造挂约定，P1 选用服务端同源 HTML 页，UI 行为与鉴权契约不受影响。
- 迁移路径：若后续确认子路径包 client discovery 机制，可把 panel.html 的 React/原生 UI 迁入 ModuleLoader client 包并挂 `settings.plugins.tab`，服务端路由契约保持不变。

## 附：对 P1 编码的约束清单

1. 服务端插件导出 `{ name, inject, apply }`；inject 声明 `["webServer"]`，需要跑脚本时可加 `"subprocess"`。
   依据：PM lib/index.js:2311,2337；OPS lib/index.js:458。
2. 路由对象固定 `{ kind: "exact", path, handler }`；写操作路由全部套 loopback guard（Q4 四条件）。
   依据：DWA lib/index.js:68,101；PM lib/index.js:1694-1712。
3. 客户端用 `window.__ModuleLoader__.load({ id, factory })` 包裹；导出 `apply(ctx)`；UI 挂 `ctx.slots.inject("settings.plugins.tab", ...)`。
   依据：PM lib/client.js:1,1686,1702。
4. 读写 patch 文件参考 PM 的生产模式：yaml parseDocument（customTags 保留 !!js）→ 定位 insert 项 → 改 `disabled` → `document.toString({ lineWidth: 0 })` → 先写 .tmp 再 rename（原子写）。我们在此基础上加自己的备份目录与 SHA 约束（不照抄代码，只认可 API 事实与安全思路）。
   依据：PM lib/index.js:121-152,320-368。
5. 所有对 patch/package.json/dsh.plugin.json 的写路径走 P2 安全模型；P1 先只读，不写盘。
6. 本方案不依赖 dsh-ops-console，也不复制其代码；它只证明 subprocess seam 存在。
## P2.0 客户端发现机制（2026-09-17 核查）

### 宿主客户端发现（Node 半边 @deepseek-ai/dsh-client-modules）

- 扫描对象：`ctx.loader.entries()` 里 `fiber !== void 0 && !entry.disabled` 的条目（lib/index.js:466-472、777-786）。
- 对每条 `entry`：取 `loaderName = entry.options.name`、`baseUrl = entry.parent.tree.ctx.baseUrl`，调 `resolveSource` → `resolveMeta`（lib/index.js:800-806、637-660）。
- `resolveMeta` 逻辑：
  1. `locatePkgJson(loaderName, baseUrl)` 定位 package.json；
  2. 解析 `package.json#dsh.client`（`parseDshClient`，lib/index.js:140-153）：必须对象、`platform` 必须 string；可选 `inject` string[]、`external` string[]、`immediately` boolean。
  3. `decl.platform !== "web"` 则跳过（lib/index.js:649-653）。
  4. `clientExportOf(pkgName, pkg.exports)`：要求 `exports["./client"]` 是 string，或是带 string `default` 的对象（lib/index.js:156-166、654-656）。
  5. 条目 graph id 采用 `package.json#name`；bundle 路径 = package.json 目录 + clientRel（lib/index.js:657-668）。
- 浏览器半边：bundle 自身调用 `window.__ModuleLoader__.load({ id, factory })` 注册工厂；宿主通过 `window.__DSH_BOOT__` 图按依赖顺序 materialize（dsh-client-modules package 描述与 client.js:1）。
- 入口路径：设置页 tab 槽 `settings.plugins.tab`：`ctx.slots.inject("settings.plugins.tab", () => ctx.slots.register({ name: "settings.plugins.tab", ... }, Component))`（plugin-manager lib/client.js:2395-2398 模式）。

### 子路径插件 client 清单读取方式（决定）

- `locatePkgJson` 对非 path-like 且非 bare name 的条目直接返回 undefined（lib/index.js:679-687）：
  - `exactPackageSpecifier` 只接受 `@scope/name`（两段）或单段裸名（lib/index.js:132-136）。
  - 当前 profile patch 五行 subpath 名字（如 `@local/dsh-toolkit/panel`）都是三段，**全部不会进入 client 扫描**；给根 `@local/dsh-toolkit` package.json 增加 `dsh.client` 对当前行名无效。
- 若 path-like 条目能解析到 panel 目录，则 `nearestPackage` 会向上找最近的 package.json（lib/index.js:711-726）。因此实现路线需要：给 `panel/` 补独立 package.json + 改 `toolkit-manager` 行 name 为 path-like（或另建裸名 client-only 包）。

## P2.1 改动生效方式：两种伺服，都是「激活时快照」——必须 reload（2026-09-17 P1.6 实测）

结论先行：**改 `panel/client/*` 后，浏览器强刷（F5）不够，必须 reload dsh web 进程。**

### 两个面各自的内存快照点

| 面 | 伺服路径 | 读取时机 | 证据 |
|---|---|---|---|
| client bundle | `/plugins/.../client.js?<rev>`（`kind:"prefix"` 路由） | **activation 时** `readFileSync` 快照进内存；`serveBundle` 只回内存 `responses` 映射 | dsh-client-modules `lib/index.js:750-760` `initialBundleSnapshot()`；`:857-877` `bundleResource`/`serveBundle` |
| 独立页 HTML | `/api/toolkit-panel/ui` | **`apply()` 时**读一次并闭包捕获 | `panel/index.js:103` `const uiHtml = readFileSync(...)` 在 `apply` 内 |

- bundle 的磁盘重读只发生在 HMR watch 注册钩子 `rehashBundle`（`:536-560`，注释明说「the only entry」）；未装 watch 的环境不会重读。
- bundle URL 带 rev 查询串，rev 在 `allocateInitialRevision()` 时分配。**rev 不变 ⇒ 内容不可能变**。

### 实测证据（P1.6）

磁盘已改（含「运行中 · 正在生效」「一键体检」「技术详情」），而 live 返回：
- `/api/toolkit-panel/ui` → 200，len **5572**，仍是旧文案：`P1 只读骨架` / `doctor dry-run` / `刷新快照`。
- 磁盘同文件 len **10260**。
- dsh web pid 23932 启动于 `22:08:06`；bundle mtime `22:38:57`（晚 1851s）⇒ 改动发生在进程启动之后 ⇒ 内存快照必然是旧字节。

### 运维含义

- **加 `immediately`/`inject` 之类的清单字段不会绕过这条**：它改的是图，不是字节读取时机。
- 唯一可靠生效路径 = 重启 dsh web（即既有 restart-trigger 流程）。
- 想让「改完即生效」需要宿主提供 HMR watch；当前环境不具备，不要假装强刷可行。
- 反例警示：不要把「`/api/toolkit-panel/snapshot` 返回 200 且内容新」误当作「UI 已更新」——那是**实时计算**的 JSON，走另一条路（每次请求 `buildSnapshot`），与静态资源快照无关。本次实测该端点确实立即反映了新状态，容易造成「已生效」的错觉。

## P2.0② 写路由判定：`{ change: true }` 一览表（2026-09-18 落盘）

命题：**只读路径与写路径走两套不同的配对校验**，所以每条路由标不标 `{ change: true }` 是一个安全决策，不是一个风格问题。

| 路由 | `path:` 行 | 守卫 | 方法 | 性质 |
|---|---|---|---|---|
| `/api/toolkit-panel/ui` | `panel/index.js:225` | 只读 | GET | 读（直连后备页 HTML） |
| `/api/toolkit-panel/snapshot` | `:238` | 只读 | GET | 读（实时快照） |
| `/api/toolkit-panel/doctor/dry-run` | `:250` | **`{ change: true }` @ `:259`** | POST | ⚠️ **有意过度收口**（见下） |
| `/api/toolkit-panel/plan` | `:265` | **`{ change: true }` @ `:306`** | POST | 写（只读计算**但签发写令牌**） |
| `/api/toolkit-panel/toggle/plan` | `:314` | **`{ change: true }` @ `:360`** | POST | 写（同上，另含停用前交叉引用扫描） |
| `/api/toolkit-panel/execute` | `:365` | **`{ change: true }` @ `:381`** | POST | 写（**唯一落盘入口**） |
| `/api/toolkit-panel/plan/status` | `:386` | 只读 | GET | 读（方案查询） |

**guard 实现行号**：`isAllowedRead` @ `:180`（loopback AND (Host loopback OR 配对服务 OR `devicesFile` hasOwn 兜底)）·
`isAllowedWrite` @ `:191`（loopback AND (Host loopback OR `pairedByServiceStrict`) —— **禁 fallback**）·
`guard(handler, options)` @ `:200` · `const isWrite = options.change === true` @ `:201`。

**判定判据**（P2.1 踩坑后固化）：**只要会签发令牌或改变状态，就是写路由。**

### ⚠️ 一处有意偏离判据：`doctor/dry-run` 标了写路由

`doctor/dry-run` **不改变任何状态、不签发令牌**，按上述判据本可标只读；但它标了 `{ change: true }`。

**这是有意为之，方向是 fail-closed（更严，不是更松）**，请勿当作 bug「修正」：

- 后果只是**多要求一道严格配对 + CSRF 安全来源**，不会放松任何限制；
- 桌面 loopback 场景无功能影响（`isLoopbackHost` 直接放行）；
- 远程场景仍可正常走 `remoteWebUiPairing` 服务校验，功能不受损；
- 反面代价若发生（误降为只读）：它会退化成「服务缺席时走 `devicesFile` hasOwn 兜底放行」——而 doctor dry-run 会**执行外部 CLI 进程**（`panel/manager/doctor-runner.mjs`），把「起进程」这种有副作用的动作放在兜底放行的只读路径上，是整个 P2.0②「写操作禁 fallback」原则的破口。

**结论：保留现状。** 若将来要严格对齐判据，必须先为 doctor dry-run 定义一套「只读但可起进程」的第三类守卫，而不是简单地把 `{ change: true }` 删掉。

## P2.0③ DSH 启动的全部 patch / 配置注入点 + 合并语义（2026-09-18 loader 源码定案）

**命题来源**：Q2 穷尽标准修正 —— **不以任何一侧的层定义为准，以 loader 源码定案为准**。本节的每一行都给出源码文件 + 行号，可复核。

**读取范围声明**：以下全部为**只读**。物理载体位于 DSH 安装目录
`C:\Users\LENOVO\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\…`（**不在红线内** —— 红线仅 `~/.dsh`、cloudflared、五子插件源码目录）。
**未读**：`$DSH_HOME/cordis.patch.yml`（home 层文件，超出本轮授权范围；见文末「未覆盖项」）。

### ③.1 注入点总表（按应用顺序）

| # | 注入点 | 物理载体 | 源码锚点 |
|---|---|---|---|
| 0 | **profile 根配置**（每次启动被**重写为 `[]`**） | `$DSH_HOME/profiles/<name>/cordis.yml` | `dsh/lib/profile-boot-Dk-7KqJc.js:124-130`（`PROFILE_ROOT_CONFIG`）、`:209`（`writeFileSync` 无条件重写） |
| 1 | **bundle patch 层**（可 N 个，按 `dsh.profile.bundles` 顺序） | 各 bundle 包 `package.json#dsh.bundle.patch` 指向的文件；**本 toolkit 即 `D:\dsh-plugins\dsh-toolkit\cordis.patch.yml`** | `dsh-app-boot/lib/index.js:849-860`、`dsh/lib/profile-boot-Dk-7KqJc.js:240` |
| 2 | **profile 用户 patch 层** | `$DSH_HOME/profiles/<name>/cordis.patch.yml` | `dsh-app-boot/lib/index.js:861-862`；`README.zh.md:50,55,57` |
| 3 | **home 用户 patch 层** | `$DSH_HOME/cordis.patch.yml` | `dsh/lib/profile-boot-Dk-7KqJc.js:116-118,238`；`README.zh.md:55,57` |
| 4 | **`--patch <file>` overlay 层**（**可重复**，argv 顺序） | CLI 参数 | `dsh/lib/profile-boot-Dk-7KqJc.js:239`；`dsh/lib/bin.js:24-25,53-54` |
| 5 | **telemetry 合成补丁**（追加在最后） | 环境变量 `DSH_TELEMETRY_DISABLED` | `dsh/lib/profile-boot-Dk-7KqJc.js:184-190,249-250` |
| E1 | **环境层 `.env`**（**非 patch**） | 继承环境 > 调用目录 `.env` > `$DSH_HOME/.env` | `dsh-app-boot/lib/index.js:1064-1078`（`loadLayeredEnv`）、`:1040-1055`（`readEnvLayer`）；`README.zh.md:54` |
| E2 | **`!!js` 表达式**（配置值内嵌 JS，启动时求值 —— 配置面的代码执行） | patch / config 任意位置 | `dsh-app-boot/lib/index.js:30`（`JsExpr` schema）、`:362`；`cordis-plugin-loader/src/config/entry.ts:104-108` |
| E3 | **agent-preset 组合面**（**独立平面**，非 patch 层） | shipped `dsh-agent-presets/presets/<id>/agent.cordis.yml` + 用户 `$DSH_HOME/.agent-presets/<id>/agent.cordis.yml` | `dsh-agent-presets/lib/invariant.js:181`（`COMPOSITION_FILE`）、`:194`（`USER_PRESET_DIR`）、`:202`（`SHIPPED_PRESET_ROOT`）、`:1277-1287`（根顺序）；由 `dsh-web-app/cordis.patch.yml:474-482` 以只读 `system` 根挂载 |
| E4 | **toolkit 自带的「预设改写」路径**（**非 patch 层**，直接改源文件） | `D:\dsh-plugins\dsh-toolkit\scripts\apply-preset-patch.mjs` 就地把 preset 的 compaction 行改名 | `scripts/apply-preset-patch.mjs:33-46`（原行/新行字面量）、`:127-153`（`applyOne`）；设计声明见 `cordis.patch.yml:3` 注释 |

**应用顺序的源码依据（唯一权威处）** —— `allPatches()` @ `dsh/lib/profile-boot-Dk-7KqJc.js:212-220`：

```
bundlePatches  →  profile.patches  →  homePatches  →  overlays
```

`README.zh.md:55` 的措辞与之一致：「你的 tweak 层，应用在所有组合包层之后（先应用逐 profile 的文件，再应用 home 级文件，因此后者优先级更高）」。

### ③.2 合并语义（「同 id 究竟什么行为」——分平面给答案）

源码里 `EntryTree.sep = ':'` 支持 `parent:child` 复合 id（`cordis-plugin-loader/src/config/tree.ts:76-87`），但**三层语义不同，必须分开说**：

**(a) patch 层之间（注入点 1–5）：后者覆盖；顶层 key 赋值 / `config` 整体替换，不做深合并。**

唯一权威实现 `applyEntryPatches(data, patches, warn)` @ `dsh-app-boot/lib/index.js:44-108`，其 doc 自称 *"THE patch semantics of this include, shared by mounting (`applyPatches`) and offline config tooling (`dsh --dump-config`) so a dump can never drift from what boots"*（`:44-48`）。要点：

- `data = structuredClone(data)` —— **永不改动入参**，每次应用都是全新副本（`:60`；理由见 `:48-52`：共享对象会把早期值烤进解析缓存，热重载就再也回不去）。
- `buildMap` 建 `Map<id, entry>`，仅在 `entry.group && Array.isArray(entry.config)` 时**递归进子行**（`:63-68`）。`entryMap.set(entry.id, entry)` = Map 覆盖 ⇒ **同 id 时后出现者成为 patch 目标**。
- **非 insert** patch：`id` 必填；`entryMap.get(id)` 未命中 → `warn` 并**跳过**（`:89-97`）；**`name` 防呆断言** —— patch 若写了 `name` 且与目标当前 `name` 不等，警告并跳过（`:98-101`）；随后 `for ([key,value] of Object.entries(overrides)) target[key] = value`（`:102-105`）——**顶层 key 直接赋值**，没有递归合并，写 `config:` 就是整块替换。
- **insert** patch：带 `id` 时目标必须是 `group: true`，否则警告跳过，然后 `target.config.push(...insert)`；不带 `id` 时 `data.push(...insert)`；随后 `buildMap(insert)` 让**同列表内后续 patch 能命中刚插入的行**（`:72-86`，注释 `:51-53`）。**insert 是纯追加：不去重、不替换、不合并。**
- `name` 还可做「插入插件的路径锚定」：`anchorInsertedPluginNames` 把 `insert` 里绝对路径及相对 patch 文件的 `./`/`../` 名转成 file URL（`dsh-app-boot/lib/index.js:1169-1178`；`README.zh.md:59`）。

**文本凭据（官方文档明文）**：
- `README.zh.md:144` ——「**用户 patch 会替换匹配到的整个配置** —— 按 id 定位的 patch 不做深度合并，因此 profile 覆盖必须重述需要保留的组合包字段。」
- `README.zh.md:55` ——「替换某个条目的整个 config（重述你要保留的字段）、插入新条目，或在启动时插值 `!!js` 表达式。」

**(b) loader 运行时（同一棵树内）：同 id **复用同一个 `Entry`**，后到者整体替换其 `options`。**

`EntryGroup.create()` @ `cordis-plugin-loader/src/config/group.ts:20-40`：

```ts
const existing = this.tree.store[id]
const entry: Entry = existing ?? (this.tree.store[id] = new Entry(this.ctx.loader))
entry.parent = this
// Use `create: true` to replace existing entry.options.
await entry.update(options, true, true)
```

⇒ **同 id 不会产生两个运行实例**：`store`（`tree.ts:13` `Object.create(null)`）以 id 为键，命中即复用，`options` 被整体替换。另注 `ensureId`（`tree.ts:66-73`）**只在 id 缺失时**随机生成并避碰；**显式给出的 id 不做避碰检查**。

**(c) `disabled` 沿父链继承**（承 Q5 / 11.9 / 11.10）：`entry.ts:84-98` `_disabled` 上溯父链；`disabledOf` @ `:104-108` = `isJsExpr(options.disabled.__jsExpr) ? evaluate(...) : Boolean(options.disabled)`。⇒ 父组 `disabled: true` 会罩住子行；`!!js` 表达式在启动时求值。

**(d) ⚠️ agent-preset 面：同 id 是「首根胜」，与 patch 层方向**相反**。**

`discoverPresets()` @ `dsh-agent-presets/lib/invariant.js:426-432`：

```js
for (const root of roots) for (const preset of await scanRoot(root, harnessBase)) {
  if (byId.has(preset.id)) continue;
  byId.set(preset.id, preset);
}
```

doc 明写 *"roots in precedence order; an earlier root wins a duplicate id"*、*"first-root-wins per id"*（`:422,424`）。根顺序 @ `:1277-1287`：

```
SHIPPED_PRESET_ROOT (trust: system)  →  config.roots  →  $DSH_HOME/.agent-presets (trust: user)
```

⇒ **同名 preset，shipped 根遮蔽用户根**。运维含义：把改动写进 `~/.dsh/.agent-presets/standard/`（或 `ptc`/`cordis`）**不会生效**，因为 shipped 的 `standard` 先胜出；只有**唯一名**（如 `liangshen`）的用户 preset 才真正生效。这也解释了 toolkit 为何必须**同时**改写 shipped 与 user 两侧的 preset（`apply-preset-patch.mjs:30-31,213-216`）。

### ③.3 对「四层栈 / 同 id 后者覆盖」的裁决

| 待裁命题 | 裁决 | 依据 |
|---|---|---|
| 「**同 id 后者覆盖**」 | **真**，但必须限定平面与语义 | patch 平面：`applyEntryPatches` `:102-105` + `composeProfile` `rows.set(row.id,row)` @ `profile-boot:247`；loader 平面：`group.ts:20-40`。语义是**替换/顶层赋值，非深合并**（`README.zh.md:144`） |
| agent-preset 平面同 id | **首根胜（与 patch 层相反）** | `invariant.js:426-432` |
| 「**四层 patch 栈：bundle 层（启动时固化）→ profile 层 → home 层 → overlay，同 id 后者覆盖前者**」 | **转述失真候选（第四例，与 11.11 同族）** | 见下三条 |

**为何判「转述失真候选」**（逐条对源码）：

1. **「overlay」在源码里是通名，不是第 4 层的专名。** `loadOverlayPatches` 同时用于 **bundle patch 与 `--patch` 文件**（`dsh-app-boot/lib/index.js:1152-1168`）；`renderConfigDump` 的形参注释就是 *"overlay layers in application order (later wins)"*（`:1231`），即**所有 patch 层都叫 overlay**。把「第 4 层」命名为 overlay、同时又不承认 bundle/profile/home 也是 overlay，是**通名当专名**。
2. **数目巧合但分法不符。** 源码的 patch 层实际是 **bundle → profile → home → `--patch` overlays**（4 类）+ 合成 telemetry 补丁；此外还有**两个非 patch 的注入面**（base `[]`、env `.env`），以及 E3 的 agent-preset **独立平面**。总文档只数 4 层且未声称为非全集，故数字本身不算错，但**它没覆盖真实注入面全集**，不能作为穷尽性依据。
3. **「bundle 层（启动时固化）」措辞有害歧义。** 若原意是「只在启动时应用、不随热重载变化」——与源码一致：`patchReload: live` 只监视**两份用户 patch 文件**（profile + home），bundle 层不参与热重载（`README.zh.md:57`）。若原意是「内容固定不可改」——**不成立**：bundle 层由 `dsh.profile.bundles` 声明、启动时逐包读取 `dsh.bundle.patch` 并在 compose 阶段应用（`dsh-app-boot/lib/index.js:849-860`）；**本 toolkit 的 `cordis.patch.yml` 就是一个 bundle patch**，其行随版本自由变化。建议改写为「bundle 层（仅启动时应用，不热重载）」。

**实测结论（替代「四层栈」的准确表述）**：
> DSH 启动时把 patch 层按 **bundle（可 N 个，`dsh.profile.bundles` 顺序）→ profile `cordis.patch.yml` → home `cordis.patch.yml` → `--patch` overlays（可 N 个）** 的顺序**拍平成一个列表**，对 base 配置做**同一次** `applyEntryPatches`（`profile-boot:242-247` 用 `composeEntries`；`renderConfigDump:1253` 用 `layers.slice(0,count).flatMap(l=>l.patches)`）——**后者按 id 覆盖前者，且是浅层赋值/整块替换而非深合并**。另有 base(`[]`) 与 env(`.env`) 两个非 patch 面，以及 agent-preset 独立平面（该平面同 id 为**首根胜**）。

### ③.4 未覆盖项（如实申报，不猜测）

- **`$DSH_HOME/cordis.patch.yml`（注入点 3）未读取**。它落在红线目录 `~/.dsh` 内，本轮授权只到 `~/.dsh/.agent-presets`（只读）。若该文件存在，它就是一个**能覆盖 profile 层、且优先级高于 profile 层**的 patch 层 —— 理论上可携带 toolkit 任意 id 行。**建议**：若要穷尽，「home 层文件是否存在 + 是否含 toolkit 行」需单独授权后补扫。
- **注入点 4（`--patch`）在本次运行中未使用**（`dsh` 以默认参数启动），无法从磁盘取证；其语义已由源码定案。
- **注入点 5（telemetry 补丁）** 仅在 `DSH_TELEMETRY_DISABLED` 非空且组合含 `session-telemetry-otel` 行时生成（`profile-boot:184-190`），本环境未验证实际取值。

---

## P2.2 启停开关 · **设计语义定案**（2026-09-18 关账，第 11 轮裁决）

**定案命题**：本面板的「启用」= **写入显式 `disabled: false`**，**不删键**。

- **源码事实**：`panel/manager/apply-engine.mjs` `planRowFlag()`
  - 键**已存在** → **原地替换**该行的值（保留缩进与书写风格）；
  - 键**不存在** → 在锚点行（`- id: <rowId>`）**正下方**插入一行（缩进 = 锚点 + 2）；
  - **从不删除键** —— 本函数没有任何删除逻辑。
- **实现自陈**：`createTogglePlan()` 的 JSDoc 原文 ——
  > `enabled = true` → 写 `disabled: false`（显式声明为启用；**不删键**，语义更明确）
- **正式声明（口径）**：
  > **面板 toggle 往返（停用 → 复原）会在文件里留下一条显式 `disabled: false` 行；其运行语义与「原本无该键」完全等价（loader 只在 `Boolean(disabled)` 为真时跳过加载，`false` 与「缺键」同义），但字节上不等价。字节级「无痕」不在面板能力范围内 —— 需走恢复程序（见下）。**

**关账依据（第 10 轮 a–e 取证）**：判据 (c)「复原后 sha 回基准」**在现有引擎下不可达**（结构性原因即「不删键」）。第 11 轮裁决：**(c) 不改判降级，改以授权恢复达成**（目标 = 逐字节基准 `ce0b0b81…`），并把上段语义**正式文档化**（本节 + `HANDOFF-MASTER.md` §三 批注 3.4）。
证据：`panel/docs/evidence/TERMINAL-ACCEPTANCE-ROUND10.txt`（含 4 次写链的 LCS 重建）。

**恢复程序（字节无痕的唯一路径）**：`node scripts/restore-cordis-baseline.mjs [--apply]`
—— 从 `git show HEAD:cordis.patch.yml` + toolkit-manager 4 行重建基准，**fail-closed**（重建 sha ≠ 期望值则不写盘），写前备份到 `.panel-backups/restore-baseline-<stamp>/`，写后复验 sha / size / CRLF。

**暂缓（明确不做）**：**给引擎加「复原时删键」能力** —— `apply-engine.mjs` 是安全核心，关账前不加能力；且「删键」存在**歧义**（删掉的是**上游原生键**还是**面板自己加的行**？需 plan 快照区分，复杂度上升）；显式 `false` 的自文档价值成立。**P2.3 后有真实需求再立项**（见 `ledger.md` L-036 与 `HANDOFF-MASTER.md` §四 叠加 4.6）。

---

## Q2 尾① · **shipped presets 补扫结论（正文）**（2026-09-18，21/21 PASS）

**范围**：DSH 安装目录下三个 shipped agent-preset 的**当前内容**（`AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-agent-presets\presets\{standard,ptc,cordis,minimal}\agent.cordis.yml`）。该目录**不属于项目红线**（红线仅 `~/.dsh`、cloudflared 进程、五子插件源码目录），故**无需额外授权**。

**结论（三个命题全部为「无」）**：
1. **toolkit 五个 insert-id 行 = 无**（`rate-throttle` / `web-search-local` / `web-search-router` / `agent-memory-runtime` / `toolkit-manager` 在四份 preset 里**一处也没有**）。
2. **覆盖 / 遮蔽声明 = 无**（`disabled` / `override` / `merge` 类命中**全部是 upstream 自带内容**，与 toolkit 无关）。
3. **`minimal` 未被改动**（0 处 `compact-router`，无 marker —— 与 `apply-preset-patch.mjs` 的明文「设计上不动 minimal」一致）。

**唯一命中项的定性（关键）**：`standard` / `ptc` / `cordis` **各含 1 行** `- id: compact-router` / `name: '@local/dsh-toolkit/compact-router'`。
这**不是泄漏、也不是旧名残留**，而是 `scripts/apply-preset-patch.mjs` 把 upstream 的 `- id: compaction-basic` / `@deepseek-ai/dsh-compaction-basic` **原位替换**的结果（三份一致：Δ **+5 行 / +142 B**），且 `cordis.patch.yml:3` 的注释**自陈**此事 ⇒ 属**文档化的预设改写注入路径**。

**sha 对账**：`standard a5e4d871…` / `ptc 7d9aff86…` / `cordis 9525c9a6…` **逐份 == `preset-patch-state.json.patchedSha`**；upstream 残留与旧名 `@local/dsh-compact-router` 残留**均为 0**。

**证据**：`panel/docs/evidence/Q2-SHIPPED-PRESET-SCAN.txt`（**21/21 PASS**）、`Q2-SHIPPED-PRESET-DIFF.txt`（55 KB 逐行 diff）；脚本 `scripts/q2-shipped-scan.mjs` / `q2-shipped-diff.mjs`。
**Q2 尾②（loader 源码定案）**见本文 **§P2.0③**（注入点全集 + 分平面合并语义 + 对「四层栈」的裁决）。
