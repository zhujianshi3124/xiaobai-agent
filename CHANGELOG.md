# Changelog

本文件记录 @local/dsh-toolkit 的对外可见变更。格式遵循 Keep a Changelog；
版本号 semver。工具箱泛化改造的阶段产出按 P0–P8 记录（规格见判定台账，阶段号
P6 起重排：原 P7 收尾顺延为 P8；现状与裁决见 `docs/p0-recon.md`）。

## [Unreleased]

### Pack G（2026-09-21，真实 dsh-web-all 宿主冒烟 · 用户批准重启）

F 三项收口后按授权重启真实宿主验证新版本生效。九项清单 **八项 PASS、一项未验**，
证据正本 `panel/docs/evidence/G-REAL-HOST-SMOKE.md`（**未用 `p23-shadow-scan` 生成**，它会覆写
历史证据，D-2 在案）。三轮重启均走既有权威脚本 `scripts/restart-trigger.ps1`
（19s / 17s / 18s 回端口），改造前基线与卸出态复测都留了读数。

- **①②③④⑤⑥⑦⑧ 全过**：面板路由可达；p1-smoke 声明的 32 条路由逐条符合期望（其中 7 条读路由
  全 200，其余按设计 405/404/400——"全部 200"的字面口径已如实改写）；5 个内置子插件全部 mounted；
  SSE 在同进程真实写入序列里推全 `plugin-added / status-changed / audit:*` 事件、心跳实测 15s 一帧、
  关闭后轮询端点仍 200；面板卸出后 8 条抽样全部 401 且新进程只有一个监听端口；
  `ctx['toolkit/doctor']` 由**宿主进程内探针**证得可取可干活（`inspect()` 真跑出 healthy），
  顺带把 D-6 升级为宿主现场实测（`ctx['toString']` 有值 vs `ctx.get('toString',false)` 缺席）；
  F3 的 lastError 抽查在宿主里走完"失败 → 恢复 → `lastError:null`"且 `audit.jsonl` 保留全程；
  fiber 编号守卫换宿主那份 cordis 4.0.2 重跑，六值与 `FIBER_*` 全对。
- **F2 的宿主侧结论**：负路径真机验证通过——经安装 API 提交 `lib/agent-memory` 目录路径，
  得到情形 A 的结构化可执行报错（`plugin-shape-invalid` + 点名同表 `./plugin`），且 live registry
  不被污染；宿主侧 agent-memory 本就按显式子路径挂载（patch 第 74 行），不受三级解析改动影响。
- **⑨ 已验（13:48 补验收口，D-4 关闭）**：宿主会话内一次真实联网搜索由用户亲自完成，取数得
  **7 次 `web_search` 调用、7 次 `isError=false`、合计 47 条来源链接**（单条 3.4–10.5s），
  三重归因证明走的就是 web-search-local（search-router 在 `mode:auto` 下把这批 provider 判给
  `local-multi` + 该插件 `index.js:1280-1291` 的输出指纹在会话正本命中 5 次 + 5/5 mounted）
  ⇒ **G1 九项全部闭环**。证据正本 `panel/docs/evidence/D4-WEB-SEARCH-HOST-EVIDENCE.md`；
  G 文件以文末《补验注记》收口（只增不改，"未验"原文保留为过程痕迹）。
  前两轮报"零命中"经复核是**取证脚本自身口径缺陷**（宿主里 `web_search` 在 `run_code` 内经
  `tool/ptc-dispatch` 派发，只按 `tool/call` 取名会漏；zstd 会话正本须逐帧解压），
  纠错过程写入该证据 §三——不把脚本缺陷当成"搜索未发生"。
- **两条如实边界写进证据正文，不当成已验**：卸出态"活动 SSE 流终止"是经**进程重启**达成的，
  不等于 Pack D 修的同进程 `fiber.dispose()` 那一格（其命门证据仍在
  `test/panel-sse-dispose.test.mjs`）；`LOADING=1` 与仓内守卫同口径，由枚举不变式覆盖、未单独实测。
