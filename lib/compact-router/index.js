// dsh-compact-router
//
// A drop-in replacement for the `@deepseek-ai/dsh-compaction-basic` compaction
// SERVICE. It subclasses BasicCompactionEngine (which owns the durable
// replay/mutation transaction, token-meter pricing, range selection and the
// "summary must be smaller" guard) and overrides ONLY the documented sole hook
// `summarize()`. The summarizer is therefore selectable per deployment:
//
//   mode: "auto"    (default) LLM summarization first; if that call fails with
//                   a rate-limit / quota / TPM error, fall back to the
//                   LLM-free extractive summarizer so a TPM-limited request can
//                   still be compacted without a model call.
//   mode: "llm"     always use the built-in LLM summarizer (same as upstream).
//   mode: "instant" always use the LLM-free extractive summarizer (no model
//                   call at all — compaction can never be 429'd itself).
//
// `ctx.compaction` is one-per-context, so two engines cannot coexist as two
// services; this router is exactly one engine that dispatches per selected
// mode.
//
// No runtime dependencies beyond re-using the harness's own compaction-basic
// subclass target.

import { BasicCompactionEngine } from "@deepseek-ai/dsh-compaction-basic";
import { instantDigest } from "./instant-digest.js";
import { defaultDataRoot, buildGuidanceSection } from "./guidance.js";

import {
  buildArchivePointer,
  buildEnrichmentText,
  listCompactionArchives,
  writeCompactionArchive,
} from "./archive.js";

export { instantDigest } from "./instant-digest.js";
export {
  buildArchivePointer,
  buildEnrichmentText,
  listCompactionArchives,
  writeCompactionArchive,
} from "./archive.js";

export const name = "compact-router";

/** Recognise the failure classes an instant fallback is allowed to swallow. */
function isRateLimitFailure(err) {
  if (!err) return false;
  if (err.status === 429) return true;
  if (err.code === "RATE_LIMIT" || err.code === "QUOTA") return true;
  const text = String(err.message ?? "");
  return /rpm|tpm|rate.?limit|quota/i.test(text);
}

/**
 * 惰性访问 ./agent-memory.js。该模块内部再以惰性单例加载可选依赖 agent-memory；
 * 此处每次函数调用走 dynamic import，阻断模块加载期硬依赖。
 */
let agentMemoryAdapterPromise;
async function getAgentMemoryAdapter() {
  if (!agentMemoryAdapterPromise) {
    agentMemoryAdapterPromise = import("./agent-memory.js").catch((err) => {
      console.info(
        '[compact-router] agent-memory adapter unavailable: ' + (err?.code ?? err?.message ?? String(err)),
      );
      return null;
    });
  }
  return agentMemoryAdapterPromise;
}

async function buildCanonicalFromLedger(opts) {
  const m = await getAgentMemoryAdapter();
  if (!m) return null;
  return m.buildCanonicalFromLedger(opts);
}

async function buildStaleHint(opts) {
  const m = await getAgentMemoryAdapter();
  if (!m) return '';
  return m.buildStaleHint(opts);
}

async function loadAgentMemory(agentMemoryLib) {
  if (agentMemoryLib) return agentMemoryLib;
  const m = await getAgentMemoryAdapter();
  if (!m) return null;
  return m.loadAgentMemory();
}

async function resolveMemorySid(opts) {
  const m = await getAgentMemoryAdapter();
  if (!m) return String(opts?.hostId ?? '').trim();
  return m.resolveMemorySid(opts);
}

/** The provider/model the summarizer should attribute the checkpoint to. */
function resolveTarget(config, agent) {
  if (config.summarizationProvider && config.summarizationModel) {
    return { provider: config.summarizationProvider, model: config.summarizationModel };
  }
  const latest = agent?.session?.requestHeader?.()?.config;
  if (latest?.provider && latest?.model) {
    return { provider: latest.provider, model: latest.model };
  }
  const options = agent?.options;
  if (options?.provider && options?.model) {
    return { provider: options.provider, model: options.model };
  }
  return { provider: "", model: "" };
}

/**
 * 引擎摘要组装（④/①，可离线测试）：引导注入 + 台账正典副本 → instantDigest。
 * 与 instantSummarize 共用同一逻辑（引擎在 harness 内实例化时直接复用本函数）。
 * sid 一致性：config.sid（引擎已解析的 memory sid）优先，其次 agent.session.id兜底。
 */
