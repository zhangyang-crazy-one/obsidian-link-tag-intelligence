# Architecture Research: Real-Time Speech Recognition in Obsidian Plugin

**Domain:** Local speech-to-text in Electron/Obsidian plugin
**Researched:** 2026-05-12
**Confidence:** MEDIUM (sherpa-onnx integration pattern verified via sokuji reference; model size tradeoffs need phase-specific validation)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                      OBSIDIAN APPLICATION                         │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    RENDERER PROCESS                        │   │
│  │                                                            │   │
│  │  ┌──────────┐   postMessage   ┌──────────────────────┐   │   │
│  │  │  Audio   │ ───────────────→│   WEB WORKER          │   │   │
│  │  │ Capture  │  (AudioBuffer)  │                        │   │   │
│  │  │          │←─ ─ ─ ─ ─ ─ ─ ─│  sherpa-onnx WASM      │   │   │
│  │  │ Navigator│  (text chunks)  │                        │   │   │
│  │  │ .media   │                 │  Model: Zipformer CN   │   │   │
│  │  │ Devices  │                 │  + VAD + Streaming     │   │   │
│  │  └──────────┘                 └──────────────────────┘   │   │
│  │       │                                │                  │   │
│  │       │                       postMessage(text)            │   │
│  │       │                                │                  │   │
│  │       ▼                                ▼                  │   │
│  │  ┌────────────────────────────────────────────────────┐  │   │
│  │  │               SPEECH STATE MANAGER                   │  │   │
│  │  │  (in Plugin instance: isRecording, pendingText,      │  │   │
│  │  │   currentLanguage, audioLevel)                       │  │   │
│  │  └──────────────┬──────────────────┬───────────────────┘  │   │
│  │                 │                  │                       │   │
│  │                 ▼                  ▼                       │   │
│  │  ┌──────────────────┐  ┌──────────────────────────────┐  │   │
│  │  │  Toolbar Button   │  │   Editor Text Insertion       │  │   │
│  │  │  (view.ts)        │  │   (main.ts: insertTextAtCursor│  │   │
│  │  │  record/stop icon │  │    → editor.replaceSelection) │  │   │
│  │  └──────────────────┘  └──────────────────────────────┘  │   │
│  │                                                            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                     PLUGIN CORE (main.ts)                  │   │
│  │  addCommand("start-speech") / addCommand("stop-speech")   │   │
│  │  settings.speechLanguage / settings.speechModelPath       │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| Audio Capture | Access microphone via `navigator.mediaDevices.getUserMedia()`, produce `AudioBuffer` chunks at configurable intervals (100ms), calculate audio level for UI indicator | `src/speech-capture.ts` |
| Web Worker | Run sherpa-onnx WASM inference off main thread, receive audio buffers, emit transcribed text via `postMessage` | `src/speech-worker.ts` (inline worker, bundled by esbuild) |
| Speech State Manager | Track recording state (idle/recording/processing), buffer partial text, manage language setting, coordinate capture-worker-output lifecycle | Plugin instance fields + `src/speech.ts` |
| Toolbar Button | Toggle recording via toolbar button with visual state (idle/recording/disabled), show audio level indicator | `src/view.ts` (ToolbarButtonSnapshot extension) |
| Editor Text Insertion | Receive final text segments from state manager, insert at current cursor position via editor API | Existing `insertTextIntoEditor()` in `src/main.ts` |
| Settings | Model path, default language (zh/en), VAD sensitivity, auto-stop timeout | `src/settings.ts` |
| i18n | All speech-related strings (start/stop labels, error messages, status texts) | `src/i18n.ts` |

## Process Model: Web Worker (Recommended)

### Decision: Web Worker with sherpa-onnx WASM

**Why Web Worker over alternatives:**

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **Web Worker (sherpa-onnx WASM)** | Zero native deps, WASM works cross-platform, off-main-thread, proven in Electron (sokuji), WebGPU fallback | Worker needs to load WASM binary (~20-40MB + model), initial load latency 2-5s | **RECOMMENDED** |
| Main thread WASM | Simplest code path | Would block UI during inference -- violates <100ms constraint | **REJECTED** |
| child_process (whisper.cpp) | Follows existing ingestion.ts pattern, mature tooling | Non-streaming (Whisper is chunk-based), needs process lifecycle management, C++ build deps, chunked audio loses real-time feel | **REJECTED** for real-time use |
| Local HTTP server | Simple request/response | Violates "no extra framework" constraint, requires user to run separate server, adds setup friction | **REJECTED** |

