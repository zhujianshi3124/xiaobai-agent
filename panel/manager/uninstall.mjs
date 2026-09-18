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
  archiveForTrueUninstall,
  verifyCustodyBody,
  restoreBody,
  recordSoftUninstall,
  clearSoftRecord,
  getSoftRecord,
  listCustody,
  readCustodyManifest,
} from "./custody.mjs";

const PRESET_PRESETS = ["liangshen", "standard", "ptc", "cordis"];

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

/**
 * 校验插回位置的现读锚（review 注记 ①：防陈旧 lineIndex）。
 * 软卸载台账记录被摘块的前/后两个顶层行原文；恢复 plan 时以它们现读定位：
 *   nextTop 命中 → insertAt = 其现读行号；否则 prevTop 命中 → insertAt = +1；
 *   两者都命中不到 ⇒ 结构漂移过大，拒绝（fail-closed）。
 * 返回 { insertAt, via }。
 */
function revalidateInsertAt(text, record) {
  const lines = text.split(/\r?\n/);
  const findUnique = (raw) => {
    if (!raw) return -1;
    const hits = [];
    for (let i = 0; i < lines.length; i++) if (lines[i] === raw) hits.push(i);
    return hits.length === 1 ? hits[0] : -1;
  };
  const viaNext = findUnique(record.nextTopRaw);
  if (viaNext >= 0) return { insertAt: viaNext, via: "next-top-line" };
  const viaPrev = findUnique(record.prevTopRaw);
  if (viaPrev >= 0) return { insertAt: viaPrev + 1, via: "prev-top-line" };
  throw new PlanError(
    "anchor-moved",
    "软恢复插回位置无法在当前文件里唯一锚定（结构漂移过大），拒绝恢复。请用维护程序处理。",
  );
}

