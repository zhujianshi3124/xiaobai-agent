# P2.4 施工批 1 · 测试计划 + 弹窗/确认页文案全稿（呈判定侧预审）

> 状态：待判定侧预审 + 用户批准框架后开工。当前零代码写入。
> 依据：panel/docs/p24-design.md v1 验收裁决（§12）；P24-EVIDENCE.md §①③⑤。
> 流程补强：弹窗/确认页文案全稿与测试计划同步预审，P2.2「重启后生效」目视现缺的教训不重演。

---

## 1. 验收前提（已裁定）

- 分类定案表同意；软卸载宿主行选方案 A（同步 unset）+ 防覆盖补则。
- 保管区认可；每插件 5 份滚动窗口，无 TTL；.panel-custody/ 已入 .gitignore。
- 恢复确认 + 重启提示认可。
- 隔离性矩阵 §8.1 采纳为施工批 1 硬验收。

---

## 2. 弹窗/确认页文案全稿

### 2.1 通用规则
- 所有弹窗必须出现：将要执行什么、会删什么、后果、是否已存档/无需存档、恢复路径。
- 所有写盘执行前需再次确认；真卸载必须输入插件名。
- 所有写盘完成后明确标注「重启后生效」；恢复同样标注。
- 不出现「永久删除」「不可恢复」等与保管区机制矛盾的表述。
- 失败时提示已完成的步骤与备份/保管区位置，不承诺「已回滚」除非实际发生。

### 2.2 联动三插件 · 默认软卸载

| 字段 | 内容 |
|---|---|
| 标题 | 软卸载「限流 rate-throttle」——仅摘挂载行 |
| 正文 | 将执行：摘除 cordis.patch.yml 中 rate-throttle 的挂载行；本体 file=D:\dsh-plugins\dsh-toolkit\lib\rate-throttle 保留，不删任何源码与数据。 |
| 后果 | 挂载行摘除后限流参数停止生效（请求不再按 tpmCooldownMs 限速）；其余插件核心功能正常。 |
| 档案/恢复 | 无需存档（本体保留）。恢复路径：面板 → rate-throttle 卡片 → 恢复（写回挂载行）→ 重启后生效。 |
| 操作 | 输入 rate-throttle 后点「确认软卸载」/「取消」 |

| 字段 | 内容 |
|---|---|
| 标题 | 软卸载「记忆 agent-memory」——仅摘挂载行 |
| 正文 | 将执行：摘除 cordis.patch.yml 中 agent-memory-runtime 的挂载行；本体 file=D:\dsh-plugins\dsh-toolkit\lib\agent-memory 保留，已有记忆数据保留。 |
| 后果 | compact-router 与记忆的联动降级：正文摘要不再提供台账正典/陈旧提示（详见证据①）；其余插件正常。 |
| 档案/恢复 | 无需存档（本体保留）。恢复路径：面板 → agent-memory 卡片 → 恢复（写回挂载行）→ 重启后联动自动恢复。 |
| 操作 | 输入 agent-memory 后点「确认软卸载」/「取消」 |

| 字段 | 内容 |
|---|---|
| 标题 | 软卸载「压缩 compact-router」——预设回写 |
| 正文 | 将执行：scripts/apply-preset-patch.mjs 回写预设（compaction-basic 复位）；本体 file=D:\dsh-plugins\dsh-toolkit\lib\compact-router 保留。 |
| 后果 | 压缩降级为系统自带 compaction-basic；rate-throttle 的降级前压缩仍可用（走系统服务），免 LLM 压缩 seam 不再注册。 |
| 档案/恢复 | 无需存档（本体保留）。恢复路径：面板 → compact-router 卡片 → 恢复（重新打预设补丁）→ 重启后联动自动恢复。 |
| 操作 | 输入 compact-router 后点「确认软卸载」/「取消」 |

### 2.3 搜索两插件 · 软卸载（方案 A，非默认路径）

| 字段 | 内容 |
|---|---|
| 标题 | 软卸载「搜索路由 search-router」——摘行 + 宿主行 7 回缺省 |
| 正文 | 将执行：摘除 cordis.patch.yml 中 search-router 挂载行；同步 unset web.config.searchProvider（宿主行 7 回 schema 缺省）；本体 file=D:\dsh-plugins\dsh-toolkit\lib\search-router 保留。 |
| 后果 | auto-search provider 退出注册；web 搜索退为缺省 unset（系统自选可用 provider），不悬空报错。 |
| 档案/恢复 | 无需存档。恢复路径：面板 → search-router 卡片 → 恢复（写回挂载行 + 宿主行 7 原值）→ 重启后生效。恢复时若宿主行已被其他 provider 占用，面板会检测并让你选择，不自动覆盖。 |
| 操作 | 输入 search-router 后点「确认软卸载」/「取消」 |

