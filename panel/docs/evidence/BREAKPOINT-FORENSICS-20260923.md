# 波 0 · 断点普查取证单（"配/管"环，只读）

> 时点 2026-09-23。基线 toolkit `c5c9a59`（含清单落档 `fc4cf1c`）、doctor 仓 `2f12f53`。
> **本单不产生任何写操作**：未改两仓任何文件（除本单与两份 docs 笔）、未点任何面板写按钮、未跑 `--apply`/`--undo`、
> 未重启宿主、未取任何凭据（401 路由未碰）。宿主面读数一律取自**它自己的自述面**（批 4 停手事件后的防再犯口径）。
> 配套：`docs/feature-inventory-20260923.md`《续档》节给出这些读数的落差编号（F-69…F-91），本单给通路事实。

## 一、P-1 五插件 × 六操作通路（30 格）

patch 行 id 对照：`agent-memory`→`agent-memory-runtime`；`compact-router`→**无 patch 行**（`managedBy:preset-script`）；
`rate-throttle`→`rate-throttle`；`search-router`→`web-search-router`；`web-search-local`→`web-search-local`。

| 插件 | 配置 | 停用/启用 | 重载 | 卸载 | 健康 |
|---|---|---|---|---|---|
| agent-memory | 无入口（设计：`configPanel.editable:false`） | 通（`/toggle/plan\|execute`） | 不可达（设计） | 通（软/真两向） | **断（缺陷）** |
| compact-router | 无入口（设计） | **无格（设计：无 patch 行）** | 不可达（设计） | 通（预设向，spawn `--undo`） | **断（缺陷）** |
| rate-throttle | 通（18 字段白名单，唯一可写卡） | 通 | 不可达（设计） | 通 | **断（缺陷）** |
| search-router | 只读呈现，无写入口（第 19 轮裁定不给） | 通 | 不可达（设计） | 通（额外 unset `web` 行的 `searchProvider`） | **断（缺陷）** |
| web-search-local | 无入口（设计） | 通 | 不可达（设计） | 通（额外 unset `fetchProvider`） | **断（缺陷）** |

三条通则（每格的可判依据）：

1. **配置·写链**：`CONFIG_FIELDS`(18) → `POST /config/plan {rowId,path,value}` → 服务端 `rowId !== CONFIG_EDITABLE_ROW` 即
   `row-not-editable`，再 `validateConfigValue`（白名单 + 类型 + 范围 + 拒 YAML 特殊字符）+ 跨字段 `maxIntervalMs ≥ minIntervalMs`
   → `locateConfigKeyLine` 定位行 → `POST /execute {token}` → `executePlan`（expired / sha-conflict / anchor-moved）→ 写 `cordis.patch.yml` + `.panel-write-backups/<stamp>/`。
   配置·只读链：search-router 的 mode 取 `env > 热 JSON > patch` 三档遮蔽结果，面板只呈现不给写。
2. **停用/启用**：只改 patch 行 `disabled` **字面量**；现值若是 `!!js` 表达式 ⇒ `value-not-literal` 直接拒（本仓四张 patch 卡现值均为 `true/false` 字面量，实测在 `snapshot.patch.rows`）；
   停用方向附 `buildCrossRefs`（行 id + provider id + 声明式依赖），**只告知不阻断**。
3. **重载/健康 = 两条系统性断点**：
   - 重载唯一入口是 `POST /v2/reload`（需 registry 条目 + 逐字 confirm）。仓内 `.registry/state.json` 实测 `plugins:{}`
     ⇒ 内置五卡**永不**有 registry 条目 ⇒ 重载格对内置恒不可达。这是设计（patch 域改配置须重启），但**用户视角无提示**：
     面板卡片上没有"这个插件不能重载，请重启"的说明位（rate-throttle 的 `effectNote` 有"重启 DSH 后生效"，其余四卡没有）。
   - 健康唯一逐插件入口是 `GET /v2/health?id=`（亦需 registry 条目）⇒ **五卡整列皆断**。
     面板上能看到的"健康"只有整仓级两份：`POST /doctor/dry-run`（spawn CLI）与 `GET /doctor/states`（CLI 前 50 条 + 写前快照前 5 份），都不是逐插件健康。
     叠加两层原因：① 通道要不到条目；② 数据也没有——内置插件零模块导出 `healthCheck`（H3），批 3 只接通了读链。
     ⇒ 这条是本普查对"检/管"环给出的**最实质断点**，与契约"逐插件健康"的承诺直接冲突。

## 二、P-3 宿主读我仓 patch 的机制定位与热更新判据

