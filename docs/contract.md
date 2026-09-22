# DSH Sub-Plugin Contract v1 —— 契约全文

> 建立：2026-09-20（P8 收尾，债务 #6/#7 清偿）。事实来源＝代码，逐条给 `文件:行号`；
> 与《toolkit 泛化规格》的偏差在 §7 逐条列明（含用户正式裁决的豁免），不藏。
> 契约版本常量：`contract/src/types.ts` `PLUGIN_CONTRACT_VERSION = '1.0.0'`。
>
> **2026-09-22 条文审定轮（用户逐条过目 ★1–★20，批复"全部按建议"）的修订已落在本文，逐条结论见
> `docs/debt.md`「用户审定记录」。本文定位规则的修正**：行号会漂，**按函数/常量名定位**（同
> `docs/add-sub-plugin.md` §1 自立的规矩）；本文原自述"事实来源＝代码"在 P8 落笔时未兑现（详见
> `docs/contract-v1.1-recon.md` §5.2 原因表，四条 P0 的源头是"抄注释/抄旧读数"）。
> 凡**已裁定改代码、实现尚未跟上**的条文，均在句末挂 `【批 N 落地，当前…】` 小字，不留隐性谎言。

## 1. 一句话契约

桶（宿主）与子插件使用**同一份**契约（D1）：一个子插件 = 盘上一份 `dsh.plugin.json`（静态事实）
+ 模块导出（函数型成员）。桶不认插件出身，只认契约字段（Q1：不给任何插件特判）。

## 2. manifest 字段（`DshSubPluginManifest`，`contract/src/types.ts:88`）

| 字段 | 必填 | 约束（由 `validateManifest` 强制，`contract/src/validate.ts:81`） |
|---|---|---|
| `id` | ✅ | 命名空间式 `<scope>/<name>`，正则 `^[a-z0-9][a-z0-9-]{0,63}/[a-z0-9][a-z0-9-]{0,63}$`；全局唯一，不是路径 |
| `displayName` | ✅ | 非空字符串（面板标题用它） |
| `version` | ✅ | 合法 semver |
| `contract` | ✅ | 合法 semver **范围**，且必须放行当前契约版本 1.0.0（如 `^1.0`） |
| `requires` | ⬜ | 对象；子域见 §2.1。整体可缺席（零需求的插件不必写空对象——**对规格的一处放宽**） |
| `configSchema` | ⬜ | Schema 对象或构造函数；JSON 落盘时是 schemastery 纯定义（§5） |
| `panels` | ⬜ | 数组，每项必须有非空 `id`（`PanelDescriptor`，其余键开放）。**当前无任何消费者**：面板只把 `entry.manifest.panels` 原样透传（`panel/manager/v2-api.mjs` 的 `panels:` 一行），宿主也不认它（§7 D-8 与 `docs/embed-toolkit.md` §5 第 1 条）；它是"呈现面声明"，不是"提供面" |
| `healthCheck` | ⬜ | **只能是函数**，因此只能由模块导出携带；JSON 里出现即 error。【批 3 落地，当前装载器不绑定它 ⇒ 写了不跑】见 §7 D-9 |
| `provides` | ⬜ | **提供面（契约 v1.1 批 2 已落地）**：`{services?, commands?, providers?}` 三槽，每槽为可选的**非空字符串数组**；未知子键与拼错槽位名一律 error（与"未知顶层字段=error"同口径，`events` 尤甚——它不属提供面，见 §2.1 末）。装载侧 `extractRegisters` **逐槽优先读 `provides`**，缺席才回落到 legacy `requirements.registers.*`（回落属迁移期行为，数据正源待批 10） |

**未知顶层字段 = error**（拼错字段名会静默失效，故拒绝）。迁移期容忍的旧字段清单是封闭的：
`KNOWN_LEGACY_FIELDS = manifestVersion / name / requirements / registers / exports / aliases /
optionalDeps / requiredAliases`（`contract/src/validate.ts` 的该常量），它们只产 info 级问题、不参与 ok 判定。
**两处必须连带知道的限定**（本清单只描述**本仓契约**的容忍度，不代表另一仓也容忍）：
① 顶层 `exports` 在本仓是 info，但在独立 doctor 的清单根字段白名单里**不存在** ⇒ 写上去当场
`清单根字段非法: exports` **error**（入口声明的正典位置见 §4）；
② `manifestVersion` / `name` / `requirements` 三项在独立 doctor 侧是**必填**（缺则 `schema.required-missing`
error）⇒ "本仓容忍"与"另一仓必填"并存，正是 `docs/debt.md` C-2（v1.2 收紧）的门槛所在。
**收紧时机**：见 `docs/migration.md` §4 与 `docs/debt.md` C-2（P8 时点尚未收紧；2026-09-22 裁定移出 v1.1）。