export async function composeInstantDigest({ messages, agent, config }) {
  const budget = { ...(config?.instantBudget ?? {}) };
  const sid = config?.sid ?? agent?.session?.id;
  if (sid && config?.instantAgentMemoryGuidance !== false) {
    const am = await loadAgentMemory(config?.agentMemoryLib);
    if (am) {
      const root = config?.agentMemoryRoot ?? defaultDataRoot();
      budget.agentMemoryGuidance =
        buildGuidanceSection(root, sid) +
        (await buildStaleHint({ agentMemoryLib: config?.agentMemoryLib, root, sid }));
    }
  }
  if (typeof config?.archivePointer === "string" && config.archivePointer.trim().length > 0) {
    budget.archivePointer = config.archivePointer;
  }
  const canonical = await buildCanonicalFromLedger({
    agentMemoryLib: config?.agentMemoryLib,
    root: config?.agentMemoryRoot ?? defaultDataRoot(),
    sid,
  });
  if (canonical) budget.agentMemoryCanonical = canonical;
  return instantDigest({ messages }, budget);
}

/**
 * Pure mode resolution for ONE summarize() call (unit-testable without the
 * base engine). Precedence: an on-demand instant request from a caller
 * (dsh-rate-throttle's downgrade compaction, via instantOnceFor()) wins over
 * everything, then the per-session hot-switch override, then the config
 * default.
 */
export function resolveSummarizeMode({ baseMode, sessionOverride, onceInstant }) {
  if (onceInstant) return "instant";
  return sessionOverride ?? baseMode;
}

class RouterCompactionEngine extends BasicCompactionEngine {
  // H3（债务 D-12 双通道统一）：cordis 只读**交给它的那个对象**上的 name/inject/Config
  // （`registry.plugin()` 取 `plugin.name`），而宿主装载器是 `exports.default ?? exports`
  // 的纯替换——本文件第 43 行那份模块级 `export const name` 到不了它手上，于是宿主通道里
  // 这个 fiber 叫 `RouterCompactionEngine`、面板 registry 通道里叫 `compact-router`。
  // 名字必须长在类上，两条通道才会给出同一个名字（装载器的保守合并只作其它形态的兜底）。
  static name = "compact-router";
  // `commands` is added so the hot-switch commands register through the same
  // host command registry that `/compact` uses — which is what the input-box
  // "/" palette lists.
  static inject = ["llm", "tokenMeter", "sessions", "commands"];

