/**
 * Registry 核心状态机（P2，REQ-2/6/7；规格 §4 Registry 服务接口实现）。
 *
 * - install：解析来源 → 契约级预检（blocking 不注册，返回 PrecheckReport）→
 *   **写 entries → persist 落盘 → emit 通知**（事务顺序固定，磁盘与内存不出现分裂窗口）
 *   → 派生 ctx 装入 → active。装入失败**不回滚注册**（进
 *   error/重试轨道——S4 隔离语义：插件可见、可手动 reload）；解析/预检阶段
 *   失败才回滚（REQ-2 的"install 失败回滚记录"指注册前失败）。
 *   注册之后的意外失败走补偿：删条目 + **重 persist 摘除磁盘记录**，
 *   保证失败路径不留「内存无、磁盘有」或「内存有、磁盘无」的任一半边。
 * - 事件发射一律走 `notify()` 包装：cordis 的 `emit` 是裸调用
 *   （`events.ts` 里 `.map(cb => cb(...))`，无逐监听器隔离），一个抛错的面板/SSE
 *   监听器不能把异常抛回 install/unload 主流程。捕获后记 warn，不静默丢弃。
 * - 操作互斥：同一插件 id 的操作串行；install 全局互斥（REQ-2）。
 * - 错误隔离：每个子插件独立派生 ctx（host.plugin()）；装入失败/超时 → error，
 *   指数退避自动重试，达 retryLimit → quarantined；手动 enable/reload 清零重试（REQ-6）。
 * - 持久化：state.json 记录 source/enabled/config/quarantined/lastError；
 *   autoload 按记录恢复，失败项进 error 并保留 lastError（REQ-7）；转 ACTIVE 即清空
 *   lastError（D-8：它是"当前状态"字段，历史在审计 JSONL 里），磁盘记录同步回写。
 *   落盘失败不再静默（H1 / D-11）：记 error 日志（带路径）+ 发 `audit:state-save-failed`
 *   + `stateSaveStatus()` 可查，面板据此把"运行中但未落盘"如实显示出来。
 * - 事件：全部经 contractEventName(servicePrefix, …) 带前缀（D5/REQ-8）。
 * - 审计（REQ-10）：结构化日志 {pluginId, event, durationMs, errorCode}；
 *   审计事件面板接线在 P4（避免私造契约外事件名）。
 */

import {
  contractEventName,
  contractServiceName,
  validateConfigAgainstSchema,
} from '@local/dsh-toolkit/contract'
import type {
  AuditEvent,
  FiberLoadErrorCode,
  HealthReport,
  InstallResult,
  PluginEntry,
  PluginSource,
  PluginStatus,
  PrecheckReport,
  ToolkitRegistry,
} from '@local/dsh-toolkit/contract'
import { resolveLocalSource, SourceError } from './loader.js'
import { contractPrecheck } from './precheck.js'
import { emptyState, loadState, saveState } from './state.js'
import type { FiberLike, HostContext, PluginRegisters, RegistryEntry, RegistryLogger, RegistryOptions, ResolvedPlugin } from './types.js'

/**
 * cordis `FiberState` 的**数值**镜像（4.0.2：PENDING=0 / LOADING=1 / ACTIVE=2 /
 * FAILED=3 / DISPOSED=4 / UNLOADING=5）。
 *
 * 为什么是硬编码而不是 import 枚举：cordis 把 `FiberState` 声明为
 * `export const enum`（`fiber.ts`），构建产物里被完全擦除——
 * `node_modules/@deepseek-ai/cordis/lib/index.js` 中 `FiberState` 出现 0 次，
 * `.d.ts` 只剩 `export declare const enum`。运行时根本拿不到这个符号，
 * 硬编码是当时唯一可选项（R13，docs/p0-recon.md §3 + docs/debt.md D-5）。
 *
 * 守卫：`test/cordis-fiber-state.test.mjs` 用真 cordis 实测各终态数值并与本组常量
 * 逐一对账。**任何 cordis 升级必跑该用例 + S1/S4**；本组常量的导出面就是为了
 * 让守卫能引用它们，而不是各测各的。
 */
