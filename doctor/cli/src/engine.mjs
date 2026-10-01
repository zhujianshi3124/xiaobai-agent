import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const YAML_DEFAULT_URL = 'file:///C:/Users/LENOVO/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/yaml/dist/index.js';
let YAML = null;
try {
  YAML = await import(process.env.DSH_DOCTOR_YAML_URL || YAML_DEFAULT_URL);
} catch {
  YAML = null;
}

export class DoctorRootError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DoctorRootError';
  }
}

let HOST_FACES = {
  schemaVersion: 1,
  providedFaces: [
    { face: 'llm', source: 'dsh-llm/lib/types/index.js:232 super(ctx, "llm")' },
    { face: 'tokenMeter', source: "dsh-token-meter/lib/types/index.js:43 super(ctx, 'tokenMeter')" },
    { face: 'sessions', source: "dsh-session/lib/types/index.js:723 super(ctx, 'sessions')" },
    { face: 'commands', source: "dsh-commands/lib/types/index.js:226 super(ctx, 'commands')" },
    { face: 'web', source: 'dsh-web/lib/index.js:56 super(ctx, "web")' },
    { face: 'compaction', source: "dsh-compaction/lib/types/index.js:46 super(ctx, 'compaction')" },
    { face: 'webServer', source: 'host web server seam (used by @linxin666/dsh-client-ui-plugin-manager lib/index.js:2311)' },
    { face: 'subprocess', source: 'host subprocess seam (used by dsh-ops-console lib/index.js:458)' },
  ],
};
try {
  const hostFacesUrl = new URL('./host-faces.json', import.meta.url);
  HOST_FACES = JSON.parse(stripBom(fs.readFileSync(hostFacesUrl, 'utf8')));
} catch {
}

const MANIFEST_TOP_KEYS = ['manifestVersion', 'name', 'aliases', 'requirements', 'optionalDeps', 'requiredAliases',
  // P5 契约字段（Sub-Plugin Contract v1，就地扩展 dsh.plugin.json；toolkit docs/p0-recon.md §6）
  // requires / panels 同属契约根字段（contract KNOWN_CONTRACT_FIELDS；toolkit P7 根入口首次使用）：
  // 键名的合法性归契约，本 CLI 只看"是不是一个已知的根字段"，值语义不在此判定。
  // provides 同属契约根字段（契约 v1.1 C-1 第 1 项的提供面，toolkit 批 2 落地校验）：口径同上，零值校验。
  'id', 'displayName', 'version', 'contract', 'configSchema', 'requires', 'panels', 'provides'];
const REQUIREMENT_KEYS = ['runtime', 'binaries', 'packages', 'registers', 'exports'];
const REF_RE = /@local\/[A-Za-z0-9][A-Za-z0-9._-]*(?![A-Za-z0-9._-])/g;

function toPosix(p) {
  return p.replace(/\\/g, '/');
}

function posixJoin(a, b) {
  if (!a) return b;
  if (!b) return a;
  return String(a).replace(/\/+$/, '') + '/' + String(b).replace(/^\/+/, '');
}

function stripBom(text) {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1);
  return text;
}

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

function jsonErrorLine(text, position) {
  return lineAt(text, Math.max(0, Math.min(position || 0, text.length - 1)));
}

function countExactOccurrences(text, needle) {
  if (!needle) return { count: 0, indices: [] };
  const indices = [];
  let from = 0;
  let idx = text.indexOf(needle, from);
  while (idx !== -1) {
    indices.push(idx);
    from = idx + needle.length;
    idx = text.indexOf(needle, from);
  }
  return { count: indices.length, indices };
}

