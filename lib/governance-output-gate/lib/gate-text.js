/**
 * Output gate — the report gate.
 *
 * Design (fixed by the user):
 *   The gate does NOT block individual tool calls. It blocks the REPORT.
 *   When a finished assistant text block is about to reach the user, BOTH judges
 *   are activated at that moment:
 *
 *     reviewer   — reads the text and rules on it
 *     supervisor — reads the session LOG from its own previous watermark up to
 *                  the last operation of this round, and must cover that whole
 *                  range before ruling
 *
 *   Both must APPROVE. Either REJECTED blocks the text.
 *
 * Why the report and not each action: gating every tool call cost ~32s per call
 * and still did not cover writes made inside run_code. The log is the complete
 * record, so checking it once per report covers every action, however it was made.
 *
 * fail-closed when both judges are present: a missing verdict WITHHOLDS the
 * text after the long present-judge deadline. Fail-open (with an explicit
 * marker) is reserved for the case where the judges are absent/unavailable.
 */
import {
	awaitVerdict, readLogSince, isEnabled, dbg,
	readWatermark, writeWatermark, APPROVAL_TIMEOUT_MS, PRESENT_TIMEOUT_MS,
	ensureJudges, maybeRotateJudges, isSubagentHeader, JOURNAL_TOOL, evidenceDigest, newestUserSourceKind,
} from "./gate-guard.js";

const name = "governance-output-gate-text";
const inject = ["sessions", "agents"];

/**
 * Sessions whose last judged report was rejected: the next report is heard even
 * if its step was opened by a judge notice, so a corrected retry is reviewed.
 * Consumed once — a rejection must not turn into an endless review loop.
 */
const FORCE_AFTER_REJECT = new Map();

/**
 * True for any session that is not a top-level agent.
 *
 * Kept as a re-export for callers/tests that imported it from this half; the
 * implementation lives in gate-guard.js so the tool gate uses the same rule.
 */

/**
 * Resolve whether the gate is on for the session behind this request.
 *
 * Only a top-level agent has a report to guard. Every session below it - the
 * reviewer, the supervisor, and every ordinary subagent - runs with
 * delegationDepth > 0, and those words are not the report: they are what the
 * report is judged BY. Gating them deadlocked the gate against itself: a judge
 * asking for a ruling had its own answer held until that same ruling arrived.
 */
function gateOnFor(ctx, options) {
	const sessionId = options?.sessionId;
	if (sessionId === undefined) return false;
	try {
		const session = ctx.sessions.get(sessionId);
		const header = session?.header;
		if (isSubagentHeader(header)) return false;
		return isEnabled(header?.cwd);
	} catch {
		return false;
	}
}

/** Housekeeping calls are never user-facing; never gate them. */
function isHousekeeping(options) {
	return options?.purpose !== undefined && options.purpose !== null;
}

/**
 * Whether a notice-triggered step's text is an acknowledgement, not a report.
 *
 * The exemption this feeds must stay narrow: judging a short ack costs one fast
 * judge round, while exempting a report lets unreviewed conclusions reach the
 * user (2026-10-25: the lead's 2,573-char decision report followed the
 * reviewer's receipt and skipped review, because what a step was triggered by
 * says nothing about what it contains). So shape decides: long text, or any
 * report trapping (headings, lists, tables, circled items, decision keywords,
 * baseline markers), is judged even in a notice-driven step.
 */
