/**
 * plugin.js — @local/agent-memory 的 dsh cordis 插件入口（运行时接线四件套，§7）
 *
 * 把 harness 生命周期事件接到 lib/runtime.js 的处理层：
 *   - session/created       → onSessionStart   （1 新对话自动注册；仅新会话入册）
 *   - agent/inbox/claimed   → onUserMessage    （2 指令逐消息持续采集）
 *   - agent/pre-step        → onHeartbeat      （3 心跳自动触发；里程碑由应用层经 onMilestone）
 *   - session/disposed      → onSessionDisposed（5 销毁钩子：活跃→已完成；未入册不抛错）
 *
 * 防御式：事件载荷形状缺失 → emitWarning（不静默吞掉；但也不因载荷形状差异崩溃）。
 * 挂载（§11 preflight 时验证）：liangshen preset agent.cordis.yml 增加
 *   - id: agent-memory-runtime
 *     name: '@local/agent-memory/plugin'
 *     config: { dataRoot: '<全局数据根，缺省=resolveDataRoot>' }
 */
import { resolveDataRoot, verifyPermanentPresence, assertFreshForHandover, setTaskSummary, sweepTmpOrphans } from './lib/index.js';
import { onSessionStart, onUserMessage, onMilestone, onHeartbeat, onSessionState, onSessionDisposed, resolveSidByHostId, noteTurn } from './lib/runtime.js';
import { appendSelflog, logHeartbeat as selflogHeartbeat } from './lib/selflog.js';

export const name = 'agent-memory-runtime';

/** 自日志事件行名单（register 行在位自证；与 manifest registers.events 逐名相等，钉在 test/agent-memory.selflog.test.mjs）。 */
const SUBSCRIBED_EVENTS = [
  'session/created',
  'agent/inbox/claimed',
  'agent/pre-step',
  'session/event',
  'agent/request-error',
  'agent/request',
  'session/disposed',
];

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => (typeof b === 'string' ? b : b && b.type === 'text' ? b.text : ''))
      .filter(Boolean)
      .join('\n');
  }
  if (content && typeof content.text === 'string') return content.text;
  return '';
}
function warn(msg) {
  if (typeof process !== 'undefined' && typeof process.emitWarning === 'function') {
    process.emitWarning(`[agent-memory-runtime] ${msg}`);
  }
}
function unbox(session) {
  return session?.session ?? session;
}
function sessionOf(agent) {
  return agent?.session ?? agent;
}
/** 从宿主事件载荷提取模型回合号：优先读顶层 turn（宿主真实信道），子树回退仅防御、不掩盖缺位；缺额 0。 */
function turnOf(payload) {
  const n = Number(payload?.turn ?? payload?.agent?.turn ?? payload?.session?.turn ?? 0);
  return Number.isFinite(n) ? n : 0;
}
/**
 * 宿主 UUID → agent-memory sid，附自日志原因码（EXE-BOOT-010 观测面）：
 * 解析语义零变化（查不到/异常仍返回 sid=null），code 说明 null 的成因供 <dataRoot>/logs/agent-memory.jsonl 落行。
 */
function sidResolve(root, hostId) {
  if (!hostId) return { sid: null, code: 'no-host-id' };
  try {
    const sid = resolveSidByHostId(root, hostId);
    return sid ? { sid, code: null } : { sid: null, code: 'unresolved' };
  } catch (err) {
    warn(`宿主会话 id 归一化失败：${err?.code ?? err?.message}`);
    return { sid: null, code: `resolve-error:${err?.code ?? err?.message}` };
  }
}
/** 从宿主事件载荷提取 agent-memory sid（宿主 ID 只经归一化模块进入；查不到返回 null）。 */
function sidOf(root, hostId) {
  return sidResolve(root, hostId).sid;
}

/**
 * ⑤ 模型切换里程碑（§12.9 候选①，替代幻影 model-switch 监听）：
 *   主源 = host 真实信道 `session/event` 的 `model/selection`（官方手动选择与路由回写均经此 session 投影事件）；
 *   补充 = `agent/request-error`(RATE_LIMIT) + `agent/request` 的 call 指纹比对（覆盖未开路由时 dsh 原生回退导致的切换）。
 *   幂等 = 同 sid 同 `provider/model` 指纹不写；首次观测只播种指纹（无「变化」，不写）。
 */
const modelFingerprints = new Map(); // sid → `${provider}/${model}`
const rateLimitPending = new Map();  // sid → { provider, turn }

function fingerprintOf(provider, model) {
  const p = String(provider ?? '').trim();
  const m = String(model ?? '').trim();
  if (!p || !m) return null;
  return `${p}/${m}`;
}

