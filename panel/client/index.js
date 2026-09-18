if (typeof window !== "undefined" && window.__ModuleLoader__ && typeof window.__ModuleLoader__.load === "function") {
window.__ModuleLoader__.load({
	id: "@local/dsh-toolkit/panel",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var react = require("react");

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
		var ABSENCE_COPY_FALLBACK = {
			"soft-unmounted": "已软卸载 · 本体保留 · 可一键恢复",
			"true-uninstalled": "已卸载（真）· 本体已移入保管区 · 可一键恢复",
			"installed-unmounted": "已安装未挂载（不是面板卸载的）· 可从面板重新挂载",
			"dangling-mount": "挂载行存在，但本体缺失 · 异常态",
			"unknown-absent": "未安装"
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
				// compact-router 由预设脚本管理，不在 patch 里；视为已加载且在生效
				return { kind: "running", label: "运行中 · 正在生效", style: styles.stateOn, dot: styles.dotOn };
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
			if (innerSwitchValue(plugin, patchText) === false) {
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
					var res = await fetch("/api/toolkit-panel/toggle/plan", {
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
					var res = await fetch("/api/toolkit-panel/execute", {
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
					var res = await fetch("/api/toolkit-panel/config/plan", {
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
					var res = await fetch("/api/toolkit-panel/execute", {
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
			// hook 顺序（测试依赖）：[0] dlg / [1] busy / [2] error / [3] typed
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
				setDlg({ kind: "uninstall", mode: mode });
			};

			var doUninstall = react.useCallback(async function (mode) {
				setBusy(true);
				setError("");
				try {
					var list = [];
					for (var i = 0; i < (mode === "true" ? 2 : 1); i++) list.push(String(typed[i] || "").trim());
					var res = await fetch("/api/toolkit-panel/uninstall/plan", {
						method: "POST", cache: "no-store", headers: { "content-type": "application/json" },
						body: JSON.stringify({ plugin: plugin.dir, mode: mode, confirm: list })
					});
					var body = await res.json();
					if (!body.ok) { setError(body.error || ("HTTP " + res.status)); return; }
					var res2 = await fetch("/api/toolkit-panel/uninstall/execute", {
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
			}, [plugin.dir, typed, onChanged]);

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
					var planPath = isMount ? "/api/toolkit-panel/mount/plan" : "/api/toolkit-panel/restore/plan";
					var execPath = isMount ? "/api/toolkit-panel/mount/execute" : "/api/toolkit-panel/restore/execute";
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
					var res = await fetch("/api/toolkit-panel/mount/plan", {
						method: "POST", cache: "no-store", headers: { "content-type": "application/json" },
						body: JSON.stringify(payload)
					});
					var body = await res.json();
					if (body.ok === false && body.code === "host-key-conflict") {
						setDlg({ kind: "restore", mode: "mount", conflict: body.conflict, choices: body.choices });
						return;
					}
					if (!body.ok) { setError(body.error || ("HTTP " + res.status)); return; }
					var res2 = await fetch("/api/toolkit-panel/mount/execute", {
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
				// 销毁式 v2：软 / 真两入口并存。真卸载**不可逆**（弹窗三句必含 + 输入两次）。
				kids.push(react.createElement("div", { key: "hint", style: styles.dlgLine },
					"「软卸载」摘除挂载行、本体保留、可一键恢复；「真卸载」彻底删除本体、不留副本、不可恢复。"));
				kids.push(react.createElement("div", { key: "row", style: styles.uninRow },
					react.createElement("button", { style: styles.btnOpen, disabled: busy, onClick: function () { openUninstall("soft"); } }, "软卸载"),
					react.createElement("button", { style: styles.btnOpen, disabled: busy, onClick: function () { openUninstall("true"); } }, "真卸载")
				));
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
				kids.push(react.createElement(UninstallDialog, {
					key: "dlg-u",
					plugin: plugin,
					mode: dlg.mode,
					willDelete: plugin.bodyStats || null,
					typed: typed,
					busy: busy,
					error: error,
					onTyped: function (idx, v) {
						var next = Object.assign({}, typed);
						next[idx] = v;
						setTyped(next);
					},
					onConfirm: function () { doUninstall(dlg.mode); },
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
					var res = await fetch("/api/toolkit-panel/snapshot", { cache: "no-store" });
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
					var res = await fetch("/api/toolkit-panel/doctor/dry-run", { method: "POST", cache: "no-store" });
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
				react.createElement("div", { style: styles.cards }, cards),
				react.createElement("h2", { style: styles.h2 }, "配置文件原文（cordis.patch.yml · 插件开关所在）"),
				react.createElement("pre", { style: styles.pre }, patchText),
				react.createElement("h2", { style: styles.h2 }, "体检结果（doctor dry-run · 只查不改）"),
				react.createElement("div", { style: styles.issues }, doctorIssues)
			);
		}

		var inject = ["slots"];
		function apply(ctx) {
			try {
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
		return module.exports;
	}
});
}
