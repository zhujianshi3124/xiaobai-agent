# 契约 v1.1 侦察记录与三方核对矩阵（C-1 第一阶段）

> 性质：**侦察落档笔**，纯文档、零代码。不构成实施批准。
> 基准：本仓 HEAD `4131260`（master，落档前工作树干净）；doctor 独立仓 HEAD `6839cc1`（main，本阶段**零改动**，且本笔不落 doctor 仓）。
> 落档时点：2026-09-22。门禁基线：`node scripts/ci-local.mjs --with-scan` **5/5 全绿，56.9s**（npm test / 回归全跑 13 项+`node --test` / doctor 真实仓 dry-run `issues=0 (e0/w0/i0)` / patch 行配置校验 / p23-verify）。
> 取证手法：两仓源码逐字读 + 三个只读探针（`resolveLocalSource` / `DoctorService.precheck` / `validateManifest` 真调用，零写盘、零安装状态、未碰 `~/.dsh`、未重启宿主、未跑 `p23-shadow-scan`）。探针与原始底表留在沙箱 `var/scratch/c1-recon-20260922/`。
> 配套逐行矩阵：`docs/contract-v1.1-matrix-migration.md`、`docs/contract-v1.1-matrix-embed-toolkit.md`。`contract.md` 与 `add-sub-plugin.md` 两份的逐行判定已折进本文 §6（这两份的判定与 v1.1 六项重叠最密，拆开反而丢上下文）。

---

## 1. 草案基准对照：C-1 六项原文 + 实测修订

原文 = `docs/debt.md:157-197`。**草案原文不改写，修订以本表滚存**（协调侧口径：错误照录、修订滚存新笔）。

| # | 草案原文（摘，关键限定词保留） | 草案自定落点 | 实测修订 |
|---|---|---|---|
| 1 | 「新增 `provides` 字段 …… 补上契约缺口（现状只有 `requires.services` = **依赖**的服务，没有"本插件**注册**了什么"的表达）」 | `contract/src/types.ts` + `validate.ts` + `registry/src/loader.ts` + doctor 规则 | **落点齐但定性偏低**：这不是"补表达"，是**修一处已存在的语义倒置**。`loader.ts:50` `contractServices ?? legacyServices` 把 `requires.services` 填进"注册面"，`doctor.ts:275/279` 再拿它当提供面比对。已实测复现假阳性（§7）。 |
| 2 | 「`CONTRACT_EVENT_NAMES` 增补 **7 类**审计事件（或引入 `AUDIT_EVENT_NAMES` + 统一 `contractAuditEventName`），**收编** `registry/src/registry.ts:266` 的手工模板串；同步三处消费方」 | naming.ts / registry.ts / v2-api / client | **三处偏差**：① 实测 `AUDIT_EVENTS` = **8 类**（第 8 项 `state-save-failed` 是 Pack H1 `b59f730` 加的，草案在前）；② 手工模板串实在 **`registry/src/registry.ts:381`**（`:262-269` 现是 `registry:status-changed` 的 notify）；③"三处消费方"里 **`v2-api.mjs:194` 已经是从契约 `AUDIT_EVENTS` 派生**，真手工孪生只剩 `panel/client/index.js:1684-1685` 一处（且已由 `test/toolkit-root.test.mjs:200-213` 逐名核对）；SSE `hello` 帧（`v2-api.mjs:250`）不带事件名清单，**无第三处可同步**。 |
| 3 | 「`KNOWN_LEGACY_FIELDS` 收紧为 error：前置条件是第 1 项已落地且 `extractRegisters`（`registry/src/loader.ts:31`）改为优先读 `provides` …… 并先做一次 legacy 字段引用审计」 | validate.ts / loader.ts | 行号 `loader.ts:31` 失效 → 实为 **`:41`**（`docs/debt.md:167` 同样失效）。真实门槛**不是引用审计**：doctor 独立仓 `engine.mjs:330-337` **必填** `manifestVersion`/`name`/`requirements`，`:387-391` 必填 `requirements` 五键；实测仓内 7/7 份 manifest 靠"同时带两套字段"的混合形态才过 0/0/0（§5）。⇒ **本轮裁定：移出 v1.1，转 C-2（v1.2），前置清单见 debt.md C-2。** |
| 4 | 「**5 个内置插件**补 `provides`：`lib/{rate-throttle,compact-router,agent-memory,search-router,web-search-local}/dsh.plugin.json`」 | 5 份 lib manifest | **名单与实测不符**（§5 完整枚举）：5 个 lib manifest 里注册面**非空的只有 3 个**（compact-router / search-router / web-search-local），`rate-throttle`、`agent-memory` 三面全空；草案名单**漏了真正必须补的桶根**（`requires.services=["webServer"]` 现被误记为"提供 webServer"）与 `panel/`（唯一无 `contract` 的那份）。⇒ 本轮裁定：以实测为准修正，"空是如实则不补"。 |
| 5 | 「两仓同批：toolkit（contract + registry loader + doctor 规则）与 doctor 独立仓（`src/engine.mjs` 的 `MANIFEST_TOP_KEYS` 白名单需加 `provides`；参照 `requires`/`panels` 的落地方式 `6839cc1`）」 | 两仓 | 顺序被代码锁死，非流程偏好：**今天给任何 `dsh.plugin.json` 加 `provides`，两道闸同时红**（契约 `validate.ts:102` 报"未知顶层字段"error；doctor `engine.mjs:363-367` 报"清单根字段非法: provides"error）。⇒ 唯一安全顺序 = **doctor 白名单先落，toolkit 后落**。另：`6839cc1` 先例是"加白名单、**零值校验**"（`requires`/`panels` 在 doctor 全 `src` 只出现在常量与注释里），所以"doctor 规则"三字须拆开看——冲突检查覆盖在 `engine.mjs:1196`（读 `requirements.registers`），不加读 `provides` 就覆盖不到。 |
| 6 | 「契约版本升**次版本** 1.0.0→1.1.0 ……（旧 manifest 在 `^1.0` 下继续可用；`provides` 缺席时冲突检查降级为 info 而非 error），并明确"破坏性变更才升主版本"的红线未被触碰」 | types.ts:14 / CHANGELOG / contract.md | **实测放行**：`versionSatisfies('1.1.0','^1.0')=true`。反向 `versionSatisfies('1.0.0','^1.1')=false` ⇒ 谁先写 `^1.1` 谁先红 ⇒ **版本常量提升必须最后做**。附带查出一处：`doctor/src/doctor.ts:464` 的 `validate()` **硬编码 `'1.0.0'` 字面量**而非引用常量，升版本必漏改。 |
| 验收 | 「全量门禁 + 真实仓 doctor dry-run `0/0/0` + 一条新用例证明"`provides` 声明的撞名服务会被 `reg.name-collision` 阻断"」 | — | 可用，但**必须补对偶用例**：只钉"provides 参与撞名"会留下倒置——还要钉"两个各自 `requires.services` 同名者**不**判撞名"（§7 已实测证明今天是判撞名的）。 |

**必答设计题（草案另有两条补充 + 本轮追加一条）**：题 1 `requires↔inject`（`debt.md:179-188`）、题 2 doctor `exports` 必填键与本仓契约分叉（`debt.md:189-194`）、题 4 一致性论证（本轮：题 2 裁决与题 3 前提是否矛盾，见 §8.3）。三题的裁定与核对结论在 §8。

---

## 2. 契约主体厘清：v1.1 与 cordis 4.0.2 的关系

**结论：独立演进为主，对 cordis 是"有意的超集"，不是对齐。** 依据三条，全部就地可复核：

1. **契约声明的对象 cordis 不读。** 宿主全局包 `@deepseek-ai/dsh/node_modules` 只读递归 grep：`dsh.plugin.json` **零命中**、`PLUGIN_CONTRACT_VERSION` / `CONTRACT_EVENT_NAMES` / `KNOWN_LEGACY_FIELDS` **零命中**。cordis 4.0.2 从插件对象上取的只有 `name` / `Config` / `inject` 三样（口径记于 `debt.md:320`）。⇒ v1.1 六项服务的是 toolkit 自己的 precheck / doctor / 面板三张脸，不服务"向 cordis 对齐"。
2. **"比宿主 loader 更宽"是已裁决的主动选择。** `mergeNamespaceStatics`（`registry/src/loader.ts:319-343`）vs 官方 `unwrapExports` 纯替换，头注 `:305-318` 自陈"这是有意的兜底"，差异由 `test/dual-channel-parity.test.mjs` 逐入口钉住。`debt.md:334` 定性："B2 比官方更宽，且分叉可观察"。⇒ 关系已定性为**超集**。
3. **`provides` 在 cordis 侧没有对应物。** cordis 只有依赖面（`inject`），服务是运行时 `provideService` 注册的，无"声明我会注册什么"的概念。⇒ 第 1 项不需要也不可能"等 cordis 版本"。

**对批次划分的影响**：v1.1 主体（1/2/3/4/6 项）**不需要真机验证**；只有题 1 若选"合成 inject"或"改 patch 行 `inject:`"，才把批次推到宿主通道。

### 实现 ↔ 契约文本差距清单（逐 C-1 项标注性质）

| 对象 | 性质 | 差距实况 |
|---|---|---|
| （**不在草案六项内，但欠账最大**）三级入口解析 | **纯文本追赶** | `docs/contract.md:64-66` 仍是 23de06a **之前**的两极顺序、全文不提 `requirements.exports`；`docs/embed-toolkit.md:8` 只认 `package.json` 那一级；`docs/migration.md:17-19` 把顶层 `exports` 当"info 容忍的旧字段"，不标它在 doctor 侧当场 error。`docs/add-sub-plugin.md:63-85` **已追上**（但自称"三级"实为四级、自称"单一事实源"实则三副本：`loader.ts:13-21` 头注 + `registry/src/types.ts:55-57` + 本文）。⇒ 追赶动作 = 以 `add-sub-plugin.md` 为正本重写另两份。 |
| 1 `provides` | **新增行为**（窄） | 全仓零命中（实测）。行为变更只在 `extractRegisters` 优先级；缺席降级 info ⇒ 非破坏。 |
| 2 `audit:*` 入枚举 | **新增行为：零** | 实测 8/8 事件名 `contractEventName(prefix,'audit:'+x)` 与手工模板串**逐字节相同** ⇒ 纯重构 + 编译期类型收紧（`contractEventName` 运行时**不校验**事件名，实测未知名照拼）。 |
| 3 收紧 legacy | **新增行为**（重） | 见 §1 第 3 行；本轮裁定出 v1.1。 |
| 4 内置数据 | **新增行为**（数据） | 名单须按 §5 实测修正；且依赖 1+5 先落。 |
| 5 两仓同批 | **新增行为**（合法域扩宽） | doctor 侧是"reject→accept-and-ignore"（照 `requires`/`panels` 先例）⇒ 若第 5 项先落而读方未上，存在"`provides` 合法但无人解读"窗口，无害但须如实记。 |
| 6 版本提升 | **文本 + 一个开关** | 落后文本：`contract.md:1/:5/:19/:110`、`doctor.ts:464` 硬编码。 |

