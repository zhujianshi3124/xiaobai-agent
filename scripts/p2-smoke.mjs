#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
const pathLike = name.startsWith(".") || name.startsWith("file:") || isAbsolute(name);
check("row name is path-like", pathLike, name);
check("row name is file URL", name.startsWith("file:"), name);

function nearestPackage(moduleUrl, expectedPackageName) {
  if (!moduleUrl.startsWith("file:")) return null;
  let current = dirname(fileURLToPath(moduleUrl));
  for (;;) {
    const pkgPath = join(current, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        if (typeof pkg.name === "string" && (expectedPackageName === undefined || pkg.name === expectedPackageName)) {
          return { pkgPath, pkg, dir: current };
        }
      } catch { /* skip malformed */ }
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function exactPackageSpecifier(loaderName) {
  const parts = loaderName.split("/");
  if (parts.length === 2 && parts[0].startsWith("@") && parts[0].length > 1 && parts[1]) return loaderName;
  if (parts.length === 1 && parts[0]) return loaderName;
  return undefined;
}

function locatePkgJson(loaderName, baseUrl) {
  const pathLike = loaderName.startsWith(".") || loaderName.startsWith("file:") || isAbsolute(loaderName);
  const expectedPackageName = pathLike ? undefined : exactPackageSpecifier(loaderName);
  if (!pathLike && expectedPackageName === undefined) return null;
  let moduleUrl;
  if (loaderName.startsWith("file:")) {
    moduleUrl = loaderName;
  } else if (pathLike) {
    moduleUrl = pathToFileURL(resolve(baseUrl || root, loaderName)).href;
  } else {
    return null;
  }
  return nearestPackage(moduleUrl, expectedPackageName);
}

const located = locatePkgJson(name, root);
check("locatePkgJson finds nearest package.json", !!located, located ? located.pkgPath : "null");
if (!located) {
  console.log("RESULT passed=" + passed + " failed=" + failed);
  process.exit(1);
}
check("nearest package is panel/package.json", located.dir === join(root, "panel"), located.pkgPath);
check("package name @local/dsh-toolkit/panel", located.pkg.name === "@local/dsh-toolkit/panel", located.pkg.name);

const dsh = located.pkg.dsh || {};
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

const clientRel = clientExportOf(located.pkg.exports);
check("exports[./client] is string", typeof clientRel === "string", String(clientRel));
const bundlePath = join(located.dir, clientRel || "");
check("client bundle exists", !!clientRel && existsSync(bundlePath), bundlePath);
if (clientRel && existsSync(bundlePath)) {
  const clientSrc = readFileSync(bundlePath, "utf8");
  check("bundle uses ModuleLoader.load", clientSrc.includes("window.__ModuleLoader__.load({"), "");
  check("bundle id matches package name", clientSrc.includes(JSON.stringify(located.pkg.name)), located.pkg.name);
  check("bundle injects settings.plugins.tab", clientSrc.includes("settings.plugins.tab"), "");
  check("bundle exports apply", /\bexports\.apply\b/.test(clientSrc), "");
}

console.log("RESULT passed=" + passed + " failed=" + failed);
if (failed > 0) process.exit(1);
