import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { runDoctor, DoctorRootError } from './engine.mjs';
import { executeApply, executeRollback, readPatchState, DoctorApplyError } from './executor.mjs';

function printUsage() {
  process.stdout.write('用法: xiaobai-agent doctor [--json] [--apply [--only <issueId>] [--yes]] [--rollback [--to <stateId>]] [--states] [--scope <dir>] [--config-root <dir>] [--profile <name>] [--registry <file>] [--now <ISO>] [--host-version <v>]\n');
  process.stdout.write('默认 dry-run（只读不写）。\n');
  process.stdout.write('--states：只读输出 doctor-patch-state.json 的回滚链摘要（不写盘）。\n');
  process.stdout.write('--only <issueId>：--apply 时只执行该 issue 的 fix plan（单条语义；id 仅允许字母/数字/._-）。\n');
  process.stdout.write('--report <file>：把现成的体检报告喂给 --apply（跳过重扫），复检根从报告里回读。\n');
  process.stdout.write('--dry-run：显式声明只读模式（与缺省行为相同，本旗标接受后不额外做事）。\n');
  process.stdout.write('--host-version <v>：钉住参与 runtime.dsh 比对的宿主版本。缺省顺位：本旗标 > DSH_DOCTOR_HOST_VERSION > `dsh --version` 自述探测 > unknown（未知即跳过该比对并如实标出，不冒充具体版本）。\n');
  process.stdout.write('--yes：跳过逐条交互确认。**语义 = 调用方须已完成知情确认**（如面板在 UI 层完成两步 plan-execute 与单次确认后受托执行）；终端手跑仍应逐条确认。\n');
  process.stdout.write('退出码: 0=绿或成功归零；1=dry-run 发现问题；2=apply 后残留或 step 失败；3=root 非法；130=用户取消。\n');
}

function parseArgs(argv) {
  const args = {
    json: false,
    apply: false,
    yes: false,
    rollback: false,
    to: null,
    only: null,
    states: false,
    reportPath: null,
    scopeRoot: null,
    configRoot: null,
    profile: 'web',
    registryPath: null,
    now: null,
    hostVersion: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === 'doctor') continue;
    else if (arg === '--json') args.json = true;
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--yes' || arg === '-y') args.yes = true;
    else if (arg === '--rollback') args.rollback = true;
    else if (arg === '--to') { args.to = next; i++; }
    else if (arg === '--only') { args.only = next; i++; }
    else if (arg === '--states') args.states = true;
    else if (arg === '--report') { args.reportPath = next; i++; }
    else if (arg === '--dry-run') continue;
    else if (arg === '--scope' || arg === '-s') { args.scopeRoot = next; i++; }
    else if (arg === '--config-root' || arg === '-c') { args.configRoot = next; i++; }
    else if (arg === '--profile' || arg === '-p') { args.profile = next; i++; }
    else if (arg === '--registry') { args.registryPath = next; i++; }
    else if (arg === '--now') { args.now = next; i++; }
    else if (arg === '--host-version') { args.hostVersion = next; i++; }
    else if (arg === '--help' || arg === '-h') { printUsage(); process.exit(0); }
    else {
      process.stderr.write('未知参数: ' + arg + '\n');
      printUsage();
      process.exit(2);
    }
  }
  return args;
}

// --only 的 issueId 白名单（设计稿 p24-design-batch2-console.md §6.2）：
// 防注入 —— issueId 会作为参数进入子进程命令行与日志，只允许安全字符集。
const ISSUE_ID_RE = /^[A-Za-z0-9._-]+$/;

function buildDoctorOptions(args) {
  const scopeRoot = path.resolve(args.scopeRoot || process.env.DSH_DOCTOR_SCOPE_ROOT || 'D:\\dsh-plugins\\dsh-toolkit');
  const configRoot = path.resolve(args.configRoot || process.env.DSH_HOME || path.join(os.homedir(), '.dsh'));
  return {
    scopeRoot,
    configRoot,
    profile: args.profile,
    profileRoot: null,
    registryPath: args.registryPath,
    now: args.now,
    hostVersion: args.hostVersion,
  };
}

function buildDoctorOptionsFromReport(report, args) {
  const roots = report && report.environment && report.environment.roots || {};
  const scopeRoot = report && report.scope && report.scope.root
    ? report.scope.root
    : (roots.scope || (args && args.scopeRoot ? path.resolve(args.scopeRoot) : 'D:\\dsh-plugins\\dsh-toolkit'));
  const configRoot = report && report.environment && report.environment.configRoot
    ? report.environment.configRoot
    : (args && args.configRoot ? path.resolve(args.configRoot) : path.join(os.homedir(), '.dsh'));
  const profile = report && report.scope && report.scope.profile ? report.scope.profile : (args && args.profile || 'web');
  return {
    scopeRoot: path.resolve(scopeRoot),
    configRoot: path.resolve(configRoot),
    profile,
    profileRoot: roots.profile ? path.resolve(roots.profile) : null,
    registryPath: args && args.registryPath,
    now: args && args.now,
    hostVersion: args && args.hostVersion,
  };
}

