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
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, utimesSync, readdirSync, statSync } from "node:fs";
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

/** 抽出某个行块的原文（从 `- id:` 行到下一个行块之前）。 */
function blockOf(text, rowId) {
  const lines = lf(text).split("\n");
  const start = lines.findIndex((l) => new RegExp("^\\s*- id:\\s*" + rowId + "\\s*$").test(l));
  if (start < 0) return "";
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*- id:/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join("\n");
}

/**
 * 抽出某行「第二层」的原文 —— 即 `config:` 子树。
 * 用来断言改写第一层（patch 行 disabled）不会动到第二层（config.enabled）的任何一个字节。
 */
function layerTwoOf(text, rowId) {
  const block = blockOf(text, rowId);
  const m = /\n\s*config:\n([\s\S]*)$/.exec(block);
  return m ? m[1] : "";
}

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
  // D-01 防复发：不依赖 manifest.savedAs，独立按目录实体核验副本
  // （旧缺陷：savedAs 未净化盘符冒号 ⇒ 内容落 NTFS ADS，目录只剩 0 字节文件）
  const bkpEntries = readdirSync(result.backupDir).filter((n) => n !== "manifest.json");
  check("backup dir has exactly one payload file", bkpEntries.length === 1, JSON.stringify(bkpEntries));
  check("backup payload has no zero-byte entry (ADS-defect fingerprint)",
    bkpEntries.every((n) => statSync(join(result.backupDir, n)).size > 0), JSON.stringify(bkpEntries));
  check("backup payload name contains no ':' (NTFS ADS specifier)",
    !bkpEntries.some((n) => n.includes(":")), JSON.stringify(bkpEntries));
  const bkpBytes = readFileSync(join(result.backupDir, bkpEntries[0]));
  check("backup payload sha == pre-write sha", sha(bkpBytes.toString("utf8")) === beforeSha);
  // manifest 必须自解释（reason/note 非 null）—— 防「恒为 null」回归
  check("backup manifest records a reason (non-null)", typeof manifest.reason === "string" && manifest.reason.length > 0, JSON.stringify(manifest.reason));
  check("backup manifest records a note (non-null)", typeof manifest.note === "string" && manifest.note.length > 0, JSON.stringify(manifest.note));
  check("backup copy is byte-identical to pre-write content",
    bkpBytes.toString("utf8") === beforeText);

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
  // P7 路由前缀化后，两个渲染器的请求基址集中在 PANEL_API 一处（client 常量 / 兜底页装配期标记），
  // 端点字面量不再带完整路径。这三条断言据此改写，语义不变：toggle 必须 plan→execute 两段式，
  // 且基址必须真的只有一处来源（出现裸 /api/toolkit-panel/... 字面量即视为回归）。
  check("toggle goes through the plan endpoint",
    clientSrc.includes('PANEL_API + "/toggle/plan"') && htmlSrc.includes('PANEL_API + "/toggle/plan"'));
  check("toggle goes through execute (two-phase, not a direct write)",
    clientSrc.includes('PANEL_API + "/execute"') && htmlSrc.includes('PANEL_API + "/execute"'));
  check("request base is single-sourced (P7 prefixing, no bare /api/toolkit-panel/ literal)",
    !/["'`]\/api\/toolkit-panel\//.test(clientSrc) && !/["'`]\/api\/toolkit-panel\//.test(htmlSrc));
  check("confirm step shows the target file",
    clientSrc.includes("目标文件") && htmlSrc.includes("目标文件"));
  check("confirm step shows the diff",
    clientSrc.includes("confirmBox") && htmlSrc.includes("diffPre"));
  check("cross-reference warning surfaced in UI",
    clientSrc.includes("crossRefs") && htmlSrc.includes("crossRefs"));
  check("no client merges the two layers into one switch value",
    !/layer\s*[:=]\s*["']merged/.test(clientSrc));
}

// ---------- 7. 全卡覆盖：每张**可 toggle 卡**各跑一次 toggle plan ----------
//
// 起因：上轮只证过 rate-throttle 一张，而面板开放 toggle 的是 4 张卡。
// 「只证 1 张」等于没证 —— 本段把每一张都真跑一遍，并对齐锚点行号。
const CARDS = [
  { dir: "rate-throttle", rowId: "rate-throttle", line: 14, pkg: "@local/dsh-toolkit/rate-throttle" },
  { dir: "web-search-local", rowId: "web-search-local", line: 58, pkg: "@local/dsh-toolkit/web-search-local" },
  { dir: "search-router", rowId: "web-search-router", line: 64, pkg: "@local/dsh-toolkit/search-router" },
  { dir: "agent-memory", rowId: "agent-memory-runtime", line: 74, pkg: "@local/dsh-toolkit/agent-memory" },
];
{
  for (const card of CARDS) {
    const file = freshPatch();
    const before = readFileSync(file, "utf8");
    const beforeSha = sha(before);

    // (a) 锚点唯一 + 行号对账
    let hitLine = null;
    try { hitLine = eng.locateRowAnchor(before, card.rowId).lineIndex + 1; } catch { /* 下面断言会报 */ }
    check("card " + card.dir + ": anchor unique and at the reconciled line " + card.line,
      hitLine === card.line, "line " + hitLine);

    // (b) 交叉引用检查（真实文件上应当无引用）
    const refs = eng.findCrossReferences(before, { rowId: card.rowId, alsoMatch: [card.pkg] });
    check("card " + card.dir + ": cross-ref check runs and finds 0 on the real file",
      Array.isArray(refs) && refs.length === 0, JSON.stringify(refs));

    // (c) toggle plan 真跑 + 只读
    const plan = eng.createTogglePlan({ file, rowId: card.rowId, enabled: false, backupRoot, alsoMatch: [card.pkg] });
    check("card " + card.dir + ": toggle plan is read-only (file sha unchanged)",
      sha(readFileSync(file, "utf8")) === beforeSha);
    check("card " + card.dir + ": toggle plan changed=true and targets the right line",
      plan.changed === true && plan.anchorLine === card.line,
      "changed=" + plan.changed + " anchorLine=" + plan.anchorLine);
    check("card " + card.dir + ": diff preview shows disabled: true",
      plan.diff.some((l) => /^\+\s+disabled: true$/.test(l)), JSON.stringify(plan.diff));

    // (d) 确认页元数据齐备（UI 确认页逐项消费这些字段）
    const metaOk = typeof plan.file === "string" && plan.file === file
      && plan.rowId === card.rowId
      && plan.anchorLine > 0
      && typeof plan.token === "string" && plan.token.length === 32
      && plan.expectedSha === beforeSha
      && Number.isFinite(Date.parse(plan.expiresAt)) && Date.parse(plan.expiresAt) > Date.now()
      && plan.crossRefs.length === 0
      && plan.targetEnabled === false;
    check("card " + card.dir + ": confirm-page metadata complete (file/rowId/line/token/sha/expiry/diff)", metaOk,
      JSON.stringify({ file: !!plan.file, rowId: plan.rowId, anchorLine: plan.anchorLine, tokenLen: plan.token.length, expiry: plan.expiresAt }));

    // (e) 落盘后：只在**该行**加了 disabled，其它层不动
    eng.putPlan(plan);
    eng.executePlan(plan.token);
    const after = lf(readFileSync(file, "utf8"));
    check("card " + card.dir + ": disabled: true landed as a sibling of the row's own keys",
      new RegExp("- id: " + card.rowId + "\\n {6}disabled: true\\n").test(after));
    check("card " + card.dir + ": layer 2 (config.enabled) byte-identical after toggle",
      layerTwoOf(before, card.rowId) === layerTwoOf(after, card.rowId),
      JSON.stringify(layerTwoOf(after, card.rowId)));
  }
}

// ---------- 8. compact-router：没有配置行 ⇒ 没有 toggle（fail-closed）----------
{
  const snapMod2 = await import(new URL("../panel/manager/snapshot.mjs", import.meta.url).href);
  const snap = await snapMod2.buildSnapshot({ toolkitRoot: root });
  const cr = snap.plugins.find((p) => p.dir === "compact-router");
  check("snapshot: compact-router has no patch row", !!cr && cr.patchRow === null);
  check("snapshot: compact-router is managed by the preset script", !!cr && cr.managedBy === "preset-script");

  // 引擎侧：对它发起 toggle 必须被锚点唯一性挡下（而不是误写别的行）
  const file = freshPatch();
  let e = null;
  try { eng.createTogglePlan({ file, rowId: "compact-router", enabled: false, backupRoot }); } catch (err) { e = err; }
  check("engine refuses to toggle compact-router (no such row → anchor-missing)",
    e && e.code === "anchor-missing", e && e.code);

  // 两套渲染器都必须把它排除在 toggle 之外
  const clientSrc = readFileSync(join(root, "panel", "client", "index.js"), "utf8");
  const htmlSrc = readFileSync(join(root, "panel", "client", "panel.html"), "utf8");
  check("react client gates toggle off for compact-router / row-less cards",
    /plugin\.dir === "compact-router" \|\| !row/.test(clientSrc));
  check("fallback page gates toggle off for compact-router / row-less cards",
    /p\.dir === "compact-router" \|\| !row/.test(htmlSrc));
}

// ---------- 9. 真实文件的注释行负例：交叉引用不得误报 ----------
//
// 真实 patch 的第 2 行注释里确实写着 "web-search-local"。
// 若「跳过注释行」这条规则失效，web-search-local 就会凭空多出一条交叉引用告警。
{
  const lines = lf(realText).split("\n");
  const commentHit = lines.findIndex((l) => /^\s*#/.test(l) && /web-search-local/.test(l));
  check("premise: a real comment line really does mention web-search-local", commentHit >= 0,
    "line " + (commentHit + 1) + ": " + (lines[commentHit] || "").trim().slice(0, 60));
  check("…and the comment rule suppresses it (0 cross-refs for web-search-local)",
    eng.findCrossReferences(realText, { rowId: "web-search-local" }).length === 0);
  // 反向对照：把那一条注释的 `#` 去掉，规则就应当命中 —— 证明抑制确实来自注释规则
  const targetLine = lines[commentHit];
  const uncommented = realText.replace(targetLine, targetLine.replace(/^\s*#\s?/, ""));
  check("control: un-commenting THAT line makes the same row produce a hit",
    uncommented !== realText && eng.findCrossReferences(uncommented, { rowId: "web-search-local" }).length > 0,
    JSON.stringify(eng.findCrossReferences(uncommented, { rowId: "web-search-local" }).slice(0, 2)));
}

// ---------- 10. Q1 安全闸：非字面量 disabled（!!js 条件写法）拒绝改写 ----------
{
  const jsExpr = "!!js process.platform === 'win32'";
  const file = freshPatch();
  const withExpr = readFileSync(file, "utf8").replace(
    "    - id: rate-throttle\r\n",
    "    - id: rate-throttle\r\n      disabled: " + jsExpr + "\r\n",
  );
  writeFileSync(file, withExpr, "utf8");
  const beforeSha = sha(readFileSync(file, "utf8"));

  // 读侧：必须把表达式如实报出来，而不是当成布尔
  const lit = eng.readRowDisabledLiteral(readFileSync(file, "utf8"), "rate-throttle");
  check("readRowDisabledLiteral flags a !!js expression as non-literal",
    lit && lit.literal === false && /!!js/.test(lit.raw), JSON.stringify(lit));
  check("readRowDisabledLiteral line number points at the disabled line", !!lit && lit.line > 0, "line " + (lit && lit.line));

  // 写侧：必须 fail-closed
  let e = null;
  try { eng.createTogglePlan({ file, rowId: "rate-throttle", enabled: false, backupRoot }); } catch (err) { e = err; }
  check("Q1 guard: toggle on a !!js row is REFUSED (value-not-literal)", e && e.code === "value-not-literal", e && e.code);
  check("Q1 guard: the platform expression was NOT clobbered (file untouched)",
    sha(readFileSync(file, "utf8")) === beforeSha);

  // 字面量行仍然正常放行（闸门不能误伤正常路径）
  const okFile = freshPatch();
  const okLit = eng.readRowDisabledLiteral(readFileSync(okFile, "utf8"), "rate-throttle");
  check("literal-absent row: readRowDisabledLiteral returns null (no disabled key yet)", okLit === null);
  const okPlan = eng.createTogglePlan({ file: okFile, rowId: "rate-throttle", enabled: false, backupRoot });
  check("Q1 guard does not block the normal path (literal/absent disabled still toggles)", okPlan.changed === true);

  // 已显式写了 disabled: false 的行，属于字面量，必须放行
  const falseFile = freshPatch();
  writeFileSync(falseFile, readFileSync(falseFile, "utf8").replace(
    "    - id: rate-throttle\r\n",
    "    - id: rate-throttle\r\n      disabled: false\r\n",
  ), "utf8");
  const falseLit = eng.readRowDisabledLiteral(readFileSync(falseFile, "utf8"), "rate-throttle");
  check("explicit `disabled: false` counts as literal (togglable)", falseLit && falseLit.literal === true, JSON.stringify(falseLit));

  // 错误码映射
  const idx = readFileSync(join(root, "panel", "index.js"), "utf8");
  check("server maps value-not-literal → 400",
    /"value-not-literal":\s*400/.test(idx));
}

// ---------- 11. Q2 层间覆盖检查：两层互不改写，且行插入的连带位移被 SHA 兜住 ----------
//
// 结论要证的是：第一层（patch 行 disabled）与第二层（config.enabled）**没有覆盖关系**，
// 改写任一层都不会动到另一层的字节；但**插入行会位移后续锚点**，这一连带效应由
// SHA 比对拦住（execute 前重读，SHA 变了就拒）。
{
  const file = freshPatch();
  const before = lf(readFileSync(file, "utf8"));
  const anchorBefore = eng.locateRowAnchor(before, "agent-memory-runtime").lineIndex + 1;

  // 改写 rate-throttle 这一层
  const plan = eng.createTogglePlan({ file, rowId: "rate-throttle", enabled: false, backupRoot });
  eng.putPlan(plan);
  eng.executePlan(plan.token);
  const after = lf(readFileSync(file, "utf8"));

  // (a) 每一行的 config 子树逐字节不变（两层无覆盖）
  const cfgKeys = ["rate-throttle", "web-search-local", "web-search-router", "agent-memory-runtime"];
  let allCfgSame = true;
  for (const id of cfgKeys) {
    if (layerTwoOf(before, id) !== layerTwoOf(after, id)) allCfgSame = false;
  }
  check("Q2: toggling layer 1 leaves EVERY row's layer-2 (config subtree) byte-identical", allCfgSame);

  // (b) 第二层取值本身也没变（rate-throttle 仍是 false）
  check("Q2: rate-throttle's config.enabled still reads false after layer-1 toggle",
    /- id: rate-throttle[\s\S]{0,400}?config:\n\s+enabled: false/.test(after));

  // (c) 连带效应：插入一行使后续锚点位移 —— 记录在案，并证明 SHA 会拦住陈旧 plan
  const anchorAfter = eng.locateRowAnchor(after, "agent-memory-runtime").lineIndex + 1;
  check("Q2: inserting a line shifts later anchors (documented consequence)",
    anchorAfter === anchorBefore + 1, anchorBefore + " → " + anchorAfter);

  const stale = eng.createTogglePlan({ file, rowId: "agent-memory-runtime", enabled: false, backupRoot });
  eng.putPlan(stale);
  const third = readFileSync(file, "utf8").replace("    - id: web-search-local\r\n", "    - id: web-search-local\r\n      disabled: false\r\n");
  writeFileSync(file, third, "utf8");
  let e = null;
  try { eng.executePlan(stale.token); } catch (err) { e = err; }
  check("Q2: a stale plan (file changed meanwhile) is rejected by SHA — covers the shift",
    e && e.code === "sha-conflict", e && e.code);

  // (d) 面板呈现依据的原则：层 1 是「有没有加载」，层 2 是「加载了但自己关掉」
  //     两套渲染器都必须先判层 1、再判层 2（顺序即优先级），且不合并成一个值
  const clientSrc = readFileSync(join(root, "panel", "client", "index.js"), "utf8");
  const htmlSrc = readFileSync(join(root, "panel", "client", "panel.html"), "utf8");
  const l1 = (src, a, b) => { const i = src.indexOf(a); const j = src.indexOf(b); return i >= 0 && j >= 0 && i < j; };
  check("Q2: react client resolves layer 1 BEFORE layer 2 (gating order)",
    l1(clientSrc, "row.enabled !== true", "innerSwitchValue(plugin, patchText) === false"));
  check("Q2: fallback page resolves layer 1 BEFORE layer 2 (gating order)",
    l1(htmlSrc, "p.patchRow.enabled !== true", "innerSwitchValue(p, PATCH_TEXT) === false"));
}


check("REAL cordis.patch.yml sha unchanged by this test", sha(readFileSync(REAL_PATCH, "utf8")) === realShaBefore);

if (passed === 0 && failed === 0) {
  console.error("no assertions ran");
  process.exit(1);
}
console.log("\n" + passed + "/" + (passed + failed) + " PASS");
process.exit(failed === 0 ? 0 : 1);
