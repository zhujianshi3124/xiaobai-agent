// P2.4 卸载/恢复执行引擎（施工批 1）。
//
// 纪律继承（不可破坏）：
//   - cordis.patch.yml 的一切写入仍走 executePlan 唯一通道（两段式 + SHA + 锚点 + 备份）。
//   - 保管区存档/恢复、lib/<plugin> 删除、预设脚本调用是**独立受控步骤**，
//     各自带 sha 校验与 fail-closed；不在 executePlan 内混做。
//   - 真卸载存档时态 = 确认后存档（预审 #3 定案）：确认执行后、删除前存档并逐文件校验，
//     校验失败中止删除。
//   - compact-router：面板不发明新的预设写入通路，只调用既有 scripts/apply-preset-patch.mjs
//     （--undo / 默认 apply），并在调用前后做双层 sha 留痕（A2⑥）。
//   - 预设备份缺失（preset-backups/<id>.bak 不存在）⇒ fail-closed 拒绝执行（§4 授权段）。

import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import {
  locateRowAnchor,
  locateRowBlock,
  planRemoveRow,
  planInsertRow,
  planWebConfigRemove,
  planWebConfigRestore,
  locateWebConfigKey,
  locateConfigKeyLine,
  sha256Of,
  executePlan,
  putPlan,
  getPlan,
  dropPlan,
  PlanError,
  DEFAULT_PLAN_TTL_MS,
} from "./apply-engine.mjs";
import { createBackup } from "./backup.mjs";
import { PLUGINS, assertUninstallable } from "./plugin-registry.mjs";
import {
  writeDestroyReceipt,
  recordSoftUninstall,
  clearSoftRecord,
  getSoftRecord,
  listSoftRecords,
  listCustody,
  readCustodyManifest,
  recordRowAdjacency,
  listRowAdjacencies,
} from "./custody.mjs";
import { parseConfigScalars } from "./snapshot.mjs";

const PRESET_PRESETS = ["liangshen", "standard", "ptc", "cordis"];

/** 宿主键（searchProvider / fetchProvider）所在的 patch 行 id。 */
const HOST_ROW_ID = "web";

function readPatch(toolkitRoot) {
  return readFileSync(join(toolkitRoot, "cordis.patch.yml"), "utf8");
}

function presetStatePath(toolkitRoot) {
  return join(toolkitRoot, "preset-patch-state.json");
}

