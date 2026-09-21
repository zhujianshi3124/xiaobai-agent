# 给 toolkit 加一个子插件（零面板代码改动）

> 建立：2026-09-20（P8，债务 #6）。目标：任何人做一个 DSH 插件，toolkit 的**唯一面板**就能
> 自适应地管理它——安装 / 启停 / 配置 / 重载 / 卸载 / 健康，全部零代码改动（DoD ③）。
> 反过来说：**如果你为了接入新插件改了面板代码，那就是 bug**（守卫：`scripts/p4-no-subplugin-import-check.mjs`）。

## 1. 最小可用形态（连 manifest 都不用写）

一个普通 DSH 插件（导出 `name` / `inject` / `apply`，或 default 对象）就能被装：
registry 的 legacy 适配器会合成 manifest（id 落 `legacy/<包名>`，无包名则用入口文件名），
面板卡片带 **legacy 徽标**并如实说明受限项（无环境预检、无自定义健康检查、无配置表单）。
`configSchema` 若以模块导出 `Config` 存在，legacy 包装也会拾取（`registry/src/loader.ts:187`）。

⇒ 双向兼容的下限：**装得进来、管得起来、限制说清楚**。

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

要点：

1. **入口解析（三级正典顺序，2026-09-21 D-7 裁定后已实现；本节是单一事实源）**，
   实现见 `registry/src/loader.ts` 的 `resolveEntry`：
   - **① `requirements.exports['.']` —— 正典位置。** doctor 独立仓把 `exports` 定为
     `requirements` 的必填键，并逐条断言其目标文件真实存在；顶层 `exports` 反而不在 doctor 的
     清单根字段白名单（`MANIFEST_TOP_KEYS`）里，写上去当场产 error。
     套件根可写继承指针 `{"$from":"package.json#exports"}`，此时正典表就是 `package.json#exports`。
   - **② 顶层 `exports['.']` —— legacy 兼容位。** 命中一定打 warn（经 registry 的 A1 warn 通道
     落日志，event=`entry-declaration`）；与正典并存时**正典赢**，warn 点名被忽略的那一份。
   - **③ `package.json` 的 `exports['.']`（字符串或 `{".":{default|node}}`）→ `main`；
     ④ `index.js`/`index.mjs` 目录惯例** —— 仅当前两级都没有声明时才走到这里（宿主 Node 约定，T0/G1）。
   - **红线：显式声明（①②）指向不存在的文件 ⇒ 直接 `entry-not-found` 并给拼好的绝对路径，
     绝不静默回退后面的顺位**（回退就是拿惯例掩盖 manifest 与实现不同步）。
   - 解析结果的可观测面：`ResolvedPlugin.entrySource`（七种来源值，见 `registry/src/types.ts`）
     与 `entryWarnings`。
   - ⚠️ **`.` 是"包主导出"，不必然是插件入口。** 本仓 `lib/agent-memory` 即此形态：
     `"." → ./lib/index.js` 是指令台账数据库（非插件形状），插件在 `"./plugin" → plugin.js`
     （宿主 `cordis.patch.yml` 挂的也是 `@local/dsh-toolkit/agent-memory/plugin`）。
     因此**按目录路径装它会得到 `plugin-shape-invalid`**，报错文案会点名同表可改装的文件；
     这不是缺陷（装载器不代为挑选），要装请按文件路径装。
   - monorepo 根没有入口时，预检报错会直接列出**可改装的插件子包候选**
     （T0 实测：装 monorepo 壳目录会失败，装 `packages/*` 才对）。
   - **建议写法**：入口交给 `package.json` 的 `exports`/`main` 或目录下的 `index.js`，
     并让 `requirements.exports["."]` 与之一致——三处一致时上面任何一级都会解析到同一个文件。

2. **configSchema 落盘用纯定义 JSON、零默认值**（P5 起的仓内口径）。面板按它递归渲染表单
   （object/array/union/boolean/number/string + 必填标注），保存走 `registry.setConfig`，
   写回前服务端**真校验**（必填缺失阻断）。
