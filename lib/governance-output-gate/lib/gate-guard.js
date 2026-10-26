/**
 * Output gate — shared helpers (four-side enforcement).
 *
 * The report gate blocks the assistant TEXT until two independent judges rule:
 *
 *   reviewer   — checks the text against independently read evidence (blind test)
 *   supervisor — reads the session LOG from its previous watermark to the last
 *                operation of this round, and rules on whether the Lead's
 *                OPERATIONS followed the collaboration discipline
 *
 * The tool gate (gate-tools.js) separately fences writes by role: the Lead may
 * only write the discipline's exception paths; the execution side must carry a
 * task envelope; judges are read-only. Shell write-shape and run_code are
 * denied to the Lead and judges. Every allowed exec write is journaled under
 * ~/.dsh/gate-tasks/<taskId>.journal.jsonl and can be turned into a receipt.
 *
 * Judges are created on demand: if the Team has no reviewer/supervisor, this
 * module spawns them with the collaboration rules as their reading list.
 */
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import * as zlib from "node:zlib";
import { randomUUID } from "node:crypto";

const name = "governance-output-gate-guard";
const inject = ["sessions"];

const STATE_PATH = join(homedir(), ".dsh", "output-gate.json");
const WATERMARK_PATH = join(homedir(), ".dsh", "output-gate-watermark.json");
const VERDICT_DIR = join(homedir(), ".dsh", "gate-verdicts");
const SESSIONS_ROOT = join(homedir(), ".dsh", "sessions");
const DEBUG_LOG = join(homedir(), ".dsh", "gate-debug.log");

/** Append one line to the gate debug log. Never throws: logging must not break the gate. */
function dbg(tag, detail) {
	try {
		mkdirSync(join(homedir(), ".dsh"), { recursive: true });
		appendFileSync(DEBUG_LOG, new Date().toISOString() + " [" + tag + "] " + detail + "\n", "utf8");
	} catch {
		/* a failed log write must never affect the decision */
	}
}

const APPROVAL_TIMEOUT_MS = 180000;
/**
 * When BOTH judges are present, a missing verdict must not release the text,
 * but waiting ten minutes for one answer is itself a defect: the user's turn
 * is held the whole time and the pause button has nothing to interrupt. Three
 * minutes is enough for a judge that receives the evidence packet inline.
 */
const PRESENT_TIMEOUT_MS = (() => {
	const n = Number(process.env.GATE_PRESENT_TIMEOUT_MS);
	return Number.isFinite(n) && n > 0 ? n : 180000;
})();
const POLL_INTERVAL_MS = 400;

function workspaceKey(cwd) {
	if (typeof cwd !== "string" || cwd.length === 0) return null;
	return cwd.replace(/[\\\\/]+$/, "").toLowerCase();
}

/** Normalize the per-workspace extra roots; malformed entries are dropped, never guessed at. */
function normalizeExtraRoots(raw) {
	const out = {};
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return out;
	for (const [key, value] of Object.entries(raw)) {
		if (typeof key !== "string" || !Array.isArray(value)) continue;
		const list = value
			.filter((e) => e !== null && typeof e === "object" && typeof e.path === "string" && e.path.length > 0)
			.map((e) => ({ path: String(e.path), allowGateSelf: e.allowGateSelf === true }));
		if (list.length > 0) out[key] = list;
	}
	return out;
}

function readState() {
	try {
		if (!existsSync(STATE_PATH)) return { enabledWorkspaces: [], extraRoots: {} };
		const raw = JSON.parse(readFileSync(STATE_PATH, "utf8"));
		return {
			enabledWorkspaces: (raw?.enabledWorkspaces ?? []).filter((x) => typeof x === "string"),
			extraRoots: normalizeExtraRoots(raw?.extraRoots),
		};
	} catch {
		return { enabledWorkspaces: [], extraRoots: {} };
	}
}

function isEnabled(cwd) {
	const key = workspaceKey(cwd);
	if (key === null) return false;
	return readState().enabledWorkspaces.includes(key);
}

function readWatermark() {
	try {
		if (!existsSync(WATERMARK_PATH)) return {};
		return JSON.parse(readFileSync(WATERMARK_PATH, "utf8"));
	} catch {
		return {};
	}
}

function writeWatermark(next) {
	try {
		mkdirSync(join(homedir(), ".dsh"), { recursive: true });
		writeFileSync(WATERMARK_PATH, JSON.stringify(next, null, 2) + "\n", "utf8");
	} catch {
		/* best-effort: a lost watermark only widens the next range, never skips one */
	}
}

function sessionLogPath(sessionId) {
	try {
		for (const workspace of readdirSync(SESSIONS_ROOT, { withFileTypes: true })) {
			if (!workspace.isDirectory()) continue;
			const candidate = join(SESSIONS_ROOT, workspace.name, sessionId, "session.v4.jsonl.zstd");
			if (existsSync(candidate)) return candidate;
		}
	} catch {
		return null;
	}
	return null;
}