| 项 | 读数（取自 `GET /api/toolkit-panel/snapshot`，HTTP 200） |
|---|---|
| 宿主实读哪一份 | `snapshot.patch.path` = **`D:\dsh-plugins\dsh-toolkit\cordis.patch.yml`**（机制：`~/.dsh/profiles/web/package.json` 的 `"@local/dsh-toolkit": "link:D:/dsh-plugins/dsh-toolkit"` 把本仓当 bundle 挂进） |
| **是否就是盘上这份** | **逐字相等已证**：宿主自述 `patch.text` 长度 2979 字符，与本仓盘上文件 `readFileSync(utf8)` 结果 `===` 为 **true**（原样比较与 CRLF 归一比较都 true）。盘上 3085 字节 / sha 前缀 `e8051fe9` / mtime 2026-09-21 22:41 ⇒ **判据基准未变** |
| 行数与内容 | 宿主 `patch.rows` = **9 条**；`web-search-local` 行 `config.engines = [searxng, google, duckduckgo, mojeek, bing, baidu]`（6 项，从宿主面读到，不是从仓内文件推） |
| 面板自身挂载 | `snapshot.self` = `{id:"toolkit-manager", name:"file:///D:/dsh-plugins/dsh-toolkit/panel/index.js", managedBy:"patch", enabled:true}` ⇒ 宿主按 **name import 模块**，与 `manifest.panels` 无涉（这是原稿"未能确认"第 2 条的相邻事实，仍**不构成**宿主读 `panels` 的证据） |
| 卡片与写盘面健康 | `snapshot.plugins` = 5 张卡，全部 `mounted:true / enabled:true / status:"mounted"`；`custody.presetState` = `{standard:true, ptc:true, cordis:true, liangshen:true}`；`custody.entries` = `[]` |
| 宿主进程 | 监听 `127.0.0.1:3080` 的 PID = **7556**（批 4 时是 26004 ⇒ 期间用户自己重启过，非本侧动作）。`Get-Process -Id 7556 | Select StartTime` 在本沙箱**无输出**（既有现象，见 memory）⇒ 不据此判宿主状态，宿主存活由 snapshot 200 自述证明 |

**热更新结论（可判据形式，不含猜测）**：本仓 patch 文件的改动**不会**被运行中的宿主自动吸收——判据是
"宿主自述 text 恒等于**它启动时**读到的那份"这一不变式无法在只读面上验证（要验证必须改一次文件，属行为变更）。
因此本普查给出的是**替代判据**：改 patch 后，若 `snapshot.patch.text` 与盘上不等、而 mtime 已更新 ⇒ 未热更；相等 ⇒ 要么已热更要么宿主重启过。
**该判据需要一次真写才收口** ⇒ 排入合并真机窗口（批 8）顺带做，本单不下"能否热更"的结论。

## 三、P-2 待用户动作单（协调侧"一次集中人工"可直接照取）

| 要看的 | 取什么 | 报什么格式 |
|---|---|---|
| 宿主原生设置页对 5 卡的显示 | 设置页里 dsh-toolkit 区：**每张卡的名称、状态字样、有没有"停用/删除/编辑配置"按钮**；与我方 `snapshot.plugins` 逐卡对照（5 卡名 = agent-memory / compact-router / rate-throttle / search-router / web-search-local，我方侧状态全 `mounted/enabled`） | `卡名 \| 设置页显示的状态字样 \| 有无操作按钮 \| 与我方 snapshot 是否一致(一致/不一致+差异)` |
| 设置页与面板 tab 的关系 | 那个 `toolkit-panel` 标签页在宿主设置页里**是否出现、排在第几**（我方只可证客户端 `ctx.slots.inject("settings.plugins.tab")` + `order 90` 声明在场，宿主是否消费未证） | 出现/未出现 + 位置 |
| 批 4-② 真实搜索一口 | 会话内做一次真实联网搜索（D-4 已闭过一次，这次是为批 4 的 ②） | 搜索是否出结果 + 大致时刻（我方可只读比对 `~/.dsh/logs/llm-requests.jsonl` 时刻，**不读内容里的凭据**） |
| 14 键生效面（批 4-③） | 面板里 web-search-local 卡片打开"配置"，看表单是否按 **14 个键**渲染（批 4 之后应生效模块 `Config`；现声明面只有 1 键 ⇒ 若表单出 14 项即翻正成功） | 表单字段数 + 前 5 个字段名 |

## 四、本单自曝的取证边界

1. 通路表来自**静态读码 + 只读 GET 复算**，未真点任何写按钮 ⇒ 每格是"通路可达性"证据，**不是**"端到端成功"证据。真点排批 8 观察窗。
2. 代理读码结论中我只抽验了 F-69/F-70/F-75/F-79/F-81/F-82 六条（逐字读）；F-71…F-78、F-80、F-83…F-91 属"代理实读、我方未复看"，
   已在续档节逐条标注 ⇒ 落批时须先复算再钉，不得拿未抽验读数当依据。
3. `patch-config-check.mjs`（门禁第 5 步）只按宿主通道语义校验**带 `Config` 的行**；本次顺带核到 web-search-local 的生效面是 14 键模块 `Config`（批 4 之后），
   而门禁里那句"现状 7 行里 2 行真校验"的计数**未复算**——若批 4 让面板通道也换源，第 5 步的覆盖面叙述可能要更新（记给 W10 文档追赶，本单不改）。
4. 探针目录 `var/scratch/feature-inventory-20260923/` 只有两枚 H2 夹具 manifest，**不足以**重建缺节 ⇒ 已按令面第 3 条用代码重建，第 2 条（报协调侧补转）同时生效：
   **原稿 ①-B/⑥ 仍请补转**，用于做"我重建的 22 条 vs 原稿 6 条"的差集对账（这是收口批 74/74 那条的前置）。
