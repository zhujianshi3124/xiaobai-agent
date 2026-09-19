# Changelog

本文件记录 @local/dsh-toolkit 的对外可见变更。格式遵循 Keep a Changelog；
版本号 semver。工具箱泛化改造的阶段产出按 P0–P7 记录（规格见判定台账，
现状与裁决见 `docs/p0-recon.md`）。

## [Unreleased]

### Changed（P5 存量迁移，2026-09-19）

- **5 个存量插件 manifest 契约化**（REQ-9）：`lib/*/dsh.plugin.json` 就地扩展契约
  字段 `id`（`dsh/<name>`）/ `displayName` / `version` / `contract: "^1.0"` /
  `configSchema`（schemastery 纯定义 JSON，类型约束零默认——运行时行为零变化，
  unknown 键直通有 S6 测试钉住）；存量字段（manifestVersion/name/requirements/
  registers/exports）原样保留为 info 级容忍（deprecated 别名清单见 docs/debt.md 附录）。
- **doctor CLI（沙箱仓 @local/dsh-toolkit-doctor）兼容性扩展**：manifest 根字段
  白名单接受契约字段并做类型校验；`node --test` 14/14、真实仓 dry-run 保持 0/0/0。
- **doctor 进程内规则补强**（债务 #1/#2/#3）：
  - `Probes.binaryVersion()` 真探测（`--version` → 首个 semver，3s 超时），
    `requires/binaries` 规则比对 minVersion（低于=error / 取不到=warn）；
  - precheck 对默认配置做 configSchema 真校验（contract.`validateConfigAgainstSchema`
    三形态：schemastery 调用 / zod safeParse / 纯定义动态重建），必填缺失阻断安装；
  - 注册冲突规则：commands/providers/services 与已注册条目撞名 → `reg.name-collision`
    阻断（registry 暴露 `registersOf`）。
- **面板 registry 驱动化**（债务 #8/#9）：
  - React client 新增 `toolkit-panel-v2` tab（order 89）：registry 驱动插件卡片、
    安装向导、健康详情（items+fix+历史）、configSchema 表单、SSE 连接器（内联
    CJS 同构实现，断连降级轮询/恢复切回）；
  - 旧 `toolkit-panel` tab（patch 域管理，P2.4 资产）保留为 order 90；
  - v2.html 配置表单升级为纯定义递归渲染。
- **panel/index.js**：v2 路由全部套既有 guard（loopback/配对/CSRF，写路由 change:true
  ——p1-smoke 闸验证）；两处子插件名注释文案改写为中性表述（零子插件引用证据入报告）。
- **scripts/p1-smoke.mjs**：路由 22→33，新增 v2 路由 gate/方法预期与 WRITE_ROUTES；
  **scripts/q2-layer-scan.mjs**：不变量更新为"顶层契约字段例外，patch/override/
  bundle/rows 与嵌套 id 仍禁止"。
- 门禁：`npm test` 链加入 no-subplugin-import-check（面板零子插件引用守卫）。

### Fixed（P4 期间发现的 P1 契约 semver 缺陷）

- `contract/src/semver.ts`：带比较符的部分版本（如 `>=20`）此前被误当作 x 范围
  展开成 `>=20.0.0 <21.0.0`（误加上界）。修正语义：**带 `>`/`>=`/`<`/`<=` 的部分
  版本补零为无上界比较器**（`>=20` → `>=20.0.0`）；裸部分版本（`20`、`1.2`）与
  `=` 保持 x 范围语义。新增回归测试。

### Added（P4 面板 v2 管理 API + 实时通道，2026-09-19）

- `panel/manager/registry-host.mjs`：面板插件 apply() 时装配 registry + doctor
  服务（servicePrefix/registry/doctor 配置段全部来自插件 config，D5）；接线
  doctor.precheck → registry 安装预检、health-changed → registry.setHealth。
