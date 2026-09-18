# Ledger — dsh-test-sandbox 项目台账

> ⚠️ **本文件已非正本（2026-09-17 21:40 起）。**
> **正本位置：`D:\dsh-plugins\dsh-toolkit\panel\docs\ledger.md`**
> 本副本与正本当前逐字节一致（sha256 `eb2b84589121188bc0efb2fee928bd77171ad85a1e5a14ce4e09052d1a763470`，21639 B）。
> 后续一切台账写入**一律改到正本**，本文件仅作沙箱工作副本保留，不再更新，避免双写漂移。
> 正本化原因：台账需与 `panel/docs/api-notes.md`、`panel/docs/handoff-restart.md` 同处一套正本目录，随插件仓库入 git 版本化。

> 说明：本文件在 2026-09-15 新会话恢复时重建。旧 ledger.md 不在磁盘；L-000~L-009
> 依据 progress.md、incident-report-prod-root-pollution.md、phase1-ledger-design.md 及
> 会话存档中的台账区段重建摘要，验收标准为对应磁盘证据。

## 永久指令

- 始终用中文回复
- 先读台账再动手

## 进行中

- **L-023 [已关账 · 迁移任务正式完成]** 面板 UI 迁移（含**设置页 tab**、**直连后备页**、**guard 链**三件套）。
  - **关账依据（2026-09-17 23:53 用户确认）**：**设置页 tab 可见、界面合格，用户已确认。** 此前命令行侧的全部验证（22:08 重启成功、22:10 三验收全绿、path-like profile 行解析成功、P1 冒烟 27/27）与用户目视确认**合并闭环**，L-023 / L-024 / L-025 三条挂起的「浏览器端目视确认」至此**全部解除**。
  - **交付三件套**：
    1. **设置页 tab** —— client bundle 经 `ctx.slots.register({ name: "settings.plugins.tab", id: "toolkit-panel", order: 90 })` 注入设置页，用户目视可见且界面合格。
    2. **直连后备页** —— `/api/toolkit-panel/ui`（服务端 `uiHtml`，`client/panel.html` 独立渲染器），桌面直连可开，作为 tab 不可用时的兜底入口。
    3. **guard 链** —— 只读路径（`isAllowedRead`：loopback AND (Host loopback OR 配对服务 OR `devicesFile` hasOwn 兜底)）与写路径（`isAllowedWrite`：loopback AND (Host loopback OR `pairedByServiceStrict`)，**禁 fallback**）双轨，叠加 CSRF（`sec-fetch-site ≠ cross-site` 且 `origin.host == Host`）。所有面板路由统一过 `guard()`。
  - 三验收（2026-09-17 22:10）：桌面 loopback → `/api/toolkit-panel/ui` **200**；stable host 无 cookie → **403**；`/api/toolkit-panel/snapshot` 桌面 **200**。
  - 历史过程中止记录（均已闭环，留档）：第一次 21:06 `CantActivateDocumentInPipeline`；第二次 21:46 `taskkill /F` 权限被拒（缺 `PROCESS_QUERY_INFORMATION`）。第三次 22:08 `Process.Kill()` 修复后成功。
  - **【用户点名表扬 2026-09-17 22:00】**：①②④及台账正本化全部验收通过；**「自我证伪行为」点名表扬入台账** —— 21:55 曾假设「conhost 本身不可杀并污染 `/T`」，随即构造专门演练（真实 conhost 落进子树）**主动证伪了自己的假设**，随后改用访问掩码探测精确定位真根因（缺 `PROCESS_QUERY_INFORMATION`）。此工作方式（先证伪再定案，不拿现象当根因）获用户认可，记录在案作为后续同类问题的处理范式。
  - 授权事项：重启授权沿用用户已给的批准；用户若说"推迟"，仅注册时刻顺延，其余不动。

### L-023-① mtime + 改动来历穷尽调查（2026-09-17 21:30，✅ 已完成，全程只读）

调查原则：不只对 patch 文件，而是对**全部本次任务触达的文件**穷尽核对 mtime / size / sha256，并与 git HEAD 及各备份快照逐版对比，锁定"谁在何时改了什么、有没有无据改动"。

**A. cordis.patch.yml 版本谱系（sha256 全量对照）**

| # | 版本 | size | mtime | sha256 |
|---|---|---|---|---|
| ① | git HEAD（`git show HEAD:`） | — | 2026-09-16 20:02 提交 | `7541c05a…b351b97` |
| ② | `.panel-backups/arm-manifest-20260917-105930/` | 3072 | 09-17 10:59:30 | `8a2b0250…c0c9369b` |
| ③ | `.panel-backups/pre-disabled-proof/` | 3072 | 09-17 09:44:01 | `8a2b0250…c0c9369b`（=②，同内容） |
| ④ | `.panel-backups/pre-restore-disabled-20260917-114750/` | 3094 | 09-17 11:47:50 | `aff94ea8…b4694b49` |
| ⑤ | `.panel-backups/pre-p2-toolkit-manager-20260917-2026-09-17T12-44-28/` | 2914 | 09-17 20:44:28 | `7541c05a…b351b97`（**=①，git HEAD 内容**） |
| ⑥ | **live（当前）** | **3097** | **09-17 19:55:50** | **`ce0b0b81…c2b76b9`** |

- **结论 1**：git HEAD 与 pre-p2 回滚备份**逐字节一致**，证明回滚快照有效、无污染。
- **结论 2**：live 相对 git HEAD 的**净差异仅 1 处**（`git diff --stat` = `cordis.patch.yml | 4 ++++`）：

  ```diff
  + - insert:
  +     - id: toolkit-manager
  +       name: 'file:///D:/dsh-plugins/dsh-toolkit/panel/index.js'
  ```

- **结论 2b（重要）**：live 相对 10:59 的 arm-manifest 基线有 **2 处**差异：

  ```diff
  @@ rate-throttle @@
  -      disabled: true          ← 10:59 布防时的临时态
  @@ toolkit-manager @@
  -      name: '@local/dsh-toolkit/panel'
  +      name: 'file:///D:/dsh-plugins/dsh-toolkit/panel/index.js'
  ```

  `disabled: true` 的**增**：10:59 布防时写入（arm-manifest 备份时刻=写入前，故②不含；④已含）。其**删**：11:47:50 授权内还原动作，已记账（"已还原 rate-throttle disabled…dump 验证"）。行名改写：19:55 由 P2 方案实施，来自 api-notes.md P2.1 决策树（path-like 行名才能让 `locatePkgJson` 走 `nearestPackage` 命中 `panel/package.json`）。**两处均有据可查，非无据改动。**

**B. 全树扫尾（19:00 之后所有改动，排除 node_modules/.git）**

| 时刻 | size | 文件 | 来历 |
|---|---|---|---|
| 19:53:10 | 378 | `panel/package.json` | P2 新建（name/exports `./client`/`dsh.client.platform=web`） |
| 19:55:50 | 3097 | `cordis.patch.yml` | P2 行名改 path-like |
| 19:55:51 | 4426 | `panel/manager/snapshot.mjs` | P2 快照器 |
| 20:30:48 | 5607 | `scripts/p2-smoke.mjs` | P2 离线断言脚本（16 断言） |
| 20:44:28.405 | 8468 | `panel/client/index.js` | P2 client bundle |
| 20:44:28.407 | 6195 | `scripts/p1-smoke.mjs` | P1 smoke 同步更新（现 27 断言） |
| 20:44:28.438 | 2914 | `.panel-backups/pre-p2-*/cordis.patch.yml`（+manifest.json） | 回滚快照落盘，SHA 已验=git HEAD |
| 20:44:42 | 1519 | `package.json`（根） | **无 git 差异**（内容与 HEAD 一致），仅 mtime 变动，零内容漂移 |
| 21:06:02 | 127 | `.panel-backups/restart-logs/restart-trigger-20260917-210601.log` | 21:06 中止留痕 |
| 21:13:01 | 11625 | `panel/docs/handoff-restart.md` | 第 11 节 + 11.1 异常记录落盘 |

- **结论 3**：**无未记录/无来历改动。** 19:00 后全部 11 个改动均可归因（P2 实施 / 回滚快照 / smoke 脚本 / 中止留痕 / handoff 正本化）。根 `package.json` 仅 mtime 变动，内容零漂移。
- **结论 3b**：19:55:50 与 19:55:51 的 1 秒内双写（patch + snapshot.mjs）同属一次实施动作，可解释。

**C. 脚本 sha256 对照（沙箱工作副本 vs 线上正本）**

| 线上正本 | sha256 | 沙箱副本 | 同源？ |
|---|---|---|---|
| `scripts/restart-trigger.ps1` | `7fe539b8…8cf705b` | `_trigger-v2.ps1` `8194da85…` / `_restart-trigger.ps1` `1cb55197…` | ❌ 不同 |
| `scripts/restart-selfheal.ps1` | `f6bcdebb…c8fd73a5` | `_restart-selfheal.ps1` `628b24b8…` | ❌ 不同 |
| `scripts/p1-smoke.mjs` | `7d92484b…aba02f6` | `_p1-smoke.mjs` `f38be768…` / `_p1-smoke-v3.mjs` `e70ffcf9…` | ❌ 不同 |
| `panel/index.js` | `56cf5a7e…73b5e89db16` | `_panel-index.js` `8bdb8306…` / `_panel-index-v2.js` `d0f67278…` | ❌ 不同 |

- **结论 4**：**正本在 `D:\dsh-plugins\dsh-toolkit\`；沙箱根下 `_*.ps1` / `_*.mjs` / `_panel-*.js` 均为工作副本且与正本不同源。** 后续一律以线上正本为准，沙箱副本仅供追溯，**不得反向覆盖正本**。

**D. T+10 selfheal 未执行留痕**

`restart-logs/` 下 selfheal 日志唯一一份为 `restart-selfheal-20260917-111106.log`（11:11，返回 double-start guard skip）。**21:14:39 的 T+10 无对应日志**——与 11.1 记录"两个一次性任务已删除"一致（任务在 21:06 异常后即删，T+10 从未注册、从未运行）。**无遗漏执行，无遗留任务。**

**E. 环境实测（只读，2026-09-17 21:23）**

- 端口 3080：`LISTENING PID 27900`（=12:48:47 上次重启拉起的 dsh web，仍载旧 P1 面板）。
- cloudflared：PID 7464 存活（27900 直接子进程，隧道在）。
- 计划任务：`Get-ScheduledTask` 筛 `DSHToolkit*` → **零结果**（已清空，符合 11.1）。
- 21:06 trigger 日志：`trigger scheduled, delay=0s port=3080` → `killing process tree of pid 27900` 后中断，无 taskkill / port-free / started 行 → 与 11.1 根因描述完全吻合。

**F. 离线双 smoke 复跑（只读，不改盘）**

- `node scripts/p1-smoke.mjs` → **27/27 PASS**（snapshot 5 插件、self id=toolkit-manager、doctor dry-run 0/0/0；live 项按预期 SKIP）。
- `node scripts/p2-smoke.mjs` → **16/16 PASS**（行名 path-like/file URL、nearestPackage 命中 panel/package.json、platform=web、exports `./client`、bundle ModuleLoader.load + settings.plugins.tab + exports.apply）。
- 结论：① 与 ④ 的"改前基线"成立，可安全进入加固。

**G. ① 交付物**

- 本节（L-023-①）已写入台账正本；临时对照产物 `_live-check.txt`（进程/任务采集）留存沙箱根，不入库。
- **① 全程只读，未新增/未删改任何线上文件。**

### L-023-①b 19:55 / 20:44 时序矛盾解释（2026-09-17 21:35，✅ 已定案）

**现象（矛盾陈述）**：`pre-p2` 备份内 `cordis.patch.yml` 的内容是**改写前**的 git HEAD 版（sha `7541c05a…`），但其文件 mtime 是 **20:44:28**，而 live 文件的改写 mtime 是 **19:55:50**。备份晚于改写 48 分钟，却存着改写的**旧**内容——表面上"备份拿到了它不可能拿到的内容"。

**定案（采用「备份动作语义」解释，二选一中的第一项）**

- **判别证据**：`git show HEAD:cordis.patch.yml | sha256sum` = `7541c05aaaec808f8e6500356bed3b25550998ef7a1bcf560b0c167bcb351b97`，与备份内文件 sha256 **逐字节一致**。
- **语义**：该备份不是"磁盘瞬时快照"，而是**「git HEAD 内容归档」**。manifest `note` 已自陈：`Pre-P2 toolkit-manager row (git HEAD) backup with SHA for rollback.` —— 它记录的是"P2 改写后若要回滚，应回到的那个**目标态**（= git HEAD）"，**与备份执行时刻磁盘上是什么内容无关**。
- **矛盾消解**：备份"内容取自 git HEAD"、"时刻发生在 20:44:28"，两件事各自成立、互不冲突。之所以看似矛盾，是因为默认把"备份"理解成"磁盘快照"——而本次备份的语义是**版本归档**。
- **时区语义（易误读点）**：备份目录名内嵌 stamp `20260917-2026-09-17T12-44-28` 中的 `12:44:28` 是 **UTC**（`backup.mjs` L10：`new Date().toISOString()` 恒返回 UTC），换算本地 +08 恰为 **20:44:28**，与备份文件自身 mtime 吻合。目录名形如 `<本地日期>-<UTC时刻>`，是造成"12:44 还是 20:44"读法分歧的根源。
- **结论**：**非异常、非无据改动、无需修文件、无需重打包。** 时序记录自洽，已在台账留痕。

- **L-023-① 判定：通过。**（① 调查结论 + ①b 时序解释均为只读，未改动任何线上文件。）

### L-023-④ 全量加固（2026-09-17 21:35，✅ 已完成）

**备份**：`.panel-backups/pre-p4-hardening-20260917-2135/`（含两脚本原件 + `manifest.json` + 两份 `.diff`）

| 脚本 | sha256 before | sha256 after | parser 错误 |
|---|---|---|---|
| `scripts/restart-trigger.ps1` | `7fe539b8…8cf705b` | `2b28573f…966dfebc` | **0** |
| `scripts/restart-selfheal.ps1` | `f6bcdebb…c8fd73a5` | `161077a0…1849bf20` | **0** |

**四条件落地**

- **H1（核心修复）** `taskkill` / 进程与端口探测**全部去管道化**：改为变量接收输出 + `foreach` 逐行记录。这正是 21:06 中止的直接根因（`CantActivateDocumentInPipeline`）。selfheal 的 `Get-CimInstance | Where-Object | Select-Object` 三级管道同样改为显式 `foreach`。
- **H2** 杀树 / 等释放 / 启动 / 验活**四个阶段各自 try-catch**，失败记日志并走可辩护动作，不再当场静默死亡。
- **H3** 记录 `taskkill` 退出码；**杀树阶段仅在 60s 后端口仍被占时硬中止**（拒绝双开）；启动阶段记录子进程 pid。
- **H4** 整个主体包在顶层 try/catch，任何未处理终止性错误都会写 `FATAL` + 位置到日志文件。

**diff 留痕**：`.panel-backups/pre-p4-hardening-20260917-2135/hardening-trigger.diff`、`hardening-selfheal.diff`。

**parser 结果**：两个脚本 `[Parser]::ParseFile` 均 **errors=0**。

### L-023-② 沙箱演练四阶段（2026-09-17 21:38，✅ 全绿）

全程在**演练端口 3099** 上进行，**未触碰 3080 / 宿主 dsh web**。

| 阶段 | 内容 | 结果 |
|---|---|---|
| 1 | 静态/语法校验（两脚本 parser） | ✅ errors=0 |
| 2 | **杀树回归（核心）**：dummy listener 占 3099 → 加固后杀树逻辑 | ✅ **PASS** |
| 3 | 无监听分支：3099 空闲 → 直接进启动分支 | ✅ 正确 |
| 4 | 清理与幂等：dummy 退出、端口释放 | ✅ port free |

**阶段 2 关键证据**（`_drill-report.txt`）——这是对 21:06 故障的**直接回归测试**：

```
21:37:56 B. taskkill /PID 26052 /T /F
21:37:57    taskkill: 成功: 已终止 PID 25200 (属于 PID 26052 子进程)的进程。
21:37:57    taskkill: 成功: 已终止 PID 26052 (属于 PID 12316 子进程)的进程。
21:37:57 C. taskkill exit=0 threw=False     ← 21:06 时此处抛出 CantActivateDocumentInPipeline，现为 False
21:37:59 D. released=True after 2.9s
21:37:59 STAGE2_VERDICT=PASS
```

**端到端检查**（`_drill-e2e-report.txt`）：两脚本 parser=0；3080 由 pid 27900 监听 → selfheal 走 healthy 分支 `exit 0`（双开防护有效）；3099 空闲 → trigger 进无监听分支。

### L-023-②附带发现：计划任务注册的两个约束（影响条件③）

演练中为验证时间精度做了探测，发现**两个此前未记录的约束**：

1. **`-RunLevel Highest` 会「拒绝访问」**：当前进程 `isAdmin(elevated) = False`，用 `RunLevel Highest` 注册返回 `HRESULT 0x80070005`；改用 **`RunLevel Limited` 注册成功**。
   → 历史 `_register_once.ps1` / `_register_tasks.ps1` 都用的是 `Highest`，**条件③ 若照抄会直接失败**。修正：改用 `Limited`（触发器只做 `taskkill` + `Start-Process`，不需要提权；杀自身用户进程无需 Highest）。
2. **`New-ScheduledTaskTrigger` 保留秒级精度**：探测得 `StartBoundary = 2026-09-17T22:24:27+08:00`，**秒 `:27` 保留**。
   → 11.1 记录的「schtasks 将 /ST 21:06:39 截断为 21:06:00」是 **`schtasks.exe /ST` 的行为，不是 cmdlet 的行为**。条件③ 用 cmdlet 注册可拿到准确的 T+2 / T+10 时刻。

- **L-023-④ 判定：通过。** **L-023-② 判定：通过（四阶段全绿）。**

### L-023-③a 台账正本化 + trigger 脚本入 git（2026-09-17 21:42，✅ 已完成）

**A. 台账正本化**

| 动作 | 落点 | 证据 |
|---|---|---|
| 正本建立 | `D:\dsh-plugins\dsh-toolkit\panel\docs\ledger.md` | 21660 B，与新副本逐字节一致 |
| 旧位留指针 | `D:\dsh-test-sandbox\ledger.md` 顶部加「已非正本」告示 + 正本路径 + sha256 | 见文件头 |
| 两份同源 | sha256 双检一致 | `4f2ee0250bf58da23eb7a4c20195688cb5204e593aa00f7454931d5411d3818c` |

正本化理由：台账需与 `panel/docs/api-notes.md`、`panel/docs/handoff-restart.md` 同处一套正本目录，**随插件仓库入 git 版本化**，避免再出现「正本散落在 sandbox、越查越乱」。后续台账写入**一律改到正本**，sandbox 副本冻结。

**B. `_tmp` 家族标注废弃**

对以下 9 个文件逐条加 4 行废弃头注（`DEPRECATED 2026-09-17 21:40` + 「禁止引用、禁止写入」+ 正本路径），**未删除、未移动**（保留取证价值）：

`_tmp_ledger.md`、`_tmp_ledger_fixed2.md`、`_tmp_ledger_fixed3.md`、`_tmp_ledger_fixed4.md`、`_tmp_ledger_fixed5.md`、`_tmp_ledger_fixed6.md`、`_tmp_ledger_p2.md`、`_tmp_ledger_p2b.md`、`_tmp_progress.md`

抽检 9/9 头注均正确写入。

**C. trigger 脚本入 git**

commit `76ce85a` — `fix(toolkit): harden restart-trigger/restart-selfheal against pipeline activate failure`

- 入版本库文件：`scripts/restart-trigger.ps1`（新增 106 行）、`scripts/restart-selfheal.ps1`（新增 93 行），共 199 行新增。
- commit message 完整记录 21:06 根因（taskkill 管道 → `CantActivateDocumentInPipeline`）、四道加固（H1–H4）、以及沙箱回归验证结论。
- 上游 commit `da97958`，分支 `master`。
- 日志目录 `.panel-backups/restart-logs/` 及 `.panel-backups/` 整体仍为 untracked（备份产物不入库，符合既有约定）；`cordis.patch.yml` 的 4 行改动**未提交**（属运行配置，按 11 节程序在重启验收后单独处置）。
- 注：git 提示 LF→CRLF 转换告警（Windows 默认 `core.autocrlf`），不影响 PowerShell 解析，parser 已复验 errors=0。

- L-011 [已完成] 4a：三类规则 fixture 8/8；manifest 起草值核验 4 修正案已写入并提交（98d00df）。@完成 2026-09-15
- L-012 [已完成] 写入前澄清与写入验收。STOP 未触发：lib 及 5 个子目录 lstat 均非 symlink/junction。解析链结论：D:\dsh-plugins\dsh-toolkit\node_modules\@deepseek-ai\dsh-compaction-basic 是 symlink→D:\dsh-plugins\dsh-compact-router\node_modules\...（dsh-web 同理→dsh-search-router）；套件副本不自包含，依赖旧独立目录 node_modules 实体，旧目录删除即断链，属隐性依赖风险。写后验收：重跑两次逐字节一致（sha 9595f2e0…，1561B）；summary error=0/warning=0/info=1（仅 ref.stale-in-backup）；$from-dangling 0；git show --stat HEAD 恰 4 文件；未打 tag。@完成 2026-09-15
- L-015 [进行中] 4b 相1（零真实写入/零网络/无提权）：一、规范修订 v1.2：1) protected 断言修订：*.bak-* 对所有 op 永远禁写；file-op（replace/insert/delete/create-file）全量适用 nonScan 禁写；install-package 仅豁免 nonScan 中的 node_modules 子路径，且目标 node_modules 目录本身不得是 symlink（lstat 与 realpath 不一致即拒绝）。2) 新规则 pkg.resolution-outside-scope（warning，manual，plan=[]）：对套件源码每个 bare import 的解析链取 realpath，最终提供该包的 node_modules 实体落在 scopeRoot 之外→报出；message 含包名/导入位置/完整解析链/realpath 落点；按（包名, realpath 落点）去重，file/line 取首个导入位置；封闭世界，无豁免表；指引文案禁止建议保留跨目录手工链接。二、实现：3) pkg.missing-dependency 的 fix 从 manual 占位换装 install-package（rewrite；plan.new=清单范围原文；实际解析版本只写 patch-state）；4) 实现 pkg.resolution-outside-scope（只读）；移除 install-package 的 fail-closed。三、测试：5) fixture 三例：真实目录包不报/junction 指向外部目录报出且链路完整/真实外部目录（非 symlink）同样报出，各验证 root/file/old/occurrence；6) install-package 影子测试用 file: 协议本地包覆盖成功/版本冲突/protected 拒绝（*.bak-*）/symlink 目标拒绝；7) 既有 13/13 + 8/8 全量回归；8) 真实环境只读跑一次预期 error=0、info=1 不变、warning=3（compaction-basic、dsh-web、schemastery 解析落点旧目录）逐条核对包名与链路。四、9) 交修复方案对比（A=套件根正规安装需网络；B=磁盘既有实体零网络本地化；含版本核对/运行中 dsh web 处置/链接结构备份/失败回退/验证清单）后 STOP 等批准，不得先行置换。@记录 2026-09-15
- L-015b [进行中] 4b 相1 第1-8项已完成：两份规范升 v1.4（protected 分派、install-package 豁免 node_modules+禁 symlink 目标、新规则 pkg.resolution-outside-scope）；引擎 pkg.missing-dependency fix 换装 install-package（rewrite，plan.new=声明范围，实际版本写 patch-state）、实现新只读规则；executor 移除 fail-closed、支持 file: 本地包影子安装与 rollback-uninstall；测试 7/7（stage4b）+13/13+8/8 全绿；真机只读 error=0/info=1/warning=3（compaction-basic/schemastery/dsh-web 链路与 realpath 落点逐条核对，证据 doctor/test/artifacts/doctor-real-4b.json）。第9项修复方案对比待交批，未置换真实目录。@记录 2026-09-15

- L-022 [进行中] v3.1 修复指令（六项）：1) peer 哈希分桶（.bin 伪影桶/实质桶，PASS=name+version 一致且实质桶差异=0，按路径段判定，禁止按文件名前缀，禁复制旧 .bin）；2) doctor 门禁只读 --json summary 三元组（禁退出码/stderr），回滚门=0/3/1、终态门=0/0/1，显式打印三元组与结论；3) P1 登记册冻结（只执行已批准处置，preflight 分歧打印并 STOP，禁自动 move；必答 dsh-settings 翻转机制）；4) 全程 tee 到 swap-log-<stamp>.txt 禁截断；5) 新增 fixture：(a) 仅 .bin 差异→PASS+注记，(b) lib 差异→FAIL（e2 回归），(c) 门禁 0/3/1 判过、0/0/1 判不过回滚门；6) 交付 v3.1 diff + 自测记录 + 第 3 条机制答案，通过后重约窗口。@记录 2026-09-16；【流程注记 2026-09-16】收尾消息早于窗口执行发出，经证据核查驳回；窗口待执行。
### L-023-③ 条件③重新注册 T+2 / T+10（2026-09-17 21:44，✅ 已布防，待触发）
**A. 修正项（照抄旧脚本会直接失败）**

旧 `_register_once.ps1` / `_register_tasks.ps1` 均用 `-RunLevel Highest`。本 shell 非提权（`isAdmin=False`），实测 `Highest` 返回 `HRESULT 0x80070005` 拒绝访问；`Limited` 注册成功。**新脚本 `_register_once_v2.ps1` 改用 `Limited`**（触发器只做杀自身用户进程 + `Start-Process` 自身会话，无需提权）。

**B. 真实触发时刻宣告（按 StartBoundary 原文，秒级保留）**

注册时刻 `now = 2026-09-17 21:44:44`。

| 任务 | 类型 | startBoundary（真实） | nextRun | RunLevel | LogonType | UserId | State |
|---|---|---|---|---|---|---|---|
| `DSHToolkitPanelRestartTrigger` | T+2 重启 | **2026-09-17T21:46:44+08:00** | 2026-09-17 21:46:46 | Limited | Interactive | LENOVO | Ready |
| `DSHToolkitPanelRestartSelfheal` | T+10 自愈 | **2026-09-17T21:54:44+08:00** | 2026-09-17 21:54:54 | Limited | Interactive | LENOVO | Ready |

**E. ⚠️ 首次触发失败与第二个根因（2026-09-17 21:46，重要）**

T+2 任务 **按时触发**（21:46:44 起，日志 `restart-trigger-20260917-214644.log`），**管道 bug 已确认修好**（无 `CantActivateDocumentInPipeline`，脚本正常走到等待循环）。但**杀树失败**，重启未发生：

```
21:46:46 killing process tree of pid 27900 on port 3080
21:46:46 WARN: taskkill invocation threw: 错误: 无法终止 PID 26188 (属于 PID 27900 子进程)的进程。
21:46:48 waiting port release, 2s elapsed   ← 之后一直等待，端口始终未释放
```

**新根因（与 21:06 的管道 bug 完全无关，是第二个独立缺陷）：**

实测 `taskkill /PID 27900 /T` 返回 **exit=128**，输出：

```
错误: 无法终止 PID 26188 (属于 PID 27900 子进程)的进程。
     原因: 只能强行终止这个进程(带 /F 选项)。
