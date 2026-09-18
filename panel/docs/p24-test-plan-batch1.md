# P2.4 施工批 1 · 测试计划 + 弹窗/确认页文案全稿（呈判定侧预审 · 正文全稿）

> 状态：待判定侧预审 + 用户批准框架后开工。当前零代码写入。
> 依据：panel/docs/p24-design.md v1 验收裁决（§12）；P24-EVIDENCE.md ①③⑤。
> 流程补强：弹窗/确认页文案全稿与测试计划同步预审，P2.2「重启后生效」目视现缺的教训不重演。

---

## 1. 验收前提（已裁定）

- 分类定案表同意；软卸载宿主行选方案 A（同步 unset）+ 防覆盖补则。
- 保管区认可；每插件 5 份滚动窗口，无 TTL；.panel-custody/ 已入 .gitignore。
- 恢复确认 + 重启提示认可。
- 隔离性矩阵 §8.1 采纳为施工批 1 硬验收。

---

## 2. 弹窗/确认页文案全稿（逐句全稿）

### 2.0 文案统一模板（每段必含五件事）
1. **删什么**：说清关闭/删除的对象（源码文件、系统设置项），删与不删都写明。
2. **后果**：说清这个功能模块会怎样，其余功能模块会怎样。
3. **已存档/无需存档**：真卸载必须写明「已自动存档，可恢复」；软卸载写明「源代码保留、无需存档」。
4. **恢复路径**：写明在面板哪里点「恢复」。
5. **重启后生效**：每一段最后一行都必须出现这句话。

### 2.1 软卸载 · 限流（rate-throttle）

| 项目 | 文案（一字不落） |
|---|---|
| 标题 | 软卸载「限流 rate-throttle」 |
| 删什么 | 关闭面板到「限流」功能模块的启动入口（不删除磁盘上的源代码文件，源码保留在本地）。 |
| 后果 | 关闭后，平台不再按当前面板里的限流参数进行限速；其余功能模块不受影响。 |
| 已存档 | 无需存档，源代码文件保留。 |
| 恢复路径 | 面板 →「限流 rate-throttle」卡片 → 点「恢复」。 |
| 重启 | **恢复后需要重启才生效。** |
| 确认操作 | 请手动输入 rate-throttle 后点「确认软卸载」，或点「取消」。 |

### 2.2 软卸载 · 记忆（agent-memory）

| 项目 | 文案（一字不落） |
|---|---|
| 标题 | 软卸载「记忆 agent-memory」 |
| 删什么 | 关闭面板到「记忆」功能模块的启动入口（不删除磁盘上的源代码文件，源码与已有记忆数据都保留）。 |
| 后果 | 关闭后，「压缩」功能里引用的记忆内容会退化为不显示（其他功能不受影响）。 |
| 已存档 | 无需存档，源代码与已有记忆数据保留。 |
| 恢复路径 | 面板 →「记忆 agent-memory」卡片 → 点「恢复」。 |
| 重启 | **恢复后需要重启才生效。** |
| 确认操作 | 请手动输入 agent-memory 后点「确认软卸载」，或点「取消」。 |

### 2.3 软卸载 · 压缩（compact-router）

| 项目 | 文案（一字不落） |
|---|---|
| 标题 | 软卸载「压缩 compact-router」 |
| 删什么 | 把「压缩」功能恢复为系统自带版本（不删除磁盘上的源代码文件，源码保留在本地）。 |
| 后果 | 关闭后，平台使用系统自带的压缩功能；限流功能仍可用，只是不再使用面板这套压缩增强。 |
| 已存档 | 无需存档，源代码文件保留。 |
| 恢复路径 | 面板 →「压缩 compact-router」卡片 → 点「恢复」。 |
| 重启 | **恢复后需要重启才生效。** |
| 确认操作 | 请手动输入 compact-router 后点「确认软卸载」，或点「取消」。 |

### 2.4 软卸载 · 搜索路由（search-router，方案 A）

| 项目 | 文案（一字不落） |
|---|---|
| 标题 | 软卸载「搜索路由 search-router」 |
| 删什么 | 关闭面板到「搜索路由」功能模块的启动入口；把面板里一项网页搜索系统设置改回「系统默认（未指定）」（不删除磁盘上的源代码文件，源码保留在本地）。 |
| 后果 | 关闭后，网页搜索退回到系统默认行为：有哪个可用就用哪个，而不是指定本面板的搜索路由。 |
| 已存档 | 无需存档，源代码文件保留。 |
| 恢复路径 | 面板 →「搜索路由 search-router」卡片 → 点「恢复」。恢复时若那项系统设置已被其他程序改掉，面板会先提示你选择「保留当前值」还是「恢复成卸载前的值」，不会自动覆盖。 |
| 重启 | **恢复后需要重启才生效。** |
| 确认操作 | 请手动输入 search-router 后点「确认软卸载」，或点「取消」。 |