- **新发现两笔（只登记不修）**：D-11 `toolkitRoot` 缺省按宿主进程 cwd 推导，导致状态与审计落点
  随启动方式漂移（本轮实测在 `C:\Windows\.registry` 与 `D:\dsh-plugins\.registry` 间跳过两次，
  后者作为本轮副作用已清除）；D-12 宿主装有 `cordis-plugin-loader@1.0.3`，B2 头注"无法对照宿主
  装载器"的前提已不再成立。
- **还原自证**：`cordis.patch.yml` 三轮后 sha256 与本轮开始前逐字节一致
  （`ce0b0b81…`，同 L-060 关账基准）；live registry 收尾 `plugins: []`；toolkit 与 doctor 两仓
  工作树均为空。
- **清单校正留痕**：`panel/docs/evidence/README.md` 里 G 文件那一行原本记的 size/sha 是该文件
  补交叉引用**之前**算的陈旧值，已纠正为入库值并在同一行保留旧值与原因（索引行可校正，
  证据正文仍守"只增不改"）。

### Pack F（2026-09-21，cordis 符合度复核三项待裁全部关闭）

上一轮登记在 `docs/debt.md` D 区的三项待裁（D-6 / D-7 / D-8）按用户任务书实施，三项各自
独立提交、每笔之后全量门禁绿。台账见 `docs/debt.md` A #17 / #18 / #19 与《D-7 追加》。

- **修复 F1（D-6）**：`hasService` 由直读 cordis 代理属性（`ctx[name]`）改为 `ctx.get(name, false)`。
  旧实现的误判来自代理 get 陷阱先走 `Reflect.has(target, prop)`（沿原型链），加上
  `isSpecialProperty` 把 `_` 前缀与 `prototype`/`then` 直接放行，于是
  `hasService('toString'/'constructor'/'valueOf'/'hasOwnProperty'/'__proto__')` 全为 true ——
  不是显示问题而是判定问题：precheck 的 `service-missing` 阻断与 doctor 的 `requires/services`
  规则会把这类名字当作"服务在场"，从而放过一个真缺依赖的插件。改法以 vendored 源码为准
  （`src/reflect.ts:233-243`：isolate 与 store 均为 `Object.create(null)`，未命中直接返回
  undefined 不抛错）。头注由"如实陈述直读"改写为"为什么不再直读"。提交 `b399623`。
- **修复 F2（D-7）**：装载器入口解析改为**三级正典顺序** —— ① `requirements.exports['.']`
  （正典；`{"$from":"package.json#exports"}` 按继承语义换成 package.json 的表）→ ② 顶层
  `exports['.']`（legacy 兼容位，命中必 warn；与正典并存时正典赢并点名被忽略的那一份）→
  ③ `package.json` 的 `exports['.']`/`main`（宿主 Node 约定，T0/G1 既有层）→ ④ `index.js`/
  `index.mjs` 目录惯例。**显式声明指向不存在的文件一律 `entry-not-found`，绝不静默回退**
  （回退就是拿惯例掩盖 manifest 与实现不同步；doctor 早已把"声明了就必须存在"当 error 判）。
  裁定依据是三处交叉验证：doctor 仓把 `exports` 定为 `requirements` 必填键且顶层 `exports`
  不在根字段白名单（⇒ 顶层才是非法位，上一轮"禁双读只读顶层"的裁定被本轮显式撤销）。
  5 个内置插件的 manifest 一字未改；告警随 `ResolvedPlugin.entryWarnings` 带出并经 registry
  的 A1 warn 通道落盘，来源随 `entrySource` 可观测。提交 `23de06a`。
  - **B1 验收改判（情形 A）**：`lib/agent-memory` 的正典声明 `"."` 指向 `./lib/index.js`
    （指令台账数据库，非插件形状），插件在同表 `"./plugin"`。全仓 8 条声明目标实测全部存在
    （0 缺失）⇒ 不属"声明指向不存在文件"的同步缺陷，故按目录装载产出**结构化可执行报错**
    （`plugin-shape-invalid` + 点名 `./plugin` 绝对路径）即终态设计行为；显式文件路径行为不变。
