// Standalone PaddleOCR worker process — pure Node.js, spawned by
// Electron renderer.
//
// Why a child process (mirrors src/kreuzberg-worker.ts:1-9): Obsidian's
// Electron renderer blocks bare-specifier requires into the plugin's
// own node_modules/ for ANY package that isn't already loaded by
// Obsidian's own electron context. PaddleOcrEngine's lazy
// require("onnxruntime-node") and require("sharp") inside resolveOrt/
// resolveSharp fail at runtime in the renderer with
// "Cannot find module 'onnxruntime-node'". Spawning a fresh Node.js
// child gives us a normal resolver that walks the parent tree the
// way the Node CLI does. The child pre-loads onnxruntime-node and
// sharp in its own context (where the bare-specifier require works)
// and passes them as `deps` to the PaddleOcrEngine constructor —
// the service's existing dependency-injection design means the
// in-worker code path is identical to running in-process; only the
// load source differs.
//
// Protocol (parent → child via stdin, one JSON object per line):
//   { type: "init", modelDir, detConfig?, tier?, jobId }
//   { type: "extract", imagePath, jobId }
//
// Protocol (child → parent via stdout):
//   { type: "ready" }
//   { type: "progress", jobId, stage, message }
//   { type: "result",   jobId, success: true, text }
//   { type: "error",    jobId, error }
//
// The child stays alive across multiple extracts (one spawn per
// service lifetime) and is SIGTERMed on parent destroy.

import { createInterface } from "node:readline";
import { PaddleOcrEngine } from "./paddle-ocr-service";

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const ort = require("onnxruntime-node");
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const sharp = require("sharp");

type InitRequest = {
  type: "init";
  modelDir: string;
  detConfig?: Record<string, unknown>;
  tier?: "mobile" | "server" | "hybrid";
  cpuThreads?: number;
  jobId: string;
};

type ExtractRequest = {
  type: "extract";
  imagePath: string;
  jobId: string;
};

type IncomingMessage = InitRequest | ExtractRequest;

function emit(json: object): void {
  process.stdout.write(JSON.stringify(json) + "\n");
}

// Single service instance for the worker's lifetime. The service
// holds the ONNX sessions in memory; re-spawning on every extract
// would re-pay the ~2-3 s init cost each time.
let service: PaddleOcrEngine | null = null;

const rl = createInterface({ input: process.stdin });
rl.on("line", async (raw: string) => {
  let msg: IncomingMessage;
  try {
    msg = JSON.parse(raw);
  } catch {
    return; // Ignore malformed lines.
  }
  try {
    if (msg.type === "init") {
      await runInit(msg);
    } else if (msg.type === "extract") {
      await runExtract(msg);
    }
  } catch (e: any) {
    emit({ type: "error", jobId: msg.jobId, error: String(e?.message ?? e) });
  }
});

async function runInit(req: InitRequest): Promise<void> {
  emit({ type: "progress", jobId: req.jobId, stage: "init", message: "正在加载 PaddleOCR 模型..." });
  // Inject the pre-loaded ort + sharp as deps so the service skips
  // its own lazy require — those bare-specifier requires would fail
  // in Obsidian's renderer but work fine in this child context.
  // Re-injecting here also lets a parent drive multiple services in
  // sequence without us re-loading the native modules.
  service = new PaddleOcrEngine(req.modelDir, {
    ort,
    sharp,
    detConfig: req.detConfig as any,
    tier: req.tier,
    cpuThreads: req.cpuThreads,
  });
  // The service's init() emits onStatus calls; pipe them to the
  // parent's stdout as progress events.
  await service.init((status) => {
    emit({ type: "progress", jobId: req.jobId, stage: "init", message: status });
  });
  emit({ type: "result", jobId: req.jobId, success: true, text: "" });
}

async function runExtract(req: ExtractRequest): Promise<void> {
  if (!service) {
    emit({ type: "error", jobId: req.jobId, error: "PaddleOCR worker not initialized" });
    return;
  }
  emit({ type: "progress", jobId: req.jobId, stage: "extracting", message: "正在使用 PaddleOCR 识别图像..." });
  const text = await service.runOcr(req.imagePath, (status) => {
    emit({ type: "progress", jobId: req.jobId, stage: "extracting", message: status });
  });
  emit({ type: "result", jobId: req.jobId, success: true, text });
}

// Self-kill on unhandled errors so the parent's respawn path gets a
// clean `exit` event instead of trying to talk to a corrupted worker.
// Exit codes 71/72 match the OCR worker convention.
process.on("unhandledRejection", (err) => {
  process.stderr.write(`[paddle-ocr-worker] unhandledRejection: ${err}\n`);
  process.exit(71);
});
process.on("uncaughtException", (err) => {
  process.stderr.write(`[paddle-ocr-worker] uncaughtException: ${err}\n`);
  process.exit(72);
});

emit({ type: "ready" });
