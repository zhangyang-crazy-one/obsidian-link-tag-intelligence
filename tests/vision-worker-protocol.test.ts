import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mock @huggingface/transformers BEFORE importing the worker ────────────────
// Use vi.hoisted so the mock consts exist when vi.mock's factory runs
// (vitest hoists vi.mock above module top-level statements).

const { mockProcessor, mockModel, mockEnv, mockFromPretrainedProcessor, mockFromPretrainedModel } =
  vi.hoisted(() => {
    const processor = {
      apply_chat_template: vi.fn(),
      batch_decode: vi.fn(),
    };
    const model = {
      generate: vi.fn(),
      dispose: vi.fn(),
    };
    const env = { allowLocalModels: false, allowRemoteModels: false };
    return {
      mockProcessor: processor,
      mockModel: model,
      mockEnv: env,
      mockFromPretrainedProcessor: vi.fn().mockResolvedValue(processor),
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
});
