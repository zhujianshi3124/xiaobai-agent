/**
 * Doctor 公共出口（P3）。宿主（P6 toolkit 根入口）用法：
 *
 *   const doctor = createDoctor(hostCtx, { servicePrefix: 'toolkit', watchInterval: 30000 })
 *   doctor.attachRegistry(registry)      // 供 inspect/subPlugins 检查
 *   doctor.startWatch()                  // 周期巡检
 *   registry 用 doctor.precheck 作为安装预检（REQ-3）。
 */

export { DoctorService } from './doctor.js'
export type { RegistryAccessor } from './doctor.js'
export { defaultProbes } from './probes.js'
export { synthesizeRules } from './rules.js'
export type { DoctorOptions, Probes, RuleRuntime, DoctorLogger } from './types.js'

import { DoctorService } from './doctor.js'
import { cordisHost } from 'xiaobai-agent/registry'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolkitDoctor, ToolkitRegistry } from 'xiaobai-agent/contract'
import type { DoctorOptions, HealthReport } from './types.js'

export interface CreatedDoctor {
  doctor: ToolkitDoctor & {
    attachRegistry(registry: ToolkitRegistry): void
    startWatch(): void
    stopWatch(): void
    history(id: string): HealthReport[]
    serviceName: string
    publishReport(id: string, report: HealthReport): void
  }
  stop(): void
}

/** 便捷装配：cordis 宿主 ctx + registry（可选，供 inspect/subPlugins 检查）。 */
export function createDoctor(ctx: Context, options: DoctorOptions, registry?: ToolkitRegistry): CreatedDoctor {
  const service = new DoctorService(options)
  const host = cordisHost(ctx)
  service.attachHost(host)
  if (registry) service.attachRegistry(registry)
  host.provideService(service.serviceName, service)
  return {
    doctor: service as unknown as CreatedDoctor['doctor'],
    stop: () => service.stopWatch(),
  }
}
