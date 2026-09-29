#!/usr/bin/env node
// Test the LLM-free extractive summarizer's instruction preservation.
// Pure module: no peer dependency required.
//
//   node test-instant-digest.mjs

import { instantDigest, isInstructionMessage, isResumeCommand, contentToText, isPriorCheckpoint, extractCheckpointInstructions } from "../lib/compact-router/instant-digest.js";
import { buildLedgerGuidance, buildGuidanceSection, defaultDataRoot } from "../lib/compact-router/guidance.js";
import { readLedgerItems, buildCanonicalInstructions, buildCanonicalFromLedger, buildLedgerPointer } from "../lib/compact-router/agent-memory.js";
import { fileURLToPath } from "node:url";
const SUITE_ROOT = fileURLToPath(new URL("..", import.meta.url));
let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
  if (!cond) failures += 1;
}

// --- heuristic unit checks ---
check("system role is instruction", isInstructionMessage("system", "anything at all"));
check("user with 请 is instruction", isInstructionMessage("user", "请把统计结果写进报告"));
check("user with must not is instruction", isInstructionMessage("user", "must not skip the table"));
check("user with 要求 is instruction", isInstructionMessage("user", "要求逐条列出"));
check("previous digest section is instruction", isInstructionMessage("user", "## Active instructions (preserved verbatim)"));
check("plain user chat is NOT instruction", !isInstructionMessage("user", "今天天气不错，随便聊聊。"));
check("assistant prose is NOT instruction", !isInstructionMessage("assistant", "我来帮你分析一下。"));
check("negated 没有任何指令 is NOT instruction", !isInstructionMessage("user", "这段话没有任何指令，只是闲聊。"));
check("negated 无指令 is NOT instruction", !isInstructionMessage("user", "本条消息无指令要求。"));
check("negated no instruction is NOT instruction", !isInstructionMessage("user", "This message contains no instruction, just chatter."));

// --- digest: middle instruction survives ---
// 12 messages: head = [0,1], tail = [9,10,11], true middle = [2..8].
const filler = (i) => ({
  role: i % 2 === 0 ? "user" : "assistant",
  content: `这是第 ${i} 条很长的普通讨论内容，没有任何指令，只是用来占位撑大上下文的废话。`.repeat(40),
});
// Longer than the 140-char mid stub so truncation is observable.
const LONG_INSTR =
  "请务必把 429 按小时统计成表格并逐行注释错误原因，同时把超时的请求单独列出一节，最后在报告结尾写上改进建议和下一步行动，不要省略任何一行数据。".repeat(3);
const messages = [
  { role: "system", content: "You are a coding assistant. 始终用中文回复；必须遵守用户的指令。" },
  { role: "user", content: "帮我看看路由日志里的 429。" },
  { role: "assistant", content: "好的，我先读取日志。" },
  { role: "user", content: LONG_INSTR }, // middle instruction (idx 3)
  filler(4),
  filler(5),
  filler(6),
  filler(7),
  filler(8),
  { role: "user", content: "下一步：请生成一份报告到 routing-log-report.md，确保包含每小时错误率。" }, // idx 9 tail
  { role: "assistant", content: "马上生成。" },
  { role: "user", content: "报告完成后贴出链接。" },
];

