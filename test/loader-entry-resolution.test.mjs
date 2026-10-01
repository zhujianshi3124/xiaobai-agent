// D-7 · 入口解析三级顺序（Pack F2，2026-09-21 裁定第 1 案）
//
// 裁定：`requirements.exports` 是入口声明的**正典位置**（上一轮"禁双读、只读顶层"的
// 裁定已显式撤销——顶层 exports 不在 doctor 的清单根字段白名单里，写上去就产 error）。
// 解析顺序：① requirements.exports['.']（$from 继承指针按语义换成 package.json#exports）
// → ② 顶层 exports['.']（legacy 兼容，命中必 warn）→ ③ package.json 的 exports['.']/main
// （宿主 Node 约定，T0/G1）→ ④ index.js/index.mjs 目录惯例。
// 红线：①② 这类显式声明指向不存在的文件 ⇒ entry-not-found，**不静默回退**。
//
// 本文件的夹具（test/fixtures/registry/entry-*）每个都带一个 index.js 哨兵诱饵，
// name 前缀 DECOY-：任何一级解析被摘掉都会落到诱饵上，对应用例即精确翻红。
//
// B1 验收口径（情形 A，用户已裁）：`lib/agent-memory` 的正典声明 "." 指向 lib/index.js
// （指令台账数据库，非插件形态），manifest 不改 ⇒ 按目录路径装载产出**结构化可执行
// 报错**，这是终态设计行为不是缺陷；显式文件路径 plugin.js 的装载行为不变（第 6 例）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'

import { resolveLocalSource, ToolkitRegistryCore, cordisHost } from '@local/dsh-toolkit/registry'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const fixtureDir = (name) => join(ROOT, 'test', 'fixtures', 'registry', name)
/** 夹具插件身份：解析结果必须等于"被声明的那一份"，等于 DECOY 即为翻红。 */
const pluginName = async (entryPath) => (await import(new URL('file:///' + entryPath.replace(/\\/g, '/')).href)).name

const silent = { info: () => {}, warn: () => {}, error: () => {} }

// ── ① 四个内置插件（web-search-local 已随开源 S1 剔除批出包）+ 套件根：逐条断言来源与结果 ──

const BUILTINS_WITH_INDEX = [
  ['compact-router', 'lib/compact-router'],
  ['rate-throttle', 'lib/rate-throttle'],
  ['search-router', 'lib/search-router'],
]

for (const [label, rel] of BUILTINS_WITH_INDEX) {
  test(`F2①：内置 ${label} 入口来自正典 requirements.exports['.']，且与目录惯例指向同一文件（一致记案）`, async () => {
    const dir = join(ROOT, rel)
    const manifest = JSON.parse(readFileSync(join(dir, 'dsh.plugin.json'), 'utf8'))
    const declared = manifest.requirements.exports['.']
    assert.equal(declared, './index.js', `${label} 的正典声明本身就是 index.js ⇒ 本裁定对它零翻面`)

    const resolved = await resolveLocalSource({ kind: 'local', path: dir })
    assert.equal(resolved.entrySource, 'manifest.requirements.exports', '来源必须是正典那一级')
    assert.equal(resolved.entryPath, join(dir, declared))
    assert.deepEqual(resolved.entryWarnings, [], '正典命中且无重复声明 ⇒ 不该有任何告警')
    assert.equal(resolved.legacy, false)
    assert.match(resolved.manifest.id, /^dsh\//)
  })
}

test('F2①：agent-memory 的正典声明与目录惯例不一致（不一致记案，以 manifest 为准）', () => {
  const dir = join(ROOT, 'lib/agent-memory')
  const manifest = JSON.parse(readFileSync(join(dir, 'dsh.plugin.json'), 'utf8'))
  assert.equal(manifest.requirements.exports['.'], './lib/index.js')
  assert.ok(existsSync(join(dir, 'lib/index.js')), '正典目标真实存在 ⇒ 属情形 A（语义性），不是情形 B（同步缺陷）')
  assert.equal(existsSync(join(dir, 'index.js')), false, '目录下没有 index.js ⇒ 旧实现走惯例兜底必然 entry-not-found')
})

test('F2①：套件根 requirements.exports 的 $from 继承指针按语义解析到 package.json 的 "."', async () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'dsh.plugin.json'), 'utf8'))
  assert.equal(manifest.requirements.exports['$from'], 'package.json#exports')
  const resolved = await resolveLocalSource({ kind: 'local', path: ROOT })
  assert.equal(resolved.entrySource, 'manifest.requirements.exports($from)')
  assert.equal(resolved.entryPath, join(ROOT, 'index.js'), '$from 的表就是 package.json#exports，其 "." 为 ./index.js')
  assert.deepEqual(resolved.entryWarnings, [])
})