---

## 3. 宿主暴露面

**运行中真实宿主对契约的消费路径：零条。**

| 消费候选 | 实测 | 判定 |
|---|---|---|
| 读 `dsh.plugin.json` | 宿主全局包递归 grep 零命中 | 契约字段增删对宿主不可见 |
| 读契约常量 | `PLUGIN_CONTRACT_VERSION` / `CONTRACT_EVENT_NAMES` / `KNOWN_LEGACY_FIELDS` 零命中 | 同上 |
| patch 行携带的信息 | `cordis.patch.yml` 全 82 行逐行目检：只有 `id` / `name` / `config` / `disabled` | 宿主按 `name` import 模块、`unwrapExports` 取对象、读其 `name/inject/Config`——与 manifest 无关 |
| `panels` 描述符 | `docs/embed-toolkit.md:84-87` 既有条目：`dsh-web-all` 不读 `panels` | 契约字段、宿主不消费（既有申报） |
| **唯一宿主可见缝** | `cordis.patch.yml:75` `name: '@local/dsh-toolkit/agent-memory/plugin'`（包名子路径） | 只有动 `package.json#exports` 表（题 2 若改 `.` 语义并收掉 `./plugin`）才波及 ⇒ **v1.1 不动** |
| 宿主通道 Config 校验（H3 起真校验） | `debt.md:120` A#22 / D-16；门禁第 4 步 `scripts/patch-config-check.mjs` 代跑 | 与 v1.1 无耦合。若 v1.1 内任何批次再收紧某入口 `Config`，按 A#22 文末防再犯口径：**必须先把宿主真实加载的那份声明文件、按宿主解析方式喂进新校验器** |

**v1.1 是否要求宿主配合：不要求。现宿主是否兼容：兼容（它不读）。**
边界：本轮对宿主包**只做只读 grep，未做运行时取证**（3080 匿名 401，未取凭据、未重启宿主）。宿主 loader 的 `unwrapExports` 本轮未再逐字读（工作区外路径），引用的是仓内两处**逐字副本**：`scripts/patch-config-check.mjs:279-285`（含自证用例 #19）与 `test/dual-channel-parity.test.mjs:13-17,130-133`（真 loader 在场才反向复核，缺席即 skip）。上一轮真机读数（H5 / A#24，五个内置插件归属链全在宿主 patch 通道）仍是权威证明。

---

## 4. 内置插件完整枚举（实测，替代草案的"5"口径）

探针 A：`resolveLocalSource` 走真 loader。探针 B：直读 7 份 manifest 根字段。

| 单元 | registry 通道实测 | 入口形态（`entrySource`） | 注册面实况 | v1.1 处置 |
|---|---|---|---|---|
| `lib/rate-throttle` | ✓ `dsh/rate-throttle`，legacy=false | 正典 `manifest.requirements.exports` | services/commands/providers **全空** | 空即如实 ⇒ **不补** `provides` |
| `lib/compact-router` | ✓ `dsh/compact-router` | 正典 | `services:[compaction]` + 5 命令 | **补** |
| `lib/agent-memory`（目录） | ✗ `plugin-shape-invalid` | 正典 `.` → `lib/index.js`（104 个命名导出的数据层） | — | **终态设计行为**（D-7 追加 情形 A），不修 |
| `lib/agent-memory/plugin.js` | ✓ `dsh/agent-memory` | `explicit-file` | **全空** | 空即如实 ⇒ 不补 |
| `lib/search-router` | ✓ `dsh/search-router` | 正典 | `providers:[auto-search]` | **补** |
| `lib/web-search-local` | ✓ `dsh/web-search-local` | 正典 | `providers:[local-multi, local-fetch]` | **补** |
| 桶根 `dsh.plugin.json` | ✓ `dsh/toolkit` | `manifest.requirements.exports($from)` | `registers.services=["webServer"]` **且** `requires.services=["webServer"]` | **倒置现场，最优先补**；不在草案名单 |
| `panel/` | ✗ `plugin-shape-invalid`（D-15） | — | — | 唯一无 `contract` 的一份；v1.1 不动它则须如实记"panel 仍在 legacy 合成分支" |

三条"数法"必须分开写，否则后续每轮都要重新吵一次：
① **有 manifest 的单元 = 7**（5 lib + 桶根 + panel），其中 6 份有 `contract`、1 份没有；② **注册面非空 = 3**；③ **宿主真实装载 body = 6**（`cordis.patch.yml` 的 5 个 insert 行 + `compact-router` 由预设改写挂载，见 `:3` 与 `doctor-signals.json` 的 `presetManagedNames`）；面板卡片数 5（`p1-smoke.mjs:295` 断言的是 `snapshot.mjs` 派生的卡片数，不是 registry 实测数）。
另：入口形态实测**没有一例**走"顶层 legacy `exports`"或"`index.js` 兜底"——`manifest.exports(legacy)` 与 `package.json#main` 两个 `EntrySource` 值在本仓内置单元上零命中（`index-convention` 只在探针自造夹具里命中，顺带证明其可达），⇒ v1.1 为这两个顺位写的任何迁移说明都**无本仓回归风险、也无本仓测试覆盖**。

---

## 5. 三方核对矩阵 · 净账

标准（协调侧定）：文档写到的全部正常实现和运行；落差双向不许存续——文档说而实现没有 ⇒ 补实现或改文档；实现有而文档没说 ⇒ 补文档或删实现。v1.1 的收口定义 = **矩阵全绿**。

| 文档 | 可验证承诺（约） | 判定为一致 | 落差（文档超前/落后/实现超前/互斥） | 反向缺口（实现有、文档无） | 未核实 | 逐行版 |
|---|---|---|---|---|---|---|
| `docs/contract.md` | ~73 条 | ~43 | **~30 条** | **18 条** | 5 | 折进本文 §6 |
| `docs/add-sub-plugin.md` | ~49 条 + 15 句入口/inject 专项 | ~20 | **~29 条**（含 8 条文档间互斥） | **12 条** | 6 | 折进本文 §6 |
| `docs/migration.md` | 87 行表项 | 多数 | **17 处命中落差关键词** | **10 条（U-1…U-10）** | 7（N-*） | `docs/contract-v1.1-matrix-migration.md` |
| `docs/embed-toolkit.md` | 104 行表项 | — | **42 处命中落差关键词** | 若干（并入 §2） | 14（N-*） | `docs/contract-v1.1-matrix-embed-toolkit.md` |

### 落差总账 · 必须先处置的（四份文档合并，全部经执行侧逐条复核到代码行）

按"文档承诺而实现做不到 / 实现与文档相反"排序，P0 = 照文档写就会撞墙：

| 级 | 落点 | 文档说 | 实现做 | 证据 |
|---|---|---|---|---|
| **P0-1** | `add-sub-plugin.md:92-94` | 「requires 越诚实，预检越有用……**缺席类只产 warn/info，不产 error**（doctor 验收红线 0/0/0 的口径）」 | `doctor/src/rules.ts` 缺席类**大量产 error**：`:33`/`:51`（版本不符）、`:71`（依赖服务缺席）、`:111`（必需 envVar 缺席，按 `required` 分级）、`:133`（二进制不在 PATH）、`:151`（低于 minVersion）、`:173`（非 shared 端口占用）、`:193`（fsPaths 不可访问）；error ⇒ `blocking` ⇒ 拒装（`doctor.ts:234-238`） | 已核（本轮 V2 grep 逐行）；且与**自家测试**相反：`test/doctor.test.mjs:60-83/:84-125/:281-326` 断言的就是 error |
| **P0-2** | `add-sub-plugin.md:36-59` 示例 manifest + `contract.md §2.1` | 示例直接给 `requires.services:["webServer"]`；正文称该字段"**即 inject 面**" | 该声明被当**提供面**参与 `reg.name-collision` ⇒ 第二个同样需要 `webServer` 的插件被阻断安装；且 `requires.services` **从不写进 cordis 的 `inject`**（门控只认模块静态 `inject`，`loader.ts:289`） | **已实测复现**（§7 探针，非推演） |
| **P0-3** | `add-sub-plugin.md:90-91` | 「函数型成员走模块导出：`healthCheck(ctx) => Promise<HealthItem[]>`、`Config`、`panels`」 | `healthCheck` **装载链上不可达**：`PLUGIN_STATIC_KEYS`（`loader.ts:289`）不含它，loader 从不把它绑到 manifest，而消费点读的正是 `manifest.healthCheck`（`doctor.ts:347`、`v2-api.mjs:157`）⇒ 作者按文档写了，永远不跑。`panels` 同构问题（无消费者，`v2-api.mjs:158` 只是透传）。另签名口径：契约是 `(c: HealthCheckCtx)`（`types.ts:79-82/100`），且实调时 `ctx: undefined`（`doctor.ts:350`） | 已核（本轮 V1 grep：`loader.ts` 全文 `healthCheck` 零命中） |
| **P0-4** | `contract.md:78-79` + `validate.ts:356` 注释 + `migration.md:66` | 两处都在时"**以模块导出为准**" | **相反**：`loader.ts:425` `if (runtimeSchema !== undefined && manifest.configSchema === undefined)` ⇒ manifest 落盘那份赢；三处消费同序（`doctor.ts:242-244`、`registry.ts:394-396`）。可观测后果：`web-search-local` 生效的是 manifest 的 1 键 schema，不是模块 14 键 `Config` | 已核（本轮 V4）；`validate.ts:354-356` 注释同源污染 |
| **P1-5** | `migration.md:76` | 「面板以 `execFile` 调它（**120s 超时**）」 | `panel/manager/doctor-runner.mjs:44` 缺省 **180000**，`:115` 的 `--states` 是 **60000**；仓内 120000 只有两处且都不是 doctor CLI | 已核（本轮 V3） |
| **P1-6** | `contract.md:64-66`、`embed-toolkit.md:8` | 入口两级/单级顺序 | `resolveEntry`（`loader.ts:190-260`）四级 + 正典在下 + 显式声明不回退（23de06a 裁定 10） | §2 差距清单首行 |
| **P1-7** | `contract.md:52-55` | 审计事件不经 `contractEventName`，"收编需同步三处" | 事实仍成立但行号失效（实在 `registry.ts:381`），且"三处"只剩一处是手工 | §1 第 2 项 |
| **P1-8** | `contract.md:26-27` / `migration.md:17-19` | 顶层 `exports` 属 info 容忍旧字段 | 同仓 `add-sub-plugin.md:66-67` 说它是 doctor 的 error；两边各说一个仓，读者照一份写就在另一份撞红（`engine.mjs:363-367`） | 互斥 X-3 |
| **P2-9** | `contract.md:70` vs `:72-74` | 标题"configSchema 的**三形态**" | 实现是 **4 分支**（`config-schema.ts:36/50/66/81`），`via` 四值；且 `via:'schemastery-json'` **不可达**（③④ 重建后递归回落 `:36`），`via:'skipped'` 时 **`ok:true`**（`:32/:75/:90/:95`）而两个调用方只看 `ok` ⇒ 与 `:75` 的"不谎称已校验"相悖 | 已核（本轮 V5） |
| **P2-10** | `add-sub-plugin.md:5` / `:117-118` | "改了面板代码就是 bug（守卫 p4 + pluggable-lint）""面板/引擎零插件名硬编码" | ① `p4-no-subplugin-import-check.mjs:16-27` 只硬编码 **5 个内置名**、只扫 **6 个文件**，对第三方新插件名**完全失明**；② `pluggable-lint.mjs:112-130` **只扫 `lib/` 与 `test/`**，不碰面板（张冠李戴）；③ `migration.md:50-51` 自己承认面板 patch 域硬编码"须原样保留" | 已核 |
| **P2-11** | `contract.md §2` 字段表 / §6 | `envVars[].required`、`fsPaths[].access`、`binaries[].name`、`externalApis[].name`、`ports[].protocol` 的**必填性与协议白名单未写**；`fix.docsUrl` 承诺了却**全仓零生产者零消费者**；`install(source,{force:true})` 可越 over blocking **完全未记载**（`registry.ts:431`）；`InspectionReport` 形状正文缺 | 同上 | 补文档 |
| **P2-12** | `add-sub-plugin.md:128` | `curl -s localhost:3080/...` 可验 | `panel/index.js:59` `isLoopbackAddress` 只认 `127.0.0.1`/`::1` ⇒ 按字面执行必 403（已核本轮 V6）。`embed-toolkit.md:75/77` 的"Host 是 loopback"亦从未界定取值域 | 改文档 `127.0.0.1` + 注配对前提；或实现支持 `localhost` 并补 3 例（**二选一，需裁定**） |
| **P2-13** | `contract.md:87` | "`registry.loadFailureReport` 五分支已按此改写" | 五分支实在 `sourceFixAdvice`（`registry.ts:109-139`）；`loadFailureReport` 只有两路。且 5 码里只有 3 码的 fix 文案有钉，"禁循环表述"的否定式断言只覆盖 1 码 | 改文档 + 补钉 5 码遍历 |
| **P2-14** | `contract.md:101` D-5 | "`fiber.await()` 以启动错误 reject""五个终态数值" | 实现读的是 fiber **thenable**（`registry.ts:551` `Promise.resolve(fiber)`，`FiberLike.await()` 声明了但未走）；`test/cordis-fiber-state.test.mjs` 实测的是 **6 个状态**（5 个断言了字面量，`FIBER_LOADING=1` 只由顺序不变式隐含） | 改文档两处措辞 |
| **P2-15** | `contract.md:112` | legacy 合成 id 落 `legacy/<name>` | 有条件：`loader.ts:369` 包名含 `/` 时**原样沿用** ⇒ scoped 包必被 `ID_RE` 拒（即 D-15），文档未写该条件 | 改文档 |
| **P3** | `debt.md:133`（B-1） | 「`manager/uninstall.mjs` 的 **10 个** plan/execute 函数与 **6 个**验收脚本（含 p24-ui-matrix）」 | 实测 **15 个导出函数**（7 plan + 8 execute）、以 `putPlan/getPlan/dropPlan` 为契约的验收脚本 **5 个**（`p24-ui-matrix.mjs` 不引用这三个函数）⇒ B-1 的风险评估基数是错账 | 已核（本轮 V7/V8）。成因：B-1 写于 P7，其后 P2.4 扩了 mount/restore 面。⇒ 随本笔更正 debt.md，**不改 B-1 的裁定结论** |

