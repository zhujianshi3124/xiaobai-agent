// 终验取证探针 2：用备份链重建每一次写的精确 diff（只读）
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = "D:\\dsh-plugins\\dsh-toolkit";
const TARGET = join(ROOT, "cordis.patch.yml");
const sha = (b) => createHash("sha256").update(b).digest("hex");
const L = (t = "") => console.log(t);

// 【历史冻结 · 2026-09-21 Pack I / D-17】同上：第 10 轮"硬判据 (c) 复原到基准"的时点探针（只读、不写盘）。
// 基准 ce0b0b81… 与重建公式（HEAD blob + 追加 toolkit-manager 4 行）都已退役 ⇒ 今天重跑必报
// "NO ✗ — 未回到基准"，属预期的时点错位，不是新故障，也不要为凑绿去改这里。
L("【时点脚本 · 已冻结】本探针判的是第 10 轮（2026-09-18）的基准复原，今天重跑出现 NO ✗ 属预期（详见本文件头注）。");

const headBlob = execFileSync("git", ["show", "HEAD:cordis.patch.yml"], { cwd: ROOT, maxBuffer: 1 << 24 }).toString("utf8");
const APPEND_LF = "\n- insert:\n    - id: toolkit-manager\n      name: 'file:///D:/dsh-plugins/dsh-toolkit/panel/index.js'\n";
const baseline = Buffer.from((headBlob.replace(/\r\n/g, "\n") + APPEND_LF).replace(/\n/g, "\r\n"), "utf8");

const bkRoot = join(ROOT, ".panel-write-backups");
const stamps = readdirSync(bkRoot).sort();

// 每个备份的 payload = 该次写的「写前」内容
const states = [];
states.push({ tag: "P0 基准(写#1前)", buf: baseline });
for (let i = 0; i < stamps.length; i++) {
  const dir = join(bkRoot, stamps[i]);
  const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  const f0 = m.files[0];
  const buf = readFileSync(join(dir, f0.savedAs));
  states.push({ tag: "P" + (i + 1) + " 写#" + (i + 1) + "前(=" + (i === 0 ? "基准" : "写#" + i + "后)"), buf, stamp: stamps[i], m });
}
const cur = readFileSync(TARGET);
states.push({ tag: "P" + (stamps.length + 1) + " 当前(=写#" + stamps.length + "后)", buf: cur });

L("══════════════════════════════════════════════════════════════");
L("备份链状态重建（各状态承载 = 备份 payload + 当前磁盘）");
L("══════════════════════════════════════════════════════════════");
states.forEach((s, i) => {
  const prev = i > 0 ? states[i - 1].buf.length : null;
  L("  " + s.tag.padEnd(34) + " " + String(s.buf.length).padStart(5) + " B  " + sha(s.buf).slice(0, 16) +
    (prev !== null ? "  Δ=" + (s.buf.length - prev >= 0 ? "+" : "") + (s.buf.length - prev) : ""));
});

function diffLines(aBuf, bBuf) {
  const A = aBuf.toString("utf8").split("\r\n");
  const B = bBuf.toString("utf8").split("\r\n");
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { ops.push({ t: "=", s: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: "-", s: A[i] }); i++; }
    else { ops.push({ t: "+", s: B[j] }); j++; }
  }
  while (i < n) { ops.push({ t: "-", s: A[i++] }); }
  while (j < m) { ops.push({ t: "+", s: B[j++] }); }
  return ops.filter((o) => o.t !== "=");
}

L("");
L("── 每次写的精确行级 diff（前 → 后） ──");
for (let i = 1; i < states.length; i++) {
  const ops = diffLines(states[i - 1].buf, states[i].buf);
  const del = ops.filter((o) => o.t === "-").length;
  const add = ops.filter((o) => o.t === "+").length;
  L("");
  L("  ◆ 写#" + i + "  " + states[i - 1].tag + " → " + states[i].tag);
  L("     " + states[i - 1].buf.length + " B (" + sha(states[i - 1].buf).slice(0, 12) + ") → " +
    states[i].buf.length + " B (" + sha(states[i].buf).slice(0, 12) + ")   删" + del + " 增" + add);
  for (const o of ops) L("       " + o.t + " " + JSON.stringify(o.s));
  // CRLF 校验
  const t = states[i].buf.toString("utf8");
  L("     CRLF=" + t.includes("\r\n") + " bareLF=" + /[^\r]\n/.test(t));
  // 除改动外是否逐字节不变
  const sameExceptInsert = (() => {
    if (del !== 0) return false;
    // 把新增行去掉后应与前版本完全一致
    const stripped = states[i].buf.toString("utf8").split("\r\n").filter((ln) => !ops.some((o) => o.t === "+" && o.s === ln));
    return stripped.join("\r\n") === states[i - 1].buf.toString("utf8");
  })();
  L("     其余字节不变(0 删 + 仅新增行)=" + sameExceptInsert);
}

L("");
L("══════════════════════════════════════════════════════════════");
L("硬判据(c) 终判");
L("  基准 sha = ce0b0b81…  当前 sha = " + sha(cur).slice(0, 16) + "…");
L("  复原? " + (sha(cur).startsWith("ce0b0b81") ? "YES ✓" : "NO ✗ — 未回到基准"));
L("  diff 仅删该行? " + (diffLines(baseline, cur).length === 0 ? "无差异" : "否 — 实为 " + diffLines(baseline, cur).length + " 处行级改动"));
for (const o of diffLines(baseline, cur)) L("    " + o.t + " " + JSON.stringify(o.s));
L("══════════════════════════════════════════════════════════════");
