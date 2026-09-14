// dsh-compact-router / instant-digest.js
//
// LLM-free extractive summarizer with INSTRUCTION PRESERVATION.
//
// Besides keeping the shadowed region's role-by-role shape (head + tail verbatim
// within a budget, middle collapsed to short stubs), the digest now detects
// "operative instructions" — system messages, user messages that carry explicit
// directives, and any earlier digest's instruction section — and preserves them
// VERBATIM in a dedicated `## Active instructions` section at the top. This is
// what guarantees that after a TPM-triggered compaction (which usually follows
// several failed retries), the next model / next reply still receives the
// effective instructions intact, even when those instructions live in the
// middle of the conversation or inside a previous compaction summary.

/** Flatten a message `content` (string or model-content blocks) to plain text. */
export function contentToText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts = [];
  for (const block of content) {
    if (block == null) continue;
    if (typeof block === "string") {
      parts.push(block);
      continue;
    }
    if (typeof block !== "object") {
      parts.push(String(block));
      continue;
    }
    if (block.type === "text") parts.push(typeof block.text === "string" ? block.text : "");
    else if (block.type === "image") parts.push("[image]");
    else if (block.type === "tool-result") parts.push(contentToText(block.content));
    else if (block.type === "reasoning" || block.type === "thinking") parts.push(typeof block.text === "string" ? block.text : "");
    else if (block.type === "tool-call" || block.type === "tool_use" || block.type === "function_call") {
      const name =
        typeof block.name === "string"
          ? block.name
          : typeof block.function?.name === "string"
            ? block.function.name
            : "?";
      const id = typeof block.id === "string" ? block.id : "";
      parts.push(`[tool-call: ${name}${id ? ` (${id})` : ""}]`);
    } else if (typeof block.text === "string") parts.push(block.text);
    else parts.push(String(block));
  }
  return parts.filter((part) => part.length > 0).join("\n");
}

export function clean(text) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

/** Head + tail excerpt with an explicit trim marker and byte-ish char budget. */
export function excerpt(text, headChars, tailChars) {
  const source = clean(text);
  if (source.length <= headChars + tailChars) return source;
  const head = source.slice(0, headChars);
  const tail = source.slice(source.length - tailChars);
  const trimmed = source.length - headChars - tailChars;
  return `${head}\u2026[${trimmed} chars trimmed]\u2026${tail}`;
}

/** Head-only excerpt: for instructions the operative directive lives at the start. */
export function headOnly(text, maxChars) {
  const source = clean(text);
  if (source.length <= maxChars) return source;
  const trimmed = source.length - maxChars;
  return `${source.slice(0, maxChars)}\u2026[${trimmed} chars trimmed]\u2026`;
}

/**
 * Bare resume/continue commands the user sends after an interruption (429,
 * abort, overload…). A message that is ONLY made of these words means
 * "RESUME the interrupted work", NOT "re-run the previous tool call".
 * Anything more specific (e.g. "重试刚才那个搜索") is a substantive directive
 * and does NOT match.
 */
export const RESUME_ONLY_RE =
  /^(?:\s*(?:重试|继续|接着|接着来|接着做|继续做|接上|接续|再来|重新来|继续吧|干下去|continue|resume|redo|retry|keep going|go on|carry on)[\s。．！!?？,，、;；]*)+$/i;

/** Harness checkpoint preamble — an auto-generated notice, not a user task. */
const CHECKPOINT_PREAMBLE_RE = /^This is an automatically generated checkpoint/i;

/** Signals the previous turn died mid-flight (429 storms, auth errors…). */
const INTERRUPT_RE =
  /429|rate\s*[- ]?limit|tpm|rpm|quota|overload|busy|context window|authentication fails|api key|501|503|timeout/i;

/** True when the text is a bare resume command (see {@link RESUME_ONLY_RE}). */
export function isResumeCommand(text) {
  return RESUME_ONLY_RE.test(String(text ?? "").trim());
}

/** Last message with the given role (or undefined). */
function lastMessageWithRole(messages, role) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (msg && msg.role === role) return msg;
  }
  return undefined;
}

/**
 * Build the `## Current progress (resume point)` section: tells the NEXT model
 * (after a compaction that usually follows several failed retries) where the
 * conversation stands — original task request, last user request, last
 * assistant output, interruption signals, and the RESUME contract. Combined
 * with the Active instructions section this is what lets a freshly selected
 * model / provider continue the task instead of restarting — and what turns a
 * bare "重试" after an interruption into "continue the work" instead of a
 * confused reply about retrying.
 */
