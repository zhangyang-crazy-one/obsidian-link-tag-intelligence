import { FileSystemAdapter, Notice, type App } from "obsidian";
import { startCapture, stopCapture, calculateRMS, rmsToDecibels, type CaptureState } from "./speech-capture";
import { debugLog } from "./debug-log";

export type RecorderPhase = "idle" | "initializing" | "recording" | "processing" | "error";

export interface RecorderSnapshot {
  phase: RecorderPhase;
  audioLevel: number;   // 0.0 - 1.0 (RMS amplitude, for VU meter)
  dbValue: number;       // dBFS value for numeric display
  errorKey?: string;     // TranslationKey for error Notice
  asrReady?: boolean;    // whether ASR recognizer is initialized in Worker
}

export class SpeechRecorder {
  private phase: RecorderPhase = "idle";
  private audioLevel = 0;
  private capture: CaptureState | null = null;
  private errorKey: string | null = null;
  private deviceChangeHandler: (() => void) | null = null;
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;
  private worker: Worker | null = null;
  private workerReady = false;
  private pendingLanguage: "zh" | "en" | null = null;
  private appRef: App | null = null;
  private settingsLanguage: "zh" | "en" = "zh";
  private settingsVadSensitivity = 2;

  /** Callback set by main.ts to receive ASR results from Worker. */
  onAsrResult: ((text: string, isEndpoint: boolean) => void) | null = null;

  /** Snapshot for UI rendering (toolbar button state, VU meter). */
  getSnapshot(): RecorderSnapshot {
    return {
      phase: this.phase,
      audioLevel: this.audioLevel,
      dbValue: this.phase === "recording" ? rmsToDecibels(this.audioLevel) : -Infinity,
      errorKey: this.phase === "error" ? (this.errorKey ?? undefined) : undefined,
      asrReady: this.workerReady
    };
  }

  /** Whether a toggle is allowed (only from idle or recording). */
  canToggle(): boolean {
    return this.phase === "idle" || this.phase === "recording";
  }

  get isActive(): boolean {
    return this.phase === "initializing" || this.phase === "recording" || this.phase === "processing";
  }

  /**
   * Toggle recording start/stop. Returns the Notice message key for errors,
   * or null on success.
   */
  async toggle(t: (key: string, vars?: Record<string, string | number>) => string): Promise<string | null> {
    if (this.phase === "idle") {
      return this.start(t);
    }
    if (this.phase === "recording") {
      return this.stop();
    }
    // initializing, processing, error — ignore toggle
    return null;
  }

  /** Acknowledge error state and return to idle (D-02). */
  acknowledgeError(): void {
    if (this.phase === "error") {
      this.phase = "idle";
      this.errorKey = null;
    }
  }

  /**
   * Force-stop recording (used for device disconnect — D-03, and onunload cleanup).
   * Does not transition through processing — goes directly to idle.
   */
  forceStop(): void {
    if (this.phase === "initializing" || this.phase === "recording") {
      this.cleanupCapture();
      this.phase = "idle";
    }
  }

