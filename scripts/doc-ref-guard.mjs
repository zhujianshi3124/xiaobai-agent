#!/usr/bin/env node
// 文档引用守卫（D-20 / 收口批 C-1）——docs 面的 path[:#]anchor 引用守卫。
//
// 规则（`docs/repair-plan-20260923.md` §9.3 批 C-1 ＋ debt.md D-20）：
//   扫 docs/*.md 与 panel/docs/evidence/*.md 里的 path[:#]anchor 引用——
//   ① 目标文件必须存在（候选根：toolkit 仓根 / 沙箱根 / doctor 仓 / home；绝对路径直接验）；
//   ② `#符号` 锚必须在目标文件可 grep（字面；debt "#NN 条目" 空格形态只验存在性）；
//   ③ 行号形态（:123 / :123-456）在活文档一律判红并要求改符号名/节名（D-20 原文）；
//   ④ 跨仓引用按 recon §10.3 规矩解析：toolkit: / doctor仓: 前缀；两份逐行矩阵头部
//      自定义的 TK/ ＝ toolkit、DC/ ＝ doctor仓，按其文档内定义收录为合法别名；
//   ⑤ 双引号内的路径形 token 跳过（manifest 值/JSON 字面量语境——`"./plugin.js"` 是
//      声明原文不是文档引用）；冻结件的存在性/符号失败降级为警示（不阻断）——引用方
//      冻结不可改写，阻断无解；活文档判据不因豁免放宽。
//
// token 切分校准（首轮扫描 500＋条假红逐条归因后的加验型修正；三条都**多验不减免**）：
//   ⑥ 花括号并列 `b10{a,b,c}-mutate.mjs` ＝ 三个文件，逐个展开逐个验（此前正则在大括号处
//      断开，只捞到残片 `-mutate.mjs` 并误报"目标不存在"）；
//   ⑦ 斜杠并列 `rules.ts/doctor.ts/probes.ts` ＝ 多文件并列，判据是"目录段自带扩展名"
//      （真目录名不会以 `.ts`/`.json` 收尾），拆开后每一段各自验存在性（此前整串当一个路径，
//      既漏验各段又误报整体不存在）；
//   ⑧ 扩展名片段（`.test.mjs`、`.d.ts`、`-learned.json`）＝ 命名惯例/后缀记法：无路径分隔符
//      且以 `.`/`-` 起头者不是文件引用，不抓；真点目录（`.dsh-market/x.json`）带分隔符照验。
//
// 冻结文档（行号豁免、存在性与 #锚照验）——豁免依据写死在 FROZEN_CLASSES，防悄悄扩豁免：
//   - panel/docs/evidence/**：证据正本"只增不改"（D-2 / A#25 硬闸先例），其行号引用
//     记录取证当时实况，判红也无法改写；
//   - docs/contract-v1.1-recon.md 与 docs/contract-v1.1-matrix-*.md：C-1 侦察轮正本与
//     两份逐行矩阵，其行号引用是"逐行核对行号是否准确"的审计对象本身，改写即毁审计
//     语义；侦察已收官。
//
// 已知盲区（如实记，不夸全面守卫）：
//   - 中文简称＋裸行号形态（"计划 `:361`"）不含路径，不在 §9.3 "path[:#]anchor 引用"
//     定义内，不抓；新笔书写纪律仍要求可定位形态；
//   - md 相对锚（[x](#节)）与纯节名引用（"§10.3"）不抓；
//   - 引用书写含目录前缀时按全路径验；裸文件名走仓内递归索引宽松存在性（同名任一即可）。
//
// 自证格：selfcheckCases() 每轮必跑（patch-config-check 同款先例）——解析器退化判
// "本校验器不可信" exit 2，而非安静通过。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const TOOLKIT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SANDBOX = 'D:/dsh-test-sandbox';
const DOCTOR_REPO = path.join(SANDBOX, 'projects', 'doctor');
const HOME = os.homedir();
const EXT = '(?:json|cjs|mjs|yaml|yml|html|md|js|ts|txt|ps1)';
// 路径体：可选「盘符+分隔符」前缀（D:\ 或 D:/）＋正反斜杠分段；锚：行号（含区间）或 #符号。
// 扩展名最长优先＋尾部边界（ext 后不得紧跟路径字符）：防 "dsh.plugin.json" 被 "js"
// 截断成 "dsh.plugin.js" 的假红（首轮扫描实测 500 条同类，已归因此 bug）；
// 盘符后必须有分隔符（D:\seg 形态），否则整体回退成无盘符子路径假红（二轮 10+ 条，已归因）。
// 路径体：可选「盘符+分隔符」前缀（D:\ 或 D:/）＋正反斜杠分段；锚：行号（含区间）或 #符号。
// ⑥ 的花括号并列：`{}` 与 `,` 只作为**普通字符**收进单一扁平字符类，展开在后处理里做（逐个验）。
// 禁写成 `(?:[A-Za-z0-9_.@\-]+|\{[^{}]*\})+` 这类"嵌套量词＋重叠字符类"——实测对长路径段触发
// 指数级回溯，把整步门禁卡死（本会话改稿第一版踩过，故把教训写在这里防复犯）。
const WORD = '[A-Za-z0-9_@.\\-,{}]+';
const TOKEN_RE = new RegExp(
  '(?:toolkit:|doctor\\u4ed3:|TK\\/|DC\\/)?' +
  '((?:[A-Za-z]:[\\\\/])?(?:' + WORD + '[\\\\/]+)*' + WORD + '\\.' + EXT + ')' +
  '(?![A-Za-z0-9_@.\\-])' +
  '(?::(\\d+)(?:\\s*[-\\u2013\\u2014]\\s*(\\d+))?|#([^\\s`),\\u3002\\uFF0C\\uFF1B\\u3001\\uFF08\\uFF09]+))?',
  'g'
);
// ⑧ 扩展名片段：以 `.`/`-` 起头且不含分隔符＝后缀记法/惯例名（`.test.mjs`、`-learned.json`），非文件引用。
const FRAGMENT_RE = /^[.\-][^/\\]*$/;
// ⑥ 花括号展开（支持多个大括号组，笛卡尔积）。
function expandBraces(body) {
  const m = body.match(/\{[^{}]*\}/);
  if (!m) return [body];
  const out = [];
  for (const alt of m[0].slice(1, -1).split(',')) {
    out.push(...expandBraces(body.slice(0, m.index) + alt + body.slice(m.index + m[0].length)));
  }
  return out;
}
// ⑦ 斜杠并列识别：任一「目录段」自带扩展名 ⇒ 这是多文件并列而非目录路径，拆成各段分别验。
function enumerationParts(body) {
  const segs = body.replace(/\\/g, '/').split('/');
  if (segs.length < 2) return null;
  const hasExt = (s) => /\.[A-Za-z0-9]{1,5}$/.test(s);
  if (!segs.slice(0, -1).some(hasExt)) return null;
  const parts = segs.filter(hasExt);
  return parts.length >= 2 ? parts : null;
}
// 保留字（非引用）：运行时/产品名形如路径者。Node.js 是运行时名不是文件引用。
const RESERVED_TOKENS = new Set(['node.js']);
const FENCE_RE = /^\s*(```|~~~)/;

function isFrozenRel(rel) {
  if (rel.startsWith('panel/docs/evidence/')) return true;
  if (rel === 'docs/contract-v1.1-recon.md') return true;
  if (rel.startsWith('docs/contract-v1.1-matrix-')) return true;
  return false;
}

// ---- 目标解析（roots 可注入，供自证格用合成树） ----
function makeRealRoots() {
  return {
    aliases: { 'toolkit:': TOOLKIT, 'doctor\u4ed3:': DOCTOR_REPO, 'TK/': TOOLKIT, 'DC/': DOCTOR_REPO },
    relRoots: [TOOLKIT, SANDBOX, DOCTOR_REPO, HOME],
    home: HOME,
    bareDirs: [TOOLKIT, SANDBOX],
    bareSkip: new Set(['node_modules', '.git', 'dist', '.panel-backups', '.panel-custody', '.panel-write-backups', 'preset-backups', '.registry', 'sessions']),
  };
}
function resolveTarget(rawBody, roots, bareIdx) {
  const rel = rawBody.replace(/\\/g, '/');
  const tried = [];
  const exists = (abs) => {
    try { return fs.existsSync(abs) && fs.statSync(abs).isFile(); } catch { return false; }
  };
  // ① 显式前缀/别名
  for (const key of Object.keys(roots.aliases)) {
    if (rel.toLowerCase().startsWith(key.toLowerCase()) ||
        (key.endsWith('/') && rel.startsWith(key.slice(0, -1) + '/')) ||
        (key.endsWith(':') && rel.startsWith(key))) {
      const rest = rel.slice(key.length).replace(/^\/+/, '');
      const abs = path.join(roots.aliases[key], rest);
      tried.push(abs);
      return exists(abs) ? { ok: true, cands: [abs] } : { ok: false, tried };
    }
  }
  // ② ~ home 形态
  if (rel.startsWith('~/')) {
    const abs = path.join(roots.home, rel.slice(2));
    tried.push(abs);
    return exists(abs) ? { ok: true, cands: [abs] } : { ok: false, tried };
  }
  // ③ 绝对路径
  if (/^[A-Za-z]:\//.test(rel) || /^\/[^/]/.test(rel)) {
    const abs = path.normalize(rel);
    tried.push(abs);
    return exists(abs) ? { ok: true, cands: [abs] } : { ok: false, tried };
  }
  // ④ 相对路径：多根试解
  const cands = [];
  for (const root of roots.relRoots) {
    const abs = path.join(root, rel);
    tried.push(abs);
    if (exists(abs)) cands.push(abs);
  }
  if (cands.length) return { ok: true, cands };
  // ⑤ 裸文件名：递归索引宽松存在性
  if (!rel.includes('/')) {
    const hits = bareIdx().filter(p => path.basename(p).toLowerCase() === rel.toLowerCase());
    if (hits.length) return { ok: true, cands: hits.slice(0, 5) };
  }
  return { ok: false, tried };
}

function grepCands(cands, sym) {
  for (const cand of cands) {
    try { if (fs.readFileSync(cand, 'utf8').includes(sym)) return true; } catch { /* 读不了＝未命中 */ }
  }
  return false;
}

// ASCII "..." 跨度行内掩码：代码消息与字符串字面量（错误文案原文、manifest 值）不是文档引用。
// 同行配对、非贪婪；中文引号「」『』""（全角）不触发——它们是散文强调，不是码串语境。
function maskAsciiQuotedSpans(text) {
  return text.replace(/"[^"\r\n]*"/g, (s) => ' '.repeat(s.length));
}

// 单个「路径体＋锚」的判定：行号形态 / 存在性 / #符号可 grep。⑥ 花括号展开与 ⑦ 并列拆分都汇到这里，
// 因此三条校准一律是"多验几次"——不存在因识别了新形态就少验的情形。
function checkBody(body, suffix, anchors, ctx) {
  const { cite, frozen, roots, bareIdx, stat, reds } = ctx;
  if (anchors.lineA !== undefined) {
    if (frozen) { stat.exemptLineRefs++; return; }
    const range = anchors.lineB !== undefined ? `${anchors.lineA}-${anchors.lineB}` : anchors.lineA;
    reds.push({ cite, token: body + suffix, reason: `行号形态（:${range}）——D-20：改符号名/节名定位` });
    return;
  }
  const resolved = resolveTarget(body, roots, bareIdx);
  if (!resolved.ok) {
    const hint = /(^|\/)(engine\.mjs|doctor\.ts)$/.test(body.replace(/\\/g, '/')) || /(^|\/)src\//.test(body.replace(/\\/g, '/'))
      ? '（若指独立 doctor 仓：按 recon §10.3 加 doctor仓: 前缀）' : '';
    reds.push({ cite, token: body + suffix, reason: `目标不存在（试过 ${resolved.tried.join(' ; ')}）${hint}` });
    return;
  }
  if (anchors.sym !== undefined && !grepCands(resolved.cands, anchors.sym)) {
    reds.push({ cite, token: body + suffix, reason: `#符号 "${anchors.sym}" 在目标文件 grep 不到` });
  }
}

