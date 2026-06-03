// Local Multimodal Vision & Smart Routing Service.
// Manages the lifecycle of the standalone local VLM Node.js child process,
// and implements 3-tier routing for OCR: PaddleOCR (primary) → Kreuzberg (fallback) → error.
// Image-semantic tasks (caption / detection) go directly to the Qwen2-VL child process.

import { App } from "obsidian";
import * as cp from "child_process";
import * as path from "path";
import * as fs from "fs";
import { KreuzbergOcrService } from "./kreuzberg-ocr-service";
import { PaddleOcrService } from "./paddle-ocr-service";
import { DEFAULT_PADDLE_TIER, getPaddleTierModelDir, type PaddleOcrModelTier } from "./paddle-ocr-types";

export class LocalOfflineVisionService {
  private app: App;
  private childProcess: cp.ChildProcess | null = null;
  private isReady = false;
  private initPromise: Promise<boolean> | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private settings: any;

  // OCR services — primary PaddleOCR + Kreuzberg (Rust) safety net.
  // Qwen2-VL is intentionally NOT in the OCR fallback chain; it's a semantic
  // model, not an OCR engine, and using it for OCR wastes 4GB of model memory
  // for a much worse result.
  private paddleOcrService: PaddleOcrService;
  private kreuzbergOcrService: KreuzbergOcrService;

  private static IDLE_TIMEOUT_MS = 180000; // 3 minutes of idle before killing the child process

  constructor(app: App, settings?: any) {
    this.app = app;
    this.settings = settings;

    const pluginDir = this.getPluginDir();

    // Resolve PaddleOCR tier from settings (default: server). The tier
    // determines the default model dir layout (under models/ocr/pp-ocrv5/<tier>/)
    // and is forwarded to PaddleOcrService so dictionary loading and any
    // tier-specific behavior is configured correctly.
    const paddleTier: PaddleOcrModelTier = this.settings?.paddleOcrTier ?? DEFAULT_PADDLE_TIER;

    // Resolve PaddleOCR model dir (configurable via settings.paddleOcrModelPath).
    // Custom path always wins; otherwise we honor the chosen tier's subdir.
    let paddleOcrDir = this.settings?.paddleOcrModelPath;
    if (!paddleOcrDir) {
      paddleOcrDir = path.join(pluginDir, getPaddleTierModelDir(paddleTier));
    } else if (!path.isAbsolute(paddleOcrDir)) {
      const adapter = this.app.vault.adapter as any;
      const vaultPath = adapter.getBasePath ? adapter.getBasePath() : "";
      paddleOcrDir = path.resolve(vaultPath, paddleOcrDir);
    }
    this.paddleOcrService = new PaddleOcrService(paddleOcrDir, {
      tier: paddleTier,
      detConfig: {
        dbThresh: this.settings.paddleDetDbThresh,
        dbBoxThresh: this.settings.paddleDetBoxThresh,
        unclipRatio: this.settings.paddleDetUnclipRatio,
        minSize: this.settings.paddleDetMinSize,
        nmsIouThresh: this.settings.paddleDetNmsIouThresh,
        maxCandidates: this.settings.paddleDetMaxCandidates,
        limitSideLen: this.settings.paddleDetLimitSideLen,
        scoreMode: this.settings.paddleDetScoreMode,
        useDilation: this.settings.paddleDetUseDilation,
      },
    });

    // Kreuzberg (Rust) fallback path: it ships its own Tesseract data inside
    // the precompiled binary, so the path is recorded but not actually
    // consulted at runtime. We still resolve it so the constructor matches
    // the previous TesseractOcrService contract and the setting still works
    // for users who configured a custom tessdata dir historically.
    let kreuzbergTessdataDir = this.settings?.tesseractDataPath;
    if (!kreuzbergTessdataDir) {
      kreuzbergTessdataDir = path.join(pluginDir, "models", "tessdata");
    } else if (!path.isAbsolute(kreuzbergTessdataDir)) {
      const adapter = this.app.vault.adapter as any;
      const vaultPath = adapter.getBasePath ? adapter.getBasePath() : "";
      kreuzbergTessdataDir = path.resolve(vaultPath, kreuzbergTessdataDir);
    }
    this.kreuzbergOcrService = new KreuzbergOcrService(kreuzbergTessdataDir);
  }

