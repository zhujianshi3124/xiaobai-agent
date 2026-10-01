/**
 * P2 内置预检（REQ-3 的契约级子集；P3 doctor.precheck 注入替换为全量版）。
 * 全部只读、幂等；不打印任何环境变量的值（§9）。
 *
 * 覆盖：
 *   1. manifest 契约校验（loader 已解析合成的 manifest；blocking）
 *   2. id 冲突（blocking）
 *   3. requires.services 在当前宿主运行时可用性（blocking：缺服务会永久 PENDING）
 *   4. contract 范围兼容当前契约版本（manifest 校验已含；这里显式出具 blocking/warning 结论）
 */

import type { HealthItem, PrecheckReport } from 'dsh-toolkit/contract'
import type { ResolvedPlugin, HostContext } from './types.js'

export interface PrecheckInput {
  resolved: ResolvedPlugin
  /** 已注册的插件 id → 是否存在。 */
  idExists: (id: string) => boolean
  host: HostContext
}

export function contractPrecheck(input: PrecheckInput): PrecheckReport {
  const blocking: HealthItem[] = []
  const warnings: HealthItem[] = []
  const changes: PrecheckReport['changes'] = []
  const { resolved, host } = input

  if (input.idExists(resolved.manifest.id)) {
    blocking.push({
      code: 'id-conflict',
      level: 'error',
      message: `插件 id "${resolved.manifest.id}" 已被占用：先卸载同 id 插件或更名后重试`,
      fix: {
        summary: '解决 id 冲突',
        steps: ['在面板卸载占用该 id 的旧插件，或修改本插件 dsh.plugin.json 的 id 后重装'],
      },
    })
  }

  const services = resolved.manifest.requires?.services ?? []
  for (const name of services) {
    if (!host.hasService(name)) {
      blocking.push({
        code: 'service-missing',
        level: 'error',
        message: `依赖的宿主服务 "${name}" 在当前运行时不可用（缺服务装入会永久等待）`,
        fix: {
          summary: `补齐服务 ${name}`,
          steps: [`确认宿主 profile 已启用提供 "${name}" 服务的插件/包，或在 dsh.plugin.json 移除该依赖`],
        },
      })
    }
  }

  if (resolved.legacy) {
    warnings.push({
      code: 'legacy-mode',
      level: 'warn',
      message: 'legacy 模式：无契约 manifest，已由适配器包装。健康检查退化为通用项，配置 UI 取决于插件是否导出 Config',
      fix: {
        summary: '补 manifest 升级为契约插件（可选）',
        steps: [
          `在 ${resolved.entryPath} 同目录新增 dsh.plugin.json，导出 id/displayName/version/contract/requires 字段`,
          '将插件对环境的要求写进 requires（envVars/binaries/ports/fsPaths/externalApis）',
        ],
      },
    })
    changes.push({
      target: 'manifest',
      summary: '建议新增契约 manifest 导出',
      detail: '当前以 legacy 包装运行：可启停/卸载，但无环境预检、无自定义健康检查、无面板增强',
    })
  }

  return {
    pass: blocking.length === 0,
    blocking,
    warnings,
    changes,
    legacyMode: resolved.legacy,
  }
}
