# P2.4 扩容 · 证据批（扩展版七项）

> 阶段：证据批（只读取证）· 产出：本证据正本
> 范围：D:\dsh-plugins\dsh-toolkit 五子插件 + panel + doctor（D:\dsh-test-sandbox\projects\doctor）
> 结论：用户原假设「限流/压缩/记忆有联动」成立；另发现搜索插件参与联动（search-router × web-search-local × web.config），依用户指令呈判定侧定分类。

---

## ① 联动关系全图（含缺席降级行号）

| 源插件 | 目标插件 / 宿主面 | 联动性质 | 关键源码 | 缺席降级 / 失败行为 |
|---|---|---|---|---|
| compact-router | agent-memory | 紧耦合可选依赖：读台账/registry/进度注入正典、陈旧提示、resolveSidByHostId；manifest optionalDeps 唯一项 | lib/compact-router/dsh.plugin.json optionalDeps；lib/compact-router/agent-memory.js:17-40；lib/compact-router/index.js:59-64 / 107-113 / 128-133；lib/compact-router/guidance.js:13-20 | lib 不可用 → 返回 null；正文摘要跳过台账正典/陈旧提示；运行时反解兜底 hostId（agent-memory.js:73-87 显式 warning）；压缩不崩溃 |
| rate-throttle | compact-router（compaction 服务） | 运行时服务消费：降级准备压缩调用 ctx.get("compaction")，优先 instantOnceFor() 免 LLM 压缩 seam | lib/rate-throttle/index.js:747-775 | 无 compaction 服务 → warn「no compaction service」并跳过降级压缩；限流主流程不中断（:762-765） |
| search-router | web-search-local | 证据新发现：运行时 delegate provider 依赖。mode=auto/local 时 pickDelegate 可能选 local-multi / local-fetch，由 web-search-local 注册 | lib/search-router/index.js:128-145 | delegate 缺失 → 抛 WebError：install @gausszhou/dsh-web-search-local (or set mode=official)（:137-143）；官方 provider 缺失也抛 WebError |
| web.config | search-router + web-search-local | 宿主 web 插件 patch 层直引：searchProvider=auto-search（search-router provider id）与 fetchProvider=local-fetch（web-search-local provider id） | cordis.patch.yml:7-8；lib/search-router/index.js:4-5；lib/web-search-local/index.js:61-62 | 两 provider 任一未注册 → web search/fetch 请求失败（同 search-router delegate 行为） |
| compact-router | agent-memory 数据根 | 文件级耦合：压缩存档写入 <agentMemoryRoot>/sessions/<sid>/compaction/（默认 ~/.agent-memory） | lib/compact-router/archive.js:18-25；lib/compact-router/guidance.js:13-24 | agent-memory 缺席时 compact-router 仍写该根（无代码依赖），数据兼容可续用 |

联动分类结论（待判定侧采纳）：
- 紧联动：compact-router ↔ agent-memory（双向语义：压缩读台账 / 记忆事件由压缩平台消费）。
- 松联动：rate-throttle → compact-router（限流降级时消费 compaction；缺席时优雅降级跳过）。
- 新呈：search-router → web-search-local，且再上连 web.config 的 searchProvider/fetchProvider——搜索插件确实参与联动。
- 独立：web-search-local 本体不依赖其它四插件；agent-memory 本体不依赖其它四插件。

---

## ② 独立性证据 + 疑点即报

- 静态 import / eager re-export：grep -R "../<sibling>" lib 0 命中；node scripts/pluggable-lint.mjs 通过（lib/ 与 test/ 无跨插件静态 import / eager re-export）。
- 唯一跨插件动态 import = compact-router/agent-memory.js:21 import("../agent-memory/lib/index.js")，惰性 + 失败缓存 null，符合红线。
- 其它插件互访均为注册面（inject/events/services/providers）或 ctx 服务，不由源码直连。
- 疑点（即报）：cordis.patch.yml:7-8 的 web 行属于 bundle 内宿主板配置，不受五卡开关管理；软/真卸载 search-router 或 web-search-local 时若不同步改写这两个字段，会留悬挂 provider 引用。设计稿需处理该行的联动改值/提示。

---

## ③ 软卸载 / 真卸载机制（含 compact-router 特案）

- 现有引擎能力（panel/manager/apply-engine.mjs）：仅 toggle 行键 disabled（planRowFlag）与 config 标量编辑。尚无整块 row 摘除/插入恢复能力。
- 软卸载（挂载行摘除 + 本体保留 + 一键恢复）：
  - rate-throttle / search-router / web-search-local / agent-memory-runtime 四行位于 cordis.patch.yml:13-78，可摘除各 insert 块；恢复 = 原样插回。
  - 需要新增 planRemoveRow / planInsertRow（沿用锚点唯一 + SHA + 写前备份）。
- 真卸载（本体删除 + 挂载行摘除）：
  - 删除范围 = lib/<plugin> 目录（agent-memory 208K/25 files；compact-router 72K/6 files；rate-throttle 48K/2 files；search-router 9K/2 files；web-search-local 68K/2 files）+ 对应 patch 挂载行。
  - ~/.dsh 热配置默认保留；重装后检测「已安装未挂载」→ 提示恢复。
