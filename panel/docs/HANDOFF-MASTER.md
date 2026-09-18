# HANDOFF-MASTER —— dsh-toolkit 面板 · 总交接正本

> **头部时间戳（每次更新必须刷新）**：**2026-09-18 09:14（GMT+8）**
> 上一版：**2026-09-18 08:53**（初次建立）
> ⏳ **本文件当前为「骨架版」。** 用户将转来**总文档全文（九大节）**，届时**以全文为正本主体合并落盘**：
> 保留总文档全部结构（**铁律 / 运维手册 / 教训索引 / 沟通约定，一个不丢**），叠加本骨架版的更新
> —— 头部时间戳 / §3 五卡口径 / §4 进度行 / §5 安全模型 / §6 待用户项 / §7 目视清单 / §8 四层栈 / §9 回滚保险。
> **合并版落地后，本骨架版整体被取代。**
> 归属：`D:\dsh-plugins\dsh-toolkit`（正本仓）
> 维护约定：**只增不改语义**；任何口径变更必须在本文件与 `handoff-restart.md` 同步。

---

## 1. 本文件的地位

`handoff-restart.md` 是**过程留档**（按事件顺序追加，已到 §11.11，很长）。
本文件是**总交接**：只放「接手的人必须立刻知道、且不会随事件漂移」的东西 ——
**进度、口径、安全模型、待用户项、用户可见文案**。

**冲突时的优先级**：
1. 用户当轮指令
2. 本文件 §3（口径）/ §4（进度）/ §7（文案）
3. `handoff-restart.md` 11.7（P2 唯一权威范围定义）
4. `ledger.md` 台账（历史事实）

---

## 2. 权威文档索引

| 文档 | 作用 | 位置 |
|---|---|---|
| **本文件** | 总交接（进度 / 口径 / 文案 / 待用户项） | `panel/docs/HANDOFF-MASTER.md` |
| 过程留档 | 逐事件记录（重启布防、P2.0–P2.2b 全过程） | `panel/docs/handoff-restart.md` |
| 台账 | 编号台账 L-000~L-031，逐条验收标准 | `panel/docs/ledger.md` |
| 改动生效方式 | 为何必须 reload、源码行号证据 | `panel/docs/api-notes.md` |
| **验收证据正本** | 证据入库 + 裁剪排除证据 | `panel/docs/evidence/` |

---

## 3. 卡片口径（权威）—— **5 行 / 5 卡**

> 用户点名的常驻口径节。**口径 = 证据为准，不据转述/猜测改动。**

### 3.1 卡片数 = 5

**判据**：面板卡片数 = `lib/` 下**含 `dsh.plugin.json`** 的目录数 = **5**。
实现位置：`panel/manager/snapshot.mjs:112`（`readdirSync(libRoot)` + 清单存在性检查）。

### 3.2 5 卡 ↔ 5 行 映射表

`cordis.patch.yml` 顶层共 **7 个行块**：`- id: web`、`- id: web-search-deepseek`（这两个是**配置行、非插件挂载行**）
\+ **5 个 `- insert:` 插件行**。5 张卡与 5 个插件行的对应关系如下：

| # | 卡片（`lib/` 目录） | 包名 | 对应 `- insert:` 行 id | 行号 | 启停开关 |
|---|---|---|---|---|---|
| 1 | `agent-memory` | `@local/dsh-toolkit/agent-memory` | `agent-memory-runtime` | **74** | **开放** |
| 2 | `compact-router` | `@local/dsh-toolkit/compact-router` | **无** | — | **不开放** |
| 3 | `rate-throttle` | `@local/dsh-toolkit/rate-throttle` | `rate-throttle` | **14** | **开放** |
| 4 | `search-router` | `@local/dsh-toolkit/search-router` | `web-search-router` | **64** | **开放** |
| 5 | `web-search-local` | `@local/dsh-toolkit/web-search-local` | `web-search-local` | **58** | **开放** |

- **开放 toggle 的是 4 张，不是 5 张。** 行号 4 条已写成常驻断言
  （`p1-smoke.mjs` 与 `p22-verify.mjs` 各一份，与真实文件逐字对账）。
