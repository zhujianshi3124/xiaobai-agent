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
| `TERMINAL-ACCEPTANCE-ROUND10.txt` | 由 `scripts/terminal-acceptance-report.mjs` 生成（第 10 轮终验取证 a–e；**只读**，重建 4 次写链 LCS）——**表述更正（2026-09-21 Pack I）**：本行原写"可重放"，实为**不可重放**：该脚本会把新报告写回本文件（已入库并登记下面这枚 sha），且它依赖的判据基准 `ce0b0b81…` 与"HEAD blob + 追加 toolkit-manager 4 行"的重建公式均已退役 ⇒ 脚本已冻结并加执行硬闸（摘闸实证：重跑会产出 10862 B 的今日版本）。复核第 10 轮判据请**直接读本正本**，细节见 `docs/debt.md` D-17 / A#25 | 6689 | `49ef62a02e6d5d0379de1597fc5566c673b26684f55a56cef1e0001464ef2e55` |
| `D01-MANIFEST-FIX.diff` | 第 11 轮 D-01（ADS 备份）+ manifest `reason`/`note` 修复的 **diff 留痕** | 16579 | `17fa692cb59ded4e7dcbcac1c865ad950540211b3802f4da12e80248a37a6b07` |
| `ROUND12-SUPPLEMENTARY-ACCEPTANCE.md` | 第 12 轮 —— 催收**三项补验收正文摘要**（A：`api-notes` 两新节 / B：附录 B U1–U11 / C：3 项归一枚举 + 「全文 diff 不可构造」）+ U8/U9 呈报 + 新增 U12（授权语义澄清） | 10848 | `84c69d88f56152419a97a535a1396b10f06127cf819a490051371368ecfef2ab` |
| `MASTER-BLIND-PROBE-8.txt` | 由 `scripts/master-blind-probe.mjs` 生成（可重放，**8/8 逐字命中**）—— **判定侧盲抽 8 句**（探针判定侧指定，本侧未挑选；逐句 ±20 字上下文） | 5137 | `04f0e735b5e0824b7efa5df5c280a3ba7f0b0032d2c69d226ea3286e75adf609` |
| `ROUND13-SUPPLEMENTARY-2.md` | 第 13 轮 —— **尾②注入点全表**（+「已扫与否/未扫原因」，**补登同族缺口 #0/#2/E1**）+ **U1–U5 逐行补呈** + 盲抽结果登记 | 10057 | `99d1284d36bf12a77833088dc6608ba7d682d5fcc17ff797c67fe44083b95f62` |
| `Q2-RELEASED-SCAN.txt` | 由 `scripts/q2-released-scan.mjs` 生成（可重放，全程只读）—— **乙程序首批例行只读读取**（U12=乙 首批）：红线内 4 点 + 注入点 5 env 全落结论 ⇒ **Q2 全表穷尽 ✓** | 4477 | `d4839418e5d41f253ab269f15a54b1c4e3c5f77e75614e591d771be6947e6fad` |
| `P23-SHADOW-SCAN.txt` | 由 `scripts/p23-shadow-scan.mjs` 生成（可重放，全程只读）—— **P2.3 设计前置遮蔽补扫**（第 15 轮授权段）：T1 热 JSON 现有 `mode` 键（auto）⇒ patch 编辑无效；T2 settings 无 `web-search-local` 节；T3/T4 env 空。**尾注含越界申报**（`dsh-rate-throttle.json` 授权段外手工只读一次，列 U13-1 追认） | 2773 | `ab707cc2c4d258d5a4d717edd45a63d469e5534529929fa8e800399dee13198c` |
| `P23-EVIDENCE.txt` | 本侧撰写 —— **P2.3 施工验证证据**（第 19 轮批准后首个写盘批次）：交付清单 + p23-verify **107/107** + 一键回归全绿 + doctor 0/0/0 + 基准 sha 未变 + **U9 marker 刷新记录** | 4814 | `32e2dd8b9bd94522fd06e0db4e31f396f829119530734d4808a3bd3e18410546` |
| `P23-FINAL-ACCEPTANCE.txt` | 本侧撰写 —— **P2.3 终验取证正本**（新会话第 2 轮放行后）：两段式真实写入 `tpmCooldownMs` 45000→46000→45000；段1/段2 各 1 备份 + manifest `reason/note` 传真值；sha 链 `ce0b0b81→539ba66d→ce0b0b81`；最终 **sha==ce0b0b81**（字节复原硬判据达标）+ 两段 doctor 0/0/0 | 2881 | `8ded9474f9baf952bb25e66046f0390c080f38b0a508f26d4367cad77c1e7782` |
| `P24-EVIDENCE.md` | 本侧撰写 —— **P2.4 扩容 · 证据批（扩展版七项）**；结论：限流/压缩/记忆联动成立，**新发现搜索插件参与联动**（search-router × web-search-local × web.config）；软/真卸载与恢复联动机制 + compact-router 特案 + DSH 安装/重装机制 + doctor 信号源 + 双回滚路径 | 10185 | `45b8eab7885624e1dd168c88d905649067c3e49db9e9c79cd957274b72a20dc6` |
| `P24-BATCH1-UI-CLOSURE.md` | 本侧撰写 —— **P2.4 施工批 1【引擎+UI】收尾 · 全绿报判**（新会话第 5 轮，L-056）：UI 交付（两渲染器组件 + §2 全稿文案）+ 面板级矩阵 **623/0** + **D-UI-01..08 八处面板级缺陷**与修法 + 回归/doctor/基线证据 + 呈验请求与用户目视清单 | 10563 | `611ce9b71f80833496f82504d7e93fbb2b8b78b6c30e924b5b3172864f9d40e6` |
| `P24-BATCH1-UI-REGRESSION.txt` | 由 `scripts/regression-all.mjs` 生成（可重放）—— 报判时点**全套回归 14 项 + node --test 93 全绿原文** | 1414 | `9a7824386cabc3b6d0c28eea8254e3c8218c72f20c0946f0fad9d86c00f8f3a2` |
| `P24-BATCH1-SOFT-ROUNDTRIP-FORENSICS.md` | 本侧撰写（**只读取证**）—— **账 b**：用户面板手操 **web-search-local 软卸载→软恢复** 事后取证：两笔 `.panel-write-backups` manifest 原文（reason/note 如实）+ 摘行 **diff（删 7 行/增 0 行）**+ **LCS 严格重建校验**+ 当前 sha **回 ce0b0b81＝完整往返 ✓** + 本体保留 + 台账清账 + 邻接留痕 + doctor 0/0/0 | 7452 | `c36652985eb772a1ef507c5eee5fa58dfaeb5f0fbfbc2309f8b687becf1e4bed` |
| `P24-BATCH1-CLOSURE-PREFLIGHT.md` | 本侧撰写 —— **账 a ＋关账前置核验**：销毁式 v2 **未开工**（受 Q1 闸门，零代码）＋完成时点依赖 Q1 之如实说明＋**回归 622/623（1 项测试守卫假阳性，非产品缺陷）**＋**关账前置未满足 ⇒ 未执行关账**＋待裁决 Q1/Q1'/Q2'＋关账包 6 项待启封清单 | 7689 | `8f72a42b762c631e2c571d6c51f90ec53efff93ede0aec2607f4a2dd43c58ed3` |
| `P24-BATCH1-REGRESSION-PREFLIGHT.txt` | 由 `scripts/regression-all.mjs` 生成（可重放）—— 关账前置核验时点回归原文：**13 项绿 + p24-ui-matrix 622/623（1 FAIL）**，如实留档（**未为凑绿而改测试**） | 1437 | `23115ca108d17280187bc71315e23dc0167b0c856e548f186d115081981ccfa1` |
| `P24-BATCH1-CLOSURE.md` | 本侧撰写 —— **P2.4 施工批 1 关账记录正本**（判定侧 Q2'-b 执行）：关账范围（软卸载/恢复＋引擎＋UI＋doctor）· 三源依据（用户亲验／账 b 字节级取证／L-056 全绿）· **豁免条款重写版**（原「真机验证推迟」作废）· 下架记录 · 全绿快照 · 后续顺序 | 7143 | `c9b7574ef81152bcdc63c2a0a7c3d20727eadb138202e24bda1cf2d7db57ed43` |
| `P24-BATCH1-CLOSURE-REGRESSION.txt` | 由 `scripts/regression-all.mjs` 生成（可重放）—— **关账时点全套回归原文**：14 项 ＋ node --test 93 **全绿**（p24-ui-matrix **546/0**，真卸载段改下架断言后的新口径） | 1414 | `aa6fadd0c884fa2a7d567b308f8156608037b21c0dbb171ff309436243d81202` |
| `P24-V2-DESTROY-REPORT.md` | 本侧撰写 —— **销毁式 v2 施工全绿报判**（L-060）：交付清单（引擎去存档步→收据先行／挂载算子／快照 v2／两渲染器文案 v2 三句必含＋两补强／矩阵重建＋5 条硬判据／C3 重装挂载用户故事）· 施工中显影的 2 处回归与修法 · **1 处实施偏差申报**（§5.3 无收据改为拒绝）· 呈验请求 | 8602 | `f07413c7f04bf159464aa399ed6d6b5d79e8aaede69d3fb08cc3b5e3f6030cd2` |
| `P24-V2-DESTROY-REGRESSION.txt` | 由 `scripts/regression-all.mjs` 生成（可重放）—— **销毁式 v2 报判时点全套回归原文**：14 项 ＋ node --test 93 **全绿**（p24-verify 53/0 · p24-ui-matrix 666/0 · p1-smoke 225） | 1414 | `8aca80b1c727ed406cd7e56544ceb432d896fa89b97a9a9398aa20a1dfdfe48a` |
| `P24-BATCH2-CONSTRUCT-REPORT.md` | 本侧撰写 —— **批 2 施工完成报判**（L-068，判定侧 2026-09-19 **补登**主表）：七单元交付＋测试定版清单（63/0·718/0·79/79·141）＋D1 三条件兑现＋零写入自证＋★两线碰撞呈裁（(a)/(b)/(c)） | 6950 | `d2162c47414b03e63835983d0358ba491644dd698ce9cb55156a0176795360e5` |
| `P24-BATCH2-CONSTRUCT-REGRESSION.txt` | 由 `scripts/regression-all.mjs` 生成（可重放）—— 施工报判时点回归原文：**13 项绿＋p1-smoke 263/264**（唯一 FAIL＝两线碰撞闸，如实留档未凑绿） | 1438 | `0289d529b4d51b7f5703d5235de5a822d12c69dbb0bbcf45eb621442b24d57b3` |
| `P24-BATCH2-COLLISION-RESOLUTION.md` | 判定侧撰写 —— **两线碰撞处置 (b) 报判正本**（用户裁 (b) 执行；doctor@`f423d4a` ⇄ toolkit 本提交互引）：D-UI-06 同族判据（test/ 整体出扫描面＋lib/ 直下例外 fail-closed）＋三向锁断言＋doctor 全套自测（14/14·21/21·8/8·7/7·stage3 a–g PASS）＋真实仓 0/0/0＋全套回归全绿＋碰撞留痕＋stage3 既有环境性事项单独留档＋**判定侧验收表** | 7092 | `f788a83a21789bfd37f2ca5f0ec0447e6e62760b1e4f1ecefd0c9b595553c2d4` |
| `P24-BATCH2-COLLISION-RESOLUTION-REGRESSION.txt` | 判定侧采集 —— **A** doctor 仓全套自测原文（含真实仓 dry-run 探针 0/0/0）＋**B** `regression-all.mjs` 原文（**14/14 全绿，p1-smoke 恢复 264/264**） | 7185 | `9ee54b15e680ee81bfac99cfc54a325fab4317a89c81e52617aae68ab2b3c76a` |
| `P24-BATCH2-RELOAD-CHECKLIST.md` | 判定侧出 —— **批 2 用户目视清单**（人话十步，引号文案逐字取自两渲染器源码）：顶部照旧／体检与操作台四段＋空态句／真卸载弹窗「删除原因（可不填）」（只看不删）／交回方式 | 3520 | `4d063abbca11a8a9e4c5e9c893fa399f0d9bde94438daa46cac7107a6966e853` |
| `P24-BATCH2-CLOSURE.md` | 本侧撰写（判定侧执行）—— **P2.4 施工批 2 关账正本**（L-070，用户目视通过后放行）：范围＋三源依据（用户目视「应该都有」＋两截图／判定侧验收／关账时点全绿）＋**§3 两线碰撞留痕全录**（并行事实＋(b) 处置＋(c) 否决理由＋(a) 转告＋教训「扫描面约定代码化」）＋§4 stage3 既有环境性事项单独留档＋**§5 U 项终态清账**（U15 推迟候补随包呈裁）＋§6 豁免移交＋§7 提交链 | 7943 | `313011b1a6ef5303149177310cf2ea16c790e0863828fd60be3c37d54dc0066a` |
| `P24-BATCH2-CLOSURE-REGRESSION.txt` | 由 `scripts/regression-all.mjs`＋doctor-runner 同款 dry-run 探针生成（可重放）—— **关账时点原文**：regression-all **14/14 全绿**（p1-smoke **264/264** · 63/0 · 718/0 · 79/79 · 141）＋真实仓 doctor **0/0/0** | 1833 | `fd605a8cc5caa7669eb0a4e4aae7529f04282aac9a32400e4123799eb2a4bc26` |
| `T0-REAL-PLUGIN-LOOP.md` | 本侧撰写 —— **T0 真实插件兼容性闭环·真浏览器验收证据**（dd6727f/0a35d63/d83663e）：根因判定（monorepo 根=插件侧缺入口；loader 不读 package.json exports 为 G1 真实缺口）+ 8 步闭环实测（安装/免刷新出卡/启停 confirm/配置三字段落库/健康如实呈现/SSE 实时）+ 闭环期间发现修复的 5 项缺陷清单；截图原件在 `.panel-backups/t0-real-plugin-loop-2026-09-19T23-26-24/`（不入库） | 5918 | `9fb5b4039dfc04f441f6022c7bd95fc4a37b4c004c87cf07ebeeb15c6b1078c4` |
| `P7-MOCK-BUCKET-LOOP.md` | 本侧撰写 —— **P7 嵌入·mock 桶真浏览器闭环验收证据**（toolkit@8bb4d13 + doctor@6839cc1）：harness 只 `import 根入口 + apply(ctx,config)`、webServer 归宿主（数组替身）、32 条路由与 snapshot/doctor/v2 全为 toolkit 真身无桩；8 步实测（相对路径提交前拦下/绝对路径 legacy 预检通过/免刷新出卡/配置三字段落库/停用启用双确认闸/健康 healthy×12 环形历史/tk2 前缀整轮可达且与缺省基址互 404）；含嵌入边界如实陈述（dsh-web-all 不认 panels、React 标签页基址为 bundle 常量、双实例须各自 statePath）。截图原件按 workspace 治理规则落 `assets/images/2026-09-20/`（不入库），第 4 步后 in-app browser 面板隐藏 ⇒ 改 DOM 断言 + 服务端快照，逐行标注证据类型 | 8581 | `eb7695f8d0340af339e4872b19ef2e2bff3dbb1e477019d2a6b22d5bfdefee96` |
| `P7-REAL-HOST-SMOKE.md` | 本侧撰写 —— **P7 真实 dsh-web-all 宿主冒烟验收证据**（toolkit@8bb4d13/6e50bf3 + doctor@6839cc1，用户当场授权重启）：Q2 裁决追加项——零宿主改造、`~/.dsh` 全程未读写、唯一被改文件是本仓 `cordis.patch.yml`（还原后 sha `ce0b0b81…` 逐字节一致）。三轮重启（挂载/卸载/还原）+ 清单三项逐条：① web-search-local 运行时回归清偿（宿主挂载态 + 真实公网探针 search 12 源/1192ms、fetch 200/45795B，并写明"未做宿主内 agent 搜索调用"的边界）② 面板在宿主进程内可达且 SSE 拿到 hello 帧（含 doctor/dry-run 0/0/0）③ 卸载后 8 条抽样路由 200→401、新 pid 仅剩 3080 一个监听、宿主继续正常服务；另附"本侧明确没做的事"清单 | 6240 | `fbd08cd3ae1c8a2fcc256520fc9dd197d1174d7a0801bebc66fac4105f997954` |
| `G-REAL-HOST-SMOKE.md` | 本侧撰写 —— **Pack G 真实 dsh-web-all 宿主冒烟（用户批准重启）**：F1/F2/F3 生效验证九项清单 **8 PASS + 1 未验**。②32 条路由逐条符合 p1-smoke 声明期望（7 条读路由全 200，其余按设计 405/404/400，"全部 200"的字面口径已如实改写）；③5/5 mounted + F2 负路径按目录装 agent-memory ⇒ 情形 A 结构化可执行报错且 live registry 不被污染；⑥宿主进程内探针证得 `ctx[toolkit/doctor]` 可取可干活（`inspect()` 真跑出 healthy），并把 D-6 升级为宿主现场实测（`ctx['toString']` 有值 vs `ctx.get('toString',false)` 缺席）；⑦lastError 失败→恢复→载荷 `null`，`audit.jsonl` 保留全程；⑧宿主 cordis 4.0.2 下 fiber 编号守卫六值与 `FIBER_*` 全对。**未验项＝⑨宿主会话内真实联网搜索**（阻塞在用户会话凭据，D-4 不关闭）。两条如实边界随正文落地：卸出态"活动流终止"系**进程重启**达成、不等于 Pack D 的同进程 `fiber.dispose()` 那一格；`LOADING=1` 与仓内守卫同口径由枚举不变式覆盖、未单独实测。新发现 D-11（statePath 随宿主 cwd 漂移）/ D-12（宿主装有 cordis-plugin-loader，B2 前提已变）。探针脚本与原始日志副本：`.panel-backups/g-real-host-smoke-20260921/` —— **清单校正（2026-09-21 14:05）**：本行原列 `18003` / `0559c925885a6d80b4bbd1be6c2e62e4291fbbb75df43bf0e123c5aadef0e81b`，那是本文件补 §〇 交叉引用与修正重启日志名**之前**算的，与入库版不一致（本侧失误，如实纠正而非留错）；同一文件文末另**追加**了《补验注记 · 第⑨项已闭环》，原正文一字未改（遵本目录"只增不改"） | 20531 | `ca22949f798bd5ddf329d7b7d3c0b6984243d271ffd6432a55382054de2d7547` |
| `D4-WEB-SEARCH-HOST-EVIDENCE.md` | 本侧撰写 —— **D-4 补验收口：宿主会话内一次真实联网搜索**（G 第⑨项）：**7 次 `web_search` 全部 `isError=false`、47 条来源**，逐条含 queries/耗时/域名样本；**三重归因证明走的是 web-search-local**（search-router 路由 + `lib/web-search-local/index.js:1280-1291` 输出指纹命中 5 次 + 5/5 mounted）；并如实记录**取证脚本自己的两个缺陷**（只按 `tool/call` 取名会漏掉 `run_code` 内经 `tool/ptc-dispatch` 派发的调用；zstd 会话正本须逐帧解压，整块解只出首帧 200 字节）；口径澄清：用户裁**不按 fetch 格关账**，fetch 属 `local-fetch` 另一格。可重放：`node .panel-backups/g-real-host-smoke-20260921/d4-websearch-final.mjs` | 5501 | `ca2468e54ebdc73b78c45b4421a3439063d478d3020cc66ea302d30404d3aecf` |
| `H-REAL-HOST-REVERIFY.md` | 本侧撰写 —— **Pack H5 真机复验（用户批准重启）+ 一次宿主整机启动故障的完整处置**：① H1 落点 —— 宿主 `process.cwd()` 实测 `C:\Windows\system32`（旧公式命中场景）而 state/audit 两面锚在 `D:\dsh-plugins\dsh-toolkit\.registry`，7 处漂移点/公式变体/`%TEMP%` 对照位**零新文件**，探针装卸在 `audit.jsonl` 留 4 条流水且与 `plugins:[]` 逐条相符；② H3 双通道 —— 临时探针直读宿主进程内 `ctx.registry`（324 条 fiber），`compact-router`×2 与 `agent-memory-runtime` 的 fiber 名全为声明名（后者 `callback.name` 仍是 `register`），旧名 `RouterCompactionEngine`/`register` **0 条在场**，五内置插件归属链全在宿主 patch 通道；③ `web-search-local` 入口级 fiber `Config`+`~standard` 在场且 ACTIVE。**故障**：首次重启即整机 exit 1，根因 `cordis.patch.yml:61` 的 `engines` 第 8 项 `360` 未加引号 ⇒ YAML 给整数 ⇒ H3 起宿主通道真校验 ⇒ `ValidationError` 冒到 `dsh-app-boot` 顶层（**爆炸半径＝整机起不来，不是拒绝单插件**）；按用户裁决加引号修复并滚存判据基准 `ce0b0b81…`/3097 B → `bb7af96f…`/3099 B（p24 两处硬闸期望值同步、机制未放宽）。**三条如实申报**：坏值时代 `360` 引擎其实一直生效（`:1050` 有 `String(name)` 兜底）、本侧曾把宿主消失误判为拉起方式、第一轮探针断言口径过宽造成一条假红（修正后 12/12，两轮原始 JSON 均留档）。另含 cordis 报错质量六维评估（缺文件/行号与修法）、`ce0b0b81…` 错账的成因查证、D-16/D-17 新登记。取证脚本与原始读数：`.panel-backups/h5-reverify-20260921/` | 24052 | `119c3f3c4fed2034ececc4feaeb4a5f0400e7d6ed9aad8b1d84ba3c78791117c` |

