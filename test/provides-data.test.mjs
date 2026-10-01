// 批 10（C-1 第 4 项）· provides 数据落地的数据钉。
//
// 钉的是"盘上清单的提供面声明与代码实供 1:1"这一数据事实（唯一事实源 = 各 dsh.plugin.json）：
//   - compact-router / search-router：注册面非空的两份，provides 与
//     legacy `requirements.registers` 同值同槽（extractRegisters 逐槽优先读 provides，
//     两面同值 ⇒ 输出面零变化，改名批才动输出面）；（web-search-local 原为第三份，
//     已随开源 S1 剔除批整体出包。）
//   - 桶根 dsh.plugin.json：倒置纠正的落点 —— 实供 `${servicePrefix}/registry` 与
//     `${servicePrefix}/doctor` 两个服务（F-7"声明与实供不一致"的数据半边），按
//     legacy registers 的既有惯例写**去前缀逻辑名**（compact-router 的 "compaction"、
//     search-router 的 "auto-search" 同一口径）；`requires.services=["webServer"]` 与
//     `registers.inject=["webServer"]` 是**依赖面**的真实声明，原样保留不动；
//   - rate-throttle / agent-memory：三槽全空 ⇒ 空即如实**不补**（反向钉：谁"好心"补了
//     空 provides 谁红）；panel/ 仍无 contract 字段，v1.1 不动（D-15 已裁边界）。
// 五份带 contract 的清单还须整体过 validateManifest（provides 加入后两道闸都不得红）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { validateManifest } from 'dsh-toolkit/contract';

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

test('批10·compact-router provides 与实供 1:1（services=[compaction] + 5 命令）', () => {
  const m = readManifest(PATHS.compactRouter);
  assert.deepEqual(m.provides, {
    services: ['compaction'],
    commands: ['compact-mode', 'compact-llm', 'compact-instant', 'compact-auto', 'compact-archive'],
  });
});

test('批10·search-router provides 与实供 1:1（providers=[auto-search]）', () => {
  const m = readManifest(PATHS.searchRouter);
  assert.deepEqual(m.provides, { providers: ['auto-search'] });
});

test('批10·桶根 provides 声明实供两服务（registry/doctor）——倒置纠正的数据半边', () => {
  const m = readManifest(PATHS.bucket);
  assert.deepEqual(m.provides, { services: ['registry', 'doctor'] });
});

test('批10·桶根依赖面数据原样保留（requires.services 与 registers.inject 都是 webServer）', () => {
  const m = readManifest(PATHS.bucket);
  assert.deepEqual(m.requires.services, ['webServer']);
  assert.deepEqual(m.requirements.registers.inject, ['webServer']);
});

test('批10·空即如实：rate-throttle / agent-memory / panel 不得声明 provides（反向钉）', () => {
  for (const key of ['rateThrottle', 'agentMemory', 'panel']) {
    const m = readManifest(PATHS[key]);
    assert.equal(
      Object.prototype.hasOwnProperty.call(m, 'provides'),
      false,
      `${PATHS[key]} 不该有 provides（三槽实况为空就如实不补）`,
    );
  }
});

test('批10·provides 两份与 legacy registers 同槽同值（输出面零变化的前提）', () => {
  for (const key of ['compactRouter', 'searchRouter']) {
    const m = readManifest(PATHS[key]);
    const legacy = m.requirements.registers;
    for (const slot of ['services', 'commands', 'providers']) {
      if (m.provides[slot] !== undefined) {
        // 声明了的槽必须与 legacy 同值（extractRegisters 逐槽优先读 provides，同值 ⇒ 输出面零变化）
        assert.deepEqual(
          m.provides[slot],
          legacy[slot],
          `${PATHS[key]} 的 provides.${slot} 须与 requirements.registers.${slot} 同值（改名批前输出面不动）`,
        );
        assert.notEqual(m.provides[slot].length, 0, `${PATHS[key]} 的 provides.${slot} 是空数组 ⇒ 应整槽省略（空即如实）`);
      } else {
        // 没声明的槽，legacy 那边必须本来就没有实供（防"漏声明了非空槽"）
        assert.equal(legacy[slot].length, 0, `${PATHS[key]} 的 legacy ${slot} 非空却未进 provides（漏声明）`);
      }
    }
  }
});

test('批10·五份带 contract 的清单整体过 validateManifest（provides 加入后两道闸不红）', () => {
  for (const key of ['bucket', 'compactRouter', 'searchRouter', 'rateThrottle', 'agentMemory']) {
    const verdict = validateManifest(readManifest(PATHS[key]));
    assert.equal(
      verdict.ok,
      true,
      `${PATHS[key]} 未过契约校验：${JSON.stringify((verdict.errors || []).map((e) => e.code + '@' + e.path + ' ' + e.message))}`,
    );
  }
});
