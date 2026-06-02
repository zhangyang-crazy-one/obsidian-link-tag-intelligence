// Tesseract.js OCR service — the bottom-most safety net in the 3-tier OCR routing.
// Runs 100% locally in a background WASM worker to keep the Obsidian main thread responsive.
// Includes automatic idle worker destruction to free resources.
// Note: This class name was previously `PaddleOcrWasmService` but the actual implementation
// uses tesseract.js (not PaddleOCR). Renamed in the 3-tier OCR refactor.

import { createWorker } from "tesseract.js";

export class TesseractOcrService {
  private worker: any = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private tessdataPath: string;
  private static IDLE_TIMEOUT_MS = 120000; // 2 minutes of idle before reclaiming memory

  constructor(tessdataPath: string) {
    this.tessdataPath = tessdataPath;
  }

  /**
   * Lazily initialize the OCR worker
   */
  private async getOrBuildWorker(lang = "chi_sim+eng", onStatus?: (msg: string) => void): Promise<any> {
    this.resetIdleTimer();
    
    if (this.worker) {
      return this.worker;
    }

    if (onStatus) onStatus("正在初始化极速 OCR 引擎...");
    
    // Create a high-quality local WASM OCR worker
    // Set langPath and cachePath to the local tessdata directory so it runs 100% offline
    const worker = await createWorker(lang, 1, {
      langPath: this.tessdataPath,
      cachePath: this.tessdataPath,
      logger: (m) => {
        if (onStatus) {
          if (m.status === "recognizing text") {
            onStatus(`正在中英双语文字识别 (${Math.round(m.progress * 100)}%)...`);
          } else if (m.status === "loading language traineddata") {
            onStatus(`正在加载本地语言模型 (${Math.round(m.progress * 100)}%)...`);
          }
        }
      }
    });
    this.worker = worker;
    return this.worker;
  }

  /**
   * Run OCR on a local image path or base64 data
   */
  public async runOcr(imageSource: string, onStatus?: (msg: string) => void): Promise<string> {
    try {
      const worker = await this.getOrBuildWorker("chi_sim+eng", onStatus);

      if (onStatus) onStatus("正在进行中英双语文字识别...");
      const { data: { text } } = await worker.recognize(imageSource);
      
      this.resetIdleTimer(); // Reset idle reclaimer on successful task completion
      return text;
    } catch (e: any) {
      this.terminateWorker(); // Force kill on error to be safe
      throw new Error(`极速 OCR 推理异常: ${e.message}`);
    }
  }

  /**
   * Reset the idle reclaimer countdown
   */
  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(() => {
      this.terminateWorker();
    }, TesseractOcrService.IDLE_TIMEOUT_MS);
  }

  /**
   * Terminate the background worker and reclaim 100% memory
   */
  public terminateWorker(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      console.log("[lti-ocr-service] 极速 OCR 线程已闲置关闭，成功回收内存");
    }
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /**
   * Destroy lifecycle for plugin unload
   */
  public destroy(): void {
    this.terminateWorker();
  }
}