export const FIBER_PENDING = 0
export const FIBER_LOADING = 1
export const FIBER_ACTIVE = 2
export const FIBER_FAILED = 3
export const FIBER_DISPOSED = 4
export const FIBER_UNLOADING = 5
const POLL_MS = 5

/**
 * 装入等待期间的 fiber 终态判定错误。`name` 即 `lastError.code`
 * （`errorOf()` 用非 'Error' 的 name 当码），码值取自契约公共枚举
 * `FIBER_LOAD_ERROR_CODES`，面板/doctor 据此分流"被卸载"与"装得太慢"。
 */
export class FiberLoadError extends Error {
  constructor(code: FiberLoadErrorCode, message: string) {
    super(message)
    this.name = code
  }
}

/**
 * 装入完成判定（R2 结论，docs/p0-recon.md §6）：**不改写插件对象**（保持宿主
 * 原语义，D4），以 fiber 状态迁移为准——ACTIVE = 成功；FAILED = 失败（错误经
 * fiber.await() 的 rejection 取回）；DISPOSED = 装入期间被卸载；
 * UNLOADING = 卸载进行中，继续轮询到终态，超时则报"被卸载未收敛"（区别于
 * PENDING 兜底的"装入超时"）；超时兜底 PENDING 永挂（主要覆盖 inject 服务缺席）。
 */

function defaultLogger(): RegistryLogger {
  return {
    info: (message, meta) => console.log(`[registry] ${message}`, meta ?? ''),
    warn: (message, meta) => console.warn(`[registry] ${message}`, meta ?? ''),
    error: (message, meta) => console.error(`[registry] ${message}`, meta ?? ''),
  }
}

function errorOf(error: unknown): { code: string; message: string } {
  if (error instanceof SourceError) return { code: `source/${error.code}`, message: error.message }
  const err = error as Error | undefined
  return { code: typeof err?.name === 'string' && err.name !== 'Error' ? err.name : 'internal', message: String(err?.message ?? error) }
}

/**
 * 来源类错误的针对性修复建议（T0 裁决：不许出现"按消息修复后重试"式循环表述；
 * message 本身已写明找到了什么/缺什么，这里给可执行的下一步）。
 * doctor.precheck 的错误翻译共用本函数（doctor 依赖 registry，见 doctor.ts import）。
 */
export function sourceFixAdvice(code: string): { summary: string; steps: string[] } {
  switch (code) {
    case 'source/path-not-found':
      return {
        summary: '改装正确的本地绝对路径',
        steps: ['在文件管理器打开插件目录，从地址栏复制完整绝对路径后重试', '相对路径会按服务进程工作目录解析，请改用绝对路径'],
      }
    case 'source/entry-not-found':
      return {
        summary: '补入口字段或改装插件子包目录（见报错里的候选与示例）',
        steps: ['若装的是 monorepo 根：改为安装其中的插件子包目录', '若目录本身是插件：在 package.json 补 "main" 或 "exports" 字段并指向已构建入口'],
      }
    case 'source/module-load-failed':
      return {
        summary: '先在插件目录补依赖/构建，再回来安装',
        steps: ['按报错补装缺失依赖（npm/pnpm install）或执行构建（如 npm run build）', '确认入口文件能在插件目录下被 node 直接加载'],
      }
    case 'source/plugin-shape-invalid':
      return {
        summary: '让入口导出可识别的插件形态（或修正 manifest 字段）',
        steps: ['入口需导出 apply/register 或 default 插件对象（cordis 命名导出 name/inject/apply 即可）', '若带 dsh.plugin.json：按阻断项的字段路径修正后重装'],
      }
    case 'source/source-not-supported':
      return {
        summary: '改用本地路径来源安装',
        steps: ['npm 来源尚未开放（Q1 裁决：仅本地路径，npm 为纯增量预留）'],
      }
    default:
      return { summary: '按报错信息处理对应问题后重试安装', steps: ['对照报错 message 定位问题（路径/入口/依赖/导出形态）', '修复后重试；持续失败请附完整报错原文'] }
  }
}

