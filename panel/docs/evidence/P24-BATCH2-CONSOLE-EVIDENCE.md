# P2.4 批 2 · doctor 操作台＋双回滚 —— 先证后写证据批（呈判定侧验收）

> 时刻：2026-09-19 09:0x GMT+8　｜　台账：**L-062**（真卸载上架落账）/ **L-063**（本证据批）
> 性质：**纯只读取证，零代码**。本轮未改任何源码、未触发任何 doctor 写路径、真实 `cordis.patch.yml` 零触碰。
> 流程定位：**证据批 → 判定验收 → 设计稿 → 用户批准 → 施工**（判定侧 2026-09-19 指令原文）。
> 取证对象：doctor 仓 `D:/dsh-test-sandbox/projects/doctor/src/{cli,engine,executor}.mjs`（行号均为当前 HEAD 文件行号）＋ 面板仓 `panel/index.js` / `panel/client/index.js` ＋ 真实仓运行期落痕。
> 基线：doctor 真实仓 dry-run **0/0/0**（2026-09-19 08:49 复核）；真实 patch `ce0b0b81…`（3097 B）。

---

## ① doctor 可执行操作全集（每项 fix 的源码依据／影响面／回滚路径）

### 1.1 CLI 面（`cli.mjs`）

| 入口 | 行为 | 源码依据 |
|---|---|---|
| 默认（dry-run） | 只读体检，发现问题 exit 1 | `cli.mjs:161-166` |
| `--apply [--yes]` | 逐 issue 交互确认后执行 fix plan → 写前备份 → 复检（rescan） | `cli.mjs:169-213` |
| `--rollback [--to <stamp>]` | 按 `doctor-patch-state.json` 回滚（默认最后一条，`--to` 指定） | `cli.mjs:152-158` |
| 退出码 | 0=绿/归零 · 1=dry-run 有问题 · 2=apply 后残留或 step 失败 · 3=root 非法 · 130=用户取消 | `cli.mjs:10-11` |
| 非交互终端 | 无 TTY 时 `--apply` **拒绝执行**（须交互确认；`--yes` 仅供测试） | `cli.mjs:117-120` |

### 1.2 算子全集（`executor.mjs:7-8`）

文件算子 `replace` / `insert` / `delete` / `create-file`，外加 `install-package`。逐项：

| 算子 | 行为 | 源码依据 | 影响面 | 回滚路径 |
|---|---|---|---|---|
| `replace` | 锚点**精确计数重验**（出现次数 < occurrence 即 `ANCHOR_DRIFT` 失败）→ 备份 → 原位替换 | 锚点重验 `executor.mjs:461-469`；计数 `:60-71`；替换 `:483-486` | 单文件内一段文本 | `doctor-backups/<stamp>/` 写前备份（`:480`；sha 记录 `:505-506`） |
| `insert` | 锚点行行尾后插入 | `:486-495` | 单文件加一行 | 同上 |
| `delete` | 删除锚点文本；**`new` 必须为 null**（否则 `PLAN_NEW_INVALID`） | `:496-497`；校验 `:471-478` | 单文件减一段 | 同上 |
| `create-file` | 新建文件；**目标已存在即拒绝**（`CREATE_FILE_TARGET_EXISTS`） | `:424-437` | 新文件 | 无需备份（原本不存在）；回滚=删除该文件（见 §2.3 注） |
| `install-package` | **零网络**安装：仅接受 `file:` 本地源或 `installSources` 注入；版本范围校验；包名一致性校验；`node_modules` 为 symlink/junction **拒绝**；目标已存在**拒绝**；复制失败自清理 | 源解析 `:334-345, :367-375`；版本 `:388-391`；symlink `:354-366`；已存在 `:392-394`；自清理 `:398-403` | `<root>/node_modules/<pkg>` | 记入 `state.installedPackages`（`:247-249, :276-282`）；回滚=整目录 `rmSync`（`:576-598`） |

