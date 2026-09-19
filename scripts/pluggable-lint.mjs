#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = process.argv[2] ? path.resolve(process.argv[2]) : defaultRoot;
const libDir = path.join(root, 'lib');
const testDir = path.join(root, 'test');
const plugins = fs.readdirSync(libDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(mjs|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function norm(p) {
  return path.resolve(p).replace(/\\/g, '/').toLowerCase();
}

function pluginOfLibFile(abs) {
  const rel = path.relative(libDir, abs).split(path.sep)[0];
  return plugins.includes(rel) ? rel : null;
}

function selfPluginOfTestFile(abs) {
  const base = path.basename(abs, path.extname(abs));
  const first = base.split('.')[0];
  return plugins.includes(first) ? first : null;
}

// P0 裁决 N1：contract/registry/doctor 是全桶共享基础模块（非兄弟插件），
// 任何 lib 插件与 test 用例都允许静态 import。（P3 doctor 落地后加入列表。）
const SHARED_MODULES = ['contract', 'registry'];

function isSibling(spec, fromFile, selfPlugin) {
  if (spec === '@local/dsh-toolkit') return false;
  const sharedRe = /^@local\/dsh-toolkit\/([^/]+)(?:\/|$)/;
  const shared = sharedRe.exec(spec);
  if (shared && SHARED_MODULES.includes(shared[1])) return false;
  const aliasRe = /^@local\/dsh-toolkit\/([^/]+)(?:\/|$)/;
  const alias = aliasRe.exec(spec);
  if (alias) return alias[1] !== selfPlugin;
  if (!spec.startsWith('.') && !spec.startsWith('/')) return false;
  const resolved = norm(path.resolve(path.dirname(fromFile), spec));
  for (const p of plugins) {
    const pluginRoot = norm(path.join(libDir, p));
    if (resolved === pluginRoot || resolved.startsWith(pluginRoot + '/')) {
      return p !== selfPlugin;
    }
  }
  return false;
}

function collectStaticModuleRefs(text) {
  const refs = [];
  const lines = text.split('\n');
  let pending = null;
  const fromRe = /from\s+['"]([^'"]+)['"]/;
  const sideEffectRe = /^\s*import\s+['"]([^'"]+)['"]/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (pending) {
      pending.lines.push(line);
      const m = fromRe.exec(line);
      if (m) {
        refs.push({ line: pending.startLine, spec: m[1], kind: pending.kind });
        pending = null;
      }
      continue;
    }
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;
    if (/\bimport\s*\(/.test(line)) continue;
    const isImport = /^\s*import\b/.test(line);
    const isExport = /^\s*export\b/.test(line);
    if (!isImport && !isExport) continue;
    const side = sideEffectRe.exec(line);
    if (side) {
      refs.push({ line: i + 1, spec: side[1], kind: 'import' });
      continue;
    }
    const m = fromRe.exec(line);
    if (m) {
      refs.push({ line: i + 1, spec: m[1], kind: isExport ? 're-export' : 'import' });
    } else {
      pending = { startLine: i + 1, kind: isExport ? 're-export' : 'import', lines: [line] };
    }
  }
  return refs;
}

const violations = [];
const seen = new Set();

function report(file, ref, kindLabel) {
  const key = file + ':' + ref.line + ':' + ref.spec;
  if (seen.has(key)) return;
  seen.add(key);
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const aliasRe = /^@local\/dsh-toolkit\/([^/]+)(?:\/|$)/;
  const target = aliasRe.exec(ref.spec);
  const targetName = target ? target[1] : '兄弟插件';
  violations.push(rel + ':' + ref.line + ' ' + kindLabel + targetName + '（spec: ' + ref.spec + '）—— 违反 AGENTS.md 第 ' + (kindLabel === 'eager re-export ' ? '2' : '1') + ' 条，请改为运行时惰性探测（try-catch + 动态 import）');
}

for (const file of walk(libDir)) {
  const selfPlugin = pluginOfLibFile(file);
  const text = fs.readFileSync(file, 'utf8');
  for (const ref of collectStaticModuleRefs(text)) {
    if (isSibling(ref.spec, file, selfPlugin)) {
      report(file, ref, ref.kind === 're-export' ? 'eager re-export ' : '静态 import ');
    }
  }
}

for (const file of walk(testDir)) {
  const selfPlugin = selfPluginOfTestFile(file);
  const text = fs.readFileSync(file, 'utf8');
  for (const ref of collectStaticModuleRefs(text)) {
    if (isSibling(ref.spec, file, selfPlugin)) {
      report(file, ref, ref.kind === 're-export' ? 'eager re-export ' : '静态 import ');
    }
  }
}

if (violations.length > 0) {
  console.error('[pluggable-lint] 发现跨插件静态依赖违规：');
  for (const v of violations) console.error('  - ' + v);
  process.exit(1);
} else {
  console.log('[pluggable-lint] 通过：lib/ 与 test/ 无跨插件静态 import / eager re-export。');
}
