import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { buildSnapshot } from "./manager/snapshot.mjs";
import { runDoctorDryRun } from "./manager/doctor-runner.mjs";

export const name = "toolkit-manager";
export const inject = ["webServer"];

function panelRoot() {
  return dirname(fileURLToPath(import.meta.url));
}

function defaultToolkitRoot() {
  return resolve(panelRoot(), "..");
}

function isLoopbackAddress(address) {
  if (typeof address !== "string") return false;
  if (address.startsWith("::ffff:")) address = address.slice(7);
  if (address.startsWith("[") && address.endsWith("]")) address = address.slice(1, -1);
  return address === "127.0.0.1" || address === "::1";
}

function readCookie(header, name) {
  if (typeof header !== "string") return undefined;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}

function hostnameOf(request) {
  const host = request.headers && request.headers.host;
  if (typeof host !== "string") return undefined;
  try {
    return new URL("http://" + host).hostname;
  } catch {
    return undefined;
  }
}

function isLoopbackHost(request) {
  const hostname = hostnameOf(request);
  return hostname !== undefined && isLoopbackAddress(hostname);
}

function pairedByRemoteService(ctx, request) {
  try {
    if (typeof ctx.get !== "function") return undefined;
    const service = ctx.get("remoteWebUiPairing");
    if (service && typeof service.isPairedDevice === "function") {
      return service.isPairedDevice(request) === true;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

// P2.0② 写操作专用配对校验：**只认 remoteWebUiPairing 服务**，禁止任何 fallback。
// 语义（三值）：
//   true      —— 服务在场且判定为已配对 → 放行
//   false     —— 服务在场且判定为未配对 → 拒绝
//   undefined —— 服务不在场/不可用     → **拒绝**（fail-closed）
// 与只读路径的区别：只读允许退到 devicesFile hasOwn 兜底，写操作不允许 ——
// hasOwn 只反映"文件里存在该 key"，不反映内存态（revoke/stop/idle 都不体现），
// 对写操作而言强度不足。
function pairedByServiceStrict(ctx, request) {
  return pairedByRemoteService(ctx, request) === true;
}

function pairedByDevicesFile(devicesFile, request) {
  try {
    const deviceId = readCookie(request.headers && request.headers.cookie, "dsh_pair");
    if (deviceId === undefined || deviceId === "") return false;
    const payload = JSON.parse(readFileSync(devicesFile, "utf8"));
    return Object.prototype.hasOwnProperty.call(payload, deviceId);
  } catch {
    return false;
  }
}

function defaultDevicesFile() {
  return join(homedir(), ".dsh", "remote-web-ui-devices.json");
}

function isSafeStateChange(request) {
  const site = request.headers && request.headers["sec-fetch-site"];
  if (site === "cross-site") return false;
  const origin = request.headers && request.headers.origin;
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === new URL("http://" + (request.headers.host || "")).host;
  } catch {
    return false;
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

export function apply(ctx, config = {}) {
  const toolkitRoot = resolve(config.toolkitRoot || defaultToolkitRoot());
  const doctorCli = resolve(config.doctorCli || "D:/dsh-test-sandbox/projects/doctor/src/cli.mjs");
  const devicesFile = resolve(config.devicesFile || process.env.TOOLKIT_PANEL_DEVICES_FILE || defaultDevicesFile());
  const uiHtml = readFileSync(join(panelRoot(), "client", "panel.html"), "utf8");

  // 只读路径：loopback socket AND (Host loopback OR 配对校验)。
  // 配对允许 fallback 到 devicesFile hasOwn（服务缺失时的 fail-closed 兜底）。
  const isAllowedRead = (request) => {
    if (!isLoopbackAddress(request.socket && request.socket.remoteAddress)) return false;
    if (isLoopbackHost(request)) return true;
    const paired = pairedByRemoteService(ctx, request);
    if (paired === true) return true;
    if (paired === false) return false;
    return pairedByDevicesFile(devicesFile, request);
  };

  // 写路径（P2.0②）：loopback socket AND (Host loopback OR **服务校验**)。
  // 配对**必须走 remoteWebUiPairing 服务**，服务缺失/异常一律拒绝，**不做 hasOwn 兜底**。
  const isAllowedWrite = (request) => {
    if (!isLoopbackAddress(request.socket && request.socket.remoteAddress)) return false;
    if (isLoopbackHost(request)) return true;
    return pairedByServiceStrict(ctx, request);
  };

  // 原 isAllowed 保留为只读语义的别名，避免既有调用点语义漂移。
  const isAllowed = isAllowedRead;

  const guard = (handler, options = {}) => async (request, response) => {
    const isWrite = options.change === true;
    if (isWrite) {
      if (!isAllowedWrite(request)) {
        sendJson(response, 403, { ok: false, error: "forbidden: write requires paired device (service-checked)" });
        return;
      }
      if (!isSafeStateChange(request)) {
        sendJson(response, 403, { ok: false, error: "forbidden: cross-site request" });
        return;
      }
    } else if (!isAllowedRead(request)) {
      sendJson(response, 403, { ok: false, error: "forbidden" });
      return;
    }
    try {
      await handler(request, response);
    } catch (error) {
      sendJson(response, 500, { ok: false, error: String(error && error.message || error) });
    }
  };

  const routes = [
    {
      kind: "exact",
      path: "/api/toolkit-panel/ui",
      handler: guard(async (request, response) => {
        if (request.method !== "GET") {
          response.writeHead(405, { allow: "GET" });
          response.end();
          return;
        }
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        response.end(uiHtml);
      }),
    },
    {
      kind: "exact",
      path: "/api/toolkit-panel/snapshot",
      handler: guard(async (request, response) => {
        if (request.method !== "GET") {
          response.writeHead(405, { allow: "GET" });
          response.end();
          return;
        }
        sendJson(response, 200, { ok: true, snapshot: await buildSnapshot({ toolkitRoot }) });
      }),
    },
    {
      kind: "exact",
      path: "/api/toolkit-panel/doctor/dry-run",
      handler: guard(async (request, response) => {
        if (request.method !== "POST") {
          response.writeHead(405, { allow: "POST" });
          response.end();
          return;
        }
        const result = await runDoctorDryRun({ cliPath: doctorCli, scopeRoot: toolkitRoot });
        sendJson(response, result.ok ? 200 : 500, result);
      }, { change: true }),
    },
  ];

  ctx.effect(() => {
    const unregister = routes.map((route) => ctx.webServer.register(route));
    return () => {
      for (const fn of unregister) {
        try {
          fn();
        } catch {
          // noop
        }
      }
    };
  });
}