// ── ② legacy 顶层声明：装载成功 + warn ──────────────────────────────────

test('F2②：只有顶层 exports（legacy 位）时解析成功、命中真实声明那份而非诱饵，并带 warn', async () => {
  const dir = fixtureDir('entry-legacy-top')
  const resolved = await resolveLocalSource({ kind: 'local', path: dir })
  assert.equal(resolved.entrySource, 'manifest.exports(legacy)')
  assert.equal(resolved.entryPath, join(dir, 'legacy-entry.js'))
  assert.notEqual(await pluginName(resolved.entryPath), 'fixture-entry-legacy-top-DECOY-indexjs', '不得落到目录惯例诱饵')
  assert.equal(resolved.entryWarnings.length, 1)
  assert.match(resolved.entryWarnings[0], /legacy 位置/)
  assert.match(resolved.entryWarnings[0], /requirements\.exports/, 'warn 要说清正典位置在哪')
})

test('F2②：legacy 告警确实经 registry 的 A1 warn 通道落日志（不只是返回给调用方）', async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'f2-warn-'))
  t.after(() => rmSync(tmp, { recursive: true, force: true }))
  const warns = []
  const core = new ToolkitRegistryCore(cordisHost(new Context()), {
    servicePrefix: 'toolkit',
    statePath: join(tmp, 'state.json'),
    autoload: false,
    retryBackoffMs: 1,
    loadTimeoutMs: 200,
    logger: { ...silent, warn: (message, meta) => warns.push({ message, meta }) },
  })
  core.start()
  t.after(() => core.stop())

  const result = await core.install({ kind: 'local', path: fixtureDir('entry-legacy-top') })
  assert.equal(result.ok, true, 'legacy 位装载成功（warn 不阻断）')
  const hit = warns.find((w) => w.meta?.event === 'entry-declaration')
  assert.ok(hit, '必须有一条 event=entry-declaration 的 warn')
  assert.match(hit.message, /legacy 位置/)
  assert.equal(hit.meta.pluginId, 'fixture/entry-legacy-top')
  assert.equal(hit.meta.errorCode, 'legacy-entry-declaration')
})

// ── ③ 双声明并存：正典赢 + warn ─────────────────────────────────────────

test('F2③：正典与顶层同时声明 ⇒ 正典赢，并 warn 指出忽略了哪一份重复声明', async () => {
  const dir = fixtureDir('entry-dual')
  const resolved = await resolveLocalSource({ kind: 'local', path: dir })
  assert.equal(resolved.entrySource, 'manifest.requirements.exports')
  assert.equal(resolved.entryPath, join(dir, 'canonical-entry.js'))
  assert.equal(await pluginName(resolved.entryPath), 'fixture-entry-dual-canonical')
  assert.equal(resolved.entryWarnings.length, 1)
  assert.match(resolved.entryWarnings[0], /双声明并存/)
  assert.ok(resolved.entryWarnings[0].includes('requirements.exports'), '要点名生效的是正典位置')
  assert.match(resolved.entryWarnings[0], /legacy-entry\.js/, '要点名被忽略的那一份指向哪里')
})

