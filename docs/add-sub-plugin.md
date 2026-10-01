# 给 toolkit 加一个子插件（零面板代码改动）

> 建立：2026-09-20（P8，债务 #6）。目标：任何人做一个 DSH 插件，toolkit 的**唯一面板**就能
> 自适应地管理它——安装 / 启停 / 配置 / 重载 / 卸载 / 健康，全部零代码改动（DoD ③）。
> 反过来说：**如果你为了接入新插件改了面板代码，那就是 bug**（守卫：`scripts/p4-no-subplugin-import-check.mjs`）。
>
> **2026-09-22 条文审定轮的修订已落在本文**（★1–★20 逐条结论见 `docs/debt.md`「用户审定记录」）。
> 文中凡挂 `【批 N 落地，当前…】` 的句子，表示**已裁定改代码、实现尚未跟上**——在那之前请以小字为准，
> 不要按主句判断当前行为。

## 1. 最小可用形态（连 manifest 都不用写）

一个普通 DSH 插件（导出 `name` / `inject` / `apply`，或 default 对象）就能被装：
registry 的 legacy 适配器会合成 manifest（id 落 `legacy/<包名>`，无包名则用入口文件名），
面板卡片带 **legacy 徽标**并如实说明受限项（**无环境预检、无自定义健康检查**；
配置表单则取决于模块有没有导出 `Config` —— 见本节末尾，缺它才是"无配置表单"）。
`configSchema` 若以模块导出 `Config` 存在，legacy 包装也会拾取（`registry/src/loader.ts` 的
`synthLegacyManifest`——按函数名找，别按行号找，行号会漂）。

⇒ 双向兼容的下限：**装得进来、管得起来、限制说清楚**。

**⚠ 两条作者必须知道的规则（Pack H3 / 债务 D-12、D-15 实测得出）**：

1. **元数据要长在"被选中的那个对象"上**。同一个插件有两条装载通道，交给 cordis 的对象不同：
   宿主装载器（`cordis-plugin-loader@1.0.3`）是 `exports.default ?? exports` 的**纯替换**，
   而 toolkit registry 会把模块级 `name/inject/Config` **保守合并**到 default 上（更宽，兜第三方）。
   cordis 只读交给它的那个对象的 `plugin.name` / `plugin.inject` / `plugin.Config`。
   ⇒ 所以**写了 `export default` 就别再只把元数据放在模块级**：default 是对象就写
   `export default { name, inject, Config, apply }`；default 是类就写 `static name` / `static inject`；
   default 是函数则 cordis 读到的是 JS 推断名（不是你要的插件名）。两条通道逐字一致由
   `test/dual-channel-parity.test.mjs` 对本仓内置入口逐条钉住，可作为写法样板。
2. **带 npm scope 的包（`@scope/name`）不能走 legacy**：legacy 合成 id 的规则是"包名含 `/` 就原样
   沿用"，而契约要求 id 是 `<scope>/<name>` 小写字母数字连字符式——`@` 不合法，装载会以
   `plugin-shape-invalid` 拒绝（文案已点名成因）。⇒ 这类包**必须**写 `dsh.plugin.json`，
   且其中的 `contract` 字段必须是非空字符串（缺它同样落 legacy 而撞上第 1 条）。

## 2. 想要完整管理面：写 `dsh.plugin.json`

放在插件目录根（与 `package.json` 同级）。最小例（字段约束见 `docs/contract.md` §2）：

```json
{
  "manifestVersion": 1,
  "name": "@you/my-plugin",
  "id": "you/my-plugin",
  "displayName": "我的插件",
  "version": "1.0.0",
  "contract": "^1.0",
  "requires": {
    "node": ">=22",
    "dshRuntime": ">=0.1.2-rc.1 <0.2.0",
    "services": ["webServer"],
    "binaries": [{ "name": "git", "minVersion": "2.30.0" }],
    "envVars": [{ "key": "MY_TOKEN", "required": true, "describe": "只声明存在性，绝不打印值" }]
  },
  "configSchema": {
    "type": "object", "meta": {},
    "dict": {
      "enabled": { "type": "boolean", "meta": {} },
      "timeoutMs": { "type": "number", "meta": {} }
    }
  }
}
```

