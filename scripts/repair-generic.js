// Generalized session repair for DSH JSONL zstd logs.
// Detects the "closers collision" corruption: a committed region ending with
// synthetic closers (step/end, turn/end, maybe session/end-seed) followed by a
// resumed tail whose seqs restart below the committed cursor. Removing the
// closers yields a contiguous event stream. Then re-encodes the log as two
// zstd frames (header + body) exactly like encodeMaterialization and validates
// the repaired bytes with a faithful SessionLogScanner replica (using the REAL
// decodeStorageRecord).
//
// Usage: node repair-generic.js <corrupt.jsonl.zstd> <out.jsonl.zstd>
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { constants, zstdCompressSync, zstdDecompressSync } from "node:zlib";

const require = createRequire(import.meta.url);
const { decodeStorageRecord } = require("D:/develop/env/nodejs/node_global/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-session/lib/types/chunk-rows.js");

const ZSTD_MAGIC = 4247762216;
const CHECKSUM_OPTIONS = { params: { [constants.ZSTD_c_checksumFlag]: 1 } };

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

const src = process.argv[2];
const out = process.argv[3];
const buf = readFileSync(src);
const { frames, tornStart } = scanZstdFrames(buf);
console.log(`source: frames=${frames.length}, tornStart=${tornStart}, size=${buf.length}`);

const plaintexts = frames.map((f) => zstdDecompressSync(buf.subarray(f.start, f.end)));
const plain = Buffer.concat(plaintexts);
let text = plain.toString("utf8");
if (text.endsWith("\n")) text = text.slice(0, -1);
const lines = text.split("\n");
console.log(`decoded: ${plain.length} bytes, ${lines.length} lines (incl header)`);

// Decode a line into events using the real decodeStorageRecord
function decodeLine(line) {
	return decodeStorageRecord(JSON.parse(line));
}

// Scan all lines (skip header) tracking seq cursor; return first problem detail
function scan(linesArr, startAt = 0) {
	let expected = 0;
	let problems = [];
	let lineNo = 0;
	let tailSeqAt = null; // seq cursor when first problem hit
	for (const line of linesArr) {
		lineNo += 1;
		if (lineNo === 1) continue;
		let value, decoded;
		try {
			value = JSON.parse(line);
			decoded = decodeStorageRecord(value);
		} catch (e) {
			problems.push({ lineNo, msg: `decode threw ${e?.message ?? e}` });
			continue;
		}
		for (const ev of decoded) {
			if (typeof ev?.seq !== "number" || ev.seq !== expected) {
				problems.push({ lineNo, msg: `seq gap expected ${expected} got ${ev?.seq} type=${ev?.type}` });
				tailSeqAt ??= expected;
				break;
			}
			expected += 1;
		}
		if (startAt && problems.length > startAt) break;
	}
	return { expected, problems, tailSeqAt };
}

const full = scan(lines);
console.log(`FULL STREAM: cursor=${full.expected}, problems=${full.problems.length}`);
for (const p of full.problems.slice(0, 6)) console.log("  " + p.msg);

if (full.problems.length === 0) {
	console.log("No problems found; nothing to repair.");
	process.exit(0);
}

// Find the first problem's line number
const first = full.problems[0].lineNo;
console.log(`first problem at line ${first}`);

// Examine the lines just before the first problem: expected closers pattern.
// The committed region cursor stopped at tailSeqAt; the lines ending the
// committed region are the closers. Scan backwards from `first` collecting
// contiguous closer lines (step/end, turn/end, session/end-seed) whose seq
// values are < tailSeqAt and whose types are synthetic closers.
const closerLineNos = [];
// The first problem line is the resumed tail's first line (0-based: first-1).
// Walk back from the line BEFORE it (0-based: first-2) collecting contiguous
// synthetic closers. Closers may include tool/result (an interrupted tool's
// synthetic result), step/end, turn/end, session/end-seed. Their seq values
// collide with the resumed tail, so we only collect lines whose seq is
// >= the resumed tail's first seq (i.e. part of the colliding range).
const tailFirstSeqMatch = full.problems[0].msg.match(/got (\d+)/);
const tailFirstSeq = tailFirstSeqMatch ? Number(tailFirstSeqMatch[1]) : null;
console.log(`resumed tail first seq: ${tailFirstSeq}`);
const closerTypes = new Set(["tool/result", "step/end", "turn/end", "session/end-seed"]);
for (let j = first - 2; j >= 1; j--) {
	let v;
	try { v = JSON.parse(lines[j]); } catch { break; }
	const d = v.data || {};
	const isCloserType = closerTypes.has(v.type);
	const seqInCollision = typeof v.seq === "number" && tailFirstSeq !== null && v.seq >= tailFirstSeq;
	if (isCloserType && seqInCollision) {
		closerLineNos.unshift(j); // 0-based
	} else break;
}
console.log(`closer candidates (1-based): ${closerLineNos.map((n) => n + 1).join(", ")}`);
for (const n of closerLineNos) {
	const v = JSON.parse(lines[n]);
	const d = v.data || {};
	console.log(`  L${n + 1}: type=${v.type} seq=${v.seq} turn=${d.turn} step=${d.step} reason=${d.reason?.kind}`);
}

