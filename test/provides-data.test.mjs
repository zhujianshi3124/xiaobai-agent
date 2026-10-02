// 提供面与清单形态的数据钉（唯一事实源＝各 dsh.plugin.json 的盘上实况）。
//
// 来历两层（只增不改，退役前提在此如实标注）：
//  · 批 10（C-1 第 4 项，2026-09-26）立"provides 与实供 1:1"的数据钉；
//  · S3 迁移笔（2026-10-01，debt C-3 一.3／甲案终批）把**有契约替代表达**的面迁进 provides，
//    于是原"provides 与 legacy registers 同槽同值"这一**迁移期前提退役**——自此钉的是相反形态：
//    已迁的面在 legacy 侧必须清空（双写并存＝漂移温床）。未迁的面（子路径 exports、events 订阅面、
//    aliases、optionalDeps、requirements.packages）逐名进 debt C-4，本文件把它们钉成可见现状。
//
// 今天仍然成立的三条纪律：
//  1. 声明与实供 1:1，空即如实**不补**（反向钉：谁"好心"补了空槽谁红）；
//  2. `requires.services` 是纯依赖面，不得被借用为提供面（契约 v1.1 P0-2 了断）；
//  3. 凡保留 `requirements` 的清单，doctor 的五键（runtime/binaries/packages/registers/exports）必须齐载
//     ——桶内 doctor CLI 是冻结成员（ce31f83），"在场才管"＝缺一键即 schema.required-missing error，
//     真实仓 dry-run 立刻不再 0/0/0。骨架留空不是偷懒，是被冻结的管辖权形状约束，本节把它钉成事实。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { validateManifest } from 'xiaobai-agent/contract';
import { extractRegisters } from '../registry/dist/loader.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readManifest = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const LIB = 'lib';
const PATHS = {
  bucket: 'dsh.plugin.json',
  compactRouter: join(LIB, 'compact-router', 'dsh.plugin.json'),
  searchRouter: join(LIB, 'search-router', 'dsh.plugin.json'),
  rateThrottle: join(LIB, 'rate-throttle', 'dsh.plugin.json'),
  agentMemory: join(LIB, 'agent-memory', 'dsh.plugin.json'),
  panel: join('panel', 'dsh.plugin.json'),
};
/** 带契约字段的五份（panel 无 contract 字段，走 legacy 合成分支＋D-15 显式闸，不经契约闸）。 */
const CONTRACT_BEARERS = ['bucket', 'compactRouter', 'searchRouter', 'rateThrottle', 'agentMemory'];

// ── 一、迁移后的提供面实况（逐份 deepEqual）──────────────────────────────

test('迁移后·compact-router provides＝entry+services+commands+inject 四面齐载（与实供 1:1）', () => {
  const m = readManifest(PATHS.compactRouter);
  assert.deepEqual(m.provides, {
    entry: './index.js',
    services: ['compaction'],
    inject: ['llm', 'tokenMeter', 'sessions', 'commands'],
    commands: ['compact-mode', 'compact-llm', 'compact-instant', 'compact-auto', 'compact-archive'],
  });
});

test('迁移后·search-router provides＝entry+providers+inject', () => {
  const m = readManifest(PATHS.searchRouter);
  assert.deepEqual(m.provides, { entry: './index.js', providers: ['auto-search'], inject: ['web'] });
});

test('迁移后·桶根 provides＝services(实供两服务)+inject；entry 仍在 legacy 套件面（成因钉住）', () => {
  const m = readManifest(PATHS.bucket);
  assert.deepEqual(m.provides, { services: ['registry', 'doctor'], inject: ['webServer'] });
  // 桶根的入口声明走套件根 $from 继承指针，而那张表同时是**冻结 doctor 拼"可解析别名集合"的输入**
  // （engine.mjs 的 buildResolvableSet：suiteManifest.name + exports 子路径）。把它换成单值 entry 会
  // 让 aliases 目标失去解析依据⇒dry-run 当场非 0。缺口逐名在册＝debt C-4。
  assert.deepEqual(m.requirements.exports, { $from: 'package.json#exports' });
});

test('迁移后·rate-throttle provides＝entry+inject；agent-memory provides＝inject（入口面未迁，子路径无表达）', () => {
  assert.deepEqual(readManifest(PATHS.rateThrottle).provides, { entry: './index.js', inject: ['llm', 'tokenMeter'] });
  assert.deepEqual(readManifest(PATHS.agentMemory).provides, { inject: ['systemPrompt'] });
});

test('迁移后·桶根依赖面数据原样保留（requires.services 与 provides.inject 都是 webServer）', () => {
  const m = readManifest(PATHS.bucket);
  assert.deepEqual(m.requires.services, ['webServer']);
  assert.deepEqual(m.provides.inject, ['webServer']);
});

// ── 二、反向钉：空即如实不补、不得发明槽、panel 不进气氛 ──────────────────

test('迁移后·panel 仍不得声明 provides（无 contract 字段＝D-15 既裁边界）', () => {
  const m = readManifest(PATHS.panel);
  assert.equal(Object.prototype.hasOwnProperty.call(m, 'provides'), false,
    `${PATHS.panel} 不该有 provides（给它补契约面＝解除 D-15 显式闸的判据语义，属功能变更，本批不自裁）`);
  assert.equal(m.contract, undefined, 'panel 今天仍无 contract 字段＝走 legacy 合成分支');
});