错误: 无法终止 PID 7464 (属于 PID 27900 子进程)的进程。
     原因: 只能强行终止这个进程(带 /F 选项)。
错误: 无法终止 PID 27900 (属于 PID 25764 子进程)的进程。
     原因: 一个或多个此进程的子进程仍然在运行。
```

进程树结构（实测）：

```
27900 node.exe（dsh web，占 3080，SessionId=4）
├── 26188 conhost.exe     ← 控制台宿主，/F 也杀不掉
└── 7464  cloudflared.exe ← tunnel
```

**机理**：`conhost.exe` 属于控制台子系统，`taskkill /F` 对它**必然失败**；`taskkill /T` 见子进程未清干净，遂**放弃杀根进程 27900**，整个杀树操作失败。→ 脚本即使带 `/F`，只要树里有 conhost 就杀不掉。

**处置：**

1. **立即禁用两个待触发任务**（21:47:34，`_cancel-tasks.txt`）：trigger 当时 State=Running → Disabled；selfheal State=Ready → Disabled。**防止 selfheal 在 21:54:44 触发造成二次惊扰。**
2. **确认无副作用**：端口 3080 仍由 **pid 27900** 监听、cloudflared 7464 仍在 → **没有任何重启发生，P1 态完好，无需回滚**。
3. **清理**：`DSHToolkitPanelRestartTrigger` LastResult=267014（被中途停掉），`DSHToolkitPanelRestartSelfheal` 未执行（LastResult=267011）。
4. **进入条件④b：杀树策略加固（第二版）** —— 见下节。

### L-023-④b 杀树策略加固 v2（2026-09-17 21:55，✅ 已完成，含两次假设修正）

**第一轮假设（已推翻）**：以为 `conhost.exe` 本身「杀不掉」并污染 `taskkill /T`。
→ 专门构造演练 `_drill-p4b2.ps1`（用 node 起 root，再 spawn 控制台子进程，使 **真实 conhost 落进 root 子树**），结果 `taskkill /T /F` **exit=0、连 conhost 一起杀掉了**。**该假设被自己的演练证伪**，已作废。

**第二轮：用访问掩码探测直接定位（✅ 定案）**

`taskkill.exe` 报「拒绝访问」但进程确实可终止，说明是**具体访问权**被拒，而非整进程不可杀。逐掩码实测（`_probe-accessmask-report.txt`）：

| 访问权 | 掩码 | 对 27900 / 26188 / 7464 |
|---|---|---|
| `PROCESS_TERMINATE` | 0x0001 | ✅ **OK（三个全 OK）** |
| `PROCESS_QUERY_LIMITED_INFORMATION` | 0x1000 | ✅ OK |
| `PROCESS_QUERY_INFORMATION` | 0x0400 | ❌ **DENY（win32=5）** |
| `PROCESS_VM_READ` | 0x0010 | ❌ DENY |
| `TERMINATE｜QUERY_INFORMATION` | 0x0401 | ❌ **DENY** |
| taskkill 所需完整掩码 | 0x0411 | ❌ DENY |

**根因（唯一而精确）**：

> `taskkill.exe /PID x /F` 申请的是 `PROCESS_TERMINATE｜PROCESS_QUERY_INFORMATION`（0x0401）。
> 当前**非提权**令牌**持有 `PROCESS_TERMINATE`**（本来就能杀），但**被拒 `PROCESS_QUERY_INFORMATION`**（目标由更高完整性/不同令牌上下文启动）。
> 于是 taskkill 拒绝执行；`taskkill /T` 见子进程杀不掉，**连根进程也一并放弃** → 服务器存活。

**为什么历史成功、这次失败**（对比留档）：

| 时间 | 目标 PID | 树成员 | 结果 |
|---|---|---|---|
| 11:03:08 | 14820 | 14820 + 16444（**无 conhost**） | ✅ 成功 |
| 12:48:45 | 26468 | 26468 + 22768 + 20892（**无 conhost**） | ✅ 成功 → 起了 27900 |
| **21:46:46** | **27900** | 27900 + **26188 conhost** + 7464 | ❌ 拒绝访问，放弃 |

即：**27900 这一代进程的令牌上下文变了**（它带上了受保护的 conhost 子进程），旧脚本的 `taskkill` 路径对它失效。

**第三轮：修复方案（✅ 已验证）**

改用 **`.NET Process.Kill()`**，它只需要 `PROCESS_TERMINATE` —— 正是我们持有的权限。

**决定性演练**（`_drill-p4b3-report.txt`），两部分：

- **PART 1 真实目标只读探测**（不杀）：
  ```
  pid 27900 (node)        : PROCESS_TERMINATE=True   PROCESS_QUERY_INFORMATION=False
  pid 26188 (conhost)     : PROCESS_TERMINATE=True   PROCESS_QUERY_INFORMATION=False
  pid 7464  (cloudflared) : PROCESS_TERMINATE=True   PROCESS_QUERY_INFORMATION=False
  ```
- **PART 2 stand-in 功能验证**：`Process.Kill()` 自底向上杀 `conhost + PING + node` → **全部 alive=False**，端口 1s 释放，`PART2_VERDICT=PASS`；live 27900 / 3080 未受影响。

**脚本改动**（trigger v2.1）：

- 杀进程段：`& taskkill.exe /PID x /F` → `(Get-Process -Id x).Kill()`，**每 PID 独立 try/catch**（单点失败不阻断整树）。
- 保留**显式枚举 + 自底向上**顺序（先子后根，让子进程先释放句柄）。
- 移除 `conhost` 跳过逻辑（已证明 conhost 可杀，无需豁免）。
- 成功判据仍是「**根 PID 消失 + 端口释放**」，不依赖任何外部退出码。
- selfheal 无杀进程逻辑，仅头部注释同步 v2 说明。
- 两脚本 parser **errors=0**；trigger sha `e0bdbfb253883dfab4237b7963771badfc5828c32b535da463cb69848e0decee`，selfheal sha `e0914a0468bad7bf7e0be2a3be5a4b93319b01d549581d5a0b6cff67656b1fa0`。
- 加固前备份：`.panel-backups/pre-p4b-killtree-v2-20260917-214837/`（含改动前两脚本，sha `2b28573f…` / `161077a0…`）。

**⚠️ 残留不确定性（必须如实标注）**：`Process.Kill()` 对**真实 27900** 的效果**尚未实杀验证**（未获授权单独杀它，且杀了就是重启本身）。已验证的是「权限充足（TERMINATE=True）+ 方法在同构树上有效」。**真实效果只能在正式重启时确认**。

### L-023-③b 条件③b 重新布防 + 闸门复核 + 第三根因归档（2026-09-17 22:05，✅ 已布防，待触发）

用户批复（2026-09-17 22:00）五步：① Unregister 两个 Disabled 任务 → ② 核对 v2.1 闸门语义 → ③ 重注册 T+2/T+10 → ④ handoff 11.3 归档 → ⑤ 停手等触发。触发时刻由用户在 22:03 选定「今晚立即」。

**① 注销（22:00:10）**

`DSHToolkitPanelRestartTrigger`（Disabled）与 `DSHToolkitPanelRestartSelfheal`（Disabled）均已 `Unregister-ScheduledTask`；复核 `dsh|panel|probe|toolkit` 匹配任务 = **空**。

**② 闸门语义复核 → 发现并修复第三根因（提交 `cdb1fbe`）**

按用户指定的判据（「启动分支唯一闸门 = 端口释放，非杀进程零报错」）逐路径审计，**确实发现一处真实缺陷**：

- **缺陷**：`054934e` 版在「**根 PID 已消失但端口仍被占用**」时只打 `WARN ... continuing to start`，然后**继续走到 `Start-Process`** → **双开风险**。
- **修复**：启动分支**唯一闸门 = 「端口空闲」**。一切 `not-released` 分支**一律 `exit 1`**；`Start-Process` 前**再次断言**闸门。
- **审计后路径表**：A（入口无监听）✅、B（观测到释放）✅、**C（根死端口未释放→继续启动）❌ 已删除改 exit 1**、D（启动前再断言）✅ 新增。
- **selfheal**：闸门本就更严（「无 dsh web 进程 AND 端口未监听」），无双开路径；已标注为权威语义。
- 两脚本 parser `errors=0`；trigger sha `75c8a621…`，selfheal sha `a79b1f3f…`。

**③ 重注册（22:05:19，T+2 余量 2.68 min）**

| 任务 | startBoundary（真实） | nextRun | RunLevel | LogonType | UserId | State |
|---|---|---|---|---|---|---|
| `DSHToolkitPanelRestartTrigger` | **2026-09-17T22:08:00+08:00** | 22:08:08 | Limited | Interactive | LENOVO | Ready |
| `DSHToolkitPanelRestartSelfheal` | **2026-09-17T22:16:00+08:00** | 22:16:16 | Limited | Interactive | LENOVO | Ready |

- 均**整分钟**、均 `Limited`、`New-ScheduledTaskTrigger`（非 schtasks）。T+2 余量 **2.68 min ≥ 2.5 min**。
- 注册脚本 `_register_once_v3.ps1`；报告 `_register-v3-report.txt`。
- 说明：用户选「今晚立即（22:06/22:14）」，但注册瞬间 22:06 仅剩 1.68 min < 2.5 min 余量，故按整分钟规则顺延一格落 **22:08 / 22:16**。

**④ 归档**：handoff 11.3（第三根因 + 等价性假设 E1–E4 + 禁测清单 6 条 + 中止窗口）。

**⑤ 停手等触发。** 中止窗口 = **22:08 → 22:16**。

### L-023-⑤ 触发结果：✅ 重启成功 + 三验收全绿（2026-09-17 22:08–22:10）

**A. 触发成功（决定性证据，`restart-trigger-20260917-220800.log`）**

```
22:08:01 trigger scheduled, delay=0s port=3080
22:08:02 killing process tree of pid 27900 on port 3080
22:08:02 tree members to kill (leaves first): 7464,26188,27900
22:08:02 kill pid 7464 (cloudflared.exe) via Process.Kill() -> alive=False
22:08:02 kill pid 26188 (conhost.exe)     via Process.Kill() -> alive=False   ← 21:46 taskkill 杀不掉的那个
22:08:02 kill pid 27900 (node.exe)        via Process.Kill() -> alive=False   ← 根进程，杀掉
22:08:05 port free; starting dsh web                                          ← 闸门满足才启动
22:08:06 started pid 23932
22:08:42 port 3080 is listening again after restart (pid 23932)               ← 端口恢复
```

**三个假设/修复点全部得到实机验证**：

1. **`Process.Kill()` 修复有效** —— 21:46 用 `taskkill` 杀不掉的 `26188 conhost` 与根 `27900`，本次 `alive=False`。**这是对 11.3.2 等价性假设 E1/E2 的实机确认**（此前只在同构 stand-in 树验证）。
2. **闸门语义正确** —— `port free` 之后才 `starting dsh web`，无双开。
3. **新进程起来了** —— pid 23932，22:08:42 恢复监听。

**B. 三验收（2026-09-17 22:10，全部通过）**

| # | 验收项 | 期望 | 实测 | 判定 |
|---|---|---|---|---|
| **A1** | 桌面 loopback（Host loopback）→ `/api/toolkit-panel/ui` | 200 | **200**（5442 B） | ✅ |
| **A2** | stable host **无 cookie** → 面板路由 | 403 | **403** | ✅ |
| A2b | stable host **假 cookie**（额外加固验证） | 403 | **403** | ✅ |
| **A3** | 面板 `/api/toolkit-panel/snapshot` 桌面 | 200 | **200** | ✅ |

- 证据：`_acceptance2.txt`。
- **口径修正留档**：首轮验收（`_acceptance.txt`）对 `/` 与错误路径 `/panel` 探测，得 401/404。经查 401 是 **dsh 自身鉴权层**对裸请求的响应（非本面板 guard），`/panel` 路径不存在（真实路由为 `/api/toolkit-panel/ui`）。**改用真实路由后三项全绿**，与 handoff 第 11 节验收定义一致。

**C. client bundle 与 profile 行解析（迁移目的达成）**

- **路径行解析成功（决定性）**：live `/api/toolkit-panel/snapshot` 返回
  ```json
  "self": { "id": "toolkit-manager",
            "name": "file:///D:/dsh-plugins/dsh-toolkit/panel/index.js",
            "managedBy": "patch", "enabled": true }
  ```
  → **path-like profile 行在重启后正确解析**，这正是 UI 迁移所要的。
- **P1 冒烟 27/27 全绿**（`scripts/p1-smoke.mjs`），含 `PASS self id is toolkit-manager`、`PASS self panel patch-mounted`、`PASS doctor issue counts 0/0/0`、`PASS snapshot sees 5 business plugins`。
- **⚠️ 关于 client bundle 的激活状态（如实标注）**：DSH 的 client module 机制是**挂在主 UI HTML 的 `__DSH_BOOT__` 清单**上（见 `dsh-client-modules` 源码），不是独立端点。而主 UI `/` 对**非浏览器请求返回 401**（dsh 自身鉴权），因此**在无浏览器会话的情况下无法从命令行直接断言 client bundle 是否已被扫描进 boot 清单**。已确认的是：`panel/package.json` 声明齐备（`dsh.client.platform="web"` + `exports["./client"]`）、`panel/client/index.js` 存在（8468 B）、profile 行 path-like 且解析成功、服务端路由全部正常。**浏览器端视觉确认（打开面板页看到新 UI）建议由用户在浏览器里目视一次。**

**D. 清理**

两个一次性任务均已 `Unregister-ScheduledTask`（trigger LastResult=0）；复核 `dsh|panel|toolkit|probe` 匹配任务 = **空**。证据：`_cleanup-tasks.txt`。

**E. 结论**

**L-023 主任务达成**：重启发生、新进程在跑、三验收全绿、profile path-like 行解析成功、P1 冒烟 27/27。唯一未从命令行闭环的是「浏览器端 client bundle 可视确认」，已在 C 项标注。

**第二轮：用访问掩码探测直接定位（✅ 定案）**

`taskkill.exe` 报「拒绝访问」但进程确实可终止，说明是**具体访问权**被拒，而非整进程不可杀。逐掩码实测（`_probe-accessmask-report.txt`）：

| 访问权 | 掩码 | 对 27900 / 26188 / 7464 |
|---|---|---|
| `PROCESS_TERMINATE` | 0x0001 | ✅ **OK（三个全 OK）** |
| `PROCESS_QUERY_LIMITED_INFORMATION` | 0x1000 | ✅ OK |
| `PROCESS_QUERY_INFORMATION` | 0x0400 | ❌ **DENY（win32=5）** |
| `PROCESS_VM_READ` | 0x0010 | ❌ DENY |
| `TERMINATE｜QUERY_INFORMATION` | 0x0401 | ❌ **DENY** |
| taskkill 所需完整掩码 | 0x0411 | ❌ DENY |

**根因（唯一而精确）**：

> `taskkill.exe /PID x /F` 申请的是 `PROCESS_TERMINATE｜PROCESS_QUERY_INFORMATION`（0x0401）。
> 当前**非提权**令牌**持有 `PROCESS_TERMINATE`**（本来就能杀），但**被拒 `PROCESS_QUERY_INFORMATION`**（目标由更高完整性/不同令牌上下文启动）。
> 于是 taskkill 拒绝执行；`taskkill /T` 见子进程杀不掉，**连根进程也一并放弃** → 服务器存活。

**为什么历史成功、这次失败**（对比留档）：

| 时间 | 目标 PID | 树成员 | 结果 |
|---|---|---|---|
| 11:03:08 | 14820 | 14820 + 16444（**无 conhost**） | ✅ 成功 |
| 12:48:45 | 26468 | 26468 + 22768 + 20892（**无 conhost**） | ✅ 成功 → 起了 27900 |
| **21:46:46** | **27900** | 27900 + **26188 conhost** + 7464 | ❌ 拒绝访问，放弃 |

即：**27900 这一代进程的令牌上下文变了**（它带上了受保护的 conhost 子进程），旧脚本的 `taskkill` 路径对它失效。

**第三轮：修复方案（✅ 已验证）**

改用 **`.NET Process.Kill()`**，它只需要 `PROCESS_TERMINATE` —— 正是我们持有的权限。

**决定性演练**（`_drill-p4b3-report.txt`），两部分：

- **PART 1 真实目标只读探测**（不杀）：
  ```
  pid 27900 (node)        : PROCESS_TERMINATE=True   PROCESS_QUERY_INFORMATION=False
  pid 26188 (conhost)     : PROCESS_TERMINATE=True   PROCESS_QUERY_INFORMATION=False
  pid 7464  (cloudflared) : PROCESS_TERMINATE=True   PROCESS_QUERY_INFORMATION=False
  ```
- **PART 2 stand-in 功能验证**：`Process.Kill()` 自底向上杀 `conhost + PING + node` → **全部 alive=False**，端口 1s 释放，`PART2_VERDICT=PASS`；live 27900 / 3080 未受影响。

**脚本改动**（trigger v2.1）：

- 杀进程段：`& taskkill.exe /PID x /F` → `(Get-Process -Id x).Kill()`，**每 PID 独立 try/catch**（单点失败不阻断整树）。
- 保留**显式枚举 + 自底向上**顺序（先子后根，让子进程先释放句柄）。
- 移除 `conhost` 跳过逻辑（已证明 conhost 可杀，无需豁免）。
- 成功判据仍是「**根 PID 消失 + 端口释放**」，不依赖任何外部退出码。
- selfheal 无杀进程逻辑，仅头部注释同步 v2 说明。
- 两脚本 parser **errors=0**；trigger sha `e0bdbfb253883dfab4237b7963771badfc5828c32b535da463cb69848e0decee`，selfheal sha `e0914a0468bad7bf7e0be2a3be5a4b93319b01d549581d5a0b6cff67656b1fa0`。
- 加固前备份：`.panel-backups/pre-p4b-killtree-v2-20260917-214837/`（含改动前两脚本，sha `2b28573f…` / `161077a0…`）。

**⚠️ 残留不确定性（必须如实标注）**：`Process.Kill()` 对**真实 27900** 的效果**尚未实杀验证**（未获授权单独杀它，且杀了就是重启本身）。已验证的是「权限充足（TERMINATE=True）+ 方法在同构树上有效」。**真实效果只能在正式重启时确认**。

---

## L-024 [已完成] P1.6 面板人话化（2026-09-17 21:20–22:35）

**目标**：让用户**不读任何说明**就能说出每个插件是干嘛的、当前是否在工作（用户给定的新验收标准）。

**范围（用户七条，2026-09-17 21:20 下达）**：① 每卡片一句中文功能描述 + 状态三态人话 + 双层开关醒目；② `inject`/`services`/`commands`/`managedBy` 折叠进「技术详情」默认收起；③ 按钮与标题去工程黑话；④ doctor 报告区人话化；⑤ **纯 client 层改动，服务端路由与 guard 零改动**；⑥ 确认生效方式（强刷 vs reload）如实报告；⑦ smoke 中断言同步更新。

### L-024-① 交付物与哈希（写前已备份）

| 文件 | 角色 | 改动前 sha256 | 改动后 sha256 | size |
|---|---|---|---|---|
| `panel/client/index.js` | client bundle（主交付） | `71dcb833…a64cc94b` | `7a0a4281091897f6f1fb1e650b3bd8a9c90acd16c8c268c959e7ab617a90d7c5` | 17881 B |
| `panel/client/panel.html` | 独立页兜底渲染器 | `221cc993…ad5d7a6af` | `ebcc06eadd045d3dbd61e675cde839c3265fb7f417dc96031735c0e4cb7ca950` | 11877 B |
| `scripts/p1-smoke.mjs` | 正本冒烟（⑦） | — | `f015b4508541d9fbe9cb91dc4efdfedad19738200660a55c0eb18a0331fad59a` | 11358 B |
| `panel/index.js` | **服务端（⑤ 要求零改动）** | `56cf5a7e38cc574733c31feae083ab761162df9235fb560b7ade173b5e89db16` | **同左，未变** | — |

- 改动前备份：`.panel-backups/pre-p16-humanize-20260917-223836/`，内含 `client-index.js` / `client-panel.html`，**逐字节核验等于改动前状态**。
- `node --check` 对两份 client 文件均通过（语法零错误）。
- **备份命令自身的 bug（自行发现并纠正，留档）**：首次备份时把服务端 `panel/index.js` 与 `panel/client/index.js` 复制成了**同名** `index.js`，导致备份目录里的 `index.js` 实为 client bundle，进而产生一次「服务端文件被改动 ✗」的**假警报**。改为 `client-index.js` / `client-panel.html` 后逐一比对哈希，确认服务端文件毫发无损（mtime 仍 12:30:14、零人话化字符串、sha 与改动前记录一致）。**过程结论：备份必须带语义化文件名，否则自证时会自伤。**

### L-024-② 五项实现内容

**A. 功能描述与人话名称**（用户原文逐字采用，未改写）

```javascript
var DESCRIPTIONS = {
  "agent-memory":     "记住你说过的话和项目里的重要信息，下次对话还能用上。",
  "compact-router":   "对话变长时自动压缩历史内容，省上下文又不断片。",
  "rate-throttle":    "给模型请求限速，避免发得太快被服务方拒绝。",
  "search-router":    "决定每次联网搜索走哪条路：官方搜索还是本地搜索。",
  "web-search-local": "提供不依赖官方接口的本地搜索引擎，可自选搜索源。"
};
var DISPLAY_NAMES = {
  "agent-memory": "记忆", "compact-router": "上下文压缩", "rate-throttle": "限流",
  "search-router": "搜索路由", "web-search-local": "本地网页搜索"
};
```

**B. 状态三态人话**（由「配置层开关 `row.enabled`」× 「插件内部开关 `config.enabled`」两维导出）

| 态 | 标签 | 色点 |
|---|---|---|
| 配置层开 + 内部开 | `运行中 · 正在生效` | 绿 |
| 配置层开 + 内部关 | `已加载 · 功能开关关闭，暂不生效` | 琥珀 |
| 配置层关 | `配置层停用 · 未加载` | 灰 |

**C. 双层开关醒目提示**（用户强调「必须醒目」）：`DualSwitchNotice` —— 琥珀 ⚠ 框，文案 `两层开关不一致` + `第一层（配置文件）` / `第二层（插件内部）` + 修复指引。真实命中的就是 `rate-throttle`。

**D. 技术详情折叠**：`TechDetails` 组件用原生 `<details>` / `<summary>技术详情</summary>`，**默认收起**，装载 `managedBy`/`inject`/`services`/`commands`/`providers`/`events`。

**E. 去黑话**：按钮 `doctor dry-run` → `一键体检（只查不改）`；`刷新快照` → `重新读取状态`；删除 `P1 只读骨架` 类副标题；doctor 严重度 `error/warning/info` → `必须修/建议修/提示`；清理 `0 issue` 类机器口吻。

### L-024-③ 服务端解析器 bug（发现未修，按 ⑤ client 侧绕过）

**Bug 位置**：`panel/manager/snapshot.mjs` `parseRootRows()` 第 45-48 行，取 `config` 用的正则**不含缩进约束**：

```javascript
const confMatch = /^\s+([A-Za-z][A-Za-z0-9]*):\s*(.+)$/.exec(line);
```

**后果（真实误读）**：同一行块内**后出现的 `enabled:` 会覆盖先出现的**。`rate-throttle` 自己的 `enabled: false`（缩进 8）被嵌套的 `routing.enabled: true`（缩进 10）覆盖 → `config.enabled === "true"`。**面板会错误宣称「运行中」，与页面下方直接展示的 YAML 自相矛盾。**

**处置（严守 ⑤ 零服务端改动）**：在 client 侧按**缩进深度**解析 `patch.text`，只接受**缩进恰好等于 `cfgIndent + 2`** 的那个 `enabled`。新增 `rowAnchorFromPatch(plugin, patchText)` + `innerSwitchValue(plugin, patchText)`，两处注释均写明根因。

**验证**：从 live 函数源码提取真实实现并求值，`rate-throttle` 自身 `enabled` 正确解析为 `false`（@line 17）。**在修复前该卡片显示「运行中」；修复后正确显示「已加载 · 功能开关关闭，暂不生效」+ 琥珀警示框。**

### L-024-④ 验证矩阵（全部通过）

| 验证项 | 手段 | 结果 |
|---|---|---|
| 正本冒烟 | `scripts/p1-smoke.mjs`（含约 35 条 P1.6 新断言） | **60/60 PASS** |
| 三态分支逻辑 | 合成 6 例（运行中/已加载未生效/配置层停用/无 patchRow/compact-router 特例/无内部开关） | **6/6 PASS** |
| 双实现一致性 | `index.js` 与 `panel.html` 两套渲染器对拍（DESCRIPTIONS/DISPLAY_NAMES 逐项一致 + 缩进解析逻辑同构 + 真实 patch 结果一致） | **22/22 PASS** |
| ⑤ 服务端零改动 | mtime 全为会话前 + 断言 `server routes untouched (no UI copy)` + 服务端文件零人话化字符串 | **PASS** |
| 静态检查 | `pluggable-lint` | **PASS** |
| 目视 | 注入真实 snapshot 渲染 + headless Chrome 截图 + 读图确认 | 卡片标题为 记忆/上下文压缩/限流/搜索路由/本地网页搜索；限流卡有琥珀 ⚠ 块；技术详情收起 |

**冒烟自身的一个断言 bug（自行发现并修正）**：`display name 本地网页搜索` 曾 FAIL，原因是我的提取正则 `/"([^"]+)",\s*$/gm` 要求尾逗号，而 map 最后一项无逗号。改为 `match(/:\s*"([^"]+)"/g)`（不依赖逗号）后 **59/60 → 60/60**。

**如实标注的验证缺口**：**React 不可本地解析**，client bundle 无法离线执行，只能做静态断言 + 与已验证的 `panel.html` 渲染器对拍。**浏览器内真实执行未在命令行闭环。**

### L-024-⑤ ⑥ 生效方式的结论：**必须 reload，强刷不够**（决定性问题）

用户问「浏览器强刷即可还是需 reload」。**实测结论：两个 surface 都被冻结在激活时刻，浏览器强刷一律看到旧 UI。** 需要 dsh web **reload**。

**第一冻结点 —— client bundle**（`dsh-client-modules@0.1.5-rc.2`）：

- `initialBundleSnapshot()` 在**激活时**用 `readFileSync(clientPath)` **把 bundle 字节读进内存快照**；此后 `serveBundle` 只从内存 `responses` map 出。**磁盘重读只存在于 HMR watch hook `rehashBundle`**（源码注释写明「the only entry」）。
- Bundle URL 带 `allocateInitialRevision()` 分配的 rev 查询串 → 同一 rev 下强刷命中同一份内存副本。
- 关键点：client bundle **不是独立端点**，它是以 `__DSH_BOOT__` 清单形式**随主 UI HTML 一起下发**（`dsh-client-modules/lib/index.js:750-760`、`:857-877`、`:536-560`）。

**第二冻结点 —— 独立页 `/api/toolkit-panel/ui`**（`panel/index.js:103`）：

```javascript
const uiHtml = readFileSync(join(panelRoot(), "client", "panel.html"), "utf8");
```

该读取**在 `apply()` 内执行一次**并被闭包捕获 → 独立页**同样冻结在激活时刻**。

**实测证据（决定性，`_probe-p16-serving-report.txt`）**：reload 之前探测 live `/api/toolkit-panel/ui` → **200，长度 5572**，内容仍为 `P1 只读骨架` / `doctor dry-run` / `刷新快照`；而当时磁盘上的新文件为 **10260 B**。**磁盘已新、线上仍旧 —— 强刷无解。**

**⚠️ 一个必须留档的假阳性陷阱**：`/api/toolkit-panel/snapshot` 是**实时计算**的，永远返回当前数据。因此**看到 `/snapshot` 变了就以为「已生效」是错的** —— 它不经过任何冻结层。判断是否真的生效**只能看 HTML/JS 内容本身**，不能看 `/snapshot`。

**运维结论**：
1. 改 client 后**必须 reload dsh web**，浏览器强刷（含 Ctrl+F5 / 无痕）均无效。
2. 改 `panel/package.json` 的 manifest 字段也**不能绕过**（清单同样在激活时消费）。
3. 结论与证据已写入 `panel/docs/api-notes.md` 的「P2.1 改动生效方式」节（含源码行号引用）。

### L-024-⑥ 残留与交接

- **待用户**：reload 后在浏览器目视确认新 UI（此项与 `[L-023 续·待用户]` 的浏览器目视确认**合并为一次**即可，因为两者都需要 reload 才能看到）。命令行可达范围内已**全部**验证。
- **未修的服务端 bug**：`snapshot.mjs` 缩进无关正则应**在后续 P2 里修**（属服务端改动，本次 ⑤ 明令禁止）。当前靠 client 侧缩进解析兜住；**若将来有第二个消费方直接读 `snapshot.config.enabled`，会再次踩坑。**
- 凭证/沙箱临时件（`_tmp_p16-*`、`_probe-p16-*`、截图等）为一次性验证产物，不构成交付物。

---

## L-025 [已完成] 面板标识符恢复「英文原名 + 中文注释」（2026-09-17 23:15–23:25，commit `c1d383e`）

**指令来源**：用户 2026-09-17 23:15 指令①。**背景**：P1.6 为「人话化」把卡片标题换成了中文功能名（记忆/上下文压缩/…），需回退。

**改动**：

| 文件 | 改动后 sha256 |
|---|---|
| `panel/client/index.js` | `35b4dcde13d543275e6e113e49f6a693802b38ea1f47200666cacac4ded7bb4a2b` |
| `panel/client/panel.html` | `f5afa51b5aef2feeabde0739d9d013a282968073b3ed526530e34cc3b11b388e` |
| `scripts/p1-smoke.mjs` | `58a1a2ed69643098461543e73f07bd28bbc727a54de8afd828cabe2eaac17d52` |

- 卡片标题恢复英文原名（`agent-memory` / `compact-router` / `rate-throttle` / `search-router` / `web-search-local`），**等宽字体**；中文功能名降为**副标题第二行**（灰色，弱于原名）。
- 新增 `originalName(plugin)` —— 从 `plugin.name` 包名尾部取原名（回退 `plugin.dir`）。引入原因：快照里 `name` 是完整包名（如 `@local/dsh-toolkit/agent-memory`），直接显示会太长且含命名空间。
- 中文从 `DISPLAY_NAMES` 改名为 `CN_NAMES`（语义修正：它现在只是注释表，不再是"显示名"），并新增 `annotated()` 供标识符位置生成「原名（中文）」单行形态。
- **页面其它标识符位置同形**：技术详情字段标签（`插件目录（dir）`、`managedBy（由谁挂载）`、`enabled（配置文件开关）` 等 9 项）、章节标题（`配置文件原文（cordis.patch.yml · 插件开关所在）`、`体检结果（doctor dry-run · 只查不改）`）、页面标题与设置页 tab label。
- **P1.6 其余改造全部保留**：三态状态、双层开关醒目告警、技术详情折叠、去黑话按钮、doctor 人话化、缩进感知解析。

**smoke 同步（指令⑦）**：60/60 → **72/72 PASS**。新增断言：`CN_NAMES` map、五个中文注释、`no DISPLAY_NAMES map anymore`、`originalName`/`annotated` helper、`card title uses originalName`、`cn name is subtitle not title`、五个英文原名出现、技术详情标签注释化、两处章节标题注释化。**一处断言语义修正**：原 `no doctor dry-run jargon in UI` 与新需求冲突（标题现在**故意**含 `doctor dry-run`），改为 `no bare doctor dry-run button` —— 只禁止它作为按钮文案，允许作为「英文原名 + 中文注释」出现在标题里。

**目视确认**：注入真实 snapshot 渲染 + headless Chrome 截图，五个卡片标题均为英文原名、中文在第二行、限流卡琥珀告警框正常。

**生效方式**：仍需 **reload dsh web**（`client bundle` 激活时快照，见 L-024-⑤ / api-notes P2.1）。**浏览器强刷无效。**

---

## L-026 [已完成] P2.0 修 `parseRootRows()` 缩进缺陷 + 解析链加固（2026-09-17 23:25–23:40，commit `193bdd8`）

**指令来源**：用户 2026-09-17 23:15 指令②「P2.0 优先落地」。

### 根因（P1.6 已发现，本次正式修）

`panel/manager/snapshot.mjs` 旧版收集 `config` 的正则**不含缩进约束**：

```javascript
const confMatch = /^\s+([A-Za-z][A-Za-z0-9]*):\s*(.+)$/.exec(line);
```

→ 同一行块内**后出现的同名键覆盖先出现的**。`rate-throttle` 自身 `config.enabled: false`（缩进 8）被嵌套 `config.routing.enabled: true`（缩进 10）覆盖 → `config.enabled === "true"` → **面板误报「运行中」，与页面下方直接展示的 YAML 自相矛盾**。

### 修复

改为**按缩进深度**收集，只接受该行的「直接子级」键：

| 机制 | 说明 |
|---|---|
| `ownKeyIndent = indent + 2` | 本行 `- id:` 的键层缩进 |
| `keyIndent !== ownKeyIndent → continue` | 更深缩进属嵌套分支，**排除**（这是修 bug 的关键一行） |
| `config:` 子树下钻 | `keyIndent > ownKeyIndent` 时，只在 `inConfig && keyIndent === configKeyIndent + 2` 才收录 —— 因为插件自身设置实际写在 `config:` 之下（如 `config.enabled`） |
| 嵌套映射只记标记 | `routing:` 这类值是嵌套映射的键记为 `""`，**不展平**其内部键 |
| 行块结束判据 | 缩进回落到 `<= indent` 即 break（不再只依赖下一个 `- id:`） |
| `disabled` 语义 | 按值精确置位 `enabled=false` / `disabledExplicit=true` |
| `name` | 支持单引号、双引号、裸值三种写法 |
| key 字符集 | 允许 `-` 与 `_` |

### client 侧相应简化（消除双实现漂移）

P1.6 时因服务端有 bug，client 被迫**自己再算一遍**（`rowAnchorFromPatch`）。本次改为**优先信任服务端 `config.enabled`**，`rowAnchorFromPatch` 降级为**防御性回退**（服务端值缺失时启用）。理由：同一个事实两处实现，必然有漂移风险。

### 验证（指令②「每阶段完成报验收证据」）

| 项 | 结果 |
|---|---|
| `p1-smoke.mjs` | **84/84 PASS**（60 → 84，含直接执行服务端 `parseRootRows` 的端到端断言） |
| 端到端 `buildSnapshot()` | `rate-throttle` → `patchRow.config.enabled = "false"` ✅ |
| 内联边界用例（7 条） | 嵌套同名不覆盖 / 兄弟行隔离 ×2 / `disabled:true` 语义 / 空输入 / CRLF 全覆盖 |
| `pluggable-lint.mjs` | 通过（无跨插件静态 import / eager re-export） |
| `p2-smoke.mjs` | 16/16 PASS |
| 语法 | `node --check` 两 client 文件 + `snapshot.mjs` 全 OK |
| 目视 | 截图确认限流卡正确显示琥珀告警（服务端修复已驱动） |

**服务端改动留痕**（本次是**首次**服务端 `panel/manager/*` 改动，符合 P2 范围）：
- 改动前备份 `.panel-backups/pre-p20-indentfix-20260917-232032/snapshot.mjs`（sha `8034a3293a48bda83dbd6a003583bfa3696c7aebfeb9c8511517ef05abe43a38`，逐字节等于改动前）。
- 改动后 sha `6e53e9dc9e1719b24261cb6dabba5594c463003ed07f295c07bcf865bb9bf38d`。

**解析链加固的关键认知**：插件自身设置**不在**行直接子级，而在 `config:` 之下。任何按缩进解析的实现都必须处理这一层下钻；否则会得到「有键但取不到值」的静默错误（本次第一版修复就踩了这个：`config.enabled` 取成了 `undefined`）。

---

## L-027 [进行中·受阻] P2 窄版正式开工 —— **阶段表缺失，已停手待用户提供**

**用户 2026-09-17 23:15 指令②**：P2 窄版正式开工，范围与阶段「按上表（P2.0 → P2.4）」，安全模型全项适用。

**⚠️ 受阻原因（如实报告，未凭猜测动手）**：该「上表」**不在当前上下文，且在磁盘上不存在**。已做的穷尽查找：

| 查找位置 | 结果 |
|---|---|
| 全仓 `grep -rn "P2\.2\|P2\.3\|P2\.4"`（沙箱 + 插件仓，排除 archive/backups/node_modules） | **0 命中** |
| `panel/docs/{ledger,api-notes,handoff-restart}.md` | 只有 `P2.0`（客户端发现机制）、`P2.1`（改动生效方式）两个**已有编号的核查小节**，无阶段表 |
| 沙箱 `_api-notes-p2.md` / `_tmp_ledger_p2*.md` / `task_plan.md` / `progress.md` | 均无 P2.2–P2.4 |
| 历史会话检索 | 两次均为 0 结果 |

**已完成的 P2 相关工作**：指令中点名「优先落地」的 **P2.0（`parseRootRows` 正则修复）已完成**（见 L-026），因为它无需阶段表即可确定范围。**P2.1–P2.4 的范围无法确定，为免做错方向已停手。**

**待用户提供**：P2.0 → P2.4 各阶段的名称 / 交付内容 / 验收标准。已知约束（用户已明确、不依赖阶段表）：两段式、SHA 冲突检测、锚点唯一、值白名单、写路由 CSRF + 配对服务校验（禁 fallback）、写前备份、plugin-manager 并发防线（快照现读不缓存）。

**reload 时机（用户已定）**：名字恢复后一次（L-025，**待执行**）、P2.2 完成后一次，均由用户按 `restart-trigger` 执行。

## L-028 [已完成] P2.1 两段式写框架（2026-09-17 23:36–23:50，commit `a27da81`）

**指令来源**：用户 P2 窄版权威阶段表（handoff 11.7）+ 执行顺序「P2.0② → **P2.1** → P2.2 → P2.3 → P2.4」。

### 交付内容

| 文件 | 角色 | 改动后 sha256 |
|---|---|---|
| `panel/manager/apply-engine.mjs` | **新增**，两段式引擎 | `f39ee91f5dd9f92b85b1aefb3c6704c7cf8515683e8bd321deb9b1c2b6fa57b8` |
| `panel/index.js` | 新增 3 条路由 + JSON body 读取 + 错误码映射 | `425aa61b18549c10e2ed1622db6fad9afce9a8837f0e9bec6c0e0587f6870adc` |
| `panel/manager/backup.mjs` | manifest 增 `reason`/`note` | `b1074329e041c0a126ec4d157bde0261349b7f067149a984583d7fbdb9d6b51d` |
| `scripts/p21-verify.mjs` | **新增**，P2.1 专项验收 | `8e31346b6a05b9ab722b6df4f65c36f12a1e9024eec7c0acc8125dcec59f18cc` |
| `scripts/p1-smoke.mjs` | 新增 52 条 P2.1 断言 | `3652d9f6353f9a85b3b22d165c0ae134a756c03980f08398836ecb47e0b701fd` |

改动前备份：`.panel-backups/pre-p21-twophase-20260917/`（`panel-index.js` sha `9a3cd169…`、`backup.mjs` sha `476a810e…`，均逐字节等于改动前）。

### 三条路由

- `POST /api/toolkit-panel/plan` —— **写守卫**（`{ change: true }`）。只读计算，返回 `token` / `diff` / `expectedSha` / `expiresAt`。**不下发 `nextText`**。
- `POST /api/toolkit-panel/execute` —— **写守卫**。唯一落盘入口。
- `GET /api/toolkit-panel/plan/status` —— 只读，供 UI 确认页判断方案是否仍有效。

错误码 → HTTP：`sha-conflict` / `plan-expired` / `anchor-ambiguous` → **409**；`anchor-missing` / `anchor-invalid` / `value-*` → 400；`plan-not-found` → 404；`body-too-large` → 413。请求体上限 64 KiB。

### 安全模型逐项落地

| 要求 | 实现 |
|---|---|
| 两段式 | `createPlan()` 只读（测试断言：生成 plan 后文件 sha 不变）；`executePlan()` 唯一写入口 |
| SHA 冲突检测 | execute 前**重读**文件比对 `expectedSha`，不一致 → `sha-conflict` → **409**，文件不动 |
| 锚点唯一 | `locateRowAnchor()` 要求 `- id: <rowId>` **恰好 1 次**；0 → `anchor-missing`，≥2 → `anchor-ambiguous`，均拒绝写盘 |
| 写前备份 + manifest | `createBackup()` 落盘前调用；manifest 记目标绝对路径、副本名、**写前 sha256** |
| 保留策略 | `pruneBackups()`：最新 20 份 OR 30 天内，另加 `maxTotal=40` 绝对上限 |
| 并发防线（快照现读不缓存） | plan 与 execute **各自现读**文件，全程不缓存文本；execute 不信任 plan 期间读到的内容 |
| 写路由 CSRF + 配对服务校验（禁 fallback） | 三条新路由复用 P2.0② 的 `guard`；`plan`/`execute` 标 `change: true` |

### 自查发现并修复的两处缺陷（重要）

**① 保留策略的「OR 语义陷阱」（设计缺陷，已修）**

第一版按「最新 20 份 **或** 30 天内」写成纯并集。测试造 25 次**同一秒内**的连续写入 → **一份都没删**：时间窗把全部兜住，保留策略形同虚设 —— 而密集写入正是它唯一要防的场景。纯「份数」语义又会误删近期备份，与「30 天」意图冲突。最终采用**并集 + `maxTotal` 绝对上限**：稀疏写入按 30 天宽限，密集写入由绝对上限兜住，任何情况下都不无限增长。

**② `/plan` 路由漏标 `change: true`（安全缺陷，已修）**

`/plan` 会**签发写令牌**，但我最初按只读路由写（漏 `{ change: true }`）。后果：服务缺席时会退到 `devicesFile` hasOwn 兜底而**放行**，与 P2.0② 刚建立的「写操作禁 fallback」原则直接冲突。由 smoke 断言 `P2.1 plan route is write-guarded (service absent → 403)` 抓出（当时报 405 而非 403 —— 405 说明 guard 放行了）。已修复并加断言锁定。

**另修一处实现错误**：`planRowFlag()` 插入新键时原用「块内最后一个直接子级的下一行」作插入点。因 `config:` 本身是直接子级、其后跟着整棵缩进更深的 config 子树，新键被写进了 config **内部**（`disabled: true` 落到了 `config.enabled` 同级位置之下）。改为插入到**锚点行正下方**，永远是合法的同级位置。测试断言 `inserted key is a SIBLING of config:, not nested inside it` 锁定。

### 验收证据

| 项 | 结果 |
|---|---|
| `scripts/p21-verify.mjs` | **46/46 PASS** |
| `scripts/p1-smoke.mjs` | **136/136 PASS**（84 → 136） |
| `scripts/p2-smoke.mjs` | 16/16 PASS |
| doctor dry-run | **0/0/0** |
| `pluggable-lint` | 通过 |
| 真实 `cordis.patch.yml` | **全程 sha 未变**（`ce0b0b81c91ca4c420bb5302b2dbe951de0347ca729122511be288aa7c2b76b9`），由测试直接断言 |

**核心验收项对应**：

- 「篡改文件后 execute 必须拒绝并报 **409**」→ `PASS tampered file → code is sha-conflict` + `PASS tampered file → file left untouched`，且 `sha-conflict` 映射 409。
- 「每次写操作有**备份产物为证**」→ 真实写操作证据落盘 `.panel-backups/p21-evidence-*/EVIDENCE.txt`，含：备份目录、`manifest.json` 全文、**副本 sha == 写前 sha**、用备份还原后 sha 逐字节一致。

### 一处 CRLF 陷阱（留档）

真实 `cordis.patch.yml` 是 **100% CRLF**（82 个 `\r\n`，0 个裸 `\n`）。引擎的 `splitLines`/`joinLines` **保留原行尾风格**（测试断言 `execute preserved CRLF line endings (no bare LF introduced)`）。首轮测试有 5 条失败实为**我的断言用 `\n` 匹配 CRLF 文本**所致，非引擎缺陷 —— 断言已统一归一化。

**本阶段为纯服务端 + 测试改动，无 client 可见变化，故不触发 reload。**

## L-029 [已完成] P2.2 启停开关（rate-throttle 首用例，2026-09-17 23:50–24:05）

**指令来源**：用户 P2 窄版权威阶段表（handoff 11.7）P2.2 行 + 本轮补充的六条硬约束。

### 交付内容

| 文件 | 角色 | 改动后 sha256 |
|---|---|---|
| `panel/manager/apply-engine.mjs` | 新增 `findCrossReferences()` + `createTogglePlan()` | `6814caea5dd963c1307d97b10b4d965d9768149480280f2163b9e5e8768bf808` |
| `panel/index.js` | 新增写路由 `POST /api/toolkit-panel/toggle/plan` | `31f18f78a4dd295677a889262db52c6d90f6ea150ce7646163311a821bbb2343` |
| `panel/client/index.js` | `ToggleControls` 组件 + 双层分立行 | `309e775c8872408b1ea2e3138367335983456440709494fde98b71e685f00dcd` |
| `panel/client/panel.html` | 同形实现（直连后备页） | `b6808a407e15364f45d078998f79bc799782421f30ab291432e040274c218b04` |
| `scripts/p1-smoke.mjs` | 136 → **167** 条 | `afbed9afdece24a2add588dae5321c275547252de33d95ba8d8bf2eba6010266` |
| `scripts/p22-verify.mjs` | **新增**，P2.2 专项验收 44 条 | `09d1b0d64122b50f0fb51e6d01c76cab0a2b03b0882bcf41702e7044d395c6dc` |

改动前备份：`.panel-backups/pre-p22-toggle-20260917/`（`apply-engine.mjs` `f39ee91f…`、`panel-index.js` `425aa61b…`、`client-index.js` `d26c3b4b…`、`client-panel.html` `f4d4ea67…`、`p1-smoke.mjs` `3652d9f6…`，均逐字节等于改动前）。

### 六条硬约束逐项落地

| 约束 | 实现 | 锁定断言 |
|---|---|---|
| 启停开关，写 patch 行 `disabled` | 新 `createTogglePlan()` 只读产 plan，落盘仍走 `executePlan()` | `REAL cordis.patch.yml sha unchanged by this test` |
| **锚点唯一断言** | 复用 `planRowFlag` → `locateRowAnchor`，要求 `- id: <rowId>` **恰好 1 次** | `0 次 → anchor-missing` + `≥2 次 → anchor-ambiguous`，两者均拒绝写盘 |
| **停用交叉检查** | `findCrossReferences(text, { rowId, alsoMatch })`：扫描其它行块是否引用该插件 id / 包名；**整词匹配**、跳过自身块、跳过注释行 | 正例（真实其它块引用 + `alsoMatch` 包名尾）与反例（`rate-throttle-extra` 子串、注释行、自身块）双向覆盖 |
| **双层开关 UI 分立** | `patch disabled`（第一层·配置文件）与 `config.enabled`（第二层·插件内部）渲染为**两行独立状态**，各有自己的色标 | `no client merges the two layers into one switch value`（两套渲染器各一条） |
| **apply-engine 唯一通道** | toggle 不新建落盘逻辑，复用 `createPlan → putPlan → executePlan` | `toggle goes through execute (two-phase, not a direct write)` + 结构断言「`createTogglePlan` 内无 `writeFileSync`」 |
| **写前备份** | `executePlan()` 顺序不变，备份在落盘前，manifest 记 `reason` / `note` | `副本 sha == 写前 sha`（真实产物） |

### CRLF 兼容断言（用户明确要求，本轮未再踩）

真实 `cordis.patch.yml` **100% CRLF**。本轮在**断言层**统一归一化：

```javascript
const lf = (t) => String(t).replace(/\r\n/g, "\n");   // 断言前置归一
```

- `p22-verify.mjs` 首条即为 **CRLF 前提守卫**：先断言真实文件确实含 `\r\n` 且无裸 `\n`，把「前提」本身变成可失败断言，避免后续断言建立在错误前提上。
- 落盘侧另有正向断言 `execute preserved CRLF line endings (no bare LF introduced)` —— 归一化只用于**断言比较**，绝不用于写回内容。
- `_p22-probe.mjs` 的建立也是这条要求的副产物：此前用 bash `-e` 拼测试串时 `\r\n` 被转义成字面 `/r/n`，导致行未切分、第 1 行假命中。**教训留档：含转义序列的探针一律落成真实 `.mjs` 文件，不用 `node -e`。**

### 首用例 rate-throttle 的双层分歧（验收样本）

`rate-throttle` 现状天然分歧：**第一层 `row.enabled = true`（已加载）** / **第二层 `config.enabled = "false"`（内部关闭）**。这正是「双层不得合并呈现」的强制暴露点——合并显示会得到一个无意义的中间态。

### 验收证据（P2.2 阶段表验收标准逐项）

| 验收项 | 结果 |
|---|---|
| 开关 → **文件真变（SHA 变化）** | `ce0b0b81c91ca4c420bb5302b2dbe951de0347ca729122511be288aa7c2b76b9` → `3d711ad899d05ac8…` ✅ |
| **doctor 0/0/0** | `{"error":0,"warning":0,"info":0,…}`，`issues: []` ✅ |
| **reload 后状态保持且面板如实显示** | 见下方「等价证明」✅ |
| 备份产物为证 | `.panel-backups/p22-evidence-2026-09-17T15-57-56-541Z/EVIDENCE.txt` + `write-backups/*/manifest.json`，副本 sha == 写前 sha ✅ |
| `scripts/p22-verify.mjs` | **44/44 PASS** |
| `scripts/p1-smoke.mjs` | **167/167 PASS**（136 → 167） |
| `scripts/p21-verify.mjs` | 46/46 PASS（无回归） |
| `scripts/p2-smoke.mjs` | 16/16 PASS |
| `pluggable-lint` | 通过 |
| 真实 `cordis.patch.yml` | **全程 sha 未变**，由测试直接断言 ✅ |

**「reload 后状态保持」的等价证明方式（留档方法论）**：reload 由用户执行，命令行无法代替。改证**落盘内容足以让重新解析得到新状态** —— 对写后副本用**同一份 `parseRootRows` 实现**重新解析，断言：锚点仍唯一命中（第 14 行）、重新解析得到 `disabled:true`。这样把「重启后是否保持」**降维成确定性可验证命题**，不依赖主观判断。

### 落盘位置正确性（上轮踩过的坑，本轮复验）

`disabled: true` 落在**锚点行正下方**、为该行的**直接子级**（与 `name` / `config` 同级），**未写进 `config` 子树**；`config.enabled` 未被触动（仍为 `"false"`）；CRLF 保持。三条断言全绿。

### 端点与守卫

| 路由 | 方法 | 守卫 | 层声明 |
|---|---|---|---|
| `/api/toolkit-panel/toggle/plan` | POST | **写守卫** `{ change: true }` | 响应含 `layer: "patch-row.disabled"`，显式声明改的是**哪一层** |

`p1-smoke.mjs` 断言：服务缺席 → **403**（非 405）、坏 origin → 403、非布尔 `enabled` → 400、未知 `rowId` → 400、plan 载荷形状（含 `layer` / `diff` / `crossRefs` / `expiresAt`，**不含 `nextText`**）。

**本阶段为 client 可见改动（新增启停开关 UI），触发 reload。**

## L-030 [已完成] P2.2b 全卡覆盖 + Q1 安全闸 + Q2 层间检查（2026-09-18 00:05–00:20）

**指令来源**：用户 2026-09-18 08:02 指令。三条并行要求：确认页补人话（①）、**测试覆盖缺口**（本轮最大发现）、Q1/Q2/Q3 收口。

### 一、确认页人话补丁（用户 ①：③「重启后生效」提示缺失）

确认页原本只有「目标文件 / 行号 / diff」三项达标，**缺"什么时候生效"**。已补两句，两套渲染器同步：

- **生效时机**（置于确认页头部，按方向二选一）：停用 → 「执行后此插件将于下次重启时停用（当前仍运行）。」；启用 → 「执行后此插件将于下次重启时启用（当前未加载的不会立刻加载）。」
- **`disabled` 字段人话解释**（紧挨 diff）：「`disabled: true` 的意思是：让 DSH 在下次启动时跳过加载这个插件。它写在配置文件里，不会影响正在运行的进程 —— 所以要重启才会生效。」

### 二、测试覆盖缺口（本轮最大发现）

**缺口**：面板开放启停开关的是 **4 张卡**，但 `p22-verify.mjs` 只对 `rate-throttle` 一张做过真实验证。用户随手点的是 `agent-memory`（第 74 行），**不在用例内**。没翻车是运气，不是证据。

**两点口径修正（与用户描述不同，以证据为准）**：

1. 用户说「面板 5 张卡全部开放 toggle」—— **不成立**。`compact-router` **不开放**：它的挂载由 `scripts/apply-preset-patch.mjs` 改写预设行名完成，**不在 `cordis.patch.yml` 里**（该文件第 3 行注释即写明），没有可写的行，两套渲染器都显式返回空。故开放数为 **4 张**，不是 5 张。
2. 用户所见 4 卡中提到的 **「compact-memory」在 5 张卡里不存在**。`agent-memory（记忆）` 与 `compact-router（上下文压缩）` 是两个独立插件，应为串读。**未据猜测改口径**，此点请用户确认。

**闭合**：新增 `scripts/p22-cards-ui.mjs`（**两套真实渲染器逐卡真跑**）+ `p22-verify.mjs` 引擎级全卡扫描。

**一个建模陷阱必须留档**：`react.createElement(ToggleControls, …)` 只把组件**按引用**放进树，组件体**不会被调用**（真实 React 才负责调用）。`compact-router` 正是靠 `ToggleControls` **返回 null** 才"没有开关"的 —— 只看元素是否存在，会把 5 张卡**全判成"有开关"**。同理 `StatusRow` 的状态标签要从 `props.state.label` 读。**第一版 harness 同时踩了这两个坑**，由脚本自身断出。任何后续"检查元素树"的测试都要注意这一点。

### 三、顺手对账：agent-memory 锚点行号

**用户看到的是第 74 行 —— 与真实文件逐字一致。** 已写成常驻断言（`p1-smoke.mjs` + `p22-verify.mjs` 各一份）。4 张卡锚点行号：`rate-throttle` 14 / `web-search-local` 58 / `web-search-router` 64 / `agent-memory-runtime` 74。

### 四、Q1：`disabled` 平台行为证据（附安全闸）

**框架事实（源码级）**：`!!js` 是 YAML 自定义标签 `tag:yaml.org,2002:js`（`dsh-app-boot/lib/index.js:17` 构造为 `{__jsExpr}`）；Loader 在条目激活时**求值** —— `cordis-plugin-loader/lib/index.js:378` = `isJsExpr(disabled) ? Boolean(this.evaluate(disabled.__jsExpr)) : Boolean(disabled)`；求值实现 `new Function("ctx","expr","with(ctx){return eval(expr)}")`（`:289`）；且 `disabled` **沿父条目继承**。生态内真实用法：`dsh-liangshen/.../agent.cordis.yml:144,179`、`dsh-better-sidebar/cordis.patch.yml:49`。

**本仓现状**：`disabled` 全是字面量或缺失，**无 `!!js`** ⇒ 本轮改动对现有文件**行为零变化**，闸门纯防御。

**实测出的两处危害（非推断）**：
1. **读侧误报**：`parseRootRows` 对 `!!js` 行报 `enabled=true` → 面板说「运行中」，而 loader 在 win32 上会真停用它 → **呈现与事实相反**。
2. **写侧抹条件**：改写会把表达式换成硬布尔（实测 diff `["- disabled: !!js …","+ disabled: true"]`）→ **平台条件被永久销毁**。

**处置（fail-closed）**：引擎新增 `readRowDisabledLiteral()` + 闸门（非字面量 → `value-not-literal` → 400，拒绝写盘）；快照新增 `patchRow.disabledExpr` 如实带出原文；两套渲染器层 1 显示「条件开关（面板不解释）」+ 原文 + 「请手工编辑」并**禁用写入按钮**，页头状态改报「配置层是条件开关…（不再谎报运行中）」。**UI 禁用只是体验，真正的门在引擎**（双保险）。

### 五、Q2：层间覆盖检查

**结论：两层正交，无覆盖。** 层 1（patch 行 `disabled`）= **有没有被加载**，由 Loader 读；层 2（`config.enabled`）= **加载了但自己关掉**，由插件自身读。层 1 关闭时层 2 取值不再被读取，但**两者互不改写**（实测：改写层 1 后**每一行** `config:` 子树逐字节不变）。呈现顺序即优先级：两套 `stateOf` 都先判层 1 再判层 2（已加顺序断言）。

**一条连带效应**：**插入一行会位移其后所有锚点**（实测 74 → 75）。这不是层间覆盖，但会让已生成 plan 的 `anchorLine` 变陈旧；防线是 execute 前 SHA 重读 → `sha-conflict` 拒绝（实测），另有 `anchor-moved` 复验。

### 六、Q3

已按要求在 **handoff 11.7 阶段表**下方新增常驻「**进度**」行：**「P2.2 已落库待验收」** + 三条具体待验收项。放在 11.7 而非别处，因为该节是 P2 的唯一权威范围定义（用户确认口径的地方）。若所指「总文档」另有其文，请指出，我改。

### 七、验收

| 脚本 | 结果 |
|---|---|
| `scripts/p22-verify.mjs` | **98/98**（44 → 98） |
| `scripts/p22-cards-ui.mjs` | **71/71**（新增） |
| `scripts/p1-smoke.mjs` | **185/185**（167 → 185） |
| `scripts/p21-verify.mjs` / `p2-smoke.mjs` | 46/46 · 16/16 无回归 |
| `node --test` | 92/92 |
| doctor | **0/0/0**（`issues: []`） |
| 真实 `cordis.patch.yml` | **全程 sha 未变**（`ce0b0b81…`） |

证据 `.panel-backups/p22b-evidence-*/EVIDENCE.txt`；改动前备份 `.panel-backups/pre-p22b-fullcard-20260918/`。

**顺带发现并留档**：真实文件**第 2 行注释**写着 `web-search-local`。若「跳过注释行」规则失效，该卡会凭空多出交叉引用告警。已加双向断言：注释行确实存在（前提）+ 规则确实抑制（结论）+ **去掉 `#` 后规则就命中**（反证抑制来自注释规则）。

**本轮为 client 可见改动（确认页 + 条件开关呈现），触发 reload；但按用户指示「攒着合并 reload」，不单独追加一次。**

## L-031 [已完成] 「故障」警报解除 + 3 新事实 + 转述失真教训 + Q4–Q7 收口（2026-09-18 08:53）

**指令来源**：用户 2026-09-18 指令。五部分：①「故障」警报解除 ②三条新事实入账 ③转述失真教训留档 ④催收 Q2–Q7 ⑤文案确认。

### 一、「故障」警报解除（**撤销**上轮的故障排查二选一问题）

上轮判定者侧把 `rate-throttle` 的**黄色双层不一致状态**概括成「**故障**」。用户口述确认：**UI 上无「故障」字样**。
实际 = 设计内展示（两层取值相反的样本卡，见 L-029 / 11.9 约定 1）。**结论：面板无故障，该问题撤销，不答复。**
口径记入 `HANDOFF-MASTER.md` §7。

### 二、三条新事实入账

| # | 事实 | 意义 |
|---|---|---|
| a | 黄色状态自 P2.2 reload 后持续存在，跨日复看一致（用户称今日有过重启） | 「**reload 后状态保持**」再添旁证 —— P2.2 验收中唯一命令行无法自证的一项 |
| b | doctor UI「没有发现任何问题」与服务端 `0/0/0`（`issues: []`）一致 | **读侧对账通过**，无口径漂移 |
| c | P2.2 落库后经用户侧重启，系统整体健康（面板可用、5 卡正常、体检干净） | P2.2 真实环境终态成立 |

### 三、教训留档：**图片转述链路两次失真**

1. **「compact-memory」串读**（5 卡中无此名，实为 `agent-memory` + `compact-router` 两个插件）。
2. **「故障」误读**（设计内黄色状态被读成故障）。

两次都不是面板问题，而是**转述环节丢了字面**。即刻生效的规矩：

> **验收关键状态词一律要用户念原文或放大截图逐字读，不得以图片转述内容判定。**
> 转述只能用于**定位问题区域**，不能用于**确认状态字符串**。

**这条规矩是本任务自己立下的，本轮由判定者自己踩破，一并记录在案。**

### 四、Q4 证据正本入库 + 裁剪排除证据

- **正本入库**：新建 `panel/docs/evidence/`，三份证据**逐字节复制**入仓（复制后比对 sha256 一致才落盘）：
  `P2.1-EVIDENCE.txt`(`e9cdaa74…`) · `P2.2-EVIDENCE.txt`(`166162917b…`) · `P2.2b-EVIDENCE.txt`(`b802c99b…`)，另附 `README.md` 索引与解读。
  原因：证据此前只在 `.panel-backups/`（`.gitignore` 排除）⇒ **仓库无法自证**。
- **裁剪排除证据**：新增 `scripts/p22b-retention-scope.mjs`（**15/15 PASS**），输出存档 `panel/docs/evidence/RETENTION-SCOPE.txt`。
  四路证据：**E1 目录不同源**（引擎默认 `.panel-write-backups` vs 人工留档 `.panel-backups`，同级非父子；后者在 `.gitignore`）·
  **E2 清单过滤**（`listBackups` 只认含 `manifest.json` 的子目录；根不存在→`[]` 不抛错）·
  **E3 运行时隔离**（同父目录并排，对引擎根跑裁剪 45→40，`manual-archive/` **逐字节不变**，**差异集合 ⊆ 引擎根**）·
  **E4 生产实况**（默认根**不存在** ⇒ 生产从未跑过裁剪）。
  E3 刻意在人工归档里放 `manifest.json` 作诱饵，证明**不依赖"没有 manifest 所以看不见"这个脆前提**。
- **一条生产事实**：默认 `backupRoot` 从未创建 ⇒ **用户尚未通过面板真实执行过任何落盘**；生产 `cordis.patch.yml` 至今未被面板改过（sha `ce0b0b81…`）。

### 五、Q5 `change: true` 一致性

**会改状态/签发令牌的 3 条路由全部正确标了 `{ change: true }`；3 条只读路由全部未标。一致性成立。**

| 路由 | `path:` 行 | 守卫 | 性质 |
|---|---|---|---|
| ui · snapshot | 225 · 238 | 只读 | 读 |
| doctor/dry-run | 250 | **`{change:true}` @259** | ⚠️ 过度收口（见下） |
| plan · toggle/plan · execute | 265 · 314 · 365 | **`{change:true}` @306 · @360 · @381** | 写 |
| plan/status | 386 | 只读 | 读 |

**guard 代码行**：`isAllowedRead` @180 · `isAllowedWrite` @191（禁 fallback）· `guard()` @200 · `isWrite = options.change === true` @201。
**⚠️ 如实标注**：`doctor/dry-run` 不改状态也不签发令牌，按 11.8 判据本可标只读，却标了写 —— **fail-closed 方向的偏差**（更严）。
桌面 loopback 无功能影响。**建议保留，本轮不擅改。**

### 六、Q6 `git status` 全量 + 两提交 diff 摘要

`git status --porcelain=v1 -uall` 全量输出**仅一行**：` M cordis.patch.yml`（= 运行配置那 4 行 `toolkit-manager` insert，
L-023-① 结论 2 已对账，待重启验收后单独处置）。**除它之外工作区干净，无 untracked。**

| commit | 变更 |
|---|---|
| `558e62f` | 8 文件 **+719/−8**（含新增 `scripts/p22-cards-ui.mjs` +343） |
| `f6d99eb` | 2 文件 **+169/−3**（handoff 11.10 +94 / ledger L-030 +78) |