/** 同会话引擎指纹变化才写里程碑（幂等）；写时核对 [永久] 双行在场并随里程碑落档。 */
function recordModelSwitch(root, sid, opts = {}) {
  if (!sid) return;
  const fp = fingerprintOf(opts.provider, opts.model);
  if (!fp) return;
  const prev = modelFingerprints.get(sid);
  modelFingerprints.set(sid, fp);
  if (prev === fp) return;        // 同指纹：不写（幂等）
  if (prev === undefined) return; // 首次观测：只播种，无「变化」不写
  let permStep = '';
  try {
    const perm = verifyPermanentPresence(root, sid);
    permStep = `【[永久]监测】正典双行在场=${perm.ok ? '是' : '否'}（始终用中文回复=${perm.hasFirst}，指令先落账=${perm.hasSecond}，共 ${perm.count} 行）`;
  } catch (err) {
    permStep = `【[永久]监测】核对失败：${err?.code ?? err?.message}`;
  }
  try {
    onMilestone({
      root,
      sid,
      workspace: opts.workspace,
      completedSteps: [`【模型切换】${prev} → ${fp}（${opts.source}）`, permStep],
      keyDecisions: `模型切换来源：${opts.source}；from=${prev} → to=${fp}`,
      modelTurn: opts.modelTurn,
    });
  } catch (err) {
    warn(`模型切换里程碑写入失败：${err?.code ?? err?.message}`);
  }
}