export function buildProgressSection(input, budget = {}) {
  const messages = Array.isArray(input?.messages) ? input.messages : [];
  if (messages.length === 0) return "";
  const maxChars = Number(budget.progressSectionChars ?? 2000);
  const lastUserChars = Number(budget.lastUserChars ?? 500);
  const lastAssistantChars = Number(budget.lastAssistantChars ?? 400);
  const originalTaskChars = Number(budget.originalTaskChars ?? 400);

  const lastUser = lastMessageWithRole(messages, "user");
  const lastAssistant = lastMessageWithRole(messages, "assistant");
  const lastRole = messages[messages.length - 1]?.role;

  const lines = ["## Current progress (resume point)", ""];
  lines.push(`- shadowed messages: ${messages.length}`);

  // ---- status: distinguish "bare resume command after an interruption"
  //      from a normal awaiting-reply / just-replied state.
  const lastUserText = lastUser ? contentToText(lastUser.content) : "";
  const resumePending = Boolean(lastUser) && lastRole === "user" && isResumeCommand(lastUserText);
  if (resumePending) {
    lines.push(
      "- status: INTERRUPTED \u2014 awaiting RESUME (your last message is a bare resume command after an interruption)",
    );
  } else if (lastRole === "user") {
    lines.push("- status: awaiting reply \u2014 respond to the last user request");
  } else if (lastRole === "assistant") {
    lines.push("- status: assistant has just replied; await the user's next instruction");
  } else {
    lines.push("- status: task in progress");
  }

  // ---- the task itself: the last SUBSTANTIVE user request, skipping
  //      bare resume-command spam and harness checkpoint preambles, so a
  //      model that wakes up on "重试 重试 重试…" still knows what the task is.
  let substantive = "";
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (!m || m.role !== "user") continue;
    const t = contentToText(m.content);
    if (isResumeCommand(t) || CHECKPOINT_PREAMBLE_RE.test(String(t).trim())) continue;
    substantive = t;
    break;
  }
  if (substantive) {
    lines.push(`- original task request: ${headOnly(substantive, originalTaskChars)}`);
  }

  if (lastUser) {
    const body = contentToText(lastUser.content);
    lines.push(`- last user request: ${body ? headOnly(body, lastUserChars) : "(empty)"}`);
  }
  if (lastAssistant) {
    const body = contentToText(lastAssistant.content);
    lines.push(`- last assistant output: ${body ? headOnly(body, lastAssistantChars) : "(empty)"}`);
  }

  // ---- interruption signal from the recent tail (429 / quota / overload…)
  const tailText = messages.slice(-6).map((m) => contentToText(m.content)).join("\n");
  const interrupt = INTERRUPT_RE.exec(tailText);
  if (interrupt) {
    lines.push(
      `- interruption reason detected in recent turns: "${interrupt[0]}" \u2014 the previous turn stopped here; resume from this point`,
    );
  }

  // ---- the RESUME contract: the #1 protection against "重试" being
  //      misread as "talk about retrying" or "re-run the last tool".
  lines.push(
    "- resume contract: if the very next input is a bare resume command (重试 / 继续 / 接着 / continue / retry), " +
      "it means RESUME the interrupted work from this checkpoint: continue the next unfinished step per the " +
      "Active instructions ABOVE. Do NOT restart the task, do NOT re-run completed tool calls, do NOT reply about the command itself.",
  );

  let text = lines.join("\n");
  if (text.length > maxChars) {
    // Drop the least critical optional bullets first, then hard-truncate.
    const dropLine = (ls, prefix) => {
      const idx = ls.findIndex((l) => l.startsWith(prefix));
      if (idx < 0) return null;
      const copy = ls.slice();
      copy.splice(idx, 1);
      return copy;
    };
    for (const prefix of ["- last assistant output:", "- interruption reason detected"]) {
      if (text.length <= maxChars) break;
      const reduced = dropLine(lines, prefix);
      if (!reduced) continue;
      lines.length = 0;
      lines.push(...reduced);
      text = lines.join("\n");
    }
  }
  return text.length <= maxChars ? text : text.slice(0, maxChars);
}

