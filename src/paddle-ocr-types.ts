// PaddleOCR shared types.
// Used by paddle-ocr-service.ts and any consumer that needs to interpret
// detection / recognition results.

/**
 * A 4-point polygon in image coordinates.
 *
 * Canonical element order: `[TL.x, TL.y, TR.x, TR.y, BR.x, BR.y, BL.x, BL.y]`
 * (top-left, top-right, bottom-right, bottom-left).
 *
 * For an axis-aligned rectangle this degenerates to
 * `[x1, y1, x2, y1, x2, y2, x1, y2]` (TL/TR share y, TL/BL share x).
 *
 * History: this type used to mean "axis-aligned bbox" only. The DBNet
 * postprocessor was rewritten to emit the full polygon (so callers can
 * later upgrade to perspective warp), but the runtime contract for
 * `warpCrop` was kept axis-aligned by computing the polygon's bounding
 * box on entry.
 */
export type Quad = [number, number, number, number, number, number, number, number];

/** A single recognized text region from PaddleOCR. */
export type PaddleOcrRegion = {
  text: string;
  confidence: number;
  quad: Quad;
};

/** Result returned from a PaddleOCR run, in reading order (top-to-bottom, left-to-right). */
export type PaddleOcrResult = {
  regions: PaddleOcrRegion[];
  fullText: string;
};

/** Preprocessing parameters shared by det / cls / rec branches. */
export type PaddleOcrPreprocess = {
  /** Normalize to [0,1] and subtract 0.5 then divide by 0.5 (PP-OCR det / cls convention). */
  mean: [number, number, number];
  std: [number, number, number];
};

/** Standard PP-OCRv5 mean/std for det + cls. */
export const PADDLE_DET_CLS_PREPROCESS: PaddleOcrPreprocess = {
  mean: [0.5, 0.5, 0.5],
  std: [0.5, 0.5, 0.5],
};

/** Standard PP-OCRv5 rec mean/std, expressed in [0, 1] pixel space.
 *  Mathematically equivalent to the PaddleOCR reference formula
 *  `(v - 127.5) / 127.5` but compatible with our `hwcToNchw` helper
 *  which does `(v/255 - mean) / std`.
 */
export const PADDLE_REC_PREPROCESS: PaddleOcrPreprocess = {
  mean: [0.5, 0.5, 0.5],
  std: [0.5, 0.5, 0.5],
};

/** Sub-directory layout for a PaddleOCR model folder. */
export const PADDLE_MODEL_SUBDIRS = {
  det: "det",
  rec: "rec",
  cls: "cls",
  dict: "dict",
} as const;

// ─── PaddleOCR detection hyperparameters ─────────────────────────────────────
//
// These are exposed to the user via Settings (src/settings.ts). Defaults are
// PaddleOCR's official values from `tools/infer/utility.py` and the standard
// det_mv3_db / ch_PP-OCRv*_det yml configs. Do NOT tune them for any
// particular test image — that's overfitting. If a user has a specific
// workload that needs different values, they should adjust per-vault and
// report metrics on a held-out Dev set.

export type PaddleDetConfig = {
  /** Pixel prob > this counts as text in the DBNet binarization step. */
  dbThresh: number;
  /** Mean confidence inside a candidate box; below this the box is dropped. */
  dbBoxThresh: number;
  /** How far to expand each detected box outward (PaddleOCR polygon offset). */
  unclipRatio: number;
  /** Boxes smaller than this on their short side are dropped. */
  minSize: number;
  /** NMS threshold: boxes with IoU above this are merged. */
  nmsIouThresh: number;
  /** Hard cap on number of candidate boxes (performance protection). */
  maxCandidates: number;
  /** Image is downscaled so its longest side is this value before det inference. */
  limitSideLen: number;
  /** fast = mean of pixels in axis-aligned bbox; slow = mean inside polygon. */
  scoreMode: "fast" | "slow";
  /** Apply 3x3 dilation to the binarized map before contour finding. */
  useDilation: boolean;
};

export const PADDLE_DET_DEFAULTS: PaddleDetConfig = {
  dbThresh: 0.3,
  dbBoxThresh: 0.6,
  unclipRatio: 1.5,
  minSize: 3,
  nmsIouThresh: 0.3,
  maxCandidates: 1000,
  limitSideLen: 960,
  scoreMode: "fast",
  // Mobile PP-OCRv5's official default per PaddleOCR's det_mv3_db.yml;
  // desktop / server inference usually runs with dilation off. This plugin
  // only ships the mobile bundle, so the mobile default is the right baseline.
  useDilation: true,
};

/** Filenames for PP-OCRv5 mobile ONNX bundle. */
export const PADDLE_MODEL_FILES = {
  det: "inference.onnx",
  rec: "inference.onnx",
  cls: "inference.onnx",
  dict: "ppocr_keys_v5.txt",
} as const;

/** Default PaddleOCR model directory (relative to plugin root). */
export const PADDLE_DEFAULT_MODEL_DIR = "models/ocr/pp-ocrv5/mobile";

/** Default HuggingFace repo for PP-OCRv5 mobile bundle. */
export const PADDLE_HF_REPO = "PaddlePaddle/PP-OCRv5_mobile_rec";
