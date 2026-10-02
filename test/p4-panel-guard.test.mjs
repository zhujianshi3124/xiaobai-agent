// ★13 / 批 7 · 面板守卫自证钉
//
// 守卫 = scripts/p4-no-subplugin-import-check.mjs。本文件干两件事：
//   1) 把泛化后的**判据本身**当被测对象喂合成输入（recon 批 7 格要求的
//      "造一个面板文件里出现第三方插件字面量的反例 ⇒ 期望红"就是这里的第 ① 发）；
//   2) 钉住"扫描面动态、豁免不死、豁免不外溢到 import 规则"这三条**防漂移**性质。
// 真跑全仓的那一发（⑦）等价于门禁里的那一步，判 0 命中。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

import {
  collectSubPluginNames,
  isFrameworkDependency,
  scanText,
  listScannedFiles,
  NAME_EXEMPTIONS,
  LAZY_PROBE_EXEMPTIONS,
  runCheck,
} from '../scripts/p4-no-subplugin-import-check.mjs'

const ROOT = resolve(import.meta.dirname, '..')

test('① 守卫自证（recon 批 7 要求的那一发）：面板文件里出现第三方插件字面量 ⇒ 判红', () => {
  const names = collectSubPluginNames()
  const hit = scanText({
    text: 'const target = "someone-elses-plugin"\nif (dir === "@someone/plugin-x") render()\n',
    names,
    exemptNames: false,
  })
  assert.ok(hit.some((h) => h.rule === 'identity'), 'scoped 插件身份必须被抓到')
  assert.ok(!hit.some((h) => h.line === 2 && h.rule !== 'identity'), '非插件形状不得混进来')
})

