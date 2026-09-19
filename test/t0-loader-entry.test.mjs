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
