import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 装配守卫（审查意见 P0-2 的最小面）：钉住「仓库自身装配挂载四个闸门入口」这一事实，
// 防止装配文件与模块自述再次漂移。行为级测试见同目录其余 governance-output-gate-*。
const ROOT = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const GATE_DIR = path.join(ROOT, "lib", "governance-output-gate");

// AGENTS.md §1: sibling plugins are probed at runtime, never statically imported.
const [index, guard, text, tools] = await Promise.all([
	import("../lib/governance-output-gate/lib/index.js"),
	import("../lib/governance-output-gate/lib/gate-guard.js"),
	import("../lib/governance-output-gate/lib/gate-text.js"),
	import("../lib/governance-output-gate/lib/gate-tools.js"),
]);

const ENTRIES = [
	{ key: "index", mod: index, id: "governance-output-gate", subpath: "." },
	{ key: "gate-guard", mod: guard, id: "governance-output-gate-guard", subpath: "./gate-guard" },
	{ key: "gate-text", mod: text, id: "governance-output-gate-text", subpath: "./gate-text" },
	{ key: "gate-tools", mod: tools, id: "governance-output-gate-tools", subpath: "./gate-tools" },
];

function insertBlocks(text) {
	return text
		.split(/^- insert:\s*$/m)
		.slice(1)
		.map((block) => {
			const id = /id:\s*(\S+)/.exec(block)?.[1] ?? "";
			const name = /name:\s*'([^']+)'/.exec(block)?.[1] ?? "";
			const inject = /inject:\s*\[([^\]]*)\]/.exec(block)?.[1] ?? "";
			return { id, name, inject: inject.split(",").map((s) => s.trim()).filter(Boolean) };
		});
}

test("四个闸门入口模块的 name/inject 自述与装配一致", () => {
	for (const entry of ENTRIES) {
		assert.equal(typeof entry.mod.name, "string", entry.key + " 缺 name 导出");
		assert.ok(Array.isArray(entry.mod.inject), entry.key + " 缺 inject 导出");
		assert.ok(typeof entry.mod.apply === "function", entry.key + " 缺 apply 导出");
	}
	assert.equal(index.name, "governance-output-gate");
	assert.equal(guard.name, "governance-output-gate-guard");
	assert.equal(text.name, "governance-output-gate-text");
	assert.equal(tools.name, "governance-output-gate-tools");
});

test("子包 package.json exports 暴露全部四个入口", () => {
	const pkg = JSON.parse(fs.readFileSync(path.join(GATE_DIR, "package.json"), "utf8"));
	for (const entry of ENTRIES) {
		assert.equal(pkg.exports[entry.subpath], "./lib/" + entry.key + ".js",
			entry.subpath + " 未暴露或指向错误文件");
	}
});

test("bundle.patch.yml 挂载四个入口且 inject 与模块自述逐字一致", () => {
	const raw = fs.readFileSync(path.join(GATE_DIR, "bundle.patch.yml"), "utf8");
	const blocks = insertBlocks(raw);
	assert.equal(blocks.length, ENTRIES.length);
	for (const entry of ENTRIES) {
		const hit = blocks.find((b) => b.id === entry.id);
		assert.ok(hit, "bundle.patch.yml 缺 insert: " + entry.id);
		assert.ok(
			hit.name === "xiaobai-agent/governance-output-gate" || hit.name.endsWith("/" + entry.key),
			entry.id + " name 与模块不符: " + hit.name,
		);
		assert.deepEqual(hit.inject, entry.mod.inject, entry.id + " inject 与模块自述不一致");
	}
});

test("cordis.patch.yml 模板同样挂载四个入口", () => {
	const raw = fs.readFileSync(path.join(ROOT, "cordis.patch.yml"), "utf8");
	const blocks = insertBlocks(raw);
	for (const entry of ENTRIES) {
		const hit = blocks.find((b) => b.id === entry.id);
		assert.ok(hit, "cordis.patch.yml 缺 insert: " + entry.id);
		assert.deepEqual(hit.inject, entry.mod.inject, entry.id + " inject 与模块自述不一致");
	}
});