- **修复 F3（D-8）**：插件转 ACTIVE 即清空 `lastError`（连带其 `at` 时间字段），消除面板
  "运行中"+"最近错误"并存的误导。修在状态源唯一一处 `setStatus`，五条到 ACTIVE 的路径
  （install / autoload 恢复 / setEnabled / reload / 自动重试）全部经过它；面板 client 与
  `/v2/snapshot` 核查后确认**无独立缓存**（卡片整体来自服务端快照），故读取方零改动。
  历史不丢：失败当时已按 REQ-10 发 `audit:*` 并落 JSONL。autoload 恢复成功补一次 `persist`
  以守住"内存与磁盘同进退"。提交 `57ebc24`。
- **加固（测试）**：本轮新增 **25 条用例** —— F1 `test/host-has-service.test.mjs` 5 条、
  F2 `test/loader-entry-resolution.test.mjs` 14 条（含 4 套自带 DECOY 哨兵的
  `test/fixtures/registry/entry-*` 夹具）、F3 `test/registry-last-error.test.mjs` 6 条。
  当前 `node --test` 汇总 **263 条 / fail 0**：与"上轮 229 + 本轮 25 = 254"差 9 条，原因是 node 的
  测试文件发现机制会把 `test/` 下的夹具模块也当文件级用例计入，本轮新建夹具带进 9 个
  （F2 的 8 个入口文件 + F3 私有夹具 1 个）；这是仓内既有口径，非本轮引入的计数错误，如实记下。
  F3 之所以要用私有夹具：`node --test` 的测试文件之间并发跑，而 `contract-plugin/marker.flag`
  是跨文件共享的磁盘开关（复用会偶发翻红，已记 D-10）。
- **三项摘实现变异自检**：F1 摘回旧直读 ⇒ 仅"原型链钉子"一条精确翻红；F2 三发 —— 摘正典分支
  ⇒ 8 条翻红（4 内置 + `$from` 根 + 双声明 + 不回退红线 + 情形 A）、摘 legacy 分支 ⇒ 2 条、
  把"声明不存在即报错"改成"静默回退" ⇒ 1 条（红线用例）；F3 摘掉"转 ACTIVE 清空"整条分支
  ⇒ 4 条（enable／snapshot／autoload／reload 各钉一条），另两条按设计不翻红（重装换条目、
  防过度修复方向相反）。三次变异后均重建并 `sha256sum -c` 校验产物逐字节还原。
- **发现并登记（未顺手改）**：D-9 `retryAttempts` 装入成功后不清零（重试计数跨段结转，隔离
  提示里"连续失败 N 次"在这种情况下不准）；D-10 上述夹具共享开关的偶发翻红。C-1 必答设计题
  补第 2 条：doctor 要求 `requirements` 必含 `exports` 键，而本仓契约 v1 根本没有该字段，
  两边口径分叉须在 v1.1 归一。
- **过程留痕**：F2 执行期间出现过一次误触裁决（"停手只落文档"），仅在未提交文档层执行、
  零 commit、已丢弃；裁定链第 ③ 步记于 `docs/debt.md`《D-7 追加》。
- **环境注记**：`docs/debt.md` D 区前新增一节，把"Node 24/Windows 全量 `node --test` 批次里
  真 http+fetch 命中 libuv 断言 ⇒ 文件级红、子用例全绿"的分流方法与"直接驱动 route handler +
  response 桩"的正解从测试文件头注收进正文。
- **门禁与边界**：三笔提交每笔 `node scripts/ci-local.mjs --with-scan` 4/4；`p1-smoke` 断言
  一字未动（实跑 314/0）；doctor 独立仓零改动；`panel/` 未触及。

### cordis 符合度复核与修复（2026-09-21，Pack A–E，用户裁定"全修"）

对照本仓实际 vendored 的 `@deepseek-ai/cordis@4.0.2` 逐条核可插拔模式符合度，按 5 个 Pack 施工，
每 Pack 一次提交、每次全量门禁绿。台账见 `docs/debt.md` A #12–#16 / D-6/D-7/D-8 / C-1 补充。

- **修复（registry 核心）**：`install` 事务顺序改为「写内存 → 落盘 → 发通知」并给事件发射加兜底捕获
  —— 此前任一观察者抛错都会让 `install` reject，同时留下永久占住该 id 的内存幻影条目；回滚分支补
  `persist` 摘除，失败路径不再留磁盘孤儿记录。轮询补 `UNLOADING` 分支，"被卸载未收敛"不再误报为
  "装入超时"，四个终态错误码入契约公共枚举 `FIBER_LOAD_ERROR_CODES`。
