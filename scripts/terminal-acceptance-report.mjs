// 【历史冻结 · 2026-09-21 Pack I，债务 D-17】P2.2 第 10 轮终验的**时点取证脚本**，不是回归项。
// ⚠ **禁止重跑**：本脚本末尾（原 :154-156 的 mkdirSync + writeFileSync）会把报告写回
//   panel/docs/evidence/TERMINAL-ACCEPTANCE-ROUND10.txt —— 那是**已入库、已在 evidence/README
//   登记 sha(49ef62a0…) 与字节(6689) 的历史证据正本**，重跑即覆写（时刻行与 `~/.dsh` 指纹都会变）。
//   这与 D-2（p23-shadow-scan 覆写历史证据）同族，是**第二处**；不改写它的输出路径，因为本脚本
//   整体已被冻结、修它没有收益。需要那份证据请直接读库内文件。
// 冻结原因（两条）：① 它要证的判据是当时的（"复原到 ce0b0b81…"），该基准已随 H5 与本轮滚存退役，
//   把它改成能跑就是伪造那份历史结论；② 它的"基准可重建性"公式（HEAD blob + 追加 toolkit-manager
//   4 行）自 P2.4 把那 4 行提交进 HEAD 起就不再自洽。
// 不在 regression-all / ci-local 清单内；历史产物读 panel/docs/evidence/TERMINAL-ACCEPTANCE-ROUND10.txt。
// 原实现见提交 41ad40c。
// ── 以下为当时的原始内容（只读取证 + 落报告文本，不改动任何被取证文件）──
// 终验取证报告生成器（只读取证 + 落报告文本，不改动任何被取证文件）
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

// ↓ 冻结硬闸（2026-09-21 Pack I / D-17）：只拦"再跑一次"，不改下面任何取证逻辑与历史结论文本。
// 下面的 writeFileSync 会把结果写进已入库并登记 sha 的证据正本，重跑即覆写；光靠头注拦不住手滑，
// 所以这里直接退出。真要复核第 10 轮判据：读 panel/docs/evidence/TERMINAL-ACCEPTANCE-ROUND10.txt 正本。
console.log(
  [
    'terminal-acceptance-report.mjs 已冻结（2026-09-21 Pack I / 债务 D-17），未执行。',
    '原因：它会覆写已入库、已登记 sha 的历史证据正本 panel/docs/evidence/TERMINAL-ACCEPTANCE-ROUND10.txt；',
    '      且它依赖的判据基准 ce0b0b81… 与「HEAD blob + 追加 toolkit-manager 4 行」的重建公式均已退役。',
    '要复核第 10 轮判据：直接读该证据文件正本（evidence/README 主表有它的字节数与 sha256）。',
  ].join('\n'),
);
process.exit(2)

const ROOT = "D:\\dsh-plugins\\dsh-toolkit";
const TARGET = join(ROOT, "cordis.patch.yml");
const sha = (b) => createHash("sha256").update(b).digest("hex");
const out = [];
const L = (t = "") => out.push(t);

const headBlob = execFileSync("git", ["show", "HEAD:cordis.patch.yml"], { cwd: ROOT, maxBuffer: 1 << 24 }).toString("utf8");
const APPEND_LF = "\n- insert:\n    - id: toolkit-manager\n      name: 'file:///D:/dsh-plugins/dsh-toolkit/panel/index.js'\n";
const baseline = Buffer.from((headBlob.replace(/\r\n/g, "\n") + APPEND_LF).replace(/\n/g, "\r\n"), "utf8");
const cur = readFileSync(TARGET);
const curText = cur.toString("utf8");

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
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: "-", s: A[i++] }); }
    else { ops.push({ t: "+", s: B[j++] }); }
  }
  while (i < n) ops.push({ t: "-", s: A[i++] });
  while (j < m) ops.push({ t: "+", s: B[j++] });
  return ops;
}

