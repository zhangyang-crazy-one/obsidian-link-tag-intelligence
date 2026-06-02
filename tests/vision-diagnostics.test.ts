import { describe, it, expect, beforeEach } from "vitest";
import { VisionDiagnostics } from "../src/vision-diagnostics";
import * as realPath from "path";

// ---------------------------------------------------------------------------
// In-memory fs mock — only existsSync, statSync, readdirSync are exercised.
// ---------------------------------------------------------------------------

type FakeStat = { size: number; isFile: () => boolean };

function makeFsMock(opts: {
  existing: Set<string>;
  sizes?: Map<string, number>;
  onnxDirContents?: string[];
}) {
  const { existing, sizes = new Map(), onnxDirContents = [] } = opts;
  return {
    existsSync: (p: string) => existing.has(p),
    statSync: (p: string): FakeStat => ({
      size: sizes.get(p) ?? 1024,
      isFile: () => true,
    }),
    readdirSync: (p: string) => {
      if (onnxDirContents.length > 0 && p.endsWith("onnx")) return onnxDirContents;
      return [];
    },
  } as unknown as typeof import("fs");
}

const PLUGIN_DIR = "/fake/plugins/link-tag-intelligence";
const PADDLE_DIR = `${PLUGIN_DIR}/models/ocr/pp-ocrv5/mobile`;
const TESS_DIR = `${PLUGIN_DIR}/models/tessdata`;
const QWEN_DIR = `${PLUGIN_DIR}/models/Qwen2-VL-2B-Instruct`;
const VISION_WORKER = `${PLUGIN_DIR}/vision-worker.js`;

function fullyEquipped() {
  const set = new Set<string>();
  set.add(realPath.join(PADDLE_DIR, "det", "inference.onnx"));
  set.add(realPath.join(PADDLE_DIR, "rec", "inference.onnx"));
  set.add(realPath.join(PADDLE_DIR, "cls", "inference.onnx"));
  set.add(realPath.join(PADDLE_DIR, "dict", "ppocr_keys_v5.txt"));
  set.add(realPath.join(TESS_DIR, "chi_sim.traineddata"));
  set.add(realPath.join(TESS_DIR, "eng.traineddata"));
  set.add(realPath.join(QWEN_DIR, "onnx"));
  set.add(VISION_WORKER);
  const sizes = new Map<string, number>([
    [realPath.join(PADDLE_DIR, "det", "inference.onnx"), 4_600_000],
    [realPath.join(PADDLE_DIR, "rec", "inference.onnx"), 16_000_000],
    [realPath.join(PADDLE_DIR, "cls", "inference.onnx"), 1_000_000],
    [realPath.join(PADDLE_DIR, "dict", "ppocr_keys_v5.txt"), 10_000_000],
    [realPath.join(TESS_DIR, "chi_sim.traineddata"), 2_400_000],
    [realPath.join(TESS_DIR, "eng.traineddata"), 4_100_000],
  ]);
  return { set, sizes, onnxContents: ["decoder_model_merged_q4.onnx", "embed_tokens_q4.onnx", "vision_encoder_q4.onnx"] };
}

beforeEach(() => {
  // No global teardown needed; each test constructs its own service.
});

describe("VisionDiagnostics.runDiagnostics — happy path", () => {
  it("reports overallOk=true when every model file is present", () => {
    const { set, sizes, onnxContents } = fullyEquipped();
    const fs = makeFsMock({ existing: set, sizes, onnxDirContents: onnxContents });
    const diag = new VisionDiagnostics(PLUGIN_DIR, {}, { fs, path: realPath, tier: "mobile" });
    const r = diag.runDiagnostics();
    expect(r.overallOk).toBe(true);
    expect(r.paddleOcr.present).toBe(true);
    expect(r.paddleOcr.missing).toEqual([]);
    expect(r.tesseract.present).toBe(true);
    expect(r.qwenVl.present).toBe(true);
    expect(r.qwenVl.fileCount).toBe(3);
    expect(r.visionWorkerJs.present).toBe(true);
  });
});

