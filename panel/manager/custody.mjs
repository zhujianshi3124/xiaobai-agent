// P2.4 保管区三件套（p24-design.md §4）：真卸载的存档式恢复事实 + 软卸载状态台账。
//
// 结构：<repoRoot>/.panel-custody/
//   <plugin>-<UTCstamp>/manifest.json   —— 恢复所需最小事实（插件/原因/文件清单+sha）
//   <plugin>-<UTCstamp>/body/...        —— lib/<plugin> 全量镜像
//   <plugin>-<UTCstamp>/patch/          —— cordis.patch.yml.pre + 行块原文 + 宿主行原值
//                                          （compact-router 另存 preset-patch-state 快照）
//   soft-uninstalls.json                —— 软卸载状态台账（行块原文/插回位置/宿主键，
//                                          支撑六态区分与软恢复，恢复成功后移除条目）
//
// 纪律：
//   - 真卸载存档时态 = **确认后存档**（预审判定 #3 定案）：确认执行后、删除前完成
//     存档与逐文件 sha 校验；校验失败则中止删除（fail-closed）。
//   - 本模块自身不做任何 lib/ 删除；删除由 uninstall 执行器在校验通过后单独执行。
//   - 滚动窗口：每插件最多 5 份（含恢复档），超出物理删除最旧，无 TTL（§4.2）。
//   - 恢复成功不自动清档（保留复核），恢复执行器负责移除 soft 台账条目。

import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { createBackup } from "./backup.mjs";

export const CUSTODY_KEEP_PER_PLUGIN = 5;

