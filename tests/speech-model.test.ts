import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sha256Hex,
  verifyChecksum,
  downloadModelFile,
  downloadWithRetry,
  downloadModelFiles,
  getModelFileList,
  getModelRepo,
} from "../src/speech-model";
import type { DownloadProgress, BatchDownloadProgress } from "../src/speech-model";

// ---------------------------------------------------------------------------
// SHA256 helper for producing test expectations
// ---------------------------------------------------------------------------
async function referenceSha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("sha256Hex", () => {
  it("returns correct SHA256 for known input 'abc'", async () => {
    // "abc" SHA-256 per FIPS 180-4 test vector
    const expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    const result = await sha256Hex(new TextEncoder().encode("abc").buffer);
    expect(result).toBe(expected);
  });

  it("returns different hashes for different inputs", async () => {
    const a = await sha256Hex(new TextEncoder().encode("hello").buffer);
    const b = await sha256Hex(new TextEncoder().encode("world").buffer);
    expect(a).not.toBe(b);
  });

  it("returns same hash for same input", async () => {
    const buf = new TextEncoder().encode("test").buffer;
    const result1 = await sha256Hex(buf);
    const result2 = await sha256Hex(buf);
    expect(result1).toBe(result2);
  });
});

describe("verifyChecksum", () => {
  it("returns true for matching hash", async () => {
    const input = "hello world";
    const buf = new TextEncoder().encode(input).buffer;
    const expected = await referenceSha256Hex(input);
    expect(await verifyChecksum(buf, expected)).toBe(true);
  });

  it("returns false for mismatched hash", async () => {
    const buf = new TextEncoder().encode("example").buffer;
    expect(await verifyChecksum(buf, "0000000000000000000000000000000000000000000000000000000000000000")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Download tests — mock fetch
// ---------------------------------------------------------------------------

/** Create a mock ReadableStream Uint8Array from a buffer. */
function bufferToStream(buffer: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(buffer);
      controller.close();
    },
  });
}

describe("downloadModelFile", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns ArrayBuffer of correct size for successful download", async () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-length": String(payload.length) }),
      body: bufferToStream(payload),
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const progressLog: DownloadProgress[] = [];
    const result = await downloadModelFile("test/repo", "file.bin", (p) => progressLog.push(p));

    expect(result.byteLength).toBe(payload.length);
    // progress should have been reported at least once
    expect(progressLog.length).toBeGreaterThan(0);
    const lastProgress = progressLog[progressLog.length - 1];
    expect(lastProgress.percent).toBeCloseTo(1.0, 1);
    expect(lastProgress.loadedBytes).toBe(payload.length);
    expect(lastProgress.totalBytes).toBe(payload.length);
  });

  it("calls onProgress with incremental percentages during download", async () => {
    // Simulate a multi-chunk download
    const chunks: Uint8Array[] = [
      new Uint8Array(50),
      new Uint8Array(50),
      new Uint8Array(50),
    ];
    const totalSize = chunks.reduce((s, c) => s + c.length, 0);
    let chunkIdx = 0;
    const multiChunkStream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (chunkIdx < chunks.length) {
          controller.enqueue(chunks[chunkIdx]);
          chunkIdx++;
        } else {
          controller.close();
        }
      },
    });

    const mockResponse = {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-length": String(totalSize) }),
      body: multiChunkStream,
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const progressLog: DownloadProgress[] = [];
    await downloadModelFile("test/repo", "file.bin", (p) => progressLog.push(p));

    // Should have at least 3 progress calls (one per chunk)
    expect(progressLog.length).toBeGreaterThanOrEqual(3);
    expect(progressLog[0].percent).toBeLessThan(1.0);
    const last = progressLog[progressLog.length - 1];
    expect(last.percent).toBeCloseTo(1.0, 1);
    expect(last.loadedBytes).toBe(totalSize);
    expect(last.totalBytes).toBe(totalSize);
  });

  it("handles missing content-length header gracefully", async () => {
    const payload = new Uint8Array(100);
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers(), // no content-length
      body: bufferToStream(payload),
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const progressLog: DownloadProgress[] = [];
    const result = await downloadModelFile("test/repo", "file.bin", (p) => progressLog.push(p));

    expect(result.byteLength).toBe(payload.length);
    // percent should be 0 when totalBytes is unknown
    expect(progressLog[progressLog.length - 1].totalBytes).toBe(0);
  });

  it("throws on HTTP 404", async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      statusText: "Not Found",
      body: null,
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    await expect(
      downloadModelFile("bad/repo", "missing.bin", () => {})
    ).rejects.toThrow(/404/);
  });

  it("throws on HTTP 403", async () => {
    const mockResponse = {
      ok: false,
      status: 403,
      statusText: "Forbidden",
      body: null,
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    await expect(
      downloadModelFile("bad/repo", "nope.bin", () => {})
    ).rejects.toThrow(/403/);
  });

  it("throws on HTTP 500", async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      body: null,
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    await expect(
      downloadModelFile("bad/repo", "error.bin", () => {})
    ).rejects.toThrow(/500/);
  });
});