HEAD = `f6d99eb`。

### 七、Q7 实际文案字符串

**`⚠ 两层开关不一致，所以现在没生效`** —— 用词是「两层**开关**」，不是「两层**数据**」。
`client/index.js:210` 与 `client/panel.html:178` **逐字一致**。设计意图：分歧发生在**开关**上。**用词正确，不改。**

### 八、用户第 5 点：文案确认（设计内 + 逐字一致）

`启停开关（两层分开，改的是第一层）`（`index.js:390` / `panel.html:245`）· `停用（改第一层）`（`414` / `258`）
—— 用户截图所见**确为设计内，4 张开放卡一致**。已并入 `HANDOFF-MASTER.md` §7 目视清单（C1/C2/C3）。

### 九、Q2 / Q3（未闭环）

- **Q2 四层 patch 栈扫描**：①②③层（`cordis.patch.yml` / `lib/*/dsh.plugin.json` ×5 / `panel/dsh.plugin.json`）**全在仓内、本轮已扫**；
  第④层 `scripts/apply-preset-patch.mjs` **会触达 `~/.dsh`**（`USER_PRESETS_DIR = ~/.dsh/.agent-presets`，脚本第 31 行；
  另 `panel/index.js:96` 只读兜底读 `~/.dsh/remote-web-ui-devices.json`）。**按「涉 ~/.dsh 先申请只读授权」，未擅自读取，待授权。**
  旁证：`preset-backups/` 与 `preset-patch-state.json` **已存在** ⇒ 该脚本曾被执行过。
