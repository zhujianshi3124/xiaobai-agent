/**
 * Output gate — a per-workspace switch for the four-side mechanism.
 *
 * With the gate ON, the host enforces three surfaces (each mounted as its own
 * plugin so one failure cannot silently disable the others):
 *
 *   gate-text.js  — every finished assistant text block is held until
 *                   reviewer (blind evidence check) and supervisor (operation
 *                   audit against the discipline) both approve.
 *   gate-tools.js — the Lead (top-level agent) may only write the discipline's
 *                   exception paths; everything else must be delegated to the
 *                   execution side. Judges are read-only.
 *   gate-guard.js — shared state, session-log decoding, judge creation.
 *
 * Judges are created on demand when missing. A judge first reads the files in
 * <cwd>/协作规则/ (discipline, guide, latest project archive) itself.
 *
 * Design fixed by the user:
 *  - default OFF, scope is the CURRENT WORKSPACE (session header cwd)
 *  - the switch belongs to the user: only /gate on|off changes it
 *  - commands are never gated, so /gate off always works
 *  - reviewer approves TEXT against independently read evidence
 *  - supervisor approves OPERATIONS after reading the raw tool log
 *  - shell write-shape and run_code are denied to the Lead and judges; the
 *    execution side needs a task envelope and its writes are journaled
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, resolve, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { statSync } from "node:fs";
import { readRules, normalizeExtraRoots } from "./gate-guard.js";

const name = "governance-output-gate";
const inject = ["commands", "sessions"];

const STATE_PATH = join(homedir(), ".dsh", "output-gate.json");
const USAGE = "Usage: /gate on | /gate off | /gate status | /gate root list | /gate root add <绝对路径> [--with-gate] | /gate root remove <绝对路径>";

/** Normalize a workspace path so one folder always maps to one key. */
function workspaceKey(cwd) {
	if (typeof cwd !== "string" || cwd.length === 0) return null;
	return cwd.replace(/[\\/]+$/, "").toLowerCase();
}

/** Read persisted state; a missing or corrupt file means everything is off. */
function readState() {
	try {
		if (!existsSync(STATE_PATH)) return { enabledWorkspaces: [], extraRoots: {} };
		const raw = JSON.parse(readFileSync(STATE_PATH, "utf8"));
		const list = Array.isArray(raw?.enabledWorkspaces) ? raw.enabledWorkspaces : [];
		return {
			enabledWorkspaces: list.filter((x) => typeof x === "string"),
			extraRoots: normalizeExtraRoots(raw?.extraRoots),
		};
	} catch {
		return { enabledWorkspaces: [], extraRoots: {} };
	}
}

/** Persist state; failure is reported by the caller, never silently swallowed. */
function writeState(state) {
	mkdirSync(dirname(STATE_PATH), { recursive: true });
	writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
}

/** Resolve the workspace key for one invocation, or null when the session has none. */
function cwdOf(ctx, invocation) {
	try {
		const sessionId = invocation?.agent?.id;
		if (sessionId === undefined) return null;
		const session = ctx.sessions.get(sessionId);
		return session?.header?.cwd ?? null;
	} catch {
		return null;
	}
}

function handleGate(ctx, invocation) {
	const raw = invocation.rawInput.trim();
	const tokens = raw.split(/\s+/).filter(Boolean);
	const verb = (tokens[0] ?? "").toLowerCase();
	const cwd = cwdOf(ctx, invocation);
	const key = workspaceKey(cwd);
	const state = readState();
	const isOn = key !== null && state.enabledWorkspaces.includes(key);

	if (verb === "" || verb === "status") {
		const rules = readRules(cwd);
		const roots = key === null ? [] : (state.extraRoots[key] ?? []);
		return {
			kind: "success",
			text: [
				"Output gate: " + (isOn ? "ON" : "OFF"),
				"Workspace: " + (cwd ?? "(this session reports no cwd)"),
				"可写根 = " + (cwd ?? "-") + (roots.length === 0 ? "（仅此一个）"
					: " + " + roots.map((r) => r.path + (r.allowGateSelf ? "（含闸门自身）" : "")).join(" + ")),
				"改根 = /gate root add <绝对路径> [--with-gate] ｜ /gate root list ｜ /gate root remove <绝对路径>",
				"报告 = 每条发给用户的正文报告先过两侧：reviewer 拿证据包独立核对正文，supervisor 读本轮原始操作核合规；都 APPROVED 才放行。带工具调用的中间叙述不算报告，直接放行但会进监管侧的证据包。",
				"流程 = 协调侧先自己取数（证据写 _evidence/、_scratch/ 或临时目录）→ 正文与证据路径送 reviewer 盲测 → supervisor 读原始操作日志；两侧各自取数，不是只让审核侧查。",
				"写权 = 协调侧（Lead）的 write/edit：产品源码/配置与 scripts/ 既有回归脚本必须派执行侧；协作规则、_scratch、_rollback、_staging、_evidence、_audit、_tmp、test(s)、.gate-tasks、系统临时目录可写；任意目录可新建 verify/check/probe/audit/evidence 类取证脚本，项目根已有验证脚本可继续改。",
				"判官 = 缺失时自动建 reviewer / supervisor，首轮自读 协作规则 下的纪律、指南、最新项目档案。",
				"超时 = 两侧都在时，3 分钟内未裁决则扣留正文（[审核未完成·已扣留]），不放行；只有判官缺失/团队不可用时才 180 秒自动放行并标注。",
				"执行侧 = 卡名必须是 exec-<taskId>（或描述里写 task:<taskId>）；协调侧先写 .gate-tasks/task-<taskId>.json（taskId / allowedPaths / allowShell / expiresAt≤24h）；执行侧写入记到 ~/.dsh/gate-tasks/<taskId>.journal.jsonl。allowedPaths 可写相对路径（对每个已授权根各解一次）或根内绝对路径。",
				"不拦 = read / pwsh 只读命令 / run_code 里的只读子调用；run_code 是传输层，不再整条拒绝，程序里的 write/edit/写形态 shell 仍逐条判。暂停 = 中断等待并停掉两张判官卡。",
				"回执 = node gate-receipt.mjs <taskId>（只读，输出文件大小/sha256 与 shell 写命令）。",
				"规则 = " + (rules.files.length > 0
					? rules.files.length + " 份已找到：" + rules.files.map((p) => p.split(/[\\/]/).pop()).join("、")
					: "未找到（判官按角色说明工作）"),
			].join("\n"),
		};
	}

	if (verb === "root") return handleRoot(tokens.slice(1), cwd, key, state);

	if (verb !== "on" && verb !== "off") return { kind: "error", text: USAGE };

	if (key === null) {
		return {
			kind: "error",
			text: "Cannot change the gate: this session reports no workspace directory.",
		};
	}

	const next = new Set(state.enabledWorkspaces);
	if (verb === "on") next.add(key);
	else next.delete(key);
	// Turning the gate off also drops the roots it had been trusted with; a later
	// /gate on must not silently restore write access to another repository.
	const extraRoots = { ...state.extraRoots };
	if (verb === "off") delete extraRoots[key];
	writeState({ enabledWorkspaces: [...next].sort(), extraRoots });

	return {
		kind: "success",
		text: "Output gate is now " + (verb === "on" ? "ON" : "OFF") + " for workspace:\n" + cwd
			+ (verb === "off" && (state.extraRoots[key] ?? []).length > 0 ? "\n（该工作区的额外可写根已一并撤销）" : ""),
	};
}

