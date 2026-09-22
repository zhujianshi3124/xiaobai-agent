# 遗留债务清单（终态 · 2026-09-20 项目关闭；2026-09-21 cordis 符合度复核追加；2026-09-21 Pack A–H5 + Pack I 全链收口）

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
> `cordis.patch.yml:61` 那个从未加过引号的 `360`（YAML 解析成整数）变成启动期 `ValidationError`，
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
> 原文缺的三样（文件名 + 行号 + 修法）。变异自检两发：还原坏值 ⇒ 精确指到 `cordis.patch.yml:61` 且 exit 1；
> 把解析器整数分支退化成返回字符串 ⇒ 走"本校验器不可信"分支且 exit 1。
> ② **I2 关 D-17**：`restore-cordis-baseline.mjs` **显式退役**（两条独立理由写在头注，含"它在本轮改动
> 之前就已不自洽"）；三个 P8 时点验收脚本判为**历史冻结**——其中 `terminal-acceptance-report.mjs` 查实
> **重跑会覆写已入库、已登记 sha 的证据正本**（与 D-2 同族第二处），故不只加注，直接加执行硬闸（MUT 实证：
> 摘闸后重跑会产出 10862 B 新报告、时刻与 sha 全变）。
> ③ **引擎清理（用户指令：删除 360 与搜狗）**：影响分析四项先过（剩余 6 项 ≥1、分层链 `cn` 仍有
> bing/baidu、search-router 不按引擎名路由、宿主 `~/.dsh/dsh-search-router.json` 只读核对**无引擎条目**），
> 随后 `cordis.patch.yml:61` 由 8 项减为 6 项（判据基准第 2 次滚存 `bb7af96f…` → `e8051fe9…`，
> p24 两处硬闸同步、机制未放宽）。残留按两类清算：配置面已清；历史面（审计流水、证据正本、沙箱旧快照、
> `lib/` 实现与内置默认值）一律不动并逐处列名（见 A#25）。顺带查得沙箱有 **D-13 未点名的第四份同族快照**
> `D:\dsh-test-sandbox\configs\baseline-before-switch.yml`（名字最像"基线"、且指向上游旧包名
> `@gausszhou/dsh-web-search-local`），已补登进沙箱警示文件。
> **误触事件处置**：F2 执行期间一次单选裁决误触（"停手只落文档"），仅在未提交文档层执行、零 commit，
> 已丢弃并写入《D-7 追加》裁定链第 ③ 步；D-4 补验期间两次"零命中"报告经复核证明是**取证脚本口径缺陷**
> （非搜索未发生），纠错过程写入 `D4-WEB-SEARCH-HOST-EVIDENCE.md` §三。
> **冷启动读法**（新会话只看仓库即可接上）：本文件头 → `AGENTS.md` 六条红线 →
> `panel/docs/evidence/H-REAL-HOST-REVERIFY.md`（H5 真机复验 + 一次宿主整机启动故障的处置，
> **最新一棒**）→ `panel/docs/evidence/G-REAL-HOST-SMOKE.md`（含补验注记）与 `D4-WEB-SEARCH-HOST-EVIDENCE.md` →
> 门禁一条命令 `node scripts/ci-local.mjs --with-scan`（**现在含 5 步**，第 5 步是 Pack I 新增的
> `scripts/patch-config-check.mjs`）。**注意判据基准已滚存两次**：`cordis.patch.yml` 现基准
> **`e8051fe9…`(3085 B)**（Pack I 引擎清理后）；上一枚 `bb7af96f…`(3099 B，H5 加引号) 与
> P8/P2.4 时代的 `ce0b0b81…`(3097 B) 均为历史值。恢复工具已按 D-17 退役，
> **正确恢复动作 = `git checkout HEAD -- cordis.patch.yml`**（先自行留现场）。
> Pack I（安全网 + 引擎清理）是纯仓内工作、无宿主复验，故**没有新证据正本**，读数记在 A#25 与提交说明里。
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
| 8 | configSchema → 表单完整渲染 | P4 | P5（P6 收口） | schemastery 纯定义落盘 + 归一面板递归表单 + 写回服务端真校验；v2.html 随过渡面退役 |
| 9 | 面板 React tab registry 化 | P4 | P5→P6 | 过渡 tab 与 `/v2/ui` 已退役（`9bd52ba`），registry 管理区并入唯一 toolkit-panel |
| 10 | 面板归一与过渡面退役（用户 2026-09-19 权威修正） | P6 | P6 | 归一笔 `c4a1762` + 退役笔 `9bd52ba`；浏览器级命门验收通过；单 tab 断言 `registrations==1` 锁死。**"面板作为本桶唯一管理入口"= 用户明确要求，长期有效** |
| 11b | 审计事件名手工拼装（原 #11 的 (b) 半项） | P7 | 并入 C-1 | 用户 2026-09-20 裁定：**不单独修，并入契约 v1.1**（`audit:*` 入 `CONTRACT_EVENT_NAMES` 枚举，顺带收编三处转发表） |
| 12 | **cordis 符合度复核 Pack A**：install 幻影条目 / fiber UNLOADING 误报 / 编号无显式守卫 | 2026-09-21 复核 | 同批 | A1 事务顺序改「写内存→落盘→发通知」+ `notify()` 兜底捕获 + 回滚补 `persist(null,id)`（旧实现两条失败路径都会留分裂态）；A2 轮询补 UNLOADING 分支，错误码入契约 `FIBER_LOAD_ERROR_CODES`（四码）；A3 新增 `test/cordis-fiber-state.test.mjs`，真 cordis 实测五个终态数值与 `registry` 导出的 `FIBER_*` 对账 |
| 13 | **Pack B2**：`normalizePlugin` 选中 `default` 时丢掉模块级 `inject`/`name` | 2026-09-21 复核 | 同批 | 保守合并（补 default 所缺、不覆盖已有；函数/类的 `name` 视为 JS 推断名可被模块级声明取代）。真实代价不是显示名，而是 **cordis 读不到 `plugin.inject` ⇒ 依赖门控静默失效**。宿主装载器未安装，如实标注为"保守近似" |
| 14 | **Pack C**：`${prefix}/doctor` 在面板装配路径下从未进容器 | 2026-09-21 复核 | 同批 | `registry-host.mjs` 补 `host.provideService(doctor.serviceName, doctor)`，注册现场仍在面板（REQ-8 唯一装配点），回收靠 cordis fiber 归属。`test/toolkit-services.test.mjs` 4 例，含"双实例挂同一根 ctx 不撞名"。doctor 仓源码未动 |
| 15 | **Pack D**：活动 SSE 流不受面板卸载管辖 | 2026-09-21 复核 | 同批 | `v2-api.mjs` 加 `liveStreams` 登记表 + `closeAllStreams()`（每条 teardown 单次幂等），挂进 `panel/index.js` 既有 `ctx.effect` 卸载链。旧行为：面板拆完仍留一个每 15s 往死面板写 ping、且永不结束的流。`test/panel-sse-dispose.test.mjs` 5 例，已验证非空洞 |
| 16 | **Pack E**：inject 正向语义零覆盖 + peer 范围放行未校准 cordis | 2026-09-21 复核 | 同批 | `test/cordis-inject-lifecycle.test.mjs` 5 例（正向装配/撤依赖/再激活/两套真相分歧/全局互斥限制）；`peerDependencies` 收 `>=4.0.0-rc <5` → `^4.0.2`，新守卫断言 4.0.0/4.0.1/*-rc 均不放行。已核与 D-1 预发版偏差无冲突 |
| 17 | **Pack F1**：`hasService` 直读 cordis 代理 ⇒ 与 `Object.prototype` 同名的服务名一律误报"在场"（D-6） | 2026-09-21 复核（D-6） | Pack F1 | 改 `ctx.get(name, false)`：`ReflectService.get` 只查 isolate 映射与 store（两者都是 `Object.create(null)`），未命中直接 `return undefined` 不抛错（cordis 4.0.2 `src/reflect.ts:233-243` 实读）。新增 `test/host-has-service.test.mjs` 5 例（真 cordis、与 `registry-host.mjs` 同构装配）：三枚钉子（原型名未注册 false／真服务 true／缺失不抛错）+ 唯一翻面形态收口（真以 `toString` 注册服务时 true 才是正解）+ 回收面（提供方 fiber 拆掉后回 false）。头注由"如实陈述直读"改为"为什么不再直读"。变异式自检：dist 摘回旧直读 ⇒ 仅钉子一精确翻红。提交 `b399623` |
| 18 | **Pack F3**：装入成功后 `lastError` 不清，面板同屏"运行中"+"最近错误"（D-8） | 2026-09-21 复核（D-8） | Pack F3 | 修在**状态源唯一一处**：`setStatus` 转 `active` 时 `delete entry.lastError`（连带唯一时间字段 `at`）。五条到 ACTIVE 的路径（install / autoload 恢复 / setEnabled / reload / 自动重试）全部经过它，面板与 `/v2/snapshot` 都是读取方不各自缓存 ⇒ 一处修完三面同步。口径取"直接清空当前状态字段"而非 D-8 原建议的 `lastRecoveredError` 降级方案：历史已由 REQ-10 审计 JSONL 承载，再加字段是重复记账。autoload 恢复成功补一次 `persist`（否则磁盘留"盘上有、内存无"的陈旧记录）。新增 `test/registry-last-error.test.mjs` 6 例（含防过度修复一条：仍停 error 态时 `lastError` 与 `at` 必须在）。提交 `57ebc24` |
| 19 | **Pack F2**：装载器入口解析与 manifest 声明位置错位——只读顶层 `exports`，而正典在 `requirements.exports`（D-7） | 2026-09-21 裁定第 1 案 | Pack F2 | 三级解析：`requirements.exports["."]`（正典；`{"$from":"package.json#exports"}` 按继承语义换成 package.json 的表）→ 顶层 `exports["."]`（legacy 兼容，命中必 warn；与正典并存时正典赢并点名被忽略的那一份）→ `package.json` 的 `exports["."]`/`main`（T0/G1 既有层）→ `index.js`/`index.mjs` 目录惯例。**显式声明指向不存在的文件一律 entry-not-found 不回退**（回退即掩盖不同步）。告警经 `ResolvedPlugin.entryWarnings` 带出，由 registry 在 install/autoload 两路经 A1 同款 `log.warn` 落盘；来源随 `entrySource` 可观测。5 个内置 manifest 一字未改。新增 `test/loader-entry-resolution.test.mjs` 14 例 + 4 套带 DECOY 哨兵的夹具；摘实现变异三发（摘正典 ⇒ 8 红、摘 legacy ⇒ 2 红、改成静默回退 ⇒ 1 红）。提交 `23de06a` |
| 20 | **Pack H1**：`toolkitRoot` 随宿主启动目录漂移 + 两种落盘失效模式（D-11） | 交叉验证轮《D-11 追加》 | 同批 | 推导收敛到唯一函数 `panel/manager/toolkit-root.mjs`（**显式 config > 模块位置**，禁读 `process.cwd()`），面板把已 resolve 的值传下去。**失效模式①**（落点连目录都建不出来）：审计 sink 装配期那句无保护 `mkdirSync` 改为降级返回 `{ok:false,error,advice}`——修复前它会一路炸穿 `createToolkitServices` → 面板 `apply()`，**整个管理面板装不上**；状态面同样在装配期自查落点、不 ok 也不抛。**失效模式②**（写得进内存写不进磁盘）：`persist` 的 catch 除日志（带 statePath）外新增 `stateSaveStatus()` + 契约第 8 个审计事件 `audit:state-save-failed`，`/v2/snapshot` 带 `durability`、条目带 `persisted`，面板卡片如实标注"未落盘（重启会丢）"。按用户裁定只做最小可见化，**未引入重试**。用例 `test/toolkit-root.test.mjs` 8 例（含子进程换三个 cwd 证 cwd 无关、真实装配路径在 System32 cwd 下仍锚仓根、两种失效模式各一、快照面、事件名孪生表一致）；变异自检 MUT-A/B/C 分别让 ①b / ③③b / ④⑤ 精确翻红。连带把 `panel-sse-dispose` 的订阅数钉法从字面量 12 改为 `5 + AUDIT_EVENTS.length`（新增审计事件不再需要手改，孪生表漂移由新用例兜）。提交 `b59f730` |
| 21 | **Pack H2**：停用预检看不见 provider 引用与声明式依赖、卸载无此类预检（D-14） | 交叉验证轮 D-14 | 同批 | 服务端补齐（客户端协议零变更）：`plugin-registry.mjs` 给每个插件登记 `providers` + `pluginByRowId` / `crossRefNeedles` / `declaredDependents`；`apply-engine.mjs` 新增 `buildCrossRefs`（行 id + provider id 扫文本，再并上**文本里看不见的声明式依赖**；无 patch 行的预设托管插件按包名扫）。停用方向改用它 ⇒ `fetchProvider: local-fetch` / `searchProvider: auto-search` 这类引用终于报得出来；卸载四个 plan 构造器全部带 `crossRefs`、路由下发、卸载弹窗第一拍只出示清单第二拍才执行。**语义未放宽：只告知不阻断**（新用例正面证明带警告的停用照样落盘）。`doctor-signals.json` 一字未动。用例 `test/panel-crossrefs.test.mjs` 7 例（含非空洞证明：同一文本同一行 id 旧口径扫为 0；含漂移守卫：面板表与各 manifest 的 `registers.providers` 逐条一致）。`scripts/p22-verify.mjs` 原有一条把"报告恒为空"当正常态断言（那正是缺陷），改为逐卡写死期望（两张搜索卡必须命中、另两张必须为 0），105 项 → 109 项全绿；p1-smoke 未动。变异自检 MUT-D/E 精确翻红。提交 `36f1be0` |
| 22 | **Pack H3**：B2 与宿主装载器解包语义分叉，实测 7 入口 4 处分歧（D-12 + D-15） | 交叉验证轮《D-12 追加》 | 同批 | 用户裁选项 **3+2**：**根治** = 三个入口把元数据自带到 default（compact-router `static name`；agent-memory 改 `export default { name, apply }`，头注写明为何不用 defineProperty 改函数内建 name，并记下"改成箭头函数即失去 isConstructor 吞返回值"这格前提；web-search-local 的 default 补 `Config`）；**防回归** = `test/dual-channel-parity.test.mjs` 10 例逐入口比对两条通道交给 cordis 的 `name/inject/Config` 三元组（官方 `unwrapExports` 副本逐字抄自 1.0.3，真 loader 在场时反向复核副本，缺席即 skip）。B2 保守合并保留兜第三方形态，头注按实测改写并记录它**就地改写插件对象**的副作用。**行为收紧（已写进 CHANGELOG）**：宿主通道从此对 web-search-local 做 Standard Schema 校验（本机真配置实测 0 issue；历史坏值从"静默放行"变"明确报错"），compact-router / agent-memory 的宿主侧 fiber 名固定为声明名（影响面仅日志器名/服务撞名文案/宿主调试视图，本仓键控一律按 `manifest.id` 不受影响）。D-15：维持面板不可经 registry 通道自举，`plugin-shape-invalid` 文案改为点名真实成因（缺非空 `contract` 字段 vs 目录无 manifest）+ 被拿去当 id 的包名 + 两条修法，用例钉住。变异自检 MUT-F（摘 static name）三条精确翻红。提交 `e80caea`。**【H5 纠错 · 本行原话有一处错账】**原文"本机真配置实测 0 issue"不成立：全仓没有任何用例或脚本把真实 patch 行喂进该 schema（`dual-channel-parity` 只比 `name/inject/Config` 三元组的在场与形状；`validateConfigAgainstSchema` 只服务 registry 的 `setConfig`/安装预检，而内置插件是宿主 patch 行挂进来的、从来不经这条路），那一轮留在沙箱的探针 `dual-channel-probe.mjs` 对 `engines`/`validate`/`config` 零命中。⇒ 该结论只能是**逻辑验证被当成端到端装载验证**记录，盲区两层叠加才让坏值活到今天：**①没解析 YAML（`360` 在 YAML flow 序列里是整数）、②没经宿主通道**。**防再犯口径（写死在这里）**：凡"启用或收紧配置校验"的改动，验收必须包含"把宿主真实加载的那份声明文件、按宿主的解析方式、喂进新启用的校验器"这一步；只做 schema 层逻辑推演不得记为"实测 0 issue"。 |
| 23 | **Pack H4**：`retryAttempts` 跨段结转（D-9）、夹具 marker 跨文件互抢（D-10）、陈旧快照可能被当恢复基线（D-13） | 复核期与交叉验证轮 | 同批 | **D-9**：`setStatus` 转 ACTIVE 即归零（与 D-8 同走状态源）+ 只读诊断面 `retryAttemptsOf(id)`；**如实收窄**——现存的每段入口都会先经 `unloadEntry` 清零，D-9 原文担心的"更早隔离"实际暴露面比预期窄，收益是不变式与文案口径正确（变异结果与这条一起记在测试文件文末）。**D-10**：`contract-plugin` 的 marker 改为**调用时解析 + `process.env.FIXTURE_MARKER` 可覆盖**，五个使用方各持 pid 专属路径并退出即清；把仓内那枚 gitignore 的运行产物 marker 从原位挪走后全量 `npm test` 293/293 绿 ⇒ 使用方自带开关，同时消掉"干净克隆重即失红"的暗雷。**收尾核销（H5 轮，2026-09-21）**：复查确认自动化面已**零消费**旧路径——五个使用方（registry / panel-v2 / panel-unified / audit-sink / p7-embed）都在文件顶部把 `process.env.FIXTURE_MARKER` 指到自己 pid 专属的 tmpdir，`toolkit-root.test.mjs` 换 cwd 的子进程用的是恒成功的 `save-probe-plugin`（不吃 marker），`.panel-backups/` 里那份 G 轮脚本读的是 `last-error-plugin` 的另一枚（同名不同夹具），门禁 4/4 在旧路径缺失下再次复现通过 ⇒ 仓内 `contract-plugin/marker.flag` 判定为**孤儿**，连同其 `/tmp/stale-marker-backup.flag` 备份一并清除；夹具头注仍保留该路径作**人工翻牌缺省**（非自动消费点），行为语义一字未改。**D-13**：沙箱三份陈旧快照立警示 `D:\dsh-test-sandbox\docs\warn-stale-config-snapshots.md`（README 加指针；快照不删不改不重生成）。提交 `8914d9b` |
| 24 | **Pack H5 真机复验 + 一处配置数据修复（宿主整机启动故障）** | H5 真机（用户批准重启） | 同批 | **复验三项全 PASS**：① 宿主进程 `process.cwd()` 实测 `C:\Windows\system32`（旧公式 `resolve(cwd,"..")` 的命中场景），而 state/audit 两面都锚在 `D:\dsh-plugins\dsh-toolkit\.registry`，`/v2/snapshot` 带 `durability` 字段（旧码没有该字段 ⇒ 兼作"H1 新码在场"的判别物），7 处漂移点/公式变体/对照位复扫**零新文件**，探针装卸两次在 `audit.jsonl` 留下 4 条流水、`state.json` 与 `plugins:[]` 逐条相符；② 容器面直读（临时探针插件，只读 `ctx.registry`，验完即卸）：`compact-router` 入口级 2 条（宿主两个 agent 预设各挂一份 compaction 行）fiber 名全为声明名、`agent-memory-runtime` 的 `callback.name` 仍是 `register` 而 fiber 名已是声明名 ⇒ **H3 根治在真宿主翻面成功**，旧名 `RouterCompactionEngine`/`register` 在场 **0 条**，五个内置插件归属链全部在宿主 patch 通道（无一条挂 `toolkit-manager` 之下）；③ `web-search-local` 入口级 fiber `Config` + `~standard` 在场、state=ACTIVE。**故障与修复**：真机首次重启即整机起不来（exit 1），根因 `cordis.patch.yml:61` 的 `engines` 第 8 项 `360` 未加引号 ⇒ YAML 给整数 ⇒ H3 起宿主通道真校验 ⇒ `ValidationError` 经 loader 冒到 `dsh-app-boot` 顶层 ⇒ **面板与所有插件一起不起来**；按用户裁决加引号修复（`ce0b0b81…`/3097 B → `bb7af96f…`/3099 B，git diff 单行、CRLF 保持、改前改后 sha 留档），同文件其余 4 个 config 块（含 `rate-throttle` 的嵌套 `routing`/`staticGroups`）逐值目检**无第二处同类**（`defaultWorkspace: null` 经消费点核实为有意 null 且该插件不带 Config ⇒ 不经 schema）。**基线滚存**：`p24-verify.mjs` / `p24-ui-matrix.mjs` 两处硬闸期望值随数据修复同步滚到 `bb7af96f…`，**守卫机制一字未放宽**（仍是启动取 sha、收尾再取一次比对是否被改写），成因写入常量上方注释；历史证据文档里的 `ce0b0b81…` 记载**保留不改**（那是各轮当时的真实读数）。**如实边界三条**：① 坏值时代 `360` 引擎其实**一直在工作**（`lib/web-search-local/index.js:1050` 有 `String(name)` 兜底并明文注明 YAML 会送数字进来），本次不是修坏引擎；② 我第一轮把宿主消失误判为"脱管拉起方式"，第 2 轮走已注册计划任务仍死、第 3 轮前台抓 stderr 才定因，误判过程记在证据 §二；③ 取证脚本自身第一轮断言口径过宽（把插件自己 spawn 的子 fiber 当入口级要求 Config 在场）造成一条假红，修正后复跑 12/12，两轮原始 JSON 都留档不删。证据正本 `panel/docs/evidence/H-REAL-HOST-REVERIFY.md` |
| 25 | **Pack I：patch 配置门禁校验（D-16）+ 安全网与历史脚本处置（D-17）+ 引擎池 8→6（用户指令）** | Pack I（用户合并指令包） | 同批（三笔提交：I1 / I2 / 引擎清理） | **I1** 新增 `scripts/patch-config-check.mjs` 并接进 `ci-local`（现为 5 步）：解析 `cordis.patch.yml` → 每行按宿主通道语义（`import(name)` → 官方 `unwrapExports` 副本 → `Config['~standard'].validate`）校验 config，无 Config 的入口**如实跳过并打印理由**（与 cordis `if (!runtime.Config) return config` 一致），认不出模块且有 config 的行**判红**（逼人来加 `HOST_ROW_MODULES` 表，不做静默放过）。现状：7 行里 2 行真校验（`web` ⇒ `@deepseek-ai/dsh-web`、`web-search-local`）、5 行如实跳过。**为什么不能复用面板解析器**：`parseRootRows` 把值一律当字符串 ⇒ 会把 `360` 读成 `'360'`，安全网直接失效，所以自带 YAML 子集解析器（核心 schema 标量 + flow/块序列 + 嵌套映射；锚点/别名/块标量/多文档/`on`、`off`、`y`、`n` 这类歧义写法/下划线数字一律抛错），并用 `selfcheckCases()` 20 条断言**每次门禁都复验一遍解析器**（解析器退化 ⇒ 判"本校验器不可信"而非安静通过）。**I2** `restore-cordis-baseline.mjs` 显式退役（理由两条写在头注：重建公式早不自洽、"钉死某一枚 sha"的概念已被滚存判据取代 ⇒ 现行恢复动作 = `git checkout HEAD -- cordis.patch.yml`）；三个 `terminal-acceptance-*.mjs` 判历史冻结（加时点与原因头注 + 横幅，不删），其中 report 那支查实**会覆写已登记 sha 的证据正本** ⇒ 加了 `process.exit(2)` 硬闸并同步更正 `evidence/README` 里"可重放"的表述、把它作为 **D-2 同族第二处**记进 D-2。**引擎清理**：`cordis.patch.yml:61` 删 `sogou` 与 `'360'`，**引擎池 8 → 6**（`searxng, google, duckduckgo, mojeek, bing, baidu`）；判据基准第 2 次滚存 `bb7af96f…`(3099 B) → **`e8051fe9…`(3085 B)**，p24 两处硬闸期望值同步（机制未放宽，注释记两次滚存来路）。`test/s6-contract-migration.test.mjs` 的手抄镜像同步为 6 项，并新增 **S6-C4** 对账断言（改 patch 忘改镜像即红；MUT-H 实证非空洞：只把镜像改回含 sogou ⇒ 1 条精确翻红，还原 ⇒ 4/4）。**如实边界四条**：① `lib/web-search-local` 的实现、`ENGINES` 注册表、`ENGINE_LAYERS.cn` 与 `defaultConfig().engines` **本轮按指令不动** ⇒ 在**没有该 patch 行覆盖**的宿主上默认仍含 sogou/360，且 `requestedEngines` 只查 `ENGINES` 不查 `cfg.engines` ⇒ **显式指名 `engine:'360'` 仍能命中实现**（配置面删除只关掉"自动链会用它们"）；② 生效层是"默认 → patch 行 → settings 节"，**settings 层已按补充指令只读核查为不存在**（见本节末《settings 层核查（补充轮）》）⇒ 本次删除没有覆盖层，下次重启完全生效；③ 宿主 `~/.dsh/dsh-search-router.json` 按授权**只读**核对：159 B、只有 mode/officialProviders/patterns/defaultWhenUnknown，**无引擎条目可清**、无越界；④ `.registry/state.json` 与 `audit.jsonl` 零命中引擎名（历史面按纪律只查不删）。**残留扫描分类**：配置面已清 1 处（patch:61）；历史面保留并逐处列名——仓内 `CHANGELOG`/本文件 D-13/`H-REAL-HOST-REVERIFY.md`/`P24-BATCH1-SOFT-ROUNDTRIP-FORENSICS.md`/`Q2-LAYER-SCAN.txt`；沙箱侧 40 个文件命中，其中非归档/备份目录的 12 个全是带日期的审计报告、评审文档、会话计划文件与 `docs\warn-stale-config-snapshots.md` 本身，另**新查得第四份同族快照** `configs\baseline-before-switch.yml`（09-14 13:10、无 toolkit-manager 行、写的是上游旧包名、块序列里同样有裸 `- 360`）⇒ 已补登警示，快照本身不删不改 |

---

## B. 显式遗留（裁定不做 / 维持现状，附触发条件）

### B-1 · 双实例共享待确认 plan 池（原 #11(a)）
`panel/manager/apply-engine.mjs` 的 `PLAN_STORE` 仍是模块级 `Map` ⇒ 同进程多实例共用一个待确认 plan 池。

- **过程记录**：P7 期间曾改为 `createPlanStore()` 按实例持有，实测连带 **7 项回归红**——
  `manager/uninstall.mjs` 的 10 个 plan/execute 函数与 6 个验收脚本（p21/p22/p23/p24-verify、
  p24-ui-matrix、backup-write-test）都以 `putPlan/getPlan/dropPlan` 三个模块函数为契约，改签名即动
  P2.4 深度生命周期资产全链。改造已**完整撤回**（`apply-engine.mjs` 回到 HEAD 逐字节一致）。
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

**范围（六项，缺一即不算完成）**：

1. **新增 `provides` 字段**：`provides: { services?: string[], commands?: string[], providers?: string[] }`
   —— 补上契约缺口（现状只有 `requires.services` = **依赖**的服务，没有"本插件**注册**了什么"的表达）。
2. **`audit:*` 纳入契约事件枚举**：`CONTRACT_EVENT_NAMES` 增补 7 类审计事件（或引入
   `AUDIT_EVENT_NAMES` + 统一 `contractAuditEventName(prefix, event)` 拼装函数），
   **收编** `registry/src/registry.ts:266` 的手工模板串；同步三处消费方：
   `panel/manager/v2-api.mjs` 的 SSE 短名转发表、`panel/client/index.js` 的 `V2_EVENT_NAMES`、
   SSE `hello` 帧与 `event:` 行命名。
3. **`KNOWN_LEGACY_FIELDS` 收紧为 error**：前置条件是第 1 项已落地且 `extractRegisters`
   （`registry/src/loader.ts:31`）改为**优先读 `provides`**、旧 `requirements.registers.*` 退化为 info；
   并先做一次 legacy 字段引用审计（面板 `plugin-registry.mjs` / `snapshot.mjs` 仍读旧字段，见
   `docs/migration.md` §4 三个前置条件）。
4. **5 个内置插件补 `provides`**：`lib/{rate-throttle,compact-router,agent-memory,search-router,web-search-local}/dsh.plugin.json`
   把各自注册的服务/命令/提供者显式写入，使 `reg.name-collision` 冲突检查覆盖到它们。
5. **两仓同批**：toolkit（contract + registry loader + doctor 规则）与 doctor 独立仓
   （`src/engine.mjs` 的 `MANIFEST_TOP_KEYS` 白名单需加 `provides`；参照 `requires`/`panels` 的
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

---

## D. 待办（零散改进，不阻塞关闭）

| # | 待办 | 裁定方 / 备注 |
|---|---|---|
| D-1 | **审计历史浏览 UI**：面板内查看 `audit.jsonl`（需新增只读路由 + 列表渲染）。数据已落盘、路径经 `/v2/snapshot.auditFile` 可查 | 用户 2026-09-20 裁定：不做，记待办 |
| D-2 | **`scripts/p23-shadow-scan.mjs` 覆写历史证据文件**：每次运行都会改写 `panel/docs/evidence/P23-SHADOW-SCAN.txt` 的生成时刻与 `~/.dsh/settings.yaml` 指纹（P2.3 的 09-18 快照本轮被覆写后已 `git checkout` 还原）。建议改为写带时间戳的新文件，遵守证据目录"只增不改"硬约定 | 工程侧发现并记录；用户裁定记待办不阻塞。**同族第二处（2026-09-21 Pack I 查实）**：`scripts/terminal-acceptance-report.mjs` 重跑会把新报告写回已入库、已登记 sha 的 `panel/docs/evidence/TERMINAL-ACCEPTANCE-ROUND10.txt`（摘闸实证会产出 10862 B 的今日版本，时刻与 `cordis.patch.yml` 指纹全变）——该脚本已整体冻结并加 `process.exit(2)` 硬闸，不再依赖人自觉；本条 (D-2) 对 p23-shadow-scan 的原始诉求**仍未修**，照旧挂着 |
| D-3 | **`scripts/regression-all.mjs` 清单补漏**：不含 `p23-verify` 与 `p23-shadow-scan`（本轮改面板文案时 p23 的源码断言就静默漏过一次，靠人工补跑发现）。`ci-local.mjs --with-scan` 已临时覆盖 p23-verify；建议把两项并入 `regression-all` 本体 | 同上 |
| D-4 | **冒烟最后一项待用户人工补验**：宿主会话内一次**真实联网搜索**（验证 web-search-local 在真实 agent 调用链里工作）。本侧已验：宿主重启后 mounted 状态、真实公网探针 `runSearch()` 12 源/1.2s、`fetchUrl()` 200/45795B；未验的那一口需要用户会话凭据（宿主 `/api/web/search` 未认证返回 401，本侧不取用） | 用户侧动作；如实登记于 CHANGELOG P8 终版条目。**2026-09-21 Pack G 再尝试仍未关闭**：宿主 `/api/web/{search,providers}` 从 127.0.0.1 直连一律 401（面板的 loopback 放行分支不适用）；本机浏览器打开 `127.0.0.1:3080` 得 `dsh web authentication required`（且重启后访问 URL/token 已轮换）。本轮未取用、也未尝试获取用户凭据（红线）。 其余八项已在真宿主取证，见 `panel/docs/evidence/G-REAL-HOST-SMOKE.md` §三。**2026-09-21 13:48 补验通过并关闭**：用户在宿主会话内亲自完成真实联网搜索，取数得 **7 次 `web_search` 调用、7 次 `isError=false`、合计 47 条来源链接**（单条 3.4–10.5s），归因到 web-search-local 有三重证据（search-router 路由判 local、`lib/web-search-local/index.js:1280-1291` 的输出指纹在会话正本命中 5 次、G1③ 已证 5/5 mounted）。证据正本 `panel/docs/evidence/D4-WEB-SEARCH-HOST-EVIDENCE.md`（含逐条数据表、口径澄清、以及取证脚本自身两个缺陷的如实记录：只按 `tool/call` 取名会漏 `run_code` 内经 `tool/ptc-dispatch` 派发的调用；zstd 会话正本须逐帧解压）；G 侧以文末《补验注记 · 第⑨项》收口（只增不改）⇒ **G1 九项全部闭环** |
| D-5 | **R13 长期盯防**：装入判定依赖 cordis 4.0.2 的 fiber 内部行为（`FIBER_ACTIVE=2/FAILED=3/DISPOSED=4` 等）。**任何 cordis 升级必须重跑 S1/S4 场景**；依赖已写入 `registry/src/registry.ts` 头注与 `docs/contract.md` §7 D-5 | 工程侧长期纪律。**2026-09-21 复核：R13 本体维持已裁决不动，但当时新登记的三条衍生风险已全部收敛**——① 编号无显式守卫 → A3 数值对账用例；② 轮询漏 UNLOADING → A2 补分支并区分错误码；③ peer 范围过宽放行未校准版本 → E2 收到 `^4.0.2` 并加范围守卫。**仍按 D-5 纪律执行**（守卫只保证漂移会红，不代替人跑 S1/S4） |
| D-6 | **`hasService` 直读代理有原型链误判**：`registry/src/host.ts` 的 `hasService` 读 `ctx[name]`，而 cordis 代理的 get 陷阱先走 `Reflect.has(target, prop)`（沿原型链）——实测 `hasService('toString'/'constructor'/'valueOf'/'hasOwnProperty'/'__proto__')` 全为 **true**。影响面：`precheck.ts` 的 `service-missing` 阻断与 doctor `requires/services` 规则会把这类名字误判为"服务在场"，从而放过一个真缺依赖的插件。改 `ctx.get(name, false)` 可闭合（只查 isolate/store，不碰原型链），但属行为变更 | 2026-09-21 复核发现。**按当轮 A4 指令"发现真实边界风险即停下待裁"，未动实现**，**已关闭（2026-09-21 Pack F1，提交 `b399623`）**：用户裁定改用 `ctx.get(name, false)`，详见 A #17。 |
| D-7 | **`exports` 字段位置三方冲突（内置插件目录路径装载）**：`loader.ts` 只读**顶层** `manifest['exports']`，但 5 个内置插件的 `dsh.plugin.json` 全把它写在 `requirements.exports` 下。四个因为有 `index.js` 兜底所以"看着正常"，`lib/agent-memory` 没有 index.js ⇒ **按目录路径装不进来**（`entry-not-found`），只能装 `lib/agent-memory/plugin.js`。指定修法"提到顶层"与两处既定事实硬冲突：(a) doctor 独立仓 `MANIFEST_TOP_KEYS` 不含 `exports`，一提就产 error ⇒ **打破 0/0/0 红线**，必须改 doctor 仓；(b) 本仓契约把顶层 `exports` 归为 `KNOWN_LEGACY_FIELDS`，而 C-1 第 3 项计划把这些**收紧为 error**，提到顶层是逆着已裁决方向走。第三个选项"loader 双读"被本轮指令明令禁止 | 2026-09-21 复核发现，**Pack B1 因此停手未做**。备选：① 改 doctor 白名单 + 提顶层（两仓同批，且要与 C-1 第 3 项对齐口径）；② 给 `lib/agent-memory` 补 `index.js` 作插件入口；③ 契约 v1.1 里正式定义入口声明字段并一次迁清。裁定方：待用户。**已关闭（2026-09-21 Pack F2，提交 `23de06a`）**：裁定走第 1 案（`requirements.exports` 为正典、三级解析已实现、内置 manifest 一字未改）；完整裁定链、三处交叉验证证据、agent-memory 互斥点与 A/B 判定见本节末《**D-7 追加**》。 |
| D-8 | **装入成功后 `lastError` 不清**：`loadEntry` 只在失败路径写 `entry.lastError`，重试转 ACTIVE 后不回空 ⇒ 面板卡片会同时显示"运行中"和一条历史错误（E1 实测：`status=active` 且 `lastError.code=fiber-load-timeout` 并存）。语义上"最近一次错误"可以辩护为有意保留，但对使用者是误导 | 2026-09-21 复核发现，未修（不在本轮授权清单内）。**已关闭（2026-09-21 Pack F3，提交 `57ebc24`）**：用户裁定"转 ACTIVE 即清空"，未新增 `lastRecoveredError` 字段（历史归审计 JSONL），详见 A #18。 |
| D-9 | **`retryAttempts` 在装入成功后不清零**：`loadEntry` 成功路径不重置计数（只有 `unloadEntry`、`setEnabled(true)`、`reload` 显式清零）⇒ 前一段重试留下的计数会结转进下一段故障，隔离提示里"连续失败 N 次达到上限"这句话在这种情况下不准（真实故障数比报出的少），且更早进 quarantined。默认 `retryLimit: 3` 下最坏情形是第 2 次真实故障就被隔离。Pack F3 施工期发现，**未顺手改**（不在授权清单内，且改法涉及"成功是否等于计数归零"的口径） | 工程侧发现并记录。裁定方：待用户 **已关闭（2026-09-21 Pack H4，提交 `8914d9b`）**：`setStatus` 转 ACTIVE 即 `retryAttempts = 0`（与 D-8 同走状态源）+ 诊断面 `retryAttemptsOf(id)`，用例 `test/registry-retry-count.test.mjs`。**如实收窄**：现存的每段入口路径（`setEnabled(true)` / `reload` / active 态 `setConfig`）本来都会先经 `unloadEntry` 清零，所以原文担心的"第 2 次真故障就被隔离"在现实现里到不了；本笔的收益是计数只有"当段"一个含义（诊断与隔离文案口径正确），不夸大它挡掉的事故。 |
| D-10 | **测试夹具 `marker.flag` 是跨文件共享开关**：`node --test` 的测试文件之间并发跑，`registry.test.mjs` 与 `panel-v2.test.mjs` 都翻 `test/fixtures/registry/contract-plugin/marker.flag` 这一个磁盘文件 ⇒ 任何新用例复用该夹具做"先失败后成功"都会偶发翻红（Pack F3 实测特征：单跑 6/6 绿、全量批跑红一条）。本轮只给 F3 建了私有夹具 `last-error-plugin/`，**没有**动既有两处共享用法。建议：夹具改成"每个用例自带 marker 路径"，或把需要翻开关的文件标为串行 | 工程侧发现并记录；不阻塞关闭 **已关闭（2026-09-21 Pack H4，提交 `8914d9b`）**：`contract-plugin` 的 marker 改为**调用时解析 + `process.env.FIXTURE_MARKER` 覆盖**，五个使用方（registry / panel-v2 / panel-unified / audit-sink / p7-embed）各持 pid 专属路径、退出即清。验证方式：把仓内那枚 gitignore 的运行产物从原位挪走后全量 `npm test` 293/293 绿 ⇒ 既不再互抢，也顺手消掉"干净克隆重即失红"的暗雷。D-9 的新夹具直接不落盘。 |
| D-11 | **`toolkitRoot` 缺省按宿主进程 cwd 推导 ⇒ 状态与审计落点会随启动方式漂移**：`panel/manager/registry-host.mjs:24` 的 `resolve(process.cwd(), "..")` 使 `statePath`/`auditFile` 指到 `<cwd 的上一层>/.registry`。Pack G 实测：同一次冒烟里落点在 `C:\Windows\.registry` 与 `D:\dsh-plugins\.registry` 之间跳过两次（差异只来自拉起 dsh web 时的工作目录）。审计"事后可查"的前提是落点稳定；本轮已把 D 盘那份副作用清除，并把宿主拉回原形态。建议：statePath 锚定到 toolkit 自身安装根（或强制显式配置），别让产品行为依赖启动器 cwd | 工程侧发现并记录。裁定方：待用户。**2026-09-21 交叉验证轮并账**：外部审计报告的 P1 即此条病根，两处推导已逐字定位、两个漂移点按公式复原吻合，并核出**两种更硬的失效模式**（落点建不出来时面板 fail-hard 装不上；写得出现目录但写不进文件时状态静默丢失）——见本节末《D-11 追加》。修复等 Pack H 点名，本轮代码零改动 **已关闭（2026-09-21 Pack H1，提交 `b59f730`）**：推导收敛到 `panel/manager/toolkit-root.mjs`（显式 config > 模块位置，禁读 cwd），面板把已 resolve 的值传下去；两种失效模式全部可见化（sink 不再裸抛、`stateSaveStatus` + `audit:state-save-failed` + `snapshot.durability` + 卡片"未落盘"），按裁定只做最小可见化、未引入重试。落点固定与 H5 真机复验待用户批 **→ 已复验（2026-09-21 H5，A#24 / 证据 `H-REAL-HOST-REVERIFY.md` §四）**：宿主 `process.cwd()` 实测 `C:\Windows\system32`（旧公式命中场景）下两面落点仍锚 `D:\dsh-plugins\dsh-toolkit\.registry`，7 处漂移点/公式变体/对照位零新文件，`durability` 与 `audit.jsonl` 流水实际可查。 |
| D-12 | **B2"保守近似"的前提已经变了**：`registry/src/loader.ts` 的 `mergeNamespaceStatics` 头注写着"宿主装载器 `@deepseek-ai/cordis-plugin-loader` 在本仓未安装，无法逐条对照其解包规则"。Pack G 现场核实：**宿主装了它**（`…/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis-plugin-loader@1.0.3`）。⇒ 下一轮可读该源码把 B2 从"近似"收紧为"对齐宿主"，并决定是否需要把它的解包规则钉成用例 | 工程侧发现并记录。裁定方：待用户。**已兑现（2026-09-21 交叉验证轮）**：完整解包链已逐字对照、7 个入口双通道实测完毕，结论与修法选项见本节末《D-12 追加》。**代码一字未动，修复等 Pack H 点名** **已关闭（2026-09-21 Pack H3，提交 `e80caea`）**：用户裁选项 3+2 —— 三个入口自带元数据（根治）+ `test/dual-channel-parity.test.mjs` 逐入口对账两通道的 `name/inject/Config`（防回归，真 loader 在场时反向复核副本、缺席即 skip）。B2 保留兜第三方形态，头注按实测改写并记录其就地改写插件对象的副作用。差异表全文留在本节末《D-12 追加》。 |
| D-13 | **沙箱侧配置快照整份滞后，禁止当恢复基线用**（外部审计报告 P2 并账）：`D:\dsh-test-sandbox\after-switch.yml`（2026-09-14 13:13 `dsh --profile web --dump-config` 产物，**不是本仓任何脚本/测试的输出**，仓内对 `after-switch` 零引用）里 `@local/dsh-toolkit/web-search-local` 行的 engines 写作 `sougou`。核实结果与报告不同：这份快照**忠实记录了当时的真状态**，拼写错误在 09-16 已由本仓自己改对（提交 `37819e9 fix(P2-2): correct Sogou engine key sougou -> sogou`，现行真源 `cordis.patch.yml:61` = `sogou`）。真正的问题不是拼写而是**整份早于面板**：该段止于 `agent-memory-runtime`，**没有 `toolkit-manager` 行**，也早于 Pack A–G 全部改动 ⇒ 当"恢复基线"会退回 7 天前的插行集。同一旧状态另有两份副本：`archive/pluggable-audit/toolkit-copy/cordis.patch.yml`、`_trash_candidates/duplicates/accept-after-restart.yml`（与根文件 MD5 相同 `e5e3d2ab…`）。锚定它的 `docs/reviews/dsh-toolkit-切换窗口-待审核.md:117` 本身就是重生成指令（再 dump 一次即覆盖为现值） | 外部审计报告发现、本仓核实。沙箱非 git 仓，**本轮不删不动**（删除权在用户逐轮任务书）。处置建议：三份标"历史取证快照，禁作恢复基线"，或文件头补一行"dump 于 09-14，早于 P2-2 拼写修复与面板挂载" **已关闭（2026-09-21 Pack H4，提交 `8914d9b`，警示文件在沙箱侧）**：立警示 `D:dsh-test-sandboxdocswarn-stale-config-snapshots.md`（三份副本逐一列名 + 三条事实 + 该怎么做），README 的 `after-switch.yml` 条目加指针。因沙箱规范禁止根目录散建新文件（`*.md` 归 docs/），警示落 docs/ 而非快照同目录，意图不变。**三份快照本身不删、不改、不重生成**。 |
| D-14 | **停用交叉引用预检的覆盖面只有行 id，且不阻断；卸载不做此类预检**（外部审计报告"依赖可预检"一节并账）：`findCrossReferences(text, {rowId, alsoMatch})` 的 needles = 行 id + `alsoMatch`（`panel/manager/apply-engine.mjs:178-181`），HTTP 层确实收 `body.alsoMatch`（`panel/index.js:459`），**但面板客户端只发 `{rowId, enabled}`**（`panel/client/index.js:426`）⇒ UI 路径上 needles 恒等于行 id。最该防的两处引用恰好不是行 id：`cordis.patch.yml:7-8` 的 `searchProvider: auto-search` / `fetchProvider: local-fetch` 引的是 **provider id** ⇒ 恒不命中。且 crossRefs 非空**不阻断**（`apply-engine.mjs:238-239` 自陈"报告非空不自动阻止"）；卸载路径无交叉引用预检（`uninstall.mjs` 内 `findCrossReferences` 零命中，只有 `presetBridgePrecheck` 的备份存在性 fail-closed）。另注：`doctor-signals.json` 与这份检查**没有数据关系**——signals 的消费者是独立仓 doctor CLI（`projects/doctor/src/engine.mjs:1376-1504`，只产 info/warning，绝不 error），本仓 panel/registry 全量 grep 零命中 | 外部审计报告发现（其表述"停用/卸载时会做交叉引用预检"经核实为夸大）、本仓核实。裁定方：待用户。建议 Pack H：为 web-search-local / search-router 预置 `alsoMatch` = 其 provider id（数据源就是 doctor-signals.json），或由服务端从 signals 派生 needles **已关闭（2026-09-21 Pack H2，提交 `36f1be0`）**：服务端补齐 provider 维度（`plugin-registry.mjs` 的 `providers` 表 + `buildCrossRefs`），并补上文本里根本看不见的**声明式依赖**；卸载四个 plan 构造器同口径报告、弹窗两拍确认。**"只告知不阻断"未放宽**（用例正面证明带警告仍能落盘）。未走 signals 派生那条路：signals 的消费者是独立仓 doctor CLI，面板与它解耦更干净，`doctor-signals.json` 一字未动；漂移由新用例的"表 vs manifest 逐条一致"守卫兜住。 |
| D-15 | **manifest 无 `contract` 字段 + 包名带 npm scope ⇒ registry 通道必拒，报错文案指向错位**：`manifestHasContract` 只认非空字符串 `contract`（`registry/dist/loader.js:75-77`），缺字段即落 legacy 合成；合成 id 的规则是"含 `/` 直接沿用包名，否则加 `legacy/` 前缀"（`:336-337`），于是包名 `@local/dsh-toolkit` 原样成为 id，被契约的命名空间式小写规则拒绝（`contract/src/validate.ts:111`，`@` 不合法）⇒ 报 `plugin-shape-invalid: legacy 合成 manifest 校验失败：id 必须是命名空间式小写 id`，而真实缺口是"这份 manifest 没有 contract 字段"。实测现场：本仓 `panel/dsh.plugin.json`（`manifestVersion:1`，**无 contract/id**）经 `resolveLocalSource` 装载即撞这条；宿主 loader 通道对同一目录毫无障碍（它不读 manifest）。⇒ 面板只能经 patch 行装载（与 REQ-8 唯一装配点一致），但任何"无 contract 的 scoped 第三方包目录"经面板装进来都会收到这条误导性文案 | 交叉验证轮实测发现（探针见《D-12 追加》）。裁定方：待用户。建议：legacy 合成对 scoped 包名改产 `legacy/<name>` 或报"缺 contract 字段"，二选一都是一行改动 **已关闭（2026-09-21 Pack H3，提交 `e80caea`）**：维持面板不可经 registry 通道自举（防递归装配，属设计而非缺陷），但文案改为点名真实成因——"缺非空 `contract` 字段" vs "目录本就无 manifest"，并附被拿去当 id 的包名与两条修法；用例在 `test/dual-channel-parity.test.mjs` 末例逐条钉文案。未改 legacy 合成的 id 生成规则（改 id 形态会影响来源记账，收益不抵风险）。 |
| D-16 | **两条装载通道对"配置校验失败"的处理不对称：静态 patch 通道掀整机，registry 动态通道只伤单条目**（H5 真机实测）：宿主 patch 通道里某个插件的 `Config` 校验一失败，`ValidationError` 会经 `cordis-plugin-loader` 的 `Entry._init` 冒到 `dsh-app-boot` 的 `boot()` 顶层并被 rethrow ⇒ **整个宿主进程 exit 1**，面板、其余 4 个内置插件、宿主自带的全部插件一起不可用；而 toolkit 自己的 registry 通道同样撞校验失败时，只把该条目打成 `error`（带 `lastError`、按 `retryLimit` 退避重试、`loadTimeoutMs` 兜超时），其余条目照常运行。**爆炸半径差两个数量级**。 | H5 真机发现（2026-09-21）。**只登记不改**：改不动——顶层 rethrow 是宿主（cordis / dsh-app-boot）行为，红线禁止改宿主。**缓解评估（如实）**：① 唯一可行的侧防是"收紧/启用校验之前，先按宿主的解析方式对真实声明文件跑一次校验"（本轮 A#22 文末的防再犯口径即是此条，本次故障正是漏了它）；② **doctor 安装前预检够不着这一格**——预检覆盖的是经面板安装 API 进来的 source，而本次坏值长在 toolkit 自家 `cordis.patch.yml` 的 patch 行里，宿主启动时直接读，从不经过预检通道；③ 若未来要把校验推广到更多内置入口，应连带考虑"patch 行类型回归闸"（把真实 patch 文件解析后逐条喂 schema 的门禁用例），本轮未建。**裁定方：待用户** **已关闭（2026-09-21 Pack I，A#25）**：兑现"唯一可行侧防"——门禁新增第 5 步 `scripts/patch-config-check.mjs`，按宿主通道语义（真 YAML 标量解析 + `unwrapExports` + `Config['~standard'].validate`）校验 `cordis.patch.yml` 每一行的 config，失败即红且报错点名**文件 + 行号 + 期望类型 + 实际值 + 修法**（正是 H5 评估里 cordis 原文缺的三样）。两条变异自检：还原 `360` 坏值 ⇒ 精确指到 `:61`；解析器自身退化 ⇒ 判"校验器不可信"。**边界如实**：不对称本身（静态通道掀整机 vs 动态通道单条目）仍在，那是宿主（cordis / dsh-app-boot）行为，红线内不改；本步只是**在提交前就拦住**，不让它走到启动。可选加强层（再按 manifest 的 `configSchema` 校验一遍，可覆盖 rate-throttle 等 3 个不带 `Config` 的入口）本轮按任务书口径未做——它明确要求"无 Config 的入口跳过，与 cordis 行为一致"。 |
| D-17 | **恢复工具与三个时点验收脚本仍指已退役基准 `ce0b0b81…`**：`scripts/restore-cordis-baseline.mjs`（`EXPECTED_SHA`/`EXPECTED_SIZE`）与 `scripts/terminal-acceptance-{probe,probe2,report}.mjs` 内嵌 P8 判据基准字面量。核实结果：**恢复工具在本轮配置修复之前就已失效**——它按"当前 HEAD blob + 追加 toolkit-manager 4 行"重建基准，而 HEAD 如今已含那 4 行 ⇒ 重建出 3202 B / sha `3a522a56…` ≠ 期望 3097 B，**fail-closed 直接不写盘**（本轮 dry-run 实测复现，无写盘风险）。三个 `terminal-acceptance-*` 是 P2.2/P8 的**时点取证脚本**，不在 `regression-all` / `ci-local` 清单内，重跑会报 `NO ✗`。 | 工程侧发现并记录（2026-09-21 H5，随 A#24 基线滚存一并核出）。**本轮不动**：它们要证的各是当时的判据，把字面量改成新值等于伪造那些时点的结论；正确处置是重做一份当前时点的恢复工具（若还需要恢复能力）或直接退役。**裁定方：待用户**（重开条件：有人真要再跑基线恢复，或把 P8 时点脚本归档） **已关闭（2026-09-21 Pack I，A#25）**：逐个判处置完毕。`restore-cordis-baseline.mjs` ⇒ **显式退役**（不修）：两条独立理由写进头注——重建公式「HEAD blob + 追加 toolkit-manager 4 行」自 P2.4 把那 4 行提交进 HEAD 起就不自洽（本轮改动前实测复现 3202 B），且"钉死某一枚 sha"已被滚存判据取代，现行恢复动作就是 `git checkout HEAD -- cordis.patch.yml`（`q2-layer-scan` ④ 已在校验"工作区 == HEAD"）；空壳保留而不删，是为了让下一个想恢复 patch 的人当场撞见结论。三个 `terminal-acceptance-*.mjs` ⇒ **历史冻结**（不删）：probe / probe2 只读不写盘，加时点头注 + 运行时横幅（"今天重跑出现 NO ✗ 属预期时点错位"）。**新查实的危害**：`terminal-acceptance-report.mjs` 末尾会把报告写回 `panel/docs/evidence/TERMINAL-ACCEPTANCE-ROUND10.txt`——那是已入库、evidence/README 已登记 sha `49ef62a0…` / 6689 B 的证据正本 ⇒ 仅靠注释拦不住手滑，故加 `process.exit(2)` 硬闸；MUT-C 实证（摘闸 + 输出重定向到仓外）：重跑会产出 10862 B 的今日报告，时刻行、`cordis.patch.yml` 当前 sha、"基准可重建性 ✗" 全变 ⇒ 该覆写是真的。硬闸只拦执行，未改脚本任何取证逻辑与历史结论文本；`evidence/README` 那一行"可重放"的表述已按只增不改的规矩**追加更正**。 |

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
3. **宿主运行时**（`docs/p0-recon.md:44` + 本轮 grep 复核 `node_modules/@deepseek-ai/**` 对 `dsh.plugin.json` 零命中）⇒ 宿主运行时 **不读** `dsh.plugin.json`；`requirements.exports` 的消费者是 doctor 与本仓 loader。它因此是"套件自述的导出表"。

**agent-memory 互斥点（裁 A/B 之前必须先判的那一格）**：`requirements.exports["."]` 是不是"装载入口"？本仓自己的数据给了否定答案。

`lib/agent-memory/dsh.plugin.json` 的声明原文：`"exports": { ".": "./lib/index.js", "./plugin": "./plugin.js" }`。
只读探针实测（`D:/dsh-test-sandbox/var/scratch/pack-f-20260921/f2-entry-probe.mjs`，只 import 判形状、不写安装状态）：

| 插件 | `requirements.exports["."]` | 与目录惯例是否一致 | 正典目标的模块形状 |
|---|---|---|---|
| compact-router | `./index.js` | 一致（记案） | `default.apply` |
| rate-throttle | `./index.js` | 一致（记案） | `named.apply` |
| search-router | `./index.js` | 一致（记案） | `default.apply` |
| web-search-local | `./index.js` | 一致（记案） | `default.apply` |
| **agent-memory** | `./lib/index.js` | 目录下**没有** index.js（旧实现因此 entry-not-found） | **NOT-A-PLUGIN**（104 个命名导出：指令台账/进度文件数据库） |

真插件形态在同表 `"./plugin"` → `plugin.js`，宿主 `cordis.patch.yml:74-75` 挂的也正是 `@local/dsh-toolkit/agent-memory/plugin`。
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
| 面板自己的 toolkitRoot | `panel/index.js:54-56` + `:249` | `resolve(config.toolkitRoot || resolve(panelRoot(), ".."))`，`panelRoot()` 取 `import.meta.url` 的目录 | **源文件位置**（稳定） |
| registry/doctor/审计的 toolkitRoot | `panel/manager/registry-host.mjs:24` | `config.toolkitRoot ? resolve(…) : resolve(process.cwd(), "..")` | **进程 cwd**（随启动方式漂移） |
| 两者为何没接上 | `panel/index.js:281` | `createToolkitServices(ctx, config, logger)` —— 传的是**原始 config**，`:249` 已 resolve 的值没有往下传 | ⇒ 同一进程内两个根并存 |

**缺省值在真实部署里就是生效路径**，不是理论边界：本仓 `cordis.patch.yml:80-82` 的 `toolkit-manager` 行只有 `id` + `name: 'file:///…/panel/index.js'`，**整行没有任何 config** ⇒ `config.toolkitRoot` 恒缺席 ⇒ `:24` 的 cwd 推导当场生效。后果：面板写 patch / 备份 / custody 落在 `D:\dsh-plugins\dsh-toolkit`（`:256` 的 `backupRoot` 亦用稳定根），而 registry 状态与审计流水落在 `<cwd 上一层>\.registry`——**同一次运行、两个根**。

**两个漂移点按公式复原，全部吻合**：`resolve(cwd,"..")` 在 cwd=`C:\Windows\System32`（提权 shell 的缺省起点）时给出 `C:\Windows` ⇒ `C:\Windows\.registry`；在 cwd=`D:\dsh-plugins\dsh-toolkit`（在仓内拉起宿主）时给出 `D:\dsh-plugins` ⇒ `D:\dsh-plugins\.registry`。与 Pack G 记录的两个观测点逐一对上（`panel/docs/evidence/G-REAL-HOST-SMOKE.md:226-231`）。今天现场：`C:\Windows\.registry` 存在且**递归 0 文件**（`dir /a` 已核，目录时刻 09-21 07:43:18），`D:\dsh-plugins\.registry` 已不存在，`C:\.registry` / `C:\Users\.registry` / `C:\Users\LENOVO\.registry` / `C:\Windows\System32\.registry` / 仓内 `.registry` 均不存在 ⇒ 与"当前实例仍按 cwd 推导、且这一实例没经面板装过插件"一致。

**本轮新发现的两种失效模式**（D-11 原文只写了"落点漂移"，比这更严重）：

1. **落点连目录都建不出来时，面板整个装不上**（fail-hard）。审计 sink 在装配期**无条件** `mkdirSync(dirname(file), { recursive: true })`（`panel/manager/audit-sink.mjs:34`，由 `registry-host.mjs:100-104` 在 `hasEvents && auditLog!==false` 时调用），这一句**没有 try/catch** ⇒ 异常穿出 `createToolkitServices` ⇒ 穿出面板 `apply()` ⇒ cordis fiber 载入失败 ⇒ 唯一管理入口没了。落点由启动器 cwd 决定，等于把面板可用性挂在启动方式上。
2. **落点建得出来但写不进去时，状态静默丢失**（fail-silent）。`persist()` 把 `saveState` 包在 try/catch 里，失败只 `log.error('状态落盘失败', … errorCode:'state-save-failed')`（`registry/src/registry.ts:323-329`；`state.ts:34-42` 自身不吞错）⇒ 面板照常显示 `active`，重启后条目全丢。同一条路径推导同时具备"过度失败"和"不足失败"两端。

**修法（采纳报告建议，并补一条降级）**：① `panel/index.js:281` 把已 resolve 的 `toolkitRoot` 传进 `createToolkitServices`（或在 `registry-host.mjs` 内以 `import.meta.url` 锚定仓根），使两半归一个根；② audit sink 的装配期 mkdir 加降级（建不出来就 warn + 禁用 sink，绝不让面板装不上）。修复等 Pack H 点名，**本轮代码零改动**。

**如实边界**：`C:\Windows\.registry` 为空，**无法事后区分**"从未写过"与"写失败被模式 2 吞掉"——宿主 console 日志不落盘（`C:\Users\LENOVO\.dsh\logs` 下只有 `llm-requests.jsonl`，grep `state-save-failed` / `audit sink 写入失败` 零命中），且 3080 全部路由匿名 401（本侧不取凭据），当前实例挂载集无法运行时取证。ACL 只读取到 `BUILTIN\Users:(I)(RX)`（无写位）而该目录确被建出 ⇒ 建目录的那次启动是提权的，与"cwd=System32"互证。

---

### D-12 追加 · 交叉验证轮：B2 与官方 loader 的完整对照（2026-09-21，只报不修）

**装载器现场（先纠正一处措辞）**：`@deepseek-ai/cordis-plugin-loader` **1.0.3**，物理两份——`C:\Users\LENOVO\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\cordis-plugin-loader`（全局 CLI `@deepseek-ai/dsh@0.1.5-rc.1` 的**嵌套依赖**，声明在 `…\dsh\package.json:37`）与 `D:\dsh-plugins\dsh-web-search-local\node_modules\…`（旧独立插件自带）；`C:\Users\LENOVO\.dsh\profiles\node_modules\@deepseek-ai\cordis-plugin-loader` 是指向前者的符号链。它**不是顶层全局包**，报告"全局安装"的说法会让人找不到。cordis 本体各处均为 **4.0.2**，无版本分裂。⇒ B2 头注"`registry/src/loader.ts:305-308` 本仓未安装、无法逐条对照"的前提确实已失效。

**官方解包链（读完整，不止报告引的那 5 行）**：`unwrapExports(exports)`（`lib/index.js:745-751`，等价 TS 源 `src/index.ts:191-199`）是**纯替换两跳**：`exports = exports.default ?? exports` → 若结果带 `__esModule` 再 `.default ?? exports`（注释链到 esbuild default-interop issue）。调用点两处（`:466` 热重载、`:522` 首次 `_init`），产物直接交给 `:537` 的 `ctx.registry.plugin(plugin, this.options.config, …)`。**命名导出上的元数据不在 loader 层处理**——loader 只负责"选出对象"。配置层另有一条独立通道：`EntryOptions.inject`（`lib/types/config/entry.d.ts`），由 `:709` 的 `Inject.resolve(fiber.entry.options.inject, fiber.inject)` 合进 fiber ⇒ 宿主可以用 YAML 行的 `inject:` 声明依赖，而 **toolkit 的 patch 行一条都没用**（全凭模块自带）。

**cordis 4.0.2 的取值口径**（`node_modules/@deepseek-ai/cordis/lib/index.js:1622-1634`，逐字）：`runtime.name = plugin.name`（`name === "apply"` 时置空）、`runtime.Config = plugin.Config`、`fiber.inject = Inject.resolve(plugin.inject)`；配置校验 `if (!runtime.Config) return config; runtime.Config["~standard"].validate(config)`（`:956-957`）。⇒ 一切元数据必须**长在交给 cordis 的那个对象上**，B2 的动机成立。

**双通道实测**（探针 `D:\dsh-test-sandbox\var\scratch\xval-audit-20260921\dual-channel-probe.mjs`：H 通道调**真** loader 的 `unwrapExports`，R 通道调**真** `resolveLocalSource`，同一入口各跑一次，再按上面口径打印 cordis 会看到什么；只 import 判形状，不写任何安装状态）：

| 入口 | H（宿主 loader） | R（registry + B2） | 判定 |
|---|---|---|---|
| 桶根 `index.js` | `dsh-toolkit` / `['webServer']` / 无 Config | 同 | 一致 |
| rate-throttle | `rate-throttle` / `['llm','tokenMeter']` / 无 | 同 | 一致（无 default，两通道都取命名空间） |
| search-router | `search-router` / `['web']` / 无 | 同 | 一致（default 自带 name+inject，纯替换无损） |
| **compact-router** | 名 **`RouterCompactionEngine`** / 四项 inject 齐 | 名 **`compact-router`** / 四项 inject 齐 | **分叉（仅名字）**：`lib/compact-router/index.js:43` 的模块级 `export const name` 被 B2 覆盖到 `:485` 的 default 类上（类静态 `:157` inject 两通道都保住） |
| **web-search-local** | 名/inject 正常，**`Config` 丢失** | 名/inject 正常，**`Config` 在场** | **分叉（行为级）**：`:123` 的模块级 `Config`（`@deepseek-ai/schemastery`，实测 `~standard.validate` 可用）不在 `:1422` 的 default 对象上 ⇒ H 通道 cordis 直接 `return config` 跳过校验，R 通道会校验 ⇒ 同一份坏 config 一边报错一边放行 |
| **agent-memory `plugin.js`** | 名 **`register`** | 名 **`agent-memory-runtime`** | **分叉（仅名字）**：default 是 `:105` 的函数声明，JS 推断名即 `register`；`:19` 的模块级 name 由 B2 覆盖。两通道 inject 均为空（本就没有） |
| **面板 `panel/index.js`** | 名 `toolkit-manager` / `['webServer']` | **装载失败** `plugin-shape-invalid`（legacy 合成 id 校验） | **分叉（可达性）**：见新登记 D-15。面板本就不该走 registry 通道，但失败原因不是设计声明而是字段缺失 |

**结论：B2 比官方更宽**（合并 ⊃ 纯替换），且**分叉可观察**。方向上 B2 更贴近"模块声明的意图"，代价是同一个插件经两条通道装载时 **cordis 侧显示名不同**（宿主 preset 通道 = `RouterCompactionEngine`，面板 registry 通道 = `compact-router`）。影响面逐条核过：cordis 日志器名（`:631-632` `name ??= hyphenate(fiber.name)`）、服务撞名报错文案（`:812` `has been registered at <fiber.name>`）、宿主 cordis 调试视图的 fiber 树。toolkit **自己的键控不受影响**——registry/src 与 panel/ 全量 grep `fiber.name` 零命中，条目一律按 `manifest.id` 记账（卸载/审计/state.json 都安全）。附带一条代码推导（未实测）：同一模块实例若被两条通道先后装入，cordis 按 callback 身份复用 runtime（`:1622-1631` 的 `_internal.get(callback)`），**名字由先到者定**。

**给 Pack H 的三个选项（裁定方：待用户）**：① 把 B2 收紧成与官方一致（纯替换）——代价是丢掉 A#13 的 inject 门控修复，等于回退，不可取；② 保留 B2，把 `loader.ts:305-308` 的"保守近似/无法对照"改成"故意比宿主 loader 更宽 + 差异表"，并考虑钉成用例（本轮已把差异表落档，可作规格）；③ 改三个内置入口自身（default 对象自带 `name` / `Config`），使两通道逐字一致——最小、最正解，但动子插件源码，须按红线 6 全量跑。本轮**代码一字未动**。

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
| `profiles/web/package.json` | `"@local/dsh-toolkit": "link:D:/dsh-plugins/dsh-toolkit"` 且出现在 `dsh.profile.bundles` 里 ⇒ 实证了 H5 那句归属判断：宿主确实加载**本仓那份** `cordis.patch.yml`，改动经该 `link:` 生效 |
| `profiles/web/pnpm-lock.yaml`、`.dsh-market/discovery-compatibility-v1.json` 的命中 | 前者是包元数据 `engines: {node: …}`，后者是市场目录里的插件**名**（`web-search-searxng` 等）⇒ 都不构成配置层 |

**结论**：**确认无覆盖层**——引擎列表的唯一声明处就是本仓 `cordis.patch.yml:61`，
删除在下次宿主自然重启后**完全生效**（当前运行实例仍是重启前加载的 8 项版本，A#25 已注明）。
若今后有人通过桌面 settings 面板给 web-search-local 写 engines，那一层会盖上来——届时以
`~/.dsh/settings.yaml` 出现 `web-search-local` 节为判据，I1 门禁看不到那一层（它只校验仓内 patch 文件），
这一条边界记在这里，不另开债务（属产品既有分层设计，非缺陷）。