function readPresetState(toolkitRoot) {
  const p = presetStatePath(toolkitRoot);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function presetBridgePrecheck(toolkitRoot) {
  const state = readPresetState(toolkitRoot);
  if (!state) {
    const err = new Error("preset-patch-state.json 缺失：compact-router 预设状态未知，拒绝执行（fail-closed）");
    err.code = "preset-state-missing";
    throw err;
  }
  const missing = [];
  for (const id of PRESET_PRESETS) {
    const entry = state[id];
    const bak = entry && entry.backup;
    if (!bak || !existsSync(bak)) missing.push(id);
  }
  if (missing.length > 0) {
    const err = new Error("预设备份缺失（" + missing.join(", ") + "）：按 §4 授权段 fail-closed，不写文件");
    err.code = "preset-backup-missing";
    err.detail = missing;
    throw err;
  }
  return state;
}

/** 调用既有预设脚本（唯一授权通路），返回 stdout 摘要。 */
function runPresetScript(toolkitRoot, args) {
  const script = join(toolkitRoot, "scripts", "apply-preset-patch.mjs");
  if (!existsSync(script)) {
    const err = new Error("apply-preset-patch.mjs 不存在，拒绝执行");
    err.code = "preset-script-missing";
    throw err;
  }
  const stdout = execFileSync(process.execPath, [script, ...args], {
    cwd: toolkitRoot,
    encoding: "utf8",
    timeout: 120000,
    windowsHide: true,
  });
  return String(stdout || "");
}

function presetShas(toolkitRoot) {
  const state = readPresetState(toolkitRoot) || {};
  const out = {};
  for (const id of PRESET_PRESETS) {
    const f = state[id] && state[id].file;
    out[id] = f && existsSync(f) ? sha256Of(readFileSync(f, "utf8")) : null;
  }
  return out;
}

/** A2⑥ 双层留痕：预设回写前后 sha 记录进 .panel-write-backups 的证据文件。 */
function presetUndoEvidence(toolkitRoot, backupRoot, beforeShas, afterShas, stdoutTail) {
  const state = readPresetState(toolkitRoot) || {};
  const perPreset = {};
  for (const id of PRESET_PRESETS) {
    const bak = state[id] && state[id].backup;
    perPreset[id] = {
      beforeUndo: beforeShas[id] || null,
      afterUndo: afterShas[id] || null,
      backupSha: bak && existsSync(bak) ? sha256Of(readFileSync(bak, "utf8")) : null,
      afterUndoEqualsBak:
        afterShas[id] != null && bak && existsSync(bak) && afterShas[id] === sha256Of(readFileSync(bak, "utf8")),
    };
  }
  const backupDir = createBackup({
    backupRoot,
    files: PRESET_PRESETS.map((id) => (state[id] ? state[id].file : null)).filter(Boolean).concat([presetStatePath(toolkitRoot)]),
    reason: "panel-preset-undo",
    note: "compact-router 预设回写（--undo）双层留痕：beforeUndo/afterUndo/backupSha 逐预设记录",
  });
  writeFileSync(
    join(backupDir, "preset-undo-evidence.json"),
    JSON.stringify({ createdAt: new Date().toISOString(), presets: perPreset, stdoutTail: stdoutTail.slice(-800) }, null, 2),
    "utf8",
  );
  return { backupDir, perPreset };
}

function makeToken(kind, plugin, text, now) {
  return createHash("sha256")
    .update(kind + "|" + plugin + "|" + sha256Of(text) + "|" + now)
    .digest("hex")
    .slice(0, 32);
}

// ---------------- 宿主键原始插回位（D-UI-03） ----------------

/** 某行 config: 段的直接子键名（文件顺序）。 */
function configChildKeys(text, rowId) {
  return Object.keys(parseConfigScalars(text, rowId).top);
}

/**
 * 面板台账里**同段已摘宿主键**的留痕（软卸载账 + 保管区 manifest），按 key 去重取首条。
 * 保管区滚动保留多份，去重避免同一键被重复计数。
 */
function recordedHostKeyEntries(toolkitRoot) {
  const out = [];
  const seen = new Set();
  const push = (hk) => {
    if (!hk || !hk.key || seen.has(hk.key)) return;
    seen.add(hk.key);
    out.push(hk);
  };
  for (const rec of listSoftRecords(toolkitRoot)) push(rec && rec.hostKey);
  for (const entry of listCustody(toolkitRoot)) {
    let manifest = null;
    try {
      manifest = readCustodyManifest(toolkitRoot, entry.custodyId);
    } catch {
      continue;
    }
    push(rebuildOf(manifest) && rebuildOf(manifest).hostKey);
  }
  return out;
}

/** 收据里的「重装/挂载事实」：v2 = `rebuild`；v1 存档式遗留 = `restore`（兼容读取）。 */
function rebuildOf(manifest) {
  if (!manifest) return null;
  return manifest.rebuild || manifest.restore || null;
}

/**
 * 采集宿主键的**原始**插回行偏移（相对 web 行 `config:` 的稳定偏移）。
 *
 * 为什么需要补偿：`relOffsetWithinConfig` 取的是**现读**位次。同段的兄弟键若已被本面板
 * 先行摘除，现读位次就会偏小——B1/C2 先摘 searchProvider 再摘 fetchProvider 时，
 * fetchProvider 的现读位次从 2 掉到 1；逐条恢复（C3）就会把它插到 searchProvider 之前，
 * 使 cordis.patch.yml 无法字节级回基线（B1⑦ / C3② 硬断言）。
 *
 * 补偿规则：对每条台账留痕，若该键**现读已不在**且其 `afterKeys` 含本键，说明它原本排在
 * 本键之前 ⇒ 计一次前移。旧版留痕无 `afterKeys` 时退化为按偏移数值比较（尽力而为）。
 */
function hostKeyOriginalOffset(toolkitRoot, key, baseOffset, presentKeys) {
  let extra = 0;
  for (const entry of recordedHostKeyEntries(toolkitRoot)) {
    if (entry.key === key) continue;
    if (presentKeys.includes(entry.key)) continue; // 现读仍在 ⇒ 已计入 base
    if (Array.isArray(entry.afterKeys)) {
      if (entry.afterKeys.includes(key)) extra++;
    } else if (typeof entry.relOffsetWithinConfig === "number" && entry.relOffsetWithinConfig <= baseOffset) {
      extra++;
    }
  }
  return baseOffset + extra;
}

/**
 * 采集宿主键留痕：{ raw 原行, relOffsetWithinConfig 原始插回位, afterKeys 采集时排在其后的兄弟键 }。
 * 同时返回摘除后的文本，供 plan 复用（只摘一次）。
 */
function captureHostKeyPlacement({ toolkitRoot, text, hostKey }) {
  const unset = planWebConfigRemove(text, hostKey);
  const webCfg = locateConfigKeyLine(text, HOST_ROW_ID, "config");
  const base = unset.removedLineIndex - webCfg.sectionLine.lineIndex;
  const presentKeys = configChildKeys(text, HOST_ROW_ID);
  const at = presentKeys.indexOf(hostKey);
  return {
    raw: unset.removedRaw,
    relOffsetWithinConfig: hostKeyOriginalOffset(toolkitRoot, hostKey, base, presentKeys),
    baseOffset: base,
    afterKeys: at >= 0 ? presentKeys.slice(at + 1) : [],
    nextText: unset.nextText,
  };
}

/** 被摘块文本里的 `- id:` 行（全文件唯一的行锚候选）。 */
function rowIdLineOf(block) {
  if (typeof block !== "string") return null;
  for (const line of block.split(/\r?\n/)) if (/^(\s*)- id:/.test(line)) return line;
  return null;
}

/**
 * 面板台账里所有被摘块的**邻接证据**（D-UI-05）。
 * 每条留痕记的是「我原本紧跟在 prevTop 之后、紧邻 nextTop 之前」；块只由本面板摘/插，
 * 故该邻接关系在恢复期仍然是原布局的事实。
 * 为什么需要它：仅凭前后两锚会在同批多摘时失真——C2 先摘 rate-throttle/agent-memory（软）
 * 再摘 search-router/web-search-local（真）时，web-search-local 记录下的两个锚都已不在场，
 * 逐条恢复（C3）时会落到错位置，使 cordis.patch.yml 无法字节级回基线（B1⑦ / C3② 硬断言）。
 */
function panelRowAdjacencies(toolkitRoot) {
  const edges = [];
  const add = (block, prevTopRaw, nextTopRaw) => {
    const raw = rowIdLineOf(block);
    if (!raw) return;
    if (prevTopRaw) edges.push({ before: prevTopRaw, after: raw });
    if (nextTopRaw) edges.push({ before: raw, after: nextTopRaw });
  };
  for (const e of listRowAdjacencies(toolkitRoot)) edges.push(e); // 长期留痕（不随清账消失）
  for (const rec of listSoftRecords(toolkitRoot)) add(rec && rec.block, rec && rec.prevTopRaw, rec && rec.nextTopRaw);
  for (const entry of listCustody(toolkitRoot)) {
    let manifest = null;
    try {
      manifest = readCustodyManifest(toolkitRoot, entry.custodyId);
    } catch {
      continue;
    }
    const r = rebuildOf(manifest);
    if (r) add(r.rowBlock, r.prevTopRaw, r.nextTopRaw);
  }
  return edges;
}

/** 摘块执行成功时把邻接事实写入长期留痕（D-UI-05）。 */
function recordAdjacencyForPlan(toolkitRoot, plan) {
  const self = rowIdLineOf(plan && plan.block);
  if (!self) return;
  const edges = [];
  if (plan.prevTopRaw) edges.push({ before: plan.prevTopRaw, after: self });
  if (plan.nextTopRaw) edges.push({ before: self, after: plan.nextTopRaw });
  if (edges.length > 0) recordRowAdjacency(toolkitRoot, edges);
}

/**
 * 校验插回位置的现读锚（review 注记 ①：防陈旧 lineIndex）。
 * 恢复 plan 时现读定位，优先级：
 *   ① **邻接证据**（D-UI-05）：台账里他块留痕声明「我紧邻其后/其前」⇒ 插到现读最早的后继块之前
 *      （无后继在案则插到最后在案的前驱块之后）。同批多摘、乱序恢复均可复原原布局。
 *   ② 台账前后行锚（`- id:` 全文件唯一）：nextTop 命中 → 插其块首之前；否则 prevTop 命中 → 插其块尾之后。
 *   ③ 全不命中 ⇒ 结构漂移过大，拒绝（fail-closed）。
 * 返回 { insertAt, via }。
 */
function revalidateInsertAt(text, record, ctx = {}) {
  const lines = text.split(/\r?\n/);
  const findUnique = (raw) => {
    if (!raw) return -1;
    const hits = [];
    for (let i = 0; i < lines.length; i++) if (lines[i] === raw) hits.push(i);
    return hits.length === 1 ? hits[0] : -1;
  };
  /** 插到该行锚所在块的**结构行之前**（越过空行回溯到首列非空白的块首）。 */
  const insertBeforeAnchor = (idx) => {
    let at = idx;
    while (at > 0 && /^\s*$/.test(lines[at - 1])) at--;
    if (at > 0 && /^\S/.test(lines[at - 1])) at--;
    return at;
  };
  /** 插到该行锚所在块的**块尾之后**（越过其块内容的更深缩进/空行）。 */
  const insertAfterAnchor = (idx) => {
    const pm = /^(\s*)- id:/.exec(lines[idx]);
    const indent = pm ? pm[1].length : 0;
    for (let k = idx + 1; k < lines.length; k++) {
      const line = lines[k];
      if (/^\s*$/.test(line)) continue;
      if (/^\S/.test(line) || (/^(\s*)- id:/.test(line) && /^(\s*)/.exec(line)[1].length <= indent)) return k;
    }
    return lines.length;
  };

  const selfRaw = ctx.selfBlock ? rowIdLineOf(ctx.selfBlock) : null;
  if (selfRaw && ctx.toolkitRoot) {
    const edges = panelRowAdjacencies(ctx.toolkitRoot);
    const succ = edges
      .filter((e) => e.before === selfRaw && e.after)
      .map((e) => findUnique(e.after))
      .filter((i) => i >= 0);
    if (succ.length > 0) return { insertAt: insertBeforeAnchor(Math.min(...succ)), via: "order-successor" };
    const pred = edges
      .filter((e) => e.after === selfRaw && e.before)
      .map((e) => findUnique(e.before))
      .filter((i) => i >= 0);
    if (pred.length > 0) return { insertAt: insertAfterAnchor(Math.max(...pred)), via: "order-predecessor" };
  }

  const nextIdx = findUnique(record.nextTopRaw);
  if (nextIdx >= 0) return { insertAt: insertBeforeAnchor(nextIdx), via: "next-top-line" };
  const prevIdx = findUnique(record.prevTopRaw);
  if (prevIdx >= 0) return { insertAt: insertAfterAnchor(prevIdx), via: "prev-top-line" };
  throw new PlanError(
    "anchor-moved",
    "软恢复插回位置无法在当前文件里唯一锚定（结构漂移过大），拒绝恢复。请用维护程序处理。",
  );
}

/** 记录摘块位置的前后行级锚（软卸载时采集，供恢复现读锚定）。
 *  用 `- id:` 行（row id 全文件唯一）而非任意顶层行——`- insert:` 行彼此相同，不唯一。 */
function captureTopNeighbors(text, start, end) {
  const lines = text.split(/\r?\n/);
  let prev = null;
  for (let i = start - 1; i >= 0; i--) {
    if (/^(\s*)- id:/.test(lines[i])) {
      prev = lines[i];
      break;
    }
  }
  let next = null;
  for (let i = end + 1; i < lines.length; i++) {
    if (/^(\s*)- id:/.test(lines[i])) {
      next = lines[i];
      break;
    }
  }
  return { prevTopRaw: prev, nextTopRaw: next };
}

// ---------------- plan 构造（只读） ----------------

/**
 * 软卸载 plan（patch 行插件）：整块摘除（+ 搜索插件同步 unset 宿主键，方案 A）。
 * 产出标准文本 plan，仍由 executePlan 落盘（唯一通道不变）。
 */
export function createSoftUninstallPlan({ toolkitRoot, plugin, ttlMs, reason, note, userReason, confirmCopy }) {
  const meta = assertUninstallable(plugin);
  if (meta.managedBy === "preset") {
    return createPresetSoftUninstallPlan({ toolkitRoot, plugin, ttlMs, reason, note, userReason, confirmCopy });
  }
  const text = readPatch(toolkitRoot);
  const located = locateRowBlock(text, meta.rowId);
  const neighbors = captureTopNeighbors(text, located.start, located.end);
  const removed = planRemoveRow(text, meta.rowId);
  let nextText = removed.nextText;
  let hostKeyRaw = null;
  let hostKeyRelOffset = null;
  let hostKeyAfterKeys = null;
  if (meta.hostKey) {
    const placement = captureHostKeyPlacement({ toolkitRoot, text: removed.nextText, hostKey: meta.hostKey });
    hostKeyRaw = placement.raw;
    hostKeyRelOffset = placement.relOffsetWithinConfig;
    hostKeyAfterKeys = placement.afterKeys;
    nextText = placement.nextText;
  }
  const now = Date.now();
  const plan = {
    token: makeToken("uninstall-soft-patch", plugin, text, now),
    kind: "uninstall-soft-patch",
    plugin,
    mode: "soft",
    file: join(toolkitRoot, "cordis.patch.yml"),
    rowId: meta.rowId,
    reason: reason || "panel-uninstall-soft",
    note: note || plugin + " 软卸载（摘除挂载行" + (meta.hostKey ? " + 宿主键 unset" : "") + "；本体保留）",
    userReason: userReason || null,
    confirmCopy: confirmCopy || null,
    backupRoot: null, // execute 路由注入
    expectedSha: sha256Of(text),
    nextSha: sha256Of(nextText),
    anchorLine: located.anchor.lineIndex + 1,
    block: located.block,
    insertAt: located.start,
    removedLines: located.end - located.start + 1,
    prevTopRaw: neighbors.prevTopRaw,
    nextTopRaw: neighbors.nextTopRaw,
    hostKey: meta.hostKey
      ? { key: meta.hostKey, raw: hostKeyRaw, relOffsetWithinConfig: hostKeyRelOffset, afterKeys: hostKeyAfterKeys }
      : null,
    changed: true,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + (ttlMs || DEFAULT_PLAN_TTL_MS)).toISOString(),
    nextText,
  };
  putPlan(plan);
  return plan;
}

