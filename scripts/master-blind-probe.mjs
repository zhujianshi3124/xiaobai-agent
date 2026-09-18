#!/usr/bin/env node
/**
 * master-blind-probe.mjs — 判定侧盲抽 8 句 · 逐字 substring 检索（第 13 轮）
 *
 * 目的：代偿「自选探针偏选」风险 —— 38/38 保真探针是本侧自选的；本轮 8 句由**判定侧指定**，
 *       本侧只做检索与上下文呈报，**不挑选、不加权、不解释未命中**。
 *
 * 用法：node scripts/master-blind-probe.mjs
 * 输出：panel/docs/evidence/MASTER-BLIND-PROBE-8.txt（正本，可重放）+ stdout 摘要
 * 退出码：8/8 命中 = 0；任一未命中 = 1（未命中如实回报，不掩盖、不改写目标文件）。
 *
 * 注：第 2 句判定侧原文有笔误「profile 局」，已按判定侧指示**以落盘为准**修正为「profile 层」再检索。
 *     引号类未命中时，自动尝试等价变体（弯引号↔直引号↔「」），命中即**如实标注为变体命中**。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const targetPath = join(root, "panel", "docs", "HANDOFF-MASTER.md");
const outPath = join(root, "panel", "docs", "evidence", "MASTER-BLIND-PROBE-8.txt");

const text = readFileSync(targetPath, "utf8");

// —— 判定侧第 13 轮指定 8 句（逐字） ——
const PROBES = [
  { id: "P1", zone: "开头段（原文头部两行引用块）", probe: `本文档是四份正本之上的“总索引 + 项目史 + 判定记录”，新会话先读本文，再按索引读细节。` },
  { id: "P2", zone: "§三列表归一区", probe: `四层 patch 栈：bundle 层（启动时固化）→ profile 层 → home 层 → overlay，同 id 后者覆盖前者`, note: "判定侧笔误「profile 局」已按指示以落盘为准修正为「profile 层」" },
  { id: "P3", zone: "§三列表归一区", probe: `全路由 guard = socket loopback AND（Host loopback OR 配对校验）` },
  { id: "P4", zone: "§三列表归一区", probe: `错误码：sha-conflict/plan-expired/anchor-ambiguous→409。` },
  { id: "P5", zone: "§六普通区", probe: `每阶段验证 = p1-smoke + 该阶段专项（如 p21-verify）+ doctor dry-run 0/0/0 + pluggable-lint。` },
  { id: "P6", zone: "§九普通区", probe: `用户一句话可推翻技术决定（如“不自启”“名字改回来”），照办并记录，不劝阻第二次。` },
  { id: "P7", zone: "§二表格重建区", probe: `DSH 平台 API 事实清单（带源码行号）+ 三次“源码转述被实测推翻”教训` },
  { id: "P8", zone: "§八分号特例区", probe: `taskkill 三连败（管道 bug → conhost Access Denied → 0x0401 掩码）；备份同名覆盖假警报` },
];

const CURLY_L = "\u201C", CURLY_R = "\u201D", STRAIGHT = '"', CORNER_L = "「", CORNER_R = "」";

// 未命中时的等价变体（只作用于引号字符；命中变体将如实标注，不算逐字命中）
function variants(p) {
  const list = [];
  const sub = (s, a, b) => s.split(a).join(b);
  if (p.includes(CURLY_L) || p.includes(CURLY_R)) {
    list.push({ kind: "弯→直引号", s: sub(sub(p, CURLY_L, STRAIGHT), CURLY_R, STRAIGHT) });
    list.push({ kind: "弯→「」", s: sub(sub(p, CURLY_L, CORNER_L), CURLY_R, CORNER_R) });
  }
  if (p.includes(STRAIGHT)) {
    list.push({ kind: "直→弯引号", s: sub(sub(p, STRAIGHT, CURLY_L), STRAIGHT, CURLY_R) });
  }
  if (p.includes(CORNER_L)) {
    list.push({ kind: "「」→弯引号", s: sub(sub(p, CORNER_L, CURLY_L), CORNER_R, CURLY_R) });
  }
  return list;
}

function lineOf(idx) {
  let line = 1;
  for (let i = 0; i < idx; i++) if (text[i] === "\n") line++;
  return line;
}

const lines = [];
lines.push("════════════════════════════════════════════════════════════════════════════");
lines.push("判定侧盲抽 8 句 · 逐字 substring 检索（第 13 轮 · 可重放）");
lines.push(`目标文件 panel/docs/HANDOFF-MASTER.md`);
lines.push(`生成脚本 scripts/master-blind-probe.mjs（本输出由脚本生成，探针由判定侧指定，本侧未挑选）`);
lines.push(`生成时刻(UTC) ${new Date().toISOString()}`);
lines.push("════════════════════════════════════════════════════════════════════════════");
lines.push("");

let hits = 0;
const results = [];

for (const item of PROBES) {
  let kind = "逐字命中";
  let idx = text.indexOf(item.probe);
  let used = item.probe;
  if (idx < 0) {
    for (const v of variants(item.probe)) {
      const j = text.indexOf(v.s);
      if (j >= 0) { idx = j; used = v.s; kind = `变体命中（${v.kind}）`; break; }
    }
  }
  const pass = idx >= 0;
  if (pass) hits++;
  let lineNo = "-", left = "", right = "";
  if (pass) {
    lineNo = lineOf(idx);
    const flat = text.replace(/\r?\n/g, "⏎");
    const flatIdx = flat.indexOf(used.replace(/\r?\n/g, "⏎"));
    const s = Math.max(0, flatIdx - 20);
    left = flat.slice(s, flatIdx);
    right = flat.slice(flatIdx + used.length, flatIdx + used.length + 20);
  }
  results.push({ id: item.id, zone: item.zone, probe: item.probe, note: item.note || "", pass, kind, lineNo, left, right });
}

for (const r of results) {
  lines.push(`【${r.id}】${r.pass ? "命中" : "未命中"}（${r.kind}）  覆盖区：${r.zone}${r.note ? "  ｜ " + r.note : ""}`);
  lines.push(`  探针：${r.probe}`);
  if (r.pass) {
    lines.push(`  位置：第 ${r.lineNo} 行`);
    lines.push(`  上下文（前后各 20 字）：…${r.left}【${r.probe}】${r.right}…`);
  } else {
    lines.push(`  上下文：无（未命中；本侧未对落盘文件做任何改动来“凑命中”）`);
  }
  lines.push("");
}

lines.push("────────────────────────────────────────────────────────────────────────────");
lines.push(`RESULT: ${hits}/8 命中（逐字或引号变体；变体命中已逐条标注）`);
lines.push("说明：探针句由判定侧第 13 轮指定，覆盖 = 开头段 / §二表格重建区 / §三列表归一区 / §八分号特例区 / §六§九普通区。");
lines.push("      本侧只检索、只呈报；落盘文件在本轮检索中零改动。");
lines.push("────────────────────────────────────────────────────────────────────────────");

writeFileSync(outPath, lines.join("\n"), "utf8");
console.log(lines.join("\n"));
process.exitCode = hits === 8 ? 0 : 1;
