// Local Multimodal Vision & Smart Routing Service.
// Manages the lifecycle of the standalone local VLM Node.js child process,
// and implements 3-tier routing for OCR: PaddleOCR (primary) → Tesseract (fallback) → error.
// Image-semantic tasks (caption / detection) go directly to the Qwen2-VL child process.

import { App } from "obsidian";
import * as cp from "child_process";
import * as path from "path";
import * as fs from "fs";
import { TesseractOcrService } from "./tesseract-ocr-service";
import { PaddleOcrService } from "./paddle-ocr-service";
import { PADDLE_DEFAULT_MODEL_DIR } from "./paddle-ocr-types";

export class LocalOfflineVisionService {
  private app: App;
  private childProcess: cp.ChildProcess | null = null;
  private isReady = false;
  private initPromise: Promise<boolean> | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private settings: any;

  // OCR services — primary PaddleOCR + Tesseract safety net.
  // Qwen2-VL is intentionally NOT in the OCR fallback chain; it's a semantic
  // model, not an OCR engine, and using it for OCR wastes 4GB of model memory
  // for a much worse result.
  private paddleOcrService: PaddleOcrService;
  private tesseractOcrService: TesseractOcrService;

  private static IDLE_TIMEOUT_MS = 180000; // 3 minutes of idle before killing the child process

  constructor(app: App, settings?: any) {
    this.app = app;
    this.settings = settings;

    const pluginDir = this.getPluginDir();

    // Resolve PaddleOCR model dir (configurable via settings.paddleOcrModelPath).
    let paddleOcrDir = this.settings?.paddleOcrModelPath;
    if (!paddleOcrDir) {
      paddleOcrDir = path.join(pluginDir, PADDLE_DEFAULT_MODEL_DIR);
    } else if (!path.isAbsolute(paddleOcrDir)) {
      const adapter = this.app.vault.adapter as any;
      const vaultPath = adapter.getBasePath ? adapter.getBasePath() : "";
      paddleOcrDir = path.resolve(vaultPath, paddleOcrDir);
    }
    this.paddleOcrService = new PaddleOcrService(paddleOcrDir, {
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

    // Tesseract tessdata path (configurable via settings.tesseractDataPath, default models/tessdata).
    let tesseractDir = this.settings?.tesseractDataPath;
    if (!tesseractDir) {
      tesseractDir = path.join(pluginDir, "models", "tessdata");
    } else if (!path.isAbsolute(tesseractDir)) {
      const adapter = this.app.vault.adapter as any;
      const vaultPath = adapter.getBasePath ? adapter.getBasePath() : "";
      tesseractDir = path.resolve(vaultPath, tesseractDir);
    }
    this.tesseractOcrService = new TesseractOcrService(tesseractDir);
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
   * 3-tier OCR routing:
   *   1. PaddleOCR (primary — high precision, ~30MB model, 200-400ms/image)
   *   2. Tesseract (fallback — broader language coverage, WASM worker)
   *   3. Throw combined error if both fail
   */
  private async runOcrWithFallback(imagePath: string, onStatus?: (msg: string) => void): Promise<string> {
    // Tier 1: PaddleOCR
    try {
      if (onStatus) onStatus("正在使用 PaddleOCR 提取文字...");
      return await this.paddleOcrService.runOcr(imagePath, onStatus);
    } catch (paddleErr: any) {
      this.lastPaddleError = paddleErr?.message ?? String(paddleErr);
      console.warn("[lti-vision-service] PaddleOCR 失败，回退到 Tesseract:", paddleErr);
      if (onStatus) onStatus("PaddleOCR 失败，自动回退到 Tesseract OCR...");
    }

    // Tier 2: Tesseract (safety net)
    try {
      return await this.tesseractOcrService.runOcr(imagePath, onStatus);
    } catch (tessErr: any) {
      console.error("[lti-vision-service] Tesseract 也失败:", tessErr);
      throw new Error(
        `OCR 全部失败。PaddleOCR: ${this.lastPaddleError ?? "(unknown)"} | Tesseract: ${tessErr?.message ?? "(unknown)"}`
      );
    }
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
    this.tesseractOcrService.destroy();
  }
}
