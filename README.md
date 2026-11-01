# xiaobai-agent（DSH 工具箱）

`xiaobai-agent`（manifest id：`dsh/toolkit`）是运行在 DSH 宿主中的插件工具箱，当前包版本为 `1.3.0`。它提供模型请求换源与限流、上下文压缩、本地记忆台账、子卡模型跟随，以及插件注册、健康检查、Web 管理面板和多代理输出/写权治理（输出闸门），共携带 12 个子插件。

本项目面向希望降低模型使用成本、减少免费 API 限额影响，以及需要对多代理输出与写权做治理的 DSH 用户，尤其适合轻量化任务。**它不是独立应用，也不是一个自带任务规划与工具执行循环的通用 AI Agent；模型、对话和工具体系由 DSH 宿主提供。**

## 一、能力边界

- 多账号/多模型换源的效果取决于可用 provider、model 和 API key 的数量；key 太少时，冷却与换源的作用有限。
- 故障处理主要针对 RPM/TPM 限流，不代表任意网络错误、鉴权错误或服务端故障都能自动恢复。
- agent-memory 是本机文件台账与关键词检索，不是向量数据库或语义记忆。
- 治理模块主要生成报告、分层建议和清理计划，不会自动卸载插件或清理配置。
- governance-output-gate 随套件装配挂载全部四个入口（开关、状态判官、文本门、工具门）；**缺省 OFF**，经 `/gate on` 按工作区启用后才进行文本扣留与写权拦截。
- 本项目更适合小微任务和成本优化，不承诺批量化大任务所需的完整可靠性。

## 二、安装与启用

### 1. 准备宿主与模型

需要兼容的 DSH 宿主和 Node.js `>=22`。具体 DSH 版本范围以根 `package.json`、`dsh.plugin.json` 及各子插件 manifest 为准。

在 DSH 自带的模型配置页面配置 provider、model 和 API key。本工具箱不提供 API key，也不会自动创建模型账号。

如果你使用的是**已经正确部署本工具箱的 DSH**，配置模型后即可照常对话，并通过面板查看插件状态与体检结果。

### 2. 挂载工具箱

当前有两类部署通道：

- **bundle 通道**：根 `bundle.patch.yml` 是零占位符入口，根 `package.json` 的 `dsh.bundle.patch` 继续拼接各子插件 patch。
- **模板/patch 通道**：源码仓的 `cordis.patch.yml` 保留部署占位符 `<AGENT_MEMORY_DATA_ROOT>` 和 `<PANEL_ENTRY_URL>`，部署时必须替换为当前环境的真实值，不能原样用于生产。

不同 DSH 分发形态的安装入口并不相同，请按所用宿主的 bundle/preset 机制安装本包；本仓库不是一个用 `npm start` 独立启动的服务。根 `package.json` 的发布 `files` 未包含 `cordis.patch.yml` 和 `scripts/`，因此使用发布包时不能假设模板与预设脚本会随包提供。

**从 GitHub 第一次部署（最小路径）**：把本仓库克隆或解压到本机任意目录（下称 `<套件目录>`），在所用 DSH profile 的 `cordis.patch.yml` 里参照源码仓 `cordis.patch.yml` 与各 `lib/*/bundle.patch.yml` 的 insert 行，以 `file:///<盘符>/<路径>` 形态挂载需要的入口，替换 `<AGENT_MEMORY_DATA_ROOT>` 与 `<PANEL_ENTRY_URL>` 两个占位符后重启宿主；需要输出闸门时再以 `/gate on` 按工作区启用。git clone 与 zip 下载的换行形态不影响运行，只影响仓内回归脚本——`scripts/p22-verify.mjs` 与 `scripts/p24-verify.mjs` 已做换行归一，两种形态都能跑。

### 3. 单独启用 compact-router

compact-router 不在根 patch 中。源码仓部署时，需要用它替换预设里的 compaction-basic：

```bash
# 查看当前预设状态
node scripts/apply-preset-patch.mjs --status

# 备份并应用预设修改
node scripts/apply-preset-patch.mjs

# 如需回退
node scripts/apply-preset-patch.mjs --undo
```

