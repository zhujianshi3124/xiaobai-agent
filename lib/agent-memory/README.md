# agent-memory（智能体内存台账）

`xiaobai-agent/agent-memory`（manifest id `dsh/agent-memory`）——跨会话的记忆台账：
新对话自动注册，指令逐消息入账，任务进度与里程碑落盘，任何模型接手时以文件为准恢复现场。

## 它做什么（代码实况）

- **会话注册**：`session/created` → 新会话入册 `registry.json`（宿主 UUID 经归一化派生 sid，
  `YYYYMMDD-<12 位 hex>`；重复事件幂等）。
- **指令台账（ledger.md）**：`agent/inbox/claimed` → 用户输入逐消息全量入账（R1，EXE-BOOT-011
  施工笔2）：指令性消息追加待办、非指令消息入「一般输入」栏（编号 `L-000` 起三位零垫、
  全栏共享连续；条目状态 待办/进行中/已完成/已搁置 流转，「已记录」只追加；32 KB 上限、
  超限先移最早已完成、再移最旧一般输入入 archive；历史只追加不改写，勘误走结构化 erratum）。
  自日志 claimed 行带 kind（instruction|general）。
- **进度文件（progress.md）**：里程碑追加（完成步骤/当前状态/下一步/关键决定/文件，自动带
  workspaceRoot）；32 KB 上限、关键三区块保留。
- **移交与工作区**：跨工作区续写禁止（WORKSPACE_MISMATCH；win32 大小写归一比较）；调用方
  工作区自宿主会话 `session.header.cwd` 取数（逐环回落、命中环随自日志 `wsRing` 落行——
  EXE-BOOT-011 施工笔1）；交接须 `handedOverTo`（旧会话即拒写，继任可写编号自起）。
- **记忆注入（R4/R6 接线，EXE-BOOT-011 施工笔3）**：`agent_memory` 系统提示词变量——每次
  装配注入恢复要点节选 `buildRecoveryBrief`（任务摘要/未完成指令 ≤8 条/永久指令/新鲜度，
  ≤1200 字符；未注册会话空串零负担；面不在位不注册、回调异常降级空串，挂载与请求零破坏）。
  预设模板 `{{agent_memory}}` 行＝部署步骤（2026-09-29 用户令批：例行部署写入径行、批末申报）。
- **新鲜度门禁**：`agent/pre-step` 心跳刷 `lastActiveAt` 与台账 heartbeatTurn；接手前 3 模型
  回合内视为新鲜，超限 `FRESHNESS_STALE`（提示刷新，不硬阻断步进；硬拦截语义由
  `assertFreshForHandover`＋调用方决定）。
- **[永久] 指令区**：台账固化常驻指令（默认两行配方）；checkpoint 正典副本＋冷启动恢复双路
  冗余；模型切换时自然触发在场监测。
- **checkpoint 在场证据日志**：压缩场景的 [永久] 双行在场/缺席结论 →
  `sessions/<sid>/checkpoint-evidence.jsonl`（节流 JSONL：翻变必写、同结论 24h 内不重复）。
- **冷启动恢复**：`buildRecoveryReport`（库导出）——只读文件为准，汇总台账概览/未完成指令/
  里程碑/心跳。
- **插件自日志**（2026-09-28 新增）：`logs/agent-memory.jsonl` 五事件行（register 每启动实例
  在位自证＋created/claimed/pre-step/disposed，带 sid 解析原因码）；pre-step 节流（翻变必写、
  同结论 60s 抑制）＋2 MiB 单档轮转；落盘失败降级 emitWarning、宿主零感知。每次挂载启动清扫
  超龄 `.tmp-<pid>-<hex>` 孤儿（原子写失败路径也即时清理）。

## 设计要求（用户 2026-09-28 亲口原文，权威"应然"基准）

