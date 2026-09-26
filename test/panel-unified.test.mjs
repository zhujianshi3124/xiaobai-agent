// P6 归一面板测试：唯一 toolkit-panel 标签页同时承载 registry 通用管理区（V2Section）
// 与 patch 域工具区（P2.4 资产）。用「可重渲染」假 react 驱动**真实 client bundle**
// （与 p22-cards-ui 同族，但支持 setState 重渲 + useEffect deps 语义，可走完整交互流）：
//   1) 归一结构（管理区 + 工具区同页可达）
//   2) 免刷新自适应（SSE plugin-added → 新卡片自动出现，连接器不重建）
//   3) 安装向导 E2E（真实 v2 API + 真实 registry + 本地路径夹具）
//   4) 启停 confirm E2E（勾选确认 → registry 真实生效）
//   5) 健康详情（items+fix 渲染；拉取失败降级提示）
//   6) 数据面降级容错（registry 快照失败 → 本区降级、工具区照常）
//   7) 内联孪生 connector 双路径（断连降级轮询 / 恢复切回 / 命名事件直达）
import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtempSync, rmSync, writeFileSync, unlinkSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'

import { ToolkitRegistryCore, cordisHost } from '@local/dsh-toolkit/registry'
import { createDoctor } from '@local/dsh-toolkit/doctor'
import { createV2Api, toPanelRoutes } from '../panel/manager/v2-api.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixtureDir = (name) => join(root, 'test', 'fixtures', 'registry', name)
const contractPlugin = fixtureDir('contract-plugin')
// D-10：本文件独占的夹具开关（见 registry.test.mjs 里同一条注释）。
const markerPath = join(tmpdir(), `dsh-fixture-marker-${process.pid}-panel-unified`)
process.env.FIXTURE_MARKER = markerPath
process.on('exit', () => { try { unlinkSync(markerPath) } catch { /* 已清 */ } })
function setMarker(exists) {
  if (exists) writeFileSync(markerPath, '', 'utf8')
  else if (existsSync(markerPath)) unlinkSync(markerPath)
}

// ── 客户端工装已抽出为共享 helper（树工具 / 假 react / EventSource 替身 / fetch 路由 / 挂载 / 面板桩）──
import { textOf, findAll, text, buttonOf, pluginPathInput, makeReact, FakeES, makeRouter, flush, mountUnifiedPanel, patchSnapshotPayload, v2SnapshotPayload, v2Entry, baseRoutes } from './helpers/panel-client-harness.mjs'

