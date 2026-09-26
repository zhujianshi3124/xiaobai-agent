// W2-2 · F-71 复算翻正的防翻面钉。
//
// 复算定谳（2026-09-26，W2 动工前置复算）：清单 :336（F-71）"健康徽标读 parsed.hasHealthCheck
// ⇒ 恒 undefined、永不出现"的代理读数**不复现**——panel/client/index.js 的健康徽标自
// 44545c0（P5）诞生即读 `p.hasHealthCheck`（数据源＝v2 snapshot entryView 下发的
// `hasHealthCheck`，panel/manager/v2-api.mjs），`parsed.hasHealthCheck` 在该文件任何历史
// 版本（git -S 全量）零命中 ⇒ "永不出现"两前提（读错字段／下发缺字段）均不成立，
// F-71 判读数错账、不修代码。
//
// 本钉把"读取面正确"变成可复跑断言：谁把读取翻面成 payload 里的 parsed.hasHealthCheck
// （payload 只装 {status,items,history}，翻面即真·永不出现），或摘掉 entryView 的
// hasHealthCheck 下发，谁红。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const clientSrc = readFileSync(join(root, 'panel', 'client', 'index.js'), 'utf8');
const v2ApiSrc = readFileSync(join(root, 'panel', 'manager', 'v2-api.mjs'), 'utf8');

test('W2-2·健康徽标读取面＝p.hasHealthCheck（v2 entry 对象），不是 payload 的 parsed.*', () => {
  assert.ok(clientSrc.includes('p.hasHealthCheck ?'), '徽标应读 v2 entry 的 hasHealthCheck');
  assert.ok(!clientSrc.includes('parsed.hasHealthCheck'), '不得翻面读 payload（payload 只装 status/items/history，翻面即永不出现）');
});

test('W2-2·下发面：entryView.hasHealthCheck 在案（读 manifest.healthCheck 函数性）', () => {
  assert.match(v2ApiSrc, /hasHealthCheck:\s*typeof\s+entry\.manifest\.healthCheck\s*===\s*'function'/);
});