> R1 自动记录用户的全部输入（ledger 专司）；
> R2 自动记录插件自己的任务进度（progress 专司）；
> R3 用户输入分栏记录（待办/已完成/进行中等）；
> R4 任何模型接手任务，第一件事必须读取记忆记录；
> R5 插件自己要有文档（本 README 即 R5 的兑现）；
> R6 新开会话时，模型必须在用户提供任何输入之前、或第一条输入之后立刻读取记忆记录
> （提示词注入；与 R4 一脉相承、更具体）。

## 现状 vs 要求（差距如实注，不粉饰）

- **R1/R2/R3 已兑现**：progress 专司任务进度；**R1 全量采集**（EXE-BOOT-011 施工笔2，用户
  批甲案）——全部用户输入入账，指令性→待办、非指令→「一般输入」栏分栏记录。一般输入栏
  **机器钉盖**（D11-13/RUNTIME2/SELFLOG-L1 族钉），非指令消息自此走 collected kind=general
  （修前为 skipped:not-instruction 不入账）；自日志活体已证 kind:instruction 侧，**general
  活体实例暂零**（修后至今无非指令 claimed 发生，属自然未发生非缺陷，路径有钉覆盖——
  2026-09-29 收官注如实记）。
- **R4/R6 注入现场验证（2026-09-29 收官注更正本行旧述"候用户批准/尚未端到端点亮"）**：
  `agent_memory` 系统提示词变量每次装配注入恢复要点节选（变量名自 camelCase `agentMemory`
  改名合规——事故处置见「升级与宿主触点」表 #2/#3）；预设模板 `{{agent_memory}}` 行已落盘
  （写前双侧预验），**验收窗全绿＝端到端点亮**：两次宿主启动 register 全挂、claimed
  collected＋wsRing:header＋kind 落行（自日志实证）、模型首请求即见【会话记忆】节并可复述
  （用户回报在案）。旧述原文照录于 CHANGELOG 2026-09-29 施工批节，以本注为准。
- **R5 已兑现**：本 README。
- **检索半边已兑现（S4 F-37，2026-10-01）**：面板新增「记忆检索」独立卡（`GET /v2/memory/search`，
  只读闸）——跨全部会话（含已归档/已移交）子串检索台账/进度/档案，含「一般输入」栏；
  只读（三正本零改动＝硬红线）、零外传（零 fetch 零遥测）、**移交制维持**（检索帮你找，
  接手新会话仍需走移交确认，绝不自动注入）。R1（记下）＋R6（注入要点）＋检索（找得到）
  ＝面板承诺"记住你说过的话…下次对话还能用上"的诚实闭环（feature-inventory ★172 随批翻正）。
- 其余用户设计时要求：待用户补充后在此记账并实现（见下节）。

## 待补充要求

（用户后续补充的设计时要求逐条落此，随录随实现、差距如实注。）

- **相同指令去重**（用户 2026-09-29 指定，候后续批）：同一文本的指令性消息重复到达时不
  重复建条（同文本待办去重；去重判据候施工期定——如"活跃待办中已有逐字同文条目则不新建、
  只随原条记时间"）。
- **分栏判据精度**（用户 2026-09-29 指定，候后续批）：`isInstructionText` 分栏判据精度
  观察——现行正则含单字"请"（`lib/agent-memory/lib/runtime.js` INSTRUCTION_RE），"请问…"
  "请介绍…"类礼貌问句一律命中入待办；是否加细（问句/请求语气分级、观察期先行）随活体
  观察结论立项。

## 升级与宿主触点（DSH 升级时照单核查；EXE-BOOT-011 施工令二.1 随批落）

本设计贴宿主内部面的全部触点逐项列出。**宿主升级若变了下表任一项，对应功能会坏；坏了经
"经何观测"列的通道显性暴露（自日志行/变量空值/真机窗），不静默潜伏。**

