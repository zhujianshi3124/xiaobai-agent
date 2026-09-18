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

> **📌 第 19 轮批准要求 ②（已落实）**：其余 **13 个有源码校验字段**的面板合法域 = **源码校验域对齐，不得放宽** —— 上表各字段合法域均 **⊆** 源码校验域（`posNum >0` / `!== false` / `>=0`），属**收窄**非放宽；唯一无源码校验的 5 处（§九）合法域为独立依据。实现落点：`panel/manager/config-whitelist.mjs`（服务端唯一权威，字段元数据内含 src/use 行号）。

### 顶层（`config:` 直下）

| 字段 | 类型 | 合法域（面板服务端校验） | 源码依据 | 源侧自身校验（设计注记） |
|---|---|---|---|---|
| `enabled` | bool | `true / false` | `:157`（`!== false`，缺省 true） | 有（非 false 即真） |
| `minIntervalMs` | int | `0–3600000` | `:159`（缺省 20000） | **无**（`Number()` 直转，NaN 可进运行时 ⇒ 面板范围校验是唯一安全网） |
| `maxRequestsPerMinute` | int | `1–600` | `:160`（缺省 3） | **无** |
| `adaptive` | bool | `true / false` | `:161` | 有 |
| `maxIntervalMs` | int | `1–86400000`，**且 ≥ `minIntervalMs`（服务端跨字段校验）** | `:162`（缺省 120000） | **无**（依据见 §九） |
| `backoffFactor` | number | `1–10` | `:163`（缺省 2）、`:234` / `:280`（作乘数） | **无**（依据见 §九） |

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

## 三、search-router `mode` —— 三选一呈报（**第 19 轮批准 = 方案 1**）

> **📌 第 19 轮裁定**：判定侧批准设计稿时明确 **mode 按** ***第 15 轮方案 1（不提供）*** **执行** —— 本侧推荐的方案 2（呈现遮蔽）不采纳。落地口径：**mode 无任何面板可写入口**；卡片**只读展示**「生效值 + 来源」（§四快照现读），指引文字指向 `~/.dsh/dsh-search-router.json`。方案 3（写热 JSON）仍列 P2.5 候选、需单独授权。§五测试计划相应**不含 mode 写入用例**（无入口即无写路径）。

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
- **search-router `mode`（第 19 轮裁定 = 方案 1，无面板入口）**：卡片只读展示「生效值 + 来源」（snapshot 现读）；**无写入路径，故无确认页**。指引：「需调整请编辑 `~/.dsh/dsh-search-router.json`（热改即生效）」。
- **web-search-local**：「当前生效值来自配置文件（设置面板尚未写入）；在 DSH 设置页修改会**立即生效且优先级更高**。」

---

## 五、安全链（全套沿用，无新增豁免）

服务端白名单校验（**不信任前端**，含类型 / 范围 / 枚举 / 拒绝含换行或 YAML 结构字符的值）· 写路由 `{change:true}` + 配对服务校验（禁 fallback）· **apply-engine 唯一通道**（plan → 过期 → 重读比 SHA → 锚点复验 → 备份 → 落盘 → 裁剪）· 写前备份（`.panel-backups/<语义名>-<stamp>/` + manifest，`reason`/`note` 传真值）· SHA/锚点断言升级（P2.3 断言进 `p23-verify`）· **U9 marker 刷新随本阶段首个写盘批次**。

---

## 六、测试计划

1. **白名单合法性**：每个开放字段合法值放行 + 越界值 / 错类型 / `!!js` 注入串 / 含换行或 YAML 结构字符 → 拒绝（4xx）。
2. **假写拒绝路径**：不在白名单的字段（`logPath`、`staticGroups`、`excludeProviders` 等）提交写 plan → 服务端拒绝；绕过 apply-engine 的写路径 → 唯一通道断言捕获。
3. **遮蔽场景断言**：热 JSON 含 `mode` ⇒ snapshot 显示「生效值 + 来源 = 热 JSON」；env 覆盖分支、patch 回退分支（三分支齐全）；settings section 存在/不存在两态分支。
4. **双层口径断言**：5 卡层 2 标注逐字（rate-throttle 可写 / 3 卡「无内部开关」/ search-router 特殊文案）；「有键不读」渲染分支用构造用例验证。
5. **契约回归**：p1-smoke / p21 / p22 系列 / backup-write-test / doctor 0/0/0 全绿；`regression-all.mjs` 一键。