⚠️ **上面这份"最小例"只过本仓契约，不过独立 doctor CLI。** 独立 doctor 把 `manifestVersion` / `name` /
`requirements` 三项定为**必填**，且要求 `requirements` 必含 `runtime`/`binaries`/`packages`/`registers`/
`exports` 五键（缺一条即 `schema.required-missing` error）。本仓 7 份 manifest 全部两套字段都带，
正是因为要同时过两个校验器。分权口径见 `docs/contract.md` §4 与 §7 D-7、`docs/debt.md` C-1 现状注记。

要点：

1. **入口解析（四级顺位，2026-09-21 D-7 裁定「三级正典」后已实现；本节是解析行为的正本叙述）**，
   实现见 `registry/src/loader.ts` 的 `resolveEntry`：
   - **① `requirements.exports['.']` —— 正典位置。** doctor 独立仓把 `exports` 定为
     `requirements` 的必填键，并对**以 `./` 开头**的条目逐条断言目标文件真实存在（非 `./` 写法
     —— 如任意未声明入口名、绝对路径、`file://` —— doctor 直接放过，别把"逐条"读成"无例外"）；
     顶层 `exports` 反而不在 doctor 的清单根字段白名单（`MANIFEST_TOP_KEYS`）里，写上去当场产 error。
     **套件根的继承指针是强制而非可选**：套件根**必须**写 `{"$from":"package.json#exports"}` 且
     `requirements.exports` **只能有 `$from` 这一个键**；非套件根**禁止**用 `$from`（两种违反都产
     error）。本仓装载器对 `子插件写 $from` 不校验、照单全收 ⇒ 按本节写没问题，按"可选"理解会撞红。
   - **② 顶层 `exports['.']` —— legacy 兼容位。** 命中一定打 warn（经 registry 的 A1 warn 通道
     落日志，event=`entry-declaration`）；与正典并存时**正典赢**，warn 点名被忽略的那一份。
   - **③ `package.json` 的 `exports['.']`（字符串或 `{".":{default|node}}`）→ `main`；
     ④ `index`（`.js`/`.mjs`） 目录惯例** —— 第④级仅在当前三级**都没有声明**时才走到（宿主 Node 约定，T0/G1）。
   - **红线：显式声明（①②③）指向不存在的文件 ⇒ 直接 `entry-not-found` 并给拼好的绝对路径，
     绝不静默回退后面的顺位**（回退就是拿惯例掩盖 manifest 与实现不同步）。
     【批 6（★10）已落地】第③级同样算作者显式写的声明：`package.json` 的 `exports['.']`（裸字符串 /
     映射里的字符串 / 对象形态 `default`|`node`）或 `main` 声明了却指向不存在的文件 ⇒ 当场报错，
     **不再静默落到目录惯例**。三种情形仍视为"本级没声明"、继续走目录惯例：`exports` 表里没有 `.` 键；
     `.` 的对象形态既无 `default` 也无 `node`（例如只有 `types`）；`main` 是空串。
     收紧前已核存量：`package.json#exports` 12 条目与 7 份 manifest 的 `requirements.exports` 目标全部存在
     （recon §10.2），`main` 形态由批 6 补核（15 个在③级有声明的目录，缺失 0 个）。
   - **来源直接给 `.js`/`.mjs` 文件路径时完全绕过上面四级**（`entrySource='explicit-file'`、
     `entryWarnings` 恒空）⇒ 它会**静默忽略** manifest 里相反的 `.` 声明；`.cjs` 与无扩展名路径按目录处理。
   - 解析结果的可观测面：`ResolvedPlugin.entrySource`（七种来源值，见 `registry/src/types.ts`）
     与 `entryWarnings`。
   - ⚠️ **`.` 是"包主导出"，不必然是插件入口。** 本仓 `lib/agent-memory` 即此形态：
     `"." → lib/agent-memory/lib/index.js` 是指令台账数据库（非插件形状），插件在 `"./plugin" → plugin.js`
     （宿主 `cordis.patch.yml` 挂的也是 `dsh-toolkit/agent-memory/plugin`）。
     因此**按目录路径装它会得到 `plugin-shape-invalid`**，报错文案会点名同表可改装的文件；
     这不是缺陷（装载器不代为挑选），要装请按文件路径装。
   - monorepo 根没有入口时，预检报错会直接列出**可改装的插件子包候选**
     （T0 实测：装 monorepo 壳目录会失败，装 `packages/*` 才对）。**边界**：只扫 `packages/` 直下
     一层、最多列 8 个，且要求该子包自身有可解析入口 ⇒ `apps/*` 与 `packages/@scope/x` 不会被报出来。
   - **建议写法**：入口交给 `package.json` 的 `exports`/`main` 或目录下的 `index.js`，
     并让 `requirements.exports["."]` 与之一致——三处一致时上面任何一级都会解析到同一个文件。

