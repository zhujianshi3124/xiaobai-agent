// W2-1（F-22 + F-76 同族）· 缺席态兜底文案与服务端权威逐字同步钉。
//
// 失真（功能全量清单 :98 / :376）：客户端 ABSENCE_COPY_FALLBACK["true-uninstalled"]
// 仍写"本体已移入保管区 · 可一键恢复"，与销毁式 v2（零副本、不可恢复）**方向相反**；
// 服务端 statusCopy 为权威（snapshot.mjs ABSENCE_COPY），兜底只在 statusCopy 缺失时
// 上屏 ⇒ 平时被遮蔽、异常时误导。本钉把"客户端兜底表 ⊆ 服务端权威表、逐键逐字相同"
// 变成可复跑断言，防止两表再漂移。
//
// 取数＝文本抽取（两文件各抽对象字面量后求值）——与 p1-smoke :337 的文本在场断言
// 同族；不 import 客户端模块（其顶层依赖宿主注入的全局）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const clientSrc = readFileSync(join(root, 'panel', 'client', 'index.js'), 'utf8');
const serverSrc = readFileSync(join(root, 'panel', 'manager', 'snapshot.mjs'), 'utf8');

function extractTable(src, decl) {
  const i = src.indexOf(decl);
  assert.ok(i >= 0, `找不到 ${decl}`);
  const open = src.indexOf('{', i);
  // 大括号配平抽字面量
  let depth = 0, end = -1;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  return new Function(`return (${src.slice(open, end + 1)})`)();
}

const FALLBACK = extractTable(clientSrc, 'var ABSENCE_COPY_FALLBACK');
const AUTHORitative = extractTable(serverSrc, 'const ABSENCE_COPY');

test('W2-1·兜底表键集 ⊆ 服务端权威表键集（客户端不得自造状态）', () => {
  for (const key of Object.keys(FALLBACK)) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(AUTHORitative, key),
      `兜底表键 "${key}" 在服务端 ABSENCE_COPY 中不存在`,
    );
  }
});

test('W2-1·逐键逐字相同：true-uninstalled 翻正为销毁式语义（修前红：方向相反）', () => {
  assert.equal(
    FALLBACK['true-uninstalled'],
    AUTHORitative['true-uninstalled'],
    '真卸载兜底文案须与服务端权威逐字相同',
  );
  assert.doesNotMatch(FALLBACK['true-uninstalled'], /保管区|可一键恢复/, '不得再宣称"有副本可恢复"（销毁式 v2）');
});

test('W2-1·逐键逐字相同：其余键不得漂移（修前红：unknown-absent 简写与权威不同字）', () => {
  for (const key of Object.keys(FALLBACK)) {
    if (key === 'true-uninstalled') continue;
    assert.equal(FALLBACK[key], AUTHORitative[key], `兜底表 "${key}" 与服务端权威不同字`);
  }
});
