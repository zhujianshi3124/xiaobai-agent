/**
 * Output gate — the write-rights half (four-side coordination).
 *
 * The report gate alone cannot stop the Lead from doing the execution side's
 * work: a write that lands before the report is judged has already happened.
 * This half registers a synchronous tool guard (ctx.tools.guard) and assigns
 * every tool call to one of four roles:
 *
 *   lead    — top-level agent. May write only the discipline 3.1 exception
 *             paths. Shell write-shape is DENIED. `run_code` is NOT denied as a
 *             whole: it is the only tool on a PTC wire, so denying it would
 *             leave the agent with no channel at all. The program's sub-calls
 *             (`tools.write`, `tools.pwsh`, …) are dispatched through the same
 *             guard individually, so the write rules still apply per call.
 *   exec    — subagent named `exec-<taskId>` (or description `task:<taskId>`).
 *             The only role allowed to write product code. Each write must fit
 *             a task envelope `.gate-tasks/task-<taskId>.json`; shell writes
 *             are allowed only when the envelope says `allowShell: true`.
 *   judge   — reviewer/supervisor. Read-only; only the verdict directory is
 *             writable. Shell write-shape is DENIED; run_code is allowed as a
 *             transport and its sub-calls are judged one by one.
 *   unknown — any other subagent. Read-only; product writes are DENIED.
 *
 * Every allowed exec write (tool or shell) is appended to
 * `~/.dsh/gate-tasks/<taskId>.journal.jsonl`. `gate-receipt.mjs` turns that
 * journal into a write receipt (file, size, sha256, command) for the reviewer
 * and supervisor. Write decisions are fail-closed: no valid envelope means no
 * write, and a failed journal append denies the write.
 *
 * Explicit residual boundaries (reported rather than hidden):
 *   - read-only shell is allowed for every role, but a shell command can still
 *     invoke a program that writes. The obvious write-shape commands are
 *     denied; a determined same-user process is not fully containable without
 *     an OS user/container boundary.
 *   - exec shell writes are allowed by the envelope's `allowShell` flag, not by
 *     parsing their target path. The journal records the command preview; the
 *     supervisor audits the raw session log.
 */
