// P2.4 施工批 1 验证（p24-test-plan-batch1.md §3.4 七单测 + §3.2 矩阵引擎级等价）。
// 纪律：全部落盘测试走 os.tmpdir 副本；真实 cordis.patch.yml 零写入（末尾断言基准 sha）。
// 用法：node scripts/p24-verify.mjs
// 预设桥测试用假脚本/假预设（A2⑥ sha 留痕逻辑全链路，不触碰真实 shipped presets）。

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const patchPath = join(root, "cordis.patch.yml");
const BASE_SHA = createHash("sha256").update(readFileSync(patchPath, "utf8")).digest("hex");
// 基准滚存（2026-09-21 H5，用户裁决"加引号修配置"）：ce0b0b81… → bb7af96f…。
// 起因：cordis.patch.yml:61 的 engines 第 8 项 `360` 未加引号被 YAML 解析成整数，
// H3 起宿主通道开始按 Standard Schema 校验该插件配置 ⇒ 启动即 ValidationError 掀掉整个宿主。
// 修的是数据（`360` → `'360'`），守卫机制本身一字未放宽。取证见
// panel/docs/evidence/H-REAL-HOST-REVERIFY.md、账见 docs/debt.md A#24 / D-16。
const BASELINE_SHA_EXPECTED = "bb7af96fb47ea8275cdf91bd0978a611c144077b7c8006804ff22ce404c88b3c";
if (BASE_SHA !== BASELINE_SHA_EXPECTED) {
  console.error("ABORT: 真实 cordis.patch.yml 基线漂移（" + BASE_SHA.slice(0, 12) + "）——拒绝在非基准态跑验证");
  process.exit(1);
}

let pass = 0;
const fails = [];
function check(name, ok, detail = "") {
  if (ok) { pass++; console.log("PASS " + name); }
  else { fails.push(name + " — " + detail); console.log("FAIL " + name + " — " + detail); }
}
const sha = (t) => createHash("sha256").update(t).digest("hex");