### 5.2 原因列（任务 A · git 考古成品，2026-09-22 审定轮并入）

定性口径：**1 = 文档超前（从未实现/已废弃的设计）；2 = 实现回归（曾一致、某笔改坏）；3 = 文档漂移
（实现演进了没跟上 / 写的时候就错）**。方法：`git log -S'<条文特征串>'` 定位条文写入笔，
`git show <sha>:<文件>` 复写时点行号与上下文，再用 pickaxe 定位实现定型笔。

| 落差 | 条文写入 | 实现定型 | 是否曾一致 | 定性 | 决定性证据 |
|---|---|---|---|---|---|
| P0-1 缺席类只产 warn/info | `8407e55`（09-20，四份正本同一笔诞生） | `doctor/src/rules.ts` **诞生即产 error**（`5af0a49` 09-19；`44545c0` 09-19 补强） | **从未** | **3（张冠李戴）** | 那句纪律的真源头是**本行左列这份文档自己**：`docs/p0-recon.md:55`「缺席/缺依赖类只产 info/warning 绝不 error」讲的是**独立 CLI 仓级审计**（其验收红线是 `0/0/0`），被 `8407e55` 抄进 `add-sub-plugin.md §2 要点 4` 后**换了主语**（进程内 `requires` 合成规则）⇒ 文档抄文档、丢限定语 |
| P0-2 `requires.services` 即 inject 面 + 示例自陷 | 注释源头 `8ccc374`（09-19 P1）；文档 `8407e55` | 借用为提供面始于 **`44545c0`（09-19 P5）**：同笔引入 `extractRegisters` 的 `contractServices ?? legacyServices` 与 `doctor.ts` 的 `ownServices` | **从未** | **1 + 3 复合**（"inject 面"那半句是从未实现的**类型 1**；"当提供面"那半句是实现自创、文档未记的**类型 3**） | `44545c0` 提交说明自陈意图「注册冲突 reg.name-collision，registry 暴露 registersOf」——P5 建冲突检查时 `provides` 从未存在，只有 `requires.services` 可借。**长期潜伏成因（实测）**：5 个 lib 插件全部 `requires.services=null`（走 legacy `requirements.registers`），唯一带它的桶根只由宿主 patch 通道装载、从不经 registry ⇒ 借用对内置静默、对外部契约插件致命 |
| P0-3 `healthCheck`/`panels` 走模块导出 | `8407e55`（09-20）；语源 `8ccc374` 注释（末尾"**（P4 面板消费）**"＝前瞻性设计意图） | 读方 `doctor.ts:347` 自 `5af0a49`（09-19）就在读 `manifest.healthCheck`；写方**从未存在**：`PLUGIN_STATIC_KEYS` 由 `d2dd56f`（09-20 B2）引入、六键从无 healthCheck | **从未** | **1（读方在、写方无的半截设计）** | `loader.ts` 全文 `healthCheck` 零命中；`d2dd56f` 标题即「default 不再吞掉 name/inject」⇒ 目标从来只是静态元数据面。**审定后新增事实**：本仓**没有任何模块导出 `healthCheck`**（`index.js`/`lib/*`/`panel/` 全量 grep 零命中）⇒ 批 3 接通后内置插件"突然生效面 = 0" |
| P0-4 configSchema 以模块导出为准 | 注释源头 **`8ccc374`（09-19 P1）**，文档与 `validate.ts:356` 注释同源 | 反方向实现（`manifest.configSchema === undefined` 条件）由 **`8d84729`（09-19 P2）** 引入 | **从未**（P1 与 P2 相差一天，同日之内两边就是反的） | **1（设计从未实现）＋ 传播** | 污染链完整：`8ccc374` 注释 → `8407e55` 抄进 `contract.md §5` → 同笔又经 `migration.md §5` 以"两者并列、暗示等价"复述。**协调侧裁定：定稿=改代码（批 4），文档保留承诺句不附和现状**，另立 D-12 记"当前实现相反" |
| P1-5 120s 超时 | `8407e55`（09-20） | `8f6b392`（09-18）确为 `timeout: 120000` ⇒ **曾为真**；`b3b1575`（09-19，P2.4 批 2 单元 3「doctor-runner 增 spawn 助手」）放宽为 180000 | **曾经一致** | **3（实现演进没跟上），机制是"文档抄文档"** | 改值在 09-19、文档 09-20 才写，却仍写 120s ⇒ 抄的是 `docs/p0-recon.md:56`；**该源头行至今未改，本轮随定稿笔一并更正（第五处错账）** |
| P1-6 `contract.md §4` 停在两级顺序 | `8407e55`（09-20，**当时完全正确**） | 顺序改判 `23de06a`（09-21）：`git show --stat` = **17 文件全在 `registry/` 与 `test/`、零 docs** | **曾经一致** | **3** | 收尾文档笔是次一笔 `a6e7457`（09-21「Pack F 收尾落账」），四级正典条文由它写进 `add-sub-plugin.md`（pickaxe `正典位置` 命中该笔）⇒ **同笔只更新一份正本、未回改 contract.md、也未留失效指针** |
| P2-9 三形态 vs 四分支 | `8407e55`（09-20） | 第 4 分支（`uid`/`refs`）`44545c0`（09-19） | **从未** | **3（写时即已落后）** | 标题"三形态"与正文 ①②③④ 自相矛盾；`via:'schemastery-json'` 死值 |
| P2-12 `curl localhost:3080` | `8407e55`（09-20） | `isLoopbackAddress` 自 `2b05777`（09-17）只认 `127.0.0.1`/`::1`；`git log -S'"localhost"' -- panel/index.js` **零命中** | **从未** | **3（写时即错）** | 且 `test/`＋`scripts/` 全文 `localhost` 零出现 ⇒ 无任何实现或测试曾假定其可用。**协调侧此前"补 localhost 支持"的裁决因原因查明而作废反转，定稿=示例改 `127.0.0.1`** |
| 六处失效行号（`loader.ts:135/:110/:233/:181/:31`、`registry.ts:266`、`types.ts:158`） | `8407e55`（09-20） | 漂移主因 `23de06a`（正典段前 +55 行）与 `b59f730`（registry.ts 增行） | **写时全对** | **3** | 实证：`git show 8407e55:registry/src/loader.ts` 第 **135** 行正是 `function resolveEntry`、`git show 8407e55:registry/src/registry.ts` 第 **266** 行正是 `audit:\${event}` ⇒ 属"后来漂"，非"写时错"。`add-sub-plugin.md:12-13` 后来自立的"按函数名找"规矩正是对这次漂移的反应，但**没回改 contract.md** |

**总成因（一条，覆盖 P0 全部四项）**：四份正本文档在同一笔 `8407e55` 诞生，该笔自述"事实来源＝代码"，
实际取材方式是**抄代码注释、抄类型定义、抄旁证文档（`p0-recon.md`），未核行为与测试**。
**没有一项是类型 2（实现回归）** ⇒ 修法上不存在"回滚某笔代码即恢复一致"的路径，只能逐条二选一
（改文档 或 改代码）—— 这正是"说明书须由用户逐条定稿"的原因，也是 ★4/★5 两笔先前裁决
因原因查明而作废反转的依据。

**未查（如实，协调侧已"放下采信"）**：`p4` 守卫的收窄历史、`fix.docsUrl`/`autoFixId` 空壳字段的引入笔、
`embed-toolkit.md:93/:99` 两处失效指针的具体成因链（疑与 debt 四类归档重排同批，未证）、
`8407e55` 之前是否另有入口文档。用户审定若触及相关条文再补挖。

### 测试覆盖净账（"有钉"缺口的可执行清单）

