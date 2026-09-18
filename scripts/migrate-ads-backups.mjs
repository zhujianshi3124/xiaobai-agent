// D-01 迁移工具：把落在 NTFS 备用数据流(ADS) 的写前备份迁回正常文件。
//
// 背景：旧 backup.mjs 的 savedAs 只替换 `\` 与 `/`，未处理盘符冒号 ⇒
// `D:\…\cordis.patch.yml` → `savedAs="D:__dsh-plugins__…yml"`，Windows 把 `D:`
// 当作 ADS 说明符 ⇒ 内容写进 ADS，目录里只剩 0 字节文件 `D`。
//
// 迁移步骤（对每个备份目录）：
//   1. 用**旧规则**读回 ADS 内容（join(dir, manifest.files[0].savedAs)）
//   2. 按**新规则**（净化 `:`）写到常规文件名
//   3. 断言写出的常规文件 sha == manifest 记录 sha 且字节 > 0
//   4. 更新 manifest.files[].savedAs 为常规名（否则旧规则回滚会指向已删除的 ADS）
//   5. 清除 0 字节 ADS 载体（目录里仅剩 manifest.json + 常规副本）
//
// 幂等：已迁移过的目录（存在常规名文件）会被跳过。
// 用法：node scripts/migrate-ads-backups.mjs [--apply]   （缺省 dry-run）
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const ROOT = "D:\\dsh-plugins\\dsh-toolkit";
const BKROOT = join(ROOT, ".panel-write-backups");
const APPLY = process.argv.includes("--apply");
const sha = (b) => createHash("sha256").update(b).digest("hex");
const L = (t = "") => console.log(t);

/** 新规则：同时净化 `:`、`\`、`/`（与修复后的 backup.mjs 完全一致）。 */
function newName(abs) {
  return abs.replace(/[:\\/]/g, "__").replace(/^__/, "");
}

L("══════════════════════════════════════════════════════════════");
L("D-01 迁移 ADS 备份 → 常规文件   " + (APPLY ? "【APPLY】" : "【DRY-RUN】"));
L("══════════════════════════════════════════════════════════════");
if (!existsSync(BKROOT)) { L("备份根不存在，无事可做。"); process.exit(0); }

let migrated = 0, skipped = 0, failed = 0;
for (const stamp of readdirSync(BKROOT).sort()) {
  const dir = join(BKROOT, stamp);
  const mf = join(dir, "manifest.json");
  if (!existsSync(mf)) continue;
  const manifest = JSON.parse(readFileSync(mf, "utf8"));
  L("");
  L("── " + stamp);
  for (const f of manifest.files) {
    const oldSavedAs = f.savedAs;
    const target = newName(f.abs);
    const targetPath = join(dir, target);
    L("   abs      = " + f.abs);
    L("   manifest.sha256 = " + String(f.sha256).slice(0, 16));
    L("   旧 savedAs = " + oldSavedAs);
    L("   新名       = " + target);

    if (existsSync(targetPath) && statSync(targetPath).size > 0 && sha(readFileSync(targetPath)) === f.sha256) {
      L("   → 已是常规文件且 sha 相符，跳过");
      skipped++;
      // 仍需清理可能的残留载体
    } else {
      // 1. 用旧规则读回
      let payload = null;
      try {
        payload = readFileSync(join(dir, oldSavedAs));
      } catch (e) {
        L("   ✗ 旧规则读回失败：" + e.code + " " + e.message.slice(0, 60));
        failed++;
        continue;
      }
      const ok = payload.length > 0 && sha(payload) === f.sha256;
      L("   旧规则读回 = " + payload.length + " B  sha=" + sha(payload).slice(0, 16) + "  相符=" + ok);
      if (!ok) { L("   ✗ 读回内容与 manifest sha 不符，拒绝迁移"); failed++; continue; }

      // 2/3. 写常规文件并复验
      if (APPLY) {
        writeFileSync(targetPath, payload);
        const back = readFileSync(targetPath);
        if (back.length !== payload.length || sha(back) !== f.sha256) {
          L("   ✗ 写入后复验失败，中止该文件");
          failed++;
          continue;
        }
        L("   ✓ 已写常规文件 " + target + "  " + back.length + " B  sha 复验相符");
        // 4. 更新 manifest.savedAs
        f.savedAs = target;
        // 5. 清 0 字节 ADS 载体
        for (const e of readdirSync(dir)) {
          if (e === "manifest.json" || e === target) continue;
          const ep = join(dir, e);
          const st = statSync(ep);
          if (st.size === 0) { unlinkSync(ep); L("   ✓ 已清除 0 字节载体 '" + e + "'（连同其 ADS）"); }
          else L("   ⚠ 保留非 0 字节未知项 '" + e + "'（" + st.size + " B），不擅自删");
        }
      } else {
        L("   （dry-run：将写入常规文件并更新 manifest.savedAs、清除 0 字节载体）");
      }
      migrated++;
    }
  }
  if (APPLY) writeFileSync(mf, JSON.stringify(manifest, null, 2), "utf8");
}
L("");
L("汇总：迁移 " + migrated + "  跳过 " + skipped + "  失败 " + failed + (APPLY ? "" : "（dry-run 未落盘）"));
L("══════════════════════════════════════════════════════════════");
