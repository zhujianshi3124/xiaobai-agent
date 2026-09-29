════════════════════════════════════════════════════════════════════════════
第 13 轮 · 补验收补充呈报（尾② 注入点全表 + 摘要 B 之 U1–U5 逐行）+ 盲抽结果
生成时刻(GMT+8) 2026-09-18 13:25  执行侧 = 本会话
对应裁决 第 13 轮：「P2.3 开工前置清单 ①②」—— ① 注入点全表 + U1–U5 补呈；② 盲抽 8 句回报
落盘文件 panel/docs/evidence/ROUND13-SUPPLEMENTARY-2.md
盲抽正本 panel/docs/evidence/MASTER-BLIND-PROBE-8.txt（scripts/master-blind-probe.mjs 生成，可重放）
════════════════════════════════════════════════════════════════════════════

## 0. 本件用途与边界

- 上轮（第 12 轮）补验收**已通过**的部分（尾①三命题 / 设计语义定案 / 摘要 B 状态表 / 摘要 C）不再重述；
  本件只补第 13 轮点名的**两块缺口**：**尾②（loader 注入点清单）正文全表** 与 **摘要 B 的 U1–U5 逐行内容**。
- **本轮零磁盘动作**（延续第 12 轮）：未改 `cordis.patch.yml`、未重启、`lib/` 与 `panel/*.js` 零改动。

---

## 一、尾② · loader 注入点全表（Q2 穷尽的基准清单）

**命题来源**：Q2 穷尽标准修正 —— **不以任何一侧的层定义为准，以 loader 源码定案为准**。
**正本**：`api-notes.md` §「P2.0③」**§③.1 注入点总表（按应用顺序）**（`:208-222`）；本表在其上**加「已扫与否 / 未扫原因」两列**，逐行内容与 ③.1 一致（源码锚点从略，见 ③.1，此处只给文件级锚点）。

**应用顺序（唯一权威出处）** = `allPatches()` @ `dsh/lib/profile-boot-Dk-7KqJc.js:212-220`：
`bundlePatches → profile.patches → homePatches → overlays`（后者覆盖前者，**顶层赋值 / 整块替换，非深合并** —— `README.zh.md:144`）。

| # | 注入点 | 物理路径 | 优先级与覆盖语义 | 已扫与否 | 未扫原因 |
|---|---|---|---|---|---|
| 0 | profile 根配置（启动时**重写为 `[]`**） | `~/.dsh/profiles/web/cordis.yml` | **base**（非覆盖源，每次启动被无条件重写） | **未扫** | `~/.dsh` 红线内，无授权。**⚠ 同族缺口申报**：此前 ③.4 只点名 #3，#0/#2/E1 同处红线而未单列 —— 随 U8 一并补扫即可闭合 |
| 1 | **bundle patch 层**（可 N 个，`dsh.profile.bundles` 序） | `D:\dsh-plugins\dsh-toolkit\cordis.patch.yml`（**本 toolkit 即此**） | patch 平面第 1 段（其后各层可按 id 覆盖它） | ✅ **已扫**（Q2 ①，`q2-layer-scan`；现 `22fde85` 已提交，字节账 3015+82=3097） | — |
| 2 | profile 用户 patch 层 | `~/.dsh/profiles/web/cordis.patch.yml` | patch 平面，**晚于 bundle** | **未扫** | `~/.dsh` 红线内，无授权（**同族缺口**，随 U8 补扫；存在性亦未核） |
| 3 | **home 用户 patch 层** | `~/.dsh/cordis.patch.yml` | patch 平面，**晚于 profile 层（优先级更高）** | **未扫 = U8** | `~/.dsh` 红线内；**用户授权催收中**（扫完报结论：「无」/「文件不存在」皆结论） |
| 4 | `--patch <file>` overlay（**可重复**，argv 序） | CLI 参数（无固定磁盘载体） | patch 平面**最后段** | 不适用 | 本次运行 `dsh web` 未带该参数，**无磁盘载体可扫**；语义已源码定案 |
| 5 | telemetry 合成补丁（追加最后） | env `DSH_TELEMETRY_DISABLED` | 条件合成（组合含 `session-telemetry-otel` 行时） | 取值未验证 | 非文件载体；env 实际取值未取证（`profile-boot:184-190`） |
| E1 | 环境层 `.env`（**非 patch**） | 继承 env > 调用目录 `.env` > `~/.dsh/.env` | env 注入面（非 patch） | **部分**：红线外 4 处候选路径已核**均不存在**（`D:\dsh-plugins\.env`、`dsh-toolkit\.env`、`panel\.env`、`D:\.env`）；`~/.dsh/.env` **未核** | `~/.dsh` 红线内，无授权（**同族缺口**） |
| E2 | `!!js` 表达式（配置内嵌 JS，启动时求值） | patch / config 任意值位 | 配置面的代码执行面 | ✅ **已定案**（源码 `entry.ts:104-108`）+ **P2.2b Q1 安全闸**（非字面量 `disabled` 读写两侧危害与防护已实现并测试） | — |
| E3 | agent-preset 组合面（**独立平面**，非 patch 层） | shipped `…\dsh-agent-presets\presets\<id>\agent.cordis.yml` + `~/.dsh/.agent-presets\<id>\agent.cordis.yml` | **同 id 首根胜**（shipped `system` 遮蔽 `user`，与 patch 平面方向**相反**） | ✅ **已扫**（shipped 侧 21/21 = U4；用户侧 `.agent-presets` 2 目录 = 一次性授权已扫，L-032） | — |
| E4 | toolkit 预设改写路径（**非 patch 层**，直接改源文件） | `scripts/apply-preset-patch.mjs` 就地改 preset 的 compaction 行 | 绕过 patch 机制，直接改预设源文件（有 `.bak` 可回滚） | ✅ **已扫**（Q2 ④ + U4 diff） | — |

