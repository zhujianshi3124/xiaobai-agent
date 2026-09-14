#!/usr/bin/env node
// Behavioral tests for dsh-rate-throttle routing v3.
//
//   node test-routing.mjs
//
// Covers:
//   * auto-grouping from the harness model catalog (same-model families sync
//     with the official Models page; llm-deepseek excluded by default)
//   * the user's CURRENT selection is never swapped while healthy
//   * declared limits rank candidates (TPM desc, RPM desc); learned limits
//     rank next; context window is the no-data tiebreak
//   * RPM/quota 429 cools a key down (cooldownMs); a TPM 429 gets a SHORT
//     exile (tpmCooldownMs) + same-turn skip — next turn walks to the next
//     same-tier key; tpmCooldownMs: 0 restores turn-only skipping (test 3)
//   * a retry re-dispatch of the same turn+step (llm-retry re-enters the
//     pipeline; intermediate failures are invisible here) reroutes off the
//     key that attempt used, cascading tiers within the turn (test 13)
//   * lower-tier failover uses the measured remainder: fits → switch without
//     compaction; overflow → compact once per turn (preferring the
//     compact-router instantOnceFor seam), then re-measure
//   * failover writes the target back as session model/selection but never
//     touches the default model for future sessions
//   * a USER switch clears the target's cooldown AND turn skip; our own
//     write-back echo clears neither
//   * static groups remain the fallback when discovery fails
//   * 429 error lines carry the observed rpm/tpm snapshot and learned limits
//     are persisted

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply, canonicalModelId, classifyRateLimit } from "../lib/rate-throttle/index.js";

let failures = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
  if (!cond) failures += 1;
}

const TPM_MSG = '429: {"message":"inference exceeds tpm/rpm limit","type":"rate_limit_error","code":"429001"}';
const RPM_MSG = '429: {"message":"rpm exhausted","type":"quota_exceeded_error","code":"8"}';

function makeCtx({
  windows = {},
  providers = undefined,
  models = {},
  compaction = undefined,
  initialUsage = undefined,
} = {}) {
  const handlers = {};
  let usage = initialUsage;
  const adm = { saveSelectionCalls: [], saveSelection(sel) { this.saveSelectionCalls.push(sel); } };
  const ctx = {
    logger: { info() {}, warn() {} },
    llm: {
      async resolveModelInfo(provider, model) {
        const w = windows[`${provider}\x00${model}`];
        return w === undefined ? { context: {} } : { context: { contextWindow: w } };
      },
      listProviders: providers === undefined ? undefined : async () => providers,
      listModels: async (pid) => models[pid] ?? [],
    },
    tokenMeter: {
      measure() {
        return { totalTokens: typeof usage === "function" ? usage() : usage };
      },
    },
    setUsage(next) {
      usage = next;
    },
    get(key) {
      if (key === "compaction") return compaction;
      if (key === "agentDefaultModel") return adm;
      return undefined;
    },
    on(event, fn) {
      handlers[event] = fn;
    },
  };
  return { ctx, handlers, adm };
}

const dir = mkdtempSync(join(tmpdir(), "dsh-rate-throttle-test-"));
const hotPath = join(dir, "dsh-rate-throttle.json");
const learnedPath = join(dir, "learned.json");
const logPath = join(dir, "llm-requests.jsonl");

// Declared limits used by most scenarios (the values researched from vendor
// pages; sources are recorded in the deployed hot config, not needed here).
writeFileSync(
  hotPath,
  JSON.stringify({
    declaredLimits: {
      "sensenova-gateway": { tpm: 128000, rpm: 60 },
      "sensenova-gateway-2": { tpm: 128000, rpm: 60 },
      nvidia: { rpm: 40 },
      "modelscope-gateway": { rpm: 20 },
    },
  }),
);

