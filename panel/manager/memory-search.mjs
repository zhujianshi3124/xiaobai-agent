// S4 F-37 记忆检索路由（C1-007 批1-3 批准；设计正本 docs/f37-search-design-c1-007.md §B/§C3）
//
// 职责：`GET {base}/v2/memory/search` 的 handler——解析参数、惰性探测消费 agent-memory 库的
// searchMemory（红线 1 合规通道：运行时 try-catch ＋ 动态 import；禁静态 import、禁 eager
// re-export）、按 §C3 五条降级形态应答（降级不 5xx，卡面如实说明）。
//
// 为什么收在本文件：v2-api.mjs 的纪律是「只依赖注入的 registry/doctor/subscribe——零具体
// 子插件模块 import」，本文件是全仓唯一挂登记豁免的惰性探测通道（scripts/p4-no-subplugin-
// import-check.mjs 的 LAZY_PROBE_EXEMPTIONS；随批呈协调侧备案，可否决）。本文件不碰任何
// 记忆正本——searchMemory 的派生缓存写面（<dataRoot>/search/）是批2 批准的独立写面。
//
// 三铁规（设计 §B3）：只读（检索不改任何记忆文件）；零外传（全链只读本机文件、零 fetch、
// 零遥测——本文件不得出现 fetch）；移交制维持（检索绝不自动注入新会话、不自动选候选，
// 卡底固定句在两套渲染器逐字钉，见 panel/client/index.js 与 panel/client/panel.html）。

export const MEMORY_SEARCH_ROUTE_PATH = '/v2/memory/search'

/** 卡面/应答文案（设计 §五批准原文；两渲染器与路由应答三方逐字同步） */
export const SEARCH_COPY = {
  /** 降级（agent-memory 缺席/装载失败） */
  libAbsent: 'agent-memory 不在位，检索暂不可用。记忆台账功能本身不受影响。',
  /** 降级（数据根不可读；<reason> 由服务端点名成因后替换） */
  rootUnreadable: '记忆数据根不可读（<reason>）。检索暂不可用，记忆正本不受影响。',
}

/**
 * 惰性加载 agent-memory 库入口（红线 1 通道本体）。
 * 独立文件注入（deps.loadSearchMemory）仅供测试覆盖同一条 catch 路径。
 */
function defaultLoadSearchMemory() {
  return import('../../lib/agent-memory/lib/index.js')
}

/** 从 URL 取 q/limit/workspace 原始参数；参数政策单一来源＝searchMemory（notices 如实回带）。 */
function paramsOf(url) {
  return {
    q: url.searchParams.get('q') ?? '',
    limit: url.searchParams.get('limit') ?? undefined,
    workspace: url.searchParams.get('workspace') ?? undefined,
  }
}

/**
 * @param {string} V2 v2 路由基址（与 v2-api.mjs 同源派生）
 * @param {object} [deps] 测试注入口
 * @param {() => Promise<function>} [deps.loadSearchMemory] 覆盖惰性加载（同一条 catch 路径）
 * @returns {{ method: 'GET', path: string, handler: Function, change: false }}
 */
export function createMemorySearchHandler(V2, deps = {}) {
  const loadSearchMemory = deps.loadSearchMemory ?? defaultLoadSearchMemory
  const handler = async (request, response) => {
    const url = new URL(request.url || '/', 'http://x')
    const { q, limit, workspace } = paramsOf(url)
    const send = (payload) => {
      response.writeHead(200, { 'cache-control': 'no-store', 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify(payload))
    }
    // 惰性探测（红线 1）：lib 缺席（单拿出去用的桶形态）/装载失败 ⇒ 200＋available:false（§C3 第 2 行）
    let searchMemory
    try {
      const mod = await loadSearchMemory()
      searchMemory = mod.searchMemory
      if (typeof searchMemory !== 'function') throw new Error('searchMemory 导出不在位')
    } catch {
      send({ ok: true, available: false, reason: SEARCH_COPY.libAbsent })
      return
    }
    // 数据根不可读/registry 损坏等根级故障 ⇒ 200＋available:false（§C3 第 3 行；reason 点名成因）
    try {
      const out = searchMemory(undefined, { q, limit, workspace })
      send({
        ok: true,
        available: true,
        q: out.q,
        results: out.results,
        unreadable: out.unreadable,
        sessions: out.sessions,
        notices: out.notices,
        elapsedMs: out.elapsedMs,
      })
    } catch (err) {
      send({ ok: true, available: false, reason: SEARCH_COPY.rootUnreadable.replace('<reason>', String(err?.message ?? err)) })
    }
  }
  return { method: 'GET', path: `${V2}${MEMORY_SEARCH_ROUTE_PATH}`, handler, change: false }
}
