import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { satisfiesVersion } from './engine.mjs';

const FILE_OPS = new Set(['replace', 'insert', 'delete', 'create-file']);
const ALL_OPS = new Set([...FILE_OPS, 'install-package']);
const NON_SCAN_SEGMENTS = new Set(['node_modules', '.git', 'doctor-backups', 'preset-backups']);

export class DoctorApplyError extends Error {
  constructor(message, code, details) {
    super(message);
    this.name = 'DoctorApplyError';
    this.code = code;
    this.details = details || null;
  }
}

function toPosix(p) {
  return p.replace(/\\/g, '/');
}

function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function stampNow() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function nowIso() {
  return new Date().toISOString();
}

function atomicWriteJson(file, value) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, '.' + path.basename(file) + '.tmp-' + process.pid + '-' + Date.now());
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

export function isProtectedPath(absPath, opts) {
  const installPackage = !!(opts && opts.installPackage);
  const parts = path.resolve(absPath).split(path.sep).filter(function (seg) { return seg.length > 0; });
  return parts.some(function (seg) {
    if (seg.indexOf('.bak-') !== -1) return true;
    if (installPackage && seg === 'node_modules') return false;
    return NON_SCAN_SEGMENTS.has(seg);
  });
}

export function planString(value) {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
}

function countExactOccurrences(text, needle) {
  const indices = [];
  if (needle.length === 0) return { count: 0, indices };
  let from = 0;
  let idx = text.indexOf(needle, from);
  while (idx !== -1) {
    indices.push(idx);
    from = idx + needle.length;
    idx = text.indexOf(needle, from);
  }
  return { count: indices.length, indices };
}

function resolveRoot(report, root) {
  const roots = report && report.environment && report.environment.roots;
  if (!roots || typeof roots !== 'object') return null;
  const value = roots[root];
  if (typeof value !== 'string' || value.length === 0) return null;
  return path.resolve(value);
}

function resolveStepTarget(report, step) {
  if (!step || typeof step !== 'object') {
    throw new DoctorApplyError('plan step 必须为对象。', 'PLAN_STEP_INVALID', { step });
  }
  if (!ALL_OPS.has(step.op)) {
    throw new DoctorApplyError('不支持的 plan op: ' + step.op + '。', 'PLAN_OP_INVALID', { step });
  }
  if (!Object.prototype.hasOwnProperty.call(step, 'root')) {
    throw new DoctorApplyError('plan step 缺少 root。', 'PLAN_ROOT_MISSING', { step });
  }
  const rootDir = resolveRoot(report, step.root);
  if (!rootDir) {
    throw new DoctorApplyError('plan step root 不在 environment.roots 中: ' + step.root + '。', 'PLAN_ROOT_INVALID', { step });
  }
  if (step.op === 'install-package') {
    if (step.file !== null && step.file !== undefined) {
      throw new DoctorApplyError('install-package step 的 file 必须为 null。', 'PLAN_FILE_INVALID', { step });
    }
    if (typeof step.old !== 'string' || step.old.length === 0) {
      throw new DoctorApplyError('install-package step 的 old 必须为包名。', 'PLAN_PACKAGE_NAME_INVALID', { step });
    }
    const targetAbs = path.join(rootDir, 'node_modules', step.old);
    return { root: step.root, rootDir, file: null, abs: targetAbs, rel: toPosix(path.relative(rootDir, targetAbs)) };
  }
  if (typeof step.file !== 'string' || step.file.length === 0) {
    throw new DoctorApplyError('文件类 op 必须提供 file。', 'PLAN_FILE_MISSING', { step });
  }
  if (path.isAbsolute(step.file)) {
    throw new DoctorApplyError('plan file 必须是相对 root 的路径，不允许绝对路径。', 'PLAN_FILE_ABSOLUTE', { step });
  }
  const abs = path.resolve(rootDir, step.file);
  const rel = toPosix(path.relative(rootDir, abs));
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new DoctorApplyError('plan file 逃逸了所属 root。', 'PLAN_FILE_ESCAPES_ROOT', { step });
  }
  return { root: step.root, rootDir, file: step.file, abs, rel };
}

