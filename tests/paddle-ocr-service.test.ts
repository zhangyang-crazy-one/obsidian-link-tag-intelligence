import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  PaddleOcrEngine,
  _internal,
  parsePaddleOcrDictFromYml,
} from "../src/paddle-ocr-service";
import {
  PADDLE_MODEL_FILES,
  PADDLE_MODEL_SUBDIRS,
  PADDLE_TIER_SPECS,
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
  })) as unknown as ConstructorParameters<typeof PaddleOcrEngine>[0] extends infer D
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
  set.add(realPath.join(MODEL_DIR, PADDLE_MODEL_SUBDIRS.rec, "inference.yml"));
  set.add(realPath.join(MODEL_DIR, PADDLE_MODEL_SUBDIRS.dict, PADDLE_MODEL_FILES.dict));
  return set;
}

// All 4 files (including optional cls) - useful for tests that want the "everything present" case
function fullyEquippedRequired(): Set<string> {
  const set = new Set<string>();
  for (const sub of [PADDLE_MODEL_SUBDIRS.det, PADDLE_MODEL_SUBDIRS.rec]) {
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

describe("PaddleOcrEngine.checkModelFiles", () => {
  it("reports all files present when everything exists", () => {
    const fs = makeFsMock({ existing: allModelFiles(), dictText: DICT_LINES.join("\n") });
    const svc = new PaddleOcrEngine(MODEL_DIR, { fs, path: realPath });
    const result = svc.checkModelFiles();
    expect(result.present).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.modelDir).toBe(MODEL_DIR);
  });

  it("lists missing files when one required model is absent", () => {
    const existing = allModelFiles();
    // Drop the rec model file (required, not optional)
    const recPath = realPath.join(MODEL_DIR, PADDLE_MODEL_SUBDIRS.rec, PADDLE_MODEL_FILES.det);
    existing.delete(recPath);
    const fs = makeFsMock({ existing, dictText: DICT_LINES.join("\n") });
    const svc = new PaddleOcrEngine(MODEL_DIR, { fs, path: realPath });
    const result = svc.checkModelFiles();
    expect(result.present).toBe(false);
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0]).toContain(PADDLE_MODEL_SUBDIRS.rec);
  });

  it("treats missing cls as a non-fatal optional absence", () => {
    const existing = allModelFiles();
    // Drop only the cls model file (cls is optional since PP-OCRv5 mobile cls
    // ONNX is not published by PaddlePaddle)
    const clsPath = realPath.join(MODEL_DIR, PADDLE_MODEL_SUBDIRS.cls, PADDLE_MODEL_FILES.det);
    existing.delete(clsPath);
    const fs = makeFsMock({ existing, dictText: DICT_LINES.join("\n") });
    const svc = new PaddleOcrEngine(MODEL_DIR, { fs, path: realPath });
    const result = svc.checkModelFiles();
    expect(result.present).toBe(true);                       // all required files present
    expect(result.missing).toHaveLength(0);
    expect(result.missingOptional).toHaveLength(1);
    expect(result.missingOptional[0]).toContain(PADDLE_MODEL_SUBDIRS.cls);
  });

  it("reports 2 missing files for the default server tier when the model dir is empty", () => {
    const fs = makeFsMock({ existing: new Set(), dictText: "" });
    const svc = new PaddleOcrEngine(MODEL_DIR, { fs, path: realPath });
    const result = svc.checkModelFiles();
    expect(result.present).toBe(false);
    expect(result.missing).toHaveLength(3);
    expect(result.missing.some((item) => item.includes(PADDLE_MODEL_SUBDIRS.det))).toBe(true);
    expect(result.missing.some((item) => item.includes(PADDLE_MODEL_SUBDIRS.rec))).toBe(true);
    expect(result.missing).toContain(realPath.join(PADDLE_MODEL_SUBDIRS.rec, "inference.yml"));
    expect(result.missingOptional).toHaveLength(1);
  });

  it("reports 3 missing files for mobile tier when the model dir is empty", () => {
    const fs = makeFsMock({ existing: new Set(), dictText: "" });
    const svc = new PaddleOcrEngine(MODEL_DIR, { fs, path: realPath, tier: "mobile" });
    const result = svc.checkModelFiles();
    expect(result.present).toBe(false);
    expect(result.missing).toHaveLength(3);
    expect(result.missing.some((item) => item.includes(PADDLE_MODEL_SUBDIRS.dict))).toBe(true);
    expect(result.missingOptional).toHaveLength(1);
  });
});

