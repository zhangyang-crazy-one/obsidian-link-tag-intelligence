---
phase: 02-asr-model-transcription
reviewed: 2026-05-14T00:00:00Z
depth: deep
files_reviewed: 6
files_reviewed_list:
  - src/speech-capture.ts
  - src/speech-recorder.ts
  - src/speech-worker.ts
  - src/speech-model.ts
  - src/asr-worker.ts
  - src/main.ts
findings:
  critical: 4
  warning: 5
  info: 3
  total: 12
status: issues_found
---

# Phase 02: Memory Review — ASR Speech Pipeline

**Reviewed:** 2026-05-14
**Depth:** deep (cross-file call chain analysis)
**Files Reviewed:** 6
**Status:** issues_found — 4 critical, 5 warnings, 3 info

## Summary

Deep review of the ASR speech-to-text pipeline across 6 source files, focused on memory leaks, buffer accumulation, child process lifecycle, and object retention. The analysis traced the full call chain from `main.ts` (optional — not reviewed here) -> `speech-recorder.ts` -> `speech-capture.ts` (microphone) + `asr-worker.ts` (child process ASR). Also examined `speech-model.ts` (download infrastructure) and `speech-worker.ts` (dead code — alternate in-thread WASM implementation, never imported).

**Key concern:** The ASR child process architecture has two high-severity leak vectors — `cp.exec()` accumulates stdout in memory and its `.kill()` call may not terminate the actual Node.js worker, producing orphaned processes that each hold 80-167 MB of WASM model memory. After multiple recording sessions, this is the most likely root cause of the reported 1 GB+ memory growth.

---

## Critical Issues

### CR-01: `cp.exec()` stdout accumulation + orphaned child processes from shell-based kill

**File:** `src/speech-recorder.ts:129-155`, `src/speech-recorder.ts:192`, `src/speech-recorder.ts:327-329`, `src/speech-recorder.ts:340-351`

**Issue:**
`child_process.exec()` is the wrong API for a long-running, streaming ASR worker process. It has two distinct problems:

**(a) stdout buffering:** `exec()` collects all stdout and stderr into a memory buffer, delivering them to the callback only when the process exits. The `maxBuffer: 10 * 1024 * 1024` (10 MB) prevents a crash, but every JSON result line emitted by the ASR worker is **duplicated** in memory — once in the `child.stdout.on("data")` streaming handler (line 138; consumed correctly) and once in `exec()`'s internal buffer. Over a 60-minute recording session (~14,000 result lines), this internal buffer approaches 10 MB and then `exec()` **kills the child process** with a "stdout maxBuffer exceeded" error, silently terminating the ASR engine mid-recording.

**(b) Orphaned child processes:** The command is `/usr/bin/node "${workerPath}"` executed inside a shell spawned by `exec()`. When `.kill()` is called (lines 192, 328, 346), it sends the signal to the **shell process**, not the Node.js child. POSIX shells do **not** propagate signals to their children by default. The shell dies, but the Node.js ASR worker (80-167 MB WASM model + decoder state) becomes orphaned and continues running. Each recording session that fails, times out, or switches languages can leave one orphaned ASR process behind. After 5-10 sessions, this explains 1 GB+ of memory.

**Fix:**

Replace `cp.exec()` with `cp.spawn()` (no shell intermediary, no stdout buffering):

```typescript
// Replace lines 123-133 with:
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const cp = require("child_process") as {
  spawn: (cmd: string, args: string[], opts?: { cwd?: string; stdio?: string[] }) => {
    stdin: { write: (d: string) => boolean };
    stdout: { on: (e: string, cb: (d: Buffer) => void) => void };
    stderr: { on: (e: string, cb: (d: Buffer) => void) => void };
    on: (e: string, cb: (code: number | null) => void) => void;
    kill: (signal?: string) => boolean;
    pid: number;
  };
};
const child = cp.spawn("/usr/bin/node", [workerPath], {
  cwd: pluginDir,
  stdio: ["pipe", "pipe", "pipe"],
});
this.asrProcess = child;
this.asrStdin = {
  write: (d: string) => { child.stdin.write(d); },
};
```

This eliminates the shell intermediary entirely, so `.kill()` sends the signal directly to the Node.js ASR worker, and there is no internal stdout buffer accumulation.

---