### 2.1 `requires` 子域（预检与巡检的事实来源）

`node` / `dshRuntime`（semver 范围）、`services[]`（依赖的 cordis 服务名）、
`subPlugins[]`（依赖的其他契约 id；未装/未启用 ⇒ **warn**，不阻断）、`envVars[]`（`key` 必须形如
`MY_VAR`，**`required` 为必填布尔**；**只声明存在性，任何日志/报告禁止出现值**——REQ-10 安全红线）、
`binaries[]`（`name` 必填、可带 `minVersion`，真探测见 §6）、
`ports[]`（1–65535、`protocol` 只能 `tcp`/`udp`、`shared:true` 仅提示不阻断）、
`fsPaths[]`（`path` 必填、`access: 'r' | 'rw'` **必填**）、
`externalApis[]`（`name` 必填、`url` 若给必须 http(s)、`authEnv` 同样只写变量名）。

**`services[]` 的两个"不是"（★1 定稿：条文按实况拆开，不再写作"即 inject 面"）**：
① **它不桥接 cordis 的 `inject`** —— 装载门控只认插件模块自己导出的 `inject`；只在 manifest 写
`requires.services` 的插件，依赖缺席也照样 ACTIVE（实测钉在 `test/cordis-inject-lifecycle.test.mjs`
的 E1 前提用例）。本仓**不打算**在 v1.1 合成 `inject`（裁定：推迟为 `docs/debt.md` D-18/D-19，
立项时必答"与 cordis 上游 REQ-6 对齐还是自创"）。文档正典口径是**重试退避**（§6 末的数字族），
不是自动唤醒。
② **它曾被误当作"提供面"参与撞名比对（契约 v1.1 批 2 已断）** —— `registry/src/loader.ts` 的
`extractRegisters` 曾把 `requires.services` 归一进 `registers.services`，`doctor/src/doctor.ts` 的注册冲突分支再拿它比对，
⇒ 两个只是共同依赖同一服务的插件，第二个会被 `reg.name-collision` **阻断安装**（假阳性已实测复现，
见 `docs/contract-v1.1-recon.md` §7）。**批 2 落地后**：提供面由 `provides` 承载，比对两侧都只读提供面
（本插件侧与已注册条目侧**各一处**，同日断掉），`requires.services` 退回纯依赖面；回归钉在
`test/doctor.test.mjs` 的"批 2-②"，把借用塞回去即翻红。**数据侧遗留**：桶根的 `webServer` 记在
`requirements.registers.inject` 与 `requires.services` 两处（不是 `registers.services`，recon §4 原文该格已更正），
倒置纠正留批 10 ⇒ 见 §7 D-10 与 recon §10.3。

**事件订阅面 `requirements.registers.events`（2026-09-22 协调侧裁定采甲：位置不动、语义写清、零迁移）**：
字符串数组（如 `["session/created", "agent/request"]`），语义＝**本插件订阅（监听）宿主发出的事件**。
三条边界都有实测（取证 `docs/contract-v1.1-recon.md` §10.4）：
① 本仓**无一是事件的发出方**——全仓 `*.emit('…')` 只落在 `test/` 与 `scripts/`（自建事件源、Node 流事件），
`lib/`、`registry/`、`contract/`、`doctor/` 的生产面零 emit ⇒ 发出方是宿主；
② `provides` **不设** `events` 槽位 ⇒ 零生产者的槽位就是第二处 `fix.docsUrl` 式空壳
（同类失真见 `docs/contract-v1.1-recon.md` §5 的 P2-11，与本契约"文档写到的须真在运行"的标准相反）；
③ **不新建 `subscribes` 根字段**——"监听 → `subscribes`"是"监听面不进提供面"的分类法，不是新建字段的承诺；
新建反而把同一族声明拆成两处、制造分叉（零迁移亦即零 breaking）。