// ---------- 副本构造 ----------
const work = mkdtempSync(join(tmpdir(), "p24-verify-"));
function makeCopy(name, { patchText, withPlugins = true } = {}) {
  const dir = join(work, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "cordis.patch.yml"), patchText !== undefined ? patchText : readFileSync(patchPath, "utf8"), "utf8");
  cpSync(join(root, "doctor-signals.json"), join(dir, "doctor-signals.json"));
  cpSync(join(root, "dsh.plugin.json"), join(dir, "dsh.plugin.json"));
  cpSync(join(root, "package.json"), join(dir, "package.json"));
  cpSync(join(root, "preset-patch-state.json"), join(dir, "preset-patch-state.json"));
  if (withPlugins) {
    for (const p of ["agent-memory", "compact-router", "rate-throttle", "search-router", "web-search-local"]) {
      mkdirSync(join(dir, "lib", p), { recursive: true });
      cpSync(join(root, "lib", p, "dsh.plugin.json"), join(dir, "lib", p, "dsh.plugin.json"));
      writeFileSync(join(dir, "lib", p, "body.js"), "// body of " + p + "\n", "utf8");
      writeFileSync(join(dir, "lib", p, "extra.js"), "// extra of " + p + "\n", "utf8");
      // exports 目标桩（doctor schema.exports-target-missing 检查需要目标文件在场）
      const manifest = JSON.parse(readFileSync(join(dir, "lib", p, "dsh.plugin.json"), "utf8"));
      for (const target of Object.values((manifest.requirements || {}).exports || {})) {
        const stubAbs = join(dir, "lib", p, String(target).replace(/^\.\//, ""));
        if (!existsSync(stubAbs)) {
          mkdirSync(join(stubAbs, ".."), { recursive: true });
          writeFileSync(stubAbs, "// stub\n", "utf8");
        }
      }
    }
    // peer 依赖桩（tmpdir 上层无 node_modules，doctor pkg.missing-dependency 解析需要）
    const depVersions = {
      "@deepseek-ai/dsh-compaction-basic": "0.1.5-rc.2",
      "@deepseek-ai/dsh-web": "0.1.5-rc.2",
      "@deepseek-ai/schemastery": "3.18.1",
    };
    for (const [dep, ver] of Object.entries(depVersions)) {
      const pd = join(dir, "node_modules", ...dep.split("/"));
      mkdirSync(pd, { recursive: true });
      writeFileSync(join(pd, "package.json"), JSON.stringify({ name: dep, version: ver, main: "index.js" }));
      writeFileSync(join(pd, "index.js"), "// stub\n");
    }
  }
  return dir;
}

const managerUrl = (m) => "file:///" + join(root, "panel", "manager", m).replace(/\\/g, "/");
const { createSoftUninstallPlan, createTrueUninstallPlan, createSoftRestorePlan, createMountPlan, executeSoftUninstall, executeTrueUninstall, executeSoftRestore, executeMount, executeMountPreset, createPresetSoftUninstallPlan, createPresetRestorePlan, executePresetSoftUninstall, executePresetRestore } = await import(managerUrl("uninstall.mjs"));
const { locateRowBlock, planRemoveRow, planWebConfigRemove, planWebConfigRestore, putPlan, executePlan, createSnapshotRestorePlan, PlanError } = await import(managerUrl("apply-engine.mjs"));
const { createBackup, listRestoreSnapshots, readSnapshotEntry } = await import(managerUrl("backup.mjs"));
const { writeDestroyReceipt, pruneCustody, readCustodyManifest, listCustody } = await import(managerUrl("custody.mjs"));
const { buildSnapshot } = await import(managerUrl("snapshot.mjs"));

const backupRootFor = (dir) => join(dir, ".panel-write-backups");
async function snapshotOf(dir) {
  return buildSnapshot({ toolkitRoot: dir, hotRouterPath: join(dir, "no-hot.json"), envMode: undefined });
}

// ---------- ① row-anchor-unique.test ----------
{
  const dup = ["- insert:", "    - id: x", "      name: 'a'", "- insert:", "    - id: x", "      name: 'b'"].join("\r\n");
  let threw = null;
  try { planRemoveRow(dup, "x"); } catch (e) { threw = e.code; }
  check("① 锚点重复 ≥2 → anchor-ambiguous 拒绝", threw === "anchor-ambiguous", String(threw));
  const twoInBlock = ["- insert:", "    - id: y", "      name: 'a'", "    - id: z", "      name: 'b'"].join("\r\n");
  let threw2 = null;
  try { planRemoveRow(twoInBlock, "y"); } catch (e) { threw2 = e.code; }
  check("① 单 insert 块含 2 行 → row-block-multiple 拒绝", threw2 === "row-block-multiple", String(threw2));
  const ok = planRemoveRow(readFileSync(patchPath, "utf8"), "rate-throttle");
  check("① 正常单行块摘除 changed=true 且块完整保留", ok.changed && ok.block.includes("- id: rate-throttle") && ok.block.includes("syncSelectionOnFailover"));
}

// ---------- ② row-plan-sha.test ----------
{
  const text = readFileSync(patchPath, "utf8");
  const r1 = planRemoveRow(text, "rate-throttle");
  const r2 = planRemoveRow(text, "rate-throttle");
  check("② plan SHA 确定（同输入同 nextSha）", sha(r1.nextText) === sha(r2.nextText) && r1.insertAt === r2.insertAt);
  const unset1 = planWebConfigRemove(text, "searchProvider");
  check("② 宿主键 unset：changed=true 且文本含 web 行", unset1.changed && unset1.removedRaw.includes("searchProvider"));
  const unset2 = planWebConfigRemove(unset1.nextText, "searchProvider");
  check("② 幂等：键已不在 → changed=false 文本不变", !unset2.changed && unset2.nextText === unset1.nextText);
  const restore = planWebConfigRestore(unset1.nextText, { key: "searchProvider", raw: unset1.removedRaw, lineIndex: -1 });
  check("② 宿主键恢复写回 sha 回原值", restore.changed && sha(restore.nextText) === sha(text));
  let occupied = null;
  try { planWebConfigRestore(text, { key: "searchProvider", raw: "searchProvider: other", lineIndex: -1 }); } catch (e) { occupied = e.code; }
  check("② 宿主键被占 → host-key-occupied 不自动覆盖", occupied === "host-key-occupied", String(occupied));
}

// ---------- ③ host-row-unset-restore.test（软卸载 search-router 全链路）----------
{
  const dir = makeCopy("soft-search");
  const before = readFileSync(join(dir, "cordis.patch.yml"), "utf8");
  const plan = createSoftUninstallPlan({ toolkitRoot: dir, plugin: "search-router", userReason: "测试" });
  const exec = executeSoftUninstall({ plan, toolkitRoot: dir, backupRoot: backupRootFor(dir) });
  const after = readFileSync(join(dir, "cordis.patch.yml"), "utf8");
  check("③ 软卸载：行块摘除", !after.includes("- id: web-search-router"), "");
  check("③ 软卸载：宿主键 searchProvider 同步 unset（方案 A）", !/^    searchProvider:/m.test(after));
  check("③ 软卸载：shaBefore==改前 sha、备份落盘", exec.shaBefore === sha(before) && !!exec.backupDir && existsSync(join(exec.backupDir, "manifest.json")));
  const snap = await snapshotOf(dir);
  const sr = snap.plugins.find((p) => p.dir === "search-router");
  check("③ 快照：search-router=soft-unmounted 且本体在", sr.status === "soft-unmounted" && sr.bodyPresent);
  check("③ 快照：web-search-local 不受牵连（仍 mounted）", snap.plugins.find((p) => p.dir === "web-search-local").status === "mounted");
  // 恢复三态：B（写回）
  const rp = createSoftRestorePlan({ toolkitRoot: dir, plugin: "search-router", hostKeyChoice: "restore-backup" });
  const re = executeSoftRestore({ plan: rp, toolkitRoot: dir });
  check("③ 恢复 B：patch sha 逐字节回改前", sha(readFileSync(join(dir, "cordis.patch.yml"), "utf8")) === sha(before));
  check("③ 恢复 B：台账条目已清", !readFileSync(join(dir, ".panel-custody", "soft-uninstalls.json"), "utf8").includes("web-search-router"));
  // 恢复三态：冲突检测（宿主键被占）
  const plan2 = createSoftUninstallPlan({ toolkitRoot: dir, plugin: "search-router" });
  executeSoftUninstall({ plan: plan2, toolkitRoot: dir, backupRoot: backupRootFor(dir) });
  const patched = readFileSync(join(dir, "cordis.patch.yml"), "utf8");
  const occupiedText = patched.replace("# dsh-toolkit", "# dsh-toolkit").replace("  config:\r\n    fetchProvider:", "  config:\r\n    searchProvider: official-only\r\n    fetchProvider:");
  writeFileSync(join(dir, "cordis.patch.yml"), occupiedText, "utf8");
  const rp2 = createSoftRestorePlan({ toolkitRoot: dir, plugin: "search-router", hostKeyChoice: "restore-backup" });
  check("③ 恢复冲突：conflict 三态数据（current/backup）非空", rp2.conflict && rp2.conflict.currentValue === "official-only" && rp2.conflict.backupValue.includes("auto-search"), JSON.stringify(rp2.conflict));
  const rp3 = createSoftRestorePlan({ toolkitRoot: dir, plugin: "search-router", hostKeyChoice: "keep-current" });
  const re3 = executeSoftRestore({ plan: rp3, toolkitRoot: dir });
  check("③ 恢复 A（保留当前值）：行块插回但宿主键未被覆盖", !/^    searchProvider: auto-search/m.test(readFileSync(join(dir, "cordis.patch.yml"), "utf8")) && re3.ok);
}

// ---------- ④⑤ 销毁式真卸载全链路（web-search-local）+ 重装 → 挂载 ----------
{
  const dir = makeCopy("true-wsl");
  const before = readFileSync(join(dir, "cordis.patch.yml"), "utf8");
  const libDir = join(dir, "lib", "web-search-local");
  const stash = join(work, "true-wsl-reinstall-stash"); // 暂存放副本仓之外（避免被 doctor 当作在案本体）
  cpSync(libDir, stash, { recursive: true }); // 模拟「开源后重新下载」的源码来源（测试内自建）
  const countFiles = (d) => {
    let n = 0;
    for (const e of readdirSync(d, { withFileTypes: true })) n += e.isDirectory() ? countFiles(join(d, e.name)) : 1;
    return n;
  };
  const fileCount = countFiles(libDir);

  const plan = createTrueUninstallPlan({ toolkitRoot: dir, plugin: "web-search-local", userReason: "删旧换新测试", confirmCopy: "{}" });
  const exec = executeTrueUninstall({ plan, toolkitRoot: dir, backupRoot: backupRootFor(dir) });
  check("④ 销毁式：lib 目录已删", !existsSync(libDir));
  check("④ 销毁式：行块摘除 + 宿主键 fetchProvider unset", !readFileSync(join(dir, "cordis.patch.yml"), "utf8").includes("- id: web-search-local") && !/^    fetchProvider:/m.test(readFileSync(join(dir, "cordis.patch.yml"), "utf8")));

  const manifest = readCustodyManifest(dir, exec.custodyId);
  check("④ 收据：kind = true-uninstall-receipt", manifest.kind === "true-uninstall-receipt" && manifest.schemaVersion === 2);
  check("④ 收据：逐文件清单含 sha/bytes，且与删除前文件数一致", manifest.deleted.body.length === fileCount && manifest.deleted.body.every((f) => f.sha256 && typeof f.bytes === "number"), JSON.stringify({ listed: manifest.deleted.body.length, fileCount }));
  check("④ 收据：totals 与清单自洽", manifest.deleted.totals.files === fileCount && manifest.deleted.totals.bytes === manifest.deleted.body.reduce((s, f) => s + f.bytes, 0));
  check("④ 收据：userReason 如实入账", manifest.userReason === "删旧换新测试");

  // —— 销毁式硬判据 ——
  const anySourceCopy = (d) => {
    if (!existsSync(d)) return false;
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { if (anySourceCopy(p)) return true; }
      else if (/\.(js|mjs|cjs|ts)$/.test(e.name)) return true;
    }
    return false;
  };
  check("⑤ 硬判据：收据目录**无 body/**（不留副本）", !existsSync(join(dir, ".panel-custody", exec.custodyId, "body")) && manifest.bodyStored === false);
  check("⑤ 硬判据：收据不含恢复用字段（body / restore）", manifest.body === undefined && manifest.restore === undefined);
  check("⑤ 硬判据：.panel-custody 全域无任何源码副本", !anySourceCopy(join(dir, ".panel-custody")));
  check("⑤ 收据：rebuild 行块 + 宿主键事实齐（重装挂载依据）", !!manifest.rebuild.rowBlock && !!manifest.rebuild.hostKey && String(manifest.rebuild.hostKey.raw).includes("fetchProvider"));
  check("⑤ 收据：listCustody 标注 mountable", listCustody(dir).some((e) => e.custodyId === exec.custodyId && e.mountable === true));

  const snap = await snapshotOf(dir);
  const wsl = snap.plugins.find((p) => p.dir === "web-search-local");
  const sr = snap.plugins.find((p) => p.dir === "search-router");
  check("⑥ 快照：web-search-local=true-uninstalled（5 卡仍渲染）", wsl.status === "true-uninstalled" && snap.plugins.length === 5);
  check("⑥ 快照：「无副本」文案逐字命中", wsl.statusCopy === "已卸载（无副本）· 重新安装后面板可挂载", wsl.statusCopy);
  check("⑥ 快照：restoreAvailable=false（无恢复路径）", wsl.restoreAvailable === false && wsl.canMount === false);
  check("⑥ 快照：search-router=dependency-broken 文案命中", sr.status === "dependency-broken" && sr.mounted === true && sr.statusCopy.includes("依赖的本地搜索未安装"));

  // —— 重装（外部副本放回 lib）→ 面板检测「已安装未挂载」→ 挂载 ——
  cpSync(stash, libDir, { recursive: true });
  const snap2 = await snapshotOf(dir);
  const wsl2 = snap2.plugins.find((p) => p.dir === "web-search-local");
  check("⑤ 重装后：installed-unmounted + canMount=true（可挂载）", wsl2.status === "installed-unmounted" && wsl2.canMount === true, wsl2.status + "/" + wsl2.canMount);
  check("⑤ 重装后：restoreAvailable 仍 false（恢复只属软卸载）", wsl2.restoreAvailable === false);

  const mp = createMountPlan({ toolkitRoot: dir, plugin: "web-search-local" });
  const me = executeMount({ plan: mp, toolkitRoot: dir, backupRoot: backupRootFor(dir) });
  check("⑤ 挂载：patch sha 回基线（字节级）", sha(readFileSync(join(dir, "cordis.patch.yml"), "utf8")) === sha(before));
  check("⑤ 挂载：宿主键回原值 fetchProvider: local-fetch", /^    fetchProvider: local-fetch/m.test(readFileSync(join(dir, "cordis.patch.yml"), "utf8")));
  check("⑤ 挂载：executeMount 回传 mounted=true", me.mounted === true);
  const snap3 = await snapshotOf(dir);
  check("⑤ 挂载后：5 卡全 mounted 且无 dependency-broken", snap3.plugins.every((p) => p.status === "mounted"));

  // —— 无收据 ⇒ 拒绝挂载（面板不臆造 config）——
  const dir3 = makeCopy("mount-no-receipt");
  let nc = null;
  try { createMountPlan({ toolkitRoot: dir3, plugin: "web-search-local" }); } catch (e) { nc = e.code; }
  check("⑤ 无收据 → mount-no-receipt 拒绝（零硬编码，不臆造 config）", nc === "mount-no-receipt", String(nc));

  // —— 恢复 API 对真卸载一律拒绝 ——
  const dir4 = makeCopy("true-restore-refused");
  const p4 = createTrueUninstallPlan({ toolkitRoot: dir4, plugin: "web-search-local" });
  executeTrueUninstall({ plan: p4, toolkitRoot: dir4, backupRoot: backupRootFor(dir4) });
  let rr = null;
  try { createSoftRestorePlan({ toolkitRoot: dir4, plugin: "web-search-local" }); } catch (e) { rr = e.code; }
  check("⑤ 真卸载后恢复被拒（body-missing：无副本可恢复）", rr === "body-missing", String(rr));
}

