import test from "node:test";
import assert from "node:assert/strict";

// P1-6（复审核意见，2026-11-01）回归钉：supervisor 未给 coverage（missing）不算覆盖，
// 水位不得推进到 judgedTo，报告必须被扣（与 partial/gap-start 同类）。分类逻辑抽为
// classifySupervisorCoverage 纯函数后在此逐形态断言。
const { classifySupervisorCoverage } = await import("../lib/governance-output-gate/lib/gate-text.js");

const SINCE = 10;
const JUDGED = 42;

test("missing：无 coverage 主张不算覆盖，终点必须退回起点（水位不推进）", () => {
	assert.deepEqual(classifySupervisorCoverage(null, SINCE, JUDGED), { kind: "missing", to: SINCE });
	assert.deepEqual(classifySupervisorCoverage(undefined, SINCE, JUDGED), { kind: "missing", to: SINCE });
});

test("full：覆盖到终点才放行并推进到 judgedTo", () => {
	assert.deepEqual(classifySupervisorCoverage({ from: SINCE + 1, to: JUDGED }, SINCE, JUDGED), { kind: "full", to: JUDGED });
});

test("partial：自封 partial ⇒ 终点退回起点", () => {
	assert.deepEqual(classifySupervisorCoverage({ from: SINCE + 1, to: JUDGED, partial: true }, SINCE, JUDGED), { kind: "partial", to: SINCE });
});

test("gap-start：起点有空隙 ⇒ 终点退回起点", () => {
	assert.deepEqual(classifySupervisorCoverage({ from: SINCE + 3, to: JUDGED }, SINCE, JUDGED), { kind: "gap-start", to: SINCE });
});

test("tail-partial：起点衔接但终点未到 judgedTo ⇒ partial 且停在实核终点", () => {
	assert.deepEqual(classifySupervisorCoverage({ from: SINCE + 1, to: 30 }, SINCE, JUDGED), { kind: "partial", to: 30 });
	assert.deepEqual(classifySupervisorCoverage({ from: SINCE + 1, to: 5 }, SINCE, JUDGED), { kind: "partial", to: Math.max(SINCE, 5) });
});
