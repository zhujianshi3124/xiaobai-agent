# H5 · Pack H 真机复验（真实 dsh-web-all 宿主）+ 一次启动故障的完整处置

> 时刻：2026-09-21 20:35–21:25（GMT+8）。对应提交链：toolkit@`b59f730`(H1) → `36f1be0`(H2) →
> `e80caea`(H3) → `8914d9b`(H4) → `de09e34`(H 收尾落账) → 本轮复验与修复。
> 授权：用户在本轮任务书内明确批准重启宿主做 H5 真机复验；撞上启动故障后追加裁决
> "选项 1 加严版 + H5 合并复验"（加引号修配置 + 恢复性重启 + 错账查成因 + 失效面登记）。
> 宿主：`@deepseek-ai/dsh@0.1.5-rc.1`，profile `web`，宿主自带 cordis **4.0.2** 与
> `cordis-plugin-loader@1.0.3`，Node **v24.19.0**，端口 127.0.0.1:3080，cloudflared 为子进程。
> 纪律兑现：**宿主侧零改造**；`~/.dsh` 全程未读未写；doctor 独立仓零改动；p1-smoke 一字未动；
> 本轮**未用** `scripts/p23-shadow-scan.mjs` 生成任何证据（D-2 在案）。
> 唯一被改动的宿主实际加载物 = 本仓 `cordis.patch.yml` 第 61 行**一个值的引号**（经用户裁决），
> 归属与影响面见 §二。

## 〇、结论一览

| 项 | 内容 | 结果 |
|---|---|---|
| ① | `toolkitRoot` 落点固定在仓内、与宿主启动 cwd 无关 | **PASS**（宿主 cwd 实测 `C:\Windows\system32`，两面落点均在 `D:\dsh-plugins\dsh-toolkit\.registry`） |
| ② | 全盘扫历史漂移点零新文件 | **PASS**（6 处漂移点 + 1 处本轮对照位，改前改后逐处对账，见 §四） |
| ③ | 双通道显示名一致（compact-router / agent-memory） | **PASS**（宿主进程内容器面直读，旧名 `RouterCompactionEngine` / `register` 在场 **0 条**，见 §三） |
| ④ | web-search-local 配置校验表现 | **双向实证**（坏值 → 掀掉整个宿主；加引号后 → 正常装载 ACTIVE + `Config` 在场，见 §二） |
| ⑤ | 轻量抽样：32 条路由 200/405 模式 | **PASS 32/32** |
| ⑥ | 轻量抽样：autoload ↔ 状态文件一致 | **PASS**（内存 `plugins:[]` ↔ 磁盘 `{plugins:{}}`；探针装卸后两侧同步落盘） |
| ⑦ | 轻量抽样：SSE 可连 | **PASS**（`hello` 首帧 `{"servicePrefix":"toolkit","at":1789996822658}`） |
| ⑧ | 门禁 | **PASS 4/4**（含基线滚存后复跑，见 §六） |

**本轮的实质收获**：H5 抓到的不是"落点漂移没修干净"，而是 **H3 那条"行为收紧"的真实爆炸半径**——
静态 patch 通道上一个从未被校验过的历史坏值，会让宿主**整机起不来**。仓内 293/293 全绿抓不到它，
因为没有任何用例把真实 patch 行喂给那个 schema。详见 §二与 debt《D-16》。

## 一、冷启动自证（新会话只靠仓库接上）

- `git log --oneline -8` 链尾 = `de09e34` ✓；toolkit 与 doctor 两仓 `git status --porcelain` 当时均为空 ✓；
  doctor 仓 HEAD 仍 `6839cc1`（零改动）✓。
- `node scripts/ci-local.mjs --with-scan` → **4/4 全通过（56.3s）**：npm test 全链 / 回归全跑 /
  doctor 真实仓 dry-run `0/0/0` / p23-verify。
