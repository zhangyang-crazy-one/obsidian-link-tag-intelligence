import { describe, expect, it } from "vitest";
import {
  buildPaddleFileUrl,
  getPaddleTierFileList,
  getPaddleTierTotalBytes,
  isPaddleTierInstalled,
} from "../src/paddle-model";
import {
  DEFAULT_PADDLE_TIER,
  getPaddleTierModelDir,
  PADDLE_TIER_SPECS,
} from "../src/paddle-ocr-types";

describe("PaddleOCR tier model metadata", () => {
  it("defaults to server tier", () => {
    expect(DEFAULT_PADDLE_TIER).toBe("server");
    expect(getPaddleTierModelDir(DEFAULT_PADDLE_TIER)).toBe("models/ocr/pp-ocrv5/server");
  });

  it("server tier downloads server det and server rec files", () => {
    const files = getPaddleTierFileList("server");
    expect(files.map((item) => item.role)).toEqual(["det", "rec", "rec"]);
    expect(files[0].spec.repo).toBe("PaddlePaddle/PP-OCRv5_server_det_onnx");
    expect(files[1].spec.repo).toBe("PaddlePaddle/PP-OCRv5_server_rec_onnx");
    expect(files[2].spec.repo).toBe("PaddlePaddle/PP-OCRv5_server_rec_onnx");
    expect(files.map((item) => item.spec.filename)).toEqual(["inference.onnx", "inference.onnx", "inference.yml"]);
  });

  it("hybrid tier combines mobile detection with server recognition", () => {
    const files = getPaddleTierFileList("hybrid");
    expect(files[0].spec.repo).toBe(PADDLE_TIER_SPECS.mobile.det.repo);
    expect(files[1].spec.repo).toBe(PADDLE_TIER_SPECS.server.rec.repo);
    expect(files[2]).toEqual({ role: "rec", spec: PADDLE_TIER_SPECS.server.dict });
  });

  it("mobile tier downloads the standalone dictionary file", () => {
    const files = getPaddleTierFileList("mobile");
    expect(files.map((item) => `${item.role}/${item.spec.filename}`)).toEqual([
      "det/inference.onnx",
      "rec/inference.onnx",
      "dict/ppocr_keys_v5.txt",
    ]);
  });

  it("builds HuggingFace mirror URLs for server files", () => {
    const url = buildPaddleFileUrl(PADDLE_TIER_SPECS.server.det, "https://hf-mirror.com/");
    expect(url).toBe("https://hf-mirror.com/PaddlePaddle/PP-OCRv5_server_det_onnx/resolve/main/inference.onnx");
  });

  it("reports server tier installed from det/rec files and rec inference yml", () => {
    const modelDir = "/models/ocr/pp-ocrv5/server";
    const existing = new Set([
      `${modelDir}/det/inference.onnx`,
      `${modelDir}/rec/inference.onnx`,
      `${modelDir}/rec/inference.yml`,
    ]);
    const result = isPaddleTierInstalled("server", (path) => existing.has(path), modelDir);
    expect(result.installed).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("detects missing server recognition file", () => {
    const modelDir = "/models/ocr/pp-ocrv5/server";
    const existing = new Set([
      `${modelDir}/det/inference.onnx`,
    ]);
    const result = isPaddleTierInstalled("server", (path) => existing.has(path), modelDir);
    expect(result.installed).toBe(false);
    expect(result.missing).toEqual([
      `${modelDir}/rec/inference.onnx`,
      `${modelDir}/rec/inference.yml`,
    ]);
  });

  it("detects missing mobile dictionary file", () => {
    const modelDir = "/models/ocr/pp-ocrv5/mobile";
    const existing = new Set([
      `${modelDir}/det/inference.onnx`,
      `${modelDir}/rec/inference.onnx`,
    ]);
    const result = isPaddleTierInstalled("mobile", (path) => existing.has(path), modelDir);
    expect(result.installed).toBe(false);
    expect(result.missing).toEqual([`${modelDir}/dict/ppocr_keys_v5.txt`]);
  });

  it("server tier is substantially larger than mobile tier", () => {
    expect(getPaddleTierTotalBytes("server")).toBeGreaterThan(getPaddleTierTotalBytes("mobile") * 3);
  });
});
