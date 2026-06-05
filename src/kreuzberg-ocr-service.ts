// Kreuzberg OCR service — Rust-core document parser used as the English
// fallback in the 3-tier OCR routing. Replaces tesseract.js with a single
// ~870KB precompiled native binary that ships Tesseract under the hood but
// adds PDF/Office support, table extraction, and proper text layout.
//
// Online docs: https://kreuzberg.dev
// npm:        @kreuzberg/node (4.9.x, NAPI-RS, no Rust toolchain needed)
// License:    Elastic License 2.0 — see LICENSE in node_modules.
//
// IMPLEMENTATION NOTE (2026-06-03, after four failed in-process attempts):
// Obsidian's Electron renderer blocks every flavor of require() we tried
// for the @kreuzberg/node native binding — top-level import (hoisted by
// esbuild), lazy require inside runOcr (fails at runtime), bare-specifier
// require, and explicit relative-path require that joins with main.js's
// __dirname. The renderer must be using a sandboxed module root that
// excludes the plugin's own node_modules/ directory. The only reliable
// pattern is to spawn a fresh Node.js child process (mirroring the
// asr-worker.ts / OCR worker architecture) and let IT require the
// native binding with a normal parent-tree-walking resolver. The
// service below spawns src/kreuzberg-worker.ts as a child, sends it
// {type:"extract", filePath, tessdataPath, jobId} messages on stdin,
// and resolves with the {text} it emits on stdout. The child stays
// alive across calls (one spawn per service lifetime) and is SIGTERMed
// on destroy().

import * as cp from "child_process";
import * as path from "path";
import { randomUUID } from "crypto";

type WorkerResponse =
  | { type: "ready" }
  | { type: "progress"; jobId: string; stage: string; message: string }
  | { type: "result"; jobId: string; success: true; text: string }
  | { type: "error"; jobId: string; error: string };

export class KreuzbergOcrService {
  private readonly tessdataPath: string;
  private readonly workerPath: string;
  private static IDLE_TIMEOUT_MS = 120000; // 2 minutes
  private idleTimer: NodeJS.Timeout | null = null;
  private destroyed = false;
  /** Spawned on first runOcr; reused across calls. */
  private child: cp.ChildProcess | null = null;
  /** Per-job resolvers, keyed by jobId. */
  private readonly pending = new Map<string, {
    resolve: (text: string) => void;
    reject: (err: Error) => void;
    /** Optional onStatus callback forwarded from runOcr's caller;
     *  fired for each `{type:"progress",...}` message the child emits
     *  so the UI shows live status while the worker is busy. */
    onStatus?: (msg: string) => void;
  }>();
  /** Resolves when the worker has emitted its first "ready" message. */
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((err: Error) => void) | null = null;

  /**
   * @param tessdataPath  Directory containing the official Tesseract
   *                       `eng.traineddata` and `chi_sim.traineddata` files.
   *                       Kreuzberg's precompiled Rust binaries ship a
   *                       build-time `TESSDATA_PREFIX` that points at
   *                       `/home/runner/work/kreuzberg/...` (the GitHub
   *                       Actions runner) and is wrong on every other
   *                       machine, so we override it via the process env
   *                       before each call (the child worker also does
   *                       the same override; defense in depth).
   * @param workerPath    Absolute path to the compiled kreuzberg-worker
   *                       .cjs file. In production this is
   *                       {pluginDir}/kreuzberg-worker.cjs. In tests
   *                       it's the project's dist/kreuzberg-worker.cjs
   *                       (built by `npm run build`).
   */
  constructor(tessdataPath: string, workerPath: string) {
    this.tessdataPath = tessdataPath;
    this.workerPath = workerPath;
  }

