# 账 b · 用户软卸载操作 · 事后取证（真实机 · 只读取证）

> 时刻：2026-09-19 00:0x–00:15 GMT+8　｜　取证方式：**只读**（未改任何文件）
> 对象：用户于面板上手工执行的 **web-search-local 软卸载 → 软恢复** 往返
> 台账：拟 **L-058**（承接 L-057）
> 结论：**完整往返 ✓ 字节级复原至基线 ce0b0b81**；doctor **0/0/0**；本体保留 ✓

---

## 1. 两笔写前备份（`.panel-write-backups/`）

用户操作共产生 **2 笔**写前备份，即「软卸载」与「软恢复」各一笔：

### 笔 1 —— 软卸载的写前备份

```
目录   : .panel-write-backups/2026-09-18T15-48-16-322Z/   (= 2026-09-18 23:48:16 GMT+8)
manifest.json:
{
  "stamp"     : "2026-09-18T15-48-16-322Z",
  "createdAt" : "2026-09-18T15:48:16.323Z",
  "reason"    : "panel-uninstall-soft",
  "note"      : "web-search-local 软卸载（摘除挂载行 + 宿主键 unset；本体保留）",
  "files": [{
    "abs"     : "D:\\dsh-plugins\\dsh-toolkit\\cordis.patch.yml",
    "savedAs" : "D____dsh-plugins__dsh-toolkit__cordis.patch.yml",
    "sha256"  : "ce0b0b81c91ca4c420bb5302b2dbe951de0347ca729122511be288aa7c2b76b9"
  }]
}
→ 备份镜像 = 3097 B，sha ce0b0b81… = **基线**（即卸载前的挂载态）✓
```

### 笔 2 —— 软恢复的写前备份

```
目录   : .panel-write-backups/2026-09-18T15-49-13-126Z/   (= 2026-09-18 23:49:13 GMT+8)
manifest.json:
{
  "stamp"     : "2026-09-18T15-49-13-126Z",
  "createdAt" : "2026-09-18T15:49:13.126Z",
  "reason"    : "panel-restore-soft",
  "note"      : "web-search-local 软恢复（行块插回 + 宿主键写回）",
  "files": [{
    "abs"     : "D:\\dsh-plugins\\dsh-toolkit\\cordis.patch.yml",
    "savedAs" : "D____dsh-plugins__dsh-toolkit__cordis.patch.yml",
    "sha256"  : "e8dad4b9a8a1a63feca03805c8d8dd54863bd385c338ad57a1acdfd1686d96e6"
  }]
}
→ 备份镜像 = 2877 B，sha e8dad4b9… = **已软卸载态**（恢复前）✓
```

**插件名 / 时间 / reason·note 三项如实：** `web-search-local`｜23:48:16 → 23:49:13（相隔 57 秒）｜`panel-uninstall-soft` → `panel-restore-soft`。备份链**两笔齐全**，方向正确（卸载的 pre 是挂载态，恢复的 pre 是卸载态）。

---

## 2. 摘行 diff（软卸载那一步的净效果）

**A** = 笔 1 镜像（卸载前 = 基线，3097 B / 83 行）
**B** = 笔 2 镜像（恢复前 = 已软卸载态，2877 B / 76 行）

```diff
--- A/cordis.patch.yml  (ce0b0b81…, 3097 B)
+++ B/cordis.patch.yml  (e8dad4b9…, 2877 B)
@@ 头部宿主行 @@
 - id: web
   config:
     searchProvider: auto-search
-    fetchProvider: local-fetch          ← ① 宿主键 unset（方案 A）
 
 - id: web-search-deepseek
@@ web-search-local 行块 @@
 
- - insert:                            ← ② 整段 insert 块摘除（6 行）
-     - id: web-search-local
-       name: '@local/dsh-toolkit/web-search-local'
-       config:
-         engines: [searxng, google, duckduckgo, mojeek, bing, baidu, sogou, 360]

 - insert:
     - id: web-search-router
       name: '@local/dsh-toolkit/search-router'
```

**统计：删除 7 行、新增 0 行**（① 宿主键 1 行 + ② 行块 6 行）。

**严格校验（LCS 重建）**：`B === A 去掉这 7 行` → **YES ✓**，即**零改写、纯减行**。

> 附注（消歧）：patch 中 `- insert:` 行与空行重复出现，LCS 存在一组**字节等价**的替代表述（删 A58–A63 而非 A57–A62）。二者产出的文本**完全相同**（因 A57 与 A63 同为 `- insert:`），故不构成边界错位，锚点语义自洽。

