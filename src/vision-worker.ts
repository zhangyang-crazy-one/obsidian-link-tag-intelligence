// Standalone Vision worker process — pure Node.js, spawned by Electron renderer.
// Communicates via stdin/stdout JSON lines.
// Supports 100% offline model loading, local image reading, and auto-disposal.
//
// The canonical Qwen2-VL pattern (per
// huggingface.co/onnx-community/Qwen2-VL-2B-Instruct model card, 2026-06).
// Tested against @huggingface/transformers ^4.2.0.
//
// Lifecycle (2026-06-03 refactor, see planning/research/vlm-2026-notebooklm-20260603.md):
//   - Refuses re-init. Hot-swap in the same process is what triggers the
//     onnxruntime-node Session memory leak (Issue #25325/#26831/#22271: 10
//     load/release cycles = 994MB; 100 cycles = 9.12GB). The parent must
//     kill+respawn when the model needs to change.
//   - Emits a `{type:"memory", ...}` message after every `process` call so the
//     parent can track RSS growth and proactively respawn before OOM.
//   - Self-kills on unhandledRejection / uncaughtException to avoid dirty
//     state corrupting the next run.
//   - On `destroy`, disposes the model and exits cleanly. No `malloc_trim(0)`
//     hack (the conventional `/proc/self/malloc_trim` writeFileSync workaround
//     is broken — that file does not exist on any Linux distro). If leak
//     rate exceeds the parent's RSS threshold, the child is respawned
//     before pressure becomes pathological.

// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const {
  env,
  AutoProcessor,
  Qwen2VLForConditionalGeneration,
  RawImage,
} = require("@huggingface/transformers");

// 1. Force 100% offline locks
env.allowLocalModels = true;
env.allowRemoteModels = false;

let model: any = null;
let processor: any = null;
let activeModelPath = "";
let activeEngine = "qwen2-vl";
let processCount = 0;
const MEMORY_REPORT_PERIOD = 5;

const path = require("path");
const readline = require("readline");
const fs = require("fs");

// Self-kill on unhandled errors so the parent's respawn path gets a clean
// `exit` event instead of trying to talk to a corrupted model. Exit codes
// 71/72 are arbitrary but match the systemd "internal software error"
// convention and are unlikely to collide with normal exit codes.
process.on("unhandledRejection", (err) => {
  process.stderr.write(`[vision-worker] unhandledRejection: ${err}\n`);
  process.exit(71);
});
process.on("uncaughtException", (err) => {
  process.stderr.write(`[vision-worker] uncaughtException: ${err}\n`);
  process.exit(72);
});

function emitMemory(label: string): void {
  const mem = process.memoryUsage();
  process.stdout.write(
    JSON.stringify({
      type: "memory",
      label,
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      processCount,
    }) + "\n"
  );
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", async (raw: string) => {
  let msg: {
    type: string;
    modelDir?: string;
    imagePath?: string;
    task?: string;
    engine?: string;
  };
  try { msg = JSON.parse(raw); } catch { return; }

  try {
    switch (msg.type) {
      case "init": {
        // Refuse re-init unconditionally. The parent owns the kill+respawn
        // policy; this worker must not hot-swap models in-process.
        if (model) {
          process.stdout.write(
            JSON.stringify({
              type: "ready",
              ok: false,
              error:
                "Already initialized; parent must kill+respawn. " +
                `(activeModelPath=${activeModelPath}, engine=${activeEngine})`,
            }) + "\n"
          );
          break;
        }
        if (!msg.modelDir) {
          process.stdout.write(
            JSON.stringify({ type: "ready", ok: false, error: "Missing modelDir" }) + "\n"
          );
          break;
        }
        try {
          const fullPath = path.resolve(msg.modelDir);
          const baseDir = path.dirname(fullPath);
          const folderName = path.basename(fullPath);
          env.localModelPath = baseDir;
          processor = await AutoProcessor.from_pretrained(folderName);
          // Auto-detect q4/fp16/fp32 by inspecting onnx dir
          let dtype = "fp32";
          const onnxDir = path.join(fullPath, "onnx");
          if (fs.existsSync(onnxDir)) {
            const files = fs.readdirSync(onnxDir) as string[];
            if (files.some((f: string) => f.includes("_q4"))) dtype = "q4";
            else if (files.some((f: string) => f.includes("_fp16"))) dtype = "fp16";
          }
          model = await Qwen2VLForConditionalGeneration.from_pretrained(folderName, {
            device: "cpu",
            dtype: dtype,
          });
          activeModelPath = msg.modelDir;
          activeEngine = msg.engine ?? "qwen2-vl";
          processCount = 0;
          process.stdout.write(
            JSON.stringify({ type: "ready", ok: true, engine: activeEngine }) + "\n"
          );
        } catch (e) {
          process.stdout.write(
            JSON.stringify({ type: "ready", ok: false, error: String(e) }) + "\n"
          );
        }
        break;
      }

      case "process": {
        if (!model || !processor) {
          process.stdout.write(
            JSON.stringify({ type: "result", success: false, error: "Model not initialized" }) + "\n"
          );
          break;
        }
        if (!msg.imagePath || !msg.task) {
          process.stdout.write(
            JSON.stringify({ type: "result", success: false, error: "Missing imagePath or task" }) + "\n"
          );
          break;
        }
        try {
          const absoluteImgPath = path.resolve(msg.imagePath);
          // v3+/v4 unified entry: RawImage.read accepts string path / Blob / URL.
          const rawImage = await RawImage.read(absoluteImgPath);
          // Canonical chat template: typed content entries; the processor
          // handles <|vision_start|><|image_pad|><|vision_end|> expansion
          // automatically. Do NOT hand-write the literal — expansion math
          // depends on image_grid_thw.
          const conversation = [
            { role: "user", content: [{ type: "image" }, { type: "text", text: msg.task }] },
          ];
          const text = processor.apply_chat_template(conversation, { add_generation_prompt: true });
          // Canonical processor call: positional (text, image).
          const inputs = await processor(text, rawImage);
          const outputs = await model.generate({ ...inputs, max_new_tokens: 512 });
          const decoded = processor.batch_decode(outputs, { skip_special_tokens: true })[0];
          process.stdout.write(
            JSON.stringify({ type: "result", success: true, text: decoded }) + "\n"
          );
          processCount += 1;
          // Memory report — let the parent track RSS growth and respawn
          // proactively if the leak rate exceeds its threshold.
          emitMemory(processCount % MEMORY_REPORT_PERIOD === 0 ? "periodic" : "after-process");
        } catch (e) {
          process.stdout.write(
            JSON.stringify({ type: "result", success: false, error: String(e) }) + "\n"
          );
        }
        break;
      }

      case "destroy": {
        if (model) {
          try { await model.dispose(); } catch { /* model may already be in a bad state */ }
          model = null;
          processor = null;
        }
        process.stdout.write(JSON.stringify({ type: "destroyed" }) + "\n");
        process.exit(0);
      }
    }
  } catch (e) {
    process.stdout.write(JSON.stringify({ type: "error", error: String(e) }) + "\n");
  }
});
