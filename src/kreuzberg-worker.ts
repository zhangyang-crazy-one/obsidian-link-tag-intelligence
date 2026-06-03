// Standalone Kreuzberg OCR worker process — pure Node.js, spawned by
// Electron renderer.
//
// Why a child process (mirror of src/asr-worker.ts:1-9): Obsidian's
// Electron renderer blocks bare-specifier requires into the plugin's own
// node_modules/ at both plugin-load and runtime (verified 2026-06-03
// across four separate fix attempts — c3f1fbe, f4df81a, fbd95af,
// 4dcda9d). Spinning off to a fresh Node.js child process gives us a
// normal require() resolver that walks the parent tree the way the
// Node CLI does. The parent (main.js) talks to us via stdin/stdout
// line-delimited JSON.
//
// Protocol (parent → child via stdin, one JSON object per line):
//   { type: "extract", filePath, tessdataPath, jobId }
//
// Protocol (child → parent via stdout):
//   { type: "ready" }                            // on startup
//   { type: "result", jobId, success, text? }    // extract complete
//   { type: "error", jobId, error }              // extract failed
//
// Process lifecycle: stay alive across multiple extract calls. Parent
// SIGTERMs the child on plugin unload or after a long idle period
// (matches the asr-worker / vision-worker pattern).

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const readline = require("readline");
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const kreuzberg = require("@kreuzberg/node");

type ExtractRequest = {
  type: "extract";
  filePath: string;
  tessdataPath: string;
  jobId: string;
};

type IncomingMessage = ExtractRequest;

// Response type: | { type: "ready" }
//               | { type: "progress", jobId, stage, message }
//               | { type: "result",   jobId, success: true, text: string }
//               | { type: "error",    jobId, error: string }

function emit(json: object): void {
  process.stdout.write(JSON.stringify(json) + "\n");
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", async (raw: string) => {
  let msg: IncomingMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    return; // Ignore malformed lines.
  }
  if (msg.type === "extract") {
    await runExtract(msg).catch((e) => {
      // Last-resort guard; runExtract already emits errors.
      emit({ type: "error", jobId: msg.jobId, error: String(e?.message ?? e) });
    });
  }
});

async function runExtract(req: ExtractRequest): Promise<void> {
  const { filePath, tessdataPath, jobId } = req;
  // Override the broken build-time TESSDATA_PREFIX baked into the
  // precompiled Rust binary. See kreuzberg-ocr-service.ts for the full
  // background; here we just do the same save/restore dance.
  const prevTessdataPrefix = process.env.TESSDATA_PREFIX;
  if (tessdataPath) {
    process.env.TESSDATA_PREFIX = tessdataPath;
  }
  try {
    emit({ type: "progress", jobId, stage: "loading", message: "正在加载 Tesseract 语言模型..." });
    emit({ type: "progress", jobId, stage: "extracting", message: "正在通过 Kreuzberg 提取文字..." });
    const result = await kreuzberg.extractFile(filePath, null, {
      outputFormat: "plain",
      useCache: false,
      layout: undefined,
    });
    emit({ type: "progress", jobId, stage: "done", message: `提取完成（${result.content.length} 字符）` });
    emit({ type: "result", jobId, success: true, text: result.content });
  } catch (e: any) {
    emit({ type: "error", jobId, error: String(e?.message ?? e) });
  } finally {
    if (prevTessdataPrefix === undefined) {
      delete process.env.TESSDATA_PREFIX;
    } else {
      process.env.TESSDATA_PREFIX = prevTessdataPrefix;
    }
  }
}

// Self-kill on unhandled errors so the parent's respawn path gets a
// clean `exit` event instead of trying to talk to a corrupted worker.
process.on("unhandledRejection", (err) => {
  process.stderr.write(`[kreuzberg-worker] unhandledRejection: ${err}\n`);
  process.exit(71);
});
process.on("uncaughtException", (err) => {
  process.stderr.write(`[kreuzberg-worker] uncaughtException: ${err}\n`);
  process.exit(72);
});

// Announce readiness so the parent knows we're ready to accept jobs.
emit({ type: "ready" });
