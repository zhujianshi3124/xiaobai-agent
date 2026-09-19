# P2.4 批 2 施工报告 · doctor 操作台＋双回滚（呈判定侧验收）

> 时刻：2026-09-19 12:1x GMT+8　｜　台账：**L-068**
> 依据：`p24-design-batch2-console.md` r3（判定侧验收闭环）＋ 用户批准开工（原文「我同意批准的」）＋ 开工令（D1 三条件硬前置／U16 r2＋§3.6(a) 随批交付／完工报判清单定版）
> 施工提交（toolkit 仓）：`508206d`(D3 引擎) → `b3b1575`(7 路由) → `bafcc56`(§3.6a) → `75d719a`(操作台 UI) → `f35336b`(矩阵 D 段) → `0335863`(守卫回归)
> doctor 仓提交：`a865bde`（D1：`--only`＋`--states`＋`--yes` 语义文档化；与 toolkit 仓互引）
> 结论：**批 2 施工完成；13/14 绿——唯一红项为两线碰撞（泛化线夹具污染真实仓 doctor 闸），非本批代码，呈用户/判定侧裁决。**

---

## 1. 交付清单（对照设计稿 r3 §11）

| 交付 | 内容 | 提交 |
|---|---|---|
| **D1**（doctor 仓） | `--only <issueId>`（白名单 `[A-Za-z0-9._-]`；未找到/不可执行分码拒绝）；`--states` 只读回滚链摘要（D2）；`--yes` 语义文档化（`--help`＋executor 源码注释「调用方须已完成知情确认」） | doctor 仓 `a865bde` |
| **D2** | 面板不直读 `~/.dsh`：`GET /doctor/states` 经 CLI `--states` 取回滚链＋面板写前快照列表；doctor 不可达 ⇒ `degraded`（UI 渲染禁用态，不假装可用） | `b3b1575` |
| **D3** | `restoreSnapshot`：写前快照经 executePlan **唯一通道**整文件回写（stamp 白名单防穿越／SHA 闸／snapshot-identical 拒绝／恢复自身再留快照）；路由 `snapshot-restore/plan+execute` | `508206d`+`b3b1575` |
| **操作台** | `doctor/apply/plan+execute`（fresh dry-run 前置＋单条语义＋install-package 本地源预检）、`doctor/rollback/plan+execute`（CLI 无确认层 ⇒ 面板两步补齐）、两渲染器 UI（可执行组／体检回滚段／配置快照段／收据对账段＋§3.1–3.5 逐字文案＋空态句） | `b3b1575`+`75d719a` |
| **§3.6(a)** | 真卸载可选「删除原因」输入：两渲染器同位（将删清单后/输名前，不挤占空窗期警告）＋plan 请求体 `reason`（仅 true 模式，截 200）＋D10 断言 | `bafcc56` |
| **U16 r2** | `user-true-uninstall-guide.md`（六步版）随批交付 | `3e8ef07` |

**路由 15 → 22**（设计稿 §6.1 表 6 行 = 7 端点；比设计多 1 系表内最后一行含 plan+execute 两条——口径差异如实申报）；p1-smoke 同步。

## 2. 测试结果（全套回归，定版清单）

```
✓ p24-verify            63/0（53→63：⑧ restoreSnapshot 10 断言）
✓ p24-ui-matrix        718/0（666→718：D 段 52 断言，D1–D10 全链路）
✓ p22-cards-ui          79/79  ✓ p2-smoke 16  ✓ p21-verify 53  ✓ p22-verify 104
✓ p22b-retention-scope  17  ✓ q2-layer 14  ✓ q2-shipped 21  ✓ fidelity 38  ✓ backup-write 23
✓ pluggable-lint 通过    ✓ node --test 141（93→141：+48 为泛化线 P1–P3 新增测试文件，口径注释）
✗ p1-smoke            263/264——唯一 FAIL＝「真实仓 doctor 0/0/0」（两线碰撞，见 §3）
doctor 仓自测：D1 21/21 ｜ 既有 run-tests 13/13 ｜ stage4a/4b 全过 ｜ stage3「影子复检」FAIL 为
  既有环境性失败（stash 对照复现，与本批无关，如实申报）
```