- **卡片顺序 = `readdirSync` 字母序**：agent-memory → compact-router → rate-throttle → search-router → web-search-local。
- **`compact-router` 为何不开放**：它的挂载由 `scripts/apply-preset-patch.mjs` 改写**预设行名**完成，
  **根本不在 `cordis.patch.yml` 里**（该文件第 3 行注释即写明）。没有可写的行 ⇒ 两套渲染器都显式返回空。
  引擎侧若被强行走 toggle 会报 `anchor-missing`（fail-closed，不会误写别的行）。
- **`toolkit-manager` 为何不是卡**：它确实占一个 `- insert:` 行（第 80–82 行，行名 path-like
  `file:///D:/dsh-plugins/dsh-toolkit/panel/index.js`），但**只出现在 `snapshot.self`**，
  UI 里唯一用途是页头那行元信息「… · 本面板已启用/未启用」。**面板不自带开关**，避免"关掉自己"。

### 3.3 名词澄清（本轮两次转述失真的根因）

- **「compact-memory」在 5 张卡里不存在。** `agent-memory（记忆）` 与 `compact-router（上下文压缩）`
  是两个独立插件，**应为二者串读**。此点已两次出现，**口径按本节为准**。
- 用户两屏共见 4 张卡（agent-memory / compact-router / rate-throttle / web-search-local 之一），
  与「5 卡中 4 张开放 toggle」不矛盾。

---

## 4. P2 进度（常驻进度行）

> **当前进度：P2.2 已落库，待用户 reload 目视验收 → 真实终验（终验通过时一并处置 §9 的 M 项）。**
>
> **终验 SHA 对账基准 = 磁盘当前值** `ce0b0b81c91ca4c420bb5302b2dbe951de0347ca729122511be288aa7c2b76b9`（**3097 B、CRLF、含 4 行 toolkit-manager**）。
> **不得**以 git HEAD 的 `7541c05aaaec808f8e6500356bed3b25550998ef7a1bcf560b0c167bcb351b97`（2914 B、无行）作基准 —— 那是「面板未挂载」的历史态，详见 §9。
> 已落库：`c91de92`（启停开关主体）· `51c2c0d` / `8f6b392`（文档与清单）·
> `558e62f`（全卡覆盖 + Q1 安全闸 + 确认页人话）· `f6d99eb`（台账 L-030 + handoff 11.10）。

### 4.1 P2 各阶段状态

| 阶段 | 内容 | 状态 |
|---|---|---|
| P2.0① | `parseRootRows` 缩进修复 | ✅ 完成（`193bdd8`，L-026） |
| P2.0② | 写路由 guard 升级（CSRF + 配对服务、禁 fallback） | ✅ 完成（`2b05777`） |
| P2.1 | 两段式写框架（plan → 确认 → execute、SHA 冲突、备份+保留策略） | ✅ 完成（`a27da81`，L-028） |
| **P2.2** | **启停开关**（锚点唯一、交叉引用检查、双层开关分立） | **✅ 完成，待 reload 目视验收**（L-029 / L-030） |
| P2.3 | 配置编辑（白名单 + 范围/枚举校验 + 服务端校验） | ⏳ 待办 |
| P2.4 | doctor 操作台 + 两套回滚 | ⏳ 待办 |

### 4.2 P2.2 待验收三项（reload 后目视）

1. 5 张卡里 **4 张有启停开关**、`compact-router` **无**（口径见 §3）。
2. 双层开关**分立**呈现（不合并）。
3. 确认页含「**下次重启生效**」人话提示 + `disabled` 字段解释。

> 另见 §7 的 reload 目视清单（含用户本轮新增的「改哪一层」文案确认项）。

---

## 5. 安全模型（全 P2 阶段适用）

两段式 · SHA 冲突检测 · 锚点唯一 · 值白名单 · 写路由 CSRF + 配对服务校验（**禁 fallback**）·
写前备份 · 保留策略（最新 20 份 OR 30 天，另加 `maxTotal=40` 绝对上限）· plugin-manager 并发防线（**快照现读不缓存**）。

**写守卫判据**（`panel/index.js`）：`guard(handler, options)` 第 200 行，`isWrite = options.change === true` 第 201 行；
写路径 `isAllowedWrite`（第 191 行，禁 fallback）与只读路径 `isAllowedRead`（第 180 行，允许 `devicesFile` 兜底）**双轨**。

---

## 6. 待用户项