function sha256Buf(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

export function custodyRoot(toolkitRoot) {
  return join(toolkitRoot, ".panel-custody");
}

function stampName(plugin, now = new Date()) {
  return plugin + "-" + now.toISOString().replace(/[:.]/g, "-");
}

/** 递归枚举目录内全部文件（相对路径，posix 风格）。 */
export function walkFiles(root, rel = "") {
  const out = [];
  const abs = rel ? join(root, rel) : root;
  for (const name of readdirSync(abs)) {
    const relNext = rel ? rel + "/" + name : name;
    const absNext = join(root, relNext);
    if (statSync(absNext).isDirectory()) out.push(...walkFiles(root, relNext));
    else out.push(relNext);
  }
  return out;
}

/**
 * 真卸载存档：把 lib/<plugin> 全量镜像到保管区 body/，逐文件 sha256 记录进 manifest，
 * 并保存 patch 恢复事实（行块原文 / 插回位置 / 宿主行原值 / patch 预写副本 / 预设状态快照）。
 * 返回 { custodyDir, manifest }。**不删除任何源文件**（删除在存档校验通过后由执行器做）。
 */
export function archiveForTrueUninstall({
  toolkitRoot,
  plugin,
  pkg,
  rowBlock,
  insertAt,
  hostKeyRaw,
  hostKeyLineIndex,
  prevTopRaw,
  nextTopRaw,
  presetStateSnapshot,
  userReason,
  confirmCopy,
  patchText,
}) {
  const libDir = join(toolkitRoot, "lib", plugin);
  if (!existsSync(libDir)) {
    const err = new Error("lib/" + plugin + " 不存在，无需存档");
    err.code = "body-missing";
    throw err;
  }
  const root = custodyRoot(toolkitRoot);
  const dir = join(root, stampName(plugin));
  mkdirSync(join(dir, "body"), { recursive: true });
  mkdirSync(join(dir, "patch"), { recursive: true });

  const files = [];
  for (const rel of walkFiles(libDir)) {
    const srcAbs = join(libDir, rel);
    const buf = readFileSync(srcAbs);
    copyFileSync(srcAbs, join(dir, "body", rel));
    files.push({ rel, origAbs: srcAbs, sha256: sha256Buf(buf), bytes: buf.length });
  }

  if (patchText !== undefined) writeFileSync(join(dir, "patch", "cordis.patch.yml.pre"), patchText, "utf8");
  if (rowBlock != null) writeFileSync(join(dir, "patch", "row-block.txt"), rowBlock, "utf8");

  const manifest = {
    schemaVersion: 1,
    kind: "true-uninstall",
    plugin,
    pkg: pkg || null,
    createdAt: new Date().toISOString(),
    userReason: userReason || null,
    confirmCopy: confirmCopy || null,
    libDir,
    body: files,
    restore: {
      rowBlock: rowBlock || null,
      insertAt: typeof insertAt === "number" ? insertAt : null,
      prevTopRaw: prevTopRaw || null,
      nextTopRaw: nextTopRaw || null,
      hostKey: hostKeyRaw
        ? { raw: hostKeyRaw, lineIndex: typeof hostKeyLineIndex === "number" ? hostKeyLineIndex : null }
        : null,
      presetStateSnapshot: presetStateSnapshot || null,
    },
  };
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  pruneCustody(toolkitRoot, plugin);
  return { custodyDir: dir, manifest };
}

/** 每插件滚动窗口：保留最新 CUSTODY_KEEP_PER_PLUGIN 份，超出删最旧（无 TTL）。 */
export function pruneCustody(toolkitRoot, plugin) {
  const root = custodyRoot(toolkitRoot);
  if (!existsSync(root)) return { kept: [], removed: [] };
  const mine = readdirSync(root)
    .filter((name) => name.startsWith(plugin + "-") && existsSync(join(root, name, "manifest.json")))
    .sort();
  const kept = [];
  const removed = [];
  for (let i = 0; i < mine.length; i++) {
    if (i < mine.length - CUSTODY_KEEP_PER_PLUGIN) {
      try {
        rmSync(join(root, mine[i]), { recursive: true, force: true });
        removed.push(mine[i]);
      } catch {
        kept.push(mine[i]);
      }
    } else {
      kept.push(mine[i]);
    }
  }
  return { kept, removed };
}

/** 列出保管区条目（真卸载恢复档 + 软卸载台账摘要），供 GET /custody 与卡片恢复入口。 */
export function listCustody(toolkitRoot) {
  const root = custodyRoot(toolkitRoot);
  const entries = [];
  if (existsSync(root)) {
    for (const name of readdirSync(root).sort().reverse()) {
      const mpath = join(root, name, "manifest.json");
      if (!existsSync(mpath)) continue;
      try {
        const m = JSON.parse(readFileSync(mpath, "utf8"));
        entries.push({
          custodyId: name,
          plugin: m.plugin,
          pkg: m.pkg || null,
          kind: m.kind || "true-uninstall",
          createdAt: m.createdAt,
          userReason: m.userReason || null,
          fileCount: Array.isArray(m.body) ? m.body.length : 0,
          totalBytes: Array.isArray(m.body) ? m.body.reduce((s, f) => s + (f.bytes || 0), 0) : 0,
        });
      } catch {
        // 单条 manifest 损坏不拖垮整表（如实标注）
        entries.push({ custodyId: name, plugin: null, kind: "corrupt-manifest" });
      }
    }
  }
  return entries;
}

export function readCustodyManifest(toolkitRoot, custodyId) {
  if (!/^[A-Za-z0-9._-]+$/.test(custodyId)) {
    const err = new Error("custodyId 形态非法");
    err.code = "custody-id-invalid";
    throw err;
  }
  const mpath = join(custodyRoot(toolkitRoot), custodyId, "manifest.json");
  if (!existsSync(mpath)) {
    const err = new Error("保管区条目不存在：" + custodyId);
    err.code = "custody-not-found";
    throw err;
  }
  return JSON.parse(readFileSync(mpath, "utf8"));
}

/**
 * 恢复前再校验：保管区 body 逐文件 sha 与 manifest 一致。
 * 任一不符即抛（fail-closed：校验不过不写回、不删档）。
 */
export function verifyCustodyBody(toolkitRoot, custodyId, manifest) {
  const bodyRoot = join(custodyRoot(toolkitRoot), custodyId, "body");
  const mismatches = [];
  for (const f of manifest.body || []) {
    const abs = join(bodyRoot, f.rel);
    if (!existsSync(abs)) {
      mismatches.push({ rel: f.rel, reason: "missing" });
      continue;
    }
    const got = sha256Buf(readFileSync(abs));
    if (got !== f.sha256) mismatches.push({ rel: f.rel, reason: "sha-mismatch", got });
  }
  if (mismatches.length > 0) {
    const err = new Error("保管区校验不通过（" + mismatches.length + " 个文件）：恢复中止");
    err.code = "custody-verify-failed";
    err.detail = mismatches;
    throw err;
  }
  return { ok: true, fileCount: (manifest.body || []).length };
}

// ---------------- 软卸载状态台账 ----------------

function softStatePath(toolkitRoot) {
  return join(custodyRoot(toolkitRoot), "soft-uninstalls.json");
}

function loadSoftState(toolkitRoot) {
  const p = softStatePath(toolkitRoot);
  if (!existsSync(p)) return {};
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveSoftState(toolkitRoot, state) {
  mkdirSync(custodyRoot(toolkitRoot), { recursive: true });
  writeFileSync(softStatePath(toolkitRoot), JSON.stringify(state, null, 2), "utf8");
}

/**
 * 记录一次面板发起的软卸载（行块原文 + 插回位置 + 宿主键原值 + 预设方向）。
 * key = patch 行 id；compact-router 用插件目录名（其无 patch 行）。
 */
export function recordSoftUninstall(toolkitRoot, key, record) {
  const state = loadSoftState(toolkitRoot);
  state[key] = { ...record, recordedAt: new Date().toISOString() };
  saveSoftState(toolkitRoot, state);
}

export function getSoftRecord(toolkitRoot, key) {
  return loadSoftState(toolkitRoot)[key] || null;
}

export function hasSoftRecord(toolkitRoot, key) {
  return !!loadSoftState(toolkitRoot)[key];
}

/** 软恢复成功后移除台账条目（面板发起 → 面板清账；他处恢复的留给 installed-unmounted 判定）。 */
export function clearSoftRecord(toolkitRoot, key) {
  const state = loadSoftState(toolkitRoot);
  if (state[key]) {
    delete state[key];
    saveSoftState(toolkitRoot, state);
  }
}

/**
 * 真卸载执行器的恢复写回：从保管区还原 body 至原位。
 * 写回前对每个目标位置再备份一层（恢复亦有痕，L-036 ④ 先例）。
 */
export function restoreBody(toolkitRoot, custodyId, manifest, { backupRoot }) {
  verifyCustodyBody(toolkitRoot, custodyId, manifest);
  const bodyRoot = join(custodyRoot(toolkitRoot), custodyId, "body");
  const targets = [];
  for (const f of manifest.body || []) {
    const dest = join(toolkitRoot, "lib", manifest.plugin, f.rel);
    targets.push(dest);
  }
  let backupDir = null;
  if (backupRoot && existsSync(join(toolkitRoot, "lib", manifest.plugin))) {
    backupDir = createBackup({
      backupRoot,
      files: targets.filter((t) => existsSync(t)),
      reason: "panel-restore-pre-write",
      note: "恢复 " + manifest.plugin + " 前对现存同名文件的再备份（custody=" + custodyId + "）",
    });
  }
  for (const f of manifest.body || []) {
    const dest = join(toolkitRoot, "lib", manifest.plugin, f.rel);
    mkdirSync(join(dest, ".."), { recursive: true });
    copyFileSync(join(bodyRoot, f.rel), dest);
  }
  // 复验：写回后逐文件 sha 与保管区一致
  for (const f of manifest.body || []) {
    const dest = join(toolkitRoot, "lib", manifest.plugin, f.rel);
    const got = sha256Buf(readFileSync(dest));
    if (got !== f.sha256) {
      const err = new Error("恢复复验失败：" + relative(toolkitRoot, dest));
      err.code = "restore-verify-failed";
      throw err;
    }
  }
  return { restored: (manifest.body || []).length, backupDir };
}