export class ToolkitRegistryCore implements ToolkitRegistry {
  readonly serviceName: string
  private readonly host: HostContext
  private readonly opts: RegistryOptions & Required<Pick<RegistryOptions, 'servicePrefix' | 'statePath' | 'autoload' | 'retryLimit' | 'retryBackoffMs' | 'loadTimeoutMs' | 'saveDebounceMs'>>
  private readonly log: RegistryLogger
  private readonly timers: NonNullable<RegistryOptions['timers']>
  private readonly entries = new Map<string, RegistryEntry>()
  private readonly locks = new Map<string, Promise<unknown>>()
  private installLock: Promise<unknown> = Promise.resolve()
  private state = emptyState()
  /** 最近一次状态落盘的结果（H1 / D-11 可见化；`ok:false` 即"内存生效、磁盘未落"）。 */
  private lastSave: { ok: boolean; path: string; at?: number; error?: string; advice?: string[] }
  private saveTimer: unknown
  private stopped = false

  constructor(host: HostContext, options: RegistryOptions) {
    if (!options.servicePrefix) throw new TypeError('RegistryOptions.servicePrefix 必填（D5 无根假设）')
    this.host = host
    this.opts = {
      autoload: true,
      retryLimit: 3,
      retryBackoffMs: 500,
      loadTimeoutMs: 30_000,
      saveDebounceMs: 0,
      ...options,
    }
    this.log = options.logger ?? defaultLogger()
    this.lastSave = { ok: true, path: this.opts.statePath }
    this.timers = options.timers ?? {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (h) => clearTimeout(h as NodeJS.Timeout),
    }
    this.serviceName = contractServiceName(this.opts.servicePrefix, 'registry')
  }

  // ── 服务装配 ────────────────────────────────────────────────────────────

  /** 注册 `${prefix}/registry` 服务并执行 autoload。 */
  start(): void {
    this.host.provideService(this.serviceName, this)
    if (this.opts.autoload) {
      void this.autoload()
    }
  }

  /** 注入安装预检实现（P3 doctor.precheck；缺省用内置契约级预检）。 */
  setPrecheck(fn: NonNullable<RegistryOptions['precheck']>): void {
    this.opts.precheck = fn
  }

  /** 停机：取消全部重试、卸载全部子插件 fiber（REQ-6 卸载级联清理）。 */
  async stop(): Promise<void> {
    this.stopped = true
    if (this.saveTimer) this.timers.clearTimeout(this.saveTimer)
    for (const entry of this.entries.values()) {
      this.cancelRetry(entry)
      if (entry.fiber) {
        try {
          entry.fiber.dispose()
        } catch {
          // 卸载失败不阻断其余清理（D3）
        }
        entry.fiber = undefined
      }
    }
  }

  // ── 事件（全部带前缀）──────────────────────────────────────────────────

  /**
   * 通知发射唯一出口（A1）。cordis 的 `ctx.emit` 对监听器是裸调用，既不逐条
   * try/catch 也不 await，任一监听器同步抛错都会中断后续监听器并把异常抛回发射方；
   * registry 的发射点全部位于 install / unload / 状态迁移的主流程上，绝不能被
   * 观察者拖垮。这里做兜底捕获并记 warn（带事件名与插件 id，便于定位坏监听器）。
   *
   * 注意：这层只保护"发射方"。cordis 不会把监听器列表交出来，做不到逐监听器隔离，
   * 因此 **toolkit 自有监听器一律自带异常防御**（见 registry/src/host.ts 头注）。
   */
  private notify(event: string, payload: unknown, pluginId: string): void {
    try {
      this.host.emit(event, payload)
    } catch (error) {
      this.log.warn('事件发射被监听器异常中断（不影响本次操作结果）', {
        pluginId,
        event: 'emit-failed',
        durationMs: 0,
        errorCode: 'emit-failed',
        message: `${event}: ${String((error as Error)?.message ?? error)}`,
      })
    }
  }

  private emitAdded(entry: RegistryEntry): void {
    this.notify(
      contractEventName(this.opts.servicePrefix, 'registry:plugin-added'),
      this.toEntry(entry),
      entry.manifest.id,
    )
  }

  private emitRemoved(id: string): void {
    this.notify(contractEventName(this.opts.servicePrefix, 'registry:plugin-removed'), { id }, id)
  }