**结构完整性**：卸载后 `web-search-router` 块仍保有自身 `- insert:` 头与完整 config，YAML 结构有效。

---

## 3. 当前真实 `cordis.patch.yml`

```
path   : D:\dsh-plugins\dsh-toolkit\cordis.patch.yml
bytes  : 3097
sha256 : ce0b0b81c91ca4c420bb5302b2dbe951de0347ca729122511be288aa7c2b76b9
mtime  : 2026-09-18T15:49:13.128Z   (= 23:49:13 GMT+8，即软恢复写入时刻)
判定   : sha == 基线 ce0b0b81 ⇒ **完整往返 ✓（已回到基线，未停在摘后态）**
```

⇒ **不是**「停在已软卸载态」的情形；无需用户再决定是否恢复。往返闭环成立。

---

## 4. 支撑事实

| 项 | 实测 |
|---|---|
| 本体保留（软卸载语义） | `lib/web-search-local/` **存在**，2 个文件 ⇒ 本体未删 ✓ |
| 软卸载台账清账 | `.panel-custody/soft-uninstalls.json` = `{}` ⇒ 恢复后条目已移除 ✓（`clearSoftRecord` 生效） |
| 长期邻接留痕（D-UI-05 实机首用） | `.panel-custody/row-adjacency.json`：`{before:"            - id: v4-flash", after:"    - id: web-search-local"}`、`{before:"    - id: web-search-local", after:"    - id: web-search-router"}` |
| doctor（真实仓 + 真实 `~/.dsh`，只读） | `issues: 0 (error 0, warning 0, info 0, fixable 0)` ✓ |
| 仓状态 | `git status` 干净（真实操作未污染版本库；`.panel-custody/` 已在 `.gitignore`） |

---

## 5. 取证结论

1. 用户软卸载**完整往返**，字节级复原至基线 `ce0b0b81…`（3097 B / CRLF）——**与「用户体感亲验通过」一致，且现已有字节级与账本级双重印证**。
2. 删除语义正确：**只摘挂载行 + unset 宿主键**，**未动本体**；恢复为**精确回写**。
3. 备份链、台账、邻接留痕三类落痕**齐备且方向正确**，无虚假承诺（manifest note 与实际动作一致）。
4. doctor **0/0/0**。

---

## 6. ⚠ 本次取证顺带暴露的一项**测试守卫假阳性**（非产品缺陷）

回归复跑出现 **1 项 FAIL**（`p24-ui-matrix` **622/623**）：

```
FAIL 真实仓无 .panel-custody 残留（本矩阵只动 tmpdir 副本）
```

**根因**：该守卫（`scripts/p24-ui-matrix.mjs:988`）写为

```js
!existsSync(root/.panel-custody) ||
readdirSync(root/.panel-custody).filter(n => n !== "soft-uninstalls.json").length === 0
```

即白名单**只放行 `soft-uninstalls.json`**。而用户这次**真实操作**合法地又产生了 **`row-adjacency.json`**（D-UI-05 引入的长期邻接留痕）——于是两个分支均为假，守卫误报。

- **性质**：测试守卫**白名单缺口**（同一批次内 D-UI-05 新增了长期留痕，却未同步进该守卫的放行名单），**不是**产品行为缺陷。
- **为什么此前 623/623 通过**：此前真实仓**无** `.panel-custody/` 目录，第一个分支为真即短路通过；用户真实操作后才现形。
- **意义**：这正是「真机验收」独有的价值——矩阵此前只在无残留的干净仓上跑过。

**建议修法（未动手，见 §7 闸门）**：二选一
- **最小修**：白名单加入 `row-adjacency.json`（与 `soft-uninstalls.json` 同级，均为面板运行期合法长期产物）。
- **更稳修**：把语义从「事后不存在」改为「**矩阵运行期间未新增/变更**」——运行前后对 `.panel-custody/` 做快照 diff，只断言增量。可根治同类白名单遗漏。

---

## 7. 闸门说明（为什么这项没直接修）

用户 2026-09-18 23:19 指令：**「待用户正式确认『开源前删除不可恢复』的空窗期后动工——确认前不改任何代码。」** 该守卫修正虽属**测试侧**、不改变任何产品行为，但落在「**不改任何代码**」的字面范围内，故**本轮未动手**，转为待裁决项（见《关账前置核验》§4-Q1'）。
