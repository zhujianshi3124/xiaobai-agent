#!/usr/bin/env node
// 回归全跑器：按顺序执行各专项脚本，只回传每个脚本的「结果行」，输出紧凑。
// 用法：node scripts/regression-all.mjs                 全链（16 专项脚本 + node --test）
//       node scripts/regression-all.mjs --scripts-only  只跑 16 专项脚本，跳过 node --test
//
// ── 为什么有 --scripts-only（责任面划分，不是把红藏起来）─────────────────────
// 缺口：npm test 的最后一步就是 node --test，**node --test 这一面 npm test 已经覆盖**；
//       而 16 个专项脚本 npm test 一个都不跑 —— 这正是「红了两个批次无人知」的那个缺口。
// 所以 git pre-commit hook 只调 --scripts-only：它补的是 npm test 覆盖不到的那一面。
// 为什么不让 hook 跑全链：本机 node --test 有 4 项**环境性常驻红**（档案第五节在册，非回归）：
//   ① p22b 在场态钉（:61 doesNotMatch(/SKIP：.panel-backups/)，而本机 .panel-backups/ 不存在）
//   ② q2-layer-scan 在场态钉（同源同因）
//   ③ doc-ref-guard 在场态全绿（活文档/存档件引用缺文件）
//   ④ F2⑤ schemastery（<TEST_SANDBOX> 缺 @deepseek-ai/schemastery，环境红线，不许碰）
// 这 4 项清不掉，让 hook 跑全链 ⇒ hook 永久拦一切提交。那不是严格，那是逼人 --no-verify。
// 注意口径：**默认行为不变**。不加参数仍跑全链、仍含 node --test；开关只在显式传入时生效。
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

// 开关：只跑专项脚本段，跳过 node --test（由 pre-commit hook 使用，见头注）。
const scriptsOnly = process.argv.includes("--scripts-only");

console.log("══════════════════════════════════════════════════════════");
console.log("回归全跑  " + new Date().toISOString() + (scriptsOnly ? "  [--scripts-only]" : ""));
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
// --scripts-only 时整段跳过：这一面由 npm test 负责（package.json 的 test 脚本末步即 node --test）。
if (scriptsOnly) {
  console.log("  ⊘ " + "node --test".padEnd(22) + "（已跳过：--scripts-only；该面由 npm test 负责）");
} else {
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
// 结论行：默认（全链）保持原样一字不变；只有 --scripts-only 才追标范围，
// 因为那种模式下「全部通过」若不加限定，会被读成「全链通过」。
console.log(scriptsOnly
  ? (bad === 0 ? "全部通过" : "存在 " + bad + " 项异常") + "  ｜ 范围：仅专项脚本 16 项（node --test 未跑）"
  : (bad === 0 ? "全部通过" : "存在 " + bad + " 项异常"));
console.log("══════════════════════════════════════════════════════════");
process.exit(bad === 0 ? 0 : 1);
