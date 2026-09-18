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
| `Q2-SHIPPED-PRESET-SCAN.txt` | 由 `scripts/q2-shipped-scan.mjs` 生成（可重放，**21/21 PASS**） | 10400 | `d38ab769f87dfeadedc2e91de7cdd8e71e5b077668521c234053b1db7613b615` |
| `Q2-SHIPPED-PRESET-DIFF.txt` | 由 `scripts/q2-shipped-diff.mjs` 生成（可重放，逐行 diff 原版↔现版） | 55314 | `c24cabd61f492ee26a8a7fc3c152b9f646f15910fe7faf500451589016c8bf66` |
| `MASTER-MERGE-FIDELITY.txt` | 由 `scripts/master-merge-fidelity.mjs` 生成（可重放，**38/38 PASS**）—— 总文档九大节保真抽检 | 4253 | `cc75c5b4d27e4d28133ed664013ae1f54ed1c67afcf9adaa817b5c7e40a115e4` |
| `MASTER-MERGE-NORMALIZATION.txt` | 本侧撰写 —— 总文档合并的**3 项排版归一枚举 + 保真说明**（含「字面全文 diff 不可构造」的如实申报） | 4707 | `7da72b053b9a110514b855b121ccdbbbbfe25794baced153af689da25db8eae2` |
| `TERMINAL-ACCEPTANCE-ROUND10.txt` | 由 `scripts/terminal-acceptance-report.mjs` 生成（第 10 轮终验取证 a–e；**只读**，重建 4 次写链 LCS） | 6689 | `49ef62a02e6d5d0379de1597fc5566c673b26684f55a56cef1e0001464ef2e55` |
| `D01-MANIFEST-FIX.diff` | 第 11 轮 D-01（ADS 备份）+ manifest `reason`/`note` 修复的 **diff 留痕** | 16579 | `17fa692cb59ded4e7dcbcac1c865ad950540211b3802f4da12e80248a37a6b07` |
| `ROUND12-SUPPLEMENTARY-ACCEPTANCE.md` | 第 12 轮 —— 催收**三项补验收正文摘要**（A：`api-notes` 两新节 / B：附录 B U1–U11 / C：3 项归一枚举 + 「全文 diff 不可构造」）+ U8/U9 呈报 + 新增 U12（授权语义澄清） | 10848 | `84c69d88f56152419a97a535a1396b10f06127cf819a490051371368ecfef2ab` |
| `MASTER-BLIND-PROBE-8.txt` | 由 `scripts/master-blind-probe.mjs` 生成（可重放，**8/8 逐字命中**）—— **判定侧盲抽 8 句**（探针判定侧指定，本侧未挑选；逐句 ±20 字上下文） | 5137 | `04f0e735b5e0824b7efa5df5c280a3ba7f0b0032d2c69d226ea3286e75adf609` |
| `ROUND13-SUPPLEMENTARY-2.md` | 第 13 轮 —— **尾②注入点全表**（+「已扫与否/未扫原因」，**补登同族缺口 #0/#2/E1**）+ **U1–U5 逐行补呈** + 盲抽结果登记 | 10057 | `99d1284d36bf12a77833088dc6608ba7d682d5fcc17ff797c67fe44083b95f62` |
| `Q2-RELEASED-SCAN.txt` | 由 `scripts/q2-released-scan.mjs` 生成（可重放，全程只读）—— **乙程序首批例行只读读取**（U12=乙 首批）：红线内 4 点 + 注入点 5 env 全落结论 ⇒ **Q2 全表穷尽 ✓** | 4477 | `d4839418e5d41f253ab269f15a54b1c4e3c5f77e75614e591d771be6947e6fad` |
| `P23-SHADOW-SCAN.txt` | 由 `scripts/p23-shadow-scan.mjs` 生成（可重放，全程只读）—— **P2.3 设计前置遮蔽补扫**（第 15 轮授权段）：T1 热 JSON 现有 `mode` 键（auto）⇒ patch 编辑无效；T2 settings 无 `web-search-local` 节；T3/T4 env 空。**尾注含越界申报**（`dsh-rate-throttle.json` 授权段外手工只读一次，列 U13-1 追认） | 2773 | `ab707cc2c4d258d5a4d717edd45a63d469e5534529929fa8e800399dee13198c` |
| `P23-EVIDENCE.txt` | 本侧撰写 —— **P2.3 施工验证证据**（第 19 轮批准后首个写盘批次）：交付清单 + p23-verify **107/107** + 一键回归全绿 + doctor 0/0/0 + 基准 sha 未变 + **U9 marker 刷新记录** | 4814 | `32e2dd8b9bd94522fd06e0db4e31f396f829119530734d4808a3bd3e18410546` |

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
- **`MASTER-MERGE-FIDELITY.txt`** —— 总文档九大节合并进 `HANDOFF-MASTER.md` 后的**保真抽检 38/38**（逐节锚点 / 原文行核对）。
- **`MASTER-MERGE-NORMALIZATION.txt`** —— 3 项**排版归一**（合并时唯一的非保真动作）的逐项枚举 + 依据；并**如实申报**「字面级全文 diff 不可构造」（原文以会话消息形态送达、未落过盘，压缩后不可取回）。
- **`TERMINAL-ACCEPTANCE-ROUND10.txt`** —— 第 10 轮终验取证 **a–e** 正本（**只读**）：以 4 份写前备份的载荷做 **LCS 重建**，还原出 `ce0b0b81`(3097) →写#1→ `77279ccb`(3119) →写#2→ `54345b4f`(3120) →写#3→ `2620280b`(3142) →写#4→ `c03e2c81`(3143) 的完整链（**链式 `shaBefore` 互证** ⇒ 均走 `executePlan` 唯一通道）。**该报告结论为 (c)✗ / (d)✗ / (a) 部分✗** —— 正是据此**喊停、未进关账**；第 11 轮裁决后以**授权恢复**达成基准。
- **`D01-MANIFEST-FIX.diff`** —— D-01（备份副本落 NTFS **ADS**、目录只留 0 字节 `D` 载体）修复 + `manifest.reason`/`note` 恒 null 修复的 diff 留痕（**安全关键脚本 `backup.mjs` 的改动须留痕**）。
- **`ROUND12-SUPPLEMENTARY-ACCEPTANCE.md`** —— 第 12 轮关账后**保留事项**的执行正本：把**催收三项**（`api-notes` 两新节 / 附录 B U1–U11 / 3 项归一枚举 + 全文 diff 说明）的**正文摘要**呈判定者补验收；附 **U8/U9 呈报**与**新增 U12（授权语义澄清）**。**关账已被接受，本件不改结论**；本轮**磁盘动作 = 零**。

