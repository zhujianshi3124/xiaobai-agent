import test from "node:test";
import assert from "node:assert/strict";

// AGENTS.md §1: sibling plugins are probed at runtime, never statically imported.
const {
	judgeNames,
	judgeRoleOfSpawn,
	redundantJudgeSpawn,
	maybeRotateJudges,
} = await import("../lib/governance-output-gate/lib/gate-guard.js");

function agentOf(id) {
	return { session: { id } };
}

function teamOf(rows, spawned = []) {
	return {
		listMembers: () => rows,
		spawnTeammate: async (_agent, options) => {
			spawned.push(options.name);
		},
	};
}

const judgeRows = [
	{ name: "reviewer", description: "审核侧：旧卡", id: "sess-old" },
	{ name: "supervisor", description: "监管侧", id: "sup-1" },
	{ name: "reviewer2", description: "审核侧：现任", id: "sess-new" },
];
const createdAt = (id) => ({ "sess-old": 100, "sess-new": 200, "sup-1": 50 })[id] ?? null;

test("judgeNames picks the newest judge card, not the retired exact name", () => {
	assert.deepEqual(
		judgeNames(teamOf(judgeRows), agentOf("lead-newest"), { createdAt }),
		{ reviewer: "reviewer2", supervisor: "supervisor" },
	);
	// If the session log is unreadable, roster order is the fallback; the newest
	// card is appended last, so the retired first card still never wins.
	assert.equal(
		judgeNames(teamOf(judgeRows), agentOf("lead-order"), { createdAt: () => null }).reviewer,
		"reviewer2",
	);
});

test("judgeRoleOfSpawn classifies only judge cards", () => {
	assert.equal(judgeRoleOfSpawn({ name: "reviewer3", description: "审核侧（换卡）" }), "reviewer");
	assert.equal(judgeRoleOfSpawn({ name: "supervisor2", description: "监管侧" }), "supervisor");
	assert.equal(judgeRoleOfSpawn({ name: "exec-readme", description: "执行侧：改 README" }), null);
	assert.equal(judgeRoleOfSpawn({ name: "helper", description: "只读复核" }), null);
});

test("a redundant reviewer spawn is denied while the incumbent is below 35%", () => {
	const denial = redundantJudgeSpawn(
		teamOf(judgeRows),
		agentOf("lead-guard"),
		{ name: "reviewer3", description: "审核侧（换卡）" },
		{ createdAt, ctxPct: (id) => (id === "sess-new" ? { pct: 18.25 } : { pct: 35.08 }) },
	);
	assert.match(denial, /未到指南 2\.5/);
	assert.match(denial, /reviewer2/);
});

test("a judge spawn is allowed at/over the rotate line, or when no incumbent exists", () => {
	assert.equal(
		redundantJudgeSpawn(
			teamOf(judgeRows),
			agentOf("lead-over"),
			{ name: "reviewer3", description: "审核侧（换卡）" },
			{ createdAt, ctxPct: () => ({ pct: 40 }) },
		),
		null,
	);
	const onlySupervisor = [{ name: "supervisor", description: "监管侧", id: "sup-1" }];
	assert.equal(
		redundantJudgeSpawn(
			teamOf(onlySupervisor),
			agentOf("lead-none"),
			{ name: "reviewer", description: "审核侧" },
			{ createdAt, ctxPct: () => ({ pct: 0 }) },
		),
		null,
	);
});

test("maybeRotateJudges stays on the incumbent below 35% and rotates at 35%", async () => {
	const rows = [
		{ name: "reviewer2", description: "审核侧", id: "r2" },
		{ name: "reviewer3", description: "审核侧", id: "r3" },
		{ name: "reviewer4", description: "审核侧", id: "r4" },
		{ name: "supervisor", description: "监管侧", id: "s1" },
	];
	const spawned = [];
	const team = teamOf(rows, spawned);
	const ctx = { get: (name) => (name === "agentTeams" ? team : undefined) };
	const agent = agentOf("lead-rotate");
	const judges = { ok: true, reviewer: "reviewer4", supervisor: "supervisor", rules: { files: [] } };

	await maybeRotateJudges(ctx, agent, "D:\\xiaobai-up", judges, { ctxPct: () => ({ pct: 20 }) });
	assert.deepEqual(spawned, [], "below the rotate line the incumbent must be reused");

	await maybeRotateJudges(ctx, agent, "D:\\xiaobai-up", judges, {
		ctxPct: (id) => (id === "r4" ? { pct: 40 } : { pct: 20 }),
	});
	assert.deepEqual(spawned, ["reviewer5"], "at 35% the gate spawns the next free judge name");
});
