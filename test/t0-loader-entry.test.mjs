// T0 真实插件兼容性诊断收口（G1 检验）：
//   1) loader 入口解析对齐宿主 Node 约定——package.json exports['.'] 两种形态
//      （字符串 / {".":{"default":…}} 对象）在无 main 时也能解析（修复前会误报
//      entry-not-found，宿主却装得上）
//   2) monorepo 根安装：报错写清"找到了什么、缺什么、改装哪个子包、补哪个字段"
//      （T0 裁决：不许只列尝试过的位置）
//   3) 来源类报错的 fix 为针对性可执行建议（无"按消息修复后重试"循环表述）
//   4) path-not-found 文案给出绝对路径示例与 cwd 解析说明
// 夹具全部在 tmpdir 现搭（多形态 package.json 不入库，防污染扫描面）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { resolveLocalSource, SourceError } from '@local/dsh-toolkit/registry'
import { ToolkitRegistryCore, cordisHost } from '@local/dsh-toolkit/registry'
import { Context } from '@deepseek-ai/cordis'

function tmpRoot(t) {
  const dir = mkdtempSync(join(tmpdir(), 't0-loader-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

function writePlugin(dir, { pkg, entryBody }) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg), 'utf8')
  mkdirSync(join(dir, 'dist'), { recursive: true })
  writeFileSync(
    join(dir, 'dist', 'index.js'),
    entryBody ?? "export const name = 't0-fixture'\nexport function apply() {}\n",
    'utf8',
  )
  return dir
}

test('package.json 仅 exports（字符串形态）无 main：按宿主约定解析入口', async (t) => {
  const dir = writePlugin(join(tmpRoot(t), 'exports-string'), {
    pkg: { name: 't0-exports-string', version: '1.0.0', type: 'module', exports: { '.': './dist/index.js' } },
  })
  const r = await resolveLocalSource({ kind: 'local', path: dir })
  assert.equal(r.legacy, true)
  assert.equal(r.manifest.id, 'legacy/t0-exports-string')
  assert.ok(r.entryPath.endsWith(join('dist', 'index.js')))
})

test('package.json 仅 exports（对象形态 {".":{"default":…}}）无 main：按宿主约定解析入口（dsh-repo-spec 实际形态）', async (t) => {
  const dir = writePlugin(join(tmpRoot(t), 'exports-object'), {
    pkg: {
      name: 't0-exports-object', version: '1.0.0', type: 'module',
      exports: { '.': { types: './dist/types/index.d.ts', default: './dist/index.js' }, './package.json': './package.json' },
    },
  })
  const r = await resolveLocalSource({ kind: 'local', path: dir })
  assert.equal(r.legacy, true)
  assert.equal(r.manifest.id, 'legacy/t0-exports-object')
  assert.ok(r.entryPath.endsWith(join('dist', 'index.js')))
})

test('exports 对象形态缺 default 时回退 node 条件', async (t) => {
  const dir = writePlugin(join(tmpRoot(t), 'exports-node'), {
    pkg: {
      name: 't0-exports-node', version: '1.0.0', type: 'module',
      exports: { '.': { node: './dist/index.js' } },
    },
  })
  const r = await resolveLocalSource({ kind: 'local', path: dir })
  assert.ok(r.entryPath.endsWith(join('dist', 'index.js')))
})

// ── ★10 / 批 6：第③级（package.json 的 exports/main）纳入"显式声明不回退"红线 ──
// 修前状态：③ 级目标不存在时静默落到 ④ 目录惯例 ⇒ 每个用例都放一个 index.js 哨兵诱饵，
// 一旦回退就"装载成功"，用例即精确翻红（不靠读源码推断）。
const ABSENT = './dist/absent.js'

/** ③ 级声明一个不存在的入口 + 根下放 index.js 诱饵（诱饵导出名与真入口不同，可辨走没走回退）。 */
function writeDecoy(t, label, pkg) {
  const dir = join(tmpRoot(t), label)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg), 'utf8')
  writeFileSync(join(dir, 'index.js'), "export const name = 'DECOY-index-convention'\nexport function apply() {}\n", 'utf8')
  return dir
}

