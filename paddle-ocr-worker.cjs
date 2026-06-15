"use strict";

// src/paddle-ocr-worker.ts
var import_node_readline = require("node:readline");

// src/paddle-ocr-types.ts
var PADDLE_DET_CLS_PREPROCESS = {
  mean: [0.5, 0.5, 0.5],
  std: [0.5, 0.5, 0.5]
};
var PADDLE_REC_PREPROCESS = {
  mean: [0.5, 0.5, 0.5],
  std: [0.5, 0.5, 0.5]
};
var PADDLE_MODEL_SUBDIRS = {
  det: "det",
  rec: "rec",
  cls: "cls",
  dict: "dict"
};
var PLACEHOLDER = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
var PADDLE_TIER_SPECS = {
  mobile: {
    det: { repo: "PaddlePaddle/PP-OCRv5_mobile_det_onnx", filename: "inference.onnx", sha256: PLACEHOLDER, sizeBytes: 5063518 },
    rec: { repo: "PaddlePaddle/PP-OCRv5_mobile_rec_onnx", filename: "inference.onnx", sha256: PLACEHOLDER, sizeBytes: 17297408 },
    dict: { repo: "PaddlePaddle/PP-OCRv5_mobile_rec_onnx", filename: "inference.yml", sha256: PLACEHOLDER, sizeBytes: 148345, role: "rec" },
    dirName: "mobile",
    summary: "Mobile (fast, ~22 MB)"
  },
  server: {
    det: { repo: "PaddlePaddle/PP-OCRv5_server_det_onnx", filename: "inference.onnx", sha256: PLACEHOLDER, sizeBytes: 92408575 },
    rec: { repo: "PaddlePaddle/PP-OCRv5_server_rec_onnx", filename: "inference.onnx", sha256: PLACEHOLDER, sizeBytes: 88602496 },
    dict: { repo: "PaddlePaddle/PP-OCRv5_server_rec_onnx", filename: "inference.yml", sha256: PLACEHOLDER, sizeBytes: 512e3, role: "rec" },
    dirName: "server",
    summary: "Server (precise, ~181 MB, default)"
  },
  hybrid: {
    det: { repo: "PaddlePaddle/PP-OCRv5_mobile_det_onnx", filename: "inference.onnx", sha256: PLACEHOLDER, sizeBytes: 5063518 },
    rec: { repo: "PaddlePaddle/PP-OCRv5_server_rec_onnx", filename: "inference.onnx", sha256: PLACEHOLDER, sizeBytes: 88602496 },
    dict: { repo: "PaddlePaddle/PP-OCRv5_server_rec_onnx", filename: "inference.yml", sha256: PLACEHOLDER, sizeBytes: 512e3, role: "rec" },
    dirName: "hybrid",
    summary: "Hybrid (mobile det + server rec, ~94 MB)"
  }
};
var DEFAULT_PADDLE_TIER = "server";
function getPaddleTierModelDir(tier) {
  return `models/ocr/pp-ocrv5/${PADDLE_TIER_SPECS[tier].dirName}`;
}
var PADDLE_DEFAULT_MODEL_DIR = getPaddleTierModelDir(DEFAULT_PADDLE_TIER);
var PADDLE_DET_DEFAULTS = {
  dbThresh: 0.3,
  dbBoxThresh: 0.6,
  unclipRatio: 1.5,
  minSize: 3,
  nmsIouThresh: 0.3,
  maxCandidates: 1e3,
  limitSideLen: 960,
  scoreMode: "fast",
  // Mobile PP-OCRv5's official default per PaddleOCR's det_mv3_db.yml;
  // desktop / server inference usually runs with dilation off. This plugin
  // only ships the mobile bundle, so the mobile default is the right baseline.
  useDilation: true
};
var PADDLE_MODEL_FILES = {
  det: "inference.onnx",
  rec: "inference.onnx",
  cls: "inference.onnx",
  dict: "ppocr_keys_v5.txt"
};