## 裁剪（保留策略）排除证据 —— 对应用户 Q4

命题：保留策略 `pruneBackups()` **只在自己收到的 `backupRoot` 内裁剪**，
绝不会删除人工留档目录 `.panel-backups/`，也不会改动 `backupRoot` 之外的任何文件。

`scripts/p22b-retention-scope.mjs` 给出 **15/15 PASS** 的四路独立证据：

| 路 | 内容 | 结论 |
|---|---|---|
| **E1 目录不同源** | 引擎默认 `backupRoot = <toolkitRoot>/.panel-write-backups`（`panel/index.js:175`）；人工留档 = `<toolkitRoot>/.panel-backups` | 二者**同级**，非同一目录、非父子；且 `.panel-backups/` 在 `.gitignore` 中 |
| **E2 清单过滤** | `listBackups()` 只认「子目录内含 `manifest.json`」的条目（`backup.mjs:25-31`）；根目录不存在时返回 `[]` | 人工塞进归档的裸目录/裸文件天然不在裁剪视野内；根不存在时裁剪是**空操作** |
| **E3 运行时隔离** | 同一父目录下并排 `write-backups/`（45 份）与 `manual-archive/`，对前者跑 `pruneBackups` | 引擎根 45→40（`removed=5`）；`manual-archive/` **3 个文件逐字节不变**、条目数不变；**差异集合 ⊆ `write-backups/`**，根外零增删 |
| **E4 生产实况** | 默认 `backupRoot` `.panel-write-backups` —— **原为「不存在」**；第 11 轮用户真实写入 4 次后**已存在** | **原断言**：生产从未裁剪 ⇒ 不可能裁掉任何东西。**第 11 轮改写为**：引擎根内备份数 **≤ 保留上限**（未被密度裁剪丢过）＋ 人工留档条目完好（见下方「第 11 轮更新」） |