- compact-router 特案：不在 cordis.patch.yml，而是 scripts/apply-preset-patch.mjs 改写 shipped/user presets。
  - 现状：standard / ptc / cordis / liangshen 均 patched（--status 实测）。
  - 软卸载机制候选：--undo 将预设回写为 compaction-basic（本体保留）。
  - 真卸载候选：--undo 回写预设 + 删除 lib/compact-router 目录。
  - 恢复联动：rate-throttle 在软/真卸载后仍可回归 stock compaction-basic 服务；恢复 compact-router 后 instantOnceFor() seam 重新可用。

---

## ④ DSH 插件安装 / 重装机制源码证据

平台机制：dsh plugin 是薄 pnpm 转发器。
- C:\Users\LENOVO\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh\lib\plugin-Ddi42qoW.js:8-14（模块说明）
- 首次运行：runPlugin() 初始化 profile（plugin-Ddi42qoW.js:101-109）。
- 安装/删除：spawnSync("pnpm", args, { cwd: <profileDir> })，随后 reconcilePlugins()（:109-125）。
- 重装 = dsh plugin --profile <name> add <package> 再次运行；挂载层 dsh.profile.bundles 由依赖安装状态 reconcile（:31-79）。

本项目特殊性（证据）：@local/dsh-toolkit 为本地 bundle（D:\dsh-plugins\dsh-toolkit），其五子插件不是独立 npm profile 依赖；单插件删除后的“重新安装”不能直接套用 dsh plugin。重装路径候选：面板备份恢复 lib 目录 / git 恢复 / 预设回写（compact-router）。设计稿须明确。

---

## ⑤ 恢复联动机制

- compact-router → agent-memory：getSuiteAgentMemory() 为惰性单例（agent-memory.js:17-40）。插件重新挂载后【重启】新进程会重新解析成功；进程内缓存 null 不自动重试（agent-memory.js:18-19）。
- rate-throttle → compaction：compactionFor() 每次请求现取 ctx.get("compaction")（:747-753），恢复后【重启】立即可用。
- search-router → web-search-local：providers() 每次搜索现取 ctx provider map（:134-146），恢复后【重启】立即可用；若缺失则降级为 WebError（当前默认 mode=auto 通常选 official 可绕过本地）。
- 结论：恢复联动 = 把摘除的挂载行/预设行写回 + 重启；无需额外接线。

---

## ⑥ doctor 联动检测信号源

- doctor 扫描根：scopeRoot 下所有 dsh.plugin.json（walkAll 深度 8）+ 根 cordis.patch.yml、configRoot/profileRoot 的 patch 文件（engine.mjs:202-245）。
- 信号源类型：manifest 注册面（inject/services/providers）与 hostFaces 对表（engine.mjs:1132-1190 + host-faces.json）；manifest schema；package 依赖解析；源码静态 import / bare specifier（engine.mjs:956-1057）。
- 当前缺口（设计稿要补）：doctor 读 cordis.patch.yml 只作 patch 文本扫描，不校验「lib 目录存在 ↔ patch 行挂载」的对应关系；没有「已安装未挂载」或「挂载行已摘除但目录仍存」的检查。设计稿需新增 doctor 信号声明（engine 零硬编码插件名）。

---

## ⑦ doctor 可执行操作 + 双回滚路径

doctor 每项可执行操作（当前 engine 只自动生成两类）
- op: replace：文本替换（本地别名等），engine.mjs:554-557。
- op: install-package：缺依赖时按 package.json 范围安装，engine.mjs:917-920。
- 其余 issue 均 fix.class=manual（plan=[]，只报告不执行）。
- executor 支持 FILE_OPS = replace / insert / delete / create-file（executor.mjs:7），但 engine 尚未发过 insert/delete/create-file；apply 锁定 doctor-apply.lock（executor.mjs:130-144）。

医生回滚路径（已存在）
- 状态：~/.dsh/doctor-patch-state.json（rollbackChain + files + installedPackages），executor.mjs:145-170。
- 备份：每次 apply 写 ~/.dsh/doctor-backups/<stamp>/...（executor.mjs:171-180, 256-275）。
- 回滚：executeRollback()（executor.mjs:511+），逐项 rollback-file / rollback-install；新回滚前再备份当前态（beforeRollbackBackupRoot）。

面板备份回滚路径（当前半成品证据）
- 引擎两段式写盘已自带写前备份：.panel-write-backups/<stamp>/manifest.json（manifest 含 reason/note + 写前 sha），apply-engine.mjs:577-586。
- 面板 backup.mjs 只有 createBackup / listBackups，无 restore。
- 有基线恢复脚本 scripts/restore-cordis-baseline.mjs（fail-closed 重建基准），但它是专用脚本，不是面板通用回滚。
- 设计稿要补：面板备份回滚 UI = 选择备份 → 重读 manifest → 写前再备份当前 → 恢复 + 复验 sha。

---

## 证据批结论（待判定侧）

1. 原假设「限流/压缩/记忆有联动」成立：rate-throttle→compact-router（松）、compact-router→agent-memory（紧）。
2. 新发现并呈判定侧：search-router 参与联动（依赖 web-search-local 注册的 local 能力 + web.config 直引两 provider）。
3. 软/真卸载机制需扩展 apply-engine row 摘除/插回；compact-router 须走预设回写机制。
4. 单插件重装不能直接复用 dsh plugin（本 bundle 是本地目录 bundle）。
5. 恢复联动统一依赖「写回挂载/预设 + 重启」。
6. doctor 需新增「lib 目录 ↔ 挂载行」联动信号。
7. 双回滚：doctor 回滚已存在；面板备份回滚需新增 restore。
