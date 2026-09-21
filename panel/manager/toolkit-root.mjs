// toolkitRoot 的唯一推导点（H1 / 债务 D-11 关账）。
//
// 为什么要有这个文件：修复前面板与 registry-host 各算各的 toolkitRoot——
// `panel/index.js` 按**源文件位置**算（`resolve(panelRoot(), '..')`，稳定），
// 而 `panel/manager/registry-host.mjs` 按**进程 cwd** 算（`resolve(process.cwd(), '..')`），
// 且面板往下传的是原始 config（没带已 resolve 的值）⇒ 同一次运行里两个根可以差到十万八千里。
// Pack G 实测同一次冒烟中状态/审计落点在 `C:\Windows\.registry` 与 `D:\dsh-plugins\.registry`
// 之间跳过两次（证据 docs/debt.md《D-11 追加》），而 `cordis.patch.yml` 的 toolkit-manager
// 行**整行没有 config**，所以那条 cwd 缺省推导在真实部署里一直是生效路径，不是理论边界。
//
// 优先级（契约面承诺，写在这里供 contract/embed 文档引用）：
//   ① `config.toolkitRoot` 显式值（非空字符串）——最高优先，嵌入方用它把状态安到别处；
//   ② **模块位置推导**（本文件在 panel/manager/ 下，上溯两级即仓根）——与进程 cwd 完全解耦。
// 本模块**禁止**读 process.cwd()：加一条用例钉死这一点（test/toolkit-root.test.mjs）。
// 相对路径按 `node:path.resolve` 的既有语义处理（显式配置写相对路径时按调用进程 cwd 解析，
// 那是配置方的选择，不再是我们的缺省）。

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 本模块自身位置推导出的仓根（= toolkit 安装根）。 */
export function moduleToolkitRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
}

/**
 * 归一后的 toolkitRoot（绝对路径）。
 * @param {{toolkitRoot?: unknown}} [config] 插件 config（patch 行）
 * @returns {string}
 */
export function resolveToolkitRoot(config = {}) {
  const raw = config && config.toolkitRoot
  if (typeof raw === 'string' && raw.trim() !== '') return resolve(raw)
  return moduleToolkitRoot()
}
