# handoff-restart.md — toolkit 面板重启交接（P1 收尾）

生成时间：2026-09-17T02:00:00Z（本轮 gate 精读后）
状态：全部核查闭合，等待用户授权布防。

## 1. 门禁判据定案

- 源码：@linxin666/dsh-remote-web-ui/lib/index.js
  - makeGateListener  L583
  - isLoopbackClient   L560-566
  - isPairedDeviceRequest L601-610
- 判据链：先判断是否 loopback socket 且 loopback Host。
  - 若 socket 与 Host 都是 loopback => next()（本机桌面临时通道直接过）。
  - 否则 => enabled/requirePairingForLan 开关后，入 isPairedDeviceRequest：
    - 读 cookie dsh_pair 的 device id；
    - service.touchDevice(deviceId) 若活 session => next()，未配对/过期/被 revoke => false => 403。
- 判据定案：应用层判据 = cookie dsh_pair + 活 device session。Host 不是直接判据，Host 决定是否进入 cookie 分支（隧道公网域名会绕过 loopback-client 分支）。
- 与我方此前转述 loopback 直接过 的差异原因：转述遗漏了 isLoopbackClient 的第二个条件——Host 必须 loopback。公网隧道请求被 cloudflared --http-host-header 重写为稳定公网域名，所以 socket 虽为 127.0.0.1，仍不落入 loopback-client 分支，仍要查 cookie。用户实测未配对且 socket 全 127.0.0.1 仍被拦，与此一致。

## 2. 覆盖范围定案（第二次修正）

- 本地复现失败证明：无 cookie + Host=95c04a90ca73e397.dsh-market.com，panel /snapshot 与 /ui 均 200 放行。
- 源码根因：dsh-host-webserver 的 register(route) 只把 route 写入 exact/prefixes Map，不发射 api/gate；remote-web-ui 的 ctx.on("api/gate") 在当前 runtime 是死监听器。
- 实际覆盖：remote-web-ui 配对门禁只在其自有 /remote 前缀与 /pair* 页面生效；任何插件注册的 exact 路由都不在覆盖域。
- guard 终版公式：socket.remoteAddress loopback AND (Host loopback OR 有效配对校验)。
  - Host loopback：桌面本机直连放行。
  - 有效配对校验：优先 ctx.get("remoteWebUiPairing").isPairedDevice(request)；服务缺失时 fail-closed 读取 devicesFile 做 dsh_pair hasOwn 校验；任何读取/解析失败一律拒绝。
  - 写路由（POST /api/toolkit-panel/doctor/dry-run）额外 CSRF：sec-fetch-site 非 cross-site 且 origin 与 host 同源（无 origin 放行）。
- P2 必须走服务校验；fallback hasOwn 只是服务缺失时的 fail-closed 兜底。

## 3. 公网 hostname 稳定性定案

- hostname 形态：16hex + .dsh-market.com，下简称 stable host。本机实际：95c04a90ca73e397.dsh-market.com。
- 生成源码：@linxin666/dsh-remote-web-ui/lib/index.js
  - RELAY_BASE_SUFFIX = ".dsh-market.com"（L2556）
  - generateRelayIdentity：random(8).toString("hex") 作为 id（L2560-2566）
  - loadRelayIdentity：惰性 mint，存 ~/.dsh/remote-web-ui-registry/<profile>.json；文件存在且格式合法时永远复用（L2570-2605）
  - relayBaseOf：https://<id>.dsh-market.com（L2624）
  - quickTunnelFlags：cloudflared flag --http-host-header <host>，让本机 WebUI 看到的 Host 保持 stable host（L2937-2948）
- 稳定证据：
  - 身份文件 ~/.dsh/remote-web-ui-registry/web.json 的 Modify/Birth 时间 = 2026-09-07 12:17:52，之后未变；内容中的 id 与当前 cloudflared 命令行的 host 后缀一致。
  - 当前 cloudflared 进程（PID 16444，属 dsh web 直接子进程）命令行 --http-host-header 95c04a90ca73e397.dsh-market.com 为 Sep 17 运行时，与 Sep 7 落盘的 id 相同。
  - 定性：不同日期（Sep 7 → Sep 17）同域名，实证稳定。
  - 源码注释也支持：RelayRegistrar 每次 tunnel 启动重新注册同一 identity 到固定 baseUrl（announce target），quick URL 可变也不会改 stable host。
- 结论：通过，不构成一票否决重启。

## 4. device-session 落盘与重启持久性

- 落盘路径：~/.dsh/remote-web-ui-devices.json（默认 defaultDevicesFile = $DSH_HOME/remote-web-ui-devices.json，L4022-4026；PairingService config.devicesFile L3985）。
- 当前实况：文件存在，mtime Sep 17 10:48，内含 4 个 Android session，最新 lastSeen 为本日。
- 持久性机制（PairingService）：
  - load 时从文件恢复 session（L105-130），损坏/缺失容忍为空表；
  - accept/stop/revoke 等边界会写回（L151-170），0600 owner-only；
  - idle 默认 30 天清理（DEFAULT_IDLE_EXPIRE_MS）。
- handoff 判定：重启后免配对成立（前提：remote-web-ui-devices.json 与 remote-web-ui-registry/web.json 均不丢失、不损坏；profile 仍为 web；仍启用 remote-web-ui 且 requirePairingForLan=true、cookieName=dsh_pair 未改）。
- 失效时的救援流程：
  1. 若重启后手机/PC 打开 stable host 出现配对失效页（pairingFailurePage）或 403：
     - 说明 device-session 已不再被 touchDevice 认可（文件损坏/过期/被 revoke，或身份文件被 remint）。
  2. 恢复触达：在本机打开 DSH WebUI（127.0.0.1:3080，受 remote-web-ui 的 loopback-client 分支保护，本机自由访问）→ 设置旁的远程访问面板 → 点刷新二维码重新生成 one-time token。
  3. 扫描新二维码完成重新配对；配对成功后会自动写 remote-web-ui-devices.json。
  4. 如果 remote-web-ui 插件关闭了 api/gate? 见 topic 2; 重新启用 remote-web-ui 的 enabled 配置（profile patch）。

## 5. trigger 脚本 PID 解析

- scripts/restart-trigger.ps1：无硬编码 PID；用 Get-NetTCPConnection -LocalPort $Port -State Listen 指定要杀死的 OwningProcess，再 taskkill /PID <dynamic> /T /F，然后重新 dsh web。
- scripts/restart-selfheal.ps1：同样 Get-NetTCPConnection dynamic check；无硬编码 PID。
- 两个脚本 PowerShell 解析 error 0，可立即用于授权后布防。

## 6. Edge forbidden 与夸克配对弹窗的分支差异

- 夸克手机拿到的是 top-level document navigation（Sec-Fetch-Mode: navigate + Sec-Fetch-Dest: document）。
  - 走 /pair-accept、/pair-app 页面路径；token 无效且无活 device 时，返回 200 HTML pairingFailurePage（lib/index.js L1467-1474 与 pairingFailurePage L980-1010），即用户看到的中文配对弹窗/失效页。
  - 这就是夸克出现配对弹窗的原因。
- Edge（PC）对 gated API 的请求是 fetch/subresource 或非配对的 remote 请求，不满足导航页分支。
  - 走 /remote 前缀（makeRemoteApiRoutes）时未配对 => 403 envelopeError unpaired（lib/index.js L1874）。
  - 或走 /api 时 gate 判定失败 => 403 forbidden。
  - 因此 Edge 显示 forbidden 而不是配对弹窗。
- 本质：同一门禁按请求形状与路由前缀分派——文档导航给 HTML 引导页，API/subresource 给 403。

## 7. 布防登记

- 当前用户 deviceId（lastSeen 最新者，写入本文件仅作本地接续依据，勿外发）：
  3f236ea366ae3dc44f7bfaa99340b6fd
  lastSeenAt=1789614027730 UA=Mozilla/5.0 (Linux; U; Android 16; zh-cn; 2407FRK8EC Build/BP2A.250605.031.A3) A

- cloudflared 预期回归形态：
  1. 新 dsh web 进程（命令行含 dsh\libin.js web）的直接子进程 cloudflared.exe；
  2. 命令行应含 --url http://127.0.0.1:3080；
  3. 命令行应含 --http-host-header 95c04a90ca73e397.dsh-market.com；
  4. ~/.dsh/remote-web-ui-registry/web.json 仍为 95c04a90ca73e397（与重启前同 hostname）。

- 计划任务清理命令（验收全绿后执行）：
  schtasks /Delete /TN "DSHToolkitPanelRestartTrigger" /F
  schtasks /Delete /TN "DSHToolkitPanelRestartSelfheal" /F

## 8. 布防执行状态

- manifest 备份: .panel-backups/arm-manifest-20260917-105930/cordis.patch.yml
- rate-throttle 行 disabled: true 已写入并 dump-config 自检通过；toolkit-manager 仍在。
- 计划任务待注册: DSHToolkitPanelRestartTrigger (T+2), DSHToolkitPanelRestartSelfheal (T+10)。
## 9. 第三次重启布防（2026-09-17 修复激活）

- 重启目的：加载修复后的 panel guard（socket loopback AND (Host loopback OR 配对校验)）到运行中的 dsh web。
- 重启后步骤：新会话读本文件 -> live harness 26 断言 -> 用户配对浏览器开面板后查 devices.json 最新 b6fd lastSeen 是否刷新（刷新=服务路径活跃 P1.1 闭合；未刷新但可开=fallback 生效） -> 交用户三测（桌面 200 / 配对 200 / 无痕 403） -> 全绿删除一次性计划任务 -> P1 关账并归档教训。
- 常设备注：本机器 dsh web 开机自启方式未验证；本次与上次重启均为计划任务手动触发，不代表机器重启后 DSH/cloudflared 会自动拉起。
## 10. 机器重启恢复步骤（2026-09-17 用户决定不添加开机自启）

- 用户已明确不添加 DSH 开机自启，风险已知悉接受。机器重启后恢复：登录 Windows 后双击桌面快捷方式「启动 DSH」（指向 D:/dsh-plugins/dsh-toolkit/scripts/restart-trigger.ps1），等待脚本自动拉起 dsh web 与 cloudflared 隧道。


## 11. 面板 UI 迁移重启布防（2026-09-17 用户授权）

- 重启目的：激活 client bundle。panel/package.json 终版含 dsh.client.platform=web 与 exports "./client" -> "./client/index.js"；当前运行中的 dsh web 仍载旧 P1 面板，重启后加载新 client bundle。
- 三验收步骤（重启后由新会话执行，全部绿才关账）：
  1. 本机桌面：127.0.0.1:3080（Host loopback）→ 面板页 200；
  2. 已配对设备：stable host + 有效 dsh_pair cookie → 面板页 200；
  3. 无痕/未配对：stable host 无 cookie → 403。
- 回滚程序（回滚先于排查，已预授权）：
  1. 还原 pre-p2 manifest 备份 .panel-backups/pre-p2-toolkit-manager-20260917-2026-09-17T12-44-28/cordis.patch.yml → cordis.patch.yml（移除 toolkit-manager 挂载行，恢复 P1 态）；
  2. 运行 scripts/restart-trigger.ps1 -DelaySeconds 0 重启 dsh web；
  3. 确认 P1 态：p1-smoke 27/27 全绿 + 面板恢复 P1 行为；
  4. 任何一条验收异常即按上述回滚，带证据回报，不在线上调试。

