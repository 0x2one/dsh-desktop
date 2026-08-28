// Proper replica of DSH's readZstdPrefix + SessionLogScanner using the REAL
// decodeStorageRecord from dsh-session, over the public one-shot decoder.
// Goal: locate exactly where committedBytes stops advancing.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { zstdDecompressSync } from "node:zlib";

const require = createRequire(import.meta.url);
let decodeStorageRecord;
try {
	({ decodeStorageRecord } = require("D:/develop/env/nodejs/node_global/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-session/lib/types/chunk-rows.js"));
	console.log("decodeStorageRecord loaded:", typeof decodeStorageRecord);
} catch (e) {
	console.log("require chunk-rows failed:", e);
	process.exit(2);
}

const ZSTD_MAGIC = 4247762216;

function scanZstdFrames(buffer) {
	const frames = [];
	let offset = 0;
	while (offset < buffer.length) {
		const start = offset;
		if (buffer.length - offset < 4) return { frames, tornStart: start };
		if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) throw new Error(`corrupt: invalid frame magic at byte ${offset}`);
		offset += 4;
		if (offset === buffer.length) return { frames, tornStart: start };
		const descriptor = buffer.readUInt8(offset);
		offset += 1;
		if ((descriptor & 24) !== 0) throw new Error(`corrupt: reserved frame-header bit at byte ${offset - 1}`);
		const contentSizeFlag = descriptor >>> 6;
		const singleSegment = (descriptor & 32) !== 0;
		const checksum = (descriptor & 4) !== 0;
		const dictionaryFlag = descriptor & 3;
		const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
		const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag;
		const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
		if (buffer.length - offset < remainingHeaderBytes) return { frames, tornStart: start };
		offset += remainingHeaderBytes;
		for (;;) {
			if (buffer.length - offset < 3) return { frames, tornStart: start };
			const blockHeader = buffer.readUIntLE(offset, 3);
			offset += 3;
			const lastBlock = (blockHeader & 1) !== 0;
			const blockType = (blockHeader >>> 1) & 3;
			const blockSize = blockHeader >>> 3;
			if (blockType === 3) throw new Error(`corrupt: reserved block type at byte ${offset - 3}`);
			const payloadBytes = blockType === 1 ? 1 : blockSize;
			if (buffer.length - offset < payloadBytes) return { frames, tornStart: start };
			offset += payloadBytes;
			if (lastBlock) break;
		}
		if (checksum) {
			if (buffer.length - offset < 4) return { frames, tornStart: start };
			offset += 4;
		}
		frames.push({ start, end: offset });
	}
	return { frames };
}

const file = process.argv[2];
const buf = readFileSync(file);
const { frames, tornStart } = scanZstdFrames(buf);
console.log(`file size: ${buf.length}, frames: ${frames.length}, tornStart: ${tornStart}`);

let plaintexts = [];
for (let i = 0; i < frames.length; i++) {
	const f = frames[i];
	try {
		plaintexts.push(zstdDecompressSync(buf.subarray(f.start, f.end)));
	} catch (e) {
		console.log(`frame ${i} public decode error: ${e.message}`);
		process.exit(1);
	}
}
const plain = Buffer.concat(plaintexts);
console.log(`total plaintext: ${plain.length}, endsWithNL=${plain.at(-1) === 10}`);

// SessionLogScanner replica
let inputBytes = 0;
let committedBytes = 0;
let events = [];
let issue = null;
let eventLine = 0;
let fragments = [];
let fragmentBytes = 0;

const headerEnd = plain.indexOf(10);
if (headerEnd === -1) throw new Error("no newline in header");
const headerRecord = plain.subarray(0, headerEnd + 1);
inputBytes = headerRecord.length;
committedBytes = headerRecord.length;

function consumeEventLine(line, endByte) {
	eventLine += 1;
	let decoded;
	try {
		decoded = decodeStorageRecord(JSON.parse(line.toString("utf8")));
	} catch {
		issue ??= new Error(`unparsable committed event at line ${eventLine}`);
		console.log(`LINE ${eventLine}: UNPARSABLE`);
		return;
	}
	if (issue !== void 0) {
		if (decoded.some((event) => event.type === "turn/end")) throw issue;
		return;
	}
	const rowStart = events.length;
	for (const event of decoded) {
		if (event.seq !== events.length) {
			const expected = events.length;
			events.length = rowStart;
			issue = new Error(`seq gap in committed region at line ${eventLine} (expected ${expected}, got ${event.seq})`);
			console.log(`LINE ${eventLine}: SEQ GAP expected ${expected} got ${event.seq}`);
			console.log(`  raw: ${line.toString("utf8").slice(0, 400)}`);
			if (decoded.some((candidate) => candidate.type === "turn/end")) throw issue;
			return;
		}
		events.push(event);
	}
	committedBytes = endByte;
}

try {
for (let i = 1; i < plaintexts.length; i++) {
	const chunk = plaintexts[i];
	const chunkStart = inputBytes;
	inputBytes += chunk.length;
	let ls = 0;
	for (let newline = chunk.indexOf(10); newline !== -1; newline = chunk.indexOf(10, ls)) {
		const fragment = chunk.subarray(ls, newline);
		let line = fragment;
		if (fragments.length > 0) {
			if (fragment.length > 0) fragments.push(fragment);
			line = Buffer.concat(fragments, fragmentBytes + fragment.length);
			fragments = [];
			fragmentBytes = 0;
		}
		consumeEventLine(line, chunkStart + newline + 1);
		ls = newline + 1;
	}
	if (ls < chunk.length) {
		fragments.push(Buffer.from(chunk.subarray(ls)));
		fragmentBytes += fragment.length;
	}
}
} catch (e) {
	console.log("THROWN:", e === null ? "null" : e?.message ?? String(e));
	console.log("  stack:", e?.stack ?? "(no stack)");
	console.log("  at eventLine", eventLine, "committedBytes", committedBytes, "inputBytes", inputBytes);
	process.exit(3);
}

console.log(`scanner: inputBytes=${inputBytes} committedBytes=${committedBytes} events=${events.length} issue=${issue ? issue.message : "none"}`);
console.log(`torn? ${committedBytes !== inputBytes}`);
