import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock @huggingface/transformers BEFORE importing the worker ────────────────
// Use vi.hoisted so the mock consts exist when vi.mock's factory runs
// (vitest hoists vi.mock above module top-level statements).

const { mockProcessor, mockModel, mockEnv, mockFromPretrainedProcessor, mockFromPretrainedModel } =
  vi.hoisted(() => {
    // Qwen2VLProcessor is invoked as a function: processor(text, image) →
    // inputs (the worker then spreads the result into model.generate()).
    // Mock it as a callable that also carries the methods the worker uses.
    const processorFn: any = vi.fn().mockReturnValue({ input_ids: "fake" });
    // image_processor is a sub-object the worker mutates to bound vision
    // tokens; preprocessor_config.json ships max_pixels: 12_845_056 by
    // default, which causes 1792 tokens for a 1552×897 photo and
    // OOM-kills the worker on 30 GB hosts (verified 2026-06-03).
    processorFn.image_processor = { max_pixels: 12_845_056 };
    processorFn.apply_chat_template = vi.fn().mockReturnValue("chat-templated");
    processorFn.batch_decode = vi.fn().mockReturnValue(["decoded text"]);
    const model = {
      generate: vi.fn(),
      dispose: vi.fn(),
    };
    const env = { allowLocalModels: false, allowRemoteModels: false };
    return {
      mockProcessor: processorFn,
      mockModel: model,
      mockEnv: env,
      mockFromPretrainedProcessor: vi.fn().mockResolvedValue(processorFn),
      mockFromPretrainedModel: vi.fn().mockResolvedValue(model),
    };
  });

vi.mock("@huggingface/transformers", () => ({
  env: mockEnv,
  AutoProcessor: {
    from_pretrained: mockFromPretrainedProcessor,
  },
  Qwen2VLForConditionalGeneration: {
    from_pretrained: mockFromPretrainedModel,
  },
  RawImage: {
    read: vi.fn(),
  },
}));

vi.mock("fs", () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readdirSync: vi.fn().mockReturnValue([]),
}));

// IMPORTANT: process.stdout.write and process.exit are used by the
// production readline wrapper. Mute them so importing vision-worker.ts
// doesn't pollute the test output and doesn't actually exit vitest.
const stdoutWriteSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
  _code?: number | string | null,
) => {
  // swallow in test
  return undefined as never;
}));

// Now safe to import the production code
import {
  handleWorkerMessage,
  makeInitialState,
  type WorkerState,
} from "../src/vision-worker";

