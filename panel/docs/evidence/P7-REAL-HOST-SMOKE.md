# P7 真实 dsh-web-all 宿主冒烟 · 验收证据

> 时刻：2026-09-20 20:05–20:12（GMT+8）。对应提交：toolkit@8bb4d13 + toolkit@6e50bf3 + doctor@6839cc1。
> 授权：用户当场批准「授权我重启 dsh web 做冒烟」（冷启动包 v4 第三步人工停点之一）。
> 宿主：`@deepseek-ai/dsh` 全局安装，profile `~/.dsh/profiles/web`，`@linxin666/dsh-web-all` 在场，
> 端口 127.0.0.1:3080，隧道 cloudflared 为 dsh web 的**子进程**。
> 纪律兑现：**零宿主改造、零对方代码改动**；`~/.dsh` 全程未读写（含 settings.yaml，按 U13 口径不碰）；
> 唯一被改过的文件是 toolkit 自己的 `cordis.patch.yml`（本仓、可逐字节还原，见 §四）。

## 一、重启手段：用既有权威脚本，不自己发明

`scripts/restart-trigger.ps1 -DelaySeconds 0`（v2.1：`.NET Process.Kill()` 逐 PID、叶子优先；
唯一启动闸门=端口释放；失败即 `exit 1` 不双开）。日志三份在
`.panel-backups/restart-logs/restart-trigger-20260920-{200558,200926,201038}.log`。

| 轮 | 时刻 | 杀树 | 新 pid | 端口回来 |
|---|---|---|---|---|
| 1（P7 代码首次进宿主） | 20:05:58 | 18132 cloudflared + 10104 node | 16624 | 20:06:22（19s） |
| 2（卸载态：摘掉 toolkit-manager 行） | 20:09:27 | 17388 + 12124 + 16624 | 1692 | 20:09:48（17s） |
| 3（还原挂载行） | 20:10:40 | 1692 | 13652 | 20:11:00（17s） |

隧道影响如实记录：cloudflared 是 dsh web 子进程，故随每次重启被一并杀掉；**三轮均由 dsh web 自己重新拉起**
（第 2 轮后实测子进程 `28232 cloudflared.exe`，第 3 轮后同样在场），无需人工重开桌面快捷方式。

## 二、冒烟清单三项逐条结果

### ① web-search-local 运行时回归（P5 遗留，本轮清偿）

- **宿主侧挂载态**：三轮重启后 `/api/toolkit-panel/snapshot` 均报 `web-search-local:mounted`，
  与另 4 个插件一致；面板工具区如实呈现其两层开关状态。
- **运行时功能**：探针 `var/scratch/p7-coldstart-v4/probe-web-search-local.mjs` 直接调用该插件导出的
  `runSearch()` / `fetchUrl()`（真实公网、不启宿主、不注册 provider、不碰 `~/.dsh`）：
  `search ok in 1192ms: sources=12`（首条 `https://api-docs.deepseek.com/`），
  `fetch ok: statusCode=200 kind=html bytes=45795 truncated=false`，退出码 0。
  原文留档 `probe-web-search-local-report.txt`。
- **如实边界**：该探针证明的是「P5 manifest 契约化之后，插件自身的搜索/抓取代码路径没坏」，
  不等于「宿主内一次真实 agent 联网搜索调用」——后者需要你的登录会话（宿主 `/api/web/search` 对
  未认证请求返回 401，本侧不取用你的凭据）。要补这一口，你在会话里点一次联网搜索即可。

### ② 归一面板在宿主进程内可达可用且 SSE 实时（不只是 200）

第 1、3 轮重启后各测一遍，结果一致：

| 探测 | 结果 |
|---|---|
| `GET /api/toolkit-panel/ui`（兜底页） | 200 |
| `GET /api/toolkit-panel/snapshot`（P2.4 工具区数据源） | 200，5 插件 mounted |
| `GET /api/toolkit-panel/v2/snapshot`（registry 管理面） | `{"ok":true,"servicePrefix":"toolkit","doctorAvailable":true,"plugins":[]}` |
| `GET /api/toolkit-panel/v2/connector.js`（引擎 HTTP 面） | 200 |
| `GET /api/toolkit-panel/v2/events`（SSE 真流） | 拿到线协议帧：`retry: 2000` + `event: hello` + `data: {"servicePrefix":"toolkit","at":1789906304227}` |
| `POST /api/toolkit-panel/doctor/dry-run`（宿主进程内调真 CLI） | `ok=true`，summary `error:0 warning:0 info:0 … manual:0`，issues=0 |

SSE 断言口径说明：本项证明「事件通道在宿主进程内建立并推送首帧（含本实例 servicePrefix）」；
浏览器侧的「装一个插件 → 卡片免刷新出现 → 审计 toast 实时到达」全链已在 mock 桶真浏览器闭环取证
（`P7-MOCK-BUCKET-LOOP.md` 第 3/4/5 步），本侧**未在宿主进程内做写入型安装**（避免污染你的
live registry，见 §三）。

### ③ 卸载后宿主恢复原状（含 HTTP 路由全部注销）

手段：把 `cordis.patch.yml` 末尾的 toolkit-manager 挂载 3 行整体注释（第 80–82 行，`git diff` 显示
仅 3 行变更），重启（第 2 轮）。

| 探测（第 2 轮，toolkit 已卸载） | 结果 |
|---|---|
| `/api/toolkit-panel/{ui,snapshot,custody,doctor/states,v2/snapshot,v2/events,v2/connector.js,plan}` 8 条抽样 | **全部 401**（与挂载态的 200 相反）：请求不再由 toolkit 处理器应答，落到宿主 `/api/*` 的统一鉴权闸 |
| 新 pid 1692 的监听面 | 仅 `127.0.0.1:3080` 一个监听 ⇒ toolkit 未留下任何自有端口 |
| 宿主自身 | 端口正常监听、页面与 API 由宿主继续服务（`/`、`/api/health` 等均返回宿主鉴权响应，非崩溃/非 502） |

结论：toolkit 只通过被注入的 `webServer` 注册路由（P7.4 前提），行一摘、路由即全数消失，
宿主回到没有 toolkit 的原状；**没有旁路端口、没有悬挂监听、没有残留服务**。

## 三、本侧明确没做的事（避免被当成做过）

- 没在你的 live 宿主 registry 里安装任何外部插件（写入型安装只在 mock 桶真浏览器里跑过）。
- 没调用宿主写路由（`/plan`、`/execute`、`/toggle/*`、`/uninstall/*`）——只调了只读的
  snapshot/custody/states 与只读语义的 `doctor/dry-run`。
- 没读也没写 `~/.dsh` 下任何文件（含 `settings.yaml`、两个热 JSON、profile patch）。
- 没取用你的会话凭据，因此没做宿主内的真实联网搜索调用（①的边界已写明）。

## 四、还原自证

- `cordis.patch.yml`：`git checkout` 还原后 `sha256 = ce0b0b81c91ca4c420bb5302b2dbe951de0347ca729122511be288aa7c2b76b9`，
  与冒烟前快照逐字节一致，且与台账 L-060 关账基准（3097 B / CRLF）同一枚哈希；
  `diff` 对比留档副本 `var/scratch/p7-coldstart-v4/cordis.patch.yml.orig` 零差异。
- 第 3 轮重启后面板与 SSE 复测全绿（§二 ①② 表），registry 仍为 `plugins: []` ⇒ 冒烟未在你的
  live 状态里留下任何记录。
