# 遗留债务清单（终态 · 2026-09-20 项目关闭；2026-09-21 cordis 符合度复核追加；2026-09-21 Pack A–H5 + Pack I 全链收口；2026-09-22 C-1 侦察轮落档 + 条文审定定稿笔）

> 建立：2026-09-19（P4）。**最终化：2026-09-20（P8 终版验收通过，项目关闭）。**
> **2026-09-21 复核追加**：对照 cordis 4.0.2 做符合度复核，用户裁定"全修"，
> 按 Pack A–E 施工。A 区新增 #12–#16（已清偿），D 区新增 D-6/D-7/D-8（复核发现、
> **待用户裁定未动实现**），C-1 补一条必答设计题。关闭状态本身不变。
> **2026-09-21 Pack F 轮**：D-6 / D-7 / D-8 三项待裁**全部关闭**，清偿入 A #17 / #18 / #19；
> 施工期间出现过一次**误触裁决**（"F2 停手只落文档"），仅在未提交文档层执行过、零 commit、已丢弃，详见《D-7 追加》裁定链第 ③ 步。
> 另登记 D-9 / D-10 两条施工期新发现（只登记不修），并把 libuv 环境性失败的分流方法收进《环境注记》。
> **2026-09-21 Pack G（真实宿主冒烟）**：九项清单**八项 PASS**，第 ⑨ 项（宿主会话内一次真实联网搜索）
> 仍阻塞在用户会话凭据，按 G2 协议即停即报未擅自绕行 ⇒ **D-4 保持未关闭**；宿主侧新发现两笔登记为 D-11 / D-12。
> 证据正本：`panel/docs/evidence/G-REAL-HOST-SMOKE.md`（本轮未用 `p23-shadow-scan` 生成任何证据，见 D-2）。
>
> ### 本轮总账（cordis 符合度审计 → Pack A–G 全链，2026-09-21 收口）
> **一句话**：对照 vendored cordis 4.0.2 做符合度审计 ⇒ 三批修复（Pack A–E 全修 → 复核登记 D-6/7/8 →
> Pack F 三项收口）→ 误触事件处置 → F2 正解（裁定反转并落地三级入口解析）→ 真机验证（Pack G 九项全闭环）。
> **提交链**：`e7f21f5`(A) → `d2dd56f`(B2) → `6cd60e7`(C) → `bba6232`(D) → `857ba8a`(E) → `e66ad26`(复核落盘) →
> `b399623`(F1) → `57ebc24`(F3) → `23de06a`(F2) → `a6e7457`(F 收尾文档) → `9d1086e`(G 证据) → 本笔(D-4 关账+总账)。
> **状态**：D-6 / D-7 / D-8 已关闭（A #17/#18/#19）；D-4 已关闭（A 区外唯一用户侧动作项，见上）；
> 施工期新发现 D-9 ~ D-12 **登记在案、未修**（重试计数、夹具共享开关、statePath 随宿主 cwd 漂移、
> 宿主装有 cordis-plugin-loader 使 B2"无法对照"的前提失效）；Pack H（toolkitRoot 固定 + 对照宿主装载器）
> 未被点名，留本文件排队，本轮不启动。
> **2026-09-21 交叉验证轮（外部独立审计报告复核，代码零改动）**：对另一 agent 的 cordis 符合度审计报告
> 逐条证实/证伪并并账。该报告总体结论"符合"成立、可作为第三方验收单，但它报的三个"新问题"里
> toolkitRoot 分叉是真（= D-11 病根，见《D-11 追加》）、sougou 是沙箱侧滞后快照（新登记 D-13）、
> doctorCli 绝对路径是既有申报（`docs/embed-toolkit.md` §5 第 4 条，无新增）；其"依赖可预检"一节
> 有因果错置（新登记 D-14），其组件表把 rate-throttle / agent-memory 的清理机制写错（实为 `ctx.on`
> fiber 级回收，全文件 `ctx.effect` 零次）。**兑现 D-12**：已逐字对照宿主 loader 1.0.3 的解包链，
> 结论是 **B2 比官方更宽且分叉可观察**（7 个入口实测 4 个分叉，见《D-12 追加》）。另新登记 D-15
> （无 `contract` 的 manifest 遇 scoped 包名必被 registry 通道拒）。本轮它未覆盖 manifest 入口层
> （F2 三级解析 / `requirements.exports` 正典 / agent-memory 目录装载如实报错）——它的"符合"不含这一层。
> **2026-09-21 对外部审计报告的最终定性（用户裁定"修"之后的收口口径）**：**方向对**——
> "toolkit 落在 cordis 官方插件契约上、与 dsh-web-all 同 profile 共存"这一总结论经独立复核成立，
> 可作为这轮修复的第三方验收单；**三处不准**——① profile 路径写成 `~/.dsh-profiles/web`（真实为
> `~/.dsh/profiles/web`），② 把 cordis-plugin-loader 说成"全局安装"（实为全局 dsh CLI 的嵌套依赖），
> ③ "停用/卸载时会做交叉引用预检"夸大（实际只看行 id、不阻断、卸载根本不做——即 D-14）；
> 另把 rate-throttle / agent-memory 的清理机制写错、引用 plugin-group 的英文定位语查无出处。
> **一处盲区**——manifest 入口层（F2 三级解析 / 正典字段 / 目录装载如实报错）它没看，
> 它的"符合"不含这层；本轮 D-15 恰好是从这层里掉出来的。三条"新问题"的最终评价：
> toolkitRoot 为真且比它说的更严重（H1 已根治）、sougou 是沙箱侧陈旧快照（D-13 已立警示）、
> doctorCli 是既有申报（无新增）。
> **2026-09-21 Pack H 轮（六项债务清偿 + 通道统一，代码有改动）**：D-9 ~ D-15 **全部关账**，
> 逐笔提交 `b59f730`(H1 toolkitRoot 根治) → `36f1be0`(H2 交叉预检补全) → `e80caea`(H3 双通道统一
> + D-15 文案) → `8914d9b`(H4 D-9/D-10/D-13)；清偿记录见 A 区 #20–#23。B 区与 C-1 未动。
> **2026-09-21 Pack H5 真机复验（用户批准重启宿主 · Pack H 就此全链闭环）**：三项 H 特有验证
> **全部 PASS**，另加轻量抽样 32/32 路由、SSE、autoload↔状态文件一致（证据正本
> `panel/docs/evidence/H-REAL-HOST-REVERIFY.md`，本轮未用 `p23-shadow-scan` 生成任何证据）。
> **但真机抓出一仓内全绿抓不到的启动故障**：H3 让宿主通道开始真校验 web-search-local 配置后，
> `cordis.patch.yml`（第 61 行，当时） 那个从未加过引号的 `360`（YAML 解析成整数）变成启动期 `ValidationError`，
> 经 loader 冒到 `dsh-app-boot` 顶层 ⇒ **整个宿主 exit 1**，不是"只拒绝这一个插件"。
> 按用户裁决"选项 1 加严版"处置：该行加引号（`ce0b0b81…`/3097 B → `bb7af96f…`/3099 B，
> p24 两处硬闸期望值同步滚存、机制未放宽）→ 恢复性重启 → 复验通过、宿主持续存活。
> 连带三笔入账：**A#22 的"本机真配置实测 0 issue"确认为错账**（成因是拿逻辑验证冒充端到端装载
> 验证，见 A#22 文末与证据 §七）、新增 **A#24**（本次修复与基线滚存）、新增 **D-16**（静态 patch
> 通道校验失败掀整机 vs registry 通道单条目隔离的不对称）与 **D-17**（恢复工具与三个时点验收脚本
> 仍指已退役基准，实测在本轮改动之前就已 fail-closed 失效）。**Pack H 无待办遗留**。
> **2026-09-21 Pack I 轮（安全网 + 搜索引擎清理 · 纯仓内、零宿主动作）**：用户合并指令两件事，互不依赖。
> ① **I1 关 D-16**：新增门禁第 5 步 `scripts/patch-config-check.mjs`，把"真实 patch 文件 + 真 YAML
> 标量语义 + 宿主通道 unwrap + Config 校验"首次串成一条链路（正是 H5 故障缺的那条）。本仓无 YAML 依赖，
> 且面板的 `parseRootRows` 把值一律当字符串（复用它会把 `360` 读成 `'360'` ⇒ 假绿），故脚本自带
> **严格到 fail-closed 的 YAML 子集解析器**，并用 20 条断言在每次门禁里自证解析器没退化；报错补齐 cordis
> 原文缺的三样（文件名 + 行号 + 修法）。变异自检两发：还原坏值 ⇒ 精确指到 `cordis.patch.yml`（第 61 行，当时） 且 exit 1；
> 把解析器整数分支退化成返回字符串 ⇒ 走"本校验器不可信"分支且 exit 1。
> ② **I2 关 D-17**：`restore-cordis-baseline.mjs` **显式退役**（两条独立理由写在头注，含"它在本轮改动
> 之前就已不自洽"）；三个 P8 时点验收脚本判为**历史冻结**——其中 `terminal-acceptance-report.mjs` 查实
> **重跑会覆写已入库、已登记 sha 的证据正本**（与 D-2 同族第二处），故不只加注，直接加执行硬闸（MUT 实证：
> 摘闸后重跑会产出 10862 B 新报告、时刻与 sha 全变）。
> ③ **引擎清理（用户指令：删除 360 与搜狗）**：影响分析四项先过（剩余 6 项 ≥1、分层链 `cn` 仍有
> bing/baidu、search-router 不按引擎名路由、宿主 `~/.dsh/dsh-search-router.json` 只读核对**无引擎条目**），
> 随后 `cordis.patch.yml`（第 61 行，当时） 由 8 项减为 6 项（判据基准第 2 次滚存 `bb7af96f…` → `e8051fe9…`，
> p24 两处硬闸同步、机制未放宽）。残留按两类清算：配置面已清；历史面（审计流水、证据正本、沙箱旧快照、
> `lib/` 实现与内置默认值）一律不动并逐处列名（见 A#25）。顺带查得沙箱有 **D-13 未点名的第四份同族快照**
> `D:\dsh-test-sandbox\configs\baseline-before-switch.yml`（名字最像"基线"、且指向上游旧包名
> `@gausszhou/dsh-web-search-local`），已补登进沙箱警示文件。
> **误触事件处置**：F2 执行期间一次单选裁决误触（"停手只落文档"），仅在未提交文档层执行、零 commit，
> 已丢弃并写入《D-7 追加》裁定链第 ③ 步；D-4 补验期间两次"零命中"报告经复核证明是**取证脚本口径缺陷**
> （非搜索未发生），纠错过程写入 `D4-WEB-SEARCH-HOST-EVIDENCE.md` §三。
> **2026-09-22 C-1 条文审定轮（用户逐条过目 ★1–★20 ⇒ 定稿笔 · 纯文档 · 代码冻结维持）**：
> 89 条可验证承诺提炼成三方矩阵后，★1–★20 由协调侧分组呈用户（9 条整组过 + 11 条逐条拍板），
> 批复"全部按建议"⇒ **只改说明书 12 条 / 改代码 6 条 / 评估后再定 2 条**（逐条结论、两笔作废反转裁决、
> "原因先于修法"教训条与暂停期保留依据，见本节末「用户审定记录」）。四份正本与 `docs/p0-recon.md`
> 已按定稿修订（第五处错账 `docs/p0-recon.md`（第 56 行，当时） 的"120s"连同其下游 `migration.md` 一并更正）；
> 矩阵已并入 §5.2「原因列」（git 考古：四条 P0 **无一项属实现回归**⇒ 不存在回滚即恢复一致的路径）。
> **重排后的批次表** = `docs/contract-v1.1-recon.md` §10（批 0 定稿笔已完成 → 批 1 doctor 白名单 →
> 批 2 provides → 批 3 ★2 → 批 4 ★3 → 批 5 ★16 → 批 6 ★10 → 批 7 ★13 → 批 8 ★19 → 批 9 audit
> → 批 10 数据落地 → 批 11 版本提升），原"缺席类降级""补 localhost 支持"两个代码项已因裁决作废移除。
> 新挂待办 **D-20（文档引用守卫未建）**。**代码动工仍需协调侧对重排批计划的过裁。**
>
> **冷启动读法**（新会话只看仓库即可接上）：本文件头 → `AGENTS.md` 六条红线 →
> **`docs/contract-v1.1-recon.md`（C-1 侦察轮正本：草案六项实测修订、三方核对矩阵净账与落差总账、
> 三题裁定×核对结论、内置插件完整枚举、修订后分批计划批 0-6 + 边界清单 —— 动 v1.1 相关代码前必读；
> 两份逐行矩阵见同目录 `contract-v1.1-matrix-{migration,embed-toolkit}.md`）** →
> **`docs/feature-inventory-20260923.md`（功能全量清单 · **2026-09-29 正典化批笔 A 起定稿为正典**：F/H 编号空间冻结、
> 报数口径唯一＝重建件 23／覆盖账 68＋23＝**91**、编号空间现用至 F-93，见该文件《正典化》一节；
> 其自述的"冻结号 toolkit `916b7d1` / doctor 仓 `2f12f53`"仍是**呈审稿正文**的取证基准号，不因正典化而改。
> 排修任何"缺/坏"项前**必须先读该文件开头的缺口申报**：呈审稿到手即缺"对象①-B React 标签页"与"对象⑥"两节，
> 两节后由《续档》重建件补上）** →
> **`docs/repair-plan-20260923.md`（修复总动员 + C-1 剩余批 + 断点普查 的合流总批计划 · **草案待协调侧过裁**；
> 含高危四条的代码级取证结论与对清单的两处读数更正 —— 动任何修复代码前必读 §1 通则与 §7 待裁清单）** →
> `panel/docs/evidence/H-REAL-HOST-REVERIFY.md`（H5 真机复验 + 一次宿主整机启动故障的处置，
> **最新一棒真机证据**）→ `panel/docs/evidence/G-REAL-HOST-SMOKE.md`（含补验注记）与 `D4-WEB-SEARCH-HOST-EVIDENCE.md` →
> 门禁一条命令 `node scripts/ci-local.mjs --with-scan`（**现在含 6 步**：默认链 5 步不变，第 5 步是 Pack I 新增的
> `scripts/patch-config-check.mjs`，第 6 步是守卫批上岗的 `scripts/doc-ref-guard.mjs`；`--with-scan` 的步数账
> 6→7→6 见计划 §38.7）。**注意判据基准已滚存四次**：`cordis.patch.yml` 现基准 **`b0f304c9…`**
> （EXE-BOOT-011 施工笔 3 的 systemPrompt 接线＝第 4 次滚存；本批实读＝工作树 3190 B／blob 3104 B，sha256 与
> `scripts/p24-ui-matrix.mjs` 的 `BASE_SHA_EXPECT` 逐字节相同）。历史来路 `ce0b0b81…` → `bb7af96f…`（H5 加引号）
> → `e8051fe9…`（Pack I 引擎清理）→ `a663f61b…`（D-19 行级 `inject:`）→ `b0f304c9…`；各枚当时的字节数见 A#25
> 与计划 §29/§35，本行不重复报数——其中若干枚记的是**字符数而非字节数**，口径注记见 A#52 末。恢复工具已按 D-17 退役，
> **正确恢复动作 = `git checkout HEAD -- cordis.patch.yml`**（先自行留现场）。
> Pack I（安全网 + 引擎清理）是纯仓内工作、无宿主复验，故**没有新证据正本**，读数记在 A#25 与提交说明里。
> **2026-09-22 C-1 侦察轮（契约 v1.1 第一阶段 · 纯侦察 · 代码零改动 · doctor 仓零改动）**：按协调侧两轮指令
> （开工令 + 审核补条一~八 + 三题裁决 + **裁决修订**：标准改为"文档写到的全部正常实现和运行、效果优先"）
> 完成侦察，产出正本 = `docs/contract-v1.1-recon.md`（+ 两份逐行矩阵 `docs/contract-v1.1-matrix-migration.md`、
> `docs/contract-v1.1-matrix-embed-toolkit.md`）。**v1.1 的收口定义随之改写：= 三方核对矩阵全绿**
> （每条文档承诺"已实现 + 有测试钉住"，或"已明确移除/改写并留档"；落差双向不许存续），C-1 六项只是其中一部分。
> **本轮实测四条承重结论**（探针在沙箱 `var/scratch/c1-recon-20260922/`，只 import 判形状、零写盘、未碰 `~/.dsh`）：
> ① **`requires.services` 存在语义倒置且假阳性可复现**——`registry/src/loader.ts`（第 50 行，当时） 把契约的"依赖面"填进"注册面"、
> `doctor/src/doctor.ts`（第 275 行，当时） 再拿它比对撞名 ⇒ 两个只是**共同依赖** `webServer` 的插件，第二个被 `reg.name-collision`
> **阻断安装**（对照场景同时证明真撞名仍可检出，是倒置不是判定失效）；② **宿主对契约零消费**——宿主全局包
> 递归 grep `dsh.plugin.json` / `PLUGIN_CONTRACT_VERSION` / `CONTRACT_EVENT_NAMES` / `KNOWN_LEGACY_FIELDS`
> **全部零命中**，patch 行只带 `id`/`name`/`config` ⇒ v1.1 主体不要求宿主配合、不需为此重启；
> ③ **今天加 `provides` 两道闸同时红**（契约"未知顶层字段"error + doctor"清单根字段非法"error）⇒ "两仓同批"
> 是硬依赖且顺序唯一（doctor 白名单先落）；④ `contractEventName(p,'audit:'+x)` 与手工模板串对 8/8 逐字节相同
> ⇒ 第 2 项可做成零线格式变更的纯收编。**本轮查出既有错账四处（原文不改写，只在此滚存修订 + 成因）**：
> `:161` 审计事件"7 类"实为 **8**（漏 H1 加的 `state-save-failed`；成因：草案写于 H1 之前）；
> `:170` "5 个内置插件补 provides" 按实测应为 **3 个非空 + 桶根**（成因：按 `lib/` 目录数数，未核注册面）；
> `:166-167`/`:173` 行号 `registry/src/loader.ts` 的第 31 行（当时）→第 41 行、`registry/src/registry.ts` 的第 266 行（当时）→第 381 行（成因：同轮多次改码未回填）；
> `:133` B-1 的"10 个函数 / 6 个验收脚本"实为 **15 / 5**（成因：B-1 写于 P7，其后 P2.4 扩 mount/restore 面；
> 风险评估结论不变）。**三题裁定已定、实施批准 withheld**（分批计划过裁前代码一行不动）：题 1 走"真相收口 +
> 补钉"、桥接两项推迟入列；题 2 采"契约管解析行为、doctor 管必填性"；题 3 **整体移出 v1.1** 转 C-2；
> 第 4 项改裁 **B**（输出面按正确语义改名，`p1-smoke` 如实更新，须用户批准新裁定两处）。
> **doctor 仓基线已补（方案一，四套件全绿、跑前跑后工作树均干净）**：14/14 + 8/8 + 7/7 + 21/21；
> `acceptance-stage3.mjs` 按裁**未跑**（e) 块带真实仓根做 apply），其覆盖面记为盲区，留批 1 补。
> **【2026-09-22 批 1 状态刷新 · 上面两处前瞻已兑现，原文照录不回改】**① "实施批准 withheld / 过裁前代码
> 一行不动"已随批 0-11 过裁解除；② `acceptance-stage3` 已于**批 1** 补跑，a–g 全 PASS ⇒ 盲区还清，且实测
> e) 块只读真实 scope、写盘落影子 tmp（前后 hash 一致）⇒ doctor 侧验收口径自**批 2 起为五套件**。
> 裁定方、两条安全前置与批 11 仓归属更正见本文件 C-1 现状块 ⑥⑦ 及 `docs/contract-v1.1-recon.md` §10.3。
> 清零规则按用户终版裁定改为四类归档（不再要求"全部清零"）：
> **A 已清偿** / **B 显式遗留**（裁定不做或维持现状，附触发条件）/ **C 后续任务**（已立项，附规格草案）/
> **D 待办**（零散改进，不阻塞关闭）。每条标注**裁定方**。
> 长期协作原则（用户 2026-09-20 修正，长期有效）：用户只验收结果——原有功能在、无 bug、不影响正常使用；
> 实现方法与过程取舍由工程侧自行判断并记录在案。仅"面板作为本桶唯一管理入口"为用户明确要求，继续有效。

---

## A. 已清偿

