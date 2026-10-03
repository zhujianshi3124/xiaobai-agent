#!/usr/bin/env node
// P2.2b 附验收（对应用户 Q4「裁剪排除证据」）——
// 「备份裁剪不会吃掉人工留档」的可复现证据。
//
// 命题（待证）：两段式引擎的保留策略 pruneBackups() 只在自己收到的 backupRoot 内裁剪，
//   既不会删除人工留档目录 .panel-backups/，也不会改动 backupRoot 之外的任何文件。
//
// 四路独立证据：
//   E1 目录不同源 —— 引擎默认 backupRoot = <toolkitRoot>/.panel-write-backups；
//                    人工留档目录   = <toolkitRoot>/.panel-backups。
//                    二者既非同一目录，也非父子关系。
//   E2 清单过滤 —— listBackups() 只认「子目录里有 manifest.json」的条目。
//                  人工往归档目录里塞的裸目录/裸文件天然不在裁剪视野内。
//   E3 运行时隔离 —— 同一父目录下并排放 write-backups/ 与 manual-archive/，
//                    对前者跑 pruneBackups：后者逐字节不变，且父目录内除 write-backups
//                    之外零增删。这是「越界删除」的直接反证。
//   E4 生产实况 —— 默认 backupRoot .panel-write-backups 的现状。
//                  2026-09-18 修订：用户已在面板上跑过真实 停用/复原（4 次写），
//                  该目录**已经存在**。故 E4 不再断言「不存在 ⇒ 从未裁剪」，改为断言
//                  「引擎备份数 ≤ 保留上限 ⇒ 没有任何一份引擎备份因密度被裁掉」，
//                  并继续证明人工留档未被生产裁剪波及。核心证明仍在 E3（运行时隔离）。
//
// 全部操作发生在 OS 临时目录；对真实仓只做**只读**读取。
// 绝不改动真实 cordis.patch.yml，也绝不触碰真实 .panel-backups/。
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, rmSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const eng = await import(new URL("../panel/manager/apply-engine.mjs", import.meta.url).href);

let passed = 0;
let failed = 0;
let skipped = 0;
function check(label, ok, detail) {
  if (ok) { passed += 1; console.log("PASS " + label + (detail ? " -- " + detail : "")); }
  else { failed += 1; console.log("FAIL " + label + (detail ? " -- " + detail : "")); }
}
// E4/E1e 缺席明示降级（2026-10-02，外部门禁修复批）：运行期目录缺席＝外部克隆环境
// 正常形态（运行期产物不入库，.gitignore 声明）——显式 SKIP 计数并注明原因，不崩红、
// 不静默；本机（目录在场）走原断言，行为不变。SKIP 行非 FAIL 形态，regression-all 兼容。
function skip(label, reason) {
  skipped += 1;
  console.log("SKIP " + label + " — " + reason);
}
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

