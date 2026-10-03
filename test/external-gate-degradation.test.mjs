import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve, dirname } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NODE = process.execPath;

// 外部门禁缺席降级（2026-10-02 收尾批，EXE-BOOT-024 续用）：
// 运行期目录（.panel-backups／.panel-custody／.registry 等，.gitignore 声明"运行期产物，不入库"）
// 缺席＝外部克隆环境正常形态——相关格显式 SKIP（不崩红不静默，"缺席明示"与 doctor 修复同款），
// doc-ref-guard 对运行期面引用缺席改判 SKIP 计数；本机（目录在场）行为不变。
// 两态钉：静态钉（门控在源码，变异即红）＋在场态行为钉（本机子进程照跑、零 SKIP）＋
// guard 自证格两态（合成树，随每轮门禁自跑）；缺席态行为由"干净克隆实跑"承担（外部口径复验实档）。

test('静态钉：p22b 含 E4/E1e 运行期缺席明示 SKIP 门控', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'p22b-retention-scope.mjs'), 'utf8');
  assert.match(src, /const e4Present = existsSync\(manualArchiveRoot\) && existsSync\(engineDefaultRoot\)/);
  assert.match(src, /function skip\(label, reason\)/);
  assert.match(src, /SKIP.*外部克隆环境正常形态/s);
});

test('静态钉：q2-layer-scan 含 .panel-backups 缺席明示 SKIP 门控', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'q2-layer-scan.mjs'), 'utf8');
  assert.match(src, /if \(!existsSync\(bkRoot\)\)/);
  assert.match(src, /SKIP：\.panel-backups\/ 缺席＝外部克隆环境正常形态/);
});

test('静态钉：doctor selftest stage3 影子段含真实环境缺席明示 SKIP 门控', () => {
  const src = readFileSync(join(ROOT, 'doctor', 'cli', 'selftest', 'acceptance-stage3.mjs'), 'utf8');
  assert.match(src, /SKIP e\) 真实影子验证：真实环境缺席/);
  assert.match(src, /!fs\.existsSync\(realProfilePkg\) \|\| !fs\.existsSync\(realProfilePatch\)/);
});

test('静态钉：doc-ref-guard 含运行期面缺席 SKIP 判据与自证格两态案', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'doc-ref-guard.mjs'), 'utf8');
  assert.match(src, /function isRuntimeRef\(body\)/);
  assert.match(src, /const RUNTIME_DIRS = new Set/);
  assert.match(src, /const RUNTIME_DIR_PREFIXES = \['\.doctor-link-backup'\]/);
  assert.match(src, /㉘ 运行期面缺席＝SKIP 计数不判红/);
  assert.match(src, /㉘b 运行期面在场照验/);
  assert.match(src, /㉘c 在场但 #符号缺 ⇒ 照红/);
  assert.match(src, /㉘e 前缀形态运行期目录/);
});

test('在场态行为钉：p22b 本机照跑（E4 段在场断言执行、零 SKIP）', () => {
  const r = spawnSync(NODE, [join(ROOT, 'scripts', 'p22b-retention-scope.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'p22b exit 0（本机在场）: ' + (r.stderr || '').slice(-300));
  assert.match(r.stdout, /E4a engine default backupRoot exists on disk/);
  assert.match(r.stdout, /E4d manual archive still intact/);
  assert.doesNotMatch(r.stdout, /^SKIP /m);
});

test('在场态行为钉：q2-layer-scan 本机照跑（快照枚举照常、零 SKIP）', () => {
  const r = spawnSync(NODE, [join(ROOT, 'scripts', 'q2-layer-scan.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'q2 exit 0（本机在场）: ' + (r.stderr || '').slice(-300));
  assert.match(r.stdout, /§6 汇总/);
  assert.match(r.stdout, /PASS/);
  assert.doesNotMatch(r.stdout, /SKIP：\.panel-backups/);
});

test('在场态行为钉：doc-ref-guard 本机全绿（自证格全过＋真树零红）', () => {
  const r = spawnSync(NODE, [join(ROOT, 'scripts', 'doc-ref-guard.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, 'guard exit 0（本机修复后全绿）: ' + (r.stderr || r.stdout || '').slice(-600));
  assert.match(r.stdout, /运行期面缺席 SKIP \d+ 条/);
  assert.match(r.stdout, /全绿/);
});