/** True for any session that is not a top-level agent (any of the three host marks). */
function isSubagentHeader(header) {
	if (header === undefined || header === null) return false;
	const depth = header.delegationDepth;
	if (typeof depth === "number" && depth > 0) return true;
	if (typeof header.parentSession === "string" && header.parentSession.length > 0) return true;
	return header.origin === "subagent";
}

const GATE_HOME = dirname(fileURLToPath(import.meta.url));
const JOURNAL_TOOL = join(GATE_HOME, "gate-journal.mjs");
const RECEIPT_TOOL = join(GATE_HOME, "gate-receipt.mjs");
const RULES_DIRNAME = "协作规则";
/** One ensure attempt per live session (created judges survive inside the Team). */
const JUDGE_READY = new Map();

/**
 * Guide 2.5 rotates judge cards at 35% context. The judge must NOT measure its
 * own context inside the verdict window (the 2026-10-25 reviewer timeouts), so
 * the gate measures it from the durable log and drives the rotation itself.
 */
const JUDGE_ROTATE_PCT = 35;
/** Roster cap from the user's 2026-10-25 ruling (maxMembers: 16). Rotation
 *  needs one free slot for the successor card; at the cap it only reports. */
const TEAM_ROSTER_LIMIT = 16;
/** `${leadSessionId}:${role}` -> successor member name put in place by a rotation. */
const JUDGE_OVERRIDE = new Map();

/** Locate the collaboration rules under the working directory. Missing is reported, never invented. */
function readRules(cwd) {
	if (typeof cwd !== "string" || cwd.length === 0) return { dir: null, discipline: null, guide: null, archive: null, files: [] };
	const dir = join(cwd, RULES_DIRNAME);
	const pick = (name) => {
		const candidate = join(dir, name);
		try {
			return statSync(candidate).isFile() ? candidate : null;
		} catch {
			return null;
		}
	};
	const discipline = pick("纪律.txt");
	const guide = pick("智能体团队协作指南.md");
	let archive = null;
	try {
		const rows = readdirSync(dir)
			.filter((n) => /^项目档案-.*\.md$/.test(n))
			.map((n) => ({ n, p: join(dir, n), t: statSync(join(dir, n)).mtimeMs }))
			.sort((a, b) => b.t - a.t);
		archive = rows[0]?.p ?? null;
	} catch {
		/* no rules directory */
	}
	const files = [discipline, guide, archive].filter((x) => x !== null);
	return { dir: files.length === 0 ? null : dir, discipline, guide, archive, files };
}

/** Build the first-turn brief for an auto-created judge. Paths, not pasted prose: it must read them itself. */
function judgeBrief(role, cwd, rules) {
	const paths = rules.files.length === 0
		? "(未找到 " + join(cwd ?? "", RULES_DIRNAME) + "；请向 lead 要求规则文件，并在回复中注明「规则文件缺失」)"
		: rules.files.map((p) => "  - " + p).join("\n");
	const common = [
		"前置阅读（硬规则，必须整份读完再工作）：",
		paths,
		"",
		"工具通道：read、pwsh 的只读命令、run_code 里的 tools.read 都放行；闸门只拦写形态的 shell 与写文件（判官唯一可写的是 ~/.dsh/gate-verdicts/**）。",
		"同一个被拒绝的调用不要反复重试（同一形态最多两次）；换 read / 换只读命令，或在裁决里写明通道故障。",
		"",
		"闸门每次请求都附「证据包」：本轮的全部工具调用与结果摘要（带 seq），以及会话日志路径与 seq 范围。",
		"证据包是现场原始记录的摘要，不是被审正文里的说法；你可以直接用 read/pwsh 打开里面任意路径复核。",
		"新会话没有历史是正常情况：判的是「本轮正文 vs 本轮证据 + 你能读到的文件」，空历史不等于无法取证。",
		"只有证据包缺失、且 read/pwsh/run_code 三种读通道都被拒时，才可判 UNAVAILABLE（不是 REJECTED），并在第一行写明；UNAVAILABLE 表示“我审不了”，不表示 lead 不合格。",
		"",
		"取证工具（只读，解 DSH 会话日志的多帧 zstd）：",
		"  node \"" + JOURNAL_TOOL + "\" <session.v4.jsonl.zstd> <fromSeq> <toSeq> [--tools|--messages|--all]",
		"执行侧写入账（协调侧/判官不可写）：~/.dsh/gate-tasks/<taskId>.journal.jsonl",
		"回执（只读，把写入账转成文件大小/sha256）：node \"" + RECEIPT_TOOL + "\" <taskId> [--json]",
		"",
		"只读：不得写任何文件、不得改配置、不得碰 git。唯一的例外是闸门请求里给你的裁决 .json（如果给了）。",
		"回复格式：第一行必须是 APPROVED 或 REJECTED（第一个词，前面不能有任何字符），REJECTED 时附条款与证据；不要长篇分析。",
		"裁决时限：请求带秒级死线（默认 180s）。收到请求立即核对、立即回裁决；上下文实测在裁决时限内一律省略——需要注明就写「ctx: 未实测（时限内省略）」，禁止在回裁决前运行任何上下文测量命令。",
		"占比由闸门代测：请求里若注明你已 ≥35%，在判定末行加一行【ROTATE：本卡 ≥35%，本轮判完请换卡】（指南 2.5）即可；除此之外不做任何上下文测量。",
		"（实测教训：判官在 180s 窗口内做 ctx 测量仪式，reviewer 侧四轮全部超时，报告被反复扣留；裁决本体永远优先于判定末行的占比注记。）",
	];
	if (role === "reviewer") {
		return [
			"你是四侧协同里的「审核侧 reviewer」。",
			"职责：拿现场事实核对协调侧（lead）即将发给用户的每一句断言。只判「是不是这样」，不判「该不该这样」。",
			"不负责：决策、方案选择、提改进建议、评判好坏。",
			"",
			"每次请求会给你：证据包、会话日志路径、本轮 seq 范围、待核对正文。",
			"硬规则（纪律 3.2.1 / 3.2.2）：先独立读取证据与相关文件取证，再对照正文；顺序反了不算核对。",
			"不得以正文里的数字、截图、命令输出为起点。正文没有可核断言（例如只是一句“我先读规则”）时，判 APPROVED 并写明「无可核断言」。",
			"两侧不一致时让 lead 回去重新取证，你重做一次完整盲测。",
			"",
			...common,
		].join("\n");
	}
	return [
		"你是四侧协同里的「监管侧 supervisor」。",
		"职责：对照纪律核验协调侧（lead）的操作是否合规。只核「做了什么、怎么做的」，不核结论对错。",
		"不负责：决策、核对实况、执行任务、提改进建议。",
		"",
		"每次请求会给你：会话日志路径、本轮 seq 范围。",
		"硬规则（纪律 3.6 / 3.6.4）：必须读 tool/call 与 tool/ptc-dispatch 的原始记录，不得采信 lead 自述；",
		"重点看：是否直接写产品代码/项目配置（3.1）、是否越界或扩大范围（4.4/4.5）、是否未经批准施工（3.5/7.3）、",
		"数字是否有出处（2.3/3.3）、结论是否未经审核侧放行就输出或写入档案（3.2/3.3.1）。",
		"发现不合规 → 第一行 REJECTED（叫停），列条款与证据；叫停后要求 lead 写交接文档并更新项目档案，等用户处置。",
		"",
		...common,
	].join("\n");
}

