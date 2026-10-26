/**
 * agent-model-follow — keep a Team Lead's sub-cards on the Lead's current model.
 *
 * Why this exists
 * ---------------
 * A teammate's model is frozen at spawn time: the host writes
 * `subagent/descriptor { agentProvider, agentModel, agentReasoningEffort }` into
 * the child's session and that descriptor is what the child's requests resolve
 * from. Switching the Lead's model afterwards leaves every open child on the old
 * model — measured on 2026-10-24: the Lead moved workbuddy → workbuddy-ai at
 * 04:28, while the two cards spawned at 03:48 kept calling workbuddy.
 *
 * How the host lets a plugin change it
 * ------------------------------------
 * A session-local selection is three agent-scoped listeners plus one durable
 * event — exactly what the host's own `installModelSelection` installs:
 *
 *   system-prompt/assemble  → expose {{provider}} / {{model}} of the selection
 *   agent/request           → stamp provider/model/effort onto the request
 *   session.append("model/selection") → record it in that child's history
 *
 * The session controller does the same thing for the UI, but it is mounted only
 * where the web surface is (it waits for fileUploads/workspaceRegistry), so this
 * plugin installs the listeners itself. That keeps it working in every profile,
 * needs no default-model write, and works for an idle card as long as its agent
 * is still live.
 *
 * Ordering rule (2026-10-24 回归教训，实测定位)
 * --------------------------------------------
 * The fan-out MUST NOT run inside the `session/event` dispatch.
 * `team.listMembers(lead)` reaches `roster.membership()` → `journal.state()` →
 * `sessionProjections.stateOf(session, "agentTeam")`, which recomputes the
 * session's projection cache. Run while the `model/selection` event is still
 * being dispatched, that recompute folds the OLD modelSelection and pushes a
 * stale projection frame to the UI, so the picker snaps back to the previous
 * model even though the selection was stored. Deferring by one macrotask lets
 * the dispatch finish first; the fan-out then reads the fresh projection.
 *
 * Scope: only a top-level session fans out; a child's own `model/selection`
 * (the one this plugin appends) is ignored, so there is no feedback loop.
 *
 * Restart rule (2026-10-25 教训)
 * -----------------------------
 * byParent used to live only in memory, so a host restart lost it. The Lead
 * then resumed with its persisted selection and made requests WITHOUT a fresh
 * `model/selection` event — no trigger, no fan-out — and every resuming card
 * fell back to the provider frozen in its spawn descriptor. Measured
 * 2026-10-25: after the 11:31 restart the Lead ran workbuddy-ai while both
 * open cards kept calling workbuddy until both products' accounts ran dry.
 * The map is now mirrored to {@link STATE_PATH} on every Lead selection and
 * re-read when a resuming card's parent has no in-memory entry.
 *
 * First-request rule (2026-10-25 教训，实测定位)
 * ---------------------------------------------
 * The request override MUST read the live selection, not the assemble
 * snapshot. A resumed card gets a fresh holder (new agent instance), so its
 * `assembled` is undefined until the next system-prompt/assemble — which lands
 * AFTER the turn's first `agent/request`. Measured 2026-10-25: after the user
 * moved the Lead to workbuddy at 21:37, every open card's first request of
 * every turn still went out on its frozen spawn descriptor (workbuddy-ai) and
 * only the second request carried the bound selection — one international
 * billable call per turn, all night. `bind()` therefore seeds `assembled` with
 * the bound selection itself, and the override reads `current` first, so a
 * card routes on exactly what was bound from the very first request.
 */
import { appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const name = "agent-model-follow";
const inject = ["agents"];

const LOG_PATH = join(homedir(), ".dsh", "agent-model-follow.log");
const LOG_MAX_BYTES = 256 * 1024;

/** Restart-proof mirror of byParent, next to the log. */
const STATE_PATH = join(homedir(), ".dsh", "agent-model-follow-state.json");
/** Cap on remembered leads so the mirror cannot grow without bound. */
const STATE_MAX_LEADS = 32;

/** agent → the live selection holder its listeners read. */
const FOLLOWING = new WeakMap();

/** Append one line; logging must never break the fan-out. */
function log(tag, detail) {
	try {
		mkdirSync(join(homedir(), ".dsh"), { recursive: true });
		try {
			if (statSync(LOG_PATH).size > LOG_MAX_BYTES) writeFileSync(LOG_PATH, "", "utf8");
		} catch {
			/* first write */
		}
		appendFileSync(LOG_PATH, new Date().toISOString() + " [" + tag + "] " + detail + "\n", "utf8");
	} catch {
		/* ignore */
	}
}

function label(selection) {
	return String(selection.provider) + "/" + String(selection.model)
		+ (selection.reasoningEffort === undefined ? "" : ":" + String(selection.reasoningEffort));
}

/** On-disk mirror entry for one lead. */
function isValidStateEntry(value) {
	return value !== null && typeof value === "object"
		&& value.selection !== null && typeof value.selection === "object"
		&& typeof value.selection.provider === "string"
		&& typeof value.selection.model === "string";
}

/** Read the mirror; a missing or corrupt file reads as empty. */
function readStateLeads() {
	try {
		const doc = JSON.parse(readFileSync(STATE_PATH, "utf8"));
		const leads = doc?.leads;
		if (leads === undefined || leads === null || typeof leads !== "object") return {};
		const clean = {};
		for (const [id, entry] of Object.entries(leads)) {
			if (typeof id === "string" && id.length > 0 && isValidStateEntry(entry)) clean[id] = entry;
		}
		return clean;
	} catch {
		return {};
	}
}

/**
 * Rewrite the mirror as: existing file entries overlaid with the live map
 * (memory wins), newest first, capped. Overlay — not replace — so entries
 * written by another lead (or seeded by hand) survive this host run.
 */
function writeStateLeads(byParent) {
	try {
		const merged = new Map();
		for (const [id, entry] of Object.entries(readStateLeads())) {
			merged.set(id, { atMs: entry.atMs ?? 0, selection: entry.selection });
		}
		for (const [id, entry] of byParent) merged.set(id, entry);
		const leads = {};
		for (const [id, entry] of [...merged.entries()]
			.sort((a, b) => (b[1].atMs ?? 0) - (a[1].atMs ?? 0))
			.slice(0, STATE_MAX_LEADS)) {
			leads[id] = { atMs: entry.atMs, selection: entry.selection };
		}
		mkdirSync(join(homedir(), ".dsh"), { recursive: true });
		writeFileSync(STATE_PATH, JSON.stringify({ version: 1, leads }, null, "\t") + "\n", "utf8");
	} catch {
		/* the mirror is a restart aid; losing it must never break the fan-out */
	}
}

/**
 * Parent's last known selection: memory first, then the restart-proof mirror.
 * A mirror hit is promoted into memory so later wakes skip the disk.
 */
function lookupParentSelection(parentId, byParent) {
	const live = byParent.get(parentId);
	if (live !== undefined) return live;
	const restored = readStateLeads()[parentId];
	if (restored === undefined) return undefined;
	const entry = { atMs: restored.atMs ?? 0, selection: { ...restored.selection } };
	byParent.set(parentId, entry);
	log("state:restored", "lead=" + String(parentId).slice(0, 22)
		+ " selection=" + label(entry.selection) + " (mirror read)");
	return entry;
}

/**
 * Bind one child agent to a mutable selection. Idempotent: a later call only
 * moves the holder forward, so repeated Lead switches do not stack listeners.
 * @param agent - live child agent
 * @param selection - validated { provider, model, reasoningEffort? }
 * @returns "bound" on first use, "updated" afterwards
 */
function bind(agent, selection) {
	const existing = FOLLOWING.get(agent);
	if (existing !== undefined) {
		existing.current = selection;
		// A pre-bind assemble snapshot must never stamp the next request: the
		// request override reads `current` first, but `assembled` also feeds the
		// prompt variables, so keep both pointing at the bound selection.
		existing.assembled = selection;
		return "updated";
	}
	const holder = { current: selection, assembled: selection };
	FOLLOWING.set(agent, holder);

	agent.ctx.on("system-prompt/assemble", async (_assembly, _context, next) => {
		const selected = holder.current;
		const assembled = await next();
		holder.assembled = selected;
		if (selected === undefined) return assembled;
		return {
			...assembled,
			variables: { ...assembled.variables, provider: selected.provider, model: selected.model },
		};
	});

	agent.ctx.on("agent/request", async (_payload, next) => {
		const resolved = await next();
		// `current` is set at bind time; `assembled` only catches up at the next
		// assemble, which for a resumed card lands after the turn's first
		// request. Reading `current` first is what pins that first request.
		const selected = holder.current ?? holder.assembled;
		if (selected === undefined) return resolved;
		const { reasoningEffort: _inherited, ...rest } = resolved;
		return {
			...rest,
			provider: selected.provider,
			model: selected.model,
			...(selected.reasoningEffort === undefined ? {} : { reasoningEffort: selected.reasoningEffort }),
		};
	});

	return "bound";
}

/**
 * Fan one Lead selection out to its current teammates.
 * @param ctx - plugin context
 * @param leadSession - the top-level session whose model just changed
 * @param selection - validated { provider, model, reasoningEffort? }
 */
async function follow(ctx, leadSession, selection) {
	const team = ctx.get("agentTeams");
	const agents = ctx.agents;
	if (team === undefined || agents === undefined) {
		log("skip", "missing service team=" + String(team !== undefined) + " agents=" + String(agents !== undefined));
		return;
	}
	let lead;
	try {
		lead = agents.get(leadSession.id);
	} catch {
		lead = undefined;
	}
	if (lead === undefined) {
		// No live Lead means no roster to read; a later switch will retry.
		log("skip", "lead not live session=" + String(leadSession.id).slice(0, 22));
		return;
	}

	let members = [];
	try {
		members = team.listMembers(lead);
		if (!Array.isArray(members)) members = [];
	} catch (error) {
		log("skip", "roster failed: " + String(error?.message ?? error).slice(0, 120));
		return;
	}

	const targets = members.filter((m) => m !== null && typeof m === "object"
		&& m.role !== "lead" && typeof m.id === "string" && m.id.length > 0 && m.id !== leadSession.id);
	if (targets.length === 0) {
		log("noop", "lead=" + String(leadSession.id).slice(0, 22) + " selection=" + label(selection) + " members=0");
		return;
	}

	let changed = 0;
	for (const member of targets) {
		const who = String(member.name ?? member.id).slice(0, 24);
		let child;
		try {
			child = agents.get(member.id);
		} catch {
			child = undefined;
		}
		if (child === undefined) {
			log("follow:skipped", "lead=" + String(leadSession.id).slice(0, 22) + " child=" + who
				+ " reason=agent not live (card was collected; its descriptor still pins the old model)");
			continue;
		}
		try {
			const how = bind(child, { ...selection });
			try {
				child.session.append("model/selection", { ...selection });
			} catch (error) {
				log("follow:append-failed", "child=" + who + " " + String(error?.message ?? error).slice(0, 120));
			}
			changed++;
			log("follow:ok", "lead=" + String(leadSession.id).slice(0, 22) + " child=" + who
				+ " -> " + label(selection) + " " + how);
		} catch (error) {
			log("follow:failed", "lead=" + String(leadSession.id).slice(0, 22) + " child=" + who
				+ " -> " + label(selection) + " error=" + String(error?.message ?? error).slice(0, 160));
		}
	}
	log("done", "lead=" + String(leadSession.id).slice(0, 22) + " selection=" + label(selection)
		+ " members=" + targets.length + " changed=" + changed);
}

function apply(ctx) {
	/** parent session id → { atMs, selection }: the Lead's latest selection, so a resumed card re-binds. Mirrored to STATE_PATH. */
	const byParent = new Map();

	ctx.on("session/event", (session, event) => {
		const header = session?.header;
		if (header === undefined || header === null) return;
		const depth = typeof header.delegationDepth === "number" ? header.delegationDepth : 0;

		// A card that was collected and later resumed comes back with its frozen
		// descriptor. Re-bind it before its first request of the new turn.
		if (depth > 0 && event?.type === "turn/start") {
			const parent = header.parentSession;
			const remembered = typeof parent === "string" ? lookupParentSelection(parent, byParent) : undefined;
			if (remembered === undefined) return;
			// Same rule as below: never touch the projection from inside the dispatch.
			setTimeout(() => {
				let child;
				try {
					child = ctx.agents.get(session.id);
				} catch {
					child = undefined;
				}
				if (child === undefined) return;
				try {
					const how = bind(child, { ...remembered.selection });
					try {
						child.session.append("model/selection", { ...remembered.selection });
					} catch {
						/* the durable trace is nice-to-have; the request override is the contract */
					}
					log("follow:resumed", "child=" + String(session.id).slice(0, 22) + " -> " + label(remembered.selection) + " " + how);
				} catch (error) {
					log("follow:resume-failed", "child=" + String(session.id).slice(0, 22)
						+ " error=" + String(error?.message ?? error).slice(0, 160));
				}
			}, 0);
			return;
		}

		if (event?.type !== "model/selection") return;
		// Only a top-level Lead fans out. This is also what stops the child's own
		// `model/selection` (written by this plugin) from looping back.
		if (depth > 0) return;
		const selection = event.data;
		if (selection === null || typeof selection !== "object") return;
		if (typeof selection.provider !== "string" || typeof selection.model !== "string") return;
		byParent.set(session.id, { atMs: Date.now(), selection: { ...selection } });
		writeStateLeads(byParent);
		// One macrotask of delay: the dispatch must finish folding this event into
		// the session projections before anything reads them. See the ordering
		// note at the top of this file — running listMembers() inline here pushes
		// a stale modelSelection frame to the UI and the picker snaps back.
		const lead = session;
		const remembered = { ...selection };
		setTimeout(() => {
			follow(ctx, lead, remembered).catch((error) => {
				log("error", String(error?.message ?? error).slice(0, 200));
			});
		}, 0);
	});
}

export { apply, inject, name, follow, bind, LOG_PATH };