- 两件遗留小事：
  - **marker.flag 处置**：新方案（H4/D-10）确认后为**孤儿**——五个使用方（`registry.test.mjs` /
    `panel-v2` / `panel-unified` / `audit-sink` / `p7-embed`）都在文件顶部把
    `process.env.FIXTURE_MARKER` 指到自己 pid 专属的 tmpdir，且夹具改为**调用时解析**；
    `toolkit-root.test.mjs` 换 cwd 的子进程用的是恒成功的 `save-probe-plugin`（不吃 marker）；
    `.panel-backups/g-real-host-smoke-20260921/g1-live-round1.mjs` 读的是 `last-error-plugin`
    的**另一枚**同名文件。门禁 4/4 在旧路径缺失下复现通过 ⇒ 连同其 `/tmp/stale-marker-backup.flag`
    备份一并清除。夹具头注仍保留仓内路径作**人工翻牌缺省**（非自动消费点），行为语义未动。
    入账在 debt A#23 文末。
  - **H3 行为收紧预告是否落 CHANGELOG**：已在案（`CHANGELOG.md` "⚠ 行为收紧预告（H3）"段，
    覆盖 web-search-local 校验启用与两个显示名变更），无需补。但**该段的"实测 0 issue"这一句是错账**，
    本轮按 §二 补正。

## 二、故障：宿主整机启动失败（exit 1），根因是一个未加引号的 YAML 标量

### 经过（如实按时序，含我两次误判）

| 序 | 时刻 | 动作 | 结果 |
|---|---|---|---|
| 1 | 20:54:47 | 第 1 次重启（启动目录 `%TEMP%\h5-launcher-cwd`，做 cwd 对照） | 杀树 3 pid → 新 pid 10796 → 20:55:55 端口回来 → **约 30s 后进程消失** |
| 2 | 21:01:13 | 改走机器上已注册的计划任务 `DSHToolkitPanelRestartTrigger`（其动作就是 `scripts/restart-trigger.ps1 -DelaySeconds 0`；工作目录缺省 `C:\Windows\System32`） | 新 pid 32556 → 21:01:29 端口回来 → **仍然在数秒后消失** |
| 3 | 21:03 | 我前台直接拉起 `D:\node.exe …\dsh\lib\bin.js web` 捕获 stderr | **抓到崩溃原文**，`EXIT=1` |
| 4 | 21:18:27 | 改完配置后再走同一个计划任务（恢复性重启） | 新 pid **6900**，21:18:44 端口回来，**持续存活**（至本报告写完仍在监听） |

**误判两处，都记下来**：① 我看到"两次都死在起来之后"时先判断是"我的脱管拉起方式把宿主连带带走"
（`Start-Process` 隐藏控制台拆卸）——第 2 轮走计划任务（独立会话）仍死，证伪；② 我在报告里推测
"`360` 这个引擎在坏值时代大概率从来没生效过"——§五的代码证据证伪，它其实一直在工作。
真正的因果从头到尾都是**同一个坏值让 boot 抛异常退出**，与拉起方式无关。

### 报错原文（去掉重复的 cause 嵌套，字段逐字保留）

```
Error: dsh: plugin tree failed to load: failed to apply loader entry include (cordis:include):
failed to apply loader entry web-search-local (@local/dsh-toolkit/web-search-local): invalid config:
  - $.engines[7] expected string but got 360 (at engines.7)
ValidationError: invalid config:
  - $.engines[7] expected string but got 360 (at engines.7)
    at resolveConfig (…/@deepseek-ai/cordis/lib/index.js:959:27)
    at Fiber._resolveConfig (…/cordis/lib/index.js:1346:25)
    at Fiber._reload (…/cordis/lib/index.js:1354:24)
    at async Fiber.await (…/cordis/lib/index.js:1399:24)
    at async Entry._start (…/cordis-plugin-loader/lib/index.js:538:4)
    …
    at boot (…/@deepseek-ai/dsh-app-boot/lib/index.js:1545)   ← 顶层 rethrow ⇒ 进程 exit 1
Node.js v24.19.0
```

### 根因（一行配置，肉眼可读的差异是一个引号）

本仓 `cordis.patch.yml:61`：

```yaml
-        engines: [searxng, google, duckduckgo, mojeek, bing, baidu, sogou, 360]
+        engines: [searxng, google, duckduckgo, mojeek, bing, baidu, sogou, '360']
```

`360`（360 搜索）不带引号 ⇒ YAML 解析成**整数 360** ⇒ 正好是报错里的 `engines[7]`。
该插件的 schema 是 `engines: z.array(z.string())`（`lib/web-search-local/index.js:124`）。

**为什么只有真机能撞出来**：H3（`e80caea`）之前，宿主通道拿不到 `Config`（loader 纯替换只认
default 对象上的字段），cordis 走 `if (!runtime.Config) return config` 直接放行；H3 把 `Config`
补到 default 上之后，宿主通道**开始真校验**，这个存在已久的类型错值当场变成启动期致命错误。
registry 动态通道不会撞：它的条目本来就按 schema 校验，且失败被隔离在单条目内（见《D-16》）。