### 2.5 软卸载 · 本地搜索（web-search-local，方案 A）

| 项目 | 文案（一字不落） |
|---|---|
| 标题 | 软卸载「本地搜索 web-search-local」 |
| 删什么 | 关闭面板到「本地搜索」功能模块的启动入口；把面板里一项网页抓取系统设置改回「系统默认（未指定）」（不删除磁盘上的源代码文件，源码保留在本地）。 |
| 后果 | 关闭后，网页抓取退回到系统默认行为：有哪个可用就用哪个，而不是指定本面板的本地搜索。 |
| 已存档 | 无需存档，源代码文件保留。 |
| 恢复路径 | 面板 →「本地搜索 web-search-local」卡片 → 点「恢复」。恢复时若那项系统设置已被其他程序改掉，面板会先提示你选择「保留当前值」还是「恢复成卸载前的值」，不会自动覆盖。 |
| 重启 | **恢复后需要重启才生效。** |
| 确认操作 | 请手动输入 web-search-local 后点「确认软卸载」，或点「取消」。 |

### 2.6 真卸载 · 搜索路由（search-router）

| 项目 | 文案（一字不落） |
|---|---|
| 标题 | 真卸载「搜索路由 search-router」——删除本体，先自动存档 |
| 删什么 | ① 把磁盘上的搜索路由源代码文件完整复制到面板保管区并逐文件校验；② 关闭它的启动入口；③ 把面板里一项网页搜索系统设置改回「系统默认（未指定）」；④ 再删除磁盘上的源代码文件。 |
| 后果 | 删除后，网页搜索退回到系统默认行为。你随时可以从面板保管区恢复。 |
| 已存档 | **已自动存档到面板保管区**（本次存档编号会显示在下方执行确认页）。 |
| 恢复路径 | 面板 →「搜索路由 search-router」卡片 → 点「恢复」，即可从保管区一键恢复。 |
| 重启 | **恢复后需要重启才生效。** |
| 确认操作 | 请手动输入 search-router 两次并点「确认真卸载」，或点「取消」。 |

### 2.7 真卸载 · 本地搜索（web-search-local）

| 项目 | 文案（一字不落） |
|---|---|
| 标题 | 真卸载「本地搜索 web-search-local」——删除本体，先自动存档 |
| 删什么 | ① 把磁盘上的本地搜索源代码文件完整复制到面板保管区并逐文件校验；② 关闭它的启动入口；③ 把面板里一项网页抓取系统设置改回「系统默认（未指定）」；④ 再删除磁盘上的源代码文件。 |
| 后果 | 删除后，网页抓取退回到系统默认行为。你随时可以从面板保管区恢复。 |
| 已存档 | **已自动存档到面板保管区**（本次存档编号会显示在下方执行确认页）。 |
| 恢复路径 | 面板 →「本地搜索 web-search-local」卡片 → 点「恢复」，即可从保管区一键恢复。 |
| 重启 | **恢复后需要重启才生效。** |
| 确认操作 | 请手动输入 web-search-local 两次并点「确认真卸载」，或点「取消」。 |

### 2.8 真卸载 · 压缩（compact-router）

| 项目 | 文案（一字不落） |
|---|---|
| 标题 | 真卸载「压缩 compact-router」——删除本体，先自动存档 |
| 删什么 | ① 把「压缩」功能恢复为系统自带版本；② 把磁盘上的压缩源代码文件完整复制到面板保管区并逐文件校验；③ 再删除磁盘上的源代码文件。 |
| 后果 | 删除后，平台使用系统自带的压缩功能；限流功能仍可用，只是不再使用本面板的压缩增强。你随时可以从面板保管区恢复。 |
| 已存档 | **已自动存档到面板保管区**（本次存档编号会显示在下方执行确认页）。 |
| 恢复路径 | 面板 →「压缩 compact-router」卡片 → 点「恢复」，即可从保管区一键恢复。 |
| 重启 | **恢复后需要重启才生效。** |
| 确认操作 | 请手动输入 compact-router 两次并点「确认真卸载」，或点「取消」。 |

### 2.9 恢复确认页（通用，含冲突三态）

| 项目 | 文案（一字不落） |
|---|---|
| 标题 | 恢复「<插件名>」 |
| 正文 | 将从面板保管区恢复「<插件名>」：恢复 N 个文件（共 M 字节），先逐文件校验，校验通过后才写回磁盘；写回后自动恢复它的启动入口（以及卸载时改动的系统设置项，如有）。 |
| 冲突三态 | 若恢复时发现某项系统设置已被其他程序改掉（当前值是 <cur>，卸载前是 <backup>），弹窗三选一：A. 保留当前值（不覆盖）；B. 恢复成卸载前的值；C. 取消本次恢复。面板不会自动覆盖。 |
| 重启 | **恢复完成后需要重启才生效。** |
| 确认操作 | 点「确认恢复」，或点「取消」。 |
| 完成后 | 页面横幅提示：**「恢复完成，重启后生效」**。 |

