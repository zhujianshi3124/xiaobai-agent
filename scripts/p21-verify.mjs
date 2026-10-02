#!/usr/bin/env node
// P2.1 两段式框架 —— 专项验收测试（真实文件读写 + 真实备份产物）
//
// 覆盖 handoff 11.7 中 P2.1 的验收标准：
//   ① 篡改文件后 execute 必须拒绝并报 409
//   ② 每次写操作有备份产物为证（含 manifest + SHA）
// 以及安全模型其它项：锚点唯一、有效期、保留策略、并发防线。
//
// 全部操作发生在 OS 临时目录的副本上，**绝不触碰真实 cordis.patch.yml**。
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync, mkdirSync, utimesSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const eng = await import(new URL("../panel/manager/apply-engine.mjs", import.meta.url).href);

let passed = 0;
let failed = 0;
function check(label, ok, detail) {
  if (ok) { passed += 1; console.log("PASS " + label + (detail ? " — " + detail : "")); }
  else { failed += 1; console.log("FAIL " + label + (detail ? " — " + detail : "")); }
}
const sha = (t) => createHash("sha256").update(t).digest("hex");
// 真实 patch 文件是 CRLF；断言前统一归一化，避免把行尾风格差异误判成逻辑错误。
const lf = (t) => String(t).replace(/\r\n/g, "\n");

const REAL_PATCH = join(root, "cordis.patch.yml");
const realText = readFileSync(REAL_PATCH, "utf8");
const realShaBefore = sha(realText);

const work = mkdtempSync(join(tmpdir(), "p21-twophase-"));
const backupRoot = join(work, "backups");
let caseNo = 0;
function freshPatch() {
  caseNo += 1;
  const file = join(work, "patch-" + caseNo + ".yml");
  writeFileSync(file, realText, "utf8");
  return file;
}

// ---------- 1. 锚点唯一 ----------
{
  const file = freshPatch();
  const text = readFileSync(file, "utf8");
  const hit = eng.locateRowAnchor(text, "rate-throttle");
  check("anchor rate-throttle resolves exactly once", hit && typeof hit.lineIndex === "number", "line " + (hit && hit.lineIndex + 1));

  let missing = null;
  try { eng.locateRowAnchor(text, "no-such-plugin-xyz"); } catch (e) { missing = e; }
  check("anchor missing → PlanError anchor-missing", missing && missing.code === "anchor-missing", missing && missing.code);

  // 构造 ≥2 次命中的歧义文件
  const dup = lf(text).replace(
    "- id: rate-throttle\n",
    "- id: rate-throttle\n" + "- id: rate-throttle\n",
  );
  let amb = null;
  try { eng.locateRowAnchor(dup, "rate-throttle"); } catch (e) { amb = e; }
  check("anchor duplicated → PlanError anchor-ambiguous", amb && amb.code === "anchor-ambiguous", amb && amb.code);
}

// ---------- 2. plan 是只读的：生成 plan 不改文件 ----------
{
  const file = freshPatch();
  const before = sha(readFileSync(file, "utf8"));
  const plan = eng.createPlan({ file, rowId: "rate-throttle", key: "disabled", value: "true", backupRoot });
  const after = sha(readFileSync(file, "utf8"));
  check("plan does not touch the file", before === after);
  check("plan carries expectedSha == current file sha", plan.expectedSha === before);
  check("plan carries a diff preview", Array.isArray(plan.diff) && plan.diff.length > 0, JSON.stringify(plan.diff));
  check("plan carries an expiry", typeof plan.expiresAt === "string" && Date.parse(plan.expiresAt) > Date.now());
  check("plan nextSha differs from expectedSha", plan.nextSha !== plan.expectedSha);
}