**结论**：patch 平面的**红线外部分已穷尽**（#1 全扫、#4 不适用、#5 非文件）；**红线内 4 处（#0 / #2 / #3 / E1 的 `~/.dsh/.env`）未扫** —— 其中 #3 已立 **U8**（授权催收中），**#0 / #2 / E1 为本轮补呈时如实补登的同族缺口**（不悄悄扩权，随 U8 同一批授权一并补扫即可全部闭合）。

---

## 二、摘要 B · U1–U5 逐行补呈（第 13 轮点名）

| # | 一行内容（做了什么 / 结论是什么） |
|---|---|
| U1 | **reload 一次 + §七 7.1 清单目视** —— 用户已完成并回报三项全绿（**停用 ✓ / 复原 ✓ / 互不牵连 ✓**），双层分立、确认页人话、`compact-router` 无开关均符合口径；记入 `HANDOFF-MASTER.md` 叠加 4.5（2026-09-18）。 |
| U2 | **真实终验 + 语义化提交** —— 第 10 轮 a–e 取证暴露 **(c)✗ / (d)✗ / (a) 部分✗**（`TERMINAL-ACCEPTANCE-ROUND10.txt`，LCS 重建 4 次写链）⇒ 第 11 轮裁决 **(c) 不改判降级 + 授权恢复**：`restore-cordis-baseline.mjs --apply` 达成逐字节基准 `ce0b0b81…`（3097 B / CRLF），随后**语义化提交 `22fde85`**（+4 行，内容纯净，溯源缺口封闭）。 |
| U3 | **Q2 四层 patch 栈扫描** —— `q2-layer-scan.mjs`（默认 **14/14**；`--agent-presets` **20/20**）：①仓根 `cordis.patch.yml` 9 个 `- id:` 行（5 挂载 + 2 顶层 + 2 组 id）、无同 id / 无覆盖遮蔽声明、CRLF 成立；②③ `lib` 与 `panel` manifest 无 patch 能力；④（授权后）只有 `compact-router` 经预设改写挂载、零残留。**附带产出**：「四层栈」命题判**转述失真第四例**，穷尽标准修正为**以 loader 源码为准**（= 尾②全表的由来）。 |
| U4 | **3 个 shipped preset 补扫** —— `q2-shipped-scan.mjs` **21/21**：三命题全「无」（五 id 行无 / 覆盖声明无 / `minimal` 未动）；唯一命中 = 三份各 1 行 `compact-router`（upstream `compaction-basic` 原位替换，Δ +5 行/+142 B，`cordis.patch.yml:3` 自陈）⇒ **文档化注入路径，非泄漏**；三份 sha 逐份 == `patchedSha`。 |
| U5 | **总文档全文合并落盘** —— `HANDOFF-MASTER.md` 合并版：九大节**原文保真**（不发明强调；3 项排版归一已枚举）+ 本侧全部以 `📌` 叠加块呈现（原文零改动）；保真抽检 `master-merge-fidelity.mjs` **38/38**；另经第 13 轮**判定侧盲抽 8 句复核 8/8 逐字命中**（见 §三）。 |