### 2.10 失败提示（通用）

| 项目 | 文案（一字不落） |
|---|---|
| 标题 | 操作未完全成功 |
| 正文 | 第 <step> 步失败：<原因>。面板没有完成全部步骤。已完成到哪一步、没完成哪一步，请看下方清单；刚才产生的备份/存档仍在，不会被清除。请不要重复点击。 |
| 补救 | 请把本页截图或复制清单内容，发给维护者处理。 |

---

## 3. 施工批 1 测试计划（隔离性矩阵为核心）

### 3.1 范围
本批实现：row 摘除/插回、宿主行同步 unset/恢复、真卸载保管区、快照缺席态、doctor 两级提示检查（body-vs-mount / provider-reference-integrity）。
不实现：doctor 操作台 UI（施工批 2）、provider 编辑器、面板自我卸载。

### 3.2 隔离性硬验收矩阵（逐格硬断言）

| 用例 | 前置 | 操作 | 硬断言（每一条都必须为真） |
|---|---|---|---|
| A1 单删 rate-throttle（软） | 基线 sha=ce0b0b81；doctor error=0；5 卡 mounted | 面板执行「软卸载 rate-throttle」 | ① GET /api/toolkit-panel/snapshot 返回 HTTP 200；② 页面渲染 5 张卡且面板自身可交互；③ rate-throttle 卡显示「已软卸载/未安装」文案；④ lib/rate-throttle 目录存在且总 sha 与操作前一致；⑤ cordis.patch.yml 中不存在 rate-throttle 插入块，文件仍是合法 YAML；⑥ .panel-write-backups/ 新增一条 manifest（字段 reason/note 非空，savedAs 无盘符冒号）；⑦ doctor error=0 且输出含 rate-throttle 缺席提示（severity=info 或 warning，不含 error）；⑧ 恢复后 cordis.patch.yml sha 回 ce0b0b81。 |
| A2 单删 compact-router（软） | 同上；apply-preset-patch --status 四预设均 patched | 面板执行「软卸载 compact-router」 | ① snapshot 返回 200、5 卡渲染；② compact-router 卡显示「已软卸载/未安装」；③ lib/compact-router 目录存在且 sha 不变；④ apply-preset-patch --status 输出 standard/ptc/cordis/liangshen 均不含 patched；⑤ doctor error=0 且输出含 compact-router 缺席提示（severity≠error）；⑥ 恢复后 --status 四预设重新显示 patched，doctor 回 0/0/0。 |
| A3 单删 agent-memory（软） | 同上 | 面板执行「软卸载 agent-memory」 | ① snapshot 返回 200、5 卡渲染；② agent-memory 卡显示「已软卸载/未安装」；③ lib/agent-memory 目录存在且 sha 不变；④ cordis.patch.yml 不含 agent-memory 插入块且为合法 YAML；⑤ .panel-write-backups/ 新增 manifest；⑥ doctor error=0 且输出含 agent-memory 缺席提示；⑦ 恢复后 sha 回 ce0b0b81。 |
| A4 单删 search-router（真） | 同上；cordis.patch.yml:7 为 searchProvider: auto-search | 面板执行「真卸载 search-router」 | ① panel/custody/search-router-*/manifest.json 存在且 body 文件数、逐文件 sha 与源目录一致；② lib/search-router 目录不存在；③ cordis.patch.yml 不含 search-router 插入块；④ cordis.patch.yml:7 不存在 searchProvider=auto-search（键已回到系统默认）；⑤ snapshot 返回 200、5 卡渲染，search-router 卡显示「已卸载（已存档/可恢复）」，web-search-local 仍 mounted；⑥ .panel-write-backups/ 新增 manifest；⑦ doctor error=0 且输出含 search-router 缺席提示（severity≠error），无 dangling provider 警告；⑧ 恢复后：lib/search-router 恢复、sha 回 ce0b0b81、:7 回 auto-search。 |
| A5 单删 web-search-local（真） | 同上；cordis.patch.yml:8 为 fetchProvider: local-fetch | 面板执行「真卸载 web-search-local」 | ① panel/custody/web-search-local-*/manifest.json 存在且 sha 清单与源一致；② lib/web-search-local 目录不存在；③ cordis.patch.yml 不含 web-search-local 插入块；④ :8 不存在 fetchProvider=local-fetch（键已回缺省）；⑤ snapshot 返回 200、5 卡渲染，search-router 仍 mounted；⑥ doctor error=0 且输出含 web-search-local 缺席提示（severity≠error），无 dangling provider 警告；⑦ 恢复后：lib/web-search-local 恢复、sha 回 ce0b0b81、:8 回 local-fetch。 |
| B1 搜索对同删（真） | 同上 | 面板依次或同批执行「真卸载 search-router + web-search-local」 | ① panel/custody/ 同时存在 search-router 与 web-search-local 两条 manifest 且 sha 清单齐；② lib/search-router、lib/web-search-local 均不存在；③ cordis.patch.yml 不含两插件插入块；④ :7 与 :8 均不存在对应键（系统默认）；⑤ snapshot 返回 200、5 卡渲染，两张搜索卡显示「已卸载（已存档/可恢复）」，其余 3 卡 mounted；⑥ doctor error=0 且输出含两插件缺席提示（severity≠error），无 dangling provider 警告；⑦ 恢复后 sha 回 ce0b0b81 且 :7/:8 回原值。 |
| C1 联动全软 | 同上 | 面板执行「软卸载 rate-throttle + compact-router + agent-memory」 | ① snapshot 返回 200、5 卡渲染；② 三卡显示「已软卸载/未安装」，搜索两卡仍 mounted；③ 三个 lib 目录均存在且 sha 不变；④ cordis.patch.yml 不含 rate-throttle 与 agent-memory 插入块；apply-preset-patch --status 四预设均不 patched；⑤ doctor error=0 且输出含三插件缺席提示（severity≠error）；⑥ 恢复后 sha 回 ce0b0b81、--status 四预设 patched、doctor 回 0/0/0。 |
| C2 极端组合 | 同上 | 面板执行三软二真（三联动软卸载；两搜索真卸载） | ① snapshot 返回 200、5 卡渲染；② 五卡显示各自卸载态文案（三「已软卸载」、二「已卸载（已存档/可恢复）」）；③ panel/custody/ 搜索两条 manifest 完整；④ cordis.patch.yml 不含四插件插入块；:7 与 :8 均回缺省；apply-preset-patch --status 四预设均不 patched；⑤ doctor error=0 且输出含五插件缺席提示（severity≠error）；⑥ 面板管理页仍可操作（打开/收发与恢复列表）。 |
| C3 极端组合恢复 | C2 后 | 从面板对五插件逐一点「恢复」，随后重启（模拟 reload 或实际重启） | ① 五个恢复操作 RPC 返回 ok；② cordis.patch.yml sha 回 ce0b0b81；apply-preset-patch --status 四预设均 patched；③ snapshot 返回 200、5 卡 mounted；④ doctor error=0、warning=0、info=0；⑤ .panel-custody/ 恢复档仍保留（策略内不清档）；⑥ 各联动辅助检查逐项通过：rate-throttle compaction 路径可用、compact-router 重新暴露 instantOnceFor seam、search-router 注册 auto-search、web-search-local 注册 local-fetch。 |

