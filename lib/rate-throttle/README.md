# rate-throttle（速率限制与换源路由）

`dsh-toolkit/rate-throttle`（manifest id `dsh/rate-throttle`）——在多个模型服务之间
自动换路、出错冷却与降档压缩，避开限额和故障；另有请求限速开关（默认关闭）（权威卡面文案）。

## 它做什么（代码实况，v3）

- **限速层（默认关闭）**：请求发出前按 provider 限速（`minIntervalMs`／
  `maxRequestsPerMinute`／自适应退避 `backoffFactor`）。部署 patch 行 `enabled: false`
  ——即卡面"请求限速开关（默认关闭）"的实况；代码缺省为 `enabled !== false`（不传 config
  时开启），部署值以 patch 行为准。
- **换源路由层（部署 `enabled: true`）**：同一模型族的多账号互为备胎——
  - **自动分组**：从宿主模型目录自动发现同族账号（`listProviders`/`listModels`＋家族名归一
    化），`staticGroups` 可覆盖；用户**当前手选**是最强锚点，健康时永不换。
  - **冷却分型**：RPM/配额 429 冷却账号（`cooldownMs`）；TPM 429 短流放（`tpmCooldownMs`
    缺省 45s）＋当回合跳过。
  - **硬安全过滤**：上下文档位是硬闸——1M 档绝不降到 256K，除非实测余量装得下；一侧未知
    永不互备；装不下先降档压缩（每回合至多 `maxDowngradeCompactsPerTurn` 次，优先借
    compact-router 的 LLM 免费即时模式）。
  - **换路写回**：切换后把实际目标写回会话 `model/selection` 让前端同步；**不改默认模型**
    （默认只随用户手选变）。
  - **重试协同**：llm-retry 的重试再入管道时，同一 `turn×step` 的重复派发视为上次失败——
    跳过上一把实际用掉的 key，换路落在下一个健康候选。
- **可观测面**：请求/错误（含 429 时刻 rpm/tpm 快照）/降档压缩/周期 provider-metrics 全量落
  `~/.dsh/logs/llm-requests.jsonl`（JSONL，追加；`logPath: 'none'` 可关）；学习到的厂商限额
  落 `~/.dsh/dsh-rate-throttle-learned.json`；热配置 `~/.dsh/dsh-rate-throttle.json`
  （声明限额/排除名单/别名）。**五插件中唯一带文件日志的诊断面先例**（agent-memory 自日志
  2026-09-28 起对齐此惯例）。

## 配置（manifest configSchema 全集）

顶层：`enabled`／`throttleProviders`／`minIntervalMs`／`maxRequestsPerMinute`／`adaptive`／
`maxIntervalMs`／`backoffFactor`／`logProviders`／`logPath`；
`routing{enabled, autoGroups, autoGroupTtlMs, cooldownMs, tpmTurnSkip, tpmCooldownMs,
downgradeContextMargin, maxDowngradeCompactsPerTurn, metricsWindowMs, metricsLogIntervalMs,
clearCooldownOnUserSwitch, syncSelectionOnFailover}`（另有 `staticGroups`/`excludeProviders`
等仅部署面键，patch 行配置）。

## 部署实况（cordis.patch.yml）

`enabled: false`（限速层关）、路由层开＋自动分组，`excludeProviders: [llm-deepseek,
deepseek-official]`，静态组 `v4-pro`／`v4-flash` 各若干账号；`inject: [llm, tokenMeter]`。

---
*本 README 由 EXE-BOOT-010 续用批按用户基本要求令补齐（2026-09-28）；内容以仓内实况为据
（manifest／index.js 源码头注／cordis.patch.yml），不发明功能。*
