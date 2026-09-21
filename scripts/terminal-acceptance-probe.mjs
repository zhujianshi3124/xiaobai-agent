// 终验取证探针（只读，不写任何被取证文件）
// 目的：对第 10 轮硬判据 a–e 逐条给出磁盘铁证。
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = "D:\\dsh-plugins\\dsh-toolkit";
const TARGET = join(ROOT, "cordis.patch.yml");
const sha = (b) => createHash("sha256").update(b).digest("hex");
const line = (t = "") => console.log(t);

// 【历史冻结 · 2026-09-21 Pack I / D-17】第 10 轮终验的时点探针（只读、不写盘，跑起来无害）。
// 但它判的是当时的基准 ce0b0b81… 与「HEAD blob + 追加 toolkit-manager 4 行」的重建公式，两者都已退役
// ⇒ 今天重跑必然打印 "NO ✗"，那是**预期的时点错位，不是新故障**。别据此改本文件、也别当回归跑：
// 它不在 regression-all / ci-local 清单内。历史结论正本见 evidence/TERMINAL-ACCEPTANCE-ROUND10.txt。
line("【时点脚本 · 已冻结】以下读数按第 10 轮（2026-09-18）的判据基准解释，今天重跑出现 NO ✗ 属预期（详见本文件头注）。");

line("══════════════════════════════════════════════════════════════════");
line("终验取证探针（只读）  " + new Date().toISOString());
line("══════════════════════════════════════════════════════════════════");

// ---------- 0. 当前文件身份 ----------
const cur = readFileSync(TARGET);
const curText = cur.toString("utf8");
const curSha = sha(cur);
line("");
line("【0】当前 cordis.patch.yml");
line("  sha256 = " + curSha);
line("  size   = " + cur.length);
line("  CRLF   = " + curText.includes("\r\n") + "   bareLF = " + /[^\r]\n/.test(curText));

// ---------- 基准重建（HEAD blob + 4 行 toolkit-manager，全 CRLF） ----------
let headBlob;
try {
  headBlob = execFileSync("git", ["show", "HEAD:cordis.patch.yml"], { cwd: ROOT, maxBuffer: 1 << 24 }).toString("utf8");
} catch (e) {
  headBlob = null;
}
line("");
line("【基准重建】HEAD blob");
if (headBlob === null) {
  line("  ⚠ git show HEAD:cordis.patch.yml 失败");
} else {
  const headLf = Buffer.byteLength(headBlob, "utf8");
  line("  HEAD blob LF 字节 = " + headLf);
  const APPEND_LF = "\n- insert:\n    - id: toolkit-manager\n      name: 'file:///D:/dsh-plugins/dsh-toolkit/panel/index.js'\n";
  const baselineLf = headBlob.replace(/\r\n/g, "\n") + APPEND_LF;
  const baselineCrlf = baselineLf.replace(/\n/g, "\r\n");
  const baseSha = sha(Buffer.from(baselineCrlf, "utf8"));
  line("  重建基准(CRLF) 字节 = " + Buffer.byteLength(baselineCrlf, "utf8"));
  line("  重建基准 sha256 = " + baseSha);
  line("  与 ce0b0b81… 相符? " + (baseSha.startsWith("ce0b0b81") ? "YES ✓" : "NO ✗"));
}

