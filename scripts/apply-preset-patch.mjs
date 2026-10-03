#!/usr/bin/env node
// apply-preset-patch.mjs — mount xiaobai-agent/compact-router into the SHIPPED
// presets (standard / ptc / cordis) and ACTIVE USER presets under ~/.dsh/.agent-presets
// by swapping their compaction-basic / old local-route row.
//
//   node scripts/apply-preset-patch.mjs            # apply (idempotent)
//   node scripts/apply-preset-patch.mjs --undo     # restore all patched presets
//   node scripts/apply-preset-patch.mjs --status   # show current state
//
// 0.2.0 profile-patch channel (EXE-BOOT-031, design v2 §七): on a 0.2.x host the
// legacy agent.cordis.yml files no longer exist. The tool instead appends ONE
// marker-delimited variant preset block PER isomorphic base to the profile's
// cordis.patch.yml. Bases are enumerated live from the environment: the
// dsh-agent-preset rows declared by the profile's bundles (official bundle
// presets, third-party bundles alike) plus user-layer dsh-agent-preset rows
// already present in the profile patch. Each base carrying a compaction-basic
// member gets a same-position replacement variant (group/isolate structure and
// sibling members preserved, brand-new preset id); a base without one (minimal)
// is skipped with a visible line; a base whose shape does not match the anchor
// is REFUSED — never blind-written. Rollback: --undo --only <variant-id> (or
// delete the block).
//
// Safety rails (legacy channel):
//   * The ORIGINAL file is backed up to preset-backups/<id>.agent.cordis.yml.bak
//     before the first write; --undo restores from that backup.
//   * A marker (preset-patch-state.json) records original/patched SHA-256. If a
//     preset file matches NEITHER hash on apply, the script refuses: the dsh
//     install changed upstream — re-adapt instead of blind-patching.
//   * minimal is deliberately never touched (it has no compaction by design).
//   * Backup dirs such as liangshen.bak-YYYYMMDD are NOT treated as active user
//     presets; only directories with agent.cordis.yml and no ".bak" in the name.
// Safety rails (profile-patch channel):
//   * Channel decision = form detection + installation version cross-check; an
//     explicitly set DSH_HOME never silently falls back to the legacy channel
//     (a sandbox home must never route writes onto real legacy preset files).
//   * The profile patch is backed up (preset-backups/) before the first write;
//     --undo removes only marker-delimited blocks — it never restores the whole
//     file over newer user edits.
//   * An existing block whose content matches neither the ledger nor the freshly
//     generated text is REFUSED (Web-editor user edits are never clobbered);
//     a block that matches the ledger but not the regenerated text is regenerated
//     (official base moved upstream — the variant follows on the next apply).
//
// Environment: DSH_PRESETS_DIR (legacy presets dir), DSH_USER_PRESETS_DIR
// (legacy user presets dir; default ~/.dsh/.agent-presets), DSH_HOME (dsh home
// for the profile-patch channel), DSH_INSTALL_DIR (0.2.x dsh installation root;
// probed from cwd and the npm-global tree otherwise).

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PLUGIN_DIR = dirname(SCRIPT_DIR);
const BACKUP_DIR = join(PLUGIN_DIR, "preset-backups");
const MARKER = join(PLUGIN_DIR, "preset-patch-state.json");
const SHIPPED_PRESET_IDS = ["standard", "ptc", "cordis"];
const USER_PRESETS_DIR = process.env.DSH_USER_PRESETS_DIR ?? join(homedir(), ".dsh", ".agent-presets");

const ROW_UPSTREAM = [
  "    - id: compaction-basic",
  "      name: '@deepseek-ai/dsh-compaction-basic'",
].join("\n");

const ROW_NEW = [
  "    - id: compact-router",
  "      name: 'xiaobai-agent/compact-router'",
  "      config:",
  "        mode: auto",
  "        fallbackOnRateLimit: true",
  "        archive: true",
  "        agentMemoryRoot: C:\\Users\\LENOVO\\.agent-memory",
].join("\n");

const OLD_ROW_V2 = [
  "    - id: compact-router",
  "      name: '@local/dsh-compact-router'",
  "      config:",
  "        mode: auto",
  "        fallbackOnRateLimit: true",
  "        archive: true",
  "        agentMemoryRoot: C:\\Users\\LENOVO\\.agent-memory",
].join("\n");

const OLD_NAME_LINE = "      name: '@local/dsh-compact-router'";

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function locatePresetsDir() {
  const candidates = [];
  if (process.env.DSH_PRESETS_DIR) candidates.push(process.env.DSH_PRESETS_DIR);
  const npmGlobal = join(homedir(), "AppData", "Roaming", "npm", "node_modules", "@deepseek-ai", "dsh");
  candidates.push(join(npmGlobal, "node_modules", "@deepseek-ai", "dsh-agent-presets", "presets"));
  candidates.push(join(homedir(), "AppData", "Roaming", "npm", "node_modules", "@deepseek-ai", "dsh-agent-presets", "presets"));
  for (const c of candidates) {
    if (existsSync(join(c, "standard", "agent.cordis.yml"))) return c;
  }
  throw new Error(
    "cannot locate the shipped presets directory (looked in:\n  " +
      candidates.join("\n  ") +
      "\nset DSH_PRESETS_DIR or pass --presets-dir)",
  );
}