2. **configSchema 落盘用纯定义 JSON、零默认值**（P5 起的仓内口径）。面板按它渲染表单，
   **实际支持的类型比原列的窄**（`panel/client/index.js` 的 `v2RenderField`）：`object` 真递归、
   `number`/`boolean`/`string` 直出对应控件、**`array` 只给"逗号分隔"文本框**（数组元素是对象时
   填不出来，读出来还会变成 `[object Object]`）、**`union` 只在枚举项带 `value` 时可用的下拉**
   （schemastery 的 union 列表项通常没有 `value` ⇒ 选项会显示 `undefined`）、其余类型落文本框；
   **根节点必须是 `type:'object'`** 才出表单，否则整块提示"插件未声明 configSchema"（该文案在此情形下不实）。
   【★17 评估中，见 `docs/contract-v1.1-recon.md` §10 的评估结论；array-of-object 与 union 的真渲染
   当前**无任何测试覆盖**，且后备页 `panel/client/panel.html` 根本不渲染配置表单 ⇒ 不是双份实现】
   保存走 `registry.setConfig`，写回前服务端真校验（必填缺失阻断）。
   【批 5 落地，当前有一格静默放行】构建/重建 Schema 失败时校验降级为 `via:'skipped'` 却仍返回
   `ok:true`，而调用方只看 `ok` ⇒ schemastery 不可用时任意配置都能写回；已裁定把降级状态如实透出。
   **【2026-09-25 批 5-1 已收这一格】** 降级现返回 `ok:false + verified:false`，`setConfig` 据此**拒写**并
   报 `config-schema-unverified`（文案点名"未能执行真校验"，与"配置真不合法"的 `value-invalid` 分开）；
   体检预检同理由只看 `ok` 改为看 `ok + verified`，降级另开 `config-schema-unverified` 阻断项。
   ⇒ 现在"面板写回成功"这句话成立的前提是**校验真的跑过**；判据与反向钉见
   `test/config-schema-degradation.test.mjs`（含"合法 schema 写回照常通过"一条）。
   zod 实例（函数型 `Config` 无 `toJSON`）当前**拿不到表单**（面板提示"未声明 configSchema"），
   但服务端仍能校验它 —— 这条降级路径此前无人记载。
3. **函数型成员走模块导出**：`Config`（schemastery/zod 实例）当前生效；`healthCheck(c: HealthCheckCtx)`
   （入参是 `{config, ctx}` 对象，**不是** cordis 的 ctx —— 原文写成 `healthCheck(ctx)` 已订正）与
   `panels` **在当前装载链上不会被消费**：装载器绑定模块静态面时只认
   `name/inject/Config/configSchema/provide/intercept` 六键，而体检与快照读的是 `manifest.healthCheck`
   ⇒ 写了不跑。【批 3 落地，当前未实现】JSON 里出现 `healthCheck` 直接判 error（这条是已实现的）。