  private setStatus(entry: RegistryEntry, to: PluginStatus, reason?: string, error?: { code: string; message: string }): void {
    const from = entry.status
    if (from === to) return
    entry.status = to
    // D-8：`lastError` 是**当前状态**字段，不是历史台账——插件跑到 ACTIVE 就没有可陈
    // 的错误，留着会让面板同屏显示"运行中"+"最近错误 fiber-load-timeout"（E1 实测形态）。
    // 状态源只有这一处（install / autoload 恢复 / setEnabled / reload / 自动重试五条路
    // 都要经过这里），所以清也只在这里清；面板与 /v2/snapshot 都是读取方，不各自缓存。
    // 历史不丢：失败当时已按 REQ-10 发 `audit:*` 并落 JSONL，清掉的只是这个字段。
    if (to === 'active' && entry.lastError !== undefined) delete entry.lastError
    this.notify(
      contractEventName(this.opts.servicePrefix, 'registry:status-changed'),
      {
        id: entry.manifest.id,
        from,
        to,
        ...(reason !== undefined ? { reason } : {}),
        ...(error !== undefined ? { error } : {}),
      },
      entry.manifest.id,
    )
  }

  // ── 查询（ToolkitRegistry 接口）────────────────────────────────────────

  list(): PluginEntry[] {
    return [...this.entries.values()].map((e) => this.toEntry(e))
  }

  get(id: string): PluginEntry | undefined {
    const entry = this.entries.get(id)
    return entry ? this.toEntry(entry) : undefined
  }

  /** 注册面查询（doctor 注册冲突检查用）。 */
  registersOf(id: string): PluginRegisters | undefined {
    return this.entries.get(id)?.registers
  }

  private toEntry(e: RegistryEntry): PluginEntry {
    return {
      manifest: e.manifest,
      status: e.status,
      config: e.config,
      ...(e.lastError !== undefined ? { lastError: e.lastError } : {}),
      ...(e.health !== undefined ? { health: e.health } : {}),
      legacy: e.legacy,
    }
  }

  // ── 互斥 ────────────────────────────────────────────────────────────────

  private withLock<T>(id: string | null, fn: () => Promise<T>): Promise<T> {
    if (id === null) {
      // install 全局互斥：串接在当前链尾（失败不污染链）。
      const run = this.installLock.then(fn, fn)
      this.installLock = run.then(() => undefined, () => undefined)
      return run
    }
    const prev = this.locks.get(id) ?? Promise.resolve()
    const run = prev.then(fn, fn)
    const settled = run.then(() => undefined, () => undefined)
    this.locks.set(id, settled)
    void settled.then(() => {
      if (this.locks.get(id) === settled) this.locks.delete(id)
    })
    return run
  }

  // ── 持久化（REQ-7）──────────────────────────────────────────────────────

  private persist(entry: RegistryEntry | null, id?: string): void {
    if (entry) {
      this.state.plugins[entry.manifest.id] = {
        source: entry.source,
        enabled: entry.status !== 'disabled',
        config: entry.config,
        quarantined: entry.status === 'quarantined',
        ...(entry.lastError !== undefined ? { lastError: entry.lastError } : {}),
      }
    } else if (id) {
      delete this.state.plugins[id]
    }
    const write = () => {
      try {
        saveState(this.opts.statePath, this.state)
        this.lastSave = { ok: true, path: this.opts.statePath, at: Date.now() }
      } catch (error) {
        // H1（债务 D-11 失效模式②）：落盘失败**不许只留一行日志**。修复前面板照常显示
        // active，重启后条目全丢且无从解释——"内存生效、磁盘未落"是分裂态，必须可发现。
        // 这里不引入重试机制（用户裁定：最小可见化即可）；恢复路径是修好落点后重装/重载。
        const message = String((error as Error).message)
        // pluginId 取条目自己的 id（persist(entry) 不带 id 参数），摘除失败才退到 '*'。
        const idOrStar = entry?.manifest.id ?? id ?? '*'
        this.lastSave = {
          ok: false,
          path: this.opts.statePath,
          at: Date.now(),
          error: message,
          advice: [
            `确认状态文件可写：${this.opts.statePath}（当前失败原因：${message}）`,
            '若该路径来自宿主启动目录的推导副作用：给 toolkit-manager 行补 config.toolkitRoot（或 config.registry.statePath）后重启宿主',
            '落点修好之前，当前列表只在内存里——重启后不会自动恢复',
          ],
        }
        this.log.error('状态落盘失败（内存已生效、磁盘未落，重启后本条会丢）', {
          pluginId: idOrStar,
          event: 'state-save-failed',
          durationMs: 0,
          errorCode: 'state-save-failed',
          message,
          statePath: this.opts.statePath,
        })
        // 审计事件（REQ-10）：sink 落不进同一个坏目录时它自己会 warn，不会递归回来。
        this.audit('state-save-failed', idOrStar, 0, 'state-save-failed')
      }
    }
    if (this.opts.saveDebounceMs > 0) {
      if (this.saveTimer) this.timers.clearTimeout(this.saveTimer)
      this.saveTimer = this.timers.setTimeout(write, this.opts.saveDebounceMs)
    } else {
      write()
    }
  }

