// dsh-rate-throttle (v3)
//
// Host plugin that:
//   1. (throttle) limits outgoing LLM requests per provider BEFORE dispatch,
//      via the `agent/request` waterfall. Kept disabled by default so it adds
//      ~0 latency; cooldown/failover/compaction/logging do the real work.
//   2. (routing v3) routes a same-model request across equivalent
//      (provider, model) accounts:
//        * GROUPS ARE AUTO-DISCOVERED from the harness's own model catalog
//          (`ctx.llm.listProviders()` + `listModels()`), so every provider and
//          model configured on the official Models page is covered and stays
//          in sync without touching this plugin's config. Members whose model
//          ids normalize to the same family (deepseek-v4-pro /
//          deepseek-ai/deepseek-v4-pro-0813 / DeepSeek-V4-Pro-0813 → "v4-pro")
//          form one group — a failover therefore ALWAYS keeps the same model.
//          Unrecognized pairings are left ungrouped and logged, never guessed
//          silently. `routing.staticGroups` still works as an override and as
//          the fallback when discovery fails.
//        * the user's CURRENT selection is the strongest anchor — while it is
//          healthy it is NEVER swapped, so failover happens only after an
//          error;
//        * among eligible targets the router prefers the vendor with the
//          HIGHEST known rate limits: declared limits (from the hot config
//          file, with source + date) beat learned limits (max observed
//          rpm/tpm before a 429) beat no data; inside one data class: TPM
//          desc, then RPM desc, then context window desc, then declared
//          order. When nothing is known, the larger context window wins —
//          and the context tier itself stays a HARD safety filter (1M never
//          steps down to 256K unless the measured remainder fits);
//        * cooldowns are per failure kind: RPM/quota 429 cools the key down
//          (cooldownMs); a TPM 429 gets a SHORT exile (tpmCooldownMs, default
//          45s — TPM windows self-heal in about a minute, so the full RPM
//          cooldown would be wasted) plus the same-turn skip, so the NEXT turn
//          lands on the next same-tier key instead of re-hitting the saturated
//          one; set tpmCooldownMs: 0 to restore turn-only skipping;
//        * retry rerouting: llm-retry's retries re-enter the request pipeline,
//          but its short-circuit on the error chain keeps intermediate failures
//          invisible here. A repeat dispatch of the same turn+step is therefore
//          treated as a retry of a failed attempt: the key that attempt used is
//          turn-skipped so the retry lands on the next healthy candidate
//          (whose vendor minute window is empty) instead of re-hitting the
//          saturated one until the step's retry budget burns out;
//        * downgrade compaction: only when a lower-tier target is wanted and
//          the measured session remainder would NOT fit it, the router
//          compacts once per turn — preferring the compact-router engine's
//          LLM-free instant mode via its `instantOnceFor()` seam when that
//          engine is mounted (stock engines are used as-is);
//        * on failover the router writes the actual target back as the
//          session's `model/selection` so the front-end stays in sync, but it
//          does NOT touch the default model for future sessions — the default
//          only changes when the USER switches.
//   3. Logs requests, errors (with the observed rpm/tpm snapshot at the
//      moment of a 429), downgrade compactions, and a periodic per-provider
//      `provider-metrics` line; it also maintains a learned-limits file so
//      vendor limits can be approximated over time (see analyze-429.mjs).
//
// It never "owns" a failure on `agent/request-error` — it always calls next()
// so the official dsh-llm-retry plugin keeps doing the actual retries.
//
// No runtime dependencies: only node built-ins are used.

import { appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const name = "rate-throttle";
export const inject = ["llm", "tokenMeter"];

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}

function defaultLogPath() {
  return join(dshHome(), "logs", "llm-requests.jsonl");
}

function defaultHotConfigPath() {
  return join(dshHome(), "dsh-rate-throttle.json");
}

function defaultLearnedPath() {
  return join(dshHome(), "dsh-rate-throttle-learned.json");
}

