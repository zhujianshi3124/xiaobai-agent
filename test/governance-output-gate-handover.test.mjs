import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { handoverSatisfied, HANDOVER_MARKER } = await import("../lib/governance-output-gate/lib/gate-guard.js");

function workspace() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-handover-"));
	fs.mkdirSync(path.join(dir, "协作规则"), { recursive: true });
	return dir;
}

test("a handover written in this session with the marker satisfies the rotate rule", () => {
	const dir = workspace();
	const file = path.join(dir, "协作规则", "交接文档-20261030-1900-第四十二会话.md");
	fs.writeFileSync(file, "# 交接\n\n" + HANDOVER_MARKER + "\n", "utf8");
	const createdAt = Date.now() - 60_000;
	const t = new Date(Date.now() - 1_000);
	fs.utimesSync(file, t, t);
	const result = handoverSatisfied(dir, "ignored", createdAt);
	assert.equal(result.ok, true);
	assert.equal(result.file, file);
});

test("an old handover, or one without the marker, does not satisfy the rule", () => {
	const dir = workspace();
	const oldFile = path.join(dir, "协作规则", "交接文档-20261030-1200-旧会话.md");
	fs.writeFileSync(oldFile, HANDOVER_MARKER + "\n", "utf8");
	const createdAt = Date.now() - 60_000;
	const old = new Date(Date.now() - 120_000);
	fs.utimesSync(oldFile, old, old);
	assert.equal(handoverSatisfied(dir, "ignored", createdAt).ok, false);

	const unmarked = path.join(dir, "协作规则", "交接文档-20261030-1900-无标记.md");
	fs.writeFileSync(unmarked, "# 交接\n\n没有标记\n", "utf8");
	const now = new Date(Date.now() - 1_000);
	fs.utimesSync(unmarked, now, now);
	assert.equal(handoverSatisfied(dir, "ignored", createdAt).ok, false);
});

test("a missing rules directory is reported, never guessed at", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-handover-empty-"));
	assert.equal(handoverSatisfied(dir, "ignored", Date.now()).ok, false);
});
