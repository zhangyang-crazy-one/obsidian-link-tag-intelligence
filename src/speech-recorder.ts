/* Minimal stub for SpeechRecorder — full implementation in Plan 01 */

export type RecorderPhase = "idle" | "initializing" | "recording" | "processing" | "error";

export interface RecorderSnapshot {
  phase: RecorderPhase;
  audioLevel: number;
  dbValue: number;
  errorKey?: string;
  asrReady?: boolean;
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

  destroy(): void {
    // Full impl in Plan 01: terminates Worker
  }
}
