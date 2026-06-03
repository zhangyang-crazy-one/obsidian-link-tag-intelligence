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
import {
  env,
  AutoProcessor,
  Qwen2VLForConditionalGeneration,
  RawImage,
} from "@huggingface/transformers";
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
import * as path from "path";
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
import * as readline from "readline";
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
import * as fs from "fs";

// 1. Force 100% offline locks
env.allowLocalModels = true;
env.allowRemoteModels = false;

const MEMORY_REPORT_PERIOD = 5;

/**
 * Mutable state owned by the worker. Held in a single object so the
 * message handler can be a pure function for testability — see
 * `handleWorkerMessage` below. Production code uses a singleton
 * `state`; tests construct fresh ones.
 */
export type WorkerState = {
  model: any;
  processor: any;
  activeModelPath: string;
  activeEngine: string;
  processCount: number;
};

export function makeInitialState(): WorkerState {
  return {
    model: null,
    processor: null,
    activeModelPath: "",
    activeEngine: "qwen2-vl",
    processCount: 0,
  };
}

const state: WorkerState = makeInitialState();

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

function emitMemory(processCount: number, label: string): void {
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
  const result = await handleWorkerMessage(raw, state, (json) => {
    process.stdout.write(JSON.stringify(json) + "\n");
  });
  if (result === "exit") {
    process.exit(0);
  }
});

/**
 * Process a single JSON-line message from the parent. Pure-ish function
 * (mutates `state`) so tests can call it directly without spawning a
 * child process. `emit` is the channel for all responses; tests can
 * substitute a `vi.fn()` to assert on outputs.
 *
 * Returns "exit" when the handler is done and the parent should call
 * process.exit (used by `destroy`).
 */
export async function handleWorkerMessage(
  raw: string,
  state: WorkerState,
  emit: (json: object) => void
): Promise<"continue" | "exit"> {
  let msg: {
    type: string;
    modelDir?: string;
    imagePath?: string;
    task?: string;
    engine?: string;
  };
  try { msg = JSON.parse(raw); } catch { return "continue"; }

  try {
    switch (msg.type) {
      case "init": {
        // Refuse re-init unconditionally. The parent owns the kill+respawn
        // policy; this worker must not hot-swap models in-process.
        if (state.model) {
          emit({
            type: "ready",
            ok: false,
            error:
              "Already initialized; parent must kill+respawn. " +
              `(activeModelPath=${state.activeModelPath}, engine=${state.activeEngine})`,
          });
          break;
        }
        if (!msg.modelDir) {
          emit({ type: "ready", ok: false, error: "Missing modelDir" });
          break;
        }
        try {
          const fullPath = path.resolve(msg.modelDir);
          const baseDir = path.dirname(fullPath);
          const folderName = path.basename(fullPath);
          env.localModelPath = baseDir;
          state.processor = await AutoProcessor.from_pretrained(folderName);
          // Auto-detect q4/fp16/fp32 by inspecting onnx dir
          let dtype = "fp32";
          const onnxDir = path.join(fullPath, "onnx");
          if (fs.existsSync(onnxDir)) {
            const files = fs.readdirSync(onnxDir) as string[];
            if (files.some((f: string) => f.includes("_q4"))) dtype = "q4";
            else if (files.some((f: string) => f.includes("_fp16"))) dtype = "fp16";
          }
          state.model = await Qwen2VLForConditionalGeneration.from_pretrained(folderName, {
            device: "cpu",
            dtype: dtype,
          });
          state.activeModelPath = msg.modelDir;
          state.activeEngine = msg.engine ?? "qwen2-vl";
          state.processCount = 0;
          emit({ type: "ready", ok: true, engine: state.activeEngine });
        } catch (e) {
          emit({ type: "ready", ok: false, error: String(e) });
        }
        break;
      }

      case "process": {
        if (!state.model || !state.processor) {
          emit({ type: "result", success: false, error: "Model not initialized" });
          break;
        }
        if (!msg.imagePath || !msg.task) {
          emit({ type: "result", success: false, error: "Missing imagePath or task" });
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
          const text = state.processor.apply_chat_template(conversation, { add_generation_prompt: true });
          // Canonical processor call: positional (text, image).
          const inputs = await state.processor(text, rawImage);
          const outputs = await state.model.generate({ ...inputs, max_new_tokens: 512 });
          const decoded = state.processor.batch_decode(outputs, { skip_special_tokens: true })[0];
          emit({ type: "result", success: true, text: decoded });
          state.processCount += 1;
          // Memory report — let the parent track RSS growth and respawn
          // proactively if the leak rate exceeds its threshold.
          emitMemory(
            state.processCount,
            state.processCount % MEMORY_REPORT_PERIOD === 0 ? "periodic" : "after-process"
          );
        } catch (e) {
          emit({ type: "result", success: false, error: String(e) });
        }
        break;
      }

      case "destroy": {
        if (state.model) {
          try { await state.model.dispose(); } catch { /* model may already be in a bad state */ }
          state.model = null;
          state.processor = null;
        }
        emit({ type: "destroyed" });
        return "exit";
      }
    }
  } catch (e) {
    emit({ type: "error", error: String(e) });
  }
  return "continue";
}