function baseConfig(overrides = {}) {
  return {
    enabled: false,
    logPath,
    routing: {
      enabled: true,
      cooldownMs: 300000,
      hotConfigPath: hotPath,
      learnedPath,
      ...overrides,
    },
  };
}

const AGENT = () => ({ session: { id: "sess-1" } });

async function req(handlers, agent, turn, step, orig) {
  return handlers["agent/request"](
    { agent, turn, step, signal: { aborted: false } },
    async () => orig,
  );
}

async function err(handlers, agent, turn, step, provider, message, code = "RATE_LIMIT") {
  await handlers["agent/request-error"](
    {
      agent,
      turn,
      step,
      provider,
      failure: { code, status: 429, message },
    },
    async () => undefined,
  );
}

// ---- unit: model family normalization ----
check(
  "canonical: three vendor spellings of v4-pro collapse",
  canonicalModelId("deepseek-v4-pro") === canonicalModelId("deepseek-ai/deepseek-v4-pro-0813") &&
    canonicalModelId("deepseek-ai/DeepSeek-V4-Pro-0813") === "v4-pro",
);
check(
  "canonical: v4-flash variants collapse (incl. -free)",
  canonicalModelId("DeepSeek-V4-Flash") === "v4-flash" &&
    canonicalModelId("deepseek-v4-flash-0731") === "v4-flash" &&
    canonicalModelId("deepseek-v4-flash-free") === "v4-flash",
);
check(
  "canonical: official deepseek-flash stays distinct from v4-flash",
  canonicalModelId("deepseek-flash") !== canonicalModelId("deepseek-v4-flash"),
);
check("canonical: kimi-k3 stable", canonicalModelId("moonshotai/kimi-k3") === "kimi-k3");

// ---- unit: failure classification ----
check("classify: 商汤 tpm/rpm message -> tpm", classifyRateLimit({ message: TPM_MSG }) === "tpm");
check("classify: rpm message -> rpm", classifyRateLimit({ message: RPM_MSG }) === "rpm");
check(
  "classify: AMD token_rate_limit_exceeded is REQUEST-rate (narrow \\btpm\\b)",
  classifyRateLimit({ message: "429: token_rate_limit_exceeded" }) === "rpm",
);
check("classify: QUOTA code -> rpm", classifyRateLimit({ code: "QUOTA" }) === "rpm");

// ---- shared auto-discovery fixture ----
const PROVIDERS = ["sensenova-gateway", "sensenova-gateway-2", "nvidia", "modelscope-gateway", "llm-deepseek"];
const MODELS = {
  "sensenova-gateway": [{ id: "deepseek-v4-pro" }, { id: "deepseek-v4-flash" }],
  "sensenova-gateway-2": [{ id: "deepseek-v4-pro" }, { id: "deepseek-v4-flash" }],
  nvidia: [{ id: "deepseek-ai/deepseek-v4-pro-0813" }],
  "modelscope-gateway": [{ id: "deepseek-ai/DeepSeek-V4-Pro-0813" }],
  "llm-deepseek": [{ id: "deepseek-v4-pro" }],
};
const WINDOWS = {
  "sensenova-gateway\x00deepseek-v4-pro": 1048576,
  "sensenova-gateway-2\x00deepseek-v4-pro": 1048576,
  "nvidia\x00deepseek-ai/deepseek-v4-pro-0813": 262144,
  "modelscope-gateway\x00deepseek-ai/DeepSeek-V4-Pro-0813": 262144,
  "llm-deepseek\x00deepseek-v4-pro": 1000000,
};