// ── 红线：显式声明指向不存在的文件 ⇒ 不回退 ─────────────────────────────

test('F2 红线：正典声明的文件不存在 ⇒ entry-not-found，绝不回退到目录惯例', async () => {
  const dir = fixtureDir('entry-missing-declared')
  await assert.rejects(
    () => resolveLocalSource({ kind: 'local', path: dir }),
    (error) => {
      assert.equal(error.code, 'entry-not-found')
      assert.match(error.message, /declared-but-absent\.js/, '要给声明的相对路径')
      assert.ok(error.message.includes(join(dir, 'declared-but-absent.js')), '要给拼好的绝对路径')
      assert.match(error.message, /不会.*回退/, '要写明不回退的理由（manifest 与实现同步是红线）')
      return true
    },
  )
})

// ── ④ 情形 A：agent-memory 目录装载产出结构化可执行报错；显式路径行为不变 ──

test('F2④ 情形 A：按目录装 lib/agent-memory ⇒ plugin-shape-invalid，文案点名同表 ./plugin', async () => {
  const dir = join(ROOT, 'lib/agent-memory')
  await assert.rejects(
    () => resolveLocalSource({ kind: 'local', path: dir }),
    (error) => {
      assert.equal(error.code, 'plugin-shape-invalid')
      assert.match(error.message, /requirements\.exports/, '要说清是按正典表解析的')
      assert.match(error.message, /'\.\/plugin'/, '要点名同表的插件子路径键')
      assert.match(error.message, /plugin\.js/, '要点名可改装的真实文件')
      assert.match(error.message, /不代为挑选/, '不得暗示装载器会自动猜')
      return true
    },
  )
})

test('F2④ 情形 A 的另一半：显式文件路径 lib/agent-memory/plugin.js 装载行为不变（契约插件、非 legacy）', async () => {
  const resolved = await resolveLocalSource({ kind: 'local', path: join(ROOT, 'lib/agent-memory/plugin.js') })
  assert.equal(resolved.entrySource, 'explicit-file', '来源本身就是文件时不经解析顺位')
  assert.deepEqual(resolved.entryWarnings, [])
  assert.equal(resolved.legacy, false)
  assert.equal(resolved.manifest.id, 'dsh/agent-memory')
  assert.equal(resolved.entryPath, join(ROOT, 'lib/agent-memory/plugin.js'))
})

// ── ⑤ dsh-repo-spec 真目录只读解析冒烟（legacy 形态不回归）──────────────

const REPO_SPEC = 'D:/dsh-test-sandbox/dsh-repo-spec'

test('F2⑤：dsh-repo-spec/packages/dsh-plugin（无 dsh.plugin.json 的 legacy 真件）解析不回归', { skip: !existsSync(REPO_SPEC) }, async () => {
  const dir = join(REPO_SPEC, 'packages/dsh-plugin')
  const resolved = await resolveLocalSource({ kind: 'local', path: dir })
  assert.equal(resolved.entrySource, 'package.json#exports', '没有 manifest 声明 ⇒ 走宿主 Node 约定层，不是目录惯例')
  assert.equal(resolved.entryPath, join(dir, 'dist/index.js'))
  assert.equal(resolved.legacy, true)
  assert.equal(resolved.manifest.id, 'legacy/dsh-repo-spec')
  assert.deepEqual(resolved.entryWarnings, [], 'legacy 位告警只针对 manifest 顶层 exports，与 package.json 无关')
})

test('F2⑤：dsh-repo-spec monorepo 根仍报 entry-not-found 并给子包候选', { skip: !existsSync(REPO_SPEC) }, async () => {
  await assert.rejects(
    () => resolveLocalSource({ kind: 'local', path: REPO_SPEC }),
    (error) => {
      assert.equal(error.code, 'entry-not-found')
      assert.match(error.message, /dsh-plugin/, '候选子包指引不能丢')
      return true
    },
  )
})