| # | 债务 | 来源 | 清偿于 | 终态 |
|---|---|---|---|---|
| 1 | binary `minVersion` 探测 | P3 | P5 | `Probes.binaryVersion()`（`--version` 首个 semver，3s 超时）；低于下限=error、达标=无发现、取不到=warn；单测 3 分支 |
| 2 | configSchema 真校验 | P3 | P5 | `validateConfigAgainstSchema` 三形态（schemastery 调用 / zod safeParse / 纯定义动态重建）；precheck 阻断必填缺失；`registry.setConfig` 写回前校验 |
| 3 | doctor 文件面检查迁移 | P0/P3 | P5 | 按契约拆分：注册冲突 + manifest 根字段进进程内；仓级文件面留 CLI（两仓同一事实面，向后兼容） |
| 4 | REQ-10 面板审计接线 | P2/P4 | P6（展示）+ P8（持久化） | 实时 toast（P6 归一迁入唯一面板）+ **持久化落地**：`panel/manager/audit-sink.mjs` 订阅本实例 `audit:*` 全部事件（原七类；Pack H1 起 8 类，新增 `state-save-failed`，清单以 `contract.AUDIT_EVENTS` 为唯一来源，客户端孪生表由 `test/toolkit-root.test.mjs` 逐名核对） → `<状态文件同目录>/audit.jsonl`（2 MiB 单档轮转；`registry.auditLog:false` 可关、`registry.auditFile` 可改），字段白名单 `at/event/pluginId/durationMs/errorCode?`，配置内容与环境变量值一律不落（`test/audit-sink.test.mjs` 4 例）；落点经 `/v2/snapshot.auditFile` 可发现。**浏览 UI 见 D-1** |
| 5 | CI workflow | P1 | P8（本地门禁半边） | 正本门禁一条命令 `node scripts/ci-local.mjs`（npm test 全链 + 回归全跑 + doctor dry-run **数字判定** 0/0/0；`--with-scan` 追加 p23-verify）。**workflow 半边见 B-2** |
| 6 | 四份正本文档 | 规格 §8 | P8 | `docs/contract.md`（含 §7 六处偏差集中登记）、`docs/add-sub-plugin.md`、`docs/migration.md`、`docs/embed-toolkit.md`（含 §5 六条边界如实陈述） |
| 7 | semver 预发版偏差入契约全文 | P4 用户要求 5 | P8 | `docs/contract.md` §7 D-1：标准语义为何不匹配 + 本仓显式允许 + `15904f6` 修的"带比较符部分版本被误加上界"与回归用例位置 |
| 8 | configSchema → 表单完整渲染 | P4 | P5（P6 收口） | schemastery 纯定义落盘 + 归一面板递归表单 + 写回服务端真校验；旧过渡页 v2 随过渡面退役 |
| 9 | 面板 React tab registry 化 | P4 | P5→P6 | 过渡 tab 与 `/v2/ui` 已退役（`9bd52ba`），registry 管理区并入唯一 toolkit-panel |
| 10 | 面板归一与过渡面退役（用户 2026-09-19 权威修正） | P6 | P6 | 归一笔 `c4a1762` + 退役笔 `9bd52ba`；浏览器级命门验收通过；单 tab 断言 `registrations==1` 锁死。**"面板作为本桶唯一管理入口"= 用户明确要求，长期有效** |
| 11b | 审计事件名手工拼装（原 #11 的 (b) 半项） | P7 | 并入 C-1 | 用户 2026-09-20 裁定：**不单独修，并入契约 v1.1**（`audit:*` 入 `CONTRACT_EVENT_NAMES` 枚举，顺带收编三处转发表） |
| 12 | **cordis 符合度复核 Pack A**：install 幻影条目 / fiber UNLOADING 误报 / 编号无显式守卫 | 2026-09-21 复核 | 同批 | A1 事务顺序改「写内存→落盘→发通知」+ `notify()` 兜底捕获 + 回滚补 `persist(null,id)`（旧实现两条失败路径都会留分裂态）；A2 轮询补 UNLOADING 分支，错误码入契约 `FIBER_LOAD_ERROR_CODES`（四码）；A3 新增 `test/cordis-fiber-state.test.mjs`，真 cordis 实测五个终态数值与 `registry` 导出的 `FIBER_*` 对账 |
| 13 | **Pack B2**：`normalizePlugin` 选中 `default` 时丢掉模块级 `inject`/`name` | 2026-09-21 复核 | 同批 | 保守合并（补 default 所缺、不覆盖已有；函数/类的 `name` 视为 JS 推断名可被模块级声明取代）。真实代价不是显示名，而是 **cordis 读不到 `plugin.inject` ⇒ 依赖门控静默失效**。宿主装载器未安装，如实标注为"保守近似" |
| 14 | **Pack C**：`${prefix}/doctor` 在面板装配路径下从未进容器 | 2026-09-21 复核 | 同批 | `registry-host.mjs` 补 `host.provideService(doctor.serviceName, doctor)`，注册现场仍在面板（REQ-8 唯一装配点），回收靠 cordis fiber 归属。`test/toolkit-services.test.mjs` 4 例，含"双实例挂同一根 ctx 不撞名"。doctor 仓源码未动 |
| 15 | **Pack D**：活动 SSE 流不受面板卸载管辖 | 2026-09-21 复核 | 同批 | `v2-api.mjs` 加 `liveStreams` 登记表 + `closeAllStreams()`（每条 teardown 单次幂等），挂进 `panel/index.js` 既有 `ctx.effect` 卸载链。旧行为：面板拆完仍留一个每 15s 往死面板写 ping、且永不结束的流。`test/panel-sse-dispose.test.mjs` 5 例，已验证非空洞 |
| 16 | **Pack E**：inject 正向语义零覆盖 + peer 范围放行未校准 cordis | 2026-09-21 复核 | 同批 | `test/cordis-inject-lifecycle.test.mjs` 5 例（正向装配/撤依赖/再激活/两套真相分歧/全局互斥限制）；`peerDependencies` 收 `>=4.0.0-rc <5` → `^4.0.2`，新守卫断言 4.0.0/4.0.1/*-rc 均不放行。已核与 D-1 预发版偏差无冲突 |
| 17 | **Pack F1**：`hasService` 直读 cordis 代理 ⇒ 与 `Object.prototype` 同名的服务名一律误报"在场"（D-6） | 2026-09-21 复核（D-6） | Pack F1 | 改 `ctx.get(name, false)`：`ReflectService.get` 只查 isolate 映射与 store（两者都是 `Object.create(null)`），未命中直接 `return undefined` 不抛错（cordis 4.0.2 `node_modules/@deepseek-ai/cordis/src/reflect.ts`（第 233-243 行，当时） 实读）。新增 `test/host-has-service.test.mjs` 5 例（真 cordis、与 `registry-host.mjs` 同构装配）：三枚钉子（原型名未注册 false／真服务 true／缺失不抛错）+ 唯一翻面形态收口（真以 `toString` 注册服务时 true 才是正解）+ 回收面（提供方 fiber 拆掉后回 false）。头注由"如实陈述直读"改为"为什么不再直读"。变异式自检：dist 摘回旧直读 ⇒ 仅钉子一精确翻红。提交 `b399623` |
| 18 | **Pack F3**：装入成功后 `lastError` 不清，面板同屏"运行中"+"最近错误"（D-8） | 2026-09-21 复核（D-8） | Pack F3 | 修在**状态源唯一一处**：`setStatus` 转 `active` 时 `delete entry.lastError`（连带唯一时间字段 `at`）。五条到 ACTIVE 的路径（install / autoload 恢复 / setEnabled / reload / 自动重试）全部经过它，面板与 `/v2/snapshot` 都是读取方不各自缓存 ⇒ 一处修完三面同步。口径取"直接清空当前状态字段"而非 D-8 原建议的 `lastRecoveredError` 降级方案：历史已由 REQ-10 审计 JSONL 承载，再加字段是重复记账。autoload 恢复成功补一次 `persist`（否则磁盘留"盘上有、内存无"的陈旧记录）。新增 `test/registry-last-error.test.mjs` 6 例（含防过度修复一条：仍停 error 态时 `lastError` 与 `at` 必须在）。提交 `57ebc24` |
| 19 | **Pack F2**：装载器入口解析与 manifest 声明位置错位——只读顶层 `exports`，而正典在 `requirements.exports`（D-7） | 2026-09-21 裁定第 1 案 | Pack F2 | 三级解析：`requirements.exports["."]`（正典；`{"$from":"package.json#exports"}` 按继承语义换成 package.json 的表）→ 顶层 `exports["."]`（legacy 兼容，命中必 warn；与正典并存时正典赢并点名被忽略的那一份）→ `package.json` 的 `exports["."]`/`main`（T0/G1 既有层）→ `index`（`.js`/`.mjs`）目录惯例。**显式声明指向不存在的文件一律 entry-not-found 不回退**（回退即掩盖不同步）。告警经 `ResolvedPlugin.entryWarnings` 带出，由 registry 在 install/autoload 两路经 A1 同款 `log.warn` 落盘；来源随 `entrySource` 可观测。5 个内置 manifest 一字未改。新增 `test/loader-entry-resolution.test.mjs` 14 例 + 4 套带 DECOY 哨兵的夹具；摘实现变异三发（摘正典 ⇒ 8 红、摘 legacy ⇒ 2 红、改成静默回退 ⇒ 1 红）。提交 `23de06a` |
| 20 | **Pack H1**：`toolkitRoot` 随宿主启动目录漂移 + 两种落盘失效模式（D-11） | 交叉验证轮《D-11 追加》 | 同批 | 推导收敛到唯一函数 `panel/manager/toolkit-root.mjs`（**显式 config > 模块位置**，禁读 `process.cwd()`），面板把已 resolve 的值传下去。**失效模式①**（落点连目录都建不出来）：审计 sink 装配期那句无保护 `mkdirSync` 改为降级返回 `{ok:false,error,advice}`——修复前它会一路炸穿 `createToolkitServices` → 面板 `apply()`，**整个管理面板装不上**；状态面同样在装配期自查落点、不 ok 也不抛。**失效模式②**（写得进内存写不进磁盘）：`persist` 的 catch 除日志（带 statePath）外新增 `stateSaveStatus()` + 契约第 8 个审计事件 `audit:state-save-failed`，`/v2/snapshot` 带 `durability`、条目带 `persisted`，面板卡片如实标注"未落盘（重启会丢）"。按用户裁定只做最小可见化，**未引入重试**。用例 `test/toolkit-root.test.mjs` 8 例（含子进程换三个 cwd 证 cwd 无关、真实装配路径在 System32 cwd 下仍锚仓根、两种失效模式各一、快照面、事件名孪生表一致）；变异自检 MUT-A/B/C 分别让 ①b / ③③b / ④⑤ 精确翻红。连带把 `panel-sse-dispose` 的订阅数钉法从字面量 12 改为 `5 + AUDIT_EVENTS.length`（新增审计事件不再需要手改，孪生表漂移由新用例兜）。提交 `b59f730` |
| 21 | **Pack H2**：停用预检看不见 provider 引用与声明式依赖、卸载无此类预检（D-14） | 交叉验证轮 D-14 | 同批 | 服务端补齐（客户端协议零变更）：`plugin-registry.mjs` 给每个插件登记 `providers` + `pluginByRowId` / `crossRefNeedles` / `declaredDependents`；`apply-engine.mjs` 新增 `buildCrossRefs`（行 id + provider id 扫文本，再并上**文本里看不见的声明式依赖**；无 patch 行的预设托管插件按包名扫）。停用方向改用它 ⇒ `fetchProvider: local-fetch` / `searchProvider: auto-search` 这类引用终于报得出来；卸载四个 plan 构造器全部带 `crossRefs`、路由下发、卸载弹窗第一拍只出示清单第二拍才执行。**语义未放宽：只告知不阻断**（新用例正面证明带警告的停用照样落盘）。`doctor-signals.json` 一字未动。用例 `test/panel-crossrefs.test.mjs` 7 例（含非空洞证明：同一文本同一行 id 旧口径扫为 0；含漂移守卫：面板表与各 manifest 的 `registers.providers` 逐条一致）。`scripts/p22-verify.mjs` 原有一条把"报告恒为空"当正常态断言（那正是缺陷），改为逐卡写死期望（两张搜索卡必须命中、另两张必须为 0），105 项 → 109 项全绿；p1-smoke 未动。变异自检 MUT-D/E 精确翻红。提交 `36f1be0` |
| 22 | **Pack H3**：B2 与宿主装载器解包语义分叉，实测 7 入口 4 处分歧（D-12 + D-15） | 交叉验证轮《D-12 追加》 | 同批 | 用户裁选项 **3+2**：**根治** = 三个入口把元数据自带到 default（compact-router `static name`；agent-memory 改 `export default { name, apply }`，头注写明为何不用 defineProperty 改函数内建 name，并记下"改成箭头函数即失去 isConstructor 吞返回值"这格前提；web-search-local 的 default 补 `Config`）；**防回归** = `test/dual-channel-parity.test.mjs` 10 例逐入口比对两条通道交给 cordis 的 `name/inject/Config` 三元组（官方 `unwrapExports` 副本逐字抄自 1.0.3，真 loader 在场时反向复核副本，缺席即 skip）。B2 保守合并保留兜第三方形态，头注按实测改写并记录它**就地改写插件对象**的副作用。**行为收紧（已写进 CHANGELOG）**：宿主通道从此对 web-search-local 做 Standard Schema 校验（本机真配置实测 0 issue；历史坏值从"静默放行"变"明确报错"），compact-router / agent-memory 的宿主侧 fiber 名固定为声明名（影响面仅日志器名/服务撞名文案/宿主调试视图，本仓键控一律按 `manifest.id` 不受影响）。D-15：维持面板不可经 registry 通道自举，`plugin-shape-invalid` 文案改为点名真实成因（缺非空 `contract` 字段 vs 目录无 manifest）+ 被拿去当 id 的包名 + 两条修法，用例钉住。变异自检 MUT-F（摘 static name）三条精确翻红。提交 `e80caea`。**【H5 纠错 · 本行原话有一处错账】**原文"本机真配置实测 0 issue"不成立：全仓没有任何用例或脚本把真实 patch 行喂进该 schema（`dual-channel-parity` 只比 `name/inject/Config` 三元组的在场与形状；`validateConfigAgainstSchema` 只服务 registry 的 `setConfig`/安装预检，而内置插件是宿主 patch 行挂进来的、从来不经这条路），那一轮留在沙箱的探针 `dual-channel-probe.mjs` 对 `engines`/`validate`/`config` 零命中。⇒ 该结论只能是**逻辑验证被当成端到端装载验证**记录，盲区两层叠加才让坏值活到今天：**①没解析 YAML（`360` 在 YAML flow 序列里是整数）、②没经宿主通道**。**防再犯口径（写死在这里）**：凡"启用或收紧配置校验"的改动，验收必须包含"把宿主真实加载的那份声明文件、按宿主的解析方式、喂进新启用的校验器"这一步；只做 schema 层逻辑推演不得记为"实测 0 issue"。 |
| 23 | **Pack H4**：`retryAttempts` 跨段结转（D-9）、夹具 marker 跨文件互抢（D-10）、陈旧快照可能被当恢复基线（D-13） | 复核期与交叉验证轮 | 同批 | **D-9**：`setStatus` 转 ACTIVE 即归零（与 D-8 同走状态源）+ 只读诊断面 `retryAttemptsOf(id)`；**如实收窄**——现存的每段入口都会先经 `unloadEntry` 清零，D-9 原文担心的"更早隔离"实际暴露面比预期窄，收益是不变式与文案口径正确（变异结果与这条一起记在测试文件文末）。**D-10**：`contract-plugin` 的 marker 改为**调用时解析 + `process.env.FIXTURE_MARKER` 可覆盖**，五个使用方各持 pid 专属路径并退出即清；把仓内那枚 gitignore 的运行产物 marker 从原位挪走后全量 `npm test` 293/293 绿 ⇒ 使用方自带开关，同时消掉"干净克隆重即失红"的暗雷。**收尾核销（H5 轮，2026-09-21）**：复查确认自动化面已**零消费**旧路径——五个使用方（registry / panel-v2 / panel-unified / audit-sink / p7-embed）都在文件顶部把 `process.env.FIXTURE_MARKER` 指到自己 pid 专属的 tmpdir，`toolkit-root.test.mjs` 换 cwd 的子进程用的是恒成功的 `save-probe-plugin`（不吃 marker），`.panel-backups/` 里那份 G 轮脚本读的是 `last-error-plugin` 的另一枚（同名不同夹具），门禁 4/4 在旧路径缺失下再次复现通过 ⇒ 仓内 `contract-plugin/marker.flag` 判定为**孤儿**，连同其 `/tmp/stale-marker-backup.flag` 备份一并清除；夹具头注仍保留该路径作**人工翻牌缺省**（非自动消费点），行为语义一字未改。**D-13**：沙箱三份陈旧快照立警示 `D:\dsh-test-sandbox\docs\warn-stale-config-snapshots.md`（README 加指针；快照不删不改不重生成）。提交 `8914d9b` |
| 24 | **Pack H5 真机复验 + 一处配置数据修复（宿主整机启动故障）** | H5 真机（用户批准重启） | 同批 | **复验三项全 PASS**：① 宿主进程 `process.cwd()` 实测 `C:\Windows\system32`（旧公式 `resolve(cwd,"..")` 的命中场景），而 state/audit 两面都锚在 `D:\dsh-plugins\dsh-toolkit\.registry`，`/v2/snapshot` 带 `durability` 字段（旧码没有该字段 ⇒ 兼作"H1 新码在场"的判别物），7 处漂移点/公式变体/对照位复扫**零新文件**，探针装卸两次在 `audit.jsonl` 留下 4 条流水、`state.json` 与 `plugins:[]` 逐条相符；② 容器面直读（临时探针插件，只读 `ctx.registry`，验完即卸）：`compact-router` 入口级 2 条（宿主两个 agent 预设各挂一份 compaction 行）fiber 名全为声明名、`agent-memory-runtime` 的 `callback.name` 仍是 `register` 而 fiber 名已是声明名 ⇒ **H3 根治在真宿主翻面成功**，旧名 `RouterCompactionEngine`/`register` 在场 **0 条**，五个内置插件归属链全部在宿主 patch 通道（无一条挂 `toolkit-manager` 之下）；③ `web-search-local` 入口级 fiber `Config` + `~standard` 在场、state=ACTIVE。**故障与修复**：真机首次重启即整机起不来（exit 1），根因 `cordis.patch.yml`（第 61 行，当时） 的 `engines` 第 8 项 `360` 未加引号 ⇒ YAML 给整数 ⇒ H3 起宿主通道真校验 ⇒ `ValidationError` 经 loader 冒到 `dsh-app-boot` 顶层 ⇒ **面板与所有插件一起不起来**；按用户裁决加引号修复（`ce0b0b81…`/3097 B → `bb7af96f…`/3099 B，git diff 单行、CRLF 保持、改前改后 sha 留档），同文件其余 4 个 config 块（含 `rate-throttle` 的嵌套 `routing`/`staticGroups`）逐值目检**无第二处同类**（`defaultWorkspace: null` 经消费点核实为有意 null 且该插件不带 Config ⇒ 不经 schema）。**基线滚存**：`p24-verify.mjs` / `p24-ui-matrix.mjs` 两处硬闸期望值随数据修复同步滚到 `bb7af96f…`，**守卫机制一字未放宽**（仍是启动取 sha、收尾再取一次比对是否被改写），成因写入常量上方注释；历史证据文档里的 `ce0b0b81…` 记载**保留不改**（那是各轮当时的真实读数）。**如实边界三条**：① 坏值时代 `360` 引擎其实**一直在工作**（`web-search-local` （已随 S1 剔除批出包） 原 index.js（第 1050 行，当时） 有 `String(name)` 兜底并明文注明 YAML 会送数字进来），本次不是修坏引擎；② 我第一轮把宿主消失误判为"脱管拉起方式"，第 2 轮走已注册计划任务仍死、第 3 轮前台抓 stderr 才定因，误判过程记在证据 §二；③ 取证脚本自身第一轮断言口径过宽（把插件自己 spawn 的子 fiber 当入口级要求 Config 在场）造成一条假红，修正后复跑 12/12，两轮原始 JSON 都留档不删。证据正本 `panel/docs/evidence/H-REAL-HOST-REVERIFY.md` |
| 25 | **Pack I：patch 配置门禁校验（D-16）+ 安全网与历史脚本处置（D-17）+ 引擎池 8→6（用户指令）** | Pack I（用户合并指令包） | 同批（三笔提交：I1 / I2 / 引擎清理） | **I1** 新增 `scripts/patch-config-check.mjs` 并接进 `ci-local`（现为 5 步）：解析 `cordis.patch.yml` → 每行按宿主通道语义（`import(name)` → 官方 `unwrapExports` 副本 → `Config['~standard'].validate`）校验 config，无 Config 的入口**如实跳过并打印理由**（与 cordis `if (!runtime.Config) return config` 一致），认不出模块且有 config 的行**判红**（逼人来加 `HOST_ROW_MODULES` 表，不做静默放过）。现状：7 行里 2 行真校验（`web` ⇒ `@deepseek-ai/dsh-web`、`web-search-local`）、5 行如实跳过。**为什么不能复用面板解析器**：`parseRootRows` 把值一律当字符串 ⇒ 会把 `360` 读成 `'360'`，安全网直接失效，所以自带 YAML 子集解析器（核心 schema 标量 + flow/块序列 + 嵌套映射；锚点/别名/块标量/多文档/`on`、`off`、`y`、`n` 这类歧义写法/下划线数字一律抛错），并用 `selfcheckCases()` 20 条断言**每次门禁都复验一遍解析器**（解析器退化 ⇒ 判"本校验器不可信"而非安静通过）。**I2** `restore-cordis-baseline.mjs` 显式退役（理由两条写在头注：重建公式早不自洽、"钉死某一枚 sha"的概念已被滚存判据取代 ⇒ 现行恢复动作 = `git checkout HEAD -- cordis.patch.yml`）；三个 `terminal-acceptance-*.mjs` 判历史冻结（加时点与原因头注 + 横幅，不删），其中 report 那支查实**会覆写已登记 sha 的证据正本** ⇒ 加了 `process.exit(2)` 硬闸并同步更正 `evidence/README` 里"可重放"的表述、把它作为 **D-2 同族第二处**记进 D-2。**引擎清理**：`cordis.patch.yml`（第 61 行，当时） 删 `sogou` 与 `'360'`，**引擎池 8 → 6**（`searxng, google, duckduckgo, mojeek, bing, baidu`）；判据基准第 2 次滚存 `bb7af96f…`(3099 B) → **`e8051fe9…`(3085 B)**，p24 两处硬闸期望值同步（机制未放宽，注释记两次滚存来路）。`test/s6-contract-migration.test.mjs` 的手抄镜像同步为 6 项，并新增 **S6-C4** 对账断言（改 patch 忘改镜像即红；MUT-H 实证非空洞：只把镜像改回含 sogou ⇒ 1 条精确翻红，还原 ⇒ 4/4）。**如实边界四条**：① `lib/web-search-local` 的实现、`ENGINES` 注册表、`ENGINE_LAYERS.cn` 与 `defaultConfig().engines` **本轮按指令不动** ⇒ 在**没有该 patch 行覆盖**的宿主上默认仍含 sogou/360，且 `requestedEngines` 只查 `ENGINES` 不查 `cfg.engines` ⇒ **显式指名 `engine:'360'` 仍能命中实现**（配置面删除只关掉"自动链会用它们"）；② 生效层是"默认 → patch 行 → settings 节"，**settings 层已按补充指令只读核查为不存在**（见本节末《settings 层核查（补充轮）》）⇒ 本次删除没有覆盖层，宿主重启后即完全生效（该重启已在 09-22 07:50 自然发生并核实，见同节《生效现场补记》）；③ 宿主 `~/.dsh/dsh-search-router.json` 按授权**只读**核对：159 B、只有 mode/officialProviders/patterns/defaultWhenUnknown，**无引擎条目可清**、无越界；④ `.registry/state.json` 与 `audit.jsonl` 零命中引擎名（历史面按纪律只查不删）。**残留扫描分类**：配置面已清 1 处（patch:61）；历史面保留并逐处列名——仓内 `CHANGELOG`/本文件 D-13/`H-REAL-HOST-REVERIFY.md`/`P24-BATCH1-SOFT-ROUNDTRIP-FORENSICS.md`/`Q2-LAYER-SCAN.txt`；沙箱侧 40 个文件命中，其中非归档/备份目录的 12 个全是带日期的审计报告、评审文档、会话计划文件与 `docs\warn-stale-config-snapshots.md` 本身，另**新查得第四份同族快照** `configs\baseline-before-switch.yml`（09-14 13:10、无 toolkit-manager 行、写的是上游旧包名、块序列里同样有裸 `- 360`）⇒ 已补登警示，快照本身不删不改 |

| 26 | **R2 · 预设补丁脚本的 Windows 路径转义还原（`F-44` / 令面高危③）** | 功能全量清单 ③ compact-router 星标（C-1 考古以来**首例类型 2 实现回归**：`1bc831f` 正确 → `8007e22` 同笔改写行块时丢转义） | 合流波 1 · R2 笔（2026-09-25，EXE-BOOT-001 编排令第 1 批） | `toolkit:scripts/apply-preset-patch.mjs#ROW_NEW`/`#OLD_ROW_V2` 两行双写还原（+2/−2）+ 新测 `toolkit:test/preset-patch-escape.test.mjs` **3 条求值级静态断言**（不 `eval`、不 import 生产脚本、不写盘、不碰 `~/.dsh`）。**先钉后修**：修前 3 条全红（消息逐字点名单枚反斜杠形态）、修后 3/3 绿。**变异双向各红各的**：摘 ROW_NEW ⇒ 第 1、3 条红 / 第 2 条绿；摘 OLD_ROW_V2 ⇒ 第 2、3 条红 / 第 1 条绿（第 3 条是**合计钉**，设计上依赖两侧，故随任一侧重开即红 —— 无第三条独立命题，如实标注）。**现场只读复验三条**：`--status` 修前修后同为 4/4 `patched`、`preset-patch-state.json` sha 前后不变（`83a3dbee…`）、四份 `agent.cordis.yml` 现值与修后 `ROW_NEW` **逐字命中** ⇒ 回归面为零由实证给出。**成因与判据两处改述已同步全部引用处**（清单 ③ 该条 + 计划 §2 高危③ + §10.1 R2 格）：判 `patched` 者非"盘上内容仍正确"，而是 `#classify` 最后一条 **marker-sha 兜底**；坏值经实测**从未落盘**。**按裁定不扩面**：路径未改 `homedir()` 派生、`#classify` 兜底维持现状不另立项、`cordis.patch.yml` 一字未动 ⇒ 判据基准 `e8051fe9` 不滚存 |

| 27 | **R3 · 引擎点名受部署名单约束（`F-81`、`F-82` 点名/文案三面，令面高危②）** | 功能全量清单 续档⑥ 重建件（开工令"高危四条"之②＝本计划 R3；`§9.7` 已裁选案"切部署名单、不收缩 ENGINES"） | 合流波 1 · R3 笔（2026-09-25，`toolkit@09689bc`） | `web-search-local` （已随 S1 剔除批出包） 原 index.js 的 `requestedEngines` 追加与 `#engineList(cfg)` 的交集判定（含由 `searxngBaseUrl` 推出的 searxng 半边），越界点名 ⇒ `WebError` 且**在发出任何请求之前**拒；错误文案改列部署名单并点名 `not deployed`（不再把能力表 8 项当 `known`）；**模型可见名单与闸同源**：`web_search_engine` 的 description / 两个参数描述 / `tool:web_search_engine` systemPrompt 段原以模块级 `Object.keys(ENGINES)` 枚举 8 项，现由 `engineList(currentCfg())` 生成。钉子 `web-search-local` 的 engines 钉（原测试文件，随出包退役）（12 条，全走真实入口 `runSearch` + fetch 观测面计数，不给外来件增导出面）。反向钉两条：点名已部署项照常放行、**把 sogou 真写进部署名单则点名它必须放行**（证明闸比的是部署面而非硬禁两项）；自动链零变化。变异四发各红各的（摘交集 5 红 / 改成硬禁 1 红 / 错误文案回潮 1 红 / 工具名单回潮 2 红）。`cordis.patch.yml` 一字未动 ⇒ 判据基准 `e8051fe9` 不滚存。**账未清的两半**：`F-82` 的"三份名单各自维护、无一致性对账"归 W1/W7；`F-80`（外来件基本面零覆盖）只收窄不清账——搜索行为/缓存/HTML 解析/代理跳转还原等面仍零钉，W7 续补 |
| 28 | **W11-a · 通用 `/execute` 补 `plan.kind` 白名单（`F-75` token 跨种消费）** | 断点普查与续档件 ①-B（与已修的 R1 同构：R1 收客户端兜底、本笔收服务端兜底） | 合流波 1 · W11-a 笔（2026-09-25，`toolkit@9850e14`） | `toolkit:panel/index.js` 的 `/execute` 先验 kind 再交 `executePlan`：只放行"锚点+文本替换"三族（新增 `PLAN_KIND_PATCH_EDIT/TOGGLE/CONFIG_EDIT` + `GENERIC_EXECUTE_KINDS`），其余 ⇒ 新错误码 `plan-kind-not-allowed`(400) 并**点名该走的专用路由**（`DEDICATED_EXECUTE_ROUTE_BY_KIND` 覆盖 11 个专用 kind）；`kind` 缺失或不认识一律拒（fail-closed）。同笔补上 F-75 点出的成因缝：通用写方案 `#createPlan` 过去**根本没有 kind**，现给 `patch-edit` ⇒ 白名单是"认识才放行"。拒绝路径**不消耗 token、零写入**（`executePlan` 本体一字未动，仍是唯一落盘通道）。钉子 `toolkit:test/panel-execute-kind.test.mjs`（11 条，直驱真实 handler + 真 executePlan，全落 tmp 假 toolkitRoot）。变异四发（摘闸 5 红 / 白名单放宽一档 1 红 / 摘 kind 2 红 / 拒时吃 token 4 红）。**F-82 的账外之得**：本笔一条"现存族必须被显式覆盖"的枚举钉第一版按源码正则扫 `kind: "字面量"`，被"字面量改常量"这种无害重构削掉两条 ⇒ 已改为字面量与常量引用两式都解析、解析不到导出常量即判红 |
| 29 | **批 5-1 · 校验降级不再以 `ok:true` 谎称通过（★16 / `F-17` 的批 5 那一处）** | 契约正本挂账五处之首（`debt.md` 审定记录 ★16 定稿=改代码；`contract.md` 降级语义段、`add-sub-plugin.md` 批 5 那格均已记载） | 合流波 2 · 批 5 第一笔（2026-09-25，`toolkit@d544059`；本笔系 C1-006 追认入账，授权边界自该批复起定死为"波 2 照 §3 表序连续推进"） | `toolkit:contract/src/config-schema.ts#validateConfigAgainstSchema` 判定改三轴：`ok`（有没有发现不合法）／**`verified`（这次到底跑没跑校验）**／`via`。降级面一律 `ok:false + verified:false`；只有"本来就没有 schema 可验"保留 `ok:true + verified:false`。两个调用方各说各的原因并 fail-closed：`registry#setConfig` 拒写、码 `config-schema-unverified`（真不合法仍 `value-invalid`，两码不互串）；体检预检另开 `config-schema-unverified` 阻断项，**`config-schema-invalid` 语义与既有断言一字未放宽**。实测挖出并同笔收的计划外洞：坏 `{uid,refs}` 时 schemastery **不抛错但返回 `undefined`**，旧实现递归落到"无 schema ⇒ 通过"那一支（同一类谎称）⇒ 新增 `#isUsableSchema` 拦下。另一条实测纠正猜想：**未知 `type` 不是降级**（构建成功、调用时才抛 ⇒ `verified:true + ok:false`）。钉子 `toolkit:test/config-schema-degradation.test.mjs`（10 条，对 HEAD 取数 8 红 2 绿，绿的恰是两条反向钉）+ 新夹具 `test/fixtures/registry/unverified-schema`。存量零回归由用例背书：仓内 6 份真实 manifest 的 `configSchema` 实测仍全部 `verified:true`。**F-17 只翻正批 5 这一处**，批 6/8/9/10 邻近四处仍挂未实现 |

| 30 | **批 5-2 · 面板状态实时化（★11 五条件 / registry 的 fiber 实况对齐器）** | `docs/contract-v1.1-recon.md` §10.1 的两个评估项之一（用户 09-22 审定"评估后再定"⇒ 协调侧裁入波 2 批 5）；落点前 `docs/add-sub-plugin.md` §3 把"依赖离场后仍报 active"**如实写成了语义边界** ⇒ 本笔性质是"按已裁方向实现它"，不是拿代码去盖文档 | 合流波 2 · 批 5-2 笔（2026-09-25，EXE-BOOT-002 第一交付；纯 `toolkit` 仓，doctor 仓零改动） | `toolkit:registry/src/registry.ts#alignOnce` 周期读 `entry.fiber.state` 回写 status：`ACTIVE`→（若系本器降过级）即时 `active`/`align-recovered`；`PENDING/LOADING/UNLOADING`→连续 `statusAlignConfirmCount`（缺省 2）次后 `loading`/`align-gated`；`FAILED/DISPOSED`→`error` + 码取契约既有 `fiber-failed`/`fiber-disposed`。**五条件逐条**：①走 registry 既有 `timers` 封装、`stop()` 无条件清（句柄账：装配后 `Timeout=1`→`stop()` 后 0，探针 `var/scratch/exe-boot-002-20260925/b52-handle-probe.mjs`）；②映射见上，**只读不装**（不新建 fiber / 不 reload / 不调度重试 ⇒ REQ-6"隔离后不自动重试"原样成立，有专钉）；③**翻面清单**=`test/cordis-inject-lifecycle.test.mjs` 的 E1 分歧面（原文 `assert(status==='active')` 钉假象 → 现钉 `loading` + 一条 `align-gated` + `lastError` 必须缺席）与 E1 再激活（原文"registry 无需任何动作"→ 现钉一轮内回 `active` + `align-recovered`），两条双向钉＝M1/M7 变异各打中自己那一半；④与 doctor 分工写进 `docs/add-sub-plugin.md` §3 与清单 ①-B 追加注：对齐器只答"在不在跑"、**降级不写 lastError**，成因仍归 `service-missing`（同一次撤依赖两条断言并存在同一用例里）；⑤去抖=非对称（降级连续 2 次、恢复即时），参数 `statusAlignIntervalMs`(5000)/`statusAlignConfirmCount`(2) 是**代码级注入点、不进面板 18 键**（不制造"填了等于没填"的新账，同 F-11 族）|
| 30a | —— 本笔**两条自曝**（按"漏项自曝滚存"办，不等协调侧抓） | 施工期实测 | 同笔内已处置 | **(1) 首版越权防线是空洞的**：`批5-2 越权防线`第一版只断言"在飞条目全程无 `align-*` 事件"，而状态未变时 `setStatus` 是 no-op、根本不发事件 ⇒ 变异 M3（摘掉"只碰 active/自己降过"守卫）**首跑 0 红**。已补可观测版一发（在飞条目 fiber 转 FAILED 时，对齐器单独一轮不得抢发 `align-lost`；随后 `loading->error:load-failed` 必须出自 loadEntry）⇒ M3 复跑恰该条红、其余全绿。教训与批 2 那条同源：**红项归因错比红项本身更贵，但"变异 0 红"比"红项"更该怕**。**(2) 常驻定时器把两个离线路径钉死了**：`p24-ui-matrix.mjs`（mock ctx 无 `ctx.on`、跑完不 stop）与 `test/toolkit-services.test.mjs`（自己调 `createToolkitServices` 却没接 `services.stop()`）在 `node --test`（无 force-exit）下**永不退出**。根因不是我加了定时器，而是**装配现场该收尾却没收尾**——`registry-host.mjs` 早为 doctor 巡检立了 `hasEvents` 规则，我把对齐器挂在 `registry.start()` 上等于绕过了它。改法：启停移到装配现场的同一判据下（`if (hasEvents) registry.startStatusAlign()`），两处 harness 各补收尾，并加 `test/toolkit-services.test.mjs` 两向守卫（真宿主必起 / 最小宿主必不起）⇒ M8 变异恰打中正向那一发 |
| 30b | —— 本笔**边界与未做**（不得被读成"面板状态已全部实时"） | 同上 | 记录，不在本笔扩 | ①只管**经 registry 装载**的条目：内置五卡由宿主 patch/预设通道挂载、永不进 registry（横切 H3、P-1 断点①同族），其卡面是 `panel/client/index.js#stateOf` 那一套 ⇒ **F-45/F-49 两处失真仍挂 5-3**；②真机面（面板上肉眼看到徽标翻转、SSE 实时到达）统一挂**批 8 观察窗**，本笔证据面=离线直驱 + 真 cordis 用例；③`statusAlignIntervalMs` 未进桶根 18 键、未进 `config-whitelist`，面板不可配（要配须随 W1 声明面一并收口，另议）；④`degraded`/`unhealthy` 与健康行的联动未动（doctor 侧 `failureThreshold` 语义原样）；⑤最坏可见延迟 = 2×周期 = 10s，已写进正本文案，不宣称"零延迟"（真机面复验前本行不得被引用成"面板已全部实时"） |

| 31 | **批 5-3 · 面板两处卡面失真（F-45 收窄 / F-49 rate-throttle 专案）** | 功能全量清单 `:177`（compact-router 恒报"运行中·正在生效"）与 `:200`（rate-throttle 恒报"功能开关关闭，暂不生效"）；修法形态经 **C1-006 对批 5-3 的两点裁决**（继任启动包 EXE-BOOT-003 §八.2）照准 | 合流波 2 · 批 5-3 笔（2026-09-25，EXE-BOOT-003 第一交付；纯 `toolkit` 仓，doctor 仓零改动；实现笔 `toolkit@ba9d4c7`，本行为账面笔） | **F-45 按裁收窄**：清单原文"卸载或预设回滚后面板仍说它在生效"经冻结号 `916b7d1` 考古**不成立**（成因＝**类型 1 文档写过头**，非实现回归：缺席态判据 `plugin.status !== "mounted"` 出自 `53cbed4`（P2.4 批 1），`git merge-base --is-ancestor 53cbed4 916b7d1` 为真、且该号那份源码里 status 判定（`:245`）确在 dir 分支（`:253`）之前，本笔已独立复核这三条证据）⇒ 真实残留只有"正在生效"四字无判据（面板不查宿主加载结果，预设托管改动还须重启才落地）。落点＝状态行改"运行中 · 预设托管，预设的改动要重启 DSH 才生效"，只此一支。**F-49 按裁做专案不做泛化**：判据单点 `rateThrottleRoutingOn()` 只认 rate-throttle、只读服务端已下发的 `configPanel.values.routing`（值＝patch 原文，`parseConfigScalars` 按缩进解析，P2.3 已钉死无遮蔽）⇒ **不在客户端重解 YAML**；取不到返回 null 退回通用语义（面板不替插件臆断没读到的层），键缺席按源码缺省算开（`config.routing \|\| {}` + `routingCfg.enabled !== false`，`lib/rate-throttle/index.js`（第 150、167 行，当时）；顶层同族 `:157`）。`stateOf` 尾段四态以主功能（路由/冷却/降档，消费点 `:656/:781`）为准、主动节流并列呈现，两层全关才用原"暂不生效"；`DualSwitchNotice` 在路由开着时不再说"所以现在没生效"，两层全关的旧警告原样保留（含 A2 既有三句恢复指引，逐条钉住）。**验证**：先钉后修 E 节首跑 20 红/99 绿（反向钉与连续性钉修前即绿）→ 修后 127/127（`p22-cards-ui` 79→127，旧钉零删除）；三道锁＝门禁 6/6 + p1-smoke **314/0**（条数不减）+ p22-verify 110/110 + node --test 372/0 + doctor 五套件 21/26/8/7 与 stage3 a–g 全 PASS（跑前跑后 `git status` 净，真实 `~/.dsh` 扫描面 hash 前后逐字节相同 `c585738c…0bd9`/5 files）；变异＝10 概念 × 两面 20 发全红、命题可分离、还原复核 127/127（工装 `var/scratch/exe-boot-003-20260925/b53-mutate.mjs`，读数 `b53-mutate-readout.txt`）。**顺带修死一处退化锚点**：`p22-verify` Q2"层1 先判"的 html 那条，其文本锚早已落在黄警告框上（不是 `stateOf`）＝钉的位置已退化而仍显绿，本笔翻面为 `if (inner === false)` 并加一发"该判定式两面各只有一处"防再退化 |
| 31a | —— 本笔**三条自曝**（按"漏项自曝滚存"办，不等协调侧抓） | 施工期实测 | 同笔内已处置 | **(1) 还原变异时误用 `git checkout --`，把未提交的本笔实现一起抹了**：`M10` 那发一次性变异我用 `git checkout -- panel/client/index.js` 复原，该文件此刻含**未提交**的实现 ⇒ 整支实现回退到 HEAD。处置＝按上一轮完整 diff 逐字重放四段，再取证复原一致：hunk 头四组行列数（`-236,6 +236,22`/`-251,8 +267,9`/`-265,7 +282,24`/`-283,6 +317,27`）与 numstat 58/3 全部与抹前相同、`p22-cards-ui` 127/127。教训＝**变异工装只允许"内存内 pristine + writeFileSync 还原"这一种复原路径**（本仓 `b52-mutate.mjs` 已是这个写法，我这次图快走了 git 一侧）；对含未提交改动的文件，任何 `git checkout/restore/clean` 都是禁手。**(2) dir 守卫首版是"变异 0 红"的空洞格**：摘掉 `plugin.dir !== "rate-throttle"` 后 20 格无一动（现载荷下只有这一家有 `configPanel.values.routing`，形状本身兜住了）。按批 5-2 的先例（"变异 0 红比红项更该怕"）**补钉再入账**：伪造一张别家卡带同名嵌套开关（反事实件、已标注），该格现可恰打中 dir 守卫那一发。**(3) 我给自己写的变异预期有一格偏宽**：`M8`（黄警告框专案失效）我标了"E1 整卡不宣称「暂不生效」"应红，实测未红——那一格只钉字面"暂不生效"，同义失真（"所以现在没生效"）不在其射程，实际由 `E1b` 前两格承担。读数本身正确，是**预期文案超出该格能力** ⇒ 在此改述，不改代码 |
| 31b | —— 本笔**边界与未做**（不得被读成"面板卡面已全诚实"） | 同上 | 记录，不在本笔扩 | ①只动**两渲染器的状态行 + 黄警告框**；卡片**静态描述文案**（compact-router 描述未提三模式 `:191`、rate-throttle 描述只说默认关闭那半 `:214`）与四卡"改完要重启"的**提示位**仍归 **W2**（计划 `:517`/:362/:368、待裁 (g) `:534`）⇒ 与 #30b 的 W2 断点批**互引不双计**。②**F-71（健康徽标恒不出现）本笔未做**：计划 `:361` 写着它落批 5-3，而 §3 表 `:152`、覆盖账 `:191`、§10 `:508`"批 5-3 两面"与 #30b 均写"两处"⇒ 库内口径互斥，已按"升级事项即报不自裁"呈协调侧（见计划新增 §12）；且清单 `:396` 明示 F-71 属**代理实读、我方未逐字复看**，动工前须先复算（其 `:1867` 行号现实测漂到 `panel/client/index.js`（第 1879 行，当时））。③真机面（面板上肉眼看到新文案、SSE 到达）统一挂**批 8 观察窗**（计划 `:508` 已并窗），本笔证据面＝离线真跑两渲染器 + 真 `buildSnapshot` 载荷；本笔未起宿主、未碰 3080、未读写 `~/.dsh`。**批 8 先记一条已核到的事实**：兜底页那份 HTML 是装配时一次读入（`panel/index.js`（第 273 行，当时）的 `readFileSync(join(panelRoot(),"client","panel.html"))` 在插件装配体内、非每请求读）⇒ 兜底页新文案须宿主重启才见；React 客户端 `panel/client/index.js` 到浏览器的那条路本笔未查，留批 8 现场取真值。④**泛化触发条件**：出现第二家"双同名 enabled"模式插件时，才立通用按插件语义表（届时 `31a(2)` 那张反事实伪造钉即翻面成通用面验收）。⑤启停区"第二层 · 插件内部（config.enabled）"标签**未改名**为"主动节流"：该说法对它自己成立（它就是 `config.enabled`），而改名会牵动 A 节 6 处既有断言与其余四卡语义 ⇒ 记边界不扩；两层真况现由状态行 + 警告框两处承担。⑥`cordis.patch.yml` 一字未动（sha256 前 8 位基准 `e8051fe9` 不滚存） |

| 32 | **批 6 · 入口第③级纳入"显式声明不回退"红线（★10 / F-17 的批 6 那一处）** | `docs/debt.md`（第 368 行，当时） C 区"改代码（6 条）"桶；`docs/contract-v1.1-recon.md`（第 217 行，当时＝A-21 格） A-21"红线只覆盖 ①②，③④ 仍静默回退"；`docs/contract.md`（第 138-141 行，当时） 与 `docs/add-sub-plugin.md`（第 88-89 行，当时） 的"【批 6 落地，当前只覆盖①②】"前向标注；功能全量清单 `:76`（F-17 五处之二） | 合流波 2 · 批 6 笔（2026-09-25，EXE-BOOT-003 第二交付；纯 `toolkit` 仓，doctor 仓零改动；实现笔 `toolkit@9d7589c`，本行为账面笔） | **成因定性＝类型 3（实现未跟上已裁方向）**，不是回归也不是文档写窄：`resolveEntry` ③ 级今天写成 `fromPkgExports ? return : 继续`（`loader.ts` 旧 :290-296），目标不存在就落下级 —— 而 package.json 同样是作者显式写的声明。落点：③ 级改 fail-closed，`exports['.']` 三形态（裸字符串 / 映射里的字符串 / `{".":{default\|node}}`）与 `main` 声明了却缺失 ⇒ `entry-not-found` 给绝对路径，新增 `pkgDeclaredMissingMessage`（与 ①② 同构、不提 manifest 表）；抽 `pkgDotDeclaration()`（读声明值不判存在）让顺位选择逻辑只有一份，`resolvePkgExportsTarget` 在它之上叠存在性 ⇒ monorepo 候选扫描 `hasDirectEntry` **仍是容错语义**（红线与容错刻意分开，M6 专钉）。"本级没声明"三种口径原样走惯例：表里无 `.` 键 / 对象形态只有 `types` / `main` 空串（与 `exports['.']===""` 同口径）。**补做 recon 漏的那半张存量核验**：§10.2 只核了 `package.json#exports` 12 条目 + 7 份 manifest `requirements.exports`，**没核 `main`** ⇒ 本批补核两仓 15 个③级有声明的目录，"声明了却不存在"0 个（探针 `var/scratch/exe-boot-003-20260925/b6-stock-main-audit.mjs`），与门禁"真实仓 dry-run 0/0/0、fixable=0"互证。**验证**：先钉后修 = `test/t0-loader-entry.test.mjs` ★10 系列 7 条首跑 **3 红/10 绿**（反向与正向格修前即绿；每个反向格放 `index.js` 哨兵诱饵，静默回退会"装载成功"因而精确翻红）→ 修后 28/28（t0 14 + `loader-entry-resolution` 14）；顺带补上 recon `:167` 记的两处旧缺口（`entrySource="package.json#main"`、`index-convention` 此前零断言）。三道锁 = 门禁 **6/6**、`p1-smoke` **314/0** 不减、`node --test` **379/0**（372→379，+7 全来自本批）、doctor 五套件 **21/26/8/7** + stage3 **a–g 全 PASS**、`~/.dsh` hash 前后 `c585738c…0bd9`/5 files 逐字节相同。变异 = **7 发各红各的**（M1 exports 恰 2 红 / M2 main 恰 1 红 ⇒ 两形态不靠同一条代码 / M3 过宽收紧恰 2 反向红 / M4 空串守卫恰 1 红 / M5 摘④恰 3 红 / M6 候选扫描恰 2 红 / M7 来源面误标恰 2 红），还原复核 28/28；**recon 批 6 格要求的"①② 既有用例之外的新用例翻红"成立（M1/M2 未牵动 ①② 任何一格）**。契约同步：`contract.md` 顺位表 ③④ 两行 + 红线段、`add-sub-plugin.md` §2 要点 1 由前向标注改写为实况；清单 `:76` 行后追加状态注（**只翻批 6 那一处**，余下 批 8/批 9/批 10 邻近三处仍挂，沿用 F-17 先例防整条翻正误读） |
| 32a | —— 本笔**两条自曝**（按"漏项自曝滚存"办） | 施工期实测 | 同笔内已处置 | **(1) 变异写法有一发触发构建失败＝无效读数**：M7 首版写成 `if (dot !== undefined) return undefined`，TS2345（其后 `join(dir, dot)` 被窄化成 `undefined`）⇒ 读到的是构建红而不是用例红，正符合本仓"变异写法必须先能编译"那条口径（`docs/debt.md`（第 390 行，当时） 系）。工装当场把它判为 `★构建失败=无效读数`、不充数，换成能编译的同义变异（③ 正向 `source` 误标成 `index-convention`）重跑 ⇒ 恰 2 条 entrySource 断言红，并顺带证明"只断 `entryPath` 的旧用例对来源面不设防"。**(2) 一条等价变异暴露我自己写的冗余守卫**：M8（摘掉 `pkg ? … : undefined`）实测 **0 红**。先按"无独立钉"入账的冲动查回去：`pkgDotDeclaration(undefined)` 自有空值守卫 ⇒ 这条 ternary 是**等价变异**，不是"缺钉"。按"不为不可能的场景加代码"把冗余收掉（现写法 `pkgDotDeclaration(pkg?.['exports'])`），比留一条没人钉的分支诚实；教训口径＝**0 红有两种因：缺钉 / 等价变异，必须分清，否则补的钉是给冗余加的**。另附一笔小自曝：本批测试文件写入时两次漏掉 `=>`（`async (t) {`），表现为整个文件加载失败而非用例红——`node --test` 下这类"解析期失败"只报一条 not ok，定位靠逐行 bisect + 单行 `node --check`，已用该法定位并修好（不是工具问题，是我拼写） |
| 32b | —— 本笔**边界与未做**（不得被读成"入口解析已无缺口"） | 同上 | 记录，不在本笔扩 | ①**装载行为真机面按 C1-006 批复并入批 8 观察窗**（该窗集合＝R1 真机复验＋批 5-3 两面＋W11 真机面＋批 6 装载行为；本批未重启宿主、未碰 3080、未读写 `~/.dsh`）⇒ 代价已知：批 6 的真机结论晚数批到达，收紧前的存量核验与 0/0/0 是本批唯一的真机前置替代证据。②`entryNotFoundMessage` 里"该目录没有 dsh.plugin.json，也没有 package.json 和 index.js/index.mjs"那一支在 `test/` 与 `scripts/` 内 **0 钉**（本批查出、**非本批引入**，不夹带补钉；归 recon `:167` 那张"文案格无钉"总账）。③`exports['.']` 的更深 Node 语义（数组形态、条件嵌套、`exports` 非 `.` 子路径）本仓不实现也不解释，维持 T0/G1 现状口径。④recon A-15 记的"三级/四级叙述三副本、无一致性用例"整合属纯文档线，本批只改与红线直接相关的行，**不顺手合并叙述**。⑤`resolvePkgExportsTarget` 现在只服务候选扫描（`hasDirectEntry`）一处调用点，刻意保留其容错返回 `undefined` 的签名，不改名为 throw——改名会把红线扩散到"只读扫描"面（M6 就是钉这一格的）。⑥`cordis.patch.yml` 一字未动（基准 sha256 前 8 位 `e8051fe9`） |

| 33 | **批 7 · 面板守卫 ★13 判据泛化 + 扫描面扩面（连带 P2-10）** | `docs/debt.md`（第 372 行，当时） C 区"改代码（6 条）"桶的批 7 格；`docs/contract-v1.1-recon.md`（第 356 行，当时＝批 7 行） 批 7 行（判据从"5 个内置名"泛化 + 扫描面覆盖 `panel/manager` 其余文件 + 反例自证 + 例外必须显式豁免带依据）；`docs/contract-v1.1-recon.md`（第 128 行，当时＝P2-10 格） **P2-10**（① p4 失明于第三方新插件名、② 承诺文本把面板纪律记给 `pluggable-lint`＝张冠李戴、③ `docs/migration.md`（第 50-51 行，当时） 自认硬编码须原样保留）；`docs/add-sub-plugin.md`（第 205-212 行，当时） 的"【批 7 落地，当前如上】"前向标注 | 合流波 2 · 批 7 笔（2026-09-25，EXE-BOOT-003 第三交付；纯 `toolkit` 仓，doctor 仓零改动；实现笔 `toolkit@54ccba9`，本行为账面笔） | **成因定性＝类型 1（承诺面窄于纪律面）**：纪律写的是"改了面板代码就是 bug"，实现只盯 5 个手写名 + 6 个手写文件，对第三方插件名与 `panel/manager` 其余 10 个文件**完全失明**；不是回归（这条判据从来没泛化过），也不是文档写过头。**判据改三条**：① `name`——名字集**从仓内派生**（`lib/` 每个子目录名 ∪ manifest `aliases` 末段去 `dsh-` 前缀），加第 6 个内置插件判据自己长出来；② `identity`——任何 `"@scope/name"` 字面量，只要不是 `package.json` 声明过的依赖/开发依赖，按插件身份算 ⇒ 为第三方插件改面板会被抓到，真框架依赖（`@deepseek-ai/*`）不误报；③ `module`——`lib/` 引用三形态（`from`/`import()`/`require`）一字未改。**扫描面改动态**：根 `index.js` + `panel/index.js` + `panel/manager/` 全部 `.mjs`（13 个，新增自动进面）+ 客户端两文件（`panel/client/index.js` 与本批**新纳面**的 `panel/client/panel.html`，仅 import 形态——UI 文案常量点名属呈现资产）⇒ 6 文件 → **17 文件**。**三条设计口径**：注释行不参与判据（纪律管依赖面与身份面，散文提个名字不是依赖；不这么做，扩面后 8 处解释性注释会变成假违规）；点名豁免集中登记 `NAME_EXEMPTIONS` 四条并逐条写依据（`plugin-registry.mjs` 插件表与 `DEPENDENCIES`、`snapshot.mjs` 的 `ORIGINS/ROW_IDS` 与 P2.3 `buildConfigPanel` 分支、`config-whitelist.mjs` 唯一可写行与 18 键、`uninstall.mjs` 的 compact-router 预设通路；依据同源＝`migration.md` §4 前置 2"P2.4 深度生命周期资产要求原样保留"）；**豁免只免"点名"、从免不掉 `lib/` import**，且死条目（挂着豁免却无真实命中）判红防腐烂。**验证**：`test/p4-panel-guard.test.mjs` 9 格（①recon 点名的反例、②派生性用临时 lib 目录 + 新 alias 证伪、③注释口径、④框架依赖不误报、⑤import 三形态＋豁免不外溢、⑥面动态、⑦豁免不死、⑧真跑 0 命中、⑨整词形）。**反向自证代替"修前红"**（理由见 #33a(1)）：8 发逐条回退判据，每发恰咬住钉它的那几格、**无 0 红**（M1→②/M2→①/M3→③+⑧/M4→⑥+⑧/M5→⑤/M6→⑦/M7→⑤/M8→⑨），还原复核 9/9。三道锁＝门禁 **6/6**、`p1-smoke` **314/0** 不减、`node --test` **388/0**（379→388，+9 全来自本批）、doctor 五套件 **21/26/8/7** + stage3 **a–g 全 PASS**（跑前跑后 `git status` 净、`~/.dsh` hash 前后相同）、真实仓 dry-run `0/0/0`/`fixable=0`。文档兑现：`add-sub-plugin.md` ★13 覆盖面段改写为实况（含 P2-10 ② 的**面指对守卫**：`pluggable-lint` 只管 `lib/`+`test/` 的兄弟 import/re-export，不碰面板） |
| 33a | —— 本笔**三条自曝**（按"漏项自曝滚存"办，不等协调侧抓） | 施工期实测 | 同笔内已处置 | **(1) 本批没有常规"先钉后修"的修前红读数，如实申报并用等价证据替代**：交付物**就是那条判据本身**，判据在修前不存在——把新钉喂给旧脚本只会以"import 不到导出名"整体报错，那不是行为读数。改用可证伪等价物＝**逐条把新判据回退成旧写法，期望恰好咬住钉它的那几格**（8 发全中、无 0 红）。此法在"交付物是守卫/门禁脚本"这类批次里通用，记为口径。**同时这一格按常设纪律不算已通过**：若协调侧认为"守卫类批次必须有修前红"，请点，我按你们指定的形态补造（例如临时把守卫切回旧配置跑一次真树）。**(2) 我自己写了一格空洞断言，被自己的变异咬出来**：③ 那格本来要证"注释行不参与判据"，却把 `exemptNames` 传成 `true`＝先把点名规则关掉再证它没响，**永远绿**；M3（注释参与判据）跑下去 ③ 不红、只有 ⑧ 红，才暴露这点。改法是 `exemptNames:false` + 补一对手照（同样两个名字写在代码位必须各命中一次，防前一格靠判据失灵变绿），M3 重跑现恰咬 ③+⑧。这正是批 5-2 立的"断言必须可观测"同族复现。**(3) 施工中途我自己削弱过判据并留下了一个真空格**：`MODULE_PATTERNS` 的 `import(` 那条被我写成 `\s+`，`import('lib/…')` 无空格形态静默漏判——当时没有任何用例会红。处置＝补第 ⑤ 格的三形态断言，并用 M7 把这次错手**原样重放**证明现在咬得住。另：守卫脚本块注释里写了 `lib/*/`，`*/` 提前结束注释导致语法错（`node --check` 抓到，非用例红）；以及名字判据最初把 `-` 当词边界，`web-search-local-extra` 会被误判成点名（⑨ 那一格反证后收成整词）——两处都是"判据过宽/过窄"方向相反的自纠，一并记 |
| 33b | —— 本笔**边界与未做**（不得被读成"面板已被全面守卫"） | 同上 | 记录，不在本笔扩 | ①**豁免是文件级**：那四个文件里"新增的点名"不受检（新加一个 `if (dir === "x")` 不会被咬）。要收到行/块级得先给每处点名加锚，另批做；本批先把"死条目判红"和"豁免不外溢到 import"两条兜住。②`identity` 只认 `@scope/name` 形状；**不带 scope 的裸词第三方插件名与英文散文无法机械区分**，抓不到 ⇒ 守卫不承诺覆盖那一形（写进文档，不夸成全面守卫）。③名字集派生自 `lib/` 目录与 aliases；若将来在 `lib/` 下放非插件目录，其名字会进判据（当前 `lib/` 只有 5 个插件目录，实测），届时按需排除。④P2-10 ③（`migration.md` §4 前置 2 与面板纪律按字面永远冲突那条）**本批不裁**：走的是"显式豁免 + 写依据"的既有口径（`docs/debt.md`（第 333-335 行，当时） 已记该前置按字面永远满足不了、须升级用户裁决不许悄悄消失）——豁免清单就是那条"不许悄悄"的落地形式。5 本批未碰 `pluggable-lint.mjs` 代码（P2-10 ② 属承诺文本张冠李戴，已改文本）；未碰 doctor 仓扫描面（`isSkippedScanDir`/`MANIFEST_TOP_KEYS` 归 `f423d4a` 与 D-UI-06 已裁边界，批 7 无改动授权）。⑥`cordis.patch.yml` 一字未动（基准 sha256 前 8 位 `e8051fe9`）。⑦**批 8 是真机窗，动工前单独报点**（窗集合已合并 R1/批 5-3 两面/W11/批 6 装载行为，见 §13.1），本笔不启动任何真机动作 |

| 34 | **择机纯文档笔 · F-71 归属同步＋C-3 两处错账复算＋F-17 引用同步（EXE-BOOT-005 第一交付）** | C1-006 批复（F-71 归 W2）；计划 §11.3(a)/(b) 与清单《到货登记》四的两处"待复算"标记；计划 §14.2 区间写法成因记 | 择机笔（2026-09-26；纯文档、两仓代码零改动、`cordis.patch.yml` 一字未动、不碰 `~/.dsh`） | ① **F-71 归 W2**：五处互斥消解＝批 5-3 交付面"两处"（F-45/F-49），计划 `:361` 判为错处（成因＝§9.6 追加落位时按句内括注"与 5-2 同族故同批"就近归批，而 §3/§4 表格账面自始只记"两处"、§9.6 又自限"不改上文表格" ⇒ 矛盾存续到交付时才被 #31b ② 呈裁）；其余五处（计划 `:152/:191/:323/:508`＋本表 #30b）与裁决一致照录。后续引 F-71 落位一律写"W2"；W2 动工前置＝先复算代理读数＋锚点漂移（`:1867`→`panel/client/index.js`（第 1879 行，当时））。② **覆盖账 22→23＝68→91 定稿**：重建件实数 23（F-69…F-91 连续、条条有独立条目、无空号无并号；工装 `var/scratch/exe-boot-005-20260926/fn-star-enumerate.mjs` 可复跑）；"并号"假说排除，"22"成因＝F-83（与 ①-B 健康格共享）/F-91（非缺陷·开源前置）之一被排除、两案计数不可区分故按"不猜"记到可证边界；F-91 留在编号空间与覆盖账内。引用面清单见计划 §15.2，后续报数一律 23/91。③ **F-19 考据定谳**：数法（正文 ★ 阅读顺位、H1–H3 占 1–3）经 F-4/F-17/F-22/F-25/F-26/F-44/F-61/F-68 八锚互证 ⇒ **F-19＝precheck 只读门禁放行**（清单 `:90`）；W11-b 所修 /plan 任意文件写＝**F-92** 独立承载；**连带漏项自曝**：F-19 的 W11 口径"门禁分级口径统一成文"半边库内无兑现记录（检索仅计划 `:175/:298` 挂口径、无交付账），报协调侧裁落位。④ **F-17 区间写法**："批 6/7/8/9/11"（计划 `:192`）及下游 `:154/:688` 照录，更正以计划 §14.2＋§15.4 为准；契约正本五挂账闭 2/5，余三＝批 8/批 9/批 10 邻近 |

| 35 | **批 8 代码半 · install/confirm 补逐字确认（★19 / F-17 的批 8 那一处）** | `docs/debt.md`（第 378 行，当时） C 区"改代码（6 条）"桶的批 8 格；`docs/contract-v1.1-recon.md`（第 221 行，当时＝A-32 格） A-32（契约"所有写操作都要逐字 confirm"的违例格）＋`:357` 批 8 行；`docs/add-sub-plugin.md`（第 149 行，当时） 前向标注；功能全量清单 `:76`（F-17 五处之三） | 合流波 2 · 批 8 代码半（2026-09-26，EXE-BOOT-005 第二交付；纯 `toolkit` 仓，doctor 仓零改动；实现笔 `toolkit@d4b681b`，本行为账面笔） | **成因定性＝"以预检通过为闸"的临时口径未跟契约全量逐字纪律**：v2 四条写路由（uninstall/enabled/reload/config）落地时即带 `requireConfirm`，install 因装前无插件 id 可用被单独留口、审定挂账 ★19 ⇒ 非回归也非文档写窄，是"留口待补"的兑现笔。落点：confirm 逐字等于**安装源标识**（local＝向导第一步输入的目录绝对路径 / npm＝spec——双方请求前都已知的同一事实，零契约形状变更）；闸序＝形状校验后、install 前。客户端向导同批补逐字确认输入（重输源路径前按钮禁用、请求携带 confirm、新预检清空）。**验证**：先钉后修＝修前红 **3/34 绿**（缺 confirm、逐字不符、E2E disabled 三格；反向钉修前即绿）→ 修后同组 **37/37**；变异 **5 发逐格各红各的**（M1 摘闸恰 3 红＝修前重放 / M2 trim 恰 ②a / M3 case 恰 ②b / M4 摘 disabled 恰 E2E / M5 客户端摘 confirm 恰 E2E），还原＝内存 pristine 写回（未用 git）。三道锁＝门禁 **6/6**、`p1-smoke` **314/0** 不减、`node --test` **388→394**（+6 全来自 `test/install-confirm-gate.test.mjs`：①②a②b③④⑤）、`p22-cards-ui` **127/127**、doctor 真实仓 dry-run **0/0/0**。**基线口径更新：node --test 394。**施工自曝一处（客户端闭括号语法错把 panel-unified 十格打成整文件编译红——非行为读数；**改 client bundle 后先 `node --check` 立为口径**）。**边界**：批 8 余面（演练插件、批 4-③ 运行时验证、真机观察窗）未动，见计划 §16.1；`cordis.patch.yml` 一字未动（基准 `e8051fe9`） |

| 36 | **批 9 · audit:* 入枚举 + 发名收编（F-17 的批 9 那一处 / 债务 #11b 裁定兑现）** | 本表 #11b（用户 2026-09-20 裁定"并入契约 v1.1：audit:* 入 CONTRACT_EVENT_NAMES 枚举、顺带收编转发表"）；`contract.md` §3 批 9 落地段（已裁验收口径：零线格式变更、contractEventName 对 8/8 逐字节相同）；功能全量清单 `:76`（F-17 五处之四） | 合流波 2 · 批 9（2026-09-26，EXE-BOOT-005 第三交付；纯 `toolkit` 仓，doctor 仓零改动；实现笔 `toolkit@7ef8d66`，本行为账面笔；批 8 闭窗补记三行见计划 §17.1） | **成因定性＝审计事件是"契约事件名之外的前缀化扩展"自发长大**：5 条契约事件名入枚举时 audit:* 尚不存在，Pack H1 追加第 8 条后已命名空间无冲突故一直未收编；#11b 裁定并入契约 v1.1 兑现。落点：`naming.ts` 枚举收编 8 条 `audit:*` 字面量（5→13，as const 保持类型）＋`registry.ts` audit() 发名改走 `contractEventName`（模板字面量类型 ⇒ AuditEvent 编译期受枚举约束、零 cast）。**零线格式变更由断言证明**：对外名对 8/8 逐字节相同（②格 BEFORE_WIRE 硬编码参照）。**验证**：先钉后修＝修前红 **3/1 绿**（枚举完整性/静态防回潮/条数联动；字节等修前即绿＝拼法本来正确的反向钉）→ 修后 **4/4**；变异 **3 发逐格各红各的**（M1 摘枚举恰①④／M2 手工模板回潮恰③、②绿＝零变更证明面／M3 基础名漂移＋dist 重建恰②＋⑥孪生）。三道锁＝门禁 **6/6**、`p1-smoke` **314/0**、`node --test` **394→398**（+4 全来自 `test/audit-event-enum.test.mjs`）、`p22-cards-ui` **127/127**、doctor 真实仓 dry-run **0/0/0**。**基线口径更新：node --test 398。**自曝两条：工装 spawnSync('npm') 于 Windows 静默失败致首轮 M1/M3 空转 0 红（**0 红先查工装有效性再查缺钉/等价**，并轨既有判据）；静态钉首版咬住自己注释里的模板串字面（锚与注释措辞须互斥）。消费方普查：枚举扩容引用面仅 `test/contract.test.mjs`（第 233 行，当时） 成员断言（扩容后仍绿）、无 length===5 面；v2-api SSE 名表与 audit-sink 保持既有派生不动（零行为差，不为收编而收编）。**边界**：真机面＝否（对外名零变化、无用户可见差异）；客户端孪生表仍是唯一手抄面（ModuleLoader 无法 import ESM 的既裁形态，toolkit-root ⑥ 锁）；`cordis.patch.yml` 一字未动（基准 `e8051fe9`） |
| 37 | **批 10 · provides 数据落地＋events/panels 形状守卫（F-3 数据半边 / F-7 / D-13 ① / 批 3 验收令遗留② / F-17 的批 10 邻近处）** | `contract-v1.1-recon.md` §1 第 4 项＋§4 实测名单（C-1 第 4 项）、§10.3 批 10 格；`repair-plan-20260923.md` §3 批 10 格与 §16 断点修复批"数据半边等批 10"；`contract.md` §7 D-10 数据半边、D-13 ①；本文件 C-1 序言 ⑩⑫（`:265-274`）；功能全量清单 `:42/:56/:76`（F-17 五处之五） | 合流波 2 · 批 10（2026-09-26，EXE-BOOT-006 第一交付；纯 `toolkit` 仓，doctor 仓零改动；按启动包 §八.3 特批"按子件分笔落"：实现三笔 `e43babe`（provides 数据）＋`fa1806f`（events 校验）＋`3fa8f9f`（panels 守卫）＋账面笔本行与计划 §18，笔间不请裁） | **四件交付**：① provides 数据落地——compact-router（services=[compaction]＋commands 5 条）／search-router（providers=[auto-search]）／web-search-local（providers=[local-multi, local-fetch]）三份与实供 1:1，且与 legacy `requirements.registers` 同槽同值 ⇒ 输出面零变化；**桶根倒置纠正**＝provides.services=[registry, doctor]（F-7"代码实供两服务而声明为空"的数据半边；命名循 legacy registers 的去前缀逻辑名惯例；`requires.services=[webServer]`／`registers.inject=[webServer]` 是依赖面真实声明原样保留）；rate-throttle／agent-memory 空即如实**不补**（反向钉）；panel/ 不动并记档（D-15）。② events 最小形状（D-13 ①）：`requirements.registers.events` 须字符串数组且成员非空，契约单层、甲案位置不动，doctor 仓零改动。③ panels 模块绑定守卫（批 3 遗留②）：bindRuntimeStatics 复用 validateModuleExports 判据，`数组＋每项非空 id`自此**双路成立**，违例 fail-closed 同码 `plugin-shape-invalid`；同笔对齐两路"非空"判据（纯空白也拒）。④ 五卡健康列数据半边＝①的声明数据（与 W2 提示位互引不双计；呈现修复仍归 W2/W7）。**验证**：先钉后修＝笔 A 修前红 5/绿 3→8/8、笔 B 修前红 1/绿 1→20/20、笔 C 修前红 4/绿 20→24/24；变异 **7 发逐格各红各的**（M1 桶根摘 doctor／M2 补空 provides 恰反向钉／M3 命令漂移同命题双钉／M4 摘 events 支／M5 过宽缺席也报／M6 摘 fail-closed 恰 3 守卫钉／M7 摘 trim 同判；工装 `var/scratch/exe-boot-006-20260926/b10{a,b,c}-mutate.mjs`）。三道锁（逐笔）＝门禁 **6/6**＋doctor 四套件 **26/8/7/21**＋stage3 **a–g 全 PASS**＋`~/.dsh` hash 逐笔前后 `c585738c…0bd9`/5 files 逐字节相同；`node --test` **398→416**（真用例 +14＝8＋2＋4；另有发现机制对新增 4 夹具 .js 的 4 格计数——416＝375＋41 构成口径见计划 §18.2）；`p1-smoke` **314/0**；`p22-cards-ui` **127/127**；doctor 真实仓 dry-run **0/0/0**。**基线口径更新入账：`node --test` 416（构成 375＋41，同 398＝361＋37 口径）。自曝三条**：变异锚 CRLF 未命中即"不充数"修锚重跑；416≠412 差额查成因为发现机制计数（防"+N 全来自新钉"照抄成错账）；`add-sub-plugin.md` §2 取数口径段仍是批 2 前状态（有"被取代"括注、正文未改）归 W10 只报不夹带。**边界与待裁**：面板可见面零变化 ⇒ 条件真机未触发、无观察窗需求；`cordis.patch.yml` 基准 `e8051fe9` 未动；q2-layer-scan 只扫 `lib/*`、桶根不在计数（已写明，桶根合法性由钉子第 8 条＋dry-run 0/0/0 覆盖）；**F-62 余下半边（A 侧撞名读 provides）无批次归属，报协调侧裁（建议随 W9）**；D-21 两补法随批附提议（建议 (a) 注入替身单独成口）；D-2/D-3 启动包记"批 10 邻笔"但 §3 格未含 ⇒ 未夹带、请裁排期；F-64 邻近仅记界不修（W9 原口径） |
| 38 | **批 11 · 契约版本 1.0.0→1.1.0（C-1 第 6 项 / F-68；v1.1 最后一笔）** | 本表 C-1 第 6 项（`:300`）；`contract-v1.1-recon.md` §1 第 6 项、§10.3 批 11 格与 §4"批 11 影响面"（①②③⑥ 实测清单＋③④两计划漏项自曝滚存）；`contract.md` §8 升版判据段；功能全量清单 :275（F-68） | 合流波 2 · 批 11（2026-09-26，EXE-BOOT-006 第二交付；纯 `toolkit` 仓，独立 doctor 仓零改动——recon §4 归属考古后 C-1 期该仓仍只批 1 一笔；实现笔 `toolkit@e8880c8`，账面笔本行＋计划 §19；**R4 回引：doctor 仓 `652d17d`**，互引不合并） | **落点**：`types.ts` 常量 '1.0.0'→'1.1.0'（v1.1 增量均为非破坏、`^1.0` 旧清单零迁移）＋`doctor/src/doctor.ts` validate() 硬编码字面量改引用常量＋`validate.ts` fix 提示串改插值（③漏项）。**`^1.1` 红线解除**："勿提前写 ^1.1"的前提（实现仍为 1.0.0）已消失、`^1.1` 自此可写，对偶（1.0.0 仍被 ^1.1 拒）钉死；破坏性变更才升主版本的红线未触碰。**验证**：先钉后修＝修前红 **3/绿 39**（常量钉翻 1.1.0／对偶／doctor validate ^1.1 钉；提示串钉属"升版后翻红"面由 M10 证可伪）→ 修后 **42/42**；连带消息文本钉改引用常量（裁定 15 语义等价）；变异 **3 发逐格各红各的**（M8 常量回退恰"版本已升"族三红／M9 doctor 回退恰 validate 钉／M10 提示串回退恰提示串钉；工装 `var/scratch/exe-boot-006-20260926/b11-mutate.mjs`）。三道锁＝门禁 **6/6**（61.5s）＋doctor 四套件 **26/8/7/21**＋stage3 **a–g 全 PASS**＋`~/.dsh` hash 前后 `c585738c…0bd9`/5 files 逐字节相同；`node --test` **416→419**（+3 全来自新钉）；`p1-smoke` **314/0**；`p22-cards-ui` **127/127**；真实仓 dry-run **0/0/0**。**存量判定**：6 份 manifest `"contract": "^1.0"` 不动（实测对偶）；文档字样面按 recon §4-⑥ 收（contract.md 三处/inventory F-68/CHANGELOG 批 11 节），历史字样照录不改（p0-recon:92、recon §1/§4、CHANGELOG:508、本表 :300 计划原文）。**边界**：真机面＝否（无用户可见差异；宿主不读契约常量）；`cordis.patch.yml` 基准 `e8051fe9` 未动 |
| 39 | **W2 第一至三笔（呈文交出＋F-22/F-76 兜底文案翻正＋F-71 复算翻正＋F-74 复算复现修复）** | C1-006 批复第三节开工令（第一件改名批呈文／第二件 W2 开工）；§3 W2 格＋断点普查 30 格＋清单 :98/:336/:344（F-22/F-71/F-74）；§15 ② "W2 动工前先复算代理读数"前置令 | 合流波 3 · W2（2026-09-26，EXE-BOOT-006 第三交付；纯 `toolkit` 仓，doctor 仓零改动；呈文笔 `bbaead9`（§20 改名批方案，批准门中不动工）＋W2-1 `237eecd`＋W2-2 `83d6c71`＋W2-3 `f6635ea`；账面笔本行＋计划 §21） | **三笔两翻正一呈文**：①呈文＝§20（对照表/动机/影响面含宿主未证面/不改清单/回退/风险；events 平铺两案呈裁；inject 换源经复核不采——5 份 lib `requires.services` 缺声明，换源＝卡面 inject 变空）。②**W2-1**：客户端 `ABSENCE_COPY_FALLBACK` 与服务端 `ABSENCE_COPY` 逐键逐字对齐——true-uninstalled 由"移入保管区·可一键恢复"翻正为"已卸载（无副本）· 重新安装后面板可挂载"（销毁式 v2 语义，原兜底方向相反）＋unknown-absent 补齐；钉 `test/absence-copy-parity.test.mjs` 3 条（键集⊆权威／逐字／反向钉不得再宣称保管区），修前红 2/绿 1→3/3；变异 3 发逐格（客户端回潮/服务端改字/简写漂移）。③**W2-2**：F-71 复算翻正＝**读数错账不复现**（git -S 全量：`parsed.hasHealthCheck` 任何历史版本零命中；徽标自 44545c0 即读 `p.hasHealthCheck`、下发面 entryView 在案 ⇒ 两前提均不成立）；**不修代码**，清单 :336 更正注＋防翻面钉 `test/w2-health-badge.test.mjs` 2 条；变异 2 发逐格（读取面翻面/摘下发）。④**W2-3**：F-74 复算**复现**——:1588 `styles.issueWarn` 而定义只有 `issueWarning` ⇒ 警示条无样式；引用改正一行＋**styles 引用全量对账钉** `test/client-styles-keys.test.mjs`（引用 ⊆ 定义，常设化）；修前红（精确报出）→1/1；变异 2 发两向可证（引用侧/定义侧）。**F-71 与 F-74 两族复算结论分路（一推翻一证实）＝"未抽验代理读数动工前先复算"纪律首批两次应用的实证**。**验证**：每笔三道锁全绿＝门禁 6/6＋doctor 四套件 26/8/7/21＋stage3 a–g 全 PASS＋`~/.dsh` hash 前后 `c585738c…0bd9`/5 files 逐字节相同；`node --test` 419→**425**（+8 全来自三份新钉）；`p1-smoke` **314/0**；`p22-cards-ui` **127/127**；dry-run **0/0/0**。**基线口径更新入账：`node --test` 425。**变异工装 b21-mutate.mjs、b22-mutate.mjs、b23-mutate.mjs（`var/scratch/exe-boot-006-20260926/`，内存 pristine 写回）。**边界与在途**：真机观察需求批末统一报（W2-1/W2-3 属异常路径可见面，正常卡面零变化；F-71 链路成立但端到端点亮未真机点——React 三通道老边界）；W2 余件＝四卡提示位／F-72（复算已复现 :1915）／F-73（先复算）／卡片静态描述落差族／F-77／F-78（原判未核实，先复算）／F-87／F-21／F-23，逐件先复算后修；`cordis.patch.yml` 基准 `e8051fe9` 未动；宿主 pid 29520 未触 |
| 40 | **EXE-BOOT-007 本节三笔（D-21 注入替身钉 · 四卡"改完要重启"提示位 · F-72 复现修复）** | C1-006 批复开工令（第一交付 D-21 裁(a)／第二交付 W2 余件 §21.3 逐件）；本表 :465（D-21 债条，**至此闭账、原行照录不改**）；计划 §18.4 D-21 附提议；清单 :198/:221（描述落差族**未动**）、:346-347（F-72，已翻正注）；§21.3 余件清单 | 合流波 3 · W2 余件（2026-09-26，EXE-BOOT-007；纯 `toolkit` 仓，doctor 仓零改动；实现三笔 `1283b0e`（D-21 纯测试笔）＋`3fcd3f9`（W2-余1 提示位）＋`6a3f5cd`（F-72）；账面笔本行＋计划 §22；**会话余量临界停靠净节点，余件移交继任**） | **三笔**：①**D-21**（纯测试笔，`test/config-schema-degradation.test.mjs` 79 行纯追加、既有十格零触碰）：resolve 钩子门控注入替身（`registerHooks` 线程内同步钩子＋globalThis 门＋data:URL 替身模块；须 Node≥23.5、本机门禁 24.19；注入面循 doctor 仓 R4 探测替身先例）——③格主钉（替身返回不可执行值⇒降级且③专属文案点名）＋③④不共用命中格＋门控关反向钉；变异 M-③ 恰 1 红／M-④ 恰 4 红（④替身钉＋④真实行为钉＋setConfig 拒写钉＋precheck 阻断钉＝同命门四格，首轮工装预期 2 系预期偏窄已修正）、两集互斥、还原复核两轮全绿。文件级注入的原因自曝：进程级钩子无法只在单格生效（loader 线程隔离与 env 快照两路均不可行），故钩子进既有钉子文件、门控缺省关＝既有十格证据形态零变化，与呈文"加一格"的字面差异如实记。②**W2-余1**（断点修复批②的 W2 半边）：服务端 `RESTART_EFFECT_NOTE` 严格映射逐卡下发 effectNote（agent-memory／web-search-local 行 config 块与 compact-router 预设托管 2026-09-26 复算在案；未知目录不发明文案）；React `EffectNoteRow`＋兜底页 `effectNoteHtml` 双通道同源渲染、editable 卡不双渲染；`buildConfigPanel` 导出循 parseConfigScalars 先例；钉＝`test/w2-restart-hint.test.mjs` 4 条＋p22 +26（153）；变异 4 发逐格（M1a 摘三卡映射⇒nt1+p22 18／M1b 摘 search-router⇒nt2+p22 6——主钉对四卡任一失守敏感、预期修正如实记／M2 摘 react 支⇒12／M3 摘 html 支⇒12）。③**F-72**（快核现 HEAD 复现成立后修）：`toggleHealth` 守卫补 `indexOf("health:")===0` 前缀判据与渲染分支同判；钉 `test/w2-health-fold.test.mjs`（共享工装真实 bundle 行为三步：首点恰 1 请求／二次点击折叠且 0 新请求／三次点击重开重新拉取）；修前红正中折叠格→修后绿；变异 1 发守卫回退恰此钉红。**验证**：逐笔三道锁全绿＝门禁 6/6（53.5→61.6→58.0s，真实仓 dry-run 0/0/0）＋doctor 四套件 21/8/7/26＋stage3 a–g 多轮 PASS＋`~/.dsh` hash 逐笔前后 `c585738c…0bd9`/5 files 逐字节相同；`node --test` 425→428→432→433（+3/+4/+1 全来自新钉）；`p1-smoke` **314/0**；`p22-cards-ui` 127→**153**。**基线口径更新入账：`node --test` 433、`p22-cards-ui` 153。**自曝四条**：M1b 变异锚 CRLF 未命中修锚重跑（批 10 同族二发）；W2-余1 变异还原复核曾单发 1 红、复跑未复现＝瞬时抖动如实记录（未能定格具体格）；nt 全量读数曾把 cmd/PS 引号绞出的杂散文件当格计（工装侧口径，读数以独立落盘日志为准）；F-72 邻接发现"载入挂起态二次点击先折叠后被 then 回调重开"竞态**不在判据内未修**，记账呈协调侧裁。**边界与移交**：描述落差族（清单 :198/:221）／F-73／F-77／F-78／F-87／F-21／F-23 七件未动、按 §21.3 顺序移交继任（逐件先复算后修）；真机可见面累计（批末统一报）：W2-1 兜底文案与 W2-3 警示条配色（异常路径）＋本节四卡提示位与 F-72 折叠行为（正常路径可见面——继任批末须按裁决口径分类呈报）；`cordis.patch.yml` 基准 `e8051fe9` 未动；宿主 pid 29520 未触；改名批批准到达前仍零动工 |
| 41 | **EXE-BOOT-007 续批 · W2 余件七笔（F-93 · 描述落差族 · F-77 · F-73 · F-78 · F-21 · F-23）＋F-87 复算呈裁** | C1-006 批复（四笔验收入账＋F-93 立项＋续推八件令＋"两振即查"常设）；§21.3 余件清单＋§22.2 停靠申报；清单 :104/:346-354/:381/:383/:452-454（各条翻正注，纯追加） | 合流波 3 · W2 余件续（2026-09-26，EXE-BOOT-007；纯 `toolkit` 仓，doctor 仓零改动；实现七笔 `dd1bdeb`（F-93）＋`9117299`（描述族）＋`56dd57d`（F-77）＋`905715f`（F-73）＋`53096f6`（F-78 纯测试）＋`b2c1ac9`（F-21 纯文档）＋`39b99f5`（F-23）＋账面笔本行与计划 §23） | **七笔一呈裁**：①**F-93**（批复立项、先复现后修）：决议写入改函数式 setState（prev===""保持折叠），复现钉修前红正中"决议后保持折叠"格；F-72 既有格保持绿＝逐格隔离；catch 分支不动记边界。②**描述落差族**（清单 :198/:221）：compact-router 补三模式（自动/LLM 摘要/即时抽取）、rate-throttle 补齐两半（换路/冷却/降档＋默认关），双通道同笔同文；钉＝card-description-parity 4 条（两通道逐字一致＋能力格双通道各探＋未动三卡快照反向钉）。③**F-77**：复算校正原判——"bool" 两端一致（那半不成立），真漂移仅 backoffFactor/downgradeContextMargin 两处 "num"→"number"（客户端集合与服务端白名单双向相等、18=18）；钉＝config-fields-type-parity 4 条常设化。④**F-73**：复算复现（双重死参数，双通道同族）⇒ 诚实收死参输出面零变化；"弹窗展示卸载收据信息"记档为产品级选项呈协调侧；连带 p24-ui-matrix 工装三处旧 4 参调用对齐（冲突三态 2 格翻面复绿，命题未变）。⑤**F-78**：复算**推翻原判**（扁平 path 键 draft 与嵌套 draft 分属互斥渲染面、无共享写入点，"同屏"前提不成立）⇒ 照 F-71 先例不修码、防翻面钉（嵌套编辑→保存载荷纯嵌套且编辑值生效）＋变异证可伪。⑥**F-21**：批复授权二选一走文档收边界——embed-toolkit §5.2 增"声明面与标签页面分界"（`{servicePrefix}` 占位符＝给人读的约定、服务端路由面随前缀而 React 标签页不随；代码路径需宿主按实例注入＝Q2 边界外）。⑦**F-23**：复算升级原判＝双向反义（true 卸载返 true 而销毁式 v2 零副本；soft 返 false 而本体保留）⇒ 整字段移除（全仓零消费）；钉 2 条。**F-87 复算呈裁**：原判"契约无表达"成立（tools.register 现锚 :1384、manifest 无 tools 槽、provides 三槽不含 tools）——补声明＝契约扩槽语义变更，越 W2 授权且触碰契约协调边界，按升级规则不自裁，**报协调侧裁归属（建议随契约 v1.2/W9）**。**验证**：逐笔三道锁全绿＝门禁 6/6（52.3→58.0→52.8s 等，真实仓 dry-run 0/0/0）＋doctor 四套件 21/8/7/26＋stage3 a–g 多轮 PASS＋`~/.dsh` hash 逐笔前后 `c585738c…0bd9`/5 files 逐字节相同；`node --test` **433→434→438→442→445→446→446→448**（+1/+4/+4/+3/+1/0/+2 全来自新钉）；`p1-smoke` **314/0**；`p22-cards-ui` **153/153**；p24-ui-matrix **718/718**。**基线口径更新入账：`node --test` 448。**自曝四条**：F-93/F-78 变异锚行尾与缩进两度未命中修锚重跑（CRLF/LF 混合行尾＋tab 数差一，按字节实况构造——批 10 同族三发）；描述能力格与 F-77 逐字段格首版只探 React 侧，按"断言必须可观测"改双通道各探后重取读数；desc-mutate 首轮方向反了（修后 pristine 锚应在 newText 上查）；F-73 门禁首跑翻出 p24 连带 2 红＝工装调用形态连带、非回归（对齐后复绿）。**边界与真机**：F-93 修复与 F-72 折叠、四卡提示位、描述文案属**正常路径可见面**；W2-1 兜底文案与 W2-3 警示条属异常路径——批末按既裁口径分类呈报、协调侧排窗定用户目检项；`cordis.patch.yml` 基准 `e8051fe9` 未动；宿主 pid 29520 未触；改名批批准到达前零动工 |
| 42 | **改名批 · snapshot 输出面键名正典化（§20 批准稿 · 甲案）** | 用户批准（"按建议"＝甲案：events 顶层平铺、三旧键→provides.*、inject 不改名不换源、无双写过渡、单笔可 revert；计划 §20.8 批准入账注）；计划 §20 施工图＋§20.9 形差更正注（20.1 抄录省略防护、行号漂移＋16）；§20.4 清单 | 合流波 2 · 改名批（2026-09-27，EXE-BOOT-008；纯 `toolkit` 仓，doctor 仓零改动；账面首笔 `e576d25`（纯文档 +36/−0：§20.8/§20.9/§23.2 裁归/§23.4 闭账＋debt C-2 挂账）＋施工笔 `fd08450`（单笔六文件 +20/−20，§20.7 `git revert` 即整链还原）＋账面笔本行＋计划 §24＋CHANGELOG；**账位注记：§20.4 第 7 条所引"§21＋#39"已被 W2 期实际占用，按"新增节不回改"落新账位，随批末申报呈报**） | **六文件单笔**：`registry/src/loader.ts` extractRegisters 加 export（单源化）；`panel/manager/snapshot.mjs` 输出面 `registers.{services,commands,providers}`→`provides.*`（走 extractRegisters：provides 优先、缺席回落 legacy 同装载面口径、undefined 置空对象）＋`events` 甲案顶层平铺（manifest 数据源不动）＋`inject` 不改名不换源（呈文复核不采：5 份 lib requires.services 缺声明，换源＝卡面 inject 行变空）；client 两读点同步（index.js TechDetails＋panel.html 兜底页，TechRow 中文标签与数据值零变化、bundle node --check 过）；工装两文件（p22:264 透传新键、harness :228/:235 贴真实载荷）；无双写过渡（消费方全在本仓两文件＋两工装，一次切净，§20.5）。**换源变异证据**（§20.4 第 5 条）：compact-router provides.services 正典改写 ⇒ snapshot 输出随之变化（证读 provides 非 legacy）＋变异期间 p1 仍绿 314/0＋内存 pristine 写回 sha256 逐字节还原（rename-mutate.mjs＋shape-probe.mjs，`var/scratch/exe-boot-008-20260927/`）。**验证**：开工基线对表零异动（门禁 6/6＋doctor {21,8,7,26}＋stage3 a–g＋p1 314/0＋nt 448＋p22 153＋p24 718）；施工后门禁 **6/6**（53.1s，真实仓 dry-run 0/0/0）＋doctor 四套件 **{21,8,7,26}**＋stage3 **a–g 全 PASS**（fixable=0）＋`~/.dsh` hash 前后 `c585738c…0bd9`/5 files 逐字节相同；`node --test` **448/0（零新增钉）**；`p1-smoke` **314/0**（:295 5 卡计数／:305 doctor 0/0/0／:337 四词在场三断言预计零翻兑现、一律未动）；`p22-cards-ui` **153/153**；p24-ui-matrix **718/718**。**边界与真机**：snapshot JSON 键名变更对外可见（CHANGELOG 已记，已知消费方＝本仓客户端两读点）；宿主是否解析该 JSON 体**未证**（§20.6 风险 1）＋TechRow 可见面零变化预计不触发条件真机（风险 3）——两项观察需求随批末申报呈协调侧排窗裁定；自曝：账面首笔提交曾带 `-c core.autocrlf=false` 致提交 stat 假象（645/609），树间 diff 复核实为 +36/−0 纯追加（读数以树间 diff 为准）；`cordis.patch.yml` 基准 `e8051fe9` 未动；宿主未触（pid 以现场为准） |
| 43 | **F-73 产品级小笔 · 恢复确认弹窗软卸载收据块（只读）** | C1-007 开工令 2（用户已批"做"）；EXE-BOOT-008 批末申报第四节素材；本表 :466 邻接（D-19 行级 `inject:` 面）与本表 #41 F-73 死参收口行（原行照录不改）；计划 §26 | 合流波 2 收官后 · W9 前置批（2026-09-27，EXE-BOOT-008 续用；纯 `toolkit` 仓，doctor 仓零改动；实现笔 `f8b4e3b`（四文件 +73/−0 纯增量）＋账面笔本行＋计划 §26＋CHANGELOG） | **复算前置成立后动工**：custody 软台账两形状字段齐备（patch 行 ：805／preset `:894`）、snapshot `:328` 本就在调 getSoftRecord、弹窗两构造点卡对象在作用域、p24 弹窗管道现成——四问四答（什么时候卸的/卸了什么/本体存哪/怎么恢复＋有因记因）数据全现成。**服务端组稿** `buildSoftReceipt`（循 RESTART_EFFECT_NOTE 服务端权威＋buildConfigPanel 导出先例）＋snapshot 卡 additive 字段 `softReceipt`（null＝无记录；不加接口、不动引擎）；**双通道只渲染不加字**（React RestoreDialog＋panel.html restoreDialogHtml；守卫 mode/kind!=='mount' 且 lines 非空，fail-soft；挂载弹窗不渲染）；bundle node --check 过。**工装两断言**（p24 §2.9，718→720）：react 收据行内容在场（lines 逐字＋挂载弹窗零收据反向）＋html 同（双通道覆盖）；变异两发隔离各红各的（M1a 整行锚三件套〔§25 纪律〕／M1b 行尾无关子串锚；内存 pristine 写回逐字节还原）。**验证**：门禁 6/6（52.7s，真实仓 dry-run 0/0/0）＋doctor {21,8,7,26}＋stage3 a–g 全 PASS＋`~/.dsh` hash 逐字节同；`node --test` 448/0（零新增钉）；`p1-smoke` 314/0；`p22-cards-ui` 153/153；**`p24-ui-matrix` 720/720（+2 恰新断言，基线口径更新入账）**。**边界与真机**：恢复弹窗新增只读信息块＝正常路径可见面，随批末呈报并入下一真机窗（C1-007 二.2 同窗）；`cordis.patch.yml` 基准 `e8051fe9` 未动；宿主未触；自曝一条：M1b 工装预期算错（单行四处引用误期 2，写盘前即抛、仓库无恙）修正后两发全过 |
| 44 | **W9 第一段 · D-2 修法＋D-3 修法＋F-62 修法（两仓同批）** | C1-007 批复（四笔验收入账＋§27 考古逐件裁决：D-2 采纳建议案①／D-3 采纳建议案①／F-62 原判成立修法＝对齐 provides 正典／D-18-D-19 技术方向采案一惟涉用户环境呈用户拍板、答案到达前零动工）；§27 呈文＋§28 落账 | W9 · 第一段（2026-09-27，EXE-BOOT-008 续用；toolkit 仓三笔 `7fb2ebf`（D-2）＋`af88275`（D-3）＋账面笔本行；**doctor 仓 `343ca9f`（F-62 代码笔，两仓同批互引 hash）**；D-2/D-3 分笔各自独立可 revert） | **三件**：①**D-2**＝p23-shadow-scan outPath 改带 UTC 时间戳新文件（每次运行落新、历史正本 `720f9a56…` 零覆写、只增不改由脚本自身保证；行为证据运行一次新旧 hash 对表；无钉无变异＝独立取证脚本零消费者、变异需真实覆写正本风险不对等；不入门禁链不占第 7 步）。②**D-3**＝regression-all 补 p23-verify（13→14）＋ci-local 两标签同步（第 2 步 13→14；第 6 步如实改"复跑双跑冗余守卫"，摘除随收口批 6→7 定、本批不动门禁结构）；regression-all 独立跑 14 项全绿。③**F-62**＝doctor `engine.mjs` 撞名收集格改读 provides 正典（registerSlotOf：逐槽 provides 优先、legacy 回落、空数组遮蔽 legacy＝extractRegisters 同口径；inject-face 规则零触碰，呈文锚"两循环"如实修正为撞名格单点自曝）——钉 stage4a +3 格（复现钉／回落格／口径格）修前红恰三新格红既有格绿（8/11）、修后 11/11、变异两发各红各的（M-a{复现钉,回落格,口径格}/M-b{既有格,回落格}，pristine 写回逐字节还原）；防连带核实：toolkit 批 2-① 钉的是 registry precheck（B 层）与 doctor CLI（A 侧）两套互不相扰。**验证**：doctor 四套件 **21/21＋11/11＋7/7＋26/26（stage4a 8→11 基线口径更新入账）**＋stage3 a–g 全 PASS＋`~/.dsh` hash `c585738c…0bd9`/5 files 逐字节同；toolkit 段末终跑读数随段末申报照报（门禁 dry-run 0/0/0 现以 provides-aware 引擎实测，批 10 同槽同值 ⇒ 预期不变）。**边界**：本段无用户可见面、无真机需求；D-18/D-19 四步走（探针→滚基准→改 YAML→真机复验）待用户拍板、到达前零动工；第三件引擎统一产品级呈报维持挂 v1.2；`cordis.patch.yml` 基准 `e8051fe9` 未动；宿主未触 |
| 45 | **W9 第二段 · D-19 采纳落地（用户拍板案一）＋D-18 关闭** | C1-007 批复（第一段四笔入账＋D-18/D-19 终裁：采案一、D-18 不采用）；§27.3 两案对比＋§29 落账；D-12 追加（解包链逐字对照） | W9 · 第二段（2026-09-27，EXE-BOOT-008 续用；toolkit 仓两笔 `775aa0c`（施工笔：YAML＋滚存五处）＋账面笔本行；doctor 仓零改动） | **步 a 探针 PASS**：patch-config-check 运行时实证（仓内临时 byte-copy×两夹具）＝既有行零行为变化（copy×real 副本净输出与原脚本逐行同）＋行级 `inject:` 不抛（inject 夹具 exit 0、校验计数全同）。**步 b 施工笔**：cordis.patch.yml +3 行零删（rate-throttle [llm,tokenMeter]／web-search-local [web]／web-search-router [web]，值取 manifest 动工实况，置于行块末尾）＝判据基准第 3 次滚存 **e8051fe9…/3085B → a663f61b…/3160B**（CRLF 保持）；滚存同步五处（p24 两硬闸常量与标签＋p1 CARD_LINES 58→59/64→66/74→77＋p22v CARDS＋engines 注释）。**双路语义复算**（loader 1.0.3 lib:709＋cordis lib:1490-1498 源码读证）：行级 inject 经 Inject.resolve 合入 fiber.inject、Map 去重 ⇒ 与模块自带同名双声明幂等；inject 属 Entry 一等选项（loader :446）。**步 c 读数**：门禁 6/6（50.3s，dry-run 0/0/0 于新判据文件实测）＋regression 14 项全绿＋nt 448/0＋p1 314/0＋p22v 110/110＋p22 153/153＋p24v 63/0＋p24m 720/0＋p21 53/53＋pcc 0 问题＋`~/.dsh` hash 逐字节同。**自曝三条**：①inject 首版落 name/config 之间⇒p21 行结构钉翻 1 格，定性后改落行块末尾（行结构钉零触碰、锚值数学不变、p24 常量随重排 hash 再滚一次）；②q2 ④"工作区==HEAD"守卫未提交态照例红、提交后自愈（D-17 先例）；③探针首跑 CRLF 锚未命中（needle 按实测 EOL 重构）。**边界与真机**：防扩面记档三项（compact-router 无静态行走模块路／agent-memory 空声明不落键／toolkit-manager 不在枚举）；真机复验＝用户第 5 次重启后四插件挂载与功能面核对（素材包随批末呈协调侧排窗），异常即报即撤（本笔 revert＋基准回滚）；`cordis.patch.yml` 基准自此 **`a663f61b`**（后续申报以新 hash 为准）；宿主未触 | **C1-007 查询回报补注（2026-09-27）**：compact-router 四项 `registers.inject` 双时点核实在案（现 HEAD＝f9a903a＝`[llm,tokenMeter,sessions,commands]`，§20.2 记载不失实）；未落行级声明＝**另有口径非漏项**——其宿主挂载行不在 cordis.patch.yml（:3 注释＋ROW_IDS null＋apply-preset-patch.mjs 写 ~/.dsh 预设文件互证），补落即双重挂载或触 ~/.dsh 红线；模块路承载下门控零缺口，行级声明随预设行机制议题归后续（届时单独授权）；真机复验口径更正＝五卡全查（详见计划 §29.1）**【措辞收窄注（2026-09-27 EXE-BOOT-009 账面首笔）】本行"门控零缺口"与计划 §29.1"门控语义零缺口"收窄为"注入幂等零缺口；compact-router 行级门控随预设行机制议题后置"——已证＝双声明幂等（§29 源码读证），行级门控随预设行议题归后续、届时单独授权，详见计划 §30.d** |
| 46 | **W9 收官＋inject 归因定谳入账＋第 5 次真机窗闭账（EXE-BOOT-009 账面首笔）** | C1-007 开工令 1（五注 a–e）＋计划 §29/§29.1；归因取证 `var/scratch/exe-boot-008-20260927/inject-attrib.log`＋`inject-attrib-data.json` | W9 · 收官（2026-09-27，EXE-BOOT-009；纯文档账面笔＝计划 §30＋本行＋#45 行内收窄短注；两仓代码零改动、独立可回退） | **五注入账**：**a** W9 四件（F-62/D-2/D-3/D-19）全项闭（#44/#45 在案）＋真机复验闭合 ⇒ **波 3 W9 完**；**b** inject 归因 B 型"从来如此"定谳＝改名零回归（探针两时点 `0958e052c94c…`／`fb6aa0f` inject 顶层读数逐字节同值）、缺口起源 `f95b751`（P2.4 批 1 重写卡字面量时挪错层级：snapshot.mjs 读 requirements.inject 顶层、真声明在 requirements.registers.inject）、P0 时代 `193bdd8` 读法正确、断链单点＝snapshot.mjs 取数（渲染侧无虞）、工装盲区＝无钉断言过 inject 行端到端值——修法随本批开工令 2 落；**b 附** 素材组一 inject 预期错账自认（更正版随 §29.1 查实 3 回报发出：组一补 compact-router `[llm,tokenMeter,sessions,commands]`、组三改五卡全查；以更正版为准、原素材作废存档）；**c** 第 5 次重启窗闭账＝五卡全查除 inject 行一项外全对（四插件挂载正常、面板可通、功能面如常＝D-19 复验闭合、F-73 收据块真机亲验整件闭），inject 一项经 b 定谳不阻 W9 收官；**d** 措辞收窄（见 #45 行末注＋计划 §30.d）；**e** 链尾误报核销＝归因回报状态行 3b05eef 系老会话耗尽期笔误，实数 `7d0fd466…` 经开工自核逐字核实、链 `775aa0c→3b05eef→7d0fd46` 完整可追，以实数核销续链 |
| 47 | **inject 修法 · snapshot 取数源改 registers.inject（B 型缺口修复）** | C1-007 开工令 2（照已批方案）；计划 §30.b 归因定谳＋§31 落账；缺口起源 `f95b751`（P2.4 批 1 挪错层级）、断链单点 snapshot.mjs | W9 收官后 · EXE-BOOT-009（2026-09-27；纯 `toolkit` 仓施工笔 `a2789d0`（snapshot.mjs＋p22 工装两文件，单笔可 revert）＋账面笔本行＋计划 §31＋CHANGELOG） | **单点一行**：`requirements.inject` 顶层（从来空）改读 `(manifest && (manifest.requirements \|\| {}).registers \|\| {}).inject \|\| []`——events 槽同款守卫形、doctor engine.mjs 同位读法；客户端两读点（panel/client/index.js 第 397 行、panel/client/panel.html 第 288 行，当时）零改动。**先钉后修**（p22 A-inject 节 12 格，工装盲区"无钉断言过 inject 行端到端值"闭合）：snapshot 真值格两发（四卡 registers.inject 实况硬编码＋agent-memory 无声明＝空，各自断言）＋双通道逐卡 parity 十发（react/html inject 行 == snapshot 真值格式化）；修前红正中一格（164/165，四卡真值格，`p22-prered.log`）、修后 165/165；变异一格（读法回潮顶层 ⇒ 恰该格红、其余全绿，内存 pristine 写回 sha256 逐字节还原，`inject-mutate.mjs/.log`）。**读数（`a2789d0`）**：门禁 6/6（52.9s，dry-run 0/0/0）＋nt 448/0＋p1 314/0＋p22v 110/110＋p22 165/165＋p24v 63/0＋p24m 720/720＋regression 14 项全绿＋pcc 0 问题＋doctor {21,11,7,26}＋stage3 a–g＋`~/.dsh` hash `c585738c…0bd9`/5 files 逐字节同。**基线口径更新入账：p22-cards-ui 153→165（+12 恰新钉）**；nt 本笔不变 448。**真机面**：五卡 inject 行现真值＝正常路径可见面变化，并入第 6 次重启窗（四卡有值、记忆卡"（无）"）；CHANGELOG 已记。**【闭账注（2026-09-28 EXE-BOOT-010 账面笔）】真机双证到达＝用户亲验五卡 inject 行现真值（四卡有值、agent-memory 仍"（无）"）＋p22 A-inject 12 格双证在库 ⇒ §31 真机面项闭合，本行整账闭（计划 §33）** |
| 48 | **agent-memory 生命周期整轮钉 LC1/LC2（素材建议①）** | C1-007 开工令 3；计划 §32；既有专项钉 agent-memory.test.mjs（A/B/C/D/E/G/L/W/RUNTIME/PLUGIN/HF 族分片矩阵） | W9 收官后 · EXE-BOOT-009（2026-09-27；纯 `toolkit` 仓测试笔 `5a85c1b`＋改名更正小笔 `4a3f0a1`（新文件一，lib 零触碰、各自独立可 revert）＋账面笔本行＋计划 §32） | **公开 API 全轮**（createSession/addEntry/setEntryStatus/appendMilestone/updateStatus 已移交/runtime.onSessionDisposed）于临时数据根：**LC1 写入半环**（registry 条目/三会话文件/头部字段逐段断言＋heartbeatTurn 随写推进＋lastActiveAt 心跳＋里程碑不推进台账心跳＝新鲜度数据源语义＋新鲜度门链上检查点 3 回限放行/超限 fail-closed/刷新复放行＋每段锁零残留）；**LC2 流转收尾半环**（已移交双面同步→旧拒 WRITE_FORBIDDEN/继任可写编号自起→移交方历史文件零变化→dispose 活跃→已完成双面同步→终态三面对账 registry×ledger×progress＋锁零残留）。**衔接不重不漏**：分片矩阵归 A/D/B/W/G/HF/L 族（文件头注逐族记档），本钉补"整轮链上"集成不变式。**验证**：家族同跑 86/86（改名后复证）＋单跑 2/2；变异一发（摘 patchLedgerCore 台账同步格 ⇒ 恰 LC2 红、LC1 不受累，pristine 还原逐字节同，`lc-mutate.mjs/.log`）；隔离＝显式临时 root＋生产根护栏 fail-closed，`~/.dsh` 零触碰。**读数（`4a3f0a1`）**：门禁 6/6（56.9s）＋nt 450/0＋p1 314/0＋p22v 110/110＋p22 165/165＋p24v 63/0＋p24m 720/720＋regression 14 项全绿＋pcc 0 问题＋doctor {21,11,7,26}＋stage3 a–g＋`~/.dsh` hash 逐字节同。**基线口径更新入账：node --test 448→450（+2 恰新钉）**；无行为码改、无真机面。**自曝两条**（见计划 §32）：LC 笔提交前未跑门禁全链致 pluggable-lint 翻红（文件名归属推断失配）→ 改名更正小笔 `4a3f0a1` 循 `<插件名>.<主题>.test.mjs` 惯例，教训＝施工笔读数必须含门禁全链；新钉首跑两格红＝预期编号格式错账（L-1 → L-000 三位零垫），修预期不改库 |
| 49 | **agent-memory 插件自日志（诊断不可达结构缺口③的 agent-memory 半边）** | C1-007 开工令 1（EXE-BOOT-010；记忆停写案 009 两轮取证定谳③＋用户预期在案）；计划 §33/§34 | EXE-BOOT-010 · selflog 笔（2026-09-28，`toolkit@76df6e6`，单笔可 revert） | 落点＝新增 `lib/agent-memory/lib/selflog.js`＋plugin.js 接线＋`test/agent-memory.selflog.test.mjs` 11 格；行面＝register（每启动实例在位自证，成败各落一行）＋created/claimed/pre-step/disposed（sid 解析成败＋原因码 no-host-id/unresolved/resolve-error；outcome 记 created/deduped/skipped:*/collected/heartbeated/disposed/error/error-suppressed）；膨胀双闸＝pre-step 节流（evidence.js CAP2 同款进程级 Map：翻变必写、同结论 <60s 抑制、抑制数随行带回；心跳本体每步照跑＝新鲜度数据源语义不变）＋单档 2 MiB 轮转（audit-sink 同款 .1 单代）；emitWarning 保留开发通道（appendSelflog 永不抛错、宿主零感知）；帧字段 ts/pid/event 后置展开不可被 fields 覆盖。**设计裁量随批申报**：逐行追加循仓内三先例（rate-throttle／evidence.js／audit-sink），不逐行 atomicWrite（O(n²)＋backupFileBeforeWrite 逐行 COW 快照＝生产根备份膨胀，与节流防膨胀相抵）。三道锁＝先钉后修（修前红 9/11＝插件驱动面全红、`selflog-prered.log`）＋变异一发（摘 appendFileSync ⇒ 恰 10 红全咬行在场断言、FAIL 兜底格不受累，pristine 逐字节还原 `selflog-mutate.mjs/.log`）＋全套读数（门禁 6/6＋nt 461/0＋p1 314/0＋p22v 110/110＋p22 165/165＋p24v 63/0＋p24m 720/720＋regression 14 项＋pcc 0＋doctor {21,11,7,26}＋stage3 a–g＋`~/.dsh` hash 逐字节同；基线更新入账 nt 450→461）。边界＝纯观测面、ledger/progress/registry 写路径语义零触碰、client bundle 零改动；真机面＝下一次宿主重启后自日志面生效（活体判别窗数据源） |
| 50 | **.tmp 孤儿回收（原子写失败路径与崩溃残留双源）** | C1-007 开工令 2（EXE-BOOT-010；9/14 生产根残件实况在案：`.tmp-17764-a3694ca6e70a`/12417B，锁有清理而 tmp 无）；计划 §34 | EXE-BOOT-010 · tmp 回收笔（2026-09-28，`toolkit@26d08aa`，单笔可 revert） | 落点＝atomic.js 失败路径 try/catch unlink（原错误照传、回收尽力而为）＋新增 `sweepTmpOrphans(root)`（手写递归走层；只认 `.tmp-<pid>-<hex>` 形状、目录不碰；60s 年龄闸防误扫并发实例在飞 tmp；单文件失败记 errors 继续；now/maxAgeMs 可注入）＋plugin.js register 挂载期调用（尽力而为绝不阻断挂载）＋index.js 转出口；开工令两案双管＝失败路径治进程内可复位失败、启动清扫治崩溃残留（9/14 残件即此形态；真实生产根残件由插件下一次真实挂载回收，执行侧与测试不代删）。三道锁＝先钉后修（修前红恰 2 红：SWEEP-1 接线未接＝孤儿仍在／SWEEP-3 失败路径实留 `.tmp-32544-…` 孤儿，`sweep-prered.log`）＋变异两发隔离各红各的（M-a 摘 register 清扫调用 ⇒ 恰 SWEEP-1 红／M-b 摘 atomic unlink ⇒ 恰 SWEEP-3 红，pristine 逐字节还原 `sweep-mutate.mjs/.log`）＋全套读数（门禁 6/6＋nt 466/0＋p1 314/0＋p22v 110/110＋p22 165/165＋p24v 63/0＋p24m 720/720＋regression 14 项＋pcc 0＋doctor {21,11,7,26}＋stage3 a–g＋`~/.dsh` hash 逐字节同；基线更新入账 nt 461→466）。**自曝一条**：变异工装首版 write/restore 之间崩溃把 plugin.js 留在变异态约一轮、彼时 postgreen 作废重取，工装改 try/finally 强制还原后再验 sha（教训＝变异工装还原必须 finally 兜底） |
| 51 | **记忆停写案施工批：工作区闸修复＋R1 全量采集＋agentMemory 注入接线＋正典已搁置并入（4 笔）** | C1-007 施工令（用户"按建议"**全单批准**：A/B甲/C/D/Ea/F/G；三不案＝去闸/配常量/收件箱合成消息不做）；归因＝EXE-BOOT-011 前半纯读取证（`var/scratch/exe-boot-011-20260929/findings-011.md`：插件读 session.cwd 而宿主真值在 session.header.cwd ⇒ 回落 process.cwd() ⇒ 闸实际比较宿主启动目录） | EXE-BOOT-011 施工笔 1–4（2026-09-29，`toolkit@20c85d6`/`ec4db85`/`82bfa5e`/`521f5d9` 各单笔可 revert；`doctor@7ba8251` host-faces 补录随批互引） | ①**笔1 取数链修＋G＋二.2**：plugin.js wsInfoOf（header.cwd 优先→session.cwd→agent.workspace→defaultWorkspace→process.cwd 逐环回落，created/claimed/model-switch 四处同源）＋registry.js assertWritable win32 大小写归一（错误信息保留原值、空值 fail-closed）＋自日志 created/claimed 行 wsRing 命中环（回落即观测）；钉 WS1-5＋LC3 跨实例 resume（先红 5/6→绿）。②**笔2 R1 全量采集（甲案）**：ledger「一般输入」栏（SECTION_ORDER 末位；addGeneralEntry status=已记录、编号池共享不串；countUnfinished 排除；溢出次序=已完成先移→一般输入次移 archive→真未完成仍超限拒且计数不含；ENTRY_LOG_IMMUTABLE 只追加守卫；'已记录'不入枚举）；runtime.onUserMessage 全量采集＋kind 字段（自日志 outcome 集合不变）；isInstructionText 职责改分栏判据；recover 概览计一般输入（F4 前缀钉兼容）；钉 D11-13＋RUNTIME2/SELFLOG-L1 重钉（先红 5/5→绿）。③**笔3 agentMemory 变量接线（案 C+F）**：recover.buildRecoveryBrief（任务摘要/未完成 ≤8×80/永久 ≤4 行/新鲜度；lenient 内建空串；≤1200 字符）＋buildRecoveryReport lenient 选项；plugin.js 挂载期 ctx.systemPrompt.variable('agentMemory')（fail-soft 双闸：面不在位不注册＋告警不阻断挂载、回调异常空串恒字符串）；manifest registers.inject []→['systemPrompt']＋patch 行 inject 同步（**patch 基准第 4 次滚存 a663f61b/3160B→b0f304c9/3164B**，p24 两硬闸常量滚存、q2 ④ 工作区==HEAD 守卫未提交态照例红提交后自愈＝D-17 先例）；doctor host-faces.json 补录 systemPrompt（9/15 派生遗漏，安装版 dsh-system-prompt lib:211 实证）；钉 F5/F6/WIRE6/WIRE7＋p22 真值格（先红 3/4＋p22 红→绿）。④**笔4 正典已搁置并入（案 D 最小缺口版）**：呈报原案"未完成指令＋永久双行并进压缩 enrichment"经施工前复核＝正典已携带永久双行＋进行中/待办（§11 先例），实际缺口仅已搁置——readLedgerItems 采集栏三栏对齐恢复报告口径（活跃条目后排列、8 条上限让优先）；钉 adapter 两格（先红→绿，一格期望串笔误自曝修正如实记）。**读数**＝nt 466→479＋门禁 6/6（笔3/笔4 后自愈态复跑）＋p1 314/0＋p22 165/165＋p24m 720/720＋regression 14 项＋pcc 0＋doctor {21,26,11,7}＋stage3 a–f＋`~/.dsh` hash 逐字节同（`*-pen1/2/3b/3c/4.log`）。**边界**＝存量 registry 工作区字段不动（Ea：老会话续写走现成 handoverToWorkspace 一致性检查＋用户确认）；预设模板 `{{agentMemory}}` 行只备不写（用户资产，候批准后执行）；升级路＝agent-memory README「升级与宿主触点」节（触点清单/备而未用/数据迁移纪律）随笔5落 |
| 52 | **记忆案收官账笔：案史闭环注＋六要求状态＋一般输入栏状态注＋升级路两条（纯文档）** | C1-007 开工令 1（EXE-BOOT-012）；案史正本＝计划 §33–§36＋`var/scratch/exe-boot-011-20260929/`（findings-011/design-report-011）＋自日志面 | EXE-BOOT-012 · 收官笔（2026-09-29，纯文档、两仓代码零改动、`cordis.patch.yml` 一字未动、独立可 revert） | **闭环链九段**：9/27 用户停写申报 → 009 两轮取证（A 型细化＋事实底座＋三缺口立案）→ 010 自日志笔/tmp 回收笔（闭缺口③）→ 011 归因定谳（工作区取数形状错位）→ 设计全单批准 → 施工五笔（§35）→ 事故处置＋`agent_memory` 正名＋写前必验入常设（§36）→ **验收窗全绿**（两启 register 全挂 pid 5056/17384、claimed collected×4＋wsRing:header＋kind 落行、模型复述【会话记忆】节＝R4/R6 端到端点亮；本笔自日志面复核）→ 本收官笔。**六要求终态**：R1 采集线通（钉盖＋活体）/R2/R3 在/R4·R6 注入现场验证/R5 六 README 在；三缺口全闭。**升级路两条（用户指定、候后续批，正文落 README【待补充要求】）**：相同指令去重；分栏判据精度（"请"问句入待办观察）。**口径注记**：patch 随行字节数 3164B 实为字符计数（混算，§36 同族），实数＝工作树 3190B/blob 3104B，基准符 `b0f304c9` 逐字节成立。读数＝门禁 6/6＋nt 480/0＋p1 314/0＋p22 165/165＋p24 720/720＋regression 14 项＋pcc 0＋doctor {21,26,11,7}＋stage3 a–f＋`~/.dsh` hash `c585738c…0bd9`/5 files 逐字节同（`var/scratch/exe-boot-012-20260929/*-baseline.log`） |
| 53 | **D-20 文档引用守卫建成进门禁＋存量引用全数清偿（收口批 C-1 与 D-20 同体两半一并关账；门禁另摘 p23-verify 双跑）** | 协调侧《收口批施工图》（`var/scratch/exe-boot-012-20260929/report-closing-batch-012.md` §一/§五/§六）＋ EXE-BOOT-013 四卡点呈裁 ⇒ EXE-BOOT-014 启动包第八节四裁正式文本 | 七笔：`51ab22a`（013 切分校准）→`819182e`（013 路径面 23 处）→`08c2d79`（014 守卫按四裁修正）→`fcb5c30`（014 活文档 180 条逐条改写）→`7a9ee26`（014 存档件勘误节 63 形态覆盖 82 条）→`fa9fefc`（014 摘双跑 7→6）→本笔（账面）。全账见计划 §38 | **终态：`--with-scan` 6 步全绿、守卫红集 0、自证格 51 断言／32 组比对每轮必跑。** 四裁落点——①"冻结件"改名**存档件**，容忍面收窄为"行号形态"一种，范围限 `panel/docs/evidence/**`＋recon＋两份矩阵不得扩散（清单写死在 isArchiveRel）；②推翻"存档件存在性失败降警示"⇒ 存在性／#符号／缺前缀与活文档同价判红，清偿只走**只增不改的"引用勘误（守卫登记）"追加节**（覆盖条数与冗余勘误都进门禁打印）；③recon §10.3 判据落地＝目标只在 doctor 仓命中而书写未带前缀判红（自证格 ㉑–㉒ 钉正反两向）；④语义保真写法入头注：可解析成 `路径[:锚]`＝指针必须可定位，非指针走 (a) 定义码＋符号／(b) ASCII 双引号字面量／(c)「第 N 行（当时）」。红集轨迹 213→203→180→**266**（四裁新增 68＋18）→82→**0**。附带查出并修对 3 处存量陈述陈旧（门禁序号未回填两处、regression-all 是否含 p23-verify 一处）与守卫自身 1 处实现缺陷（别名前缀写成非捕获组，"前缀解析"实为多根回退碰巧命中）；活性证 M1–M5 五发各自翻红、还原 sha 逐字节一致 |
| 54 | **正典化批 · C-3 三件套落地＋F-19 成文半边（清单转正／终数定谳／面板门禁分级口径成文）** | 协调侧《收口批施工图》§三与 §四（`var/scratch/exe-boot-012-20260929/report-closing-batch-012.md`）＋清单《到货登记》五/六＋本文 §15.2/§15.3 复算定稿 ⇒ EXE-BOOT-015 启动包第八节第 2 条 | 四笔（均 `toolkit` 仓、各自独立可 revert）：`8c5101c`（笔 A 清单＝H4 入横切＋《正典化》新节）→ `ca40119`（笔 B `docs/embed-toolkit.md` §4.1 成文）→ `80c4567`（笔 C 本文件导航块两处陈旧现状陈述在位改对＋清单指针挂正典化注）→ 本笔（笔 D 账面三件套）。全账见计划 §39 | **终态：功能全量清单定稿为正典、F/H 编号空间冻结、报数口径唯一。** ①**终数定谳**＝重建件 **23**（F-69…F-91 无空号无并号）、覆盖账 **68＋23＝91（定为终数）**、编号空间现用至 **F-93**；覆盖账外在册 **2 枚**＝F-92（原稿 ①-B 星标 3 差集入册）与 **F-93（本批复算新捞出**，开工令未点名，按与 F-92 同一条路处置并入批末申报呈追认）；行首 ★F- 全体 **25**、横切条目 **4**。"22/90"旧字样退役并逐处列名（清单 3 处＋计划 7 处，原文照录不再作依据引用），并声明**两个数不许混用**：91 是覆盖账、不是编号上界。②**H4 入横切区**（纯插入 19 行／0 删）＝两套必填与合法字段清单互不相容——四数按现行代码复算：契约 `KNOWN_CONTRACT_FIELDS`（9）∪`KNOWN_LEGACY_FIELDS`（8）＝**17 键**／必填 id·displayName·version·contract，`doctor仓:src/engine.mjs` 的 `MANIFEST_TOP_KEYS`＝**14 键**（真子集，差 registers/exports/healthCheck）／必填 manifestVersion·name·requirements＋`REQUIREMENT_KEYS` 五键 ⇒ **必填集相反**；状态维持"有出入"，修复归 C-2／v1.2（本条只立账）。③**F-19 成文半边**落 `docs/embed-toolkit.md` §4.1：分级判据在注册处 `change` 标注（不看路由名、不机械看方法），全表实数 **32＝只读闸 10＋写闸 22**，只读闸内带 POST 者**恰 1 条**＝`/v2/install/precheck`（不落盘、不签写凭据、不改 registry 状态；`resolveLocalSource` 会 import 候选模块）⇒ 行为面维持裁决 4，**成文≠翻正**；另如实登记 `doctor/dry-run` 零落盘却走写闸这条反直觉标注，不替它补代码里没有的理由。④**数法后果写明并加排除项**：★H4 新行不入呈审稿 ★ 顺位，否则 68 抬成 69、八锚错位一格看似 F-19 考据翻面；加排除后复跑八锚全中，F-19 归属与计划 §15.3 一字不差。⑤附带查出**导航性陈旧陈述 4 处**：debt 冷启动读法"现在含 5 步"与"已滚存两次、现基准 e8051fe9"两处**在位改对**（笔 C），计划 §38.8 的"基准符 e8051fe9"（实质成立、符号陈旧）与同节自称终态却记 D1 时点读数两处**走新增节更正**，并**新立口径：账面笔读数一律写"落笔前＋本笔新增"两段式**。**三道锁读数**＝门禁 `--with-scan` 6 步全绿＋nt 480/0＋p1 314/0＋p22 165/165＋p24 720/720＋regression 14 项全绿＋pcc 0 问题＋doctor {21,26,11,7}＋stage3 a–f 全 PASS＋`~/.dsh` hash `c585738c…0bd9`/5 files 逐字节同（全程只读）；`cordis.patch.yml` 一字未动（现行基准符 `b0f304c9` 实读与 p24 硬闸常量逐字节相同；工作树 3190 B／blob 3104 B）；doctor 仓零改动（链尾仍 `7ba8251`）；守卫红集四笔全程 0 |
| 55 | **契约 v1.2 批前半收官 · 前置④ 全清单守卫＋题一案二对账网扩面＋前置① 撤必填集落码（两仓同批）** | EXE-BOOT-016 启动包第八节 3a/3b/3d；本文 C-2 节前置清单第 1、4 项与题一终批；修法正典＝`docs/contract-v1.1-recon.md` §8.3；口径先例＝W9（#44）＋本文【新规则两仓同批落】 | 四笔、两仓：toolkit `0569473`（笔 1 前置④）→ `7e33280`（笔 2 案二扩面）→ doctor `ce31f83` ↔ toolkit `748dc9f`（笔 3 互引，两仓同批） | **终态：C-2 前置①④ 已闭、题一终批已落地；前置②与"legacy→error 本体"未动，题面已备好候裁（计划 §40.4）。** ①**前置④**＝`test/contract.test.mjs` 的 KNOWN_LEGACY_FIELDS 由 1/8 单名钉换成 deepEqual 八名＋逐名 info＋第 9 名必 error＋影响面实测复用（recon §4 数据复用变可跑断言：7 份内置清单顶层 legacy 实得**六名**，`registers`/`exports` 只作 `requirements` 子键）；变异 M-a 摘名⇒三格红、M-b info→error⇒三格红（含既有 D-13① 格，此条即"收紧会打断既有承诺面"的实测证据）、M-c 前缀模糊匹配⇒恰红"第 9 名"一格。②**题一案二**＝对账网从 3 接缝扩到 **D 段重叠面逐规则 17 格＋E 段根字段键集 5 格**（笔 2 落 43 格；笔 3 加 D18 与 B5/B6 后终态 **46**，起点 21）：同向红／契约严·doctor 放行／**方向相反**（顶层 registers、exports＝H4 在册分叉）三类分列，E 段把 H4 的 17/14/差集恰 {exports, healthCheck, registers} 钉成活体断言；M-a doctor 白名单放进 registers⇒红{D12,E2,E3}、M-b 契约摘 exports⇒红{D13,E1,E3,E5}、M-c doctor 撤 id 校验收窄⇒**恰红{D01}**（隔离）。【新规则两仓同批落】口径入册（ parity 头注＋本行）。③**前置①**＝`doctor仓:src/engine.mjs#validateManifest` 撤三根字段必填集、`requirements` 改"**在场才管**"（缺席整段跳过由 parity B5/D16 钉成可见断言），连带修一处**既存**潜在崩溃（套件根 requirements 在场而 exports 缺席 ⇒ `Object.keys(undefined)` TypeError；定性＝既存缺陷被本批夹具暴露，修法只加存在性闸、语义不变），doctor 四套件 **21→22**（新钉含"纯契约子清单零 schema issue"整面断言）；中间态如实报：doctor 先落时 parity 当场 41/43 红{B2,D16}，即"先扩网后动码"顺序所要的效果。④**考古两题实据**＝F-87 **有真用**（写方调用点在 apply 路径＋既有钉 `web-search-local` 的 engines 钉（原测试文件，随出包退役）；宿主侧 `@deepseek-ai/dsh-tools` 的 `register(definition)` 对 `output{schema,render}` 齐备性当场 throw，本仓注册体形状逐条对得上；**边界**＝宿主运行时装配未证，且本仓 node_modules 类型面无 `tools` 服务）；D-13② **前提与实况不符已按令停报**（宿主事件面其实已正典化且机器可读：9 个 `interface Events` 声明文件／33 个事件名，本仓 11 条声明**逐条命中 11/11**；真门槛经笔 6 改账＝宿主全局包树实测 **38 个声明文件／94 个事件名**、同一 11 条声明在两棵树**均 11/11 命中**，且七个共有包跨树版本逐一对齐（cordis `4.0.2`／dsh-agent·session·llm·settings·commands `0.1.5-rc.2`）⇒ 初稿所写"版本对齐未证"**撤回**（过度陈述，成因见计划 §40.6 第 7 条）；剩下的两条门槛＝**仓外 `AppData` 那棵树能否充当校验读取面**（本仓历史只引仓内逐字副本，recon §3 有教训在案）＋"哪些包/哪个版本算权威宿主面"的**扫描面判据须新立**），本会话零深度校验代码。⑤**三道锁读数**＝门禁 `--with-scan` **6 步全绿**（85.3s，真实仓 dry-run issues=0 e0/w0/i0）＋nt **484/0**＋p1 314/0＋p22 165/165＋p24 720/720＋regression 14 项＋pcc 0 问题＋parity **46/46**＋doctor **{22,26,11,7}**＋stage3 a–f 全 PASS＋守卫红 **0**（自证 51/51、token 3090、覆盖 82／冗余 0、沙箱根 181，账面笔落笔前）＋`~/.dsh` hash `c585738c…0bd9`/5 files 逐字节同（全程只读）＋`cordis.patch.yml` 基准 `b0f304c9` 一字未动＋宿主 pid 17384 未触（宿主对契约与独立 doctor 零消费 ⇒ 本批不需真机窗）＋两仓工作树净（链尾 toolkit `748dc9f`／doctor `ce31f83`）。⑥**自查三条如实入账**＝E 段首跑"doctor 放行 healthCheck"系**夹具把值写成函数被 JSON 丢键**（读数错在先、H4 账面无误）；变异工装首版红集解析未剥 ANSI 致三发全报"无红格"（以 v2 实档为准，两档同目录留档）；M-c 那一发 parity 网抓不到＝重叠面取样对"单侧新增过严"的天然边界，靠新钉补上、不宣称网无洞 |
| 56 | **契约 v1.2 收官批 · 终批四裁落账＋B 子案一落地＋收口批全书闭账注＋本文 C-3 落档（纯文档两笔，doctor 仓零改动）** | EXE-BOOT-017 启动包第八节 1–3；用户 2026-09-29"按建议"终批（随包下发）；收口批六件定义正本＝`var/scratch/exe-boot-012-20260929/report-closing-batch-012.md`；三段施工申报＝同目录树 `report-guard-batch-013.md`／`report-guard-batch-014.md`／`report-canon-batch-015.md` | 两笔（均 `toolkit` 仓、各自独立可 revert）：`915e8c8`（笔 1·B 子案一：`docs/migration.md` §4 前置 2 在位改述，**6 增／2 删**）→ 本笔（笔 2 账面：计划 §41＋本文 A#56／《C-2 追加二》／C-3＋CHANGELOG 节）。全账见计划 §41 | **终态：收口批六件（C-1 守卫进门禁／D-20 存量清理／第 6 步摘除／C-3 正典化／F-19 成文半边／C-2 v1.2 档）全书闭账（计划 §41.3 六件全闭清单＋证据互引）；v1.2 前半档收官，前置② 经 B＝子案一闭账，收紧本体与 entry/inject/tools 扩槽挂 v1.3（本文 C-3）。** 终批四裁＝A 丙／B 子案一／F-87 扩槽方向采认落 v1.3／D-13② 维持现状收口（两条门槛挂升级路）。三道锁读数（落笔前实档 `var/scratch/exe-boot-017-20260930/`）＝门禁 `--with-scan` **6 步全绿**（76.5s 复跑档；首跑第 1 步一过性失败三档留档如实入账，计划 §41.5 第 4 条）＋nt **484/0**＋parity **46/46**＋p1 **314/0**＋p22 **165/165**＋p24 **720/720**＋regression **14 项**＋pcc **0 问题**＋doctor **{22,26,11,7}**＋stage3 **a–f 全 PASS**＋守卫红 **0**（自证 51/51、token 3145、覆盖 82／冗余 0、沙箱根 185，本笔落笔前）＋`~/.dsh` hash `c585738c…0bd9`/5 files 逐字节同（全程只读）＋`cordis.patch.yml` 基准 `b0f304c9` 一字未动＋宿主未触（启动包所记 pid 17384 已不在运行，现场为 ZCode.exe 进程族、pid 以现场为准；本批零宿主动作）＋两仓工作树净；含本笔的末次读数与两笔合计以批末申报为唯一依据（计划 §39.4/§41.2 自指终止条件） |
| 57 | **续用批 · flake 两振立案小笔（install-confirm-gate 装载预算 250→3000ms，安全裕度路、断言零改动）＋机器半执行 5/8（M1/M2/M4 因宿主停机挂起候窗）** | EXE-BOOT-017 续用令三.2／三.1；两振实档＝010 批 `var/scratch/exe-boot-010-20260927/msg-readme-final.txt`（首振）＋本批 `var/scratch/exe-boot-017-20260930/ci-baseline.log`（二振）；立案条＝本文《环境注记》④ | 一笔（toolkit 仓）：`1f04390`（`test/install-confirm-gate.test.mjs` **4 增／1 删**，单文件旋钮＋成因注释；探针工装落 scratch 不进仓） | **终态：门禁 `--with-scan` 6 步全绿（76.9s，含本笔）；修复后 install-confirm-gate 全链绿；npm test 步连绿 10 次稀缺性在档（自然频率 ~1/10）。** 三道锁读数（certified2 实档）＝nt **484/0**＋p1 314/0＋p22 165/165＋p24 720/720＋regression 14 项＋pcc 0 问题＋parity **46/46**＋doctor **{22,26,11,7}**＋stage3 **a–f 全 PASS**＋守卫红 **0**（自证 51/51、token 3175、覆盖 82／冗余 0、沙箱根 197——与收官批同值，本笔零文档引用）＋`~/.dsh` hash `c585738c…0bd9`/5 files 逐字节同（全程只读）＋`cordis.patch.yml` 基准 `b0f304c9` 未动。**机器半**＝M3（hash 三时点逐字节同）／M5（agent-memory 54 会话、自日志 44 行）／M6（llm-requests.jsonl 3.85MB）／M7（certified 与 certified2 两轮全链绿）／M8（w2-health-fold 在 nt 内绿）全绿；**M1（面板 API 通达）／M2（演练插件全流程）／M4（热配置 shadow）挂起候窗＝宿主 web 面不在运行**（全系统零 node/dsh 进程、无 3080 监听、ZCode loopback 两端口实测 401/404 非面板；agent-memory 与 rate-throttle 末活动均 2026-09-29T04:37Z＝停机时点互证）。演练插件 `drill/probe`（纯契约最小形）已构建并**本地 registry 预验**（装 38ms→active、卸后 plugins 空，`drill-prevalidate.log`），未装宿主、未触 patch 行 |
| 58 | **五环终验窗收官 · 机器半续跑 8/8 全绿＋用户半三问全"是"＋第一阶段（本地自用版）收官闭账** | C1-007 清场令＋收官判定令（2026-09-30）；窗终报正本＝`var/scratch/exe-boot-018-20260930/report-close-018.md`；挂起前史＝上行 #57；施工图＝017 终报 §十（`var/scratch/exe-boot-017-20260930/report-v12-close-017.md`） | 一笔（toolkit 仓、纯文档收官账笔、单笔可 revert）：计划 §43＋本行＋CHANGELOG 顶格节（README 基准句更正已先行随批笔 `ce8e249`） | **终态：第一阶段（本地自用版）正式闭账——五环终验全过（机器半 M1–M8 全绿＋用户半三问全"是"＋§8.8 五条判据逐条成立＋清场三判据全过＋终态读数零漂移），C1-007 终判通过。** 机器半续跑＝M1（4 GET 全 200；health 装前对缺席 id 400 属 registry 面为空的正确行为、装后在位 id 闭环）／M2（precheck 200 零 issue→错误 confirm 400 `confirm-missing`→正确 confirm 200→第六卡 `drill/probe` active/persisted→enabled/reload 200→uninstall 200→**state.json sha 装-卸两时点逐字节回装前** `a8a5d0aa…`/41B）／M4（shadow 即改即显 auto→official→逐字节还原回落；**面归属勘误**＝真实面在 v1 snapshot 的 `configPanel.mode` 非 v2 snapshot，勘误正本＝018 终报 §四、017 方案原文不回改、C1-007 采纳互引）；用户半＝问一/问二/问三全"是"（折叠亲验三动作全对＝**W2 期顺延项闭账**，问二＋M8 双证）；清场三判据＝state.json 回装前＋`~/.dsh` hash `c585738c…0bd9`/5 files 三时点逐字节同＋doctor 0/0/0（门禁第 3 步 issues=0 e0/w0/i0）。演练插件真机装-待验-卸全链走通（registry 通道唯一写面 `.registry/state.json` 41B→283B→41B），窗毕清场两清。**升级路既有条目核对（收官令 2.2，只核对不新立）**：v1.3 挂账＝C-3 正本、D-13② 两问＝C-3 第二节、flake 同族紧预算＝《环境注记》④、沙箱根前缀口径＝C-3 三节候选 1、对账网盲区类＝C-3 三节候选 3——五项全在、零缺、零补记。观感注记如实入账不立项（健康历史 `healthy→healthy` 串行＝每次核健康记一笔、全窗皆健康故重复）。读数（落笔前实档 `var/scratch/exe-boot-018-20260930/`）＝窗收官轮全链零漂移（门禁 6 步 92.6s＋nt 484/0＋parity 46/46＋p1 314/0＋p22 165/165＋p24 720/0＋regression 14 项＋pcc 0＋doctor {22,26,11,7}＋stage3 a–f＋守卫红 0）；含本笔读数以批末申报为唯一依据。开源阶段（v1.3 等挂账）候用户启令、未启令前零动工 |
| 59 | **C1-007 阶段二 S1 剔除批 · web-search-local 出包＋search-router 降"可缺席 provider 位"（副本线四笔＋账面笔；本地仓零改动）** | S1 剔除批开工令（12 门全批照建议案）；呈报正本 `D:/dsh-test-sandbox/docs/opensource-package-design-c1-007.md` | 笔 A `8ff8c63`（G2b/G3）→ 笔 B `247dfc6`（F-91 八点＋patch 滚存 b0f304c9→693cfcd7）→ 笔 C `05c32f4`（负向钉两枚）→ 笔 D `049dde6`（翻账＋守卫 25 红清偿，覆盖 82→87）→ 本笔（§44＋A#59＋E. 分歧账） | **终态**：F-91 全清（清单 :490 翻正注）；门禁 5/6 绿＋第 2 步 p2-smoke 1 处既裁预期红（维持至 S2）；nt 470/0、p1 309/0、p22b 17/17、p24 62/0＋608/0、q2-layer 14/14、doctor 0/0/0、守卫红 0；四卡口径（登记表/快照/卡面/描述表）；G3 实文见计划 §44.2。批中 agent-memory 并发写 flake 一轮（三连跑 94/0 全绿，fd79c7a 先例同族）；笔 A 首版混入误吞删除未推送前软重置重分（如实申报）。读数正本＝计划 §44.3，实档 `var/logs/2026-09-30/C1-007-s1-*.log` |


