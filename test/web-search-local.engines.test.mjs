// R3 · 搜索引擎点名受部署名单约束（落差条目 F-81 / F-82，令面高危②）
//
// 缺陷面：`ENGINES` 是"能力表"（8 项，含 sogou 与 360），`cfg.engines` 是"部署事实"（本仓 patch
// 只配 6 项）。旧实现的点名合法性只比 `ENGINES` ⇒ 模型显式 `engine:'360'` 能绕过部署名单真打外网。
// 本文件钉的是修复后的语义：**点名的对照面从"能力表"换成"部署名单"**，且
//   ① 越界点名必须拒、且**一次网络请求都不发出**（fetch 桩做观测面计数）；
//   ② 部署内点名与不点名的自动链**零回归**（反向钉，防"把两个引擎写死禁用"式偷懒实现骗过测试）；
//   ③ 错误文案不再把 8 项全列为 known（F-82）。
//
// 全部走真实入口 `runSearch`：模块里的 engineList/requestedEngines/layerList 是内部函数，
// 为了不给这份 MIT 外来件多加导出面（开源前处置见 docs/repair-plan-20260923.md §9.4 过裁三.6），
// 这里一律从外部行为取证。fetch 桩与真实 fetch 的响应面贴形（status / headers.get / arrayBuffer，
// 见 lib/web-search-local/index.js#directRequest 与 #readBytes 的取用方式），且 proxyUrl='off'、
// skipWithoutProxy=[] ⇒ 不碰代理、不探本地端口。
import test from 'node:test'
import assert from 'node:assert/strict'
import pluginDefault, { runSearch, defaultConfig } from '../lib/web-search-local/index.js'

// 与 cordis.patch.yml 的 web-search-local.config.engines 同值（判据基准 e8051fe9，本文件不读它、
// 只在 §"部署面"里复述；改 patch 时这条要跟着改，属 R3 的显式耦合点）
const DEPLOYED = ['searxng', 'google', 'duckduckgo', 'mojeek', 'bing', 'baidu']

const HOST_OF = {
  searxng: 'searxng.test',
  google: 'google.com',
  duckduckgo: 'duckduckgo.com',
  mojeek: 'mojeek.com',
  bing: 'bing.com',
  baidu: 'baidu.com',
  sogou: 'sogou.com',
  '360': 'so.com',
}

const realFetch = globalThis.fetch
let attempted = []

function stubFetch() {
  attempted = []
  globalThis.fetch = async (url) => {
    attempted.push(String(url))
    const bytes = new TextEncoder().encode('<html><head><title>stub</title></head><body>no results</body></html>')
    return {
      status: 200,
      headers: {
        get(name) {
          const key = String(name).toLowerCase()
          if (key === 'content-type') return 'text/html; charset=utf-8'
          return null
        },
      },
      arrayBuffer: async () => bytes.buffer,
    }
  }
}

function restoreFetch() {
  globalThis.fetch = realFetch
}

function testCfg(overrides) {
  return {
    ...defaultConfig(),
    engines: DEPLOYED,
    searxngBaseUrl: '',
    proxyUrl: 'off',
    skipWithoutProxy: [],
    engineMinIntervalMs: 0,
    engineCooldownMs: 0,
    engineRetryCooldownMs: 0,
    ...overrides,
  }
}

async function expectWebError(fn) {
  try {
    await fn()
  } catch (error) {
    return error
  }
  return null
}

function hostsTouched() {
  return attempted.join(' | ')
}

// ── 越界点名：必须拒 + 零网络 ────────────────────────────────────────────────────
test('R3 · 点名未部署的 sogou ⇒ 拒绝且一次网络请求都不发出', async () => {
  stubFetch()
  try {
    const error = await expectWebError(() => runSearch({ query: 'test', engine: 'sogou' }, testCfg(), null))
    assert.ok(error, '应抛出 WebError')
    assert.equal(error.code, 'WEB_PROVIDER_ERROR')
    assert.match(error.message, /not deployed/)
    assert.equal(attempted.length, 0, '越界点名不得发出任何请求，实发: ' + hostsTouched())
  } finally {
    restoreFetch()
  }
})

