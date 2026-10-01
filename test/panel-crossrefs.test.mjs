// H2 · 交叉预检补全（债务 D-14 关账）
//
// 修复前的覆盖面只有"行 id 的字面引用"一层，且面板客户端从不传 alsoMatch ⇒
// ① patch 里以 provider id 写的引用（`searchProvider: auto-search`；原
//    `fetchProvider: local-fetch` 例已随 web-search-local 出包移除）看不见；
//    ② 声明式依赖（历史例：search-router 依赖 web-search-local）在文本里没有字面引用，
//    扫不到——S1 剔除批后登记表已空，机制保留待用；③ 卸载方向根本不做这类预检。
// 本文件把三件事分别钉住，并保留"只告知、不阻断"的原语义。
// （S1 剔除批改造：原以 web-search-local 行为例的用例切到 search-router 的
//   web-search-router 行——它是现存唯一带 provider 引用的 patch 行。）
import test from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { buildCrossRefs, createTogglePlan, executePlan, findCrossReferences, putPlan } from '../panel/manager/apply-engine.mjs'
import { createSoftUninstallPlan, createTrueUninstallPlan } from '../panel/manager/uninstall.mjs'
import { PLUGINS, crossRefNeedles, declaredDependents, pluginByRowId } from '../panel/manager/plugin-registry.mjs'
// v1.3 迁移笔：提供面取数与装载面同源（面板守卫不得自建第二份优先级逻辑）
import { extractRegisters } from '../registry/dist/loader.js'

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
  const plan = createTogglePlan({ file, rowId: 'web-search-router', enabled: false })
  assert.ok(plan.crossRefs.length > 0, '停用 search-router（web-search-router 行）必须报出引用')
  const hit = plan.crossRefs.find((r) => /searchProvider: auto-search/.test(r.text))
  assert.ok(hit, '必须命中 web 行的 searchProvider: auto-search')
  assert.equal(hit.source, 'patch')
  assert.ok(hit.line > 0, 'patch 命中要带行号，便于用户跳过去看')

  // 非空洞性：同一份文本、同一个行 id，按修复前的口径（只有行 id）扫 ⇒ 零命中。
  assert.deepEqual(findCrossReferences(text, { rowId: 'web-search-router', alsoMatch: [] })
    .filter((h) => /searchProvider: auto-search/.test(h.text)), [], '旧口径不该看得见这条（看不见才是它的问题）')
  assert.deepEqual(crossRefNeedles('web-search-router'), ['auto-search'], '补上的正是 provider id 维度')
})

test('停用方向：search-router 的 auto-search 引用同样命中', () => {
  const text = readFileSync(PATCH_SRC, 'utf8')
  const refs = buildCrossRefs(text, { rowId: 'web-search-router', plugin: 'search-router' })
  assert.ok(refs.some((r) => /searchProvider: auto-search/.test(r.text)), '停用 search-router 要报出 web 行的 searchProvider 引用')
})

test('停用方向：声明式依赖机制保留待用（S1 剔除批后登记表空、恒如实为空）', () => {
  const text = readFileSync(PATCH_SRC, 'utf8')
  const refs = buildCrossRefs(text, { rowId: 'web-search-router', plugin: 'search-router' })
  assert.deepEqual(
    refs.filter((r) => r.source === 'declared-dependency'), [],
    '登记表清空后不得再报历史依赖（web-search-local 已出包）',
  )
  assert.deepEqual(declaredDependents('search-router'), [], 'S1 剔除批：依赖登记空（机制保留待用）')
  assert.deepEqual(declaredDependents('rate-throttle'), [], '没有被依赖的插件就如实为空')
})

test('卸载方向：软/真卸载 plan 都带 crossRefs（修复前卸载路径无任何此类预检）', (t) => {
  const { root, text } = sandbox(t, 'search-router')
  const soft = createSoftUninstallPlan({ toolkitRoot: root, plugin: 'search-router' })
  assert.ok(Array.isArray(soft.crossRefs) && soft.crossRefs.length > 0, '软卸载必须给引用报告')
  assert.ok(soft.crossRefs.some((r) => /searchProvider: auto-search/.test(r.text)), '含 provider 引用那条')

  const truth = createTrueUninstallPlan({ toolkitRoot: root, plugin: 'search-router' })
  assert.ok(Array.isArray(truth.crossRefs) && truth.crossRefs.length > 0, '真卸载（销毁式）同样要给报告')
  // 同一份文本、同一条引用，旧口径看不见 ⇒ 证明这条报告是新增维度带来的
  assert.deepEqual(findCrossReferences(text, { rowId: 'web-search-router', alsoMatch: [] })
    .filter((h) => /searchProvider: auto-search/.test(h.text)), [])
})

test('不阻断语义：crossRefs 非空时停用照样写得下去（决定权在用户）', (t) => {
  const { root, file, text } = sandbox(t)
  const plan = createTogglePlan({
    file,
    rowId: 'web-search-router',
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
  const block = /- id: web-search-router[\s\S]*?(?=\n- id:|\n$)/.exec(after)
  assert.ok(block && /disabled:\s*true/.test(block[0]), 'web-search-router 块内应写入 disabled: true')
})

test('边界：平台行（本表没有的 rowId）不抛、只按行 id 查；无行 id 的预设插件按包名查', () => {
  const text = readFileSync(PATCH_SRC, 'utf8')
  assert.equal(pluginByRowId('web'), null, '`web` 是宿主平台行，不属本表')
  assert.doesNotThrow(() => buildCrossRefs(text, { rowId: 'web', plugin: null }))
  const preset = buildCrossRefs(text, { plugin: 'compact-router' })
  assert.ok(Array.isArray(preset), '预设托管插件（无 patch 行）必须能出报告而不是抛')
  assert.deepEqual(preset.filter((r) => r.source === 'declared-dependency'), [], 'compact-router 没有被依赖，如实为空')
})

test('漂移守卫：面板登记表的 providers 必须与各插件 manifest 的提供面 providers 逐条一致', () => {
  // 面板这份表是"报告用知识"，manifest 那份是"插件自述"。两者漂移就意味着
  // 预检在骗人——所以宁可在这里钉死，也不要在运行时才被发现。
  // v1.3 迁移笔：取数改走装载面同一个 extractRegisters（provides.providers 优先、legacy registers.providers
  // 回落）——清单迁到 provides 后若还按 legacy 直读，本守卫会"跟着一起变空而不红"（矩阵文档 4.3 点名的盲区）。
  for (const [name, meta] of Object.entries(PLUGINS)) {
    const manifestPath = join(ROOT, 'lib', name, 'dsh.plugin.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const declared = extractRegisters(manifest)?.providers ?? []
    assert.deepEqual([...(meta.providers ?? [])].sort(), [...declared].sort(),
      `PLUGINS["${name}"].providers 与 lib/${name}/dsh.plugin.json 的提供面 providers 不一致`)
  }
})
