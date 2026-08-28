// Replicate DSH's JSONL scanner over the concatenated plaintext of all frames,
// using the PUBLIC one-shot decoder (which DSH falls back to if the private
// decoder shape probe fails), and find where committedBytes diverges from
// inputBytes. Also simulate the private decoder to check for output bugs.
import { readFileSync } from "node:fs";
import { createZstdDecompress, zstdDecompressSync } from "node:zlib";

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

// Concatenate plaintext using the public one-shot decoder
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

// DSH SessionLogScanner replica (from dsh-session-persistence-jsonl)
let inputBytes = 0;
let committedBytes = 0;
let events = 0;
let issue = null;
let eventLine = 0;

const headerEnd = plain.indexOf(10);
if (headerEnd === -1) throw new Error("no newline in header");
const headerRecord = plain.subarray(0, headerEnd + 1);
inputBytes = headerRecord.length;
committedBytes = headerRecord.length;
// Validate header
const headerJson = JSON.parse(headerRecord.subarray(0, -1).toString("utf8"));
console.log(`header: id=${headerJson.id} version=${headerJson.version} createdAt=${headerJson.createdAt} cwd=${headerJson.cwd}`);

let rest = plain.subarray(headerEnd + 1);
let lineStart = 0;
let fragmentBytes = 0;
let fragments = [];

function consumeEventLine(line, endByte) {
	eventLine += 1;
	let decoded;
	try {
		decoded = JSON.parse(line.toString("utf8"));
	} catch {
		issue ??= `unparsable committed event at line ${eventLine}`;
		return;
	}
	// seq check
	const seq = decoded?.seq;
	if (typeof seq !== "number" || seq !== events) {
		issue ??= `seq gap at line ${eventLine} (expected ${events}, got ${seq})`;
		return;
	}
	events += 1;
	committedBytes = endByte;
}

// scan chunks like the decoder loop does (frame 0 is the header, already consumed)
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

console.log(`scanner: inputBytes=${inputBytes} committedBytes=${committedBytes} events=${events} issue=${issue}`);
console.log(`torn? ${committedBytes !== inputBytes}`);
if (issue) console.log(`ISSUE: ${issue}`);