/**
 * 真卸载 plan（patch 行插件，含搜索两插件）：确认后存档式。
 * plan 只读预计算（行块/宿主键/预期 diff）；execute 时按序：
 *   存档（含逐文件 sha）→ 复验存档与源一致 → createBackup → executePlan 写 patch → 复验 → 删 lib。
 */
export function createTrueUninstallPlan({ toolkitRoot, plugin, ttlMs, reason, note, userReason, confirmCopy }) {
  const meta = assertUninstallable(plugin);
  if (meta.managedBy === "preset") {
    return createPresetTrueUninstallPlan({ toolkitRoot, plugin, ttlMs, reason, note, userReason, confirmCopy });
  }
  const text = readPatch(toolkitRoot);
  const located = locateRowBlock(text, meta.rowId);
  const removed = planRemoveRow(text, meta.rowId);
  let nextText = removed.nextText;
  let hostKeyRaw = null;
  let hostKeyRelOffset = null;
  let hostKeyAfterKeys = null;
  if (meta.hostKey) {
    const placement = captureHostKeyPlacement({ toolkitRoot, text: removed.nextText, hostKey: meta.hostKey });
    hostKeyRaw = placement.raw;
    hostKeyRelOffset = placement.relOffsetWithinConfig;
    hostKeyAfterKeys = placement.afterKeys;
    nextText = placement.nextText;
  }
  const now = Date.now();
  const plan = {
    token: makeToken("uninstall-true-patch", plugin, text, now),
    kind: "uninstall-true-patch",
    plugin,
    mode: "true",
    file: join(toolkitRoot, "cordis.patch.yml"),
    rowId: meta.rowId,
    reason: reason || "panel-uninstall-true",
    note: note || plugin + " 真卸载（确认后存档→摘行" + (meta.hostKey ? "+宿主键 unset" : "") + "→删本体）",
    userReason: userReason || null,
    confirmCopy: confirmCopy || null,
    backupRoot: null,
    expectedSha: sha256Of(text),
    nextSha: sha256Of(nextText),
    anchorLine: located.anchor.lineIndex + 1,
    block: located.block,
    insertAt: located.start,
    hostKey: meta.hostKey ? { key: meta.hostKey, raw: hostKeyRaw, relOffsetWithinConfig: hostKeyRelOffset, afterKeys: hostKeyAfterKeys } : null,
    libDir: join(toolkitRoot, "lib", plugin),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + (ttlMs || DEFAULT_PLAN_TTL_MS)).toISOString(),
    nextText,
  };
  putPlan(plan);
  return plan;
}

