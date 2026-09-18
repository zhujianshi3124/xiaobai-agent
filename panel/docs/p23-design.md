# P2.3 配置编辑 · 设计稿（第 15 轮呈报 · 批准前不动任何代码）

> 版本：**2026-09-18 14:05（GMT+8）** · 状态：**待判定侧第 15 轮验收**
> 依据：第 14 轮放行 + 消费点证据（`api-notes.md` §「P2.3 前置」）+ 第 15 轮授权段补扫（`evidence/P23-SHADOW-SCAN.txt`）
> 本稿为**设计文档，零写盘**（不改 `cordis.patch.yml`、不改任何插件/面板代码）。

---

## 一、范围收敛 —— 5 卡可写口径（判定侧第 15 轮标准）

| 卡 | 层 2 可写入口 | 口径（两分标注） | 依据 |
|---|---|---|---|
| **rate-throttle** | **有**（`enabled` + 白名单标量字段，见 §二） | 插件**真实消费**（`:157/:224/:656/:781`） | 唯一有 `config.enabled` 消费点的卡 |
| agent-memory | **无** | 「**无内部开关**」（config 无 `enabled` 键、插件也不读） | `plugin.js:105-244` 仅读 dataRoot/defaultWorkspace/enforceFreshness |
| compact-router | **无** | 「**无内部开关**」 | 源码 0 消费 |
| web-search-local | **无** | 「**无内部开关**」（无 `enabled` 键且 schema 无此字段） | `Config` schema `:117-134` |
| search-router | **无 `enabled` 入口**；`mode` 特殊处理见 §三 | mode 按 §三方案呈现；`enabled` 若有键亦属「插件不读此字段」 | 0 消费 + 三层配置面 |

> 「有键不读 → 插件不读此字段」口径**保留在渲染器里**：当前 5 卡无一命中该态（唯一有键的 rate-throttle 真实消费），但口径必须实现，防未来出现假开关。

---

## 二、白名单取值域逐字段表（rate-throttle —— 首批开放集）

**开放原则：只写「标量」（布尔/数值/枚举）；数组 / 对象 / 文件路径一律不开放**（结构复杂度与任意路径写风险）。

### 顶层（`config:` 直下）

| 字段 | 类型 | 合法域（面板服务端校验） | 源码依据 | 源侧自身校验（设计注记） |
|---|---|---|---|---|
| `enabled` | bool | `true / false` | `:157`（`!== false`，缺省 true） | 有（非 false 即真） |
| `minIntervalMs` | int | `0–3600000` | `:159`（缺省 20000） | **无**（`Number()` 直转，NaN 可进运行时 ⇒ 面板范围校验是唯一安全网） |
| `maxRequestsPerMinute` | int | `1–600` | `:160`（缺省 3） | **无** |
| `adaptive` | bool | `true / false` | `:161` | 有 |
| `maxIntervalMs` | int | `0–86400000` | `:162`（缺省 120000） | **无** |
| `backoffFactor` | number | `>0 且 ≤10`（作除数，0 → Infinity） | `:163`（缺省 2）、`:234`（`intervalMs / cfg.backoffFactor`） | **无** |

### `routing:` 子块

| 字段 | 类型 | 合法域 | 源码依据 | 源侧校验 |
|---|---|---|---|---|
| `enabled` | bool | `true/false` | `:167`（路由主闸 `:656/:781`） | 有 |
| `autoGroups` | bool | `true/false` | `:168` | 有 |
| `autoGroupTtlMs` | int | `1–86400000` | `:169`（`posNum >0`，缺省 300000） | 有（>0） |
| `cooldownMs` | int | `1–86400000` | `:175`（posNum，缺省 300000） | 有 |
| `tpmTurnSkip` | bool | `true/false` | `:176` | 有 |
| `tpmCooldownMs` | int | `0–86400000`（**0 = 关闭短除名**，合法） | `:152-158`（`>=0` 特判，缺省 45000） | 有（≥0） |
| `downgradeContextMargin` | number | `0.1–1` | `:177`（posNum >0，缺省 0.9；语义为比例） | 部分（>0，未限上界） |
| `maxDowngradeCompactsPerTurn` | int | `0–10` | `:178`（缺省 1，无源侧校验） | **无** |
| `metricsWindowMs` | int | `1–86400000` | `:179`（posNum，缺省 600000） | 有 |
| `metricsLogIntervalMs` | int | `1–86400000` | `:180`（posNum，缺省 60000） | 有 |
| `clearCooldownOnUserSwitch` / `syncSelectionOnFailover` | bool | `true/false` | `:181-182` | 有 |