### 1.3 全量安全链（平台行为证据，先于任何写入）

| 闸 | 源码依据 | 语义 |
|---|---|---|
| apply 锁 | `executor.mjs:130-143` | `configRoot/doctor-apply.lock` 独占创建（`wx`），并发实例 `LOCK_BUSY` |
| plan 校验 | `:81-117` | op 白名单；root 必须在 `environment.roots`；file 相对路径、禁绝对、禁逃逸 root |
| **protected 硬断言** | `:44-52, :208-226` | 写目标落入 `node_modules`（除 install-package）/.git/`doctor-backups`/`preset-backups` 或任何 `*.bak-*` 路径段 ⇒ **整轮失败、零写入**（`PROTECTED_TARGET`）；rollback 目标同样受检（`:547-549, :588-590`） |
| 逐 issue 确认 | `cli.mjs:115-124`；`executor.mjs:193-198` | 任一 issue 取消 ⇒ 整轮取消、零写入（exit 130） |
| 写前必备份 | `:171-180, :480` | 所有文件算子写前备份到 `doctor-backups/<stamp>/`，originalSha/patchedSha 双记录 |
| 状态原子写 | `:36-42` | `doctor-patch-state.json` tmp+rename 原子落盘 |

### 1.4 引擎当前发出的问题全集（17 id ＋ mount 5 id；fix 类别逐条）

**可执行（`fixable=rewrite`，当前仅 2 类）**：

| id | 类别/严重度 | plan | 源码依据 | 影响面 | 回滚路径 |
|---|---|---|---|---|---|
| `ref.unresolvable-local`（别名变体） | reference/error | `[replace old→new]`（单文件、occurrence 精确） | `engine.mjs:569-592` | 引用了已收编旧注册名的文件（如插件源码内 `@local/` 引用） | `doctor-backups/<stamp>/` |
| `pkg.missing-dependency` | package/error | `[install-package]` | `engine.mjs:930-954` | `<root>/node_modules/<pkg>`（仅本地 `file:` 源） | 回滚=移除安装目录（`:576-598`） |

**manual（建议面，plan=[]，不可一键，共 20 类）**：

| id | 严重度 | 源码依据 | 建议要点 |
|---|---|---|---|
| `schema.alias-target-unresolvable` | error | `:499` | aliases 表目标不在可解析集合 |
| `schema.exports-target-missing` | error | `:529` | exports 指向文件不存在 |
| `ref.stale-in-backup` | info | `:553` | 备份内失效引用（恢复备份会重新引入） |
| `ref.unresolvable-local`（非别名） | error | `:594` | 无法解析的注册名 |
| `env.node-version-mismatch` | error | `:811` | 升级 Node 或修清单 |
| `env.dsh-version-mismatch` | error | `:826` | 升级宿主或修清单 |
| `env.binary-missing` | error | `:845` | PATH 缺二进制 |
| `schema.$from-dangling`（×2 变体） | error | `:880, :904` | `$from` 指针悬空 |
| `pkg.version-violation` | error | `:962` | 已装版本不满足声明范围 |
| `pkg.resolution-outside-scope` | warning | `:1140` | 解析实体落在 scopeRoot 外 |
| `reg.name-collision` | error | `:1175` | **引擎原文明示「需要人工决策归属，不提供自动修复」** |
| `reg.inject-face-unknown` | warning | `:1199` | inject 面不在 host-faces.json |
| `schema.missing-suite-manifest` | error | `:1512` | 套件根清单缺失 |
| `mount.custody-archived` | info | `:1425` | 软卸载态：可从面板一键恢复 |
| `mount.body-without-row` | warning | `:1428` | 已装未挂载：可从面板重新挂载 |
| `mount.row-without-body` | warning | `:1441` | 挂载行在、本体缺（dangling） |
| `provider.dangling-reference` | warning | `:1457` | 引用悬空 |
| `provider.missing-provider` | warning | `:1469` | 功能依赖缺中（signals 驱动） |