function planEntriesFromReport(report) {
  const entries = [];
  for (const issue of report && report.issues || []) {
    const plan = issue && issue.fix && Array.isArray(issue.fix.plan) ? issue.fix.plan : [];
    for (const step of plan) {
      entries.push({ issue, step, target: null });
    }
  }
  return entries;
}

function acquireApplyLock(configRoot) {
  const lockPath = path.join(configRoot, 'doctor-apply.lock');
  try {
    fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString(), host: os.hostname() }), { flag: 'wx' });
  } catch (err) {
    if (err && err.code === 'EEXIST') {
      throw new DoctorApplyError('另一个 doctor apply/rollback 实例正在运行。', 'LOCK_BUSY', { lockPath });
    }
    throw err;
  }
  return function release() {
    try { fs.unlinkSync(lockPath); } catch { /* noop */ }
  };
}

export function readPatchState(configRoot) {
  const file = path.join(configRoot, 'doctor-patch-state.json');
  if (!fs.existsSync(file)) {
    return { schemaVersion: 1, rollbackChain: [], files: {} };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object') {
      throw new DoctorApplyError('doctor-patch-state.json 结构非法。', 'PATCH_STATE_INVALID', { file });
    }
    parsed.rollbackChain = Array.isArray(parsed.rollbackChain) ? parsed.rollbackChain : [];
    parsed.files = parsed.files && typeof parsed.files === 'object' ? parsed.files : {};
    parsed.installedPackages = Array.isArray(parsed.installedPackages) ? parsed.installedPackages : [];
    return parsed;
  } catch (err) {
    if (err instanceof DoctorApplyError) throw err;
    throw new DoctorApplyError('doctor-patch-state.json 读取失败: ' + err.message, 'PATCH_STATE_UNREADABLE', { file });
  }
}

export function writePatchState(configRoot, state) {
  const file = path.join(configRoot, 'doctor-patch-state.json');
  atomicWriteJson(file, state);
  return file;
}

function backupCurrentFile(backupRoot, relRoot, rel, abs) {
  const relBackup = path.join(relRoot, rel);
  const backupAbs = path.join(backupRoot, relBackup);
  if (fs.existsSync(abs)) {
    fs.mkdirSync(path.dirname(backupAbs), { recursive: true });
    fs.writeFileSync(backupAbs, fs.readFileSync(abs));
    return toPosix(relBackup);
  }
  return null;
}

