import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// AGENTS.md §1: sibling plugins are probed at runtime, never statically imported.
const {
	readTask,
	taskAllowsTarget,
	taskForbidsTarget,
	validatePreflight,
	validateCommitPaths,
	readConstraints,
	gitRepoFor,
} = await import("../lib/governance-output-gate/lib/gate-tools.js");

// The production gate derives the machine-username needle at runtime (no real
// account name may be hardcoded in the open-source tree); the fixture mirrors
// that so the coverage check is exercised against the same needle set.
const USERNAME = (() => { try { return os.userInfo().username; } catch { return ""; } })();
const LOCAL_PATTERN = [USERNAME, "C:/Users", "C:\\\\Users", "D:/dsh-", "D:\\\\dsh-", "file:///"].filter(Boolean).join("|");

function tempWorkspace() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-envelope-"));
	fs.mkdirSync(path.join(dir, ".gate-tasks"), { recursive: true });
	return dir;
}

function writeEnvelope(dir, id, extra) {
	const raw = {
		taskId: id,
		allowedPaths: ["src/"],
		forbiddenPaths: ["src/locked/"],
		allowShell: true,
		expiresAt: new Date(Date.now() + 3600_000).toISOString(),
		...extra,
	};
	fs.writeFileSync(path.join(dir, ".gate-tasks", "task-" + id + ".json"), JSON.stringify(raw), "utf8");
	return raw;
}

test("forbiddenPaths are parsed and subtracted from allowedPaths", () => {
	const dir = tempWorkspace();
	writeEnvelope(dir, "x", {});
	const roots = [{ path: dir, allowGateSelf: false }];
	const task = readTask(dir, "x", roots);
	assert.equal(task.ok, true);
	assert.deepEqual(task.forbiddenPaths, ["src/locked/"]);
	assert.equal(taskAllowsTarget(roots, "src/a.js", task.allowedPaths), true);
	assert.equal(taskForbidsTarget(roots, "src/locked/x.js", task.forbiddenPaths), true);
	assert.equal(taskForbidsTarget(roots, "src/a.js", task.forbiddenPaths), false);
});

test("a forbiddenPaths entry may not escape the workspace", () => {
	const dir = tempWorkspace();
	writeEnvelope(dir, "x", { forbiddenPaths: ["../outside/"] });
	const task = readTask(dir, "x", [{ path: dir, allowGateSelf: false }]);
	assert.equal(task.ok, false);
	assert.match(task.reason, /forbiddenPaths/);
});

test("the push preflight passes only for the current HEAD with a complete audit", () => {
	const dir = tempWorkspace();
	fs.writeFileSync(path.join(dir, "audit.txt"), "measured_at=2026-10-30T05:00:00Z\nNEWLY_EXPOSED_FILES=0\n", "utf8");
	const raw = {
		action: "push",
		target: "https://github.com/owner/repo.git",
		rev: "abcdef1",
		measured_at: "2026-10-30T05:00:00Z",
		checks: [
			{
				id: "local-info-audit",
				status: "pass",
				newly_exposed_files: 0,
				pattern: LOCAL_PATTERN,
				dimensions: ["new-files", "changed-content"],
				snapshot: "audit.txt",
			},
			{ id: "credential-scan", status: "pass" },
		],
	};
	const expected = {
		command: "git -C repo push https://github.com/owner/repo.git master",
		head: "abcdef1234567890",
		lastCommitAt: "2026-10-30T04:00:00Z",
		cwd: dir,
	};
	assert.equal(validatePreflight(raw, expected).ok, true);

	const badRev = { ...raw, rev: "1234567" };
	assert.match(validatePreflight(badRev, expected).reason, /不是当前 HEAD/);

	const stale = { ...raw, measured_at: "2026-10-30T03:00:00Z" };
	assert.match(validatePreflight(stale, expected).reason, /早于最后一笔提交/);

	const exposed = {
		...raw,
		checks: raw.checks.map((c) => (c.id === "local-info-audit" ? { ...c, newly_exposed_files: 3 } : c)),
	};
	assert.match(validatePreflight(exposed, expected).reason, /新增暴露件数不为 0/);

	const narrow = {
		...raw,
		checks: raw.checks.map((c) => (c.id === "local-info-audit" ? { ...c, pattern: LOCAL_PATTERN.split("|").filter((n) => n !== "D:/dsh-").join("|") } : c)),
	};
	assert.match(validatePreflight(narrow, expected).reason, /未覆盖 D:\/dsh-/);

	const oneDimension = {
		...raw,
		checks: raw.checks.map((c) => (c.id === "local-info-audit" ? { ...c, dimensions: ["new-files"] } : c)),
	};
	assert.match(validatePreflight(oneDimension, expected).reason, /changed-content/);

	const noSnapshot = {
		...raw,
		checks: raw.checks.map((c) => (c.id === "local-info-audit" ? { ...c, snapshot: "missing.txt" } : c)),
	};
	assert.match(validatePreflight(noSnapshot, expected).reason, /snapshot 不存在/);

	const wrongTarget = { ...raw, target: "https://github.com/other/repo.git" };
	assert.match(validatePreflight(wrongTarget, expected).reason, /目标 URL 不一致/);
});

test("gitRepoFor honors workdir, git -C, then cwd", () => {
	assert.equal(gitRepoFor({ workdir: "D:\\repo" }, "D:\\cwd"), "D:\\repo");
	assert.equal(gitRepoFor({ command: "git -C D:\\repo push origin master" }, "D:\\cwd"), "D:\\repo");
	assert.equal(gitRepoFor({ command: "git push origin master" }, "D:\\cwd"), "D:\\cwd");
});

test("a standing constraints.json commit prohibition merges into every envelope", () => {
	const dir = tempWorkspace();
	fs.writeFileSync(
		path.join(dir, ".gate-tasks", "constraints.json"),
		JSON.stringify({ forbid: [{ id: "7-1", actions: ["commit"], paths: ["src/locked/"] }] }),
		"utf8",
	);
	writeEnvelope(dir, "x", { forbiddenPaths: [], commitPaths: ["src/locked/x.js"] });
	const roots = [{ path: dir, allowGateSelf: false }];
	const task = readTask(dir, "x", roots);
	assert.equal(task.ok, true);
	assert.deepEqual(readConstraints(dir), ["src/locked/"]);
	assert.ok(task.commitForbiddenPaths.includes("src/locked/"));
	const denied = validateCommitPaths(task, roots, dir, { command: "git commit -m x" }, ["src/locked/x.js"]);
	assert.equal(denied.ok, false);
	assert.match(denied.reason, /forbiddenPaths/);
});

test("a commit must match commitPaths and stay outside forbiddenPaths", () => {
	const dir = tempWorkspace();
	const roots = [{ path: dir, allowGateSelf: false }];
	const task = { allowedPaths: ["src/"], forbiddenPaths: ["src/locked/"], commitPaths: ["src/a.js"] };
	assert.equal(validateCommitPaths(task, roots, dir, { command: "git commit -m x" }, ["src/a.js"]).ok, true);
	assert.match(
		validateCommitPaths(task, roots, dir, { command: "git commit -m x" }, ["src/locked/x.js"]).reason,
		/commitPaths|forbiddenPaths/,
	);
	assert.match(
		validateCommitPaths(task, roots, dir, { command: "git commit -m x" }, ["other.js"]).reason,
		/commitPaths/,
	);
	assert.match(
		validateCommitPaths({ ...task, commitPaths: [] }, roots, dir, { command: "git commit -m x" }, ["src/a.js"]).reason,
		/commitPaths 为空/,
	);
});
