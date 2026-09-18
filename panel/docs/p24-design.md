# P2.4 扩容 · 设计稿 v1（待判定侧验收 + 用户批准）

> 状态：设计稿 v1 已验收（判定侧 5 项裁定；§12 裁决记录）；仍未动任何代码，待用户批准后开施工批 1。
> 时间：2026-09-18 19:50 GMT+8
> 配套证据：panel/docs/evidence/P24-EVIDENCE.md（七项取证，sha 45b8eab7…）
> 设计稿验收后方可进入施工批 1（卸载/恢复）；本稿不含代码改动。

---

## 1. 分类最终定案与默认推荐

| 插件 | 定案类别 | 默认推荐 | 卸载语义 |
|---|---|---|---|
| rate-throttle | 联动（限流） | 软卸载 | 摘除挂载行 + 本体保留 + 一键恢复 |
| compact-router | 联动（压缩） | 软卸载 | 预设回写 + 本体保留 + 一键恢复（特案） |
| agent-memory | 联动（记忆） | 软卸载 | 摘除挂载行 + 本体保留 + 一键恢复 |
| search-router | 搜索 | 真卸载 | 存档式：删前备份本体至保管区 + 摘行 + 宿主行 7-8 清理 |
| web-search-local | 搜索 | 真卸载 | 存档式：删前备份本体至保管区 + 摘行 + 宿主行 7-8 清理 |
| toolkit-manager | 面板自身 | 无入口 | 不提供自我卸载（面板自我保护，同“不自带开关”先例） |

- 每个插件卡片两个入口并存：软卸载 / 真卸载。默认按上表推荐，弹窗如实告知删除内容/后果/可否恢复/恢复路径，用户知情确认后执行。
- 真卸载对一切插件始终可选（含三个联动插件）。

---

## 2. 软卸载语义（联动三插件默认路径）

### 2.1 普通 patch 行插件（rate-throttle / agent-memory）
- 卸载 = 从 cordis.patch.yml 摘除该插件整段 insert 块（不是加 disabled）。
- 本体 lib/<plugin> 保留不动。
- 恢复 = 按原样写回 insert 块（原锚点唯一 + SHA + 写前备份）。
- 面板快照状态 = soft-unmounted（本体在、行不在）。

### 2.2 compact-router 特案
- 该插件不在 cordis.patch.yml，由 scripts/apply-preset-patch.mjs 改写 shipped/user presets。
- 软卸载 = node scripts/apply-preset-patch.mjs --undo（预设回写为 compaction-basic；本体保留）。
- 恢复 = 重新执行预设补丁（当前 --apply 使 standard/ptc/cordis/liangshen 均 patched）。
- 快照状态 = soft-unmounted-preset。
- 面板不得自行发明新的 compact-router 写入通路；预设备份/回写一律复用现有脚本（及其 preset-backups/ 与 preset-patch-state.json）。

---

## 3. 真卸载语义（存档式，用户已直裁）

### 3.1 统一规则（全插件）
1. 执行前：快照 + doctor dry-run + 基线 sha + 行锚点定位 + 用户弹窗确认。
2. 写前自动备份本体至面板保管区：递归复制 lib/<plugin> 全目录到保管区 body/，逐文件 sha256 记录。
3. 保管区 manifest 同时保存该插件恢复所需最小事实：
   - 插件名、时间戳、真卸载原因（用户输入）、确认文案快照。
   - body 文件清单（相对路径、origAbs、sha256）。
   - cordis.patch.yml 全量预写副本（或 preset-patch-state 快照）。
   - 挂载行块原文（对 patch 行插件）+ web.config.searchProvider/fetchProvider 预改前值（仅搜索插件）。
4. 摘除 cordis.patch.yml 挂载行（普通插件）。
5. 删除 lib/<plugin> 目录（先复验保管区 sha 与源一致，再删源）。
6. 执行后复验：行不残留、目录不存在、保管区 manifest 完整、doctor 无 error（缺席仅提示级）。
7. 恢复 = 保管区一键恢复：还原 body 至原位 + 写回挂载行 + （搜索插件）写回宿主行 7-8 原值 + 重启。恢复后联动自动恢复（P24-EVIDENCE §⑤ 已证）。

