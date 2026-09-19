/**
 * Registry 公共出口（P2）。宿主（P6 toolkit 根入口）用法：
 *
 *   import { Context } from '@deepseek-ai/cordis'
 *   import { createRegistry } from '@local/dsh-toolkit/registry'
 *   const { registry } = createRegistry(rootCtx, { servicePrefix: 'toolkit', statePath })
 *   // registry.list() / install / uninstall / setEnabled / reload
 *
 * 服务名：`${servicePrefix}/registry`（已注册进宿主，供面板经 ctx 读取）。
 */

export { ToolkitRegistryCore, sourceFixAdvice } from './registry.js'
export { cordisHost } from './host.js'
export { resolveLocalSource, SourceError } from './loader.js'
export { contractPrecheck } from './precheck.js'
export { STATE_SCHEMA_VERSION } from './state.js'
export type {
  RegistryOptions,
  RegistryEntry,
  RegistryStateFile,
  PersistedPlugin,
  ResolvedPlugin,
  HostContext,
  FiberLike,
  RegistryLogger,
} from './types.js'

import { cordisHost } from './host.js'
import { ToolkitRegistryCore } from './registry.js'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolkitRegistry } from '@local/dsh-toolkit/contract'
import type { RegistryOptions } from './types.js'

export interface CreatedRegistry {
  registry: ToolkitRegistry
  /** 停机：级联卸载全部子插件 fiber、取消重试（REQ-6）。 */
  stop(): Promise<void>
}

/** 便捷装配：真实 cordis Context + 选项。 */
export function createRegistry(ctx: Context, options: RegistryOptions): CreatedRegistry {
  const core = new ToolkitRegistryCore(cordisHost(ctx), options)
  core.start()
  return { registry: core, stop: () => core.stop() }
}
