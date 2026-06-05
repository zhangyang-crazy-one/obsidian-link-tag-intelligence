// ---------------------------------------------------------------------------
// PaddleOCR model download manager
//
// Mirrors the shape of speech-model.ts so the two model families share
// a common download protocol (per-file retry, SHA256 placeholder skip,
// HF mirror base URL, batch progress).
//
// All PaddleOCR model files live on HuggingFace under
// `huggingface.co/PaddlePaddle/PP-OCRv5_<tier>_<task>_onnx`. The
// dictionary metadata is downloaded with each tier: server / hybrid use
// the rec model's `inference.yml`, and mobile uses `ppocr_keys_v5.txt`.
// ---------------------------------------------------------------------------

import {
  PaddleOcrModelTier,
  PADDLE_TIER_SPECS,
} from "./paddle-ocr-types";

export interface PaddleDownloadProgress {
  /** 0.0 - 1.0 */
  percent: number;
  loadedBytes: number;
  totalBytes: number;
}

export interface PaddleFileResult {
  filename: string;
  role: PaddleDownloadRole;
  success: boolean;
  bytes?: number;
  /** Filled on success. The caller writes this to disk. */
  buffer?: ArrayBuffer;
  error?: string;
}

export interface PaddleTierDownloadResult {
  tier: PaddleOcrModelTier;
  files: PaddleFileResult[];
  anyFailed: boolean;
  totalBytes: number;
}

export interface PaddleBatchProgress {
  currentFile: string;
  role: PaddleDownloadRole;
  fileIndex: number;
  totalFiles: number;
  fileProgress: PaddleDownloadProgress;
}

// ---------------------------------------------------------------------------
// Pure URL / file-list helpers (no I/O — easy to test in isolation)
// ---------------------------------------------------------------------------

/**
 * The HuggingFace mirror we prefer. China users get much faster
 * downloads via hf-mirror.com; overseas users can override at the
 * `globalThis.__LTI_PADDLE_HF_BASE__` level.
 */
export const DEFAULT_HF_BASE_URL = "https://hf-mirror.com";

export type PaddleDownloadRole = "det" | "rec" | "dict";

export function getPaddleHfBaseUrl(): string {
  const override = (globalThis as unknown as { __LTI_PADDLE_HF_BASE__?: string }).__LTI_PADDLE_HF_BASE__;
  if (typeof override === "string" && override.length > 0) return override;
  return DEFAULT_HF_BASE_URL;
}

/** Build the URL to download a single PaddleOCR file. */
export function buildPaddleFileUrl(spec: { repo: string; filename: string }, baseUrl = getPaddleHfBaseUrl()): string {
  return `${baseUrl.replace(/\/+$/, "")}/${spec.repo}/resolve/main/${spec.filename}`;
}

/** Return the file list (in download order) for the given tier. */
export function getPaddleTierFileList(tier: PaddleOcrModelTier): Array<{ role: PaddleDownloadRole; spec: { repo: string; filename: string; sha256: string; sizeBytes: number } }> {
  const s = PADDLE_TIER_SPECS[tier];
  return [
    { role: "det", spec: s.det },
    { role: "rec", spec: s.rec },
    { role: s.dict.role, spec: s.dict },
  ];
}

/** Total bytes the tier will download (used to pre-format progress UI). */
export function getPaddleTierTotalBytes(tier: PaddleOcrModelTier): number {
  const s = PADDLE_TIER_SPECS[tier];
  return s.det.sizeBytes + s.rec.sizeBytes + s.dict.sizeBytes;
}

// ---------------------------------------------------------------------------
// Per-file download — fetch + progress + placeholder-SHA skip
// ---------------------------------------------------------------------------

const PLACEHOLDER_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // SHA256 of empty

/**
 * Download a single PaddleOCR file with progress reporting.
 * Does NOT verify SHA256 (caller does that, to share retry logic).
 */
