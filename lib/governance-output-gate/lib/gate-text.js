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
 * The preferred path is the `send_report` tool: the model submits the exact
 * body, the tool runs the same two judges and returns the verdict, and only an
 * APPROVED body may then be emitted — verbatim, as the last action of the turn.
 * The stream path below remains as the safety net for reports that never went
 * through the tool.
 *
 * Why the report and not each action: gating every tool call cost ~32s per call
 * and still did not cover writes made inside run_code. The log is the complete
 * record, so checking it once per report covers every action, however it was made.
 *
 * fail-closed when both judges are present: a missing verdict WITHHOLDS the
 * text after the long present-judge deadline. Fail-open (with an explicit
 * marker) is reserved for the case where the judges are absent/unavailable.
 */
import { createHash } from "node:crypto";
import {
	awaitVerdict, readLogSince, readLogRange, isEnabled, dbg,
	readWatermark, writeWatermark, APPROVAL_TIMEOUT_MS, PRESENT_TIMEOUT_MS,
	ensureJudges, maybeRotateJudges, isSubagentHeader, JOURNAL_TOOL, evidenceDigest, newestUserSourceKind,
	appendLedger, parseCoverageText, REPORT_TOOL_NAME,
} from "./gate-guard.js";

const name = "governance-output-gate-text";
const inject = ["sessions", "agents", "tools"];

/**
 * The report is a tool call, not a paragraph.
 *
 * `send_report` judges the exact text and returns the verdict. On APPROVED the
 * same text is remembered here; when the model then emits it as a pure-text
 * message, `gatedStream` releases it without a second hearing. That is the
 * whole point: one manuscript, one verdict, and the report is the last action.
 *
 * An approval is single-use, expires quickly, and dies if any tool call lands
 * after it — a report written before the work is not a report, it is a draft.
 */
const REPORT_TOOL = REPORT_TOOL_NAME;
const REPORT_TTL_MS = 10 * 60 * 1000;
const PRECLEARED = new Map();