function maskJsonBlock(text, marker) {
  const start = text.indexOf(marker);
  if (start === -1) return text;
  const brace = text.indexOf('{', start + marker.length);
  if (brace === -1) return text;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = brace;
  for (let i = brace; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  const chars = text.split('');
  for (let i = start; i < end; i++) {
    const ch = chars[i];
    if (ch !== '\n' && ch !== '\r') chars[i] = ' ';
  }
  return chars.join('');
}

function maskAliasesBlock(text) {
  return maskJsonBlock(text, '"aliases"');
}

/**
 * 扫描面目录排除（D-UI-06「夹具≠在案本体」同族；两线碰撞裁决 (b) 2026-09-19）。
 * test/ 目录是测试夹具位——夹具 manifest 常为「故意无效」，与在案判定天然相克：
 * 泛化线 test/fixtures/registry 曾被当成在案本体 ⇒ 真实仓 dry-run 5 error。
 * test/ 整体不入扫描面（治本，防一切测试夹具误报）。唯一例外：lib/ 直下名为 test
 * 的目录是在案本体位（lib/<name>/），跳过会 fail-open，故放行。
 */
function isSkippedScanDir(name, parentRel) {
  if (name === 'node_modules' || name === '.git' || name === 'doctor-backups' || name === 'preset-backups') return true;
  if (name === 'test' && parentRel !== 'lib') return true;
  return false;
}

function walkAll(rootAbs, depthLeft) {
  const out = [];
  if (depthLeft === undefined) depthLeft = 8;
  walkRec(rootAbs, '', depthLeft, out);
  return out;
}

function walkRec(dirAbs, relDir, depthLeft, out) {
  if (depthLeft < 0) return;
  if (!fs.existsSync(dirAbs)) return;
  let entries = [];
  try {
    entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort(function (a, b) {
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
  for (const entry of entries) {
    const rel = posixJoin(relDir, entry.name);
    if (isSkippedScanDir(entry.name, relDir)) continue;
    const abs = path.join(dirAbs, entry.name);
    if (entry.isDirectory()) {
      walkRec(abs, rel, depthLeft - 1, out);
    } else if (entry.isFile()) {
      out.push({ abs, rel });
    }
  }
}

function isManifestRel(rel) {
  return rel === 'dsh.plugin.json' || rel.endsWith('/dsh.plugin.json');
}

/**
 * 面板台账/归档目录判定（D-UI-06）。
 * 保管区（保管档 body 子树）、写入备份、预设备份、doctor 链接备份都是**留痕归档**，
 * 不是活体注册面。归档里的 dsh.plugin.json 曾被当成在案本体重复登记 ⇒ 真卸载+恢复后
 * reg.name-collision 误报 error（C3④ 要求 doctor 0/0/0）。
 */
function isPanelArchiveRel(rel) {
  const segs = String(rel).split('/');
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    if (!s) continue;
    if (s === 'preset-backups' || s.indexOf('.panel-') === 0 || s.indexOf('.doctor-') === 0) return true;
  }
  return false;
}

function isJsonRel(rel) {
  return rel.endsWith('.json');
}

function isYamlCordisRel(rel) {
  return rel.endsWith('.cordis.yml') || rel === 'cordis.patch.yml' || rel.endsWith('/cordis.patch.yml');
}

function isHotConfigRel(rel) {
  return /^dsh-[^/]+\.json$/.test(rel);
}

function readRecord(root, rel, abs) {
  const buf = fs.readFileSync(abs);
  const text = buf.toString('utf8');
  const bom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const stat = fs.statSync(abs);
  let kind = 'text';
  if (isManifestRel(rel)) kind = 'manifest';
  else if (isJsonRel(rel)) kind = 'json';
  else if (isYamlCordisRel(rel)) kind = 'yaml';
  const inBackupDir = rel.split('/').some(function (seg) { return seg.indexOf('.bak-') !== -1; });
  return {
    root,
    rel,
    abs,
    text,
    bom,
    mtimeMs: stat.mtimeMs,
    kind,
    inBackupDir,
    protected: inBackupDir,
  };
}

function sortRecords(records) {
  return records.sort(function (a, b) {
    if (a.root !== b.root) return a.root < b.root ? -1 : 1;
    if (a.rel !== b.rel) return a.rel < b.rel ? -1 : 1;
    return 0;
  });
}

async function discoverReadRecords(scopeRoot, configRoot, profileRoot) {
  for (const root of [scopeRoot, configRoot, profileRoot]) {
    if (!root || !fs.existsSync(root)) {
      throw new DoctorRootError('根目录不存在: ' + String(root));
    }
  }
  const records = [];
  const scopeRelSet = new Set();
  for (const entry of walkAll(scopeRoot, 8)) {
    const rel = toPosix(entry.rel);
    // P2.4 施工批1：scope 根补读面板信号声明/预设状态/保管区 manifest（json 记录，
    // 供 mount/provider 提示级检查消费；文件缺席 = 信号未声明 = 检查静默跳过）。
    const isPanelCustodyJson = rel.indexOf('.panel-custody/') === 0
      && (rel === '.panel-custody/soft-uninstalls.json' || rel.endsWith('/manifest.json'));
    const isScopeJson = (rel === 'doctor-signals.json' || rel === 'preset-patch-state.json');
    // 归档目录里的 dsh.plugin.json 不算在案本体（D-UI-06）
    const manifestOk = isManifestRel(rel) && !isPanelArchiveRel(rel);
    if (manifestOk || isPanelCustodyJson || isScopeJson
        || ((rel === 'package.json' || rel === 'cordis.patch.yml') && rel.indexOf('/') === -1)) {
      if (!scopeRelSet.has(rel)) {
        scopeRelSet.add(rel);
        records.push(readRecord('scope', rel, entry.abs));
      }
    }
  }

  const profilePrefix = 'profiles/';
  const configRelSet = new Set();
  for (const entry of walkAll(configRoot, 8)) {
    const rel = toPosix(entry.rel);
    if (rel.startsWith(profilePrefix)) continue;
    const inAgentPresets = rel.startsWith('.agent-presets/') && rel.endsWith('.cordis.yml');
    const homePatch = rel === 'cordis.patch.yml';
    const hotJson = isHotConfigRel(rel);
    if (inAgentPresets || homePatch || hotJson) {
      if (!configRelSet.has(rel)) {
        configRelSet.add(rel);
        records.push(readRecord('config', rel, entry.abs));
      }
    }
  }

  const profileRelSet = new Set();
  for (const entry of walkAll(profileRoot, 4)) {
    const rel = toPosix(entry.rel);
    if (rel === 'package.json' || rel === 'cordis.patch.yml') {
      if (!profileRelSet.has(rel)) {
        profileRelSet.add(rel);
        records.push(readRecord('profile', rel, entry.abs));
      }
    }
  }

  return sortRecords(records);
}

function parseJsonText(text) {
  const clean = stripBom(text);
  try {
    return JSON.parse(clean);
  } catch {
    return undefined;
  }
}

function manifestIssue(rec, id, message, severity, extra) {
  const issue = {
    id,
    category: 'schema',
    severity: severity || 'error',
    root: rec.root,
    file: rec.rel,
    line: 1,
    occurrence: 1,
    message,
    old: null,
    new: null,
    fix: { class: 'manual', plan: [] },
  };
  if (extra) Object.assign(issue, extra);
  return issue;
}

function isExportsMacro(v) {
  return v && typeof v === 'object' && !Array.isArray(v) && v.$from === 'package.json#exports';
}

function validateManifest(rec, isSuite) {
  const issues = [];
  const parsed = rec.parsed;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    issues.push(manifestIssue(rec, 'schema.requirements-invalid', '清单根结构必须为对象。'));
    return issues;
  }
  // 【契约 v1.2 前置① · 根字段必填集撤销】（修法正典＝toolkit:docs/contract-v1.1-recon.md §8.3；
  // 立项＝toolkit:docs/debt.md C-2 前置清单第 1 项；令面＝EXE-BOOT-016 启动包第八节 3d）
  // 管辖权改述（原条文"manifestVersion/name/requirements 必填、缺则 error 并中止"作废）：
  //   · 三个 legacy 根字段的**必填性**不再由本 CLI 强制——纯契约 manifest 一律合法通过本面；
  //   · `requirements` **在场时**其键集与 `./` 目标存在性仍归本 CLI；**缺席时整段跳过**，
  //     这一"静默空转"不再是隐患：toolkit 侧对账网把它钉成可见断言
  //     （scripts/doctor-cli-contract-parity.mjs 的 B 段与 D16/D18 格）。
  // 在场字段的类型规则保留，但一律改为"给了才查"。
  if ('manifestVersion' in parsed && parsed.manifestVersion !== 1) {
    issues.push(manifestIssue(rec, 'schema.requirements-invalid', 'manifestVersion 必须为 1。', 'error', { old: parsed.manifestVersion }));
  }
  if ('name' in parsed && (typeof parsed.name !== 'string' || parsed.name.length === 0)) {
    issues.push(manifestIssue(rec, 'schema.requirements-invalid', 'name 必须为非空字符串。', 'error', { old: parsed.name }));
  }
  if ('id' in parsed && !/^[a-z0-9][a-z0-9-]{0,63}\/[a-z0-9][a-z0-9-]{0,63}$/.test(String(parsed.id))) {
    issues.push(manifestIssue(rec, 'schema.requirements-invalid', 'id 必须为命名空间式小写 id（<scope>/<name>）。', 'error', { old: parsed.id }));
  }
  if ('displayName' in parsed && (typeof parsed.displayName !== 'string' || parsed.displayName.length === 0)) {
    issues.push(manifestIssue(rec, 'schema.requirements-invalid', 'displayName 必须为非空字符串。', 'error', { old: parsed.displayName }));
  }
  if ('version' in parsed && (typeof parsed.version !== 'string' || parsed.version.length === 0)) {
    issues.push(manifestIssue(rec, 'schema.requirements-invalid', 'version 必须为非空字符串（semver）。', 'error', { old: parsed.version }));
  }
  if ('contract' in parsed && (typeof parsed.contract !== 'string' || parsed.contract.length === 0)) {
    issues.push(manifestIssue(rec, 'schema.requirements-invalid', 'contract 必须为非空字符串（契约版本范围）。', 'error', { old: parsed.contract }));
  }
  if ('configSchema' in parsed && (typeof parsed.configSchema !== 'object' || parsed.configSchema === null || Array.isArray(parsed.configSchema))) {
    issues.push(manifestIssue(rec, 'schema.requirements-invalid', 'configSchema 必须为 Schema 定义对象。', 'error', { old: typeof parsed.configSchema }));
  }
  const hasRequirements = 'requirements' in parsed
  if (hasRequirements && (typeof parsed.requirements !== 'object' || parsed.requirements === null || Array.isArray(parsed.requirements))) {
    issues.push(manifestIssue(rec, 'schema.requirements-invalid', 'requirements 必须为对象。', 'error', { old: parsed.requirements }));
    return issues;
  }
  for (const key of Object.keys(parsed)) {
    if (MANIFEST_TOP_KEYS.indexOf(key) === -1) {
      issues.push(manifestIssue(rec, 'schema.requirements-invalid', '清单根字段非法: ' + key + '。'));
    }
  }
  if ('optionalDeps' in parsed) {
    const optionalDeps = parsed.optionalDeps;
    if (!Array.isArray(optionalDeps) || optionalDeps.some(function (dep) { return typeof dep !== 'string' || dep.length === 0; })) {
      issues.push(manifestIssue(rec, 'schema.requirements-invalid', 'optionalDeps 必须为非空字符串数组。'));
    }
  }
  if ('requiredAliases' in parsed) {
    const requiredAliases = parsed.requiredAliases;
    if (!requiredAliases || typeof requiredAliases !== 'object' || Array.isArray(requiredAliases)) {
      issues.push(manifestIssue(rec, 'schema.requirements-invalid', 'requiredAliases 必须为对象映射旧名到新名。'));
    } else {
      for (const oldAlias of Object.keys(requiredAliases)) {
        if (typeof requiredAliases[oldAlias] !== 'string' || requiredAliases[oldAlias].length === 0) {
          issues.push(manifestIssue(rec, 'schema.requirements-invalid', 'requiredAliases 的值必须为非空字符串。'));
        }
      }
    }
  }
  const req = hasRequirements ? parsed.requirements : {}
  // 【前置① 连带】`requirements` 缺席时本 CLI 对它的一切键集/类型/入口规则**整段跳过**（＝recon §8.3
  // 说的那次"静默空转"自此显式化）。缺席不再产任何 requirements 相关 issue：req 取空对象哨兵，
  // 下面每一格都以 hasRequirements 为闸；这条"在场才管"的管辖权改述由 toolkit 侧对账网钉成
  // 可见断言（scripts/doctor-cli-contract-parity.mjs 的 B 段与 D 段）。
  if (hasRequirements) for (const key of REQUIREMENT_KEYS) {
    if (!(key in req)) {
      issues.push(manifestIssue(rec, 'schema.required-missing', 'requirements 缺少必填字段: ' + key + '。'));
    }
  }
  for (const key of Object.keys(req)) {
    if (REQUIREMENT_KEYS.indexOf(key) === -1) {
      issues.push(manifestIssue(rec, 'schema.requirements-invalid', 'requirements 字段非法: ' + key + '。'));
    }
  }
  const reqTypes = [
    ['runtime', 'object'],
    ['binaries', 'array'],
    ['packages', 'object'],
    ['registers', 'object'],
    ['exports', 'object'],
  ];
  for (const pair of reqTypes) {
    const key = pair[0];
    const expected = pair[0] === 'exports' ? (isSuite ? 'macro' : 'object') : pair[1];
    if (key in req) {
      const v = req[key];
      const ok = expected === 'array' ? Array.isArray(v) : (expected === 'macro' ? isExportsMacro(v) : (v && typeof v === 'object' && !Array.isArray(v)));
      if (!ok) {
        issues.push(manifestIssue(rec, 'schema.requirements-invalid', 'requirements.' + key + ' 必须为 ' + expected + '。', 'error', { old: v }));
      }
    }
  }
  const ex = req.exports;
  if (isExportsMacro(ex)) {
    if (!isSuite) {
      issues.push(manifestIssue(rec, 'schema.requirements-invalid', '只有套件根清单可以使用 $from 继承指针：' + JSON.stringify(ex.exports || ex.$from) + '。', 'error', { old: ex }));
    }
    if (Object.keys(ex).filter(function (k) { return k !== '$from'; }).length > 0) {
      issues.push(manifestIssue(rec, 'schema.requirements-invalid', '套件 exports 只能有 $from 键，禁止实体声明。', 'error', { old: ex }));
    }
  }
  // 本行原为 `Object.keys(ex)` 直取：套件清单 requirements **在场但 exports 缺席**时当场抛
  // "Cannot convert undefined or null to object"（**先于本批既存**的潜在崩溃，由笔 3 的"在场缺键"
  // 夹具第一次暴露——此前无任何用例覆盖这一形态，见 EXE-BOOT-016 批末申报第五节）。
  // 修法只加存在性闸，判据语义不变：exports 缺席＝本条不适用（键集缺名由上方 REQUIREMENT_KEYS 循环报）。
  if (hasRequirements && isSuite && ex && typeof ex === 'object' && !Array.isArray(ex) && Object.keys(ex).length > 0 && !ex.$from) {
    issues.push(manifestIssue(rec, 'schema.requirements-invalid', '套件根 exports 必须使用 { "$from": "package.json#exports" } 继承指针。', 'error', { old: ex }));
  }

  if ('aliases' in parsed) {
    if (!parsed.aliases || typeof parsed.aliases !== 'object' || Array.isArray(parsed.aliases)) {
      issues.push(manifestIssue(rec, 'schema.requirements-invalid', 'aliases 必须为对象映射旧名到新名。'));
    } else {
      for (const key of Object.keys(parsed.aliases)) {
        if (typeof parsed.aliases[key] !== 'string' || parsed.aliases[key].length === 0) {
          issues.push(manifestIssue(rec, 'schema.requirements-invalid', 'aliases 的值必须为非空字符串。'));
        }
      }
    }
  }
  if (isSuite) {
    if (!parsed.aliases || typeof parsed.aliases !== 'object' || Array.isArray(parsed.aliases)) {
      issues.push(manifestIssue(rec, 'schema.required-missing', '套件清单必须包含 aliases 表。'));
    }
    const requiredAliases = parsed.requiredAliases;
    if (requiredAliases && typeof requiredAliases === 'object' && !Array.isArray(requiredAliases)) {
      for (const oldAlias of Object.keys(requiredAliases)) {
        const requiredNew = requiredAliases[oldAlias];
        if (typeof requiredNew === 'string' && requiredNew.length > 0 && parsed.aliases[oldAlias] !== requiredNew) {
          issues.push(manifestIssue(rec, 'schema.requirements-invalid', '套件 aliases 必须包含映射 ' + oldAlias + ' → ' + requiredNew + '。'));
        }
      }
    }
  }
  return issues;
}

function buildSchemaIssues(records) {
  const issues = [];
  for (const rec of records) {
    if (rec.bom) {
      issues.push(manifestIssue(rec, 'schema.utf8-bom', '文件包含 UTF-8 BOM，必须保存为无 BOM UTF-8。', 'error', { old: '\\uFEFF' }));
    }
    const clean = stripBom(rec.text);
    if (rec.kind === 'manifest' || rec.kind === 'json') {
      try {
        rec.parsed = JSON.parse(clean);
      } catch (err) {
        const pos = Number(err.message.match(/position (\d+)/)?.[1] || 0);
        issues.push(manifestIssue(rec, 'schema.json-syntax', 'JSON 语法错误: ' + err.message, 'error', { line: jsonErrorLine(clean, pos) }));
        continue;
      }
    }
    if (rec.kind === 'manifest') {
      const isSuite = rec.root === 'scope' && rec.rel === 'dsh.plugin.json';
      validateManifest(rec, isSuite).forEach(function (issue) { issues.push(issue); });
    }
    if (rec.kind === 'yaml' && YAML) {
      try {
        YAML.parse(clean);
      } catch (err) {
        issues.push(manifestIssue(rec, 'schema.yaml-syntax', 'YAML 语法错误: ' + err.message, 'error'));
      }
    }
  }
  return issues;
}

function suiteExportsEffective(suiteManifest, suitePackageExports) {
  const src = suiteManifest && suiteManifest.requirements && suiteManifest.requirements.exports;
  if (src && typeof src === 'object' && !Array.isArray(src) && src.$from === 'package.json#exports') {
    if (suitePackageExports && typeof suitePackageExports === 'object' && !Array.isArray(suitePackageExports)) return suitePackageExports;
    return {};
  }
  if (src && typeof src === 'object' && !Array.isArray(src)) return src;
  return {};
}

function buildResolvableSet(suiteManifest, manifests, registryPlugins, suitePackageExports) {
  const set = new Set();
  if (suiteManifest && typeof suiteManifest.name === 'string') set.add(suiteManifest.name);
  const exports = suiteExportsEffective(suiteManifest, suitePackageExports);
  for (const key of Object.keys(exports)) {
    if (key === '.') {
      set.add(suiteManifest.name);
    } else if (key.startsWith('./')) {
      set.add(suiteManifest.name + '/' + key.slice(2));
    }
  }
  for (const manifest of manifests) {
    if (manifest && typeof manifest.name === 'string') set.add(manifest.name);
  }
  if (Array.isArray(registryPlugins)) {
    for (const name of registryPlugins) {
      if (typeof name === 'string' && name.length) set.add(name);
    }
  }
  return set;
}

function getAliases(suiteManifest) {
  if (suiteManifest && suiteManifest.aliases && typeof suiteManifest.aliases === 'object') return suiteManifest.aliases;
  return {};
}

function buildAliasTargetIssues(suiteRecord, suiteManifest, resolvableSet) {
  const issues = [];
  const aliases = getAliases(suiteManifest);
  for (const key of Object.keys(aliases)) {
    const value = aliases[key];
    if (!resolvableSet.has(value)) {
      issues.push({
        id: 'schema.alias-target-unresolvable',
        category: 'schema',
        severity: 'error',
        root: 'scope',
        file: suiteRecord ? suiteRecord.rel : 'dsh.plugin.json',
        line: 1,
        occurrence: 1,
        message: 'aliases 表条目 ' + key + ' → ' + value + ' 的目标不在可解析集合中。',
        old: value,
        new: null,
        fix: { class: 'manual', plan: [] },
      });
    }
  }
  return issues;
}

function buildExportTargetIssues(records) {
  const issues = [];
  for (const rec of records) {
    if (rec.kind !== 'manifest' || !rec.parsed || !rec.parsed.requirements) continue;
    const exports = rec.parsed.requirements.exports;
    if (!exports || typeof exports !== 'object' || Array.isArray(exports)) continue;
    if (exports.$from) continue;
    for (const key of Object.keys(exports)) {
      const value = exports[key];
      if (typeof value !== 'string' || !value.startsWith('./')) continue;
      const target = path.resolve(rec.abs, '..', value);
      if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
        issues.push({
          id: 'schema.exports-target-missing',
          category: 'schema',
          severity: 'error',
          root: rec.root,
          file: rec.rel,
          line: 1,
          occurrence: 1,
          message: 'exports 条目 ' + key + ' → ' + value + ' 指向的目标文件不存在。',
          old: value,
          new: null,
          fix: { class: 'manual', plan: [] },
        });
      }
    }
  }
  return issues;
}

function referenceIssue(rec, matched, aliases, resolvableSet, index, occurrence) {
  const isAlias = Object.prototype.hasOwnProperty.call(aliases, matched);
  if (resolvableSet.has(matched)) return null;
  const globalIdx = index;
  if (rec.inBackupDir) {
    return {
      id: 'ref.stale-in-backup',
      category: 'reference',
      severity: 'info',
      root: rec.root,
      file: rec.rel,
      line: lineAt(rec.text, globalIdx),
      occurrence,
      message: '备份文件引用了失效注册名 ' + matched + '；恢复该备份会重新引入失效引用。',
      old: matched,
      new: isAlias ? aliases[matched] : null,
      fix: { class: 'manual', plan: [] },
    };
  }
  if (isAlias) {
    const newName = aliases[matched];
    return {
      id: 'ref.unresolvable-local',
      category: 'reference',
      severity: 'error',
      root: rec.root,
      file: rec.rel,
      line: lineAt(rec.text, globalIdx),
      occurrence,
      message: '文件引用了已收编旧注册名 ' + matched + '，应改为 ' + newName + '。',
      old: matched,
      new: newName,
      fix: {
        class: 'rewrite',
        plan: [
          {
            op: 'replace',
            root: rec.root,
            file: rec.rel,
            old: matched,
            new: newName,
            occurrence,
          },
        ],
      },
    };
  }
  return {
    id: 'ref.unresolvable-local',
    category: 'reference',
    severity: 'error',
    root: rec.root,
    file: rec.rel,
    line: lineAt(rec.text, globalIdx),
    occurrence,
    message: '文件引用了无法解析的 @local/ 注册名 ' + matched + '。',
    old: matched,
    new: null,
    fix: { class: 'manual', plan: [] },
  };
}

function buildReferenceIssues(records, resolvableSet, aliases) {
  const issues = [];
  for (const rec of records) {
    let surface = rec.text;
    if (rec.kind === 'manifest' && rec.parsed) {
      if (rec.parsed.aliases && typeof rec.parsed.aliases === 'object') {
        surface = maskJsonBlock(surface, '"aliases"');
      }
      if (rec.parsed.requiredAliases && typeof rec.parsed.requiredAliases === 'object') {
        surface = maskJsonBlock(surface, '"requiredAliases"');
      }
    }
    const seen = {};
    REF_RE.lastIndex = 0;
    let match = REF_RE.exec(surface);
    while (match !== null) {
      seen[match[0]] = (seen[match[0]] || 0) + 1;
      const issue = referenceIssue(rec, match[0], aliases, resolvableSet, match.index, seen[match[0]]);
      if (issue) issues.push(issue);
      match = REF_RE.exec(surface);
    }
  }
  return issues;
}

function sortIssues(issues) {
  function normFile(file) {
    return file === null || file === undefined ? '' : String(file);
  }
  function normLine(line) {
    return line === null || line === undefined ? 0 : Number(line);
  }
  function normOcc(issue) {
    return issue.occurrence === null || issue.occurrence === undefined ? 1 : Number(issue.occurrence);
  }
  return issues.sort(function (a, b) {
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    const af = normFile(a.file);
    const bf = normFile(b.file);
    if (af !== bf) return af < bf ? -1 : 1;
    const al = normLine(a.line);
    const bl = normLine(b.line);
    if (al !== bl) return al < bl ? -1 : 1;
    if (a.root !== b.root) return a.root < b.root ? -1 : 1;
    const ao = normOcc(a);
    const bo = normOcc(b);
    if (ao !== bo) return ao < bo ? -1 : 1;
    const aj = JSON.stringify(a.old || null) + JSON.stringify(a.new || null);
    const bj = JSON.stringify(b.old || null) + JSON.stringify(b.new || null);
    if (aj !== bj) return aj < bj ? -1 : 1;
    return 0;
  });
}

function parseVer(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/^v/, '');
  const m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?$/.exec(s);
  if (!m) return null;
  return { major: Number(m[1]), minor: m[2] === undefined ? 0 : Number(m[2]), patch: m[3] === undefined ? 0 : Number(m[3]), pre: m[4] || null };
}

