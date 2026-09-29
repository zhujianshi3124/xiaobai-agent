════════════════════════════════════════════════════════════════════════════
第 12 轮 · 催收三项补验收正文摘要 + U8/U9 呈报 + 新增 U12
生成时刻(GMT+8) 2026-09-18 13:07  执行侧 = 新会话（P2.2 关账后第一动作）
对应裁决 第 12 轮：「P2.2 关账成立 ✓」；保留事项 = 催收三项事后验收权（不推翻关账）
落盘文件 panel/docs/evidence/ROUND12-SUPPLEMENTARY-ACCEPTANCE.md
════════════════════════════════════════════════════════════════════════════

## 0. 本件用途与边界

- P2.2 关账**已被判定侧接受**；本件**只做「内容补验收」的材料呈报**，**不重开关账、不改任何结论**。
- 呈报对象 = 判定者；三项摘要**全部指向已在版本库内的正本**（可逐条回溯）。
- **本轮零写盘**：未触碰 `cordis.patch.yml`、未重启、未改任何 `lib/` 与 `panel/*.js`；仅新增本证据文件 + 正本文档的索引 / 台账 / 授权语义记录。

---

## 一、摘要 A —— `api-notes.md` 两新节（催收项 ①）

正本：`panel/docs/api-notes.md`

- §「P2.2 启停开关 · **设计语义定案**」（`:309–328`）
- §「Q2 尾① · **shipped presets 补扫结论（正文）**」（`:332–347`）

### A.1 设计语义定案（`:309–328`）

**命题**：本面板的「启用」= **写入显式 `disabled: false`**，**不删键**。

| 层级 | 事实 | 锚点 |
|---|---|---|
| 源码 | `planRowFlag()`：键**已存在** → **原地替换**该行值；键**不存在** → 锚点行（`- id:`）**正下方**插入（缩进 = 锚点 + 2）；**从不删除键**（本函数无任何删除逻辑） | `panel/manager/apply-engine.mjs` |
| 实现自陈 | JSDoc 原文：`enabled=true` → 写 `disabled: false`（显式声明为启用；**不删键**，语义更明确） | `createTogglePlan()` |
| 运行语义 | loader 只在 `Boolean(disabled)` 为真时跳过加载 ⇒ **`false` 与「缺键」同义** | `cordis-plugin-loader/src/config/entry.ts:84-108` |
| 字节语义 | toggle 往返（停用 → 复原）会留一条显式 `disabled: false` ⇒ **字节级「无痕」不在面板能力范围内** | 同上 |

- **关账依据**：第 10 轮 a–e 取证中 **(c) 不达标**；第 11 轮裁决 **(c) 不改判降级**，改以**授权恢复**达成逐字节基准 `ce0b0b81…`；本语义**正式文档化**。
- **字节无痕的唯一路径** = 恢复程序 `node scripts/restore-cordis-baseline.mjs [--apply]`（**fail-closed** + 写前备份 + 写后复验）。
- **明示暂缓**：给引擎加「复原删键」能力**不立项**（理由见 `HANDOFF-MASTER.md` 叠加 4.6 / `ledger.md` L-036）。
- 证据：`panel/docs/evidence/TERMINAL-ACCEPTANCE-ROUND10.txt`。

### A.2 Q2 尾① 结论正文（`:332–347`）

**范围**：DSH 安装目录下三个 shipped preset 的**当前内容**
（`AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-agent-presets\presets\{standard,ptc,cordis,minimal}\agent.cordis.yml`）。
该目录**不属项目红线**（红线仅 `~/.dsh`、cloudflared 进程、五子插件源码目录）⇒ **无需额外授权**。

**三命题全部为「无」**：

1. toolkit 五个 insert-id 行（`rate-throttle` / `web-search-local` / `web-search-router` / `agent-memory-runtime` / `toolkit-manager`）= **无**；
2. 覆盖 / 遮蔽声明（`disabled` / `override` / `merge` 类命中）= **无**（**全部是 upstream 自带内容**）；
3. `minimal` **未被改动**（0 处 `compact-router`，与脚本明文「设计上不动 minimal」一致）。

**唯一命中项定性**：`standard` / `ptc` / `cordis` **各含 1 行** `- id: compact-router` ——
系 `scripts/apply-preset-patch.mjs` 把 upstream 的 `- id: compaction-basic` / `@deepseek-ai/dsh-compaction-basic` **原位替换**的结果
（三份一致：Δ **+5 行 / +142 B**），且 `cordis.patch.yml:3` 注释**自陈**此事 ⇒ **文档化注入路径，非泄漏、非旧名残留**。