function printReportHuman(report) {
  process.stdout.write('xiaobai-agent doctor (dry-run, read-only)\n');
  process.stdout.write('scope: ' + report.scope.root + '\n');
  process.stdout.write('config: ' + report.environment.configRoot + '\n');
  process.stdout.write('profile: ' + report.scope.profile + '\n');
  process.stdout.write('issues: ' + report.issues.length + ' (error ' + report.summary.error + ', warning ' + report.summary.warning + ', info ' + report.summary.info + ', fixable ' + report.summary.fixable + ')\n');
  for (const issue of report.issues) {
    process.stdout.write('---\n');
    process.stdout.write(issue.id + ' [' + issue.severity + '] root=' + issue.root + ' file=' + (issue.file || '<none>') + ' line=' + (issue.line || 0) + ' occurrence=' + (issue.occurrence || 1) + '\n');
    process.stdout.write(issue.message + '\n');
    if (issue.old) process.stdout.write('old: ' + JSON.stringify(issue.old) + '\n');
    if (issue.new) process.stdout.write('new: ' + JSON.stringify(issue.new) + '\n');
  }
}

function askOnce(question) {
  return new Promise(function (resolve) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, function (answer) {
      rl.close();
      resolve(String(answer).trim().toLowerCase());
    });
  });
}

function formatStep(step) {
  return step.op + (step.file ? ' ' + step.root + '/' + step.file : '') + (step.old ? ' old=' + JSON.stringify(step.old) : '');
}

async function confirmIssue(issue, yes) {
  if (yes) return true;
  if (!process.stdin.isTTY) {
    process.stderr.write('非交互终端：apply 需要 --yes（仅供测试）或交互确认。\n');
    process.exit(2);
  }
  const plans = (issue.fix && issue.fix.plan || []).map(formatStep).join('; ');
  const answer = await askOnce('应用 ' + issue.id + ' [' + issue.fix.class + '] ' + plans + '? [y/N] ');
  return answer === 'y' || answer === 'yes';
}

function printApplyResult(result) {
  process.stdout.write('apply stamp: ' + result.stamp + '\n');
  process.stdout.write('backupRoot: ' + (result.backupRoot || '<无>') + '\n');
  if (result.patchState) process.stdout.write('patchState: ' + result.patchState + '\n');
  for (const rec of result.results || []) {
    process.stdout.write(rec.status + ' ' + rec.op + ' ' + rec.root + '/' + (rec.file || '-') + (rec.error ? ' -> ' + rec.error : '') + '\n');
  }
}

function printRollbackResult(result) {
  process.stdout.write('rollback restoredFrom: ' + (result.restoredFrom || '-') + '\n');
  process.stdout.write('beforeRollbackBackupRoot: ' + (result.beforeRollbackBackupRoot || '<无>') + '\n');
  for (const rec of result.results || []) {
    process.stdout.write(rec.status + ' ' + rec.op + ' ' + rec.root + '/' + (rec.file || '-') + (rec.error ? ' -> ' + rec.error : '') + '\n');
  }
}

