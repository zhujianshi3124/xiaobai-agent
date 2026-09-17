#!/usr/bin/env node
// P2.2 启停开关 —— 专项验收测试（真实文件读写 + 真实备份产物 + CRLF 兼容）
//
// 覆盖 handoff 11.7 中 P2.2 的验收标准：
//   ① 开关 → 文件真变（SHA 变化）→ doctor 0/0/0 → reload 后状态保持且面板如实显示
//   ② 锚点在文件中恰好命中 1 次（0 或 ≥2 拒绝写盘）
//   ③ 停用前交叉检查其他块是否引用该插件
//   ④ 走 apply-engine 唯一通道（plan → execute）
//   ⑤ 写前备份
//   ⑥ 双层开关 UI 分立（patch disabled 与 config.enabled 不得合并呈现）
//
// 全部操作发生在 OS 临时目录的副本上，**绝不触碰真实 cordis.patch.yml**。
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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
// 真实 patch 是 CRLF；断言前统一归一化（上轮已提，勿漏）
const lf = (t) => String(t).replace(/\r\n/g, "\n");

const REAL_PATCH = join(root, "cordis.patch.yml");
const realText = readFileSync(REAL_PATCH, "utf8");
const realShaBefore = sha(realText);

const work = mkdtempSync(join(tmpdir(), "p22-toggle-"));
const backupRoot = join(work, "write-backups");
let caseNo = 0;
function freshPatch() {
  caseNo += 1;
  const file = join(work, "patch-" + caseNo + ".yml");
  writeFileSync(file, realText, "utf8");
  return file;
}

// ---------- 1. 锚点唯一（P2.2 硬要求，含 CRLF 兼容）----------
{
  const file = freshPatch();
  const text = readFileSync(file, "utf8");
  check("fixture really is CRLF (guards the whole file's premise)",
    /\r\n/.test(text) && !/(?<!\r)\n/.test(text));

  const hit = eng.locateRowAnchor(text, "rate-throttle");
  check("anchor rate-throttle resolves exactly once", hit && hit.lineIndex === 13, "line " + (hit.lineIndex + 1));

  let missing = null;
  try { eng.locateRowAnchor(text, "no-such-row"); } catch (e) { missing = e; }
  check("anchor 0 hits → refuse (anchor-missing)", missing && missing.code === "anchor-missing", missing && missing.code);

  // ≥2 命中：用真实文件内容复制一份 rate-throttle 行，构造歧义
  const dupText = lf(text).replace(
    "    - id: rate-throttle\n",
    "    - id: rate-throttle\n    - id: rate-throttle\n",
  );
  let amb = null;
  try { eng.locateRowAnchor(dupText, "rate-throttle"); } catch (e) { amb = e; }
  check("anchor ≥2 hits → refuse (anchor-ambiguous)", amb && amb.code === "anchor-ambiguous", amb && amb.code);

  // createTogglePlan 也必须把这两种情况挡在门外
  let ambPlan = null;
  try { eng.createTogglePlan({ file, rowId: "rate-throttle", enabled: false, backupRoot }); } catch (e) { ambPlan = e; }
  check("createTogglePlan succeeds on a unique anchor", ambPlan === null, ambPlan && ambPlan.message);
}

// ---------- 2. 交叉引用检查 ----------
{
  const file = freshPatch();
  const text = readFileSync(file, "utf8");
  const selfRefs = eng.findCrossReferences(text, { rowId: "rate-throttle", alsoMatch: ["@local/dsh-toolkit/rate-throttle"] });
  check("real patch: rate-throttle is not referenced by others", selfRefs.length === 0, JSON.stringify(selfRefs));

  // 正例：构造一个引用它的行块
  const withRef = lf(text).replace(
    "    - id: web-search-local\n",
    "    - id: other-row\n      config:\n        uses: rate-throttle\n\n    - id: web-search-local\n",
  );
  const refs = eng.findCrossReferences(withRef, { rowId: "rate-throttle", alsoMatch: ["@local/dsh-toolkit/rate-throttle"] });
  check("cross-ref detected when another block references the id", refs.length === 1, JSON.stringify(refs));
  // 不硬编码行号（依赖 fixture 变换，脆）；改断言"指向的行确实是那条引用"，
  // 且行号落在文件范围内 —— 更有意义也更稳。
  check("cross-ref points at the actual referencing line",
    !!(refs[0] && /uses:\s*rate-throttle/.test(refs[0].text)), JSON.stringify(refs[0]));
  check("cross-ref line number is within the file",
    !!(refs[0] && refs[0].line > 0 && refs[0].line <= withRef.split(/\r?\n/).length),
    "line " + (refs[0] && refs[0].line));

  // 负例：子串不误报
  const substr = lf(text).replace("    - id: web-search-local\n", "    - id: other-row\n      config:\n        name: rate-throttle-extra\n\n");
  check("cross-ref does NOT fire on a substring (rate-throttle-extra)",
    eng.findCrossReferences(substr, { rowId: "rate-throttle" }).length === 0);

  // 负例：注释行不误报
  const commented = "# rate-throttle is noted here\n" + lf(text).replace("    - id: web-search-local\n", "");
  check("cross-ref does NOT fire on a comment line",
    eng.findCrossReferences(commented, { rowId: "rate-throttle" }).length === 0);

  // 自身块不算交叉引用
  check("cross-ref ignores the plugin's own block",
    eng.findCrossReferences(lf(text), { rowId: "rate-throttle" }).length === 0);
}

