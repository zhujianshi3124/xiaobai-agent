# DSH Sub-Plugin Contract v1 —— 契约全文

> 建立：2026-09-20（P8 收尾，债务 #6/#7 清偿）。事实来源＝代码，逐条给 `文件:行号`；
> 与《toolkit 泛化规格》的偏差在 §7 逐条列明（含用户正式裁决的豁免），不藏。
> 契约版本常量：`contract/src/types.ts` `PLUGIN_CONTRACT_VERSION = '1.0.0'`。

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
| `panels` | ⬜ | 数组，每项必须有非空 `id`（`PanelDescriptor`，其余键开放） |
| `healthCheck` | ⬜ | **只能是函数**，因此只能由模块导出携带；JSON 里出现即 error |

**未知顶层字段 = error**（拼错字段名会静默失效，故拒绝）。迁移期容忍的旧字段清单是封闭的：
`KNOWN_LEGACY_FIELDS = manifestVersion / name / requirements / registers / exports / aliases /
optionalDeps / requiredAliases`（`validate.ts:35`），它们只产 info 级问题、不参与 ok 判定。
**收紧时机**：见 `docs/migration.md` §4（P8 时点尚未收紧，理由与计划在该文）。

### 2.1 `requires` 子域（预检与巡检的事实来源）

`node` / `dshRuntime`（semver 范围）、`services[]`（依赖的 cordis 服务名，即 inject 面）、
`subPlugins[]`（依赖的其他契约 id）、`envVars[]`（`key` 必须形如 `MY_VAR`；**只声明存在性，
任何日志/报告禁止出现值**——REQ-10 安全红线）、`binaries[]`（可带 `minVersion`，真探测见 §6）、
`ports[]`（1–65535，`shared:true` 仅提示不阻断）、`fsPaths[]`（`access: 'r' | 'rw'`）、
`externalApis[]`（`authEnv` 同样只写变量名）。

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

⚠️ 已知不一致（债务 #11b，如实登记）：审计事件由 `registry/src/registry.ts:266` 手工拼
`${servicePrefix}/audit:${event}`，不经 `contractEventName`——因为 `CONTRACT_EVENT_NAMES` 的联合类型
不含 `audit:*`。它**已命名空间、无冲突**，收编需同步 v2-api 转发表、客户端 `V2_EVENT_NAMES`、
SSE 短名映射三处。

## 4. 来源与安装（`PluginSource`，`types.ts:158`）

```
{ kind: 'local', path }   // 唯一已实现（Q1 裁决）
{ kind: 'npm',   spec }   // 契约预留：遇到即抛 source-not-supported
```
追加 npm 来源必须是**纯增量**：不改本契约、不改 registry 主流程（Q1 附加要求）。
入口解析顺序（`registry/src/loader.ts:135`，与宿主 Node 约定对齐）：
`dsh.plugin.json` 的 `exports['.']` → `package.json` 的 `exports['.']`（字符串或
`{".":{default|node}}` 对象形态）→ `package.json` 的 `main` → `index.js` / `index.mjs`。
找不到入口时报**可执行**文案：找到了什么、缺什么、monorepo 根的插件子包候选、补哪个字段带示例
（`loader.ts:110`，T0 裁决）。

## 5. configSchema 的三形态与落盘口径

`validateConfigAgainstSchema`（`contract/src/config-schema.ts`）按形态尽力真校验：
① 可调用 Schema（schemastery 实例）→ 直接调用；② zod（有 `safeParse`）→ safeParse；
③ `{type:...}` 纯定义 JSON → 动态 import schemastery 重建后校验；④ `{uid,refs}` toJSON 形态 → 重建后校验。
构建/重建失败 ⇒ 降级 `via:'skipped'` 并带说明，**不谎称已校验**。

落盘口径（P5 起，用户裁决）：**仓内 manifest 的 configSchema 一律 schemastery 纯定义 JSON、零默认值**
（运行时行为不变；默认值仍在插件代码里）。函数型 Schema 只作为模块导出存在，两处同时在场时
**以模块导出为准**（`loader.ts:233`）。

## 6. 预检 / 健康 / 巡检的形状

- `PrecheckReport{pass, blocking[], warnings[], changes[], legacyMode}`：不修复则拒绝安装的东西进
  `blocking`；`legacyMode:true` 表示被检者是无契约 legacy 包装（面板必须如实标注受限项，不得显示
  "已全项通过"）。