**Why sherpa-onnx specifically:**
- Supports **Zipformer** models which are true streaming (not chunked Whisper) -- critical for real-time sentence-by-sentence output
- Chinese Zipformer models available in the sherpa-onnx model zoo
- WASM deployment = zero `node-gyp` / native addon pain across Windows/macOS/Linux
- WebGPU acceleration when available (Chromium in Electron supports WebGPU since v113+)
- The **sokuji** project (Electron 40 + React) proves this exact architecture works in production for live speech translation
- Single framework handles the entire pipeline: ASR + VAD + optional TTS

### Worker Lifecycle

```
Plugin load → create Worker from bundled inline worker script
              (lazy: only on first speech command trigger)
              ↓
Start recording → Worker.postMessage({ type: "init", modelPath, language })
                  (loads WASM + model, ~2-5s on first use)
              ↓
Audio chunk ready → Worker.postMessage({ type: "audio", data: Float32Array })
              ↓
Partial result → Worker.postMessage({ type: "partial", text: "今天天气" })
              ↓
Final segment → Worker.postMessage({ type: "final", text: "今天天气很好。" })
              ↓
Stop recording → Worker.postMessage({ type: "stop" })
              ↓
Plugin unload → Worker.terminate()
```

## Recommended Project Structure

```
src/
├── speech.ts              # Speech state management, command coordination, text dispatch
├── speech-capture.ts      # AudioContext wrapper, mic access, audio level metering
├── speech-worker.ts       # Web Worker entry: sherpa-onnx WASM initialization, audio feeding, result streaming
├── settings.ts            # ADD: speechLanguage ('zh'|'en'), speechModelPath, vadSensitivity, autoStopTimeoutSec
├── i18n.ts                # ADD: speech-related translation keys (~15 new keys)
├── view.ts                # ADD: record/stop toolbar button in ToolbarButtonSnapshot, audio level indicator
├── main.ts                # ADD: start-speech / stop-speech commands, registerEvent for hotkey, Worker lifecycle
└── ... (existing files unchanged)
```

### Structure Rationale

- **`speech.ts`:** State coordination module (pure functions + plugin-owned state). Follows the existing domain module pattern of `tags.ts` / `references.ts` -- exports typed interfaces and functions consumed by the plugin core.
- **`speech-capture.ts`:** Audio subsystem isolated from recognition. Can be tested independently with mock AudioContext. Follows single-responsibility: only deals with browser Media APIs.
- **`speech-worker.ts`:** Self-contained Worker file. esbuild can bundle this as a separate entry point or embed it inline. No dependency on Obsidian API -- only sherpa-onnx WASM and standard Worker APIs.
- **Why no `speech/` subdirectory:** The project convention is flat `src/` with no nested directories (per STRUCTURE.md). Three speech files match the complexity level of existing modules like `ingestion.ts` + `semantic.ts` + `companion-plugins.ts` (external integration cluster).

## Architectural Patterns

### Pattern 1: Worker-Isolated ML Inference

**What:** Heavy computation (ML model inference) runs in a Web Worker, communicating with the main thread exclusively via `postMessage`. The main thread never touches the WASM module directly.

**When to use:** Any ML inference that takes >16ms (one frame). Speech recognition takes 50-200ms per chunk -- well above the threshold.

**Trade-offs:**
- Pro: Main thread stays responsive (meets <100ms blocking constraint)
- Pro: Worker can be terminated cleanly on plugin unload
- Pro: Natural boundary -- all audio data stays in the Worker, text only leaves
- Con: Worker initialization latency (WASM + model load = 2-5s first time)
- Con: Cannot directly call Obsidian APIs from Worker (must postMessage text back)
- Con: Debugging Worker code is harder than main thread code

