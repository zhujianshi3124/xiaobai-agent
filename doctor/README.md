# doctor — DSH 宿主文件面体检器（dsh-toolkit 桶成员）

doctor 是 dsh-toolkit 桶内的质检工具：对任意 dsh 宿主插件仓/包做**文件面体检**（manifest 契约
校验、依赖解析、跨目录链接、挂载/provider 检查、requirements 键集与 `./` 目标存在性、`$from`
套件根专属规则等），支持 dry-run → `--apply`（修复）→ `--rollback`（回滚）闭环。

**桶只是分发形式**：doctor 成员**零 npm 依赖**（纯 Node 标准库），`doctor/cli/src/` 四件整体
抠出即可单独运行——与桶里其他成员一样，各自保有独立可用的入口。

## 两条实现线（同一成员）

| 形态 | 位置 | 消费方 |
|---|---|---|
| **API 库**（TypeScript，编译到 `doctor/dist`） | `doctor/src/*.ts` | toolkit 内 registry / 面板（`createDoctor` 等） |
| **独立 CLI**（零依赖，`doctor/cli/src/`） | `doctor/cli/src/cli.mjs` | 任何人：`node cli.mjs --scope <仓根>`；npm 安装本包后即 `dsh-doctor` 命令 |

两实现语义由 toolkit 门禁 `scripts/doctor-cli-contract-parity.mjs` 每轮对账（"契约管解析行为、
doctor 管必填性"分权）。

## CLI 用法

```
dsh-doctor [--json] [--apply [--only <issueId>] [--yes]] [--rollback [--to <stateId>]] [--scope <root>]
```

- 默认 dry-run（只读不写）；`--states` 只读输出回滚链摘要；`--report <file>` 喂现成报告跳过重扫；
  `--host-version <v>` 钉宿主版本比对；`--yes` 语义＝调用方须已完成知情确认（面板 UI 两步
  plan-execute 后受托执行）；终端手跑仍应逐条确认。
- 退出码：0=绿或成功归零；1=dry-run 发现问题；2=apply 后残留或 step 失败；3=root 非法；
  130=用户取消。
- 源码运行（未装包）：`node doctor/cli/src/cli.mjs --json --scope <仓根>`。

## 事实驱动协议（engine 零硬编码插件名）

- **host-faces.json**（CLI 自带，`doctor/cli/src/`）：宿主提供面清单（由宿主类型定义反查固化）。
- **目标仓 `doctor-signals.json`**：被体检仓的信号声明（managedNamePrefix、presetManagedNames、
  hostProviderKeys、providerDependencies——缺席/缺依赖只产 info/warning，绝不 error）。体检
  dsh-toolkit 时读取桶根的 `doctor-signals.json`。
- 版本：doctor 成员无独立版本号，随桶（"一个版本号管全部"）；本成员随 dsh-toolkit 1.0.0 起版。
- license：MIT（见仓根 LICENSE，署名覆盖全部桶成员含 doctor）。