---

## 七、本稿配套证据与申报

- `evidence/P23-SHADOW-SCAN.txt`（2773 B，`scripts/p23-shadow-scan.mjs` 可重放）：T1 热 JSON 有 `mode` 键（auto）· T2 `settings.yaml` 无 `web-search-local` 节 · T3/T4 env 均空。
- **越界申报**：`~/.dsh/dsh-rate-throttle.json` 授权段外手工只读一次（只读、未改），已列 U13-1 追认。
- 本稿**零写盘**；批准后动代码（首个写盘批次含 U9 marker 刷新）。

---

## 八、字段 × 通道对照表（第 16 轮钉子 ① · 18 字段全量）

**通道图例**：
- **A = 激活快照**：`cfg` 对象 `:156-190`，插件激活时构建一次、此后只读快照；
- **B = 热 JSON**：`~/.dsh/dsh-rate-throttle.json`，`hotConfig()` `:403-414`（mtime 缓存，每次使用重读）；
- **C = settings API**；**D = env**（进程环境）。

| # | 字段 | A 激活快照 | B 热 JSON | C settings | D env | 消费点（生效路径） |
|---|---|---|---|---|---|---|
| 1 | `enabled` | ✓ `:157` | — | — | — | 主闸 `:224` |
| 2 | `minIntervalMs` | ✓ `:159` | — | — | — | `:220`（初值）· `:234`（恢复下限）· `:280`（退避下限） |
| 3 | `maxRequestsPerMinute` | ✓ `:160` | — | — | — | `:240`（RPM 窗口判定） |
| 4 | `adaptive` | ✓ `:161` | — | — | — | `:273`（退避总闸） |
| 5 | `maxIntervalMs` | ✓ `:162` | — | — | — | `:279`（退避上限） |
| 6 | `backoffFactor` | ✓ `:163` | — | — | — | `:234`（恢复缩减）· `:280`（退避放大） |
| 7 | `routing.enabled` | ✓ `:167` | — | — | — | `:656` · `:781`（路由短路） |
| 8 | `routing.autoGroups` | ✓ `:168` | — | — | — | `:524` · `:583` |
| 9 | `routing.autoGroupTtlMs` | ✓ `:169` | — | — | — | `:587` |
| 10 | `routing.cooldownMs` | ✓ `:174` | — | — | — | `:606`（RPM 冷却恢复） |
| 11 | `routing.tpmTurnSkip` | ✓ `:175` | — | — | — | `:621` · `:656` |
| 12 | `routing.tpmCooldownMs` | ✓ `:152-158` | — | — | — | **`:1003-1019`**（TPM 短除名写入与恢复时长；第 19 轮批准要求 ③ 补齐。判定侧批文写作「#12（tpmTurnSkip）」，本表 #11 `tpmTurnSkip` 消费点原已具行号 `:621/:656`，缺行号的是本行 #12 `tpmCooldownMs` —— 两处均已齐） |
| 13 | `routing.downgradeContextMargin` | ✓ `:177` | — | — | — | `:839`（降级阈值） |
| 14 | `routing.maxDowngradeCompactsPerTurn` | ✓ `:178` | — | — | — | `:855` |
| 15 | `routing.metricsWindowMs` | ✓ `:179` | — | — | — | `:327` · `:355` · `:373` |
| 16 | `routing.metricsLogIntervalMs` | ✓ `:180` | — | — | — | `:368` |
| 17 | `routing.clearCooldownOnUserSwitch` | ✓ `:181` | — | — | — | `:1047` |
| 18 | `routing.syncSelectionOnFailover` | ✓ `:182` | — | — | — | `:948` |