---

## B. 显式遗留（裁定不做 / 维持现状，附触发条件）

### B-1 · 双实例共享待确认 plan 池（原 #11(a)）
`panel/manager/apply-engine.mjs` 的 `PLAN_STORE` 仍是模块级 `Map` ⇒ 同进程多实例共用一个待确认 plan 池。

- **过程记录**：P7 期间曾改为 `createPlanStore()` 按实例持有，实测连带 **7 项回归红**——
  `panel/manager/uninstall.mjs` 的 10 个 plan/execute 函数与 6 个验收脚本（p21/p22/p23/p24-verify、
  p24-ui-matrix、backup-write-test）都以 `putPlan/getPlan/dropPlan` 三个模块函数为契约，改签名即动
  P2.4 深度生命周期资产全链。改造已**完整撤回**（`apply-engine.mjs` 回到 HEAD 逐字节一致）。
  **【2026-09-22 侦察轮更正本条基数，结论不变】**：原文"**10 个** plan/execute 函数与 **6 个** 验收脚本"经实测为
  **15 个导出函数**（7 个 plan + 8 个 execute，`panel/manager/uninstall.mjs` 的 7 个 plan 构造器（第 375/437/487/513/612/670/705 行，当时） +
  `:799/835/887/917/963/981/999/1014`）与 **5 个** 验收脚本（`backup-write-test`/`p21-verify`/`p22-verify`/
  `p23-verify`/`p24-verify`）——`p24-ui-matrix.mjs` **不引用**这三个模块函数（全仓 grep 为证），被误计入"6 个"。
  **成因**：B-1 落账于 P7，其后 P2.4 批 1 扩了 mount/restore 面的 plan/execute 函数、未回填本条基数；
  "6 个"系当时把 p24 两兄弟一并当验收脚本。**风险评估与裁定不受影响**（token 派生、短生命周期、同信任域、
  patch 域天然只针对一份文件；函数与脚本更多只说明"改签名影响面比原估更大"，即维持现状的理由更强）。
