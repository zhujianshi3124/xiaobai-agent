# 遗留债务清单（终态 · 2026-09-20 项目关闭；2026-09-21 cordis 符合度复核追加）

> 建立：2026-09-19（P4）。**最终化：2026-09-20（P8 终版验收通过，项目关闭）。**
> **2026-09-21 复核追加**：对照 cordis 4.0.2 做符合度复核，用户裁定"全修"，
> 按 Pack A–E 施工。A 区新增 #12–#16（已清偿），D 区新增 D-6/D-7/D-8（复核发现、
> **待用户裁定未动实现**），C-1 补一条必答设计题。关闭状态本身不变。
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
| 4 | REQ-10 面板审计接线 | P2/P4 | P6（展示）+ P8（持久化） | 实时 toast（P6 归一迁入唯一面板）+ **持久化落地**：`panel/manager/audit-sink.mjs` 订阅本实例 `audit:*` 七类事件 → `<状态文件同目录>/audit.jsonl`（2 MiB 单档轮转；`registry.auditLog:false` 可关、`registry.auditFile` 可改），字段白名单 `at/event/pluginId/durationMs/errorCode?`，配置内容与环境变量值一律不落（`test/audit-sink.test.mjs` 4 例）；落点经 `/v2/snapshot.auditFile` 可发现。**浏览 UI 见 D-1** |
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

**验收口径**：全量门禁（`node scripts/ci-local.mjs --with-scan`）+ 真实仓 doctor dry-run `0/0/0`
+ 一条新用例证明"`provides` 声明的撞名服务会被 `reg.name-collision` 阻断"。

---

## D. 待办（零散改进，不阻塞关闭）

| # | 待办 | 裁定方 / 备注 |
|---|---|---|
| D-1 | **审计历史浏览 UI**：面板内查看 `audit.jsonl`（需新增只读路由 + 列表渲染）。数据已落盘、路径经 `/v2/snapshot.auditFile` 可查 | 用户 2026-09-20 裁定：不做，记待办 |
| D-2 | **`scripts/p23-shadow-scan.mjs` 覆写历史证据文件**：每次运行都会改写 `panel/docs/evidence/P23-SHADOW-SCAN.txt` 的生成时刻与 `~/.dsh/settings.yaml` 指纹（P2.3 的 09-18 快照本轮被覆写后已 `git checkout` 还原）。建议改为写带时间戳的新文件，遵守证据目录"只增不改"硬约定 | 工程侧发现并记录；用户裁定记待办不阻塞 |
| D-3 | **`scripts/regression-all.mjs` 清单补漏**：不含 `p23-verify` 与 `p23-shadow-scan`（本轮改面板文案时 p23 的源码断言就静默漏过一次，靠人工补跑发现）。`ci-local.mjs --with-scan` 已临时覆盖 p23-verify；建议把两项并入 `regression-all` 本体 | 同上 |
| D-4 | **冒烟最后一项待用户人工补验**：宿主会话内一次**真实联网搜索**（验证 web-search-local 在真实 agent 调用链里工作）。本侧已验：宿主重启后 mounted 状态、真实公网探针 `runSearch()` 12 源/1.2s、`fetchUrl()` 200/45795B；未验的那一口需要用户会话凭据（宿主 `/api/web/search` 未认证返回 401，本侧不取用） | 用户侧动作；如实登记于 CHANGELOG P8 终版条目 |
| D-5 | **R13 长期盯防**：装入判定依赖 cordis 4.0.2 的 fiber 内部行为（`FIBER_ACTIVE=2/FAILED=3/DISPOSED=4` 等）。**任何 cordis 升级必须重跑 S1/S4 场景**；依赖已写入 `registry/src/registry.ts` 头注与 `docs/contract.md` §7 D-5 | 工程侧长期纪律。**2026-09-21 复核：R13 本体维持已裁决不动，但当时新登记的三条衍生风险已全部收敛**——① 编号无显式守卫 → A3 数值对账用例；② 轮询漏 UNLOADING → A2 补分支并区分错误码；③ peer 范围过宽放行未校准版本 → E2 收到 `^4.0.2` 并加范围守卫。**仍按 D-5 纪律执行**（守卫只保证漂移会红，不代替人跑 S1/S4） |
| D-6 | **`hasService` 直读代理有原型链误判**：`registry/src/host.ts` 的 `hasService` 读 `ctx[name]`，而 cordis 代理的 get 陷阱先走 `Reflect.has(target, prop)`（沿原型链）——实测 `hasService('toString'/'constructor'/'valueOf'/'hasOwnProperty'/'__proto__')` 全为 **true**。影响面：`precheck.ts` 的 `service-missing` 阻断与 doctor `requires/services` 规则会把这类名字误判为"服务在场"，从而放过一个真缺依赖的插件。改 `ctx.get(name, false)` 可闭合（只查 isolate/store，不碰原型链），但属行为变更 | 2026-09-21 复核发现。**按当轮 A4 指令"发现真实边界风险即停下待裁"，未动实现**，仅把头注改为如实陈述现状。裁定方：待用户 |
| D-7 | **`exports` 字段位置三方冲突（内置插件目录路径装载）**：`loader.ts` 只读**顶层** `manifest['exports']`，但 5 个内置插件的 `dsh.plugin.json` 全把它写在 `requirements.exports` 下。四个因为有 `index.js` 兜底所以"看着正常"，`lib/agent-memory` 没有 index.js ⇒ **按目录路径装不进来**（`entry-not-found`），只能装 `lib/agent-memory/plugin.js`。指定修法"提到顶层"与两处既定事实硬冲突：(a) doctor 独立仓 `MANIFEST_TOP_KEYS` 不含 `exports`，一提就产 error ⇒ **打破 0/0/0 红线**，必须改 doctor 仓；(b) 本仓契约把顶层 `exports` 归为 `KNOWN_LEGACY_FIELDS`，而 C-1 第 3 项计划把这些**收紧为 error**，提到顶层是逆着已裁决方向走。第三个选项"loader 双读"被本轮指令明令禁止 | 2026-09-21 复核发现，**Pack B1 因此停手未做**。备选：① 改 doctor 白名单 + 提顶层（两仓同批，且要与 C-1 第 3 项对齐口径）；② 给 `lib/agent-memory` 补 `index.js` 作插件入口；③ 契约 v1.1 里正式定义入口声明字段并一次迁清。裁定方：待用户 |
| D-8 | **装入成功后 `lastError` 不清**：`loadEntry` 只在失败路径写 `entry.lastError`，重试转 ACTIVE 后不回空 ⇒ 面板卡片会同时显示"运行中"和一条历史错误（E1 实测：`status=active` 且 `lastError.code=fiber-load-timeout` 并存）。语义上"最近一次错误"可以辩护为有意保留，但对使用者是误导 | 2026-09-21 复核发现，未修（不在本轮授权清单内）。建议：转 active 时把 `lastError` 降级为 `lastRecoveredError` 或带 `at` 时间戳明示陈旧。裁定方：待用户 |