// ---- 单文件扫描（frozen 由调用方按 isFrozenRel 注入，自证格用合成值） ----
function scanLines(lines, citePrefix, frozen, roots, bareIdx) {
  const reds = [];
  const stat = { tokens: 0, exemptLineRefs: 0, fragments: 0 };
  let fences = 0;
  const ctx = { cite: '', frozen, roots, bareIdx, reds, stat };
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    let text = lines[i];
    if (FENCE_RE.test(text)) { inFence = !inFence; fences++; continue; }
    if (inFence) { fences++; continue; }
    text = text.replace(/https?:\/\/\S+/g, ''); // URL 排除
    text = maskAsciiQuotedSpans(text); // ASCII "..." 跨度掩码（代码消息/字符串字面量语境，非文档引用）
    TOKEN_RE.lastIndex = 0;
    let m;
    while ((m = TOKEN_RE.exec(text))) {
      // 前导斜杠语境：token 紧跟在 "/" 后＝路由字面量（/v2/connector.js）或路径碎片，
      // 不是文件引用（完整路径若可作 token 会从段首起匹配）
      if (m.index > 0 && text[m.index - 1] === '/') continue;
      if (RESERVED_TOKENS.has(m[1].toLowerCase())) continue;
      if (FRAGMENT_RE.test(m[1])) { stat.fragments++; continue; } // ⑧ 惯例名/后缀记法，非引用
      stat.tokens++;
      ctx.cite = `${citePrefix}:${i + 1}`;
      const anchors = { lineA: m[2], lineB: m[3], sym: m[4] };
      const suffix = anchors.lineA !== undefined
        ? (anchors.lineB !== undefined ? `:${anchors.lineA}-${anchors.lineB}` : `:${anchors.lineA}`)
        : (anchors.sym !== undefined ? `#${anchors.sym}` : '');
      const enumParts = enumerationParts(m[1]);
      if (enumParts) { // ⑦ 并列：每段各自验（锚随整串无意义，逐段验存在性）
        for (const part of enumParts) checkBody(part, '', { lineA: undefined, lineB: undefined, sym: undefined }, ctx);
        continue;
      }
      for (const body of expandBraces(m[1])) checkBody(body, suffix, anchors, ctx); // ⑥ 展开逐个验
    }
  }
  return { reds, fences, ...stat };
}

