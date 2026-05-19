---
phase: 02-code-review
reviewed: 2026-05-19T00:00:00Z
depth: deep
files_reviewed: 3
files_reviewed_list:
  - src/asr-worker.ts
  - src/speech-recorder.ts
  - src/speech-capture.ts
findings:
  critical: 4
  warning: 3
  info: 3
  total: 10
status: issues_found
---

# Phase 02: Code Review Report — ASR Speech-to-Text Pipeline

**Reviewed:** 2026-05-19
**Depth:** deep (cross-file call-chain analysis)
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Deep review of the ASR speech-to-text pipeline across three files: the standalone worker process (`asr-worker.ts`), the main-thread recorder orchestration (`speech-recorder.ts`), and the microphone capture module (`speech-capture.ts`). Cross-file analysis traced the full start/stop audio flow: `SpeechRecorder.toggle()` -> `startCapture()` -> audio chunk callback -> silence gate -> stdin JSON to worker -> sherpa-onnx decode -> stdout JSON -> `onAsrResult` callback.

Git history confirms a deliberate round-trip from `greedy_search` (commit 53596c4, to fix hallucination) back to `modified_beam_search` (commit 241873a, for hotwords+blankPenalty). However, **orphaned comments and stale configuration remain**, creating a direct contradiction between the file header (claiming `greedy_search`) and the actual code (using `modified_beam_search`). This is the root cause of the hallucination risk. The silence gate at `rms > 0.0005` (-66 dBFS) is only a mitigation, not a fix.

Additionally, two duplicate method definitions in `speech-recorder.ts` contain dead code (first variant calls non-existent `this.setLanguage()`), indicating an incomplete merge or refactor. The `shell: true` spawn option contradicts the comment saying "no shell", and causes fragile process-kill semantics.

---

## Critical Issues

### CR-01: `modified_beam_search` used despite known hallucination bugs — header comment is orphaned

**File:** `src/asr-worker.ts:200`
**Affected:** `src/speech-recorder.ts:105` (silence gate as mitigation)

**Issue:** The file header (lines 4-9) states the pipeline uses `greedy_search (stable, no hallucination)` with pinyin-based post-processing as a replacement for `modified_beam_search` native hotwords (which have "known hallucination bugs #845, #3267 with streaming Zipformer"). However, the actual configuration on line 200 sets `decodingMethod: "modified_beam_search"`, which is the exact engine with the known hallucination bug.

Git history confirms: commit `53596c4` switched to `greedy_search` to fix hallucination; commit `241873a` switched back to `modified_beam_search` (for hotwords+blankPenalty) but never updated the header comment.

The silence gate in `speech-recorder.ts:105` (`rms > 0.0005`, -66 dBFS threshold) only blocks dead-air chunks. Low-level background noise above -66 dBFS can still trigger modified_beam_search hallucinations — producing garbled or fabricated Chinese text inserted into the user's note.

**Fix:** Either (a) revert to `greedy_search` and remove the silence gate (since greedy_search does not hallucinate on silence), or (b) update the header comment to accurately document the modified_beam_search approach and acknowledge the hallucination risk with the mitigation in place.

```typescript
// Option A: revert to stable decoding
decodingMethod: "greedy_search",
// Remove maxActivePaths (not applicable to greedy_search)
// Remove blankPenalty (not applicable to greedy_search)

// Option B: keep modified_beam_search but fix the comment
// File header should read:
// Uses modified_beam_search + silence gate + pinyin-based post-processing
// WARNING: modified_beam_search has known hallucination bugs (#845, #3267)
// on silence with streaming Zipformer. Mitigated by -66dBFS silence gate
// in speech-recorder.ts (rms > 0.0005).
```

---

### CR-02: Duplicate `setSettingsLanguage` — first variant calls non-existent `this.setLanguage()`

**File:** `src/speech-recorder.ts:317-321, 360-370`

**Issue:** `setSettingsLanguage` is defined twice in the same class. The first definition (line 317-321) calls `this.setLanguage(lang)` — a method that **does not exist** on the `SpeechRecorder` class. The second definition (line 360-370) overrides it at runtime (JavaScript last-definition-wins), so the dead code path is never executed. However, the orphaned first definition indicates an incomplete merge/refactor and confuses anyone reading the source.

The duplicate `setSettingsVadSensitivity` (lines 325-327 and 372-375) has the same problem — both definitions are functionally similar (clamp to 0-3), but only the second is live. The first is dead code.

**Fix:** Delete the first (orphaned) definitions at lines 317-321 and 325-327.