// src/paddle-ocr-service.ts
var _PaddleOcrEngine = class _PaddleOcrEngine {
  constructor(modelDir, deps) {
    this.ort = null;
    this.sharp = null;
    // Lazily-initialized ONNX sessions.
    this.detSession = null;
    this.recSession = null;
    this.clsSession = null;
    this.dictionary = [];
    // Lifecycle tracking.
    this.initPromise = null;
    this.isInitialized = false;
    this.idleTimer = null;
    this.modelDir = modelDir;
    this.fs = deps?.fs ?? require("fs");
    this.pathLib = deps?.path ?? require("path");
    this.ort = deps?.ort ?? null;
    this.sharp = deps?.sharp ?? null;
    this.detConfig = { ...PADDLE_DET_DEFAULTS, ...deps?.detConfig ?? {} };
    this.sessionOptions = this.buildSessionOptions(deps?.cpuThreads);
    this.tier = deps?.tier ?? DEFAULT_PADDLE_TIER;
  }
  /**
   * Check whether all required PaddleOCR model files exist on disk.
   * Returns a list of missing file paths (relative to the model dir) — empty if all present.
   *
   * The cls (orientation classification) model is OPTIONAL — PaddlePaddle has not
   * published a PP-OCRv5 mobile cls ONNX export as of this writing, so we accept
   * its absence. When missing, runPipeline() simply skips the cls branch.
   *
   * Tier-aware: managed bundles embed the character dictionary inside
   * the rec model's `inference.yml`. The standalone `dict/ppocr_keys_v5.txt`
   * remains supported as a back-compat fallback, so either dictionary source
   * is sufficient.
   */
  checkModelFiles() {
    const required = [
      this.pathLib.join(PADDLE_MODEL_SUBDIRS.det, PADDLE_MODEL_FILES.det),
      this.pathLib.join(PADDLE_MODEL_SUBDIRS.rec, PADDLE_MODEL_FILES.rec)
    ];
    const ymlDictionary = this.pathLib.join(PADDLE_MODEL_SUBDIRS.rec, "inference.yml");
    const legacyDictionary = this.pathLib.join(PADDLE_MODEL_SUBDIRS.dict, PADDLE_MODEL_FILES.dict);
    const optional = [
      this.pathLib.join(PADDLE_MODEL_SUBDIRS.cls, PADDLE_MODEL_FILES.cls)
    ];
    const missing = required.filter((rel) => !this.fs.existsSync(this.pathLib.join(this.modelDir, rel)));
    const hasDictionary = this.tier === "mobile" ? this.fs.existsSync(this.pathLib.join(this.modelDir, legacyDictionary)) || this.fs.existsSync(this.pathLib.join(this.modelDir, ymlDictionary)) : this.fs.existsSync(this.pathLib.join(this.modelDir, ymlDictionary)) || this.fs.existsSync(this.pathLib.join(this.modelDir, legacyDictionary));
    if (!hasDictionary) {
      missing.push(ymlDictionary);
    }
    const missingOptional = optional.filter((rel) => !this.fs.existsSync(this.pathLib.join(this.modelDir, rel)));
    return { present: missing.length === 0, missing, missingOptional, modelDir: this.modelDir };
  }
  /**
   * Lazily load the 3 ONNX sessions and the character dictionary.
   * Idempotent: a second call returns the same in-flight or completed promise.
   */
  async init(onStatus) {
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      const check = this.checkModelFiles();
      if (!check.present) {
        throw new Error(
          `PaddleOCR \u6A21\u578B\u6587\u4EF6\u7F3A\u5931 (${check.missing.length} \u4E2A): ${check.missing.join(", ")}. \u8BF7\u5728\u63D2\u4EF6\u76EE\u5F55\u4E0B\u521B\u5EFA ${check.modelDir} \u5E76\u4E0B\u8F7D PP-OCRv5 mobile ONNX \u6A21\u578B\u3002`
        );
      }
      const ort2 = this.resolveOrt();
      this.resolveSharp();
      if (onStatus) onStatus("\u6B63\u5728\u52A0\u8F7D PaddleOCR \u6587\u672C\u68C0\u6D4B\u6A21\u578B...");
      this.detSession = await ort2.InferenceSession.create(
        this.pathLib.join(this.modelDir, PADDLE_MODEL_SUBDIRS.det, PADDLE_MODEL_FILES.det),
        this.sessionOptions
      );
      if (check.missingOptional.length === 0) {
        if (onStatus) onStatus("\u6B63\u5728\u52A0\u8F7D PaddleOCR \u65B9\u5411\u5206\u7C7B\u6A21\u578B...");
        try {
          this.clsSession = await ort2.InferenceSession.create(
            this.pathLib.join(this.modelDir, PADDLE_MODEL_SUBDIRS.cls, PADDLE_MODEL_FILES.cls),
            this.sessionOptions
          );
        } catch (e) {
          console.warn("[lti-paddle-ocr] cls \u6A21\u578B\u52A0\u8F7D\u5931\u8D25\uFF0C\u8DF3\u8FC7\u65B9\u5411\u5206\u7C7B:", e);
          this.clsSession = null;
        }
      } else {
        if (onStatus) onStatus("(\u53EF\u9009) \u65B9\u5411\u5206\u7C7B\u6A21\u578B\u7F3A\u5931\uFF0C\u8DF3\u8FC7 0\xB0/180\xB0 \u5224\u5B9A");
      }
      if (onStatus) onStatus("\u6B63\u5728\u52A0\u8F7D PaddleOCR \u6587\u672C\u8BC6\u522B\u6A21\u578B...");
      this.recSession = await ort2.InferenceSession.create(
        this.pathLib.join(this.modelDir, PADDLE_MODEL_SUBDIRS.rec, PADDLE_MODEL_FILES.rec),
        this.sessionOptions
      );
      if (onStatus) onStatus("\u6B63\u5728\u52A0\u8F7D\u5B57\u7B26\u5B57\u5178...");
      this.dictionary = await this.loadDictionary();
      if (this.dictionary.length === 0) {
        throw new Error(
          `PaddleOCR \u5B57\u5178\u52A0\u8F7D\u5931\u8D25\uFF1A\u672A\u5728 ${this.modelDir} \u627E\u5230\u5B57\u5178\u3002\u5E94\u5B58\u5728 rec/inference.yml\uFF08\u542B character_dict \u5B57\u6BB5\uFF09\uFF1B\u65E7\u7248 mobile \u76EE\u5F55\u4E5F\u53EF\u4F7F\u7528 dict/ppocr_keys_v5.txt\u3002`
        );
      }
      this.isInitialized = true;
    })();
    return this.initPromise;
  }
  /**
   * Run OCR on a local image path. Returns concatenated text from all detected regions.
   * Throws if init or inference fails — caller is expected to fall back to Tesseract.
   */
  async runOcr(imagePath, onStatus) {
    this.clearIdleTimer();
    try {
      await this.init();
      if (!this.detSession || !this.recSession || this.dictionary.length === 0) {
        throw new Error("PaddleOCR \u5F15\u64CE\u672A\u5C31\u7EEA (sessions not loaded)");
      }
      if (onStatus) onStatus("\u6B63\u5728\u4F7F\u7528 PaddleOCR \u8BC6\u522B\u56FE\u50CF...");
      const sharp2 = this.resolveSharp();
      const image = sharp2(imagePath);
      const { data, info } = await image.raw({ ensureAlpha: false }).toBuffer({ resolveWithObject: true });
      const regions = await this.runPipeline(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), info.width, info.height, info.channels, onStatus);
      return regions.map((r) => r.text).join("\n");
    } finally {
      this.resetIdleTimer();
    }
  }
  /**
   * Release all ONNX sessions and clear cached dictionary. Idempotent.
   */
  async dispose() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    await Promise.allSettled([
      this.detSession?.release(),
      this.clsSession?.release(),
      this.recSession?.release()
    ]);
    this.detSession = null;
    this.clsSession = null;
    this.recSession = null;
    this.dictionary = [];
    this.isInitialized = false;
    this.initPromise = null;
  }
  /** Plugin unload hook — call dispose(). */
  destroy() {
    void this.dispose();
  }
  /** True if the model dir + files are present and the service can theoretically be initialized. */
  get isReady() {
    return this.checkModelFiles().present;
  }
  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------
  buildSessionOptions(cpuThreads) {
    const threads = Number.isFinite(cpuThreads) && cpuThreads && cpuThreads > 0 ? Math.max(1, Math.min(32, Math.round(cpuThreads))) : Math.max(1, Math.min(8, Math.floor((require("os").cpus()?.length ?? 2) / 2)));
    return {
      executionProviders: ["cpu"],
      intraOpNumThreads: threads,
      interOpNumThreads: Math.max(1, Math.min(2, Math.floor(threads / 2))),
      executionMode: "parallel",
      graphOptimizationLevel: "all"
    };
  }
  /**
   * Run the full det → cls → rec pipeline on a decoded image.
   * Image is provided as raw RGB pixels (or RGBA; alpha is dropped).
   */
  async runPipeline(raw, width, height, channels, onStatus) {
    const detBoxes = await this.runDet(raw, width, height, channels);
    if (process.env.LTI_PADDLE_DIAG && detBoxes.length > 0) {
      const sample = detBoxes.slice(0, 3);
      console.log(`[runPipeline] detBoxes=${detBoxes.length} sample[0]=${JSON.stringify(sample[0])} sample[1]=${JSON.stringify(sample[1])}`);
      console.log(`[runPipeline] raw.length=${raw.length} W=${width} H=${height} C=${channels}`);
    }
    if (detBoxes.length === 0) return [];
    const regions = [];
    for (let i = 0; i < detBoxes.length; i++) {
      if (onStatus) onStatus(`PaddleOCR \u8BC6\u522B\u4E2D (${i + 1}/${detBoxes.length})...`);
      const box = detBoxes[i];
      const { data: cropped, width: cropW } = this.warpCrop(raw, width, height, channels, box);
      const angle = this.clsSession ? await this.runCls(cropped) : 0;
      const cropForRec = angle === 180 ? this.flipHorizontal(cropped, cropW) : cropped;
      const text = await this.runRec(cropForRec, cropW);
      if (text.length > 0) {
        regions.push({ text, confidence: 1, quad: box });
      }
    }
    return regions;
  }
  async runDet(raw, width, height, channels) {
    if (!this.detSession) return [];
    const ort2 = this.resolveOrt();
    const targetLong = this.detConfig.limitSideLen;
    const scale = Math.min(1, targetLong / Math.max(width, height));
    const rw = Math.max(32, Math.round(width * scale / 32) * 32);
    const rh = Math.max(32, Math.round(height * scale / 32) * 32);
    const input = new Float32Array(1 * 3 * rh * rw);
    this.hwcToNchw(raw, width, height, channels, rw, rh, input, PADDLE_DET_CLS_PREPROCESS);
    const inputName = this.detSession.inputNames[0];
    const outputName = this.detSession.outputNames[0];
    if (!inputName || !outputName) return [];
    const inputTensor = new ort2.Tensor("float32", input, [1, 3, rh, rw]);
    const out = await this.detSession.run({ [inputName]: inputTensor });
    const map = out[outputName];
    if (!map) return [];
    return this.dbPostprocess(map.data, map.dims, width, height, scale);
  }
  async runCls(crop) {
    if (!this.clsSession) return 0;
    const ort2 = this.resolveOrt();
    const inputName = this.clsSession.inputNames[0];
    const outputName = this.clsSession.outputNames[0];
    if (!inputName || !outputName) return 0;
    const inputTensor = new ort2.Tensor("float32", crop, [1, 3, _PaddleOcrEngine.CLS_IMG_HEIGHT, _PaddleOcrEngine.CLS_IMG_WIDTH]);
    const out = await this.clsSession.run({ [inputName]: inputTensor });
    const logits = out[outputName]?.data;
    if (!logits || logits.length < 2) return 0;
    return logits[1] > logits[0] ? 180 : 0;
  }
  async runRec(crop, actualWidth) {
    if (!this.recSession) return "";
    const ort2 = this.resolveOrt();
    const inputName = this.recSession.inputNames[0];
    const outputName = this.recSession.outputNames[0];
    if (!inputName || !outputName) return "";
    const inputTensor = new ort2.Tensor("float32", crop, [1, 3, _PaddleOcrEngine.REC_IMG_HEIGHT, actualWidth]);
    const out = await this.recSession.run({ [inputName]: inputTensor });
    const raw = out[outputName];
    if (!raw || raw.data.length === 0) return "";
    const N = raw.dims.length === 3 ? raw.dims[2] : this.dictionary.length;
    if (process.env.LTI_PADDLE_DIAG) {
      const T = raw.data.length / N;
      const seq = [];
      for (let t = 0; t < Math.min(T, 20); t++) {
        let best = 0, bestV = -Infinity;
        for (let i = 0; i < N; i++) {
          const v = raw.data[t * N + i];
          if (v > bestV) {
            bestV = v;
            best = i;
          }
        }
        seq.push(best);
      }
      const dict = this.dictionary;
      console.log(`[runRec] N=${N} T=${T} argmax(seq)=${JSON.stringify(seq)}`);
      console.log(`[runRec] decoded chars=${seq.filter((b) => b > 0 && b - 1 < dict.length).map((b) => dict[b - 1]).join("")}`);
    }
    return this.ctcDecode(raw.data, this.dictionary, N);
  }
  // ---------------------------------------------------------------------------
  // Image utilities (sharp-based)
  // ---------------------------------------------------------------------------
  hwcToNchw(src, sw, sh, schannels, dw, dh, out, pre) {
    const stride = dw * dh;
    for (let y = 0; y < dh; y++) {
      const sy = Math.min(sh - 1, Math.round(y * sh / dh));
      for (let x = 0; x < dw; x++) {
        const sx = Math.min(sw - 1, Math.round(x * sw / dw));
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
  warpCrop(src, sw, sh, schannels, quad) {
    const xs = [quad[0], quad[2], quad[4], quad[6]];
    const ys = [quad[1], quad[3], quad[5], quad[7]];
    const minX = Math.max(0, Math.min(...xs));
    const minY = Math.max(0, Math.min(...ys));
    const maxX = Math.min(sw - 1, Math.max(...xs));
    const maxY = Math.min(sh - 1, Math.max(...ys));
    const widthPx = maxX - minX + 1;
    const heightPx = maxY - minY + 1;
    if (widthPx < 4 || heightPx < 4) {
      return { data: new Float32Array(3 * _PaddleOcrEngine.REC_IMG_HEIGHT * 48), width: 48 };
    }
    const outW = Math.min(_PaddleOcrEngine.REC_MAX_WIDTH, Math.max(48, Math.round(widthPx / heightPx * _PaddleOcrEngine.REC_IMG_HEIGHT)));
    const out = new Float32Array(3 * _PaddleOcrEngine.REC_IMG_HEIGHT * outW);
    const stride = _PaddleOcrEngine.REC_IMG_HEIGHT * outW;
    for (let y = 0; y < _PaddleOcrEngine.REC_IMG_HEIGHT; y++) {
      const sy = Math.min(sh - 1, Math.round(y / _PaddleOcrEngine.REC_IMG_HEIGHT * heightPx + minY));
      for (let x = 0; x < outW; x++) {
        const sx = Math.min(sw - 1, Math.round(x / outW * widthPx + minX));
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
  flipHorizontal(crop, actualWidth) {
    const channels = 3;
    const height = _PaddleOcrEngine.REC_IMG_HEIGHT;
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
  dbPostprocess(pred, dims, _origW, _origH, scale) {
    if (dims.length < 4) return [];
    const h = dims[2] ?? 0;
    const w = dims[3] ?? 0;
    if (h === 0 || w === 0) return [];
    const cfg = this.detConfig;
    const bitmap = new Uint8Array(h * w);
    for (let i = 0; i < pred.length; i++) {
      bitmap[i] = pred[i] > cfg.dbThresh ? 1 : 0;
    }
    if (cfg.useDilation) {
      this.dilate3x3InPlace(bitmap, w, h);
    }
    const contours = this.marchingSquares(bitmap, w, h);
    const polygons = [];
    const scores = [];
    let stats = { contours: contours.length, droppedContour: 0, droppedScore: 0, droppedSize: 0, droppedAspect: 0, droppedUnclip: 0, droppedFinal: 0 };
    for (const contour of contours) {
      if (contour.length < 4) {
        stats.droppedContour++;
        continue;
      }
      const rect = this.minAreaRect(contour);
      if (!rect) {
        stats.droppedContour++;
        continue;
      }
      const aabb = this.polygonToAabb(rect);
      const score = this.scorePolygonAabb(pred, w, h, aabb);
      if (score < cfg.dbBoxThresh) {
        stats.droppedScore++;
        continue;
      }
      if (aabb[2] - aabb[0] < cfg.minSize || aabb[3] - aabb[1] < cfg.minSize) {
        stats.droppedSize++;
        continue;
      }
      const wSide = aabb[2] - aabb[0] + 1;
      const hSide = aabb[3] - aabb[1] + 1;
      const longSide = Math.max(wSide, hSide);
      const shortSide = Math.min(wSide, hSide);
      if (longSide / shortSide > _PaddleOcrEngine.DET_ASPECT_RATIO_THRESH) {
        stats.droppedAspect++;
        continue;
      }
      if (polygons.length >= cfg.maxCandidates) break;
      const unclipDist = this.polygonOffsetDistance(rect, cfg.unclipRatio);
      const unclipped = this.offsetPolygon(rect, unclipDist);
      if (unclipped.length < 4) {
        stats.droppedUnclip++;
        continue;
      }
      const unclippedPoints = [
        [unclipped[0], unclipped[1]],
        [unclipped[2], unclipped[3]],
        [unclipped[4], unclipped[5]],
        [unclipped[6], unclipped[7]]
      ];
      const finalRect = this.minAreaRect(unclippedPoints);
      if (!finalRect) {
        stats.droppedUnclip++;
        continue;
      }
      const finalAabb = this.polygonToAabb(finalRect);
      if (finalAabb[2] - finalAabb[0] < cfg.minSize || finalAabb[3] - finalAabb[1] < cfg.minSize) {
        stats.droppedFinal++;
        continue;
      }
      polygons.push(finalRect);
      scores.push(score);
    }
    if (process.env.LTI_PADDLE_DIAG) {
      console.log(`[dbPostprocess] ${JSON.stringify(stats)} kept=${polygons.length}`);
    }
    if (polygons.length === 0) return [];
    const kept = this.greedyNMS(polygons, scores, cfg.nmsIouThresh);
    if (process.env.LTI_PADDLE_DIAG) {
      console.log(`[dbPostprocess] kept=after_nms=${kept.length}`);
    }
    return kept.map((poly) => {
      const [x1, y1, x2, y2, x3, y3, x4, y4] = poly;
      return [
        x1 / scale,
        y1 / scale,
        x2 / scale,
        y2 / scale,
        x3 / scale,
        y3 / scale,
        x4 / scale,
        y4 / scale
      ];
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
  dilate3x3InPlace(bitmap, w, h) {
    const src = bitmap.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let on = 0;
        for (let dy = -1; dy <= 1 && on === 0; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy, nx = x + dx;
            if (ny < 0 || ny >= h || nx < 0 || nx >= w) continue;
            if (src[ny * w + nx]) {
              on = 1;
              break;
            }
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
  marchingSquares(bitmap, w, h) {
    const visited = new Uint8Array(w * h);
    const contours = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (bitmap[idx] === 0 || visited[idx]) continue;
        const queue = [idx];
        visited[idx] = 1;
        let minX = x, minY = y, maxX = x, maxY = y;
        let head = 0;
        while (head < queue.length) {
          const cur = queue[head++];
          const cy = cur / w | 0;
          const cx = cur - cy * w;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;
          if (cy > 0) {
            const n = cur - w;
            if (bitmap[n] && !visited[n]) {
              visited[n] = 1;
              queue.push(n);
            }
          }
          if (cy < h - 1) {
            const n = cur + w;
            if (bitmap[n] && !visited[n]) {
              visited[n] = 1;
              queue.push(n);
            }
          }
          if (cx > 0) {
            const n = cur - 1;
            if (bitmap[n] && !visited[n]) {
              visited[n] = 1;
              queue.push(n);
            }
          }
          if (cx < w - 1) {
            const n = cur + 1;
            if (bitmap[n] && !visited[n]) {
              visited[n] = 1;
              queue.push(n);
            }
          }
        }
        const contour = [];
        for (let x2 = minX; x2 <= maxX; x2++) {
          if (bitmap[minY * w + x2]) contour.push([x2, minY]);
        }
        for (let y2 = minY + 1; y2 <= maxY; y2++) {
          if (bitmap[y2 * w + maxX]) contour.push([maxX, y2]);
        }
        for (let x2 = maxX - 1; x2 >= minX; x2--) {
          if (bitmap[maxY * w + x2]) contour.push([x2, maxY]);
        }
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
  minAreaRect(points) {
    if (points.length < 3) return null;
    const hull = this.convexHull(points);
    if (hull.length < 3) return null;
    let bestArea = Infinity;
    let bestRect = null;
    for (let i = 0; i < hull.length; i++) {
      const [x1, y1] = hull[i];
      const [x2, y2] = hull[(i + 1) % hull.length];
      const edgeDx = x2 - x1;
      const edgeDy = y2 - y1;
      const edgeLen = Math.hypot(edgeDx, edgeDy);
      if (edgeLen < 1e-6) continue;
      const ux = edgeDx / edgeLen, uy = edgeDy / edgeLen;
      const px = -uy, py = ux;
      let minU = Infinity, maxU = -Infinity, minP = Infinity, maxP = -Infinity;
      for (const [hx, hy] of hull) {
        const u = hx * ux + hy * uy;
        const p = hx * px + hy * py;
        if (u < minU) minU = u;
        if (u > maxU) maxU = u;
        if (p < minP) minP = p;
        if (p > maxP) maxP = p;
      }
      const area = (maxU - minU) * (maxP - minP);
      if (area < bestArea) {
        bestArea = area;
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
  convexHull(points) {
    const sorted = points.slice().sort((a, b) => a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]);
    const n = sorted.length;
    if (n <= 1) return sorted.slice();
    const lower = [];
    for (const p of sorted) {
      while (lower.length >= 2) {
        const [ax, ay] = lower[lower.length - 2];
        const [bx, by] = lower[lower.length - 1];
        const cross = (bx - ax) * (p[1] - ay) - (by - ay) * (p[0] - ax);
        if (cross <= 0) lower.pop();
        else break;
      }
      lower.push(p);
    }
    const upper = [];
    for (let i = n - 1; i >= 0; i--) {
      const p = sorted[i];
      while (upper.length >= 2) {
        const [ax, ay] = upper[upper.length - 2];
        const [bx, by] = upper[upper.length - 1];
        const cross = (bx - ax) * (p[1] - ay) - (by - ay) * (p[0] - ax);
        if (cross <= 0) upper.pop();
        else break;
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
  polygonToAabb(quad) {
    const xs = [quad[0], quad[2], quad[4], quad[6]];
    const ys = [quad[1], quad[3], quad[5], quad[7]];
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }
  /**
   * Mean probability of all pixels inside a polygon's axis-aligned bounding box.
   * This is the PaddleOCR "fast" score mode. "Slow" mode (not implemented
   * here) would integrate only over pixels inside the polygon proper.
   */
  scorePolygonAabb(pred, w, h, aabb) {
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
  polygonOffsetDistance(quad, unclipRatio) {
    const area = this.polygonArea(quad);
    const perim = this.polygonPerimeter(quad);
    if (perim < 1e-6) return 0;
    return area * unclipRatio / perim;
  }
  /**
   * Shoelace formula for polygon area.
   */
  polygonArea(quad) {
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
  polygonPerimeter(quad) {
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
  offsetPolygon(quad, distance) {
    if (distance <= 0) return quad.slice();
    const n = 4;
    const cx = (quad[0] + quad[2] + quad[4] + quad[6]) / 4;
    const cy = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;
    const normals = [];
    for (let i = 0; i < n; i++) {
      const ax = quad[i * 2], ay = quad[i * 2 + 1];
      const bx = quad[(i + 1) % n * 2], by = quad[(i + 1) % n * 2 + 1];
      const ex = bx - ax, ey = by - ay;
      const len = Math.hypot(ex, ey);
      if (len < 1e-6) {
        normals.push([0, 0]);
        continue;
      }
      const cand1 = [-ey / len, ex / len];
      const cand2 = [ey / len, -ex / len];
      const midx = (ax + bx) / 2, midy = (ay + by) / 2;
      const d1 = Math.hypot(midx + cand1[0] - cx, midy + cand1[1] - cy);
      const d2 = Math.hypot(midx + cand2[0] - cx, midy + cand2[1] - cy);
      normals.push(d1 > d2 ? cand1 : cand2);
    }
    const out = new Array(8);
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
  polygonIoU(a, b) {
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
  polygonClipArea(a, b) {
    const subj = [
      [a[0], a[1]],
      [a[2], a[3]],
      [a[4], a[5]],
      [a[6], a[7]]
    ];
    const clip = [
      [b[0], b[1]],
      [b[2], b[3]],
      [b[4], b[5]],
      [b[6], b[7]]
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
  sutherlandHodgmanArea(subject, clip) {
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
            output.push(this.lineIntersection(previous, current, edgeStart, edgeEnd));
          }
          output.push(current);
        } else if (previousInside) {
          output.push(this.lineIntersection(previous, current, edgeStart, edgeEnd));
        }
      }
    }
    return this.polygonAreaFromPoints(output);
  }
  /** Point-on-the-inside-side test for a directed edge (CCW convention). */
  isInsideEdge(p, a, b) {
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0;
  }
  /**
   * Intersection of the infinite lines through (a1, a2) and (b1, b2).
   * Returns a single point. Assumes the two lines are not parallel
   * (caller should only invoke this when an intersection is known to exist).
   */
  lineIntersection(a1, a2, b1, b2) {
    const ax = a2[0] - a1[0], ay = a2[1] - a1[1];
    const bx = b2[0] - b1[0], by = b2[1] - b1[1];
    const denom = ax * by - ay * bx;
    if (Math.abs(denom) < 1e-9) return a1;
    const t = ((b1[0] - a1[0]) * by - (b1[1] - a1[1]) * bx) / denom;
    return [a1[0] + t * ax, a1[1] + t * ay];
  }
  /** Shoelace area for an arbitrary point array. */
  polygonAreaFromPoints(points) {
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
  greedyNMS(polygons, scores, iouThresh) {
    if (polygons.length === 0) return [];
    const order = polygons.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
    const keep = [];
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
  ctcDecode(logits, dict, modelOutputDim) {
    const N = modelOutputDim ?? dict.length;
    if (N === 0) return "";
    const total = logits.length;
    if (total % N !== 0) {
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
  ctcDecodeReshape(logits, T, N, dict) {
    let prev = -1;
    let out = "";
    for (let t = 0; t < T; t++) {
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
      if (best !== prev && best > 0 && best - 1 < dict.length) {
        out += dict[best - 1];
      }
      prev = best;
    }
    return out;
  }
  // ---------------------------------------------------------------------------
  // Dependency resolution
  // ---------------------------------------------------------------------------
  resolveOrt() {
    if (this.ort) return this.ort;
    try {
      return require("onnxruntime-node");
    } catch (e) {
      throw new Error(
        `PaddleOCR \u5728\u5F53\u524D Obsidian \u6E32\u67D3\u8FDB\u7A0B\u4E2D\u65E0\u6CD5\u52A0\u8F7D onnxruntime-node\uFF08\u6C99\u7BB1\u9650\u5236\uFF09\u3002\u5DF2\u81EA\u52A8\u56DE\u9000\u5230 Kreuzberg (Rust)\uFF0C\u4E0D\u5F71\u54CD OCR\u3002\u539F\u59CB\u9519\u8BEF: ${e?.message ?? e}`
      );
    }
  }
  resolveSharp() {
    if (this.sharp) return this.sharp;
    try {
      return require("sharp");
    } catch (e) {
      throw new Error("PaddleOCR \u4F9D\u8D56 sharp \u672A\u5B89\u88C5");
    }
  }
  // ---------------------------------------------------------------------------
  // Idle timer — auto-dispose to reclaim memory when idle.
  // ---------------------------------------------------------------------------
  resetIdleTimer() {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      void this.dispose();
    }, _PaddleOcrEngine.IDLE_TIMEOUT_MS);
  }
  clearIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
  // ---------------------------------------------------------------------------
  // Dictionary loading — tier-aware
  //
  // Mobile bundle (legacy): a flat text file at
  //   `<modelDir>/dict/ppocr_keys_v5.txt`, one token per line.
  //
  // Server / Hybrid bundle: the dictionary is embedded inside
  //   `<modelDir>/rec/inference.yml` under `PostProcess.character_dict`,
  //   as a YAML list of strings. PaddleOCR ships the rec model with
  //   its companion yml; we parse it with a tiny dependency-free
  //   reader that only supports the limited subset used here.
  // ---------------------------------------------------------------------------
  /**
   * Load the PaddleOCR character dictionary. Mobile falls back to a
   * `.txt` file; server/hybrid fall back to parsing the rec model's
   * `inference.yml`. Returns [] if neither source is available
   * (caller is expected to treat that as a hard error).
   */
  async loadDictionary() {
    const txtPath = this.pathLib.join(this.modelDir, PADDLE_MODEL_SUBDIRS.dict, PADDLE_MODEL_FILES.dict);
    if (this.fs.existsSync(txtPath)) {
      const raw = await this.fs.promises.readFile(txtPath, "utf-8");
      const dict = raw.split(/\r?\n/).filter((line) => line.length > 0);
      if (dict.length > 0) return dict;
    }
    const ymlPath = this.pathLib.join(this.modelDir, PADDLE_MODEL_SUBDIRS.rec, "inference.yml");
    if (this.fs.existsSync(ymlPath)) {
      const ymlRaw = await this.fs.promises.readFile(ymlPath, "utf-8");
      const dict = parsePaddleOcrDictFromYml(ymlRaw);
      if (dict.length > 0) return dict;
    }
    return [];
  }
};
_PaddleOcrEngine.IDLE_TIMEOUT_MS = 18e4;
// 3 minutes, matches OCR service convention
_PaddleOcrEngine.REC_IMG_HEIGHT = 48;
_PaddleOcrEngine.REC_MAX_WIDTH = 320;
_PaddleOcrEngine.CLS_IMG_HEIGHT = 48;
_PaddleOcrEngine.CLS_IMG_WIDTH = 192;
/** Aspect ratio (long side / short side) above which a box is rejected. */
_PaddleOcrEngine.DET_ASPECT_RATIO_THRESH = 100;
var PaddleOcrEngine = _PaddleOcrEngine;
function parsePaddleOcrDictFromYml(yml) {
  const startMatch = yml.match(/^\s*character_dict:\s*$/m);
  if (!startMatch) return [];
  const startIdx = startMatch.index + startMatch[0].length;
  const tail = yml.slice(startIdx);
  const lines = tail.split(/\r?\n/);
  const result = [];
  for (const line of lines) {
    if (line.trim() === "" || /^\s*#/.test(line)) continue;
    const m = line.match(/^(\s*)-(\s?)(.*)$/);
    if (m) {
      result.push(unquoteYamlString(m[3]));
      continue;
    }
    break;
  }
  return result;
}
function unquoteYamlString(raw) {
  let s = raw.replace(/^[ \t]+|[ \t]+$/g, "");
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    s = s.slice(1, -1);
  } else if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) {
    s = s.slice(1, -1);
  }
  return s.replace(/\\\\/g, "\0BACKSLASH\0").replace(/\\"/g, '"').replace(/\\n/g, "\n").replace(/\\t/g, "	").replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/\x00BACKSLASH\x00/g, "\\");
}

// src/paddle-ocr-worker.ts
var ort = require("onnxruntime-node");
var sharp = require("sharp");
function emit(json) {
  process.stdout.write(JSON.stringify(json) + "\n");
}
var service = null;
var rl = (0, import_node_readline.createInterface)({ input: process.stdin });
rl.on("line", async (raw) => {
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  try {
    if (msg.type === "init") {
      await runInit(msg);
    } else if (msg.type === "extract") {
      await runExtract(msg);
    }
  } catch (e) {
    emit({ type: "error", jobId: msg.jobId, error: String(e?.message ?? e) });
  }
});
async function runInit(req) {
  emit({ type: "progress", jobId: req.jobId, stage: "init", message: "\u6B63\u5728\u52A0\u8F7D PaddleOCR \u6A21\u578B..." });
  service = new PaddleOcrEngine(req.modelDir, {
    ort,
    sharp,
    detConfig: req.detConfig,
    tier: req.tier,
    cpuThreads: req.cpuThreads
  });
  await service.init((status) => {
    emit({ type: "progress", jobId: req.jobId, stage: "init", message: status });
  });
  emit({ type: "result", jobId: req.jobId, success: true, text: "" });
}
async function runExtract(req) {
  if (!service) {
    emit({ type: "error", jobId: req.jobId, error: "PaddleOCR worker not initialized" });
    return;
  }
  emit({ type: "progress", jobId: req.jobId, stage: "extracting", message: "\u6B63\u5728\u4F7F\u7528 PaddleOCR \u8BC6\u522B\u56FE\u50CF..." });
  const text = await service.runOcr(req.imagePath, (status) => {
    emit({ type: "progress", jobId: req.jobId, stage: "extracting", message: status });
  });
  emit({ type: "result", jobId: req.jobId, success: true, text });
}
process.on("unhandledRejection", (err) => {
  process.stderr.write(`[paddle-ocr-worker] unhandledRejection: ${err}
`);
  process.exit(71);
});
process.on("uncaughtException", (err) => {
  process.stderr.write(`[paddle-ocr-worker] uncaughtException: ${err}
`);
  process.exit(72);
});
emit({ type: "ready" });
