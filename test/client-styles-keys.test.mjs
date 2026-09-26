// W2-3（F-74）· 客户端 styles 键引用全量对账钉。
//
// 失真（清单 :344，代理全量 key 比对唯一一例；W2-3 复算复现）：client/index.js:1588
// 引用 `styles.issueWarn`，而 styles 对象只有 `issueWarning` ⇒ "体检回滚暂不可用"
// 警示条 style=undefined、无配色渲染。本钉把"全量 key 比对"变成常设断言：
// client 内所有 `styles.XXX` 引用必须 ⊆ styles 对象定义键集——任何新增拼错即红。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const clientSrc = readFileSync(join(root, 'panel', 'client', 'index.js'), 'utf8');

test('W2-3·styles 引用全量对账：所有 styles.XXX 引用 ⊆ styles 定义键集（修前红：issueWarn）', () => {
  // 定义键集：styles 对象字面量范围内的顶层键（从 `var styles = {` 起大括号配平）
  const decl = clientSrc.indexOf('var styles');
  assert.ok(decl >= 0, '找不到 styles 定义');
  const open = clientSrc.indexOf('{', decl);
  let depth = 0, end = -1;
  for (let k = open; k < clientSrc.length; k++) {
    if (clientSrc[k] === '{') depth++;
    else if (clientSrc[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  const body = clientSrc.slice(open + 1, end);
  const defined = new Set([...body.matchAll(/(?:^|[\n,{]\s*)([A-Za-z_$][\w$]*)\s*:/gm)].map((m) => m[1]));

  // 引用面：全文 styles.XXX
  const refs = [...clientSrc.matchAll(/styles\.([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  assert.ok(refs.length > 0, 'styles 引用面不应为空（对账钉失效应自曝）');

  const unknown = [...new Set(refs.filter((k) => !defined.has(k)))];
  assert.deepEqual(unknown, [], `以下 styles 键未在定义中（渲染即无样式）：${unknown.join(', ')}`);
});