### **不开放**（面板不可写，渲染为只读展示或不展示）

| 字段 | 不开放理由 |
|---|---|
| `throttleProviders` / `logProviders` | 数组语义敏感（空数组 = 「全部」的取反义）；首批不开放，有真实需求再议 |
| `logPath` / `routing.hotConfigPath` / `routing.learnedPath` | **任意路径写风险**（插件会向这些路径 `appendFileSync`/`writeFileSync`） |
| `routing.staticGroups` | 复杂嵌套结构（组 × provider/model 组合），超白名单模型 |
| `routing.excludeProviders` | **被热 JSON 合并遮蔽**（`excludeSet()` = patch ∪ 热 JSON，`:425-429`）——写了会呈现「假生效」 |

> **search-router / web-search-local 的数值字段不在本批开放**：前者全部字段被热 JSON 遮蔽（§三），后者会被 settings section 遮蔽（§四）——写 patch = 假开关。

---

## 三、search-router `mode` —— 三选一呈报（推荐 **方案 2**）

**补扫事实**（`evidence/P23-SHADOW-SCAN.txt` T1）：`~/.dsh/dsh-search-router.json` **存在且现有 `mode` 键（值 `"auto"`）**，`resolveConfig` 每次调用热读 ⇒ 按判定侧定夺规则，**patch 编辑 mode 无效**。env `DSH_WEB_SEARCH_ROUTER_MODE` = undefined（不遮蔽）。

| 方案 | 内容 | 评估 |
|---|---|---|
| 1 不提供 | mode 无任何可写入口，卡片只读展示「生效值 + 来源」 | 最保守；用户失去在面板改 mode 的路径（尽管本来的正确路径是热 JSON） |
| **2 呈现遮蔽（推荐）** | 提供 mode 入口，但**卡片与确认页强制显示**「当前生效值 auto（来源：热 JSON，热改即生效）；本面板写入会被它盖住、重启也不生效」，并给出热 JSON 路径指引 | 用户知情、不产生假开关；不改红线语义；实现成本 = snapshot 现读 + 文案 |
| 3 申请写热 JSON | 面板直接写 `~/.dsh/dsh-search-router.json`（热改即生效） | 功能最真，但 **`~/.dsh` 写盘 = 红线**，需用户单独授权 + 新写通道（非 apply-engine 域）+ 新备份策略 ⇒ **建议列 P2.5 候选**，本轮不做 |

---

## 四、遮蔽呈现（双层）方案 + 授权口径

### 卡片层（snapshot 现读，服务端计算）

每卡层 2 状态行 = **「当前实际生效值 + 来源」**，来源判定在 `/snapshot` 服务端现读（不缓存）：

| 卡 | 生效值来源 | 现读方式 |
|---|---|---|
| rate-throttle | patch（激活快照；其热 JSON 只作用于 `declaredLimits/excludeProviders/aliases`，**均在白名单外** ⇒ 白名单字段无遮蔽） | 快照解析 patch 行 |
| search-router | **热 JSON > env > patch**（`resolveConfig :88-93` 逆向优先级） | snapshot 读 `~/.dsh/dsh-search-router.json`（1 次小文件读）+ `process.env`（同进程，无文件访问） |
| web-search-local | **settings section > patch** | **经平台 settings 服务 API 读**（同进程服务调用，**不读 settings.yaml 文件** ⇒ 无需文件授权）；服务不可达时显示「来源未知」，不降级读文件 |
| agent-memory / compact-router | 「无内部开关」 | — |