4. **`requires` 越诚实，预检越有用**：本仓进程内体检会按它合成 8 条规则（运行时版本 / 依赖服务在场 /
   子插件 / envVar 存在性 / 二进制版本真探测 / 端口 / 文件路径 / 外部 API 可达）。
   **严重级按"必需/可选"分级，不是一律警告**：必需项缺席 = **error 且阻断安装**（版本不符、依赖服务缺席、
   必需 envVar 缺失、二进制不在 PATH、低于 `minVersion`、非 shared 端口占用、路径不可访问）；
   仅"探测不到版本 / 可选缺席 / shared 端口占用 / 网络瞬断"为 warn。
   （★4 定稿：原文"缺席类只产 warn/info，不产 error"是**把另一套 doctor 的纪律串到了这里**——
   独立 doctor CLI 的仓级审计才承诺一律不产 error，因为它的验收红线是真实仓 `0/0/0`。
   两仓分工详见 `docs/contract.md` §6 与 §7 D-7。）
   ⚠️ 另两条与直觉相反的实况：① `requires.services` **不桥接** cordis 的 `inject`，只写它不设门
   （依赖缺席也照样 ACTIVE，正典解锁路径是重试退避）；② 该字段当前还被**当作提供面**参与撞名比对，
   ⇒ 两个只是共同依赖同一服务的插件，第二个会被 `reg.name-collision` 拒装【批 2 随 `provides` 纠正】。

## 3. 装进来之后你会看到什么（自适应，零代码改动）

面板「插件管理（registry · 自适应）」区：卡片自动出现（SSE `registry:plugin-added`，**不用刷新**），
带状态徽标、契约版本、legacy 标注，五个操作齐备：停用 / 重载 / 卸载 / 健康详情 / 配置。
**所有写路由都要逐字 confirm**（`confirm-missing` 一律 400）：uninstall/enabled/reload/config 逐字
confirm **插件 id**，启停/卸载另有知情确认勾选；**安装（`install/confirm`）自批 8（★19）起逐字 confirm
安装源**——local 逐字等于向导第一步输入的目录绝对路径、npm 逐字等于 spec（装前无插件 id 可用，
以双方请求前都已知的源标识为逐字对象），缺失/不符一律 400；面板"确认安装"按钮须逐字重输该路径后才可点。
状态徽标的语义（★11 · **批 5-2 起是"实况"而不是"装入那一次的结论"**）：registry 内有一条
fiber 实况对齐器（`registry/src/registry.ts#alignOnce`，缺省每 5s 一轮）读 `entry.fiber.state`
并把 `status` 回写成当前实况 ⇒ 依赖中途离场时卡片不再停在 `active`，而是随 cordis 撤下 fiber
变 `loading`（事件 `reason: 'align-gated'`）；依赖回来 cordis 自己放回 fiber，一轮内回 `active`
（`reason: 'align-recovered'`）。三条边界，如实：
① **最坏延迟 ≈ 两个周期**（缺省 5000ms × 去抖 2 次 = 10s）：降级方向要**连续**两次观察到"非
ACTIVE"才动手（防 cordis 在依赖翻转瞬间的抖动变成事件风暴），恢复方向不去抖。周期与次数是
**代码级注入点** `statusAlignIntervalMs` / `statusAlignConfirmCount`（`<=0` 即整机关闭、回到旧口径
且不留定时器），**不进面板那 18 个配置键** —— 没接线的东西就不声明，免得再造一格"填了等于没填"。
② **对齐器只答"在不在跑"，不答"为什么"**：降级方向不写 `lastError`；成因面（依赖服务缺席等）
仍归进程内体检的下一轮巡检（`service-missing` 等 error）。同一张卡片上状态徽标 = registry 实况、
健康行 = doctor 判语，面板没有第三个真相源。连带一条如实申报：doctor 的 `requires/subPlugins`
规则按 `entry.status === 'active'` 判依赖在场，故某条被降成 `loading` 后，依赖它的插件会多出
一条 `subplugin-missing` warn —— 那是"更真"，不是回归。
③ **只覆盖经 registry 装载的条目**：五个内置插件由宿主 patch 通道挂载、不进 registry（横切 H3 与
断点普查 P-1 那条"内置卡面另算"同族），它们卡片上的状态是 `panel/client/index.js#stateOf`
那套算法（批 5-3 在治其中两处失真）。
另有三条"不越权"边界：装载在飞的条目（`loadEntry` 自己的 `loading`）对齐器不插手；
`quarantined` / `error` / `disabled` 条目本就无 fiber，对齐器**只读不装**（不新建 fiber、不 reload、
不调度重试）⇒ REQ-6"隔离后不自动重试"原样成立；契约类型 `PluginStatus` 六值一字未动、
事件复用既有 `registry:status-changed` ⇒ 面板与 SSE 零改动。
**启停位置**：启动口是 `registry.startStatusAlign()`，由**唯一装配现场**（`panel/manager/registry-host.mjs`）
在宿主真有事件面时调用 —— 与 doctor 的周期巡检同一条规则（最小宿主/mock ctx 无 `ctx.on` 时不起，
免得给离线路径留下永不退场的常驻定时器）；只要启过来，`registry.stop()` 就无条件清它。
钉子：`test/registry-status-align.test.mjs`（12 条）+ `test/cordis-inject-lifecycle.test.mjs`
（撤依赖 / 回恢复两条自本笔**翻面** —— 那里原文钉的正是"registry 却仍报 active"这个假象）。
"是否真的落盘"面板也会说：写不进磁盘时条目带 `persisted:false`、卡片如实标注"未落盘（重启会丢）"。

