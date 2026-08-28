// Validate the repaired session file using the REAL JsonlSessionPersistence
// module (the exact code path that threw "corrupt Zstandard session log").
// We instantiate the class with a minimal cordis Context and a scratch root
// holding a copy of the repaired file in its expected layout:
//   <root>/--D-develop-github-dsh-desktop--/session-c924b61e-bfa2-402e-b468-d410a3413132/session.jsonl.zstd
import { mkdirSync, copyFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const cordis = require("D:/develop/env/nodejs/node_global/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis");
const mod = require("D:/develop/env/nodejs/node_global/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-session-persistence-jsonl/lib/index.js");
const { JsonlSessionPersistence } = mod;

const repairedFile = process.argv[2];
const sessionId = process.argv[3] || "session-c924b61e-bfa2-402e-b468-d410a3413132";
const scratchRoot = process.argv[4] || join(process.cwd(), ".scratch-session-root");
const projectDir = join(scratchRoot, "--D-develop-github-dsh-desktop--");
const sessionDir = join(projectDir, sessionId);

rmSync(scratchRoot, { recursive: true, force: true });
mkdirSync(sessionDir, { recursive: true });
copyFileSync(repairedFile, join(sessionDir, "session.jsonl.zstd"));
console.log("scratch root:", scratchRoot);

const ctx = new cordis.Context();
// Minimal stubs so the PersistenceCoordinator write-path install completes.
ctx.sessions = { list: () => [], get: () => undefined };
ctx.on = () => () => {};
ctx.logger = { warn: () => {}, info: () => {}, error: () => {} };
const persistence = new JsonlSessionPersistence(ctx, {
	root: scratchRoot,
	packChunks: true,
	compression: "zstd",
	preparedSessionCacheSize: 1,
	writeBatchMaxDelayMs: 10,
});
console.log("persistence created:", persistence.name);

const id = sessionId;

// 1) loadStored -> readPrefix (this is the path that threw before)
try {
	const prefix = await persistence.loadStored(id);
	console.log("loadStored OK");
	console.log("  meta:", JSON.stringify(prefix.meta));
	console.log("  events:", prefix.events.length);
	console.log("  tornMarker:", prefix.tornMarker === void 0 ? "none" : JSON.stringify(prefix.tornMarker));
	console.log("  first event:", JSON.stringify(prefix.events[0]).slice(0, 160));
	console.log("  last event:", JSON.stringify(prefix.events[prefix.events.length - 1]).slice(0, 200));
} catch (e) {
	console.log("loadStored FAILED:", e.message);
	process.exit(1);
}

// 2) list() — the metadata path used by the session picker
try {
	const listed = await persistence.list();
	console.log("list OK:", listed.length, "session(s):", listed.map((m) => m.id).join(", "));
} catch (e) {
	console.log("list FAILED:", e.message);
	process.exit(1);
}

// 3) load() — full coordinator load (what the GUI uses to open history)
try {
	const loaded = await persistence.load(id);
	console.log("load OK:");
	console.log("  meta.id:", loaded.meta.id);
	console.log("  events:", loaded.events.length);
	console.log("  last seq:", loaded.events[loaded.events.length - 1]?.seq);
	console.log("  last type:", loaded.events[loaded.events.length - 1]?.type);
	const turnEnds = loaded.events.filter((e) => e.type === "turn/end").length;
	console.log("  turn/end count:", turnEnds);
} catch (e) {
	console.log("load FAILED:", e.message);
	process.exit(1);
}

console.log("\nALL REAL-MODULE VALIDATIONS PASSED");