- `HealthReport{pluginId, status: healthy|degraded|unhealthy|unknown, checkedAt, items[]}`；
  `HealthItem.fix{summary, steps?, docsUrl?}` 必须回答"缺什么、改哪里"，禁止"按消息修复后重试"式循环表述
  （T0 裁决，`registry.loadFailureReport` 五分支已按此改写）。
- doctor 规则引擎（`doctor/src/rules.ts`）：一条 `requires` 子类目 = 一条自动合成规则
  （`requires/runtime`、`requires/services`、`requires/subPlugins`、`requires/fsPaths`、
  `requires/externalApis` …）；`registerRule` 是第三方规则扩展点，与内置规则同构。
  周期巡检 `watchInterval` + `failureThreshold` 降级 + `historySize` 环形历史。
- 二进制版本：`Probes.binaryVersion()` 真跑 `--version` 取首个 semver（3s 超时），
  低于 `minVersion` = error，取不到版本 = warn（债务 #1 清偿形态）。

## 7. 与《泛化规格》的偏差登记（全部有裁决出处）

| # | 偏差 | 依据 |
|---|---|---|
| D-1 | **semver 预发版偏差**：`requires.dshRuntime = ">=0.1.2-rc.1 <0.2.0"` 命中预发版宿主。按标准 semver 语义，带比较符的下界含 prerelease 时**不会**匹配同主次的其他 prerelease；本仓 `contract/src/semver.ts` 显式允许预发版参与比较，以便 rc 版宿主通过预检 | 用户要求 5（P4）；实现与回归见提交 `15904f6`（`>=20` 这类带比较符部分版本曾被误加上界 `<21.0.0`，已改为无上界比较器并补 `engines.node ">=20"` 用例）。**债务 #7 在此清偿** |
| D-2 | **TypeScript 范围豁免**：仅 `contract` / `registry` / `doctor` 三模块 TS strict（各自 tsconfig），存量 5 插件与 `panel/` 保持 JS + JSDoc | N1 裁决（`docs/p0-recon.md` §6）：这是对规格 §8 的**正式豁免**；配套硬约束=门禁必须跑 `typecheck`×3（`package.json` scripts.test），不是只放文件 |
| D-3 | **`requires` 整体可选**（规格写法是必填对象） | `types.ts:96` 注释明示；零需求插件不写空对象 |
| D-4 | **函数型成员不落盘**：`healthCheck` 只能是模块导出；`configSchema`/`panels` 允许 JSON 落盘 | `validate.ts:179`；JSON 装不下函数 |
| D-5 | **R13：装入判定依赖 cordis 内部实现**——`fiber.state` 枚举（2=ACTIVE/3=FAILED/4=DISPOSED/**5=UNLOADING**）、FAILED 时 `fiber.await()` 以启动错误 reject、模块命名空间插件的 `apply` 返回 Promise 被视为后台任务（立即 ACTIVE）。这些是 cordis **4.0.2 的实现行为，不是稳定契约**。补充实测：`FiberState` 声明为 `export const enum`，构建产物 `lib/index.js` 中该符号出现 0 次 ⇒ **运行时根本 import 不到**，硬编码数值是当时唯一可选项 | 用户裁决"fiber 状态迁移判定装入"（风险 R13）。缓解：判定收敛在 `registry/src/registry.ts` 单点（导出的 `FIBER_*` 常量 + 轮询循环）；**cordis 升级必须重跑 S1/S4 场景**；该依赖已写入 `registry.ts` 头注。**2026-09-21 复核加固**：`test/cordis-fiber-state.test.mjs` 用真 cordis 实测五个终态数值与 `FIBER_*` 逐一对账（显式守卫，编号漂移当场红）；轮询补 UNLOADING 分支并区分错误码（`FIBER_LOAD_ERROR_CODES`）；`peerDependencies` 收紧为 `^4.0.2` 并加范围守卫。本体裁决不变 |
| D-6 | 审计事件名手工拼装（见 §3 末） | 债务 #11b，未清偿，交用户复核 |

## 8. 兼容性规则

破坏性变更必须升契约**主版本**并提供适配层（规格 §8）；`contract` 字段本身就是为这件事留的闸门：
桶在 precheck 阶段用 `versionSatisfies(PLUGIN_CONTRACT_VERSION, manifest.contract)` 判定能不能装。
legacy 适配器（无 manifest 插件）合成的 id 落 `legacy/<name>`，避免与 `<scope>/<name>` 撞命名空间
（`loader.ts:181`）。