// ---- 1) sticky current selection + official exclusion ----
{
  const { ctx, handlers } = makeCtx({ providers: PROVIDERS, models: MODELS, windows: WINDOWS });
  apply(ctx, baseConfig());
  const out = await req(handlers, AGENT(), 1, 1, { provider: "sensenova-gateway", model: "deepseek-v4-pro" });
  check("1a healthy selection is never swapped", out.provider === "sensenova-gateway");
  const out2 = await req(handlers, AGENT(), 1, 2, { provider: "llm-deepseek", model: "deepseek-v4-pro" });
  check("1b healthy official selection stays (sticky)", out2.provider === "llm-deepseek");
  // Official is never a failover TARGET — but a failing official session may
  // route AWAY to free providers (free-first; costs no official quota).
  await err(handlers, AGENT(), 1, 3, "llm-deepseek", RPM_MSG);
  const out3 = await req(handlers, AGENT(), 1, 4, { provider: "llm-deepseek", model: "deepseek-v4-pro" });
  check(
    "1c failing official routes away to free providers, never into official",
    out3.provider === "sensenova-gateway",
    `got ${out3.provider}`,
  );
}

// ---- 2) RPM cooldown + declared-limit ranking ----
{
  const { ctx, handlers } = makeCtx({ providers: PROVIDERS, models: MODELS, windows: WINDOWS, initialUsage: 300000 });
  apply(ctx, baseConfig());
  await err(handlers, AGENT(), 1, 1, "sensenova-gateway", RPM_MSG);
  await err(handlers, AGENT(), 1, 2, "sensenova-gateway-2", RPM_MSG);
  // Both sensenova keys cooling; remainder 300000 does NOT fit 256K targets
  // without compaction, and no compaction config in this block → stay put.
  const out = await req(handlers, AGENT(), 1, 3, { provider: "sensenova-gateway", model: "deepseek-v4-pro" });
  check("2a all 1M keys cooling + remainder too big -> stay put", out.provider === "sensenova-gateway");
  // Remainder now fits a 256K target → ranked by declared rpm: nvidia(40) > modelscope(20).
  ctx.setUsage(20000);
  const out2 = await req(handlers, AGENT(), 1, 4, { provider: "sensenova-gateway", model: "deepseek-v4-pro" });
  check(
    "2b fits-lower-tier downgrade ranks by declared rpm",
    out2.provider === "nvidia",
    `got ${out2.provider}/${out2.model}`,
  );
}

// ---- 3) TPM legacy mode (tpmCooldownMs: 0): same-turn skip, next-turn recovery ----
{
  const { ctx, handlers } = makeCtx({ providers: PROVIDERS, models: MODELS, windows: WINDOWS, initialUsage: 20000 });
  apply(ctx, baseConfig({ tpmCooldownMs: 0 }));
  await err(handlers, AGENT(), 7, 1, "sensenova-gateway", TPM_MSG);
  const out = await req(handlers, AGENT(), 7, 2, { provider: "sensenova-gateway", model: "deepseek-v4-pro" });
  check("3a tpm 429 skips the key for the same turn", out.provider === "sensenova-gateway-2");
  await err(handlers, AGENT(), 7, 3, "sensenova-gateway-2", TPM_MSG);
  const out2 = await req(handlers, AGENT(), 7, 4, { provider: "sensenova-gateway-2", model: "deepseek-v4-pro" });
  check(
    "3b second tpm skip walks to the next candidate (fits 256K)",
    out2.provider === "nvidia",
    `got ${out2.provider}`,
  );
  // Next turn: skipped keys are ELIGIBLE again (no cooldown), but per the
  // no-return-to-primary decision the router STAYS on its healthy target.
  const out3 = await req(handlers, AGENT(), 8, 1, { provider: "nvidia", model: "deepseek-ai/deepseek-v4-pro-0813" });
  check("3c next turn stays on the healthy routed target", out3.provider === "nvidia");
  // Recovery proof: once THAT target 429s (tpm), the recovered sensenova key
  // (highest declared tpm) takes over immediately.
  await err(handlers, AGENT(), 8, 2, "nvidia", TPM_MSG);
  const out4 = await req(handlers, AGENT(), 8, 3, { provider: "nvidia", model: "deepseek-ai/deepseek-v4-pro-0813" });
  check(
    "3d recovered keys rank first once the current target fails",
    out4.provider === "sensenova-gateway",
    `got ${out4.provider}`,
  );
}