**sha 对账**：`standard a5e4d871…` / `ptc 7d9aff86…` / `cordis 9525c9a6…` **逐份 == `preset-patch-state.json.patchedSha`**；upstream 残留与旧名 `@local/dsh-compact-router` 残留**均 0**。

**证据**：`evidence/Q2-SHIPPED-PRESET-SCAN.txt`（**21/21 PASS**）、`Q2-SHIPPED-PRESET-DIFF.txt`（55 KB 逐行 diff）。

---

## 二、摘要 B —— 附录 B 待用户项 U1–U11（催收项 ③）

正本：`HANDOFF-MASTER.md` **§附录 B**。下表为**第 12 轮销项后**口径：

| # | 事项 | 状态 / 口径（2026-09-18 13:07） |
|---|---|---|
| U1 | reload 一次 + §七 7.1 清单目视 | **✅ 已完成**（用户侧终验全绿；记入 叠加 4.5） |
| U2 | 真实终验 + 语义化提交 | **✅ 已完成**（授权恢复至基准 + `22fde85`） |
| U3 | Q2 四层 patch 栈扫描 | **✅ 已闭环**（`q2-layer-scan` 默认 14 / `--agent-presets` 20） |
| U4 | 3 个 shipped preset 补扫 | **✅ 已闭环**（21/21） |
| U5 | 总文档全文合并落盘 | **✅ 已闭环**（保真抽检 38/38） |
| U6 | 「compact-memory」串读确认 | **✅ 已销项**（第 12 轮裁决：用户第 5/6 轮已确认 5 卡齐全、`compact-memory` 为串读，在案） |
| U7 | `doctor/dry-run` 过度收口保留 | **✅ 已销项**（第 12 轮裁决：判定者第 5 轮已认可 + `api-notes`「勿当 bug 修正」已落实） |
| U8 | 注入点 3（`$DSH_HOME/cordis.patch.yml`）未覆盖 | ⏳ **待用户决定**（随本件一并呈报，见 §四） |
| U9 | `preset-patch-state.json.patchedSha` 陈旧 | ⏳ **待用户决定**（随本件一并呈报，见 §四） |
| U10 | 黄警告恢复指引文案优化 | **已实现 + 断言 79/79**；生效 = **待 P2.3 前合并 reload** |
| U11 | 「删键能力」暂缓否决 | 已记录；**P2.3 后有真实需求再立项** |
| **U12** | **授权语义澄清（第 12 轮新增）** | ⏳ **待用户定**（见 §五；正文 `handoff-restart.md` §11.14） |

---

## 三、摘要 C —— 3 项排版归一枚举 + 「全文 diff」如实说明（催收项 ②）

正本：`evidence/MASTER-MERGE-NORMALIZATION.txt`（+ 保真证据 `MASTER-MERGE-FIDELITY.txt`）

**一句话结论**：落盘采用「**原文即所收**」原则 —— 用户总文档以**纯文本**送达，本侧**不重新发明任何强调**，
仅做 **3 处排版归一**（把粘贴造成的结构丢失还原为 Markdown），**语义零改动、文字逐字保留**。

**三处枚举**：

1. **强调：不补发** —— markdown 加粗（`**…**`）与反引号在传输/粘贴中**已被剥离**，本侧**一律不重新添加**。
   （样例：§三 第 2 行「四层 patch 栈…」落盘即所收，**无**反引号。）
2. **§二「五份正本文档」：表格结构重建** —— 粘贴中**丢了列分隔符**；按语义还原为 **5 行 × 3 列** Markdown 表格，**单元格内容逐字保留**。
3. **§三 / §四 / §六 / §七 / §九：逐行罗列 → 列表项** —— 按行还原为 `- ` 列表，**行序不变、不合并、不拆分**，文字逐字保留。

**特例（不归一）**：§八为**单行原文**，其 `；` 分隔**不拆分** —— **拆分即改写**。

**保真证据**：`node scripts/master-merge-fidelity.mjs` → **38/38 PASS**。
方法 = 从用户原文（纯文本）取 **38 个逐字探针**对落盘文件做**子串比对**，且**探针本身不含格式标记**（与送达形态一致）
⇒ 能真正检出「本侧是否擅自补了格式或改了字」。

**关于「全文 diff」——如实说明（不伪造）**：

> **无法给出「用户原文 ↔ 落盘」的字面全文 diff。** 原因：用户原文以**会话消息**形式送达，**从未落盘为文件**；
> 会话压缩后原文**不可再取回**（第 7 轮已穷举取证：`conversation_search` **0 命中** + 全仓 grep **0 命中**）。
> **在无原文副本的前提下，任何「全文 diff」都只能是伪造。**
> 故本侧以**可复现的逐字探针（38/38）**作为保真证据 —— 它证明「落盘包含原文的全部关键句」，
> 并以「探针不含格式标记」的方式，间接证明「本侧未添加格式强调」。
> **若判定侧要求字面全文 diff，请提供原文文件**（或允许逐字重发），本侧**可立即生成逐行 diff**。