for (const [slug, label, pkg] of [
  ['b6-dot-string', '③exports 字符串形态', { name: 'b6-dot-string', version: '1.0.0', type: 'module', exports: { '.': ABSENT } }],
  ['b6-bare-string', '③exports 裸字符串形态', { name: 'b6-bare-string', version: '1.0.0', type: 'module', exports: ABSENT }],
  ['b6-main', '③main 形态', { name: 'b6-main', version: '1.0.0', type: 'module', main: ABSENT }],
]) {
  test(`★10 红线：${label}声明的入口不存在 ⇒ entry-not-found，绝不回退到目录惯例`, async (t) => {
    const dir = writeDecoy(t, slug, pkg)
    const err = await resolveLocalSource({ kind: 'local', path: dir }).then(
      () => { throw new Error('应当报 entry-not-found（实际回退了）') },
      (e) => e,
    )
    assert.ok(err instanceof SourceError, `应是 SourceError，实得 ${String(err && err.message)}`)
    assert.equal(err.code, 'entry-not-found')
    assert.ok(err.message.includes(join(dir, 'dist', 'absent.js')), '要给拼好的绝对路径')
    assert.match(err.message, /package\.json/, '要点名是 package.json 这一级声明')
    assert.match(err.message, /不会.*回退/, '要写明不回退的理由（声明与实现同步是红线）')
  })
}

// ── 反向钉：没在 ③ 级声明的，照旧走目录惯例；声明了且存在的，来源面照旧可观测 ──
test('★10 反向：exports 表里没有 "." 映射（只声明子路径）⇒ 不算 ③ 级声明，仍走目录惯例', async (t) => {
  const dir = writeDecoy(t, 'b6-no-dot-key', {
    name: 'b6-no-dot-key', version: '1.0.0', type: 'module', exports: { './tool': './dist/tool.js' },
  })
  const r = await resolveLocalSource({ kind: 'local', path: dir })
  assert.equal(r.entrySource, 'index-convention', '非声明位不得触发红线（收紧只针对"声明了却不存在"）')
  assert.equal(r.entryPath, join(dir, 'index.js'))
})

test('★10 反向：exports 对象形态只有 types（无 default/node）⇒ 视为未声明入口，仍走目录惯例', async (t) => {
  const dir = writeDecoy(t, 'b6-types-only', {
    name: 'b6-types-only', version: '1.0.0', type: 'module', exports: { '.': { types: './dist/types.d.ts' } },
  })
  const r = await resolveLocalSource({ kind: 'local', path: dir })
  assert.equal(r.entrySource, 'index-convention', '没有运行时条件的对象形态今天就不产出入口，本批不改这条')
})

test('★10 反向：main 是空串 ⇒ 等同没声明，不走红线、仍落目录惯例', async (t) => {
  const dir = writeDecoy(t, 'b6-main-empty', { name: 'b6-main-empty', version: '1.0.0', type: 'module', main: '' })
  const r = await resolveLocalSource({ kind: 'local', path: dir })
  assert.equal(r.entrySource, 'index-convention', '空串不是可用声明（与 exports 的 dot === "" 同口径）')
  assert.equal(r.entryPath, join(dir, 'index.js'))
})

test('★10 正向同批补钉：③ 级两种形态声明存在时，entrySource 面可观测（main 此前零断言）', async (t) => {
  const root = tmpRoot(t)
  const byExports = writePlugin(join(root, 'b6-present-exports'), {
    pkg: { name: 'b6-present-exports', version: '1.0.0', type: 'module', exports: { '.': './dist/index.js' }, main: './dist/nope.js' },
  })
  const r1 = await resolveLocalSource({ kind: 'local', path: byExports })
  assert.equal(r1.entrySource, 'package.json#exports', 'exports 优先于 main')
  assert.equal(r1.entryPath, join(byExports, 'dist', 'index.js'))
  const byMain = writePlugin(join(root, 'b6-present-main'), {
    pkg: { name: 'b6-present-main', version: '1.0.0', type: 'module', main: './dist/index.js' },
  })
  const r2 = await resolveLocalSource({ kind: 'local', path: byMain })
  assert.equal(r2.entrySource, 'package.json#main', 'recon §10 记的 main 零断言在此补上')
  assert.equal(r2.entryPath, join(byMain, 'dist', 'index.js'))
})

