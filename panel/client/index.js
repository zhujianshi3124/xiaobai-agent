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
		// ---- 中文显示名：卡片标题不再暴露目录名这种工程标识 ----
		var DISPLAY_NAMES = {
			"agent-memory": "记忆",
			"compact-router": "上下文压缩",
			"rate-throttle": "限流",
			"search-router": "搜索路由",
			"web-search-local": "本地网页搜索"
		};

		var styles = {
			root: { fontFamily: "system-ui, \"Segoe UI\", sans-serif", color: "#e6e6e6" },
			title: { fontSize: 20, margin: "0 0 4px" },
			muted: { color: "#9aa0a6", fontSize: 12 },
			toolbar: { display: "flex", gap: 8, margin: "16px 0", alignItems: "center", flexWrap: "wrap" },
			button: { padding: "6px 14px", borderRadius: 6, border: "1px solid #3a3f47", background: "#1c2027", color: "#e6e6e6", cursor: "pointer", fontSize: 13 },
			buttonDisabled: { opacity: 0.6, cursor: "default" },
			cards: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 },
			card: { border: "1px solid #2a2f36", borderRadius: 8, padding: 12, background: "#181b21" },
			cardTitle: { margin: "0 0 8px", fontSize: 15, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 },
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
			h2: { fontSize: 16, margin: "16px 0 8px" }
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
		// 依据：patchRow.enabled 是"配置层"开关；config.enabled / config.mode 是插件内部开关。
		// 读取插件"内部总开关"。
		//
		// 注意：不能直接用 patchRow.config.enabled —— 服务端 snapshot.mjs 的 parseRootRows()
		// 用不区分缩进的正则收集 config，同一行区间内所有 enabled: 都会互相覆盖。
		// 例：rate-throttle 自己的 enabled: false（缩进 8）会被嵌套 routing.enabled: true（缩进 10）覆盖，
		// 导致 config.enabled 变成 "true"。这里是纯 client 层改动，不能修服务端，
		// 因此改为从 patch 原文按"缩进深度 == 该行 config 子键深度"取键，避开嵌套键的污染。
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
			var exact = rowAnchorFromPatch(plugin, patchText);
			if (exact) return exact.value;
			// 拿不到 patch 原文时退回扁平 config（可能受嵌套键污染，仅在无法解析时使用）
			var row = plugin.patchRow;
			var cfg = (row && row.config) || {};
			if (Object.prototype.hasOwnProperty.call(cfg, "enabled")) {
				return String(cfg.enabled).trim() === "true";
			}
			return null;
		}
		function stateOf(plugin, patchText) {
			var row = plugin.patchRow;
			if (plugin.dir === "compact-router") {
				// compact-router 由预设脚本管理，不在 patch 里；视为已加载且在生效
				return { kind: "running", label: "运行中 · 正在生效", style: styles.stateOn, dot: styles.dotOn };
			}
			if (!row) {
				return { kind: "config-off", label: "配置层停用 · 未加载", style: styles.stateOff, dot: styles.dotOff };
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
						" 改为 ", react.createElement("span", { style: styles.dualCode }, "true"), "。"
					)
				);
			}
			if (plugin.patchRow && plugin.patchRow.enabled !== true) {
				return react.createElement("div", { style: styles.dualBox },
					react.createElement("div", { style: styles.dualHead }, "⚠ 在配置文件中被停用"),
					react.createElement("div", { style: styles.dualLine },
						"插件当前", react.createElement("span", { style: styles.dualCode }, "完全没有被加载"),
						"，相关功能不会工作。要恢复需把配置行里的 ", react.createElement("span", { style: styles.dualCode }, "disabled"),
						" 去掉或设为 ", react.createElement("span", { style: styles.dualCode }, "false"), "。"
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
				react.createElement(TechRow, { label: "插件目录", value: plugin.dir }),
				react.createElement(TechRow, { label: "包名", value: plugin.name }),
				react.createElement(TechRow, { label: "managedBy", value: String(plugin.managedBy) }),
				react.createElement(TechRow, { label: "enabled", value: String(plugin.enabled) }),
				react.createElement(TechRow, { label: "inject", value: list(plugin.inject) }),
				react.createElement(TechRow, { label: "services", value: list(regs.services) }),
				react.createElement(TechRow, { label: "commands", value: list(regs.commands) }),
				react.createElement(TechRow, { label: "providers", value: list(regs.providers) }),
				react.createElement(TechRow, { label: "events", value: list(regs.events) })
			);
		}

		function PluginCard(props) {
			var plugin = props.plugin;
			var patchText = props.patchText;
			var desc = DESCRIPTIONS[plugin.dir] || plugin.note || "（暂无功能说明）";
			var state = stateOf(plugin, patchText);
			return react.createElement("div", { style: styles.card },
				react.createElement("h3", { style: styles.cardTitle },
					DISPLAY_NAMES[plugin.dir] || plugin.dir,
					originBadge(plugin)
				),
				react.createElement("div", { style: styles.desc }, desc),
				react.createElement(StateRow, { state: state }),
				react.createElement(DualSwitchNotice, { plugin: plugin, patchText: patchText }),
				react.createElement(TechDetails, { plugin: plugin })
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
					return react.createElement(PluginCard, { key: p.dir, plugin: p, patchText: patchText });
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
				react.createElement("h1", { style: styles.title }, "dsh-toolkit 面板"),
				react.createElement("div", { style: styles.muted }, meta),
				react.createElement("div", { style: styles.toolbar },
					react.createElement("button", { style: styles.button, onClick: loadSnapshot }, "重新读取状态"),
					react.createElement("button", { style: Object.assign({}, styles.button, doctorRunning ? styles.buttonDisabled : {}), onClick: runDoctor, disabled: doctorRunning }, "一键体检（只查不改）"),
					react.createElement("span", { style: styles.muted }, doctorStatus)
				),
				react.createElement("div", { style: styles.cards }, cards),
				react.createElement("h2", { style: styles.h2 }, "配置文件原文（cordis.patch.yml）"),
				react.createElement("pre", { style: styles.pre }, patchText),
				react.createElement("h2", { style: styles.h2 }, "体检结果"),
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
							label: function () { return "dsh-toolkit 面板"; },
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
