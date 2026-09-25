# dsh 功能全量清单（仓内正本 · 落档笔）

> 落档：2026-09-23，按协调侧《修复总动员+C-1 合流开工令》第一节第 4 步执行；此后以本文件为仓内正本。
> **冻结版本**：toolkit `916b7d1` ／ doctor 仓 `2f12f53`（现场核对与清单"口径"行一致；落档前跑门禁 6/6 全绿、
> doctor 五套件 15/8/7/21 + stage3 a–g 全绿、真实 `~/.dsh` 扫描面 hash `c585738c…`(5 files) 前后逐字节相同，
> 两仓工作树跑前跑后均为净）。
> **正文状态**：下面分割线以下是协调侧转贴的"呈审稿"**原样落盘，一字未改**（含其自带标题里的"（未入库）"字样、
> 以及它自己的口径与《本轮纠错》《未能确认》两节）。此后的更正一律按仓库规矩"错误照录、修订滚存新笔"，不回改本节。
>
> **落档时自查出两处缺节（自曝；非本笔引入，附件到手即缺）**：正文只有 对象①/②/③/④/⑤/⑦-B 六个抬头——
> ① **「对象①-B · React 标签页」无正文**，但文末《未能确认》第 1 条引用了"对象①-B 星标 1/2"；
> ② **「对象⑥」整号跳过**（⑤ 之后直接 ⑦-B；从 ⑤ 段内混入的 `--dry-run`/`--to`/plan op/`fix.class`/
> `hostVersion` 等条看，那一块是"对象⑦-A · 独立 doctor CLI 仓"的内容，抬头行在转帖中丢失）。
>  ⇒ 后果：开工令点名的"高危四条"里第 1 条（面板体检操作台 400）应属 ①-B、第 2 条（引擎点名越部署名单）
> 应属 ⑥，**这两条在本正本里没有对应条目**；且《横切三条》未点名 web-search-local ⇒ 本正本**暂不能**当作
> "功能全量"收口基线使用。执行侧已按"只读代码取证"先把高危四条逐条钉到现行代码位置（见
> `docs/repair-plan-20260923.md` §2），清单正文仍须待协调侧补转 ①-B/⑥ 后另笔续档。
>
> **正文自带的三问尚未批复，照录待裁**：① 面板 React 三通道要不要先安排真机复验；② H2（两套必填集）是否
> 作为正典清单的独立条目；③ 批 5–10 未落地条目是留清单内标"未实现"还是先剔出正典。
>
> **【2026-09-23 续档状态更新】** 上面申报的缺两节已按协调侧 C1-004 回执第四节做**代码级重建**并续档在文末
> 《续档 · 缺失两节的代码级重建》（新增 F-69…F-91 共 22 条；探针不足一事已如实记在该节开头）。
> 上面分割线以下的呈审稿正文**一字未改**；覆盖账口径与原稿 74 条的对账问题见该节末《续档后状态》。

---

六路全部回来，星标条目我逐条回过代码（含三次实测跑数），下面是过目版。未改任何代码与文档，探针留在 var/scratch/feature-inventory-20260923/。

---

dsh 功能全量清单 · 呈审稿（未入库）

口径：以代码实际注册/暴露的能力为准，逐项对照文档。现场核对链尾 toolkit=916b7d1、doctor=2f12f53，与令面一致；本清单冻结在这两个号上。

横切三条（决定下面每一组怎么读）

★H1 五个独立旧仓（D:\dsh-plugins\agent-memory、dsh-compact-router 等）是迁移前基准，不可当现状读。实测差异方向一律是"桶内更新、旧仓落后"：agent-memory 20 个 lib 模块 19 个逐字节相同，唯一差异 workspace-health.js（桶内解除对兄弟插件的静态 import，旧仓仍 import '../../dsh-compact-router/lib/guidance.js'，违反红线 1）；compact-router 的 index.js/agent-memory.js 两份实质分叉；rate-throttle/search-router 逐字节相同。状态：有出入（旧仓 README 全部属"文档未跟上"侧，且 D:\dsh-plugins\node_modules\@local\ 三个桥接 junction 仍指向旧仓、桶根 aliases 仍声明旧包名）

★H2 两份"合法字段/必填"清单各自维护且互不相容，已实测：契约 validateManifest 的根字段合集 17 键、必填 id/displayName/version/contract；独立 doctor CLI 白名单 14 键、必填 manifestVersion/name/requirements。同一份纯契约形态的 manifest：契约 ok=true 零错，CLI 判 schema.required-missing（1 error，实测读数）。差的 3 键里 registers/exports 写在根级时契约只产 info 放行、CLI 判 error；healthCheck 两边都不过（契约要求函数、CLI 说根字段非法），只是文案不同。内置 5 子插件同时带两套字段所以现实里两层都绿——门槛在第三方契约插件身上。状态：有出入（这正是"真门槛是 doctor 必填集"的成因；v1.1 草案的"撤 A 必填集"未落地）

★H3 全仓（排除 test/ 与 dist/）零模块导出 healthCheck/panels/provides；5 份子插件 manifest 只有 id/contract/configSchema 三件套，无 requires、无 provides、无 panels。状态：有出入 ⇒ 批 3 接通的 healthCheck 读链对内置插件恒空转；内置子插件的环境预检与撞名比对无声明可读；桶根 v1.1 的 provides 数据半边留批 10

---

对象① toolkit 桶根本体

星标区

★registry.saveDebounceMs —— 名义是状态写入防抖毫秒，面板装配现场构造 registry 时只透传 servicePrefix/statePath/autoload/retryLimit/retryBackoffMs/loadTimeoutMs，这一项没传，填了等于没填。状态：有出入（缺省值恰好也是 0，断链被掩盖；p7-embed 那条"schema 覆盖 apply 真读的键"的用例只断言键在字典里，不钉接线）

★requiredAliases —— 声明 1 条（compact-router），全仓零读方，只在契约的旧字段容忍名单里以名字出现。状态：未实现

★panels 描述符（slot/order/httpBase/fallbackUi/realtime/managedBy）—— 写给宿主看的挂载声明，本仓无读方，真往 settings.plugins.tab 塞标签页的是面板客户端硬编码。状态：有出入：纯自述数据不驱动布局（宿主侧读不读未查，只可证本仓无读方）

★requirements.registers.services 写空数组 —— 代码实际向容器提供 ${prefix}/registry 与 ${prefix}/doctor 两个服务，撞名比对因此看不见它们。状态：有出入：声明与实供不一致

★桶根 configSchema 那 18 个键 —— 只被声明、从未被校验：根入口不导出 configSchema/Config，实际挂载走 cordis.patch.yml 的 toolkit-manager→panel/index.js，那条路径既无 manifest 也无 schema，桶根自己写错键名/类型没有任何东西拦。状态：有出入（validateConfigAgainstSchema 只服务子插件 setConfig 与安装预检）

★validateModuleExports —— 契约对外导出的模块导出形态校验器，生产链零调用，只有单测自证。状态：有出入

★docs/embed-toolkit.md 关于 requires.services 被借用的告警 —— 代码已改成只读提供面（批 2），文档那句已过期。状态：有出入：照文档读会误判风险

★aliases 5 条 —— 右边目标 5/5 对得上真实文件，左边 5 个旧包名本仓零引用，唯一读方是面板快照原样透传。状态：有出入：只有展示半边，没有解析生效半边

★doctor 三个超时旋钮 —— ruleTimeoutMs/healthCheckTimeoutMs 真用但 manifest 未声明（不可配）；probeTimeoutMs 有声明有缺省有注释"0=跳过探测"，全仓无人读，探测超时是探针里两处硬编码 3000。状态：有出入 + 未实现（死选项）

★v1.1 草案矩阵判"healthCheck 端到端断路" —— 现行代码两条装载分支都已绑。状态：有出入：草案口径过期，别照它立功能条目

★.github/workflows/ci.yml —— 门禁文件结构在，无 git 远端、从未跑起来；真门禁是本机 scripts/ci-local.mjs。状态：有出入（文档已自认）

★门禁脚本名对不上 —— 没有叫 lint/build 的脚本，build×3 + pluggable-lint + p4 导入守卫 + typecheck×3 全串在 npm test 一条链；regression-all(13 项) 与 patch-config-check 不在 npm test 内。状态：有出入：门禁项对得上、层级对不上

★package.json#files 声明 README.md，桶根无此文件；docs/ 里 REQ 编号引用的《toolkit 泛化规格》正本不在两仓任何位置。状态：文档未记 + 引用无源

★契约正本挂 5 处"已裁定改代码、实现未跟上"：批 5（schemastery 不可用时降级为 via:'skipped' 却仍返回通过，写回与体检只看 ok ⇒ 任意配置能落盘）、批 6（入口第③级指向不存在文件仍静默落第④级，红线只覆盖①②）、批 8（面板 install/confirm 不要求 confirm）、批 9（审计事件名入枚举）、批 10 邻近（provides 数据半边 + events 最小形状校验）。状态：未实现（各批已裁定，落地前按小字为准）
【2026-09-25 更新：五处里**批 5 那一处已落地**（批 5-1 笔）】判据改三轴 `ok/verified/via`，降级（含"重建结果不可执行校验"与"schema 形态完全不认识"两格）一律 `ok:false + verified:false`，两个调用方（`registry.setConfig`、体检预检）各自 fail-closed 并分码（`config-schema-unverified`），`config-schema-invalid` 既有语义与断言未放宽 ⇒ 本行余下 **批 6 / 批 8 / 批 9 / 批 10 邻近四处仍挂"未实现"**。钉子：`test/config-schema-degradation.test.mjs`（10 条，含两条反向钉）。

在案区（均状态：一致，除非句内另有标注）