test('R3 · 点名未部署的 360（字符串形态）⇒ 同样拒绝且零请求', async () => {
  stubFetch()
  try {
    const error = await expectWebError(() => runSearch({ query: 'test', engine: '360' }, testCfg(), null))
    assert.ok(error && /not deployed/.test(error.message), '实得: ' + String(error && error.message))
    assert.equal(attempted.length, 0)
  } finally {
    restoreFetch()
  }
})

test('R3 · 点名 360 的 YAML 裸数字形态 ⇒ 归一后仍按"未部署"拒（不是"未知引擎"）', async () => {
  stubFetch()
  try {
    const error = await expectWebError(() => runSearch({ query: 'test', engines: [360] }, testCfg(), null))
    assert.ok(error, '应抛出 WebError')
    assert.match(error.message, /not deployed/, '数字引擎名必须走同一条部署判定: ' + error.message)
    assert.doesNotMatch(error.message, /unknown search engine/, '归一后它是已知的、只是没部署')
    assert.equal(attempted.length, 0)
  } finally {
    restoreFetch()
  }
})

test('R3 · 混含"已部署 + 未部署"⇒ 整体拒绝，不放行其中已部署那半', async () => {
  stubFetch()
  try {
    const error = await expectWebError(() => runSearch({ query: 'test', engines: ['bing', 'sogou'] }, testCfg(), null))
    assert.ok(error && /not deployed/.test(error.message), '实得: ' + String(error && error.message))
    assert.equal(attempted.length, 0, '部分放行等于绕过部署名单，实发: ' + hostsTouched())
  } finally {
    restoreFetch()
  }
})

test('R3 · 真未知名（能力表里就没有）⇒ 仍报 unknown，语义不被新闸门吞掉', async () => {
  stubFetch()
  try {
    const error = await expectWebError(() => runSearch({ query: 'test', engine: 'yandex' }, testCfg(), null))
    assert.ok(error && /unknown search engine/.test(error.message), '实得: ' + String(error && error.message))
    assert.equal(attempted.length, 0)
  } finally {
    restoreFetch()
  }
})

test('R3 · 越界文案点名"未部署"并列出部署名单（F-82：不再把 8 项全列为 known）', async () => {
  stubFetch()
  try {
    const error = await expectWebError(() => runSearch({ query: 'test', engine: 'sogou' }, testCfg(), null))
    const listed = String(error && error.message)
    for (const name of DEPLOYED) assert.ok(listed.includes(name), '文案须列出部署项 ' + name + '，实得: ' + listed)
    assert.equal(listed.includes('sogou, ') || listed.includes(', sogou)'), false,
      '部署名单里不该出现 sogou：' + listed)
    assert.ok(!/known: searxng, google, duckduckgo, mojeek, bing, baidu, sogou, 360/.test(listed),
      '旧文案把能力表 8 项当 known，必须改掉：' + listed)
  } finally {
    restoreFetch()
  }
})

// ── 反向钉：部署面放行、自动链零回归 ─────────────────────────────────────────────
test('R3 · 点名已部署的 bing ⇒ 放行并真的走到该引擎（闸不误伤）', async () => {
  stubFetch()
  try {
    await runSearch({ query: 'test', engine: 'bing' }, testCfg(), null)
    assert.ok(attempted.length >= 1, '部署内点名应发出请求')
    assert.ok(hostsTouched().includes(HOST_OF.bing), '实发: ' + hostsTouched())
  } finally {
    restoreFetch()
  }
})

test('R3 · 反向对照：把 sogou 真写进部署名单 ⇒ 点名它必须放行（证明闸比的是部署面，不是硬禁两项）', async () => {
  stubFetch()
  try {
    const cfg = testCfg({ engines: [...DEPLOYED, 'sogou'] })
    const error = await expectWebError(() => runSearch({ query: 'test', engine: 'sogou' }, cfg, null))
    assert.ok(!error || !/not deployed/.test(error.message), '已部署却仍被拒说明是硬禁：' + String(error && error.message))
    assert.ok(attempted.length >= 1, '应走到 sogou，实发: ' + hostsTouched())
    assert.ok(hostsTouched().includes(HOST_OF.sogou), '实发: ' + hostsTouched())
  } finally {
    restoreFetch()
  }
})