- **修复（装载器）**：`normalizePlugin` 选中 `mod.default` 时不再丢弃模块级 `inject`/`name`
  —— 丢 `inject` 的真实代价是 cordis 依赖门控静默失效。采用"补缺、不盖已有"的保守合并，
  宿主装载器未安装故如实标注为近似。
- **修复（服务面）**：`${prefix}/doctor` 现在真的注册进 cordis 容器（此前面板装配路径绕过了它，
  文档承诺的服务查找不成立）；回收靠 cordis fiber 归属，零补偿 cleanup。doctor 独立仓源码未动。
- **修复（面板 HTTP 面）**：活动 SSE 连接纳入卸载链（`liveStreams` + `closeAllStreams`），
  每条流 teardown 单次幂等；面板拆时流被 `end()`、心跳 `setInterval` 回收。
- **加固（测试）**：`test/cordis-fiber-state.test.mjs` 用真 cordis 实测 FiberState 数值与 `FIBER_*`
  常量对账（R13 从此有显式回归守卫）；`test/cordis-inject-lifecycle.test.mjs` 补 cordis `inject`
  **正向**语义（此前只有负向一条）；Pack C/D 各自的服务面与卸载联动用例。
  本轮新增 32 条用例，分布在 6 个文件：cordis-fiber-state 7、registry.test 追加 7（A1 三条 + A2 四条）、
  loader-statics 4、toolkit-services 4、panel-sse-dispose 5、cordis-inject-lifecycle 5；
  当前 `node --test` 为 **229 条 / fail 0**。
- **收紧**：`peerDependencies."@deepseek-ai/cordis"` 由 `>=4.0.0-rc <5` 收为 `^4.0.2`，
  不再放行未经 fiber 行为校准的 4.0.0/4.0.1/更早 rc；已核与本仓 semver 引擎的预发版偏差
  （`docs/contract.md` §7 D-1）无冲突，并有守卫用例锁死。
- **未做（停下待裁，未静默降级）**：① `hasService` 直读 `ctx[name]` 经实测有原型链误判
  （`hasService('toString') === true`），改 `ctx.get(name, false)` 可闭合但属行为变更（D-6）；
  ② Pack B1 指定的"把 `exports` 提到顶层"与 doctor 仓根字段白名单、以及 C-1 把 legacy 字段
  收紧为 error 的既定方向双重硬冲突，第三种绕法被明令禁止，故整项停手（D-7）；
  ③ 装入成功后 `lastError` 不清导致"运行中 + 历史错误"并存，不在授权清单内（D-8）。
- **文档同步**：`docs/embed-toolkit.md` §3 服务注册现场、§6 进程内"卸干净"判据；
  `docs/add-sub-plugin.md` 入口 `exports` 位置的 loader 实况与未裁定项。

### 关闭（P8 终版验收通过，2026-09-20）

- **DSH-TOOLKIT-PLUG-001 泛化改造线（P0–P8）项目关闭**。终版 DoD 自查与证据：
  `panel/docs/evidence/P7-MOCK-BUCKET-LOOP.md`（mock 桶真浏览器 8 步闭环 + tk2 前缀整轮）、
  `panel/docs/evidence/P7-REAL-HOST-SMOKE.md`（真实 dsh-web-all 宿主三轮重启冒烟）、
  `panel/docs/evidence/T0-REAL-PLUGIN-LOOP.md`（真实插件兼容性闭环）。
  终版门禁：`node --test` 194/0 + build×3 + pluggable-lint + no-subplugin-import-check（6 文件 0 命中）
  + typecheck×3 + 回归全跑 14 项全绿（p1-smoke 314/0 一条断言未改）+ p23-verify 107/0 +
  doctor 真实仓 dry-run 0/0/0 + `node scripts/ci-local.mjs --with-scan` 4/4。
