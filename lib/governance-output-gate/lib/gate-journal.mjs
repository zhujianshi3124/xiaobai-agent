#!/usr/bin/env node
/**
 * gate-journal.mjs — read-only evidence extractor for the output gate judges.
 *
 * Decodes a DSH session log (multi-frame zstd JSONL) and prints the durable
 * operations of one seq range. It writes nothing. The reviewer uses it to check
 * the Lead's claims; the supervisor uses it to check the Lead's operations
 * against the discipline instead of trusting the Lead's own summary (3.6.4).
 *
 *   node gate-journal.mjs <session.v4.jsonl.zstd> <fromSeq> <toSeq> [--tools|--messages|--all]
 *
 * fromSeq is exclusive (the supervisor's previous watermark); toSeq inclusive.
 */
import fs from "node:fs";
import zlib from "node:zlib";

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
const MAX_OUTPUT = 400_000;

function usage() {
	console.log("usage: node gate-journal.mjs <session.v4.jsonl.zstd> <fromSeq> <toSeq> [--tools|--messages|--all]");
	process.exit(2);
}

const [file, fromRaw, toRaw, ...rest] = process.argv.slice(2);
if (file === undefined || fromRaw === undefined || toRaw === undefined) usage();
const fromSeq = Number(fromRaw);
const toSeq = Number(toRaw);
if (!Number.isFinite(fromSeq) || !Number.isFinite(toSeq) || fromSeq < 0 || toSeq < fromSeq) usage();
const modeArg = rest.find((x) => x.startsWith("--")) ?? "--all";
const mode = modeArg.slice(2);
if (!["tools", "messages", "all"].includes(mode)) usage();

function decode(filePath) {
	const buf = fs.readFileSync(filePath);
	const events = [];
	let offset = 0;
	while (offset < buf.length) {
		const start = buf.indexOf(MAGIC, offset);
		if (start < 0) break;
		const next = buf.indexOf(MAGIC, start + 4);
		const end = next < 0 ? buf.length : next;
		try {
			const text = zlib.zstdDecompressSync(buf.subarray(start, end)).toString("utf8");
			for (const line of text.split("\n")) {
				if (line.length === 0) continue;
				try {
					events.push(JSON.parse(line));
				} catch {
					/* torn final line while the host is writing */
				}
			}
		} catch {
			/* partial final frame while the host is writing */
		}
		offset = end;
	}
	return events;
}

function textOf(content) {
	if (!Array.isArray(content)) return "";
	return content
		.filter((part) => part?.type === "text" && typeof part.text === "string")
		.map((part) => part.text)
		.join("");
}

function clip(value, limit) {
	const text = typeof value === "string" ? value : JSON.stringify(value);
	if (text === undefined) return "";
	return text.length > limit ? text.slice(0, limit) + ` …[+${text.length - limit} chars]` : text;
}

function toolsAllowed() {
	return mode === "tools" || mode === "all";
}
function messagesAllowed() {
	return mode === "messages" || mode === "all";
}

let events;
try {
	events = decode(file);
} catch (error) {
	console.error("cannot read session log: " + String(error?.message ?? error));
	process.exit(1);
}

const lines = [];
function emit(line) {
	if (lines.reduce((sum, x) => sum + x.length + 1, 0) > MAX_OUTPUT) return;
	lines.push(line);
}

for (const event of events) {
	if (typeof event.seq !== "number" || event.seq <= fromSeq || event.seq > toSeq) continue;
	const seq = event.seq;
	const type = event.type;
	const data = event.data ?? {};

	if (type === "tool/call" || type === "tool/ptc-dispatch") {
		if (!toolsAllowed()) continue;
		const args = typeof data.arguments === "string" ? data.arguments : data.arguments;
		emit(`[${seq}] TOOL ${data.name ?? "?"} ${clip(args, 2000)}`);
		continue;
	}
	if (type === "tool/ptc-dispatch-start") {
		if (!toolsAllowed()) continue;
		emit(`[${seq}] TOOL-START ${data.name ?? "?"} ${clip(data.arguments, 800)}`);
		continue;
	}
	if (type === "tool/result") {
		if (!toolsAllowed()) continue;
		const message = data.message ?? {};
		emit(`[${seq}] RESULT isError=${message.isError === true} ${clip(textOf(message.content), 800)}`);
		continue;
	}
	if (type === "assistant/message") {
		if (!messagesAllowed()) continue;
		const message = data.message ?? {};
		const text = textOf(message.content);
		const tools = Array.isArray(message.content)
			? message.content.filter((part) => part?.type === "tool-call").map((part) => part.name).join(",")
			: "";
		emit(`[${seq}] ASSISTANT ${clip(text, 1500)}${tools === "" ? "" : "  [tool-calls: " + tools + "]"}`);
		continue;
	}
	if (type === "user/message") {
		if (!messagesAllowed()) continue;
		emit(`[${seq}] USER ${clip(textOf(data.content), 800)}`);
		continue;
	}
	if (type === "turn/start" || type === "turn/end" || type === "step/start" || type === "step/end") {
		emit(`[${seq}] ${type} ${clip(data, 200)}`);
		continue;
	}
	if (type === "command/run") {
		emit(`[${seq}] COMMAND ${clip(data, 300)}`);
	}
}

console.log(lines.join("\n"));
if (lines.length === 0) console.log("(no matching events in seq " + (fromSeq + 1) + ".." + toSeq + ")");
