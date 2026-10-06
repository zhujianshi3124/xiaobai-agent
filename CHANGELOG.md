# Changelog

本文件记录 xiaobai-agent 的对外可见变更。格式遵循 Keep a Changelog；
版本号 semver。工具箱泛化改造的阶段产出按 P0–P8 记录（规格见判定台账，阶段号
P6 起重排：原 P7 收尾顺延为 P8；现状与裁决见 `docs/p0-recon.md`）。

## [Unreleased]

### 成员 manifest 版本对齐：lib 四卡与 panel/package.json 1.0.0 → 1.3.0（EXE-BOOT-047）

- 046 遗留的同族口径候裁在本批收口：四张子插件卡（`lib/agent-memory`、
  `lib/compact-router`、`lib/rate-throttle`、`lib/search-router`）的
  `dsh.plugin.json` `version` 与 `panel/package.json` 的 `version` 由 1.0.0
  对齐 1.3.0。五份带契约清单的 `version` 是契约必填字段且由面板插件卡片
  徽章直出（v2 API entryView），此前用户可见"v1.0.0"与包版本 1.3.0 漂移；
  实勘确认零兼容决策依赖（契约兼容走 `contract: "^1.0"`、宿主兼容走
  `requires.dshRuntime`），按"一个版本号管全部"口径随桶，并加版本钉断言
  （五份清单＋panel/package.json 的 version 须等于包版本）。
- **046 注记订正**：046 曾记"panel 的 dsh.plugin.json 版本为 1.0.0"——实勘
  为误记，`panel/dsh.plugin.json` 本就**没有** `version` 字段（其
  `manifestVersion: 1` 是新格式标记非 semver；panel 无契约面、亦非 registry
  entry，不进徽章读取面），本批不动该文件、不外加字段；046 所见 1.0.0 实为
  `panel/package.json` 的版本。

### suite manifest 版本对齐：dsh.plugin.json 1.0.0 → 1.3.0（EXE-BOOT-046）

- 根 `dsh.plugin.json`（套件自描述，id `dsh/toolkit`）的 `version` 此前停在
  1.0.0，而包版本自 1.3.0 起发布——面板插件卡片徽章直出该 manifest 的
  `version`，用户可见"v1.0.0"与包/CHANGELOG 的 1.3.0 漂移。实勘确认该字段
  零兼容决策依赖（契约兼容走 `contract: "^1.0"`、宿主兼容走
  `requires.dshRuntime`），按"一个版本号管全部"口径对齐 1.3.0，并加
  版本钉断言（manifest version 须等于包版本）。
