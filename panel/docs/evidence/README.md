# 验收证据正本（dsh-toolkit 面板）

> 建立时刻：2026-09-18 08:53（GMT+8）
> 用途：把「人工留档目录 `.panel-backups/`（`.gitignore` 排除、不入库）」里的验收证据，
> **正本入 git 版本库**，使证据可与它证明的那次改动**同版本追溯**。

## 为什么要有这个目录

`.panel-backups/` 是**人工留档**目录，被 `.gitignore` 排除，**不随仓库入库**（这是刻意的：
里面是改动前快照与运行日志，体量大且属过程产物）。但随之产生一个问题 ——
**验收证据只存在于一个不入库的目录里**，仓库自身无法自证。本目录解决该问题：
把**证据正本**（体积小、纯文本）复制进版本库，原始备份仍留在 `.panel-backups/`。

**两者分工**：
- `.panel-backups/` = 原始留档（快照 / 日志 / 证据副本），不入库，可被人工清理。
- `panel/docs/evidence/` = **证据正本**，入库，只增不改（新增一次改动就新增一组）。

## 清单与哈希

| 归档文件 | 来源（人工留档） | size | sha256 |
|---|---|---|---|
| `P2.1-EVIDENCE.txt` | `.panel-backups/p21-evidence-2026-09-17T15-43-18-742Z/EVIDENCE.txt` | 3591 | `e9cdaa749f6554229bbbf9894b8426040c61f610760719782f0ab2330a6fcb05` |
| `P2.2-EVIDENCE.txt` | `.panel-backups/p22-evidence-2026-09-17T15-57-56-541Z/EVIDENCE.txt` | 3786 | `166162917bd2bda9bd95ad2fe8c87e9948641f8a51e5c2cca7f4ebca29092d90` |
| `P2.2b-EVIDENCE.txt` | `.panel-backups/p22b-evidence-2026-09-18T00-13-52-624Z/EVIDENCE.txt` | 5752 | `b802c99bcc523414d5f174439725d127aed6b57b215afb965154dba75472b681` |
| `RETENTION-SCOPE.txt` | 由 `scripts/p22b-retention-scope.mjs` 生成（可重放） | 2039 | `67952c4ba5fd081e2609731256b04881b3d10a8f89c062e2ed5a20ad507760a7` |
| `Q2-LAYER-SCAN.txt` | 由 `scripts/q2-layer-scan.mjs --agent-presets` 生成（可重放，**20/20 PASS**） | 13447 | `e03c409fe998b5662b6d3453631b8ae5527551a83ef895e3008a614bf3cf15bd` |

前三份为**逐字节复制**（复制后比对 sha256 一致才落盘），未经改写。

## 各文件证明了什么

- **`P2.1-EVIDENCE.txt`** —— P2.1 两段式框架：plan 只读（落盘前文件 sha 未变）→ execute 落盘
  （sha `ce0b0b81…` → `3d711ad899…`）→ **写前备份产物为证**（manifest 内副本 sha == 写前 sha）→
  用备份还原后逐字节一致 → **篡改后 execute 抛 `sha-conflict`（409），文件未被覆盖**。
- **`P2.2-EVIDENCE.txt`** —— P2.2 启停开关首用例（`rate-throttle`，锚点第 14 行）。
- **`P2.2b-EVIDENCE.txt`** —— P2.2b：**全卡覆盖**（4 张开放卡各跑一次 plan）+ 真实写操作落在
  用户实际点击的 `agent-memory`（第 74 行）+ Q1（`!!js` 条件 `disabled` 的读写两侧危害与安全闸）
  + Q2（层间正交、锚点位移 74→75、陈旧 plan 被 SHA 拦下）+ doctor 0/0/0 + 测试全绿计数。
- **`RETENTION-SCOPE.txt`** —— 见下节。

## 裁剪（保留策略）排除证据 —— 对应用户 Q4

命题：保留策略 `pruneBackups()` **只在自己收到的 `backupRoot` 内裁剪**，
绝不会删除人工留档目录 `.panel-backups/`，也不会改动 `backupRoot` 之外的任何文件。

`scripts/p22b-retention-scope.mjs` 给出 **15/15 PASS** 的四路独立证据：

| 路 | 内容 | 结论 |
|---|---|---|
| **E1 目录不同源** | 引擎默认 `backupRoot = <toolkitRoot>/.panel-write-backups`（`panel/index.js:175`）；人工留档 = `<toolkitRoot>/.panel-backups` | 二者**同级**，非同一目录、非父子；且 `.panel-backups/` 在 `.gitignore` 中 |
| **E2 清单过滤** | `listBackups()` 只认「子目录内含 `manifest.json`」的条目（`backup.mjs:25-31`）；根目录不存在时返回 `[]` | 人工塞进归档的裸目录/裸文件天然不在裁剪视野内；根不存在时裁剪是**空操作** |
| **E3 运行时隔离** | 同一父目录下并排 `write-backups/`（45 份）与 `manual-archive/`，对前者跑 `pruneBackups` | 引擎根 45→40（`removed=5`）；`manual-archive/` **3 个文件逐字节不变**、条目数不变；**差异集合 ⊆ `write-backups/`**，根外零增删 |
| **E4 生产实况** | 默认 `backupRoot` `.panel-write-backups` 当前**不存在** | 生产环境**从未执行过裁剪**，故不可能裁掉任何东西；人工留档 17 个条目完好 |

