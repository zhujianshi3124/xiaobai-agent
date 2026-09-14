#!/usr/bin/env node
// apply-preset-patch.mjs — mount @local/dsh-toolkit/compact-router into the SHIPPED
// presets (standard / ptc / cordis) and ACTIVE USER presets under ~/.dsh/.agent-presets
// by swapping their compaction-basic / old local-route row.
//
//   node scripts/apply-preset-patch.mjs            # apply (idempotent)
//   node scripts/apply-preset-patch.mjs --undo     # restore all patched presets
//   node scripts/apply-preset-patch.mjs --status   # show current state
//
// Safety rails:
//   * The ORIGINAL file is backed up to preset-backups/<id>.agent.cordis.yml.bak
//     before the first write; --undo restores from that backup.
//   * A marker (preset-patch-state.json) records original/patched SHA-256. If a
//     preset file matches NEITHER hash on apply, the script refuses: the dsh
//     install changed upstream — re-adapt instead of blind-patching.
//   * minimal is deliberately never touched (it has no compaction by design).
//   * Backup dirs such as liangshen.bak-YYYYMMDD are NOT treated as active user
//     presets; only directories with agent.cordis.yml and no ".bak" in the name.

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
const USER_PRESETS_DIR = join(homedir(), ".dsh", ".agent-presets");

const ROW_UPSTREAM = [
  "    - id: compaction-basic",
  "      name: '@deepseek-ai/dsh-compaction-basic'",
].join("\n");

const ROW_NEW = [
  "    - id: compact-router",
  "      name: '@local/dsh-toolkit/compact-router'",
  "      config:",
  "        mode: auto",
  "        fallbackOnRateLimit: true",
  "        archive: true",
  "        agentMemoryRoot: C:\Users\LENOVO\.agent-memory",
].join("\n");

const OLD_ROW_V2 = [
  "    - id: compact-router",
  "      name: '@local/dsh-compact-router'",
  "      config:",
  "        mode: auto",
  "        fallbackOnRateLimit: true",
  "        archive: true",
  "        agentMemoryRoot: C:\Users\LENOVO\.agent-memory",
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

const arg = process.argv[2] || "";
const presetsDir = process.argv.includes("--presets-dir")
  ? process.argv[process.argv.indexOf("--presets-dir") + 1]
  : locatePresetsDir();
const marker = loadMarker();
const entries = [
  ...SHIPPED_PRESET_IDS.map((id) => ({ id, file: join(presetsDir, id, "agent.cordis.yml"), kind: "shipped" })),
  ...discoverUserPresetIds().map((id) => ({ id, file: join(USER_PRESETS_DIR, id, "agent.cordis.yml"), kind: "user" })),
].map((entry) => classify(entry, marker));

console.log("presets dir: " + presetsDir);
console.log("user presets dir: " + USER_PRESETS_DIR);
if (arg === "--status") {
  for (const e of entries) console.log(e.id + ": " + e.state);
} else if (arg === "--undo") {
  const results = entries.map((e) => undoOne(e, marker));
  saveMarker(marker);
  results.forEach((r) => console.log(r));
  console.log("\nAll kit-patched presets restored.");
} else if (arg === "") {
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