### 3.3 文案预审点（判定侧把关清点）
- 六场景文案逐句读：2.1 至 2.10 全部由人工读出，确认无工程黑话、五要素齐、不出现「永久删除/不可恢复」。
- 冲突三态在 2.9 与 2.4/2.5 恢复说明一致：检测 → 用户选择 → 不自动覆盖。
- 失败提示 2.10 不夸大回滚，明示已完成/未完成与备份留存。

### 3.4 新增单测（列名）
1. row-anchor-unique.test：row 摘除/插回锚点唯一性（重复锚点拒绝）。
2. row-plan-sha.test：row 摘除/插回计划 SHA 固定、变化检测。
3. host-row-unset-restore.test：宿主行 7/8 的 unset 与恢复写入、恢复冲突三态（A/B/C）。
4. custody-archive.test：真卸载前保管区逐文件归档、manifest 文件清单、sha 清单生成与校验。
5. custody-restore.test：保管区恢复写回 + 恢复前再备份 + 恢复后复验 sha。
6. absence-card.test：快照五种状态渲染文案（mounted / soft-unmounted / true-uninstalled / installed-unmounted / dangling-mount）。
7. doctor-signal.test：body-vs-mount 与 provider-reference-integrity 两级检查只产出 info/warning、绝不产出 error。

### 3.5 全套回归（批验收底座）
- scripts/regression-all.mjs 全绿：p1 190/0、p2 16/0、p21 53/53、p22 104/104、p22-cards 79/79、p22b 17/17、q2-layer 14/14、q2-shipped 21/21、fidelity 38/38、backup-write 23/23、lint、node --test 93/0。
- doctor dry-run 0/0/0（未触碰隔离态前必须保持）。

### 3.6 报判与目视流程
- 施工批 1 全绿 + 隔离性矩阵硬断言汇总表 → 报判定侧 → 用户 reload 目视（重点看缺席态渲染、状态提示、恢复入口）。目视通过后方可进入施工批 2。
