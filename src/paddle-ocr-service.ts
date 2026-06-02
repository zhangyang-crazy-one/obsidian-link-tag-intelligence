// PaddleOCR v5 mobile service — primary OCR engine in the 3-tier OCR routing.
// Runs in-process via onnxruntime-node (native binding) for minimal memory footprint.
// Lazy-loads 3 ONNX models (det + rec + cls) plus a character dictionary on first use.
// 100% offline; falls back gracefully to TesseractOcrService if init or inference fails.

import * as path from "path";
import {
  PaddleOcrResult,
  PaddleOcrRegion,
  PADDLE_DET_CLS_PREPROCESS,
  PADDLE_REC_PREPROCESS,
  PADDLE_DET_DEFAULTS,
  PADDLE_MODEL_FILES,
  PADDLE_MODEL_SUBDIRS,
  type PaddleDetConfig,
} from "./paddle-ocr-types";

// Minimal InferenceSession shape we rely on. Avoids `any` on the public surface.
type OrtSession = {
  inputNames: string[];
  outputNames: string[];
  run: (feeds: Record<string, unknown>) => Promise<Record<string, { data: Float32Array; dims: number[] }>>;
  release: () => Promise<void>;
};

type OrtLike = {
  InferenceSession: {
    create: (uri: string, options?: { executionProviders?: string[] }) => Promise<OrtSession>;
  };
  Tensor: new (type: "float32" | "uint8" | "int32" | "int64" | "bool" | "string" | "float16" | "float64" | "uint16" | "uint32" | "uint64" | "int8" | "int16" | "int4" | "uint4", data: Float32Array | Uint8Array | Int32Array | BigInt64Array | Uint8Array | string[] | Uint16Array | Float64Array | Uint32Array | BigUint64Array | Int8Array | Int16Array | Uint8Array | Int8Array, dims?: readonly number[]) => unknown;
};

// Sharp shape we rely on for tensor conversion. Avoids pulling the full sharp types.
type SharpLike = {
  (input: string | Buffer): {
    raw: (opts: { ensureAlpha?: boolean }) => {
      toBuffer: (opts: { resolveWithObject?: boolean }) => Promise<{ data: Buffer; info: { width: number; height: number; channels: number } }>;
    };
    resize: (w: number, h: number, opts?: { fit?: "contain" | "cover" | "fill" | "inside" | "outside" }) => unknown;
  };
};

export class PaddleOcrService {
  private readonly modelDir: string;
  private readonly ort: OrtLike | null = null;
  private readonly sharp: SharpLike | null = null;
  private readonly fs: typeof import("fs");
  private readonly pathLib: typeof import("path");

  // Lazily-initialized ONNX sessions.
  private detSession: OrtSession | null = null;
  private recSession: OrtSession | null = null;
  private clsSession: OrtSession | null = null;
  private dictionary: string[] = [];

  // Lifecycle tracking.
  private initPromise: Promise<void> | null = null;
  private isInitialized = false;
  private idleTimer: NodeJS.Timeout | null = null;

  // Detection hyperparameters (overridable via constructor options).
  // Defaults are PaddleOCR official values from `tools/infer/utility.py`.
  private readonly detConfig: PaddleDetConfig;

  private static readonly IDLE_TIMEOUT_MS = 180_000; // 3 minutes, matches vision-service convention
  private static readonly REC_IMG_HEIGHT = 48;
  private static readonly REC_MAX_WIDTH = 320;
  private static readonly CLS_IMG_HEIGHT = 48;
  private static readonly CLS_IMG_WIDTH = 192;
  /** Aspect ratio (long side / short side) above which a box is rejected. */
  private static readonly DET_ASPECT_RATIO_THRESH = 100;

  constructor(
    modelDir: string,
    deps?: {
      fs?: typeof import("fs");
      path?: typeof import("path");
      ort?: OrtLike;
      sharp?: SharpLike;
      /** Override detection hyperparameters. Falls back to PaddleOCR defaults. */
      detConfig?: Partial<PaddleDetConfig>;
    }
  ) {
    this.modelDir = modelDir;
    this.fs = deps?.fs ?? require("fs");
    this.pathLib = deps?.path ?? require("path");
    this.ort = deps?.ort ?? null;
    this.sharp = deps?.sharp ?? null;
    this.detConfig = { ...PADDLE_DET_DEFAULTS, ...(deps?.detConfig ?? {}) };
  }

  /**
   * Check whether all required PaddleOCR model files exist on disk.
   * Returns a list of missing file paths (relative to the model dir) — empty if all present.
   *
   * The cls (orientation classification) model is OPTIONAL — PaddlePaddle has not
   * published a PP-OCRv5 mobile cls ONNX export as of this writing, so we accept
   * its absence. When missing, runPipeline() simply skips the cls branch.
   */
  public checkModelFiles(): { present: boolean; missing: string[]; missingOptional: string[]; modelDir: string } {
    const required = [
      this.pathLib.join(PADDLE_MODEL_SUBDIRS.det, PADDLE_MODEL_FILES.det),
      this.pathLib.join(PADDLE_MODEL_SUBDIRS.rec, PADDLE_MODEL_FILES.rec),
      this.pathLib.join(PADDLE_MODEL_SUBDIRS.dict, PADDLE_MODEL_FILES.dict),
    ];
    const optional = [
      this.pathLib.join(PADDLE_MODEL_SUBDIRS.cls, PADDLE_MODEL_FILES.cls),
    ];
    const missing = required.filter((rel) => !this.fs.existsSync(this.pathLib.join(this.modelDir, rel)));
    const missingOptional = optional.filter((rel) => !this.fs.existsSync(this.pathLib.join(this.modelDir, rel)));
    return { present: missing.length === 0, missing, missingOptional, modelDir: this.modelDir };
  }