  constructor(ctx, config = {}) {
    // Strip router-only keys before the base resolver validates the rest; the
    // base engine rejects unknown config keys by design.
    const {
      mode = "auto",
      instantMaxChars = 12000,
      instantHeadChars = 900,
      instantTailChars = 200,
      instantHeadCount = 2,
      instantTailCount = 3,
      instantMidChars = 140,
      instantPreserveInstructions = true,
      instantMaxInstructions = 6,
      instantInstructionChars = 1800,
      instantPreserveProgress = true,
      instantProgressSectionChars = 2000,
      instantLastUserChars = 500,
      instantLastAssistantChars = 400,
      instantOriginalTaskChars = 400,
      fallbackOnRateLimit = true,
      // 压缩存档：完整原文存档 + 摘要内指针（非全损保证）
      archive = true,
      archiveKeep = 10,
      // 二阶段①（2026-09-11）：agent-memory 引导注入配置
      agentMemoryRoot,
      instantAgentMemoryGuidance = true,
      agentMemoryLib, // ④/§11 数据源：注入 agent-memory 模块（测试/部署接线）；缺省懒加载
      ...basic
    } = config ?? {};
    super(ctx, basic);
    this.mode = mode === "llm" || mode === "instant" || mode === "auto" ? mode : "auto";
    this.instantBudget = {
      maxChars: Number(instantMaxChars) || 12000,
      headChars: Number(instantHeadChars) || 900,
      tailChars: Number(instantTailChars) || 200,
      headCount: Number(instantHeadCount) || 2,
      tailCount: Number(instantTailCount) || 3,
      midChars: Number(instantMidChars) || 140,
      preserveInstructions: instantPreserveInstructions !== false,
      maxInstructions: Number(instantMaxInstructions) || 6,
      instructionChars: Number(instantInstructionChars) || 1800,
      preserveProgress: instantPreserveProgress !== false,
      progressSectionChars: Number(instantProgressSectionChars) || 2000,
      lastUserChars: Number(instantLastUserChars) || 500,
      lastAssistantChars: Number(instantLastAssistantChars) || 400,
      originalTaskChars: Number(instantOriginalTaskChars) || 400,
    };
    this.fallbackOnRateLimit = fallbackOnRateLimit !== false;
    // 压缩存档：每次压缩把完整被压原文写进数据根，摘要携带指针（写档失败不阻断压缩）
    this.archive = archive !== false;
    this.archiveKeep = Number(archiveKeep) > 0 ? Math.floor(Number(archiveKeep)) : 10;
    // 二阶段①：固定全局数据根（§12-2）+ 注入开关
    this.agentMemoryRoot = agentMemoryRoot ?? defaultDataRoot();
    this.instantAgentMemoryGuidance = instantAgentMemoryGuidance !== false;
    this.agentMemoryLib = agentMemoryLib ?? null;
    // Per-session runtime override; the default is the config `mode`. Because
    // the preset standing mount is shared across every session using it, the
    // hot switch is keyed by session id instead of mutating `this.mode`.
    this.overrides = new Map();
    // On-demand instant requests (one summarize() call each), keyed by session
    // id. dsh-rate-throttle uses instantOnceFor() so a downgrade-prep
    // compaction never makes its own LLM call (which would itself 429 under
    // TPM pressure). Self-clearing: consumed by the next summarize() call.
    this.onceInstant = new Set();
    this._registerCommands();
  }

  /** Effective mode for one agent (session override wins over config). */
  modeFor(agent) {
    const sid = agent?.session?.id;
    if (sid && this.overrides.has(sid)) return this.overrides.get(sid);
    return this.mode;
  }

  /**
   * Request that THIS session's NEXT compaction uses the LLM-free extractive
   * summarizer, regardless of mode/override. Returns true when the engine
   * supports it (capability probe for callers like dsh-rate-throttle that
   * must work against the stock compaction-basic engine too). Auto-clears
   * after one consume and never touches /compact-mode overrides.
   */
  instantOnceFor(agent) {
    const sid = agent?.session?.id;
    if (!sid) return false;
    this.onceInstant.add(sid);
    return true;
  }

  /** Consume a pending once-instant request for one agent (internal). */
  consumeOnceInstant(agent) {
    const sid = agent?.session?.id;
    return Boolean(sid && this.onceInstant.delete(sid));
  }

  setMode(invocation, mode) {
    const sid = invocation?.agent?.session?.id;
    if (!sid) return { kind: "error", text: "Compaction mode switch needs an active session." };
    this.overrides.set(sid, mode);
    return { kind: "success", text: `Compaction mode → ${mode} (this session).` };
  }

  clearMode(invocation) {
    const sid = invocation?.agent?.session?.id;
    if (!sid) return { kind: "error", text: "Compaction mode reset needs an active session." };
    this.overrides.delete(sid);
    return { kind: "success", text: `Compaction mode reset to default (${this.mode}).` };
  }

  handleCompactMode(invocation) {
    const arg = String(invocation?.rawInput ?? "").trim().toLowerCase();
    if (arg === "" || arg === "show") {
      const current = this.modeFor(invocation?.agent);
      const override = invocation?.agent?.session?.id && this.overrides.has(invocation.agent.session.id)
        ? " (session override)"
        : " (default)";
      return { kind: "success", text: `Compaction mode: ${current}${override}.` };
    }
    if (arg === "llm" || arg === "instant" || arg === "auto") return this.setMode(invocation, arg);
    if (arg === "reset" || arg === "default" || arg === "off") return this.clearMode(invocation);
    return { kind: "error", text: "Usage: /compact-mode [llm|instant|auto|show|reset]" };
  }