> mount 类五条全部由 `doctor-signals.json` 驱动（零硬编码，toolkit 仓根；signals `$note` 明示「只产 info/warning，绝不 error」）。summary 分类计算：`engine.mjs:1552-1563`（`fixable = safe + rewrite`；当前 `destructive` 恒 0）。

### 1.5 影响面结论

- 写面 = `environment.roots`（scope/config/profile）三根之内的文件 ＋ `<root>/node_modules` 安装目录；protected 断言把备份目录/`*.bak-*`/`preset-backups` 全部挡死。
- **当前 fixable 全集（上述两类）不触 `cordis.patch.yml`**：patch 上的 mount 类问题全部 manual（`:1441/:1457/:1469` 的 file 均为 cordis.patch.yml 但 plan=[]）。
- 本机现状：`~/.dsh` **无** `doctor-patch-state.json`、**无** `doctor-backups/`、**无** `doctor-apply.lock`（2026-09-19 实测三项均 False）——doctor 从未在本机执行过写路径，回滚面为**既有代码路径、零实际产物**（如实申报）。

---

## ② 双回滚路径方案（既有面证据 ＋ UI 化范围）

### 2.1 doctor 回滚（既有代码面，正本 `executor.mjs:511-624`）

- **状态正本**：`configRoot/doctor-patch-state.json` —— `schemaVersion` / `rollbackChain[]`（每次 apply/rollback 追加一条，含 stamp、备份根、逐 step 结果、installedPackages）/ `files{root|file → {file, backup, originalSha, patchedSha, patchedAt}}` / `installedPackages[]`（`readPatchState :145-163`，结构非法即 `PATCH_STATE_INVALID` 拒绝）。
- **备份正本**：`configRoot/doctor-backups/<stamp>/<root>/<rel>`（`:229`）。
- **回滚语义**：默认回滚**最后一条 apply**；`--to <stamp>` 精确回滚（`:521-527`）。逐文件从备份恢复，恢复前再把**当前态**备份一份（`beforeRollbackBackupRoot`，`:531, :560`）——回滚本身可再回滚；包安装按 stamp 匹配移除（`:533, :576-598`）；备份缺失 ⇒ `BACKUP_MISSING` fail-closed（`:556-558`）；回滚动作亦入 chain（`:601-610`）。
- **与面板回滚的关系**：两套状态正本完全独立（doctor 的在 `~/.dsh`，面板的在各仓 `.panel-*`），互不覆盖；操作台须**分列呈现、不混写**。

### 2.2 面板回滚（restore 能力 UI 化范围——含收据／备份恢复面）

| 场景 | 现有面 | API / 脚本 | 留痕/正本 | UI 现状 |
|---|---|---|---|---|
| 软卸载恢复 | 引擎 `createSoftRestorePlan`/`executeRestore` | `restore/plan|execute`（`panel/index.js:613/:677`） | `.panel-custody/soft-uninstalls.json` 台账 | 卡片「恢复」按钮＋确认页（批 1 交付） |
| 预设恢复（compact-router） | `createPresetRestorePlan` | 同上路由 | `preset-backups/`＋`preset-patch-state.json`（双层留痕） | 同上 |
| 重装后挂载 | `createMountPlan`/`executeMount(Preset)`（复用 `planInsertRow`） | `mount/plan|execute`（`:709/:758`） | **收据** `rebuild.rowBlock`/`hostKey` | 「挂载（重装后）」入口（v2 交付） |
| 收据对账 | `listCustody`（只读） | `custody` GET（`:597`） | `.panel-custody/` 收据目录 | （只读列表，暂无独立 UI 卡） |
| patch 写前备份链 | `executePlan` 唯一写盘通道自动留痕 | ——（引擎内建） | `.panel-write-backups/<stamp>/manifest.json`＋pre 镜像 | 无 UI（L-058 字节级取证证明可完整往返） |
| patch 基线恢复（判据级兜底） | `scripts/restore-cordis-baseline.mjs`（fail-closed：基准 sha 断言→写前备份→写入→复验） | CLI 脚本，`--apply` 显式 | 写前备份到 `.panel-backups/restore-baseline-<stamp>/` | 无 UI（第 11 轮判定授权的判据级工具） |

