// P4：v2 管理 API 路由工厂（REQ-5「真管理」）。
//
// 纪律（用户要求 1/3）：
//  - 只依赖注入的 registry / doctor / subscribe——零具体子插件模块 import；
//  - 所有管理操作走 registry API：confirm 必须逐字等于插件 id；失败一律
//    { ok:false, code, error }；不提供任何绕过 registry 的状态改写通道。
//
// 路由经 panel/index.js 的 guard（loopback+配对+CSRF）包一层后注册到 webServer；
// 测试可直接用返回的 handler 挂到裸 http server 上。

// 注意：panel/ 是嵌套包（@local/dsh-toolkit/panel），对父包名的自引用不可用，
// 共享模块（contract/registry/doctor）一律相对路径引用其构建产物。
import { AUDIT_EVENTS, contractHttpBase, normalizeServicePrefix } from '../../contract/dist/index.js'

const ERROR_STATUS = {
  'plugin-unknown': 400,
  'confirm-missing': 400,
  'body-too-large': 413,
  'body-invalid-json': 400,
  'value-invalid': 400,
  'source-error': 400,
  internal: 500,
}

function statusFor(code) {
  return ERROR_STATUS[code] || 400
}

function readJsonBody(request, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        const e = new Error('请求体过大（上限 64 KiB）')
        e.code = 'body-too-large'
        reject(e)
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (raw === '') {
        resolve({})
        return
      }
      try {
        const parsed = JSON.parse(raw)
        resolve(parsed && typeof parsed === 'object' ? parsed : {})
      } catch {
        const e = new Error('请求体不是合法 JSON')
        e.code = 'body-invalid-json'
        reject(e)
      }
    })
    request.on('error', reject)
  })
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

function requireConfirm(body, id) {
  const confirm = String(body.confirm ?? '')
  if (!id || confirm !== id) {
    const e = new Error('知情确认未完成：confirm 必须逐字输入插件 id ' + id)
    e.code = 'confirm-missing'
    throw e
  }
}

function registryErrorToCode(error) {
  const message = String(error?.message ?? error)
  if (message.includes('插件不存在')) return 'plugin-unknown'
  return 'internal'
}

/** configSchema 的可序列化视图：函数型 Schema 走 toJSON，纯对象直出，其余 null。 */
/**
 * schemastery v3 的 toJSON() 会输出 refs 间接引用形态（{uid, refs}：dict 值/inner/list
 * 元素是 ref id 而非内联定义）。面板递归表单只认内联定义——此处统一解引用（T0：
 * 真实插件 dsh-repo-spec 的 Config 即此形态，不解引用配置表单整块空白）。
 */
function dereferenceSchemaJSON(json) {
  if (!json || typeof json !== 'object' || !json.refs || typeof json.uid === 'undefined') return json
  const refs = json.refs
  const resolve = (node, seen) => {
    if (typeof node === 'number') {
      if (seen.has(node)) return undefined
      const def = refs[node]
      if (!def || typeof def !== 'object') return undefined
      return expand(def, new Set([...seen, node]))
    }
    if (node && typeof node === 'object' && !Array.isArray(node)) return expand(node, seen)
    return undefined
  }
  const expand = (def, seen) => {
    const out = { ...def }
    if (out.dict && typeof out.dict === 'object') {
      const dict = {}
      for (const key of Object.keys(out.dict)) {
        const r = resolve(out.dict[key], seen)
        if (r) dict[key] = r
      }
      out.dict = dict
    }
    if ('inner' in out) {
      const r = resolve(out.inner, seen)
      if (r) out.inner = r
      else delete out.inner
    }
    if (Array.isArray(out.list)) out.list = out.list.map((v) => resolve(v, seen)).filter(Boolean)
    return out
  }
  return resolve(json.uid, new Set()) || json
}

function schemaToJSON(schema) {
  if (schema === undefined || schema === null) return null
  if (typeof schema === 'function' && typeof schema.toJSON === 'function') {
    try {
      return dereferenceSchemaJSON(schema.toJSON())
    } catch {
      return null
    }
  }
  if (typeof schema === 'object') return dereferenceSchemaJSON(schema)
  return null
}