**同文件相邻行目检结果**（用户裁决 A2 要求逐处确认）：全文件 83 行、5 个 `config:` 块
（`web` / `rate-throttle`（含嵌套 `routing` 与 `staticGroups`）/ `web-search-local` /
`web-search-router` / `agent-memory-runtime`），逐值核过类型——
`disabled/enabled/adaptive/tpmTurnSkip/clearCooldownOnUserSwitch/syncSelectionOnFailover/autoGroups: false|true`
按 schema 就是布尔；`minIntervalMs` 等 `*Ms`、`maxRequestsPerMinute`、`backoffFactor`、
`downgradeContextMargin` 按 schema 就是数值；`logPath: ''` 已显式引号；
`searchProvider: auto-search` / `fetchProvider: local-fetch` / `mode: auto` /
`defaultWhenUnknown: local` / 各 provider 与 model 名 / `excludeProviders: […]` /
`officialProviders: [llm-deepseek]` 全部含字母或连字符 ⇒ YAML 必为字符串；
`dataRoot: C:\Users\LENOVO\.agent-memory` 是 plain scalar，反斜杠在 YAML 中不作转义 ⇒ 字符串正确。
唯一"看着像字符串其实被解析成非字符串"的就是 `360`。
另有一处 `defaultWorkspace: null`（`:78`）经确认是**有意为 null**：消费点
`lib/agent-memory/plugin.js:108/123/211/244` 一律 `config.defaultWorkspace ?? process.cwd()`，
且 agent-memory 不带 `Config` ⇒ 不经 schema，无风险。⇒ **本轮只需改这一行，无连带项。**

### 归属与红线核对（用户裁决 A1 要求写明）

`cordis.patch.yml` 是 **toolkit 仓内文件**（本仓 bundle 层总装补丁，`panel/index.js:260` 的
`patchFile = join(toolkitRoot, "cordis.patch.yml")` 即它），宿主经 dsh 的 patch 机制加载它——
**没有改宿主代码、没有碰 `~/.dsh`**。但它**确实影响宿主实际加载行为**（这正是它能让宿主起不来
的原因），提交说明里已如实写明这一句。改前取基线、改后自证 sha：

```
改前 sha256 = ce0b0b81c91ca4c420bb5302b2dbe951de0347ca729122511be288aa7c2b76b9   3097 B
改后 sha256 = bb7af96fb47ea8275cdf91bd0978a611c144077b7c8006804ff22ce404c88b3c   3099 B
（差异 = 第 61 行插入两个单引号，git diff 1 insertion / 1 deletion，CRLF 全文件保持）
```

**基线滚存**：`ce0b0b81…` 是 P8/P2.4 时代的面板写入判据基准，被门禁内两个脚本当硬闸
（`p24-verify.mjs` / `p24-ui-matrix.mjs`：非基准态直接 ABORT 拒跑）。本轮随数据修复一并滚到
`bb7af96f…`，**守卫机制本身一字未放宽**（依旧是"启动取一次 sha、收尾再取一次比对是否被改写"），
只换了期望值，并在两处常量上方写了成因注释。历史证据文档（`G-REAL-HOST-SMOKE.md`、
`P24-BATCH1-*`、`api-notes.md` §关账、`CHANGELOG.md` P8 条目）里对 `ce0b0b81…` 的记载**保留原文不改**
——那是各轮当时的真实读数，改了就是伪造历史；本报告即为两者之间的分界记录。

### 校验报错的质量评估（用户裁决 B2，只登记不改 cordis）

| 维度 | cordis/dsh 这次报了什么 | 判定 |
|---|---|---|
| 哪个插件 | `web-search-local (@local/dsh-toolkit/web-search-local)` 逐字在场 | ✓ 到位 |
| 哪个字段 | `$.engines[7]` 且附 `(at engines.7)` 双写法 | ✓ 到位 |
| 期望什么 / 实际什么 | `expected string but got 360`（连实际值一起给） | ✓ 到位 |
| **哪个文件 / 哪一行** | 只字未提 `cordis.patch.yml`，也没有行号 | ✗ 缺 |
| 修法建议 | 无 | ✗ 缺 |
| 影响面提示 | 顶层文案是 `dsh: plugin tree failed to load`，不看嵌套链会以为是"整个插件树加载器坏了"，而实际只有一个字段类型错 | ✗ 误导倾向 |

