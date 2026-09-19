# 遗留债务清单（2026-09-19 起，P4 建立）

> 规则：每份阶段报告末尾附本清单当前状态；**P7 收尾时必须全部清零**。
> 新债务随时入账，标注来源阶段与计划清偿阶段。

| # | 债务 | 来源 | 计划清偿 | 状态 |
|---|---|---|---|---|
| 1 | binary `minVersion` 探测（doctor 合成规则目前只查存在性，不取版本比对下限） | P3 | P5 | ✅ 已清（P5）：Probes 新增 `binaryVersion()`（`--version` 输出首个 semver，3s 超时）；`requires/binaries` 规则低于下限=error、达标=无发现、取不到版本=warn；单测 3 分支覆盖 |
| 2 | configSchema 实际 Schema 校验（precheck 第 11 项目前仅结构级检查） | P3 | P5 | ✅ 已清（P5）：contract 新增 `validateConfigAgainstSchema`（schemastery 调用 / zod safeParse / 纯定义动态重建 三形态）；doctor precheck 对默认配置真校验并阻断；registry.setConfig 写回前校验；5 插件 manifest 落盘纯定义 schema |
| 3 | doctor 文件面检查迁移（存量 CLI 的 schema 语法/引用完整性/注册冲突等静态检查进进程内规则；行为向后兼容） | P0/P3 | P5 | ✅ 已清（P5，按契约拆分）：注册冲突（commands/providers/services 撞名）与 manifest 根字段校验进进程内规则；schema 语法/引用完整性/包依赖解析属**仓级文件面**，保留在 CLI（doctor 仓同步扩展契约字段白名单，14/14 测试过，dry-run 0/0/0 保持）——CLI 与服务共用同一事实面，行为向后兼容 |
| 4 | REQ-10 面板审计接线（registry 已发 `${prefix}/audit:<event>` 事件；面板展示与审计持久化） | P2/P4 | P7（持久化策略） | 🔄 P4：事件发射 + SSE 转发 + v2 页实时 toast 展示已完成；持久化策略留 P7 |
| 5 | CI workflow（仓库无 .github；现为 npm test 门禁链：build×3 → pluggable-lint → no-subplugin-import-check → typecheck×3 → node --test --test-force-exit） | P1 | P7 | ⬜ 未清 |
| 6 | 四份文档：docs/contract.md、docs/add-sub-plugin.md、docs/migration.md、docs/embed-toolkit.md | 规格 §8 | P7 | ⬜ 未清 |
| 7 | semver 预发版偏差（`>=0.1.2-rc.1 <0.2.0` 命中预发版宿主的显式偏差）补进 docs/contract.md 契约全文 | P4 用户要求 5 | P7 | ⬜ 未清 |
| 8 | configSchema → 面板表单完整渲染（schemastery 表单引擎；P4 先以 JSON-able schema 最小渲染 + 原始 JSON 编辑兜底） | P4 | P5 | ✅ 已清（P5）：configSchema 以 schemastery 纯定义落盘 manifest；两渲染器（v2.html + React tab）实现递归表单渲染（object/union/array/boolean/number/string + 必填标注），保存走 registry.setConfig 服务端真校验 |
| 9 | 面板 React tab 集成 v2 视图（P4 只交付独立页 `/api/toolkit-panel/v2/ui`；旧 React tab 的 registry 化属 P5 迁移） | P4 | P5 | ✅ 已清（P5）：React client 新增 `toolkit-panel-v2` tab（order 89，registry 驱动卡片 + 安装向导 + 健康详情 + 配置表单 + SSE 连接器内联 CJS 同构实现）；旧 `toolkit-panel` tab（patch 域管理，P2.4 资产）保留为 order 90 辅助 tab |
