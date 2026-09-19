# P2.4 批 2 · 两线并行碰撞及 (b) 处置 —— 报判正本（判定侧执行，2026-09-19）

> 生成：新会话第 7 轮（批 2 收尾）· GMT+8 12:5x
> 上游：L-068 ④（碰撞呈裁，方案 (a)/(b)/(c)）→ **用户裁决：执行 (b)**；(a) 转泛化线作风格建议（经用户转告，泛化线产物零接触）；(c) 否决（改断言口径＝掩盖——真实体检 UI 也会脏，本文件 §5 留痕）。
> 两仓互引：**doctor@`f423d4a`** ⇄ **toolkit@本提交**（本文件随本提交入库，hash 见仓 git log；doctor 仓提交信息已注明「toolkit 侧报判包随后互引本提交」）。

## 1. 裁决内容与判据

- **(b) 执行**：doctor 扫描面跳过 `test/` 目录。
- **判据**：**D-UI-06 同族「夹具≠在案本体」**——`isPanelArchiveRel`（D-UI-06，归档目录里的 `dsh.plugin.json` 不算在案本体）的直系扩展：测试夹具目录是「故意无效」manifest 的住址，与在案判定天然相克；夹具在 `test/` 下＝留痕测试物，不是活体注册面。
- **治本口径**：在**走层层面**整体排除 `test/`（`walkRec` ＋ `walkSourceFiles` 两处走层共用 `isSkippedScanDir`），而非只挡 manifest——「防一切测试夹具误报」：将来 test/ 下出现任何被扫描面收集的文件种类（manifest/json/yaml）或被源码走层消费的脚本，都不入 doctor 扫描面。
- **唯一例外（fail-closed 防走偏）**：`lib/` 直下名为 `test` 的目录是**在案本体位**（`lib/<name>/dsh.plugin.json`），跳过它会把真实插件本体 fail-open 地藏掉，故放行。
- **(a) 处置**：泛化线夹具**留在原地不移动**（其 4 提交与 `docs/p0-recon.md` 零接触）；「夹具目录放在扫描面之外」作为风格建议经用户转告泛化线。
- **(c) 否决理由（判定侧留痕）**：p1-smoke 的「真实仓 doctor 0/0/0」闸是**真实体检面板也会消费的同一扫描面**——改闸口径＝把脏数据挡在测试里、留给真实 UI，属掩盖；且 (b) 成本更低（扫描面 17 行改动）且治本。

## 2. doctor 仓改动（`f423d4a`，2 文件 +44/−2）

| 文件 | 改动 |
|---|---|
| `src/engine.mjs` | 新增 `isSkippedScanDir(name, parentRel)`（含 D-UI-06 同族判据注释与 lib/ 例外）；`walkRec` 与 `walkSourceFiles` 的目录排除改经该函数（原四排除项 `node_modules/.git/doctor-backups/preset-backups` 语义不变） |
| `test/run-tests.mjs` | 新增断言测试（13→14）："夹具≠在案本体（D-UI-06 同族·两线碰撞裁决 b）"——见 §3 |

## 3. 新增断言（防回归双向锁）

- **test/ 下零检出**：`test/fixtures/registry/` 布置与泛化线同构的「故意无效」manifest（`schema.required-missing` 型＋JSON 语法错型）＋嵌套深度（`panel/test/fixtures/`）⇒ 断言**任何 severity 的 issue 均为 0**（不止 error——整个路径段出扫描面）。
- **对照组仍检出（防排除过宽）**：同型无效 manifest 落 `lib/broken-lib/` ⇒ `schema.json-syntax` 必须在案。
- **例外仍检出（防 fail-open）**：同型无效 manifest 落 `lib/test/`（lib 直下 test＝本体位）⇒ 必须在案。
- 断言助手 `underTestDir` 与走层规则**逐字镜像**（含 lib/ 例外）——首跑即抓出助手未镜像例外的缺口，已修（教训：断言侧规则必须从产品侧规则生成，不能凭直觉重写）。

## 4. 全套证据（原文：`P24-BATCH2-COLLISION-RESOLUTION-REGRESSION.txt`）