function cmpVer(a, b) {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  if ((a.pre === null) !== (b.pre === null)) return a.pre === null ? 1 : -1;
  if (a.pre === null && b.pre === null) return 0;
  const ap = a.pre.split('.'); const bp = b.pre.split('.');
  const n = Math.max(ap.length, bp.length);
  for (let i = 0; i < n; i++) {
    const x = ap[i] === undefined ? '' : ap[i];
    const y = bp[i] === undefined ? '' : bp[i];
    const xn = /^\d+$/.test(x) ? Number(x) : null;
    const yn = /^\d+$/.test(y) ? Number(y) : null;
    if (xn !== null && yn !== null) { if (xn !== yn) return xn < yn ? -1 : 1; }
    else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

function contractRange(range) {
  return String(range || '').trim().replace(/\s+\|\|\s+/g, '||');
}

export function satisfiesVersion(version, range) {
  const vp = parseVer(String(version));
  if (!vp) return false;
  const text = contractRange(range);
  if (!text) return false;
  const branches = text.split('||');
  for (let branchRaw of branches) {
    const branch = branchRaw.trim();
    if (!branch) continue;
    if (branch === '*' || branch === 'any') return true;
    let matched = true;
    if (branch.startsWith('^')) {
      const base = parseVer(branch.slice(1));
      if (!base) return false;
      let upper;
      if (base.major > 0) upper = { major: base.major + 1, minor: 0, patch: 0, pre: null };
      else if (base.minor > 0) upper = { major: 0, minor: base.minor + 1, patch: 0, pre: null };
      else upper = { major: 0, minor: 0, patch: base.patch + 1, pre: null };
      matched = cmpVer(vp, base) >= 0 && cmpVer(vp, upper) < 0;
    } else if (branch.startsWith('~')) {
      const base = parseVer(branch.slice(1));
      if (!base) return false;
      const upper = { major: base.major, minor: base.minor + 1, patch: 0, pre: null };
      matched = cmpVer(vp, base) >= 0 && cmpVer(vp, upper) < 0;
    } else if (branch.includes('.x') || branch.includes('.*')) {
      const raw = branch.replace(/\*/g, 'x');
      const parts = raw.split('.');
      matched = true;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim();
        if (part === 'x' || part === '*') break;
        if (i === 0 && vp.major !== Number(part)) { matched = false; break; }
        if (i === 1 && vp.minor !== Number(part)) { matched = false; break; }
        if (i === 2 && vp.patch !== Number(part)) { matched = false; break; }
      }
    } else {
      const re = /(>=|<=|>|<|=)?\s*([0-9][0-9A-Za-z.-]*)/g;
      let m; let left = 0;
      while ((m = re.exec(branch))) {
        left = re.lastIndex;
        const op = m[1] || '=';
        const target = parseVer(m[2]);
        if (!target) { matched = false; break; }
        const c = cmpVer(vp, target);
        if (op === '>=' && c < 0) { matched = false; break; }
        if (op === '>' && c <= 0) { matched = false; break; }
        if (op === '<=' && c > 0) { matched = false; break; }
        if (op === '<' && c >= 0) { matched = false; break; }
        if (op === '=' && c !== 0) { matched = false; break; }
      }
      if (left === 0 && /^[0-9]/.test(branch)) {
        const exact = parseVer(branch);
        matched = exact ? cmpVer(vp, exact) === 0 : false;
      }
    }
    if (matched) return true;
  }
  return false;
}

function findInPath(name, extOrder) {
  if (!name || name.includes('/') || name.includes('\\')) return null;
  const pathEnv = process.env.PATH || '';
  const exts = extOrder || (process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat', '.com'] : ['']);
  const dirs = pathEnv.split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    for (const ext of exts) {
      const p = path.join(dir, name + ext);
      try {
        if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
      } catch {
      }
    }
  }
  return null;
}

// ── R4 · 宿主版本读数（落差条目 F-61 / 令面高危④）─────────────────────────────────────
// 取值顺位：显式 opts.hostVersion（CLI 的 --host-version）> DSH_DOCTOR_HOST_VERSION >
// 宿主自述探测（dsh --version）> HOST_VERSION_UNKNOWN。
// 旧实现是 env 缺席时兜底一个 0.1.2-rc.1 —— 那是 09-15 的一个快照，宿主升版后它冒充当前宿主参与
// runtime.dsh 比对，"整仓误判"没有任何对出面。**"我不知道"必须写成不知道**：未知即跳过比对，
// 并把 'unknown' 如实挂在 environment.hostVersion 上（可见，不静默、也不产 issue 打断 0/0/0）。
const HOST_VERSION_UNKNOWN = 'unknown';
const HOST_VERSION_PROBE_TIMEOUT_MS = 3000;

// 跑一次 `dsh --version` 并取首行版本形态；任何不干净的结果都归"取不到"（返回 null）。
// Windows 上 npm 装出来的其实是壳：`dsh`（裸 POSIX sh 脚本，Node 直接 spawn 不了）与
// `dsh.cmd`；而 .cmd/.bat 自 Node 18 的 security change 起必须经 cmd.exe 转手，否则 EINVAL。
// ⇒ 候选顺序（壳优先、裸文件殿后）与调用方式都得挑，不能一把 spawn 了事。
function readVersionFromHostCli(exe) {
  let res;
  try {
    if (/\.(cmd|bat)$/i.test(exe)) {
      res = spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', exe, '--version'],
        { encoding: 'utf8', timeout: HOST_VERSION_PROBE_TIMEOUT_MS, windowsHide: true });
    } else {
      res = spawnSync(exe, ['--version'],
        { encoding: 'utf8', timeout: HOST_VERSION_PROBE_TIMEOUT_MS, windowsHide: true });
    }
  } catch {
    return null;
  }
  if (!res || res.error || res.status !== 0) return null;
  const first = String(res.stdout || '')
    .split(/\r?\n/)
    .map(function (line) { return line.trim(); })
    .find(Boolean);
  if (!first || !/^\d+(?:\.\d+)?\S*/.test(first)) return null; // 认不出版本形态就归未知，不猜
  return first;
}

