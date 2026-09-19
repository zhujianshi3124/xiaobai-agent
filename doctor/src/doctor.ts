/**
 * Doctor 服务（P3，REQ-3/4；契约 `ToolkitDoctor` 实现）。
 *
 * 规则来源三合一（REQ-4）：
 *   1. 内置规则——manifest.requires 自动合成（rules.ts）；存量 doctor 的静态
 *      文件面检查保留在 CLI（沙箱仓）负责安装前文件面，进程内预检复用本模块。
 *   2. manifest.requires 合成规则（同上，按条目生成）。
 *   3. registerRule 注册的第三方规则（同构 HealthItem 输出）。
 *
 * 监测 = 周期巡检（watchInterval，失败退避）+ manifest.healthCheck（超时计入降级）。
 * 降级：对 error 级发现连续 failureThreshold 次 → unhealthy（有 warn 未达阈值 →
 * degraded 语义由报告 status 呈现）；任一次全绿 → 立即回 healthy 并发 health-changed。
 * 每插件环形缓存最近 historySize 份报告（REQ-4）。
 * 事件：`${prefix}/doctor:issue-found`、`${prefix}/registry:health-changed`
 * （health 变化经前缀事件通知面板）。
 */

import {
  contractEventName,
  contractServiceName,
  validateConfigAgainstSchema,
  validateManifest,
  versionSatisfies,
} from '@local/dsh-toolkit/contract'
import type {
  DoctorRule,
  HealthItem,
  HealthReport,
  InspectionReport,
  PluginSource,
  PrecheckReport,
  ToolkitDoctor,
} from '@local/dsh-toolkit/contract'
import { resolveLocalSource, SourceError } from '@local/dsh-toolkit/registry'
import { defaultProbes } from './probes.js'
import { synthesizeRules } from './rules.js'
import type { DoctorLogger, DoctorOptions, DoctorRule as DoctorRuleType, HealthItem as HealthItemType, Probes, RuleRuntime } from './types.js'

interface PluginHealthState {
  /** 环形历史。 */
  history: HealthReport[]
  consecutiveFailures: number
  /** 最近一次对外发布的 status。 */
  published: HealthReport['status']
  /** 已发出过 issue-found 的 issue code 集合（恢复后清空）。 */
  announced: Set<string>
}

export interface RegistryAccessor {
  list(): Array<{ manifest: import('@local/dsh-toolkit/contract').DshSubPluginManifest; status: string; config: unknown; legacy: boolean }>
  get(id: string): { manifest: import('@local/dsh-toolkit/contract').DshSubPluginManifest; status: string; config: unknown; legacy: boolean } | undefined
  /** 注册面查询（注册冲突检查用；可缺省——缺省时跳过 services 维度比对）。 */
  registersOf?(id: string): { services?: string[]; commands?: string[]; providers?: string[] } | undefined
}

export class DoctorService implements ToolkitDoctor {
  readonly serviceName: string
  private readonly opts: DoctorOptions & Required<Pick<DoctorOptions, 'watchInterval' | 'failureThreshold' | 'historySize' | 'ruleTimeoutMs' | 'healthCheckTimeoutMs' | 'probeTimeoutMs'>>
  private readonly probes: Probes
  private readonly log: DoctorLogger
  private readonly timers: NonNullable<DoctorOptions['timers']>
  private readonly thirdPartyRules: DoctorRuleType[] = []
  private readonly states = new Map<string, PluginHealthState>()

  constructor(options: DoctorOptions) {
    if (!options.servicePrefix) throw new TypeError('DoctorOptions.servicePrefix 必填（D5）')
    this.opts = {
      watchInterval: 30_000,
      failureThreshold: 3,
      historySize: 20,
      ruleTimeoutMs: 5_000,
      healthCheckTimeoutMs: 5_000,
      probeTimeoutMs: 3_000,
      ...options,
    } as typeof this.opts
    void this.opts
    this.log = options.logger ?? {
      info: (m, meta) => console.log(`[doctor] ${m}`, meta ?? ''),
      warn: (m, meta) => console.warn(`[doctor] ${m}`, meta ?? ''),
      error: (m, meta) => console.error(`[doctor] ${m}`, meta ?? ''),
    }
    this.timers = options.timers ?? {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
    }
    // 探测面：默认实现；attachHost 后 hasService 被宿主实现覆盖。
    this.probes = options.probes ?? defaultProbes(() => false)
    this.serviceName = contractServiceName(this.opts.servicePrefix, 'doctor')
  }