⇒ 排查仍需人做一步"把 `engines[7]` 反查回 patch 文件第 61 行"。这是宿主侧（cordis / dsh-app-boot）
的行为，本仓不改，如实登记。

## 三、双通道显示名（H3 / D-12）：宿主进程内容器面直读

面板的 `mounted` 判定是**文件面**的（读 patch 行），证明不了宿主通道实际交给 cordis 的对象长什么样。
取证手段沿用 Pack G 的做法：借 toolkit 自己的安装 API 把一个**只读探针插件**装进宿主进程，
直接枚举 `ctx.registry` 里每个 runtime 的 `name / callback / Config / fibers[]`——
那是 cordis 决定这些值的唯一现场（`registry.plugin()`，宿主 cordis 4.0.2 `lib/index.js:1620-1634`）。
探针报告由宿主进程写入（`pid=6900` 与监听 pid 一致 ⇒ 确证发生在宿主进程内），读罢即卸载。

探针 `apply()` 当场观测（宿主 `cwd = C:\Windows\system32`，容器内 fiber 共 **324 条**）：

| 入口（本仓 5 个内置 + 面板） | 入口级 fiber 数 | `runtime.name`（cordis 显示名） | `callback.name`（JS 推断名） | Config / `~standard` | state |
|---|---|---|---|---|---|
| `rate-throttle` | 1 | `rate-throttle` | `apply` | false / false | 2 ACTIVE |
| `search-router` | 1 | `search-router` | `apply` | false / false | 2 ACTIVE |
| `compact-router` | **2**（宿主两个 agent 预设各挂一份 compaction 行） | 两条都是 `compact-router` | `compact-router` | true / true | 2 ACTIVE |
| `agent-memory-runtime` | 1 | **`agent-memory-runtime`** | **`register`** ← JS 推断名仍是旧的，声明名压过它 | false / false | 2 ACTIVE |
| `web-search-local` | 1 | `web-search-local` | `apply` | **true / true**（14 个 config 键齐全） | 2 ACTIVE |
| `toolkit-manager`（面板） | 1 | `toolkit-manager` | `apply` | false / false | 2 ACTIVE |

**旧名清零核对**：容器内 `displayName === "RouterCompactionEngine"` 的 fiber **0 条**、
`displayName === "register"` 的 fiber **0 条** ⇒ Pack G 记录的"宿主通道读 JS 推断名"这一格
在真宿主上已翻面。

**通道归属**（谁装的）：五个内置插件的入口级 fiber 父链一律是
`… < Include < Loader < (root)` 或 `… < Group < PresetTree < scope < AgentPresets < Include < Loader < (root)`，
**没有一条挂在 `toolkit-manager` 之下**；而探针自己的链是
`h5-probe-host-fibers < toolkit-manager < Include < Loader < (root)` ⇒ registry 通道与宿主通道
在链上可分辨，内置插件全部只走宿主 patch 通道。装探针前 `/v2/snapshot` 的 `plugins` 为空，
故容器里这些 runtime 不可能来自 registry 通道（归属前提成立）。

**取证脚本自身的一处缺陷（记下来防再犯）**：第一轮断言把 `displayName === "web-search-local"` 的
**全部** fiber 都当成入口级来要求"必须有 Config"，于是撞上假红一条——该插件内部还会
`ctx.plugin()` 起子 fiber，子 fiber 没有自有 `runtime.name`，`displayName` 是沿祖先链兜出来的。
修正口径为"入口级 = 自带 `runtime.name` 的那条"后复跑 **12/12 全 PASS**。
两轮的原始 JSON 都留档（`r2-b.json` 为缺陷版读数是**当时真实**，`r2fix-b.json` 为修正版），不删。
同族问题：`compact-router` 出现 2 条曾被我的"不得重复"断言判红，实为宿主预设多作用域的既有形态，
不是通道各装一份——该断言已改为"归属链上不得出现 toolkit-manager + 逐插件如实登记条数"。

## 四、落点固定与漂移点全盘扫描（H1 / D-11）

### 改前基线（宿主仍跑旧码时，20:38 取）

```
GET /api/toolkit-panel/v2/snapshot（旧码）
{"ok":true,…,"auditFile":"C:\\Windows\\.registry\\audit.jsonl","plugins":[]}      ← 无 durability 字段
GET /api/toolkit-panel/snapshot（旧码）  toolkitRoot = D:\dsh-plugins\dsh-toolkit  ← 面板侧一直是稳的
```

