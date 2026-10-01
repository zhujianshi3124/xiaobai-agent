/**
 * agent-memory 本机检索索引钉（S4 F-37 检索半边；设计正本 docs/f37-search-design-c1-007.md §A/§C3）
 *
 * SEARCH-1  建索引：组合层写路径变更挂钩自动建段（§A3①）；MANIFEST/段形状与条目形状
 * SEARCH-2  检索命中：台账五栏＋一般输入＋头部任务＋永久指令＋进度里程碑；结果行形状（§A5）
 * SEARCH-3  口径（裁3 v1）：大小写不敏感子串；lastActiveAt 降序；limit 截断/上限/非法提示；
 *           workspace 前缀过滤（win32 大小写归一）；空查询/超长查询＝空结果＋参数提示（§C3 第 5 行）
 * SEARCH-4  归档面：archive 条目（@归档 时间戳进 ts，archived=true）可命中
 * SEARCH-5  漂移自愈（§A3②）：绕挂钩直改正本 ⇒ 读时比对 mtime/size 重建再查
 * SEARCH-6  失败面（§C3）：段损坏/缺席重建；单会话正本读不了 ⇒ 跳过＋计数＋error 防反复；
 *           正本修复后自愈
 * SEARCH-7  体积控制（§A4）：>16MB 或 >2×正本 ⇒ 整目录弃置＋本次全量重建＋notices 如实
 * SEARCH-8  排除面：checkpoint-evidence.jsonl 与 logs/ 自日志不入索引
 * SEARCH-9  根级故障：registry 缺席＝空结果；registry 损坏＝抛错（调用方降级 available:false）
 * SEARCH-10 三正本零触碰（硬红线）：全链（建段/冷检索/坏段/缺席/弃置重建）前后逐字节同
 * SEARCH-11 挂钩失败不伤正本（§C3 底注）：派生面写不进去 ⇒ 正本照常落账＋emitWarning
 * SEARCH-12 reindexSession 显式重建：gen 递增可观测
 *
 * 隔离：全部 mkdtemp 临时 root（对齐家族生产根护栏），生产根零触碰。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

import {
  searchMemory, reindexSession,
  SEARCH_DIR_MAX_BYTES, SEARCH_LIMIT_MAX, SEARCH_QUERY_MAX_CHARS,
} from '../lib/agent-memory/lib/search-index.js';
import { searchManifestPath, searchSegmentPath, searchDir } from '../lib/agent-memory/lib/paths.js';
import { addEntry, addGeneralEntry, setEntryStatus, appendMilestone, createSession, updateStatus } from '../lib/agent-memory/lib/index.js';
import { PRODUCTION_ROOT } from '../lib/agent-memory/lib/script-guard.js';

function tmpRoot() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-memory-search-'));
  if (path.resolve(d) === PRODUCTION_ROOT) {
    console.error('[护栏] tmpRoot 解析出生产根，中止');
    process.exit(3);
  }
  return d;
}
function tmpWorkspace(root, name) {
  const ws = path.join(root, name);
  fs.mkdirSync(ws, { recursive: true });
  return ws;
}
const sha = (file) => {
  try { return createHash('sha256').update(fs.readFileSync(file)).digest('hex'); } catch { return 'ABSENT'; }
};
const canonShas = (root, sid) =>
  ['ledger.md', 'progress.md', 'archive.md'].map((n) => sha(path.join(root, 'sessions', sid, n)));
const readManifest = (root) => JSON.parse(fs.readFileSync(searchManifestPath(root), 'utf8'));

function seedSession(root, ws, taskSummary) {
  const rec = createSession(root, { workspace: ws, taskSummary });
  return rec.sid;
}

test('SEARCH-1: 建索引——组合层写路径挂钩自动建段；MANIFEST/段/条目形状逐格', () => {
  const root = tmpRoot();
  const ws = tmpWorkspace(root, 'ws');
  const sid = seedSession(root, ws, '建索引形状格');
  assert.equal(fs.existsSync(searchDir(root)), false, '建会话本身不建索引目录（无启动钩子 §A3③）');

  addEntry(root, sid, { desc: '把开尔文探针数据导出为 CSV', workspace: ws });
  assert.equal(fs.existsSync(searchManifestPath(root)), true, '第一条写入即挂钩建索引（§A3①）');
  assert.equal(fs.existsSync(searchSegmentPath(root, sid)), true, '逐会话段在场');

  const m = readManifest(root);
  assert.equal(m.version, 1, 'MANIFEST 版本格');
  assert.ok(m.sessions[sid], 'MANIFEST 有该会话');
  assert.equal(typeof m.sessions[sid].gen, 'number', 'gen 在场');
  assert.ok(m.sessions[sid].src.ledger, 'src.ledger 指纹（mtime/size）在场');
  assert.ok(m.sessions[sid].src.progress !== undefined && m.sessions[sid].src.archive !== undefined, '三文件指纹键齐备');

  const seg = JSON.parse(fs.readFileSync(searchSegmentPath(root, sid), 'utf8'));
  assert.ok(Array.isArray(seg.entries) && seg.entries.length > 0, '段 entries 是非空数组');
  for (const e of seg.entries) {
    assert.deepEqual(
      Object.keys(e).sort(),
      ['archived', 'file', 'no', 'sec', 'status', 'text', 'ts'],
      '条目形状（§A2）'
    );
    assert.ok(['ledger', 'progress', 'archive'].includes(e.file), 'file 枚举');
    assert.ok(e.text.length <= 500, '文本 ≤500 截断');
  }
  const kinds = new Set(seg.entries.map((e) => e.file));
  assert.ok(kinds.has('ledger'), '台账条目入索引');
  assert.ok(seg.entries.some((e) => e.sec === '头部'), '头部任务入索引');
  assert.ok(seg.entries.some((e) => e.sec === '永久指令'), '永久指令入索引');
});

test('SEARCH-2: 检索命中与结果行形状——五栏＋一般输入＋里程碑；大小写不敏感（裁3）', () => {
  const root = tmpRoot();
  const ws = tmpWorkspace(root, 'ws');
  const sid = seedSession(root, ws, '检索命中格');
  addEntry(root, sid, { desc: '把开尔文探针数据导出为 CSV', workspace: ws });
  addGeneralEntry(root, sid, { desc: '用户说：下次记得优先处理蓝色主题的样式回归', workspace: ws });
  appendMilestone(root, sid, {
    completedSteps: ['索引器冒烟'], currentStatus: '检索链验证进行中',
    nextSteps: '写正式测试', keyDecisions: 'v1 子串口径', files: ['search-index.js'], workspace: ws,
  });

  const r = searchMemory(root, { q: '蓝色主题' });
  assert.equal(r.available, true, 'available 恒 true（成功面）');
  assert.equal(r.results.length, 1, '一般输入栏命中');
  const row = r.results[0];
  assert.deepEqual(
    Object.keys(row).sort(),
    ['file', 'no', 'sec', 'sid', 'snippet', 'status', 'text', 'ts', 'workspace'],
    '结果行形状（§A5）'
  );
  assert.equal(row.sid, sid);
  assert.equal(row.status, '活跃', '状态取自 registry');
  assert.equal(row.file, 'ledger');
  assert.equal(row.sec, '一般输入');
  assert.equal(row.workspace, ws, 'workspace 尾段可展示');
  assert.ok(row.snippet.includes('蓝色主题'), 'snippet 含命中词');
  assert.ok(r.elapsedMs >= 0, '耗时可观测');

  const rCsv = searchMemory(root, { q: 'csv' });
  assert.equal(rCsv.results.length, 1, '小写命中大写原文（大小写不敏感）');
  assert.ok(rCsv.results[0].text.includes('CSV'), 'text 保持原文大小写');
  const rMile = searchMemory(root, { q: '检索链验证' });
  assert.equal(rMile.results.length, 1, '进度里程碑命中');
  assert.equal(rMile.results[0].file, 'progress', 'file=progress');
  const rTask = searchMemory(root, { q: '检索命中格' });
  assert.equal(rTask.results.length, 1, '头部任务/摘要命中');
  const rNone = searchMemory(root, { q: '不存在的检索词' });
  assert.deepEqual(rNone.results, [], '无命中＝空数组');
});

test('SEARCH-3: 口径格——lastActiveAt 降序；limit 截断/上限/非法；workspace 前缀过滤；空/超长查询', () => {
  const root = tmpRoot();
  const wsA = tmpWorkspace(root, 'ws-a');
  const wsB = tmpWorkspace(root, 'ws-b');
  const s1 = seedSession(root, wsA, '口径格一');
  const s2 = seedSession(root, wsB, '口径格二');
  for (let i = 1; i <= 3; i++) addEntry(root, s1, { desc: `排序截断检索词第${i}条`, workspace: wsA });
  addEntry(root, s2, { desc: '排序截断检索词第4条', workspace: wsB });

  const all = searchMemory(root, { q: '排序截断检索词', limit: 10 });
  assert.equal(all.results.length, 4, '全量命中');
  assert.equal(all.results[0].sid, s2, 's2 活跃更晚 ⇒ lastActiveAt 降序在前');
  assert.ok(all.results[0].lastActiveAt === undefined, '结果行不夹带 registry 原始字段（形状守恒）');

  const limited = searchMemory(root, { q: '排序截断检索词', limit: 2 });
  assert.equal(limited.results.length, 2, 'limit 截断');

  const overLimit = searchMemory(root, { q: '排序截断检索词', limit: SEARCH_LIMIT_MAX + 1 });
  assert.equal(overLimit.results.length, 4, '超上限请求按 50 上限跑（本例 4 条全回，不截真数据）');
  assert.ok(overLimit.notices.some((n) => n.includes(String(SEARCH_LIMIT_MAX))), '上限提示在案');

  const badLimit = searchMemory(root, { q: '排序截断检索词', limit: 'abc' });
  assert.equal(badLimit.results.length, 4, '非法 limit 回落缺省 20（本例 4 条全回）');
  assert.ok(badLimit.notices.some((n) => n.includes('limit 非法')), '非法 limit 提示在案');

  const onlyB = searchMemory(root, { q: '排序截断检索词', workspace: wsB });
  assert.equal(onlyB.results.length, 1, 'workspace 过滤只中 wsB');
  const onlyALower = searchMemory(root, { q: '排序截断检索词', workspace: wsA.toUpperCase() });
  assert.equal(onlyALower.results.length, 3, 'workspace 过滤大小写不敏感（win32 路径族口径）');

  const empty = searchMemory(root, { q: '   ' });
  assert.deepEqual(empty.results, [], '空查询＝空结果');
  assert.ok(empty.notices.length > 0, '空查询带参数提示（§C3 第 5 行）');
  const tooLong = searchMemory(root, { q: 'x'.repeat(SEARCH_QUERY_MAX_CHARS + 1) });
  assert.deepEqual(tooLong.results, [], '超长查询＝空结果');
  assert.ok(tooLong.notices.some((n) => n.includes(String(SEARCH_QUERY_MAX_CHARS))), '超长查询提示在案');
});

test('SEARCH-4: 归档面——archive 条目可命中，@归档 时间戳进 ts，archived 语义', () => {
  const root = tmpRoot();
  const ws = tmpWorkspace(root, 'ws');
  const sid = seedSession(root, ws, '归档面格');
  addEntry(root, sid, { desc: '归档面检索词琥珀任务', workspace: ws });
  // 直写归档行（archive.js 既有追加形态；等价台账超限迁移产物）
  const { readFileSync, appendFileSync } = fs;
  const archiveFile = path.join(root, 'sessions', sid, 'archive.md');
  assert.ok(readFileSync(archiveFile, 'utf8').startsWith('# Archive'), 'archive.md 已初始化');
  appendFileSync(archiveFile, '- L-099 [已完成] 归档面检索词琥珀任务 @完成 2026-09-28T10:00:00+00:00 @归档 2026-09-29T10:00:00+00:00\n', 'utf8');

  const r = searchMemory(root, { q: '琥珀' });
  const archiveRows = r.results.filter((x) => x.file === 'archive');
  assert.equal(archiveRows.length, 1, 'archive 条目命中');
  assert.equal(archiveRows[0].no, 'L-099', '编号保留');
  assert.equal(archiveRows[0].ts, '2026-09-29T10:00:00+00:00', 'ts 取 @归档 时间戳');
  assert.equal(archiveRows[0].sec, '归档条目', 'sec 标注归档条目');
});

test('SEARCH-5: 漂移自愈——绕挂钩直改正本，读时比对 mtime/size 重建再查（§A3②）', () => {
  const root = tmpRoot();
  const ws = tmpWorkspace(root, 'ws');
  const sid = seedSession(root, ws, '漂移自愈格');
  addEntry(root, sid, { desc: '完成冒烟校验', workspace: ws });
  assert.deepEqual(searchMemory(root, { q: '蓝莓派' }).results, [], '改前查不到');

  const ledFile = path.join(root, 'sessions', sid, 'ledger.md');
  fs.writeFileSync(ledFile, fs.readFileSync(ledFile, 'utf8').replace('完成冒烟校验', '完成冒烟校验＋漂移词蓝莓派'), 'utf8');

  const r = searchMemory(root, { q: '蓝莓派' });
  assert.equal(r.results.length, 1, '读时漂移重建后命中（无启动钩子、无显式重建调用）');
});

test('SEARCH-6: 失败面——段损坏/缺席自愈；单会话正本读不了 ⇒ 跳过＋计数＋error 防反复；修复后自愈', () => {
  const root = tmpRoot();
  const wsA = tmpWorkspace(root, 'ws-a');
  const wsB = tmpWorkspace(root, 'ws-b');
  const good = seedSession(root, wsA, '失败面好会话');
  const bad = seedSession(root, wsB, '失败面坏会话');
  addEntry(root, good, { desc: '失败面对照词亮橙', workspace: wsA });
  addEntry(root, bad, { desc: '失败面对照词亮橙', workspace: wsB });

  // 段损坏 ⇒ 按正本重建（§C3 第 1 行）
  fs.writeFileSync(searchSegmentPath(root, good), '{corrupt!!', 'utf8');
  let r = searchMemory(root, { q: '亮橙' });
  assert.equal(r.results.length, 2, '坏段自愈后照常命中');

  // 段缺席 ⇒ 重建
  fs.rmSync(searchSegmentPath(root, good), { force: true });
  r = searchMemory(root, { q: '亮橙' });
  assert.equal(r.results.length, 2, '缺席段自愈后照常命中');

  // 单会话正本读不了（ledger.md 换成目录）⇒ 该会话跳过＋unreadable 计数＋另一会话照常
  const badLedger = path.join(root, 'sessions', bad, 'ledger.md');
  fs.rmSync(badLedger);
  fs.mkdirSync(badLedger);
  r = searchMemory(root, { q: '亮橙' });
  assert.equal(r.unreadable, 1, '结果头如实标注 1 个会话无法读取（§C3 第 4 行）');
  assert.equal(r.results.length, 1, '好会话照常命中');
  assert.equal(r.results[0].sid, good, '命中的是好会话');
  const m1 = readManifest(root);
  assert.ok(m1.sessions[bad].error, 'MANIFEST 记录 error（防反复判据）');
  const gen1 = m1.sessions[bad].gen;

  // 同一正本指纹再检索：不反复重建（gen 不变），计数照实
  r = searchMemory(root, { q: '亮橙' });
  assert.equal(r.unreadable, 1, '重复检索仍如实计数');
  const m2 = readManifest(root);
  assert.equal(m2.sessions[bad].gen, gen1, 'gen 防反复：失败会话未再次重建');

  // 正本修复（恢复合法台账文本）⇒ src 变化 ⇒ 自愈
  fs.rmdirSync(badLedger);
  fs.writeFileSync(badLedger, [
    '# Ledger — ' + bad,
    `- sid: ${bad}`,
    '- dshSessionId: ',
    '- task: 失败面坏会话',
    '- createdAt: 2026-10-01T00:00:00+00:00',
    '- updatedAt: 2026-10-01T00:00:00+00:00',
    '- heartbeatTurn: 0',
    '- schemaVersion: 1',
    '- status: 活跃',
    '',
    '## 进行中',
    '## 待办',
    '- L-001 [待办] 失败面对照词亮橙（修复后）',
    '## 已完成',
    '## 已搁置',
    '## 一般输入',
    '',
  ].join('\n'), 'utf8');
  r = searchMemory(root, { q: '亮橙' });
  assert.equal(r.unreadable, 0, '修复后 unreadable 归零');
  assert.equal(r.results.length, 2, '两个会话都命中');
});

test('SEARCH-7: 体积控制——>16MB 或 >2×正本 ⇒ 整目录弃置＋本次重建＋notices 如实（§A4）', () => {
  const root = tmpRoot();
  const ws = tmpWorkspace(root, 'ws');
  const sid = seedSession(root, ws, '体积控制格');
  addEntry(root, sid, { desc: '体积控制检索词青金', workspace: ws });

  // 绝对超限：totalBytes 抬到 >16MB
  const mPath = searchManifestPath(root);
  let m = readManifest(root);
  m.totalBytes = SEARCH_DIR_MAX_BYTES + 1;
  fs.writeFileSync(mPath, JSON.stringify(m), 'utf8');
  let r = searchMemory(root, { q: '青金' });
  assert.equal(r.results.length, 1, '弃置重建后检索照常');
  assert.ok(r.notices.some((n) => n.includes('弃置')), '弃置提示如实（§A4 超限即弃）');
  assert.ok(readManifest(root).totalBytes < SEARCH_DIR_MAX_BYTES, '重建后总量回到限内');
  assert.equal(fs.existsSync(searchDir(root)), true, '目录自愈重建在场');

  // 倍数超限：>2×正本总量
  m = readManifest(root);
  const canonBytes = ['ledger.md', 'progress.md', 'archive.md']
    .map((n) => fs.statSync(path.join(root, 'sessions', sid, n)).size)
    .reduce((a, b) => a + b, 0);
  assert.ok(canonBytes > 0);
  m.totalBytes = 2 * canonBytes + 1;
  fs.writeFileSync(mPath, JSON.stringify(m), 'utf8');
  r = searchMemory(root, { q: '青金' });
  assert.equal(r.results.length, 1, '倍数超限弃置重建后检索照常');
  assert.ok(readManifest(root).totalBytes <= 2 * canonBytes, '重建后不超 2×正本');
});

test('SEARCH-8: 排除面——checkpoint-evidence.jsonl 与 logs/ 自日志不入索引（§A4）', () => {
  const root = tmpRoot();
  const ws = tmpWorkspace(root, 'ws');
  const sid = seedSession(root, ws, '排除面格');
  addEntry(root, sid, { desc: '排除面对照词青玉', workspace: ws });
  fs.appendFileSync(path.join(root, 'sessions', sid, 'checkpoint-evidence.jsonl'), '排除面独有词量子弹\n', 'utf8');
  fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
  fs.appendFileSync(path.join(root, 'logs', 'agent-memory.jsonl'), '排除面独有词量子弹\n', 'utf8');

  const r = searchMemory(root, { q: '子弹' });
  assert.deepEqual(r.results, [], '证据日志/自日志关键词零命中（不在读取面）');
  const rCtrl = searchMemory(root, { q: '青玉' });
  assert.equal(rCtrl.results.length, 1, '对照词照常命中（排除面不误伤正本检索）');
});

test('SEARCH-9: 根级故障——registry 缺席＝如实空结果；registry 损坏＝抛错（调用方降级 available:false）', () => {
  const root = tmpRoot();
  const empty = searchMemory(root, { q: '任意词' });
  assert.equal(empty.available, true, '空数据根不算故障');
  assert.deepEqual(empty.results, [], '空数据根空结果');
  assert.equal(empty.sessions, 0, '零会话如实');

  const ws = tmpWorkspace(root, 'ws');
  const sid = seedSession(root, ws, '根级故障格');
  addEntry(root, sid, { desc: '根级故障检索词紫晶', workspace: ws });
  fs.writeFileSync(path.join(root, 'registry.json'), '{broken!!', 'utf8');
  assert.throws(() => searchMemory(root, { q: '紫晶' }), /CORRUPT_JSON|无法解析/, 'registry 损坏抛错 ⇒ 面板按 §C3 第 3 行降级 available:false');
});

test('SEARCH-10: 三正本零触碰（硬红线）——建段/冷检索/坏段/缺席/弃置重建全链前后逐字节同', () => {
  const root = tmpRoot();
  const ws = tmpWorkspace(root, 'ws');
  const sid = seedSession(root, ws, '零触碰硬红线格');
  addEntry(root, sid, { desc: '零触碰检索词琥珀', workspace: ws });
  appendMilestone(root, sid, { completedSteps: ['前置'], workspace: ws });

  const before = canonShas(root, sid);
  reindexSession(root, sid);
  let r = searchMemory(root, { q: '琥珀' });
  assert.equal(r.results.length, 1);
  fs.writeFileSync(searchSegmentPath(root, sid), 'BROKEN', 'utf8');
  r = searchMemory(root, { q: '琥珀' });
  assert.equal(r.results.length, 1, '坏段路径跑过');
  fs.rmSync(searchSegmentPath(root, sid), { force: true });
  const m = readManifest(root);
  m.totalBytes = SEARCH_DIR_MAX_BYTES + 1;
  fs.writeFileSync(searchManifestPath(root), JSON.stringify(m), 'utf8');
  r = searchMemory(root, { q: '琥珀' });
  assert.equal(r.results.length, 1, '弃置重建路径跑过');
  const after = canonShas(root, sid);

  assert.deepEqual(after, before, '三正本（ledger/progress/archive）全链前后逐字节同——索引永不写回');
});

test('SEARCH-11: 挂钩失败不伤正本（§C3 底注）——派生面写不进去 ⇒ 正本照常落账＋emitWarning', async () => {
  const root = tmpRoot();
  const ws = tmpWorkspace(root, 'ws');
  const sid = seedSession(root, ws, '挂钩失败格');
  // 预占 search/ 为文件 ⇒ 派生面写路径必失败
  fs.writeFileSync(searchDir(root), 'not-a-dir', 'utf8');
  const warnings = [];
  const onWarning = (w) => {
    if (String(w?.message ?? '').includes('检索索引更新失败')) warnings.push(w.message);
  };
  process.on('warning', onWarning);
  try {
    const entry = addEntry(root, sid, { desc: '挂钩失败检索词月长石', workspace: ws });
    assert.ok(entry.no, '正本写入照常成功（挂钩绝不影响正本写入路径）');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(warnings.length, 1, 'emitWarning 恰一条（失败可见，不静默）');
    assert.ok(warnings[0].includes(sid), '告警点名会话');
    assert.equal(fs.existsSync(path.join(root, 'sessions', sid, 'ledger.md')), true, '正本在场');
  } finally {
    process.off('warning', onWarning);
  }
});

test('SEARCH-12: reindexSession 显式重建——gen 递增可观测；未知 sid 返回 null', () => {
  const root = tmpRoot();
  const ws = tmpWorkspace(root, 'ws');
  const sid = seedSession(root, ws, '显式重建格');
  addEntry(root, sid, { desc: '显式重建检索词赤铁', workspace: ws });
  const g1 = reindexSession(root, sid);
  const g2 = reindexSession(root, sid);
  assert.equal(g1.sid, sid);
  assert.equal(g2.gen, g1.gen + 1, 'gen 逐次递增');
  assert.ok(g2.entries >= g1.entries, '条目数可观测');
  assert.equal(reindexSession(root, 'not-a-sid'), null, '未知形状 sid＝null（不抛错）');
});