> ### ⛔ 回滚保险（2026-09-18 加注，Q6③）—— **回滚此文件前必读**
>
> **本节的回滚程序语义是「回到 P1 态」，它**故意**移除 toolkit-manager 挂载行 ⇒ 面板入口消失（面板失联）。**
> 这在本节写作时（P2 尚未实施、面板还没挂载）是**正确**的目标；
> **但它不是「保留面板、只撤销某次改动」的回滚。** 用之前先问一句：**我要回到哪个语义态？**
>
> **两条被实测证实的危险路径（都会让面板失联）：**
>
> | 路径 | 后果 |
> |---|---|
> | `git checkout -- cordis.patch.yml` / `git restore cordis.patch.yml` | 回退到 HEAD blob（**2914 B、LF、不含 toolkit-manager 行**）⇒ **删掉 4 行**（面板入口消失）**且行尾 CRLF→LF**（双重副作用） |
> | 还原 `pre-p2-toolkit-manager-*` 快照 | 该快照 sha256 `7541c05a…` **与 git HEAD 逐字节相同**（实测），同样是「无行 + LF」⇒ 同上 |
>
> **实测证据**：`scripts/q2-layer-scan.mjs` §4 断言 —— `pre-p2-toolkit-manager-…/cordis.patch.yml` 与 `HEAD:cordis.patch.yml` sha256 完全相同，且 `含 toolkit-manager=false`。
> 它的 manifest note 自称 *"Pre-P2 toolkit-manager row (git HEAD) backup with SHA for rollback"* —— **它是「P2 之前」的目标，不是「保留面板」的目标。**
>
> **要保留面板时的正确回滚路径**（用**含该行**的快照恢复，按需选目标语义）：
>
> | 想回到 | 用哪份快照 | size | 该快照里该行的 name |
> |---|---|---|---|
> | P2 之前但**已挂面板**（旧名，未改 path-like） | `.panel-backups/arm-manifest-20260917-105930/cordis.patch.yml` | 3072 | `@local/dsh-toolkit/panel` |
> | 同上 + rate-throttle 处于 disabled 临时态 | `.panel-backups/pre-restore-disabled-20260917-114750/cordis.patch.yml` | 3094 | `@local/dsh-toolkit/panel` |
> | path-like 时代 | `.panel-backups/p21-evidence-…/`（3113）或 `p22-evidence-…/`（3120） | — | `file:///D:/…/panel/index.js` |
>
> **终验 SHA 对账基准 = 磁盘当前值（含那 4 行）：**
> `ce0b0b81c91ca4c420bb5302b2dbe951de0347ca729122511be288aa7c2b76b9`，size **3097**，CRLF。
> **对账时不得以 git HEAD 的 `7541c05a…`（2914 B、无行）为基准** —— 那是「面板未挂载」的历史态。
- 杂散目录清理记录：D:/dsh-test-sandbox/_panel（旧 P1 实现副本，含 index.js/client/manager/dsh.plugin.json）已删除；grep 无活动引用，唯一提及为 _api-notes-p2.md:186 的 Q4 历史澄清说明。
- 布防任务：DSHToolkitPanelRestartTrigger（T+2）/ DSHToolkitPanelRestartSelfheal（T+10），一次性。

- 实际注册时刻：T+2=21:06:39 / T+10=21:14:39（本地 2026-09-17）。

### 11.1 布防异常记录（2026-09-17 21:06，已中止）

- 现象：DSHToolkitPanelRestartTrigger 于 21:06:00 触发（schtasks 将 /ST 21:06:39 截断为 21:06:00），脚本 21:06:01 启动并记录 "killing process tree of pid 27900" 后停止；任务上次结果=1，未产生 taskkill/port-free/started 日志。
- 根因：当前环境下 PowerShell 管道（taskkill.exe 通过管道接 ForEach-Object）报 CantActivateDocumentInPipeline；脚本 $ErrorActionPreference=Stop 导致在 taskkill 一行终止，未执行杀进程与重启。
- 影响：端口 3080 仍由 pid 27900（旧 DSH，12:48 启动）监听，P1 态未变，无重启发生，无需还原 manifest。
- 已做清理：两个一次性任务已删除；未重新注册（遵守异常→带证据回报，不在线上调试）。
- 已验证修复方向：taskkill 改用变量接收输出（$o = & taskkill.exe ... 2>&1; foreach ($line in $o) { Log ... }）在 dummy 进程上可正常杀进程；待用户批准后再改脚本并重新布防。

### 11.2 第二次布防与第二个根因（2026-09-17 21:46 触发，已中止）

**重要：11.1 的管道 bug 已修好，但 21:46 的触发暴露了第二个、独立的根因。杀进程仍然失败，重启仍未发生。P1 态依旧完好，无需回滚。**

- **结果**：T+2 任务**按时触发**（StartBoundary 21:46:44，秒级保留），日志 `restart-trigger-20260917-214644.log`。管道 bug 确已消除（无 `CantActivateDocumentInPipeline`），脚本正常走到等待循环；但杀树失败 → 端口始终未释放 → 重启未发生。

- **根因（逐访问掩码实测定案，非推测）**：

  | 访问权 | 掩码 | 对 27900 / 26188 / 7464 |
  |---|---|---|
  | `PROCESS_TERMINATE` | 0x0001 | ✅ 三个全 OK |
  | `PROCESS_QUERY_INFORMATION` | 0x0400 | ❌ DENY（win32=5） |
  | `PROCESS_VM_READ` | 0x0010 | ❌ DENY |
  | `TERMINATE｜QUERY_INFORMATION` | 0x0401 | ❌ DENY（= taskkill /F 所需） |

  即：**`taskkill.exe /PID x /F` 申请 0x0401；本令牌持有 `PROCESS_TERMINATE`（本来就能杀）却被拒 `PROCESS_QUERY_INFORMATION`** → taskkill 报「拒绝访问」；`/T` 见子进程杀不掉，**连根进程一并放弃**，27900 存活。
  证据：`D:\dsh-test-sandbox\_probe-accessmask-report.txt`。

- **为何历史成功而这次失败**：11:03 的树（14820+16444）与 12:48 的树（26468+22768+20892）**都不含 conhost**，taskkill 一路通过；21:46 的树含受保护的 **conhost 26188**，令牌上下文不同 → 权限被拒。**27900 这一代进程的上下文与之前不同。**

- **一个被自己演练证伪的假设（留档以防重提）**：曾判断「conhost.exe 本身不可杀并污染 `/T`」。专门构造演练（node 起 root 再 spawn 控制台子进程，使真实 conhost 落进子树）后，`taskkill /T /F` **exit=0 并连 conhost 一起杀掉**。**conhost 不是问题**；缺 `PROCESS_QUERY_INFORMATION` 才是。证据：`_drill-p4b2-report.txt`。

- **修复（已实施并提交 `054934e`）**：改用 **`.NET Process.Kill()`**，它只需 `PROCESS_TERMINATE` —— 正是我们持有的权限。保留显式枚举 + 自底向上顺序；每 PID 独立 try/catch，单点失败不阻断整树；成功判据仍是「根 PID 消失 + 端口释放」。移除 conhost 豁免（已证明多余）。
  - 验证：两脚本 parser `errors=0`；stand-in 树（含活 conhost）被 `Process.Kill()` 全杀、端口 1s 释放（`_drill-p4b3-report.txt` PART2_VERDICT=PASS）。
  - trigger sha `e0bdbfb253883dfab4237b7963771badfc5828c32b535da463cb69848e0decee`；selfheal sha `e0914a0468bad7bf7e0be2a3be5a4b93319b01d549581d5a0b6cff67656b1fa0`。
  - 加固前备份：`.panel-backups/pre-p4b-killtree-v2-20260917-214837/`。

- **已做清理**：两个一次性任务于 21:47:34 **禁用**（未删除，留取证），现存均为 `Disabled`。

- **⚠️ 残留不确定性（必须如实标注）**：`Process.Kill()` 对**真实 27900** 的效果**尚未实杀验证** —— 杀了它就是重启本身。已验证的是「权限充足（TERMINATE=True）+ 方法在同构树上有效」。**真实效果只能在正式重启时确认**。因此重新布防前需用户确认。

- **第二个环境约束（已在 v2 注册脚本修正）**：非提权时 `-RunLevel Highest` 报 `HRESULT 0x80070005` 拒绝访问，必须用 **`Limited`**；旧 `_register_once.ps1` / `_register_tasks.ps1` 都是 `Highest`，照抄必失败。修正版见 `D:\dsh-test-sandbox\_register_once_v2.ps1`。

- **第三个环境约束**：`New-ScheduledTaskTrigger` **保留秒级精度**（实测 StartBoundary 秒位保留）。11.1 记的「`:39` 被截断为 `:00`」是 **`schtasks.exe /ST` 的缺陷，非 cmdlet 的**。

### 11.3 第三次布防准备：第三根因（闸门语义）+ 等价性假设 + 禁测清单（2026-09-17 22:05）

本节是 ③b 的执行档。用户批复：Unregister 两个 Disabled 任务 → 核对 v2.1 闸门语义 → 重注册 T+2/T+10 → 本节归档 → 停手等触发。

#### 11.3.1 第三根因：启动分支的闸门语义错误（已修复，提交 `cdb1fbe`）

- **发现方式**：按用户要求「核对 v2.1 闸门语义——启动分支唯一闸门 = 端口释放，非杀进程零报错」逐路径审计，**确实发现一处真实缺陷**（由 `054934e` 的 Process.Kill 改动引入）。
- **缺陷**：`054934e` 版代码在「**根 PID 已消失但端口仍被占用**」时，只打一条 `WARN ... continuing to start`，然后**继续走到 `Start-Process`**。这会在端口仍被占用（旧进程尚未真正释放、或 TIME_WAIT/残留句柄）的情况下**再起一个 dsh web = 双开**。
- **修复（`cdb1fbe`）**：启动分支的**唯一闸门改为「`$Port` 空闲」**。理由：
  - **进程报错不是启动的理由** —— 旧进程可能仍占着端口；
  - **进程死亡也不是启动的理由** —— 可能有别的持有者；
  - 只有「端口空闲」是**必要且充分**的条件。
  - 一切 `not-released` 分支**一律 `exit 1`**；并在 `Start-Process` 前**再次断言**闸门（防未来编辑绕过）。
- **审计后路径表（修复后）**：

  | # | 进入启动分支的条件 | 判定 |
  |---|---|---|
  | A | 入口时**无监听**（端口空闲） | ✅ 合法 |
  | B | 等待循环观测到 **`$released = true`**（端口释放） | ✅ 合法 |
  | C | ~~根 PID 消失但端口未释放 → 继续启动~~ | ❌ **已删除，改为 exit 1** |
  | D | `Start-Process` 前**最终闸门再断言** | ✅ 新增 |

- **selfheal 一致性**：`restart-selfheal.ps1` 的闸门本来就是更严的形式（「**无 dsh web 进程 AND 端口未监听**」两者一致才启动），**不存在双开路径**；已在注释中标为其为权威语义，两脚本闸门语义现已一致。
- 两脚本 parser `errors=0`；trigger sha `75c8a62164c5d249a9ef0136ac7c6d85fef95afd70611ca30cc000d3c972dfb6`，selfheal sha `a79b1f3f4068f7e6d2f958be8098be2e7fdadade633ce8f6b906533f1cc6ee32`。

#### 11.3.2 等价性假设（为什么「未实杀验证」仍可接受）

`Process.Kill()` 对**真实 27900** 从未实杀验证，原因：**杀它就是重启本身**，不存在"试杀一下"的中间态。接受布防所依据的**等价性假设**如下（逐条可证伪）：