## 4. 注册冲突检查（"提供面"目前怎么写）

⚠️ **契约目前没有"提供面"字段**（`DshSubPluginManifest` 只有 `requires.services` = 依赖的服务）。
`reg.name-collision`（本仓进程内规则，`doctor/src/doctor.ts`）要比对"插件声明会注册的服务/命令/提供者"，
当前的取数口径是：**services 优先取 `requires.services`（★ 语义错位：那是依赖面，被当提供面用）、
缺席时退回旧字段**；commands / providers **只**取旧 `requirements.registers.{commands,providers}`
（提取处：`registry/src/loader.ts` 的 `extractRegisters`，按函数名找）。
⇒ 现状可用做法（**批 2 引入 `provides` 后即被取代**）：想让冲突检查覆盖到你的服务/命令/提供者，
就在 manifest 里带上 `requirements.registers.{services,commands,providers}` 这段旧字段（迁移期 info 级容忍）。
**别指望 `requires.services` 是声明提供面** —— 它现在会被拿去比对，两个都声明依赖同一名服务的插件
会被判撞名（假阳性，已实测复现）；`provides` 落地后该字段退回纯依赖面。
独立 doctor CLI 侧的同名检查（`reg.name-collision`，读 `requirements.registers`）与本仓规则是两套实现、
两个数据源，别当同一条闸。缺口立项见 `docs/debt.md` C-1 第 1 项。

## 5. 红线（`AGENTS.md` 六条中与"加新插件"直接相关的五条，编号对齐 AGENTS）

1. （AGENTS 1）禁止模块加载期静态 import 兄弟插件代码——兄弟能力只用运行时惰性探测（try-catch + 动态 import）
   或 `optionalDeps` 声明。
2. （AGENTS 2）禁止跨插件边界的 eager re-export（`export ... from` 会重建整条依赖链）。
3. （AGENTS 3）跨插件测试：存在性门控 + 动态 import，兄弟缺席必须 skip 不得红。
5. （AGENTS 5）声明了 `optionalDeps` 就必须真能降级（manifest 与实现同步）。
   **当前状态如实**：`optionalDeps` 不是契约字段（只在校验器的"已知旧字段"清单里）、运行时无人读取、
   全仓只有 `lib/compact-router` 用了一处 ⇒ 这条红线**目前无机械判据**，靠人工评审。