- **风险面**：plan token 为 sha256 派生、短生命周期、只在同一 loopback+CSRF 信任域内可见；
  且 patch 域天然只针对一份 `cordis.patch.yml`。跨实例消费需要攻击者已握有该信任域与 token。
- **裁定方**：用户（2026-09-20 终版验收，第 1 项）。
- **触发重做条件**：① 出现"两个 toolkit 实例管理**不同** `toolkitRoot` 且需互相隐藏 plan"的真实部署；
  或 ② 体检操作台 / patch 域底层因其他原因重构时**一并修掉**。

### B-2 · GitHub Actions workflow 维持"结构就位、未执行"
`.github/workflows/ci.yml` 已写好但从未在任何地方跑过：本仓无 git 远端，且依赖 `@deepseek-ai/*`
私有源（公共 runner 上 `npm ci` 装不出来），需自带私有源凭据的 self-hosted runner。
本地一条命令门禁即为**事实 CI**。
**裁定方**：用户（2026-09-20，"CI 维持现状：本地门禁一条命令即为事实 CI，workflow 待仓库有远端后自然生效"）。

---

## C. 后续任务

### C-1 · 契约 v1.1 规格草案（**全文登记，按用户裁定立项**）

**裁定方**：用户（2026-09-20 终版验收第 2、3 项：审计事件命名并入 v1.1 不单独修；契约 v1.1 登记为后续任务、
规格草案全文存 debt.md）。

