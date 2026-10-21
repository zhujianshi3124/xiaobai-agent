#!/usr/bin/env node
// 安装仓内 git hooks（跑一次即装好；本文件进版本控制，装没装可查）。
//
// 为什么要有这个脚本：手工往 .git/hooks 里扔文件，等于「某台机器上装没装」无从得知 ——
// 那正是本项目栽过两次的结构（看起来有保护，其实那台机器没有）。
// 所以 hook 的正本在仓内 scripts/git-hooks/，安装脚本负责把它落到 .git/hooks/ 并 chmod。
//
// 用法：
//   node scripts/install-git-hooks.mjs            安装 / 覆盖
//   node scripts/install-git-hooks.mjs --status   只查状态，不写
//   node scripts/install-git-hooks.mjs --uninstall
//
// 本脚本只写 .git/hooks/ 与 core.hooksPath 配置（后者默认不设），不碰工作树、不碰红线路径。
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, chmodSync, rmSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = join(ROOT, "scripts", "git-hooks");
const HOOKS = ["pre-commit"];

const argv = process.argv.slice(2);
const wantStatus = argv.includes("--status");
const wantUninstall = argv.includes("--uninstall");

/** .git 可能是目录，也可能是 worktree 里的 gitdir 文件。两种都要认。 */
function gitDir() {
  const dotGit = join(ROOT, ".git");
  if (!existsSync(dotGit)) throw new Error("找不到 .git：" + dotGit);
  // .git 文件形（worktree / submodule）：内容为 "gitdir: <path>"
  if (!existsSync(join(dotGit, "hooks"))) {
    const txt = readFileSync(dotGit, "utf8").trim();
    const m = /^gitdir:\s*(.+)$/m.exec(txt);
    if (m) return resolve(ROOT, m[1].trim());
  }
  return dotGit;
}

const GIT_DIR = gitDir();
const DEST_DIR = join(GIT_DIR, "hooks");

function status() {
  const rows = [];
  for (const h of HOOKS) {
    const src = join(SRC_DIR, h);
    const dest = join(DEST_DIR, h);
    const srcExists = existsSync(src);
    const destExists = existsSync(dest);
    const same = srcExists && destExists && readFileSync(src, "utf8") === readFileSync(dest, "utf8");
    rows.push({ hook: h, srcExists, destExists, same });
  }
  return rows;
}

if (wantStatus) {
  console.log("hooks 源目录：" + SRC_DIR);
  console.log("hooks 安装点：" + DEST_DIR);
  let bad = 0;
  for (const r of status()) {
    const state = !r.destExists ? "未安装" : r.same ? "已安装（与仓内正本一致）" : "已安装但与仓内正本不一致";
    if (!r.destExists || !r.same) bad++;
    console.log("  " + (r.destExists && r.same ? "✓ " : "✗ ") + r.hook.padEnd(12) + state);
  }
  process.exit(bad === 0 ? 0 : 1);
}

if (wantUninstall) {
  for (const h of HOOKS) {
    const dest = join(DEST_DIR, h);
    if (existsSync(dest)) { rmSync(dest); console.log("已移除 " + dest); }
    else console.log("（未安装，无需移除）" + dest);
  }
  process.exit(0);
}

// ---- 安装 ----
if (!existsSync(SRC_DIR)) throw new Error("找不到 hooks 正本目录：" + SRC_DIR);
mkdirSync(DEST_DIR, { recursive: true });
for (const h of HOOKS) {
  const src = join(SRC_DIR, h);
  if (!existsSync(src)) throw new Error("仓内缺 hooks 正本：" + src);
  const dest = join(DEST_DIR, h);
  copyFileSync(src, dest);
  try { chmodSync(dest, 0o755); } catch { /* Windows 上 chmod 可能无效，git for windows 仍会执行 */ }
  console.log("已安装 " + h + " → " + dest);
}

// 提示：若设了 core.hooksPath，.git/hooks 会被忽略 —— 这是「装了但没生效」的经典盲区，主动查一次。
let hooksPath = "";
try { hooksPath = execFileSync("git", ["-C", ROOT, "config", "--get", "core.hooksPath"], { encoding: "utf8" }).trim(); } catch { /* 未设置即抛，正常 */ }
if (hooksPath) {
  console.log("");
  console.log("⚠ 检测到 core.hooksPath = " + hooksPath);
  console.log("  它会覆盖 .git/hooks/ ⇒ 上面刚装的 hook 不会生效。要么清掉该配置，要么把正本装到那个目录。");
  process.exit(1);
}
console.log("");
console.log("完成。查状态：node scripts/install-git-hooks.mjs --status");
