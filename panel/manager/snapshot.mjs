import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { homedir } from "node:os";
import { PLUGINS, DEPENDENCIES } from "./plugin-registry.mjs";
import { listCustody, getSoftRecord, custodyRoot } from "./custody.mjs";
// 提供面单源化（改名批）：不自建第二份优先级逻辑，直接复用装载面 extractRegisters
// （provides 三槽优先、缺席回落 legacy registers，同 loader 口径；返回 undefined 时置空对象）。
import { extractRegisters } from "../../registry/dist/loader.js";

function createHashSha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

const ORIGINS = {
  "agent-memory": { origin: "local" },
  "compact-router": { origin: "local" },
  "rate-throttle": { origin: "local" },
  "search-router": { origin: "local" },
  "web-search-local": {
    origin: "derived",
    upstream: "@gausszhou/dsh-web-search-local",
    author: "gausszhou",
    license: "MIT",
    note: "基于 gausszhou 作品，保留原名归属；本地套件名空间挂载名不影响 upstream 归属。",
  },
};

const ROW_IDS = {
  "agent-memory": "agent-memory-runtime",
  "compact-router": null,
  "rate-throttle": "rate-throttle",
  "search-router": "web-search-router",
  "web-search-local": "web-search-local",
};

export function parseRootRows(patchText) {
  const lines = patchText.split(/\r?\n/);
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const idMatch = /^(\s*)- id:\s*([^#\s]+)/.exec(lines[i]);
    if (!idMatch) continue;
    const indent = idMatch[1].length;
    const id = idMatch[2];
    const row = { id, line: i + 1, indent, enabled: true, disabledExplicit: false, disabledExpr: null, config: {} };
    // 本行块的直接子级缩进。`- id:` 自身缩进为 indent，其键缩进为 indent + 2。
    // 嵌套分支（如 config.routing.enabled）缩进更深，**不属于本行 config 的直接子级**，
    // 必须排除，否则会与同级键同名互相覆盖（历史缺陷：rate-throttle 自身
    // config.enabled:false 被嵌套 config.routing.enabled:true 覆盖 → 面板误报「运行中」）。
    const ownKeyIndent = indent + 2;
    let inConfig = false;          // 已进入 `config:` 子树
    let configKeyIndent = -1;      // `config:` 自身的缩进
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (/^(\s*)- id:/.test(line)) break;
      const keyMatch = /^(\s+)([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
      if (!keyMatch) continue;
      const keyIndent = keyMatch[1].length;
      // 缩进回落到本行或更浅 ⇒ 本行块结束
      if (keyIndent <= indent) break;
      // 深层缩进：只在 config 子树内、且是 config 的直接子级时才收录
      if (keyIndent > ownKeyIndent) {
        if (inConfig && keyIndent === configKeyIndent + 2) {
          const key = keyMatch[2];
          const value = keyMatch[3].trim();
          if (value === "" && (j + 1 < lines.length)) {
            // 值是嵌套映射（如 routing:）——此处只记标记，不下钻
            row.config[key] = "";
          } else {
            row.config[key] = value;
          }
        }
        continue;
      }
      // keyIndent === ownKeyIndent：本行的直接子级
      const key = keyMatch[2];
      const value = keyMatch[3].trim();
      if (key === "disabled") {
        if (value === "true") {
          row.enabled = false;
          row.disabledExplicit = true;
        } else if (value === "false") {
          row.disabledExplicit = true;
        } else {
          // 非字面量：典型是 `disabled: !!js <表达式>`（cordis Loader 在条目激活时
          // 用 Boolean(eval(expr)) 求值）。**面板不解释这类表达式** —— 解析成布尔
          // 是错的：写 `!!js process.platform === 'win32'` 的行在 Windows 上实际
          // 是停用的，若只按「不是 true/false 就算开着」处理，面板会报「运行中」，
          // 与事实相反。因此单独记下原文，交由 UI 如实显示为「条件开关，面板不解释」。
          row.disabledExpr = value;
        }
        continue;
      }
      if (key === "name") {
        const nameVal = /^'([^']+)'/.exec(value) || /^"([^"]+)"/.exec(value);
        row.name = nameVal ? nameVal[1] : (value || undefined);
        continue;
      }
      if (key === "id") continue;
      if (key === "config") {
        inConfig = true;
        configKeyIndent = keyIndent;
        continue;
      }
      // 其它同级标量键：保留在 config 下（保持旧行为，不丢信息）
      row.config[key] = value;
    }
    rows.push(row);
  }
  return rows;
}