/** Read the live Team roster and identify the two judge roles by name or description. */
function judgeNames(team, agent) {
	let rows = [];
	try {
		rows = team.listMembers(agent);
		if (!Array.isArray(rows)) rows = [];
	} catch {
		return {};
	}
	const sessionId = agent?.session?.id ?? "";
	const desc = (m) => String(m?.description ?? "");
	const byRole = (role) => {
		// A rotation put a successor card in place; the old exact-name card is
		// still on the roster, so the override must outrank the name match.
		const override = JUDGE_OVERRIDE.get(sessionId + ":" + role);
		if (override !== undefined && rows.some((m) => String(m?.name ?? "") === override)) return override;
		const exact = rows.find((m) => String(m?.name ?? "").toLowerCase() === role);
		if (exact !== undefined) return role;
		return undefined;
	};
	const reviewerSlot = byRole("reviewer");
	if (reviewerSlot !== undefined) {
		const supervisorSlot = byRole("supervisor");
		if (supervisorSlot !== undefined) return { reviewer: reviewerSlot, supervisor: supervisorSlot };
		return { reviewer: reviewerSlot, supervisor: rows.find((m) => /监管/.test(desc(m)))?.name };
	}
	const reviewer = rows.find((m) => /审核/.test(desc(m)));
	const supervisorSlot = byRole("supervisor");
	if (supervisorSlot !== undefined) return { reviewer: reviewer?.name, supervisor: supervisorSlot };
	const supervisor = rows.find((m) => /监管/.test(desc(m)));
	return { reviewer: reviewer?.name, supervisor: supervisor?.name };
}

/**
 * Ensure the two mandatory judges exist. Created on demand so the mechanism does
 * not depend on the Lead remembering discipline 1.5. Failures are reported, not
 * hidden: the report gate will then fail open WITH an explicit marker.
 */