实现有、断言无（矩阵标 无钉 的高频项，按修复成本排序）：
`KNOWN_LEGACY_FIELDS` 只钉了 1/8 个名字（`contract.test.mjs:128` 仅 `.includes('manifestVersion')`，改 `deepEqual` 全清单即补 7 名 + "第 9 名必 error"）；`CONTRACT_EVENT_NAMES` 计数与 `registry:plugin-removed` 前缀发射无钉；`id-conflict` 全程无钉；`configSchema` 双在场优先级无钉（P0-4 的根因）；`displayName`/`requires.node`/`binaries.minVersion`/`fsPaths.path`/`externalApis.name` 的 error 分支无钉；`zod` 形态与 `via:'skipped'` 放行无钉（全仓 `safeParse` 在 test/ 与 scripts/ **零命中**）；`entrySource` 的 `package.json#main`/`index-convention` 无钉；② legacy 声明缺失的不回退分支无钉；`$from` 而 package.json 无 `"."` 的告警分支无钉；`module-load-failed` 文案无钉；array/union/boolean 表单渲染无钉；面板 `hostKey`/`DEPENDENCIES` vs `doctor-signals.json` 无守卫；`D-2` 的"三 tsconfig strict + test 链含 typecheck"仅门禁；`validateModuleExports` 生产零调用（空工厂）。
`docs/p0-recon.md` 的 REQ 表与四份正本的关系属**外部规格文档**，其"规格原文"不在本仓 ⇒ D-1/D-2/D-3 的偏差判定只能核到"仓内代码 vs 仓内文档"，规格原句无法就地复核（已在矩阵 §D 标 未核实）。

---

## 6. `contract.md` / `add-sub-plugin.md` 逐行判定（折入本文的两份）

图例：状态 = 已实现/部分/未实现；覆盖 = 有钉（指到断言行）/仅间覆盖/仅门禁/无钉。行号为当前 HEAD 实况；`契约=` 指 `contract.md`，`加=` 指 `add-sub-plugin.md`。

### 6.1 `contract.md`

一致（保留，仅列定位）：`§2` 表 `id`/`version`/`contract`/`panels`/`healthCheck`/未知字段=error（`:106-113/:123-129/:131-141/:159-176/:178-184/:94-103`，均有钉）；`§2.1` `envVars.key`/`ports` 范围/`externalApis.url`（`:231-236/:276/:325-339`）；`§3` 前缀三表与 fail-closed（`naming.ts:33-71`，`contract.test.mjs:229-241` + `p7-embed.test.mjs:191-203`）；`§4` `PluginSource` 两分支与 `source-not-supported`（`loader.ts:386-389`）；`§6` `PrecheckReport` 形状、`registerRule` 扩展点、周期巡检三参数（`doctor.ts:127-132/:423-447`，`doctor.test.mjs:230-248/:197-228`）；`§7` D-1/D-3/D-4/D-5 四条偏差**仍精确成立**（`semver.ts:11-19`、`types.ts:96`、`validate.ts:179-184`、`registry.ts:62-67`），`15904f6` 在链、`contract.test.mjs:81-99` 用例位置吻合。

落差（P0-1…P2-15 已在 §5 总账，此处补 §5 未收的条目）：

| # | 位置 | 落差 | 证据 |
|---|---|---|---|
| C-1 | `:3` | 「事实来源＝代码，逐条给 `文件:行号`」自我约束**未达**：11 处引用 6 处失效（`registry.ts:266→:381`、`loader.ts:135→:190`、`:110→:120`、`:233→:421-427`、`:181→:365-369`、`types.ts:158→:176`） | 无任何门禁核对文档引用（`scripts/` grep `contract.md` 零命中） |
| C-2 | `:4` | 偏差登记完备性未达：至少 4 处偏差未入 §7（`envVars.required`/`fsPaths.access` 实为必填、入口正典位改判、`install(force)` 逃生门、`docsUrl` 空壳） | 同上 |
| C-4 | `:9-10` | 「一个子插件 = 盘上一份 manifest + 模块导出」定义过强：legacy 无 manifest 也装（`loader.ts:431`） | `registry.test.mjs:188` |
| C-6 | `:17` | `displayName`"面板标题用它"，但缺失/空串既无夹具也无断言 | `validate.ts:115-121` |
| C-13 | `:20` | "`requires` 整体可选"这处放宽只被 `s6-contract-migration` 隐式钉住，无契约级直述用例 | `s6:73-82` |
| C-19 | `:28` | 指向 `migration.md §4`，该节两处交叉引用已失效（`#12`→现 C-1 第 1 项） | 见 §1 第 3 项 |
| C-22/23 | `:33` | `subPlugins` 的级别（warn 非 error）文档未写；`ENV_KEY_RE` 实际允许小写，与"形如 `MY_VAR`"略松 | `rules.ts:82-99`、`validate.ts:58` |
| C-30 | `:44` | `${prefix}/doctor` 服务名字面量无人校验（doctor 服务在容器里这件事只被 `toolkit-services` 侧钉） | `toolkit-services.test.mjs:49-83` |
| C-39 | `:63` | 「追加 npm 必须纯增量、不改契约」无机制保证，属不可测的设计约束 | — |
| C-42 | `:66` | 「`.` 与 `main` 两形态」文档未写"来源直接给文件路径时**完全不经顺位**"（`loader.ts:397-405`，`entrySource='explicit-file'`、`entryWarnings` 恒空） | `loader-entry-resolution.test.mjs:159-166` |
| C-57 | `:87` | `fix.docsUrl` 与 `autoFixId` 均为**类型有、零生产者、零消费者**的空壳字段 | 全仓 grep 仅 `types.ts:116` 与 `dist/` |
| C-63 | `:81` | §6 标题含"巡检的形状"，正文只给两个形状，`InspectionReport` 缺 | `types.ts:236-239` |
| C-65 | `:100` | D-1 措辞弱于实现：实际判据是"**任一**比较器带 prerelease ⇒ 整范围放行预发版"（跨 patch 更宽），文档写成像"仅同主次" | `semver.ts:11-19` |
| C-66 | `:101` | D-2 的"门禁必须跑 typecheck×3"仅门禁，无用例（廉价可补：断言 3 份 tsconfig `strict===true` + test 链含 typecheck） | `package.json:9/:14` |
| C-69 | `:105` | D-6 依据栏仍写"未清偿，交用户复核"，台账已翻面为"已裁定并入契约 v1.1"（`debt.md:109`） | 本轮裁定即其落点 |
| C-71 | `:110` | "桶在 **precheck 阶段** 判 `contract` 兼容"错位：闸门在 `validate.ts:137`，precheck 只翻译 | `loader.ts:416-419`→`registry.ts:485-504` |
| C-72 | `§2.1` 末（2026-09-22 裁定采甲**新增**条） | 事件订阅面的正典位置与语义此前**两份正本零提及**（`add-sub-plugin.md` 全文 `events` 零命中），而 7+4 条声明在盘上、面板在展示 ⇒ 反向缺口补全；同笔如实记其另一半：`registers.events` **两仓零校验**却当事实展示 ⇒ 建议登记 D-13（措辞待裁） | 实测 §10.4（探针 `var/scratch/c1-batch2-20260922/probe-events-face.mjs` 可复放）；展示点 `panel/client/index.js` 的 `TechDetails`、装配点 `panel/manager/snapshot.mjs` 的 `registers` |

反向缺口（实现有、`contract.md` 零提及，18 条）：`EntrySource` 7 值枚举、`entryWarnings` 通道（含 `event=entry-declaration` 落盘）、`$from` 继承指针、"显式声明必存在绝不回退"红线、D-15 成因文案、`mergeNamespaceStatics`/`PLUGIN_STATIC_KEYS`（6 键，非 3 键）、`extractRegisters`→注册冲突面、`setConfig` 写回+热重载+`value-invalid`、`install(force)`、`AUDIT_EVENTS` 8 名与 `durability`/`persisted` 面、扩展方法面（`registersOf`/`setHealth`/`retryAttemptsOf`/`attachHost`/`attachRegistry`/`publishReport`/`validate` 等，均不在两个 `interface` 内）、`InspectionReport`、`PluginStatus` 6 态与重试数字族（`retryLimit 3`/`retryBackoffMs 500`/`loadTimeoutMs 30000`/`saveDebounceMs 0`）、`notify()` 吞监听器异常（`emit-failed`）、autoload 恢复语义、`probeTimeoutMs` **惰选项**（声明+赋缺省但全文再未被读取，`apiReachable` 自己硬编码 3000ms）、`via` 的死值、面板对 `panels` 的透传。

### 6.2 `add-sub-plugin.md`

一致（作者可依赖，已核）：`:9-13` legacy 下限三件事、`:19-26` 双通道三分支写法、`:27-30` scoped 必写 `contract`、`:32-34` manifest 位置、`:69-71` 正典/legacy 位与 warn、`:72` 前两级未声明才兜底、`:77-81` `.` = 包主导出与"不代为挑选"、`:82-83` monorepo 候选、`:99` 五操作、`:100` confirm 纪律（除安装向导）、`:123` `npm test` 链、`:124` 回归 14 项、`:125` doctor dry-run、`:135-138` `path-not-found`/`entry-not-found`/`source-not-supported` 文案。

落差补充（§5 已收 P0-1/2/3、P2-10、P2-12 之外的）：

