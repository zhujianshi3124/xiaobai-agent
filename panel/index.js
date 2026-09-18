import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { buildSnapshot } from "./manager/snapshot.mjs";
import { runDoctorDryRun } from "./manager/doctor-runner.mjs";
import {
  createPlan,
  createTogglePlan,
  createConfigPlan,
  executePlan,
  putPlan,
  getPlan,
  PlanError,
} from "./manager/apply-engine.mjs";
import {
  createSoftUninstallPlan,
  createTrueUninstallPlan,
  createSoftRestorePlan,
  createPresetRestorePlan,
  createMountPlan,
  executeSoftUninstall,
  executeTrueUninstall,
  executePresetSoftUninstall,
  executePresetTrueUninstall,
  executeSoftRestore,
  executePresetRestore,
  executeMount,
  executeMountPreset,
} from "./manager/uninstall.mjs";
import { listCustody, getSoftRecord } from "./manager/custody.mjs";
import { PLUGINS, assertUninstallable } from "./manager/plugin-registry.mjs";
import {
  CONFIG_WHITELIST,
  CONFIG_EDITABLE_ROW,
  validateConfigValue,
  checkCrossField,
} from "./manager/config-whitelist.mjs";

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

/** 读取请求体并解析 JSON。上限 64 KiB，防大体积注入。 */
function readJsonBody(request, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new PlanError("body-too-large", "请求体过大（上限 64 KiB）"));
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (raw === "") {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        resolve(parsed && typeof parsed === "object" ? parsed : {});
      } catch {
        reject(new PlanError("body-invalid-json", "请求体不是合法 JSON"));
      }
    });
    request.on("error", (error) => reject(error));
  });
}

const PLAN_ERROR_STATUS = {
  "plan-not-found": 404,
  "plan-expired": 409,
  "sha-conflict": 409,
  "anchor-missing": 400,
  "anchor-ambiguous": 409,
  "anchor-invalid": 400,
  "anchor-moved": 409,
  "target-missing": 400,
  "body-too-large": 413,
  "body-invalid-json": 400,
  "value-invalid": 400,
  "value-not-whitelisted": 400,
  // Q1 安全闸：现有 disabled 是条件表达式（如 `!!js ...`），不予改写 → 400
  "value-not-literal": 400,
  // ---------- P2.4 卸载/恢复 ----------
  "plugin-unknown": 400,
  "self-uninstall-forbidden": 400,
  "row-block-not-found": 400,
  "row-block-multiple": 409,
  "host-key-occupied": 409,
  "host-key-conflict": 409,
  "custody-id-invalid": 400,
  "custody-not-found": 404,
  "custody-verify-failed": 409,
  "restore-verify-failed": 409,
  "soft-record-missing": 400,
  "confirm-missing": 400,
  "mode-invalid": 400,
  "preset-state-missing": 409,
  "preset-backup-missing": 409,
  "preset-script-missing": 500,
  "body-missing": 400,
  "body-delete-failed": 500,
};

function planErrorStatus(code) {
  return PLAN_ERROR_STATUS[code] || 400;
}

function loadJsonSafe(abs) {
  try {
    return JSON.parse(readFileSync(abs, "utf8"));
  } catch {
    return null;
  }
}

