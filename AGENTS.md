# xiaobai-agent 修改约束（任何改动前必读）

本仓库已通过框架级可插拔审计（v2，2026-09-16，5/5）。以下红线任何改动不得破坏：

1. 禁止模块加载期静态 import 兄弟插件代码。兄弟能力只用：运行时惰性探测（try-catch + 动态 import），或 optionalDeps 声明。
2. 禁止跨插件边界的 eager re-export（export ... from 会重建整条依赖链）。
3. 跨插件测试用例：存在性门控 + 动态 import；兄弟缺席必须 skip，不得红。
4. doctor 仓库：新检查知识写进声明文件，engine 零硬编码插件名。
5. manifest 与实现同步：声明了 optionalDeps 就必须真能降级。
6. 改动后必跑：本插件全部测试 + 受影响方测试 + doctor dry-run（须 0/0/0）。提交：fix|feat|perf(<插件名>): <主题>，一个主题一个 commit。
7. **改 `cordis.patch.yml` / `panel/` / `scripts/` / `lib/` 后必跑 `npm run regression`**。
   `npm test` 完全不调 `regression-all`——p22 / p23 / p24 这类脚本红掉时 npm test 一声不响。
   历史实况：这些脚本曾红了两个批次无人知晓，直到有人手工补跑才发现。
   `npm run regression` ≈ 40s，跑的是回归全跑器（19 专项脚本 + node --test）。
   装了 pre-commit hook 的机器上，提交这些路径时它会自动拦一道：
   `node scripts/install-git-hooks.mjs` 安装、`--status` 查状态、`--uninstall` 卸载。
   临时绕过 `git commit --no-verify`——绕过即回归链不跑，缺陷可能两个批次后才被发现，故须在提交说明里写明原因。
   **hook 跑的是 `--scripts-only` 形态（只跑 19 个专项脚本，约 8s），不跑 node --test。**
   理由是划责任面而非容忍红：① `npm test` 末步就是 node --test，这一面已覆盖，重复跑只是把提交拖到 40s；
   ② 本机 node --test 有 4 项环境性常驻红（档案第五节在册，其中 schemastery 一项属环境红线不许碰），
   清不掉 ⇒ 让 hook 跑全链就是让它永久拦一切提交，最终只会逼所有人 `--no-verify`，hook 沦为摆设；
   ③ 而 19 个专项脚本 `npm test` 一个都不跑——「p22/p23/p24 红了两个批次无人知」正是这个缺口。
   全链随时可跑：`npm run regression`（不带参数即含 node --test）。

> 📌 **红线修订注记（用户裁决，2026-09-18）**：总文档 §六 原红线「不碰 5 个子插件的源码目录」修订为——**面板可在用户知情确认下执行子插件文件删除**（`lib/<plugin>` 目录；`~/.dsh` 热配置默认保留）。`~/.dsh` 与 cloudflared 红线不变。总文档红线区原文保留，以总文档叠加 6.5 为现行口径。
