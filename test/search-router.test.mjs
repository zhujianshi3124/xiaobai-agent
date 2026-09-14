// dsh-search-router tests — dispatch logic + provider delegation with fakes.
// Run: node test-router.mjs   (expect all PASS)

import { readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PROVIDER_ID,
  DELEGATE_OFFICIAL,
  DELEGATE_LOCAL,
  MODES,
  defaultConfig,
  pickDelegate,
  resolveConfig,
  createProvider,
} from "../lib/search-router/index.js";

let pass = 0;
let fail = 0;
function check(label, cond, extra) {
  if (cond) {
    pass++;
    console.log(`PASS  ${label}`);
  } else {
    fail++;
    console.log(`FAIL  ${label}${extra !== undefined ? `  -> ${JSON.stringify(extra)}` : ""}`);
  }
}

const OFF = DELEGATE_OFFICIAL;
const LOC = DELEGATE_LOCAL;

// ---- pickDelegate: auto ----
check("auto: llm-deepseek -> official", pickDelegate({ ...defaultConfig(), mode: "auto" }, { provider: "llm-deepseek", model: "deepseek-v4-pro" }) === OFF);
check("auto: sensenova -> local", pickDelegate({ ...defaultConfig(), mode: "auto" }, { provider: "sensenova-gateway", model: "deepseek-v4-pro" }) === LOC);
check("auto: nvidia -> local", pickDelegate({ ...defaultConfig(), mode: "auto" }, { provider: "nvidia", model: "deepseek-ai/deepseek-v4-pro-0813" }) === LOC);
check("auto: amd-gateway -> local", pickDelegate({ ...defaultConfig(), mode: "auto" }, { provider: "amd-gateway", model: "DeepSeek-V4-Flash" }) === LOC);
check("auto: no routed -> default local", pickDelegate({ ...defaultConfig(), mode: "auto" }, undefined) === LOC);
check("auto: no routed + defaultWhenUnknown official -> official", pickDelegate({ ...defaultConfig(), mode: "auto", defaultWhenUnknown: "official" }, undefined) === OFF);

// ---- pickDelegate: explicit modes ----
check("mode official wins over routed non-official", pickDelegate({ ...defaultConfig(), mode: "official" }, { provider: "sensenova-gateway", model: "x" }) === OFF);
check("mode local wins over routed official", pickDelegate({ ...defaultConfig(), mode: "local" }, { provider: "llm-deepseek", model: "deepseek-v4-pro" }) === LOC);

// ---- pickDelegate: patterns ----
check("provider pattern ^llm- matches llm-deepseek", pickDelegate({ ...defaultConfig(), officialProviderPatterns: ["^llm-"] }, { provider: "llm-deepseek" }) === OFF);
check("model pattern deepseek-v4 + amd provider -> official (custom)", pickDelegate({ ...defaultConfig(), officialModelPatterns: ["^deepseek-v4"] }, { provider: "amd-gateway", model: "deepseek-v4-pro" }) === OFF);
check("malformed pattern ignored", pickDelegate({ ...defaultConfig(), officialProviderPatterns: ["("] }, { provider: "zai", model: "glm-5.2" }) === LOC);

// ---- custom officialProviders ----
check("custom officialProviders list", pickDelegate({ ...defaultConfig(), officialProviders: ["zai"] }, { provider: "zai", model: "glm-5.2" }) === OFF);