该脚本会修改 DSH 配置：旧通道修改预设的 `agent.cordis.yml`，0.2.x 通道修改目标 profile 的 `cordis.patch.yml`；多 profile 环境应使用 `--profile <name>` 明确目标。应用前应核对 `--status` 输出和目标环境，修改后需要重启宿主。没有压缩成员的预设会跳过，形状不符合预期的预设会拒绝修改。

### 4. 验证部署

```bash
node doctor/cli/src/cli.mjs --json --scope .
```

部署后还应在真实 DSH 宿主中确认：面板可以打开、rate-throttle 已挂载、compact-router 已进入目标预设；如需记忆台账，还应显式启用 agent-memory 并确认其数据根可写。

## 三、12 个子插件的真实功能

| 子插件 | 当前实现与默认状态 |
|---|---|
| **rate-throttle** | 在同模型族候选中选择 provider/model，处理 RPM/TPM 429、出错冷却、学习限额，并可触发降档压缩和写回故障转移后的模型选择。随套件 bundle/cordis patch 部署时，换源路由开启、主动请求限速关闭；单独挂载且未提供配置时不能直接套用这组默认值。没有可用候选时无法换路。 |
| **compact-router** | 继承基础压缩引擎，提供 `auto`、`llm`、`instant` 三种摘要方式及会话切换命令。`auto` 优先 LLM，仅在限流类错误时降级为本地抽取；`llm` 不自动降级；`instant` 不调用模型。压缩前可写有界原文存档，但存在容量、逐消息截断和保留份数限制，不等于绝对无损。 |
| **agent-memory** | 启用后可自动建立新会话台账，采集用户消息，记录心跳、标题、生命周期状态和少量模型切换信息；提供文件锁、原子写、备份、关键词索引和面板搜索。**bundle 通道当前默认 `disabled:true`，模板/patch 通道未默认禁用。** 每条已入册主会话的用户消息压缩空白后最多保留 300 字，不自动采集助手与工具输出。指令分栏使用正则，检索使用子串匹配。恢复内容是否自动进入提示词，还取决于部署模板是否实际引用 `agent_memory` 变量。 |
| **agent-model-follow** | 将 Team Lead 最新的 provider/model/effort 扇出给存活子卡，并提供部分状态恢复。Team、Lead 或子卡不可用时会跳过，不保证所有历史子卡立即完成切换。 |
| **governance-preflight** | 启动时扫描根/子 manifest、patch 行和声明面，生成结构化预检报告；不持续监听，也不自动修复。 |
| **governance-context-audit** | 读取当前活动会话的 tokenMeter 快照、usage ledger 汇总和插件 manifest 的 inject 声明数量，生成上下文与用量报告。它不是逐项 skill/MCP token 成本核算器，启动时没有活动会话就无法得到逐会话读数。 |
| **governance-overlap-detect** | 检查重复 service/command/provider/entry，并用 Jaccard 文本相似度发现可能的 skill 重叠。结果属于启发式提示，不是模型语义裁决，也不会阻止重复注册。 |
| **governance-usage-track** | 读取已有 usage ledger，生成 provider/model 日序列、频次分层、趋势和僵尸候选。它不在后台持续记录实时用量。 |
| **governance-tiering** | 读取 usage-track 报告，将条目划为 core/active/idle/review，生成保留与卸载候选建议；不直接修改配置。 |
| **governance-cleanup** | 将 tiering 的 review 候选整理为带步骤、审批和回滚说明的清理计划。所有计划均为 `autoExecutable:false`，本插件不删文件、不改配置、不执行清理。 |
| **governance-router** | 配置规则后，按优先级和正则匹配用户文本，将对应 skill 正文追加到请求上下文，并提供会话去重和每回合上限。默认 `rules:[]`，因此默认不注册监听、不注入技能。它是技能上下文路由，不是模型路由。 |
| **governance-output-gate** | 注册 `/gate on/off/status/ctx/root`，保存工作区开关和额外根配置。四个入口（root 开关 / gate-guard 判官 / gate-text 文本门 / gate-tools 工具门）均随套件装配挂载，装配一致性由 `test/governance-output-gate-assembly.test.mjs` 钉住。**缺省 OFF**；`/gate on` 后按工作区进行文本扣留、双判官审核、`send_report` 审批与写权拦截。 |