const out = instantDigest({ messages }, {});
const section = out.split("## Active instructions")[1]?.split(/\n### \[\d+\]/)[0] ?? "";
check("digest has Active instructions section", out.includes("## Active instructions"));
check("middle instruction preserved verbatim", out.includes(LONG_INSTR));
check("section lists system message", section.includes("[0] system"));
check("section lists middle instruction", section.includes("[3] user"));
check("section does NOT list filler", !section.includes("[4] user"), `section=${section.slice(0, 200)}`);
check("tail instruction preserved verbatim", out.includes("请生成一份报告到 routing-log-report.md"));
check("system instruction preserved", out.includes("始终用中文回复；必须遵守用户的指令。"));
// filler appears only as a short stub (count occurrences of its repeated phrase:
// full preservation would be ~40, a stub is a handful)
const fillerHits = (out.match(/这是第 4 条/g) ?? []).length;
check("middle filler is stubbed, not preserved", fillerHits < 10, `hits=${fillerHits}`);
check("digest within maxChars", out.length <= 12000, `len=${out.length}`);

// --- progress / resume-point section ---
check("digest has Current progress section", out.includes("## Current progress (resume point)"));
check("progress lists last user request", out.includes("last user request: 报告完成后贴出链接。"));
check("progress lists last assistant output", out.includes("last assistant output: 马上生成。"));
check("progress notes awaiting reply (last message is user)", out.includes("status: awaiting reply"));
check("progress has resume contract", out.includes("resume contract"));
check("progress has original task request", out.includes("original task request:"));

const outNoProgress = instantDigest({ messages }, { preserveProgress: false });
check("preserveProgress=false removes progress section", !outNoProgress.includes("## Current progress (resume point)"));
check("preserveProgress=false keeps instructions", outNoProgress.includes("## Active instructions"));

// --- digest: carry-forward of an earlier digest ---
const prevDigestText = "## Active instructions (preserved verbatim — follow them in every subsequent reply)\n- [0] system: 必须使用中文回复。";
const secondRound = [
  { role: "system", content: "You are a coding assistant." },
  { role: "user", content: prevDigestText },
  { role: "user", content: "继续分析，请保持表格格式。" },
];
const out2 = instantDigest({ messages: secondRound }, {});
check("second compaction carries previous instruction section", out2.includes("## Active instructions"));
check("previous instruction text survives", out2.includes("必须使用中文回复。"));
check("new instruction survives", out2.includes("请保持表格格式。"));
check("second digest within maxChars", out2.length <= 12000, `len=${out2.length}`);

// --- digest: disabled via budget flag ---
const out3 = instantDigest({ messages }, { preserveInstructions: false });
check("preserveInstructions=false removes section", !out3.includes("## Active instructions"));
check("long middle instruction truncated when disabled", !out3.includes(LONG_INSTR));

// --- digest: tiny budget still fits ---
const out4 = instantDigest({ messages }, { maxChars: 1500 });
check("tiny budget still bounded", out4.length <= 1500, `len=${out4.length}`);

// --- resume scenario: 429 interruption followed by a bare "重试" ---
// This is the exact situation the user complained about: after a rate-limit
// storm the conversation is compacted, the user sends "重试", and the next
// model must RESUME the task instead of talking about retrying.
check("bare 重试 is a resume command", isResumeCommand("重试"));
check("bare 继续 is a resume command", isResumeCommand("继续"));
check("bare continue is a resume command", isResumeCommand("continue"));
check("specific retry is NOT bare resume", !isResumeCommand("重试一下刚才那个搜索"));
check("task instruction is NOT resume", !isResumeCommand("请统计路由日志里的 429"));
check("empty string is NOT resume", !isResumeCommand(""));

const resumeMsgs = [
  { role: "system", content: "You are a coding assistant. 必须严格按照用户指令执行，换模型后接续未完成的工作。" },
  { role: "user", content: "请统计路由日志中 429 的次数，按小时生成表格写入 routing-log-report.md。" },
  { role: "assistant", content: "我先读取路由日志文件。" },
  { role: "tool", content: "Tool: bash - reading routing log..." },
  { role: "assistant", content: "HTTP 429 error: rate limit exceeded, retrying." },
  { role: "user", content: "重试" },
];
const outR = instantDigest({ messages: resumeMsgs }, {});
check("resume: digest has Active instructions", outR.includes("## Active instructions"));
check("resume: original task request preserved", outR.includes("original task request: 请统计路由日志中 429"));
check("resume: bare 重试 marked as interrupted/resume", outR.includes("INTERRUPTED \u2014 awaiting RESUME"));
check("resume: 429 interruption reason detected", outR.includes("interruption reason detected"));
check("resume: 429 signal mentions rate limit", /interruption reason detected[^\n]*"?429"?/.test(outR));
check("resume: contract forbids restart", outR.includes("Do NOT restart the task"));
check("resume: contract forbids re-running completed tools", outR.includes("do NOT re-run completed tool calls"));
check("resume: contract mentions 重试 meaning", /resume contract:[^\n]*重试/.test(outR));

// multiple bare resume commands: original task still found
const resumeSpam = [
  ...resumeMsgs,
  { role: "user", content: "重试" },
  { role: "user", content: "继续" },
];
const outS = instantDigest({ messages: resumeSpam }, {});
const progS = outS.split("## Current progress (resume point)")[1] ?? "";
check("resume-spam: original task still found", progS.includes("original task request: 请统计路由日志中 429"));
check("resume-spam: last user request is the resume command", progS.includes("last user request: 继续"));
check("resume-spam: status is interrupted", progS.includes("INTERRUPTED"));
check("resume-spam: digest stays bounded", outS.length <= 12000, `len=${outS.length}`);

// a normal pending question is NOT mislabeled as interrupted
const plainMsgs = [
  { role: "user", content: "帮我看看这个文件。" },
  { role: "assistant", content: "已读取，内容如下…" },
  { role: "user", content: "接下来呢？" },
];
const outP = instantDigest({ messages: plainMsgs }, {});
const progP = outP.split("## Current progress (resume point)")[1] ?? "";
check("plain pending: status is awaiting reply", progP.includes("status: awaiting reply"));
check("plain pending: NOT interrupted", !progP.includes("INTERRUPTED"));

// --- P0: tool-call blocks must not render as "[object Object]" ---
const toolCallText = contentToText([
  { type: "tool-call", id: "call_123", name: "bash", arguments: "{}" },
]);
check("P0: tool-call block renders as [tool-call: name]", /^\[tool-call: bash \(call_123\)\]$/.test(toolCallText), `text=${toolCallText}`);
check("P0: tool-call block is NOT [object Object]", !toolCallText.includes("[object Object]"));
const toolCallTextNoId = contentToText([{ type: "tool_use", name: "run_code" }]);
check("P0: tool_use without id still renders name", toolCallTextNoId.includes("[tool-call: run_code]"), `text=${toolCallTextNoId}`);
const functionCallText = contentToText([{ type: "function_call", function: { name: "bash" } }]);
check("P0: function_call via function.name renders", functionCallText.includes("[tool-call: bash]"), `text=${functionCallText}`);
// The last assistant output in the progress section must be readable, not "[object Object]"
const toolCallMsgs = [
  { role: "user", content: "请执行并读取日志。" },
  { role: "assistant", content: [{ type: "text", text: "好的，执行中。" }] },
  {
    role: "assistant",
    content: [{ type: "tool-call", id: "call_9", name: "bash", arguments: "{\"command\":\"ls\"}" }],
  },
];
const outTC = instantDigest({ messages: toolCallMsgs }, {});
check("P0: progress last assistant output is not [object Object]", !outTC.includes("last assistant output: [object Object]"));
check("P0: progress last assistant output mentions the tool call", outTC.includes("[tool-call: bash (call_9)]"));

// --- 二阶段①: agent-memory 引导注入（固定模板；只从会话元数据生成） ---
check("guidance: buildLedgerGuidance 内嵌 root/sid/路径", buildLedgerGuidance("D:\\ws-a", "20260101-abc12345").includes("D:\\ws-a/sessions/20260101-abc12345/ledger.md"));
check("guidance: 模板固定开头", buildLedgerGuidance("C:/x", "s1").startsWith("[ledger/progress] 会话 s1：请先读取"));
check("guidance: 尾部反斜杠归一化", !buildLedgerGuidance("D:\\ws-a\\", "s1").includes("\\\\/"));
check("guidance: 默认根 = 主目录/.agent-memory", defaultDataRoot().endsWith(".agent-memory"));

const guidanceText = buildGuidanceSection("D:\\ws-a", "20260101-abc12345");
check("guidance: 区段标题", guidanceText.startsWith("## Agent-memory guidance"));
const outG = instantDigest({ messages }, { agentMemoryGuidance: guidanceText });
check("guidance: digest 含注入区段", outG.includes("## Agent-memory guidance"));
check("guidance: digest 含固定模板", outG.includes("[ledger/progress] 会话 20260101-abc12345：请先读取 D:\\ws-a/sessions/20260101-abc12345/ledger.md 与 progress.md"));
const outNoG = instantDigest({ messages }, {});
check("guidance: 未配置则不注入", !outNoG.includes("## Agent-memory guidance"));

// --- P1（②，2026-09-11 按出处排除 + 只继承条目不整段收集） ---
function aiSection(out) {
  const i = out.indexOf("## Active instructions");
  if (i < 0) return "";
  const j = out.indexOf("\n## ", i + 2);
  return j < 0 ? out.slice(i) : out.slice(i, j);
}
check("P1: isPriorCheckpoint 识别前轮摘要", isPriorCheckpoint("This is an automatically generated checkpoint\n<compacted-summary>\n## Active instructions (x)\n- [0] user: y"));
check("P1: 变体标题仍按条目模式识别", isPriorCheckpoint("## Operating Directives\n- [2] user: 重命名后仍须继承"));
check("P1: extract 提取条目", extractCheckpointInstructions("## Operating Directives\n- [1] system: always\n- [2] user: 任务").length === 2);

const prevCheckpoint =
  "This is an automatically generated checkpoint condensing an earlier span.\n\n<compacted-summary>\n## Instant compaction (extractive)\n\n## Active instructions (preserved verbatim \u2014 follow them in every subsequent reply)\n- [0] user: 旧轮核心指令A：必须完成 X\n- [3] system: 始终使用中文回复。\n</compacted-summary>";
const outP1 = instantDigest(
  { messages: [{ role: "system", content: "You are a coding assistant." }, { role: "user", content: prevCheckpoint }, { role: "user", content: "继续，请保持表格格式。" }] },
  {}
);
const aiP1 = aiSection(outP1);
check("P1: 条目被继承（[继承@]）", aiP1.includes("[继承@0] user: 旧轮核心指令A") && aiP1.includes("必须完成 X"));
check("P1: 系统指令继承", aiP1.includes("[继承@3] system: 始终使用中文回复"));
check("P1: 不整段收集 checkpoint（AI 区段无 <compacted-summary>）", !aiP1.includes("<compacted-summary>"));
check("P1: 不整段收集前导原文", !aiP1.includes("This is an automatically generated checkpoint"));
check("P1: 新一轮指令保留", outP1.includes("请保持表格格式。"));

// 变体标题反向用例：重命名标题后仍按出处命中
const prevVariant = "## Operating Directives\n- [2] user: 重命名标题仍须按出处继承";
const outP1v = instantDigest(
  { messages: [{ role: "system", content: "s" }, { role: "user", content: prevVariant }, { role: "user", content: "继续。" }] },
  {}
);
const aiP1v = aiSection(outP1v);
check("P1-变体: 重命名标题后条目仍继承", aiP1v.includes("[继承@2] user: 重命名标题仍须按出处继承"));

// --- 指令正典化（§11/④）：台账副本 + 指针替换启发式区段 ---
const canonItems = [
  { no: "L-000", status: "进行中", desc: "设计 ledger 格式" },
  { no: "L-001", status: "待办", desc: "实现注册表写入器" },
];
const canonText = buildCanonicalInstructions("D:\\ws-a", "20260101-abc12345", canonItems);
check("canonical: 指针行", buildLedgerPointer("D:\\ws-a", "20260101-abc12345").includes("D:\\ws-a/sessions/20260101-abc12345/ledger.md，文件为准"));
check("canonical: 区段头", canonText.startsWith("## Active instructions（正典副本，文件为准）"));
check("canonical: 台账条目", canonText.includes("- [台账] L-000 [进行中] 设计 ledger 格式"));
check("canonical: 空台账占位", buildCanonicalInstructions("R", "s", []).includes("（无进行中/待办条目）"));

const outC = instantDigest({ messages }, { agentMemoryCanonical: canonText });
const aiC = aiSection(outC);
check("canonical: digest 含正典区段", aiC.includes("## Active instructions（正典副本，文件为准）"));
check("canonical: digest 含指针", aiC.includes("（正典：D:\\ws-a/sessions/20260101-abc12345/ledger.md，文件为准）"));
check("canonical: digest 含台账条目", aiC.includes("- [台账] L-001 [待办] 实现注册表写入器"));
check("canonical: 启发式降级（无 [i] 条目行）", !aiC.includes("- [9] user:"));

// 适配层：读真实台账（注入 agent-memory lib）；agent-memory 缺席时跳过（不红）
const os = await import("node:os");
const fsx = await import("node:fs");
const pth = await import("node:path");
const amAvailable = fsx.existsSync(pth.join(SUITE_ROOT, "lib", "agent-memory", "dsh.plugin.json"));
if (amAvailable) {
  const agentMemoryLib = await import("../lib/agent-memory/lib/index.js");
  const tmp = fsx.mkdtempSync(pth.join(os.tmpdir(), "am-canon-"));
  const wsT = pth.resolve(pth.join(tmp, "ws"));
  fsx.mkdirSync(wsT, { recursive: true });
  const sess = agentMemoryLib.createSession(tmp, { dshSessionId: "canon-sess-1", taskSummary: "正典测试", workspace: wsT, modelTurn: 1 });
  agentMemoryLib.addEntry(tmp, sess.sid, { desc: "进行中条目：实现引导注入", workspace: wsT, modelTurn: 2 });
  agentMemoryLib.setEntryStatus(tmp, sess.sid, "L-000", "已完成", { workspace: wsT, modelTurn: 3 });
  agentMemoryLib.addEntry(tmp, sess.sid, { desc: "待办条目：P1 防递归", workspace: wsT, modelTurn: 4 });
  const rows = await readLedgerItems({ agentMemoryLib, root: tmp, sid: sess.sid });
  check("adapter: 读台账待办条目", Array.isArray(rows) && rows.some((r) => r.desc.includes("P1 防递归")));
  check("adapter: 已完成条目不在进行中/待办采集范围", !rows.some((r) => r.no === "L-000"));
  const canonFromLedger = await buildCanonicalFromLedger({ agentMemoryLib, root: tmp, sid: sess.sid });
  check("adapter: 从台账生成正典副本", canonFromLedger.includes("P1 防递归"));
  const outCL = instantDigest({ messages }, { agentMemoryCanonical: canonFromLedger });
  check("adapter: digest 含台账正典", aiSection(outCL).includes("（正典：") && aiSection(outCL).includes("[台账]"));
  // EXE-BOOT-011 施工笔4（批准案 D）：未完成全谱＝进行中/待办/已搁置——已搁置并入正典采集
  // （与 buildRecoveryReport"未完成指令"清单口径一致；排列在活跃条目之后，8 条上限下让优先级）
  agentMemoryLib.addEntry(tmp, sess.sid, { desc: "搁置条目：等用户拍板", workspace: wsT, modelTurn: 5 });
  agentMemoryLib.setEntryStatus(tmp, sess.sid, "L-002", "已搁置", { workspace: wsT, modelTurn: 5 });
  const rowsS = await readLedgerItems({ agentMemoryLib, root: tmp, sid: sess.sid });
  check("adapter: 已搁置条目并入正典采集", Array.isArray(rowsS) && rowsS.some((r) => r.desc.includes("等用户拍板")));
  const canonS = await buildCanonicalFromLedger({ agentMemoryLib, root: tmp, sid: sess.sid });
  check("adapter: 正典副本含已搁置行", canonS.includes("[台账] L-002 [已搁置] 搁置条目：等用户拍板"));
} else {
  check("adapter: agent-memory 缺席 → 跳过真实台账段", true);
}

// --- instantOnceFor hook (downgrade-compaction seam for dsh-rate-throttle) ---
import RouterCompactionEngine, { resolveSummarizeMode } from "../lib/compact-router/index.js";

check(
  "hook: once-instant 优先于一切模式",
  resolveSummarizeMode({ baseMode: "llm", sessionOverride: "auto", onceInstant: true }) === "instant",
);
check(
  "hook: 会话覆盖优先于默认模式",
  resolveSummarizeMode({ baseMode: "auto", sessionOverride: "llm", onceInstant: false }) === "llm",
);
check(
  "hook: 无覆盖无 once 时用默认模式",
  resolveSummarizeMode({ baseMode: "auto", sessionOverride: undefined, onceInstant: false }) === "auto",
);
{
  // Prototype-level mechanics without instantiating the base engine.
  const fake = { onceInstant: new Set() };
  const agent = { session: { id: "sess-hook-1" } };
  const armed = RouterCompactionEngine.prototype.instantOnceFor.call(fake, agent);
  check("hook: instantOnceFor 返回 true（能力探测）", armed === true);
  check("hook: 消费前 once 集合已登记", fake.onceInstant.has("sess-hook-1"));
  const consumed = RouterCompactionEngine.prototype.consumeOnceInstant.call(fake, agent);
  check("hook: 首次消费命中", consumed === true);
  const consumedAgain = RouterCompactionEngine.prototype.consumeOnceInstant.call(fake, agent);
  check("hook: once 自清除（第二次消费为空）", consumedAgain === false);
  const armedNoSid = RouterCompactionEngine.prototype.instantOnceFor.call(fake, { session: {} });
  check("hook: 无会话 id 时拒绝并返回 false", armedNoSid === false);
}

// --- compaction archive (not-a-total-loss guarantee) ---
import {
  writeCompactionArchive,
  listCompactionArchives,
  buildArchivePointer,
  buildEnrichmentText,
} from "../lib/compact-router/archive.js";
{
  const aroot = fsx.mkdtempSync(pth.join(os.tmpdir(), "am-archive-"));
  const sid = "arch-sess-1";
  const messages = Array.from({ length: 30 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `消息 ${i}：` + "x".repeat(200),
  }));
  // 偶发竞态护栏（2026-09-13 复检定位）：同一毫秒内连写多份存档时 NTFS 的 mtime 粒度
  // 会打结，而 pruneArchives / listCompactionArchives 都按 mtimeMs 排序——保留哪份、
  // "最新在前"的顺序都会变得不确定。显式把四份存档钉成递增 mtime，本段只测逻辑本身。
  const aT0 = Date.now() - 10_000;
  const pinMtime = (a, sec) => {
    if (a) fsx.utimesSync(a.path, new Date(aT0 + sec * 1000), new Date(aT0 + sec * 1000));
  };
  const a1 = writeCompactionArchive({ root: aroot, sid, messages, keep: 3 });
  pinMtime(a1, 0);
  check("archive: 写档成功且计数正确", a1 !== null && a1.count === 30 && a1.bytes > 0);
  check("archive: 指针行含路径与条数", buildArchivePointer(a1).includes(a1.path) && buildArchivePointer(a1).includes("30"));
  const a2 = writeCompactionArchive({ root: aroot, sid, messages, keep: 3 });
  pinMtime(a2, 1);
  check("archive: 二次写档产生新文件", a2 !== null && a2.path !== a1.path);
  const a3 = writeCompactionArchive({ root: aroot, sid, messages, keep: 3 });
  pinMtime(a3, 2);
  const a4 = writeCompactionArchive({ root: aroot, sid, messages, keep: 3 });
  pinMtime(a4, 3);
  const listed = listCompactionArchives({ root: aroot, sid });
  check("archive: 保留策略只留最近 3 份", listed.length === 3, `got ${listed.length}`);
  check("archive: 清单按最新在前", listed[0].path === a4.path);
  check("archive: 空消息/缺 sid 返回 null 不抛错", writeCompactionArchive({ root: aroot, sid, messages: [] }) === null && writeCompactionArchive({ root: aroot, sid: "", messages }) === null);
  const empty = listCompactionArchives({ root: aroot, sid: "no-such-session" });
  check("archive: 清单空会话返回空数组", Array.isArray(empty) && empty.length === 0);
  // digest 注入指针
  const ptr = buildArchivePointer(a1);
  const digestWithArchive = instantDigest({ messages: messages.slice(0, 4) }, { archivePointer: ptr, maxChars: 3000 });
  check("archive: instant digest 含存档指针", digestWithArchive.includes("[压缩存档]") && digestWithArchive.includes(a1.path));
  check("archive: digest 无指针时不出现在产物", !instantDigest({ messages: messages.slice(0, 2) }, { maxChars: 2000 }).includes("[压缩存档]"));
}