  private audit(event: AuditEvent, pluginId: string, durationMs: number, errorCode?: string): void {
    this.log.info(`audit ${event}`, { pluginId, event, durationMs, ...(errorCode ? { errorCode } : {}) })
    // 审计事件（REQ-10）：契约事件名之外的前缀化扩展事件，面板订阅展示（P4）。
    this.notify(`${this.opts.servicePrefix}/audit:${event}`, { event, pluginId, durationMs, ...(errorCode ? { errorCode } : {}) }, pluginId)
  }

  /**
   * 写回插件配置（REQ-5 面板配置表单的落点；契约接口之外的实现扩展）。
   * 写回前按插件的 configSchema 真校验（REQ-9 债务 #2：schemastery 调用 /
   * zod safeParse / toJSON JSON 重建，见 contract.validateConfigAgainstSchema）；
   * active 的插件以重载方式应用新配置。
   */
  async setConfig(id: string, config: unknown): Promise<void> {
    await this.withLock(id, async () => {
      const entry = this.entries.get(id)
      if (!entry) throw new Error(`插件不存在：${id}`)
      const schema = entry.manifest.configSchema
        ?? ((entry.pluginObject ?? {}) as Record<string, unknown>)['Config']
        ?? ((entry.pluginObject ?? {}) as Record<string, unknown>)['configSchema']
      const result = await validateConfigAgainstSchema(schema, config)
      if (!result.ok) {
        const error = new Error(`配置未通过 configSchema 校验：${result.issues.map((i) => `${i.path}: ${i.message}`).join('；')}`)
        ;(error as Error & { code?: string }).code = 'value-invalid'
        throw error
      }
      entry.config = config
      this.persist(entry)
      if (entry.fiber && entry.status === 'active') {
        this.unloadEntry(entry)
        await this.loadEntry(entry)
      }
      this.audit('config-changed', id, 0)
    })
  }

  // ── install（REQ-2 流程）────────────────────────────────────────────────