### 3.2 compact-router 真卸载
- 额外步骤：先执行 --undo 回写预设，再存档+删除 lib/compact-router。
- 恢复 = 还原 body + 重新执行预设补丁 + 重启。

### 3.3 搜索插件真卸载（用户用例：删旧换新）
- 对 search-router：unset 宿主行 7 的 searchProvider（平台缺省=未设置时自动选择恰好一个可用 provider）。
- 对 web-search-local：unset 宿主行 8 的 fetchProvider（同理）。
- 同时删两搜索插件：两键均 unset。
- 恢复 = 从保管区还原 body + 写回挂载行 + 写回宿主行 7-8 原值 + 重启。
- 换新插件（删旧装新）场景：卸载旧插件只做 unset 缺省；新 provider 设置由用户/安装侧负责；面板不再提供 provider 编辑器，职责边界由 doctor 的引用有效性检查兜底（下 §6）。

---

## 4. 保管区结构与清理策略

### 4.1 位置与命名
- 路径：<repo>/.panel-custody/<plugin>-<UTC stamp>/（与 .panel-backups/.panel-write-backups 同级，git 忽略）。
- 目录：
  - manifest.json：插件、时间、原因、确认文案快照、文件清单含 sha、恢复正常（重启提示）。
  - body/：lib/<plugin> 目录的全量镜像。
  - patch/：cordis.patch.yml.pre、行块原文、宿主行原值（可空）、preset-patch-state 快照（仅 compact-router）。
- localStorage 不承载保管区；保管区是磁盘事实，面板 API 只读列表/发起恢复。

### 4.2 清理策略
- 滚动窗口：按插件保留最多 5 份（含当前恢复档）；超出后物理删除最旧档，无 TTL。恢复成功不自动清档（保留最近一次成功恢复档 7 天便于复核，也需要时计入同一窗口）。
- 恢复成功不自动清档（保留最近一次成功恢复档 7 天便于复核）。
- 保管区清理由后续版本或用户手工触发；设计稿仅给出结构与策略，不在施工批 1 实现批量清理 UI。

---

## 5. 删除隔离性实现

### 5.1 应用引擎新增能力（apply-engine.mjs）
- 新增计划算子：planRemoveRow / planInsertRow（整块摘除与插回，沿用锚点唯一 + SHA + 写前备份）。
- 新增内部写允许清单：web.config.searchProvider / fetchProvider 的 unset 与恢复（只允许卸载/恢复计划用，不进 18 字段参数编辑白名单）。
- 能力边界：依旧单写盘入口 executePlan；两步计划-执行模型不变；零改动双写/备份纪律。

### 5.2 宿主行清理（cordis.patch.yml:7-8，搜索插件真卸载）
- 用 DSH web schema 求证：searchProvider / fetchProvider 缺省为 unset（README.zh.md:46-47）；unset 时仅在恰好一个可用 provider 时自动选择。
- 真卸载清理 = 移除对应键（unset），不是硬编码任何平台缺省名（避免写死用户环境，呼应开源源泛化）。

### 5.3 缺席态渲染（面板）
- snapshot 增加逐插件状态字段：mounted / soft-unmounted / true-uninstalled / installed-unmounted / dangling-mount。
- true-uninstalled 卡片显示「已卸载（真）· 本体已移入保管区 · 可一键恢复」。
- soft-unmounted 卡片显示「已软卸载 · 本体保留 · 可一键恢复」。
- 面板配置编辑对卸载态隐藏该插件多余操作，但列表与状态照常渲染；面板自身任何时刻正常。
- toolkit-manager 卡片保持自身；五子插件卡片缺一不可判定为「面板异常」。