  /**
   * Spawn the child worker (idempotent) and wait for it to send the
   * first "ready" message. Subsequent calls return the cached promise.
   *
   * We pass NODE_PATH pointing at the project's node_modules so the
   * child can find @kreuzberg/node when running from the dev tree
   * (the smoke test in particular). In the production vault install,
   * the child's own cwd + relative node_modules lookup works without
   * NODE_PATH because the package files are in dist/node_modules/.
   */
  private ensureWorker(): Promise<void> {
    if (this.readyPromise) return this.readyPromise;
    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    // Direct spawn keeps worker paths with spaces or shell metacharacters
    // as a single argv entry while still allowing POSIX process-group kill.
    const isWindows = process.platform === "win32";
    const projectNodeModules = "/home/zhangyangrui/my_programes/obsidian-link-tag-intelligence/node_modules";
    const childEnv = { ...process.env };
    if (!childEnv.NODE_PATH || !childEnv.NODE_PATH.includes(projectNodeModules)) {
      childEnv.NODE_PATH = projectNodeModules + (childEnv.NODE_PATH ? `:${childEnv.NODE_PATH}` : "");
    }
    const childDir = path.dirname(this.workerPath);
    this.child = cp.spawn("node", [this.workerPath], {
      env: childEnv,
      detached: !isWindows,
      cwd: childDir,
      shell: false,
    });
    this.child.on("error", (e) => {
      // Spawn-time failure (ENOENT, EACCES, etc.) — mirror speech-recorder
      // pattern. Reject every pending job and force a respawn on next call.
      const err = new Error(`kreuzberg-worker spawn failed: ${e.message}`);
      this.readyReject?.(err);
      for (const job of this.pending.values()) job.reject(err);
      this.pending.clear();
      this.child = null;
      this.readyPromise = null;
      this.readyResolve = null;
      this.readyReject = null;
    });
    this.child.on("exit", (code, signal) => {
      // If we didn't initiate this exit, the child died unexpectedly.
      // Reject every pending job; next runOcr will respawn.
      const err = new Error(
        `kreuzberg-worker exited unexpectedly (code=${code}, signal=${signal})`,
      );
      this.readyReject?.(err);
      if (this.pending.size > 0) {
        for (const job of this.pending.values()) job.reject(err);
        this.pending.clear();
      }
      this.child = null;
      this.readyPromise = null;
      this.readyResolve = null;
      this.readyReject = null;
    });
    this.child.on("error", () => {/* handled above; suppress unhandled */});

    const readline = require("readline");
    const rl = readline.createInterface({ input: this.child.stdout });
    rl.on("line", (raw: string) => {
      let msg: WorkerResponse;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      if (msg.type === "ready") {
        this.readyResolve?.();
        this.readyResolve = null;
        this.readyReject = null;
        return;
      }
      if (msg.type === "progress") {
        // Forward the worker's progress message to the runOcr caller's
        // onStatus callback. Don't touch the pending entry — the
        // extract is still in flight.
        const job = this.pending.get(msg.jobId);
        if (job?.onStatus) job.onStatus(msg.message);
        return;
      }
      if (msg.type === "result" || msg.type === "error") {
        const job = this.pending.get(msg.jobId);
        if (!job) return;
        this.pending.delete(msg.jobId);
        if (msg.type === "result") {
          job.resolve(msg.text);
        } else {
          job.reject(new Error(msg.error));
        }
      }
    });
    this.child.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(`[lti-kreuzberg-worker-stderr] ${chunk.toString().trim()}\n`);
    });
    return this.readyPromise;
  }

  /**
   * Run OCR / document extraction on a local file path. Returns the
   * extracted text (kreuzberg auto-detects MIME from the file extension,
   * so .png/.jpg/.pdf all work the same way).
   */
  public async runOcr(
    imageSource: string,
    onStatus?: (msg: string) => void,
  ): Promise<string> {
    if (this.destroyed) throw new Error("KreuzbergOcrService 已被销毁");
    this.clearIdleTimer();
    if (onStatus) onStatus("正在通过 Kreuzberg (Rust) 提取文字...");

    try {
      const worker = await this.ensureWorker();
      // If the worker died right after we awaited, retry once.
      if (!this.child) {
        await this.ensureWorker();
      }
      worker;
      const jobId = randomUUID();
      const text = await new Promise<string>((resolve, reject) => {
        if (!this.child) {
          reject(new Error("kreuzberg-worker not running"));
          return;
        }
        this.pending.set(jobId, { resolve, reject });
        // Save the onStatus callback so the response handler can
        // forward progress messages from the child. The pending entry
        // already carries the resolve/reject pair; we just append the
        // callback. When the entry is consumed (response received),
        // the callback goes out of scope with it.
        const entry = this.pending.get(jobId)!;
        entry.onStatus = onStatus;
        this.child.stdin?.write(
          JSON.stringify({
            type: "extract",
            filePath: imageSource,
            tessdataPath: this.tessdataPath,
            jobId,
          }) + "\n",
        );
      });
      return text;
    } catch (e: any) {
      console.error("[lti-kreuzberg-ocr] extract failed:", e);
      throw new Error(`Kreuzberg OCR 推理异常: ${e?.message ?? e}`);
    } finally {
      this.resetIdleTimer();
    }
  }

  private resetIdleTimer(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      this.stopWorker();
    }, KreuzbergOcrService.IDLE_TIMEOUT_MS);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private stopWorker(): void {
    if (!this.child) {
      this.readyPromise = null;
      this.readyResolve = null;
      this.readyReject = null;
      return;
    }
    const child = this.child;
    this.child = null;
    this.readyPromise = null;
    this.readyResolve = null;
    this.readyReject = null;
    try { child.stdin?.end(); } catch { /* ignore */ }
    setTimeout(() => {
      if (!child.killed) {
        try { process.kill(-(child.pid ?? 0), "SIGTERM"); } catch { /* ignore */ }
        setTimeout(() => {
          if (!child.killed) {
            try { process.kill(-(child.pid ?? 0), "SIGKILL"); } catch { /* ignore */ }
          }
        }, 500).unref?.();
      }
    }, 100).unref?.();
  }

  /**
   * Destroy lifecycle for plugin unload. Terminates the child with
   * SIGTERM (and SIGKILL after a short grace period if it doesn't
   * exit cleanly). Mirrors the OCR child-process escalation pattern.
   */
  public destroy(): void {
    this.destroyed = true;
    this.clearIdleTimer();
    this.stopWorker();
    // Reject any pending jobs so callers don't hang on plugin unload.
    for (const job of this.pending.values()) {
      job.reject(new Error("KreuzbergOcrService 已被销毁"));
    }
    this.pending.clear();
    this.readyReject?.(new Error("KreuzbergOcrService 已被销毁"));
  }
}
