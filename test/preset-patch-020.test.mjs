// EXE-BOOT-034 · apply-preset-patch 0.2.0 profile-patch 通道（同 id 覆盖形态）功能测试＋老通道沙箱回归。
//
// 用户方向性终裁（EXE-BOOT-034）：菜单仅官方预设原样、官方模式选中时我方 compact-router 在场——
// 031 的平行变体形态（新 id xiaobai-compact-*）移除，输出改判为**同 id 覆盖行**：
//   { id: <基底外层行 id>, name: <同>, config: <基底 config 全量拷贝、仅 compaction 成员同位替换> }
// 宿主语义依据（EXE-BOOT-034 T0 代码级＋实测）：dsh-app-boot applyEntryPatches 非 insert 行按
// entry id 替换所供字段、config 整体替换不深合并、name 失配护栏、目标缺失 warn+skip；
// 覆盖行在场时菜单零新增条目（032/033 形态的用户可见变化＝对外 CHANGELOG 条目）。
//
// 钉死三件事：
//  ① 020 通道（覆盖形态）：官方三基底覆盖行写入（rowId 保持、config 全量、成员替换、群组壳/兄弟保留）／
//    minimal 可观测跳过／幂等 no-op／基底升级再生／块内编辑 REFUSE（Web 编辑器保护）／
//    外来覆盖行 REFUSE＋遮蔽告警／--undo 外科删块（--only 单块与空表还原）／
//    用户层 insert 基底自动覆盖（来者不拒）＋undo 原行还原／legacy 平行变体 id 跳过注记／
//    版本交叉校验 REFUSE／结构失配 REFUSE／--status 漂移注记（基底上游变更可观测）；
//  ② 老通道（0.1.5 形态）行为不回退：4 状态分类＋marker/backup 台账语义＋用户预设目录发现；
//  ③ 沙箱铁则：全部用例以**脚本副本**运行（marker/backup 台账落临时目录，不触仓库正本），
//    全部环境重定向（DSH_HOME／DSH_INSTALL_DIR／DSH_USER_PRESETS_DIR），零真实 ~/.dsh 接触。
//
// 纯静态＋子进程断言：不 import 生产脚本（其顶层即分发执行），不碰真实家根。

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(REPO_ROOT, "scripts", "apply-preset-patch.mjs");