  /** Hot-switch commands, registered once per mount beside the built-in /compact. */
  _registerCommands() {
    const ctx = this.ctx;
    const self = this;
    if (!ctx?.commands?.register) {
      ctx?.logger?.warn(`[${name}] commands service unavailable; compaction mode is config-only`);
      return;
    }
    ctx.effect(function* () {
      yield () => {};
      yield ctx.commands.register({
        name: "compact-mode",
        description: "Select compaction method: llm | instant | auto | show | reset",
        handler: (inv) => self.handleCompactMode(inv),
      });
      yield ctx.commands.register({
        name: "compact-llm",
        description: "Use LLM summarization for compaction",
        handler: (inv) => self.setMode(inv, "llm"),
      });
      yield ctx.commands.register({
        name: "compact-instant",
        description: "Use LLM-free extractive compaction",
        handler: (inv) => self.setMode(inv, "instant"),
      });
      yield ctx.commands.register({
        name: "compact-auto",
        description: "LLM summarization first, extractive fallback on rate limits",
        handler: (inv) => self.setMode(inv, "auto"),
      });
      yield ctx.commands.register({
        name: "compact-archive",
        description: "List this session's compaction archives (full original text on disk)",
        handler: (inv) => self.handleCompactArchive(inv),
      });
    }, `${name} commands`);
  }

  /** /compact-archive — list the session's compaction archives (newest first). */
  async handleCompactArchive(invocation) {
    const sid = await this.resolveSid(invocation?.agent);
    if (!sid) return { kind: "error", text: "Compaction archive listing needs an active session." };
    const items = listCompactionArchives({ root: this.agentMemoryRoot, sid });
    if (items.length === 0) {
      return { kind: "success", text: "This session has no compaction archives yet." };
    }
    const lines = ["Compaction archives (newest first):"];
    for (const it of items) {
      lines.push(`- ${it.name}  ${Math.round(it.size / 1024)}KB  ${it.lines} lines\n  ${it.path}`);
    }
    lines.push("Read any file with the read tool to recover compacted details.");
    return { kind: "success", text: lines.join("\n") };
  }

  /**
   * sid 一致性（2026-09-13）：宿主 UUID → memory sid 正规解析（resolveMemorySid）。
   * 存档/引导/正典/证据/命令全部用同一个解析结果，保证与 memory 数据根目录一致。
   */
  async resolveSid(agent) {
    return resolveMemorySid({
      agentMemoryLib: this.agentMemoryLib,
      root: this.agentMemoryRoot,
      hostId: agent?.session?.id,
    });
  }

  /** The single customization hook from upstream: select the summarizer. */
  async summarize(input, agent, signal) {
    // 输入形状归一化（2026-09-13 修复）：宿主 buildSummarizationInput 传的是
    // `{ system?, tools?, messages: [...] }` 对象，不是裸数组。旧实现按数组解析
    // → 真实挂载后 instant 摘要为空、存档永不触发（单测传数组故未暴露）。
    const payload = Array.isArray(input) ? { messages: input } : (input ?? {});
    const messages = Array.isArray(payload.messages) ? payload.messages : [];

    const sid = await this.resolveSid(agent);
    // 键域约定（2026-09-13 契约对齐）：overrides / onceInstant 以宿主会话 id（agent.session.id）
    // 为键；解析出的 memory sid 只用于 memory 数据根下的文件路径。两域不可混用——
    // lib 接通后 sid 变为 memory sid，若用它查 overrides 会永久 miss（热切命令失效）。
    const hostId = agent?.session?.id;

    // Archive the FULL shadowed region before any summarizer runs — the
    // not-a-total-loss guarantee. Every mode gets it; a failed write never
    // blocks compaction (the summary just carries no pointer).
    let archive = null;
    if (this.archive && messages.length > 0) {
      archive = writeCompactionArchive({
        root: this.agentMemoryRoot,
        sid,
        messages,
        keep: this.archiveKeep,
      });
      if (!archive) {
        this.ctx.logger?.warn?.(`[${name}] compaction archive write failed; continuing without pointer`);
      }
    }

    const onceInstant = this.consumeOnceInstant(agent);
    const mode = resolveSummarizeMode({
      baseMode: this.mode,
      sessionOverride: hostId && this.overrides.has(hostId) ? this.overrides.get(hostId) : undefined,
      onceInstant,
    });
    if (mode === "instant") {
      return this.instantSummarize(messages, agent, archive, sid);
    }
    if (mode === "llm") {
      return this.enrichSummary(await super.summarize(input, agent, signal), sid, archive);
    }
    // auto: prefer the high-fidelity LLM summarizer, but never let a
    // rate-limited summarization call block compaction when the whole point is
    // to escape a TPM limit — degrade to extractive on that specific failure.
    try {
      const result = await super.summarize(input, agent, signal);
      return this.enrichSummary(result, sid, archive);
    } catch (err) {
      if (this.fallbackOnRateLimit && isRateLimitFailure(err)) {
        this.ctx.logger.warn(
          `[${name}] LLM summarization rate-limited (${err?.code ?? err?.status ?? err?.message}); falling back to extractive compaction`,
        );
        return this.instantSummarize(messages, agent, archive, sid);
      }
      throw err;
    }
  }