  /**
   * Lazily load the 3 ONNX sessions and the character dictionary.
   * Idempotent: a second call returns the same in-flight or completed promise.
   */
  public async init(onStatus?: (msg: string) => void): Promise<void> {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const check = this.checkModelFiles();
      if (!check.present) {
        throw new Error(
          `PaddleOCR 模型文件缺失 (${check.missing.length} 个): ${check.missing.join(", ")}. ` +
          `请在插件目录下创建 ${check.modelDir} 并下载 PP-OCRv5 mobile ONNX 模型。`
        );
      }

      const ort = this.resolveOrt();
      const sharp = this.resolveSharp();

      if (onStatus) onStatus("正在加载 PaddleOCR 文本检测模型...");
      this.detSession = await ort.InferenceSession.create(
        this.pathLib.join(this.modelDir, PADDLE_MODEL_SUBDIRS.det, PADDLE_MODEL_FILES.det),
        { executionProviders: ["cpu"] }
      );

      // cls is optional — PaddlePaddle has not released a PP-OCRv5 mobile cls ONNX
      // export, so we tolerate its absence and skip orientation classification.
      if (check.missingOptional.length === 0) {
        if (onStatus) onStatus("正在加载 PaddleOCR 方向分类模型...");
        try {
          this.clsSession = await ort.InferenceSession.create(
            this.pathLib.join(this.modelDir, PADDLE_MODEL_SUBDIRS.cls, PADDLE_MODEL_FILES.cls),
            { executionProviders: ["cpu"] }
          );
        } catch (e) {
          console.warn("[lti-paddle-ocr] cls 模型加载失败，跳过方向分类:", e);
          this.clsSession = null;
        }
      } else {
        if (onStatus) onStatus("(可选) 方向分类模型缺失，跳过 0°/180° 判定");
      }

      if (onStatus) onStatus("正在加载 PaddleOCR 文本识别模型...");
      this.recSession = await ort.InferenceSession.create(
        this.pathLib.join(this.modelDir, PADDLE_MODEL_SUBDIRS.rec, PADDLE_MODEL_FILES.rec),
        { executionProviders: ["cpu"] }
      );

      if (onStatus) onStatus("正在加载字符字典...");
      const dictRaw = await this.fs.promises.readFile(
        this.pathLib.join(this.modelDir, PADDLE_MODEL_SUBDIRS.dict, PADDLE_MODEL_FILES.dict),
        "utf-8"
      );
      this.dictionary = dictRaw.split(/\r?\n/).filter((line) => line.length > 0);

      this.isInitialized = true;
    })();

    return this.initPromise;
  }

  /**
   * Run OCR on a local image path. Returns concatenated text from all detected regions.
   * Throws if init or inference fails — caller is expected to fall back to Tesseract.
   */
  public async runOcr(imagePath: string, onStatus?: (msg: string) => void): Promise<string> {
    this.resetIdleTimer();
    await this.init();

    if (!this.detSession || !this.recSession || this.dictionary.length === 0) {
      throw new Error("PaddleOCR 引擎未就绪 (sessions not loaded)");
    }

    if (onStatus) onStatus("正在使用 PaddleOCR 识别图像...");

    const sharp = this.resolveSharp();
    const image = sharp(imagePath);
    const { data, info } = await image.raw({ ensureAlpha: false }).toBuffer({ resolveWithObject: true });
    const regions = await this.runPipeline(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), info.width, info.height, info.channels, onStatus);

    this.resetIdleTimer();
    return regions.map((r) => r.text).join("\n");
  }

  /**
   * Release all ONNX sessions and clear cached dictionary. Idempotent.
   */
  public async dispose(): Promise<void> {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    await Promise.allSettled([
      this.detSession?.release(),
      this.clsSession?.release(),
      this.recSession?.release(),
    ]);
    this.detSession = null;
    this.clsSession = null;
    this.recSession = null;
    this.dictionary = [];
    this.isInitialized = false;
    this.initPromise = null;
  }

  /** Plugin unload hook — call dispose(). */
  public destroy(): void {
    void this.dispose();
  }

  /** True if the model dir + files are present and the service can theoretically be initialized. */
  public get isReady(): boolean {
    return this.checkModelFiles().present;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /**
   * Run the full det → cls → rec pipeline on a decoded image.
   * Image is provided as raw RGB pixels (or RGBA; alpha is dropped).
   */
  private async runPipeline(
    raw: Uint8Array,
    width: number,
    height: number,
    channels: number,
    onStatus?: (msg: string) => void
  ): Promise<PaddleOcrRegion[]> {
    // 1. Detection: run on a downscaled image, then map boxes back to original coords.
    const detBoxes = await this.runDet(raw, width, height, channels);
    if (process.env.LTI_PADDLE_DIAG && detBoxes.length > 0) {
      const sample = detBoxes.slice(0, 3);
      console.log(`[runPipeline] detBoxes=${detBoxes.length} sample[0]=${JSON.stringify(sample[0])} sample[1]=${JSON.stringify(sample[1])}`);
      console.log(`[runPipeline] raw.length=${raw.length} W=${width} H=${height} C=${channels}`);
    }
    if (detBoxes.length === 0) return [];

    // 2. For each detected box, crop + warp_affine → 48×192 (cls) and 48×W (rec)
    const regions: PaddleOcrRegion[] = [];
    for (let i = 0; i < detBoxes.length; i++) {
      if (onStatus) onStatus(`PaddleOCR 识别中 (${i + 1}/${detBoxes.length})...`);
      const box = detBoxes[i];
      const { data: cropped, width: cropW } = this.warpCrop(raw, width, height, channels, box);

      // 3. Classification: 0° or 180° — only if cls model loaded
      const angle: 0 | 180 = this.clsSession ? await this.runCls(cropped) : 0;

      // 4. Recognition: CTC decode via dictionary
      const cropForRec = angle === 180 ? this.flipHorizontal(cropped, cropW) : cropped;
      const text = await this.runRec(cropForRec, cropW);
      if (text.length > 0) {
        regions.push({ text, confidence: 1.0, quad: box });
      }
    }
    return regions;
  }

  private async runDet(raw: Uint8Array, width: number, height: number, channels: number): Promise<Array<[number, number, number, number, number, number, number, number]>> {
    if (!this.detSession) return [];
    const ort = this.resolveOrt();
    // Resize so the longest side is limitSideLen (PaddleOCR default: 960).
    const targetLong = this.detConfig.limitSideLen;
    const scale = Math.min(1, targetLong / Math.max(width, height));
    const rw = Math.max(32, Math.round(width * scale / 32) * 32);
    const rh = Math.max(32, Math.round(height * scale / 32) * 32);

    const input = new Float32Array(1 * 3 * rh * rw);
    this.hwcToNchw(raw, width, height, channels, rw, rh, input, PADDLE_DET_CLS_PREPROCESS);

    const inputName = this.detSession.inputNames[0];
    const outputName = this.detSession.outputNames[0];
    if (!inputName || !outputName) return [];
    const inputTensor = new ort.Tensor("float32", input, [1, 3, rh, rw]);
    const out = await this.detSession.run({ [inputName]: inputTensor });
    const map = out[outputName] as { data: Float32Array; dims: number[] } | undefined;
    if (!map) return [];
    return this.dbPostprocess(map.data, map.dims, width, height, scale);
  }

  private async runCls(crop: Float32Array): Promise<0 | 180> {
    if (!this.clsSession) return 0;
    const ort = this.resolveOrt();
    const inputName = this.clsSession.inputNames[0];
    const outputName = this.clsSession.outputNames[0];
    if (!inputName || !outputName) return 0;
    const inputTensor = new ort.Tensor("float32", crop, [1, 3, PaddleOcrService.CLS_IMG_HEIGHT, PaddleOcrService.CLS_IMG_WIDTH]);
    const out = await this.clsSession.run({ [inputName]: inputTensor });
    const logits = (out[outputName] as { data: Float32Array; dims: number[] } | undefined)?.data;
    if (!logits || logits.length < 2) return 0;
    return logits[1] > logits[0] ? 180 : 0;
  }

  private async runRec(crop: Float32Array, actualWidth: number): Promise<string> {
    if (!this.recSession) return "";
    const ort = this.resolveOrt();
    const inputName = this.recSession.inputNames[0];
    const outputName = this.recSession.outputNames[0];
    if (!inputName || !outputName) return "";
    const inputTensor = new ort.Tensor("float32", crop, [1, 3, PaddleOcrService.REC_IMG_HEIGHT, actualWidth]);
    const out = await this.recSession.run({ [inputName]: inputTensor });
    const raw = out[outputName] as { data: Float32Array; dims: number[] } | undefined;
    if (!raw || raw.data.length === 0) return "";
    const N = raw.dims.length === 3 ? raw.dims[2] : this.dictionary.length;
    if (process.env.LTI_PADDLE_DIAG) {
      // Print argmax sequence for the first call only to diagnose
      const T = raw.data.length / N;
      const seq: number[] = [];
      for (let t = 0; t < Math.min(T, 20); t++) {
        let best = 0, bestV = -Infinity;
        for (let i = 0; i < N; i++) {
          const v = raw.data[t * N + i];
          if (v > bestV) { bestV = v; best = i; }
        }
        seq.push(best);
      }
      const dict = this.dictionary;
      console.log(`[runRec] N=${N} T=${T} argmax(seq)=${JSON.stringify(seq)}`);
      console.log(`[runRec] decoded chars=${seq.filter(b => b > 0 && b < dict.length).map(b => dict[b]).join("")}`);
    }
    return this.ctcDecode(raw.data, this.dictionary, N);
  }

  // ---------------------------------------------------------------------------
  // Image utilities (sharp-based)
  // ---------------------------------------------------------------------------

  private hwcToNchw(
    src: Uint8Array,
    sw: number,
    sh: number,
    schannels: number,
    dw: number,
    dh: number,
    out: Float32Array,
    pre: { mean: [number, number, number]; std: [number, number, number] }
  ): void {
    // Nearest-neighbor resize from (sw, sh) to (dw, dh); then NCHW with mean/std.
    const stride = dw * dh;
    for (let y = 0; y < dh; y++) {
      const sy = Math.min(sh - 1, Math.round((y * sh) / dh));
      for (let x = 0; x < dw; x++) {
        const sx = Math.min(sw - 1, Math.round((x * sw) / dw));
        const si = (sy * sw + sx) * schannels;
        const di = y * dw + x;
        for (let c = 0; c < 3; c++) {
          const v = schannels >= 3 ? src[si + c] : src[si];
          out[c * stride + di] = (v / 255 - pre.mean[c]) / pre.std[c];
        }
      }
    }
  }

  /**
   * Warp the 4-point text region into a 48×W strip.
   *
   * The polygon may be axis-aligned (TL/TR/BR/BL corners of a rectangle) or a
   * real rotated quad. For axis-aligned inputs the algorithm reduces to the
   * previous behavior (start at TL, sample by widthPx/heightPx). For rotated
   * inputs we compute the axis-aligned bounding box and sample that — this is
   * a deliberate "best-effort" choice; full perspective warp (homography) is
   * out of scope for this round and lives in Plan B.
   *
   * Returns the warp data + its actual width (NOT the max) — rec model has
   * dynamic width dim so we pass the real value rather than padding.
   */
  private warpCrop(
    src: Uint8Array,
    sw: number,
    sh: number,
    schannels: number,
    quad: [number, number, number, number, number, number, number, number]
  ): { data: Float32Array; width: number } {
    // Compute the polygon's axis-aligned bounding box so rotated input doesn't
    // confuse the sampler. (The "fake affine" path used quad[0] as the start
    // and the two edge lengths, which only works for axis-aligned quads.)
    const xs = [quad[0], quad[2], quad[4], quad[6]];
    const ys = [quad[1], quad[3], quad[5], quad[7]];
    const minX = Math.max(0, Math.min(...xs));
    const minY = Math.max(0, Math.min(...ys));
    const maxX = Math.min(sw - 1, Math.max(...xs));
    const maxY = Math.min(sh - 1, Math.max(...ys));
    const widthPx = maxX - minX + 1;
    const heightPx = maxY - minY + 1;
    if (widthPx < 4 || heightPx < 4) {
      return { data: new Float32Array(3 * PaddleOcrService.REC_IMG_HEIGHT * 48), width: 48 };
    }

    const outW = Math.min(PaddleOcrService.REC_MAX_WIDTH, Math.max(48, Math.round((widthPx / heightPx) * PaddleOcrService.REC_IMG_HEIGHT)));
    const out = new Float32Array(3 * PaddleOcrService.REC_IMG_HEIGHT * outW);
    const stride = PaddleOcrService.REC_IMG_HEIGHT * outW;
    for (let y = 0; y < PaddleOcrService.REC_IMG_HEIGHT; y++) {
      const sy = Math.min(sh - 1, Math.round((y / PaddleOcrService.REC_IMG_HEIGHT) * heightPx + minY));
      for (let x = 0; x < outW; x++) {
        const sx = Math.min(sw - 1, Math.round((x / outW) * widthPx + minX));
        const si = (sy * sw + sx) * schannels;
        const di = y * outW + x;
        for (let c = 0; c < 3; c++) {
          const v = schannels >= 3 ? src[si + c] : src[si];
          out[c * stride + di] = (v / 255 - PADDLE_REC_PREPROCESS.mean[c]) / PADDLE_REC_PREPROCESS.std[c];
        }
      }
    }
    return { data: out, width: outW };
  }

  /** Mirror the crop horizontally — used when the cls model returns 180°. */
  private flipHorizontal(crop: Float32Array, actualWidth: number): Float32Array {
    // 3-channel NCHW (C, H, W)
    const channels = 3;
    const height = PaddleOcrService.REC_IMG_HEIGHT;
    const out = new Float32Array(crop.length);
    const planeSize = height * actualWidth;
    for (let c = 0; c < channels; c++) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < actualWidth; x++) {
          out[c * planeSize + y * actualWidth + (actualWidth - 1 - x)] = crop[c * planeSize + y * actualWidth + x];
        }
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // DBNet postprocessing — PaddleOCR-standard pipeline.
  //
  // Steps:
  //   1. Binarize at dbThresh (default 0.3)
  //   2. Optional 3x3 dilation (useDilation)
  //   3. Marching-squares contour extraction (lighter than findContours)
  //   4. Per-contour minAreaRect → 4-point polygon
  //   5. Probability mean filter (dbBoxThresh, default 0.6)
  //   6. min_size filter on short side (default 3 px)
  //   7. Aspect ratio filter (long/short <= 100)
  //   8. Unclip via polygon offset (PaddleOCR formula)
  //   9. Greedy NMS with polygon IoU (threshold 0.3)
  //  10. Map boxes back to original image coordinates
  //
  // Returns polygons (8 numbers: TL, TR, BR, BL).
  // ---------------------------------------------------------------------------

  private dbPostprocess(
    pred: Float32Array,
    dims: number[],
    origW: number,
    origH: number,
    scale: number
  ): Array<[number, number, number, number, number, number, number, number]> {
    if (dims.length < 4) return [];
    const h = dims[2] ?? 0;
    const w = dims[3] ?? 0;
    if (h === 0 || w === 0) return [];

    const cfg = this.detConfig;

    // 1. Binarize
    const bitmap = new Uint8Array(h * w);
    for (let i = 0; i < pred.length; i++) {
      bitmap[i] = pred[i] > cfg.dbThresh ? 1 : 0;
    }

    // 2. Optional 3x3 dilation
    if (cfg.useDilation) {
      this.dilate3x3InPlace(bitmap, w, h);
    }

    // 3. Marching-squares contour extraction
    const contours = this.marchingSquares(bitmap, w, h);

    // 4-8. Per-contour pipeline: minAreaRect → score filter → size filter →
    //      aspect filter → unclip
    const polygons: Array<[number, number, number, number, number, number, number, number]> = [];
    const scores: number[] = [];
    let stats = { contours: contours.length, droppedContour: 0, droppedScore: 0, droppedSize: 0, droppedAspect: 0, droppedUnclip: 0, droppedFinal: 0 };
    for (const contour of contours) {
      if (contour.length < 4) { stats.droppedContour++; continue; }

      // minAreaRect (rotating calipers simplification): find centroid then
      // sweep angle to find min bounding box. For small DBNet contours
      // (~10-200 points) this is fast enough.
      const rect = this.minAreaRect(contour);
      if (!rect) { stats.droppedContour++; continue; }

      // Score: mean probability inside the rotated rect. Fast mode =
      // AABB of polygon (the minAreaRect's axis-aligned bounding box).
      const aabb = this.polygonToAabb(rect);
      const score = this.scorePolygonAabb(pred, w, h, aabb);
      if (score < cfg.dbBoxThresh) { stats.droppedScore++; continue; }

      // Size filter
      if (aabb[2] - aabb[0] < cfg.minSize || aabb[3] - aabb[1] < cfg.minSize) { stats.droppedSize++; continue; }

      // Aspect ratio filter
      const wSide = aabb[2] - aabb[0] + 1;
      const hSide = aabb[3] - aabb[1] + 1;
      const longSide = Math.max(wSide, hSide);
      const shortSide = Math.min(wSide, hSide);
      if (longSide / shortSide > PaddleOcrService.DET_ASPECT_RATIO_THRESH) { stats.droppedAspect++; continue; }

      // Hard cap before doing the more expensive unclip + re-fit
      if (polygons.length >= cfg.maxCandidates) break;

      // Unclip (PaddleOCR formula: distance = area * unclip_ratio / perimeter)
      const unclipDist = this.polygonOffsetDistance(rect, cfg.unclipRatio);
      const unclipped = this.offsetPolygon(rect, unclipDist);
      if (unclipped.length < 4) { stats.droppedUnclip++; continue; }

      // Re-fit a clean 4-point minAreaRect after unclip (unclip can
      // introduce skew if the offset is non-uniform). The unclip returned
      // a flat 8-number array; convert back to a [x, y] array for minAreaRect.
      const unclippedPoints: Array<[number, number]> = [
        [unclipped[0], unclipped[1]], [unclipped[2], unclipped[3]],
        [unclipped[4], unclipped[5]], [unclipped[6], unclipped[7]],
      ];
      const finalRect = this.minAreaRect(unclippedPoints);
      if (!finalRect) { stats.droppedUnclip++; continue; }
      const finalAabb = this.polygonToAabb(finalRect);
      if (finalAabb[2] - finalAabb[0] < cfg.minSize || finalAabb[3] - finalAabb[1] < cfg.minSize) { stats.droppedFinal++; continue; }

      polygons.push(finalRect);
      scores.push(score);
    }

    if (process.env.LTI_PADDLE_DIAG) {
      console.log(`[dbPostprocess] ${JSON.stringify(stats)} kept=${polygons.length}`);
    }

    if (polygons.length === 0) return [];

    // 9. Greedy NMS with polygon IoU
    const kept = this.greedyNMS(polygons, scores, cfg.nmsIouThresh);

    if (process.env.LTI_PADDLE_DIAG) {
      console.log(`[dbPostprocess] kept=after_nms=${kept.length}`);
    }

    // 10. Map kept polygons back to original image coordinates
    return kept.map((poly) => {
      // poly is [TL.x, TL.y, TR.x, TR.y, BR.x, BR.y, BL.x, BL.y]
      const [x1, y1, x2, y2, x3, y3, x4, y4] = poly;
      return [
        x1 / scale, y1 / scale,
        x2 / scale, y2 / scale,
        x3 / scale, y3 / scale,
        x4 / scale, y4 / scale,
      ] as [number, number, number, number, number, number, number, number];
    });
  }

  // ---------------------------------------------------------------------------
  // DBNet postprocessing helpers
  // ---------------------------------------------------------------------------

  /**
   * In-place 3x3 dilation of a 0/1 bitmap. Useful when the DBNet binarized
   * map has gaps between text pixels that fragment a single line into many
   * tiny contours. Mirrors PaddleOCR's `cv2.dilate(seg, ones((3,3)))`.
   */
  private dilate3x3InPlace(bitmap: Uint8Array, w: number, h: number): void {
    const src = bitmap.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let on = 0;
        for (let dy = -1; dy <= 1 && on === 0; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
            if (src[ny * w + nx]) { on = 1; break; }
          }
        }
        bitmap[y * w + x] = on;
      }
    }
  }

  /**
   * Marching-squares contour extraction.
   * Returns an array of contours; each contour is an array of [x, y] points
   * in order. Includes only the 1-pixels (text) and traces the outer boundary.
   *
   * This is a simplified replacement for OpenCV's findContours. We trace the
   * boundary of each connected region using 4-connectivity. It's not as
   * precise as Suzuki's algorithm but is sufficient for the well-smoothed
   * probability maps that DBNet produces (where boundaries are simple).
   */
  private marchingSquares(bitmap: Uint8Array, w: number, h: number): Array<Array<[number, number]>> {
    const visited = new Uint8Array(w * h);
    const contours: Array<Array<[number, number]>> = [];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (bitmap[idx] === 0 || visited[idx]) continue;

        // BFS to gather all connected pixels; track min/max for AABB.
        const queue: number[] = [idx];
        visited[idx] = 1;
        let minX = x, minY = y, maxX = x, maxY = y;
        let head = 0;
        while (head < queue.length) {
          const cur = queue[head++];
          const cy = (cur / w) | 0;
          const cx = cur - cy * w;
          if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
          // 4-connectivity neighbors
          if (cy > 0) { const n = cur - w; if (bitmap[n] && !visited[n]) { visited[n] = 1; queue.push(n); } }
          if (cy < h - 1) { const n = cur + w; if (bitmap[n] && !visited[n]) { visited[n] = 1; queue.push(n); } }
          if (cx > 0) { const n = cur - 1; if (bitmap[n] && !visited[n]) { visited[n] = 1; queue.push(n); } }
          if (cx < w - 1) { const n = cur + 1; if (bitmap[n] && !visited[n]) { visited[n] = 1; queue.push(n); } }
        }

        // Walk the perimeter of the AABB in 8 directions, keeping only the
        // outermost 1-pixels. This is an approximation of the contour but
        // for DBNet's smoothed probability maps it's adequate.
        const contour: Array<[number, number]> = [];
        // Top edge: leftmost to rightmost
        for (let x2 = minX; x2 <= maxX; x2++) {
          if (bitmap[minY * w + x2]) contour.push([x2, minY]);
        }
        // Right edge: top+1 to bottom (skip the corner already added)
        for (let y2 = minY + 1; y2 <= maxY; y2++) {
          if (bitmap[y2 * w + maxX]) contour.push([maxX, y2]);
        }
        // Bottom edge: right-1 to left (skip corner)
        for (let x2 = maxX - 1; x2 >= minX; x2--) {
          if (bitmap[maxY * w + x2]) contour.push([x2, maxY]);
        }
        // Left edge: bottom-1 to top+1 (skip both corners)
        for (let y2 = maxY - 1; y2 > minY; y2--) {
          if (bitmap[y2 * w + minX]) contour.push([minX, y2]);
        }
        if (contour.length >= 4) contours.push(contour);
      }
    }
    return contours;
  }

  /**
   * Compute the minimum-area bounding rectangle for a 2D point set.
   * Returns the 4 corners of the rectangle in [TL, TR, BR, BL] order, or
   * null if the point set is degenerate.
   *
   * Implementation: rotating calipers (full version). For DBNet contours
   * (~10-100 points) the standard O(n²) angle sweep is fast enough.
   */
  private minAreaRect(points: Array<[number, number]>): [number, number, number, number, number, number, number, number] | null {
    if (points.length < 3) return null;

    // Compute the convex hull (Andrew's monotone chain). This is needed
    // because minAreaRect is well-defined for convex polygons; passing the
    // raw contour (with concavities) can give a non-tight bounding rect.
    const hull = this.convexHull(points);
    if (hull.length < 3) return null;

    // Rotating calipers: for each edge of the hull, project all points
    // onto the perpendicular axis to find the bounding rect. Return the
    // rect with the smallest area.
    let bestArea = Infinity;
    let bestRect: [number, number, number, number, number, number, number, number] | null = null;

    for (let i = 0; i < hull.length; i++) {
      const [x1, y1] = hull[i];
      const [x2, y2] = hull[(i + 1) % hull.length];
      const edgeDx = x2 - x1;
      const edgeDy = y2 - y1;
      const edgeLen = Math.hypot(edgeDx, edgeDy);
      if (edgeLen < 1e-6) continue;
      // Unit vectors along and perpendicular to this edge
      const ux = edgeDx / edgeLen, uy = edgeDy / edgeLen;
      const px = -uy, py = ux; // perpendicular (90° CCW)

      // Project all hull points onto u and p
      let minU = Infinity, maxU = -Infinity, minP = Infinity, maxP = -Infinity;
      for (const [hx, hy] of hull) {
        const u = hx * ux + hy * uy;
        const p = hx * px + hy * py;
        if (u < minU) minU = u; if (u > maxU) maxU = u;
        if (p < minP) minP = p; if (p > maxP) maxP = p;
      }
      const area = (maxU - minU) * (maxP - minP);
      if (area < bestArea) {
        bestArea = area;
        // Compute the 4 corners in original coords
        // Corner 0 (TL in this rotated frame) = minU * u + minP * p
        const tlx = minU * ux + minP * px;
        const tly = minU * uy + minP * py;
        const trx = maxU * ux + minP * px;
        const tr_y = maxU * uy + minP * py;
        const brx = maxU * ux + maxP * px;
        const br_y = maxU * uy + maxP * py;
        const blx = minU * ux + maxP * px;
        const bl_y = minU * uy + maxP * py;
        bestRect = [tlx, tly, trx, tr_y, brx, br_y, blx, bl_y];
      }
    }
    return bestRect;
  }

  /**
   * Andrew's monotone-chain convex hull. O(n log n).
   */
  private convexHull(points: Array<[number, number]>): Array<[number, number]> {
    const sorted = points.slice().sort((a, b) => a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]);
    const n = sorted.length;
    if (n <= 1) return sorted.slice();

    const lower: Array<[number, number]> = [];
    for (const p of sorted) {
      while (lower.length >= 2) {
        const [ax, ay] = lower[lower.length - 2];
        const [bx, by] = lower[lower.length - 1];
        const cross = (bx - ax) * (p[1] - ay) - (by - ay) * (p[0] - ax);
        if (cross <= 0) lower.pop(); else break;
      }
      lower.push(p);
    }
    const upper: Array<[number, number]> = [];
    for (let i = n - 1; i >= 0; i--) {
      const p = sorted[i];
      while (upper.length >= 2) {
        const [ax, ay] = upper[upper.length - 2];
        const [bx, by] = upper[upper.length - 1];
        const cross = (bx - ax) * (p[1] - ay) - (by - ay) * (p[0] - ax);
        if (cross <= 0) upper.pop(); else break;
      }
      upper.push(p);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  /**
   * Polygon → axis-aligned bounding box.
   * Returns [minX, minY, maxX, maxY].
   */
  private polygonToAabb(quad: [number, number, number, number, number, number, number, number]): [number, number, number, number] {
    const xs = [quad[0], quad[2], quad[4], quad[6]];
    const ys = [quad[1], quad[3], quad[5], quad[7]];
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }

  /**
   * Mean probability of all pixels inside a polygon's axis-aligned bounding box.
   * This is the PaddleOCR "fast" score mode. "Slow" mode (not implemented
   * here) would integrate only over pixels inside the polygon proper.
   */
  private scorePolygonAabb(pred: Float32Array, w: number, h: number, aabb: [number, number, number, number]): number {
    const [x1, y1, x2, y2] = aabb;
    let sum = 0, count = 0;
    for (let y = y1; y <= y2; y++) {
      if (y < 0 || y >= h) continue;
      for (let x = x1; x <= x2; x++) {
        if (x < 0 || x >= w) continue;
        sum += pred[y * w + x];
        count++;
      }
    }
    return count > 0 ? sum / count : 0;
  }

  /**
   * PaddleOCR's unclip distance formula: `area * ratio / perimeter`.
   * Used by `offsetPolygon` to know how far to push each vertex outward.
   */
  private polygonOffsetDistance(quad: [number, number, number, number, number, number, number, number], unclipRatio: number): number {
    const area = this.polygonArea(quad);
    const perim = this.polygonPerimeter(quad);
    if (perim < 1e-6) return 0;
    return (area * unclipRatio) / perim;
  }

  /**
   * Shoelace formula for polygon area.
   */
  private polygonArea(quad: number[]): number {
    let area = 0;
    for (let i = 0; i < quad.length; i += 2) {
      const j = (i + 2) % quad.length;
      area += quad[i] * quad[j + 1] - quad[j] * quad[i + 1];
    }
    return Math.abs(area) / 2;
  }

  /**
   * Polygon perimeter (sum of edge lengths).
   */
  private polygonPerimeter(quad: number[]): number {
    let perim = 0;
    for (let i = 0; i < quad.length; i += 2) {
      const j = (i + 2) % quad.length;
      perim += Math.hypot(quad[j] - quad[i], quad[j + 1] - quad[i + 1]);
    }
    return perim;
  }

  /**
   * Offset a convex polygon outward by `distance` along each edge's outward
   * normal. Returns the new 4-point polygon in TL,TR,BR,BL order.
   *
   * This is PaddleOCR's vertex-shift unclip: for each edge, compute the
   * outward normal, then push each vertex along the sum of the two adjacent
   * edge normals (weighted by edge length). This is simpler than Vatti's
   * algorithm but works well for the small angles in OCR contours.
   */
  private offsetPolygon(quad: number[], distance: number): number[] {
    if (distance <= 0) return quad.slice();
    const n = 4;
    // For each edge (i, i+1), compute outward normal (assuming CCW order).
    // We don't know the winding; pick the normal that points away from the
    // polygon centroid.
    const cx = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
    const cy = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;

    // Compute outward normals for each edge
    const normals: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
      const ax = quad[i * 2], ay = quad[i * 2 + 1];
      const bx = quad[((i + 1) % n) * 2], by = quad[((i + 1) % n) * 2 + 1];
      const ex = bx - ax, ey = by - ay;
      const len = Math.hypot(ex, ey);
      if (len < 1e-6) {
        normals.push([0, 0]);
        continue;
      }
      // Perpendicular: (-ey, ex) is one direction; (ey, -ex) is the other.
      // Pick the one pointing away from centroid.
      const cand1: [number, number] = [-ey / len, ex / len];
      const cand2: [number, number] = [ey / len, -ex / len];
      const midx = (ax + bx) / 2, midy = (ay + by) / 2;
      const d1 = Math.hypot(midx + cand1[0] - cx, midy + cand1[1] - cy);
      const d2 = Math.hypot(midx + cand2[0] - cx, midy + cand2[1] - cy);
      normals.push(d1 > d2 ? cand1 : cand2);
    }

    // Each new vertex = old vertex + sum of two adjacent edge normals × distance
    const out: number[] = new Array(8);
    for (let i = 0; i < n; i++) {
      const [nx1, ny1] = normals[(i - 1 + n) % n];
      const [nx2, ny2] = normals[i];
      const wx = (nx1 + nx2) * 0.5;
      const wy = (ny1 + ny2) * 0.5;
      const norm = Math.hypot(wx, wy);
      const sx = norm > 1e-6 ? wx / norm : 0;
      const sy = norm > 1e-6 ? wy / norm : 0;
      out[i * 2] = quad[i * 2] + sx * distance;
      out[i * 2 + 1] = quad[i * 2 + 1] + sy * distance;
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Polygon IoU + NMS
  // ---------------------------------------------------------------------------

  /**
   * Compute IoU between two 4-point convex polygons.
   * Uses Sutherland-Hodgman polygon clipping to compute the intersection
   * area, then divides by the union.
   *
   * Returns a value in [0, 1]. Two identical quads → 1.0; disjoint → 0.0.
   */
  private polygonIoU(
    a: [number, number, number, number, number, number, number, number],
    b: [number, number, number, number, number, number, number, number]
  ): number {
    const interArea = this.polygonClipArea(a, b);
    if (interArea === 0) return 0;
    const areaA = this.polygonArea(a);
    const areaB = this.polygonArea(b);
    const union = areaA + areaB - interArea;
    if (union < 1e-6) return 0;
    return interArea / union;
  }

  /**
   * Area of the intersection of two 4-point polygons, computed via
   * Sutherland-Hodgman polygon clipping. Both polygons must be convex and
   * in CCW or CW order (we accept both here; orientation is irrelevant for
   * the area calculation).
   *
   * Returns 0 if the polygons are disjoint.
   */
  private polygonClipArea(
    a: [number, number, number, number, number, number, number, number],
    b: [number, number, number, number, number, number, number, number]
  ): number {
    // Convert quad arrays to point arrays
    const subj: Array<[number, number]> = [
      [a[0], a[1]], [a[2], a[3]], [a[4], a[5]], [a[6], a[7]]
    ];
    const clip: Array<[number, number]> = [
      [b[0], b[1]], [b[2], b[3]], [b[4], b[5]], [b[6], b[7]]
    ];
    return this.sutherlandHodgmanArea(subj, clip);
  }

  /**
   * Sutherland-Hodgman polygon clipping. Subject polygon is clipped against
   * the clip polygon. Both must be convex. The result is a new polygon
   * (also convex) representing the intersection.
   *
   * We compute the area of the resulting polygon via the shoelace formula.
   */
  private sutherlandHodgmanArea(
    subject: Array<[number, number]>,
    clip: Array<[number, number]>
  ): number {
    let output = subject;
    for (let i = 0; i < clip.length; i++) {
      if (output.length === 0) return 0;
      const input = output;
      output = [];
      const edgeStart = clip[i];
      const edgeEnd = clip[(i + 1) % clip.length];

      for (let j = 0; j < input.length; j++) {
        const current = input[j];
        const previous = input[(j - 1 + input.length) % input.length];
        const currentInside = this.isInsideEdge(current, edgeStart, edgeEnd);
        const previousInside = this.isInsideEdge(previous, edgeStart, edgeEnd);

        if (currentInside) {
          if (!previousInside) {
            // Entering: emit intersection
            output.push(this.lineIntersection(previous, current, edgeStart, edgeEnd));
          }
          output.push(current);
        } else if (previousInside) {
          // Leaving: emit intersection only
          output.push(this.lineIntersection(previous, current, edgeStart, edgeEnd));
        }
        // Else both outside: emit nothing
      }
    }
    return this.polygonAreaFromPoints(output);
  }

  /** Point-on-the-inside-side test for a directed edge (CCW convention). */
  private isInsideEdge(p: [number, number], a: [number, number], b: [number, number]): boolean {
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0;
  }

  /**
   * Intersection of the infinite lines through (a1, a2) and (b1, b2).
   * Returns a single point. Assumes the two lines are not parallel
   * (caller should only invoke this when an intersection is known to exist).
   */
  private lineIntersection(
    a1: [number, number], a2: [number, number],
    b1: [number, number], b2: [number, number]
  ): [number, number] {
    const ax = a2[0] - a1[0], ay = a2[1] - a1[1];
    const bx = b2[0] - b1[0], by = b2[1] - b1[1];
    const denom = ax * by - ay * bx;
    if (Math.abs(denom) < 1e-9) return a1; // parallel — shouldn't happen
    const t = ((b1[0] - a1[0]) * by - (b1[1] - a1[1]) * bx) / denom;
    return [a1[0] + t * ax, a1[1] + t * ay];
  }

  /** Shoelace area for an arbitrary point array. */
  private polygonAreaFromPoints(points: Array<[number, number]>): number {
    if (points.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      area += x1 * y2 - x2 * y1;
    }
    return Math.abs(area) / 2;
  }

  /**
   * Greedy non-maximum suppression over 4-point polygons.
   * Returns the subset of `polygons` that survive NMS at the given IoU
   * threshold. Boxes with higher scores are preferred.
   */
  private greedyNMS(
    polygons: Array<[number, number, number, number, number, number, number, number]>,
    scores: number[],
    iouThresh: number
  ): Array<[number, number, number, number, number, number, number, number]> {
    if (polygons.length === 0) return [];

    // Sort indices by score descending
    const order = polygons.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
    const keep: number[] = [];
    const suppressed = new Array(polygons.length).fill(false);

    for (const i of order) {
      if (suppressed[i]) continue;
      keep.push(i);
      for (const j of order) {
        if (j === i || suppressed[j]) continue;
        const iou = this.polygonIoU(polygons[i], polygons[j]);
        if (iou > iouThresh) suppressed[j] = true;
      }
    }
    return keep.map((i) => polygons[i]);
  }

  // ---------------------------------------------------------------------------
  // CTC decode for rec output
  // ---------------------------------------------------------------------------

  private ctcDecode(logits: Float32Array, dict: string[], modelOutputDim?: number): string {
    // PaddleOCR rec models output shape [1, T, N'] flattened. N' = dict.length + 1
    // (blank) typically, or dict.length + 2 (blank + unk) for some exports.
    // We trust the modelOutputDim from the actual output tensor — falling back
    // to dict.length-based inference if not provided.
    const N = modelOutputDim ?? dict.length;
    if (N === 0) return "";
    const total = logits.length;
    if (total % N !== 0) {
      // Fall back: try to reshape assuming a slightly different N.
      const candidates = [dict.length, dict.length + 1, dict.length + 2];
      for (const candidate of candidates) {
        if (total % candidate === 0) {
          return this.ctcDecodeReshape(logits, total / candidate, candidate, dict);
        }
      }
      return "";
    }
    const T = total / N;
    return this.ctcDecodeReshape(logits, T, N, dict);
  }

  private ctcDecodeReshape(logits: Float32Array, T: number, N: number, dict: string[]): string {
    let prev = -1;
    let out = "";
    for (let t = 0; t < T; t++) {
      // argmax over N (ignore blank at index 0 in PP-OCR convention; the rec models
      // place blank at index 0 of the dict-loaded labels).
      let best = 0;
      let bestVal = -Infinity;
      const base = t * N;
      for (let i = 0; i < N; i++) {
        const v = logits[base + i];
        if (v > bestVal) {
          bestVal = v;
          best = i;
        }
      }
      if (best !== prev && best > 0 && best < dict.length) {
        out += dict[best];
      }
      prev = best;
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Dependency resolution
  // ---------------------------------------------------------------------------

  private resolveOrt(): OrtLike {
    if (this.ort) return this.ort;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      return require("onnxruntime-node") as OrtLike;
    } catch (e) {
      throw new Error("PaddleOCR 依赖 onnxruntime-node 未安装，请运行 npm install onnxruntime-node");
    }
  }

  private resolveSharp(): SharpLike {
    if (this.sharp) return this.sharp;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      return require("sharp") as SharpLike;
    } catch (e) {
      throw new Error("PaddleOCR 依赖 sharp 未安装");
    }
  }

  // ---------------------------------------------------------------------------
  // Idle timer — auto-dispose to reclaim memory when idle.
  // ---------------------------------------------------------------------------

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      void this.dispose();
    }, PaddleOcrService.IDLE_TIMEOUT_MS);
  }
}
