// Local Multimodal Vision & Smart Routing Service.
// Manages the lifecycle of the standalone local VLM Node.js child process,
// and implements 3-tier routing for OCR: PaddleOCR (primary) → Kreuzberg (fallback) → error.
// Image-semantic tasks (caption / detection) go directly to the Qwen2-VL child process.

import { App } from "obsidian";
import * as cp from "child_process";
import * as path from "path";
import * as fs from "fs";
import { KreuzbergOcrService } from "./kreuzberg-ocr-service";
import { withHeavyInit } from "./heavy-init-mutex";
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

  // ---------------------------------------------------------------------------
  // Lifecycle / respawn state (added 2026-06-03 — see plan
  // ~/.claude/plans/misty-kindling-crane.md and
  // planning/research/vlm-2026-notebooklm-20260603.md).
  //
  // The motivation is onnxruntime-node's three known crash modes
  // (autoregressive malloc, multi-worker concurrency, Session load/release
  // leak) — none of which the Qwen2-VL model itself can avoid. The fix is
  // a Sidecar-restart architecture: kill the child cleanly, respawn it.
  // ---------------------------------------------------------------------------

  /**
   * If a `processTask` is in flight when the child exits unexpectedly, the
   * awaiter would hang forever (the original code resolved the promise only
   * on a `result` message, and there'd never be one if the child is gone).
   * We stash the reject function here so the exit handler can release it.
   */
  private pendingRequestReject: ((err: Error) => void) | null = null;

  /**
   * Set by `terminateProcess` so the eventual `exit` event classifies as
   * "graceful" (not "init-failed" or "unexpected"). Prevents a respawn
   * race when the user explicitly idles out the worker.
   */
  private terminating = false;

  /**
   * Rolling window of recent RSS reports from the child. Used to detect the
   * gradual onnxruntime-node Session leak (Issue #22271: 325MB → 9.12GB
   * over 100 cycles) and trigger a proactive respawn before OOM.
   */
  private memoryWindow: { at: number; rss: number }[] = [];
  private static readonly MEMORY_WINDOW_SIZE = 3;
  private static readonly MEMORY_PRESSURE_BYTES = 6 * 1024 * 1024 * 1024; // 6 GB

  /**
   * Respawn budget. If the worker dies too often in a short window, the
   * parent stops auto-respawning and surfaces a persistent Notice — silent
   * thrash is worse than a loud failure.
   */
  private respawnState: {
    count: number;
    firstFailureAt: number;
    lastFailureAt: number;
    failedPermanently: boolean;
  } = { count: 0, firstFailureAt: 0, lastFailureAt: 0, failedPermanently: false };
  private static readonly RESPAWN_WINDOW_MS = 60_000;
  private static readonly RESPAWN_MAX_IN_WINDOW = 3;
  private static readonly RESPAWN_HARD_STOP_COUNT = 6;
  private static readonly RESPAWN_BACKOFF_BASE_MS = 1_000;
  private static readonly RESPAWN_BACKOFF_MAX_MS = 30_000;

  private readonly onRespawnFailed?: (err: Error) => void;

  constructor(app: App, settings?: any, options?: { onRespawnFailed?: (err: Error) => void }) {
    this.app = app;
    this.settings = settings;
    this.onRespawnFailed = options?.onRespawnFailed;

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
   * Lazily spawn and initialize the Node.js child process offline.
   *
   * Wrapped in the heavy-init mutex so a concurrent speech-model
   * download or PaddleOCR download doesn't compete for disk + CPU at
   * the same instant. The spawn itself is a quick fork+exec, but the
   * child then takes 5-30s to load the 4.3GB Qwen2-VL weights — the
   * mutex guarantees that nothing else is touching disk during that
   * window.
   */
  private async getOrBuildWorker(onStatus?: (msg: string) => void): Promise<boolean> {
    this.resetIdleTimer();
    if (this.isReady && this.childProcess) {
      return true;
    }
    if (this.initPromise) {
      return this.initPromise;
    }
    this.initPromise = withHeavyInit("vlm-spawn", () => this.buildWorker(onStatus));
    return this.initPromise;
  }

  private buildWorker(onStatus?: (msg: string) => void): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        if (onStatus) onStatus("正在按需拉起离线多模态视觉子进程...");
        const pluginDir = this.getPluginDir();
        const workerPath = path.join(pluginDir, "vision-worker.cjs");

        if (!fs.existsSync(workerPath)) {
          throw new Error(`找不到编译后的推理文件: ${workerPath}`);
        }

        // Spawn independent Node.js process to keep UI and Electron renderer sandboxes clean.
        // - detached: !isWindows enables process-group kill (process.kill(-pid, ...))
        // - shell: !isWindows mirrors ai-service.ts:57 for proper PATH resolution
        // - cwd: pluginDir ensures model-relative paths resolve the same in dev vs. dist
        const isWindows = process.platform === "win32";
        this.childProcess = cp.spawn("node", [workerPath], {
          env: { ...process.env },
          detached: !isWindows,
          cwd: pluginDir,
          shell: !isWindows,
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

        // Mirror speech-recorder.ts:170-177: without an `error` listener a
        // synchronous spawn failure (ENOENT, EACCES) leaves the parent
        // awaiting forever — the `exit` event never fires in that case.
        this.childProcess.on("error", (err) => {
          console.error("[lti-vision-worker] spawn error:", err.message);
          this.terminateProcess();
        });

        this.childProcess.on("exit", (code, signal) => {
          console.log(`[lti-vision-worker] Exited with code ${code} (signal: ${signal})`);

          // Release any in-flight request that will never see its result.
          // Without this, a mid-inference crash hangs the awaiter in
          // main.ts until the plugin is reloaded.
          if (this.pendingRequestReject) {
            const reject = this.pendingRequestReject;
            this.pendingRequestReject = null;
            reject(
              new Error(
                `Vision worker exited unexpectedly (code=${code}, signal=${signal})`
              )
            );
          }

          const wasTerminating = this.terminating;
          const wasReady = this.isReady;
          this.terminating = false;
          this.isReady = false;
          this.childProcess = null;
          this.initPromise = null;

          // Single chokepoint for any worker exit. Decides whether the
          // respawn policy kicks in and how to categorize the cause.
          let reason: "init-failed" | "unexpected" | "graceful";
          if (wasTerminating) {
            reason = "graceful";
          } else if (!wasReady) {
            reason = "init-failed";
          } else if (
            code === 0 ||
            signal === "SIGTERM" ||
            signal === "SIGKILL" ||
            signal === "SIGINT"
          ) {
            reason = "graceful";
          } else {
            reason = "unexpected";
          }
          this.onWorkerExit(reason, code, signal);
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
          // Pass the user's pixel cap through to the worker. The worker
          // mutates its image_processor.max_pixels to this value before
          // each inference (default 200_704; see settings.ts comment).
          // Qwen2VLProcessor._call ignores runtime args, so the worker
          // has to mutate the inner image_processor's field directly.
          maxPixels: this.settings?.visionMaxPixels ?? 200_704,
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

      // Stash the reject so the child-process `exit` handler can release
      // us if the worker dies mid-inference. Without this, a crash during
      // `process` leaves the caller hanging until the plugin is reloaded.
      this.pendingRequestReject = reject;

      const stdoutHandler = (chunk: Buffer) => {
        try {
          const lines = chunk.toString().trim().split("\n");
          for (const line of lines) {
            if (!line) continue;
            const res = JSON.parse(line);
            if (res.type === "result") {
              this.childProcess?.stdout?.removeListener("data", stdoutHandler);
              this.pendingRequestReject = null;
              this.resetIdleTimer();

              if (res.success) {
                resolve(res.text);
              } else {
                reject(new Error(res.error));
              }
            } else if (res.type === "memory") {
              // Track RSS for the leak-driven proactive respawn. Silent
              // here — the parent doesn't act on every report, just
              // appends to the rolling window.
              this.recordMemoryReport(res.rss);
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
   * Safe termination of the child process with SIGTERM→SIGKILL escalation.
   *
   * Mirrors the canonical pattern in speech-recorder.ts:455-487. The old
   * single-shot `child.kill()` left a window where the worker could be
   * mid-inference, ignore SIGTERM, and keep leaking memory.
   *
   * Stages:
   *   1. Send graceful `{type:"destroy"}` message + close stdin (EOF).
   *   2. After 500ms with no exit, SIGTERM via process group (POSIX) with
   *      `child.kill("SIGTERM")` fallback for non-detached / Windows.
   *   3. After another 500ms with no exit, SIGKILL via the same pattern.
   *   4. Both timers `.unref?.()` so they don't keep the Node loop alive
   *      during plugin unload.
   */
  public terminateProcess(): void {
    const child = this.childProcess;
    if (!child) {
      if (this.idleTimer) {
        clearTimeout(this.idleTimer);
        this.idleTimer = null;
      }
      return;
    }

    // Mark before clearing so the eventual `exit` handler classifies this
    // as "graceful" (not "init-failed" or "unexpected") and the respawn
    // policy stays dormant.
    this.terminating = true;
    // Detach the field so re-entrant calls (or `getOrBuildWorker` racing
    // in before the old child actually exits) don't double-act on the
    // same process. The exit handler will null the field again when the
    // old child actually exits.
    this.childProcess = null;
    this.initPromise = null;

    try {
      child.stdin?.write(JSON.stringify({ type: "destroy" }) + "\n");
      child.stdin?.end();
    } catch {
      /* pipe may already be closed; SIGTERM escalation will catch it */
    }

    const pid = child.pid;
    const sigtermTimer = setTimeout(() => {
      if (!pid || child.killed || child.exitCode !== null || child.signalCode !== null) return;
      try { process.kill(-pid, "SIGTERM"); }
      catch { try { child.kill("SIGTERM"); } catch { /* already dead */ } }
      const sigkillTimer = setTimeout(() => {
        if (child.killed || child.exitCode !== null || child.signalCode !== null) return;
        try { process.kill(-pid, "SIGKILL"); }
        catch { try { child.kill("SIGKILL"); } catch { /* already dead */ } }
      }, 500);
      sigkillTimer.unref?.();
    }, 500);
    sigtermTimer.unref?.();

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    console.log("[lti-vision-service] 离线视觉大模型子进程已闲置杀死，完全释放内存");
  }

  // ---------------------------------------------------------------------------
  // Respawn policy & memory tracking (2026-06-03)
  // ---------------------------------------------------------------------------

  /**
   * Single chokepoint for any worker exit. Decides whether to:
   *   - Respawn immediately (next `getOrBuildWorker` will rebuild)
   *   - Back off and retry (transient failures)
   *   - Give up and surface a persistent Notice to the user
   *
   * Called from the `exit` handler. Must be cheap and synchronous — actual
   * respawn work is deferred to the next `getOrBuildWorker` call so the
   * heavy-init mutex can serialize against concurrent operations.
   */
  private onWorkerExit(
    reason: "init-failed" | "unexpected" | "graceful",
    code: number | null,
    signal: NodeJS.Signals | null
  ): void {
    if (reason === "graceful") {
      // Reset the failure budget — a clean shutdown should clear any
      // accumulated thrash signal from prior crashes.
      this.respawnState.count = 0;
      this.respawnState.firstFailureAt = 0;
      this.respawnState.lastFailureAt = 0;
      this.respawnState.failedPermanently = false;
      this.memoryWindow = [];
      return;
    }

    const now = Date.now();
    const state = this.respawnState;

    // Reset the rolling window if the last failure was outside it.
    if (state.firstFailureAt === 0 || now - state.firstFailureAt > LocalOfflineVisionService.RESPAWN_WINDOW_MS) {
      state.count = 0;
      state.firstFailureAt = now;
      state.failedPermanently = false;
    }
    state.count += 1;
    state.lastFailureAt = now;

    console.warn(
      `[lti-vision-service] Worker exit (${reason}, code=${code}, signal=${signal}); ` +
      `failure ${state.count} in window of ${LocalOfflineVisionService.RESPAWN_WINDOW_MS}ms`
    );

    if (state.count >= LocalOfflineVisionService.RESPAWN_HARD_STOP_COUNT) {
      // Hard stop: persistent failure. Stop auto-respawning and surface to
      // the user. `failedPermanently` blocks future auto-respawn until the
      // plugin is reloaded (which resets state).
      if (!state.failedPermanently) {
        state.failedPermanently = true;
        const err = new Error(
          `Vision worker failed ${state.count} times within ${LocalOfflineVisionService.RESPAWN_WINDOW_MS / 1000}s ` +
          `(last: ${reason}, code=${code}, signal=${signal})`
        );
        this.onRespawnFailed?.(err);
      }
    }
  }

  /**
   * Record a `memory` report from the child. Maintains a rolling window of
   * the most recent N reports. If the window shows monotonically rising
   * RSS AND the latest exceeds the pressure threshold, trigger a
   * graceful respawn.
   */
  private recordMemoryReport(rss: number): void {
    if (this.respawnState.failedPermanently) return;
    this.memoryWindow.push({ at: Date.now(), rss });
    if (this.memoryWindow.length > LocalOfflineVisionService.MEMORY_WINDOW_SIZE) {
      this.memoryWindow.shift();
    }
    if (this.isMemoryPressure()) {
      console.warn(
        `[lti-vision-service] RSS pressure detected: latest=${rss}B ` +
        `>= ${LocalOfflineVisionService.MEMORY_PRESSURE_BYTES}B threshold; ` +
        `scheduling graceful respawn`
      );
      this.terminateProcess();
      this.memoryWindow = [];
    }
  }

  /**
   * True when the memory window is monotonically rising AND the latest
   * RSS exceeds the pressure threshold. Catches the onnxruntime-node
   * Session leak (Issue #22271: 325MB → 9.12GB over 100 cycles) before
   * the worker OOMs the system.
   */
  private isMemoryPressure(): boolean {
    if (this.memoryWindow.length < LocalOfflineVisionService.MEMORY_WINDOW_SIZE) return false;
    const latest = this.memoryWindow[this.memoryWindow.length - 1].rss;
    if (latest < LocalOfflineVisionService.MEMORY_PRESSURE_BYTES) return false;
    for (let i = 1; i < this.memoryWindow.length; i++) {
      if (this.memoryWindow[i].rss <= this.memoryWindow[i - 1].rss) return false;
    }
    return true;
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
