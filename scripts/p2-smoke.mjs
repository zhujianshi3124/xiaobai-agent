#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const patchFile = join(root, "cordis.patch.yml");
const patchText = readFileSync(patchFile, "utf8");

let passed = 0;
let failed = 0;
function check(label, ok, detail) {
  if (ok) { passed += 1; console.log("PASS " + label + (detail ? " — " + detail : "")); }
  else { failed += 1; console.log("FAIL " + label + (detail ? " — " + detail : "")); }
}

function extractToolkitRow(text) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const idMatch = lines[i].match(/^\s*-\s*id:\s*toolkit-manager\s*$/);
    if (!idMatch) continue;
    const row = { id: "toolkit-manager", name: null, disabled: false };
    let baseIndent = (lines[i].match(/^\s*/) || [""])[0].length;
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j];
      if (/^\s*-/.test(line) && (line.match(/^\s*/) || [""])[0].length <= baseIndent) break;
      const nameMatch = line.match(/^\s*name:\s*(.+?)\s*$/);
      if (nameMatch) row.name = nameMatch[1].replace(/^['"]|['"]$/g, "");
      const disMatch = line.match(/^\s*disabled:\s*(.+?)\s*$/);
      if (disMatch) row.disabled = /^(true|yes)$/i.test(disMatch[1]);
    }
    return row;
  }
  return null;
}

const row = extractToolkitRow(patchText);
check("patch has toolkit-manager row", !!row, row ? row.name : "row not found");
if (!row) {
  console.log("RESULT passed=" + passed + " failed=" + failed);
  process.exit(1);
}
check("toolkit-manager not disabled", !row.disabled, String(row.disabled));
const name = row.name || "";
// S2.e（C1-007 案②，2026-10-01）：patch 模板化——toolkit-manager 行 name 用占位符（部署填空），
// 机器绝对路径清零。断言面如实适配模板形：占位符正向钉＋机器路径反向钉。原 path-like/file URL
// 断言与 locatePkgJson 解析链钉的是部署实况（该对象随模板化不复存在），由直读 panel 包取代——
// 断言对象更换、断言强度不减。
const PLACEHOLDER_RE = /^<[A-Z][A-Z0-9_]*>$/;
check("row name is placeholder (template form)", PLACEHOLDER_RE.test(name), name);
check("row name carries NO machine-absolute path", !name.startsWith("file:") && !isAbsolute(name) && !name.startsWith("."), name);

const panelDir = join(root, "panel");
const panelPkgPath = join(panelDir, "package.json");
const panelPkg = JSON.parse(readFileSync(panelPkgPath, "utf8"));
check("panel package.json exists (template form: direct read)", existsSync(panelPkgPath), panelPkgPath);
check("nearest package is panel/package.json", existsSync(join(panelDir, "index.js")), panelPkg.name);
check("package name dsh-toolkit/panel", panelPkg.name === "dsh-toolkit/panel", panelPkg.name);

const dsh = panelPkg.dsh || {};
const clientDecl = dsh.client;
check("dsh.client is object", !!clientDecl && typeof clientDecl === "object" && !Array.isArray(clientDecl), JSON.stringify(clientDecl));
check("dsh.client.platform is string", typeof (clientDecl && clientDecl.platform) === "string", String(clientDecl && clientDecl.platform));
check("dsh.client.platform is web", clientDecl && clientDecl.platform === "web", String(clientDecl && clientDecl.platform));

function clientExportOf(pkgExports) {
  if (!pkgExports || typeof pkgExports !== "object") return null;
  const client = pkgExports["./client"];
  if (typeof client === "string") return client;
  if (client && typeof client === "object" && typeof client.default === "string") return client.default;
  return null;
}

const clientRel = clientExportOf(panelPkg.exports);
check("exports[./client] is string", typeof clientRel === "string", String(clientRel));
const bundlePath = join(panelDir, clientRel || "");
check("client bundle exists", !!clientRel && existsSync(bundlePath), bundlePath);
if (clientRel && existsSync(bundlePath)) {
  const clientSrc = readFileSync(bundlePath, "utf8");
  check("bundle uses ModuleLoader.load", clientSrc.includes("window.__ModuleLoader__.load({"), "");
  check("bundle id matches package name", clientSrc.includes(JSON.stringify(panelPkg.name)), panelPkg.name);
  check("bundle injects settings.plugins.tab", clientSrc.includes("settings.plugins.tab"), "");
  check("bundle exports apply", /\bexports\.apply\b/.test(clientSrc), "");
}

console.log("RESULT passed=" + passed + " failed=" + failed);
if (failed > 0) process.exit(1);