| # | 假设 | 支持证据 | 若假设不成立的后果 |
|---|---|---|---|
| E1 | 目标进程**持有 `PROCESS_TERMINATE` 即可被 `Process.Kill()` 终止** | 掩码实测 27900/26188/7464 三者 `TERMINATE=True`；同构 stand-in 树实杀成功 | 杀不掉 → 走 60s 等待 → `exit 1`，**不双开**（安全失败） |
| E2 | `PROCESS_QUERY_INFORMATION` 被拒**不影响** `Kill()` | `Process.Kill()` 只需 `TERMINATE`；`_probe-killmethod-report.txt` 实测成功 | 同 E1 |
| E3 | stand-in 树（node + 真 conhost + 控制台子进程）与 live 树**同构** | 两者成员类型一致（node / conhost / 辅助进程）、父子结构一致 | 真实树可能有未知成员 → 未知成员杀不掉则 `exit 1` |
| E4 | 杀根后**端口必然释放** | 历史两次成功（11:03、12:48）均如此；stand-in 1s 释放 | 端口不释放 → `exit 1`，**不双开** |

**关键安全性质**：E1–E4 中**任何一条**不成立，脚本的新闸门都会让它在**「拒绝启动」**一侧失败，**永远不会双开**。即：**假设风险被闸门兜住**，代价是"重启没成功需再来一次"，而非"起了两个实例"。

#### 11.3.3 禁测清单（硬约束）

为守住「**不双开、不误杀**」两条底线，以下行为**一律禁止**，任何人（含后续会话）不得执行：

1. **禁止对 pid `7464`（cloudflared）做任何实杀验证** —— 它是 tunnel 进程，直接杀会中断公网通道；其验证只能通过正式重启（由脚本按序处理）。
2. **禁止对 pid `26188`（conhost）做任何实杀验证** —— 无独立验证价值（已验证掩码），且属于受限上下文，单独实杀只会制造噪声与风险。
3. **禁止对 pid `27900`（live dsh web）做任何"试杀"** —— 杀它就是重启本身；不得以"验证 `Process.Kill` 是否有效"为名先杀再起。**验证只能由 T+2 任务按正式流程完成。**
4. **禁止在 3080 上做任何人工 `Start-Process` 测试** —— 会直接造成双开。
5. **禁止对两个一次性任务做"提前手动 Run"** 来"看看效果" —— 提前 Run 等价于提前重启，会破坏已宣告的触发时刻语义。
6. **禁止在触发时刻附近（T+2 前 1 分钟至 T+10 后）执行任何计划任务变更**（禁用/删除/改触发器），否则中止窗口不可控。

#### 11.3.4 中止窗口

- **T+2**（重启触发）→ **T+10**（selfheal 兜底）之间的 8 分钟为**主中止窗口**：若 T+2 未按预期完成，T+10 的 selfheal 会自动把端口拉起来。
- selfheal 逻辑：**无 dsh web 进程 AND 端口未监听** → 启动；否则 `exit 0` 不动。因此 T+2 若成功，T+10 必为 no-op。
- 若 T+2 失败（`exit 1`，未双开），T+10 会尝试拉起服务；此时需人工判断是"重启未生效"还是"已双开"，**不在线上调试**，带证据回报。

### 11.4 第三次布防触发结果：重启成功（2026-09-17 22:08）

- **触发成功**：T+2 于 22:08:00 触发，`Process.Kill()` 修复**在真实目标上生效**。日志 `restart-trigger-20260917-220800.log`：
  ```
  22:08:02 tree members to kill (leaves first): 7464,26188,27900
  22:08:02 kill pid 7464 (cloudflared.exe) via Process.Kill() -> alive=False
  22:08:02 kill pid 26188 (conhost.exe)     via Process.Kill() -> alive=False   <- 21:46 taskkill 杀不掉的
  22:08:02 kill pid 27900 (node.exe)        via Process.Kill() -> alive=False
  22:08:05 port free; starting dsh web
  22:08:06 started pid 23932
  22:08:42 port 3080 is listening again after restart (pid 23932)
  ```
- **11.3.2 的等价性假设 E1/E2 得到实机确认**（此前仅在同构 stand-in 树验证）：`26188 conhost` 与根 `27900` 均 `alive=False`。闸门语义正确（`port free` 之后才启动，无双开）。
- **三验收全绿**（22:10）：

  | # | 验收项 | 期望 | 实测 |
  |---|---|---|---|
  | A1 | 桌面 loopback → `/api/toolkit-panel/ui` | 200 | **200**（5442 B） |
  | A2 | stable host 无 cookie → 面板路由 | 403 | **403** |
  | A2b | stable host 假 cookie（额外） | 403 | **403** |
  | A3 | `/api/toolkit-panel/snapshot` 桌面 | 200 | **200** |

- **口径修正留档**：验收路由是 `/api/toolkit-panel/ui`（不是 `/panel`，后者 404）。对 `/` 的裸请求返回 **401 是 dsh 自身鉴权层**的响应，与本面板 guard 无关。
- **profile 行解析成功（迁移目的达成）**：live snapshot 返回 `"self": {"id":"toolkit-manager","name":"file:///D:/dsh-plugins/dsh-toolkit/panel/index.js","managedBy":"patch","enabled":true}`。
- **P1 冒烟 27/27 全绿**，含 `PASS self id is toolkit-manager`、`PASS self panel patch-mounted`、`PASS doctor issue counts 0/0/0`。
- **⚠️ 唯一未命令行闭环项**：client module 机制挂在主 UI HTML 的 `__DSH_BOOT__` 清单上（见 `dsh-client-modules` 源码），而主 UI `/` 对非浏览器请求返回 401，**无法从命令行断言 client bundle 是否已进 boot 清单**。已在命令行可达范围内验证：包声明齐备、`panel/client/index.js`（8468 B）存在、profile 行 path-like 且解析成功、服务端路由正常。**建议用户在浏览器里目视一次新面板 UI。**
- **清理**：两个一次性任务均已 unregister（trigger LastResult=0），复核无残留。

### 11.5 【关键】改动生效方式定案：必须 reload，浏览器强刷无效（2026-09-17 22:35，源自 L-024-⑤）

**承 11.4 的「唯一未命令行闭环项」而查，得到一个比预期更强、且对后续所有客户端改动都适用的结论。**

**结论**：`panel/client/**` 的任何改动，**必须 reload dsh web 才能生效；浏览器强刷（含 Ctrl+F5 / 无痕）一律看到旧 UI。** 原因不是缓存，是**两个冻结点**：

**冻结点 1 —— client bundle（`dsh-client-modules@0.1.5-rc.2`）**
- `initialBundleSnapshot()` 在**激活时**用 `readFileSync(clientPath)` 把 bundle 字节**读进内存快照**；此后 `serveBundle` 只从内存 `responses` map 出。
- **磁盘重读只存在于 HMR watch hook `rehashBundle`**（源码注释：「the only entry」）。
- Bundle URL 带 `allocateInitialRevision()` 分配的 rev 查询串 → 同 rev 下强刷命中同一份内存副本。
- client bundle **不是独立端点**，以 `__DSH_BOOT__` 清单形式**随主 UI HTML 一起下发**（`dsh-client-modules/lib/index.js:750-760`、`:857-877`、`:536-560`）。

**冻结点 2 —— 独立页 `/api/toolkit-panel/ui`（`panel/index.js:103`）**
```javascript
const uiHtml = readFileSync(join(panelRoot(), "client", "panel.html"), "utf8");
```
该读取**在 `apply()` 内执行一次**并被闭包捕获 → 独立页同样冻结在激活时刻。

**实测证据（决定性）**：reload 之前探测 live `/api/toolkit-panel/ui` → **200，长度 5572**，内容仍是 `P1 只读骨架` / `doctor dry-run` / `刷新快照`；**同一时刻磁盘上的新文件为 10260 B**。**磁盘已新、线上仍旧 → 强刷无解。**

**⚠️ 假阳性陷阱（务必留档）**：`/api/toolkit-panel/snapshot` 是**实时计算**的，永远返回当前数据，**不经过任何冻结层**。因此「看到 `/snapshot` 变了」**不能**作为「改动已生效」的依据。**判断是否真生效只能看 HTML/JS 内容本身。**

**运维推论**：
1. 改 client 后**必须 reload dsh web**。
2. 改 `panel/package.json` 的 manifest 字段**也不能绕过**（清单同样在激活时消费）。
3. 本节结论与源码行号引用已同步写入 `panel/docs/api-notes.md`（「P2.1 改动生效方式」节），供后续 UI 改动直接引用，**不必再重新试错**。

**因此**：11.4 遗留的「浏览器目视新面板 UI」与 L-024 的「目视人话化新 UI」**合并为同一次** —— 一次 reload 后两者同时可见。

### 11.6 P2 开工后的 reload 节奏（2026-09-17 23:15 用户定）

用户已明确 **两次 reload**，均由用户按 `restart-trigger` 执行：

| # | 触发时机 | 承载内容 | 状态 |
|---|---|---|---|
| 1 | **名字恢复后** | L-025「英文原名 + 中文注释」新面板（commit `c1d383e`） | **待执行** |
| 2 | **P2.2 完成后** | P2.2 启停开关 UI（L-029，双层分立 + 确认页） | **待执行**（原「P2 写操作能力上线后的验证」，范围已确定为 P2.2 启停开关） |

**注意**：L-026（P2.0 解析器修复）与 L-025 **同批**可见 —— 但两者生效路径不同：

- **L-025 是 client 层** → 受 11.5 的两个冻结点约束，**必须 reload**。
- **L-026 是服务端 `panel/manager/snapshot.mjs`** → 同样受冻结点 2 约束（模块在 `apply()` 时被 `import`，Node 的 ESM 模块缓存使旧模块常驻），**也必须 reload**。

即：**这两项都靠同一次 reload 生效**，不需要额外一次。

**首次 reload 后的建议验证**（命令行可查，非浏览器）：
1. 卡片标题应显示英文原名（`agent-memory` 等），中文在第二行。
2. `/api/toolkit-panel/snapshot` 返回中 `plugins[rate-throttle].patchRow.config.enabled === "false"`（L-026 修复的直接证据）。
3. 若仍见到 `记忆`/`上下文压缩` 作为标题，说明 reload 未生效（不是强刷问题）。

### 11.7 【权威】P2 窄版阶段表（2026-09-17 23:31 用户提供，落盘后照此执行）

> 本节是 P2 的**唯一权威范围定义**。任何 P2 工作以此为据；与旧文档冲突时以本节为准。

| 阶段 | 交付内容 | 验收标准 |
|---|---|---|
| **P2.0** 服务端地基（两半） | ① `parseRootRows` 缩进修复 ✅ **已完成**（commit `193bdd8`，见 L-026）；② **写路由 guard 升级**：所有写路由加 CSRF 校验（`sec-fetch-site ≠ cross-site` 且 `origin.host == Host`）+ 配对校验**必须走 `remoteWebUiPairing` 服务**，**写操作禁止 fallback `hasOwn`**（只读才允许 fallback） | smoke 新增断言：无 cookie 写请求 403、坏 origin 403、合法配对放行 |
| **P2.1** 两段式框架 | 所有写操作走 **plan → 用户确认 → execute**；plan 含**目标文件、diff 预览、有效期**；execute 前**重读文件比 SHA**，不一致即拒绝；每次写前**自动备份 + manifest + 保留策略**（最近 20 份或 30 天） | 篡改文件后 execute **必须拒绝并报 409**；每次写操作有**备份产物为证** |
| **P2.2** 启停开关 | 卡片加启停开关，写 patch 行 `disabled`；**锚点在文件中恰好命中 1 次**（0 或 ≥2 拒绝写盘）；停用前**交叉检查其他块是否引用该插件**；**rate-throttle 为首个真实用例**（双层开关正是它的现状） | 开关 → 文件真变（**SHA 变化**）→ **doctor 0/0/0** → reload 后状态保持且面板如实显示 |
| **P2.3** 配置编辑 | 白名单字段：`enabled`（布尔）、限流数值（**范围校验**）、路由模式（**枚举**）；值含**换行或 YAML 结构字符一律拒绝**；**服务端校验，不信任前端** | 非法值被拒且错误信息**人话化**；合法修改落盘且**备份生成** |
| **P2.4** doctor 操作台 + 回滚 | 一键修复（apply 走**两段式**、**逐条 diff 预览**）、doctor 回滚、**面板备份回滚**（两套回滚在 UI **分开列明各自覆盖的文件**） | 回滚后文件 **SHA 与备份点逐字节一致** |

