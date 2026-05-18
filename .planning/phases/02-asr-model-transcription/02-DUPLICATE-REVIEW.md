---
phase: 02-asr-model-transcription
reviewed: 2026-05-14T00:00:00Z
depth: deep
files_reviewed: 3
files_reviewed_list:
  - src/asr-worker.ts
  - src/speech-recorder.ts
  - src/main.ts
findings:
  critical: 3
  warning: 3
  info: 2
  total: 8
status: issues_found
---

# Phase 02: ASR Model Transcription — Duplicate Text Bug Review (Updated)

**Reviewed:** 2026-05-14
**Depth:** deep (cross-file pipeline trace)
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Traced the complete audio-to-text call chain: `asr-worker.ts` (sherpa-onnx WASM, LCP delta computation) -> `speech-recorder.ts` (child process spawn, stdin/stdout bridge) -> `main.ts` (SentenceManager, endpoint handler, stop-flush logic).

Previous fixes correctly removed the silence gate (was CR-01) and replaced `startsWith` with LCP in the worker (was CR-02). However, the duplicate-text-at-stop bug persists because of three NEW root causes in `main.ts`, all centering on incorrect interaction between `SentenceManager` and the endpoint/stop-flush handlers.

The `updateSpeechPreview` mechanism (which inserts partial text as a live preview in the editor) is currently **dead code** — defined in `main.ts:1622` but never called. This means partial text accumulates silently in `SentenceManager.partialText` without any visual feedback during recording. If this preview were wired up, the stop-flush logic would reliably produce duplicates. Even without the preview active, the endpoint handler **discards all accumulated partial text** when finalizing (CR-01), causing text loss on every endpoint fire.

---

## Critical Issues

### CR-01: `finalizeSentence(text)` discards all accumulated partial text on endpoint

**File:** `src/main.ts:65` (definition), `src/main.ts:1567` (call site)
**Issue:** The `onAsrResult` endpoint handler calls `finalizeSentence(text)` where `text` is the worker's delta — the *new characters since the last `getResult()`*. `finalizeSentence(text)` uses `text` directly and clears `this.partialText` without reading it. All text accumulated via `addPartialText` calls during that utterance is irrevocably thrown away.

**Detailed trace:**

```
Worker (asr-worker.ts):
  Chunk N-2: getResult() = "假设检验检验方差", prevText = "假设检验", delta = "检验方差"
    → sent as non-endpoint partial
  Chunk N-1: getResult() = "假设检验检验方差协方差", prevText = "假设检验检验方差", delta = "协方差"
    → sent as non-endpoint partial
  Chunk N:   getResult() = "假设检验检验方差协方差经济订货批量", prevText = "假设检验检验方差协方差"
    → delta = "经济订货批量", isEndpoint = true, prevText = full text
    → sent as endpoint

main.ts SentenceManager:
  After Chunk N-2: addPartialText("检验方差"), partialText = "假设检验检验方差"
  After Chunk N-1: addPartialText("协方差"),   partialText = "假设检验检验方差协方差"
  After Chunk N:   finalizeSentence("经济订货批量")  ← endpoint handler
    → sentence = "经济订货批量"     (uses text arg, ignores partialText!)
    → this.partialText = ""         (thrown away without being used)
    → returns "经济订货批量"
    → insertSpeechText("经济订货批量")   // only the delta inserted
    // "假设检验检验方差协方差" IS LOST — never inserted into the editor
```

The test at `tests/speech-asr.test.ts:86-92` encodes this behavior as if it were correct design:

```typescript
it("accepts explicit text parameter overriding buffer", () => {
    const mgr = new SentenceManager(createPlugin("zh"));
    mgr.addPartialText("partial");
    const result = mgr.finalizeSentence("你好世界");
    expect(result).toBe("你好世界");    // "partial" silently discarded
    expect(mgr.getPartialText()).toBe("");
});
```

This test **codifies the bug**. The `text` override parameter exists only because the caller passes the worker delta, but the correct contract is that the endpoint handler should finalize the FULL accumulated text, not the delta.

**Fix:**

Change the endpoint handler to call `finalizeSentence()` **without arguments**. This uses `this.partialText` (the complete accumulated text):

```typescript
// main.ts, onAsrResult handler (currently lines 1564-1576)
recorder.onAsrResult = (text, isEndpoint) => {
    if (!text) return;
    if (isEndpoint) {
        // FIXED: finalize the FULL accumulated text, not just the worker delta
        const finalSentence = this._sentenceManager!.finalizeSentence();
        this._speechPreviewLen = 0;
        if (finalSentence) {
            this.insertSpeechText(finalSentence);
            sessionCharsInserted += finalSentence.length;
        }
    } else {
        this._sentenceManager!.addPartialText(text);
    }
};
```

