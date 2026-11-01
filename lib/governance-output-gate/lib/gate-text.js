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
 * APPROVED body may then be emitted — as the last action of the turn. On
 * APPROVED the model answers with the short token `[发送放行稿]` and the gate
 * delivers the approved bytes itself: asking a model to re-type thousands of
 * characters byte-for-byte is the trap that produced the 22-block [已拦截]
 * storm of 2026-10-28 (one extra 「需」 in the first retyped line). The stream
 * path below remains as the safety net for reports that never went through the
 * tool.
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
	appendLedger, parseCoverageText, REPORT_TOOL_NAME, judgeCtxPct, handoverSatisfied,
	isControlledDoc, docResultHash, rememberDocClearance, hashText,
	markReportFinalized, isReportFinalized, clearReportFinalized, quiesceAfterReport, guardAgentSend,
	isVoidingOpName,
} from "./gate-guard.js";

const name = "governance-output-gate-text";
const inject = ["sessions", "agents", "tools"];

/**
 * The report is a tool call, not a paragraph.
 *
 * `send_report` judges the exact text and returns the verdict. On APPROVED the
 * text itself is remembered here; the model then answers with the token
 * `[发送放行稿]` and `gatedStream` swaps in the approved bytes — or, if the
 * model re-emits the exact text, it is released directly. One manuscript, one
 * verdict, and the report is the last action of the turn.
 *
 * There is no wall-clock TTL on the approval on purpose: the binding scope is
 * the turn, not the clock. A user utterance clears the entry (unlockSession),
 * and any tool call after the approval voids it (the staleness check at the
 * release sites) — a 10-minute expiry added nothing but the 2026-10-28 23:00
 * deadlock, where byte-perfect output was re-judged past the deadline and the
 * supervisor's silence rule rejected it on procedure.
 */
const REPORT_TOOL = REPORT_TOOL_NAME;
const PRECLEARED = new Map();

