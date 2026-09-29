# agent-memory（智能体内存台账）

`@local/dsh-toolkit/agent-memory`（manifest id `dsh/agent-memory`）——跨会话的记忆台账：
新对话自动注册，指令逐消息入账，任务进度与里程碑落盘，任何模型接手时以文件为准恢复现场。

## 它做什么（代码实况）

- **会话注册**：`session/created` → 新会话入册 `registry.json`（宿主 UUID 经归一化派生 sid，
  `YYYYMMDD-<12 位 hex>`；重复事件幂等）。
- **指令台账（ledger.md）**：`agent/inbox/claimed` → 指令性消息追加台账待办区（编号 `L-000`
  起三位零垫；条目状态 待办/进行中/已完成/已搁置 流转；32 KB 上限、超限移最早已完成入
  archive；历史只追加不改写，勘误走结构化 erratum）。
- **进度文件（progress.md）**：里程碑追加（完成步骤/当前状态/下一步/关键决定/文件，自动带
  workspaceRoot）；32 KB 上限、关键三区块保留。
- **移交与工作区**：跨工作区续写禁止（WORKSPACE_MISMATCH）；交接须 `handedOverTo`（旧会话
  即拒写，继任可写编号自起）。
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

- **R2/R3 已兑现**：progress 专司任务进度；ledger 分栏（待办/进行中/已完成/已搁置）＋折叠
  ＋归档。
- **R1 有落差**：台账只收**指令性**消息（`runtime.isInstructionText` 启发式），日常对话不入
  账——"记录全部输入"未达成（结构性缺口①在案：`docs/repair-plan-20260923.md` §33；候用户
  产品方向拍板：修文案 vs 扩功能）。
- **R4/R6 有落差**：记忆**自动回灌模型上下文**未见实现——现有最接近面是 `buildRecoveryReport`
  （库导出，供调用方主动拉取，无自动接线）与压缩场景的 [永久] 行注入节选（compact-router
  checkpoint 路径）；新会话自动注入提示词未实现（结构性缺口②在案：计划 §33，候拍板）。
- 其余用户设计时要求：待用户补充后在此记账并实现（见下节）。

## 待补充要求

（预留节——用户后续补充的设计时要求逐条落此，随录随实现、差距如实注。）

## 配置与挂载

- `configSchema`：`dataRoot`（数据根，缺省 `~/.agent-memory`，环境变量 `AGENT_MEMORY_ROOT`
  可覆盖）、`defaultWorkspace`。
- 部署行（`cordis.patch.yml` id `agent-memory-runtime`）：`dataRoot: C:\Users\LENOVO\.agent-memory`、
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
| `logs/agent-memory.jsonl` | 插件自日志（五事件行；`.1` 为轮转前档） |
| `.locks/` | 会话/注册表写锁（mkdir 原子锁，死锁自动清理） |

## 测试与边界

- 测试：`test/agent-memory.test.mjs`（A/B/C/D/E/F/G/L/W/R/PERM/CAP/SIDNORM/RUNTIME/PLUGIN/
  WIRE/P/P8/RB/WH/HF 族）＋`test/agent-memory.lifecycle.test.mjs`（LC1/LC2 整轮钉）＋
  `test/agent-memory.selflog.test.mjs`（自日志 11 格）＋`test/agent-memory.tmp-sweep.test.mjs`
  （.tmp 回收 5 格）＋`test/agent-memory.compact-router.integration.test.mjs`。
- 边界：跨工作区续写禁止；销毁后写拒；生产根 `~/.agent-memory` 的 `.tmp` 回收只清
  `.tmp-<pid>-<hex>` 形状文件（目录不碰、60s 年龄闸防误扫在飞文件）。

---
*本 README 由 EXE-BOOT-010 续用批按用户基本要求令补齐（2026-09-28）；内容以仓内实况为据
（manifest／runtime/ledger/progress/registry/selflog 源码），不发明功能；设计要求六条为用户
原文照录。*