| # | 事项 | 状态 |
|---|---|---|
| U1 | **reload 一次** → 按 §7 清单目视（含 C1/C2/C3 文案 + 确认页新文案两句 + rate-throttle 黄卡文案） | **待用户** |
| U2 | **真实终验**（判据不变）→ 通过时一并处置 §9 的 `M cordis.patch.yml`（语义化提交） | 待终验 |
| U3 | ~~Q2 四层 patch 栈扫描（涉 `~/.dsh` 需先授权）~~ → **✅ 已闭环**：`~/.dsh/.agent-presets` 一次性只读授权已用，①②③④ 四层结论见 §8 与 `panel/docs/evidence/Q2-LAYER-SCAN.txt`（**20/20 PASS**） | 已完成 |
| U4 | **Q2④ 的残留可选项**：3 个 shipped preset（standard / ptc / cordis）的**当前内容**位于 `AppData/…/npm/…/dsh-agent-presets/presets/`，**不在本轮授权路径内、未读**；是否另给 AppData 只读授权 | 待用户定 |
| U5 | **总文档全文**转来 → **合并落盘**（见头部说明）；届时同时**对账 §8 的四层定义** | 待用户 |
| U6 | 「compact-memory」串读确认（口径已按 §3.3 定为串读） | 待用户确认 |
| U7 | `doctor/dry-run` 的 `{ change: true }` 属**有意过度收口**，建议保留（专节见 `panel/docs/api-notes.md`） | 待用户认可 |

---

## 7. 用户可见文案口径（reload 目视清单）

> 依据：用户 2026-09-18 截图观察到「开关旁有『两层，改第一层』类说明」，询问是否为设计内。
> **答复：是设计内，且两套渲染器逐字一致。** 以下为**逐字**原文（`panel/client/index.js` / `panel/client/panel.html`）。

| # | 位置 | 逐字文案 | 出处 |
|---|---|---|---|
| C1 | 开关标题行 | `启停开关（两层分开，改的是第一层）` | `index.js:390` / `panel.html:245` |
| C2 | 开关按钮（停用态） | `停用（改第一层）` | `index.js:414` / `panel.html:258` |
| C3 | 双层不一致告警 | `⚠ 两层开关不一致，所以现在没生效` | `index.js:210` / `panel.html:178` |
| C4 | 确认页生效时机（停用方向） | `执行后此插件将于下次重启时停用（当前仍运行）。` | 确认页 |
| C5 | 确认页生效时机（启用方向） | `执行后此插件将于下次重启时启用（当前未加载的不会立刻加载）。` | 确认页 |
| C6 | 条件开关（`!!js`）层 1 标签 | `条件开关（面板不解释）` | 层 1 状态行 |

- **C1/C2 是「改的是第一层」的准确说明**：`enabled` 的层 1 = patch 行 `disabled`（配置文件，决定**有没有被加载**）；
  层 2 = `config.enabled`（插件内部，决定**加载了但功能开不开**）。**面板只改层 1**，故必须写明，避免用户误以为改的是插件内部。
- **C3 用词是「两层开关」，不是「两层数据」**（用户 Q7 提问项，已逐字核对两个渲染器一致）。

### reload 目视清单（逐项打勾）

- [ ] 卡片标题为**英文原名**，中文在第二行副标题
- [ ] 5 张卡：4 张有启停开关，`compact-router` 无开关
- [ ] 双层状态**分立两行**呈现（不合并成一个开关值）
- [ ] `rate-throttle` 呈现**黄色**「已加载 · 功能开关关闭，暂不生效」（两层取值相反 —— **这是设计内展示，不是故障**）
- [ ] 开关标题行含 **C1** 文案、按钮含 **C2** 文案
- [ ] 点击开关进入**确认页**，含目标文件 / 行号 / diff / **C4 或 C5 生效提示** / `disabled` 解释
- [ ] 页头元信息行显示 `toolkit-manager`（不是卡片）
- [ ] doctor 区显示「没有发现任何问题」（与服务端 0/0/0 一致）

---

## 8. 四层 patch 栈（Q2 终局结论 + 物理载体映射）

> 复现：`node scripts/q2-layer-scan.mjs --agent-presets`（**20/20 PASS**），输出存档 `panel/docs/evidence/Q2-LAYER-SCAN.txt`。

