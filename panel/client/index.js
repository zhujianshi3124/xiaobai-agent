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
			condNote: { marginTop: 4, fontSize: 11, color: "#e0d5b7", lineHeight: 1.7 }
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
						"提示：本面板只负责第一层（加载与否），第二层是插件自己的配置，面板暂不修改 —— ",
						react.createElement("span", { style: styles.dualCode }, "P2.3 配置编辑"),
						"上线后可在此直接改。"
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
				react.createElement(DualSwitchNotice, { plugin: plugin, patchText: patchText }),
				react.createElement(ToggleControls, {
					plugin: plugin,
					patchText: patchText,
					onChanged: props.onChanged
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
					return react.createElement(PluginCard, { key: p.dir, plugin: p, patchText: patchText, onChanged: loadSnapshot });
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