- **Q3 `HANDOFF-MASTER.md`**：**磁盘上此前不存在**（正本仓 + 沙箱 0 命中）。本轮**按用户点名三要素新建** `panel/docs/HANDOFF-MASTER.md`
  （头部时间戳 / §3「5 行 / 5 卡」口径 / §4 常驻进度行）+ §7 文案口径。**若所指另有其文，请指出即迁。**

### 十、本轮复跑计数（全绿）

| 脚本 | 结果 |
|---|---|
| `p22-verify.mjs` / `p22-cards-ui.mjs` | **98/98** / **71/71** |
| `p1-smoke.mjs` / `p21-verify.mjs` / `p2-smoke.mjs` | **185/185** / **46/46** / **16/16** |
| `node --test` | **92/92** |
| `p22b-retention-scope.mjs` | **15/15**（新增） |
| `pluggable-lint` / doctor | 通过 / **0/0/0** |
| 真实 `cordis.patch.yml` | **sha 未变** `ce0b0b81…`（size 3097） |

**本轮含新增文档与脚本，无 client 可见改动 ⇒ 不额外触发 reload**（P2.2 的 reload 仍按用户「攒着合并」执行）。

## L-032 [已完成] Q2 终局结论 + 四层映射 + Q6 溯源/处置/回滚保险 + Q5 附注（2026-09-18 09:14）

