// dsh-search-router
//
// A composite `ctx.web` search provider that picks the backend by the
// session's routed model:
//
//   auto     (default) — official DeepSeek API (llm-deepseek) → the built-in
//                        `deepseek-official` provider; any other provider
//                        (sensenova / amd / nvidia / zai / …) → `local-multi`
//                        (the @gausszhou/dsh-web-search-local engines).
//   official — always the built-in DeepSeek official search.
//   local    — always the local-multi engines.
//
// The mode (and the "what is official" table) is re-read on EVERY search call
// from, in order: patch/seed config → `~/.dsh/dsh-search-router.json` →
// `DSH_WEB_SEARCH_ROUTER_MODE` env. Editing the JSON file (or exporting the
// env) therefore switches the backend hot, with no restart.
//
// Delegation goes through the seam's public provider registry
// (`ctx.web.searchProviders`), so this plugin carries no HTTP dialect of its
// own: it only routes to whatever is registered.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { WebError } from "@deepseek-ai/dsh-web";

export const name = "search-router";
/** Seams this plugin wires. The agents seam is read via ctx.get('agents'). */
export const inject = ["web"];

/** Stable provider id; set `searchProvider: auto-search` on the web seam. */
export const PROVIDER_ID = "auto-search";
/** Delegate id of the built-in DeepSeek official provider. */
export const DELEGATE_OFFICIAL = "deepseek-official";
/** Delegate id of the @gausszhou/dsh-web-search-local engines. */
export const DELEGATE_LOCAL = "local-multi";

export const MODES = ["auto", "official", "local"];

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}

/** Per-call hot configuration file: `~/.dsh/dsh-search-router.json`. */
export function configPath() {
  return join(dshHome(), "dsh-search-router.json");
}

/** Seed defaults; patch config may override any of these. */
export function defaultConfig() {
  return {
    mode: "auto",
    officialProviders: ["llm-deepseek"],
    officialProviderPatterns: [],
    officialModelPatterns: [],
    defaultWhenUnknown: "local",
  };
}

/** Compile a pattern list once per call; invalid patterns are ignored. */
function matchesAny(patterns, value) {
  if (!Array.isArray(patterns)) return false;
  for (const raw of patterns) {
    if (typeof raw !== "string" || raw.length === 0) continue;
    try {
      if (new RegExp(raw).test(value)) return true;
    } catch {
      // ignore malformed regexes
    }
  }
  return false;
}

/**
 * Merge the effective config for ONE call:
 * seed (cordis patch) < hot JSON file < DSH_WEB_SEARCH_ROUTER_MODE env.
 */
export function resolveConfig(seed = {}) {
  const base = { ...defaultConfig(), ...(seed ?? {}) };
  let file = {};
  try {
    const parsed = JSON.parse(readFileSync(configPath(), "utf8"));
    if (parsed && typeof parsed === "object") file = parsed;
  } catch {
    // absent or unreadable — keep seed defaults
  }
  const merged = { ...base, ...file };
  const envMode = process.env.DSH_WEB_SEARCH_ROUTER_MODE;
  if (typeof envMode === "string" && MODES.includes(envMode)) merged.mode = envMode;
  if (!MODES.includes(merged.mode)) merged.mode = defaultConfig().mode;
  if (!Array.isArray(merged.officialProviders)) merged.officialProviders = [];
  if (!Array.isArray(merged.officialProviderPatterns)) merged.officialProviderPatterns = [];
  if (!Array.isArray(merged.officialModelPatterns)) merged.officialModelPatterns = [];
  return merged;
}

/**
 * Decide which delegate provider to use for a call.
 * @param cfg effective config (see {@link resolveConfig})
 * @param routed the session's routed `{ provider, model }` (LlmCallConfig) or
 *   undefined when no initiator/header is available.
 * @returns the delegate provider id.
 */
export function pickDelegate(cfg, routed) {
  if (cfg.mode === "official") return DELEGATE_OFFICIAL;
  if (cfg.mode === "local") return DELEGATE_LOCAL;
  // auto:
  if (routed) {
    const provider = String(routed.provider ?? "");
    const model = String(routed.model ?? "");
    if (cfg.officialProviders.includes(provider)) return DELEGATE_OFFICIAL;
    if (matchesAny(cfg.officialProviderPatterns, provider)) return DELEGATE_OFFICIAL;
    if (matchesAny(cfg.officialModelPatterns, model)) return DELEGATE_OFFICIAL;
    return DELEGATE_LOCAL;
  }
  return cfg.defaultWhenUnknown === "official" ? DELEGATE_OFFICIAL : DELEGATE_LOCAL;
}

/**
 * Build the composite provider. Exposed as a factory so the dispatch logic is
 * testable with fakes; `apply` wires it to the real seam.
 * @param deps { readRouted: () => {provider,model}|undefined,
 *               readCfg: () => cfg,
 *               providers: () => Map<string, {available(): boolean, search(req, signal)}> }
 */
export function createProvider({ readRouted, readCfg, providers }) {
  return {
    id: PROVIDER_ID,
    available() {
      return true;
    },
    async search(request, signal) {
      const cfg = readCfg();
      const routed = readRouted();
      const delegateId = pickDelegate(cfg, routed);
      const map = providers();
      const delegate = typeof map?.get === "function" ? map.get(delegateId) : undefined;
      if (!delegate) {
        const hint =
          delegateId === DELEGATE_OFFICIAL
            ? "enable the web-search-deepseek row (or set mode=local)"
            : "install @gausszhou/dsh-web-search-local (or set mode=official)";
        throw new WebError(
          `search-router: delegate provider "${delegateId}" is not registered — ${hint}`,
          "WEB_PROVIDER_ERROR",
        );
      }
      if (typeof delegate.available === "function" && !delegate.available()) {
        throw new WebError(
          `search-router: delegate provider "${delegateId}" is registered but unavailable`,
          "WEB_PROVIDER_ERROR",
        );
      }
      return delegate.search(request, signal);
    },
  };
}

export default {
  name: "search-router",
  inject: ["web"],
  apply(ctx, config = {}) {
    const provider = createProvider({
      readRouted: () => {
        try {
          return ctx.get("agents")?.currentInitiator?.()?.session?.requestHeader?.()?.config;
        } catch {
          return undefined;
        }
      },
      readCfg: () => resolveConfig(config),
      providers: () => ctx.web.searchProviders,
    });
    ctx.effect(function* () {
      const dispose = ctx.web.registerSearchProvider(provider);
      yield () => dispose();
    });
  },
};