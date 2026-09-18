// Q2 尾①：补扫 shipped presets 当前内容（只读）
// 目标：<npm dsh 安装目录>/dsh-agent-presets/presets/{standard,ptc,cordis,minimal}/agent.cordis.yml
// 红线判定：AppData/.../npm/... 属 DSH 安装目录，不在红线内（红线仅 ~/.dsh、cloudflared、五子插件源码目录）
//
// 结论框架（修正版）：
//   - 「toolkit 五 insert-id 行」= rate-throttle / web-search-local / web-search-router /
//     agent-memory-runtime / toolkit-manager —— 这三份 shipped preset 里应【无】。
//   - compact-router 是【另一回事】：它不在 cordis.patch.yml 的五条 insert 里，
//     而是由 scripts/apply-preset-patch.mjs 就地把 upstream `compaction-basic` 行
//     改名为 `compact-router` —— 属【文档化的预设改写注入路径】（见 cordis.patch.yml:3 注释）。
//     因此 shipped preset 里【有】1 处 compact-router 行是设计如此，不是泄漏。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = 'C:\\Users\\LENOVO\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh\\node_modules\\@deepseek-ai\\dsh-agent-presets';
const PRESETS = ['standard', 'ptc', 'cordis', 'minimal'];
const PATCHED = ['standard', 'ptc', 'cordis'];
const FIVE_INSERT_IDS = ['rate-throttle', 'web-search-local', 'web-search-router', 'agent-memory-runtime', 'toolkit-manager'];
const STATE = 'D:\\dsh-plugins\\dsh-toolkit\\preset-patch-state.json';

const out = [];
const P = (s = '') => { out.push(s); console.log(s); };
let pass = 0, fail = 0;
const assert = (name, cond, detail = '') => {
  if (cond) { pass++; P(`  PASS  ${name}`); }
  else { fail++; P(`  FAIL  ${name}${detail ? ' :: ' + detail : ''}`); }
};
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

P('═'.repeat(74));
P('Q2 尾①  shipped presets 补扫（只读）');
P('═'.repeat(74));
P('');
P(`presets 根: ${ROOT}\\presets`);
P(`存在? ${fs.existsSync(ROOT) ? 'YES' : 'NO'}`);
P('');
P('presets/ 下的 preset id:');
const presetsDir = path.join(ROOT, 'presets');
for (const e of fs.readdirSync(presetsDir, { withFileTypes: true })) {
  P(`  ${e.isDirectory() ? '[dir ]' : '[file]'} ${e.name}`);
}
P('');

const state = JSON.parse(fs.readFileSync(STATE, 'utf8'));
const findings = {};

for (const name of PRESETS) {
  P('─'.repeat(74));
  P(`preset = ${name}`);
  P('─'.repeat(74));
  const file = path.join(presetsDir, name, 'agent.cordis.yml');
  if (!fs.existsSync(file)) { P(`  缺 agent.cordis.yml: ${file}`); findings[name] = { found: false }; P(''); continue; }
  const buf = fs.readFileSync(file);
  const text = buf.toString('utf8');
  const hash = sha(buf);
  const rows = text.split(/\r?\n/).filter(l => /^\s*-\s*id\s*:/.test(l)).map(l => l.trim());
  const fiveHits = rows.filter(r => FIVE_INSERT_IDS.some(id => r.includes(id)));
  const crRows = text.split(/\r?\n/).map((l, i) => [i + 1, l]).filter(([, l]) => /^\s*-\s*id:\s*compact-router\s*$/.test(l));
  const crNames = text.split(/\r?\n/).map((l, i) => [i + 1, l]).filter(([, l]) => /name:\s*'@local\/dsh-toolkit\/compact-router'/.test(l));
  const hasUpstream = text.includes("'@deepseek-ai/dsh-compaction-basic'");
  const hasOldV2 = text.includes("'@local/dsh-compact-router'");
  const crCount = crRows.length;
  const marker = state[name];
  const markerMatch = marker ? marker.patchedSha === hash : null;

  P(`  路径 : ${file}`);
  P(`  字节 : ${buf.length}   行数: ${text.split(/\r?\n/).length}   EOL: ${text.includes('\r\n') ? 'CRLF' : 'LF'}`);
  P(`  sha256: ${hash}`);
  if (marker) {
    P(`  marker.patchedSha : ${marker.patchedSha}`);
    P(`  marker.originalSha: ${marker.originalSha}`);
    P(`  sha == patchedSha ? ${markerMatch ? 'YES' : 'NO'}`);
    P(`  patchedAt         : ${marker.patchedAt}`);
  } else {
    P('  marker: （无记录）');
  }
  P(`  -id: 行 (${rows.length}):`);
  for (const r of rows) P(`      ${r}`);
  P('');
  P(`  ▸ toolkit 五 insert-id 命中 : ${fiveHits.length ? fiveHits.join(' | ') : '无'}`);
  P(`  ▸ compact-router 行         : ${crCount} 处  ${crRows.map(([n]) => 'L' + n).join(', ') || ''}`);
  P(`  ▸ compact-router name 行    : ${crNames.length} 处  ${crNames.map(([n]) => 'L' + n).join(', ') || ''}`);
  P(`  ▸ 残留 @deepseek-ai/dsh-compaction-basic : ${hasUpstream ? '有' : '无'}`);
  P(`  ▸ 残留 @local/dsh-compact-router(旧名)   : ${hasOldV2 ? '有' : '无'}`);
  P('');
  findings[name] = { found: true, file, bytes: buf.length, hash, rows, fiveHits, crCount, hasUpstream, hasOldV2, markerMatch };
}

P('─'.repeat(74));
P('断言');
P('─'.repeat(74));

for (const name of PATCHED) {
  const f = findings[name];
  assert(`shipped[${name}] 存在`, f && f.found);
  if (!f || !f.found) continue;
  assert(`shipped[${name}] 无 toolkit 五 insert-id 行`, f.fiveHits.length === 0, f.fiveHits.join(','));
  assert(`shipped[${name}] 恰有 1 处 compact-router 行（文档化预设改写路径）`, f.crCount === 1, `实际 ${f.crCount}`);
  assert(`shipped[${name}] 原 upstream compaction-basic 行已被原位替换（无残留）`, f.hasUpstream === false);
  assert(`shipped[${name}] 无旧名 @local/dsh-compact-router 残留`, f.hasOldV2 === false);
  assert(`shipped[${name}] sha == preset-patch-state.json.patchedSha`, f.markerMatch === true, `disk=${f.hash.slice(0, 16)}… marker≠`);
}
{
  const f = findings['minimal'];
  assert('shipped[minimal] 存在', f && f.found);
  if (f && f.found) {
    assert('shipped[minimal] 无 toolkit 五 insert-id 行', f.fiveHits.length === 0, f.fiveHits.join(','));
    assert('shipped[minimal] 无 compact-router 行（脚本明文：minimal 设计上不动）', f.crCount === 0, `实际 ${f.crCount}`);
  }
}

P('');
P('═'.repeat(74));
P(`RESULT: ${pass}/${pass + fail} PASS`);
P('═'.repeat(74));

const outPath = 'D:\\dsh-plugins\\dsh-toolkit\\panel\\docs\\evidence\\Q2-SHIPPED-PRESET-SCAN.txt';
fs.writeFileSync(outPath, out.join('\n') + '\n', 'utf8');
console.log(`\n证据已写入: ${outPath}`);
