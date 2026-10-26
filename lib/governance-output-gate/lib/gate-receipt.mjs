#!/usr/bin/env node
/**
 * gate-receipt.mjs — turn an exec task journal into a write receipt.
 *
 * The gate appends every allowed exec write (tool or shell) to
 * ~/.dsh/gate-tasks/<taskId>.journal.jsonl. This script is READ-ONLY: it
 * computes the current size/sha256 of each written file and prints a receipt
 * the exec can attach to its report and the reviewer/supervisor can verify.
 *
 * Usage:
 *   node gate-receipt.mjs <taskId>          # Markdown
 *   node gate-receipt.mjs <taskId> --json   # machine-readable
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const TASK_ROOT = join(homedir(), ".dsh", "gate-tasks");

function usage() {
	console.error("Usage: node gate-receipt.mjs <taskId> [--json]");
}

const argv = process.argv.slice(2);
const taskId = argv.find((a) => !a.startsWith("--"));
const asJson = argv.includes("--json");
if (taskId === undefined || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(taskId)) {
	usage();
	process.exit(2);
}

const journal = join(TASK_ROOT, taskId + ".journal.jsonl");
if (!existsSync(journal)) {
	console.error("No journal for task " + taskId + ": " + journal);
	process.exit(1);
}

const entries = [];
for (const line of readFileSync(journal, "utf8").split(/\r?\n/)) {
	if (line.trim() === "") continue;
	try {
		const entry = JSON.parse(line);
		if (entry !== null && typeof entry === "object") entries.push(entry);
	} catch {
		// A torn line is reported below as a count, not silently trusted.
		entries.push({ kind: "malformed", raw: line.slice(0, 200) });
	}
}

function fingerprint(entry) {
	const target = entry.target;
	if (typeof target !== "string" || target.length === 0) return { target: null, status: "NO-TARGET" };
	const abs = typeof entry.cwd === "string" && entry.cwd.length > 0 ? resolve(entry.cwd, target) : resolve(target);
	if (!existsSync(abs)) return { target: abs, status: "MISSING" };
	try {
		const bytes = readFileSync(abs);
		return {
			target: abs,
			status: "OK",
			size: bytes.length,
			sha256: createHash("sha256").update(bytes).digest("hex"),
		};
	} catch (error) {
		return { target: abs, status: "ERROR:" + String(error?.message ?? error).slice(0, 80) };
	}
}

const byTarget = new Map();
for (const entry of entries) {
	if (entry.kind !== "exec-write") continue;
	const key = String(entry.target ?? "(none)");
	const prev = byTarget.get(key);
	const fp = fingerprint(entry);
	if (prev === undefined || (prev.status !== "OK" && fp.status === "OK")) {
		byTarget.set(key, { ...fp, tool: entry.tool, time: entry.time, count: (prev?.count ?? 0) + 1 });
	} else {
		prev.count++;
	}
}
const writes = [...byTarget.values()];
const shellWrites = entries.filter((e) => e.kind === "shell-write-exec");
const malformed = entries.filter((e) => e.kind === "malformed").length;

const result = {
	taskId,
	generatedAt: new Date().toISOString(),
	journal,
	writes,
	shellWrites: shellWrites.map((e) => ({ time: e.time, tool: e.tool, argsPreview: e.argsPreview })),
	malformed,
};

if (asJson) {
	console.log(JSON.stringify(result, null, 2));
	process.exit(malformed === 0 ? 0 : 1);
}

const lines = [];
lines.push("# WRITE RECEIPT — task " + taskId);
lines.push("");
lines.push("Generated: " + result.generatedAt);
lines.push("Journal: " + journal);
lines.push("");
lines.push("| # | target | status | size | sha256 | tool | time |");
lines.push("|---:|---|---|---:|---|---|---|");
writes.forEach((w, i) => {
	lines.push("| " + (i + 1) + " | " + String(w.target) + " | " + w.status + " | " + (w.size ?? "") + " | " + (w.sha256 ?? "") + " | " + String(w.tool ?? "") + " | " + String(w.time ?? "") + " |");
});
if (writes.length === 0) lines.push("| - | (no file writes) | - | - | - | - | - |");
lines.push("");
lines.push("Shell writes (target not parsed; see the session log): " + shellWrites.length);
for (const s of shellWrites) lines.push("- " + String(s.time ?? "") + "  " + String(s.argsPreview ?? ""));
if (malformed > 0) lines.push("");
if (malformed > 0) lines.push("⚠ malformed journal lines: " + malformed);
console.log(lines.join("\n"));
process.exit(malformed === 0 ? 0 : 1);
