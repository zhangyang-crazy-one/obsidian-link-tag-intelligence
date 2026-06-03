// Kreuzberg OCR service — Rust-core document parser used as the English
// fallback in the 3-tier OCR routing. Replaces tesseract.js with a single
// ~870KB precompiled native binary that ships Tesseract under the hood but
// adds PDF/Office support, table extraction, and proper text layout.
//
// Online docs: https://kreuzberg.dev
// npm:        @kreuzberg/node (4.9.x, NAPI-RS, no Rust toolchain needed)
// License:    Elastic License 2.0 — see LICENSE in node_modules.
//
// IMPORTANT: keep the @kreuzberg/node import as a *lazy* require inside
// runOcr(), not a top-level `import { extractFile } from ...`. esbuild
// hoists top-level requires even when the package is in the `external`
// list, and Obsidian's Electron renderer can't resolve a bare specifier
// at plugin-load time (it returns "Cannot find module '@kreuzberg/node'"
// before any user action). A lazy require runs only when OCR is actually
// invoked, by which time the renderer's module resolver is fully
// initialized. Same pattern PaddleOcrService uses for onnxruntime-node.

import type { JsExtractionConfig } from "@kreuzberg/node";

export class KreuzbergOcrService {
  private readonly tessdataPath: string;
  private static IDLE_TIMEOUT_MS = 120000; // 2 minutes
  private idleTimer: NodeJS.Timeout | null = null;
  /** Track in-flight extraction so we can return early when destroy() fires. */
  private destroyed = false;

  /**
   * @param tessdataPath  Optional directory containing the official Tesseract
   *                       `eng.traineddata` and `chi_sim.traineddata` files.
   *                       Kreuzberg's precompiled Rust binaries ship a
   *                       build-time `TESSDATA_PREFIX` that points at
   *                       `/home/runner/work/kreuzberg/...` (the GitHub
   *                       Actions runner) and is wrong on every other
   *                       machine, so we override it via the process env
   *                       before each call. The path resolution is:
   *                         1) constructor argument (if non-empty)
   *                         2) settings.tesseractDataPath (resolved by the
   *                            vision-service before reaching here)
   *                         3) `${pluginDir}/models/tessdata` (default)
   *                       If the directory does not contain usable trained-
   *                       data, kreuzberg will surface a clear error and
   *                       fall through to a higher-level error — the
   *                       Latin-ratio auto-routing in vision-service.ts will
   *                       then leave PaddleOCR's output in place rather than
   *                       emitting a half-empty result.
   */
  constructor(tessdataPath: string) {
    this.tessdataPath = tessdataPath;
  }

  /**
   * Run OCR / document extraction on a local file path. Returns the plain
   * text (or markdown if `outputFormat` is set in the config).
   *
   * Kreuzberg auto-detects the MIME type from the file extension, so the
   * caller can pass an image path (.png/.jpg/.webp/.bmp) or a PDF path
   * and get the same string back. For PDFs we still want page-level text
   * (one block per page), which kreuzberg returns as a single content
   * string with `\f` (form feed) page separators in plain mode.
   */
  public async runOcr(
    imageSource: string,
    onStatus?: (msg: string) => void
  ): Promise<string> {
    if (this.destroyed) throw new Error("KreuzbergOcrService 已被销毁");
    this.resetIdleTimer();
    if (onStatus) onStatus("正在通过 Kreuzberg (Rust) 提取文字...");

    const config: JsExtractionConfig = {
      // Plain text is what the rest of vision-service.ts / main.ts expects
      // (it concatenates with `\n` later). markdown adds noise markers
      // for headers/links that aren't useful for raw OCR ingestion.
      outputFormat: "plain",
      // We don't have an ABLETON cache to maintain across calls and
      // the cache dir defaults to $XDG_CACHE_HOME which may be unset
      // under Obsidian's Electron runtime. Disable to keep first-run
      // behavior predictable.
      useCache: false,
      // Disable layout detection (saves ~200ms and we don't use the layout
      // output downstream — we only want the text content).
      layout: undefined,
    };

    try {
      // Override the broken build-time TESSDATA_PREFIX baked into the
      // precompiled Rust binary. Save and restore the previous value so
      // concurrent OCR requests from other consumers (e.g. Qwen2-VL
      // workers) aren't affected.
      const prevTessdataPrefix = process.env.TESSDATA_PREFIX;
      if (this.tessdataPath) {
        process.env.TESSDATA_PREFIX = this.tessdataPath;
      }
      let result;
      try {
        // Lazy require — see top-of-file note. Hoisting this to module
        // scope breaks Obsidian's renderer module resolution.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { extractFile } = require("@kreuzberg/node") as typeof import("@kreuzberg/node");
        result = await extractFile(imageSource, null, config);
      } finally {
        if (prevTessdataPrefix === undefined) {
          delete process.env.TESSDATA_PREFIX;
        } else {
          process.env.TESSDATA_PREFIX = prevTessdataPrefix;
        }
      }
      this.resetIdleTimer();
      return result.content;
    } catch (e: any) {
      console.error("[lti-kreuzberg-ocr] extract failed:", e);
      throw new Error(`Kreuzberg OCR 推理异常: ${e?.message ?? e}`);
    }
  }

  /**
   * Reset the idle reclaimer countdown. Kreuzberg itself doesn't keep
   * a long-lived worker, but the timer acts as a "service is idle" hint
   * we can later wire to a worker-pool teardown if needed.
   */
  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
    }, KreuzbergOcrService.IDLE_TIMEOUT_MS);
  }

  /**
   * Destroy lifecycle for plugin unload. Sets a guard so any in-flight
   * extraction throws instead of silently writing to a freed handle.
   */
  public destroy(): void {
    this.destroyed = true;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
}