The `text` parameter on `finalizeSentence` can then be removed (it only exists to support this broken call pattern). The test at `tests/speech-asr.test.ts:86-92` should be updated to reflect the new contract.

---

### CR-02: Stop-flush `remaining.slice(sessionCharsInserted)` is fundamentally broken

**File:** `src/main.ts:1606-1612`
**Issue:** The stop-flush comparison `remaining.length > sessionCharsInserted` compares two unrelated quantities:

- `sessionCharsInserted` — **cumulative sum** of ALL endpoint-inserted character counts across the **entire recording session**
- `remaining.length` — length of the **current partial buffer** (text since last endpoint)

This comparison is only accidentally correct when zero endpoints have fired. Once any endpoint fires, it either silently drops new text or produces duplicates.

**Behavior matrix:**

| Scenario | sessionCharsInserted | remaining | `remaining.length > sessionCharsInserted` | Result |
|----------|---------------------|-----------|-------------------------------------------|--------|
| No endpoints, 200 chars partial | 0 | 200 chars | TRUE | All 200 chars inserted (correct by accident) |
| 1 endpoint (100 chars), 10 new chars | 100 | 10 chars | FALSE | **10 new chars silently LOST** |
| 3 endpoints (500 chars), 30 new chars | 500 | 30 chars | FALSE | **30 new chars silently LOST** |
| 1 endpoint (5 chars), 100 new chars | 5 | 100 chars | TRUE | `remaining.slice(5)` → **first 5 chars LOST** |

**The duplication path (when live preview is active):**

If `updateSpeechPreview` were wired up (which it should be for a good UX), the stop-flush logic creates a reliable duplication scenario:

1. During recording: `updateSpeechPreview` inserts partial text "ABCDEF" into the editor as a live preview.
2. No endpoint fires for this text. `sessionCharsInserted = 0`.
3. Stop: `remaining = getPartialText()` = "ABCDEF" (same text as the live preview).
4. `remaining.length (6) > sessionCharsInserted (0)` → TRUE.
5. `remaining.slice(0)` = "ABCDEF" inserted via `insertSpeechText`.
6. Result: "ABCDEF" appears twice — once from the live preview, once from the stop flush.

**Fix:**

Replace the broken comparison with a simple `finalizeSentence()` call without arguments. This eliminates the need for `sessionCharsInserted` entirely:

```typescript
// main.ts, stop flush (currently lines 1604-1615)
if (wasRecording && !recorder.isActive && this._sentenceManager) {
    recorder.onAsrResult = null;
    // FIXED: Just finalize whatever is in the SentenceManager buffer.
    // SentenceManager tracks its own partialText — no external counter needed.
    const remaining = this._sentenceManager.finalizeSentence();
    if (remaining) {
        this.insertSpeechText(remaining);
    }
    this._speechPreviewLen = 0;
    this.cancelAutoStopTimer();
}
```

---

### CR-03: Race condition — `onAsrResult` nulled after `toggle()` returns instead of before

**File:** `src/main.ts:1587-1605`
**Issue:** The stop sequence is:

```
1. await recorder.toggle(t)       // calls stop() → sends "reset" to worker, stops microphone
2. recorder.onAsrResult = null    // handler nulled AFTER toggle returns  ← RACE WINDOW
3. remaining = getPartialText()   // stop flush
```

Between steps 1 and 2, the worker may still be processing audio chunks that were already in the stdin pipeline before the microphone was stopped. Any results produced in this window fire the `onAsrResult` handler, which can:

- Add text to `partialText` via non-endpoint results
- Insert text into the editor via endpoint results (clearing `partialText` in the process)

This makes the state of `partialText` at step 3 unpredictable. An endpoint firing during the race window clears `partialText`, causing the stop flush to find an empty buffer and insert nothing — even though the user expected the accumulated partial text to be finalized.

**Fix:**

Null the handler BEFORE calling `toggle()`:

```typescript
// main.ts, toggleSpeechRecording() — BEFORE the toggle call
const wasRecording = recorder.getSnapshot().phase === "recording";

if (wasRecording) {
    // FIXED: Null handler before stopping to prevent race
    recorder.onAsrResult = null;
}

const errorKey = await recorder.toggle(
    (key, vars) => this.t(key as Parameters<typeof this.t>[0], vars)
);

// ... error handling ...

if (wasRecording && !recorder.isActive && this._sentenceManager) {
    // onAsrResult already nulled above — no need to repeat
    const remaining = this._sentenceManager.finalizeSentence();
    if (remaining) {
        this.insertSpeechText(remaining);
    }
    this._speechPreviewLen = 0;
    this.cancelAutoStopTimer();
}
```