```typescript
// DELETE these dead definitions:
//   setSettingsLanguage(lang: "zh" | "en"): void {  // line 317-321
//     if (this.settingsLanguage !== lang) {
//       this.settingsLanguage = lang;
//       this.setLanguage(lang);  // <-- method does not exist
//     }
//   }
//   setSettingsVadSensitivity(sensitivity: number): void {  // line 325-327
//     this.settingsVadSensitivity = Math.max(0, Math.min(3, Math.round(sensitivity)));
//   }

// KEEP only these (lines 360-375):
setSettingsLanguage(lang: "zh" | "en"): void {
    if (lang === this.settingsLanguage) return;
    this.settingsLanguage = lang;
    if (!this.isActive && this.asrProcess) {
      this.killAsrProcess();
      this.asrProcess = null;
      this.asrStdin = null;
      this.asrReady = false;
    }
}
setSettingsVadSensitivity(sensitivity: number): void {
    const clamped = Math.max(0, Math.min(3, Math.round(sensitivity)));
    this.settingsVadSensitivity = clamped;
}
```

---

### CR-03: Missing `modelingUnit` in transducer config — may cause model misbehavior

**File:** `src/asr-worker.ts:190-198`

**Issue:** The `transducer` model config does not specify `modelingUnit` or `bpeVocab`. Sherpa-onnx auto-detects the modeling unit from the model files, but auto-detection is fragile. Git history shows several commits fixing BPE vs cjkchar mismatches (`cdcc026`, `f6797d5`, `e1336bb`, `a05588c`, `a75405c`). The `tokens.txt` file at the model directory may be interpreted as either BPE or cjkchar, and if auto-detection picks wrong, the decoder produces garbled output — indistinguishable from hallucination.

Commit `f6797d5` specifically mentions "BPE modeling unit (not cjkchar)" and commit `a05588c` adds bpeVocab path. It is unclear whether the currently deployed model is BPE or cjkchar-based.

**Fix:** Explicitly specify `modelingUnit` to prevent auto-detection ambiguity:

```typescript
recognizer = sherpaOnnx.createOnlineRecognizer({
    modelConfig: {
        transducer: {
            encoder: msg.modelDir + "encoder.int8.onnx",
            decoder: msg.modelDir + "decoder.onnx",
            joiner: msg.modelDir + "joiner.int8.onnx",
        },
        tokens: msg.modelDir + "tokens.txt",
        modelingUnit: "cjkchar",  // or "bpe" with bpeVocab — be explicit
        // bpeVocab: msg.modelDir + "bpe.model",  // if BPE model
        numThreads: 1, provider: "cpu", debug: 0,
    },
    // ...
});
```

---

### CR-04: `shell: true` contradicts "no shell" comment — fragile process-kill semantics

**File:** `src/speech-recorder.ts:119, 139`

**Issue:** Line 119 comments "Spawn ASR child process directly (no shell)" but line 139 explicitly passes `shell: true` to `cp.spawn`. With `shell: true`, the process tree is: Electron renderer -> `/bin/sh -c "node asr-worker.js"` -> `node asr-worker.js`. The `killAsrProcess()` method (line 338) uses `process.kill(-pid, "SIGTERM")` targeting the shell PID with negative sign for process group kill. This is fragile because:

1. The shell (`/bin/sh`) may not reliably forward SIGTERM to its child node process.
2. If the shell exits before passing the signal, the node process (holding 80-167MB WASM) becomes orphaned.
3. The original rationale ("shell: true ensures PATH resolution for 'node' in Electron renderer") is unnecessary — `spawn('node', ...)` with `shell: false` resolves `node` via the system PATH just fine on desktop platforms.

**Fix:** Remove `shell: true` and use direct spawn. The `node` binary is on PATH in all Electron desktop environments.

```typescript
this.asrProcess = cp.spawn("node", [workerPath], {
    cwd: pluginDir,
    stdio: ["pipe", "pipe", "pipe"],
    // shell: true,  // REMOVE — unnecessary, breaks process-kill semantics
});
```

And update `killAsrProcess()` to use direct `SIGTERM` on the node process (no shell intermediary):

```typescript
private killAsrProcess(): void {
    if (!this.asrProcess) return;
    try {
        this.asrStdin?.write(JSON.stringify({ type: "destroy" }) + "\n");
        this.asrProcess.kill("SIGTERM");  // direct kill, no shell wrapper
    } catch {
        try { this.asrProcess.kill("SIGKILL"); } catch { /* already dead */ }
    }
}
```

---

## Warnings

### WR-01: `bestMatch = null; break;` resets global match state for all hotwords

**File:** `src/asr-worker.ts:123`