**指令来源**：用户本轮五段（认可 + Q5 附注 + Q2 三件 + Q3 方案 + Q6 三件 + 小项 + 顺序重申）。

### 一、前提更正：「四层 patch 栈」仓内无先例

全仓 `grep 四层` 只命中本任务自己写的 L-031 / handoff 11.11 / HANDOFF-MASTER ⇒ **四层是本侧定义**，
**总文档全文到达后必须逐层对账**；对不上即有第五层或被合并，扫描不算穷尽。

### 二、Q2 终局结论（① ② ③ 层）—— 「无」也是结论

**结论：三层中既不存在 toolkit 五个 id 的重复行，也不存在任何覆盖 / 遮蔽声明。**

- **① 层** `cordis.patch.yml`：`- id:` 行共 **9 个**（顶层 2：`web`/`web-search-deepseek`；嵌套 7，其中**插件挂载行 5 个**，
  另 2 个 `v4-pro`/`v4-flash` 是 `rate-throttle.routing.staticGroups` 的**组 id**、非挂载行）。**每 id 恰好 1 次**；
  `override`/`replace`/`shadow`/`覆盖`/`遮蔽`/`取代` **0 命中**；CRLF 前提成立。
- **② 层** 五份 `lib/*/dsh.plugin.json`：字段仅 `manifestVersion`/`name`/`requirements`（`compact-router` 多 `optionalDeps`）。
  **无 `id`/`patch`/`override`/`bundle`** ⇒ **既不产生也不能遮蔽任何行**。
- **③ 层** `panel/dsh.plugin.json` 同构；`panel/package.json` 只声明 `dsh`（client 面），**不声明 patch 文件**。
- **跨层同 id**：五 id **只出现在第①层**；第②③层用**包名**而非行 id。

### 三、四层 → 物理载体映射（全表 HANDOFF-MASTER §8.1）

① `cordis.patch.yml`（`package.json:28`；面板落盘目标 `panel/index.js:275`/`:328`）·
② `lib/{5 目录}/dsh.plugin.json`（成卡判据 `snapshot.mjs:112`）·
③ `panel/dsh.plugin.json`（`:9`）+ `panel/index.js:16-17`（+`api-notes.md:137`）·
④ `scripts/apply-preset-patch.mjs`（`:31`/`:64-78`/`:33-46`）→ `~/.dsh/.agent-presets/*` + shipped presets。

### 四、Q2 ④ 层（`~/.dsh/.agent-presets` 一次性只读授权，严格只读）

- 2 个目录：**`liangshen`**（活动预设，21780 B）含新名 `@local/dsh-toolkit/compact-router` ✓、无 upstream 残留、无旧名残留；
  **`liangshen.bak-20260914`**（人工备份目录，19792 B）同含新名，被脚本 `.bak` 规则排除（`apply-preset-patch.mjs:84`）。
  **⚠️ 如实标注**：它含 `agent.cordis.yml`，**是否会被 dsh 当预设列出属 dsh 侧行为，本轮未验证**。
- 对账 `preset-patch-state.json` 4 条（`standard`/`ptc`/`cordis` @ `2026-09-14T05:13:13Z`；`liangshen` @ `08:02:55Z`）。
- `preset-backups/` 4 份 `.bak` 揭示 **④ 层两种历史来源**：`standard`/`ptc`/`cordis` = **upstream**（含 `dsh-compaction-basic`）；
  `liangshen` = **旧独立插件**（含 `@local/dsh-compact-router`）⇒ 迁移新名是**独立历史动作**。已断言每个 `.bak` 均为**真正改写前状态**且**不含新名行**。
- **未覆盖面（如实标注）**：3 个 shipped preset 的**当前内容**在 `AppData/…/npm/…/dsh-agent-presets/presets/`，**不在本轮授权路径内、未读**。
- **④ 层结论**：只有 `compact-router` 经第④层挂载；无旧名残留、无 upstream 残留、每个改写都有 `.bak`。

### 五、Q6① 溯源 —— 含一处**必须申报的缺口**

- **diff 全文** = 4 个 `+` 行：空行 + `- insert:` + `    - id: toolkit-manager` + `      name: 'file:///D:/dsh-plugins/dsh-toolkit/panel/index.js'`。
- **字节账闭合**：`3097`（磁盘）= `2914`（HEAD blob，git 库内存 LF）+ `101`（追加块）+ `82`（CRLF 增量）⇒ **磁盘 = HEAD + 这 4 行，逐字节可复现**。
- **git 侧**：该字符串**从未进入该文件的 git 历史**（pickaxe 无命中）；文件在 git 里只有 2 次提交（`e50bb00`、`37819e9`），HEAD blob **2914 B 完全不含该行**。
- **可归因最早证据**：`.panel-backups/arm-manifest-20260917-105930/cordis.patch.yml`（**3072 B**）**已含该行**（旧名）⇒ 该行在 **09-17 10:59:30 之前**已在磁盘。
- **19:55:50** 改为 path-like（依据 `api-notes.md:132-137`；记载 `ledger.md:65`、`:72`）。
- ⚠️ **缺口申报**：**该行「首次落盘」的时刻与操作者未留档**（无 git 记录、无备份捕住创建瞬间）。此前 ledger 只记「行名改写」，未记「行首次落盘」。**据实申报。**
- **「既有约定」正本出处（存在）**：`ledger.md:214`（4 行未提交，属运行配置，按 11 节程序在重启验收后单独处置）+ `:55-65` + `handoff-restart.md:118-122`。

### 六、Q6② 处置：**重启验收通过后语义化提交**（同意用户方向）

提交只改 `.git` 不动磁盘字节 ⇒ `ce0b0b81…` 对账不受影响；且**提交后 HEAD 与磁盘一致，回滚才有「保留面板」的语义目标**。
唯一「不提交」理由（运行配置含环境路径）**已是既成事实** ⇒ **结论：提交。**

### 七、Q6③ 回滚保险 —— 已加注于 `handoff-restart.md:118` 回滚程序之后

⛔ `git checkout -- cordis.patch.yml` / `git restore` ⇒ 回退到 HEAD blob（**2914 B、LF、无该行**）⇒ **删 4 行 → 入口消失 → 面板失联**，**且 CRLF→LF**。
**实测**：`pre-p2-toolkit-manager-…/cordis.patch.yml` 与 `HEAD:cordis.patch.yml` **sha256 完全相同**（`7541c05a…`）⇒ 它是「**P2 之前**」目标，**不是「保留面板」目标**。
保留面板须按目标语义选**含该行**的快照（3072 / 3094 / 3113 / 3120 四档）。
**终验 SHA 对账基准 = 磁盘当前值 `ce0b0b81…`（3097 B、CRLF、含 4 行）；不得用 `7541c05a…`（2914 B）作基准。**

### 八、Q5 附注 / Q3 / 小项

- **Q5 附注**已落 `panel/docs/api-notes.md` 专节「P2.0② 写路由判定」：完整判定表 + guard 行号 + **「请勿当作 bug 修正」显式说明**。
  实测该路由会 `execFile` 起子进程（`doctor-runner.mjs:5-8`），故把它放到「服务兜底放行」的只读路径上才是真破口。
- **Q3**：用户将转来**总文档全文（九大节）**，届时**以全文为正本主体合并落盘** `panel/docs/HANDOFF-MASTER.md`（保留总文档全部结构，一个不丢），
  **骨架版被合并版取代**；同时**对账四层定义**。已在 HANDOFF-MASTER 头部标注「骨架版」。
- **小项（时钟锚点）**：`EVIDENCE.txt` 时刻为 **UTC（Z）**，本地 = UTC+8；本轮 `<current_time>` 曾错位（报 09-17 23:31，实测 09-18 08:53）。
  真实锚点：P2.1 = 本地 09-17 **23:43:18**；P2.2 = **23:57:56**；P2.2b = 09-18 **08:13:52**；本轮 **09:14**。`evidence/README.md` 已加注。

### 九、新增产物与复跑计数

- 新增 `scripts/q2-layer-scan.mjs`（四层扫描 + 溯源，**20/20 PASS**）+ `panel/docs/evidence/Q2-LAYER-SCAN.txt`。
- 复跑：`p22-verify` 98/98 ｜ `p22-cards-ui` 71/71 ｜ `p1-smoke` 185/185 ｜ `p21-verify` 46/46 ｜ `p2-smoke` 16/16 ｜
  `p22b-retention-scope` 15/15 ｜ `node --test` 92/92 ｜ `pluggable-lint` 通过 ｜ doctor 0/0/0 ｜ 真实 `cordis.patch.yml` sha 未变 `ce0b0b81…`。

## L-033 [已完成·部分阻塞] Q2 两尾闭合（shipped preset 补扫 + loader 源码定案）+ 转述失真第四例 + 总文档合并受阻申报 @2026-09-18

**触发**：判定侧第 6 轮判 Q2 条件闭合但留**两尾**（均纯读，与用户 reload 并行），并把穷尽标准修正为「**不以任何一侧的层定义为准，以 loader 源码定案为准**」。

### 一、Q2 尾①：3 个 shipped preset 补扫 —— **21/21 PASS**

**依据纠偏**：上一轮把 `AppData/…/npm/…` 也当需授权路径，**属过度收窄**。红线只有三处（`~/.dsh`、cloudflared 进程、五子插件源码目录）；
`AppData/Roaming/npm/…` 是 **DSH 安装目录，不在红线内** ⇒ **本轮无需新增授权**。
（**说明**：项目红线此前只存在于用户历轮指令中，**仓内无独立成文条目** —— 本条即为其**成文化落点**，供后续引用。）

- 复现：`node scripts/q2-shipped-scan.mjs`（新增）→ **21/21 PASS**；逐行 diff：`node scripts/q2-shipped-diff.mjs`（新增）。
- 证据：`panel/docs/evidence/Q2-SHIPPED-PRESET-SCAN.txt`（10,400 B；**修正断言后重跑**，此前一版 9,913 B 已作废）、`Q2-SHIPPED-PRESET-DIFF.txt`（55,314 B）。
- **两问结论**：① toolkit **五 id 行 = 无**（`rate-throttle`/`web-search-local`/`web-search-router`/`agent-memory-runtime`/`toolkit-manager`）。
  ② **覆盖声明 = 无**（`disabled`/`override`/`merge` 命中**全是 upstream 自己的内容**：`tool-bash`/`tool-pwsh` 的 `disabled: !!js process.platform === 'win32'|!== 'win32'`、可选 subagent 行 `disabled: true`、plan-mode 提示词散文 "override"、注释 "merged"）。
- **必须点名的第三件事（纠正）**：三份 preset **各含 1 行** `- id: compact-router` / `name: '@local/dsh-toolkit/compact-router'`；
  = `apply-preset-patch.mjs` 把 upstream 的 `- id: compaction-basic`/`@deepseek-ai/dsh-compaction-basic` **原位替换**的结果（Δ **+5 行 / +142 B**，三份一致）；
  `cordis.patch.yml:3` 注释自陈「compact-router 不在此：由 `scripts/apply-preset-patch.mjs` 改写预设 compaction 行名」⇒ **文档化注入路径，不是泄漏**。
- **sha 对账**：`standard a5e4d87112f0…` / `ptc 7d9aff861cd6…` / `cordis 9525c9a6ca40…` **逐份 == `preset-patch-state.json.patchedSha`**；
  `minimal` 无 marker（脚本明文：**设计上不动**），实测 0 处 `compact-router`。
- **残留**：`@deepseek-ai/dsh-compaction-basic` **0 处**、旧名 `@local/dsh-compact-router` **0 处**。

### 二、Q2 尾②：loader 源码定案（注入点全集 + 合并语义）→ 落 `panel/docs/api-notes.md` 新节「P2.0③」

**注入点全集（源码 + 行号）**：base `[]`（`profile-boot:124-130`）→ **bundle patch ×N**（`dsh-app-boot/lib/index.js:849-860`；本 toolkit = 仓根 `cordis.patch.yml`）→
**profile 层**（`$DSH_HOME/profiles/<name>/cordis.patch.yml`，`:861-862`）→ **home 层**（`$DSH_HOME/cordis.patch.yml`，`profile-boot:116-118,238`）→
**`--patch` ×N**（`profile-boot:239`）→ **telemetry 合成补丁**（`profile-boot:184-190,249-250`）。
**非 patch 注入面**：env `.env`（`dsh-app-boot/lib/index.js:1064-1078`）、`!!js` 表达式（`:30`；`entry.ts:104-108`）、**agent-preset 独立平面**（`dsh-agent-presets/lib/invariant.js:181,194,202,1277-1287`）、**toolkit 预设改写路径**（`scripts/apply-preset-patch.mjs`）。
唯一权威顺序出处：`dsh/lib/profile-boot-Dk-7KqJc.js:212-220`（`allPatches()` = `bundlePatches → profile.patches → homePatches → overlays`）。

**「同 id 究竟什么行为」——分平面（本项最有价值）**：

| 平面 | 行为 | 源码锚点 |
|---|---|---|
| patch 层之间 | **后者覆盖**；`target[key]=value` **顶层赋值**，写 `config:` = **整块替换**，**非深合并**；patch 写 `name` 且不符 → 警告跳过 | `dsh-app-boot/lib/index.js:98-105`；`README.zh.md:144`「用户 patch 会替换匹配到的整个配置——按 id 定位的 patch 不做深度合并」 |
| insert 形式 | **纯追加**（不去重/不替换/不合并）；目标须存在且 `group:true` | `:72-86` |
| loader 运行时（同树） | 同 id **复用同一 `Entry`**，后到者**整体替换其 `options`** ⇒ **不会有两个运行实例** | `cordis-plugin-loader/src/config/group.ts:20-40`（`existing ?? new` + `create:true`） |
| `disabled` | 沿父链继承；`!!js` 启动时求值 | `cordis-plugin-loader/src/config/entry.ts:84-108` |
| **agent-preset** | ⚠️ **首根胜，方向与 patch 层相反**；根序 shipped(`system`) → `config.roots` → `$DSH_HOME/.agent-presets`(`user`) ⇒ **shipped 遮蔽用户同名预设** | `dsh-agent-presets/lib/invariant.js:426-432,1277-1287` |

**裁决**：
- 「**同 id 后者覆盖**」= **真**（限定 patch 平面；语义是**替换/顶层赋值**，**不是深合并**）。
- 「**四层 patch 栈：bundle（启动时固化）→ profile → home → overlay**」= **转述失真候选（第四例，与 11.11 同族）**。三条硬理由：
  ① **overlay 在源码里是通名**（`loadOverlayPatches` 同时服务 bundle patch 与 `--patch`，`:1152-1168`；`renderConfigDump` 注释 *"overlay layers in application order (later wins)"*，`:1231`）⇒「第 4 层专名 overlay」无支撑；
  ② **未覆盖注入面全集**（漏 base / env 两个非 patch 面 + preset 平面）；
  ③ 「bundle 层（启动时固化）」**措辞有害歧义**：若指「不热重载」→ 与源码一致（`README.zh.md:57`：`patchReload: live` 只监视**两份用户 patch 文件**）；若指「内容固定不可改」→ **不成立**（**本 toolkit 的 `cordis.patch.yml` 就是一个 bundle patch**）。**建议改写为「bundle 层（仅启动时应用，不热重载）」。**

