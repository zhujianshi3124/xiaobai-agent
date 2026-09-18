// P2.4 保管区（p24-design-v2-destroy.md §2/§3）：真卸载**收据** + 软卸载状态台账 + 行块邻接留痕。
//
// 结构：<repoRoot>/.panel-custody/
//   <plugin>-<UTCstamp>/manifest.json   —— 真卸载**收据**（kind = true-uninstall-receipt）
//                                           deleted.body[]（逐文件 rel/origAbs/sha256/bytes）+ totals
//                                           rebuild.{rowBlock,hostKey,presetStateSnapshot}（重装挂载用）
//                                          **无 body/**（销毁式硬约束：不保留任何源码副本）
//   soft-uninstalls.json                —— 软卸载状态台账（行块原文/插回位置/宿主键，
//                                          支撑六态区分与软恢复，恢复成功后移除条目）
//   row-adjacency.json                  —— 行块邻接留痕（D-UI-05，只增不减，与清账解耦）
//
// 纪律（销毁式 v2）：
//   - 真卸载**不留副本**：收据只记「清单 + 逐文件 sha + 配置元数据」，不复制文件内容；
//     恢复途径 = 开源后重新下载 → 面板检测「已安装未挂载」→ 挂载。
//   - **收据先行**：调用方必须在删除之前写收据并令其成功（fail-closed）；本模块自身不删任何东西。
//   - 滚动窗口：每插件最多 5 份收据（纯 JSON，体积极小），超出物理删除最旧，无 TTL（§3.3）。
//   - 恢复成功不自动清档（软台账由恢复执行器移除）；真卸载已无「恢复档」概念。

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

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
 * 真卸载**收据**（销毁式 v2，p24-design-v2-destroy.md §1/§2）：
 * 枚举 lib/<plugin> 文件清单并**就地计算逐个 sha256 / 字节数**（只读，**不复制任何文件内容**），
 * 写入 .panel-custody/<plugin>-<stamp>/manifest.json（kind = true-uninstall-receipt，**无 body/**）。
 *
 * 收据 = **删除的账**，不是**恢复的档**：
 *   - `deleted.body[]` + `deleted.totals` 供事后**对账**（删了什么、指纹是什么）；
 *   - `rebuild.*` 携带**配置元数据**（行块原文 / 宿主键 / 预设状态快照）——非源码内容，
 *     用于「重装后从面板挂载」（§5）；**不含任何源代码文件内容，不能用于恢复**。
 *
 * 纪律：调用方必须在**删除之前**调用本函数且令其成功（fail-closed）；本模块自身不删除任何东西。
 * 返回 { receiptDir, manifest }。
 */
export function writeDestroyReceipt({
  toolkitRoot,
  plugin,
  pkg,
  rowBlock,
  insertAt,
  hostKey,
  prevTopRaw,
  nextTopRaw,
  presetStateSnapshot,
  userReason,
  confirmCopy,
}) {
  const libDir = join(toolkitRoot, "lib", plugin);
  if (!existsSync(libDir)) {
    const err = new Error("lib/" + plugin + " 不存在，无需真卸载");
    err.code = "body-missing";
    throw err;
  }
  const deleted = [];
  let totalBytes = 0;
  for (const rel of walkFiles(libDir)) {
    const srcAbs = join(libDir, rel);
    const buf = readFileSync(srcAbs);
    deleted.push({ rel, origAbs: srcAbs, sha256: sha256Buf(buf), bytes: buf.length });
    totalBytes += buf.length;
  }

  const root = custodyRoot(toolkitRoot);
  const dir = join(root, stampName(plugin));
  mkdirSync(dir, { recursive: true }); // 只建收据目录，**不建 body/**

  const manifest = {
    schemaVersion: 2,
    kind: "true-uninstall-receipt",
    plugin,
    pkg: pkg || null,
    createdAt: new Date().toISOString(),
    userReason: userReason || null,
    confirmCopy: confirmCopy || null,
    libDir,
    /** 销毁式硬约束：本目录下**不得**出现 body/（持久化前显式声明，便于断言与审计）。 */
    bodyStored: false,
    deleted: {
      body: deleted,
      totals: { files: deleted.length, bytes: totalBytes },
    },
    rebuild: {
      rowBlock: rowBlock || null,
      insertAt: typeof insertAt === "number" ? insertAt : null,
      prevTopRaw: prevTopRaw || null,
      nextTopRaw: nextTopRaw || null,
      hostKey: hostKey || null,
      presetStateSnapshot: presetStateSnapshot || null,
    },
  };
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  pruneCustody(toolkitRoot, plugin);
  return { receiptDir: dir, manifest };
}

/**
 * 迁移工具（p24-design-v2-destroy.md §3.2，Q6 默认**不自动执行**）：
 * 把改造前遗留的**存档式**档位（含 body/ 副本）就地转为**收据**——删 body 目录、kind 改收据、
 * 记 bodyPurgedAt/purgeReason，**保留 `deleted.body[]` 对账能力**。仅在有既有存档时使用（实测当前无）。
 */