- 四张子插件卡（lib/*）与 panel 的 manifest 版本仍为 1.0.0，同族口径候裁
  另批处理（本批授权面仅 suite manifest）。

### bundle 通道上线：xiaobai-agent 可经 0.2.0 profile bundles 挂载（debt-039-a 施工，2026-10-05，EXE-BOOT-045）

- **dsh.bundle 声明**：package.json 新增 `dsh.bundle.patch`（指向新增的零占位符
  `bundle.patch.yml`）＋`dsh.engines.dsh >=0.2.0-rc.2`＋`dsh.client`（platform web）。
  0.2.0 装载器此前对 bundles 列表内无 `dsh.bundle` 声明的包硬 throw→skippedBundles
  （debt-039-a 挂账成因），现可整包入 bundles 列表随 profile 启动装载。
- **零占位符 bundle patch**：新增 `bundle.patch.yml`——web 行 searchProvider 绑定
  auto-search＋web-search-deepseek 启用＋rate-throttle／web-search-router／
  agent-memory-runtime／toolkit-manager 四条 insert。模板里两处部署期机器路径在此改走
  缺省语义：agent-memory dataRoot 缺席＝插件缺省 `<主目录>/.agent-memory`；面板行走
  包名＋子路径导出（`xiaobai-agent/panel`，与 web-all 家族行同款，零绝对路径）。
  部署期想自定数据根／面板入口仍走 `cordis.patch.yml` 模板填空通道（形态不变）。
- **沙箱实测**（EXE-BOOT-045，0.2.0-rc.2 真装载器）：装载零 skippedBundles 警告；
  dump-config 六针全中（四 insert 行＋面板行＋searchProvider 绑定全部生效）；面板 v2
  API 200（`ok:true`＋registry durability ok＋`doctorAvailable:true`）；卸载复原后
  dump-config 五针归零、零警告；真实侧零写入。

## [1.3.0] - 2026-10-05

### 外部克隆门禁自包含修复＋署名补齐（2026-10-03，C1-007 收尾批）

- **外部克隆用户门禁自包含**：`ci-local` 链中依赖运行期目录（`.panel-backups`／`.panel-custody`／
  `.registry` 等，按 .gitignore 声明不入库）的检查格——`scripts/p22b-retention-scope.mjs`、
  `scripts/q2-layer-scan.mjs`、doctor selftest stage3 影子段、`scripts/doc-ref-guard.mjs`——
  在目录缺席环境（新克隆）由崩溃／判红改为**显式 SKIP＋原因注记**（缺席明示、不静默）；
  本机（目录在场）行为不变。外部克隆用户 `node scripts/ci-local.mjs --with-scan` 现可全绿。
- **署名**：package.json 补 `author`（与 LICENSE 版权行一致）。
- 模型配置事件（用户提供方列表消失）结案：成因＝宿主/安装器自迁移，key 与配置分文未失，
  经家根补丁单笔恢复并经用户验证；账面详见 `docs/repair-plan-20260923.md` §61。

### doctor CLI 去机器硬编码＋YAML 检查缺席明示化（2026-10-02，C1-007 阶段二·副本线；用户终批"按建议"）

- **YAML 解析器三级装载**：`DSH_DOCTOR_YAML_URL` env 显式指定 → 运行环境 `yaml` 包惰性探测
  （可选增强，零 npm 依赖自包含不变）→ 都缺席＝`report.yamlCheck: {available:false, reason}`
  **显著明示＋CLI stderr 注记**（`⚠ YAML 语法检查未执行: …`）——检查没跑必须看得见，绝不静默；
  作者机器绝对路径缺省清零。缺席属体检器能力面，归 report 面不产 issue（不污染被检仓干净度读数）。
- **缺省 scope＝cwd 形**：`dsh-doctor` 无 `--scope`／env 时体检当前工作目录（`cd 仓根 && dsh-doctor`），
  零机器路径。
- doctor 成员（API 库＋CLI＋selftest）全树零机器用户路径（负向钉在案）。

### 发布后安全审计：全历史密钥扫描＋patch 模板 PII 清理（2026-10-02，C1-007 阶段二·副本线；用户批准"查"）

- **全历史密钥扫描（纯读）**：312 commits／1828 blob 逐件扫描——**明确凭据形态（GitHub/npm/AWS/
  OpenAI 形 key、私钥块等强模式）零命中**，两枚发布用令牌从未进入任何历史对象；弱模式 292 条
  逐类判读全良性（fetch 标准选项／测试夹具假值／lock 完整性串等）。
- **patch 模板静态组示例化**：rate-throttle 静态组由真实账号编排改为**示例组**
  （`example-provider-*`／`example-model-*`；部署时换成你自己的账号与模型）——基准滚存
  `534e22e3…`/3336B → **`60484b76…`/3265B**（第 9 次＝副本线第 5 次，行数不变、守卫未放宽）。
- **成员 README 路径通用化**：agent-memory 部署行 dataRoot 改占位符形（缺省 `~/.agent-memory`）；
  rate-throttle《部署实况》节改《部署示例配置》口径。
- 其余真实路径出现面（工装脚本／测试候选路径／历史账面）如实盘点在案
  （`docs/repair-plan-20260923.md` §59），历史值按"账目透明"保留不回改。

### README 定位补笔：快速上手＋定位精化＋适用边界（2026-10-02，C1-007 阶段二·副本线；用户审阅意见六条原样照录为纲）

- **桶 README 新增两节**：**快速上手**（三步——找提供免费 API 的厂商拿 key → 在 DSH 自带的
  模型配置页面配好 → 照常对话即可，插件桶后台自动换路/冷却/压缩/记账）＋**适用边界（如实说）**
  （适合轻量小微任务与新手尝鲜；不适合老手与批量化大任务；免费 API 的 TPM/RPM 缓解效果
  取决于 key 数量，过少作用有限）。
- **定位句精化**：帮助新手小白用更低的成本体验 vibe coding——降低疑虑与"舍不得"；面向
  免费 API 优化。
- **rate-throttle README** 首段补一句同口径实话：换源与冷却的实际效果取决于配置的账号（key）
  数量——账号过少时作用有限。
- **终批补句（用户终批原文照录）**：桶 README 定位句后补 **"本项目全部任务均由 AI 完成。"**
  （补后免再审批，发布令生效）。
- 其余四份成员 README 未动（用户审阅无意见）。

### 定名批：包名 dsh-toolkit → xiaobai-agent（2026-10-02，C1-007 阶段二·副本线；用户终裁名随批落码）

- **包名定名**：`dsh-toolkit` → **`xiaobai-agent`**（npm 名双通道核查可用后落笔）。**版本仍为
  1.0.0 无跳变**（发布前定名，对外首版即 xiaobai-agent 1.0.0）；六成员名与 bin（`dsh-doctor` 等）、
  manifest 内部 id（`dsh/toolkit`）、LICENSE（MIT·zhujianshi3124）、协议语义全部不变。
- **同步面**：package.json/package-lock、六份 manifest name 面（宿主旧插件别名键不动、别名值随
  新名）、doctor-signals、patch 模板三处 insert name（基准滚存 `5c4e6980…`/3328B →
  `534e22e3…`/3336B，副本线第 4 次，占位符模板机制与守卫未放宽）、根入口 name、面板 id 与
  标题文案、TS/测试自引用 import 面、工装断言面；历史账面（本文件历史条目／debt／plan／
  evidence／存档件）按"错账不回改"保留旧名。
- **README 首段定位文案**（用户定位原文要义）：为新手小白提供更低成本的 agent 体验——面向
  免费 API 优化，适合轻量任务。

### S4 检索半边：本机记忆检索上线（2026-10-01，C1-007 阶段二·副本线；批1-3／裁1-3 用户终批照施工）

- **agent-memory 新增检索索引（`4706eca`）**：`searchMemory(root,{q,limit,workspace?})` 库导出——
  全部会话（含已归档/已移交）台账/进度/档案的大小写不敏感子串检索，「一般输入」栏在范围内；
  派生缓存落 `<dataRoot>/search/`（MANIFEST＋逐会话段，可整目录删除自愈、超限 >16MB 或
  >2×正本整弃重建）；**三正本文件零改动＝硬红线**（测试逐字节钉）；更新＝写后挂钩 best-effort
  ＋读时漂移自愈，无启动钩子；`checkpoint-evidence.jsonl` 与 `logs/` 不入索引。
- **面板新增「记忆检索」独立卡（`9cb4b58`）**：`GET /v2/memory/search`（只读闸，路由全表
  32→33）——结果只在本机显示，不外传（零 fetch 零遥测）；agent-memory 不在位/数据根不可读
  一律降级说明、不 5xx；**卡底固定句"检索帮你找，接手新会话仍需走移交确认"**——检索是增强，
  绝不自动注入新会话、不自动选候选（移交制维持）。
- **F-37 承诺翻正（批3）**：功能清单 ★172"面板文案超出实现（无检索）"→ **已兑现**——R1 记下
  ＋R6 注入要点＋检索找得到，三件凑齐；跨会话接手仍走移交确认（原文照录不回改，翻正走
  `docs/feature-inventory-20260923.md`《F-37 现状更新》随批注）。
- **自包含补全（`1a2d76d`）**：`terminal-acceptance-report.mjs` 死代码段的在用 doctor 绝对路径
  硬调切换为桶内成员（历史冻结闸原样，脚本仍永不执行）。

### 契约 v1.2（S3 批）：provides 三面扩槽＋清单迁移＋旧字段按契约面分层收紧（2026-10-01，C1-007 阶段二·副本线；甲案/甲'用户终批照施工）

- **provides 三面扩槽（`39868ad`）**：`provides` 新增 `entry`（单值非空字符串＝入口模块路径，装载器
  **⓪ 级新正典**）与 `inject`、`tools`（名单槽，与三旧槽同族校验）；装载器对六槽逐槽 provides 优先、
  legacy 回落。`tools` 槽只承载声明，装配语义归宿主（边界随行在册）。
- **内置清单迁移（`72b1b00`，甲案口径）**：六份清单只迁"有替代表达"的面——`manifestVersion` 撤除、
  可迁提供面单源化进 `provides`（legacy 侧留空骨架）；无契约替代表达的面**原样保留**并逐名进
  `docs/debt.md` C-4 明账（events 订阅面／别名面／可选依赖面／依赖包面／`name`／exports 子路径面／
  `$from` 继承面）。panel 清单整份不动（D-15 闸判据面保全，已追认）。
- **旧字段分层收紧（`68e7a68`，甲'终裁）**：契约版本常量 **1.1.0 → 1.2.0**。判定形＝**只管双写**——
  清单带契约面（非空 `contract`）再声明 `manifestVersion`／顶层 `registers`／顶层 `exports` 即判
  **error**；纯宿主原生形态（无契约面）维持**容忍＋提醒**，装载器 legacy 兼容位与 A1 提醒通道原样保留。
  **对外承诺：契约面必纯；宿主原生形态照样能装（带提醒）。**本仓六份生产清单在收紧下零 ok 翻面
  （双写已随迁移笔清空）；无替代面维持 info 并带 C-4 明账发布（不宣称"legacy 已清零"）。
- **行为修复（随迁移笔）**：桶内 doctor 两处只读 legacy 的提供面读点改走同源优先级（消除假警告与
  集体静默漏检）；面板 snapshot 提供面取数同源化；对账网 parity 扩至 56 格（含双写/原生容忍两新格）。

### 开源 S2 包化正名批：包名/版本/LICENSE/files/依赖形态落地（2026-10-01，C1-007 阶段二·副本线；G4/G5/G6/G8 用户终批照施工）

- **包名/版本**：`@local/dsh-toolkit` → **`dsh-toolkit`**，版本自 **1.0.0** 起（对外首版），`private` 撤除。
  manifest id `dsh/toolkit` 不变；宿主旧插件别名键（`@local/dsh-compact-router` 等）不变，别名值随新包名。
- **LICENSE**：新增 MIT 正本，版权行 `Copyright (c) 2026 zhujianshi3124`。
- **发布物（files）**：白名单收窄——`scripts/`、`test/`、`cordis.patch.yml` 不随包发布；`README.md`/`CHANGELOG.md`/`LICENSE` 随包；`panel/docs`（工程内账）排除。npm pack 实证 121 文件/385.2 kB。
- **依赖**：`@deepseek-ai/cordis` 自 peerDependencies 转正常 dependency（仓内 vendor 面 364 文件撤除，全量经公共 registry 解析，lock 全 resolved）；`dsh-*` 维持 peerDependencies（宿主运行时注入面）。历史「私有源」陈述废止（`npm ci` 可复装实证）。
- **仓内**：链外历史工装 p23-shadow-scan 删除（E-3 处置）；文档引用勘误登记覆盖 87→91。
- **doctor CLI 并桶（S2.5）**：独立文件面体检器作为桶成员随包分发——`bin: dsh-doctor`、
  `exports: ./doctor/cli`、`doctor/cli/src/` 四件零依赖自包含（整体抠出即可单独运行）、成员
  `doctor/README.md`；`doctor-signals.json` 随包（engine 事实驱动协议）。doctor 成员无独立版本号，
  随桶 1.0.0。
- **部署补丁模板化（S2.e 案②）**：`cordis.patch.yml` 两处机器绝对路径改为占位符
  （`<AGENT_MEMORY_DATA_ROOT>`／`<PANEL_ENTRY_URL>`），部署时填空——发布语义＝模板即源。
- **行为修复**：registry 通道对面板目录的装载拒绝改为显式判据（D-15 显式闸）——面板是装配现场
  （REQ-8），不经 registry 通道装载；契约形态的面板类插件不受影响。

- **行为注记**：包名去 scope 后 panel 入口的 legacy 合成 id 变合法，registry 通道对面板目录由拒绝改为放行（legacy 形态）——「面板不经 registry 通道自举」防呆的显式重建候裁中（repair-plan §46.3）。
### 开源 S1 剔除批：web-search-local 出包＋search-router 降"可缺席 provider 位"（2026-09-30，C1-007 阶段二·副本线；G1/G2(b)/G3 用户终批"按建议"）

- **剔除 MIT 外来件 web-search-local**（两阶段目标第二步）：`lib/web-search-local/` 三文件出包，F-91 耦合面
  八点全清（exports 映射／桶 aliases／patch 两处／search-router 硬编码／panel 四 manager／doctor-signals／
  面板文案／测试随剔）。**对外行为面**：本套件不再内置本地搜索——`local-multi`/`local-fetch` 两 provider
  不再存在，官方搜索不受影响。
- **search-router 保留为路由骨架（G2(b)）**：本地半边降为**可缺席 provider 位**（`DELEGATE_LOCAL` 位保留）；
  选中本地而位空时**显式回落官方搜索**并警示「本地搜索未配置」（G3，绝不静默）；任何注册 `local-multi` 的
  搜索插件可插位。
- **面板四卡**（原五卡）：web-search-local 卡与 dependency-broken 联动面随出包退役（providerDependencies
  清空）；登记表四卡；真卸载/重装/挂载全链矩阵对 search-router 复用（B1 改双真卸载同批、C2/C3 改单真）。
- **patch 基准滚存（副本线第 1 次）**：`b0f304c9…`/3190B → `693cfcd7…`/3084B；p24 两处硬闸期望值同步，
  守卫机制未放宽。
- 新钉三枚：registry 四卡负向钉＋出包面词面清零钉（`test/s1-removal-pins.test.mjs`）、G3 缺席回落行为钉
  （`test/search-router.test.mjs`）。
- 门禁步数仍 6（默认链 5）；`node --test` 新基线 468（原 484，随测试面退役 −16）；p1-smoke 309（−5）、
  p22-cards-ui 147（−18）、p24-ui-matrix 608（−112）、p24-verify 62（+1 新格）——退役格与改造口径全录
  `docs/repair-plan-20260923.md` §44 与 `docs/debt.md` A#59。

### 第一阶段（本地自用版）五环终验通过、正式收官（2026-09-30，EXE-BOOT-018；纯文档账面批，运行时行为零变化）

- **五环（装/用/配/管/检）全流程真机终验通过**：机器半 M1–M8 全 8 项绿（面板 API 通达；演练插件
  registry 通道装-用-管-卸全流程；`~/.dsh` 扫描面三时点 hash 逐字节同；热配置即改即显；agent-memory/
  rate-throttle 活体；门禁与全套读数零漂移；健康详情折叠 bundle 级三步钉）＋用户半三问全"是"
  （五卡在位／健康详情折叠收起等 5 秒不弹回／体检 0 issue）。
- **演练插件 `drill/probe`（纯契约最小形）经面板 v2 安装向导真机走通**装入→待验→卸载全链，
  清场三判据全过（`.registry/state.json` 逐字节回装前／`~/.dsh` hash 逐字节同／doctor 0/0/0）。
- **W2 期顺延的"健康详情折叠"真机亲验项就此闭账**（用户亲验＋bundle 级钉双证）。
- 用户目标"5 插件 patch 直挂不动、五环全流程跑通＝文档承诺全实现＋自动化验证"就此达成；
  开源阶段（v1.3 挂账清单＝`docs/debt.md` C-3）候令，未启令前零动工。
- 全账见 `docs/repair-plan-20260923.md` §43 与 `docs/debt.md` A#58；本批零代码、零部署面变化，
  `cordis.patch.yml` 一字未动（基准 `b0f304c9`）。

### 契约 v1.2 收官批：终批四裁落账＋B 子案一落地＋收口批六件全书闭账＋v1.3 挂账清单落档（2026-09-30，EXE-BOOT-017；纯文档，运行时行为零变化）

- **migration.md §4 前置 2 改述（终批 B＝子案一，用户 2026-09-29"按建议"）**：原句"面板不再读旧字段"与
  同段面板纪律（P2.4 深度生命周期资产原样保留）正面冲突、按字面永不满足，改述为
  **"改读来源（provides 优先、缺席回落 legacy）、表继续存在"**——5 插件硬编码清单与 `ORIGINS/ROW_IDS`
  按面板纪律原样保留；面板注册面读取已切 provides 优先（`snapshot.mjs` 走 `extractRegisters`，与 loader
  同口径，W9/改名批已落行为）。**零新行为、零面板纪律解除。**
- **收口批六件全书闭账**（C-1 守卫进门禁／D-20 存量清理／门禁第 6 步冗余摘除／C-3 正典化／F-19 成文半边／
  C-2 v1.2 档），逐件落地笔与证据互引见 `docs/repair-plan-20260923.md` §41.3；终批四裁（A 丙／B 子案一／
  F-87 扩槽方向采认落 v1.3／D-13② 维持现状收口）账面正典＝同节 §41.1。
- **v1.3 挂账清单落档**（`docs/debt.md` C-3）：收紧本体（info→error＋1.1.0→1.2.0）、entry/inject/tools
  三面扩槽（F-87 随同批，两边界注随行）、7 份内置清单迁移、装载面真机复验窗、D-13② 新门槛两问、
  历批升级路候选累积。
- 本批不动任何代码、门禁步数仍 6（默认链 5）；`cordis.patch.yml` 一字未动、`~/.dsh` 全程只读、宿主零触碰。

### 契约 v1.2 批前半收官：独立 doctor 撤根字段必填集＋CLI↔契约对账网扩面（2026-09-29，EXE-BOOT-016；两仓同批）

- **独立 doctor CLI 的判定面放宽（对外可见）**：`manifestVersion`/`name`/`requirements` 不再必填。
  一份"纯契约形态"的 `dsh.plugin.json`（只带 `id`/`displayName`/`version`/`contract`/`requires`/`provides`）
  自此在 doctor 侧零 schema issue。`requirements` **在场时**其五键键集与目标存在性仍由 doctor 逐名校验，
  缺席时整段跳过——这一"跳过"现在是被断言钉住的行为，不是静默空洞。
- **契约版本仍为 1.1.0**：本批**未**把迁移期容忍的 legacy 字段（顶层 `requirements` 等）收紧为 error，
  也**未**升版；收紧所需的两个前置（面板纪律冲突点、入口与 inject 两面缺契约替代表达）已备好题面候用户裁，
  执行侧未自裁。
- **门禁第 4 步覆盖面 21→46 格**：新增"重叠面逐规则对账"（两套校验器同管的每条规则逐一钉住同向红／
  契约严·doctor 放行／方向相反三类）与"根字段键集对账"（契约在册 17 键 vs doctor 白名单 14 键，差集恰
  `{exports, healthCheck, registers}`）。**门禁步数仍 6**（`--with-scan`），默认链仍 5。
- 连带修一处既存缺陷：doctor 校验套件根清单时，若 `requirements` 在场而 `exports` 缺席会当场崩溃
  （`Object.keys(undefined)`）；现按"缺名"报，语义不变。
- `KNOWN_LEGACY_FIELDS` 的测试面从"只钉一个名字"换成全清单钉（八名 deepEqual＋逐名 info＋名单外第 9 名
  必 error＋内置清单实际用到的 legacy 键枚举）。
- 本批不动装载行为、不动面板路由、不动配置；`cordis.patch.yml` 一字未动；宿主未触（宿主对契约与独立
  doctor 零消费，实测依据见 `docs/contract-v1.1-recon.md` §3）。

### 功能全量清单转正为正典＋面板门禁分级口径首次成文（2026-09-29，EXE-BOOT-015 正典化批；纯文档，运行时行为零变化）

- **功能全量清单自此是正典**：F/H 编号空间冻结（新号须经协调侧裁定，执行侧自造编号的路关闭）；报数口径唯一＝
  重建件 23、覆盖账 68＋23＝**91（定为终数）**、编号空间现用至 **F-93**。旧"22/90"字样退役并逐处列名，
  原文照录不再作为依据引用。引用时须分清：**91 是覆盖账，不是编号空间上界**。
- **横切区新增 H4**：两份"合法字段/必填"清单互不相容（契约根字段 17 键 vs 独立 doctor CLI 白名单 14 键，
  两套必填集相反）。它决定后续每一条声明类落差怎么读；修复动作归契约 v1.2（本批只立账，状态仍"有出入"）。
- **面板 HTTP 面的分级口径写下来了**（`docs/embed-toolkit.md` §4.1）：32 条路由＝只读闸 10＋写闸 22，
  判据在注册处的 `change` 标注而非 HTTP 方法；`POST /v2/install/precheck` 是全表唯一"带请求体却走只读闸"的
  路由，现行理由＝不落盘、不签写凭据、不改 registry 状态。**本批未收紧任何路由**，precheck 行为维持原裁定，
  清单里 F-19 的状态也仍是"有出入"（成文≠翻正）。
- **一条反直觉标注如实登记**：`POST {base}/doctor/dry-run` 零落盘（只起一次 CLI 子进程做只读体检）却走写闸——
  成文只记实况，不替它补一个代码里没有的归类理由。
- 更正注（原节照录不改）：守卫批收官节写的"判据基准 `e8051fe9`"是第 3 次滚存前的旧值，现行基准符为
  `b0f304c9`（"一字未动"这一实质成立）；债务正本"冷启动读法"里"门禁 5 步／已滚存两次"两处陈旧陈述
  已在本批在位改对（`--with-scan` 现 6 步；基准已滚存四次）。详见 `docs/repair-plan-20260923.md` §39.4。
- 本批不改任何运行时行为：装载、面板、doctor 判定面与配置零触碰；`cordis.patch.yml` 一字未动。


### 文档引用守卫上岗并收口（2026-09-29，EXE-BOOT-013/014 守卫批；对外可见面＝门禁与"文档可按住"）

- **新增门禁一步：文档引用守卫**（`scripts/doc-ref-guard.mjs`，`--with-scan` 链末）。仓内文档与证据
  正本里的 `路径[:#锚]` 引用从此受三条判据约束：目标文件必须存在、`#符号` 必须能在目标 grep 到、
  **行号形态在活文档一律判红**（要求改符号名/节名）。自证格 51 断言／32 组比对每轮必跑，解析器退化
  判"本校验器不可信" exit 2 而非安静通过。
- **对外可见的行为变化**：以后在本仓文档里写 `文件:123` 式引用会被门禁当场拦住；历史取证类引用改认
  两种写法——按符号/节名定位，或写成「第 N 行（当时）」的散文形。
- **存量引用全数清偿**：五份活文档 180 条改写（行号 157／文件名与运行时产物 23），14 份存档件追加
  "引用勘误（守卫登记）"节登记 63 个失效引用形态（覆盖 82 条，逐条给成因与真位；历史行一字未动）。
- **门禁步数账**：`--with-scan` 先因守卫上岗 6→7，再因摘除 p23-verify 双跑冗余步 **7→6**；默认链 **5 步不变**。
  p23-verify 覆盖面不减（已属回归全跑 14 项之一，清单侧另有守卫）。
- **附带修正三处文档陈旧陈述**：`docs/contract.md` 与 `docs/migration.md` 里 patch-config-check 的门禁
  序号（批 2 插步后未回填，实为第 5 步）；`docs/add-sub-plugin.md` 称 regression-all 不含 p23-verify
  （D-3 修法已并入）。四处跨仓引用补 `doctor仓:` 前缀。
- 本批不改任何运行时行为：装载、面板、doctor 判定面零触碰；`cordis.patch.yml` 一字未动。

### 记忆案收官（2026-09-29，EXE-BOOT-012 收官账笔；纯文档）

- **端到端点亮确认（对外行为面定谳）**：跨会话记忆功能自本日起**全链在役**——全部用户输入
  入账（指令入待办、非指令入「一般输入」栏）、`agent_memory` 变量注入恢复要点、模型首请求
  即见【会话记忆】节。验收窗证据：两次宿主启动 register 全挂、claimed `collected`×4 带
  `wsRing:header`＋`kind`（自日志 `~/.agent-memory/logs/agent-memory.jsonl` 实证）、用户回报
  模型可复述【会话记忆】节。
- **六要求终态**：R1 采集线通／R2·R3 分栏与进度在／R4·R6 注入现场验证／R5 六 README 在；
  记忆停写案三结构性缺口（采集选择性/注入半边/诊断不可达）自此全部闭合。案史闭环链与
  证据互引见 `docs/repair-plan-20260923.md` §37、`docs/debt.md` #52。
- **升级路两条在档（候后续批）**：相同指令去重（同文本待办不重复建条）；分栏判据精度
  （"请"问句入待办观察）。正文落 `lib/agent-memory/README.md`【待补充要求】节。
- **更正注（原节照录不改）**：上节施工批"预设模板 `{{agentMemory}}` 行＝部署步骤，候用户
  批准后写入（生效前未端到端点亮）"已随事故处置笔翻面——变量正名 `agent_memory`、模板行
  已落盘、验收窗全绿；以本节与 README 收官注为准。

### agent_memory 变量名合规修复（2026-09-29，事故处置·用户实测在案）

- **事故**：首版注入接线注册名取 camelCase `agentMemory`，违宿主变量命名正则
  `/^[a-z][a-z0-9_]*$/`（dsh-system-prompt lib:57 插值侧＋lib:296 注册侧同正则校验）——注册被
  插件 fail-soft 吞成告警、预设模板行在渲染侧每请求爆 `malformed prompt variable reference`，
  用户重启后 DSH 全请求失败。
- **处置**：①模板行当次还原（备份覆盖、sha 逐字节核销）；②变量改名 **`agent_memory`**（双侧
  合规＋与在册 provider/model/cwd/workspace_instructions 零撞名）；③**写前必验入常设**——
  写模板行前从宿主源码核插值正则与注册接口两侧命名约束并查撞名（write-template-v2 工装内置
  预验步）；④README 触点表补"命名正则"字段。
- **漏检自记**：机制实证（插值在/注册接口在）未含命名约束核验——正则在宿主源码可查而未查；
  测试钉用插件侧假环境、未过真宿主模板解析器。接线层盲区又一例，触点表补字段防复发。

### agent-memory 全量采集·工作区闸修复·记忆注入接线（2026-09-29，EXE-BOOT-011 施工批；C1-007 施工令·用户全单批准）

- **工作区闸修复（缺陷修复）**：created/claimed 工作区取数改读宿主会话 `session.header.cwd`
  （逐环回落，命中环随自日志 `wsRing` 落行）——此前终端回落 process.cwd()，闸实际比较"宿主
  启动目录"，跨启动/换目录续写被全拦（9/28–29 自日志 3× WORKSPACE_MISMATCH、零 collected 实证）。
  闸 win32 大小写归一（同区不同大小写不再误拦；真跨区仍拦，handoverToWorkspace 流程原样）。
- **R1 全量采集（功能增）**：全部用户消息入账——指令性→待办（编号/流转不变），非指令→新增
  「一般输入」栏（只追加、status=已记录、不参与未完成计数；溢出时已完成先移、一般输入次移入
  archive；编号全栏共享连续）。`isInstructionText` 职责改为分栏判据。自日志 claimed 行带
  kind（instruction|general）。
- **记忆注入接线（功能增，R4/R6）**：`agentMemory` 系统提示词变量——每次装配注入恢复要点节选
  （任务摘要/未完成指令/永久指令/新鲜度，≤1200 字符；未注册会话空串零负担；systemPrompt 面不在
  位不注册、回调异常降级空串，挂载与请求零破坏）。manifest/patch 行声明 `inject: [systemPrompt]`
  （**patch 基准第 4 次滚存 a663f61b→b0f304c9**；doctor host-faces.json 补录该面）。预设模板
  `{{agentMemory}}` 行＝部署步骤，候用户批准后写入（生效前"自动回灌"未端到端点亮，如实注）。
- **压缩正典副本补全**：已搁置条目并入正典采集（未完成全谱＝进行中/待办/已搁置，与恢复报告
  口径一致；排列在活跃条目后让优先级）。
- 回归面：node --test 466→479（＋13 新钉）；p22 A-inject 真值格随 manifest 更新（165/165 维持）。
  归因与取证：`var/scratch/exe-boot-011-20260929/`；账面：计划 §35、debt #51、README「升级与
  宿主触点」节；各笔独立可 revert（`20c85d6`/`ec4db85`/`82bfa5e`/`521f5d9`）。

### 六个 README 文档补齐（2026-09-28，用户基本要求令）

- **每个子插件与插件桶自此各有 README**：新增仓库根 `README.md`（桶总览：五子插件清单＋桶本体 registry/doctor/面板＋目录地图＋挂载部署实况＋改动红线指针）与 `lib/{agent-memory,compact-router,rate-throttle,search-router,web-search-local}/README.md` 五份。
- **agent-memory README 落用户设计要求六条原文**（R1 全输入记录／R2 进度专司／R3 分栏记录／R4 接手先读记忆／R5 插件要有文档／R6 新会话先读记忆），并附"现状 vs 要求"差距如实注（R2/R3 已兑现；R1 只收指令性文本＝结构缺口①；R4/R6 自动回灌未实现＝结构缺口②；均候用户产品拍板）与"待补充要求"预留节。
- 内容纪律：全部以仓内实况为据（manifest／cordis.patch.yml／卡面文案／源码），不发明功能；纯文档笔，独立回退＝本笔 `git revert`。
### agent-memory 自日志与 .tmp 孤儿自回收（2026-09-28，EXE-BOOT-010）

- **新增插件自日志 `<数据根>/logs/agent-memory.jsonl`**：register（每启动实例在位自证，成败各落一行）＋created/claimed/pre-step/disposed 五事件行（sid 解析成败＋原因码）。pre-step 节流（结论翻变必写、同结论 60s 内抑制、抑制数随行带回）＋单档 2 MiB 轮转（`.1` 单代）；落盘失败降级为 emitWarning 开发通道、宿主零感知。诊断"记忆停写"类问题自此有文件面可读（JSONL 形态对齐 rate-throttle 的 `logs/llm-requests.jsonl` 惯例）。
- **.tmp 孤儿自回收**：原子写（tmp+rename）失败路径即时清理残留 tmp；每次插件挂载时启动清扫超龄（>60s）孤儿（只认 `.tmp-<pid>-<hex>` 文件形状、目录一律不碰、绝不阻断挂载）。9/14 残留的生产根残件将随下一次宿主重启自动回收。
- 边界：纯观测面＋回收面——台账/进度/注册表既有写路径语义零变化；面板客户端零改动。归因与读数见 `docs/repair-plan-20260923.md` §33–§34、`docs/debt.md` #49–#50；独立回退＝对应施工笔 `git revert`（76df6e6 / 26d08aa）。
### inject 卡面真值修复（2026-09-27，技术详情 inject 行）

- **技术详情"inject（依赖的服务）"行现显示真值**：snapshot 取数源由 manifest
  `requirements.inject` 顶层（历史实现即读此处，恒为空）更正为 `requirements.registers.inject`
  （真声明所在）——compact-router（`llm, tokenMeter, sessions, commands`）、rate-throttle
  （`llm, tokenMeter`）、search-router（`web`）、web-search-local（`web`）四卡自此显示所依赖的
  服务名单；agent-memory 无声明仍显示"（无）"。React 卡与兜底页两通道同源（客户端零改动，
  服务端单点修复）。
- 防回归钉：`p22-cards-ui` 新增 A-inject 节 12 格（snapshot 真值对 manifest 实况＋双通道逐卡
  parity，153→165）；修前红恰一格、变异一格实证（读法回潮即红）。
- 真机可见面随下一真机窗核对；独立回退＝施工笔 `git revert`。归因与读数见
  `docs/repair-plan-20260923.md` §30–§31、`docs/debt.md` #46–#47。

### D-19 原生依赖门控声明（2026-09-27，patch 行行级 `inject:`）

- **相关 patch 行加宿主原生 `inject:` 键（用户拍板案一）**：rate-throttle
  （`[llm, tokenMeter]`）、web-search-local（`[web]`）、web-search-router（`[web]`）三行落
  行级依赖声明，门控归宿主（cordis）本体；值取各 manifest 既有声明，与模块自带声明同名
  合并幂等（`Inject.resolve` Map 去重）⇒ **现行行为零变化**。
- **判据基准第 3 次滚存**：`cordis.patch.yml` `e8051fe9…`/3085 B → `a663f61b…`/3160 B
  （p24 两处硬闸常量与 p1/p22-verify 锚行号同步，守卫机制未放宽）。运行时探针实证：
  patch-config-check 对行级新键不抛、既有行零行为变化；真机复验（用户重启）随窗排期。
- 独立回退：施工笔 `git revert` ＋基准回滚。

读数与双路语义源码读证见 `docs/repair-plan-20260923.md` §29、`docs/debt.md` #45。

### W9 第一段（2026-09-27，D-2/D-3 工装修正＋F-62 撞名规则读 provides）

- **doctor CLI 撞名规则改读 provides 正典（F-62，与独立 doctor 仓同批）**：
  `reg.name-collision` 对 `services/commands/providers` 三槽的跨清单重名检查，改按
  **provides 优先、缺席回落 legacy `requirements.registers`** 的正典口径读取（与 loader
  `extractRegisters` 一致，含"provides 空数组＝声明为空、遮蔽 legacy"）——manifest 以
  `provides` 声明的提供面重名自此同样被判 error。既有 legacy 声明行为不变；真实仓 dry-run
  保持 0/0/0（批 10 provides 与 legacy 同槽同值）。
- **p23-shadow-scan 证据文件改带时间戳（D-2）**：每次运行写
  `P23-SHADOW-SCAN-<UTC 时间戳>.txt` 新文件，不再覆写既有证据正本（证据目录"只增不改"）。
- **p23-verify 并入回归全跑清单（D-3）**：`regression-all` 专项脚本 13→14。

钉子：doctor 仓 stage4a +3 格（provides 撞名复现钉／混声明回落格／空数组口径格，8→11），
修前红恰三新格红、变异两发隔离各红各的；读数见 `docs/repair-plan-20260923.md` §28、
`docs/debt.md` #44（doctor 仓笔 `343ca9f` 互引）。

### F-73 软卸载收据（2026-09-27，恢复确认弹窗只读收据块）

- **恢复确认弹窗新增"卸载收据（只读）"信息块**：软卸载过的插件在点"恢复"时，弹窗内显示
  四问四答——什么时候卸的／卸了什么／本体存哪（源代码未动＋改动前备份位置）／怎么恢复
  （按台账插回原位、系统设置项一并恢复、重启生效），卸载时填过原因则一并显示。
- **数据与边界**：数据全部来自保管区软台账现成记录，snapshot 卡新增 `softReceipt` 字段
  （无记录＝null，additive），不加接口、不动引擎；挂载确认弹窗（重装后）不属软卸载收据面，
  不渲染；行文案由服务端权威下发，React 与兜底页双通道逐字同文。
- 独立回退：单笔提交 `git revert` 即整链还原。

钉子：零新增钉（p24-ui-matrix §2.9 区补两条断言——收据行内容在场＋双通道覆盖，718→720）；
变异两发隔离各红各的；读数见 `docs/repair-plan-20260923.md` §26、`docs/debt.md` #43。

### 改名批（2026-09-27，snapshot 输出面键名正典化）

- **⚠ 对外可见（输出面键名变更）**：`/api/toolkit-panel/snapshot` 每卡输出对象——
  `registers.services/commands/providers` 三键更名为 `provides.services/commands/providers`
  （数据源换为契约 `provides` 正典，走 loader `extractRegisters` 单源化：provides 优先、
  缺席回落 legacy `requirements.registers`，同装载面口径）；`registers.events` 按批准甲案
  更名为顶层 `events`（数据源不动）；`registers` 键自此不存在；`inject` 键名与数据源
  **不变**；其余卡字段一律不动。**无双写过渡**——已知消费方仅本仓面板客户端两读点
  （React 技术详情＋兜底页，已同笔同步）；宿主侧是否解析该 JSON 体未证（观察需求随
  批末呈报，见 `docs/repair-plan-20260923.md` §24.3）。
- **技术详情可见面零变化**：TechRow 中文标签与数据值均不变，仅内部取数字段名变。
- **独立回退**：单笔提交，`git revert` 即整链还原；无 manifest 改动、无数据迁移、无宿主耦合。

钉子：零新增钉（既有 p22-cards-ui 153、p1-smoke 314/0 全绿，p1 三断言预计零翻兑现）；
换源变异证据（provides 正典改写 ⇒ 输出随之变化＋p1 仍绿＋pristine 逐字节还原）与三道锁
读数见 `docs/repair-plan-20260923.md` §24、`docs/debt.md` #42。

### 批 11（2026-09-26，契约版本 1.0.0 → 1.1.0）

- **契约版本升次版本（C-1 第 6 项 / F-68）**：`PLUGIN_CONTRACT_VERSION = '1.1.0'`。
  v1.1 全部增量（provides 提供面、events/panels 形状收紧）均为非破坏变更；
  存量 manifest 的 `"contract": "^1.0"` 继续放行（零迁移，对偶已钉）。
- **`^1.1` 红线解除**："任何 manifest 不得先于实现写 `^1.1`" 的前提（实现仍为
  1.0.0）随本批消失——`^1.1` 自此可写；`1.0.0` 仍被 `^1.1` 拒（对偶保持）。
  破坏性变更才升主版本的红线未触碰。
- **升版漏改点关死**：`ToolkitDoctor.validate()` 的硬编码 `'1.0.0'` 改引用常量
  （回潮即红）；`contract` 值错误的 fix 提示串改插值常量。

钉子：`test/contract.test.mjs`（常量钉翻 1.1.0、对偶、提示串一致性、消息文本钉
改引用常量）＋`test/doctor.test.mjs` 批 11 validate 钉；变异 3 发逐格各红各的；
三道锁读数见 `docs/repair-plan-20260923.md` §19、`docs/debt.md` #38。

### 批 10（2026-09-26，provides 数据落地 + events/panels 形状守卫）

- **provides 数据落地（F-3 数据半边 / F-7 / C-1 第 4 项）**：compact-router
  （`services=["compaction"]` + commands 5 条）、search-router（`providers=["auto-search"]`）、
  web-search-local（`providers=["local-multi","local-fetch"]`）三份清单按实供 1:1 补
  `provides`，桶根补 `provides.services=["registry","doctor"]`（纠正"依赖被当提供"的
  倒置、`webServer` 依赖声明原样保留）；rate-throttle / agent-memory 实供为空，
  如实不补。三份 lib 的 provides 与 legacy `requirements.registers` 同槽同值 ⇒
  面板输出面零变化（输出面改名随改名批）。
- **⚠ 行为收紧（D-13 ①）**：manifest 的 `requirements.registers.events` 自此受契约
  最小形状校验——须为字符串数组且成员非空（非数组、空串/纯空白/非字符串成员
  一律 error，成员带下标定位）；甲案位置不动，独立 doctor CLI 对该面仍零校验
  （两仓分权），"声明 vs 宿主发出面"深度对账挂 v1.2。
- **⚠ 行为收紧（panels 守卫，批 3 验收令遗留项）**：模块导出的 `panels` 在装载
  绑定处补最小形状守卫——"数组 + 每项非空 id"自此对落盘清单与模块导出两路都
  成立；违例 fail-closed（`plugin-shape-invalid`，与 manifest 校验失败同码），
  不再静默绑定/静默忽略；"非空"两路同判（纯空白 id 也拒）。

钉子：`test/provides-data.test.mjs`（8）、`contract.test.mjs` D-13 两条、
`test/panels-module-guard.test.mjs`（4）＋夹具 4 枚；变异 7 发逐格各红各的；
逐笔三道锁与分笔结构见 `docs/repair-plan-20260923.md` §18、`docs/debt.md` #37。

### 批 8 代码半（2026-09-26，★19 · install/confirm 补逐字确认）

- **⚠ 行为收紧（★19 / F-17 契约五挂账第 3 处）**：`POST /api/toolkit-panel/v2/install/confirm`
  从此要求**知情确认**——`confirm` 必须逐字等于安装源标识（`kind:"local"` ⇒ 向导第一步输入的
  插件目录绝对路径；`kind:"npm"` ⇒ spec），缺失或不符一律 `400 {ok:false, code:"confirm-missing"}`；
  与其余四条 v2 写路由（uninstall/enabled/reload/config 逐字 confirm 插件 id）口径对齐，兑现契约
  "所有写操作都要逐字 confirm"。面板向导"确认安装"按钮随之要求逐字重输该路径才可点
  （服务端强制面与客户端 UX 同批交付，禁"只改服务端导致按钮点了没反应"）。
  钉子 `test/install-confirm-gate.test.mjs`（6 条：缺/尾随空白/大小写各异 ⇒ 400 且零装入、
  逐字一致照常安装、npm 下游拒装语义不受伤、source 形状错仍 value-invalid）。

### Pack H（2026-09-21，交叉验证轮后的债务清偿 · D-9~D-15）

外部独立审计报告复核并账后，用户裁定"修"。B2 取选项 3+2 混合（入口自带元数据根治 + 双通道守卫）。

- **H1 toolkitRoot 根治（D-11）**：面板与 registry 的 toolkitRoot 收敛到唯一推导点
  `panel/manager/toolkit-root.mjs`，缺省按**模块位置**锚定，与进程 cwd 彻底无关（优先级：
  显式 `config.toolkitRoot` > 模块位置）。两种失效模式可见化：① 落点连目录都建不出来时
  **不再炸面板装配**（原先审计 sink 的无保护 mkdir 会一路把面板 apply() 掀掉），改为点名路径
  + 可执行建议；② 状态写不进文件时不再只留一行日志——`stateSaveStatus()` +
  新审计事件 `audit:state-save-failed` + `/v2/snapshot.durability` + 条目 `persisted:false`，
  面板卡片如实标注"未落盘（重启会丢）"。**未引入重试机制**。
- **H2 交叉预检补全（D-14）**：停用/卸载方向的交叉引用报告补上 **provider id 维度**
  （`searchProvider: auto-search` / `fetchProvider: local-fetch` 这类引用原先看不见）与
  **声明式依赖**（search-router 依赖 web-search-local，文本里无字面引用）；卸载路径从零预检
  变为与停用同口径。**语义不变：只告知、不阻断**（卸载弹窗第一拍只出示清单，再点一次才执行）。
  `doctor-signals.json` 一字未动（消费者是独立仓 doctor CLI）。
- **H3 双通道统一（D-12 + D-15）**：三个内置入口把元数据自带到 default 上——
  compact-router `static name = "compact-router"`、agent-memory 改为
  `export default { name, apply }`、web-search-local 的 default 补 `Config`。
  新增守卫 `test/dual-channel-parity.test.mjs`：逐入口比对两条通道交给 cordis 的
  `name/inject/Config` 三元组（副本可信性由本机真 loader 1.0.3 现场复核，缺席即 skip）。
  B2 保守合并保留作第三方形态兜底，头注按实测改写（原文"无法对照宿主装载器"的前提作废），
  并记录其**就地改写插件对象**的副作用。
- **⚠ 行为收紧（H3，2026-09-21 H5 已真机兑现并修正一处错账）**：宿主通道从此**会对 web-search-local
  的 config 做 Standard Schema 校验**（`Config` 此前只在模块级，宿主走纯替换拿不到它，cordis 于是
  原样放行）。历史坏值从此由"静默放行"变成"明确报错"。**修正**：本条目原文写的是"本机真配置
  （`cordis.patch.yml` 的 engines 行）实测 0 issue"——**那句是错的，见下方 H5 条目**。同理
  `compact-router` / `agent-memory` 在宿主侧的 fiber 显示名从此固定为
  `compact-router` / `agent-memory-runtime`（原为 JS 推断名 `RouterCompactionEngine` / `register`），
  影响面限于日志器名、服务撞名报错文案与宿主 cordis 调试视图；toolkit 自身的卸载/审计/state
  键一律按 `manifest.id`，不受影响。真机复核读数见 `panel/docs/evidence/H-REAL-HOST-REVERIFY.md` §三。
- **D-15**：维持"面板不可经 registry 通道自举"（防递归装配），但 `plugin-shape-invalid`
  文案改为点名真实成因（manifest 缺非空 `contract` 字段 vs 目录本就无 manifest），
  并给出两条可执行修法，用例钉住。

- **H4 顺手三件**：
  **D-9** `retryAttempts` 在转 ACTIVE 时归零（与 D-8 的 `lastError` 同走状态源 `setStatus`），
  计数从此只有"当前这一段连续失败"一个含义；新增诊断面 `retryAttemptsOf(id)`。
  如实收窄一条：现存的每段入口路径（`setEnabled(true)` / `reload` / active 态 `setConfig`）
  本来就会先经 `unloadEntry` 清零，所以 D-9 原文担心的"更早被隔离"实际暴露面比预期窄，
  真实收益是不变式与诊断/文案口径正确（变异自检结果记在测试文件文末）。
  **D-10** 契约插件夹具的 marker 开关改为**每次调用时解析 + 支持 `process.env.FIXTURE_MARKER`**，
  五个使用方各自持有 pid 专属路径 ⇒ 并行跑测试文件不再互相翻对方那枚磁盘开关；
  顺带消掉一颗克隆即失红的暗雷（仓内 `marker.flag` 本就是 gitignore 的运行产物）——
  本轮已把它从原位挪走并全量批跑 293/293 绿，证明使用方不再依赖它。
  **D-13** 沙箱侧三份 09-14 前后的陈旧配置快照（`after-switch.yml` 等）在
  `D:\dsh-test-sandbox\docs\warn-stale-config-snapshots.md` 立了警示（禁作恢复基线、
  `sougou` 已于 `37819e9` 修对、整份早于面板），README 对应条目加了指针；
  **快照本身不删不改不重生成**。

- **H5 真机复验（2026-09-21，用户批准重启真实宿主）**：H1 落点固定与 H3 双通道统一在
  dsh-web-all 宿主上全部兑现——宿主进程 `cwd` 实测 `C:\Windows\system32`（旧公式的命中场景），
  而 state/audit 两面都锚在 `D:\dsh-plugins\dsh-toolkit\.registry`；`/v2/snapshot` 新增的
  `durability` 字段在场即为新码运行的判别物；7 处历史漂移点与对照位复扫**零新文件**。
  容器面直读（临时探针插件，验完即卸）显示 `compact-router` / `agent-memory-runtime` 的宿主侧
  fiber 名 = 声明名，旧名 `RouterCompactionEngine` / `register` **0 条在场**；
  `web-search-local` 入口级 fiber 的 `Config` 与 `~standard` 在场。抽样 32/32 路由符合 p1-smoke
  声明、SSE `hello` 首帧正常、autoload 与状态文件一致。全文取证见
  `panel/docs/evidence/H-REAL-HOST-REVERIFY.md`。
- **Fixed（H5 真机撞出的启动故障）**：`cordis.patch.yml:61` 的 `engines` 第 8 项 `360` 加引号
  （`360` → `'360'`）。原值经 YAML 解析成**整数**，H3 起宿主通道开始真校验该插件配置，于是
  启动即 `ValidationError: $.engines[7] expected string but got 360`，该异常经 cordis-plugin-loader
  冒到 `dsh-app-boot` 顶层 ⇒ **整个宿主进程 exit 1，面板与所有插件一起起不来**（爆炸半径远大于
  本文件 H3 段原先描述的"拒绝装载该插件"）。
  **此改动影响宿主实际加载行为**（该文件是宿主经 patch 机制加载的 bundle 总装补丁），
  经用户裁决执行；同文件其余 4 个 config 块（含 `rate-throttle` 的嵌套 `routing`/`staticGroups`）
  逐值目检，无第二处同类问题。
  行为影响面：`360` 引擎在坏值时代**功能正常**（`lib/web-search-local/index.js:1050` 有
  `String(name)` 兜底并明文注明 YAML 会把数字送进来），本次不是"修好一个坏引擎"，
  而是让配置类型诚实、宿主恢复启动。
  基线滚存：P8 判据基准 `ce0b0b81…`(3097 B) → `bb7af96f…`(3099 B)，`scripts/p24-verify.mjs` 与
  `scripts/p24-ui-matrix.mjs` 的硬闸期望值同步（守卫机制本身未放宽）。历史证据文档中的
  `ce0b0b81…` 记载保留原文——那是各轮当时的真实读数。
- **新增债务《D-16》**（debt.md）：静态 patch 通道的配置校验失败 = 掀掉整个宿主，而 registry 动态
  通道有单条目隔离/重试/超时——这个不对称此前无人登记。含一条盲区：本次坏值长在 toolkit 自家
  patch 行里、不经面板安装通道，故 doctor 的安装前预检天然够不着。

### Pack I（2026-09-21，安全网与历史脚本处置 + 搜索引擎清理 · 纯仓内、零宿主动作）

用户合并指令两件事（互不依赖）：把 H5 故障暴露的"没有任何链路看得到 patch 行类型错误"这一格补成门禁；
并按指令删除 `360` 与搜狗两个引擎。债务侧关账 D-16 / D-17。

- **Added 门禁第 5 步 `scripts/patch-config-check.mjs`（关 D-16）**：解析 `cordis.patch.yml` 后，逐行按
  **宿主通道语义**校验 config——`import(name)` → 官方 `unwrapExports`（逐字抄自 cordis-plugin-loader 1.0.3）
  → 读那个对象上的 `Config` → `Config['~standard'].validate(config)`；无 `Config` 的入口**如实跳过并打印
  理由**（与 cordis `if (!runtime.Config) return config` 同语义），认不出模块又带 config 的行**判红**（要求
  补 `HOST_ROW_MODULES` 表，不做静默放过）。当前读数：7 行 ⇒ 2 行真校验（`web`、`web-search-local`）、
  5 行如实跳过。
  **自带 YAML 子集解析器**而不是复用面板的 `parseRootRows`：后者把值一律当字符串，会把 `360` 读成 `'360'`
  ——正是本脚本要抓的那类 bug，复用即假绿。该解析器严格到 fail-closed（锚点/别名/块标量/多文档/
  `on|off|y|n` 这类 YAML 1.1↔1.2 结论相反的歧义写法/下划线数字一律抛错），并有 `selfcheckCases()`
  20 条断言**每次门禁都复验一遍解析器本身**——解析器退化时报"本校验器不可信"而不是安静通过。
  报错格式补齐了 cordis 原文缺的三样：**文件名 + 行号 + 修法**（H5 §二的六维评估）。
  变异自检两发：① 还原未引号 `360` ⇒ 精确报 `cordis.patch.yml:61 的 engines.7 … 加单引号`、exit 1；
  ② 把解析器整数分支改成返回字符串 ⇒ 走自证翻红分支、exit 1。
- **Changed 引擎池 8 → 6（用户指令）**：`cordis.patch.yml:61` 删 `sogou` 与 `'360'`，现为
  `[searxng, google, duckduckgo, mojeek, bing, baidu]`。删除前四项影响分析全过：剩余 ≥1；分层降级链
  `cn` 仍有 `bing`/`baidu`（`ENGINE_LAYERS` 按 `cfg.engines` 投影，空层自动丢弃）；search-router 按
  provider/mode 路由、不含引擎名；宿主 `~/.dsh/dsh-search-router.json` 只读核对无引擎条目。
  **补充轮（只读）又核了 settings 层**：`~/.dsh/settings.yaml` 无 `web-search-local` 节、
  引擎关键词零命中，运行 profile `profiles/web/` 的 `cordis.yml` 与 `cordis.patch.yml` 都是空 `[]`
  ⇒ **确认无覆盖层，删除在宿主重启时完全生效**（该重启已在 2026-09-22 07:50 自然发生、非本侧动作，
  现场已只读核实为 6 项版本，见 `docs/debt.md` 同节《生效现场补记》；
  《settings 层核查（补充轮）》；该文件也顺带实证了 `profiles/web/package.json` 里的
  `"@local/dsh-toolkit": "link:D:/dsh-plugins/dsh-toolkit"` ⇒ 宿主确实加载本仓那份 patch）。
  **边界如实**：`lib/web-search-local` 的实现、`ENGINES` 表、`ENGINE_LAYERS.cn` 与 `defaultConfig()`
  按指令**未动** ⇒ 没有该 patch 行覆盖的宿主上默认仍含这两个引擎；且每次调用的 `engine`/`engines` 覆盖
  只查 `ENGINES` 不查 `cfg.engines` ⇒ 显式指名 `'360'` 仍能命中实现。生效层序为
  默认 → patch 行 → settings 节（若今后经 settings 写 engines 会再覆盖一层）。
  判据基准随之第 2 次滚存：`bb7af96f…`(3099 B) → **`e8051fe9…`(3085 B)**，
  `scripts/p24-verify.mjs` / `scripts/p24-ui-matrix.mjs` 两处硬闸期望值同步（**机制未放宽**，
  两次滚存来路写进常量上方注释）；历史证据文档里的旧 sha 记载保留原文不改。
- **Added `test/s6-contract-migration.test.mjs` S6-C4**：该文件里的 `PATCH_CONFIGS` 是 patch 值的
  **手抄镜像**（此前无人核对，正是"H5 那句 0 issue"式的漂移温床），新增对账断言钉住引擎列表一致性
  ——改 patch 忘改镜像即红。变异自检 MUT-H：只把镜像改回含 `sogou`（真文件不动）⇒ 精确翻红；还原 ⇒ 4/4。
- **Changed（退役与冻结，关 D-17）**：`scripts/restore-cordis-baseline.mjs` **显式退役**——它的重建公式
  「HEAD blob + 追加 toolkit-manager 4 行」自那 4 行进 HEAD 起就不自洽（H5 轮实测 3202 B ≠ 3097 B，
  且本轮改动之前就已如此，一直 fail-closed 未写盘），而"钉死某一枚 sha"的概念也已被滚存判据取代 ⇒
  现行恢复动作是 `git checkout HEAD -- cordis.patch.yml`（`q2-layer-scan` ④ 正以此判据校验），
  完整原实现保留在提交 `10ebcef`。三个 `scripts/terminal-acceptance-*.mjs` 判为**历史冻结**（加时点
  头注与运行横幅，不删）。其中查实 `terminal-acceptance-report.mjs` **重跑会覆写已入库、已登记 sha 的
  证据正本** `panel/docs/evidence/TERMINAL-ACCEPTANCE-ROUND10.txt`（与 D-2 同族第二处）⇒ 加了执行硬闸
  （`process.exit(2)`，只拦跑、不改任何取证逻辑与历史结论文本），并把 `evidence/README` 里该行"可重放"
  的表述按只增不改的规矩追加更正。
- **未做**：没重启宿主（改动经 `@local` 链接在下次宿主自然重启时生效——实际那次重启已发生于
  2026-09-22 07:50，是用户侧动作、非本侧，本侧只读核实过新实例加载的是删减后的 6 项版本）、
  没碰 `~/.dsh` 的凭据，也没写任何
  宿主侧文件（只读核对范围：`dsh-search-router.json`、`settings.yaml`、`profiles/web/` 的配置层——
  结论"无 settings 覆盖层"见 `docs/debt.md`《settings 层核查（补充轮）》）、doctor 独立仓零改动、
  p1-smoke 断言一字未动、未用 `p23-shadow-scan` 生成任何产物。

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

### 新版宿主适配第一批：并发锁修复＋版本门禁重画（2026-10-03，EXE-BOOT-026）

- **agent-memory 并发写丢失修复**：全局 registry 锁在 Windows 换手窗内可能读到上一持有者锁属主记录的删除前影像，导致活锁被误清、两写者同时进入临界区丢失注册记录（三振插桩实录）。修复＝陈锁判定双读确认（隔拍复读一致才清理）；锁的其它语义（忙超时/超龄/脏锁）不变。修复前该抖动为偶发（压力基线 ~12%/轮），修复后 120×6＋60×12 进程并发压力与 20 连跑单文件、6 轮全套件全绿。
- **版本门禁重画（0.2.0-rc.2 兼容）**：peerDependencies 三包重钉为 `^0.1.5-rc.2 || ^0.2.0-rc.2`；插件 manifest 的 dshRuntime 重画为 `">=0.1.2-rc.1 <0.2.0 || >=0.2.0-rc.2 <0.3.0"`（保持 0.1.x 线，新增 0.2.0-rc.2 起的 0.2.x 线，上界 <0.3.0）。0.2.0 宿主下安装与启动零版本豁免提示（沙箱实装实测）；0.1.x 现役宿主不受影响（该宿主无版本检查器，实证）。
- **桌面自动更新窗口期暂停**（用户侧唯一例外性改动，已备份可回退）：暂停机制与回退法随批申报（详见账面 plan §63.2）；feed 现状仍供 0.2.0-rc.2。
- 新版宿主适配的预设通道与 settings 面两份设计稿已另呈（纸面，未实施）。

### 契约版本 1.2.0 → 1.3.0（2026-10-03，EXE-BOOT-028；用户裁决②）

- `PLUGIN_CONTRACT_VERSION` 升次版本（`contract/src/types.ts`）：0.2.0-rc.2 宿主适配（dshRuntime 双段范围，见上条 026 批）落地的契约面次版本。manifest `contract` 范围校验与错误提示串全经常量插值自动跟随，`^1.0`／`^1.1`／`^1.2` 既有清单零迁移；无 schema 变更、无校验行为收紧。

### 预设通道 0.2.0 适配：compact 变体预设自动生成（2026-10-03，EXE-BOOT-031）

- `scripts/apply-preset-patch.mjs` 新增 0.2.0 profile-patch 通道：宿主 0.2.x 下不再改写任何预设文件（旧机制的改写目标在新宿主已不存在），改为向 profile 的 cordis.patch.yml 追加 marker 包裹的变体预设块——按环境现场枚举全部含压缩成员的预设基底（官方 bundle 预设与用户层声明行，第三方 bundle 以同形态入包即自动覆盖），逐一生成「xiaobai compact」变体：压缩引擎同位替换、群组结构与兄弟成员原样保留、全新预设 id 不劫持官方、结构失配 REFUSE 不盲写、幂等、单块可回退（`--undo --only <id>`）；无压缩成员的基底（minimal）明示跳过。通道判定＝形态探测＋安装树版本交叉校验；显式 DSH_HOME 环境下绝不静默回退老通道。0.1.x 宿主老通道行为原样保留。
- 回退：删除变体块即回退（手工或 `--undo`）；首次写入前 profile patch 整文件备份于 `preset-backups/`。

### 子插件 manifest 运行时范围与根 manifest 对齐（2026-10-03，EXE-BOOT-032）

- lib/ 四子插件（agent-memory／compact-router／rate-throttle／search-router）与 panel 共 5 处 `dsh.plugin.json` 的 `requirements.runtime.dsh` 由旧单段 `">=0.1.2-rc.1 <0.2.0"` 同步为根 manifest 同款双段 `">=0.1.2-rc.1 <0.2.0 || >=0.2.0-rc.2 <0.3.0"`（9db3a58 版本门禁重画的声明面一致性收口）。安装准入本就读根 package.json peerDependencies（早已双段），本次纯声明面对齐、行为面无变化。

### 预设通道呈现形态返工：官方预设内嵌压缩引擎（2026-10-04，EXE-BOOT-034；用户方向性终裁）

- **用户可见行为变化**：0.2.0 宿主上 `apply-preset-patch` 的产出由「菜单新增三个 xiaobai compact 平行条目」（031 形态）返工为「**菜单与原生宿主完全一致（仅官方预设原样），官方模式选中时压缩引擎为 xiaobai-agent/compact-router**」——对官方基底预设行写**同 id 覆盖行**（profile patch 层；宿主 patch 语义：按 entry id 替换所供字段、config 整体替换），显示名/序/描述全量继承官方原值、零新增菜单条目、零劫持官方 id 之外的命名空间占用。minimal（无压缩成员）维持明示跳过。
- 机制保留：现场读基底、compaction 同位替换、群组结构/兄弟成员保留、结构失配 REFUSE 不盲写、幂等、单块可回退（`--undo --only <基底id>`）；新增保护＝profile patch 已有同 id 覆盖行（网页编辑器或手改）时 REFUSE 拒遮蔽＋状态命令遮蔽/上游漂移告警。031 形态的平行变体块可用 031 版工具 undo 或手工删块清除。
