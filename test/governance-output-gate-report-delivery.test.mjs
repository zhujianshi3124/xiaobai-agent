import test from "node:test";
import assert from "node:assert/strict";

// Regression anchors for the 2026-10-29 14:26–14:56 turn:
//  · the lead's wrapper printed only `res.verdict` / `res.reason`, dropped the
//    tool's `next`, retyped a 1330-char approved report as 1342 chars, and the
//    approval missed by a hash;
//  · the notice cap then swallowed that text silently (judged=3), so the user
//    got no report at all;
//  · the rejection block shown to the user was cut at 200 chars, mid file name.
const {
	composeRejectMarker,
	reasonWithNext,
	pendingApprovalFor,
	REJECT_SHOWN_CHARS,
	rememberApprovedReport,
	preclearState,
	gatedStream,
} = await import("../lib/governance-output-gate/lib/gate-text.js");
const { clearReportFinalized } = await import("../lib/governance-output-gate/lib/gate-guard.js");

const APPROVED = "# 报告\n\n## 一、需你裁决的事项\n- (a) 只补兜底页\n";

test("the rejection block de-duplicates the token and keeps the evidence", () => {
	const real =
		"reviewer REJECTED: REJECTED 判据：本稿是上轮已放行版本的**回退**——把已经修好的表述改回失真版。"
		+ " ❌ 不符（一处，回退到失真） - 第 2 条现写「（含闸门 `gate-guard.js` / `gate-text.js` / `gate-tools.js`）……"
		+ "**这批改动已随三笔提交入库吗？没有**」。请按件分述、不要合并成「它们」。";
	const out = composeRejectMarker("rejected", real);
	assert.equal(out.startsWith("[已拦截] reviewer REJECTED：判据："), true, out.slice(0, 60));
	assert.equal(out.includes("REJECTED: REJECTED"), false, "the token appears once");
	assert.equal(out.includes("请按件分述"), true, "the actionable tail is still visible");
});

test("a long verdict is capped, but far past the old 200 chars", () => {
	const long = "reviewer REJECTED: REJECTED " + "证".repeat(1500);
	const out = composeRejectMarker("rejected", long);
	assert.equal(out.length, "[已拦截] ".length + REJECT_SHOWN_CHARS + 1);
	assert.equal(out.endsWith("…"), true);
	assert.equal(REJECT_SHOWN_CHARS >= 800, true, "the 13:54 ruling must fit its evidence");
	assert.equal(composeRejectMarker("blocked", "supervisor coverage partial: seq 1–2").startsWith("[审核未完成·已扣留] "), true);
	assert.equal(composeRejectMarker("rejected", ""), "[已拦截] 未通过审核（判官未给理由）");
});

test("the tool's next step travels inside reason, the field callers actually read", () => {
	const out = reasonWithNext("both APPROVED", "下一条消息只输出 [发送放行稿]");
	assert.equal(out, "both APPROVED；下一步：下一条消息只输出 [发送放行稿]");
	assert.equal(reasonWithNext("both APPROVED", ""), "both APPROVED");
	assert.equal(reasonWithNext("", "下一步"), "下一步：下一步");
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

test("a cleared report survives the notice cap: the gate sends the approved bytes", async () => {
	const id = "session-notice-cap-release";
	const ctx = { agents: { get: () => undefined }, get: () => undefined, sessions: { get: () => undefined } };
	const approved = "# 报告\n\n## 一、需你裁决的事项\n" + "- (a) 只补兜底页，并在第七节补一行进度记录。\n".repeat(20);
	rememberApprovedReport(id, approved, "approved", 0);
	// The model retyped the report and drifted (the 14:56 failure): the hash
	// misses, so without this branch the retyped text is judged anew, the notice
	// cap swallows it, and the user gets silence even though the report is cleared.
	const drifted = approved.replace("只补兜底页", "只补兜底页（改）");
	assert.equal(pendingApprovalFor(id)?.text, approved);

	let last = [];
	for (let i = 0; i < 3; i++) {
		clearReportFinalized(id);
		last = await drain(gatedStream(ctx, { sessionId: id, inputKind: "subagent-settled" }, oneTextMessage(drifted)));
	}
	const shown = last
		.filter((c) => c?.type === "block-end" && c.block?.type === "text")
		.map((c) => c.block.text)
		.join("");
	assert.equal(shown, approved, "the user reads the approved bytes, not silence");
	assert.equal(preclearState(id), undefined, "the release consumes the clearance");
	clearReportFinalized(id);
});

test("a different text never inherits an older clearance", async () => {
	const id = "session-notice-cap-unrelated";
	const ctx = { agents: { get: () => undefined }, get: () => undefined, sessions: { get: () => undefined } };
	const approved = "# 报告\n\n## 一、需你裁决的事项\n" + "- (a) 只补兜底页，并在第七节补一行进度记录。\n".repeat(20);
	rememberApprovedReport(id, approved, "approved", 0);
	const unrelated = "# 报告\n\n## 二、另一个完全不同的议题\n" + "- 甲乙丙丁戊己庚辛。\n".repeat(30);
	let last = [];
	for (let i = 0; i < 3; i++) {
		clearReportFinalized(id);
		last = await drain(gatedStream(ctx, { sessionId: id, inputKind: "subagent-settled" }, oneTextMessage(unrelated)));
	}
	const shown = last
		.filter((c) => c?.type === "block-end" && c.block?.type === "text")
		.map((c) => c.block.text)
		.join("");
	assert.equal(shown.includes(approved), false, "uncleared text is never released under another approval");
	assert.notEqual(pendingApprovalFor(id), undefined);
	clearReportFinalized(id);
});