test('R3 · 不点名 ⇒ 自动链只打部署的 6 项，sogou/360 零出现（存量行为零变化）', async () => {
  stubFetch()
  try {
    await runSearch({ query: 'test' }, testCfg(), null)
    const all = hostsTouched()
    assert.ok(!all.includes(HOST_OF.sogou), '自动链不得打 sogou: ' + all)
    assert.ok(!all.includes('https://www.so.com'), '自动链不得打 360: ' + all)
    assert.ok(attempted.length >= 1, '自动链应有请求发出')
  } finally {
    restoreFetch()
  }
})

test('R3 · searxng 由 searxngBaseUrl 推入部署面 ⇒ 点名 searxng 放行（交集口径含 base-URL 半边）', async () => {
  stubFetch()
  try {
    const cfg = testCfg({ engines: ['bing'], searxngBaseUrl: 'http://searxng.test' })
    const error = await expectWebError(() => runSearch({ query: 'test', engine: 'searxng' }, cfg, null))
    assert.ok(!error || !/not deployed/.test(error.message), '实得: ' + String(error && error.message))
    assert.ok(attempted.length >= 1, '应走到 searxng，实发: ' + hostsTouched())
  } finally {
    restoreFetch()
  }
})

// ── 模型可见名单与点名闸同源（F-82 的"会教模型去点未部署引擎"那半）─────────────────
// 直驱 plugin.apply()，ctx 只给到本用例需要的 seam；不给 inject ⇒ settings 分支自动跳过。
function stubCtxForTool(config) {
  const seen = { tools: [], sections: [] }
  const ctx = {
    get(name) {
      if (name === 'tools') return { register: (tool) => { seen.tools.push(tool) } }
      if (name === 'systemPrompt') return { section: (sec) => { seen.sections.push(sec) } }
      throw new Error('不该被摸到的 seam: ' + name)
    },
    effect: (gen) => { gen().next() }, // 跑到首个 yield（注册发生在这里面）即停
    web: {
      registerSearchProvider: () => () => {},
      registerFetchProvider: () => () => {},
    },
  }
  pluginDefault.apply(ctx, config)
  return seen
}

function allToolText(seen) {
  const tool = seen.tools.find((t) => t.name === 'web_search_engine')
  assert.ok(tool, 'web_search_engine 工具应被注册')
  // dsh 的 tools.register 参数面是扁平映射（parameters: { query: {...}, engine: {...} }），
  // 不是 JSON Schema 的 parameters.properties 形状 —— 按真实形状取数。
  const params = Object.values(tool.parameters)
    .map((p) => String(p?.description ?? '')).join(' | ')
  return [tool.description, params, ...seen.sections.map((s) => String(s.text))].join(' || ')
}

test('R3 · 工具描述与 systemPrompt 段只列部署的引擎（不再把能力表 8 项教给模型）', () => {
  const seen = stubCtxForTool({ engines: DEPLOYED, searxngBaseUrl: '', proxyUrl: 'off' })
  const text = allToolText(seen)
  for (const name of ['bing', 'baidu', 'google']) {
    assert.ok(text.includes(name), '部署项 ' + name + ' 应出现在模型可见名单里：' + text)
  }
  assert.ok(!text.includes('sogou'), '未部署的 sogou 不得再出现在模型可见名单里：' + text)
  assert.ok(!/360/.test(text), '未部署的 360 不得再出现在模型可见名单里：' + text)
})

test('R3 · 同源反向钉：部署名单里加了 sogou ⇒ 模型可见名单随之出现它（证明名单真由部署面生成）', () => {
  const seen = stubCtxForTool({ engines: [...DEPLOYED, 'sogou'], searxngBaseUrl: '', proxyUrl: 'off' })
  const text = allToolText(seen)
  assert.ok(text.includes('sogou'), '已部署却不上名单 = 名单是另一份硬编码：' + text)
})