test('迁移后·空即如实：任何清单都不得留空数组槽或空 entry（提供面只写真实有的东西）', () => {
  for (const key of CONTRACT_BEARERS) {
    const m = readManifest(PATHS[key]);
    const p = m.provides || {};
    for (const [slot, v] of Object.entries(p)) {
      if (Array.isArray(v)) assert.notEqual(v.length, 0, `${PATHS[key]} 的 provides.${slot} 是空数组 ⇒ 应整槽省略`);
      else assert.notEqual(String(v).trim(), '', `${PATHS[key]} 的 provides.${slot} 是空串 ⇒ 应整槽省略`);
    }
  }
});

// ── 三、已迁的面在 legacy 侧必须清空（双写并存即红）──────────────────────

test('迁移后·legacy registers 的已迁四槽在真实清单里全部清空（双写并存即红）', () => {
  for (const key of CONTRACT_BEARERS) {
    const m = readManifest(PATHS[key]);
    const legacy = (m.requirements || {}).registers || {};
    for (const slot of ['inject', 'services', 'commands', 'providers']) {
      assert.deepEqual(legacy[slot] ?? [], [],
        `${PATHS[key]} 的 legacy registers.${slot} 必须已清空（声明单源在 provides，两处并存＝漂移温床）`);
    }
  }
  // 入口面：三份内置清单已让位给 provides.entry；桶根与 agent-memory 是在册例外（见上两节的成因）
  for (const key of ['compactRouter', 'searchRouter', 'rateThrottle']) {
    assert.equal((readManifest(PATHS[key]).requirements.exports || {})['.'], undefined,
      `${PATHS[key]} 的 legacy 入口声明必须已让位给 provides.entry`);
  }
});

// ── 四、形态现状：manifestVersion 退役、name 保留的成因、五键骨架齐载 ──────

test('迁移后·五份带契约的清单 manifestVersion 全退役，name 仍在（冻结 doctor 的别名解析锚）', () => {
  for (const key of CONTRACT_BEARERS) {
    const m = readManifest(PATHS[key]);
    assert.equal(Object.prototype.hasOwnProperty.call(m, 'manifestVersion'), false,
      `${PATHS[key]} 的 manifestVersion 已由本笔删除（契约四必填即其替代表达）`);
    assert.equal(typeof m.name, 'string', `${PATHS[key]} 的 name 必须仍在——engine.mjs buildResolvableSet 用 manifest.name 拼可解析集合，删它即破 aliases 目标解析（debt C-4 在册）`);
    assert.notEqual(m.name.trim(), '');
  }
});

test('迁移后·凡保留 requirements 的清单五键齐载（doctor"在场才管"的骨架形状，缺一键即非 0/0/0）', () => {
  const FIVE = ['runtime', 'binaries', 'packages', 'registers', 'exports'];
  let carriers = 0;
  for (const key of [...CONTRACT_BEARERS, 'panel']) {
    const m = readManifest(PATHS[key]);
    if (m.requirements === undefined) continue
    carriers++;
    for (const k of FIVE) assert.ok(k in m.requirements, `${PATHS[key]} 保留了 requirements 却缺五键之一 "${k}" ⇒ 冻结 CLI 报 schema.required-missing`);
  }
  assert.equal(carriers, 6, '今天六份清单都还保留 requirements（成因逐名在册＝debt C-4）');
});

test('迁移后·extractRegisters 对六份真实清单的归一结果（面板与冲突检查的取数实况）', () => {
  // 只比**非空面**：五键骨架里的 legacy 空数组会被 pickSlot 如实读出（空即"已声明为空"），
  // 那不是提供面知识，面板与冲突检查用的就是这份归一结果——空槽在本断言里不参与比较，
  // 空槽的存在与否由上一节"legacy 侧不得留已迁走的声明"与"五键齐载"两格钉住。
  const nonEmpty = (r) => Object.fromEntries(Object.entries(r || {}).filter(([, v]) => Array.isArray(v) && v.length > 0));
  const got = {};
  for (const [key, rel] of Object.entries(PATHS)) got[key] = nonEmpty(extractRegisters(readManifest(rel)));
  assert.deepEqual(got.bucket, { services: ['registry', 'doctor'], inject: ['webServer'] });
  assert.deepEqual(got.compactRouter, {
    services: ['compaction'], commands: ['compact-mode', 'compact-llm', 'compact-instant', 'compact-auto', 'compact-archive'],
    inject: ['llm', 'tokenMeter', 'sessions', 'commands'],
  });
  assert.deepEqual(got.searchRouter, { providers: ['auto-search'], inject: ['web'] });
  assert.deepEqual(got.rateThrottle, { inject: ['llm', 'tokenMeter'] });
  assert.deepEqual(got.agentMemory, { inject: ['systemPrompt'] });
  // panel 无 provides、legacy registers 仅剩 inject/events ⇒ 回落取数，events 不进提供面
  assert.deepEqual(got.panel, { inject: ['webServer'] });
});

test('迁移后·五份带 contract 的清单整体过 validateManifest（现闸不红）', () => {
  for (const key of CONTRACT_BEARERS) {
    const verdict = validateManifest(readManifest(PATHS[key]));
    assert.equal(
      verdict.ok,
      true,
      `${PATHS[key]} 未过契约校验：${JSON.stringify((verdict.errors || []).map((e) => e.code + '@' + e.path))}`,
    );
  }
});