**为什么 E3 里要在人工归档里也放一个 `manifest.json`**：若只靠「没有 manifest 所以看不见」，
那证据是脆的 —— 一旦有人往归档里放了 manifest，就只剩「目录不同」这一道防线。
E3 刻意放了这个诱饵，证明**即便有 manifest，也因「不在 backupRoot 之内」而不会被越界删除**。

**重放方法**：
```bash
node scripts/p22b-retention-scope.mjs            # 17/17 PASS（第 11 轮起；此前为 15/15）
node scripts/p22b-retention-scope.mjs > panel/docs/evidence/RETENTION-SCOPE.txt   # 重生成证据
```

> **📌 第 11 轮修订**：E4 原断言依赖「生产 `backupRoot` 不存在」这一事实，P2.2 用户侧终验真实写入 4 次后**该前提失效**，故 E4 已重写为「**引擎根备份数 ≤ 保留上限 ⇒ 未因密度裁剪丢失**」＋「人工留档完好」；总计数 **15 → 17**。归档的 `RETENTION-SCOPE.txt`（2039 B）为**生成当时**快照，按「只增不改」**不覆盖**；重放以脚本为准（实测 **17/17 PASS**）。

## 一条必须知道的生产事实

> ⚠️ **本节写于 2026-09-18 上午（P2.2 终验前）。2026-09-18 第 11 轮已发生实质变化 —— 请先读下方「第 11 轮更新」，再回看本节的历史结论。**

`<toolkitRoot>/.panel-write-backups` **当时不存在**（`exists=false`）。含义：
- 面板的**默认**写前备份根从未被创建 ⇒ 用户尚未通过面板真实执行过任何 toggle / plan 落盘。
- P2.1 / P2.2 / P2.2b 的「真实写操作」证据都是在**证据脚本显式指定 `backupRoot`**
  （指向证据目录内的 `write-backups/`）的条件下产生的，**不是**落在生产默认根上。
- 换句话说：**生产文件 `cordis.patch.yml` 当时未被面板改过**，其 sha
  `ce0b0b81c91ca4c420bb5302b2dbe951de0347ca729122511be288aa7c2b76b9` 自 P2 起点未变。

### 第 11 轮更新（2026-09-18，**以本段为现行口径**）

- **用户已通过面板真实写入 4 次**（P2.2 用户侧终验：`rate-throttle` + `agent-memory-runtime` 各「停用→复原」一次）⇒ 生产默认根 `.panel-write-backups` **已被创建**、内含 4 份备份。上节「从未被创建」的前提**已失效**。
- **4 次写入均走 `executePlan` 唯一通道**（链式 `shaBefore` 互证），文件从 `ce0b0b81`(3097) 变到 `c03e2c81`(3143，两卡各留一条显式 `disabled: false`)。
- **第 11 轮裁决：授权恢复**。`scripts/restore-cordis-baseline.mjs --apply`（fail-closed）已把磁盘**逐字节复原**到 `ce0b0b81c91ca4c420bb5302b2dbe951de0347ca729122511be288aa7c2b76b9`（**3097 B / CRLF**），并**语义化提交**（`22fde85`，内容纯净：仅 toolkit-manager 4 行）。写前备份留档于 `.panel-backups/restore-baseline-2026-09-18T04-40-47-135Z/`（其副本 sha = `c03e2c81…`）。
- **现行事实**：`cordis.patch.yml` sha = **`ce0b0b81…`**（3097 B / CRLF，含 4 行 `toolkit-manager`），**已入库**；doctor **0/0/0**。

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
| `Q2-SHIPPED-PRESET-SCAN.txt` / `Q2-SHIPPED-PRESET-DIFF.txt` | 无内嵌时刻（可重放） | 生成于 **2026-09-18 10:1x–10:2x** |

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

**未覆盖面（已于 2026-09-18 闭合）**：3 个 shipped preset 的**当前内容**当时标注为「不在已授权路径内、未读」。
现已查明该判断**过度收窄** —— `AppData/…/npm/…` 是 **DSH 安装目录，不在红线内**（红线仅 `~/.dsh`、cloudflared 进程、五子插件源码目录）
⇒ **无需新增授权**即可补扫，缺口闭合（见下节）。