// ---- 4) downgrade compaction: only on overflow, once per turn, seam-aware ----
{
  let compactCalls = 0;
  let instantOnceCalls = 0;
  const compaction = {
    instantOnceFor() {
      instantOnceCalls += 1;
      return true;
    },
    async compactIfNeeded() {
      compactCalls += 1;
      return {};
    },
  };
  const { ctx, handlers } = makeCtx({
    providers: PROVIDERS,
    models: MODELS,
    windows: WINDOWS,
    compaction,
    initialUsage: 300000, // overflows 256K*0.9
  });
  apply(ctx, baseConfig());
  await err(handlers, AGENT(), 11, 1, "sensenova-gateway", RPM_MSG);
  await err(handlers, AGENT(), 11, 2, "sensenova-gateway-2", RPM_MSG);
  ctx.setUsage(() => (compactCalls > 0 ? 20000 : 300000));
  const out = await req(handlers, AGENT(), 11, 3, { provider: "sensenova-gateway", model: "deepseek-v4-pro" });
  check("4a overflow triggers exactly one downgrade compaction", compactCalls === 1, `calls=${compactCalls}`);
  check("4a' compact-router instantOnce seam was armed", instantOnceCalls === 1);
  check(
    "4b post-compaction downgrade picks the highest-rpm candidate",
    out.provider === "nvidia",
    `got ${out.provider}`,
  );
  // Same turn again: budget spent → no second compaction; modelscope is next.
  await err(handlers, AGENT(), 11, 4, "nvidia", RPM_MSG);
  const out2 = await req(handlers, AGENT(), 11, 5, { provider: "nvidia", model: "deepseek-ai/deepseek-v4-pro-0813" });
  check("4c compaction budget is once per turn", compactCalls === 1, `calls=${compactCalls}`);
  check("4d still fails over within the turn (modelscope)", out2.provider === "modelscope-gateway", `got ${out2.provider}`);
}

// ---- 5) stock engine without the seam still compacts ----
{
  let compactCalls = 0;
  const compaction = {
    async compactIfNeeded() {
      compactCalls += 1;
      return {};
    },
  };
  const { ctx, handlers } = makeCtx({
    providers: PROVIDERS,
    models: MODELS,
    windows: WINDOWS,
    compaction,
    initialUsage: 300000,
  });
  apply(ctx, baseConfig());
  await err(handlers, AGENT(), 3, 1, "sensenova-gateway", RPM_MSG);
  await err(handlers, AGENT(), 3, 2, "sensenova-gateway-2", RPM_MSG);
  ctx.setUsage(() => (compactCalls > 0 ? 20000 : 300000));
  const out = await req(handlers, AGENT(), 3, 3, { provider: "sensenova-gateway", model: "deepseek-v4-pro" });
  check("5a stock compaction engine works without instantOnceFor", compactCalls === 1 && out.provider === "nvidia");
}

// ---- 6) no compaction when the remainder already fits ----
{
  let compactCalls = 0;
  const compaction = {
    async compactIfNeeded() {
      compactCalls += 1;
      return {};
    },
  };
  const { ctx, handlers } = makeCtx({
    providers: PROVIDERS,
    models: MODELS,
    windows: WINDOWS,
    compaction,
    initialUsage: 20000,
  });
  apply(ctx, baseConfig());
  await err(handlers, AGENT(), 5, 1, "sensenova-gateway", RPM_MSG);
  await err(handlers, AGENT(), 5, 2, "sensenova-gateway-2", RPM_MSG);
  const out = await req(handlers, AGENT(), 5, 3, { provider: "sensenova-gateway", model: "deepseek-v4-pro" });
  check("6a fitting remainder downgrades with zero compactions", compactCalls === 0 && out.provider === "nvidia");
}