**Issue:** In the pinyin hotword correction loop, when the text already contains an exact hotword match, the code sets `bestMatch = null` and breaks — but `break` only exits the inner `i` loop (sliding window over text), not the outer `hw` loop (over hotwords). If a previous hotword iteration had found a valid `bestMatch`, this exact-match check on a *different* hotword will discard it. The intended behavior appears to be: "if this specific hotword is already correct, skip pinyin correction for it" — but the code instead resets the global match state.

**Fix:** Use a labeled break, or restructure as a per-hotword skip:

```typescript
for (const hw of hotwordPinyins) {
    const hwLen = hw.word.length;
    // Check if this exact hotword is already present — skip correction for it
    if (text.includes(hw.word)) continue;
    for (let i = 0; i <= text.length - hwLen; i++) {
        const subChars = text.slice(i, i + hwLen);
        const subPy = textPy.slice(i, i + hwLen);
        const dist = pinyinEditDistance(subPy, hw.py);
        if (dist <= 1 ||
            (dist <= 3 && charEditDist(subChars, hw.word) <= 2)) {
            if (!bestMatch || hw.word.length > bestMatch.word.length) {
                bestMatch = { word: hw.word, pos: i, len: hwLen, dist };
            }
        }
    }
}
```

---

### WR-02: Double "destroy" message sent on error path — wasteful and indicates poor factoring

**File:** `src/speech-recorder.ts:196` and `src/speech-recorder.ts:336`

**Issue:** In the `start()` catch block (line 196), a "destroy" message is sent to the worker via stdin, then `killAsrProcess()` is called (line 197), which **also** sends a "destroy" message (line 336). The worker receives two "destroy" messages. The second arrives after the recognizer is already freed (worker line 239-241 sets `stream` and `recognizer` to `null`), so it silently succeeds — but the duplicate send indicates that the "send destroy" logic is duplicated between the error handler and `killAsrProcess()`.

**Fix:** Remove the explicit "destroy" send from the catch block — `killAsrProcess()` already handles it.

```typescript
// In the catch block (lines 195-200):
if (this.asrProcess) {
    // this.asrStdin?.write(JSON.stringify({ type: "destroy" }) + "\n");  // DELETE — killAsrProcess sends this
    this.killAsrProcess();
    this.asrProcess = null;
    this.asrStdin = null;
}
```

---

### WR-03: ScriptProcessorNode connected to `audioContext.destination` — potential echo path

**File:** `src/speech-capture.ts:61`

**Issue:** The `ScriptProcessorNode` fallback path connects the processing node to `audioContext.destination` (speakers) because `ScriptProcessorNode` events won't fire unless connected to the graph output. This means microphone audio passes through to the speakers, potentially causing feedback/echo. The `echoCancellation: true` constraint on `getUserMedia` (line 81) may mitigate this, but it is not guaranteed to eliminate it — especially on systems with multiple audio devices or weak echo cancellation implementations.

**Fix:** Connect to a zero-gain `GainNode` instead of directly to `destination`:

```typescript
function createScriptProcessorFallback(
  audioContext: AudioContext,
  mediaStream: MediaStream,
  onAudioChunk: (chunk: Float32Array) => void
): { node: ScriptProcessorNode; source: MediaStreamAudioSourceNode; blobUrl: null } {
  const node = audioContext.createScriptProcessor(4096, 1, 1);
  node.onaudioprocess = (event: AudioProcessingEvent) => {
    const input = event.inputBuffer.getChannelData(0);
    onAudioChunk(new Float32Array(input));
  };
  const source = audioContext.createMediaStreamSource(mediaStream);
  source.connect(node);
  // Connect to a silent gain node instead of destination to prevent echo
  const silentGain = audioContext.createGain();
  silentGain.gain.value = 0;
  node.connect(silentGain);
  silentGain.connect(audioContext.destination);

  return { node, source, blobUrl: null };
}
```

---

## Info

### IN-01: Missing semicolons on `killAsrProcess()` calls — inconsistent with codebase style

**File:** `src/speech-recorder.ts:196, 348`

**Issue:** Two calls to `this.killAsrProcess()` lack trailing semicolons. JavaScript ASI inserts them, so no runtime bug, but the codebase convention (noted in CLAUDE.md) is "semicolons: always used."

**Fix:** Add semicolons:

```typescript
this.killAsrProcess();  // line 196
this.killAsrProcess();  // line 348
```

---

### IN-02: AudioWorklet failure silently swallowed — no diagnostic logging

**File:** `src/speech-capture.ts:102`

**Issue:** When `tryAudioWorklet()` fails (typically due to CSP blocking `blob:` URLs), the error is silently swallowed via `catch (_workletError)`. While this is the expected fallback path, the error is never logged. This makes debugging AudioWorklet failures impossible — if the fallback ScriptProcessorNode also has issues, there is no record of the root cause.

**Fix:** Log the worklet error before falling back:

