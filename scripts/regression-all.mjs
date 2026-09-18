#!/usr/bin/env node
// 回归全跑器：按顺序执行各专项脚本，只回传每个脚本的「结果行」，输出紧凑。
// 用法：node scripts/regression-all.mjs
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
  ["q2-layer-scan", "scripts/q2-layer-scan.mjs"],
  ["q2-shipped-scan", "scripts/q2-shipped-scan.mjs"],
  ["master-merge-fidelity", "scripts/master-merge-fidelity.mjs"],
  ["backup-write-test", "scripts/backup-write-test.mjs"],
  ["pluggable-lint", "scripts/pluggable-lint.mjs"],
];

const RESULT_RE = /(RESULT:?\s*\d+\/\d+\s*PASS|\d+\/\d+\s*PASS|passed=\d+\s*failed=\d+|通过[:：][^\n]*)/;

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
  try { out = execFileSync(NODE, ["--test"], { cwd: ROOT, maxBuffer: 1 << 26, encoding: "utf8" }); }
  catch (e) { out = String(e.stdout || ""); code = e.status ?? 1; }
  const pass = (out.match(/# pass (\d+)/) || [])[1];
  const fail = (out.match(/# fail (\d+)/) || [])[1];
  const ok = code === 0 && fail === "0";
  if (!ok) bad++;
  console.log((ok ? "  ✓ " : "  ✗ ") + "node --test".padEnd(22) + "pass=" + pass + " fail=" + fail);
}

console.log("══════════════════════════════════════════════════════════");
console.log(bad === 0 ? "全部通过" : "存在 " + bad + " 项异常");
console.log("══════════════════════════════════════════════════════════");
process.exit(bad === 0 ? 0 : 1);