L("════════════════════════════════════════════════════════════════════════════");
L("P2.2 真实终验取证报告（第 10 轮）  生成时刻(本地) " + new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }));
L("只读取证：本报告不修改任何被取证文件。工具：scripts/terminal-acceptance-*.mjs");
L("════════════════════════════════════════════════════════════════════════════");
L("");
L("【身份】");
L("  当前 cordis.patch.yml : sha256=" + sha(cur) + "  size=" + cur.length + "  CRLF=true  bareLF=" + /[^\r]\n/.test(curText));
L("  判据基准 ce0b0b81…    : 重建=" + sha(baseline) + "  size=" + baseline.length);
L("  基准可重建性           : " + (sha(baseline).startsWith("ce0b0b81") ? "✓ HEAD blob + toolkit-manager 4 行，逐字节命中判据基准" : "✗"));
L("");

// ---------- a ----------
L("【a】两段写入记录 + manifest  +  唯一通道");
L("  写前备份 4 份，链式 shaBefore 精确对接（每一份的 shaBefore == 上一份写后的 sha）");
const bkRoot = join(ROOT, ".panel-write-backups");
const stamps = readdirSync(bkRoot).sort();
const payloads = [];
for (const s of stamps) {
  const dir = join(bkRoot, s);
  const m = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
  const f0 = m.files[0];
  const buf = readFileSync(join(dir, f0.savedAs));
  payloads.push(buf);
  const ent = readdirSync(dir).filter((n) => n !== "manifest.json");
  L("    ── " + s);
  L("       createdAt=" + m.createdAt + "   reason=" + JSON.stringify(m.reason) + "   note=" + JSON.stringify(m.note));
  L("       shaBefore=" + f0.sha256.slice(0, 16) + "   备份副本字节=" + buf.length + " (读回成功)");
  L("       目录可见副本项=" + JSON.stringify(ent.map((e) => ({ name: e, visibleBytes: statSync(join(dir, e)).size }))));
}
L("");
L("  ▸ 唯一落盘通道（源码）：全仓写 plan.file 的位置仅 1 处");
L("       panel/manager/apply-engine.mjs:462  writeFileSync(plan.file, plan.nextText, \"utf8\")  ← executePlan 内");
L("       路由 /api/toolkit-panel/toggle/plan → createTogglePlan(:327) → executePlan(:375)");
L("  ▸ 判定：通道唯一 ✓ ；**manifest 的 reason / note 恒为 null**（toggle 路径未传参，createTogglePlan 无 reason/note 形参）⇒ (a) 部分不达标 ✗");
L("");

// ---------- b ----------
L("【b】停用段 diff（逐段重建，来自备份链 payload）");
// payloads[0] == 基准，故真正的 4 次写 = [ ...payloads, cur ] 的相邻对
const states = [...payloads, cur];
const segNames = ["写#1", "写#2", "写#3", "写#4"];
// 判定某状态里哪张卡带 disabled 键
function disabledOwner(buf) {
  const ls = buf.toString("utf8").split("\r\n");
  let owner = null, who = [];
  for (const ln of ls) {
    const mm = /^(\s*)- id:\s*(\S+)/.exec(ln);
    if (mm) owner = mm[2];
    if (/^\s+disabled:/.test(ln)) who.push(owner + "→" + ln.trim());
  }
  return who;
}
for (let i = 1; i < states.length; i++) {
  const ops = diffLines(states[i - 1], states[i]).filter((o) => o.t !== "=");
  const t = states[i].toString("utf8");
  L("    ◆ " + segNames[i - 1] + "  " + states[i - 1].length + "B(" + sha(states[i - 1]).slice(0, 12) + ") → " + states[i].length + "B(" + sha(states[i]).slice(0, 12) + ")");
  for (const o of ops) L("        " + o.t + " " + JSON.stringify(o.s));
  L("        CRLF=" + t.includes("\r\n") + " bareLF=" + /[^\r]\n/.test(t) + "   写后带 disabled 的卡=" + JSON.stringify(disabledOwner(states[i])));
}
L("");
L("  ▸ 停用段命中卡（由写后 disabled 归属反推）：写#1 = agent-memory-runtime，写#3 = rate-throttle");
L("  ▸ 判据(b) 所指的 rate-throttle 停用段 = 写#3：diff 恰 1 处（+ `      disabled: true`），");
L("     落在 rate-throttle 锚点(第14行)正下方第15行，与 name(第16行)/config(第17行) 同级；CRLF 保持；0 删除 ⇒ 其余字节不变 ✓");
L("  ▸ ⚠ 但本会话实际发生 **2 个停用段**（写#1=agent-memory-runtime 与 写#3=rate-throttle），非 1 个；");
L("     两个复原段（写#2/写#4）均写 `disabled: false` 且**不删键**。");
L("");

