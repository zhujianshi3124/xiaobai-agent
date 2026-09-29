# T0 真实插件兼容性闭环 · 真浏览器验收证据

> 归档时刻：2026-09-19 23:26（GMT+8）。对应提交：dd6727f / 0a35d63 / d83663e。
> 被装插件：`D:\dsh-test-sandbox\dsh-repo-spec\packages\dsh-plugin`（用户本地开发项目
> dsh-repo-spec 的插件子包，cordis 形态：name/inject=['tools','systemPrompt']/Config(schemastery)/apply，
> package.json exports['.'] 为对象形态 {".":{"types":…,"default":"./dist/index.js"}}，无 main）。
> harness：mock 桶（`_t0-harness/harness.mjs`，不入仓）——真实 cordis Context + toolkit 真身服务
> （registry/doctor/v2 API/connector.js 直出）+ 宿主页以真 React UMD 加载真实 panel client bundle；
> 以 `ctx.reflect.provide` 提供 tools/systemPrompt 两个 stub 服务模拟真实 dsh web 环境（宿主本来就有）。
> 零宿主改造、零 toolkit 产品代码特判、零被装插件改动。

## 一、根因判定（对应冷启动包 T0.1/T0.2）

- 用户预检报错（monorepo 根 `D:\dsh-test-sandbox\dsh-repo-spec`）为**插件侧缺入口元数据**（裁决 a）：
  该目录是 pnpm monorepo 壳（`dsh-repo-spec-monorepo`，private，无 main/exports/index.js），
  正确安装目标是子包 `packages\dsh-plugin`。宿主以同路径装载也会同样失败（Node 解析无入口）。
- 对照宿主约定发现的 **loader 真实缺口（裁决 b，G1 bug）**：toolkit loader 原来只认
  dsh.plugin.json exports['.'] → package.json **main** → index.{js,mjs}，**不读 package.json 的
  exports['.']**（字符串与 {".":{"default":…}} 对象形态均不认）——仅 exports 无 main 的插件
  宿主装得上、toolkit 误报 entry-not-found。已在 loader 修复并对齐（dd6727f）。

## 二、闭环实测（真浏览器，逐步留证）

原始截图（人工留档，不入库）：`.panel-backups/t0-real-plugin-loop-2026-09-19T23-26-24/`。

| # | 步骤 | 实测结论（页面真实断言） | 截图 |
|---|---|---|---|
| 1 | 装 monorepo 根 → ① 预检 | 预检结论=存在阻断项；报错逐字含「已读取 package.json（name=dsh-repo-spec-monorepo）…没有 main 字段…该目录像是 monorepo 根…含可加载入口的子包：…\packages\cli（name=repo-spec-cli）；…\core（name=repo-spec-core）；…\dsh-plugin（name=dsh-repo-spec）——请改装其中的 DSH 插件子包。修复二选一：①…② 补 "main": "dist/index.js" 或 "exports": { ".": "./dist/index.js" }…」；fix=「补入口字段或改装插件子包目录」（旧循环文案已清除） | 01-monorepo-root-precheck.png |
| 2 | 装 packages\dsh-plugin → 预检 | 预检结论=通过，可以安装（legacy 模式）；提示 legacy-mode 如实呈现（无契约 manifest，健康检查退化） | 02-real-plugin-precheck-pass.png |
| 3 | 确认安装 | 绿条「已installed：legacy/dsh-repo-spec」；卡片**免刷新**自动出现（SSE plugin-added；连接器未重建）；状态 active；legacy 徽标+契约 ^1.0+v0.2.0；停用/重载/卸载/健康详情/配置 五操作齐备 | 03-real-plugin-installed-card.png |
| 4 | 配置表单 | schemastery Config 的 refs 间接引用形态经 v2-api 解引用后 5 字段全渲染：specDir(text)/autoInject(bool)/autoOrganize(bool)/lockTimeout(number)/claudeCompat(bool)（解引用修复前整块空白） | 04b-config-form-deref.png |
| 5 | 配置保存 | 三字段编辑（specDir=.dsh-spec、autoInject=true、lockTimeout=6000）→「已config-changed：legacy/dsh-repo-spec」审计 toast（SSE 实时）；服务端快照核验 config=`{"specDir":".dsh-spec","autoInject":true,"lockTimeout":6000}` 全部落库 | 06-config-saved-fixed.png |
| 6 | 停用 confirm 流 | confirm 文案「确认停用 legacy/dsh-repo-spec？」可见；执行按钮未勾选 disabled=false 不可点 → 勾选后可点；执行后「已disabled」toast + 状态徽标 disabled + 按钮切「启用」 | 07-stop-confirm-flow.png |
| 7 | 启用 + 健康详情 | 「已enabled」toast + 状态回 active；健康详情=当前状态：未知/无发现/历史：—（legacy 无自定义健康检查、requires 为空，如实呈现不虚报） | 08-enabled-health.png |
| 8 | SSE 实时 | 全程顶部「实时 SSE」徽标；安装出卡/状态变化/审计 toast 均经事件流推送，页面零刷新 | 各图顶部 |