  /**
   * LLM-mode summaries otherwise lose the memory hand-off entirely: append
   * the ledger canon + "read the ledger first" guidance + archive pointer as
   * one extra text block. Bounded (~6KB) so the base engine's "summary must
   * be smaller" token guard stays comfortable for any real compaction.
   */
  async enrichSummary(result, sid, archive) {
    if (!result || !Array.isArray(result.summary)) return result;
    const amAvailable = await loadAgentMemory(this.agentMemoryLib);
    let canonical = null;
    if (sid && amAvailable) {
      try {
        canonical = await buildCanonicalFromLedger({
          agentMemoryLib: this.agentMemoryLib,
          root: this.agentMemoryRoot,
          sid,
        });
      } catch {
        canonical = null; // heuristic-free enrichment; never fatal
      }
    }
    const guidance =
      sid && this.instantAgentMemoryGuidance && amAvailable
        ? buildGuidanceSection(this.agentMemoryRoot, sid) +
          (await buildStaleHint({ agentMemoryLib: this.agentMemoryLib, root: this.agentMemoryRoot, sid }))
        : "";
    const text = buildEnrichmentText({
      canonical,
      guidance,
      archivePointer: buildArchivePointer(archive),
    });
    if (!text) return result;
    return { ...result, summary: [...result.summary, { type: "text", text }] };
  }

  /** §12.9 候选②：压缩产物含 [永久] 双行 → 写「checkpoint 双行在场=是」正向证据（专用日志，非里程碑；节流）。 */
  async recordCheckpointEvidence(hostId, text) {
    if (!hostId) return;
    const am = await loadAgentMemory(this.agentMemoryLib);
    if (!am || typeof am.recordCheckpointEvidence !== 'function') return;
    const ok = typeof text === 'string' && text.includes('始终用中文回复') && text.includes('指令先落账');
    try {
      // 契约对齐（2026-09-13）：evidence 按宿主会话记录、内部自做 hostId→sid 反解；
      // 必须传宿主会话 id（agent.session.id，接受 session-<uuid>/裸 UUID）——
      // 传 memory sid 会被 tryNormalizeHostId 静默拒收（unknown-host-id，证据停写）。
      await am.recordCheckpointEvidence(this.agentMemoryRoot, hostId, { ok });
    } catch (err) {
      this.ctx.logger?.warn?.(`[${name}] checkpoint 在场证据记录失败：${err?.code ?? err?.message}`);
    }
  }

  async instantSummarize(input, agent, archive = null, sid = null) {
    const text = await composeInstantDigest({
      messages: input,
      agent,
      config: {
        sid,
        instantBudget: this.instantBudget,
        agentMemoryRoot: this.agentMemoryRoot,
        instantAgentMemoryGuidance: this.instantAgentMemoryGuidance,
        agentMemoryLib: this.agentMemoryLib,
        archivePointer: buildArchivePointer(archive),
      },
    });
    // 候选②（§12.9）：压缩出口扫描 [永久] 双行 → 正向在场证据（缺席告警的老缺口补上正向留证）
    await this.recordCheckpointEvidence(agent?.session?.id, text);
    const target = resolveTarget(this.config, agent);
    const blocks = [{ type: "text", text }];
    return {
      summary: blocks,
      rawOutput: blocks,
      llmStreamCall: false,
      provider: target.provider,
      model: target.model,
      maxTokens: this.config.maxTokens,
    };
  }
}

export { RouterCompactionEngine as default };