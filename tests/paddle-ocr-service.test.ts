import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PaddleOcrService } from "../src/paddle-ocr-service";
import {
  PADDLE_MODEL_FILES,
  PADDLE_MODEL_SUBDIRS,
} from "../src/paddle-ocr-types";
import * as realPath from "path";

// ---------------------------------------------------------------------------
// In-memory fs mock + fake onnxruntime-node.
// Tests use the deps injection point to avoid touching real disk or ORT.
// ---------------------------------------------------------------------------

type FakeStat = { isFile: () => boolean };

function makeFsMock(opts: { existing: Set<string>; dictText: string }) {
  const existing = opts.existing;
  const dictText = opts.dictText;
  return {
    existsSync: (p: string) => existing.has(p),
    promises: {
      readFile: async (p: string, _enc: string) => {
        if (p.endsWith(PADDLE_MODEL_FILES.dict)) return dictText;
        throw new Error(`unexpected read: ${p}`);
      },
    },
    statSync: (_p: string): FakeStat => ({ isFile: () => true }),
  } as unknown as typeof import("fs");
}

function makeSessionStub(name: string) {
  return {
    inputNames: ["x"],
    outputNames: ["y"],
    run: vi.fn(async () => ({ y: { data: new Float32Array([0, 0]), dims: [1, 2] } })),
    release: vi.fn(async () => {
      /* released */
    }),
    __name: name,
  };
}

function makeOrtMock() {
  const sessions: Array<ReturnType<typeof makeSessionStub>> = [];
  return {
    InferenceSession: {
      create: vi.fn(async (uri: string) => {
        const s = makeSessionStub(uri);
        sessions.push(s);
        return s;
      }),
    },
    __sessions: sessions,
  };
}

function makeSharpMock() {
  return ((_input: unknown) => ({
    raw: () => ({
      toBuffer: async () => ({
        data: Buffer.from([0, 0, 0]),
        info: { width: 4, height: 4, channels: 3 },
      }),
    }),
    resize: () => _input,
  })) as unknown as ConstructorParameters<typeof PaddleOcrService>[0] extends infer D
    ? D extends { sharp?: infer S } ? S : never
    : never;
}

const MODEL_DIR = "/fake/models/ocr/pp-ocrv5/mobile";
const DICT_LINES = ["blank", "中", "文", "测", "试", "a", "b", "c"]; // 8 entries (index 0 = blank)

function allModelFiles(): Set<string> {
  const set = new Set<string>();
  for (const sub of [PADDLE_MODEL_SUBDIRS.det, PADDLE_MODEL_SUBDIRS.rec, PADDLE_MODEL_SUBDIRS.cls]) {
    set.add(realPath.join(MODEL_DIR, sub, PADDLE_MODEL_FILES.det));
  }
  set.add(realPath.join(MODEL_DIR, PADDLE_MODEL_SUBDIRS.dict, PADDLE_MODEL_FILES.dict));
  return set;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PaddleOcrService.checkModelFiles", () => {
  it("reports all files present when everything exists", () => {
    const fs = makeFsMock({ existing: allModelFiles(), dictText: DICT_LINES.join("\n") });
    const svc = new PaddleOcrService(MODEL_DIR, { fs, path: realPath });
    const result = svc.checkModelFiles();
    expect(result.present).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.modelDir).toBe(MODEL_DIR);
  });

  it("lists missing files when one model is absent", () => {
    const existing = allModelFiles();
    // Drop the cls model file
    const clsPath = realPath.join(MODEL_DIR, PADDLE_MODEL_SUBDIRS.cls, PADDLE_MODEL_FILES.cls);
    existing.delete(clsPath);
    const fs = makeFsMock({ existing, dictText: DICT_LINES.join("\n") });
    const svc = new PaddleOcrService(MODEL_DIR, { fs, path: realPath });
    const result = svc.checkModelFiles();
    expect(result.present).toBe(false);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0]).toContain(PADDLE_MODEL_SUBDIRS.cls);
  });

  it("reports 4 missing files when the entire model dir is empty", () => {
    const fs = makeFsMock({ existing: new Set(), dictText: "" });
    const svc = new PaddleOcrService(MODEL_DIR, { fs, path: realPath });
    const result = svc.checkModelFiles();
    expect(result.present).toBe(false);
    expect(result.missing).toHaveLength(4);
  });
});

describe("PaddleOcrService.isReady", () => {
  it("is true iff all model files are present", () => {
    const fs = makeFsMock({ existing: allModelFiles(), dictText: DICT_LINES.join("\n") });
    const svc = new PaddleOcrService(MODEL_DIR, { fs, path: realPath });
    expect(svc.isReady).toBe(true);
  });

  it("is false when any model file is missing", () => {
    const fs = makeFsMock({ existing: new Set(), dictText: "" });
    const svc = new PaddleOcrService(MODEL_DIR, { fs, path: realPath });
    expect(svc.isReady).toBe(false);
  });
});