/** `/gate root …` — the only way to widen a workspace beyond its own directory. */
function handleRoot(args, cwd, key, state) {
	const sub = (args[0] ?? "list").toLowerCase();
	if (key === null) {
		return { kind: "error", text: "这个会话没有工作目录，无法设置可写根。" };
	}
	const roots = state.extraRoots[key] ?? [];

	if (sub === "list") {
		return {
			kind: "success",
			text: [
				"工作区：" + cwd,
				"自身根：" + cwd,
				...roots.map((r, i) => "额外根 " + (i + 1) + "：" + r.path + (r.allowGateSelf ? "（含闸门自身）" : "")),
				roots.length === 0 ? "（没有额外根；执行侧只能写本工作区）" : "",
			].filter(Boolean).join("\n"),
		};
	}

	const pathArg = args[1];
	if (typeof pathArg !== "string" || pathArg.length === 0) {
		return { kind: "error", text: "用法：/gate root add <绝对路径> [--with-gate] ｜ /gate root remove <绝对路径>" };
	}
	if (!isAbsolute(pathArg)) {
		return { kind: "error", text: "只接受绝对路径：" + pathArg };
	}
	const abs = resolve(pathArg);
	const normalized = abs.replace(/[\\/]+$/, "").toLowerCase();

	if (sub === "remove") {
		const kept = roots.filter((r) => r.path.replace(/[\\/]+$/, "").toLowerCase() !== normalized);
		if (kept.length === roots.length) return { kind: "error", text: "没有这个额外根：" + abs };
		writeState({ ...state, extraRoots: { ...state.extraRoots, [key]: kept } });
		return { kind: "success", text: "已撤销可写根：" + abs };
	}

	if (sub !== "add") return { kind: "error", text: USAGE };

	if (/^[a-zA-Z]:[\\/]?$/.test(abs)) {
		return { kind: "error", text: "不能把整个盘符加成可写根：" + abs };
	}
	let isDir = false;
	try {
		isDir = statSync(abs).isDirectory();
	} catch {
		isDir = false;
	}
	if (!isDir) return { kind: "error", text: "目录不存在或不是目录：" + abs };
	if (normalized === workspaceKey(cwd)) return { kind: "error", text: "这就是当前工作区本身，不需要再加。" };
	if (roots.some((r) => r.path.replace(/[\\/]+$/, "").toLowerCase() === normalized)) {
		return { kind: "error", text: "已经在可写根里：" + abs };
	}

	const withGate = args.includes("--with-gate");
	const next = [...roots, { path: abs, allowGateSelf: withGate }];
	writeState({ ...state, extraRoots: { ...state.extraRoots, [key]: next } });

	const notes = [
		"已加入可写根：" + abs,
		"执行侧的 write/edit 现在可以落在该根内（仍受任务信封 allowedPaths 限制），协调侧的例外目录规则同样适用。",
	];
	if (withGate) {
		notes.push("⚠ --with-gate：该根内的闸门自身源码也允许写。被审的一方可以改审计它的代码；改动只在下一次重启后生效，重启前请自己过一眼 diff。");
	} else if (/governance-output-gate/i.test(abs)) {
		notes.push("该路径包含闸门自身：未加 --with-gate，闸门文件仍按受保护路径拒绝。");
	}
	notes.push("撤销：/gate root remove " + abs + "；/gate off 也会一并撤销。");
	return { kind: "success", text: notes.join("\n") };
}

function apply(ctx) {
	ctx.commands.register({
		name: "gate",
		description: "Turn the output gate on or off for this workspace",
		input: { hint: "on | off | status" },
		handler: (invocation) => handleGate(ctx, invocation),
	});
}

export { apply, inject, name, STATE_PATH, workspaceKey, readState, handleGate };