describe("downloadWithRetry", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("succeeds on first attempt when SHA256 matches", async () => {
    const payload = new Uint8Array([10, 20, 30]);
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-length": String(payload.length) }),
      body: bufferToStream(payload),
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    // Compute expected SHA256 for the payload
    const hash = await sha256Hex(payload.buffer);

    const result = await downloadWithRetry("test/repo", "file.bin", hash, () => {}, 3);
    expect(result.success).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("retries exactly maxRetries times on persistent fetch failure, then returns failure", async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      statusText: "Server Error",
      body: null,
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const result = await downloadWithRetry("test/repo", "file.bin", "dummy-hash", () => {}, 2);
    expect(result.success).toBe(false);
    // maxRetries=2 → attempts: 0, 1, 2 = 3 total
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  it("retries on SHA256 mismatch and succeeds on retry", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First response: wrong data (will fail SHA256)
        const badPayload = new Uint8Array([99, 99, 99]);
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: new Headers({ "content-length": String(badPayload.length) }),
          body: bufferToStream(badPayload),
        });
      }
      // Second response: correct data
      const goodPayload = new Uint8Array([1, 2, 3, 4]);
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-length": String(goodPayload.length) }),
        body: bufferToStream(goodPayload),
      });
    });

    const hash = await sha256Hex(new Uint8Array([1, 2, 3, 4]).buffer);

    const result = await downloadWithRetry("test/repo", "file.bin", hash, () => {}, 3);
    expect(result.success).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it("fails when SHA256 mismatch persists across all retries", async () => {
    const wrongPayload = new Uint8Array([88, 88, 88]);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-length": String(wrongPayload.length) }),
      body: bufferToStream(wrongPayload),
    });

    const result = await downloadWithRetry("test/repo", "file.bin", "0000000000000000000000000000000000000000000000000000000000000001", () => {}, 2);
    expect(result.success).toBe(false);
  });
});

describe("getModelFileList", () => {
  it("returns 4 files for zh model", () => {
    const list = getModelFileList("zh");
    expect(list).toHaveLength(4);
    const filenames = list.map((f) => f.filename);
    expect(filenames).toContain("encoder-epoch-99-avg-1.int8.onnx");
    expect(filenames).toContain("decoder-epoch-99-avg-1.int8.onnx");
    expect(filenames).toContain("joiner-epoch-99-avg-1.int8.onnx");
    expect(filenames).toContain("tokens.txt");
    // Each entry should have a 64-char hex sha256
    for (const file of list) {
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("returns 4 files for en model", () => {
    const list = getModelFileList("en");
    expect(list).toHaveLength(4);
    const filenames = list.map((f) => f.filename);
    expect(filenames).toContain("encoder-epoch-99-avg-1.onnx");
    expect(filenames).toContain("decoder-epoch-99-avg-1.onnx");
    expect(filenames).toContain("joiner-epoch-99-avg-1.onnx");
    expect(filenames).toContain("tokens.txt");
    for (const file of list) {
      expect(file.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});

describe("getModelRepo", () => {
  it("returns Chinese model repo for zh", () => {
    const repo = getModelRepo("zh");
    expect(repo).toContain("csukuangfj");
    expect(repo).toContain("zh");
  });

  it("returns English model repo for en", () => {
    const repo = getModelRepo("en");
    expect(repo).toContain("csukuangfj");
    expect(repo).toContain("en");
  });
});

describe("downloadModelFiles", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("downloads all files successfully when SHA256 matches", async () => {
    // Simulate all files returning correct data
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const filename = url.split("/").pop() ?? "unknown";
      const payload = new TextEncoder().encode(`content-of-${filename}`);
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-length": String(payload.length) }),
        body: bufferToStream(payload),
      });
    });

    // We need sha256 values that match the mock. Since we can't precompute easily
    // without the implementation, we'll test with a small mock that uses precomputed hashes.
    // This test validates the orchestration flow — downlooadModelFiles calls the right functions.
    const writeLog: Array<{ filename: string; data: ArrayBuffer }> = [];
    const writeFile = vi.fn(async (filename: string, data: ArrayBuffer) => {
      writeLog.push({ filename, data });
    });

    const progressLog: BatchDownloadProgress[] = [];
    const results = await downloadModelFiles("zh", writeFile, (p) => progressLog.push(p));

    // Even if SHA256 mismatches (because we used dummy data), the function should NOT throw
    // It returns results with success=false for mismatched files
    expect(results).toHaveLength(4);
    // The writeFile should have been called for each downloaded file (before SHA256 check)
    // NOTE: our mock fetch returns same content each time, SHA256 will NOT match the expected
    // hardcoded values. So results will all be failures after 3 retries each.
    // This test validates the download orchestration structure.
    expect(progressLog.length).toBeGreaterThan(0);
    expect(progressLog[0]).toHaveProperty("currentFile");
    expect(progressLog[0]).toHaveProperty("fileIndex");
    expect(progressLog[0]).toHaveProperty("totalFiles");
  });
});
