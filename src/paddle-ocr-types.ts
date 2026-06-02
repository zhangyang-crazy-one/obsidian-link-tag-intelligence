// PaddleOCR shared types.
// Used by paddle-ocr-service.ts and any consumer that needs to interpret
// detection / recognition results.

/** A 4-point polygon in image coordinates, ordered top-left, top-right, bottom-right, bottom-left. */
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

/** Standard PP-OCRv5 mean/std for rec (uses 127.5 scaling, no [0,1] normalization). */
export const PADDLE_REC_PREPROCESS: PaddleOcrPreprocess = {
  mean: [127.5, 127.5, 127.5],
  std: [127.5, 127.5, 127.5],
};

/** Sub-directory layout for a PaddleOCR model folder. */
export const PADDLE_MODEL_SUBDIRS = {
  det: "det",
  rec: "rec",
  cls: "cls",
  dict: "dict",
} as const;

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