test('② 判据是派生的，不是手写的：名字集 == lib/ 目录 + 套件 aliases 末段（新增插件自动进面）', async () => {
  const { mkdtempSync, mkdirSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const fromDisk = readdirSync(join(ROOT, 'lib'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  const names = collectSubPluginNames()
  assert.deepEqual([...fromDisk].sort(), [...names].filter((n) => fromDisk.includes(n)).sort(), 'lib/ 下每个插件目录都必须在判据里')
  // 可证伪的泛化：临时造一个"第 N+1 个插件目录"与一条新 alias，同一段代码必须把两个名字都长出来
  const fake = mkdtempSync(join(tmpdir(), 'p4-derive-'))
  mkdirSync(join(fake, 'brand-new-plugin'))
  const derived = collectSubPluginNames({ libDir: fake, aliases: { '@x/one': '@scope/dsh-another-one' } })
  assert.ok(derived.includes('brand-new-plugin'), '新目录名必须自动进判据（否则"泛化"是假的）')
  assert.ok(derived.includes('another-one'), '新 alias 末段（去 dsh- 前缀）必须自动进判据')
})

test('⑨ 名字判据是整词形，不得把长标识符误判成点名（apply-engine 同族坑）', () => {
  const names = collectSubPluginNames()
  const falseFriend = scanText({ text: 'const s = "search-router-extra-not-a-plugin"\nconst t = rateThrottleX\n', names, exemptNames: false })
  assert.equal(falseFriend.filter((h) => h.rule === 'name').length, 0, '子串命中 = 判据过宽，会把无关标识符判成点名')
  const real = scanText({ text: 'const s = "search-router"\n', names, exemptNames: false })
  assert.ok(real.some((h) => h.rule === 'name'), '真点名必须抓到（前一格不许是靠判据失灵变绿的）')
})

test('③ 注释行不参与判据（纪律管依赖面与身份面，不管散文）', () => {
  const names = collectSubPluginNames()
  // exemptNames 必须留 false：否则等于把点名规则关掉再证"注释不报"，那是一格空洞断言。
  const hit = scanText({ text: '// 历史缺陷：rate-throttle 自身块曾被覆盖\n * compact-router 用目录名（无 patch 行）\n', names, exemptNames: false })
  assert.equal(hit.length, 0, '纯注释行不得产生命中')
  const sameWordsInCode = scanText({ text: 'const a = "rate-throttle"\nconst b = "compact-router"\n', names, exemptNames: false })
  assert.equal(sameWordsInCode.length, 2, '同样两个名字写在代码位必须各命中一次（前一格不许是靠判据失灵变绿的）')
})

test('④ 框架依赖不误报：package.json 声明过的 @scope 名不算插件身份', () => {
  assert.equal(isFrameworkDependency('@deepseek-ai/cordis'), true)
  assert.equal(isFrameworkDependency('@deepseek-ai/schemastery'), true)
  assert.equal(isFrameworkDependency('@someone/plugin-x'), false, '没声明成依赖的 scoped 名 = 插件身份')
  const names = collectSubPluginNames()
  const hit = scanText({ text: "import { Inject } from '@deepseek-ai/cordis'\n", names, exemptNames: false })
  assert.equal(hit.filter((h) => h.rule === 'identity').length, 0, '真依赖不得被身份规则抓走')
})

test('⑤ lib/ 模块引用照旧判红，且豁免文件也不放过（豁免只免"点名"，未免"import"）', () => {
  const names = collectSubPluginNames()
  for (const exempt of NAME_EXEMPTIONS) {
    const hit = scanText({
      text: `import x from './lib/${exempt.file ? 'agent-memory' : 'agent-memory'}/index.js'\n`,
      names,
      exemptNames: true,
    })
    assert.ok(hit.some((h) => h.rule === 'module'), `${exempt.file} 的豁免不得覆盖 lib/ 引用判据`)
  }
  const viaExemptFile = scanText({ text: 'const p = require("../lib/rate-throttle/plugin.js")\n', names, exemptNames: true })
  assert.ok(viaExemptFile.some((h) => h.rule === 'module'), 'require 形态')
  // 三种模块引用形态各自都要有牙（本批施工中途曾把 import() 那条写成 \s+，静默漏判过一形）
  const dynamicForm = scanText({ text: "const m = await import('./lib/agent-memory/index.js')\n", names, exemptNames: true })
  assert.ok(dynamicForm.some((h) => h.rule === 'module'), '动态 import() 形态')
  const noSpace = scanText({ text: `import x from 'dsh-toolkit/lib/agent-memory';\n`, names, exemptNames: true })
  assert.ok(noSpace.some((h) => h.rule === 'module'), 'import 与 ( 之间无空格也必须抓到')
})

test('⑥ 扫描面动态：panel/manager 下每个 .mjs 都在面内，新增文件自动进面', () => {
  const scanned = listScannedFiles().map((f) => f.rel)
  const onDisk = readdirSync(join(ROOT, 'panel', 'manager')).filter((f) => f.endsWith('.mjs')).map((f) => `panel/manager/${f}`)
  for (const f of onDisk) assert.ok(scanned.includes(f), `${f} 不在扫描面内 = 扩面失效`)
  assert.ok(onDisk.length >= 10, `panel/manager 实测文件数异常：${onDisk.length}`)
  assert.ok(scanned.includes('index.js') && scanned.includes('panel/index.js'), '根入口与面板服务端必须在面内')
  assert.ok(scanned.includes('panel/client/panel.html'), '兜底页本批起进面（此前完全不在任何守卫里）')
})

test('⑦ 豁免登记不得有死条目：每条必须在当前树里有真实点名（防豁免腐烂）', () => {
  const names = collectSubPluginNames()
  for (const ex of NAME_EXEMPTIONS) {
    const file = join(ROOT, ex.file)
    assert.ok(existsSync(file), `豁免指向的文件不存在：${ex.file}`)
    assert.ok(typeof ex.reason === 'string' && ex.reason.length >= 12, `${ex.file} 的豁免必须写清依据`)
    const hits = scanText({ text: readFileSync(file, 'utf8'), names, exemptNames: false })
    assert.ok(hits.some((h) => h.rule !== 'module'), `${ex.file} 挂着豁免却没有任何"点名"命中 = 死条目，请删`)
  }
})

test('⑧ 真跑全仓：当前零命中（门禁等价物）', () => {
  const r = runCheck()
  assert.equal(r.hits.length, 0, `命中清单：\n${r.hits.map((h) => `${h.rel}:${h.line} [${h.rule}] ${h.text}`).join('\n')}`)
  assert.ok(r.files.length >= 16, `扫描文件数异常（扩面后应覆盖 panel/manager 全部）：${r.files.length}`)
})

test('⑬ 惰性探测通道豁免（S4 F-37，口径 ④）：登记文件必活、依据必写清、通道收口在登记面内', () => {
  assert.ok(Array.isArray(LAZY_PROBE_EXEMPTIONS))
  for (const ex of LAZY_PROBE_EXEMPTIONS) {
    const file = join(ROOT, ex.file)
    assert.ok(existsSync(file), `豁免指向的文件不存在：${ex.file}`)
    assert.ok(typeof ex.reason === 'string' && ex.reason.length >= 12, `${ex.file} 的豁免必须写清依据`)
    const src = readFileSync(file, 'utf8')
    assert.ok(/import\s*\(\s*['"`]/.test(src), `${ex.file} 挂着惰性探测豁免却没有任何动态 import ＝ 死条目，请删（防豁免腐烂）`)
    assert.ok(/\blib\//.test(src), `${ex.file} 的动态 import 应指向 lib/ 模块（豁免判据面）`)
  }
  // 通道收口：豁免登记只许指向 panel/（面板数据面之外不得借通道进来）
  for (const ex of LAZY_PROBE_EXEMPTIONS) {
    assert.ok(ex.file.startsWith('panel/'), `惰性探测豁免只许登记 panel/ 下文件：${ex.file}`)
  }
})

test('⑭ 豁免不外溢：登记文件之外，module 规则照旧有牙（exemptModule 不进 name 豁免面）', () => {
  const names = collectSubPluginNames()
  const hit = scanText({ text: "const m = await import('../lib/agent-memory/lib/index.js')\n", names, exemptNames: true, exemptModule: false })
  assert.ok(hit.some((h) => h.rule === 'module'), '未豁免文本的动态 import 必须照抓')
  const quiet = scanText({ text: "const m = await import('../lib/agent-memory/lib/index.js')\n", names, exemptNames: true, exemptModule: true })
  assert.equal(quiet.filter((h) => h.rule === 'module').length, 0, 'exemptModule=true 才豁免 module 规则')
  const r = runCheck()
  assert.deepEqual(r.lazyProbe, LAZY_PROBE_EXEMPTIONS.map((e) => e.file), '真跑登记面与清单一致')
})
