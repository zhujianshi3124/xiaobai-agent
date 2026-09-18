# P2.4 施工批 1【引擎 + UI】收尾 · 全绿报判（呈判定侧验收）

> 会话轮次：新会话第 5 轮（2026-09-18 22:25–23:10 GMT+8）
> 台账：**L-056**　｜　前置：L-055（批 1 引擎报判）
> 提交：toolkit `53cbed4`（单元1 UI）· `c3bf522`（单元2 引擎四缺陷）· `cf51570`（单元3 面板级矩阵 + 回归接线）· `b37264d`（文档收口）
> 　　　doctor 仓 `edf0445`（D-UI-06/07）
> 结论：**批 1 引擎 + UI 双完成，全绿，报判。**

---

## 〇、状态恢复（按开工指令，报 3 行）

1. **恢复来源**：`HANDOFF-MASTER.md`（总索引 + 附录 C）→ `handoff-restart.md` §12 会话交接卡 → `ledger.md` L-055 → `git log`。前任提交链：toolkit `f95b751` / `979ae0d` / `542f89b`；doctor 仓 `20a38fe` / `3a03138`。
2. **恢复结论**：批 1 引擎侧（保管区三件套 / 卸载-恢复引擎 / 四条面板 API / 快照六态 / doctor 三检查）已全绿报判并落 L-055；**UI 渲染层当时未动**（L-055 明记「UI 属批 1 收尾」），判定侧裁定 = 方案 a（批 1 带 UI 一起关账）。
3. **本轮起点**：git 工作区干净、基线未漂移，按方案 a 实施 UI 收尾 → 新增面板级完整矩阵 → 报判。

---

## 一、交付物

### 1.1 UI 收尾（单元1 · `53cbed4`）

**两渲染器同步**（React bundle 与内联脚本必须同时改，缺一即断言失败）：

| 文件 | 角色 |
|---|---|
| `panel/client/index.js` | React bundle 渲染器（主） |
| `panel/client/panel.html` | 内联脚本渲染器（须与主渲染器行为一致） |

交付组件与接线：

| 组件 | 职责 |
|---|---|
| `P24Controls` | 每卡「软卸载 / 真卸载」入口 ＋「恢复」入口 |
| `UninstallDialog` | 卸载确认弹窗（软/真两条文案路径） |
| `RestoreDialog` | 恢复确认弹窗，含**冲突三态** A 保留当前值 / B 恢复卸前值 / C 取消 |
| `AbsenceBanner` | **六态缺席横幅**（mounted / soft-unmounted / true-uninstalled / installed-unmounted / dangling-mount / dependency-broken） |
| `RestoreBanner` | 恢复完成后横幅 |

快照字段接线（面板卡片 → 渲染器）：`status`、`statusCopy`、`restoreAvailable`、`conflict` —— **全部接线，无遗留裸值**。

**文案口径**：以 `p24-test-plan-batch1.md` **§2 全稿逐句**实现，重点两条：

- 软卸载确认 = 手动输入插件名 **一次**后点「确认软卸载」（如 `rate-throttle`）。
- 真卸载确认 = 手动输入插件名 **两次**后点「确认真卸载」（如 `search-router`）——服务端在 `execute` 阶段**再校验一次**告知性确认（不信客户端）。

### 1.2 面板级完整矩阵（单元3 · `cf51570`）

新增 `scripts/p24-ui-matrix.mjs` —— **623 断言全绿**。设计要点：

- **进程内跑真实 `panel/index.js`**：真实 guard、真实 body 解析、真实 `executePlan` 唯一写盘通道、真实四条 API（`uninstall/plan|execute`、`custody`、`restore/plan|execute`），**不是 mock**。
- **叠加两套真实渲染器**的渲染断言：同一场景双渲染器都要过。
- 全部落盘操作走 `os.tmpdir` 副本，**真实 `cordis.patch.yml` 零写入**（脚本开头 ABORT 校验 + 末尾首尾 SHA 双断言）。
- 覆盖：A0 前置基线 + **A1–A5**（软卸载五案）+ **B1**（真卸载 + 保管区 + 恢复）+ **C1–C3**（多摘批删 / 乱序恢复 / 缺依赖全链）。
- `scripts/regression-all.mjs` 接入 `p24-verify` + `p24-ui-matrix`，**回归底座由 12 项扩至 14 项**。

