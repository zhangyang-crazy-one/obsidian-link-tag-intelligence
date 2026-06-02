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
  PADDLE_MODEL_FILES,
  PADDLE_MODEL_SUBDIRS,
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

  private static readonly IDLE_TIMEOUT_MS = 180_000; // 3 minutes, matches vision-service convention
  private static readonly DET_DB_THRESH = 0.3;
  private static readonly DET_BOX_THRESH = 0.5;
  private static readonly DET_UNCLIP_RATIO = 1.6;
  private static readonly DET_MIN_SIZE = 3;
  private static readonly REC_IMG_HEIGHT = 48;
  private static readonly REC_MAX_WIDTH = 320;
  private static readonly CLS_IMG_HEIGHT = 48;
  private static readonly CLS_IMG_WIDTH = 192;

  constructor(modelDir: string, deps?: { fs?: typeof import("fs"); path?: typeof import("path"); ort?: OrtLike; sharp?: SharpLike }) {
    this.modelDir = modelDir;
    this.fs = deps?.fs ?? require("fs");
    this.pathLib = deps?.path ?? require("path");
    this.ort = deps?.ort ?? null;
    this.sharp = deps?.sharp ?? null;
  }

  /**
   * Check whether all required PaddleOCR model files exist on disk.
   * Returns a list of missing file paths (relative to the model dir) — empty if all present.
   */
  public checkModelFiles(): { present: boolean; missing: string[]; modelDir: string } {
    const required = [
      this.pathLib.join(PADDLE_MODEL_SUBDIRS.det, PADDLE_MODEL_FILES.det),
      this.pathLib.join(PADDLE_MODEL_SUBDIRS.rec, PADDLE_MODEL_FILES.rec),
      this.pathLib.join(PADDLE_MODEL_SUBDIRS.cls, PADDLE_MODEL_FILES.cls),
      this.pathLib.join(PADDLE_MODEL_SUBDIRS.dict, PADDLE_MODEL_FILES.dict),
    ];
    const missing = required.filter((rel) => !this.fs.existsSync(this.pathLib.join(this.modelDir, rel)));
    return { present: missing.length === 0, missing, modelDir: this.modelDir };
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

      if (onStatus) onStatus("正在加载 PaddleOCR 方向分类模型...");
      this.clsSession = await ort.InferenceSession.create(
        this.pathLib.join(this.modelDir, PADDLE_MODEL_SUBDIRS.cls, PADDLE_MODEL_FILES.cls),
        { executionProviders: ["cpu"] }
      );

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

    if (!this.detSession || !this.clsSession || !this.recSession || this.dictionary.length === 0) {
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
    if (detBoxes.length === 0) return [];

    // 2. For each detected box, crop + warp_affine → 48×192 (cls) and 48×320 (rec)
    const regions: PaddleOcrRegion[] = [];
    for (let i = 0; i < detBoxes.length; i++) {
      if (onStatus) onStatus(`PaddleOCR 识别中 (${i + 1}/${detBoxes.length})...`);
      const box = detBoxes[i];
      const cropped = this.warpCrop(raw, width, height, channels, box);

      // 3. Classification: 0° or 180° (only if cls is enabled — always loaded here)
      const angle = await this.runCls(cropped);

      // 4. Recognition: CTC decode via dictionary
      const text = await this.runRec(angle === 180 ? this.flipHorizontal(cropped) : cropped);
      if (text.length > 0) {
        regions.push({ text, confidence: 1.0, quad: box });
      }
    }
    return regions;
  }

  private async runDet(raw: Uint8Array, width: number, height: number, channels: number): Promise<Array<[number, number, number, number, number, number, number, number]>> {
    if (!this.detSession) return [];
    // Resize so the longest side is 960; PP-OCRv5 default.
    const targetLong = 960;
    const scale = Math.min(1, targetLong / Math.max(width, height));
    const rw = Math.max(32, Math.round(width * scale / 32) * 32);
    const rh = Math.max(32, Math.round(height * scale / 32) * 32);

    const input = new Float32Array(1 * 3 * rh * rw);
    this.hwcToNchw(raw, width, height, channels, rw, rh, input, PADDLE_DET_CLS_PREPROCESS);

    const inputName = this.detSession.inputNames[0];
    const outputName = this.detSession.outputNames[0];
    if (!inputName || !outputName) return [];
    const out = await this.detSession.run({ [inputName]: { data: input, dims: [1, 3, rh, rw] } });
    const map = out[outputName];
    if (!map) return [];
    return this.dbPostprocess(map.data, map.dims, width, height, scale);
  }

  private async runCls(crop: Float32Array): Promise<0 | 180> {
    if (!this.clsSession) return 0;
    const inputName = this.clsSession.inputNames[0];
    const outputName = this.clsSession.outputNames[0];
    if (!inputName || !outputName) return 0;
    const out = await this.clsSession.run({
      [inputName]: {
        data: crop,
        dims: [1, 3, PaddleOcrService.CLS_IMG_HEIGHT, PaddleOcrService.CLS_IMG_WIDTH],
      },
    });
    const logits = out[outputName]?.data;
    if (!logits || logits.length < 2) return 0;
    return logits[1] > logits[0] ? 180 : 0;
  }

  private async runRec(crop: Float32Array): Promise<string> {
    if (!this.recSession) return "";
    const inputName = this.recSession.inputNames[0];
    const outputName = this.recSession.outputNames[0];
    if (!inputName || !outputName) return "";
    const out = await this.recSession.run({
      [inputName]: {
        data: crop,
        dims: [1, 3, PaddleOcrService.REC_IMG_HEIGHT, PaddleOcrService.REC_MAX_WIDTH],
      },
    });
    const logits = out[outputName]?.data;
    if (!logits || logits.length === 0) return "";
    return this.ctcDecode(logits, this.dictionary);
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
   * Warp the 4-point text region into a 48×W strip using a simple affine approximation
   * (no real perspective — for a production-quality box we would need full perspective warp,
   * but for 3-tier OCR the simpler approach covers the vast majority of upright scanned text).
   */
  private warpCrop(
    src: Uint8Array,
    sw: number,
    sh: number,
    schannels: number,
    quad: [number, number, number, number, number, number, number, number]
  ): Float32Array {
    const widthPx = Math.hypot(quad[2] - quad[0], quad[3] - quad[1]);
    const heightPx = Math.hypot(quad[4] - quad[2], quad[5] - quad[3]);
    if (widthPx < 4 || heightPx < 4) return new Float32Array(3 * 48 * PaddleOcrService.REC_MAX_WIDTH);

    const outW = Math.min(PaddleOcrService.REC_MAX_WIDTH, Math.max(48, Math.round((widthPx / heightPx) * PaddleOcrService.REC_IMG_HEIGHT)));
    const out = new Float32Array(3 * PaddleOcrService.REC_IMG_HEIGHT * outW);
    const stride = PaddleOcrService.REC_IMG_HEIGHT * outW;
    for (let y = 0; y < PaddleOcrService.REC_IMG_HEIGHT; y++) {
      const sy = Math.min(sh - 1, Math.round((y / PaddleOcrService.REC_IMG_HEIGHT) * heightPx + quad[1]));
      for (let x = 0; x < outW; x++) {
        const sx = Math.min(sw - 1, Math.round((x / outW) * widthPx + quad[0]));
        const si = (sy * sw + sx) * schannels;
        const di = y * outW + x;
        for (let c = 0; c < 3; c++) {
          const v = schannels >= 3 ? src[si + c] : src[si];
          out[c * stride + di] = (v / 255 - PADDLE_REC_PREPROCESS.mean[c]) / PADDLE_REC_PREPROCESS.std[c];
        }
      }
    }
    return out;
  }

  /** Mirror the crop horizontally — used when the cls model returns 180°. */
  private flipHorizontal(crop: Float32Array): Float32Array {
    // 3-channel NCHW (C, H, W)
    const channels = 3;
    const height = PaddleOcrService.REC_IMG_HEIGHT;
    const width = crop.length / (channels * height);
    const out = new Float32Array(crop.length);
    const planeSize = height * width;
    for (let c = 0; c < channels; c++) {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          out[c * planeSize + y * width + (width - 1 - x)] = crop[c * planeSize + y * width + x];
        }
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // DBNet postprocessing — ported from RapidOCR db_postprocess.
  // Returns boxes in original image coordinates (already mapped back through the resize scale).
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

    // 1. Binary threshold
    const bitmap = new Uint8Array(h * w);
    for (let i = 0; i < pred.length; i++) {
      bitmap[i] = pred[i] > PaddleOcrService.DET_DB_THRESH ? 1 : 0;
    }

    // 2. Connected-component extraction via flood fill (4-connectivity)
    const visited = new Uint8Array(h * w);
    const boxes: Array<[number, number, number, number]> = [];
    const stack: number[] = [];
    for (let i = 0; i < bitmap.length; i++) {
      if (bitmap[i] === 0 || visited[i] === 1) continue;
      // BFS
      stack.length = 0;
      stack.push(i);
      let minX = w, minY = h, maxX = -1, maxY = -1, count = 0, sumScore = 0;
      while (stack.length > 0) {
        const idx = stack.pop()!;
        if (visited[idx] === 1) continue;
        visited[idx] = 1;
        const y = (idx / w) | 0;
        const x = idx - y * w;
        if (bitmap[idx] === 0) continue;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        count++;
        sumScore += pred[idx];
        if (y > 0) stack.push(idx - w);
        if (y < h - 1) stack.push(idx + w);
        if (x > 0) stack.push(idx - 1);
        if (x < w - 1) stack.push(idx + 1);
      }
      if (count < PaddleOcrService.DET_MIN_SIZE * PaddleOcrService.DET_MIN_SIZE) continue;
      const meanScore = sumScore / count;
      if (meanScore < PaddleOcrService.DET_BOX_THRESH) continue;

      // 3. Unclip: extend the box outward by `unclip_ratio * perimeter` on each side.
      const wBox = maxX - minX + 1;
      const hBox = maxY - minY + 1;
      const extend = PaddleOcrService.DET_UNCLIP_RATIO * (wBox + hBox) / 2;
      const ex1 = Math.max(0, minX - extend);
      const ey1 = Math.max(0, minY - extend);
      const ex2 = Math.min(w - 1, maxX + extend);
      const ey2 = Math.min(h - 1, maxY + extend);
      boxes.push([ex1, ey1, ex2, ey2]);
    }

    // 4. Map boxes back to original image coordinates.
    return boxes.map(([x1, y1, x2, y2]) => {
      const ox1 = x1 / scale;
      const oy1 = y1 / scale;
      const ox2 = x2 / scale;
      const oy2 = y2 / scale;
      return [ox1, oy1, ox2, oy1, ox2, oy2, ox1, oy2] as [number, number, number, number, number, number, number, number];
    });
  }

  // ---------------------------------------------------------------------------
  // CTC decode for rec output
  // ---------------------------------------------------------------------------

  private ctcDecode(logits: Float32Array, dict: string[]): string {
    // PaddleOCR rec models output shape [T, N+1] flattened; N = dict size, +1 is blank.
    // We don't have explicit dims here, so we infer N from dictionary length.
    const N = dict.length;
    if (N === 0) return "";
    const total = logits.length;
    if (total % N !== 0) {
      // Try to handle the [1, T, N+1] layout by reshaping if N+1 divides.
      const N1 = N + 1;
      if (total % N1 === 0) {
        return this.ctcDecodeReshape(logits, total / N1, N1, dict);
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