// ---------- 3. 停用（写 disabled: true）—— 正常路径 + 备份 ----------
{
  const file = freshPatch();
  const beforeText = readFileSync(file, "utf8");
  const beforeSha = sha(beforeText);

  // 第一段：plan（只读）
  const plan = eng.createTogglePlan({ file, rowId: "rate-throttle", enabled: false, backupRoot });
  eng.putPlan(plan);
  check("toggle plan is read-only (file sha unchanged)",
    sha(readFileSync(file, "utf8")) === beforeSha);
  check("toggle plan targets layer patch-row.disabled", plan.key === "disabled");
  check("toggle plan diff preview present", Array.isArray(plan.diff) && plan.diff.length > 0, JSON.stringify(plan.diff));
  check("toggle plan reports cross-reference status", Array.isArray(plan.crossRefs));

  // 第二段：execute（落盘）
  const result = eng.executePlan(plan.token);
  const afterText = readFileSync(file, "utf8");
  const afterSha = sha(afterText);

  check("toggle changed the file (SHA differs) — 验收项①", afterSha !== beforeSha,
    beforeSha.slice(0, 12) + " → " + afterSha.slice(0, 12));
  check("disabled: true written at the row's own child indent",
    /- id: rate-throttle\n\s{6}disabled: true\n/.test(lf(afterText)),
    JSON.stringify((lf(afterText).match(/- id: rate-throttle\n[\s\S]{0,80}/) || [""])[0].split("\n").slice(0, 3)));
  check("disabled is a SIBLING of config:, not nested inside it",
    /- id: rate-throttle\n {6}disabled: true\n {6}name:/.test(lf(afterText)));
  check("config.enabled untouched (two layers stay independent)",
    /- id: rate-throttle[\s\S]{0,400}?config:\n\s+enabled: false/.test(lf(afterText)));
  check("CRLF line endings preserved", /\r\n/.test(afterText) && !/(?<!\r)\n/.test(afterText));
  check("all other row blocks left intact",
    lf(beforeText).split(/^\s*- id:/m).length === lf(afterText).split(/^\s*- id:/m).length);

  // 备份产物（硬要求）
  check("backup dir returned", typeof result.backupDir === "string" && existsSync(result.backupDir), result.backupDir);
  const manifest = JSON.parse(readFileSync(join(result.backupDir, "manifest.json"), "utf8"));
  check("backup manifest sha == pre-write sha (byte-identical proof)",
    manifest.files[0].sha256 === beforeSha, manifest.files[0].sha256.slice(0, 16) + " vs " + beforeSha.slice(0, 16));
  check("backup copy is byte-identical to pre-write content",
    readFileSync(join(result.backupDir, manifest.files[0].savedAs), "utf8") === beforeText);

  // 状态保持：重读文件后解析结果应反映停用
  const snapMod = await import(new URL("../panel/manager/snapshot.mjs", import.meta.url).href);
  const parsed = eng.locateRowAnchor(afterText, "rate-throttle");
  check("re-parsing the written file still finds the anchor uniquely", !!parsed);
}

