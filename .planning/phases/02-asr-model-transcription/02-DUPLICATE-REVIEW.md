---
phase: 02-duplicate-text-investigation
reviewed: 2026-05-14T00:00:00Z
depth: deep
files_reviewed: 4
files_reviewed_list:
  - src/asr-worker.ts
  - src/speech-recorder.ts
  - src/speech-capture.ts
  - src/main.ts
findings:
  critical: 2
  warning: 2
  info: 1
  total: 5
status: issues_found
---

# Phase 02: Duplicate Text Investigation — Code Review Report

**Reviewed:** 2026-05-14
**Depth:** deep (cross-file pipeline trace)
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Traced the full audio-to-text pipeline across four files:
1. `speech-capture.ts` — microphone capture (AudioWorklet/ScriptProcessor) producing Float32Array chunks
2. `speech-recorder.ts` — RMS gating, base64 encoding, stdin/stdout bridge to ASR child process
3. `asr-worker.ts` — sherpa-onnx streaming recognizer with delta computation
4. `main.ts` — SentenceManager for partial preview accumulation, editor insertion on endpoint/stop

The investigation focused on why previously recognized text is occasionally re-printed **during** recording (not just on stop). Two critical root-cause bugs were identified, along with two warnings and one info-level finding.

---

## Critical Issues

### CR-01: RMS silence gate starves ASR endpoint detector of trailing silence

**File:** `src/speech-recorder.ts:105`
**Issue:** The silence gate drops audio chunks where `rms < 0.001`, preventing near-silent samples from reaching the ASR worker. However, sherpa-onnx's built-in VAD endpoint detection (`rule1MinTrailingSilence`, `rule2MinTrailingSilence`) requires **actual trailing silence in the incoming audio stream** to reliably detect sentence boundaries. By dropping silent samples, the model never observes real silence gaps and cannot accurately detect when a speaker has stopped.

This creates a causal chain that leads to duplicate text:
1. Silent chunks are dropped → the ASR model's internal VAD state becomes inconsistent
2. Endpoint detection fires **spuriously** at unpredictable points mid-speech (or fails to fire when expected)
3. When a spurious endpoint fires, the worker emits `{ text: delta, isEndpoint: true }`
4. In `main.ts:1568`, `finalizeSentence(text)` is called with the current delta
5. BUT the accumulated `partialText` in SentenceManager may already contain equivalent text shown as a live preview
6. The preview text is left in the editor (only `_speechPreviewLen` is reset to 0, the text itself is NOT removed)
7. `insertSpeechText` appends the final sentence text AFTER the existing preview → **duplicate**

Additionally, when the RMS gate drops chunks that contain the brief trailing silence of a sentence segment, the endpoint simply **never fires**. The SentenceManager's `partialText` keeps accumulating all text without being finalized. On the next endpoint (which may be much later), `finalizeSentence(delta)` is called with only the LAST incremental piece, while the bulk of the accumulated text remains locked in the (now-stale) preview display. This creates a divergence between what's shown in the editor and what the finalization logic considers "current."

**Fix:**
```typescript
// src/speech-recorder.ts, inside start()'s onAudioChunk callback
// REMOVE the silence gate entirely — send ALL chunks to the worker
// Let sherpa-onnx's internal VAD handle silence detection properly

this.capture = await startCapture((chunk) => {
  const rms = calculateRMS(chunk);
  // Throttled RMS update for UI only — keep at 60ms for VU meter stability
  if (!this.throttleTimer) {
    this.throttleTimer = setTimeout(() => {
      this.throttleTimer = null;
      this.audioLevel = rms;
    }, 60);
  }
  // Send ALL audio to ASR child process — including silence
  // The ASR model needs the full audio stream for accurate endpoint detection
  if (this.asrProcess && this.asrReady) {
    const b64 = Buffer.from(new Uint8Array(chunk.buffer)).toString("base64");
    this.asrStdin?.write(JSON.stringify({ type: "audio", bufferB64: b64 }) + "\n");
  }
});
```

The performance impact of sending silent chunks is negligible: base64 encoding a 4096-sample Float32Array takes microseconds, and the sherpa-onnx decoder returns immediately on silence (no frames to decode).

---

### CR-02: Worker delta computation re-emits old text on ASR model regression

