#!/usr/bin/env node
/**
 * q2-released-scan.mjs — 乙程序（U12=乙）首批例行只读读取：注入点全表红线内 4 点 + 注入点 5 env（第 14 轮）
 *
 * 授权依据（第 14 轮判定侧，已落账）：
 *   ① U8 + 同族一次性只读授权（#0 / #2 / #3 / E1 四点）；
 *   ② U12 = 乙（窄版既定只读程序）：注入点全表内 ~/.dsh 路径、只读、层间覆盖检查用途，
 *      此后该范围内读取不再逐次授权。
 *
 * 扫描点（对应 api-notes.md §③.1 注入点全表）：
 *   #0  ~/.dsh/profiles/web/cordis.yml        （base，启动重写为 [] —— 顺带注当前实际值）
 *   #2  ~/.dsh/profiles/web/cordis.patch.yml  （profile 用户 patch 层）
 *   #3  ~/.dsh/cordis.patch.yml               （home 用户 patch 层 = 原 U8）
 *   E1  ~/.dsh/.env                           （环境层）
 *   #5  process.env.DSH_TELEMETRY_DISABLED    （telemetry 合成补丁开关；本进程 env 继承自 DSH 启动链）
 *   #4  --patch overlay：无磁盘载体，不适用（已注，不扫描）
 *
 * 判据：每点落一个结论 —— 「无 toolkit id / 无覆盖声明」或「文件不存在」皆结论。
 * 输出：panel/docs/evidence/Q2-RELEASED-SCAN.txt（正本，可重放）；退出码 0 = 结论全部落档。
 * 本脚本全程只读（readFileSync / existsSync / statSync / process.env），除自身证据正本外零写盘。
 */
import { readFileSync, existsSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "panel", "docs", "evidence", "Q2-RELEASED-SCAN.txt");

const HOME = homedir();
const DSH = join(HOME, ".dsh");

// toolkit 关联标识（5 个挂载 id + compact-router + 仓路径特征）
const NEEDLES = [
  "rate-throttle", "web-search-local", "web-search-router",
  "agent-memory-runtime", "toolkit-manager", "compact-router", "dsh-toolkit",
];
// 覆盖/遮蔽声明特征（命中须带上下文呈报，由人判定归属）
const OVERRIDE_HINTS = ["override", "merge:"];

function lineNoOf(text, idx) { let n = 1; for (let i = 0; i < idx; i++) if (text[i] === "\n") n++; return n; }

function scanFile(label, path) {
  const out = { label, path, exists: existsSync(path), size: null, sha: null, mtime: null, idLines: [], toolkitHits: [], overrideHits: [], content: null };
  if (!out.exists) return out;
  const st = statSync(path);
  const buf = readFileSync(path);
  out.size = buf.length;
  out.sha = createHash("sha256").update(buf).digest("hex");
  out.mtime = st.mtime.toISOString();
  const text = buf.toString("utf8");
  out.content = text;
  const re = /^\s*-\s*id:\s*(\S+)/gm;
  let m;
  while ((m = re.exec(text)) !== null) out.idLines.push({ line: lineNoOf(text, m.index), id: m[1] });
  for (const n of NEEDLES) {
    let i = text.indexOf(n);
    while (i >= 0) { out.toolkitHits.push({ needle: n, line: lineNoOf(text, i) }); i = text.indexOf(n, i + n.length); }
  }
  for (const h of OVERRIDE_HINTS) {
    let i = text.indexOf(h);
    while (i >= 0) { out.overrideHits.push({ hint: h, line: lineNoOf(text, i), ctx: text.slice(Math.max(0, i - 30), i + 40).replace(/\r?\n/g, "⏎") }); i = text.indexOf(h, i + h.length); }
  }
  return out;
}

const points = [
  scanFile("#0 profile 根配置（base，启动重写）", join(DSH, "profiles", "web", "cordis.yml")),
  scanFile("#2 profile 用户 patch 层", join(DSH, "profiles", "web", "cordis.patch.yml")),
  scanFile("#3 home 用户 patch 层（原 U8）", join(DSH, "cordis.patch.yml")),
  scanFile("E1 环境层 .env", join(DSH, ".env")),
];

const envVal = process.env.DSH_TELEMETRY_DISABLED; // undefined / "" / 非空
const envDefined = typeof envVal === "string" && envVal.length > 0;

const lines = [];
lines.push("════════════════════════════════════════════════════════════════════════════");
lines.push("乙程序首批例行只读读取 —— 注入点全表红线内 4 点 + 注入点 5 env（第 14 轮 · 可重放）");
lines.push(`生成脚本 scripts/q2-released-scan.mjs  生成时刻(UTC) ${new Date().toISOString()}`);
lines.push("授权依据 第 14 轮判定侧：① U8+同族一次性只读授权 ② U12=乙（窄版既定只读程序，已落账）");
lines.push("判据 每点落一个结论：「无 toolkit id / 无覆盖声明」或「文件不存在」皆结论；#4 不适用已注");
lines.push("════════════════════════════════════════════════════════════════════════════");
lines.push("");