export function purgeCustodyBodies(toolkitRoot) {
  const root = custodyRoot(toolkitRoot);
  const purged = [];
  if (!existsSync(root)) return { purged };
  for (const name of readdirSync(root)) {
    const dir = join(root, name);
    const mpath = join(dir, "manifest.json");
    if (!existsSync(mpath)) continue;
    let m;
    try {
      m = JSON.parse(readFileSync(mpath, "utf8"));
    } catch {
      continue;
    }
    const hadBody = existsSync(join(dir, "body"));
    const legacyBody = Array.isArray(m.body) ? m.body : null; // v1 存档式字段名
    if (!hadBody && !legacyBody) continue;
    if (hadBody) rmSync(join(dir, "body"), { recursive: true, force: true });
    m.schemaVersion = 2;
    m.kind = "true-uninstall-receipt";
    m.bodyStored = false;
    if (legacyBody) {
      m.deleted = { body: legacyBody, totals: { files: legacyBody.length, bytes: legacyBody.reduce((s, f) => s + (f.bytes || 0), 0) } };
      delete m.body;
    }
    m.bodyPurgedAt = new Date().toISOString();
    m.purgeReason = "destroy-mode-migration";
    writeFileSync(mpath, JSON.stringify(m, null, 2), "utf8");
    purged.push(name);
  }
  return { purged };
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

/** 列出保管区**收据**条目（真卸载对账用），供 GET /custody 与卡片「已卸载（无副本）」态。 */
export function listCustody(toolkitRoot) {
  const root = custodyRoot(toolkitRoot);
  const entries = [];
  if (existsSync(root)) {
    for (const name of readdirSync(root).sort().reverse()) {
      const mpath = join(root, name, "manifest.json");
      if (!existsSync(mpath)) continue;
      try {
        const m = JSON.parse(readFileSync(mpath, "utf8"));
        // v2 收据：deleted.body[]；v1 存档式遗留：body[]（迁移后被 purgeCustodyBodies 归一）
        const files = (m.deleted && Array.isArray(m.deleted.body) ? m.deleted.body : null)
          || (Array.isArray(m.body) ? m.body : []);
        entries.push({
          custodyId: name,
          plugin: m.plugin,
          pkg: m.pkg || null,
          kind: m.kind || "true-uninstall-receipt",
          createdAt: m.createdAt,
          userReason: m.userReason || null,
          fileCount: files.length,
          totalBytes: files.reduce((s, f) => s + (f.bytes || 0), 0),
          /** 收据可供「重装后挂载」复用行块与宿主键事实。 */
          mountable: !!(m.rebuild && m.rebuild.rowBlock),
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

/** 全量软卸载台账条目（D-UI-03：宿主键插回位换算需扫同段兄弟键的留痕）。 */
export function listSoftRecords(toolkitRoot) {
  const state = loadSoftState(toolkitRoot);
  return Object.keys(state).map((k) => state[k]);
}

// ---------------- 行块邻接留痕（D-UI-05） ----------------

function rowAdjacencyPath(toolkitRoot) {
  return join(custodyRoot(toolkitRoot), "row-adjacency.json");
}

/**
 * 追加「行块邻接事实」：`{ before, after }` = 该块原本紧跟在 before 行锚之后、紧邻 after 行锚之前。
 * 为什么不复用软卸载台账：软恢复成功即清账（p24-verify ③ 断言），而邻接事实是恢复定位的
 * 长期依据（乱序恢复也要复原原布局）——故单独落一份只增不减的留痕，与清账解耦。
 */
export function recordRowAdjacency(toolkitRoot, edges) {
  const p = rowAdjacencyPath(toolkitRoot);
  let state = { schemaVersion: 1, edges: [] };
  if (existsSync(p)) {
    try {
      const parsed = JSON.parse(readFileSync(p, "utf8"));
      if (parsed && Array.isArray(parsed.edges)) state = parsed;
    } catch {
      /* 证据文件损坏 ⇒ 从空重建，不阻断主流程 */
    }
  }
  const key = (e) => String(e.before) + "\u0000" + String(e.after);
  const seen = new Set(state.edges.map(key));
  for (const e of edges || []) {
    if (!e || !e.before || !e.after) continue;
    const k = key(e);
    if (seen.has(k)) continue;
    seen.add(k);
    state.edges.push({ before: e.before, after: e.after });
  }
  mkdirSync(custodyRoot(toolkitRoot), { recursive: true });
  writeFileSync(p, JSON.stringify(state, null, 2), "utf8");
}

export function listRowAdjacencies(toolkitRoot) {
  const p = rowAdjacencyPath(toolkitRoot);
  if (!existsSync(p)) return [];
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8"));
    return parsed && Array.isArray(parsed.edges) ? parsed.edges : [];
  } catch {
    return [];
  }
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

// 注（销毁式 v2，L-060）：原 `restoreBody()` 与 `verifyCustodyBody()` 随「存档式恢复」一并**移除**
// —— 真卸载不再保留文件副本，面板侧**不存在**任何真卸载恢复写回路径（恢复 = 开源后重装 → 挂载）。