function entryView(entry) {
  return {
    id: entry.manifest.id,
    displayName: entry.manifest.displayName,
    version: entry.manifest.version,
    contract: entry.manifest.contract,
    status: entry.status,
    legacy: entry.legacy,
    config: entry.config,
    lastError: entry.lastError ?? null,
    health: entry.health ?? null,
    healthSummary: entry.health
      ? {
          status: entry.health.status,
          errors: entry.health.items.filter((i) => i.level === 'error').length,
          warnings: entry.health.items.filter((i) => i.level === 'warn').length,
        }
      : null,
    configSchemaJSON: schemaToJSON(entry.manifest.configSchema),
    hasHealthCheck: typeof entry.manifest.healthCheck === 'function',
    panels: entry.manifest.panels ?? [],
  }
}

/**
 * @param {object} deps
 * @param {object} deps.registry   ToolkitRegistryCore 实例
 * @param {object} deps.doctor     DoctorService 实例
 * @param {string} deps.servicePrefix
 * @param {(event: string, cb: (payload: unknown) => void) => () => void} deps.subscribe
 *        订阅带前缀事件，返回取消函数。
 */
export function createV2Api(deps) {
  const { registry, doctor, servicePrefix, subscribe, auditFile } = deps
  // P7 嵌入（REQ-8）：v2 管理面（含 SSE /events 与 connector.js）的路由基址从 servicePrefix
  // 派生，与面板服务名/事件名同源；缺省前缀下恰等于历史值 /api/toolkit-panel/v2（URL 零变化）。
  const V2 = `${contractHttpBase(normalizeServicePrefix(servicePrefix))}/v2`

  // ── SSE（Q3 裁决：事件流；断连由客户端 connector 降级轮询）──────────────
  // SSE event 名用短名（去 registry:/doctor: 段）：客户端 addEventListener 对齐，
  // 前缀信息由 hello 帧的 servicePrefix 携带。
  const SSE_EVENT_NAMES = [
    'plugin-added',
    'plugin-removed',
    'status-changed',
    'health-changed',
    'issue-found',
    ...AUDIT_EVENTS.map((a) => `audit:${a}`),
  ]
  const SSE_SHORT_NAME = {
    'plugin-added': 'registry:plugin-added',
    'plugin-removed': 'registry:plugin-removed',
    'status-changed': 'registry:status-changed',
    'health-changed': 'registry:health-changed',
    'issue-found': 'doctor:issue-found',
  }

  function handleEvents(request, response) {
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    })
    // 最小 mock 响应（无 write/on，如 smoke 的 res 桩）：gate 已验证，流本身不可用——直接返回
    if (typeof response.write !== 'function' || typeof response.on !== 'function') {
      response.end()
      return
    }
    response.write(`retry: 2000\n\n`)
    response.write(`event: hello\ndata: ${JSON.stringify({ servicePrefix, at: Date.now() })}\n\n`)

    const disposers = SSE_EVENT_NAMES.map((short) => {
      const full = SSE_SHORT_NAME[short] ?? short
      return subscribe(`${servicePrefix}/${full}`, (payload) => {
        try {
          response.write(`event: ${short}\ndata: ${JSON.stringify(payload ?? null)}\n\n`)
        } catch {
          // 连接已断：由 close 分支统一清理
        }
      })
    })
    // 心跳仅在真实响应对象（有 .on）上启动——最小 mock（smoke/测试）不留悬挂定时器
    let heartbeat = null
    if (typeof response.on === 'function') {
      heartbeat = setInterval(() => {
        try {
          response.write(`: ping ${Date.now()}\n\n`)
        } catch {
          // ignore
        }
      }, 15000)
    }
    const cleanup = () => {
      if (heartbeat !== null) clearInterval(heartbeat)
      for (const d of disposers) {
        try {
          d()
        } catch {
          // ignore
        }
      }
    }
    if (typeof response.on === 'function') {
      response.on('close', cleanup)
      response.on('error', cleanup)
    }
  }

  // ── 路由 ────────────────────────────────────────────────────────────────

  const json = (handler) => async (request, response) => {
    try {
      await handler(request, response)
    } catch (error) {
      const code = error?.code || registryErrorToCode(error)
      sendJson(response, statusFor(code), { ok: false, code, error: String(error?.message ?? error) })
    }
  }

  const withBody = (fn) => async (request, response) => {
    const body = await readJsonBody(request)
    await fn(body, response)
  }

  const snapshot = json(async (request, response) => {
    const plugins = registry.list().map(entryView)
    sendJson(response, 200, {
      ok: true,
      servicePrefix,
      doctorAvailable: doctor !== undefined && doctor !== null,
      // 审计落盘位置（债务 #4）：让"事后可查"这件事可被发现；面板内历史浏览仍是显式遗留项
      ...(auditFile ? { auditFile } : {}),
      plugins,
    })
  })

  const health = json(async (request, response) => {
    const id = String(new URL(request.url || "/", "http://x").searchParams.get("id") ?? "")
    const entry = registry.get(id)
    if (!entry) throw Object.assign(new Error(`插件不存在：${id}`), { code: "plugin-unknown" })
    sendJson(response, 200, { ok: true, id, report: entry.health ?? null, history: doctor.history(id) })
  })

  const installPrecheck = json(
    withBody(async (body, response) => {
      const source = body.source
      if (!source || typeof source !== 'object' || !source.kind) {
        throw Object.assign(new Error('缺少 source（{ kind, path|spec }）'), { code: 'value-invalid' })
      }
      const precheck = await doctor.precheck(source)
      sendJson(response, 200, { ok: true, precheck })
    }),
  )

  const installConfirm = json(
    withBody(async (body, response) => {
      const source = body.source
      if (!source || typeof source !== 'object' || !source.kind) {
        throw Object.assign(new Error('缺少 source（{ kind, path|spec }）'), { code: 'value-invalid' })
      }
      const result = await registry.install(source, { force: body.force === true })
      if (result.ok) {
        sendJson(response, 200, { ok: true, entry: entryView(result.entry) })
      } else {
        // 阻断/失败不抛：预检报告整体下发（REQ-5 安装向导第 2 步）
        sendJson(response, 200, { ok: false, precheck: result.precheck })
      }
    }),
  )

  const uninstall = json(
    withBody(async (body, response) => {
      const id = String(body.id ?? '')
      requireConfirm(body, id)
      await registry.uninstall(id)
      sendJson(response, 200, { ok: true, removed: id })
    }),
  )

  const setEnabled = json(
    withBody(async (body, response) => {
      const id = String(body.id ?? '')
      requireConfirm(body, id)
      if (typeof body.enabled !== 'boolean') {
        throw Object.assign(new Error('enabled 必须是布尔'), { code: 'value-invalid' })
      }
      await registry.setEnabled(id, body.enabled)
      sendJson(response, 200, { ok: true, entry: entryView(registry.get(id)) })
    }),
  )

  const reload = json(
    withBody(async (body, response) => {
      const id = String(body.id ?? '')
      requireConfirm(body, id)
      await registry.reload(id)
      sendJson(response, 200, { ok: true, entry: entryView(registry.get(id)) })
    }),
  )

  const setConfig = json(
    withBody(async (body, response) => {
      const id = String(body.id ?? '')
      requireConfirm(body, id)
      if (!('config' in body)) {
        throw Object.assign(new Error('缺少 config'), { code: 'value-invalid' })
      }
      await registry.setConfig(id, body.config)
      sendJson(response, 200, { ok: true, entry: entryView(registry.get(id)) })
    }),
  )

  const routes = [
    { method: 'GET', path: `${V2}/snapshot`, handler: snapshot, change: false },
    { method: 'GET', path: `${V2}/health`, handler: health, change: false },
    { method: 'POST', path: `${V2}/install/precheck`, handler: installPrecheck, change: false },
    { method: 'POST', path: `${V2}/install/confirm`, handler: installConfirm, change: true },
    { method: 'POST', path: `${V2}/uninstall`, handler: uninstall, change: true },
    { method: 'POST', path: `${V2}/enabled`, handler: setEnabled, change: true },
    { method: 'POST', path: `${V2}/reload`, handler: reload, change: true },
    { method: 'POST', path: `${V2}/config`, handler: setConfig, change: true },
    { method: 'GET', path: `${V2}/events`, handler: handleEvents, change: false },
  ]

  return { routes, V2, entryView, schemaToJSON }
}

/** 面板路由形态适配：v2 路由 → webServer exact 路由（handler 内做方法校验）。 */
export function toPanelRoutes(routes) {
  return routes.map(({ method, path, handler, change }) => ({
    kind: 'exact',
    path,
    method, // 保留给测试与诊断（webServer 注册本身只看 kind/path/handler）
    change,
    handler: async (request, response) => {
      if (request.method !== method) {
        response.writeHead(405, { allow: method })
        response.end()
        return
      }
      await handler(request, response)
    },
  }))
}