  private hostHasService: ((name: string) => boolean) | undefined
  private hostEmit: ((event: string, ...args: unknown[]) => unknown) | undefined
  private registry: RegistryAccessor | undefined
  private watchTimer: unknown
  private watchBackoff = 1
  private watching = false
  private inspecting = false

  /** 注入宿主（事件发射 + 服务探测 + registry 访问，均可选）。 */
  attachHost(host: {
    emit?(event: string, ...args: unknown[]): unknown
    hasService?(name: string): boolean
  }): void {
    this.hostEmit = host.emit?.bind(host)
    this.hostHasService = host.hasService?.bind(host)
  }

  /** 注入 registry（供 inspect 枚举、id 冲突与 subPlugins 实况检查）。 */
  attachRegistry(registry: RegistryAccessor): void {
    this.registry = registry
  }

  private emitEvent(name: string, payload: unknown): void {
    this.hostEmit?.(contractEventName(this.opts.servicePrefix, name as never), payload)
  }

  private effectiveHasService(name: string): boolean {
    return this.hostHasService ? this.hostHasService(name) : this.probes.hasService(name)
  }

  private probesFor(): Probes {
    return { ...this.probes, hasService: (name) => this.effectiveHasService(name) }
  }

  // ── 规则扩展点（REQ-4）──────────────────────────────────────────────────

  registerRule(rule: DoctorRuleType): void {
    if (!rule?.id || typeof rule.check !== 'function') {
      throw new TypeError('registerRule: 规则必须有 id 与 check')
    }
    this.thirdPartyRules.push(rule)
  }

  /** 规则集 = manifest 合成 + 第三方注册（内置规则即合成规则的实现层）。 */
  private rulesFor(manifest: Parameters<typeof synthesizeRules>[0]): DoctorRuleType[] {
    const subInstalled = (id: string): boolean => {
      const entry = this.registry?.get(id)
      return entry !== undefined && entry.status === 'active'
    }
    return [...synthesizeRules(manifest, this.probesFor(), subInstalled), ...this.thirdPartyRules]
  }

  // ── 工具 ────────────────────────────────────────────────────────────────