位置与呈现：它归 **legacy `requirements.registers` 族**，与 `services/commands/providers` 同处；面板
"技术详情"里 `events（监听的事件）` 那一行读的就是这份数据（`panel/client/index.js` 的 `TechDetails`
与 `panel/manager/snapshot.mjs` 的 `registers` 装配），故**撤展示不采纳**（已裁）。
**校验面须如实读**：本契约对 `requirements.registers.*` 的内部形状**零校验**（`contract/src/validate.ts`
只在 `KNOWN_LEGACY_FIELDS` 里列过 `requirements`/`registers` 这两个键名）；独立 doctor 只把 `registers`
当对象做类型检查，其撞名循环只跑 `services/commands/providers` 三类 ⇒ `events` **两处都不参与比对**，
它是"作者自述 + 面板展示"的数据面，不是被机器校验过的契约面。

## 3. 命名空间（D5 无根假设，`contract/src/naming.ts`）

一切对外名都带可配置前缀 `servicePrefix`（缺省 `DEFAULT_SERVICE_PREFIX = 'toolkit'`）：

| 面 | 拼法 | 缺省值 |
|---|---|---|
| 服务名 | `contractServiceName(p, 'registry' \| 'doctor')` → `${p}/registry` | `toolkit/registry` |
| 事件名 | `contractEventName(p, event)` → `${p}/${event}`，`event ∈ CONTRACT_EVENT_NAMES` | `toolkit/registry:plugin-added` 等 5 个 |
| HTTP 基址 | `contractHttpBase(p)` → `/api/${p}-panel`（P7 嵌入新增） | `/api/toolkit-panel` |

**缺省前缀下三张表逐字节等于 P6 之前的历史值** ⇒ 装载 toolkit 的既有宿主 URL/服务名/事件名零变化。
前缀非法（空、含 `/`、首尾空白）时：`normalizeServicePrefix` 只把"缺席/空串/纯空白"回落缺省，
其余交给三个拼装函数 **抛 TypeError（fail-closed）**。

⚠️ 已知不一致（债务 #11b → **已裁定并入契约 v1.1，第 2 项**）：审计事件由 `registry/src/registry.ts`
的 `audit()` 手工拼 `${servicePrefix}/audit:${event}`，不经 `contractEventName`——因为
`CONTRACT_EVENT_NAMES` 的联合类型不含 `audit:*`。它**已命名空间、无冲突**。同步面实测只剩**一处手工**：
①`panel/manager/v2-api.mjs` 的 SSE 名表**已经**由契约 `AUDIT_EVENTS` 派生（`...AUDIT_EVENTS.map(...)`）；
②真正手抄的是 `panel/client/index.js` 的 `V2_EVENT_NAMES`（13 条字面量，一致性由
`test/toolkit-root.test.mjs` 逐名核对锁住）；③SSE `hello` 帧只带 `servicePrefix`、不带事件名清单 ⇒ 无同步项。
**条数是 8 不是 7**（第 8 项 `state-save-failed` 由 Pack H1 追加）。
【批 9 落地：入枚举 + 收编】实测 `contractEventName(p,'audit:'+x)` 与手工模板串对 8/8 **逐字节相同**
⇒ 收编是**零线格式变更**（对外事件名、审计流水、SSE 帧全不变），收益在编译期类型约束；
注意 `contractEventName` 运行时**不校验**事件名（未知名照拼），不要把它当运行时守卫。

## 4. 来源与安装（`PluginSource`，`contract/src/types.ts` 的 `PluginSource`）

```
{ kind: 'local', path }   // 唯一已实现（Q1 裁决）
{ kind: 'npm',   spec }   // 契约预留：遇到即抛 source-not-supported
```
追加 npm 来源必须是**纯增量**：不改本契约、不改 registry 主流程（Q1 附加要求）。
（设计约束，无机制保证；将来实现 npm 来源时，第③级会从"兜底"变成"主路径"，
`requirements.exports` 正典与包主导出须再裁一次 —— 已在 `docs/debt.md` C-1 现状注记标记关联。）

**两仓分权（2026-09-22 裁定，★12 落地口径）**：本契约管**解析行为**（下面的四级顺位、正典位置、
`$from` 继承、显式声明不回退红线、可观测面）；**必填性校验归独立 doctor**（它把 `requirements` 的
`runtime/binaries/packages/registers/exports` 五键定为必填、逐条断言 `./` 目标存在、规定 `$from`
只能套件根用）。本节因此**只描述行为、不声明"哪些键必须存在"**；两处不再互相打脸的前提是
`docs/add-sub-plugin.md` §2 与本文口径一致（曾不一致的成因见 `docs/contract-v1.1-recon.md` §5.2）。

