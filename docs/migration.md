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
`optionalDeps` / `requiredAliases`）原样保留，被契约校验当作 **info 级容忍**
（`contract/src/validate.ts:35` `KNOWN_LEGACY_FIELDS`）。

toolkit 自身也在 P7 走了同一条路：根 `dsh.plugin.json` 加上 `id=dsh/toolkit` + `requires` +
`configSchema` + `panels`（`docs/embed-toolkit.md` §1）。

## 2. 三层配置的权威边界与生效时机

| 层 | 位置 | 谁写 | 生效时机 |
|---|---|---|---|
| **boot 权威** | patch 层：bundle `cordis.patch.yml` + profile `cordis.patch.yml` + `--patch`，行内 `config:` | 面板 plan/execute 文本改写（sha 校验 + 写前备份） | **重启 dsh web**（bundle 层不热重载；18/18 生效路径已在 P2.3 逐字段钉死，无遮蔽） |
| **热配置** | `~/.dsh/dsh-search-router.json`（每次调用重读）、`~/.dsh/dsh-rate-throttle.json` + `-learned.json` | 插件自读自管 | 即时。**注意遮蔽**：search-router 的 `mode` 与 web-search-local 的 settings section 会盖住 patch 值——面板如实显示"生效值/来源"，不提供会被关闭通道覆盖的编辑（判定侧第 15 轮方案 1） |
| **registry 运行态** | `<toolkitRoot>/.registry/state.json`（安装记录 / enabled / config / 隔离原因 / lastError） | registry（面板 v2 写路由） | 即时（运行时装入/卸出/热配置），重启后按 `autoload` 恢复 |

优先级模型（R2 的定案）：**boot = patch 行；运行时 = registry 状态；重启后 registry 以记录为准**。
两者不互相覆盖，但同一插件若既在 patch 行又被 registry 装入，就是两份 fiber——面板不会替你合并，
请按需要二选一。

## 3. compact-router 的预设挂载特例（R5）

compact-router 不在 `cordis.patch.yml` 里，由 `scripts/apply-preset-patch.mjs` 改写 agent 预设
（`~/.dsh/.agent-presets/*/agent.cordis.yml`），状态记于 `preset-patch-state.json`。
迁移处置：**预设作为一种挂载面保留**，面板的卸载/恢复/挂载对它有独立分支（`manager/uninstall.mjs`
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

## 5. 外部插件要不要迁移？

**不需要**。legacy 适配器保证"未实现契约的普通 DSH 插件"照样装入并被管理（`docs/add-sub-plugin.md` §1）。
迁移的收益按需要拿：

| 想要 | 必须补 |
|---|---|
| 环境预检（node/dsh/二进制/envVar/端口/路径/外部 API） | `requires` |
| 自动配置表单 + 写回真校验 | `configSchema`（纯定义 JSON 落盘或模块导出 `Config`） |
| 自定义健康检查 | 模块导出 `healthCheck` |
| 被注册冲突检查覆盖 | 暂时用 `requirements.registers.*`（见 #12） |
| 面板里显示正经名字/版本 | `id` / `displayName` / `version` / `contract` |

## 6. doctor 的两张脸（按裁决拆分，行为向后兼容）

| 检查 | 落在哪 | 为什么 |
|---|---|---|
| 注册冲突（撞名）、manifest 根字段校验、`requires` 合成规则、周期巡检、健康历史 | **进程内服务**（`doctor/`，桶内） | 面板要实时、要事件流、要免重启 |
| 仓级文件面：schema 语法/BOM/JSON-YAML 清单校验、`@local/*` 引用完整性、包依赖解析、跨目录链接、挂载/provider 三检查 | **独立 CLI**（沙箱仓 `@local/dsh-toolkit-doctor`） | 需要扫全盘文件与备份目录，属一次性静态审计；面板以 `execFile` 调它（120s 超时），不可达即返回 `degraded` 不假装可用 |

两仓共用同一事实面（磁盘 manifest + `doctor-signals.json` 声明），engine 零插件名硬编码（红线 4）。
验收红线：真实仓 dry-run `0/0/0`（error/warning/info 全零）。