**为什么 E3 里要在人工归档里也放一个 `manifest.json`**：若只靠「没有 manifest 所以看不见」，
那证据是脆的 —— 一旦有人往归档里放了 manifest，就只剩「目录不同」这一道防线。
E3 刻意放了这个诱饵，证明**即便有 manifest，也因「不在 backupRoot 之内」而不会被越界删除**。

**重放方法**：
```bash
node scripts/p22b-retention-scope.mjs            # 15/15 PASS
node scripts/p22b-retention-scope.mjs > panel/docs/evidence/RETENTION-SCOPE.txt   # 重生成证据
```

## 一条必须知道的生产事实

`<toolkitRoot>/.panel-write-backups` **当前不存在**（`exists=false`）。含义：
- 面板的**默认**写前备份根从未被创建 ⇒ **用户尚未通过面板真实执行过任何 toggle / plan 落盘**。
- P2.1 / P2.2 / P2.2b 的「真实写操作」证据都是在**证据脚本显式指定 `backupRoot`**
  （指向证据目录内的 `write-backups/`）的条件下产生的，**不是**落在生产默认根上。
- 换句话说：**生产文件 `cordis.patch.yml` 至今未被面板改过**，其 sha
  `ce0b0b81c91ca4c420bb5302b2dbe951de0347ca729122511be288aa7c2b76b9` 自 P2 起点未变。

## ⏱ 时钟锚点（防未来对账困惑）

**`EVIDENCE.txt` 里的「生成时刻」是 UTC（带 `Z` 后缀），本地时间 = UTC + 8。**

另需注意：本任务的会话元数据里出现过**错位时钟** —— 系统提示给出的 `<current_time>` 曾报
`2026-09-17 23:31:51 GMT+8`，而 `new Date()` 实测为 `2026-09-18 08:53:10 GMT+8`（相差约 9 小时）。
**因此本目录一律以「用户交互时刻」为真实锚点**，并在下表把 UTC 与本地时间并列写出：

| 证据 | 文件内 UTC 时刻 | 本地真实时刻（UTC+8） |
|---|---|---|
| `P2.1-EVIDENCE.txt` | `2026-09-17T15:43:18Z` | **2026-09-17 23:43:18** |
| `P2.2-EVIDENCE.txt` | `2026-09-17T15:57:56Z` | **2026-09-17 23:57:56** |
| `P2.2b-EVIDENCE.txt` | `2026-09-18T00:13:52Z` | **2026-09-18 08:13:52** |
| `RETENTION-SCOPE.txt` / `Q2-LAYER-SCAN.txt` | 无内嵌时刻（可重放） | 生成于 **2026-09-18 09:0x / 09:1x** |

**推论**：ledger 里「L-030 24:05」这类写法沿用了 UTC 戳的数字，**不等于本地 24:05**（本地对应次日 08:0x）。
对账时**先看是哪种时钟**，再比时间。

## Q2 四层 patch 栈扫描（`Q2-LAYER-SCAN.txt`）

同一脚本兼作 **Q2 终局证据**（`node scripts/q2-layer-scan.mjs --agent-presets`，**20/20 PASS**），四层结论：

| 层 | 载体 | 终局结论 |
|---|---|---|
| ① | `cordis.patch.yml`（仓根） | 9 个 `- id:` 行（5 个插件挂载行 + 2 顶层配置行 + 2 个 routing 组 id）；**无同 id、无覆盖/遮蔽声明**；CRLF 成立 |
| ② | `lib/{5 目录}/dsh.plugin.json` | 字段仅 `manifestVersion`/`name`/`requirements`；**无 `id`/`patch`/`override`/`bundle`** ⇒ 不产生也不能遮蔽任何行 |
| ③ | `panel/dsh.plugin.json`（+ `panel/package.json`） | 同构；`panel/package.json` 只声明 `dsh`（client 面），不声明 patch 文件 |
| ④ | `scripts/apply-preset-patch.mjs` → `~/.dsh/.agent-presets/*` + shipped presets | 授权范围内 2 个目录；只有 `compact-router` 经此层挂载；无旧名/upstream 残留；每个改写都有 `.bak`（**含两种历史来源**：upstream 与旧独立插件） |

**未覆盖面（如实标注）**：3 个 shipped preset（`standard`/`ptc`/`cordis`）的**当前内容**在 `AppData/…/npm/…/dsh-agent-presets/presets/`，
**不在已授权路径内、未读**；其「已被改写」由 `preset-patch-state.json` + 仓内 `.bak` 间接支持，内容验证需另给授权。

**另含一条本轮查出的溯源缺口**：`toolkit-manager` 行的**首次落盘时刻与操作者未留档**（该字符串从未进入该文件的 git 历史；
可归因最早证据 = `.panel-backups/arm-manifest-20260917-105930/`，已含该行、旧名）。详见 `HANDOFF-MASTER.md` §9.2。