**断言口径变化（如实）**：p24-verify 53→63、p24-ui-matrix 666→718（口径扩张非通过率变化）；node --test 93→141（泛化线新增，非本批）；p1-smoke 264→263 通过（详见 §3，非本批代码缺陷）。

## 3. ★ 两线碰撞申报（唯一红项，待用户/判定侧裁决）

**事实**：开工令排期裁定「批 2 先收官 → 泛化线后跑」。施工期间泛化线仍向**同一分支**落了 4 个提交：

| 泛化线提交 | 内容 | 与本批关系 |
|---|---|---|
| `0a993a4` P0 | 侦察报告（docs/p0-recon.md） | 文档；已零接触 |
| `8ccc374` P1 contract | contract/ TS 模块＋test/fixtures/contract | 无文件交叠 |
| `8d84729` P2 registry | registry/ TS 模块＋**test/fixtures/registry/（含故意无效 manifest 夹具）** | **碰撞源** |
| `5af0a49` P3 doctor | doctor/ TS 模块（泛化线自建 doctor 子系统，与本批 doctor CLI 分属两域）＋更多无效夹具 | **碰撞源** |

**碰撞表现**：泛化线的负向测试夹具 `test/fixtures/registry/*/dsh.plugin.json`（故意缺必填字段）落在 doctor CLI 真实仓扫描面 ⇒ 真实仓 dry-run **5 error**（全部 `schema.required-missing`，5 文件均在 `test/fixtures/registry/`）⇒ p1-smoke「真实仓 doctor 0/0/0」闸 FAIL。**本批零代码缺陷**：5 error 全部由泛化线夹具构成；除该闸外全套 13/14 绿。

**备选方案（呈裁，未擅动）**：
- **(a) 泛化线侧**：夹具移出 doctor 扫描面（如 `test/fixtures` 改名/加 doctor 忽略约定）——归泛化线改；
- **(b) doctor 域**：engine 扫描跳过 `test/` 目录（doctor 仓小改，需判定批；对齐「夹具≠在案本体」既有口径 D-UI-06 同族）；
- **(c) 闸口径**：p1-smoke 真实仓 doctor 断言排除 `test/fixtures` 类目（需判定批）。

本侧倾向 **(b)**（一次修根、两线各自可用；doctor 域小改随批 2 验收）。**未动手**。

## 4. 纪律自证（定版清单）

- **D1 三条件兑现**：① `--yes` 文档化 ✓（--help＋源码注释）；② doctor 仓改动随批呈验收、两仓提交互引（doctor `a865bde` ↔ toolkit `508206d`/`b3b1575`）✓；③ 面板 1 级确认层（两步 plan-execute＋单次确认＋预览）先于 spawn 接通 ✓（execute 路由只认 plan token；CLI `--yes` 仅受托执行）。
- **零写入自证**：真实 `cordis.patch.yml` = `ce0b0b81…`（3097 B）全程零写入；真实 `~/.dsh` doctor 三件套（patch-state/backups/lock）保持不存在（矩阵 D9 断言＋实测）；全部落盘测试走 `os.tmpdir` 副本（doctor 侧 `--config-root` 指副本）。
- **真实仓备份目录只读扫描**（报判常规自证）：`.panel-backups`/`.panel-write-backups`/`.panel-custody`/`preset-backups` **零五插件源码**（17 个 JS = P2.1–P2.2 面板开发期人工留档，非插件源码）。
- **文案逐字在产品面**（叠加 8.3 规则）：§3.1–3.6 全部文案经矩阵两渲染器断言（含 §3.6 原因段标题/说明/占位/maxlength 与请求体 reason——不得以「字段在 schema」替代「环节在产品面」）。

## 5. 呈验收清单

1. 判定侧：批 2 施工验收（D1 三条件兑现／D 段 52 断言／文案断言／§3 口径差异申报）；**§3 两线碰撞备选方案 (a)/(b)/(c) 裁决**。
2. 用户：reload 目视（清单届时判定侧出）——操作台四段＋真卸载「删除原因」格＋三句文案回归位。
3. 用户/判定：泛化线排期（批 2 关账前是否要求其暂停增量提交）。