入口解析顺序（`registry/src/loader.ts` 的 `resolveEntry`；正本叙述在 `docs/add-sub-plugin.md` §2 要点 1）：

| 顺位 | 来源 | 行为 |
|---|---|---|
| ① | **`requirements.exports['.']` —— 正典位置** | 命中即返回；`{"$from":"package.json#exports"}`（**只允许套件根这么写，且必须只有 `$from` 一个键**）时按继承语义换成 `package.json#exports` 的表，此时若表里没有 `.` 映射会带一条告警 |
| ② | 顶层 `exports['.']` —— legacy 兼容位 | 命中**必打 warn**（经 registry 的 warn 通道落日志，`event=entry-declaration`）；与正典并存时**正典赢**，warn 点名被忽略的那一份并说明它在 doctor 侧判 error |
| ③ | `package.json` 的 `exports['.']`（字符串或 `{".":{default\|node}}`）→ `main` | 宿主 Node 约定（T0/G1） |
| ④ | `index.js` / `index.mjs` 目录惯例 | 仅当前三级都没有声明/都没有命中时才走到 |

- **`.` 的语义是"包主导出"，不必然是插件入口**（本仓 `lib/agent-memory` 即此形态：`.` 指向数据层、
  插件在 `./plugin`）⇒ 按目录装它会得到 `plugin-shape-invalid`，报错点名同表可改装的文件；
  **装载器不代为挑选**，要装请按文件路径装。这是终态设计行为，不是缺陷（`docs/debt.md`《D-7 追加》情形 A）。
- **红线：显式声明指向不存在的文件 ⇒ 直接 `entry-not-found` 并给拼好的绝对路径，绝不静默回退后面的顺位**
  （回退就是拿惯例掩盖 manifest 与实现不同步）。【批 6 落地，当前只覆盖①②】现状：第③级
  （package.json 的 exports/main）目标不存在时**仍会**落到第④级，而 package.json 同样是作者显式写的
  声明 —— 已裁定把红线扩至第③级；扩前须核存量声明全部有效（`docs/contract-v1.1-recon.md` §10 的核验结果）。
- **可观测面**：`ResolvedPlugin.entrySource`（七值枚举：`manifest.requirements.exports`、
  `…($from)`、`manifest.exports(legacy)`、`package.json#exports`、`package.json#main`、
  `index-convention`、`explicit-file`）与 `entryWarnings`。
  **来源直接给 `.js`/`.mjs` 文件路径时完全不经顺位**（`entrySource='explicit-file'`、`entryWarnings` 恒空），
  即它会绕过 manifest 里相反的 `.` 声明；`.cjs` 与无扩展名路径按目录处理。
- **找不到入口时的可执行文案**（`loader.ts` 的 `entryNotFoundMessage`）：写清已读取到什么、缺哪个字段、
  monorepo 根的插件子包候选（**只扫 `packages/` 直下一层、最多 8 个**）、补哪个字段带 JSON 片段示例；
  显式声明指向缺失文件的另一套文案在 `declaredMissingMessage`（给绝对路径 + 同表其他声明）。

**来源侧错误码（`SourceError.code` 全集 5 个，面板与 doctor 按码分流）**：
`path-not-found`（含相对路径按服务 cwd 解析的说明）、`entry-not-found`（两个来源见上）、
`module-load-failed`（入口 import 抛错，带原始错误）、`plugin-shape-invalid`（未导出可识别插件形态，
或 legacy 合成 manifest 未过契约校验——后者文案点名真实成因：目录有 manifest 但**缺非空 `contract`**，
还是本就没有 manifest；scoped 包名 `@scope/name` 必落此分支，见 §7 D-11）、`source-not-supported`（npm）。
到 `install()` 边界统一翻译成 `blocking.code = 'source/<码>'`（抛在 loader、译在 registry，别把两句混成一句）。

## 5. configSchema 的四形态与落盘口径