**UI 化缺口（施工范围建议，待设计稿细化）**：① doctor 回滚段——列出 `rollbackChain` 各 stamp（时间/动作/影响文件数），支持「回滚到此」；② 面板备份段——`.panel-write-backups` 各 stamp 只读列出＋「恢复此快照」入口（走新增 plan/execute 两步路由，复用 executePlan 通道与写前备份）；③ 收据段——custody 列表 UI 化（对账视图，明确「不含内容、不能恢复」）；④ 以上全部走**既有 guard 面**（loopback＋Host＋CSRF＋`change:true`＋两步 plan-execute）。

### 2.3 回滚矩阵（场景 × 面 × 正本 × 依据）

| 场景 | 用哪条回滚 | 正本/留痕 | 依据 |
|---|---|---|---|
| doctor apply 改坏了文件 | doctor 回滚 | `doctor-patch-state.json`＋`doctor-backups/` | `executor.mjs:511-624` |
| doctor 装错了包 | doctor 回滚（按 stamp 移除） | `state.installedPackages` | `:576-598` |
| 面板写 patch 出问题 | 面板备份恢复 / 基线脚本 | `.panel-write-backups/` / `restore-cordis-baseline.mjs` | L-058 取证；脚本头注 |
| 软卸载后悔 | 面板一键恢复 | `soft-uninstalls.json` | `panel/index.js:613` |
| 真卸载后悔 | **无面板恢复**（销毁式）；重装→挂载 | 收据 `rebuild.*` | v2 设计 §4/§5 |
| create-file 回滚 | 无自动回滚（原文件不存在）——操作台呈现为「移除该新建文件」manual 建议 | plan 记录 `backup=null` | `executor.mjs:424-437` |

---

## ③ 操作台 UI 范围（哪些可一键 ＋ 确认页文案框架）

### 3.1 现状（面板已有 doctor 呈现面）

- 「一键体检（只查不改）」按钮 → `POST /api/toolkit-panel/doctor/dry-run`（`client/index.js:1268, :1324`）。
- 问题列表逐条渲染 severity＋message＋`id · file:line`（`:1306-1317`）；汇总行「发现 N 个必须修 / M 个建议修的问题」（`:1292-1304`）。
- 操作台 = 在该体检结果区**为可执行项加动作**，不新增第二处 doctor 入口。

### 3.2 一键范围（建议口径）

| 项 | 处置 | 理由 |
|---|---|---|
| `ref.unresolvable-local`（别名变体） | **可一键**（rewrite 级） | 单文件、锚点精确、备份可回滚；引擎已给出 old→new |
| `pkg.missing-dependency` | **可一键，但须先核源**（rewrite 级） | 零网络环境必须存在 `file:` 本地源；无源 ⇒ 操作台如实提示「无法离线安装」并转 manual 建议（`INSTALL_PACKAGE_SOURCE_UNRESOLVED`） |
| 其余 20 类 manual | **只显示建议**，无按钮 | 引擎自身不发 plan；`reg.name-collision` 引擎原文即「不提供自动修复」 |
| destructive 类 | **不存在**（当前恒 0）；真卸载不进操作台，仍在插件卡片走 v2 三句流程 | summary 计算位保留（`engine.mjs:1560`）但无发射点 |

### 3.3 确认页文案框架（Q1 同标准：如实、无虚假承诺、回滚路径必写）