export function apply(ctx, config = {}) {
  const toolkitRoot = resolve(config.toolkitRoot || defaultToolkitRoot());
  const doctorCli = resolve(config.doctorCli || "D:/dsh-test-sandbox/projects/doctor/src/cli.mjs");
  const devicesFile = resolve(config.devicesFile || process.env.TOOLKIT_PANEL_DEVICES_FILE || defaultDevicesFile());
  // 写前备份根目录（P2.1）。默认放插件仓下的 .panel-backups/ 之外，避免与人工备份混淆。
  const backupRoot = resolve(config.backupRoot || process.env.TOOLKIT_PANEL_BACKUP_ROOT || join(toolkitRoot, ".panel-write-backups"));
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
    // ---------- P2.1 两段式框架 ----------
    // plan 路由：只读计算，返回 diff 预览 / 期望 SHA / 有效期。**不落盘**。
    {
      kind: "exact",
      path: "/api/toolkit-panel/plan",
      handler: guard(async (request, response) => {
        if (request.method !== "POST") {
          response.writeHead(405, { allow: "POST" });
          response.end();
          return;
        }
        try {
          const body = await readJsonBody(request);
          const target = String(body.target || "patch");
          const file = target === "patch" ? join(toolkitRoot, "cordis.patch.yml") : String(body.file || "");
          const plan = createPlan({
            file,
            rowId: String(body.rowId || ""),
            key: String(body.key || ""),
            value: body.value === undefined ? "" : body.value,
            backupRoot,
            reason: "panel-plan",
            note: String(body.rowId || "") + "." + String(body.key || "") + " = " + String(body.value === undefined ? "" : body.value),
          });
          putPlan(plan);
          // plan 的 nextText 不下发（客户端无需持有全文），避免暴露内部实现细节。
          sendJson(response, 200, {
            ok: true,
            plan: {
              token: plan.token,
              file: plan.file,
              rowId: plan.rowId,
              key: plan.key,
              value: plan.value,
              changed: plan.changed,
              anchorLine: plan.anchorLine,
              diff: plan.diff,
              expectedSha: plan.expectedSha,
              nextSha: plan.nextSha,
              createdAt: plan.createdAt,
              expiresAt: plan.expiresAt,
            },
          });
        } catch (error) {
          const code = error instanceof PlanError ? error.code : "internal";
          sendJson(response, planErrorStatus(code), { ok: false, code, error: String(error && error.message || error) });
        }
      }, { change: true }),
    },
    // ---------- P2.2 启停开关 ----------
    // 与通用 plan 分开的原因：启停有**额外前置检查**（停用前交叉引用扫描），
    // 且需要把「双层开关」中的哪一层被改明确告诉客户端，避免与插件内部
    // config.enabled 混淆。底层仍复用同一套 plan/execute 两段式与备份机制。
    {
      kind: "exact",
      path: "/api/toolkit-panel/toggle/plan",
      handler: guard(async (request, response) => {
        if (request.method !== "POST") {
          response.writeHead(405, { allow: "POST" });
          response.end();
          return;
        }
        try {
          const body = await readJsonBody(request);
          const rowId = String(body.rowId || "");
          if (typeof body.enabled !== "boolean") {
            throw new PlanError("value-invalid", "启停值必须是布尔（true / false）");
          }
          const plan = createTogglePlan({
            file: join(toolkitRoot, "cordis.patch.yml"),
            rowId,
            enabled: body.enabled,
            backupRoot,
            alsoMatch: Array.isArray(body.alsoMatch) ? body.alsoMatch : [],
            // 修复「manifest reason/note 恒为 null」：写前备份必须自解释该恢复点
            // 对应哪一次操作，否则回滚时无法判断备份用途。
            reason: "panel-toggle",
            note: rowId + (body.enabled ? " 启用" : " 停用")
              + "（patch-row.disabled = " + (body.enabled ? "false" : "true") + "）",
          });
          putPlan(plan);
          sendJson(response, 200, {
            ok: true,
            plan: {
              token: plan.token,
              kind: plan.kind,
              file: plan.file,
              rowId: plan.rowId,
              // 明确告知改的是**哪一层**：patch 行的 disabled（配置层），
              // 不是插件内部 config.enabled。双层不得混淆呈现。
              layer: "patch-row.disabled",
              targetEnabled: plan.targetEnabled,
              changed: plan.changed,
              anchorLine: plan.anchorLine,
              diff: plan.diff,
              crossRefs: plan.crossRefs,
              expectedSha: plan.expectedSha,
              nextSha: plan.nextSha,
              createdAt: plan.createdAt,
              expiresAt: plan.expiresAt,
            },
          });
        } catch (error) {
          const code = error instanceof PlanError ? error.code : "internal";
          sendJson(response, planErrorStatus(code), { ok: false, code, error: String(error && error.message || error) });
        }
      }, { change: true }),
    },
    // ---------- P2.3 配置编辑（判定侧第 19 轮批准的设计稿 p23-design.md）----------
    // 白名单标量编辑：仅 rate-throttle（CONFIG_EDITABLE_ROW）、仅 18 个白名单字段、
    // 仅标量（布尔/数值）。服务端权威校验（不信任前端）：类型 / 范围 / 跨字段
    // （maxIntervalMs ≥ minIntervalMs，读当前 patch 值）/ 拒绝换行与 YAML 结构字符。
    // 生效路径已钉死（设计稿 §八）：18/18 = patch 激活快照 ⇒ 重启 dsh web 生效，无遮蔽。
    {
      kind: "exact",
      path: "/api/toolkit-panel/config/plan",
      handler: guard(async (request, response) => {
        if (request.method !== "POST") {
          response.writeHead(405, { allow: "POST" });
          response.end();
          return;
        }
        try {
          const body = await readJsonBody(request);
          const rowId = String(body.rowId || "");
          const path = String(body.path || "");
          if (rowId !== CONFIG_EDITABLE_ROW) {
            throw new PlanError("row-not-editable", "该插件没有开放参数编辑（可编辑仅限 " + CONFIG_EDITABLE_ROW + "）");
          }
          const check = validateConfigValue(path, body.value);
          if (!check.ok) {
            throw new PlanError("value-invalid", check.error);
          }
          // 跨字段校验：需要当前 patch 里的 minIntervalMs（现读，不缓存）
          if (path === "maxIntervalMs") {
            const { readFileSync: rf } = await import("node:fs");
            const patchText = rf(join(toolkitRoot, "cordis.patch.yml"), "utf8");
            const { parseConfigScalars } = await import("./manager/snapshot.mjs");
            const scalars = parseConfigScalars(patchText, rowId);
            const raw = scalars.top.minIntervalMs;
            const currentMin = raw !== undefined && Number.isFinite(Number(raw)) ? Number(raw) : null;
            const cross = checkCrossField(check.value, currentMin);
            if (!cross.ok) {
              throw new PlanError("value-invalid", cross.error);
            }
          }
          const plan = createConfigPlan({
            file: join(toolkitRoot, "cordis.patch.yml"),
            rowId,
            path,
            value: check.value,
            backupRoot,
            reason: "panel-config-edit",
            note: rowId + "." + path + " = " + String(check.value) + "（P2.3 配置编辑）",
          });
          putPlan(plan);
          sendJson(response, 200, {
            ok: true,
            plan: {
              token: plan.token,
              kind: plan.kind,
              file: plan.file,
              rowId: plan.rowId,
              path: plan.key,
              value: plan.value,
              changed: plan.changed,
              anchorLine: plan.anchorLine,
              targetLine: plan.targetLine,
              diff: plan.diff,
              expectedSha: plan.expectedSha,
              nextSha: plan.nextSha,
              createdAt: plan.createdAt,
              expiresAt: plan.expiresAt,
              // 生效时机（人话，按插件分述 —— 设计稿 §四）：
              effectNote: "改的是配置文件里的值：重启 DSH 后生效；当前没有别的配置来源会盖住它。",
            },
          });
        } catch (error) {
          const code = error instanceof PlanError ? error.code : "internal";
          sendJson(response, planErrorStatus(code), { ok: false, code, error: String(error && error.message || error) });
        }
      }, { change: true }),
    },
    // ---------- P2.4 卸载/恢复（施工批 1，p24-design.md §7.2 API 草案）----------
    // 四条路由全部走既有 guard：写路由 = {change:true} + 严格配对 + CSRF（isSafeStateChange）。
    // cordis.patch.yml 的一切写入仍由 executePlan 唯一落盘；保管区/本体删除/预设脚本是
    // 独立受控步骤（各自 sha 校验 + fail-closed，见 manager/uninstall.mjs 头注）。
    {
      kind: "exact",
      path: "/api/toolkit-panel/uninstall/plan",
      handler: guard(async (request, response) => {
        if (request.method !== "POST") {
          response.writeHead(405, { allow: "POST" });
          response.end();
          return;
        }
        try {
          const body = await readJsonBody(request);
          const plugin = String(body.plugin || "");
          const mode = String(body.mode || "");
          // 销毁式 v2（L-060）：真卸载重新上架，语义 = **彻底删除、不留副本**（不可逆）。
          if (mode !== "soft" && mode !== "true") {
            throw new PlanError("mode-invalid", "mode 必须是 soft（软卸载）或 true（真卸载·销毁式）");
          }
          const meta = assertUninstallable(plugin);
          // 知情确认复核：确认页要求手动输入插件名（软一次 / 真**两次**——销毁式不可逆，服务端不信任前端状态）。
          const typed = Array.isArray(body.confirm) ? body.confirm.map(String) : [String(body.confirm || "")];
          const expectedCount = mode === "true" ? 2 : 1;
          if (typed.length !== expectedCount || typed.some((t) => t !== plugin)) {
            throw new PlanError(
              "confirm-missing",
              "知情确认未完成：请" + (mode === "true" ? "两次输入" : "输入") + "插件名 " + plugin + " 后再执行",
            );
          }
          const userReason = body.reason ? String(body.reason).slice(0, 200) : null;
          const confirmCopy = JSON.stringify({ plugin, mode, typedCount: typed.length, at: new Date().toISOString() });
          const planArgs = { toolkitRoot, plugin, userReason, confirmCopy };
          const plan = mode === "soft"
            ? createSoftUninstallPlan(planArgs)
            : createTrueUninstallPlan(planArgs);
          const isTextPlan = !!plan.file;
          sendJson(response, 200, {
            ok: true,
            plan: {
              token: plan.token,
              kind: plan.kind,
              plugin: plan.plugin,
              mode: plan.mode,
              file: plan.file || null,
              rowId: plan.rowId || null,
              note: plan.note,
              changed: plan.changed !== false,
              expectedSha: plan.expectedSha || null,
              nextSha: plan.nextSha || null,
              removedLines: plan.removedLines || null,
              hostKey: plan.hostKey ? plan.hostKey.key : null,
              archivedExpected: mode === "true",
              effectNote: "本次执行后，将于下次重启时" + (mode === "true" ? "停止使用（删除立即完成）" : "停用") + "；重启前仍按当前状态运行。",
              createdAt: plan.createdAt,
              expiresAt: plan.expiresAt,
              ...(isTextPlan ? {} : {}),
            },
          });
        } catch (error) {
          const code = error instanceof PlanError || (error && error.code) ? error.code : "internal";
          sendJson(response, planErrorStatus(code), { ok: false, code, error: String(error && error.message || error) });
        }
      }, { change: true }),
    },
    {
      kind: "exact",
      path: "/api/toolkit-panel/uninstall/execute",
      handler: guard(async (request, response) => {
        if (request.method !== "POST") {
          response.writeHead(405, { allow: "POST" });
          response.end();
          return;
        }
        try {
          const body = await readJsonBody(request);
          const token = String(body.token || "");
          const plan = getPlan(token);
          if (!plan) throw new PlanError("plan-not-found", "方案不存在或已失效，请重新生成");
          let result;
          if (plan.kind === "uninstall-soft-patch") {
            result = await executeSoftUninstall({ plan: getPlan(token), toolkitRoot, backupRoot });
          } else if (plan.kind === "uninstall-true-patch") {
            result = await executeTrueUninstall({ plan: getPlan(token), toolkitRoot, backupRoot });
          } else if (plan.kind === "uninstall-soft-preset") {
            result = await executePresetSoftUninstall({ plan: getPlan(token), toolkitRoot, backupRoot });
          } else if (plan.kind === "uninstall-true-preset") {
            result = await executePresetTrueUninstall({ plan: getPlan(token), toolkitRoot, backupRoot });
          } else {
            throw new PlanError("plan-not-found", "token 不是卸载方案（kind=" + plan.kind + "），请走 /execute");
          }
          sendJson(response, 200, { ok: true, ...result });
        } catch (error) {
          const code = error instanceof PlanError || (error && error.code) ? error.code : "internal";
          sendJson(response, planErrorStatus(code), { ok: false, code, error: String(error && error.message || error) });
        }
      }, { change: true }),
    },
    // 保管区清单（只读）：真卸载恢复档 + 预设 patched 状态，供恢复入口与卡片状态。
    {
      kind: "exact",
      path: "/api/toolkit-panel/custody",
      handler: guard(async (request, response) => {
        if (request.method !== "GET") {
          response.writeHead(405, { allow: "GET" });
          response.end();
          return;
        }
        const entries = listCustody(toolkitRoot);
        const presetState = JSON.parse(JSON.stringify(loadJsonSafe(join(toolkitRoot, "preset-patch-state.json"))));
        sendJson(response, 200, { ok: true, custody: { entries, presetState: presetState || null } });
      }),
    },
    // 恢复 plan：软（台账）/ 真（保管区）/ 预设（compact-router）。
    // 宿主键被占用 ⇒ 返回 2.9 冲突三态（A 保留当前值 / B 恢复卸载前 / C 取消），不自动覆盖。
    {
      kind: "exact",
      path: "/api/toolkit-panel/restore/plan",
      handler: guard(async (request, response) => {
        if (request.method !== "POST") {
          response.writeHead(405, { allow: "POST" });
          response.end();
          return;
        }
        try {
          const body = await readJsonBody(request);
          const plugin = String(body.plugin || "");
          const meta = assertUninstallable(plugin);
          const hostKeyChoice = body.hostKeyChoice === "keep-current" ? "keep-current" : "restore-backup";
          const planArgs = { toolkitRoot, plugin, hostKeyChoice };
          // 销毁式 v2（L-060）：真卸载**无恢复路径**（面板零副本）。仅有「软卸载台账」或
          // 「预设管理插件」可恢复；其余一律拒绝——重装后的情形由 /mount 承接。
          let plan;
          if (meta.managedBy === "preset") {
            plan = createPresetRestorePlan(planArgs);
          } else if (getSoftRecord(toolkitRoot, meta.rowId || plugin)) {
            plan = createSoftRestorePlan(planArgs);
          } else {
            throw new PlanError(
              "restore-not-available",
              plugin + " 没有可恢复的软卸载记录；真卸载为销毁式（不留副本），恢复途径 = 开源后重新下载安装，再由面板「挂载」",
            );
          }
          if (plan.conflict) {
            sendJson(response, 200, {
              ok: false,
              code: "host-key-conflict",
              conflict: plan.conflict,
              choices: [
                { id: "A", label: "保留当前值（不覆盖）", hostKeyChoice: "keep-current" },
                { id: "B", label: "恢复成卸载前的值", hostKeyChoice: "restore-backup" },
                { id: "C", label: "取消本次恢复" },
              ],
              note: "面板不会自动覆盖。",
            });
            return;
          }
          sendJson(response, 200, {
            ok: true,
            plan: {
              token: plan.token,
              kind: plan.kind,
              plugin: plan.plugin,
              file: plan.file || null,
              note: plan.note,
              expectedSha: plan.expectedSha || null,
              nextSha: plan.nextSha || null,
              manifestFileCount: plan.manifestFileCount || null,
              effectNote: "恢复完成后需要重启才生效。",
              createdAt: plan.createdAt,
              expiresAt: plan.expiresAt,
            },
          });
        } catch (error) {
          const code = error instanceof PlanError || (error && error.code) ? error.code : "internal";
          sendJson(response, planErrorStatus(code), { ok: false, code, error: String(error && error.message || error) });
        }
      }, { change: true }),
    },
    {
      kind: "exact",
      path: "/api/toolkit-panel/restore/execute",
      handler: guard(async (request, response) => {
        if (request.method !== "POST") {
          response.writeHead(405, { allow: "POST" });
          response.end();
          return;
        }
        try {
          const body = await readJsonBody(request);
          const token = String(body.token || "");
          const plan = getPlan(token);
          if (!plan) throw new PlanError("plan-not-found", "方案不存在或已失效，请重新生成");
          let result;
          if (plan.kind === "restore-soft-patch") {
            result = await executeSoftRestore({ plan: getPlan(token), toolkitRoot, backupRoot });
          } else if (plan.kind === "restore-preset") {
            result = await executePresetRestore({ plan: getPlan(token), toolkitRoot });
          } else {
            throw new PlanError("plan-not-found", "token 不是恢复方案（kind=" + plan.kind + "），请走 /execute");
          }
          sendJson(response, 200, { ok: true, effectNote: "恢复完成，重启后生效", ...result });
        } catch (error) {
          const code = error instanceof PlanError || (error && error.code) ? error.code : "internal";
          sendJson(response, planErrorStatus(code), { ok: false, code, error: String(error && error.message || error) });
        }
      }, { change: true }),
    },
    // ---------- 挂载（销毁式 v2 §5）：重装后把插件行块插回挂载面 ----------
    // 与恢复的区别：恢复面向「本体仍在」的软卸载；挂载面向「本体已由重装放回」的已安装未挂载态。
    // 行块事实取自真卸载**收据**（rebuild.rowBlock）——无收据则拒绝，面板不臆造插件 config。
    {
      kind: "exact",
      path: "/api/toolkit-panel/mount/plan",
      handler: guard(async (request, response) => {
        if (request.method !== "POST") {
          response.writeHead(405, { allow: "POST" });
          response.end();
          return;
        }
        try {
          const body = await readJsonBody(request);
          const plugin = String(body.plugin || "");
          const hostKeyChoice = body.hostKeyChoice === "keep-current" ? "keep-current" : "restore-backup";
          const plan = createMountPlan({ toolkitRoot, plugin, hostKeyChoice });
          if (plan.conflict) {
            sendJson(response, 200, {
              ok: false,
              code: "host-key-conflict",
              conflict: plan.conflict,
              choices: [
                { id: "A", label: "保留当前值（不覆盖）", hostKeyChoice: "keep-current" },
                { id: "B", label: "恢复成卸载前的值", hostKeyChoice: "restore-backup" },
                { id: "C", label: "取消本次挂载" },
              ],
              note: "面板不会自动覆盖。",
            });
            return;
          }
          sendJson(response, 200, {
            ok: true,
            plan: {
              token: plan.token,
              kind: plan.kind,
              plugin: plan.plugin,
              file: plan.file || null,
              note: plan.note,
              expectedSha: plan.expectedSha || null,
              nextSha: plan.nextSha || null,
              effectNote: "挂载完成后需要重启才生效。",
              createdAt: plan.createdAt,
              expiresAt: plan.expiresAt,
            },
          });
        } catch (error) {
          const code = error instanceof PlanError || (error && error.code) ? error.code : "internal";
          sendJson(response, planErrorStatus(code), { ok: false, code, error: String(error && error.message || error) });
        }
      }, { change: true }),
    },
    {
      kind: "exact",
      path: "/api/toolkit-panel/mount/execute",
      handler: guard(async (request, response) => {
        if (request.method !== "POST") {
          response.writeHead(405, { allow: "POST" });
          response.end();
          return;
        }
        try {
          const body = await readJsonBody(request);
          const token = String(body.token || "");
          const plan = getPlan(token);
          if (!plan) throw new PlanError("plan-not-found", "方案不存在或已失效，请重新生成");
          let result;
          if (plan.kind === "mount-patch") {
            result = await executeMount({ plan: getPlan(token), toolkitRoot, backupRoot });
          } else if (plan.kind === "mount-preset") {
            result = await executeMountPreset({ plan: getPlan(token), toolkitRoot });
          } else {
            throw new PlanError("plan-not-found", "token 不是挂载方案（kind=" + plan.kind + "），请走 /execute");
          }
          sendJson(response, 200, { ok: true, effectNote: "挂载完成，重启后生效", ...result });
        } catch (error) {
          const code = error instanceof PlanError || (error && error.code) ? error.code : "internal";
          sendJson(response, planErrorStatus(code), { ok: false, code, error: String(error && error.message || error) });
        }
      }, { change: true }),
    },
    // execute 路由：把已确认的 plan 落盘。写路由 → 走严格配对 + CSRF。
    {
      kind: "exact",
      path: "/api/toolkit-panel/execute",
      handler: guard(async (request, response) => {
        if (request.method !== "POST") {
          response.writeHead(405, { allow: "POST" });
          response.end();
          return;
        }
        try {
          const body = await readJsonBody(request);
          const token = String(body.token || "");
          const result = executePlan(token);
          sendJson(response, 200, result);
        } catch (error) {
          const code = error instanceof PlanError ? error.code : "internal";
          sendJson(response, planErrorStatus(code), { ok: false, code, error: String(error && error.message || error) });
        }
      }, { change: true }),
    },
    // 方案查询（只读）：供 UI 在确认页展示上下文 / 判断是否仍有效。
    {
      kind: "exact",
      path: "/api/toolkit-panel/plan/status",
      handler: guard(async (request, response) => {
        if (request.method !== "GET") {
          response.writeHead(405, { allow: "GET" });
          response.end();
          return;
        }
        const token = String((request.url || "").split("token=")[1] || "").split("&")[0];
        const plan = getPlan(token);
        if (!plan) {
          sendJson(response, 404, { ok: false, code: "plan-not-found", error: "方案不存在或已失效" });
          return;
        }
        sendJson(response, 200, {
          ok: true,
          plan: {
            token: plan.token,
            file: plan.file,
            rowId: plan.rowId,
            key: plan.key,
            value: plan.value,
            diff: plan.diff,
            expectedSha: plan.expectedSha,
            createdAt: plan.createdAt,
            expiresAt: plan.expiresAt,
            expired: Date.parse(plan.expiresAt) <= Date.now(),
          },
        });
      }),
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
