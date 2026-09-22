/**
 * manifest 与模块导出的运行时校验（REQ-1）。
 *
 * 要求：校验失败必须给出精确错误定位——字段路径 + 期望 + 实际，供
 * precheck 报告（REQ-3）直接引用。所有 message 面向人，path 面向机器。
 *
 * 与存量 dsh.plugin.json 的关系：迁移期（REQ-9）内，KNOWN_LEGACY_FIELDS
 * 里的旧字段被容忍并作为 info 问题返回（不参与 ok 判定）；除此之外的
 * 未知顶层字段按 error 处理，防止拼错字段名静默失效。
 */

import type { DshSubPluginManifest, PanelDescriptor } from './types.js'
import { isValidRange, isValidSemver, versionSatisfies } from './semver.js'
import { PLUGIN_CONTRACT_VERSION } from './types.js'

export type IssueSeverity = 'error' | 'info'

export interface ManifestIssue {
  /** 点分字段路径，数组用 [i]，如 `requires.ports[2].port`。 */
  path: string
  code: 'required' | 'type' | 'format' | 'value' | 'unknown-field'
  severity: IssueSeverity
  message: string
  /** 期望的形式（面向人的描述）。 */
  expected?: string | undefined
  /** 实际收到的值（安全序列化，截断）。 */
  actual?: string | undefined
}

export type ManifestValidation =
  | { ok: true; manifest: DshSubPluginManifest; errors: []; info: ManifestIssue[] }
  | { ok: false; manifest: null; errors: ManifestIssue[]; info: ManifestIssue[] }

/** 迁移期容忍的存量 dsh.plugin.json 字段（REQ-9 完成后收紧为 error）。 */
export const KNOWN_LEGACY_FIELDS = [
  'manifestVersion',
  'name',
  'requirements',
  'registers',
  'exports',
  'aliases',
  'optionalDeps',
  'requiredAliases',
] as const

const KNOWN_CONTRACT_FIELDS = new Set([
  'id',
  'displayName',
  'version',
  'contract',
  'requires',
  'provides',
  'configSchema',
  'panels',
  'healthCheck',
])

/** `provides` 的封闭三槽（契约 v1.1 定稿；events 故意不在内，见 docs/contract.md §2.1 末）。 */
const PROVIDES_SLOTS = ['services', 'commands', 'providers'] as const

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}\/[a-z0-9][a-z0-9-]{0,63}$/
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

function actualOf(value: unknown): string {
  const text = typeof value === 'string' ? JSON.stringify(value) : String(value)
  return text.length > 80 ? text.slice(0, 77) + '...' : text
}