根入口只出 4 件：name='dsh-toolkit'/inject(转手面板那份)/manifest/apply(原样委托 panel/index.js，不留第二装配现场)。
manifest 自校验 fail-closed —— 读盘上 dsh.plugin.json 过 validateManifest，不过就抛错拒绝装配。
配置项 18 键逐条真被读（计数实测：6 顶层 + registry. 9 + doctor. 3；除 saveDebounceMs 外全部有消费方）：servicePrefix 驱动服务名/事件名/HTTP 基址三张表，toolkitRoot 单点推导（显式 config > 模块位置，禁读 cwd），doctorCli/devicesFile/backupRoot/doctorConfigRoot 都是 config→TOOLKIT_PANEL_→现值三级链，registry.{statePath,dataDir,autoload,auditLog,auditFile,retryLimit,retryBackoffMs,loadTimeoutMs}、doctor.{watchInterval,failureThreshold,historySize} 逐项透传。
exports.$from 继承语义 —— 根 manifest 的 requirements.exports={"$from":"package.json#exports"} 解析到 ./index.js；package.json#exports 12 个子路径逐个查目标文件，12/12 存在。
契约校验族 —— 命名空间式 id（/、各段≤64）、requires 八类子字段（runtime/services/subPlugins/envVars/binaries/ports/fsPaths/externalApis）逐条有形状与取值域校验、provides 封闭三槽（events 槽专门报错指回 requirements.registers.events）、semver 引擎支持 ^ ~ x  >=  锚就能签方案并写盘（写前自动备份）。状态：有出入：文档与注释按"改 cordis.patch.yml"叙述，未披露可指任意文件；唯一护栏是 loopback+配对+CSRF+64KiB

★两个体检 dry-run 的 configRoot 传法不一致 —— /doctor/dry-run 只传 cliPath+scopeRoot，/doctor/apply/plan 传 configRoot；配了 doctorConfigRoot 时卡片报告与签方案复用的 fresh 报告来自不同根。状态：有出入：缺省不配时无害

★POST /v2/install/precheck 按只读门禁放行（change:false）—— 其余写类 POST 全走严格配对+CSRF，而它会读任意本地目录。状态：有出入：与 v2 写路由口径不齐

★兜底页 panel.html 无 registry 管理面 —— 页内 /v2 出现 0 次，只能操作 patch 域+体检。状态：文档未记：embed 文档称该前缀"可达可用"未披露缺 v2 半边

★React 标签页基址是硬编码常量 /api/toolkit-panel —— 非缺省 servicePrefix 的第二实例下 tab 全打缺省实例。状态：有出入（embed-toolkit §5.2 已自陈边界，但面板声明里 httpBase 是模板、tab 不跟随）

★真卸载兜底文案过时 —— ABSENCE_COPY_FALLBACK["true-uninstalled"] 仍写"本体已移入保管区·可一键恢复"，与销毁式 v2（零副本、不可恢复）相反；服务端 statusCopy 正常遮蔽它，兜底方向误导。状态：有出入

★archivedExpected —— /uninstall/plan 在 mode=true 时恒返 true，语义"预期有存档"实为收据零副本，客户端与测试零消费。状态：文档未记：字段名与承诺反义

★保管区迁移工具 purgeCustodyBodies() —— 全仓零调用点，只被注释引用。状态：未实现（未接线；设计稿裁"不自动执行"，但也没给手动入口）

★面板内审计历史浏览 —— /v2/snapshot 只下发 auditFile 路径 + durability，无浏览/筛选入口。状态：未实现（债务 D-1 裁定不做、只做了落盘半边）

★search-router mode 写入口 —— 卡片只读展示"生效值+来源"，零写路径。状态：未实现（P2.5 候选，批次未批）

★R12 面板行迁到包子路径 —— 宿主挂载行至今是 file:/// 绝对路径。状态：有出入：矩阵已判"文档超前"，并记反证（三段名过不了客户端发现机制）

在案区

路由共 32 条（字面 22 + v2 工厂 9 + /v2/connector.js 1，与我方独立计数一致）：GET ui(装配期改写标记，缺标记 fail-closed 装不上)、GET snapshot(每次实时 buildSnapshot：六态卡片/依赖修饰/目录体量/参数面板/patch 原文/保管区清单)、POST doctor/dry-run、toggle/plan|execute(只改 patch 行 disabled 字面量，现值是 !!js 表达式即 value-not-literal 拒；停用向附交叉引用报告，只告知不阻断)、config/plan(仅 rate-throttle + 18 白名单，服务端复验类型/范围/跨字段)、uninstall/plan|execute(soft/true 两向，逐字输入插件名 1/2 次 + 200 字原因)、GET custody、restore/plan|execute、mount/plan|execute(无真卸载收据即 mount-no-receipt 拒)、GET plan/status、GET doctor/states(CLI 前 50 条 + 写前快照前 5 份，CLI 不可达即 degraded 不假装)、doctor/apply/plan|execute、doctor/rollback/plan|execute(非 apply stamp 即 stamp-not-rollbackable)、snapshot-restore/plan|execute(snapshot-identical 拒)、/v2/{snapshot,health,install/precheck,install/confirm,uninstall,enabled,reload,config,events}(写操作 confirm 须逐字等于 id)、GET /v2/connector.js。方法校验全在 handler 内(405+Allow)。

面板入口 —— ctx.slots.inject("settings.plugins.tab") 注册 toolkit-panel/order 90，与桶根 manifest 声明逐字同向（这条判状态：一致）；注册整块 try/catch，失败退化为空组件。

面板操作（React，只列真有 handler 的）—— 重新读取/一键体检；registry 卡片区启用·停用·重载·卸载（点一次出"我确认操作该插件"勾选、勾上才能执行，confirm 逐字等于 id）+ 健康详情(报告项+历史链+拉取失败降级) + 配置表单(按 configSchema 递归渲染 object/boolean/number/array/union，多字段合并写回)；安装向导(只收绝对路径、预检三列、被阻断即刷新不写盘)；两层开关卡(第一层 patch-row.disabled 可写、第二层 config.enabled 只读呈现，含"该插件没有内部开关")；参数编辑器 18 字段(与 config-whitelist 逐字段同集合)；卸载两键 + 逐插件文案(UNINSTALL_COPY 覆盖 5 个，缺文案降级不渲染死按钮)；恢复/挂载控件(宿主键冲突出 A/B/C 三按钮并明写不自动覆盖)；删除收据只读清单(顶部固定"收据不能恢复")；未落盘状态横幅(点名 state.json/audit.jsonl 路径)；技术详情卡。

