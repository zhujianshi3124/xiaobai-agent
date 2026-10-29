/**
 * 债 7 · 面向用户的治理报告读取通道（只读）测试
 *
 * 立项依据（《项目档案》第九节第 7 项 7-2）：治理报告此前只有插件之间在读
 * （tiering 读 usage-track、cleanup 读 tiering），面板服务端 / 根入口 / v2 管理面 /
 * 快照都没有读它 ⇒ 报告写出来了，用户一个字节也看不到。本笔补的是那条用户可见通道。
 *
 * 用例面（每条一个断言意图）：
 *   GOV-1  归一函数：在场目录逐份列出；目录缺席 ⇒ available:false（不假装读到空）
 *   GOV-2  单份报告坏掉只影响它自己（readable:false + 原因），其余照常可读
 *   GOV-3  本机绝对路径不出本机：盘符形态与 file:// 一律归一成占位符
 *   GOV-4  问题条数按级别计数（error/warn/info），且列出条数有上限、余量只报数
 *   GOV-5  路由形态：GET /governance/reports 注册为只读 exact 路由（无 change 标注）
 *   GOV-6  路由行为：恒 200（目录缺席也是 200）；非 GET ⇒ 405
 *   GOV-7  只读自证：读侧模块与路由源文件零写调用
 *   GOV-8  兜底页治理区块：panel.html 含治理区块骨架与读取逻辑（React 装载失败时用户仍能看到报告）
 *   GOV-9  兜底页渲染器：真跑内联脚本，四态（缺席/空/正常/读不出）逐态断言
 *   GOV-10 取数源改造：两处客户端都不再拿 /custody 当治理报告
 *
 * 隔离：全部用 mkdtemp 临时 toolkitRoot（t.after 清理），真实仓 .toolkit-governance 零触碰。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  buildGovernanceReportView,
  redactPaths,
  GOVERNANCE_REPORT_DIR,
  MAX_ISSUE_LINES,
  PATH_PLACEHOLDER,
} from '../panel/manager/governance-report.mjs'

const ROOT = resolve(import.meta.dirname, '..')

function makeRoot(t, tag) {
  const root = mkdtempSync(join(tmpdir(), 'gov-report-' + tag + '-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return root
}

function writeReport(root, plugin, doc) {
  const dir = join(root, GOVERNANCE_REPORT_DIR, plugin)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'latest.json'), typeof doc === 'string' ? doc : JSON.stringify(doc), 'utf8')
}

test('GOV-1: 目录在场逐份列出；目录缺席 ⇒ available:false（不假装读到空）', (t) => {
  const absent = buildGovernanceReportView(makeRoot(t, 'absent'))
  assert.equal(absent.available, false, '约定目录不在场必须如实申报')
  assert.equal(absent.pluginCount, 0)
  assert.deepEqual(absent.reports, [])
  assert.equal(absent.reportDir, GOVERNANCE_REPORT_DIR + '/', '报告根名对外可见')

  const root = makeRoot(t, 'present')
  writeReport(root, 'governance-tiering', {
    schema: 'toolkit-governance/tiering@1',
    generatedAt: '2026-10-28T15:38:24.080Z',
    issues: [{ level: 'warn', code: 'tier-review-candidate', message: '卸载候选' }],
  })
  writeReport(root, 'governance-router', {
    schema: 'toolkit-governance/router@1',
    generatedAt: '2026-10-28T15:38:24.085Z',
    issues: [],
  })
  const view = buildGovernanceReportView(root)
  assert.equal(view.available, true)
  assert.equal(view.pluginCount, 2)
  assert.deepEqual(view.reports.map((r) => r.plugin), ['governance-router', 'governance-tiering'], '目录名有序')
  for (const row of view.reports) {
    assert.equal(row.present, true)
    assert.equal(row.readable, true)
  }
})

test('GOV-2: 单份报告坏掉只影响它自己（readable:false + 原因），其余照常可读', (t) => {
  const root = makeRoot(t, 'broken')
  writeReport(root, 'governance-cleanup', '{ broken json !!')
  writeReport(root, 'governance-tiering', { schema: 'toolkit-governance/tiering@1', issues: [] })
  mkdirSync(join(root, GOVERNANCE_REPORT_DIR, 'governance-empty'), { recursive: true })

  const view = buildGovernanceReportView(root)
  assert.equal(view.available, true)
  const byName = Object.fromEntries(view.reports.map((r) => [r.plugin, r]))
  assert.equal(byName['governance-cleanup'].readable, false, '坏 JSON 不得让整份视图塌掉')
  assert.ok(byName['governance-cleanup'].note.includes('不是合法 JSON'), '原因要点名: ' + byName['governance-cleanup'].note)
  assert.equal(byName['governance-empty'].present, false, '只有目录没有 latest.json ⇒ present:false')
  assert.ok(byName['governance-empty'].note.includes('尚未生成'))
  assert.equal(byName['governance-tiering'].readable, true, '同目录下健康报告不受牵连')
})

test('GOV-3: 本机绝对路径不出本机——盘符形态与 file:// 一律归一成占位符', (t) => {
  assert.equal(redactPaths('<TOOLKIT_ROOT>\\.toolkit-governance'), PATH_PLACEHOLDER)
  assert.equal(redactPaths('<USER_HOME>/.dsh/x.json'), PATH_PLACEHOLDER)
  assert.equal(redactPaths('见 file:///D:/x/y.json 处'), '见 ' + PATH_PLACEHOLDER + ' 处')
  assert.equal(redactPaths('没有路径的普通文本'), '没有路径的普通文本', '无路径文本原样')

  const root = makeRoot(t, 'redact')
  writeReport(root, 'governance-preflight', {
    schema: 'toolkit-governance/preflight@1',
    toolkitRootResolved: '<TOOLKIT_ROOT>',
    reportRoot: '<TOOLKIT_ROOT>\\.toolkit-governance\\governance-preflight',
    issues: [{ level: 'info', code: 'events-declared', message: '目标 ' + root + '\\lib\\x.json', target: root }],
  })
  const view = buildGovernanceReportView(root)
  const row = view.reports[0]
  assert.equal(row.schema, 'toolkit-governance/preflight@1')
  const body = JSON.stringify(view)
  assert.ok(!body.includes(root.replace(/\\/g, '\\\\')), '临时根绝对路径不得出现在下发体里')
  assert.ok(!/[A-Za-z]:[\\/]/.test(body), '下发体里不得残留盘符形态路径: ' + body.slice(0, 200))
  assert.ok(row.issueLines[0].message.includes(PATH_PLACEHOLDER), '问题行里的路径也归一')
})

test('GOV-4: 问题按级别计数；列出条数有上限、余量只报数', (t) => {
  const root = makeRoot(t, 'issues')
  const issues = []
  for (let i = 0; i < MAX_ISSUE_LINES + 3; i++) issues.push({ level: 'warn', code: 'w' + i, message: '提醒 ' + i })
  issues.push({ level: 'error', code: 'e1', message: '错误一' })
  issues.push({ level: 'info', code: 'i1', message: '信息一' })
  issues.push({ level: 'unknown-level', code: 'u1', message: '未知级别归信息' })
  writeReport(root, 'governance-usage-track', { schema: 'toolkit-governance/usage-track@1', issues })

  const view = buildGovernanceReportView(root)
  const row = view.reports[0]
  assert.equal(row.issues.total, MAX_ISSUE_LINES + 6)
  assert.equal(row.issues.error, 1)
  assert.equal(row.issues.info, 2, 'info 含 1 条真 info + 1 条未知级别（归 info，不丢条）')
  assert.equal(row.issues.warn, MAX_ISSUE_LINES + 3)
  assert.equal(row.issueLines.length, MAX_ISSUE_LINES, '列出行数有上限')
  assert.ok(row.note.includes(String(6)), '余量只报数: ' + row.note)
  assert.equal(view.issueTotals.total, row.issues.total, '汇总与单份一致')
})

test('GOV-5: 路由形态——GET /governance/reports 注册为只读 exact 路由（无 change 标注）', async (t) => {
  const panelMod = await import('../panel/index.js')
  const routes = []
  const ctx = {
    effect(cb) { cb(); return () => {} },
    webServer: { register(route) { routes.push(route); return () => {} } },
    get() { throw new Error('probe: no cordis service') },
  }
  const root = makeRoot(t, 'route')
  panelMod.apply(ctx, { toolkitRoot: root, devicesFile: join(root, 'devices.json') })
  const row = routes.find((r) => r.path === '/api/toolkit-panel/governance/reports')
  assert.ok(row, '治理报告只读路由必须在册')
  assert.equal(row.kind, 'exact', '沿用面板既有只读路由形态')
  assert.equal(typeof row.handler, 'function')
  const changeRoutes = routes.filter((r) => r.path === '/api/toolkit-panel/governance/reports' && r.change === true)
  assert.equal(changeRoutes.length, 0, '不得是写路由')
})

test('GOV-6: 路由行为——恒 200（目录缺席也是 200）；非 GET ⇒ 405', async (t) => {
  const panelMod = await import('../panel/index.js')
  const routes = []
  const ctx = {
    effect(cb) { cb(); return () => {} },
    webServer: { register(route) { routes.push(route); return () => {} } },
    get() { throw new Error('probe: no cordis service') },
  }
  const root = makeRoot(t, 'behave')
  panelMod.apply(ctx, { toolkitRoot: root, devicesFile: join(root, 'devices.json') })
  const row = routes.find((r) => r.path === '/api/toolkit-panel/governance/reports')
  const call = async (method) => {
    let status = null
    let body = null
    const res = { writeHead(s) { status = s }, end(p) { if (typeof p === 'string') body = JSON.parse(p) } }
    const req = { method, headers: { host: '127.0.0.1:3080' }, socket: { remoteAddress: '127.0.0.1' } }
    await row.handler(req, res)
    return { status, body }
  }

  const absent = await call('GET')
  assert.equal(absent.status, 200, '目录缺席也是 200（降级不 5xx）')
  assert.equal(absent.body.ok, true)
  assert.equal(absent.body.governance.available, false, '缺席如实申报')

  writeReport(root, 'governance-router', { schema: 'toolkit-governance/router@1', issues: [] })
  const present = await call('GET')
  assert.equal(present.status, 200)
  assert.equal(present.body.governance.available, true)
  assert.equal(present.body.governance.pluginCount, 1)

  const post = await call('POST')
  assert.equal(post.status, 405, '只读路由不接受写方法')
})

test('GOV-7: 只读自证——读侧模块与面板服务端路由段零写调用', () => {
  const src = readFileSync(join(ROOT, 'panel', 'manager', 'governance-report.mjs'), 'utf8')
  for (const bad of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'unlinkSync', 'createWriteStream']) {
    assert.equal(src.includes(bad), false, '读侧模块不得出现写调用：' + bad)
  }
  // 路由段只做读取与下发：从路由注释到 handler 结束的片段里不得出现写 API。
  const panelSrc = readFileSync(join(ROOT, 'panel', 'index.js'), 'utf8')
  const start = panelSrc.indexOf('path: apiBase + "/governance/reports"')
  assert.ok(start > 0, '路由段必须在案')
  const seg = panelSrc.slice(start, panelSrc.indexOf('// ── P4 泛化线', start))
  assert.ok(seg.includes('buildGovernanceReportView'), '路由必须经归一函数取数')
  for (const bad of ['writeFileSync', 'appendFileSync', 'rmSync', 'unlinkSync']) {
    assert.equal(seg.includes(bad), false, '治理报告路由段不得写盘：' + bad)
  }
})

test('GOV-8: 兜底页治理区块——panel.html 含区块骨架与读取逻辑（React 装载失败时仍可见报告）', () => {
  const html = readFileSync(join(ROOT, 'panel', 'client', 'panel.html'), 'utf8')
  assert.ok(html.includes('id="governanceOut"'), '兜底页必须有治理区块容器')
  assert.ok(html.includes('id="governanceBody"'), '兜底页必须有治理数据落点')
  assert.ok(html.includes('id="governanceGo"'), '兜底页必须有重新读取入口')
  assert.ok(html.includes('治理视图（只读对账 · 治理报告）'), '区块标题在案')
  assert.ok(html.includes('PANEL_API + "/governance/reports"'), '读取逻辑必须打治理报告只读路由')
  assert.ok(html.includes('function governanceViewHtml'), '渲染器必须在案')
  assert.ok(html.includes('loadGovernance()'), '开页即读取（不是等用户点）')
  // 反向钉：兜底页不得把保管档当成治理报告（债 7 的取数源改造面）
  const govStart = html.indexOf('function governanceViewHtml')
  const govEnd = html.indexOf('el("refresh").addEventListener', govStart)
  const govSeg = html.slice(govStart, govEnd)
  assert.ok(!govSeg.includes('/custody'), '兜底页治理区块不得再读 /custody')
})

/** 抽出 panel.html 的内联脚本，喂假 document / fetch，返回可直调的渲染器。 */
function loadFallbackPage(fetchImpl) {
  const html = readFileSync(join(ROOT, 'panel', 'client', 'panel.html'), 'utf8')
  const m = html.match(/<script>([\s\S]*)<\/script>/)
  assert.ok(m, 'panel.html 里找不到内联 script')
  const node = (id) => ({
    id, textContent: '', innerHTML: '', className: '', value: '', disabled: false,
    addEventListener: () => {}, appendChild: () => {}, querySelector: () => null,
  })
  const fakeDoc = { getElementById: (id) => node(id), createElement: (t) => node(t) }
  const fn = new Function('document', 'fetch', m[1] + '\nreturn { governanceViewHtml, GOVERNANCE_COPY, loadGovernance };')
  return fn(fakeDoc, fetchImpl || (() => new Promise(() => {})))
}