4. （AGENTS 4）doctor 仓库：新检查知识写进声明文件，engine 零硬编码插件名。
   （原文把它写成"面板/引擎零插件名硬编码"，与 AGENTS 第 4 条不是一条，已按编号拆开。）

**"改了面板代码就是 bug"这条纪律的守卫覆盖面**（★13，别把它读成通用守卫）：
`scripts/p4-no-subplugin-import-check.mjs`（**批 7 / ★13 已泛化 + 扩面**）。三条判据：

1. `name`——子插件名字面引用。**名字集从仓内派生**（`lib/` 下每个子目录名 ∪ 套件 manifest
   `aliases` 各值末段），不再手写"5 个内置名" ⇒ 加第 6 个内置插件，判据自己长出来。
2. `identity`——插件身份形状：任何 `"@scope/name"` 字面量，只要该名字**不是 `package.json` 里
   声明过的依赖/开发依赖**，就按插件身份算 ⇒ **为第三方插件改面板代码，现在会被抓到**；
   真框架依赖（`@deepseek-ai/*` 那族）不误报。
3. `module`——`lib/` 模块引用（`from` / `import()` / `require` 三形态，P4 原始那条一字未改）。

扫描面同样改为**动态**：根 `index.js` + `panel/index.js` + `panel/manager/` 下**全部** `.mjs`
（当前 13 个，新增文件自动进面）+ 客户端两文件（`panel/client/index.js`、`panel/client/panel.html`
〔仅模块导入形态——UI 文案常量按设计点名五个目录名，属呈现资产不属数据面；本批起 `panel.html`
也进面，此前它不在任何守卫里〕）。注释行不参与判据：这条纪律管"面板代码依赖具体插件"，
散文里提一个名字不是依赖。

**有意保留的点名豁免（登记在守卫里的 `NAME_EXEMPTIONS`，每条带依据）**：
`plugin-registry.mjs`（P2.4 插件表 + `DEPENDENCIES`）、`snapshot.mjs`（`ORIGINS`/`ROW_IDS` +
P2.3 `buildConfigPanel` 按插件分支）、`config-whitelist.mjs`（P2.3 唯一可写行与 18 键白名单）、
`uninstall.mjs`（compact-router 预设托管通路）——依据同前：`docs/migration.md` §4 前置 2 明文要求
原样保留。**豁免只免"点名"，从免不掉 `lib/` import**：这四个文件里出现兄弟插件模块引用照样翻红。
死条目（挂着豁免却没有真实命中）由 `test/p4-panel-guard.test.mjs` 判红，防豁免腐烂。

两条如实的限制（不夸成"全面守卫"）：① 豁免是**文件级**，所以这四个文件里"新增的点名"不受检——
要收到行级得先给每处点名加锚，另批处理；② `identity` 只认 `@scope/name` 形状，一个**不带 scope 的
第三方插件名**（裸词）与英文散文无法机械区分，抓不到 ⇒ 本守卫不承诺覆盖那一形。
`scripts/pluggable-lint.mjs` 的职责是另一面：它只管 `lib/` 与 `test/` 里的**兄弟插件静态 import /
eager re-export**，不碰面板（旧文本把面板纪律记到它头上属张冠李戴，已按面指对）。

## 6. 自测清单（提交前）

