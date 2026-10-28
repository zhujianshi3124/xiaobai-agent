import test from "node:test";
import assert from "node:assert/strict";

// AGENTS.md §1: sibling plugins are probed at runtime, never statically imported.
const {
	markReportFinalized,
	isReportFinalized,
	clearReportFinalized,
	quiesceAfterReport,
	guardAgentSend,
} = await import("../lib/governance-output-gate/lib/gate-guard.js");
const {
	apply: applyTextGate,
	isUserUtterance,
} = await import("../lib/governance-output-gate/lib/gate-text.js");

function fakeInbox(step, turn = []) {
	return {
		nextStep: step,
		nextTurn: turn,
		splice(target, start, deleteCount, inserted) {
			const list = target === "next-step" ? this.nextStep : this.nextTurn;
			list.splice(start, deleteCount, ...inserted);
		},
	};
}

test("a user utterance unlocks the session; a subagent notice does not", () => {
	const listeners = new Map();
	const ctx = {
		tools: { register: () => () => {} },
		effect: () => {},
		agents: { get: () => undefined },
		on: (name, fn) => listeners.set(name, fn),
	};
	applyTextGate(ctx);

	const session = { id: "session-unlock-case" };
	const onEvent = listeners.get("session/event");
	assert.equal(typeof onEvent, "function");

	markReportFinalized(session.id);
	assert.equal(isReportFinalized(session.id), true);

	// A judge/subagent settling is not the user speaking: the report turn stays closed.
	onEvent(session, { type: "user/message", data: { source: { kind: "subagent-settled" } } });
	assert.equal(isReportFinalized(session.id), true);

	// A real user message starts a new turn: every turn-scoped latch dies with it.
	onEvent(session, { type: "user/message", data: { source: { kind: "user" } } });
	assert.equal(isReportFinalized(session.id), false);
});

test("isUserUtterance only accepts a typed user message", () => {
	assert.equal(isUserUtterance({ type: "user/message", data: { source: { kind: "user" } } }), true);
	assert.equal(isUserUtterance({ type: "user/message", data: { source: { kind: "subagent-settled" } } }), false);
	assert.equal(isUserUtterance({ type: "assistant/message", data: { source: { kind: "user" } } }), false);
	assert.equal(isUserUtterance(undefined), false);
});

test("quiesceAfterReport drops late subagent notices and keeps user input", () => {
	const notice = (id) => ({ source: { kind: "subagent-settled" }, id });
	const user = { source: { kind: "user" }, id: "u" };
	const queued = { source: { kind: "user" }, id: "queued" };
	const inbox = fakeInbox([notice("a"), user, notice("b"), { source: { kind: "agent-message" }, id: "relay" }], [notice("c"), queued]);
	const ctx = { agents: { get: () => ({ inbox }) } };

	const dropped = quiesceAfterReport(ctx, "session-quiesce-case");

	assert.equal(dropped, 4);
	assert.deepEqual(inbox.nextStep.map((m) => m.id), ["u"]);
	assert.deepEqual(inbox.nextTurn.map((m) => m.id), ["queued"]);
});

test("guardAgentSend drops non-user messages while the report is final", () => {
	const delivered = [];
	const agent = {
		send(message, target) {
			delivered.push({ kind: message.source?.kind ?? "?", target });
		},
	};
	const ctx = { agents: { get: () => agent } };
	const id = "session-quiet-send-case";
	markReportFinalized(id);
	assert.equal(guardAgentSend(ctx, id), true);
	assert.equal(guardAgentSend(ctx, id), true, "installing twice must not double-wrap");

	agent.send({ source: { kind: "agent-message" } }, "next-step", true);
	agent.send({ source: { kind: "subagent-settled" } }, "next-step", true);
	assert.deepEqual(delivered, [], "relays and notices must not open a step after the report");

	agent.send({ source: { kind: "user" } }, "next-turn", true);
	assert.deepEqual(delivered, [{ kind: "user", target: "next-turn" }], "a typed user message must pass");

	clearReportFinalized(id);
	agent.send({ source: { kind: "agent-message" } }, "next-step", true);
	assert.deepEqual(delivered.map((m) => m.kind), ["user", "agent-message"], "after unlock everything passes again");
});

test("quiesceAfterReport is a no-op when the inbox or the agent is unavailable", () => {
	const ctx = { agents: { get: () => undefined } };
	assert.equal(quiesceAfterReport(ctx, "session-no-agent"), 0);
	assert.equal(quiesceAfterReport({}, "session-no-agents"), 0);
	assert.equal(quiesceAfterReport(undefined, "session-no-ctx"), 0);

	const empty = fakeInbox([{ source: { kind: "user" } }]);
	assert.equal(quiesceAfterReport({ agents: { get: () => ({ inbox: empty }) } }, "session-no-notice"), 0);
});

test("clearReportFinalized is idempotent and ignores empty ids", () => {
	const id = "session-clear-case";
	markReportFinalized(id);
	assert.equal(clearReportFinalized(id), true);
	assert.equal(clearReportFinalized(id), false);
	assert.equal(clearReportFinalized(""), false);
	assert.equal(clearReportFinalized(undefined), false);
});