| `BREAKPOINT-FORENSICS-20260923.md` | 本侧撰写 —— **波 0 断点普查（"配/管"环 · 只读 · 零写操作）**：① **P-1 五插件 × 六操作通路 30 格** —— 唯一可写配置卡是 `rate-throttle`（18 字段白名单 → `validateConfigValue` 类型/范围/YAML 字符拒绝/跨字段 → `executePlan` 写 patch + `.panel-write-backups/<stamp>/`），`search-router` 只读呈现 mode（第 19 轮裁定不给写口），其余三卡 `configPanel.editable:false` 属设计；**重载列**对内置五卡恒不可达（唯一入口 `/v2/reload` 需 registry 条目而 `.registry/state.json` 实测 `plugins:{}`，设计如此但四张卡缺"须重启"提示）；**健康列 5/5 整列皆断且判为缺陷**——通道要不到条目 + 内置零模块导出 `healthCheck` 两层叠加，而契约承诺逐插件健康。② **P-3 宿主实读来源由"推断"升为"逐字相等已证"** —— `snapshot.patch.text`（2979 字符）与本仓盘上 `cordis.patch.yml`（3085 B / sha `e8051fe9` / mtime 09-21 22:41，**判据基准未变**）`utf8` 读入后 `===` 为 true（原样与 CRLF 归一两比都 true），rows 9 条、宿主面直接读到 `engines` 六项、`self.name` 是 `file:///…/panel/index.js`（⇒ 宿主按 name import，与 `manifest.panels` 无涉；该格仍不构成"宿主读 panels"的证据）；宿主 PID **7556**（批 4 时是 26004 ⇒ 期间用户自然重启，非本侧动作），`Get-Process StartTime` 在本沙箱无输出故不据此判宿主存活（由 snapshot 200 自述证明）。③ **P-2 待用户动作单**四条按"取什么/报什么格式"写好，供协调侧"一次集中人工"直接照取（设置页 5 卡显示、tab 是否出现及位次、批 4-② 真实搜索、批 4-③ 表单是否按 14 键渲染）。④ **热更新能力本单不下结论** —— 给出的是替代判据（改前后 `patch.text` 与盘上是否仍相等 vs mtime 已更新），收口需一次真写 ⇒ 排合并真机窗口。取证边界四条自曝：通路表是"静态读码 + 只读 GET"级证据非端到端；两路只读代理的结论中我方仅逐字抽验 F-69/F-70/F-75/F-79/F-81/F-82 六条，余者已逐条标"代理实读、未复看"；`patch-config-check.mjs` 的"2 行真校验"覆盖面叙述未复算（记给 W10）；探针目录 `var/scratch/feature-inventory-20260923/` 实测只有两枚 H2 夹具 manifest ⇒ **不足以**重建缺节，故按令改走代码重建。落差编号见 `docs/feature-inventory-20260923.md`《续档》节（F-69…F-91）。 | 9012 | `29cbdbe8cab4b2accb1d10316e2d734e3c6f32d992f1b04756466ae64e764acf` |

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
- **`P23-FINAL-ACCEPTANCE.txt`** —— P2.3 最终验收取证正本：两段式真实写入 `tpmCooldownMs` 45000→46000→45000；段1/段2 各产生 1 份生产 `.panel-write-backups` 备份（manifest `reason/note` 传真值 + `savedAs` 无冒号/无 ADS）；sha 链 `ce0b0b81→539ba66d→ce0b0b81`；最终 **sha==ce0b0b81**（字节复原硬判据达标）；两段 reload 后 snapshot 5 卡齐全、面板仍显对应新值、doctor 0/0/0。
- **`P24-EVIDENCE.md`** —— P2.4 扩容证据批正本：七项证据一次呈齐；联动图定案基础（限流/压缩/记忆联动成立；**新发现 search-router × web-search-local × web.config 参与联动**）；软/真卸载机制、重装机制、恢复联动、doctor 信号缺口、双回滚现状，供设计稿与判定侧验收引用。

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
| 2026-09-18 18:11（新会话第 2 轮） | 三项取证全绿 + 目视通过补记 + **P2.3 终验放行并完成**：两段式真实写入 `tpmCooldownMs` 45000→46000→45000 往返闭环；最终 sha==`ce0b0b81`（字节复原硬判据达标）+ 两段 doctor 0/0/0 | 新增 `P23-FINAL-ACCEPTANCE.txt`（2881 B） |
| 2026-09-18 19:21（新会话第 3 轮） | 需求定案 + 顺序裁定 → **P2.4 扩容证据批完成**：七项证据；联动分类（限流/压缩/记忆成立；**搜索插件参与联动呈判**）；软/真卸载 + 重装/恢复 + doctor 信号 + 双回滚路径落档 | 新增 `P24-EVIDENCE.md`（10185 B） |
| 2026-09-18 23:05（新会话第 5 轮） | **P2.4 施工批 1【引擎+UI】收尾 → 全绿报判**（L-056）：两渲染器 UI 交付（卸载/恢复入口 + §2 全稿确认弹窗 + 六态缺席横幅）；新增**面板级完整矩阵 623/0**（真实四 API + 两渲染器）；矩阵暴露并修补 **D-UI-01..08** 八处；回归 14 项 + node --test 93 全绿；doctor 0/0/0；真实 patch 零写入 | 新增 `P24-BATCH1-UI-CLOSURE.md`（10563 B）、`P24-BATCH1-UI-REGRESSION.txt`（1414 B） |
| 2026-09-18 23:20（新会话第 5 轮续） | **需求变更受理：真卸载改销毁式 → 设计修订稿 v2**（L-057，零代码）：`p24-design-v2-destroy.md` 落档（收据口径/重装挂载/文案 v2 含空窗期警告/矩阵改造/不可逆风险 R1–R5/待裁决 Q1–Q8） | 无本目录新增（设计稿在 `panel/docs/`） |
| 2026-09-19 00:20（新会话第 5 轮续 · 判定补账） | **账 b 取证 + 账 a/关账前置核验**（L-058）：用户软卸载**往返字节级复原 ✓**；复跑暴露 **1 项测试守卫假阳性**（白名单漏 `row-adjacency.json`）⇒ **622/623 如实留档**；**关账前置未满足 ⇒ 未执行关账**（销毁式 v2 受 Q1 闸门未开工） | 新增 `P24-BATCH1-SOFT-ROUNDTRIP-FORENSICS.md`（7452 B）、`P24-BATCH1-CLOSURE-PREFLIGHT.md`（7689 B）、`P24-BATCH1-REGRESSION-PREFLIGHT.txt`（1437 B） |
| 2026-09-19 00:5x（新会话第 5 轮续 · 判定三裁执行） | **批 1 关账成立**（L-059）：Q1' 守卫白名单补 `row-adjacency.json`（622→623）；**Q2'-a 下架存档式真卸载产品面**（UI 摘按钮＋API 拒 `true-uninstall-withdrawn`）；Q2'-b 关账（范围＝软卸载/恢复＋引擎＋UI＋doctor）；豁免条款**重写版**。矩阵真卸载段改下架断言 ⇒ **546/0**（口径收缩）；关账时点回归全绿＋doctor 0/0/0 | 新增 `P24-BATCH1-CLOSURE.md`（7143 B）、`P24-BATCH1-CLOSURE-REGRESSION.txt`（1414 B） |
| 2026-09-19 01:0x（新会话第 5 轮续 · 销毁式 v2 施工） | **销毁式 v2 施工完成、全绿报判**（L-060）：真卸载**去存档步改收据先行**（**无 body/ 副本**）＋**挂载算子**（复用插回算子，无收据拒绝）＋快照 v2（`receiptOnFile`／「无副本」文案／`canMount`／`bodyStats`）＋两渲染器**文案 v2**（三句必含＋两补强）；矩阵 **A4/A5/B1/C2/C3 重建＋5 条销毁式硬判据**（C3＝真删→重装→挂载→复原完整故事）；**p24-verify 53/0 · p24-ui-matrix 666/0 · 回归 14 项＋node --test 93 · doctor 0/0/0 · 真实 patch 零写入** | 新增 `P24-V2-DESTROY-REPORT.md`（8602 B）、`P24-V2-DESTROY-REGRESSION.txt`（1414 B） |
| 2026-09-19 08:3x（新会话第 6 轮 · 收讫＋独立复核） | **销毁式 v2 独立复核全绿**（L-061，零代码）：新会话发现开工指令基线滞后（T9 已于上一会话完成并报判 L-060），按「如实重建、不重复施工」改为对已交付物**独立复核**——回归 **14/14 全复现**（p24-verify 53/0 · p24-ui-matrix 666/0 · p1-smoke 225 · node --test 93）＋ doctor 真实仓 **0/0/0** ＋ 真实 patch `ce0b0b81…` **零写入** ＋ 五项交付逐字级在树核验 ＋ **备份/保管目录无插件源码补验**（`.panel-backups` 内 17 个 JS＝P2.1–P2.2 面板开发期人工留档，非插件源码）；三处指令差异申报＋一项硬判据口径观察呈判 | 新增 `P24-V2-REVERIFY-REGRESSION.txt` |
| 2026-09-19 09:0x（新会话第 6 轮 · 判定裁决落账） | **真卸载上架三条件闭环 ⇒ 正式可用**（L-062，零代码）：①判定侧验收（前轮）✓ ②用户目视三句「如图都有」（红色警告条／彻底删除／不可恢复见于截图）✓ ③U17 用户备份口头确认 ✓（判定侧已另行提醒妥善保管）；上架＝治理态变更（代码入口 v2 时已恢复，无开关）；U14 关闭，U16《实测指引》解锁待令，U17 转常态提醒 | 无本目录新增（落账在 ledger L-062） |
| 2026-09-19 09:0x（新会话第 6 轮 · 批 2 先证后写） | **批 2 证据批呈判**（L-063，零代码）：doctor 仓 `src/{cli,engine,executor}.mjs` 全文取证——五算子（replace/insert/delete/create-file/install-package）＋全量安全链（apply 锁/plan 校验/protected 硬断言/逐 issue 确认/写前必备份/原子写）＋**22 问题 id 全集**（可执行仅 2 类 rewrite；20 类 manual；mount 五类 signals 驱动）；**双回滚方案**（doctor 正本＝doctor-patch-state.json＋doctor-backups，本机零产物如实；面板六项恢复面含收据/备份链＋UI 化缺口四项）；**操作台范围**（一键仅 2 类、确认页框架 Q1 同标准、设计前置 Q-A/B/C）；**当前 fixable 全集不触 cordis.patch.yml** | 新增 `P24-BATCH2-CONSOLE-EVIDENCE.md` |
| 2026-09-19 09:4x（新会话第 6 轮续 · 批 2 设计稿＋U16） | **证据批验收通过 ✓＋Q-A/B/C 三裁（全同意）＋两历史项销项＋流程瑕疵留痕令**（L-064，零代码）：交付**批 2 设计稿**（通道分域图/操作台 UI/**确认页文案全稿逐句**/双回滚 UI/确认强度分级惯例/待上架禁用态惯例/测试计划 D1–D9/设计决策 D1 CLI `--only`＋`--yes` 澄清、D2 只读 patch-state、D3 `restoreSnapshot` 算子备选不做）；**U16 落笔**《用户日后实测指引》；教训入 HANDOFF-MASTER 叠加 8.2＋L-062 补注 | 无本目录新增（设计稿与指引在 `panel/docs/`） |
| 2026-09-19 10:0x（新会话第 6 轮续 · 设计稿 r2＋正文贴呈） | **D1/D2/D3 裁决落地＋两件正文全文贴报**（L-065，零代码）：D1 同意附三条件（`--yes` 文档化/doctor 仓过验互引/面板确认层完备才 spawn）；**D2 定案＝CLI 新增只读 `--states`**（面板不直读 `~/.dsh`）；D3 暂缓——restoreSnapshot 语义补段（写前快照非基线/回退面板写操作/低频，两选项呈裁）；§3 文案按预审自查标准加强（3.3 增不联网＋单条单次、3.4 如实明示改 patch＋重启、3.5 增空态句）＋U16 全文贴呈 | 无本目录新增（设计稿 r2 在 `panel/docs/`） |
| 2026-09-19 10:3x（新会话第 6 轮续 · 预审过＋补审呈报） | **文案两件预审通过 ✓＋D3 裁 (a) 施工＋补审呈报**（L-066，零代码）：§3.6「删除原因」完整事实（**前提修正：字段在 schema/API——选填/plan 收/收据先行入账/删除后不可补改；两渲染器均无输入，userReason 恒 null**；文案承诺了不存在的环节——文档失真认领）＋两选项 (a) 补做输入（建议，逐句文案＋D10 呈裁）/(b) 纯文案修正；设计稿 r3（§3.5 空值规则/§4.2 D3 定案/§7 D10/§9）；U16 r2 第三节改 6 步 | 无本目录新增（设计稿 r3 与 U16 r2 在 `panel/docs/`） |
| 2026-09-19 11:0x（新会话第 6 轮续 · 验收闭环定案） | **§3.6 裁 (a) 补做输入＋四句文案预审通过＋失真教训留痕**（L-067，零代码）：批 2 **判定侧验收闭环**——设计稿 r3 定案（操作台＋双回滚＋D1 三前置＋D2 `--states`＋D3 restoreSnapshot 施工版＋§3.6 (a)＋D10）＋文案五段＋U16 r2；教训两条入 HANDOFF-MASTER 叠加 8.3（文档承诺前必须源码取证／施工直报未经判定验收＝细节漂移温床）；**待用户：批准开工＋两线排期** | 无本目录新增（定案在设计稿 r3 与 HANDOFF-MASTER 叠加 8.3） |
| 2026-09-19 12:1x（新会话第 6 轮续 · 批 2 施工完成） | **批 2 施工完成报判**（L-068）：七单元 WIP 提交（doctor 仓 a865bde：--only/--states/--yes 文档化＋自测 21/21；toolkit 508206d D3 restoreSnapshot＋b3b1575 7 路由 15→22＋bafcc56 §3.6a＋75d719a 操作台 UI＋f35336b 矩阵 D 段＋0335863 守卫回归）。**p24-verify 63/0 · p24-ui-matrix 718/0（D1–D10）· cards-ui 79/79 · node --test 141 · 其余全绿**；D1 三条件兑现；零写入自证（真实 patch/真实 ~/.dsh 三件套/备份目录扫描零插件源码）。**★唯一红项＝两线碰撞**：泛化线 4 提交（P0–P3）期间落同分支，其 test/fixtures/registry 无效夹具污染真实仓 doctor 扫描面（5 error 全系夹具）⇒ p1-smoke 真实仓闸 FAIL——方案 (a)/(b)/(c) 呈裁，未擅动 | 新增 `P24-BATCH2-CONSTRUCT-REPORT.md`、`P24-BATCH2-CONSTRUCT-REGRESSION.txt`（**判定侧注：该两件当时仅登记于本修订行，主表漏登——12:5x 轮补登，见上表**） |
| 2026-09-19 12:5x（新会话第 7 轮 · 批 2 收尾） | **碰撞裁 (b) 执行＋报判＋判定侧验收通过**（L-069）：用户裁 (b)（doctor 扫描跳过 test/，D-UI-06 同族）→ doctor@`f423d4a`（走层级排除＋lib/ 直下例外 fail-closed＋三向锁断言 14/14）→ **真实仓 dry-run 0/0/0 复原 ⇒ 全套回归 14/14 全绿（p1-smoke 恢复 264/264）**；stage3 既有环境性事项单独留档（施工时 FAIL／本轮 PASS 双面如实并记）；(a) 转告泛化线、(c) 否决留痕；**批 2 关账前置仅余用户 reload 目视** | 新增 `P24-BATCH2-COLLISION-RESOLUTION.md`、`P24-BATCH2-COLLISION-RESOLUTION-REGRESSION.txt`、`P24-BATCH2-RELOAD-CHECKLIST.md`；补登 L-068 两件入主表 |
| 2026-09-19 13:0x（新会话第 7 轮续 · 批 2 关账） | **用户目视通过 ⇒ 关账一包落盘，待判定侧验收确认收官**（L-070）：关账正本（三源依据＋碰撞留痕全录＋stage3 单独留档＋**U 项终态清账**＋豁免移交＋提交链）＋关账时点全绿原文；HANDOFF-MASTER 叠加 4.10＋附录 B 收官终态注记＋头部时间戳刷新订正；ledger L-070；交接卡 §12 关账版 | 新增 `P24-BATCH2-CLOSURE.md`、`P24-BATCH2-CLOSURE-REGRESSION.txt` |
| 2026-09-23（波 0 · 断点普查，零代码） | **C1-004 过裁后台账**：冷启动四步全过（门禁 6/6 73.0s · doctor 五套件 15/8/7/21 + stage3 a–g · 真实仓 `fixable 0` 先实测 · `~/.dsh` 扫描面 hash 前后同为 `c585738c…`/5 files）→ 清单原样落档 `fc4cf1c`（正文与呈审稿 diff 为空）→ 合流总批计划过裁 `c5c9a59` → 缺节两节按代码重建续档（**探针不足已如实申报**）+ 本单落盘。普查两条实质断点：**内置五卡"健康"列整列皆断（缺陷）**、"重载"列恒不可达（设计但缺提示）。宿主面新增一项正向证明：`patch.text` 与盘上文件**逐字相等** ⇒ "宿主实读本仓那份"由推断升为已证 | 新增 `BREAKPOINT-FORENSICS-20260923.md`（本目录主表已登记 size/sha） |

> **本目录的两条硬约定**：① **只增不改** —— 已入库的归档文件**永不覆盖**；与脚本产生时序差时，**加注记、以脚本重放为准**。
> ② **每份证据必须可重放** —— 上表所有「由 `scripts/*.mjs` 生成」者，重放命令即其生成命令。