/** 递归收集一个目录下的 { 相对路径 -> sha256 }，用于「逐字节不变」断言。 */
function snapshotTree(dir) {
  const out = new Map();
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      const abs = join(current, name);
      const rel = relative(dir, abs).replace(/\\/g, "/");
      if (statSync(abs).isDirectory()) walk(abs);
      else out.set(rel, sha(readFileSync(abs)));
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

// ================= E1 目录不同源 =================
const sourceOf = (rel) => readFileSync(join(root, rel), "utf8");

// 默认 backupRoot 的推导方式与 panel/index.js 一致：resolve(panelRoot(), "..") + "/.panel-write-backups"
const panelSrc = sourceOf("panel/index.js");
const engineDefaultRoot = join(root, ".panel-write-backups");
const manualArchiveRoot = join(root, ".panel-backups");

check("E1a engine default backupRoot is derived from toolkitRoot (panel/index.js)",
  panelSrc.includes("join(toolkitRoot, \".panel-write-backups\")"),
  "panel/index.js 出现 join(toolkitRoot, \".panel-write-backups\")");
check("E1b engine default backupRoot != manual archive dir",
  engineDefaultRoot !== manualArchiveRoot,
  engineDefaultRoot + "  vs  " + manualArchiveRoot);
check("E1c neither dir is a parent/child of the other",
  !engineDefaultRoot.startsWith(manualArchiveRoot + "\\")
    && !manualArchiveRoot.startsWith(engineDefaultRoot + "\\"),
  "二者为同级目录");
check("E1d manual archive dir is git-ignored (raw archives never enter git)",
  sourceOf(".gitignore").split(/\r?\n/).map((s) => s.trim()).includes(".panel-backups/"),
  ".gitignore 含 .panel-backups/");
if (existsSync(manualArchiveRoot)) {
  check("E1e manual archive dir exists on disk (so this is a real, non-hypothetical exclusion)", true);
} else {
  skip("E1e manual archive dir exists on disk",
    "运行期目录 .panel-backups 缺席＝外部克隆环境正常形态（运行期产物不入库，.gitignore 声明）；本机在场时照跑原断言");
}

// ================= E2 清单过滤 =================
const backupSrc = sourceOf("panel/manager/backup.mjs");
check("E2a listBackups only counts subdirs that carry manifest.json",
  /existsSync\(join\(backupRoot,\s*name,\s*"manifest\.json"\)\)/.test(backupSrc),
  "backup.mjs listBackups 过滤器命中");
check("E2b listBackups on a nonexistent root returns empty (no throw, nothing to prune)",
  eng.pruneBackups(join(root, ".definitely-not-here-" + Date.now())).removed.length === 0);

// ================= E3 运行时隔离 =================
const work = mkdtempSync(join(tmpdir(), "p22b-retention-scope-"));
const writeRoot = join(work, "write-backups");
const manualRoot = join(work, "manual-archive");
mkdirSync(writeRoot, { recursive: true });
mkdirSync(join(manualRoot, "pre-p22b-fullcard-20260918"), { recursive: true });
mkdirSync(join(manualRoot, "restart-logs"), { recursive: true });
writeFileSync(join(manualRoot, "pre-p22b-fullcard-20260918", "client-index.js"), "// manual archive payload\n", "utf8");
writeFileSync(join(manualRoot, "restart-logs", "restart-trigger.log"), "manual log payload\n", "utf8");
// 一个诱饵：人工归档里也放一个 manifest.json —— 即便将来误把归档当 root，也必须靠「目录不同」而非「没有 manifest」来挡住；这里先证明它不会被越界删除。
writeFileSync(join(manualRoot, "pre-p22b-fullcard-20260918", "manifest.json"), JSON.stringify({ manual: true }), "utf8");

// 造 45 份引擎备份（全部带 manifest.json），制造必然会触发裁剪的局面
for (let i = 0; i < 45; i++) {
  const dir = join(writeRoot, "2026-09-18T00-00-" + String(i).padStart(2, "0") + "-000Z");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ stamp: String(i), files: [] }), "utf8");
  writeFileSync(join(dir, "cordis.patch.yml"), "payload " + i + "\n", "utf8");
}

const beforeAll = snapshotTree(work);
const beforeManual = snapshotTree(manualRoot);
const pruned = eng.pruneBackups(writeRoot, { now: Date.now() });
const afterAll = snapshotTree(work);
const afterManual = snapshotTree(manualRoot);

const leftInWriteRoot = readdirSync(writeRoot).filter((n) => existsSync(join(writeRoot, n, "manifest.json"))).length;

check("E3a pruning actually ran on the engine root", pruned.removed.length === 5 && leftInWriteRoot === 40,
  "removed=" + pruned.removed.length + " left=" + leftInWriteRoot + " (45 -> 40, maxTotal=40)");
check("E3b manual archive unchanged byte-for-byte after pruning",
  beforeManual.size === afterManual.size
    && [...beforeManual].every(([k, v]) => afterManual.get(k) === v),
  "manual files=" + afterManual.size);
check("E3c manual archive entry count unchanged",
  readdirSync(manualRoot).length === 2,
  "entries=" + readdirSync(manualRoot).join(","));
check("E3d manual archive still exists as a directory (not removed recursively)",
  existsSync(manualRoot) && existsSync(join(manualRoot, "pre-p22b-fullcard-20260918", "manifest.json")));