| # | 触点 | 依赖什么 | 宿主升级若变会怎么坏 | 坏了经何观测 |
|---|---|---|---|---|
| 1 | `session.header.cwd`（工作区取数，plugin.js wsInfoOf 第一环） | 安装版宿主 Session 实例把 cwd 放 header（`dsh-system-prompt`/agent-loop 自用取法同源） | 取不到 → 逐环回落 session.cwd→agent.workspace→defaultWorkspace→process.cwd()；命中环降级为 fallback:*，老病复发（闸拦跨启动续写） | 自日志 created/claimed 行 `wsRing` 非 header 即亮红灯；真机窗＝跨启动发指令看 collected |
| 2 | `ctx.systemPrompt.variable` 注册接口（agent_memory 变量，案 C） | patch 行 `inject: [systemPrompt]` 解析到宿主 systemPrompt 服务面；**变量名须过宿主 `VARIABLE_NAME` 正则 `/^[a-z][a-z0-9_]*$/`（全小写 snake_case，dsh-system-prompt lib:57 插值侧＋lib:296 注册侧同正则校验、非法即抛）**——禁止 camelCase | 面不在位 → 变量不注册：若预设模板已有引用 ⇒ 渲染侧 unknown/malformed 变量**抛错**（每请求崩）；注册名违规 ⇒ 注册侧抛错（插件 fail-soft 吞成告警）而模板行在渲染侧爆（2026-09-29 事故实况） | 挂载期 emitWarning（"面不在位"/"变量注册失败"）；真机窗＝首请求即崩＝立查本行 |
| 3 | 预设模板 `{{agent_memory}}` 行（部署写入，2026-09-29 已落） | persona 前缀文本引用变量；**命名正则＝`/^[a-z][a-z0-9_]*$/`（写前必验：正则＋与在册变量撞名排查——provider/model/cwd/workspace_instructions 均不撞）**；与触点 2 强耦合、同进同退（卸载插件前必须先回退模板行，否则请求全崩） | 引用名违规/插件缺席 ⇒ 渲染侧抛错 | 首请求报 malformed/unknown prompt variable 错误 |
| 4 | `agent/inbox/claimed` 载荷形状 `{message, turn}`＋dispatcher 注入 agent（采集链输入） | 宿主 agent-loop 发射点（fused 注入 agent） | 载荷字段变 → sid/正文/turn 取不到 → claimed 行 code=no-host-id/no-message 或 skipped | 自日志 claimed 行原因码 + 零 collected；真机窗台账零增长 |
| 5 | compact-router guidance/正典装载位（案 D：readLedgerItems 三栏采集） | compact-router 压缩出口懒加载 agent-memory lib（可选依赖，缺席降级） | 装载失败 → 压缩产物退回启发式区段（不崩、但记忆要点缺席） | 压缩产物无「正典副本」节；console info "optional peer unavailable" |
| 6 | doctor `src/host-faces.json` 面清单（systemPrompt 已补录） | doctor inject-face-unknown 规则以清单为准 | 宿主新版本增删面 ⇒ 清单过时 → doctor 误报/漏报 | doctor dry-run issues 非 0/0/0 即照单核查清单 |

## 备而未用清单（升级有路可循、不丢线索；施工令二.3 随批落）

- **存量 currentWorkspace 批修脚本（呈报案 E b）**：按宿主会话桶名逆推真值校正 registry 历史记录——
  **用户批 Ea（存量不动、老会话走现成 handoverToWorkspace 一致性检查＋用户确认）**，本脚本备而不做；
  将来做时桶名↔cwd 逆推规则须先以宿主源码核实。
- **llm-face 中间件注入（呈报备选案 3）**：agent-memory 声明 `registers.inject:[llm]` 首请求注入——
  与案 1 覆盖重叠、功能更重，呈报不推荐，未做。
- **子代理会话支持**：子代理宿主 id 未入册 → claimed 行 skipped:no-sid（现状如实）；R1 口径
  ＝全部**主会话**输入。候用户产品方向再议。
- 「待补充要求」节：现空，用户后续条目随录随实现。

