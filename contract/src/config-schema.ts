/**
 * configSchema 真校验（REQ-3 §11 / REQ-9；P5 债务 #2 清偿）。
 *
 * 支持三种 Schema 形态（项目现状并存）：
 *   1. schemastery Schema 实例（可调用；`Schema(config)` 即校验并解析）
 *   2. zod Schema（`.safeParse`）
 *   3. schemastery toJSON 的 uid/refs JSON（经动态 import schemastery 重建后校验；
 *      contract 保持零静态依赖——重建失败则降级为跳过并说明）
 *
 * 全部只读：仅校验，不修改插件配置。
 */

export interface ConfigSchemaIssue {
  path: string
  message: string
}

export interface ConfigSchemaResult {
  ok: boolean
  issues: ConfigSchemaIssue[]
  /** 校验方式（诊断用）。 */
  via: 'schemastery-call' | 'zod-safeparse' | 'schemastery-json' | 'skipped'
}

function issue(path: string, message: string): ConfigSchemaIssue {
  return { path, message }
}

/** 对外入口：尽力真校验；无法执行校验的形态返回 ok（结构级已由契约校验覆盖）。 */
export async function validateConfigAgainstSchema(schema: unknown, config: unknown): Promise<ConfigSchemaResult> {
  if (schema === undefined || schema === null) {
    return { ok: true, issues: [], via: 'skipped' }
  }

  // 1. schemastery / 其他可调用 Schema：调用即校验。
  if (typeof schema === 'function') {
    try {
      ;(schema as (c: unknown) => unknown)(config)
      return { ok: true, issues: [], via: 'schemastery-call' }
    } catch (error) {
      return {
        ok: false,
        issues: [issue('config', String((error as Error)?.message ?? error))],
        via: 'schemastery-call',
      }
    }
  }

  // 2. zod：safeParse。
  if (typeof schema === 'object' && typeof (schema as { safeParse?: unknown }).safeParse === 'function') {
    const result = (schema as { safeParse: (c: unknown) => { success: boolean; error?: { issues: Array<{ path: Array<string | number | symbol>; message: string }> } } }).safeParse(config)
    if (result.success) return { ok: true, issues: [], via: 'zod-safeparse' }
    return {
      ok: false,
      issues: (result.error?.issues ?? []).map((i) => issue(
        i.path.length ? i.path.map(String).join('.') : 'config',
        i.message,
      )),
      via: 'zod-safeparse',
    }
  }

  // 3. schemastery 简单定义 JSON（P5 起的落盘形态：dsh.plugin.json 的 configSchema 字段，
  //    {type:'object', dict:{...}} / {type:'array', inner} / {type:'union', list} ...）：
  //    动态重建为可调用 Schema 后校验。
  if (typeof schema === 'object' && typeof (schema as { type?: unknown }).type === 'string') {
    try {
      const mod = (await import('@deepseek-ai/schemastery')) as { default: (def: unknown) => unknown }
      const built = mod.default(schema)
      return validateConfigAgainstSchema(built, config)
    } catch (error) {
      return {
        ok: true,
        issues: [issue('config', `schemastery 构建失败，已跳过真校验：${String((error as Error).message)}`)],
        via: 'skipped',
      }
    }
  }

  // 4. schemastery toJSON 的 uid/refs JSON（运行时 Schema 实例序列化产物）：重建后校验。
  if (typeof schema === 'object' && (schema as { uid?: unknown }).uid !== undefined && (schema as { refs?: unknown }).refs !== undefined) {
    try {
      const mod = (await import('@deepseek-ai/schemastery')) as { default: (def: unknown) => unknown }
      const rebuilt = mod.default(schema)
      return validateConfigAgainstSchema(rebuilt, config)
    } catch (error) {
      return {
        ok: true,
        issues: [issue('config', `schemastery 重建失败，已跳过真校验：${String((error as Error).message)}`)],
        via: 'skipped',
      }
    }
  }

  return { ok: true, issues: [], via: 'skipped' }
}