`validateConfigAgainstSchema`（`contract/src/config-schema.ts`）按形态尽力真校验，**实现是 4 个分支**
（`via` 也是四值；本节原写"三形态"是把 ③④ 并成一家族，已按实况改数）：
① 可调用 Schema（schemastery 实例）→ 直接调用（`via:'schemastery-call'`）；② zod（有 `safeParse`）→
safeParse（`via:'zod-safeparse'`，**当前零测试覆盖**）；③ `{type:...}` 纯定义 JSON → 动态 import
schemastery 重建后校验；④ `{uid,refs}` toJSON 形态 → 重建后校验。
③④ 重建后都递归回落到 ① 的 `via`，所以 `via:'schemastery-json'` 是**当前不可达的枚举值**（诊断口径待处置）。

**降级语义（★16 定稿=改代码）**：构建/重建失败时返回 `via:'skipped'` 并带一条说明，但**同时 `ok:true`**，
而两个调用方（`setConfig` 写回、体检 `config-schema-invalid` 规则）只看 `ok` ⇒ schemastery 不可用时
任意配置都能写回。已裁定改为**把降级状态如实透出、不再谎称通过**；在落地之前，"不谎称已校验"这句只成立到
`via` 字段上、不成立到通过/不通过的判定上。【批 5 落地】

落盘口径（P5 起，用户裁决）：**仓内 manifest 的 configSchema 一律 schemastery 纯定义 JSON、零默认值**
（运行时行为不变；默认值仍在插件代码里。"零默认值"目前是**约定而非判据**，无任何校验或门禁用例查它）。
函数型 Schema 只作为模块导出存在，两处同时在场时**以模块导出为准**（★3 定稿）。
【批 4 落地，当前实现相反】现状是 `loader.ts` 的 `resolveLocalSource` 只在 manifest 的 `configSchema`
**缺席**时才用模块值 ⇒ 盘上 JSON 赢；`doctor.ts` 与 `registry.ts` 两个消费方同序，
`contract/src/validate.ts` 的 `validateModuleExports` 头注也写着本文这句（污染源头见 recon §5.2）。
可观测后果：`web-search-local` 当前生效的是 manifest 里 1 个键的 schema，而不是模块 `Config` 的 14 个键。
连带影响：宿主通道（cordis 读 `plugin.Config`）**一直**用的就是模块那份 ⇒ 批 4 之后两侧口径一致，
真实 patch 行配置须能过模块 `Config` —— 该前提已由门禁第 4 步 `scripts/patch-config-check.mjs`
按宿主语义实测通过，故本批改动的存量风险已被预先校验过一遍；仍标**真机复验**。

## 6. 预检 / 健康 / 巡检的形状

- `PrecheckReport{pass, blocking[], warnings[], changes[], legacyMode}`：不修复则拒绝安装的东西进
  `blocking`；`legacyMode:true` 表示被检者是无契约 legacy 包装（面板必须如实标注受限项，不得显示
  "已全项通过"）。`changes[].target` 是五值联合（`manifest`/`config`/`env`/`deps`/`code`）。
  **逃生门（此前文档未写）**：`registry.install(source, {force:true})` 会**越过 blocking 照常装入**
  （面板安装向导的"确认安装"不带 force；带 force 的调用应在审计与呈现上可辨）。
- `HealthReport{pluginId, status: healthy|degraded|unhealthy|unknown, checkedAt, items[]}`；
  `HealthItem.fix{summary, steps?, docsUrl?, autoFixId?}` 必须回答"缺什么、改哪里"，
  禁止"按消息修复后重试"式循环表述（T0 裁决）。**实况**：`docsUrl` 与 `autoFixId` 两个键
  全仓零生产者、零消费者（保留还是移除属实现取舍，已记 `docs/contract-v1.1-recon.md` §5 P2-11）；
  四态里 `degraded` 作为最终 status 当前**无测试**；"五分支已按此改写"的归属是
  `registry/src/registry.ts` 的 `sourceFixAdvice`（`loadFailureReport` 本身只有"有 issues / 无 issues"两路），
  且 5 个来源码里 2 码的 fix 文案无断言。