### 5.4 doctor 提示级检查（不报 error）
- 新增知识化检查（零硬编码插件名的信号声明，engine 侧扩展配置）：
  - body-vs-mount：lib 目录存在但挂载行不在 → warning「已安装未挂载，是否恢复？」；挂载行在但 lib 目录不存在 → warning「挂载行存在但本体缺失」。
  - provider-reference-integrity：cordis.patch.yml:7-8 悬空 provider 引用 → warning「悬挂引用，建议修复/恢复」。
- 缺席类信号一律 info/warning；error 只保留给真实破坏（如挂载行同时刷新失败、保管区校验不通过）。
- 机理：doctor dry-run 0/0/0 是验收底线；缺席矩阵中 doctor 不出现 error。

---

## 6. 软卸载的宿主行处置（已裁定：方案 A + 防覆盖补则）

判定侧验收通过：采用方案 A（同步 unset）。依据：删除隔离性精神（宿主搜索退 schema 缺省而非报错悬空）、doctor 无悬空警告、用户体感不留「坏掉」表象、README.zh.md:46-47 的 unset 依据（不硬编码缺省名）。

- 软卸载 search-router 时 unset 行 7 searchProvider；软卸载 web-search-local 时 unset 行 8 fetchProvider；恢复时从备份写回原值。
- 补则：软/真卸载恢复时，若宿主行已被其他 provider 占用（用户/安装侧期间改过），恢复流程必须检测冲突，并弹出用户选择提示，**不自动覆盖**。
- 本稿曾并列的方案 B（保留并标注）作为被否决策记录保留于本条目；施工批 1 不实现 B。

## 7. UI / API 流程（施工批 1）

### 7.1 卸载/恢复弹窗与确认页文案（全稿在 panel/docs/p24-test-plan-batch1.md §2；文案须随施工批 1 测试计划由判定侧预审）
- 真卸载统一模板：标题「真卸载 <插件名>」；正文逐条列出：删除内容 = <lib/xxx 目录> + <CORDIS 挂载行 / 预设补丁>；后果 = <联动效应，按证据①②⑤>；恢复方式 = 「已自动存档至保管区，面板可一键恢复」；恢复路径 = 面板 → <插件> → 恢复。
- 软卸载统一模板：删除内容 = 仅挂载行摘除；本体保留；恢复 = 一键恢复；后果 = 联动降级但不破坏其余插件。
- 确认入口必须多因素：输入插件名（防误触）+ 二次确认。

### 7.2 API 草案
- POST /api/toolkit-panel/uninstall/plan { plugin, mode } → dry-run plan（各类动作/备份/执行前 sha）。
- POST /api/toolkit-panel/uninstall/execute { execute:true, change:true, planId } → executePlan / 保管区写盘。
- GET /api/toolkit-panel/custody → 列保管区条目与可恢复状态。
- POST /api/toolkit-panel/restore/execute { execute:true, change:true, custodyId } → 恢复 + 提示重启。
- 守卫沿用 P2.3 链：loopback + Host loopback 或配对 + CSRF + change:true + 白名单模式；面板不自动重启。

---

## 8. 施工批 1 测试计划（以隔离性矩阵为核心）

### 8.1 缺席模拟矩阵（硬验收）
| 用例 | 操作 | 保真判据 |
|---|---|---|
| A1 单删 rate-throttle | 软卸载（摘行+本体留） | 面板正常，agent-memory/compact-router/system 正常，doctor 0 error 且提示该插件未挂载 |
| A2 单删 compact-router | 软卸载（预设回写+本体留） | rate-throttle 降级路径仍工作（回退 compaction-basic），面板正常，doctor 0 error + 提示 |
| A3 单删 agent-memory | 软卸载（摘行+本体留） | compact-router 正文摘要回退（memory sections 禁用），面板正常，doctor 0 error + 提示 |
| A4 单删 search-router | 真卸载（存档+摘行+清理宿主行 7） | web-search-local 本体仍挂载；fetch 可用；搜索 provider 缺省；面板正常，doctor 0 error + 提示 |
| A5 单删 web-search-local | 真卸载（存档+摘行+清理宿主行 8） | search-router 仍挂载；search 可用（auto-search 回退官方/提示），面板正常，doctor 0 error + 提示 |
| B1 搜索对同删 | search-router + web-search-local 同真卸载（两行+两宿主键清理） | web 无本地 provider（unset）；面板正常，doctor 0 error + 提示 |
| C1 联动全软 | rate-throttle + compact-router + agent-memory 同时软卸载 | 面板正常，doctor 0 error + 提示；剩余搜索两插件正常 |
| C2 极端组合 | 五子插件同时卸载（三软二真，面板自身在） | 面板正常，doctor 0 error + 提示；无任何 error |
| C3 极端组合 | 五子插件同时卸载后一键恢复于保管区 | 恢复后 sha 与卸载前一致；重启后各联动自动恢复；doctor 回 0/0/0 |

