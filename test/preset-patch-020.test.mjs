// EXE-BOOT-031 · apply-preset-patch 0.2.0 profile-patch 通道功能测试＋老通道沙箱回归。
//
// 钉死三件事：
//  ① 020 通道：官方三基底变体写入／minimal 可观测跳过／幂等 no-op／基底升级再生／
//    台账外差异 REFUSE（Web 编辑器改动保护）／--undo 外科删块（含 --only 单块与空表还原）／
//    合成用户层基底自动适配（来者不拒）／版本交叉校验 REFUSE／结构失配 REFUSE／命名空间守卫；
//  ② 老通道（0.1.5 形态）行为不回退：4 状态分类（unpatched→PATCHED／patched no-op／
//    unknown REFUSED／old-plugin REFUSED）＋marker/backup 台账语义＋用户预设目录发现；
//  ③ 沙箱铁则：全部用例以**脚本副本**运行（marker/backup 台账落临时目录，不触仓库正本），
//    全部环境重定向（DSH_HOME／DSH_INSTALL_DIR／DSH_USER_PRESETS_DIR），零真实 ~/.dsh 接触。
//
// 纯静态＋子进程断言：不 import 生产脚本（其顶层即分发执行），不碰真实家根。
// 机制依据：docs 设计稿 v2 §七（EXE-BOOT-031）＋ t0 实勘读数。

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

function blockOf(patchText, variantId) {
  const begin = "# >>> xiaobai-agent preset variant BEGIN " + variantId + " ";
  const end = "# <<< xiaobai-agent preset variant END " + variantId;
  const at = patchText.indexOf(begin);
  assert.ok(at >= 0, "variant block missing: " + variantId);
  const close = patchText.indexOf(end, at);
  assert.ok(close > at, "variant block unterminated: " + variantId);
  return patchText.slice(at, close);
}

// ---------------------------------------------------------------- 020 通道

test("020 · 空表 profile 上 apply：三官方变体写入＋minimal 可观测跳过＋台账与首写备份", () => {
  const sb = makeSandbox("apply");
  makeInstall(sb.root);
  makeProfile(sb.root);
  const r = run(sb.scriptCopy, [], baseEnv(sb.root));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /xiaobai-compact-standard: WRITTEN \(variant of bundle @deepseek-ai\/dsh-web-app/);
  assert.match(r.stdout, /xiaobai-compact-ptc: WRITTEN/);
  assert.match(r.stdout, /xiaobai-compact-cordis: WRITTEN/);
  assert.match(r.stdout, /SKIPPED \(no compaction member/);
  const patch = readFileSync(sb.patchPath, "utf8");
  for (const id of ["xiaobai-compact-standard", "xiaobai-compact-ptc", "xiaobai-compact-cordis"]) {
    assert.ok(patch.includes("BEGIN " + id + " "), id);
    assert.ok(patch.includes("END " + id), id);
  }
  assert.ok(!patch.includes("xiaobai-compact-minimal"), "minimal must not get a variant");
  const std = blockOf(patch, "xiaobai-compact-standard");
  assert.ok(std.includes("        id: xiaobai-compact-standard"));
  assert.ok(std.includes("        name: xiaobai compact (standard)"));
  assert.ok(std.includes("        order: 21"));
  assert.ok(std.includes("          - id: compact-router"));
  assert.ok(/- id: compact-router\n\s+name: 'xiaobai-agent\/compact-router'\n\s+config:\n\s+mode: auto\n\s+fallbackOnRateLimit: true\n\s+archive: true/.test(std));
  assert.ok(std.includes("          - id: compaction\n            name: cordis:group"), "group shell preserved");
  assert.ok(std.includes("          - id: command-compact"), "sibling member preserved");
  assert.ok(!std.includes("compaction-basic"), "member swapped away");
  const state = JSON.parse(readFileSync(join(sb.pluginDir, "preset-patch-state.json"), "utf8"));
  assert.equal(Object.keys(state["020"]).length, 3);
  assert.equal(state["020"]["xiaobai-compact-standard"].presetId, "xiaobai-compact-standard");
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
  assert.match(second.stdout, /xiaobai-compact-standard: already applied \(no-op\)/);
  assert.equal(readFileSync(sb.patchPath, "utf8"), before);
  rmSync(sb.root, { recursive: true, force: true });
});

test("020 · 基底升级再生：官方基底变更后重跑 REGENERATED，文件仍与我上次所写时才动手", () => {
  const sb = makeSandbox("regen");
  const webapp = makeInstall(sb.root);
  makeProfile(sb.root);
  assert.equal(run(sb.scriptCopy, [], baseEnv(sb.root)).status, 0);
  const stdPath = join(webapp, "presets", "standard.patch.yml");
  writeFileSync(stdPath, readFileSync(stdPath, "utf8") + "          - id: tool-web\n            name: '@deepseek-ai/dsh-tool-web'\n");
  const r = run(sb.scriptCopy, [], baseEnv(sb.root));
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /xiaobai-compact-standard: REGENERATED \(base changed upstream/);
  assert.match(r.stdout, /xiaobai-compact-ptc: already applied/);
  const std = blockOf(readFileSync(sb.patchPath, "utf8"), "xiaobai-compact-standard");
  assert.ok(std.includes("- id: tool-web"), "regenerated block follows the new base");
  const state = JSON.parse(readFileSync(join(sb.pluginDir, "preset-patch-state.json"), "utf8"));
  assert.ok(state["020"]["xiaobai-compact-standard"].previousVariantSha);
  rmSync(sb.root, { recursive: true, force: true });
});

test("020 · 台账外差异 REFUSE：变体块被手改（如 Web 编辑器覆写）后重跑拒写且原块保留", () => {
  const sb = makeSandbox("foreign");
  makeInstall(sb.root);
  makeProfile(sb.root);
  assert.equal(run(sb.scriptCopy, [], baseEnv(sb.root)).status, 0);
  const before = readFileSync(sb.patchPath, "utf8");
  writeFileSync(sb.patchPath, before.replace("        order: 21", "        order: 99"));
  const r = run(sb.scriptCopy, [], baseEnv(sb.root));
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /xiaobai-compact-standard: REFUSED — existing block differs from both the ledger/);
  assert.ok(readFileSync(sb.patchPath, "utf8").includes("        order: 99"), "user edit kept untouched");
  rmSync(sb.root, { recursive: true, force: true });
});

