# 遗留债务清单（2026-09-19 起，P4 建立）

> 规则：每份阶段报告末尾附本清单当前状态；**P8 收尾时必须全部清零**（阶段号重排：原 P7 收尾顺延为 P8，见 P6 报告）。
> 新债务随时入账，标注来源阶段与计划清偿阶段。

| # | 债务 | 来源 | 计划清偿 | 状态 |
|---|---|---|---|---|
| 1 | binary `minVersion` 探测（doctor 合成规则目前只查存在性，不取版本比对下限） | P3 | P5 | ✅ 已清（P5）：Probes 新增 `binaryVersion()`（`--version` 输出首个 semver，3s 超时）；`requires/binaries` 规则低于下限=error、达标=无发现、取不到版本=warn；单测 3 分支覆盖 |
| 2 | configSchema 实际 Schema 校验（precheck 第 11 项目前仅结构级检查） | P3 | P5 | ✅ 已清（P5）：contract 新增 `validateConfigAgainstSchema`（schemastery 调用 / zod safeParse / 纯定义动态重建 三形态）；doctor precheck 对默认配置真校验并阻断；registry.setConfig 写回前校验；5 插件 manifest 落盘纯定义 schema |
| 3 | doctor 文件面检查迁移（存量 CLI 的 schema 语法/引用完整性/注册冲突等静态检查进进程内规则；行为向后兼容） | P0/P3 | P5 | ✅ 已清（P5，按契约拆分）：注册冲突（commands/providers/services 撞名）与 manifest 根字段校验进进程内规则；schema 语法/引用完整性/包依赖解析属**仓级文件面**，保留在 CLI（doctor 仓同步扩展契约字段白名单，14/14 测试过，dry-run 0/0/0 保持）——CLI 与服务共用同一事实面，行为向后兼容 |
| 4 | REQ-10 面板审计接线（registry 已发 `${prefix}/audit:<event>` 事件；面板展示与审计持久化） | P2/P4 | P8（持久化策略） | 🔄 P6 更新：实时 toast 展示面已随归一迁入唯一 toolkit-panel 标签页（浏览器级验证 audit:enabled/installed 事件推送 → toast 到达）；持久化策略留 P8 |
| 5 | CI workflow（仓库无 .github；现为 npm test 门禁链：build×3 → pluggable-lint → no-subplugin-import-check → typecheck×3 → node --test --test-force-exit） | P1 | P8 | ⬜ 未清 |
| 6 | 四份文档：docs/contract.md、docs/add-sub-plugin.md、docs/migration.md、docs/embed-toolkit.md | 规格 §8 | P8 | ⬜ 未清 |
| 7 | semver 预发版偏差（`>=0.1.2-rc.1 <0.2.0` 命中预发版宿主的显式偏差）补进 docs/contract.md 契约全文 | P4 用户要求 5 | P8 | ⬜ 未清 |
| 8 | configSchema → 面板表单完整渲染（schemastery 表单引擎；P4 先以 JSON-able schema 最小渲染 + 原始 JSON 编辑兜底） | P4 | P5 | ✅ 已清（P5）：configSchema 以 schemastery 纯定义落盘 manifest；两渲染器（v2.html + React tab）实现递归表单渲染（object/union/array/boolean/number/string + 必填标注），保存走 registry.setConfig 服务端真校验。**P6 注**：v2.html 随过渡面退役删除，递归表单保留在归一面板（React client），渲染与保存路径由 panel-unified 测试覆盖 |
| 9 | 面板 React tab 集成 v2 视图（P4 只交付独立页 `/api/toolkit-panel/v2/ui`；旧 React tab 的 registry 化属 P5 迁移） | P4 | P5 | ✅ 已清（P5）→ **P6 归一终态**：v2 过渡 tab 与 /v2/ui 独立页已退役（退役笔 9bd52ba），registry 管理区并入唯一 toolkit-panel 标签页 |
| 10 | **面板归一与过渡面退役**（用户需求修正 2026-09-19，权威规格）：最终只保留 toolkit-panel 这一个管理面板——不新增标签页、不保留独立页；"自适应、真管理"=装入新插件后现有面板免刷新自动出现对其管理（启停/配置/卸载/健康），零代码改动；既有 P2.4 资产（体检操作台/白名单编辑/预设恢复）原样保留在同一面板、入口可达，仅加缺席降级容错；toolkit-panel-v2 标签页与 /v2/ui 独立页为过渡面，归一完成且全量回归全绿后退役删除 | P6（用户修正） | P6 | ✅ 已清（P6）：归一笔 c4a1762（V2Section 并入唯一面板+旧卡片区降级为工具区+三重容错+传输复用 realtime-connector+修复 3 个 P5 潜伏渲染 bug）＋退役笔 9bd52ba（删 v2 tab//v2/ui/v2.html，/v2/connector.js 保留为引擎 HTTP 面）。浏览器级命门验收通过：真 React+真 v2 API 下装入第 6/7 插件免刷新自动出现并可完整管理（停用/启用 confirm 流/健康详情/环形历史/legacy 徽标/审计 toast）；门禁 165/0+319→314 项 smoke+79/79+718/0 全绿 |
| 11 | **P7 无根假设终检的两处维持现状项**（用户冷启动包 v4 第四步 ③ 要求全链路核查，结论与理由如下，交用户复核）：<br>**(a) `apply-engine.PLAN_STORE` 仍是模块级 Map**——同进程双实例共用一个待确认 plan 池。曾改为 `createPlanStore()` 按实例持有，但 `uninstall.mjs` 的 10 个 plan/execute 函数与 6 个验收脚本（p21/p22/p23/p24-verify、p24-ui-matrix、backup-write-test）都以 `putPlan/getPlan/dropPlan` 模块函数为契约，改签名要动 P2.4 深度生命周期资产全链（面板纪律：既有功能原样保留），实测连带 7 项回归红。风险面评估：plan token 为 sha256 派生、短生命周期、只在同一 loopback+CSRF 信任域内可见，且 patch 域天然只针对一份 `cordis.patch.yml`。**触发重做的条件**：出现"两个 toolkit 实例管理**不同** toolkitRoot 且需要互相隐藏 plan"的真实场景<br>**(b) 审计事件名手工拼装** `registry.ts:266` 用 `${servicePrefix}/audit:${event}`，不经 `contractEventName`（`CONTRACT_EVENT_NAMES` 联合类型不含 `audit:*`）。已命名空间、无冲突，只是与契约拼装函数不同路。**收编做法**：把 `audit:*` 纳入契约事件枚举（须同步 v2-api 转发表、客户端 `V2_EVENT_NAMES`、SSE 短名映射三处） | P7 | P8 或用户另裁 | ⬜ 维持现状（理由已给，待用户复核） |