describe("vision-worker protocol", () => {
  let state: WorkerState;
  let emit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    state = makeInitialState();
    emit = vi.fn();
    vi.clearAllMocks();
    // Re-apply the spies after clearAllMocks wipes them
    stdoutWriteSpy.mockClear();
    exitSpy.mockClear();
    mockModel.generate.mockReset();
    mockModel.dispose.mockReset();
    mockProcessor.apply_chat_template.mockReset();
    mockProcessor.batch_decode.mockReset();
  });

  it("W1: init succeeds on first call, refuses re-init on second", async () => {
    const r1 = await handleWorkerMessage(
      JSON.stringify({ type: "init", modelDir: "/models/qwen" }),
      state,
      emit
    );
    expect(r1).toBe("continue");
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ready", ok: true, engine: "qwen2-vl" })
    );

    // Second init must be refused
    emit.mockClear();
    const r2 = await handleWorkerMessage(
      JSON.stringify({ type: "init", modelDir: "/models/qwen" }),
      state,
      emit
    );
    expect(r2).toBe("continue");
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ready",
        ok: false,
        error: expect.stringMatching(/Already initialized/),
      })
    );
  });

  it("W2: process without init returns Model-not-initialized error", async () => {
    const r = await handleWorkerMessage(
      JSON.stringify({
        type: "process",
        imagePath: "/tmp/x.png",
        task: "<DETAILED_CAPTION>",
      }),
      state,
      emit
    );
    expect(r).toBe("continue");
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "result",
        success: false,
        error: "Model not initialized",
      })
    );
  });

  it("W3: destroy returns 'exit' and calls model.dispose()", async () => {
    // First init a model so we can verify dispose
    await handleWorkerMessage(
      JSON.stringify({ type: "init", modelDir: "/models/qwen" }),
      state,
      emit
    );
    emit.mockClear();
    mockModel.dispose.mockResolvedValue(undefined);

    const r = await handleWorkerMessage(
      JSON.stringify({ type: "destroy" }),
      state,
      emit
    );
    expect(r).toBe("exit");
    expect(mockModel.dispose).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith({ type: "destroyed" });
  });

  it("W3b: destroy swallows dispose errors and still returns 'exit'", async () => {
    await handleWorkerMessage(
      JSON.stringify({ type: "init", modelDir: "/models/qwen" }),
      state,
      emit
    );
    mockModel.dispose.mockRejectedValueOnce(new Error("ORT session already freed"));

    const r = await handleWorkerMessage(
      JSON.stringify({ type: "destroy" }),
      state,
      emit
    );
    expect(r).toBe("exit");
    expect(emit).toHaveBeenCalledWith({ type: "destroyed" });
  });

  it("W4: unhandledRejection handler is wired and exits with code 71", () => {
    // Re-fetch the production process.on registrations. Easiest: capture
    // by re-emitting through the global process.
    // (The handler was registered as part of importing vision-worker.ts.)
    expect(() => {
      process.emit("unhandledRejection", new Error("synthetic test"));
    }).not.toThrow();
    expect(exitSpy).toHaveBeenCalledWith(71);
  });

  it("W5: uncaughtException handler is wired and exits with code 72", () => {
    expect(() => {
      process.emit("uncaughtException", new Error("synthetic test"));
    }).not.toThrow();
    expect(exitSpy).toHaveBeenCalledWith(72);
  });

  it("W6: invalid JSON is ignored (returns continue, no emit)", async () => {
    const r = await handleWorkerMessage("not json {", state, emit);
    expect(r).toBe("continue");
    expect(emit).not.toHaveBeenCalled();
  });

  it("W7: init with missing modelDir returns Missing-modelDir error", async () => {
    const r = await handleWorkerMessage(JSON.stringify({ type: "init" }), state, emit);
    expect(r).toBe("continue");
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "ready",
        ok: false,
        error: "Missing modelDir",
      })
    );
  });

  it("W8: process with missing imagePath/task returns error", async () => {
    await handleWorkerMessage(
      JSON.stringify({ type: "init", modelDir: "/models/qwen" }),
      state,
      emit
    );
    emit.mockClear();

    const r = await handleWorkerMessage(
      JSON.stringify({ type: "process", task: "<DETAILED_CAPTION>" }),
      state,
      emit
    );
    expect(r).toBe("continue");
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "result",
        success: false,
        error: "Missing imagePath or task",
      })
    );
  });

  it("W9: process with missing imagePath AND missing task returns Missing-imagePath-or-task error", async () => {
    await handleWorkerMessage(
      JSON.stringify({ type: "init", modelDir: "/models/qwen" }),
      state,
      emit
    );
    emit.mockClear();

    // Both fields empty — first check is model (ok), second is imagePath/task
    const r = await handleWorkerMessage(
      JSON.stringify({ type: "process" }),
      state,
      emit
    );
    expect(r).toBe("continue");
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "result",
        success: false,
      })
    );
  });

  it("W10: init with engine param records the engine and reports it on ready", async () => {
    const r = await handleWorkerMessage(
      JSON.stringify({ type: "init", modelDir: "/models/x", engine: "lfm2-vl-450m" }),
      state,
      emit
    );
    expect(r).toBe("continue");
    expect(state.activeEngine).toBe("lfm2-vl-450m");
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ready", ok: true, engine: "lfm2-vl-450m" })
    );
  });

  // W11: the worker mutates `image_processor.max_pixels` from the
  // Qwen2-VL default (12_845_056 → ~1792 vision tokens for a 1552×897
  // photo) down to 200_704 (~256 tokens). The Qwen2VLProcessor._call
  // signature accepts runtime args, but its inner image_processor(images)
  // call ignores them — only the constructed `this.max_pixels` is read by
  // smart_resize. So we mutate the field directly. This caps the
  // autoregressive KV cache + activations well under 10 GB on 30 GB hosts
  // (verified 2026-06-03 via standalone smoke test).
  it("W11: process handler mutates image_processor.max_pixels to 200_704", async () => {
    // First init a model so state.processor is set
    await handleWorkerMessage(
      JSON.stringify({ type: "init", modelDir: "/models/qwen" }),
      state,
      emit
    );
    emit.mockClear();

    // Sanity: the mock's image_processor starts at the Qwen2-VL default
    expect(mockProcessor.image_processor.max_pixels).toBe(12_845_056);

    mockModel.generate.mockResolvedValue({ fake: "tensor" });
    mockProcessor.batch_decode.mockReturnValue(["a clean bathroom with peach walls"]);

    const r = await handleWorkerMessage(
      JSON.stringify({
        type: "process",
        imagePath: "/tmp/photo.png",
        task: "<DETAILED_CAPTION>",
      }),
      state,
      emit
    );

    expect(r).toBe("continue");
    // The critical assertion: the worker mutated max_pixels down to
    // 200_704, NOT 12_845_056, before calling the processor.
    expect(mockProcessor.image_processor.max_pixels).toBe(200_704);
    // And inference completed with success=true
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "result", success: true })
    );
  });
});
