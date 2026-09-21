// H2 · 交叉预检补全（债务 D-14 关账）
//
// 修复前的覆盖面只有"行 id 的字面引用"一层，且面板客户端从不传 alsoMatch ⇒
// ① patch 里以 provider id 写的引用（`searchProvider: auto-search` /
//    `fetchProvider: local-fetch`）看不见；② 声明式依赖（search-router 依赖
//    web-search-local）在文本里没有字面引用，扫不到；③ 卸载方向根本不做这类预检。
// 本文件把三件事分别钉住，并保留"只告知、不阻断"的原语义。
import test from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { buildCrossRefs, createTogglePlan, executePlan, findCrossReferences, putPlan } from '../panel/manager/apply-engine.mjs'
import { createSoftUninstallPlan, createTrueUninstallPlan } from '../panel/manager/uninstall.mjs'
import { PLUGINS, crossRefNeedles, declaredDependents, pluginByRowId } from '../panel/manager/plugin-registry.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const PATCH_SRC = join(ROOT, 'cordis.patch.yml')

/** 一份可写的 patch 副本 + 最小仓根（卸载 plan 需要 lib/<plugin> 在场）。 */
function sandbox(t, plugin) {
  const root = mkdtempSync(join(tmpdir(), 'h2-crossrefs-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const file = join(root, 'cordis.patch.yml')
  cpSync(PATCH_SRC, file)
  if (plugin) mkdirSync(join(root, 'lib', plugin), { recursive: true })
  return { root, file, text: readFileSync(file, 'utf8') }
}

test('停用方向：provider 引用被看见，且旧口径（仅行 id）确实看不见', (t) => {
  const { file, text } = sandbox(t)

  // plan 阶段不碰 backupRoot（只有 execute 才写备份），这里留空即可。
  const plan = createTogglePlan({ file, rowId: 'web-search-local', enabled: false })
  assert.ok(plan.crossRefs.length > 0, '停用 web-search-local 必须报出引用')
  const hit = plan.crossRefs.find((r) => /local-fetch/.test(r.text))
  assert.ok(hit, '必须命中 web 行的 fetchProvider: local-fetch')
  assert.equal(hit.source, 'patch')
  assert.ok(hit.line > 0, 'patch 命中要带行号，便于用户跳过去看')

  // 非空洞性：同一份文本、同一个行 id，按修复前的口径（只有行 id）扫 ⇒ 零命中。
  assert.deepEqual(findCrossReferences(text, { rowId: 'web-search-local', alsoMatch: [] })
    .filter((h) => /local-fetch/.test(h.text)), [], '旧口径不该看得见这条（看不见才是它的问题）')
  assert.deepEqual(crossRefNeedles('web-search-local'), ['local-multi', 'local-fetch'], '补上的正是 provider id 维度')
})

test('停用方向：search-router 的 auto-search 引用同样命中', () => {
  const text = readFileSync(PATCH_SRC, 'utf8')
  const refs = buildCrossRefs(text, { rowId: 'web-search-router', plugin: 'search-router' })
  assert.ok(refs.some((r) => /searchProvider: auto-search/.test(r.text)), '停用 search-router 要报出 web 行的 searchProvider 引用')
})

test('停用方向：声明式依赖（文本里看不见的引用）也报出来', () => {
  const text = readFileSync(PATCH_SRC, 'utf8')
  const refs = buildCrossRefs(text, { rowId: 'web-search-local', plugin: 'web-search-local' })
  const dep = refs.find((r) => r.source === 'declared-dependency')
  assert.ok(dep, 'search-router 依赖 web-search-local 这条必须进报告')
  assert.match(dep.text, /search-router/)
  assert.equal(dep.line, null, '声明式依赖不是文本命中，不该伪造行号')
  assert.deepEqual(declaredDependents('web-search-local').map((d) => d.plugin), ['search-router'])
  assert.deepEqual(declaredDependents('rate-throttle'), [], '没有被依赖的插件就如实为空')
})

test('卸载方向：软/真卸载 plan 都带 crossRefs（修复前卸载路径无任何此类预检）', (t) => {
  const { root, text } = sandbox(t, 'web-search-local')
  const soft = createSoftUninstallPlan({ toolkitRoot: root, plugin: 'web-search-local' })
  assert.ok(Array.isArray(soft.crossRefs) && soft.crossRefs.length > 0, '软卸载必须给引用报告')
  assert.ok(soft.crossRefs.some((r) => r.source === 'declared-dependency'), '含声明式依赖那条')
  assert.ok(soft.crossRefs.some((r) => /local-fetch/.test(r.text)), '含 provider 引用那条')

  const truth = createTrueUninstallPlan({ toolkitRoot: root, plugin: 'web-search-local' })
  assert.ok(Array.isArray(truth.crossRefs) && truth.crossRefs.length > 0, '真卸载（销毁式）同样要给报告')
  // 同一份文本、同一条引用，旧口径看不见 ⇒ 证明这条报告是新增维度带来的
  assert.deepEqual(findCrossReferences(text, { rowId: 'web-search-local', alsoMatch: [] })
    .filter((h) => /local-fetch/.test(h.text)), [])
})

test('不阻断语义：crossRefs 非空时停用照样写得下去（决定权在用户）', (t) => {
  const { root, file, text } = sandbox(t)
  const plan = createTogglePlan({
    file,
    rowId: 'web-search-local',
    enabled: false,
    backupRoot: join(root, 'backups'),
    reason: 'test-h2',
    note: 'h2',
  })
  assert.ok(plan.crossRefs.length > 0, '前提：本例确实带着警告')
  putPlan(plan) // 面板路由里由 /toggle/plan 负责入池，execute 才取得到
  const result = executePlan(plan.token)
  assert.ok(result, '带警告的停用必须能执行（只报告不阻断）')
  const after = readFileSync(file, 'utf8')
  assert.notEqual(after, text, '文件必须真的被改了')
  const block = /- id: web-search-local[\s\S]*?(?=\n- id:|\n$)/.exec(after)
  assert.ok(block && /disabled:\s*true/.test(block[0]), 'web-search-local 块内应写入 disabled: true')
})

test('边界：平台行（本表没有的 rowId）不抛、只按行 id 查；无行 id 的预设插件按包名查', () => {
  const text = readFileSync(PATCH_SRC, 'utf8')
  assert.equal(pluginByRowId('web'), null, '`web` 是宿主平台行，不属本表')
  assert.doesNotThrow(() => buildCrossRefs(text, { rowId: 'web', plugin: null }))
  const preset = buildCrossRefs(text, { plugin: 'compact-router' })
  assert.ok(Array.isArray(preset), '预设托管插件（无 patch 行）必须能出报告而不是抛')
  assert.deepEqual(preset.filter((r) => r.source === 'declared-dependency'), [], 'compact-router 没有被依赖，如实为空')
})

test('漂移守卫：面板登记表的 providers 必须与各插件 manifest 的 registers.providers 逐条一致', () => {
  // 面板这份表是"报告用知识"，manifest 那份是"插件自述"。两者漂移就意味着
  // 预检在骗人——所以宁可在这里钉死，也不要在运行时才被发现。
  for (const [name, meta] of Object.entries(PLUGINS)) {
    const manifestPath = join(ROOT, 'lib', name, 'dsh.plugin.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const declared = manifest?.requirements?.registers?.providers ?? []
    assert.deepEqual([...(meta.providers ?? [])].sort(), [...declared].sort(),
      `PLUGINS["${name}"].providers 与 lib/${name}/dsh.plugin.json 的 registers.providers 不一致`)
  }
})