---

## 四、U8 / U9 呈报（随三项摘要一并）

- **U8 · 注入点 3（`$DSH_HOME/cordis.patch.yml`）未覆盖**：
  该文件落在**红线** `~/.dsh` 内，且**优先级高于 profile 层**，理论上可携带 toolkit 任意 id 行 ⇒ 若求穷尽需**单次只读授权**补扫。
  **本轮未读** —— 属**「遇授权边界如实申报」**，不硬闯。（语义澄清见 §五 U12）
- **U9 · `preset-patch-state.json` 的 `liangshen.patchedSha` 陈旧**：
  内容正确、hash 漂移（说明改写后被后续改动过）。**不构成功能问题**；是否刷新 marker 待用户定。

---

## 五、新增 U12 —— 授权语义澄清（第 12 轮，交用户定）

「**一次性授权**」的语义此前无成文化定义。第 12 轮判定侧要求澄清并列为用户项。**两个候选（二选一或自定义）**：

1. **维持逐次授权**：「一次性授权」**以该次任务为限**；此后凡涉 `~/.dsh` 读取**须重新授权**（U8 补扫即按此办）。
2. **纳入「既定只读程序」清单**：由用户批准，把某条**具体路径**（如 `~/.dsh/cordis.patch.yml`）**类比 `devices.json`** 列入既定只读程序，今后**按程序读、不再逐次授权**。

> 现状（未裁决前的默认执行口径）：**按选项 1 办** —— 未获新授权前，`~/.dsh` 下除 `devices.json`（既定程序豁免，`panel/index.js:96`）外**一律不读**。

正文落点：`handoff-restart.md` **§11.14**。

---

## 六、本件自证（可复现 / 可回溯）

| 项 | 值 |
|---|---|
| 本轮磁盘动作 | **零**（未改 `cordis.patch.yml`；未重启；`lib/` 与 `panel/*.js` 零改动） |
| 基准 SHA | `cordis.patch.yml` = `ce0b0b81c91ca4c420bb5302b2dbe951de0347ca729122511be288aa7c2b76b9`（**3097 B / CRLF**） |
| 正本落点 | `HANDOFF-MASTER.md` 附录 B（U12 + U6/U7 销项）· `handoff-restart.md` §11.14 · `ledger.md` L-037 |
| 生成时刻 | **2026-09-18 13:07（GMT+8）**，实测 `new Date()`（不采信会话 `<current_time>`） |

---
（本件按项目约定**入库、只增不改**。内容变更层面无任何变更 —— 仅**索引 + 台账 + 授权语义**三项新记录。）

---

## 引用勘误（守卫登记 · EXE-BOOT-014 追加）

> **本节是追加件：上文一行未改。** 依 EXE-BOOT-014 裁② 口径，文档引用守卫（`toolkit:scripts/doc-ref-guard.mjs`）
> 自本批起把存档件的存在性 / #符号 / 跨仓缺前缀失败与活文档同价判红；存档件是历史证词，改写即篡改证词，
> 故清偿走这里——逐条登记「原文里的引用形态 ⇒ 为什么判红、真位在哪、属哪一类」。行号形态按裁① 继续容忍，不在本表内。
> 条目里的 token 用 ASCII 双引号写出＝守卫规则 ⑤「声明原文不是文档引用」的既裁语境，本表自身不产生新引用。

- "evidence/Q2-SHIPPED-PRESET-SCAN.txt" —（原引 57 行，共 1 处）仓外视角前缀。真位＝`panel/docs/evidence/Q2-SHIPPED-PRESET-SCAN.txt`（在场）。
- "DSH_HOME/cordis.patch.yml" —（原引 74/115 行，共 2 处）以变量代指宿主根的记法（DSH_HOME 非目录名），真面＝`~/.dsh/profiles/web/cordis.patch.yml`（运行时面）。
- "evidence/MASTER-MERGE-NORMALIZATION.txt" —（原引 84 行，共 1 处）仓外视角前缀。真位＝`panel/docs/evidence/MASTER-MERGE-NORMALIZATION.txt`（在场）。
- "devices.json" —（原引 128/130 行，共 2 处）宿主面文件：~/.dsh 下的配对设备账件（本会话实测该路径当前不在盘），非仓内可核。

> 计数自证：本文件登记 4 个 distinct 引用形态，覆盖守卫本批红集中属于本文件的 6 条。