> **现状（2026-09-22 侦察轮后 · 草案原文按"错误照录、修订滚存"原则一字未改，修订集中在这里）**：
> ① **收口定义已改写**——v1.1 的 done = **三方核对矩阵全绿**（协调侧裁决修订第一条），下方六项只是矩阵落差的
> 一个子集；矩阵与落差总账见 `docs/contract-v1.1-recon.md` §5-§6。
> ② **六项中第 3 项已移出 v1.1**（→ C-2）；第 4 项名单按实测修正（见本文件头四条错账之第二条）；
> 第 2 项计数 7→8 且"三处消费方"实为一处手工；第 1 项定性由"补字段"改为"修语义倒置"（可复现实证见 recon §7）。
> ③ **三道必答设计题已裁**：题 1（`requires↔inject`）走"真相收口 + 补测试钉住"，合成 `inject` 与 patch 行
> `inject:` 声明两项**推迟立项**（见 D-18/D-19，立项时必答"与 cordis 上游 REQ-6 对齐还是自创"，不许无限期悬置）；
> 题 2（doctor `exports` 必填键分叉）采"**契约管解析行为、doctor 管必填性**"，管辖边界须写进契约文本，
> `.` = 包主导出 须如实记载，对账用例**必须进门禁每轮复跑**（手动脚本不算守卫）；
> 题 3 → C-2。**题 2 与题 3 的逻辑一致性已论证**（不矛盾，但 v1.2 撤根字段必会令 doctor 的键集校验
> **静默空转**，修正方案见 recon §8.3，须随 C-2 一并裁）。
> ④ **第 4 项口径已改裁为 B**：`snapshot.mjs` 输出面按文档正确语义命名，`p1-smoke` 相应断言如实更新并
> **报用户批准**（A 方案"只换取数源保持旧键名"经核验**不成立**——`registers.services` 对桶根装的实际是
> 依赖数据，命中"键名指东、数据装西"的失真即停条件）。B 尚需两处新裁定：`provides` 无 `events` 槽位、
> 面板 `inject` 键名是否随动（recon §8.4）。
> ⑤ **实施批准 withheld**：分批计划（recon §10 的批 0-6）过裁前，两仓代码一行不动。
> ⑥ **⑤ 的前置已解除**（2026-09-22 协调侧过裁令 + 批 1 验收令）：批 0-11 + 改名批 + 五修正已过裁，
> 批 0＝`af803b2`（纯 docs）、批 1＝doctor 仓 `2f12f53`（首次动代码）＋本仓证据笔 `46f8b94`，链尾随批报告滚动。
> ⑦ **验收口径变更**（裁定方：协调侧，批 1 验收令）：doctor 侧自**批 2 起**由"四套件不降"改**"五套件不降"**
> （含 `acceptance-stage3` a–g，其 e) 块实测只读真实 scope、写影子 tmp，hash 基线与 `fixable 0` 前置见
> recon §10 判据段）。同轮更正**批 11 的仓归属＝只动本仓**：`doctor/src/doctor.ts` 是本仓子包路径，
> 独立 doctor 仓无 `doctor.ts`、全仓零契约版本字样 ⇒ C-1 期独立 doctor 仓仍只批 1 一笔；
> 混淆成因（跨仓引用不带仓前缀）与批 11 的两处计划漏项见 recon §10.3，规矩：自此 C-1 文档面跨仓引用一律带仓前缀。
> ⑧ **批 2 已落地**（2026-09-22，`22f1f21` 代码 + `a5ca247` 落账）：`provides` 三槽进契约与校验、
> `extractRegisters` 逐槽优先读它、`doctor.ts` 撞名比对的**两处**借用同时断掉 ⇒ **P0-2 行为半边清偿**，
> 数据半边留批 10（内置 7 份仍无 `provides`；桶根归一 `services` 因挤掉借用而变空，属预期内、非回归）。
> ⑨ **门禁基线自此 6/6**（`--with-scan`；默认 5 步）：批 2 把 DOCTOR_CLI↔契约对账接成独立一步
> （题 2 条件 a"手动脚本不算守卫"）。各批行/交接材料里的"门禁 5/5"按当时基线成立，判据一律按 6/6。
> ⑩ **D-13 分层登记**（events 声明两仓零校验）：最小形状校验进 v1.1、由**契约单层**落地并入批 10 邻近笔
> （独立 doctor 零改动，甲案边界不变）；深度校验（与宿主发出面对账）挂本区 C-2/v1.2——真门槛不在本仓；
> 面板展示维持。措辞见 `docs/contract.md` §7 D-13 与 recon §10.4。
> ⑪ **批 3 已落地**（2026-09-22，`15871af` + 本 docs 笔）：★2 的模块静态面绑定接通（D-9 半截设计还清），
> 真装载链用例两条 + 变异一发；激活面实测维持 0 ⇒ 内置行为与面板可见面零变化；
> `panels` 双在场的优先级**未预判**，留批 4 与 ★3 一并定案；新登记一项待裁：模块绑定的 `panels`
> 是否补装载侧守卫请协调侧定，细节见 recon §10.3 批 3 段。
> **【批 3 验收令已把上述两项裁掉】**：① panels 优先级随 ★3 同族同向＝**模块导出赢**，与 configSchema
> 同序、同一批（批 4）实现；② 最小形状守卫（数组 + 每项非空 id）**进 v1.1**，并入批 10 邻近笔与 D-13 同笔
> （模块路径绕过 `validateManifest` 致"每项非空 id"承诺单路成立，守卫补齐另一路）。
> ⑫ **批 4 离线面已落地、真机复验待用户过目**（2026-09-22）：★3 configSchema 翻正为**模块导出赢**
> （装载器 + doctor 预检链 + registry 写回链三处同序），`panels` 同族同向；D-12 由"与实现相反"转为
> **已清偿并留失效指针**，§5 那句承诺自此为真。用例批 4-①/② 各钉装载侧与 doctor 侧
> （变异只翻装载器时 ② 仍绿 ⇒ 两条非冗余）。存量前提：门禁第 5 步本就按宿主语义校验真实 patch 行，
> 14 键模块 Config 对现有配置已通过；p1-smoke 314 条与 dry-run `0/0/0` 在翻转后照绿。