> **计数口径订正**：设计稿 §二 原表 17 行（`clearCooldownOnUserSwitch` 与 `syncSelectionOnFailover` 合并一行）⇒ 拆开后实为 **18 字段**。本表为全量口径，白名单实现按 18 字段。

### 热通道三键与白名单的关系（钉死 —— 防最后一道假开关的验收点）

| 热键 | 消费点 | 与白名单字段的关系 |
|---|---|---|
| `declaredLimits` | `limitData()` `:478-489`（quality 2）→ **仅用于候选排序**（declared > learned > none） | **不参与、不聚合、不覆盖** `minIntervalMs` / `maxRequestsPerMinute` / `maxIntervalMs` / `backoffFactor` 的生效值 —— interval 计算只读 `cfg` 快照（`:220/:234/:279-280`）。两套数值是**不同维度**：declared/learned = 厂商公开限速（**选谁**），cfg = 本插件节流参数（**怎么等**） |
| `excludeProviders` | `excludeSet()` `:424-429` = **patch ∪ 热 JSON** | **唯一热合并字段**，遮蔽 patch 值 ⇒ **不在白名单**（本就不开放，§二） |
| `aliases` | `aliasOf()` `:431-435`（模型 id 归族） | 与白名单无交集 |

- **C 通道**：全 lib `installSection` 仅 **web-search-local** 一处 ⇒ rate-throttle **无 settings 面**。
- **D 通道**：rate-throttle 的 env 仅 `DSH_HOME`（`:70`，默认路径定位，**非配置覆盖**）；`DSH_WEB_SEARCH_ROUTER_MODE` 只作用于 search-router `mode`（不在本白名单）。

**结论：18/18 字段生效值 = patch 值（激活快照），唯一生效方式 = 重启 dsh web；无任何通道聚合或盖住白名单字段 ⇒ 无假开关残留。**

---

## 九、无源码校验字段的合法域依据（第 16 轮钉子 ② · 4 顶层 + 1 routing = 5 处）

| 字段 | 面板合法域 | 范围选择理由（保守 + 覆盖实际用例） |
|---|---|---|
| `minIntervalMs` | int `0–3600000` | 下限 **0 = 合法关闭语义**（只留 RPM 节流，不留最小间隔）；上限 1h 已对最保守免费档冗余（`declaredLimits` 实测最高 60 RPM ⇒ 间隔为秒级）；**实际用例**：patch 在用值 `3000`、源缺省 `20000` 均在域内 |
| `maxRequestsPerMinute` | int `1–600` | 下限 **1 而非 0**：0 语义歧义（想关节流应走 `enabled:false`，避免双键打架、UI 出现「开着却不动」）；上限 600 = 10 QPS，为 declaredLimits 实测最高档（60 RPM）的 **10 倍冗余** |
| `maxIntervalMs` | int `1–86400000` **且 ≥ `minIntervalMs`（跨字段）** | 下限 1：**0 会让 `Math.min(:279)` 把退避间隔压成 0 ⇒ 变相关闭退避**（反语义 footgun）；跨字段约束保证 `max ≥ min`（否则退避区间倒挂）；上限 24h 为保守天花板 |
| `backoffFactor` | number `1–10` | 下限 **1 而非 >0**：`<1` 时 `:280` 退避「越退越短」、`:234` 恢复反向放大，均反语义；`1` = 不放大（合法，仅线性 RPM 节流）；上限 10 防单次 429 后间隔爆表；源缺省 `2` 在域内；**`0` 另有除零风险（`:234`）** |
| `routing.maxDowngradeCompactsPerTurn` | int `0–10` | 下限 **0 = 合法关闭语义**（禁止降级压缩，对齐 `tpmCooldownMs=0` 先例）；上限 10 防单 turn 压缩风暴；源缺省 `1` 在域内；消费点 `:855` |

