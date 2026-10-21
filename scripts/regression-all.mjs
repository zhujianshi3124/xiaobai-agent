#!/usr/bin/env node
// 回归全跑器：按顺序执行各专项脚本，只回传每个脚本的「结果行」，输出紧凑。
// 用法：node scripts/regression-all.mjs
//
// ── 摘除两项死工装（2026-10-21，协调侧裁决，实测为据）──────────────────────────
// ① q2-shipped-scan：读本机 npm 全局安装的 shipped preset（scripts/q2-shipped-scan.mjs:16
//    ROOT=C:\Users\…\npm\node_modules\@deepseek-ai\dsh\…\dsh-agent-presets，实测该 presets
//    目录不存在 ⇒ :40 直接 ENOENT 崩）；且 :118 的 outPath 是硬编码仓外绝对路径
//    <TOOLKIT_ROOT>\…（实测该目录不存在）。属一次性取证工装，
//    不是每次改动都该跑的东西；外部克隆环境必然崩，留着只会制造永久红。
//    另：它具备写盘能力（:119 writeFileSync），一个会写文件的脚本不该进常跑回归器。
// ② master-merge-fidelity：:6 硬编码读 <TOOLKIT_ROOT>\panel\docs\HANDOFF-MASTER.md
//    （实测 Test-Path=False）⇒ 起跑即 ENOENT。属一次性合并保真抽检，被检对象已不存在。
// 两项脚本文件本身保留（历史取证可重放），只是不再进常跑清单。
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NODE = process.execPath;

const scripts = [
  ["p1-smoke", "scripts/p1-smoke.mjs"],
  ["p2-smoke", "scripts/p2-smoke.mjs"],
  ["p21-verify", "scripts/p21-verify.mjs"],
  ["p22-verify", "scripts/p22-verify.mjs"],
  ["p22-cards-ui", "scripts/p22-cards-ui.mjs"],
  ["p22b-retention-scope", "scripts/p22b-retention-scope.mjs"],
  // D-3 修法（C1-007 W9 第一段）：p23-verify 是回归面（源码断言），入本体防"忘带 --with-scan"漏跑。
  ["p23-verify", "scripts/p23-verify.mjs"],
  ["p24-verify", "scripts/p24-verify.mjs"],
  ["p24-ui-matrix", "scripts/p24-ui-matrix.mjs"],
  ["q2-layer-scan", "scripts/q2-layer-scan.mjs"],
  // 摘除（2026-10-21，协调侧裁决）：q2-shipped-scan 与 master-merge-fidelity 是死工装，见下方注释。
  ["backup-write-test", "scripts/backup-write-test.mjs"],
  // S2.5 合并批（C1-007 单包合一终裁）：doctor CLI 成员入桶（doctor/cli/）——四套件基线随桶内重立。
  ["doctor-cli run-tests", "doctor/cli/selftest/run-tests.mjs"],
  ["doctor-cli stage3", "doctor/cli/selftest/acceptance-stage3.mjs"],
  ["doctor-cli stage4a", "doctor/cli/selftest/run-tests-stage4a.mjs"],
  ["doctor-cli stage4b", "doctor/cli/selftest/run-tests-stage4b.mjs"],
  ["pluggable-lint", "scripts/pluggable-lint.mjs"],
];

const RESULT_RE = /(RESULT:?\s*\d+\/\d+\s*PASS|\d+\/\d+\s*PASS|\d+\/\d+\s+\S[^\n]*?tests?\s+passed|ALL STAGE-3 ACCEPTANCE PASS|passed=\d+\s*failed=\d+|通过[:：][^\n]*)/;

console.log("══════════════════════════════════════════════════════════");
console.log("回归全跑  " + new Date().toISOString());
console.log("══════════════════════════════════════════════════════════");

let bad = 0;
for (const [name, rel] of scripts) {
  let out = "", code = 0;
  try {
    out = execFileSync(NODE, [rel], { cwd: ROOT, maxBuffer: 1 << 26, encoding: "utf8" });
  } catch (e) {
    out = String(e.stdout || "") + String(e.stderr || "");
    code = e.status ?? 1;
  }
  const m = out.match(RESULT_RE);
  const fails = (out.match(/^FAIL /gm) || []).length;
  const ok = code === 0 && fails === 0;
  if (!ok) bad++;
  console.log((ok ? "  ✓ " : "  ✗ ") + name.padEnd(22) + (m ? m[0].replace(/\s+/g, " ").trim() : "(无结果行)") + (fails ? "  FAILs=" + fails : "") + (code ? "  exit=" + code : ""));
}

// node --test
{
  let out = "", code = 0;
  // S2.5 起收集面方案：node --test 无参递归——doctor 成员测试目录定名 selftest（避开 **/test/**
  // 收集规则），四套件由本清单显式承担（上面四项），nt 收集面保持仓根 test/ 的既有 474 格。
  try { out = execFileSync(NODE, ["--test"], { cwd: ROOT, maxBuffer: 1 << 26, encoding: "utf8" }); }
  catch (e) { out = String(e.stdout || ""); code = e.status ?? 1; }
  const pass = (out.match(/[#ℹ]\s*pass\s+(\d+)/) || [])[1];
  const fail = (out.match(/[#ℹ]\s*fail\s+(\d+)/) || [])[1];
  const ok = code === 0 && fail === "0";
  if (!ok) bad++;
  console.log((ok ? "  ✓ " : "  ✗ ") + "node --test".padEnd(22) + "pass=" + pass + " fail=" + fail);
  // C1-007 S2 批裁定（2026-10-01）：失败时回传明细末 25 条相关行——此前摘要器只回传计数，
  // flake"再振即查"时无从查起（S1 验收窗 §45.5 候裁项，候裁准后落码）。
  if (!ok) {
    const tail = out.split(/\r?\n/)
      .filter(l => /✖|not ok|failing tests|AssertionError|Error\b|test at/i.test(l))
      .slice(-25);
    console.log("    ── node --test 失败明细（末 " + tail.length + " 条相关行）──");
    for (const l of tail) console.log("    " + l.slice(0, 220));
  }
}

console.log("══════════════════════════════════════════════════════════");
console.log(bad === 0 ? "全部通过" : "存在 " + bad + " 项异常");
console.log("══════════════════════════════════════════════════════════");
process.exit(bad === 0 ? 0 : 1);
