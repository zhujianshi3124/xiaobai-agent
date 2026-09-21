# D-4 · 宿主会话内一次真实联网搜索 · 验收证据（补 G 第⑨项）

> 时刻：2026-09-21 13:11–13:48（GMT+8）；证据取数 14:05 前后。
> 背景：`G-REAL-HOST-SMOKE.md` §三把第⑨项记为"未验（阻塞在会话凭据）"，本文件是用户
> 亲自点搜索之后的**补验收口**——G 的九项至此全部闭环。
> 授权与纪律：取数全程**只读**；不改 `~/.dsh` 任何文件、不取用凭据、不重启宿主
> （13:11 起的那两个会话是用户自己在浏览器里操作的）；本文件之外未新增任何写入。
> 取证脚本与原始输出：`.panel-backups/g-real-host-smoke-20260921/d4-websearch-final.mjs`
> 与 `d4-websearch-report.txt`（可重放：`node d4-websearch-final.mjs`）。

## 一、结论

**PASS。** 宿主会话正本里共 **7 次 `web_search` 调用，7 次全部 `isError=false`，
合计返回 47 条来源链接**，且可归因到 **web-search-local**（三重归因见 §四）。
D-4 就此关闭。

## 二、三格硬证据（逐条）

| # | 时刻（本地） | 会话 | queries | isError | 来源条数 | 域名样本 |
|---|---|---|---|---|---|---|
| 1 | 13:15:24.504 | `41af1777…` | `["github.com/cordiverse/cordis"]` | false | 7 | github.com, www.toutiao.com, github.tw.cn |
| 2 | 13:17:29.705 | `41af1777…` | cordis plugin loading exports main entry 等 2 条 | false | 5 | github.com, blog.csdn.net |
| 3 | 13:47:42.221 | `6c77e677…` | cordiverse cordis 最近 更新 动态 等 3 条 | false | 7 | github.com, zhuanlan.zhihu.com, baike.baidu.com, blog.csdn.net |
| 4 | 13:47:52.005 | `6c77e677…` | cordiverse cordis September 2026 等 3 条 | false | 6 | github.com, zhuanlan.zhihu.com, tool.lu, cordis.moe … |
| 5 | 13:48:01.573 | `6c77e677…` | cordis.moe 等 3 条 | false | 7 | zhuanlan.zhihu.com, cordis.moe, emea.cordis.com … |
| 6 | 13:48:11.735 | `6c77e677…` | cordiverse cordis release notes 等 3 条 | false | 8 | github.com, cloud.tencent.com, tool.lu … |
| 7 | 13:48:23.938 | `6c77e677…` | Cordis v4 可组合性 元框架 等 3 条 | false | 7 | zhuanlan.zhihu.com, github.com, www.cnblogs.com … |

单条耗时 3.4–10.5s（派发与回执两条记录的时间差，例：#3 `05:47:31.713Z` 派发 →
`05:47:42.221Z` 回执 = 10.5s）⇒ 是真实外网往返，不是本地桩。

## 三、取数口径的两次纠错（为什么前两版报 0）

诚实记录，免得后人以为"前两版证明没搜索"：

1. **第一版脚本只按 `type==='tool/call'` 取工具名** ⇒ 报 0。但真实宿主里 `web_search`
   是在 `run_code` 程序内被调用的，落盘记录类型是 **`tool/ptc-dispatch-start` /
   `tool/ptc-dispatch`**（带 `name` / `arguments` / `isError` / `content`，外层
   `tool/call` 的名字是 `run_code`）。这是**取证脚本的缺陷**，不是"搜索没发生"。
2. 会话正本是 zstd **多帧级联**（会话边跑边追加），整块一次解压只拿得到首帧（实测
   319 KB 文件只解出 200 字节）；脚本按 `28 B5 2F FD` 魔数逐帧切分解压后才拿全 110 条记录。

⇒ 教训已写进脚本头注。前两版报出的"零命中"里，**13:14:54 那次 `web_fetch` 的
`ToolNotFoundError` 是另一会话（`41af1777`）工具面差异**，与本案无关（用户已判定）。

## 四、归因：这 7 次搜索确实走的是 web-search-local

三重独立证据，不靠"应该是"：

1. **路由规则**：`lib/search-router/index.js:106-116` —— `mode:"auto"` 下只有 provider 命中
   `officialProviders`（配置里是 `["llm-deepseek"]`）才走官方，否则取
   `defaultWhenUnknown`，宿主配置为 `"local"` ⇒ `DELEGATE_LOCAL = "local-multi"`。
   本次会话实际用的 provider 是 `sensenova-gateway-2` / `sensenova-gateway` /
   `modelscope-gateway`（取自会话 `model/selection` 记录），**都不在 officialProviders** ⇒ 判 local。
2. **输出格式指纹**：结果正文里的 `Sources:` 清单与这两句收尾——
   `Cite the relevant URLs above as markdown links in your answer.` 与
   `(Showing the first N sources. Refine the query for more.)`——
   只存在于 `lib/web-search-local/index.js:1280-1291`（`- [label](url) — snippet` 渲染 +
   这两句提示）。在两份会话正本里共命中 **5 次**（`6c77e677` 那 5 条），与 §二 的会话分布一致。
3. **装配在场**：G1③ 已证 `web-search-local` 在 5/5 mounted 列表里，其 manifest 注册的
   providers 为 `local-multi` / `local-fetch`（`lib/web-search-local/dsh.plugin.json`）。

## 五、口径澄清（用户裁决在案）

- 用户明确裁：**不按 fetch 格关账**——fetch 走 `local-fetch` 提供者，是另一格；
  D-4 原文要的是"一次真实联网搜索"。本文件因此以 `web_search` 的 7 条为关闭依据。
- 13:35 那一轮的 6 次 `web_fetch`（5 成功 / 1 失败）是**用户前一句话术语义即"访问这个链接"**
  导致的正确行为，属情形 (a)（话术问题），与链路无关；本轮已另取 `web_search` 证据。
- 取数过程未做任何修复或降级判定：三处零命中时按 G2 即停即报、由用户分辨 (a)/(b)。

## 六、D-4 关闭语句

`docs/debt.md` D-4（源自 P8 终版、原记"待用户人工补验"）于 **2026-09-21** 关闭，
证据＝本文件（§二 三格 + §四 归因），原始输出留档
`.panel-backups/g-real-host-smoke-20260921/d4-websearch-report.txt`。
G1 九项清单随之**全部闭环**。