### CR-02: Uncleared `setInterval` runs forever after ASR init timeout

**File:** `src/speech-recorder.ts:177-184`

**Issue:**
When the 15-second ASR initialization timeout fires (line 178), `reject()` is called but the `check` interval (line 179) is **never cleared**. The interval continues running at 100 ms intervals indefinitely:

```typescript
const timeout = setTimeout(() => reject(new Error("ASR Worker init timed out")), 15000);
const check = setInterval(() => {
  if (this.asrReady) { clearTimeout(timeout); clearInterval(check); resolve(); }
  // ^^^ clearInterval(check) only runs in the if-branch — unreachable after timeout
}, 100);
```

After timeout, `this.asrReady` is always `false` (the child process was killed by the catch block), so the interval condition never fires. The interval holds a closure over `resolve`, `reject`, `this.asrReady`, and runs every 100 ms forever. This is a CPU and memory leak — each failed init leaves one interval running. If the user retries the toggle 10 times (each failing), 10 intervals run simultaneously.

**Fix:**

```typescript
const timeout = setTimeout(() => {
  clearInterval(check);
  reject(new Error("ASR Worker init timed out"));
}, 15000);
const check = setInterval(() => {
  if (this.asrReady) { clearTimeout(timeout); clearInterval(check); resolve(); }
}, 100);
```

---

### CR-03: AudioContext never closed on early `getUserMedia` failure

**File:** `src/speech-capture.ts:68-73`, `src/speech-capture.ts:104-116`

**Issue:**
`startCapture()` creates an `AudioContext` on line 69. The `cleanup` closure (defined on line 104) is the only code path that calls `audioContext.close()`. However, if `getUserMedia()` (line 75) throws, the function exits on line 84 *before* `cleanup` is defined (line 104). The `AudioContext` is never closed.

While the closure variable `audioContext` goes out of scope, `AudioContext` is a heavy native resource (hardware audio device, OS mixer channel) that the JS garbage collector may not reclaim promptly. In Electron's renderer process, unclosed `AudioContext` instances can accumulate and contribute to the 1 GB+ memory profile.

**Fix:**

Move `AudioContext` creation inside the try block, or add early cleanup:

```typescript
export async function startCapture(
  onAudioChunk: (chunk: Float32Array) => void
): Promise<CaptureState> {
  const audioContext = new AudioContext({ sampleRate: 16000 });

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  let mediaStream: MediaStream | null = null;
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ /* ... */ });

    // ... rest of setup (tryAudioWorklet fallback) ...

    const cleanup = (): void => {
      // ... existing cleanup ...
    };
    return { audioContext, mediaStream, /* ... */, cleanup };
  } catch (err) {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
    }
    void audioContext.close();  // <-- explicit close on error path
    throw err;
  }
}
```

---

### CR-04: `asr-worker.ts` exits without awaiting WASM resource cleanup

**File:** `src/asr-worker.ts:103-108`

**Issue:**
When the `"destroy"` message is received, the worker calls `stream.free()`, `recognizer.free()`, writes `{ type: "destroyed" }` to stdout, and immediately calls `process.exit(0)`. However, `stream.free()` and `recognizer.free()` are native WASM calls that may be **asynchronous** (WASM linear memory deallocation). `process.exit(0)` terminates the process immediately without waiting for pending I/O or async cleanup. If sherpa-onnx's free functions are partially complete, the WASM memory may not be properly released before the process dies. This is unlikely to cause host-level memory leaks (OS reclaims process memory), but could leave shared memory objects (e.g., WASM Memory buffers shared with the parent via `postMessage` if that mechanism were used) in an inconsistent state.

**Fix:**

```typescript
case "destroy": {
  if (stream) { stream.free(); stream = null; }
  if (recognizer) { recognizer.free(); recognizer = null; }
  process.stdout.write(JSON.stringify({ type: "destroyed" }) + "\n", () => {
    // Only exit after stdout flush completes
    process.exit(0);
  });
}
```

If sherpa-onnx free functions return Promises (check sherpa-onnx API), await them before exiting.

---

## Warnings

### WR-01: Duplicate method definitions — `setSettingsLanguage` and `setSettingsVadSensitivity`

**File:** `src/speech-recorder.ts:312-322` (first), `src/speech-recorder.ts:340-351` (second); `src/speech-recorder.ts:320-322` (first), `src/speech-recorder.ts:353-356` (second)