- **债务清单按用户裁定改为四类归档**（不再要求"全部清零"）：A 已清偿 / B 显式遗留 / C 后续任务 /
  D 待办，逐条标注裁定方 —— 见 `docs/debt.md`。四项工程侧裁定入账：双实例共享确认池**不修**（B-1，
  附触发条件）；审计事件命名**并入契约 v1.1**（B 区 11b → C-1）；**契约 v1.1 立项**且规格草案全文
  存 `docs/debt.md` C-1（`provides` + audit 入枚举 + `KNOWN_LEGACY_FIELDS` 收紧 + 5 内置插件补
  provides + 两仓同批 + 次版本发布含迁移说明）；**审计浏览 UI 不做**、记待办（D-1，数据已落盘、
  `auditFile` 路径可查）。CI 维持现状：本地一条命令门禁即为事实 CI，workflow 待有远端自然生效（B-2）。
- **如实登记一项未闭环的人工验证**：冒烟清单最后一项"宿主会话内一次真实联网搜索"**待用户本人补验**
  （D-4）。本侧已验到：宿主重启后 web-search-local 为 mounted、真实公网探针 `runSearch()` 12 源/1.2s、
  `fetchUrl()` 200/45795 字节；未验的是真实 agent 调用链里的那一次搜索——它需要用户的登录会话
  （宿主 `/api/web/search` 对未认证请求返回 401，本侧不取用用户凭据）。
- 待办另记三项：`p23-shadow-scan` 覆写历史证据文件（D-2）、`regression-all` 清单缺 p23 两项（D-3）、
  cordis 升级必重跑 S1/S4 的 R13 长期盯防（D-5）。
- **长期协作原则修正（用户 2026-09-20，长期有效）**：用户只验收结果——原有功能在、无 bug、
  不影响正常使用；实现方法与过程取舍由工程侧自行判断并记录在案。仅"面板作为本桶唯一管理入口"
  为用户明确要求，继续有效（单 tab 断言 `registrations==1` 继续锁死）。

### Added（P7 嵌入，2026-09-20，REQ-8 / G4 双向兼容）

- **包级根入口 `index.js` + `exports["."]`**：`@local/dsh-toolkit` 现在是一个可被任何
  dsh 宿主当**普通插件**装载的模块（`name=dsh-toolkit` / `inject=["webServer"]` /
  `apply`）。根入口只做两件事：导出自身 manifest、把工作交给面板装配点
  （`panel/index.js` 一直是 registry/doctor 的现场，根入口不复制逻辑）。
  同时补 `exports["./panel"]`（R12：面板行可由 `file://` 绝对路径迁到包子路径）。
- **根 `dsh.plugin.json` 契约化自描述**：`id=dsh/toolkit`、`displayName`、`version`、
  `contract: "^1.0"`、`requires`（node `>=22` / dshRuntime / **services: ["webServer"]**
  ——面板对宿主 webServer 的依赖如实声明，宿主 doctor 预检因此形成自描述闭环）、
  `configSchema`（纯定义 JSON、零默认，覆盖 `apply()` 真正读取的 servicePrefix/toolkitRoot/
  doctorCli/devicesFile/backupRoot/doctorConfigRoot/registry.*/doctor.*）、
  `panels`（**归一后的单一面板**：slot `settings.plugins.tab`、id `toolkit-panel`、order 90）。
  旧字段（manifestVersion/name/aliases/requirements/requiredAliases）按 REQ-9 作为 info 级容忍保留。
- **新裁定：规格 configSchema 的 `plugins` 段不实现也不声明**。boot 权威是 patch 行、运行时
  权威是 registry state 文件（`<toolkitRoot>/.registry/state.json`）；再开一个 config 里的
  插件种子段就是第三个事实源（R2 明令避免）。`p7-embed` 测试反向锁死"configSchema 必须
  覆盖 apply() 真正读取的键"，将来加键不写 schema 会被测试抓住。
- **面板 HTTP 路由前缀化**（D5 无根假设）：`contract` 新增 `contractHttpBase(prefix)` /
  `normalizeServicePrefix(prefix)` / `DEFAULT_SERVICE_PREFIX`；`/api/toolkit-panel/*` 全部
  23 条 P2.4 路由、9 条 v2 管理路由、`/v2/connector.js`、兜底页 `panel.html` 的页内基址
  改为从 `config.servicePrefix` 派生。缺省前缀 `toolkit` 下逐字节等于历史值——
  **对外 URL 零变化**（p1-smoke 32 条路由断言原样通过，未改一条）。