  /**
   * Get the absolute path of the plugin directory
   */
  private getPluginDir(): string {
    const adapter = this.app.vault.adapter as any;
    // Find the full system path of the vault and join with plugin path
    const vaultPath = adapter.getBasePath ? adapter.getBasePath() : "";
    const manifestDir = this.app.vault.configDir + "/plugins/link-tag-intelligence";
    return path.resolve(vaultPath, manifestDir);
  }

  /**
   * Lazily spawn and initialize the Node.js child process offline
   */
  private async getOrBuildWorker(onStatus?: (msg: string) => void): Promise<boolean> {
    this.resetIdleTimer();

    if (this.isReady && this.childProcess) {
      return true;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve) => {
      try {
        if (onStatus) onStatus("正在按需拉起离线多模态视觉子进程...");
        const pluginDir = this.getPluginDir();
        const workerPath = path.join(pluginDir, "vision-worker.js");

        if (!fs.existsSync(workerPath)) {
          throw new Error(`找不到编译后的推理文件: ${workerPath}`);
        }

        // Spawn independent Node.js process to keep UI and Electron renderer sandboxes clean
        this.childProcess = cp.spawn("node", [workerPath], {
          env: { ...process.env },
          detached: false,
        });

        // Set up communication piping
        let responseBuffer = "";
        this.childProcess.stdout?.on("data", (chunk: Buffer) => {
          responseBuffer += chunk.toString();
          if (responseBuffer.endsWith("\n")) {
            try {
              const lines = responseBuffer.trim().split("\n");
              for (const line of lines) {
                if (!line) continue;
                const response = JSON.parse(line);
                if (response.type === "ready") {
                  this.isReady = response.ok;
                  this.initPromise = null;
                  if (response.ok) {
                    if (onStatus) onStatus("离线多模态视觉引擎已就绪");
                    resolve(true);
                  } else {
                    console.error("[lti-vision-worker] Init failed:", response.error);
                    this.terminateProcess();
                    resolve(false);
                  }
                }
              }
            } catch (e) {
              console.error("[lti-vision-service] stdout parse error:", e);
            }
            responseBuffer = "";
          }
        });

        this.childProcess.stderr?.on("data", (chunk: Buffer) => {
          console.error("[lti-vision-worker-stderr]", chunk.toString().trim());
        });

        this.childProcess.on("exit", (code, signal) => {
          console.log(`[lti-vision-worker] Exited with code ${code} (signal: ${signal})`);
          this.isReady = false;
          this.childProcess = null;
          this.initPromise = null;
        });

        // Resolve model directory dynamically based on configured path
        let modelDir = this.settings?.visionModelPath;
        if (!modelDir) {
          modelDir = path.join(pluginDir, "models", "Qwen2-VL-2B-Instruct");
        } else {
          // If relative path, resolve it relative to vault root
          if (!path.isAbsolute(modelDir)) {
            const adapter = this.app.vault.adapter as any;
            const vaultPath = adapter.getBasePath ? adapter.getBasePath() : "";
            modelDir = path.resolve(vaultPath, modelDir);
          }
        }
        
        if (onStatus) onStatus(`正在从 ${path.basename(modelDir)} 加载本地中英双语视觉模型...`);
        this.childProcess.stdin?.write(JSON.stringify({
          type: "init",
          modelDir: modelDir,
        }) + "\n");

      } catch (err: any) {
        console.error("[lti-vision-service] Init error:", err);
        if (onStatus) onStatus(`视觉引擎拉起失败: ${err.message}`);
        this.terminateProcess();
        resolve(false);
      }
    });

