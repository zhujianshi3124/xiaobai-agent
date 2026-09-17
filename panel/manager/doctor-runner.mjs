import { execFile } from "node:child_process";

export function runDoctorDryRun({ cliPath, scopeRoot }) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [cliPath, "--json", "--scope", scopeRoot],
      { timeout: 120000, maxBuffer: 24 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        const exitCode = error && typeof error.code === "number" ? error.code : 0;
        const stdoutText = String(stdout || "");
        const stderrText = String(stderr || "");
        let parsed = null;
        try {
          parsed = JSON.parse(stdoutText);
        } catch {
          parsed = null;
        }
        if (parsed && parsed.schemaVersion === 1) {
          resolve({ ok: true, exitCode, stdout: stdoutText, stderr: stderrText, report: parsed });
          return;
        }
        resolve({
          ok: false,
          exitCode,
          error: String(error && error.message || error || "doctor 未产出 JSON 报告"),
          stdoutTail: stdoutText.slice(-4000),
          stderrTail: stderrText.slice(-4000),
        });
      },
    );
  });
}