import { join, relative, resolve, isAbsolute, basename } from "node:path";
import { homedir, tmpdir, userInfo } from "node:os";
import { existsSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { isSubagentHeader, dbg, readState, workspaceKey, isControlledDoc, docResultHash, hasDocClearance, isReportFinalized, redundantJudgeSpawn, redundantExecSpawn, judgeCtxPct, WRITE_TOOL_NAMES } from "./gate-guard.js";

const name = "governance-output-gate-tools";
const inject = ["tools"];

// 写工具集合的单一事实源在 gate-guard.js（WRITE_TOOL_NAMES，含 str_replace_editor）。
// 此前这里另立一份不含 str_replace_editor 的集合，导致该工具在 :744 白名单外直接放行，
// 绕过 Lead/exec/judge 的全部写权判定（复审核意见 P1-2，2026-11-01）。
const WRITE_TOOLS = WRITE_TOOL_NAMES;
const MESSAGE_TOOLS = new Set(["send_message"]);
const REVIEW_LIST_RE = /待核对结论|整改清单|【送审/;
const SHELL_TOOLS = new Set(["pwsh", "bash", "shell", "terminal_exec"]);
/**
 * Transport tools that run a program which reaches the other tools itself.
 * They are never judged as a whole: the program's sub-calls arrive at this
 * same guard with their own names, so a blanket verdict here would either
 * forbid every channel (PTC wire) or vouch for calls we never inspected.
 */
const TRANSPORT_TOOLS = new Set(["run_code"]);
const JUDGE_NAMES = new Set(["reviewer", "supervisor"]);
const VERDICT_ROOT = join(homedir(), ".dsh", "gate-verdicts");
const TASK_ROOT = join(homedir(), ".dsh", "gate-tasks");
const TEMP_ROOT = tmpdir();
const TASK_DIRNAME = ".gate-tasks";
const TASK_MAX_MS = 24 * 60 * 60 * 1000;
const TASK_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const EXEC_NAME_RE = /^exec[-_:]([A-Za-z0-9][A-Za-z0-9._-]{0,63})$/i;
const TASK_IN_DESC_RE = /task\s*[:=]\s*([A-Za-z0-9][A-Za-z0-9._-]{0,63})/i;

/**
 * User rule (2026-10-30): a card at ≥35% context is in ROTATE. It finishes the
 * task in hand and takes no new one; it must not ask the user whether to rotate.
 * The gate measures from the durable session log (same math as /gate ctx), so the
 * card never has to guess its own occupancy.
 */
const CARD_ROTATE_PCT = 35;
const CTX_MEASURE_TTL_MS = 20000;
const CTX_CACHE = new Map(); // sessionId -> { at, measured }
/** Tools that start or enlarge work; denied to a card at/over the rotate line. */
const ROTATE_BLOCK_TOOLS = new Set([
	"spawn_teammate", "subagent", "subagent_fork", "ralph", "create_goal",
	"task_board_create", "task_board_run", "task_board_update", "task_board_schedule", "ask_user_question",
]);
/** A message that merely stops/settles an existing card is not new work. */
const STOP_MESSAGE_RE = /(停手|停止|收尾|交接|不要再|不要继续|结束|暂停|先别|冻结)/;

/** Measure a session once per TTL; the log decompression is the expensive part. */
function measuredContext(sessionId, ctxPct) {
	if (typeof sessionId !== "string" || sessionId.length === 0) return null;
	const now = Date.now();
	const hit = CTX_CACHE.get(sessionId);
	if (hit !== undefined && now - hit.at < CTX_MEASURE_TTL_MS) return hit.measured;
	let measured = null;
	try {
		measured = typeof ctxPct === "function" ? ctxPct(sessionId) : judgeCtxPct(sessionId);
	} catch {
		measured = null;
	}
	CTX_CACHE.set(sessionId, { at: now, measured });
	return measured;
}

function ctxRotateDeny(measured) {
	const pct = measured.pct;
	const level = pct >= 40 ? "CRITICAL" : "ROTATE";
	return [
		"输出闸门：本卡 ctx 已达 " + pct + "%（" + level + " 档，闸门代测）。",
		"按用户 2026-10-30 规则：≥35% 自动进入收尾，不再接新任务，无需向用户请示。",
		"请完成手上的收尾：先写本会话交接文档（头含 ctx-rotate-handover 标记）并更新档案；",
		"闸门在你到线后不接受没有本会话交接的呈报。不要开新卡、不要派新任务、不要就「要不要换卡」提问。",
		"需要用户裁决的事项写进最终呈报（send_report），不要用提问工具追问。",
		pct >= 40 ? "已到 40%：立即停，除收尾写入外不再调用工具。" : "",
	].filter(Boolean).join("\n");
}

/**
 * Pure rotate-line decision, exported for offline tests. `measured` is the gate's
 * own reading or null; judges are rotated by gate-guard, not here.
 */
function ctxRotateDenial(input) {
	const { toolName, role, args, measured } = input;
	if (measured === null || measured === undefined || !Number.isFinite(measured.pct)) return null;
	if (measured.pct < CARD_ROTATE_PCT) return null;
	if (role === "judge") return null;
	// Marking a goal complete/paused/blocked is settlement, not new work.
	if (toolName === "update_goal") {
		const action = String(args?.action ?? "");
		if (action === "complete" || action === "pause" || action === "blocked") return null;
		return ctxRotateDeny(measured);
	}
	if (ROTATE_BLOCK_TOOLS.has(toolName)) return ctxRotateDeny(measured);
	if (role === "lead" && MESSAGE_TOOLS.has(toolName)) {
		const raw = args?.message;
		const message = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
		if (!STOP_MESSAGE_RE.test(message)) return ctxRotateDeny(measured);
	}
	return null;
}

/** Working areas the discipline treats as scratch/evidence, not product. */
const EXCEPTION_DIRS = ["协作规则\\", "_scratch\\", "_rollback\\", "_staging\\", "_evidence\\", "_audit\\", "_tmp\\", ".tmp\\", "test\\", "tests\\", TASK_DIRNAME + "\\"];
/** A file name that is a verification artifact rather than a product source file. */
const VERIFY_NAME = /(^|[-_.])(verify|verify-all|check|probe|recon|audit|evidence|scan|dump|compare|diff|fixture|repro)([-_.]|$)|\.(test|spec)\./i;
const VERIFY_EXT = /\.(mjs|cjs|js|ts|tsx|jsx|ps1|py|sh|bat|cmd|json|jsonl|txt|md|log|csv|html)$/i;

/** Shell strings that are likely to create, modify, move or delete something. */
const WRITE_SHAPE = /(Set-Content|Add-Content|Out-File|Copy-Item|Move-Item|Remove-Item|New-Item|Rename-Item|Clear-Content|Set-Item|Tee-Object|robocopy|xcopy|Expand-Archive|Compress-Archive|Invoke-WebRequest[^\n]*-OutFile|curl[^\n]*-[oO]\s|wget[^\n]*-O\s|Start-BitsTransfer|node\s+(-e|--eval)|python\s+-c|py\s+-c|perl\s+-e|ruby\s+-e|php\s+-r|>\s*[^|]|>>|git\s+(add|commit|checkout|reset|clean|merge|rebase|push|stash|apply|restore|switch)|npm\s+(install|add|remove|uninstall|update|ci)|pnpm\s+(install|add|remove|build)|yarn\s+(add|remove|install)|writeFile|appendFile|createWriteStream|renameSync|unlinkSync|rmSync|mkdirSync|copyFileSync|execSync|spawnSync|child_process)/i;

/** Paths a non-lead role may never write, even when an envelope lists them. */
const PROTECTED_PATH_RE = /(^|[\\/])(\.gate-tasks|协作规则|governance-output-gate)([\\/]|$)/i;
/** Shell commands that touch the gate's own state are denied even to exec. */
const PROTECTED_SHELL_RE = /(\.gate-tasks|gate-verdicts|governance-output-gate|协作规则|\.dsh[\\/ ])/i;

function lower(value) {
	return String(value).replace(/\//g, "\\").toLowerCase();
}

/** The first path-like argument of a write tool. */
function targetOf(args) {
	if (args === null || typeof args !== "object") return null;
	for (const key of ["file_path", "path", "notebook_path", "target_file"]) {
		const value = args[key];
		if (typeof value === "string" && value.length > 0) return value;
	}
	return null;
}

/** Relative path inside cwd, or null when the target escapes it. */
function relativeInside(cwd, target) {
	if (typeof cwd !== "string" || cwd.length === 0 || typeof target !== "string" || target.length === 0) return null;
	const root = resolve(cwd);
	const abs = resolve(root, target);
	const rel = relative(root, abs);
	if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return null;
	return rel;
}

/** True when the target is a verification/evidence artifact by name (used only for NEW files). */
function isVerificationName(target) {
	const base = basename(target);
	return VERIFY_EXT.test(base) && VERIFY_NAME.test(base);
}

function isTempPath(target) {
	return relativeInside(TEMP_ROOT, target) !== null;
}

/**
 * The roots one gate workspace may write into: its own cwd plus every root the
 * user granted with `/gate root add`. Nothing else exists from the gate's point
 * of view — that is what keeps "outside the workspace" a refusal rather than a
 * silent whole-disk write permission.
 */
function rootsFor(cwd, state = readState()) {
	const roots = [];
	if (typeof cwd === "string" && cwd.length > 0) roots.push({ path: resolve(cwd), allowGateSelf: false });
	const key = workspaceKey(cwd);
	if (key === null) return roots;
	const extras = state.extraRoots[key];
	if (!Array.isArray(extras)) return roots;
	for (const entry of extras) {
		if (entry === null || typeof entry !== "object") continue;
		if (typeof entry.path !== "string" || entry.path.length === 0) continue;
		roots.push({ path: resolve(entry.path), allowGateSelf: entry.allowGateSelf === true });
	}
	return roots;
}

/** First root that contains the target, with the target's path relative to it. */
function matchRoot(roots, target) {
	if (typeof target !== "string" || target.length === 0) return null;
	for (const root of roots) {
		const rel = relativeInside(root.path, target);
		if (rel !== null) return { root: root.path, rel, allowGateSelf: root.allowGateSelf === true };
	}
	return null;
}

/** Human-readable root list for a denial message. */
function describeRoots(roots) {
	return roots.map((r) => r.path + (r.allowGateSelf ? "（含闸门自身）" : "")).join("、");
}

/**
 * The discipline 3.1 exceptions. The rule is by USE, not by directory:
 *   - scratch/evidence/work-record/test directories are always writable
 *   - a NEW verification/evidence artifact may be created in any directory
 *   - an EXISTING verification script stays writable at the project root,
 *     under test(s)/, or in the exception directories
 *   - existing product sources, configs and regression scripts under scripts/
 *     remain the execution side's work
 *   - `.gate-tasks/` is writable so the Lead can open a task envelope
 */
function allowedLeadPath(cwd, target, roots = rootsFor(cwd)) {
	const hit = matchRoot(roots, target);
	if (hit === null) {
		if (isTempPath(target)) return { ok: true, reason: "临时证据" };
		return { ok: false, reason: "目标不在当前工作区，也没有被 /gate root 授权：" + describeRoots(roots) };
	}
	const rel = hit.rel;
	const low = lower(rel);
	if (EXCEPTION_DIRS.some((prefix) => low.startsWith(prefix))) return { ok: true };

	const existing = existsSync(resolve(hit.root, target));
	if (isVerificationName(target)) {
		if (!existing) return { ok: true, reason: "新建验证/取证脚本" };
		const parts = rel.split(/[\\/]/);
		const top = parts.length === 1 ? "." : parts[0].toLowerCase();
		if (top === ".") return { ok: true, reason: "项目根的验证脚本" };
		if (top === "test" || top === "tests") return { ok: true, reason: "测试夹具" };
		return { ok: false, reason: "既有验证脚本位于产品目录（scripts/ 或源码树）；请新建到项目根、test/ 或 _scratch/" };
	}
	if (/^工作记录-.*\.md$/i.test(rel) || /^交接文档-.*\.md$/i.test(rel)) return { ok: true };
	return { ok: false, reason: "该路径属于产品代码/项目配置" };
}

function isVerdictPath(target) {
	const rel = relativeInside(VERDICT_ROOT, target);
	return rel !== null;
}

/** Task envelopes are workspace-local; the Lead writes them, exec only reads them. */
function taskPath(cwd, taskId) {
	return join(cwd, TASK_DIRNAME, "task-" + taskId + ".json");
}

/**
 * Standing prohibitions from `.gate-tasks/constraints.json`. Only `commit`
 * actions are merged here: the 7-1 ruling is "do not commit", not "do not edit".
 * The file is written by the coordinator (a .gate-tasks exception), and the gate
 * merges it into every envelope so a directory-level allowedPaths cannot swallow
 * a standing "do not commit" ruling.
 */
function readConstraints(cwd) {
	const file = join(cwd, TASK_DIRNAME, "constraints.json");
	if (!existsSync(file)) return [];
	try {
		const raw = JSON.parse(readFileSync(file, "utf8"));
		const list = Array.isArray(raw?.forbid) ? raw.forbid : [];
		const out = [];
		for (const entry of list) {
			if (entry === null || typeof entry !== "object") continue;
			const actions = Array.isArray(entry.actions) ? entry.actions.map(String) : ["commit"];
			if (!actions.includes("commit")) continue;
			const paths = Array.isArray(entry.paths) ? entry.paths.filter((p) => typeof p === "string" && p.length > 0) : [];
			for (const p of paths) out.push(p);
		}
		return [...new Set(out)];
	} catch {
		return [];
	}
}

/** Task id declared by the exec card name (`exec-<id>`) or description (`task:<id>`). */
function taskIdFor(roleName, description) {
	const m = EXEC_NAME_RE.exec(String(roleName ?? ""));
	if (m !== null) return m[1];
	const d = TASK_IN_DESC_RE.exec(String(description ?? ""));
	if (d !== null) return d[1];
	return null;
}

/**
 * Read and validate a task envelope. Fail-closed: missing, malformed, expired,
 * too long-lived, empty-scope or absolute/escaping paths all refuse the write.
 */
function readTask(cwd, taskId, roots = rootsFor(cwd)) {
	if (typeof taskId !== "string" || !TASK_ID_RE.test(taskId)) {
		return { ok: false, reason: "任务 id 非法（只允许字母数字 . _ -，1-64 字符）" };
	}
	const file = taskPath(cwd, taskId);
	if (!existsSync(file)) {
		return { ok: false, reason: "未找到任务信封 " + file + "；请由协调侧先写 task-" + taskId + ".json" };
	}
	let raw;
	try {
		raw = JSON.parse(readFileSync(file, "utf8"));
	} catch (error) {
		return { ok: false, reason: "任务信封不是合法 JSON：" + String(error?.message ?? error).slice(0, 120) };
	}
	if (raw === null || typeof raw !== "object") return { ok: false, reason: "任务信封必须是对象" };
	if (raw.taskId !== taskId) return { ok: false, reason: "信封 taskId 与卡名不一致：" + String(raw.taskId) + " ≠ " + taskId };
	const allowedPaths = Array.isArray(raw.allowedPaths) ? raw.allowedPaths.filter((p) => typeof p === "string" && p.length > 0) : [];
	if (allowedPaths.length === 0) return { ok: false, reason: "信封 allowedPaths 为空" };
	for (const p of allowedPaths) {
		if (p === "." || p === "*" || p.includes("..")) {
			return { ok: false, reason: "allowedPaths 只允许路径前缀，不许 . / * / ..：" + p };
		}
		// An absolute path is only legal inside a root the user granted.
		if (isAbsolute(p) && matchRoot(roots, p) === null) {
			return { ok: false, reason: "allowedPaths 的绝对路径不在已授权根内：" + p + "（当前根：" + describeRoots(roots) + "）" };
		}
	}
	const forbiddenPaths = Array.isArray(raw.forbiddenPaths) ? raw.forbiddenPaths.filter((p) => typeof p === "string" && p.length > 0) : [];
	for (const p of forbiddenPaths) {
		if (p === "." || p === "*" || p.includes("..")) {
			return { ok: false, reason: "forbiddenPaths 只允许路径前缀，不许 . / * / ..：" + p };
		}
		if (isAbsolute(p) && matchRoot(roots, p) === null) {
			return { ok: false, reason: "forbiddenPaths 的绝对路径不在已授权根内：" + p + "（当前根：" + describeRoots(roots) + "）" };
		}
	}
	const commitPaths = Array.isArray(raw.commitPaths) ? raw.commitPaths.filter((p) => typeof p === "string" && p.length > 0) : [];
	const commitForbiddenPaths = [...new Set([...forbiddenPaths, ...readConstraints(cwd)])];
	const expires = Date.parse(raw.expiresAt);
	if (!Number.isFinite(expires)) return { ok: false, reason: "信封 expiresAt 不是可解析的时间" };
	const now = Date.now();
	if (expires <= now) return { ok: false, reason: "任务信封已过期：" + String(raw.expiresAt) };
	if (expires - now > TASK_MAX_MS) return { ok: false, reason: "任务信封有效期超过 24 小时，请缩短" };
	return {
		ok: true,
		id: taskId,
		file,
		allowedPaths,
		forbiddenPaths,
		commitForbiddenPaths,
		commitPaths,
		action: typeof raw.action === "string" ? raw.action : "write",
		allowShell: raw.allowShell === true,
		allowCommit: raw.allowCommit === true,
		allowPush: raw.allowPush === true,
		expiresAt: raw.expiresAt,
	};
}

/**
 * True when the target sits inside one of the envelope's prefixes.
 * A relative prefix is resolved against every granted root, so one envelope can
 * cover the project and a granted sibling repo at the same time.
 */
function taskAllowsTarget(roots, target, allowedPaths) {
	const hit = matchRoot(roots, target);
	if (hit === null) return false;
	const abs = resolve(hit.root, target);
	for (const p of allowedPaths) {
		const bases = isAbsolute(p) ? [resolve(p)] : roots.map((r) => resolve(r.path, p));
		for (const base of bases) {
			const r = relative(base, abs);
			if (r === "" || (!r.startsWith("..") && !isAbsolute(r))) return true;
		}
	}
	return false;
}

/** True when the target sits inside one of the envelope's explicit forbidden prefixes. */
function taskForbidsTarget(roots, target, forbiddenPaths) {
	if (!Array.isArray(forbiddenPaths) || forbiddenPaths.length === 0) return false;
	const hit = matchRoot(roots, target);
	if (hit === null) return false;
	const abs = resolve(hit.root, target);
	for (const p of forbiddenPaths) {
		const bases = isAbsolute(p) ? [resolve(p)] : roots.map((r) => resolve(r.path, p));
		for (const base of bases) {
			const r = relative(base, abs);
			if (r === "" || (!r.startsWith("..") && !isAbsolute(r))) return true;
		}
	}
	return false;
}

/**
 * Non-lead roles may not write the task envelopes, discipline docs or the gate.
 * "The gate" means the plugin that is auditing them: a granted root only opens
 * it when the user asked for that explicitly (`--with-gate`).
 */
function isProtectedPath(roots, target) {
	const hit = matchRoot(roots, target);
	if (hit === null) return true;
	if (hit.allowGateSelf) {
		return /(^|[\\/])(\.gate-tasks|协作规则)([\\/]|$)/i.test(hit.rel);
	}
	return PROTECTED_PATH_RE.test(hit.rel);
}

function leadDeny(target, reason) {
	return [
		"输出闸门：协调侧（Lead）不得直接写产品代码/项目配置（纪律 3.1）。",
		"请用 spawn_teammate / send_message 把产品改动派给执行侧，并在 .gate-tasks/ 开任务信封。",
		"协调侧自己取证可直接写：协作规则/**、_scratch/**、_rollback/**、_staging/**、",
		"_evidence/**、_audit/**、_tmp/**、test(s)/**、系统临时目录；",
		"任意目录新建 verify/check/probe/audit/evidence 类脚本；项目根已有的验证脚本可继续改。",
		"既有 scripts/ 回归脚本与产品源码/配置仍属执行侧。",
		"目标：" + (target ?? "(未给出路径)") + "；判定：" + reason + "。",
	].join("\n");
}

function judgeDeny(toolName) {
	return [
		"输出闸门：审核侧/监管侧只读，不得写文件（纪律 3.6.3 的岗位边界）。",
		"唯一的写入例外是闸门裁决目录 ~/.dsh/gate-verdicts/**。",
		"被拒绝的工具：" + toolName + "。",
	].join("\n");
}

/** A wire collapsed to run_code-only makes every read-only channel unreachable. */
const PTC_WIRE_HINT = "若本会话的 wire 上只剩 run_code（PTC 呈现），read/pwsh 要在程序里调用（tools.read / tools.pwsh）；只读调用闸门不拦。";

function leadShellDeny(toolName, reason) {
	return [
		"输出闸门：协调侧（Lead）不得用 shell 写文件（写形态命令）。",
		"请改用 write/edit 写例外区，或把产品改动派给执行侧（执行侧必须带任务信封）。",
		"被拒绝的工具：" + toolName + "；判定：" + reason + "。",
		"只读命令仍可用（Get-Content / Select-String / git status / git diff 等）；read / pwsh 或 run_code 里的 tools.read 都放行。",
		PTC_WIRE_HINT,
	].join("\n");
}

function judgeShellDeny(toolName) {
	return [
		"输出闸门：审核侧/监管侧只读，不得用 shell 写文件。",
		"被拒绝的工具：" + toolName + "。",
		"读日志/读文件请用 read、pwsh 的只读命令，或 run_code 里的 tools.read；写裁决请用 write 到 ~/.dsh/gate-verdicts/**。",
		"不要反复重试同一个被拒绝的调用（同一形态最多试两次）；只读通道是放行的。",
		PTC_WIRE_HINT,
	].join("\n");
}

function execDeny(taskId, reason) {
	return [
		"输出闸门：执行侧写入被拒绝（任务信封校验失败）。",
		"任务：" + (taskId ?? "(未声明)") + "；判定：" + reason + "。",
		"信封格式：<cwd>/.gate-tasks/task-<taskId>.json，字段 taskId / allowedPaths / forbiddenPaths / allowShell / allowCommit / allowPush / expiresAt（≤24h）。",
		"push 另需 .gate-tasks/preflight-<taskId>.json（target / rev / measured_at / local-info-audit / credential-scan）。",
		"执行侧卡名必须是 exec-<taskId>，或在描述里写 task:<taskId>。",
	].join("\n");
}

function unknownDeny(toolName) {
	return [
		"输出闸门：这个子卡没有声明角色，按只读处理。",
		"要写产品代码，请让协调侧建 exec-<taskId> 卡并开 .gate-tasks/task-<taskId>.json。",
		"被拒绝的工具：" + toolName + "。",
	].join("\n");
}

/** `git … push` is an action class, not an ordinary shell write. */
const PUSH_RE = /\bgit\b[^\n]*\bpush\b/i;
const PUSH_DRY_RE = /--dry-run\b/i;

/**
 * Split a shell command into top-level segments at ; & | and newlines.
 * Quotes are honored; returns null when the text cannot be segmented safely
 * (unbalanced quotes) and callers must fail closed. Exported for tests.
 */
function shellSegments(text) {
	const segments = [];
	let current = "";
	let quote = null;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quote !== null) {
			if (ch === quote) quote = null;
			current += ch;
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			current += ch;
			continue;
		}
		if (ch === ";" || ch === "\n" || ch === "\r") {
			segments.push(current);
			current = "";
			continue;
		}
		if ((ch === "&" && text[i + 1] === "&") || (ch === "|" && text[i + 1] === "|")) {
			segments.push(current);
			current = "";
			i++;
			continue;
		}
		if (ch === "&" || ch === "|") {
			segments.push(current);
			current = "";
			continue;
		}
		current += ch;
	}
	if (quote !== null) return null;
	segments.push(current);
	return segments.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * True when at least one command segment is a real (non-dry-run) `git push`;
 * false when every push segment is a dry-run or there is no push at all;
 * null when the text cannot be parsed safely — the call site treats null as
 * "apply the push gate" (fail closed). The dry-run flag only counts inside the
 * same segment as the push: `git push origin main; echo --dry-run` is a real
 * push, not a dry-run (审核意见 P1-3，2026-11-01).
 */
function pushGateRequired(text) {
	const segments = shellSegments(text);
	if (segments === null) return null;
	for (const segment of segments) {
		if (PUSH_RE.test(segment) && !PUSH_DRY_RE.test(segment)) return true;
	}
	return false;
}
/** `git … commit` is the point where the staged set must match the envelope. */
const GIT_COMMIT_RE = /\bgit\b[^\n]*\bcommit\b/i;
const PREFLIGHT_PREFIX = "preflight-";

function preflightPath(cwd, taskId) {
	return join(cwd, TASK_DIRNAME, PREFLIGHT_PREFIX + taskId + ".json");
}

function normalizeSlash(value) {
	return String(value).replace(/\\/g, "/").toLowerCase();
}

/** Repo the exec command operates on: explicit workdir, `git -C <path>`, else cwd. */
function gitRepoFor(args, cwd) {
	if (typeof args?.workdir === "string" && args.workdir.length > 0) return args.workdir;
	const text = typeof args?.command === "string" ? args.command : "";
	const m = /\bgit\s+-C\s+(?:"([^"]+)"|'([^']+)'|([^\s"']+))/i.exec(text);
	if (m !== null) return m[1] ?? m[2] ?? m[3];
	return cwd;
}

