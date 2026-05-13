# Phase 2: ASR Model & Transcription - Context

**Gathered:** 2026-05-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Integrates sherpa-onnx WASM speech recognition into the Phase 1 audio pipeline. Audio chunks flow from microphone → SpeechRecorder → Web Worker (sherpa-onnx) → recognized text is inserted sentence-by-sentence at the editor cursor. Chinese-first with English switching. All processing local — zero network requests for recognition. First-run model download with guided setup.
</domain>

<decisions>
## Implementation Decisions

### ASR Model Integration
- **D-01:** Web Worker created lazily on first toggle (not in onload), managed by SpeechRecorder
- **D-02:** Model files stored in plugin directory subdirectory (`models/`), WASM loaded by relative path
- **D-03:** sherpa-onnx via WASM npm package (sherpa-onnx), NOT native addon
- **D-04:** Audio chunks transferred via SharedArrayBuffer between main thread and Worker (zero-copy)
- **D-05:** ASR init failure: button turns red + Notice with specific error + details in debug log

### Text Transcription & Editor Insertion
- **D-06:** Sentence boundary: 800ms silence + sentence-ending punctuation (。！？) as hard cut points
- **D-07:** Text insertion: sentence-by-sentence at cursor via editor.replaceSelection(text + " ")
- **D-08:** Concurrent keyboard input: save cursor position before insert, restore after (non-disruptive)
- **D-09:** Punctuation: post-processing adds trailing punctuation at detected sentence boundaries

### Language Switching & Auto-stop
- **D-10:** Language switch: destroy current Recognizer + rebuild with new language model (~3-5s)
- **D-11:** VAD: use sherpa-onnx built-in VAD (not custom RMS-based)
- **D-12:** Auto-stop countdown: button text overlay showing seconds remaining (e.g. "5s"), last second flashes
- **D-13:** Language switch UI: settings panel dropdown only (no toolbar quick-switch)

### Model Download Guide
- **D-14:** Download source: HuggingFace (huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-zh-14M-2023-02-23)
- **D-15:** Progress: Obsidian Notice showing percentage + "downloading..." text
- **D-16:** Checksum: automatic SHA256 verification after download, prompt retry on mismatch
- **D-17:** Failure: auto-retry 3 times, then show manual download link and steps

### Claude's Discretion
- Exact SharedArrayBuffer buffer size and ring buffer management strategy
- Web Worker code structure (inline blob vs separate file)
- sha256 implementation (Web Crypto API vs manual)
- Download retry backoff timing
- Recognizer configuration parameters (decoding method, beam size, etc.)
- Chinese model: zipformer-zh-14M INT8 (25MB) — recommended by STACK.md research
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project
- `.planning/PROJECT.md` — Core value, constraints, validated requirements
- `.planning/REQUIREMENTS.md` — v1 requirements SPEECH-03,06,07,08,11
- `.planning/ROADMAP.md` — Phase 2 goal + 5 success criteria

### Phase 1 Artifacts (carried forward)
- `.planning/phases/01-audio-capture-ui-foundation/01-CONTEXT.md` — Locked decisions (toolbar, CSS, i18n, settings)

### Research
- `.planning/research/STACK.md` — sherpa-onnx WASM recommendation, Zipformer 14M INT8 (25MB) model specs
- `.planning/research/ARCHITECTURE.md` — Web Worker architecture, component boundaries, data flow
- `.planning/research/PITFALLS.md` — AudioWorklet CSP (resolved), native addon ABI issues, model storage

### Existing Code
- `src/speech-recorder.ts` — 5-state machine, toggle/stop/forceStop, device monitoring
- `src/speech-capture.ts` — AudioWorklet/ScriptProcessorNode capture, RMS/dB calculation
- `src/main.ts` — toggleSpeechRecording(), insertTextAtCursor()
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/speech-recorder.ts`: SpeechRecorder class — extend to manage Worker lifecycle + audio chunk routing
- `src/speech-capture.ts`: AudioWorkletNode/ScriptProcessorNode fallback — reuse onAudioChunk callback
- `src/main.ts`: `toggleSpeechRecording()` (line 1059) — add ASR result handling here; `insertTextAtCursor()` (existing)
- `src/settings.ts`: speech section (model path, language, VAD, auto-stop) — all 4 fields already exist

### Established Patterns
- 5-state machine: idle/initializing/recording/processing/error — add new transitions for Worker init/deinit
- Snapshot-based rendering: RecorderSnapshot — extend with ASR status and partial text
- i18n: tr() function + TranslationKey union — add ASR-specific keys (~15 new)
- Settings normalization: normalizeLoadedSettings — new fields already handled by Phase 1

### Integration Points
- `SpeechRecorder.start()` → create Web Worker + init sherpa-onnx → route audio chunks
- `SpeechRecorder.stop()` → flush Worker → return final transcript
- `main.ts toggleSpeechRecording()` → handle ASR results → call insertTextAtCursor
- `src/view.ts` `buildToolbarSnapshot()` → add ASR loading/ready status
</code_context>

<specifics>
## Specific Ideas

- Model file directory: `.obsidian/plugins/link-tag-intelligence/models/` — separate from plugin code
- Download progress should show both percentage and MB downloaded / total MB
- Chinese model recommended: `sherpa-onnx-streaming-zipformer-zh-14M-2023-02-23` (INT8, ~25MB)
- English model: `sherpa-onnx-streaming-zipformer-en-2023-06-26` (INT8 variant if available)
- SharedArrayBuffer requires COOP/COEP headers — verify Electron supports or use ArrayBuffer fallback
</specifics>

<deferred>
## Deferred Ideas

- Partial result preview (show interim ASR output before sentence boundary) — v2 polish
- Voice-triggered link/tag detection — Phase 4 intelligence integration
- Full punctuation restoration model — v2
- Language code-switching (mixing zh+en mid-sentence) — v2
</deferred>

---

*Phase: 02-asr-model-transcription*
*Context gathered: 2026-05-13*
