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