- `InspectionReport{generatedAt, reports: HealthReport[]}`（`inspect()` 的返回形状，此前正文缺）。
- **doctor 有两套，严重级规则不同（★4 定稿：两句各自归位，不再合成一句）**：
  ① **本仓进程内体检**（`doctor/src/rules.ts` 按 `requires` 子类目自动合成 8 条规则：
  `runtime`/`services`/`subPlugins`/`envVars`/`binaries`/`ports`/`fsPaths`/`externalApis`）——
  **缺席类按 `required`/`shared` 分级：必需项缺席 = error 且阻断安装**（版本不符、依赖服务缺席、
  必需环境变量缺失、二进制不在 PATH、低于 `minVersion`、非 shared 端口占用、路径不可访问均产 error），
  仅"探测不到版本 / 可选缺席 / shared 端口占用 / 网络瞬断"为 warn。
  ② **独立 doctor CLI 的仓级审计**（`projects/doctor/src/engine.mjs`）——纪律相反：
  缺席/缺依赖类信号一律 info 或 warning、**绝不产 error**，因为它的验收红线是真实仓 `0/0/0`。
  把①写成"只产 warn/info"或与②混谈，都是 P8 落笔时的张冠李戴（成因见 recon §5.2）。
  `registerRule` 是第三方规则扩展点，与内置规则同构（同列表执行、超时产 `rule-error`）。
  周期巡检三个缺省值：`watchInterval 30000` / `failureThreshold 3` / `historySize 20`；规则超时 5s。
- 二进制版本：`Probes.binaryVersion()` 真跑 `--version` 取首个 semver（3s 超时），
  低于 `minVersion` = error，取不到版本 = warn（债务 #1 清偿形态）。**"真跑"这一层当前由可注入替身测，
  真实探测路径（含 3s 超时与多 semver 取首）无覆盖**。
- **装载失败后的重试与隔离（REQ-6，此前四份正本只有一处零散列了数字）**：单条目失败 ⇒ `error` +
  `lastError`，按 `retryLimit`（缺省 **3**）与指数退避 `retryBackoffMs`（缺省 **500**）自动重试，
  达上限转 `quarantined`；装入等待超时由 `loadTimeoutMs`（缺省 **30000**）兜，状态落盘合并写由
  `saveDebounceMs`（缺省 **0**）控。`retryAttempts` 语义是"**当前这段**连续失败次数"、转 ACTIVE 即归零；
  `lastError` 同理由 `setStatus` 单点清空（历史归审计 JSONL）。等待期错误码见 `FIBER_LOAD_ERROR_CODES`
  四值：`fiber-failed` / `fiber-disposed` / `fiber-unloading-timeout` / `fiber-load-timeout`
  （其中 `fiber-failed` 仅当 fiber 的 rejection 值不是 Error 实例时出现，真抛 Error 时走原文与 `internal`）。
  **正典口径是重试退避，不是自动唤醒**（★1 的另一半；`requires.services` 与 `inject` 不桥接）。

## 7. 与《泛化规格》的偏差登记（全部有裁决出处）

