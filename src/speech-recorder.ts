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
  modelReady?: boolean;  // whether model files exist on disk
}

export class SpeechRecorder {
  private phase: RecorderPhase = "idle";
  private audioLevel = 0;
  private capture: CaptureState | null = null;
  private errorKey: string | null = null;
  private deviceChangeHandler: (() => void) | null = null;
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private asrProcess: any = null;
  private asrStdin: { write: (d: string) => void } | null = null;
  private asrReady = false;
  private pendingLanguage: "zh" | "en" | null = null;
  private appRef: App | null = null;
  private settingsLanguage: "zh" | "en" = "zh";
  private settingsVadSensitivity = 2;

  /** Callback set by main.ts to receive ASR results. */
  onAsrResult: ((text: string, isEndpoint: boolean) => void) | null = null;

  /** Snapshot for UI rendering (toolbar button state, VU meter). */
  getSnapshot(): RecorderSnapshot {
    return {
      phase: this.phase,
      audioLevel: this.audioLevel,
      dbValue: this.phase === "recording" ? Math.max(rmsToDecibels(this.audioLevel), -60) : -Infinity,
      errorKey: this.phase === "error" ? (this.errorKey ?? undefined) : undefined,
      asrReady: this.asrReady
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
        const rms = calculateRMS(chunk);
        if (!this.throttleTimer) {
          this.throttleTimer = setTimeout(() => {
            this.throttleTimer = null;
            this.audioLevel = rms;
          }, 60);
        }
        // Send audio to ASR child process (skip near-silence)
        // AGC + noiseSuppression + echoCancellation are enabled at getUserMedia
        // level, so raw PCM is already clean enough for the ASR model.
        if (rms < 0.001) return;
        if (this.asrProcess && this.asrReady) {
          const b64 = Buffer.from(new Uint8Array(chunk.buffer)).toString("base64");
          this.asrStdin?.write(JSON.stringify({ type: "audio", bufferB64: b64 }) + "\n");
        }
      });

      // Register device disconnect listener (D-03)
      this.registerDeviceChangeHandler(t);

