// 审计事件落盘（REQ-10 / 债务 #4 的持久化半边）。
//
// 范围克制：registry 已经发 `${servicePrefix}/audit:<event>` 事件（面板实时 toast 展示 = 另半边，
// P6 已交付）。这里只补"事后可查"的最小面：把审计事件按行追加成 JSONL，落在**状态文件同目录**
// （与安装记录同生命周期、同前缀命名空间，不新开状态源）。
//
// 红线（REQ-10 / 禁止事项 §9）：只写可观测字段（时间/事件/插件 id/耗时/错误码）。
// **绝不写配置内容、绝不写环境变量值**——审计面泄密是最容易犯的错，故白名单式取字段。
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname } from 'node:path'
import { AUDIT_EVENTS } from '../../contract/dist/index.js'

/** 单档轮转阈值：超过即把当前文件挪成 `<file>.1`（覆盖旧的）。 */
export const AUDIT_MAX_BYTES = 2 * 1024 * 1024

function safeFields(payload) {
  const p = payload && typeof payload === 'object' ? payload : {}
  return {
    pluginId: typeof p.pluginId === 'string' ? p.pluginId : null,
    durationMs: typeof p.durationMs === 'number' ? p.durationMs : null,
    ...(typeof p.errorCode === 'string' && p.errorCode !== '' ? { errorCode: p.errorCode } : {}),
  }
}

/**
 * @param {object} opts
 * @param {string} opts.servicePrefix  实例前缀（事件名命名空间）
 * @param {string} opts.file           JSONL 落盘绝对路径
 * @param {(name:string, cb:Function)=>Function} opts.on  事件订阅（ctx.on 形态，返回 disposer）
 * @param {{warn?:Function}} [opts.logger]
 * @returns {{ok:boolean, file:string, error?:string, advice?:string[], dispose:()=>void}}
 */
export function createAuditSink({ servicePrefix, file, on, logger = console }) {
  // H1（债务 D-11 失效模式①）：装配期建目录**不许裸抛**。修复前这一句没有 try/catch，
  // 于是"审计落点恰好不可写"会顺着 createToolkitServices → 面板 apply() 一路炸上去，
  // 整个管理面板装不上（实测形态：宿主以 C:\Windows\System32 为工作目录启动时，
  // 落点被推导成 C:\Windows\.registry）。审计没落是缺陷，面板装不上是事故。
  try {
    mkdirSync(dirname(file), { recursive: true })
  } catch (error) {
    const reason = String(error && error.message ? error.message : error)
    return {
      ok: false,
      file,
      error: reason,
      advice: [
        `确认审计落点可写：${file}（当前失败原因：${reason}）`,
        '临时绕行：给 toolkit-manager 行 config.registry.auditFile 填一个绝对可写路径（或 auditLog:false 显式关闭并知晓后果）后重启宿主',
      ],
      dispose() {},
    }
  }
  const disposers = AUDIT_EVENTS.map((event) =>
    on(`${servicePrefix}/audit:${event}`, (payload) => {
      const line = JSON.stringify({ at: Date.now(), event, ...safeFields(payload) }) + '\n'
      try {
        if (statSync(file).size > AUDIT_MAX_BYTES) renameSync(file, file + '.1')
      } catch {
        /* 文件还不存在：首次 append 会创建 */
      }
      try {
        appendFileSync(file, line, 'utf8')
      } catch (error) {
        // 审计落盘失败不得影响被审计的操作
        logger.warn?.(`audit sink 写入失败：${String(error && error.message || error)}`)
      }
    }),
  )
  let disposed = false
  return {
    ok: true,
    file,
    dispose() {
      if (disposed) return
      disposed = true
      for (const d of disposers) {
        try {
          d()
        } catch {
          /* 订阅已失效 */
        }
      }
    },
  }
}