---

## Warnings

### WR-01: Worker `prevText` not reset on endpoint — can cause delta truncation across utterances

**File:** `src/asr-worker.ts:93,102`
**Issue:** When an endpoint fires, the stream is reset (`recognizer.reset(stream)` on line 93) but `prevText` retains the pre-reset text (e.g., "经济订货批量库存模型"). The next utterance's first `getResult()` produces fresh text from the empty stream. The LCP comparison against the stale `prevText` can incorrectly consume new characters:

```javascript
// After endpoint: prevText = "经济订货批量库存模型" (stale)
// Stream reset — fresh decoder state
// Next chunk: getResult() = "经济数据" (new utterance)
// LCP("经济数据", "经济订货批量库存模型") → commonLen = 2
// delta = "数据"  ← "经济" consumed by LCP — it's actually NEW text!
// prevText = "经济数据"
```

While `reset(stream)` clears the decoder, the LCP-based delta computation uses `prevText` which was not reset. If the new utterance happens to start with characters that also appear at the beginning of the previous utterance, those characters are incorrectly treated as "already sent."

**Fix:**

```javascript
// asr-worker.ts, inside the "audio" case, at endpoint detection (line 93)
if (isEndpoint) {
    recognizer.reset(stream);
    prevText = "";        // FIXED: reset text tracking for new utterance
    prevWasEndpoint = false;
}
```

---

### WR-02: `speechRecorder.destroy()` called twice in `onunload()`

**File:** `src/main.ts:377,380`
**Issue:** `onunload()` calls `this.speechRecorder.destroy()` on both line 377 and line 380:

```typescript
onunload(): void {
    this.speechRecorder.destroy();  // line 377
    this.referencePreview.destroy();
    this.cancelAutoStopTimer();
    this.speechRecorder.destroy();  // line 380 — DUPLICATE
}
```

While `destroy()` is idempotent (it null-checks before operating), the duplicate call indicates a copy-paste or merge error.

**Fix:** Remove the duplicate call on line 380.

---

### WR-03: `updateSpeechPreview` is dead code — live preview mechanism not wired up

**File:** `src/main.ts:1620-1635`
**Issue:** The `updateSpeechPreview` method and `_speechPreviewLen` field are defined but never called. The non-endpoint branch of `onAsrResult` only calls `addPartialText(text)` without providing any visual feedback:

```typescript
} else {
    this._sentenceManager!.addPartialText(text);
    // MISSING: this.updateSpeechPreview(this._sentenceManager!.getPartialText());
}
```

Consequences:
- During recording, the user sees NO live transcription preview in the editor
- Text only appears in the editor when an endpoint fires (and even then, only the delta — see CR-01)
- `_speechPreviewLen` is always 0 (only ever set to 0 in the endpoint handler and stop flush)

**Fix:** Wire up the preview call:

```typescript
} else {
    this._sentenceManager!.addPartialText(text);
    this.updateSpeechPreview(this._sentenceManager!.getPartialText());
}
```

**Important:** If this fix is applied, CR-02 (the stop-flush fix) MUST be applied simultaneously, or the stop flush will insert the same text that the preview already showed, causing duplication.

Additionally, the preview removal mechanism has a design weakness: it removes text by counting characters backward from the current cursor position (line 1629). If the user types, deletes, or moves the cursor during recording, the preview removal targets the wrong text. Consider tracking the preview insertion position explicitly rather than deriving it from cursor position.

---

## Info

### IN-01: `sessionCharsInserted` variable is unnecessary after CR-02 fix

**File:** `src/main.ts:1561` (declaration), `1571` (increment), `1609-1610` (usage)
**Issue:** The `sessionCharsInserted` variable exists solely to power the broken `remaining.slice(sessionCharsInserted)` comparison (CR-02). After fixing CR-02 by calling `finalizeSentence()` at stop, this variable serves no purpose and should be removed. It currently acts as dead code that obscures the intent of the stop-flush logic.

**Fix:** Remove `sessionCharsInserted` after applying CR-01 and CR-02 fixes.

---

### IN-02: Unreachable code after `return` in `saveSettings`

**File:** `src/main.ts:396-405`
**Issue:** The `saveSettings` method has a `return` on line 396 followed by unreachable code (lines 398-405) containing duplicate language/VAD propagation logic. The comment on line 398 acknowledges this is unreachable:

```typescript
await this.saveData(this.settings);
return;
// Propagation handled above — this block is unreachable  ← line 398
// D-10: Language change only propagated when NOT currently recording
if (!this.speechRecorder.isActive) {     // never reached
    this.speechRecorder.setSettingsLanguage(this.settings.speechLanguage);
}
this.speechRecorder.setSettingsVadSensitivity(this.settings.speechVadSensitivity);
```