      // Fork ASR child process via shell exec (Electron sandbox blocks direct spawn).
      // Matches existing pattern in ingestion.ts which uses child_process.exec().
      if (!this.asrProcess) {
        const adapter = this.appRef?.vault.adapter;
        const basePath = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : "";
        const pluginDir = basePath + "/.obsidian/plugins/link-tag-intelligence";
        const workerPath = pluginDir + "/asr-worker.js";
        // console.log("[lti-speech] Starting ASR via exec:", workerPath);
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
          const cp = require("child_process") as {
            exec: (cmd: string, opts: { cwd?: string; maxBuffer?: number }, cb: (err: Error | null, stdout: string, stderr: string) => void) => { kill: () => void };
          };
          const cmd = `/usr/bin/node "${workerPath}"`;
          const child = cp.exec(cmd, { cwd: pluginDir, maxBuffer: 10 * 1024 * 1024 }, (_err, _stdout, _stderr) => {
            // stdout/stderr collected at process end — not suitable for streaming.
            // We use the child process object for stdin/stdout pipes instead.
          });
          this.asrProcess = child;
          this.asrStdin = { write: (d: string) => { child.stdin?.write(d); } };
          // console.log("[lti-speech] Spawned OK, pid:", child.pid ?? "unknown");

          let stdoutBuf = "";
          child.stdout?.on("data", (chunk: Buffer) => {
            const raw = chunk.toString();
            // console.log("[lti-speech] stdout:", raw.trim());
            stdoutBuf += raw;
            const lines = stdoutBuf.split("\n");
            stdoutBuf = lines.pop() ?? "";
            for (const line of lines) {
              try {
                const msg = JSON.parse(line) as { type: string; ok?: boolean; text?: string; isEndpoint?: boolean };
                if (msg.type === "ready") this.asrReady = !!msg.ok;
                else if (msg.type === "result") this.onAsrResult?.(msg.text ?? "", msg.isEndpoint ?? false);
              } catch { /* skip */ }
            }
          });
          child.stderr?.on("data", () => { /* muted */ });
          child.on("exit", (code: number | null) => {
            // console.log("[lti-speech] ASR worker exited, code:", code);
          });
        } catch (e) {
          console.error("[lti-speech] Exec failed:", String(e));
          throw new Error("ASR Worker init failed: " + String(e));
        }
      }

      // Initialize ASR recognizer in child process (send JSON via stdin)
      this.asrReady = false;
      this.pendingLanguage = this.settingsLanguage;
      // Hotwords file: optional domain-specific terms list in plugin dir
      const hotwordsFile = this.getHotwordsPath();
      const initMsg = JSON.stringify({
        type: "init",
        modelDir: this.getModelDir(),
        language: this.settingsLanguage,
        vadSensitivity: this.settingsVadSensitivity,
        ...(hotwordsFile ? { hotwordsFile } : {}),
      }) + "\n";
      this.asrStdin?.write(initMsg);

      // Wait for ready signal
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("ASR Worker init timed out")), 15000);
        const check = setInterval(() => {
          if (this.asrReady) { clearTimeout(timeout); clearInterval(check); resolve(); }
        }, 100);
      });

      this.phase = "recording";
      return null;
    } catch (error) {
      // D-05: ASR init failure transitions to error state
      this.phase = "error";
      this.cleanupCapture();
      if (this.asrProcess) {
        this.asrStdin?.write(JSON.stringify({ type: "destroy" }) + "\n");
        this.asrProcess.kill();
        this.asrProcess = null;
        this.asrStdin = null;
      }
      this.asrReady = false;

      // Map to ASR-specific error key if it was an engine init error
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

    // Reset recognizer state for next toggle
    if (this.asrProcess && this.asrReady) {
      this.asrStdin?.write(JSON.stringify({ type: "reset" }) + "\n");
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
    return pluginDir + "models/" + (lang === "zh" ? "zh-2025" : "en") + "/";
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
    if (this.asrProcess) {
      this.asrStdin?.write(JSON.stringify({ type: "destroy" }) + "\n");
      this.asrProcess.kill();
      this.asrProcess = null;
      this.asrStdin = null;
      this.asrReady = false;
    }
    this.removeDeviceChangeHandler();
    this.cleanupCapture();
    this.phase = "idle";
    this.errorKey = null;
  }

  /** D-10: Switch language by destroying current recognizer; rebuilt on next toggle. */
  setSettingsLanguage(lang: "zh" | "en"): void {
    if (lang === this.settingsLanguage) return;
    this.settingsLanguage = lang;
    // If not currently recording, destroy child process so next spawn uses new language
    if (!this.isActive && this.asrProcess) {
      this.asrStdin?.write(JSON.stringify({ type: "destroy" }) + "\n");
      this.asrProcess.kill();
      this.asrProcess = null;
      this.asrStdin = null;
      this.asrReady = false;
    }
  }

  setSettingsVadSensitivity(sensitivity: number): void {
    const clamped = Math.max(0, Math.min(3, Math.round(sensitivity)));
    this.settingsVadSensitivity = clamped;
  }

  private hotwordsPath: string | null = null;
  setHotwordsFile(path: string): void {
    this.hotwordsPath = path || null;
  }

  /** Resolve hotwords file path: user setting → default → null if none exists. */
  private getHotwordsPath(): string | null {
    let path: string | null = null;
    // User-configured path from settings
    if (this.hotwordsPath) {
      path = this.hotwordsPath;
    } else {
      // Default: plugin dir models/hotwords.txt
      const adapter = this.appRef?.vault.adapter;
      const basePath = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : "";
      if (basePath) path = basePath + "/.obsidian/plugins/link-tag-intelligence/models/hotwords.txt";
    }
    if (!path) return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      const fs = require("fs") as { existsSync: (p: string) => boolean };
      return fs.existsSync(path) ? path : null;
    } catch { return null; }
  }

  /** Expose model directory path for file checks by main.ts. */
  getModelDirInternal(language?: "zh" | "en"): string {
    const lang = language ?? this.settingsLanguage;
    const adapter = this.appRef?.vault.adapter;
    const basePath = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : "";
    const pluginDir = basePath + "/.obsidian/plugins/link-tag-intelligence/";
    return pluginDir + "models/" + (lang === "zh" ? "zh-2025" : "en") + "/";
  }
}
