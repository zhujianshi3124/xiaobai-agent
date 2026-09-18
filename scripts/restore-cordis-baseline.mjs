#!/usr/bin/env node
// 恢复 cordis.patch.yml 至判据基准 ce0b0b81（第 11 轮判定授权）。
//
// 基准 = git HEAD blob（LF）+ toolkit-manager 4 行插入块，整份转 CRLF。
// 本脚本 fail-closed：
//   ① 先重建基准并断言 sha256 == EXPECTED_SHA；不符则**不写**、直接退出 1。
//   ② 写前把当前文件备份到 .panel-backups/restore-baseline-<stamp>/（含 manifest）。
//   ③ 写入后复验 sha/字节数/CRLF。
// 用法：node scripts/restore-cordis-baseline.mjs [--apply]   （缺省 dry-run）
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = join(ROOT, "cordis.patch.yml");
const EXPECTED_SHA = "ce0b0b81c91ca4c420bb5302b2dbe951de0347ca729122511be288aa7c2b76b9";
const EXPECTED_SIZE = 3097;
const APPLY = process.argv.includes("--apply");
const sha = (b) => createHash("sha256").update(b).digest("hex");

const headBlob = execFileSync("git", ["show", "HEAD:cordis.patch.yml"], { cwd: ROOT, maxBuffer: 1 << 24 }).toString("utf8");
const APPEND_LF = "\n- insert:\n    - id: toolkit-manager\n      name: 'file:///D:/dsh-plugins/dsh-toolkit/panel/index.js'\n";
const baseline = Buffer.from((headBlob.replace(/\r\n/g, "\n") + APPEND_LF).replace(/\n/g, "\r\n"), "utf8");

console.log("══════════════════════════════════════════════════════════════");
console.log("恢复 cordis.patch.yml → 基准   " + (APPLY ? "【APPLY】" : "【DRY-RUN】"));
console.log("══════════════════════════════════════════════════════════════");
console.log("  重建基准 size = " + baseline.length + "  sha256 = " + sha(baseline));
console.log("  期望值   size = " + EXPECTED_SIZE + "  sha256 = " + EXPECTED_SHA);

if (sha(baseline) !== EXPECTED_SHA || baseline.length !== EXPECTED_SIZE) {
  console.error("  ✗ 重建基准与期望不符 —— fail-closed，不写盘");
  process.exit(1);
}
console.log("  ✓ 重建基准与期望逐字节相符");

const cur = readFileSync(TARGET);
console.log("  当前文件 size = " + cur.length + "  sha256 = " + sha(cur));
if (sha(cur) === EXPECTED_SHA) {
  console.log("  当前文件已是基准，无需恢复。");
  process.exit(0);
}

if (!APPLY) { console.log("  （dry-run：将备份当前文件后写入基准）"); process.exit(0); }

// ① 写前备份（人工留档，与引擎运行时根不同源）
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const bkDir = join(ROOT, ".panel-backups", "restore-baseline-" + stamp);
mkdirSync(bkDir, { recursive: true });
writeFileSync(join(bkDir, "cordis.patch.yml"), cur);
writeFileSync(join(bkDir, "manifest.json"), JSON.stringify({
  stamp,
  createdAt: new Date().toISOString(),
  reason: "restore-to-baseline",
  note: "第 11 轮授权恢复：把面板往返留下的显式 disabled:false 行清掉，回到判据基准 ce0b0b81",
  files: [{ abs: TARGET, savedAs: "cordis.patch.yml", sha256: sha(cur), size: cur.length }],
}, null, 2), "utf8");
console.log("  ✓ 写前备份 → " + bkDir + "（sha=" + sha(cur).slice(0, 16) + "）");

// ② 写入
writeFileSync(TARGET, baseline);
const back = readFileSync(TARGET);
console.log("  ✓ 已写入   size = " + back.length + "  sha256 = " + sha(back));
const okSha = sha(back) === EXPECTED_SHA;
const okSize = back.length === EXPECTED_SIZE;
const okCrlf = back.toString("utf8").includes("\r\n") && !/[^\r]\n/.test(back.toString("utf8"));
console.log("  复验：sha=" + okSha + "  size=" + okSize + "  CRLF=" + okCrlf);
console.log("══════════════════════════════════════════════════════════════");
process.exit(okSha && okSize && okCrlf ? 0 : 1);