// executeApply 是 doctor 域唯一的写盘实现（设计稿 p24-design-batch2-console.md §1 分域铁律）。
// --yes 的语义（D1 条件①，判定 2026-09-19）：**调用方须已完成知情确认**——CLI 交互逐条确认，
// 或由面板在 UI 层完成两步 plan-execute 与单次确认后受托执行；--yes 只是免交互，不是免知情。
// 安全链在本函数内不因 --yes 减免：apply 锁 / plan 校验 / protected 硬断言（整轮零写入）/
// 锚点重验（ANCHOR_DRIFT 中止）/ 写前必备份 / patch-state 原子写，全部保留。
export async function executeApply(report, options) {
  const opts = options || {};
  const confirm = typeof opts.confirm === 'function' ? opts.confirm : async function () { return true; };
  const configRoot = path.resolve(report.environment.configRoot);
  const release = acquireApplyLock(configRoot);
  try {
    const entries = planEntriesFromReport(report);
    if (entries.length === 0) {
      return { ok: true, cancelled: false, applied: false, stamp: null, backupRoot: null, results: [] };
    }

    for (const entry of entries) {
      const ok = await confirm(entry.issue);
      if (!ok) {
        return { ok: false, cancelled: true, applied: false, stamp: null, backupRoot: null, results: [] };
      }
    }

    try {
      for (const entry of entries) {
        entry.target = resolveStepTarget(report, entry.step);
      }
    } catch (err) {
      return { ok: false, cancelled: false, applied: false, stamp: null, backupRoot: null, error: err.message, code: err.code || 'PLAN_INVALID', results: [] };
    }

    const protectedHits = [];
    for (const entry of entries) {
      if (entry.target.abs && isProtectedPath(entry.target.abs, { installPackage: entry.step.op === 'install-package' })) {
        protectedHits.push({ root: entry.step.root, file: entry.step.file, abs: entry.target.abs });
      }
    }
    if (protectedHits.length > 0) {
      return {
        ok: false,
        cancelled: false,
        applied: false,
        stamp: null,
        backupRoot: null,
        code: 'PROTECTED_TARGET',
        error: 'protected 硬断言失败：写目标落入 nonScan 或 *.bak-* 目录，整轮失败，零写入。',
        protectedHits,
        results: [],
      };
    }

    const stamp = stampNow();
    const backupRoot = path.join(configRoot, 'doctor-backups', stamp);
    const results = [];
    const installedPackages = [];
    let failed = false;

    for (const entry of entries) {
      const step = entry.step;
      const target = entry.target;
      if (failed) {
        results.push(makeStepRecord(entry, 'skipped'));
        continue;
      }
      if (step.op === 'install-package') {
        try {
          const rec = applyInstallPackage(report, entry, opts);
          results.push(rec);
          if (rec.status !== 'ok') {
            failed = true;
          } else {
            installedPackages.push({ root: rec.root, package: rec.packageName, path: rec.installedPath, version: rec.installedVersion, declared: rec.declaredRange });
          }
        } catch (err) {
          results.push(makeStepRecord(entry, 'failed', { error: err && err.message || String(err), code: err && err.code || 'STEP_FAILED' }));
          failed = true;
        }
        continue;
      }
      try {
        const rec = applyFileStep(report, entry, backupRoot);
        results.push(rec);
        if (rec.status !== 'ok') failed = true;
      } catch (err) {
        results.push(makeStepRecord(entry, 'failed', { error: err && err.message || String(err), code: err && err.code || 'STEP_FAILED' }));
        failed = true;
      }
    }

    const state = readPatchState(configRoot);
    const entryRecord = {
      stamp,
      action: 'apply',
      createdAt: nowIso(),
      backupRoot,
      results,
      protectedAssertion: true,
    };
    state.rollbackChain.push(entryRecord);
    entryRecord.installedPackages = installedPackages;
    if (installedPackages.length) {
      state.installedPackages = state.installedPackages || [];
      for (const item of installedPackages) {
        state.installedPackages.push(Object.assign({ stamp: stamp }, item));
      }
    }
    for (const rec of results) {
      if (rec.status === 'ok' && rec.file && rec.backup) {
        state.files[keyFor(rec.root, rec.file)] = {
          file: rec.fileAbs,
          backup: path.resolve(backupRoot, rec.backup),
          originalSha: rec.originalSha || null,
          patchedSha: rec.patchedSha || null,
          patchedAt: nowIso(),
        };
      }
    }
    writePatchState(configRoot, state);

    return {
      ok: !failed,
      cancelled: false,
      applied: true,
      stamp,
      backupRoot,
      results,
      patchState: path.join(configRoot, 'doctor-patch-state.json'),
    };
  } finally {
    release();
  }
}

function keyFor(root, file) {
  return root + '|' + toPosix(file);
}

function makeStepRecord(entry, status, extra) {
  const rec = {
    root: entry.step.root,
    file: entry.step.file,
    op: entry.step.op,
    status,
    fileAbs: entry.target && entry.target.abs,
    backup: null,
    originalSha: null,
    patchedSha: null,
  };
  if (extra) Object.assign(rec, extra);
  return rec;
}

function stripBom(text) {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1);
  return text;
}

function resolveInstallSource(rootDir, step, opts) {
  const packageName = String(step.old);
  const declared = typeof step.new === 'string' ? step.new : '';
  if (opts && opts.installSources && opts.installSources[packageName]) {
    return { source: path.resolve(opts.installSources[packageName]), declared };
  }
  if (declared.startsWith('file:')) {
    const filePart = declared.slice('file:'.length);
    return { source: path.resolve(rootDir, filePart), declared };
  }
  return { source: null, declared };
}