function cancellableDelay(ms, signal) {
  if (ms <= 0) return Promise.resolve(true);
  if (signal && signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener?.("abort", onAbort);
      resolve(true);
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      resolve(false);
    }
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

function nowIso() {
  return new Date().toISOString();
}

function posNum(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function isRateLimitFailure(failure) {
  if (!failure) return false;
  if (failure.status === 429) return true;
  if (failure.code === "RATE_LIMIT" || failure.code === "QUOTA") return true;
  const text = String(failure.message ?? "");
  return /rpm|tpm|rate.?limit|quota/i.test(text);
}

/**
 * Classify a rate-limit failure for cooldown policy. TPM wins when the
 * message names it (e.g. 商汤's "inference exceeds tpm/rpm limit" is the
 * token-size case); everything else RPM/quota-ish cools the key down.
 * Note: some vendors use misleading names — AMD's `token_rate_limit_exceeded`
 * is a REQUEST-rate error — so matching is deliberately narrow on /\btpm\b/.
 */
export function classifyRateLimit(failure) {
  const text = String(failure?.message ?? "");
  if (/\btpm\b/i.test(text)) return "tpm";
  return "rpm";
}

/**
 * Normalize a vendor model id to its family key so equivalent models group
 * together: "deepseek-ai/deepseek-v4-pro-0813", "DeepSeek-V4-Pro" and
 * "deepseek-v4-pro" all become "v4-pro". Conservative by design — only
 * namespaces, separators, date build suffixes (-0813) and the free/latest
 * markers are stripped; anything else stays distinct. A raw-id → family
 * alias table in the hot config can override individual ids.
 */
export function canonicalModelId(raw) {
  let s = String(raw ?? "").trim().toLowerCase();
  if (!s) return "";
  s = s.split("/").pop() ?? s;
  s = s.replace(/[\s_.]+/g, "-");
  s = s.replace(/-(?:\d{4}|free|latest|stable)$/, "");
  s = s.replace(/^deepseek-?/, "");
  return s.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}

export function apply(ctx, config = {}) {
  const routingCfg = config.routing || {};
  // TPM short exile: 0 legitimately disables it, so parse without posNum().
  const tpmCooldownMsCfg = (() => {
    const n = Number(routingCfg.tpmCooldownMs);
    return Number.isFinite(n) && n >= 0 ? n : 45000;
  })();
  const cfg = {
    enabled: config.enabled !== false,
    throttleProviders: Array.isArray(config.throttleProviders) ? config.throttleProviders : [],
    minIntervalMs: Number(config.minIntervalMs ?? 20000),
    maxRequestsPerMinute: Number(config.maxRequestsPerMinute ?? 3),
    adaptive: config.adaptive !== false,
    maxIntervalMs: Number(config.maxIntervalMs ?? 120000),
    backoffFactor: Number(config.backoffFactor ?? 2),
    logProviders: Array.isArray(config.logProviders) ? config.logProviders : [],
    logPath: config.logPath || defaultLogPath(),
    routing: {
      enabled: routingCfg.enabled !== false,
      autoGroups: routingCfg.autoGroups !== false,
      autoGroupTtlMs: posNum(routingCfg.autoGroupTtlMs, 300000),
      staticGroups: Array.isArray(routingCfg.staticGroups) ? routingCfg.staticGroups : [],
      excludeProviders: Array.isArray(routingCfg.excludeProviders)
        ? routingCfg.excludeProviders
        : ["llm-deepseek", "deepseek-official"],
      cooldownMs: posNum(routingCfg.cooldownMs, 300000),
      tpmTurnSkip: routingCfg.tpmTurnSkip !== false,
      tpmCooldownMs: tpmCooldownMsCfg,
      downgradeContextMargin: posNum(routingCfg.downgradeContextMargin, 0.9),
      maxDowngradeCompactsPerTurn: Number(routingCfg.maxDowngradeCompactsPerTurn ?? 1),
      metricsWindowMs: posNum(routingCfg.metricsWindowMs, 600000),
      metricsLogIntervalMs: posNum(routingCfg.metricsLogIntervalMs, 60000),
      clearCooldownOnUserSwitch: routingCfg.clearCooldownOnUserSwitch !== false,
      syncSelectionOnFailover: routingCfg.syncSelectionOnFailover !== false,
      hotConfigPath: routingCfg.hotConfigPath || defaultHotConfigPath(),
      learnedPath: routingCfg.learnedPath || defaultLearnedPath(),
    },
  };

  const shouldThrottle = (provider) =>
    !provider || cfg.throttleProviders.length === 0 || cfg.throttleProviders.includes(provider);

  const shouldLog = (provider) =>
    !provider || cfg.logProviders.length === 0 || cfg.logProviders.includes(provider);

  function logLine(record) {
    const line = JSON.stringify(record);
    try {
      if (cfg.logPath && cfg.logPath !== "none") {
        mkdirSync(dirname(cfg.logPath), { recursive: true });
        appendFileSync(cfg.logPath, line + "\n");
      }
    } catch (err) {
      try {
        ctx.logger.warn(`[${name}] append log failed: ${String(err?.message ?? err)}`);
      } catch {
        // logger may be unavailable — the file write is best-effort anyway.
      }
    }
    try {
      ctx.logger.info(`[${name}] ${line}`);
    } catch {
      // console logger is not load-bearing.
    }
  }

  // ---- throttling state (per provider = per API key/account) ----
  const state = new Map();
  const chains = new Map();

  function initThrottleState() {
    return { lastAt: 0, intervalMs: cfg.minIntervalMs, window: [], lastErrorAt: 0 };
  }

  async function throttle(provider, signal) {
    if (!cfg.enabled || !provider || !shouldThrottle(provider)) return 0;

    const prev = chains.get(provider) ?? Promise.resolve();
    const run = prev.then(async () => {
      const s = state.get(provider) ?? initThrottleState();
      state.set(provider, s);

      const now = Date.now();

      if (cfg.adaptive && s.lastErrorAt > 0 && now - s.lastErrorAt > 5 * 60 * 1000) {
        s.intervalMs = Math.max(cfg.minIntervalMs, s.intervalMs / cfg.backoffFactor);
      }

      s.window = s.window.filter((t) => now - t < 60_000);
      let wait = 0;

      if (cfg.maxRequestsPerMinute > 0 && s.window.length >= cfg.maxRequestsPerMinute) {
        wait = Math.max(wait, s.window[0] + 60_000 - now);
      }

      const sinceLast = now - s.lastAt;
      if (sinceLast < s.intervalMs) {
        wait = Math.max(wait, s.intervalMs - sinceLast);
      }

      let waited = 0;
      if (wait > 0) {
        const ok = await cancellableDelay(wait, signal);
        if (!ok) return 0;
        waited = wait;
      }

      const t = Date.now();
      s.lastAt = t;
      s.window = s.window.filter((x) => t - x < 60_000);
      s.window.push(t);
      return waited;
    });

    chains.set(
      provider,
      run.then(
        () => {},
        () => {},
      ),
    );
    return run;
  }

  function throttleNoteError(provider) {
    if (!cfg.adaptive || !provider || !shouldThrottle(provider)) return;
    const s = state.get(provider) ?? initThrottleState();
    state.set(provider, s);
    s.lastErrorAt = Date.now();
    s.intervalMs = Math.min(
      cfg.maxIntervalMs,
      Math.max(cfg.minIntervalMs, s.intervalMs * cfg.backoffFactor),
    );
  }

  // ---- routing state ----
  const routeState = new Map(); // provider -> { consecutiveErrors, lastErrorAt } (RPM cooldown)
  const tpmSkip = new Map(); // `${sessionId}\x00${provider}` -> turn (skip for that turn)
  const tpmCooldown = new Map(); // provider -> ms timestamp: short TPM 429 exile (recovers automatically)
  const stepDispatches = new Map(); // sessionId -> Map(`${turn}x${step}` -> last dispatched provider)
  const dispatchTurn = new Map(); // sessionId -> last seen turn (step entries reset per turn)
  const downgradeCompacts = new Map(); // sessionId -> { turn, count }
  const routerSelect = new Map(); // sessionId -> "provider\x00model" (our write-back marker, consumed by its echo)
  const routerRouted = new Map(); // sessionId -> "provider\x00model" (the ROUTER's last target; user switches clear it)
  const contextCache = new Map(); // "provider\x00model" -> number | undefined
  let lastMetricsLog = 0;

  // ---- capacity metrics (rolling window, no external deps) ----
  const metrics = new Map(); // provider -> { req: number[], tok: [ts, tokens][], err: number[] }

  function candidateKey(provider, model) {
    return `${provider}\x00${model}`;
  }

  async function getContextWindow(provider, model) {
    const key = candidateKey(provider, model);
    if (contextCache.has(key)) return contextCache.get(key);
    let value;
    try {
      const info = await ctx.llm.resolveModelInfo(provider, model);
      value = info?.context?.contextWindow;
    } catch {
      value = undefined;
    }
    contextCache.set(key, value);
    return value;
  }

  function metric(provider) {
    let m = metrics.get(provider);
    if (m === undefined) {
      m = { req: [], tok: [], err: [] };
      metrics.set(provider, m);
    }
    return m;
  }

  function pruneMetrics(now) {
    const win = cfg.routing.metricsWindowMs;
    for (const m of metrics.values()) {
      m.req = m.req.filter((t) => now - t < win);
      m.tok = m.tok.filter((tuple) => now - tuple[0] < win);
      m.err = m.err.filter((t) => now - t < win);
    }
  }

  function recordRequest(provider) {
    if (!provider) return;
    metric(provider).req.push(Date.now());
  }

  function recordTokens(provider, tokens) {
    if (!provider || !(tokens > 0)) return;
    metric(provider).tok.push([Date.now(), tokens]);
  }

  function recordError(provider) {
    if (!provider) return;
    metric(provider).err.push(Date.now());
  }

  /** Observed throughput of one provider over the metrics window. */
  function observedSnapshot(provider, now = Date.now()) {
    const m = metrics.get(provider);
    pruneMetrics(now);
    if (m === undefined) return { requests: 0, tokens: 0, rpm: 0, tpm: 0 };
    const winMin = cfg.routing.metricsWindowMs / 60000;
    let tokens = 0;
    for (const tuple of m.tok) tokens += tuple[1];
    const requests = m.req.length;
    return {
      requests,
      tokens,
      rpm: +(requests / winMin).toFixed(2),
      tpm: +(tokens / winMin).toFixed(0),
    };
  }

  function maybeEmitMetrics(now) {
    const interval = cfg.routing.metricsLogIntervalMs;
    if (interval <= 0 || now - lastMetricsLog < interval) return;
    lastMetricsLog = now;
    pruneMetrics(now);
    const rows = [];
    const winMs = cfg.routing.metricsWindowMs;
    const winMin = winMs / 60000;
    for (const provider of metrics.keys()) {
      const m = metrics.get(provider);
      let tokens = 0;
      for (const tuple of m.tok) tokens += tuple[1];
      const requests = m.req.length;
      const errors = m.err.length;
      if (tokens === 0 && requests === 0 && errors === 0) continue;
      rows.push({
        provider,
        requests,
        tokens,
        rpm: +(requests / winMin).toFixed(2),
        tpm: +(tokens / winMin).toFixed(0),
        rate: +(tokens / (winMs / 1000)).toFixed(2),
        errors429: errors,
      });
    }
    if (rows.length === 0) return;
    logLine({
      ts: nowIso(),
      event: "provider-metrics",
      windowMs: winMs,
      providers: rows,
    });
  }

  // ---- hot config (declared limits / excludes / aliases), re-read per use ----
  let hotCache = { mtime: -1, data: {} };
  function hotConfig() {
    const p = cfg.routing.hotConfigPath;
    if (!p || p === "none") return {};
    try {
      const st = statSync(p);
      if (st.mtimeMs !== hotCache.mtime) {
        hotCache = { mtime: st.mtimeMs, data: JSON.parse(readFileSync(p, "utf8")) ?? {} };
      }
      return hotCache.data;
    } catch {
      return {};
    }
  }

  function declaredLimits() {
    const d = hotConfig().declaredLimits;
    return d && typeof d === "object" ? d : {};
  }

  function excludeSet() {
    const set = new Set();
    for (const p of cfg.routing.excludeProviders) if (p) set.add(p);
    const hot = hotConfig().excludeProviders;
    if (Array.isArray(hot)) for (const p of hot) if (p) set.add(p);
    return set;
  }

  function aliasOf(rawModel) {
    const a = hotConfig().aliases;
    if (!a || typeof a !== "object") return undefined;
    const hit = a[String(rawModel ?? "").trim()];
    return typeof hit === "string" && hit ? hit : undefined;
  }

  // ---- learned limits (max observed rpm/tpm before a 429) ----
  const learned = { providers: {} };
  let lastLearnedSave = 0;
  try {
    const raw = JSON.parse(readFileSync(cfg.routing.learnedPath, "utf8"));
    if (raw && typeof raw.providers === "object") learned.providers = raw.providers;
  } catch {
    // no learned data yet
  }

  function persistLearned(force = false) {
    const now = Date.now();
    if (!force && now - lastLearnedSave < 30_000) return;
    lastLearnedSave = now;
    try {
      mkdirSync(dirname(cfg.routing.learnedPath), { recursive: true });
      writeFileSync(
        cfg.routing.learnedPath,
        JSON.stringify({ updatedAt: nowIso(), providers: learned.providers }, null, 2),
      );
    } catch {
      // best-effort; ranking falls back to declared/context data
    }
  }

  function updateLearned(provider, snap) {
    if (!provider || !snap) return;
    const rec =
      learned.providers[provider] ??
      (learned.providers[provider] = {
        tpm: { max: 0, samples: 0 },
        rpm: { max: 0, samples: 0 },
      });
    if (snap.tpm > rec.tpm.max) rec.tpm.max = snap.tpm;
    rec.tpm.samples += 1;
    if (snap.rpm > rec.rpm.max) rec.rpm.max = snap.rpm;
    rec.rpm.samples += 1;
    rec.updatedAt = nowIso();
    persistLearned();
  }

  /** Ranking data for one provider: declared beats learned beats nothing. */
  function limitData(provider) {
    const d = declaredLimits()[provider];
    if (d && (Number(d.tpm) > 0 || Number(d.rpm) > 0)) {
      return { tpm: Number(d.tpm) || 0, rpm: Number(d.rpm) || 0, quality: 2, source: "declared" };
    }
    const l = learned.providers[provider];
    if (l && (l.tpm?.max > 0 || l.rpm?.max > 0)) {
      return { tpm: l.tpm?.max ?? 0, rpm: l.rpm?.max ?? 0, quality: 1, source: "learned" };
    }
    return { tpm: 0, rpm: 0, quality: 0, source: "none" };
  }

  // ---- groups: auto-discovered from the harness model catalog ----
  let groupsCache = { at: 0, groups: [], byPair: new Map(), byFamily: new Map(), source: "none" };

  function registerGroup(groups, byPair, byFamily, id, candidates) {
    if (candidates.length === 0) return;
    groups.push({ id, candidates });
    for (const c of candidates) {
      byPair.set(candidateKey(c.provider, c.model), { id, candidates });
      byFamily.set(c.model, { id, candidates }); // any member resolves its family
    }
    byFamily.set(id, { id, candidates }); // the family key itself resolves too
  }

  function buildStaticGroups(byPair, byFamily) {
    const groups = [];
    for (const g of cfg.routing.staticGroups) {
      const candidates = (Array.isArray(g.providers) ? g.providers : [])
        .map((p) => ({
          provider: typeof p?.provider === "string" ? p.provider : "",
          model: typeof p?.model === "string" ? p.model : "",
        }))
        .filter((p) => p.provider && p.model);
      registerGroup(groups, byPair, byFamily, g.id || `group-${groups.length}`, candidates);
    }
    return groups;
  }

  async function rebuildGroups(now = Date.now()) {
    const byPair = new Map();
    const byFamily = new Map();
    const groups = buildStaticGroups(byPair, byFamily);
    let source = groups.length > 0 ? "static" : "none";

    if (cfg.routing.autoGroups) {
      try {
        const excluded = excludeSet();
        const providers = (await ctx.llm.listProviders?.()) ?? [];
        let autoAdded = 0;
        for (const p of providers) {
          const pid = typeof p === "string" ? p : p?.id;
          if (!pid || excluded.has(pid)) continue;
          let models;
          try {
            models = await ctx.llm.listModels(pid);
          } catch {
            continue;
          }
          for (const m of Array.isArray(models) ? models : []) {
            const mid = m?.id;
            if (!mid) continue;
            const family = aliasOf(mid) ?? canonicalModelId(mid);
            if (!family) continue;
            const pair = candidateKey(pid, mid);
            if (byPair.has(pair)) continue;
            const list = groups.find((g) => g.id === family);
            if (list) {
              list.candidates.push({ provider: pid, model: mid });
            } else {
              registerGroup(groups, byPair, byFamily, family, [{ provider: pid, model: mid }]);
              autoAdded += 1;
              continue;
            }
            byPair.set(pair, { id: family, candidates: list.candidates });
            byFamily.set(mid, { id: family, candidates: list.candidates });
            autoAdded += 1;
          }
        }
        if (autoAdded > 0) source = source === "static" ? "auto+static" : "auto";
        logLine({
          ts: nowIso(),
          event: "routing-groups",
          source,
          groups: groups
            .filter((g) => g.candidates.length > 1)
            .map((g) => ({ id: g.id, members: g.candidates.map((c) => `${c.provider}/${c.model}`) })),
        });
      } catch (err) {
        logLine({
          ts: nowIso(),
          event: "warn",
          code: "auto-groups-failed",
          message: String(err?.message ?? err),
        });
        if (groups.length === 0) source = "none";
      }
    }

    groupsCache = { at: now, groups, byPair, byFamily, source };
    return groupsCache;
  }

  function groupsForRouting(now = Date.now()) {
    if (!cfg.routing.autoGroups) {
      if (groupsCache.at === 0) return rebuildGroups(now);
      return Promise.resolve(groupsCache);
    }
    if (groupsCache.at === 0 || now - groupsCache.at >= cfg.routing.autoGroupTtlMs) {
      return rebuildGroups(now);
    }
    return Promise.resolve(groupsCache);
  }

  async function groupFor(provider, model, now) {
    const cache = await groupsForRouting(now);
    return (
      cache.byPair.get(candidateKey(provider, model)) ??
      cache.byFamily.get(model) ??
      cache.byFamily.get(canonicalModelId(model)) ??
      null
    );
  }

  // ---- cooldowns & turn skips ----
  function isHealthy(candidate, now) {
    const s = routeState.get(candidate.provider);
    if (s && s.lastErrorAt && now - s.lastErrorAt >= cfg.routing.cooldownMs) {
      s.consecutiveErrors = 0;
      s.lastErrorAt = 0;
    }
    return !s || s.consecutiveErrors < 1;
  }

  function resetCooldown(provider) {
    const s = routeState.get(provider);
    if (s === undefined) return;
    s.consecutiveErrors = 0;
    s.lastErrorAt = 0;
  }

  function tpmSkipped(sessionId, turn, provider) {
    if (!cfg.routing.tpmTurnSkip) return false;
    const key = `${sessionId ?? "?"}\x00${provider}`;
    return tpmSkip.get(key) === turn;
  }

  function markTpmSkip(sessionId, turn, provider) {
    const key = `${sessionId ?? "?"}\x00${provider}`;
    tpmSkip.set(key, turn);
  }

  /** True while a provider is serving out its short TPM 429 exile (lazy expiry). */
  function inTpmCooldown(provider, now) {
    const until = tpmCooldown.get(provider);
    if (until === undefined) return false;
    if (now >= until) {
      tpmCooldown.delete(provider);
      return false;
    }
    return true;
  }

  /**
   * Retry re-dispatch inference. llm-retry sits ahead of this plugin on the
   * agent/request-error chain and short-circuits retryable failures with
   * { kind: "retry" }, so intermediate 429s/timeouts never reach the error
   * handler here — only the FINAL failure of a step does. The retries
   * themselves re-enter agent/request though, so a repeat dispatch of the
   * same turn+step IS a retry: the previous attempt ended in a retryable
   * failure. Exclude the key that attempt actually used (turn-scoped, the
   * same mechanism as a TPM skip) so this retry re-routes to the next healthy
   * candidate — whose vendor minute window is empty — instead of hammering
   * the same saturated account until the step's retry budget burns out.
   * @returns the per-session step map to record the routed provider into, or undefined.
   */
  function retryDispatchScan(payload, call) {
    if (!cfg.routing.enabled || !cfg.routing.tpmTurnSkip) return undefined;
    const sessionId = payload?.agent?.session?.id;
    const turn = Number(payload?.turn);
    const step = Number(payload?.step);
    if (sessionId === undefined || !Number.isFinite(turn) || !Number.isFinite(step) || !call?.provider) {
      return undefined;
    }
    let steps = stepDispatches.get(sessionId);
    if (dispatchTurn.get(sessionId) !== turn || steps === undefined) {
      steps = new Map();
      stepDispatches.set(sessionId, steps);
      dispatchTurn.set(sessionId, turn);
    }
    const stepKey = `${turn}x${step}`;
    const prevProvider = steps.get(stepKey);
    // A re-dispatch of the same turn+step means the previous attempt FAILED.
    // Skip the provider that attempt actually USED (steps[] holds the ROUTED
    // target, which after an earlier failover differs from call.provider —
    // llm-retry re-dispatches the ORIGINAL request, so call.provider stays the
    // original key and never equals the routed one). Gating on
    // prevProvider === call.provider therefore only ever catches the FIRST
    // reroute and never the subsequent key, which is why a saturated 商汤2
    // kept getting hammered instead of downgrading.
    if (prevProvider !== undefined) {
      markTpmSkip(sessionId, turn, prevProvider);
      logLine({
        ts: nowIso(),
        event: "retry-reroute",
        turn,
        step,
        provider: prevProvider,
        reason: "repeat-dispatch",
      });
    }
    return steps;
  }

  // ---- ranking: declared > learned > none; tpm desc, rpm desc, window desc ----
  function rankEligible(eligible) {
    const q = (d) => (d ? d.quality : 0);
    const n = (v) => (Number.isFinite(v) ? v : -1);
    return eligible.slice().sort((a, b) => {
      const da = limitData(a.c.provider);
      const db = limitData(b.c.provider);
      const diffQ = q(db) - q(da);
      if (diffQ) return diffQ;
      const diffT = n(db.tpm) - n(da.tpm);
      if (diffT) return diffT;
      const diffR = n(db.rpm) - n(da.rpm);
      if (diffR) return diffR;
      const diffW = n(b.cCtx) - n(a.cCtx);
      if (diffW) return diffW;
      return 0; // stable sort keeps declared order
    });
  }

  function routePick(eligible, now, preferProvider) {
    for (const e of eligible) isHealthy(e.c, now);
    const byProvider = new Map(eligible.map((e) => [e.c.provider, e]));
    if (preferProvider) {
      const preferred = byProvider.get(preferProvider);
      if (preferred && isHealthy(preferred.c, now)) return preferred;
    }
    const healthy = eligible.filter((e) => isHealthy(e.c, now));
    if (healthy.length > 0) return rankEligible(healthy)[0];
    // All unhealthy (only possible when every candidate is RPM-cooling): use
    // the least-recently-errored one so a request still goes somewhere.
    let best = eligible[0];
    let bestAt = Infinity;
    for (const e of eligible) {
      const at = routeState.get(e.c.provider)?.lastErrorAt ?? 0;
      if (at < bestAt) {
        bestAt = at;
        best = e;
      }
    }
    return best;
  }

  function measureSessionTokens(agent) {
    try {
      return ctx.tokenMeter.measure(agent.session).totalTokens;
    } catch {
      return undefined;
    }
  }

  function compactionFor(agent) {
    const presets = ctx.get("agentPresets");
    if (presets && typeof presets.serviceFor === "function") {
      const impl = presets.serviceFor(agent, "compaction");
      if (impl !== undefined) return impl;
    }
    return ctx.get("compaction");
  }

  /**
   * Downgrade-prep compaction: happens ONLY when a lower-tier failover is
   * wanted and the measured remainder would not fit the target. Prefers the
   * compact-router engine's LLM-free instant mode through its
   * `instantOnceFor()` seam when that engine is mounted; stock compaction
   * engines without the method are used as-is, so this keeps working before
   * and after compact-router is activated.
   */
  async function compactForDowngrade(agent, signal) {
    try {
      const compaction = compactionFor(agent);
      if (!compaction || typeof compaction.compactIfNeeded !== "function") {
        ctx.logger.warn(`[${name}] no compaction service for downgrade compaction`);
        return false;
      }
      try {
        compaction.instantOnceFor?.(agent);
      } catch {
        // optional seam — stock engines simply don't have it
      }
      const result = await compaction.compactIfNeeded(agent, "context-overflow", signal);
      return result !== null && result !== undefined;
    } catch (err) {
      ctx.logger.warn(`[${name}] downgrade compaction failed: ${err?.message ?? err}`);
      return false;
    }
  }

  async function routeRequest(call, agent, turn, signal) {
    if (!cfg.routing.enabled || !call?.provider || !call?.model) {
      return { config: call, from: undefined, to: undefined, groupId: undefined };
    }
    const now = Date.now();
    const group = await groupFor(call.provider, call.model, now);
    if (!group || group.candidates.length < 2) {
      return { config: call, from: undefined, to: undefined, groupId: undefined };
    }

    const sessionId = agent?.session?.id;

    // Sticky anchor: the USER's current selection is never swapped while it
    // is healthy and not turn-skipped. A selection the ROUTER wrote back
    // during an earlier failover is NOT sticky — the next turn may rank a
    // recovered key above it and route home.
    const routedKey = routerRouted.get(sessionId);
    const routerOwned =
      routedKey !== undefined &&
      (routedKey === candidateKey(call.provider, call.model) ||
        routedKey.split("\x00")[0] === call.provider);
    if (
      !routerOwned &&
      !tpmSkipped(sessionId, turn, call.provider) &&
      !inTpmCooldown(call.provider, now) &&
      isHealthy({ provider: call.provider }, now)
    ) {
      return { config: call, from: undefined, to: undefined, groupId: undefined };
    }

    const excluded = excludeSet();
    const reqCtx = await getContextWindow(call.provider, call.model);

    // Tier every candidate. The context tier is a HARD safety filter: a
    // candidate may only serve a SMALLER window when the measured session
    // remainder fits it. One-side-unknown windows are never eligible (v2).
    const sameOrHigher = [];
    const lower = [];
    for (const c of group.candidates) {
      if (excluded.has(c.provider)) continue;
      const cCtx = await getContextWindow(c.provider, c.model);
      let tier;
      if (typeof reqCtx === "number" && typeof cCtx === "number") {
        tier = cCtx >= reqCtx ? "sameOrHigher" : "lower";
      } else if (reqCtx === undefined && cCtx === undefined) {
        tier = "sameOrHigher";
      } else {
        continue; // one side unknown — never risk overflow
      }
      (tier === "lower" ? lower : sameOrHigher).push({ c, cCtx, tier });
    }

    let usage;
    const measuredUsage = () => {
      if (usage === undefined) usage = measureSessionTokens(agent);
      return usage;
    };
    const fits = (cCtx) => {
      const u = measuredUsage();
      return typeof u === "number" && typeof cCtx === "number" && u <= cCtx * cfg.routing.downgradeContextMargin;
    };
    const gate = (e) =>
      !tpmSkipped(sessionId, turn, e.c.provider) &&
      !inTpmCooldown(e.c.provider, now) &&
      isHealthy(e.c, now);

    let eligible = sameOrHigher.filter(gate);
    if (eligible.length === 0 && lower.length > 0) {
      let lowerEligible = lower.filter((e) => gate(e) && fits(e.cCtx));
      if (lowerEligible.length === 0) {
        // Overflow: one compaction this turn, then re-measure. Skipped
        // entirely when the session remainder cannot be measured — we never
        // downgrade blind.
        const rec = downgradeCompacts.get(sessionId);
        const spent = rec && rec.turn === turn ? rec.count : 0;
        if (spent < cfg.routing.maxDowngradeCompactsPerTurn && measuredUsage() !== undefined) {
          const compacted = await compactForDowngrade(agent, signal);
          if (compacted) {
            downgradeCompacts.set(sessionId, { turn, count: spent + 1 });
            usage = undefined;
            lowerEligible = lower.filter((e) => gate(e) && fits(e.cCtx));
            logLine({
              ts: nowIso(),
              event: "compact",
              turn,
              provider: call.provider,
              reason: "downgrade-fit",
              usageAfter: measuredUsage() ?? null,
            });
          }
        }
      }
      eligible = lowerEligible;
    }
    if (eligible.length === 0) {
      return { config: call, from: undefined, to: undefined, groupId: group.id };
    }

    const picked = routePick(eligible, now, call.provider);
    const from = `${call.provider}/${call.model}`;
    const to = `${picked.c.provider}/${picked.c.model}`;
    if (from === to) return { config: call, from: undefined, to: undefined, groupId: group.id };
    if (sessionId !== undefined) {
      routerRouted.set(sessionId, candidateKey(picked.c.provider, picked.c.model));
    }
    return {
      config: { ...call, provider: picked.c.provider, model: picked.c.model },
      from,
      to,
      groupId: group.id,
    };
  }

  // ---- option A write-back: keep the front-end on the actual routed model ----
  // Session-only on purpose: the DEFAULT model for future sessions is NOT
  // touched — it must only change when the user switches manually.
  function writeBackSelection(agent, selection) {
    const session = agent?.session;
    if (!session) return;
    const { provider, model } = selection;
    const sessionId = session.id;
    const key = candidateKey(provider, model);
    if (sessionId !== undefined) routerSelect.set(sessionId, key);
    try {
      if (typeof session.append === "function") {
        session.append("model/selection", selection);
      }
    } catch (err) {
      if (sessionId !== undefined) routerSelect.delete(sessionId);
      logLine({
        ts: nowIso(),
        event: "warn",
        code: "selection-writeback-append-failed",
        message: String(err?.message ?? err),
      });
    }
  }

  function captureUsage(data) {
    const usage = data?.usage;
    const provider = data?.message?.source?.provider;
    const tokens = usage?.totalTokens ?? ((usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0));
    if (provider && tokens > 0) recordTokens(provider, tokens);
  }

  // ---- hooks ----
  ctx.on("llm/adapters-updated", () => {
    contextCache.clear();
    tpmCooldown.clear();
    groupsCache = { at: 0, groups: [], byPair: new Map(), byFamily: new Map(), source: "none" };
  });

  ctx.on("agent/request", async (payload, next) => {
    const call = await next();
    const steps = retryDispatchScan(payload, call);
    const { config: routed, from, to, groupId } = await routeRequest(
      call,
      payload.agent,
      payload.turn,
      payload.signal,
    );
    if (steps !== undefined && routed?.provider) {
      steps.set(`${Number(payload.turn)}x${Number(payload.step)}`, routed.provider);
    }
    const waited = await throttle(routed?.provider, payload.signal);

    if (routed?.provider) recordRequest(routed.provider);

    if (from && cfg.routing.syncSelectionOnFailover) {
      writeBackSelection(payload.agent, {
        provider: routed.provider,
        model: routed.model,
        ...(routed.reasoningEffort === undefined ? {} : { reasoningEffort: routed.reasoningEffort }),
      });
    }

    if (shouldLog(routed?.provider)) {
      logLine({
        ts: nowIso(),
        event: "request",
        provider: routed?.provider,
        model: routed?.model,
        turn: payload.turn,
        step: payload.step,
        throttledMs: waited,
        ...(from ? { routedFrom: from, routedTo: to, routeGroup: groupId } : {}),
      });
    }
    maybeEmitMetrics(Date.now());
    return routed;
  });

  ctx.on("agent/request-error", async (payload, next) => {
    const f = payload.failure ?? {};
    if (shouldLog(payload.provider)) {
      logLine({
        ts: nowIso(),
        event: "error",
        provider: payload.provider,
        turn: payload.turn,
        step: payload.step,
        code: f.code,
        status: f.status,
        message: f.message,
        retryAfterMs: f.providerRetryAfterMs,
        requestId: f.requestId,
      });
    }
    if (isRateLimitFailure(f)) {
      const kind = classifyRateLimit(f);
      throttleNoteError(payload.provider);
      recordError(payload.provider);
      // Observed throughput at the moment of the 429: the raw material for
      // approximating this vendor's real limits over time (方案B).
      const snap = observedSnapshot(payload.provider);
      updateLearned(payload.provider, snap);
      if (kind === "tpm") {
        // TPM recovers with the rolling minute window: skip the key for the
        // rest of this turn AND put it in a short exile (tpmCooldownMs) so the
        // NEXT turn tries the next same-tier key instead of re-hitting the
        // saturated one. Without the exile the turn-skip expires unused when
        // the 429 ends the turn, and every new turn re-selects the same key.
        markTpmSkip(payload.agent?.session?.id, payload.turn, payload.provider);
        if (cfg.routing.tpmCooldownMs > 0) {
          tpmCooldown.set(payload.provider, Date.now() + cfg.routing.tpmCooldownMs);
        }
      } else {
        const s = routeState.get(payload.provider) ?? { consecutiveErrors: 0, lastErrorAt: 0 };
        s.consecutiveErrors += 1;
        s.lastErrorAt = Date.now();
        routeState.set(payload.provider, s);
      }
      if (shouldLog(payload.provider)) {
        logLine({
          ts: nowIso(),
          event: "rate-limit",
          provider: payload.provider,
          turn: payload.turn,
          kind,
          cooldown: kind === "rpm" ? cfg.routing.cooldownMs : cfg.routing.tpmCooldownMs,
          observed: snap,
        });
      }
    }
    maybeEmitMetrics(Date.now());
    return next();
  });

  // Distinguish a USER-initiated model switch from our own write-back. Our
  // own echo only consumes the marker; the routed target stays router-owned
  // so the next turn can still rank a recovered key above it. A USER switch
  // makes the selection sticky again and clears the target provider's RPM
  // cooldown AND turn skip (the user explicitly wants it now).
  ctx.on("session/event", (session, event) => {
    const type = event?.type;
    const data = event?.data;
    if (type === "model/selection") {
      const provider = data?.provider;
      const model = data?.model;
      if (!provider || !model) return;
      const sessionId = session?.id;
      const key = candidateKey(provider, model);
      if (sessionId !== undefined && routerSelect.get(sessionId) === key) {
        routerSelect.delete(sessionId);
        return; // our own write-back echo — the target stays router-owned
      }
      if (sessionId !== undefined) routerRouted.delete(sessionId);
      if (cfg.routing.clearCooldownOnUserSwitch) resetCooldown(provider);
      tpmCooldown.delete(provider); // a USER switch means "use this key NOW"
      for (const k of tpmSkip.keys()) {
        if (k.endsWith(`\x00${provider}`)) tpmSkip.delete(k);
      }
      return;
    }
    if (type === "assistant/message") {
      captureUsage(data);
    }
  });
}