test("020 · --undo 外科删块：全部回退后空表还原，--only 单块回退不伤他块", () => {
  const sb = makeSandbox("undo");
  makeInstall(sb.root);
  makeProfile(sb.root);
  assert.equal(run(sb.scriptCopy, [], baseEnv(sb.root)).status, 0);
  const full = run(sb.scriptCopy, ["--undo"], baseEnv(sb.root));
  assert.equal(full.status, 0, full.stdout);
  assert.match(full.stdout, /xiaobai-compact-standard: RESTORED/);
  const afterFull = readFileSync(sb.patchPath, "utf8");
  assert.ok(!afterFull.includes("xiaobai-agent preset variant BEGIN"), "all blocks removed");
  assert.match(afterFull, /\[\]/, "empty-flow restored for the host");
  assert.equal(Object.keys(JSON.parse(readFileSync(join(sb.pluginDir, "preset-patch-state.json"), "utf8"))["020"]).length, 0);

  assert.equal(run(sb.scriptCopy, [], baseEnv(sb.root)).status, 0);
  const only = run(sb.scriptCopy, ["--undo", "--only", "xiaobai-compact-ptc"], baseEnv(sb.root));
  assert.equal(only.status, 0, only.stdout);
  const afterOnly = readFileSync(sb.patchPath, "utf8");
  assert.ok(!afterOnly.includes("BEGIN xiaobai-compact-ptc "));
  assert.ok(afterOnly.includes("BEGIN xiaobai-compact-standard "), "siblings kept");
  const r2 = run(sb.scriptCopy, ["--undo", "--only", "xiaobai-compact-ptc"], baseEnv(sb.root));
  assert.equal(r2.status, 2, "unknown variant id exits 2 after the block is gone");
  rmSync(sb.root, { recursive: true, force: true });
});

