/* Minimal stub for SpeechRecorder — full implementation in Plan 01 */

export type RecorderPhase = "idle" | "initializing" | "recording" | "processing" | "error";

export interface RecorderSnapshot {
  phase: RecorderPhase;
  audioLevel: number;   // 0.0 - 1.0 (RMS amplitude, for VU meter)
  dbValue: number;       // dBFS value for numeric display
  errorKey?: string;     // TranslationKey for error Notice
  asrReady?: boolean;    // whether ASR recognizer is initialized in Worker
  modelReady?: boolean;  // whether model files exist on disk (regardless of WASM loaded)
}

export class SpeechRecorder {
  onAsrResult: ((text: string, isEndpoint: boolean) => void) | null = null;

  getSnapshot(): RecorderSnapshot {
    return { phase: "idle", audioLevel: 0, dbValue: -Infinity };
  }

  setSettingsLanguage(_lang: "zh" | "en"): void {
    // Full impl in Plan 01: destroy worker, set language, rebuild on next toggle
  }

  setSettingsVadSensitivity(_sensitivity: number): void {
    // Full impl in Plan 01: propagated to Worker init config
  }

  canToggle(): boolean {
    return true; // Full impl in Plan 01: checks Worker state
  }

  get isActive(): boolean {
    return false; // Full impl in Plan 01: checks recording state
  }

  async toggle(_t: (key: string, vars?: Record<string, string | number>) => string): Promise<string | null> {
    return null; // Full impl in Plan 01: starts/stops recording via Worker
  }

  forceStop(): void {
    // Full impl in Plan 01: sends stop message to Worker
  }

  acknowledgeError(): void {
    // Full impl in Plan 01: resets error state
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

  /** Resolve the absolute model directory path for the pending language. */
  private getModelDir(): string {
    const adapter = this.appRef?.vault.adapter;
    const basePath = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : "";
    const pluginDir = basePath + "/.obsidian/plugins/link-tag-intelligence/";
    const lang = this.pendingLanguage ?? "zh";
    return pluginDir + "models/" + (lang === "zh" ? "zh-14M" : "en") + "/";
  }

  /**
   * Resolve the absolute model directory path for a given language.
   * Exposed for main.ts to check file existence and orchestrate downloads.
   */
  getModelDirInternal(language?: "zh" | "en"): string {
    const adapter = this.appRef?.vault.adapter;
    const basePath = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : "";
    const pluginDir = basePath + "/.obsidian/plugins/link-tag-intelligence/";
    const lang = language ?? this.settingsLanguage;
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
    // Full impl in Plan 01: terminates Worker
  }
}