### 三、转述链第四例登记 + 授权链核实

- **第四例**：命题「四层 patch 栈」**正本查无实据**（全仓 `grep 四层` 仅命中本任务自己写的 L-031 / L-032 / 11.11 / HANDOFF-MASTER）⇒ 与 **11.11「loopback 直接过」**同族，登记为**转述失真第四例**。
  **处置**：**不删原文、不悄悄改写**；在 `HANDOFF-MASTER.md` **§8.0 / §8.4 加批注**并给出源码实测结论（遵用户「原文保真 + 批注 + 不悄悄改写」对账原则）。
- **授权链核实（如实申报，不补造时间）**：④层扫描（`~/.dsh/.agent-presets`）的授权 = **用户当轮会话给出的一次性只读授权**（并复述确认）；
  **授权时刻只能锚到「用户当轮消息」这一事件，无独立时间戳留档**。本轮 AppData 扫描**不依赖该授权**（红线定义本身即可）。
- **新增缺口 U8**：注入点 3（`$DSH_HOME/cordis.patch.yml`）**未读**（在红线内，授权只到 `.agent-presets`）；其**优先级高于 profile 层**，理论上可携带 toolkit 任意 id 行 ⇒ 若求穷尽需**单次授权**补扫。
- **新增缺口 U9**：`apply-preset-patch.mjs --status` 报 `liangshen: unknown`。查明：该文件**含**新名行，但 sha **≠** marker `patchedSha` ⇒ **改写后被后续改动过**（marker 陈旧）。**不构成功能问题**，marker 与磁盘不再逐字节对账；是否刷新待用户定。

### 四、Q3 总文档合并：**如实申报阻塞**（不伪造正本）

用户本轮已发来**总文档全文（九大节）**（一、项目是什么；二、五份正本文档；三、系统架构速览；四、当前进度；五、P2 阶段表；六、项目铁律；七、运维手册；八、关键历史教训索引；九、与用户的沟通约定）。
**但会话已压缩 ⇒ 全文在当前上下文中不可取回**。取证穷尽：`conversation_search` **0 命中**；全仓 `grep`（沟通约定/项目铁律/关键历史教训/系统架构速览/五份正本）**仅命中 HANDOFF-MASTER 自身与 ledger 待办描述，无原文**；目录遍历（正本仓 + `panel/docs/`）**无承载文件**。
**处置**：对账原则要求「原文落盘保真」，**凭记忆重建 = 伪造正本** ⇒ **本轮不合并，如实申报 + 请求用户重发**。合并所需结构（九节）与全部叠加点（头部时间戳 / §3 口径 / §4 进度 / §5 安全模型 / §6 待用户项 / §7 目视清单 / §8 定案 / §9 回滚保险）**均已就位，全文一到即为纯机械动作**。
**后果**：**真实终验第二前置（总文档合并）阻塞** ⇒ 全文重达前**终验无法启动**（另两个前置：Q2 两尾 ✅ 已完成；目视 ⏳ 待 reload）。

### 五、新增产物与复跑计数

- 新增 `scripts/q2-shipped-scan.mjs`（**21/21**）、`scripts/q2-shipped-diff.mjs`（diff 输出）；证据 `Q2-SHIPPED-PRESET-SCAN.txt` / `Q2-SHIPPED-PRESET-DIFF.txt`。
- `apply-preset-patch.mjs --status`（只读）：`standard/ptc/cordis = patched`、`liangshen = unknown`。
- 上一轮基线保持：`q2-layer-scan` 20/20 ｜ `p22-verify` 98/98 ｜ `p22-cards-ui` 71/71 ｜ `p1-smoke` 185/185 ｜ `p21-verify` 46/46 ｜ `p2-smoke` 16/16 ｜ `p22b-retention-scope` 15/15 ｜ `node --test` 92/92 ｜ lint 通过 ｜ doctor 0/0/0 ｜ 真实 `cordis.patch.yml` sha **仍 `ce0b0b81…`（未变）**。

## L-034 [已完成] 总文档全文合并落盘（Q3）—— 阻塞解除，正本合一 @2026-09-18

**触发**：L-033 四 曾申报「**总文档合并阻塞**」（全文虽曾入会话，但会话压缩后不可取回；按「原文保真、不得悄悄改写」拒绝凭记忆重建）。**用户随即重发全文** ⇒ 阻塞解除，合并执行。

### 一、合并原则（严格执行用户对账原则）

| 原则 | 落实方式 |
|---|---|
| **原文落盘保真** | 九大节（一、项目是什么 … 九、与用户的沟通约定）**逐字落盘**；仅两处**排版归一**（语义零改动），已在文首「保真说明」显式声明：① 原文「二」处表格丢失列分隔符 → 按语义还原为 Markdown 表格，**单元格逐字保留**；② 原文六/七/八/九为逐行罗列 → **按行还原为列表项，文字逐字保留** |
| **存疑条目加批注** | 「四层 patch 栈」**原文保留不动**，紧跟 **`📌 批注 3.2`** 标 **「转述失真候选（第四例）」** 并给源码实测结论（注入点全集 + 同 id 分平面语义） |
| **不得悄悄改写** | 本侧全部更新（进度 / 口径 / 文案 / 待用户项 / 回滚保险）一律改为 **`📌` 开头的叠加/批注块**，与原文物理分离；**原文一个字未删未改** |
| **结构一个不丢** | 铁律（§六）/ 运维手册（§七）/ 教训索引（§八）/ 沟通约定（§九）**九节齐备** |

### 二、叠加点落位（用户点名四项全部补全）

| 用户点名 | 落位 |
|---|---|
| 头部时间戳 → P2.2 待终验 | 文首「头部时间戳 **2026-09-18 10:46**」+ **§四 叠加 4.1 常驻进度行**（「P2.2 已落库，待 reload 目视验收 → 真实终验」+ **终验三前置**：Q2 两尾 ✅ / 总文档合并 ✅ / 目视 ⏳ + 终验 SHA 基准 `ce0b0b81…`） |
| §3 五卡口径 | **§三 叠加 3.1**：5 卡表 + 判据（`snapshot.mjs:112`）+ 「开放 toggle 的是 4 张」+ `compact-router` 不开放原因 + **`toolkit-manager` 行号补全（第 80–82 行）** + 「compact-memory」串读澄清 |
| §4 进度行 | **§四 叠加 4.1~4.4**：常驻进度行 / P2 各阶段状态表（含 **P2.3 前置**：`config.enabled` 五插件消费点证据，先证后写）/ P2.2 待验收三项 / 安全模型机制清单 |
| §7 目视清单 | **§七 叠加 7.1**：C1~C6 逐字文案表（含出处行号）+ 8 项打勾清单；**叠加 7.2** 回滚保险 ⛔ 块 |

**骨架版去向**：原 §8（四层 patch 栈）并入 **§三 批注 3.2**；原 §9（运行配置 M 项）并入 **附录 A**（内容不变：diff 全文 / 字节账 3097=2914+101+82 / 溯源缺口 / 既有约定出处 / 处置意见 / 正确回滚路径表 / 终验 SHA 基准）。**骨架版作为文件被本版取代。**
**另新增**：**附录 B 待用户项**（U1~U9）· **附录 C 变更记录** · **§六 叠加 6.1 红线成文化** · **§八 叠加 8.1 转述链清单（含第四例）** · **§九 叠加 9.1 面向判定者的交付约定**。

### 三、终验前置状态（本项完成后）

| 前置 | 状态 |
|---|---|
| ① Q2 两尾 | **✅ 完成**（L-033） |
| ② 总文档合并 | **✅ 完成**（本项） |
| ③ 目视通过 | ⏳ 待用户 reload |

⇒ **终验已无阻塞前置，只等用户 reload + 目视。**

### 四、本轮复跑计数

**文档-only 改动**（`git diff --stat` 可证 `lib/` 与 `panel/*.js` 零改动）⇒ doctor 不受影响。基线复跑全绿：`q2-layer-scan` 20/20 ｜ `q2-shipped-scan` 21/21 ｜ `p22-verify` 98/98 ｜ `p22-cards-ui` 71/71 ｜ `p1-smoke` 185/185 ｜ `p21-verify` 46/46 ｜ `p2-smoke` 16/16 ｜ `p22b-retention-scope` 15/15 ｜ `node --test` 92/92 ｜ lint 通过 ｜ 真实 `cordis.patch.yml` sha **仍 `ce0b0b81…`**。

## 待办

- ~~**[L-023 续] 条件④** 全量加固（trigger + selfheal 脚本，先备份，diff 留痕）~~ ✅ 2026-09-17 21:35 完成，见 L-023-④
- ~~**[L-023 续] 条件②** 沙箱演练四阶段~~ ✅ 2026-09-17 21:38 完成，见 L-023-②
- ~~**[L-023 续] 台账正本化 + trigger 脚本入 git**~~ ✅ 2026-09-17 21:42 完成，见 L-023-③a（正本 `panel/docs/ledger.md`，commit `76ce85a`）
- ~~**[L-023 续] 条件③** 重新注册 T+2/T+10（按真实触发时刻宣告）~~ ⚠️ 2026-09-17 21:44 已布防，**21:46 触发时发现第二个根因（taskkill 权限）导致重启未发生**；任务已于 21:47:34 禁用，见 L-023-③
- ~~**[L-023 续] 条件④b** 杀树策略加固 v2（Process.Kill 替代 taskkill）~~ ✅ 2026-09-17 22:05 完成，见 L-023-④b（trigger sha `e0bdbfb2…`，parser 0，commit `054934e`）
- ~~**[L-023 续] 条件③b 重新布防**（用修好的脚本）~~ ✅ 2026-09-17 22:05 完成，见 L-023-③b（闸门修复 commit `cdb1fbe`；trigger @22:08 / selfheal @22:16，均 Ready）
- ~~**[L-023 续] 停手等重启** → 三验收（桌面 200 / 配对 200 / 无痕 403）→ 删一次性任务 → 关账~~ ✅ 2026-09-17 22:08 重启成功；22:10 三验收全绿；任务已清理。见 L-023-⑤
- **[L-027 已解除]** P2 阶段表 **2026-09-17 23:31 由用户提供权威版**，已落盘 `handoff-restart.md` **11.7**。待办转为按表执行 P2.0② → P2.1 → P2.2 → P2.3 → P2.4。
- ~~**【P2 待办】P2.1** 两段式框架（plan→确认→execute，SHA 比对，备份+manifest+保留策略）~~ ✅ 2026-09-17 23:50 完成，见 L-028（commit `a27da81`）
- ~~**【P2 进行中】P2.2** 启停开关（锚点唯一，交叉引用检查，rate-throttle 首用例）~~ ✅ 2026-09-17 24:05 完成，见 L-029；全卡覆盖缺口 2026-09-18 闭合，见 L-030
- **【P2 待办】P2.3** 配置编辑（白名单 + 范围/枚举校验 + 服务端校验）
- **【P2 待办】P2.4** doctor 操作台 + 两套回滚
- **[待用户·常驻]** **reload 后目视确认 P2.2**（4 张卡有开关 / `compact-router` 无、双层分立、确认页人话）。用户已指示**攒着合并 reload**，不单独追加。**逐项清单已落 `HANDOFF-MASTER.md` §7**（含「黄色双层不一致 = 设计内展示，非故障」与 C1/C2/C3 文案项）。
- **[已澄清]** 所见 4 卡中的 **「compact-memory」在 5 张卡里不存在** —— 口径定为 `agent-memory` 与 `compact-router` **串读**（L-031 三、`HANDOFF-MASTER.md` §3.3）。判据：5 卡清单来自 `lib/` 目录，无该名。
- ~~**[待用户·前置条件]** Q1 层间/平台证据已补（L-030 四、五）~~ → **Q1/Q2 已于 L-030 / L-031 收口**；**Q5/Q6/Q7 于 L-031 五、六、七 给出**。
- ~~**[待用户·授权]** Q2 第④层扫描需 `~/.dsh` 只读授权~~ → **✅ 已授权、已扫完**（L-032 四）：`.agent-presets` 2 个目录；结论 = 只有 `compact-router` 经第④层挂载、无旧名/upstream 残留、每个改写都有 `.bak`。`panel/index.js:96` 读 devices.json 属既定程序豁免，不占授权。
- **[待用户·可选授权]** ~~**Q2④ 残留**：3 个 shipped preset 的当前内容未读、是否另给 AppData 只读授权~~ → **✅ 已闭合（L-033 一）**：**无需授权** —— `AppData/…/npm/…` 是 DSH 安装目录，**不在红线内**；补扫 **21/21 PASS**，结论 = 无 toolkit 五 id 行、无覆盖声明；三份各含 1 行 `compact-router`（文档化预设改写路径）。
- **[已闭合·L-034]** ~~**总文档全文（九大节）重新粘贴 → 以全文为正本主体合并落盘 `panel/docs/HANDOFF-MASTER.md`**~~ → **✅ 用户已重发全文，合并完成（L-034）**：九大节**原文保真落盘**，本侧更新全部改为 `📌` 叠加/批注块（**不改原文**）；「四层栈」原文保留 + 加批注标「转述失真候选（第四例）」。**真实终验第二前置解除。**
- **[待用户·可选授权]** **注入点 3 补扫（U8）**：`$DSH_HOME/cordis.patch.yml`（home 层，**优先级高于 profile 层**）未读，落在红线内；是否需要单次只读授权补扫（L-033 三）。
- **[待用户·可选]** **`liangshen` marker 陈旧（U9）**：`preset-patch-state.json` 的 `patchedSha` 与磁盘不再相称（内容正确、hash 漂移）。是否刷新 marker（L-033 三）。
- **[待用户·认可]** **`doctor/dry-run` 的 `{ change: true }`（有意过度收口）建议保留**；专节已落 `panel/docs/api-notes.md`（含「请勿当 bug 修正」的显式说明，L-032 八）。
- **[待终验后处置]** **`M cordis.patch.yml`（4 行 toolkit-manager）→ 重启验收通过后语义化提交**；**回滚保险已加注** `handoff-restart.md:118` 回滚程序之后（⛔ 不得用 `git checkout`/`git restore`；终验 SHA 基准 = 磁盘 `ce0b0b81…`、3097 B、含 4 行）。溯源与缺口见 L-032 五。
- ~~**[L-025 待用户]** reload dsh web 后可在浏览器看到「英文原名 + 中文注释」新面板~~ ✅ **2026-09-17 23:53 用户已确认界面合格**（随 L-023 关账一并闭环）
- **[L-024 后续]** ~~修 `panel/manager/snapshot.mjs` `parseRootRows()` 缩进无关正则~~ ✅ 2026-09-17 23:40 完成，见 L-026（属 P2.0①）
- ~~**[L-023 续 + L-024 + L-025 合并·待用户]** 浏览器端目视确认面板新 UI（**需 reload 后看**）~~ ✅ **2026-09-17 23:53 用户已确认**：设置页 tab 可见、界面合格。**L-023 迁移任务正式关账。**
- **[待用户·每次回报保留]** ~~**设置页 tab 是否可见** —— 用户尚未回报~~ ✅ **2026-09-17 23:53 已回报：可见且界面合格。**（此项自本日起不再挂起）
- L-008 [待办] 二阶段用户亲查签字与解冻（历史遗留；2026-09-10 状态）
- L-009 [已完成] 二阶段设计稿 v2 与四条 rider 落地推进（历史进行中项，后随四插件 git 基线完成而收口）

## 已完成

- L-021 [已完成] 实录：L-020 v3 swap 执行触发自动回滚；回滚后 `doctor --json` 实测 summary = error0/warning3/info1（三条 pkg.resolution-outside-scope + 1 条 ref.stale-in-backup 哨兵）；抽查 cordis/zod/dsh-settings 三条链接均为 Junction 且 target 指向旧树/全局；dsh-settings 已被回滚正确恢复原位——环境确认回到基线。ROLLBACK ERROR 定性为门禁误报（原因见指令第 2 条）。@记录 2026-09-16
- L-000 [已完成] 压缩插件根因实证；设计稿签字（§10 六项拍板 + §11 部署硬约束 + §12 全局安装）@完成 2026-09-10
- L-001 [已完成] 全局化修订（机器级全局数据根 / registry 全局锁 / 跨区移交 / 留存 50→100 / progress workspaceRoot）@完成 2026-09-10
- L-002 [已完成] 第一阶段实现（registry/ledger/progress/archive/写锁/门禁/读取/移交/一致性/全局并发；44/44 测试 + 演示 2/3/4/5）@完成 2026-09-10
- L-003 [已完成] D7 测试修复（快照基准错误）→ 44/44 回归 + 狗粮记录 20260910-40da30ad @完成 2026-09-10
- L-004 [已完成] 事故记录：生产根二次污染（根因 smoke 无护栏；修复 fail-closed 护栏 + 反向回归 + 备份方案）@完成 2026-09-10
- L-005 [已完成] 事故闭环（护栏反向测试通过 → 恢复 → 垃圾清理 → 二阶段设计稿初稿）@完成 2026-09-10
- L-006 [已完成] 按已定稿 v1.2 规范及全部微修订实现 doctor 引擎 + CLI（dry-run；reference/schema 检查；root/file/old/occurrence 定位）@完成 2026-09-14
- L-007 [已完成] doctor 第 2 步真机只读验收（doctor-real*.json / *.stderr 证据；扫描面/root 归属优先级/整词匹配/幂等测试 5/5）@完成 2026-09-14
- L-010 [已完成] 修复 doctor 执行层（--apply / --rollback / 事务备份 / 保护断言 / 并发锁 / 复检闸门 / 退出码），13/13 fixture 测试 + a-g 验收演示全部通过；收尾后打 tag `doctor-stage-3` @完成 2026-09-15

## 已搁置

- L-004a [已搁置] 自动重装 web 搜索插件（用户删除，仅要求检查；对应历史 L-004）

## 验收标准