/** compact-router 软卸载 plan：预设回写（--undo），本体保留。非文本 plan，由专用执行器处理。 */
export function createPresetSoftUninstallPlan({ toolkitRoot, plugin, ttlMs, reason, note, userReason, confirmCopy }) {
  assertUninstallable(plugin);
  presetBridgePrecheck(toolkitRoot);
  const now = Date.now();
  const plan = {
    token: makeToken("uninstall-soft-preset", plugin, readPatch(toolkitRoot), now),
    kind: "uninstall-soft-preset",
    plugin,
    mode: "soft",
    managedBy: "preset",
    reason: reason || "panel-uninstall-soft-preset",
    note: note || plugin + " 软卸载（预设回写 --undo；本体保留）",
    userReason: userReason || null,
    confirmCopy: confirmCopy || null,
    backupRoot: null,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + (ttlMs || DEFAULT_PLAN_TTL_MS)).toISOString(),
  };
  putPlan(plan);
  return plan;
}

/** compact-router 真卸载 plan：--undo → 确认后存档 → 删本体。 */
export function createPresetTrueUninstallPlan({ toolkitRoot, plugin, ttlMs, reason, note, userReason, confirmCopy }) {
  assertUninstallable(plugin);
  presetBridgePrecheck(toolkitRoot);
  const libDir = join(toolkitRoot, "lib", plugin);
  if (!existsSync(libDir)) {
    const err = new Error("lib/" + plugin + " 不存在，无需真卸载");
    err.code = "body-missing";
    throw err;
  }
  const now = Date.now();
  const plan = {
    token: makeToken("uninstall-true-preset", plugin, readPatch(toolkitRoot), now),
    kind: "uninstall-true-preset",
    plugin,
    mode: "true",
    managedBy: "preset",
    reason: reason || "panel-uninstall-true-preset",
    note: note || plugin + " 真卸载（预设回写 --undo → 确认后存档 → 删本体）",
    userReason: userReason || null,
    confirmCopy: confirmCopy || null,
    backupRoot: null,
    libDir,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + (ttlMs || DEFAULT_PLAN_TTL_MS)).toISOString(),
  };
  putPlan(plan);
  return plan;
}

