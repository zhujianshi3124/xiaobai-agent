/**
 * agent-memory .tmp 孤儿回收钉（EXE-BOOT-010 开工令 2）—— 原子写失败路径清理＋启动清扫。
 *
 * 双向钉：正向＝atomicWrite 失败不留 .tmp（SWEEP-3）、register 启动清扫按年龄回收孤儿（SWEEP-1）；
 * 反向＝新鲜/在飞 tmp 不动（SWEEP-2 年龄闸）、目录与非 tmp 形状一律不碰（SWEEP-4）、
 * root 缺席无事可做（SWEEP-5）。
 *
 * 隔离：全部 mkdtemp 临时 root（对齐家族生产根护栏），生产根零触碰——真实生产根的 9/14
 * 残件由插件下一次真实挂载时按本机制回收，测试与执行侧均不代删。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { register as registerPlugin } from '../lib/agent-memory/plugin.js';
import { atomicWrite, sweepTmpOrphans, TMP_SWEEP_MIN_AGE_MS } from '../lib/agent-memory/lib/atomic.js';
import { PRODUCTION_ROOT } from '../lib/agent-memory/lib/script-guard.js';

function tmpRoot() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-memory-tmpsweep-'));
  if (path.resolve(d) === PRODUCTION_ROOT) {
    console.error('[护栏] tmpRoot 解析出生产根，中止');
    process.exit(3);
  }
  return d;
}
function tmpNames(dir) {
  return fs.readdirSync(dir).filter((n) => n.startsWith('.tmp-'));
}
function seedTmp(dir, name, ageMs) {
  const p = path.join(dir, name);
  fs.writeFileSync(p, 'orphan', 'utf8');
  if (ageMs !== undefined) {
    const t = (Date.now() - ageMs) / 1000;
    fs.utimesSync(p, t, t);
  }
  return p;
}

test('SWEEP-1: 启动清扫（插件级）——register 即扫：超龄 .tmp 孤儿逐层回收、新鲜与无关文件不动', () => {
  const root = tmpRoot();
  const oldTop = seedTmp(root, '.tmp-999-aaaaaaaaaaaa', 10 * 60 * 1000);
  const freshTop = seedTmp(root, `.tmp-${process.pid}-bbbbbbbbbbbb`);
  const bystander = seedTmp(root, 'not-tmp.txt', 10 * 60 * 1000);
  const sub = path.join(root, 'sessions', '20260910-00000001');
  fs.mkdirSync(sub, { recursive: true });
  const oldSub = seedTmp(sub, '.tmp-998-cccccccccccc', 10 * 60 * 1000);

  const ctx = {
    on() {},
    logger: { info() {} },
  };
  registerPlugin(ctx, { dataRoot: root });

  assert.equal(fs.existsSync(oldTop), false, '根层超龄孤儿已回收');
  assert.equal(fs.existsSync(oldSub), false, '子目录超龄孤儿已回收（递归走层）');
  assert.equal(fs.existsSync(freshTop), true, '新鲜 tmp 不动（在飞保护）');
  assert.equal(fs.existsSync(bystander), true, '非 tmp 形状文件不动');
  assert.deepEqual(tmpNames(root), [`.tmp-${process.pid}-bbbbbbbbbbbb`]);
});

test('SWEEP-2: 年龄闸（单元级，注入时钟）——超限回收、未满不动、maxAgeMs 可覆盖', () => {
  const root = tmpRoot();
  const now = 1_700_000_000_000;
  const oldP = path.join(root, '.tmp-1-111111111111');
  const newP = path.join(root, '.tmp-1-222222222222');
  fs.writeFileSync(oldP, 'x');
  fs.writeFileSync(newP, 'x');
  const oldT = (now - (TMP_SWEEP_MIN_AGE_MS + 1000)) / 1000;
  const newT = (now - 10 * 1000) / 1000;
  fs.utimesSync(oldP, oldT, oldT);
  fs.utimesSync(newP, newT, newT);

  let res = sweepTmpOrphans(root, { now });
  assert.deepEqual(res.removed, [oldP], '恰回收超龄一枚');
  assert.equal(fs.existsSync(newP), true, '未满龄不动');
  assert.deepEqual(res.errors, []);

  res = sweepTmpOrphans(root, { now, maxAgeMs: 5000 });
  assert.deepEqual(res.removed, [newP], 'maxAgeMs 收紧后 10s 旧档也过闸');
  assert.equal(fs.existsSync(oldP), false);
});

test('SWEEP-3: 原子写失败路径清理——目标为目录时 rename 必败，原错误照传且不留 .tmp 孤儿', () => {
  const root = tmpRoot();
  const dir = path.join(root, 'sub');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, 'target');
  fs.mkdirSync(target); // 目标是目录 ⇒ renameSync 必败
  assert.throws(() => atomicWrite(target, 'x'), (e) => e instanceof Error && !!e.code,
    '失败语义零变化（原错误照传）');
  assert.deepEqual(tmpNames(dir), [], '失败路径不留 .tmp 孤儿');
  assert.equal(fs.statSync(target).isDirectory(), true, '目标目录原样（不被写穿）');
});

test('SWEEP-4: 形状安全——目录即便名合 .tmp 形状也不回收；不合形状文件不回收', () => {
  const root = tmpRoot();
  const fakeDir = path.join(root, '.tmp-777-dddddddddddd');
  fs.mkdirSync(fakeDir, { recursive: true });
  fs.writeFileSync(path.join(fakeDir, 'inside'), 'keep', 'utf8');
  const notTmp = seedTmp(root, '.tmpnot-a-file', 10 * 60 * 1000);
  const weird = seedTmp(root, '.tmp-777-UPPERCASE', 10 * 60 * 1000); // hex 形状不合

  const res = sweepTmpOrphans(root, { now: Date.now() });

  assert.equal(fs.existsSync(fakeDir) && fs.statSync(fakeDir).isDirectory(), true, '合名目录不碰');
  assert.equal(fs.existsSync(path.join(fakeDir, 'inside')), true, '目录内容零触碰');
  assert.equal(fs.existsSync(notTmp), true, '非 tmp 形状不回收');
  assert.equal(fs.existsSync(weird), true, '非 hex 形状不回收');
  assert.deepEqual(res.removed, [], '零误收');
});

test('SWEEP-5: root 缺席——无事可做不抛错', () => {
  const missing = path.join(tmpRoot(), 'no-such-dir');
  const res = sweepTmpOrphans(missing);
  assert.deepEqual(res, { removed: [], errors: [] });
});