// ---------- c ----------
L("【c】硬判据：复原后是否字节级回到基准");
const dc = diffLines(baseline, cur).filter((o) => o.t !== "=");
L("    基准 sha = ce0b0b81…（" + baseline.length + " B）");
L("    当前 sha = " + sha(cur).slice(0, 16) + "…（" + cur.length + " B）");
L("    相符? " + (sha(cur).startsWith("ce0b0b81") ? "YES ✓" : "NO ✗"));
L("    基准→当前 diff 处数 = " + dc.length);
for (const o of dc) L("        " + o.t + " " + JSON.stringify(o.s));
L("  ▸ 判定：**不成立 ✗** —— sha 未复原（c03e2c81 ≠ ce0b0b81），size 3143 ≠ 3097，");
L("     diff 非「仅删该行」而是 0 删 / 2 增（两处 `disabled: false` 残留）。");
L("  ▸ 结构性根因（源码级）：apply-engine.mjs planRowFlag —— 键存在则**原地替换**，不存在则**插入**，");
L("     **从不删除键**；且 createTogglePlan 的 JSDoc 明写「enabled=true → 写 disabled: false（显式声明为启用；不删键）」。");
L("     ⇒ 「复原」在设计上就是**写 false**，不是删除键 ⇒ **字节级复原在现有引擎下不可达**（判据与设计不相容）。");
L("");

// ---------- d ----------
L("【d】快照对比：哪些卡变化");
L("    基准无 disabled 键的行；当前新增 disabled 行的归属：");
{
  const L2 = curText.split("\r\n");
  let owner = "(顶层)";
  for (let k = 0; k < L2.length; k++) {
    const mm = /^(\s*)- id:\s*(\S+)/.exec(L2[k]);
    if (mm) owner = mm[2];
    if (/^\s+disabled:/.test(L2[k])) L("      L" + (k + 1) + "  [" + owner + "]  " + JSON.stringify(L2[k]));
  }
}
L("    基准→当前「新增行」归属 = rate-throttle + agent-memory-runtime（2 张卡）");
L("  ▸ 判定：**与「仅 rate-throttle 变化」不符 ✗**（实际 2 张卡变化；恒定卡 = 3 张，非 4 张）。");
L("     注：两处残留均为 `disabled: false`（= 启用），**运行语义与基准等价**，仅字节不同。");
L("");

// ---------- e ----------
L("【e】doctor dry-run");
try {
  const r = await import("file:///D:/dsh-plugins/dsh-toolkit/panel/manager/doctor-runner.mjs").then((m) =>
    m.runDoctorDryRun({ cliPath: "D:/dsh-test-sandbox/projects/doctor/src/cli.mjs", scopeRoot: ROOT }));
  L("    ok=" + r.ok + "  exit=" + r.exitCode + "  summary=" + JSON.stringify(r.report && r.report.summary));
  const s = r.report && r.report.summary;
  L("  ▸ 判定：" + (s && s.error === 0 && s.warning === 0 && s.info === 0 ? "0/0/0 ✓" : "非 0/0/0 ✗"));
} catch (err) {
  L("  ▸ 运行失败：" + err.message);
}
L("");
L("════════════════════════════════════════════════════════════════════════════");
L("【总判】a 部分不达标（reason/note=null）｜b ✓（停用段单点插入，但实际有 2 个停用段）｜c ✗｜d ✗｜e ✓");
L("  ⇒ 存在不绿项 ⇒ 按第 10 轮指令：**停下回报、不进关账**。");
L("════════════════════════════════════════════════════════════════════════════");

const evDir = join(ROOT, "panel", "docs", "evidence");
mkdirSync(evDir, { recursive: true });
const txt = out.join("\n") + "\n";
writeFileSync(join(evDir, "TERMINAL-ACCEPTANCE-ROUND10.txt"), txt, "utf8");
console.log(txt);
console.log("证据已写入: panel/docs/evidence/TERMINAL-ACCEPTANCE-ROUND10.txt");