/**
 * 恢复文本组合（软/真恢复共用）：
 *   ① 现读锚定插回位置（prevTop/nextTop 唯一命中；漂移过大 fail-closed）；
 *   ② 宿主键冲突检测（占用 ⇒ conflict 三态数据，路由转 2.9 弹窗，不自动覆盖）；
 *   ③ 用户选「保留当前值」⇒ 不写宿主键。
 */
function composeRestore({ toolkitRoot, text, block, prevTopRaw, nextTopRaw, hostKey, hostKeyChoice }) {
  const { insertAt } = revalidateInsertAt(text, { prevTopRaw, nextTopRaw }, { toolkitRoot, selfBlock: block });
  const inserted = planInsertRow(text, { block, insertAt });
  let nextText = inserted.nextText;
  let conflict = null;
  if (hostKey && hostKey.raw) {
    if (hostKeyChoice === "keep-current") {
      // 用户选 A：保留当前值 → 不写宿主键
    } else {
      const locatedOnCurrent = locateWebConfigKey(text, hostKey.key);
      if (locatedOnCurrent.target) {
        conflict = {
          key: hostKey.key,
          currentValue: locatedOnCurrent.target.value,
          backupValue: String(hostKey.raw || "").trim(),
        };
      } else {
        const lines = nextText.split(/\r?\n/);
        const hasCrlf = /\r\n/.test(nextText);
        const cleanRaw = String(hostKey.raw).replace(/\r?\n$/, "");
        // 插回宿主键：相对 web 行 config: 的稳定偏移（卸载时采集；config: 行先于一切 insert 块，索引稳定）
        const relOffset = typeof hostKey.relOffsetWithinConfig === "number" ? hostKey.relOffsetWithinConfig : null;
        const webCfg = locateConfigKeyLine(nextText, HOST_ROW_ID, "config");
        let at = relOffset != null && webCfg ? webCfg.sectionLine.lineIndex + relOffset : -1;
        if (at < 0 || at > lines.length) {
          throw new PlanError("anchor-moved", "宿主键插回位置无法换算，拒绝恢复");
        }
        lines.splice(at, 0, cleanRaw);
        nextText = lines.join(hasCrlf ? "\r\n" : "\n");
      }
    }
  }
  return { nextText, insertAt, conflict };
}

function hostKeyFromRecord(record) {
  if (!record || !record.hostKey || !record.hostKey.raw) return null;
  return {
    key: record.hostKey.key,
    raw: record.hostKey.raw,
    relOffsetWithinConfig: typeof record.hostKey.relOffsetWithinConfig === "number" ? record.hostKey.relOffsetWithinConfig : null,
    afterKeys: Array.isArray(record.hostKey.afterKeys) ? record.hostKey.afterKeys : null,
  };
}

/**
 * 取该插件最新的真卸载**收据**（销毁式 v2：收据 = 对账账本 + 重装挂载的行块事实来源）。
 * 无收据返回 null（不再抛错——挂载路径据此给出明确拒绝，见 createMountPlan）。
 */
function latestReceipt(toolkitRoot, plugin, custodyId) {
  const entries = listCustody(toolkitRoot).filter(
    (e) => e.plugin === plugin && e.kind === "true-uninstall-receipt",
  );
  if (entries.length === 0) return null;
  const chosen = custodyId ? entries.find((e) => e.custodyId === custodyId) : entries[0];
  if (!chosen) return null;
  return { manifest: readCustodyManifest(toolkitRoot, chosen.custodyId), custodyId: chosen.custodyId };
}

/**
 * 软恢复 plan（patch 行插件）：按台账插回行块（现读锚定）+ 宿主键写回。
 * conflict 非空 ⇒ plan 不进入可执行态，路由返回 2.9 冲突三态。
 */