> 模板（以别名修正为例，实际文案设计稿阶段逐字定稿）：
> - **做什么**：「把〈文件〉里的旧名 `old` 改为 `new`（第 N 处，共精确匹配 1 处）。」
> - **影响面**：「只改这一个文件；不影响 `cordis.patch.yml`，不联网，不安装任何东西。」
> - **回滚**：「改动前自动备份到体检备份区；改完可在本页『体检回滚』一键还原。」
> - **失败表现**：「若文件已被手动改动导致锚点对不上，操作会原地中止、什么都不写（防错位）。」
> - **确认交互**：单条 issue 单次确认（与 CLI 逐条确认同级；**不做**批量静默 `--yes`）；执行后展示复检结果（rescan error 数）。
> - install-package 增补两句：「将从本地目录 `file:…` 复制安装（版本 X 满足声明范围 Y）；不访问网络。」＋「回滚=移除安装目录。」

### 3.4 呈判定侧的三个设计前置问题（设计稿前须裁决）

- **Q-A 执行通道**：操作台执行 doctor 动作，**建议 spawn doctor CLI**（`--apply` 单 issue 注入 + `--json`）而非把 executor 移植进面板——保持唯一实现、避免双正本漂移；代价是面板进程需能起子进程（现 `doctor/dry-run` 路由已这样做了，`panel/index.js:301`）。
- **Q-B 回滚 UI 交付批次**：§2.2 ①②④（doctor 回滚段／面板备份段／确认交互）与一键修复同批，还是回滚段后置批 3？**建议同批**（有回滚面的写动作才符合「回滚先于排查」红线）。
- **Q-C 确认强度**：fixable 两类均为 rewrite 级（可回滚、非不可逆），**建议单次确认＋计划预览**即可，不沿用真卸载的输名两次级（该强度与「不可逆」绑定，勿泛化稀释）。

---

## 4. 本轮零写入自证

- 本轮仅新增本文档与台账/交接卡/README 文档行；**未运行** `--apply`/`--rollback`；未触碰 doctor 状态三件套（实测仍不存在）；真实 `cordis.patch.yml` `ce0b0b81…` 未变；doctor 真实仓 0/0/0（08:49 复核）。
- 后续施工前置（判定流程原文）：证据批验收 → 设计稿 → **用户批准** → 施工；届时全部落盘测试仍走 `os.tmpdir` 副本。

---

## 引用勘误（守卫登记 · EXE-BOOT-014 追加）

> **本节是追加件：上文一行未改。** 依 EXE-BOOT-014 裁② 口径，文档引用守卫（`toolkit:scripts/doc-ref-guard.mjs`）
> 自本批起把存档件的存在性 / #符号 / 跨仓缺前缀失败与活文档同价判红；存档件是历史证词，改写即篡改证词，
> 故清偿走这里——逐条登记「原文里的引用形态 ⇒ 为什么判红、真位在哪、属哪一类」。行号形态按裁① 继续容忍，不在本表内。
> 条目里的 token 用 ASCII 双引号写出＝守卫规则 ⑤「声明原文不是文档引用」的既裁语境，本表自身不产生新引用。

- "doctor-patch-state.json" —（原引 19/44/84/114 行，共 4 处）运行时产物：doctor apply/rollback 写侧在 configRoot 下的状态件（读写在 `doctor仓:src/executor.mjs`），非仓内文件。
- "configRoot/doctor-patch-state.json" —（原引 92 行，共 1 处）运行时面记法：configRoot 是 doctor 的部署根变量，不是仓内目录。真位由 `doctor仓:src/executor.mjs` 拼出，非仓内可核。
- "soft-uninstalls.json" —（原引 117 行，共 1 处）运行时产物：面板保管区台账（路径构造在 `panel/manager/custody.mjs`），落点在部署侧 .panel-custody 目录，非仓内可核。

> 计数自证：本文件登记 3 个 distinct 引用形态，覆盖守卫本批红集中属于本文件的 6 条。