describe("VisionDiagnostics.runDiagnostics — partial / total failure", () => {
  it("lists missing PaddleOCR files but ignores Tesseract and Qwen", () => {
    const { set, sizes, onnxContents } = fullyEquipped();
    // Drop the rec model and the dictionary
    set.delete(realPath.join(PADDLE_DIR, "rec", "inference.onnx"));
    set.delete(realPath.join(PADDLE_DIR, "dict", "ppocr_keys_v5.txt"));
    const fs = makeFsMock({ existing: set, sizes, onnxDirContents: onnxContents });
    const diag = new VisionDiagnostics(PLUGIN_DIR, {}, { fs, path: realPath, tier: "mobile" });
    const r = diag.runDiagnostics();
    expect(r.overallOk).toBe(false);
    expect(r.paddleOcr.present).toBe(false);
    expect(r.paddleOcr.missing).toHaveLength(2);
    expect(r.paddleOcr.missing.some((m) => m.includes("rec"))).toBe(true);
    expect(r.paddleOcr.missing.some((m) => m.includes("dict"))).toBe(true);
    // Tesseract + Qwen still healthy
    expect(r.tesseract.present).toBe(true);
    expect(r.qwenVl.present).toBe(true);
  });

  it("reports Qwen-VL missing when onnx/ subdir does not exist", () => {
    const { set, sizes } = fullyEquipped();
    set.delete(realPath.join(QWEN_DIR, "onnx"));
    const fs = makeFsMock({ existing: set, sizes, onnxDirContents: [] });
    const diag = new VisionDiagnostics(PLUGIN_DIR, {}, { fs, path: realPath, tier: "mobile" });
    const r = diag.runDiagnostics();
    expect(r.overallOk).toBe(false);
    expect(r.qwenVl.present).toBe(false);
    expect(r.qwenVl.missing).toHaveLength(1);
  });

  it("reports Qwen-VL missing when onnx/ exists but contains no .onnx files", () => {
    const { set, sizes } = fullyEquipped();
    // Keep the dir present, but return [] from readdirSync
    const fs = makeFsMock({ existing: set, sizes, onnxDirContents: [] });
    const diag = new VisionDiagnostics(PLUGIN_DIR, {}, { fs, path: realPath, tier: "mobile" });
    const r = diag.runDiagnostics();
    expect(r.qwenVl.present).toBe(false);
    expect(r.qwenVl.missing[0]).toMatch(/empty/);
  });

  it("reports vision-worker.js missing when the build artifact is absent", () => {
    const { set, sizes, onnxContents } = fullyEquipped();
    set.delete(VISION_WORKER);
    const fs = makeFsMock({ existing: set, sizes, onnxDirContents: onnxContents });
    const diag = new VisionDiagnostics(PLUGIN_DIR, {}, { fs, path: realPath, tier: "mobile" });
    const r = diag.runDiagnostics();
    expect(r.overallOk).toBe(false);
    expect(r.visionWorkerJs.present).toBe(false);
  });

  it("reports every engine broken when nothing exists", () => {
    const fs = makeFsMock({ existing: new Set(), sizes: new Map(), onnxDirContents: [] });
    const diag = new VisionDiagnostics(PLUGIN_DIR, {}, { fs, path: realPath, tier: "mobile" });
    const r = diag.runDiagnostics();
    expect(r.overallOk).toBe(false);
    expect(r.paddleOcr.present).toBe(false);
    expect(r.paddleOcr.missing).toHaveLength(3);     // 3 required (det, rec, dict)
    expect(r.paddleOcr.missingOptional).toHaveLength(1); // cls (optional)
    expect(r.tesseract.present).toBe(false);
    expect(r.tesseract.missing).toHaveLength(2);
    expect(r.qwenVl.present).toBe(false);
    expect(r.visionWorkerJs.present).toBe(false);
  });
});

