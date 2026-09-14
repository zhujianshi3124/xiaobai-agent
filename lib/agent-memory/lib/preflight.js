/**
 * @local/agent-memory — §11 preflight 检查库（2026-09-11）
 *
 * 部署门禁：preflight 全绿才许请求重启。检查项（§11 五条 + §12 全局）：
 *   ① 运行时版本（node engines）          —— checkNodeVersion
 *   ② 依赖安装验证（resolve 链）          —— checkDependencies
 *   ③ 引擎加载实测（真实 import 含传递依赖）—— checkEngineLoad
 *   ④ 安装位置校验（profile 链接）        —— checkInstallLocations
 *   ⑤ 预设挂载实测（冲突扫描含挂载关系）  —— checkPresetMount
 *   ⑥ 备份就绪（外部备份 + 近期快照）     —— checkBackupReady
 *   ⑦ 全局注入路径解析（固定绝对路径）    —— checkGlobalRoot
 * 纯函数可单测；CLI 另负责在隔离环境跑全套测试 + 生产根哈希对比（见 preflight.mjs）。
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

function scan(str, needle) {
  return str.includes(needle) || str.includes(`'${needle}'`) || str.includes(`"${needle}"`);
}

/** ① 运行时版本。 */
export async function checkNodeVersion(engines = {}) {
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const m = /(\d+)/.exec(String(engines.node ?? ''));
  const min = m ? Number(m[1]) : null;
  const ok = min === null || nodeMajor >= min;
  return {
    name: '运行时版本（node）',
    ok,
    detail: `node ${process.versions.node}${min !== null ? `（要求 ≥${min}）` : '（无 engines 约束）'}`,
  };
}

/** ② 依赖安装验证：从 profileDir 解析 deps 的 require.resolve 链。 */
export function checkDependencies(profileDir, deps = []) {
  const requirer = createRequire(path.join(profileDir, '__preflight_noop__.js'));
  return deps.map((dep) => {
    try {
      return { name: `依赖安装:${dep}`, ok: true, detail: requirer.resolve(dep) };
    } catch {
      return { name: `依赖安装:${dep}`, ok: false, detail: '未解析（未安装/未链接到 profile）' };
    }
  });
}

/**
 * ③ 引擎加载实测：从 profileDir 解析 deps 并真实 import 入口模块（含传递依赖链）。
 * require.resolve 只验入口存在，会漏检传递依赖缺失——2026-09-11 D:\dsh-plugins
 * 迁移事故实证：dsh-compact-router 缺 @deepseek-ai/dsh-compaction-basic、search-router
 * 缺 @deepseek-ai/dsh-web 等，resolve 全绿但引擎 import 即崩。本检查补上这一层。
 */
export async function checkEngineLoad(profileDir, deps = []) {
  const requirer = createRequire(path.join(profileDir, '__preflight_noop__.js'));
  const out = [];
  for (const dep of deps) {
    try {
      const resolved = requirer.resolve(dep);
      await import(pathToFileURL(resolved).href);
      out.push({ name: `引擎加载:${dep}`, ok: true, detail: `import 成功（${resolved}）` });
    } catch (err) {
      out.push({ name: `引擎加载:${dep}`, ok: false, detail: `import 失败：${err?.code ?? err?.message}` });
    }
  }
  return out;
}

/** ③ 安装位置校验：profile node_modules 下期望的入口文件存在。 */
export function checkInstallLocations(profileRoot, expected = []) {
  return expected.map((rel) => {
    const p = path.join(profileRoot, rel);
    const ok = fs.existsSync(p);
    return { name: `安装位置:${rel}`, ok, detail: ok ? p : `缺失：${p}` };
  });
}