export function createSoftRestorePlan({ toolkitRoot, plugin, hostKeyChoice, ttlMs, reason, note }) {
  const meta = assertUninstallable(plugin);
  if (meta.managedBy === "preset") {
    return createPresetRestorePlan({ toolkitRoot, plugin, ttlMs, reason, note });
  }
  // 销毁式 v2 守卫（先于台账检查）：本体不在（已真卸载）⇒ 无面板恢复路径
  if (!existsSync(join(toolkitRoot, "lib", plugin))) {
    const err = new Error(
      plugin + " 本体不存在（已真卸载，面板不留副本）——恢复途径 = 开源后重新下载安装，再由面板「挂载」",
    );
    err.code = "body-missing";
    throw err;
  }
  const record = getSoftRecord(toolkitRoot, meta.rowId);
  if (!record) {
    const err = new Error(plugin + " 没有面板软卸载台账（可能是在面板外手动摘除的）；若是重装后的情形，请用「挂载」");
    err.code = "soft-record-missing";
    throw err;
  }
  const text = readPatch(toolkitRoot);
  const composed = composeRestore({
    toolkitRoot,
    text,
    block: record.block,
    prevTopRaw: record.prevTopRaw,
    nextTopRaw: record.nextTopRaw,
    hostKey: hostKeyFromRecord(record),
    hostKeyChoice,
  });
  const now = Date.now();
  const plan = {
    token: makeToken("restore-soft-patch", plugin, text, now),
    kind: "restore-soft-patch",
    skipAnchorCheck: true, // 恢复向计划：目标行不在文件中，无锚可验（SHA 闸 + 现读插回锚保证正确性）
    plugin,
    file: join(toolkitRoot, "cordis.patch.yml"),
    rowId: meta.rowId,
    reason: reason || "panel-restore-soft",
    note: note || plugin + " 软恢复（行块插回" + (record.hostKey ? " + 宿主键写回" : "") + "）",
    backupRoot: null,
    expectedSha: sha256Of(text),
    nextSha: sha256Of(composed.nextText),
    conflict: composed.conflict, // 非空 ⇒ 路由返回 2.9 冲突三态，plan 不进入可执行态
    insertAt: composed.insertAt,
    changed: true,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + (ttlMs || DEFAULT_PLAN_TTL_MS)).toISOString(),
    nextText: composed.nextText,
  };
  putPlan(plan);
  return plan;
}

/**
 * compact-router 恢复 plan（预设 apply）。
 * 销毁式 v2 守卫：本体不存在（已真卸载，无副本）⇒ **拒绝**——真卸载无面板恢复路径，
 * 须「开源后重新下载安装 → 面板检测已安装未挂载 → 挂载」。
 */
export function createPresetRestorePlan({ toolkitRoot, plugin, ttlMs, reason, note }) {
  assertUninstallable(plugin);
  if (!existsSync(join(toolkitRoot, "lib", plugin))) {
    const err = new Error(
      plugin + " 本体不存在（已真卸载，面板不留副本）——恢复途径 = 开源后重新下载安装，再由面板「挂载」",
    );
    err.code = "body-missing";
    throw err;
  }
  presetBridgePrecheck(toolkitRoot);
  const now = Date.now();
  const plan = {
    token: makeToken("restore-preset", plugin, readPatch(toolkitRoot), now),
    kind: "restore-preset",
    plugin,
    managedBy: "preset",
    reason: reason || "panel-restore-preset",
    note: note || plugin + " 恢复（重新执行预设补丁）",
    backupRoot: null,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + (ttlMs || DEFAULT_PLAN_TTL_MS)).toISOString(),
  };
  putPlan(plan);
  return plan;
}

/**
 * 「挂载」plan（**重装后**，p24-design-v2-destroy.md §5）：把插件行块插回挂载面，
 * **复用插回算子** planInsertRow（锚点唯一 + SHA + 写前备份，走 executePlan 唯一通道）。
 *
 * 行块来源：
 *   ① **有真卸载收据**（`rebuild.rowBlock`）→ 用之，并回写收据里的宿主键事实（最保真）；
 *   ② **无收据** → **拒绝**（`mount-no-receipt`）：面板**不臆造插件 config**（零硬编码纪律）。
 *      此时 doctor 会以「已安装未挂载」warning 提示，用户可手工处置。
 */
export function createMountPlan({ toolkitRoot, plugin, hostKeyChoice, ttlMs, reason, note }) {
  const meta = assertUninstallable(plugin);
  const libDir = join(toolkitRoot, "lib", plugin);
  if (!existsSync(libDir)) {
    const err = new Error(plugin + " 本体不存在，无法挂载（请先重新安装）");
    err.code = "body-missing";
    throw err;
  }
  const receipt = latestReceipt(toolkitRoot, plugin);
  const now = Date.now();

  // 预设管理插件（compact-router）：挂载 = 重新执行预设补丁，**无需行块事实**。
  if (meta.managedBy === "preset") {
    const plan = {
      token: makeToken("mount-preset", plugin, readPatch(toolkitRoot), now),
      kind: "mount-preset",
      plugin,
      managedBy: "preset",
      reason: reason || "panel-mount-preset",
      note: note || plugin + " 挂载（重装后：重新执行预设补丁）",
      backupRoot: null,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + (ttlMs || DEFAULT_PLAN_TTL_MS)).toISOString(),
    };
    putPlan(plan);
    return plan;
  }

  if (!receipt || !receipt.manifest.rebuild || !receipt.manifest.rebuild.rowBlock) {
    const err = new Error(
      plugin + " 没有可用的卸载收据（缺行块事实），面板无法安全重建挂载行；请手工挂载或重走一次安装流程",
    );
    err.code = "mount-no-receipt";
    throw err;
  }
  const rb = receipt.manifest.rebuild;

  const text = readPatch(toolkitRoot);
  const composed = composeRestore({
    toolkitRoot,
    text,
    block: rb.rowBlock,
    prevTopRaw: rb.prevTopRaw,
    nextTopRaw: rb.nextTopRaw,
    hostKey: hostKeyFromRecord(rb),
    hostKeyChoice,
  });
  const plan = {
    token: makeToken("mount-patch", plugin, text, now),
    kind: "mount-patch",
    skipAnchorCheck: true, // 挂载向：目标行不在文件中，无锚可验（SHA 闸 + 现读插回锚保证正确性）
    plugin,
    custodyId: receipt.custodyId,
    file: join(toolkitRoot, "cordis.patch.yml"),
    rowId: meta.rowId,
    reason: reason || "panel-mount",
    note: note || plugin + " 挂载（重装后：行块插回" + (rb.hostKey ? " + 宿主键写回" : "") + "）",
    backupRoot: null,
    expectedSha: sha256Of(text),
    nextSha: sha256Of(composed.nextText),
    conflict: composed.conflict, // 非空 ⇒ 路由返回冲突三态（不自动覆盖）
    insertAt: composed.insertAt,
    changed: true,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + (ttlMs || DEFAULT_PLAN_TTL_MS)).toISOString(),
    nextText: composed.nextText,
  };
  putPlan(plan);
  return plan;
}