⇒ **同一进程两个根**这一格在真宿主上的直接形态：面板侧稳、registry 侧跟着启动 cwd 走。
（旧码实例的 `C:\Windows\.registry` 当时递归 0 文件，与《D-11 追加》记录一致。）

### 改后读数（H1 新码在场，宿主 cwd = `C:\Windows\system32`）

```
GET /api/toolkit-panel/v2/snapshot
  auditFile   = D:\dsh-plugins\dsh-toolkit\.registry\audit.jsonl
  durability.state = {ok:true, path:"D:\dsh-plugins\dsh-toolkit\.registry\state.json"}
  durability.audit = {ok:true, file:"D:\dsh-plugins\dsh-toolkit\.registry\audit.jsonl"}
  plugins = []
GET /api/toolkit-panel/snapshot → toolkitRoot = D:\dsh-plugins\dsh-toolkit（与 registry 侧同一个根）
探针报告 → 宿主进程 process.cwd() = "C:\\Windows\\system32"
```

**这就是"与启动 cwd 无关"的正证**：`resolve(cwd,"..")` 这条旧公式在 cwd=system32 下会给出
`C:\Windows`，也就是 Pack G 实测到的那个漂移点；新码在同一 cwd 下把两面都锚在仓内。
`durability` 字段本身在场，也是"H1 新代码确实跑在宿主里"的判别物（旧码快照没有这个字段）。

### 漂移点全盘扫描（基线 → 改后 → 探针装卸后）

| 路径 | 角色 | 基线（重启前） | 复验结束时 | 判定 |
|---|---|---|---|---|
| `C:\Windows\.registry` | 历史漂移点①（Pack G，cwd=System32 命中） | 存在 / 0 文件 | 存在 / 0 文件（mtime 未变） | 零新增 ✓ |
| `D:\dsh-plugins\.registry` | 历史漂移点②（Pack G，cwd=仓内命中） | 不存在 | 不存在 | 零新增 ✓ |
| `C:\Windows\System32\.registry` | 公式变体 | 不存在 | 不存在 | 零新增 ✓ |
| `C:\.registry` | 公式变体 | 不存在 | 不存在 | 零新增 ✓ |
| `C:\Users\.registry` | 公式变体 | 不存在 | 不存在 | 零新增 ✓ |
| `D:\.registry` | 公式变体 | 不存在 | 不存在 | 零新增 ✓ |
| `%TEMP%\.registry` | **本轮对照位**（第 1 次重启用 `%TEMP%\h5-launcher-cwd` 当启动目录，旧码会写这里） | 不存在 | 不存在 | 零新增 ✓ |
| `D:\dsh-plugins\dsh-toolkit\.registry` | **H1 唯一正确落点** | 0 文件 | **2 文件**：`state.json`(41 B) + `audit.jsonl`(386 B) | 应写入，已写入 ✓ |

写入实况（探针两次装卸在审计流水里留的痕，路径固定 ⇒ "事后可查"成立）：

```json
{"at":1789996840047,"event":"installed","pluginId":"legacy/h5-probe-host-fibers","durationMs":21}
{"at":1789996840070,"event":"removed", "pluginId":"legacy/h5-probe-host-fibers","durationMs":0}
{"at":1789996962205,"event":"installed","pluginId":"legacy/h5-probe-host-fibers","durationMs":23}
{"at":1789996962231,"event":"removed", "pluginId":"legacy/h5-probe-host-fibers","durationMs":0}
```
`state.json` 收尾为 `{"schemaVersion":1,"plugins":{}}` ⇒ 与 `/v2/snapshot` 的 `plugins:[]` 逐条相符
（autoload 一致性口径：卸载后不留记录、不留孤儿条目）。

## 五、坏值时代 `360` 引擎到底生效没有（用户裁决 B5）

**生效了**，不是静默失效。代码证据（`lib/web-search-local/index.js`）：

```js
function engineList(cfg) {
  …
  for (const name of cfg.engines ?? []) {
    const key = String(name) // YAML flow sets like [bing, baidu, sogou, 360] deliver the id as a number
    if (typeof ENGINES[key] === 'function' && !list.includes(key)) list.push(key)
  }
```
`ENGINES` 表里 `'360': qihu360Search`（`:1042`），`String(360) === '360'` ⇒ 命中真引擎。
也就是说这个文件**早就知道** YAML 会把 flow 序列里的 `360` 变成数字，并在消费点做了兜底；
缺的是**声明层**（patch 行）的类型正确性，而 schema 校验恰好卡的是声明层。