```typescript
} catch (_workletError) {
    console.debug("[lti-speech-capture] AudioWorklet unavailable, falling back to ScriptProcessorNode:", _workletError);
    const fallback = createScriptProcessorFallback(audioContext, mediaStream, onAudioChunk);
    // ...
}
```

---

### IN-03: Fragile parent directory computation with regex

**File:** `src/asr-worker.ts:170`

**Issue:** The lexicon path is computed as:
```typescript
const parentDir = modelDir.replace(/\/[^/]+\/$/, "/");
```
This regex-based approach fails if the path format changes (e.g., no trailing slash, or Windows backslashes). Path traversal via `..` is already blocked (line 166), so this is not a security issue — but incorrect path computation silently produces `lexicon not found`, degrading hotword correction without any visible error.

**Fix:** Use Node.js `path` module for robust parent directory resolution:

```typescript
const path = require("path");
const parentDir = path.dirname(modelDir.replace(/\/$/, "")) + "/";
```

---

## Cross-File Call Chain Analysis

### Audio processing start flow:
```
SpeechRecorder.toggle() [speech-recorder.ts:59]
  -> SpeechRecorder.start() [speech-recorder.ts:89]
    -> startCapture() [speech-capture.ts:66]        // AudioContext + getUserMedia
    -> tryAudioWorklet() [speech-capture.ts:27]     // Primary audio path
      |-> OR createScriptProcessorFallback() [speech-capture.ts:45]  // CSP fallback
    -> cp.spawn("node", [workerPath]) [speech-recorder.ts:136]  // ASR worker
    -> asrStdin.write(initMsg) [speech-recorder.ts:179]          // Init recognizer
    -> stdout.on("data") handler [speech-recorder.ts:144]        // Result listener
```

### Audio chunk processing flow:
```
onAudioChunk(chunk) [speech-capture.ts callback]
  -> RMS calculation [speech-recorder.ts:95-108]
    -> throttle VU meter update (60ms) [speech-recorder.ts:97-100]
    -> silence gate: rms > 0.0005 [speech-recorder.ts:105]
      -> if above threshold:
          -> base64 encode + JSON + stdin write [speech-recorder.ts:106-107]
          -> worker: JSON parse [asr-worker.ts:159]
          -> worker: acceptWaveform + decode loop [asr-worker.ts:218-221]
          -> worker: getResult + isEndpoint [asr-worker.ts:222-226]
          -> worker: pinyin hotword correction [asr-worker.ts:228-230]
          -> worker: stdout JSON result [asr-worker.ts:232]
          -> speech-recorder: stdout handler [speech-recorder.ts:144-154]
            -> onAsrResult callback [speech-recorder.ts:152]
```

### Cleanup flow:
```
SpeechRecorder.stop() [speech-recorder.ts:229]
  -> asrStdin.write("reset") [speech-recorder.ts:236]
  -> cleanupCapture() [speech-recorder.ts:244-253]
    -> stopCapture(capture) [speech-capture.ts:127]
      -> capture.cleanup() [speech-capture.ts:110-122]
        -> processorNode.disconnect()
        -> sourceNode.disconnect()
        -> mediaStream.getTracks().forEach(stop)
        -> audioContext.close()
        -> URL.revokeObjectURL(blobUrl)

SpeechRecorder.destroy() [speech-recorder.ts:346]
  -> killAsrProcess() [speech-recorder.ts:332]
    -> asrStdin.write("destroy") [speech-recorder.ts:336]
    -> process.kill(-pid, SIGTERM) [speech-recorder.ts:338]
    -> worker: stream.free() + recognizer.free() + process.exit(0) [asr-worker.ts:238-244]
  -> removeDeviceChangeHandler()
  -> cleanupCapture()
```

### Error propagation verification:
- `startCapture()` throws on permission/device errors → caught by `SpeechRecorder.start()` try/catch (line 191) → mapped to i18n error keys
- `startCapture()` catches AudioWorklet failure internally → falls back to `ScriptProcessorNode` silently
- Worker init failure: 15-second timeout → catch block (line 191) → error state + process cleanup
- Worker crash: `exit` event fires (line 159) → no handler body → process remains null but state may be stale
- `onAsrResult` callback: defensive `?.` calls [speech-recorder.ts:152] — safe if `main.ts` hasn't set it

### State mutation consistency:
- `prevWasEndpoint` in worker [asr-worker.ts:155] is module-level global — reset correctly on internal endpoint detection (line 226) but NOT reset by the explicit "reset" message handler (line 237). Harmless in current flow because "reset" is only sent during `stop()` when no more audio chunks follow, but a latent issue if "reset" is ever used mid-stream.

---

_Reviewed: 2026-05-19T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