export async function downloadPaddleFile(
  url: string,
  filename: string,
  onProgress?: (p: PaddleDownloadProgress) => void
): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} for ${filename}`);
  }
  const contentLength = Number(response.headers.get("content-length") || "0");
  const reader = response.body?.getReader();
  if (!reader) throw new Error(`No response body for ${filename}`);

  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.({
      percent: contentLength > 0 ? loaded / contentLength : 0,
      loadedBytes: loaded,
      totalBytes: contentLength,
    });
  }
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result.buffer;
}

// ---------------------------------------------------------------------------
// Single-file download with SHA256 verification + retry
// ---------------------------------------------------------------------------

export async function downloadPaddleFileWithRetry(
  role: PaddleDownloadRole,
  spec: { repo: string; filename: string; sha256: string },
  onFileProgress?: (p: PaddleDownloadProgress) => void,
  maxRetries = 3,
  baseUrl = getPaddleHfBaseUrl(),
): Promise<PaddleFileResult> {
  const backoffDelays = [1000, 2000, 4000];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const url = buildPaddleFileUrl(spec, baseUrl);
      const buffer = await downloadPaddleFile(url, spec.filename, onFileProgress);
      const skipVerify = spec.sha256 === PLACEHOLDER_SHA256;
      if (skipVerify) {
        return { filename: spec.filename, role, success: true, bytes: buffer.byteLength, buffer };
      }
      // Lazy import to avoid pulling crypto at module load.
      const { sha256Hex } = await import("./speech-model");
      const actual = await sha256Hex(buffer);
      if (actual !== spec.sha256) {
        if (attempt < maxRetries) {
          await new Promise((r) => setTimeout(r, backoffDelays[attempt] ?? 4000));
          continue;
        }
        return {
          filename: spec.filename,
          role,
          success: false,
          error: `sha256 mismatch (expected ${spec.sha256}, got ${actual})`,
        };
      }
      return { filename: spec.filename, role, success: true, bytes: buffer.byteLength, buffer };
    } catch (error) {
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, backoffDelays[attempt] ?? 4000));
        continue;
      }
      return {
        filename: spec.filename,
        role,
        success: false,
        error: String(error),
      };
    }
  }
  return { filename: spec.filename, role, success: false, error: "unknown" };
}

// ---------------------------------------------------------------------------
// Tier-level download: det + rec in sequence, with progress + writeFile
// ---------------------------------------------------------------------------

/**
 * Where the caller should write a file. We pass both `role` and `filename`
 * so the caller can land the file under `<modelDir>/<role>/<filename>` —
 * matching the layout PaddleOcrService.checkModelFiles() expects
 * (`det/inference.onnx`, `rec/inference.onnx`).
 */
export type PaddleWriteTarget = { role: PaddleDownloadRole; filename: string };

/**
 * Download the full PaddleOCR bundle for a given tier and write each
 * file via the supplied `writeFile` callback. The order is det first
 * (so the user sees progress early on smaller mobile downloads, with
 * rec next), then rec.
 *
 * Caller supplies writeFile so the production code (in main.ts) can
 * write to vault-relative paths via `(globalThis as any).require("fs")`
 * and tests can write into an in-memory mock.
 */
export async function downloadPaddleTier(
  tier: PaddleOcrModelTier,
  writeFile: (target: PaddleWriteTarget, data: ArrayBuffer) => Promise<void> | void,
  onProgress?: (p: PaddleBatchProgress) => void,
  baseUrl: string = getPaddleHfBaseUrl()
): Promise<PaddleTierDownloadResult> {
  const files = getPaddleTierFileList(tier);
  const results: PaddleFileResult[] = [];
  let totalBytes = 0;
  for (let i = 0; i < files.length; i++) {
    const { role, spec } = files[i];
    onProgress?.({
      currentFile: spec.filename,
      role,
      fileIndex: i,
      totalFiles: files.length,
      fileProgress: { percent: 0, loadedBytes: 0, totalBytes: spec.sizeBytes },
    });
    const result = await downloadPaddleFileWithRetry(
      role,
      spec,
      (p) => onProgress?.({
        currentFile: spec.filename,
        role,
        fileIndex: i,
        totalFiles: files.length,
        fileProgress: p,
      }),
      3,
      baseUrl
    );
    if (result.success && result.buffer) {
      try {
        await writeFile({ role, filename: spec.filename }, result.buffer);
      } catch (e) {
        result.success = false;
        result.error = `writeFile failed: ${e}`;
      }
      totalBytes += result.buffer.byteLength;
    }
    results.push(result);
  }
  return { tier, files: results, anyFailed: results.some((r) => !r.success), totalBytes };
}

// ---------------------------------------------------------------------------
// Local integrity check — does the target dir already have the tier?
// ---------------------------------------------------------------------------

/**
 * Pure check: does the supplied existsSync indicate that all required
 * files for the tier are present at `modelDir/<role>/<filename>`?
 */
export function isPaddleTierInstalled(
  tier: PaddleOcrModelTier,
  existsSync: (p: string) => boolean,
  modelDir: string
): { installed: boolean; missing: string[] } {
  const files = getPaddleTierFileList(tier);
  const missing: string[] = [];
  for (const { role, spec } of files) {
    const p = `${modelDir.replace(/\/+$/, "")}/${role}/${spec.filename}`;
    if (!existsSync(p)) missing.push(p);
  }
  return { installed: missing.length === 0, missing };
}