/**
 * Directive hints used to detect user messages that carry operative
 * instructions. System messages always count as instructions.
 */
const INSTRUCTION_RE =
  /(请|务必|必须|不要|禁止|不允许|记住|规则|要求|目标|指令|重要|注意|确保|优先|始终|always|never|must not|must|remember|important|instruction|rule|requirement|goal|do not|don't|should|shall|strictly)/i;
/** Marker of an earlier digest's instruction section (carry-forward). */
const PREV_DIGEST_RE = /## Active instructions/;

/**
 * P1（2026-09-11 按出处排除）：判定一条消息是"前一轮 checkpoint 摘要"。
 * 按出处标记（checkpoint 前导 / <compacted-summary> / 行首 Active instructions 区段 /
 * 条目行模式）——不按标题文本：LLM 轮即兴改标题（§5.2/§5.4），标题匹配必漏。
 * 变体标题反向用例：区段标题被重命名后，条目行模式（`- [i] role:`）仍按出处命中。
 */
export function isPriorCheckpoint(text) {
  const t = String(text ?? "");
  if (CHECKPOINT_PREAMBLE_RE.test(t) || /<compacted-summary>/.test(t) || /^## Active instructions\b/m.test(t)) {
    return true;
  }
  return /^- \[\d+\] (system|user|assistant|message-\d+): .+$/m.test(t);
}

/**
 * P1（只继承条目不整段收集）：从 checkpoint 文本中提取其指令条目（`- [i] role: content`）。
 * 变体标题反向用例：条目行模式与标题无关，重命名标题后仍能按出处命中。
 */
export function extractCheckpointInstructions(text) {
  const out = [];
  const m = String(text ?? "").matchAll(/^- \[(\d+)\] (system|user|assistant|message-\d+): (.+)$/gm);
  for (const g of m) out.push({ sourceIdx: g[1], role: g[2], content: g[3] });
  return out;
}

/**
 * Decide whether a message carries an operative instruction that must survive
 * compaction verbatim:
 *  - system role: always (the system prompt is the operative instruction);
 *  - any role whose text is (or contains) a previous digest's instruction
 *    section: carry it forward;
 *  - user role: text contains a directive hint, UNLESS the hint is explicitly
 *    negated (e.g. "没有任何指令" / "no instruction").
 */
export function isInstructionMessage(role, text) {
  const t = String(text ?? "");
  if (role === "system") return true;
  if (PREV_DIGEST_RE.test(t)) return true;
  if (role !== "user") return false;
  // Strip explicit negations so "没有任何指令" / "无指令要求" / "no instruction"
  // do not match the directive hints (and do not leave residue keywords behind).
  const probe = t
    .replace(
      /(没有.{0,2}指令|无.{0,1}指令|不是.{0,2}指令|非指令)(要求|事项|内容)?|no instructions?|not an instruction|ignores? (all )?instructions?/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  return INSTRUCTION_RE.test(probe);
}

/**
 * LLM-free extractive summarizer. Keeps the shadowed region's role-by-role
 * shape, preserves the head (early/goal messages) and tail (recent state)
 * verbatim within the budget, collapses the middle to short stubs, and —
 * when `preserveInstructions` is enabled — collects every operative
 * instruction into a `## Active instructions` section at the top, verbatim.
 *
 * The result is guaranteed to be a few KiB at most, so the engine's
 * "summary must be smaller" guard passes for any real overflow compaction.
 */
export function instantDigest(input, budget = {}) {
  const maxChars = Number(budget.maxChars ?? 12000);
  const headChars = Number(budget.headChars ?? 900);
  const tailChars = Number(budget.tailChars ?? 200);
  const headCount = Number(budget.headCount ?? 2);
  const tailCount = Number(budget.tailCount ?? 3);
  const midChars = Number(budget.midChars ?? 140);
  const preserveInstructions = budget.preserveInstructions !== false;
  const maxInstructions = Number(budget.maxInstructions ?? 6);
  const instructionChars = Number(budget.instructionChars ?? 1800);
  const preserveProgress = budget.preserveProgress !== false;

  const messages = Array.isArray(input?.messages) ? input.messages : [];
  const last = messages.length - 1;
  const lines = [];
  lines.push(`## Instant compaction (extractive)`, "");
  lines.push(`${messages.length} shadowed message(s), role-by-role verbatim excerpt below.`);

  let remaining = maxChars - clean(lines.join("\n")).length;

  // ---- instruction preservation (deduped, verbatim, budget-aware) ----
  // 指令正典化（§11）：若引擎/adapter 提供台账副本（agentMemoryCanonical），
  // 压缩产物指令区 = 台账副本 + 指针，启发式区段降为兜底。
  const instrLines = [];
  const canonical = budget.agentMemoryCanonical;
  const haveCanonical = typeof canonical === "string" && canonical.trim().length > 0;
  if (preserveInstructions && messages.length > 0 && !haveCanonical) {
    const seen = new Set();
    for (let i = 0; i < messages.length && instrLines.length < maxInstructions; i += 1) {
      const msg = messages[i];
      const role = typeof msg?.role === "string" && msg.role.length > 0 ? msg.role : `message-${i}`;
      const text = contentToText(msg?.content);
      if (text.length === 0) continue;
      // P1（2026-09-11）：前一轮 checkpoint 只继承其条目（按出处），不整段原文收集
      // （消除 <compacted-summary> 嵌套递归与预算挤占——§5.2 实证）。
      if (isPriorCheckpoint(text)) {
        const items = extractCheckpointInstructions(text);
        for (const it of items) {
          if (instrLines.length >= maxInstructions) break;
          if (seen.has(it.content)) continue;
          seen.add(it.content);
          instrLines.push(`- [继承@${it.sourceIdx}] ${it.role}: ${headOnly(it.content, instructionChars)}`);
        }
        continue;
      }
      if (!isInstructionMessage(role, text)) continue;
      if (seen.has(text)) continue;
      seen.add(text);
      instrLines.push(`- [${i}] ${role}: ${headOnly(text, instructionChars)}`);
    }
    if (instrLines.length > 0) {
      const header = "## Active instructions (preserved verbatim \u2014 follow them in every subsequent reply)";
      let block = [header, ...instrLines].join("\n") + "\n";
      while (instrLines.length > 0 && block.length > remaining) {
        instrLines.pop();
        block = [header, ...instrLines].join("\n") + "\n";
      }
      if (block.length <= remaining) {
        lines.push("", block.trimEnd());
        remaining -= block.length + 2;
      }
    }
  } else if (haveCanonical) {
    const block = canonical.trim();
    if (block.length <= remaining) {
      lines.push("", block);
      remaining -= block.length + 2;
    }
  }

  // ---- current progress (resume point) ----
  if (preserveProgress) {
    const progress = buildProgressSection(input, budget);
    if (progress.length > 0 && progress.length <= remaining) {
      lines.push("", progress);
      remaining -= progress.length + 2;
    }
  }

  // ---- 二阶段①：agent-memory 引导注入（固定模板；由引擎按会话元数据生成后传入） ----
  const guidance = budget.agentMemoryGuidance;
  if (typeof guidance === "string" && guidance.trim().length > 0 && guidance.length <= remaining) {
    lines.push("", guidance.trim());
    remaining -= guidance.length + 2;
  }

  // ---- 压缩存档指针：非全损保证——完整原文可按需查阅 ----
  const archivePointer = budget.archivePointer;
  if (
    typeof archivePointer === "string" &&
    archivePointer.trim().length > 0 &&
    archivePointer.length <= remaining
  ) {
    lines.push("", archivePointer.trim());
    remaining -= archivePointer.length + 2;
  }

  // ---- role-by-role excerpt (unchanged shape) ----
  for (let i = 0; i < messages.length && remaining > 8; i += 1) {
    const msg = messages[i];
    const role = typeof msg?.role === "string" && msg.role.length > 0 ? msg.role : `message-${i}`;
    const text = contentToText(msg?.content);
    const isHead = i < headCount;
    const isTail = i >= Math.max(headCount, last - tailCount + 1);

    let body;
    if (isHead || isTail) {
      body = excerpt(text, headChars, tailChars);
    } else {
      body = excerpt(text, midChars, Math.min(tailChars, 40));
    }
    if (body.length === 0) body = "(empty)";

    // Respect the global budget so a pathological region still ends up small.
    if (body.length > remaining) body = body.slice(0, Math.max(0, remaining - 1));

    lines.push("", `### [${i}] ${role}`, body);
    remaining -= body.length + 16;
  }

  return lines.join("\n").slice(0, maxChars);
}
