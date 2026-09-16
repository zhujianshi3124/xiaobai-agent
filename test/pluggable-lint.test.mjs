import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const lintScript = fileURLToPath(new URL('../scripts/pluggable-lint.mjs', import.meta.url));

function makeSandbox(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pluggable-lint-'));
  try {
    fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'test'), { recursive: true });
    for (const [rel, body] of Object.entries(files)) {
      const full = path.join(dir, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, body + '\n');
    }
    return dir;
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw err;
  }
}

function runLint(dir) {
  return spawnSync(process.execPath, [lintScript, dir], { encoding: 'utf8' });
}

test('pluggable-lint：静态 import 兄弟插件必须报出', () => {
  const dir = makeSandbox({
    'lib/rate-throttle/bad-static.mjs': "import { x } from '../compact-router/index.js';",
    'lib/compact-router/index.mjs': "export const x = 1;",
  });
  try {
    const r = runLint(dir);
    assert.equal(r.status, 1, r.stderr || r.stdout);
    assert.match(r.stderr, /静态 import/);
    assert.match(r.stderr, /\/compact-router\/index\.js/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('pluggable-lint：eager re-export 必须报出', () => {
  const dir = makeSandbox({
    'lib/rate-throttle/bad-reexport.mjs': "export { x } from '../compact-router/index.js';",
    'lib/compact-router/index.mjs': "export const x = 1;",
  });
  try {
    const r = runLint(dir);
    assert.equal(r.status, 1, r.stderr || r.stdout);
    assert.match(r.stderr, /eager re-export/);
    assert.match(r.stderr, /\/compact-router\/index\.js/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('pluggable-lint：动态 import / 自身引用 / 第三方包不误报', () => {
  const dir = makeSandbox({
    'lib/rate-throttle/ok-dynamic.mjs': "const m = await import('../compact-router/index.js');",
    'lib/rate-throttle/ok-self.mjs': "import { x } from './internal.js';",
    'lib/rate-throttle/ok-third.mjs': "import { x } from '@deepseek-ai/cordis';",
  });
  try {
    const r = runLint(dir);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.doesNotMatch(r.stderr, /跨插件静态依赖违规/);
    assert.match(r.stdout, /通过/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test('pluggable-lint：test/ 内静态 import 兄弟插件必须报出', () => {
  const dir = makeSandbox({
    'lib/rate-throttle/bad.mjs': "export const x = 1;",
    'test/rate-throttle.bad.test.mjs': "import { x } from '../lib/compact-router/index.js';",
    'lib/compact-router/index.mjs': "export const x = 1;",
  });
  try {
    const r = runLint(dir);
    assert.equal(r.status, 1, r.stderr || r.stdout);
    assert.match(r.stderr, /静态 import/);
    assert.match(r.stderr, /compact-router/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('pluggable-lint：自身插件命名的集成测试动态引用兄弟插件放行', () => {
  const dir = makeSandbox({
    'lib/agent-memory/index.mjs': "export const a = 1;",
    'lib/compact-router/index.mjs': "export const b = 2;",
    'test/agent-memory.compact-router.integration.test.mjs': "import { a } from '../lib/agent-memory/index.mjs';\nconst m = await import('../lib/compact-router/index.js');",
  });
  try {
    const r = runLint(dir);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    assert.doesNotMatch(r.stderr, /跨插件静态依赖违规/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