**范围（六项，缺一即不算完成）**：

1. **新增 `provides` 字段**：`provides: { services?: string[], commands?: string[], providers?: string[] }`
   —— 补上契约缺口（现状只有 `requires.services` = **依赖**的服务，没有"本插件**注册**了什么"的表达）。
2. **`audit:*` 纳入契约事件枚举**：`CONTRACT_EVENT_NAMES` 增补 7 类审计事件（或引入
   `AUDIT_EVENT_NAMES` + 统一 `contractAuditEventName(prefix, event)` 拼装函数），
   **收编** `registry/src/registry.ts`（第 266 行，当时） 的手工模板串；同步三处消费方：
   `panel/manager/v2-api.mjs` 的 SSE 短名转发表、`panel/client/index.js` 的 `V2_EVENT_NAMES`、
   SSE `hello` 帧与 `event:` 行命名。
3. **`KNOWN_LEGACY_FIELDS` 收紧为 error**：前置条件是第 1 项已落地且 `extractRegisters`
   （`registry/src/loader.ts#extractRegisters`）改为**优先读 `provides`**、旧 `requirements.registers.*` 退化为 info；
   并先做一次 legacy 字段引用审计（面板 `plugin-registry.mjs` / `snapshot.mjs` 仍读旧字段，见
   `docs/migration.md` §4 三个前置条件）。
4. **5 个内置插件补 `provides`**：`lib/{rate-throttle,compact-router,agent-memory,search-router}/dsh.plugin.json`（S1 剔除批后 4 份；原清单含 web-search-local）
   把各自注册的服务/命令/提供者显式写入，使 `reg.name-collision` 冲突检查覆盖到它们。
5. **两仓同批**：toolkit（contract + registry loader + doctor 规则）与 doctor 独立仓
   （`doctor仓:src/engine.mjs#MANIFEST_TOP_KEYS` 白名单需加 `provides`；参照 `requires`/`panels` 的
   落地方式 `6839cc1`）。两笔提交互相引用。
6. **发布与迁移说明**：契约版本 `PLUGIN_CONTRACT_VERSION` 升**次版本**（1.0.0 → 1.1.0），
   `CHANGELOG.md` + `docs/contract.md` 写迁移说明（旧 manifest 在 `^1.0` 下继续可用；`provides` 缺席
   时冲突检查降级为 info 而非 error），并明确"破坏性变更才升主版本"的红线未被触碰。

**v1.1 必须一并处理的现状补充（2026-09-21 cordis 符合度复核，Pack E1 实测入账）**：
`requires.services` 与 cordis 的 `inject` **目前互不桥接**——契约只把它当预检输入，
装载门控完全取决于插件模块自己有没有 `export const inject`。实测后果（见
`test/cordis-inject-lifecycle.test.mjs`）：① 只在 manifest 声明依赖的插件，cordis 不设门、
依赖缺席也直接 ACTIVE；② 真按 `inject` 设门的插件，其"依赖离开 ⇒ fiber 撤下 ACTIVE、
apply 不重跑"这一段 registry 完全不知道，条目仍报 `active`，只能靠 doctor 下一轮巡检
报 `service-missing` 兜住；③ `install` 全局互斥 ⇒ "装 provider 去解锁正在等依赖的
consumer"这条路走不通，只能等重试退避。**"要不要把 `requires.services` 合成为 inject"**
是 v1.1 的必答设计题（合成会改变装载时序，须连带决定 ① 与 ② 的真相归谁写）。

**必答设计题第 2 条（2026-09-21 Pack F2 交叉验证入账）**：doctor 与本仓契约对 `requirements` 的口径**分叉**——
doctor 把 `exports` 列为 `requirements` 的**必填键**（`REQUIREMENT_KEYS`，缺则 `schema.required-missing`），
而本仓契约 v1 的 `ManifestRequirements`（`contract/src/types.ts`）**根本没有 `exports` 这个字段**，`requirements` 整体只躺在
`KNOWN_LEGACY_FIELDS` 里作迁移期容忍。⇒ 于是"用契约校验通过的 manifest"可以被 doctor 判 error，反之亦然。
v1.1 必须择一：**（a）** 契约正式定义入口声明字段（含 `"."` 的语义＝插件入口还是包主导出——agent-memory 这一格本轮按"包主导出"处理，见 D-7 追加），并让 loader 与 doctor 读同一份定义；**（b）** 契约明确不管入口、由 doctor 独占校验 ⇒ `validateManifest`就要对 `requirements` 做 doctor 同款键校验，且 `KNOWN_LEGACY_FIELDS` 收紧计划（本区第 3 项）要连带决定这份表怎么迁。
两条路都要求"`requirements` 必含 `exports`"与"契约字段清单"两处不再互相打脸；裁定方：待用户（v1.1 立项时）。

**验收口径**：全量门禁（`node scripts/ci-local.mjs --with-scan`）+ 真实仓 doctor dry-run `0/0/0`
+ 一条新用例证明"`provides` 声明的撞名服务会被 `reg.name-collision` 阻断"。

---

### C-2 · 契约 v1.2：`KNOWN_LEGACY_FIELDS` 收紧为 error（**自 C-1 第 3 项移出，2026-09-22 用户裁定立项**）

**裁定方**：用户（2026-09-22 C-1 裁决第三节：「整体移出 v1.1，记 v1.2 立项」+ 裁决修订第四节补一致性论证）。

**为什么不进 v1.1（一句话）**：收紧的真实门槛不是"一次引用审计"，而是**要 doctor 撤掉自己的必填集**——
`doctor仓:src/engine.mjs`（第 330-337 行，当时） 把 `manifestVersion`/`name`/`requirements` 判为必填（缺则
`schema.required-missing` **error**）、`:387-391` 把 `requirements` 五键判为必填；实测本仓 **7/7 份 manifest 靠
"两套字段都带"的混合形态**才同时过契约与 doctor，这正是 `0/0/0` 今天成立的原因（枚举见
`docs/contract-v1.1-recon.md` §4）。这些字段一旦转 error，等于把自己的正典 manifest 判死。

**v1.2 立项的完整前置清单（条件 a：一条都不许少）**：

1. **doctor 撤必填集，且必须连带处理"静默空转"耦合**：撤 `:330-337` 的根字段必届时，
   `:387-391` 的键集校验因 gate 在 `requirements` **存在**之上而**自动不执行**——纯契约 manifest 一条
   `requirements` 检查都不会跑、也不报红。必须把题 2 交给 doctor 独占的那份管辖权**改述并改码**为
   "`requirements` **在场时**其键集与 `./` 目标存在性归 doctor；`provides`/`requires` 合法性归契约"，
   并把 C-1 题 2 已批的那枚 DOCTOR_CLI 对账用例**扩到"不带 `requirements` 的纯契约 manifest"形态**
   （让空转变成可见断言）。一致性论证全文见 recon §8.3。
2. **前置②与面板纪律的冲突点须升级用户裁决，不许悄悄消失**：`docs/migration.md`（第 50-51 行，当时） 原文要求
   "面板不再读旧字段"，而同一段自己写明 `plugin-registry.mjs` 的 5 插件表与 `snapshot.mjs` 的
   `ORIGINS/ROW_IDS` 是 **P2.4 深度生命周期资产、面板纪律要求原样保留** ⇒ 该前置**按字面永远满足不了**。
   可改的只有"读哪个字段"。v1.2 须由用户裁：是把前置改写成"改读来源、不改这张表存在"，还是解除面板纪律。
3. **本轮已立的核验要求全套沿用（不得放宽）**：
   ① **方法自证无盲区**——任何"legacy 字段引用审计"必须先自证扫描面覆盖路径与盲区（本轮补条七.2 口径：
   仓内探针≠端到端；须写明扫了哪些目录、哪些是字符串字面量匹配、`panel/client/index.js` 内嵌 HTML 与
   `test/fixtures/**` 是否在范围内）。本轮已知的一个真实盲区教训：宿主全局包路径在仓外，工作区外读取会被拦，
   只能引仓内逐字副本（`scripts/patch-config-check.mjs`（第 279-285 行，当时）、`test/dual-channel-parity.test.mjs`（第 13-17 行，当时））。
   ② **新增 error 一律走隔离校验通道，禁止装载早期裸抛**——D-16/A#24 的真机教训：静态 patch 通道的校验失败会
   经 loader 冒到 `dsh-app-boot` 顶层 ⇒ **整个宿主 exit 1**；registry 通道同样失败只伤单条目（`lastError` +
   退避重试）。故 v1.2 任何新判红都必须落在后者（或落在**提交前门禁**，如 `patch-config-check.mjs` 那条链路），
   不得让一个收紧后的 legacy 字段在宿主启动期掀整机。
   ③ **历史记录保留**——错误照录、修订滚存新笔；证据正本只增不改（D-2 同族两处已立硬闸的先例在此沿用）。
4. **本轮数据复用（条件 b：不丢弃）**：`docs/contract-v1.1-recon.md` §4 的 7 份 manifest 根字段枚举、
   §5 落差总账、§6 两份折入的逐行判定，两份逐行矩阵，以及沙箱 `var/scratch/c1-recon-20260922/`
   的 `raw-test-index.md`（27 测试文件 / 256 运行用例 / 182 `check()` 逐条索引）即 v1.2 的起点数据；
   `KNOWN_LEGACY_FIELDS` 现在只钉了 1/8 个名字（`test/contract.test.mjs#KNOWN_LEGACY_FIELDS`），改成 `deepEqual` 全清单
   + 逐名一条 info + "第 9 名必 error" 是本项开工前的**第一件事**（收紧动作本身不可在无此守卫时进行）。

**验收口径（v1.2 用）**：全量门禁 5/5 + 真实仓 doctor dry-run `0/0/0` **且** 0/0/0 的达成路径必须写明
"是撤了必填集还是补了字段"（防"改测试凑绿"）；两仓同批、互引 hash；每笔带变异自检（摘掉新校验 ⇒ 指定期望
翻红）；涉宿主装载面者真机复验、以现场实证为准、不做时点承诺。

> **F-87 挂账入账注（2026-09-27 裁归 · 纯追加）**：F-87（web-search-local 的
> `tools.register({name:'web_search_engine',…})` 提供面在契约无表达——manifest 无 `tools` 槽、
> `provides` 三槽不含 tools；复算确认见计划 §23.2 与清单 :452-454）已裁＝**不修码、挂账归本项
> （随契约 v1.2 收口批一并裁）**：补声明＝契约扩槽（provides 第四槽／registers.tools）＝契约
> 语义变更，归 v1.2 统一裁。呈裁闭合，W2 侧无遗留动作项。

#### C-2 追加（2026-09-29 · EXE-BOOT-016 v1.2 批前半收官 · 纯追加，不回改上面任何一行）

**前置清单四条的现状态（照本节原文顺序逐条对表）**：

| 前置 | 原文要求（摘要） | 现状态 | 依据 |
|---|---|---|---|
| ① | doctor 撤必填集＋连带处理"键集校验静默空转" | **已闭**（doctor 仓 `ce31f83` 落码；空转由 parity B5/D16 钉成可见断言） | §8.3 修法逐字执行；本文 A#55 |
| ② | `docs/migration.md` 前置 2 与面板纪律的冲突点升级用户裁决 | **未闭，题面已备好**（子案一＝改读来源、不改这张表存在／子案二＝解除面板纪律；建议子案一） | 计划 §40.4 末条 |
| ③ | 三项核验要求全套沿用（方法自证无盲区／新 error 走隔离通道／历史记录保留） | **未启用**（本批未新增任何 error 判据 ⇒ 随"收紧本体"一并执行；本批只落撤销与对账面） | 计划 §40.4 |
| ④ | `KNOWN_LEGACY_FIELDS` 全清单守卫先行，收紧动作不得在无此守卫时进行 | **已闭**（toolkit `0569473`：deepEqual 八名／逐名 info／第 9 名必 error／影响面实测复用） | 本文 A#55 |

**收紧本体（`KNOWN_LEGACY_FIELDS` 由 info 转 error ＋ 版本 1.1.0→1.2.0）本批未落，三条实测原因**：
① 7 份内置清单顶层 legacy 实得**六名**，转 error 即 7/7 全违例、真实仓 `0/0/0` 与 parity A 段同时破
（该枚举个数已由前置④ 的新格钉成断言，不是推演）；② 变异 M-b 实测连带翻红既有 D-13① 钉 ⇒ 收紧触碰的是
承诺面而非测试面；③ **两条 legacy 面无契约替代表达**——入口解析正典位仍是 `requirements.exports` 的 `.` 项
（`registry/src/loader.ts` 头注与入口顺序表），`inject` 仍走 `requirements.registers.inject`／模块导出
（`provides` 只有三槽）⇒ 要迁清单必须先给这两面加契约表达，而加表达＝契约语义变更，与 F-87 同族，执行侧不自裁。
三条路（甲＝先加表达后收紧／乙＝收紧限定于已有替代的名字／丙＝v1.2 只算"撤必填集＋对账网扩面"、收紧连同
扩槽转 v1.3）与 migration.md 前置 2 的两个子案全文见计划 §40.4，**建议＝丙＋子案一**。

**考古两题的结论行（上面"F-87 挂账入账注"与 `docs/contract.md` §7 D-13 行均不回改，此为追加）**：
- **F-87＝查实为"有真用"**：`tools.register` 的调用点在插件 apply 路径上（非死码）、注册体形状与宿主侧
  `@deepseek-ai/dsh-tools` 的 `register(definition)` 硬要求逐条对得上（宿主对 `output` 的 `schema`/`render`
  齐备性当场 throw），且仓内已有注册面钉 `web-search-local` 的 engines 钉（原测试文件，随出包退役）。**边界两条**：宿主运行时的
  模型可见装配面本会话未证；本仓 node_modules 的类型面**没有** `tools` 服务（0 命中），该面只存在于宿主 bundle
  （仓外）。⇒ 题二"随实"的方向是**扩槽如实表达**，但扩槽与入口/inject 两面同属契约语义变更，须同批裁，本批不动码。
- **D-13②＝在案前提被实测推翻，已按令停报**（本条经**笔 6** 在位改对：初稿把"跨树版本对齐"写成未证，
  实测后撤回；成因记计划 §40.6 第 7 条）：宿主事件面其实**已正典化且机器可读**，且**两棵树都测得**——
  本仓 devDep 副本 **9 个 `interface Events` 声明文件／33 个事件名**，运行宿主全局包树
  （`@deepseek-ai/dsh` 0.1.5-rc.1 依赖树）**38 个声明文件／94 个事件名**；本仓 11 条 `registers.events` 声明
  **在两棵树下均逐条命中（11/11、0 miss）**，七个共有包跨树版本逐一对齐（cordis `4.0.2`；
  dsh-agent／dsh-session／dsh-llm／dsh-settings／dsh-commands `0.1.5-rc.2`）
  ⇒ 原记"须经宿主事件面正典化"这一门槛形态**不成立**，深度校验的技术路径已然打通。
  真门槛只剩两条**工程决定**（都要裁，执行侧不自裁）：① **读取面归属**——门禁/校验能否依赖仓外
  `AppData/Roaming/npm/...` 那棵树（本仓历史上只引仓内逐字副本，recon §3 记过"工作区外读取会被拦"的教训，
  本次是显式只读取证才走通）；② **覆盖面与漂移判据**——"哪些包、哪个版本、是否含 `declare module` 扩面"
  算权威宿主面须新立判据（＝发明判据），且宿主一升级该面即变（38 文件/94 名是 2026-09-29 的读数）。
  取证工装＝`var/scratch/exe-boot-016-20260929/probe-host-event-face.mjs`（只读、可复放；第二参数指树根），
  两档转储＝同目录 `probe-host-event-face-baseline.txt` 与 `probe-host-event-face-HOSTTREE.txt`。
  ⇒ 本批零深度校验代码，D-13② 维持"挂账"，但挂的账目内容自此换为上述两条。

**门禁第 4 步的身份自此变宽**（README"CLI↔契约对账"那句仍成立，只补覆盖面）：同一步现同时钉
根必填撤销后的在场/缺席分权＋provides 接缝＋**重叠面逐规则 18 格**＋**根字段键集 5 格**，格数 **21→46**；
步数仍 **6**（默认链仍 5）。

#### C-2 追加二（2026-09-30 · EXE-BOOT-017 v1.2 收官批 · 纯追加，不回改上面任何一行）

**终批四裁落账（用户 2026-09-29"按建议"，随 EXE-BOOT-017 启动包下发；账面正典＝计划 §41.1）**：

- **A＝丙**：本项的"收紧本体（info→error＋版本 1.1.0→1.2.0）"连同 entry/inject/tools 扩槽正式排 **v1.3**
  （挂账清单正本＝本文 C-3）；v1.2 档定位为"撤必填集＋对账网扩面"并收官。丙案代价照单入账：本项账跨两个
  版本、`docs/migration.md` §4"三条全满足才动"的闸继续挂（前置 2 已按 B 改述，其余两条原文不动）。
- **B＝子案一**：上表前置② 就此**闭账**（该行"未闭，题面已备好"照录不改，以本追加二为准）——
  `docs/migration.md` §4 前置 2 已按子案一在位改述（`toolkit@915e8c8`："改读来源（provides 优先、
  缺席回落 legacy）、表继续存在"；与 W9/F-62 已落行为同源，零新行为、零面板纪律解除）。
- **F-87＝扩槽方向采认、落 v1.3**：§40.3／《C-2 追加》"有真用"实据认账；扩槽属契约语义变更，与
  entry/inject 两面同批裁；两条边界（宿主运行时装配未证／本仓类型面无 `tools` 服务）随挂账清单随行（C-3）。
  上面"F-87 挂账入账注"所记"随契约 v1.2 收口批一并裁"的裁点实际落在本批终批、实施落 v1.3。
- **D-13②＝维持现状收口**：前提翻正认账（宿主事件面已正典化且机器可读、11 条声明两棵树 11/11 命中零 miss、
  七个共有包跨树版本逐一对齐）；剩下的两条工程决定门槛挂升级路（C-3 第二节），本批零深度校验代码。

四前置现状态自此为：**① 已闭、② 已闭（子案一）、③ 随收紧本体转 v1.3、④ 已闭**；本项（C-2）状态＝
**v1.2 档闭、v1.3 档挂**。

### C-3 · v1.3 挂账清单与升级路（2026-09-30 · EXE-BOOT-017 落档 · 纯追加）

**来历**：终批 A＝丙（v1.2 定位为"撤必填集＋对账网扩面"档并收官）＋F-87 扩槽方向采认，两案共同指向
"契约语义变更同批裁"的 v1.3。本节把散在计划 §40.4／§40.3、本文《C-2 追加》与历批复盘申报里的挂账集中
列名，正本自此是本节。**开工仍须协调侧开工令与用户逐项裁决，本清单不构成开工授权。**

**一、契约语义面（同批裁，建议一并落）**：

1. **收紧本体**：`KNOWN_LEGACY_FIELDS` info→error＋契约版本常量与提示串 1.1.0→1.2.0。四前置现状态见
   《C-2 追加二》；前置③三项核验要求届时全套执行（本文 C-2 原文）。实测影响面与甲/乙/丙三路全文＝计划 §40.4。
2. **entry/inject/tools 三面扩槽**：给入口声明与 inject 声明以契约替代表达（现正典位仍是
   `requirements.exports` 的 `.` 项与 `requirements.registers.inject`／模块导出，`provides` 只有三槽）；
   **F-87 tools 槽随同批**（扩槽方向已采认）。F-87 两条边界随行：宿主运行时是否真把该 tool 装配进模型
   可见面**未证**；本仓 node_modules 类型面**没有** `tools` 服务（该面只在宿主 bundle、仓外）。
3. **7 份内置清单字段迁移**：扩槽落地后迁纯契约形态（迁移期容忍清零的最后一跳）；须带 legacy 字段引用
   审计，方法自证无盲区（本文 C-2 前置③① 口径）。
4. **装载面真机复验窗**：扩槽触碰装载与入口面 ⇒ 需真机窗，排窗归协调侧（016 批 §八.5 前瞻需求的兑现处）。

**二、D-13② 新门槛两问（维持现状收口后剩下的真门槛）**：① **读取面归属**——仓外宿主全局包树
（`AppData/Roaming/npm/...`）能否充当校验/门禁的读取面（历史教训在案：`docs/contract-v1.1-recon.md` §3
"工作区外读取会被拦"，016 批是显式只读取证才走通）；② **覆盖面与漂移判据**——"哪些包、哪个版本、
是否含 `declare module` 扩面"算权威宿主面须新立判据，且宿主一升级该面即变（38 文件/94 名只是
2026-09-29 的读数）。

**三、升级路候选（历批留名累积，逐条带出处；是否开工届时裁）**：

- 沙箱根无前缀计数判红（014 批 §八-3 留名；判红须先新立沙箱前缀口径，现只计数不判红）；
- 导航性现状陈述的机器判据（015 批 §六-4 与计划 §39.7 留名：守卫判"引用可定位"、判不出"陈述未过期"）；
- **对账网"单侧过严不在射程"盲区类**（016 批 §五.3 与计划 §40.3 追认列表留名：重叠面按"两侧都有规则"
  取样，单侧新增的过度严格不在网的天然射程）；
- 编号空间"新号须在册"机器判据（015 批 §六-6 留名：冻结通道目前只在文字里立了规矩、没有钉子）；
- 《D-7 追加》节末"重开条件"（契约正式定义入口声明字段时须一并裁 `.` 的语义）——随上面第 2 项天然触发；
- 本文 B-1/B-2 的触发条件到达即重开（既裁维持现状，不在 v1.3 清单内、仅留名互见）。

---

### 用户审定记录（2026-09-22 · C-1 条文 ★1–★20 · 用户批复"全部按建议"）

**流程事实（照录，防后来人以为条文是工程侧自己定的）**：执行侧先从四份正本 + 三方矩阵提炼出
89 条可验证承诺（`docs/contract-v1.1-recon.md` §5-§6 与其后两份逐行矩阵），其中状态可疑/互相矛盾的
★1–★20 由协调侧分组呈用户——**9 条整组过 + 11 条逐条拍板**，批复为"全部按建议"。
用户在代码实施前增设了"说明书审定"关卡（功能目标经其亲自过目后代码才动），并据此**暂停过批 0-6 全部
代码与文档变更**；本笔（定稿笔）是暂停期解除文档冻结后的**唯一一次纯文档落档**，代码冻结维持。

**处置分三类**：

