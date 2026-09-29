# 存量迁移与配置权威模型（REQ-9）

> 建立：2026-09-20（P8，债务 #6）。回答三件事：**5 个存量插件迁到哪了**、**配置到底谁说了算**、
> **旧字段什么时候收紧**。

## 1. 已完成：5 个存量插件契约化（P5）

`lib/{rate-throttle,compact-router,agent-memory,search-router,web-search-local}/dsh.plugin.json`
就地扩展契约字段（**不新建第二套 manifest 体系**，R1 的处置）：

| 字段 | 值 |
|---|---|
| `id` | `dsh/rate-throttle` 等（命名空间式，全局唯一，不是路径） |
| `displayName` / `version` / `contract` | 中文名 / `0.1.0` / `^1.0` |
| `configSchema` | schemastery **纯定义 JSON、零默认值**（运行时行为零变化） |

旧字段（`manifestVersion` / `name` / `requirements` / `registers` / `exports` / `aliases` /
`optionalDeps` / `requiredAliases`）原样保留，被**本仓契约**当作 **info 级容忍**
（`contract/src/validate.ts` 的 `KNOWN_LEGACY_FIELDS`）。
**两处限定（★8 定稿）**：① 这份清单只描述本仓的容忍度——其中 `manifestVersion`/`name`/`requirements`
在**独立 doctor** 侧是**必填**（缺则 error），入口声明的正典位置是 `requirements.exports`，
**写到顶层 `exports` 在独立 doctor 侧当场产 error**（`清单根字段非法: exports`），别把"info 容忍"
读成"可以随便写"；② 上面这句话覆盖的单元不止 5 个 lib 插件——带 `dsh.plugin.json` 的实测是 **7 个**
（5 个 `lib/` + 桶根 + `panel/`），"内置插件"的四种数法见 `docs/contract.md` §7 D-2 与
`docs/contract-v1.1-recon.md` §4。

toolkit 自身也在 P7 走了同一条路：根 `dsh.plugin.json` 加上 `id=dsh/toolkit` + `requires` +
`configSchema` + `panels`（`docs/embed-toolkit.md` §1）。`panels` 那个描述符目前是**自述性数据**
（宿主不读、本仓只透传，`docs/contract.md` §7 D-8）；根 manifest 的 `requires.services`
（`["webServer"]`）当前还会被误记成"本插件提供的服务"（`docs/contract.md` §7 D-10）。

## 2. 三层配置的权威边界与生效时机

| 层 | 位置 | 谁写 | 生效时机 |
|---|---|---|---|
| **boot 权威** | patch 层：bundle `cordis.patch.yml` + profile `cordis.patch.yml` + **home `~/.dsh/cordis.patch.yml`（优先级高于 profile）** + `--patch`，行内 `config:` | 面板 plan/execute 文本改写（sha 校验 + 写前备份） | **重启 dsh web**（bundle 层不热重载；"18/18 生效路径已在 P2.3 逐字段钉死"是当时的读数，且其中含只在全链扫描下才跑的 `p23-verify`——`regression-all` 不含它，见 `docs/debt.md` D-3） |
| **热配置** | `~/.dsh/dsh-search-router.json`（每次调用重读）、`~/.dsh/dsh-rate-throttle.json` + `-learned.json`；**其上是环境变量层 `DSH_WEB_SEARCH_ROUTER_MODE`（优先级最高，只收合法枚举）**；再往上是 web-search-local 的 settings 节 | 插件自读自管 | 即时。**注意遮蔽**：search-router 的 `mode` 与 web-search-local 的 settings section 会盖住 patch 值——面板如实显示"生效值/来源"，不提供会被关闭通道覆盖的编辑（判定侧第 15 轮方案 1）。**rate-throttle 的热 JSON 是"并集/放宽"而非覆盖**（`excludeProviders` 等按并集生效），可用 `routing.hotConfigPath:'none'` 整体关断；`-learned.json` 由插件自己写 |
| **registry 运行态** | `<toolkitRoot>/.registry/state.json`（安装记录 / enabled / config / 隔离原因 / lastError） | registry（面板 v2 写路由） | 即时（运行时装入/卸出/热配置），重启后按 `autoload` 恢复 |