// ---------- 收据滚动窗口 ----------
{
  const dir = makeCopy("prune");
  for (let i = 0; i < 7; i++) {
    writeDestroyReceipt({ toolkitRoot: dir, plugin: "rate-throttle", pkg: "x", rowBlock: "b" + i, insertAt: 0, userReason: null, confirmCopy: null });
  }
  const count = readdirSync(join(dir, ".panel-custody")).filter((n) => n.startsWith("rate-throttle-")).length;
  check("④ 收据滚动窗口：7 次后保留 5 份", count === 5, String(count));
}

// ---------- compact-router 预设桥（假脚本全链路，A2⑥ sha 留痕）----------
{
  const dir = makeCopy("preset-bridge", { withPlugins: true });
  // 假预设：original(.bak) / patched(.patched) 两态
  const presets = {};
  const state = {};
  for (const id of ["liangshen", "standard", "ptc", "cordis"]) {
    const f = join(dir, "presets", id + ".agent.cordis.yml");
    const bak = join(dir, "preset-backups", id + ".agent.cordis.yml.bak");
    const patched = join(dir, "presets", id + ".agent.cordis.yml.patched");
    mkdirSync(join(dir, "presets"), { recursive: true });
    mkdirSync(join(dir, "preset-backups"), { recursive: true });
    writeFileSync(f, "# original " + id + "\r\n", "utf8");
    writeFileSync(bak, "# original " + id + "\r\n", "utf8");
    writeFileSync(patched, "# original " + id + "\r\n- id: compact-router\r\n", "utf8");
    state[id] = { file: f, backup: bak, patchedSha: sha(readFileSync(patched, "utf8")), originalSha: sha(readFileSync(bak, "utf8")) };
    presets[id] = { f, bak, patched };
  }
  // 假脚本：--undo=从 .bak 还原；apply=写回 .patched 内容
  const scriptDir = join(dir, "scripts");
  mkdirSync(scriptDir, { recursive: true });
  writeFileSync(join(scriptDir, "apply-preset-patch.mjs"), [
    "import { readFileSync, writeFileSync, existsSync } from 'node:fs';",
    "import { join, dirname } from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    "const root = dirname(dirname(fileURLToPath(import.meta.url)));",
    "const state = JSON.parse(readFileSync(join(root, 'preset-patch-state.json'), 'utf8'));",
    "const undo = process.argv.includes('--undo');",
    "for (const [id, e] of Object.entries(state)) {",
    "  const src = undo ? e.backup : e.file + '.patched';",
    "  if (!existsSync(src)) { console.log('REFUSED ' + id); continue; }",
    "  writeFileSync(e.file, readFileSync(src, 'utf8'), 'utf8');",
    "  console.log(id + ' ' + (undo ? 'undone' : 'patched'));",
    "}",
    "",
  ].join("\n"), "utf8");
  writeFileSync(join(dir, "preset-patch-state.json"), JSON.stringify(state, null, 2), "utf8");

  // 模拟当前处于 patched 态：先把文件写成 patched 内容，再取 beforeUndo 基准
  for (const id of Object.keys(state)) writeFileSync(state[id].file, readFileSync(state[id].file + ".patched", "utf8"), "utf8");
  const beforeShas = {};
  for (const id of Object.keys(state)) beforeShas[id] = sha(readFileSync(state[id].file, "utf8"));

  const plan = createPresetSoftUninstallPlan({ toolkitRoot: dir, plugin: "compact-router" });
  const exec = executePresetSoftUninstall({ plan, toolkitRoot: dir, backupRoot: backupRootFor(dir) });
  let allUndo = true;
  for (const id of Object.keys(state)) {
    const after = sha(readFileSync(state[id].file, "utf8"));
    const bakSha = sha(readFileSync(state[id].backup, "utf8"));
    if (after !== bakSha) allUndo = false;
    const ev = exec.presetEvidence[id];
    if (!ev || ev.beforeUndo !== beforeShas[id] || ev.afterUndo !== after || ev.backupSha !== bakSha || !ev.afterUndoEqualsBak) allUndo = false;
  }
  check("A2⑥ 预设回写：四预设 afterUndo==.bak sha 且前后留痕齐", allUndo);
  check("A2⑥ 留痕落盘：preset-undo-evidence.json 在备份目录", existsSync(join(exec.backupDir, "preset-undo-evidence.json")));
  const snap = await snapshotOf(dir);
  check("⑥ 快照：compact-router 预设 undo 后 = soft-unmounted", snap.plugins.find((p) => p.dir === "compact-router").status === "soft-unmounted");
  // 恢复
  const rp = createPresetRestorePlan({ toolkitRoot: dir, plugin: "compact-router" });
  const re = executePresetRestore({ plan: rp, toolkitRoot: dir, backupRoot: backupRootFor(dir) });
  let allReapply = true;
  for (const id of Object.keys(state)) {
    if (sha(readFileSync(state[id].file, "utf8")) !== beforeShas[id]) allReapply = false;
  }
  check("A2⑥ 预设恢复：afterReapply == beforeUndo（四预设）", allReapply);
  const snapAfterRestore = await snapshotOf(dir);
  check("⑥ 快照：compact-router 回 mounted", snapAfterRestore.plugins.find((p) => p.dir === "compact-router").status === "mounted");
}