**Issue:**
Both methods are defined twice in the same class. TypeScript would flag this as an error (`tsc --noEmit`), but esbuild (used for the build step) does not perform type checking and silently accepts the last definition as the winner.

The first `setSettingsLanguage` (line 312) calls `this.setLanguage(lang)` — a method that **does not exist** on the class. Fortunately, this version is overridden by the second definition (line 340) and never executes at runtime. The first `setSettingsVadSensitivity` (line 320) is similarly overridden by the second (line 353).

These are dead code that mask a potential bug: if someone refactors the second definition, the first could accidentally become the active one.

**Fix:**

Delete the first `setSettingsLanguage` (lines 312-317) and first `setSettingsVadSensitivity` (lines 320-322). Add `tsc --noEmit` to the build pipeline to catch future duplicates.

---

### WR-02: `speech-worker.ts` is dead code — contains `require("sherpa-onnx")` that may fail at runtime

**File:** `src/speech-worker.ts` (entire file, 103 lines)

**Issue:**
This file exports `createAsrEngine()` and the `AsrEngine` type, but is **never imported** by any other source file (`grep -rn "speech-worker" src/` returns zero results outside the file itself). It implements an in-thread WASM ASR engine as an alternative to the child-process approach used by `speech-recorder.ts`.

If this file were ever wired in, line 33 (`require(pkgPath)`) resolves sherpa-onnx from the plugin's local `node_modules`, which may not exist (Obsidian plugins typically bundle all dependencies). The `speech-recorder.ts` child process approach uses `require("sherpa-onnx")` in `asr-worker.ts` (line 6), which resolves from the plugin directory as the working directory of the spawned Node.js process.

**Fix:**
If this file is intended as a future alternative, add a comment block explaining its status and intended activation path. If it was an experiment, remove it to avoid confusion. It currently represents 103 lines of dead code with an unresolved `require` dependency.

---

### WR-03: `destroy()` called twice in `onunload()`

**File:** `src/main.ts:376-381`

**Issue:**
```typescript
onunload(): void {
  this.speechRecorder.destroy();     // line 377
  this.referencePreview.destroy();   // line 378
  this.cancelAutoStopTimer();        // line 379
  this.speechRecorder.destroy();     // line 380 — DUPLICATE
}
```

`destroy()` is idempotent today (null-checks before `.kill()`), so the duplicate call does not crash. However, if `destroy()` is ever modified to include non-idempotent operations (e.g., state counters, analytics, or assertion checks), the duplicate call could cause incorrect behavior.

**Fix:**
Remove line 380. Also reorder: cancel the timer *before* destroying the recorder:

```typescript
onunload(): void {
  this.cancelAutoStopTimer();        // stop intervals first
  this.speechRecorder.destroy();     // then tear down resources
  this.referencePreview.destroy();
}
```

---

### WR-04: `stdin.write()` return value not checked — backpressure unhandled

**File:** `src/speech-recorder.ts:108`, `src/speech-recorder.ts:134`, `src/speech-recorder.ts:174`

**Issue:**
The `asrStdin.write()` proxy wraps `child.stdin?.write(d)` which returns a boolean indicating backpressure. When `false` is returned, the internal stream buffer is full and the caller should wait for the `'drain'` event before writing more. The code ignores this return value entirely:

```typescript
this.asrStdin = { write: (d: string) => { child.stdin?.write(d); } };
```

During high-throughput audio (the microphone produces ~4 chunks/sec, each ~22 KB base64-encoded), if the ASR worker processes audio slower than the microphone produces it, the stdin pipe buffer fills up. With the current code, writes continue to be buffered by Node.js's internal stream buffer (default 16 KB highWaterMark for pipe streams), but the caller never waits for drain. This can cause:
- Memory accumulation in the pipe buffer
- Dropped audio chunks (when write returns false and the data is buffered, but eventual buffer overflow)
- Event loop blockage from synchronous JSON.stringify + write on the main thread

**Fix:**

```typescript
this.asrStdin = {
  write: (d: string) => {
    const ok = child.stdin.write(d);
    if (!ok) {
      // Backpressure — log a warning; in production, consider
      // dropping this audio chunk to avoid buffer bloat.
      // For now, Node's internal buffering handles it, but
      // monitor for buffer size growth.
    }
    return ok;
  },
};
```