**门禁的可见面边界（如实）**：本机 CI 第 5 步 `scripts/patch-config-check.mjs` 按宿主通道语义校验的是
**仓内那份 `cordis.patch.yml`**；profile/home 层、settings 节、环境变量层它都看不到。
`docs/debt.md`《settings 层核查（补充轮）》记过一次只读核查（结论：当时无覆盖层），
其判据是 `~/.dsh/settings.yaml` 是否出现 `web-search-local` 节。

优先级模型（R2 的定案）：**boot = patch 行；运行时 = registry 状态；重启后 registry 以记录为准**。
两者不互相覆盖，但同一插件若既在 patch 行又被 registry 装入，就是两份 fiber——面板不会替你合并，
请按需要二选一。

## 3. compact-router 的预设挂载特例（R5）

compact-router 不在 `cordis.patch.yml` 里，由 `scripts/apply-preset-patch.mjs` 改写 agent 预设
（`~/.dsh/.agent-presets/*/agent.cordis.yml`），状态记于 `preset-patch-state.json`。
迁移处置：**预设作为一种挂载面保留**，面板的卸载/恢复/挂载对它有独立分支（`panel/manager/uninstall.mjs`
的 preset 系列函数 + 保管区 `.panel-custody`），语义与 P2.4 验收资产一致（软/真卸载、恢复三态、
收据只读对账）。它**没有**两层开关（面板不渲染其启停，恒按事实呈现）。

## 4. 旧字段收紧时机（REQ-9 的后半段）

`KNOWN_LEGACY_FIELDS` 目前是 info 级容忍。收紧为 error 的前置条件（三条全满足才动）：

1. 消费方迁移完毕：doctor 独立 CLI（沙箱仓 `@local/dsh-toolkit-doctor`）的根字段白名单已同步扩展
   （`requires` / `panels` 于 doctor@6839cc1 加入），但**旧字段仍被它校验**——收紧要两仓同批。
2. 面板不再读旧字段：`panel/manager/plugin-registry.mjs` 的 5 插件硬编码清单与
   `snapshot.mjs` 的 `ORIGINS/ROW_IDS` 映射仍在使用（这是 P2.4 深度生命周期资产，面板纪律要求原样保留）。
3. 有替代表达：契约缺"提供面"字段（见 `docs/debt.md` #12）——`requirements.registers.*` 目前
   **不可移除**，否则注册冲突检查失明。

⇒ 结论：**本次不收紧**（P8 明确遗留项，非静默放宽）。收紧时机建议与"契约 v1.1 补 `provides` 字段"
同批，且需要一次 legacy 字段引用审计。

**2026-09-22 审定轮对这一节的现状更新（原文不改写，修订滚存）**：三条前置**一条都没满足**，且真实门槛
比原文写的更深——① 独立 doctor 不只是"仍在校验旧字段"，它把 `manifestVersion`/`name`/`requirements`
定为**必填**（缺则 error）、把 `requirements` 五键定为必填 ⇒ 收紧等于判自己的 7 份 manifest 违规，
`0/0/0` 当场破；② 前置 2 的字面要求（"面板不再读旧字段"）与同段引的**面板纪律**（P2.4 资产原样保留）
正面冲突 ⇒ 按字面永远满足不了，可改的只有"读哪个字段"；③ 前置 3 随 `provides` 落地满足。
⇒ 用户裁定：**第 3 项整体移出 v1.1**，完整前置清单（含"撤必填集会令 doctor 键集校验静默空转"的
连带修正）见 `docs/debt.md` C-2；本节原文作为 v1.2 的起点保留。

## 5. 外部插件要不要迁移？

**不需要**。legacy 适配器保证"未实现契约的普通 DSH 插件"照样装入并被管理（`docs/add-sub-plugin.md` §1）。
**例外（★18 定稿）**：**带 npm scope 的包（`@scope/name`）不能走 legacy** —— 合成 id 只在包名不含 `/`
时才加 `legacy/` 前缀，含 `/` 时原样沿用包名、必被命名空间式小写规则拒 ⇒ 这类包**必须**写
`dsh.plugin.json` 且 `contract` 为非空字符串（`docs/add-sub-plugin.md` §1 规则 2、
`docs/contract.md` §7 D-11）。
迁移的收益按需要拿：