---

## 三、盲抽 8 句回报（第 13 轮前置 ②）

**正本**：`evidence/MASTER-BLIND-PROBE-8.txt`（脚本 `scripts/master-blind-probe.mjs` 生成，可重放；探针由判定侧指定，本侧未挑选）。

**结果：8/8 全部「逐字命中」**（无一处需要引号变体；P2 按判定侧指示以落盘为准修正笔误「profile 局 → profile 层」后检索）：

| # | 覆盖区 | 行号 | 结果 |
|---|---|---|---|
| P1 | 开头段（原文头部引用块） | 11 | 逐字命中 |
| P2 | §三列表归一区 | 57 | 逐字命中（笔误已按指示修正） |
| P3 | §三列表归一区 | 60 | 逐字命中 |
| P4 | §三列表归一区 | 61 | 逐字命中 |
| P5 | §六普通区 | 252 | 逐字命中 |
| P6 | §九普通区 | 328 | 逐字命中 |
| P7 | §二表格重建区 | 41 | 逐字命中 |
| P8 | §八分号特例区 | 310 | 逐字命中 |

逐句 ±20 字上下文见正本（脚本逐句打印）；**检索全程落盘文件零改动**。

---

## 四、第 13 轮其余裁决的登记（本件只登记，正文在各正本）

- **U9**：判定侧批准**随下个写盘批次刷新 marker**（语义化留痕），不需用户单独表态 ⇒ 附录 B U9 状态已更新为「已批准（随下个写盘批次）」。
- **U12**：判定侧**推荐乙（窄版）** —— 仅注入点清单内文件、仅只读、层间覆盖检查用途，类比 `devices.json` 先例；理由：该检查需固化为例行防线，逐次授权使防线失效。**仍待用户裁决**（已随二选一呈用户）；正文 `handoff-restart.md` §11.14 已补记推荐。
- **P2.3 开工前置**：① ✅（本件）② ✅（§三）③ ⏳ U8 授权后扫描结论 ④ ⏳ U12 用户裁决。**全齐 → P2.3 开工**（第一动作 = `config.enabled` 五插件源码消费点证据，先证后写）。

---

## 五、本件自证

| 项 | 值 |
|---|---|
| 本轮磁盘动作 | **零**（未改 `cordis.patch.yml`；未重启；`lib/` 与 `panel/*.js` 零改动） |
| 基准 SHA | `cordis.patch.yml` = `ce0b0b81c91ca4c420bb5302b2dbe951de0347ca729122511be288aa7c2b76b9`（3097 B / CRLF，本轮复验未变） |
| 新增脚本 | `scripts/master-blind-probe.mjs`（探针判定侧指定，可重放，退出码 8/8=0） |
| 新增证据 | `evidence/MASTER-BLIND-PROBE-8.txt`（脚本生成）· 本件（本侧撰写） |
| 生成时刻 | 2026-09-18 13:25（GMT+8，实测 `new Date()`） |

---

## 引用勘误（守卫登记 · EXE-BOOT-014 追加）

> **本节是追加件：上文一行未改。** 依 EXE-BOOT-014 裁② 口径，文档引用守卫（`toolkit:scripts/doc-ref-guard.mjs`）
> 自本批起把存档件的存在性 / #符号 / 跨仓缺前缀失败与活文档同价判红；存档件是历史证词，改写即篡改证词，
> 故清偿走这里——逐条登记「原文里的引用形态 ⇒ 为什么判红、真位在哪、属哪一类」。行号形态按裁① 继续容忍，不在本表内。
> 条目里的 token 用 ASCII 双引号写出＝守卫规则 ⑤「声明原文不是文档引用」的既裁语境，本表自身不产生新引用。

- "evidence/MASTER-BLIND-PROBE-8.txt" —（原引 56/90 行，共 2 处）仓外视角前缀。真位＝`panel/docs/evidence/MASTER-BLIND-PROBE-8.txt`（在场）。
- "devices.json" —（原引 78 行，共 1 处）宿主面文件：~/.dsh 下的配对设备账件（本会话实测该路径当前不在盘），非仓内可核。

> 计数自证：本文件登记 2 个 distinct 引用形态，覆盖守卫本批红集中属于本文件的 3 条。