    return this.initPromise;
  }

  /**
   * Main interface implementing 3-tier OCR routing + image-semantic dispatch.
   * <OCR>: PaddleOCR (primary) → Tesseract (fallback) → throw with both errors.
   * <DETAILED_CAPTION>/<MORE_DETAILED_CAPTION>/<OD>: Qwen2-VL child process.
   */
  public async processTask(
    imagePath: string,
    task: "<OCR>" | "<DETAILED_CAPTION>" | "<MORE_DETAILED_CAPTION>" | "<OD>",
    isSmartRoutingEnabled = true,
    onStatus?: (msg: string) => void
  ): Promise<string> {
    if (task === "<OCR>" && isSmartRoutingEnabled) {
      return this.runOcrWithFallback(imagePath, onStatus);
    }
    return this.runImageSemanticTask(imagePath, task, onStatus);
  }

  /**
   * 3-tier OCR routing with content-aware fallback:
   *   1. PaddleOCR (primary — high precision for Chinese, ~200ms/image on server tier)
   *   2. If PaddleOCR succeeds but the result is mostly Latin (>= LATIN_RATIO_TESSERACT_TRIGGER)
   *      AND the result is non-trivial (>= MIN_CHARS_FOR_RATIO_CHECK), re-run with Tesseract
   *      because the PP-OCRv5 mobile rec head is trained on Chinese and produces
   *      near-blank output for English-only images. The two results are then
   *      ranked by length (Tesseract wins for English, PaddleOCR wins for CJK).
   *   3. If PaddleOCR throws, fall through to Tesseract as a hard fallback.
   *   4. Throw combined error if both fail.
   *
   * This routing is opt-in via the `isSmartRoutingEnabled` flag (default true).
   * Setting it to false in runLocalVisionTask skips the Latin check and just
   * returns whatever PaddleOCR produced.
   */
  private async runOcrWithFallback(imagePath: string, onStatus?: (msg: string) => void): Promise<string> {
    // Tier 1: PaddleOCR
    let paddleResult = "";
    let paddleOk = false;
    try {
      if (onStatus) onStatus("正在使用 PaddleOCR 提取文字...");
      paddleResult = await this.paddleOcrService.runOcr(imagePath, onStatus);
      paddleOk = true;
    } catch (paddleErr: any) {
      this.lastPaddleError = paddleErr?.message ?? String(paddleErr);
      console.warn("[lti-vision-service] PaddleOCR 失败，回退到 Kreuzberg (Rust):", paddleErr);
      if (onStatus) onStatus("PaddleOCR 失败，自动回退到 Kreuzberg OCR...");
    }

    // Tier 2: Tesseract (used in two scenarios — hard fallback on paddle exception,
    // or as a challenger when paddle returned Latin-heavy content).
    let kreuzbergResult = "";
    let tessOk = false;
    if (!paddleOk) {
      try {
        kreuzbergResult = await this.kreuzbergOcrService.runOcr(imagePath, onStatus);
        tessOk = true;
      } catch (tessErr: any) {
        console.error("[lti-vision-service] Kreuzberg 也失败:", tessErr);
        throw new Error(
          `OCR 全部失败。PaddleOCR: ${this.lastPaddleError ?? "(unknown)"} | Kreuzberg: ${tessErr?.message ?? "(unknown)"}`
        );
      }
      return kreuzbergResult;
    }

    // PaddleOCR succeeded — decide whether to invoke Tesseract as a challenger.
    if (this.shouldRerunWithTesseract(paddleResult)) {
      if (onStatus) onStatus("检测到英文为主内容，调用 Kreuzberg (Rust) 取更优识别...");
      try {
        kreuzbergResult = await this.kreuzbergOcrService.runOcr(imagePath, onStatus);
        tessOk = true;
      } catch (tessErr: any) {
        console.warn("[lti-vision-service] Tesseract 挑战失败，仍采用 PaddleOCR 结果:", tessErr);
      }
    }

    if (tessOk) {
      // Pick the longer result. For pure Chinese PaddleOCR usually wins by a
      // small margin; for English Tesseract wins by 3-5×. Tie → PaddleOCR.
      return kreuzbergResult.length > paddleResult.length ? kreuzbergResult : paddleResult;
    }
    return paddleResult;
  }

  /**
   * Heuristic: should we re-run Tesseract on top of PaddleOCR?
   *
   * True when the recognized text is mostly Latin letters/digits/punctuation
   * AND long enough to be a real signal (>= MIN_CHARS_FOR_RATIO_CHECK). We
   * require both: short outputs (a single word, a stray symbol) would
   * always skew to 100% Latin and trigger a useless re-run.
   *
   * Verified empirically 2026-06-03 on the user's 工程经济学 第17版 英文版
   * PDF: PaddleOCR mobile produced 4440 chars (88% Latin) with mostly-blank
   * boxes; Tesseract produced 16433 chars (96% Latin) with full text.
   */
  private static readonly LATIN_RATIO_TESSERACT_TRIGGER = 0.6;
  private static readonly MIN_CHARS_FOR_RATIO_CHECK = 30;

  private shouldRerunWithTesseract(text: string): boolean {
    if (text.length < LocalOfflineVisionService.MIN_CHARS_FOR_RATIO_CHECK) return false;
    let latin = 0;
    let total = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      // Count only letters, digits, and common Latin punctuation as "Latin".
      // CJK characters (U+3000–U+9FFF, U+FF00–U+FFEF) are NOT counted as Latin.
      const isLatin = (
        (code >= 0x30 && code <= 0x39) || // 0-9
        (code >= 0x41 && code <= 0x5A) || // A-Z
        (code >= 0x61 && code <= 0x7A) || // a-z
        (code >= 0x20 && code <= 0x2F) || // space ! " # $ % & ' ( ) * + , - . /
        (code >= 0x3A && code <= 0x40) || // : ; < = > ? @
        (code >= 0x5B && code <= 0x60) || // [ \ ] ^ _ `
        (code >= 0x7B && code <= 0x7E)    // { | } ~
      );
      const isCjk = (code >= 0x3000 && code <= 0x9FFF) || (code >= 0xFF00 && code <= 0xFFEF);
      if (isLatin) latin++;
      if (isLatin || isCjk) total++;
    }
    if (total === 0) return false;
    const ratio = latin / total;
    return ratio >= LocalOfflineVisionService.LATIN_RATIO_TESSERACT_TRIGGER;
  }

  /**
   * Image-semantic tasks (caption / detection) — always go to the Qwen2-VL child process.
   */
  private async runImageSemanticTask(
    imagePath: string,
    task: "<DETAILED_CAPTION>" | "<MORE_DETAILED_CAPTION>" | "<OD>",
    onStatus?: (msg: string) => void
  ): Promise<string> {
    const ok = await this.getOrBuildWorker(onStatus);
    if (!ok || !this.childProcess) {
      throw new Error(
        "无法初始化本地离线视觉引擎，请检查模型文件是否已正确放置于 models/Qwen2-VL-2B-Instruct 目录或自定义的模型路径中"
      );
    }

    return new Promise((resolve, reject) => {
      this.resetIdleTimer();

      const stdoutHandler = (chunk: Buffer) => {
        try {
          const lines = chunk.toString().trim().split("\n");
          for (const line of lines) {
            if (!line) continue;
            const res = JSON.parse(line);
            if (res.type === "result") {
              this.childProcess?.stdout?.removeListener("data", stdoutHandler);
              this.resetIdleTimer();

              if (res.success) {
                resolve(res.text);
              } else {
                reject(new Error(res.error));
              }
            }
          }
        } catch (e) {
          // Keep buffer accumulating if JSON is fragmented
        }
      };

      this.childProcess?.stdout?.on("data", stdoutHandler);

      if (onStatus) onStatus("正在执行离线多模态大模型并行推理...");
      this.childProcess?.stdin?.write(JSON.stringify({
        type: "process",
        imagePath,
        task,
      }) + "\n");
    });
  }

  /**
   * Track the last PaddleOCR error so the combined error message can include it.
   * (Reading the field directly is simpler than threading it through two try blocks.)
   */
  private lastPaddleError: string | null = null;

  /**
   * Reset idle garbage collector countdown
   */
  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(() => {
      this.terminateProcess();
    }, LocalOfflineVisionService.IDLE_TIMEOUT_MS);
  }

  /**
   * Safe termination of the child process to reclaim 100% CPU and memory resources
   */
  public terminateProcess(): void {
    if (this.childProcess) {
      try {
        this.childProcess.stdin?.write(JSON.stringify({ type: "destroy" }) + "\n");
      } catch {
        this.childProcess.kill();
      }
      this.childProcess = null;
      this.isReady = false;
      this.initPromise = null;
      console.log("[lti-vision-service] 离线视觉大模型子进程已闲置杀死，完全释放内存");
    }
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /**
   * Plugin destruction lifecycle
   */
  public destroy(): void {
    this.terminateProcess();
    this.paddleOcrService.destroy();
    this.kreuzbergOcrService.destroy();
  }
}