function applyInstallPackage(report, entry, opts) {
  const step = entry.step;
  const target = entry.target;
  const rootDir = target.rootDir;
  const packageName = String(step.old);
  const nodeModulesDir = path.join(rootDir, 'node_modules');
  const targetDir = target.abs;
  if (fs.existsSync(nodeModulesDir)) {
    let lstat;
    let real;
    try {
      lstat = fs.lstatSync(nodeModulesDir);
      real = fs.realpathSync.native ? fs.realpathSync.native(nodeModulesDir) : fs.realpathSync(nodeModulesDir);
    } catch (err) {
      return makeStepRecord(entry, 'failed', { error: 'node_modules 目录不可读: ' + err.message, code: 'INSTALL_PACKAGE_NODE_MODULES_UNREADABLE' });
    }
    if (lstat.isSymbolicLink() || path.resolve(nodeModulesDir).toLowerCase() !== real.toLowerCase()) {
      return makeStepRecord(entry, 'failed', { error: '目标 node_modules 目录是 symlink/junction，禁止 install-package 写入。', code: 'INSTALL_PACKAGE_NODE_MODULES_SYMLINK' });
    }
  }
  const resolvedSource = resolveInstallSource(rootDir, step, opts);
  if (!resolvedSource.source) {
    return makeStepRecord(entry, 'failed', { error: '零网络环境无法在线解析声明范围: ' + resolvedSource.declared + '；请提供 file: 本地源或 installSources。', code: 'INSTALL_PACKAGE_SOURCE_UNRESOLVED' });
  }
  const sourceDir = resolvedSource.source;
  const pkgJsonPath = path.join(sourceDir, 'package.json');
  if (!fs.existsSync(pkgJsonPath)) {
    return makeStepRecord(entry, 'failed', { error: '本地包源不是目录或缺少 package.json: ' + sourceDir, code: 'INSTALL_PACKAGE_SOURCE_INVALID' });
  }
  let meta;
  try {
    meta = JSON.parse(stripBom(fs.readFileSync(pkgJsonPath, 'utf8')));
  } catch (err) {
    return makeStepRecord(entry, 'failed', { error: '本地包 package.json 解析失败: ' + err.message, code: 'INSTALL_PACKAGE_SOURCE_INVALID' });
  }
  if (!meta || typeof meta.version !== 'string') {
    return makeStepRecord(entry, 'failed', { error: '本地包 package.json 缺少 version。', code: 'INSTALL_PACKAGE_SOURCE_INVALID' });
  }
  if (meta.name && meta.name !== packageName) {
    return makeStepRecord(entry, 'failed', { error: '本地包名 ' + meta.name + ' 与安装目标 ' + packageName + ' 不一致。', code: 'INSTALL_PACKAGE_NAME_MISMATCH' });
  }
  const declaredText = resolvedSource.declared || declared;
  if (!declaredText.startsWith('file:') && declaredText && !satisfiesVersion(meta.version, declaredText)) {
    return makeStepRecord(entry, 'failed', { error: '本地包版本 ' + meta.version + ' 不满足声明范围 ' + declaredText + '。', code: 'INSTALL_PACKAGE_VERSION_CONFLICT' });
  }
  if (fs.existsSync(targetDir)) {
    return makeStepRecord(entry, 'failed', { error: '安装目标已存在，禁止覆盖: ' + targetDir, code: 'INSTALL_PACKAGE_TARGET_EXISTS' });
  }
  try {
    fs.mkdirSync(nodeModulesDir, { recursive: true });
    fs.cpSync(sourceDir, targetDir, { recursive: true });
  } catch (err) {
    try {
      fs.rmSync(targetDir, { recursive: true, force: true });
    } catch {
      /* noop */
    }
    return makeStepRecord(entry, 'failed', { error: 'install-package 复制失败: ' + err.message, code: 'INSTALL_PACKAGE_COPY_FAILED' });
  }
  const rec = makeStepRecord(entry, 'ok');
  rec.packageName = packageName;
  rec.declaredRange = declaredText;
  rec.installedVersion = meta.version;
  rec.installedPath = targetDir;
  rec.fileAbs = targetDir;
  rec.backup = null;
  rec.originalSha = null;
  rec.patchedSha = null;
  return rec;
}