// Validate: after removing closerLineNos, the stream must be contiguous.
const repairedLines = lines.filter((_, idx) => !closerLineNos.includes(idx));
const repairedScan = scan(repairedLines);
console.log(`\nREPAIRED STREAM: cursor=${repairedScan.expected}, problems=${repairedScan.problems.length}`);
for (const p of repairedScan.problems.slice(0, 6)) console.log("  " + p.msg);
if (repairedScan.problems.length > 0) {
	console.log("ABORT: removing closers did not fix the stream");
	process.exit(2);
}
console.log(`last line: ${repairedLines[repairedLines.length - 1].slice(0, 160)}`);

// Re-encode as two frames
const headerLine = lines[0] + "\n";
const bodyLines = repairedLines.slice(1).join("\n") + "\n";
const headerFrame = zstdCompressSync(Buffer.from(headerLine, "utf8"), CHECKSUM_OPTIONS);
const bodyFrame = zstdCompressSync(Buffer.from(bodyLines, "utf8"), CHECKSUM_OPTIONS);
const repaired = Buffer.concat([headerFrame, bodyFrame]);
writeFileSync(out, repaired);
console.log(`\nwrote repaired file: ${out} (${repaired.length} bytes)`);

// Re-validate the repaired FILE through the scanner replica (frame-by-frame like DSH)
const rb = readFileSync(out);
const { frames: rframes, tornStart: rtorn } = scanZstdFrames(rb);
console.log(`repaired file: frames=${rframes.length}, tornStart=${rtorn}`);
const rtexts = rframes.map((f) => zstdDecompressSync(rb.subarray(f.start, f.end)));
const rplain = Buffer.concat(rtexts);
console.log(`repaired decode: ${rplain.length} bytes, endsWithNL=${rplain.at(-1) === 10}`);

// Scanner replica mirroring DSH's SessionLogScanner
let inputBytes = 0, committedBytes = 0, events = [], issue = null, eventLine = 0, fragments = [], fragmentBytes = 0;
const headerEnd = rplain.indexOf(10);
const headerRecord = rplain.subarray(0, headerEnd + 1);
inputBytes = headerRecord.length; committedBytes = headerRecord.length;
function consumeEventLine(line, endByte) {
	eventLine += 1;
	let decoded;
	try { decoded = decodeStorageRecord(JSON.parse(line.toString("utf8"))); }
	catch { issue ??= new Error(`unparsable committed event at line ${eventLine}`); return; }
	if (issue !== void 0) { if (decoded.some((e) => e.type === "turn/end")) throw issue; return; }
	const rowStart = events.length;
	for (const event of decoded) {
		if (event.seq !== events.length) {
			const expected = events.length;
			events.length = rowStart;
			issue = new Error(`seq gap at line ${eventLine} (expected ${expected}, got ${event.seq})`);
			if (decoded.some((candidate) => candidate.type === "turn/end")) throw issue;
			return;
		}
		events.push(event);
	}
	committedBytes = endByte;
}
for (let i = 1; i < rtexts.length; i++) {
	const chunk = rtexts[i];
	const chunkStart = inputBytes;
	inputBytes += chunk.length;
	let ls = 0;
	for (let newline = chunk.indexOf(10); newline !== -1; newline = chunk.indexOf(10, ls)) {
		const fragment = chunk.subarray(ls, newline);
		let line = fragment;
		if (fragments.length > 0) {
			if (fragment.length > 0) fragments.push(fragment);
			line = Buffer.concat(fragments, fragmentBytes + fragment.length);
			fragments = []; fragmentBytes = 0;
		}
		consumeEventLine(line, chunkStart + newline + 1);
		ls = newline + 1;
	}
	if (ls < chunk.length) { fragments.push(Buffer.from(chunk.subarray(ls))); fragmentBytes += fragment.length; }
}
console.log(`SCANNER on repaired file: inputBytes=${inputBytes} committedBytes=${committedBytes} events=${events.length}`);
console.log(`committedBytes === inputBytes ? ${committedBytes === inputBytes}`);
console.log(`issue: ${issue ? issue.message : "none"}`);
if (committedBytes !== inputBytes || issue) { console.log("REPAIR VALIDATION FAILED"); process.exit(4); }
console.log("REPAIR VALIDATION PASSED");