- 跨字段校验（`maxIntervalMs ≥ minIntervalMs`）为服务端 plan 校验**新增项**，进测试计划 §六-1。
- 插件自身的容错层（`posNum` / `!== false` / `Number()`）继续作为第二道防线；面板白名单是**第一道**（写前拒绝），两层独立。

---

## 十、第 18 轮重发对账（四点，判定侧要求逐点落档）

**a) 字段总数 17 vs 18 —— 差异是「行」，不是「字段」**。设计稿 §二原表 **17 行**，因 `clearCooldownOnUserSwitch` 与 `syncSelectionOnFailover` 被合并在同一行呈现；白名单实际字段数 = **18**（顶层 6 + routing 12）。**判定侧「顶层 6 + routing 11」与本方「18」的差 = 这对合并行拆开**，无任何新增字段；本表（§八）为拆开后的全量口径。

**b) 无源码校验字段 4 vs 5 —— 差异是 `routing.maxDowngradeCompactsPerTurn`**。判定侧第 15 轮「4 个」= **顶层 4 个**（`minIntervalMs` / `maxRequestsPerMinute` / `maxIntervalMs` / `backoffFactor`）；第 5 处 = routing 块内 `:178`（`Number(routingCfg.maxDowngradeCompactsPerTurn ?? 1)`，无任何范围校验）。两口径**兼容**：4（顶层）+ 1（routing）= 5 处，§九全量覆盖。

**c) `declaredLimits` 不构成遮蔽 —— 源码依据（逐行，含反证）**：

1. **白名单字段唯一来源 = 激活快照**：`cfg` 在 `:156-190` 一次性构建，全部白名单字段只从 `config`（patch）读这一次（顶层 `:157-163`、routing `:167-182`），此后只读。
2. **热 JSON 的调用点全量仅 3 处**（`grep -n "hotConfig()"` 全文件）：`:418`（取 `declaredLimits`）、`:425`（取 `excludeProviders`）、`:431`（取 `aliases`）——**不存在第 4 个热读取入口**。
3. **`declaredLimits` 的唯一消费链**：`limitData()` `:479-489`（产出 `{tpm, rpm, quality, source}`，quality 2/1/0 = declared/learned/none）→ **唯一调用点 `rankEligible()` `:698-699`** → 仅作**排序比较器**输入（`:693` 注释自陈 *"ranking: declared > learned > none"*；`:708` stable sort）。`limitData` 的返回值**不写入任何 `cfg` 字段、任何 state 数值**——它只决定候选顺序（**选谁**），不决定节流参数（**怎么等**）。
4. **白名单数值字段的消费点全部独立于热通道**：`minIntervalMs` → `:220/:234/:280`；`maxRequestsPerMinute` → `:240`；`maxIntervalMs` → `:279`；`backoffFactor` → `:234/:280`。这些行**没有一行引用 `hotConfig()`/`limitData()`**。
5. **反证（结构性）**：全文件 `grep "Object.assign"` **0 命中**、展开语法 `...hot` **0 命中**、`hotCache.data` 仅 `:411` 一处（函数内返回值）；⇒ **不存在「热数据 → `cfg`」的合并或改写代码路径**，热通道在结构上不可能触及白名单字段的生效值。
6. **唯一热合并字段** = `excludeProviders`（`excludeSet()` `:424-429`，patch ∪ 热 JSON 的并集）——**不在白名单**（§二明列不开放），故白名单 18 字段无一被聚合/改写。

**d) 跨字段校验实现位置 —— 服务端白名单校验器（预认可已收，正式入档）**：`maxIntervalMs ≥ minIntervalMs` 在 **P2.3 施工时实现于 panel 服务端 plan 校验层**（与类型/范围/枚举校验同层，**不信任前端**），写 plan 前拒绝倒置值（409/400）；测试计划 §六-1 覆盖正/反两用例。
