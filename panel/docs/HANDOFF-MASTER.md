# DSH Toolkit 管理面板项目 · 总交接文档（HANDOFF-MASTER）

> **头部时间戳（每次更新必须刷新）**：**2026-09-18 13:42（GMT+8）**
> 上一版：**2026-09-18 13:25**（第 13 轮补登记版）· **本版 = 第 14 轮裁决落账版**（总文档九大节原文仍未改动）
> 归属：`D:\dsh-plugins\dsh-toolkit`（正本仓）
> 维护约定：**只增不改语义**；任何口径变更必须在本文件与 `handoff-restart.md` 同步。

> **原文头部（用户总文档的开头两行，逐字保留）**：
>
> DSH Toolkit 管理面板项目 · 总交接文档
> 最后更新：P2.1 验收后。本文档是四份正本之上的“总索引 + 项目史 + 判定记录”，新会话先读本文，再按索引读细节。

## 本文构成与读法（先读这段）

- **一 ~ 九 = 用户「总文档（九大节）」的原文，保真落盘。**
- **以 `📌` 开头的块 = 本侧叠加 / 批注**（进度、口径、源码实测结论、待用户项）。叠加块**不改动原文一个字**；凡存疑条目一律**加批注**，**绝不悄悄改写**。
- 原骨架版的 **§8 四层 patch 栈** 与 **§9 运行配置 M 项** 已分别并入 **§三 批注 3.2 / 附录 A**。
- **冲突时的优先级**：① 用户当轮指令 → ② 本文件 §三（口径）/ §四（进度）/ §七（目视清单）→ ③ `handoff-restart.md` 11.7（P2 唯一权威范围定义）→ ④ `ledger.md` 台账（历史事实）。

> **保真说明（三处排版归一，语义零改动；除此之外无任何改写）**：
> ① 原文以**纯文本**送达 —— markdown 强调（加粗 / 代码反引号）在传输中被剥离，**本侧不重新发明任何强调**（原文即所收，不加粗、不加反引号）；
> ② 原文「二、五份正本文档」处的表格在粘贴中丢失了列分隔符，本侧**按语义还原为 Markdown 表格，单元格内容逐字保留**；
> ③ 原文「三 / 四 / 六 / 七 / 九」为逐行罗列（每行一条），本侧**按行还原为列表项，文字逐字保留**；「八」为**单行原文**，其 `；` 分隔**不拆分**，整行照录。
> **保真抽检**：`node scripts/master-merge-fidelity.mjs` → 证据 `panel/docs/evidence/MASTER-MERGE-FIDELITY.txt`（用户原文关键句逐字比对落盘内容）。

---

## 一、项目是什么

- 用户有一个插件桶 D:\dsh-plugins\dsh-toolkit（bundle 形态，含 5 个子插件），管理麻烦，要一个可视化管理面板。现状：面板已建成并双入口可用（WebUI 设置页 tab + 直连 http://127.0.0.1:3080/api/toolkit-panel/ui），当前处于 P2 窄版施工中（让面板从“能看”变成“能操作”）。

> 📌 **叠加 1.1 — 现状已推进**：**P2.2（启停开关）已落库**，当前处于 **「待用户 reload 目视验收 → 真实终验」**（详见 §四）。
> 📌 **叠加 1.2 — 正本仓另有三处常驻资产**（原文未列，补全以免遗漏）：根 `AGENTS.md`（红线）、`scripts/`（全部验证脚本，可重放）、`panel/docs/evidence/`（**证据正本**，入库、只增不改）。

---

## 二、五份正本文档（本文件之下的一切细节都在这里)

| 文件 | 内容 | 何时读 |
|---|---|---|
| panel/docs/api-notes.md | DSH 平台 API 事实清单（带源码行号）+ 三次“源码转述被实测推翻”教训 | 任何涉及平台 API 的开发前必读 |
| panel/docs/handoff-restart.md | 重启程序（11 节）、回滚程序、根因档案（11.1–11.6）、P2 阶段表（11.7） | 重启前、施工前 |
| panel/docs/ledger.md | 唯一正本台账（L-0xx 条目） | 了解任务状态 |
| panel/docs/HANDOFF-MASTER.md | 本文档 | 每次新会话第一件事 |
| AGENTS.md | 项目红线（不 import 兄弟插件、备份、授权等） | 动手前 |

注意：沙箱根 D:\dsh-test-sandbox\ 下的 _handoff-*、_tmp_ledger-*、_api-notes-p2.md 等全部是已废弃工作副本（带 DEPRECATED 头），勿读勿写。

> 📌 **叠加 2.1 — 实为六份**：在原文五份之外，本侧增补**第六份正本** `panel/docs/evidence/`（**验收证据正本**）：把落在 `.gitignore` 排除的 `.panel-backups/` 里的证据**正本化入版本库**，使证据可与它证明的那次改动**同版本追溯**（含 `README.md` 的清单 + size + sha256）。分工：`.panel-backups/` = 原始留档（不入库、可清理）；`evidence/` = 正本（入库、只增不改）。
> 📌 **叠加 2.2 — 原文索引已被扩充**：`api-notes.md` 末尾已增设 **「P2.0③ DSH 启动的全部 patch / 配置注入点 + 合并语义（loader 源码定案）」**，`handoff-restart.md` 已增 **§11.11 / §11.12 / §11.13**。读到 §三 批注 3.2 时请对照该节。

---

## 三、系统架构速览（关键事实，均已源码定案）