| # | 位置 | 落差 | 证据 |
|---|---|---|---|
| A-6 | `:12-13` | 「legacy 包装也拾取模块 `Config`」实现有（`loader.ts:371/378`）但**无钉**——现有 legacy 夹具不导出 `Config` | 唯一带 `Config` 的夹具是契约插件，走 `:421-427` 另一分支 |
| A-15 | `:63` | 「**三级**正典顺序…本节是**单一事实源**」：实为 4 级，且"单一事实源"三副本并存（`loader.ts:13-21`、`registry/src/types.ts:55-57`、`contract.md:64-66`），无任何一致性用例 | `types.ts:56` 自己要求"三处同步" |
| A-17 | `:65-68` | 「doctor **逐条**断言目标文件真实存在」：`engine.mjs:557` 只对 `startsWith('./')` 的条目断言 ⇒ `x.js`、`/abs`、`file://` 一律放过 | 两侧皆无测 |
| A-18 | `:68` | 「套件根**可**写 `$from`」语气可选，doctor 实为**强制**（`:424-426` 非 $from ⇒ error；`:416-419` 非套件根用 $from ⇒ error），而 loader 照单全收 ⇒ 按本文写会撞 doctor error | 已核 |
| A-20/22 | `:71-76` | `entrySource` 七值只钉 4（`package.json#main`、`index-convention` 零断言；`package.json#exports` 那条还是条件 skip） | §5 数法③ |
| A-21 | `:73-74` | 红线只覆盖 ①②，**③④ 仍静默回退**（`loader.ts:99-101`、`:249-252` 目标不存在就落下级），与"回退就是掩盖不同步"的立论冲突；② 那一半还无钉 | 需裁定是否把 ③ 纳入不回退 |
| A-26 | `:87` | "configSchema 零默认值"是仓内口径但**无任何判据**（`validate.ts:154-157` 不查 default） | — |
| A-27 | `:88` | 表单渲染承诺"object/array/union/boolean/number/string"：`client/index.js:1765-1818` 只有 object 真递归；array 退化为逗号文本（对象数组装不出来）、union 取 `item.value`（schemastery list 项一般无 `value`）；根节点非 `type:'object'` 时文案是"插件未声明 configSchema"（`:1885`，不实） | boolean/array/union 零断言 |
| A-28 | `:88-89` | "保存前服务端真校验"有静默放行分支：`via:'skipped'` 时 `ok:true`，`registry.ts:397` 只看 `ok` ⇒ schemastery 不可用时任意配置可写回 | 已核（V5） |
| A-32 | `:100` | "**所有**写操作都要逐字 confirm"——`install/confirm` 不要求（`v2-api.mjs:345-359`），配置保存不经勾选 | `panel-v2.test.mjs:263-298` |
| A-36 | `:110` | 「红线（**AGENTS.md 六条**）」本节只列 5 条且编号错位（AGENTS 第 4 条被改写为"面板/引擎零硬编码"） | `AGENTS.md:5-10` |
| A-44 | `:130-132` | "每条 blocking 都带 `fix.summary`/`fix.steps`"：manifest-issue 派生的 blocking 只有 summary 无 steps（`doctor.ts:189-194`） | — |
| A-47 | `:136` | `module-load-failed` 文案半边无钉 | grep 仅命中 `loader.ts` 与 `sourceFixAdvice` |
| A-49 | `:130-138` | §7 错误码清单只给 5 类来源码，作者最常撞的 `id-conflict`/`service-missing`/`reg.name-collision`/`config-schema-invalid`/`value-invalid`/`fiber-*`/`quarantined` 全部未列 | — |

反向缺口 12 条（作者会撞上、指南没说）：explicit-file 绕过顺位、重试/退避/隔离/超时全族、`requires.subPlugins` 第 8 条规则、`requirements.registers.inject` 被独立 doctor 校验（`reg.inject-face-unknown`，本文唯一没提的旧字段消费点）、无 `toJSON` 的函数型 `Config` 拿不到表单但 `setConfig` 能校验、`{uid,refs}` 解引用只在 `contract.md` 有记、`entryView`/`durability`/卡片"未落盘"黄字面、monorepo 候选只扫 `packages/` 且 ≤8、legacy 合成的 `displayName`/`version` 缺省来源、单命令全链其实是 `ci-local.mjs`、`validateModuleExports` 空工厂、`mergeNamespaceStatics` 就地改写导致两通道串扰。

---

## 7. 语义倒置的实测复现（不是推演）

探针 `var/scratch/c1-recon-20260922/probe-collision-falsepositive.mjs`（真 `resolveLocalSource` + 真 `DoctorService.precheck`；只把 registry 容器换成桩，桩返回的 `manifest`/`registers` 两字段与 `registry.ts:446` 实际写进条目的完全同构）。原文输出：

```
场景 1：两个插件只是【共同依赖】同一个宿主服务 webServer
   A 解析：id=probe/needer-a entrySource=index-convention
     requires.services=["webServer"]        ← 语义：A 【需要】webServer
     extractRegisters 产物={"services":["webServer"]}  ← 却被记成 A 【提供】webServer
── 装 B（同样只是需要 webServer）
   pass=false  blocking=reg.name-collision  条数=1
     ⚠ 与已注册插件 "probe/needer-a" 注册面冲突：服务 webServer
场景 2（对照）：C 依赖另一个服务      → 碰撞数=0
场景 3（对照）：Y 与 X 的 commands 真撞名 → 碰撞数=1（"命令 do-thing"）
判定：假阳性成立；且真撞名仍可检出 ⇒ 是语义倒置，不是判定失效
```

**端到端可达路径（须真机确认，此处只作预测）**：`docs/embed-toolkit.md` §2 的 P7 场景就是"把 toolkit 当普通插件经 registry 装入"。桶根 manifest 实测带 `requires.services=["webServer"]` ⇒ 一旦有人**先经面板装 toolkit 根、再装任何需要 `webServer` 的插件**，第二装就被阻断。**边界**：仓内探针≠端到端；该链路未真机走，且 `~/.dsh` 与宿主未动。若协调侧要一口实证，最小动作是在 mock 桶里按 `embed-toolkit.md §2` 装两次（写面板状态文件，需单独授权）。

---

## 8. 三题裁定 × 核对结论

### 8.1 题 1 `requires↔inject`（裁定：条件裁决，先出专项核对）

**文档对"获取语义"的承诺是什么？** 只有两处，且都不承诺自动唤醒：
- `docs/embed-toolkit.md:35` —— `registry.retryLimit`/`retryBackoffMs`/`loadTimeoutMs`/`saveDebounceMs` = **3 / 500 / 30000 / 0**，标注「错误隔离与退避（REQ-6）」。
- `docs/p0-recon.md:97` REQ-6 —— 「每子插件独立派生 ctx；加载/运行错误捕获 → `status=error/quarantined` + `lastError`；**指数退避重试（默认 3）**；dispose 级联清理」。
- `docs/migration.md:30` —— registry 运行态落盘"安装记录/enabled/config/隔离原因/lastError"，"重启后按 `autoload` 恢复"。
⇒ **重试退避即文档正典**，`contract.md` §6 一个重试数字都没写（属 §5 反向缺口，须补文档）。

**测试钉了哪些场景？**（逐条指到行）
- provider 晚到 → `cordis-inject-lifecycle.test.mjs:69`（PENDING 放成 ACTIVE，apply 恰 1 次）
- provider 撤走 → `:86`（**钉的是分歧本身**：cordis 已撤、registry 仍报 `active`）
- provider 回来 → `:115`（重新跑 apply，registry 无需动作）
- **consumer 重试边界** → `:134` 标题即结论：「install 全局互斥挡住 provider，consumer **靠重试退避才转 active**」；配套 `registry-retry-count.test.mjs:93/:114/:143`（当段计数、到上限才隔离）
- 前提对照 → `:52`（只有模块 `inject` 让 cordis 设门，manifest 声明不设门）

**裁定落点判定（走 §二.2 分支）**：文档未承诺自动唤醒 ⇒ **真相收口 + 补测试钉住即收口**；合成 `inject` 确认单独立项（必答"与 cordis 上游 REQ-6 对齐还是自创"，已记 debt.md 队列）。
但 §二.3 同时生效：三句文档承诺与实现不符，**不许带出 v1.1** —— P0-1（`缺席类只产 warn/info`）、P0-2（`requires.services 即 inject 面` + 示例自带撞名）、以及 §5 的 C-11 类缺口（重试数字未写）。
**收口必须翻面的钉子（裁定一.a）**：`test/cordis-inject-lifecycle.test.mjs:86-113` 现在钉的是"registry 仍报 active"这一**假象**；真相收口后该断言必须**翻面**（依赖撤走 ⇒ 条目不再报 active），否则收口不可回归。
**撤回我上轮的一条理由**：上轮我用"对内置零收益"倾向砍掉桥接——按裁定修订 §二.4，该理由**不成立**，标准是文档↔实现一致性而非内置使用率。改以"文档正典本就是重试退避"为据。

### 8.2 题 2 doctor `exports` 分叉（裁定：契约不管入口必填性、doctor 独占；`.` 语义不动）

逐句核对结果在 §6.2 的 A-15/17/18/21 与 §5 的 P1-6/P1-8。裁定要兑现的四件事：
1. **管辖边界写进契约文本**：本仓管**解析行为**（四级顺位、正典在下、`$from` 继承、显式声明不回退 = 裁定 10 全文），doctor 管**必填性**（`REQUIREMENT_KEYS` 五键 + `./` 目标存在性 + `$from` 的套件根专属）。二者不再互相打脸的前提是：`contract.md` 停止描述入口顺序、改指向 `add-sub-plugin.md`（**同时终结"单一事实源"三副本**）。
2. **`.` = 包主导出如实记载**：`add-sub-plugin.md:77-81` 已写对，须同步进 `contract.md`（现完全缺席）与 `migration.md:17-19`（现把顶层 `exports` 说成 info 容忍）。
3. **对账用例进门禁**（不是手动脚本）：走既有 `DOCTOR_CLI` 通道（`ci-local.mjs:18` 已按绝对路径调 doctor，`p24-verify`/`p24-ui-matrix` 已有 tmp 副本跑 doctor 的先例），断言"契约侧合法的纯契约 manifest"在 doctor 侧报什么（预期 `schema.required-missing` ×3 + `requirements 缺 exports`），把分叉**钉成可见事实**而非口头。
4. **npm 来源关联查证（只标关联不合并）**：`contract.md:61-63` 的 `{kind:'npm'}` 预留与"入口声明字段"同源——npm 包的入口天然在 `package.json#exports`，若将来实现 npm 来源，第③级顺位会从"兜底"变成"主路径"，届时 `requirements.exports` 正典与包主导出必须再裁一次。**标记关联，本轮不并任务。**

### 8.3 题 4 一致性论证：题 2 与题 3 前提**不矛盾，但有一条静默作废的耦合**

- 题 2 给 doctor 的是：`requirements` **键集**必填性（`engine.mjs:387-391`）+ `exports` 目标存在性（`:548-577`）。
- 题 3 要求 v1.2 doctor 撤的是：**根字段**必填性 `manifestVersion`/`name`/`requirements`（`:330-337`）。
⇒ 两组规则在 `validateManifest` 里同函数但不同段落，**撤后者不等于撤前者** ⇒ 不矛盾。
**但**：`:387-391` 的整个键集校验是 gate 在 `rec.parsed.requirements` **存在**之上的（`:386` 先判 `isObject(req)`）。一旦 v1.2 允许契约式 manifest **不带 `requirements`**，题 2 交给 doctor 独占的那份必填校验就**自动空转**——纯契约 manifest 一条 `requirements` 检查都不会跑，且不会报红。这才是真风险。
**修正方案（随 C-2 一并裁）**：v1.2 撤根字段必届时，必须把题 2 的管辖面从"`requirements` 必填五键"改述为"**`requirements` 在场时**其键集与目标存在性归 doctor；`provides`/`requires` 的合法性归契约"，并让 §8.2 第 3 条那枚对账用例覆盖"**不带 `requirements` 的纯契约 manifest**"这一形态，使空转变成可见断言。⇒ 两题结论在加上这条之后**逻辑一致**。

### 8.4 第 4 项改裁 B 的落地口径（裁定五：默认 B）

**五.a 的"失真即停"条件已命中，A 不成立**：`snapshot.mjs:371-377` 现在输出的键名是 `registers.{events,services,commands,providers}`，其中 `services` 对桶根而言**装的就是依赖数据**（`requires.services=["webServer"]`），键名叫"注册面"却装着"依赖" ⇒ 键名指东、数据装西。故按裁定采 **B：输出面按文档正确语义命名**，`p1-smoke` 断言如实更新，**方案报用户批准**。