**进度（Q3 要求的常驻行，随阶段推进更新）**：

> **P2.2 已落库待验收。** 已落库：commit `c91de92`（启停开关主体）+ `51c2c0d`/`8f6b392`（文档与清单），本轮再补全卡覆盖与 Q1 安全闸。**待用户 reload 后目视验收。**
> 具体待验收项：① 5 张卡里 4 张有启停开关、`compact-router` 无（口径见 11.10）；② 双层开关**分立**呈现；③ 确认页含「下次重启生效」人话提示与 `disabled` 解释。

**安全模型（全项适用于 P2 各阶段）**：两段式、SHA 冲突检测、锚点唯一、值白名单、写路由 CSRF + 配对服务校验（禁 fallback）、写前备份、plugin-manager 并发防线（**快照现读不缓存**）。

**执行顺序**（用户指定，逐阶段报验收证据后方进下一阶段）：

```
P2.0②（写路由 guard 升级）→ P2.1 两段式 → P2.2 启停（rate-throttle 首用例）
  → P2.3 配置编辑 → P2.4 doctor + 回滚
```

**reload 节奏**：每完成一个 **client 可见**阶段报一次，由用户按 `restart-trigger` 自行执行（用户已会）。

**证据要求**：**P2.1 起，每个写操作必须附真实备份产物与 SHA 记录。**

**待用户项（每次回报末尾保留）**：设置页 tab 是否可见 —— ✅ **2026-09-17 23:53 已回报：可见且界面合格**（L-023 已关账，此项不再挂起）。当前待用户项改为：**reload 后目视确认 P2.2 启停开关 UI**。

### 11.8 P2.1 两段式写框架 —— 接线与约定（2026-09-17 23:50，commit `a27da81`）

**这是后续 P2.2 / P2.3 / P2.4 所有写操作的唯一通道。** 任何新的写能力都必须走这条路径，不得自建落盘逻辑。

**三条路由**（`panel/index.js`）：

| 路由 | 方法 | 守卫 | 作用 |
|---|---|---|---|
| `/api/toolkit-panel/plan` | POST | **写守卫**（`{ change: true }`） | 只读计算，返回 `token` / `diff` / `expectedSha` / `expiresAt`。**不下发 `nextText`** |
| `/api/toolkit-panel/execute` | POST | **写守卫** | 唯一落盘入口 |
| `/api/toolkit-panel/plan/status?token=` | GET | 只读 | 供 UI 确认页判断方案是否仍有效 |

**引擎 API**（`panel/manager/apply-engine.mjs`）：

- `createPlan({ file, rowId, key, value, backupRoot, ttlMs })` —— 只读。锚点必须**恰好命中 1 次**。
- `putPlan(plan)` / `getPlan(token)` —— 内存计划表（**进程重启即清空**，符合"现读不缓存"）。
- `executePlan(token)` —— 唯一写入口。顺序**不可调换**：取 plan → 过期校验 → **重读文件比 SHA** → 锚点复验 → **写前备份** → 落盘 → 裁剪备份。
- `locateRowAnchor(text, rowId)` / `readRowOwnKeys(lines, anchor)` / `planRowFlag(text, {...})` —— 文本层工具，P2.2/P2.3 直接复用。
- `pruneBackups(root, {...})` —— 保留策略。

**错误码 → HTTP 映射**（`panel/index.js` 的 `PLAN_ERROR_STATUS`）：

```
sha-conflict / plan-expired / anchor-ambiguous   → 409
anchor-missing / anchor-invalid / value-*        → 400
plan-not-found                                   → 404
body-too-large                                   → 413
```

**三个必须遵守的约定（都是本轮踩过的坑）**：

1. **新写路由必须标 `{ change: true }`。** `/plan` 最初漏标，导致这个**签发写令牌**的路由退化成只读路由（服务缺席时走 `devicesFile` hasOwn 兜底放行），与 P2.0② 的「写操作禁 fallback」直接冲突。**判断标准：只要会签发令牌或改变状态，就是写路由。**

2. **新键插入点是「锚点行正下方」，不是「最后一个直接子级的下一行」。** 因为 `config:` 本身是直接子级且其后跟着更深缩进的 config 子树，按后者插入会把新键写进 `config` **内部**。`planRowFlag` 已按前者实现。

3. **目标文件是 CRLF。** 真实 `cordis.patch.yml` 100% 使用 `\r\n`。`splitLines`/`joinLines` 会保留原风格；写测试断言时**务必先归一化行尾**，否则会被自己的断言误导（本轮有 5 条假失败源于此）。

**保留策略语义**：`keep = (最新 20 份) OR (mtime 在 30 天内)`，另加 `maxTotal = 40` **绝对上限**。加绝对上限的原因：纯 OR 在**密集写入**时一份都不删（时间窗兜住全部），保留策略形同虚设；纯份数又会误删近期备份。

**验收脚本**：`scripts/p21-verify.mjs`（46 条，真实文件读写 + 真实备份产物）。改 `apply-engine.mjs` 后**必须**跑它 + `p1-smoke.mjs` + `p2-smoke.mjs` + doctor 0/0/0。

**备份根目录**：默认 `<toolkitRoot>/.panel-write-backups`（可用 config `backupRoot` 或环境变量 `TOOLKIT_PANEL_BACKUP_ROOT` 覆盖）。**与人工留档的 `.panel-backups/` 分开**，避免混在一起被保留策略误裁。

### 11.9 P2.2 启停开关 —— 契约与三条新增约定（2026-09-17 24:05）

**这是 P2.2 之后「改一行标志」类操作的唯一形态。** 新增能力（P2.3 配置编辑 / P2.4 doctor 操作台）继续复用同一条两段式通道，只是换 `key` / `value` 与校验器。

**新增一条路由**（`panel/index.js`）：

| 路由 | 方法 | 守卫 | 说明 |
|---|---|---|---|
| `/api/toolkit-panel/toggle/plan` | POST | **写守卫** `{ change: true }` | 入参 `{ rowId, enabled, alsoMatch? }`，出参含 `layer: "patch-row.disabled"` / `diff` / `crossRefs` / `expectedSha` / `expiresAt`，**不含 `nextText`** |

落盘仍走既有的 `POST /api/toolkit-panel/execute`（唯一写入口）。**toggle 没有自己的落盘逻辑。**

**新增引擎 API**（`panel/manager/apply-engine.mjs`）：

- `createTogglePlan({ file, rowId, enabled, backupRoot, ttlMs, alsoMatch })` —— 只读。`enabled` 非布尔直接 `value-invalid`。返回 `changed`（幂等：已是目标态则 `changed=false`）。
- `findCrossReferences(text, { rowId, alsoMatch })` —— **停用交叉检查**。返回 `[{ line, text }]`。

**三条新增约定（P2.2 踩出来的）**：

1. **双层开关在呈现层必须分立，不得合并。** `patch` 行级 `disabled`（第一层·配置文件）与 `config.enabled`（第二层·插件内部）是**两个独立事实**。`rate-throttle` 现状即为二者分歧（`row.enabled=true` / `config.enabled="false"`），合并显示必然得到一个无意义的中间态。两套渲染器（client bundle 与直连后备页）都实现为**两行独立状态 + 各自色标**，并有断言 `no client merges the two layers into one switch value` 锁定。

2. **停用（`enabled=false`）前必须做交叉引用检查；启用（`enabled=true`）不需要。** 方向性理由：停用可能连带打断别人对它的引用，启用只会让被引用的东西回来。检查器三条细节：**整词匹配**（`rate-throttle` 不得命中 `rate-throttle-extra`）、**跳过自身块**（先切出所有 `- id:` 行块的边界）、**跳过注释行**。`alsoMatch` 用于补充包名等其它别名。

3. **CRLF 兼容断言要「把前提本身变成断言」。** `p22-verify.mjs` 第一条即 CRLF 前提守卫：先断言真实文件确实含 `\r\n` 且无裸 `\n`。原因：若前提变了而断言只在比较处归一化，测试会**静默地继续通过但失去意义**。另注意「归一化只用于**断言比较**，绝不用于写回内容」——落盘侧另有正向断言 `execute preserved CRLF line endings (no bare LF introduced)`。

**方法论留档 —— 「reload 后状态保持」的等价证明**：reload 只能由用户执行，命令行无法代替。不要含糊地说「重启后应该没问题」，而要**把命题降维成确定性可验证命题**：对写后副本用**同一份 `parseRootRows` 实现**重新解析，断言锚点仍唯一命中、且解析出的新状态与写入意图一致。见 `EVIDENCE.txt` 的 `[5]` 段。

**探针脚本的教训**：含转义序列（`\r\n` 等）的测试**不要用 `node -e` / bash 单行拼串**，会被 shell 提前转义（本轮 `\r\n` 变成字面 `/r/n`，导致行未切分、第 1 行假命中）。一律落成真实 `.mjs` 文件。

**验收脚本**：`scripts/p22-verify.mjs`（44 条）。改 `apply-engine.mjs` 后**必须**跑它 + `p21-verify.mjs` + `p1-smoke.mjs` + `p2-smoke.mjs` + doctor 0/0/0。

**`.panel-backups/` 已入 `.gitignore`**（人工留档目录，含改动前快照与验收证据，不随仓库入库）。

### 11.10 卡片口径 + 测试覆盖缺口闭合 + Q1/Q2 证据（2026-09-18）

#### 一、卡片口径（权威，对应用户「对齐 5 个口径」）

**面板卡片数 = `lib/` 下带 `dsh.plugin.json` 的目录数 = 5。** 判据在 `panel/manager/snapshot.mjs:112`（`readdirSync(libRoot)` + 清单存在性检查）。

| # | 卡片（dir） | 包名 | 对应 patch 行 | 行号 | 启停开关 |
|---|---|---|---|---|---|
| 1 | `agent-memory` | `@local/dsh-toolkit/agent-memory` | `agent-memory-runtime` | **74** | 开放 |
| 2 | `compact-router` | `@local/dsh-toolkit/compact-router` | **无**（`ROW_IDS` 显式置 null） | — | **不开放** |
| 3 | `rate-throttle` | `@local/dsh-toolkit/rate-throttle` | `rate-throttle` | 14 | 开放 |
| 4 | `search-router` | `@local/dsh-toolkit/search-router` | `web-search-router` | 64 | 开放 |
| 5 | `web-search-local` | `@local/dsh-toolkit/web-search-local` | `web-search-local` | 58 | 开放 |

- **卡片顺序 = `readdirSync` 顺序**（字母序）：agent-memory → compact-router → rate-throttle → search-router → web-search-local。
- **`toolkit-manager` 不自显为卡片。** 它只出现在 `snapshot.self`，UI 里唯一用途是页头那行元信息「… · 本面板已启用/未启用」（`client/index.js` 的 `meta`）。它**没有卡片、没有启停开关** —— 面板不自带开关，避免"关掉自己"。
- **关于「compact-memory」**：5 张卡里**不存在**这个名字。用户两屏所见 4 张卡中，`agent-memory（记忆）` 与 `compact-router（上下文压缩）` 是两个独立插件，`compact-memory` 应为二者串读。**不据猜测改口径**，此点请用户确认。
- **compact-router 为何没有开关**：它的挂载由 `scripts/apply-preset-patch.mjs` 改写预设行名完成，**根本不在 `cordis.patch.yml` 里**（该文件第 3 行注释即写明）。没有可写的行 ⇒ 两套渲染器都显式 `return null`/`return ""`。引擎侧若被强行走 toggle 会报 `anchor-missing`（fail-closed，不会误写别的行）。