- 平台：DSH（DeepSeek CLI 宿主），dsh web 跑在 3080，无热 reload——一切文件改动需重启进程才生效。重启方式见第七节。
- 四层 patch 栈：bundle 层（启动时固化）→ profile 层 → home 层 → overlay，同 id 后者覆盖前者。toolkit 的 5 个子插件行在 bundle 层（dsh-plugins\dsh-toolkit\cordis.patch.yml）。
- 面板服务端：panel/index.js，注入 webServer + subprocess，exact 路由 /api/toolkit-panel/*（ui / snapshot / doctor dry-run / plan / execute / plan/status）。
- 面板客户端：panel/client/，经 ModuleLoader + settings.plugins.tab 挂进设置页；行名是 path-like file:///D:/dsh-plugins/dsh-toolkit/panel/index.js（三段名过不了客户端发现机制，这是当初迁移的原因）。
- 安全链（不可破坏，逐条有事故背景）：全路由 guard = socket loopback AND（Host loopback OR 配对校验）；写路由必须标 {change:true}（P2.1 缺陷1的教训）且配对校验走 remoteWebUiPairing 服务、禁止 fallback hasOwn；公网唯一入口是 cloudflared 隧道（95c04a90ca73e397.dsh-market.com，持久化于 ~/.dsh/remote-web-ui-registry/web.json），手机经配对 cookie（dsh_pair）进门禁。
- 写操作唯一通道：panel/manager/apply-engine.mjs（P2.1 建）。顺序不可调换：取 plan → 过期 → 重读比 SHA → 锚点复验 → 备份 → 落盘 → 裁剪备份。错误码：sha-conflict/plan-expired/anchor-ambiguous→409。
- 冻结层警告：client bundle 与 panel/index.js 都是“激活时读入内存”，改了代码必须重启才生效；/snapshot 是实时计算的，不能用 snapshot 变了来判断 UI 已生效。
- 已知待修：无（parseRootRows 缩进 bug 已在 193bdd8 修复）。

> ### 📌 叠加 3.1 — 卡片口径（权威）：**5 行 / 5 卡**
>
> **判据**：面板卡片数 = `lib/` 下**含 `dsh.plugin.json`** 的目录数 = **5**（实现 `panel/manager/snapshot.mjs:112`）。
>
> | # | 卡片（`lib/` 目录） | 包名 | 对应 `- insert:` 行 id | **行号** | 启停开关 |
> |---|---|---|---|---|---|
> | 1 | `agent-memory` | `@local/dsh-toolkit/agent-memory` | `agent-memory-runtime` | **74** | **开放** |
> | 2 | `compact-router` | `@local/dsh-toolkit/compact-router` | **无（不在 cordis.patch.yml 里）** | — | **不开放** |
> | 3 | `rate-throttle` | `@local/dsh-toolkit/rate-throttle` | `rate-throttle` | **14** | **开放** |
> | 4 | `search-router` | `@local/dsh-toolkit/search-router` | `web-search-router` | **64** | **开放** |
> | 5 | `web-search-local` | `@local/dsh-toolkit/web-search-local` | `web-search-local` | **58** | **开放** |
>
> - **开放 toggle 的是 4 张，不是 5 张**；4 条行号已写成**常驻断言**（`p1-smoke.mjs` 与 `p22-verify.mjs` 各一份，与真实文件逐字对账）。
> - **卡片顺序 = `readdirSync` 字母序**：agent-memory → compact-router → rate-throttle → search-router → web-search-local。
> - **`compact-router` 为何不开放**：它的挂载**根本不在 `cordis.patch.yml` 里**，而由 `scripts/apply-preset-patch.mjs` 改写**预设行名**完成（该文件**第 3 行注释即写明**）。没有可写的行 ⇒ 两套渲染器都显式返回空；引擎侧若被强行走 toggle 会报 `anchor-missing`（fail-closed，不会误写别的行）。
> - **`toolkit-manager` 为何不是卡（行号补全，按用户点名）**：它确实占一个 `- insert:` 行，位于 `cordis.patch.yml` **第 80–82 行**：
>   `80: - insert:` / `81:     - id: toolkit-manager` / `82:       name: 'file:///D:/dsh-plugins/dsh-toolkit/panel/index.js'`。
>   但**它只出现在 `snapshot.self`**，UI 里唯一用途是**页头那行元信息**「… · 本面板已启用/未启用」——**面板不自带开关**（避免“关掉自己”）。
> - **名词澄清（两次转述失真的根因）**：**「compact-memory」在 5 张卡里不存在**；`agent-memory（记忆）` 与 `compact-router（上下文压缩）` 是两个独立插件，**应为二者串读**。用户两屏共见 4 张卡，与「5 卡中 4 张开放 toggle」不矛盾。
>
> ### 📌 批注 3.2 — 原文「四层 patch 栈」= **转述失真候选（第四例）**（**原文保留，不删不改**）
>
> **批注对象**：上文 §三 第 2 条 ——「四层 patch 栈：bundle 层（启动时固化）→ profile 层 → home 层 → overlay，同 id 后者覆盖前者」。
>
> **判定侧第 6 轮已裁定**：该命题**正本查无实据**（全仓 `grep「四层」` 仅命中本任务自己写的 L-031 / L-032 / 11.11 / 本文件）⇒ 记**转述链第四例**，与 **11.11**（「loopback 直接过」）**同族**。
> **穷尽标准据此修正**：**不以任何一侧的层定义为准，以 loader 源码定案为准。**
>
> **源码实测结论（替代表述，逐条有据；全量版见 `api-notes.md` §「P2.0③」）**：
>
> **注入点全集（按应用顺序）**：base `[]`（`profile-boot-Dk-7KqJc.js:124-130`，**每次启动被重写**）→ **bundle patch ×N**（各包 `package.json#dsh.bundle.patch`；`dsh-app-boot/lib/index.js:849-860`）→ **profile 层**（`$DSH_HOME/profiles/<name>/cordis.patch.yml`，`:861-862`）→ **home 层**（`$DSH_HOME/cordis.patch.yml`，`profile-boot:116-118,238`，**优先级高于 profile 层**）→ **`--patch` overlay ×N**（可重复，argv 顺序，`profile-boot:239`）→ **telemetry 合成补丁**（`profile-boot:184-190,249-250`）。
> **非 patch 注入面**：env `.env`（`loadLayeredEnv`，`dsh-app-boot/lib/index.js:1064-1078`）、`!!js` 表达式（`:30`；`entry.ts:104-108`）、**agent-preset 独立平面**（`dsh-agent-presets/lib/invariant.js:181,194,202,1277-1287`）、**toolkit 预设改写路径**（`scripts/apply-preset-patch.mjs`）。
> 唯一权威顺序出处 = `dsh/lib/profile-boot-Dk-7KqJc.js:212-220`（`allPatches()`：`bundlePatches → profile.patches → homePatches → overlays`）。
>
> **「同 id 究竟什么行为」——必须分平面答（本轮最有价值的定案）**：
>
> | 平面 | 行为 | 源码锚点 |
> |---|---|---|
> | **patch 层之间** | **后者覆盖**；`target[key]=value` **顶层赋值**，写 `config:` = **整块替换**，**非深合并**；patch 写了 `name` 且不符 → 警告跳过（防呆） | `dsh-app-boot/lib/index.js:98-105`；`README.zh.md:144`「用户 patch 会替换匹配到的整个配置——按 id 定位的 patch 不做深度合并」 |
> | **insert 形式** | **纯追加**（不去重 / 不替换 / 不合并）；目标须存在且 `group:true` | `:72-86` |
> | **loader 运行时（同树内）** | 同 id **复用同一个 `Entry`**，后到者**整体替换其 `options`** ⇒ **不会出现两个运行实例** | `cordis-plugin-loader/src/config/group.ts:20-40`（`existing ?? new` + `create:true`） |
> | **`disabled`** | **沿父链继承**；`!!js` 在启动时求值 | `cordis-plugin-loader/src/config/entry.ts:84-108` |
> | **agent-preset 平面** | ⚠️ **首根胜，方向与 patch 层相反**；根序 shipped(`system`) → `config.roots` → `$DSH_HOME/.agent-presets`(`user`) ⇒ **shipped 遮蔽用户同名预设** | `dsh-agent-presets/lib/invariant.js:426-432,1277-1287` |
>
> **裁决**：
> - 「**同 id 后者覆盖**」= **真**，但必须限定平面与语义：是**替换 / 顶层赋值**，**不是深合并**（`README.zh.md:144` 明文）。
> - 「**四层 patch 栈：bundle（启动时固化）→ profile → home → overlay**」= **转述失真候选（第四例）**。三条硬理由：
>   ① **「overlay」在源码里是通名、不是第 4 层的专名**：`loadOverlayPatches` **同时**用于 bundle patch 与 `--patch` 文件（`dsh-app-boot/lib/index.js:1152-1168`）；`renderConfigDump` 的形参注释即 *"overlay layers in application order (later wins)"*（`:1231`）⇒ **所有 patch 层都叫 overlay**。
>   ② **未覆盖注入面全集**：漏了 base / env 两个**非 patch** 面，以及 agent-preset **独立平面** ⇒ 不能作穷尽性依据。
>   ③ **「bundle 层（启动时固化）」措辞有害歧义**：若指「**不参与热重载**」→ **与源码一致**（`patchReload: live` 只监视**两份用户 patch 文件**，`README.zh.md:57`）；若指「**内容固定不可改**」→ **不成立**（**本 toolkit 的 `cordis.patch.yml` 就是一个 bundle patch**，随版本自由变化）。
>   **建议改写为**：**「bundle 层（仅启动时应用，不热重载）」**。
>
> **实测建议表述（可直接引用）**：
> > DSH 启动时把 patch 层按 **bundle（可 N 个，`dsh.profile.bundles` 顺序）→ profile `cordis.patch.yml` → home `cordis.patch.yml` → `--patch` overlays（可 N 个）** 的顺序**拍平成一个列表**，对 base 配置做**同一次** `applyEntryPatches`——**后者按 id 覆盖前者，且是浅层赋值 / 整块替换而非深合并**。另有 base(`[]`) 与 env(`.env`) 两个非 patch 面，以及 agent-preset 独立平面（**该平面同 id 为首根胜**）。
>
> **📌 第 14 轮改判（重要）**：「四层 patch 栈」命题**改判为「内容为真、出处未落盘」** —— 判定侧确认其四层内容（bundle→profile→home→overlays、后者按 id 覆盖）**与 loader 源码一致**；问题仅在于**判定侧引用时该命题无落盘出处**。原「转述失真候选（第四例）」之定性由**内容失真**降格为**出处缺失**。**归档口径（新）**：「**事实必须落盘出处，否则与失真不可分辨**」。四层表述**以本批注全表为准**（含「顶层赋值 / 整块替换、非深合并」精度 + E3 preset 平面「同 id 首根胜、与 patch 栈反向」的独立平面语义）。上方原批注文字**保留不改**。
>
> ### 📌 叠加 3.3 — Q2 ①~④ 与 shipped presets 补扫（终局结论）
>
> | 分组 | 载体 | 终局结论 |
> |---|---|---|
> | ① | `cordis.patch.yml`（仓根） | **9 个 `- id:` 行**（顶层 2：`web` / `web-search-deepseek`；嵌套 7 = **5 个插件挂载行** + 2 个 routing 组 id `v4-pro`/`v4-flash`，**组 id 不是挂载行**）；**无同 id、无覆盖 / 遮蔽声明**；CRLF 成立 |
> | ② | `lib/{5 目录}/dsh.plugin.json` | 字段仅 `manifestVersion`/`name`/`requirements`（`compact-router` 另加 `optionalDeps`）；**无 `id` / `patch` / `override` / `bundle`** ⇒ **既不产生、也不能遮蔽任何 patch 行** |
> | ③ | `panel/dsh.plugin.json`（+ `panel/package.json`） | 同构；`panel/package.json` 只声明 `dsh`（client 面），**不声明 patch 文件** |
> | ④ | `scripts/apply-preset-patch.mjs` → shipped presets + `~/.dsh/.agent-presets/*` | **不是一个 patch 层**，而是**绕过 patch 机制、直接改写预设源文件**的注入路径。只有 `compact-router` 经此挂载；无旧名 / upstream 残留；每个改写都有 `.bak` 可回滚（**两种历史来源**：upstream 与旧独立插件） |
>
> **跨层同 id**：5 个 id **只出现在第①层**；②③层用的是**包名**（`@local/dsh-toolkit/*`），不构成同 id。
>
> **④ 层授权与台账**：授权 = **用户当轮会话给出的一次性只读授权**（范围仅 `~/.dsh/.agent-presets`，脚本默认**完全不读**该路径，需显式 `--agent-presets`）。**授权时刻只能锚到「用户当轮消息」这一事件，无独立时间戳留档** —— **据实申报，不补造时间**。`panel/index.js:96` 读 `devices.json` 属**既定程序豁免**，不占该授权。
>
> **shipped presets 补扫（21/21 PASS，2026-09-18）**：依据 = **红线定义本身**（`AppData/…/npm/…` 属 DSH 安装目录，**不在红线内**）⇒ 无需新增授权。
>
> | preset | 字节 | sha256（前 12） | `- id:` 行 | marker 对账 |
> |---|---|---|---|---|
> | `standard` | 13070 | `a5e4d87112f0` | 31 | **== patchedSha ✓** |
> | `ptc` | 14145 | `7d9aff861cd6` | 32 | **== patchedSha ✓** |
> | `cordis` | 14152 | `9525c9a6ca40` | 32 | **== patchedSha ✓** |
> | `minimal` | 3119 | `e75af996ab8c` | 7 | 无 marker（脚本明文：**设计上不动**） |
>
> **结论**：① **toolkit 五 id 行 = 无**；② **覆盖声明 = 无**（`disabled`/`override`/`merge` 命中**全是 upstream 自己的内容**）；
> ③ 三份**各含 1 行** `- id: compact-router` —— 是 `apply-preset-patch.mjs` 把 upstream 的 `- id: compaction-basic` / `@deepseek-ai/dsh-compaction-basic` **原位替换**的结果（**Δ +5 行 / +142 B**，三份一致），`cordis.patch.yml:3` 注释**自陈**此事 ⇒ **文档化注入路径，不是泄漏**；upstream 与旧名（`@local/dsh-compact-router`）**均 0 残留**。
>
> **未覆盖面（如实申报）**：注入点 3（`$DSH_HOME/cordis.patch.yml`）**未读**（在红线内，授权只到 `.agent-presets`）；它**优先级高于 profile 层**，理论上可携带 toolkit 任意 id 行 ⇒ 若求穷尽需**单次授权**补扫（见 附录 B · U8）。
>
> **复现**：`node scripts/q2-layer-scan.mjs --agent-presets`（**14/14**，第 11 轮按「行已提交」新现实修订）· `node scripts/q2-shipped-scan.mjs`（21/21）· `node scripts/q2-shipped-diff.mjs`；证据 `panel/docs/evidence/Q2-LAYER-SCAN.txt` / `Q2-SHIPPED-PRESET-SCAN.txt` / `Q2-SHIPPED-PRESET-DIFF.txt`。

> ### 📌 批注 3.4 — **启停开关的设计语义**（第 11 轮正式文档化）
>
> **口径（正式声明）**：**本面板的「启用」= 写入显式 `disabled: false`，不删键。**
>
> - **源码事实**：`panel/manager/apply-engine.mjs` `planRowFlag()` —— 键**已存在则原地替换**、**不存在则在锚点行正下方插入**、**从不删除键**（该函数没有任何删除逻辑）。
> - **实现自陈**：`createTogglePlan()` 的 JSDoc 即写「`enabled = true` → 写 `disabled: false`（显式声明为启用；**不删键**，语义更明确）」。
> - **后果（必须知道）**：**面板 toggle 往返（停用 → 复原）会留下一条显式 `disabled: false` 行**。它与「原本无该键」的**运行语义完全等价**（loader 只在 `Boolean(disabled)` 为真时跳过加载，`false` 与「缺键」同义），但**字节上不等价**。
> - **结论**：**字节级「无痕」不在面板能力范围内** —— 需走**恢复程序**：`node scripts/restore-cordis-baseline.mjs [--apply]`（fail-closed + 写前备份 + 写后复验）。
> - **暂缓**：给引擎加「复原时删键」能力**已暂缓否决**（见 叠加 4.6）。
> - 详版 + 第 10 轮 a–e 取证过程 ⇒ `panel/docs/api-notes.md` §「P2.2 启停开关 · 设计语义定案」；证据 `evidence/TERMINAL-ACCEPTANCE-ROUND10.txt`。

---

## 四、当前进度（精确到条）

- 已完成并关账：P0（API 核查）、P1（面板骨架+安全修复，live smoke 27/27 时代）、UI 迁移进设置页（用户确认“可见，界面符合要求”）、P1.6 人话化（中文描述/三态/折叠/按钮去黑话；卡片标题为英文原名+中文副标题，用户明确要求，勿改回）、P2.0（parseRootRows 修复 ✅ + 写路由 guard 升级 ✅）、P2.1 两段式框架 ✅（commit a27da81，apply-engine 唯一通道，46+136+16 全绿）。
- 进行中：P2.2 启停开关——刚获批开工。要求：rate-throttle 首用例、锚点唯一命中断言、CRLF 兼容断言（真实 patch 是 100% CRLF）、停用交叉检查、双层开关 UI 分立（patch disabled 与插件自身 config.enabled 不得合并）、apply-engine 唯一通道、写前备份。完成后通知用户按 restart-trigger reload。
- 排队：P2.3 配置编辑（白名单：enabled 布尔/限流数值范围/路由模式枚举；服务端校验）→ P2.4 doctor 操作台+双回滚（doctor 回滚与面板备份回滚 UI 分列）。
- 明确不做：双文件注册编辑（exports/aliases）、compact-router 搬进面板（卡片保持“由预设脚本管理”提示）。

> ### 📌 叠加 4.1 — 常驻进度行（**本节为权威，覆盖原文「进行中」段**）
>
> > **当前进度：P2.3 设计稿已呈判定侧第 15 轮验收（`panel/docs/p23-design.md`）—— 批准前不动代码。** P2.2 已关账（2026-09-18 12:48）。前置四项全齐（注入点全表穷尽 ✓ / 盲抽 8/8 ✓ / U8 扫描 ✓ / U12=乙 ✓）。**待用户：U13（两个热 JSON 纳入乙程序只读清单 + 越界读追认）+ 设计稿批准。**
> >
> > **关账依据**：① **功能层**：用户侧终验全绿（停用 ✓ / 复原 ✓ / 互不牵连 ✓）· ② **字节层**：第 10 轮 a–e 取证中 (c)(d) 不达标 ⇒ 判据 (c) **不改判降级**，改以**授权恢复**达成基准 —— 已于 2026-09-18 12:40 恢复至 `ce0b0b81…`（3097 B / CRLF），并**语义化提交** `22fde85`（内容纯净：仅 toolkit-manager 4 行 insert）· ③ 全程写盘 0 次（除该次获授权恢复）。
> >
> > **终验 SHA 对账基准** = `ce0b0b81c91ca4c420bb5302b2dbe951de0347ca729122511be288aa7c2b76b9`（**3097 B、CRLF、含 4 行 toolkit-manager**）。**已恢复并提交**。
> > 历史提示（仍有效）：**不得**以旧 HEAD 的 `7541c05a…`（2914 B、无该行）=「面板未挂载」态作基准，详见 附录 A。
> >
> > 已落库：`a27da81`（P2.1）· `193bdd8`（P2.0①）· `2b05777`（P2.0②）· `c91de92`（P2.2 主体）· `51c2c0d` / `8f6b392` · `558e62f` · `f6d99eb` · `9676bdd` / `9024b8e` · `223a5fc`（L-033）· `77fc937`（L-034 总文档合并）· `41ad40c`（L-035 终验取证未通过）· **`22fde85`（toolkit-manager 语义化提交）** · `10ebcef`（D-01 + manifest 修复）。
>
> ### 📌 叠加 4.5 — **P2.2 关账记录**（2026-09-18 第 11 轮）
>
> | 项 | 内容 |
> |---|---|
> | 功能层终验 | **通过**（用户侧：停用 ✓ / 复原 ✓ / 互不牵连 ✓；UI 三态文案、双层分立、确认页人话逐字一致） |
> | 字节层 | 第 10 轮 a–e 中 **(c) ✗ / (d) ✗ / (a) 部分 ✗**（`reason`/`note` 恒 null）；**(b) ✓ / (e) ✓** |
> | 处置 | **(c) 不改判降级** ⇒ 授权**恢复**至基准；**(a)** 同批修（toggle 链传真值）；**新缺陷 D-01** 批准立即修 |
> | 恢复 | `scripts/restore-cordis-baseline.mjs --apply`（fail-closed；写前备份 `.panel-backups/restore-baseline-2026-09-18T04-40-47-135Z`）→ sha **`ce0b0b81…`** / 3097 B / CRLF ✓ |
> | 恢复后验证 | 快照 5 卡 = **基准态**（`agent-memory@74` / `rate-throttle@14` / `search-router@64` / `web-search-local@58`，`disabledExplicit=false`；`compact-router` 无行）· doctor **0/0/0** |
> | 提交 | `22fde85`（cordis.patch.yml，**+4 行，内容纯净**）· `10ebcef`（D-01 + manifest + 断言升级 + 工具） |
> | 回归 | **全绿**：p1 185 · p2 16 · p21 53 · p22 104 · p22-cards 79 · p22b 17 · q2-layer **14**（默认；带 `--agent-presets` 为 20）· q2-shipped 21 · fidelity 38 · backup-write 23 · node --test 93 · lint 通过 · doctor 0/0/0 |
> | 证据 | `evidence/TERMINAL-ACCEPTANCE-ROUND10.txt` · `D01-MANIFEST-FIX.diff` · `MASTER-MERGE-NORMALIZATION.txt` |
>
> ### 📌 叠加 4.6 — **暂缓 / 明确不做**（截至关账）
>
> - **明确不做**（原有）：双文件注册编辑（`exports` / `aliases`）；`compact-router` 搬进面板（卡片保持「由预设脚本管理」提示）。
> - **本关账新增暂缓**：**给 `apply-engine` 加「复原时删键」能力** —— 第 11 轮裁决（见 `ledger.md` L-036）。理由：engine 是安全核心，关账前不加能力；「删键」存在**歧义**（上游原生键 vs 面板自加行，需 plan 快照区分，复杂度上升）；显式 `disabled: false` 的自文档价值成立。**P2.3 后有真实需求再立项**。
>
> ### 📌 叠加 4.2 — P2 各阶段状态表
>
> | 阶段 | 内容 | 状态 |
> |---|---|---|
> | P2.0① | `parseRootRows` 缩进修复 | ✅ 完成（`193bdd8`，L-026） |
> | P2.0② | 写路由 guard 升级（CSRF + 配对服务、禁 fallback） | ✅ 完成（`2b05777`） |
> | P2.1 | 两段式写框架（plan → 确认 → execute、SHA 冲突、备份 + 保留策略） | ✅ 完成（`a27da81`，L-028） |
> | **P2.2** | **启停开关**（锚点唯一、交叉引用检查、双层开关分立） | **✅ 已关账**（2026-09-18 12:48；L-029 / L-030 / L-035 / L-036） |
> | P2.3 | 配置编辑（白名单 + 范围/枚举校验 + 服务端校验） | ⏳ **下一阶段**。**前置（用户点名）**：须先出「`config.enabled` 五插件消费点」证据（证明写哪儿会被真读），**证毕再写**；`compact-router` 与 `toolkit-manager` 无 `config.enabled` 消费点，已预判缺席（见 §三 叠加 3.1） |
> | P2.4 | doctor 操作台 + 两套回滚 | ⏳ 待办 |
>
> ### 📌 叠加 4.3 — P2.2 待验收三项（reload 后目视）
>
> 1. 5 张卡里 **4 张有启停开关**、`compact-router` **无**（口径见 §三 叠加 3.1）。
> 2. **双层开关分立**呈现（不合并）。
> 3. 确认页含「**下次重启生效**」人话提示 + `disabled` 字段解释。
>
> 另见 §七 叠加 7.1（完整 reload 目视清单）。
> **状态（2026-09-18）**：U1 用户已完成 reload + 目视，三项**均通过**（记入 叠加 4.5）。
>
> ### 📌 叠加 4.7 — 「黄警告恢复指引」文案优化（第 11 轮 ⑤）
>
> 黄警告（`⚠ 两层开关不一致，所以现在没生效` / `⚠ 在配置文件中被停用`）**原本已有恢复指引**，本轮按裁决**优化**为显式点明**责任边界**：
> - 双层不一致态 → 补「本面板只负责第一层（加载与否），第二层是插件自己的配置，面板暂不修改 —— **P2.3 配置编辑**上线后可在此直接改。」
> - 配置层停用态 → 补「本卡的启停开关改的就是这一层 —— 直接把开关打开即可恢复。」
>
> 两套渲染器（`client/index.js` 的 `DualSwitchNotice` + `panel.html` 的 `dualSwitchNotice`）**同步**；断言 `p22-cards-ui` **79/79**（+8 条恢复指引断言，含 react 侧函数组件下钻取文本）。
> **生效方式：`待 P2.3 前合并 reload`** —— 本轮**不单独**要求用户重启；与 P2.3 的 UI 改动**攒批合并**一次 reload 生效。
>
> ### 📌 叠加 4.4 — 安全模型（全 P2 阶段适用，原文 §三 只说“安全链”，此处补机制清单）
>
> 两段式 · SHA 冲突检测 · 锚点唯一 · 值白名单 · 写路由 CSRF + 配对服务校验（**禁 fallback**）· 写前备份 ·
> 保留策略（**最新 20 份 OR 30 天，另加 `maxTotal=40` 绝对上限**）· plugin-manager 并发防线（**快照现读不缓存**）。
> 写守卫判据（`panel/index.js`）：`guard(handler, options)` @ `:200`，`isWrite = options.change === true` @ `:201`；
> 写路径 `isAllowedWrite` @ `:191`（**禁 fallback**）与只读路径 `isAllowedRead` @ `:180`（允许 `devicesFile` hasOwn 兜底）+ **双轨**。

---

## 五、P2 阶段表（权威版，源自用户侧，已入 handoff 11.7）

- 见 handoff-restart.md 11.7 节。约束全项适用：两段式、SHA 冲突检测、锚点唯一、值白名单、CSRF+配对服务校验、写前备份、plugin-manager 并发防线（快照现读不缓存——PM 与我们写同一个文件）。

> 📌 **叠加 5.1** — 11.7 是 P2 的**唯一权威范围定义**（冲突优先级见文首）。本文件 §四 叠加 4.2 是 11.7 的**状态投影**（阶段内容一字不改，只更新状态列）。
> 📌 **叠加 5.2** — **P2.0①/②、P2.1、P2.2 均已落库**；P2.2 具体待验收项见 §四 叠加 4.3 与 §七 叠加 7.1。

---

## 六、项目铁律（违反即事故，历史已验证）

- 源码转述≠事实：三次被实测推翻（gate 覆盖、Host 判据、api/gate 死监听器）。验证问题只许二选一作答（引用代码行 / 明确无分支），禁止开放描述。
- 安全关键脚本改动必须 diff 留痕 + 全流程重验（restart-trigger 的教训：改动无痕导致三周后 runtime 炸雷）。
- 重启/写盘前必须用户授权；异常带证据回报，不在线上调试；回滚先于排查。
- 写前备份（.panel-backups/<name>-<stamp>/ + manifest + SHA）；备份必须语义化命名（同名覆盖曾造成假警报）。
- 不碰：C:\Users\LENOVO\.dsh（除按既定程序读 devices.json）、cloudflared 进程（用户唯一远程命脉，禁止试杀）、5 个子插件的源码目录。
- 验收标准以用户体感为准：不读任何说明能说出每个插件干嘛的、开没开着；标识符英文原名+中文注释。
- 每阶段验证 = p1-smoke + 该阶段专项（如 p21-verify）+ doctor dry-run 0/0/0 + pluggable-lint。

> 📌 **叠加 6.1 — 红线**：上条「不碰」即**项目红线**（三处：`~/.dsh`、cloudflared 进程、五子插件源码目录）。**红线外读无需求授权** —— 例：`AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\…` 属 **DSH 安装目录**，**不在红线内**（Q2 尾① 补扫即以此为依据，上轮曾把授权收得过窄）。红线**已由用户历轮指令 + 本行成文化**，供后续引用。
> 📌 **叠加 6.2** — 本文件即「新会话第一件事」的入口，**九大节原文 + 本侧叠加**合于一文，避免读者在多份文档间反复跳转。
> 📌 **叠加 6.3** — 本轮新增一条**环境坑（第二次固化）**：`node -e` 里的正则转义会被 Git Bash（MSYS 路径转换）吃掉（`[\s\S]`→`[/s/S]`，报 `Invalid regular expression flags`）⇒ **含反斜杠转义的探针一律落成真实 `.mjs` 文件再跑**。另：本环境 **bash 的 `ls/find/cat/tail/head/wc/dirname` 不可用**（只剩 `git`/`node`）；PowerShell stdout 不回传；会话 `<current_time>` 可能是旧值（**以 `new Date()` 实测为准**）。

---

## 七、运维手册（用户是远程手机访问 + 偶尔在电脑前）

- 重启 DSH：用户在电脑 PowerShell 跑 restart-trigger.ps1（或双击桌面“启动 DSH”快捷方式）；远程场景用一次性计划任务（-RunLevel Limited，New-ScheduledTaskTrigger 保留秒级，schtasks /ST 会截断秒——教训在案）。AI 永远不自行重启（AI 的进程树长在 DSH 上，自杀）。
- 杀进程：一律 .NET Process.Kill()（leaves-first + 端口释放为唯一闸门 + Start-Process 前再断言防 TOCTOU），禁 taskkill /F（需 QUERY_INFORMATION 权限，历史被拒过；access mask 分布不恒定，不可依赖）。技能沉淀：win-process-termination。
- 用户设备：手机已配对浏览器（deviceId 尾号 b6fd）；电脑浏览器开 127.0.0.1:3080。
- 机器重启后 DSH 不自启（用户明确决策）：需人工双击桌面快捷方式。
- reload 节奏：client 可见阶段完成后报用户按一次按钮；纯服务端改动可攒着合并 reload。

> ### 📌 叠加 7.1 — reload 目视清单（逐字文案，用户本轮点名）
>
> 依据：用户截图观察到「开关旁有『两层，改第一层』类说明」，询问是否设计内。**答复：是设计内，且两套渲染器逐字一致**（`panel/client/index.js` / `panel/client/panel.html`）。
>
> | # | 位置 | 逐字文案 | 出处 |
> |---|---|---|---|
> | C1 | 开关标题行 | `启停开关（两层分开，改的是第一层）` | `index.js:390` / `panel.html:245` |
> | C2 | 开关按钮（停用态） | `停用（改第一层）` | `index.js:414` / `panel.html:258` |
> | C3 | 双层不一致告警 | `⚠ 两层开关不一致，所以现在没生效` | `index.js:210` / `panel.html:178` |
> | C4 | 确认页生效时机（停用方向） | `执行后此插件将于下次重启时停用（当前仍运行）。` | 确认页 |
> | C5 | 确认页生效时机（启用方向） | `执行后此插件将于下次重启时启用（当前未加载的不会立刻加载）。` | 确认页 |
> | C6 | 条件开关（`!!js`）层 1 标签 | `条件开关（面板不解释）` | 层 1 状态行 |
>
> - **C1/C2 的准确含义**：`enabled` 的**层 1 = patch 行 `disabled`**（配置文件，决定**有没有被加载**）；**层 2 = 插件自身 `config.enabled`**（插件内部，决定**加载了但功能开不开**）。**面板只改层 1**，故必须写明，避免用户误以为改的是插件内部。
> - **C3 用词是「两层开关」，不是「两层数据」**（用户 Q7 提问项，已逐字核对两个渲染器一致）。
>
> **逐项打勾（reload 后）**：
> - [ ] 卡片标题为**英文原名**，中文在第二行副标题
> - [ ] 5 张卡：4 张有启停开关，`compact-router` 无开关
> - [ ] 双层状态**分立两行**呈现（不合并成一个开关值）
> - [ ] `rate-throttle` 呈现**黄色**「已加载 · 功能开关关闭，暂不生效」（两层取值相反 —— **这是设计内展示，不是故障**）
> - [ ] 开关标题行含 **C1** 文案、按钮含 **C2** 文案
> - [ ] 点击开关进入**确认页**，含目标文件 / 行号 / diff / **C4 或 C5 生效提示** / `disabled` 解释
> - [ ] 页头元信息行显示 `toolkit-manager`（不是卡片）
> - [ ] doctor 区显示「没有发现任何问题」（与服务端 0/0/0 一致）
>
> ### 📌 叠加 7.2 — 回滚保险（**实测的陷阱，务必先读**）
>
> > ⛔ **`git checkout -- cordis.patch.yml` / `git restore cordis.patch.yml` 一旦执行：**
> > 回退到 HEAD blob（**2914 B、LF、不含 toolkit-manager 行**）⇒ **删掉 4 行 → `toolkit-manager` 入口消失 → 面板失联**，
> > **且行尾从 CRLF 变 LF**（双重副作用）。**回滚此文件必须走备份恢复路径，不得用 git 检出。**
>
> **实测证据**：`.panel-backups/pre-p2-toolkit-manager-20260917-.../cordis.patch.yml` 与 `HEAD:cordis.patch.yml`
> **sha256 完全相同**（`7541c05a…`）且**不含**该行；它 manifest 自称 *"Pre-P2 toolkit-manager row (git HEAD) backup with SHA for rollback"*
> ⇒ **它是「P2 之前」的回滚目标，不是「保留面板」的目标。**
>
> **通用教训：回滚快照必须按「目标语义」选，不能按「名字听起来像回滚」选。**

---

## 八、关键历史教训索引（详情在 ledger/api-notes）

- 三次源码转述被推翻（P0/P1.5 期）；gate 不罩插件 exact 路由、api/gate 是死监听器（dsh-client-modules 源码注释实锤）；/ST 截断秒导致提前触发；taskkill 三连败（管道 bug → conhost Access Denied → 0x0401 掩码）；备份同名覆盖假警报；initialBundleSnapshot 冻结层；$Pid 只读变量、UTF-8 被 PS5.1 按 GBK 解析；保留策略 OR 语义陷阱；锚点下插进 config 子树。

> 📌 **叠加 8.1 — 转述链清单（判定侧登记，本文件为落点）**
>
> | 例 | 命题 | 状态 | 处置 |
> |---|---|---|---|
> | 一 | gate 覆盖插件 exact 路由 | 已推翻（源码实锤） | 口径已改 |
> | 二 | Host 判据（loopback 直接过） | 已推翻（漏 `isLoopbackClient` 第二条件） | 见 `handoff-restart.md:18` |
> | 三 | `api/gate` 是活跃监听器 | 已推翻（实为死监听器） | 见 `api-notes.md` |
> | **四** | **「四层 patch 栈」** | **转述失真候选**（正本查无实据） | **原文保留 + 加批注（见 §三 批注 3.2）**，实测结论由 loader 源码定案 |
>
> **第四例的方法论意义**：判定侧**引用未落盘文档**同样构成转述链的一环 ⇒ **穷尽性不得以任何一侧的层定义为准，必须以源码为准**。
>
> **📌 第 14 轮改判（第四例）**：改判为「**内容为真、出处未落盘**」—— 四层内容与 loader 源码**一致**，问题仅在**引用无落盘出处**；**非内容失真**。方法论意义相应修正为归档口径：**「事实必须落盘出处，否则与失真不可分辨」** —— 台账上**出处缺失**与**内容失真**分立两类、处置不同（前者**补出处**，后者**改口径**）。四层表述以 §三 批注 3.2 全表为准。

---

## 九、与用户的沟通约定

- 用户是中文小白用户：一切交付以“不解释能看懂”为标准；工程黑话出现在 UI 即 bug。
- 用户一句话可推翻技术决定（如“不自启”“名字改回来”），照办并记录，不劝阻第二次。
- 每阶段验收让用户做“体感测试”（点开关、看卡片），不做抽象汇报。
- 判定者（外部评审 AI）每轮验收，执行 AI 交证据；用户在两者间搬运消息。

> 📌 **叠加 9.1** — 面向判定者的交付约定（本侧补充）：每轮**逐条给据**（文件 + 行号）、**缺口如实申报不掩饰**、**存疑加批注不悄悄改写**、**证据可重放**（脚本 + 输出存档）；判定侧的裁定同样入档（如本轮「穷尽标准修正」）。

---

## 附录 A：运行配置的 M 项（`toolkit-manager` 4 行）—— Q6 溯源 / 处置 / 回滚保险

（原骨架版 §9 全文，**内容不变**）

### A.1 确切内容（diff 全文）

`git diff` 的全部内容就是这 4 个 `+` 行（追加在文件末尾）：

```diff
+
+- insert:
+    - id: toolkit-manager
+      name: 'file:///D:/dsh-plugins/dsh-toolkit/panel/index.js'
```

**字节账完全闭合**（`q2-layer-scan.mjs` 断言）：磁盘 `3097` = `git HEAD` blob `2914`（git 库内存 LF）+ 追加块 `101` + CRLF 增量 `82`。
⇒ **磁盘 = HEAD + 这 4 行，逐字节可复现 ⇒「除这 4 行外零漂移」是硬结论，不是估计。**

> **📌 第 11 轮（`22fde85`）后更新**：上式写于「该 4 行**尚未提交**」之时。该 4 行现已**语义化提交**（`22fde85`），故 **`git HEAD` blob 前移至 `3015 B`（LF）**，字节账改写为 **`3015 + CRLF 增量 82 = 3097`**（`q2-layer-scan` 修订版断言，实测通过）。
> **结论不变**：**磁盘（LF 归一）与 HEAD 逐字节一致 ⇒ 除行尾风格外零漂移**；且 §5 断言的「HEAD + 4 行 = 磁盘」在提交前后**同真**（提交只是把该 4 行从「工作区追加块」搬进了 HEAD）。

### A.2 写入者与写入时机（如实说明，含一处**溯源缺口**）

| 项 | 结论 |
|---|---|
| **git 侧** | 该字符串**从未进入该文件的 git 历史**（pickaxe `-S toolkit-manager -- cordis.patch.yml` **无命中**）。该文件在 git 里只有 2 次提交（`e50bb00` 总装、`37819e9` Sogou 修正），HEAD blob **2914 B、完全不含该行** |
| **可归因的最早证据** | `.panel-backups/arm-manifest-20260917-105930/cordis.patch.yml`（**3072 B**）**已含该行**，name 为旧名 `@local/dsh-toolkit/panel` ⇒ 该行在 **2026-09-17 10:59:30 之前**已在磁盘 |
| **19:55:50 改写** | 由 P2 实施改为 path-like `file:///…/panel/index.js`（依据 `api-notes.md:132-137`：path-like 才能让 `locatePkgJson` 走 `nearestPackage` 命中 `panel/package.json`）。记载于 `ledger.md:65` 与逐版对账表 `ledger.md:72` |
| ⚠️ **溯源缺口** | **该行的「首次落盘」时刻与操作者未留档** —— 无 git 记录、无备份捕住创建瞬间。此前 ledger 只记了「**行名改写**」，未记「**行首次落盘**」。**据实申报** |

### A.3 「既有约定」的正本出处（**出处存在，非口说无凭**）

| 出处 | 原文/内容 |
|---|---|
| `panel/docs/ledger.md:214` | 「…`cordis.patch.yml` 的 4 行改动**未提交**（属运行配置，按 11 节程序在重启验收后单独处置）。」 |
| `panel/docs/ledger.md:55-65` | L-023-① 结论 2：对 live 与 10:59 arm-manifest 基线的逐版对账（含该行改名 diff） |
| `panel/docs/handoff-restart.md:118-122` | §11 回滚程序（该 4 行的语义来源） |

### A.4 处置意见：**重启验收通过后语义化提交**（同意用户方向）

**理由**：磁盘是运行真相；**提交只改 `.git`、不动磁盘字节** ⇒ `ce0b0b81…` 对账不受影响；**提交后 HEAD 与磁盘一致，回滚才有「保留面板」的语义目标**（见 §七 叠加 7.2）。

**唯一可能的「不提交」理由**：该文件属运行配置、含环境相关路径（`D:/dsh-plugins/…`、`C:\Users\LENOVO\.agent-memory`），入版本库会降低可移植性。
**但这是既成事实 —— 文件本身早已入库，只是缺这 4 行** ⇒ **不构成不提交的理由。结论：提交。**

### A.5 正确回滚路径

**要保留面板时的正确回滚路径**（按目标语义选**含该行**的快照）：

| 想回到 | 快照 | size | 该行的 name |
|---|---|---|---|
| 已挂面板但未改 path-like（旧名） | `.panel-backups/arm-manifest-20260917-105930/` | 3072 | `@local/dsh-toolkit/panel` |
| 同上 + rate-throttle 处于 disabled 临时态 | `.panel-backups/pre-restore-disabled-20260917-114750/` | 3094 | `@local/dsh-toolkit/panel` |
| path-like 时代 | `.panel-backups/p21-evidence-…/`（3113）· `p22-evidence-…/`（3120） | — | `file:///D:/…/panel/index.js` |

**终验 SHA 对账基准 = 磁盘当前值（含 4 行）**：`ce0b0b81c91ca4c420bb5302b2dbe951de0347ca729122511be288aa7c2b76b9`（**3097 B、CRLF**）。

---

## 附录 B：待用户项

| # | 事项 | 状态 / 口径（2026-09-18 13:07 第 12 轮补验收时点） |
|---|---|---|
| U1 | **reload 一次** → 按 §七 叠加 7.1 清单目视（含 C1/C2/C3 + 确认页两句 + rate-throttle 黄卡文案） | **✅ 已完成** —— 用户侧终验全绿（停用 ✓ / 复原 ✓ / 互不牵连 ✓），记入 叠加 4.5 |
| U2 | **真实终验** → 通过时一并处置 附录 A 的 `M cordis.patch.yml`（语义化提交） | **✅ 已完成** —— 第 10 轮 a–e 取证暴露 (c)(d) 不达标 ⇒ 按第 11 轮裁决**授权恢复**至基准 + **语义化提交** `22fde85`（内容纯净：仅 4 行） |
| U3 | ~~Q2 四层 patch 栈扫描（涉 `~/.dsh` 需先授权）~~ | **✅ 已闭环**（①②③④ 结论见 §三 叠加 3.3；`q2-layer-scan` **14/14**，第 11 轮按「行已提交」新现实修订）。**📌 第 14 轮改判**：其引用的「四层栈」命题改判为**内容为真、出处未落盘**（见 批注 3.2 改判块）；**第 14 轮乙程序首批扫描**已将红线内 #0/#2/#3/E1 全部落结论（`evidence/Q2-RELEASED-SCAN.txt`），**Q2 全表穷尽 ✓** |
| U4 | ~~3 个 shipped preset 补扫~~ | **✅ 已闭环**（21/21 PASS，正文见 §三 叠加 3.3 与 `api-notes.md` §「Q2 尾① 结论正文」） |
| U5 | ~~总文档全文合并落盘~~ | **✅ 已闭环**（合并版 + 保真抽检 38/38；3 项排版归一枚举见 `evidence/MASTER-MERGE-NORMALIZATION.txt`） |
| U6 | 「compact-memory」串读确认（口径已定为串读，见 §三 叠加 3.1） | **✅ 已销项**（第 12 轮裁决：用户第 5/6 轮已确认 5 卡齐全、`compact-memory` 为串读，在案） |
| U7 | `doctor/dry-run` 的 `{ change: true }` 属**有意过度收口**，建议保留（专节见 `api-notes.md`） | **✅ 已销项**（第 12 轮裁决：判定者第 5 轮已认可 + `api-notes`「勿当 bug 修正」已落实） |
| U8 | **注入点 3（`$DSH_HOME/cordis.patch.yml`）未覆盖**：落在红线内，优先级**高于 profile 层**，理论上可携带 toolkit 任意 id 行 ⇒ 若求穷尽需**单次授权**补扫 | **✅ 已闭环**（第 14 轮：**U8+同族一次性只读授权** → 乙程序首批扫描：#3 **文件不存在** · #0 = `[]` · #2 = `[]` · E1 `.env` **文件不存在** · #5 env `undefined` ⇒ 注入点 5 无效 —— 结论 `evidence/Q2-RELEASED-SCAN.txt`；**Q2 全表穷尽 ✓**） |
| U9 | `preset-patch-state.json` 的 `liangshen.patchedSha` **已陈旧**（内容正确、hash 漂移 ⇒ 改写后被后续改动过）。**不构成功能问题** | **✅ 已批准**（第 13 轮判定侧：**随下个写盘批次刷新 marker**，语义化留痕，不需用户单独表态） |
| U10 | **黄警告恢复指引文案优化**（第 11 轮 ⑤，见 叠加 4.7） | **已实现 + 断言 79/79**；**生效方式 = 待 P2.3 前合并 reload**（本轮不单独重启） |
| U11 | 「删键能力」= 暂缓否决（见 叠加 4.6） | 已记录，**P2.3 后有真实需求再立项** |
| U12 | **授权语义澄清（第 12 轮新增）**：「一次性授权」**以该次任务为限**；此后凡涉 `~/.dsh` 读取**须新授权**，或由用户批准将该路径纳入「**既定只读程序**」清单（类比 `devices.json`） | **✅ 用户已裁决 = 乙**（第 14 轮：**窄版既定只读程序** —— 注入点全表内 `~/.dsh` 路径、**只读**、**层间覆盖检查用途**；此后该范围内读取**不再逐次授权**。首批例行读取已执行，见 U8。正文 `handoff-restart.md` §11.14） |
| U13 | **乙程序只读清单扩充（第 15 轮新增，待用户定）**：① **追认**——`~/.dsh/dsh-rate-throttle.json` 曾在授权段外被手工只读一次（越界申报，见 L-041）；② **纳入**——`~/.dsh/dsh-search-router.json` + `~/.dsh/dsh-rate-throttle.json` 两热 JSON 入乙程序**只读**清单（用途 = 层间覆盖检查 / P2.3 遮蔽呈现）；③ `~/.dsh/settings.yaml` **不纳入**（web-search-local 走 settings 服务 API） | **待用户定**（正文 `p23-design.md` §四） |

> 📌 **第 12 轮销项说明（U6 / U7）**：两项**同日销项**，依据为判定侧第 12 轮裁决（原话见 `ledger.md` L-037）。**销项 = 已获认可、不再挂账**，非口径变更。
> 📌 **补验收呈报（第 12 轮）**：催收三项的**正文摘要**已落 `evidence/ROUND12-SUPPLEMENTARY-ACCEPTANCE.md`（摘要 A = `api-notes` 两新节 / 摘要 B = 本表 / 摘要 C = 3 项归一枚举 + 「全文 diff 不可构造」如实说明），**交判定者补验收**；**关账已被接受，本呈报不改结论**。

---

## 附录 C：变更记录

| 时刻（GMT+8） | 变更 |
|---|---|
| 2026-09-18 14:08 | **第 15 轮呈报版**（判定侧认可四项 + 授权段执行 + 设计稿）。① **叠加 4.1 进度行更新**：P2.3 设计稿已呈验收，批准前不动代码。② 新增 `panel/docs/p23-design.md`（范围收敛 / 白名单逐字段表 / **mode 三选一推荐方案 2** / 遮蔽呈现 + U13 授权口径 / 确认页人话分述 / 安全链沿用 / 测试计划）。③ 新增 `scripts/p23-shadow-scan.mjs` + `evidence/P23-SHADOW-SCAN.txt`（**T1 热 JSON 现有 mode 键 ⇒ patch 编辑无效**；T2 settings 无 web-search-local 节；T3/T4 env 空）。④ **附录 B 新增 U13**（越界追认 + 两热 JSON 纳入乙程序只读清单；settings.yaml 不纳入）。⑤ **越界申报**：`dsh-rate-throttle.json` 授权段外手工只读一次（L-041）。**本轮零磁盘动作**。 |
| 2026-09-18 13:42 | **第 14 轮 · 裁决落账版**。① **U12 = 乙**（用户裁决：窄版既定只读程序，正式生效）· **U8 已闭环**（授权 → 乙程序首批扫描，**Q2 全表穷尽 ✓**）· **U9 已批准**（随首个写盘批次刷新 marker）。② **改判落档**：「四层栈」判例 → **「内容为真、出处未落盘」**（批注 3.2 加改判块 / §八 8.1 加改判注 / 附录 B U3 加注 / `api-notes` §③.3 加改判注）；**归档口径（新）=「事实必须落盘出处，否则与失真不可分辨」**。③ 新增脚本 `scripts/q2-released-scan.mjs`（乙程序首批例行只读读取，可重放）+ 证据 `evidence/Q2-RELEASED-SCAN.txt`（#0 = `[]` / #2 = `[]` / #3 文件不存在 / E1 文件不存在 / #5 env `undefined` ⇒ 注入点 5 无效；#4 不适用已注）。④ **可选项关闭**：「重发原文做全文 diff」随盲抽 8/8 闭环而关闭。⑤ **P2.3 放行**（前置 ①②③④ 全齐）；**第一动作 = `config.enabled` 五插件源码消费点证据**。 |
| 2026-09-18 13:25 | **第 13 轮 · 补登记版**（补验收判定：第 12 轮摘要 A 尾①/设计语义/摘要 B/C 全部 ✓；**本轮不改任何结论**）。① **附录 B：U9 已批准**（随下个写盘批次刷新 marker）· **U12 补记判定者推荐乙**（窄版既定只读程序，仍待用户定）。② 新增证据 `evidence/ROUND13-SUPPLEMENTARY-2.md`（**尾②注入点全表**（含「已扫与否/未扫原因」两列，**补登同族缺口 #0/#2/E1**，随 U8 一并补扫可闭合）+ **U1–U5 逐行补呈** + 盲抽结果）与 `evidence/MASTER-BLIND-PROBE-8.txt`（**判定侧盲抽 8 句 8/8 逐字命中**，脚本 `scripts/master-blind-probe.mjs` 可重放）。③ `handoff-restart.md` §11.14 补记判定者推荐。④ `ledger.md` 新增 **L-038**。**本轮零磁盘动作**。 |
| 2026-09-18 13:07 | **第 12 轮 · 补验收呈报版**（关账已被判定侧接受，**本轮不改任何结论**）。① 头部时间戳刷新。② **附录 B：U6 / U7 销项**（判定侧第 12 轮裁决）+ **新增 U12 授权语义澄清**（待用户定）+ 顶部加两条 `📌` 说明（销项依据 / 补验收呈报）。③ 新增证据正本 `evidence/ROUND12-SUPPLEMENTARY-ACCEPTANCE.md`（催收三项正文摘要 + U8/U9 呈报 + U12 呈报）。④ `handoff-restart.md` 新增 **§11.14 授权语义澄清**。⑤ `ledger.md` 新增 **L-037**。**本轮零磁盘动作**（未改 `cordis.patch.yml`、未重启、`lib/` 与 `panel/*.js` 零改动）。 |
| 2026-09-18 12:48 | **P2.2 关账版**。① 头部时间戳刷新（本文档 = 关账版；九大节原文**未改动**）。② **§四 叠加 4.1 常驻进度行 → 已关账**（含关账依据：功能层全绿 + 字节层授权恢复达成基准）。③ 新增 **叠加 4.5 关账记录**（a–e 逐项结果 / 恢复过程 / 恢复后 5 卡基准态 + doctor / 提交 / 回归）。④ 新增 **叠加 4.6 暂缓 · 明确不做**（删键能力暂缓否决 + 原有不做项）。⑤ 新增 **叠加 4.7 黄警告恢复指引文案优化**（标注**待 P2.3 前合并 reload**）。⑥ 新增 **§三 批注 3.4 启停开关设计语义定案**（启用 = 写显式 `disabled: false`，不删键）。⑦ **附录 B 重写为 U1–U11 口径**（U1/U2 完结；新增 U10 文案优化、U11 删键暂缓）。⑧ `q2-layer-scan` §4 断言按「行已提交」新现实修订（**计数不变**：`--agent-presets` 20/20 / 默认 14/14）。⑨ **api-notes.md** 新增「P2.2 设计语义定案」与「Q2 尾① 结论正文」两节。⑩ 新证据 `TERMINAL-ACCEPTANCE-ROUND10.txt` / `D01-MANIFEST-FIX.diff` / `MASTER-MERGE-NORMALIZATION.txt`。⑪ **`handoff-restart.md` §12 会话交接卡（10 行）**。⑫ **关账包整包提交 `c51ae58`**（10 文件，+303/−49）；同批**本侧自查订正**：`q2-layer-scan` 计数口径（`--agent-presets` 20/20 / 默认 14/14）、`p22b-retention-scope` 15→17。 |
| 2026-09-18 10:46 | **总文档全文（九大节）合并落盘**：一~九 采用用户原文**严格保真**（**不发明任何强调** —— 原文以纯文本送达，加粗/反引号在传输中已剥离，本侧不补发；仅三处排版归一见文首保真说明）；原文头部两行在文首引用块**逐字保留**；本侧叠加与批注全部为 **`📌` 块**并**不改原文**。新增 **§三 叠加 3.1 卡片口径（含 `toolkit-manager` 行号 80–82 补全）**、**批注 3.2「四层栈」＝转述失真候选（第四例）+ loader 源码定案**、**叠加 3.3 Q2 ①~④ 与 shipped presets 补扫**；**§四 叠加 4.1~4.4**；**§七 叠加 7.1 目视清单 / 7.2 回滚保险**；**§八 叠加 8.1 转述链清单**；原骨架版 §8/§9 并入 §三 批注 3.2 与 **附录 A**。**保真抽检脚本** `scripts/master-merge-fidelity.mjs` + 证据 `MASTER-MERGE-FIDELITY.txt`。 |
| 2026-09-18 10:22 | Q2 两尾闭合 + loader 源码定案 + 转述失真第四例 + **总文档合并受阻申报**（全文曾入会话但压缩后不可取回 ⇒ 拒绝凭记忆重建，请用户重发）；新增证据 `Q2-SHIPPED-PRESET-SCAN.txt` / `Q2-SHIPPED-PRESET-DIFF.txt`。 |
| 2026-09-18 09:14 | 新增 §8 四层 patch 栈、§9 运行配置 M 项（Q6 溯源 / 处置 / 回滚保险）；标注「骨架版」。 |
| 2026-09-18 08:53 | **本文件初次建立**（此前磁盘不存在）。按用户点名三要素（头部时间戳 + 5 行/5 卡口径 + 常驻进度行）新建。 |