async function ensureJudges(ctx, agent, cwd) {
	const team = ctx.get("agentTeams");
	if (team === undefined) return { ok: false, error: "agentTeams service missing", reviewer: "reviewer", supervisor: "supervisor", rules: readRules(cwd), created: [] };
	if (typeof team.listMembers !== "function" || typeof team.spawnTeammate !== "function") {
		// Old/mock Team surfaces: keep the pre-existing contract (fixed names),
		// but say so in the log rather than pretending the roster was checked.
		dbg("judges:ensure", "team service lacks listMembers/spawnTeammate; using fixed names");
		return { ok: true, reviewer: "reviewer", supervisor: "supervisor", rules: readRules(cwd), created: [], degraded: "roster-unavailable" };
	}
	const sessionId = agent?.session?.id ?? "";
	if (sessionId !== "" && JUDGE_READY.has(sessionId)) return await JUDGE_READY.get(sessionId);

	const rules = readRules(cwd);
	const run = (async () => {
		let found = judgeNames(team, agent);
		const created = [];
		for (const role of ["reviewer", "supervisor"]) {
			if (found[role] !== undefined) continue;
			const description = role === "reviewer"
				? "审核侧：盲测 lead 的正文是否符合实况（只读）"
				: "监管侧：核验 lead 的操作是否符合纪律（只读）";
			try {
				await team.spawnTeammate(agent, {
					name: role,
					description,
					prompt: [{ type: "text", text: judgeBrief(role, cwd, rules) }],
					context: "fresh",
					provider: "spawn",
					signal: AbortSignal.timeout(90000),
				});
				created.push(role);
				dbg("judges:spawn", "role=" + role + " session=" + sessionId.slice(0, 22));
			} catch (error) {
				// A concurrent creator may have won the name; refresh before giving up.
				dbg("judges:spawn-failed", "role=" + role + " error=" + String(error?.message ?? error).slice(0, 160));
			}
			found = judgeNames(team, agent);
		}
		const result = {
			ok: found.reviewer !== undefined && found.supervisor !== undefined,
			reviewer: found.reviewer ?? "reviewer",
			supervisor: found.supervisor ?? "supervisor",
			rules,
			created,
		};
		dbg("judges:ensure", "session=" + sessionId.slice(0, 22)
			+ " reviewer=" + String(result.reviewer) + " supervisor=" + String(result.supervisor)
			+ " rules=" + (rules.files.length > 0 ? rules.files.length + " files" : "missing")
			+ " created=" + (created.length > 0 ? created.join(",") : "none")
			+ " ok=" + result.ok);
		return result;
	})();

	if (sessionId !== "") {
		JUDGE_READY.set(sessionId, run);
		run.catch(() => JUDGE_READY.delete(sessionId));
	}
	return await run;
}

/**
 * A judge's context occupancy, measured by the gate from the durable session
 * log — the same math as ctx-watch.mjs (last usage ÷ context window). The judge
 * itself never runs a measurement: burning the verdict window on the measurement
 * ritual is what timed the reviewer out four times on 2026-10-25.
 */
function judgeCtxPct(sessionId) {
	if (typeof sessionId !== "string" || sessionId.length === 0) return null;
	const file = sessionLogPath(sessionId);
	if (file === null) return null;
	let buf;
	try {
		buf = readFileSync(file);
	} catch {
		return null;
	}
	const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
	let lastUsage = null;
	let ctxWindow = null;
	let off = 0;
	while (off < buf.length) {
		const start = buf.indexOf(MAGIC, off);
		if (start < 0) break;
		const next = buf.indexOf(MAGIC, start + 4);
		const end = next < 0 ? buf.length : next;
		try {
			const text = zlib.zstdDecompressSync(buf.subarray(start, end)).toString("utf8");
			for (const line of text.split("\n")) {
				if (line.length === 0) continue;
				try {
					const event = JSON.parse(line);
					if (event.type === "request/context" && typeof event.data?.contextWindow === "number") ctxWindow = event.data.contextWindow;
					if (event.type === "assistant/message" && event.data?.usage) lastUsage = event.data.usage;
				} catch {
					/* torn trailing line while the log is being written */
				}
			}
		} catch {
			/* partial final frame */
		}
		off = end;
	}
	const tokens = Number(lastUsage?.totalTokens);
	if (!Number.isFinite(tokens) || !Number.isFinite(ctxWindow) || ctxWindow <= 0) return null;
	return { pct: Number(((tokens / ctxWindow) * 100).toFixed(2)), tokens, window: ctxWindow };
}

/** The roster row of one member, or null. Rows carry the judge's session id as `id`. */
function memberRow(team, agent, memberName) {
	try {
		const rows = team.listMembers(agent);
		if (!Array.isArray(rows)) return null;
		return rows.find((m) => String(m?.name ?? "") === memberName) ?? null;
	} catch {
		return null;
	}
}

/** `reviewer2`, `reviewer3`, … — first role-suffixed name not already taken. */
function nextFreeJudgeName(team, agent, role) {
	try {
		const taken = new Set(team.listMembers(agent).map((m) => String(m?.name ?? "")));
		for (let n = 2; n < 50; n++) {
			if (!taken.has(role + n)) return role + n;
		}
	} catch {
		/* fall through */
	}
	return null;
}

/**
 * Rotate a judge card that reached the guide-2.5 ROTATE line, and measure both
 * judges so the gate can put the number in the request. Rotation spawns the
 * successor with the same charter and repoints this lead session at it; the old
 * card is left on the roster (the lead retires it per 6.2) unless the roster is
 * full, in which case only the number is reported. Never throws: any failure
 * keeps the incumbent judge for this round.
 */