For a production fix, implement a `'drain'`-based write queue in the `onAudioChunk` callback.

---

### WR-05: Silent JSON parse failures in stdout handler mask errors

**File:** `src/speech-recorder.ts:144-150`

**Issue:**
```typescript
for (const line of lines) {
  try {
    const msg = JSON.parse(line) as { type: string; ok?: boolean; text?: string; isEndpoint?: boolean };
    if (msg.type === "ready") this.asrReady = !!msg.ok;
    else if (msg.type === "result") this.onAsrResult?.(msg.text ?? "", msg.isEndpoint ?? false);
  } catch { /* skip */ }
}
```

Empty catch. If the ASR worker's stdout becomes corrupted (e.g., interleaved binary data from a sherpa-onnx crash, or a partial line from a buffer split), the parse error is silently discarded. Callers never learn that results are being dropped. Combined with CR-01 (exec buffering), a parse failure cascade could fill the exec buffer with unparseable data until the 10 MB limit is hit and the child is killed.

**Fix:**
At minimum, log parse failures to the debug log:

```typescript
} catch (e) {
  debugLog(this.appRef!, "speech-recorder.stdout-parse-error", { line: line.slice(0, 200), error: String(e) });
}
```

---

## Info

### IN-01: `asrProcess` field typed as `any` — loss of type safety

**File:** `src/speech-recorder.ts:24`

**Issue:**
```typescript
private asrProcess: any = null;
```

Using `any` defeats TypeScript's type checking for all child process operations. The `.kill()` call on line 192 is not verified to exist on the object, and the `.stdout` / `.stderr` / `.on()` accesses on lines 138, 152, 153 have no type-checked contract.

**Fix:**
Define a minimal ChildProcess type alias:

```typescript
type AsrChildProcess = {
  stdin: { write: (d: string) => boolean } | null;
  stdout: { on: (e: "data", cb: (chunk: Buffer) => void) => void } | null;
  stderr: { on: (e: "data", cb: (chunk: Buffer) => void) => void } | null;
  on: (e: "exit", cb: (code: number | null) => void) => void;
  kill: (signal?: string) => boolean;
  pid?: number;
};
private asrProcess: AsrChildProcess | null = null;
```

---

### IN-02: `downloadZhArchive` `execSync` maxBuffer may be insufficient

**File:** `src/main.ts:1178-1181`, `src/main.ts:1185-1186`

**Issue:**
`cp.execSync(`curl -L -o "${archivePath}" "${url}" --progress-bar 2>&1`, { maxBuffer: 1024 * 1024 })` — the `2>&1` redirect sends curl's stderr (progress bar) to stdout for capture by `execSync`. The `--progress-bar` flag on a 167 MB download produces one progress line per transfer update (~every second). Over a 5-minute download, that is ~300 lines at ~80 bytes each = ~24 KB — well within the 1 MB maxBuffer. However, if the download URL returns an HTML error page (e.g., GitHub rate limiting), the full HTML response ~50-200 KB is captured in the buffer. If the download fails with a redirect loop, multiple HTML responses could accumulate. The 1 MB limit should be adequate for standard error scenarios, but consider increasing to 5 MB as defense-in-depth, or use `--silent --show-error` instead of `--progress-bar 2>&1` to avoid capturing progress output entirely.

---

### IN-03: Unreachable code block in `saveSettings()`

**File:** `src/main.ts:395-405`

**Issue:**
After the `await this.saveData(this.settings); return;` on lines 395-396, there is an unreachable comment and code block (lines 398-405) that appears to be a remnant of a previous implementation:

```typescript
await this.saveData(this.settings);
return;

// Propagation handled above — this block is unreachable
// D-10: Language change only propagated when NOT currently recording
if (!this.speechRecorder.isActive) {
  this.speechRecorder.setSettingsLanguage(this.settings.speechLanguage);
}
// VAD sensitivity can always be updated (no impact on current stream)
this.speechRecorder.setSettingsVadSensitivity(this.settings.speechVadSensitivity);
```

The `return` on line 396 makes lines 398-405 permanently unreachable. The actual propagation is handled at lines 392-394 (before the `return`), which is correct. Delete the dead code to avoid future confusion.

---

_Reviewed: 2026-05-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