- `panel/manager/v2-api.mjs`：v2 管理 API（`/api/toolkit-panel/v2/*`）——
  snapshot / health(含环形历史) / install 两段式（precheck → confirm）/
  uninstall / enabled / reload / config，全部走 registry API；**confirm 必须逐字
  等于插件 id**；失败一律 `{ok:false, code, error}`（confirm-missing /
  plugin-unknown / value-invalid…）；无任何旁路状态改写通道。
  **SSE 路由** `/events`：转发 registry/doctor 带前缀事件（短 event 名）+ hello
  帧 + 15s 心跳。
- `panel/manager/realtime-connector.mjs`：实时连接器（零依赖，浏览器/Node 双
  端可用）——SSE 在场事件直达；断连自动降级轮询；恢复自动切回（Q3 裁决双
  路径，均有测试）。
- `panel/client/v2.html` + `/v2/ui` 路由：通用渲染独立页——插件列表（状态徽标/
  legacy 标注/健康摘要）、健康详情（items + fix 建议 + 历史序列）、configSchema
  最小表单 + 原始 JSON 兜底、安装向导（预检报告 → 阻断/警告/changes 修复清单
  → 确认安装）；doctor 缺席降级横幅；审计事件实时展示。
- `registry`：新增 `setConfig`（配置写回 + active 重载生效）与审计事件发射
  （`${prefix}/audit:<event>`，REQ-10）。
- `test/panel-v2.test.mjs`（7 例）：SSE 真流（原生 fetch 流解析线协议）、connector
  断连降级/恢复切回双路径、confirm 校验、失败反馈 error.code/message、snapshot
  结构、config 写回。
- `scripts/p4-no-subplugin-import-check.mjs`：面板 v2 数据面零子插件引用检查
  （验收证据工具，可入 CI）。
- 门禁：test 链自动发现新测试；`test:panel` 脚本。

### Added（P3 Doctor 服务，2026-09-19）

- `doctor/`：Doctor 服务（TS strict，接口 = 契约 `ToolkitDoctor`）。
  - 规则引擎：规则超时（默认 5s，超时计 `rule-error`）+ `registerRule` 第三方
    规则扩展点（REQ-4 规则来源三合一中的注册侧；内置侧 = 合成规则实现层）。
  - manifest.requires 自动合成规则：运行时版本范围（node/dshRuntime）、依赖
    服务、依赖子插件、envVars（只报存在性绝不出现值）、binaries、ports
    （shared 占用仅提示）、fsPaths 读写、externalApis 可达性。
  - `precheck`（REQ-3 全量）：来源解析 + manifest 精确字段路径 + id 冲突 +
    合成规则全量 + legacy 标注（legacyMode/changes/fix 指引）；`createRegistry`
    以 `precheck` 选项接入后，S1 的"缺 env → 阻断 → 补齐 → 安装成功"全链路成立。
  - `inspect`（REQ-4）：周期巡检（watchInterval，失败退避上限 8×）+
    manifest.healthCheck（超时/异常计 `healthcheck-failed`，计入降级计数）。
  - 降级状态机：连续 failureThreshold 次失败 → 发布 degraded/unhealthy 并发
    `doctor:issue-found`（每 code 一次，恢复后重置）；任一次全绿 → 立即回
    healthy 发 `registry:health-changed`。每插件环形缓存 historySize 份报告，
    `history(id)` 供面板画历史。
  - 探测面 `Probes` 全部可注入（S3 故障注入即替换/操纵真实服务）。
- `test/doctor.test.mjs`：合成规则、S1 完整分支、S3 故障注入（真实 cordis
  服务下线→阈值内降级→恢复）、周期巡检、环形历史、规则超时、healthCheck
  计入，共 9 例。
- 门禁：`node --test` 全部加 `--test-force-exit`（doctor 观测面可能持有句柄，
  保证 CI 可退出）；test 链加 `build:doctor`，typecheck 覆盖 doctor tsconfig。
- `scripts/pluggable-lint.mjs`：SHARED_MODULES 加入 `doctor`。

### Added（P2 Registry，2026-09-19）