async function maybeRotateJudges(ctx, agent, cwd, judges) {
	const team = ctx.get("agentTeams");
	const out = { ok: judges.ok, reviewer: judges.reviewer, supervisor: judges.supervisor, rules: judges.rules, rotated: [], ctx: {} };
	if (team === undefined || typeof team.listMembers !== "function") return out;
	const sessionId = agent?.session?.id ?? "";
	let rosterSize = 0;
	for (const role of ["reviewer", "supervisor"]) {
		const name = out[role];
		if (typeof name !== "string" || name.length === 0) continue;
		const row = memberRow(team, agent, name);
		const measured = typeof row?.id === "string" ? judgeCtxPct(row.id) : null;
		out.ctx[role] = measured;
		if (measured === null || measured.pct < JUDGE_ROTATE_PCT) continue;
		if (rosterSize === 0) {
			try {
				rosterSize = team.listMembers(agent).length;
			} catch {
				rosterSize = 0;
			}
		}
		if (rosterSize >= TEAM_ROSTER_LIMIT) {
			dbg("judges:rotate-skip", "role=" + role + " pct=" + measured.pct + " roster=" + rosterSize + "/" + TEAM_ROSTER_LIMIT + " (report only)");
			continue;
		}
		const successor = nextFreeJudgeName(team, agent, role);
		if (successor === null) {
			dbg("judges:rotate-skip", "role=" + role + " no free name");
			continue;
		}
		const description = role === "reviewer"
			? "审核侧：盲测 lead 的正文是否符合实况（只读）"
			: "监管侧：核验 lead 的操作是否符合纪律（只读）";
		try {
			await team.spawnTeammate(agent, {
				name: successor,
				description,
				prompt: [{ type: "text", text: judgeBrief(role, cwd, judges.rules) }],
				context: "fresh",
				provider: "spawn",
				signal: AbortSignal.timeout(90000),
			});
		} catch (error) {
			dbg("judges:rotate-failed", "role=" + role + " -> " + successor + " error=" + String(error?.message ?? error).slice(0, 160));
			continue;
		}
		JUDGE_OVERRIDE.set(sessionId + ":" + role, successor);
		out[role] = successor;
		out.rotated.push({ role, from: name, to: successor, pct: measured.pct });
		rosterSize += 1;
		dbg("judges:rotate", "role=" + role + " " + name + " -> " + successor + " pct=" + measured.pct + " (guide 2.5)");
	}
	if (out.rotated.length > 0 && sessionId !== "") {
		// The ensure-cache still points at the incumbent; the successor must serve
		// every later round of this session too.
		JUDGE_READY.set(sessionId, Promise.resolve(out));
	}
	return out;
}

/** Every event seq above `sinceSeq`, plus the highest seq seen. */
function readLogSince(sessionId, sinceSeq) {
	const file = sessionLogPath(sessionId);
	if (file === null) return { seqs: [], maxSeq: sinceSeq, file: null };
	let buf;
	try {
		buf = readFileSync(file);
	} catch {
		return { seqs: [], maxSeq: sinceSeq, file };
	}
	const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
	const seqs = [];
	let off = 0;
	while (off < buf.length) {
		const start = buf.indexOf(MAGIC, off);
		if (start < 0) break;
		const nextFrame = buf.indexOf(MAGIC, start + 4);
		const end = nextFrame < 0 ? buf.length : nextFrame;
		try {
			const text = zlib.zstdDecompressSync(buf.subarray(start, end)).toString("utf8");
			for (const line of text.split("\n")) {
				if (line.length === 0) continue;
				try {
					const event = JSON.parse(line);
					if (typeof event.seq === "number" && event.seq > sinceSeq) seqs.push(event.seq);
				} catch {
					/* a torn trailing line is expected while the log is being written */
				}
			}
		} catch {
			/* a partial final frame is expected; skip it */
		}
		off = end;
	}
	const maxSeq = seqs.length === 0 ? sinceSeq : Math.max(...seqs);
	return { seqs, maxSeq, file };
}

/**
 * Who sent the newest user-role message currently in the log.
 *
 * Every judge turn ends with the host splicing a "Background subagent …
 * finished" notice into the lead's inbox; the next request sees it as a user
 * message and the lead answers it. Judging that answer produced one more judge
 * round, whose notices produced the next answer — session-af7d83b3 ran a
 * single turn to 267 steps that way.
 *
 * The caller must sample this BEFORE creating judge cards: spawning them makes
 * their brief turns settle, which itself appends notices to the log. Sampled at
 * request start, the value is exactly the input the model is answering.
 */
function newestUserSourceKind(sessionId) {
	const { events } = readLogRange(sessionId, 0, Number.MAX_SAFE_INTEGER);
	let kind;
	for (const event of events) {
		if (event.type !== "user/message") continue;
		kind = event.data?.source?.kind ?? "unknown";
	}
	return kind;
}

/** Every event inside [fromSeq, toSeq]. Used to build the evidence packet a judge
 * receives inline, so judging never depends on the judge re-reading a file it
 * may not reach.
 */