**File:** `src/asr-worker.ts:95`
**Issue:** The delta computation uses `full.startsWith(prevText)` to extract incremental text from the cumulative recognizer output. This assumes the cumulative text **only grows forward** (monotonically longer). However, streaming ASR models can occasionally **revise** their hypothesis — producing a cumulative result that is **shorter** than the previous one or different in its prefix.

When this happens:
```javascript
// prevText = "你好世界今天天气很好"
// full     = "你好世界今天"     (model regressed — dropped the end)
// full.startsWith(prevText) → FALSE  (shorter string can't start with longer)
// delta = full = "你好世界今天"  ← RE-EMITS old text as delta!
// prevText = "你好世界今天"
```

This `delta` value of `"你好世界今天"` was already sent to the SentenceManager in previous partial updates. The SentenceManager does `addPartialText("你好世界今天")`, appending it to `partialText`, which already contains this text. The accumulated `partialText` balloons with duplicated content, causing the live preview to show duplicate text at the next `updateSpeechPreview` call.

While transducer models are generally monotonic (left-to-right), they **can and do revise the trailing portion** of their hypothesis as more acoustic evidence arrives. The `modified_beam_search` decoding with `maxActivePaths: 4` increases the chance of hypothesis revision because multiple beam hypotheses compete.

**Fix:**
```javascript
// src/asr-worker.ts, around line 95
const full = r.text || "";

// Use longest-common-prefix (LCP) instead of startsWith
// This correctly handles both growth and regression
const minLen = Math.min(prevText.length, full.length);
let commonLen = 0;
while (commonLen < minLen && prevText[commonLen] === full[commonLen]) {
  commonLen++;
}
const delta = full.slice(commonLen);

prevText = full;

if (delta) {
  const emitEndpoint = endpointNow;
  process.stdout.write(JSON.stringify({ type: "result", text: delta, isEndpoint: emitEndpoint }) + "\n");
}
```

This replaces `full.startsWith(prevText)` with an LCP scan that finds the actual shared prefix, regardless of whether the hypothesis grew or regressed. If the model regresses, only **new** characters (if any, after the common prefix) are emitted — never previously-emitted text.

Additionally, after `recognizer.reset(stream)` on line 93, `prevText` should be explicitly reset. The current code relies on the next empty-result chunk to naturally reset `prevText` to `""`, which is fragile:

```javascript
if (isEndpoint) {
  recognizer.reset(stream);
  prevText = "";        // ADD: reset text tracking for new sentence
  prevWasEndpoint = false;
}
```

---

## Warnings

### WR-01: Position-based preview removal breaks when cursor moves during recording

**File:** `src/main.ts:1631-1634`
**Issue:** `updateSpeechPreview` removes the previous preview text by counting characters backward from the current cursor position:

```typescript
if (this._speechPreviewLen > 0) {
  const start = { line: cursor.line, ch: Math.max(0, cursor.ch - this._speechPreviewLen) };
  editor.replaceRange("", start, cursor);
}
```

This assumes the preview text occupies positions `[cursor.ch - _speechPreviewLen, cursor.ch]`. This assumption breaks when:
- The user types or deletes text ANYWHERE in the editor (cursor position changes)
- The user clicks to move the cursor to a different location
- Obsidian auto-completes or formats text near the preview
- The preview text crosses a line boundary (line wrapping or actual newlines in ASR output)

When the assumption breaks, `replaceRange` removes the **wrong** text, potentially deleting user content or leaving the old preview in place. Then `replaceSelection(text)` inserts the new preview text, creating a duplicate of whatever preview text was left behind.

**Fix:** Track the preview position explicitly rather than deriving it from the cursor:
```typescript
// In LinkTagIntelligencePlugin class:
private _speechPreviewFrom: { line: number; ch: number } | null = null;

private updateSpeechPreview(text: string): void {
  const editorView = this.getContextEditorView();
  if (!editorView?.editor) return;
  const editor = editorView.editor;

  // Remove previous preview using stored position
  if (this._speechPreviewFrom) {
    const cursor = editor.getCursor();
    editor.replaceRange("", this._speechPreviewFrom, cursor);
  }

  // Save position before insert
  const insertPos = editor.getCursor();
  this._speechPreviewFrom = insertPos;

  // Insert new partial text
  editor.replaceSelection(text);
}
```

### WR-02: `speechRecorder.destroy()` called twice in `onunload()`

**File:** `src/main.ts:377,380`
**Issue:** `onunload()` calls `this.speechRecorder.destroy()` on both lines 377 and 380:
```typescript
onunload(): void {
  this.speechRecorder.destroy();  // line 377
  this.referencePreview.destroy();
  this.cancelAutoStopTimer();
  this.speechRecorder.destroy();  // line 380 — DUPLICATE
}
```