// ---- 7) write-back syncs the session, never the default model ----
{
  const { ctx, handlers, adm } = makeCtx({ providers: PROVIDERS, models: MODELS, windows: WINDOWS, initialUsage: 20000 });
  const appended = [];
  const agent = { session: { id: "sess-1", append(type, data) { appended.push({ type, data }); } } };
  apply(ctx, baseConfig());
  await err(handlers, agent, 1, 1, "sensenova-gateway", RPM_MSG);
  await err(handlers, agent, 1, 2, "sensenova-gateway-2", RPM_MSG);
  await req(handlers, agent, 1, 3, { provider: "sensenova-gateway", model: "deepseek-v4-pro" });
  check(
    "7a failover wrote model/selection back to the session",
    appended.some((a) => a.type === "model/selection" && a.data.provider === "nvidia"),
  );
  check("7b default model for future sessions untouched", adm.saveSelectionCalls.length === 0);
}

// ---- 8) user switch clears cooldown AND tpm skip; write-back echo does not ----
{
  const { ctx, handlers } = makeCtx({ providers: PROVIDERS, models: MODELS, windows: WINDOWS, initialUsage: 20000 });
  apply(ctx, baseConfig());
  await err(handlers, AGENT(), 2, 1, "sensenova-gateway", TPM_MSG);
  await err(handlers, AGENT(), 2, 2, "sensenova-gateway-2", TPM_MSG);
  const out = await req(handlers, AGENT(), 2, 3, { provider: "sensenova-gateway", model: "deepseek-v4-pro" });
  check("8a both sensenova keys skipped this turn", out.provider === "nvidia");
  // USER explicitly re-selects sensenova-gateway → clears skip + cooldown.
  handlers["session/event"]({ id: "sess-1" }, { type: "model/selection", data: { provider: "sensenova-gateway", model: "deepseek-v4-pro" } });
  const out2 = await req(handlers, AGENT(), 2, 4, { provider: "sensenova-gateway", model: "deepseek-v4-pro" });
  check("8b user switch overrides the turn skip immediately", out2.provider === "sensenova-gateway");

  // RPM cooldown + echo: fail main, echo our own write-back of the TARGET —
  // the echo must NOT clear the MAIN key's cooldown.
  const ctx2wrap = makeCtx({ providers: PROVIDERS, models: MODELS, windows: WINDOWS, initialUsage: 20000 });
  apply(ctx2wrap.ctx, baseConfig());
  await err(ctx2wrap.handlers, AGENT(), 4, 1, "sensenova-gateway", RPM_MSG);
  await req(ctx2wrap.handlers, AGENT(), 4, 2, { provider: "sensenova-gateway", model: "deepseek-v4-pro" }); // failover → sensenova-2
  ctx2wrap.handlers["session/event"](
    { id: "sess-1" },
    { type: "model/selection", data: { provider: "sensenova-gateway-2", model: "deepseek-v4-pro" } },
  );
  const out3 = await req(ctx2wrap.handlers, AGENT(), 4, 3, { provider: "sensenova-gateway", model: "deepseek-v4-pro" });
  check("8c router write-back echo keeps the failed key cooling", out3.provider === "sensenova-gateway-2", `got ${out3.provider}`);
}

// ---- 9) static groups remain the fallback when discovery fails ----
{
  const { ctx, handlers } = makeCtx({
    providers: undefined, // listProviders unavailable
    models: {},
    windows: {
      "sensenova-gateway\x00deepseek-v4-pro": 1048576,
      "nvidia\x00deepseek-ai/deepseek-v4-pro-0813": 262144,
    },
    initialUsage: 20000,
  });
  apply(
    ctx,
    baseConfig({
      staticGroups: [
        {
          id: "v4-pro",
          providers: [
            { provider: "sensenova-gateway", model: "deepseek-v4-pro" },
            { provider: "nvidia", model: "deepseek-ai/deepseek-v4-pro-0813" },
          ],
        },
      ],
    }),
  );
  await err(handlers, AGENT(), 1, 1, "sensenova-gateway", RPM_MSG);
  const out = await req(handlers, AGENT(), 1, 2, { provider: "sensenova-gateway", model: "deepseek-v4-pro" });
  check("9a discovery failure falls back to static groups", out.provider === "nvidia", `got ${out.provider}/${out.model}`);
}