test('GOV-9: 兜底页渲染器真跑——四态逐态断言（缺席 / 空 / 正常 / 读不出）', () => {
  const page = loadFallbackPage()

  const absent = page.governanceViewHtml({ available: false })
  assert.ok(absent.includes(page.GOVERNANCE_COPY.reportAbsent), '目录缺席 ⇒ 逐字用约定文案')

  const empty = page.governanceViewHtml({ available: true, reports: [] })
  assert.ok(empty.includes(page.GOVERNANCE_COPY.noData), '目录在场零份 ⇒ 空态文案（与缺席区分开）')

  const ok = page.governanceViewHtml({
    available: true,
    issueTotals: { total: 2, error: 1, warn: 1, info: 0 },
    reports: [{
      plugin: 'governance-tiering', readable: true, generatedAt: '2026-10-28T15:38:24.080Z',
      schema: 'toolkit-governance/tiering@1',
      issues: { total: 2, error: 1, warn: 1, info: 0 },
      issueLines: [
        { level: 'error', code: 'boom', message: '出错了' },
        { level: 'warn', code: 'careful', message: '注意点' },
      ],
      note: '',
    }],
  })
  assert.ok(ok.includes('governance-tiering'), '插件名在案')
  assert.ok(ok.includes('toolkit-governance/tiering@1'), 'schema 在案')
  assert.ok(ok.includes('2026-10-28T15:38:24.080Z'), '生成时间在案')
  assert.ok(ok.includes('错误（boom）：出错了'), '错误行按级别中文标注')
  assert.ok(ok.includes('提醒（careful）：注意点'), '提醒行按级别中文标注')

  const broken = page.governanceViewHtml({
    available: true,
    issueTotals: {},
    reports: [{ plugin: 'governance-cleanup', readable: false, note: 'latest.json 不是合法 JSON' }],
  })
  assert.ok(broken.includes('读不出来'), '坏报告如实申报')
  assert.ok(broken.includes('latest.json 不是合法 JSON'), '原因要点名')
})