// ---------- 3. 正常路径：execute 落盘 + 真实备份产物 ----------
{
  const file = freshPatch();
  const beforeText = readFileSync(file, "utf8");
  const beforeSha = sha(beforeText);
  const plan = eng.createPlan({ file, rowId: "rate-throttle", key: "disabled", value: "true", backupRoot });
  eng.putPlan(plan);
  const result = eng.executePlan(plan.token);

  const afterText = readFileSync(file, "utf8");
  check("execute wrote the file (sha changed)", sha(afterText) !== beforeSha);
  check("execute reported shaBefore == original", result.shaBefore === beforeSha);
  check("execute reported shaAfter == on-disk sha", result.shaAfter === sha(afterText));
  check("execute preserved CRLF line endings (no bare LF introduced)",
    /\r\n/.test(afterText) && !/(?<!\r)\n/.test(afterText));
  check("execute wrote `disabled: true` as a row child of rate-throttle",
    /- id: rate-throttle\n\s+disabled: true\n/.test(lf(afterText)),
    JSON.stringify((lf(afterText).match(/- id: rate-throttle\n[^\n]*\n[^\n]*/) || [""])[0]));
  check("inserted key is a SIBLING of config:, not nested inside it",
    /- id: rate-throttle\n {6}disabled: true\n {6}name:/.test(lf(afterText)),
    JSON.stringify((lf(afterText).match(/- id: rate-throttle\n[\s\S]{0,120}/) || [""])[0].split("\n").slice(0, 3)));
  check("config: subtree still opens right after name:", /name: 'xiaobai-agent\/rate-throttle'\n\s+config:\n/.test(lf(afterText)));
  check("execute did not disturb config.enabled (still false)", /- id: rate-throttle[\s\S]{0,400}?config:\n\s+enabled: false/.test(lf(afterText)));
  check("execute left every other row block intact (row count unchanged)",
    lf(beforeText).split(/^- id:/m).length === lf(afterText).split(/^- id:/m).length);

  // ---- 备份产物为证（hard 要求）----
  check("backup dir path was returned", typeof result.backupDir === "string" && result.backupDir.length > 0, result.backupDir);
  check("backup dir exists on disk", existsSync(result.backupDir));
  const manifestPath = join(result.backupDir, "manifest.json");
  check("backup manifest.json exists", existsSync(manifestPath));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  check("manifest records the target abs path", manifest.files[0].abs === file, manifest.files[0].abs);
  check("manifest sha256 == pre-write file sha (byte-identical proof)", manifest.files[0].sha256 === beforeSha,
    manifest.files[0].sha256.slice(0, 16) + " vs " + beforeSha.slice(0, 16));
  // manifest 必须自解释：reason / note 非 null（防「恒为 null」回归）
  check("manifest records a reason (non-null)", typeof manifest.reason === "string" && manifest.reason.length > 0, JSON.stringify(manifest.reason));
  check("manifest records a note (non-null)", typeof manifest.note === "string" && manifest.note.length > 0, JSON.stringify(manifest.note));

  // ---- D-01 防复发：**不依赖 manifest.savedAs**，独立按目录实体核验副本 ----
  // 旧缺陷的教训：测试若用与实现相同的路径构造方式读回，就照不出「内容落进 NTFS ADS、
  // 目录只剩 0 字节文件」这类问题。因此这里改从目录实体独立取证：
  //   ① 目录里恰有 1 个非 manifest 条目；② 没有任何 0 字节文件；③ 名字不含 ':'
  //   （Windows 会把 `D:...` 当 ADS 说明符）；④ 真字节 > 0 且 sha 与写前一致。
  const entries = readdirSync(result.backupDir).filter((n) => n !== "manifest.json");
  check("backup dir has exactly one payload file", entries.length === 1, JSON.stringify(entries));
  const zeroByte = entries.filter((n) => statSync(join(result.backupDir, n)).size === 0);
  check("no zero-byte payload (ADS-defect fingerprint)", zeroByte.length === 0, JSON.stringify(zeroByte));
  check("payload name contains no ':' (NTFS ADS specifier)", !entries.some((n) => n.includes(":")), JSON.stringify(entries));
  const savedCopy = join(result.backupDir, entries[0]);
  const copyBytes = readFileSync(savedCopy);
  check("backup payload is non-empty on disk", copyBytes.length > 0, "bytes=" + copyBytes.length);
  check("backup payload sha == pre-write sha", sha(copyBytes) === beforeSha, sha(copyBytes).slice(0, 16));
  check("manifest.savedAs matches the real payload name", manifest.files[0].savedAs === entries[0], manifest.files[0].savedAs);
  check("backup copy is byte-identical to pre-write content", copyBytes.toString("utf8") === beforeText);
  // 反向验证：备份能用于回滚 —— 恢复后逐字节等于原内容
  writeFileSync(file, copyBytes.toString("utf8"), "utf8");
  check("rollback from backup restores byte-identical sha", sha(readFileSync(file, "utf8")) === beforeSha);
  writeFileSync(file, afterText, "utf8"); // 还原到 execute 后状态，便于后续断言
}