function discoverUserPresetIds() {
  if (!existsSync(USER_PRESETS_DIR)) return [];
  try {
    return readdirSync(USER_PRESETS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.includes(".bak"))
      .filter((d) => existsSync(join(USER_PRESETS_DIR, d.name, "agent.cordis.yml")))
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
}

function loadMarker() {
  try {
    return JSON.parse(readFileSync(MARKER, "utf8"));
  } catch {
    return {};
  }
}

function saveMarker(marker) {
  writeFileSync(MARKER, JSON.stringify(marker, null, 2));
}

function classify(entry, marker) {
  const id = entry.id;
  const file = entry.file;
  if (!existsSync(file)) return { id, file, state: "missing" };
  const text = readFileSync(file, "utf8");
  const hash = sha256(text);
  const rec = marker[id];
  if (text.includes(ROW_NEW)) {
    if (rec && rec.patchedSha === hash) return { id, file, state: "patched", hash };
    return { id, file, state: "unknown", hash };
  }
  if (text.includes(OLD_ROW_V2) || text.includes(OLD_NAME_LINE)) return { id, file, state: "old-plugin", hash };
  if (text.includes(ROW_UPSTREAM)) {
    if (rec && rec.originalSha && rec.originalSha !== hash) {
      return { id, file, state: "changed-upstream", hash };
    }
    return { id, file, state: "unpatched", hash, text };
  }
  if (rec && rec.patchedSha === hash) return { id, file, state: "patched", hash };
  return { id, file, state: "unknown", hash };
}

function applyOne(entry, marker) {
  if (entry.state === "patched") return entry.id + ": already patched (no-op)";
  if (entry.state === "old-plugin") {
    return entry.id + ": REFUSED — preset still carries old '@local/dsh-compact-router' row; run the old plugin's apply-preset-patch.mjs --undo first";
  }
  if (entry.state === "missing") return entry.id + ": SKIPPED (file missing)";
  if (entry.state === "unknown") return entry.id + ": REFUSED — expected row not found; inspect manually";
  if (entry.state === "changed-upstream") {
    return entry.id + ": REFUSED — file changed upstream since this patch was made; re-adapt the patch instead of blind-applying";
  }
  const backup = join(BACKUP_DIR, entry.id + ".agent.cordis.yml.bak");
  mkdirSync(BACKUP_DIR, { recursive: true });
  if (!existsSync(backup)) copyFileSync(entry.file, backup);
  const patched = entry.text.replace(ROW_UPSTREAM, ROW_NEW);
  if (patched === entry.text) return entry.id + ": REFUSED — replacement produced no change";
  const patchedSha = sha256(patched);
  marker[entry.id] = {
    file: entry.file,
    backup,
    originalSha: entry.hash,
    patchedSha,
    patchedAt: new Date().toISOString(),
  };
  saveMarker(marker);
  writeFileSync(entry.file, patched);
  return entry.id + ": PATCHED (original saved to " + backup + ")";
}

function undoOne(entry, marker) {
  if (entry.state !== "patched") return entry.id + ": nothing to undo (" + entry.state + ")";
  const rec = marker[entry.id];
  const backup = rec && rec.backup ? rec.backup : join(BACKUP_DIR, entry.id + ".agent.cordis.yml.bak");
  if (!existsSync(backup)) return entry.id + ": REFUSED — backup missing, cannot undo safely";
  copyFileSync(backup, entry.file);
  delete marker[entry.id];
  return entry.id + ": RESTORED from backup";
}

// ===================== 0.2.0 profile-patch channel =====================

const PRESET_PLUGIN_NAME = "@deepseek-ai/dsh-agent-preset";
const PROFILE_PATCH_FILENAME = "cordis.patch.yml";
const VARIANT_STATE_NS = "020";
const VARIANT_PREFIX = "xiaobai-compact-";
const MARKER_BEGIN = "# >>> xiaobai-agent preset variant BEGIN ";
const MARKER_END_PREFIX = "# <<< xiaobai-agent preset variant END ";
const GROUP_NAME_PATTERN = /^[ \t]*name: (?:cordis:group|['"]@deepseek-ai\/cordis-plugin-group['"])[ \t]*$/;

function shaOf(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function readJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function legacyDirCandidate() {
  try {
    return locatePresetsDir();
  } catch {
    return null;
  }
}

function findInstallDir() {
  const candidates = [];
  if (process.env.DSH_INSTALL_DIR) candidates.push(process.env.DSH_INSTALL_DIR);
  candidates.push(join(process.cwd(), "node_modules", "@deepseek-ai", "dsh"));
  candidates.push(join(homedir(), "AppData", "Roaming", "npm", "node_modules", "@deepseek-ai", "dsh"));
  for (const c of candidates) {
    if (existsSync(join(c, "package.json"))) return c;
  }
  return null;
}

function readInstallVersion(installDir) {
  const pkg = readJsonFile(join(installDir, "package.json"));
  return pkg && typeof pkg.version === "string" ? pkg.version : null;
}

/**
 * Channel decision (design v2 §7.5): form detection + installation version
 * cross-check. Explicit intent flags win; an explicitly set DSH_HOME never
 * silently falls back to the legacy channel.
 */
function decideChannel(argv) {
  if (argv.includes("--presets-dir")) return { channel: "legacy" };
  const forceProfilePatch = argv.includes("--profile-patch") || argv.includes("--profile");
  const homeExplicit = typeof process.env.DSH_HOME === "string" && process.env.DSH_HOME.length > 0;
  const dshHome = process.env.DSH_HOME ?? join(homedir(), ".dsh");
  const legacyDir = legacyDirCandidate();
  const installDir = findInstallDir();
  const installVersion = installDir ? readInstallVersion(installDir) : null;
  const is020 = installVersion !== null && /^0\.2\./.test(installVersion);
  let profileOk = false;
  let profileNames = [];
  try {
    const profilesDir = join(dshHome, "profiles");
    profileNames = readdirSync(profilesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    profileOk = profileNames.some((n) => existsSync(join(profilesDir, n, PROFILE_PATCH_FILENAME)));
  } catch {
    profileOk = false;
  }
  const why = { dshHome, homeExplicit, legacyDir: legacyDir ?? null, installDir, installVersion, profiles: profileNames, profileOk };

  if (forceProfilePatch) {
    if (!profileOk || !is020) {
      return {
        channel: "refuse",
        why,
        message:
          "profile-patch channel requested but not verifiable: profiles present=" + profileOk +
          ", installation version=" + String(installVersion) + " (expected 0.2.x; set DSH_INSTALL_DIR if the 0.2.0 installation is elsewhere)",
      };
    }
    return { channel: "profile-patch", dshHome, installDir, installVersion, why };
  }
  if (legacyDir && profileOk) {
    if (is020) return { channel: "profile-patch", dshHome, installDir, installVersion, why };
    if (homeExplicit) {
      return {
        channel: "refuse",
        why,
        message:
          "DSH_HOME is explicitly set but the located installation is not 0.2.x (" + String(installVersion) +
          "); refusing instead of silently running the legacy channel (set DSH_INSTALL_DIR to the 0.2.0 installation, or unset DSH_HOME)",
      };
    }
    return { channel: "legacy" };
  }
  if (legacyDir) return { channel: "legacy" };
  if (profileOk) {
    if (!is020) {
      return {
        channel: "refuse",
        why,
        message: "profile-patch form detected but installation version is " + String(installVersion) + " (expected 0.2.x)",
      };
    }
    return { channel: "profile-patch", dshHome, installDir, installVersion, why };
  }
  // Neither form verifiable: fall through to the legacy flow, whose
  // locatePresetsDir() reproduces the original error shape.
  return { channel: "legacy" };
}

function resolveProfile(dshHome, profileFlag) {
  const profilesDir = join(dshHome, "profiles");
  let names = [];
  try {
    names = readdirSync(profilesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return { error: "cannot read profiles directory " + profilesDir };
  }
  if (profileFlag) {
    if (!names.includes(profileFlag)) {
      return { error: "no such profile: " + profileFlag + " (available: " + (names.join(", ") || "none") + ")" };
    }
    return { profile: profileFlag, profilesDir };
  }
  if (names.length === 0) return { error: "no profiles under " + profilesDir };
  if (names.length > 1) {
    return { error: "multiple profiles under " + profilesDir + " (" + names.join(", ") + ") — pass --profile <name>" };
  }
  return { profile: names[0], profilesDir };
}

function bundleDirCandidates(name, profileDir, installDir) {
  const out = [join(profileDir, "node_modules", name)];
  if (installDir) {
    // installDir may be the dsh package itself (<tree>/node_modules/@deepseek-ai/dsh)
    // or a tree root handed over directly; probe both shapes.
    out.push(join(dirname(dirname(installDir)), name));
    out.push(join(installDir, "node_modules", name));
  }
  return out;
}

function locateBundleDir(name, profileDir, installDir) {
  for (const c of bundleDirCandidates(name, profileDir, installDir)) {
    if (existsSync(join(c, "package.json"))) return c;
  }
  return null;
}

function bundlePatchFilesFor(bundleDir) {
  const pkg = readJsonFile(join(bundleDir, "package.json"));
  const patch = pkg && pkg.dsh && pkg.dsh.bundle ? pkg.dsh.bundle.patch : null;
  const declared = typeof patch === "string" ? [patch] : Array.isArray(patch) ? patch : null;
  if (!declared) return null;
  return declared.map((f) => join(bundleDir, f));
}

function isBlankOrComment(line) {
  return /^[ \t]*\r?$/.test(line) || /^[ \t]*#/.test(line);
}

function indentOf(line) {
  return (/^([ \t]*)/.exec(line))[1].length;
}

/**
 * End of the plugins list that starts at pluginsIdx: the first structural line
 * at indent <= childIndent closes the block (blank/comment lines are transparent).
 */
function pluginsExtent(lines, pluginsIdx, childIndent) {
  for (let i = pluginsIdx + 1; i < lines.length; i++) {
    if (isBlankOrComment(lines[i])) continue;
    if (indentOf(lines[i]) <= childIndent) return i;
  }
  return lines.length;
}

function stripTrailingBlankAndComment(lines) {
  let end = lines.length;
  while (end > 0 && isBlankOrComment(lines[end - 1])) end--;
  return lines.slice(0, end);
}

/** Locate `- id: compaction-basic` + `name: dsh-compaction-basic` member anchors. */
function findMemberAnchors(lines) {
  const out = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const m = /^([ \t]*)- id: compaction-basic[ \t]*$/.exec(lines[i]);
    if (!m) continue;
    const nm = /^([ \t]*)name: ['"]@deepseek-ai\/dsh-compaction-basic['"][ \t]*$/.exec(lines[i + 1]);
    if (!nm || nm[1].length !== m[1].length + 2) continue;
    out.push({ lineIdx: i, indent: m[1].length });
  }
  return out;
}

/**
 * The compaction member must sit inside a recognized group (cordis:group with
 * group: true). The registry rejects preset mounts whose services leak into the
 * root realm, so the group/isolate shell is load-bearing, not cosmetic.
 */
function findEnclosingGroup(lines, anchorIdx, anchorIndent) {
  for (let i = anchorIdx - 1; i >= Math.max(0, anchorIdx - 12); i--) {
    const gm = /^([ \t]*)- id: (\S+)[ \t]*$/.exec(lines[i]);
    if (!gm) continue;
    const gIndent = gm[1].length;
    if (gIndent >= anchorIndent) continue;
    let hasGroupName = false;
    let hasGroupFlag = false;
    for (let k = i + 1; k <= Math.min(i + 5, anchorIdx); k++) {
      if (GROUP_NAME_PATTERN.test(lines[k])) hasGroupName = true;
      if (/^[ \t]*group: true[ \t]*$/.test(lines[k])) hasGroupFlag = true;
    }
    if (!hasGroupName || !hasGroupFlag) continue;
    let contained = true;
    for (let k = i + 1; k < anchorIdx; k++) {
      if (isBlankOrComment(lines[k])) continue;
      if (indentOf(lines[k]) <= gIndent) {
        contained = false;
        break;
      }
    }
    if (contained) return gm[2];
  }
  return null;
}

function compactMemberReplacementLines(indent) {
  return [
    indent + "- id: compact-router",
    indent + "  name: 'xiaobai-agent/compact-router'",
    indent + "  config:",
    indent + "    mode: auto",
    indent + "    fallbackOnRateLimit: true",
    indent + "    archive: true",
  ];
}

/**
 * Shared row analysis: locate the single dsh-agent-preset declaration, its
 * config.id/order and the plugins block. Returns meta or { refuse }.
 */
function analyzePresetRow(lines, sourceLabel) {
  let rowIdx = -1;
  let rowCount = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    if (!/^([ \t]*)- id: (\S+)[ \t]*$/.test(lines[i])) continue;
    if (!/^[ \t]*name: ['"]@deepseek-ai\/dsh-agent-preset['"][ \t]*$/.test(lines[i + 1])) continue;
    rowCount++;
    rowIdx = i;
  }
  if (rowCount === 0) return { notPreset: true };
  if (rowCount > 1) return { refuse: "more than one " + PRESET_PLUGIN_NAME + " declaration row" };
  const rowId = (/^([ \t]*)- id: (\S+)[ \t]*$/.exec(lines[rowIdx]))[2];
  let configIndent = -1;
  let configIdx = -1;
  for (let i = rowIdx + 1; i < Math.min(rowIdx + 10, lines.length); i++) {
    if (/^[ \t]*config:[ \t]*$/.test(lines[i])) {
      configIndent = indentOf(lines[i]);
      configIdx = i;
      break;
    }
  }
  if (configIndent < 0) return { refuse: "preset row has no config: block" };
  let configId = null;
  let order = null;
  let pluginsIdx = -1;
  for (let i = configIdx + 1; i < Math.min(configIdx + 20, lines.length); i++) {
    const line = lines[i];
    if (isBlankOrComment(line)) continue;
    const at = indentOf(line);
    if (at <= configIndent) break;
    if (at === configIndent + 2) {
      const im = /^[ \t]*id: (\S+)[ \t]*$/.exec(line);
      if (im && configId === null) configId = im[1];
      const om = /^[ \t]*order: (\d+)[ \t]*$/.exec(line);
      if (om && order === null) order = Number(om[1]);
      if (/^[ \t]*plugins:[ \t]*$/.test(line)) {
        pluginsIdx = i;
        break;
      }
    }
  }
  if (configId === null) return { refuse: "preset row config has no id" };
  if (pluginsIdx < 0) return { refuse: "preset row config has no plugins list" };
  return { rowId, configId, order: typeof order === "number" ? order : 0, pluginsIdx, configIndent };
}

/** Transform one base's plugins lines into variant plugins lines (member swapped). */
function transformPlugins(pluginsLines) {
  const anchors = findMemberAnchors(pluginsLines);
  if (anchors.length === 0) {
    if (/compaction-basic/.test(pluginsLines.join("\n"))) {
      return { refuse: "compaction member present but not in the recognized two-line anchor form (id line + name line); refusing instead of blind-writing" };
    }
    return { skip: "no compaction member (nothing to swap; e.g. minimal has no compaction by design)" };
  }
  if (anchors.length > 1) {
    return { refuse: anchors.length + " compaction-basic members found; the compaction service is one-per-context and a multi-member variant is ill-defined" };
  }
  const anchor = anchors[0];
  const groupId = findEnclosingGroup(pluginsLines, anchor.lineIdx, anchor.indent);
  if (groupId === null) {
    return { refuse: "compaction-basic member is not inside a recognized cordis:group group; a root-level member would leak its service into the root realm and the preset mount would fail" };
  }
  const plugins = pluginsLines.slice();
  plugins.splice(anchor.lineIdx, 2, ...compactMemberReplacementLines(" ".repeat(anchor.indent)));
  return { plugins, groupId };
}

function variantIdFor(baseId) {
  return VARIANT_PREFIX + baseId;
}

function variantBlock(variantId, displayName, order, pluginsLines) {
  return [
    MARKER_BEGIN + variantId + " (generated by apply-preset-patch.mjs; rollback: run --undo --only " + variantId + " or delete this block)",
    "- insert:",
    "    - id: " + variantId,
    "      name: '" + PRESET_PLUGIN_NAME + "'",
    "      config:",
    "        id: " + variantId,
    "        name: " + displayName,
    "        order: " + order,
    "        plugins:",
    ...pluginsLines,
    MARKER_END_PREFIX + variantId,
  ].join("\n");
}

function findMarkerBlocks(lines) {
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(MARKER_BEGIN)) {
      const id = lines[i].slice(MARKER_BEGIN.length).split(" ")[0];
      if (!id) return { unbalanced: lines[i], blocks: [] };
      let end = -1;
      for (let k = i + 1; k < lines.length; k++) {
        if (lines[k].startsWith(MARKER_BEGIN)) return { unbalanced: lines[k], blocks: [] };
        if (lines[k].startsWith(MARKER_END_PREFIX + id)) {
          end = k;
          break;
        }
      }
      if (end < 0) return { unbalanced: lines[i], blocks: [] };
      blocks.push({ id, begin: i, end, lines: lines.slice(i, end + 1) });
      i = end;
    }
  }
  return { blocks };
}

function structuralKind(patchText) {
  const lines = patchText.split(/\r?\n/);
  const structural = lines.filter((l) => !isBlankOrComment(l));
  if (structural.length === 0) return "comments-only";
  const first = structural[0].trim();
  if (first === "[]") return "empty-flow";
  if (first.startsWith("-")) return "list";
  return "other";
}

function ensureProfileBackup(profile, patchPath) {
  const backup = join(BACKUP_DIR, "profile-cordis-patch." + profile + ".bak");
  if (!existsSync(backup)) {
    mkdirSync(BACKUP_DIR, { recursive: true });
    copyFileSync(patchPath, backup);
  }
  return backup;
}

function appendBlock(patchText, block) {
  return patchText.replace(/[ \t\r\n]+$/, "") + "\n\n" + block + "\n";
}

/**
 * An empty-flow patch (`[]`, the shipped default of a fresh profile) cannot
 * grow block entries by appending — `[]` followed by block items is invalid
 * YAML. The whole file is rebuilt from the block instead (the pre-write
 * backup keeps the original); a comments-only file keeps its comments.
 */
function appendBlockForKind(patchText, block) {
  if (structuralKind(patchText) === "empty-flow") return block + "\n";
  return appendBlock(patchText, block);
}

function replaceBlock(patchText, existing, block) {
  const lines = patchText.split(/\r?\n/);
  lines.splice(existing.begin, existing.end - existing.begin + 1, ...block.split("\n"));
  return lines.join("\n");
}

function removeBlocks(patchText, targets) {
  const lines = patchText.split(/\r?\n/);
  const ranges = targets
    .map((b) => findMarkerBlocks(lines).blocks.find((x) => x.id === b.id))
    .filter(Boolean)
    .sort((a, b) => b.begin - a.begin);
  for (const r of ranges) lines.splice(r.begin, r.end - r.begin + 1);
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

function enumerateBases({ profileDir, installDir, patchText }) {
  const bases = [];
  const seenVariant = new Map();

  const pushBase = (base) => {
    if (base.variantId && seenVariant.has(base.variantId)) {
      base.refuse = "duplicate base preset id '" + base.baseId + "' (already enumerated from " + seenVariant.get(base.variantId) + ")";
      base.variantId = null;
    }
    if (base.variantId) seenVariant.set(base.variantId, base.baseSource);
    bases.push(base);
  };

  // --- bundle-layer bases (profile bundles × dsh.bundle.patch files)
  const pkg = readJsonFile(join(profileDir, "package.json"));
  const bundleNames = pkg && pkg.dsh && pkg.dsh.profile && Array.isArray(pkg.dsh.profile.bundles) ? pkg.dsh.profile.bundles : [];
  for (const name of bundleNames) {
    const dir = locateBundleDir(name, profileDir, installDir);
    if (!dir) {
      // The host itself skips missing bundles (skippedBundles); mirror that as
      // a visible skip instead of blocking unrelated variants.
      pushBase({ reportKey: "bundle:" + name, variantId: null, skip: "bundle package not found (the host skips it too)" });
      continue;
    }
    const files = bundlePatchFilesFor(dir);
    if (!files) continue;
    for (const f of files) {
      if (!existsSync(f)) continue;
      const text = readFileSync(f, "utf8");
      const lines = text.split(/\r?\n/);
      const label = "bundle " + name + " (" + f + ")";
      // Declaration-row adjacency is the sole preset-file test: a bare mention
      // (e.g. the dsh-agent-preset-registry service row) is not a base.
      const meta = analyzePresetRow(lines, label);
      if (meta.notPreset) continue;
      if (meta.refuse) {
        pushBase({ reportKey: label, variantId: null, refuse: meta.refuse });
        continue;
      }
      const baseId = meta.configId;
      if (baseId.startsWith("xiaobai-compact")) {
        pushBase({ reportKey: label, variantId: null, baseId, refuse: "base preset id '" + baseId + "' sits in the xiaobai-compact namespace; refusing to self-shadow" });
        continue;
      }
      const extent = pluginsExtent(lines, meta.pluginsIdx, meta.configIndent + 2);
      const pluginsLines = stripTrailingBlankAndComment(lines.slice(meta.pluginsIdx + 1, extent));
      const t = transformPlugins(pluginsLines);
      const base = {
        reportKey: label,
        variantId: variantIdFor(baseId),
        baseId,
        baseKind: "bundle",
        baseSource: label,
        baseFileSha: sha256(text),
        displayName: "xiaobai compact (" + baseId + ")",
        order: meta.order + 20,
      };
      if (t.refuse) base.refuse = t.refuse;
      if (t.skip) base.skip = t.skip;
      if (t.plugins) base.pluginsLines = t.plugins;
      pushBase(base);
    }
  }

  // --- user-layer bases (dsh-agent-preset rows in the profile patch itself,
  //     outside our marker blocks; unbalanced markers are refused by the
  //     caller's pre-scan before enumeration)
  const lines = patchText.split(/\r?\n/);
  const markerScan = findMarkerBlocks(lines);
  const masked = lines.map((l, i) => (markerScan.blocks.some((b) => i >= b.begin && i <= b.end) ? "" : l));
  for (let i = 0; i < masked.length - 1; i++) {
    const idm = /^([ \t]*)- id: (\S+)[ \t]*$/.exec(masked[i]);
    if (!idm) continue;
    if (!/^[ \t]*name: ['"]@deepseek-ai\/dsh-agent-preset['"][ \t]*$/.test(masked[i + 1])) continue;
    const label = "profile patch row '" + idm[2] + "'";
    const rowLines = lines.slice(i);
    const meta = analyzePresetRow(rowLines, label);
    if (meta.notPreset) continue;
    if (meta.refuse) {
      pushBase({ reportKey: label, variantId: null, refuse: meta.refuse });
      continue;
    }
    const baseId = meta.configId;
    if (baseId.startsWith("xiaobai-compact")) {
      pushBase({ reportKey: label, variantId: null, baseId, refuse: "base preset id '" + baseId + "' sits in the xiaobai-compact namespace; refusing to self-shadow" });
      continue;
    }
    const extent = pluginsExtent(rowLines, meta.pluginsIdx, meta.configIndent + 2);
    const pluginsLines = stripTrailingBlankAndComment(rowLines.slice(meta.pluginsIdx + 1, extent));
    const t = transformPlugins(pluginsLines);
    const base = {
      reportKey: label,
      variantId: variantIdFor(baseId),
      baseId,
      baseKind: "profile-row",
      baseSource: label,
      baseFileSha: shaOf(patchText),
      displayName: "xiaobai compact (" + baseId + ")",
      order: meta.order + 20,
    };
    if (t.refuse) base.refuse = t.refuse;
    if (t.skip) base.skip = t.skip;
    if (t.plugins) base.pluginsLines = t.plugins;
    pushBase(base);
  }
  return bases;
}

function parse020Args(argv) {
  let command = "";
  let only = null;
  let profile = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--status" || a === "--undo") {
      if (command && command !== a) {
        console.log("conflicting commands: --status and --undo cannot be combined");
        process.exit(2);
      }
      command = a;
    } else if (a === "--only") {
      const v = argv[i + 1];
      if (!v || v.startsWith("--")) {
        console.log("--only requires a variant id");
        process.exit(2);
      }
      only = v;
      i++;
    } else if (a === "--profile") {
      const v = argv[i + 1];
      if (!v || v.startsWith("--")) {
        console.log("--profile requires a profile name");
        process.exit(2);
      }
      profile = v;
      i++;
    } else if (a === "--profile-patch") {
      // channel selection flag, consumed by decideChannel
    } else {
      console.log("unknown option: " + a);
      console.log("usage: node scripts/apply-preset-patch.mjs [--profile-patch] [--profile <name>] [--status | --undo [--only <variant-id>]]");
      process.exit(2);
    }
  }
  if (only && command !== "--undo") {
    console.log("--only is only valid with --undo and requires a variant id");
    process.exit(2);
  }
  return { command, only, profile };
}

function runProfilePatchChannel(dispatch, argv) {
  const args = parse020Args(argv);
  const prof = resolveProfile(dispatch.dshHome, args.profile);
  if (prof.error) {
    console.log("REFUSED: " + prof.error);
    process.exit(2);
  }
  const profile = prof.profile;
  const profileDir = join(prof.profilesDir, profile);
  const patchPath = join(profileDir, PROFILE_PATCH_FILENAME);
  if (!existsSync(patchPath)) {
    console.log("REFUSED: " + patchPath + " does not exist (not a 0.2.0-style profile?)");
    process.exit(2);
  }
  const patchText = readFileSync(patchPath, "utf8");
  const marker = loadMarker();
  if (!marker[VARIANT_STATE_NS]) marker[VARIANT_STATE_NS] = {};
  const state020 = marker[VARIANT_STATE_NS];

  console.log("channel: profile-patch (0.2.x installation " + dispatch.installVersion + " at " + dispatch.installDir + ")");
  console.log("profile: " + profile + " (" + patchPath + ")");

  const bases = enumerateBases({ profileDir, installDir: dispatch.installDir, patchText });
  const kind = structuralKind(patchText);
  if (kind === "other") {
    console.log("REFUSED: profile patch is not a YAML list; refusing to touch it");
    process.exit(2);
  }
  const preScan = findMarkerBlocks(patchText.split(/\r?\n/));
  if (preScan.unbalanced) {
    console.log("REFUSED: unbalanced variant marker block (" + preScan.unbalanced.trim().slice(0, 80) + "…); inspect " + patchPath + " manually");
    process.exit(2);
  }

  if (args.command === "--status") {
    for (const base of bases) {
      if (base.refuse) {
        console.log(base.reportKey + ": REFUSED — " + base.refuse);
        continue;
      }
      if (base.skip) {
        console.log(base.reportKey + ": SKIPPED (" + base.skip + ")");
        continue;
      }
      const existing = findMarkerBlocks(patchText.split(/\r?\n/)).blocks.find((b) => b.id === base.variantId);
      let state = "absent";
      if (existing) {
        const existingSha = shaOf(existing.lines.join("\n"));
        state = state020[base.variantId] && state020[base.variantId].variantSha === existingSha ? "applied" : "drift (content differs from ledger)";
      }
      console.log(base.variantId + " (variant of " + base.baseSource + "): " + state);
    }
    process.exitCode = 0;
    return;
  }

  if (args.command === "--undo") {
    const scan = preScan;
    const results = [];
    let targets = scan.blocks;
    if (args.only) {
      targets = scan.blocks.filter((b) => b.id === args.only);
      if (targets.length === 0 && !state020[args.only]) {
        console.log("no such variant: " + args.only);
        process.exit(2);
      }
    }
    let nextText = patchText;
    let wrote = false;
    if (targets.length > 0) {
      const backup = join(BACKUP_DIR, "profile-cordis-patch." + profile + "." + new Date().toISOString().replace(/[:.]/g, "-") + ".bak");
      mkdirSync(BACKUP_DIR, { recursive: true });
      copyFileSync(patchPath, backup);
      nextText = removeBlocks(patchText, targets);
      if (structuralKind(nextText) === "comments-only") {
        // A comments-only file parses as YAML null, not as an empty list —
        // restore the explicit `[]` the host expects (comments preserved).
        const stripped = nextText.replace(/[ \t\r\n]+$/, "");
        nextText = (stripped.length > 0 ? stripped + "\n" : "") + "[]\n";
      }
      writeFileSync(patchPath, nextText);
      wrote = true;
      results.push(...targets.map((b) => b.id + ": RESTORED (variant block removed; pre-undo copy at " + backup + ")"));
    }
    for (const id of Object.keys(state020)) {
      if (args.only && id !== args.only) continue;
      if (targets.some((b) => b.id === id)) {
        delete state020[id];
        continue;
      }
      if (!scan.blocks.some((b) => b.id === id)) {
        delete state020[id];
        results.push(id + ": ledger entry dropped (block already absent)");
      }
    }
    if (wrote) saveMarker(marker);
    results.forEach((r) => console.log(r));
    if (results.length === 0) console.log("nothing to undo (no variant blocks on file)");
    else console.log("\nRemoved " + targets.length + " variant block(s). Restart dsh so the preset roster reloads.");
    process.exitCode = 0;
    return;
  }

  // apply
  const report = [];
  const refuses = [];
  let nextText = patchText;
  let wrote = false;
  for (const base of bases) {
    if (base.refuse) {
      refuses.push(base.reportKey);
      report.push(base.reportKey + ": REFUSED — " + base.refuse);
      continue;
    }
    if (base.skip) {
      report.push(base.reportKey + ": SKIPPED (" + base.skip + ")");
      continue;
    }
    const block = variantBlock(base.variantId, base.displayName, base.order, base.pluginsLines);
    const blockSha = shaOf(block);
    const existing = findMarkerBlocks(nextText.split(/\r?\n/)).blocks.find((b) => b.id === base.variantId);
    if (!existing) {
      nextText = appendBlockForKind(nextText, block);
      wrote = true;
      state020[base.variantId] = {
        profile,
        profileDir,
        presetId: base.variantId,
        baseKind: base.baseKind,
        baseSource: base.baseSource,
        baseFileSha: base.baseFileSha,
        variantSha: blockSha,
        patchedAt: new Date().toISOString(),
        backup: join(BACKUP_DIR, "profile-cordis-patch." + profile + ".bak"),
      };
      report.push(base.variantId + ": WRITTEN (variant of " + base.baseSource + ")");
      continue;
    }
    const existingSha = shaOf(existing.lines.join("\n"));
    if (existingSha === blockSha) {
      if (!state020[base.variantId]) {
        state020[base.variantId] = {
          profile,
          profileDir,
          presetId: base.variantId,
          baseKind: base.baseKind,
          baseSource: base.baseSource,
          baseFileSha: base.baseFileSha,
          variantSha: blockSha,
          patchedAt: new Date().toISOString(),
          backup: join(BACKUP_DIR, "profile-cordis-patch." + profile + ".bak"),
        };
        saveMarker(marker);
        report.push(base.variantId + ": already applied (no-op; ledger entry adopted)");
      } else {
        report.push(base.variantId + ": already applied (no-op)");
      }
      continue;
    }
    if (state020[base.variantId] && state020[base.variantId].variantSha === existingSha) {
      const previousVariantSha = existingSha;
      nextText = replaceBlock(nextText, existing, block);
      wrote = true;
      state020[base.variantId] = {
        ...state020[base.variantId],
        baseFileSha: base.baseFileSha,
        variantSha: blockSha,
        previousVariantSha,
        patchedAt: new Date().toISOString(),
      };
      report.push(base.variantId + ": REGENERATED (base changed upstream; previous written content replaced)");
      continue;
    }
    refuses.push(base.variantId);
    report.push(
      base.variantId + ": REFUSED — existing block differs from both the ledger and the freshly generated text" +
        " (Web-editor or manual edits?); inspect manually, or run --undo --only " + base.variantId,
    );
  }
  if (wrote) {
    const backup = ensureProfileBackup(profile, patchPath);
    writeFileSync(patchPath, nextText);
    saveMarker(marker);
    report.push("(profile patch pre-write backup: " + backup + ")");
  }
  report.forEach((r) => console.log(r));
  const variants = report.filter((r) => r.includes(": WRITTEN") || r.includes(": REGENERATED")).length;
  console.log(
    refuses.length > 0
      ? "\n" + refuses.length + " base(s) refused — nothing was written for them; fix manually before restarting dsh."
      : "\nDone. " + variants + " variant preset(s) on file. Restart dsh so the preset roster reloads.",
  );
  process.exitCode = refuses.length > 0 ? 1 : 0;
}

function runLegacyChannel() {
  const argv = process.argv.slice(2);
  const KNOWN_FLAGS = new Set(["--status", "--undo", "--only", "--presets-dir"]);
  const badFlag = argv.find((a) => a.startsWith("--") && !KNOWN_FLAGS.has(a));
  if (badFlag) {
    console.log("unknown option: " + badFlag);
    console.log("usage: node scripts/apply-preset-patch.mjs [--status | --undo] [--only <id>] [--presets-dir <path>]");
    process.exit(2);
  }
  let command = "";
  let only = null;
  let presetsDir = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--status" || a === "--undo") {
      if (command && command !== a) {
        console.log("conflicting commands: --status and --undo cannot be combined");
        process.exit(2);
      }
      command = a;
    } else if (a === "--only") {
      const v = argv[i + 1];
      if (!v || v.startsWith("--")) {
        console.log("--only requires a preset id");
        process.exit(2);
      }
      only = v;
      i++;
    } else if (a === "--presets-dir") {
      const v = argv[i + 1];
      if (!v || v.startsWith("--")) {
        console.log("--presets-dir requires a path");
        process.exit(2);
      }
      presetsDir = v;
      i++;
    } else {
      console.log("unexpected argument: " + a);
      console.log("usage: node scripts/apply-preset-patch.mjs [--status | --undo] [--only <id>] [--presets-dir <path>]");
      process.exit(2);
    }
  }
  if (only && command !== "--undo") {
    console.log("--only is only valid with --undo and requires a preset id");
    console.log("usage: node scripts/apply-preset-patch.mjs --undo --only <id>");
    process.exit(2);
  }
  if (!presetsDir) presetsDir = locatePresetsDir();
  const marker = loadMarker();
  const entries = [
    ...SHIPPED_PRESET_IDS.map((id) => ({ id, file: join(presetsDir, id, "agent.cordis.yml"), kind: "shipped" })),
    ...discoverUserPresetIds().map((id) => ({ id, file: join(USER_PRESETS_DIR, id, "agent.cordis.yml"), kind: "user" })),
  ].map((entry) => classify(entry, marker));

  console.log("presets dir: " + presetsDir);
  console.log("user presets dir: " + USER_PRESETS_DIR);
  if (command === "--status") {
    for (const e of entries) console.log(e.id + ": " + e.state);
  } else if (command === "--undo") {
    const targets = only ? entries.filter((e) => e.id === only) : entries;
    if (only && targets.length === 0) {
      console.log("no such preset: " + only);
      process.exit(2);
    }
    const results = targets.map((e) => undoOne(e, marker));
    saveMarker(marker);
    results.forEach((r) => console.log(r));
    console.log(only ? "\nPreset '" + only + "' restored." : "\nAll kit-patched presets restored.");
  } else if (command === "") {
    const results = entries.map((e) => applyOne(e, marker));
    results.forEach((r) => console.log(r));
    const refused = results.filter((r) => r.includes("REFUSED")).length;
    console.log(
      refused > 0
        ? "\n" + refused + " preset(s) refused — fix manually before restarting dsh."
        : "\nDone. Restart dsh so the presets re-mount with the toolkit compaction engine.",
    );
    process.exitCode = refused > 0 ? 1 : 0;
  } else {
    console.log("usage: node scripts/apply-preset-patch.mjs [--status | --undo] [--presets-dir <path>]");
    process.exitCode = 2;
  }
}

// ===================== channel dispatch (EXE-BOOT-031) =====================

const DISPATCH_ARGV = process.argv.slice(2);
const DISPATCH = decideChannel(DISPATCH_ARGV);
if (DISPATCH.channel === "refuse") {
  console.log("REFUSED: " + DISPATCH.message);
  console.log("context: " + JSON.stringify(DISPATCH.why, null, 2));
  process.exit(2);
}
if (DISPATCH.channel === "profile-patch") {
  runProfilePatchChannel(DISPATCH, DISPATCH_ARGV);
} else {
  runLegacyChannel();
}