function defaultHostVersionProbe() {
  const extCandidates = process.platform === 'win32' ? ['.cmd', '.bat', '.exe', ''] : [''];
  for (const ext of extCandidates) {
    const exe = findInPath('dsh', [ext]);
    if (!exe) continue;
    const version = readVersionFromHostCli(exe);
    if (version) return version;
  }
  return null;
}

function resolveHostVersion(opts) {
  const flag = opts && opts.hostVersion;
  if (typeof flag === 'string' && flag.trim()) return flag.trim();
  const env = process.env.DSH_DOCTOR_HOST_VERSION;
  if (typeof env === 'string' && env.trim()) return env.trim();
  const probe = opts && typeof opts.hostVersionProbe === 'function' ? opts.hostVersionProbe : defaultHostVersionProbe;
  let detected = null;
  try {
    detected = probe();
  } catch {
    detected = null; // 探测自身抛错 = 取不到，同样归未知
  }
  if (typeof detected === 'string' && detected.trim()) return detected.trim();
  return HOST_VERSION_UNKNOWN;
}

function nearestPackageJson(manifestAbs, scopeRoot) {
  let dir = path.dirname(manifestAbs);
  const root = path.resolve(scopeRoot || dir);
  for (let depth = 0; depth < 8; depth++) {
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg) && fs.statSync(pkg).isFile()) return pkg;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    const rel = path.relative(root, dir);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
    dir = parent;
  }
  return null;
}