const ACK_MAX_CHARS = 400;
const REPORT_SHAPE = /(^|\n)\s*(#{1,6}\s|[-*•]\s|\d+[.、)）]\s)|\n.*\|.*\||[①-⑳]|需要你裁决|待你裁决|裁决清单|待办|基线|sha|porcelain|\bHEAD\b/i;

function isAckShaped(text) {
	if (text.length > ACK_MAX_CHARS) return false;
	return !REPORT_SHAPE.test(text);
}

/**
 * Run both judges for one finished report (one whole assistant message).
 * Returns { release: boolean, why: string, kind: string }.
 */
async function judgeReport(ctx, options, text, signal) {
	const team = ctx.get("agentTeams");
	if (team === undefined) return { release: true, kind: "fail-open", why: "agentTeams unavailable" };

	let agent;
	try {
		agent = ctx.agents.get(options.sessionId);
	} catch {
		return { release: true, kind: "fail-open", why: "cannot resolve agent" };
	}
	if (agent === undefined) return { release: true, kind: "fail-open", why: "agent not live" };

	const sessionId = options.sessionId;
	let cwd;
	try {
		cwd = ctx.sessions.get(sessionId)?.header?.cwd;
	} catch {
		cwd = undefined;
	}

	// Both judges are mandatory (discipline 1.5). Created on demand so the
	// mechanism does not depend on the Lead remembering to spawn them.
	const judges = await ensureJudges(ctx, agent, cwd);
	if (!judges.ok) {
		return {
			release: true,
			kind: "fail-open",
			why: "judges unavailable" + (judges.error === undefined ? "" : ": " + judges.error),
		};
	}

	// Guide 2.5: a judge at ≥35% must be rotated. The judge never measures its
	// own context (that burned the verdict window on 2026-10-25) — the gate
	// measures both cards from their durable logs, rotates a full one when the
	// roster has room, and puts the number in each request either way.
	const judged = await maybeRotateJudges(ctx, agent, cwd, judges);
	const ctxLine = (role) => {
		const m = judged.ctx?.[role];
		if (m === null || m === undefined) return "你的 ctx：闸门未测得（不影响裁决，无需你测量）。";
		const status = m.pct >= 40 ? "CRITICAL" : m.pct >= 35 ? "ROTATE" : m.pct >= 30 ? "WATCH" : "OK";
		const rotated = judged.rotated.some((r) => r.role === role);
		const tail = m.pct >= 35
			? "。本卡已达 ROTATE 线：请在判定末行加一行【ROTATE：本卡 ≥35%，本轮判完请换卡】（指南 2.5）"
				+ (rotated ? "；闸门已换新卡接手本轮之后送审。" : "；闸门将在本轮后换新卡。")
			: "";
		return "你的 ctx：" + m.pct + "%（" + status + " 档，闸门代测，无需你测量）" + tail + "。";
	};

	const judgesPresent = judges.ok && judges.degraded === undefined;
	const judgeTimeoutMs = judgesPresent ? PRESENT_TIMEOUT_MS : APPROVAL_TIMEOUT_MS;
	const watermark = readWatermark();
	const sinceSeq = typeof watermark[sessionId] === "number" ? watermark[sessionId] : 0;
	const range = readLogSince(sessionId, sinceSeq);
	const logPath = range.file ?? "(session log not found)";
	const rangeLine = "起点 seq " + sinceSeq + "；终点 seq " + range.maxSeq + "；覆盖 "
		+ range.seqs.length + " 条事件";

	// The evidence packet travels WITH the request. A judge that has to go read
	// a multi-megabyte log before it can say anything is a judge that will time
	// out — and a brand-new session has no history to read at all. The packet is
	// this round's raw operations, not the claims under review.
	const pack = evidenceDigest(sessionId, sinceSeq, range.maxSeq);
	dbg("gatedStream:pack", "session=" + String(sessionId).slice(0, 22)
		+ " events=" + pack.events + " calls=" + pack.calls + " results=" + pack.results
		+ " bytes=" + pack.text.length);
	const packBlock = [
		"证据包（本轮回合 seq " + sinceSeq + "–" + range.maxSeq + "，共 " + pack.events
			+ " 条事件，其中工具调用 " + pack.calls + " 次；以下是原始记录摘要，不是正文里的说法）：",
		pack.text,
		"证据包结束。",
	];

	const [reviewer, supervisor] = await Promise.all([
		awaitVerdict(ctx, agent, judged.reviewer,
			"lead 即将向用户输出下面这段正文，请核对后放行。",
			[
				"会话: " + sessionId,
				"工作区: " + (cwd ?? "(unknown)"),
				"日志: " + logPath,
				"范围: " + rangeLine,
				...packBlock,
				"取证脚本（可选，证据包已够时不必运行）: node \"" + JOURNAL_TOOL + "\" \"" + logPath + "\" " + sinceSeq + " " + range.maxSeq + " --all",
				"先看证据包；正文里的每个数字/路径/结论都要能在证据包或你亲自打开的文件里找到出处。找不到出处 = REJECTED。",
				"正文没有可核断言（例如只是一句“我先读规则”）时判 APPROVED，并写明「无可核断言」。",
				"【时限 " + Math.round(judgeTimeoutMs / 1000) + "s】先回裁决本体；ctx 实测省略（写「ctx: 未实测（时限内省略）」），不要跑任何上下文测量命令。",
				ctxLine("reviewer"),
				"---8<--- 待核对正文 ---8<---",
				text,
				"---8<--- 正文结束 ---8<---",
			].join("\n"), judgeTimeoutMs, signal),
		awaitVerdict(ctx, agent, judged.supervisor,
			"lead 即将向用户输出报告。请核验它本轮的操作日志。",
			[
				"会话: " + sessionId,
				"工作区: " + (cwd ?? "(unknown)"),
				"日志: " + logPath,
				"起点 seq " + sinceSeq + "（你上一次的终点，本次必须从这里开始）",
				"终点 seq " + range.maxSeq + "（本轮最后一次操作）",
				"要求：从起点读到你确认覆盖到终点为止，不许跳过、不许只看末尾。覆盖 " + range.seqs.length + " 条事件。",
				...packBlock,
				"取证脚本（可选，证据包已够时不必运行）: node \"" + JOURNAL_TOOL + "\" \"" + logPath + "\" " + sinceSeq + " " + range.maxSeq + " --tools",
				"只审 lead 的操作是否合规（纪律 3.6.2），不审正文结论对错（那是 reviewer 的事）。",
				"证据包已经列出本轮的每一次工具调用；逐条核对即可，不必再去翻日志。零操作时直接 APPROVED 并注明「零操作」。",
				"【时限 " + Math.round(judgeTimeoutMs / 1000) + "s】先回裁决本体；ctx 实测省略（写「ctx: 未实测（时限内省略）」），不要跑任何上下文测量命令。",
				ctxLine("supervisor"),
			].join("\n"), judgeTimeoutMs, signal),
	]);

	// Advance the watermark only when the supervisor actually covered the range.
	if (supervisor.verdict === "APPROVED") {
		const after = readLogSince(sessionId, sinceSeq);
		writeWatermark({ ...watermark, [sessionId]: after.maxSeq });
	}

	if (reviewer.verdict === "REJECTED") {
		return { release: false, kind: "rejected", why: "reviewer REJECTED: " + (reviewer.detail || "") };
	}
	if (supervisor.verdict === "REJECTED") {
		return { release: false, kind: "rejected", why: "supervisor REJECTED: " + (supervisor.detail || "") };
	}

	// The user paused: nothing is waiting for this text any more. Release it
	// unmarked (the turn is over) instead of pretending a judge ruled.
	if (reviewer.verdict === "CANCELLED" || supervisor.verdict === "CANCELLED") {
		return { release: true, kind: "cancelled", why: "user paused the turn" };
	}

	// A judge that could not reach its evidence has not judged the Lead. That is
	// not "lead failed review": release with an explicit marker so the user can
	// decide, and keep the reason on record.
	if (reviewer.verdict === "UNAVAILABLE" || supervisor.verdict === "UNAVAILABLE") {
		const detail = String(reviewer.detail || supervisor.detail || "").replace(/\s+/g, " ").slice(0, 100);
		return {
			release: true,
			kind: "unavailable",
			why: "reviewer=" + reviewer.verdict + " supervisor=" + supervisor.verdict
				+ (detail.length > 0 ? " — " + detail : ""),
		};
	}

	if (reviewer.verdict !== "APPROVED" || supervisor.verdict !== "APPROVED") {
		if (judgesPresent) {
			return {
				release: false,
				kind: "blocked",
				why: "judges present but no verdict within " + Math.round(judgeTimeoutMs / 1000) + "s: reviewer="
					+ reviewer.verdict + " supervisor=" + supervisor.verdict,
			};
		}
		return {
			release: true,
			kind: "fail-open",
			why: "fail-open: reviewer=" + reviewer.verdict + " supervisor=" + supervisor.verdict,
		};
	}
	return { release: true, kind: "approved", why: "both APPROVED" };
}

/**
 * Wrap one model stream so the REPORT is held until both judges rule.
 *
 * Unit of judgement is one assistant message:
 *   - a message that also carries tool calls is narration between operations;
 *     it is released at once (its text stays in the log for the supervisor)
 *   - a message with text and no tool call is the report; it is held, judged
 *     once, then released or replaced
 *
 * Holding per text block instead meant one judge round per block — a reply cut
 * into four blocks cost four rounds and four watermark advances — and it still
 * let the same sentence be judged twice. Judging once per message is the same
 * guarantee at a quarter of the latency.
 */
async function* gatedStream(ctx, options, source) {
	const signal = options?.signal;
	const buffered = [];
	const textIndexes = new Set();
	let text = "";
	let hasToolCall = false;

	// Sample the request's own input BEFORE anything else runs: creating the
	// judge cards below makes their brief turns settle, and those settle notices
	// land in this session's log. Read afterwards, the first real report would
	// look like an answer to a notice and skip review entirely.
	let inputKind;
	try {
		inputKind = newestUserSourceKind(options.sessionId);
	} catch {
		inputKind = undefined;
	}

	// The two judge cards are created BEFORE the first token of the turn, so the
	// user sees 监管/审核 sitting beside the coordinator from the start. Waiting
	// for the first finished report meant a turn that only made tool calls (or
	// died upstream) never created them at all.
	try {
		const agent = ctx.agents.get(options.sessionId);
		const cwd = ctx.sessions.get(options.sessionId)?.header?.cwd;
		if (agent !== undefined) await ensureJudges(ctx, agent, cwd);
	} catch (error) {
		dbg("gatedStream:ensure", "session=" + String(options?.sessionId).slice(0, 22)
			+ " error=" + String(error?.message ?? error).slice(0, 120));
	}

	let failure = null;
	try {
		for await (const chunk of source) {
			buffered.push(chunk);
			if (chunk?.type === "block-start" && chunk.blockType === "text") textIndexes.add(chunk.index);
			if (chunk?.type === "block-start" && chunk.blockType === "tool-call") hasToolCall = true;
			if (chunk?.type === "text-delta" && textIndexes.has(chunk.index)) text += chunk.text ?? "";
		}
	} catch (error) {
		// Never swallow a stream failure: flush what the user already paid for,
		// then rethrow so the host records the real reason.
		failure = error;
	}

	const releaseAll = function* () {
		for (const held of buffered) {
			if (held?.type === "block-end" && held.block?.type === "text" && typeof held.block.text !== "string") {
				yield { ...held, block: { ...held.block, text: textIndexes.has(held.index) ? text : "" } };
				continue;
			}
			yield held;
		}
	};

	if (failure !== null) {
		yield* releaseAll();
		throw failure;
	}
	if (text.length === 0) {
		yield* releaseAll();
		return;
	}
	if (hasToolCall) {
		dbg("gatedStream:narration", "session=" + String(options?.sessionId).slice(0, 22)
			+ " chars=" + text.length + " (message carries tool calls; not a report)");
		yield* releaseAll();
		return;
	}
	if (signal?.aborted === true) {
		dbg("gatedStream:aborted", "session=" + String(options?.sessionId).slice(0, 22) + " before judging");
		yield* releaseAll();
		return;
	}

	// A step opened by a judge's settle notice is an acknowledgement only when
	// the text is ack-shaped (isAckShaped); anything report-like is judged even
	// here. A report the judges REJECTED must get one more hearing regardless of
	// shape, or the lead's corrected retry would never be reviewed.
	const key = String(options.sessionId);
	const owed = (FORCE_AFTER_REJECT.get(key) ?? 0) > 0;
	if (inputKind === "subagent-settled" && !owed && isAckShaped(text)) {
		dbg("gatedStream:notice-driven", "session=" + String(options?.sessionId).slice(0, 22)
			+ " chars=" + text.length);
		yield* releaseAll();
		return;
	}
	if (owed) FORCE_AFTER_REJECT.set(key, 0);
	if (inputKind === "subagent-settled") {
		// Reached only for report-shaped text after a settle notice: judged
		// below, and this line keeps the exemption's edge visible in the log.
		dbg("gatedStream:notice-judged", "session=" + String(options?.sessionId).slice(0, 22)
			+ " chars=" + text.length + (owed ? " owed" : ""));
	}

	const verdict = await judgeReport(ctx, options, text, signal);
	// Arm exactly one retry hearing per rejection. Arming again after the retry
	// would turn "the judges keep refusing" into an endless review loop.
	if (!owed && (verdict.kind === "rejected" || verdict.kind === "blocked")) {
		FORCE_AFTER_REJECT.set(key, 1);
	}
	dbg("gatedStream:settle", "session=" + String(options?.sessionId).slice(0, 22)
		+ " chars=" + text.length
		+ " release=" + verdict.release + " kind=" + verdict.kind
		+ " why=" + String(verdict.why).slice(0, 160));

	if (verdict.release) {
		// Fail-open must never be silent: put a separate, legal text block in
		// front of the words that were not actually cleared by both judges.
		if (verdict.kind === "fail-open" || verdict.kind === "unavailable") {
			const label = verdict.kind === "unavailable"
				? "[审核不可用·未审] "
				: "[审核未完成·自动放行] ";
			const note = label + String(verdict.why).replace(/\s+/g, " ").slice(0, 120);
			const index = 10000;
			yield { type: "block-start", index, blockType: "text" };
			yield { type: "text-delta", index, text: note };
			yield { type: "block-end", index, block: { type: "text", text: note } };
		}
		yield* releaseAll();
		return;
	}

	// The judges refused this text: the model's words never reach the user.
	const reason = String(verdict.why ?? "").replace(/\s+/g, " ").trim();
	const prefix = verdict.kind === "blocked" ? "[审核未完成·已扣留] " : "[已拦截] ";
	const replacement = prefix + (reason.length > 0 ? reason.slice(0, 200) : "未通过审核（判官未给理由）");
	const index = textIndexes.values().next().value ?? 0;
	yield { type: "block-start", index, blockType: "text" };
	yield { type: "text-delta", index, text: replacement };
	yield { type: "block-end", index, block: { type: "text", text: replacement } };
}

function apply(ctx) {
	ctx.on("llm/stream", (options, next) => {
		const housekeeping = isHousekeeping(options);
		const on = housekeeping ? false : gateOnFor(ctx, options);
		dbg("llm/stream", "session=" + String(options?.sessionId).slice(0, 22) + " housekeeping=" + housekeeping + " gateOn=" + on);
		if (housekeeping) return next();
		if (!on) return next();
		return gatedStream(ctx, options, next());
	});
}

export { apply, inject, name, gateOnFor, isSubagentHeader, isHousekeeping, gatedStream, judgeReport, APPROVAL_TIMEOUT_MS };