**Example:**
```typescript
// main.ts - Plugin side
const worker = new Worker(
  URL.createObjectURL(new Blob([workerCode], { type: "text/javascript" }))
);

worker.onmessage = (e: MessageEvent<SpeechWorkerMessage>) => {
  if (e.data.type === "final") {
    this.insertTextAtCursor(e.data.text);
  } else if (e.data.type === "partial") {
    this.speechPartialText = e.data.text;
  }
};

worker.postMessage({ type: "init", modelPath: "/path/to/model", language: "zh" });
```

### Pattern 2: Command + Toolbar Dual Trigger

**What:** A single toggle action can be invoked from both an Obsidian command (keyboard shortcut) and a sidebar toolbar button. State is centralized in the Plugin instance; both triggers call the same `toggleSpeechRecognition()` method.

**When to use:** User requirement specifies both keyboard shortcut (primary) and button (visual indicator).

**Trade-offs:**
- Pro: Single source of truth for recording state
- Pro: Toolbar button serves dual purpose: trigger + status indicator
- Pro: Follows existing pattern (commands already registered in main.ts; toolbar already in view.ts)
- Con: Slight coupling: view.ts needs a reference to plugin's toggle method

**Example:**
```typescript
// main.ts
this.addCommand({
  id: "start-speech-recognition",
  name: tr(settings.language, "speech.start"),
  callback: () => this.toggleSpeechRecognition(),
});

// view.ts - toolbar button callback
button.addEventListener("click", () => {
  plugin.toggleSpeechRecognition();
});
```

### Pattern 3: Signature-Based UI Diffing (Existing, Extended)

**What:** The toolbar snapshot includes a `speechRecording: boolean` and `speechAudioLevel: number` field. `applyToolbarSnapshot` diffs against previous signature and only updates DOM when the recording state changes.

**When to use:** Any UI state that changes frequently (audio level updates at ~30fps).

**Trade-offs:**
- Pro: Avoids DOM thrashing from high-frequency audio level updates
- Pro: Follows existing pattern in view.ts (toolbar already uses signature diffing)
- Con: Audio level must be throttled to ~30fps to avoid excessive snapshot rebuilding

## Data Flow

### Speech Recognition Flow

```
User presses hotkey / clicks toolbar button
    ↓
Plugin.toggleSpeechRecognition()
    ↓
State: idle → recording
    ↓
┌─────────────────────────────────────────────────────────────┐
│  AUDIO CAPTURE LOOP (speech-capture.ts)                     │
│                                                              │
│  audioContext = new AudioContext({ sampleRate: 16000 })      │
│  stream = await navigator.mediaDevices.getUserMedia(...)     │
│  source = audioContext.createMediaStreamSource(stream)       │
│  processor = audioContext.createScriptProcessor(4096, 1, 1)  │
│                                                              │
│  processor.onaudioprocess = (e) => {                         │
│    chunk = e.inputBuffer.getChannelData(0)  // Float32Array  │
│    level = calculateRMS(chunk)              // for UI meter  │
│    worker.postMessage({ type: "audio", data: chunk })        │
│    updateAudioLevel(level)  // throttled to 30fps            │
│  }                                                           │
└──────────────────────┬──────────────────────────────────────┘
                       │ postMessage(audio chunk, every ~100ms)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  WORKER: SHERPA-ONNX WASM (speech-worker.ts)                 │
│                                                              │
│  // Initialize once                                          │
│  const recognizer = sherpaOnnx.createOnlineRecognizer({...}) │
│                                                              │
│  // Per chunk:                                               │
│  recognizer.acceptWaveform(samples, sampleRate)              │
│                                                              │
│  // Check for results:                                       │
│  while (recognizer.isReady()) {                              │
│    recognizer.decode()                                       │
│    const text = recognizer.getResult().text                  │
│    if (isPartial) → postMessage({ type: "partial", text })   │
│    if (isFinal)   → postMessage({ type: "final", text })     │
│  }                                                           │
└──────────────────────┬──────────────────────────────────────┘
                       │ postMessage(text segment)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  PLUGIN STATE MANAGER (speech.ts + main.ts)                  │
│                                                              │
│  onmessage("final"):                                        │
│    → this.insertTextAtCursor(text + punctuation)             │
│    → (editor.replaceSelection or editor.replaceRange)        │
│                                                              │
│  onmessage("partial"):                                       │
│    → this.speechPartialText = text                           │
│    → (not inserted, but could show inline preview)           │
│                                                              │
│  onmessage("error"):                                         │
│    → new Notice(tr(lang, errorKey))                          │
│    → State: recording → idle                                 │
└─────────────────────────────────────────────────────────────┘
```