// ---------------- 执行器 ----------------

function assertPlanFresh(plan) {
  if (!plan) throw new PlanError("plan-not-found", "方案不存在或已失效，请重新生成");
  if (Date.parse(plan.expiresAt) <= Date.now()) {
    dropPlan(plan.token);
    throw new PlanError("plan-expired", "方案已过期（5 分钟），请重新生成");
  }
}

function assertPatchUnchanged(plan, toolkitRoot) {
  const current = readPatch(toolkitRoot);
  const sha = sha256Of(current);
  if (sha !== plan.expectedSha) {
    throw new PlanError(
      "sha-conflict",
      "cordis.patch.yml 在方案生成后被改动过（期望 " + plan.expectedSha.slice(0, 12) + "…，实际 " + sha.slice(0, 12) + "…），已拒绝执行",
    );
  }
  return current;
}

/** 软卸载执行：executePlan 落盘 → 写软卸载台账。 */
export function executeSoftUninstall({ plan, toolkitRoot, backupRoot }) {
  assertPlanFresh(plan);
  assertPatchUnchanged(plan, toolkitRoot);
  plan.backupRoot = backupRoot || plan.backupRoot; // executePlan 的备份链读 plan.backupRoot
  const result = executePlan(plan.token, {});
  recordAdjacencyForPlan(toolkitRoot, plan);
  recordSoftUninstall(toolkitRoot, plan.rowId, {
    plugin: plan.plugin,
    block: plan.block,
    insertAt: plan.insertAt,
    prevTopRaw: plan.prevTopRaw,
    nextTopRaw: plan.nextTopRaw,
    hostKey: plan.hostKey
      ? {
          key: plan.hostKey.key,
          raw: plan.hostKey.raw,
          relOffsetWithinConfig: plan.hostKey.relOffsetWithinConfig,
          afterKeys: plan.hostKey.afterKeys || null,
        }
      : null,
    shaBefore: result.shaBefore,
    shaAfter: result.shaAfter,
    backupDir: result.backupDir,
    userReason: plan.userReason || null,
  });
  return result;
}

/**
 * 真卸载执行（patch 行插件 · **销毁式 v2**，p24-design-v2-destroy.md §1）：
 *  ① **收据先行**（删除前；只读枚举 + 逐文件 sha，**不复制任何文件内容**）——写收据失败即中止（fail-closed）；
 *  ② patch 写入走 executePlan 唯一通道（摘行 + 宿主键 unset）；
 *  ③ **彻底删除** lib/<plugin>（rmSync **绕过回收站**）；
 *  ④ 复验：目录不存在 + 收据在案。
 * **不可逆**：面板侧零副本，无恢复路径；恢复途径 = 开源后重新下载 → 面板检测「已安装未挂载」→ 挂载。
 */
export function executeTrueUninstall({ plan, toolkitRoot, backupRoot }) {
  assertPlanFresh(plan);
  assertPatchUnchanged(plan, toolkitRoot);
  plan.backupRoot = backupRoot || plan.backupRoot; // executePlan 的备份链读 plan.backupRoot
  const patchText = readPatch(toolkitRoot);

  // ① 收据先行（删除前；只读枚举 + sha，不复制内容）
  const located = locateRowBlock(patchText, plan.rowId);
  const neighbors = captureTopNeighbors(patchText, located.start, located.end);
  const { receiptDir, manifest } = writeDestroyReceipt({
    toolkitRoot,
    plugin: plan.plugin,
    pkg: (PLUGINS[plan.plugin] || {}).pkg,
    rowBlock: plan.block,
    insertAt: plan.insertAt,
    hostKey: plan.hostKey || null,
    prevTopRaw: neighbors.prevTopRaw,
    nextTopRaw: neighbors.nextTopRaw,
    presetStateSnapshot: null,
    userReason: plan.userReason,
    confirmCopy: plan.confirmCopy,
  });
  const custodyId = receiptDir.split(/[\\/]/).pop();

  // ② patch 写入仍走 executePlan 唯一通道（SHA/锚点/备份闸全数生效）
  const result = executePlan(plan.token, {});
  recordAdjacencyForPlan(toolkitRoot, plan);

  // ③ 彻底删除本体（用户确认页知情确认的删除动作；rmSync 不经回收站）
  rmSync(plan.libDir, { recursive: true, force: true });
  if (existsSync(plan.libDir)) {
    const err = new Error("lib/" + plan.plugin + " 删除失败（目录仍在）；patch 已摘行，本体保留。请回报维护者。");
    err.code = "body-delete-failed";
    throw err;
  }

  // ④ 复验：收据在案（对账依据不丢）
  if (!existsSync(join(receiptDir, "manifest.json"))) {
    const err = new Error("收据丢失：" + custodyId + "（本体已删，请回报维护者）");
    err.code = "receipt-missing-after-delete";
    throw err;
  }

  return {
    ...result,
    custodyId,
    deletedFiles: manifest.deleted.totals.files,
    deletedBytes: manifest.deleted.totals.bytes,
  };
}