function readLogRange(sessionId, fromSeq, toSeq) {
	const file = sessionLogPath(sessionId);
	if (file === null) return { events: [], file: null };
	let buf;
	try {
		buf = readFileSync(file);
	} catch {
		return { events: [], file };
	}
	const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
	const events = [];
	let off = 0;
	while (off < buf.length) {
		const start = buf.indexOf(MAGIC, off);
		if (start < 0) break;
		const nextFrame = buf.indexOf(MAGIC, start + 4);
		const end = nextFrame < 0 ? buf.length : nextFrame;
		try {
			const text = zlib.zstdDecompressSync(buf.subarray(start, end)).toString("utf8");
			for (const line of text.split("\n")) {
				if (line.length === 0) continue;
				try {
					const event = JSON.parse(line);
					if (typeof event.seq !== "number") continue;
					if (event.seq < fromSeq || event.seq > toSeq) continue;
					events.push(event);
				} catch {
					/* torn trailing line while the log is being written */
				}
			}
		} catch {
			/* partial final frame */
		}
		off = end;
	}
	return { events, file };
}

/** One line for a tool call: what was called and on what. */
function callLine(event) {
	const a = event.data?.arguments;
	let preview;
	try {
		preview = typeof a === "string" ? a : JSON.stringify(a ?? {});
	} catch {
		preview = "(unserializable)";
	}
	if (preview.length > 220) preview = preview.slice(0, 220) + "…";
	return "call " + String(event.data?.name ?? "?") + " " + preview;
}

/**
 * The inline evidence packet: this round's operations, in order, with seq
 * numbers the judge can open again itself. Text the lead is about to send is
 * deliberately absent — the judge must not be handed the claims as evidence.
 */
function evidenceDigest(sessionId, fromSeq, toSeq, limit = 7000) {
	const { events, file } = readLogRange(sessionId, fromSeq, toSeq);
	const lines = [];
	let calls = 0;
	let results = 0;
	for (const event of events) {
		const kind = event.type;
		if (kind === "tool/call") {
			calls++;
			lines.push("[" + event.seq + "] " + callLine(event));
			continue;
		}
		if (kind === "tool/ptc-dispatch") {
			calls++;
			const d = event.data ?? {};
			lines.push("[" + event.seq + "] subcall " + String(d.name ?? "?") + " " + String(JSON.stringify(d.arguments ?? {})).slice(0, 200));
			continue;
		}
		if (kind === "tool/result") {
			results++;
			const d = event.data ?? {};
			const parts = d.message?.content ?? d.content ?? [];
			const text = Array.isArray(parts)
				? parts.filter((c) => c?.type === "text").map((c) => c.text).join("")
				: String(parts ?? "");
			const head = text.replace(/\s+/g, " ").slice(0, 180);
			lines.push("[" + event.seq + "] result" + (d.message?.isError ? "(ERROR)" : "") + " " + head);
			continue;
		}
		if (kind === "user/message") {
			const parts = event.data?.content ?? [];
			const text = Array.isArray(parts) ? parts.filter((c) => c?.type === "text").map((c) => c.text).join(" ") : "";
			if (text.length === 0) continue;
			lines.push("[" + event.seq + "] user " + text.replace(/\s+/g, " ").slice(0, 160));
			continue;
		}
		if (kind === "assistant/message") {
			// Narration that accompanied tool calls is released without a ruling,
			// so the supervisor must still see it here — otherwise a lead could
			// park its conclusions in a step that never reaches a judge.
			const parts = event.data?.message?.content ?? [];
			const blockText = Array.isArray(parts) ? parts.filter((c) => c?.type === "text").map((c) => c.text).join(" ") : "";
			const trimmed = blockText.replace(/\s+/g, " ").trim();
			if (trimmed.length > 0) lines.push("[" + event.seq + "] 叙述(未审) " + trimmed.slice(0, 200));
			continue;
		}
		if (kind === "turn/start" || kind === "turn/end") {
			lines.push("[" + event.seq + "] " + kind + (kind === "turn/end" ? " " + String(event.data?.reason?.kind ?? "") : ""));
			continue;
		}
	}
	let body = lines.join("\n");
	if (body.length > limit) body = body.slice(body.length - limit);
	if (lines.length === 0) {
		body = "(本轮没有任何工具调用：lead 只发了文字。正文里若出现数字/路径/结论，只能由你直接读文件核对；读不到就是 REJECTED 的证据不足，不是 UNAVAILABLE。)";
	}
	return {
		text: body,
		file,
		events: events.length,
		calls,
		results,
	};
}

/**
 * Ask one judge to rule and WAIT for its answer.
 * A subagent cannot answer through send_message (one-way delivery), so the gate
 * polls both a verdict file and the judge's own session log.
 *
 * `signal` is the requesting model call's abort signal: when the user pauses
 * the turn, waiting must stop immediately and the judge's own turn must be
 * interrupted — a held report that nobody is waiting for is exactly how a
 * paused session kept two judge cards busy for minutes.
 */