function gitOutput(repo, gitArgs) {
	try {
		return execFileSync("git", ["-C", repo, ...gitArgs], { encoding: "utf8", timeout: 15000 }).trim();
	} catch {
		return null;
	}
}

/**
 * Push preflight: the user's hard requirement is that a public push is preceded
 * by a content-level local-info audit. The gate cannot audit for the lead, but it
 * can refuse the push unless the audit exists, targets the current HEAD, covers
 * both slash forms and both dimensions (new files / changed existing files), and
 * reports zero new exposure (or carries an explicit user waiver, handled by the
 * reviewer outside this gate).
 */
function validatePreflight(raw, expected) {
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "preflight 不是 JSON 对象" };
	if (raw.action !== "push") return { ok: false, reason: "preflight.action 必须是 push" };
	if (typeof raw.target !== "string" || raw.target.length === 0) return { ok: false, reason: "preflight.target 缺失" };
	if (!normalizeSlash(expected.command).includes(normalizeSlash(raw.target))) {
		return { ok: false, reason: "preflight.target 与本次 push 的目标 URL 不一致" };
	}
	if (typeof raw.rev !== "string" || raw.rev.length < 7) return { ok: false, reason: "preflight.rev 缺失或过短" };
	if (typeof expected.head !== "string" || !expected.head.toLowerCase().startsWith(raw.rev.toLowerCase())) {
		return { ok: false, reason: "preflight.rev 不是当前 HEAD（审查对象已变化，需重做）" };
	}
	const measuredAt = Date.parse(raw.measured_at);
	if (!Number.isFinite(measuredAt)) return { ok: false, reason: "preflight.measured_at 不是可解析时间" };
	const lastCommit = Date.parse(expected.lastCommitAt ?? "");
	if (Number.isFinite(lastCommit) && measuredAt < lastCommit) {
		return { ok: false, reason: "preflight.measured_at 早于最后一笔提交（审查不是针对当前 HEAD）" };
	}
	const checks = Array.isArray(raw.checks) ? raw.checks : [];
	const audit = checks.find((c) => c !== null && typeof c === "object" && c.id === "local-info-audit");
	if (audit === undefined) return { ok: false, reason: "preflight 缺少 local-info-audit" };
	if (audit.status !== "pass") return { ok: false, reason: "local-info-audit 未通过" };
	if (Number(audit.newly_exposed_files) !== 0) return { ok: false, reason: "local-info-audit 报告新增暴露件数不为 0" };
	const pattern = String(audit.pattern ?? "").replace(/\\\\/g, "\\");
	// The identifying needles are the path shapes plus the LOCAL account name,
	// derived at runtime: a hardcoded real username would leak it into the
	// open-source tree and be wrong on every other machine.
	const localUser = (() => { try { return userInfo().username; } catch { return ""; } })();
	const needles = ["D:/dsh-", "D:\\dsh-", "file:///", "C:/Users", "C:\\Users"];
	if (localUser.length > 0) needles.push(localUser);
	for (const needle of needles) {
		if (!pattern.includes(needle)) return { ok: false, reason: "local-info-audit.pattern 未覆盖 " + needle };
	}
	const dims = Array.isArray(audit.dimensions) ? audit.dimensions : [];
	for (const dim of ["new-files", "changed-content"]) {
		if (!dims.includes(dim)) return { ok: false, reason: "local-info-audit.dimensions 缺少 " + dim };
	}
	if (typeof audit.snapshot !== "string" || audit.snapshot.length === 0) return { ok: false, reason: "local-info-audit.snapshot 缺失" };
	if (!existsSync(resolve(expected.cwd, audit.snapshot))) return { ok: false, reason: "local-info-audit.snapshot 不存在：" + audit.snapshot };
	const cred = checks.find((c) => c !== null && typeof c === "object" && c.id === "credential-scan");
	if (cred === undefined) return { ok: false, reason: "preflight 缺少 credential-scan" };
	if (cred.status !== "pass") return { ok: false, reason: "credential-scan 未通过" };
	return { ok: true };
}

