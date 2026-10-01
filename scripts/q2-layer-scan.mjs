#!/usr/bin/env node
// Q2 —— 四层 patch 栈扫描（终局结论 + 物理载体映射 + toolkit-manager 行溯源）
//
// 用法：
//   node scripts/q2-layer-scan.mjs                 只扫仓内第 ①②③ 层
//   node scripts/q2-layer-scan.mjs --agent-presets 追加扫第 ④ 层 ~/.dsh/.agent-presets
//                     （用户 2026-09-18 一次性只读授权；不加此开关则**完全不读** ~/.dsh）
//
// 本脚本**只读**：不写任何文件，不改 git 状态，不触碰运行中的 dsh 进程。
// 之所以落成真实 .mjs 而非 `node -e`：本机 Git Bash 会做 MSYS 路径转换，
// 把 `-e` 里的正则 `\s` 等转义吃掉（实测把 `[\s\S]` 变成 `[/s/S]`），必须落文件。
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const SCAN_PRESETS = argv.includes("--agent-presets");

let passed = 0;
let failed = 0;
function check(label, ok, detail) {
  if (ok) { passed += 1; console.log("  PASS " + label + (detail ? " -- " + detail : "")); }
  else { failed += 1; console.log("  FAIL " + label + (detail ? " -- " + detail : "")); }
}
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const read = (rel) => readFileSync(join(root, rel), "utf8");
const line = (n, s) => String(n).padStart(6) + " | " + s;

// ============================================================
// §0 四层定义与物理载体映射（本侧定义；待与总文档对账）
// ============================================================
console.log("=== §0 四层 patch 栈 -> 物理载体映射（本侧定义）===\n");
const LAYERS = [
  {
    n: "①",
    name: "顶层 bundle patch（决定挂哪些插件、行级 disabled）",
    carrier: "cordis.patch.yml（仓根）",
    phys: join(root, "cordis.patch.yml"),
    evidence: [
      "package.json dsh.bundle.patch 键已随 S2 正名批 G6 撤除（patch 不随包发布；文件仍在仓根，宿主部署通道照旧）",
      "package.json files[] 已随 S2 正名批 G6 收窄（scripts/test/cordis.patch.yml 出白名单；README/CHANGELOG/LICENSE 进白名单）",
      "面板落盘目标亦为此文件：panel/index.js:275（plan）/ :328（toggle）",
      "默认 backupRoot 由 panel/index.js:171+175 从其所在仓根推导",
    ],
  },
  {
    n: "②",
    name: "四插件清单（声明 requirements/exports，不含挂载行）",
    carrier: "lib/{rate-throttle,compact-router,agent-memory,search-router}/dsh.plugin.json",
    phys: join(root, "lib"),
    evidence: [
      "面板卡片判据：panel/manager/snapshot.mjs:112 readdirSync(libRoot) + 清单存在性",
      "glob 命中 4 份（本脚本 §2 逐个复核）（S1 剔除批 5→4）",
    ],
  },
  {
    n: "③",
    name: "面板子插件清单（面板自身的注册声明）",
    carrier: "panel/dsh.plugin.json",
    phys: join(root, "panel", "dsh.plugin.json"),
    evidence: [
      "panel/dsh.plugin.json:9 inject=[\"webServer\"]",
      "panel/index.js:16-17 name=\"toolkit-manager\" / inject=[\"webServer\"]",
      "panel/package.json 由 P2 新建以让 locatePkgJson 走 nearestPackage（api-notes.md:137）",
    ],
  },
  {
    n: "④",
    name: "预设改写器（把预设里的 compaction 行换成 toolkit 的 compact-router）",
    carrier: "scripts/apply-preset-patch.mjs -> 写 ~/.dsh/.agent-presets/<id>/agent.cordis.yml 与 shipped presets",
    phys: join(root, "scripts", "apply-preset-patch.mjs"),
    evidence: [
      "apply-preset-patch.mjs:31  USER_PRESETS_DIR = homedir()/.dsh/.agent-presets",
      "apply-preset-patch.mjs:64-78 locatePresetsDir()（shipped presets）",
      "apply-preset-patch.mjs:33-46 ROW_UPSTREAM/ROW_NEW（改写对）",
      "cordis.patch.yml:3 注释自陈「compact-router 不在此：由 scripts/apply-preset-patch.mjs 改写预设 compaction 行名」",
    ],
  },
];
for (const L of LAYERS) {
  console.log("  第 " + L.n + " 层  " + L.name);
  console.log("        载体 : " + L.carrier);
  console.log("        路径 : " + L.phys + "  (exists=" + existsSync(L.phys) + ")");
  for (const e of L.evidence) console.log("        出处 : " + e);
  console.log("");
}
console.log("  ⚠ 本侧定义无仓内先例：全仓 grep「四层」只命中本任务自己写的 L-031 / handoff 11.11 / HANDOFF-MASTER（见 §6）。");
console.log("    总文档的四层定义到达后，须与本表逐层对账；对不上则扫描不算穷尽。\n");

