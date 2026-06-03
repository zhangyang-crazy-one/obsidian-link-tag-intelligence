// Heavy-init mutex — serializes model downloads and child-process spawns
// so audio (sherpa-onnx), OCR (PaddleOCR / Kreuzberg), and VLM
// (LFM2.5-VL-450M via child process) never compete for CPU/disk/RAM
// at the same time.
//
// Each heavy operation wraps itself in withHeavyInit("name", fn).
// The mutex queue runs operations one at a time, FIFO. A second
// operation started while one is in flight waits until the first
// completes (or its own AbortSignal aborts).
//
// Verified 2026-06-03 against the failure mode where a user recording
// audio, OCRing an image, and asking for an image caption in quick
// succession caused all three models to download + load concurrently,
// peaking at 1.5+GB RSS spikes. Serializing them caps the peak at
// whichever single model is the largest (~1GB for LFM2.5-VL-450M).

type HeavyInitTask = () => Promise<unknown>;

interface PendingEntry {
  name: string;
  task: HeavyInitTask;
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
  startedAt: number;
}

export class HeavyInitMutex {
  private queue: PendingEntry[] = [];
  private running: PendingEntry | null = null;

  /**
   * Schedule a heavy operation. Returns a promise that resolves with
   * the operation's result when its turn comes up.
   *
   * If the same name is queued while running, the new task is appended
   * to the queue regardless — deduping would cause the second caller
   * to wait on the first's return value, which is usually NOT what
   * they want (e.g., a second OCR call should not see stale results).
   */
  run<T>(name: string, task: HeavyInitTask): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const entry: PendingEntry = {
        name,
        task,
        resolve: resolve as (v: unknown) => void,
        reject,
        startedAt: 0,
      };
      this.queue.push(entry);
      this.pump();
    });
  }

  private pump(): void {
    if (this.running) return;
    const next = this.queue.shift();
    if (!next) return;
    this.running = next;
    next.startedAt = Date.now();
    // Surface a single "loading X..." line to the dev console so
    // operators can correlate the queue against observed CPU/disk.
    // eslint-disable-next-line no-console
    console.log(`[lti-heavy-init] ▶ start "${next.name}" (queue: ${this.queue.map((e) => e.name).join(", ") || "empty"})`);
    Promise.resolve()
      .then(() => next.task())
      .then(
        (value) => {
          // eslint-disable-next-line no-console
          console.log(`[lti-heavy-init] ✓ done  "${next.name}" in ${Date.now() - next.startedAt}ms`);
          this.running = null;
          this.pump();
          next.resolve(value);
        },
        (err) => {
          // eslint-disable-next-line no-console
          console.warn(`[lti-heavy-init] ✗ fail  "${next.name}" after ${Date.now() - next.startedAt}ms:`, err);
          this.running = null;
          this.pump();
          next.reject(err);
        }
      );
  }

  /** Inspect the current queue (for diagnostics). */
  get pendingNames(): string[] {
    return this.queue.map((e) => e.name);
  }
  get currentName(): string | null {
    return this.running?.name ?? null;
  }
}

// Module-level singleton. We export the class so tests can construct
// fresh instances; production code uses the default singleton.
export const heavyInitMutex = new HeavyInitMutex();

/**
 * Convenience: run `task` under the default singleton mutex.
 * The caller chooses a human-readable name (e.g. "paddle-download",
 * "vlm-spawn", "speech-download") for the queue log.
 */
export function withHeavyInit<T>(name: string, task: HeavyInitTask): Promise<T> {
  return heavyInitMutex.run<T>(name, task);
}
