import { Notice } from "obsidian";
import { startCapture, stopCapture, calculateRMS, rmsToDecibels, type CaptureState } from "./speech-capture";

export type RecorderPhase = "idle" | "initializing" | "recording" | "processing" | "error";

export interface RecorderSnapshot {
  phase: RecorderPhase;
  audioLevel: number;   // 0.0 - 1.0 (RMS amplitude, for VU meter)
  dbValue: number;       // dBFS value for numeric display
  errorKey?: string;     // TranslationKey for error Notice
}

export class SpeechRecorder {
  private phase: RecorderPhase = "idle";
  private audioLevel = 0;
  private capture: CaptureState | null = null;
  private errorKey: string | null = null;
  private deviceChangeHandler: (() => void) | null = null;
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;

  /** Snapshot for UI rendering (toolbar button state, VU meter). */
  getSnapshot(): RecorderSnapshot {
    return {
      phase: this.phase,
      audioLevel: this.audioLevel,
      dbValue: this.phase === "recording" ? rmsToDecibels(this.audioLevel) : -Infinity,
      errorKey: this.phase === "error" ? (this.errorKey ?? undefined) : undefined
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
        if (this.throttleTimer) {
          return;
        }
        this.throttleTimer = setTimeout(() => {
          this.throttleTimer = null;
          this.audioLevel = calculateRMS(chunk);
        }, 60);
      });

      // Register device disconnect listener (D-03)
      this.registerDeviceChangeHandler(t);
      this.phase = "recording";
      return null;
    } catch (error) {
      this.phase = "error";
      this.cleanupCapture();

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

  /** Full cleanup for plugin onunload(). */
  destroy(): void {
    this.removeDeviceChangeHandler();
    this.cleanupCapture();
    this.phase = "idle";
    this.errorKey = null;
  }
}