- **doctor 仓自测**（改后）：run-tests **14/14**（含新断言）· d1 **21/21** · stage4a **8/8** · stage4b **7/7** · **stage3 验收 a–g ALL PASS**（见 §6）· 真实仓 dry-run 探针 **0/0/0**（`doctor-runner` 同款调用路径，p1-smoke 同源）。
- **toolkit 全套回归**（改后，可重放 `node scripts/regression-all.mjs`）：**14/14 全绿** —— **p1-smoke 264/264**（L-068 时点 263/264 ⇒ **碰撞唯一红项消除**）· p24-verify 63/0 · p24-ui-matrix 718/0 · p22-cards-ui 79/79 · node --test 141 · 其余全绿。**口径与 L-068 定版清单一致，零口径变化**。
- **零写入自证**：真实 patch `ce0b0b81…`（3097 B）未动；toolkit 工作树净（泛化线 4 提交与其产物零接触）；真实 `~/.dsh` doctor 三件套保持不存在；doctor-backups 无新增。

## 5. 碰撞留痕（如实，供批 2 关账记录引用）

- **碰撞事实**：批 2 施工期间（开工令裁定「批 2 先收官→泛化线后跑」），泛化线向**同一分支**落 4 提交（`0a993a4` P0 / `8ccc374` P1 / `8d84729` P2 / `5af0a49` P3），其 `test/fixtures/registry/` 5 份故意无效 manifest 落进 doctor 真实仓扫描面 ⇒ p1-smoke「真实仓 doctor 0/0/0」闸 FAIL（263/264）。5 error 全系夹具，批 2 零代码缺陷。
- **处置**：用户裁 (b)（本文件）；(a) 转告；(c) 否决。处置后全绿（§4）。
- **两线教训（L-068 ① 已沉淀，此处补判定侧视角）**：两线共用一仓时，「谁的产物进谁的扫描面」必须在**扫描侧成文**（`isSkippedScanDir` 即该约定的代码化），不能依赖另一线自觉挪位。

## 6. stage3「影子复检」单独留档（既有环境性事项，勿并入本批）

- **施工时点（L-068 ①）**：doctor 仓 stage3 影子复检 FAIL——builder 以 **stash 对照复现**（无本改动同样失败）⇒ 既有**环境性**失败，与本批无关，如实申报。
- **本轮复跑（`f423d4a` 后）**：stage3 验收 a–g **ALL PASS**（含 e 段真实 configRoot 影子验证，前后 hash 一致）。环境条件未复现。
- **处置口径**：该 FAIL 归**既有环境性事项独立跟踪**，不进批 2 关账口径（既不作为红项、也不声明「已修复」——两轮观测如实并记：施工时 FAIL／本轮 PASS）。

## 7. 判定侧验收（本侧执行记录）

按「跨侧裁决以执行侧确认收讫为生效要件」：开工指令（用户裁 b＋收尾流程）已收讫并回报（3 行状态重建）。验收项逐条过：

| 验收项 | 结果 |
|---|---|
| 判据正确性（D-UI-06 同族，治本而非只挡本例） | ✓ 走层级排除＋两走层共用＋lib/ 例外 fail-closed |
| 断言有效性（夹具零检出＋对照组＋例外三向锁） | ✓ run-tests 14/14 |
| 既有行为零回归 | ✓ doctor 仓 run-tests/d1/stage4a/4b/stage3 全过 |
| 碰撞红项消除 | ✓ 真实仓 dry-run 0/0/0＋p1-smoke 264/264 |
| 定版口径不变（63/0·718/0·79/79·141） | ✓ 逐项相等 |
| 零写入自证（patch ce0b0b81／三件套缺席／备份零新增） | ✓ |
| 泛化线零接触（4 提交＋docs/p0-recon.md 未动） | ✓ git status 净；夹具未移动未读内容 |
| 两仓互引 | ✓ doctor@f423d4a 引 toolkit@f4b836c；本提交回引 f423d4a |

**判定侧验收：通过。批 2 关账前置仅余「用户 reload 目视」（清单：`P24-BATCH2-RELOAD-CHECKLIST.md`）——目视通过后出关账一包（含本碰撞留痕＋U 项清账）→ P2.4 收官。**
