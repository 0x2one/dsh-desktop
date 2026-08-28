// Comprehensive validation of the repair hypothesis for session-c924b61e...
// Hypothesis: lines containing the synthetic closers
//   L8726 step/end       seq 129373 (turn 7, step 2)
//   L8727 turn/end       seq 129374 (turn 7)
//   L8728 session/end-seed seq 129375
// were appended after an interruption, and the resumed tail restarts at
// seq 129373. Dropping those 3 lines yields a contiguous event stream.
// This script validates that hypothesis against ALL lines, then writes a
// repaired multi-frame zstd file (frame0 = original header, frame1 = all
// remaining lines) and re-validates the repaired file.
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

// Decode all frames (public API)
const plaintexts = frames.map((f) => zstdDecompressSync(buf.subarray(f.start, f.end)));
const plain = Buffer.concat(plaintexts);
let text = plain.toString("utf8");
if (text.endsWith("\n")) text = text.slice(0, -1);
const lines = text.split("\n");
console.log(`decoded: ${plain.length} bytes, ${lines.length} lines (incl header)`);

// 1) Show the suspect lines 8724-8732 with full JSON
for (let n = 8724; n <= 8732; n++) {
	console.log(`L${n}: ${lines[n - 1]}`);
}

// 2) Validate full stream contiguity, locating the collision
function scanAll(linesToScan) {
	let expected = 0;
	const problems = [];
	let lineNo = 0;
	for (const line of linesToScan) {
		lineNo += 1;
		if (lineNo === 1) continue;
		let value;
		try { value = JSON.parse(line); } catch { problems.push(`line ${lineNo}: JSON parse fail`); continue; }
		let decoded;
		try { decoded = decodeStorageRecord(value); } catch (e) { problems.push(`line ${lineNo}: decode threw ${e?.message ?? e}`); continue; }
		for (const ev of decoded) {
			if (typeof ev?.seq !== "number" || ev.seq !== expected) {
				problems.push(`line ${lineNo}: seq gap expected ${expected} got ${ev?.seq} type=${ev?.type}`);
				break;
			}
			expected += 1;
		}
	}
	return { expected, problems };
}

const full = scanAll(lines);
console.log(`\nFULL STREAM: expected seq cursor reached ${full.expected}`);
console.log(`problems: ${full.problems.length}`);
for (const p of full.problems.slice(0, 15)) console.log("  " + p);

// 3) Verify the exact 3 closer lines
const c1 = JSON.parse(lines[8725]); // L8726
const c2 = JSON.parse(lines[8726]); // L8727
const c3 = JSON.parse(lines[8727]); // L8728
const t1 = JSON.parse(lines[8728]); // L8729 (first tail line)
console.log(`\ncloser check:`);
console.log(`  L8726: type=${c1.type} seq=${c1.seq} turn=${c1.data?.turn} step=${c1.data?.step}`);
console.log(`  L8727: type=${c2.type} seq=${c2.seq} turn=${c2.data?.turn} reason=${c2.data?.reason?.kind}`);
console.log(`  L8728: type=${c3.type} seq=${c3.seq}`);
console.log(`  L8729: type=${t1.type} seq=${t1.seq} turn=${t1.data?.turn} step=${t1.data?.step}`);

const okClosers =
	c1.type === "step/end" && c1.seq === 129373 &&
	c2.type === "turn/end" && c2.seq === 129374 &&
	c3.type === "session/end-seed" && c3.seq === 129375 &&
	t1.type === "assistant/chunk" && t1.seq === 129373;
console.log(`closers match hypothesis: ${okClosers}`);
if (!okClosers) { console.log("ABORT: closers do not match"); process.exit(2); }

// 4) Simulate repair: drop L8726-L8728
const repairedLines = [...lines.slice(0, 8725), ...lines.slice(8728)];
const sim = scanAll(repairedLines);
console.log(`\nREPAIRED STREAM (dropped 3 closers): expected seq cursor reached ${sim.expected}`);
console.log(`problems: ${sim.problems.length}`);
for (const p of sim.problems.slice(0, 15)) console.log("  " + p);
const lastLine = JSON.parse(repairedLines[repairedLines.length - 1]);
console.log(`last line: type=${lastLine.type} seq=${lastLine.seq} turn=${lastLine.data?.turn} step=${lastLine.data?.step}`);

if (sim.problems.length > 0) { console.log("ABORT: repaired stream still has problems"); process.exit(3); }

// 5) Re-encode: frame0 = original header line, frame1 = all remaining lines
const headerLine = lines[0] + "\n";
const bodyLines = repairedLines.slice(1).join("\n") + "\n";
const headerFrame = zstdCompressSync(Buffer.from(headerLine, "utf8"), CHECKSUM_OPTIONS);
const bodyFrame = zstdCompressSync(Buffer.from(bodyLines, "utf8"), CHECKSUM_OPTIONS);
const repaired = Buffer.concat([headerFrame, bodyFrame]);
writeFileSync(out, repaired);
console.log(`\nwrote repaired file: ${out} (${repaired.length} bytes)`);

// 6) Re-validate the repaired FILE through the same decoder+scanner
const rb = readFileSync(out);
const { frames: rframes, tornStart: rtorn } = scanZstdFrames(rb);
console.log(`repaired file: frames=${rframes.length}, tornStart=${rtorn}`);
const rtexts = rframes.map((f) => zstdDecompressSync(rb.subarray(f.start, f.end)));
const rplain = Buffer.concat(rtexts);
let rtext = rplain.toString("utf8");
if (rtext.endsWith("\n")) rtext = rtext.slice(0, -1);
const rlines = rtext.split("\n");
console.log(`repaired decode: ${rplain.length} bytes, ${rlines.length} lines`);

// Scanner replica (mirrors DSH's SessionLogScanner exactly)
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
console.log(`\nSCANNER on repaired file: inputBytes=${inputBytes} committedBytes=${committedBytes} events=${events.length}`);
console.log(`committedBytes === inputBytes ? ${committedBytes === inputBytes}`);
console.log(`issue: ${issue ? issue.message : "none"}`);
if (committedBytes !== inputBytes || issue) { console.log("REPAIR VALIDATION FAILED"); process.exit(4); }
console.log("REPAIR VALIDATION PASSED");