管理器动作 —— apply-engine(两段式、token 存内存重启即空、5 分钟 TTL、execute 前重读比 SHA、锚点复验、写前备份+保留最近 20 份或 30 天绝对上限 40)；行块算子(越界到顶层行尾、非单行块 row-block-multiple 拒、宿主键占用 host-key-occupied)；交叉引用两层(patch 文本整词含 provider id 额外匹配词 + 声明式依赖反查)；uninstall 四 kind 分派(软：摘行+台账+邻接留痕；真：收据先行→摘行→rmSync 删本体→复验；预设向：只调 apply-preset-patch.mjs --undo/无参、双层 sha 留痕、预设备份缺失 fail-closed；插回位用邻接证据优先+原始偏移补偿)；custody(收据 bodyStored:false+逐文件 sha、每插件滚动 5 份、row-adjacency.json 只增不减)；snapshot(六态含 unknown-absent、dependency-broken 只修饰 mounted、searchRouterModeShadow env>热 JSON>patch)；doctor-runner(纯子进程 execFile，缺省 180s、--states 60s、24MB buffer、按大括号配平切多文档)；backup(落盘名净化 :/\//，NTFS ADS 修复)；plugin-registry(5 插件登记表 + assertUninstallable 拒自卸)；registry-host(唯一装配现场，落点建不出来只降级点名)；audit-sink(订阅 8 类事件、白名单取字段、2MiB 轮转)；toolkit-root(禁读 cwd，有专测)；v2-api(entryView+schemaToJSON 递归解引用)；realtime-connector(SSE 在场不轮询、onerror 降轮询)。

实时与事件 —— /v2/events SSE：先 retry:2000+hello{servicePrefix,at}、13 个事件名、15s ping，客户端事件名与服务端同集合逐字对齐；轮询兜底无独立端点(降 3s 拉 snapshot，即声明里的 poll)；客户端双形态(动态 import connector.js 须显式 start()，失败回退内联实现)，两路都有测试。

panel/dsh.plugin.json 不声明面板、无 configSchema、无 id/version（全部声明与 18 配置项只在桶根那份）。状态：一致（与 D-7/D-15 裁定口径相符：面板不可经 registry 通道自举）

对象② agent-memory

星标区

★台账新鲜度"硬拦截"没有执行点 —— assertFreshForHandover 只在 agent-memory 自己的 agent/pre-step 里被调，抓到 FRESHNESS_STALE 只 warn 就放行；压缩侧只用不抛错的软探针；rate-throttle 零引用。状态：有出入：设计 §1/G2 的"拒绝"语义全链无人执行

★过期告警文案印错变量 —— plugin.js 读 err.freshTurns，而抛错对象只挂 e.turns（freshTurns 只在成功返回值里）⇒ 真机告警长成"上限 undefined"。状态：有出入（判定逻辑本身正确）

★manifest 少声明一个真在用的配置键 —— 代码读 dataRoot/defaultWorkspace/enforceFreshness 三个，schema 只有前两个；enforceFreshness 默认开、只能显式写 false 关，面板不展示、补丁行也没有。状态：有出入：隐藏开关（且面板据此判它"无内部开关"）

★独立旧仓 20 个运维入口一个都没迁进桶内 —— preflight.mjs(§11 部署门禁 CLI)、health-check.mjs、install-global.mjs、verify-engine.mjs、smoke-final.mjs、9 个 record-.mjs、test/guard-prod-root.mjs 等；现行位置只剩库 + remove-session.mjs/rollback.mjs。状态：有出入：§11"preflight 全绿才许重启"在新位置无可执行入口

★三个能力模块在现行位置无任何生产调用者 —— preflight.js(11 项检查)、migration.js(顺序守护)、workspace-health.js(5 项) 只被 test 引用，且都没从 lib/index.js 导出、manifest exports 也不含。状态：有出入：代码在、入口没了、消费者没了（我方 grep 复算：lib/+panel/+index.js 全域零命中）

★自动归档 30 天没人触发 —— autoArchive 逻辑正确但全插件零 setInterval/定时器/调度，只有测试调用。状态：有出入：§4/§7 的触发点在代码里不存在

★台账"未知区段向前兼容"是会丢内容的兼容 —— parseLedger 把未知 ## 区段收进 sections，renderLedger 只回写固定四区+永久区 ⇒ 任何未知区段下一次写入被静默删除。状态：有出入："读得进、写不回"

★手动归档命令不存在 —— 设计 §7 承诺 archive  命令，既无 cordis 命令也无 CLI 子命令，只有两个库函数。状态：未实现

★引导注入的归属写错 —— 设计说"由 agent-memory 注入模块"负责，实现在兄弟插件 compact-router/guidance.js；为解耦，桶内 workspace-health.js 已把模板复制成本地一份。状态：有出入："唯一模板"变两处副本，漂移无守卫（现值逐字相同）

★面板文案超出实现 —— "记住你说过的话和项目里的重要信息，下次对话还能用上"：实际只记当前会话的指令/进度并引导读文件，跨会话要靠人列候选+移交，无检索。状态：有出入

★plugin.js 的对外里程碑 API 是死口 —— register() 结尾 return {milestone}，但 cordis 把 register 当构造器 new、返回值被吞（文件自己注释即如此），全仓无调用者。状态：有出入：注释写"供应用层直接调用"

★§7.4 会话状态自动流转只做一半 —— onSessionState 被 import 进 plugin.js 但从没挂到任何事件；只有 disposed→已完成有驱动。状态：有出入：一个导入了没人用的处理函数

★phase1 设计稿三处数字与代码不一致（phase2 已裁定、phase1 未同步）—— progress 上限文档 16KiB/代码 32KiB；默认永久指令文档 1 行/代码 2 行；测试规模文档 42 例/现套件 82+3 例。状态：有出入：正典文档自相矛盾，phase1 属陈旧侧

★旧仓 EMERGENCY-CARD.md 命令全写死 D:\dsh-plugins\agent-memory\...，其中 3/5 条指向已不存在的工具。状态：有出入：手册与现行位置脱节，照做会去动旧仓副本

★双份挂载面并存 —— 旧仓自留 cordis.patch.yml+package.json#dsh.bundle.patch（挂 @local/agent-memory/plugin），桶根另有一份（挂 @local/dsh-toolkit/agent-memory/plugin）。状态：有出入：旧仓那份一旦被 profile 重新登记即成双挂（是否仍被登记：未确认）

在案区

事件面 —— 无 tool/无 provider/无 service 注册、零事件发射，纯消费者，7 个监听与 manifest registers 逐条同名（含 inject:[]）：session/created 自动入册(三件套、宿主 UUID 派生 sid、幂等、不回填旧对话)；agent/inbox/claimed 中英指令关键词启发式采集、按 messageId 进程内幂等（状态：有出入——设计要求"失败重试不丢"，实现是 catch 后只告警）；agent/pre-step 心跳+回合备忘+新鲜度告警(waterfall，检查完必 next())；session/event 的 session/title 回填摘要(空标题拒)、model/selection 记模型切换里程碑(首次只播种，附永久双行在场核对)；agent/request+agent/request-error 补原生回退型切换(429/QUOTA 挂起、下次请求比最终 call 指纹、纯观察不改链)；session/disposed 活跃→已完成(未入册返回 skipped)。

台账能力面（20 个 lib 模块按能力归并，均：一致除句内标注）—— 注册表与会话生命周期(状态机合法迁移表、移交必带目标 sid、留存裁 100、候选只列最近 10、单活跃写者门禁 assertWritable)；台账(四分区+永久区、编号自增、承接只允许编号、引用不存在拒、未完成永不删、已完成折叠≤80 字带时间戳、超限移最早已完成入归档、全未完成超限拒写并给建议)；勘误(@勘误 supersedes=，状态：有出入——设计说目标不存在要"告警不静默"，实现是写侧拒、读侧静默忽略)；条目内容改写守卫(恒抛 ENTRY_HISTORY_IMMUTABLE，§12.7 已裁定，非新缺陷)；进度与里程碑(只追加、超限只剥已完成、关键三区块永不归档否则 PROGRESS_OVERFLOW、活区块就地改+历史区块 ERRATA_REQUIRED，其中"字段≤500 字符"这一条：未实现)；归档(追加式无上限)；新鲜度门禁(3 个模型回合写死、三取数形态+一软探针)；事件处理层(幂等游标与回合数都是进程内、重启清零——注释自认导致新鲜度提示暂缺)；宿主 id 归一化(裸 UUID/session- 前缀，确定性派生 12 位 sid，未知格式返回 null)；路径与常量；原子写(tmp+rename、生产根内写前先外部快照、坏 JSON 报 CORRUPT_JSON)；并发锁(mkdir 原子锁+owner.json+pid 死/超龄清理、脏锁绝不误删、会话锁外 registry 锁内、忙等 3 秒——同步阻塞，单次写入连拿两把锁)；外部备份(备份根强制在生产根外、200 份轮转、整树删除前快照)；脚本护栏(默认根写死沙箱=极性反转、生产根未授权即中止、生产根 --clean 永久禁止、演示模式不接受授权旗标——后两条分支在现行位置已无脚本使用)；跨工作区移交(逐项比存在与内容、未确认拒、确认后仍留差异告警)；冷启动恢复报告(状态：有出入——包入口导出了但运行期无人调用，实际引导靠注入那句"请先读文件")；在场证据(专用 JSONL、翻变必写、同结论 24h 一条心跳，由兄弟插件压缩出口调用，现行活跃)；时间规范(入库一律 UTC Z；本地化显示函数零调用者)；桶层 index.js(改台账类函数统一套"写前校验+锁内写+写后心跳"，预检/迁移/健康检查三块刻意没进)。

命令与脚本 —— remove-session.mjs(--sid 必填、--root 或 --allow-production/env 二选一、删前整树外部快照+ops 记录+同步摘 registry、一个硬编码受保护 sid 拒删)；rollback.mjs(--list 前 30 条/--restore /--dry-run，越界拒，只能恢复到生产根、无 --root)。

配置项 —— dataRoot/defaultWorkspace 声明+真读+补丁行真给值（defaultWorkspace: null＝回落当前目录）；环境变量四个都在用：AGENT_MEMORY_ROOT、旧别名 AGENT_ROOT、AGENT_MEMORY_ALLOW_PRODUCTION、AGENT_MEMORY_BACKUP_DIR（后三个未进任何设计稿，状态：文档未记）；数据落 ~/.agent-memory + ~/.agent-memory-backup + -sandbox/-demo 两护栏根，不碰 ~/.dsh。

面板 —— 无面板声明、无 settings schema、无内部开关，面板只当一行"已挂载"展示。

对象③ compact-router

星标区

★configSchema 是空的 {} —— 代码实读 21 个自建键 + 3 个透传父类键，且本入口不导出 Config，宿主通道与 patch-config-check 门禁都拿它没办法（那门禁只认 Config['~standard']）。状态：有出入：声明形同虚设

★预设补丁脚本的反斜杠转义在搬仓时丢了，已在 HEAD 里 —— 旧版写 "agentMemoryRoot: C:\\Users\\..."，套件版 45/55 两处写成单反斜杠，JS 串求值实测得 C:UsersLENOVO.agent-memory（自 b83cb52 起在案）。当前盘上四份预设内容仍正确、且 preset-patch-state.json 的 patchedSha 与实算 sha256 4/4 逐字节相同 ⇒ 今天 --status 判 patched、apply 是 no-op；坏路径只在"新预设首次 apply"或"--undo 后重打"时写进去（写进去后 compact-router 的台账/存档路径指向不存在目录）。状态：有出入：潜伏缺陷，现被磁盘旧内容掩盖，无任何门禁或文档记过它
【2026-09-25 R2 笔已修 + 本条两处读数更正】(1) **归属与成因**：不是"搬仓时丢了"、也不自 `b83cb52` 起在案 —— 该脚本首支 `1bc831f` 两行均正确，`8007e22`（2026-09-14「预设补丁覆盖用户预设层并登记梁神回滚链」）同笔改写行块时丢转义 ⇒ **类型 2 实现回归**（取证见 `docs/repair-plan-20260923.md` §2 高危③）。(2) **"被磁盘旧内容掩盖"改述为"被 marker sha 兜底掩盖"**：`apply-preset-patch.mjs#classify` 里"盘上内容命中 `ROW_NEW`"那一支对这四份预设**并不成立**（坏串 ≠ 真串），判 patched 走的是最后一条兜底 `rec.patchedSha === hash`；marker 缺席或新预设 id ⇒ `unknown` ⇒ `applyOne` REFUSED（fail-closed）⇒ 无第三种暴露面。(3) **现状**：两行已双写还原，坏值经实测**从未落盘**（四份 `agent.cordis.yml` 现值全为正确形态），钉子为 `test/preset-patch-escape.test.mjs`（3 条求值级断言，纯静态、不写盘、不碰 `~/.dsh`）⇒ 本条状态由"有出入：潜伏缺陷"翻正为**已实现/已修复**。

★面板对 compact-router 无脑报"运行中·正在生效" —— client 里 if (plugin.dir === "compact-router") return running，不查预设行、不查加载结果 ⇒ 卸载或预设回滚后面板仍说它在生效。状态：有出入

★公共出口被摘一个 —— 旧仓 export { resolveMemorySid } 在桶内副本没了（改成内部惰性包装）。状态：有出入：副本对外面收窄，README 未记

★进度文档的验收信号写错文件名 —— 文档说看 compaction-archive-.jsonl，代码实际写 sessions//compaction/compaction-.jsonl。状态：有出入：按文档去核会误判"没落盘"

在案区

命令 5 个 —— /compact-mode(show|llm|instant|auto|reset)、/compact-llm、/compact-instant、/compact-auto、/compact-archive，全走 ctx.commands.register、会话级覆盖，与 README 及 manifest 同名同数（状态：一致；注意旧 README 的"压缩命令只有 5 条"这条在桶内 configSchema 缺席下没有声明面对账）。
零工具、零事件（events:[]，一致）。
能力面 —— 压缩引擎替换(继承 BasicCompactionEngine 只改 summarize()，auto/llm/instant 三模派发)；instantOnceFor(agent)(对兄弟插件暴露的免 LLM 一次性接口，自清不动 override，rate-throttle 降档压缩靠它)；压缩存档(每次先落全量原文 JSONL、24MB 上限、每会话留 archiveKeep 份、摘要带指针、写失败不阻断)；LLM 摘要富集(追加台账正典副本+memory 引导+存档指针、6KB 封顶)；checkpoint 在场证据(摘要含"始终用中文回复"+"指令先落账"双行则写正向证据)；agent-memory.js 旁挂(台账读正典/永久指令、hostId→sid 反解、陈旧提示；对兄弟走 try-catch+动态 import('../agent-memory/lib/index.js')，符合红线 1、正是分工说明 §5 B 卡指定做法)；guidance.js(固定模板引导+默认数据根 ~/.agent-memory，只从 root/sid 生成不从用户消息提取)；archive.js(写/列/剪枝/指针/富集，全 best-effort)；instant-digest.js(免 LLM 抽取式摘要：指令保全、前轮 checkpoint 只继承条目、进度区+resume 契约、预算裁剪)。
审查文档遗留 —— P0/P1(补 tool-call/tool_use/function_call 分支、嵌套去重)已落地；P2(对文件粘贴降权 original task request)状态：未实现。
配置项 —— mode/fallbackOnRateLimit(auto 下仅 429/配额错误降级 instant) + 14 个 instant 预算键 + archive/archiveKeep + agentMemoryRoot/instantAgentMemoryGuidance/agentMemoryLib 逐个回代码都在构造函数读，无死键（但全都没进 configSchema，见星标）；预设行实际只写 4 个键。
补丁脚本作用域 —— 桶内脚本改两个面：随包预设 standard/ptc/cordis（实路径在 npm 全局）+ 用户预设 ~/.dsh/.agent-presets/（排除 .bak，minimal 刻意不碰）。状态：一致（现行文档在案：p0-recon/migration.md/矩阵 3.2 都记了，矩阵还判"文档括号只覆盖用户面、写窄了"）；分叉的是旧仓 README 那句"liangshen 不动它，历史红线"——它属迁移前口径，不作落差计
面板 —— 自身不声明 panel，只在 toolkit-panel 当卡片；卡片副标题"上下文压缩"、弹窗叫"压缩"、描述未提三模式。状态：有出入：文案与真实能力面有落差（面板注释自认不同源）
兄弟插件静态 import —— 生产代码未破红线 1；唯一静态引用兄弟源码的是旧仓 test-instant-digest.mjs:10，桶内同名测试已改动态。状态：一致

对象④ rate-throttle

星标区

★取用了两个没声明的服务 —— 代码 ctx.get("agentPresets")(:744) 与 ctx.get("compaction")(:749)，但 inject 只写 ["llm","tokenMeter"]、manifest registers.services 是 [] ⇒ 降档压缩整条链依赖未在契约里的服务。状态：有出入（我方复算确认）

★面板把 rate-throttle 报成"功能开关关闭，暂不生效" —— innerSwitchValue 只读顶层 enabled(主动节流，补丁按设计关掉)，完全不看 routing.enabled(=true，路由/冷却/降档才是主功能)。状态：有出入：标签与实况相反

★补丁里 logPath: '' 不是"停日志" —— 空串走 config.logPath || defaultLogPath() 回落默认路径，照样写 ~/.dsh/logs/llm-requests.jsonl；只有字符串 "none" 才不写。状态：有出入（桶根与旧仓两份补丁都这么写）

★4 个真在读的 routing 键没进 configSchema —— staticGroups/excludeProviders/hotConfigPath/learnedPath（旧 README 表里有它们）。状态：文档未记→manifest 未记：schema 与消费面不一致

在案区

零工具、零命令（一致）。事件 4 条与 manifest 逐一同名 —— llm/adapters-updated(清上下文窗缓存+流放+分组缓存)、agent/request(包装主链路)、agent/request-error(记日志+分型冷却，永远 next())、session/event(model/selection 分辨手动切 vs 自己写回；assistant/message 抓 usage)。
拦截层位置说清 —— 只包 agent/request 这一层，替换 next() 返回的 call 对象(provider/model)，不碰 ctx.llm.stream ⇒ 标题生成、web_search 等直连调用不过路由（README"已知限制"承认，状态：一致）。
策略 6 种 —— ①主动节流(路由之后按目标 provider 排队+自适应退避，默认 enabled:false 零延迟)；②RPM/配额 429→该 key 冷却 cooldownMs(默认 5 分钟)；③TPM 429→本回合跳过+短流放 tpmCooldownMs(默认 45s，0=退回旧行为)；④重试改道(同 turn+step 重复派发即判上次失败，把上次实际用的 key 本回合排除)；⑤同模型族自动分组路由(宿主目录现查+canonicalModelId 归一+别名表覆盖、上下文档位硬安全线、declared>learned>none 再 TPM/RPM/窗口降序、用户当前选择健康时绝不动)；⑥降档压缩(仅低档装不下时压一次/turn，优先 instantOnceFor()，剩余 token 测不到就绝不降档)。全部：一致。
前台同步写回(failover 时 session.append("model/selection")，只改会话不改默认模型)、限额学习落盘(429 现场观测写 learned.json，30s 节流)。一致。
日志事件 7 类(+warn) —— README 列 6 类，warn 事件状态：文档未记。
配置项 —— 顶层 9 键 + routing 16 键全部回代码确认被读、无死键；两个同名 enabled(顶层=节流总开关、routing=路由总开关)，README 配置表把整张表说成"routing: 下"且只出现一个 enabled。状态：有出入：易误配。热配置 ~/.dsh/dsh-rate-throttle.json(实际键 declaredLimits/excludeProviders/aliases，每次路由按 mtime 实时重读)、学习文件 dsh-rate-throttle-learned.json、环境变量只有 DSH_HOME。一致。
面板 —— 18 字段可写白名单(顶层 6 + routing 12)，唯一可写插件行，标注的 src/use 行号对得上现 1058 行源码，数组/对象/路径类键按设计不开放；面板描述"给模型请求限速，避免发得太快被服务方拒绝"只说了默认关闭的那半。状态：有出入（文案落差）
逐文件差异 —— 旧仓 lib/index.js 与副本 1058 行逐字节相同(仅 EOL)；旧仓无 dsh.plugin.json；旧补丁与本补丁值全等，仅行名换成包子路径。状态：一致

对象⑤ search-router

星标区

★配置优先级被自家文档写反 —— 代码真顺序是 patch seed  env > patch"，而同仓 snapshot.mjs 实现、旧件 README、09-16 报告都是 env 最高。状态：有出入：p23 那一行是错的

★层叠里一个坏值会连 seed 一起盖掉 —— 热 JSON 的 mode 写成非法值时，代码把 mode 拉回硬编码 "auto"，不是回落 seed 值（seed 写 official 也废）。状态：有出入：文档只笼统写"seed 真在用(把现成报告喂给 apply、跳过重扫、复检根从报告回读)；--dry-run 是空吞参数(接受但不做事)。状态：文档未记

★--to 只认 --rollback —— --to 配 --apply 或不配 rollback 时静默忽略，无参数冲突校验(对照：--only 与 --apply 的冲突有校验)。状态：有出入：非法组合不报

★engine 实际只会产 2 种 plan op —— 全仓只有 replace 与 install-package（实测字面量计数 1+1），executor 支持 5 种 ⇒ insert/delete/create-file 没有任何规则会产，只能靠 --report 喂外部报告或测试注入才跑到。状态：文档未记（规范把 5 op 都当在用面写）

★fix.class 只有两种在用 —— 全 engine 只产 manual(16 处) 与 rewrite(2 处)，safe/destructive 从不产出 ⇒ summary.safe/summary.destructive 恒 0、fixable 就是 rewrite。状态：有出入：报告规范给 safe/destructive 写了完整语义与"永不批量"约束，代码侧无生产路径

★检查规则实际输出 6 类 category —— 规范只封 env/package/registration/reference/schema，engine 还产 mount 类(5 条 mount./provider. 规则)，且 provider. 的 id domain 不在规范 5 个 domain 内。状态：有出入：两份规范均未登记 mount 面

★扫描面比规范封闭清单多读 4 处 —— 除四类文件外还读 scope 根的 doctor-signals.json、preset-patch-state.json、.panel-custody/soft-uninstalls.json、保管区 manifest.json。状态：文档未记

★test/ 整体排除出扫描面，但不在 executor 的 protected 清单 ⇒ 不扫但不禁写(唯一例外：lib/ 直下名为 test 的目录是在案本体位，放行)。状态：有出入：规范 §7 的 nonScan 清单没有 test/

★配置根环境变量两套名字 —— cli 读 DSH_HOME、engine 读 DSH_DOCTOR_CONFIG_ROOT；cli 总把算好的 configRoot 显式传下去 ⇒ 走 CLI 时 DSH_DOCTOR_CONFIG_ROOT 实际失效。状态：文档未记

★hostVersion 有硬编码缺省 —— DSH_DOCTOR_HOST_VERSION 未设时取字面量 0.1.2-rc.1 参与 runtime.dsh 比对（当前宿主实为 0.1.5-rc.1），升版即整仓误判，无对账机制。状态：一致（读数已实测，但值本身来自 09-15 快照）

★provides 在 A 里没有解读方 —— A 的撞名检查只读 requirements.registers 三类，不读 provides ⇒ v1.1 验收项"provides 声明的撞名被阻断"A 侧未落地。状态：未实现（仅 v1.1 草案在案）

在案区

命令面 —— 默认 dry-run(全量只读体检，有问题 exit 1)、--json(apply 路径打多文档带 phase)、--apply(执行后自动复检，复检有 error ⇒ exit 2)、--only (白名单正则 ^[A-Za-z0-9._-]+$，非法字符 exit 2；查不到 issue-not-found、无 plan issue-not-executable，均零写入)、--states(只读回 doctor-patch-state.json 的 rollbackChain，文件不存在=空链 exit 0、结构非法 exit 2，不跑体检不写盘)、--rollback [--to]、--scope/-s、--config-root/-c、--profile/-p(缺省 web)、--registry(JSON 数组或 {plugins:[]} 追加可解析名)、--now、--help/-h；未知参数打用法 exit 2；--apply 与 --rollback 同给 exit 2。退出码 0/1/2/3/130 语义逐条一致。
检查规则 24 条实产（人话归类）—— schema 面 9(utf8-bom/json-syntax/yaml-syntax/required-missing/requirements-invalid/$from-dangling/missing-suite-manifest/alias-target-unresolvable/exports-target-missing)；ref 面 2(unresolvable-local 全文扫 @local/… 整词、命中别名走 rewrite 单点 replace，stale-in-backup 只 info)；env 面 3(node/dsh 版本范围比对、binary-missing 按 PATH 逐个扩展名找)；package 面 3(missing-dependency 按 Node 算法模拟 resolve 产 rewrite+install-package、version-violation、resolution-outside-scope realpath 落 scopeRoot 外只 warning 并按(包名,realpath)去重)；registration 面 2(reg.name-collision 三类各自跨清单重名 error、reg.inject-face-unknown 不在 host-faces 清单 warning)；mount/provider 面 5(P2.4，全靠 scope 根 doctor-signals.json 驱动，一律 info/warning 不产 error：mount.body-without-row/mount.custody-archived/mount.row-without-body(只判 managedNamePrefix 前缀行)/provider.dangling-reference/provider.missing-provider；信号文件缺席则五个检查静默不跑)。
规范在册但代码没有的 6 条 —— env.env-var-unsatisfied、schema.invalid-version-syntax、schema.drift-package-dual-declaration、reg.unsafe-agent-memory-data-root、reg.missing-manifest、以及 doc 名的 ref.export-target-missing(代码是 schema.exports-target-missing)。状态：未实现（前 5 条两层皆无；后 1 条是 id 搬家）
执行与安全链（executor 是唯一写盘实现）—— 门禁顺序：文件锁(doctor-apply.lock wx 独占，占用即 LOCK_BUSY)→逐条 confirm→全部 step 先解析校验(一次坏步整轮零写入)→protected 硬断言(命中即整轮拒)→才开写。op 校验族(白名单/root 必须命中 roots/不得绝对路径/不得逃逸 root/install-package 的 file 必须 null 且 old 为包名，各有错误码)。写前逐文件原样复制到 doctor-backups///(created 文件不留备份)。锚点重验 WYSIWYG(写前重开目标数 old 字面出现次数，不足即 ANCHOR_DRIFT，后续步标 skipped)。状态链原子写 doctor-patch-state.json(rollbackChain 逐次追加、files{} 记 originalSha/patchedSha、installedPackages 记版本)。回滚(缺省取链上最后一条、--to 按 stamp、回滚自身也先备份并追加新条目不删链、文件类逐字节覆写、install 类递归删除)。install-package 五条拒写(目标 node_modules 是 symlink/junction 即拒、零网络只认 file: 或调用方传源、本地源须有 package.json+version、版本满足声明、目标已存在即拒、复制失败回删)。protected(.bak- 段对所有 op 永禁；nonScan 四段对文件类 op 全禁，install-package 只豁免 node_modules)。
配置项 —— host-faces.json 8 个面(llm/tokenMeter/sessions/commands/web/compaction/webServer/subprocess)，声明与读取处一致(engine 启动读一次用于 inject 校验)，但读失败会回落内联同款 8 面副本 ⇒ 两份副本并存需人工同步；source 字段只作出处说明不参与判定。注意 host-faces 里没有 agents 面，而 search-router/agent-memory 都在摸 ctx.get('agents') ⇒ 宿主面清单是 09-15 静态推导，不随宿主升版。可注入环境：DSH_DOCTOR_SCOPE_ROOT/DSH_HOME/DSH_DOCTOR_HOST_VERSION/DSH_DOCTOR_YAML_URL。
对外 API —— engine runDoctor、satisfiesVersion；executor executeApply/executeRollback/readPatchState/writePatchState/isProtectedPath/planString + 两个 Error 类；CLI 无库型出口(只有 bin: dsh-toolkit-doctor)。状态：文档未记（两份 spec 只描述 JSON 面）。
测试钉住面（只作覆盖度参考，不当功能源）—— run-tests 16、stage4a 9、stage4b 7、d1 21、stage3 1。未被任何用例钉：requires/panels/displayName/version/contract/configSchema 六个根字段、mount/provider 五条检查(本仓无例，仅桶侧 p24 脚本涉及)、--registry、--profile 缺根 exit 3。

对象⑦-B doctor 进程内体检层（toolkit/doctor）

星标区

★两层检查面几乎不重叠，REQ-4 承诺的"CLI 保留为薄壳、调同一 engine"没有发生 —— A 的 24 条(schema/ref/mount/provider/套件结构/包解析) B 一条都没有；B 的 8 条 requires 合成规则 + id-conflict + 撞名比对 + configSchema 真校验 A 也没有（B 全域对 engine.mjs/doctor-signals.json 零引用，我方 grep 复算确认）。状态：有出入：文档承诺同引擎，实为两套独立引擎并存

★B 完全不读 doctor-signals.json —— 该文件是 A 独占消费面(engine.mjs 的 mount/provider 五条)；p0-recon 把"signals 机制保留"写进了 B 的施工图。状态：未实现（面板另有一份手写镜像 hostKey/DEPENDENCIES，与 signals 零守卫，矩阵已记为半钉风险）

★红线 4"零硬编码"只做到一半 —— rules.ts/doctor.ts/probes.ts 里没有任何插件名(事实全来自 manifest.requires 与 registry 实况)，这半成立；但 B 不消费任何声明文件，检查知识硬编码在 rules.ts 的 8 条合成分支里 ⇒ "新检查知识写进声明文件"在 B 无从谈起。状态：有出入

★probeTimeoutMs 是死配置 —— 类型里声明、构造函数缺省 3000、全仓从未被读，探测超时是 probes 里两处硬编码 3000；且 doctor.ts 尾句 void this.opts 明示这些缺省是摆设。状态：文档未记

★契约接口与实现面不等 —— 契约 ToolkitDoctor 只承诺 precheck/inspect/registerRule；DoctorService 实际还公开 attachHost/attachRegistry/history/startWatch/stopWatch/publishReport/validate/serviceName，且便捷装配 createDoctor() 在生产链上没有任何调用方(面板按 REQ-8 自己 new DoctorService)。状态：有出入：契约面窄于实现面

★validate() 硬编码契约版本字面量 '1.0.0' —— 不引用 PLUGIN_CONTRACT_VERSION 常量 ⇒ 升 1.1.0 时这处必漏。状态：文档未记

在案区

零 CLI、零子进程、零写盘能力（无备份/无锁/无 apply-rollback/无 protected），破坏性操作全在 A，分工本身有文档（但见星标 1）。
检查规则（按 manifest.requires 合成 8 条，id 形如 requires/，全只读幂等）—— runtime(node/dshRuntime 范围比对，版本取不到降级为 warn)、services(逐个 hasService，缺席 error)、subPlugins(registry 是否 active，未启用 warn)、envVars(只判"存在且非空"、绝不打印值，required 则 error)、binaries(PATH 存在性 + minVersion 真跑 --version 取首个 semver 比对；状态：有出入——真探测这一层当前只由可注入替身测，contract.md 自己已如实登记)、ports(试绑 127.0.0.1 判占用，shared 降 warn)、fsPaths(accessSync 判 r/rw)、externalApis(3s abort 的 GET，任何 HTTP 响应都算可达，不可达一律 warn 不阻断)。
precheck 附加四类 —— id-conflict(registry 已占该 id ⇒ error 阻断)、reg.name-collision(只比提供面，批 2 断掉两处 requires.services 借用)、config-schema-invalid(用 Config/configSchema/manifest.configSchema 三候选按模块优先顺序对空配置 {} 真校验)、legacy-mode(无契约 manifest ⇒ warn+建议补件)；外加 rule-error(任一规则抛错或超 5s 兜成 error)。
inspect/watch/降级/历史 —— 跑合成规则 + 自定义 healthCheck(5s 超时，超时/抛错产 healthcheck-failed)，按 items 定 healthy/degraded/unhealthy；startWatch 用递归 setTimeout，巡检自身抛错按 1→2→4→8 退避，重入有 inspecting 门闩；非 healthy 累计未达 failureThreshold 前对外仍按 healthy 发布(防抖)，达阈值才发 registry:health-changed + 每 code 一次的 doctor:issue-found，任一次全绿立即复位并清空已播报集合；每插件环形保留 historySize 份，history(id) 是读取口。
事件与宿主接线 —— 事件名带 servicePrefix；attachHost 后 hasService 由宿主实现覆盖(已改 ctx.get(name,false)，堵掉原型链误判)；面板把 health-changed 回写 registry 条目不另开旁路；doctor 服务经 host.provideService 交 fiber 归属自动回收，无补偿式 cleanup。
配置项 —— servicePrefix 必填(缺则 TypeError)，watchInterval/failureThreshold/historySize 三键真被面板读并逐项传(缺省 30000/3/20，与构造函数缺省重复写了一遍；watchInterval<=0 不启巡检)，ruleTimeoutMs/healthCheckTimeoutMs/logger/timers/probes 均可注入(替换 probes 即故障注入面)。
对外 API —— DoctorService/defaultProbes/synthesizeRules/createDoctor + 5 个类型；RegistryAccessor 约定 list/get/可选 registersOf(缺省则跳过 services 维度比对)。
manifest.healthCheck 可达性 —— 读方在(带 5s 超时)，写方靠批 3 的 bindRuntimeStatics 补位；全仓现无任何模块导出它 ⇒ 内置插件这条面实际空转（状态：一致，recon P0-3/D-9 已清偿并如实登记"内置零变化"，但验收基准里它只能算读链就位、无在案样本）

两层落差（各已进上面星标，这里给合并视图）—— A 有 B 无：文件面检查全套、写侧执行器与回滚链、--only/--states/--yes 命令面。B 有 A 无：安装前 precheck 阻断、id-conflict、configSchema 默认值真校验、8 条 requires 环境合成规则、周期巡检与降级状态机、事件流、环形历史、registerRule 第三方扩展点。两层都无而文档写了：env.env-var-unsatisfied、schema.invalid-version-syntax、schema.drift-package-dual-declaration、reg.unsafe-agent-memory-data-root、reg.missing-manifest、fix.class 的 safe/destructive。只在 v1.1 草案：A 侧读 provides、桶根与 lib 清单的 provides 数据、撤 A 必填集(C-2/v1.2)。

---

本轮纠错（草稿读数被我方回验推翻或收窄的三处）

一、子代理呈报"契约侧白名单 18 键" —— 实测合集是 17 键（9 契约 + 8 legacy，交集后无重复），A 侧 14 键是它的真子集，差 registers/exports/healthCheck。成因：把"legacy 8 + 契约 9"直接相加，没去重 manifestVersion/name/requirements 三个同名项。

二、同上一条的推论"盘上写 healthCheck 契约放行、A 判 error" —— 两边都不放行：契约对该键要求函数、JSON 里必为 type error，A 判根字段非法，只是文案不同。真落差在 registers/exports 写在根级（契约只产 info 容忍、A 判 error）与两套必填集相反。已按实测读数改写为 H2。

三、子代理呈报"预设补丁把用户预设纳入、文档未同步" —— 收窄：桶内现行文档三处在案（p0-recon §37 实测 liangshen、migration.md:52、矩阵 3.2 判"文档写窄了"），分叉的只是旧仓 README 的迁移前口径。已按"文档一致、旧仓陈旧"记，不计入落差。

未能确认（落档前你需知道的空白，逐条会影响能否钉住）

React 标签页的三条操作通道（对象①-B 星标 1/2）是静态读码 + 服务端校验点复算，未真机点过；兜底页 panel.html 三向正常。要不要安排一次真机复验，请裁定。
宿主（dsh-web-all 侧）读不读桶根 manifest 的 panels/slot/order/managedBy —— 在两仓之外未查，只可证本仓无读方；aliases 左边 5 个旧包名在 profile 里是否真被注册过同样未证真也未证伪。
各仓测试本轮一律未跑（只读约束），所以"哪些钉子真在钉"只取了用例名与断言文本为证；agent-memory 的 82+3 例、compact-router 旧 README 的"54 checks"是否达成，全部未验。
两插件的真实运行态未验：宿主现 0.1.5-rc.1，而 compact-router-进度.md 记的基线是"0.1.2-rc.1 逐字节一致"，那条已过时；装载后 fiber 状态只读无法取。
inject 只声明一项、实摸多 seam 的普遍性 —— search-router 用 ctx.get('agents')、agent-memory 与 web-search-local 用 agents/tools/systemPrompt/settings，全有 try/catch 兜底，但宿主是否保证在场仓内无契约声明可查，host-faces.json 里也没有 agents 面。
独立 doctor 仓对 agent-memory/compact-router 是否另有声明式检查，未穷尽（红线 4 只保证 engine 不硬编码插件名）。
safe/destructive 两个 fix.class 是否曾被 A 的任一历史版本产出过，只查了 HEAD 与最近提交说明，未做全历史穷尽。
批 5 正在并行推进（schemastery 降级透出）：它一旦落地，对象①星标"批 5"那条即从"未实现"翻正；批 6/8/9/10 同理。落档笔建议标注"冻结于 916b7d1，批 5+ 落地后需回改的行已逐条标出"。

清单到此。你检查后批复口径（尤其三件事：面板 React 三通道要不要先当真机复验项、H2 两套必填集是否作为正典清单的独立条目、批 5–10 未落地条目是留清单内标"未实现"还是先剔出正典），我再随落档笔一次入库。

---

## 续档 · 缺失两节的代码级重建（2026-09-23 · 笔 3 · 不改写上面任何一行）

**依据**：协调侧 C1-004 过裁回执第四节缺节处理令。令面第 1 步"先查 `var/scratch/feature-inventory*` 探针"已执行，
**实测探针不足**：该目录只有 `cfg/profiles` 与 `probe-a/dsh.plugin.json`、`probe-b/dsh.plugin.json` 共 5 个文件，
两枚 manifest 是 H2（两套必填清单）的复现夹具——probe-a 纯契约形态、probe-b 纯 CLI 形态带 `healthCheck:true`——
**不含 ①-B / ⑥ 的任何底表**。按令面第 2 条本应"报协调侧由上会话呈审稿补转"；第 3 条又要求"重建件另笔续档"，
故本节按**执行侧自己回代码取证**重建，并把它与波 0 断点普查合并做（同一批读码两用）。
**取证代理口径**：两条通路的读码由两路只读代理完成，承重结论我**逐条抽验**（见每节末《我方抽验》），未抽验的标"代理实读"。
定位一律按符号/行号给到 `toolkit:` 仓内位置，行号为 2026-09-23 实况（D-20 守卫未建，日后按符号找）。

### 对象①-B toolkit 面板 React 标签页（重建件）

星标区

★F-69 体检操作台三入口 `setDlg` **漏传 `kind`** ⇒ 修正/回滚恒 400 + 两屏恒不渲染 ——
`panel/client/index.js` 的 `beginFix`/`beginRollback`/`beginSnapshot` 三处 `setDlg({copy, issueId|entry|snap, plan, phase})` 都没写 `kind`，
而消费侧四处全按 `dlg.kind` 分派：`confirmDlg` 的三目式恒落最后一条 ⇒ 请求恒打 `/snapshot-restore/execute`
⇒ 服务端 `panel/index.js` 的 `plan.kind !== "snapshot-restore"` 命中 `plan-kind-mismatch` ⇒ 400；
`:1475` `dlg.kind==="fix"`（"将执行"清单）、`:1483` `dlg.kind==="snapshot"`（"变化预览"）恒不成立；`:1493` 完成文案恒取末支。
**关键补充（比呈审稿口径更精确）**：`kind` **本来就在同一份 copy 描述符上**——`CONSOLE_REPAIR:1288`/`CONSOLE_INSTALL:1299`
的 `kind:"fix"`、`CONSOLE_ROLLBACK:1310` 的 `"rollback"`、`CONSOLE_SNAPSHOT:1321` 的 `"snapshot"`；
且卸载/恢复五处 `setDlg`（`:1085/1107/1129/1148/1181`）都规规矩矩写了 `kind` ⇒ **属漏传一个已在场的字段，不是缺设计**。
⇒ 正解是一处写法：`kind: copy.kind`（取 copy 自带值），而非三处各钉一个字面量。状态：有出入（开工令高危①）
★F-70 修正/安装弹窗的标题与正文读 `p.old`/`p.file`/`p.new`，而服务端 `/doctor/apply/plan` 只下发
`plan.steps[].old/new`（`extra` 仅 install-package 形态非 null）⇒ **每次点"执行"，标题与正文渲染出 `undefined`**，
与 F-69 同屏但**根因独立**（F-69 是判别字段漏传，这条是取数层级错）。状态：有出入（代理实读，我方抽验 `:1287-1298` 成立）
★F-71 健康徽标"（含插件自定义健康检查）"永不出现 —— `:1867` 读 `parsed.hasHealthCheck`，
而 payload 在 `:1850-1854` 只装 `{status, items, history}`；真值在 `p.hasHealthCheck`（`panel/manager/v2-api.mjs` 下发）⇒ 恒 undefined。
叠加 F-72/F-83 后，"健康"这一列对内置插件是**整列皆断**。状态：有出入（代理实读）
★F-72 "健康详情"第二次点击不折叠且恒重发请求 —— `:1845` 判 `open === "health"`，但同一 handler 紧接
`:1850` 把 `open` 写成 `"health:"+json` ⇒ `"health"` 字面值永不被读到。状态：有出入（代理实读）
★F-73 恢复弹窗的 `custody` 恒 undefined —— 三处 `setDlg({kind:"restore", …})` 均未写 `custody`，
而 `:1258` 传 `dlg.custody`；且 `restoreCopyOf(plugin, mode, custody)`（`:883`）**函数体完全不引用第三形参**
⇒ 双重死参数（传得错、就算传对也没人读）。状态：有出入（代理实读）
★F-74 `:1518` 引用 `styles.issueWarn`，而 `styles` 里只有 `issueWarning` ⇒ 该警示条无样式（代理做全量 key 比对，唯一一例）。状态：有出入
★F-75 **通用 `/execute` 不校验 `plan.kind`** ⇒ `toggle` / `config-edit` / `snapshot-restore` 任一 token 都能从这一条通道落盘
（`panel/index.js` 的 `/execute` 直调 `executePlan(token)`；`panel/manager/apply-engine.mjs` 只在
`createTogglePlan:314`/`createConfigPlan:446`/`createSnapshotRestorePlan:707` 处**写** kind，`executePlan` 内**不判**），
而 `/uninstall/execute`、`/snapshot-restore/execute`、`/doctor/apply/execute` 都带 kind 闸 ⇒ **同类通道安全口径不对称**。
状态：有出入（我方抽验 `executePlan` 与三个创建点的 kind 分布成立）⇒ **归 W11 越权写收紧，不归 R1**
**【2026-09-25 W11-a 笔已修】** `toolkit:panel/index.js` 的通用 `/execute` 补 kind 白名单：只放行"锚点 +
文本替换"三族，其余（含 `kind` 缺失或不认识）一律 `plan-kind-not-allowed`（400）拒、文案点名该走的专用
路由（新增指路表 `apply-engine#DEDICATED_EXECUTE_ROUTE_BY_KIND` 覆盖 11 个专用 kind），与 R1 把客户端兜底
改 fail-closed 同构 ⇒ 两端闭合。**本条的成因面也一并收**：通用写方案此前**根本没有 kind**（正是"只在三处
写 kind"那句话点出的缝），现补 `patch-edit` ⇒ 白名单是"认识才放行"而非"没标注就放行"。
钉子：`toolkit:test/panel-execute-kind.test.mjs`（11 条：三族放行且真落盘 / 四族 token 被拒且**不消耗
token、零写入** / 未知与无 kind 一律拒 / 不存在 token 仍 `plan-not-found`(404) 语义不变 /
反向不对称：patch-edit 打 `/snapshot-restore/execute` 仍被那条自己的闸拒 / 现存族必须被白名单或指路表
显式覆盖）。变异四发：摘闸 ⇒ 恰 5 条拒绝类红；白名单放宽一档（塞进 snapshot-restore）⇒ 恰 1 条红；
摘掉 `patch-edit` 赋值（过窄方向）⇒ 恰 2 条红；拒绝时顺手吃 token ⇒ 恰 4 条"不被消耗"红。
本条状态由"有出入"翻正为**已修复**；W11 的另半边（`POST /plan` 可指任意本地文件，`F-19`）**未动**，
按 C1-006 批复走"先只读对账、名单经快批后才改代码"。
**【同日 W11-b 笔已落地，F-19 翻正】** 通用 `/plan` 只接受 `target="patch"`（目标固定 `toolkitRoot/cordis.patch.yml`），
`target != "patch"` ⇒ 新错误码 `plan-target-unsupported`(400)，**整个"客户端指定文件"通道关闭**（连 `target="patch"`
时塞 `file` 也不看）。对账结论（批复已采信）：全仓仅此一处接受客户端传路径，两套界面与全部 scripts/test **零调用方**
使用非 patch 目标，保管区/预设面各走自己的路由 ⇒ 收紧比原口径（"patch 域 + 保管区白名单"）更紧且零功能损失。
硬证据（tmp 沙箱内两步 HTTP 请求，真仓与 `~/.dsh` 零触碰）：**修复前** `/plan{target:"file",file:<诱饵>}` → 200
签发、`/execute{token}` → 200 落盘，诱饵文件 sha `1442c138521c` → `8fa956003caf`（真被改写）；
**修复后**同序列第 1 步即 400 拒、诱饵 sha 前后不变。钉子：`test/plan-target-gate.test.mjs`（5 条，含端到端正向
一发与"塞 file 也无效"反向钉 + 一条防回潮静态钉）。⇒ **W11 两半（a token 跨种消费 / b 任意文件写）至此全闭**；
真机复验统一挂批 8 观察窗。
★F-76 真卸载兜底文案恒死 —— `:54` `ABSENCE_COPY_FALLBACK["true-uninstalled"]` 与服务端 `snapshot.mjs:201` 不同字，
而服务端对**一切非 mounted 态**都发 `statusCopy`（`:384`）⇒ `:248/:869` 的兜底分支不可达。
（这是对原稿 F-22"兜底文案过时"的**收窄**：文案确实过时，但它今天永不显示 ⇒ 危害等级低于原稿描述。）状态：有出入
★F-77 客户端 `CONFIG_FIELDS` 的 `type:"num"`/`"bool"` 与服务端 `config-whitelist.mjs` 的 `type:"number"` 字面不一致
（客户端只用 `"bool"` ⇒ 无功能影响，纯口径漂移）。状态：有出入（轻）
★F-78 `draft` 以扁平 path 为键，`v2RenderField` 回传的是嵌套对象，两者在嵌套 schema 下可同屏（**代理推断，未实测**）。状态：未核实

在案区（重建件，均：一致除非句内标注）

操作通路 30 格实测（五插件 × 配置/停用/启用/重载/卸载/健康；patch 行 id：`agent-memory-runtime`/无(preset)/`rate-throttle`/`web-search-router`/`web-search-local`）——
**配置**：只有 `rate-throttle` 真可写（18 字段白名单 → `/config/plan` → `validateConfigValue` 类型/范围/YAML 字符拒绝/跨字段 → `/execute` → 写 patch + `.panel-write-backups/<stamp>/`）；
`search-router` 只读呈现 mode（生效值+来源，写入口按第 19 轮裁定不给）；`agent-memory`/`compact-router`/`web-search-local` **无入口（设计如此：`configPanel.editable:false`）**。
**停用/启用**：四卡有（`/toggle/plan|execute`，只改 patch 行 `disabled` 字面量；现值是 `!!js` 表达式 ⇒ `value-not-literal` 拒；停用方向附 `buildCrossRefs` 只告知不阻断）；
`compact-router` 无 patch 行 ⇒ 无此格（设计）。**重载**：五内置**全部无入口**——唯一 reload 在 `POST /v2/reload`，需 registry 条目，
而 `.registry/state.json` 实测 `plugins:{}` ⇒ 内置永不可达（设计：patch 域改配置须重启）。
**卸载**：五卡全有（软=摘块+`.panel-custody/soft-uninstalls.json`；真=再删 `lib/<dir>`+收据；`search-router`/`web-search-local` 额外 unset `web` 行的
`searchProvider`/`fetchProvider`；`compact-router` 走 spawn `apply-preset-patch.mjs --undo`）。
**健康**：**五卡全无入口 = 整列断**（唯一健康详情通道 `GET /v2/health` 需 registry 条目 ⇒ 内置恒不可达；
面板上能看到的"健康"只有整仓级 `POST /doctor/dry-run` 与 `/doctor/states` 两份 CLI 报告，不是逐插件健康）。**这一格是缺陷不是设计**：
桶内 `manifest.healthCheck` 读链已在（批 3 接通），但内置零模块导出它（H3）⇒ 无数据可显示，而契约又承诺逐插件健康。
卡片状态文案权威面：三态 label 硬编码在客户端 `stateOf:239-272`，缺席态文案在服务端 `snapshot.mjs:197-205 ABSENCE_COPY`，依赖态在 `plugin-registry.mjs:83 DEPENDENCIES` ⇒ 三处三份。
fetch 面共 28 条，客户端调用与服务端 exact 路由**零缺口**（无"客户端打不存在的路由"、无"客户端有调用但服务端未注册"）；
写路由一律 `guard({change:true})` + `isAllowedWrite`（loopback socket+loopback Host，或配对严格判定）+ `isSafeStateChange`（`sec-fetch-site`、Origin.host==Host）；
客户端**从不显式带**任何 CSRF/配对头，靠浏览器注入 Origin/Sec-Fetch 与 `credentials:'same-origin'` 送 `dsh_pair` cookie ⇒ Host 非 loopback 时全 403。
`/v2/install/precheck` 是**唯一"带请求体的 POST 却按只读闸"**的路由（`change:false`）⇒ 与 F-19 同格，裁决 4 维持、口径入 W11 安全梳理。

我方抽验（把代理结论升为事实的部分）：F-69 三处 `setDlg` 与四处消费点逐字读；`CONSOLE_*.kind` 四枚字段在场；卸载/恢复五处写 `kind` 的对照写法。
F-70 的 `title/what` 取数与 `:1287-1298` 逐字读。F-75 的 `executePlan` 不判 kind（`panel/index.js` `/execute` handler + `apply-engine.mjs` 三处 `kind:` 写入点全仓 grep）。
其余 F-71/72/73/74/76/77 为代理实读、我方未逐字复看 ⇒ 动工到该条时先复算再钉（不拿未抽验读数当依据）。

### 对象⑥ web-search-local（重建件）

星标区

★F-79 `cacheTtlMs` / `cacheMax` 声明并被读、**但不生效** —— 二者在 `Config` 有声明、`defaultConfig()` 有缺省、
`makeCache` 内也确实读（`WSL:319` TTL、`:324` 容量），可是 `makeCache` 全站**唯一调用点**是
`WSL:1454 const cache = makeCache(defaultConfig())` —— 传的是硬默认，不是 `cfg`/`currentCfg()`
⇒ settings 层或 patch 层怎么写这两个键都到不了缓存。**且 `:1452-1453` 注释自陈"钉住默认以保稳定"**
⇒ 性质是"实现有意取舍 + 对外承诺未撤"，与裁决 5（放开生效）方向相反，属**已裁待改**而非未知缺陷。状态：有出入
★F-80 基本面**零覆盖**（外来件零测试）—— 扫过 `test/`(27 文件)+`scripts/`(31 文件)+`panel/manager/`+`registry/`+`contract/`+`doctor/`，
24 个关键词（`runSearch`/`engineList`/`requestedEngines`/`layerList`/`ENGINES`/`ENGINE_LAYERS`/`mergeRoundRobin`/8 个引擎函数名/
`makeCache`/`resolveProxy`/`cacheTtlMs`/`cacheMax`/`fetchUrl`/`unwrapUrl`/`parseDate`/`SETTINGS_NAMESPACE`/`web_search_engine`/`local-multi`/`local-fetch` 等）**全部零命中**；
现有触及全是**外围结构面**（`dual-channel-parity` 的 `name/inject/Config` 三元组、`loader-entry-resolution` 入口、
`panel-crossrefs` 字符串与 providers 对账、`s6-contract-migration` 的 1 键 schema 校验与 patch 镜像、门禁第 5 步按宿主语义校验真 patch 行、p1/p22/p23/p24 挂卸与卡行）。
⇒ 搜索行为、引擎链、缓存、HTML 解析**一面都没钉**。状态：有出入（开工令"测试空白区"之③）
★F-81 点名越部署名单（开工令高危②）—— `requestedEngines` 只对照 `ENGINES` 注册表、`runSearch` 里
`requestedEngines(searchReq) ?? engineList(cfg)` ⇒ 显式点名整体取代部署链；`ENGINES` 8 项含 `sogou`/`'360'`，
部署名单 `cordis.patch.yml:61` 6 项 ⇒ 点名未部署引擎照样真打外网。状态：有出入（我方直接实读，非引用）
★F-82 引擎注册表与部署配置两份名单并存且无对账 —— `ENGINES`(8) / `ENGINE_LAYERS.cn` / `defaultConfig().engines` 三处各自维护，
只有 `cordis.patch.yml` 那一份是"部署事实"；`requestedEngines` 的错误文案还把**全 8 项**当"known"打给用户
⇒ 与部署名单直接矛盾，会教模型去点未部署引擎。状态：有出入
**【2026-09-25 R3 笔落位读数 · F-81 与 F-82 的点名半边已修】** ① `requestedEngines(searchReq, cfg)` 追加与
`engineList(cfg)` 的交集判定：越界点名 ⇒ `WebError` 且**请求一次都不发出**（`test/web-search-local-engines.test.mjs`
以 fetch 观测面计数实证，含 `'360'` 字符串与 YAML 裸数字 `360` 两种形态、以及"混含已部署+未部署整体拒绝"）；
② 错误文案改列部署名单并点名 `not deployed`，`unknown search engine` 一支只留给能力表里真没有的名字；
③ **本条"会教模型去点未部署引擎"那半已一并收**：`web_search_engine` 的工具描述与 `tool:web_search_engine`
systemPrompt 段原以模块级 `Object.keys(ENGINES)` 枚举 8 项，现改由 `engineList(currentCfg())` 生成 ⇒
模型可见名单与点名闸**同源**（以注册时刻的生效配置为准）。反向对照已钉：把 `sogou` 真写进部署名单则点名
它必须放行 ⇒ 闸比的是部署面，不是把两个引擎写死禁用；`cordis.patch.yml` 一字未动 ⇒ 判据基准 `e8051fe9` 不滚存。
F-81 状态由"有出入"翻正为**已修复**；F-82 的"两份名单各自维护 + 无对账"那半**仍未清**（`ENGINES`/`ENGINE_LAYERS`/
`defaultConfig().engines` 三处副本没有一致性钉，属 W1/W7 面）。
**F-80 只收窄不清账**：本笔给引擎点名链补了 10 条用例（该条申报的"基本面零覆盖"由此**部分**改善），
但**搜索行为、缓存、HTML 解析、代理与跳转还原等其余面仍零钉** ⇒ F-80 状态维持"有出入"，待 W7 续补。
★F-83 逐插件健康面对本插件同样不可达 —— 它**没有** `healthCheck` 模块导出（H3），
且面板"健康"列对它恒不可达（F 表①-B 在案区）⇒ 与内置五卡同格。状态：有出入（并入 ①-B 健康格一起处置）
★F-84 模块级跨实例共享 —— `engineCooldowns:619`/`engineLastAt:620`/`probeCache:363`（10 分钟）都在**模块作用域**，
而 `cache` 随 `apply()` 每实例一份 ⇒ 同进程双实例会**共享冷却与节流、不共享结果缓存**（第二实例的限速会被第一实例带动）。状态：有出入
★F-85 `proxyMemo` 是 `WeakMap` 且以 cfg 对象为键（`:336/:347-352`），而 `currentCfg()` 每次**新建对象**（`:147`）
⇒ 该 memo 实际永不命中（**代理推断**，由对象身份得出，未实测）。状态：未核实
★F-86 `manifest.id` 与挂载名/行 id 三者不同字 —— `dsh.plugin.json:4` 写 `dsh/web-search-local`，
patch 行 id 与 `default.name` 都是 `web-search-local`；对内置无影响（宿主 patch 通道按 `name` 装载），
但经 registry 通道装它时 `reg.name-collision`/卸载台账按哪个名字记账须写明（`uninstall.mjs` 按 `lib/<dir>` 目录名）。状态：有出入（轻）
★F-87 `web_search_engine` 工具**无声明面** —— 实现在 `WSL:1351` 经 `ctx.get('tools').register(...)` 注册工具
+ `:1355` 一段 systemPrompt；而 manifest `registers` 根本没有 tools 槽、`commands:[]` ⇒ 契约缺表达（与 H3/批 10 同族，
provides 三槽也不含 tools）。状态：有出入：契约无表达
★F-88 未声明的依赖面 —— `inject` 只声明 `["web"]`，实现另开 `ctx.inject(['settings'], …)`（`:1443`）并
`ctx.get('tools')`/`ctx.get('systemPrompt')`（`:1351/:1354`）⇒ 三个未声明环境面（有 try/catch 兜底，但宿主是否保证在场仓内无契约可查；
`doctor仓:host-faces.json` 的 8 个面里也没有 `tools`/`systemPrompt`）。状态：有出入（与"未能确认"第 5 条同源，本条给出精确名单）
★F-89 `maxResults` 半死 —— 工具侧把 `maxResults` 当参数收（`:1368-1372` 参数表、`:1405` 常量 8），
但 `runSearch` 全程不读 `searchReq.maxResults`、缓存键 `` `${query}::${engines}` ``（`:1170`）也不含它
⇒ 调用方以为可调，实际恒由 `cfg.maxSources` 定；缓存键对引擎顺序与大小写敏感。状态：有出入
★F-90 `manifest.configSchema` 只 1 键而生效面是 14 键 —— 批 4 之后"模块导出赢"，面板与 registry 写回链按
`Config` 的 14 键校验；盘上 manifest 那份仍写 1 键 ⇒ **声明与生效不一致**（原稿 F-8 桶根同族，这里是子插件实例）。
`Config` 14 键逐个被读（含 `searxngBaseUrl`/`proxyUrl`/`skipWithoutProxy`/三类超时与冷却/`userAgent`），除 F-79 那两个之外无死键。状态：有出入
★F-91 剔除外来 MIT 件的耦合面（为两阶段目标第 2 步预置的清单，非缺陷）—— `package.json:29` 导出映射、
桶根 `dsh.plugin.json:66` alias、`cordis.patch.yml:58-61` 与 `:8` 的 `fetchProvider: local-fetch`、
`lib/search-router/index.js:36 DELEGATE_LOCAL="local-multi"` 硬编码 provider id、`panel/manager/{plugin-registry,snapshot,uninstall,custody}.mjs` 的表与按目录名 rmSync、
`doctor-signals.json` 的 `requiresProviders`、面板客户端与 `panel.html` 文案。**静态 import 桶内该模块者：零**（红线 1 已守）。状态：在案（开源前置工作项）

在案区（重建件）

注册面：`name:'web-search-local'`、`inject:['web']`、`Config`（default 对象与模块级双挂，为 H3 双通道一致）、
provider id `local-multi`/`local-fetch`（`ctx.effect` 内注册、dispose 摘除）、零命令、零 cordis 信道事件监听
（13 处 `.on(` 全是 socket/req/res 流监听，与 recon §10.4 的"必须锚 `ctx.on`"口径一致）、模块级具名导出 10 个。
缓存：纯内存 `Map`（无落盘），TTL 惰性判过期即删、容量按**插入序 FIFO**（`get` 命中不刷新序 ⇒ 不是 LRU），
只在有结果分支写回；`fetchUrl` 无缓存。配置层序"内置默认 → patch 行 → settings 节"（`resolveConfig` 两档 `{...defaultConfig(), ...section}`）。
归属：`snapshot.mjs` 的 `ORIGINS` 记 `origin:derived` / upstream `@gausszhou/dsh-web-search-local` / license MIT，
面板卡片如实显示作者与许可证（与 D 区"外来件保留原名归属"口径一致）。

我方抽验：F-79（`makeCache(defaultConfig())` 与注释逐字读）、F-81/F-82（`requestedEngines`/`runSearch`/`ENGINES`/patch:61 四处实读）。
其余为代理实读、未逐字复看 ⇒ 落批时先复算再钉。

### 续档后状态（覆盖账口径变化，协调侧须知）

1. 本节新增 **22 条**（F-69…F-91，F-83 与 ①-B 健康格共享），全仓 ★ 条目由 68 升至 **90**。
2. 令面"74 条星标落差"是**原稿口径**：原稿那 6 条差额内容从未到达，我的重建**多于且不限于**它 ⇒
   "正典清单 74/74 对账"（过裁二.2 收口件之一）**在补转到达前无法闭合**。两条路请裁：
   (a) 以本重建件为准，收口批改判"90/90 对账"；(b) 等原稿 ①-B/⑥ 到手做差集，再定终数。
3. 原稿"未能确认"第 1 条（React 三通道未真机点过）**在本节里被消掉一半**：F-69/F-70/F-75 已升为代码级事实，
   不需要真机即可定性；仍需真机的是"用户视角症状确认"，已排在批 8 观察窗。
4. 原稿"未能确认"第 2 条（宿主读不读桶根 manifest 的 `panels`/`slot`/`order`/`managedBy`）**未消**：仍在两仓之外，
   本次只补了一条相邻事实——`snapshot.self` 显示宿主对面板行取的是 `file:///…/panel/index.js`（按 name 装载，与 `panels` 无关）。
   该格保留"未核实"，并作为 P-2 之外的第二个用户侧/开源后动作项。