## 三、闭环期间发现并修复的缺陷（均为 G1/G3 真实回归，已带测试锁死）

1. **loader 入口解析窄于宿主约定**（dd6727f）：补 package.json exports['.']（字符串/对象 default/node）。
2. **来源类报错循环文案**（dd6727f + 0a35d63）：registry.loadFailureReport 与 doctor.precheck 统一
   改用 sourceFixAdvice（registry 新导出）——五类来源错误给可执行 fix.summary/steps，
   entry-not-found 报错写清「找到什么/缺什么/monorepo 子包候选/补哪个字段带示例」。
3. **schemastery refs 形态未解引用**（0a35d63）：v2-api schemaToJSON 将 {uid,refs} 间接引用展开为
   内联定义，否则配置表单整块空白；panel-v2 新增解引用测试。
4. **客户端配置保存漏 confirm**（0a35d63）：归一面板卡片「保存配置」按钮 /config 请求缺
   `confirm: 插件id`，一律 400 confirm-missing（P6 潜伏 bug，既有测试只覆盖服务端与渲染）；
   panel-unified 新增 config 保存 E2E。
5. **配置表单多字段编辑互相覆盖**（d83663e）：表单渲染基准从 p.config 改为 p.config+draft 合并值；
   panel-unified 新增多字段累积回归测试。

## 四、门禁状态

- node --test 175/0（基线 165 + T0 loader 7 + panel-v2 解引用 1 + panel-unified config 保存 E2E 1 +
  多字段累积 1）；build×3 + pluggable-lint + no-subplugin-import-check + typecheck×3 全绿（三次全量复跑）。
- 单标签页断言（registrations==1）原样通过，P6 面板纪律未被破坏。

---

## 引用勘误（守卫登记 · EXE-BOOT-014 追加）

> **本节是追加件：上文一行未改。** 依 EXE-BOOT-014 裁② 口径，文档引用守卫（`toolkit:scripts/doc-ref-guard.mjs`）
> 自本批起把存档件的存在性 / #符号 / 跨仓缺前缀失败与活文档同价判红；存档件是历史证词，改写即篡改证词，
> 故清偿走这里——逐条登记「原文里的引用形态 ⇒ 为什么判红、真位在哪、属哪一类」。行号形态按裁① 继续容忍，不在本表内。
> 条目里的 token 用 ASCII 双引号写出＝守卫规则 ⑤「声明原文不是文档引用」的既裁语境，本表自身不产生新引用。

- "API/connector.js" —（原引 8 行，共 1 处）把「API 面的 "connector.js"」写成了一段路径；实指引擎 HTTP 面下发件（见本文同段的 /v2/connector.js 说明），非仓内文件指针。
- "main/exports/index.js" —（原引 15 行，共 1 处）把「main / exports 两个入口顺位」写成了路径；属顺位枚举记法，不是文件指针。

> 计数自证：本文件登记 2 个 distinct 引用形态，覆盖守卫本批红集中属于本文件的 2 条。