  async install(source: PluginSource, opts?: { force?: boolean }): Promise<InstallResult> {
    return this.withLock(null, async () => {
      const t0 = Date.now()
      // 1. 解析来源（含 legacy 合成）。
      let resolved: ResolvedPlugin
      try {
        resolved = await resolveLocalSource(source)
      } catch (error) {
        return { ok: false, precheck: this.loadFailureReport(error) }
      }
      this.logEntryWarnings(resolved)

      // 2. 预检：注入实现（P3 doctor）优先，缺省用内置契约级预检。
      const precheck: PrecheckReport = this.opts.precheck
        ? await this.opts.precheck(resolved.source, resolved)
        : contractPrecheck({ resolved, idExists: (id) => this.entries.has(id), host: this.host })
      if (!precheck.pass && opts?.force !== true) {
        return { ok: false, precheck }
      }

      const id = resolved.manifest.id
      // 3. 注册（事务顺序：写内存 → 落盘 → 发通知；pluginObject 保持解析原样，不改写）。
      //    persist 先于 emit：emit 期间任何监听器抛错都不会留下"内存有记录、磁盘没记录"
      //    的幻影条目（该条目会永久占住 id，让同 id 重装被 id-conflict 永久拒绝）。
      const entry: RegistryEntry = {
        manifest: resolved.manifest,
        status: 'installed',
        config: this.state.plugins[id]?.config ?? {},
        legacy: resolved.legacy,
        source: resolved.source,
        pluginObject: resolved.plugin,
        registers: resolved.registers,
      }
      this.entries.set(id, entry)
      this.persist(entry)
      this.emitAdded(entry)
      try {
        if (this.state.plugins[id]?.enabled === false) {
          this.setStatus(entry, 'disabled', 'persisted-disabled')
        } else {
          await this.loadEntry(entry)
        }
        this.persist(entry)
        this.audit('installed', id, Date.now() - t0, entry.status === 'active' ? undefined : entry.lastError?.code)
        return { ok: true, entry: this.toEntry(entry) }
      } catch (error) {
        // 注册后的意外错误：回滚注册（REQ-2），并补偿磁盘——内存与磁盘必须同进退。
        this.cancelRetry(entry)
        if (entry.fiber) {
          try { entry.fiber.dispose() } catch { /* D3 */ }
        }
        this.entries.delete(id)
        try {
          this.persist(null, id)
        } catch (persistError) {
          // 补偿失败不覆盖原始错误，但必须显式申报分裂面（磁盘可能仍留该 id）。
          this.log.error('回滚时摘除磁盘记录失败（磁盘可能仍留有该插件记录）', {
            pluginId: id,
            event: 'rollback-persist-failed',
            durationMs: 0,
            errorCode: 'rollback-persist-failed',
            message: String((persistError as Error)?.message ?? persistError),
          })
        }
        this.emitRemoved(id)
        return { ok: false, precheck: this.loadFailureReport(error) }
      }
    })
  }

  private loadFailureReport(error: unknown): PrecheckReport {
    const e = errorOf(error)
    const issues = error instanceof SourceError ? error.issues : undefined
    const blocking = issues && issues.length > 0
      ? issues.map((i) => ({
          code: i.code,
          level: 'error' as const,
          message: `${i.path}: ${i.message}`,
          fix: { summary: '按 message 中的字段路径修正 dsh.plugin.json 对应字段后重装' },
        }))
      : [
          {
            code: e.code,
            level: 'error' as const,
            message: e.message,
            fix: sourceFixAdvice(e.code),
          },
        ]
    return { pass: false, blocking, warnings: [], changes: [], legacyMode: false }
  }

  /**
   * 装载器告警落日志（D-7 三级解析：legacy 入口位置、与正典重复而被忽略的声明）。
   * loader 本身保持纯解析（可单测、可被 doctor.precheck 直接调用而不产生日志副作用），
   * 所以告警随 ResolvedPlugin 带出来，在这里经 A1 同款 warn 通道落盘——不静默丢弃。
   */
  private logEntryWarnings(resolved: ResolvedPlugin): void {
    for (const message of resolved.entryWarnings) {
      this.log.warn(message, {
        pluginId: resolved.manifest.id,
        event: 'entry-declaration',
        durationMs: 0,
        errorCode: 'legacy-entry-declaration',
        message,
      })
    }
  }

  // ── 装入 / 卸出（REQ-6 错误隔离核心）────────────────────────────────────

  private cancelRetry(entry: RegistryEntry): void {
    if (entry.retryHandle) {
      this.timers.clearTimeout(entry.retryHandle)
      entry.retryHandle = undefined
    }
  }