3. **函数型成员走模块导出**：`healthCheck(ctx) => Promise<HealthItem[]>`、`Config`（schemastery/zod
   实例）、`panels`。JSON 里出现 `healthCheck` 直接判 error。
4. **`requires` 越诚实，预检越有用**：宿主 doctor 会按它合成规则（运行时版本 / 依赖服务在场 /
   二进制版本真探测 / envVar 存在性 / 端口 / 文件路径 / 外部 API 可达）。缺席类只产 warn/info，
   不产 error（doctor 验收红线 0/0/0 的口径）。

## 3. 装进来之后你会看到什么（自适应，零代码改动）

面板「插件管理（registry · 自适应）」区：卡片自动出现（SSE `registry:plugin-added`，**不用刷新**），
带状态徽标、契约版本、legacy 标注，五个操作齐备：停用 / 重载 / 卸载 / 健康详情 / 配置。
所有写操作都要**逐字 confirm 插件 id**（`confirm-missing` 一律 400），启停/卸载另有知情确认勾选。

## 4. 注册冲突检查（"提供面"目前怎么写）

⚠️ **契约目前没有"提供面"字段**（`DshSubPluginManifest` 只有 `requires.services` = 依赖的服务）。
doctor 的 `reg.name-collision` 规则要比对"插件声明会注册的服务/命令/提供者"，目前只能从**旧字段**
`requirements.registers.{services,commands,providers}` 提取（`loader.ts:31` `extractRegisters`）。
⇒ 想被冲突检查覆盖，就在 manifest 里带上这段旧字段（迁移期 info 级容忍）。该缺口已记入
`docs/debt.md` #12。

## 5. 红线（AGENTS.md 六条，加新插件时必须守住）

1. 禁止模块加载期静态 import 兄弟插件代码——兄弟能力只用运行时惰性探测（try-catch + 动态 import）
   或 `optionalDeps` 声明。
2. 禁止跨插件边界的 eager re-export（`export ... from` 会重建整条依赖链）。
3. 跨插件测试：存在性门控 + 动态 import，兄弟缺席必须 skip 不得红。
4. 声明了 `optionalDeps` 就必须真能降级（manifest 与实现同步）。
5. 面板/引擎零插件名硬编码（`node scripts/pluggable-lint.mjs` +
   `node scripts/p4-no-subplugin-import-check.mjs` 会抓，扫描面含 toolkit 根入口 `index.js`）。

## 6. 自测清单（提交前）

```bash
npm test                                   # build×3 + pluggable-lint + no-subplugin-import-check + typecheck×3 + node --test
node scripts/regression-all.mjs            # 回归全跑 14 项
node /d/dsh-test-sandbox/projects/doctor/src/cli.mjs --scope D:/dsh-plugins/dsh-toolkit   # 真实仓 dry-run 必须 0/0/0
```
再加一次真面板走查（面板 → 安装向导填**绝对路径** → ① 预检 → 确认安装 → 卡片免刷新出现 →
配置保存 → 停用/启用 → 健康详情）。CLI 也可验：`curl -s localhost:3080/api/toolkit-panel/v2/snapshot`。

## 7. 装不上时看什么

预检失败会返回 `blocking[]`，每条带 `fix.summary` / `fix.steps`：
- `path-not-found` ⇒ 提示"请填绝对路径 + 示例形态 + 相对路径按服务进程工作目录解析"；
  面板前端现在会在**提交前**就拦下相对路径（`need-absolute-path`），不让你看到拼错路径的报错。
- `entry-not-found` ⇒ 写清已读取到什么、缺哪个字段、monorepo 子包候选、补什么（带 JSON 片段示例）。
- `module-load-failed` / `plugin-shape-invalid` ⇒ 给模块路径与原因；shape 类会说明接受哪些导出形态
  （按目录装"`.` 声明的是数据库"那类包时，文案还会点名同表里可改装的插件子路径）。
- `source-not-supported` ⇒ npm 来源未实现（Q1），给"仅本地路径"的如实说明。