### 授权口径（新 **U13**，交用户定）

1. **追认**：`~/.dsh/dsh-rate-throttle.json` 在第 15 轮授权段外被**手工只读一次**（越界，如实申报；语义锚点 `rate-throttle/index.js:403-433`）——请求追认。
2. **纳入乙程序只读清单**（用途 = 层间覆盖检查 / 遮蔽呈现）：`~/.dsh/dsh-search-router.json` + `~/.dsh/dsh-rate-throttle.json`，**仅只读**。
3. `~/.dsh/settings.yaml` **不纳入**：web-search-local 生效值走 settings 服务 API；面板永不读该文件。
4. **写热 JSON（方案 3）若被采纳属 P2.5，另需写盘授权**——与本 U13 只读口径无关。

### 确认页人话（按插件分述生效时机，两套渲染器同步）

- **rate-throttle**：「改的是配置文件里的值，**重启 DSH 后生效**；当前没有别的配置来源会盖住它。」
- **search-router `mode`（方案 2）**：「当前实际生效值来自 `dsh-search-router.json`（**热改即生效**）；本面板写入的是配置文件，**会被它盖住、重启也不会生效**。」
- **web-search-local**：「当前生效值来自配置文件（设置面板尚未写入）；在 DSH 设置页修改会**立即生效且优先级更高**。」

---

## 五、安全链（全套沿用，无新增豁免）

服务端白名单校验（**不信任前端**，含类型 / 范围 / 枚举 / 拒绝含换行或 YAML 结构字符的值）· 写路由 `{change:true}` + 配对服务校验（禁 fallback）· **apply-engine 唯一通道**（plan → 过期 → 重读比 SHA → 锚点复验 → 备份 → 落盘 → 裁剪）· 写前备份（`.panel-backups/<语义名>-<stamp>/` + manifest，`reason`/`note` 传真值）· SHA/锚点断言升级（P2.3 断言进 `p23-verify`）· **U9 marker 刷新随本阶段首个写盘批次**。

---

## 六、测试计划

1. **白名单合法性**：每个开放字段合法值放行 + 越界值 / 错类型 / `!!js` 注入串 / 含换行或 YAML 结构字符 → 拒绝（4xx）。
2. **假写拒绝路径**：不在白名单的字段（`logPath`、`staticGroups`、`excludeProviders` 等）提交写 plan → 服务端拒绝；绕过 apply-engine 的写路径 → 唯一通道断言捕获。
3. **遮蔽场景断言**：热 JSON 含 `mode` ⇒ snapshot 显示遮蔽态 + 确认页遮蔽文案逐字一致；settings section 存在/不存在两态分支。
4. **双层口径断言**：5 卡层 2 标注逐字（rate-throttle 可写 / 3 卡「无内部开关」/ search-router 特殊文案）；「有键不读」渲染分支用构造用例验证。
5. **契约回归**：p1-smoke / p21 / p22 系列 / backup-write-test / doctor 0/0/0 全绿；`regression-all.mjs` 一键。

---

## 七、本稿配套证据与申报

- `evidence/P23-SHADOW-SCAN.txt`（2773 B，`scripts/p23-shadow-scan.mjs` 可重放）：T1 热 JSON 有 `mode` 键（auto）· T2 `settings.yaml` 无 `web-search-local` 节 · T3/T4 env 均空。
- **越界申报**：`~/.dsh/dsh-rate-throttle.json` 授权段外手工只读一次（只读、未改），已列 U13-1 追认。
- 本稿**零写盘**；批准后动代码（首个写盘批次含 U9 marker 刷新）。