**另含一条本轮查出的溯源缺口**：`toolkit-manager` 行的**首次落盘时刻与操作者未留档**（该字符串从未进入该文件的 git 历史；
可归因最早证据 = `.panel-backups/arm-manifest-20260917-105930/`，已含该行、旧名）。详见 `HANDOFF-MASTER.md` §9.2。

> **📌 2026-09-18 第 11 轮修订（重要，两处）**
>
> **① 计数（勿混淆）**：本节的 **20/20** 指**带 `--agent-presets`** 的调用（§5 会读 `~/.dsh/.agent-presets`，多 6 条断言）；**不带 flag 时为 14/14**（§5 跳过），`scripts/regression-all.mjs` 用的即后者。**两者都对，视调用方式而定。**
>
> **② 归档文件与脚本的时序差**：`Q2-LAYER-SCAN.txt`（13447 B，`e03c409f…`）是**生成当时（提交前）**的快照 —— 其 §4 断言原文为「`toolkit-manager` **从未**出现在 git 历史中」。第 11 轮已**语义化提交**该行（`22fde85`），故脚本 §4 断言已**按新现实重写**（「已进入 git 历史 + 磁盘(LF 归一)==HEAD + 字节账 3015+82=3097」）。
> **本目录遵守「只增不改」**：故**不覆盖**该归档文件。**现行事实以脚本重放为准** —— 当场重放（只读）实测：`--agent-presets` **20/20 PASS**。重放：`node scripts/q2-layer-scan.mjs --agent-presets`。
> 同理，上文的「溯源缺口」**已由 `22fde85` 封闭**（该行现已在 git 历史内）。

## shipped presets 补扫（`Q2-SHIPPED-PRESET-SCAN.txt` + `Q2-SHIPPED-PRESET-DIFF.txt`）

`node scripts/q2-shipped-scan.mjs` → **21/21 PASS**；`node scripts/q2-shipped-diff.mjs` → 逐行 diff（原版 `.bak` ↔ 现版磁盘）。
**依据**：`AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-agent-presets/presets/` 属 DSH 安装目录，**不在红线内**。

| preset | 字节 | sha256（前 12） | `- id:` 行 | marker 对账 |
|---|---|---|---|---|
| `standard` | 13070 | `a5e4d87112f0` | 31 | **== patchedSha ✓** |
| `ptc` | 14145 | `7d9aff861cd6` | 32 | **== patchedSha ✓** |
| `cordis` | 14152 | `9525c9a6ca40` | 32 | **== patchedSha ✓** |
| `minimal` | 3119 | `e75af996ab8c` | 7 | 无 marker（脚本明文：**设计上不动**） |

**结论**：① **toolkit 五 id 行 = 无**（五条 `insert` 行的 id 一处都没有）；② **覆盖声明 = 无**
（`disabled`/`override`/`merge` 命中**全是 upstream 自己的内容**）；
③ 三份**各含 1 行** `- id: compact-router` —— 是 `scripts/apply-preset-patch.mjs` 把 upstream
`- id: compaction-basic`/`@deepseek-ai/dsh-compaction-basic` **原位替换**的结果（**Δ +5 行 / +142 B**，三份一致），
`cordis.patch.yml:3` 注释自陈此事 ⇒ **文档化注入路径，不是泄漏**；`@deepseek-ai/dsh-compaction-basic` 与旧名 `@local/dsh-compact-router` **均 0 残留**。

**同时产出的源码定案**：DSH 启动的**全部 patch/配置注入点 + 同 id 合并语义**已落 `panel/docs/api-notes.md` 新节「**P2.0③**」
（bundle → profile → home → `--patch` → telemetry；非 patch 面：env / `!!js` / agent-preset / 预设改写路径；
**同 id**：patch 平面「后者覆盖、顶层赋值、非深合并」，loader 平面「复用同一 Entry」，**agent-preset 平面「首根胜」**）。
据此裁决：**「同 id 后者覆盖」= 真**；**「四层 patch 栈」= 转述失真候选（第四例，与 11.11 同族）** —— 原文不删，`HANDOFF-MASTER.md` §8.0 / §8.4 加批注。