/** ④ 预设挂载实测：preset 文件声明 mount；id 不得重复（冲突即中止）。 */
export function checkPresetMount(presetFile, mountId, mountName) {
  let raw = '';
  try {
    raw = fs.readFileSync(presetFile, 'utf8');
  } catch {
    return { name: `预设挂载:${mountId}`, ok: false, detail: `预设文件不可读：${presetFile}` };
  }
  const mounted = scan(raw, `name: ${mountName}`) || scan(raw, `name: '${mountName}'`);
  const idCount = (raw.match(new RegExp(`- id: ${mountId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g')) ?? []).length;
  if (idCount > 1) {
    return { name: `预设挂载:${mountId}`, ok: false, detail: `id 冲突：${mountId} 出现 ${idCount} 次，拒绝静默覆盖` };
  }
  return {
    name: `预设挂载:${mountId}`,
    ok: mounted,
    detail: mounted ? `${mountName} 已挂载（${presetFile}）` : `${mountName} 未挂载（preflight 将中止重启请求，待部署）`,
  };
}

/** ④-2 单一挂载点收口：预设内不得再声明该挂载 id（v9 E 案落地后遗留行已移除）。 */
export function checkPresetClean(presetFile, mountId) {
  let raw = '';
  try {
    raw = fs.readFileSync(presetFile, 'utf8');
  } catch {
    return { name: `预设无遗留挂载:${mountId}`, ok: true, detail: `预设文件不可读（视为无遗留）：${presetFile}` };
  }
  const re = new RegExp(`- id:\\s*${mountId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  const ok = !re.test(raw);
  return {
    name: `预设无遗留挂载:${mountId}`,
    ok,
    detail: ok ? `预设内无 ${mountId} 遗留行（单挂载点=bundle 层）` : `预设内仍残留 ${mountId} 行（违反单一挂载点，须移除）`,
  };
}

/** ⑤ 备份就绪：备份根存在且近期（freshMs 内）有快照。 */
export function checkBackupReady(backupDir, freshMs = 6 * 3600 * 1000) {
  if (!fs.existsSync(backupDir)) {
    return { name: '备份就绪', ok: false, detail: `备份根不存在：${backupDir}` };
  }
  const now = Date.now();
  let recent = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (now - fs.statSync(p).mtimeMs <= freshMs) recent += 1;
    }
  };
  walk(backupDir);
  const ok = recent > 0;
  return {
    name: '备份就绪',
    ok,
    detail: ok ? `备份根在（${backupDir}），近期快照 ${recent} 份` : `备份根在但无 ${freshMs / 3600000}h 内快照`,
  };
}

/** ⑥ 全局数据根解析：保留/可写性（只读校验：目录存在 + registry 可解析）。 */
export function checkGlobalRoot(globalRoot) {
  const regFile = path.join(globalRoot, 'registry.json');
  const ok = fs.existsSync(regFile);
  let detail = ok ? `全局根 ${globalRoot}（registry.json 存在）` : `全局根 ${globalRoot} 未初始化（registry.json 缺失）`;
  if (ok) {
    try {
      const reg = JSON.parse(fs.readFileSync(regFile, 'utf8'));
      detail += `，registry ${(reg.sessions ?? []).length} 条`;
    } catch {
      detail += '，registry.json 不可解析';
    }
  }
  return { name: '全局数据根', ok, detail };
}

/**
 * 定位 dsh 安装根（install anchor = @deepseek-ai/dsh/package.json）与
 * dsh-app-boot entry（供 profile 合成路径复用，不重实现 applyEntryPatches）。
 * 优先 `npm root -g`，回退 Windows 默认全局前缀。找不到 → null（fail-closed）。
 */
export function locateDshInstall() {
  const candidates = [];
  const r = spawnSync('npm root -g', { encoding: 'utf8', timeout: 15000, shell: true });
  const npmRoot = ((r.stdout ?? '').trim().split(/\r?\n/)[0] ?? '').trim();
  if (npmRoot) candidates.push(npmRoot);
  candidates.push(path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'node_modules'));
  for (const root of candidates) {
    const installAnchor = path.join(root, '@deepseek-ai', 'dsh', 'package.json');
    const dshAppBootPath = path.join(root, '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-app-boot', 'lib', 'index.js');
    if (fs.existsSync(installAnchor) && fs.existsSync(dshAppBootPath)) return { installAnchor, dshAppBootPath };
  }
  return null;
}

/**
 * 按 dsh-app-boot 的真实 profile 合成路径（loadProfile + composeEntries）复现
 * 合成产物（bundle 层按 dsh.profile.bundles 顺序 + profile 用户层），读取真实
 * dsh-app-boot 源码，不重实现 applyEntryPatches/loadOverlayPatches。
 * home = 含 profiles/<name> 的 dsh 主目录（由 profileDir 上溯两级）。
 */
export async function composeProfileEntryList({ dshAppBootPath, installAnchor, profileName = 'web', home }) {
  const { loadProfile, composeEntries } = await import(pathToFileURL(dshAppBootPath).href);
  const profile = loadProfile('dsh', profileName, installAnchor, home, { userLayer: true });
  const bundlePatches = profile.layers.flatMap((layer) => layer.patches);
  return composeEntries([bundlePatches, profile.patches, [], []]);
}

/**
 * ⑧ 挂载可解析性实测（bundle 层；v9 护栏）：按 bundle+patch 真实合成 → 找挂载行 →
 * 从 profileDir 解析其入口说明符 → 真实 import 成功才 PASS。
 * 之前「预设挂载行只查存在 + require.resolve 只验入口不验真 import」是假绿，
 * 本检查把「挂载行在场」升级为「挂载行在合成产物且真能 import」。
 */
export async function checkBundleMountResolvable(opts = {}) {
  const {
    profileDir,
    dshAppBootPath,
    installAnchor,
    profileName = 'web',
    home,
    mountId = 'agent-memory-runtime',
  } = opts;
  const label = '挂载可解析性（bundle 合成 + 真实 import）';
  try {
    const entries = await composeProfileEntryList({ dshAppBootPath, installAnchor, profileName, home });
    const row = entries.find((entry) => entry.id === mountId);
    if (row === void 0) {
      return { name: label, ok: false, detail: `合成产物中无 ${mountId} 行（bundles+patch 未生效）` };
    }
    const requirer = createRequire(path.join(profileDir, '__preflight_noop__.js'));
    const resolved = requirer.resolve(row.name);
    await import(pathToFileURL(resolved).href);
    return { name: label, ok: true, detail: `${mountId} → name=${row.name} → ${resolved}（import 成功）` };
  } catch (err) {
    return { name: label, ok: false, detail: `失败：${err?.code ?? err?.message ?? String(err)}` };
  }
}

/** 汇总：全绿 → { ok:true }；否则列出失败项。 */
export function runPreflight(checks) {
  const list = Array.isArray(checks) ? checks : [];
  const failed = list.filter((c) => !c.ok);
  return { ok: failed.length === 0, total: list.length, failed, checks: list };
}