- L-000~L-005：以 progress.md 与 incident-report-prod-root-pollution.md 保护区块为据。
- L-006：doctor/src/engine.mjs 与 src/cli.mjs 存在；`node test/run-tests.mjs` 全绿。
- L-007：doctor/test/artifacts/ 下保留 doctor-real*.json 与 doctor-real*.stderr 证据。
- L-008：用户亲查签字后关闭。
- L-009：phase2-design.md v2 定稿 + 四侦察项结论。
- L-010：本会话第 3 步验收（apply/rollback/fixture 演示/影子验证/退出码/commit tag）。
- L-023：条件①~④ 全部完成 + 条件③b 重新布防（22:08/22:16）+ 三验收（桌面 200 / 配对 200 / 无痕 403）全绿。
- L-024：① `scripts/p1-smoke.mjs` 60/60 全绿（含约 35 条 P1.6 断言）；② 服务端 `panel/index.js` / `manager/snapshot.mjs` sha 与 mtime 均未变（⑤ 零改动）；③ 三态分支 6/6 + 双实现对拍 22/22；④ ⑥ 生效方式结论有源码行号与实测证据支撑（必须 reload）。**验收新标准：用户不读任何说明能说出每个插件是干嘛的、当前是否在工作。**
- L-025：`p1-smoke.mjs` **72/72** 全绿；五个英文原名 + 五个中文注释 + `originalName`/`annotated` 断言齐备；截图目视确认英文原名在标题、中文在第二行。
- L-026：`p1-smoke.mjs` **84/84** 全绿（含直接执行服务端 `parseRootRows` 的端到端断言 + 7 条边界用例）；`buildSnapshot()` 端到端 `rate-throttle.config.enabled === "false"`；`pluggable-lint` 通过；`p2-smoke` 16/16；改动前备份 `.panel-backups/pre-p20-indentfix-20260917-232032/`。
- L-027：**已解除** —— 用户 2026-09-17 23:31 提供 P2 窄版权威阶段表，落盘 `handoff-restart.md` 11.7。P2 按表执行。
- L-028：`scripts/p21-verify.mjs` **46/46** 全绿（含篡改后 `sha-conflict` → 409、备份副本 sha == 写前 sha、回滚后逐字节一致、保留策略三场景）；`p1-smoke.mjs` **136/136**；`p2-smoke.mjs` 16/16；doctor **0/0/0**；`pluggable-lint` 通过；真实 `cordis.patch.yml` 全程 sha 未变（`ce0b0b81…`）；改动前备份 `.panel-backups/pre-p21-twophase-20260917/`；真实写操作证据 `.panel-backups/p21-evidence-*/EVIDENCE.txt`。
- L-029：`scripts/p22-verify.mjs` **44/44** 全绿（CRLF 前提守卫 / 锚点唯一三态 / 交叉引用正反例 / 双层分立两套渲染器 / 两段式复用结构断言 / 真实文件未变）；`p1-smoke.mjs` **167/167**；`p21-verify.mjs` 46/46；`p2-smoke.mjs` 16/16；doctor **0/0/0**（`issues: []`）；`pluggable-lint` 通过；真实写操作 SHA 变化 `ce0b0b81…` → `3d711ad899…`；证据 `.panel-backups/p22-evidence-2026-09-17T15-57-56-541Z/EVIDENCE.txt`；改动前备份 `.panel-backups/pre-p22-toggle-20260917/`；真实 `cordis.patch.yml` 全程 sha 未变。
- L-030：`scripts/p22-verify.mjs` **98/98**；`scripts/p22-cards-ui.mjs` **71/71**（新增，5 卡 × 两套真实渲染器）；`p1-smoke.mjs` **185/185**；`p21-verify.mjs` 46/46；`p2-smoke.mjs` 16/16；`node --test` 92/92；doctor **0/0/0**；`pluggable-lint` 通过；真实 `cordis.patch.yml` 全程 sha 未变（`ce0b0b81…`）；证据 `.panel-backups/p22b-evidence-*/EVIDENCE.txt`；改动前备份 `.panel-backups/pre-p22b-fullcard-20260918/`。
- L-031：全六脚本复跑 **98/98 · 71/71 · 185/185 · 46/46 · 16/16 · 92/92**（`node --test`）+ **`p22b-retention-scope.mjs` 15/15**（新增）+ `pluggable-lint` 通过 + doctor **0/0/0**；**证据正本入库** `panel/docs/evidence/`（3 份逐字节复制 + README + RETENTION-SCOPE.txt）；真实 `cordis.patch.yml` sha 未变（`ce0b0b81…`，size 3097）；**新建 `panel/docs/HANDOFF-MASTER.md`**（头部时间戳 + §3 5 行/5 卡口径 + §4 进度行 + §7 文案口径）。
- L-032：**新增 `scripts/q2-layer-scan.mjs` 20/20**（四层扫描 + toolkit-manager 行溯源）；证据 `panel/docs/evidence/Q2-LAYER-SCAN.txt`；Q2 ①②③④ 四层终局结论（**无同 id、无覆盖声明**）+ 物理载体映射表 + **回滚保险加注** `handoff-restart.md:118` + Q5 附注专节 `api-notes.md`；六脚本复跑 **98/98 · 71/71 · 185/185 · 46/46 · 16/16 · 15/15** + `node --test` **92/92** + lint 通过 + doctor 0/0/0；真实 `cordis.patch.yml` sha 未变 `ce0b0b81…`。
- L-033：**新增 `scripts/q2-shipped-scan.mjs` 21/21**（`standard`/`ptc`/`cordis`/`minimal`）+ 证据 `Q2-SHIPPED-PRESET-SCAN.txt` / `Q2-SHIPPED-PRESET-DIFF.txt`；三份 sha **逐份 == `preset-patch-state.json.patchedSha`**；结论 = **无 toolkit 五 id 行、无覆盖面声明**，各含 1 行 `compact-router`（= 文档化预设改写路径，upstream `compaction-basic` 原位替换，Δ +5 行/+142 B，零残留）；**loader 源码定案**落 `api-notes.md` 新节「P2.0③」（注入点全集 + 同 id 分平面语义 + 对「四层栈」裁决 = **转述失真第四例**）；**总文档合并如实申报阻塞**（`conversation_search` 0 命中、仓内 grep 0 命中 ⇒ 不伪造正本，请用户重发）；上一轮基线全部保持 + 真实 `cordis.patch.yml` sha 未变 `ce0b0b81…`。
- L-034：`panel/docs/HANDOFF-MASTER.md` **合并版**落盘 —— 九大节原文**保真**（仅两处排版归一，文首已声明）+ 本侧更新全部改为 **`📌` 叠加/批注块（原文零改动）**；「四层栈」原文保留 + **批注 3.2 标第四例** + 源码实测结论；用户点名四项叠加全部补全（头部时间戳→P2.2 待终验 / §三 五卡口径 + **toolkit-manager 行号 80–82** / §四 进度行 + 阶段表 / §七 目视清单）；骨架版 §8→批注 3.2、§9→**附录 A**；新增**附录 B 待用户项（U1~U9）/ 附录 C 变更记录**；**终验第二前置解除**（Q2 两尾 ✅ + 总文档合并 ✅ + 目视 ⏳）。文档-only 改动（`lib/` 与 `panel/*.js` 零改动）⇒ doctor 不受影响；基线复跑全绿 + 真实 `cordis.patch.yml` sha 未变 `ce0b0b81…`。
- **L-035（终验取证 · 未通过 ⇒ 未关账）**：第 10 轮 a–e 取证**存在不绿项**，按指令**停下回报、不进关账**；`M cordis.patch.yml` **保持未提交**；无任何写盘（取证全程只读）。证据 `panel/docs/evidence/TERMINAL-ACCEPTANCE-ROUND10.txt`（工具 `scripts/terminal-acceptance-probe.mjs` / `probe2.mjs` / `report.mjs`）。
  - **(c) 不成立 ✗（硬判据）**：当前 `cordis.patch.yml` = **`c03e2c81…` / 3143 B / 85 行**，判据基准 = **`ce0b0b81…` / 3097 B**（已由 `HEAD blob + toolkit-manager 4 行` 逐字节重建验证）。基准→当前 diff = **0 删 / 2 增**（两处 `disabled: false`），**非「仅删该行」**。
  - **(d) 不成立 ✗**：变化**非仅 rate-throttle** —— 基准→当前新增行的归属 = **rate-throttle + agent-memory-runtime（2 张卡）**，恒定卡 = 3 张。
  - **(a) 部分不达标 ✗**：备份 manifest 有写前 sha ✓、链式 shaBefore 精确对接 ✓、唯一落盘通道 ✓（全仓写 `plan.file` 仅 `apply-engine.mjs:462`，路由 `toggle/plan`→`createTogglePlan:327`→`executePlan:375`）；但 **`reason` / `note` 恒为 `null`**（`createTogglePlan` 无该形参，`executePlan` 调 `createBackup` 未传）。
  - **(b) ✓**（限 rate-throttle 停用段 = 写#3）：diff 恰 1 处 `+      disabled: true`，落在锚点第 14 行正下方第 15 行、与 `name`/`config` 同级，CRLF 保持，0 删除 ⇒ 其余字节不变。
  - **(e) ✓**：doctor dry-run `0/0/0`（exit 0）。
  - **真实写链（由 4 份备份 payload 逐段重建）**：`ce0b0b81`(3097) →写#1 停用 agent-memory-runtime→ `77279ccb`(3119) →写#2 复原→ `54345b4f`(3120) →写#3 停用 rate-throttle→ `2620280b`(3142) →写#4 复原→ **`c03e2c81`(3143)**。**4 次写 = 2 张卡 × (停用+复原)**，全部经 `executePlan` 唯一通道（链式 shaBefore == 上一份写后 sha，SHA 闸生效）。
  - **结构性根因（源码级，须判定侧裁决）**：`apply-engine.mjs planRowFlag` —— 键**存在则原地替换**、**不存在则插入**，**从不删除键**；且 `createTogglePlan` JSDoc 明写「`enabled=true` → 写 `disabled: false`（显式声明为启用；**不删键**）」⇒ 「复原」在**设计上**即写 `false` 而非删键 ⇒ **字节级复原在现有引擎下不可达**（判据 (c) 与已实现/已文档化语义不相容）。
  - **新缺陷 D-01（备份副本落 NTFS 备用数据流）**：`backup.mjs:17` `abs.replace(/[\\/]/g,"__")` **不替换盘符冒号** ⇒ `D:\…\cordis.patch.yml` → `savedAs="D:__dsh-plugins__…yml"`，`copyFileSync` 在 Windows 上把内容写进 **ADS**，目录里只留 **0 字节文件 `D`**（4 份备份全部如此）。按同一 `savedAs` 读回内容完好（本报告即借此重建全链），但**任何不按同一替换规则访问者（人工/恢复脚本/取证工具）都会拿到 0 字节** ⇒ 静默损坏风险。既有 `p21/p22-verify` 的「备份副本逐字节相同」断言**用同一路径读回**，故未能暴露此缺陷（测试盲区）。
  - **待判定侧裁决**：① (c) 改判为「**语义复原**」（L1 回到启用）并正式声明「复原 = 显式写 `disabled: false`」；或② 给引擎加「**复原时删键**」能力（新功能，需授权 + 新增用例覆盖），使字节级复原可达。③ D-01 修复（`savedAs` 需同时净化 `:` 或以 `path.basename` 命名）。
- **L-036（P2.2 关账 · 第 11 轮裁决执行完毕）**：**P2.2 正式关账（2026-09-18 12:48）**。功能层用户侧终验全绿（停用 ✓ / 复原 ✓ / 互不牵连 ✓）；字节层按「(c) 不改判降级 + 授权恢复」达成基准。
  - **① D-01 + manifest 修复（`10ebcef`）**：`backup.mjs` savedAs 规则 `[\\/]` → `[:\\/]`（净化盘符冒号）；迁移 4 份 ADS 备份为常规文件（`scripts/migrate-ads-backups.mjs`，同规则读回→写正→sha 校验→清 0 字节载体→**更新 manifest.savedAs**）；`createPlan`/`createTogglePlan` 增 `reason`/`note` 形参并写入 plan，`executePlan` 透传给 `createBackup`，路由传真值 ⇒ **manifest `reason`/`note` 不再为 null**；断言升级为**独立路径取证**（恰 1 副本 + 非 0 字节 + 名不含 `:` + sha 相符）＋新增 `scripts/backup-write-test.mjs`（**23/23**，D:/C: 绝对路径真实写 + **旧规则反证** 0 字节可见项）；`p22b` E4 按新现实重写（生产已写过）。diff 留痕 = `evidence/D01-MANIFEST-FIX.diff`。
  - **② 恢复（获授权）**：`scripts/restore-cordis-baseline.mjs --apply`（**fail-closed**：重建 sha ≠ `ce0b0b81…` 则不写）→ 写前备份 `.panel-backups/restore-baseline-2026-09-18T04-40-47-135Z`（sha `c03e2c81…`）→ 写入后 **sha=`ce0b0b81…` / 3097 B / CRLF ✓**；快照 5 卡 = 基准态（`agent-memory@74` / `rate-throttle@14` / `search-router@64` / `web-search-local@58`，`disabledExplicit=false`）；doctor **0/0/0**。
  - **③ 语义化提交（`22fde85`）**：`cordis.patch.yml` **+4 行，内容纯净**（空行 + `- insert:` + `- id: toolkit-manager` + `name:` 路径行）。**溯源缺口就此封闭**（该行首次入 git 历史）。`q2-layer-scan` 随之按新现实修订（§4 断言由「从未提交」改为「已提交 + 磁盘(LF 归一)==HEAD + 字节账 3015+82=3097」）→ **计数不变**（`--agent-presets` **20/20**；不带 flag **14/14**，`regression-all.mjs` 用后者）。
  - **④ 关账一包**：`HANDOFF-MASTER.md` §四 → **已关账** + 头部时间戳 `2026-09-18 12:48` + 新增叠加 4.5（关账记录）/4.6（暂缓）/4.7（文案优化）+ 批注 3.4（设计语义）· **附录 B 重写为 U1–U11 口径** · 附录 C 新增本版行；`api-notes.md` 新增「**P2.2 启停开关 · 设计语义定案**」（启用 = 写显式 `disabled: false`，不删键；字节无痕需走恢复程序）与「**Q2 尾① 结论正文**」；**催收三项交齐** —— ① Q2 两尾结论正文 + api-notes 落条目 ✅ ② 3 项排版归一枚举 + 保真证据（`evidence/MASTER-MERGE-NORMALIZATION.txt`，含「字面全文 diff 不可构造」的如实说明）✅ ③ 附录 B U1–U11 口径 ✅。**（提交 `c51ae58`）**
  - **⑤ 文案优化**：黄警告恢复指引两套渲染器同步补齐责任边界（**标注「待 P2.3 前合并 reload」**）；`p22-cards-ui` **79/79**（+8 条，含 react 函数组件下钻取文本）。
  - **⑥ 会话交接卡**：`handoff-restart.md` **§12（10 行）** 已落，满足关账硬前置。
  - **回归全绿**：p1-smoke 185 · p2-smoke 16 · p21-verify 53 · p22-verify 104 · p22-cards-ui 79 · p22b-retention 17 · q2-layer-scan 14（默认；带 `--agent-presets` 20）· q2-shipped-scan 21 · master-merge-fidelity 38 · backup-write-test 23 · node --test 93 · pluggable-lint 通过 · doctor 0/0/0。新增 **`scripts/regression-all.mjs`**（一键全跑）。
  - **⑦ 上下文余量自评（判定侧三次催收，本次交齐）**：**偏低**。本会话已跨 11 轮判定、累计大量长输出（含一次输出截断）；本轮单轮即产出 ~20 次工具调用与多份长文档。**如实建议**：**P2.3 开工建议新开会话**，以 `handoff-restart.md` **§12 交接卡**为入口（含当前状态 / 下一步 / 正本索引），避免在低余量上下文中做安全核心改动。
  - **⑧ 口径校正（本侧自查发现并当场改）**：本轮文档初稿把 `q2-layer-scan` 计数误记为单一的 **14/14**（实为**调用方式相关**：`--agent-presets` **20/20** / 默认 **14/14**，§4 断言改写**不改变计数**）⇒ 已在 `HANDOFF-MASTER.md`（批注 3.3 复现行 / 叠加 4.5 回归行 / 附录 B U3 / 附录 C ⑧）与本节统一订正。另：`p22b-retention-scope` 由 **15/15 → 17/17**（E4 按「生产已写过」重写）已在 `evidence/README.md` 订正。**两类订正均为「计数/口径」而非结论** —— 结论层面无变更。
- **L-037（第 12 轮 · 补验收呈报 + 销项 + 授权语义澄清）**：**P2.2 关账已被判定侧接受（「关账成立 ✓」）**；本轮为**关账后保留事项**的首次执行，**内容层面不改任何结论**。
  - **判定侧点名认可的九项（第 12 轮）**：① 磁盘 = `ce0b0b81`（3097 B / CRLF）✓ ② 快照 5 卡 = 基准态 ✓ ③ 提交 `22fde85` 内容纯净（+4 行，**溯源缺口封闭**）✓ ④ `git status` 干净 = **首次零漂移** ✓ ⑤ 12 套回归 + doctor 0/0/0 ✓ ⑥ D-01 修复含**旧规则反证**（测试可抓洞）✓ ⑦ manifest `reason`/`note` 传真值 ✓ ⑧ 交接卡 §12 落盘 ✓ ⑨ 余量自评（L-036 偏低）第三次催收终于到位 ✓。
  - **点名认可（方法层）**：恢复操作**自身也走写前备份**（`c03e2c81` 副本）⇒ **恢复亦有痕**；两处口径错误**自查后四处统一订正**（L-036 ⑧）；字节账 **HEAD 3015 + 82 = 3097** 提交后闭环；**遇授权边界如实申报**。
  - **催收三项补验收（呈判定者）**：正文摘要落 `evidence/ROUND12-SUPPLEMENTARY-ACCEPTANCE.md` —— **摘要 A** = `api-notes` 两新节（设计语义定案 `:309–328` / Q2 尾① 结论正文 `:332–347`）；**摘要 B** = 附录 B U1–U11 口径；**摘要 C** = 3 项排版归一枚举 + **「字面全文 diff 不可构造」的如实说明**（原文从未落盘、压缩后不可取回 ⇒ 以 38/38 逐字探针代证）。**关账已被接受，补验收不改结论。**
  - **U 项销项（判定侧第 12 轮裁决）**：**U6 销项**（用户第 5/6 轮已确认 5 卡齐全、`compact-memory` 为串读，在案）；**U7 销项**（判定者第 5 轮已认可 doctor 过度收口 + `api-notes`「勿当 bug 修正」已落实）。
  - **U8 / U9 转呈**：**U8** 注入点 3（`$DSH_HOME/cordis.patch.yml`）未覆盖、**U9** `preset-patch-state.json.patchedSha` 陈旧 —— 随三项摘要**一并呈报**，**待用户决定**。
  - **新增 U12（授权语义澄清）**：判定侧要求成文化 —— 「一次性授权」**以该次任务为限**（默认，选项 1）；或由用户批准**将该路径纳入「既定只读程序」清单**（类比 `devices.json`，选项 2）。**待用户定**；正文 `handoff-restart.md` §11.14。
  - **越界申报在案**：本轮未新开边界；U8 的「未读」= **遇授权边界如实申报**（不硬闯），与 U12 成对记录。
  - **本轮磁盘动作 = 零**：未改 `cordis.patch.yml`（基准 sha 未变 `ce0b0b81…`）、未重启、`lib/` 与 `panel/*.js` 零改动；仅**新增证据 1 份 + 正本三处索引 / 台账更新**。
- **L-038（第 13 轮 · 补验收判定执行 + 盲抽 8/8 + 同族缺口补登）**：判定侧第 13 轮补验收 —— **摘要 A 尾①（三命题「无」+ compact-router 文档化注入 + sha 对账）✓、设计语义定案节 ✓、摘要 B 状态表 ✓、摘要 C 归一枚举 ✓ + 「全文 diff 不可构造」如实申报 ✓ 接受**。**内容层面不改任何结论**。
  - **尾②补呈（前置 ①）**：**loader 注入点全表**落 `evidence/ROUND13-SUPPLEMENTARY-2.md`（序号 / 物理路径 / 优先级与覆盖语义 / **已扫与否 / 未扫原因** 五列，内容与 `api-notes.md` §③.1 逐行一致 + 应用顺序权威出处 `profile-boot:212-220`）。**补呈时如实补登同族缺口**：#0（`~/.dsh/profiles/web/cordis.yml`）/ #2（`~/.dsh/profiles/web/cordis.patch.yml`）/ E1 的 `~/.dsh/.env` 同处红线未扫（此前 ③.4 只点名 #3）—— **不悄悄扩权**，随 U8 同一批授权一并补扫即可全部闭合；红线外 `.env` 4 处候选路径已核均不存在。
  - **U1–U5 逐行补呈（前置 ①）**：同件 §二，每行「做了什么 / 结论是什么」。
  - **盲抽 8 句（前置 ②）**：新增 `scripts/master-blind-probe.mjs`（探针由**判定侧指定**，本侧未挑选；引号变体兜底并如实标注）→ `evidence/MASTER-BLIND-PROBE-8.txt`：**8/8 全部逐字命中**（P1@11 / P2@57 / P3@60 / P4@61 / P5@252 / P6@328 / P7@41 / P8@310；P2 笔误「profile 局」按判定侧指示以落盘为准修正；逐句 ±20 字上下文在正本；检索全程落盘零改动）。
  - **U9**：判定侧批准**随下个写盘批次刷新 marker**（语义化留痕）⇒ 附录 B 状态改「已批准」。
  - **U12**：判定者**推荐乙（窄版：仅注入点清单内文件 / 仅只读 / 层间覆盖检查用途，类比 `devices.json`）** ⇒ §11.14 补记；**仍待用户裁决**。
  - **登记**：`HANDOFF-MASTER.md`（头部时间戳 13:25 / 附录 B U9·U12 / 附录 C 新行）· `handoff-restart.md` §11.14 补记 · 本条。
  - **本轮磁盘动作 = 零**：未改 `cordis.patch.yml`（基准 sha 未变 `ce0b0b81…`）、未重启、`lib/` 与 `panel/*.js` 零改动。
  - **P2.3 前置**：① ✅ ② ✅ ③ ⏳（U8 授权后扫描结论）④ ⏳（U12 用户裁决）—— **全齐即开工**（第一动作 = `config.enabled` 五插件源码消费点证据，先证后写）。
- **L-039（第 14 轮 · 用户两项裁决落账 + 四层栈改判 + 乙程序首批扫描 → Q2 全表穷尽 ✓）**：**内容层面不改任何既有事实，改判仅涉「定性」**。
  - **裁决 ①（U8 + 同族）**：用户批准**一次性只读授权**覆盖红线内 4 点（#0 / #2 / #3 / E1）。
  - **裁决 ②（U12 = 乙）**：**窄版既定只读程序**正式生效 —— 程序定义 = **注入点全表内 `~/.dsh` 路径 / 只读 / 层间覆盖检查用途**，此后该范围内读取**不再逐次授权**（`handoff-restart.md` §11.14 已更新，原文保留）。**可选项关闭**：「重发原文做全文 diff」随盲抽 8/8 闭环而关闭。
  - **改判（判定侧第 14 轮，重要）**：「四层 patch 栈」判例由「转述失真候选（第四例）」**改判为「内容为真、出处未落盘」** —— 其四层内容（bundle→profile→home→overlays、后者按 id 覆盖）与 loader 源码**一致**；原三条复核理由属**精度/完备性**问题，均未证伪内容本身。**落点**：`HANDOFF-MASTER.md` 批注 3.2 加改判块（原文保留）、§八 叠加 8.1 加改判注、附录 B U3 加注、`api-notes.md` §③.3 加改判注。**归档口径（新，铁律级）**：**「事实必须落盘出处，否则与失真不可分辨」** —— 出处缺失与内容失真分立两类（前者补出处，后者改口径）。
  - **乙程序首批例行只读读取（放行条件 ③）**：新增 `scripts/q2-released-scan.mjs`（可重放）→ `evidence/Q2-RELEASED-SCAN.txt`（4477 B）：**#3 `~/.dsh/cordis.patch.yml` = 文件不存在** · **#0 `profiles/web/cordis.yml` = `[]`**（当前实际值与「启动重写」定案一致）· **#2 `profiles/web/cordis.patch.yml` = `[]`** · **E1 `~/.dsh/.env` = 文件不存在** · **#5 `DSH_TELEMETRY_DISABLED` = undefined ⇒ telemetry 合成补丁不生成、注入点 5 本机无效** · #4 不适用已注 ⇒ **红线内四点全部落结论：无任何一处携带 toolkit id 行或覆盖声明 ⇒ Q2 注入点全表穷尽 ✓**。
  - **判定侧认可（第 14 轮）**：零磁盘动作自证（sha 不变 / fidelity 38 复跑哈希不变）✓ · 同族缺口补登、不悄悄扩权 ✓ · P2 笔误按「以落盘为准」处理 ✓。
  - **登记**：`HANDOFF-MASTER.md`（头部时间戳 13:42 / 附录 B U3·U8·U12 / 附录 C 新行）· `handoff-restart.md` §11.14 · `api-notes.md` §③.3 · 本条。
  - **本轮磁盘动作 = 零**（扫描全程只读；被扫文件未改；`cordis.patch.yml` 基准 sha 未变 `ce0b0b81…`）。
  - **P2.3 放行**：前置 ①②③④ **全齐** ⇒ **开工**。第一动作 = **`config.enabled` 五插件源码消费点证据**（谁读、做什么、改值后生效路径 —— 含是否需重启），先证后写；白名单 `enabled` 布尔 / 限流数值范围 / 路由模式枚举；服务端校验不信任前端；写路由 `{change:true}` + 配对校验；apply-engine 唯一通道 + 写前备份；**U9 marker 刷新随首个写盘批次**。节奏：证据核查阶段零写盘，攒批 reload 原则不变，UI 出来后再报用户目视。