---

## 二、矩阵暴露并修补的 8 处缺陷（D-UI-01 .. D-UI-08）

> 关键事实：**这 8 处全部是「面板级 / 真实链路」才现形的缺陷**，引擎级 `p24-verify` 40/40 未能覆盖 —— 这正是本批加做面板级矩阵的价值。

| ID | 层 | 缺陷 | 修法 |
|---|---|---|---|
| **D-UI-01** | 渲染器 | 恢复入口条件写成 `restoreAvailable && !gone`，而 `gone` **恰含** `soft-unmounted` / `true-uninstalled` —— **最需要恢复的两态被隐藏** | 改为只认快照字段 `restoreAvailable`（唯一真源）；两渲染器同改 |
| **D-UI-02** | 快照 | `dependency-broken` 未加 `mounted` 守卫：本体已真卸载时也被依赖缺席翻转，吞掉「可一键恢复」语义 | 依赖循环整体包进 `if (mounted) { ... }` |
| **D-UI-03** | 引擎 | `relOffsetWithinConfig` 取**现读位次**，同段兄弟键先被摘除即偏小（`fetchProvider` 由 2 掉到 1），逐条恢复时插到 `searchProvider` **之前** ⇒ 回基线失败 | 按面板台账（软卸载账 + 保管区 manifest）里已摘兄弟键的 `afterKeys` **补偿原始位次**；`hostKeyAfterKeys` 贯穿 plan / record / execute |
| **D-UI-04/05** | 引擎 | 行块插回位仅凭**前后两锚**，同批多摘时两锚俱已不在场 ⇒ 乱序恢复错位 | 改为**邻接证据图**定位（`order-successor` / `order-predecessor`）；并新增**长期邻接留痕** `.panel-custody/row-adjacency.json`（`recordRowAdjacency` / `listRowAdjacencies`），与软卸载清账**解耦**、只增不减 |
| **D-UI-06** | doctor | 保管区归档内的 `dsh.plugin.json` 被当作**在案本体**重复登记 ⇒ 真卸载 + 恢复后 `reg.name-collision` 误报 **error**（C3④ 要求 0/0/0） | 新增 `isPanelArchiveRel(rel)`；`discoverReadRecords` 用 `isManifestRel(rel) && !isPanelArchiveRel(rel)`，归档目录不再作注册面 |
| **D-UI-07** | doctor | `presetMountedFor` 原口径「任一预设 patched ⇒ 任何本体都算已挂载」把 **body-vs-mount 检查整体压哑**，A1⑦/A3⑥「软卸载后仍产出缺席提示」不成立 | 收窄为只覆盖 `doctor-signals.json` **新字段** `presetManagedNames`（缺省回落旧行为）；**零硬编码、signals 信号驱动不变** |
| **D-UI-08** | 路由 | `panel/index.js` **漏 import** `createPresetRestorePlan` ⇒ compact-router 恢复 **500 internal**（ReferenceError） | 补齐 import |

**矩阵夹具修正（非产品缺陷）**：副本预设桥默认开启（对齐真实基线 —— compact-router 由预设补丁挂载），否则副本落 `installed-unmounted` 且 doctor 不回 0/0/0；另修 harness 自身两处（`textOf` 需渲染纯呈现组件；`direct()` / `p24Body` 需清 `indexOverrides`）。

---

## 三、测试证据（原文）

### 3.1 全套回归（`scripts/regression-all.mjs`，14 项 + node --test）

```
  ✓ p1-smoke              passed=215 failed=0
  ✓ p2-smoke              passed=16 failed=0
  ✓ p21-verify            53/53 PASS
  ✓ p22-verify            104/104 PASS
  ✓ p22-cards-ui          79/79 PASS
  ✓ p22b-retention-scope  17/17 PASS
  ✓ p24-verify            passed=40 failed=0
  ✓ p24-ui-matrix         passed=623 failed=0
  ✓ q2-layer-scan         14/14 PASS
  ✓ q2-shipped-scan       RESULT: 21/21 PASS
  ✓ master-merge-fidelity RESULT: 38/38 PASS
  ✓ backup-write-test     23/23 PASS
  ✓ pluggable-lint        通过：lib/ 与 test/ 无跨插件静态 import / eager re-export。
  ✓ node --test           pass=93 fail=0
══════════════════════════════════════════════════════════
全部通过
```