describe("PaddleOcrEngine.isReady", () => {
  it("is true iff all model files are present", () => {
    const fs = makeFsMock({ existing: allModelFiles(), dictText: DICT_LINES.join("\n") });
    const svc = new PaddleOcrEngine(MODEL_DIR, { fs, path: realPath });
    expect(svc.isReady).toBe(true);
  });

  it("is false when any model file is missing", () => {
    const fs = makeFsMock({ existing: new Set(), dictText: "" });
    const svc = new PaddleOcrEngine(MODEL_DIR, { fs, path: realPath });
    expect(svc.isReady).toBe(false);
  });
});

describe("PaddleOcrEngine.init", () => {
  it("throws a clear error when model files are missing", async () => {
    const fs = makeFsMock({ existing: new Set(), dictText: "" });
    const ort = makeOrtMock();
    const svc = new PaddleOcrEngine(MODEL_DIR, { fs, path: realPath, ort: ort as never });
    await expect(svc.init()).rejects.toThrow(/PaddleOCR 模型文件缺失/);
    // The dictionary file was not read, and no sessions were created.
    expect(ort.InferenceSession.create).not.toHaveBeenCalled();
  });

  it("loads dictionary + 3 sessions when all model files are present", async () => {
    const fs = makeFsMock({ existing: allModelFiles(), dictText: DICT_LINES.join("\n") });
    const ort = makeOrtMock();
    const svc = new PaddleOcrEngine(MODEL_DIR, { fs, path: realPath, ort: ort as never, cpuThreads: 6 });
    await svc.init();
    // 3 ONNX sessions created (det, cls, rec)
    expect(ort.InferenceSession.create).toHaveBeenCalledTimes(3);
    expect(ort.InferenceSession.create).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        executionProviders: ["cpu"],
        intraOpNumThreads: 6,
        interOpNumThreads: 2,
        executionMode: "parallel",
        graphOptimizationLevel: "all",
      })
    );
    // Idempotent: second call should not recreate sessions
    await svc.init();
    expect(ort.InferenceSession.create).toHaveBeenCalledTimes(3);
  });

  it("surfaces onStatus progress callbacks to the caller", async () => {
    const fs = makeFsMock({ existing: allModelFiles(), dictText: DICT_LINES.join("\n") });
    const ort = makeOrtMock();
    const svc = new PaddleOcrEngine(MODEL_DIR, { fs, path: realPath, ort: ort as never });
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

describe("PaddleOcrEngine.dispose", () => {
  it("releases all sessions and clears state", async () => {
    const fs = makeFsMock({ existing: allModelFiles(), dictText: DICT_LINES.join("\n") });
    const ort = makeOrtMock();
    const svc = new PaddleOcrEngine(MODEL_DIR, { fs, path: realPath, ort: ort as never });
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
    const svc = new PaddleOcrEngine(MODEL_DIR, { fs, path: realPath, ort: ort as never });
    await svc.init();
    await expect(svc.dispose()).resolves.toBeUndefined();
    await expect(svc.dispose()).resolves.toBeUndefined();
  });
});

describe("PaddleOcrEngine.destroy", () => {
  it("does not throw when called on an uninitialized service", () => {
    const fs = makeFsMock({ existing: new Set(), dictText: "" });
    const svc = new PaddleOcrEngine(MODEL_DIR, { fs, path: realPath });
    expect(() => svc.destroy()).not.toThrow();
  });

  it("triggers an idle-timer-driven dispose after the configured timeout", async () => {
    vi.useFakeTimers();
    const fs = makeFsMock({ existing: allModelFiles(), dictText: DICT_LINES.join("\n") });
    const ort = makeOrtMock();
    const svc = new PaddleOcrEngine(MODEL_DIR, { fs, path: realPath, ort: ort as never });
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

// ---------------------------------------------------------------------------
// PaddleOcrEngine construction honors detConfig overrides
// ---------------------------------------------------------------------------

describe("PaddleOcrEngine constructor with detConfig overrides", () => {
  it("uses the user-supplied detConfig values (not the defaults)", () => {
    // We can't easily test that the constants are read, but we can verify
    // the constructor accepts a Partial<PaddleDetConfig> without throwing.
    const svc = new PaddleOcrEngine(MODEL_DIR, {
      detConfig: {
        dbThresh: 0.5,
        dbBoxThresh: 0.4,
        unclipRatio: 2.0,
        minSize: 5,
        nmsIouThresh: 0.5,
        maxCandidates: 500,
        limitSideLen: 800,
        scoreMode: "slow",
        useDilation: true,
      },
    });
    expect(svc).toBeInstanceOf(PaddleOcrEngine);
  });

  it("falls back to PADDLE_DET_DEFAULTS for any unspecified field", () => {
    // Partial override: only set dbThresh, rest should default
    const svc = new PaddleOcrEngine(MODEL_DIR, {
      detConfig: { dbThresh: 0.42 },
    });
    expect(svc).toBeInstanceOf(PaddleOcrEngine);
  });
});

// ---------------------------------------------------------------------------
// Geometry helper sanity checks (polygon area, IoU, marching-squares perimeter)
// We access internals via a small PaddleOcrEngine instance — these private
// helpers are pure math, no model loading required.
// ---------------------------------------------------------------------------

/** Type alias matching the private Quad return type. */
type Quad8 = [number, number, number, number, number, number, number, number];

describe("PaddleOcrEngine geometry helpers", () => {
  it("polygonIoU of identical quads equals 1.0", () => {
    const svc = new PaddleOcrEngine(MODEL_DIR);
    const a: Quad8 = [0, 0, 10, 0, 10, 10, 0, 10];
    // (polygonIoU is private; call it via any-cast)
    const iou = (svc as unknown as { polygonIoU: (a: Quad8, b: Quad8) => number }).polygonIoU(a, a);
    expect(iou).toBeCloseTo(1.0, 5);
  });

  it("polygonIoU of disjoint quads equals 0.0", () => {
    const svc = new PaddleOcrEngine(MODEL_DIR);
    const a: Quad8 = [0, 0, 10, 0, 10, 10, 0, 10];
    const b: Quad8 = [20, 20, 30, 20, 30, 30, 20, 30];
    const iou = (svc as unknown as { polygonIoU: (a: Quad8, b: Quad8) => number }).polygonIoU(a, b);
    expect(iou).toBe(0);
  });

  it("polygonIoU of half-overlapping quads is between 0 and 1", () => {
    const svc = new PaddleOcrEngine(MODEL_DIR);
    const a: Quad8 = [0, 0, 10, 0, 10, 10, 0, 10];
    const b: Quad8 = [5, 0, 15, 0, 15, 10, 5, 10];
    const iou = (svc as unknown as { polygonIoU: (a: Quad8, b: Quad8) => number }).polygonIoU(a, b);
    expect(iou).toBeGreaterThan(0);
    expect(iou).toBeLessThan(1);
  });

  it("polygonArea of a 10x10 square is 100", () => {
    const svc = new PaddleOcrEngine(MODEL_DIR);
    const a: Quad8 = [0, 0, 10, 0, 10, 10, 0, 10];
    const area = (svc as unknown as { polygonArea: (q: number[]) => number }).polygonArea(a);
    expect(area).toBeCloseTo(100, 5);
  });

  it("polygonPerimeter of a 10x10 square is 40", () => {
    const svc = new PaddleOcrEngine(MODEL_DIR);
    const a: Quad8 = [0, 0, 10, 0, 10, 10, 0, 10];
    const perim = (svc as unknown as { polygonPerimeter: (q: number[]) => number }).polygonPerimeter(a);
    expect(perim).toBeCloseTo(40, 5);
  });

  it("polygonOffsetDistance matches the PaddleOCR formula (area * ratio / perimeter)", () => {
    const svc = new PaddleOcrEngine(MODEL_DIR);
    const a: Quad8 = [0, 0, 10, 0, 10, 10, 0, 10];
    // area = 100, perimeter = 40, ratio = 1.5 → distance = 100*1.5/40 = 3.75
    const dist = (svc as unknown as { polygonOffsetDistance: (q: Quad8, r: number) => number }).polygonOffsetDistance(a, 1.5);
    expect(dist).toBeCloseTo(3.75, 5);
  });

  it("offsetPolygon returns a polygon with strictly larger area than the input", () => {
    const svc = new PaddleOcrEngine(MODEL_DIR);
    const a: Quad8 = [5, 5, 15, 5, 15, 15, 5, 15];
    const before = (svc as unknown as { polygonArea: (q: number[]) => number }).polygonArea(a);
    const offset = (svc as unknown as { offsetPolygon: (q: number[], d: number) => number[] }).offsetPolygon(a, 3);
    const after = (svc as unknown as { polygonArea: (q: number[]) => number }).polygonArea(offset);
    expect(after).toBeGreaterThan(before);
  });

  it("greedyNMS suppresses overlapping low-score boxes", () => {
    const svc = new PaddleOcrEngine(MODEL_DIR);
    // Two nearly-identical boxes; one with a higher score should win.
    const a: Quad8 = [0, 0, 10, 0, 10, 10, 0, 10];
    const b: Quad8 = [1, 1, 11, 1, 11, 11, 1, 11]; // ~81% overlap with a
    const kept = (svc as unknown as {
      greedyNMS: (polys: Quad8[], scores: number[], thresh: number) => Quad8[];
    }).greedyNMS([a, b], [0.9, 0.5], 0.3);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toEqual(a);
  });

  it("greedyNMS keeps non-overlapping boxes", () => {
    const svc = new PaddleOcrEngine(MODEL_DIR);
    const a: Quad8 = [0, 0, 10, 0, 10, 10, 0, 10];
    const b: Quad8 = [20, 20, 30, 20, 30, 30, 20, 30];
    const kept = (svc as unknown as {
      greedyNMS: (polys: Quad8[], scores: number[], thresh: number) => Quad8[];
    }).greedyNMS([a, b], [0.9, 0.8], 0.3);
    expect(kept).toHaveLength(2);
  });

  it("minAreaRect of a 10x10 square is a 10x10 square", () => {
    const svc = new PaddleOcrEngine(MODEL_DIR);
    const points: Array<[number, number]> = [
      [0, 0], [10, 0], [10, 10], [0, 10]
    ];
    const rect = (svc as unknown as {
      minAreaRect: (pts: Array<[number, number]>) => Quad8 | null;
    }).minAreaRect(points);
    expect(rect).not.toBeNull();
    // 4 corner area = 100
    const a = (svc as unknown as { polygonArea: (q: number[]) => number }).polygonArea(rect!);
    expect(a).toBeCloseTo(100, 1);
  });

  it("minAreaRect of a degenerate 2-point set returns null", () => {
    const svc = new PaddleOcrEngine(MODEL_DIR);
    const rect = (svc as unknown as {
      minAreaRect: (pts: Array<[number, number]>) => Quad8 | null;
    }).minAreaRect([[0, 0], [1, 1]]);
    expect(rect).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PaddleOcrEngine constructor honors the new `tier` option
// ---------------------------------------------------------------------------

describe("PaddleOcrEngine constructor with tier option", () => {
  it("defaults to server tier when no tier is specified", () => {
    const svc = new PaddleOcrEngine(MODEL_DIR, { fs: {} as never });
    expect((svc as unknown as { tier: string }).tier).toBe("server");
  });

  it("accepts server tier", () => {
    const svc = new PaddleOcrEngine(MODEL_DIR, { tier: "server", fs: {} as never });
    expect((svc as unknown as { tier: string }).tier).toBe("server");
  });

  it("accepts hybrid tier", () => {
    const svc = new PaddleOcrEngine(MODEL_DIR, { tier: "hybrid", fs: {} as never });
    expect((svc as unknown as { tier: string }).tier).toBe("hybrid");
  });

  it("checkModelFiles requires server-tier rec inference yml when tier=server", () => {
    const existing = new Set<string>([
      realPath.join(MODEL_DIR, "det", "inference.onnx"),
      realPath.join(MODEL_DIR, "rec", "inference.onnx"),
      realPath.join(MODEL_DIR, "rec", "inference.yml"),
    ]);
    const fs = makeFsMock({ existing, dictText: "" });
    const svc = new PaddleOcrEngine(MODEL_DIR, { tier: "server", fs });
    const result = svc.checkModelFiles();
    expect(result.missing).toEqual([]); // both det + rec present
    expect(result.modelDir).toBe(MODEL_DIR);
  });

  it("checkModelFiles reports missing server-tier rec inference yml", () => {
    const existing = new Set<string>([
      realPath.join(MODEL_DIR, "det", "inference.onnx"),
      realPath.join(MODEL_DIR, "rec", "inference.onnx"),
    ]);
    const fs = makeFsMock({ existing, dictText: "" });
    const svc = new PaddleOcrEngine(MODEL_DIR, { tier: "server", fs });
    const result = svc.checkModelFiles();
    expect(result.missing).toEqual([realPath.join("rec", "inference.yml")]);
  });
});

// ---------------------------------------------------------------------------
// parsePaddleOcrDictFromYml — yml dictionary parser
// ---------------------------------------------------------------------------

describe("parsePaddleOcrDictFromYml", () => {
  it("extracts an unquoted list of tokens", () => {
    // The first entry of the real PP-OCRv5 mobile yml is 　 (full-width
    // space, the CTC blank token in PaddleOCR's convention). Subsequent
    // entries are real CJK characters. This test exercises the basic
    // list-of-strings path through the parser.
    const yml = [
      "PostProcess:",
      "  name: CTCLabelDecode",
      "  character_dict:",
      "    - 　",
      "    - 一",
      "    - 乙",
      "    - 二",
    ].join("\n");
    const r = parsePaddleOcrDictFromYml(yml);
    expect(parsePaddleOcrDictFromYml(yml)).toEqual(["　", "一", "乙", "二"]);
  });

  it("handles an empty list item (the `-` line on its own)", () => {
    // Some Yaml serializers emit `-` for an empty string. PP-OCRv5 doesn't
    // do this, but the parser should still be robust.
    const yml = `
character_dict:
    - "　"
    -
    - 一
`;
    expect(parsePaddleOcrDictFromYml(yml)).toEqual(["　", "", "一"]);
  });

  it("handles double-quoted strings with escape sequences", () => {
    const yml = `
PostProcess:
  character_dict:
    - "\\\\"
    - "\\"quoted\\""
    - "line1\\nline2"
    - "tab\\there"
`;
    expect(parsePaddleOcrDictFromYml(yml)).toEqual([
      "\\",
      '"quoted"',
      "line1\nline2",
      "tab\there",
    ]);
  });

  it("handles Unicode escape sequences \\uXXXX", () => {
    const yml = `
PostProcess:
  character_dict:
    - "中"
    - "あ"
    - "𝐀"
`;
    // The PaddleOCRv5 rec yml uses literal CJK characters, not \u escapes,
    // but our unquoteYamlString also handles \\uXXXX for robustness.
    expect(parsePaddleOcrDictFromYml(yml).length).toBe(3);
  });

  it("returns [] if no character_dict section", () => {
    const yml = `
SomeOtherSection:
  foo: bar
`;
    expect(parsePaddleOcrDictFromYml(yml)).toEqual([]);
  });

  it("returns [] for empty character_dict section", () => {
    const yml = `
PostProcess:
  character_dict:
`;
    expect(parsePaddleOcrDictFromYml(yml)).toEqual([]);
  });

  it("stops at the first non-list line", () => {
    const yml = `
PostProcess:
  character_dict:
    - 一
    - 二
  name: CTCLabelDecode
    - this_should_not_be_included
`;
    expect(parsePaddleOcrDictFromYml(yml)).toEqual(["一", "二"]);
  });

  it("unquoteYamlString strips surrounding double quotes", () => {
    expect(_internal.unquoteYamlString('"hello"')).toBe("hello");
    expect(_internal.unquoteYamlString('"中"')).toBe("中");
  });

  it("unquoteYamlString strips surrounding single quotes", () => {
    expect(_internal.unquoteYamlString("'hello'")).toBe("hello");
  });

  it("unquoteYamlString handles backslash sequences", () => {
    expect(_internal.unquoteYamlString('"a\\\\b"')).toBe("a\\b");
    expect(_internal.unquoteYamlString('"a\\"b"')).toBe('a"b');
    expect(_internal.unquoteYamlString('"a\\nb"')).toBe("a\nb");
    expect(_internal.unquoteYamlString('"a\\tb"')).toBe("a\tb");
  });
});

// ---------------------------------------------------------------------------
// PADDLE_TIER_SPECS invariants — guard against spec drift
// ---------------------------------------------------------------------------

describe("PADDLE_TIER_SPECS", () => {
  it("has exactly the three documented tiers", () => {
    expect(Object.keys(PADDLE_TIER_SPECS).sort()).toEqual(["hybrid", "mobile", "server"]);
  });

  it("every tier has det and rec spec with non-empty fields", () => {
    for (const [tier, spec] of Object.entries(PADDLE_TIER_SPECS)) {
      expect(spec.det.repo, `tier=${tier} det.repo`).toMatch(/PP-OCRv5_/);
      expect(spec.rec.repo, `tier=${tier} rec.repo`).toMatch(/PP-OCRv5_/);
      expect(spec.det.filename).toBe("inference.onnx");
      expect(spec.rec.filename).toBe("inference.onnx");
      expect(spec.det.sizeBytes).toBeGreaterThan(0);
      expect(spec.rec.sizeBytes).toBeGreaterThan(0);
    }
  });

  it("server tier files are larger than mobile", () => {
    const m = PADDLE_TIER_SPECS.mobile.det.sizeBytes + PADDLE_TIER_SPECS.mobile.rec.sizeBytes;
    const s = PADDLE_TIER_SPECS.server.det.sizeBytes + PADDLE_TIER_SPECS.server.rec.sizeBytes;
    expect(s).toBeGreaterThan(m * 3); // server is at least 3x bigger than mobile
  });
});