// ---- resolveConfig merge + env override ----
const dir = join(tmpdir(), `dsh-search-router-test-${process.pid}`);
mkdirSync(dir, { recursive: true });
const cfgPath = join(dir, "dsh-search-router.json");
const realHome = process.env.DSH_HOME;
process.env.DSH_HOME = dir;
try {
  writeFileSync(cfgPath, JSON.stringify({ mode: "local" }));
  // file mode local, seed auto -> local unless env says otherwise
  check("config.json mode=local wins over seed", resolveConfig({ mode: "auto" }).mode === "local");
  // restore seed (delete file) -> auto
  rmSync(cfgPath, { force: true });
  check("no file -> seed auto", resolveConfig({ mode: "auto" }).mode === "auto");
  // malformed json -> seed
  writeFileSync(cfgPath, "{not json");
  check("malformed config.json falls back to seed", resolveConfig({ mode: "auto" }).mode === "auto");
  rmSync(cfgPath, { force: true });
  // env override beats file
  writeFileSync(cfgPath, JSON.stringify({ mode: "local" }));
  process.env.DSH_WEB_SEARCH_ROUTER_MODE = "official";
  check("env mode official beats file local", resolveConfig({ mode: "auto" }).mode === "official");
  process.env.DSH_WEB_SEARCH_ROUTER_MODE = "bogus";
  check("invalid env mode ignored -> file local", resolveConfig({ mode: "auto" }).mode === "local");
  delete process.env.DSH_WEB_SEARCH_ROUTER_MODE;
  // non-array guards
  const c = resolveConfig({ mode: "auto", officialProviders: "llm-deepseek" });
  check("non-array officialProviders is normalized", Array.isArray(c.officialProviders) && c.officialProviders.length === 0);
} finally {
  rmSync(dir, { recursive: true, force: true });
  if (realHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = realHome;
}

// ---- createProvider: delegation through a fake registry ----
(async () => {
  const registry = new Map();
  const calls = [];
  registry.set(DELEGATE_OFFICIAL, {
    available: () => true,
    search: async (req) => { calls.push(["official", req.query]); return { sources: [{ url: "https://official" }], truncated: false }; },
  });
  registry.set(DELEGATE_LOCAL, {
    available: () => true,
    search: async (req) => { calls.push(["local", req.query]); return { sources: [{ url: "https://local" }], truncated: false }; },
  });
  let routed = { provider: "sensenova-gateway", model: "deepseek-v4-pro" };
  const provider = createProvider({
    readRouted: () => routed,
    readCfg: () => resolveConfig({ mode: "auto" }),
    providers: () => registry,
  });
  check("provider.id is auto-search", provider.id === PROVIDER_ID);
  check("provider.available() true", provider.available() === true);

  let res = await provider.search({ query: "q1", maxResults: 5 });
  check("non-official routed -> local delegate", calls.at(-1)[0] === "local");
  check("query passed through", calls.at(-1)[1] === "q1");
  check("delegate result returned", res.sources[0].url === "https://local");

  routed = { provider: "llm-deepseek", model: "deepseek-v4-flash" };
  await provider.search({ query: "q2" });
  check("official routed -> official delegate", calls.at(-1)[0] === "official");

  // missing delegate -> WebError
  const empty = createProvider({
    readRouted: () => ({ provider: "llm-deepseek" }),
    readCfg: () => resolveConfig({ mode: "auto" }),
    providers: () => new Map(), // nothing registered
  });
  let threw = false;
  try {
    await empty.search({ query: "x" });
  } catch (e) {
    threw = e?.name === "WebError" && /deepseek-official/.test(e.message);
  }
  check("missing delegate throws WebError with hint", threw);

  // unavailable delegate -> WebError
  const unavail = createProvider({
    readRouted: () => ({ provider: "sensenova" }),
    readCfg: () => resolveConfig({ mode: "auto" }),
    providers: () => new Map([[DELEGATE_LOCAL, { available: () => false, search: async () => ({ sources: [] }) }]]),
  });
  threw = false;
  try {
    await unavail.search({ query: "x" });
  } catch (e) {
    threw = e?.name === "WebError" && /unavailable/.test(e.message);
  }
  check("unavailable delegate throws WebError", threw);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail > 0 ? 1 : 0;
})();

// silence unused-import lint feeling for readFileSync (used via resolveConfig only)
void readFileSync;
void MODES;