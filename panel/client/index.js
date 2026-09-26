if (typeof window !== "undefined" && window.__ModuleLoader__ && typeof window.__ModuleLoader__.load === "function") {
window.__ModuleLoader__.load({
	id: "@local/dsh-toolkit/panel",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var react = require("react");

		// 本面板一切请求的唯一基址（P7 嵌入 / REQ-8）。取值恒等于 contract 的
		// contractHttpBase(DEFAULT_SERVICE_PREFIX)，一致性由 test/p7-embed.test.mjs 锁死。
		// 为何这里只能是常量、不像兜底页那样由服务端注入：React 标签页由宿主客户端加载器
		// 按固定模块 id 装载，bundle 不经我们手（详见 docs/embed-toolkit.md 嵌入边界）。
		var PANEL_API = "/api/toolkit-panel";

		// ---- 功能描述：说"这个插件是干嘛的"，不出现工程名词 ----
		var DESCRIPTIONS = {
			"agent-memory": "记住你说过的话和项目里的重要信息，下次对话还能用上。",
			"compact-router": "对话变长时自动压缩历史内容，省上下文又不断片。",
			"rate-throttle": "给模型请求限速，避免发得太快被服务方拒绝。",
			"search-router": "决定每次联网搜索走哪条路：官方搜索还是本地搜索。",
			"web-search-local": "提供不依赖官方接口的本地搜索引擎，可自选搜索源。"
		};
		// ---- 标识符一律「英文原名 + 中文注释」形态 ----
		// 原名来自插件目录名 / 包名本体，是稳定可检索的标识；
		// 中文只作副标题注释，不替换原名。
		var CN_NAMES = {
			"agent-memory": "记忆",
			"compact-router": "上下文压缩",
			"rate-throttle": "限流",
			"search-router": "搜索路由",
			"web-search-local": "本地网页搜索"
		};
		// 英文原名：优先用快照里的真实包名尾部，回退到目录名
		function originalName(plugin) {
			var raw = String((plugin && plugin.name) || "").trim();
			if (raw) {
				var seg = raw.split("/");
				var last = seg[seg.length - 1];
				if (last) return last;
			}
			return String((plugin && plugin.dir) || "");
		}
		// 「英文原名（中文注释）」单行形态，供标题与标识符位置统一使用
		function annotated(plugin) {
			var en = originalName(plugin);
			var cn = CN_NAMES[(plugin && plugin.dir) || ""];
			return cn ? en + "（" + cn + "）" : en;
		}

		// ---- P2.4 缺席态六态（服务端 statusCopy 为权威；此处只作兜底）----
		// W2-1（F-22+F-76）：兜底表与服务端 snapshot.mjs ABSENCE_COPY **逐字同步**
		// ——真卸载是销毁式（零副本、不可恢复），兜底曾写"移入保管区·可一键恢复"
		// 方向相反；改动文案必须两处同笔（钉 test/absence-copy-parity.test.mjs）。
		var ABSENCE_COPY_FALLBACK = {
			"soft-unmounted": "已软卸载 · 本体保留 · 可一键恢复",
			"true-uninstalled": "已卸载（无副本）· 重新安装后面板可挂载",
			"installed-unmounted": "已安装未挂载（不是面板卸载的）· 可从面板重新挂载",
			"dangling-mount": "挂载行存在，但本体缺失 · 异常态",
			"unknown-absent": "未安装 · 本体与挂载行都不在"
		};
		// §2 用的中文名。注意与卡片副标题的 CN_NAMES **不同源**（§2 里 compact-router 叫
		// 「压缩」，副标题叫「上下文压缩」）—— 弹窗一律以 panel/docs/p24-test-plan-batch1.md
		// §2 为准，一字不改。
		var P24_CN = {
			"agent-memory": "记忆",
			"compact-router": "压缩",
			"rate-throttle": "限流",
			"search-router": "搜索路由",
			"web-search-local": "本地搜索"
		};
		function p24Name(plugin) {
			var cn = P24_CN[(plugin && plugin.dir) || ""];
			return (cn ? cn + " " : "") + originalName(plugin);
		}
		// §2.9 完成后页面横幅（逐字）
		var RESTORE_DONE_BANNER = "恢复完成，重启后生效";

		var styles = {
			root: { fontFamily: "system-ui, \"Segoe UI\", sans-serif", color: "#e6e6e6" },
			title: { fontSize: 20, margin: "0 0 4px" },
			muted: { color: "#9aa0a6", fontSize: 12 },
			toolbar: { display: "flex", gap: 8, margin: "16px 0", alignItems: "center", flexWrap: "wrap" },
			button: { padding: "6px 14px", borderRadius: 6, border: "1px solid #3a3f47", background: "#1c2027", color: "#e6e6e6", cursor: "pointer", fontSize: 13 },
			buttonDisabled: { opacity: 0.6, cursor: "default" },
			cards: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 },
			card: { border: "1px solid #2a2f36", borderRadius: 8, padding: 12, background: "#181b21" },
			cardTitle: { margin: "0 0 2px", fontSize: 15, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, fontFamily: "ui-monospace, Consolas, monospace" },
			// 中文注释副标题：卡片第二行，弱于英文原名
			subtitle: { fontSize: 12.5, color: "#9aa0a6", margin: "0 0 8px" },
			desc: { fontSize: 13, lineHeight: 1.55, margin: "0 0 10px", color: "#d7dae0" },
			// 状态行：三态里"正在生效"最醒目
			stateRow: { display: "flex", alignItems: "center", gap: 6, margin: "0 0 8px", fontSize: 13, fontWeight: 600 },
			// W2 余件：四卡"改完要重启"提示位（服务端 configPanel.effectNote 下发，此处只渲染）
			effectNote: { fontSize: 12, color: "#8fa89e", lineHeight: 1.7, margin: "0 0 8px" },
			dotOn: { width: 9, height: 9, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 0 3px rgba(74,222,128,0.18)", flex: "0 0 9px" },
			dotWarn: { width: 9, height: 9, borderRadius: "50%", background: "#fbbf24", boxShadow: "0 0 0 3px rgba(251,191,36,0.18)", flex: "0 0 9px" },
			dotOff: { width: 9, height: 9, borderRadius: "50%", background: "#8b9099", flex: "0 0 9px" },
			stateOn: { color: "#4ade80" },
			stateWarn: { color: "#fbbf24" },
			stateOff: { color: "#9aa0a6" },
			// 双层开关：醒目提示条
			dualBox: { margin: "0 0 10px", padding: "8px 10px", borderRadius: 6, background: "#2a2210", border: "1px solid #6b5a1e" },
			dualHead: { color: "#fbbf24", fontSize: 12, fontWeight: 700, marginBottom: 4 },
			dualLine: { fontSize: 12, color: "#e0d5b7", lineHeight: 1.6 },
			dualCode: { fontFamily: "ui-monospace, Consolas, monospace", color: "#f0e2b8" },
			badge: { display: "inline-block", padding: "1px 7px", borderRadius: 10, fontSize: 11 },
			badgeDerived: { background: "#3a2b17", color: "#e8c36c" },
			badgeLocal: { background: "#211f3a", color: "#9c96db" },
			// 技术详情：默认收起
			details: { marginTop: 10, borderTop: "1px solid #23272d", paddingTop: 8 },
			summary: { cursor: "pointer", fontSize: 12, color: "#8ab4f8", userSelect: "none" },
			techRow: { fontSize: 11.5, color: "#9aa0a6", fontFamily: "ui-monospace, Consolas, monospace", lineHeight: 1.7, wordBreak: "break-all" },
			techKey: { color: "#7f858d" },
			pre: { whiteSpace: "pre-wrap", background: "#12151a", border: "1px solid #2a2f36", borderRadius: 6, padding: 10, fontSize: 12, maxHeight: 340, overflow: "auto" },
			issues: { maxHeight: 320, overflow: "auto", border: "1px solid #2a2f36", borderRadius: 6 },
			issue: { borderBottom: "1px solid #23272d", padding: 8, fontSize: 12, lineHeight: 1.6 },
			issueError: { color: "#f28b82" },
			issueWarning: { color: "#e8c36c" },
			issueInfo: { color: "#9aa0a6" },
			allGood: { padding: "12px 10px", fontSize: 13, color: "#67c48b" },
			h2: { fontSize: 16, margin: "16px 0 8px" },
			// ---- P2.2 启停开关（双层分立）----
			toggleBox: { marginTop: 10, padding: "8px 10px", borderRadius: 6, background: "#151922", border: "1px solid #2a2f36" },
			toggleHead: { fontSize: 12, fontWeight: 700, color: "#c8cdd4", marginBottom: 6 },
			layerRow: { display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11.5, lineHeight: 1.9, marginBottom: 2 },
			layerLabel: { color: "#8f959d", fontFamily: "ui-monospace, Consolas, monospace" },
			layerValue: { fontWeight: 600 },
			toggleRow: { display: "flex", gap: 8, alignItems: "center", marginTop: 8 },
			confirmBox: { marginTop: 8, padding: "8px 10px", borderRadius: 6, background: "#1b2028", border: "1px solid #3a4048" },
			confirmHead: { fontSize: 12, fontWeight: 700, color: "#cfd4da", marginBottom: 6 },
			confirmLine: { fontSize: 11.5, color: "#9aa0a6", lineHeight: 1.8, wordBreak: "break-all" },
			confirmRow: { display: "flex", gap: 8, marginTop: 8 },
			diffPre: { whiteSpace: "pre-wrap", background: "#12151a", border: "1px solid #2a2f36", borderRadius: 4, padding: "6px 8px", fontSize: 11.5, margin: "6px 0", fontFamily: "ui-monospace, Consolas, monospace" },
			crossBox: { marginTop: 6, padding: "6px 8px", borderRadius: 4, background: "#2a2210", border: "1px solid #6b5a1e" },
			crossHead: { fontSize: 11.5, fontWeight: 700, color: "#fbbf24", marginBottom: 3 },
			crossLine: { fontSize: 11, color: "#e0d5b7", fontFamily: "ui-monospace, Consolas, monospace", lineHeight: 1.7, wordBreak: "break-all" },
			crossFoot: { fontSize: 11, color: "#c9bd9a", marginTop: 3 },
			errorBox: { marginTop: 6, padding: "6px 8px", borderRadius: 4, background: "#2b1719", border: "1px solid #6b2226", fontSize: 11.5, color: "#f2a6a0" },
			// 确认页：生效时机说明 + 字段人话解释
			confirmEffect: { fontSize: 12, fontWeight: 600, color: "#fbbf24", lineHeight: 1.7, marginBottom: 4 },
			confirmNote: { fontSize: 11.5, color: "#a9aeb5", lineHeight: 1.75, marginTop: 4 },
			noteCode: { fontFamily: "ui-monospace, Consolas, monospace", color: "#d9c58a" },
			condNote: { marginTop: 4, fontSize: 11, color: "#e0d5b7", lineHeight: 1.7 },
			// ---- P2.3 参数编辑（rate-throttle 白名单标量）----
			cfgBox: { marginTop: 10, padding: "8px 10px", borderRadius: 6, background: "#141a1c", border: "1px solid #24403a" },
			cfgHead: { fontSize: 12, fontWeight: 700, color: "#9fd8c0", marginBottom: 4 },
			cfgNote: { fontSize: 11, color: "#8fa89e", lineHeight: 1.7, marginBottom: 6 },
			cfgSection: { fontSize: 11, fontWeight: 700, color: "#7f8f88", margin: "8px 0 2px", fontFamily: "ui-monospace, Consolas, monospace" },
			cfgRow: { display: "flex", gap: 6, alignItems: "center", fontSize: 11.5, lineHeight: 2, flexWrap: "wrap" },
			cfgLabel: { color: "#a9b3ad", flex: "1 1 200px", fontFamily: "ui-monospace, Consolas, monospace" },
			cfgCur: { color: "#6f7a74", fontFamily: "ui-monospace, Consolas, monospace" },
			cfgInput: { width: 110, padding: "2px 6px", borderRadius: 4, border: "1px solid #2c3c36", background: "#101413", color: "#d7e2dc", fontSize: 12, fontFamily: "ui-monospace, Consolas, monospace" },
			cfgSave: { padding: "2px 8px", borderRadius: 4, border: "1px solid #2c5a4a", background: "#12241e", color: "#9fd8c0", cursor: "pointer", fontSize: 11 },
			modeBox: { marginTop: 10, padding: "8px 10px", borderRadius: 6, background: "#161a22", border: "1px solid #2a2f36" },
			modeLine: { fontSize: 11.5, color: "#a9aeb5", lineHeight: 1.8 },
			// ---- P2.4 缺席态（六态）----
			absBox: { margin: "0 0 10px", padding: "8px 10px", borderRadius: 6, background: "#1a1f27", border: "1px solid #3a3f47" },
			absBoxWarn: { margin: "0 0 10px", padding: "8px 10px", borderRadius: 6, background: "#2a2210", border: "1px solid #6b5a1e" },
			absHead: { fontSize: 12, fontWeight: 700, marginBottom: 4, color: "#c8cdd4" },
			absHeadWarn: { fontSize: 12, fontWeight: 700, marginBottom: 4, color: "#fbbf24" },
			absLine: { fontSize: 12, color: "#d7dae0", lineHeight: 1.7 },
			// ---- P2.4 卸载 / 恢复 ----
			uninBox: { marginTop: 10, padding: "8px 10px", borderRadius: 6, background: "#1d1a1c", border: "1px solid #4a3236" },
			uninHead: { fontSize: 12, fontWeight: 700, color: "#eba0a0", marginBottom: 6 },
			uninRow: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 },
			btnOpen: { padding: "4px 10px", borderRadius: 4, border: "1px solid #4a4048", background: "#221d22", color: "#e0cfe0", cursor: "pointer", fontSize: 12 },
			btnRest: { padding: "4px 10px", borderRadius: 4, border: "1px solid #2c5a4a", background: "#12241e", color: "#9fd8c0", cursor: "pointer", fontSize: 12 },
			dlgBox: { marginTop: 8, padding: "8px 10px", borderRadius: 6, background: "#1b2028", border: "1px solid #4a4048" },
			dlgTitle: { fontSize: 12.5, fontWeight: 700, color: "#e8d9b0", marginBottom: 6 },
			dlgKey: { fontSize: 11.5, fontWeight: 700, color: "#8f959d", marginTop: 6 },
			dlgLine: { fontSize: 11.5, color: "#cfd4da", lineHeight: 1.8, wordBreak: "break-word" },
			dlgLineBold: { fontSize: 11.5, color: "#cfd4da", lineHeight: 1.8, fontWeight: 700, wordBreak: "break-word" },
			dlgInput: { width: "100%", boxSizing: "border-box", padding: "3px 6px", borderRadius: 4, border: "1px solid #3a4048", background: "#101413", color: "#e6e6e6", fontSize: 12, fontFamily: "ui-monospace, Consolas, monospace", marginTop: 3 },
			dlgWarn: { marginTop: 6, padding: "6px 8px", borderRadius: 4, background: "#2a2210", border: "1px solid #6b5a1e", fontSize: 11.5, color: "#e0d5b7", lineHeight: 1.8 },
			dlgWarnTop: { marginBottom: 6, padding: "5px 8px", borderRadius: 4, background: "#3a1414", border: "1px solid #8a3030", fontSize: 12, fontWeight: 700, color: "#f0c0bc" },
			dlgErr: { fontSize: 11.5, color: "#f2a6a0" },
			banner: { margin: "12px 0", padding: "10px 12px", borderRadius: 6, background: "#12241e", border: "1px solid #2c5a4a", color: "#9fd8c0", fontSize: 13 }
		};

		function Badge(props) {
			return react.createElement("span", { style: Object.assign({}, styles.badge, props.style) }, props.children);
		}
		function originBadge(plugin) {
			if (plugin.origin === "derived") {
				return react.createElement(Badge, { style: styles.badgeDerived }, "第三方衍生 " + (plugin.upstream || ""));
			}
			return react.createElement(Badge, { style: styles.badgeLocal }, "本地原创");
		}

		// ---- 三态判定 ----
		// running : 配置层开着，且插件自身的运行开关也开着 —— 现在真的在工作
		// loaded-off : 配置层开着，但插件内部开关关了 —— 已加载但没在工作
		// config-off : 配置层就停用了 —— 根本没加载
		// 依据：patchRow.enabled 是"配置层"开关；config.enabled 是插件内部开关。
		// 读取插件"内部总开关"。
		//
		// 首选服务端 patchRow.config.enabled —— P2.0 已修 parseRootRows() 的缩进缺陷
		// （旧版用不区分缩进的正则收集 config，rate-throttle 自身 enabled:false 会被嵌套
		// routing.enabled:true 覆盖成 "true"）。修好后服务端值可信。
		// 下面的 rowAnchorFromPatch 仅作**防御性回退**：万一将来服务端又退回旧解析，
		// 或快照与 patch 原文不一致，client 仍能从 patch 原文按缩进自算，避免误报。
		function rowAnchorFromPatch(plugin, patchText) {
			if (!patchText || !plugin.patchRow) return null;
			var lines = String(patchText).split(/\r?\n/);
			var wantId = plugin.patchRow.id;
			var start = -1;
			for (var i = 0; i < lines.length; i++) {
				var m = /^(\s*)- id:\s*([^#\s]+)/.exec(lines[i]);
				if (m && m[2] === wantId) { start = i; break; }
			}
			if (start < 0) return null;
			// 该行区间内 config: 的缩进
			var cfgIndent = -1;
			for (var j = start + 1; j < lines.length; j++) {
				if (/^(\s*)- id:/.test(lines[j])) break;
				var c = /^(\s+)config:\s*$/.exec(lines[j]);
				if (c) { cfgIndent = c[1].length; break; }
			}
			if (cfgIndent < 0) return null;
			// 只接受"恰好是 config 的直接子键"的 enabled（缩进 = cfgIndent + 2）
			for (var k = start + 1; k < lines.length; k++) {
				if (/^(\s*)- id:/.test(lines[k])) break;
				var kv = /^(\s+)enabled:\s*(\S+)\s*$/.exec(lines[k]);
				if (kv && kv[1].length === cfgIndent + 2) {
					return { value: kv[2] === "true", line: k + 1 };
				}
			}
			return { value: null, line: null };
		}
		function innerSwitchValue(plugin, patchText) {
			var row = plugin.patchRow;
			var cfg = (row && row.config) || {};
			if (row && Object.prototype.hasOwnProperty.call(cfg, "enabled")
				&& typeof cfg.enabled === "string") {
				// 服务端已按缩进解析（P2.0 修复），直接用
				return String(cfg.enabled).trim() === "true";
			}
			// 回退：服务端值缺失时，从 patch 原文按缩进自算
			var exact = rowAnchorFromPatch(plugin, patchText);
			if (exact) return exact.value;
			return null;
		}
		// ── F-49 专案（唯一判定点）：rate-throttle 在 config 顶层与 config.routing 下各有一个 enabled ──
		// 顶层那枚管主动节流（总装补丁按设计关掉），routing 那枚管路由/冷却/降档 —— 后者才是本插件主功能
		// （消费点见 lib/rate-throttle/index.js:656、:781；缺省语义 `routingCfg.enabled !== false` 见 :167）。
		// 判据只取服务端已下发的 configPanel.values.routing（值=patch 原文，P2.3 已钉死无遮蔽）。
		// 返回 null 表示"这一层面板没读到"，调用方必须退回通用语义 —— 面板不替插件臆断没读到的开关。
		// 出现第二家双同名 enabled 的插件时再按 debt.md#31 的边界行泛化，勿在此之外散 if 链。
		// ⚠ 与 panel/client/panel.html 里的 rateThrottleRoutingOn 是同一判据的两份实现（两渲染器无共享
		//   文案源，见 p22-cards-ui 的 E 节双渲染器同判钉子）⇒ 改一处必改两处。
		function rateThrottleRoutingOn(plugin) {
			if (!plugin || plugin.dir !== "rate-throttle") return null;
			var routing = ((plugin.configPanel || {}).values || {}).routing;
			if (!routing || typeof routing !== "object") return null;
			if (!Object.prototype.hasOwnProperty.call(routing, "enabled")) return true;
			var v = String(routing.enabled).trim();
			return v === "true" ? true : (v === "false" ? false : null);
		}
		function stateOf(plugin, patchText) {
			var row = plugin.patchRow;
			// ---- P2.4 缺席态优先：服务端 status/statusCopy 为权威，不在场就不该再报「运行中」----
			if (plugin.status === "dependency-broken") {
				return { kind: "dependency-broken", label: plugin.statusCopy || "依赖缺失", style: styles.stateWarn, dot: styles.dotWarn };
			}
			if (plugin.status && plugin.status !== "mounted") {
				return {
					kind: plugin.status,
					label: plugin.statusCopy || ABSENCE_COPY_FALLBACK[plugin.status] || "状态未知",
					style: styles.stateOff,
					dot: styles.dotOff
				};
			}
			if (plugin.dir === "compact-router") {
				// F-45：这里只到"本体在 + 预设行已改"这一层判据（status 已在上面拦过缺席态）。
				// 面板不查宿主的加载结果，预设托管的改动更要重启才落地 ⇒ 不写"正在生效"。
				return { kind: "running", label: "运行中 · 预设托管，预设的改动要重启 DSH 才生效", style: styles.stateOn, dot: styles.dotOn };
			}
			if (!row) {
				return { kind: "config-off", label: "配置层停用 · 未加载", style: styles.stateOff, dot: styles.dotOff };
			}
			// Q1：`disabled` 是条件写法（如 `!!js process.platform === 'win32'`）时，
			// 实际是否加载取决于该表达式，面板**不解释**，因此不能报"运行中"。
			if (row.disabledExpr) {
				return { kind: "config-conditional", label: "配置层是条件开关 · 实际是否加载取决于该表达式，面板不解释", style: styles.stateWarn, dot: styles.dotWarn };
			}
			if (row.enabled !== true) {
				return { kind: "config-off", label: "配置层停用 · 未加载", style: styles.stateOff, dot: styles.dotOff };
			}
			var inner = innerSwitchValue(plugin, patchText);
			// F-49 专案：rate-throttle 的状态以主功能（路由/冷却/降档）为准，主动节流并列说清；
			// 只有两层都关才配得上"暂不生效"。取不到 routing 时 routingOn=null，走下面通用语义。
			var routingOn = rateThrottleRoutingOn(plugin);
			if (routingOn !== null) {
				var throttleOn = inner !== false;
				if (routingOn && throttleOn) {
					return { kind: "running", label: "运行中 · 路由/冷却/降档与主动节流都开着", style: styles.stateOn, dot: styles.dotOn };
				}
				if (routingOn) {
					return { kind: "running", label: "运行中 · 路由/冷却/降档开着，主动节流未开", style: styles.stateOn, dot: styles.dotOn };
				}
				if (throttleOn) {
					return { kind: "running", label: "运行中 · 主动节流开着，路由/冷却/降档未开", style: styles.stateOn, dot: styles.dotOn };
				}
				return { kind: "loaded-off", label: "已加载 · 功能开关关闭，暂不生效", style: styles.stateWarn, dot: styles.dotWarn };
			}
			if (inner === false) {
				return { kind: "loaded-off", label: "已加载 · 功能开关关闭，暂不生效", style: styles.stateWarn, dot: styles.dotWarn };
			}
			return { kind: "running", label: "运行中 · 正在生效", style: styles.stateOn, dot: styles.dotOn };
		}

		function StateRow(props) {
			var s = props.state;
			return react.createElement("div", { style: styles.stateRow },
				react.createElement("span", { style: s.dot }),
				react.createElement("span", { style: s.style }, s.label)
			);
		}

		// 双层开关提醒：配置层开着、内部开关关着时明确说清"怎么才能生效"
		function DualSwitchNotice(props) {
			var plugin = props.plugin;
			if (plugin.patchRow && plugin.patchRow.enabled === true && innerSwitchValue(plugin, props.patchText) === false) {
				// F-49 专案：rate-throttle 主功能（路由）开着时，这一框不能说"所以现在没生效"。
				if (rateThrottleRoutingOn(plugin) === true) {
					return react.createElement("div", { style: styles.dualBox },
						react.createElement("div", { style: styles.dualHead }, "⚠ 两个同名的 enabled 各管各的：主功能开着，主动节流没开"),
						react.createElement("div", { style: styles.dualLine },
							"第一层（配置文件）：", react.createElement("span", { style: styles.dualCode }, "已启用"), " —— 插件已被加载。",
							react.createElement("br"),
							"主动节流（config.enabled）：", react.createElement("span", { style: styles.dualCode }, "关闭"), " —— 限速那一档没工作。",
							react.createElement("br"),
							"路由/冷却/降档（config.routing.enabled）：", react.createElement("span", { style: styles.dualCode }, "开着"),
							" —— 这才是本插件一直在做的主功能。",
							react.createElement("br"),
							"要让它真正工作（这里指主动节流），需要把插件配置里的 ", react.createElement("span", { style: styles.dualCode }, "enabled"),
							" 改为 ", react.createElement("span", { style: styles.dualCode }, "true"), "；改的是配置文件，重启 DSH 后才落地。",
							react.createElement("br"),
							"提示：本面板只负责第一层（加载与否）—— 第二层的参数编辑已随 ",
							react.createElement("span", { style: styles.dualCode }, "P2.3 配置编辑"),
							" 上线，见本卡下方", react.createElement("span", { style: styles.dualCode }, "「参数编辑」"), "。"
						)
					);
				}
				return react.createElement("div", { style: styles.dualBox },
					react.createElement("div", { style: styles.dualHead }, "⚠ 两层开关不一致，所以现在没生效"),
					react.createElement("div", { style: styles.dualLine },
						"第一层（配置文件）：", react.createElement("span", { style: styles.dualCode }, "已启用"), " —— 插件已被加载。",
						react.createElement("br"),
						"第二层（插件内部）：", react.createElement("span", { style: styles.dualCode }, "关闭"), " —— 功能被自己关掉了。",
						react.createElement("br"),
						"要让它真正工作，需要把插件配置里的 ", react.createElement("span", { style: styles.dualCode }, "enabled"),
						" 改为 ", react.createElement("span", { style: styles.dualCode }, "true"), "。",
						react.createElement("br"),
						"提示：本面板只负责第一层（加载与否）—— 第二层的参数编辑已随 ",
						react.createElement("span", { style: styles.dualCode }, "P2.3 配置编辑"),
						" 上线，见本卡下方", react.createElement("span", { style: styles.dualCode }, "「参数编辑」"), "。"
					)
				);
			}
			if (plugin.patchRow && plugin.patchRow.enabled !== true) {
				return react.createElement("div", { style: styles.dualBox },
					react.createElement("div", { style: styles.dualHead }, "⚠ 在配置文件中被停用"),
					react.createElement("div", { style: styles.dualLine },
						"插件当前", react.createElement("span", { style: styles.dualCode }, "完全没有被加载"),
						"，相关功能不会工作。要恢复需把配置行里的 ", react.createElement("span", { style: styles.dualCode }, "disabled"),
						" 去掉或设为 ", react.createElement("span", { style: styles.dualCode }, "false"), "。",
						react.createElement("br"),
						"提示：本卡的启停开关改的就是这一层 —— 直接把开关打开即可恢复。"
					)
				);
			}
			return null;
		}

		function TechRow(props) {
			return react.createElement("div", { style: styles.techRow },
				react.createElement("span", { style: styles.techKey }, props.label + " : "),
				String(props.value)
			);
		}

		function TechDetails(props) {
			var plugin = props.plugin;
			var regs = plugin.registers || {};
			var list = function (arr) {
				var a = arr || [];
				return a.length > 0 ? a.join(", ") : "（无）";
			};
			return react.createElement("details", { style: styles.details },
				react.createElement("summary", { style: styles.summary }, "技术详情"),
				react.createElement(TechRow, { label: "插件目录（dir）", value: plugin.dir }),
				react.createElement(TechRow, { label: "包名（name）", value: plugin.name }),
				react.createElement(TechRow, { label: "managedBy（由谁挂载）", value: String(plugin.managedBy) }),
				react.createElement(TechRow, { label: "enabled（配置文件开关）", value: String(plugin.enabled) }),
				react.createElement(TechRow, { label: "inject（依赖的服务）", value: list(plugin.inject) }),
				react.createElement(TechRow, { label: "services（对外提供的服务）", value: list(regs.services) }),
				react.createElement(TechRow, { label: "commands（注册的命令）", value: list(regs.commands) }),
				react.createElement(TechRow, { label: "providers（提供的实现）", value: list(regs.providers) }),
				react.createElement(TechRow, { label: "events（监听的事件）", value: list(regs.events) })
			);
		}

		function PluginCard(props) {
			var plugin = props.plugin;
			var patchText = props.patchText;
			var desc = DESCRIPTIONS[plugin.dir] || plugin.note || "（暂无功能说明）";
			var cn = CN_NAMES[plugin.dir];
			var state = stateOf(plugin, patchText);
			return react.createElement("div", { style: styles.card },
				react.createElement("h3", { style: styles.cardTitle },
					originalName(plugin),
					originBadge(plugin)
				),
				cn ? react.createElement("div", { style: styles.subtitle }, cn) : null,
				react.createElement("div", { style: styles.desc }, desc),
				react.createElement(StateRow, { state: state }),
				react.createElement(EffectNoteRow, { plugin: plugin }),
				react.createElement(AbsenceBanner, { plugin: plugin }),
				react.createElement(DualSwitchNotice, { plugin: plugin, patchText: patchText }),
				react.createElement(ToggleControls, {
					plugin: plugin,
					patchText: patchText,
					onChanged: props.onChanged
				}),
				plugin.dir === "search-router"
					? react.createElement(SearchRouterModeRow, { plugin: plugin })
					: react.createElement(ConfigEditor, { plugin: plugin, onChanged: props.onChanged }),
				react.createElement(P24Controls, {
					plugin: plugin,
					onChanged: props.onChanged,
					showBanner: props.showBanner
				}),
				react.createElement(TechDetails, { plugin: plugin })
			);
		}

		// ---- P2.2 双层开关：两层**分立呈现**，绝不合并 ----
		//
		// 第一层 `patch-row.disabled`（配置文件里那一行）—— **可写**，走两段式。
		// 第二层 `config.enabled`（插件自己的内部开关）—— **只读展示**，P2.3 才开放编辑。
		//
		// 为什么要分立：两层的语义完全不同（"有没有被加载" vs "加载了但自己关掉功能"），
		// 合并成一个开关会让用户误以为一次点击能同时改变两件事。
		function layerRow(label, valueText, tone) {
			return react.createElement("div", { style: styles.layerRow },
				react.createElement("span", { style: styles.layerLabel }, label),
				react.createElement("span", { style: Object.assign({}, styles.layerValue, tone || {}) }, valueText)
			);
		}

		function ToggleControls(props) {
			var plugin = props.plugin;
			var patchText = props.patchText;
			var onChanged = props.onChanged;
			// compact-router 不在 patch 里（由预设脚本管理），没有可写的行
			var row = plugin.patchRow;
			if (plugin.dir === "compact-router" || !row) {
				return null;
			}
			var tState = react.useState(null);
			var pending = tState[0];
			var setPending = tState[1];
			var bState = react.useState(false);
			var busy = bState[0];
			var setBusy = bState[1];
			var eState = react.useState("");
			var error = eState[0];
			var setError = eState[1];

			var currentEnabled = row.enabled === true;
			var inner = innerSwitchValue(plugin, patchText);
			// Q1：条件写法（`!!js ...`）不解释、也不改写 —— 服务端同样会拒绝（双保险）。
			var conditional = !!row.disabledExpr;

			// 第一段：向服务端要一个方案（只读，不落盘）
			var askToggle = react.useCallback(async function (targetEnabled) {
				setBusy(true);
				setError("");
				setPending(null);
				try {
					var res = await fetch(PANEL_API + "/toggle/plan", {
						method: "POST",
						cache: "no-store",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ rowId: row.id, enabled: targetEnabled })
					});
					var body = await res.json();
					if (!body.ok) {
						setError(body.error || ("HTTP " + res.status));
						return;
					}
					setPending(body.plan);
				} catch (e) {
					setError(e && e.message || e);
				} finally {
					setBusy(false);
				}
			}, [row.id]);

			// 第二段：用户确认后才落盘
			var confirmToggle = react.useCallback(async function () {
				if (!pending) return;
				setBusy(true);
				setError("");
				try {
					var res = await fetch(PANEL_API + "/execute", {
						method: "POST",
						cache: "no-store",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ token: pending.token })
					});
					var body = await res.json();
					if (!body.ok) {
						// 409 的来源要说清楚：文件被别人改过，或方案过期
						setError(body.error || ("HTTP " + res.status));
						setPending(null);
						return;
					}
					setPending(null);
					if (onChanged) await onChanged();
				} catch (e) {
					setError(e && e.message || e);
				} finally {
					setBusy(false);
				}
			}, [pending, onChanged]);

			var cancelToggle = function () { setPending(null); setError(""); };

			var btn = function (label, onClick, disabled) {
				return react.createElement("button", {
					style: Object.assign({}, styles.button, disabled ? styles.buttonDisabled : {}),
					onClick: onClick,
					disabled: !!disabled
				}, label);
			};

			var crossRefs = (pending && pending.crossRefs) || [];

			return react.createElement("div", { style: styles.toggleBox },
				react.createElement("div", { style: styles.toggleHead }, "启停开关（两层分开，改的是第一层）"),

				// 两层分立列明
				layerRow(
					"第一层 · 配置文件（patch-row.disabled）",
					conditional
						? "条件开关（面板不解释）"
						: (currentEnabled ? "已加载" : "未加载（被配置层停用）"),
					conditional ? styles.stateWarn : (currentEnabled ? styles.stateOn : styles.stateOff)
				),
				layerRow(
					"第二层 · 插件内部（config.enabled）",
					inner === null ? "该插件没有内部开关" : (inner ? "开启" : "关闭"),
					inner === null ? styles.stateOff : (inner ? styles.stateOn : styles.stateWarn)
				),

				conditional
					? react.createElement("div", { style: styles.condNote },
						"这一行的 ", react.createElement("span", { style: styles.noteCode }, "disabled"),
						" 是条件写法（", react.createElement("span", { style: styles.noteCode }, row.disabledExpr),
						"）。实际是否加载由该表达式决定，面板不解释、也不会改写它 —— 请手工编辑。")
					: null,

				react.createElement("div", { style: styles.toggleRow },
					btn(currentEnabled ? "停用（改第一层）" : "启用（改第一层）", function () { askToggle(!currentEnabled); }, busy || !!pending || conditional),
					busy && !pending ? react.createElement("span", { style: styles.muted }, "正在生成改动方案…") : null
				),

				// 提交前的确认区：diff + 交叉引用 + 明确写出改哪个文件
				pending ? react.createElement("div", { style: styles.confirmBox },
					react.createElement("div", { style: styles.confirmHead }, "确认后才会写入，下面是具体改动"),
					// 生效时机（人话）：改的是配置文件，不影响当前进程
					react.createElement("div", { style: styles.confirmEffect },
						pending.targetEnabled
							? "执行后此插件将于下次重启时启用（当前未加载的不会立刻加载）。"
							: "执行后此插件将于下次重启时停用（当前仍运行）。"
					),
					react.createElement("div", { style: styles.confirmLine },
						"目标文件：", react.createElement("span", { style: styles.dualCode }, pending.file)
					),
					react.createElement("div", { style: styles.confirmLine },
						"改动位置：第 ", String(pending.anchorLine), " 行的 ", react.createElement("span", { style: styles.dualCode }, "- id: " + pending.rowId)
					),
					react.createElement("pre", { style: styles.diffPre }, (pending.diff || []).join("\n")),
					// disabled 字段本身的人话解释（紧挨 diff）
					react.createElement("div", { style: styles.confirmNote },
						react.createElement("span", { style: styles.noteCode }, "disabled: true"),
						" 的意思是：让 DSH 在下次启动时跳过加载这个插件。它写在配置文件里，"
						+ "不会影响正在运行的进程 —— 所以要重启才会生效。"
					),
					crossRefs.length > 0
						? react.createElement("div", { style: styles.crossBox },
							react.createElement("div", { style: styles.crossHead }, "⚠ 有其它配置引用这个插件（共 " + crossRefs.length + " 处）"),
							crossRefs.map(function (r, i) {
								return react.createElement("div", { key: i, style: styles.crossLine },
									"第 " + r.line + " 行：" + r.text
								);
							}),
							react.createElement("div", { style: styles.crossFoot }, "停用后这些引用会指向一个未加载的插件。若你确认要停用，请继续。")
						)
						: null,
					react.createElement("div", { style: styles.confirmRow },
						btn("确认写入", confirmToggle, busy),
						btn("取消", cancelToggle, busy)
					)
				) : null,

				error ? react.createElement("div", { style: styles.errorBox }, "没能完成：" + error) : null
			);
		}

		// ---- P2.3 参数编辑（rate-throttle 白名单标量；服务端权威校验，前端仅录入）----
		// 字段元数据与 p23-design.md §八 一一对应；合法域以服务端 config-whitelist.mjs
		// 为唯一权威，此处的 min/max 只用于输入框提示与预检。
		var CONFIG_FIELDS = [
			{ path: "enabled", label: "总开关（enabled）", type: "bool", section: "top" },
			{ path: "minIntervalMs", label: "两次请求最小间隔（毫秒）", type: "int", min: 0, max: 3600000, section: "top" },
			{ path: "maxRequestsPerMinute", label: "每分钟最多请求数", type: "int", min: 1, max: 600, section: "top" },
			{ path: "adaptive", label: "自动退避（出错后自动放慢）", type: "bool", section: "top" },
			{ path: "maxIntervalMs", label: "退避间隔上限（毫秒）", type: "int", min: 1, max: 86400000, section: "top" },
			{ path: "backoffFactor", label: "退避放大倍数", type: "num", min: 1, max: 10, section: "top" },
			{ path: "routing.enabled", label: "自动换源总开关（routing.enabled）", type: "bool", section: "routing" },
			{ path: "routing.autoGroups", label: "自动发现模型分组", type: "bool", section: "routing" },
			{ path: "routing.autoGroupTtlMs", label: "分组缓存时长（毫秒）", type: "int", min: 1, max: 86400000, section: "routing" },
			{ path: "routing.cooldownMs", label: "出错冷却时长（毫秒）", type: "int", min: 1, max: 86400000, section: "routing" },
			{ path: "routing.tpmTurnSkip", label: "TPM 超限当轮跳过", type: "bool", section: "routing" },
			{ path: "routing.tpmCooldownMs", label: "TPM 短暂除名时长（毫秒，0=关闭）", type: "int", min: 0, max: 86400000, section: "routing" },
			{ path: "routing.downgradeContextMargin", label: "降级上下文余量（0.1–1）", type: "num", min: 0.1, max: 1, section: "routing" },
			{ path: "routing.maxDowngradeCompactsPerTurn", label: "单轮最多降级压缩次数", type: "int", min: 0, max: 10, section: "routing" },
			{ path: "routing.metricsWindowMs", label: "指标统计窗口（毫秒）", type: "int", min: 1, max: 86400000, section: "routing" },
			{ path: "routing.metricsLogIntervalMs", label: "指标日志间隔（毫秒）", type: "int", min: 1, max: 86400000, section: "routing" },
			{ path: "routing.clearCooldownOnUserSwitch", label: "手动切换时清除冷却", type: "bool", section: "routing" },
			{ path: "routing.syncSelectionOnFailover", label: "换源后同步选择", type: "bool", section: "routing" }
		];

		function ConfigEditor(props) {
			var plugin = props.plugin;
			var panel = plugin.configPanel;
			if (!panel || panel.editable !== true) return null;
			var onChanged = props.onChanged;
			var edits = react.useState({});
			var editValues = edits[0];
			var setEditValues = edits[1];
			var pend = react.useState(null);
			var pending = pend[0];
			var setPending = pend[1];
			var busySt = react.useState(false);
			var busy = busySt[0];
			var setBusy = busySt[1];
			var errSt = react.useState("");
			var error = errSt[0];
			var setError = errSt[1];

			var rawValue = function (f) {
				var v = f.section === "routing"
					? ((panel.values && panel.values.routing) || {})[f.path.split(".")[1]]
					: (panel.values || {})[f.path];
				return v === undefined || v === null ? "" : String(v).trim();
			};
			var draftOf = function (f) {
				return Object.prototype.hasOwnProperty.call(editValues, f.path) ? editValues[f.path] : rawValue(f);
			};
			var setDraft = function (f, v) {
				var next = Object.assign({}, editValues);
				next[f.path] = v;
				setEditValues(next);
			};

			var askPlan = react.useCallback(async function (f) {
				setBusy(true);
				setError("");
				setPending(null);
				try {
					var raw = draftOf(f);
					var value = f.type === "bool" ? (raw === true || raw === "true") : raw;
					var res = await fetch(PANEL_API + "/config/plan", {
						method: "POST",
						cache: "no-store",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ rowId: panel.rowId, path: f.path, value: value })
					});
					var body = await res.json();
					if (!body.ok) {
						setError(body.error || ("HTTP " + res.status));
						return;
					}
					setPending(body.plan);
				} catch (e) {
					setError(e && e.message || e);
				} finally {
					setBusy(false);
				}
			}, [panel.rowId, editValues]);

			var confirmPlan = react.useCallback(async function () {
				if (!pending) return;
				setBusy(true);
				setError("");
				try {
					var res = await fetch(PANEL_API + "/execute", {
						method: "POST",
						cache: "no-store",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ token: pending.token })
					});
					var body = await res.json();
					if (!body.ok) {
						setError(body.error || ("HTTP " + res.status));
						setPending(null);
						return;
					}
					setPending(null);
					if (onChanged) await onChanged();
				} catch (e) {
					setError(e && e.message || e);
				} finally {
					setBusy(false);
				}
			}, [pending, onChanged]);

			var btn = function (label, onClick, disabled) {
				return react.createElement("button", {
					style: Object.assign({}, styles.cfgSave, disabled ? styles.buttonDisabled : {}),
					onClick: onClick,
					disabled: !!disabled
				}, label);
			};

			var rows = [];
			var lastSection = "";
			for (var i = 0; i < CONFIG_FIELDS.length; i++) {
				var f = CONFIG_FIELDS[i];
				if (f.section !== lastSection) {
					lastSection = f.section;
					rows.push(react.createElement("div", { key: "sec-" + f.section, style: styles.cfgSection },
						f.section === "top" ? "config:（顶层）" : "config.routing:（换源）"));
				}
				var draft = draftOf(f);
				var changed = draft !== rawValue(f);
				var input;
				if (f.type === "bool") {
					input = react.createElement("input", {
						type: "checkbox", style: styles.cfgInput, checked: draft === true || draft === "true",
						onChange: function (f) { return function (e) { setDraft(f, e.target.checked ? "true" : "false"); }; }(f)
					});
				} else {
					input = react.createElement("input", {
						type: "text", style: styles.cfgInput, value: String(draft),
						onChange: function (f) { return function (e) { setDraft(f, e.target.value); }; }(f)
					});
				}
				rows.push(react.createElement("div", { key: f.path, style: styles.cfgRow },
					react.createElement("span", { style: styles.cfgLabel }, f.label),
					react.createElement("span", { style: styles.cfgCur }, "当前 " + rawValue(f)),
					input,
					btn(changed ? "生成方案" : "无改动", function (f) { return function () { askPlan(f); }; }(f), busy || !!pending || !changed)
				));
			}

			return react.createElement("div", { style: styles.cfgBox },
				react.createElement("div", { style: styles.cfgHead }, "参数编辑（rate-throttle 限流参数 · 改的是配置文件，重启后生效）"),
				react.createElement("div", { style: styles.cfgNote }, panel.effectNote || ""),
				rows,
				pending ? react.createElement("div", { style: styles.confirmBox },
					react.createElement("div", { style: styles.confirmHead }, "确认后才会写入，下面是具体改动"),
					react.createElement("div", { style: styles.confirmEffect }, pending.effectNote || ""),
					react.createElement("div", { style: styles.confirmLine },
						"目标位置：", react.createElement("span", { style: styles.dualCode }, "cordis.patch.yml 第 " + pending.targetLine + " 行 · " + pending.rowId + " → " + pending.path)
					),
					react.createElement("pre", { style: styles.diffPre }, (pending.diff || []).join("\n")),
					react.createElement("div", { style: styles.confirmNote },
						"该值由插件在启动时读取（", react.createElement("span", { style: styles.noteCode }, "激活快照"),
						"），没有别的配置来源会盖住它 —— 重启后即按新值运行。"
					),
					react.createElement("div", { style: styles.confirmRow },
						btn("确认写入", confirmPlan, busy),
						btn("取消", function () { setPending(null); setError(""); }, busy)
					)
				) : null,
				error ? react.createElement("div", { style: styles.errorBox }, "没能完成：" + error) : null
			);
		}

		// ---- P2.3 search-router mode：只读展示「生效值 + 来源」（第 15 轮方案 1）----
		function SearchRouterModeRow(props) {
			var panel = props.plugin && props.plugin.configPanel;
			if (!panel || !panel.mode) return null;
			return react.createElement("div", { style: styles.modeBox },
				react.createElement("div", { style: styles.cfgHead }, "搜索路由 mode（当前生效值 · 只读）"),
				react.createElement("div", { style: styles.modeLine },
					"生效值：", react.createElement("span", { style: styles.dualCode }, panel.mode.value === null ? "（未设置，走 patch 缺省）" : panel.mode.value),
					"　来源：", react.createElement("span", { style: styles.dualCode }, panel.mode.source)
				),
				react.createElement("div", { style: styles.modeLine }, panel.note || "")
			);
		}

		// ---- W2 余件：四卡"改完要重启"提示位（断点修复批②）----
		// 服务端 configPanel.effectNote 逐卡下发（snapshot.mjs RESTART_EFFECT_NOTE）；
		// rate-throttle（editable）的 effectNote 已在 ConfigEditor 内渲染，本行只补
		// 其余四卡，避免同卡双渲染。
		function EffectNoteRow(props) {
			var panel = props.plugin && props.plugin.configPanel;
			if (!panel || panel.editable === true || !panel.effectNote) return null;
			return react.createElement("div", { style: styles.effectNote }, panel.effectNote);
		}

		// ============================================================
		// P2.4 卸载 / 恢复 / 挂载（**销毁式 v2**，L-060）
		//
		// 文案口径：
		//   · 软卸载 —— 逐句来自 panel/docs/p24-test-plan-batch1.md §2（**一字不改**）。
		//   · 真卸载 —— 改用 panel/docs/p24-design-v2-destroy.md §6.1 **文案 v2（销毁式）**，
		//     必含**三句**：① 空窗期警告（开源前不可恢复、不可重装）② 收据透明句（仅对账、
		//     不含文件内容、不能用于恢复）③ 回收站句（删除不进回收站、无法通过回收站找回）。
		//     并按 Q5 采纳**两补强**：(a) 弹窗顶部重复短句「开源前删除不可恢复」，且空窗期
		//     警告在两次输入**之间**再次展示；(b) 确认前展示**将删文件清单 + 总字节数**。
		// 快照接线字段：status / statusCopy / restoreAvailable / canMount /
		// conflict（冲突三态由 /restore/plan、/mount/plan 返回的 host-key-conflict 驱动）。
		// ============================================================
		var UNINSTALL_COPY = {
			"rate-throttle": {
				soft: {
					title: "软卸载「限流 rate-throttle」",
					del: "让 DSH 下次启动时不再加载「限流」功能模块（不删除磁盘上的源代码文件，源码保留在本地）。",
					consequence: "重启后，平台不再按当前面板里的限流参数进行限速；重启前仍按当前状态运行。",
					timing: "本次执行后，将于下次重启时停用；重启前仍按当前状态运行。",
					archive: "无需存档，源代码文件保留。",
					restorePath: "面板 →「限流 rate-throttle」卡片 → 点「恢复」。",
					restart: "恢复后需要重启才生效。",
					confirm: "请手动输入 rate-throttle 后点「确认软卸载」，或点「取消」。"
				},
				true: {
					title: "真卸载「限流 rate-throttle」——彻底删除，不留副本",
					del: "确认执行后：① 让 DSH 下次启动时不再加载该功能模块；② 彻底删除磁盘上的限流源代码目录（lib/rate-throttle），不保留任何副本。",
					consequence: "重启后，平台不再按当前面板里的限流参数进行限速；重启前仍按当前状态运行。",
					timing: "确认执行后立即删除；对运行中的系统，将在下次重启时停用；重启前仍按当前状态运行。",
					restorePath: "本次删除不可恢复。等项目开源后，你可以重新下载安装，届时面板会检测到「已安装未挂载」并帮你重新挂载。",
					confirm: "请手动输入 rate-throttle 两次并点「确认彻底删除」，或点「取消」。"
				}
			},
			"agent-memory": {
				soft: {
					title: "软卸载「记忆 agent-memory」",
					del: "让 DSH 下次启动时不再加载「记忆」功能模块（不删除磁盘上的源代码文件，源码与已有记忆数据都保留）。",
					consequence: "重启后，记忆内容在压缩结果里不再显示；重启前仍按当前状态运行。",
					timing: "本次执行后，将于下次重启时停用；重启前仍按当前状态运行。",
					archive: "无需存档，源代码与已有记忆数据保留。",
					restorePath: "面板 →「记忆 agent-memory」卡片 → 点「恢复」。",
					restart: "恢复后需要重启才生效。",
					confirm: "请手动输入 agent-memory 后点「确认软卸载」，或点「取消」。"
				},
				true: {
					title: "真卸载「记忆 agent-memory」——彻底删除，不留副本",
					del: "确认执行后：① 让 DSH 下次启动时不再加载该功能模块；② 彻底删除磁盘上的记忆源代码目录（lib/agent-memory），不保留任何副本。",
					consequence: "重启后，记忆内容在压缩结果里不再显示；重启前仍按当前状态运行。",
					timing: "确认执行后立即删除；对运行中的系统，将在下次重启时停用；重启前仍按当前状态运行。",
					restorePath: "本次删除不可恢复。等项目开源后，你可以重新下载安装，届时面板会检测到「已安装未挂载」并帮你重新挂载。",
					confirm: "请手动输入 agent-memory 两次并点「确认彻底删除」，或点「取消」。"
				}
			},
			"compact-router": {
				soft: {
					title: "软卸载「压缩 compact-router」",
					del: "让 DSH 下次启动时不再加载「压缩」功能模块的增强版本，恢复为系统自带版本（不删除磁盘上的源代码文件，源码保留在本地）。",
					consequence: "重启后，平台使用系统自带的压缩功能；限流的自动换源降级功能会退化；记忆功能本身不受影响；重启前仍按当前状态运行。",
					timing: "本次执行后，将于下次重启时停用本面板的压缩增强；重启前仍按当前状态运行。",
					archive: "无需存档，源代码文件保留。",
					restorePath: "面板 →「压缩 compact-router」卡片 → 点「恢复」。",
					restart: "恢复后需要重启才生效。",
					confirm: "请手动输入 compact-router 后点「确认软卸载」，或点「取消」。"
				},
				true: {
					title: "真卸载「压缩 compact-router」——彻底删除，不留副本",
					del: "确认执行后：① 让 DSH 下次启动时恢复为系统自带压缩版本；② 彻底删除磁盘上的压缩源代码目录（lib/compact-router），不保留任何副本。",
					consequence: "重启后，平台使用系统自带的压缩功能；限流的自动换源降级功能会退化；记忆功能本身不受影响；重启前仍按当前状态运行。",
					timing: "确认执行后立即删除；对运行中的系统，将在下次重启时停用；重启前仍按当前状态运行。",
					restorePath: "本次删除不可恢复。等项目开源后，你可以重新下载安装，届时面板会检测到「已安装未挂载」并帮你重新挂载。",
					confirm: "请手动输入 compact-router 两次并点「确认彻底删除」，或点「取消」。"
				}
			},
			"search-router": {
				soft: {
					title: "软卸载「搜索路由 search-router」",
					del: "让 DSH 下次启动时不再加载「搜索路由」功能模块；把面板里一项网页搜索系统设置改回「系统默认（未指定）」（不删除磁盘上的源代码文件，源码保留在本地）。",
					consequence: "重启后，网页搜索退回到系统默认行为：有哪个可用就用哪个，而不是指定本面板的搜索路由；重启前仍按当前状态运行。",
					timing: "本次执行后，将于下次重启时停用；重启前仍按当前状态运行。",
					archive: "无需存档，源代码文件保留。",
					restorePath: "面板 →「搜索路由 search-router」卡片 → 点「恢复」。恢复时若那项系统设置已被其他程序改掉，面板会先提示你选择「保留当前值」还是「恢复成卸载前的值」，不会自动覆盖。",
					restart: "恢复后需要重启才生效。",
					confirm: "请手动输入 search-router 后点「确认软卸载」，或点「取消」。"
				},
				true: {
					title: "真卸载「搜索路由 search-router」——彻底删除，不留副本",
					del: "确认执行后：① 让 DSH 下次启动时不再加载该功能模块；② 把面板里一项网页搜索系统设置改回「系统默认（未指定）」；③ 彻底删除磁盘上的搜索路由源代码目录（lib/search-router），不保留任何副本。",
					consequence: "重启后，网页搜索退回到系统默认行为；重启前仍按当前状态运行。",
					timing: "确认执行后立即删除；对运行中的系统，将在下次重启时停用；重启前仍按当前状态运行。",
					restorePath: "本次删除不可恢复。等项目开源后，你可以重新下载安装，届时面板会检测到「已安装未挂载」并帮你重新挂载。",
					confirm: "请手动输入 search-router 两次并点「确认彻底删除」，或点「取消」。"
				}
			},
			"web-search-local": {
				soft: {
					title: "软卸载「本地搜索 web-search-local」",
					del: "让 DSH 下次启动时不再加载「本地搜索」功能模块；把面板里一项网页抓取系统设置改回「系统默认（未指定）」（不删除磁盘上的源代码文件，源码保留在本地）。",
					consequence: "重启后，网页抓取退回到系统默认行为；「搜索路由」的搜索功能将不可用（它依赖本插件）；若需搜索请同时卸载或保留其一；重启前仍按当前状态运行。",
					timing: "本次执行后，将于下次重启时停用；重启前仍按当前状态运行。",
					archive: "无需存档，源代码文件保留。",
					restorePath: "面板 →「本地搜索 web-search-local」卡片 → 点「恢复」。恢复时若那项系统设置已被其他程序改掉，面板会先提示你选择「保留当前值」还是「恢复成卸载前的值」，不会自动覆盖。",
					restart: "恢复后需要重启才生效。",
					confirm: "请手动输入 web-search-local 后点「确认软卸载」，或点「取消」。"
				},
				true: {
					title: "真卸载「本地搜索 web-search-local」——彻底删除，不留副本",
					del: "确认执行后：① 让 DSH 下次启动时不再加载该功能模块；② 把面板里一项网页抓取系统设置改回「系统默认（未指定）」；③ 彻底删除磁盘上的本地搜索源代码目录（lib/web-search-local），不保留任何副本。",
					consequence: "重启后，网页抓取退回到系统默认行为；「搜索路由」的搜索功能将不可用（它依赖本插件）；重启前仍按当前状态运行。",
					timing: "确认执行后立即删除；对运行中的系统，将在下次重启时停用；重启前仍按当前状态运行。",
					restorePath: "本次删除不可恢复。等项目开源后，你可以重新下载安装，届时面板会检测到「已安装未挂载」并帮你重新挂载。",
					confirm: "请手动输入 web-search-local 两次并点「确认彻底删除」，或点「取消」。"
				}
			}
		};

		// 真卸载（销毁式）**三句必含**（文案 v2 §6.1；判定侧点名用户目视项）：
		//   ① 空窗期警告 ② 收据透明句 ③ 回收站句。另含顶部重复短句（两补强之 a）。
		var TRUE_COMMON = {
			topWarning: "开源前删除不可恢复",
			windowWarning: "⚠ 本次是彻底删除，面板不会留下任何副本。当前版本尚未开源，删除后无法恢复，也无法重新安装。等项目开源后，你可以重新下载安装，届时面板会检测到「已安装未挂载」并帮你重新挂载。",
			receipt: "面板只留下一份删除收据：被删文件的清单、逐个校验值和你的填写原因。收据仅用于事后对账，不含文件内容，不能用来恢复。",
			recycleBin: "注意：删除不进回收站。文件是直接从磁盘上移除的，系统回收站里也找不到，无法通过回收站找回。",
			restart: "恢复后需要重启才生效。"
		};

		// ---- 缺席态横幅（六态；dependency-broken 用警示色）----
		function AbsenceBanner(props) {
			var plugin = props.plugin;
			if (!plugin.status || plugin.status === "mounted") return null;
			var copy = plugin.statusCopy || ABSENCE_COPY_FALLBACK[plugin.status] || "状态未知";
			if (plugin.status === "dependency-broken") {
				return react.createElement("div", { style: styles.absBoxWarn },
					react.createElement("div", { style: styles.absHeadWarn }, "⚠ 依赖缺失"),
					react.createElement("div", { style: styles.absLine }, copy)
				);
			}
			return react.createElement("div", { style: styles.absBox },
				react.createElement("div", { style: styles.absHead }, "当前状态"),
				react.createElement("div", { style: styles.absLine }, copy)
			);
		}

		// ---- §2.9b 软卸载恢复确认页（无文件回写）／挂载确认页（重装后）----
		function restoreCopyOf(plugin, mode, custody) {
			var name = p24Name(plugin);
			if (mode === "mount") {
				return {
					title: "挂载「" + name + "」（重新安装后）",
					body: "将把「" + name + "」的启动入口重新写回挂载面（行块与系统设置项按卸载收据复原）。源代码文件已由你重新安装放回本地，本操作不涉及文件写入。"
				};
			}
			return {
				title: "恢复「" + name + "」（软卸载恢复）",
				body: "将重新打开面板到「" + name + "」的启动入口，源代码文件一直在本地，不涉及文件恢复；若卸载时改动了系统设置项，将一并恢复。"
			};
		}

		function DialogLine(props) {
			return react.createElement("div", { style: props.bold ? styles.dlgLineBold : styles.dlgLine }, props.text);
		}

		// 纯呈现组件：不持状态，便于两套渲染器逐字比对文案。
		function UninstallDialog(props) {
			var plugin = props.plugin;
			var mode = props.mode;
			var set = UNINSTALL_COPY[plugin.dir];
			var c = set && set[mode];
			if (!c) return null;
			var typed = props.typed || {};
			var isTrue = mode === "true";
			var kids = [react.createElement("div", { key: "t", style: styles.dlgTitle }, c.title)];
			// 两补强 (a)：真卸载弹窗顶部重复短句
			if (isTrue) {
				kids.push(react.createElement("div", { key: "topwarn", style: styles.dlgWarnTop }, "⚠ " + TRUE_COMMON.topWarning));
			}
			// H2（D-14）：卸载方向的交叉引用报告（provider 引用 + 声明式依赖）。
			// 与服务端同语义：**只告知、不阻断**——确认按钮仍可用，决定权在用户。
			var xrefs = props.crossRefs || [];
			if (xrefs.length > 0) {
				kids.push(react.createElement("div", { key: "xref", style: styles.crossBox },
					react.createElement("div", { style: styles.crossHead }, "⚠ 有其它配置/插件引用这个插件（共 " + xrefs.length + " 处）"),
					xrefs.map(function (r, i) {
						return react.createElement("div", { key: i, style: styles.crossLine },
							(r.line ? "第 " + r.line + " 行：" : "登记表：") + r.text
						);
					}),
					react.createElement("div", { style: styles.crossFoot }, props.warnAcked
						? "你已知晓上述引用风险；继续即按所选方式执行。"
						: "继续将先只显示这份清单一次（不会替你改引用）；再点一次即执行。")
				));
			}
			var rows = isTrue
				? [
					["删什么", c.del, false],
					["后果（重启后）", c.consequence, false],
					["不可恢复（空窗期）", TRUE_COMMON.windowWarning, true],
					["收据（仅对账）", TRUE_COMMON.receipt, false],
					["回收站", TRUE_COMMON.recycleBin, true],
					["生效时间", c.timing, false],
					["恢复路径", c.restorePath, false],
					["重启", TRUE_COMMON.restart, true],
					["确认操作", c.confirm, false]
				]
				: [
					["删什么", c.del, false],
					["后果（重启后）", c.consequence, false],
					["生效时间", c.timing, false],
					["已存档", c.archive, true],
					["恢复路径", c.restorePath, false],
					["重启", c.restart, true],
					["确认操作", c.confirm, false]
				];
			for (var i = 0; i < rows.length; i++) {
				kids.push(react.createElement("div", { key: "k" + i, style: styles.dlgKey }, rows[i][0]));
				kids.push(react.createElement(DialogLine, { key: "v" + i, text: rows[i][1], bold: rows[i][2] }));
			}
			// 两补强 (b)：确认前展示**将删文件清单 + 总字节数**（来自 plan 的只读枚举）
			if (isTrue && props.willDelete) {
				kids.push(react.createElement("div", { key: "wdk", style: styles.dlgKey }, "将删除"));
				kids.push(react.createElement(DialogLine, {
					key: "wdv",
					text: "共 " + props.willDelete.files + " 个文件，合计 " + props.willDelete.bytes + " 字节（清单已记入收据，可事后对账）。",
					bold: true
				}));
			}
			// §3.6(a)（判定 2026-09-19）：真卸载可选「删除原因」——位置＝将删清单之后、输名之前，
			// 不挤占两次输名之间的空窗期警告；选填，空 ⇒ 收据如实记「（未填写）」。
			if (isTrue) {
				kids.push(react.createElement("div", { key: "rsk", style: styles.dlgKey }, "删除原因（可不填）"));
				kids.push(react.createElement(DialogLine, {
					key: "rsv",
					text: "可以写一句你自己的话，比如「不再需要这个功能」。它会原样写进删除收据，将来帮你想起当时为什么删的。不填也可以，收据会如实记「（未填写）」。"
				}));
				kids.push(react.createElement("input", {
					key: "rsi",
					style: styles.dlgInput,
					value: props.reason === undefined || props.reason === null ? "" : props.reason,
					maxLength: 200,
					placeholder: "可选：写一句话，最多 200 字",
					onChange: function (e) { if (props.onReason) props.onReason(e.target.value); }
				}));
			}
			var count = isTrue ? 2 : 1;
			var inputs = [];
			for (var j = 0; j < count; j++) {
				// 两补强 (a)：空窗期警告在两次输入**之间**再次展示（不可折叠、非小字）
				if (j === 1) {
					inputs.push(react.createElement("div", { key: "midwarn", style: styles.dlgWarn }, TRUE_COMMON.windowWarning));
				}
				inputs.push(react.createElement("input", {
					key: "i" + j,
					style: styles.dlgInput,
					value: typed[j] === undefined ? "" : typed[j],
					placeholder: plugin.dir,
					onChange: function (idx) {
						return function (e) { if (props.onTyped) props.onTyped(idx, e.target.value); };
					}(j)
				}));
			}
			kids.push(react.createElement("div", { key: "inputs" }, inputs));
			kids.push(react.createElement("div", { key: "row", style: styles.uninRow },
				react.createElement("button", { style: styles.btnOpen, disabled: !!props.busy, onClick: props.onConfirm },
					isTrue ? "确认彻底删除" : "确认软卸载"),
				react.createElement("button", { style: styles.btnOpen, disabled: !!props.busy, onClick: props.onCancel }, "取消"),
				props.error ? react.createElement("span", { style: styles.dlgErr }, props.error) : null
			));
			return react.createElement("div", { style: styles.dlgBox }, kids);
		}

		function RestoreDialog(props) {
			var plugin = props.plugin;
			var mode = props.mode;
			var c = restoreCopyOf(plugin, mode, props.custody);
			var kids = [
				react.createElement("div", { key: "t", style: styles.dlgTitle }, c.title),
				react.createElement(DialogLine, { key: "b", text: c.body })
			];
			if (props.conflict) {
				var cur = props.conflict.currentValue === undefined || props.conflict.currentValue === null ? "" : String(props.conflict.currentValue);
				var bak = props.conflict.backupValue === undefined || props.conflict.backupValue === null ? "" : String(props.conflict.backupValue);
				var labels = props.choices && props.choices.length === 3 ? props.choices : null;
				kids.push(react.createElement("div", { key: "cf", style: styles.dlgWarn },
					"若恢复时发现某项系统设置已被其他程序改掉（当前值是 " + cur + "，卸载前是 " + bak
					+ "），弹窗三选一：A. 保留当前值（不覆盖）；B. 恢复成卸载前的值；C. 取消本次恢复。面板不会自动覆盖。"));
				kids.push(react.createElement("div", { key: "cfrow", style: styles.uninRow },
					react.createElement("button", { style: styles.btnRest, onClick: function () { if (props.onChoose) props.onChoose("keep-current"); } }, labels ? labels[0].label : "保留当前值（不覆盖）"),
					react.createElement("button", { style: styles.btnRest, onClick: function () { if (props.onChoose) props.onChoose("restore-backup"); } }, labels ? labels[1].label : "恢复成卸载前的值"),
					react.createElement("button", { style: styles.btnOpen, onClick: props.onCancel }, labels ? labels[2].label : "取消本次恢复")
				));
			} else {
				kids.push(react.createElement("div", { key: "rk", style: styles.dlgKey }, "重启"));
				kids.push(react.createElement(DialogLine, { key: "rv", text: "恢复完成后需要重启才生效。", bold: true }));
				kids.push(react.createElement("div", { key: "ck", style: styles.dlgKey }, "确认操作"));
				kids.push(react.createElement(DialogLine, { key: "cv", text: "点「确认恢复」，或点「取消」。" }));
				kids.push(react.createElement("div", { key: "row", style: styles.uninRow },
					react.createElement("button", { style: styles.btnRest, disabled: !!props.busy, onClick: props.onConfirm }, "确认恢复"),
					react.createElement("button", { style: styles.btnOpen, disabled: !!props.busy, onClick: props.onCancel }, "取消"),
					props.error ? react.createElement("span", { style: styles.dlgErr }, props.error) : null
				));
			}
			return react.createElement("div", { style: styles.dlgBox }, kids);
		}

		// 恢复完成横幅（§2.9 完成后）
		function RestoreBanner(props) {
			if (!props.show) return null;
			return react.createElement("div", { style: styles.banner }, RESTORE_DONE_BANNER);
		}

		// ---- P2.4 卸载 / 恢复控制（两段式：plan → 用户确认 → execute）----
		function P24Controls(props) {
			var plugin = props.plugin;
			var onChanged = props.onChanged;
			var showBanner = props.showBanner;
			// hook 顺序（测试依赖）：[0] dlg / [1] busy / [2] error / [3] typed / [4] reason（§3.6a，追加在尾不扰动既有序）
			var dlgSt = react.useState(null);
			var dlg = dlgSt[0];
			var setDlg = dlgSt[1];
			var busySt = react.useState(false);
			var busy = busySt[0];
			var setBusy = busySt[1];
			var errSt = react.useState("");
			var error = errSt[0];
			var setError = errSt[1];
			var tpSt = react.useState({ 0: "", 1: "" });
			var typed = tpSt[0];
			var setTyped = tpSt[1];
			var reasonSt = react.useState("");
			var reason = reasonSt[0];
			var setReason = reasonSt[1];

			var status = plugin.status || "mounted";
			// 三入口各认快照字段（唯一真源）：
			//   卸载 —— 本体在且非面板已摘除态；恢复 —— restoreAvailable（**软卸载专有**）；
			//   挂载 —— canMount（**重装后**的 installed-unmounted，销毁式 v2 §5）。
			var gone = status === "soft-unmounted" || status === "true-uninstalled" || status === "unknown-absent";
			var canUninstall = !gone;
			var canRestore = plugin.restoreAvailable === true;
			var canMount = plugin.canMount === true;
			if (!canUninstall && !canRestore && !canMount) return null;

			var openUninstall = function (mode) {
				setError("");
				setTyped({ 0: "", 1: "" });
				setReason("");
				setDlg({ kind: "uninstall", mode: mode });
			};

			var doUninstall = react.useCallback(async function (mode, ackWarn) {
				setBusy(true);
				setError("");
				try {
					var list = [];
					for (var i = 0; i < (mode === "true" ? 2 : 1); i++) list.push(String(typed[i] || "").trim());
					// §3.6(a)：真卸载附带可选删除原因（plan 时入账，删除前落收据；空 ⇒ 收据记 null）
					var planPayload = { plugin: plugin.dir, mode: mode, confirm: list };
					if (mode === "true") planPayload.reason = String(reason || "").trim().slice(0, 200);
					var res = await fetch(PANEL_API + "/uninstall/plan", {
						method: "POST", cache: "no-store", headers: { "content-type": "application/json" },
						body: JSON.stringify(planPayload)
					});
					var body = await res.json();
					if (!body.ok) { setError(body.error || ("HTTP " + res.status)); return; }
					// H2（D-14）：卸载方向的交叉引用报告——**只告知、不阻断**。第一拍把它显示出来
					// 并停手（plan 是只读的，没写盘），用户再点一次才真正 execute。
					var xrefs = (body.plan && body.plan.crossRefs) || [];
					if (xrefs.length > 0 && !ackWarn) {
						setDlg({ kind: "uninstall", mode: mode, crossRefs: xrefs });
						setBusy(false);
						return;
					}
					var res2 = await fetch(PANEL_API + "/uninstall/execute", {
						method: "POST", cache: "no-store", headers: { "content-type": "application/json" },
						body: JSON.stringify({ token: body.plan.token })
					});
					var body2 = await res2.json();
					if (!body2.ok) { setError(body2.error || ("HTTP " + res2.status)); return; }
					setDlg(null);
					if (onChanged) await onChanged();
				} catch (e) {
					setError(String(e && e.message || e));
				} finally {
					setBusy(false);
				}
			}, [plugin.dir, typed, reason, onChanged]);

			// 恢复（**软卸载专有**，§2.9b 文案）：副作用 = 行块插回 + 宿主键写回。
			var openRestore = react.useCallback(function () {
				setError("");
				setDlg({ kind: "restore", mode: "soft" });
			}, []);

			var doRestore = react.useCallback(async function (choice) {
				setBusy(true);
				setError("");
				try {
					// 挂载（重装后）与软恢复共用同一确认弹窗；按 dlg.mode 分派到各自端点。
					var isMount = dlg && dlg.mode === "mount";
					var planPath = isMount ? PANEL_API + "/mount/plan" : PANEL_API + "/restore/plan";
					var execPath = isMount ? PANEL_API + "/mount/execute" : PANEL_API + "/restore/execute";
					var payload = { plugin: plugin.dir };
					if (choice) payload.hostKeyChoice = choice;
					var res = await fetch(planPath, {
						method: "POST", cache: "no-store", headers: { "content-type": "application/json" },
						body: JSON.stringify(payload)
					});
					var body = await res.json();
					if (body.ok === false && body.code === "host-key-conflict") {
						setDlg({ kind: "restore", mode: dlg.mode, conflict: body.conflict, choices: body.choices });
						return;
					}
					if (!body.ok) { setError(body.error || ("HTTP " + res.status)); return; }
					var res2 = await fetch(execPath, {
						method: "POST", cache: "no-store", headers: { "content-type": "application/json" },
						body: JSON.stringify({ token: body.plan.token })
					});
					var body2 = await res2.json();
					if (!body2.ok) { setError(body2.error || ("HTTP " + res2.status)); return; }
					setDlg(null);
					if (showBanner) showBanner(RESTORE_DONE_BANNER);
					if (onChanged) await onChanged();
				} catch (e) {
					setError(String(e && e.message || e));
				} finally {
					setBusy(false);
				}
			}, [plugin.dir, dlg, showBanner, onChanged]);

			// 挂载（重装后）：/mount/plan → 冲突三态（如有）→ /mount/execute
			var doMount = react.useCallback(async function (choice) {
				setBusy(true);
				setError("");
				try {
					var payload = { plugin: plugin.dir };
					if (choice) payload.hostKeyChoice = choice;
					var res = await fetch(PANEL_API + "/mount/plan", {
						method: "POST", cache: "no-store", headers: { "content-type": "application/json" },
						body: JSON.stringify(payload)
					});
					var body = await res.json();
					if (body.ok === false && body.code === "host-key-conflict") {
						setDlg({ kind: "restore", mode: "mount", conflict: body.conflict, choices: body.choices });
						return;
					}
					if (!body.ok) { setError(body.error || ("HTTP " + res.status)); return; }
					var res2 = await fetch(PANEL_API + "/mount/execute", {
						method: "POST", cache: "no-store", headers: { "content-type": "application/json" },
						body: JSON.stringify({ token: body.plan.token })
					});
					var body2 = await res2.json();
					if (!body2.ok) { setError(body2.error || ("HTTP " + res2.status)); return; }
					setDlg(null);
					if (showBanner) showBanner(RESTORE_DONE_BANNER);
					if (onChanged) await onChanged();
				} catch (e) {
					setError(String(e && e.message || e));
				} finally {
					setBusy(false);
				}
			}, [plugin.dir, showBanner, onChanged]);

			var kids = [];
			if (canUninstall) {
				// P6 容错：托管文案缺失（插件不在 UNINSTALL_COPY 清单内）→ 降级提示，
				// 不渲染点了没反应的死按钮（hook 序不变，纯渲染分支）。
				var copyMissing = !(UNINSTALL_COPY[plugin.dir] && UNINSTALL_COPY[plugin.dir].soft);
				if (copyMissing) {
					kids.push(react.createElement("div", { key: "hint", style: styles.dlgLine },
						"该插件不在本面板的托管清单内，卸载确认文案缺失——已降级：请在上方「插件管理」区操作，或手动处理。"));
				} else {
					// 销毁式 v2：软 / 真两入口并存。真卸载**不可逆**（弹窗三句必含 + 输入两次）。
					kids.push(react.createElement("div", { key: "hint", style: styles.dlgLine },
						"「软卸载」摘除挂载行、本体保留、可一键恢复；「真卸载」彻底删除本体、不留副本、不可恢复。"));
					kids.push(react.createElement("div", { key: "row", style: styles.uninRow },
						react.createElement("button", { style: styles.btnOpen, disabled: busy, onClick: function () { openUninstall("soft"); } }, "软卸载"),
						react.createElement("button", { style: styles.btnOpen, disabled: busy, onClick: function () { openUninstall("true"); } }, "真卸载")
					));
				}
			}
			if (canRestore) {
				kids.push(react.createElement("div", { key: "restrow", style: styles.uninRow },
					react.createElement("button", { style: styles.btnRest, disabled: busy, onClick: openRestore }, "恢复")
				));
			}
			if (canMount) {
				kids.push(react.createElement("div", { key: "mountrow", style: styles.uninRow },
					react.createElement("button", { style: styles.btnRest, disabled: busy, onClick: function () { doMount(null); } }, "挂载（重装后）")
				));
			}
			if (dlg && dlg.kind === "uninstall") {
				var xrefsShown = (dlg.crossRefs || []).length > 0;
				kids.push(react.createElement(UninstallDialog, {
					key: "dlg-u",
					plugin: plugin,
					mode: dlg.mode,
					crossRefs: dlg.crossRefs || [],
					warnAcked: xrefsShown,
					willDelete: plugin.bodyStats || null,
					typed: typed,
					reason: reason,
					busy: busy,
					error: error,
					onTyped: function (idx, v) {
						var next = Object.assign({}, typed);
						next[idx] = v;
						setTyped(next);
					},
					onReason: function (v) { setReason(String(v || "").slice(0, 200)); },
					// 已显示引用警告时，这一次点击即为"已知晓"（第二拍才 execute）。
					onConfirm: function () { doUninstall(dlg.mode, xrefsShown); },
					onCancel: function () { setDlg(null); setError(""); }
				}));
			}
			if (dlg && dlg.kind === "restore") {
				kids.push(react.createElement(RestoreDialog, {
					key: "dlg-r",
					plugin: plugin,
					mode: dlg.mode,
					custody: dlg.custody,
					conflict: dlg.conflict,
					choices: dlg.choices,
					busy: busy,
					error: error,
					onConfirm: function () { doRestore(null); },
					onChoose: function (choice) { doRestore(choice); },
					onCancel: function () { setDlg(null); setError(""); }
				}));
			}
			return react.createElement("div", { style: styles.uninBox },
				react.createElement("div", { style: styles.uninHead }, "卸载 / 恢复"),
				kids
			);
		}

		// ---- 体检报告人话化 ----
		var SEVERITY_TEXT = { error: "必须修", warning: "建议修", info: "提示" };
		function severityText(sev) {
			return SEVERITY_TEXT[sev] || String(sev);
		}
		function severityStyle(sev) {
			if (sev === "error") return styles.issueError;
			if (sev === "warning") return styles.issueWarning;
			return styles.issueInfo;
		}

		// ---- 批 2：体检操作台（设计稿 p24-design-batch2-console.md §2/§3/§4，判定验收 2026-09-19）----
		// 文案逐字对齐设计稿 §3.1–§3.5（预审通过版）。分域：doctor 域一切经 CLI（两步补确认层）。
		var CONSOLE_REPAIR = {
			kind: "fix",
			title: function (p) { return "修正失效的引用名「" + p.old + "」"; },
			what: function (p) { return "面板将把文件《" + p.file + "》里的旧名字「" + p.old + "」改成新名字「" + p.new + "」（共精确匹配 1 处，改的就是这一处）。"; },
			why: "旧名字已经不再被系统认识，留着它这个引用不会生效；改成新名字后引用即可正常解析。",
			impact: "只改这一个文件里的一处文字；不改你的连接配置（cordis.patch.yml）；不联网；不安装任何东西。",
			rollback: "改动前会自动备份到体检备份区；之后随时可以在本页「体检回滚」里一键还原。",
			failure: "如果文件在这期间被手动改过、导致位置对不上，操作会原地中止，什么都不写、什么都不会坏。",
			confirm: "一次只处理这一条问题。点「确认修正」，或点「取消」。",
			button: "确认修正",
		};
		var CONSOLE_INSTALL = {
			kind: "fix",
			title: function (p) { return "补装缺失的依赖包「" + p.pkg + "」"; },
			what: function (p) { return "面板将从本地目录《" + p.source + "》把包「" + p.pkg + "」复制安装到对应目录的 node_modules。"; },
			version: function (p) { return p.version ? "本地源版本 " + p.version + "，必须满足声明的范围「" + p.range + "」（不满足会原地中止）。" : "安装版本以本地源 package.json 为准，且必须满足声明的范围「" + p.range + "」（不满足会原地中止）。"; },
			impact: "只在本机复制文件，不访问网络；不修改、不删除任何现有文件。",
			rollback: "安装会记入体检台账；之后可以在本页「体检回滚」里一键移除这个包。",
			failure: "如果安装位置已存在同名包、或版本对不上声明的范围，操作会原地中止，什么都不写。",
			confirm: "一次只处理这一条问题。点「确认安装」，或点「取消」。",
			button: "确认安装",
		};
		var CONSOLE_ROLLBACK = {
			kind: "rollback",
			title: function (p) { return "回滚体检操作（" + p.stamp + "）"; },
			what: function (p) { return "面板将把当时改动过的 " + p.files + " 个文件恢复回改动前的备份状态" + (p.packages > 0 ? "；如当时安装过包，也会一并移除（" + p.packages + " 个）" : "") + "。"; },
			impact: "只恢复这份记录里动过的文件，其他一概不动；不联网；不改你的连接配置文件 cordis.patch.yml 的其他内容。",
			rollback: "恢复前会先把当前状态再备份一份——回滚本身也可以再回滚。",
			failure: "如果某个备份文件缺失，回滚会停下并如实报告，不会静默跳过。",
			confirm: "一次只回滚这一份记录。点「确认回滚」，或点「取消」。",
			button: "确认回滚",
			empty: "还没有可以回滚的体检操作——体检操作台还没有改过任何东西。",
		};
		var CONSOLE_SNAPSHOT = {
			kind: "snapshot",
			title: function (p) { return "恢复配置快照（" + p.stamp + "）"; },
			what: function () { return "面板将把配置文件 cordis.patch.yml 恢复到该快照备份时的样子（见下方变化预览）。"; },
			impact: "会改动你的连接配置文件 cordis.patch.yml——这是本页唯一被改动的文件；不联网。恢复完成后需要重启才生效。",
			rollback: "恢复前会先把当前配置再备份一份——这次恢复本身也会留下快照，可再恢复回来。",
			failure: "如果当前配置在你看这份预览之后又被改过，操作会原地中止，什么都不写。",
			confirm: "一次只恢复这一份快照。点「确认恢复」，或点「取消」。",
			button: "确认恢复",
			empty: "还没有可恢复的配置快照——面板每次改动配置前都会自动留一份，做过改动后这里就有了。",
		};
		var CONSOLE_RECEIPTS = {
			note: "收据只是删除的账单：里面只有被删文件的清单、校验值和你填写的原因，没有文件内容，不能用来恢复。",
			empty: "还没有删除收据——你还没有用面板做过真卸载。",
			noReason: "（未填写）",
		};

		function ConsoleSection(props) {
			var doctor = props.doctor;
			var stSt = react.useState({ loading: false, error: "", states: null, snapshots: [] });
			var st = stSt[0];
			var setSt = stSt[1];
			var rcSt = react.useState({ loaded: false, entries: [] });
			var receipts = rcSt[0];
			var setReceipts = rcSt[1];
			var dlgSt = react.useState(null);
			var dlg = dlgSt[0];
			var setDlg = dlgSt[1];
			var busySt = react.useState(false);
			var busy = busySt[0];
			var setBusy = busySt[1];
			var msgSt = react.useState("");
			var msg = msgSt[0];
			var setMsg = msgSt[1];

			var loadStates = react.useCallback(async function () {
				setSt(function (s) { return Object.assign({}, s, { loading: true }); });
				try {
					var res = await fetch(PANEL_API + "/doctor/states", { cache: "no-store" });
					var body = await res.json();
					if (body.ok) {
						setSt({ loading: false, error: "", states: body.states || [], snapshots: body.snapshots || [] });
					} else {
						setSt({ loading: false, error: body.error || "体检回滚记录不可用", states: null, snapshots: body.snapshots || [] });
					}
				} catch (e) {
					setSt({ loading: false, error: String(e && e.message || e), states: null, snapshots: [] });
				}
				try {
					var res2 = await fetch(PANEL_API + "/custody", { cache: "no-store" });
					var body2 = await res2.json();
					setReceipts({ loaded: true, entries: (body2.ok && body2.custody && Array.isArray(body2.custody.entries)) ? body2.custody.entries : [] });
				} catch {
					setReceipts({ loaded: true, entries: [] });
				}
			}, []);

			react.useEffect(function () {
				loadStates();
			}, [loadStates]);

			var beginFix = react.useCallback(async function (issue) {
				setMsg("");
				setBusy(true);
				try {
					var res = await fetch(PANEL_API + "/doctor/apply/plan", {
						method: "POST", cache: "no-store", headers: { "content-type": "application/json" },
						body: JSON.stringify({ issueId: issue.id })
					});
					var body = await res.json();
					if (!body.ok) { setMsg(body.error || ("HTTP " + res.status)); return; }
					var isInstall = body.plan.steps && body.plan.steps.some(function (s) { return s.op === "install-package"; });
					var copy = isInstall ? CONSOLE_INSTALL : CONSOLE_REPAIR;
					setDlg({ kind: copy.kind, copy: copy, issueId: issue.id, plan: body.plan, phase: "confirm" });
				} catch (e) {
					setMsg(String(e && e.message || e));
				} finally {
					setBusy(false);
				}
			}, []);

			var beginRollback = react.useCallback(async function (entry) {
				setMsg("");
				setBusy(true);
				try {
					var res = await fetch(PANEL_API + "/doctor/rollback/plan", {
						method: "POST", cache: "no-store", headers: { "content-type": "application/json" },
						body: JSON.stringify({ stamp: entry.stamp })
					});
					var body = await res.json();
					if (!body.ok) { setMsg(body.error || ("HTTP " + res.status)); return; }
					setDlg({ kind: CONSOLE_ROLLBACK.kind, copy: CONSOLE_ROLLBACK, entry: entry, plan: body.plan, phase: "confirm" });
				} catch (e) {
					setMsg(String(e && e.message || e));
				} finally {
					setBusy(false);
				}
			}, []);

			var beginSnapshot = react.useCallback(async function (snap) {
				setMsg("");
				setBusy(true);
				try {
					var res = await fetch(PANEL_API + "/snapshot-restore/plan", {
						method: "POST", cache: "no-store", headers: { "content-type": "application/json" },
						body: JSON.stringify({ stamp: snap.stamp })
					});
					var body = await res.json();
					if (!body.ok) { setMsg(body.error || ("HTTP " + res.status)); return; }
					setDlg({ kind: CONSOLE_SNAPSHOT.kind, copy: CONSOLE_SNAPSHOT, snap: snap, plan: body.plan, phase: "confirm" });
				} catch (e) {
					setMsg(String(e && e.message || e));
				} finally {
					setBusy(false);
				}
			}, []);

			// dlg.kind 既选 execute 端点、又是"将执行/变化预览"两屏的开关 ⇒ 未知一律本地报错，
			// 绝不静默落到某个端点（这里曾因三处 setDlg 漏传 kind 让修正/回滚每次吃 400）。
			var CONSOLE_EXEC_PATHS = { fix: "/doctor/apply/execute", rollback: "/doctor/rollback/execute", snapshot: "/snapshot-restore/execute" };
			var confirmDlg = react.useCallback(async function () {
				if (!dlg) return;
				setBusy(true);
				setMsg("");
				try {
					if (!dlg.kind || !CONSOLE_EXEC_PATHS[dlg.kind]) {
						setMsg("未知操作类型（kind=" + String(dlg.kind) + "），已停止提交——请关闭本窗后重开一次");
						return;
					}
					var execUrl = PANEL_API + CONSOLE_EXEC_PATHS[dlg.kind];
					var res = await fetch(execUrl, {
						method: "POST", cache: "no-store", headers: { "content-type": "application/json" },
						body: JSON.stringify({ token: dlg.plan.token })
					});
					var body = await res.json();
					if (!body.ok) { setMsg(body.error || ("HTTP " + res.status)); return; }
					setDlg(function (d) { return Object.assign({}, d, { phase: "done", result: body }); });
					await loadStates();
				} catch (e) {
					setMsg(String(e && e.message || e));
				} finally {
					setBusy(false);
				}
			}, [dlg, loadStates]);

			var fixables = doctor && Array.isArray(doctor.issues)
				? doctor.issues.filter(function (it) { return it.fix && it.fix.class !== "manual" && Array.isArray(it.fix.plan) && it.fix.plan.length > 0; })
				: [];

			var dlgKids = null;
			if (dlg) {
				var c = dlg.copy;
				// 文案取数面收敛成一个对象：plan 形态下 rewrite 类的 old/new 只在 steps[0] 里，
				// 直接把 plan 交给 title/what 就会渲染出「undefined」；install 类的 pkg/source/version/range 在 extra 里。
				var firstStep = (dlg.plan && Array.isArray(dlg.plan.steps) && dlg.plan.steps[0]) || {};
				var copyData = dlg.plan
					? Object.assign({}, dlg.plan, { old: firstStep.old, new: firstStep.new, file: dlg.plan.file != null ? dlg.plan.file : firstStep.file }, dlg.plan.extra || {})
					: (dlg.entry || dlg.snap || {});
				var lines = [
					react.createElement("div", { key: "t", style: styles.dlgTitle }, c.title(copyData)),
					react.createElement("div", { key: "w", style: styles.dlgLine }, c.what(copyData)),
				];
				if (c.why) lines.push(react.createElement("div", { key: "why", style: styles.dlgLine }, c.why));
				if (c.version && dlg.plan && dlg.plan.extra) lines.push(react.createElement("div", { key: "ver", style: styles.dlgLine }, c.version(dlg.plan.extra)));
				lines.push(react.createElement("div", { key: "imp", style: styles.dlgLine }, c.impact));
				lines.push(react.createElement("div", { key: "rb", style: styles.dlgLine }, c.rollback));
				lines.push(react.createElement("div", { key: "fl", style: styles.dlgLine }, c.failure));
				if (dlg.kind === "fix" && dlg.plan && Array.isArray(dlg.plan.steps)) {
					lines.push(react.createElement("div", { key: "sk", style: styles.dlgKey }, "将执行"));
					for (var si = 0; si < dlg.plan.steps.length; si++) {
						var s = dlg.plan.steps[si];
						lines.push(react.createElement("div", { key: "s" + si, style: styles.techRow },
							s.op + (s.file ? " · " + s.file : "") + (s.op === "replace" ? " ：「" + s.old + "」→「" + s.new + "」" : "")));
					}
				}
				if (dlg.kind === "snapshot" && dlg.plan && Array.isArray(dlg.plan.diff)) {
					lines.push(react.createElement("div", { key: "dfk", style: styles.dlgKey }, "变化预览"));
					for (var di = 0; di < dlg.plan.diff.length; di++) {
						lines.push(react.createElement("div", { key: "d" + di, style: styles.pre }, dlg.plan.diff[di]));
					}
				}
				lines.push(react.createElement("div", { key: "ck", style: styles.dlgKey }, "确认操作"));
				lines.push(react.createElement("div", { key: "cv", style: styles.dlgLine }, c.confirm));
				if (dlg.phase === "done") {
					lines.push(react.createElement("div", { key: "ok", style: styles.dlgLineBold },
						dlg.kind === "rollback" ? "回滚完成。" : dlg.kind === "snapshot" ? "快照恢复完成，重启后生效。" : "已执行完成（详情见下方执行记录）。"));
				}
				lines.push(react.createElement("div", { key: "row", style: styles.uninRow },
					dlg.phase === "done"
						? react.createElement("button", { style: styles.btnOpen, disabled: busy, onClick: function () { setDlg(null); } }, "关闭")
						: react.createElement("button", { style: styles.btnRest, disabled: busy, onClick: confirmDlg }, c.button),
					dlg.phase === "done" ? null : react.createElement("button", { style: styles.btnOpen, disabled: busy, onClick: function () { setDlg(null); } }, "取消"),
					msg ? react.createElement("span", { style: styles.dlgErr }, msg) : null
				));
				dlgKids = react.createElement("div", { style: styles.dlgBox }, lines);
			}

			var applyEntries = st.states ? st.states.filter(function (s) { return s.action === "apply"; }) : [];
			return react.createElement("div", { style: styles.issues },
				react.createElement("h2", { style: styles.h2 }, "操作台（可执行项 · 确认一次改一处）"),
				fixables.length === 0
					? react.createElement("div", { style: styles.allGood }, "当前没有可以自动处理的问题。")
					: fixables.map(function (it) {
						return react.createElement("div", { key: "fx" + it.id + ":" + it.line, style: Object.assign({}, styles.issue, severityStyle(it.severity)) },
							react.createElement("b", null, severityText(it.severity)), "：" + (it.message || ""),
							react.createElement("div", { style: styles.techRow }, it.id + " · " + it.file + ":" + it.line),
							react.createElement("button", { style: styles.btnRest, disabled: busy, onClick: function () { beginFix(it); } }, "执行"));
					}),
				react.createElement("h2", { style: styles.h2 }, "体检回滚（doctor 域 · 每次改动可还原）"),
				st.loading ? react.createElement("div", { style: styles.muted }, "读取中…") : null,
				!st.loading && st.error ? react.createElement("div", { style: styles.issueWarning }, "体检回滚暂不可用：" + st.error) : null,
				!st.loading && !st.error && applyEntries.length === 0 ? react.createElement("div", { style: styles.allGood }, CONSOLE_ROLLBACK.empty) : null,
				applyEntries.map(function (entry) {
					return react.createElement("div", { key: entry.stamp, style: styles.issue },
						react.createElement("b", null, entry.stamp), " · 改动 " + entry.files + " 个文件" + (entry.packages > 0 ? " · 安装 " + entry.packages + " 个包" : ""),
						react.createElement("div", { style: styles.uninRow },
							react.createElement("button", { style: styles.btnRest, disabled: busy, onClick: function () { beginRollback(entry); } }, "回滚")));
				}),
				react.createElement("h2", { style: styles.h2 }, "配置快照（面板写操作前的自动备份 · 最近 5 份）"),
				st.snapshots.length === 0 ? react.createElement("div", { style: styles.allGood }, CONSOLE_SNAPSHOT.empty) : null,
				st.snapshots.map(function (snap) {
					return react.createElement("div", { key: "sn" + snap.stamp, style: styles.issue },
						react.createElement("b", null, snap.stamp), " · " + (snap.reason || "panel") + " · sha " + String(snap.sha256 || "").slice(0, 8) + " · " + snap.bytes + " 字节",
						react.createElement("div", { style: styles.uninRow },
							react.createElement("button", { style: styles.btnRest, disabled: busy, onClick: function () { beginSnapshot(snap); } }, "恢复")));
				}),
				react.createElement("h2", { style: styles.h2 }, "删除收据（只读对账 · 不能恢复）"),
				react.createElement("div", { style: styles.dlgLine }, CONSOLE_RECEIPTS.note),
				receipts.loaded && receipts.entries.length === 0 ? react.createElement("div", { style: styles.allGood }, CONSOLE_RECEIPTS.empty) : null,
				receipts.entries.map(function (r) {
					return react.createElement("div", { key: r.custodyId, style: styles.issue },
						react.createElement("b", null, r.plugin || r.custodyId), " · " + r.createdAt + " · 删除 " + r.fileCount + " 个文件 · 共 " + r.totalBytes + " 字节",
						react.createElement("div", { style: styles.techRow }, "原因：" + (r.userReason || CONSOLE_RECEIPTS.noReason)));
				}),
				dlgKids
			);
		}

		function ToolkitPanel() {
			var state = react.useState(null);
			var snapshot = state[0];
			var setSnapshot = state[1];
			var metaState = react.useState("加载中…");
			var meta = metaState[0];
			var setMeta = metaState[1];
			var patchState = react.useState("");
			var patchText = patchState[0];
			var setPatchText = patchState[1];
			var doctorState = react.useState(null);
			var doctor = doctorState[0];
			var setDoctor = doctorState[1];
			var runningState = react.useState(false);
			var doctorRunning = runningState[0];
			var setDoctorRunning = runningState[1];
			var errorState = react.useState("");
			var doctorError = errorState[0];
			var setDoctorError = errorState[1];
			// P2.4：恢复完成横幅（§2.9 完成后「恢复完成，重启后生效」）
			var bannerState = react.useState("");
			var banner = bannerState[0];
			var setBanner = bannerState[1];

			var loadSnapshot = react.useCallback(async function () {
				try {
					var res = await fetch(PANEL_API + "/snapshot", { cache: "no-store" });
					if (res.status === 403) {
						setMeta("拒绝访问：本页面只允许在这台电脑上打开。");
						return;
					}
					var body = await res.json();
					if (!body.ok) {
						setMeta("读取失败：" + (body.error || res.status));
						return;
					}
					var snap = body.snapshot;
					var self = snap.self || {};
					setSnapshot(snap);
					setPatchText(snap.patch ? snap.patch.text : "");
					setMeta(snap.toolkitName + " " + snap.toolkitVersion + " · 本面板" + (self.enabled ? "已启用" : "未启用"));
				} catch (e) {
					setMeta("读取失败：" + (e && e.message || e));
				}
			}, []);

			var runDoctor = react.useCallback(async function () {
				setDoctorRunning(true);
				setDoctor(null);
				setDoctorError("");
				try {
					var res = await fetch(PANEL_API + "/doctor/dry-run", { method: "POST", cache: "no-store" });
					var body = await res.json();
					if (!body.ok) {
						setDoctorError(body.error || ("HTTP " + res.status));
						return;
					}
					setDoctor(body.report || {});
				} catch (e) {
					setDoctorError(e && e.message || e);
				} finally {
					setDoctorRunning(false);
				}
			}, []);

			react.useEffect(function () {
				loadSnapshot();
			}, [loadSnapshot]);

			var cards = snapshot && Array.isArray(snapshot.plugins)
				? snapshot.plugins.map(function (p) {
					return react.createElement(PluginCard, { key: p.dir, plugin: p, patchText: patchText, onChanged: loadSnapshot, showBanner: setBanner });
				})
				: [];

			var summary = (doctor && doctor.summary) || {};
			var nErr = summary.error || 0;
			var nWarn = summary.warning || 0;
			var nInfo = summary.info || 0;
			var doctorStatus = doctorRunning
				? "正在体检…"
				: doctorError
					? "体检没能完成：" + doctorError
					: doctor
						? (nErr === 0 && nWarn === 0
							? "体检完成：一切正常" + (nInfo > 0 ? "（另有 " + nInfo + " 条提示）" : "")
							: "体检完成：发现 " + ((nErr > 0 ? nErr + " 个必须修的问题" : "")) + (nErr > 0 && nWarn > 0 ? "、" : "") + (nWarn > 0 ? nWarn + " 个建议修的问题" : ""))
						: "";

			var doctorIssues = null;
			if (doctor && Array.isArray(doctor.issues) && doctor.issues.length > 0) {
				doctorIssues = doctor.issues.map(function (it) {
					return react.createElement("div", { key: String(it.id) + ":" + String(it.line), style: Object.assign({}, styles.issue, severityStyle(it.severity)) },
						react.createElement("b", null, severityText(it.severity)),
						"：" + (it.message || ""),
						react.createElement("div", { style: styles.techRow }, it.id + " · " + it.file + ":" + it.line)
					);
				});
			} else if (doctor) {
				doctorIssues = react.createElement("div", { style: styles.allGood }, "✓ 没有发现任何问题，配置是健康的。");
			}

			return react.createElement("div", { style: styles.root },
				react.createElement("h1", { style: styles.title }, "dsh-toolkit 面板（插件开关与体检）"),
				react.createElement("div", { style: styles.muted }, meta),
				react.createElement("div", { style: styles.toolbar },
					react.createElement("button", { style: styles.button, onClick: loadSnapshot }, "重新读取状态"),
					react.createElement("button", { style: Object.assign({}, styles.button, doctorRunning ? styles.buttonDisabled : {}), onClick: runDoctor, disabled: doctorRunning }, "一键体检（只查不改）"),
					react.createElement("span", { style: styles.muted }, doctorStatus)
				),
				react.createElement(RestoreBanner, { show: !!banner }),
				// P6 归一：registry 通用管理区（自适应 · 新装插件免刷新自动出现）——原 v2 标签页整体并入
				react.createElement(V2Section, { key: "v2-section" }),
				// P6 归一：旧 5 卡片区降级为「内置插件工具区」，插件特有入口（两层开关/参数编辑/
				// 卸载恢复/技术详情）原样保留在本区，入口可达（P6 映射表见 P6 报告）
				react.createElement("h2", { style: styles.h2 }, "内置插件工具区（patch 域 · 开关 / 参数 / 卸载恢复）"),
				react.createElement("div", { style: styles.cards }, cards),
				react.createElement("h2", { style: styles.h2 }, "配置文件原文（cordis.patch.yml · 插件开关所在）"),
				react.createElement("pre", { style: styles.pre }, patchText),
				react.createElement("h2", { style: styles.h2 }, "体检与操作台（doctor dry-run · 只查不改＋逐条确认后才执行）"),
				react.createElement("div", { style: styles.issues }, doctorIssues),
				react.createElement(ConsoleSection, { doctor: doctor })
			);
		}

		// ════ P5 泛化线 → P6 归一：registry 驱动的通用管理区（REQ-5 / 债务 #9 / P6 面板归一）════════
		// P6 起本区块并入唯一 toolkit-panel 标签页（ToolkitPanel 顶部），不再是独立标签页；
		// 数据源仅为 PANEL_API/v2/*（registry/doctor 服务与带前缀事件流），
		// 零具体子插件模块引用——新装插件免刷新自适应（no-subplugin-import-check 守卫）。
		var V2_API = PANEL_API + "/v2";

		// 安装来源的绝对路径判别（第五步 UX / Q1 裁决「仅本地路径」）：Windows 盘符、
		// UNC、以及 POSIX 根路径算绝对；其余（含 "my-plugin"、"C:my-plugin" 这类盘内相对）
		// 一律提交前拦下——服务端按进程工作目录解析它们，用户看到的报错会指向 System32
		// 一类的意外位置，不如在这里一次说清。
		function isAbsoluteLocalPath(p) {
			return /^[a-zA-Z]:[\\/]/.test(p) || /^[\\/]{2}/.test(p) || /^\//.test(p);
		}
		var V2_EVENT_NAMES = ["plugin-added", "plugin-removed", "status-changed", "health-changed", "issue-found",
			"audit:installed", "audit:removed", "audit:enabled", "audit:disabled", "audit:reloaded", "audit:quarantined", "audit:config-changed", "audit:state-save-failed"];

		function v2Api(path, body) {
			return fetch(V2_API + path, {
				method: body === undefined ? "GET" : "POST",
				headers: body === undefined ? {} : { "content-type": "application/json" },
				body: body === undefined ? undefined : JSON.stringify(body),
				cache: "no-store"
			}).then(function (res) { return res.json(); });
		}

		// SSE + 断连降级轮询 + 恢复切回（与 panel/manager/realtime-connector.mjs 同构；
		// ModuleLoader 客户端为 CJS 无法 import ESM，故内联同语义实现，行为以 panel-v2 测试为准）。
		function createV2Connector(handlers) {
			var pollTimer = null;
			var polling = false;
			function startPolling() {
				if (polling) return;
				polling = true;
				var tick = function () {
					fetch(V2_API + "/snapshot", { cache: "no-store" })
						.then(function (r) { return r.json(); })
						.then(function (data) { if (data && data.ok) handlers.onSnapshot(data); })
						.catch(function () {});
				};
				tick();
				pollTimer = setInterval(tick, 3000);
			}
			function stopPolling() { if (pollTimer !== null) { clearInterval(pollTimer); pollTimer = null; } polling = false; }
			var es = new EventSource(V2_API + "/events");
			es.onopen = function () { stopPolling(); handlers.onMode("sse"); };
			es.onerror = function () { startPolling(); handlers.onMode("poll"); };
			es.onmessage = function (m) { try { handlers.onEvent("message", JSON.parse(m.data)); } catch (e) {} };
			V2_EVENT_NAMES.forEach(function (name) {
				es.addEventListener(name, function (m) {
					try { handlers.onEvent(name, JSON.parse(m.data)); } catch (e) {}
				});
			});
			return { close: function () { stopPolling(); es.close(); } };
		}

		// P6 归一：客户端传输复用 realtime-connector——主路径动态 import 服务端直出的
		// ESM 模块（/v2/connector.js，即 panel/manager/realtime-connector.mjs，panel-v2
		// 测试覆盖的同一模块文件）；受限环境（无模块加载器 / Node 测试桩）自动回退到
		// 上方同语义内联实现。两条路径语义一致，且都有测试覆盖（panel-v2 覆盖 ESM 模块，
		// panel-unified 覆盖内联孪生与归一面板实际接线）。
		// 注意两种形态差异：内联实现创建即连接；ESM 模块返回 {start,stop}，必须显式
		// start()——工厂在此统一适配为「create(handlers) → {close}」单一形态。
		var connectorModulePromise = null;
		function v2ConnectorFactory() {
			if (!connectorModulePromise) {
				try {
					connectorModulePromise = Promise.resolve(import(V2_API + "/connector.js")).then(
						function (m) {
							var create = m && typeof m.createRealtimeConnector === "function" ? m.createRealtimeConnector : null;
							if (!create) return createV2Connector;
							return function (handlers) {
								var c = create({
									sseUrl: V2_API + "/events",
									snapshotUrl: V2_API + "/snapshot",
									eventNames: V2_EVENT_NAMES,
									pollIntervalMs: 3000,
									onSnapshot: handlers.onSnapshot,
									onEvent: handlers.onEvent,
									onModeChange: handlers.onMode,
								});
								c.start();
								return { close: function () { c.stop(); } };
							};
						},
						function () { return createV2Connector; }
					);
				} catch (e) {
					connectorModulePromise = Promise.resolve(createV2Connector);
				}
			}
			return connectorModulePromise;
		}

		// schemastery 纯定义（dsh.plugin.json configSchema 落盘形态）→ 表单控件（债务 #8）
		function v2RenderField(def, value, onValue, keyPrefix) {
			if (!def || typeof def !== "object") return null;
			var meta = def.meta || {};
			var label = keyPrefix;
			var inputStyle = { padding: "3px 6px", borderRadius: "4px", border: "1px solid #8888", font: "inherit" };
			if (def.type === "object") {
				var dict = def.dict || {};
				var children = Object.keys(dict).map(function (k) {
					var childValue = value && typeof value === "object" ? value[k] : undefined;
					return v2RenderField(dict[k], childValue, function (v) {
						var next = Object.assign({}, value || {});
						next[k] = v;
						onValue(next);
					}, (keyPrefix ? keyPrefix + "." : "") + k);
				}).filter(Boolean);
				return react.createElement("fieldset", { key: keyPrefix || "root", style: { border: "1px dashed #8886", margin: "4px 0", padding: "4px 8px" } },
					react.createElement("legend", { style: { fontSize: "12px", color: "#777" } }, label || "config"),
					children.length ? children : react.createElement("div", { style: { color: "#999", fontSize: "12px" } }, "（无配置项）"));
			}
			var els = [];
			if (def.type === "union" && Array.isArray(def.list)) {
				var options = def.list.map(function (item) {
					return react.createElement("option", { key: String(item && item.value), value: String(item && item.value) }, String(item && item.value));
				});
				els.push(react.createElement("label", { key: keyPrefix, style: { display: "block", margin: "3px 0", fontSize: "13px" } },
					label + "：",
					react.createElement("select", { style: inputStyle, value: String(value === undefined ? "" : value), onChange: function (e) { onValue(e.target.value); } }, options)));
			} else if (def.type === "array") {
				var text = Array.isArray(value) ? value.join(", ") : "";
				els.push(react.createElement("label", { key: keyPrefix, style: { display: "block", margin: "3px 0", fontSize: "13px" } },
					label + "（逗号分隔）：",
					react.createElement("input", { type: "text", style: inputStyle, value: text, onChange: function (e) {
						onValue(e.target.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean));
					} })));
			} else if (def.type === "boolean") {
				els.push(react.createElement("label", { key: keyPrefix, style: { display: "block", margin: "3px 0", fontSize: "13px" } },
					label + "：",
					react.createElement("input", { type: "checkbox", checked: value === true, onChange: function (e) { onValue(e.target.checked); } })));
			} else if (def.type === "number") {
				els.push(react.createElement("label", { key: keyPrefix, style: { display: "block", margin: "3px 0", fontSize: "13px" } },
					label + "：",
					react.createElement("input", { type: "number", style: inputStyle, value: value === undefined || value === null ? "" : value,
						onChange: function (e) { onValue(e.target.value === "" ? undefined : Number(e.target.value)); } })));
			} else {
				els.push(react.createElement("label", { key: keyPrefix, style: { display: "block", margin: "3px 0", fontSize: "13px" } },
					label + "：",
					react.createElement("input", { type: "text", style: inputStyle, value: value === undefined || value === null ? "" : value,
						onChange: function (e) { onValue(e.target.value); } })));
			}
			if (meta && meta.required) {
				els.push(react.createElement("span", { key: keyPrefix + ":req", style: { color: "#cf222e", fontSize: "11px" } }, "必填"));
			}
			return react.createElement("div", { key: "wrap:" + keyPrefix }, els);
		}

		function RegistryPluginCard(props) {
			var p = props.plugin;
			var reactSt = react.useState(null);
			var confirm = reactSt[0];
			var setConfirm = reactSt[1];
			var openSt = react.useState("");
			var open = openSt[0];
			var setOpen = openSt[1];
			var draftSt = react.useState({});
			var draft = draftSt[0];
			var setDraft = draftSt[1];

			var healthLine = p.health
				? "健康：" + p.health.status + (p.healthSummary && p.healthSummary.errors ? "（错误 " + p.healthSummary.errors + "）" : "") + (p.healthSummary && p.healthSummary.warnings ? "（警告 " + p.healthSummary.warnings + "）" : "")
				: "健康：未知";
			var act = function (fn) {
				return function () {
					setConfirm(null);
					fn().then(function (result) {
						if (result && result.ok !== false) props.onChanged();
						else if (result) props.onError(result);
					}).catch(function (error) { props.onError(error); });
				};
			};
			var toggleHealth = function () {
				// F-72：载入成功后 open 是 "health:"+JSON（下方 setOpen 写入），守卫此前只判
				// "health"/"health-error" 字面 ⇒ 二次点击永不折叠且恒重发。补前缀判据，
				// 与渲染分支（indexOf("health:") === 0）同判。
				if (open === "health" || open === "health-error" || open.indexOf("health:") === 0) { setOpen(""); return; }
				setOpen("health");
				v2Api("/health?id=" + encodeURIComponent(p.id)).then(function (data) {
					var items = (data.report && data.report.items) || [];
					setConfirm(null);
					setOpen("health:" + JSON.stringify({
						status: (data.report && data.report.status) || "未知",
						items: items,
						history: (data.history || []).map(function (h) { return h.status; })
					}));
				}).catch(function () { setOpen("health-error"); });
			};
			var healthDetail = null;
			// P6 容错：健康详情拉取失败 → 降级提示（旧实现解析失败静默渲染 null，用户点了没反应）
			if (open === "health-error") {
				healthDetail = react.createElement("div", { style: { borderTop: "1px dashed #8886", marginTop: "6px", paddingTop: "6px", fontSize: "13px", color: "#8a6d00" } },
					"⚠ 健康详情暂不可用（doctor 服务不可达或网络异常），已降级显示。");
			} else if (open && open.indexOf("health:") === 0) {
				try {
					var parsed = JSON.parse(open.slice(7));
					healthDetail = react.createElement("div", { style: { borderTop: "1px dashed #8886", marginTop: "6px", paddingTop: "6px" } },
						react.createElement("div", { style: { fontSize: "13px" } }, "当前状态：", react.createElement("b", null, parsed.status),
							p.hasHealthCheck ? "（含插件自定义健康检查）" : null),
						parsed.items.length === 0 ? react.createElement("div", { style: { fontSize: "12px", color: "#1a7f37" } }, "无发现") :
							parsed.items.map(function (i, idx) {
								return react.createElement("div", { key: idx, style: { borderLeft: "3px solid " + (i.level === "error" ? "#cf222e" : i.level === "warn" ? "#b58900" : "#1a7f37"), margin: "4px 0", padding: "2px 8px", background: "#88811110", fontSize: "13px" } },
									react.createElement("b", null, i.code), "（", i.level, "）", i.message,
									i.fix ? react.createElement("div", { style: { fontSize: "12px", color: "#777" } }, "修复：" + i.fix.summary + (i.fix.steps ? "（" + i.fix.steps.join("；") + "）" : "")) : null);
							}),
						react.createElement("div", { style: { fontSize: "12px", color: "#888", marginTop: "4px" } }, "历史：" + (parsed.history.join(" → ") || "—")));
				} catch (e) { healthDetail = null; }
			}
			var configDetail = null;
			if (open === "config") {
				var schemaJSON = p.configSchemaJSON;
				// T0 修复（真插件闭环实测）：表单必须以 p.config+draft 合并值为基准渲染——
				// 原实现每次编辑都基于渲染时的 p.config 重建整个对象，多字段编辑只留最后一次。
				var merged = Object.assign({}, p.config, draft);
				var form = schemaJSON && schemaJSON.type === "object"
					? v2RenderField(schemaJSON, merged, function (v) { setDraft(v); }, "")
					: react.createElement("div", { style: { fontSize: "12px", color: "#888" } }, "插件未声明 configSchema，无表单可渲染（可在安装向导反馈中要求作者补充）");
				configDetail = react.createElement("div", { style: { borderTop: "1px dashed #8886", marginTop: "6px", paddingTop: "6px" } },
					form,
					react.createElement("button", {
						style: { marginTop: "6px" },
						// T0 修复（P6 潜伏 bug）：/config 是写路由，confirm 必须逐字等于插件 id，
						// 缺失时 v2 API 一律 400 confirm-missing（真实插件闭环实测暴露）。
						onClick: act(function () { return v2Api("/config", { id: p.id, config: schemaJSON && schemaJSON.type === "object" ? (Object.keys(draft).length ? draft : p.config) : p.config, confirm: p.id }); })
					}, "保存配置（写回 registry）"));
			}
			var confirmBox = null;
			if (confirm) {
				confirmBox = react.createElement("div", { style: { borderTop: "1px dashed #8886", marginTop: "6px", paddingTop: "6px", fontSize: "13px" } },
					react.createElement("div", null, confirm.text),
					react.createElement("label", null,
						react.createElement("input", { type: "checkbox", checked: confirm.checked, onChange: function (e) { confirm.setChecked(e.target.checked); } }),
						" 我确认操作该插件"),
					react.createElement("button", { disabled: !confirm.checked, onClick: confirm.go }, "执行"));
			}
			var openConfig = function () { setOpen(open === "config" ? "" : "config"); };
			var askConfirm = function (text, run) {
				setConfirm({
					text: text,
					checked: false,
					setChecked: function (v) {
						setConfirm(function (c) { return Object.assign({}, c, { checked: v }); });
					},
					go: act(function () { return run(); })
				});
			};
			return react.createElement("div", { style: { border: "1px solid #8884", borderRadius: "8px", padding: "8px 10px", margin: "8px 0" } },
				react.createElement("div", { style: { fontWeight: 600 } },
					p.displayName, " ",
					react.createElement("span", { style: { fontSize: "11px", border: "1px solid #8886", borderRadius: "4px", padding: "0 4px", color: "#777" } }, "v" + p.version),
					react.createElement("span", { style: { fontSize: "11px", border: "1px solid #8886", borderRadius: "4px", padding: "0 4px", color: "#777" } }, "契约 " + p.contract),
					p.legacy ? react.createElement("span", { style: { fontSize: "11px", border: "1px solid #b5890088", borderRadius: "4px", padding: "0 4px", color: "#8a6d00" } }, "legacy 模式") : null),
				react.createElement("div", { style: { fontSize: "12px", color: "#777" } }, p.id),
				react.createElement("div", { style: { fontSize: "13px" } },
					// H1（D-11）：persisted===false 表示这条只在内存里、没落到 state.json。
					// 此时不许再报成绿的"active"——黄字 + "未落盘（重启会丢）"，原因在上方横幅里。
					react.createElement("b", { style: { color: p.status === "active" ? (p.persisted === false ? "#b58900" : "#1a7f37") : (p.status === "error" || p.status === "quarantined") ? "#cf222e" : "#586069" } },
						p.status + (p.persisted === false ? " · 未落盘（重启会丢）" : "")),
					"　", healthLine),
				p.lastError ? react.createElement("div", { style: { fontSize: "12px", color: "#cf222e" } }, "最近错误 ", react.createElement("b", null, p.lastError.code), "：", p.lastError.message) : null,
				react.createElement("div", { style: { margin: "6px 0" } },
					// P6 修复（P5 潜伏 bug）①：askConfirm 必须惰性调用（点击时才 setState），
					// 原写法在渲染期执行 setState（每次新对象），真实 React 下无限重渲染。
					// P6 修复（P5 潜伏 bug）②：/enabled /reload /uninstall 必须携带
					// confirm（逐字等于插件 id），否则 v2 API 一律 400 confirm-missing。
					(p.status === "disabled" || p.status === "error" || p.status === "quarantined")
						? react.createElement("button", { onClick: function () { askConfirm("确认启用 " + p.id + "？", function () { return v2Api("/enabled", { id: p.id, enabled: true, confirm: p.id }); }); } }, "启用")
						: react.createElement("button", { onClick: function () { askConfirm("确认停用 " + p.id + "？", function () { return v2Api("/enabled", { id: p.id, enabled: false, confirm: p.id }); }); } }, "停用"),
					react.createElement("button", { onClick: function () { askConfirm("确认重载 " + p.id + "？", function () { return v2Api("/reload", { id: p.id, confirm: p.id }); }); } }, "重载"),
					react.createElement("button", { onClick: function () { askConfirm("确认卸载 " + p.id + "？（将移除安装记录并卸出运行时）", function () { return v2Api("/uninstall", { id: p.id, confirm: p.id }); }); } }, "卸载"),
					react.createElement("button", { onClick: toggleHealth }, "健康详情"),
					react.createElement("button", { onClick: openConfig }, "配置")),
				confirmBox, healthDetail, configDetail);
		}

		// H1（债务 D-11 可见化）：状态/审计没真落盘时在管理区顶部如实申报。
		// 数据源只有 /v2/snapshot.durability（面板不自己探盘——状态源唯一，与 D-8 同口径）。
		function durabilityBanner(snap) {
			var d = snap && snap.durability;
			if (!d) return null;
			var bad = [];
			if (d.state && d.state.ok === false) bad.push({ what: "安装记录（state.json）", file: d.state.path || d.state.file, why: d.state.error, advice: d.state.advice });
			if (d.audit && d.audit.ok === false) bad.push({ what: "审计流水（audit.jsonl）", file: d.audit.file, why: d.audit.error, advice: d.audit.advice });
			if (bad.length === 0) return null;
			return react.createElement("div", { style: { border: "1px solid #cf222e88", background: "#cf222e12", color: "#820d16", padding: "6px 10px", borderRadius: "6px", margin: "6px 0", fontSize: "13px" } },
				bad.map(function (b) {
					return react.createElement("div", { key: b.what },
						react.createElement("b", null, "⚠ " + b.what + " 没有落盘"), "：", String(b.why || "落点不可写"), "（落点 ", String(b.file || "?"), "）",
						b.advice && b.advice.length ? react.createElement("ul", { style: { margin: "4px 0 0 18px", padding: 0 } }, b.advice.map(function (s, i) { return react.createElement("li", { key: i }, s); })) : null);
				}));
		}

		// ── P6 归一：registry 管理区（原 v2 标签页 RegistryTab）并入唯一 toolkit-panel 标签页 ──
		// 数据源仅 PANEL_API/v2/*（registry/doctor 服务与带前缀事件流），零具体
		// 子插件模块引用（no-subplugin-import-check 守卫）。新装插件免刷新自动出现。
		// 容错：本区任何数据失败/渲染异常只降级本区，不影响下方 patch 域工具区。
		function V2Section() {
			var snapSt = react.useState(null);
			var snapshot = snapSt[0];
			var setSnapshot = snapSt[1];
			var modeSt = react.useState("connecting");
			var mode = modeSt[0];
			var setMode = modeSt[1];
			var pathSt = react.useState("");
			var setPath = pathSt[1];
			var wizardSt = react.useState(null);
			var wizardState = wizardSt[0];
			var setWizard = wizardSt[1];
			// ★19（批 8）：安装逐字确认的输入态——必须逐字重输源路径，"确认安装"才可用。
			var confirmSt = react.useState("");
			var confirmText = confirmSt[0];
			var setConfirmText = confirmSt[1];
			var msgSt = react.useState(null);
			var msg = msgSt[0];
			var setMsg = msgSt[1];
			var errSt = react.useState("");
			var loadError = errSt[0];
			var setLoadError = errSt[1];

			var reload = react.useCallback(function () {
				v2Api("/snapshot").then(function (data) {
					if (data.ok) { setSnapshot(data); setLoadError(""); }
					else setLoadError(data.error || "registry 快照不可用");
				}).catch(function (e) { setLoadError(String(e && e.message || e)); });
			}, []);
			react.useEffect(function () {
				reload();
				// 传输复用 realtime-connector：主路径 ESM 模块，受限环境回退内联孪生（见 v2ConnectorFactory）
				var disposed = false;
				var connector = null;
				v2ConnectorFactory().then(function (create) {
					if (disposed) return;
					connector = create({
						onSnapshot: function (data) { if (data && data.ok) { setSnapshot(data); setLoadError(""); } },
						onMode: function (m) { setMode(m); },
						onEvent: function (name, payload) {
							if (name === "status-changed" || name === "plugin-added" || name === "plugin-removed") reload();
							else if (name === "issue-found" && payload && payload.item) setMsg({ ok: false, code: payload.item.code, error: payload.item.message });
							else if (name.indexOf("audit:") === 0) setMsg({ ok: true, code: name.slice(6), error: payload && payload.pluginId });
						}
					});
				});
				return function () {
					disposed = true;
					if (connector) connector.close();
				};
			}, [reload]);

			var body = null;
			if (!snapshot && !loadError) {
				body = react.createElement("div", null, "读取 registry 状态中…");
			} else if (!snapshot && loadError) {
				// P6 容错：registry 数据面不可达 → 降级提示；不抛错、不影响面板其余区块
				body = react.createElement("div", { style: { border: "1px solid #b5890088", background: "#b5890018", color: "#8a6d00", padding: "6px 10px", borderRadius: "6px", margin: "6px 0", fontSize: "13px" } },
					"⚠ 插件管理（registry）数据暂不可用，已降级：" + loadError + "。下方 patch 域工具区不受影响。");
			} else {
			// 向导：状态（wizardState）与渲染产物（wizardBox）分名——原 RegistryTab 用单一
			// var 重赋值 + 引用 wizardSt.path；归一时若状态/元素同名自引用会拿到 undefined。
			var wizardBox = null;
			if (wizardState && wizardState.precheck) {
				var pc = wizardState.precheck;
				wizardBox = react.createElement("div", { style: { border: "1px dashed #8886", borderRadius: "8px", padding: "8px 10px", margin: "8px 0" } },
					react.createElement("div", { style: { fontSize: "13px", color: pc.pass ? "#1a7f37" : "#cf222e" } }, "预检结论：", react.createElement("b", null, pc.pass ? "通过，可以安装" : "存在阻断项"), pc.legacyMode ? "（legacy 模式）" : ""),
					pc.blocking.map(function (i, idx) {
						return react.createElement("div", { key: "b" + idx, style: { fontSize: "12px", color: "#cf222e" } }, "【阻断】", react.createElement("b", null, i.code), " ", i.message, i.fix ? "　修复：" + i.fix.summary : null);
					}),
					pc.warnings.map(function (i, idx) {
						return react.createElement("div", { key: "w" + idx, style: { fontSize: "12px", color: "#8a6d00" } }, "【提示】", react.createElement("b", null, i.code), " ", i.message);
					}),
					pc.changes.map(function (c, idx) {
						return react.createElement("div", { key: "c" + idx, style: { fontSize: "12px", color: "#777" } }, "需改动【", c.target, "】", c.summary, "：", c.detail);
					}),
					react.createElement("div", { style: { margin: "6px 0" } },
						// ★19（批 8）：写闸补齐的客户端半边——"确认安装"须逐字重输源路径才可点
						// （服务端强制面：缺/不符 ⇒ 400 confirm-missing，钉在 test/install-confirm-gate.test.mjs）。
						react.createElement("div", { style: { fontSize: "12px", color: "#555", margin: "2px 0" } },
							"知情确认：安装会写入 registry 并即时装载——在下面逐字输入要安装的目录绝对路径（",
							react.createElement("b", null, wizardState.path), "）后才能点确认。"),
						react.createElement("input", { type: "text", value: confirmText, onChange: function (e) { setConfirmText(e.target.value); }, placeholder: "逐字输入要安装的插件目录绝对路径", style: { width: "60%", padding: "3px 6px", borderRadius: "4px", border: "1px solid #8888", marginRight: "6px" } }),
						react.createElement("button", {
							disabled: !pc.pass || confirmText !== wizardState.path,
							onClick: function () {
								v2Api("/install/confirm", { source: { kind: "local", path: wizardState.path }, confirm: confirmText }).then(function (result) {
									if (result.ok) { setMsg({ ok: true, code: "installed", error: result.entry.id }); setWizard(null); reload(); }
									else { setWizard({ path: wizardState.path, precheck: result.precheck }); setMsg({ ok: false, code: "install-blocked", error: "预检未通过，报告已刷新" }); }
								}).catch(function (error) { setMsg({ ok: false, code: error.code || "error", error: error.error || String(error) }); });
							}
						}, "确认安装")));
			}
			var banner = msg && msg.code ? react.createElement("div", {
				style: { border: "1px solid " + (msg.ok ? "#1a7f3788" : "#cf222e88"), background: msg.ok ? "#1a7f3714" : "#cf222e14", color: msg.ok ? "#1a7f37" : "#cf222e", padding: "4px 10px", borderRadius: "6px", margin: "6px 0", fontSize: "13px" }
			}, msg.ok ? "已" + msg.code + "：" + msg.error : react.createElement("b", null, msg.code), msg.ok ? null : " " + msg.error) : null;
			body = react.createElement("div", null,
				react.createElement("h2", { style: styles.h2 }, "插件管理（registry · 自适应）"),
				react.createElement("div", { style: { fontSize: "12px", color: "#888", margin: "4px 0" } },
					"数据源：registry/doctor 服务与事件流（",
					react.createElement("b", { style: { color: mode === "sse" ? "#1a7f37" : "#8a6d00" } }, mode === "sse" ? "实时 SSE" : mode === "poll" ? "轮询降级" : "连接中"),
					"）；新装插件自动出现，无需刷新"),
				loadError ? react.createElement("div", { style: { fontSize: "12px", color: "#8a6d00", margin: "2px 0" } }, "⚠ " + loadError + "（旧数据仍显示，操作可能失败）") : null,
				snapshot.doctorAvailable === false ? react.createElement("div", { style: { border: "1px solid #b5890088", background: "#b5890018", color: "#8a6d00", padding: "4px 10px", borderRadius: "6px", margin: "6px 0", fontSize: "13px" } }, "⚠ doctor 不可用：预检与健康巡检受限") : null,
				banner,
				react.createElement("div", { style: { border: "1px dashed #8886", borderRadius: "8px", padding: "8px 10px", margin: "8px 0" } },
					react.createElement("b", null, "安装新插件（仅本地插件目录）"),
					react.createElement("div", { style: { fontSize: "12px", color: "#8a6d00", margin: "4px 0" } },
						"只接受本地插件目录的", react.createElement("b", null, "绝对路径"),
						"（npm 包安装暂未开放）。相对路径会按", react.createElement("b", null, "服务进程的工作目录"),
						"解析而不是本项目目录，因此提交前先写全。"),
					react.createElement("div", { style: { margin: "6px 0" } },
						react.createElement("input", { type: "text", value: pathSt[0], onChange: function (e) { setPath(e.target.value); }, placeholder: "本地插件目录的绝对路径，如 D:\\plugins\\my-plugin", style: { width: "60%", padding: "3px 6px", borderRadius: "4px", border: "1px solid #8888" } }),
						react.createElement("button", { onClick: function () {
							var raw = String(pathSt[0] || "").trim();
							if (!isAbsoluteLocalPath(raw)) {
								setMsg({ ok: false, code: "need-absolute-path", error: "请输入绝对路径（如 D:\\plugins\\my-plugin）。相对路径 \"" + raw + "\" 会按服务进程的工作目录解析，多半指向你想不到的地方。" });
								return;
							}
							v2Api("/install/precheck", { source: { kind: "local", path: raw } }).then(function (result) {
								if (result.ok) { setConfirmText(""); setWizard({ path: raw, precheck: result.precheck }); }
								else setMsg({ ok: false, code: "precheck-failed", error: result.error || "预检失败" });
							}).catch(function (error) { setMsg({ ok: false, code: error.code || "error", error: error.error || String(error) }); });
					} }, "① 预检")),
				wizardBox),
				durabilityBanner(snapshot),
				snapshot.plugins.length === 0 ? react.createElement("div", { style: { color: "#888", fontSize: "13px" } }, "暂无已注册插件——用上方向导装入第一个。") :
					snapshot.plugins.map(function (p) {
						return react.createElement(RegistryPluginCard, { key: p.id, plugin: p, onChanged: reload, onError: function (result) { setMsg({ ok: false, code: result.code || result.error?.code || "error", error: result.error || result.message || String(result) }); } });
					}));
			}
			// P6 容错闸：本区数据形状异常只降级本区（工具区/体检操作台不受影响，不许崩）
			try {
				return body;
			} catch (e) {
				return react.createElement("div", { style: { border: "1px solid #b5890088", background: "#b5890018", color: "#8a6d00", padding: "6px 10px", borderRadius: "6px", margin: "6px 0", fontSize: "13px" } },
					"⚠ 插件管理区渲染异常，已降级（不影响下方工具区）：" + String(e && e.message || e));
			}
		}

		var inject = ["slots"];
		function apply(ctx) {
			try {
				// P6 退役：toolkit-panel-v2 过渡标签页已删除——registry 通用管理区（V2Section）
				// 已并入下方唯一 toolkit-panel 主标签页（P6 归一笔）。对外只保留这一个面板。
				// 既有 tab：patch 层开关/体检操作台（P2.4 资产）+ 顶部 registry 管理区
				ctx.slots.inject("settings.plugins.tab", function () {
					try {
						return ctx.slots.register({
							name: "settings.plugins.tab",
							id: "toolkit-panel",
							order: 90,
							label: function () { return "dsh-toolkit 面板（插件开关与体检）"; },
							inject: function () { return {}; }
						}, ToolkitPanel);
					} catch (e) {
						return function () {};
					}
				});
			} catch (e) {
				// noop
			}
		}
		exports.apply = apply;
		exports.inject = inject;
		// 测试接入点（P6）：panel-unified 测试直接驱动内联孪生 connector 的双路径，
		// 保证 SSE+轮询测试覆盖归一面板的实际客户端传输代码；宿主只消费 apply/inject。
		exports.createV2Connector = createV2Connector;
		exports.v2ConnectorFactory = v2ConnectorFactory;
		return module.exports;
	}
});
}