### State Management

```
Plugin instance fields (in-memory, not persisted):
  speechWorker: Worker | null
  speechState: "idle" | "loading" | "recording" | "error"
  speechLanguage: "zh" | "en"
  speechPartialText: string
  speechAudioLevel: number      // 0.0 - 1.0, for UI meter
  speechModelLoading: boolean   // true during initial WASM load

Settings (persisted via obsidian loadData/saveData):
  speechModelPath: string       // path to sherpa-onnx model directory
  speechLanguage: "zh" | "en"
  speechVadSensitivity: number  // 0-3, default 2
  speechAutoStopSec: number     // auto-stop after silence, default 30
```

### Key Data Flows

1. **Audio → Text:** `Microphone → AudioContext → Float32Array chunks → Worker postMessage → WASM inference → postMessage(text) → Plugin.insertTextAtCursor()`
2. **State → UI:** `Plugin.speechState change → view.buildSnapshot() → applyToolbarSnapshot() → button class toggle (lti-recording) + audio level bar`
3. **Command → Recording:** `Obsidian command / toolbar click → Plugin.toggleSpeechRecognition() → (if idle) start capture + init worker / (if recording) stop capture + flush worker`

## Integration Points

### Plugin Core (main.ts)

| Integration | Mechanism | Details |
|-------------|-----------|---------|
| Command registration | `addCommand()` | Two commands: `start-speech-recognition`, `stop-speech-recognition` (or one toggle) |
| Hotkey conflict detection | `addCommand()` editor context check | Only active when a Markdown editor is focused |
| Worker lifecycle | `registerEvent()` for cleanup | Worker terminated in `onunload()`, wrapped in `registerEvent` for auto-cleanup |
| Text insertion | `insertTextAtCursor()` (existing method, line 709) | Reuse existing method that calls `editor.replaceSelection(text)` |
| Sidebar view refresh | `refreshAllViews()` | After recording state change, refresh to update toolbar button appearance |

### Sidebar View (view.ts)

| Integration | Mechanism | Details |
|-------------|-----------|---------|
| Toolbar button | `ToolbarButtonSnapshot` | New entry: `{ key: "speech-record", label: "...", iconClass: "lti-icon-mic", tooltip: "...", disabled: false, active: false }` |
| Button state classes | `lti-toolbar-button-recording` | CSS class toggled when `speechRecording === true` |
| Audio level indicator | New toolbar sub-element | `<div class="lti-audio-level">` with CSS `width` driven by `speechAudioLevel`, rendered inside or adjacent to record button |
| Snapshot rebuild | `buildToolbarSnapshot()` | Add logic to read `plugin.speechState` and `plugin.speechAudioLevel` |

### Settings (settings.ts)

| Setting | Type | Default | Notes |
|---------|------|---------|-------|
| `speechModelPath` | `string` | `""` | Path to sherpa-onnx model directory. User must download model separately (first-run guide in settings description). |
| `speechLanguage` | `"zh" \| "en"` | `"zh"` | Matches existing language system in i18n |
| `speechVadSensitivity` | `number` | `2` | 0 (least sensitive) to 3 (most sensitive). Maps to sherpa-onnx VAD config. |
| `speechAutoStopSec` | `number` | `30` | Seconds of silence before auto-stop. 0 = disabled. |

### Editor (CodeMirror 6)

| Integration | Mechanism | Details |
|-------------|-----------|---------|
| Text insertion | `editor.replaceSelection(text)` | Insert at cursor. Each final sentence segment is inserted independently. |
| Selection before insertion | `editor.getCursor()` | Save cursor position before recording starts (user may move cursor during recording -- insert at where cursor is NOW, not where it was) |
| Multi-cursor | Not supported | If editor has multiple selections, use the primary (last) cursor |

### ESLint / TypeScript Configuration