#### 二、测试覆盖缺口（本轮最大发现，已闭合）

**原缺口**：面板开放启停开关的有 4 张卡，但 `p22-verify.mjs` 只对 `rate-throttle` 一张做过真实验证。用户随手点的 `agent-memory`（第 74 行）**不在用例内** —— 没翻车是运气。「只证 1 张」等于没证。

**闭合方式**：新增 `scripts/p22-cards-ui.mjs`（**用两套真实渲染器逐卡真跑**，不是文本匹配）：

- `client/index.js` → 捕获 `window.__ModuleLoader__` 工厂 → 假 react → 调 `apply()` 拿组件 → 渲染 → 从元素树取 `PluginCard` / `ToggleControls` 并**调用** → 收集文本
- `client/panel.html` → 抽出内联 `<script>` → 假 `document`/`fetch` → 直接调 `toggleHtml()` / `stateOf()` / `renderConfirm()`

**一个必须留档的建模陷阱**：`react.createElement(ToggleControls, …)` 只是把组件**按引用**放进树，组件体不会被调用（真实 React 才负责调用）。`compact-router` 正是靠 `ToggleControls` **返回 null** 来"不渲染开关"的 —— 只看元素是否存在会把 5 张卡全判成"有开关"。同理 `StateRow` 的状态标签要从 `props.state.label` 读，不能从文本里找。**第一版 harness 就是踩了这两个坑**，由脚本自身断言抓出。

同时 `p22-verify.mjs` 增加引擎级全卡扫描（4 卡各跑一次 toggle plan：锚点唯一 + 行号对账 + 交叉引用 + 确认页元数据 + 只读性）。**`agent-memory` 锚点行号 74 与真实文件逐字对上，与用户实际点击时看到的行号一致。**

#### 三、Q1 —— `disabled` 的平台条件行为（源码级证据）

**框架事实**（三处，均为已安装源码）：

| 事实 | 出处 |
|---|---|
| `!!js` 是 YAML 方言自定义标签 `tag:yaml.org,2002:js`，构造为 `{ __jsExpr: data }` | `dsh-app-boot/lib/index.js:17-23`（`cordis-plugin-include` 同源） |
| Loader 在**条目激活时**求值：`isJsExpr(options.disabled) ? Boolean(this.evaluate(options.disabled.__jsExpr)) : Boolean(options.disabled)` | `cordis-plugin-loader/lib/index.js:378` |
| 求值实现 = `new Function("ctx","expr","with(ctx){return eval(expr)}")` | 同上 `:289` |
| `disabled` **沿父条目继承**（`_disabled` 向上遍历 `parent.ctx.fiber.entry`） | 同上（`_disabled` / `disabledOf`） |

**生态内的真实用法**：`dsh-liangshen/presets/liangshen/agent.cordis.yml:144,179` 有 `disabled: !!js process.platform === 'win32'` / `!== 'win32'`；`dsh-better-sidebar/cordis.patch.yml:49` 有基于 `ctx.loader.entries()` 的写法。**平台条件式停用是这个生态里真实存在的模式。**

**本仓现状**：`cordis.patch.yml` 的 `disabled` **全部是字面量或缺失**（仅 `web-search-deepseek: disabled: false`），**没有 `!!js`**。所以本轮改动对现有文件**行为零变化**，闸门纯属防御。

**实测出的两处危害（不是推断）**：

1. **读侧误报**：`parseRootRows` 遇到 `!!js` 时，值既非 `"true"` 也非 `"false"`，于是 `enabled` 保持 `true` → 面板报「运行中」。而 loader 在 win32 上会**真的停用它**。**呈现与事实相反。**
2. **写侧抹条件**：改写会把表达式换成硬布尔（实测 diff = `["- disabled: !!js …", "+ disabled: true"]`），**平台条件被永久销毁**。

**处置（fail-closed）**：
- 引擎新增 `readRowDisabledLiteral()` + 闸门：现有 `disabled` 非字面量 ⇒ 抛 `value-not-literal`（HTTP 400），**拒绝写盘**。
- 快照新增 `patchRow.disabledExpr`，如实带出表达式原文。
- 两套渲染器：层 1 显示「条件开关（面板不解释）」+ 表达式原文 + 「请手工编辑」，并**禁用写入按钮**；页头状态改为「配置层是条件开关 · 实际是否加载取决于该表达式，面板不解释」（**不再谎报「运行中」**）。
- 服务端闸门与 UI 禁用**互为双保险**：UI 禁用只是体验，真正的门在引擎。

#### 四、Q2 —— 层间覆盖检查

**结论：两层正交，不存在覆盖关系。**

| 层 | 位置 | 语义 | 谁读 |
|---|---|---|---|
| 第一层 | patch 行 `disabled` | **有没有被加载**（false 时 Loader 直接不 activate） | cordis Loader |
| 第二层 | `config.enabled` | **加载了，但插件自己把功能关掉** | 插件自身代码 |

- **层 1 关闭 ⇒ 层 2 的取值不再被读取**（插件根本没加载），但**两者互不改写**。实测：改写层 1 后，**每一行**的 `config:` 子树逐字节不变。
- **呈现顺序即优先级**：两套渲染器的 `stateOf` 都先判层 1、再判层 2（已加顺序断言）。层 1 关时面板一律报「配置层停用 · 未加载」，**不会**因为层 2 是 `true` 就说"运行中"。
- **一条必须知道的连带效应**：**插入一行会位移其后所有锚点**（实测插入 `disabled: true` 到第 14 行后，`agent-memory` 的锚点 74 → 75）。这不是层间覆盖，但会**让已生成的 plan 的 `anchorLine` 变陈旧**。防线是 execute 前的 SHA 重读：文件一变，`sha-conflict` 直接拒绝（实测通过）。`executePlan` 里另有一道 `anchor-moved` 复验。
- 面板层间真值表（两套渲染器一致，`p22-cards-ui.mjs` 逐格断言）：层1开+层2开→运行中；层1开+层2关→已加载·功能开关关闭；层1开+无内部开关→运行中；层1关→配置层停用（不论层2）；条件表达式→条件开关·不解释。

#### 五、本轮验收脚本与计数

| 脚本 | 结果 | 说明 |
|---|---|---|
| `scripts/p22-verify.mjs` | **98/98** | 44 → 98：加全卡覆盖、compact-router 无 toggle、真实注释行负例、`!!js` 闸、层间真值表 |
| `scripts/p22-cards-ui.mjs` | **71/71** | **新增**，5 张卡 × 两套真实渲染器 |
| `scripts/p1-smoke.mjs` | **185/185** | 167 → 185 |
| `scripts/p21-verify.mjs` | 46/46 | 无回归 |
| `scripts/p2-smoke.mjs` | 16/16 | 无回归 |
| `node --test` | 92/92 | 全仓 |
| doctor | **0/0/0**（`issues: []`） | — |

证据：`.panel-backups/p22b-evidence-*/EVIDENCE.txt`（含真实写操作 + 备份 manifest + Q1/Q2 实测）。
改动前备份：`.panel-backups/pre-p22b-fullcard-20260918/`。

**一条真实文件的注释负例（顺带发现，值得留档）**：`cordis.patch.yml` **第 2 行注释**里写着 `web-search-local`。若「跳过注释行」这条规则失效，`web-search-local` 就会凭空多出一条交叉引用告警。现已双向断言：**该注释行确实存在**（前提）+ **规则确实抑制了它**（结论）+ **去掉 `#` 后规则就会命中**（反证抑制来自注释规则而非别的原因）。

### 11.11 「故障」警报解除 + 三条新事实 + 转述失真教训 + Q4–Q7 收口（2026-09-18 08:53）

#### 一、「故障」警报解除（**撤销**上轮的故障排查二选一问题）

上轮判定者侧把 `rate-throttle` 的**黄色双层不一致状态**概括成了「**故障**」。用户口述确认：
**UI 上没有任何「故障」字样。** 实际含义是 ——

> 黄色「已加载，功能开关关闭，暂不生效」= **设计内展示**。`rate-throttle` 正是「两层取值相反」的样本卡
> （层 1 `row.enabled=true` / 层 2 `config.enabled="false"`），合并显示会得到一个无意义的中间态，
> 所以必须分立两行、各带色标（见 11.9 约定 1）。

**结论：面板无故障。上轮发出的「故障排查二选一」问题撤销，不答复。** 口径记入 `HANDOFF-MASTER.md` §7 目视清单。

#### 二、三条新事实入账

| # | 事实 | 意义 |
|---|---|---|
| **a** | 该黄色状态**自 P2.2 reload 后持续存在**，且用户称今日有过一次重启、跨日复看仍一致 | 「**reload 后状态保持**」再添旁证 —— 这是 P2.2 验收标准里唯一命令行无法自证的一条 |
| **b** | doctor UI 显示「**没有发现任何问题**」，与服务端 `0/0/0`（`issues: []`）一致 | **读侧对账通过**：呈现层与计算层一致，无口径漂移 |
| **c** | P2.2 落库后经用户侧重启，**系统整体健康**（面板可用、5 卡正常、体检干净） | P2.2 的真实环境终态成立 |

#### 三、教训留档：**图片转述链路两次失真**（本轮判定者踩了自己立的规矩）

本轮「图片→文字转述→判定」这条链路**两次失真**：

1. **「compact-memory」串读** —— 5 张卡里根本没有这个名字；实为 `agent-memory` 与 `compact-router` 两个独立插件被读成一个（见 11.10 §一）。
2. **「故障」误读** —— 把设计内的黄色双层不一致状态读成了故障（见本节一）。

**两条失真都不是面板的问题，而是转述环节丢了字面。** 教训（即刻生效）：

> **今后验收关键状态词，一律要用户念原文，或放大截图逐字读，不得以图片转述内容作为判定依据。**
> 转述只能用来**定位问题区域**，不能用来**确认状态字符串**。

**这条规矩此前是本任务自己立下的，本轮由判定者自己踩破，一并记录在案。**
（对应 `HANDOFF-MASTER.md` §1 优先级：用户当轮指令 > 口径节 > 阶段表 > 台账。）

#### 四、Q4 —— 证据正本入库 + 裁剪排除证据

**问题**：验收证据此前只存在于 `.panel-backups/`，而该目录被 `.gitignore` 排除 ⇒ **仓库自身无法自证**。

**处置**：
1. **证据正本入库** —— 新建 `panel/docs/evidence/`，把三份证据**逐字节复制**进去（复制后比对 sha256 一致才落盘）：

   | 归档文件 | 来源 | sha256 |
   |---|---|---|
   | `P2.1-EVIDENCE.txt` | `.panel-backups/p21-evidence-2026-09-17T15-43-18-742Z/` | `e9cdaa74…0a6fcb05` |
   | `P2.2-EVIDENCE.txt` | `.panel-backups/p22-evidence-2026-09-17T15-57-56-541Z/` | `166162917bd2bda9…29092d90` |
   | `P2.2b-EVIDENCE.txt` | `.panel-backups/p22b-evidence-2026-09-18T00-13-52-624Z/` | `b802c99b…5472b681` |

