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
  /**
   * ★16（批 5）：`verified=false` 表示**这次根本没有执行到校验**（无 schema、形态不认识、
   * schemastery 构建/重建失败）。它和 `ok` 是两件事：`ok` 回答"有没有发现不合法"，
   * `verified` 回答"这句话是谁验过的"。降级不再靠 `ok:true` 冒充"已校验通过"。
   */
  verified: boolean
}

function issue(path: string, message: string): ConfigSchemaIssue {
  return { path, message }
}

/** ③④ 重建结果的可用性判据：拿不到"能执行校验的东西"就算降级，不递归进"无 schema ⇒ 通过"那一支。 */
function isUsableSchema(value: unknown): boolean {
  if (typeof value === 'function') return true
  return typeof value === 'object' && value !== null
    && typeof (value as { safeParse?: unknown }).safeParse === 'function'
}

/**
 * 对外入口：尽力真校验。
 * 返回值三分：① 校验跑过且不合法 ⇒ `ok:false / verified:true`；② 校验跑过且合法 ⇒
 * `ok:true / verified:true`；③ **没跑成校验** ⇒ `verified:false`，其中"本该能验却没验成"
 * （形态不认识、schemastery 构建/重建失败）一并 `ok:false`（fail-closed，调用方必须看见），
 * 只有"本来就没有 schema 可验"才 `ok:true`。
 */
export async function validateConfigAgainstSchema(schema: unknown, config: unknown): Promise<ConfigSchemaResult> {
  if (schema === undefined || schema === null) {
    return { ok: true, issues: [], via: 'skipped', verified: false }
  }

  // 1. schemastery / 其他可调用 Schema：调用即校验。
  if (typeof schema === 'function') {
    try {
      ;(schema as (c: unknown) => unknown)(config)
      return { ok: true, issues: [], via: 'schemastery-call', verified: true }
    } catch (error) {
      return {
        ok: false,
        issues: [issue('config', String((error as Error)?.message ?? error))],
        via: 'schemastery-call',
        verified: true,
      }
    }
  }

  // 2. zod：safeParse。
  if (typeof schema === 'object' && typeof (schema as { safeParse?: unknown }).safeParse === 'function') {
    const result = (schema as { safeParse: (c: unknown) => { success: boolean; error?: { issues: Array<{ path: Array<string | number | symbol>; message: string }> } } }).safeParse(config)
    if (result.success) return { ok: true, issues: [], via: 'zod-safeparse', verified: true }
    return {
      ok: false,
      issues: (result.error?.issues ?? []).map((i) => issue(
        i.path.length ? i.path.map(String).join('.') : 'config',
        i.message,
      )),
      via: 'zod-safeparse',
      verified: true,
    }
  }

  // 3. schemastery 简单定义 JSON（P5 起的落盘形态：dsh.plugin.json 的 configSchema 字段，
  //    {type:'object', dict:{...}} / {type:'array', inner} / {type:'union', list} ...）：
  //    动态重建为可调用 Schema 后校验。
  if (typeof schema === 'object' && typeof (schema as { type?: unknown }).type === 'string') {
    try {
      const mod = (await import('@deepseek-ai/schemastery')) as { default: (def: unknown) => unknown }
      const built = mod.default(schema)
      if (!isUsableSchema(built)) {
        return {
          ok: false,
          issues: [issue('config', `schemastery 构建结果不可执行校验（得到 ${built === null ? 'null' : typeof built}）⇒ 未执行校验`)],
          via: 'skipped',
          verified: false,
        }
      }
      return validateConfigAgainstSchema(built, config)
    } catch (error) {
      return {
        // ★16：过去这里返回 ok:true（只把原因塞进 issues），两个只看 ok 的调用方因此
        // 认为"配置已验证"⇒ schemastery 不可用时任意配置都能写回。降级即未通过。
        ok: false,
        issues: [issue('config', `schemastery 构建失败，未能执行真校验：${String((error as Error).message)}`)],
        via: 'skipped',
        verified: false,
      }
    }
  }

  // 4. schemastery toJSON 的 uid/refs JSON（运行时 Schema 实例序列化产物）：重建后校验。
  if (typeof schema === 'object' && (schema as { uid?: unknown }).uid !== undefined && (schema as { refs?: unknown }).refs !== undefined) {
    try {
      const mod = (await import('@deepseek-ai/schemastery')) as { default: (def: unknown) => unknown }
      const rebuilt = mod.default(schema)
      if (!isUsableSchema(rebuilt)) {
        return {
          ok: false,
          issues: [issue('config', `schemastery 重建结果不可执行校验（得到 ${rebuilt === null ? 'null' : typeof rebuilt}）⇒ 未执行校验`)],
          via: 'skipped',
          verified: false,
        }
      }
      return validateConfigAgainstSchema(rebuilt, config)
    } catch (error) {
      return {
        ok: false,
        issues: [issue('config', `schemastery 重建失败，未能执行真校验：${String((error as Error).message)}`)],
        via: 'skipped',
        verified: false,
      }
    }
  }

  // 5. 有 schema 但形态认不出来 ⇒ 同样**不是"通过"**（★16：静默放行是同一类谎称）。
  return {
    ok: false,
    issues: [issue('config', `无法识别的 configSchema 形态（既不是可调用 Schema、也没有 safeParse、`
      + `也不是 {type} 纯定义或 {uid,refs} toJSON）⇒ 未执行校验`)],
    via: 'skipped',
    verified: false,
  }
}