// ---------- 1. 备份链 ----------
line("");
line("【a】写前备份链 .panel-write-backups/");
const bkRoot = join(ROOT, ".panel-write-backups");
if (!existsSync(bkRoot)) {
  line("  ⚠ 备份根不存在");
} else {
  const stamps = readdirSync(bkRoot).sort();
  line("  备份份数 = " + stamps.length);
  const rows = [];
  for (const s of stamps) {
    const mf = join(bkRoot, s, "manifest.json");
    let m = null;
    try { m = JSON.parse(readFileSync(mf, "utf8")); } catch { /* ignore */ }
    const f0 = m && m.files && m.files[0] ? m.files[0] : null;
    rows.push({
      stamp: s,
      createdAt: m ? m.createdAt : "(无)",
      reason: m ? JSON.stringify(m.reason) : "(无manifest)",
      note: m ? JSON.stringify(m.note) : "(无manifest)",
      savedAs: f0 ? f0.savedAs : "(无)",
      shaBefore: f0 ? f0.sha256 : "(无)",
    });
  }
  for (const r of rows) {
    line("  ── " + r.stamp);
    line("     createdAt = " + r.createdAt);
    line("     reason    = " + r.reason + "     note = " + r.note);
    line("     savedAs   = " + r.savedAs);
    line("     shaBefore = " + r.shaBefore);
    // 备份副本可见性（目录项 vs ADS）
    const dirAbs = join(bkRoot, r.stamp);
    const entries = readdirSync(dirAbs).filter((n) => n !== "manifest.json");
    for (const e of entries) {
      const p = join(dirAbs, e);
      const st = statSync(p);
      line("     副本目录项: 名字='" + e + "'  可见字节=" + st.size);
    }
    // 用 savedAs 原样读（与引擎回滚同路径）
    if (r.savedAs !== "(无)") {
      const p = join(dirAbs, r.savedAs);
      try {
        const b = readFileSync(p);
        line("     按 savedAs 读回: OK  " + b.length + " B  sha=" + sha(b).slice(0, 16));
      } catch (err) {
        line("     按 savedAs 读回: FAIL " + err.code + " " + err.message.slice(0, 60));
      }
    }
  }
  line("");
  line("  ▸ 链式对账（shaBefore 是否为上一份的 shaAfter）");
  // 只有 shaBefore，没有 shaAfter；用「下一份的 shaBefore = 上一份写后的 sha」推断
  for (let i = 0; i < rows.length; i++) {
    line("     写# " + (i + 1) + "  shaBefore = " + rows[i].shaBefore.slice(0, 16));
  }
  line("     当前磁盘         = " + curSha.slice(0, 16));
}

// ---------- 2. 当前文件 vs 基准 逐行 diff ----------
line("");
line("【b/c】当前 vs 基准 逐行 diff");
if (headBlob !== null) {
  const APPEND_LF = "\n- insert:\n    - id: toolkit-manager\n      name: 'file:///D:/dsh-plugins/dsh-toolkit/panel/index.js'\n";
  const baselineCrlf = (headBlob.replace(/\r\n/g, "\n") + APPEND_LF).replace(/\n/g, "\r\n");
  const A = baselineCrlf.split("\r\n");
  const B = curText.split("\r\n");
  // 简单行级 diff（LCS）
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { ops.push({ t: "=", a: A[i], aIdx: i + 1 }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: "-", a: A[i], aIdx: i + 1 }); i++; }
    else { ops.push({ t: "+", a: B[j], aIdx: j + 1 }); j++; }
  }
  while (i < n) { ops.push({ t: "-", a: A[i], aIdx: i + 1 }); i++; }
  while (j < m) { ops.push({ t: "+", a: B[j], aIdx: j + 1 }); j++; }
  const del = ops.filter((o) => o.t === "-");
  const add = ops.filter((o) => o.t === "+");
  line("  基准行数 = " + n + "  当前行数 = " + m);
  line("  删除行 = " + del.length + "  新增行 = " + add.length);
  for (const o of ops) {
    if (o.t !== "=") line("   " + o.t + " [基准行" + o.aIdx + "] " + JSON.stringify(o.a));
  }
}

// ---------- 3. 当前各行 disabled 明细 ----------
line("");
line("【d】当前文件全部 disabled 行 + 行块归属");
{
  const L = curText.split("\r\n");
  let owner = "(顶层)";
  for (let k = 0; k < L.length; k++) {
    const mId = /^(\s*)- id:\s*(\S+)/.exec(L[k]);
    if (mId) owner = mId[2];
    if (/\bdisabled\b/.test(L[k])) {
      line("  L" + (k + 1) + "  [" + owner + "]  " + JSON.stringify(L[k]));
    }
  }
}

// ---------- 4. rate-throttle 行块原文 ----------
line("");
line("【d】rate-throttle 行块（前 8 行）");
{
  const L = curText.split("\r\n");
  let start = -1;
  for (let k = 0; k < L.length; k++) {
    if (/^\s*- id:\s*rate-throttle\s*$/.test(L[k])) { start = k; break; }
  }
  if (start < 0) line("  ⚠ 未找到 rate-throttle");
  else for (let k = start; k < Math.min(start + 8, L.length); k++) line("  L" + (k + 1) + "  " + JSON.stringify(L[k]));
}

line("");
line("══════════════════════════════════════════════════════════════════");
