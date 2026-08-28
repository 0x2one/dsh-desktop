// Faithful line-by-line decode of the session plaintext using the REAL
// decodeStorageRecord, printing problems and seq drift. This mirrors what
// SessionLogScanner does per line (it decodes each complete line, checks seq,
// and only throws if a turn/end is involved).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { zstdDecompressSync } from "node:zlib";

const require = createRequire(import.meta.url);
const { decodeStorageRecord } = require("D:/develop/env/nodejs/node_global/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-session/lib/types/chunk-rows.js");

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
const { frames } = scanZstdFrames(buf);
console.log(`frames: ${frames.length}`);
let plaintexts = [];
for (let i = 0; i < frames.length; i++) {
	const f = frames[i];
	try { plaintexts.push(zstdDecompressSync(buf.subarray(f.start, f.end))); }
	catch (e) { console.log(`frame ${i} decode error: ${e.message}`); process.exit(1); }
}
const plain = Buffer.concat(plaintexts);
const lines = plain.toString("utf8").split("\n");
// drop trailing empty line from final newline
if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

console.log(`total lines: ${lines.length}`);
let expectedSeq = 0;
let firstIssue = null;
let issues = [];
let lineNo = 0;
for (const line of lines) {
	lineNo += 1;
	if (lineNo === 1) continue; // header
	let value;
	try { value = JSON.parse(line); } catch { issues.push(`line ${lineNo}: JSON parse fail`); continue; }
	let decoded;
	try { decoded = decodeStorageRecord(value); } catch (e) { issues.push(`line ${lineNo}: decodeStorageRecord threw ${e === null ? "null" : e?.message ?? String(e)}`); continue; }
	if (!Array.isArray(decoded)) { issues.push(`line ${lineNo}: decodeStorageRecord returned non-array ${typeof decoded}`); continue; }
	for (const ev of decoded) {
		if (typeof ev?.seq !== "number" || ev.seq !== expectedSeq) {
			issues.push(`line ${lineNo}: seq gap expected ${expectedSeq} got ${ev?.seq} type=${ev?.type}`);
			firstIssue ??= lineNo;
			break;
		}
		expectedSeq += 1;
	}
	if (firstIssue && lineNo > firstIssue + 5) break;
}
console.log(`expectedSeq after scan: ${expectedSeq}`);
console.log(`issues found: ${issues.length}`);
for (const i of issues.slice(0, 20)) console.log("  " + i);