function sha(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** 脚本副本沙箱：marker/backup 随副本位置走（PLUGIN_DIR＝副本目录的父级）。 */
function makeSandbox(tag) {
  const root = mkdtempSync(join(tmpdir(), "preset-patch-" + tag + "-"));
  const pluginDir = join(root, "plugins");
  mkdirSync(join(pluginDir, "scripts"), { recursive: true });
  const scriptCopy = join(pluginDir, "scripts", "apply-preset-patch.mjs");
  copyFileSync(SCRIPT, scriptCopy);
  return { root, pluginDir, scriptCopy, home: join(root, "home"), patchPath: join(root, "home", "profiles", "web", "cordis.patch.yml") };
}

function baseEnv(root) {
  const env = { ...process.env };
  delete env.DSH_PRESETS_DIR;
  delete env.DSH_USER_PRESETS_DIR;
  env.DSH_HOME = join(root, "home");
  env.DSH_INSTALL_DIR = join(root, "install", "node_modules", "@deepseek-ai", "dsh");
  return env;
}

function run(scriptCopy, args, env) {
  const r = spawnSync(process.execPath, [scriptCopy, ...args], { env, cwd: dirname(scriptCopy), encoding: "utf8" });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** 官方形态微缩 fixture（列位 6/8/10/14/16 与实物一致；群组头距成员 8 行 ≤ 12 行窗）。 */
function presetFileYaml({ rowId, presetId, order, withCompaction = true, rootLevelMember = false }) {
  const lines = [
    "# Agent preset fixture: one `@deepseek-ai/dsh-agent-preset` declaration inserted",
    "- insert:",
    "    - id: " + rowId,
    "      name: '@deepseek-ai/dsh-agent-preset'",
    "      config:",
    "        id: " + presetId,
    "        order: " + order,
    "        plugins:",
    "          - id: persona",
    "            name: '@deepseek-ai/dsh-persona'",
    "            config:",
    "              prefix: You are a coding agent.",
    "          - id: tool-fs",
    "            name: '@deepseek-ai/dsh-tool-fs'",
  ];
  if (withCompaction && !rootLevelMember) {
    lines.push(
      "          - id: compaction",
      "            name: cordis:group",
      "            group: true",
      "            isolate:",
      "              compaction: true",
      "              toolResultPruner: true",
      "            config:",
      "              - id: compaction-basic",
      "                name: '@deepseek-ai/dsh-compaction-basic'",
      "              - id: command-compact",
      "                name: '@deepseek-ai/dsh-command-compact'",
      "              - id: tool-result-pruner",
      "                name: '@deepseek-ai/dsh-compaction-tool-result-pruner'",
      "                config:",
      "                  thresholdChars: 8192",
    );
  }
  if (withCompaction && rootLevelMember) {
    lines.push(
      "          - id: compaction-basic",
      "            name: '@deepseek-ai/dsh-compaction-basic'",
    );
  }
  return lines.join("\n") + "\n";
}

function makeInstall(root, dshVersion = "0.2.0-rc.2", { extraBundlePreset = null } = {}) {
  const dshDir = join(root, "install", "node_modules", "@deepseek-ai", "dsh");
  const baseDir = join(root, "install", "node_modules", "@deepseek-ai", "dsh-base");
  const webappDir = join(root, "install", "node_modules", "@deepseek-ai", "dsh-web-app");
  mkdirSync(dshDir, { recursive: true });
  mkdirSync(baseDir, { recursive: true });
  mkdirSync(join(webappDir, "presets"), { recursive: true });
  writeFileSync(join(dshDir, "package.json"), JSON.stringify({ name: "@deepseek-ai/dsh", version: dshVersion }, null, 2));
  writeFileSync(join(baseDir, "package.json"), JSON.stringify({ name: "@deepseek-ai/dsh-base", version: "0.2.0-rc.2" }, null, 2));
  const patchList = ["./presets/standard.patch.yml", "./presets/ptc.patch.yml", "./presets/minimal.patch.yml", "./presets/cordis.patch.yml"];
  if (extraBundlePreset) patchList.push("./presets/" + extraBundlePreset.filename);
  writeFileSync(
    join(webappDir, "package.json"),
    JSON.stringify({ name: "@deepseek-ai/dsh-web-app", version: "0.2.0-rc.2", dsh: { bundle: { patch: patchList } } }, null, 2),
  );
  writeFileSync(join(webappDir, "presets", "standard.patch.yml"), presetFileYaml({ rowId: "preset-standard", presetId: "standard", order: 1 }));
  writeFileSync(join(webappDir, "presets", "ptc.patch.yml"), presetFileYaml({ rowId: "preset-ptc", presetId: "ptc", order: 2 }));
  writeFileSync(join(webappDir, "presets", "cordis.patch.yml"), presetFileYaml({ rowId: "preset-cordis", presetId: "cordis", order: 4 }));
  writeFileSync(join(webappDir, "presets", "minimal.patch.yml"), presetFileYaml({ rowId: "preset-minimal", presetId: "minimal", order: 3, withCompaction: false }));
  if (extraBundlePreset) {
    writeFileSync(
      join(webappDir, "presets", extraBundlePreset.filename),
      presetFileYaml({ rowId: "preset-broken", presetId: extraBundlePreset.presetId, order: 9, rootLevelMember: true }),
    );
  }
  return webappDir;
}

function makeProfile(root, patchContent = "[]\n") {
  const profileDir = join(root, "home", "profiles", "web");
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(
    join(profileDir, "package.json"),
    JSON.stringify({ name: "dsh-profile-web", private: true, dsh: { profile: { bundles: ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"] } } }, null, 2),
  );
  writeFileSync(join(profileDir, "cordis.patch.yml"), patchContent);
  return profileDir;
}

function blockOf(patchText, blockId) {
  const begin = "# >>> xiaobai-agent preset override BEGIN " + blockId + " ";
  const end = "# <<< xiaobai-agent preset override END " + blockId;
  const at = patchText.indexOf(begin);
  assert.ok(at >= 0, "override block missing: " + blockId);
  const close = patchText.indexOf(end, at);
  assert.ok(close > at, "override block unterminated: " + blockId);
  return patchText.slice(at, close);
}

// ---------------------------------------------------------------- 020 通道（同 id 覆盖形态）

test("020 · 空表 profile 上 apply：三官方同 id 覆盖行写入＋minimal 可观测跳过＋台账与首写备份", () => {
  const sb = makeSandbox("apply");
  makeInstall(sb.root);
  makeProfile(sb.root);
  const r = run(sb.scriptCopy, [], baseEnv(sb.root));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /standard: WRITTEN \(override of bundle @deepseek-ai\/dsh-web-app/);
  assert.match(r.stdout, /ptc: WRITTEN/);
  assert.match(r.stdout, /cordis: WRITTEN/);
  assert.match(r.stdout, /SKIPPED \(no compaction member/);
  const patch = readFileSync(sb.patchPath, "utf8");
  for (const id of ["standard", "ptc", "cordis"]) {
    assert.ok(patch.includes("BEGIN " + id + " "), id);
    assert.ok(patch.includes("END " + id), id);
  }
  assert.ok(!patch.includes("BEGIN minimal"), "minimal must not get an override");
  const std = blockOf(patch, "standard");
  // 同 id 覆盖行形态：外层行 id 保持、config 全量拷贝（id/order 原值）、零新 id、零 name 注入
  assert.ok(std.includes("- id: preset-standard"));
  assert.ok(std.includes("  name: '@deepseek-ai/dsh-agent-preset'"));
  assert.ok(std.includes("    id: standard"));
  assert.ok(std.includes("    order: 1"));
  assert.ok(!/xiaobai-compact/.test(std), "no new-id parallel variant");
  assert.ok(!std.includes("    name: xiaobai compact"), "no display-name injection (official naming inherits)");
  assert.ok(std.includes("          - id: compact-router"));
  assert.ok(/- id: compact-router\n\s+name: 'xiaobai-agent\/compact-router'\n\s+config:\n\s+mode: auto\n\s+fallbackOnRateLimit: true\n\s+archive: true/.test(std));
  assert.ok(std.includes("      - id: compaction\n        name: cordis:group"), "group shell preserved");
  assert.ok(std.includes("      - id: command-compact"), "sibling member preserved");
  assert.ok(!std.includes("compaction-basic"), "member swapped away");
  const state = JSON.parse(readFileSync(join(sb.pluginDir, "preset-patch-state.json"), "utf8"));
  assert.equal(Object.keys(state["020"]).length, 3);
  assert.equal(state["020"].standard.presetId, "standard");
  assert.equal(state["020"].standard.targetRowId, "preset-standard");
  const backup = join(sb.pluginDir, "preset-backups", "profile-cordis-patch.web.bak");
  assert.ok(existsSync(backup));
  assert.equal(readFileSync(backup, "utf8"), "[]\n", "first-write backup holds the pristine profile patch");
  rmSync(sb.root, { recursive: true, force: true });
});

test("020 · 幂等：同内容重跑 no-op 且 profile patch 字节不变", () => {
  const sb = makeSandbox("idem");
  makeInstall(sb.root);
  makeProfile(sb.root);
  const first = run(sb.scriptCopy, [], baseEnv(sb.root));
  assert.equal(first.status, 0);
  const before = readFileSync(sb.patchPath, "utf8");
  const second = run(sb.scriptCopy, [], baseEnv(sb.root));
  assert.equal(second.status, 0, second.stdout);
  assert.ok(!second.stdout.includes("WRITTEN"));
  assert.match(second.stdout, /standard: already applied \(no-op\)/);
  assert.equal(readFileSync(sb.patchPath, "utf8"), before);
  rmSync(sb.root, { recursive: true, force: true });
});

test("020 · 基底升级再生：官方基底变更后重跑 REGENERATED，覆盖行跟随新基底", () => {
  const sb = makeSandbox("regen");
  const webapp = makeInstall(sb.root);
  makeProfile(sb.root);
  assert.equal(run(sb.scriptCopy, [], baseEnv(sb.root)).status, 0);
  const stdPath = join(webapp, "presets", "standard.patch.yml");
  writeFileSync(stdPath, readFileSync(stdPath, "utf8") + "          - id: tool-web\n            name: '@deepseek-ai/dsh-tool-web'\n");
  const r = run(sb.scriptCopy, [], baseEnv(sb.root));
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /standard: REGENERATED \(base changed upstream/);
  assert.match(r.stdout, /ptc: already applied/);
  const std = blockOf(readFileSync(sb.patchPath, "utf8"), "standard");
  assert.ok(std.includes("- id: tool-web"), "regenerated block follows the new base");
  assert.ok(std.includes("- id: compact-router"), "swap preserved after regeneration");
  const state = JSON.parse(readFileSync(join(sb.pluginDir, "preset-patch-state.json"), "utf8"));
  assert.ok(state["020"].standard.previousBlockSha);
  rmSync(sb.root, { recursive: true, force: true });
});

test("020 · 块内编辑 REFUSE：覆盖行被手改（如 Web 编辑器原地覆写 config）后重跑拒写且用户改动保留", () => {
  const sb = makeSandbox("inplace");
  makeInstall(sb.root);
  makeProfile(sb.root);
  assert.equal(run(sb.scriptCopy, [], baseEnv(sb.root)).status, 0);
  const before = readFileSync(sb.patchPath, "utf8");
  writeFileSync(sb.patchPath, before.replace("          prefix: You are a coding agent.", "          prefix: Editor tweaked."));
  const r = run(sb.scriptCopy, [], baseEnv(sb.root));
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /standard: REFUSED — existing block differs from both the ledger/);
  assert.ok(readFileSync(sb.patchPath, "utf8").includes("Editor tweaked."), "user edit kept untouched");
  rmSync(sb.root, { recursive: true, force: true });
});

test("020 · 外来覆盖行 REFUSE：标记块外同 id config 行（Web 编辑器独立写入形态）拒遮蔽＋status 遮蔽告警", () => {
  const sb = makeSandbox("foreign");
  makeInstall(sb.root);
  makeProfile(sb.root);
  assert.equal(run(sb.scriptCopy, [], baseEnv(sb.root)).status, 0);
  const editorRow = [
    "- id: preset-ptc",
    "  name: '@deepseek-ai/dsh-agent-preset'",
    "  config:",
    "    id: ptc",
    "    order: 2",
    "    plugins:",
    "      - id: persona",
    "        name: '@deepseek-ai/dsh-persona'",
  ].join("\n");
  const before = readFileSync(sb.patchPath, "utf8");
  writeFileSync(sb.patchPath, before.replace(/[ \t\r\n]+$/, "") + "\n\n" + editorRow + "\n");
  const r = run(sb.scriptCopy, [], baseEnv(sb.root));
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /ptc\.patch\.yml[^]*profile patch already carries a config override row for preset-ptc[^]*refusing to shadow it/);
  assert.match(r.stdout, /standard: already applied \(no-op\)/, "other bases unaffected");
  const after = readFileSync(sb.patchPath, "utf8");
  assert.ok(after.includes(editorRow), "foreign row untouched");
  const s = run(sb.scriptCopy, ["--status"], baseEnv(sb.root));
  assert.match(s.stdout, /WARNING: an earlier-written block for ptc is still on file and may be shadowed/);
  assert.match(s.stdout, /WARNING: ptc [^]*carries a later config override[^]*wins at runtime/);
  rmSync(sb.root, { recursive: true, force: true });
});

test("020 · --undo 外科删块：全部回退后空表还原，--only 单块回退不伤他块", () => {
  const sb = makeSandbox("undo");
  makeInstall(sb.root);
  makeProfile(sb.root);
  assert.equal(run(sb.scriptCopy, [], baseEnv(sb.root)).status, 0);
  const full = run(sb.scriptCopy, ["--undo"], baseEnv(sb.root));
  assert.equal(full.status, 0, full.stdout);
  assert.match(full.stdout, /standard: RESTORED/);
  const afterFull = readFileSync(sb.patchPath, "utf8");
  assert.ok(!afterFull.includes("xiaobai-agent preset override BEGIN"), "all blocks removed");
  assert.match(afterFull, /\[\]/, "empty-flow restored for the host");
  assert.equal(Object.keys(JSON.parse(readFileSync(join(sb.pluginDir, "preset-patch-state.json"), "utf8"))["020"]).length, 0);

  assert.equal(run(sb.scriptCopy, [], baseEnv(sb.root)).status, 0);
  const only = run(sb.scriptCopy, ["--undo", "--only", "ptc"], baseEnv(sb.root));
  assert.equal(only.status, 0, only.stdout);
  const afterOnly = readFileSync(sb.patchPath, "utf8");
  assert.ok(!afterOnly.includes("BEGIN ptc "));
  assert.ok(afterOnly.includes("BEGIN standard "), "siblings kept");
  const r2 = run(sb.scriptCopy, ["--undo", "--only", "ptc"], baseEnv(sb.root));
  assert.equal(r2.status, 2, "unknown override id exits 2 after the block is gone");
  rmSync(sb.root, { recursive: true, force: true });
});

test("020 · 来者不拒（覆盖形态）：profile patch 用户层 insert 基底被枚举并同 id 覆盖（原行零触碰、单条目、undo 原样还原）", () => {
  const sb = makeSandbox("synth");
  makeInstall(sb.root);
  const userRow = [
    "# user demo preset (synthetic base)",
    "- insert:",
    "    - id: user-demo-row",
    "      name: '@deepseek-ai/dsh-agent-preset'",
    "      config:",
    "        id: user-demo",
    "        name: user demo",
    "        order: 7",
    "        plugins:",
    "          - id: persona",
    "            name: '@deepseek-ai/dsh-persona'",
    "          - id: compaction",
    "            name: cordis:group",
    "            group: true",
    "            isolate:",
    "              compaction: true",
    "            config:",
    "              - id: compaction-basic",
    "                name: '@deepseek-ai/dsh-compaction-basic'",
  ].join("\n") + "\n";
  makeProfile(sb.root, userRow);
  const r = run(sb.scriptCopy, [], baseEnv(sb.root));
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /user-demo: WRITTEN \(override of profile patch row 'user-demo-row'\)/);
  const patch = readFileSync(sb.patchPath, "utf8");
  const block = blockOf(patch, "user-demo");
  assert.ok(block.includes("- id: user-demo-row"), "override targets the user row's entry id");
  assert.ok(block.includes("            name: 'xiaobai-agent/compact-router'"));
  assert.ok(block.includes("    name: user demo"), "base display fields copied wholesale");
  assert.ok(block.includes("    order: 7"), "base order copied (no +20)");
  assert.ok(!block.includes("compaction-basic"));
  assert.ok(patch.includes("        id: user-demo"), "user-layer base row itself untouched");
  assert.ok(patch.includes("- id: compaction-basic"), "base row keeps its member");
  const undo = run(sb.scriptCopy, ["--undo", "--only", "user-demo"], baseEnv(sb.root));
  assert.equal(undo.status, 0, undo.stdout);
  const after = readFileSync(sb.patchPath, "utf8");
  assert.ok(!after.includes("BEGIN user-demo "), "override block removed");
  assert.ok(after.includes(userRow.trim()), "user-layer base row byte-intact after undo");
  rmSync(sb.root, { recursive: true, force: true });
});

test("020 · 版本交叉校验：安装树 0.1.x＋显式 DSH_HOME ⇒ REFUSE，绝不静默回退老通道", () => {
  const sb = makeSandbox("ver");
  makeInstall(sb.root, "0.1.5-rc.1");
  makeProfile(sb.root);
  const bare = run(sb.scriptCopy, [], baseEnv(sb.root));
  assert.equal(bare.status, 2, bare.stdout);
  assert.match(bare.stdout, /REFUSED/);
  assert.match(bare.stdout, /not 0\.2\.x/);
  assert.equal(readFileSync(sb.patchPath, "utf8"), "[]\n", "no write happened");
  const forced = run(sb.scriptCopy, ["--profile-patch"], baseEnv(sb.root));
  assert.equal(forced.status, 2);
  rmSync(sb.root, { recursive: true, force: true });
});

test("020 · 结构失配 REFUSE：根级 compaction 成员（无群组壳）拒绝，他基底照常写入", () => {
  const sb = makeSandbox("struct");
  makeInstall(sb.root, "0.2.0-rc.2", { extraBundlePreset: { filename: "broken.patch.yml", presetId: "broken" } });
  makeProfile(sb.root);
  const r = run(sb.scriptCopy, [], baseEnv(sb.root));
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /broken\.patch\.yml[^]*not inside a recognized cordis:group group/);
  assert.match(r.stdout, /standard: WRITTEN/, "healthy bases unaffected");
  const patch = readFileSync(sb.patchPath, "utf8");
  assert.ok(!patch.includes("BEGIN broken "), "no blind write for the malformed base");
  rmSync(sb.root, { recursive: true, force: true });
});

test("020 · legacy 平行变体 id：xiaobai-compact 前缀行按遗留物跳过注记（不作为基底、不写入）", () => {
  const sb = makeSandbox("legacyid");
  makeInstall(sb.root);
  const leftover = [
    "# leftover pre-034 parallel variant row (marker shell deleted by hand)",
    "- insert:",
    "    - id: xiaobai-compact-evil",
    "      name: '@deepseek-ai/dsh-agent-preset'",
    "      config:",
    "        id: xiaobai-compact-evil",
    "        name: xiaobai compact (evil)",
    "        order: 29",
    "        plugins:",
    "          - id: persona",
    "            name: '@deepseek-ai/dsh-persona'",
    "          - id: compaction",
    "            name: cordis:group",
    "            group: true",
    "            isolate:",
    "              compaction: true",
    "            config:",
    "              - id: compact-router",
    "                name: 'xiaobai-agent/compact-router'",
  ].join("\n") + "\n";
  makeProfile(sb.root, leftover);
  const r = run(sb.scriptCopy, [], baseEnv(sb.root));
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /legacy pre-034 parallel-variant id 'xiaobai-compact-evil'; not a base/);
  assert.ok(!readFileSync(sb.patchPath, "utf8").includes("BEGIN xiaobai-compact-evil "), "no override for the leftover row");
  assert.match(r.stdout, /standard: WRITTEN/, "healthy bases unaffected");
  rmSync(sb.root, { recursive: true, force: true });
});

test("020 · 同 bundle 的 web patch 层（含 agent-preset-registry 服务行）不算预设基底，不误触发 REFUSE", () => {
  const sb = makeSandbox("webpatch");
  const webapp = makeInstall(sb.root);
  writeFileSync(
    join(webapp, "cordis.patch.yml"),
    [
      "- insert:",
      "    - id: web-ui-settings",
      "      name: '@deepseek-ai/dsh-client-ui-settings'",
      "- insert:",
      "    - id: agent-preset-registry",
      "      name: '@deepseek-ai/dsh-agent-preset-registry'",
    ].join("\n") + "\n",
  );
  const pkgPath = join(webapp, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  pkg.dsh.bundle.patch = ["./cordis.patch.yml", ...pkg.dsh.bundle.patch];
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
  makeProfile(sb.root);
  const r = run(sb.scriptCopy, [], baseEnv(sb.root));
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /standard: WRITTEN/);
  assert.ok(!r.stdout.includes("REFUSED"), "web patch layer must not be treated as a preset base");
  rmSync(sb.root, { recursive: true, force: true });
});

test("020 · --status：absent→applied 可观测；基底上游漂移出注记（漂移观察项）", () => {
  const sb = makeSandbox("status");
  makeInstall(sb.root);
  makeProfile(sb.root);
  const before = run(sb.scriptCopy, ["--status"], baseEnv(sb.root));
  assert.equal(before.status, 0);
  assert.match(before.stdout, /standard \(override of bundle [^]*\): absent/);
  assert.match(before.stdout, /SKIPPED \(no compaction member/);
  assert.equal(run(sb.scriptCopy, [], baseEnv(sb.root)).status, 0);
  const after = run(sb.scriptCopy, ["--status"], baseEnv(sb.root));
  assert.match(after.stdout, /standard \(override of bundle [^]*\): applied/);
  assert.match(after.stdout, /ptc \(override of bundle [^]*\): applied/);
  assert.ok(!after.stdout.includes("base source changed"), "no drift note before the base moves");
  const webapp = join(sb.root, "install", "node_modules", "@deepseek-ai", "dsh-web-app");
  const stdPath = join(webapp, "presets", "standard.patch.yml");
  writeFileSync(stdPath, readFileSync(stdPath, "utf8") + "          - id: tool-web\n            name: '@deepseek-ai/dsh-tool-web'\n");
  const drifted = run(sb.scriptCopy, ["--status"], baseEnv(sb.root));
  assert.match(drifted.stdout, /standard \(override of bundle [^]*\): applied/);
  assert.match(drifted.stdout, /standard \(note: base source changed since apply; re-apply to follow upstream\)/);
  rmSync(sb.root, { recursive: true, force: true });
});

test("020 · 不平衡 marker ⇒ 全命令 REFUSE exit 2（status/apply/undo 统一预检）", () => {
  const sb = makeSandbox("unbal");
  makeInstall(sb.root);
  makeProfile(sb.root, "# >>> xiaobai-agent preset override BEGIN orphan (dangling)\n- id: preset-orphan\n");
  const r = run(sb.scriptCopy, [], baseEnv(sb.root));
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stdout, /unbalanced override marker block/);
  const s = run(sb.scriptCopy, ["--status"], baseEnv(sb.root));
  assert.equal(s.status, 2);
  const u = run(sb.scriptCopy, ["--undo"], baseEnv(sb.root));
  assert.equal(u.status, 2);
  rmSync(sb.root, { recursive: true, force: true });
});

// ---------------------------------------------------------------- 老通道（0.1.5 形态）不回退

const LEGACY_PRESET_YAML = [
  "# fixture shipped preset",
  "agent:",
  "  plugins:",
  "    - id: persona",
  "      name: '@deepseek-ai/dsh-persona'",
  "    - id: compaction-basic",
  "      name: '@deepseek-ai/dsh-compaction-basic'",
].join("\n") + "\n";

const LIANGSHEN_LIKE_YAML = [
  "# liangshen-like user preset (old-route row already in place)",
  "agent:",
  "  plugins:",
  "    - id: persona",
  "      name: '@deepseek-ai/dsh-persona'",
  "    - id: compact-router",
  "      name: '@local/dsh-toolkit/compact-router'",
  "      config:",
  "        mode: auto",
].join("\n") + "\n";

const OLDPLUG_LIKE_YAML = [
  "# old-plugin-era user preset",
  "agent:",
  "  plugins:",
  "    - id: persona",
  "      name: '@deepseek-ai/dsh-persona'",
  "    - id: compact-router",
  "      name: '@local/dsh-compact-router'",
  "      config:",
  "        mode: auto",
].join("\n") + "\n";

function makeLegacySandbox(tag) {
  const sb = makeSandbox(tag);
  const presetsDir = join(sb.root, "presets");
  const userPresetsDir = join(sb.root, "userpresets");
  for (const id of ["standard", "ptc", "cordis"]) {
    mkdirSync(join(presetsDir, id), { recursive: true });
    writeFileSync(join(presetsDir, id, "agent.cordis.yml"), LEGACY_PRESET_YAML);
  }
  for (const [name, content] of [["liangshen", LIANGSHEN_LIKE_YAML], ["oldplug", OLDPLUG_LIKE_YAML]]) {
    mkdirSync(join(userPresetsDir, name), { recursive: true });
    writeFileSync(join(userPresetsDir, name, "agent.cordis.yml"), content);
  }
  const env = { ...process.env };
  delete env.DSH_HOME;
  delete env.DSH_INSTALL_DIR;
  delete env.DSH_PRESETS_DIR;
  env.DSH_USER_PRESETS_DIR = userPresetsDir;
  return { ...sb, presetsDir, userPresetsDir, env };
}

test("legacy · apply：三 shipped PATCHED＋unknown/old-plugin 用户件 REFUSED＋台账备份语义", () => {
  const sb = makeLegacySandbox("legacy-apply");
  const r = run(sb.scriptCopy, ["--presets-dir", sb.presetsDir], sb.env);
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /presets dir: /);
  assert.match(r.stdout, new RegExp("user presets dir: " + sb.userPresetsDir.replace(/[\\/]/g, "[\\\\/]")));
  for (const id of ["standard", "ptc", "cordis"]) assert.match(r.stdout, new RegExp(id + ": PATCHED"));
  assert.match(r.stdout, /liangshen: REFUSED — expected row not found/);
  assert.match(r.stdout, /oldplug: REFUSED — preset still carries old/);
  for (const id of ["standard", "ptc", "cordis"]) {
    const patched = readFileSync(join(sb.presetsDir, id, "agent.cordis.yml"), "utf8");
    assert.ok(patched.includes("name: 'xiaobai-agent/compact-router'"), id);
    assert.ok(patched.includes("C:\\Users\\LENOVO\\.agent-memory"), id);
    assert.ok(existsSync(join(sb.pluginDir, "preset-backups", id + ".agent.cordis.yml.bak")));
  }
  assert.equal(readFileSync(join(sb.userPresetsDir, "liangshen", "agent.cordis.yml"), "utf8"), LIANGSHEN_LIKE_YAML, "unknown user preset untouched");
  const marker = JSON.parse(readFileSync(join(sb.pluginDir, "preset-patch-state.json"), "utf8"));
  assert.equal(Object.keys(marker).filter((k) => k !== "020").length, 3);
  rmSync(sb.root, { recursive: true, force: true });
});

test("legacy · 幂等与 --undo 回退：restored 字节级还原；unknown/old-plugin 恒不触碰", () => {
  const sb = makeLegacySandbox("legacy-undo");
  assert.equal(run(sb.scriptCopy, ["--presets-dir", sb.presetsDir], sb.env).status, 1);
  const again = run(sb.scriptCopy, ["--presets-dir", sb.presetsDir], sb.env);
  for (const id of ["standard", "ptc", "cordis"]) assert.match(again.stdout, new RegExp(id + ": already patched \\(no-op\\)"));

  const undo = run(sb.scriptCopy, ["--undo", "--presets-dir", sb.presetsDir], sb.env);
  assert.equal(undo.status, 0, undo.stdout);
  for (const id of ["standard", "ptc", "cordis"]) {
    assert.match(undo.stdout, new RegExp(id + ": RESTORED from backup"));
    assert.equal(readFileSync(join(sb.presetsDir, id, "agent.cordis.yml"), "utf8"), LEGACY_PRESET_YAML, id + " byte-identical restore");
  }
  assert.equal(readFileSync(join(sb.userPresetsDir, "liangshen", "agent.cordis.yml"), "utf8"), LIANGSHEN_LIKE_YAML);
  assert.equal(readFileSync(join(sb.userPresetsDir, "oldplug", "agent.cordis.yml"), "utf8"), OLDPLUG_LIKE_YAML);
  const marker = JSON.parse(readFileSync(join(sb.pluginDir, "preset-patch-state.json"), "utf8"));
  assert.equal(Object.keys(marker).filter((k) => k !== "020").length, 0);
  rmSync(sb.root, { recursive: true, force: true });
});

test("legacy · 台账 patchedSha 路径：ledger 在案即 no-op（liangshen 现网形态复现）", () => {
  const sb = makeLegacySandbox("legacy-ledger");
  writeFileSync(
    join(sb.pluginDir, "preset-patch-state.json"),
    JSON.stringify({ liangshen: { file: join(sb.userPresetsDir, "liangshen", "agent.cordis.yml"), patchedSha: sha(LIANGSHEN_LIKE_YAML) } }, null, 2),
  );
  const status = run(sb.scriptCopy, ["--status", "--presets-dir", sb.presetsDir], sb.env);
  assert.match(status.stdout, /liangshen: patched/);
  const r = run(sb.scriptCopy, ["--presets-dir", sb.presetsDir], sb.env);
  assert.match(r.stdout, /liangshen: already patched \(no-op\)/);
  assert.equal(readFileSync(join(sb.userPresetsDir, "liangshen", "agent.cordis.yml"), "utf8"), LIANGSHEN_LIKE_YAML);
  rmSync(sb.root, { recursive: true, force: true });
});

test("legacy · 环境重定向即通道判定：DSH_PRESETS_DIR 在设 ⇒ 老通道（沙箱零真实文件接触）", () => {
  const sb = makeLegacySandbox("legacy-env");
  const env = sb.env;
  env.DSH_PRESETS_DIR = sb.presetsDir; // env 形态（非旗标）也应进老通道
  const r = run(sb.scriptCopy, [], env);
  assert.match(r.stdout, /presets dir: /);
  assert.match(r.stdout, /standard: PATCHED/);
  rmSync(sb.root, { recursive: true, force: true });
});