2. **裁剪排除证据**（新增脚本 `scripts/p22b-retention-scope.mjs`，**15/15 PASS**，输出存档 `panel/docs/evidence/RETENTION-SCOPE.txt`）。
   命题：保留策略 `pruneBackups()` **只在自己收到的 `backupRoot` 内裁剪**，绝不删除人工留档目录、绝不改动根外文件。四路独立证据：

   | 路 | 证据 | 结果 |
   |---|---|---|
   | E1 目录不同源 | 引擎默认 `backupRoot = <toolkitRoot>/.panel-write-backups`（`panel/index.js:175`）；人工留档 `<toolkitRoot>/.panel-backups` | 同级、非同一、非父子；后者在 `.gitignore` 内 |
   | E2 清单过滤 | `listBackups()` 只认含 `manifest.json` 的子目录（`backup.mjs:25-31`）；根不存在 → `[]` | 裸目录天然不在视野；根不存在时裁剪是**空操作**（不抛错） |
   | E3 运行时隔离 | 同父目录并排 `write-backups/`(45) 与 `manual-archive/`，对前者跑裁剪 | 45→40（`removed=5`）；`manual-archive/` **逐字节不变**；**差异集合 ⊆ `write-backups/`**，根外零增删 |
   | E4 生产实况 | 默认根 `.panel-write-backups` **不存在** | 生产**从未跑过裁剪**；人工留档 17 条目完好 |

   **E3 刻意在人工归档里也放了一个 `manifest.json` 作诱饵** —— 证明即便有 manifest，也因「不在 backupRoot 之内」而不会被越界删除（不依赖"没有 manifest 所以看不见"这个脆前提）。

3. **一条必须知道的生产事实**：默认 `backupRoot` **从未被创建** ⇒ **用户尚未通过面板真实执行过任何 toggle/plan 落盘**，
   生产 `cordis.patch.yml` 至今未被面板改过（sha `ce0b0b81…` 自 P2 起点未变）。此前「真实写操作」证据都是在
   **脚本显式指定 `backupRoot`** 的条件下产生的。

#### 五、Q5 —— `change: true` 一致性（引 guard 代码行）

| 路由 | `path:` 行 | 写守卫 | 方法 | 性质 |
|---|---|---|---|---|
| `/api/toolkit-panel/ui` | 225 | —（只读） | GET | 读 |
| `/api/toolkit-panel/snapshot` | 238 | —（只读） | GET | 读 |
| `/api/toolkit-panel/doctor/dry-run` | 250 | **`{ change: true }` @259** | POST | ⚠️ **见下** |
| `/api/toolkit-panel/plan` | 265 | **`{ change: true }` @306** | POST | 写（签发令牌） |
| `/api/toolkit-panel/toggle/plan` | 314 | **`{ change: true }` @360** | POST | 写（签发令牌） |
| `/api/toolkit-panel/execute` | 365 | **`{ change: true }` @381** | POST | 写（唯一落盘） |
| `/api/toolkit-panel/plan/status` | 386 | —（只读） | GET | 读 |

**guard 代码行**：`isAllowedRead` @180 · `isAllowedWrite` @191（**禁 fallback**）· `guard()` @200 ·
`const isWrite = options.change === true` @201。

**结论**：**会改状态/签发令牌的 3 条路由全部正确标了 `{ change: true }`；3 条只读路由全部未标。一致性成立。**

**⚠️ 一处如实标注的「过度收口」**：`doctor/dry-run`（@259）并**不改变状态、不签发令牌**，
按 11.8 约定 1 的判据本可标只读，但它标了 `{ change: true }`。
**这是 fail-closed 方向的偏差**（更严，不是更松）：该路由因此要求严格配对 + CSRF 安全来源。
在桌面 loopback 场景无功能影响（`isLoopbackHost` 直接放行），远程配对场景仍可正常走服务校验。
**建议保留**；若用户要求与判据完全对齐，再降为只读 —— **本轮不擅自改动**。

#### 六、Q6 —— `git status` 全量 + 两提交 diff 摘要

**`git status --porcelain=v1 -uall`（全量）**：

```
 M cordis.patch.yml
```

> **唯一未提交改动 = 运行配置的 4 行**（`- insert:` / `- id: toolkit-manager` / `name: 'file:///D:/dsh-plugins/dsh-toolkit/panel/index.js'`）。
> 这不是本轮新增，**L-023-① 结论 2 已逐版对账过**（19:55 由 P2 行名改 path-like 产生，有据可查），
> 按 11 节程序**待重启验收后单独处置**，故仍处未提交态。**除它之外工作区干净，无 untracked。**

**两提交 diff 摘要**：

| commit | 标题 | 变更 |
|---|---|---|
| `558e62f` | feat(toolkit): P2.2b 全卡覆盖 + Q1 非字面量 disabled 安全闸 + 确认页人话 | 8 文件，**+719 / −8**：`client/index.js`(+41) · `client/panel.html`(+29) · `panel/index.js`(+2) · `manager/apply-engine.mjs`(+35) · `manager/snapshot.mjs`(+9) · `scripts/p1-smoke.mjs`(+41) · **`scripts/p22-cards-ui.mjs`(+343 新增)** · `scripts/p22-verify.mjs`(+227) |
| `f6d99eb` | docs(toolkit): 台账 L-030 + handoff 11.10 —— 卡片口径 / 覆盖缺口闭合 / Q1 与 Q2 证据 | 2 文件，**+169 / −3**：`panel/docs/handoff-restart.md`(+94) · `panel/docs/ledger.md`(+78/−3) |

**HEAD** = `f6d99eb`。

#### 七、Q7 —— 实际文案字符串（逐字）

**用词是「两层开关」，不是「两层数据」。**

- `panel/client/index.js:210` = `"⚠ 两层开关不一致，所以现在没生效"`
- `panel/client/panel.html:178` = 同上（**两套渲染器逐字一致**）

设计意图：这两层的分歧发生在**开关（`enabled` / `disabled`）**上，说「数据」会让用户以为是配置值不同。
**结论：用词正确，属设计内，不改。**

#### 八、用户截图文案确认（用户第 5 点）

用户截图见 `web-search-local` 卡开关旁有「两层，改第一层」类说明，问是否设计内、4 张开放卡是否一致。**答复：是设计内，且逐字一致。**

| 逐字文案 | `client/index.js` | `client/panel.html` |
|---|---|---|
| `启停开关（两层分开，改的是第一层）` | 390 | 245 |
| `停用（改第一层）` | 414 | 258 |

**已并入 reload 目视清单**（`HANDOFF-MASTER.md` §7 的 C1/C2/C3）。

#### 九、Q2 / Q3 状态（未闭环，需用户）

- **Q2 四层 patch 栈扫描** —— **受阻于授权**。四层分别是：① `cordis.patch.yml`（顶层 patch）② `lib/*/dsh.plugin.json`（5 份）③ `panel/dsh.plugin.json` ④ `scripts/apply-preset-patch.mjs`（预设改写器）。其中①②③**全在仓内、本轮已扫完**；**第④层会触达 `~/.dsh`**（`USER_PRESETS_DIR = ~/.dsh/.agent-presets`，`apply-preset-patch.mjs:31`；另 `panel/index.js:96` 的只读兜底读 `~/.dsh/remote-web-ui-devices.json`）。**按用户「涉 ~/.dsh 先申请只读授权」的要求，未擅自读取，待授权。**
  另注：`preset-backups/` 与 `preset-patch-state.json` **已存在于仓内** ⇒ 该脚本**曾被执行过**（可据此复核，无需读 `~/.dsh` 即可部分对账）。
- **Q3 `HANDOFF-MASTER.md`** —— **磁盘上此前不存在**（正本仓 + 沙箱均 0 命中）。本轮**按用户点名的三要素新建**：`panel/docs/HANDOFF-MASTER.md`（头部时间戳 / §3「5 行 / 5 卡」口径 / §4 常驻进度行），并顺带纳入 §7 用户可见文案口径。**若所指另有其文，请指出即迁。**

#### 十、本轮复跑计数（全绿）

| 脚本 | 结果 |
|---|---|
| `scripts/p22-verify.mjs` | **98/98** |
| `scripts/p22-cards-ui.mjs` | **71/71** |
| `scripts/p1-smoke.mjs` | **185/185** |
| `scripts/p21-verify.mjs` | **46/46** |
| `scripts/p2-smoke.mjs` | **16/16** |
| `node --test` | **92/92** |
| `scripts/p22b-retention-scope.mjs` | **15/15**（新增） |
| `pluggable-lint` | 通过 |
| doctor | **0/0/0** |
| 真实 `cordis.patch.yml` | **sha 未变**：`ce0b0b81c91ca4c420bb5302b2dbe951de0347ca729122511be288aa7c2b76b9`（size 3097） |

### 11.12 Q2 终局结论 + 四层映射 + Q6 溯源 / 处置 / 回滚保险（2026-09-18 09:14）

> 完整表格见 `HANDOFF-MASTER.md` §8 / §9；可复现证据 `panel/docs/evidence/Q2-LAYER-SCAN.txt`（`node scripts/q2-layer-scan.mjs --agent-presets`，**20/20 PASS**）。

#### 一、前提更正（重要）

**「四层 patch 栈」在仓内没有先例。** 全仓 `grep 四层` 只命中本任务自己写的 L-031 / 11.11 / HANDOFF-MASTER。
⇒ 下方四层是**本侧定义**，**总文档全文到达后必须逐层对账**；对不上即有第五层或被合并，**扫描不算穷尽**。

#### 二、Q2 终局结论（① ② ③ 层）——「无」也是结论

**结论：三层中既不存在 toolkit 五个 id 的重复行，也不存在任何覆盖 / 遮蔽声明。**

| 层 | 扫描项 | 结果 |
|---|---|---|
| ① | `- id:` 行 | 共 **9 个**：顶层 2（`web`、`web-search-deepseek`）+ 嵌套 7；其中**插件挂载行 5 个**，另 2 个（`v4-pro`/`v4-flash`）是 `rate-throttle.routing.staticGroups` 的**组 id**、非挂载行 |
| ① | 同 id | **每个 id 恰好 1 次**，无重复 |
| ① | 覆盖/遮蔽声明 | `override` / `replace` / `shadow` / `覆盖` / `遮蔽` / `取代` **0 命中** |
| ② | 五份 `lib/*/dsh.plugin.json` | 字段仅 `manifestVersion` / `name` / `requirements`（`compact-router` 多一个 `optionalDeps`）。**无 `id` / `patch` / `override` / `bundle`** ⇒ 层②**既不产生也不能遮蔽**任何行 |
| ③ | `panel/dsh.plugin.json` + `panel/package.json` | 同上；`panel/package.json` 只声明 `dsh`（client 面），**不声明 patch 文件** |

**跨层同 id**：五个 id **只出现在第①层**；第②③层用的是**包名**，不是行 id。

#### 三、四层 → 物理载体映射（摘要；全表见 HANDOFF-MASTER §8.1）

| 层 | 物理载体 | 关键行号证据 |
|---|---|---|
| ① | `cordis.patch.yml`（仓根） | `package.json:28`（`dsh.bundle.patch`）；面板落盘目标 `panel/index.js:275`/`:328` |
| ② | `lib/{rate-throttle,compact-router,agent-memory,search-router,web-search-local}/dsh.plugin.json` | 成卡判据 `panel/manager/snapshot.mjs:112` |
| ③ | `panel/dsh.plugin.json`（+ 运行时 `panel/index.js`） | `panel/dsh.plugin.json:9`；`panel/index.js:16-17`；`api-notes.md:137` |
| ④ | `scripts/apply-preset-patch.mjs` → `~/.dsh/.agent-presets/*` + shipped presets | 脚本 `:31` / `:64-78` / `:33-46`；`cordis.patch.yml:3` 注释自陈 |

#### 四、Q2 ④ 层（`~/.dsh/.agent-presets` 一次性只读授权，严格只读）