| 类别 | 条目 | 定稿结论 |
|---|---|---|
| **只改说明书**（12 条） | ★1 ★4 ★5 ★7 ★8 ★9 ★14 ★15 ★18 ★20（+ ★11 ★17 的"文档如实"半边） | 条文按实况改写：`requires.services` 不桥接 `inject` 且当前被误当提供面；缺席类严重级按两套 doctor 拆开各归各（**独立 CLI=info 纪律、进程内=必需项缺席产 error 阻断**）；`curl` 示例改 `127.0.0.1`；入口解析层级统一为**四级**；顶层 `exports` 在 doctor 侧判 error 加限定；`$from` 的"套件根必用/子插件禁用"两条硬规则；"内置插件 5 个"四口径分列；120s→180s/60s 分档 + `degraded` 只属一条路由；legacy 下限补 scoped 例外；§7 错误码补全 7 类 |
| **改代码**（6 条） | ★2 ★3 ★10 ★13 ★16 ★19 | 分别落 **批 3**（`healthCheck`/`panels` 绑进装载链）、**批 4**（configSchema 两处都在 ⇒ **模块导出赢**，文档保留承诺句、另立 D-12 记"当前实现相反"）、**批 6**（不回退红线扩至 package.json 声明）、**批 7**（面板守卫判据与扫描面扩面）、**批 5**（校验降级不再以 `ok:true` 谎称通过）、**批 8**（`install/confirm` 补逐字确认）。真机标注：批 4（宿主通道口径合流）、批 6（改装载行为）、批 8（用户操作面） |
| **评估后再定**（2 条） | ★11 面板状态实时化、★17 array-of-object 表单 | 文档半边已随定稿笔落地（"运行中"的语义边界、表单实际支持范围已如实写入 `add-sub-plugin.md`）；工作量与风险结论见 `docs/contract-v1.1-recon.md` §10.1；**进 v1.1 还是后置由协调侧定**（两条都不是任何批次的前置） |

**单项落地口径**：★6 `events` 槽位保留（草案 `provides` 无此槽 ⇒ 已作为待裁两项随 B 方案改名一起上报，
判定依据入矩阵 §5 P0 之外、recon §8.4）；★12 按题 2 既裁"契约管解析行为、doctor 管必填性"落地
（`contract.md` §4 与 §7 D-7、`migration.md` §6 末段已按此改写）。

**两笔裁决作废反转（正式入档）**：
① **P0-1 相关**——协调侧曾裁"缺席类降级为 warn/info"，git 考古证明该句纪律属于**独立 CLI 仓级审计**、
被 `8407e55` 抄进 `add-sub-plugin.md` 时换了主语（真源头是 `docs/p0-recon.md`（第 55 行，当时））⇒ **撤销降级**，
定稿 = 进程内规则**维持产 error**、只把两句拆开；
② **localhost 相关**——曾裁"补 `isLoopbackAddress` 支持 localhost + 3 例"，考古证明
`2b05777`（09-17）起从未支持过、`test/`＋`scripts/` 全文无 `localhost` ⇒ **撤销补实现**，
定稿 = 文档示例改 `127.0.0.1` 并写明取值域。

**教训条（用户令随定稿笔记入）**：**原因先于修法**。两笔裁决的作废都不是因为方案不好，而是因为
"落差定性"决定修法——同一条文，判成"实现回归"就该回滚代码、判成"写时即错/张冠李戴"就只能改文档。
本轮四条 P0 全部落在"从未一致"（无一项类型 2）⇒ **不存在回滚即恢复的路径**，只能逐条二选一，
这正是"说明书须由用户逐条定稿"这一关卡的价值。可复用的操作口径：定性靠 `git log -S` 定位条文写入笔 +
`git show <sha>:<文件>` 复写时点上下文（**含"行号当时对不对"这种必须回看当时文件才能判的问题**），
再与实现定型笔对时间序 ⇒ 三步齐了才允许提修法。

**教训条二（2026-09-22 批 2 验收令立，裁定方：协调侧）**：**变异自检的读数必须在"重建受影响子包的 dist"之后取**。
批 2 的变异 B（把 `requires.services` 借用塞回 `doctor/src/doctor.ts`）首跑报"批 2-③ 双在场优先级"也翻红，
而该用例与变异面无关——实因当时只跑了 `build:doctor`，`registry/dist` 仍是上一发变异 A 的产物 ⇒ **归因错**。
重建后复测才是终态读数：A（摘 provides 优先读）打 ①③、B（塞回借用）打 ①②，②③各自只被自己那一发打，命题分离干净。
配套口径（与 PLUG-001"变异后重建 `registry/dist`"同源）：跨子包的变异与还原，改完 TS 源**必须先重建该子包再测**；
门禁第 1 步 `npm test` 自带 build×3 所以不受影响，**手动单跑 `npm run test:<x>` 时才要自己重建**——
红项归因错比红项本身更贵（会把人引去改一处本来正确的代码）。

**暂停期内保留依据（补条二第 1 项裁定）**：`debt.md` B-1 的基数更正（10/6→15/5 + 成因）与
C-1 现状注记里的行号/计数修订，属**事实修正、非行为变更**，故在冻结期内**保留不回退**；定稿笔
（本节）即为该裁定的正式补注。

### 环境注记（跑门禁前先读这一格）

**Node 24 / Windows 的 libuv 断言**：测试里开真 `http server` + `fetch` 的用例，在**全量** `node --test` 批次中会命中
`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c:94`，症状是**整个文件判失败而子用例全绿**；
单文件跑 exit=0、两文件并跑正常、全量批跑必崩，与被测产品无关（`server.closeAllConnections()`、`abort()`、消费完 body 都救不了，逐个试过）。
**门禁遇到这种"文件级红、子用例全绿"时先按环境问题分流**：单独跑那个文件复现，能复现即为环境性失败；不得靠放宽断言或删用例了事。
要断言 HTTP 面行为时的正解：**直接驱动 route handler + 受控 response 桩**（还能精确数 `end()` 次数与进程活动句柄，比读 socket 更强）
——已在 `test/panel-sse-dispose.test.mjs`（同一结论的仓内落盘处）与 `test/registry-last-error.test.mjs` 第 5 例采用。

另两条同源坑（写测试时都踩到过）：① 夹具模块是**进程内单例**，跨用例累加的 counter 必须在每条用例开头归零；
② 测试自己 `Promise.race` 起的定时器必须 `clearTimeout`，否则会污染句柄基线断言。
③（Pack F2 新增）夹具名要唯一：`node --test` 并发跑多个文件时，跨文件共享的磁盘开关会让"偶发红"看起来像产品 bug。
④（EXE-BOOT-017 续用批新增 · flake 两振立案）**真实装载用例的测试本地装载预算是偶发红源**：
`install-confirm-gate.test.mjs` 自设的 `loadTimeoutMs: 250`（生产缺省 30_000）在"新构 dist 落盘（AV 扫描峰）
＋node --test 满载启动风暴"组合下被真实装载偶发击穿——registry 超时路径 `fiber-load-timeout`→retryLimit 3 次
重试→`quarantined`，闸③ 的 active 断言翻红即整文件红（签名＝满载首跑单文件红、独立 nt 同树绿）。
**两振在档**：010 批首振（`var/scratch/exe-boot-010-20260927/msg-readme-final.txt`，467 格 466 绿）＋
017 续用批二振（`var/scratch/exe-boot-017-20260930/ci-baseline.log`，485 格 484 绿，三档实档留档）。
**实测**：空闲 10 轮 p99=35ms；npm test 并发 30 轮 10-26ms；32 进程并发冷 import 风暴 max=130ms
（对 250ms 余量仅 1.9×）；修复前当日 npm test 步连绿 10 次（含整链全绿 2 次）二振未复现（自然频率 ~1/10）。**修法＝安全裕度路**（`1f04390`：
250→3000，12× idle p99、仍为生产缺省 1/10；五格断言与真装载覆盖零改动——预热/确定性两路会改变被测
对象本身，更接近为绿弱化覆盖，不取）。**同族暴露如实记档**：`panel-v2.test.mjs`／`panel-unified.test.mjs`／
`registry.test.mjs` 亦用 250ms 旋钮，未振不扩面（续用令射程＝install-confirm-gate），三振再评估。
探针工装 `probe-flake-017.mjs` 在案可复跑（计划 §42.1）。

---

## D. 待办（零散改进，不阻塞关闭）

| # | 待办 | 裁定方 / 备注 |
|---|---|---|
| D-1 | **审计历史浏览 UI**：面板内查看 `audit.jsonl`（需新增只读路由 + 列表渲染）。数据已落盘、路径经 `/v2/snapshot.auditFile` 可查 | 用户 2026-09-20 裁定：不做，记待办 |
| D-2 | **`scripts/p23-shadow-scan.mjs` 覆写历史证据文件**：每次运行都会改写 `panel/docs/evidence/P23-SHADOW-SCAN.txt` 的生成时刻与 `~/.dsh/settings.yaml` 指纹（P2.3 的 09-18 快照本轮被覆写后已 `git checkout` 还原）。建议改为写带时间戳的新文件，遵守证据目录"只增不改"硬约定 | 工程侧发现并记录；用户裁定记待办不阻塞。**同族第二处（2026-09-21 Pack I 查实）**：`scripts/terminal-acceptance-report.mjs` 重跑会把新报告写回已入库、已登记 sha 的 `panel/docs/evidence/TERMINAL-ACCEPTANCE-ROUND10.txt`（摘闸实证会产出 10862 B 的今日版本，时刻与 `cordis.patch.yml` 指纹全变）——该脚本已整体冻结并加 `process.exit(2)` 硬闸，不再依赖人自觉；本条 (D-2) 对 p23-shadow-scan 的原始诉求**仍未修**，照旧挂着 |
| D-3 | **`scripts/regression-all.mjs` 清单补漏**：不含 `p23-verify` 与 `p23-shadow-scan`（本轮改面板文案时 p23 的源码断言就静默漏过一次，靠人工补跑发现）。`ci-local.mjs --with-scan` 已临时覆盖 p23-verify；建议把两项并入 `regression-all` 本体 | 同上 |
| D-4 | **冒烟最后一项待用户人工补验**：宿主会话内一次**真实联网搜索**（验证 web-search-local 在真实 agent 调用链里工作）。本侧已验：宿主重启后 mounted 状态、真实公网探针 `runSearch()` 12 源/1.2s、`fetchUrl()` 200/45795B；未验的那一口需要用户会话凭据（宿主 `/api/web/search` 未认证返回 401，本侧不取用） | 用户侧动作；如实登记于 CHANGELOG P8 终版条目。**2026-09-21 Pack G 再尝试仍未关闭**：宿主 `/api/web/{search,providers}` 从 127.0.0.1 直连一律 401（面板的 loopback 放行分支不适用）；本机浏览器打开 `127.0.0.1:3080` 得 `dsh web authentication required`（且重启后访问 URL/token 已轮换）。本轮未取用、也未尝试获取用户凭据（红线）。 其余八项已在真宿主取证，见 `panel/docs/evidence/G-REAL-HOST-SMOKE.md` §三。**2026-09-21 13:48 补验通过并关闭**：用户在宿主会话内亲自完成真实联网搜索，取数得 **7 次 `web_search` 调用、7 次 `isError=false`、合计 47 条来源链接**（单条 3.4–10.5s），归因到 web-search-local 有三重证据（search-router 路由判 local、`web-search-local` （已随 S1 剔除批出包） 原 index.js（第 1280-1291 行，当时） 的输出指纹在会话正本命中 5 次、G1③ 已证 5/5 mounted）。证据正本 `panel/docs/evidence/D4-WEB-SEARCH-HOST-EVIDENCE.md`（含逐条数据表、口径澄清、以及取证脚本自身两个缺陷的如实记录：只按 `tool/call` 取名会漏 `run_code` 内经 `tool/ptc-dispatch` 派发的调用；zstd 会话正本须逐帧解压）；G 侧以文末《补验注记 · 第⑨项》收口（只增不改）⇒ **G1 九项全部闭环** |
| D-5 | **R13 长期盯防**：装入判定依赖 cordis 4.0.2 的 fiber 内部行为（`FIBER_ACTIVE=2/FAILED=3/DISPOSED=4` 等）。**任何 cordis 升级必须重跑 S1/S4 场景**；依赖已写入 `registry/src/registry.ts` 头注与 `docs/contract.md` §7 D-5 | 工程侧长期纪律。**2026-09-21 复核：R13 本体维持已裁决不动，但当时新登记的三条衍生风险已全部收敛**——① 编号无显式守卫 → A3 数值对账用例；② 轮询漏 UNLOADING → A2 补分支并区分错误码；③ peer 范围过宽放行未校准版本 → E2 收到 `^4.0.2` 并加范围守卫。**仍按 D-5 纪律执行**（守卫只保证漂移会红，不代替人跑 S1/S4） |
| D-6 | **`hasService` 直读代理有原型链误判**：`registry/src/host.ts` 的 `hasService` 读 `ctx[name]`，而 cordis 代理的 get 陷阱先走 `Reflect.has(target, prop)`（沿原型链）——实测 `hasService('toString'/'constructor'/'valueOf'/'hasOwnProperty'/'__proto__')` 全为 **true**。影响面：`precheck.ts` 的 `service-missing` 阻断与 doctor `requires/services` 规则会把这类名字误判为"服务在场"，从而放过一个真缺依赖的插件。改 `ctx.get(name, false)` 可闭合（只查 isolate/store，不碰原型链），但属行为变更 | 2026-09-21 复核发现。**按当轮 A4 指令"发现真实边界风险即停下待裁"，未动实现**，**已关闭（2026-09-21 Pack F1，提交 `b399623`）**：用户裁定改用 `ctx.get(name, false)`，详见 A #17。 |
| D-7 | **`exports` 字段位置三方冲突（内置插件目录路径装载）**：`loader.ts` 只读**顶层** `manifest['exports']`，但 5 个内置插件的 `dsh.plugin.json` 全把它写在 `requirements.exports` 下。四个因为有 `index.js` 兜底所以"看着正常"，`lib/agent-memory` 没有 index.js ⇒ **按目录路径装不进来**（`entry-not-found`），只能装 `lib/agent-memory/plugin.js`。指定修法"提到顶层"与两处既定事实硬冲突：(a) doctor 独立仓 `MANIFEST_TOP_KEYS` 不含 `exports`，一提就产 error ⇒ **打破 0/0/0 红线**，必须改 doctor 仓；(b) 本仓契约把顶层 `exports` 归为 `KNOWN_LEGACY_FIELDS`，而 C-1 第 3 项计划把这些**收紧为 error**，提到顶层是逆着已裁决方向走。第三个选项"loader 双读"被本轮指令明令禁止 | 2026-09-21 复核发现，**Pack B1 因此停手未做**。备选：① 改 doctor 白名单 + 提顶层（两仓同批，且要与 C-1 第 3 项对齐口径）；② 给 `lib/agent-memory` 补 `index.js` 作插件入口；③ 契约 v1.1 里正式定义入口声明字段并一次迁清。裁定方：待用户。**已关闭（2026-09-21 Pack F2，提交 `23de06a`）**：裁定走第 1 案（`requirements.exports` 为正典、三级解析已实现、内置 manifest 一字未改）；完整裁定链、三处交叉验证证据、agent-memory 互斥点与 A/B 判定见本节末《**D-7 追加**》。 |
| D-8 | **装入成功后 `lastError` 不清**：`loadEntry` 只在失败路径写 `entry.lastError`，重试转 ACTIVE 后不回空 ⇒ 面板卡片会同时显示"运行中"和一条历史错误（E1 实测：`status=active` 且 `lastError.code=fiber-load-timeout` 并存）。语义上"最近一次错误"可以辩护为有意保留，但对使用者是误导 | 2026-09-21 复核发现，未修（不在本轮授权清单内）。**已关闭（2026-09-21 Pack F3，提交 `57ebc24`）**：用户裁定"转 ACTIVE 即清空"，未新增 `lastRecoveredError` 字段（历史归审计 JSONL），详见 A #18。 |
| D-9 | **`retryAttempts` 在装入成功后不清零**：`loadEntry` 成功路径不重置计数（只有 `unloadEntry`、`setEnabled(true)`、`reload` 显式清零）⇒ 前一段重试留下的计数会结转进下一段故障，隔离提示里"连续失败 N 次达到上限"这句话在这种情况下不准（真实故障数比报出的少），且更早进 quarantined。默认 `retryLimit: 3` 下最坏情形是第 2 次真实故障就被隔离。Pack F3 施工期发现，**未顺手改**（不在授权清单内，且改法涉及"成功是否等于计数归零"的口径） | 工程侧发现并记录。裁定方：待用户 **已关闭（2026-09-21 Pack H4，提交 `8914d9b`）**：`setStatus` 转 ACTIVE 即 `retryAttempts = 0`（与 D-8 同走状态源）+ 诊断面 `retryAttemptsOf(id)`，用例 `test/registry-retry-count.test.mjs`。**如实收窄**：现存的每段入口路径（`setEnabled(true)` / `reload` / active 态 `setConfig`）本来都会先经 `unloadEntry` 清零，所以原文担心的"第 2 次真故障就被隔离"在现实现里到不了；本笔的收益是计数只有"当段"一个含义（诊断与隔离文案口径正确），不夸大它挡掉的事故。 |
| D-10 | **测试夹具 `marker.flag` 是跨文件共享开关**：`node --test` 的测试文件之间并发跑，`registry.test.mjs` 与 `panel-v2.test.mjs` 都翻 `test/fixtures/registry/contract-plugin/marker.flag` 这一个磁盘文件 ⇒ 任何新用例复用该夹具做"先失败后成功"都会偶发翻红（Pack F3 实测特征：单跑 6/6 绿、全量批跑红一条）。本轮只给 F3 建了私有夹具 `last-error-plugin/`，**没有**动既有两处共享用法。建议：夹具改成"每个用例自带 marker 路径"，或把需要翻开关的文件标为串行 | 工程侧发现并记录；不阻塞关闭 **已关闭（2026-09-21 Pack H4，提交 `8914d9b`）**：`contract-plugin` 的 marker 改为**调用时解析 + `process.env.FIXTURE_MARKER` 覆盖**，五个使用方（registry / panel-v2 / panel-unified / audit-sink / p7-embed）各持 pid 专属路径、退出即清。验证方式：把仓内那枚 gitignore 的运行产物从原位挪走后全量 `npm test` 293/293 绿 ⇒ 既不再互抢，也顺手消掉"干净克隆重即失红"的暗雷。D-9 的新夹具直接不落盘。 |
| D-11 | **`toolkitRoot` 缺省按宿主进程 cwd 推导 ⇒ 状态与审计落点会随启动方式漂移**：`panel/manager/registry-host.mjs`（第 24 行，当时） 的 `resolve(process.cwd(), "..")` 使 `statePath`/`auditFile` 指到 `<cwd 的上一层>/.registry`。Pack G 实测：同一次冒烟里落点在 `C:\Windows\.registry` 与 `D:\dsh-plugins\.registry` 之间跳过两次（差异只来自拉起 dsh web 时的工作目录）。审计"事后可查"的前提是落点稳定；本轮已把 D 盘那份副作用清除，并把宿主拉回原形态。建议：statePath 锚定到 toolkit 自身安装根（或强制显式配置），别让产品行为依赖启动器 cwd | 工程侧发现并记录。裁定方：待用户。**2026-09-21 交叉验证轮并账**：外部审计报告的 P1 即此条病根，两处推导已逐字定位、两个漂移点按公式复原吻合，并核出**两种更硬的失效模式**（落点建不出来时面板 fail-hard 装不上；写得出现目录但写不进文件时状态静默丢失）——见本节末《D-11 追加》。修复等 Pack H 点名，本轮代码零改动 **已关闭（2026-09-21 Pack H1，提交 `b59f730`）**：推导收敛到 `panel/manager/toolkit-root.mjs`（显式 config > 模块位置，禁读 cwd），面板把已 resolve 的值传下去；两种失效模式全部可见化（sink 不再裸抛、`stateSaveStatus` + `audit:state-save-failed` + `snapshot.durability` + 卡片"未落盘"），按裁定只做最小可见化、未引入重试。落点固定与 H5 真机复验待用户批 **→ 已复验（2026-09-21 H5，A#24 / 证据 `H-REAL-HOST-REVERIFY.md` §四）**：宿主 `process.cwd()` 实测 `C:\Windows\system32`（旧公式命中场景）下两面落点仍锚 `D:\dsh-plugins\dsh-toolkit\.registry`，7 处漂移点/公式变体/对照位零新文件，`durability` 与 `audit.jsonl` 流水实际可查。 |
| D-12 | **B2"保守近似"的前提已经变了**：`registry/src/loader.ts` 的 `mergeNamespaceStatics` 头注写着"宿主装载器 `@deepseek-ai/cordis-plugin-loader` 在本仓未安装，无法逐条对照其解包规则"。Pack G 现场核实：**宿主装了它**（`…/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis-plugin-loader@1.0.3`）。⇒ 下一轮可读该源码把 B2 从"近似"收紧为"对齐宿主"，并决定是否需要把它的解包规则钉成用例 | 工程侧发现并记录。裁定方：待用户。**已兑现（2026-09-21 交叉验证轮）**：完整解包链已逐字对照、7 个入口双通道实测完毕，结论与修法选项见本节末《D-12 追加》。**代码一字未动，修复等 Pack H 点名** **已关闭（2026-09-21 Pack H3，提交 `e80caea`）**：用户裁选项 3+2 —— 三个入口自带元数据（根治）+ `test/dual-channel-parity.test.mjs` 逐入口对账两通道的 `name/inject/Config`（防回归，真 loader 在场时反向复核副本、缺席即 skip）。B2 保留兜第三方形态，头注按实测改写并记录其就地改写插件对象的副作用。差异表全文留在本节末《D-12 追加》。 |
| D-13 | **沙箱侧配置快照整份滞后，禁止当恢复基线用**（外部审计报告 P2 并账）：`D:\dsh-test-sandbox\after-switch.yml`（2026-09-14 13:13 `dsh --profile web --dump-config` 产物，**不是本仓任何脚本/测试的输出**，仓内对 `after-switch` 零引用）里 `@local/dsh-toolkit/web-search-local` 行的 engines 写作 `sougou`。核实结果与报告不同：这份快照**忠实记录了当时的真状态**，拼写错误在 09-16 已由本仓自己改对（提交 `37819e9 fix(P2-2): correct Sogou engine key sougou -> sogou`，现行真源 `cordis.patch.yml`（第 61 行，当时） = `sogou`）。真正的问题不是拼写而是**整份早于面板**：该段止于 `agent-memory-runtime`，**没有 `toolkit-manager` 行**，也早于 Pack A–G 全部改动 ⇒ 当"恢复基线"会退回 7 天前的插行集。同一旧状态另有两份副本：`archive/pluggable-audit/toolkit-copy/cordis.patch.yml`、`_trash_candidates/duplicates/accept-after-restart.yml`（与根文件 MD5 相同 `e5e3d2ab…`）。锚定它的 `docs/reviews/dsh-toolkit-切换窗口-待审核.md:117` 本身就是重生成指令（再 dump 一次即覆盖为现值） | 外部审计报告发现、本仓核实。沙箱非 git 仓，**本轮不删不动**（删除权在用户逐轮任务书）。处置建议：三份标"历史取证快照，禁作恢复基线"，或文件头补一行"dump 于 09-14，早于 P2-2 拼写修复与面板挂载" **已关闭（2026-09-21 Pack H4，提交 `8914d9b`，警示文件在沙箱侧）**：立警示 `D:\dsh-test-sandbox\docs\warn-stale-config-snapshots.md`（三份副本逐一列名 + 三条事实 + 该怎么做），README 的 `after-switch.yml` 条目加指针。因沙箱规范禁止根目录散建新文件（`*.md` 归 docs/），警示落 docs/ 而非快照同目录，意图不变。**三份快照本身不删、不改、不重生成**。 |
| D-14 | **停用交叉引用预检的覆盖面只有行 id，且不阻断；卸载不做此类预检**（外部审计报告"依赖可预检"一节并账）：`findCrossReferences(text, {rowId, alsoMatch})` 的 needles = 行 id + `alsoMatch`（`panel/manager/apply-engine.mjs`（第 178-181 行，当时）），HTTP 层确实收 `body.alsoMatch`（`panel/index.js`（第 459 行，当时）），**但面板客户端只发 `{rowId, enabled}`**（`panel/client/index.js`（第 426 行，当时））⇒ UI 路径上 needles 恒等于行 id。最该防的两处引用恰好不是行 id：`cordis.patch.yml`（第 7-8 行，当时） 的 `searchProvider: auto-search` / `fetchProvider: local-fetch` 引的是 **provider id** ⇒ 恒不命中。且 crossRefs 非空**不阻断**（`panel/manager/apply-engine.mjs`（第 238-239 行，当时） 自陈"报告非空不自动阻止"）；卸载路径无交叉引用预检（`uninstall.mjs` 内 `findCrossReferences` 零命中，只有 `presetBridgePrecheck` 的备份存在性 fail-closed）。另注：`doctor-signals.json` 与这份检查**没有数据关系**——signals 的消费者是独立仓 doctor CLI（`doctor仓:src/engine.mjs`（第 1376-1504 行，当时），只产 info/warning，绝不 error），本仓 panel/registry 全量 grep 零命中 | 外部审计报告发现（其表述"停用/卸载时会做交叉引用预检"经核实为夸大）、本仓核实。裁定方：待用户。建议 Pack H：为 web-search-local / search-router 预置 `alsoMatch` = 其 provider id（数据源就是 doctor-signals.json），或由服务端从 signals 派生 needles **已关闭（2026-09-21 Pack H2，提交 `36f1be0`）**：服务端补齐 provider 维度（`plugin-registry.mjs` 的 `providers` 表 + `buildCrossRefs`），并补上文本里根本看不见的**声明式依赖**；卸载四个 plan 构造器同口径报告、弹窗两拍确认。**"只告知不阻断"未放宽**（用例正面证明带警告仍能落盘）。未走 signals 派生那条路：signals 的消费者是独立仓 doctor CLI，面板与它解耦更干净，`doctor-signals.json` 一字未动；漂移由新用例的"表 vs manifest 逐条一致"守卫兜住。 |
| D-15 | **manifest 无 `contract` 字段 + 包名带 npm scope ⇒ registry 通道必拒，报错文案指向错位**：`manifestHasContract` 只认非空字符串 `contract`（`registry/src/loader.ts#manifestHasContract`），缺字段即落 legacy 合成；合成 id 的规则是"含 `/` 直接沿用包名，否则加 `legacy/` 前缀"（`:336-337`），于是包名 `@local/dsh-toolkit` 原样成为 id，被契约的命名空间式小写规则拒绝（`contract/src/validate.ts#ID_RE`，`@` 不合法）⇒ 报 `plugin-shape-invalid: legacy 合成 manifest 校验失败：id 必须是命名空间式小写 id`，而真实缺口是"这份 manifest 没有 contract 字段"。实测现场：本仓 `panel/dsh.plugin.json`（`manifestVersion:1`，**无 contract/id**）经 `resolveLocalSource` 装载即撞这条；宿主 loader 通道对同一目录毫无障碍（它不读 manifest）。⇒ 面板只能经 patch 行装载（与 REQ-8 唯一装配点一致），但任何"无 contract 的 scoped 第三方包目录"经面板装进来都会收到这条误导性文案 | 交叉验证轮实测发现（探针见《D-12 追加》）。裁定方：待用户。建议：legacy 合成对 scoped 包名改产 `legacy/<name>` 或报"缺 contract 字段"，二选一都是一行改动 **已关闭（2026-09-21 Pack H3，提交 `e80caea`）**：维持面板不可经 registry 通道自举（防递归装配，属设计而非缺陷），但文案改为点名真实成因——"缺非空 `contract` 字段" vs "目录本就无 manifest"，并附被拿去当 id 的包名与两条修法；用例在 `test/dual-channel-parity.test.mjs` 末例逐条钉文案。未改 legacy 合成的 id 生成规则（改 id 形态会影响来源记账，收益不抵风险）。 |
| D-16 | **两条装载通道对"配置校验失败"的处理不对称：静态 patch 通道掀整机，registry 动态通道只伤单条目**（H5 真机实测）：宿主 patch 通道里某个插件的 `Config` 校验一失败，`ValidationError` 会经 `cordis-plugin-loader` 的 `Entry._init` 冒到 `dsh-app-boot` 的 `boot()` 顶层并被 rethrow ⇒ **整个宿主进程 exit 1**，面板、其余 4 个内置插件、宿主自带的全部插件一起不可用；而 toolkit 自己的 registry 通道同样撞校验失败时，只把该条目打成 `error`（带 `lastError`、按 `retryLimit` 退避重试、`loadTimeoutMs` 兜超时），其余条目照常运行。**爆炸半径差两个数量级**。 | H5 真机发现（2026-09-21）。**只登记不改**：改不动——顶层 rethrow 是宿主（cordis / dsh-app-boot）行为，红线禁止改宿主。**缓解评估（如实）**：① 唯一可行的侧防是"收紧/启用校验之前，先按宿主的解析方式对真实声明文件跑一次校验"（本轮 A#22 文末的防再犯口径即是此条，本次故障正是漏了它）；② **doctor 安装前预检够不着这一格**——预检覆盖的是经面板安装 API 进来的 source，而本次坏值长在 toolkit 自家 `cordis.patch.yml` 的 patch 行里，宿主启动时直接读，从不经过预检通道；③ 若未来要把校验推广到更多内置入口，应连带考虑"patch 行类型回归闸"（把真实 patch 文件解析后逐条喂 schema 的门禁用例），本轮未建。**裁定方：待用户** **已关闭（2026-09-21 Pack I，A#25）**：兑现"唯一可行侧防"——门禁新增第 5 步 `scripts/patch-config-check.mjs`，按宿主通道语义（真 YAML 标量解析 + `unwrapExports` + `Config['~standard'].validate`）校验 `cordis.patch.yml` 每一行的 config，失败即红且报错点名**文件 + 行号 + 期望类型 + 实际值 + 修法**（正是 H5 评估里 cordis 原文缺的三样）。两条变异自检：还原 `360` 坏值 ⇒ 精确指到 `:61`；解析器自身退化 ⇒ 判"校验器不可信"。**边界如实**：不对称本身（静态通道掀整机 vs 动态通道单条目）仍在，那是宿主（cordis / dsh-app-boot）行为，红线内不改；本步只是**在提交前就拦住**，不让它走到启动。可选加强层（再按 manifest 的 `configSchema` 校验一遍，可覆盖 rate-throttle 等 3 个不带 `Config` 的入口）本轮按任务书口径未做——它明确要求"无 Config 的入口跳过，与 cordis 行为一致"。 |
| D-17 | **恢复工具与三个时点验收脚本仍指已退役基准 `ce0b0b81…`**：`scripts/restore-cordis-baseline.mjs`（`EXPECTED_SHA`/`EXPECTED_SIZE`）与 `scripts/terminal-acceptance-{probe,probe2,report}.mjs` 内嵌 P8 判据基准字面量。核实结果：**恢复工具在本轮配置修复之前就已失效**——它按"当前 HEAD blob + 追加 toolkit-manager 4 行"重建基准，而 HEAD 如今已含那 4 行 ⇒ 重建出 3202 B / sha `3a522a56…` ≠ 期望 3097 B，**fail-closed 直接不写盘**（本轮 dry-run 实测复现，无写盘风险）。三个 `terminal-acceptance-*` 是 P2.2/P8 的**时点取证脚本**，不在 `regression-all` / `ci-local` 清单内，重跑会报 `NO ✗`。 | 工程侧发现并记录（2026-09-21 H5，随 A#24 基线滚存一并核出）。**本轮不动**：它们要证的各是当时的判据，把字面量改成新值等于伪造那些时点的结论；正确处置是重做一份当前时点的恢复工具（若还需要恢复能力）或直接退役。**裁定方：待用户**（重开条件：有人真要再跑基线恢复，或把 P8 时点脚本归档） **已关闭（2026-09-21 Pack I，A#25）**：逐个判处置完毕。`restore-cordis-baseline.mjs` ⇒ **显式退役**（不修）：两条独立理由写进头注——重建公式「HEAD blob + 追加 toolkit-manager 4 行」自 P2.4 把那 4 行提交进 HEAD 起就不自洽（本轮改动前实测复现 3202 B），且"钉死某一枚 sha"已被滚存判据取代，现行恢复动作就是 `git checkout HEAD -- cordis.patch.yml`（`q2-layer-scan` ④ 已在校验"工作区 == HEAD"）；空壳保留而不删，是为了让下一个想恢复 patch 的人当场撞见结论。三个 `terminal-acceptance-*.mjs` ⇒ **历史冻结**（不删）：probe / probe2 只读不写盘，加时点头注 + 运行时横幅（"今天重跑出现 NO ✗ 属预期时点错位"）。**新查实的危害**：`terminal-acceptance-report.mjs` 末尾会把报告写回 `panel/docs/evidence/TERMINAL-ACCEPTANCE-ROUND10.txt`——那是已入库、evidence/README 已登记 sha `49ef62a0…` / 6689 B 的证据正本 ⇒ 仅靠注释拦不住手滑，故加 `process.exit(2)` 硬闸；MUT-C 实证（摘闸 + 输出重定向到仓外）：重跑会产出 10862 B 的今日报告，时刻行、`cordis.patch.yml` 当前 sha、"基准可重建性 ✗" 全变 ⇒ 该覆写是真的。硬闸只拦执行，未改脚本任何取证逻辑与历史结论文本；`evidence/README` 那一行"可重放"的表述已按只增不改的规矩**追加更正**。 |
| D-18 | **`requires.services` → cordis `inject` 的合成桥接**（题 1 推迟项之一）：把 manifest 声明的依赖合成为插件对象的 `inject`，使 cordis 真正设门。三条已实测的既有后果（`test/cordis-inject-lifecycle.test.mjs`（第 52、86、134 行，当时））：① 只写 manifest 的插件依赖缺席也直接 ACTIVE；② 依赖离开后 cordis 已撤 fiber、registry 仍报 `active`（**批 3 的真相收口只修这一格的"报"，不修"设门"**）；③ `install` 全局互斥 ⇒ 装 provider 去解锁正在等的 consumer 走不通，只能等重试退避 | 用户裁定（2026-09-22）：**移出 v1.1、单独立项**，v1.1 走"真相收口 + 补测试钉住"（依据：四份文档**未承诺自动唤醒**，重试退避即正典，出处 `docs/embed-toolkit.md`（第 35 行，当时） + `docs/p0-recon.md`（第 97 行，当时＝REQ-6 行） REQ-6）。**立项时必答：与 cordis 上游 REQ-6 对齐还是自创**——该问题不允许无限期悬置。已知代价三条须连带裁：改变装载时序（原 ACTIVE 者会停 `loading`、超时转 `fiber-load-timeout` 并按 `retryLimit` 计入隔离，A2/FIBER 错误码面全部要重测）；`mergeNamespaceStatics` 是**就地改写**插件对象（`registry/src/loader.ts#mergeNamespaceStatics` 自陈），合成值会串进宿主通道对同一模块实例的读取；对内置插件无效（它们由宿主 patch 通道装载，实测不经 `resolveLocalSource`） **已关闭（2026-09-27 W9 第二段，用户拍板终裁）**：裁**不采用**——技术方向采案一（D-19 原生 `inject:` 键、门控归宿主本体，用户答"按建议"）；本条合成桥接不再立项，防考古漏账记档于此，全账见 A 区 #45 与计划 §29 |
| D-19 | **用宿主原生 `inject:` 声明替代模块自带 `inject`**（题 1 推迟项之二）：`cordis-plugin-loader@1.0.3` 支持在 YAML 行上给 `inject`（`EntryOptions.inject`，经 `Inject.resolve` 合进 fiber，见《D-12 追加》逐字对照），而本仓 `cordis.patch.yml` 的 6 个 insert 行**一条都没用**（全凭模块自带） | 用户裁定（2026-09-22）：同 D-18 移出 v1.1。**这是语义更正解**（门控归宿主、零代码、与 cordis 原生一致），但代价明确：改 `cordis.patch.yml` ⇒ 判据基准**第 3 次滚存**（现值 `e8051fe9…`/3085 B，p24 两处硬闸同步、机制不得放宽）+ `scripts/patch-config-check.mjs` 的解析器与 `iterRows` 要认这个新键（它现在是 fail-closed 的严格子集，未知键会不会抛须先验）+ **必须真机重启复验**（H5 那类"整机起不来"的爆炸半径就在这一行文件上）+ D-16 的不对称仍在 **已采纳（2026-09-27 W9 第二段，用户拍板案一落地）**：三相关行加原生 `inject:`（rate-throttle [llm,tokenMeter]／web-search-local [web]／web-search-router [web]，值取 manifest 动工实况）、判据基准第 3 次滚存 `e8051fe9…`→`a663f61b…`（两硬闸＋p1/p22v 锚行号同步）；步 a 探针运行时实证不抛＋既有行零行为变化；双路语义源码读证＝同名双声明幂等（Inject.resolve Map 去重）；真机复验（用户第 5 次重启）随批末素材包呈协调侧排窗、异常即报即撤。全账见 A 区 #45 与计划 §29；前置成本的 patch-config-check 认新键一项由探针兑现（读证＋运行时双证） |
| D-20 | **文档引用守卫未建**：四份正本与本文大量使用 `文件:行号` 式引用，§用户审定记录的考古证明
  **这些行号在写入当天全部正确**、之后被 `23de06a`（+55 行）与 `b59f730` 等码改推动而漂移
  （6 处失效，已随定稿笔改为按符号名定位）。**当前没有任何机制阻止它再漂一次**——
  原批 0 计划的"核对文档内 `文件:行号`/符号是否存在"的 lint 或用例未落地 |
  工程侧发现并记录（2026-09-22 定稿笔）；裁定方：待协调侧。建议形态：扫 `docs/*.md` 里的
  `path[:#]symbol` 引用，断言目标文件存在且符号（函数/常量名）可 grep 到；行号形态一律判红并要求改符号名 **已关闭（2026-09-29 EXE-BOOT-014 守卫批收官；账见本文件 A#53 与计划 §38；提交链 `dc00a34`→`51ab22a`→`819182e`→`08c2d79`→`fcb5c30`→`7a9ee26`→`fa9fefc`→本笔）**：守卫已建成并进门禁（`toolkit:scripts/doc-ref-guard.mjs`，`--with-scan` 链末步）；存量引用全数清偿——活文档五份 180 条逐条改写（评审单原文与目标行并排核对），存档件 82 条走只增不改的"引用勘误（守卫登记）"追加节（14 份文件、63 个 distinct 形态）。红集归零且 6 步全绿。**边界如实四条**：①中文简称＋裸行号（不含路径）不在 §9.3 定义内、不抓；②md 相对锚与纯节名引用不抓；③沙箱根命中未带前缀者只计数不判红（recon §10.3 只定义 toolkit:/doctor仓: 两前缀，判红即发明判据；现值 160 处已进打印）；④守卫判"可定位"，不判"语义对位"——后者靠评审单逐条人工核对（本批 180 条逐条定文，改写表与 manifest 在 `var/scratch/exe-boot-014-20260929/`）。 |