describe("VisionDiagnostics.runDiagnostics — settings overrides", () => {
  it("uses paddleOcrModelPath from settings (absolute)", () => {
    const { set, sizes, onnxContents } = fullyEquipped();
    const customDir = "/abs/path/to/paddle";
    // Add the custom dir's files
    set.add(realPath.join(customDir, "det", "inference.onnx"));
    set.add(realPath.join(customDir, "rec", "inference.onnx"));
    set.add(realPath.join(customDir, "cls", "inference.onnx"));
    set.add(realPath.join(customDir, "dict", "ppocr_keys_v5.txt"));
    const fs = makeFsMock({ existing: set, sizes, onnxDirContents: onnxContents });
    const diag = new VisionDiagnostics(PLUGIN_DIR, { paddleOcrModelPath: customDir }, { fs, path: realPath });
    const r = diag.runDiagnostics();
    expect(r.paddleOcr.modelDir).toBe(customDir);
    expect(r.paddleOcr.present).toBe(true);
  });

  it("resolves relative settings paths against the vault root", () => {
    const { set, sizes, onnxContents } = fullyEquipped();
    const vaultRoot = "/vault";
    const relDir = "models/ocr/pp-ocrv5/mobile";
    // Move PaddleOCR files to the vault-relative location
    set.add(realPath.join(vaultRoot, relDir, "det", "inference.onnx"));
    set.add(realPath.join(vaultRoot, relDir, "rec", "inference.onnx"));
    set.add(realPath.join(vaultRoot, relDir, "cls", "inference.onnx"));
    set.add(realPath.join(vaultRoot, relDir, "dict", "ppocr_keys_v5.txt"));
    // Remove the plugin-bundled copies
    set.delete(realPath.join(PADDLE_DIR, "det", "inference.onnx"));
    set.delete(realPath.join(PADDLE_DIR, "rec", "inference.onnx"));
    set.delete(realPath.join(PADDLE_DIR, "cls", "inference.onnx"));
    set.delete(realPath.join(PADDLE_DIR, "dict", "ppocr_keys_v5.txt"));

    const fs = makeFsMock({ existing: set, sizes, onnxDirContents: onnxContents });
    const diag = new VisionDiagnostics(PLUGIN_DIR, { paddleOcrModelPath: relDir }, { fs, path: realPath, vaultRoot });
    const r = diag.runDiagnostics();
    expect(r.paddleOcr.modelDir).toBe(realPath.resolve(vaultRoot, relDir));
    expect(r.paddleOcr.present).toBe(true);
  });
});

describe("VisionDiagnostics.formatReport", () => {
  it("renders an OK report with a green checkmark and engine summaries", () => {
    const { set, sizes, onnxContents } = fullyEquipped();
    const fs = makeFsMock({ existing: set, sizes, onnxDirContents: onnxContents });
    const diag = new VisionDiagnostics(PLUGIN_DIR, {}, { fs, path: realPath, tier: "mobile" });
    const report = diag.formatReport(diag.runDiagnostics());
    expect(report).toMatch(/✅ 视觉模型完整性检查通过/);
    expect(report).toMatch(/PaddleOCR \(主 OCR 引擎\)/);
    expect(report).toMatch(/Tesseract \(OCR 兜底\)/);
    expect(report).toMatch(/Qwen2-VL \(图像语义\)/);
    expect(report).toMatch(/Vision Worker/);
    expect(report).not.toMatch(/修复指引/);
  });

  it("renders a fail report listing missing items", () => {
    const fs = makeFsMock({ existing: new Set(), sizes: new Map(), onnxDirContents: [] });
    const diag = new VisionDiagnostics(PLUGIN_DIR, {}, { fs, path: realPath, tier: "mobile" });
    const report = diag.formatReport(diag.runDiagnostics());
    expect(report).toMatch(/❌ 视觉模型完整性检查未通过/);
    expect(report).toMatch(/缺失: 3 项/);  // PaddleOCR required (det, rec, dict)
    expect(report).toMatch(/缺失: 2 项/);  // Tesseract
    expect(report).toMatch(/修复指引/);
  });
});
