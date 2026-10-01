# compact-router（压缩路由）

`dsh-toolkit/compact-router`（manifest id `dsh/compact-router`）——上下文压缩引擎：
对话变长时自动压缩历史内容，省上下文又不断片；压缩方式有**自动、LLM 摘要、即时抽取**三种，
可随时切换（权威卡面文案）。

## 它做什么（代码实况）

- **compaction 服务**：向宿主提供 `services: [compaction]`——压缩引擎经宿主服务面被调用
  （`compactIfNeeded` 等语义）；并是 rate-throttle 降档压缩的默认消费引擎（其
  `instantOnceFor()` 接缝取 LLM 免费即时模式）。
- **五条命令**：`compact-mode`（切模式）／`compact-llm`（LLM 摘要）／`compact-instant`
  （即时抽取）／`compact-auto`（自动）／`compact-archive`（归档）。
- **依赖注入**：`inject: [llm, tokenMeter, sessions, commands]`（LLM 摘要模式取模型、tokenMeter
  测量、会话面取历史）。
- **与 agent-memory 的协作**（`optionalDeps`，缺席可降级）：`guidance.js`／`agent-memory.js`
  在压缩出口读取台账新鲜度并注入 [永久] 指令节选（checkpoint 正典副本路径）；台账过期时提示
  先刷新台账再压缩（压缩是清上下文动作，注入节选是新上下文的组成部分）。
- **归档**：`archive.js` 承接压缩产物的归档面。

## 配置与挂载

- **无 configSchema 条目**（manifest `configSchema.dict` 为空）——部署不传 config。
- **预设托管挂载**：本插件**不在** `cordis.patch.yml`——由 `scripts/apply-preset-patch.mjs`
  改写宿主预设（agent.cordis.yml）的 compaction 行名挂载；改动要随预设重启才生效（面板卡面
  同款提示口径）。

## 测试

- `test/compact-router*.test.mjs` 家族（模式切换/即时抽取/归档/与 agent-memory 集成）。

---
*本 README 由 EXE-BOOT-010 续用批按用户基本要求令补齐（2026-09-28）；内容以仓内实况为据
（manifest／index.js 等源码／预设改写脚本），不发明功能。*