B 需要两处新裁定（执行侧不自裁）：
1. **`events` 槽位无家可归**：草案的 `provides = {services?, commands?, providers?}` **没有 `events`**，但 5/5 lib manifest 都带 `requirements.registers.events`（agent-memory 7 条、rate-throttle 4 条），且面板技术详情在展示它。三选一：① `provides` 增 `events?`；② 保留一个 `subscribes`/`events` 平级字段；③ 从面板移除该展示。**建议 ① 或 ②，因为它同时消掉一处"契约无表达"的同类缺口。**
  【**裁定 23 的批 2 前置实测已回，见 §10.4**：11 条声明**全部是监听面**、生产代码**零发出**、混合 0 样本
  ⇒ ① 不采（`provides` 按定稿三槽，不加 `events`，否则成空壳字段）；③ 本就不采纳；余下唯一待裁的是
  这 11 条的家在 `requires.events`（甲，零 doctor 改动）还是新根字段 `subscribes`（乙，须再一笔白名单）。】
2. **`inject` 键名**：面板技术详情的 `inject` 取自 `requirements.registers.inject`（依赖面）。v1.1 正确语义下它对应契约的 `requires.services`。若一并改名，`p1-smoke:337` 的字符串在场断言（`["managedBy","inject","services","commands"]`）要跟着翻；若不改名，则输出面同时存在 `inject`（依赖）与 `provides`（提供）——反而更清楚。**建议不改 `inject` 名，只改数据来源。**

**须更新的断言清单（请批准这三处，其余 311 条不动）**：`p1-smoke.mjs:295`（5 卡计数，仅当输出形状变才动）、`:337`（字段名字符串）、`:305`（doctor 0/0/0 —— 这条属批次序问题非改名问题，见 §9）。
**五.b 的"换源变异证据"要求**：B 落地批次必须带一发变异——改 `provides` 源数据 ⇒ `snapshot` 输出随之变化且断言仍绿；只声明"换了源"不算（对齐 A#25 的 MUT-H 与 A#22 的防再犯口径）。
**五.c**：旧键名将来是否再改名属未来事项，本笔不为它预支任何动作。

---

## 9. doctor 仓基线（裁定补条六，方案一已执行）

跑前 `git status` 空、HEAD `6839cc1`；**跑后仍空、HEAD 未变**（自证两仓零改动）。四个 tmpdir 隔离套件**全绿**：