```bash
npm test                                   # build×3 + pluggable-lint + no-subplugin-import-check + typecheck×3 + node --test
node scripts/regression-all.mjs            # 回归全跑 14 项
node /d/dsh-test-sandbox/projects/doctor/src/cli.mjs --scope D:/dsh-plugins/dsh-toolkit   # 真实仓 dry-run 必须 0/0/0
node scripts/ci-local.mjs --with-scan      # 单命令全链（--with-scan 共 6 步：npm test＋回归 14 项＋真实仓 dry-run＋DOCTOR_CLI↔契约对账＋patch 行配置校验＋文档引用守卫；默认链 5 步＝去掉守卫步）
```
**单命令全链其实是最后那条**（`regression-all` 自 D-3 修法起**已含** `p23-verify`，但**不含** `patch-config-check`；
`p23-shadow-scan` 根本不在这条链上，且它会覆写历史证据正本，别随手跑）。
独立 doctor 的扫描面**整体排除 `test/` 目录**（防测试夹具污染真实仓闸），`lib/` 直下名为 `test` 的
目录是例外（那是在案本体位）——你在自己仓里放无效 manifest 夹具会撞红，这条豁免只在仓根一层生效。

再加一次真面板走查（面板 → 安装向导填**绝对路径** → ① 预检 → 确认安装 → 卡片免刷新出现 →
配置保存 → 停用/启用 → 健康详情）。CLI 也可验，但**必须用 loopback IP 作 Host**：
`curl -s http://127.0.0.1:3080/api/toolkit-panel/v2/snapshot`
（★5 定稿：原文的 `localhost:3080` **按字面执行会被拒** —— 面板只把 socket 对端与 Host 认
`127.0.0.1`/`::1` 为本机，`localhost` 按非本机处理 ⇒ 落到配对校验、匿名 403；历史上从未支持过
`localhost`。经宿主 `remote-web-ui` 隧道访问时还要配对凭据。）

## 7. 装不上时看什么

预检失败会返回 `blocking[]`，每条带 `fix.summary`（`fix.steps` **视错误类别可缺席**——
5 类来源码齐备，manifest 字段派生的阻断项目前只有 summary）：
- `path-not-found` ⇒ 提示"请填绝对路径 + 示例形态 + 相对路径按服务进程工作目录解析"；
  面板前端现在会在**提交前**就拦下相对路径（`need-absolute-path`），不让你看到拼错路径的报错。
- `entry-not-found` ⇒ 写清已读取到什么、缺哪个字段、monorepo 子包候选、补什么（带 JSON 片段示例）。
- `module-load-failed` / `plugin-shape-invalid` ⇒ 给模块路径与原因；shape 类会说明接受哪些导出形态
  （按目录装"`.` 声明的是数据库"那类包时，文案还会点名同表里可改装的插件子路径）。
- `source-not-supported` ⇒ npm 来源未实现（Q1），给"仅本地路径"的如实说明。

**上面四类只是"来源侧"的码**（到 `install()` 边界统一带 `source/` 前缀）。装不进、或装进了但不对劲，
还要看这些（★20 定稿：补齐清单）：
- `id-conflict` —— 同 id 已被占用（先卸旧插件或改 id）；
- `service-missing` —— `requires.services` 里声明的宿主服务当前不在（预检阻断；本仓真实服务名探测已
  修过原型链误判，`toString`/`constructor` 这类名字的服务名不会假装在场）；
- `reg.name-collision` —— 注册面撞名（见 §4 的现状与坑）；
- `config-schema-invalid` —— 当前配置值不过 `configSchema`（必填缺失会阻断）；
- `value-invalid` —— 写回配置时值不过校验 / 不是合法布尔字面量；
- `fiber-failed` / `fiber-disposed` / `fiber-unloading-timeout` / `fiber-load-timeout` —— 等待期
  错误码（`fiber-load-timeout` 的典型成因就是 `inject` 的服务始终缺席）；
- `quarantined` —— 连续失败达 `retryLimit` 后进隔离，不自动重试；恢复动作是**手动启用或 reload**
  （两者都会把重试计数归零），面板与 `/v2/snapshot` 会带最近错误原文；
- `plugin-added`/`status-changed` 等 SSE 事件名用的是**短名**（全名的前缀在 `hello` 帧里给），
  非缺省 `servicePrefix` 时全名是 `${prefix}/registry:...`，排查时别按缺省前缀拼名字。