function checkPushPreflight(cwd, taskId, args) {
	const file = preflightPath(cwd, taskId);
	if (!existsSync(file)) {
		return { ok: false, reason: "缺少 push 前置审查 " + file + "（target / rev / measured_at / local-info-audit / credential-scan）" };
	}
	let raw;
	try {
		raw = JSON.parse(readFileSync(file, "utf8"));
	} catch (error) {
		return { ok: false, reason: "preflight 不是合法 JSON：" + String(error?.message ?? error).slice(0, 120) };
	}
	const repo = gitRepoFor(args, cwd);
	const head = gitOutput(repo, ["rev-parse", "HEAD"]);
	if (head === null) return { ok: false, reason: "无法读取 " + repo + " 的 HEAD" };
	const lastCommitAt = gitOutput(repo, ["log", "-1", "--format=%cI"]);
	const command = typeof args?.command === "string" ? args.command : JSON.stringify(args ?? {});
	return validatePreflight(raw, { command, head, lastCommitAt, cwd });
}

function stagedPaths(repo) {
	const out = gitOutput(repo, ["diff", "--cached", "--name-only", "--relative"]);
	if (out === null) return null;
	return out.split(/\r?\n/).filter(Boolean);
}

function normalizeRel(value) {
	return String(value).replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * A commit must be exactly the paths the envelope names in commitPaths, inside
 * allowedPaths, and outside forbiddenPaths. This is the 7-1 guard: a directory
 * level allowedPaths no longer swallows a standing "do not commit" ruling.
 */
function validateCommitPaths(task, roots, cwd, args, stagedOverride) {
	if (!Array.isArray(task.commitPaths) || task.commitPaths.length === 0) {
		return { ok: false, reason: "信封 commitPaths 为空（git 写必须逐条列出提交面）" };
	}
	const staged = Array.isArray(stagedOverride) ? stagedOverride : stagedPaths(gitRepoFor(args, cwd));
	if (staged === null) return { ok: false, reason: "无法读取暂存区（git diff --cached）" };
	if (staged.length === 0) return { ok: false, reason: "暂存区为空" };
	const commitSet = task.commitPaths.map(normalizeRel);
	const matchesCommit = (p) => commitSet.some((c) => p === c || p.startsWith(c.replace(/\/$/, "") + "/"));
	const commitForbidden = Array.isArray(task.commitForbiddenPaths) ? task.commitForbiddenPaths : task.forbiddenPaths;
	for (const original of staged) {
		const p = normalizeRel(original);
		if (!matchesCommit(p)) return { ok: false, reason: "暂存路径不在 commitPaths 内：" + original };
		if (taskForbidsTarget(roots, p, commitForbidden)) return { ok: false, reason: "暂存路径在 forbiddenPaths 内（用户既有裁决禁止提交）：" + original };
		if (!taskAllowsTarget(roots, p, task.allowedPaths)) return { ok: false, reason: "暂存路径不在 allowedPaths 内：" + original };
	}
	return { ok: true, staged };
}

function docDeny(target, reason) {
	return [
		"输出闸门：项目档案/交接文档必须先审后写（纪律 3.3.1 / 3.3.3）。",
		"先把写后内容作为送审件提交：send_report({ kind: \"document\", target, old_string, new_string })。",
		"两侧 APPROVED 后，再对同一处原样执行写入；改一字即新稿，需重新提交。",
		"目标：" + (target ?? "(未给出路径)") + "；判定：" + reason + "。",
	].join("\n");
}

function shellPreview(args) {
	try {
		const text = JSON.stringify(args ?? {});
		return text.length > 400 ? text.slice(0, 400) + "…" : text;
	} catch {
		return "(unserializable)";
	}
}

/** Role from the session header + the Team membership (name/description). */
function roleOf(input) {
	const { header, roleName, description } = input;
	if (!isSubagentHeader(header)) return "lead";
	const nm = String(roleName ?? "").toLowerCase();
	const desc = String(description ?? "");
	if (JUDGE_NAMES.has(nm) || /^reviewer[-_]?\d*$/.test(nm) || /^supervisor[-_]?\d*$/.test(nm) || /审核|监管/.test(desc)) return "judge";
	if (EXEC_NAME_RE.test(nm) || /执行侧|执行者/.test(desc)) return "exec";
	return "unknown";
}

/**
 * Review §三.1: the two spawn interceptions (judge rotation, Guide 3.0.1 exec
 * reuse) are advisory guidance, not safety fences. With /gate off the user has
 * disabled the gate for the workspace, so neither may deny a spawn. Pure so the
 * offline tests can pin the switch behaviour directly.
 */
function spawnReuseDenial({ gateActive, team, agent, spawnArgs, options }) {
	if (!gateActive) return null;
	return redundantJudgeSpawn(team, agent, spawnArgs, options)
		?? redundantExecSpawn(team, agent, spawnArgs, options);
}

/** Pure decision used by the guard and by the offline tests. */
function decide(input) {
	const { cwd, header, roleName, description, toolName, args, sessionId, ctxPct } = input;
	if (typeof cwd !== "string" || cwd.length === 0) return { deny: false };
	// One state read per decision: the switch and the granted roots must come from
	// the same snapshot, or a mid-flight /gate off could be half-applied.
	const state = readState();
	const key = workspaceKey(cwd);
	if (key === null || !state.enabledWorkspaces.includes(key)) return { deny: false };

	// 汇报即终局（纪律 3.3.2）：呈报放行并输出后，本 turn 的一切操作到此为止。
	// The text gate already withholds narration; refusing tool calls here is what
	// actually stops the turn from continuing past the report.
	if (isReportFinalized(sessionId)) {
		return {
			deny: true,
			reason: "汇报即终局（纪律 3.3.2）：呈报已放行并输出，本 turn 不得再调用任何工具。修正与补充属于下一 turn（由用户发言触发）。",
		};
	}

	const role = roleOf({ header, roleName, description });
	const taskId = role === "exec" ? taskIdFor(roleName, description) : null;
	// cwd plus every root the user granted to this workspace with /gate root add.
	const roots = rootsFor(cwd, state);

	// User rule (2026-10-30): at ≥35% a card finishes and takes no new work; it
	// does not ask the user. Measured only for the tools that would enlarge work,
	// so a read-heavy loop does not re-decompress the log every call.
	if (ROTATE_BLOCK_TOOLS.has(toolName) || (role === "lead" && MESSAGE_TOOLS.has(toolName))) {
		const measured = measuredContext(sessionId, ctxPct);
		const rotateDenial = ctxRotateDenial({ toolName, role, args, measured });
		if (rotateDenial !== null) return { deny: true, reason: rotateDenial };
	}

	// A program transport is not a decision point: every tool the program
	// reaches is dispatched through this guard with its own name and arguments.
	// Judge those calls; never deny the wrapper (on a PTC wire it is the only
	// channel, so a blanket verdict here wedges the whole role).
	if (TRANSPORT_TOOLS.has(toolName)) {
		return { deny: false, log: "transport-pass", detail: shellPreview(args) };
	}

	// Coordinator may not hand the reviewer's checklist to the supervisor: the
	// supervisor audits operations, not conclusions (discipline 3.6.3 / guide
	// 一之四). This blocks the round-1 shape while allowing an operation-only
	// receipt (which does not contain these markers).
	if (role === "lead" && MESSAGE_TOOLS.has(toolName)) {
		const target = String(args?.target ?? "");
		const rawMessage = args?.message;
		const message = typeof rawMessage === "string" ? rawMessage : JSON.stringify(rawMessage ?? "");
		if (/supervisor|监管/i.test(target) && REVIEW_LIST_RE.test(message)) {
			return {
				deny: true,
				reason: "监管侧只收操作面与日志指针，不收待核对结论/整改清单；清单请只送 reviewer（指南一之四）。",
			};
		}
	}

	const isShell = SHELL_TOOLS.has(toolName) || /powershell|terminal/i.test(String(toolName));

	if (isShell) {
		const text = JSON.stringify(args ?? {});
		const writeShape = WRITE_SHAPE.test(text);

		if (role === "lead") {
			if (writeShape) return { deny: true, reason: leadShellDeny(toolName, "命令是写形态") };
			return { deny: false };
		}
		if (role === "judge") {
			if (writeShape) return { deny: true, reason: judgeShellDeny(toolName) };
			return { deny: false };
		}
		if (role === "exec") {
			if (taskId === null) return { deny: true, reason: execDeny(null, "卡名/描述里没有 taskId") };
			const task = readTask(cwd, taskId, roots);
			if (!task.ok) return { deny: true, reason: execDeny(taskId, task.reason) };
			if (!writeShape) return { deny: false };
			if (!task.allowShell) return { deny: true, reason: execDeny(taskId, "信封未允许 shell 写入（allowShell: true 才放行）") };
			if (PROTECTED_SHELL_RE.test(text)) return { deny: true, reason: execDeny(taskId, "shell 命令指向受保护路径（.gate-tasks/协作规则/闸门/.dsh）") };
			// Push is an irreversible public action: it carries its own preflight and
			// its own envelope flag. A dry-run is a read of the remote and needs neither.
			// The dry-run flag only counts within the push's own command segment; a
			// text that cannot be segmented safely is gated (fail closed, P1-3).
			if (PUSH_RE.test(text) && pushGateRequired(text) !== false) {
				if (!task.allowPush) {
					return { deny: true, reason: execDeny(taskId, "信封未允许 push（push 另需 allowPush: true 与 .gate-tasks/preflight-" + taskId + ".json）") };
				}
				const preflight = checkPushPreflight(cwd, taskId, args);
				if (!preflight.ok) return { deny: true, reason: execDeny(taskId, "push 前置审查未通过：" + preflight.reason) };
				return { deny: false, log: "push-approved", detail: shellPreview(args), taskId, journal: "push-approved" };
			}
			if (GIT_COMMIT_RE.test(text)) {
				if (!task.allowCommit) {
					return { deny: true, reason: execDeny(taskId, "信封未允许 commit（git 写另需 allowCommit: true 与 commitPaths）") };
				}
				const commit = validateCommitPaths(task, roots, cwd, args);
				if (!commit.ok) return { deny: true, reason: execDeny(taskId, "提交面校验未通过：" + commit.reason) };
				return { deny: false, log: "commit-approved", detail: shellPreview(args), taskId, journal: "commit-approved" };
			}
			return { deny: false, log: "shell-write-exec", detail: shellPreview(args), taskId, journal: "shell-write-exec" };
		}
		if (writeShape) return { deny: true, reason: unknownDeny(toolName) };
		return { deny: false };
	}

	if (!WRITE_TOOLS.has(toolName)) return { deny: false };

	const target = targetOf(args);
	if (role === "judge") {
		if (target !== null && isVerdictPath(target)) return { deny: false, log: "verdict-write", target };
		return { deny: true, reason: judgeDeny(toolName) };
	}

	if (role === "lead") {
		if (target === null) return { deny: true, reason: leadDeny(null, "该工具没有可判定的文件路径，不能确认它只写例外区") };
		const allowed = allowedLeadPath(cwd, target, roots);
		if (!allowed.ok) return { deny: true, reason: leadDeny(target, allowed.reason) };
		// Controlled documents are manuscript-first: the exact post-write content
		// must have been cleared by send_report({kind:"document"}) in this session.
		if (isControlledDoc(target)) {
			const hash = docResultHash(target, args);
			if (hash === null) {
				return { deny: true, reason: docDeny(target, "无法校验写后内容；请用 write/edit，且 old_string 要能在现文中逐字找到") };
			}
			if (!hasDocClearance(sessionId, target, hash)) {
				return { deny: true, reason: docDeny(target, "没有与写后内容匹配的放行稿（或已过期）") };
			}
			return { deny: false, log: "doc-write", target, detail: hash };
		}
		return { deny: false, log: "allow-write", target };
	}

	if (role === "exec") {
		if (taskId === null) return { deny: true, reason: execDeny(null, "卡名/描述里没有 taskId") };
		const task = readTask(cwd, taskId, roots);
		if (!task.ok) return { deny: true, reason: execDeny(taskId, task.reason) };
		if (target === null) return { deny: true, reason: execDeny(taskId, "该写工具没有可判定的文件路径") };
		if (isProtectedPath(roots, target)) return { deny: true, reason: execDeny(taskId, "目标是受保护路径（任务信封/协作规则/闸门）；若确需改闸门自身，由用户在 /gate root add 时加 --with-gate") };
		if (!taskAllowsTarget(roots, target, task.allowedPaths)) {
			return { deny: true, reason: execDeny(taskId, "目标不在信封 allowedPaths 内：" + String(target) + "（已授权根：" + describeRoots(roots) + "）") };
		}
		if (taskForbidsTarget(roots, target, task.forbiddenPaths)) {
			return { deny: true, reason: execDeny(taskId, "目标在信封 forbiddenPaths 内（用户既有裁决禁止写/提交）：" + String(target)) };
		}
		return { deny: false, log: "exec-write", target, taskId, journal: "exec-write" };
	}

	return { deny: true, reason: unknownDeny(toolName) };
}

/** Append one audit line; a failed append denies the write (fail-closed). */
function appendJournal(decision, exec, cwd) {
	try {
		mkdirSync(TASK_ROOT, { recursive: true });
		const file = join(TASK_ROOT, decision.taskId + ".journal.jsonl");
		const entry = {
			time: new Date().toISOString(),
			taskId: decision.taskId,
			role: "exec",
			tool: String(exec.name ?? ""),
			kind: decision.journal,
			target: decision.target ?? null,
			cwd: cwd ?? null,
			argsPreview: decision.detail ?? shellPreview(exec.arguments),
		};
		appendFileSync(file, JSON.stringify(entry) + "\n", "utf8");
		return true;
	} catch (error) {
		dbg("tools:journal-error", String(error?.message ?? error).slice(0, 200));
		return false;
	}
}

function apply(ctx) {
	ctx.tools.guard((exec) => {
		try {
			const agent = exec?.agent;
			if (agent === undefined || agent === null) return undefined;
			const header = agent.session?.header;
			if (header === undefined || header === null) return undefined;

			let roleName;
			let description;
			let team;
			try {
				team = ctx.get("agentTeams");
				const member = team?.tryMembership(agent);
				roleName = member?.name;
				description = member?.description;
			} catch {
				roleName = undefined;
				description = undefined;
			}

			const decision = decide({
				cwd: header.cwd,
				header,
				sessionId: agent.session?.id ?? agent.id,
				roleName,
				description,
				toolName: String(exec.name ?? ""),
				args: exec.arguments,
			});
			const role = roleOf({ header, roleName, description });
			// A Lead that just saw a judge interrupted by a user pause must not
			// mistake it for an exhausted card and open a redundant one.
			if (role === "lead" && String(exec.name ?? "") === "spawn_teammate") {
				let spawnArgs = exec.arguments;
				if (typeof spawnArgs === "string") {
					try {
						spawnArgs = JSON.parse(spawnArgs);
					} catch {
						spawnArgs = null;
					}
				}
				// Review §三.1: with /gate off the gate must not intervene at all —
				// the reuse interceptions are advisory, so a disabled workspace
				// skips them (spawnReuseDenial returns null on gateActive=false).
				const st = readState();
				const wk = workspaceKey(header.cwd);
				const denial = spawnReuseDenial({
					gateActive: wk !== null && st.enabledWorkspaces.includes(wk),
					team,
					agent,
					spawnArgs,
				});
				if (denial !== null) {
					dbg("tools:deny", "role=lead tool=spawn_teammate reason=" + denial.split("\n")[0]);
					return denial;
				}
			}
			if (decision.log !== undefined) {
				dbg("tools:" + decision.log, "role=" + role
					+ " task=" + String(decision.taskId ?? "") + " tool=" + String(exec.name) + " target=" + String(decision.target ?? "")
					+ (decision.detail === undefined ? "" : " args=" + decision.detail));
			}
			if (decision.journal !== undefined) {
				if (!appendJournal(decision, exec, header.cwd)) {
					return "输出闸门：执行侧写入审计日志失败，本次写入已拒绝（fail-closed）。";
				}
			}
			if (!decision.deny) return undefined;
			dbg("tools:deny", "role=" + role + " tool=" + String(exec.name)
				+ " reason=" + String(decision.reason).split("\n")[0]);
			return decision.reason;
		} catch (error) {
			// A guard failure must not wedge every tool; report it instead of hiding it.
			// Fail-closed for writes (the file-header promise): when the classifier
			// itself crashes, a write or shell call may not proceed unchecked. Read-only
			// tools and transports degrade openly with the visible guard-error log.
			dbg("tools:guard-error", String(error?.message ?? error).slice(0, 200));
			if (WRITE_TOOLS.has(exec.name) || SHELL_TOOLS.has(exec.name)) {
				return "输出闸门：工具闸自身异常（fail-closed），本次写入类调用已拒绝；可重试，或查 gate-debug 日志（tools:guard-error）。";
			}
			return undefined;
		}
	});
}

export {
	apply, inject, name, decide, roleOf, taskIdFor, readTask, taskAllowsTarget, taskForbidsTarget, isProtectedPath,
	targetOf, relativeInside, allowedLeadPath, isVerdictPath, isVerificationName, isTempPath,
	ctxRotateDenial, measuredContext, CARD_ROTATE_PCT, spawnReuseDenial,
	validatePreflight, checkPushPreflight, gitRepoFor, preflightPath,
	shellSegments, pushGateRequired,
	validateCommitPaths, stagedPaths, readConstraints,
	WRITE_TOOLS, SHELL_TOOLS, TRANSPORT_TOOLS, MESSAGE_TOOLS, REVIEW_LIST_RE, EXCEPTION_DIRS, TASK_DIRNAME, TASK_ROOT, TASK_MAX_MS,
};