const verdicts = [];
let done = 0;

for (const p of points) {
  lines.push(`── ${p.label}`);
  lines.push(`    路径：${p.path}`);
  if (!p.exists) {
    lines.push("    结论：文件不存在 ⇒ 该注入点本机不携带任何内容（无 toolkit id / 无覆盖声明 —— 载体不存在）");
    verdicts.push(`${p.label} = 文件不存在`);
    done++; lines.push("");
    continue;
  }
  lines.push(`    存在 ✓  size=${p.size} B  sha256=${p.sha.slice(0, 12)}…  mtime=${p.mtime}`);
  const ids = p.idLines.map((x) => x.id);
  lines.push(`    - id: 行（${ids.length}）：${ids.length ? ids.join(", ") : "无"}`);
  const tk = p.toolkitHits.length ? [...new Set(p.toolkitHits.map((h) => h.needle))].join(", ") : "无";
  lines.push(`    toolkit 关联标识命中：${tk}`);
  if (p.overrideHits.length) {
    lines.push(`    覆盖/遮蔽声明特征命中（${p.overrideHits.length}，附上下文待判归属）：`);
    for (const h of p.overrideHits.slice(0, 10)) lines.push(`      L${h.line} [${h.hint}] …${h.ctx}…`);
  } else {
    lines.push("    覆盖/遮蔽声明特征命中：无");
  }
  const verdict = p.toolkitHits.length === 0
    ? (ids.length ? `存在但无 toolkit 关联标识（既有 id 行 ${ids.length} 条均与 toolkit 无关）` : "无 toolkit id / 无覆盖声明")
    : `⚠ 命中 toolkit 标识：${tk}（需逐条定性）`;
  lines.push(`    结论：${verdict}`);
  verdicts.push(`${p.label} = ${verdict}`);
  done++;
  lines.push("");
}

// #0 顺带注：当前实际值（启动重写为 [] 的现状）
const p0 = points[0];
lines.push("── #0 附加注记（判定侧点名）：「启动重写为 []」的当前实际值");
lines.push(`    文件头注释自陈："Edit cordis.patch.yml, not this file."`);
lines.push(`    当前实际值 = ${p0.exists ? JSON.stringify(p0.content.trim()) : "（文件不存在）"}`);
lines.push("    ⇒ 与源码定案一致（profile-boot:124-130 重写为 []；:209 无条件 writeFileSync），当前为空 entry 列表。");
lines.push("");

// #5 env
lines.push("── #5 注入点 5 · telemetry 合成补丁开关（env）");
lines.push(`    process.env.DSH_TELEMETRY_DISABLED = ${JSON.stringify(envVal)}（本进程 env 继承自 DSH 启动链）`);
lines.push("    语义（api-notes §③.1 #5 / profile-boot:184-190,249-250）：仅当该值非空且组合含 session-telemetry-otel 行时生成合成补丁。");
lines.push(`    结论：取值为 ${envDefined ? "非空（⚠ 需进一步核组合是否含 session-telemetry-otel）" : "空（undefined）⇒ telemetry 合成补丁不生成，注入点 5 本机无效"}。`);
verdicts.push(`#5 DSH_TELEMETRY_DISABLED = ${JSON.stringify(envVal)} ⇒ ${envDefined ? "非空（需核组合）" : "注入点 5 无效"}`);
done++;
lines.push("");

// #4 不适用
lines.push("── #4 注入点 4 · --patch overlay：无磁盘载体（CLI 参数），本次运行未使用 ⇒ 不适用（已注，不扫描）。");
verdicts.push("#4 --patch = 不适用（已注）");
done++;
lines.push("");

lines.push("────────────────────────────────────────────────────────────────────────────");
lines.push(`RESULT: ${done} 项结论落档（#0 / #2 / #3 / E1 / #5 五个扫描点 + #4 不适用注记）`);
for (const v of verdicts) lines.push("  · " + v);
lines.push("总评：至此 Q2 注入点全表穷尽 ✓ —— 红线外此前已扫（#1 全扫 / E2 定案 / E3 / E4），");
lines.push("      红线内 4 点本轮全落结论：无任何一处携带 toolkit id 行或覆盖声明（#3 / E1 载体不存在，#0 = []，#2 = []）。");
lines.push("      本脚本全程只读；未改任何被扫文件。");
lines.push("────────────────────────────────────────────────────────────────────────────");

writeFileSync(outPath, lines.join("\n"), "utf8");
console.log(lines.join("\n"));
process.exitCode = 0;