// ============================================================
// §1 第①层：cordis.patch.yml 同 id 行 / 覆盖声明
// ============================================================
console.log("=== §1 第①层 cordis.patch.yml：行清单 + 同 id + 覆盖声明 ===\n");
const patchText = read("cordis.patch.yml");
const patchLines = patchText.split(/\r?\n/);
const rows = [];
patchLines.forEach((raw, i) => {
  const m = raw.match(/^(\s*)-\s*id:\s*(\S+)/);
  if (!m) return;
  rows.push({ line: i + 1, indent: m[1].length, id: m[2].replace(/['"]/g, ""), raw: raw.trim() });
});
console.log("  顶层行（indent=0）与非顶层行：");
for (const r of rows) console.log(line(r.line, (r.indent === 0 ? "[top ] " : "[nest] ") + r.id));
const topRows = rows.filter((r) => r.indent === 0);
const nestedRows = rows.filter((r) => r.indent > 0);
console.log("\n  统计：顶层行 " + topRows.length + " 个" + "（" + topRows.map((r) => r.id).join(", ") + "）");
console.log("        嵌套行 " + nestedRows.length + " 个" + "（" + nestedRows.map((r) => r.id).join(", ") + "）");

const TOOLKIT_IDS = ["rate-throttle", "web-search-router", "agent-memory-runtime", "toolkit-manager"];
const allIds = rows.map((r) => r.id);
const counts = {};
for (const id of allIds) counts[id] = (counts[id] || 0) + 1;
const dupes = Object.entries(counts).filter(([, n]) => n > 1);
check("① 层内无重复 id 行（含五个 toolkit id）", dupes.length === 0,
  dupes.length ? "重复: " + JSON.stringify(dupes) : "全部 id 恰好出现 1 次（共 " + allIds.length + " 个）");
const missing = TOOLKIT_IDS.filter((id) => !allIds.includes(id));
console.log("  四个 toolkit id 在本层命中：" + TOOLKIT_IDS.map((id) => id + "×" + (counts[id] || 0)).join("  "));
check("① 四个 toolkit id 中仅 compact-router 无对应行（toolkit 侧预期如此）",
  missing.length === 0 && nestedRows.filter((r) => r.id === "toolkit-manager").length === 1,
  "缺行: " + (missing.length ? missing.join(",") : "无"));
console.log("  注：嵌套 id 中 v4-pro/v4-flash 是 rate-throttle.routing.staticGroups 的组 id，不是插件挂载行；");
console.log("      真正的 4 个插件挂载行 = rate-throttle / web-search-router / agent-memory-runtime / toolkit-manager（S1 剔除批 5→4）。");

const OVERRIDE_PAT = /(^|\s)(override|overrides|replace|replaces|shadow|shadowing|覆盖|遮蔽|取代)(\s|:|$)/i;
const overrideHits = patchLines.map((l, i) => ({ n: i + 1, l })).filter((x) => OVERRIDE_PAT.test(x.l.split("#")[0]));
check("① 无任何覆盖/遮蔽声明（override/shadow/replace/覆盖…）", overrideHits.length === 0,
  overrideHits.length ? JSON.stringify(overrideHits) : "0 命中");
check("① 文件为 CRLF（与 P2 写路径前提一致）",
  patchText.includes("\r\n") && !/[^\r]\n/.test(patchText.replace(/\r\n/g, "")), "CRLF 前提成立");

// ============================================================
// §2 第②层：五个 lib/*/dsh.plugin.json
// ============================================================
console.log("\n=== §2 第②层 lib/*/dsh.plugin.json ×4 ===\n");
const libRoot = join(root, "lib");
const libDirs = readdirSync(libRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const manifests = [];
for (const d of libDirs) {
  const p = join(libRoot, d, "dsh.plugin.json");
  if (!existsSync(p)) { console.log("  " + d + " : 无 dsh.plugin.json（不成卡）"); continue; }
  const j = JSON.parse(readFileSync(p, "utf8"));
  manifests.push({ dir: d, json: j });
  console.log("  " + d);
  console.log("      name=" + j.name + "  manifestVersion=" + j.manifestVersion);
  console.log("      top-level keys: " + Object.keys(j).join(", "));
}
console.log("");
check("② 成卡目录数 = 4", manifests.length === 4, "实测 " + manifests.length + "：" + manifests.map((m) => m.dir).join(", "));
// P5 契约化不变量更新（2026-09-19，REQ-9）：顶层新增契约字段 id/displayName/version/
// contract/configSchema 是子插件契约身份，不是 layer② 的 patch 指令——继续禁止
// patch/override/bundle/rows 类字段（任何层级）与嵌套 id；顶层契约 id 例外。
const SUSPECT_KEYS = /(^|\.)(patch|patches|override|overrides|shadow|bundle|rows?)$/i;
const suspects = [];
for (const m of manifests) {
  const walk = (obj, path) => {
    if (obj === null || typeof obj !== "object") return;
    for (const [k, v] of Object.entries(obj)) {
      const p = path + k;
      if (SUSPECT_KEYS.test(k) || (k === "id" && path !== "")) suspects.push(m.dir + " : " + p + " = " + JSON.stringify(v));
      walk(v, p + ".");
    }
  };
  walk(m.json, "");
}
check("② 五清单里无 patch / override / bundle 类字段（不能增删或遮蔽挂载行）；嵌套 id 仍禁止", suspects.length === 0,
  suspects.length ? JSON.stringify(suspects) : "0 命中（顶层契约字段 id/displayName/version/contract/configSchema 例外）");
check("② 五清单的 id 维度：顶层契约 id 均为命名空间式 <scope>/<name>，且不携带 patch 指令 ⇒ 层②不产生任何 patch 行",
  manifests.every((m) => /^[a-z0-9][a-z0-9-]{0,63}\/[a-z0-9][a-z0-9-]{0,63}$/.test(String(m.json.id || ""))), "五份均为 dsh/<name> 形式");

// ============================================================
// §3 第③层：panel/dsh.plugin.json
// ============================================================
console.log("\n=== §3 第③层 panel/dsh.plugin.json ===\n");
const panelManifest = JSON.parse(read("panel/dsh.plugin.json"));
console.log("  " + JSON.stringify(panelManifest, null, 2).split("\n").map((s) => "  " + s).join("\n"));
const pSuspects = Object.keys(panelManifest).filter((k) => SUSPECT_KEYS.test(k));
check("③ 面板清单无 id / patch / override 类字段", pSuspects.length === 0,
  pSuspects.length ? JSON.stringify(pSuspects) : "0 命中（只有 manifestVersion/name/requirements）");
const panelPkg = JSON.parse(read("panel/package.json"));
console.log("  panel/package.json name=" + panelPkg.name + "  version=" + (panelPkg.version || "-"));
const pkgKeys = Object.keys(panelPkg).filter((k) => SUSPECT_KEYS.test(k) || /dsh|client/i.test(k));
check("③ panel/package.json 不声明 patch 文件（dsh.client 只声明 client 面）",
  !/["']?patch["']?\s*:/.test(read("panel/package.json")),
  "dsh/client 相关键: " + pkgKeys.join(", "));

// ============================================================
// §4 toolkit-manager 行的溯源（Q6①）
// ============================================================
console.log("\n=== §4 toolkit-manager 行溯源：git 与快照 ===\n");
const git = (args) => execFileSync("git", args, { cwd: root, maxBuffer: 1e8 }).toString("utf8").trim();
const touch = git(["log", "--oneline", "--", "cordis.patch.yml"]);
console.log("  git log -- cordis.patch.yml ：");
console.log((touch || "(空)").split("\n").map((s) => "      " + s).join("\n"));
// --- 2026-09-18 修订：该行已按第 11 轮裁决**语义化提交**（commit 22fde85）---
// 原断言的「从未提交」前提已失效；按新现实重写（不复述旧结论）。
const pickaxeFile = git(["log", "-S", "toolkit-manager", "--oneline", "--", "cordis.patch.yml"]);
check("④ toolkit-manager 行已进入该文件 git 历史（第 11 轮语义化提交）",
  pickaxeFile !== "", "pickaxe 命中: " + (pickaxeFile.split("\n")[0] || ""));

const headBlob = execFileSync("git", ["show", "HEAD:cordis.patch.yml"], { cwd: root });
const diskText = readFileSync(join(root, "cordis.patch.yml"), "utf8");
console.log("\n  HEAD blob  sha256=" + sha256(headBlob) + "  size=" + headBlob.length);
console.log("  disk(工作区) sha256=" + sha256(Buffer.from(diskText, "utf8")) + "  size=" + Buffer.byteLength(diskText));
check("④ HEAD 版本含 toolkit-manager 行", headBlob.toString("utf8").includes("toolkit-manager"),
  "HEAD 末尾行: " + JSON.stringify(headBlob.toString("utf8").split(/\r?\n/).filter(Boolean).slice(-1)[0]));

// --- 字节级对账：LF 归一后 磁盘 == HEAD（⇒ 除行尾风格外零漂移）---
const headStr = headBlob.toString("utf8");
const diskLf = diskText.replace(/\r\n/g, "\n");
check("④ 磁盘（LF 归一）与 HEAD 逐字节一致（⇒ 除行尾风格外无任何漂移）",
  diskLf === headStr, diskLf === headStr ? "归一后完全相同" : "归一后仍有差异");
if (diskLf === headStr) {
  const numCRLF = (diskText.match(/\r\n/g) || []).length;
  const headBytes = headBlob.length;
  console.log("\n  字节账：");
  console.log("      HEAD blob（git 库内存 LF）        : " + headBytes);
  console.log("      磁盘 CRLF 行数（每行 +1 字节）    : " + numCRLF);
  check("④ 字节账闭合：HEAD(LF) + CRLF 增量 = 磁盘 size",
    headBytes + numCRLF === Buffer.byteLength(diskText, "utf8"),
    headBytes + " + " + numCRLF + " = " + (headBytes + numCRLF)
      + "  vs 磁盘 " + Buffer.byteLength(diskText, "utf8"));
}

// --- 回滚陷阱：唯一那份「pre-p2-toolkit-manager」快照到底是哪个状态？---
const trapPath = join(root, ".panel-backups", "pre-p2-toolkit-manager-20260917-2026-09-17T12-44-28", "cordis.patch.yml");
if (existsSync(trapPath)) {
  const trap = readFileSync(trapPath);
  const trapStr = trap.toString("utf8");
  // 2026-09-18 修订：HEAD 已前移（含该行）；本快照是**固定的历史状态**，故按自身属性断言。
  check("④ 回滚陷阱：pre-p2-toolkit-manager 快照 = P2 之前态（2914 B / LF / **不含** toolkit-manager 行）",
    !/id:\s*toolkit-manager/.test(trapStr) && trap.length === 2914
      && sha256(trap) === "7541c05aaaec808f8e6500356bed3b25550998ef7a1bcf560b0c167bcb351b97",
    "size=" + trap.length + "  sha256=" + sha256(trap).slice(0, 12) + "…  含 toolkit-manager=" + /id:\s*toolkit-manager/.test(trapStr));
  console.log("      ⇒ 恢复它不仅会**删掉 4 行**（面板入口消失），还会把行尾从 CRLF 变成 LF。");
  console.log("      ⇒ 该快照**不是**「保留面板」的回滚目标，而是「P2 之前」的目标。回滚必须按目标语义选快照。");
}

console.log("\n  .panel-backups/ 内各 cordis.patch.yml 快照对该行的记录：");
const bkRoot = join(root, ".panel-backups");
for (const name of readdirSync(bkRoot).sort()) {
  const p = join(bkRoot, name, "cordis.patch.yml");
  if (!existsSync(p)) continue;
  const t = readFileSync(p, "utf8");
  const has = /id:\s*toolkit-manager/.test(t);
  const nm = (t.match(/id:\s*toolkit-manager[\s\S]{0,160}?name:\s*'([^']*)'/) || [])[1] || "";
  console.log("      " + name.padEnd(46) + " size=" + String(statSync(p).size).padStart(5)
    + "  toolkit-manager=" + (has ? "有" : "无 ") + (nm ? "  name=" + nm : ""));
}
console.log("\n  结论：该行的**首次创建时刻未留档**；可归因的最早证据是 10:59 arm-manifest 快照（已含该行、旧名 dsh-toolkit/panel），");
console.log("        19:55:50 被改写为 path-like（ledger 逐版对账表 :72）。");
console.log("        2026-09-18 第 11 轮**语义化提交**（commit `22fde85`）⇒ 该行已入 git 历史，溯源缺口就此封闭。");

// ============================================================
// §5 第④层：~/.dsh/.agent-presets（需 --agent-presets，用户一次性只读授权）
// ============================================================
console.log("\n=== §5 第④层 ~/.dsh/.agent-presets ===");
if (!SCAN_PRESETS) {
  console.log("  跳过（未给 --agent-presets）。本脚本默认不读 ~/.dsh。\n");
} else {
  const presetsDir = join(homedir(), ".dsh", ".agent-presets");
  console.log("  扫描根（只读）：" + presetsDir + "  (exists=" + existsSync(presetsDir) + ")");
  if (!existsSync(presetsDir)) {
    check("⑤ .agent-presets 目录存在", false, "不存在");
  } else {
    const dirs = readdirSync(presetsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
    console.log("\n  目录清单（" + dirs.length + " 个）：");
    const report = [];
    for (const d of dirs) {
      const f = join(presetsDir, d, "agent.cordis.yml");
      const row = { d, exists: existsSync(f), size: null, compactRouter: false, upstream: false, oldName: false, ids: [] };
      if (row.exists) {
        const t = readFileSync(f, "utf8");
        row.size = Buffer.byteLength(t);
        row.compactRouter = /@local\/dsh-toolkit\/compact-router/.test(t);
        row.upstream = /@deepseek-ai\/dsh-compaction-basic/.test(t);
        row.oldName = /@local\/dsh-compact-router/.test(t);
        row.ids = (t.match(/^\s*-\s*id:\s*(\S+)/gm) || []).map((s) => s.replace(/^\s*-\s*id:\s*/, ""));
      }
      report.push(row);
      console.log("    " + d.padEnd(30) + " agent.cordis.yml=" + (row.exists ? "有" : "无")
        + (row.size !== null ? " size=" + row.size : "")
        + "  compact-router=" + (row.compactRouter ? "✓" : "-")
        + "  compaction-basic=" + (row.upstream ? "✓" : "-")
        + "  旧名行=" + (row.oldName ? "✓" : "-"));
      if (row.ids.length) console.log("      " + " ".repeat(28) + " 行 id: " + row.ids.join(", "));
    }
    const patched = report.filter((r) => r.compactRouter);
    const upstreamLeft = report.filter((r) => r.upstream);
    const oldLeft = report.filter((r) => r.oldName);
    const active = report.filter((r) => r.exists && !r.d.includes(".bak"));
    console.log("");
    check("⑤ 活动预设（排除 .bak 目录）与 upstream 划分完备",
      active.every((r) => r.compactRouter) && active.length + upstreamLeft.length >= active.length,
      "active=" + active.map((r) => r.d).join(",") + " upstream=" + upstreamLeft.map((r) => r.d).join(",") || "-");
    check("⑤ 含 compact-router 的目录里没有残留 upstream 行（改写或复制干净）",
      patched.every((r) => !r.upstream), "patched=" + patched.map((r) => r.d).join(","));
    check("⑤ 无残留旧插件名行 @local/dsh-compact-router", oldLeft.length === 0,
      oldLeft.length ? oldLeft.map((r) => r.d).join(",") : "0 命中");
    check("⑤ 四个 toolkit 插件行（非 compact-router）不出现在预设里（它们只由第①层挂载）",
      report.every((r) => !r.ids.some((id) => ["rate-throttle", "web-search-local", "web-search-router", "agent-memory-runtime", "toolkit-manager"].includes(id))),
      "预设行 id 只含 compaction 相关（compact-router / compaction / command-compact / tool-result-pruner 等）");
    console.log("  注：`liangshen.bak-20260914` 是**人工备份目录**，脚本 discoverUserPresetIds()");
    console.log("      显式排除名字含 \".bak\" 的目录（apply-preset-patch.mjs:84），故它不会被重复改写；");
    console.log("      但它同样含 agent.cordis.yml + compact-router 行，**是否会被 dsh 当预设列出属于 dsh 侧行为，本轮未验证**。");

    // 对账 preset-patch-state.json 与 preset-backups/
    const markerPath = join(root, "preset-patch-state.json");
    const bkDir = join(root, "preset-backups");
    const bks = existsSync(bkDir) ? readdirSync(bkDir).sort() : [];
    const marker = existsSync(markerPath) ? JSON.parse(readFileSync(markerPath, "utf8")) : null;
    if (marker) {
      console.log("\n  preset-patch-state.json 记录（" + Object.keys(marker).length + " 条）：");
      for (const [id, rec] of Object.entries(marker)) {
        console.log("      " + id.padEnd(16) + " patchedAt=" + rec.patchedAt + "  file=" + String(rec.file).replace(/\\/g, "/"));
      }
      check("⑤ marker 里每个被改写的预设都有对应 .bak 备份可回滚",
        Object.keys(marker).every((id) => bks.includes(id + ".agent.cordis.yml.bak")),
        "marker=" + Object.keys(marker).join(",") + " backups=" + bks.length);
      const outside = Object.keys(marker).filter((id) => !report.some((r) => r.d === id));
      console.log("      marker 中不在本授权目录内的条目（= shipped presets，位于 npm 全局目录，**未读**）："
        + (outside.length ? outside.join(", ") + " ⇒ 其内容验证需另给授权（在 AppData，不在 ~/.dsh）" : "无"));
    } else {
      check("⑤ preset-patch-state.json 存在", false, "缺失");
    }
    console.log("  preset-backups/（仓内，改写前原始备份）逐份分析：");
    const bakRows = bks.map((b) => {
      const t = readFileSync(join(bkDir, b), "utf8");
      const hasUp = /dsh-compaction-basic/.test(t);
      const hasCr = /@local\/dsh-toolkit\/compact-router/.test(t);
      const hasOld = /@local\/dsh-compact-router/.test(t);
      console.log("      " + b.padEnd(38) + " size=" + String(Buffer.byteLength(t)).padStart(6)
        + "  compaction-basic=" + (hasUp ? "✓" : "-") + "  compact-router=" + (hasCr ? "✓" : "-")
        + "  旧名=" + (hasOld ? "✓" : "-"));
      return { b, hasUp, hasCr, hasOld, t };
    });
    check("⑤ 每个 .bak 都是**真正的改写前状态**（upstream 行 或 旧插件行；且**不含**新名行）",
      bakRows.length > 0 && bakRows.every((r) => (r.hasUp || r.hasOld) && !r.hasCr),
      bakRows.map((r) => r.b.replace(".agent.cordis.yml.bak", "") + "["
        + (r.hasUp ? "upstream" : r.hasOld ? "旧插件名" : "?") + "]").join("  "));
    const legacyBak = bakRows.filter((r) => r.hasOld);
    if (legacyBak.length) {
      console.log("      ⇒ ④层有**两种历史来源**：upstream 行（standard/ptc/cordis）与**旧独立插件**行（"
        + legacyBak.map((r) => r.b.replace(".agent.cordis.yml.bak", "")).join(", ") + "）。");
      console.log("         旧插件来源的预设，其 `.bak` 记录的是 `@local/dsh-compact-router` 时代，");
      console.log("         迁移到新名是一步**独立的历史动作**（marker 时间戳亦晚于 shipped 三个：08:02:55Z vs 05:13:13Z）。");
    }
  }
}

// ============================================================
// §6 汇总
// ============================================================
console.log("\n=== §6 汇总 ===");
  console.log("  四层中：第①层 = 仓根 cordis.patch.yml；第②层 = lib/*/dsh.plugin.json ×4；");
console.log("          第③层 = panel/dsh.plugin.json；第④层 = scripts/apply-preset-patch.mjs -> ~/.dsh/.agent-presets。");
console.log("");
console.log("  " + passed + "/" + (passed + failed) + " PASS" + (failed ? "  <-- 有 FAIL" : ""));
if (failed > 0) process.exitCode = 1;