- 目录 2 个：**`liangshen`**（活动预设，21780 B）含新名 `@local/dsh-toolkit/compact-router` ✓，**无** upstream 残留、**无**旧名残留；
  **`liangshen.bak-20260914`**（人工备份目录，19792 B）同样含新名，被脚本 `.bak` 规则排除（`apply-preset-patch.mjs:84`）⇒ 不会重复改写。
  **但它含 `agent.cordis.yml`，是否会被 dsh 当预设列出属 dsh 侧行为，本轮未验证（如实标注）。**
- 对账 `preset-patch-state.json`：4 条（`standard`/`ptc`/`cordis` @ `2026-09-14T05:13:13Z`；`liangshen` @ `08:02:55Z`）。
- `preset-backups/` 4 份 `.bak` 揭示 **④ 层有两种历史来源**：`standard`/`ptc`/`cordis` = **upstream**（含 `dsh-compaction-basic`）；
  `liangshen` = **旧独立插件**（含 `@local/dsh-compact-router`）⇒ 迁移到新名是**独立的历史动作**。
  已断言每个 `.bak` 都是**真正的改写前状态**且**不含新名行** ⇒ 回滚语义成立。
- **未覆盖面（如实标注）**：3 个 shipped preset 的**当前内容**在 `AppData/…/npm/…/dsh-agent-presets/presets/`，**不在本轮授权路径内、未读**；
  是否另给授权见 `HANDOFF-MASTER.md` §6 U4。
- **④ 层结论**：工具链里只有 `compact-router` 经第④层挂载（其余 4 个插件行不在任何预设里）；无旧名残留、无 upstream 残留、每个改写都有 `.bak`。

#### 五、Q6① 溯源 —— 含一处**必须申报的缺口**

- **diff 全文**：4 个 `+` 行 = 空行 + `- insert:` + `    - id: toolkit-manager` + `      name: 'file:///D:/dsh-plugins/dsh-toolkit/panel/index.js'`。
- **字节账闭合**：磁盘 `3097` = `HEAD` blob `2914`（git 库内存 LF）+ 追加块 `101` + CRLF 增量 `82`。⇒ **磁盘 = HEAD + 这 4 行，逐字节可复现**（「M 单行 = 除该行外零漂移」的硬证明）。
- **git 侧**：该字符串**从未进入该文件的 git 历史**（pickaxe 无命中）；该文件在 git 里只有 2 次提交（`e50bb00` 总装、`37819e9` Sogou 修正），HEAD blob **2914 B 完全不含该行**。
- **可归因最早证据**：`.panel-backups/arm-manifest-20260917-105930/cordis.patch.yml`（**3072 B**）**已含该行**（旧名 `@local/dsh-toolkit/panel`）⇒ 该行在 **2026-09-17 10:59:30 之前**已在磁盘。
- **19:55:50** 改为 path-like（依据 `api-notes.md:132-137`；记载 `ledger.md:65` 与 `:72`）。
- ⚠️ **缺口申报**：该行的**首次落盘时刻与操作者未留档**（无 git 记录、无备份捕住创建瞬间）。此前 ledger 只记「**行名改写**」，未记「**行首次落盘**」。**据实申报，不掩饰。**
- **「既有约定」正本出处（存在，非口说无凭）**：`ledger.md:214`（原文：4 行改动**未提交**，属运行配置，按 11 节程序在重启验收后单独处置）+ `ledger.md:55-65` + 本文件 `:118-122`。

#### 六、Q6② 处置意见：**重启验收通过后语义化提交**（同意用户方向）

磁盘是运行真相；**提交只改 `.git` 不动磁盘字节**，`ce0b0b81…` 对账不受影响；**提交后 HEAD 与磁盘一致，回滚才有「保留面板」的语义目标**（见七）。
唯一可能的「不提交」理由（该文件属运行配置、含环境相关路径）**已是既成事实** —— 文件本身早已入库，只是缺这 4 行 ⇒ **结论：提交。**

#### 七、Q6③ 回滚保险 —— 已加注于本文件 **`:118` 回滚程序**之后（⛔ 醒目块）

要点：`git checkout -- cordis.patch.yml` / `git restore` ⇒ 回退到 HEAD blob（**2914 B、LF、无该行**）⇒ **删 4 行 → 入口消失 → 面板失联**，**且 CRLF→LF**。
**实测**：`pre-p2-toolkit-manager-…/cordis.patch.yml` 与 `HEAD:cordis.patch.yml` **sha256 完全相同**（`7541c05a…`）⇒ 它是「**P2 之前**」的目标，**不是「保留面板」的目标**。
保留面板的回滚须按目标语义选**含该行**的快照（3072 / 3094 / 3113 / 3120 四档，表见加注块与 HANDOFF-MASTER §9.5）。
**终验 SHA 对账基准 = 磁盘当前值 `ce0b0b81…`（3097 B、CRLF、含 4 行）；不得用 `7541c05a…`（2914 B）作基准。**

#### 八、Q5 附注落点

`doctor/dry-run`（`panel/index.js:250` / 守卫 `@:259`）的**有意过度收口**已落 **`panel/docs/api-notes.md` 专节**（「P2.0② 写路由判定」），
含完整判定表、guard 行号、**以及「请勿当作 bug 修正」的显式说明** —— 实测该路由会 `execFile` 起子进程（`panel/manager/doctor-runner.mjs:5-8`），
故把它放在「服务缺席时走 `devicesFile` hasOwn 兜底放行」的只读路径上才是真的破口。

#### 九、时钟锚点（小项）

`EVIDENCE.txt` 的「生成时刻」是 **UTC（Z）**，本地 = **UTC+8**。本轮会话的 `<current_time>` 曾给出**错位值**（报 2026-09-17 23:31，实测 2026-09-18 08:53）。
**真实交互时间锚点**：P2.1 证据 `2026-09-17T15:43:18Z` = 本地 **23:43:18**；P2.2 `15:57:56Z` = 本地 **23:57:56**；P2.2b `2026-09-18T00:13:52Z` = 本地 **08:13:52**；本轮 `2026-09-18 09:14`（本地）。
`evidence/README.md` 已加注，防未来对账困惑。

#### 十、本轮复跑计数

`q2-layer-scan.mjs`（新增）**20/20** ｜ `p22-verify` 98/98 ｜ `p22-cards-ui` 71/71 ｜ `p1-smoke` 185/185 ｜ `p21-verify` 46/46 ｜ `p2-smoke` 16/16 ｜ `p22b-retention-scope` 15/15 ｜ `node --test` 92/92 ｜ `pluggable-lint` 通过 ｜ doctor 0/0/0 ｜ 真实 `cordis.patch.yml` sha 未变 `ce0b0b81…`。

---

## 11.13 第 7 轮交付：Q2 两尾闭合 + 源码定案 + 总文档合并受阻申报（2026-09-18 10:22 本地）

**本轮定位**：判定侧第 6 轮把 Q2 穷尽标准修正为「**不以任何一侧的层定义为准，以 loader 源码定案为准**」，并留下**两尾**（均纯读），与用户 reload 并行。末尾三件已办。

### 一、Q2 尾①：shipped presets 补扫（**21/21 PASS**）

**依据纠偏（重要）**：上一轮把 `AppData/…/npm/…` 也当成需要授权的路径，**这是过度收窄**。红线只有三处
（`~/.dsh`、cloudflared 进程、五子插件源码目录）；`AppData/Roaming/npm/…` 是 **DSH 安装目录**，**不在红线内** ⇒ 本轮**无需新增授权**即可读。

- 复现：`node scripts/q2-shipped-scan.mjs`；改名前后逐行 diff：`node scripts/q2-shipped-diff.mjs`。
- 证据：`panel/docs/evidence/Q2-SHIPPED-PRESET-SCAN.txt`（21/21 PASS）、`Q2-SHIPPED-PRESET-DIFF.txt`（55 KB 全量 diff）。
- **两问结论**：① **toolkit 五 id 行 = 无**（`rate-throttle` / `web-search-local` / `web-search-router` / `agent-memory-runtime` / `toolkit-manager` 一处都没有）；
  ② **覆盖声明 = 无**（`disabled` / `override` / `merge` 的命中**全部是 upstream 自己的内容**，详见 HANDOFF-MASTER §8.5）。
- **必须点名的第三件事（纠正）**：三份 preset **各含 1 行** `- id: compact-router` / `name: '@local/dsh-toolkit/compact-router'`。
  它是 `apply-preset-patch.mjs` 把 upstream 的 `- id: compaction-basic` / `@deepseek-ai/dsh-compaction-basic` **原位替换**的结果（Δ = +5 行 / +142 B，三份一致），
  `cordis.patch.yml:3` 注释自陈此事 ⇒ **是文档化的注入路径，不是泄漏；也再次证明 ④ 不是 patch 层，而是直接改预设源文件的路径**。
- 三份 sha256 **逐份 == `preset-patch-state.json` 的 `patchedSha`**（110 % 对账）；`minimal` 设计上不动（脚本明文），实测 0 处 `compact-router`。
- 残留：`@deepseek-ai/dsh-compaction-basic` **0 处**、旧名 `@local/dsh-compact-router` **0 处**。

### 二、Q2 尾②：loader 源码定案（注入点 + 合并语义），已落 `api-notes.md` 新节「P2.0③」

**注入点全集**（源码 + 行号逐条给据，见 `api-notes.md` §③.1）：base `[]` → **bundle patch ×N** → **profile `cordis.patch.yml`** → **home `cordis.patch.yml`** → **`--patch` ×N** → telemetry 合成补丁；
另有三个**非 patch** 注入面：env `.env`、`!!js` 表达式、**agent-preset 独立平面**，以及 toolkit 自带的**预设改写路径**。
唯一权威顺序出处 = `dsh/lib/profile-boot-Dk-7KqJc.js:212-220`（`allPatches()`：`bundlePatches → profile.patches → homePatches → overlays`）。

**「同 id 究竟什么行为」——分平面（这是本轮最有价值的定案）**：

| 平面 | 行为 | 锚点 |
|---|---|---|
| patch 层之间 | **后者覆盖**；**顶层 key 赋值 / `config` 整块替换**，**非深合并**；patch 写 `name` 且不符 → 警告跳过 | `dsh-app-boot/lib/index.js:98-105`；`README.zh.md:144` |
| insert | **纯追加**，不去重不合并；目标须 `group:true` | `:72-86` |
| loader 运行时 | 同 id **复用同一个 `Entry`**，`options` 被整体替换 ⇒ **不出现两个运行实例** | `cordis-plugin-loader/src/config/group.ts:20-40` |
| `disabled` | 沿父链继承；`!!js` 启动时求值 | `cordis-plugin-loader/src/config/entry.ts:84-108` |
| **agent-preset** | ⚠️ **首根胜（与 patch 层相反）**；shipped(`system`) 遮蔽 `$DSH_HOME/.agent-presets`(`user`) | `dsh-agent-presets/lib/invariant.js:426-432,1277-1287` |

**裁决**：「**同 id 后者覆盖**」= **真**（限定：patch 平面；语义是替换/顶层赋值）。「**四层 patch 栈：bundle（启动时固化）→ profile → home → overlay**」= **转述失真候选（第四例）**，三条理由：
① **overlay 是通名不是专名**（`loadOverlayPatches` 同时服务 bundle patch 与 `--patch`；`renderConfigDump` 注释 *"overlay layers in application order (later wins)"*）；
② **未覆盖注入面全集**（漏 base / env 两个非 patch 面 + preset 平面）；
③ 「bundle 层（启动时固化）」措辞有害歧义（若指「不热重载」则与源码一致；若指「内容固定」则不成立 —— **本 toolkit 的 `cordis.patch.yml` 就是一个 bundle patch**）。

### 三、转述失真第四例 + 授权链核实（入档）