function manuscriptHash(text) {
	return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function rememberApprovedReport(sessionId, text, kind, maxSeq) {
	if (typeof sessionId !== "string" || sessionId.length === 0) return null;
	const hash = manuscriptHash(text);
	PRECLEARED.set(sessionId, {
		hash,
		text: String(text ?? ""),
		kind: String(kind ?? "approved"),
		maxSeq: typeof maxSeq === "number" ? maxSeq : undefined,
		at: Date.now(),
	});
	return hash;
}

/** Debug/test accessor: the live preclear entry, if any. Read-only. */
function preclearState(sessionId) {
	if (typeof sessionId !== "string" || sessionId.length === 0) return undefined;
	return PRECLEARED.get(sessionId);
}

/** Peek at the approval for this exact text WITHOUT consuming it. A hit that
 * then turns out stale (ops after the verdict) must not destroy the approval —
 * the discovering attempt is not the release, and a later clean attempt should
 * still be able to release the same approved bytes. Both release sites delete
 * the entry themselves, after the staleness check passes. */
function takeApprovedReport(sessionId, text) {
	const entry = PRECLEARED.get(sessionId);
	if (entry === undefined) return null;
	if (entry.hash !== manuscriptHash(text)) return null;
	return entry;
}

/** Tool calls that landed after the approval seq and void the pass. Writes and
 * shell/interpreter calls void (isVoidingOpName); reads do not — the model may
 * verify its work and then emit. run_code is judged by what it dispatched: a
 * write made inside it lands in the log as its own write event, which voids.
 * The submission call itself is exempt (it IS the report). */
function approvedReportOpsAfter(sessionId, entry) {
	if (entry.maxSeq === undefined) return 0;
	const after = readLogRange(sessionId, entry.maxSeq + 1, Number.MAX_SAFE_INTEGER);
	return after.events.filter((e) => {
		if (e.type !== "tool/call" && e.type !== "tool/ptc-dispatch") return false;
		return isVoidingOpName(String(e.data?.name ?? ""));
	}).length;
}

/**
 * 放行稿代发令牌：APPROVED 后模型只需输出 `[发送放行稿]`，闸门把放行稿原文
 * 替换进输出流。令牌不携带内容，抄错一个字的风险从结构上消失。
 */
const APPROVED_TOKEN = "发送放行稿";

function isApprovedToken(text) {
	return text.replace(/[\s\[\]【】()（）]/g, "") === APPROVED_TOKEN;
}

/**
 * The approval still waiting to be released, or null.
 *
 * Used where a loop cap would otherwise silence the text. The caps exist to
 * starve notice loops, not to swallow a report the judges already cleared —
 * 2026-10-29 14:56 the lead retyped an approved 1330-char report as 1342
 * chars, the hash missed, and the notice cap dropped the whole thing.
 */
function pendingApprovalFor(sessionId) {
	const entry = PRECLEARED.get(sessionId);
	if (entry === undefined || typeof entry.text !== "string" || entry.text.length === 0) return null;
	if (approvedReportOpsAfter(sessionId, entry) !== 0) return null;
	return entry;
}

/** Character 4-gram set; cheap and good enough to tell "retyped" from "another text". */
function shinglesOf(text) {
	const set = new Set();
	for (let i = 0; i + 4 <= text.length; i++) set.add(text.slice(i, i + 4));
	return set;
}

/**
 * Is `candidate` the approved report retyped with drift?
 *
 * The clearance may only be force-released for a retyped copy of itself. A
 * genuinely different text must not inherit the older approval — that would put
 * words the judges never cleared in front of the user.
 */
function isDriftedEcho(approved, candidate) {
	if (approved.length < 80 || candidate.length < 80) return false;
	const a = shinglesOf(approved);
	const b = shinglesOf(candidate);
	if (a.size === 0 || b.size === 0) return false;
	let shared = 0;
	for (const s of a) if (b.has(s)) shared++;
	return shared / (a.size + b.size - shared) >= 0.6;
}

/**
 * How much of one verdict the user sees. The full ruling stays in the ledger;
 * the earlier 200-char cap cut the 2026-10-29 13:54 rejection mid-file-name
 * ("gate-too"), so the reader could not see what was actually wrong.
 */
const REJECT_SHOWN_CHARS = 1200;

/**
 * Compose a rejection/withheld block: prefix + reason, de-duplicated, capped.
 * A judge's reply must OPEN with the verdict token (the scan depends on it), so
 * `why` arrives as "reviewer REJECTED: REJECTED …" — show the word once.
 */
function composeRejectMarker(kind, why) {
	const prefix = kind === "blocked" ? "[审核未完成·已扣留] " : "[已拦截] ";
	const reason = String(why ?? "").replace(/\s+/g, " ").trim();
	if (reason.length === 0) return prefix + "未通过审核（判官未给理由）";
	const dedup = reason.replace(
		/^((?:reviewer|supervisor)\d*)\s+(APPROVED|REJECTED|UNAVAILABLE|TIMEOUT)\s*[:：]\s*\2\b\s*/i,
		"$1 $2：",
	);
	const shown = dedup.length > REJECT_SHOWN_CHARS ? dedup.slice(0, REJECT_SHOWN_CHARS) + "…" : dedup;
	return prefix + shown;
}

/**
 * Put the tool's `next` step into `reason` as well.
 *
 * Models routinely print only verdict/reason (2026-10-29 14:56 the lead's
 * wrapper logged `res.verdict` and `res.reason`, dropped `next`, retyped the
 * report by hand and missed the approval by 12 characters). The instruction
 * has to live in the field the caller actually reads.
 */
function reasonWithNext(reason, next) {
	const base = String(reason ?? "").trim();
	const step = String(next ?? "").trim();
	if (step.length === 0) return base;
	return (base.length === 0 ? "" : base + "；") + "下一步：" + step;
}

/**
 * Judged rounds this turn has already spent on notice-driven steps, and visible
 * rejection markers this turn has already shown. Both are per-turn latches:
 * 2026-10-28 22:45–23:02 the lead answered 22 judge-settle notices in one turn,
 * each answer spawning another judge round whose notices woke the next answer.
 * After the caps the notice loop starves: no judge round, no new notice, and
 * nothing more the user has to scroll past. A user utterance resets everything.
 */
const NOTICE_JUDGED_LIMIT = 2;
const REJECT_NOTE_LIMIT = 2;
const NOTICE_JUDGED = new Map();
const REJECT_NOTES = new Map();

/**
 * Sessions whose last judged report was rejected: the next report is heard even
 * if its step was opened by a judge notice, so a corrected retry is reviewed.
 * Consumed once — a rejection must not turn into an endless review loop.
 */
const FORCE_AFTER_REJECT = new Map();

/**
 * A user message starts a new turn; everything the previous turn latched is
 * scoped to that turn and dies with it (纪律 3.3.2(2) "直到用户发言").
 * Background subagent notices do not pass the source check and leave the
 * silence of 3.3.2(7) intact.
 */
function unlockSession(sessionId) {
	if (typeof sessionId !== "string" || sessionId.length === 0) return;
	clearReportFinalized(sessionId);
	PRECLEARED.delete(sessionId);
	FORCE_AFTER_REJECT.delete(sessionId);
	NOTICE_JUDGED.delete(sessionId);
	REJECT_NOTES.delete(sessionId);
	dbg("session-unlocked", "session=" + sessionId.slice(0, 22));
}

/** Only a message the user typed ends the report turn; notices must not. */
function isUserUtterance(event) {
	return event?.type === "user/message" && event?.data?.source?.kind === "user";
}

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
async function judgeReport(ctx, options, text, signal, meta = {}) {
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

	// User rule (2026-10-30): at ≥35% the card must hand over BEFORE it reports.
	// The handover itself is a document submission, so it is exempt; otherwise a
	// rotate-line card could never write the very file this rule requires.
	const isDocument = meta.kind === "document" && typeof meta.target === "string" && meta.target.length > 0;
	const isHandover = isDocument && /交接文档-.*\.md$/i.test(meta.target);
	if (!isHandover) {
		const measured = judgeCtxPct(sessionId);
		if (measured !== null && measured.pct >= 35) {
			const handover = handoverSatisfied(cwd, sessionId);
			if (!handover.ok) {
				return {
					release: false,
					kind: "rotated-no-handover",
					why: "ctx " + measured.pct + "% ≥35%：先写本会话交接文档（头含 ctx-rotate-handover 标记）再呈报；当前未找到——"
						+ handover.reason + "。这是用户 2026-10-30 规则。",
				};
			}
		}
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
				+ "。按用户 2026-10-30 规则，≥35% 自动收尾，无需用户批准或请示"
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

	// 指纹随请求下发：判官不必各自重算哈希，也不会把「放行稿复现」误记成
	// 一次新的输出尝试（2026-10-28 23:00 的判词把闸门标记计成了 lead 的
	// 第 21 次「尝试」）。指纹是元数据，不是正文，不违反监管侧「不收正文」。
	const pendingHash = manuscriptHash(text);
	const releaseHash = PRECLEARED.get(sessionId)?.hash;
	const fingerprintLine = "正文指纹: sha16=" + pendingHash
		+ (releaseHash === undefined
			? ""
			: releaseHash === pendingHash
				? "；在案放行稿指纹: sha16=" + releaseHash + "（两指纹相同 ⇒ 本文即已放行的稿件，不是新稿）"
				: "；在案放行稿指纹: sha16=" + releaseHash + "（与本文不同 ⇒ 这是新稿，须完整核对）");
	const reviewerSubject = isDocument
		? "lead 即将写入文档 " + meta.target + "（不是发给用户的报告），请核对后放行。"
		: "lead 即将向用户输出下面这段正文，请核对后放行。";
	const supervisorSubject = isDocument
		? "lead 即将写入文档 " + meta.target + "。请核验它本轮的操作日志。"
		: "lead 即将向用户输出报告。请核验它本轮的操作日志。";
	const bodyOpen = isDocument
		? "---8<--- 待写入正文（本次写入的 new_string，逐字）---8<---"
		: "---8<--- 待核对正文 ---8<---";
	const bodyClose = isDocument ? "---8<--- 待写入正文结束 ---8<---" : "---8<--- 正文结束 ---8<---";

	const [reviewer, supervisor] = await Promise.all([
		awaitVerdict(ctx, agent, judged.reviewer,
			reviewerSubject,
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
					...(isDocument ? ["这是文档写入件：放行后原样写入 " + meta.target + "，写入后不得再改；改一字即新稿。"] : []),
					fingerprintLine,
					"【时限 " + Math.round(judgeTimeoutMs / 1000) + "s】先回裁决本体；ctx 实测省略（写「ctx: 未实测（时限内省略）」），不要跑任何上下文测量命令。",
					ctxLine("reviewer"),
				bodyOpen,
				text,
				bodyClose,
			].join("\n"), judgeTimeoutMs, signal),
		awaitVerdict(ctx, agent, judged.supervisor,
			supervisorSubject,
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
					...(isDocument ? ["本件尚在送审、未落盘；放行后才允许写入。若日志中已有对该 target 的写入，即属先写后审，直接 REJECTED。"] : []),
					fingerprintLine,
					"【时限 " + Math.round(judgeTimeoutMs / 1000) + "s】先回裁决本体；ctx 实测省略（写「ctx: 未实测（时限内省略）」），不要跑任何上下文测量命令。",
					ctxLine("supervisor"),
			].join("\n"), judgeTimeoutMs, signal),
	]);

	const judgedTo = range.maxSeq;
	const coverage = parseCoverageText(supervisor.detail) ?? supervisor.coverage ?? null;
	const { kind: coverageKind, to: coverageTo } = classifySupervisorCoverage(coverage, sinceSeq, judgedTo);
	const manuscript = pendingHash;
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
	// A declared partial/gap coverage is not a pass over the whole range — and
	// neither is NO coverage claim at all (审核意见 P1-6，2026-11-01): a bare
	// APPROVED without `coverage: seq A–B` must not advance the watermark as if
	// the supervisor had audited up to maxSeq. Hold the report; the next request
	// resumes from coverageTo (partial) or the same watermark (gap-start/missing).
	if (supervisor.verdict === "APPROVED" && (coverageKind === "partial" || coverageKind === "gap-start" || coverageKind === "missing")) {
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
	let inputKind = options?.inputKind;
	if (inputKind === undefined) {
		try {
			inputKind = newestUserSourceKind(options.sessionId);
		} catch {
			inputKind = undefined;
		}
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

	// 等待即静默（纪律 3.3.2(7)）：a turn opened by a subagent notice has no
	// user to answer after a report. Drop the text without a marker — a stub
	// would itself be the extra line the user sees after the report.
	const releaseSilently = function* () {
		for (const held of buffered) {
			if (held?.type === "block-start" && held.blockType === "text") continue;
			if (held?.type === "text-delta" && textIndexes.has(held.index)) continue;
			if (held?.type === "block-end" && held.block?.type === "text" && textIndexes.has(held.index)) continue;
			yield held;
		}
	};

	// 放行稿代发：drop the model's token message and emit the approved bytes in
	// its place. What reaches the user is exactly what both judges read.
	const releaseApproved = function* (entry) {
		for (const held of buffered) {
			if (held?.type === "block-start" && held.blockType === "text") continue;
			if (held?.type === "text-delta" && textIndexes.has(held.index)) continue;
			if (held?.type === "block-end" && held.block?.type === "text" && textIndexes.has(held.index)) continue;
			yield held;
		}
		let index = 10002;
		if (entry.kind === "fail-open" || entry.kind === "unavailable") {
			const label = entry.kind === "unavailable" ? "[审核不可用·未审] " : "[审核未完成·自动放行] ";
			const note = label + "本条由 send_report 提交，但判官不可用。";
			yield { type: "block-start", index, blockType: "text" };
			yield { type: "text-delta", index, text: note };
			yield { type: "block-end", index, block: { type: "text", text: note } };
			index = 10003;
		}
		const approved = String(entry.text ?? "");
		yield { type: "block-start", index, blockType: "text" };
		yield { type: "text-delta", index, text: approved };
		yield { type: "block-end", index, block: { type: "text", text: approved } };
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

	// 汇报即终局（纪律 3.3.2）：呈报放行并输出后，本 turn 不再有任何输出。
	// The finalized flag is set the moment the approved report is released; any
	// narration after that is withheld so the report stays the turn's last
	// message and remains visible outside the UI's activity fold.
	if (isReportFinalized(key)) {
		const source = newestUserSourceKind(key);
		dbg("gatedStream:report-finalized", "session=" + key.slice(0, 22) + " chars=" + text.length
			+ " source=" + source + "（呈报已终局，正文扣留）");
		if (source !== "user") {
			yield* releaseSilently();
			return;
		}
		yield* releaseWithoutText("[汇报即终局] 呈报已发出，本轮已结束。");
		return;
	}

	// 放行稿代发：the approved text is delivered by the gate, not retyped by
	// the model. Only a pure-text message qualifies; with tool calls attached
	// the narration rules below apply and the token waits for a clean step.
	if (!hasToolCall && isApprovedToken(text)) {
		const entry = PRECLEARED.get(key);
		if (entry !== undefined && typeof entry.text === "string" && entry.text.length > 0) {
			const laterOps = approvedReportOpsAfter(key, entry);
			if (laterOps === 0) {
				dbg("gatedStream:token-release", "session=" + key.slice(0, 22)
					+ " chars=" + entry.text.length + " kind=" + entry.kind);
				PRECLEARED.delete(key);
				markReportFinalized(key);
				guardAgentSend(ctx, key);
				quiesceAfterReport(ctx, key);
				yield* releaseApproved(entry);
				return;
			}
			dbg("gatedStream:token-stale", "session=" + key.slice(0, 22)
				+ " opsAfter=" + laterOps + "（放行后又操作，令牌不放行）");
		} else {
			dbg("gatedStream:token-noclear", "session=" + key.slice(0, 22)
				+ " chars=" + text.length + "（无放行稿在案，按普通短文处理）");
		}
	}

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
	// of a report the user has already read. No clock expiry: the turn boundary
	// (user speech) and the ops staleness check below are the real guards.
	const preclear = takeApprovedReport(key, text);
	if (preclear !== null) {
		const laterOps = approvedReportOpsAfter(key, preclear);
		if (laterOps === 0) {
			// Consume only now: this attempt IS the release. A stale discovery
			// above leaves the approval intact for a later clean attempt.
			PRECLEARED.delete(key);
			dbg("gatedStream:precleared", "session=" + key.slice(0, 22)
				+ " chars=" + text.length + " kind=" + preclear.kind);
			if (preclear.kind === "fail-open" || preclear.kind === "unavailable") {
				const label = preclear.kind === "unavailable" ? "[审核不可用·未审] " : "[审核未完成·自动放行] ";
				const note = label + "本条由 send_report 提交，但判官不可用。";
				yield { type: "block-start", index: 10000, blockType: "text" };
				yield { type: "text-delta", index: 10000, text: note };
				yield { type: "block-end", index: 10000, block: { type: "text", text: note } };
			}
			// 汇报即终局：呈报放行并原样输出后，本 turn 的一切到此为止。
			markReportFinalized(key);
			guardAgentSend(ctx, key);
			quiesceAfterReport(ctx, key);
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
		// 每一轮被判官唤醒的回答都要开一轮送审，而每轮送审的回执又唤醒下一轮：
		// 2026-10-28 一晚跑出 22 连拦。限额之内照常送审（给改稿机会）；
		// 限额之后一律静默扣留、不再送审——判官不再被召唤，回执不再产生，
		// 循环就此断粮。用户发言（unlockSession）才重新计数。
		const judged = (NOTICE_JUDGED.get(key) ?? 0) + 1;
		NOTICE_JUDGED.set(key, judged);
		if (judged > NOTICE_JUDGED_LIMIT) {
			// The cap starves the notice loop, not a cleared report: if a verdict
			// is still waiting to be released, deliver it (the approved bytes,
			// not the model's retyped copy) and end the turn as a release would.
			const pending = pendingApprovalFor(key);
			if (pending !== null && isDriftedEcho(pending.text, text)) {
				PRECLEARED.delete(key);
				dbg("gatedStream:notice-capped-release", "session=" + key.slice(0, 22)
					+ " judged=" + judged + " chars=" + pending.text.length
					+ "（限额已到，但有放行稿在案：代发原件）");
				markReportFinalized(key);
				guardAgentSend(ctx, key);
				quiesceAfterReport(ctx, key);
				yield* releaseApproved(pending);
				return;
			}
			if (pending !== null) {
				dbg("gatedStream:notice-capped-pending", "session=" + key.slice(0, 22)
					+ " judged=" + judged + " chars=" + text.length
					+ "（有放行稿在案，但本条不是它的重打件：不代发）");
			}
			dbg("gatedStream:notice-capped", "session=" + key.slice(0, 22)
				+ " judged=" + judged + " chars=" + text.length + "（唤醒轮送审限额已到，静默扣留）");
			quiesceAfterReport(ctx, key);
			yield* releaseSilently();
			return;
		}
		// Reached only for report-shaped text after a settle notice: judged
		// below, and this line keeps the exemption's edge visible in the log.
		dbg("gatedStream:notice-judged", "session=" + key.slice(0, 22)
			+ " chars=" + text.length + (owed ? " owed" : "") + " judged=" + judged);
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
		// 汇报即终局：报告形态的正文放行并输出后，本 turn 到此为止。
		// Short acks and status lines do not end the turn.
		if (isReportShaped(text)) {
			markReportFinalized(key);
			guardAgentSend(ctx, key);
			quiesceAfterReport(ctx, key);
		}
		yield* releaseAll();
		return;
	}

	// The judges refused this text: the model's words never reach the user.
	// The first two refusals of a turn each show one visible marker (signal);
	// every later one is withheld silently (noise) — the user cannot act on
	// repeat blocks anyway, and the notice-loop cap above stops the burning.
	const reason = String(verdict.why ?? "").replace(/\s+/g, " ").trim();
	const shown = REJECT_NOTES.get(key) ?? 0;
	REJECT_NOTES.set(key, shown + 1);
	if (shown >= REJECT_NOTE_LIMIT) {
		dbg("gatedStream:reject-silent", "session=" + key.slice(0, 22)
			+ " shown=" + shown + " chars=" + text.length
			+ " why=" + reason.slice(0, 160) + "（可见拦截块已达限，静默扣留）");
		yield* releaseSilently();
		return;
	}
	const replacement = composeRejectMarker(verdict.kind, reason);
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
			"Submit the final report to the user, OR a controlled-document patch before it is written. "
			+ "kind=report: on APPROVED, your next message must be exactly [发送放行稿] and call no tools — "
			+ "the gate then delivers the approved text verbatim for you; that output ENDS the turn; "
			+ "no further tools, output, or responses until the user speaks. Never re-type the body: "
			+ "a one-character drift voids the approval. "
			+ "kind=document: on APPROVED, write the exact same old_string/new_string (or content) to target, then stop editing it. "
			+ "On REJECTED, do not output/write that text; fix it and submit again. Work done after an approval voids it.",
		parameters: {
			type: "object",
			properties: {
				kind: { type: "string", description: "report (default) or document." },
				text: { type: "string", description: "Report body. For document mode: the new fragment to review (defaults to new_string)." },
				target: { type: "string", description: "Document mode: archive or handoff path." },
				old_string: { type: "string", description: "Document mode: the exact existing text to replace." },
				new_string: { type: "string", description: "Document mode: the exact replacement text." },
				replace_all: { type: "boolean", description: "Document mode: replace every occurrence." },
				content: { type: "string", description: "Document mode: full new file content (alternative to old_string/new_string)." },
				note: { type: "string", description: "What changed since the last submission (optional)." },
			},
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
		timeoutMs: 900000,
		async execute(args, exec) {
			const kind = args?.kind === "document" ? "document" : "report";
			const agent = exec?.agent;
			const sessionId = agent?.id ?? agent?.session?.id;
			const cwd = agent?.session?.header?.cwd;
			const refuse = (verdict, reason, next) => ({ verdict, reason: reasonWithNext(reason, next), hash: "", next });
			if (typeof sessionId !== "string" || sessionId.length === 0) {
				return refuse("DISABLED", "无法确定会话，未提交审查。", "直接输出正文。");
			}
			if (isSubagentHeader(agent?.session?.header)) {
				return refuse("DISABLED", "send_report 只供协调侧使用。", "子卡直接把结果回报给协调侧，由协调侧汇总提交。");
			}
			if (!isEnabled(cwd)) {
				return refuse("DISABLED", "输出闸门未对本工作区开启。", "直接输出正文即可。");
			}

			if (kind === "document") {
				const target = String(args?.target ?? "");
				if (!isControlledDoc(target)) {
					return refuse("REJECTED", "document 模式只接受项目档案/交接文档。", "target 写完整路径，如 …\\协作规则\\项目档案-xiaobai-agent.md。");
				}
				let resultHash = null;
				let manuscript = "";
				if (typeof args?.content === "string") {
					resultHash = hashText(args.content);
					manuscript = args.content;
				} else if (typeof args?.old_string === "string" && typeof args?.new_string === "string") {
					resultHash = docResultHash(target, args);
					manuscript = args.new_string;
				} else {
					return refuse("REJECTED", "document 模式需要 content，或 old_string + new_string。", "补上要写入的逐字内容。");
				}
				if (resultHash === null) {
					return refuse("REJECTED", "old_string 在现文件中找不到（或写形态不可校验）。", "先读现文，再把 old_string 逐字抄进来。");
				}
				if (manuscript.trim().length === 0) {
					return refuse("REJECTED", "待写入正文为空。", "把 new_string / content 填全。");
				}
				if (manuscript.length > 20000) {
					return refuse("REJECTED", "单次文档补丁超过 20,000 字符。", "拆成多次提交；每次提交同一目标只写一处。");
				}
				const verdict = await judgeReport(ctx, { sessionId, signal: exec?.signal }, manuscript, exec?.signal, { kind: "document", target });
				if (verdict.release) {
					rememberDocClearance(sessionId, target, resultHash, verdict.maxSeq);
					const unjudged = verdict.kind === "fail-open" || verdict.kind === "unavailable";
					const next = "现在对 " + target + " 执行与送审完全相同的 old/new（或 content）写入；写完不要再改，改一字即新稿。";
					return {
						verdict: unjudged ? "UNAVAILABLE" : "APPROVED",
						reason: reasonWithNext(String(verdict.why ?? ""), next),
						hash: resultHash,
						next,
					};
				}
				return refuse("REJECTED", String(verdict.why ?? "未通过审核"), "不要写入该内容；按 reason 修正后重新提交 document。");
			}

			const text = typeof args?.text === "string" ? args.text : "";
			if (text.trim().length === 0) {
				return refuse("REJECTED", "send_report: text 为空。", "把要发的正文逐字放进 text。");
			}
			if (text.length > 20000) {
				return refuse("REJECTED", "send_report: 正文超过 20,000 字符。", "先精简；裁决请求只留结论与指针。");
			}
			const verdict = await judgeReport(ctx, { sessionId, signal: exec?.signal }, text, exec?.signal);
			if (verdict.release) {
				const hash = rememberApprovedReport(sessionId, text, verdict.kind, verdict.maxSeq);
				const unjudged = verdict.kind === "fail-open" || verdict.kind === "unavailable";
				const next = unjudged
					? "下一条消息只输出 [发送放行稿]（不调用任何工具），闸门会代发本稿并加未审标注；输出即本 turn 终点，之后不再有任何操作或输出。"
					: "下一条消息只输出 [发送放行稿]（连同方括号共 7 个字符）：不要复述正文、不要调用任何工具，闸门会替你把放行稿逐字发给用户。输出即本 turn 终点——之后不再调用工具、不再输出、不再响应任何消息，直到用户发言。不要手抄正文：抄错一个字即整稿作废。";
				return {
					verdict: unjudged ? "UNAVAILABLE" : "APPROVED",
					reason: reasonWithNext(String(verdict.why ?? ""), next),
					hash: hash ?? "",
					next,
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
	// 汇报即终局是 turn 级，不是会话级：用户真的发言时解锁，后台通知不解锁。
	ctx.on("session/event", (session, event) => {
		if (!isUserUtterance(event)) return;
		unlockSession(String(session?.id ?? ""));
	});
	ctx.on("llm/stream", (options, next) => {
		const housekeeping = isHousekeeping(options);
		const on = housekeeping ? false : gateOnFor(ctx, options);
		dbg("llm/stream", "session=" + String(options?.sessionId).slice(0, 22) + " housekeeping=" + housekeeping + " gateOn=" + on);
		if (housekeeping) return next();
		if (!on) return next();
		return gatedStream(ctx, options, next());
	});
}

/**
 * Pure supervisor-coverage classification, exported for tests.
 * "missing" = the supervisor made no coverage claim at all; it never counts as
 * covering the range, and the watermark must not advance past sinceSeq.
 */
function classifySupervisorCoverage(coverage, sinceSeq, judgedTo) {
	if (coverage === null || coverage === undefined) return { kind: "missing", to: sinceSeq };
	if (coverage.partial) return { kind: "partial", to: sinceSeq };
	if (coverage.from > sinceSeq + 1) return { kind: "gap-start", to: sinceSeq };
	if (coverage.to < judgedTo) return { kind: "partial", to: Math.max(sinceSeq, coverage.to) };
	return { kind: "full", to: judgedTo };
}

export {
	apply, inject, name, gateOnFor, isSubagentHeader, isHousekeeping, gatedStream, judgeReport,
	APPROVAL_TIMEOUT_MS, REPORT_TOOL, manuscriptHash, rememberApprovedReport, takeApprovedReport, isReportShaped,
	reportToolDefinition, unlockSession, isUserUtterance, isApprovedToken, preclearState,
	pendingApprovalFor, composeRejectMarker, reasonWithNext, REJECT_SHOWN_CHARS,
	classifySupervisorCoverage,
};