test('monorepo 根安装：entry-not-found 文案写清找到/缺失/候选子包/补字段示例', async (t) => {
  const root = tmpRoot(t)
  writePlugin(join(root, 'packages', 'real-plugin'), {
    pkg: { name: 'real-plugin', version: '0.2.0', type: 'module', main: 'dist/index.js' },
  })
  mkdirSync(join(root, 'packages', 'no-entry'), { recursive: true })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 't0-monorepo', version: '0.0.0', private: true }), 'utf8')
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n', 'utf8')

  const err = await resolveLocalSource({ kind: 'local', path: root }).then(
    () => { throw new Error('应当报 entry-not-found') },
    (e) => e,
  )
  assert.ok(err instanceof SourceError)
  assert.equal(err.code, 'entry-not-found')
  const msg = String(err.message)
  assert.ok(msg.includes('未找到插件入口'), '开头点明结论')
  assert.ok(msg.includes('name=t0-monorepo'), '找到了什么：package.json 身份')
  assert.ok(msg.includes('没有 main 字段'), '缺什么：入口字段缺失')
  assert.ok(msg.includes(join(root, 'packages', 'real-plugin')), 'monorepo 候选：可改装的子包绝对路径')
  assert.ok(msg.includes('"main": "dist/index.js"'), '补哪个字段、长什么样：main 示例')
  assert.ok(msg.includes('"exports": { ".": "./dist/index.js" }'), '补哪个字段、长什么样：exports 示例')
  // 无入口的子包不进候选（不误导）
  assert.ok(!msg.includes('no-entry'))
})

test('path-not-found：文案含绝对路径示例与相对路径按 cwd 解析说明', async (t) => {
  const missing = join(tmpRoot(t), 'does-not-exist')
  const err = await resolveLocalSource({ kind: 'local', path: missing }).then(
    () => { throw new Error('应当报 path-not-found') },
    (e) => e,
  )
  assert.equal(err.code, 'path-not-found')
  const msg = String(err.message)
  assert.ok(msg.includes('绝对路径'), '绝对路径要求')
  assert.ok(msg.includes('工作目录'), '相对路径按 cwd 解析的说明')
  assert.ok(msg.includes('D:\\'), '绝对路径示例形态')
})

test('registry.install 对 monorepo 根返回针对性 fix（无"按消息修复后重试"循环表述）', async (t) => {
  const root = tmpRoot(t)
  writePlugin(join(root, 'packages', 'real-plugin'), {
    pkg: { name: 'real-plugin', version: '0.2.0', type: 'module', main: 'dist/index.js' },
  })
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 't0-monorepo', version: '0.0.0', private: true }), 'utf8')

  const ctx = new Context()
  const registry = new ToolkitRegistryCore(cordisHost(ctx), {
    servicePrefix: 't0',
    statePath: join(root, 'state.json'),
    autoload: false,
    loadTimeoutMs: 200,
  })
  t.after(() => void registry.stop())

  const result = await registry.install({ kind: 'local', path: root })
  assert.equal(result.ok, false)
  const item = result.precheck.blocking[0]
  assert.equal(item.code, 'source/entry-not-found')
  assert.ok(item.fix, '带 fix')
  assert.ok(!item.fix.summary.includes('按消息修复'), '清掉循环表述')
  assert.ok(item.fix.summary.includes('改装') || item.fix.summary.includes('入口'), 'fix.summary 指向可执行动作')
  assert.ok(Array.isArray(item.fix.steps) && item.fix.steps.length > 0, 'fix.steps 给可执行步骤')
})

test('registry.install 对 npm 来源给出"仅本地路径"指引（Q1 裁决一致性）', async (t) => {
  const root = tmpRoot(t)
  const ctx = new Context()
  const registry = new ToolkitRegistryCore(cordisHost(ctx), {
    servicePrefix: 't0',
    statePath: join(root, 'state.json'),
    autoload: false,
  })
  t.after(() => void registry.stop())
  const result = await registry.install({ kind: 'npm', spec: 'some-pkg' })
  assert.equal(result.ok, false)
  assert.equal(result.precheck.blocking[0].code, 'source/source-not-supported')
  assert.ok(result.precheck.blocking[0].fix.summary.includes('本地路径'))
})