function loadJson(abs) {
  try {
    return JSON.parse(readFileSync(abs, "utf8"));
  } catch {
    return undefined;
  }
}

/**
 * P2.4：compact-router 预设挂载态（快照现读，不缓存）。
 * 判据 = preset-patch-state.json 存在且该预设当前文件 sha == 记录的 patchedSha。
 * 状态文件被 U9 纪律保持与磁盘对账；脚本侧 --status 是权威，但快照内不拉子进程。
 */
function presetPatchedAny(toolkitRoot) {
  const state = loadJson(join(toolkitRoot, "preset-patch-state.json"));
  if (!state || typeof state !== "object") return { patched: false, all: {} };
  const all = {};
  let any = false;
  for (const [id, entry] of Object.entries(state)) {
    let patched = false;
    try {
      if (entry && entry.file && entry.patchedSha && existsSync(entry.file)) {
        patched = createHashSha256(readFileSync(entry.file, "utf8")) === entry.patchedSha;
      }
    } catch {
      patched = false;
    }
    all[id] = patched;
    if (patched) any = true;
  }
  return { patched: any, all };
}

/**
 * P2.4 缺席态判定（**销毁式 v2** 口径，p24-design-v2-destroy.md §4/§6.2）：
 *   mounted                —— 本体在 + 挂载在（patch 行 / 预设 patched）
 *   soft-unmounted         —— 本体在 + 行不在 + 面板软卸载台账在案（面板发起，**可一键恢复**）
 *   true-uninstalled       —— 本体不在 + 行不在 + **收据在案**（面板销毁式真卸载，**无副本、不可恢复**）
 *   installed-unmounted    —— 本体在 + 行不在 + 无面板台账（重装后 / 面板外摘除 ⇒ doctor 提「已安装未挂载」，**可挂载**）
 *   dangling-mount         —— 行在 + 本体不在（无收据；doctor 提「挂载行存在但本体缺失」）
 *   dependency-broken      —— mounted 修饰态：依赖的本地搜索缺席（搜索功能不可用）
 */
function determineAbsenceState({ dir, meta, bodyPresent, rowPresent, softRecord, receiptOnFile, presetState }) {
  if (meta.managedBy === "preset") {
    if (bodyPresent && presetState.patched) return "mounted";
    if (bodyPresent && !presetState.patched) return softRecord ? "soft-unmounted" : "installed-unmounted";
    if (!bodyPresent && receiptOnFile) return "true-uninstalled";
    return "unknown-absent";
  }
  if (bodyPresent && rowPresent) return "mounted";
  if (bodyPresent && !rowPresent) return softRecord ? "soft-unmounted" : "installed-unmounted";
  if (!bodyPresent && rowPresent) return "dangling-mount";
  if (!bodyPresent && !rowPresent) return receiptOnFile ? "true-uninstalled" : "unknown-absent";
  return "unknown-absent";
}

/**
 * 目录体量（**只 stat、不读内容**）：供真卸载确认页展示「将删 N 个文件 / M 字节」
 * （p24-design-v2-destroy.md §6.1 两补强之 b；判定侧 2026-09-19 采纳）。
 */
function dirStats(absDir) {
  let files = 0;
  let bytes = 0;
  const walk = (d) => {
    let es;
    try {
      es = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of es) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else {
        files++;
        try {
          bytes += statSync(p).size;
        } catch {
          /* 单项不可读不影响体量展示 */
        }
      }
    }
  };
  if (existsSync(absDir)) walk(absDir);
  return { files, bytes };
}