async function main() {
  const args = parseArgs(process.argv);
    if (args.apply && args.rollback) {
      process.stderr.write('--apply 与 --rollback 不能同时使用。\n');
      process.exit(2);
    }
    if (args.only && !args.apply) {
      process.stderr.write('--only 仅与 --apply 搭配使用。\n');
      process.exit(2);
    }
    if (args.only && !ISSUE_ID_RE.test(String(args.only))) {
      process.stderr.write('--only 的 issueId 含非法字符（仅允许字母/数字/._-）。\n');
      process.exit(2);
    }
  const doctorOptions = buildDoctorOptions(args);

  try {
    // --states（D2 只读命令，设计稿 §4.1）：读 doctor-patch-state.json 回滚链摘要，不写盘。
    // 文件不存在 ⇒ 空链（exit 0）；结构非法 ⇒ readPatchState 抛 DoctorApplyError ⇒ exit 2。
    if (args.states) {
      const configRoot = path.resolve(args.configRoot || process.env.DSH_HOME || path.join(os.homedir(), '.dsh'));
      const state = readPatchState(configRoot);
      const states = (state.rollbackChain || []).map(function (entry) {
        const results = Array.isArray(entry.results) ? entry.results : [];
        return {
          stamp: entry.stamp,
          action: entry.action || 'apply',
          createdAt: entry.createdAt,
          backupRoot: entry.backupRoot || (entry.action === 'rollback' ? entry.beforeRollbackBackupRoot : null),
          restoredFrom: entry.restoredFrom || null,
          files: results.filter(function (r) { return r && r.status === 'ok' && r.backup; }).length,
          packages: results.filter(function (r) { return r && r.status === 'ok' && r.op === 'install-package'; }).length,
        };
      });
      const payload = { schemaVersion: 1, configRoot: configRoot, states: states };
      process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
      return;
    }

    if (args.rollback) {
      const report = await runDoctor(doctorOptions);
      const result = await executeRollback(report, { to: args.to });
      if (args.json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      else printRollbackResult(result);
      if (!result.ok) process.exitCode = 2;
      return;
    }

    if (!args.apply) {
      const report = await runDoctor(doctorOptions);
      if (args.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
      else printReportHuman(report);
      process.exitCode = report.issues.length > 0 ? 1 : 0;
      return;
    }

    let report;
    if (args.reportPath) {
      report = JSON.parse(fs.readFileSync(path.resolve(args.reportPath), 'utf8'));
      if (args.json) process.stdout.write(JSON.stringify({ phase: 'report', report }, null, 2) + '\n');
      else printReportHuman(report);
    } else {
      report = await runDoctor(doctorOptions);
      if (args.json) process.stdout.write(JSON.stringify({ phase: 'dry-run', report }, null, 2) + '\n');
      else printReportHuman(report);
    }
    // --only 单条语义（设计稿 §6.2）：把报告收窄到该 issue 的可执行 plan。
    // manual 类（plan 为空）不可执行 ⇒ issue-not-executable；报告里找不到 ⇒ issue-not-found。
    if (args.only) {
      const wanted = String(args.only);
      const matches = (report.issues || []).filter(function (issue) { return issue && issue.id === wanted; });
      if (matches.length === 0) {
        process.stderr.write('issue-not-found: 当前体检报告中没有该问题: ' + wanted + '\n');
        process.exitCode = 2;
        return;
      }
      const executable = matches.filter(function (issue) {
        return issue.fix && Array.isArray(issue.fix.plan) && issue.fix.plan.length > 0;
      });
      if (executable.length === 0) {
        process.stderr.write('issue-not-executable: 该问题为人工处理类（无自动修复计划）: ' + wanted + '\n');
        process.exitCode = 2;
        return;
      }
      report.issues = executable;
    }
    const result = await executeApply(report, {
      confirm: function (issue) { return confirmIssue(issue, args.yes); },
    });
    if (result.cancelled) {
      process.stderr.write('用户取消，零写入。\n');
      process.exitCode = 130;
      return;
    }
    if (result.code === 'PROTECTED_TARGET' || result.code === 'PLAN_INVALID' || result.code === 'PLAN_OP_INVALID' || result.code === 'PLAN_ROOT_INVALID' || result.code === 'PLAN_FILE_ESCAPES_ROOT' || result.code === 'PLAN_FILE_ABSOLUTE') {
      process.stderr.write(result.error + '\n');
      process.exitCode = 2;
      return;
    }
    const rescanOptions = args.reportPath ? buildDoctorOptionsFromReport(report, args) : doctorOptions;
    if (!result.applied) {
      const rescan = await runDoctor(rescanOptions);
      if (args.json) process.stdout.write(JSON.stringify({ phase: 'apply-noop', rescan }, null, 2) + '\n');
      else {
        process.stdout.write('0 fixable，无新备份目录，状态文件不变。\n');
        printResiduals(rescan);
      }
      process.exitCode = rescan.summary.error === 0 ? 0 : 2;
      return;
    }
    if (args.json) process.stdout.write(JSON.stringify({ phase: 'apply', result }, null, 2) + '\n');
    else printApplyResult(result);

    const rescan = await runDoctor(rescanOptions);
    if (args.json) process.stdout.write(JSON.stringify({ phase: 'rescan', report: rescan }, null, 2) + '\n');
    else {
      process.stdout.write('复检: error ' + rescan.summary.error + ', warning ' + rescan.summary.warning + ', info ' + rescan.summary.info + '\n');
      printResiduals(rescan);
    }
    if (!result.ok) process.exitCode = 2;
    else process.exitCode = rescan.summary.error === 0 ? 0 : 2;
  } catch (err) {
    if (err instanceof DoctorRootError) {
      process.stderr.write('doctor 停止：' + err.message + '\n');
      process.exitCode = 3;
      return;
    }
    if (err instanceof DoctorApplyError) {
      process.stderr.write('doctor apply/rollback 失败：' + err.message + '\n');
      process.exitCode = 2;
      return;
    }
    throw err;
  }
}

function printResiduals(rescan) {
  if (rescan.summary.error === 0) return;
  process.stdout.write('残留 error 列表:\n');
  for (const issue of rescan.issues) {
    if (issue.severity === 'error') {
      process.stdout.write('---\n');
      process.stdout.write(issue.id + ' [' + issue.severity + '] root=' + issue.root + ' file=' + (issue.file || '<none>') + '\n');
      process.stdout.write(issue.message + '\n');
    }
  }
}

main().catch(function (err) {
  process.stderr.write(String(err && err.stack || err) + '\n');
  process.exit(1);
});