test('GOV-10: 取数源改造——两处客户端都不再把 /custody 当治理报告', () => {
  const react = readFileSync(join(ROOT, 'panel', 'client', 'index.js'), 'utf8')
  const govStart = react.indexOf('function GovernanceSection')
  assert.ok(govStart > 0, 'GovernanceSection 必须在案')
  const govSeg = react.slice(govStart, react.indexOf('function ToolkitPanel', govStart))
  assert.ok(govSeg.includes('PANEL_API + "/governance/reports"'), 'React 治理视图必须读治理报告')
  // 判据是**取数调用**，不是散文：注释里提到 /custody 讲历史不算违规。
  assert.equal(govSeg.includes('fetch(PANEL_API + "/custody"'), false, 'React 治理视图不得再 fetch 保管档')
  assert.equal(govSeg.includes('custody.entries'), false, '保管档字段不得再进治理视图')

  // ConsoleSection 读 /custody 是**对**的（删除收据本来就是保管档），反向钉住它别被本笔改坏。
  const consoleStart = react.indexOf('function ConsoleSection')
  const consoleSeg = react.slice(consoleStart, react.indexOf('// ════ S4 F-37', consoleStart))
  assert.ok(consoleSeg.includes('PANEL_API + "/custody"'), '操作台的删除收据仍读保管档')
})