⇒ 历史影响表述：`360` 引擎在坏值时代**功能正常**，用户没有因此丢过搜索能力；
本轮修复的收益是"配置类型诚实 + 宿主能正常启动"，不是"修好一个坏掉的引擎"。
（我最初"大概率从来没生效过"的推测按上面的源码证据作废。）

## 六、轻量抽样与门禁

- **路由 32/32**（清单取自 `scripts/p1-smoke.mjs` 的声明表，单一事实源，未动该脚本）：
  7 条读路由全 200（`/ui` `/snapshot` `/custody` `/doctor/states` `/v2/snapshot` `/v2/events` `/v2/connector.js`），
  写路由 GET 一律 405，`/plan/status` 404 `plan-not-found`，`/v2/health` 400 `plugin-unknown`
  ——与 p1-smoke 声明逐条一致，"全部 200"的字面口径同样按声明表如实改写。
- **SSE**：`GET /v2/events` → 200，首帧 `retry: 2000` + `event: hello` +
  `data: {"servicePrefix":"toolkit","at":1789996822658}`。
- **五个内置子插件**：面板 snapshot 全部 `mounted`。
- **门禁**：`node scripts/ci-local.mjs --with-scan` → **4/4**（数据修复 + 基线滚存后复跑）。
  单跑复验：`p24-verify` 63/0、`p24-ui-matrix` 718/0、`node --test` pass=293 fail=0、
  doctor 真实仓 dry-run `0/0/0`。

## 七、错账修正：那句"实测 0 issue"当时是怎么验出来的（用户裁决 C）

原话（`CHANGELOG.md` Pack H 段、`docs/debt.md` A#22、`e80caea` 提交说明三处同源）：

> 本机真配置（`cordis.patch.yml` 的 engines 行 + 空配置 + 含未知键）实测 0 issue，装载不受影响

**查证结论：这句话在仓内找不到任何可重放的取证物，且它的验证方法本身够不到出事的那一层。**

1. 全仓 grep：没有任何用例/脚本把真实 patch 行的 config 喂给 web-search-local 的 schema
   （`test/dual-channel-parity.test.mjs` 只比 `name/inject/Config` **三元组的在场与形状**；
   `validateConfigAgainstSchema` 的消费者是 registry 的 `setConfig` / 安装预检路径，
   而内置插件是宿主 patch 行挂进来的，从来不经这条路）。
2. 沙箱 scratch 里那一轮真正留下的探针（`var/scratch/xval-audit-20260921/dual-channel-probe.mjs`）
   对 `engines` / `validate` / `config` **零命中**——它压根没碰配置值。
3. ⇒ 该断言只能是**逻辑验证**（"schema 声明的是 string 数组、engines 行看着都是引擎名、空配置和
   未知键按 schemastery 语义不会报错"）被当成了**端到端装载验证**来记。盲区有两层，缺一不可地都踩上了：
   **①没解析 YAML、②没经宿主通道**。`360` 这个值只有"YAML 解析 + 宿主通道真校验"两步串起来才会显形，
   而这两步当时都不在验证路径里。
4. **防再犯的口径（已写进 debt A#24 与《D-16》）**：凡"启用/收紧对配置的校验"这类改动，
   验收必须包含"**把宿主真实加载的那份声明文件按宿主的解析方式喂进新启用的校验器**"这一步；
   只做 schema 层面的逻辑推演不得记为"实测 0 issue"。

## 八、还原自证 / 本轮明确没做的事

- **live registry 收尾**：`plugins: []`（探针两次装卸均已卸载，`state.json` 为 `{plugins:{}}`）。
- **宿主侧**：未改任何宿主代码、未改任何 profile 文件；`~/.dsh` 未读未写；未取用会话凭据
  （§六 只走面板自己的 loopback 放行面）。重启全程只走既有权威脚本 `scripts/restart-trigger.ps1`
  （含经已注册计划任务 `DSHToolkitPanelRestartTrigger` 触发这一条路径）。