| # | 偏差 | 依据 |
|---|---|---|
| D-1 | **semver 预发版偏差**：`requires.dshRuntime = ">=0.1.2-rc.1 <0.2.0"` 命中预发版宿主。按标准 semver 语义，带比较符的下界含 prerelease 时**不会**匹配同主次的其他 prerelease；本仓 `contract/src/semver.ts` 显式允许预发版参与比较，以便 rc 版宿主通过预检 | 用户要求 5（P4）；实现与回归见提交 `15904f6`（`>=20` 这类带比较符部分版本曾被误加上界 `<21.0.0`，已改为无上界比较器并补 `engines.node ">=20"` 用例）。**债务 #7 在此清偿** |
| D-2 | **TypeScript 范围豁免**：仅 `contract` / `registry` / `doctor` 三模块 TS strict（各自 tsconfig），存量 5 插件与 `panel/` 保持 JS + JSDoc | N1 裁决（`docs/p0-recon.md` §6）：这是对规格 §8 的**正式豁免**；配套硬约束=门禁必须跑 `typecheck`×3（`package.json` scripts.test），不是只放文件。**"5 个内置插件"这句话有四种数法，别当同一个数用（★14 定稿：分列）**：① 带 `dsh.plugin.json` 的单元 **7**（5 个 `lib/` + 桶根 + `panel/`，其中 6 份有 `contract`、`panel/` 没有）；② 注册面非空的 **3**（compact-router / search-router / web-search-local）；③ 宿主真实装载的 body **6**（`cordis.patch.yml` 的 5 个 insert 行 + compact-router 走预设改写挂载）；④ 面板卡片数 **5**（`panel/manager/snapshot.mjs` 派生，`p1-smoke` 断言的就是这一个）。完整枚举与实测入口形态见 `docs/contract-v1.1-recon.md` §4 |
| D-3 | **`requires` 整体可选**（规格写法是必填对象） | `contract/src/types.ts` 的 `requires?` 注释明示；零需求插件不写空对象 |
| D-4 | **函数型成员不落盘**：`healthCheck` 只能是模块导出；`configSchema`/`panels` 允许 JSON 落盘 | `validate.ts` 的 healthCheck 判据；JSON 装不下函数。**"不落盘"≠"会被消费"**，见 D-9 |
| D-5 | **R13：装入判定依赖 cordis 内部实现**——`fiber.state` 枚举（2=ACTIVE/3=FAILED/4=DISPOSED/**5=UNLOADING**）、FAILED 时经 fiber 的 rejection 取回启动错误原文、模块命名空间插件的 `apply` 返回 Promise 被视为后台任务（立即 ACTIVE）。这些是 cordis **4.0.2 的实现行为，不是稳定契约**。补充实测：`FiberState` 声明为 `export const enum`，构建产物 `lib/index.js` 中该符号出现 0 次 ⇒ **运行时根本 import 不到**，硬编码数值是当时唯一可选项 | 用户裁决"fiber 状态迁移判定装入"（风险 R13）。缓解：判定收敛在 `registry/src/registry.ts` 单点（导出的 `FIBER_*` 常量 + 轮询循环）；**cordis 升级必须重跑 S1/S4 场景**；该依赖已写入 `registry.ts` 头注。**2026-09-21 复核加固**：`test/cordis-fiber-state.test.mjs` 用真 cordis 实测枚举数值与 `FIBER_*` 逐一对账（显式守卫，编号漂移当场红）；轮询补 UNLOADING 分支并区分错误码（`FIBER_LOAD_ERROR_CODES`）；`peerDependencies` 收紧为 `^4.0.2` 并加范围守卫。本体裁决不变。**措辞订正（本轮）**：原写"五个终态数值"实为 **6 个状态**，其中 5 个断言了字面量、`FIBER_LOADING=1` 只由"六值互不相同且排序为 [0..5]"的顺序不变式隐含；原写"`fiber.await()` 以启动错误 reject"不准，实现读的是 fiber **thenable**（`Promise.resolve(fiber)`） |
| D-6 | 审计事件名手工拼装（见 §3 末） | 债务 #11b。**2026-09-20 裁定"不单独修、并入契约 v1.1 第 2 项"；2026-09-22 审定后列入 v1.1 排期（批 9）**。此前状态栏一直写"未清偿，交用户复核"，与台账不符 |
| D-7 | **入口声明的必填性归独立 doctor，不归本契约**：本契约不定义"manifest 必须携带入口声明"，只定义解析行为（§4） | 2026-09-22 裁定（C-1 必答设计题第 2 条）：采"契约管解析行为、doctor 管必填性"；`projects/doctor/src/engine.mjs` 的 `REQUIREMENT_KEYS` 与 `buildExportTargetIssues` 是必填性正源。v1.2 若撤根字段必填须连带处理"键集校验静默空转"（`docs/debt.md` C-2 前置 1） |
| D-8 | `panels` 是契约字段但**无装配消费者**：宿主不认（`dsh-web-all` 不读），本仓只把它原样透传给面板数据面 | `docs/embed-toolkit.md` §5 第 1 条 + `panel/manager/v2-api.mjs` 的 `panels` 透传行；桶根 manifest 那份 `toolkit-panel` 描述符因此是**自述性数据**，不驱动布局 |
| D-9 | **`healthCheck` 读方已在、写方从未存在**：体检与快照读 `manifest.healthCheck`，但装载器不绑定模块导出的它（其静态面白名单只有 `name/inject/Config/configSchema/provide/intercept` 六键）⇒ 作者按 §2/§7 D-4 写了不会跑 | 2026-09-22 审定 ★2 定稿=**改代码**，批 3 落地。落地前的事实：本仓**没有任何模块导出 `healthCheck`**（`index.js`/`lib/*`/`panel/` 全量 grep 零命中）⇒ 绑定接通后内置插件的"突然生效面"为 0，只影响第三方契约插件 |
| D-10 | **契约缺"提供面"字段导致 `requires.services` 被借用**：`extractRegisters` 把依赖面归一进注册面、冲突检查据此比对 ⇒ 共同依赖同服务会被阻断（假阳性已实测） | 2026-09-22 裁定：C-1 第 1 项 `provides` 落地即修（批 2），并须带对偶用例"共同依赖不判撞名"。成因与为何长期潜伏（内置全用 legacy `requirements.registers`、桶根只走宿主通道）见 `docs/contract-v1.1-recon.md` §5.2 P0-2。**【批 2 已清偿行为半边】**：`provides` 三槽进类型与校验、`extractRegisters` 逐槽优先读它、`doctor/src/doctor.ts` 撞名比对的**两处**借用点（本插件侧与对方侧）同日断掉；对偶用例在 `test/doctor.test.mjs` 的"批 2-②"。**数据半边未动**——内置 7 份仍无 `provides`，桶根的倒置留批 10 纠正（实测读数见 recon §10.3 批 2 段） |
| D-11 | **scoped 包不能走 legacy**：合成 id 只在包名不含 `/` 时加 `legacy/` 前缀；`@scope/name` 原样沿用 ⇒ 被命名空间式小写规则拒绝（`@` 不合法） | 债务 D-15 的文案修复（`e80caea`）：报错点名真实成因。§8 那句"合成的 id 落 `legacy/<name>`"须带此条件；`docs/add-sub-plugin.md` §1 已按此写 |
| D-12 | **§5 那句"以模块导出为准"当前与实现相反**（实现是 manifest 落盘那份赢） | 2026-09-22 审定 ★3 定稿=**改代码**（批 4），故本文**保留承诺句不改为附和现状**；实现跟上前的实际行为以本行为准，勿据 §5 那一句判断当前行为 |
| D-13 | **事件订阅面 `requirements.registers.events` 两仓零校验，却被面板当事实展示**：契约侧只在 `KNOWN_LEGACY_FIELDS` 里列过 `requirements`/`registers` 两个键名（不校验 `registers.*` 内部形状）；独立 doctor 只把 `registers` 当对象查类型，其撞名循环只跑 `services/commands/providers` ⇒ 形状写错无人拦，而"技术详情"里 `events（监听的事件）` 那一行照原样展示 | 2026-09-22 协调侧裁定**分层登记**（裁定方：协调侧，批 2 验收令第三节）：① **最小形状校验进 v1.1**——`events` 须为字符串数组且成员非空（与 `provides` 三槽同族收紧），由**契约单层**落地（独立 doctor 零改动，甲案"位置不动"边界不变），并入批 10 邻近笔，配正反用例与变异自检；② **深度校验挂账**——"声明的事件名与宿主发出面是否对得上"须经宿主事件面正典化，真门槛不在本仓 ⇒ 移入 `docs/debt.md` C-2（v1.2）评估，与题 3 的真门槛同构，不硬塞 v1.1；③ **面板展示维持**（撤展示不采纳，已裁）。取证见 `docs/contract-v1.1-recon.md` §10.4，第六处错账与防再犯口径见同文 §11 |

## 8. 兼容性规则

破坏性变更必须升契约**主版本**并提供适配层（规格 §8）；`contract` 字段本身就是为这件事留的闸门：
闸门实际落在 `contract/src/validate.ts` 的 `contract` 校验里（`versionSatisfies(PLUGIN_CONTRACT_VERSION,
manifest.contract)` 不放行当前契约版本即 error），precheck 只是把 loader 抛出的 issues 翻译成 `blocking`
——**"在 precheck 阶段判定"这句是措辞错位，按此更正**。
legacy 适配器（无 manifest 插件）合成的 id 落 `legacy/<name>`，避免与 `<scope>/<name>` 撞命名空间
（`loader.ts` 的 `synthLegacyManifest`）。**带条件**：包名含 `/`（npm scope）时**原样沿用**包名当 id，
于是必被命名空间式小写规则拒绝 ⇒ 见 §7 D-11。
升版本的实测判据（v1.1 排期用）：`^1.0` 放行 `1.1.0` ⇒ 旧 manifest 在次版本提升后继续可用；
但 `^1.1` 在实现仍为 `1.0.0` 时判**不通过** ⇒ **任何 manifest 不得先于实现写 `^1.1`**，
版本常量的提升必须是 v1.1 的最后一笔（`docs/debt.md` C-1 第 6 项 / 批 11）。
另记一处会让升版本漏改的点：`doctor/src/doctor.ts` 的 `validate()` 目前硬编码 `'1.0.0'` 字面量而
未引用 `PLUGIN_CONTRACT_VERSION`。