/** compact-router 软卸载执行：--undo + 双层留痕。 */
export function executePresetSoftUninstall({ plan, toolkitRoot, backupRoot }) {
  assertPlanFresh(plan);
  presetBridgePrecheck(toolkitRoot);
  const beforeShas = presetShas(toolkitRoot);
  const stdout = runPresetScript(toolkitRoot, ["--undo"]);
  const afterShas = presetShas(toolkitRoot);
  const evidence = presetUndoEvidence(toolkitRoot, backupRoot, beforeShas, afterShas, stdout);
  recordSoftUninstall(toolkitRoot, plan.plugin, {
    plugin: plan.plugin,
    presetUndo: true,
    beforeShas,
    afterShas,
    evidenceBackupDir: evidence.backupDir,
    userReason: plan.userReason || null,
  });
  dropPlan(plan.token);
  return {
    ok: true,
    plugin: plan.plugin,
    mode: "soft",
    presetEvidence: evidence.perPreset,
    backupDir: evidence.backupDir,
    stdoutTail: stdout.slice(-400),
  };
}

/**
 * compact-router 真卸载执行（**销毁式 v2**）：--undo 回写预设 → **收据先行** → **彻底删除**本体。
 * 预设回写仍只调既有脚本（`preset-backups/` + `preset-patch-state.json` 双层留痕）。
 */
export function executePresetTrueUninstall({ plan, toolkitRoot, backupRoot }) {
  assertPlanFresh(plan);
  presetBridgePrecheck(toolkitRoot);
  const beforeShas = presetShas(toolkitRoot);
  const stdout = runPresetScript(toolkitRoot, ["--undo"]);
  const afterShas = presetShas(toolkitRoot);
  const evidence = presetUndoEvidence(toolkitRoot, backupRoot, beforeShas, afterShas, stdout);

  // 收据先行（删除前；只读枚举 + sha，不复制内容）
  const { receiptDir, manifest } = writeDestroyReceipt({
    toolkitRoot,
    plugin: plan.plugin,
    pkg: (PLUGINS[plan.plugin] || {}).pkg,
    rowBlock: null,
    insertAt: null,
    hostKey: null,
    prevTopRaw: null,
    nextTopRaw: null,
    presetStateSnapshot: readPresetState(toolkitRoot),
    userReason: plan.userReason,
    confirmCopy: plan.confirmCopy,
  });
  const presetCustodyId = receiptDir.split(/[\\/]/).pop();

  // 彻底删除本体（rmSync 不经回收站）
  rmSync(plan.libDir, { recursive: true, force: true });
  if (existsSync(plan.libDir)) {
    const err = new Error("lib/" + plan.plugin + " 删除失败（目录仍在）；预设已回写，本体保留。请回报维护者。");
    err.code = "body-delete-failed";
    throw err;
  }
  dropPlan(plan.token);
  return {
    ok: true,
    plugin: plan.plugin,
    mode: "true",
    custodyId: presetCustodyId,
    deletedFiles: manifest.deleted.totals.files,
    deletedBytes: manifest.deleted.totals.bytes,
    presetEvidence: evidence.perPreset,
    backupDir: evidence.backupDir,
    stdoutTail: stdout.slice(-400),
  };
}

/** compact-router 软恢复执行：重新 apply 预设 → 清台账条目（销毁式 v2：**无 body 还原路径**）。 */
export function executePresetRestore({ plan, toolkitRoot }) {
  assertPlanFresh(plan);
  presetBridgePrecheck(toolkitRoot);
  const beforeShas = presetShas(toolkitRoot);
  const stdout = runPresetScript(toolkitRoot, []);
  const afterShas = presetShas(toolkitRoot);
  clearSoftRecord(toolkitRoot, plan.plugin);
  dropPlan(plan.token);
  return {
    ok: true,
    plugin: plan.plugin,
    beforeShas,
    afterShas,
    stdoutTail: stdout.slice(-400),
  };
}

/** 软恢复执行：executePlan 落盘 → 清台账条目。 */
export function executeSoftRestore({ plan, toolkitRoot, backupRoot }) {
  assertPlanFresh(plan);
  if (plan.conflict) {
    const err = new Error("存在宿主键冲突，须先由用户三选一");
    err.code = "host-key-conflict";
    throw err;
  }
  assertPatchUnchanged(plan, toolkitRoot);
  plan.backupRoot = backupRoot || plan.backupRoot; // executePlan 的备份链读 plan.backupRoot
  const result = executePlan(plan.token, {});
  clearSoftRecord(toolkitRoot, plan.rowId);
  return result;
}

/**
 * 挂载执行（patch 行插件 · 销毁式 v2 §5）：executePlan 落盘（行块插回 + 宿主键写回）。
 * 冲突未决 ⇒ 拒绝（须先三选一）。挂载后该插件回到 mounted；重启后生效。
 */
export function executeMount({ plan, toolkitRoot, backupRoot }) {
  assertPlanFresh(plan);
  if (plan.conflict) {
    const err = new Error("存在宿主键冲突，须先由用户三选一");
    err.code = "host-key-conflict";
    throw err;
  }
  assertPatchUnchanged(plan, toolkitRoot);
  plan.backupRoot = backupRoot || plan.backupRoot; // executePlan 的备份链读 plan.backupRoot
  const result = executePlan(plan.token, {});
  dropPlan(plan.token);
  return { ...result, mounted: true, plugin: plan.plugin, custodyId: plan.custodyId || null };
}

/** 挂载执行（预设管理插件）：重新执行预设补丁（只调既有脚本，双层留痕不变）。 */
export function executeMountPreset({ plan, toolkitRoot }) {
  assertPlanFresh(plan);
  presetBridgePrecheck(toolkitRoot);
  const beforeShas = presetShas(toolkitRoot);
  const stdout = runPresetScript(toolkitRoot, []);
  const afterShas = presetShas(toolkitRoot);
  dropPlan(plan.token);
  return {
    ok: true,
    mounted: true,
    plugin: plan.plugin,
    beforeShas,
    afterShas,
    stdoutTail: stdout.slice(-400),
  };
}

export { getPlan, putPlan, dropPlan };