function issue(
  path: string,
  code: ManifestIssue['code'],
  severity: IssueSeverity,
  message: string,
  expected?: string,
  actual?: unknown,
): ManifestIssue {
  return { path, code, severity, message, expected, actual: actual === undefined ? undefined : actualOf(actual) }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 校验 manifest（JSON 形态，healthCheck/configSchema/panels 可缺席）。 */
export function validateManifest(input: unknown): ManifestValidation {
  const errors: ManifestIssue[] = []
  const info: ManifestIssue[] = []

  if (!isObject(input)) {
    return {
      ok: false,
      manifest: null,
      info,
      errors: [issue('', 'type', 'error', 'manifest 必须是对象', 'object', input)],
    }
  }

  for (const key of Object.keys(input)) {
    if (KNOWN_CONTRACT_FIELDS.has(key)) continue
    if ((KNOWN_LEGACY_FIELDS as readonly string[]).includes(key)) {
      info.push(
        issue(key, 'unknown-field', 'info', `存量字段 "${key}" 在迁移期被容忍（REQ-9 完成后须移除或映射进契约字段）`),
      )
      continue
    }
    errors.push(issue(key, 'unknown-field', 'error', `未知顶层字段 "${key}"（拼错字段名会静默失效，予以拒绝）`))
  }

  // id：命名空间式 <scope>/<name>
  const id = input['id']
  if (id === undefined) {
    errors.push(issue('id', 'required', 'error', '缺少必填字段 id', '<scope>/<name> 形式的全局唯一 id'))
  } else if (typeof id !== 'string' || !ID_RE.test(id)) {
    errors.push(
      issue('id', 'format', 'error', 'id 必须是命名空间式小写 id：<scope>/<name>（各段小写字母数字与连字符）', 'dsh/rate-throttle 形式', id),
    )
  }

  // displayName
  const displayName = input['displayName']
  if (displayName === undefined) {
    errors.push(issue('displayName', 'required', 'error', '缺少必填字段 displayName', '非空字符串'))
  } else if (typeof displayName !== 'string' || displayName.trim() === '') {
    errors.push(issue('displayName', 'type', 'error', 'displayName 必须是非空字符串', 'string', displayName))
  }

  // version：semver
  const version = input['version']
  if (version === undefined) {
    errors.push(issue('version', 'required', 'error', '缺少必填字段 version', 'semver，如 1.0.0'))
  } else if (typeof version !== 'string' || !isValidSemver(version)) {
    errors.push(issue('version', 'format', 'error', 'version 必须是合法 semver', '1.2.3 / 1.2.3-rc.1', version))
  }

  // contract：semver 范围
  const contract = input['contract']
  if (contract === undefined) {
    errors.push(issue('contract', 'required', 'error', '缺少必填字段 contract', '契约版本范围，如 ^1.0'))
  } else if (typeof contract !== 'string' || !isValidRange(contract)) {
    errors.push(issue('contract', 'format', 'error', 'contract 必须是合法 semver 范围', '^1.0 / >=1.0 <2.0.0', contract))
  } else if (!versionSatisfies(PLUGIN_CONTRACT_VERSION, contract)) {
    errors.push(
      issue('contract', 'value', 'error', `contract 范围必须兼容当前契约版本 ${PLUGIN_CONTRACT_VERSION}`, '范围须放行 1.0.0，如 ^1.0', contract),
    )
  }

  // requires
  const requires = input['requires']
  if (requires !== undefined) {
    if (isObject(requires)) {
      validateRequirements(requires, errors)
    } else {
      errors.push(issue('requires', 'type', 'error', 'requires 必须是对象', 'object', requires))
    }
  }

  // provides：提供面（契约 v1.1 · C-1 第 1 项）。三槽皆可选的非空字符串数组；
  // 未知子键与顶层未知字段同口径拒绝——拼错槽位名会静默失效（不设"容忍多余键"的口子）。
  const provides = input['provides']
  if (provides !== undefined) {
    if (!isObject(provides)) {
      errors.push(issue('provides', 'type', 'error', 'provides 必须是对象（{services?, commands?, providers?}）', 'object', provides))
    } else {
      for (const slot of PROVIDES_SLOTS) {
        const list = provides[slot]
        if (list === undefined) continue
        if (!Array.isArray(list)) {
          errors.push(issue(`provides.${slot}`, 'type', 'error', `provides.${slot} 必须是字符串数组`, 'string[]', list))
          continue
        }
        list.forEach((name: unknown, i: number) => {
          if (typeof name !== 'string' || name.trim() === '') {
            errors.push(issue(`provides.${slot}[${i}]`, 'type', 'error', `provides.${slot}[${i}] 必须是非空字符串`, 'string', name))
          }
        })
      }
      for (const key of Object.keys(provides)) {
        if ((PROVIDES_SLOTS as readonly string[]).includes(key)) continue
        if (key === 'events') {
          errors.push(
            issue(
              'provides.events',
              'unknown-field',
              'error',
              'provides 不设 events 槽：事件订阅面写在 `requirements.registers.events`（本仓无事件发出方，2026-09-22 裁定采甲）',
              'requirements.registers.events',
              provides['events'],
            ),
          )
          continue
        }
        errors.push(
          issue(`provides.${key}`, 'unknown-field', 'error', `provides 未知子字段 "${key}"（拼错槽位名会静默失效，予以拒绝）`, PROVIDES_SLOTS.join(' | '), key),
        )
      }
    }
  }

  // configSchema：JSON manifest 里可缺席；出现时必须是 Schema 对象（object/function）
  const configSchema = input['configSchema']
  if (configSchema !== undefined && !isObject(configSchema) && typeof configSchema !== 'function') {
    errors.push(issue('configSchema', 'type', 'error', 'configSchema 必须是 Schema 对象或构造函数（schemastery 体系）', 'object | function', configSchema))
  }

  // panels
  const panels = input['panels']
  if (panels !== undefined) {
    if (Array.isArray(panels)) {
      panels.forEach((p, i) => {
        if (!isObject(p)) {
          errors.push(issue(`panels[${i}]`, 'type', 'error', 'panel 描述符必须是对象', 'object', p))
          return
        }
        const pid = p['id']
        if (typeof pid !== 'string' || pid.trim() === '') {
          errors.push(issue(`panels[${i}].id`, 'type', 'error', 'panel id 必须是非空字符串', 'string', pid))
        }
      })
    } else {
      errors.push(issue('panels', 'type', 'error', 'panels 必须是数组', 'PanelDescriptor[]', panels))
    }
  }

  // healthCheck：JSON manifest 不应出现（函数无法落盘）；出现非函数即错
  const healthCheck = input['healthCheck']
  if (healthCheck !== undefined && typeof healthCheck !== 'function') {
    errors.push(
      issue('healthCheck', 'type', 'error', 'healthCheck 必须是函数；JSON manifest 不携带它（放到插件模块导出）', 'function | 缺席', healthCheck),
    )
  }

  if (errors.length > 0) {
    return { ok: false, manifest: null, errors, info }
  }
  const manifest = input as unknown as DshSubPluginManifest
  return { ok: true, manifest, errors: [], info }
}

function validateRequirements(requires: Record<string, unknown>, errors: ManifestIssue[]): void {
  const rangeFields: [string, string][] = [
    ['dshRuntime', 'DSH 运行时版本范围'],
    ['node', 'node 版本范围'],
  ]
  for (const [key, label] of rangeFields) {
    const v = requires[key]
    if (v === undefined) continue
    if (typeof v !== 'string' || !isValidRange(v)) {
      errors.push(issue(`requires.${key}`, 'format', 'error', `${label}必须是合法 semver 范围`, '>=0.1.2-rc.1 <0.2.0 形式', v))
    }
  }

  const stringArrayFields = ['services', 'subPlugins'] as const
  for (const key of stringArrayFields) {
    const v = requires[key]
    if (v === undefined) continue
    if (!Array.isArray(v)) {
      errors.push(issue(`requires.${key}`, 'type', 'error', `${key} 必须是字符串数组`, 'string[]', v))
      continue
    }
    v.forEach((x, i) => {
      if (typeof x !== 'string' || x === '') {
        errors.push(issue(`requires.${key}[${i}]`, 'type', 'error', `${key} 条目必须是非空字符串`, 'string', x))
      } else if (key === 'subPlugins' && !ID_RE.test(x)) {
        errors.push(issue(`requires.subPlugins[${i}]`, 'format', 'error', 'subPlugins 条目必须是命名空间式插件 id', 'dsh/rate-throttle 形式', x))
      }
    })
  }

  const envVars = requires['envVars']
  if (envVars !== undefined) {
    if (Array.isArray(envVars)) {
      envVars.forEach((e, i) => {
        if (!isObject(e)) {
          errors.push(issue(`requires.envVars[${i}]`, 'type', 'error', 'envVars 条目必须是对象', 'object', e))
          return
        }
        const key = e['key']
        if (typeof key !== 'string' || !ENV_KEY_RE.test(key)) {
          errors.push(
            issue(`requires.envVars[${i}].key`, 'format', 'error', '环境变量名必须形如 VARIABLE_NAME（字母数字下划线，不以数字开头）', 'MY_VAR', key),
          )
        }
        if (typeof e['required'] !== 'boolean') {
          errors.push(issue(`requires.envVars[${i}].required`, 'type', 'error', 'required 必须是布尔', 'boolean', e['required']))
        }
      })
    } else {
      errors.push(issue('requires.envVars', 'type', 'error', 'envVars 必须是数组', 'ManifestEnvVar[]', envVars))
    }
  }

  const binaries = requires['binaries']
  if (binaries !== undefined) {
    if (Array.isArray(binaries)) {
      binaries.forEach((b, i) => {
        if (!isObject(b)) {
          errors.push(issue(`requires.binaries[${i}]`, 'type', 'error', 'binaries 条目必须是对象', 'object', b))
          return
        }
        if (typeof b['name'] !== 'string' || b['name'] === '') {
          errors.push(issue(`requires.binaries[${i}].name`, 'type', 'error', '二进制名必须是非空字符串', 'string', b['name']))
        }
        const min = b['minVersion']
        if (min !== undefined && (typeof min !== 'string' || !isValidSemver(min))) {
          errors.push(issue(`requires.binaries[${i}].minVersion`, 'format', 'error', 'minVersion 必须是合法 semver', '1.2.3', min))
        }
      })
    } else {
      errors.push(issue('requires.binaries', 'type', 'error', 'binaries 必须是数组', 'ManifestBinary[]', binaries))
    }
  }

  const ports = requires['ports']
  if (ports !== undefined) {
    if (Array.isArray(ports)) {
      ports.forEach((p, i) => {
        if (!isObject(p)) {
          errors.push(issue(`requires.ports[${i}]`, 'type', 'error', 'ports 条目必须是对象', 'object', p))
          return
        }
        const port = p['port']
        if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) {
          errors.push(issue(`requires.ports[${i}].port`, 'value', 'error', '端口必须是 1–65535 的整数', '1..65535', port))
        }
        const proto = p['protocol']
        if (proto !== undefined && proto !== 'tcp' && proto !== 'udp') {
          errors.push(issue(`requires.ports[${i}].protocol`, 'value', 'error', 'protocol 只能是 tcp 或 udp', "'tcp' | 'udp'", proto))
        }
        const shared = p['shared']
        if (shared !== undefined && typeof shared !== 'boolean') {
          errors.push(issue(`requires.ports[${i}].shared`, 'type', 'error', 'shared 必须是布尔', 'boolean', shared))
        }
      })
    } else {
      errors.push(issue('requires.ports', 'type', 'error', 'ports 必须是数组', 'ManifestPort[]', ports))
    }
  }

  const fsPaths = requires['fsPaths']
  if (fsPaths !== undefined) {
    if (Array.isArray(fsPaths)) {
      fsPaths.forEach((f, i) => {
        if (!isObject(f)) {
          errors.push(issue(`requires.fsPaths[${i}]`, 'type', 'error', 'fsPaths 条目必须是对象', 'object', f))
          return
        }
        if (typeof f['path'] !== 'string' || f['path'] === '') {
          errors.push(issue(`requires.fsPaths[${i}].path`, 'type', 'error', 'path 必须是非空字符串', 'string', f['path']))
        }
        const access = f['access']
        if (access !== 'r' && access !== 'rw') {
          errors.push(issue(`requires.fsPaths[${i}].access`, 'value', 'error', "access 只能是 'r' 或 'rw'", "'r' | 'rw'", access))
        }
      })
    } else {
      errors.push(issue('requires.fsPaths', 'type', 'error', 'fsPaths 必须是数组', 'ManifestFsPath[]', fsPaths))
    }
  }

  const apis = requires['externalApis']
  if (apis !== undefined) {
    if (Array.isArray(apis)) {
      apis.forEach((a, i) => {
        if (!isObject(a)) {
          errors.push(issue(`requires.externalApis[${i}]`, 'type', 'error', 'externalApis 条目必须是对象', 'object', a))
          return
        }
        if (typeof a['name'] !== 'string' || a['name'] === '') {
          errors.push(issue(`requires.externalApis[${i}].name`, 'type', 'error', 'externalApi name 必须是非空字符串', 'string', a['name']))
        }
        const url = a['url']
        if (url !== undefined) {
          if (typeof url !== 'string') {
            errors.push(issue(`requires.externalApis[${i}].url`, 'type', 'error', 'url 必须是字符串', 'https://…', url))
          } else {
            try {
              const parsed = new URL(url)
              if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
                errors.push(issue(`requires.externalApis[${i}].url`, 'format', 'error', 'url 协议必须是 http(s)', 'https://…', url))
              }
            } catch {
              errors.push(issue(`requires.externalApis[${i}].url`, 'format', 'error', 'url 必须是合法 URL', 'https://…', url))
            }
          }
        }
        const authEnv = a['authEnv']
        if (authEnv !== undefined && (typeof authEnv !== 'string' || !ENV_KEY_RE.test(authEnv))) {
          errors.push(issue(`requires.externalApis[${i}].authEnv`, 'format', 'error', 'authEnv 必须是环境变量名（只声明名字，不出现值）', 'MY_API_KEY', authEnv))
        }
      })
    } else {
      errors.push(issue('requires.externalApis', 'type', 'error', 'externalApis 必须是数组', 'ManifestExternalApi[]', apis))
    }
  }
}