// ---- 10) learned limits + observed snapshot land in the log ----
{
  rmSync(learnedPath, { force: true });
  const { ctx, handlers } = makeCtx({ providers: PROVIDERS, models: MODELS, windows: WINDOWS, initialUsage: 0 });
  apply(ctx, baseConfig());
  // Traffic first so the snapshot has data, then a 429.
  await req(handlers, AGENT(), 1, 1, { provider: "sensenova-gateway", model: "deepseek-v4-pro" });
  handlers["session/event"]({ id: "sess-1" }, { type: "assistant/message", data: { usage: { totalTokens: 90000 }, message: { source: { provider: "sensenova-gateway" } } } });
  await err(handlers, AGENT(), 1, 2, "sensenova-gateway", TPM_MSG);
  let learnedOk = false;
  try {
    const l = JSON.parse(readFileSync(learnedPath, "utf8"));
    learnedOk = l.providers["sensenova-gateway"]?.tpm?.samples >= 1;
  } catch {}
  check("10a learned limits persisted after a 429", learnedOk);
  const lines = readFileSync(logPath, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const rl = lines.filter((l) => l.event === "rate-limit").pop();
  check(
    "10b rate-limit line carries kind + observed rpm/tpm snapshot",
    rl && rl.kind === "tpm" && rl.observed && typeof rl.observed.tpm === "number" && typeof rl.observed.rpm === "number",
    JSON.stringify(rl?.observed),
  );
}

// ---- 11) unmeasurable remainder never downgrades blind ----
{
  let compactCalls = 0;
  const compaction = { async compactIfNeeded() { compactCalls += 1; return {}; } };
  const { ctx, handlers } = makeCtx({
    providers: PROVIDERS,
    models: MODELS,
    windows: WINDOWS,
    compaction,
  });
  ctx.tokenMeter.measure = () => {
    throw new Error("no meter");
  };
  apply(ctx, baseConfig());
  await err(handlers, AGENT(), 1, 1, "sensenova-gateway", RPM_MSG);
  await err(handlers, AGENT(), 1, 2, "sensenova-gateway-2", RPM_MSG);
  const out = await req(handlers, AGENT(), 1, 3, { provider: "sensenova-gateway", model: "deepseek-v4-pro" });
  check("11a unmeasurable session stays on its tier (no blind downgrade)", compactCalls === 0 && out.provider === "sensenova-gateway");
}

// ---- 12) TPM short exile (deployed default): a saturated key is not sticky next turn ----
{
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const { ctx, handlers } = makeCtx({ providers: PROVIDERS, models: MODELS, windows: WINDOWS, initialUsage: 20000 });
  apply(ctx, baseConfig({ tpmCooldownMs: 60 }));
  // A TPM 429 usually ends the turn, so the same-turn skip expires unused.
  // The short exile must carry over: the NEXT turn's request must NOT stick
  // back to the saturated primary — it walks to the next same-tier key.
  await err(handlers, AGENT(), 20, 1, "sensenova-gateway", TPM_MSG);
  const a = await req(handlers, AGENT(), 21, 1, { provider: "sensenova-gateway", model: "deepseek-v4-pro" });
  check(
    "12a tpm-cooled primary is not sticky next turn -> same-tier backup",
    a.provider === "sensenova-gateway-2",
    `got ${a.provider}`,
  );
  // Once the exile expires the primary is eligible again, but the router
  // stays on its healthy routed target until THAT one fails.
  await sleep(120);
  const b = await req(handlers, AGENT(), 22, 1, { provider: "sensenova-gateway-2", model: "deepseek-v4-pro" });
  check(
    "12b expired exile makes the primary eligible; healthy target stays",
    b.provider === "sensenova-gateway-2",
    `got ${b.provider}`,
  );
  // When the backup hits TPM too, the recovered primary takes over.
  await err(handlers, AGENT(), 22, 2, "sensenova-gateway-2", TPM_MSG);
  const c = await req(handlers, AGENT(), 22, 3, { provider: "sensenova-gateway-2", model: "deepseek-v4-pro" });
  check(
    "12c backup tpm-failure hands over to the recovered primary",
    c.provider === "sensenova-gateway",
    `got ${c.provider}`,
  );
  // A USER switch clears the exile immediately (explicit intent wins).
  const ctx2 = makeCtx({ providers: PROVIDERS, models: MODELS, windows: WINDOWS, initialUsage: 20000 });
  apply(ctx2.ctx, baseConfig({ tpmCooldownMs: 60000 }));
  await err(ctx2.handlers, AGENT(), 30, 1, "sensenova-gateway", TPM_MSG);
  const d = await req(ctx2.handlers, AGENT(), 31, 1, { provider: "sensenova-gateway", model: "deepseek-v4-pro" });
  check("12d cooled primary is not sticky (setup for the user switch)", d.provider === "sensenova-gateway-2", `got ${d.provider}`);
  ctx2.handlers["session/event"](
    { id: "sess-1" },
    { type: "model/selection", data: { provider: "sensenova-gateway", model: "deepseek-v4-pro" } },
  );
  const e2 = await req(ctx2.handlers, AGENT(), 31, 2, { provider: "sensenova-gateway", model: "deepseek-v4-pro" });
  check("12e user switch clears the tpm exile immediately", e2.provider === "sensenova-gateway", `got ${e2.provider}`);
}

// ---- 13) retry re-dispatch of the same turn+step reroutes off the failed key ----
{
  const { ctx, handlers } = makeCtx({ providers: PROVIDERS, models: MODELS, windows: WINDOWS, initialUsage: 20000 });
  apply(ctx, baseConfig());
  const agent = AGENT();
  // llm-retry re-dispatches a failed attempt through the full pipeline while
  // short-circuiting the error chain (intermediate failures never reach this
  // plugin). A repeat dispatch of the same turn+step is therefore the retry.
  const a1 = await req(handlers, agent, 40, 3, { provider: "sensenova-gateway", model: "deepseek-v4-pro" });
  check("13a first dispatch sticks to the selection", a1.provider === "sensenova-gateway");
  const a2 = await req(handlers, agent, 40, 3, { provider: "sensenova-gateway", model: "deepseek-v4-pro" });
  check(
    "13b retry (same turn+step) reroutes to the next same-tier key",
    a2.provider === "sensenova-gateway-2",
    `got ${a2.provider}`,
  );
  const a3 = await req(handlers, agent, 40, 3, { provider: "sensenova-gateway-2", model: "deepseek-v4-pro" });
  check("13c second failed attempt cascades to the next tier", a3.provider === "nvidia", `got ${a3.provider}`);
  // Later steps of the SAME turn stay off the failed keys (turn-scoped skip).
  const a4 = await req(handlers, agent, 40, 4, { provider: "sensenova-gateway-2", model: "deepseek-v4-pro" });
  check("13d later steps of the turn keep avoiding the skipped keys", a4.provider === "nvidia", `got ${a4.provider}`);
  // A new turn resets the step skips entirely — the user's selection is sticky again.
  const a5 = await req(handlers, agent, 41, 1, { provider: "sensenova-gateway", model: "deepseek-v4-pro" });
  check("13e new turn resets the skips (selection sticky again)", a5.provider === "sensenova-gateway", `got ${a5.provider}`);
}

console.log(failures === 0 ? "\nAll routing checks passed." : `\n${failures} check(s) FAILED.`);
process.exitCode = failures === 0 ? 0 : 1;