describe("PaddleOcrService.init", () => {
  it("throws a clear error when model files are missing", async () => {
    const fs = makeFsMock({ existing: new Set(), dictText: "" });
    const ort = makeOrtMock();
    const svc = new PaddleOcrService(MODEL_DIR, { fs, path: realPath, ort: ort as never });
    await expect(svc.init()).rejects.toThrow(/PaddleOCR 模型文件缺失/);
    // The dictionary file was not read, and no sessions were created.
    expect(ort.InferenceSession.create).not.toHaveBeenCalled();
  });

  it("loads dictionary + 3 sessions when all model files are present", async () => {
    const fs = makeFsMock({ existing: allModelFiles(), dictText: DICT_LINES.join("\n") });
    const ort = makeOrtMock();
    const svc = new PaddleOcrService(MODEL_DIR, { fs, path: realPath, ort: ort as never });
    await svc.init();
    // 3 ONNX sessions created (det, cls, rec)
    expect(ort.InferenceSession.create).toHaveBeenCalledTimes(3);
    // Idempotent: second call should not recreate sessions
    await svc.init();
    expect(ort.InferenceSession.create).toHaveBeenCalledTimes(3);
  });

  it("surfaces onStatus progress callbacks to the caller", async () => {
    const fs = makeFsMock({ existing: allModelFiles(), dictText: DICT_LINES.join("\n") });
    const ort = makeOrtMock();
    const svc = new PaddleOcrService(MODEL_DIR, { fs, path: realPath, ort: ort as never });
    const onStatus = vi.fn();
    await svc.init(onStatus);
    expect(onStatus).toHaveBeenCalled();
    const messages = onStatus.mock.calls.map((c) => c[0] as string);
    expect(messages.some((m) => m.includes("文本检测"))).toBe(true);
    expect(messages.some((m) => m.includes("方向分类"))).toBe(true);
    expect(messages.some((m) => m.includes("文本识别"))).toBe(true);
    expect(messages.some((m) => m.includes("字典"))).toBe(true);
  });
});

describe("PaddleOcrService.dispose", () => {
  it("releases all sessions and clears state", async () => {
    const fs = makeFsMock({ existing: allModelFiles(), dictText: DICT_LINES.join("\n") });
    const ort = makeOrtMock();
    const svc = new PaddleOcrService(MODEL_DIR, { fs, path: realPath, ort: ort as never });
    await svc.init();
    expect(ort.InferenceSession.create).toHaveBeenCalledTimes(3);
    await svc.dispose();
    // Subsequent init should re-create all 3 sessions.
    await svc.init();
    expect(ort.InferenceSession.create).toHaveBeenCalledTimes(6);
  });

  it("is idempotent (safe to call twice)", async () => {
    const fs = makeFsMock({ existing: allModelFiles(), dictText: DICT_LINES.join("\n") });
    const ort = makeOrtMock();
    const svc = new PaddleOcrService(MODEL_DIR, { fs, path: realPath, ort: ort as never });
    await svc.init();
    await expect(svc.dispose()).resolves.toBeUndefined();
    await expect(svc.dispose()).resolves.toBeUndefined();
  });
});

describe("PaddleOcrService.destroy", () => {
  it("does not throw when called on an uninitialized service", () => {
    const fs = makeFsMock({ existing: new Set(), dictText: "" });
    const svc = new PaddleOcrService(MODEL_DIR, { fs, path: realPath });
    expect(() => svc.destroy()).not.toThrow();
  });

  it("triggers an idle-timer-driven dispose after the configured timeout", async () => {
    vi.useFakeTimers();
    const fs = makeFsMock({ existing: allModelFiles(), dictText: DICT_LINES.join("\n") });
    const ort = makeOrtMock();
    const svc = new PaddleOcrService(MODEL_DIR, { fs, path: realPath, ort: ort as never });
    // Trigger runOcr so the idle timer is scheduled; runOcr will throw on the
    // minimal sharp mock, so we only need to assert that the timer fires.
    await svc
      .runOcr("/does/not/matter.png")
      .catch(() => {
        /* expected — sharp mock returns no usable image */
      });
    // Advance 180s + a tick
    await vi.advanceTimersByTimeAsync(181_000);
    // After dispose fires, init must re-create sessions
    await svc.init();
    // 3 (initial) + 3 (after dispose) = 6
    expect(ort.InferenceSession.create).toHaveBeenCalledTimes(6);
  });
});