function manuscriptHash(text) {
	return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function rememberApprovedReport(sessionId, text, kind, maxSeq) {
	if (typeof sessionId !== "string" || sessionId.length === 0) return null;
	const hash = manuscriptHash(text);
	PRECLEARED.set(sessionId, {
		hash,
		kind: String(kind ?? "approved"),
		maxSeq: typeof maxSeq === "number" ? maxSeq : undefined,
		at: Date.now(),
	});
	return hash;
}

function takeApprovedReport(sessionId, text) {
	const entry = PRECLEARED.get(sessionId);
	if (entry === undefined) return null;
	if (Date.now() - entry.at > REPORT_TTL_MS) {
		PRECLEARED.delete(sessionId);
		return null;
	}
	if (entry.hash !== manuscriptHash(text)) return null;
	PRECLEARED.delete(sessionId);
	return entry;
}

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
 * Long text that looks like a report, regardless of whether the same message
 * also carries tool calls. Used to close the "report + tools" side door: such
 * text is withheld, not released as narration.
 */
function isReportShaped(text) {
	return text.length > ACK_MAX_CHARS && REPORT_SHAPE.test(text);
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
			+ " 条事件，其中工具调用 " + pack.calls + " 次；写操作 " + pack.writes + " 次；以下是原始记录摘要，不是正文里的说法）：",
		"写操作计数（全量事件，截断前统计）：write_calls=" + pack.writes
			+ " write_seqs=" + (pack.writeSeqs.length > 0 ? pack.writeSeqs.join(",") : "-")
			+ " write_files=" + pack.writeFiles
			+ (pack.truncated ? "［证据包正文已截断，计数仍为全量］" : ""),
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
				"计数/枚举断言（写了几次、命中几处、几条未跟踪）只认证据包头部 write_calls/write_seqs，或自己重跑同一脚本的 --counts；不得自己数工具 stdout 摘要。头部计数只覆盖本轮范围；正文说「本会话」时用 --counts 0 99999 重跑全会话。",
				"判「对方轮次」只读闸门账本 ~/.dsh/gate-verdicts/<session>.ledger.jsonl，不读对方会话日志——瞬时读数有时点竞态。",
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
				"只审 lead 的操作是否合规（纪律 3.6.2），不审正文结论对错（那是 reviewer 的事）。本请求不含、也不应含待核对正文或清单；收到这类内容一律回「不属本岗」，只按操作面判。",
				"计数只看证据包头部 write_calls/write_seqs；头部只覆盖本轮范围，核「本会话」时用同一脚本 --counts 0 99999 重跑全会话。若正文被截断，用 --counts 补全；证据包未列全时不假装列全，写「覆盖不完整」并说明缺哪段。",
				"APPROVED 时判定末行必须写 `coverage: seq " + sinceSeq + "–B`（B=你实际核到的终点）；只核了一部分就写实际 B 并加 `(partial)`，不得用终点 maxSeq 冒充覆盖。",
				"零操作时直接 APPROVED 并注明「零操作」，coverage 仍按实际范围写。",
				"【时限 " + Math.round(judgeTimeoutMs / 1000) + "s】先回裁决本体；ctx 实测省略（写「ctx: 未实测（时限内省略）」），不要跑任何上下文测量命令。",
				ctxLine("supervisor"),
			].join("\n"), judgeTimeoutMs, signal),
	]);

	const judgedTo = range.maxSeq;
	const coverage = parseCoverageText(supervisor.detail) ?? supervisor.coverage ?? null;
	let coverageKind = "missing";
	let coverageTo = judgedTo;
	if (coverage !== null) {
		if (coverage.partial) {
			coverageKind = "partial";
			coverageTo = sinceSeq;
		} else if (coverage.from > sinceSeq + 1) {
			coverageKind = "gap-start";
			coverageTo = sinceSeq;
		} else if (coverage.to < judgedTo) {
			coverageKind = "partial";
			coverageTo = Math.max(sinceSeq, coverage.to);
		} else {
			coverageKind = "full";
			coverageTo = judgedTo;
		}
	}
	const manuscript = createHash("sha256").update(text).digest("hex").slice(0, 16);
	const ledgerRange = { from: sinceSeq, to: judgedTo };
	appendLedger({
		at: new Date().toISOString(),
		session: sessionId,
		role: "reviewer",
		verdict: reviewer.verdict,
		range: ledgerRange,
		manuscript,
		coverage: null,
		detail: String(reviewer.detail ?? "").slice(0, 300),
	});
	appendLedger({
		at: new Date().toISOString(),
		session: sessionId,
		role: "supervisor",
		verdict: supervisor.verdict,
		range: ledgerRange,
		manuscript,
		coverage: coverageKind,
		coverageRange: coverage,
		detail: String(supervisor.detail ?? "").slice(0, 300),
	});

	// Advance the watermark only when the supervisor actually covered the range.
	if (supervisor.verdict === "APPROVED") {
		writeWatermark({ ...watermark, [sessionId]: coverageTo });
	}

	if (reviewer.verdict === "REJECTED") {
		return { release: false, kind: "rejected", why: "reviewer REJECTED: " + (reviewer.detail || ""), maxSeq: judgedTo };
	}
	if (supervisor.verdict === "REJECTED") {
		return { release: false, kind: "rejected", why: "supervisor REJECTED: " + (supervisor.detail || ""), maxSeq: judgedTo };
	}
	// A declared partial/gap coverage is not a pass over the whole range. Hold the
	// report instead of silently treating maxSeq as covered; the next request
	// resumes from coverageTo (partial) or the same watermark (gap-start).
	if (supervisor.verdict === "APPROVED" && (coverageKind === "partial" || coverageKind === "gap-start")) {
		return {
			release: false,
			kind: "blocked",
			why: "supervisor coverage " + coverageKind + ": seq "
				+ (coverage === null ? "-" : coverage.from + "–" + coverage.to)
				+ "，本轮要求覆盖到 seq " + judgedTo + "（下次从 " + coverageTo + " 续审）",
			maxSeq: judgedTo,
		};
	}

	// The user paused: nothing is waiting for this text any more. Release it
	// unmarked (the turn is over) instead of pretending a judge ruled.
	if (reviewer.verdict === "CANCELLED" || supervisor.verdict === "CANCELLED") {
		return { release: true, kind: "cancelled", why: "user paused the turn", maxSeq: judgedTo };
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
			maxSeq: judgedTo,
		};
	}

	if (reviewer.verdict !== "APPROVED" || supervisor.verdict !== "APPROVED") {
		if (judgesPresent) {
			return {
				release: false,
				kind: "blocked",
				why: "judges present but no verdict within " + Math.round(judgeTimeoutMs / 1000) + "s: reviewer="
					+ reviewer.verdict + " supervisor=" + supervisor.verdict,
				maxSeq: judgedTo,
			};
		}
		return {
			release: true,
			kind: "fail-open",
			why: "fail-open: reviewer=" + reviewer.verdict + " supervisor=" + supervisor.verdict,
			maxSeq: judgedTo,
		};
	}
	return { release: true, kind: "approved", why: "both APPROVED", maxSeq: judgedTo };
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

	// Same release, but every text block is dropped and replaced by one marker.
	// Tool-call blocks still run: the operations are legitimate; only the
	// unjudged report text is withheld.
	const releaseWithoutText = function* (marker) {
		for (const held of buffered) {
			if (held?.type === "block-start" && held.blockType === "text") continue;
			if (held?.type === "text-delta" && textIndexes.has(held.index)) continue;
			if (held?.type === "block-end" && held.block?.type === "text" && textIndexes.has(held.index)) continue;
			yield held;
		}
		const index = 10001;
		yield { type: "block-start", index, blockType: "text" };
		yield { type: "text-delta", index, text: marker };
		yield { type: "block-end", index, block: { type: "text", text: marker } };
	};

	if (failure !== null) {
		yield* releaseAll();
		throw failure;
	}
	if (text.length === 0) {
		yield* releaseAll();
		return;
	}

	const key = String(options.sessionId);

	// A message that also carries tool calls is narration between operations.
	// Report-shaped narration is still a report: it used to slip past the gate
	// and reach the user before any verdict. Hold the words, let the tool calls
	// run, and say why. Process narration is one status line, not a report.
	if (hasToolCall) {
		if (isReportShaped(text)) {
			dbg("gatedStream:withheld-narration", "session=" + key.slice(0, 22)
				+ " chars=" + text.length + " (report-shaped text with tool calls; text withheld)");
			yield* releaseWithoutText("[叙述已扣留] 本条含工具调用，长文未送审；汇报请用 send_report 单独提交。");
			return;
		}
		dbg("gatedStream:narration", "session=" + key.slice(0, 22)
			+ " chars=" + text.length + " (message carries tool calls; not a report)");
		yield* releaseAll();
		return;
	}
	if (signal?.aborted === true) {
		dbg("gatedStream:aborted", "session=" + key.slice(0, 22) + " before judging");
		yield* releaseAll();
		return;
	}

	// The `send_report` tool already judged this exact text. Release it as-is:
	// one manuscript, one verdict — no second hearing, and no late re-judging
	// of a report the user has already read.
	const preclear = takeApprovedReport(key, text);
	if (preclear !== null) {
		const after = preclear.maxSeq === undefined
			? { events: [] }
			: readLogRange(key, preclear.maxSeq + 1, Number.MAX_SAFE_INTEGER);
		// The submission call itself may land a beat after the seq snapshot; it is
		// the report, not work done after it. Any other tool call voids the pass.
		const laterOps = after.events.filter((e) => {
			if (e.type !== "tool/call" && e.type !== "tool/ptc-dispatch") return false;
			return String(e.data?.name ?? "") !== REPORT_TOOL;
		}).length;
		if (laterOps === 0) {
			dbg("gatedStream:precleared", "session=" + key.slice(0, 22)
				+ " chars=" + text.length + " kind=" + preclear.kind);
			if (preclear.kind === "fail-open" || preclear.kind === "unavailable") {
				const label = preclear.kind === "unavailable" ? "[审核不可用·未审] " : "[审核未完成·自动放行] ";
				const note = label + "本条由 send_report 提交，但判官不可用。";
				yield { type: "block-start", index: 10000, blockType: "text" };
				yield { type: "text-delta", index: 10000, text: note };
				yield { type: "block-end", index: 10000, block: { type: "text", text: note } };
			}
			yield* releaseAll();
			return;
		}
		// Work landed after the verdict: the report is stale. Fall through and
		// let it be judged again as a new manuscript.
		dbg("gatedStream:preclear-stale", "session=" + key.slice(0, 22)
			+ " opsAfter=" + laterOps + "（放行后又操作，改走重审）");
	}

	// A step opened by a judge's settle notice is an acknowledgement only when
	// the text is ack-shaped (isAckShaped); anything report-like is judged even
	// here. A report the judges REJECTED must get one more hearing regardless of
	// shape, or the lead's corrected retry would never be reviewed.
	const owed = (FORCE_AFTER_REJECT.get(key) ?? 0) > 0;
	if (inputKind === "subagent-settled" && !owed && isAckShaped(text)) {
		dbg("gatedStream:notice-driven", "session=" + key.slice(0, 22)
			+ " chars=" + text.length);
		yield* releaseAll();
		return;
	}
	if (owed) FORCE_AFTER_REJECT.set(key, 0);
	if (inputKind === "subagent-settled") {
		// Reached only for report-shaped text after a settle notice: judged
		// below, and this line keeps the exemption's edge visible in the log.
		dbg("gatedStream:notice-judged", "session=" + key.slice(0, 22)
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

/**
 * The model-facing `send_report` tool — the submit half of "the report is a
 * commit, not a paragraph". Registration is best-effort: if the host rejects
 * the definition, the stream gate still guards reports, but reports have to be
 * judged on the way out instead of before they are sent.
 */
function reportToolDefinition(ctx) {
	return {
		name: REPORT_TOOL,
		description:
			"Submit your final report to the user for review. Call this only after every operation is complete. "
			+ "On APPROVED, output the exact same text as your next message and call no tools. "
			+ "On REJECTED, do not output that text; fix it and submit again. "
			+ "Work done after an approval voids it.",
		parameters: {
			type: "object",
			properties: {
				text: { type: "string", description: "The report body to send, verbatim." },
				note: { type: "string", description: "What changed since the last submission (optional)." },
			},
			required: ["text"],
			additionalProperties: false,
		},
		output: {
			schema: {
				type: "object",
				properties: {
					verdict: { type: "string", description: "APPROVED | REJECTED | DISABLED | UNAVAILABLE" },
					reason: { type: "string" },
					hash: { type: "string" },
					next: { type: "string" },
				},
				required: ["verdict", "reason", "next"],
				additionalProperties: false,
			},
			render(args, value) {
				return [{ type: "text", text: "[" + String(value?.verdict ?? "?") + "] " + String(value?.reason ?? "") }];
			},
		},
		timeoutMs: 300000,
		async execute(args, exec) {
			const text = typeof args?.text === "string" ? args.text : "";
			const agent = exec?.agent;
			const sessionId = agent?.id ?? agent?.session?.id;
			const cwd = agent?.session?.header?.cwd;
			const refuse = (verdict, reason, next) => ({ verdict, reason, hash: "", next });
			if (text.trim().length === 0) {
				return refuse("REJECTED", "send_report: text 为空。", "把要发的正文逐字放进 text。");
			}
			if (text.length > 20000) {
				return refuse("REJECTED", "send_report: 正文超过 20,000 字符。", "先精简；裁决请求只留结论与指针。");
			}
			if (typeof sessionId !== "string" || sessionId.length === 0) {
				return refuse("DISABLED", "无法确定会话，未提交审查。", "直接输出正文。");
			}
			if (isSubagentHeader(agent?.session?.header)) {
				return refuse("DISABLED", "send_report 只供协调侧使用。", "子卡直接把结果回报给协调侧，由协调侧汇总提交。");
			}
			if (!isEnabled(cwd)) {
				return refuse("DISABLED", "输出闸门未对本工作区开启。", "直接输出正文即可。");
			}
			const verdict = await judgeReport(ctx, { sessionId, signal: exec?.signal }, text, exec?.signal);
			if (verdict.release) {
				const hash = rememberApprovedReport(sessionId, text, verdict.kind, verdict.maxSeq);
				const unjudged = verdict.kind === "fail-open" || verdict.kind === "unavailable";
				return {
					verdict: unjudged ? "UNAVAILABLE" : "APPROVED",
					reason: String(verdict.why ?? ""),
					hash: hash ?? "",
					next: unjudged
						? "可以原样输出；闸门会标注未审。"
						: "下一条消息只输出这段正文，逐字不改，且不要调用任何工具。",
				};
			}
			return refuse("REJECTED", String(verdict.why ?? "未通过审核"), "不要输出该正文；按 reason 修正后重新调用 send_report。");
		},
	};
}

function registerReportTool(ctx) {
	try {
		if (typeof ctx?.tools?.register !== "function") return;
		const dispose = ctx.tools.register(reportToolDefinition(ctx));
		// Tie the registration to this plugin's fiber: a reload must not leave a
		// second `send_report` behind.
		if (typeof ctx.effect === "function") ctx.effect(() => dispose);
		dbg("reportTool:registered", "name=" + REPORT_TOOL);
	} catch (error) {
		dbg("reportTool:register-error", String(error?.message ?? error).slice(0, 200));
	}
}

function apply(ctx) {
	registerReportTool(ctx);
	ctx.on("llm/stream", (options, next) => {
		const housekeeping = isHousekeeping(options);
		const on = housekeeping ? false : gateOnFor(ctx, options);
		dbg("llm/stream", "session=" + String(options?.sessionId).slice(0, 22) + " housekeeping=" + housekeeping + " gateOn=" + on);
		if (housekeeping) return next();
		if (!on) return next();
		return gatedStream(ctx, options, next());
	});
}

export {
	apply, inject, name, gateOnFor, isSubagentHeader, isHousekeeping, gatedStream, judgeReport,
	APPROVAL_TIMEOUT_MS, REPORT_TOOL, manuscriptHash, rememberApprovedReport, takeApprovedReport, isReportShaped,
	reportToolDefinition,
};
