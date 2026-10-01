#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const apply = join(scriptDir, "apply-preset-patch.mjs");
const r = spawnSync(process.execPath, [apply, "--undo"], { stdio: "inherit" });
if (r.status !== 0) {
  console.error("预设撤销未成功，停止卸载流程。");
  process.exitCode = r.status !== null ? r.status : 1;
} else {
  console.log("预设已撤销。请执行以下命令从 profile 移除套件（以 dsh CLI 实际语法为准）：");
  console.log("  dsh plugin --profile web remove dsh-toolkit");
  console.log("然后重启 DSH。");
}