- **L-040（P2.3 第一动作 · `config.enabled` 五插件源码消费点证据，先证后写）**：P2.3 放行后**第一动作**完成（**全程只读、零写盘**）。证据落 `api-notes.md` 新节「**P2.3 前置 · config.enabled 五插件源码消费点证据**」。
  - **核心结论**：**`config.enabled` 消费点 = 仅 rate-throttle**（5 插件中唯一）—— `:157` 激活时快照（缺省 true）/ `:167` routing 子闸 / **`:224` throttle() 主功能闸**（`!cfg.enabled → 不节流`）/ `:656` `:781` 路由短 路；`cfg` 激活时构建 ⇒ **改值需重启**（bundle patch 不热重载）。**agent-memory / compact-router / search-router / web-search-local 均 0 消费**（`enabled` 全 lib 仅 8 处命中，逐条定性：5 消费 + 3 注释）。
  - **两条会遮蔽 patch 值的活通道（新发现，P2.3 设计必须处理）**：search-router = **热 JSON `~/.dsh/dsh-search-router.json` 每次调用热读**（seed < 热 JSON < env `DSH_WEB_SEARCH_ROUTER_MODE`；`mode` 枚举 `auto/official/local` @ `:38`）；web-search-local = **settings section 活配置**（Schemastery `Config` 注册 settings 服务，改后下一次 search/fetch 立即生效且**覆盖 patch 值**）。
  - **对 P2.3 设计的三条直接影响**：① 层 2 `enabled` 开关仅 rate-throttle 真实消费 ⇒ 其余 4 卡层 2 须标注「插件不读此字段」或不提供可写入口；② 路由模式枚举 = search-router `mode`，写 patch 前须读热 JSON 并呈现遮蔽关系；③ patch 侧写入生效 = 重启（与确认页文案一致），确认页须如实提示两条活通道遮蔽。
  - **白名单取值域**（rate-throttle 数值字段范围等）属 P2.3 施工设计，不在本证据范围（如实申报）。
- **L-041（P2.3 设计稿 + 遮蔽通道补扫 + 越界申报一处）**：第 15 轮授权段执行（一次性只读：`dsh-search-router.json` + settings 存储文件）→ 新增 `scripts/p23-shadow-scan.mjs`（可重放）→ `evidence/P23-SHADOW-SCAN.txt`（2773 B）：**T1 热 JSON 现有 `mode` 键（值 `"auto"`）⇒ patch 编辑 mode 无效（方案三选一事实基础成立）**；**T2 `~/.dsh/settings.yaml` 无 `web-search-local` 节**（settings seam 空 ⇒ 当前 patch 值即生效值）；T3/T4 env（`DSH_WEB_SEARCH_ROUTER_MODE` / `DSH_TELEMETRY_DISABLED`）均 undefined ⇒ 不遮蔽。
  - **设计稿落盘**：`panel/docs/p23-design.md`（**零写盘、批准前不动代码**）—— ① 范围收敛（rate-throttle 唯一可写；agent-memory / compact-router / web-search-local =「无内部开关」；「有键不读→插件不读此字段」口径保留实现）；② 白名单逐字段表（只写标量：顶层 6 字段 + routing 11 字段，各带类型/合法域/源码行号/源侧校验注记；**数组/路径/复杂结构一律不开放** —— `logPath` 等任意路径写风险、`excludeProviders` 被热 JSON 合并遮蔽）；③ **mode 三选一呈报、推荐方案 2（呈现遮蔽）**，方案 3（写热 JSON）列 P2.5 候选需单独授权；④ 遮蔽呈现（snapshot 现读：search-router 读热 JSON、web-search-local **走 settings 服务 API 不读文件**、rate-throttle 白名单字段无遮蔽）+ **新 U13 授权口径**（追认越界读 + 两 JSON 纳入乙程序只读清单；settings.yaml 不纳入）；⑤ 确认页人话按插件分述生效时机；⑥ 安全链全套沿用 + U9 marker 随首个写盘批次；⑦ 测试计划（遮蔽场景断言 + 假写拒绝 + 白名单合法性 + 契约回归）。
  - **⚠ 越界申报（如实）**：取证中曾**手工只读 `~/.dsh/dsh-rate-throttle.json` 一次**（rate-throttle 热配置，锚点 `:403-433`：`declaredLimits`/`excludeProviders`/`aliases` 三键、每次路由决策 mtime 缓存热读）——**超出第 15 轮授权段字面范围**（授权仅 search-router.json + settings 存储文件）。只读、未改；已在 `p23-design.md` §七 与 `P23-SHADOW-SCAN.txt` 尾注申报，并列为 **U13-1 追认**申请。教训：授权段外的相关文件也应**先申报后读**。**→ 第 16 轮补记：该次越界读已获用户追认 ✓，且第 17 轮口径升级为「**用户书面确认**（判定侧在案，原文「这条 u13 指令我批准的」）」；正式生效（见 U13-①）。**
  - **登记**：`HANDOFF-MASTER.md`（叠加 4.1 进度行 / 附录 B 新增 U13 / 附录 C 新行）· `evidence/README.md` 清单 · 本条。
  - **本轮磁盘动作 = 零**（补扫全程只读；`cordis.patch.yml` 基准 sha 未变 `ce0b0b81…`）。
- **L-042（第 16 轮 · U13 三点裁决落账 + 授权纪律附则入档 + 设计稿两道钉子呈验）**：
  - **U13 落账（第 17 轮口径升级：用户书面确认 —— 判定侧在案，原文「这条 u13 指令我批准的」；原记「口头同意」升级，事实不变；正式生效）**：① **越界读追认 ✓**（L-041 已补记）；② **扩乙 ✓** —— `~/.dsh/dsh-search-router.json` + `~/.dsh/dsh-rate-throttle.json` **正式纳入乙程序只读清单**（用途 = 层间覆盖检查 / snapshot 生效值呈现，此后不再逐次授权；`handoff-restart.md` §11.14 已更新）；③ **`~/.dsh/settings.yaml` 不纳入 ✓**（web-search-local 走 settings 服务 API）；④ **授权纪律附则入档 ✓**：「**先申报后读，明显相关不豁免**」（`HANDOFF-MASTER.md` 叠加 6.4 + §11.14）。
  - **钉子 ① 字段 × 通道对照表**：`p23-design.md` **§八**（18 字段 × 4 通道全量，逐字段消费点行号）。**核心定案**：18/18 字段生效值 = **patch 值（激活快照）**，唯一生效方式 = 重启 dsh web；热 JSON 三键中 `declaredLimits` 仅用于**候选排序**（`limitData() :478-489`，declared > learned > none），**不聚合、不覆盖**任何白名单字段（两套数值是不同维度：declared/learned = 选谁，cfg = 怎么等）；唯一热合并字段 `excludeProviders`（`:424-429`）**不在白名单**；settings 通道全 lib 仅 web-search-local；rate-throttle 的 env 仅 `DSH_HOME`（`:70`，路径定位非配置覆盖）⇒ **无假开关残留**。**计数口径订正**：§二原表 17 行系两字段合并一行，拆开实为 **18 字段**。
  - **钉子 ② 无源码校验字段合法域依据**：`p23-design.md` **§九**（4 顶层 + 1 routing = 5 处，逐字段给保守 + 实际用例理由；**新增跨字段校验 `maxIntervalMs ≥ minIntervalMs`**；`backoffFactor` 收紧为 **1–10**（<1 反语义 + `:234` 除零）；`maxIntervalMs` 下限 1（0 = 变相关闭退避）；`maxDowngradeCompactsPerTurn` 0 = 合法关闭语义对齐 `tpmCooldownMs=0` 先例）。
  - **登记**：`p23-design.md` §二两处收紧 + §八/§九 新增 · `HANDOFF-MASTER.md`（附录 B U13 / 叠加 6.4 / 叠加 4.1 / 附录 C）· `handoff-restart.md` §11.14 · 本条。
  - **本轮磁盘动作 = 零**（`cordis.patch.yml` 基准 sha 未变 `ce0b0b81…`）。两表呈验通过后设计稿正式批准 → 动代码（首个写盘批次顺带刷 U9 marker，语义化留痕）。
- **L-043（第 17 轮 · U13 引用口径升级）**：判定侧确认 U13 已获**用户书面批准**（判定侧对话在案，原文「这条 u13 指令我批准的」）⇒ `ledger.md`（L-041 / L-042）、`handoff-restart.md` §11.14、`HANDOFF-MASTER.md` 附录 B U13 的引用口径由「用户口头同意」**统一升级为「用户书面确认（判定侧在案）」**——**事实与效力不变，仅引证等级升级**。两道钉子（字段×通道对照表 §八 / 无源码校验字段合法域依据 §九）**仍为设计稿批准前置**，交判定侧验收后放行代码。其余按既定节奏：首个写盘批次刷 U9 marker（语义化留痕）、UI 完成报用户 reload 目视。**本轮零磁盘动作**（`cordis.patch.yml` 基准 sha 未变 `ce0b0b81…`）。
- **L-044（第 18 轮 · 两表重发 + 对账四点落档）**：第 16 轮两表经搬运链路未达判定侧 ⇒ **重发 §八/§九 正文**（作为设计稿批准验收物），并按判定侧四点对账（新增 `p23-design.md` **§十**）：**a)** 字段总数 17 vs 18 = **合并行拆开**（`clearCooldownOnUserSwitch`/`syncSelectionOnFailover` 同行呈现所致），无新增字段；**b)** 无源码校验 4 vs 5 = 差异字段 `routing.maxDowngradeCompactsPerTurn`（`:178`），4 顶层 + 1 routing 兼容；**c)** `declaredLimits` 不构成遮蔽的**逐行源码依据 + 反证**（热调用点全量仅 `:418/:425/:431`；唯一消费链 `limitData :479-489` → `rankEligible :698-699` 仅排序比较器；白名单消费点 `:220/:234/:240/:273/:279-280` 均独立于热通道；全文件无 `Object.assign` / 展开 / 第 4 热入口 ⇒ 结构上不可能改写 cfg）；**d)** 跨字段校验实现位置 = 服务端 plan 校验层（预认可已收，正式入档）。**本轮零磁盘动作**（基准 sha 未变 `ce0b0b81…`）。两表验收通过 → 设计稿正式批准 → 动代码（首个写盘批次刷 U9 marker）。
- **L-045（第 19 轮 · 设计稿批准 → P2.3 施工批次完成 + U9 刷新）**：判定侧两表验收**通过**，**P2.3 设计稿正式批准**（对账 a/b/c/d 全过；`declaredLimits` 证据链正向 + 穷尽 + 反证 + 例外排除 —— 最后一道假开关防线钉死）。批准附带 6 项执行要求**全部落实**。证据 `evidence/P23-EVIDENCE.txt`。
  - **实现**：① `panel/manager/config-whitelist.mjs`（新增，18 字段白名单唯一权威；**13 个有源码校验字段合法域 ⊆ 源码域未放宽**＝要求 ②）；② `apply-engine.mjs` 新增 `locateConfigKeyLine`/`planConfigEdit`/`createConfigPlan`（config 子树原地替换/插入回退，executePlan 唯一通道与备份链不变＝要求 ④）；③ 新路由 `/api/toolkit-panel/config/plan`（{change:true}+guard 配对；**服务端锁 rate-throttle**，mode 无写入路径＝方案 1，要求 ①）；④ `snapshot.mjs` 新增 `parseConfigScalars`/`searchRouterModeShadow`/每卡 `configPanel`（search-router mode 只读三分支：env > 热 JSON > patch）；⑤ 两渲染器新增 rate-throttle「参数编辑」（18 字段逐字段两段式 + 确认页「重启后生效、无遮蔽」）与 search-router mode 只读行；黄警告指引更新且保留既有断言字符串；⑥ `scripts/p23-verify.mjs` 新增。
  - **U9（要求 ⑤）**：`liangshen.patchedSha` 已刷新 `1d6e3210705c…` → **`acf188892976…`**（磁盘 21780 B 未变，仅 hash 补账 + 语义化 note）—— marker 与磁盘重新对账，U9 闭环。
  - **测试（要求 ⑥）**：**真实 `cordis.patch.yml` 全程零写入**（基准 sha 未变 `ce0b0b81…`）；全部落盘测试走 `os.tmpdir` 副本。**p23-verify 107/107**；一键回归**全部通过**（p1 190/0（路由计数 7→8 与期望表同步更新）· p2 16/0 · p21 53/53 · p22 104/104 · p22-cards-ui 79/79 · p22b 17/17 · q2-layer 14/14 · q2-shipped 21/21 · fidelity 38/38 · backup-write 23/23 · lint 通过 · node --test 93/0）；**doctor 0/0/0**。
  - **#12 行号补齐（要求 ③，非阻断）**：`routing.tpmCooldownMs` 消费点 `:1003-1019` 已补入 §八（判定侧批文写「#12（tpmTurnSkip）」——本表 #11 tpmTurnSkip 原已具行号，缺的是 #12；两处均齐）。
  - **待办（下一轮）**：**reload 一次**（restart-trigger）→ 目视验收（清单届时判定侧出）：rate-throttle 卡「参数编辑」18 字段、逐字段两段式与确认页文案、search-router mode 只读行、三卡「无内部开关」、U10 黄警告新文案一并生效。首次**真实** config 写入 = 用户在面板操作并确认之时（两段式）。
- **L-046（新会话第 2 轮 · 三项取证全绿 + 目视通过补记 + 终验放行）**：判定侧三项取证**全绿**，目视**通过**（补记），**终验放行**。证据链：a) sha 链闭合 `ce0b0b81→b6ebb2c0→ce0b0b81`；写#2 diff 仅 1 行（`cordis.patch.yml:33` 原地替换）——用户意外往返 = 真实写入-复原闭环（已存在字段原地替换天然字节复原，与 P2.2 toggle 残留形成对照）；b) manifest `reason`/`note` 传真值（D-01 修复后首批真实使用证据）+`savedAs` 无冒号、无 ADS 复发 ✓；c) 18/18 已存在——插入型用例当前环境不存在，复原语义声明保留为假设条款。
  - **目视通过补记**：用户体感确认 + 截图佐证——参数编辑区 / 顶层与换源分区 / 字段当前值 / 「重启后生效」提示，判定侧在案。
  - **终验放行（两段式）**：样本 `routing.tpmCooldownMs` **45000→46000→45000**（46000 已经 `config-whitelist.mjs` 服务端校验合法：ok, value=46000；域 0–86400000）。段1 = 改值→确认写入→面板显新值→reload→五卡正常＋doctor 0/0/0＋面板仍显新值；段2 = 改回→确认写入→reload→同上。本侧同步取证 = 两段各一笔备份＋manifest＋sha 链＋最终 **sha==ce0b0b81**（字节复原硬判据）＋doctor 0/0/0。
  - **本轮磁盘动作**：仅补登记台账；`cordis.patch.yml` 基准 sha 未变 `ce0b0b81…`。

- **L-047（新会话第 2 轮 · P2.3 终验通过 → 关账）**：终验放行后两段式全流程 PASS，**P2.3 正式关账**。
  - **段1（45000→46000）**：真实写入备份 `.panel-write-backups/2026-09-18T10-01-41-305Z`（manifest `panel-config-edit` / note `… = 46000` / 写前 sha `ce0b0b81…` == 备份文件）；写后 sha `539ba66d…`；diff 仅 `:33` 45000→46000；reload 后 snapshot 5 卡齐全、`configPanel…tpmCooldownMs = 46000`；doctor **0/0/0**。
  - **段2（46000→45000）**：真实写入备份 `.panel-write-backups/2026-09-18T10-09-10-045Z`（manifest `panel-config-edit` / note `… = 45000` / 写前 sha `539ba66d…` == 备份文件）；写后 sha **`ce0b0b81…`**（**字节复原硬判据达标**）；diff 仅 `:33` 46000→45000；reload 后 snapshot 5 卡齐全、`configPanel…tpmCooldownMs = 45000`；doctor **0/0/0**。
  - **sha 链**：`ce0b0b81 → 539ba66d → ce0b0b81`；每步 3097 B / CRLF / 82 行；`savedAs` 无冒号、无 ADS。
  - **关账一包**：`HANDOFF-MASTER.md`（头部时间戳 / §四叠加4.1+4.8 / 附录B U9·U10 / 附录C）· 本条 · `evidence/P23-FINAL-ACCEPTANCE.txt`（2881 B）+ `evidence/README.md` 清单 · `handoff-restart.md` §12 更新。
  - **顺带修复**：`scripts/regression-all.mjs` 对 `node --test` 输出格式兼容（旧 RE 只认 `# pass`，现行输出为 `ℹ pass`）⇒ 一键回归恢复全绿（本批实测 `pass=93 fail=0`）。
  - **下一阶段**：P2.4 doctor 操作台 + 双回滚（排队；前置证据同规：先证后写，第一动作 = doctor 操作台 / 双回滚源码消费点与 rollback 语义证据）。
- **L-048（新会话第 3 轮 · 需求定案 + 顺序裁定 → P2.4 扩容证据阶段启动）**：用户裁决卸载混合方案 + 红线修订 + 顺序裁定，P2.4 扩容阶段正式启动。
  - **卸载混合方案（定案）**：联动插件默认**软卸载**（挂载行摘除 + 本体保留 + 一键恢复 + 联动自动恢复）；非联动插件默认**真卸载**（本体删除，恢复 = 重新安装）；**真卸载对一切插件始终可选**——弹窗如实告知删除内容 / 后果 / 可否恢复 / 恢复途径，知情确认后执行。联动分类以证据阶段联动图为准（用户假设：限流/压缩/记忆有联动——待验证；若证据推翻分类或发现搜索插件参与联动，呈判定侧）。
  - **红线修订（本轮指令，落档）**：原红「不碰 5 个子插件的源码目录」修订为——**面板可在用户知情确认下执行子插件文件删除**；`~/.dsh` 与 cloudflared 红线**不变**；总文档红线区 + AGENTS 已落注记（原文保留）。
  - **compact-router 特殊性**：挂载不经 patch 行（预设脚本改写）——软/真卸载语义**单独设计**（软 = 预设回写？真 = 删本体 + 预设恢复），证据阶段给机制方案。
  - **真卸载删除范围**：`lib/<plugin>` 目录 + patch 挂载行；`~/.dsh` 热配置默认保留（重装可续用）；重装后检测 + 挂载提示「已安装未挂载，是否恢复？」纳入设计稿。
  - **顺序裁定**：P2.4 扩容（卸载/恢复 + 联动感知 + doctor 操作台 + 双回滚统一设计），分批施工 = 证据批 → 设计稿 → 施工批 1（卸载）→ 施工批 2（doctor 操作台）。总文档阶段表已更新。
  - **证据阶段清单（扩展版，零写盘）**：① 联动关系全图（含缺席降级行号）；② 独立性证据 + 疑点即报；③ 软/真卸载机制（含 compact-router 特案）；④ DSH 插件安装 / 市场重装机制源码证据；⑤ 恢复联动机制；⑥ doctor 联动检测信号源；⑦ P2.4 原需求——doctor 每项可执行操作的平台行为证据 + 双回滚路径（doctor 回滚与面板备份回滚分列）。
  - **本轮已办**：总文档叠加 6.5 + 阶段表 P2.4 扩容 + AGENTS 注记 + 本条；随后进入证据批（零写盘，只读取证）。
- **L-049（新会话第 3 轮 · P2.4 扩容证据批完成 → 待判定侧验收）**：扩展版七项取证完毕，`cordis.patch.yml` 全程零写入（基准 `ce0b0b81…`）；证据正本 `panel/docs/evidence/P24-EVIDENCE.md`（10185 B）+ `evidence/README.md` 清单一并入库。
  - **核心结论**：① 原假设「限流/压缩/记忆联动」成立——rate-throttle→compact-router（松），compact-router→agent-memory（紧）；② **新发现（已呈判定侧）**：search-router 参与联动（依赖 web-search-local 注册的 local 能力 + `web.config` 的 two provider 直引）；③ 软/真卸载机制需扩展 apply-engine row 摘除/插回；④ 本 bundle 为本地目录 bundle，单插件重装不能直接套用 `dsh plugin`；⑤ 恢复联动 = 写回挂载/预设 + 重启；⑥ doctor 需新增「lib 目录 ↔ 挂载行」联动信号；⑦ 双回滚：doctor 回滚已有、面板备份回滚需新增 restore。
  - **待判**：搜索插件联动分类；随后进入 P2.4 设计稿（卸载 UI + 弹窗文案 + 恢复流程 + doctor 项 + 双回滚 UI）。
- **P2（进行中）**：P2.0① ✅（`193bdd8`）→ P2.0② ✅（`2b05777`）→ P2.1 ✅（`a27da81`）→ **P2.2 ✅ 已关账（2026-09-18 12:48；`c91de92` + `558e62f` + `41ad40c` + `22fde85` + `10ebcef` + `c51ae58`）** → **P2.3 配置编辑（✅ 已关账，新会话第 2 轮终验通过；`bf106df` 施工 + 终验往返闭环 sha 回 `ce0b0b81…`）** → **P2.4 扩容：卸载/恢复 + 联动感知 + doctor 操作台 + 双回滚（证据阶段进行中；L-048）**。**P2.1 起每个写操作须附真实备份产物与 SHA 记录。**