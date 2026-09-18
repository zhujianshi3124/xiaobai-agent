import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

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

function parseRootRows(patchText) {
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

export async function buildSnapshot({ toolkitRoot }) {
  const pkg = loadJson(join(toolkitRoot, "package.json")) || {};
  const suiteManifest = loadJson(join(toolkitRoot, "dsh.plugin.json")) || {};
  const patchPath = join(toolkitRoot, "cordis.patch.yml");
  const patchText = readFileSync(patchPath, "utf8");
  const rows = parseRootRows(patchText);

  const plugins = [];
  const libRoot = join(toolkitRoot, "lib");
  for (const dir of readdirSync(libRoot)) {
    const manifestPath = join(libRoot, dir, "dsh.plugin.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = loadJson(manifestPath);
    if (!manifest) continue;
    const req = (manifest.requirements && manifest.requirements.registers) || {};
    const rowId = ROW_IDS[dir] || dir;
    const patchRow = rowId ? rows.find((r) => r.id === rowId) : undefined;
    plugins.push({
      dir,
      name: manifest.name,
      origin: (ORIGINS[dir] || { origin: "unknown" }).origin,
      upstream: (ORIGINS[dir] || {}).upstream || null,
      author: (ORIGINS[dir] || {}).author || null,
      license: (ORIGINS[dir] || {}).license || null,
      note: (ORIGINS[dir] || {}).note || null,
      entry: manifest.requirements && manifest.requirements.exports,
      inject: Array.isArray(req.inject) ? req.inject : [],
      registers: {
        events: req.events || [],
        services: req.services || [],
        commands: req.commands || [],
        providers: req.providers || [],
      },
      managedBy: patchRow ? "patch" : dir === "compact-router" ? "preset-script" : "none",
      enabled: patchRow ? patchRow.enabled : dir === "compact-router" ? "compact-router 由 scripts/apply-preset-patch.mjs 管理，不在 cordis.patch.yml" : false,
      patchRow: patchRow || null,
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
    plugins,
  };
}
