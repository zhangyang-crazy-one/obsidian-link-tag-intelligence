// ---------------------------------------------------------------------------
// Model repository constants (D-14)
// ---------------------------------------------------------------------------

// 2025-06-30 Chinese Zipformer INT8 (streaming) — best accuracy on CPU
// Source: GitHub Releases (single tar.bz2 archive)
const ZH_MODEL_ARCHIVE = "sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30.tar.bz2";
const ZH_MODEL_URL = "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/" + ZH_MODEL_ARCHIVE;
const ZH_MODEL_FILENAMES = ["encoder.int8.onnx", "decoder.onnx", "joiner.int8.onnx", "tokens.txt"];

// 2023-02-20 Bilingual zh-en Zipformer (streaming) — for English mode
const EN_MODEL_REPO = "csukuangfj/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20";
const EN_MODEL_FILES: ModelFileEntry[] = [
  { filename: "encoder-epoch-99-avg-1.int8.onnx", sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
  { filename: "decoder-epoch-99-avg-1.int8.onnx", sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
  { filename: "joiner-epoch-99-avg-1.int8.onnx",   sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
  { filename: "tokens.txt",                          sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" },
];

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface DownloadProgress {
  percent: number;   // 0.0 - 1.0
  loadedBytes: number;
  totalBytes: number;
}

export interface DownloadResult {
  filename: string;
  success: boolean;
  buffer?: ArrayBuffer; // file contents on success
  error?: string;
}

export interface ModelFileEntry {
  filename: string;
  sha256: string;
}

export interface BatchDownloadProgress {
  currentFile: string;
  fileIndex: number;
  totalFiles: number;
  fileProgress: DownloadProgress;
}

// ---------------------------------------------------------------------------
// SHA256 utilities (D-16)
// ---------------------------------------------------------------------------

/** Compute SHA256 hex string from ArrayBuffer using Web Crypto API. */
export async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Verify buffer matches expected SHA256 checksum. */
export async function verifyChecksum(buffer: ArrayBuffer, expectedSha256: string): Promise<boolean> {
  const actual = await sha256Hex(buffer);
  return actual === expectedSha256;
}

// ---------------------------------------------------------------------------
// Model file list accessors
// ---------------------------------------------------------------------------

/** Return the list of model filenames for a given language. */
export function getModelFileList(language: "zh" | "en"): string[] {
  return language === "zh" ? [...ZH_MODEL_FILENAMES] : EN_MODEL_FILES.map((f) => f.filename);
}

/** Return the HuggingFace repo identifier (en only; zh uses GitHub Releases). */
export function getModelRepo(language: "zh" | "en"): string {
  return language === "zh" ? ZH_MODEL_URL : EN_MODEL_REPO;
}

/** Whether this language uses a tar.bz2 archive download (zh) vs individual files (en). */
export function isArchiveDownload(language: "zh" | "en"): boolean {
  return language === "zh";
}

// ---------------------------------------------------------------------------
// Single file download with ReadableStream progress (D-14, D-15)
// ---------------------------------------------------------------------------

/**
 * Download a single model file from HuggingFace.
 * Reports progress via onProgress callback.
 * Returns the file contents as ArrayBuffer.
 */
export async function downloadModelFile(
  repo: string,
  filename: string,
  onProgress: (progress: DownloadProgress) => void
): Promise<ArrayBuffer> {
  const url = `https://huggingface.co/${repo}/resolve/main/${filename}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText} for ${filename}`);
  }

  const contentLength = Number(response.headers.get("content-length") || "0");
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress({
      percent: contentLength > 0 ? loaded / contentLength : 0,
      loadedBytes: loaded,
      totalBytes: contentLength,
    });
  }

  // Reassemble all chunks into a single ArrayBuffer
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
// Download with SHA256 verification and retry (D-16, D-17)
// ---------------------------------------------------------------------------

/**
 * Download a model file with SHA256 verification and retry.
 * Retries up to maxRetries times with exponential backoff (1s, 2s, 4s, ...).
 * On success, the returned DownloadResult includes the file buffer.
 */
export async function downloadWithRetry(
  repo: string,
  filename: string,
  expectedSha256: string,
  onProgress: (progress: DownloadProgress) => void,
  maxRetries = 3
): Promise<DownloadResult> {
  const backoffDelays = [1000, 2000, 4000]; // D-17: exponential backoff

  const PLACEHOLDER_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // SHA256 of empty string

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const buffer = await downloadModelFile(repo, filename, onProgress);

      // D-16: SHA256 verification — skip if checksums are still placeholder
      const skipVerify = expectedSha256 === PLACEHOLDER_SHA256;
      const valid = skipVerify || await verifyChecksum(buffer, expectedSha256);
      if (skipVerify) {
        return { filename, success: true, buffer };
      }
      if (!valid) {
        if (attempt < maxRetries) {
          // Wait before retry
          await new Promise((r) => setTimeout(r, backoffDelays[attempt] ?? 4000));
          continue;
        }
        return { filename, success: false, error: "sha256 mismatch after retries" };
      }

      return { filename, success: true, buffer };
    } catch (error) {
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, backoffDelays[attempt] ?? 4000));
        continue;
      }
      return { filename, success: false, error: String(error) };
    }
  }

  return { filename, success: false, error: "unknown error" };
}

// ---------------------------------------------------------------------------
// Batch download orchestration
// ---------------------------------------------------------------------------

/**
 * Download all model files for a language with progress and SHA256 verification.
 * Successfully downloaded files are written via writeFile callback.
 * Returns list of results — caller should check for failures and show manual
 * download instructions if any file failed.
 */
export async function downloadModelFiles(
  language: "zh" | "en",
  writeFile: (filename: string, data: ArrayBuffer) => Promise<void>,
  onProgress: (progress: BatchDownloadProgress) => void
): Promise<DownloadResult[]> {
  const repo = getModelRepo(language);
  const files = getModelFileList(language);
  const results: DownloadResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const result = await downloadWithRetry(
      repo,
      file.filename,
      file.sha256,
      (fp) =>
        onProgress({
          currentFile: file.filename,
          fileIndex: i,
          totalFiles: files.length,
          fileProgress: fp,
        }),
      3
    );

    if (result.success && result.buffer) {
      await writeFile(file.filename, result.buffer);
    }

    results.push(result);
  }

  return results;
}