function applyFileStep(report, entry, backupRoot) {
  const step = entry.step;
  const target = entry.target;
  const abs = target.abs;
  const recBase = makeStepRecord(entry, 'ok');

  if (step.op === 'create-file') {
    if (fs.existsSync(abs)) {
      const err = new DoctorApplyError('create-file 目标已存在，禁止覆盖。', 'CREATE_FILE_TARGET_EXISTS');
      return makeStepRecord(entry, 'failed', { error: err.message, code: err.code });
    }
    const content = step.new;
    const buf = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(JSON.stringify(content, null, 2) + '\n', 'utf8');
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, buf);
    recBase.backup = null;
    recBase.originalSha = null;
    recBase.patchedSha = sha256Buffer(buf);
    recBase.fileAbs = abs;
    return recBase;
  }

  const oldStr = planString(step.old);
  if (step.op !== 'delete' && step.old === null) {
    const err = new DoctorApplyError(step.op + ' 必须提供 old 锚点。', 'ANCHOR_MISSING');
    return makeStepRecord(entry, 'failed', { error: err.message, code: err.code });
  }

  let originalBuf;
  try {
    originalBuf = fs.readFileSync(abs);
  } catch (err) {
    return makeStepRecord(entry, 'failed', { error: '目标文件不可读: ' + abs, code: 'TARGET_UNREADABLE' });
  }
  const originalText = originalBuf.toString('utf8');
  const occurrence = Number(step.occurrence === null || step.occurrence === undefined ? 1 : step.occurrence);
  if (!Number.isInteger(occurrence) || occurrence < 1) {
    const err = new DoctorApplyError('occurrence 必须为 ≥1 的整数。', 'OCCURRENCE_INVALID');
    return makeStepRecord(entry, 'failed', { error: err.message, code: err.code });
  }

  const originalSha = sha256Buffer(originalBuf);

  const found = countExactOccurrences(originalText, oldStr);
  if (found.count < occurrence) {
    return makeStepRecord(entry, 'failed', {
      error: '锚点重验失败：old 出现次数 ' + found.count + ' < occurrence ' + occurrence + '。',
      code: 'ANCHOR_DRIFT',
      originalSha,
    });
  }
  const idx = found.indices[occurrence - 1];

  if (step.op === 'delete' && step.new !== null && step.new !== undefined) {
    const err = new DoctorApplyError('delete 的 new 必须为 null。', 'PLAN_NEW_INVALID');
    return makeStepRecord(entry, 'failed', {
      error: err.message,
      code: err.code,
      originalSha,
    });
  }

  const backupRel = backupCurrentFile(backupRoot, target.root, target.rel, abs);

  let newText;
  if (step.op === 'replace') {
    const newStr = planString(step.new);
    newText = originalText.slice(0, idx) + newStr + originalText.slice(idx + oldStr.length);
  } else if (step.op === 'insert') {
    const insertStr = planString(step.new);
    const anchorEnd = idx + oldStr.length;
    const lineBreak = originalText.indexOf('\n', anchorEnd);
    if (lineBreak === -1) {
      newText = originalText + '\n' + insertStr;
    } else {
      const insertAt = lineBreak + 1;
      newText = originalText.slice(0, insertAt) + insertStr + '\n' + originalText.slice(insertAt);
    }
  } else if (step.op === 'delete') {
    newText = originalText.slice(0, idx) + originalText.slice(idx + oldStr.length);
  } else {
    return makeStepRecord(entry, 'failed', { error: '不支持的 op: ' + step.op, code: 'PLAN_OP_INVALID' });
  }

  const newBuf = Buffer.from(newText, 'utf8');
  fs.writeFileSync(abs, newBuf);
  recBase.backup = backupRel;
  recBase.originalSha = originalSha;
  recBase.patchedSha = sha256Buffer(newBuf);
  recBase.fileAbs = abs;
  return recBase;
}