// ── 真实 v2 API 服务器（registry/doctor 服务真身，与 panel-v2 同构）─────────
function fakeProbes() {
  return {
    nodeVersion: () => '24.19.0',
    dshVersion: () => '0.1.5-rc.1',
    hasEnv: () => true,
    hasBinary: () => true,
    portFree: async () => true,
    fsAccessible: async () => true,
    apiReachable: async () => true,
    hasService: () => false,
  }
}
async function makeV2Stack(t) {
  const tmp = mkdtempSync(join(tmpdir(), 'panel-unified-'))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const ctx = new Context()
  const registry = new ToolkitRegistryCore(cordisHost(ctx), {
    servicePrefix: 'toolkit',
    statePath: join(tmp, 'state.json'),
    retryBackoffMs: 1,
    loadTimeoutMs: 250,
    autoload: false,
  })
  const doc = createDoctor(ctx, { servicePrefix: 'toolkit', watchInterval: 0, probes: fakeProbes() }, registry)
  registry.setPrecheck((source) => doc.doctor.precheck(source))
  const v2 = createV2Api({
    registry,
    doctor: doc.doctor,
    servicePrefix: 'toolkit',
    subscribe: (name, cb) => {
      const disposer = ctx.on(name, cb)
      return () => { try { disposer() } catch { /* noop */ } }
    },
  })
  const routes = toPanelRoutes(v2.routes)
  const server = http.createServer(async (request, response) => {
    const path = request.url.split('?')[0]
    const route = routes.find((r) => r.path === path)
    if (!route) { response.writeHead(404); response.end(); return }
    if (request.method !== route.method) { response.writeHead(405, { allow: route.method }); response.end(); return }
    await route.handler(request, response)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  t.after(() => { doc.stop(); void registry.stop(); server.close() })
  return { registry, doctor: doc.doctor, base }
}

// ═══════════════════════════════════════════════════════════════════════════
test('归一结构：toolkit-panel 主标签页同时承载 registry 管理区与 patch 工具区', async () => {
  const router = makeRouter()
  baseRoutes(router)
  router.routes.push({
    match: '/api/toolkit-panel/v2/snapshot',
    handler: () => ({ status: 200, json: async () => v2SnapshotPayload([
      v2Entry('legacy/legacy-one', { legacy: true, status: 'active' }),
      v2Entry('fixture/with-schema', {
        configSchemaJSON: { type: 'object', dict: { region: { type: 'string', meta: { required: true } }, retries: { type: 'number' } } },
      }),
    ]) }),
  })
  const panel = mountUnifiedPanel({ router })
  try {
    await panel.done()
    // P6 退役断言：对外仅此一个标签页（v2 过渡 tab 已删除）
    assert.equal(panel.registrations.length, 1, '仅注册一个标签页')
    assert.equal(panel.registrations[0].meta.id, 'toolkit-panel')
    const t1 = text(panel.tree)
    // ── 管理区（V2Section）
    assert.ok(t1.includes('插件管理（registry · 自适应）'), '管理区标题')
    assert.ok(t1.includes('安装新插件（仅本地插件目录）'), '安装向导入口（第五步 UX：标题写明只收本地插件目录）')
    assert.ok(t1.includes('只接受本地插件目录的') && t1.includes('绝对路径'), '安装向导帮助文案点名绝对路径（第五步 UX）')
    assert.ok(t1.includes('数据源：registry/doctor 服务与事件流'), '数据源行')
    assert.ok(t1.includes('legacy 模式'), 'legacy 标注')
    assert.ok(t1.includes('legacy/legacy-one'), 'registry 卡片渲染')
    assert.ok(t1.includes('健康：未知'), '健康摘要行')
    for (const label of ['停用', '重载', '卸载', '健康详情', '配置']) {
      assert.ok(buttonOf(panel.tree, label), '卡片操作按钮：「' + label + '」')
    }
    // ── configSchema 纯定义表单：点开第二张卡（with-schema）的「配置」后渲染
    const cfgBtns = findAll(panel.tree, (n) => n.type === 'button' && textOf(n).join('') === '配置')
    assert.equal(cfgBtns.length, 2, '两张 registry 卡各带配置入口')
    cfgBtns[0].props.onClick()
    await panel.done()
    assert.ok(text(panel.tree).includes('插件未声明 configSchema'), '无 schema 卡：降级说明（不崩）')
    cfgBtns[1].props.onClick()
    await panel.done()
    const tForm = text(panel.tree)
    assert.ok(tForm.includes('region：'), 'schema 表单字段 region')
    assert.ok(tForm.includes('retries：'), 'schema 表单字段 retries')
    assert.ok(tForm.includes('必填'), '必填标注')
    assert.ok(tForm.includes('保存配置（写回 registry）'), '保存入口')
    // ── patch 工具区（P2.4 资产原样保留）
    assert.ok(t1.includes('内置插件工具区（patch 域 · 开关 / 参数 / 卸载恢复）'), '工具区标题')
    assert.ok(t1.includes('第一层 · 配置文件（patch-row.disabled）'), '两层开关（层一）')
    assert.ok(t1.includes('第二层 · 插件内部（config.enabled）'), '两层开关（层二）')
    assert.ok(t1.includes('卸载 / 恢复'), 'P2.4 卸载/恢复入口')
    assert.ok(t1.includes('操作台（可执行项 · 确认一次改一处）'), '体检操作台')
    assert.ok(t1.includes('配置文件原文（cordis.patch.yml · 插件开关所在）'), 'patch 原文')
  } finally {
    panel.dispose()
  }
})

test('免刷新自适应：SSE plugin-added → 新插件卡片自动出现（连接器不重建、零代码改动）', async () => {
  const router = makeRouter()
  baseRoutes(router)
  let entries = [v2Entry('fixture/first')]
  router.routes.push({
    match: '/api/toolkit-panel/v2/snapshot',
    handler: () => ({ status: 200, json: async () => v2SnapshotPayload(entries) }),
  })
  const panel = mountUnifiedPanel({ router })
  try {
    await panel.done()
    assert.ok(text(panel.tree).includes('fixture/first'), '初始 1 张卡片')
    assert.ok(!text(panel.tree).includes('fixture/second'), '初始无第 6 插件')
    const esCount = FakeES.instances.length
    assert.equal(esCount, 1, '恰好一条 SSE 连接')

    // 「装入第 6 个插件」：快照更新 + 服务端事件推送——面板不刷新、不重挂载
    entries = entries.concat([v2Entry('fixture/second')])
    FakeES.instances[0].fire('plugin-added', { data: JSON.stringify({ id: 'fixture/second' }) })
    await panel.done()
    assert.ok(text(panel.tree).includes('fixture/first') && text(panel.tree).includes('fixture/second'), '新插件卡片自动出现')
    assert.equal(FakeES.instances.length, 1, '连接器未重建（非刷新/非重挂载）')
  } finally {
    panel.dispose()
  }
})

test('安装向导 E2E：预检报告 → 确认安装 → 真实 registry 装入且卡片自动出现', async (t) => {
  setMarker(true)
  const stack = await makeV2Stack(t)
  const router = makeRouter()
  baseRoutes(router)
  const realFetch = globalThis.fetch
  router.routes.push({
    match: '/api/toolkit-panel/v2/',
    handler: async (body, u) => {
      const path = u.slice(u.indexOf('/api/toolkit-panel/v2/'))
      const res = await realFetch(stack.base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return { status: res.status, json: () => res.json() }
    },
  })
  const panel = mountUnifiedPanel({ router })
  try {
    await panel.done()
    const input = pluginPathInput(panel.tree)
    assert.ok(input, '本地路径输入框')
    input.props.onChange({ target: { value: contractPlugin } })
    await panel.done()
    const pre = buttonOf(panel.tree, '① 预检')
    assert.ok(pre, '预检按钮')
    pre.props.onClick()
    await panel.done()
    assert.ok(text(panel.tree).includes('预检结论：'), '预检报告区出现')
    assert.ok(text(panel.tree).includes('通过，可以安装'), '预检通过')

    // ★19（批 8）：逐字确认 UX —— 未逐字输入源路径前按钮禁用；不符（多一个字符）仍禁用；
    // 逐字一致才可用。服务端的强制面（缺/不符 ⇒ 400）钉在 install-confirm-gate.test.mjs。
    const confirmBtn0 = buttonOf(panel.tree, '确认安装')
    assert.ok(confirmBtn0, '确认安装按钮')
    assert.equal(confirmBtn0.props.disabled, true, '逐字确认未输入前按钮禁用')
    const confirmInput = findAll(panel.tree, (n) => n.type === 'input' && String((n.props && n.props.placeholder) || '').startsWith('逐字输入'))[0]
    assert.ok(confirmInput, '逐字确认输入框')
    confirmInput.props.onChange({ target: { value: contractPlugin + 'x' } })
    await panel.done()
    assert.equal(buttonOf(panel.tree, '确认安装').props.disabled, true, '逐字不符仍禁用')
    confirmInput.props.onChange({ target: { value: contractPlugin } })
    await panel.done()
    const confirmBtn = buttonOf(panel.tree, '确认安装')
    assert.equal(confirmBtn.props.disabled, false, '逐字一致后按钮可用')
    confirmBtn.props.onClick()
    await panel.done(16)

    assert.ok(text(panel.tree).includes('已installed：fixture/contract-plugin'), '安装结果反馈')
    const entry = stack.registry.get('fixture/contract-plugin')
    assert.ok(entry, 'registry 真实装入')
    assert.equal(entry.status, 'active', '装入后 active')
    assert.ok(text(panel.tree).includes('fixture/contract-plugin'), '新插件卡片自动出现（免刷新）')
  } finally {
    panel.dispose()
  }
})

test('安装向导 UX（第五步）：相对路径提交前拦下并说明，一次请求都不发；绝对路径照常送检', async () => {
  const router = makeRouter()
  baseRoutes(router)
  router.routes.push({
    match: '/api/toolkit-panel/v2/snapshot',
    handler: () => ({ status: 200, json: async () => v2SnapshotPayload([]) }),
  })
  const panel = mountUnifiedPanel({ router })
  const prechecks = () => router.calls.filter((u) => u.includes('/install/precheck')).length
  try {
    await panel.done()
    const input = pluginPathInput(panel.tree)
    assert.ok(input, '路径输入框（placeholder 已写明绝对路径与示例形态）')
    assert.ok(String(input.props.placeholder).includes('D:\\plugins\\my-plugin'), 'placeholder 给出可直接照抄的路径形态')

    // 用户真实踩坑形态：从项目目录复制来的相对路径
    input.props.onChange({ target: { value: 'dsh-repo-spec\\packages\\dsh-plugin' } })
    await panel.done()
    buttonOf(panel.tree, '① 预检').props.onClick()
    await panel.done()
    const shown = text(panel.tree)
    assert.ok(shown.includes('请输入绝对路径'), '提示逐字出现（不是拼到 System32 的报错）')
    assert.ok(shown.includes('服务进程的工作目录'), '说清相对路径按谁解析')
    assert.equal(prechecks(), 0, '相对路径不得发出预检请求')

    input.props.onChange({ target: { value: contractPlugin } })
    await panel.done()
    buttonOf(panel.tree, '① 预检').props.onClick()
    await panel.done()
    assert.equal(prechecks(), 1, '绝对路径照常提交服务端')
  } finally {
    panel.dispose()
  }
})

test('config 保存 E2E：真实客户端按钮写回 registry（T0 回归：/config 是写路由，confirm 必须逐字带插件 id）', async (t) => {
  setMarker(true)
  const stack = await makeV2Stack(t)
  assert.equal((await stack.registry.install({ kind: 'local', path: contractPlugin })).ok, true)
  const router = makeRouter()
  baseRoutes(router)
  const realFetch = globalThis.fetch
  let lastConfigResponse = null
  router.routes.push({
    match: '/api/toolkit-panel/v2/',
    handler: async (body, u) => {
      const path = u.slice(u.indexOf('/api/toolkit-panel/v2/'))
      const res = await realFetch(stack.base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const json = await res.json()
      if (path === '/api/toolkit-panel/v2/config') lastConfigResponse = json
      return { status: res.status, json: async () => json }
    },
  })
  const panel = mountUnifiedPanel({ router })
  try {
    await panel.done()
    const cfgBtn = buttonOf(panel.tree, '配置')
    assert.ok(cfgBtn, '配置按钮')
    cfgBtn.props.onClick()
    await panel.done()
    const save = buttonOf(panel.tree, '保存配置（写回 registry）')
    assert.ok(save, '保存按钮渲染')
    save.props.onClick()
    await panel.done(16)
    assert.ok(lastConfigResponse, '/config 请求已发出')
    assert.equal(lastConfigResponse.ok, true, '保存成功（修复前：400 confirm-missing）')
    assert.ok(!text(panel.tree).includes('confirm-missing'), '无 confirm-missing 反馈')
  } finally {
    panel.dispose()
  }
})

test('config 表单多字段编辑累积（T0 回归：表单以 p.config+draft 合并值为基准，多字段编辑不互相覆盖）', async (t) => {
  setMarker(true)
  const stack = await makeV2Stack(t)
  // region 必填：预检会按设计阻断，本测试只验证表单编辑累积，用 force 装入
  assert.equal((await stack.registry.install({ kind: 'local', path: fixtureDir('schema-plugin') }, { force: true })).ok, true)
  const router = makeRouter()
  baseRoutes(router)
  const realFetch = globalThis.fetch
  let lastConfigBody = null
  router.routes.push({
    match: '/api/toolkit-panel/v2/',
    handler: async (body, u) => {
      const path = u.slice(u.indexOf('/api/toolkit-panel/v2/'))
      const res = await realFetch(stack.base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const json = await res.json()
      if (path === '/api/toolkit-panel/v2/config') lastConfigBody = body
      return { status: res.status, json: async () => json }
    },
  })
  const panel = mountUnifiedPanel({ router })
  try {
    await panel.done()
    const cfgBtn = buttonOf(panel.tree, '配置')
    cfgBtn.props.onClick()
    await panel.done()
    // 打开配置后，按 label 定位 schema 表单输入（region/retries；patch 域参数编辑不干扰）
    const labeledInput = (label) => {
      const labs = findAll(panel.tree, (n) => n.type === 'label' && textOf(n).join('').indexOf(label) === 0)
      return labs.map((l) => findAll(l, (n) => n.type === 'input')[0]).filter(Boolean)[0] || null
    }
    const regionInput = labeledInput('region：')
    const retriesInput = labeledInput('retries：')
    assert.ok(regionInput && retriesInput, 'schema 表单 region/retries 输入在场')
    regionInput.props.onChange({ target: { value: 'cn' } })
    await panel.done()
    // 编辑后重新定位（与真实浏览器一致：每次 action 都拿到最新渲染的闭包）
    const retriesInput2 = labeledInput('retries：')
    retriesInput2.props.onChange({ target: { value: '5' } })
    await panel.done()
    const save = buttonOf(panel.tree, '保存配置（写回 registry）')
    save.props.onClick()
    await panel.done(16)
    assert.ok(lastConfigBody, '/config 请求已发出')
    assert.deepEqual(lastConfigBody.config, { region: 'cn', retries: 5 }, '两个字段都保留（修复前只剩最后编辑的 lockTimeout 式覆盖）')
  } finally {
    panel.dispose()
  }
})

test('启停 confirm E2E：未勾选不可执行；勾选后 registry 真实生效并反馈', async (t) => {  setMarker(true)
  const stack = await makeV2Stack(t)
  assert.equal((await stack.registry.install({ kind: 'local', path: contractPlugin })).ok, true)
  const router = makeRouter()
  baseRoutes(router)
  const realFetch = globalThis.fetch
  router.routes.push({
    match: '/api/toolkit-panel/v2/',
    handler: async (body, u) => {
      const path = u.slice(u.indexOf('/api/toolkit-panel/v2/'))
      const res = await realFetch(stack.base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return { status: res.status, json: () => res.json() }
    },
  })
  const panel = mountUnifiedPanel({ router })
  try {
    await panel.done()
    assert.ok(text(panel.tree).includes('fixture/contract-plugin'), '卡片在')
    const stopBtn = buttonOf(panel.tree, '停用')
    assert.ok(stopBtn, '停用按钮（active 态）')
    stopBtn.props.onClick()
    await panel.done()
    assert.ok(text(panel.tree).includes('确认停用 fixture/contract-plugin？'), 'confirm 文案逐字校验语义')
    const exec = buttonOf(panel.tree, '执行')
    assert.ok(exec, '执行按钮出现')
    assert.equal(exec.props.disabled, true, '未勾选确认前不可执行')
    const checkbox = findAll(panel.tree, (n) => n.type === 'input' && n.props && n.props.type === 'checkbox')[0]
    assert.ok(checkbox, '知情确认勾选框')
    checkbox.props.onChange({ target: { checked: true } })
    await panel.done()
    const exec2 = buttonOf(panel.tree, '执行')
    assert.equal(exec2.props.disabled, false, '勾选后可执行')
    exec2.props.onClick()
    await panel.done(16)
    assert.equal(stack.registry.get('fixture/contract-plugin').status, 'disabled', 'registry 真实生效')
    assert.ok(buttonOf(panel.tree, '启用'), '卡片切换为启用入口')
  } finally {
    panel.dispose()
  }
})

test('健康详情：items+fix 渲染；拉取失败 → 降级提示（不静默）', async (t) => {
  setMarker(true)
  const stack = await makeV2Stack(t)
  assert.equal((await stack.registry.install({ kind: 'local', path: contractPlugin })).ok, true)
  stack.registry.setHealth('fixture/contract-plugin', {
    status: 'warn',
    at: new Date().toISOString(),
    items: [{ code: 'demo-check', level: 'warn', message: '示例发现', fix: { summary: '做点什么', steps: ['第一步'] } }],
  })
  const router = makeRouter()
  baseRoutes(router)
  const realFetch = globalThis.fetch
  router.routes.push({
    match: '/api/toolkit-panel/v2/',
    handler: async (body, u) => {
      const path = u.slice(u.indexOf('/api/toolkit-panel/v2/'))
      const res = await realFetch(stack.base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? {} : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return { status: res.status, json: () => res.json() }
    },
  })
  const panel = mountUnifiedPanel({ router })
  try {
    await panel.done()
    const btn = buttonOf(panel.tree, '健康详情')
    btn.props.onClick()
    await panel.done()
    const t1 = text(panel.tree)
    assert.ok(t1.includes('当前状态：'), '健康详情打开')
    assert.ok(t1.includes('demo-check'), '发现项 code')
    assert.ok(t1.includes('示例发现'), '发现项 message')
    assert.ok(t1.includes('修复：做点什么'), 'fix 摘要')
    assert.ok(t1.includes('历史：'), '环形历史行')
  } finally {
    panel.dispose()
  }

  // 失败分支：health 拉取 reject → 降级提示
  const router2 = makeRouter()
  baseRoutes(router2)
  router2.routes.push({ match: '/api/toolkit-panel/v2/snapshot', handler: () => ({ status: 200, json: async () => v2SnapshotPayload([v2Entry('fixture/x')]) }) })
  router2.routes.push({ match: '/api/toolkit-panel/v2/health', handler: () => { throw new Error('health down') } })
  const panel2 = mountUnifiedPanel({ router: router2 })
  try {
    await panel2.done()
    buttonOf(panel2.tree, '健康详情').props.onClick()
    await panel2.done()
    assert.ok(text(panel2.tree).includes('健康详情暂不可用'), '降级提示可见（不静默、不崩）')
  } finally {
    panel2.dispose()
  }
})

test('数据面降级：registry 快照失败 → 管理区降级提示，patch 工具区照常渲染', async () => {
  const router = makeRouter()
  baseRoutes(router)
  router.routes.push({
    match: '/api/toolkit-panel/v2/snapshot',
    handler: () => ({ status: 200, json: async () => ({ ok: false, error: 'registry down（测试桩）' }) }),
  })
  const panel = mountUnifiedPanel({ router })
  try {
    await panel.done()
    const t1 = text(panel.tree)
    assert.ok(t1.includes('插件管理（registry）数据暂不可用'), '管理区降级提示')
    assert.ok(t1.includes('下方 patch 域工具区不受影响'), '降级说明')
    assert.ok(!t1.includes('安装新插件（仅本地插件目录）'), '管理区主体不渲染（无半残状态）')
    assert.ok(t1.includes('内置插件工具区（patch 域 · 开关 / 参数 / 卸载恢复）'), '工具区照常')
    assert.ok(t1.includes('第一层 · 配置文件（patch-row.disabled）'), '工具区开关照常')
    assert.ok(buttonOf(panel.tree, '一键体检（只查不改）'), '体检入口照常')
  } finally {
    panel.dispose()
  }
})

test('内联孪生 connector：SSE 断连降级轮询 → 恢复切回 → 命名事件直达（归一面板实际传输代码）', async () => {
  const realFetch = globalThis.fetch
  globalThis.EventSource = FakeES
  FakeES.instances = []
  let fetchCount = 0
  const snapshots = []
  const modes = []
  const events = []
  globalThis.fetch = async () => {
    fetchCount++
    return { json: async () => { const data = { ok: true, plugins: [], fetchNo: fetchCount }; snapshots.push(data); return data } }
  }
  const react = makeReact()
  const bundleSrc = readFileSync(join(root, 'panel', 'client', 'index.js'), 'utf8')
  let factory = null
  new Function('window', bundleSrc)({ __ModuleLoader__: { load: (o) => { factory = o.factory } } })
  const mod = factory((name) => { if (name === 'react') return react; throw new Error('stub: ' + name) })
  const api = mod && mod.apply ? mod : (mod && mod.exports)
  assert.equal(typeof api.createV2Connector, 'function', 'client 导出内联孪生 connector（测试接入点）')

  try {
    const connector = api.createV2Connector({
      onSnapshot: (s) => snapshots.push(s),
      onMode: (m) => modes.push(m),
      onEvent: (name, payload) => events.push([name, payload]),
    })
    const es = FakeES.instances.at(-1)
    assert.ok(es, 'EventSource 已建立（/events）')

    es.fire('open')
    assert.equal(modes.at(-1), 'sse', 'SSE 在场')
    const sseFetchCount = fetchCount

    es.fire('error')
    assert.equal(modes.at(-1), 'poll', '断连自动降级轮询')
    await flush(4)
    assert.ok(fetchCount > sseFetchCount, '降级后轮询快照')

    const afterPoll = fetchCount
    es.fire('open')
    assert.equal(modes.at(-1), 'sse', '恢复自动切回 SSE')
    await flush(4)
    assert.equal(fetchCount, afterPoll, '切回后轮询停止')

    es.fire('status-changed', { data: JSON.stringify({ id: 'a', to: 'active' }) })
    es.fire('message', { data: JSON.stringify({ hello: 1 }) })
    assert.ok(events.some(([n, p]) => n === 'status-changed' && p.to === 'active'), '命名事件直达')
    assert.ok(events.some(([n, p]) => n === 'message' && p.hello === 1), '默认消息直达')

    connector.close()
    assert.equal(es.closed, true, 'close 关闭 SSE')
  } finally {
    globalThis.fetch = realFetch
    delete globalThis.EventSource
    FakeES.instances = []
  }
})
