import test from "node:test";
import assert from "node:assert/strict";

// Regression anchor for the 2026-10-28 22:45–23:02 storm: the gate asked the
// model to re-type a 2164-char approved report byte-for-byte; the first retyped
// line gained one 「需」 and the turn burned 22 visible [已拦截] blocks. The
// approved bytes now travel with the approval, the model answers with a token,
// and the gate swaps the text in itself.
const {
	isApprovedToken,
	manuscriptHash,
	rememberApprovedReport,
	takeApprovedReport,
	preclearState,
	gatedStream,
} = await import("../lib/governance-output-gate/lib/gate-text.js");
const { clearReportFinalized, isVoidingOpName } = await import("../lib/governance-output-gate/lib/gate-guard.js");

const SESSION = "session-token-regression-case";
const APPROVED = "# 报告\n\n## 一、需你裁决的事项\n\n- (a) 只补兜底页\n";

test("isApprovedToken accepts the token in its plausible spellings only", () => {
	assert.equal(isApprovedToken("[发送放行稿]"), true);
	assert.equal(isApprovedToken("【发送放行稿】"), true);
	assert.equal(isApprovedToken("  发送放行稿 \n"), true);
	assert.equal(isApprovedToken("发送放行稿，请发"), false);
	assert.equal(isApprovedToken("[已拦截] reviewer REJECTED"), false);
	assert.equal(isApprovedToken(""), false);
});

test("staleness voids writes and shell calls, not reads (读不失效)", () => {
	for (const name of ["write", "edit", "apply_patch", "notebook_edit", "pwsh", "powershell", "bash", "sh", "cmd", "python"]) {
		assert.equal(isVoidingOpName(name), true, name + " must void");
	}
	for (const name of ["read", "list", "grep", "gate-journal", "ctx-watch", "run_code", "send_report", "send_message"]) {
		assert.equal(isVoidingOpName(name), false, name + " must not void");
	}
});

test("a peek at the approval never consumes it (stale 不消费的前提)", () => {
	assert.equal(rememberApprovedReport(SESSION, APPROVED, "approved", 42), manuscriptHash(APPROVED));
	const entry = preclearState(SESSION);
	assert.equal(entry.text, APPROVED);
	assert.equal(entry.maxSeq, 42);

	// Byte-exact match returns the entry and LEAVES it: a hit that discovers
	// staleness must not destroy the approval for a later clean attempt.
	assert.deepEqual(takeApprovedReport(SESSION, APPROVED), { ...entry });
	assert.equal(preclearState(SESSION), entry, "peek does not consume");

	// One extra character (the storm's trigger) must NOT match…
	assert.equal(takeApprovedReport(SESSION, APPROVED.replace("需你裁决", "需要你裁决")), null);
	assert.equal(preclearState(SESSION), entry, "a drifted echo leaves the approval in place");
});

async function* oneTextMessage(text) {
	yield { type: "block-start", index: 0, blockType: "text" };
	yield { type: "text-delta", index: 0, text };
	yield { type: "block-end", index: 0, block: { type: "text", text } };
}

async function drain(stream) {
	const chunks = [];
	for await (const chunk of stream) chunks.push(chunk);
	return chunks;
}

test("gatedStream swaps the token message for the approved bytes and finalizes the turn", async () => {
	rememberApprovedReport(SESSION, APPROVED, "approved", 0);
	clearReportFinalized(SESSION);
	const ctx = { agents: { get: () => undefined }, get: () => undefined, sessions: { get: () => undefined } };

	const chunks = await drain(gatedStream(ctx, { sessionId: SESSION }, oneTextMessage("[发送放行稿]")));
	const text = chunks
		.filter((c) => c?.type === "block-end" && c.block?.type === "text")
		.map((c) => c.block.text)
		.join("");
	assert.equal(text, APPROVED, "the user reads the approved bytes, not the token");
	assert.equal(text.includes("发送放行稿"), false, "the token itself never reaches the user");
	assert.equal(preclearState(SESSION), undefined, "the release consumes the approval");
	assert.equal((await drain(gatedStream(ctx, { sessionId: SESSION }, oneTextMessage("好的")))).length >= 0, true);
	clearReportFinalized(SESSION);
});

test("a byte-exact re-emission also releases (同 hash 放行) and consumes at release", async () => {
	const id = "session-verbatim-release-case";
	clearReportFinalized(id);
	rememberApprovedReport(id, APPROVED, "approved", 0);
	const ctx = { agents: { get: () => undefined }, get: () => undefined, sessions: { get: () => undefined } };

	const chunks = await drain(gatedStream(ctx, { sessionId: id }, oneTextMessage(APPROVED)));
	const text = chunks
		.filter((c) => c?.type === "block-end" && c.block?.type === "text")
		.map((c) => c.block.text)
		.join("");
	assert.equal(text, APPROVED, "the exact approved bytes pass without a second hearing");
	assert.equal(preclearState(id), undefined, "consumption happens at the release, not at the peek");
	assert.equal(text.includes("[已拦截]"), false);
	clearReportFinalized(id);
});

test("a token without an approval on file is not a report and releases nothing report-like", async () => {
	const id = "session-token-noclear-case";
	clearReportFinalized(id);
	const ctx = { agents: { get: () => undefined }, get: () => undefined, sessions: { get: () => undefined } };

	const chunks = await drain(gatedStream(ctx, { sessionId: id }, oneTextMessage("[发送放行稿]")));
	const text = chunks
		.filter((c) => c?.type === "block-end" && c.block?.type === "text")
		.map((c) => c.block.text)
		.join("");
	assert.equal(text.includes("发送放行稿"), true, "without an approval the token is an ordinary short text");
	assert.equal(text.includes("# 报告"), false);
});