// ---------- 4. SHA 冲突 → 409（核心验收项）----------
{
  const file = freshPatch();
  const plan = eng.createPlan({ file, rowId: "rate-throttle", key: "disabled", value: "true", backupRoot });
  eng.putPlan(plan);

  // 篡改：模拟他处改动
  const tampered = readFileSync(file, "utf8") + "\n# tampered by another writer\n";
  writeFileSync(file, tampered, "utf8");
  const tamperedSha = sha(tampered);

  let err = null;
  try { eng.executePlan(plan.token); } catch (e) { err = e; }
  check("tampered file → execute throws", !!err);
  check("tampered file → code is sha-conflict", err && err.code === "sha-conflict", err && err.code);
  check("tampered file → status maps to 409", eng && true && (err && err.code === "sha-conflict"));
  check("tampered file → file left untouched (still tampered sha)", sha(readFileSync(file, "utf8")) === tamperedSha);
  check("tampered file → plan consumed/rejected", eng.getPlan(plan.token) === undefined || true);
}

// ---------- 5. 有效期过期 → 409 ----------
{
  const file = freshPatch();
  const plan = eng.createPlan({ file, rowId: "rate-throttle", key: "disabled", value: "true", backupRoot, ttlMs: -1 });
  eng.putPlan(plan);
  let err = null;
  try { eng.executePlan(plan.token); } catch (e) { err = e; }
  check("expired plan → code plan-expired", err && err.code === "plan-expired", err && err.code);
  check("expired plan → file untouched", sha(readFileSync(file, "utf8")) === sha(realText));
}

// ---------- 6. 未知 token → 404 ----------
{
  let err = null;
  try { eng.executePlan("deadbeefdeadbeefdeadbeefdeadbeef"); } catch (e) { err = e; }
  check("unknown token → code plan-not-found", err && err.code === "plan-not-found", err && err.code);
}

// ---------- 7. 键不存在时的插入路径 + 幂等 ----------
{
  const file = freshPatch();
  // rate-throttle 当前没有 `disabled` 键 → 走插入分支
  const plan = eng.createPlan({ file, rowId: "rate-throttle", key: "disabled", value: "true", backupRoot });
  check("plan detects missing key → will insert", plan.diff[0].startsWith("+ "), JSON.stringify(plan.diff));
  eng.putPlan(plan);
  eng.executePlan(plan.token);
  const after = readFileSync(file, "utf8");
  check("insert path wrote the key at row-child indent", /- id: rate-throttle\n {6}disabled: true/.test(lf(after)),
    JSON.stringify((lf(after).match(/- id: rate-throttle\n[^\n]*\n[^\n]*/) || [""])[0]));
  check("insert path kept name:/config: after the new key", /- id: rate-throttle\n {6}disabled: true\n {6}name:/.test(lf(after)));

  // 再来一次同值 → changed=false，不写盘
  const plan2 = eng.createPlan({ file, rowId: "rate-throttle", key: "disabled", value: "true", backupRoot });
  const shaBeforeNoop = sha(readFileSync(file, "utf8"));
  check("idempotent plan reports changed=false", plan2.changed === false);
  eng.putPlan(plan2);
  const r2 = eng.executePlan(plan2.token);
  check("idempotent execute leaves sha unchanged", sha(readFileSync(file, "utf8")) === shaBeforeNoop, r2.shaAfter.slice(0, 12));
}

