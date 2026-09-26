// W2 余件 F-73 · 恢复弹窗 custody 死参数收口钉（静态源码钉，常设口径⑤：锚与真代码形态共振）
//
// 复算（2026-09-26，现 HEAD 行读数）：恢复弹窗的 custody 是**双重死参数**——
//   React：三处 setDlg({kind:"restore",…})（:1200/:1219/:1252）均不带 custody ⇒ dlg.custody 恒
//   undefined ⇒ :1329 `custody: dlg.custody` 传 undefined ⇒ RestoreDialog :1083 传给
//   restoreCopyOf 第三形参 ⇒ 函数体（:954-966）完全不引用（传得错、就算传对也没人读）。
//   HTML：restoreDialogHtml(p, kind, custody, …) 第三形参同样不被函数体引用，三处调用全传 null。
// 修法＝诚实收死参（签名与调用链去 custody，输出面零变化）；"弹窗展示卸载收据信息"属产品级
// 增强选项，记档随批呈协调侧、不在本笔扩。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')

test('F-73 · React restoreCopyOf 签名恰两参、函数体内零 custody 引用', () => {
  const src = read('panel/client/index.js')
  const i = src.indexOf('function restoreCopyOf(')
  assert.ok(i >= 0, 'restoreCopyOf 必须在案')
  const sigEnd = src.indexOf(')', i) + 1
  const sig = src.slice(i, sigEnd)
  assert.equal(sig, 'function restoreCopyOf(plugin, mode)', '签名不得再带 custody 形参: ' + sig)
  const body = src.slice(sigEnd, src.indexOf('function DialogLine', i))
  assert.ok(!body.includes('custody'), '函数体内不得引用 custody（死参不得回潮）')
})

test('F-73 · React 弹窗 props 不再把 dlg.custody 传给对话框（死链收口）', () => {
  const src = read('panel/client/index.js')
  assert.ok(!src.includes('custody: dlg.custody'), 'custody: dlg.custody 死链必须移除')
  assert.ok(!src.includes('props.custody'), 'RestoreDialog 的 props.custody 透传必须移除')
})

test('F-73 · HTML restoreDialogHtml 签名恰四参、调用点无 custody 位、函数体零引用', () => {
  const src = read('panel/client/panel.html')
  const i = src.indexOf('function restoreDialogHtml(')
  assert.ok(i >= 0, 'restoreDialogHtml 必须在案')
  const sigEnd = src.indexOf(')', i) + 1
  const sig = src.slice(i, sigEnd)
  assert.equal(sig, 'function restoreDialogHtml(p, kind, conflict, choices)', '签名不得再带 custody 形参: ' + sig)
  const calls = [...src.matchAll(/restoreDialogHtml\(([^)]*)\)/g)].map((m) => m[1])
  assert.equal(calls.filter((c) => c === 'p, kind, conflict, choices').length, 1, '签名捕获应恰一处')
  const realCalls = calls.filter((c) => c !== 'p, kind, conflict, choices')
  assert.equal(realCalls.length, 3, '调用点应恰三处: ' + JSON.stringify(realCalls))
  for (const c of realCalls) {
    assert.ok(c.split(',').length <= 4, '调用参数位不得再有 custody 位: ' + c)
    assert.ok(!/null,\s*null/.test(c), '旧 custody+conflict 双 null 形态不得回潮: ' + c)
  }
  const body = src.slice(sigEnd, src.indexOf('function ', i + 10))
  assert.ok(!body.includes('custody'), '函数体内不得引用 custody（死参不得回潮）')
})