### 8.0 先说一句前提（重要）

**「四层 patch 栈」这一说法在仓内没有先例**：全仓 `grep 四层` 只命中本任务自己写的 L-031 / handoff 11.11 / 本文件。
下面这张表是**本侧（命令行侧）的定义**，不是对某份既有文档的引用。**总文档全文到达后必须逐层对账**；
对不上就说明有第五层或某层被合并，**扫描不算穷尽**。

### 8.1 四层 → 物理载体映射表

| 层 | 语义 | 物理载体 | 源码/文件证据 |
|---|---|---|---|
| **①** 顶层 bundle patch | 决定**挂哪些插件** + 行级 `disabled` | `cordis.patch.yml`（仓根） | `package.json:28` `dsh.bundle.patch="./cordis.patch.yml"`；`package.json:19-25` `files[]` 含它；面板落盘目标亦为此文件（`panel/index.js:275` plan / `:328` toggle） |
| **②** 五插件清单 | 声明 `requirements`/`exports`，**不含挂载行** | `lib/{rate-throttle,compact-router,agent-memory,search-router,web-search-local}/dsh.plugin.json`（5 份） | 成卡判据 `panel/manager/snapshot.mjs:112`（`readdirSync(libRoot)` + 清单存在性） |
| **③** 面板子插件清单 | 面板自身的注册声明 | `panel/dsh.plugin.json`（+ 运行时入口 `panel/index.js`） | `panel/dsh.plugin.json:9` `inject:["webServer"]`；`panel/index.js:16-17` `name="toolkit-manager"`；`panel/package.json` 为让 `locatePkgJson` 走 `nearestPackage`（`api-notes.md:137`） |
| **④** 预设改写器 | 把预设里的 compaction 行换成 toolkit 的 `compact-router` | `scripts/apply-preset-patch.mjs` → 写 `~/.dsh/.agent-presets/<id>/agent.cordis.yml` + shipped presets | 脚本 `:31` `USER_PRESETS_DIR=homedir()/.dsh/.agent-presets`；`:64-78` `locatePresetsDir()`；`:33-46` `ROW_UPSTREAM`/`ROW_NEW`；`cordis.patch.yml:3` 注释自陈「compact-router 不在此」 |

### 8.2 终局结论（① ② ③ 层）

**结论：三层中既不存在 toolkit 五个 id 的重复行，也不存在任何覆盖 / 遮蔽声明。**「无」即结论，逐层给据：

| 层 | 扫描项 | 结果 |
|---|---|---|
| ① | `- id:` 行总数 | **9 个**：顶层 2（`web`、`web-search-deepseek`）+ 嵌套 7。其中**插件挂载行 5 个**（`rate-throttle` / `web-search-local` / `web-search-router` / `agent-memory-runtime` / `toolkit-manager`），另 2 个（`v4-pro`/`v4-flash`）是 `rate-throttle.routing.staticGroups` 的**组 id**，不是挂载行 |
| ① | 同 id 检测 | **每个 id 恰好出现 1 次**，无重复 |
| ① | 覆盖/遮蔽声明 | `override` / `overrides` / `replace` / `shadow` / `覆盖` / `遮蔽` / `取代` 关键词 **0 命中**（已剔除注释行） |
| ① | 行尾前提 | CRLF 成立（P2 写路径前提） |
| ② | 五清单字段 | 仅 `manifestVersion` / `name` / `requirements`（`compact-router` 另有一个 `optionalDeps`）。**无 `id`、无 `patch`/`patches`、无 `override`、无 `bundle`** ⇒ **层②既不产生、也不能遮蔽任何 patch 行** |
| ③ | 面板清单字段 | 同上（`manifestVersion` / `name` / `requirements`）；`panel/package.json` 只声明 `dsh`（client 面），**不声明 patch 文件** |

**跨层同 id 检测**：五个 id **只出现在第①层**。第②③层用的是**包名**（`@local/dsh-toolkit/*`），不是行 id，不构成同 id。

### 8.3 终局结论（④ 层，`~/.dsh/.agent-presets` 一次性只读授权）

**授权范围**：仅 `~/.dsh/.agent-presets`（脚本默认**完全不读**该路径，需显式 `--agent-presets`）。**严格只读**。