check("E3e every changed path is under write-backups/ (no out-of-root deletion)",
  [...new Set([...beforeAll.keys(), ...afterAll.keys()])].every((rel) =>
    beforeAll.get(rel) === afterAll.get(rel) || rel.startsWith("write-backups/")),
  "差异集合 ⊆ write-backups/");
check("E3f pruning created nothing outside the engine root",
  [...afterAll.keys()].every((rel) => beforeAll.has(rel) || rel.startsWith("write-backups/")));

rmSync(work, { recursive: true, force: true });

// ================= E4 生产实况（2026-09-18 修订） =================
// 背景：用户在面板上的真实 停用/复原 已使默认 backupRoot 出现 4 份写前备份。
// 原断言「目录不存在 ⇒ 生产从未裁剪」前提已失效，按新现实重写（不复述旧结论）。
// 2026-10-02 修订（外部门禁缺席降级）：运行期目录缺席＝外部克隆环境正常形态——
// 整段显式 SKIP（不崩红不静默），本机在场时照跑，行为不变。
const e4Present = existsSync(manualArchiveRoot) && existsSync(engineDefaultRoot);
let engineBackups = null;
if (!e4Present) {
  skip("E4 生产实况段（E4a–E4d）",
    "运行期目录缺席（.panel-write-backups exists=" + existsSync(engineDefaultRoot)
    + ", .panel-backups exists=" + existsSync(manualArchiveRoot)
    + "）＝外部克隆环境正常形态（运行期产物不入库，.gitignore 声明）；本机在场时照跑");
} else {
const engineBackupsLocal = readdirSync(engineDefaultRoot).filter((n) => existsSync(join(engineDefaultRoot, n, "manifest.json")));
engineBackups = engineBackupsLocal;
check("E4a engine default backupRoot exists on disk (panel has performed real writes)",
  existsSync(engineDefaultRoot),
  engineDefaultRoot + "  exists=" + existsSync(engineDefaultRoot) + "  backups=" + engineBackupsLocal.length);
check("E4b engine backup count <= keep-count cap => no engine backup lost to density pruning",
  engineBackupsLocal.length <= eng.BACKUP_KEEP_COUNT,
  "engine backups=" + engineBackupsLocal.length + " <= keepCount " + eng.BACKUP_KEEP_COUNT);
check("E4c engine root and manual archive are disjoint real directories (same parent, no nesting)",
  existsSync(engineDefaultRoot) && existsSync(manualArchiveRoot)
    && !engineDefaultRoot.startsWith(manualArchiveRoot + "\\")
    && !manualArchiveRoot.startsWith(engineDefaultRoot + "\\"),
  "两者为同级目录，非同一、非父子");
check("E4d manual archive still intact (not eaten by any production pruning)",
  existsSync(manualArchiveRoot) && readdirSync(manualArchiveRoot).length > 0,
  "manual archive entries=" + readdirSync(manualArchiveRoot).length);
}

// ================= 汇总 =================
if (passed === 0 && failed === 0) {
  console.error("no assertions ran");
  process.exit(1);
}
console.log("\n" + passed + "/" + (passed + failed) + " PASS" + (skipped ? "  (+" + skipped + " SKIP 明示降级：运行期目录缺席)" : ""));
console.log("");
console.log("=== 裁剪排除证据（存档用） ===");
console.log("引擎默认 backupRoot      : " + engineDefaultRoot + "  (exists=" + existsSync(engineDefaultRoot) + ", backups=" + (e4Present ? engineBackups.length : "n/a/SKIP") + ")");
console.log("人工留档目录             : " + manualArchiveRoot + "  (exists=" + existsSync(manualArchiveRoot) + ", entries=" + (existsSync(manualArchiveRoot) ? readdirSync(manualArchiveRoot).length : "缺席(SKIP)") + ")");
console.log("两者关系                 : 同级目录，非同一、非父子");
console.log("listBackups 过滤条件     : 只认含 manifest.json 的子目录");
console.log("运行时装裁剪 45 份 ->     : kept=" + (45 - pruned.removed.length) + " removed=" + pruned.removed.length);
console.log("同父目录下 manual-archive: " + afterManual.size + " 个文件，逐字节不变");
if (failed > 0) process.exitCode = 1;
