// 批 10（批 3 验收令遗留项）· panels 模块绑定最小形状守卫。
//
// 背景（contract.md §2.1 panels 行 + D-13 同笔裁定）：panels 的"数组 + 每项非空 id"
// 承诺此前只在**落盘清单**一路成立（validateManifest 校验）；模块导出路径经
// bindRuntimeStatics 绑定、绕过 validateManifest ⇒ 畸形声明被静默绑定（成员缺 id）
// 或静默忽略（非数组），promise 单路成立。本笔在绑定处补齐另一路（fail-closed）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { resolveLocalSource } from 'dsh-toolkit/registry';

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name) => join(here, 'fixtures', 'registry', name);
const load = (name) => resolveLocalSource({ kind: 'local', path: fx(name) });

test('批10·合法模块 panels 照常绑定（正向，修前即绿）', async () => {
  const resolved = await load('panels-module-ok');
  assert.deepEqual(resolved.manifest.panels, [{ id: 'main', title: 'OK' }]);
});

test('批10·模块 panels 成员缺非空 id ⇒ 装载拒绝（修前红：此前带病绑定）', async () => {
  await assert.rejects(load('panels-module-bad-items'), (err) => {
    assert.equal(err.code, 'plugin-shape-invalid');
    assert.match(String(err.message), /panels/);
    return true;
  });
});

test('批10·模块 panels 非数组 ⇒ 装载拒绝（修前红：此前静默忽略不绑定）', async () => {
  await assert.rejects(load('panels-module-nonarray'), (err) => {
    assert.equal(err.code, 'plugin-shape-invalid');
    return true;
  });
});

test('批10·legacy 合成分支同样受守卫（与 D-9 口径同族：不留半截设计）', async () => {
  await assert.rejects(load('panels-module-legacy-bad'), (err) => {
    assert.equal(err.code, 'plugin-shape-invalid');
    assert.match(String(err.message), /panels/);
    return true;
  });
});
