#!/usr/bin/env node
// D-01 专项：备份「真实写」测试（沙箱副本，绝不触碰真实 cordis.patch.yml）
//
// 目的：验证修复后的 savedAs 规则在 **Windows 绝对路径（含盘符冒号）** 下把备份
// 落成正常文件，并用**反证**证明新断言对旧缺陷有牙（旧规则会产生 0 字节可见项）。
//
// 覆盖：
//   1. D: 盘绝对路径（正是短板场景）→ 副本正常、非 0、无 ':'、sha 相符
//   2. C: 盘绝对路径（os.tmpdir）→ 同上
//   3. manifest.reason / note 真值传递（createPlan / createTogglePlan → executePlan）
//   4. 反证：用**旧规则**手工制造一次副本 → 可见项 0 字节 ⇒ 新断言（非 0 / 无冒号）必然报警
import {
  mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync,
  mkdirSync, rmSync, unlinkSync, copyFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const bk = await import(new URL("../panel/manager/backup.mjs", import.meta.url).href);
const eng = await import(new URL("../panel/manager/apply-engine.mjs", import.meta.url).href);

let passed = 0, failed = 0;
function check(label, ok, detail) {
  if (ok) { passed++; console.log("PASS " + label + (detail ? " — " + detail : "")); }
  else { failed++; console.log("FAIL " + label + (detail ? " — " + detail : "")); }
}
const sha = (b) => createHash("sha256").update(b).digest("hex");

/** 独立取证：只看目录实体，不信任 manifest.savedAs。 */
function inspectPayload(dir) {
  const entries = readdirSync(dir).filter((n) => n !== "manifest.json");
  const withSize = entries.map((n) => ({ name: n, size: statSync(join(dir, n)).size }));
  const zero = withSize.filter((e) => e.size === 0);
  const colon = withSize.filter((e) => e.name.includes(":"));
  return { entries: withSize, zero, colon };
}

console.log("══════════════════════════════════════════════════════════════");
console.log("D-01 备份真实写测试（沙箱）  " + new Date().toISOString());
console.log("══════════════════════════════════════════════════════════════");

// ---------- 1. D: 盘绝对路径（短板场景） ----------
const dSandbox = join(ROOT, ".d01-sandbox");
mkdirSync(dSandbox, { recursive: true });
const dTarget = join(dSandbox, "nested", "sample.yml");
mkdirSync(dirname(dTarget), { recursive: true });
const dText = "- id: rate-throttle\r\n      name: x\r\n";
writeFileSync(dTarget, dText, "utf8");
const dBkRoot = join(dSandbox, "backups");

// 前置确认：这确实是「盘符 + 冒号」绝对路径
check("前置：D: 绝对路径含盘符冒号", /^[A-Za-z]:\\/.test(dTarget), dTarget);

const dDir = bk.createBackup({ backupRoot: dBkRoot, files: [dTarget], reason: "test-d01", note: "D: drive abs path" });
console.log("  backupDir = " + dDir);
const dIns = inspectPayload(dDir);
const dManifest = JSON.parse(readFileSync(join(dDir, "manifest.json"), "utf8"));
check("D: 目录恰 1 个副本文件", dIns.entries.length === 1, JSON.stringify(dIns.entries));
check("D: 无 0 字节副本（旧 ADS 缺陷指纹）", dIns.zero.length === 0, JSON.stringify(dIns.zero));
check("D: 副本名不含 ':'（否则是 NTFS ADS）", dIns.colon.length === 0, JSON.stringify(dIns.colon.map((e) => e.name)));
check("D: 副本非 0 字节", dIns.entries.length === 1 && dIns.entries[0].size > 0, JSON.stringify(dIns.entries));
const dCopy = readFileSync(join(dDir, dIns.entries[0].name));
check("D: 副本 sha == 源 sha", sha(dCopy) === sha(Buffer.from(dText, "utf8")), sha(dCopy).slice(0, 16));
check("D: 副本逐字节等于源", dCopy.toString("utf8") === dText);
check("D: manifest.reason 真值", dManifest.reason === "test-d01", JSON.stringify(dManifest.reason));
check("D: manifest.note 真值", dManifest.note === "D: drive abs path", JSON.stringify(dManifest.note));
check("D: manifest.savedAs == 实际副本名", dManifest.files[0].savedAs === dIns.entries[0].name, dManifest.files[0].savedAs);

// ---------- 2. C: 盘（os.tmpdir） ----------
const cSandbox = mkdtempSync(join(tmpdir(), "d01-cdrive-"));
const cTarget = join(cSandbox, "sample.yml");
writeFileSync(cTarget, dText, "utf8");
const cDir = bk.createBackup({ backupRoot: join(cSandbox, "bk"), files: [cTarget], reason: "test-d01-c", note: "C: drive abs path" });
const cIns = inspectPayload(cDir);
check("C: 目录恰 1 个副本文件", cIns.entries.length === 1, JSON.stringify(cIns.entries));
check("C: 无 0 字节副本", cIns.zero.length === 0, JSON.stringify(cIns.zero));
check("C: 副本名不含 ':'", cIns.colon.length === 0, JSON.stringify(cIns.colon.map((e) => e.name)));
check("C: 副本 sha == 源 sha", sha(readFileSync(join(cDir, cIns.entries[0].name))) === sha(Buffer.from(dText, "utf8")));

// ---------- 3. reason/note 经 executePlan 链路落到 manifest ----------
{
  const plan = eng.createTogglePlan({ file: dTarget, rowId: "rate-throttle", enabled: false, backupRoot: dBkRoot });
  check("toggle plan 自带 reason（非 null）", typeof plan.reason === "string" && plan.reason.length > 0, JSON.stringify(plan.reason));
  check("toggle plan 自带 note（非 null）", typeof plan.note === "string" && plan.note.length > 0, JSON.stringify(plan.note));
  eng.putPlan(plan);
  const res = eng.executePlan(plan.token);
  const m2 = JSON.parse(readFileSync(join(res.backupDir, "manifest.json"), "utf8"));
  check("executePlan 把 plan.reason 写进 manifest", m2.reason === plan.reason, JSON.stringify(m2.reason));
  check("executePlan 把 plan.note 写进 manifest", m2.note === plan.note, JSON.stringify(m2.note));
  check("toggle 后 manifest.reason 不再是 null", m2.reason !== null);
  const ins2 = inspectPayload(res.backupDir);
  check("toggle 备份：无 0 字节副本", ins2.zero.length === 0, JSON.stringify(ins2.zero));
}

// ---------- 4. 反证：旧规则必然产生 0 字节可见项 ----------
{
  const negDir = join(dSandbox, "negative-control");
  const preDir = join(negDir, "pre");
  writeFileSync(join(dSandbox, "neg-src.yml"), "hello\r\n", "utf8");
  mkdirSync(preDir, { recursive: true });
  // 旧规则：只替换 \ 与 /（不处理冒号）
  const src = join(dSandbox, "neg-src.yml");
  const oldName = src.replace(/[\\/]/g, "__").replace(/^__/, "");
  let created = null;
  try {
    copyFileSync(src, join(preDir, oldName));
    created = readdirSync(preDir);
  } catch (e) {
    created = ["(copyFileSync threw: " + e.code + ")"];
  }
  console.log("  旧规则 savedAs = " + oldName);
  console.log("  旧规则下目录可见项 = " + JSON.stringify(created));
  const negIns = inspectPayload(preDir);
  const negZero = negIns.zero.length;
  check("反证：旧规则名字含 ':'", oldName.includes(":"));
  check("反证：旧规则的可见项是 0 字节（或复制失败）", negZero > 0 || String(created[0]).startsWith("("),
    JSON.stringify(negIns.entries));
  check("反证：新断言会拦住它（0 字节 / 含冒号）", negZero > 0 || negIns.colon.length > 0 || String(created[0]).startsWith("("));
  // 清理 ADS 载体
  for (const n of readdirSync(preDir)) { try { unlinkSync(join(preDir, n)); } catch { /* ignore */ } }
}

// ---------- 清理 ----------
try { rmSync(dSandbox, { recursive: true, force: true }); } catch { /* ignore */ }
try { rmSync(cSandbox, { recursive: true, force: true }); } catch { /* ignore */ }

console.log("");
console.log(passed + "/" + (passed + failed) + " PASS");
console.log("══════════════════════════════════════════════════════════════");
process.exit(failed === 0 ? 0 : 1);