const ABSENCE_COPY = {
  "mounted": null,
  "soft-unmounted": "已软卸载 · 本体保留 · 可一键恢复",
  // 销毁式 v2（Q2'-a）：真卸载无副本、不可恢复；恢复途径 = 开源后重新安装 → 挂载
  "true-uninstalled": "已卸载（无副本）· 重新安装后面板可挂载",
  "installed-unmounted": "已安装未挂载（不是面板卸载的）· 可从面板重新挂载",
  "dangling-mount": "挂载行存在，但本体缺失 · 异常态",
  "unknown-absent": "未安装 · 本体与挂载行都不在",
};

/**
 * P2.3：解析某行 `config:` 子树里的**标量值**（config 直下 + routing 直下），
 * 供卡片「参数编辑」呈现当前值。只收标量；嵌套数组/对象（如 staticGroups）跳过。
 * 返回 { top: {k:v}, routing: {k:v} }，值均为原始字符串（UI 侧再转类型）。
 */
export function parseConfigScalars(patchText, rowId) {
  const lines = patchText.split(/\r?\n/);
  const out = { top: {}, routing: {} };
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)- id:\s*([^#\s]+)/.exec(lines[i]);
    if (m && m[2] === rowId) { start = i; break; }
  }
  if (start < 0) return out;
  const rowIndent = /^(\s*)/.exec(lines[start])[1].length;
  let cfgIndent = -1;
  let routingIndent = -1;
  for (let j = start + 1; j < lines.length; j++) {
    const line = lines[j];
    if (/^(\s*)- id:/.test(line)) break;
    const km = /^(\s+)([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    if (!km) continue;
    const ki = km[1].length;
    if (ki <= rowIndent) break;
    if (ki === rowIndent + 2) {
      if (km[2] === "config") { cfgIndent = ki; continue; }
    }
    if (cfgIndent >= 0 && ki === cfgIndent + 2) {
      if (km[3] === "" && km[2] === "routing") { routingIndent = ki; continue; }
      out.top[km[2]] = km[3].trim();
      continue;
    }
    if (routingIndent >= 0 && ki === routingIndent + 2) {
      out.routing[km[2]] = km[3].trim();
    }
  }
  return out;
}

/**
 * P2.3（第 15 轮方案 1）：search-router `mode` 的**当前实际生效值 + 来源**。
 * 优先级 = env（DSH_WEB_SEARCH_ROUTER_MODE，仅接受合法枚举）> 热 JSON（热改即生效）> patch。
 * 读路径 = ~/.dsh/dsh-search-router.json —— 已列入乙程序只读清单（U13-②，第 16/17 轮落账）。
 */
const MODES = ["auto", "official", "local"];
export function searchRouterModeShadow({ envMode, hot }) {
  if (typeof envMode === "string" && MODES.includes(envMode)) {
    return { value: envMode, source: "环境变量 DSH_WEB_SEARCH_ROUTER_MODE（重启前固定）" };
  }
  if (hot && typeof hot === "object" && typeof hot.mode === "string" && MODES.includes(hot.mode)) {
    return { value: hot.mode, source: "热 JSON ~/.dsh/dsh-search-router.json（热改即生效，无需重启）" };
  }
  return { value: null, source: "patch cordis.patch.yml（重启生效）" };
}

/**
 * P2.3 每卡配置面板元数据（设计稿 p23-design.md §一范围收敛）：
 *   - rate-throttle：唯一可写（18 白名单字段，§八）；生效值 = patch（§八已钉死无遮蔽）。
 *   - search-router：mode 只读展示「生效值 + 来源」（第 15 轮方案 1 —— 热 JSON 现有
 *     mode 键，patch 编辑无效；写热 JSON 属红线，列 P2.5 候选）。
 *   - agent-memory / compact-router / web-search-local：插件 config 无 enabled 键且
 *     源码不读 ⇒ 「无内部开关」，无可写入口。
 */
/**
 * W2 余件（断点修复批②的 W2 半边）：四卡"改完要重启"提示位。
 * rate-throttle 早有 effectNote（可写参数框内渲染），其余四卡此前**零说明位**
 * （断点取证：panel/docs/evidence/BREAKPOINT-FORENSICS-20260923.md——"重载"列
 * 恒不可达是设计，但用户视角无提示）。文案按各卡**真实配置来源**逐卡给词，
 * 不许一串通抄：agent-memory／web-search-local／search-router 三行的 config 块
 * 实测在 cordis.patch.yml（2026-09-26 复算）；compact-router 无 patch 行、预设托管。
 */
const RESTART_EFFECT_NOTE = {
  "agent-memory": "本卡没有面板配置入口；配置在 cordis.patch.yml 的 agent-memory-runtime 行里，改完要重启 DSH 才生效。",
  "compact-router": "本卡没有面板配置入口；配置由预设托管（apply-preset-patch.mjs 维护），预设的改动要重启 DSH 才生效。",
  "web-search-local": "本卡没有面板配置入口；配置在 cordis.patch.yml 的 web-search-local 行里，改完要重启 DSH 才生效。",
};

export function buildConfigPanel(dir, rowId, patchText, { hotRouterPath, envMode } = {}) {
  if (dir === "rate-throttle") {
    const scalars = rowId ? parseConfigScalars(patchText, rowId) : { top: {}, routing: {} };
    return {
      editable: true,
      rowId,
      values: { ...scalars.top, routing: scalars.routing },
      effectNote: "改的是配置文件里的值：重启 DSH 后生效；当前没有别的配置来源会盖住这些值（§八已逐字段钉死）。",
    };
  }
  if (dir === "search-router") {
    const hot = loadJson(hotRouterPath);
    return {
      editable: false,
      rowId,
      mode: searchRouterModeShadow({ envMode, hot }),
      note: "本面板不提供 mode 编辑（判定侧第 15 轮方案 1：热 JSON 已有 mode 键，patch 编辑会被它盖住）。需调整请编辑 ~/.dsh/dsh-search-router.json（热改即生效）。",
      effectNote: "mode：热 JSON 热改即生效（无需重启）；patch 行改动要重启 DSH 才生效，且热 JSON 在场时会被它盖住。",
    };
  }
  // 严格映射：不在表内的目录不发明通用文案（缺席就是缺席，如实不下发）。
  return { editable: false, noInternalSwitch: true, effectNote: RESTART_EFFECT_NOTE[dir] };
}

/**
 * F-73 产品级（C1-007 开工令 2）：软卸载**收据**（只读）——四问四答（什么时候卸的／卸了什么／
 * 本体存哪／怎么恢复），数据全部来自 custody 软台账现成记录（uninstall.mjs 两写入形状：
 * patch 行 ／ preset --undo），**服务端组好逐行文案**（循 RESTART_EFFECT_NOTE 先例：服务端权威、
 * 恢复弹窗双通道只渲染不加字）；不加接口、不动引擎。导出循 buildConfigPanel 先例（工装取数）。
 */
export function buildSoftReceipt(record, dir, ledgerKey) {
  if (!record) return null;
  const lines = [];
  lines.push("卸载时间：" + (record.recordedAt || "（台账未记）"));
  if (record.presetUndo) {
    lines.push("卸载内容：预设托管入口已按 --undo 退出（双层留痕在案）。");
  } else {
    let content = "卸载内容：配置行「" + ledgerKey + "」已从 cordis.patch.yml 摘除（行块原文与插回位置已留档）";
    if (record.hostKey && record.hostKey.key) content += "；系统设置项「" + record.hostKey.key + "」的卸载前值已备份";
    lines.push(content + "。");
  }
  let place = "本体位置：lib/" + dir + "（源代码文件未动）";
  const backup = record.backupDir || record.evidenceBackupDir;
  if (backup) place += "；改动前备份：" + backup;
  lines.push(place + "。");
  lines.push("恢复方式：确认后按台账插回原位，卸载时改动的系统设置项一并恢复；完成后需重启生效。");
  if (record.userReason) lines.push("卸载原因：" + record.userReason);
  return { recordedAt: record.recordedAt || null, lines };
}

export async function buildSnapshot({ toolkitRoot, hotRouterPath = join(homedir(), ".dsh", "dsh-search-router.json"), envMode = process.env.DSH_WEB_SEARCH_ROUTER_MODE } = {}) {
  const pkg = loadJson(join(toolkitRoot, "package.json")) || {};
  const suiteManifest = loadJson(join(toolkitRoot, "dsh.plugin.json")) || {};
  const patchPath = join(toolkitRoot, "cordis.patch.yml");
  const patchText = readFileSync(patchPath, "utf8");
  const rows = parseRootRows(patchText);
  const presetState = presetPatchedAny(toolkitRoot);

  // P2.4：登记表枚举（不是 readdirSync）—— 真卸载后本体已删，卡片仍须渲染（五卡渲染硬断言）。
  const custodyEntries = listCustody(toolkitRoot);
  // 第一遍：原始缺席态（六态基础判定；依赖修饰态需全局视口，故分两遍）
  const rawByDir = {};
  for (const dir of Object.keys(PLUGINS)) {
    const meta = PLUGINS[dir];
    const manifestPath = join(toolkitRoot, "lib", dir, "dsh.plugin.json");
    const bodyPresent = existsSync(manifestPath);
    const patchRow = meta.rowId ? rows.find((r) => r.id === meta.rowId) : undefined;
    const softRecord = meta.rowId ? getSoftRecord(toolkitRoot, meta.rowId) : getSoftRecord(toolkitRoot, dir);
    const receiptOnFile = custodyEntries.some(
      (e) => e.plugin === dir && (e.kind === "true-uninstall-receipt" || e.kind === "true-uninstall"),
    );
    rawByDir[dir] = {
      meta,
      bodyPresent,
      bodyStats: dirStats(join(toolkitRoot, "lib", dir)),
      patchRow: patchRow || null,
      softRecord,
      receiptOnFile,
      status: determineAbsenceState({
        dir,
        meta,
        bodyPresent,
        rowPresent: !!patchRow,
        softRecord,
        receiptOnFile,
        presetState,
      }),
    };
  }
  const statusByDir = {};
  for (const dir of Object.keys(rawByDir)) statusByDir[dir] = rawByDir[dir].status;

  // 第二遍：出卡（依赖修饰态在此换算——依赖缺席 ⇒ dependency-broken）
  const plugins = [];
  for (const dir of Object.keys(PLUGINS)) {
    const raw = rawByDir[dir];
    const meta = raw.meta;
    const manifestPath = join(toolkitRoot, "lib", dir, "dsh.plugin.json");
    const manifest = raw.bodyPresent ? loadJson(manifestPath) : null;
    let status = raw.status;
    const mounted = status === "mounted";

    // 联动感知：依赖插件本体缺席 ⇒ dependency-broken（本体挂载事实保留在 mounted 字段）
    // 守卫（D-UI-02）：dependency-broken 是 **mounted 的修饰态**——本体自己已缺席
    // （soft-unmounted / true-uninstalled / installed-unmounted / dangling-mount）时
    // 不得被依赖缺席覆盖，否则「可一键恢复」的真卸载态会被误报成「已加载」。
    let dependency = null;
    if (mounted) {
      for (const dep of DEPENDENCIES) {
        if (dep.plugin !== dir) continue;
        const requires = dep.requires;
        const depRaw = rawByDir[requires];
        if (depRaw && !depRaw.bodyPresent) {
          status = "dependency-broken";
          dependency = { requires, note: dep.note, requiresState: statusByDir[requires] };
        }
      }
    }

    plugins.push({
      dir,
      name: (manifest && manifest.name) || meta.pkg,
      bodyPresent: raw.bodyPresent,
      bodyStats: raw.bodyStats,
      origin: (ORIGINS[dir] || { origin: "unknown" }).origin,
      upstream: (ORIGINS[dir] || {}).upstream || null,
      author: (ORIGINS[dir] || {}).author || null,
      license: (ORIGINS[dir] || {}).license || null,
      note: (ORIGINS[dir] || {}).note || null,
      entry: manifest && manifest.requirements && manifest.requirements.exports,
      inject: (manifest && (manifest.requirements || {}).registers || {}).inject || [],
      // 提供面挂提供面键（改名批，§20.2 对照表）；events 甲案顶层平铺（数据源不动）；inject 键名不改、
      // 取数源改 registers.inject（inject 修法笔：requirements 顶层从未有声明＝B 型缺口，归因见计划 §30.b；
      // 守卫形同 events 槽与 doctor engine.mjs 同位读法）。
      provides: extractRegisters(manifest) || {},
      events: (manifest && (manifest.requirements || {}).registers || {}).events || [],
      managedBy: raw.patchRow ? "patch" : meta.managedBy === "preset" ? "preset-script" : "none",
      enabled: raw.patchRow ? raw.patchRow.enabled : meta.managedBy === "preset" ? presetState.patched : false,
      patchRow: raw.patchRow,
      // ---- P2.4 缺席态（六态）----
      status,
      statusCopy: status === "dependency-broken" ? (dependency && dependency.note) || "依赖缺失" : ABSENCE_COPY[status],
      mounted,
      // 收据在案（销毁式 v2）：真卸载对账账本，亦为「重装后挂载」的行块事实来源
      receiptOnFile: raw.receiptOnFile,
      softRecorded: !!raw.softRecord,
      // F-73：软卸载收据（只读；null＝无台账记录，弹窗侧 fail-soft 不渲染）
      softReceipt: buildSoftReceipt(raw.softRecord, dir, meta.rowId || dir),
      dependency,
      defaultUninstallMode: meta.defaultMode,
      // 恢复（**软卸载专有**）：本体在、行不在、面板台账在案 ⇒ 一键恢复
      restoreAvailable: status === "soft-unmounted",
      // 挂载（**重装后**）：本体在、行不在、无面板台账；patch 插件需收据提供行块事实，
      // 预设插件（compact-router）凭重新 apply 预设即可，无需收据。
      canMount:
        status === "installed-unmounted" &&
        raw.bodyPresent &&
        (meta.managedBy === "preset" || raw.receiptOnFile),
      // ---- P2.3 配置编辑（卸载态隐藏多余操作，状态照常渲染）----
      configPanel: mounted
        ? buildConfigPanel(dir, raw.patchRow ? raw.patchRow.id : null, patchText, { hotRouterPath, envMode })
        : { editable: false, hiddenForAbsence: true },
    });
  }

  const webRow = rows.find((r) => r.id === "web") || null;
  const panelRow = rows.find((r) => r.id === "toolkit-manager") || null;

  return {
    generatedAt: new Date().toISOString(),
    toolkitRoot,
    toolkitName: pkg.name || null,
    toolkitVersion: pkg.version || null,
    self: {
      id: "toolkit-manager",
      name: (panelRow && panelRow.name) || "@local/dsh-toolkit/panel",
      managedBy: panelRow ? "patch" : "unmounted",
      enabled: !!(panelRow && panelRow.enabled),
    },
    aliases: suiteManifest.aliases || {},
    exports: pkg.exports || {},
    patch: {
      path: patchPath,
      text: patchText,
      rows,
      webRow,
    },
    custody: {
      root: custodyRoot(toolkitRoot),
      entries: custodyEntries,
      presetState: presetState.all,
    },
    plugins,
  };
}