| 目录 | size | 状态 |
|---|---|---|
| `liangshen`（活动用户预设） | 21780 | 含 `@local/dsh-toolkit/compact-router` ✓；**无** `dsh-compaction-basic` 残留；**无**旧名 `@local/dsh-compact-router` 残留 |
| `liangshen.bak-20260914`（**人工备份目录**） | 19792 | 同样含新名 `compact-router`。脚本 `discoverUserPresetIds()` 按名含 `.bak` **排除**（`apply-preset-patch.mjs:84`）⇒ 不会被重复改写。**但它含 `agent.cordis.yml`，是否会被 dsh 当预设列出属 dsh 侧行为，本轮未验证（如实标注）** |

**对账**：`preset-patch-state.json`（仓内）记录 4 条 —— `standard` / `ptc` / `cordis`（`2026-09-14T05:13:13Z`）+ `liangshen`（`2026-09-14T08:02:55Z`）。
`preset-backups/`（仓内 4 份 `.bak`）逐份分析显示 **④ 层有两种历史来源**：

| `.bak` | size | 改写前状态 |
|---|---|---|
| `standard` / `ptc` / `cordis` | 12928 / 14003 / 14010 | **upstream**（含 `@deepseek-ai/dsh-compaction-basic`） |
| `liangshen` | 19784 | **旧独立插件**（含 `@local/dsh-compact-router`）⇒ 迁移到新名是一步**独立的历史动作**（marker 时间戳亦更晚） |

**断言**：每个 `.bak` 都是**真正的改写前状态**（upstream 行 或 旧插件行），且**不含新名行** ⇒ 回滚语义成立。

**未覆盖面（如实标注）**：3 个 shipped preset 的**当前内容**在 `AppData/…/npm/…/dsh-agent-presets/presets/`，**不在本轮授权路径内，未读**；
marker + 仓内 `.bak` 可**间接**支持「它们已被改写」，但**其当前内容的验证需另给 AppData 只读授权**（见 §6 U4）。

**④ 层结论**：工具链里只有 `compact-router` 经第④层挂载（其余 4 个插件行不在任何预设里）；无旧名残留、无 upstream 残留、每个改写都有 `.bak` 可回滚。

## 9. 运行配置的 `M` 项：`toolkit-manager` 4 行（Q6 溯源 + 处置 + 回滚保险）

### 9.1 确切内容（diff 全文）

`git diff` 的全部内容就是这 4 个 `+` 行（追加在文件末尾）：

```diff
+
+- insert:
+    - id: toolkit-manager
+      name: 'file:///D:/dsh-plugins/dsh-toolkit/panel/index.js'
```

**字节账完全闭合**（`q2-layer-scan.mjs` 断言）：磁盘 `3097` = `git HEAD` blob `2914`（git 库内存 LF）+ 追加块 `101` + CRLF 增量 `82`。
⇒ **磁盘 = HEAD + 这 4 行，逐字节可复现 ⇒「除这 4 行外零漂移」是硬结论，不是估计。**

### 9.2 写入者与写入时机（如实说明，含一处**溯源缺口**）

| 项 | 结论 |
|---|---|
| **git 侧** | 该字符串**从未进入该文件的 git 历史**（pickaxe `-S toolkit-manager -- cordis.patch.yml` **无命中**）。该文件在 git 里只有 2 次提交（`e50bb00` 总装、`37819e9` Sogou 修正），HEAD blob **2914 B、完全不含该行** |
| **可归因的最早证据** | `.panel-backups/arm-manifest-20260917-105930/cordis.patch.yml`（**3072 B**）**已含该行**，name 为旧名 `@local/dsh-toolkit/panel` ⇒ 该行在 **2026-09-17 10:59:30 之前**已存在于磁盘 |
| **19:55:50 改写** | 由 P2 实施改为 path-like `file:///…/panel/index.js`（依据 `api-notes.md:132-137` 的决策：path-like 才能让 `locatePkgJson` 走 `nearestPackage` 命中 `panel/package.json`）。记载于 `ledger.md:65` 与逐版对账表 `ledger.md:72` |
| ⚠️ **溯源缺口** | **该行的「首次落盘」时刻与操作者未留档** —— 无 git 记录、无备份捕住创建瞬间。此前 ledger 只记了「**行名改写**」，未记「**行首次落盘**」。**这是本轮查出的真实缺口，据实申报** |