export async function executeRollback(report, options) {
  const opts = options || {};
  const configRoot = path.resolve(report.environment.configRoot);
  const release = acquireApplyLock(configRoot);
  try {
    const state = readPatchState(configRoot);
    const chain = state.rollbackChain;
    if (chain.length === 0) {
      return { ok: false, rolledBack: false, error: '没有可回滚的状态记录。', code: 'NO_PATCH_STATE' };
    }
    let idx = chain.length - 1;
    if (opts.to) {
      idx = chain.findIndex(function (entry) { return entry.stamp === opts.to; });
      if (idx === -1) {
        return { ok: false, rolledBack: false, error: '未找到状态记录: ' + opts.to, code: 'STATE_NOT_FOUND' };
      }
    }
    const targetEntry = chain[idx];
    const applyResults = Array.isArray(targetEntry.results) ? targetEntry.results.filter(function (r) { return r && r.status === 'ok' && r.backup; }) : [];
    const stamp = stampNow();
    const beforeRollbackBackupRoot = path.join(configRoot, 'doctor-backups', stamp);

    const installedPackages = Array.isArray(state.installedPackages) ? state.installedPackages.filter(function (p) { return p && p.stamp === targetEntry.stamp; }) : [];
    const results = [];
    for (const item of applyResults) {
      const rootDir = resolveRoot(report, item.root);
      if (!rootDir) {
        results.push({ root: item.root, file: item.file, op: 'rollback-file', status: 'failed', error: 'root 无效: ' + item.root });
        continue;
      }
      const abs = path.resolve(rootDir, item.file);
      const rel = toPosix(path.relative(rootDir, abs));
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        results.push({ root: item.root, file: item.file, op: 'rollback-file', status: 'failed', error: 'path 逃逸 root' });
        continue;
      }
      if (isProtectedPath(abs)) {
        results.push({ root: item.root, file: item.file, op: 'rollback-file', status: 'failed', error: 'protected 目标禁止写入', code: 'PROTECTED_TARGET' });
        continue;
      }
      const sourceBackup = path.isAbsolute(item.backup) ? item.backup : path.join(configRoot, 'doctor-backups', String(targetEntry.stamp || stamp), item.backup);
      const normalizedBackup = item.backup && item.backup.indexOf('doctor-backups/') === 0
        ? path.join(configRoot, toOsPath(item.backup))
        : sourceBackup;
      const backupAbs = fs.existsSync(normalizedBackup) ? normalizedBackup : sourceBackup;
      if (!fs.existsSync(backupAbs)) {
        results.push({ root: item.root, file: item.file, op: 'rollback-file', status: 'failed', error: '备份文件缺失: ' + backupAbs, code: 'BACKUP_MISSING' });
        continue;
      }
      const beforeBackupRel = backupCurrentFile(beforeRollbackBackupRoot, item.root, rel, abs);
      const originalBuf = fs.readFileSync(backupAbs);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, originalBuf);
      results.push({
        root: item.root,
        file: item.file,
        op: 'rollback-file',
        status: 'ok',
        fileAbs: abs,
        backup: beforeBackupRel,
        restoredFrom: backupAbs,
        restoredSha: sha256Buffer(originalBuf),
      });
    }

    for (const item of installedPackages) {
      const rootDir = resolveRoot(report, item.root);
      const abs = item.path ? path.resolve(String(item.path)) : (rootDir ? path.join(rootDir, 'node_modules', String(item.package)) : null);
      if (!rootDir || !abs) {
        results.push({ root: item.root, file: null, op: 'rollback-install', status: 'failed', error: 'root 无效: ' + item.root });
        continue;
      }
      const rel = toPosix(path.relative(rootDir, abs));
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        results.push({ root: item.root, file: null, op: 'rollback-install', status: 'failed', error: 'path 逃逸 root' });
        continue;
      }
      if (isProtectedPath(abs, { installPackage: true })) {
        results.push({ root: item.root, file: null, op: 'rollback-install', status: 'failed', error: 'protected 目标禁止写入', code: 'PROTECTED_TARGET' });
        continue;
      }
      try {
        if (fs.existsSync(abs)) fs.rmSync(abs, { recursive: true, force: true });
        results.push({ root: item.root, file: null, op: 'rollback-install', status: 'ok', package: item.package, installedVersion: item.version, removedPath: abs });
      } catch (err) {
        results.push({ root: item.root, file: null, op: 'rollback-install', status: 'failed', error: err.message });
      }
    }

    const failedCount = results.filter(function (r) { return r.status !== 'ok'; }).length;
    const rollbackEntry = {
      stamp,
      action: 'rollback',
      createdAt: nowIso(),
      restoredFrom: targetEntry.stamp,
      beforeRollbackBackupRoot,
      results,
    };
    state.rollbackChain.push(rollbackEntry);
    writePatchState(configRoot, state);

    return {
      ok: failedCount === 0,
      rolledBack: true,
      stamp,
      restoredFrom: targetEntry.stamp,
      beforeRollbackBackupRoot,
      results,
      patchState: path.join(configRoot, 'doctor-patch-state.json'),
    };
  } finally {
    release();
  }
}

function toOsPath(p) {
  return p.replace(/\//g, path.sep);
}