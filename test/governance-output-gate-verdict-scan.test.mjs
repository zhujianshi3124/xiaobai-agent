import test from "node:test";
import assert from "node:assert/strict";

// Regression anchor for the 2026-10-29 12:54–13:58 round: the reviewer judge
// answered `**APPROVED**` (Markdown bold) and the scanner required the body to
// start with the bare word, so five real rulings were recorded as TIMEOUT
// (ledger 04:59:27Z, 05:12:35Z, 05:52:41Z, 05:57:49Z). The coordinator then went
// silent per 纪律 3.3.2(7) and the user never received a report.
// The rule stays strict about WHERE the token is: only the opening line counts.
const { verdictFromText } = await import("../lib/governance-output-gate/lib/gate-guard.js");

test("a decorated opening still counts as a ruling", () => {
	assert.equal(verdictFromText("**APPROVED**\n\n呈报件（等待即静默后的收口陈述）。"), "APPROVED");
	assert.equal(verdictFromText("**REJECTED**\n\n判据：正文含一处绝对表述。"), "REJECTED");
	assert.equal(verdictFromText("【APPROVED】核验范围 seq 1243–1251"), "APPROVED");
	assert.equal(verdictFromText("> REJECTED\n理由从第二行写起"), "REJECTED");
	assert.equal(verdictFromText("- APPROVED（本轮零操作）"), "APPROVED");
	assert.equal(verdictFromText("\n\n  `APPROVED`"), "APPROVED");
});

test("a bare opening counts, as the supervisor writes it", () => {
	assert.equal(verdictFromText("APPROVED"), "APPROVED");
	assert.equal(verdictFromText("APPROVED（本轮零操作）\n\n核验范围 seq 1243–1251"), "APPROVED");
	assert.equal(verdictFromText("REJECTED\n\n判据：……"), "REJECTED");
	assert.equal(verdictFromText("UNAVAILABLE：团队不可用"), "UNAVAILABLE");
});

test("a word inside the body or after a preamble is not a ruling", () => {
	assert.equal(verdictFromText("判据：正文里写了 APPROVED，不成立"), null);
	assert.equal(verdictFromText("文档写入件。本轮逐条独立取证。\n\nAPPROVED"), null);
	assert.equal(verdictFromText("APPROVEDX"), null);
	assert.equal(verdictFromText(""), null);
	assert.equal(verdictFromText("   \n\t"), null);
});