### 9.3 「既有约定」的正本出处（**出处存在，非口说无凭**）

| 出处 | 原文/内容 |
|---|---|
| `panel/docs/ledger.md:214` | 「…`cordis.patch.yml` 的 4 行改动**未提交**（属运行配置，按 11 节程序在重启验收后单独处置）。」 |
| `panel/docs/ledger.md:55-65` | L-023-① 结论 2：对 live 与 10:59 arm-manifest 基线的逐版对账（含该行改名 diff） |
| `panel/docs/handoff-restart.md:118-122` | §11 回滚程序（该 4 行的语义来源） |

### 9.4 处置意见：**重启验收通过后语义化提交**（同意用户方向）

**理由**：磁盘是运行真相；**提交只改 `.git`、不动磁盘字节**，故 `ce0b0b81…` 对账不受影响；**提交后 HEAD 与磁盘一致，回滚才有「保留面板」的语义目标**（见 9.5）。

**唯一可能的「不提交」理由**：该文件属运行配置，含环境相关路径（`D:/dsh-plugins/…`、`C:\Users\LENOVO\.agent-memory`），
入版本库会降低可移植性。**但这是既成事实 —— 文件本身早已入库，只是缺这 4 行** ⇒ **不构成不提交的理由。结论：提交。**

### 9.5 回滚保险（**已实测的陷阱，务必先读**）

> ⛔ **`git checkout -- cordis.patch.yml` / `git restore cordis.patch.yml` 一旦执行：**
> 回退到 HEAD blob（**2914 B、LF、不含该行**）⇒ **删掉 4 行 → `toolkit-manager` 入口消失 → 面板失联**，
> **且行尾从 CRLF 变 LF**（双重副作用）。**回滚此文件必须走备份恢复路径，不得用 git 检出。**

**实测证据**：`.panel-backups/pre-p2-toolkit-manager-20260917-2026-09-17T12-44-28/cordis.patch.yml` 与 `HEAD:cordis.patch.yml`
**sha256 完全相同**（`7541c05a…`），且**不含**该行。它 manifest 自称 *"Pre-P2 toolkit-manager row (git HEAD) backup with SHA for rollback"*
⇒ **它是「P2 之前」的回滚目标，不是「保留面板」的目标。**

**要保留面板时的正确回滚路径**（按目标语义选**含该行**的快照）：

| 想回到 | 快照 | size | 该行的 name |
|---|---|---|---|
| 已挂面板但未改 path-like（旧名） | `.panel-backups/arm-manifest-20260917-105930/` | 3072 | `@local/dsh-toolkit/panel` |
| 同上 + rate-throttle 处于 disabled 临时态 | `.panel-backups/pre-restore-disabled-20260917-114750/` | 3094 | `@local/dsh-toolkit/panel` |
| path-like 时代 | `.panel-backups/p21-evidence-…/`（3113）· `p22-evidence-…/`（3120） | — | `file:///D:/…/panel/index.js` |

**终验 SHA 对账基准 = 磁盘当前值（含 4 行）**：
`ce0b0b81c91ca4c420bb5302b2dbe951de0347ca729122511be288aa7c2b76b9`（**3097 B、CRLF**）。

---

## 10. 变更记录

| 时刻（GMT+8） | 变更 |
|---|---|
| 2026-09-18 09:14 | 新增 **§8 四层 patch 栈**（Q2 终局结论 + 物理载体映射表 + ④层扫描结果）与 **§9 运行配置 M 项**（Q6 溯源 / 处置意见 / **回滚保险**）；§4 进度行补入**终验 SHA 基准**；§6 待用户项按本轮进展重排；头部标注「**骨架版，待总文档合并取代**」。 |
| 2026-09-18 08:53 | **本文件初次建立**（此前不存在）。原因：用户 Q3 连续两轮点名 `HANDOFF-MASTER.md`，要求含「头部时间戳 + §3 5 行/5 卡口径 + §4 进度行」；磁盘上无同名文件（穷尽查找：正本仓 + 沙箱均 0 命中），故**按用户点名的三要素新建**，并把用户可见文案口径（§7）一并纳入。**若用户所指另有其文，请指出，即刻迁移。** |
