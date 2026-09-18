// 合并保真抽检：用户总文档原文（纯文本，传输已剥离 markdown 强调）关键句 → 逐字比对 HANDOFF-MASTER.md
// 原则：探针 = 用户粘贴原文的逐字片段（不加任何本侧格式）。落盘文件必须原样包含它们。
import fs from 'node:fs';

const F = 'D:\\dsh-plugins\\dsh-toolkit\\panel\\docs\\HANDOFF-MASTER.md';
const t = fs.readFileSync(F, 'utf8');
const norm = s => s.replace(/[ \t]+$/gm, '');

// 从用户原文（两次粘贴一致）逐字摘录，覆盖：头部两行 + 九节全部 + 关键句
const PROBES = [
  // 头部两行（原文）
  '最后更新：P2.1 验收后。本文档是四份正本之上的“总索引 + 项目史 + 判定记录”，新会话先读本文，再按索引读细节。',
  // 一
  '用户有一个插件桶 D:\\dsh-plugins\\dsh-toolkit（bundle 形态，含 5 个子插件），管理麻烦，要一个可视化管理面板。现状：面板已建成并双入口可用（WebUI 设置页 tab + 直连 http://127.0.0.1:3080/api/toolkit-panel/ui），当前处于 P2 窄版施工中（让面板从“能看”变成“能操作”）。',
  // 二（标题含半角右括号——原文如此）
  '## 二、五份正本文档（本文件之下的一切细节都在这里)',
  'DSH 平台 API 事实清单（带源码行号）+ 三次“源码转述被实测推翻”教训',
  '重启程序（11 节）、回滚程序、根因档案（11.1–11.6）、P2 阶段表（11.7）',
  '唯一正本台账（L-0xx 条目）',
  '项目红线（不 import 兄弟插件、备份、授权等）',
  '注意：沙箱根 D:\\dsh-test-sandbox\\ 下的 _handoff-*、_tmp_ledger-*、_api-notes-p2.md 等全部是已废弃工作副本（带 DEPRECATED 头），勿读勿写。',
  // 三（逐条，原文无反引号）
  '平台：DSH（DeepSeek CLI 宿主），dsh web 跑在 3080，无热 reload——一切文件改动需重启进程才生效。重启方式见第七节。',
  '四层 patch 栈：bundle 层（启动时固化）→ profile 层 → home 层 → overlay，同 id 后者覆盖前者。toolkit 的 5 个子插件行在 bundle 层（dsh-plugins\\dsh-toolkit\\cordis.patch.yml）。',
  '面板服务端：panel/index.js，注入 webServer + subprocess，exact 路由 /api/toolkit-panel/*（ui / snapshot / doctor dry-run / plan / execute / plan/status）。',
  '面板客户端：panel/client/，经 ModuleLoader + settings.plugins.tab 挂进设置页；行名是 path-like file:///D:/dsh-plugins/dsh-toolkit/panel/index.js（三段名过不了客户端发现机制，这是当初迁移的原因）。',
  '安全链（不可破坏，逐条有事故背景）：全路由 guard = socket loopback AND（Host loopback OR 配对校验）；写路由必须标 {change:true}（P2.1 缺陷1的教训）且配对校验走 remoteWebUiPairing 服务、禁止 fallback hasOwn；公网唯一入口是 cloudflared 隧道（95c04a90ca73e397.dsh-market.com，持久化于 ~/.dsh/remote-web-ui-registry/web.json），手机经配对 cookie（dsh_pair）进门禁。',
  '写操作唯一通道：panel/manager/apply-engine.mjs（P2.1 建）。顺序不可调换：取 plan → 过期 → 重读比 SHA → 锚点复验 → 备份 → 落盘 → 裁剪备份。错误码：sha-conflict/plan-expired/anchor-ambiguous→409。',
  '冻结层警告：client bundle 与 panel/index.js 都是“激活时读入内存”，改了代码必须重启才生效；/snapshot 是实时计算的，不能用 snapshot 变了来判断 UI 已生效。',
  '已知待修：无（parseRootRows 缩进 bug 已在 193bdd8 修复）。',
  // 四（四段整段）
  '已完成并关账：P0（API 核查）、P1（面板骨架+安全修复，live smoke 27/27 时代）、UI 迁移进设置页（用户确认“可见，界面符合要求”）、P1.6 人话化（中文描述/三态/折叠/按钮去黑话；卡片标题为英文原名+中文副标题，用户明确要求，勿改回）、P2.0（parseRootRows 修复 ✅ + 写路由 guard 升级 ✅）、P2.1 两段式框架 ✅（commit a27da81，apply-engine 唯一通道，46+136+16 全绿）。',
  '进行中：P2.2 启停开关——刚获批开工。要求：rate-throttle 首用例、锚点唯一命中断言、CRLF 兼容断言（真实 patch 是 100% CRLF）、停用交叉检查、双层开关 UI 分立（patch disabled 与插件自身 config.enabled 不得合并）、apply-engine 唯一通道、写前备份。完成后通知用户按 restart-trigger reload。',
  '排队：P2.3 配置编辑（白名单：enabled 布尔/限流数值范围/路由模式枚举；服务端校验）→ P2.4 doctor 操作台+双回滚（doctor 回滚与面板备份回滚 UI 分列）。',
  '明确不做：双文件注册编辑（exports/aliases）、compact-router 搬进面板（卡片保持“由预设脚本管理”提示）。',
  // 五
  '见 handoff-restart.md 11.7 节。约束全项适用：两段式、SHA 冲突检测、锚点唯一、值白名单、CSRF+配对服务校验、写前备份、plugin-manager 并发防线（快照现读不缓存——PM 与我们写同一个文件）。',
  // 六（逐条）
  '源码转述≠事实：三次被实测推翻（gate 覆盖、Host 判据、api/gate 死监听器）。验证问题只许二选一作答（引用代码行 / 明确无分支），禁止开放描述。',
  '安全关键脚本改动必须 diff 留痕 + 全流程重验（restart-trigger 的教训：改动无痕导致三周后 runtime 炸雷）。',
  '重启/写盘前必须用户授权；异常带证据回报，不在线上调试；回滚先于排查。',
  '写前备份（.panel-backups/<name>-<stamp>/ + manifest + SHA）；备份必须语义化命名（同名覆盖曾造成假警报）。',
  '不碰：C:\\Users\\LENOVO\\.dsh（除按既定程序读 devices.json）、cloudflared 进程（用户唯一远程命脉，禁止试杀）、5 个子插件的源码目录。',
  '验收标准以用户体感为准：不读任何说明能说出每个插件干嘛的、开没开着；标识符英文原名+中文注释。',
  '每阶段验证 = p1-smoke + 该阶段专项（如 p21-verify）+ doctor dry-run 0/0/0 + pluggable-lint。',
  // 七（逐条）
  '重启 DSH：用户在电脑 PowerShell 跑 restart-trigger.ps1（或双击桌面“启动 DSH”快捷方式）；远程场景用一次性计划任务（-RunLevel Limited，New-ScheduledTaskTrigger 保留秒级，schtasks /ST 会截断秒——教训在案）。AI 永远不自行重启（AI 的进程树长在 DSH 上，自杀）。',
  '杀进程：一律 .NET Process.Kill()（leaves-first + 端口释放为唯一闸门 + Start-Process 前再断言防 TOCTOU），禁 taskkill /F（需 QUERY_INFORMATION 权限，历史被拒过；access mask 分布不恒定，不可依赖）。技能沉淀：win-process-termination。',
  '用户设备：手机已配对浏览器（deviceId 尾号 b6fd）；电脑浏览器开 127.0.0.1:3080。',
  '机器重启后 DSH 不自启（用户明确决策）：需人工双击桌面快捷方式。',
  'reload 节奏：client 可见阶段完成后报用户按一次按钮；纯服务端改动可攒着合并 reload。',
  // 八（单行整行）
  '三次源码转述被推翻（P0/P1.5 期）；gate 不罩插件 exact 路由、api/gate 是死监听器（dsh-client-modules 源码注释实锤）；/ST 截断秒导致提前触发；taskkill 三连败（管道 bug → conhost Access Denied → 0x0401 掩码）；备份同名覆盖假警报；initialBundleSnapshot 冻结层；$Pid 只读变量、UTF-8 被 PS5.1 按 GBK 解析；保留策略 OR 语义陷阱；锚点下插进 config 子树。',
  // 九（逐条）
  '用户是中文小白用户：一切交付以“不解释能看懂”为标准；工程黑话出现在 UI 即 bug。',
  '用户一句话可推翻技术决定（如“不自启”“名字改回来”），照办并记录，不劝阻第二次。',
  '每阶段验收让用户做“体感测试”（点开关、看卡片），不做抽象汇报。',
  '判定者（外部评审 AI）每轮验收，执行 AI 交证据；用户在两者间搬运消息。',
];

let pass = 0, fail = 0;
const out = [];
const P = s => { out.push(s); console.log(s); };
P('═'.repeat(74));
P('总文档合并 · 保真抽检（用户原文关键句 → 落盘文件逐字比对）');
P('探针取自用户粘贴原文（纯文本，无本侧格式）；落盘文件须原样包含。');
P('═'.repeat(74));
const nt = norm(t);
for (const probe of PROBES) {
  const hit = nt.includes(norm(probe));
  if (hit) { pass++; P(`  PASS  ${probe.slice(0, 40)}…`); }
  else { fail++; P(`  FAIL  ${probe.slice(0, 40)}…`); }
}
P('');
P(`RESULT: ${pass}/${pass + fail} PASS`);
P('═'.repeat(74));
fs.writeFileSync('D:\\dsh-plugins\\dsh-toolkit\\panel\\docs\\evidence\\MASTER-MERGE-FIDELITY.txt', out.join('\n') + '\n', 'utf8');
console.log('\n证据已写入: panel/docs/evidence/MASTER-MERGE-FIDELITY.txt');
