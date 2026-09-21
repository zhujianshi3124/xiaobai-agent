#!/usr/bin/env node
/**
 * 【已退役 · 2026-09-21 Pack I，债务 D-17 关账】
 *
 * 为什么不修好继续用（两条理由各自独立成立）：
 *
 * 1) 它的"基准"定义已经死了。重建公式是「`git show HEAD:cordis.patch.yml` 的 blob
 *    + 追加 toolkit-manager 那 4 行」，而那 4 行**早已随 P2.4 进了 HEAD** ⇒ 再追加一次
 *    会多出重复的 insert 块，重建出 3202 B / sha `3a522a56…`，永远不等于它自己钉的
 *    3097 B / `ce0b0b81…` ⇒ 当场 fail-closed 不写盘。**这一条在本轮改配置之前就已经成立**
 *    （Pack H5 轮 dry-run 实测复现，见 panel/docs/evidence/H-REAL-HOST-REVERIFY.md §八），
 *    不是被 H5 的基线滚存弄坏的——滚存只是让它彻底没有了修的意义。
 *
 * 2) 更根本：**"逐字节回到某一枚 sha"这个概念已被判据滚存取代**。判据基准现在是一个会移动的值
 *    （`ce0b0b81…` → `bb7af96f…`，本轮引擎清理还会再滚一次），把它钉进脚本就等于又埋一颗
 *    陈旧 sha。今天的"当前好状态"定义是**工作区 == HEAD**，而 `scripts/q2-layer-scan.mjs` 的
 *    ④ 号检查已经在校验这一条了——所以恢复动作就是 git 本身。
 *
 * 要恢复 cordis.patch.yml 时（本脚本不再提供任何恢复能力）：
 *    cp cordis.patch.yml .panel-backups/<自己起个带时刻的名字>/cordis.patch.yml   # 先留现场
 *    git checkout HEAD -- cordis.patch.yml
 *
 * 原实现（fail-closed 的 sha/字节/CRLF 三重复验 + 写前备份 manifest，第 11 轮授权时的产物）
 * 完整保存在提交 **10ebcef** 里，需要对照做法时从那里读，不要复活本文件。
 *
 * 保留这个空壳而不删文件，是为了让下一个"想把 patch 恢复一下"的人在这里就撞见结论，
 * 而不是花一轮去修一个已被取代的工具（D-17 登记时的原话诉求就是这个）。
 */
const NOTICE = [
  'restore-cordis-baseline.mjs 已退役（2026-09-21 Pack I / 债务 D-17）。',
  '',
  '原因一：重建公式失效——它按「HEAD blob + 追加 toolkit-manager 4 行」重建基准，而那 4 行早已进 HEAD，',
  '        重建结果 3202 B 永不自洽（本轮改配置之前就已如此，H5 轮实测复现）。',
  '原因二：判据基准已改为随授权修复滚存（ce0b0b81… → bb7af96f… → …），把某一枚 sha 钉进脚本等于再埋',
  '        一颗陈旧 sha；"当前好状态"的现行定义是「工作区 == HEAD」，由 q2-layer-scan ④ 在校验。',
  '',
  '要恢复 cordis.patch.yml：先把现场 cp 一份到 .panel-backups/ 下带时刻的子目录，再执行',
  '    git checkout HEAD -- cordis.patch.yml',
  '完整原实现见提交 10ebcef（含写前备份 manifest 与 sha/字节/CRLF 三重复验）。',
].join('\n')

console.log(NOTICE)
// 退出码 2 = "工具已退役、未做任何判定"，与"跑了但判据不符"（exit 1）区分开，免得被误读成失败恢复。
process.exit(2)