### 8.2 恢复对照测试
- 每个用例恢复前后对比 cordis.patch.yml sha；doctor 0/0/0。
- compact-router 恢复后执行 preset --status 验证 standard/ptc/cordis/liangshen 重回 patched。
- 搜索插件恢复后验证宿主行 7-8 回原值。
- 弹窗文案与保管区 manifest 事实一致（无虚假承诺）。

### 8.3 平台行为验证（若允许真实取证实操，先授权后动）
- 应用引擎行摘除/回插 dry-run 单测。
- doctor 新信号只产生 info/warning，不产生 error。
- 面板快照渲染 5 卡 + 卸载态渲染。

---

## 9. 开源源背景轻量应对

- a) 本设计稿 + P24-EVIDENCE.md + ledger L-048/L-049 已构成阶段决策/教训的文档化落点；后续施工记录同样进 ledger/交接卡。
- b) 开源版泛化点（当前不实施）：
  - panel/manager/config-whitelist.mjs 与 config 计划锁目前以 rate-throttle 为唯一宿主（P2.3），属环境绑定；施工批不改，但在 UI/代码注释与交接卡标记「开源版泛化点：抽象插件级白名单/计划主机选择」。
  - 本稿新增宿主行 7-8 清理与缺席态渲染时，不新增任何绝对用户路径/硬编码宿主目录；现有面板注册路径（D:\dsh-plugins\dsh-toolkit/panel/index.js）保持现状，仅记注记。

---

## 10. 阶段性纪律与验收口

- 设计稿验收（判定侧）通过后，用户批准进入施工批 1。
- 施工批 1 只做卸载/恢复 + 缺失态渲染 + doctor 提示级检查 + 保管区；不做 doctor 操作台（那是施工批 2）。
- 每批完成后更新交接卡 §12 + ledger；写盘/重启先授权；异常带证据回报，不在线上调试；回滚先于排查。
- 红线现行为：五子插件源码目录可在用户知情确认下执行删除；~/.dsh 与 cloudflared 红线不变；写前必备份、双 sha 复验、fail-closed。

---

## 11. 待用户/判定侧确认项（设计稿验收清单）

1. 分类定案表（§1）是否同意。
2. 软卸载宿主行二案（§6）选 A 或 B（本稿推荐 A）。
3. 保管区路径 .panel-custody 与保留 5 份/不再自动清理，是否认可。
4. 真卸载 restore 是否必须由用户在面板确认后触发（本稿默认：是，且提示重启）。
5. 隔离性矩阵（§8.1）是否采纳为施工批 1 硬验收。


---

## 12. 设计稿 v1 验收裁决（2026-09-18 19:xx，判定侧）

1. 分类定案表：同意。
2. 软卸载宿主行：选方案 A（同步 unset）+ 补则「恢复时宿主行若被占用→检测并用户选择，不自动覆盖」。
3. 保管区：路径/机制认可；明确「每插件 5 份」= 滚动窗口（删最旧），无 TTL；.panel-custody/ 入 .gitignore（同 .panel-backups 惯例）。
4. 恢复确认 + 重启提示：认可。
5. 隔离性矩阵 §8.1 采纳为施工批 1 硬验收。
6. 流程补强：弹窗/确认页文案全稿随施工批 1 测试计划一并呈判定侧预审（人话把关前移——P2.2「重启后生效」目视现缺的教训不重演）；用户批准框架后开工。