| 字段 | 内容 |
|---|---|
| 标题 | 软卸载「本地搜索 web-search-local」——摘行 + 宿主行 8 回缺省 |
| 正文 | 将执行：摘除 cordis.patch.yml 中 web-search-local 挂载行；同步 unset web.config.fetchProvider（宿主行 8 回 schema 缺省）；本体 file=D:\dsh-plugins\dsh-toolkit\lib\web-search-local 保留。 |
| 后果 | local-fetch provider 退出注册；web 抓取退为缺省 unset（系统自选可用 provider），不悬空报错。 |
| 档案/恢复 | 无需存档。恢复路径：面板 → web-search-local 卡片 → 恢复（写回挂载行 + 宿主行 8 原值）→ 重启后生效。恢复时若宿主行已被其他 provider 占用，面板会检测并让你选择，不自动覆盖。 |
| 操作 | 输入 web-search-local 后点「确认软卸载」/「取消」 |

### 2.4 搜索两插件 · 真卸载（默认推荐，存档式）

| 字段 | 内容 |
|---|---|
| 标题 | 真卸载「搜索路由 search-router」——存档式删除 |
| 正文 | 将执行：① 把 file=D:\dsh-plugins\dsh-toolkit\lib\search-router 全目录复制到面板保管区并逐文件 sha 校验；② 摘除挂载行；③ unset web.config.searchProvider（宿主行 7）；④ 删除本体目录。 |
| 后果 | auto-search 退出；web 搜索退为缺省 unset。已自动存档，删除内容可从保管区一键恢复。 |
| 档案/恢复 | 已存档至 .panel-custody/search-router-<stamp>。恢复路径：面板 → search-router 卡片 → 恢复（还原本体 + 写回挂载行 + 写回宿主行 7 原值）→ 重启后生效。若宿主行已改占，会检测并让你选择。 |
| 操作 | 输入 search-router + 二次确认后点「确认真卸载」/「取消」 |

| 字段 | 内容 |
|---|---|
| 标题 | 真卸载「本地搜索 web-search-local」——存档式删除 |
| 正文 | 将执行：① 把 file=D:\dsh-plugins\dsh-toolkit\lib\web-search-local 全目录复制到面板保管区并逐文件 sha 校验；② 摘除挂载行；③ unset web.config.fetchProvider（宿主行 8）；④ 删除本体目录。 |
| 后果 | local-fetch 退出；web 抓取退为缺省 unset。已自动存档，删除内容可从保管区一键恢复。 |
| 档案/恢复 | 已存档至 .panel-custody/web-search-local-<stamp>。恢复路径：面板 → web-search-local 卡片 → 恢复（还原本体 + 写回挂载行 + 写回宿主行 8 原值）→ 重启后生效。若宿主行已改占，会检测并让你选择。 |
| 操作 | 输入 web-search-local + 二次确认后点「确认真卸载」/「取消」 |

### 2.5 compact-router · 真卸载（可选路径，存档式）

| 字段 | 内容 |
|---|---|
| 标题 | 真卸载「压缩 compact-router」——预设回写 + 存档式删除 |
| 正文 | 将执行：① scripts/apply-preset-patch.mjs 回写预设（compaction-basic 复位）；② 把 file=D:\dsh-plugins\dsh-toolkit\lib\compact-router 全目录复制到保管区并 sha 校验；③ 删除本体目录。 |
| 后果 | 压缩永久退为系统自带 compaction-basic；rate-throttle 仍可用（走系统服务）；agent-memory 与 compact-router 的联动不再存在。已自动存档，可恢复。 |
| 档案/恢复 | 已存档至 .panel-custody/compact-router-<stamp>。恢复路径：面板 → compact-router 卡片 → 恢复（还原本体 + 重打预设补丁）→ 重启后生效。 |
| 操作 | 输入 compact-router + 二次确认后点「确认真卸载」/「取消」 |

### 2.6 恢复确认页（通用）

| 字段 | 内容 |
|---|---|
| 标题 | 恢复「<插件名>」 |
| 正文 | 来源：<custodyId>；将恢复 N 个文件（M 字节），恢复前逐文件 sha256 校验。将写回：挂载行 / 预设补丁 / 宿主行（如适用）。 |
| 冲突检测 | 若宿主行 7/8 当前值 ≠ 备份值：弹出「检测到 searchProvider/fetchProvider 已被改占（当前 <cur>，备份 <backup>）。请选择：保留当前值 / 恢复备份值」。不自动覆盖。 |
| 后果 | 恢复完成后需重启；重启后联动按证据⑤自动恢复。doctor 应在重启后回 0/0/0。 |
| 操作 | 点「确认恢复」/「取消」；执行成功后横幅提示「已恢复，重启后生效」。 |