While `destroy()` is idempotent (it null-checks before operating), the duplicate call indicates a copy-paste or merge error. The second call is dead code.

**Fix:** Remove the duplicate call on line 380.

---

## Info

### IN-01: Unreachable code after `return` in `saveSettings`

**File:** `src/main.ts:391-405`
**Issue:** The `saveSettings` method has a `return` statement on line 396 followed by unreachable code (lines 398-405) that contains language-change propagation logic. This unreachable block includes a condition that delays language propagation when the recorder is active (`if (!this.speechRecorder.isActive)`), which may have been intentionally removed but left as dead code.

```typescript
async saveSettings(): Promise<void> {
  // ... settings normalization ...
  this.speechRecorder.setSettingsLanguage(this.settings.speechLanguage);  // line 392
  this.speechRecorder.setSettingsVadSensitivity(this.settings.speechVadSensitivity);
  this.speechRecorder.setHotwordsFile(this.settings.speechHotwordsFile);
  await this.saveData(this.settings);
  return;  // line 396 — returns here
  // Everything below is unreachable:
  // Propagation handled above — this block is unreachable
  // D-10: Language change only propagated when NOT currently recording
  if (!this.speechRecorder.isActive) {  // line 400 — never reached
    this.speechRecorder.setSettingsLanguage(this.settings.speechLanguage);
  }
  this.speechRecorder.setSettingsVadSensitivity(this.settings.speechVadSensitivity);
}
```

**Fix:** Remove the unreachable code block (lines 397-405). The active language-setting propagation at line 392 already handles the behavior correctly (the D-10 guard is implemented inside `SpeechRecorder.setSettingsLanguage` itself).

---

## Pipeline Analysis (Deep Review)

### Call Chain Trace

```
Microphone → AudioWorklet/ScriptProcessor [speech-capture.ts]
  → Float32Array chunk (4096 samples, ~256ms)
  → calculateRMS(chunk) [speech-recorder.ts:95]
  → if (rms < 0.001) return  [speech-recorder.ts:105] ← CR-01: SILENCE DROPPED
  → Buffer.from → base64 → JSON { type: "audio", bufferB64 }
  → asrStdin.write() [speech-recorder.ts:108]
  → Child process stdin → rl.on("line") [asr-worker.ts:37]
  → stream.acceptWaveform() → recognizer.decode() [asr-worker.ts:82-84]
  → recognizer.getResult() → full text [asr-worker.ts:86]
  → full.startsWith(prevText) → delta [asr-worker.ts:95] ← CR-02: NO REGRESSION HANDLING
  → stdout JSON { type: "result", text: delta, isEndpoint }
  → asrProcess.stdout "data" handler [speech-recorder.ts:145-155]
  → onAsrResult(text, isEndpoint) callback [speech-recorder.ts:153]
  → SentenceManager.addPartialText(text) [main.ts:1576]
  → SentenceManager.getPartialText() → full accumulated [main.ts:1577]
  → updateSpeechPreview(full) [main.ts:1577] ← WR-01: POSITION-BASED REMOVAL
  → editor.replaceRange("", start, cursor) → remove old preview
  → editor.replaceSelection(text) → insert new preview
```

### Endpoint Flow

```
Worker detects isEndpoint [asr-worker.ts:87]
  → endpointNow computed [asr-worker.ts:91]
  → recognizer.reset(stream) [asr-worker.ts:93] ← clears decoder state
  → delta emitted with isEndpoint=true
  → SentenceManager.finalizeSentence(text) [main.ts:1568]
  → _speechPreviewLen = 0  ← resets preview tracker but does NOT remove text
  → insertSpeechText(final)  ← appends AFTER existing preview
```

### Stop Flow

```
recorder.toggle() → stop() [speech-recorder.ts:226-239]
  → sends "reset" to worker [speech-recorder.ts:233]
  → cleanupCapture() [speech-recorder.ts:236]
  → toggleSpeechRecording continues [main.ts:1607-1618]
  → recorder.onAsrResult = null  ← prevent late-arriving results
  → remaining = getPartialText() [main.ts:1610]
  → finalizeSentence() uses accumulated partialText
  → insertSpeechText(final)  ← inserts full accumulated text
```

---

_Reviewed: 2026-05-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