function findPackageVersion(resolvedSpec) {
  let dir = path.dirname(resolvedSpec);
  for (let depth = 0; depth < 10; depth++) {
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg) && fs.statSync(pkg).isFile()) {
      try {
        const parsed = JSON.parse(stripBom(fs.readFileSync(pkg, 'utf8')));
        if (parsed && typeof parsed.version === 'string') return { dir, version: parsed.version, name: parsed.name || null };
      } catch {
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

function buildEnvIssues(records, hostVersion, nodeVersion) {
  const issues = [];
  const manifests = records.filter(function (rec) { return rec.kind === 'manifest' && rec.parsed && rec.parsed.requirements; });
  for (const rec of manifests) {
    const runtime = rec.parsed.requirements.runtime || {};
    if (typeof runtime.node === 'string' && runtime.node && !satisfiesVersion(nodeVersion, runtime.node)) {
      issues.push({
        id: 'env.node-version-mismatch',
        category: 'env',
        severity: 'error',
        root: rec.root,
        file: rec.rel,
        line: 1,
        occurrence: 1,
        message: 'Node 版本不满足：清单要求 ' + runtime.node + '，当前为 ' + nodeVersion + '。请升级 Node 或修正清单 runtime.node 范围。',
        old: runtime.node,
        new: null,
        fix: { class: 'manual', plan: [] },
      });
    }
    // R4：宿主版本未知时**跳过** runtime.dsh 比对（不产 issue）—— 未知不等于冒充一个具体版本。
    if (hostVersion !== HOST_VERSION_UNKNOWN
        && typeof runtime.dsh === 'string' && runtime.dsh && !satisfiesVersion(hostVersion, runtime.dsh)) {
      issues.push({
        id: 'env.dsh-version-mismatch',
        category: 'env',
        severity: 'error',
        root: rec.root,
        file: rec.rel,
        line: 1,
        occurrence: 1,
        message: 'dsh 宿主版本不满足：清单要求 ' + runtime.dsh + '，当前为 ' + hostVersion + '。请升级宿主或修正清单 runtime.dsh 范围。',
        old: runtime.dsh,
        new: null,
        fix: { class: 'manual', plan: [] },
      });
    }
    const binaries = rec.parsed.requirements.binaries;
    if (Array.isArray(binaries)) {
      for (const bin of binaries) {
        if (!bin || typeof bin.name !== 'string' || !bin.name) continue;
        if (!findInPath(bin.name)) {
          issues.push({
            id: 'env.binary-missing',
            category: 'env',
            severity: 'error',
            root: rec.root,
            file: rec.rel,
            line: 1,
            occurrence: 1,
            message: '二进制依赖 "' + bin.name + '" 未在 PATH 中找到。请安装并确保 PATH 可用' + (bin.hint ? '；提示：' + bin.hint : '') + '。',
            old: bin.name,
            new: null,
            fix: { class: 'manual', plan: [] },
          });
        }
      }
    }
  }
  return issues;
}

function buildPackageIssues(records, options) {
  const issues = [];
  const suitePkgRec = records.find(function (rec) { return rec.root === 'scope' && rec.rel === 'package.json'; });
  if (!suitePkgRec || !suitePkgRec.parsed) return issues;
  const manifests = records.filter(function (rec) { return rec.kind === 'manifest' && rec.parsed && rec.parsed.requirements; });
  for (const rec of manifests) {
    const packages = rec.parsed.requirements.packages || {};
    if (!packages || typeof packages !== 'object' || Array.isArray(packages)) continue;
    for (const packageName of Object.keys(packages)) {
      const desc = packages[packageName];
      if (!desc || typeof desc !== 'object') continue;
      if (!desc.$from) continue;
      const m = /^package\.json#(dependencies|devDependencies|peerDependencies|optionalDependencies)$/.exec(String(desc.$from));
      const pkgPath = nearestPackageJson(rec.abs, options.scopeRoot);
      if (!m || !pkgPath) {
        issues.push({
          id: 'schema.$from-dangling',
          category: 'schema',
          severity: 'error',
          root: rec.root,
          file: rec.rel,
          line: 1,
          occurrence: 1,
          message: 'packages.' + packageName + '.$from 指向的 package.json 节点不存在或指针非法: ' + String(desc.$from) + '。',
          old: String(desc.$from),
          new: null,
          fix: { class: 'manual', plan: [] },
        });
        continue;
      }
      let pkg;
      try {
        pkg = JSON.parse(stripBom(fs.readFileSync(pkgPath, 'utf8')));
      } catch {
        pkg = null;
      }
      const section = m[1];
      const collection = pkg && pkg[section];
      if (!pkg || typeof collection !== 'object' || Array.isArray(collection) || !collection || !Object.prototype.hasOwnProperty.call(collection, packageName)) {
        issues.push({
          id: 'schema.$from-dangling',
          category: 'schema',
          severity: 'error',
          root: rec.root,
          file: rec.rel,
          line: 1,
          occurrence: 1,
          message: 'packages.' + packageName + '.$from 指向 package.json#' + section + '，但该节点不存在或没有包 ' + packageName + '。',
          old: String(desc.$from),
          new: null,
          fix: { class: 'manual', plan: [] },
        });
        continue;
      }
      const declaredRange = collection[packageName];
      let resolved;
      let resolveDetail;
      try {
        resolved = createRequire(suitePkgRec.abs).resolve(packageName);
        const real = fs.realpathSync.native ? fs.realpathSync.native(resolved) : fs.realpathSync(resolved);
        resolveDetail = real || resolved;
      } catch (err) {
        resolved = null;
        resolveDetail = err && err.message || '未解析';
      }
      if (!resolved) {
        issues.push({
          id: 'pkg.missing-dependency',
          category: 'package',
          severity: 'error',
          root: rec.root,
          file: rec.rel,
          line: 1,
          occurrence: 1,
          message: '依赖 ' + packageName + ' 未解析（从套件入口 ' + suitePkgRec.abs + ' 按 Node 解析算法模拟：' + resolveDetail + '）。可执行 install-package 安装到 ' + rec.root + ' 根的 node_modules。',
          old: packageName,
          new: declaredRange,
          fix: {
            class: 'rewrite',
            plan: [
              {
                op: 'install-package',
                root: rec.root,
                file: null,
                old: packageName,
                new: declaredRange,
                occurrence: 1,
              },
            ],
          },
        });
        continue;
      }
      for (const extraPkgPath of [nearestPackageJson(resolved, options.scopeRoot)]) {
        const found = findPackageVersion(resolved);
        if (!found) continue;
        if (!satisfiesVersion(found.version, declaredRange)) {
          issues.push({
            id: 'pkg.version-violation',
            category: 'package',
            severity: 'error',
            root: rec.root,
            file: rec.rel,
            line: 1,
            occurrence: 1,
            message: '依赖 ' + packageName + ' 已安装版本 ' + found.version + ' 不满足声明范围 ' + declaredRange + '（实际解析路径 ' + resolveDetail + '）。',
            old: declaredRange,
            new: found.version,
            fix: { class: 'manual', plan: [] },
          });
        }
      }
    }
  }
  return issues;
}

function walkSourceFiles(rootAbs) {
  const out = [];
  const stack = [''];
  while (stack.length) {
    const relDir = stack.pop();
    const dirAbs = relDir ? path.join(rootAbs, relDir) : rootAbs;
    let entries;
    try {
      entries = fs.readdirSync(dirAbs, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort(function (a, b) {
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
    for (const entry of entries) {
      if (isSkippedScanDir(entry.name, relDir)) continue;
      if (entry.name.indexOf('.bak-') !== -1) continue;
      const rel = relDir ? relDir + '/' + entry.name : entry.name;
      const abs = path.join(dirAbs, entry.name);
      if (entry.isDirectory()) {
        stack.push(rel);
      } else if (entry.isFile() && /\.(mjs|cjs|js|mts|cts|ts|tsx|jsx)$/i.test(entry.name)) {
        out.push({ abs, rel: toPosix(rel) });
      }
    }
  }
  return out;
}

function extractBareImports(text) {
  const out = [];
  const patterns = [
    /(?:^|\n)\s*import\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*export\s+[^'"]*?\s+from\s+['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[1]) {
        const kw = m[0].search(/\b(?:import|export|require)\b/);
        out.push({ specifier: m[1], index: m.index, keywordIndex: m.index + (kw >= 0 ? kw : 0) });
      }
    }
  }
  return out;
}

function isBareSpecifier(spec) {
  if (!spec || spec.length === 0) return false;
  if (spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('\\')) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(spec)) return false;
  const builtins = new Set(['assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console', 'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain', 'events', 'fs', 'http', 'http2', 'https', 'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring', 'readline', 'repl', 'stream', 'string_decoder', 'sys', 'timers', 'tls', 'trace_events', 'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib', 'test', 'sqlite']);
  return !builtins.has(spec);
}

function realpathOrSame(p) {
  try {
    return fs.realpathSync.native ? fs.realpathSync.native(p) : fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

function findPackageRoot(resolved) {
  let dir;
  try {
    const st = fs.statSync(resolved);
    dir = st.isDirectory() ? resolved : path.dirname(resolved);
  } catch {
    dir = path.dirname(resolved);
  }
  for (let depth = 0; depth < 16; depth++) {
    const parent = path.dirname(dir);
    const grand = path.dirname(parent);
    if (path.basename(parent).toLowerCase() === 'node_modules') return dir;
    if (path.basename(parent).startsWith('@') && path.basename(grand).toLowerCase() === 'node_modules') return dir;
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

function isInsideScope(scopeRoot, target) {
  const s = path.resolve(scopeRoot).toLowerCase();
  const t = path.resolve(target).toLowerCase();
  if (t === s) return true;
  const rel = path.relative(s, t);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function packageNameFromSpecifier(spec) {
  const parts = spec.split('/');
  if (spec.startsWith('@') && parts.length >= 2) return parts[0] + '/' + parts[1];
  return parts[0];
}

function packageNameFromRoot(pkgRoot) {
  const parts = pkgRoot.split(/[\\/]/);
  const idx = parts.lastIndexOf('node_modules');
  if (idx === -1) return pkgRoot;
  return parts.slice(idx + 1).join('/');
}

function buildPackageResolutionOutsideScopeIssues(scopeRoot) {
  const issues = [];
  const scopeReal = realpathOrSame(scopeRoot);
  const seen = new Map();
  for (const file of walkSourceFiles(scopeRoot)) {
    let text;
    try {
      text = fs.readFileSync(file.abs, 'utf8');
    } catch {
      continue;
    }
    for (const imp of extractBareImports(text)) {
      const spec = imp.specifier;
      if (!isBareSpecifier(spec)) continue;
      let resolved;
      try {
        resolved = createRequire(file.abs).resolve(spec);
      } catch {
        continue;
      }
      if (!resolved || resolved === spec) continue;
      let search = [];
      try {
        search = createRequire(file.abs).resolve.paths(spec) || [];
      } catch {
        search = [];
      }
      let pkgRoot = findPackageRoot(resolved);
      if (!pkgRoot) {
        const specPkgName = packageNameFromSpecifier(spec);
        for (const sp of search) {
          const cand = path.join(sp, specPkgName);
          try {
            if (fs.existsSync(path.join(cand, 'package.json'))) {
              pkgRoot = cand;
              break;
            }
          } catch {
            // noop
          }
        }
      }
      if (!pkgRoot) continue;
      const pkgRootReal = realpathOrSame(pkgRoot);
      if (isInsideScope(scopeReal, pkgRootReal)) continue;
      const pkgName = packageNameFromRoot(pkgRoot);
      const key = pkgName + '\u0000' + pkgRootReal;
      if (seen.has(key)) continue;
      seen.set(key, true);
      const realResolved = realpathOrSame(resolved);
      const line = lineAt(text, imp.keywordIndex || imp.index);
      issues.push({
        id: 'pkg.resolution-outside-scope',
        category: 'package',
        severity: 'warning',
        root: 'scope',
        file: file.rel,
        line,
        occurrence: 1,
        message: '套件源码导入 ' + spec + ' 的 node_modules 实体 realpath 落在 scopeRoot 之外（导入位置 ' + file.rel + ':' + line + '；解析链: ' + search.join(' → ') + ' → 实体 ' + pkgRoot + ' → resolved ' + resolved + ' → realpath:' + realResolved + '；realpath 落点 ' + pkgRootReal + '）。此类跨目录手工链接禁止保留，应统一收编为套件根 node_modules 内的本地实体（或重新正规安装），不得继续依赖跨目录手工链接。',
        old: pkgName,
        new: null,
        fix: { class: 'manual', plan: [] },
      });
    }
  }
  return issues;
}

/**
 * F-62（W9 第一段，C1-007 裁）：提供面三槽正典读法——与 toolkit loader extractRegisters 同口径：
 * 逐槽 provides 优先、缺席回落 legacy requirements.registers（迁移期行为）；provides 槽位为空数组
 * 视为"已声明为空"，同样遮蔽 legacy（与 extractRegisters 的 Array.isArray 判据逐字一致）。
 * provides 根字段自批 1 入白名单（:47 零值校验）后，撞名规则自此真正读它。
 */
function registerSlotOf(parsed, cat) {
  const provides = parsed && parsed.provides;
  if (provides && Array.isArray(provides[cat])) return provides[cat];
  const reg = parsed && parsed.requirements && parsed.requirements.registers;
  return reg && Array.isArray(reg[cat]) ? reg[cat] : [];
}

function buildRegistrationIssues(records, hostFaces) {
  const issues = [];
  const manifests = records.filter(function (rec) { return rec.kind === 'manifest' && rec.parsed && rec.parsed.requirements; });
  const faceSet = new Set((hostFaces && Array.isArray(hostFaces.providedFaces) ? hostFaces.providedFaces : []).map(function (item) { return item.face; }));
  for (const cat of ['services', 'commands', 'providers']) {
    const owners = new Map();
    for (const rec of manifests) {
      const list = registerSlotOf(rec.parsed, cat);
      for (const name of list) {
        if (!name) continue;
        if (!owners.has(name)) owners.set(name, []);
        owners.get(name).push(rec);
      }
    }
    for (const [name, recs] of owners) {
      if (recs.length > 1) {
        issues.push({
          id: 'reg.name-collision',
          category: 'registration',
          severity: 'error',
          root: 'scope',
          file: recs[0].rel,
          line: 1,
          occurrence: 1,
          message: cat + ' 名 "' + name + '" 被 ' + recs.map(function (r) { return r.parsed.name || r.rel; }).sort().join('、') + ' 重复注册。需要人工决策归属，不提供自动修复。',
          old: name,
          new: null,
          fix: { class: 'manual', plan: [] },
        });
      }
    }
  }
  for (const rec of manifests) {
    const reg = rec.parsed.requirements.registers || {};
    const inject = Array.isArray(reg.inject) ? reg.inject : [];
    const seen = new Set();
    for (const face of inject) {
      if (!face || seen.has(face)) continue;
      seen.add(face);
      if (!faceSet.has(face)) {
        issues.push({
          id: 'reg.inject-face-unknown',
          category: 'registration',
          severity: 'warning',
          root: rec.root,
          file: rec.rel,
          line: 1,
          occurrence: 1,
          message: 'inject 面 "' + face + '" 不在宿主提供面清单中。提供面清单来源：doctor 包内置 host-faces.json（由宿主类型定义反查固化）。',
          old: face,
          new: null,
          fix: { class: 'manual', plan: [] },
        });
      }
    }
  }
  return issues;
}

function pluginNamesFromManifests(manifests, suiteName) {
  const names = [];
  const seen = new Set();
  for (const manifest of manifests) {
    if (manifest && typeof manifest.name === 'string' && !seen.has(manifest.name)) {
      seen.add(manifest.name);
      names.push(manifest.name);
    }
  }
  if (suiteName && !seen.has(suiteName)) {
    seen.add(suiteName);
    names.push(suiteName);
  }
  return names.sort();
}

function parseVersions(records, scopeRoot) {
  let toolkitVersion = '0.0.0';
  const suitePkg = records.find(function (rec) { return rec.root === 'scope' && rec.rel === 'package.json'; });
  if (suitePkg && suitePkg.parsed && typeof suitePkg.parsed.version === 'string') toolkitVersion = suitePkg.parsed.version;
  return toolkitVersion;
}

function installedAnchors(options) {
  const profileRoot = options.profileRoot;
  const anchors = [];
  if (options.installAnchorPath) anchors.push(options.installAnchorPath);
  else {
    const appData = process.env.APPDATA || '';
    if (appData) anchors.push(path.join(appData, 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'package.json'));
  }
  if (profileRoot) anchors.push(path.join(profileRoot, 'package.json'));
  return anchors.filter(function (p) { return fs.existsSync(p); });
}

function resolveBundlePackageDir(bundleName, profileRoot, installAnchorPath) {
  const profilePkgPath = path.join(profileRoot, 'package.json');
  const anchors = [];
  if (installAnchorPath && fs.existsSync(installAnchorPath)) anchors.push(installAnchorPath);
  if (fs.existsSync(profilePkgPath)) anchors.push(profilePkgPath);
  for (const anchor of anchors) {
    let searchPaths = [];
    try {
      searchPaths = createRequire(anchor).resolve.paths(bundleName) || [];
    } catch {
      searchPaths = [];
    }
    for (const searchPath of searchPaths) {
      const candidate = path.join(searchPath, bundleName);
      if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    }
  }
  return null;
}

function profileBundleNames(records) {
  const profilePkg = records.find(function (rec) { return rec.root === 'profile' && rec.rel === 'package.json'; });
  if (!profilePkg || !profilePkg.parsed || !profilePkg.parsed.dsh || !profilePkg.parsed.dsh.profile || !Array.isArray(profilePkg.parsed.dsh.profile.bundles)) return [];
  return profilePkg.parsed.dsh.profile.bundles.filter(function (name) { return typeof name === 'string' && name.length; });
}

function registryNamesFromProfile(records, profileRoot, installAnchorPath) {
  const names = [];
  for (const bundleName of profileBundleNames(records)) {
    names.push(bundleName);
    const dir = resolveBundlePackageDir(bundleName, profileRoot, installAnchorPath);
    if (!dir) continue;
    const pkgPath = path.join(dir, 'package.json');
    let pkg;
    try {
      pkg = JSON.parse(stripBom(fs.readFileSync(pkgPath, 'utf8')));
    } catch {
      continue;
    }
    if (!pkg.exports || typeof pkg.exports !== 'object' || Array.isArray(pkg.exports)) continue;
    for (const key of Object.keys(pkg.exports)) {
      if (key === '.') continue;
      if (key.startsWith('./') && !key.includes('*') && !key.endsWith('/')) {
        names.push(bundleName + '/' + key.slice(2));
      }
    }
  }
  return names;
}

// ---------------- P2.4 施工批1：卸载/恢复提示级检查（p24-design.md §5.4）----------------
// 机理：engine 侧**零硬编码插件名**——全部事实来自 scope 根的信号声明文件
// doctor-signals.json（hostProviderKeys / providerDependencies）与磁盘现状
// （lib manifests、patch 行、preset-patch-state、保管区 manifest）。
// 纪律：缺席/缺依赖类信号一律 info/warning，绝不产出 error（doctor 0 error 是验收底线）。

function parsePatchRowsLite(text) {
  // 轻量解析 cordis.patch.yml：每行的 id / name / web 行 config 直下键值（供宿主键检查）。
  const lines = String(text).split(/\r?\n/);
  const rows = [];
  let current = null;
  let webConfigIndent = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const idm = /^(\s*)- id:\s*([^#\s]+)/.exec(line);
    if (idm) {
      current = { id: idm[2], indent: idm[1].length, name: null, line: i + 1, config: {} };
      rows.push(current);
      webConfigIndent = -1;
      continue;
    }
    if (!current) continue;
    const km = /^(\s+)([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (!km) continue;
    const ki = km[1].length;
    if (ki <= current.indent) { current = null; webConfigIndent = -1; continue; }
    if (ki === current.indent + 2) {
      if (km[2] === 'name') current.name = (km[3].trim().replace(/^['"]|['"]$/g, ''));
      else if (km[2] === 'config') webConfigIndent = ki;
      else current.config[km[2]] = km[3].trim();
    } else if (webConfigIndent >= 0 && ki === webConfigIndent + 2) {
      current.config[km[2]] = km[3].trim();
    }
  }
  return rows;
}

function buildMountIssues(records) {
  const issues = [];
  const scopePatch = records.find(function (r) { return r.root === 'scope' && r.rel === 'cordis.patch.yml'; });
  if (!scopePatch) return issues;

  const signalsRec = records.find(function (r) { return r.root === 'scope' && r.rel === 'doctor-signals.json'; });
  const signals = signalsRec && signalsRec.parsed;
  if (!signals || typeof signals !== 'object') return issues; // 未声明信号 ⇒ 检查静默跳过

  const presetRec = records.find(function (r) { return r.root === 'scope' && r.rel === 'preset-patch-state.json'; });
  const presetState = presetRec && presetRec.parsed;

  // 本体在案：scope 下 lib/*/dsh.plugin.json → { name, providers }
  const bodies = [];
  for (const rec of records) {
    if (rec.root !== 'scope' || rec.kind !== 'manifest') continue;
    if (rec.rel.indexOf('lib/') !== 0 || rec.rel.indexOf('dsh.plugin.json') === -1) continue;
    const parsed = rec.parsed;
    if (!parsed || !parsed.name) continue;
    const providers = ((parsed.requirements || {}).registers || {}).providers || [];
    bodies.push({ name: parsed.name, rel: rec.rel, providers: providers });
  }

  // 保管区在档（真卸载存档）
  const custodyPlugins = {};
  for (const rec of records) {
    if (rec.root !== 'scope' || rec.rel.indexOf('.panel-custody/') !== 0) continue;
    if (!rec.rel.endsWith('/manifest.json')) continue;
    const m = rec.parsed;
    if (m && m.plugin && m.kind === 'true-uninstall') {
      if (!custodyPlugins[m.plugin] || rec.mtimeMs > custodyPlugins[m.plugin]) custodyPlugins[m.plugin] = rec.mtimeMs;
    }
  }

  // patch 行（scope 层；profile/home 层同 id 由同 id 覆盖语义兜底，此处以 scope 为主视口）
  const rows = parsePatchRowsLite(scopePatch.text);
  const mountedNames = {};
  for (const row of rows) if (row.name) mountedNames[row.name] = row;

  // 预设挂载面：只覆盖 signals 声明的「预设管理插件」（D-UI-07）。
  // 旧口径「任一预设 patched ⇒ 任何本体都算已挂载」会把 body-vs-mount 检查整体压哑
  // （A1⑦/A3⑥ 要求软卸载后仍产出缺席提示），故收窄到声明名单；未声明该字段时回退旧口径。
  const presetNames = Array.isArray(signals.presetManagedNames) ? signals.presetManagedNames : null;
  function presetMountedFor(pkgName) {
    if (!presetState || typeof presetState !== 'object') return false;
    if (presetNames) {
      const hit = presetNames.some(function (n) {
        return n && (pkgName === n || (pkgName && pkgName.indexOf(n + '/') === 0));
      });
      if (!hit) return false;
    }
    for (const id of Object.keys(presetState)) {
      const entry = presetState[id];
      try {
        if (entry && entry.file && entry.patchedSha && fs.existsSync(entry.file)
            && sha256Text(fs.readFileSync(entry.file, 'utf8')) === entry.patchedSha) return true;
      } catch (e) { /* 读不了视为未挂载 */ }
    }
    return false;
  }

  function push(id, severity, file, line, message) {
    issues.push({
      id: id,
      category: 'mount',
      severity: severity,
      root: 'scope',
      file: file,
      line: line || 1,
      occurrence: 1,
      message: message,
      old: null,
      new: null,
      fix: { class: 'manual', plan: [] },
    });
  }

  // ① body-vs-mount（挂载名匹配支持 exports 子路径：row name 可为 manifest.name + '/xxx'）
  const prefix = typeof signals.managedNamePrefix === 'string' ? signals.managedNamePrefix : null;
  function rowMountsBody(row, body) {
    return row.name === body.name || (body.name && row.name.indexOf(body.name + '/') === 0);
  }
  for (const body of bodies) {
    const mounted = rows.some(function (r) { return r.name && rowMountsBody(r, body); }) || presetMountedFor(body.name);
    if (!mounted) {
      if (custodyPlugins[body.name]) {
        push('mount.custody-archived', 'info', body.rel, 1,
          body.name + ' 本体在、未挂载、保管区有存档：面板「已卸载可恢复」态，可从面板一键恢复。');
      } else {
        push('mount.body-without-row', 'warning', body.rel, 1,
          body.name + ' 已安装未挂载（不在任何挂载面）：是否恢复？可从面板重新挂载，或核对是否为手工摘除。');
      }
    }
  }
  for (const row of rows) {
    if (!row.name) continue;
    // 只判本套件管理的行（信号声明 managedNamePrefix；面板自身 file:/// 行等外部行不判）
    if (!prefix || row.name.indexOf(prefix) !== 0) continue;
    const hasBody = bodies.some(function (b) { return rowMountsBody(row, b); });
    if (!hasBody) {
      const archived = Object.keys(custodyPlugins).some(function (n) { return row.name.indexOf(n) === 0; });
      if (!archived) {
        push('mount.row-without-body', 'warning', 'cordis.patch.yml', row.line,
          '挂载行 ' + row.id + '（' + row.name + '）存在但本体缺失：将加载失败。请恢复本体或摘除该行。');
      }
    }
  }

  // ② provider-reference-integrity（宿主键悬空引用）
  const registeredProviders = {};
  for (const b of bodies) for (const p of b.providers) registeredProviders[p] = true;
  const hostKeys = Array.isArray(signals.hostProviderKeys) ? signals.hostProviderKeys : [];
  for (const hk of hostKeys) {
    const row = rows.find(function (r) { return r.id === hk.rowId; });
    if (!row) continue;
    const value = row.config[hk.key];
    if (value === undefined || value === '' || value === 'null' || value === '~') continue; // unset = 系统缺省
    if (!registeredProviders[value]) {
      push('provider.dangling-reference', 'warning', 'cordis.patch.yml', row.line,
        '宿主键 ' + hk.rowId + '.' + hk.key + ' 引用的 provider「' + value + '」当前没有任何在案插件注册：悬挂引用，建议修复或从面板恢复。');
    }
  }

  // ③ missing-provider（挂载插件的功能依赖缺席）
  const deps = Array.isArray(signals.providerDependencies) ? signals.providerDependencies : [];
  for (const dep of deps) {
    const row = rows.find(function (r) { return r.id === dep.mountedRow; });
    if (!row || !row.name || !mountedNames[row.name]) continue; // 依赖方未挂载则无此问题
    const hasAny = (dep.requiresProviders || []).some(function (p) { return registeredProviders[p]; });
    if (!hasAny) {
      push('provider.missing-provider', 'warning', 'cordis.patch.yml', row.line,
        dep.warning || ('挂载行 ' + dep.mountedRow + ' 依赖的 provider（' + (dep.requiresProviders || []).join('/') + '）均未安装：相关功能不可用。'));
    }
  }

  return issues;
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export async function runDoctor(options) {
  const opts = options || {};
  const scopeRoot = path.resolve(opts.scopeRoot || process.env.DSH_DOCTOR_SCOPE_ROOT || 'D:\\dsh-plugins\\dsh-toolkit');
  const configRoot = path.resolve(opts.configRoot || process.env.DSH_DOCTOR_CONFIG_ROOT || path.join(os.homedir(), '.dsh'));
  const profileName = opts.profile || 'web';
  const profileRoot = path.resolve(opts.profileRoot || path.join(configRoot, 'profiles', profileName));

  const records = await discoverReadRecords(scopeRoot, configRoot, profileRoot);

  for (const rec of records) {
    if (rec.kind === 'manifest' || rec.kind === 'json') {
      rec.parsed = parseJsonText(rec.text);
    }
  }

  const schemaIssues = buildSchemaIssues(records);

  const manifestRecords = records.filter(function (rec) { return rec.kind === 'manifest'; });
  const allParsedManifests = manifestRecords
    .map(function (rec) { return rec.parsed; })
    .filter(function (parsed) { return parsed && typeof parsed === 'object' && !Array.isArray(parsed); });

  const suiteRecord = records.find(function (rec) {
    return rec.root === 'scope' && rec.rel === 'dsh.plugin.json';
  });
  const suiteManifest = suiteRecord && suiteRecord.parsed || undefined;
  const suitePackageRecord = records.find(function (rec) { return rec.root === 'scope' && rec.rel === 'package.json'; });
  const suitePackageExports = suitePackageRecord && suitePackageRecord.parsed && suitePackageRecord.parsed.exports || undefined;

  if (!suiteRecord) {
    schemaIssues.push({
      id: 'schema.missing-suite-manifest',
      category: 'schema',
      severity: 'error',
      root: 'scope',
      file: 'dsh.plugin.json',
      line: 1,
      occurrence: 1,
      message: '套件根 dsh.plugin.json 缺失；doctor 无法读取套件 exports/aliases 表，可解析集合回退到 profile manifest bundles 注册表推导。',
      old: null,
      new: null,
      fix: { class: 'manual', plan: [] },
    });
  }

  let registryPlugins = [];
  const registryNames = registryNamesFromProfile(records, profileRoot, opts.installAnchorPath);
  for (const name of registryNames) registryPlugins.push(name);
  if (opts.registryPlugins) {
    for (const name of opts.registryPlugins) registryPlugins.push(name);
  }
  if (opts.registryPath) {
    const regText = fs.readFileSync(path.resolve(opts.registryPath), 'utf8');
    const regParsed = JSON.parse(stripBom(regText));
    if (Array.isArray(regParsed)) for (const name of regParsed) registryPlugins.push(name);
    else if (regParsed && Array.isArray(regParsed.plugins)) for (const name of regParsed.plugins) registryPlugins.push(name);
  }

  const resolvableSet = buildResolvableSet(suiteManifest, allParsedManifests, registryPlugins, suitePackageExports);
  const aliases = getAliases(suiteManifest);

  const referenceIssues = buildReferenceIssues(records, resolvableSet, aliases);
  const selfCheckIssues = buildAliasTargetIssues(suiteRecord, suiteManifest, resolvableSet).concat(buildExportTargetIssues(records));
  const hostVersion = resolveHostVersion(opts);
  const envIssues = buildEnvIssues(records, hostVersion, process.versions.node);
  const packageIssues = buildPackageIssues(records, { scopeRoot: scopeRoot });
  const packageResolutionIssues = buildPackageResolutionOutsideScopeIssues(scopeRoot);
  const registrationIssues = buildRegistrationIssues(records, HOST_FACES);
  const mountIssues = buildMountIssues(records); // P2.4：卸载/恢复提示级三检查（零硬编码，signals 驱动）
  const issues = sortIssues(referenceIssues.concat(schemaIssues, selfCheckIssues, envIssues, packageIssues, packageResolutionIssues, registrationIssues, mountIssues));

  const summary = { error: 0, warning: 0, info: 0, safe: 0, rewrite: 0, destructive: 0, manual: 0, fixable: 0 };
  for (const issue of issues) {
    if (issue.severity === 'error') summary.error++;
    else if (issue.severity === 'warning') summary.warning++;
    else if (issue.severity === 'info') summary.info++;
    const cls = issue.fix && issue.fix.class;
    if (cls === 'safe') summary.safe++;
    else if (cls === 'rewrite') summary.rewrite++;
    else if (cls === 'destructive') summary.destructive++;
    else if (cls === 'manual') summary.manual++;
  }
  summary.fixable = summary.safe + summary.rewrite;

  let maxMtime = 0;
  for (const rec of records) {
    if (rec.mtimeMs > maxMtime) maxMtime = rec.mtimeMs;
  }
  if (maxMtime === 0) {
    try {
      maxMtime = fs.statSync(scopeRoot).mtimeMs;
    } catch {
      maxMtime = 0;
    }
  }
  const generatedAt = opts.now || new Date(maxMtime).toISOString();

  const toolkitVersion = parseVersions(records, scopeRoot);
  const pluginNames = pluginNamesFromManifests(allParsedManifests, suiteManifest && suiteManifest.name);

  return {
    schemaVersion: 1,
    generatedAt,
    scope: {
      root: scopeRoot,
      profile: profileName,
      plugins: pluginNames,
    },
    environment: {
      roots: {
        scope: scopeRoot,
        config: configRoot,
        profile: profileRoot,
      },
      configRoot,
      profileRoot,
      toolkitVersion,
      hostVersion,
      node: process.versions.node,
      platform: process.platform + '-' + process.arch,
    },
    summary,
    issues,
    dryRun: true,
  };
}