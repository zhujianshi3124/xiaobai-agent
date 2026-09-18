# P2.4 销毁式 v2 施工 · 全绿报判（呈判定侧验收）

> 时刻：2026-09-19 01:0x GMT+8　｜　台账：**L-060**
> 依据：`panel/docs/p24-design-v2-destroy.md` §11 冻结清单 ＋ §6.1 **文案 v2（三句必含）** ＋ §7 矩阵重建（A4/A5/B1/C2/C3 ＋ **5 条硬判据**）
> 纪律：**测试不压缩**（矩阵重建 → 全套回归＋node --test 重跑 → doctor → 真实 patch 零写入自证）
> 结论：**施工完成，全绿报判。**

---

## 1. 全绿结果（本次报判时点）

```
✓ p1-smoke 225 · p2-smoke 16 · p21-verify 53 · p22-verify 104
✓ p22-cards-ui 79 · p22b-retention-scope 17 · p24-verify 53
✓ p24-ui-matrix 666/0 · q2-layer-scan 14 · q2-shipped-scan 21
✓ master-merge-fidelity 38 · backup-write-test 23 · pluggable-lint 通过
✓ node --test 93
全部通过
doctor（真实仓 + 真实 ~/.dsh，dry-run）: issues 0 (error 0, warning 0, info 0)
真实 cordis.patch.yml = ce0b0b81…（3097 B / CRLF）**零写入**
```

**断言数变化（口径说明，非通过率）**：`p24-verify` 40 → **53**（新增销毁式/挂载/硬判据断言）；`p24-ui-matrix` 546 → **666**（真卸载段由「下架断言」重建为**销毁式全链路**）；`p1-smoke` 215 → **225**（路由 13→15，新增两条写路由的 gate 断言）。

---

## 2. 交付清单

### 2.1 引擎 · 真卸载「去存档步 → 收据先行」

| 文件 | 改动 |
|---|---|
| `panel/manager/custody.mjs` | `archiveForTrueUninstall`（复制 body）**移除** → 新增 **`writeDestroyReceipt`**：只读枚举 + 逐文件 sha，**不复制任何内容**；`schemaVersion:2` / `kind:"true-uninstall-receipt"` / **`bodyStored:false`** / `deleted.body[]+totals` / `rebuild.{rowBlock,insertAt,prevTopRaw,nextTopRaw,hostKey,presetStateSnapshot}`；**只建收据目录，不建 `body/`**。`verifyCustodyBody` / `restoreBody` **移除**。`listCustody` 改读 `deleted.body` 并新增 `mountable`。新增 `purgeCustodyBodies`（§3.2 迁移工具，Q6 **默认不自动执行**） |
| `panel/manager/uninstall.mjs` | `executeTrueUninstall` / `executePresetTrueUninstall` = **收据先行（写失败即中止 fail-closed）→ `executePlan` 摘行+宿主 unset → `rmSync` 彻底删除 → 复验收据在案**；`createTrueRestorePlan` / `executeTrueRestore` **移除**；新增 **`createMountPlan` / `executeMount` / `executeMountPreset`**（**复用 `planInsertRow`**）；软/预设恢复加 **body-missing 守卫** |

### 2.2 挂载算子（销毁式唯一恢复途径 · v2 §5）

- 行块事实来源 = **收据 `rebuild.rowBlock`**；宿主键回写用 `rebuild.hostKey`（原值 + 原偏移 + afterKeys）。
- **无收据 → `mount-no-receipt` 拒绝**（**不臆造插件 config**）。
- 预设管理插件（compact-router）：挂载 = 重新执行预设补丁（只调既有脚本，双层留痕不变）。
- 新增路由 **`POST /api/toolkit-panel/mount/plan`** ＋ **`/mount/execute`**（`{change:true}` + guard）；**路由数 13 → 15**。

### 2.3 快照（六态 v2 口径）

| 项 | 改动 |
|---|---|
| 判据 | `custodyArchived` → **`receiptOnFile`** |
| `true-uninstalled` 文案 | **「已卸载（无副本）· 重新安装后面板可挂载」** |
| `unknown-absent` 文案 | 「未安装 · 本体与挂载行都不在」 |
| `restoreAvailable` | **收窄为仅 `soft-unmounted`**（真卸载无恢复路径） |
| **新增 `canMount`** | `installed-unmounted` 且本体在且（预设插件或收据在案） |
| **新增 `bodyStats`** | 只 `stat` 不读内容 → 供确认页「将删 N 个文件 / M 字节」 |

### 2.4 两渲染器 · 文案 v2（React ＋ 内联，同步）

**三句必含**（判定侧点名的用户目视项）：

1. **空窗期警告**：「⚠ 本次是彻底删除，面板不会留下任何副本。当前版本尚未开源，删除后无法恢复，也无法重新安装。等项目开源后，你可以重新下载安装，届时面板会检测到「已安装未挂载」并帮你重新挂载。」
2. **收据透明句**：「面板只留下一份删除收据：被删文件的清单、逐个校验值和你的填写原因。收据仅用于事后对账，不含文件内容，不能用来恢复。」
3. **回收站句**：「注意：删除不进回收站。文件是直接从磁盘上移除的，系统回收站里也找不到，无法通过回收站找回。」

