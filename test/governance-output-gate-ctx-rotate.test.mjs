import test from "node:test";
import assert from "node:assert/strict";

// AGENTS.md §1: sibling plugins are probed at runtime, never statically imported.
const { ctxRotateDenial, CARD_ROTATE_PCT } = await import("../lib/governance-output-gate/lib/gate-tools.js");

test("the rotate line is 35%", () => {
	assert.equal(CARD_ROTATE_PCT, 35);
});

test("a lead at 36% may not open a new card or ask the user", () => {
	for (const toolName of ["spawn_teammate", "subagent", "subagent_fork", "ask_user_question", "task_board_create"]) {
		const denial = ctxRotateDenial({ toolName, role: "lead", args: {}, measured: { pct: 36 } });
		assert.match(denial, /≥35%/);
		assert.match(denial, /无需向用户请示/);
	}
});

test("a lead below the line is unaffected", () => {
	assert.equal(ctxRotateDenial({ toolName: "spawn_teammate", role: "lead", args: {}, measured: { pct: 34.99 } }), null);
	assert.equal(ctxRotateDenial({ toolName: "spawn_teammate", role: "lead", args: {}, measured: null }), null);
	assert.equal(ctxRotateDenial({ toolName: "spawn_teammate", role: "lead", args: {}, measured: {} }), null);
});

test("reads and existing-task settlement are not blocked", () => {
	assert.equal(ctxRotateDenial({ toolName: "read", role: "lead", args: {}, measured: { pct: 38 } }), null);
	assert.equal(
		ctxRotateDenial({ toolName: "send_message", role: "lead", args: { target: "exec-x", message: "停手，收尾并交报告" }, measured: { pct: 38 } }),
		null,
	);
	assert.match(
		ctxRotateDenial({ toolName: "send_message", role: "lead", args: { target: "exec-x", message: "把这批改动提交入库" }, measured: { pct: 38 } }),
		/≥35%/,
	);
});

test("judges are rotated by gate-guard, not blocked here", () => {
	assert.equal(ctxRotateDenial({ toolName: "spawn_teammate", role: "judge", args: {}, measured: { pct: 38 } }), null);
});

test("settling a goal is allowed at the rotate line; editing or resuming it is not", () => {
	for (const action of ["complete", "pause", "blocked"]) {
		assert.equal(ctxRotateDenial({ toolName: "update_goal", role: "lead", args: { action }, measured: { pct: 38 } }), null);
	}
	for (const action of ["edit", "resume"]) {
		assert.match(ctxRotateDenial({ toolName: "update_goal", role: "lead", args: { action }, measured: { pct: 38 } }), /≥35%/);
	}
});

test("40% is CRITICAL and asks for an immediate stop", () => {
	const denial = ctxRotateDenial({ toolName: "ask_user_question", role: "lead", args: {}, measured: { pct: 40 } });
	assert.match(denial, /CRITICAL/);
	assert.match(denial, /立即停/);
});
