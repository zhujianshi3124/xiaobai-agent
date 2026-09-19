import { execFile } from "node:child_process";

// doctor 域的**唯一入口**都是本文件的 spawn 助手（设计稿 p24-design-batch2-console.md §1/§6.3）：
// 面板域绝不直接读写 ~/.dsh 下任何 doctor 文件，全部经 CLI 子进程（D1：--only/--states/--yes）。
// CLI 的 apply 路径在 --json 下会依次输出多个 JSON 文档（dry-run → apply → rescan），
// 故这里提供**拼接 JSON** 解析：按顶层大括号配平切分，而不是整串 JSON.parse。

function parseConcatJson(text) {
  const docs = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      if (depth > 0) inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          docs.push(JSON.parse(text.slice(start, i + 1)));
        } catch {
          // 单段解析失败忽略——由调用方按 phase 找不到处理
        }
        start = -1;
      }
    }
  }
  return docs;
}

function spawnDoctor(args, { timeout = 180000 } = {}) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      args,
      { timeout, maxBuffer: 24 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        const exitCode = error && typeof error.code === "number" ? error.code : error && error.killed ? "timeout" : 0;
        const stdoutText = String(stdout || "");
        const stderrText = String(stderr || "");
        resolve({ exitCode, stdoutText, stderrText, spawnError: error && typeof error.code !== "number" ? String(error.message || error) : null });
      },
    );
  });
}

function doctorArgs({ cliPath, scopeRoot, configRoot }) {
  const args = [cliPath, "--json"];
  if (scopeRoot) args.push("--scope", scopeRoot);
  if (configRoot) args.push("--config-root", configRoot);
  return args;
}

function finish({ parts, exitCode, stderrText, spawnError }) {
  const docs = parseConcatJson(parts);
  const found = {};
  for (const doc of docs) {
    if (doc && typeof doc === "object" && doc.phase) found[doc.phase] = doc;
  }
  const ok = spawnError === null && exitCode === 0;
  return {
    ok,
    exitCode,
    docs,
    // apply 路径：{phase:'apply', result}；rollback 路径：顶层结果对象（无 phase 包装）
    result: found.apply ? found.apply.result : docs.find((d) => d && d.ok !== undefined && !d.phase) || null,
    report: found.dry_run ? found.dry_run.report : docs.find((d) => d && d.schemaVersion === 1) || null,
    rescan: (found.rescan && found.rescan.report) || (found.apply_noop && found.apply_noop.rescan) || null,
    noop: !!found.apply_noop,
    stderrTail: stderrText.slice(-4000),
    error: spawnError || (ok ? null : stderrText.split("\n")[0] || "doctor 子进程失败"),
    spawnError,
  };
}

/** 只读体检（既有面，P2.4 批 1 起在用）。 */
export function runDoctorDryRun({ cliPath, scopeRoot, configRoot }) {
  return spawnDoctor(doctorArgs({ cliPath, scopeRoot, configRoot })).then((r) => {
    let parsed = null;
    try {
      parsed = JSON.parse(r.stdoutText);
    } catch {
      parsed = null;
    }
    if (parsed && parsed.schemaVersion === 1) {
      return { ok: true, exitCode: r.exitCode, stdout: r.stdoutText, stderr: r.stderrText, report: parsed };
    }
    return {
      ok: false,
      exitCode: r.exitCode,
      error: r.spawnError || String(r.stderrText.split("\n")[0] || "doctor 未产出 JSON 报告"),
      stdoutTail: r.stdoutText.slice(-4000),
      stderrTail: r.stderrText.slice(-4000),
    };
  });
}

/** --states（D2）：doctor-patch-state.json 回滚链摘要，只读。文件不存在 ⇒ 空链。 */
export async function runDoctorStates({ cliPath, configRoot }) {
  const args = [cliPath, "--json", "--states"];
  if (configRoot) args.push("--config-root", configRoot);
  const r = await spawnDoctor(args, { timeout: 60000 });
  const docs = parseConcatJson(r.stdoutText);
  const payload = docs.find((d) => d && d.schemaVersion === 1 && Array.isArray(d.states));
  if (r.spawnError) {
    return { ok: false, exitCode: r.exitCode, error: r.spawnError, states: null, stderrTail: r.stderrText.slice(-4000) };
  }
  if (!payload) {
    return { ok: false, exitCode: r.exitCode, error: r.stderrText.split("\n")[0] || "doctor --states 未产出 JSON", states: null, stderrTail: r.stderrText.slice(-4000) };
  }
  return { ok: true, exitCode: r.exitCode, states: payload.states, configRoot: payload.configRoot ?? null };
}

/**
 * --apply --only <issueId> --yes（D1 单条受托执行）。
 * 调用前置（判定三条件③）：面板确认层（两步 plan-execute ＋ 单次确认）必须已完成——
 * 本函数只负责 spawn，不复核 UI 语义。
 */
export async function runDoctorApply({ cliPath, scopeRoot, configRoot, issueId }) {
  const args = [...doctorArgs({ cliPath, scopeRoot, configRoot }), "--apply", "--only", String(issueId), "--yes"];
  const r = await spawnDoctor(args);
  return finish({ parts: r.stdoutText, exitCode: r.exitCode, stderrText: r.stderrText, spawnError: r.spawnError });
}

/** --rollback --to <stamp>（CLI 无确认层 ⇒ 面板侧两步补齐，见设计稿 §4.1 如实申报）。 */
export async function runDoctorRollback({ cliPath, scopeRoot, configRoot, stamp }) {
  const args = [...doctorArgs({ cliPath, scopeRoot, configRoot }), "--rollback", "--to", String(stamp)];
  const r = await spawnDoctor(args);
  return finish({ parts: r.stdoutText, exitCode: r.exitCode, stderrText: r.stderrText, spawnError: r.spawnError });
}