---

## 修订记录（索引 · 只增不改，故各处均以「新增注记」方式更新）

| 时刻（GMT+8） | 变动 | 影响的本目录文件 |
|---|---|---|
| 2026-09-18 10:46 | 总文档九大节保真合并落盘（38/38） | 新增 `MASTER-MERGE-FIDELITY.txt`、`MASTER-MERGE-NORMALIZATION.txt` |
| 2026-09-18 11:2x（第 10 轮） | 终验取证 a–e 出结论 **(c)✗ / (d)✗ / (a) 部分✗** ⇒ **喊停不进关账** | 新增 `TERMINAL-ACCEPTANCE-ROUND10.txt` |
| 2026-09-18 12:1x（第 11 轮） | D-01（ADS）+ manifest `reason`/`note` 修复；`p21/p22-verify` 备份断言升级为**独立路径取证**；`p22b` E4 重写（15→17）；新增 `backup-write-test`（23/23） | 新增 `D01-MANIFEST-FIX.diff`；上表 `RETENTION-SCOPE.txt` 条目加注 |
| 2026-09-18 12:40–12:48（第 11 轮） | 授权**恢复** `cordis.patch.yml` → `ce0b0b81…`（3097 B / CRLF）+ **语义化提交** `22fde85` | `Q2-LAYER-SCAN.txt` 条目加注（§4 断言按新现实修订，**计数不变** 20/20；默认 14/14）；「生产实况」一条加注（前提失效） |
| 2026-09-18 13:07（第 12 轮） | 关账被判定侧接受（「关账成立 ✓」）；执行保留事项 —— **催收三项补验收呈报** + **U6/U7 销项** + **新增 U12 授权语义澄清**；**零磁盘动作**（`cordis.patch.yml` sha 未变 `ce0b0b81…`） | 新增 `ROUND12-SUPPLEMENTARY-ACCEPTANCE.md`（10848 B） |
| 2026-09-18 13:25（第 13 轮） | 补验收判定（第 12 轮四块 ✓ + 全文 diff 申报接受）；**判定侧盲抽 8 句 8/8 逐字命中**（代偿自选探针偏选风险）；**尾②注入点全表**补呈并**补登同族缺口 #0/#2/E1**（红线内未扫，随 U8 一并补扫）；U9 已批准（随下个写盘批次刷新 marker） | 新增 `MASTER-BLIND-PROBE-8.txt`（5137 B）、`ROUND13-SUPPLEMENTARY-2.md`（10057 B） |
| 2026-09-18 13:42（第 14 轮） | 用户两项裁决落账（**U8+同族授权 ✓ / U12=乙**）；**「四层栈」改判**（内容为真、出处未落盘；归档口径 =「事实必须落盘出处，否则与失真不可分辨」）；**乙程序首批例行只读读取** —— 红线内 4 点全落结论（#3/E1 文件不存在、#0/#2 = `[]`、#5 env undefined）⇒ **Q2 全表穷尽 ✓**；「重发原文 diff」可选项关闭 | 新增 `Q2-RELEASED-SCAN.txt`（4477 B） |
| 2026-09-18 16:00（第 19 轮） | 设计稿正式批准 → **P2.3 施工批次**：服务端白名单 18 字段（13 字段域对齐不放宽）+ config/plan 路由（仅 rate-throttle）+ 引擎 config 子树编辑 + snapshot configPanel（mode 只读三分支，方案 1）+ 两渲染器参数编辑 UI + **U9 marker 刷新**（`acf18889…`）；**测试一律走副本，真实 patch 零写入**（基准 `ce0b0b81…` 未变）；p23-verify **107/107** + 一键回归全绿 + doctor 0/0/0 | 新增 `P23-EVIDENCE.txt`（4814 B） |

> **本目录的两条硬约定**：① **只增不改** —— 已入库的归档文件**永不覆盖**；与脚本产生时序差时，**加注记、以脚本重放为准**。
> ② **每份证据必须可重放** —— 上表所有「由 `scripts/*.mjs` 生成」者，重放命令即其生成命令。