| 想要 | 必须补 |
|---|---|
| 环境预检（node/dsh/二进制/envVar/端口/路径/外部 API） | `requires` |
| 自动配置表单 + 写回真校验 | `configSchema`（纯定义 JSON 落盘或模块导出 `Config`；**两处都在时以谁为准见 `docs/contract.md` §7 D-12——已裁定"模块导出赢"，实现跟上之前当前是盘上 JSON 赢**） |
| 自定义健康检查 | 模块导出 `healthCheck` ——【批 3 落地，当前装载链不绑定、写了不跑；本仓无任何模块导出它，故接通后内置插件的生效面为 0】 |
| 被注册冲突检查覆盖 | 暂时用 `requirements.registers.*`（缺口现记 `docs/debt.md` C-1 第 1 项 —— 本文原写"#12"已失效：A 区 #12 现为"cordis 符合度复核 Pack A"）；`provides` 落地后改用它 |
| 面板里显示正经名字/版本 | `id` / `displayName` / `version` / `contract` |

## 6. doctor 的两张脸（按裁决拆分，行为向后兼容）

| 检查 | 落在哪 | 为什么 |
|---|---|---|
| 注册冲突（撞名）、manifest 根字段校验、`requires` 合成规则、周期巡检、健康历史 | **进程内服务**（`doctor/`，桶内） | 面板要实时、要事件流、要免重启。两个服务（`${prefix}/registry`、`${prefix}/doctor`）都经 `provideService` 真进容器，面板外也可 `ctx.get` 取到（`test/toolkit-services.test.mjs` 4 例，含双实例不撞名） |
| 仓级文件面：schema 语法/BOM/JSON-YAML 清单校验、`@local/*` 引用完整性、包依赖解析、跨目录链接、挂载/provider 三检查、`requirements` 键集与 `./` 目标存在性、`$from` 的套件根专属规则 | **独立 CLI**（沙箱仓 `@local/dsh-toolkit-doctor`） | 需要扫全盘文件与备份目录，属一次性静态审计。**严重级纪律与进程内相反：缺席/缺依赖类一律 info/warning，绝不产 error**（它的验收红线是真实仓 `0/0/0`）。面板以 `execFile` 调它：**缺省 180s**、`--states` 为 **60s**（★15 定稿：原文"120s"是 2026-09-18 的旧值，09-19 的 `b3b1575` 已放宽；源头读数还留在 `docs/p0-recon.md`，本轮一并修） |

**失败语义按路由分述（★15 定稿：原文"不可达即返回 `degraded`"把一条路由的行为说成了整域）**：
`/doctor/states` 不可达 ⇒ `200 {ok:false, degraded:true}`；`/doctor/dry-run` ⇒ **`500` + `ok:false`**
（无 `degraded` 字段）；`/doctor/apply/plan`、`/doctor/rollback/*`、快照恢复 ⇒ 抛
`doctor-spawn-failed` 映射到 `500`。三条都"不假装可用"，但只有第一条带 `degraded` 标记。

**两仓事实面的准确表述（★12 定稿，替换原"两仓共用同一事实面"一句）**：两仓读的是**同一批磁盘
manifest**，但**校验口径不是一套**——本仓契约要求 `id`/`displayName`/`version`/`contract`（`requires`
可缺席），独立 doctor 要求 `manifestVersion`/`name`/`requirements` 及其五键 ⇒
"过契约"与"过 doctor"互不蕴含，同一份 manifest 可以一边绿一边红（本仓 7 份靠**两套字段都写**才同时通过）。
该分叉已裁定为**两仓分权**：解析行为归本契约、必填性归独立 doctor（`docs/contract.md` §4 与 §7 D-7；
收紧问题转 `docs/debt.md` C-2）。
另两处更正：`doctor-signals.json` 是**独立 CLI 独占消费**的声明文件（本仓 `panel/` 与 `registry/` 对它
零引用，面板用的是自己手抄的一份表，漂移守卫只覆盖 `providers` 一栏）；engine 零插件名硬编码（红线 4）
这一句仍然成立。
验收红线：真实仓 dry-run `0/0/0`（error/warning/info 全零）。