- **第四例登记**：命题「四层 patch 栈」，**正本查无实据**（全仓 `grep 四层` 只命中本任务自己写的 L-031 / L-032 / 本文件 / 11.11）。**与 11.11 同族** ⇒ 记入 **L-033**，与 11.11 并列成「转述链」清单。
  **处置**：**不删除、不悄悄改写**原表述；在 HANDOFF-MASTER §8.0 / §8.4 **加批注**并给出源码实测结论（符合用户「原文保真 + 批注 + 不悄悄改写」的对账原则）。
- **授权链核实（如实申报）**：
  - ④层扫描（`~/.dsh/.agent-presets`）的授权 = **用户在本轮会话中给出的一次性只读授权**（并复述确认）。**授权时刻只能锚到「用户当轮消息」，无独立时间戳留档** —— 会话时钟锚点见 `evidence/README.md` 时钟锚点节。**据实申报，不补造时间。**
  - 本轮 AppData 扫描**不依赖该授权**（红线定义本身即可）。
  - **新增缺口 U8**：注入点 3（`$DSH_HOME/cordis.patch.yml`）**未读**（在红线内，授权只到 `.agent-presets`）；它**优先级高于 profile 层**，理论上可携带 toolkit 任意 id 行。若求穷尽需**单次授权**补扫。
- **新增缺口 U9**：`apply-preset-patch.mjs --status` 报 `liangshen: unknown`。查明原因：该文件**含**新名行，但其 sha **≠** marker 里的 `patchedSha` ⇒ **改写后被后续改动过**（marker 陈旧）。**不构成功能问题**，但 marker 与磁盘不再逐字节对账；是否刷新 marker 待用户定。

### 四、Q3 总文档合并：**如实申报阻塞**（不伪造正本）

用户本轮已把**总文档全文（九大节）**发来（一、项目是什么；二、五份正本文档；三、系统架构速览；四、当前进度；五、P2 阶段表；六、项目铁律；七、运维手册；八、关键历史教训索引；九、与用户的沟通约定）。
**但**：会话已压缩 ⇒ **全文在当前上下文中不可取回**。取证穷尽：

| 取证动作 | 结果 |
|---|---|
| `conversation_search`（跨会话检索总文档原文） | **0 条命中** |
| 全仓 `grep`（`沟通约定` / `项目铁律` / `关键历史教训` / `系统架构速览` / `五份正本`） | 仅命中 `HANDOFF-MASTER.md`（骨架自身）与 `ledger.md` 的**待办描述**，**无原文** |
| 目录遍历（正本仓 + `panel/docs/`） | **无任何文件承载该九节** |

**处置决定（关键）**：用户的对账原则是「**原文落盘保真、存疑条目加批注、不得悄悄改写**」。
⇒ **凭记忆重建九大节 = 伪造正本**，直接违反该原则。**故本轮不做合并，改为如实申报 + 请求重发。**
合并所需的一切**已就位**：九节结构已知、叠加点（头部时间戳 / §3 五卡口径 / §4 进度行 / §5 安全模型 / §6 待用户项 / §7 目视清单 / §8 定案 / §9 回滚保险）已全部写好在 `HANDOFF-MASTER.md`，**全文一到即为纯机械动作**。
**后果（必须让用户知道）**：真实终验的**第二个前置（总文档合并）处于阻塞态** ⇒ **在全文重达前，终验无法启动**（另两个前置：Q2 两尾 ✅ 已完成；目视 ⏳ 待 reload）。

### 五、本轮复跑计数

`q2-shipped-scan.mjs`（新增）**21/21** ｜ `q2-shipped-diff.mjs`（新增，输出 diff）**无断言** ｜ `apply-preset-patch.mjs --status`（只读）**standard/ptc/cordis = patched、liangshen = unknown** ｜
上一轮基线全部保持：`q2-layer-scan` 20/20 ｜ `p22-verify` 98/98 ｜ `p1-smoke` 185/185 ｜ `node --test` 92/92 ｜ doctor 0/0/0 ｜ 真实 `cordis.patch.yml` sha **仍为 `ce0b0b81…`（未变）**。

---

### 11.14 授权语义澄清（第 12 轮新增 · 交用户定）

**背景**：上一轮「④ 层扫描」用的是**用户当轮会话给出的一次性只读授权**，但「**一次性授权**」的**边界语义此前无成文化定义** ⇒ 判定侧第 12 轮要求澄清，并列为**新 U 项（U12）交用户定**。

**待用户裁决（二选一或自定义）**：

1. **维持逐次授权**（默认）：「一次性授权」**以该次任务为限**；此后凡涉 `~/.dsh` 读取**须重新授权**。
2. **纳入「既定只读程序」清单**：由用户批准，把某条**具体路径**（如 `~/.dsh/cordis.patch.yml`）**类比 `devices.json`** 列入既定只读程序 ⇒ 今后**按程序读、不再逐次授权**。

**未裁决前的默认执行口径 = 选项 1**：`~/.dsh` 下除 `devices.json`（**既定程序豁免**，`panel/index.js:96`）外**一律不读**；**U8（注入点 3 补扫）按选项 1 办理**。

**与 U8 的关系**：U8 的「未读」**不是遗漏**，而是**遇授权边界如实申报**（不硬闯）。若用户选选项 2 并批准该具体路径，U8 即可在**无需逐次授权**的前提下补扫闭合。

> 📌 **第 14 轮 · 用户已裁决 = 乙（窄版既定只读程序，正式生效）**
> - **程序定义**：**注入点全表内 `~/.dsh` 路径**（见 `evidence/ROUND13-SUPPLEMENTARY-2.md` 全表：#0 / #2 / #3 / E1）、**只读**、**层间覆盖检查用途** —— 此后该范围内读取**不再逐次授权**。
> - **首批例行读取已执行**（2026-09-18，`scripts/q2-released-scan.mjs` → `evidence/Q2-RELEASED-SCAN.txt`）：**#3 文件不存在 · #0 = `[]` · #2 = `[]` · E1 文件不存在 · #5 `DSH_TELEMETRY_DISABLED` = undefined ⇒ 注入点 5 无效**（#4 不适用已注）⇒ **Q2 全表穷尽 ✓**。
> - **可选项关闭**：「重发原文做全文 diff」随判定侧盲抽 8/8 闭环而关闭。
> - **程序边界**：仅上述全表内路径与用途；`~/.dsh` 内其余路径**不**入程序（`devices.json` 仍走原既定程序豁免，其余仍逐次授权）。
> - 上方「待用户裁决」原文**保留不改**（只增不改语义）。

> 📌 **第 16 轮 · U13 已裁决（第 17 轮口径升级：用户书面确认 —— 判定侧在案，原文「这条 u13 指令我批准的」；正式生效）**
> ① **越界读追认 ✓**（`dsh-rate-throttle.json` 那次只读，L-041 补记）；② **扩乙 ✓** —— `~/.dsh/dsh-search-router.json` + `~/.dsh/dsh-rate-throttle.json` **正式纳入乙程序只读清单**（用途 = **层间覆盖检查 / snapshot 生效值呈现**，此后不再逐次授权）；③ **`~/.dsh/settings.yaml` 不纳入 ✓**（web-search-local 走 settings 服务 API，面板永不读该文件）；④ **授权纪律附则（成文）**：「**先申报后读，明显相关不豁免**」—— 授权段外即使看似明显相关的 `~/.dsh` 文件也须先申报、获准后方可读。
> - **乙程序只读清单（现行完整版）**：注入点全表内 `~/.dsh` 路径（#0 / #2 / #3 / E1）+ 上述两热 JSON。**不含**：settings.yaml、其余一切路径。
> - 上方第 13/14 轮补记原文**保留不改**。

**落点**：`HANDOFF-MASTER.md` 附录 B **U12**；摘要 `evidence/ROUND12-SUPPLEMENTARY-ACCEPTANCE.md` §五。

> 📌 **第 13 轮补记（判定者推荐）**：判定者**推荐乙（窄版）** —— 仅**注入点清单内文件**、**仅只读**、**层间覆盖检查用途**，类比 `devices.json` 先例；理由：该检查需**固化为例行防线**，逐次授权使防线失效。**仍待用户裁决**。另：第 13 轮补呈的**注入点全表**（`evidence/ROUND13-SUPPLEMENTARY-2.md`）已如实补登**同族缺口 #0 / #2 / E1**（`~/.dsh/profiles/web/cordis.yml`、`~/.dsh/profiles/web/cordis.patch.yml`、`~/.dsh/.env`，均红线内未扫）—— 若用户批准乙，**随 U8 同一批授权一并补扫**即可全部闭合。

---

## 12. 会话交接卡（10 行 · 关账硬前置，2026-09-18 新会话第 3 轮更新）

1. **当前状态**：P2.3 已关账；**P2.4 扩容证据批完成，待判定侧验收 → 设计稿**。
2. **基准事实**：`cordis.patch.yml` = `ce0b0b81c91ca4c4…`（3097 B / CRLF / 82 行），提交于 `22fde85`；证据批全程零写入，git 工作区干净。
3. **下一步**：拿到判定侧对证据批的验收后，产出 P2.4 扩容**设计稿**（卸载 UI + 弹窗文案 + 恢复流程 + doctor 项 + 双回滚 UI）。
4. **P2.4 范围（已定案）**：卸载/恢复 + 联动感知 + doctor 操作台 + 双回滚统一设计；分批施工：证据批 → 设计稿 → 施工批 1（卸载/恢复）→ 施工批 2（doctor 操作台）。
5. **联动分类（证据批结论）**：限流/压缩/记忆联动成立；**新发现搜索插件联动（search-router × web-search-local × `web.config`）已呈判定侧**。
6. **待用户**：无（P2.3 已关账、U9/U10 已闭环；P2.4 证据批待判定侧验收）。
7. **正本索引 ①**：`HANDOFF-MASTER.md`（总索引 + 项目史；§四叠加 4.1/4.8 + 阶段表 P2.4 扩容；附录 A 运行配置 / B 待用户项 U1–U13 / C 变更记录）。
8. **正本索引 ②**：`handoff-restart.md`（本文；重启 / 回滚 / 阶段表 / 契约 + §11.14 授权程序）、`ledger.md`（唯一台账，最新 L-048/L-049）、`api-notes.md`（平台事实 + 源码行号）。
9. **正本索引 ③**：`evidence/`（最新 `P24-EVIDENCE.md` + `P23-FINAL-ACCEPTANCE.txt`；README 有清单 + sha）；`scripts/regression-all.mjs`（回归一键全跑）。
10. **红线（本轮已修订）**：五子插件源码目录改为**面板可在用户知情确认下执行子插件文件删除**；`~/.dsh` 与 cloudflared 红线不变。其余不变：不 import 兄弟插件、写前必备份、写盘 / 重启**先授权**、异常带证据回报不在线上调试、回滚先于排查、授权纪律「先申报后读」、每完成一个批次同步更新本卡。

> 📌 **新会话第 2 轮更新（上下文纪律兑现）**：上面 10 行已按 **P2.3 关账口径**重写为当前版本（P2.3 已关账、P2.4 排队）。下方第 12 轮补充块**保留为历史记录**，不再表达当前状态。

> 📌 **第 12 轮补充（上面 10 行不动）**：① **P2.3 开工前**须先完成**催收三项补验收**——正文摘要见 `evidence/ROUND12-SUPPLEMENTARY-ACCEPTANCE.md`（摘要 A/B/C + U8/U9 呈报）；**关账已被接受，补验收不改结论**。② **U6 / U7 已销项**；**新增 U12（授权语义澄清，待用户定）**，正文见 **§11.14**。③ P2.3 的第一动作仍是**本节（§12）**，**先证后写**。