## 数据迁移纪律（施工令二.4 随批落，先例口径）

将来 registry/台账结构变更一律**备份＋可逆**：变更前对目标文件整档快照（根外备份，先例
`backupTreeBeforeRemove`/面板 custody 路径）；写入走原子写；失败路径即时清理 tmp；提供
逐字节回退（E b 先例纪律）。schemaVersion 字段已备（ledger/progress 头部），格式变更先升
版本号再迁移（迁移三步顺序 migrate→verify→cleanup 钉在 M1-M2）。

## 配置与挂载

- `configSchema`：`dataRoot`（数据根，缺省 `~/.agent-memory`，环境变量 `AGENT_MEMORY_ROOT`
  可覆盖）、`defaultWorkspace`。
- 部署行（`cordis.patch.yml` id `agent-memory-runtime`）：`dataRoot: <AGENT_MEMORY_DATA_ROOT>`
  （部署时填空的占位符；不填则用缺省 `~/.agent-memory`，环境变量 `AGENT_MEMORY_ROOT` 可覆盖）、
  `defaultWorkspace: null`（工作区取数：宿主会话 `session.header.cwd` 优先、逐环回落，
  命中环随自日志 `wsRing` 落行——EXE-BOOT-011 施工笔 A 更正本句旧表述"工作区由事件载荷携带"
  ＝与安装版宿主实况不符；定因与触点详见下文「升级与宿主触点」节）。
- 订阅事件（7）：`session/created`、`agent/inbox/claimed`、`agent/pre-step`、`session/event`、
  `agent/request-error`、`agent/request`、`session/disposed`。

## 数据与日志位置（`<dataRoot>` 下）

| 路径 | 内容 |
|---|---|
| `registry.json` | 会话注册表（含 dshSessionId、工作区、状态、心跳） |
| `sessions/<sid>/ledger.md` | 指令台账（分栏） |
| `sessions/<sid>/progress.md` | 任务进度/里程碑 |
| `sessions/<sid>/archive.md` | 超限移出的历史条目 |
| `sessions/<sid>/checkpoint-evidence.jsonl` | [永久] 在场证据（节流 JSONL） |
| `search/` | **检索派生缓存**（S4 F-37：MANIFEST.json＋逐会话段；可再生，可整目录删除自愈，超限即弃；三正本永不写回） |
| `logs/agent-memory.jsonl` | 插件自日志（五事件行；`.1` 为轮转前档） |
| `.locks/` | 会话/注册表写锁（mkdir 原子锁，死锁自动清理） |

## 测试与边界

- 测试：`test/agent-memory.test.mjs`（A/B/C/D/E/F/G/L/W/R/PERM/CAP/SIDNORM/RUNTIME/PLUGIN/
  WIRE/P/P8/RB/WH/HF 族）＋`test/agent-memory.lifecycle.test.mjs`（LC1/LC2 整轮钉）＋
  `test/agent-memory.selflog.test.mjs`（自日志 11 格）＋`test/agent-memory.tmp-sweep.test.mjs`
  （.tmp 回收 5 格）＋`test/agent-memory.compact-router.integration.test.mjs`＋
  `test/agent-memory.search.test.mjs`（SEARCH-1..12 检索索引：建/更/自愈/弃置/排除面/
  三正本零触碰硬红线钉）。
- 边界：跨工作区续写禁止；销毁后写拒；生产根 `~/.agent-memory` 的 `.tmp` 回收只清
  `.tmp-<pid>-<hex>` 形状文件（目录不碰、60s 年龄闸防误扫在飞文件）；检索索引只读三正本
  （ledger/progress/archive），checkpoint-evidence.jsonl 与 `logs/` 不入索引。

---
*本 README 由 EXE-BOOT-010 续用批按用户基本要求令补齐（2026-09-28）；内容以仓内实况为据
（manifest／runtime/ledger/progress/registry/selflog 源码），不发明功能；设计要求六条为用户
原文照录。*