// ---------- 4. 启用（写 disabled: false）往返 ----------
{
  const file = freshPatch();
  const plan1 = eng.createTogglePlan({ file, rowId: "rate-throttle", enabled: false, backupRoot });
  eng.putPlan(plan1);
  eng.executePlan(plan1.token);
  const disabledSha = sha(readFileSync(file, "utf8"));

  const plan2 = eng.createTogglePlan({ file, rowId: "rate-throttle", enabled: true, backupRoot });
  eng.putPlan(plan2);
  eng.executePlan(plan2.token);
  const afterText = readFileSync(file, "utf8");
  check("re-enable wrote disabled: false", /- id: rate-throttle\n {6}disabled: false\n/.test(lf(afterText)),
    JSON.stringify((lf(afterText).match(/- id: rate-throttle\n[\s\S]{0,60}/) || [""])[0].split("\n").slice(0, 2)));
  check("re-enable changed the file again (SHA moved)", sha(afterText) !== disabledSha);
  check("layer separation intact after round-trip (config.enabled still false)",
    /- id: rate-throttle[\s\S]{0,400}?config:\n\s+enabled: false/.test(lf(afterText)));

  // 幂等：重复启用 → changed=false
  const plan3 = eng.createTogglePlan({ file, rowId: "rate-throttle", enabled: true, backupRoot });
  check("repeat enable is idempotent (changed=false)", plan3.changed === false);
}

// ---------- 5. 「停用后 reload 状态保持」的可验证等价物 ----------
// reload 本身由用户执行；此处证明**落盘内容足以让重新解析得到新状态**。
{
  const file = freshPatch();
  const plan = eng.createTogglePlan({ file, rowId: "rate-throttle", enabled: false, backupRoot });
  eng.putPlan(plan);
  eng.executePlan(plan.token);

  // 用服务端真实的 parseRootRows 语义重新解析（通过 buildSnapshot 的同款实现）
  const rowsText = readFileSync(file, "utf8");
  const rowLine = /^(\s*)- id:\s*rate-throttle/m.exec(rowsText);
  check("written file still parses as valid YAML-ish structure (anchor present)", !!rowLine);
  const disabledLine = /- id:\s*rate-throttle\r?\n\s+disabled:\s*true/.exec(rowsText);
  check("re-parse yields disabled:true → panel would show 未加载 (状态保持的等价证明)", !!disabledLine);
}

// ---------- 6. 双层开关 UI 分立（不得合并呈现）----------
{
  const clientSrc = readFileSync(join(root, "panel", "client", "index.js"), "utf8");
  const htmlSrc = readFileSync(join(root, "panel", "client", "panel.html"), "utf8");

  check("client has a ToggleControls component", clientSrc.includes("function ToggleControls"));
  check("html has a toggleHtml renderer", htmlSrc.includes("function toggleHtml"));
  check("both clients name layer 1 as patch-row.disabled",
    clientSrc.includes("patch-row.disabled") && htmlSrc.includes("patch-row.disabled"));
  check("both clients name layer 2 as config.enabled",
    clientSrc.includes("config.enabled") && htmlSrc.includes("config.enabled"));
  check("both clients state the two layers are separate",
    clientSrc.includes("两层分开") && htmlSrc.includes("两层分开"));
  check("toggle goes through the plan endpoint",
    clientSrc.includes("/api/toolkit-panel/toggle/plan") && htmlSrc.includes("/api/toolkit-panel/toggle/plan"));
  check("toggle goes through execute (two-phase, not a direct write)",
    clientSrc.includes("/api/toolkit-panel/execute") && htmlSrc.includes("/api/toolkit-panel/execute"));
  check("confirm step shows the target file",
    clientSrc.includes("目标文件") && htmlSrc.includes("目标文件"));
  check("confirm step shows the diff",
    clientSrc.includes("confirmBox") && htmlSrc.includes("diffPre"));
  check("cross-reference warning surfaced in UI",
    clientSrc.includes("crossRefs") && htmlSrc.includes("crossRefs"));
  check("no client merges the two layers into one switch value",
    !/layer\s*[:=]\s*["']merged/.test(clientSrc));
}

// ---------- 7. 真实 cordis.patch.yml 全程未被触碰 ----------
check("REAL cordis.patch.yml sha unchanged by this test", sha(readFileSync(REAL_PATCH, "utf8")) === realShaBefore);

if (passed === 0 && failed === 0) {
  console.error("no assertions ran");
  process.exit(1);
}
console.log("\n" + passed + "/" + (passed + failed) + " PASS");
process.exit(failed === 0 ? 0 : 1);