### 2.7 失败提示（通用）
- 任何一步失败：提示「第 <step> 步失败：<原因>。已完成步骤见本次执行清单；写前备份/保管区未受影响（或说明受影响项），请勿重复操作，联系判定侧/查看 .panel-write-backups 与 .panel-custody。」

---

## 3. 施工批 1 测试计划（隔离性矩阵为核心）

### 3.1 范围
- 本批实现：apply-engine 新增 row 摘除/插回 + 宿主行 unset/恢复 + 真卸载保管区 + 快照缺席态 + doctor 提示级检查（body-vs-mount / provider-reference-integrity）。
- 不实现：doctor 操作台 UI（施工批 2）、provider 编辑器、自我卸载。

### 3.2 隔离性硬验收矩阵（设计稿 §8.1 采纳）

| 用例 | 前置 | 操作 | 硬验收断言 |
|---|---|---|---|
| A1 单删 rate-throttle（软） | sha 基准 ce0b0b81；doctor 0/0/0 | API/面板软卸载 | 面板正常；其余四插件 + panel 正常；doctor 0 error 且含 rate-throttle 未挂载提示；cordis sha ≠ 基准且行摘除正确；一键恢复后 sha 回基线 |
| A2 单删 compact-router（软） | 同上 | 预设回写 | 面板正常；preset --status 显示回写；rate-throttle 降级路径仍可用；doctor 0 error + compact-router 缺席提示；恢复后 standard/ptc/cordis/liangshen 回 patched |
| A3 单删 agent-memory（软） | 同上 | 摘行 | compact-router 正文摘要降级（不用台账正典）；面板正常；doctor 0 error + 提示；恢复后 sha 回基线 |
| A4 单删 search-router（真） | 同上 | 存档式删除 | 管家区 manifest 完整；宿主行 7 unset；web-search-local 仍挂载（fetch 可用）；面板正常；doctor 0 error + 提示；恢复后宿主行 7 回原值 |
| A5 单删 web-search-local（真） | 同上 | 存档式删除 | 管家区 manifest 完整；宿主行 8 unset；search-router 仍挂载；面板正常；doctor 0 error + 提示；恢复后宿主行 8 回原值 |
| B1 搜索对同删（真） | 同上 | 两插件真卸载 | 两本体入保管区；挂载行双摘除；宿主行 7、8 均 unset；web 无本地 provider（unset 缺省）；面板正常；doctor 0 error + 两缺席提示 |
| C1 联动全软 | 同上 | rate+compact+memory 同时软卸载 | 面板正常；搜索两插件 core 正常；doctor 0 error + 三缺席提示；恢复后 sha 回基线且联动自动恢复 |
| C2 极端组合 | 同上 | 五子插件同时卸载（三软二真） | 面板正常；无任何插件挂载；doctor 0 error + 五缺席提示；保管区有搜索/compact 真卸载档 |
| C3 极端组合恢复 | C2 后 | 逐插件从保管区/挂载行恢复 + 重启 | cordis sha 回 ce0b0b81；doctor 0/0/0；preset --status 四预设 patched；各联动按证据⑤自动恢复 |

### 3.3 文案预审点（判定侧把关）
- 每段文案是否含「重启后生效」；恢复路径是否明确；真卸载是否出现「已自动存档 + 恢复路径」；失败提示是否不夸大回滚。
- 输入插件名与二次确认的前端拦截点（防误触）。
- 人话可读性：非技术用户能否看懂「摘除挂载行/宿主行 unset」——预审后替换为中性措辞，如「关闭从面板装载该插件的入口」，最终以预审稿为准。

### 3.4 全套回归（批验收底座）
- scripts/regression-all.mjs 全绿：p1 190/0、p2 16/0、p21 53/53、p22 104/104、p22-cards 79/79、p22b 17/17、q2-layer 14/14、q2-shipped 21/21、fidelity 38/38、backup-write 23/23、lint、node --test 93/0。
- doctor dry-run 0/0/0（未触碰隔离态前必须保持）。
- 新增单测：row 摘除/插回锚点唯一、sha 校验、unset/恢复冲突检测、保管区 manifest 与 sha 清单。

### 3.5 报判与目视流程
- 施工批 1 全绿 + 隔离性矩阵汇总表 → 报判定侧 → 用户 reload 目视（重点看缺席态渲染、状态提示、恢复入口）。目视通过后方可进入施工批 2。