  private async loadEntry(entry: RegistryEntry): Promise<void> {
    this.cancelRetry(entry)
    this.setStatus(entry, 'loading', 'install')
    const t0 = Date.now()
    const fiber = this.host.plugin(entry.pluginObject, entry.config)
    entry.fiber = fiber
    try {
      // 轮询 fiber 状态直到终态（ACTIVE/FAILED/DISPOSED）或超时。
      // UNLOADING 不是终态：它可能收敛到 DISPOSED（被卸载）或回到 LOADING/PENDING
      // （依赖变化触发重载），所以继续轮询，但记下这个事实——超时时的归因要据此
      // 区分"被卸载未收敛"和"依赖缺席装不动"（A2）。
      let settled: { ok: true } | { ok: false; error: Error } | undefined
      let sawUnloading = false
      while (!settled) {
        const state = fiber.state
        if (state === FIBER_ACTIVE) {
          settled = { ok: true }
        } else if (state === FIBER_FAILED) {
          // fiber.await() 会以启动错误 reject（spike 已验证）。
          const captured = await Promise.resolve((fiber as unknown as PromiseLike<unknown>)).then(
            () => undefined,
            (e) => e,
          )
          settled = {
            ok: false,
            error: captured instanceof Error
              ? captured
              : new FiberLoadError('fiber-failed', 'fiber 加载失败（state=FAILED，未取到原始错误）'),
          }
        } else if (state === FIBER_DISPOSED) {
          settled = {
            ok: false,
            error: new FiberLoadError('fiber-disposed', 'fiber 在装入期间被卸载（state=DISPOSED；apply 返回的 Promise 拒绝也会走到这里）'),
          }
        } else {
          if (state === FIBER_UNLOADING) sawUnloading = true
          if (Date.now() - t0 > this.opts.loadTimeoutMs) {
            settled = {
              ok: false,
              error: sawUnloading
                ? new FiberLoadError('fiber-unloading-timeout', `fiber 在装入期间被卸载且未收敛（state=UNLOADING 持续超过 ${this.opts.loadTimeoutMs}ms；非装配慢，是卸载卡在了清理链上）`)
                : new FiberLoadError('fiber-load-timeout', `装入超时（${this.opts.loadTimeoutMs}ms；依赖服务缺席会永久 PENDING）`),
            }
          } else {
            await new Promise<void>((resolve) => this.timers.setTimeout(resolve, POLL_MS))
          }
        }
      }
      if (!settled.ok) throw settled.error
      this.setStatus(entry, 'active', 'loaded')
      this.log.info('plugin loaded', { pluginId: entry.manifest.id, event: 'loaded', durationMs: Date.now() - t0 })
    } catch (error) {
      const e = errorOf(error)
      entry.lastError = { ...e, at: Date.now() }
      if (entry.fiber) {
        try { entry.fiber.dispose() } catch { /* D3 */ }
        entry.fiber = undefined
      }
      // 加载期间被并发卸载/停机接管：不再重试（以接管方为准）。
      if (this.stopped || this.entries.get(entry.manifest.id) !== entry) return
      this.setStatus(entry, 'error', 'load-failed', e)
      this.scheduleRetry(entry)
    }
  }

  private scheduleRetry(entry: RegistryEntry): void {
    // 达到上限 → quarantined（REQ-6）；stopped 后不再重试。
    const attempts = (entry.retryAttempts ?? 0) + 1
    entry.retryAttempts = attempts
    if (attempts > this.opts.retryLimit || this.stopped) {
      if (attempts > this.opts.retryLimit) {
        this.setStatus(entry, 'quarantined', `连续失败 ${attempts - 1} 次达到上限`, entry.lastError)
        this.persist(entry)
        this.audit('quarantined', entry.manifest.id, 0, entry.lastError?.code)
      }
      return
    }
    const delay = this.opts.retryBackoffMs * 2 ** (attempts - 1)
    this.log.warn(`装入失败，${delay}ms 后第 ${attempts}/${this.opts.retryLimit} 次重试`, { pluginId: entry.manifest.id, event: 'retry-scheduled', durationMs: 0, errorCode: entry.lastError?.code })
    entry.retryHandle = this.timers.setTimeout(() => {
      entry.retryHandle = undefined
      void this.withLock(entry.manifest.id, () => this.loadEntry(entry))
    }, delay)
  }

  private unloadEntry(entry: RegistryEntry): void {
    this.cancelRetry(entry)
    if (entry.fiber) {
      try {
        entry.fiber.dispose()
      } catch (error) {
        this.log.error('fiber 卸载失败（继续，不阻断）', { pluginId: entry.manifest.id, event: 'dispose-failed', durationMs: 0, errorCode: 'dispose-failed', message: String((error as Error).message) })
      }
      entry.fiber = undefined
    }
    entry.retryAttempts = 0
  }

  // ── uninstall / setEnabled / reload（REQ-2 真实生效 + 持久化）───────────