**两补强（Q5 采纳）**：**(a)** 弹窗顶部重复短句「**开源前删除不可恢复**」，且空窗期警告置于**两次输入之间**；**(b)** 确认前展示**将删文件清单 + 总字节数**（`bodyStats`）。
按钮文案 = 「**确认彻底删除**」；新增「**挂载（重装后）**」入口；**真卸载态两渲染器均无「恢复」「挂载」入口**。

### 2.5 矩阵重建 ＋ 5 条销毁式硬判据

**硬判据（每例真卸载均断言）**：① 收据在案且 kind 正确；② **收据目录无 `body/`**；③ **`.panel-custody` 全域无任何源码副本**（`*.js/.mjs/.cjs/.ts` 递归扫描）；④ **收据无恢复用字段（body / restore）**；⑤ **`lib/<plugin>` 已彻底删除**＋收据自洽（逐文件 sha 齐 / totals 一致 / `rebuild.rowBlock` 齐）。

- **A4** 单删 search-router（销毁）· **A5** 单删 web-search-local（销毁）→ dependency-broken · **B1** 搜索对同删（两收据并存）
- **C2** 五子同卸（三软 + 两真·销毁）
- **C3 = 完整用户故事**：三软恢复 →（断言：两搜索**仍缺席**，符合销毁式语义）→ **模拟重装（源码放回 lib）→ `installed-unmounted` + `canMount=true` → 走真实 `/mount` API 挂载 → sha 回基线 `ce0b0b81…`（字节级）＋ 宿主键 `:7 / :8` 回原值 → 5 卡 mounted ＋ doctor 0/0/0**

§2 弹窗逐句段改为**文案 v2**（含两补强断言）；§2.9 真恢复段改**挂载确认页**段。

---

## 3. 施工中显影并修复的回归（如实申报）

- **收据 schema 改名未同步读取方**：`restore` → `rebuild` 后，`recordedHostKeyEntries` / `panelRowAdjacencies` 仍读旧字段 ⇒ **宿主键原偏移补偿与行块邻接证据失效** ⇒ C3 无法字节级回基线（`firstDiff @L7`：`searchProvider` 位次被 `fetchProvider` 顶替）。**修法**：新增 `rebuildOf(manifest)` 统一读 `rebuild`（兼容 v1 `restore`）。
- **测试夹具污染诊断面**：模拟重装的源码暂存原放在**副本仓内**（`.reinstall-stash`），被 doctor 当作在案本体重复登记 ⇒ `reg.name-collision` error（与 D-UI-06 同类）。**修法**：暂存移到**副本仓之外**。

---

## 4. ★ 实施偏差申报（1 处，待判定侧裁决）

**v2 §5.3 路径②** 原拟：「无收据（外部放回 lib、面板从未卸载过）→ 行块由 `plugin-registry` **内置模板生成**」。

**实施改为：拒绝（`mount-no-receipt`）**。理由：

1. 各插件 `config` 差异极大（rate-throttle 有 20+ 字段与 `staticGroups`，search-router 有 mode/official* 等），**凭模板生成 = 面板臆造用户配置**，与项目「**零硬编码**」纪律直接冲突；
2. **终验段 2 的用户故事（真删 → 重装 → 挂载）必然持有收据**，故该路径不影响任何验收场景；
3. 无收据情形由 **doctor「已安装未挂载」warning** 如实提示，用户可手工处置。

**影响**：仅影响「面板外摘除 + 手工放回 lib」这一非主路径；已在 `canMount` 上同步收紧（无收据不显示挂载入口，避免给出注定失败的动作）。

---

## 5. 呈判定侧验收 ＋ 用户目视

1. **判定侧**：① §2.4 三句必含与两补强的**措辞与交互**（重点：空窗期警告置于两次输入之间、顶部重复短句）；② **5 条硬判据**是否足以支撑「不留副本」的产品承诺；③ §4 **实施偏差**是否认可。
2. **用户目视**（U14 前置，只读）：reload 后点开任一插件的「真卸载」→ 核对**三句**是否都在、是否在两次输入**之间**看到空窗期警告、按钮是否为「确认彻底删除」、是否展示将删文件数与字节数。

> 本轮**未在真实仓产生任何写入**：全部落盘测试走 `os.tmpdir` 副本；真实 patch sha 未变（§1）。目视为纯只读。

---

## 6. 后续

```
[本次] 报判（本文） → 判定侧验收 ＋ 用户目视三句文案
[随后] 真卸载正式上架（U14 关闭）→《用户日后实测指引》可落笔（U16）
[最后] 批 2（doctor 操作台＋双回滚）先证后写 —— 证据清单批呈判定侧
```
