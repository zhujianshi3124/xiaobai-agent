# HANDOFF-MASTER —— dsh-toolkit 面板 · 总交接正本

> **头部时间戳（每次更新必须刷新）**：**2026-09-18 08:53（GMT+8）**
> 上一版：**2026-09-18 08:53 初次建立**（本文件此前**不存在**，本轮新建 —— 见 §8）
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

> **当前进度：P2.2 已落库，待用户 reload 后目视验收。**
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
| U1 | **reload 后目视确认 P2.2**（按 §7 清单） | 待用户 |
| U2 | **Q2 四层 patch 栈扫描** —— 涉及 `~/.dsh`，**需用户先给只读授权** | 待授权 |
| U3 | **「compact-memory」串读**确认（口径已按 §3.3 定为串读） | 待用户确认 |
| U4 | 用户所指「总文档」是否即本文件（本文件此前不存在，本轮新建） | 待用户确认 |

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

## 8. 变更记录

| 时刻（GMT+8） | 变更 |
|---|---|
| 2026-09-18 08:53 | **本文件初次建立**（此前不存在）。原因：用户 Q3 连续两轮点名 `HANDOFF-MASTER.md`，要求含「头部时间戳 + §3 5 行/5 卡口径 + §4 进度行」；磁盘上无同名文件（穷尽查找：正本仓 + 沙箱均 0 命中），故**按用户点名的三要素新建**，并把用户可见文案口径（§7）一并纳入。**若用户所指另有其文，请指出，即刻迁移。** |
