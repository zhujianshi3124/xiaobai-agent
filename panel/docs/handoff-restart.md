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
| 2 | **P2.2 完成后** | P2 写操作能力上线后的验证 | 未到 |

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

**安全模型（全项适用于 P2 各阶段）**：两段式、SHA 冲突检测、锚点唯一、值白名单、写路由 CSRF + 配对服务校验（禁 fallback）、写前备份、plugin-manager 并发防线（**快照现读不缓存**）。

**执行顺序**（用户指定，逐阶段报验收证据后方进下一阶段）：

```
P2.0②（写路由 guard 升级）→ P2.1 两段式 → P2.2 启停（rate-throttle 首用例）
  → P2.3 配置编辑 → P2.4 doctor + 回滚
```

**reload 节奏**：每完成一个 **client 可见**阶段报一次，由用户按 `restart-trigger` 自行执行（用户已会）。

**证据要求**：**P2.1 起，每个写操作必须附真实备份产物与 SHA 记录。**

**待用户项（每次回报末尾保留）**：设置页 tab 是否可见 —— 用户尚未回报。

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