function scanFile(absFile, rel, roots, bareIdx) {
  const raw = fs.readFileSync(absFile, 'utf8');
  const r = scanLines(raw.split(/\r?\n/), rel, isFrozenRel(rel), roots, bareIdx);
  return { ...r, frozen: isFrozenRel(rel) };
}

// ---- 裸名递归索引（缓存） ----
function makeBareIndex(roots) {
  let cache = null;
  return function bareIdx() {
    if (cache) return cache;
    const out = [];
    const walk = (dir, depth) => {
      if (depth > 6 || out.length > 80000) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (e.name.startsWith('.') || roots.bareSkip.has(e.name)) continue;
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) walk(abs, depth + 1);
        else if (e.isFile()) out.push(abs);
      }
    };
    for (const d of roots.bareDirs) walk(d, 0);
    cache = out;
    return out;
  };
}

// ---- 自证格：合成迷你树全链自证（解析、判据、豁免、排除、别名、盲区不越权） ----
function selfcheckCases() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-ref-guard-selfcheck-'));
  try {
    const write = (rel, text) => {
      const abs = path.join(dir, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, text);
    };
    write('docs/ok.md', '见 `src/lib.mjs#myFunc` 与 `src/lib.mjs` 与 `lib.mjs`（裸名）。');
    write('src/lib.mjs', 'export function myFunc() {}\n');
    write('lib.mjs', 'bare hit\n');
    write('.dsh-market/d.json', '{}\n');
    write('b10x-mutate.mjs', '// 花括号展开验真用\n');
    write('b10y-mutate.mjs', '// 花括号展开验真用\n');
    const roots = { aliases: { 'TK/': dir }, relRoots: [dir], home: dir, bareDirs: [dir], bareSkip: new Set() };
    const bareIdx = () => [
      path.join(dir, 'lib.mjs'), path.join(dir, 'src', 'lib.mjs'),
      path.join(dir, 'b10x-mutate.mjs'), path.join(dir, 'b10y-mutate.mjs'),
    ];
    const scan = (relText, frozen) => scanLines(relText.split(/\r?\n/), 't.md', frozen, roots, bareIdx);
    const cases = [];
    let atoms = 0;
    const eq = (name, got, want) => {
      atoms += Array.isArray(want) ? want.length : 1;
      cases.push({ name, ok: JSON.stringify(got) === JSON.stringify(want), got, want });
    };

    const ok = scan('见 `src/lib.mjs#myFunc` 与 `src/lib.mjs` 与 `lib.mjs`。', false);
    eq('① 合规引用（#符号/相对路径/裸名）零红', ok.reds.length, 0);
    eq('①b token 计数=3', ok.tokens, 3);
    const line = scan('见 `src/lib.mjs:12` 与 `a/b.md:3-9`。', false);
    eq('② 行号形态（单/区间）各红一条', line.reds.length, 2);
    eq('②b 冻结面行号豁免且恰记两条', [scan('`src/lib.mjs:12`', true).reds.length, scan('`src/lib.mjs:12`', true).exemptLineRefs], [0, 1]);
    const miss = scan('见 `src/nope.mjs` 与 `src/lib.mjs#ghost`。', false);
    eq('③ 缺文件与缺符号各红一条', miss.reds.length, 2);
    eq('④ 围栏代码块内不扫', scan('```\nsrc/lib.mjs:99\n```\n完。', false).reds.length, 0);
    eq('⑤ URL 排除、同行真引用照验', scan('看 https://example.com/a.md:9 好，`src/lib.mjs#nope` 红。', false).reds.length, 1);
    eq('⑥ TK/ 别名解析成功且行号照红', scan('`TK/src/lib.mjs:3`', false).reds.length, 1);
    eq('⑦ 区间连接号三种形态都抓', scan('`a.md:1-2` `a.md:1–2` `a.md:1—2`', false).reds.length, 3);
    eq('⑧ 非引用 token 不误报（版本号/端口/host 包名）',
      scan('版本 4.0.2 与 0.1.5-rc.1、端口 127.0.0.1:3080、宿主 dsh-agent-loop lib:1536、语义版本 v1.1。', false).reds.length, 0);
    eq('⑨ 提交 hash 与纯节名不抓', scan('提交 ea69cd8；见 §10.3 与（该文件 §三）。', false).reds.length, 0);
    eq('⑩ 双引号字符串语境跳过（manifest 值）', scan('声明原文：`"exports": { ".": "./lib/index.js", "./plugin": "./plugin.js" }`。', false).reds.length, 0);
    eq('⑬ 双引号代码消息原文整体豁免', scan('`entryNotFoundMessage` 里"该目录没有 dsh.plugin.json，也没有 package.json 和 index.js/index.mjs"那一支。', false).reds.length, 0);
    eq('⑭ 路由字面量（前导斜杠）不当作文件引用', scan('路由表：`/api/x` + `/v2/connector.js` 共 32 条。', false).reds.length, 0);
    eq('⑮ 保留字 Node.js（运行时名）不抓；锚不含全角括号', [
      scan('实测 Node.js v24.21.0 正常。', false).reds.length,
      scan('见 `src/lib.mjs#myFunc`（挂载键）。', false).reds.length,
    ], [0, 0]);
    eq('⑪ 冻结分类：evidence/矩阵/recon 冻结、活文档不误标', [
      isFrozenRel('panel/docs/evidence/X.md'), isFrozenRel('docs/contract-v1.1-recon.md'),
      isFrozenRel('docs/contract-v1.1-matrix-migration.md'), isFrozenRel('docs/debt.md'),
    ], [true, true, true, false]);
    const absSelf = scan('绝对盘符：`' + path.join(dir, 'src', 'lib.mjs') + '#myFunc`。', false);
    eq('⑫ 盘符绝对路径（反斜杠）整体匹配且 #符号过', absSelf.reds.length, 0);
    // ⑯⑰⑱ token 切分校准（⑥⑦⑧）——三条都是加验型，逐条钉住"识别新形态不多验也不少验"
    const en = scan('并列：`b10x-mutate.mjs/nope.mjs` 与 `rules.ts/doctor.ts`。', false);
    eq('⑯ 斜杠并列逐段各自验（在场段绿、缺席段各红；整串当一个路径只会得 2 红）',
      [en.reds.length, en.tokens], [3, 2]);
    eq('⑯b 并列翻红时报的是各段名，不是整串', en.reds.map((r) => r.token).sort(), ['doctor.ts', 'nope.mjs', 'rules.ts']);
    const bzOk = scan('工装 `b10{x,y}-mutate.mjs`。', false);
    eq('⑰ 花括号展开＝逐个验真（两个都在场 ⇒ 零红）', bzOk.reds.length, 0);
    const bzBad = scan('工装 `b10{x,z}-mutate.mjs`。', false);
    eq('⑰b 展开中缺席的那个翻红且报展开后名', [bzBad.reds.length, bzBad.reds[0] && bzBad.reds[0].token], [1, 'b10z-mutate.mjs']);
    const frag = scan('惯例 `.test.mjs`、后缀 `-learned.json`，真引用 `lib.mjs` 照验。', false);
    eq('⑱ 片段形（点/连字符起头且无分隔符）不抓，同行真引用不少验',
      [frag.reds.length, frag.fragments, frag.tokens], [0, 2, 1]);
    eq('⑱b 点目录（带分隔符）不在片段豁免内：在场则绿、缺席则红',
      [scan('`<插件名>/<主题>.test.mjs` 与 `.dsh-market/d.json`。', false).reds.length,
       scan('`.dsh-market/nope.json`。', false).reds.length], [0, 1]);

    const bad = cases.filter(c => !c.ok);
    if (bad.length) {
      console.error('  ✗ 本校验器不可信（selfcheck 未过，解析器退化或判据破损）：');
      for (const c of bad) console.error(`      ${c.name}: got=${JSON.stringify(c.got)} want=${JSON.stringify(c.want)}`);
      return false;
    }
    console.log(`  ✓ 引用守卫自证格 ${atoms}/${atoms} 断言通过（${cases.length} 组比对；解析/判据/豁免/排除/切分校准全链）`);
    return true;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ---- 主流程 ----
function main() {
  if (!selfcheckCases()) process.exit(2);
  const roots = makeRealRoots();
  const bareIdx = makeBareIndex(roots);

  const targets = [];
  for (const f of fs.readdirSync(path.join(TOOLKIT, 'docs'))) {
    if (f.endsWith('.md')) targets.push({ abs: path.join(TOOLKIT, 'docs', f), rel: 'docs/' + f });
  }
  const evDir = path.join(TOOLKIT, 'panel', 'docs', 'evidence');
  if (fs.existsSync(evDir)) {
    for (const f of fs.readdirSync(evDir)) {
      if (f.endsWith('.md')) targets.push({ abs: path.join(evDir, f), rel: 'panel/docs/evidence/' + f });
    }
  }

  const livingReds = [];
  const frozenWarns = [];
  let totalTokens = 0, totalExempt = 0, totalFragments = 0, frozenCount = 0;
  for (const t of targets) {
    const r = scanFile(t.abs, t.rel, roots, bareIdx);
    totalTokens += r.tokens;
    totalExempt += r.exemptLineRefs;
    totalFragments += r.fragments;
    if (r.frozen) frozenCount++;
    for (const red of r.reds) (r.frozen ? frozenWarns : livingReds).push({ file: t.rel, ...red });
  }

  console.log('════════════════════════════════════════════════════════');
  console.log('文档引用守卫（D-20 / 收口批 C-1）  ' + new Date().toISOString());
  console.log('════════════════════════════════════════════════════════');
  console.log(`  扫描 ${targets.length} 份（活文档 ${targets.length - frozenCount}＋冻结 ${frozenCount}）；引用 token ${totalTokens}；冻结行号豁免 ${totalExempt}；片段形（⑧不抓，如 \`index.mjs\` 惯例名）${totalFragments}`);
  if (frozenWarns.length) {
    console.log(`  △ 冻结件警示 ${frozenWarns.length} 条（引用方冻结不可改写，记录不阻断；新增引用不得效仿）：`);
    for (const r of frozenWarns) {
      const ln = r.cite.split(':')[1];
      console.log(`      ${r.file}:${ln}  ${r.token}  →  ${r.reason}`);
    }
  }
  if (livingReds.length) {
    console.log(`  ✗ 红集 ${livingReds.length} 条：`);
    for (const r of livingReds) {
      const ln = r.cite.split(':')[1];
      console.log(`      ${r.file}:${ln}  ${r.token}  →  ${r.reason}`);
    }
    console.log(`  存在 ${livingReds.length} 项异常`);
    process.exit(1);
  }
  console.log('  ✓ 全绿（真树零误报：活文档红集为空）');
  process.exit(0);
}

main();