/** 记录摘块位置的前后顶层行原文（软卸载时采集，供恢复现读锚定）。 */
function captureTopNeighbors(text, start, end) {
  const lines = text.split(/\r?\n/);
  let prev = null;
  for (let i = start - 1; i >= 0; i--) {
    if (/^\S/.test(lines[i])) {
      prev = lines[i];
      break;
    }
  }
  let next = null;
  for (let i = end + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) {
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
  let hostKeyLineIndex = null;
  if (meta.hostKey) {
    const unset = planWebConfigRemove(removed.nextText, meta.hostKey);
    hostKeyRaw = unset.removedRaw;
    hostKeyLineIndex = unset.removedLineIndex;
    nextText = unset.nextText;
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
    hostKey: meta.hostKey ? { key: meta.hostKey, raw: hostKeyRaw, lineIndex: hostKeyLineIndex } : null,
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
  let hostKeyLineIndex = null;
  if (meta.hostKey) {
    const unset = planWebConfigRemove(removed.nextText, meta.hostKey);
    hostKeyRaw = unset.removedRaw;
    hostKeyLineIndex = unset.removedLineIndex;
    nextText = unset.nextText;
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
    hostKey: meta.hostKey ? { key: meta.hostKey, raw: hostKeyRaw, lineIndex: hostKeyLineIndex } : null,
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
function composeRestore({ text, block, prevTopRaw, nextTopRaw, hostKey, hostKeyChoice }) {
  const { insertAt } = revalidateInsertAt(text, { prevTopRaw, nextTopRaw });
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
        // 插回宿主键：按卸载时记录的相对位置（原行号 - 摘块起点）现读换算
        const relOffset = typeof hostKey.relOffsetWithinPreBlock === "number"
          ? hostKey.relOffsetWithinPreBlock
          : null;
        let at = relOffset != null ? Math.max(0, insertAt + relOffset) : -1;
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
    relOffsetWithinPreBlock:
      typeof record.hostKey.relOffsetWithinPreBlock === "number"
        ? record.hostKey.relOffsetWithinPreBlock
        : typeof record.hostKey.lineIndex === "number" && typeof record.insertAt === "number"
          ? record.hostKey.lineIndex - record.insertAt
          : null,
  };
}

function latestTrueCustody(toolkitRoot, plugin, custodyId) {
  const entries = listCustody(toolkitRoot).filter((e) => e.plugin === plugin && e.kind === "true-uninstall");
  if (entries.length === 0) {
    const err = new Error(plugin + " 没有真卸载保管档，无法从保管区恢复");
    err.code = "custody-not-found";
    throw err;
  }
  const chosen = custodyId ? entries.find((e) => e.custodyId === custodyId) : entries[0];
  if (!chosen) {
    const err = new Error("保管区条目不存在：" + custodyId);
    err.code = "custody-not-found";
    throw err;
  }
  return readCustodyManifest(toolkitRoot, chosen.custodyId);
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
  const record = getSoftRecord(toolkitRoot, meta.rowId);
  if (!record) {
    const err = new Error(plugin + " 没有面板软卸载台账（可能是在面板外手动摘除的），请用维护程序或确认后手工恢复");
    err.code = "soft-record-missing";
    throw err;
  }
  const text = readPatch(toolkitRoot);
  const composed = composeRestore({
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
 * 真恢复 plan（patch 行插件）：保管区 manifest 提供行块与宿主键事实；
 * 流程 = 还原 body（恢复前再备份）→ executePlan 插回行块/宿主键 → 保管档保留（不清）。
 */
export function createTrueRestorePlan({ toolkitRoot, plugin, custodyId, hostKeyChoice, ttlMs, reason, note }) {
  const meta = assertUninstallable(plugin);
  if (meta.managedBy === "preset") {
    return createPresetRestorePlan({ toolkitRoot, plugin, custodyId, ttlMs, reason, note });
  }
  const manifest = latestTrueCustody(toolkitRoot, plugin, custodyId);
  const text = readPatch(toolkitRoot);
  let composed = { nextText: text, insertAt: null, conflict: null };
  if (manifest.restore && manifest.restore.rowBlock) {
    composed = composeRestore({
      text,
      block: manifest.restore.rowBlock,
      prevTopRaw: manifest.restore.prevTopRaw,
      nextTopRaw: manifest.restore.nextTopRaw,
      hostKey: hostKeyFromRecord(manifest.restore),
      hostKeyChoice,
    });
  }
  const now = Date.now();
  const plan = {
    token: makeToken("restore-true-patch", plugin, text, now),
    kind: "restore-true-patch",
    plugin,
    custodyId,
    file: join(toolkitRoot, "cordis.patch.yml"),
    rowId: meta.rowId,
    reason: reason || "panel-restore-true",
    note: note || plugin + " 真恢复（保管区还原本体 → 行块插回" + (manifest.restore && manifest.restore.hostKey ? " + 宿主键写回" : "") + "）",
    backupRoot: null,
    expectedSha: sha256Of(text),
    nextSha: sha256Of(composed.nextText),
    conflict: composed.conflict,
    insertAt: composed.insertAt,
    manifestFileCount: (manifest.body || []).length,
    changed: true,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + (ttlMs || DEFAULT_PLAN_TTL_MS)).toISOString(),
    nextText: composed.nextText,
  };
  putPlan(plan);
  return plan;
}

/** compact-router 恢复 plan（预设 apply；若存在真卸载保管档则先还原 body）。 */
export function createPresetRestorePlan({ toolkitRoot, plugin, custodyId, ttlMs, reason, note }) {
  assertUninstallable(plugin);
  presetBridgePrecheck(toolkitRoot);
  const now = Date.now();
  const plan = {
    token: makeToken("restore-preset", plugin, readPatch(toolkitRoot), now),
    kind: "restore-preset",
    plugin,
    custodyId: custodyId || null,
    managedBy: "preset",
    reason: reason || "panel-restore-preset",
    note: note || plugin + " 恢复（重新执行预设补丁" + (existsSync(join(toolkitRoot, "lib", plugin)) ? "" : " + 保管区本体还原") + "）",
    backupRoot: null,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + (ttlMs || DEFAULT_PLAN_TTL_MS)).toISOString(),
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
  const result = executePlan(plan.token, {});
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
          relOffsetWithinPreBlock:
            plan.hostKey.lineIndex != null && plan.insertAt != null ? plan.hostKey.lineIndex - plan.insertAt : null,
        }
      : null,
    shaBefore: result.shaBefore,
    shaAfter: result.shaAfter,
    backupDir: result.backupDir,
    userReason: plan.userReason || null,
  });
  return result;
}

/** 真卸载执行（patch 行插件）：确认后存档 → 复验 → 写 patch（唯一通道）→ 复验 → 删本体。 */
export function executeTrueUninstall({ plan, toolkitRoot, backupRoot }) {
  assertPlanFresh(plan);
  assertPatchUnchanged(plan, toolkitRoot);
  const patchText = readPatch(toolkitRoot);

  // ① 确认后存档（删除前），逐文件 sha
  const located = locateRowBlock(patchText, plan.rowId);
  const neighbors = captureTopNeighbors(patchText, located.start, located.end);
  const { custodyDir, manifest } = archiveForTrueUninstall({
    toolkitRoot,
    plugin: plan.plugin,
    pkg: (PLUGINS[plan.plugin] || {}).pkg,
    rowBlock: plan.block,
    insertAt: plan.insertAt,
    hostKeyRaw: plan.hostKey ? plan.hostKey.raw : null,
    hostKeyLineIndex: plan.hostKey ? plan.hostKey.lineIndex : null,
    prevTopRaw: neighbors.prevTopRaw,
    nextTopRaw: neighbors.nextTopRaw,
    presetStateSnapshot: null,
    userReason: plan.userReason,
    confirmCopy: plan.confirmCopy,
    patchText,
  });

  // ② 复验存档与源逐文件一致（复验不过 ⇒ 中止，不删源）
  verifyCustodyBody(toolkitRoot, custodyDir, manifest);
  for (const f of manifest.body) {
    const srcSha = sha256Of(readFileSync(join(plan.libDir, f.rel)));
    if (srcSha !== f.sha256) {
      const err = new Error("存档与源不一致：" + f.rel + "，已中止删除（源文件未动）");
      err.code = "custody-verify-failed";
      throw err;
    }
  }

  // ③ patch 写入仍走 executePlan 唯一通道（SHA/锚点/备份闸全数生效）
  const result = executePlan(plan.token, {});

  // ④ 删除本体（存档校验已通过；此处是用户确认页知情确认的删除动作）
  rmSync(plan.libDir, { recursive: true, force: true });
  if (existsSync(plan.libDir)) {
    const err = new Error("lib/" + plan.plugin + " 删除失败（目录仍在）；patch 已摘行，本体保留。请回报维护者。");
    err.code = "body-delete-failed";
    throw err;
  }

  return { ...result, custodyId: custodyDir.split(/[\\/]/).pop(), archivedFiles: manifest.body.length };
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

/** compact-router 真卸载执行：--undo → 存档（确认后）→ 复验 → 删本体。 */
export function executePresetTrueUninstall({ plan, toolkitRoot, backupRoot }) {
  assertPlanFresh(plan);
  presetBridgePrecheck(toolkitRoot);
  const beforeShas = presetShas(toolkitRoot);
  const stdout = runPresetScript(toolkitRoot, ["--undo"]);
  const afterShas = presetShas(toolkitRoot);
  const evidence = presetUndoEvidence(toolkitRoot, backupRoot, beforeShas, afterShas, stdout);

  const { custodyDir, manifest } = archiveForTrueUninstall({
    toolkitRoot,
    plugin: plan.plugin,
    pkg: (PLUGINS[plan.plugin] || {}).pkg,
    rowBlock: null,
    insertAt: null,
    hostKeyRaw: null,
    hostKeyLineIndex: null,
    presetStateSnapshot: readPresetState(toolkitRoot),
    userReason: plan.userReason,
    confirmCopy: plan.confirmCopy,
    patchText: undefined,
  });
  verifyCustodyBody(toolkitRoot, custodyDir, manifest);
  for (const f of manifest.body) {
    const srcSha = sha256Of(readFileSync(join(plan.libDir, f.rel)));
    if (srcSha !== f.sha256) {
      const err = new Error("存档与源不一致：" + f.rel + "，已中止删除（源文件未动）");
      err.code = "custody-verify-failed";
      throw err;
    }
  }
  rmSync(plan.libDir, { recursive: true, force: true });
  dropPlan(plan.token);
  return {
    ok: true,
    plugin: plan.plugin,
    mode: "true",
    custodyId: custodyDir.split(/[\\/]/).pop(),
    archivedFiles: manifest.body.length,
    presetEvidence: evidence.perPreset,
    backupDir: evidence.backupDir,
    stdoutTail: stdout.slice(-400),
  };
}

/** compact-router 恢复执行：保管区还原 body（如有）→ 重新 apply 预设 → afterReapply 留痕。 */
export function executePresetRestore({ plan, toolkitRoot, backupRoot, custodyId }) {
  assertPlanFresh(plan);
  presetBridgePrecheck(toolkitRoot);
  const beforeShas = presetShas(toolkitRoot);
  let restored = null;
  if (custodyId) {
    const manifest = JSON.parse(
      readFileSync(join(toolkitRoot, ".panel-custody", custodyId, "manifest.json"), "utf8"),
    );
    restored = restoreBody(toolkitRoot, custodyId, manifest, { backupRoot });
  }
  const stdout = runPresetScript(toolkitRoot, []);
  const afterShas = presetShas(toolkitRoot);
  clearSoftRecord(toolkitRoot, plan.plugin);
  dropPlan(plan.token);
  return {
    ok: true,
    plugin: plan.plugin,
    restoredBody: restored ? restored.restored : 0,
    restoreBackupDir: restored ? restored.backupDir : null,
    beforeShas,
    afterShas,
    stdoutTail: stdout.slice(-400),
  };
}

/** 软恢复执行：executePlan 落盘 → 清台账条目。 */
export function executeSoftRestore({ plan, toolkitRoot }) {
  assertPlanFresh(plan);
  if (plan.conflict) {
    const err = new Error("存在宿主键冲突，须先由用户三选一");
    err.code = "host-key-conflict";
    throw err;
  }
  assertPatchUnchanged(plan, toolkitRoot);
  const result = executePlan(plan.token, {});
  clearSoftRecord(toolkitRoot, plan.rowId);
  return result;
}

/**
 * 真恢复执行（patch 行插件）：还原本体（恢复前再备份）→ executePlan 插回行块/宿主键。
 * 保管档保留不清（§4.2），便于复核。
 */
export function executeTrueRestore({ plan, toolkitRoot, backupRoot, custodyId }) {
  assertPlanFresh(plan);
  if (plan.conflict) {
    const err = new Error("存在宿主键冲突，须先由用户三选一");
    err.code = "host-key-conflict";
    throw err;
  }
  assertPatchUnchanged(plan, toolkitRoot);
  const manifest = readCustodyManifest(toolkitRoot, custodyId || plan.custodyId);
  const restored = restoreBody(toolkitRoot, custodyId || plan.custodyId, manifest, { backupRoot });
  const result = executePlan(plan.token, {});
  return { ...result, restoredFiles: restored.restored, restoreBackupDir: restored.backupDir, custodyId: custodyId || plan.custodyId };
}

export { getPlan, putPlan, dropPlan };