- **探针**：只读容器对象 + 往自己目录写报告，卸载后报告与探针目录不留装在容器里；探针与取证脚本
  留在 `.panel-backups/h5-reverify-20260921/`（gitignored：`h5-a-postboot.mjs`、`h5-b-probe.mjs`、
  `h5-drift-baseline.mjs`、`h5-probe-dryrun.mjs`、`probe-host-fibers/`、`r2-a.json`、`r2-b.json`、
  `r2fix-b.json`、`drift-baseline.json`、`drift-post.json`、崩溃原文 `host-stderr.log`）。
  探针机制在动宿主之前先做过**本地空跑**（用本仓 cordis 4.0.2 造容器，6/6 通过），没拿真宿主试错。
- **`cordis.patch.yml`**：本轮**故意**变更（一个值的引号），故 §二的改前/改后 sha 就是还原自证；
  P8 判据基准 `ce0b0b81…` 至此退役为历史值，新基准 `bb7af96f…`。
- **未做**：没调用任何销毁式写路由（`/plan` `/execute` `/mount/*` `/uninstall/execute` `/restore/*`
  `/doctor/apply/*`）；只用了只读路由与 registry 自己的 `/v2/install/*`、`/v2/uninstall`。
  没改 doctor 仓；没动 p1-smoke；没用 p23-shadow-scan 生成任何证据。
- **登记级遗留**（不在本轮动，已进 debt）：①《D-16》静态 patch 通道校验失败=掀整机 vs
  registry 通道的错误隔离不对称；② 新登记《D-17》：`scripts/restore-cordis-baseline.mjs` 与三个
  `scripts/terminal-acceptance-*.mjs` 仍指向已退役的 `ce0b0b81…`——其中恢复工具**在本轮改动之前**
  就已失效（它按"HEAD blob + 追加 toolkit-manager 4 行"重建基准，而 HEAD 如今已含那 4 行 ⇒
  重建出 3202 B，与期望 3097 B 不符，**fail-closed 不写盘**，实测复现于本轮），
  重跑这些时点脚本会看到 `NO ✗`，属预期，不是新事故。

---

## 引用勘误（守卫登记 · EXE-BOOT-014 追加）

> **本节是追加件：上文一行未改。** 依 EXE-BOOT-014 裁② 口径，文档引用守卫（`toolkit:scripts/doc-ref-guard.mjs`）
> 自本批起把存档件的存在性 / #符号 / 跨仓缺前缀失败与活文档同价判红；存档件是历史证词，改写即篡改证词，
> 故清偿走这里——逐条登记「原文里的引用形态 ⇒ 为什么判红、真位在哪、属哪一类」。行号形态按裁① 继续容忍，不在本表内。
> 条目里的 token 用 ASCII 双引号写出＝守卫规则 ⑤「声明原文不是文档引用」的既裁语境，本表自身不产生新引用。

- "dsh\lib\bin.js" —（原引 58 行，共 1 处）全局 CLI 包内路径（@deepseek-ai/dsh 的嵌套布局），仓外视角记法；本机实装在 AppData 的 npm 全局目录下，非仓内可核。
- "r2-b.json" —（原引 184/304 行，共 2 处）取证当时的探针输出文件（同上），非仓内可核。
- "r2fix-b.json" —（原引 184/305 行，共 2 处）取证当时的探针输出文件（同上），非仓内可核。
- "h5-a-postboot.mjs" —（原引 303 行，共 1 处）H5 真机轮的临时探针脚本（写在会话工作目录、会后未入库），非仓内可核。
- "h5-b-probe.mjs" —（原引 303 行，共 1 处）H5 真机轮的临时探针脚本（同上），非仓内可核。
- "h5-drift-baseline.mjs" —（原引 304 行，共 1 处）H5 真机轮的临时工装（同上），非仓内可核。
- "h5-probe-dryrun.mjs" —（原引 304 行，共 1 处）H5 真机轮的临时工装（同上），非仓内可核。
- "r2-a.json" —（原引 304 行，共 1 处）取证当时的探针输出文件（写在会话工作目录、会后未入库），非仓内可核。
- "drift-baseline.json" —（原引 305 行，共 1 处）取证当时的漂移基线读数文件（同上），非仓内可核。
- "drift-post.json" —（原引 305 行，共 1 处）取证当时的漂移复测读数文件（同上），非仓内可核。

> 计数自证：本文件登记 10 个 distinct 引用形态，覆盖守卫本批红集中属于本文件的 12 条。

- "lib/web-search-local/index.js" — S1 剔除批（C1-007 G1）出包后目标不存在；历史指其实现正本。