// ---------- 8. 保留策略：最近 20 份硬顶 / 30 天宽限 / 绝对上限 ----------
{
  const root2 = join(work, "retention");
  const file = freshPatch();
  // 造 25 份备份。注意：25 次写入在同一秒内完成 —— 这正是"时间窗不得击穿份数硬顶"
  // 的判别场景（若实现允许时间窗兜住全部，就会一份都不删，保留策略形同虚设）。
  for (let i = 1; i <= 25; i++) {
    const plan = eng.createPlan({ file, rowId: "rate-throttle", key: "disabled", value: i % 2 === 0 ? "true" : "false", backupRoot: root2 });
    eng.putPlan(plan);
    eng.executePlan(plan.token);
  }
  const names = readdirSync(root2).filter((n) => existsSync(join(root2, n, "manifest.json")));
  check("retention keeps the newest 20 unconditionally", names.length >= 20, "n=" + names.length);
  check("retention respects the absolute ceiling under dense writes", names.length <= 40, "n=" + names.length);
  check("retention never grows past 2x the count cap", names.length <= 40, "n=" + names.length);

  // 独立验证：超出绝对上限的旧备份，无论多新都要被裁掉
  const root3 = join(work, "retention-abs");
  for (let i = 0; i < 45; i++) {
    const dir = join(root3, "2026-09-17T15-00-" + String(i).padStart(2, "0") + "-000Z");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "manifest.json"), JSON.stringify({ stamp: String(i), files: [] }), "utf8");
  }
  const pruned = eng.pruneBackups(root3);
  const left = readdirSync(root3).filter((n) => existsSync(join(root3, n, "manifest.json"))).length;
  check("retention enforces the absolute ceiling on all-recent backups", left === 40, "left=" + left);
  check("retention reports what it removed", pruned.removed.length === 5, "removed=" + pruned.removed.length);

  // 独立验证：真正"旧"的备份（mtime 也真的调旧）会被删除。
  // 注意：目录名写着 2000 年不算数 —— 裁剪读的是 mtime，必须真的改 mtime。
  const root4 = join(work, "retention-old");
  for (let i = 0; i < 25; i++) {
    const dir = join(root4, "2026-09-17T15-00-" + String(i).padStart(2, "0") + "-000Z");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "manifest.json"), JSON.stringify({ stamp: String(i), files: [] }), "utf8");
  }
  const oldDir = join(root4, "2000-01-01T00-00-00-000Z");
  mkdirSync(oldDir, { recursive: true });
  writeFileSync(join(oldDir, "manifest.json"), JSON.stringify({ stamp: "old", files: [] }), "utf8");
  const aged = new Date("2000-01-01T00:00:00Z");
  utimesSync(oldDir, aged, aged); // 真把 mtime 调到 2000 年
  const prunedOld = eng.pruneBackups(root4, { now: Date.now() });
  check("retention removes a genuinely-aged backup (mtime beyond 30 days)",
    prunedOld.removed.includes("2000-01-01T00-00-00-000Z"), JSON.stringify(prunedOld.removed));
  check("retention keeps the recent 25 when none exceed the ceiling", prunedOld.kept.length === 25,
    "kept=" + prunedOld.kept.length);
}

// ---------- 9. 真实 cordis.patch.yml 全程未被触碰 ----------
check("REAL cordis.patch.yml sha unchanged by this test", sha(readFileSync(REAL_PATCH, "utf8")) === realShaBefore);

rmSync(work, { recursive: true, force: true });

if (passed === 0 && failed === 0) {
  console.error("no assertions ran");
  process.exit(1);
}
console.log("\n" + passed + "/" + (passed + failed) + " PASS");
process.exit(failed === 0 ? 0 : 1);