## 四、工具箱本体提供什么

### Registry 与契约

支持显式本地目录或 `.js/.mjs` 插件的解析、安装、状态恢复、配置校验、启停、重载、卸载、失败重试和隔离状态。它不是 npm 插件市场，也不会自动扫描任意目录发现插件。工具箱及内置 12 个子插件经宿主 patch/预设挂载，不进入 registry 状态面；registry 管理的是另行安装的插件。

**只安装自己信任的插件。** 安装解析会动态 import 插件代码，且发生在完整预检之前；预检不是安全沙箱，不能阻止模块顶层代码执行。

### Doctor

Doctor 有两个使用面：

- 进程内健康检查：按 manifest 和自定义规则巡检运行环境与服务状态，只报告，不自动修复。
- 独立 `dsh-doctor` CLI：扫描 manifest、patch、热配置和 profile，默认 dry-run；`--apply` 与 `--rollback` 才进入写盘流程，并带备份和状态记录。

部分只读探针仍会执行二进制版本命令、绑定本机端口或请求 URL，不能理解为完全无副作用的纯文本扫描。

### Web 管理面板

面板提供插件安装、启停、重载、卸载、配置、健康历史、patch 计划与执行、备份、软卸载恢复、真卸载、记忆搜索、治理报告，以及 SSE/轮询更新。

HTTP 仅接受 loopback 连接。逐字确认用于防止误操作，不是身份认证；本机其他进程可能直接调用本机管理接口。真卸载会删除插件源码且不留源码副本，与可恢复的软卸载不同，执行前必须确认。

## 五、数据与写盘边界

- agent-memory 默认把 Markdown、JSON 和 JSONL 数据保存在 `~/.agent-memory`，也可通过配置或环境变量修改；内容为明文，不应写入不希望本机持久化的秘密。
- compact-router 的压缩存档与 agent-memory 使用相应数据根，受存档容量和保留策略限制。
- governance 报告默认写入工具箱目录下的 `.toolkit-governance/`。
- output-gate 的开关状态保存在 `~/.dsh/output-gate.json`；缺省 OFF，经 `/gate on` 按工作区启用。
- 面板、doctor CLI 的 apply/rollback、预设修改脚本和真卸载都可能写盘，使用前应查看计划、备份与回滚边界。

## 六、常用命令

```bash
# 安装锁定依赖
npm ci

# 构建、lint、类型检查与 Node 测试
npm test

# 19 个专项回归面及 Node 测试
npm run regression

# 完整本机门禁；环境依赖失败时必须如实报告
node scripts/ci-local.mjs --with-scan

# Doctor JSON 报告（默认 dry-run）
node doctor/cli/src/cli.mjs --json --scope .

# Doctor 回滚链摘要
node doctor/cli/src/cli.mjs --states
```

`npm test` 通过不等于完整 `ci-local --with-scan` 已通过；后者还依赖本机/runner 的 DSH 安装、配置根和 profile 等环境。提交时应分别报告各命令的真实结果，不应静默跳过失败项。

## 七、目录地图

```text
lib/          12 个子插件及各自 manifest/patch
panel/        管理面板服务端、客户端与兜底页面
registry/     插件注册、装载、状态与恢复
contract/     清单与配置契约（TypeScript）
doctor/       进程内 doctor、独立 CLI 与自测
scripts/      预设修改、门禁和专项回归脚本
test/         Node 测试与 fixtures
docs/         契约、迁移、债务和功能清单
```

修改源码前请阅读 `AGENTS.md`。跨插件静态 import、eager re-export、兄弟插件缺席时的降级，以及构建、测试、regression、doctor 和 patch 配置校验，都属于本仓库的重要约束。