  private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const handle = this.timers.setTimeout(() => reject(new Error(`${label} 超时（${ms}ms）`)), ms)
      promise.then(
        (v) => {
          this.timers.clearTimeout(handle)
          resolve(v)
        },
        (e) => {
          this.timers.clearTimeout(handle)
          reject(e)
        },
      )
    })
  }

  private async runRule(rule: DoctorRuleType, ctx: RuleRuntime): Promise<HealthItemType[]> {
    try {
      return await this.withTimeout(Promise.resolve(rule.check(ctx)), this.opts.ruleTimeoutMs, `规则 ${rule.id}`)
    } catch (error) {
      return [{
        code: 'rule-error',
        level: 'error',
        message: `规则 ${rule.id} 执行失败/超时：${String((error as Error).message ?? error)}`,
        fix: { summary: '检查规则实现或其依赖的环境面' },
      }]
    }
  }

  private now(): number {
    return Date.now()
  }

  // ── precheck（REQ-3，安装前，只读幂等带超时）────────────────────────────

  async precheck(source: PluginSource): Promise<PrecheckReport> {
    // 1. 解析来源（loader 会做 manifest 契约校验并携带精确 issue）。
    let resolved
    try {
      resolved = await this.withTimeout(resolveLocalSource(source), this.opts.ruleTimeoutMs * 2, '来源解析')
    } catch (error) {
      if (error instanceof SourceError && error.issues?.length) {
        return {
          pass: false,
          blocking: error.issues.map((i) => ({
            code: i.code,
            level: 'error' as const,
            message: `${i.path}: ${i.message}`,
            fix: { summary: '按字段路径修复 manifest 后重试安装' },
          })),
          warnings: [],
          changes: [],
          legacyMode: false,
        }
      }
      return {
        pass: false,
        blocking: [{
          code: error instanceof SourceError ? `source/${error.code}` : 'source-error',
          level: 'error',
          message: String((error as Error).message ?? error),
          fix: { summary: '按消息修复后重试安装' },
        }],
        warnings: [],
        changes: [],
        legacyMode: false,
      }
    }

    const blocking: HealthItemType[] = []
    const warnings: HealthItemType[] = []
    const changes: PrecheckReport['changes'] = []
    const manifest = resolved.manifest

    // 2. id 冲突（registry 实况）。
    if (this.registry?.get(manifest.id)) {
      blocking.push({
        code: 'id-conflict',
        level: 'error',
        message: `插件 id "${manifest.id}" 已被占用`,
        fix: { summary: '先卸载同 id 插件或更名后重试', steps: ['在面板卸载旧插件，或修改 dsh.plugin.json 的 id'] },
      })
    }

    // 3. 合成规则全量跑一遍（envVars/binaries/ports/fsPaths/externalApis/services/runtime）。
    const ctx: RuleRuntime = { pluginId: manifest.id, manifest, config: {}, ctx: undefined, hasService: (n) => this.effectiveHasService(n) }
    for (const rule of this.rulesFor(manifest)) {
      const items = await this.runRule(rule, ctx)
      for (const item of items) {
        if (item.level === 'error') blocking.push(item)
        else if (item.level === 'warn') warnings.push(item)
      }
    }

    // 4. configSchema 对默认配置真校验（REQ-3 §11，债务 #2）：
    //    schema 优先级 = manifest.configSchema → 模块 Config/configSchema 导出。
    const schemaCandidate = manifest.configSchema
      ?? ((resolved.plugin ?? {}) as Record<string, unknown>)['Config']
      ?? ((resolved.plugin ?? {}) as Record<string, unknown>)['configSchema']
    if (schemaCandidate !== undefined) {
      const check = await this.withTimeout(
        validateConfigAgainstSchema(schemaCandidate, {}),
        this.opts.ruleTimeoutMs,
        'configSchema 校验',
      )
      if (!check.ok) {
        for (const i of check.issues) {
          blocking.push({
            code: 'config-schema-invalid',
            level: 'error',
            message: `configSchema 默认配置校验失败 [${i.path}]：${i.message}（必填缺失或类型不符）`,
            fix: {
              summary: '补齐配置必填项或修正类型',
              steps: ['按 schema 在安装后于面板"配置"中填写，或调整 configSchema 的 required 声明'],
            },
          })
        }
      }
    } else if (!resolved.legacy) {
      changes.push({
        target: 'manifest',
        summary: '未声明 configSchema（面板将不渲染配置表单）',
        detail: '如插件有可调参数，补 configSchema（schemastery）后新装插件即可自动获得配置 UI',
      })
    }

    // 5. 注册冲突（债务 #3 进程内部分）：与已注册条目的 commands/providers/services 撞名。
    if (this.registry) {
      const own = resolved.registers
      const ownServices = manifest.requires?.services ?? []
      for (const entry of this.registry.list()) {
        if (entry.manifest.id === manifest.id) continue
        const other = this.registry.registersOf?.(entry.manifest.id)
        const otherServices = (other?.services ?? entry.manifest.requires?.services ?? [])
        const conflicts: string[] = []
        for (const c of own?.commands ?? []) {
          if (other?.commands?.includes(c)) conflicts.push(`命令 ${c}`)
        }
        for (const p of own?.providers ?? []) {
          if (other?.providers?.includes(p)) conflicts.push(`provider ${p}`)
        }
        for (const s of ownServices) {
          if (otherServices.includes(s)) conflicts.push(`服务 ${s}`)
        }
        if (conflicts.length > 0) {
          blocking.push({
            code: 'reg.name-collision',
            level: 'error',
            message: `与已注册插件 "${entry.manifest.id}" 注册面冲突：${conflicts.join('、')}`,
            fix: {
              summary: '改注册名或先卸载冲突插件',
              steps: ['修改本插件 manifest 的 registers 声明，或在面板卸载占用同名注册面的插件'],
            },
          })
        }
      }
    }

    if (resolved.legacy) {
      warnings.push({
        code: 'legacy-mode',
        level: 'warn',
        message: 'legacy 模式：无契约 manifest，检查受限（健康检查退化为通用项）',
        fix: {
          summary: '补 manifest 升级为契约插件（可选）',
          steps: [`在 ${resolved.entryPath} 同目录新增 dsh.plugin.json（id/displayName/version/contract/requires）`],
        },
      })
      changes.push({
        target: 'manifest',
        summary: '建议新增契约 manifest 导出',
        detail: 'legacy 包装可启停/卸载，但无环境预检、无自定义健康检查、无面板增强',
      })
    }

    return { pass: blocking.length === 0, blocking, warnings, changes, legacyMode: resolved.legacy }
  }

  // ── inspect（REQ-4，运行时检查）─────────────────────────────────────────

  async inspect(pluginId?: string): Promise<InspectionReport> {
    if (!this.registry) throw new Error('doctor 未 attachRegistry，无法枚举插件')
    const entries = pluginId
      ? [this.registry.get(pluginId)].filter((e): e is NonNullable<typeof e> => e !== undefined)
      : this.registry.list()
    const reports: HealthReport[] = []
    for (const entry of entries) {
      const report = await this.inspectEntry(entry.manifest.id, entry.manifest, entry.config)
      reports.push(report)
      this.recordAndAnnounce(entry.manifest.id, report)
    }
    return { generatedAt: this.now(), reports }
  }

  private async inspectEntry(pluginId: string, manifest: Parameters<typeof synthesizeRules>[0], config: unknown): Promise<HealthReport> {
    const items: HealthItemType[] = []
    const ctx: RuleRuntime = { pluginId, manifest, config, ctx: undefined, hasService: (n) => this.effectiveHasService(n) }
    for (const rule of this.rulesFor(manifest)) {
      items.push(...(await this.runRule(rule, ctx)))
    }
    // manifest.healthCheck（可选；异常/超时计入降级计数）。
    if (typeof manifest.healthCheck === 'function') {
      try {
        const custom = await this.withTimeout(
          Promise.resolve(manifest.healthCheck({ config, ctx: undefined })),
          this.opts.healthCheckTimeoutMs,
          'healthCheck',
        )
        items.push(...custom)
      } catch (error) {
        items.push({
          code: 'healthcheck-failed',
          level: 'error',
          message: `自定义健康检查失败：${String((error as Error).message ?? error)}`,
          fix: { summary: '查看插件 healthCheck 实现与所依赖环境' },
        })
      }
    }
    const hasError = items.some((i) => i.level === 'error')
    const hasWarn = items.some((i) => i.level === 'warn')
    return {
      pluginId,
      status: hasError ? 'unhealthy' : hasWarn ? 'degraded' : 'healthy',
      checkedAt: this.now(),
      items,
    }
  }

  // ── 降级 / 发布 / 环形历史（REQ-4）──────────────────────────────────────

  private stateFor(id: string): PluginHealthState {
    let s = this.states.get(id)
    if (!s) {
      s = { history: [], consecutiveFailures: 0, published: 'unknown', announced: new Set() }
      this.states.set(id, s)
    }
    return s
  }

  private recordAndAnnounce(id: string, report: HealthReport): void {
    const state = this.stateFor(id)
    state.history.push(report)
    if (state.history.length > this.opts.historySize) state.history.splice(0, state.history.length - this.opts.historySize)

    const failing = report.status !== 'healthy'
    if (!failing) {
      state.consecutiveFailures = 0
      state.announced.clear()
      if (state.published !== 'healthy') {
        state.published = 'healthy'
        this.emitEvent('registry:health-changed', { id, report })
      }
      return
    }

    state.consecutiveFailures += 1
    // 未达阈值：暂按 healthy 发布（避免抖动），但保留历史供面板查看。
    if (state.consecutiveFailures < this.opts.failureThreshold) return

    // 达阈值：发布降级态 + doctor:issue-found（每 code 一次，恢复后重置）。
    state.published = report.status
    this.emitEvent('registry:health-changed', { id, report })
    for (const item of report.items) {
      if (item.level === 'ok') continue
      if (state.announced.has(item.code)) continue
      state.announced.add(item.code)
      this.emitEvent('doctor:issue-found', { id, item })
    }
  }

  /** 健康历史（环形缓存读取口，供面板画历史）。 */
  history(id: string): HealthReport[] {
    return [...(this.states.get(id)?.history ?? [])]
  }

  // ── 周期巡检（REQ-4，失败退避）──────────────────────────────────────────

  startWatch(): void {
    if (this.watching || this.opts.watchInterval <= 0) return
    this.watching = true
    const loop = () => {
      this.watchTimer = this.timers.setTimeout(async () => {
        if (this.inspecting) {
          loop()
          return
        }
        this.inspecting = true
        try {
          await this.inspect()
          this.watchBackoff = 1
        } catch (error) {
          // 巡检自身失败：退避（上限 8 倍）。
          this.watchBackoff = Math.min(this.watchBackoff * 2, 8)
          this.log.warn('周期巡检失败，退避', { event: 'watch-failed', errorCode: 'watch-failed', message: String((error as Error).message) })
        } finally {
          this.inspecting = false
        }
        if (this.watching) loop()
      }, this.opts.watchInterval * this.watchBackoff)
    }
    loop()
  }

  stopWatch(): void {
    this.watching = false
    if (this.watchTimer) {
      this.timers.clearTimeout(this.watchTimer)
      this.watchTimer = undefined
    }
  }

  /** 供 registry 落库健康报告（registry.setHealth 透传）。 */
  publishReport(id: string, report: HealthReport): void {
    this.recordAndAnnounce(id, report)
  }

  /** manifest 校验入口（P5 迁移用；P3 已在 precheck 内经 loader 完成）。 */
  validate(manifest: unknown): boolean {
    return validateManifest(manifest).ok && versionSatisfies('1.0.0', (manifest as { contract: string }).contract)
  }
}