- `registry/`：注册中心服务（TS strict，接口 = 契约 `ToolkitRegistry`）。
  - 生命周期：`install / uninstall / setEnabled / reload / list / get`，全部真实生效
    （cordis 派生 ctx 装入/卸出 fiber；装入完成以 **fiber 状态迁移** 判定——ACTIVE /
    FAILED / DISPOSED / 超时兜 PENDING——不改写插件对象、不依赖 apply 返回值的
    await 语义，R2 结论见 `docs/p0-recon.md` §6）。
  - 安装来源：`PluginSource = local`（Q1 裁决）；npm 分支显式报
    `source-not-supported`（纯增量预留）。
  - 预检（P2 契约级子集，P3 doctor.precheck 注入替换）：manifest 契约校验、
    id 冲突、`requires.services` 可用性、legacy 标注；blocking 不注册并返回
    `PrecheckReport`（每项含 fix）。
  - legacy 适配器：无 manifest 插件自动包装（id 取包名归一 `legacy/<name>`），
    可启停/卸载，预检标注 legacyMode 与补 manifest 指引。
  - 错误隔离（REQ-6）：装入失败 → error + 指数退避自动重试（默认上限 3）→
    quarantined；手动 enable/reload 清零重试；toolkit 级 `stop()` 级联卸载。
  - 持久化（REQ-7）：`state.json`（原子写）记录 source/enabled/config/
    quarantined/lastError；autoload 重启恢复，源丢失项进 error 并保留 lastError。
  - 操作互斥：同 id 串行、install 全局互斥。
  - 事件：`registry:plugin-added/removed/status-changed` 全部经
    `${servicePrefix}/…` 前缀发射（D5）。
- `test/registry.test.mjs` + `test/fixtures/registry/`：S1（契约级）/S2/S4 场景与
  持久化、互斥、stop 级联清理共 12 例。
- `scripts/pluggable-lint.mjs`：共享基础模块白名单改为 `SHARED_MODULES =
  ['contract', 'registry']`（P3 将加入 doctor）。
- 门禁：`npm test` 链加入 `build:registry`，typecheck 覆盖 registry tsconfig。

### Added（P1 契约模块，2026-09-19）

- `contract/`：**DSH Sub-Plugin Contract v1** 单一契约模块（`PLUGIN_CONTRACT_VERSION = '1.0.0'`），
  导出：全部公共类型（manifest / 健康报告 / 预检报告 / PluginSource / registry / doctor 接口面）、
  运行时校验（`validateManifest` / `validateModuleExports`，失败给出字段路径 + 期望 + 实际）、
  零依赖 semver 与范围引擎（caret/tilde/x/比较符/`||`；对 DSH 生态
  `>=0.1.2-rc.1 <0.2.0` ↔ 预发版宿主的命中语义做了**显式偏差**，见 `contract/src/semver.ts` 头注）、
  服务/事件命名（`${servicePrefix}/registry|doctor` 与 `${servicePrefix}/registry:…`）。
  包导出 `@local/dsh-toolkit/contract`（`./contract/dist/index.js`，含 `.d.ts`）。
- `test/contract.test.mjs` + `test/fixtures/contract/`：契约正反 fixture 单测（17 例）。
- 门禁：`npm test` 现为 `build:contract → pluggable-lint → typecheck → node --test`；
  新增脚本 `build:contract` / `typecheck` / `test:contract`。
- devDependencies：`typescript@5.9.3`、`@types/node@^22`；首次引入 `package-lock.json`。
- `scripts/pluggable-lint.mjs`：白名单 `@local/dsh-toolkit/contract` 为共享基础模块
  （非兄弟插件，允许静态 import）。

### Decision（规格 §8 正式豁免，用户裁决 N1，2026-09-19）

TypeScript strict **仅适用于新模块**（contract / registry / doctor，独立 tsconfig）；
存量 5 个子插件与 panel 保持纯 JS + JSDoc。理由与约束：契约模块产出 `.d.ts` 供
JS 侧 JSDoc 引用，公共类型仍统一从 contract 导出；typecheck 已接入 test 门禁
（不能只放文件不检查）。裁决原文见 `docs/p0-recon.md` §6。