- **doctor CLI 路径可注入**：新增 `TOOLKIT_PANEL_DOCTOR_CLI` 环境变量兜底（与既有
  devicesFile/backupRoot/doctorConfigRoot 同款），缺省值仍是本机开发布局现值。
- **`no-subplugin-import-check` 扫描面加入根入口**：`index.js` 与面板同纪律，
  不得点名任何子插件（自适应管理的前提），现扫 6 文件 0 命中。
- 新增 `test/p7-embed.test.mjs` 14 例：基址派生与三处孪生一致 / 缺省 URL 不变 /
  双实例（`toolkit` + `tk2`）同挂一根 webServer 路由零冲突 / 双实例真 HTTP 两面板同时可达且
  A 装的插件不进 B / B 的 SSE 收不到 A 的事件（前缀链路端到端）/ mock 桶装入→卸出
  （路由全部注销 + 订阅全部解除 + 活动句柄不增一个，doctor 巡检定时器在场下测）/
  guard 用被注入的 webServer 且写路由 fail-closed / 根 manifest 过契约校验且与盘上同源 /
  包导出面按 Node 约定可解析 `.` 与 `./panel`（R12 前提）且 loader 解析到同一根入口。
- **Q2 裁决追加项已兑现：真实 dsh-web-all 宿主冒烟**（用户 2026-09-20 当场授权重启）——
  零宿主改造、`~/.dsh` 全程未读写，唯一被改文件是本仓 `cordis.patch.yml`（还原后 sha 逐字节一致）。
  三轮重启（挂载/卸载/还原）跑完清单三项：web-search-local 运行时回归清偿（P5 遗留）、
  面板在宿主进程内可达且 SSE 拿到 hello 帧、卸载后抽样路由 200→401 且仅剩宿主自有监听。
  证据 `panel/docs/evidence/P7-REAL-HOST-SMOKE.md`（含"本侧明确没做的事"边界清单）。

### Added（P8 收尾，2026-09-20，债务 #4/#5/#6/#7 清偿）

- **四份正本文档落盘**（债务 #6/#7）：`docs/contract.md`（契约全文 + 与规格的 6 处偏差集中登记，
  含 semver 预发版偏差 D-1、TS 范围豁免 D-2、R13 fiber 依赖 D-5）、`docs/add-sub-plugin.md`
  （加插件=零面板代码改动，含"提供面"缺口警示）、`docs/migration.md`（三层配置权威与生效时机、
  旧字段收紧的三个前置条件、compact-router 预设特例、doctor 两张脸分工）、
  `docs/embed-toolkit.md`（装载面/config 全键表/前缀化三张表/guard 前提/**六条边界如实陈述**）。
- **审计持久化**（债务 #4 的持久化半边）：新增 `panel/manager/audit-sink.mjs`——订阅本实例
  `audit:*` 七类事件，按行追加 `<状态文件同目录>/audit.jsonl`（2 MiB 单档轮转；
  `registry.auditLog:false` 关闭、`registry.auditFile` 改路径）。**白名单字段**
  `at/event/pluginId/durationMs/errorCode?`，配置内容与环境变量值一律不落盘（REQ-10 禁泄口径）；
  落点经 `/v2/snapshot` 的 `auditFile` 字段可发现。测试 `test/audit-sink.test.mjs` 4 例
  （含"卸出后不再写""双实例各写各的文件""审计行只允许白名单键"）。
  根 manifest 的 `configSchema.registry` 同步补 `auditLog`/`auditFile` 两键。
- **一条命令的本机 CI 门禁**（债务 #5）：`scripts/ci-local.mjs` = `npm test` 全链 + 回归全跑 14 项 +
  **真实仓 doctor dry-run 的数字判定**（CLI 退出码 0 只代表跑完，必须 e/w/i 全 0 才算过）；
  `--with-scan` 追加 `p23-verify`（`regression-all` 清单原本不含它）。
- `.github/workflows/ci.yml` 结构就位，**但从未在本环境执行**：本仓无 git 远端，且依赖
  `@deepseek-ai/*` 私有源，公共 runner 上 `npm ci` 装不出来——需自带私有源凭据的 self-hosted
  runner。该结论写进 workflow 头注，不假装 CI 已绿。

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