// --- LLM 路径注入文本（补 auto 模式缺口） ---
check("enrich: 正典+引导+指针拼接", buildEnrichmentText({ canonical: "## Active instructions（正典副本）", guidance: "## Agent-memory guidance", archivePointer: "- [压缩存档] x" }).includes("正典"));
check("enrich: 全空返回空串（不追加无意义块）", buildEnrichmentText({}) === "");
check(
  "enrich: 超长截断有界",
  buildEnrichmentText({ canonical: "y".repeat(9000), maxChars: 6000 }).length <= 6200,
);

// --- /compact-archive 命令处理 ---
{
  const aroot = fsx.mkdtempSync(pth.join(os.tmpdir(), "am-archive-cmd-"));
  const RouterCompactionEngineCtor = RouterCompactionEngine; // default export
  const fake = { agentMemoryRoot: aroot, resolveSid: async (agent) => agent?.session?.id ?? null };
  const agent = { session: { id: "cmd-sess-1" } };
  const invocation = { agent };
  const noArchive = await RouterCompactionEngineCtor.prototype.handleCompactArchive.call(fake, invocation);
  check("cmd: 无存档时明确提示", noArchive.kind === "success" && noArchive.text.includes("no compaction archives"));
  writeCompactionArchive({ root: aroot, sid: "cmd-sess-1", messages: [{ role: "user", content: "hi" }] });
  const listing = await RouterCompactionEngineCtor.prototype.handleCompactArchive.call(fake, invocation);
  check("cmd: 有存档时列出路径", listing.kind === "success" && listing.text.includes("compaction-") && listing.text.includes(aroot));
  const noSid = await RouterCompactionEngineCtor.prototype.handleCompactArchive.call(fake, { agent: { session: {} } });
  check("cmd: 无会话 id 报错", noSid.kind === "error");
}

console.log("\n--- sample digest (first 1000 chars) ---");
console.log(out.slice(0, 1000));

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exitCode = failures === 0 ? 0 : 1;
