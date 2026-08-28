// Diagnostic: decode a DSH zstd JSONL session log using the public zstd API.
// Reimplements scanZstdFrames from dsh-session-persistence-jsonl to locate frames,
// then decodes each frame and inspects the JSONL records (esp. the torn tail).
import { readFileSync } from "node:fs";
import { zstdDecompressSync } from "node:zlib";

const ZSTD_MAGIC = 4247762216; // 0xFD2FB528

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
console.log(`file size: ${buf.length}`);
const { frames, tornStart } = scanZstdFrames(buf);
console.log(`frames: ${frames.length}, tornStart: ${tornStart}`);
let totalPlain = 0;
for (let i = 0; i < frames.length; i++) {
	const f = frames[i];
	let plain;
	try {
		plain = zstdDecompressSync(buf.subarray(f.start, f.end));
	} catch (e) {
		console.log(`frame ${i}: [${f.start},${f.end}) DECODE ERROR: ${e.message}`);
		continue;
	}
	totalPlain += plain.length;
	console.log(`frame ${i}: [${f.start},${f.end}) plain=${plain.length} endsWithNL=${plain.at(-1) === 10}`);
	if (i === 0) {
		const nl = plain.indexOf(10);
		console.log(`  header line: ${plain.subarray(0, nl === -1 ? plain.length : nl).toString("utf8")}`);
	}
}
// Decode everything and show the tail of the final frame
if (frames.length > 0) {
	const last = frames[frames.length - 1];
	let plain;
	try {
		plain = zstdDecompressSync(buf.subarray(last.start, last.end));
	} catch (e) {
		console.log(`last frame decode error: ${e.message}`);
		process.exit(0);
	}
	console.log(`--- last frame plaintext (last 600 bytes, repr): ---`);
	console.log(JSON.stringify(plain.subarray(Math.max(0, plain.length - 600)).toString("utf8")));
	console.log(`--- last frame line count: ${plain.toString("utf8").split("\n").length - 1}`);
	// Count complete newline-terminated lines
	const lines = plain.toString("utf8").split("\n");
	console.log(`last line (no newline?): ${JSON.stringify(lines[lines.length - 1].slice(0, 200))}`);
	if (lines[lines.length - 1].length > 200) console.log(`   ... total ${lines[lines.length - 1].length} chars`);
}
console.log(`total plaintext across frames: ${totalPlain}`);