| D-21 | **批 5-1 遗留的一格未独立钉**：`contract#validateConfigAgainstSchema` 的降级判据 `#isUsableSchema` 由 ③（`{type}` 纯定义构建后不可执行校验）与 ④（`{uid,refs}` 重建后不可执行校验）**共用**，但 `test/config-schema-degradation.test.mjs` 只有 ④ 那一格被夹具钉住（新夹具 `unverified-schema` 走 `{uid,refs}`）。⇒ 若将来有人把 ③ 分支的守卫摘掉，现有用例不会翻红 | 协调侧 C1-006 批复（批 5-1 附注①）令落此行防考古漏账。补法待裁：要造出"③ 构建不抛错但返回不可执行校验的值"需 schemastery 内部行为配合（本笔不编造触发条件），可选路径是（a）注入替身把 `#isUsableSchema` 单独成口再钉，或（b）等 W1（声明面与旋钮）时随那片一起补。**未做不代表已钉**，此行为准 |

---

### D-7 追加 · 裁定链、三处交叉验证与 A/B 判定（2026-09-21，已关闭）

**裁定链（四步，含作废记录，防后来人以为口径一直如此）**

① **原始裁定（上一轮 A4）**："loader 禁双读，只读顶层 `exports`"。 ⇒ 事后判定：这条把事实写反了（见验证第 1 条）。
② **本轮任务书反转**：显式撤销禁双读，裁 `requirements.exports` 为入口声明的**正典位置**，三级解析 = 
正典 → 顶层（legacy 兼容并 warn）→ 目录惯例；并新增红线"正典命中但目标不存在即 entry-not-found，不回退"。
③ **误触裁决作废**：反转执行前用户另有一次"停手，只落文档"的选择系**误触**产生，非本意，已作废。
该裁决仅在未提交文档层执行过（改写 3 份文档 + 一次 `git checkout` 丢弃自己的未提交改动），**零 commit、代码零改动**，改动已丢弃。
留这一行是为了说明为什么中间态文档里会出现"loader 一行未动"的字样。
④ **终态裁定（第 1 案）**：以 manifest 为准，三级解析照裁定实现，5 个内置 manifest 一字不改（情形 B 例外条款未被触发，见下）。

**三处交叉验证（均为只读实读，不是二手推理）**

1. **doctor 独立仓**（`D:/dsh-test-sandbox/projects/doctor/src/engine.mjs`）⇒ **位置口径成立**：`REQUIREMENT_KEYS = [runtime, binaries, packages, registers, exports]`（:47）把 `exports` 定为 `requirements` 的必填键，缺一条即 `schema.required-missing`；非套件根禁 `$from`（:418），套件根只能有 `$from`（:421/:425）；`buildExportTargetIssues`（:548-576）逐条断言`requirements.exports` 的目标文件真实存在，否则 `schema.exports-target-missing`（error）。
   ⇒ 新红线"声明了就必须存在、不回退"与 doctor 同源。⇒ **顶层 `exports` 反而不合法**：`MANIFEST_TOP_KEYS`（:42-46）不含它，写在顶层当场产 `清单根字段非法: exports`——D-7 原文"提到顶层就破 0/0/0"由此转为正向结论：正典在下，不在上。
2. **本仓契约**（`contract/src/types.ts` + `validate.ts`）⇒ **中立不反对，但两边口径分叉**：契约 v1 没有任何入口字段，`requirements` 与顶层 `exports` 同列 `KNOWN_LEGACY_FIELDS`（迁移期 info 容忍）。⇒ 该分叉已补进 C-1 必答设计题第 2 条。
3. **宿主运行时**（`docs/p0-recon.md`（第 44 行，当时） + 本轮 grep 复核 `node_modules/@deepseek-ai/**` 对 `dsh.plugin.json` 零命中）⇒ 宿主运行时 **不读** `dsh.plugin.json`；`requirements.exports` 的消费者是 doctor 与本仓 loader。它因此是"套件自述的导出表"。

**agent-memory 互斥点（裁 A/B 之前必须先判的那一格）**：`requirements.exports["."]` 是不是"装载入口"？本仓自己的数据给了否定答案。

`lib/agent-memory/dsh.plugin.json` 的声明原文：`"exports": { ".": "./lib/index.js", "./plugin": "./plugin.js" }`。
只读探针实测（`D:/dsh-test-sandbox/var/scratch/pack-f-20260921/f2-entry-probe.mjs`，只 import 判形状、不写安装状态）：

| 插件 | `requirements.exports["."]` | 与目录惯例是否一致 | 正典目标的模块形状 |
|---|---|---|---|
| compact-router | `./index.js` | 一致（记案） | `default.apply` |
| rate-throttle | `./index.js` | 一致（记案） | `named.apply` |
| search-router | `./index.js` | 一致（记案） | `default.apply` |
| web-search-local | `./index.js` | 一致（记案） | `default.apply` |
| **agent-memory** | "./lib/index.js"（声明原文） | 目录下**没有** index.js（旧实现因此 entry-not-found） | **NOT-A-PLUGIN**（104 个命名导出：指令台账/进度文件数据库） |

真插件形态在同表 `"./plugin"` → `plugin.js`，宿主 `cordis.patch.yml`（第 74-75 行，当时） 挂的也正是 `@local/dsh-toolkit/agent-memory/plugin`。
⇒ `requirements.exports` 表的是**包的 Node 导出表**（`.`＝包主导出），而 loader 要的是**cordis 插件入口**；两者对 4 个内置插件重合，
对 agent-memory 不重合（它是"数据层与插件层同目录"的历史形态）。

**A/B 判定（终态口径）**：全仓 8 条 `requirements.exports` 声明目标逐条实测**全部存在、0 缺失** ⇒ 不属**情形 B**（同步缺陷：
声明指向不存在的文件，那种情况授权改 manifest）。落**情形 A（语义性）**：manifest 声明按 doctor 语义本就不承诺"目录装载"，

**B1 验收正式改判**为"如实报错"：按目录装 `lib/agent-memory` ⇒ `plugin-shape-invalid`，文案点名同表 `./plugin` → 绝对路径并声明
"装载器不代为挑选"（只复述 manifest，不去 import 猜兄弟模块形状）；这是**终态设计行为不是缺陷**。显式文件路径 `plugin.js` 的装载行为不变。

**落地结果**：三级解析见 A #19 与 `docs/add-sub-plugin.md` §1（单一事实源）；`entrySource`/`entryWarnings` 让来源与告警可观测；
doctor 独立仓零改动；p1-smoke 314/0 一字未动；门禁 `node scripts/ci-local.mjs --with-scan` 4/4。
**重开条件**：契约 v1.1 正式定义入口声明字段时（C-1 必答设计题第 2 条），须一并决定 `.` 的语义是否改为"插件入口"——
若改，agent-memory 的 manifest 才进入情形 B 的修改窗口。裁定方：待用户（v1.1 立项时）。

---

### D-11 追加 · 交叉验证轮：toolkitRoot 分叉的代码级归因（2026-09-21，只报不修）

外部审计报告的第 1 条"新问题"经核实**成立**，且它就是 D-11 的病根。逐字定位（当前 HEAD）：

| 现场 | 位置 | 推导 | 锚定物 |
|---|---|---|---|
| 面板自己的 toolkitRoot | `panel/index.js`（第 54-56 行，当时） + `:249` | `resolve(config.toolkitRoot || resolve(panelRoot(), ".."))`，`panelRoot()` 取 `import.meta.url` 的目录 | **源文件位置**（稳定） |
| registry/doctor/审计的 toolkitRoot | `panel/manager/registry-host.mjs`（第 24 行，当时） | `config.toolkitRoot ? resolve(…) : resolve(process.cwd(), "..")` | **进程 cwd**（随启动方式漂移） |
| 两者为何没接上 | `panel/index.js`（第 281 行，当时） | `createToolkitServices(ctx, config, logger)` —— 传的是**原始 config**，`:249` 已 resolve 的值没有往下传 | ⇒ 同一进程内两个根并存 |

**缺省值在真实部署里就是生效路径**，不是理论边界：本仓 `cordis.patch.yml`（第 80-82 行，当时） 的 `toolkit-manager` 行只有 `id` + `name: 'file:///…/panel/index.js'`，**整行没有任何 config** ⇒ `config.toolkitRoot` 恒缺席 ⇒ `:24` 的 cwd 推导当场生效。后果：面板写 patch / 备份 / custody 落在 `D:\dsh-plugins\dsh-toolkit`（`:256` 的 `backupRoot` 亦用稳定根），而 registry 状态与审计流水落在 `<cwd 上一层>\.registry`——**同一次运行、两个根**。

**两个漂移点按公式复原，全部吻合**：`resolve(cwd,"..")` 在 cwd=`C:\Windows\System32`（提权 shell 的缺省起点）时给出 `C:\Windows` ⇒ `C:\Windows\.registry`；在 cwd=`D:\dsh-plugins\dsh-toolkit`（在仓内拉起宿主）时给出 `D:\dsh-plugins` ⇒ `D:\dsh-plugins\.registry`。与 Pack G 记录的两个观测点逐一对上（`panel/docs/evidence/G-REAL-HOST-SMOKE.md`（第 226-231 行，当时））。今天现场：`C:\Windows\.registry` 存在且**递归 0 文件**（`dir /a` 已核，目录时刻 09-21 07:43:18），`D:\dsh-plugins\.registry` 已不存在，`C:\.registry` / `C:\Users\.registry` / `C:\Users\LENOVO\.registry` / `C:\Windows\System32\.registry` / 仓内 `.registry` 均不存在 ⇒ 与"当前实例仍按 cwd 推导、且这一实例没经面板装过插件"一致。

**本轮新发现的两种失效模式**（D-11 原文只写了"落点漂移"，比这更严重）：

1. **落点连目录都建不出来时，面板整个装不上**（fail-hard）。审计 sink 在装配期**无条件** `mkdirSync(dirname(file), { recursive: true })`（`panel/manager/audit-sink.mjs`（第 34 行，当时），由 `panel/manager/registry-host.mjs`（第 100-104 行，当时） 在 `hasEvents && auditLog!==false` 时调用），这一句**没有 try/catch** ⇒ 异常穿出 `createToolkitServices` ⇒ 穿出面板 `apply()` ⇒ cordis fiber 载入失败 ⇒ 唯一管理入口没了。落点由启动器 cwd 决定，等于把面板可用性挂在启动方式上。
2. **落点建得出来但写不进去时，状态静默丢失**（fail-silent）。`persist()` 把 `saveState` 包在 try/catch 里，失败只 `log.error('状态落盘失败', … errorCode:'state-save-failed')`（`registry/src/registry.ts`（第 323-329 行，当时）；`registry/src/state.ts#saveState` 自身不吞错）⇒ 面板照常显示 `active`，重启后条目全丢。同一条路径推导同时具备"过度失败"和"不足失败"两端。

**修法（采纳报告建议，并补一条降级）**：① `panel/index.js`（第 281 行，当时） 把已 resolve 的 `toolkitRoot` 传进 `createToolkitServices`（或在 `registry-host.mjs` 内以 `import.meta.url` 锚定仓根），使两半归一个根；② audit sink 的装配期 mkdir 加降级（建不出来就 warn + 禁用 sink，绝不让面板装不上）。修复等 Pack H 点名，**本轮代码零改动**。

**如实边界**：`C:\Windows\.registry` 为空，**无法事后区分**"从未写过"与"写失败被模式 2 吞掉"——宿主 console 日志不落盘（`C:\Users\LENOVO\.dsh\logs` 下只有 `llm-requests.jsonl`，grep `state-save-failed` / `audit sink 写入失败` 零命中），且 3080 全部路由匿名 401（本侧不取凭据），当前实例挂载集无法运行时取证。ACL 只读取到 `BUILTIN\Users:(I)(RX)`（无写位）而该目录确被建出 ⇒ 建目录的那次启动是提权的，与"cwd=System32"互证。

---

### D-12 追加 · 交叉验证轮：B2 与官方 loader 的完整对照（2026-09-21，只报不修）

**装载器现场（先纠正一处措辞）**：`@deepseek-ai/cordis-plugin-loader` **1.0.3**，物理两份——`C:\Users\LENOVO\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\cordis-plugin-loader`（全局 CLI `@deepseek-ai/dsh@0.1.5-rc.1` 的**嵌套依赖**，声明在 `C:\Users\LENOVO\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\package.json`（第 37 行，当时））与 `D:\dsh-plugins\dsh-web-search-local\node_modules\…`（旧独立插件自带）；`C:\Users\LENOVO\.dsh\profiles\node_modules\@deepseek-ai\cordis-plugin-loader` 是指向前者的符号链。它**不是顶层全局包**，报告"全局安装"的说法会让人找不到。cordis 本体各处均为 **4.0.2**，无版本分裂。⇒ B2 头注"`registry/src/loader.ts:305-308` 本仓未安装、无法逐条对照"的前提确实已失效。

**官方解包链（读完整，不止报告引的那 5 行）**：`unwrapExports(exports)`（`C:/Users/LENOVO/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis-plugin-loader/lib/index.js`（第 745-751 行，当时），等价 TS 源 `C:/Users/LENOVO/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis-plugin-loader/src/index.ts`（第 191-199 行，当时））是**纯替换两跳**：`exports = exports.default ?? exports` → 若结果带 `__esModule` 再 `.default ?? exports`（注释链到 esbuild default-interop issue）。调用点两处（`:466` 热重载、`:522` 首次 `_init`），产物直接交给 `:537` 的 `ctx.registry.plugin(plugin, this.options.config, …)`。**命名导出上的元数据不在 loader 层处理**——loader 只负责"选出对象"。配置层另有一条独立通道：`EntryOptions.inject`（`C:/Users/LENOVO/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis-plugin-loader/lib/types/config/entry.d.ts`），由 `:709` 的 `Inject.resolve(fiber.entry.options.inject, fiber.inject)` 合进 fiber ⇒ 宿主可以用 YAML 行的 `inject:` 声明依赖，而 **toolkit 的 patch 行一条都没用**（全凭模块自带）。

**cordis 4.0.2 的取值口径**（`node_modules/@deepseek-ai/cordis/lib/index.js`（第 1622-1634 行，当时），逐字）：`runtime.name = plugin.name`（`name === "apply"` 时置空）、`runtime.Config = plugin.Config`、`fiber.inject = Inject.resolve(plugin.inject)`；配置校验 `if (!runtime.Config) return config; runtime.Config["~standard"].validate(config)`（`:956-957`）。⇒ 一切元数据必须**长在交给 cordis 的那个对象上**，B2 的动机成立。

**双通道实测**（探针 `D:\dsh-test-sandbox\var\scratch\xval-audit-20260921\dual-channel-probe.mjs`：H 通道调**真** loader 的 `unwrapExports`，R 通道调**真** `resolveLocalSource`，同一入口各跑一次，再按上面口径打印 cordis 会看到什么；只 import 判形状，不写任何安装状态）：

| 入口 | H（宿主 loader） | R（registry + B2） | 判定 |
|---|---|---|---|
| 桶根 `index.js` | `dsh-toolkit` / `['webServer']` / 无 Config | 同 | 一致 |
| rate-throttle | `rate-throttle` / `['llm','tokenMeter']` / 无 | 同 | 一致（无 default，两通道都取命名空间） |
| search-router | `search-router` / `['web']` / 无 | 同 | 一致（default 自带 name+inject，纯替换无损） |
| **compact-router** | 名 **`RouterCompactionEngine`** / 四项 inject 齐 | 名 **`compact-router`** / 四项 inject 齐 | **分叉（仅名字）**：`lib/compact-router/index.js`（第 43 行，当时） 的模块级 `export const name` 被 B2 覆盖到 `:485` 的 default 类上（类静态 `:157` inject 两通道都保住） |
| **web-search-local** | 名/inject 正常，**`Config` 丢失** | 名/inject 正常，**`Config` 在场** | **分叉（行为级）**：`:123` 的模块级 `Config`（`@deepseek-ai/schemastery`，实测 `~standard.validate` 可用）不在 `:1422` 的 default 对象上 ⇒ H 通道 cordis 直接 `return config` 跳过校验，R 通道会校验 ⇒ 同一份坏 config 一边报错一边放行 |
| **agent-memory `plugin.js`** | 名 **`register`** | 名 **`agent-memory-runtime`** | **分叉（仅名字）**：default 是 `:105` 的函数声明，JS 推断名即 `register`；`:19` 的模块级 name 由 B2 覆盖。两通道 inject 均为空（本就没有） |
| **面板 `panel/index.js`** | 名 `toolkit-manager` / `['webServer']` | **装载失败** `plugin-shape-invalid`（legacy 合成 id 校验） | **分叉（可达性）**：见新登记 D-15。面板本就不该走 registry 通道，但失败原因不是设计声明而是字段缺失 |

**结论：B2 比官方更宽**（合并 ⊃ 纯替换），且**分叉可观察**。方向上 B2 更贴近"模块声明的意图"，代价是同一个插件经两条通道装载时 **cordis 侧显示名不同**（宿主 preset 通道 = `RouterCompactionEngine`，面板 registry 通道 = `compact-router`）。影响面逐条核过：cordis 日志器名（`:631-632` `name ??= hyphenate(fiber.name)`）、服务撞名报错文案（`:812` `has been registered at <fiber.name>`）、宿主 cordis 调试视图的 fiber 树。toolkit **自己的键控不受影响**——registry/src 与 panel/ 全量 grep `fiber.name` 零命中，条目一律按 `manifest.id` 记账（卸载/审计/state.json 都安全）。附带一条代码推导（未实测）：同一模块实例若被两条通道先后装入，cordis 按 callback 身份复用 runtime（`:1622-1631` 的 `_internal.get(callback)`），**名字由先到者定**。

**给 Pack H 的三个选项（裁定方：待用户）**：① 把 B2 收紧成与官方一致（纯替换）——代价是丢掉 A#13 的 inject 门控修复，等于回退，不可取；② 保留 B2，把 `registry/src/loader.ts`（第 305-308 行，当时） 的"保守近似/无法对照"改成"故意比宿主 loader 更宽 + 差异表"，并考虑钉成用例（本轮已把差异表落档，可作规格）；③ 改三个内置入口自身（default 对象自带 `name` / `Config`），使两通道逐字一致——最小、最正解，但动子插件源码，须按红线 6 全量跑。本轮**代码一字未动**。

---

### settings 层核查（补充轮 · 2026-09-21 Pack I 之后，只读）

**问题**：A#25 删的是 `cordis.patch.yml` 里的 patch 行引擎列表，而 web-search-local 的配置层序是
"内置默认 → patch 行 → settings 节"。若 `~/.dsh` 下留有 settings 节，它会**盖在 patch 行之上**，
那"下次重启完全生效"这句话就不成立。本轮按指令做只读核查（未重启宿主、未读任何凭据、零写操作）。

**查了什么、看到什么**（全部只读）：

| 对象 | 结果 |
|---|---|
| `~/.dsh/settings.yaml`（6520 B / 213 行，mtime 09-21 13:35） | 顶层节共 10 个：`ui-onboarding` `agent-default-model` `agent-presets` `llm-pi-ai` `pet` `remote-web-ui` `skin-wallpaper` `ui-theme` `skin-custom-theme` `llm-deepseek`。**没有 `web-search-local` 节**（那正是插件用的 `SETTINGS_NAMESPACE`），也没有任何 web/search 相关节 |
| 同文件关键词扫（`engine` / `sogou` / `searxng` / `duckduckgo` / `mojeek` / `bing` / `baidu` / `google` / `360` / `web-search` / `searchProvider` / `fetchProvider`） | **零命中** |
| `~/.dsh` 其余配置（`dsh-search-router.json` `dsh-rate-throttle.json` `dsh-rate-throttle-learned.json` `remote-web-ui-devices.json` `pet.json` `skin-center-active.json`） | 严格引擎语境式全为零命中（`dsh-search-router.json` 上一轮已单独核过：只有 mode/officialProviders/… 无引擎条目） |
| 运行 profile `~/.dsh/profiles/web/`（另存 `dsh-base` `dsh-web-all` `ui-obs` `dsh-ffn-dsh-obs` `dsh-toolkit` `dsh-repo-spec`） | `cordis.yml` = `[]`、`cordis.patch.yml` = `[]`（注释自陈"applied after every bundle layer"）⇒ **profile 自己的覆盖层是空的** |
| `~/.dsh/profiles/web/package.json` | `"@local/dsh-toolkit": "link:D:/dsh-plugins/dsh-toolkit"` 且出现在 `dsh.profile.bundles` 里 ⇒ 实证了 H5 那句归属判断：宿主确实加载**本仓那份** `cordis.patch.yml`，改动经该 `link:` 生效 |
| `~/.dsh/profiles/web/pnpm-lock.yaml`、".dsh-market/discovery-compatibility-v1.json"（市场缓存运行时产物、当前不在盘） 的命中 | 前者是包元数据 `engines: {node: …}`，后者是市场目录里的插件**名**（`web-search-searxng` 等）⇒ 都不构成配置层 |

**结论**：**确认无覆盖层**——引擎列表的唯一声明处就是本仓 `cordis.patch.yml`（第 61 行，当时），
删除在宿主下次重启时**完全生效**。
若今后有人通过桌面 settings 面板给 web-search-local 写 engines，那一层会盖上来——届时以
`~/.dsh/settings.yaml` 出现 `web-search-local` 节为判据，I1 门禁看不到那一层（它只校验仓内 patch 文件），
这一条边界记在这里，不另开债务（属产品既有分层设计，非缺陷）。

#### 生效现场补记（2026-09-22 晨，同一补充轮内自查发现）

上面那句"下次重启完全生效"写完不久就过期了：本会话跨到 09-22 之后，宿主监听 pid 从
H5 轮的 `6900` 变成 `2624`，`Get-Process` 读得其 `StartTime = 2026/9/22 7:50:09`
⇒ **宿主在 Pack I 提交（09-21 晚）之后自己重启过一次，不是本侧动作**（本侧当轮零重启、零宿主写）。
既然重启已经发生，就按"预测已过时 ⇒ 去核现场"处理，只读核得三项：

- `/api/toolkit-panel/v2/snapshot` → 200，宿主健康；
- `/api/toolkit-panel/snapshot` 的 `web-search-local` 行 → `mounted`，其 `patchRow`（面板读的就是
  宿主加载那份文件）为 **`config.engines = [searxng, google, duckduckgo, mojeek, bing, baidu]`**（6 项）；
- 用 `link:` 指向的那份模块（即运行中实际加载的文件）只读 import：`default.name = 'web-search-local'`、
  `Config` 在场、`Config['~standard'].validate` 是函数 ⇒ **H5/H3 的元数据自带在新实例里照样在场**
  （这条同时是"新版经 link 生效"的旁证；权威证明仍是 H5 真机读数）。

⇒ 结论从"下次重启会生效"更新为"**已生效**"。同时留下这条自查记录：写"待某事件发生后生效"这类
预测句时，收尾前必须回头看事件是否已经发生——本会话内宿主重启不需要本侧点头就会发生（用户自己在用）。

---

## E. 分歧账（副本线 · C1-007 阶段二 S1 批开立）

> 令面原称"D. 分歧账"；本文 D 节已被待办占用，顺延为 E——如实申报。字段照呈报 §三.⑥：
> 分叉类型／两侧 commit／回流方向／回放笔 hash／闭账条件。共同祖先钉死 04816b8。

| # | 分叉类型 | 内容 | 两侧 commit | 回流方向 | 状态/闭账条件 |
|---|---|---|---|---|---|
| E-1 | 副本独有笔 | S1 剔除批全量（F-91 出包＋G2b/G3＋patch 滚存 693cfcd7＋四卡＋守卫清偿） | 本仓 `8ff8c63`→`049dde6`／本地（无，冻结 04816b8） | **不回流**（阶段二零笔落本地既令） | 开放（副本线常态演进） |
| E-2 | 部署面预期红 | 门禁第 2 步 p2-smoke 1 断言：patch 部署行 file:// 指向在用仓（副本未部署的部署面事实） | 本仓笔 B 起／本地 04816b8（在用仓自指故绿） | 不回流；S2 包化处置 patch 形态时一并闭账 | 挂账（维持至 S2，既裁） |
| E-3 | 工装失效遗留 | `scripts/p23-shadow-scan.mjs`（链外历史工装）web-search-local settings 遮蔽半边随出包失效 | 本仓（未改）／本地 04816b8（原样在役） | 不回流 | 开放（S2 包化批清理候选） |
| E-4 | 共线缺陷通道 | 规矩立此：本地日常使用发现共线缺陷 ⇒ 本地单独令修复，副本按同法回放并在此登记回放笔；副本发现共患 ⇒ 只登记不触本地、报协调侧 | — | 本地→副本（知识回流）／副本→本地（只报不改） | 常设规矩（无当前在案条目） |