### 3.2 doctor 只读三检查（真实仓 + 真实 `~/.dsh`）

```
dsh-toolkit doctor (dry-run, read-only)
scope: D:\dsh-plugins\dsh-toolkit
config: C:\Users\LENOVO\.dsh
profile: web
issues: 0 (error 0, warning 0, info 0, fixable 0)
```

（YAML 的 `!!js` 未解析 tag 警告来自 js-yaml 对预设表达式的固有提示，**非 doctor 问题**，不影响结论。）

### 3.3 真实 `cordis.patch.yml` 零写入自证

```
path   = D:/dsh-plugins/dsh-toolkit/cordis.patch.yml
bytes  = 3097
sha256 = ce0b0b81c91ca4c420bb5302b2dbe951de0347ca729122511be288aa7c2b76b9
MATCH  = true
CRLF_only = true
```

> ⚠️ **基线认址勘误（本轮澄清）**：核「真实基线」认的是 **`D:/dsh-plugins/dsh-toolkit/cordis.patch.yml`**（3097 B，含 5 子插件行，`sha ce0b0b81…`）——
> **不是** `~/.dsh/profiles/web/cordis.patch.yml`（217 B、`ef189a8c…`，是另一份近乎空的 patch）。二者同族但**不同文件**，勿混。

---

## 四、呈验请求

### 4.1 呈判定侧验收

请判定侧对以下三项把关：

1. **UI 交付**（`53cbed4`）：两渲染器组件与 §2 全稿文案的**逐句一致性**（尤其真卸载「输入两次」）——脚本已逐句断言，仍请人工过一遍口径。
2. **缺陷修补**（`c3bf522` + doctor `edf0445`）：D-UI-01..08 八处的修法**是否越界或改变既有语义**（判定侧关注点：D-UI-07 的信号收窄是否影响 doctor 其它检查；D-UI-04/05 新增的长期留痕是否合规）。
3. **矩阵可信度**（`cf51570`）：面板级矩阵是否足以支撑「批 1 关账」的硬验收口径。

### 4.2 用户 reload 目视清单（**只读、不改盘**）

reload 面板后重点看四件事：

1. **六态卡片**：对已卸载/未挂载插件，卡片是否正确显示对应缺席态文案（而非一律「正常」）。
2. **dependency-broken**：某个被依赖插件缺席时，依赖方卡片是否正确显示「依赖缺失」警示样式与文案。
3. **恢复入口**：`soft-unmounted` / `true-uninstalled` 两态卡片**应出现「恢复」入口**（此前被隐藏的正是这两态）。
4. **确认弹窗文案**：点开卸载/恢复弹窗，文案与 `p24-test-plan-batch1.md §2` 一致；**真卸载需输入插件名两次**才可点「确认真卸载」。

> 本轮**未产生任何真实写盘**：全部测试走临时副本；真实 `cordis.patch.yml` sha 未变（见 3.3）。目视环节纯只读，不会改盘。

---

## 五、纪律确认

- **WIP 提交纪律**：每单元一次 WIP 提交（`53cbed4` / `c3bf522` / `cf51570`），文档收口单独提交（`b37264d`）。
- **真实 `cordis.patch.yml` 写入**：**0 次**（除经用户面板确认的操作外，本批无任何真实写盘）。
- **预设写入**：本批**未触发**任何 §4 预设写（只调既有脚本的口径保持）。
- **基线**：`ce0b0b81…`（3097 B / CRLF）全程未变。
- **卡同步**：`HANDOFF-MASTER.md` 附录 C + 叠加 4.1 进度行、`handoff-restart.md` §12、`ledger.md` L-056 均已同步。

---

## 六、下一步

```
批 1 全绿报判（本文） → 判定侧验收 → 用户 reload 目视 → 批 1 关账 → 施工批 2（doctor 操作台 + 双回滚 UI）先证后写
```