async function awaitVerdict(ctx, agent, judge, subject, body, timeoutMs = APPROVAL_TIMEOUT_MS, signal) {
	const team = ctx.get("agentTeams");
	if (team === undefined) return { verdict: "UNAVAILABLE", detail: "agentTeams service missing" };

	const requestId = Date.now().toString(36) + "-" + randomUUID().slice(0, 8);
	const verdictPath = join(VERDICT_DIR, requestId + ".json");
	dbg("awaitVerdict:enter", "judge=" + judge + " req=" + requestId + " timeoutMs=" + timeoutMs);
	try {
		mkdirSync(VERDICT_DIR, { recursive: true });
	} catch {
		return { verdict: "UNAVAILABLE", detail: "cannot create verdict directory" };
	}

	const prompt = [
		"[GATE · " + judge + "] " + subject,
		"回话方式（任选其一，闸门都在轮询）：",
		"  1) 直接回一条消息，正文里明确写出 APPROVED 或 REJECTED",
		"  2) 或把结论写进这个文件：" + verdictPath,
		'     文件内容：{"verdict":"APPROVED"} 或 {"verdict":"REJECTED","reason":"..."}',
		"最多等 " + Math.round(timeoutMs / 1000) + " 秒。",
		"---8<---",
		body,
		"---8<---",
	].join("\n");

	// Any reply that lands after this instant counts as an answer to THIS request.
	const sinceMs = Date.now();
	// Resolve the judge's session id while it is still live. The durable session
	// log outlives the agent; the live-roster lookup does not.
	const judgeSessionId = (() => {
		try {
			const rows = team.listMembers(agent);
			if (!Array.isArray(rows)) return undefined;
			const row = rows.find((m) => String(m?.name ?? "") === judge);
			return typeof row?.id === "string" && row.id.length > 0 ? row.id : undefined;
		} catch {
			return undefined;
		}
	})();
	try {
		await team.sendMessage(agent, {
			target: judge,
			content: [{ type: "text", text: prompt }],
			signal: signal === undefined
				? AbortSignal.timeout(timeoutMs)
				: AbortSignal.any([AbortSignal.timeout(timeoutMs), signal]),
		});
	} catch (error) {
		if (signal?.aborted === true) return { verdict: "CANCELLED", detail: "turn aborted before the judge answered" };
		return { verdict: "UNAVAILABLE", detail: String(error?.message ?? error) };
	}

	const cwd = agent?.session?.header?.cwd;
	const deadline = Date.now() + timeoutMs;
	let ticks = 0;
	const stopJudge = () => {
		try {
			team.interrupt(agent, judge);
			dbg("awaitVerdict:interrupt", "judge=" + judge + " reason=user-pause");
		} catch (error) {
			dbg("awaitVerdict:interrupt-failed", "judge=" + judge + " error=" + String(error?.message ?? error).slice(0, 120));
		}
	};
	while (Date.now() < deadline) {
		// The user paused the turn: release the wait and stop the judge's own
		// turn instead of leaving it running against nobody.
		if (signal?.aborted === true) {
			dbg("awaitVerdict:aborted", "judge=" + judge + " ticks=" + ticks);
			stopJudge();
			return { verdict: "CANCELLED", detail: "user paused the turn" };
		}
		// Turning the gate off is the user's escape hatch: release instead of
		// waiting for the full present-judge timeout.
		if (typeof cwd === "string" && cwd.length > 0 && !isEnabled(cwd)) {
			dbg("awaitVerdict:cancelled", "judge=" + judge + " gate=off");
			return { verdict: "CANCELLED", detail: "gate turned off while waiting" };
		}
		// Channel 1: a verdict file. Works for any judge that can write one.
		if (existsSync(verdictPath)) {
			try {
				const raw = JSON.parse(readFileSync(verdictPath, "utf8"));
				try { rmSync(verdictPath, { force: true }); } catch { /* the next request has a new id */ }
				const v = String(raw?.verdict ?? "").toUpperCase();
				dbg("awaitVerdict:file", "judge=" + judge + " verdict=" + v);
				if (v === "APPROVED") return { verdict: "APPROVED", detail: raw?.reason ?? "" };
				if (v === "REJECTED") return { verdict: "REJECTED", detail: raw?.reason ?? "" };
				if (v === "UNAVAILABLE") return { verdict: "UNAVAILABLE", detail: raw?.reason ?? "" };
			} catch {
				/* a half-written verdict is retried on the next tick */
			}
		}

		// Channel 2: the judge's own reply in its session log.
		// A read-only judge has no write tool, so it cannot drop a verdict file —
		// its only channel is answering the message it was sent. Measured reply
		// latency for a judge turn is ~90s against a 180s deadline, so this
		// channel is viable and is what makes the gate usable at all.
		const spoken = judgeSessionId === undefined
			? readJudgeReply(ctx, judge, sinceMs)
			: readJudgeReplyFrom(judgeSessionId, sinceMs);
		if (spoken !== null) {
			dbg("awaitVerdict:spoken", "judge=" + judge + " verdict=" + spoken.verdict);
			return spoken;
		}

		ticks++;
		if (ticks % 10 === 0) {
			// Report what the scan ACTUALLY saw. A bare "spoken=no" that is never
			// assigned cannot distinguish "judge silent" from "scan broken", and
			// reading it as proof of silence is what sent the previous round down
			// the wrong path.
			dbg("awaitVerdict:tick", "judge=" + judge + " ticks=" + ticks
				+ " file=" + existsSync(verdictPath)
				+ " scan=" + describeScan());
		}
		await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
	}
	dbg("awaitVerdict:timeout", "judge=" + judge + " ticks=" + ticks);
	return { verdict: "TIMEOUT", detail: "no verdict within " + timeoutMs + "ms" };
}