export function register(ctx, config = {}) {
  const root = config.dataRoot ?? resolveDataRoot();
  ctx.logger?.info?.(`[agent-memory] register() 已挂载：dataRoot=${root}`);
  // 启动清扫 .tmp 孤儿（EXE-BOOT-010 开工令 2；尽力而为，绝不阻断挂载）：
  // 崩溃实例残留的原子写 tmp 按年龄回收（60s 年龄闸防误扫在飞 tmp），回收量走日志器。
  try {
    const swept = sweepTmpOrphans(root);
    if (swept.removed.length > 0) {
      ctx.logger?.info?.(`[agent-memory] 启动清扫 .tmp 孤儿 ${swept.removed.length} 个（errors=${swept.errors.length}）`);
    }
  } catch (err) {
    warn(`.tmp 启动清扫失败：${err?.code ?? err?.message}`);
  }
  const ws = (agent) => sessionOf(agent)?.cwd ?? agent?.workspace ?? config.defaultWorkspace ?? process.cwd();
  // 带原因码的解析（自日志观测面）与既有 sid 提取（语义不变）
  const sidInfo = (agent) => sidResolve(root, sessionOf(agent)?.id ?? agent?.id);
  const sid = (agent) => sidInfo(agent).sid;
  // 挂载通道：每笔订阅包 try/catch —— 中途抛错先落 register 失败行再照传宿主（成败各落一行，语义零变化）
  const onEvent = (name, handler) => {
    try {
      ctx.on(name, handler);
    } catch (err) {
      appendSelflog(root, 'register', { ok: false, code: err?.code ?? err?.message, failedOn: name });
      throw err;
    }
  };
  const handleMilestone = (opts) => onMilestone({ root, ...opts });

  onEvent('session/created', (session) => {
    const s = unbox(session);
    const sessionId = s?.id ?? s?.sid;
    if (!sessionId) {
      appendSelflog(root, 'created', { hostId: null, sid: null, code: 'no-host-id', outcome: 'skipped' });
      return warn('session/created 载荷无 id，跳过');
    }
    ctx.logger?.info?.(`[agent-memory] session/created 命中：id=${sessionId}`);
    try {
      const result = onSessionStart({
        root,
        dshSessionId: sessionId,
        taskSummary: s?.taskSummary ?? s?.task ?? '',
        task: s?.task ?? s?.taskSummary ?? '',
        workspace: s?.cwd ?? config.defaultWorkspace ?? process.cwd(),
        modelTurn: 0, // session/created 载荷无 turn（宿主 announce 只传 session；预期基线 0）
      });
      appendSelflog(root, 'created', {
        hostId: sessionId,
        sid: result?.sid ?? null,
        code: result?.skipped ?? null,
        outcome: result?.skipped ? 'skipped' : (result?.created ? 'created' : 'deduped'),
      });
    } catch (err) {
      appendSelflog(root, 'created', { hostId: sessionId, sid: null, code: err?.code ?? err?.message, outcome: 'error' });
      warn(`session/created 注册失败：${err?.code ?? err?.message}`);
    }
  });

  onEvent('agent/inbox/claimed', (payload) => {
    const agent = payload?.agent;
    const message = payload?.message ?? payload?.claimed ?? payload;
    const info = sidInfo(agent);
    const s = info.sid;
    if (!s || !message) {
      appendSelflog(root, 'claimed', {
        hostId: sessionOf(agent)?.id ?? agent?.id ?? null,
        sid: null,
        code: !s ? info.code : 'no-message',
        messageId: message?.id ?? null,
        outcome: !s ? 'skipped:no-sid' : 'skipped:no-message',
      });
      return warn('agent/inbox/claimed 载荷无 agent/message，跳过');
    }
    try {
      const result = onUserMessage({
        root,
        sid: s,
        messageId: message.id,
        text: textOf(message.content),
        workspace: ws(agent),
        modelTurn: turnOf(payload), // 顶层 payload.turn（宿主 dsh-agent-loop claimed :367-372）
      });
      appendSelflog(root, 'claimed', {
        hostId: sessionOf(agent)?.id ?? agent?.id,
        sid: s,
        code: null,
        messageId: message.id ?? null,
        outcome: result?.collected ? 'collected' : `skipped:${result?.skipped ?? 'unknown'}`,
      });
    } catch (err) {
      appendSelflog(root, 'claimed', {
        hostId: sessionOf(agent)?.id ?? agent?.id,
        sid: s,
        code: err?.code ?? err?.message,
        messageId: message.id ?? null,
        outcome: 'error',
      });
      warn(`agent/inbox/claimed 采集失败：${err?.code ?? err?.message}`);
    }
  });

  onEvent('agent/pre-step', async (payload, next) => {
    const agent = payload?.agent ?? payload;
    const info = sidInfo(agent);
    // 自日志先行（活体行不受下游异常影响）：节流见 selflog.js——心跳本体每步照跑（新鲜度数据源语义不变）
    selflogHeartbeat(root, {
      hostId: sessionOf(agent)?.id ?? agent?.id ?? null,
      sid: info.sid,
      code: info.sid ? null : info.code,
      turn: turnOf(payload),
      outcome: info.sid ? 'heartbeated' : 'skipped:no-sid',
    });
    if (info.sid) {
      onHeartbeat({ root, sid: info.sid });
      noteTurn({ root, sid: info.sid, turn: turnOf(payload) }); // 4b：备忘最后回合数，供压缩出口的新鲜度提示
      // §1 门禁接入点：发出下一条请求（模型步进）前统一检查台账新鲜度；
      // 过期 → 告警提示刷新（不硬阻断模型步进；硬拦截语义由 assertFreshForHandover 抛错 + 调用方决定）。
      if (config.enforceFreshness !== false) {
        try {
          assertFreshForHandover(root, info.sid, {
            turn: turnOf(payload), // 顶层 payload.turn（宿主 dsh-agent-loop pre-step :506/538-540）
            transferStrategy: 'compact',
          });
        } catch (err) {
          if (err?.code === 'FRESHNESS_STALE') {
            warn(`台账过期（${err.turns} 个模型回合，上限 ${err.freshTurns}），交接前需先刷新台账`);
          } else if (!['FRESHNESS_NO_LEDGER', 'HANDOVER_NEEDS_TURN'].includes(err?.code)) {
            warn(`新鲜度检查失败：${err?.code ?? err?.message}`);
          }
        }
      }
    }
    if (typeof next === 'function') return next();
    return undefined;
  });

  // ⑤ 模型切换里程碑（§12.9 候选①）：主源 = session/event 的 model/selection（官方手动选择与路由回写均经此 session 投影事件）
  // 摘要接线修复（2026-09-13）：session/title（同一投影信道）→ 回填 taskSummary。
  // 宿主 session/created 载荷不带标题（announce 只传 session 对象），标题由
  // dsh-session-title 以 session/title 事件落地，数据形状 {title, messageSeqs, source}。
  onEvent('session/event', (session, event) => {
    const type = event?.type;
    if (type === 'session/title') {
      const data = event?.data ?? event;
      const title = typeof data?.title === 'string' ? data.title.trim() : '';
      if (!title) return; // 空标题不回填（setTaskSummary 也会拒绝，防御双保险）
      const sess = unbox(session);
      const hostId = sess?.id ?? sess?.sid;
      if (!hostId) return;
      const s = sidOf(root, hostId);
      if (!s) return; // 未入册会话跳过，不抛错
      try {
        setTaskSummary(root, s, title);
        ctx.logger?.info?.(`[agent-memory] 摘要接线：${s} taskSummary ← "${title.slice(0, 60)}"`);
      } catch (err) {
        warn(`摘要回写失败：${err?.code ?? err?.message}`);
      }
      return;
    }
    if (type !== 'model/selection') return;
    const data = event?.data ?? event;
    const sess = unbox(session);
    const hostId = sess?.id ?? sess?.sid;
    if (!hostId) return;
    const s = sidOf(root, hostId); // 宿主 UUID → registry sid（未入册 → null，跳过，不抛错）
    if (!s) return;
    recordModelSwitch(root, s, {
      provider: data?.provider,
      model: data?.model,
      source: 'model/selection',
      workspace: sess?.cwd ?? config.defaultWorkspace ?? process.cwd(),
    });
  });

  // ⑤ 补充①：dsh 原生回退（未开路由插件时 429 频发导致的切换）——RATE_LIMIT 后下一请求 call 指纹变化
  onEvent('agent/request-error', (payload, next) => {
    const agent = payload?.agent ?? payload;
    const hostId = sessionOf(agent)?.id ?? agent?.id;
    const code = payload?.failure?.code ?? payload?.code;
    const provider = payload?.provider;
    if (hostId && provider && (code === 'RATE_LIMIT' || code === 'QUOTA')) {
      const s = sidOf(root, hostId);
      if (s) rateLimitPending.set(s, { provider, turn: turnOf(payload) });
    }
    if (typeof next === 'function') return next();
    return undefined;
  });

  // ⑤ 补充②：agent/request 为 waterfall——纯观察（先 next() 取最终 call，再指纹比对），不改写链条；任何异常不阻断请求。
  onEvent('agent/request', async (payload, next) => {
    const result = typeof next === 'function' ? await next() : payload;
    const provider = result?.provider ?? payload?.provider ?? payload?.call?.provider;
    const model = result?.model ?? payload?.model ?? payload?.call?.model;
    const agent = payload?.agent ?? payload;
    const hostId = sessionOf(agent)?.id ?? agent?.id;
    if (hostId && provider && model) {
      const s = sidOf(root, hostId);
      if (s) {
        const pending = rateLimitPending.get(s);
        recordModelSwitch(root, s, {
          provider,
          model,
          source: pending ? '回退' : 'request',
          workspace: ws(agent) ?? config.defaultWorkspace ?? process.cwd(),
          modelTurn: turnOf(payload),
        });
        if (pending) rateLimitPending.delete(s);
      }
    }
    return result;
  });

  onEvent('session/disposed', (session) => {
    const s = unbox(session);
    const hostId = s?.id ?? s?.sid;
    if (!hostId) {
      appendSelflog(root, 'disposed', { hostId: null, sid: null, code: 'no-host-id', outcome: 'skipped' });
      return warn('session/disposed 载荷无 id，跳过');
    }
    try {
      const result = onSessionDisposed({ root, dshSessionId: hostId });
      appendSelflog(root, 'disposed', {
        hostId,
        sid: result?.sid ?? null,
        code: result?.skipped ?? null,
        outcome: result?.disposed ? 'disposed' : `skipped:${result?.skipped ?? 'unknown'}`,
      });
    } catch (err) {
      if (!['INVALID_TRANSITION', 'WORKSPACE_MISMATCH'].includes(err?.code)) {
        appendSelflog(root, 'disposed', { hostId, sid: null, code: err?.code ?? err?.message, outcome: 'error' });
        warn(`session/disposed 状态流转失败：${err?.code ?? err?.message}`);
      } else {
        appendSelflog(root, 'disposed', { hostId, sid: null, code: err?.code ?? err?.message, outcome: 'error-suppressed' });
      }
    }
  });

  // register 行（每启动实例在位自证）：全部七笔订阅挂载成功后落一行
  appendSelflog(root, 'register', { ok: true, dataRoot: root, events: SUBSCRIBED_EVENTS });

  // 供应用层直接调用（里程碑事件）
  const api = {
    milestone: handleMilestone,
  };
  return api;
}

export { onSessionStart, onUserMessage, onMilestone, onHeartbeat, onSessionState, onSessionDisposed, resolveSidByHostId, isInstructionText } from './lib/runtime.js';

// cordis 插件入口：default 是**带 name 的 `{ name, apply }` 对象**（H3 / 债务 D-12 双通道统一）。
// 为什么不用 `export default register`：宿主装载器对 ESM 模块做 `exports.default ?? exports`
// 的纯替换，函数形态下 cordis 读到的 `plugin.name` 就是 JS 推断名 `register`，而面板
// registry 通道（装载器会保守合并模块级 `export const name`）读到的是
// `agent-memory-runtime` —— 同一个插件在两条通道里两个名字。对象形态让两边都拿到声明名，
// 且它是 cordis 文档认可的三种形态之一，不需要 defineProperty 去改函数的内建 name。
// 另注：`register` 是函数声明（带 .prototype），cordis 的 isConstructor 会按构造器 `new` 它，
// 因此结尾 `return api` 被吞掉、不会走到"返回值当 effect 处理"那条抛错路径；
// 若日后把它改成箭头函数，这条前提就断了（届时应连同本注释一并复核）。
export default { name: 'agent-memory-runtime', apply: register };
export const apply = register;