| 套件 | 结果 | 覆盖面概括 |
|---|---|---|
| `test/run-tests.mjs` | **14/14** PASS（exit 0） | 引用/别名改写、词界、根归属、schema 语法/BOM/必填缺失、`test/` 目录排除、幂等、apply→0 error 复扫、保护路径、锚点漂移、回滚、文件 op、install-package、并发锁 |
| `test/run-tests-stage4a.mjs` | **8/8** PASS | env 版本、二进制缺失、包缺失/版本冲突、`schema.$from-dangling`、**`reg.name-collision`（services+providers）**、`reg.inject-face-unknown` |
| `test/run-tests-stage4b.mjs` | **7/7** PASS | `pkg.resolution-outside-scope`（junction + 真外部目录）、install-package 影子三态（含 `*.bak-*` 拒、symlink 目标拒） |
| `test/run-tests-d1.mjs` | **21/21** PASS | CLI `--states`/`--only`/错误码/回滚字节相等/`--help`/非交互 `--yes` 拒答/**真实 `~/.dsh` 无 doctor 产物** |

可跑性：`package.json` **无 `scripts`**、无 `node_modules`（零依赖 4 源文件）⇒ 只能 `node test/xxx.mjs` 直跑，无依赖性失红风险。
**未执行验证（盲区，如实标注）**：`test/acceptance-stage3.mjs`（a–g 七块）——其 e) 块以**真实 toolkit 仓为 scope 根**跑 shadow apply，写盘落 tmp 但报告 root 含真实仓 ⇒ 本轮只读红线内不跑。它对 v1.1 的意义：doctor 侧唯一会**同时**触到两仓真实状态的套件，建议在获裁后首个动代码批次里作为批 0 尾项跑一次（并保留 `--only` 单条语义以便失败可归因）。
另一处：`run-tests-stage4b.mjs:172` 建 junction 在本机权限下实测可用（本轮 7/7 含该例）⇒ 该前提**由静态推断转为已证**。

---

## 10. 分批计划（2026-09-22 条文审定后重排版，取代本节此前的 v1 草案）

判据不变：批次 = **独立门禁绿 + 独立回退**的最小单元；每批验收显式含 **门禁 5/5 + 变异自检 + 证据滚存**；
涉行为变更批标真机（现场实证为准、不做时点承诺；"重启后生效"类句子收尾前复查现场）；
两仓编排：doctor 白名单先落、批内分笔、互引 hash。

> **★验收口径变更（2026-09-22 协调侧批 1 验收令，裁定方：协调侧／用户授权）**：自**批 2 起** doctor 侧
> 验收由"四套件不降"改为**"五套件不降"**（加 `test/acceptance-stage3.mjs` a–g）。两条安全前置制度化：
> ① 每次复跑 stage3 前先以只读方式确认真实仓 `fixable 0`，非 0 则**停、报告、待裁**（不跑不赌）；
> ② 真实 `~/.dsh` 扫描面 hash 的前后比对为固定证据，基线读数
> `c585738c646855d4e6745c9e64434899dd75693526f809313002060ebfce0bd9`（5 files，批 1 实测）；hash 漂移时
> 先归因（宿主自然写入 vs stage3 所致）再放行，**归因不清即报告**。
> 上方各批行里"四套件 14/8/7/21 不降"的表述按当时口径成立，**不回改**。

**本轮被裁定移除的批次项**：P0-1 的"缺席类降级为 warn"代码项（定稿=维持 error，改文档处理）、
"补 `localhost` 识别"代码项（定稿=文档示例改 `127.0.0.1`）——两笔原裁决因 §5.2 原因查明而作废反转。

| 批 | 内容 | 仓 | 验收口径 | 真机 |
|---|---|---|---|---|
| **批 0** | **定稿笔（本笔，已完成）**：四份正本按 20 条定稿修订 + `p0-recon.md` 第五处错账 + 本文并入 §5.2 原因表 + `debt.md` 审定记录/教训条/作废记录 | toolkit，纯 docs | 门禁不需重跑（纯文档），但复跑受影响判据面以自证：doctor 真实仓 dry-run（实测 `exit=0`，且实测 doctor 只扫 `.json`/`.cordis.yml`、`.md` 不进扫描面）+ `q2-layer-scan` 14/14；`git status` 非 docs 文件必须为空 | 否 |
| **批 1** | doctor `MANIFEST_TOP_KEYS` 加 `provides`（零值校验，照 `requires`/`panels` 先例）；**补跑 `acceptance-stage3.mjs`** 还 §9 盲区 | **doctor**（首次动代码，独立可 revert） | doctor 四套件 14/8/7/21 不降 + 真实仓 dry-run 仍 `0/0/0`；变异：摘白名单 ⇒ toolkit 侧 `provides` 夹具报"清单根字段非法" | 否 |
| **批 2** | C-1 第 1 项：契约加 `provides`（类型 + 白名单 + 结构校验）+ `extractRegisters` 优先读 `provides` + **`requires.services` 退回纯依赖面**（★1 的行为半边、P0-2 了断）+ DOCTOR_CLI 行为对账用例**进门禁**（题 2 条件 a） | toolkit | 门禁 5/5 + `0/0/0`；用例三发：`provides` 撞名被阻断、**共同依赖不判撞名**（对偶，已备复现夹具）、纯契约 manifest 在 doctor 侧报什么；变异三发（摘优先读 ⇒ 第①翻红；塞回借用 ⇒ 第②翻红；摘对账用例 ⇒ 门禁步数可查）；判据基准 `cordis.patch.yml` 未动 ⇒ 如实记"未变、不滚存" | 否（宿主零消费，§3 实测） |
| **批 3** | ★2：把模块导出的 `healthCheck`（及 `panels`）绑进 manifest，接通读方已在的消费链 | toolkit | 门禁 5/5；用例走**真装载链**（不许再用手工注入条目视图替代）；`doctor.ts` 的 `healthCheckTimeoutMs`/失败计入降级同时被真实路径覆盖；**受影响插件清单见本节末**（内置激活面 0 ⇒ 无回归面）；变异：摘绑定 ⇒ 新用例翻红 | 否（内置不经 registry；面板侧若显示健康项则顺带观察） |
| **批 4** | ★3：configSchema 两处都在 ⇒ **模块导出赢**（含 `validate.ts` 注释、`doctor.ts`、`registry.ts` 三处同序消费方） | toolkit | 门禁 5/5；新用例"双在场 ⇒ 模块值生效"；**存量前提已实测**：门禁第 4 步 `patch-config-check.mjs` 已按宿主语义（`unwrapExports` + `Config['~standard'].validate`）校验过真实 patch 行 ⇒ web-search-local 的模块 14 键 Config 认现有配置 | **是**（本批改动宿主通道与本仓通道对同一入口的口径合流，须真机确认宿主装载与面板表单都照常） |
| **批 5** | ★16：校验降级（`via:'skipped'`）不再返回 `ok:true` 而谎称通过 —— 状态如实透出并让两个调用方看见 | toolkit | 门禁 5/5；用例须同时钉"构建失败 ⇒ 保存被拒/被标注"与"正常路径不受影响"；`config-schema-invalid` 规则的既有断言不得放宽 | 否 |
| **批 6** | ★10：`entry-not-found` 不回退红线**扩到第③级**（package.json 的 exports/main 指向不存在文件时不再静默落 index.js） | toolkit | 门禁 5/5；**存量核验已过**（见本节末）⇒ 新红线不打断任何仓内声明；用例补 ③ 的两个形态（exports 字符串 / main）各一发；变异：改回静默回退 ⇒ 期望第②级既有用例之外的新用例翻红 | **是**（改的是装载行为，按 A#22 口径真机过装载） |
| **批 7** | ★13：面板守卫扩面（`p4` 判据从"5 个内置名"泛化 + 扫描面覆盖 `panel/manager` 其余文件） | toolkit | 门禁 5/5；守卫自证：造一个"面板文件里出现第三方插件字面量"的反例 ⇒ 期望红；既有的"有意保留"例外（patch 域生命周期区）必须显式列入豁免并写清依据（否则与 `migration.md` §4 前置 2 打架） | 否 |
| **批 8** | ★19：`install/confirm` 补逐字 confirm（含客户端按钮与"确认安装"文案） | toolkit | 门禁 5/5；`p1-smoke` 路由数与断言条数不变（314）；面板测试补 confirm 缺失 ⇒ 400 一发；改的是用户操作面 ⇒ 客户端与服务端同批，禁"只改服务端导致按钮点了没反应" | **是**（用户操作面真机可验） |
| **批 9** | C-1 第 2 项：`audit:*` 入枚举 + 收编 `audit()` 拼装 + 客户端孪生表随动 | toolkit | 门禁 5/5；**零线格式变更须被证明**：8 条名字在收编前后逐字节相等的断言（探针已给基线读数）；`panel-sse-dispose` 的 `5 + AUDIT_EVENTS.length` 与 `toolkit-root` 孪生表核对不得手改字面量 | 否 |
| **批 10** | C-1 第 4 项（按 §4 实测名单）：`provides` 补 **compact-router / search-router / web-search-local** 三份 + **桶根**（纠正倒置）；`rate-throttle`/`agent-memory` 注册面为空 ⇒ 空即如实不补；`panel/` 不动并记档 | toolkit | 门禁 5/5 + `0/0/0`；`q2-layer-scan` 只扫 `lib/*`（桶根不在其计数内）须写明；若与 §11 的输出面改名同批，须带协调侧条件 b 的换源变异证据 | 条件真机（面板可见面变化时） |
| **批 11** | C-1 第 6 项：`PLUGIN_CONTRACT_VERSION` → `1.1.0`；`doctor.ts` 的 `'1.0.0'` 字面量改引用常量；版本字样与迁移说明。【2026-09-22 归属更正：**本批只动 toolkit 仓**——`doctor/src/doctor.ts` 是 toolkit 子包路径，独立 doctor 仓 `projects/doctor` 全仓零契约版本字样 ⇒ C-1 期该仓仍只批 1 一笔；实测影响面与**两处计划漏项**见本节末"批 11 影响面" | toolkit | 门禁 5/5；实测对偶已备（`^1.0` 放行 1.1.0；`^1.1` 在 1.0.0 上判不通过 ⇒ 文档明写"勿提前写 `^1.1`"） | 否 |
| **不排批** | C-2（v1.2 收紧，前置含"撤必填会令键集校验静默空转"的连带修正）；D-18/D-19（题 1 两项推迟，立项必答"与 cordis REQ-6 对齐还是自创"）；`agent-memory` 的 `.` 语义（破包语义 ⇒ 主版本级） | — | — | — |

### 10.1 两个评估项的结论（进 v1.1 还是后置，请协调侧定）

**★11 面板状态实时化**：技术前提已核——`entry.fiber` 由 registry 长期持有
（`registry/src/types.ts` 的 `FiberLike` 带 `state`），`setStatus` 已是"单点修、三面同步"的成熟收口点
（A#18/A#20 两个先例），事件面可直接复用既有 `registry:status-changed` ⇒ **面板与 SSE 零改动**。
四件活：周期性"实况对齐"（必须走 registry 既有 timers 封装并纳入 `stop()`，否则会污染
`panel-sse-dispose` 的句柄计数——环境注记②有前科）、fiber→status 映射定义（不得与
"隔离后不自动重试"打架）、**必须翻面 `test/cordis-inject-lifecycle.test.mjs` 那条钉"仍报 active"假象的断言**
+ 新增撤依赖/回恢复用例、与 doctor 巡检 `service-missing` 的分工写清（否则面板同屏两处真相不一致）。
风险点：`ACTIVE↔PENDING` 抖动会变成事件风暴，需要去抖或滞后判定。**判断**：与批 5 同期做收益最大
（同为"别把未成立的事说成成立"），但它**不是** v1.1 任何一条的前置 ⇒ 若压缩面积可后置，
文档半边本轮已定稿、且 doctor 巡检是已存在的补偿控制。

**★17 array / union 表单真渲染**：实测是**单点**改动——`panel/client/index.js` 的 `v2RenderField`
array 分支（约 `:1793-1800`），且 `panel/client/panel.html` **根本不渲染配置表单**（关键字 0 命中）
⇒ 没有内联孪生要同步，成本比预估低。工作量在"对象数组的逐项编辑 + 值收集回写 + union 的
schemastery list 正确读法 + 面板测试（`panel-unified` 按 label 定位的风格）"。
**需求侧事实**：内置 manifest 里的 array 共 8 处、**全部是一维字符串数组**（`throttleProviders`
`logProviders` `excludeProviders`? 属 staticGroups 的对象数组在 schema 之外、`officialProviders`
`officialProviderPatterns` `officialModelPatterns` `engines`），**对象数组 0 处** ⇒ 真渲染的收益只对外部插件。
**判断**：属"文档已如实、实现按需"类，可后置；若进 v1.1，建议与批 5 同期（同在配置校验/呈现面上）。

### 10.2 两个前置核查的结果（协调侧条件 3、4 要求的清单）

- **★2 激活面清单（批 3 前置）**：`index.js`、`lib/*/index.js`、`lib/*/plugin.js`、`lib/*/lib/*.js`、
  `panel/index.js` 全量 grep ⇒ **模块导出 `healthCheck` 0 处、导出 `panels` 0 处**；唯一带 `panels` 的是
  桶根 manifest 里那个 JSON 描述符（落盘形态，不走模块绑定）。⇒ 绑定接通后**没有任何内置行为会突然生效**，
  风险面限于"第三方插件的 healthCheck 第一次真的开始跑"（含超时/失败计入降级的新路径）。
- **★10 存量声明核验（批 6 前置）**：`package.json#exports` 12 个条目目标**全部存在**（逐一实测）；
  7 份 manifest 的 `requirements.exports` 目标亦全部存在，且独立 doctor 的 `buildExportTargetIssues`
  今天就在对 `./` 条目做存在性断言 ⇒ **真实仓 `0/0/0` 本身已隐含"存量声明无一缺失"**。
  ⇒ 把红线扩到第③级不会打断任何仓内声明；需新增测试的只是"指向缺失时须报错而非回退"这一行为本身。

---

### 10.3 批次执行记录（滚存追加区，一笔一段）

> 口径：本区**只追加不回改**上方计划表与 §9 原文（"错误照录、修订滚存"）；每批记
> "做了什么 / 实测数字 / 变异证据 / 未做与边界"。计划与现场不符时以本区为准并在段内说明。

**批 1 · doctor 根字段白名单加 `provides`**（施工面在另一仓 `projects/doctor`，本仓纯 docs）

- 笔：doctor `2f12f53`（单父笔、独立可 revert），互引基线 toolkit `af803b2`（批 0）。
  改动 = `MANIFEST_TOP_KEYS` 补一个键名 + 一行注释，加 `test/run-tests.mjs` 新增 1 例，共 2 文件 `+29/-1`。
  **零值校验照 `requires`/`panels` 先例（`6839cc1`）**：键名合法性归本 CLI，`provides` 的值语义
  （`{services?,commands?,providers?}`）留批 2 在 `contract/src/validate.ts` 落 ⇒ 不新增 issue 种类、
  issue 结构与输出 `schemaVersion` 不变。
- 实测：doctor 四套件 **15/8/7/21**（`run-tests` 14→15，计划要求的"不降"成立）；真实仓 dry-run
  `--scope D:/dsh-plugins/dsh-toolkit` ⇒ `issues: 0 (error 0, warning 0, info 0, fixable 0)`、exit 0；
  本仓门禁动 doctor 后复跑 **5/5**（64.2s，第 3 步即消费改后引擎）。
- 变异自检：摘掉白名单里的 `'provides'` ⇒ 新用例翻红并报 `"清单根字段非法: provides。"`
  （`severity=error`、`category=schema`、`fix.class=manual`，与摘前结构一致）；恢复后复跑 15/15。
  **摘除态真实仓仍 0/0/0** ⇒ 这个键当前对存量 7 份 manifest 零影响，纯为批 2/批 10 预留通道。
  新用例自带反向钉：同 manifest 再写一个拼错根字段 `provids` 必须**且只**报一条 ⇒ 防白名单退化为放行一切。
- **还 §9 盲区**：`test/acceptance-stage3.mjs` a–g 七块**全 PASS**（exit 0）。e) 真实影子块跑前/跑后
  真实 `configRoot` 扫描面 hash 同为 `c585738c646855d4e6745c9e64434899dd75693526f809313002060ebfce0bd9`
  （5 files）⇒ 真实 `~/.dsh` 零写入；跑后本仓 `git status --porcelain` **空**、HEAD 未变 ⇒ §9 当年按
  "写仓风险"回避的那个 e) 块，实测路径是**只读真实 scope + 写影子 tmp 目录**（该块唯一 fixable 来自
  注入到影子 config 的旧名预设；跑前已先实测真实仓 `fixable 0` 作为前置）；d1 的"真实 `~/.dsh` 无 doctor 产物"同轮仍绿。
  **建议**（未成文、待协调侧裁）：后续批次把 stage3 纳入 doctor 侧常规复跑面；未裁前仍按 §10 各批口径执行。
- 未做与边界（如实）：未重启宿主、未碰真实引擎配置与 `~/.dsh`（批 1 非真机批，真机窗口仍留批 4/6/8）；
  `cordis.patch.yml` 判据基准 `e8051fe9` **未动 ⇒ 未变、不滚存**；探针目录 `var/scratch/c1-recon-20260922/`
  按协调侧令暂留未清。
- 前置状态：`docs/debt.md` C-1 现状块 ⑤（"分批计划过裁前两仓代码一行不动"）的过裁条件已满足
  （批 0-11 + 改名批 + 五修正，2026-09-22 协调侧过裁令）⇒ 本批为该裁定之后的**首笔动代码**，
  debt.md 原文按"错误照录"未改写，状态以本区为准。
- 连带事实（供后续批引用）：本仓门禁第 3 步经 `DOCTOR_CLI`（缺省 `D:/dsh-test-sandbox/projects/doctor/src/cli.mjs`）
  直读 doctor 源码 ⇒ doctor 的任何改动都被本仓门禁每轮复跑覆盖，故两仓任一笔动完须复跑门禁 5/5。
  本区引用为**函数/键名定位**，未写行号（§11 首条规矩）。

**批 1 验收结论与裁决落盘（2026-09-22 协调侧批 1 验收令）**

- 批 1 **验收通过**（三件套齐 + 边界干净）。上一段里"是否把 stage3 纳入常规复跑面"的**待裁标记就此撤销：已采纳**。
  自批 2 起 doctor 侧口径 = **五套件不降**，两条安全前置（`fixable 0` 先确认、hash 基线比对与归因）
  已制度化写进 §10 判据段的裁定引用块。交接基准随之更新为 toolkit `46f8b94` / doctor `2f12f53`。

**批 11 影响面（2026-09-22 归属考古 · 提前做是因为"批 11 doctor 仓归属"本是五修正里的待澄清项）**

协调侧定案时按路径 `doctor/src/doctor.ts:464` 推"批 11 = 独立 doctor 仓第二笔"。本轮实测：**行号准确、归属仓错**。

- `doctor/src/doctor.ts:464`（`ToolkitDoctor.validate()` 里的 `versionSatisfies('1.0.0', manifest.contract)`）
  实在 **toolkit 仓**的子包 `doctor/` 下。独立 doctor 仓（`projects/doctor`）**没有 `doctor.ts`**（只有
  `cli.mjs`/`engine.mjs`/`executor.mjs`/`host-faces.json`），且其 `src/` 全量 grep `1.0`、`^1.0`、契约版本字样
  **零命中** ⇒ 独立仓与版本笔无关，**C-1 期间该仓仍只批 1 一笔**（"两笔"口径按兜底条款更正，不算违裁）。
- **成因**（按"错账必查成因、同步所有引用处"办）：两仓路径同族（toolkit 的 `doctor/src/…` 对 `projects/doctor/src/…`），
  而 recon 与 debt 里的引用一贯写作 `doctor.ts:347`/`engine.mjs:363` **不带仓前缀** ⇒ 读者只能靠猜。
  与 §5.2"文档抄文档、丢限定语"同族。自此立规矩并同步：本 C-1 文档面**跨仓引用一律带仓前缀**
  （`toolkit:doctor/src/doctor.ts` / `doctor仓:src/engine.mjs`），这条同时是 D-20 引用守卫的判据之一。
- 批 11 动工时的实测影响面（比计划文本宽，②③为**计划漏项**，本轮自曝滚存）：
  ① `toolkit:contract/src/types.ts` 常量本体 `'1.0.0'`；
  ② `toolkit:doctor/src/doctor.ts` 的 `'1.0.0'` 字面量改引用常量（计划已列）；
  ③ **漏项**`toolkit:contract/src/validate.ts` 的 fix 提示串内嵌 `'范围须放行 1.0.0，如 ^1.0'`
  （同处 message 已用 `${PLUGIN_CONTRACT_VERSION}` 插值 ⇒ 只有提示串是硬编码），相邻的
  `'契约版本范围，如 ^1.0'` 提示同性质；
  ④ **漏项**`toolkit:test/contract.test.mjs` 钉死 `PLUGIN_CONTRACT_VERSION === '1.0.0'` ⇒ 提升必翻面（按裁定 15 走，须说明语义等价）；
  ⑤ 存量 6 份 manifest 的 `"contract": "^1.0"`（桶根 + 5 个 lib）**判定为不动**，依据为本轮第一手复测：
  `versionSatisfies('1.1.0','^1.0')=true`、`versionSatisfies('1.0.0','^1.1')=false`、
  `versionSatisfies('1.1.0','^1.1')=true`（常量现值实测 `1.0.0`）⇒ 与 §10 批 11 行那句"对偶已备"吻合，
  且"勿提前写 `^1.1`"的红线得证；
  ⑥ 文档字样面（`docs/` 6 个文件 + `CHANGELOG.md` 命中 `1.0.0`/常量名）**未逐条判定**，留批 11 动工时按本清单收。

---

### 10.4 批 2 前置实测：`events` 槽位判定（裁定 23 要求的先测后动）

判据（协调侧裁定 23）：逐条判"发出 → `provides.events` / 监听 → `subscribes` / 混合 → 上报"；
"从面板撤展示"（§8.4 的 ③）**不采纳**。探针：`var/scratch/c1-batch2-20260922/probe-events-face.mjs`（只读、可复放）。

**净账：声明 11 条，监听 11 条，发出 0 条，混合 0 条，"监听了但没声明"的缺口 0 条。**

| 单元 | `registers.events` 声明 | 该单元 `ctx.on` 实况 | 逐条判定 |
|---|---|---|---|
| `toolkit:lib/agent-memory` | 7 | 7（`plugin.js` 七处，与声明 1:1） | **全为监听** |
| `toolkit:lib/rate-throttle` | 4 | 4（`index.js` 四处，与声明 1:1） | **全为监听** |
| `lib/compact-router`、`lib/search-router`、`lib/web-search-local`、桶根、`panel/` | 各 0（键在、值为空数组） | 各 0 cordis 信道监听 | 无声明可判 |

承重证据两条：
1. **生产面零发出者**：全仓 `*.emit('字面量')` 调用点只出现在 `test/agent-memory.test.mjs`（测试自建事件源）、
   `test/registry.test.mjs`（`fixture/event`）与 `scripts/p24-ui-matrix.mjs`（`data`/`end` 是流事件）
   ⇒ `lib/`、`registry/`、`contract/`、`doctor/` **无一 emit 任何契约事件** ⇒ 这 11 条事件的发出方是宿主，
   本仓插件只是消费者 ⇒ "混合"类无样本，裁定 23 的上报分支不触发。
2. **首版探针的假阳性已纠正（防再犯，按"错账必录方法盲区"办）**：用裸 `.on(` 判监听面会把
   Node 流/Socket 的 `data`/`end`/`error`/`connect`/`close` 一并计入库面（误读为 panel 4 处、
   `web-search-local` 4 处）；实测共 **21 处**，逐处定位于
   `toolkit:panel/index.js`（`request.on(...)`）与 `toolkit:lib/web-search-local/index.js`
   （`sock.on(...)` / `res.on(...)`）。判 cordis 信道**必须锚 `ctx.on`**，否则结论反向。

**对批 2 的结论（不阻塞）**：`provides` 按定稿三槽 `{services?, commands?, providers?}` 落地，
**不加 `events` 槽位**。理由：实测本仓零发出者 ⇒ `provides.events` 会是一个"文档写到、仓内无生产者
无消费者"的空壳字段，正撞 P2-11 点名的 `fix.docsUrl` 同类失真，与用户标准（"文档写到的全部正常实现"）相反。

**这 11 条监听声明的家——协调侧裁定：采甲（2026-09-22 批 2 动工确认令第三节，零迁移）**。两条路的实测成本差留档：

| 方案 | 承载处 | 语义 | 跨仓成本（实测） |
|---|---|---|---|
| 甲（**建议**） | `requires.events` | 与 `requires.services` 同族，都是"本插件对环境的依赖"；事件由宿主发出，本插件消费 ⇒ 归依赖面为真 | **零 doctor 改动**：doctor 对本仓 `requires` 只放行键名、不校验值（实测 `doctor仓:src/engine.mjs` 无 `parsed.requires` 任何分支；`6839cc1` 自述"值语义归契约层"），且其撞名循环只跑 `services/commands/providers` 三类，`events` 今天就不参与 |
| 乙 | 新根字段 `subscribes` | 监听面独立成字段，读起来最贴合裁定 23 的字面 | **须再来一笔 doctor 白名单**（与批 1 同型：不放行即判"清单根字段非法"），并把"依赖宿主哪些事件"从 `requires` 拆成两处 |

（提出时按"执行侧不自裁承诺面"上报：裁定 23 那句"监听→`subscribes`"是在"provides 要不要 events 槽"
这一问句下给的**分类法**，是否为此新建根字段属新决策。）

**裁定＝采甲，三条理由（协调侧 2026-09-22 批 2 动工确认令第三节）**：① 实测定性（本仓全消费者、宿主为发出方）
与 `requires` 族语义同构；② 为贴字面新建根字段、把同族声明拆成两处，反而制造新的声明面分叉；
③ 甲零迁移、零 doctor 改动、零 breaking。

**裁定附条件的兑现情况**：
- 条件 1（定稿文档写清 events 正典位置与语义并入矩阵）：已随本笔在 `docs/contract.md` §2.1 末补条目，
  含"两处零校验"的如实记载；本节即矩阵侧入账。
- 条件 2（§10.4 取证结论入档）：本节。
- 条件 3（批 10 与改名批解锁，照原编排＝改名批在批 2 之后紧邻批 10）：因**零迁移**，§8.4 的 B 案对
  `events` **无换源动作**（输出键名与数据源维持 `registers.events`），B 案要处理的只剩 `services` 那侧的
  倒置（批 2 修行为、批 10 落数据）⇒ `p1-smoke` 的字段名在场断言**不因 events 翻面**。
  （本笔提出时的相反推测按裁定更正；该推测未提交过，不留错账。）

**本轮实测新暴露两条（登记用，不在批 2 内顺手修）**：
1. **新失效面**：`requirements.registers.events` 今天**两仓都零校验**（本仓 `validate.ts` 只在
   `KNOWN_LEGACY_FIELDS` 里列过 `requirements`/`registers` 两个键名；独立 doctor 只把 `registers` 当对象
   查类型，其撞名循环只跑 `services/commands/providers`），而面板把它当事实展示 ⇒ "展示一份无人校验的数据"。
   建议登记为 `contract.md` §7 的 **D-13**（措辞待用户/协调侧定，本轮不自裁）。
2. **批 2 施工点补录（★1 同族残留）**：`contract/src/types.ts` 里 `ManifestRequirements.services` 的注释
   仍写"依赖的 cordis 服务名（**inject 面**）"——正是 P0-2 已否掉的旧口径（`contract.md` §2.1 ① 明写它
   **不桥接** `inject`）⇒ 批 2 把 `requires.services` 退回纯依赖面时**须同笔改掉这行注释**，
   否则代码注释会继续向文档供货（§5.2 总成因的现行样本）。

---

## 11. 边界、错账与探针清单

- **本文自身也是文档**：其中的 `file:line` 同样会漂。仓库既有口径 `add-sub-plugin.md` §1「按函数名找，
  别按行号找」适用于本文全部引用。**新增的待办**：原批 0 计划里的"文档引用守卫"（核对文档内
  `文件:行号` 指向的符号存在）未随定稿笔落地，已挂 `docs/debt.md` D-20 —— §5.2 的结论正是"行号当时对、
  后来漂"，没有守卫就一定再漂一次。
- **本轮查出的既有错账五处**（各给成因，不改写原文、只滚存修订）：`debt.md:161` 审计事件"7 类"
  （成因：草案早于 Pack H1）；`debt.md:170` "5 个内置插件补 provides"（成因：草案按 lib 目录数数，
  未按注册面实况）；`debt.md:166-167`/`:173` 行号 `loader.ts:31`、`registry.ts:266`
  （成因：同轮多次改码未回填）；`debt.md:133` B-1 的 10 函数/6 脚本（成因：P7 落账后 P2.4 扩面）；
  **`p0-recon.md:56` 的"120s 超时"**（成因：09-19 改值未回填，且被 `migration.md` §6 复制一次 ⇒ 第五处
  是前四处的**上游源头类**样本，两处已于定稿笔一并更正，成因互引）。
- **探针与底表**（沙箱 `var/scratch/c1-recon-20260922/`，协调侧令暂留勿删，批次收尾按仓库惯例处置并记录）：`probe-registry-inventory.mjs`（§4 枚举）、`probe-contract-behavior.mjs`（§1/§2 四条承重结论）、`probe-collision-falsepositive.mjs`（§7 假阳性复现）、`raw-matrix-migration.md` / `raw-matrix-embed-toolkit.md`（本文两份附录的原始件）、`raw-test-index.md`（27 个测试文件 / 250 个 `test()` 位点→256 运行用例 + 182 条 `check()` 的逐条索引，供批 0-6 补钉时查"这格有没有人钉过"）、`fixtures/`（探针自造夹具，不在两仓内）。
- **本轮未做**：未重启宿主、未碰 `~/.dsh`、未跑 `p23-shadow-scan`、未动 `panel/`、未碰 `terminal-acceptance-report.mjs` 硬闸（侦察期未触发）、doctor 仓零改动。`acceptance-stage3.mjs` 未跑（§9）。