// ---------- ⑦ doctor-signal.test（副本 doctor 全链路）----------
{
  const doctorCli = "D:\\dsh-test-sandbox\\projects\\doctor\\src\\cli.mjs";
  function runDoctor(dir) {
    // doctor cli 约定：issues 数 > 0 即退出码 1（含 info）——捕获后仍解析 stdout JSON
    let out = "";
    try {
      out = execFileSync(process.execPath, [doctorCli, "--json", "--scope", dir], { encoding: "utf8", timeout: 120000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    } catch (e) {
      out = (e && e.stdout) || "";
    }
    return JSON.parse(out);
  }
  // 基线副本：0 error 0 mount 信号
  const base = runDoctor(makeCopy("doc-base"));
  check("⑦ doctor 基线副本：error=0 且无 mount 信号", base.summary.error === 0 && !base.issues.some((i) => i.category === "mount"));
  // A5：真卸载 web-search-local → missing-provider warning（search-router 仍挂载）
  const dir = makeCopy("doc-a5");
  const plan = createTrueUninstallPlan({ toolkitRoot: dir, plugin: "web-search-local" });
  executeTrueUninstall({ plan, toolkitRoot: dir, backupRoot: backupRootFor(dir) });
  const r = runDoctor(dir);
  const mount = r.issues.filter((i) => i.category === "mount");
  check("⑦ A5：missing-provider warning 在案（文案命中）", mount.some((i) => i.id === "provider.missing-provider" && i.severity === "warning" && i.message.includes("依赖的本地搜索未安装")), JSON.stringify(mount.map((i) => i.id)));
  check("⑦ A5：缺席提示 severity≠error 且 doctor error=0", r.summary.error === 0 && mount.every((i) => i.severity !== "error"));
  check("⑦ A5：无 dangling warning（fetchProvider 已 unset）", !mount.some((i) => i.id === "provider.dangling-reference"));
  // dangling：手工把 searchProvider 指向不存在的 provider
  const dir2 = makeCopy("doc-dangling");
  const t = readFileSync(join(dir2, "cordis.patch.yml"), "utf8").replace("searchProvider: auto-search", "searchProvider: ghost-provider");
  writeFileSync(join(dir2, "cordis.patch.yml"), t, "utf8");
  const r2 = runDoctor(dir2);
  check("⑦ dangling：provider.dangling-reference warning", r2.issues.some((i) => i.id === "provider.dangling-reference" && i.severity === "warning") && r2.summary.error === 0);
  // row-without-body：手工摘行失败态（体在行在？体不在行在）
  const dir3 = makeCopy("doc-dangling2");
  rmSync(join(dir3, "lib", "rate-throttle"), { recursive: true, force: true });
  const r3 = runDoctor(dir3);
  check("⑦ row-without-body：行在体不在 → warning 非 error", r3.issues.some((i) => i.id === "mount.row-without-body" && i.severity === "warning") && r3.summary.error === 0);
}

// ---------- ⑧ snapshot-restore.test（D3 restoreSnapshot：写前快照经唯一通道整文件回写）----------
{
  const dir = makeCopy("snap-restore");
  const patchFile = join(dir, "cordis.patch.yml");
  const backupRoot = backupRootFor(dir);
  const original = readFileSync(patchFile, "utf8");

  // 模拟历史写前快照：摘除 rate-throttle 行块后的 patch（= 一笔软卸载落盘前的镜像）
  const older = planRemoveRow(original, "rate-throttle").nextText;
  const snapDir = createBackup({ backupRoot, files: [patchFile], reason: "panel-uninstall-soft", note: "history" });
  writeFileSync(join(snapDir, readFileSync(join(snapDir, "manifest.json"), "utf8") ? JSON.parse(readFileSync(join(snapDir, "manifest.json"), "utf8")).files[0].savedAs : ""), older, "utf8");

  // 当前文件已被改走（模拟后续一笔写操作）
  const drifted = original.replace("syncSelectionOnFailover", "syncSelectionOnFailover # touched");
  writeFileSync(patchFile, drifted, "utf8");

  const stamp = snapDir.split(/[\\/]/).pop();
  check("⑧ listRestoreSnapshots 列出该快照（含 sha/bytes/reason）", listRestoreSnapshots(backupRoot, patchFile).some((s) => s.stamp === stamp && s.reason === "panel-uninstall-soft" && s.bytes > 0));
  check("⑧ readSnapshotEntry 拒绝穿越 stamp", readSnapshotEntry(backupRoot, "../escape", patchFile) === null && readSnapshotEntry(backupRoot, "2026-99-99T00-00-00-000Z", patchFile) === null);

  let threw = null;
  try { createSnapshotRestorePlan({ file: patchFile, backupRoot, stamp: "../../etc" }); } catch (e) { threw = e instanceof PlanError ? e.code : String(e); }
  check("⑧ 穿越 stamp ⇒ snapshot-not-found（白名单）", threw === "snapshot-not-found", String(threw));

  // plan → execute：整文件回写走唯一通道
  const plan = createSnapshotRestorePlan({ file: patchFile, backupRoot, stamp });
  check("⑧ plan diff 记录删/增（两份全文）", Array.isArray(plan.diff) && plan.diff.length === 2 && plan.skipAnchorCheck === true && plan.nextSha === sha(older));
  const res = executePlan(putPlan(plan).token);
  const restoredText = readFileSync(patchFile, "utf8");
  check("⑧ execute 后文件回到快照内容（字节级）", restoredText === older && res.shaAfter === sha(older));
  check("⑧ 恢复自身留了新备份（可再回滚）", listRestoreSnapshots(backupRoot, patchFile).length === 2);

  // 快照与当前一致 ⇒ snapshot-identical
  let threw2 = null;
  try { createSnapshotRestorePlan({ file: patchFile, backupRoot, stamp }); } catch (e) { threw2 = e instanceof PlanError ? e.code : String(e); }
  check("⑧ 快照=当前 ⇒ snapshot-identical 拒绝", threw2 === "snapshot-identical", String(threw2));

  // 不存在的 stamp ⇒ snapshot-not-found
  let threw3 = null;
  try { createSnapshotRestorePlan({ file: patchFile, backupRoot, stamp: "2026-09-19T00-00-00-000Z" }); } catch (e) { threw3 = e instanceof PlanError ? e.code : String(e); }
  check("⑧ 缺失 stamp ⇒ snapshot-not-found", threw3 === "snapshot-not-found", String(threw3));

  // sha-conflict：plan 之后文件又被改 ⇒ 拒绝写入
  const older2 = original; // 第二份快照 = 基线原文（与 drifted 不同即可）
  const snapDir2 = createBackup({ backupRoot, files: [patchFile], reason: "panel-toggle", note: null });
  writeFileSync(join(snapDir2, JSON.parse(readFileSync(join(snapDir2, "manifest.json"), "utf8")).files[0].savedAs), older2, "utf8");
  writeFileSync(patchFile, drifted, "utf8");
  const plan2 = createSnapshotRestorePlan({ file: patchFile, backupRoot, stamp: snapDir2.split(/[\\/]/).pop() });
  writeFileSync(patchFile, drifted + "\r\n# extra touch\r\n", "utf8");
  let threw4 = null;
  try { executePlan(putPlan(plan2).token); } catch (e) { threw4 = e instanceof PlanError ? e.code : String(e); }
  check("⑧ plan 后文件被改 ⇒ sha-conflict 拒绝", threw4 === "sha-conflict", String(threw4));
  check("⑧ sha-conflict 后文件未被写", readFileSync(patchFile, "utf8") === drifted + "\r\n# extra touch\r\n");
}

// ---------- 收尾：真实仓零写入自证 ----------
{
  const nowSha = sha(readFileSync(patchPath, "utf8"));
  check("真实 cordis.patch.yml 全程零写入（基准 bb7af96f… 不变）", nowSha === BASE_SHA && BASE_SHA === BASELINE_SHA_EXPECTED);
  rmSync(work, { recursive: true, force: true });
}

console.log("════════════════════════════════");
console.log("RESULT passed=" + pass + " failed=" + fails.length);
if (fails.length > 0) {
  for (const f of fails) console.log("  ✗ " + f);
  process.exit(1);
}