The active language-setting propagation at lines 392-394 already handles this correctly.

**Fix:** Remove the unreachable code block (lines 397-405).

---

## Cross-Module Call Chain (Deep Review)

### Complete Audio-to-Text Data Flow

```
Microphone → speech-capture.ts (MediaStream, AudioWorklet)
  │  Float32Array chunks, ~256ms each
  │  startCapture(onChunk), calculateRMS()
  ▼
SpeechRecorder (speech-recorder.ts)
  │  Chunks → base64 → JSON line → child_process stdin
  │  Throttled RMS at 60ms → RecorderSnapshot → view.ts toolbar
  │  NO silence gate (all chunks sent to worker)
  ▼
Node.js child process: spawn("node", asr-worker.js)
  │  stdin line → JSON.parse → Float32Array → acceptWaveform()
  │  decode() → getResult() → isEndpoint()
  │  LCP delta computation: full.slice(lcpLen)
  │  On endpoint: reset(stream), prevWasEndpoint=false
  │  BUG: prevText NOT reset → stale state across utterances (WR-01)
  │  Result: {type:"result", text:delta, isEndpoint}
  │  stdout → JSON line
  ▼
SpeechRecorder.stdout.on("data") (speech-recorder.ts:145)
  │  Line-buffered JSON parsing with partial-line handling
  │  Dispatches to this.onAsrResult(text, isEndpoint)
  ▼
LinkTagIntelligencePlugin.onAsrResult (main.ts:1564)
  │  [RACE WINDOW on stop — handler active after mic stops (CR-03)]
  │
  │  if isEndpoint:
  │    finalizeSentence(text)         ← BUG: text arg overrides partials (CR-01)
  │    insertSpeechText(final)
  │    sessionCharsInserted += len
  │  else:
  │    addPartialText(text)           ← NO preview update (WR-03)
  │
  │  On stop:
  │    remaining = getPartialText()
  │    remaining.slice(sessionCharsInserted)  ← BUG: unrelated comparison (CR-02)
  │    insertSpeechText(extra)
  ▼
insertSpeechText (main.ts:1637)
  │  editor.replaceSelection(text + " ")
  │  Text inserted at cursor position in active MarkdownView
  ▼
Obsidian Editor
```

### State Variable Map

| Variable | Module | Writes | Reads | Problem |
|----------|--------|--------|-------|---------|
| `prevText` | asr-worker | Every audio chunk (line 102) | LCP delta (line 99-101) | Not reset on endpoint (WR-01) |
| `prevWasEndpoint` | asr-worker | Endpoint detection (line 92) | Endpoint debounce (line 91) | OK after previous fix |
| `partialText` | SentenceManager | `addPartialText()`, cleared by `finalizeSentence()` | `getPartialText()`, `finalizeSentence()` | Discarded when `finalizeSentence(text)` called with arg (CR-01) |
| `sessionCharsInserted` | main.ts | Endpoint handler only (line 1571) | Stop flush (line 1609-1610) | Broken comparison — should be removed (CR-02, IN-01) |
| `_speechPreviewLen` | main.ts | Only set to 0 (lines 1568, 1593, 1613) | `updateSpeechPreview()` if called | Dead code — never set to positive value (WR-03) |
| `recorder.onAsrResult` | main.ts | In toggleSpeechRecording (line 1564, 1605) | speech-recorder stdout (line 153) | Nulled AFTER toggle (CR-03) |
| `asrProcess` | speech-recorder | start(), killAsrProcess(), destroy() | stdout/stderr handlers, stdin writes | OK |

### Fix Application Order (interdependent)

1. **WR-01** (`asr-worker.ts:93`): Reset `prevText = ""` on endpoint.
2. **CR-03** (`main.ts:1587-1588`): Null `onAsrResult` before calling `toggle()` on stop.
3. **CR-01** (`main.ts:1567`): Change endpoint handler to call `finalizeSentence()` without args.
4. **CR-02** (`main.ts:1606-1612`): Replace broken stop-flush with clean `finalizeSentence()`.
5. **WR-03** (`main.ts:1576`): Wire up `updateSpeechPreview` in non-endpoint branch (after CR-02 is applied).
6. **IN-01** (`main.ts:1561,1571,1609-1610`): Remove dead `sessionCharsInserted` variable.
7. **IN-02** (`main.ts:397-405`): Remove unreachable code after `return`.
8. **WR-02** (`main.ts:380`): Remove duplicate `speechRecorder.destroy()` call.

---

_Reviewed: 2026-05-14T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