  private async start(t: (key: string, vars?: Record<string, string | number>) => string): Promise<string | null> {
    this.phase = "initializing";

    try {
      this.capture = await startCapture((chunk) => {
        // Throttled RMS update: ~60ms (16fps) for visual stability
        if (!this.throttleTimer) {
          this.throttleTimer = setTimeout(() => {
            this.throttleTimer = null;
            this.audioLevel = calculateRMS(chunk);
          }, 60);
        }
        // D-04: Route audio chunk to Worker via ArrayBuffer transfer (zero-copy)
        if (this.worker && this.workerReady) {
          this.worker.postMessage(
            { type: "audio", buffer: chunk.buffer },
            [chunk.buffer]
          );
        }
      });

      // Register device disconnect listener (D-03)
      this.registerDeviceChangeHandler(t);

      // D-01: Create Worker lazily on first toggle
      if (!this.worker) {
        const adapter = this.appRef?.vault.adapter;
        const basePath = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : "";
        const pluginDir = basePath + "/.obsidian/plugins/link-tag-intelligence/";
        const workerPath = pluginDir + "speech-worker.js";
        this.worker = new Worker(workerPath);
        this.worker.onmessage = this.handleWorkerMessage.bind(this);
        this.worker.onerror = (event) => {
          if (this.appRef) {
            debugLog(this.appRef, "speech-recorder.worker-error", { message: event.message });
          }
          this.phase = "error";
          this.errorKey = "speechAsrInitFailed";
          this.workerReady = false;
        };
      }

      // Initialize ASR recognizer in Worker
      this.workerReady = false;
      this.pendingLanguage = this.settingsLanguage;
      this.worker.postMessage({
        type: "init",
        modelDir: this.getModelDir(),
        language: this.settingsLanguage,
        vadSensitivity: this.settingsVadSensitivity,
      });

      // Wait for Worker ready signal with timeout
      await this.waitForWorkerReady(10000);

      this.phase = "recording";
      return null;
    } catch (error) {
      // D-05: ASR init failure transitions to error state
      this.phase = "error";
      this.cleanupCapture();
      if (this.worker) {
        this.worker.terminate();
        this.worker = null;
      }
      this.workerReady = false;

      // Map to ASR-specific error key if it was a Worker timeout/error
      // Otherwise fall through to standard microphone error mapping
      if (error instanceof Error && error.message.includes("ASR Worker")) {
        this.errorKey = "speechAsrInitFailed";
        if (this.appRef) {
          debugLog(this.appRef, "speech-recorder.asr-init-failed", { error: String(error) });
        }
        return "speechAsrInitFailed";
      }

      // Map error types to specific i18n keys (D-02)
      if (error instanceof DOMException) {
        if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
          this.errorKey = "speechMicPermissionDenied";
          return "speechMicPermissionDenied";
        }
        if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
          this.errorKey = "speechMicNotFound";
          return "speechMicNotFound";
        }
      }
      this.errorKey = "speechAudioContextFailed";
      return "speechAudioContextFailed";
    }
  }

  private async stop(): Promise<null> {
    this.phase = "processing";

    this.removeDeviceChangeHandler();

    // Send destroy to Worker (frees WASM memory per RESEARCH Pitfall 5)
    if (this.worker && this.workerReady) {
      this.worker.postMessage({ type: "destroy" });
      this.workerReady = false;
      // Don't terminate the Worker — reuse for next toggle
    }

    this.cleanupCapture();
    this.phase = "idle";
    return null;
  }

  private cleanupCapture(): void {
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
    this.audioLevel = 0;
    if (this.capture) {
      stopCapture(this.capture);
      this.capture = null;
    }
  }

  /** Monitor device disconnect during recording (D-03). */
  private registerDeviceChangeHandler(t: (key: string, vars?: Record<string, string | number>) => string): void {
    if (typeof navigator?.mediaDevices?.addEventListener !== "function") {
      return;
    }

    const handler = async (): Promise<void> => {
      if (this.phase !== "recording") {
        return;
      }

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasAudioInput = devices.some((device) => device.kind === "audioinput");

        if (!hasAudioInput) {
          this.phase = "error";
          this.errorKey = "speechMicDisconnected";
          this.cleanupCapture();
          this.removeDeviceChangeHandler();
          new Notice(t("speechMicDisconnected"));
        }
      } catch {
        // enumerateDevices may fail if permissions context is lost;
        // treat as device loss
        if (this.phase === "recording") {
          this.phase = "error";
          this.errorKey = "speechMicDisconnected";
          this.cleanupCapture();
          this.removeDeviceChangeHandler();
          new Notice(t("speechMicDisconnected"));
        }
      }
    };

    this.deviceChangeHandler = handler;
    navigator.mediaDevices.addEventListener("devicechange", handler);
  }

  private removeDeviceChangeHandler(): void {
    if (this.deviceChangeHandler && typeof navigator?.mediaDevices?.removeEventListener === "function") {
      navigator.mediaDevices.removeEventListener("devicechange", this.deviceChangeHandler);
    }
    this.deviceChangeHandler = null;
  }

  /** Set the Obsidian App reference for path resolution. Called once from main.ts onload. */
  setApp(app: App): void {
    this.appRef = app;
  }

  /** Resolve the absolute model directory path. */
  private getModelDir(): string {
    const adapter = this.appRef?.vault.adapter;
    const basePath = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : "";
    const pluginDir = basePath + "/.obsidian/plugins/link-tag-intelligence/";
    const lang = this.pendingLanguage ?? "zh";
    return pluginDir + "models/" + (lang === "zh" ? "zh-14M" : "en") + "/";
  }

  /** Handle messages from the ASR Worker thread. */
  private handleWorkerMessage(event: MessageEvent): void {
    const msg = event.data as { type: string; text?: string; isEndpoint?: boolean };
    switch (msg.type) {
      case "ready":
        this.workerReady = true;
        if (this.appRef) {
          debugLog(this.appRef, "speech-recorder.worker-ready", {});
        }
        break;
      case "result":
        // D-06/D-09: Sentence boundary handling happens in main.ts (Plan 02)
        this.onAsrResult?.(msg.text ?? "", msg.isEndpoint ?? false);
        break;
      case "destroyed":
        if (this.appRef) {
          debugLog(this.appRef, "speech-recorder.worker-destroyed", {});
        }
        break;
    }
  }

  /** Wait for Worker to signal ready with timeout. */
  private waitForWorkerReady(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("ASR Worker init timed out after " + timeoutMs + "ms"));
      }, timeoutMs);
      const checkInterval = setInterval(() => {
        if (this.workerReady) {
          clearTimeout(timeout);
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }

  /** D-10: Switch language by destroying current recognizer; rebuilt on next toggle. */
  setLanguage(lang: "zh" | "en"): void {
    this.pendingLanguage = lang;
    if (this.workerReady && this.worker) {
      this.worker.postMessage({ type: "destroy" });
      this.workerReady = false;
    }
  }

  /** Sync settings language to SpeechRecorder (called from main.ts saveSettings). */
  setSettingsLanguage(lang: "zh" | "en"): void {
    if (this.settingsLanguage !== lang) {
      this.settingsLanguage = lang;
      this.setLanguage(lang);
    }
  }

  /** Sync VAD sensitivity setting (0-3). */
  setSettingsVadSensitivity(sensitivity: number): void {
    this.settingsVadSensitivity = Math.max(0, Math.min(3, Math.round(sensitivity)));
  }

  /** Full cleanup for plugin onunload(). */
  destroy(): void {
    if (this.worker) {
      if (this.workerReady) {
        this.worker.postMessage({ type: "destroy" });
      }
      this.worker.terminate();
      this.worker = null;
      this.workerReady = false;
    }
    this.removeDeviceChangeHandler();
    this.cleanupCapture();
    this.phase = "idle";
    this.errorKey = null;
  }
}