/** What the most recent readJudgeReply scan established, for the poll log. */
const lastScan = { judge: null, state: "not-run", detail: "" };

/** Record and format the last scan so the tick line states a fact, not a guess. */
function describeScan() {
	return lastScan.state + (lastScan.detail === "" ? "" : "(" + lastScan.detail + ")");
}

/**
 * Find the judge's reply that arrived after `sinceMs`.
 * Reads the judge's own session log and takes the newest assistant text block
 * that carries an explicit APPROVED / REJECTED token. Returns null while none
 * has landed yet.
 */
function readJudgeReply(ctx, judge, sinceMs) {
	let judgeSessionId;
	try {
		const members = ctx.agents.list();
		const row = members.find((a) => {
			try {
				return ctx.get("agentTeams")?.membership(a)?.name === judge;
			} catch {
				return false;
			}
		});
		if (row === undefined) {
			lastScan.state = "no-live-judge";
			lastScan.detail = "agents=" + members.length;
			return null;
		}
		judgeSessionId = row.id;
	} catch (error) {
		lastScan.state = "agent-lookup-failed";
		lastScan.detail = String(error?.message ?? error).slice(0, 80);
		return null;
	}

	return readJudgeReplyFrom(judgeSessionId, sinceMs);
}

/**
 * Read the judge's reply from a known session id. Works after the judge agent
 * has settled and left the live roster: the durable log outlives the agent.
 */
function readJudgeReplyFrom(judgeSessionId, sinceMs) {
	const file = sessionLogPath(judgeSessionId);
	if (file === null) {
		lastScan.state = "no-judge-log";
		lastScan.detail = judgeSessionId.slice(0, 8);
		return null;
	}

	let buf;
	try {
		buf = readFileSync(file);
	} catch (error) {
		lastScan.state = "judge-log-unreadable";
		lastScan.detail = String(error?.message ?? error).slice(0, 80);
		return null;
	}
	const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
	let off = 0;
	let newest = null;
	while (off < buf.length) {
		const start = buf.indexOf(MAGIC, off);
		if (start < 0) break;
		const nextFrame = buf.indexOf(MAGIC, start + 4);
		const end = nextFrame < 0 ? buf.length : nextFrame;
		try {
			const text = zlib.zstdDecompressSync(buf.subarray(start, end)).toString("utf8");
			for (const line of text.split("\n")) {
				if (line.length === 0) continue;
				try {
					const event = JSON.parse(line);
					if (event.type !== "assistant/message") continue;
					if (typeof event.time !== "number" || event.time <= sinceMs) continue;
					const parts = event.data?.message?.content ?? [];
					const body = parts.filter((c) => c.type === "text").map((c) => c.text).join("");
					if (body.length === 0) continue;
					// Only a reply that OPENS with the token counts. A judge quoting the
					// word inside a sentence must not be read as a ruling.
					const head = body.trimStart().slice(0, 24).toUpperCase();
					const v = head.startsWith("REJECTED") ? "REJECTED"
						: head.startsWith("APPROVED") ? "APPROVED"
						: head.startsWith("UNAVAILABLE") ? "UNAVAILABLE"
						: null;
					if (v === null) continue;
					newest = { verdict: v, detail: body.slice(0, 300) };
				} catch {
					/* a torn trailing line is expected while the log is being written */
				}
			}
		} catch {
			/* a partial final frame is expected; skip it */
		}
		off = end;
	}
	lastScan.state = newest === null ? "no-token-yet" : "found";
	lastScan.detail = newest === null ? "" : newest.verdict;
	return newest;
}

function apply() {
	/* Helpers only: this half registers no listener. The report gate lives in
	   gate-text.js; the write gate lives in gate-tools.js. */
}

export {
	apply, inject, name,
	awaitVerdict, readJudgeReply, readLogSince, readLogRange, evidenceDigest,
	sessionLogPath, dbg, DEBUG_LOG, newestUserSourceKind,
	isEnabled, workspaceKey, readState, normalizeExtraRoots,
	readWatermark, writeWatermark,
	isSubagentHeader, readRules, judgeBrief, judgeNames, ensureJudges, maybeRotateJudges, judgeCtxPct,
	JUDGE_ROTATE_PCT, TEAM_ROSTER_LIMIT,
	JOURNAL_TOOL, RECEIPT_TOOL, RULES_DIRNAME,
	APPROVAL_TIMEOUT_MS, PRESENT_TIMEOUT_MS, VERDICT_DIR, WATERMARK_PATH, STATE_PATH,
};