| Need | Change | Rationale |
|------|--------|-----------|
| Web Worker bundling | Add `speech-worker.ts` as esbuild entry or inline | Worker must be a separate JS file accessible at runtime |
| WASM file serving | Model files must be accessible at a known path | User specifies path in settings; plugin reads via Node.js `fs` from vault base path |
| sherpa-onnx types | `npm install sherpa-onnx-node` or use `@types/` | Type definitions for the sherpa-onnx JavaScript API |

## Anti-Patterns

### Anti-Pattern 1: Main Thread ML Inference

**What people do:** Load the WASM module directly in the renderer process and call `recognizer.decode()` synchronously.

**Why it's wrong:** WASM execution blocks the main thread for 50-200ms per audio chunk. This causes editor lag, missed keystrokes, and violates the <100ms blocking constraint.

**Do this instead:** Always run sherpa-onnx in a Web Worker. The architecture above isolates all WASM execution to the worker thread.

### Anti-Pattern 2: Chunked Transcription for Real-Time

**What people do:** Record audio, save to file, send entire file to Whisper for transcription, display result.

**Why it's wrong:** This is NOT real-time. Whisper is trained on 30-second chunks and cannot produce incremental output. Users would wait 2-10 seconds per sentence with no feedback.

**Do this instead:** Use a streaming ASR model (Zipformer via sherpa-onnx) that produces partial and final results as the user speaks. This gives sentence-by-sentence output with <1s latency.

### Anti-Pattern 3: Bundling Model Files in Plugin

**What people do:** Ship ASR model weights inside the plugin's `main.js` bundle or as base64-encoded data URIs.

**Why it's wrong:** Model files are 50-200MB. Bundling would make the plugin 500x larger than the rest of the plugin combined. It would break GitHub release size limits and slow every update download.

**Do this instead:** User downloads model files once to a local directory. The plugin setting `speechModelPath` points to this directory. Provide clear first-run setup instructions with download links to sherpa-onnx model zoo.

### Anti-Pattern 4: AudioContext Not Resumed

**What people do:** Create AudioContext in the plugin `onload()` and expect it to work immediately.

**Why it's wrong:** Modern browsers (including Chromium in Electron) require AudioContext to be created or resumed in response to a user gesture (click, keypress). Creating it during plugin load will leave it in "suspended" state.

**Do this instead:** Create AudioContext lazily inside the command/toolbar click handler (a user gesture). Check `audioContext.state === "suspended"` and call `audioContext.resume()` before starting capture.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1 user, short sessions | Single Worker, no caching -- WASM/model loaded on first use each session. Acceptable 2-5s init delay. |
| Power user, long sessions | Consider keeping Worker alive between sessions. Model stays in memory (~500MB). Add idle timeout (5 min) to terminate. |
| Multiple languages (future) | Worker loads one model at a time. Language switch unloads current model, loads new one (2-5s delay). Optionally preload both if memory permits. |

### Scaling Priorities

1. **Main thread responsive:** Web Worker solves this definitively. No optimization needed at launch.
2. **Model load time:** 2-5s first load. Acceptable for v1. Optimize later with model caching or persistent Worker.
3. **Memory pressure:** Large model in Worker's memory space. Monitor with `performance.memory` and provide clear documentation on model size selection.

## Sources

- [sherpa-onnx: Open-source speech framework with WASM/WebGPU support](https://github.com/k2-fsa/sherpa-onnx) -- HIGH confidence, official project
- [sokuji: Production Electron 40 app using sherpa-onnx WASM for live speech translation](https://explore.market.dev/ecosystems/typescript/projects/sokuji) -- MEDIUM confidence, reference implementation
- [Obsidian Plugin Developer Documentation](https://docs.obsidian.md) -- HIGH confidence, official docs
- [Web Workers API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) -- HIGH confidence, web standard
- [AudioContext API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext) -- HIGH confidence, web standard
- [Electron WebGPU Support](https://www.electronjs.org/docs/latest/tutorial/webgpu) -- MEDIUM confidence, official Electron docs
- Existing codebase analysis: `.planning/codebase/ARCHITECTURE.md` and `.planning/codebase/STRUCTURE.md` -- HIGH confidence, self-documented

---
*Architecture research for: real-time speech recognition in Obsidian plugin*
*Researched: 2026-05-12*
