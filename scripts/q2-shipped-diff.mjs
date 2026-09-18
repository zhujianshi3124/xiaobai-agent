// Q2 尾① 附：shipped preset「原版(备份) ↔ 现版(磁盘)」差异还原
import fs from 'node:fs';
import crypto from 'node:crypto';

const REPO = 'D:\\dsh-plugins\\dsh-toolkit';
const SHIPPED = 'C:\\Users\\LENOVO\\AppData\\Roaming\\npm\\node_modules\\@deepseek-ai\\dsh\\node_modules\\@deepseek-ai\\dsh-agent-presets\\presets';
const sha = b => crypto.createHash('sha256').update(b).digest('hex');

// 极简 LCS 行级 diff（够用）
function diffLines(a, b) {
  const n = a.length, m = b.length;
  // LCS 表
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push(['  ', a[i], i + 1, j + 1]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push(['- ', a[i], i + 1, null]); i++; }
    else { out.push(['+ ', b[j], null, j + 1]); j++; }
  }
  while (i < n) { out.push(['- ', a[i], i + 1, null]); i++; }
  while (j < m) { out.push(['+ ', b[j], null, j + 1]); j++; }
  return out;
}

const out = [];
const P = s => { out.push(s); console.log(s); };

P('═'.repeat(72));
P('Q2 尾① 附  shipped preset  原版 ↔ 现版  差异还原');
P('═'.repeat(72));

for (const name of ['standard', 'ptc', 'cordis']) {
  P('');
  P('─'.repeat(72));
  P(`preset = ${name}`);
  P('─'.repeat(72));
  const bak = `${REPO}\\preset-backups\\${name}.agent.cordis.yml.bak`;
  const cur = `${SHIPPED}\\${name}\\agent.cordis.yml`;
  const bBak = fs.readFileSync(bak), bCur = fs.readFileSync(cur);
  P(`  backup : ${bak}`);
  P(`           ${bBak.length} B  sha256=${sha(bBak)}`);
  P(`  current: ${cur}`);
  P(`           ${bCur.length} B  sha256=${sha(bCur)}`);
  P(`  Δ 字节 : ${bCur.length - bBak.length}`);
  const a = bBak.toString('utf8').split('\n');
  const b = bCur.toString('utf8').split('\n');
  P(`  行数   : backup=${a.length}  current=${b.length}`);
  P('');
  P('  完整 diff:');
  const d = diffLines(a, b);
  for (const [tag, line, lnA, lnB] of d) {
    const pos = tag === '  ' ? `      ` : tag === '- ' ? `a:${String(lnA).padStart(3)} ` : `      b:${String(lnB).padStart(3)} `;
    P(`  ${tag}${pos}| ${line}`);
  }
}

P('');
P('═'.repeat(72));
P('完');
P('═'.repeat(72));

fs.writeFileSync(`${REPO}\\panel\\docs\\evidence\\Q2-SHIPPED-PRESET-DIFF.txt`, out.join('\n') + '\n', 'utf8');
console.log('\n证据已写入: ' + `${REPO}\\panel\\docs\\evidence\\Q2-SHIPPED-PRESET-DIFF.txt`);