// ── 模块导出（运行时绑定）校验 ────────────────────────────────────────────

/**
 * 校验插件模块的契约函数型导出。JSON manifest 与模块导出的分工：
 * manifest 携带静态事实；configSchema（Schema 对象）、panels、healthCheck
 * （函数）由模块导出携带。两处同时出现时以模块导出为准（P4 面板消费）。
 */
export function validateModuleExports(exportsObj: unknown): ManifestIssue[] {
  const issues: ManifestIssue[] = []
  if (exportsObj === undefined || exportsObj === null) return issues
  if (!isObject(exportsObj) && typeof exportsObj !== 'function') {
    issues.push(issue('', 'type', 'error', '模块导出必须是对象或函数（cordis 插件形态）', 'object | function', exportsObj))
    return issues
  }
  const rec = exportsObj as Record<string, unknown>
  const schema = rec['configSchema']
  if (schema !== undefined && !isObject(schema) && typeof schema !== 'function') {
    issues.push(issue('configSchema', 'type', 'error', 'configSchema 导出必须是 Schema 对象或构造函数', 'object | function', schema))
  }
  const panels = rec['panels']
  if (panels !== undefined) {
    if (!Array.isArray(panels)) {
      issues.push(issue('panels', 'type', 'error', 'panels 导出必须是数组', 'PanelDescriptor[]', panels))
    } else {
      panels.forEach((p: unknown, i: number) => {
        const desc = p as PanelDescriptor
        if (!isObject(desc) || typeof desc['id'] !== 'string' || desc['id'] === '') {
          issues.push(issue(`panels[${i}]`, 'type', 'error', '每个 panel 描述符必须是有非空 id 的对象', '{ id: string }', p))
        }
      })
    }
  }
  const healthCheck = rec['healthCheck']
  if (healthCheck !== undefined && typeof healthCheck !== 'function') {
    issues.push(issue('healthCheck', 'type', 'error', 'healthCheck 导出必须是函数', '(ctx) => Promise<HealthItem[]>', healthCheck))
  }
  return issues
}
