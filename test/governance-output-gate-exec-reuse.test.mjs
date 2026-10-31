import test from "node:test";
import assert from "node:assert/strict";

// AGENTS.md §1: sibling plugins are probed at runtime, never statically imported.
const {
	execRoleOfSpawn,
	redundantExecSpawn,
} = await import("../lib/governance-output-gate/lib/gate-guard.js");

function agentOf(id) {
	return { session: { id } };
}

function teamOf(rows) {
	return { listMembers: () => rows };
}

const execRows = [
	{ name: "lead", description: "协调侧", id: "lead-1", status: "running" },
	{ name: "exec-commit8", description: "执行侧：8-1 提交产品仓改动", id: "sess-c8", status: "inactive" },
	{ name: "reviewer", description: "审核侧", id: "sess-r", status: "inactive" },
];
const createdAt = (id) => ({ "sess-c8": 100, "sess-r": 50, "lead-1": 10 })[id] ?? null;
const spawnReg18 = { name: "exec-reg18", description: "执行侧：8-2 新通道进回归链" };

test("execRoleOfSpawn classifies only exec cards", () => {
	assert.equal(execRoleOfSpawn({ name: "exec-reg18", description: "执行侧：8-2" }), "reg18");
	assert.equal(execRoleOfSpawn({ name: "exec:debt7" }), "debt7");
	assert.equal(execRoleOfSpawn({ name: "helper", description: "执行侧 task:fix2" }), "fix2");
	assert.equal(execRoleOfSpawn({ name: "reviewer3", description: "审核侧（换卡）" }), null);
	assert.equal(execRoleOfSpawn({ name: "supervisor2", description: "监管侧" }), null);
	assert.equal(execRoleOfSpawn({ name: "helper", description: "只读复核" }), null);
});

test("a new exec card is denied while an idle incumbent is below 35%", () => {
	const denial = redundantExecSpawn(
		teamOf(execRows),
		agentOf("lead-exec"),
		spawnReg18,
		{ createdAt, ctxPct: (id) => (id === "sess-c8" ? { pct: 7.21 } : null) },
	);
	assert.match(denial, /exec-commit8/);
	assert.match(denial, /7\.21%/);
	assert.match(denial, /send_message/);
	assert.match(denial, /parallel:true/);
});

test("the explicit parallel override allows a second exec card", () => {
	assert.equal(
		redundantExecSpawn(
			teamOf(execRows),
			agentOf("lead-parallel"),
			{ name: "exec-reg18", description: "执行侧：8-2（parallel:true）" },
			{ createdAt, ctxPct: () => ({ pct: 7.21 }) },
		),
		null,
	);
});

test("a running, errored, full, or unmeasured incumbent does not block", () => {
	const running = [{ name: "exec-commit8", description: "执行侧", id: "sess-c8", status: "running" }];
	assert.equal(
		redundantExecSpawn(teamOf(running), agentOf("lead-run"), spawnReg18, { createdAt, ctxPct: () => ({ pct: 7.21 }) }),
		null,
	);
	const errored = [{ name: "exec-commit8", description: "执行侧", id: "sess-c8", status: "error" }];
	assert.equal(
		redundantExecSpawn(teamOf(errored), agentOf("lead-err"), spawnReg18, { createdAt, ctxPct: () => ({ pct: 7.21 }) }),
		null,
	);
	assert.equal(
		redundantExecSpawn(teamOf(execRows), agentOf("lead-full"), spawnReg18, { createdAt, ctxPct: () => ({ pct: 40 }) }),
		null,
	);
	assert.equal(
		redundantExecSpawn(teamOf(execRows), agentOf("lead-unknown"), spawnReg18, { createdAt, ctxPct: () => null }),
		null,
	);
});

test("judge spawns and first exec spawns are untouched", () => {
	assert.equal(
		redundantExecSpawn(
			teamOf(execRows),
			agentOf("lead-judge"),
			{ name: "reviewer3", description: "审核侧（换卡）" },
			{ createdAt, ctxPct: () => ({ pct: 7.21 }) },
		),
		null,
	);
	assert.equal(
		redundantExecSpawn(
			teamOf([{ name: "reviewer", description: "审核侧", id: "sess-r", status: "inactive" }]),
			agentOf("lead-first"),
			spawnReg18,
			{ createdAt, ctxPct: () => ({ pct: 7.21 }) },
		),
		null,
	);
});
