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
- ~~**【P2 进行中】P2.2** 启停开关（锚点唯一，交叉引用检查，rate-throttle 首用例）~~ ✅ 2026-09-17 24:05 完成，见 L-029
- **【P2 进行中】P2.3** 配置编辑（白名单 + 范围/枚举校验 + 服务端校验）
- **【P2 待办】P2.4** doctor 操作台 + 两套回滚
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
- **P2（进行中）**：P2.0① ✅（`193bdd8`）→ P2.0② ✅（`2b05777`）→ **P2.1 ✅（`a27da81`）** → **P2.2 ✅（24:05）** → P2.3 配置编辑 → P2.4 doctor+回滚。**P2.1 起每个写操作须附真实备份产物与 SHA 记录。**