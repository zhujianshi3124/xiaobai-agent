import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// P1-2 / P1-3（复审核意见，2026-11-01）回归钉：
//   P1-2 — 写工具集合单一事实源：gate-guard.WRITE_TOOL_NAMES（含 str_replace_editor）
//          必须就是 gate-tools 决策用的 WRITE_TOOLS；gate-journal 不得再持字面量副本。
//   P1-3 — push 判定按命令段解析：dry-run 只在同段才算数；解析不出边界即 fail-closed。
const ROOT = path.resolve(fileURLToPath(new URL("../", import.meta.url)));

const { WRITE_TOOL_NAMES } = await import("../lib/governance-output-gate/lib/gate-guard.js");
const { WRITE_TOOLS, shellSegments, pushGateRequired } = await import("../lib/governance-output-gate/lib/gate-tools.js");

test("写工具集合单一事实源：gate-tools 决策集合 == gate-guard.WRITE_TOOL_NAMES（同一对象）", () => {
	assert.equal(WRITE_TOOLS, WRITE_TOOL_NAMES, "gate-tools 必须直接引用 gate-guard 的集合，不得另立副本");
	assert.ok(WRITE_TOOL_NAMES.has("str_replace_editor"), "集合缺 str_replace_editor（P1-2 漏洞本体）");
});

test("gate-journal 不再自带写工具名单字面量副本", () => {
	const raw = fs.readFileSync(path.join(ROOT, "lib", "governance-output-gate", "lib", "gate-journal.mjs"), "utf8");
	assert.equal(/new Set\(\s*\[\s*"write"/.test(raw), false, "gate-journal.mjs 又出现了本地写工具集合");
	assert.match(raw, /WRITE_TOOL_NAMES/, "gate-journal.mjs 应引用单一事实源");
});

test("shellSegments：按 ; & | 与换行切分，引号内分隔符不切，引号不配对返回 null", () => {
	assert.deepEqual(shellSegments("git push origin main; echo --dry-run"), ["git push origin main", "echo --dry-run"]);
	assert.deepEqual(shellSegments("a && b || c"), ["a ", " b ", " c"].map((s) => s.trim()));
	assert.deepEqual(shellSegments('echo "a;b|c" && d'), ['echo "a;b|c" ', "d"].map((s) => s.trim()));
	assert.deepEqual(shellSegments("echo 'x&&y'"), ["echo 'x&&y'"]);
	assert.equal(shellSegments('git push "origin main; echo --dry-run'), null, "引号不配对必须返回 null");
	assert.deepEqual(shellSegments(""), []);
});

test("pushGateRequired：dry-run 只在同段生效；真 push 与解析失败都要闸", () => {
	// 真push + 别段 dry-run ⇒ 闸（P1-3 漏洞本体）
	assert.equal(pushGateRequired("git push origin main; echo --dry-run"), true);
	// 真 push && dry-run push 复合 ⇒ 闸（第一段是真 push）
	assert.equal(pushGateRequired("git push origin main && git push --dry-run origin main"), true);
	// 全部段都是 dry-run ⇒ 不闸（行为保持）
	assert.equal(pushGateRequired("git push --dry-run origin main"), false);
	assert.equal(pushGateRequired("git push --dry-run origin main && git push --dry-run origin main"), false);
	// 没有 push ⇒ 不闸
	assert.equal(pushGateRequired("git commit -m x; echo --dry-run"), false);
	// 引号不配对且含 push 字样 ⇒ null（调用点按闸处理，fail-closed）
	assert.equal(pushGateRequired('git push "origin main; echo --dry-run'), null);
});