test("020 · 来者不拒：profile patch 用户层合成基底被枚举并自动生成变体（原行零触碰）", () => {
  const sb = makeSandbox("synth");
  makeInstall(sb.root);
  const userRow = [
    "# user demo preset (synthetic base)",
    "- insert:",
    "    - id: user-demo-row",
    "      name: '@deepseek-ai/dsh-agent-preset'",
    "      config:",
    "        id: user-demo",
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
  assert.match(r.stdout, /xiaobai-compact-user-demo: WRITTEN \(variant of profile patch row 'user-demo-row'\)/);
  const patch = readFileSync(sb.patchPath, "utf8");
  const variant = blockOf(patch, "xiaobai-compact-user-demo");
  assert.ok(variant.includes("            name: 'xiaobai-agent/compact-router'"));
  assert.ok(variant.includes("        order: 27"), "base order 7 + 20");
  assert.ok(!variant.includes("compaction-basic"));
  assert.ok(patch.includes("        id: user-demo"), "user-layer base row itself untouched");
  assert.ok(patch.includes("- id: compaction-basic"), "base row keeps its member");
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
  assert.ok(!existsSync(sb.patchPath.replace("cordis.patch.yml", "")) === false);
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
  assert.match(r.stdout, /xiaobai-compact-standard: WRITTEN/, "healthy bases unaffected");
  const patch = readFileSync(sb.patchPath, "utf8");
  assert.ok(!patch.includes("xiaobai-compact-broken"), "no blind write for the malformed base");
  rmSync(sb.root, { recursive: true, force: true });
});

test("020 · 命名空间守卫：基底 id 占用 xiaobai-compact 前缀 ⇒ REFUSE 防自吞", () => {
  const sb = makeSandbox("ns");
  makeInstall(sb.root);
  const evil = [
    "- insert:",
    "    - id: evil-row",
    "      name: '@deepseek-ai/dsh-agent-preset'",
    "      config:",
    "        id: xiaobai-compact-evil",
    "        order: 9",
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
  makeProfile(sb.root, evil);
  const r = run(sb.scriptCopy, [], baseEnv(sb.root));
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /xiaobai-compact namespace/);
  assert.ok(!readFileSync(sb.patchPath, "utf8").includes("BEGIN xiaobai-compact-evil"));
  rmSync(sb.root, { recursive: true, force: true });
});

test("020 · 同 bundle 的 web patch 层（含 agent-preset-registry 服务行）不算预设基底，不误触发 REFUSE", () => {
  const sb = makeSandbox("webpatch");
  const webapp = makeInstall(sb.root);
  // 实况复现：dsh-web-app 的 cordis.patch.yml 含 '@deepseek-ai/dsh-agent-preset-registry'
  // 服务行（多 insert 行文件）——声明行邻接判定必须排除它（-registry 后缀≠声明名）。
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
  assert.match(r.stdout, /xiaobai-compact-standard: WRITTEN/);
  assert.ok(!r.stdout.includes("REFUSED"), "web patch layer must not be treated as a preset base");
  rmSync(sb.root, { recursive: true, force: true });
});

test("020 · --status：应用前后状态可观测（absent→applied；minimal 恒列 SKIPPED）", () => {
  const sb = makeSandbox("status");
  makeInstall(sb.root);
  makeProfile(sb.root);
  const before = run(sb.scriptCopy, ["--status"], baseEnv(sb.root));
  assert.equal(before.status, 0);
  assert.match(before.stdout, /xiaobai-compact-standard \(variant of bundle [^]*\): absent/);
  assert.match(before.stdout, /SKIPPED \(no compaction member/);
  assert.equal(run(sb.scriptCopy, [], baseEnv(sb.root)).status, 0);
  const after = run(sb.scriptCopy, ["--status"], baseEnv(sb.root));
  assert.match(after.stdout, /xiaobai-compact-standard \(variant of bundle [^]*\): applied/);
  assert.match(after.stdout, /xiaobai-compact-ptc \(variant of bundle [^]*\): applied/);
  rmSync(sb.root, { recursive: true, force: true });
});

test("020 · 不平衡 marker ⇒ 全命令 REFUSE exit 2（status/apply/undo 统一预检）", () => {
  const sb = makeSandbox("unbal");
  makeInstall(sb.root);
  makeProfile(sb.root, "# >>> xiaobai-agent preset variant BEGIN xiaobai-compact-orphan (dangling)\n- insert:\n    - id: xiaobai-compact-orphan\n");
  const r = run(sb.scriptCopy, [], baseEnv(sb.root));
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stdout, /unbalanced variant marker block/);
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
