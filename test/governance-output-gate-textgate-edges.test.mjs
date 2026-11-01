import test from "node:test";
import assert from "node:assert/strict";

// Regression anchors for review 14 §三.1 (registered debt E6): the text gate's
// three side doors.
//  · a plain-paragraph conclusion past the ack budget, or a short strong-signal
//    text, rode alongside tool calls through releaseAll() unreviewed;
//  · a stream failure flushed the buffered (unjudged) words to the user unmarked;
//  · /gate off kept the advisory spawn interceptions alive after disabling.
const { gatedStream, isReportShaped, REPORT_SHAPE } = await import("../lib/governance-output-gate/lib/gate-text.js");
const { spawnReuseDenial } = await import("../lib/governance-output-gate/lib/gate-tools.js");

const NARRATION = "这一步只做只读取证：读取配置面、比对挂载行、确认分支归属，然后回来继续下一批。";
const longPlain = NARRATION.repeat(12);
const strongShort = "需要你裁决：是否立项。";
const weakShort = "HEAD 已推进，本步完成。";

test("isReportShaped: length past the ack budget is enough, strong signals count at any length", () => {
	assert.equal(longPlain.length > 400, true, "fixture must clear the ack budget");
	assert.equal(isReportShaped(longPlain), true, "a plain paragraph past the budget is report-shaped");
	assert.equal(isReportShaped(strongShort), true, "a strong conclusion signal counts at any length");
	assert.equal(isReportShaped(weakShort), false, "a short narration mentioning HEAD stays narration");
	assert.equal(isReportShaped("ok"), false);
	// REPORT_SHAPE keeps its old meaning: the ack path is untouched.
	assert.equal(REPORT_SHAPE.test("# 标题"), true);
	assert.equal(REPORT_SHAPE.test(longPlain), false, "fixture really has no shape markers");
});

async function* textWithToolCall(text) {
	yield { type: "block-start", index: 0, blockType: "text" };
	yield { type: "text-delta", index: 0, text };
	yield { type: "block-end", index: 0, block: { type: "text", text } };
	yield { type: "block-start", index: 1, blockType: "tool-call" };
	yield { type: "block-end", index: 1, block: { type: "tool-call", name: "read", arguments: "{}" } };
}

async function drain(stream) {
	const chunks = [];
	for await (const chunk of stream) chunks.push(chunk);
	return chunks;
}

function textBlocks(chunks) {
	return chunks
		.filter((c) => c?.type === "block-end" && c.block?.type === "text")
		.map((c) => c.block.text)
		.join("");
}

const ctx = { agents: { get: () => undefined }, get: () => undefined, sessions: { get: () => undefined } };

test("a long plain text next to tool calls is withheld; the tool call still runs", async () => {
	const chunks = await drain(
		gatedStream(ctx, { sessionId: "session-e6-side-door-long", inputKind: "user" }, textWithToolCall(longPlain)),
	);
	const shown = textBlocks(chunks);
	assert.equal(shown.includes("[叙述已扣留]"), true, shown.slice(0, 80));
	assert.equal(shown.includes(NARRATION), false, "the unjudged words must not reach the user");
	assert.equal(
		chunks.some((c) => c?.type === "block-start" && c.blockType === "tool-call"),
		true,
		"the tool call still runs",
	);
});

test("a short strong-signal text next to tool calls is withheld too", async () => {
	const chunks = await drain(
		gatedStream(ctx, { sessionId: "session-e6-side-door-strong", inputKind: "user" }, textWithToolCall(strongShort)),
	);
	const shown = textBlocks(chunks);
	assert.equal(shown.includes("[叙述已扣留]"), true, shown.slice(0, 80));
	assert.equal(shown.includes("需要你裁决"), false);
});

test("a short narration next to tool calls still passes unmarked (regression pin)", async () => {
	const chunks = await drain(
		gatedStream(ctx, { sessionId: "session-e6-narration-pass", inputKind: "user" }, textWithToolCall(weakShort)),
	);
	assert.equal(textBlocks(chunks), weakShort);
});

test("a stream failure withholds the buffered words behind a marker and rethrows", async () => {
	const chunks = [];
	async function* broken() {
		yield { type: "block-start", index: 0, blockType: "text" };
		yield { type: "text-delta", index: 0, text: longPlain };
		throw new Error("upstream exploded mid-stream");
	}
	await assert.rejects(
		(async () => {
			for await (const c of gatedStream(ctx, { sessionId: "session-e6-failure", inputKind: "user" }, broken())) {
				chunks.push(c);
			}
		})(),
		/upstream exploded/,
	);
	const shown = textBlocks(chunks);
	assert.equal(shown.includes("[流中断·未审]"), true, shown.slice(0, 80));
	assert.equal(shown.includes(NARRATION), false, "no unmarked unjudged words may reach the user");
});

function agentOf(id) {
	return { session: { id } };
}

function teamOf(rows) {
	return { listMembers: () => rows };
}

const execRows = [
	{ name: "lead", description: "协调侧", id: "lead-1", status: "running" },
	{ name: "exec-commit8", description: "执行侧：8-1 提交产品仓改动", id: "sess-c8", status: "inactive" },
];
const createdAt = (id) => ({ "sess-c8": 100, "lead-1": 10 })[id] ?? null;
const spawnReg18 = { name: "exec-reg18", description: "执行侧：8-2 新通道进回归链" };
const measure = { createdAt, ctxPct: (id) => (id === "sess-c8" ? { pct: 7.21 } : null) };

test("spawnReuseDenial: /gate off skips the advisory interceptions entirely", () => {
	assert.equal(
		spawnReuseDenial({ gateActive: false, team: teamOf(execRows), agent: agentOf("lead-off"), spawnArgs: spawnReg18, options: measure }),
		null,
		"a disabled workspace must not deny spawns",
	);
	const denial = spawnReuseDenial({ gateActive: true, team: teamOf(execRows), agent: agentOf("lead-on"), spawnArgs: spawnReg18, options: measure });
	assert.match(denial, /exec-commit8/, "an enabled workspace keeps the Guide 3.0.1 interception");
});