  async uninstall(id: string): Promise<void> {
    await this.withLock(id, async () => {
      const entry = this.entries.get(id)
      if (!entry) throw new Error(`插件不存在：${id}`)
      this.unloadEntry(entry)
      this.entries.delete(id)
      this.persist(null, id)
      this.emitRemoved(id)
      this.audit('removed', id, 0)
    })
  }

  async setEnabled(id: string, on: boolean): Promise<void> {
    await this.withLock(id, async () => {
      const entry = this.entries.get(id)
      if (!entry) throw new Error(`插件不存在：${id}`)
      if (on) {
        if (entry.status === 'disabled' || entry.status === 'error' || entry.status === 'quarantined') {
          entry.retryAttempts = 0
          await this.loadEntry(entry)
        }
      } else {
        this.unloadEntry(entry)
        this.setStatus(entry, 'disabled', 'disabled-by-user')
      }
      this.persist(entry)
      this.audit(on ? 'enabled' : 'disabled', id, 0)
    })
  }

  async reload(id: string): Promise<void> {
    await this.withLock(id, async () => {
      const entry = this.entries.get(id)
      if (!entry) throw new Error(`插件不存在：${id}`)
      this.unloadEntry(entry)
      entry.retryAttempts = 0
      await this.loadEntry(entry)
      this.persist(entry)
      this.audit('reloaded', id, 0)
    })
  }

  // ── autoload（REQ-7）────────────────────────────────────────────────────

  private async autoload(): Promise<void> {
    const loaded = loadState(this.opts.statePath)
    if (loaded.error) this.log.warn('状态文件损坏，按空状态启动', { pluginId: '*', event: 'state-corrupt', durationMs: 0, errorCode: 'state-corrupt', message: loaded.error.message })
    this.state = loaded.state
    for (const [id, record] of Object.entries(this.state.plugins)) {
      if (!record.enabled) continue
      await this.withLock(id, async () => {
        if (this.entries.has(id)) return
        const entry: RegistryEntry = {
          manifest: { id, displayName: id, version: '0.0.0', contract: '^1.0' },
          status: 'installed',
          config: record.config,
          legacy: false,
          source: record.source,
          ...(record.lastError !== undefined ? { lastError: record.lastError } : {}),
        }
        this.entries.set(id, entry)
        try {
          const resolved = await resolveLocalSource(record.source)
          entry.manifest = resolved.manifest
          entry.legacy = resolved.legacy
          entry.pluginObject = resolved.plugin
          this.logEntryWarnings(resolved)
        } catch (resolveError) {
          const e = errorOf(resolveError)
          entry.lastError = { ...e, at: Date.now() }
          this.emitAdded(entry)
          this.setStatus(entry, 'error', 'autoload-resolve-failed', e)
          this.log.error('autoload 解析失败', { pluginId: id, event: 'autoload-failed', durationMs: 0, errorCode: e.code, message: e.message })
          return
        }
        this.emitAdded(entry)
        await this.loadEntry(entry)
        // D-8：恢复成功时 lastError 已在 setStatus('active') 处清掉，但磁盘记录是
        // 从旧 state 读进来的，不同步回写就会留下"盘上有、内存无"的陈旧错误（A1 口径：
        // 内存与磁盘同进退）。persist 经 saveDebounceMs 合并，逐插件调用只落一次盘。
        this.persist(entry)
      })
    }
  }

  /** 健康报告写入口（P3 doctor 使用；P2 仅透传存储）。 */
  setHealth(id: string, report: HealthReport): void {
    const entry = this.entries.get(id)
    if (entry) entry.health = report
  }

  /**
   * 最近一次状态落盘的结果（H1 / 债务 D-11；实现扩展，不在 `ToolkitRegistry` 契约面上，
   * 调用方按"有此方法则读"处理，缺省视为可写）。`ok:false` 携带路径与可执行建议，
   * 供面板如实呈现"运行中但未落盘"。写成功会自行翻回 `ok:true`（不引入重试）。
   */
  stateSaveStatus(): { ok: boolean; path: string; at?: number; error?: string; advice?: string[] } {
    return this.lastSave
  }
}
