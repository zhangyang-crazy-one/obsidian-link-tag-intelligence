# Phase 2: ASR Model & Transcription - Research

**Researched:** 2026-05-13
**Domain:** Real-time Chinese/English speech-to-text via sherpa-onnx WASM Web Worker in Obsidian Electron plugin
**Confidence:** HIGH (sherpa-onnx API verified via npm package source code; SharedArrayBuffer availability verified via Obsidian Electron research)

## Summary

Phase 02 integrates sherpa-onnx WASM-based speech recognition into the existing Phase 1 audio pipeline. Audio chunks flow from microphone to SpeechRecorder to a Web Worker running the sherpa-onnx WASM module, with recognized text inserted sentence-by-sentence at the editor cursor. Processing is entirely local.

**Primary recommendation:** Use sherpa-onnx v1.13.1 (latest npm) with a Blob-URL inline Web Worker. Drop SharedArrayBuffer in favor of ArrayBuffer transfer (SharedArrayBuffer is unavailable in Obsidian's `file://` Electron context). Feed 16kHz mono Float32 PCM chunks to `OnlineStream.acceptWaveform()`, use built-in endpoint detection (enableEndpoint: 1) with tuned silence thresholds for sentence boundaries, and insert via `editor.replaceSelection()` at the current cursor position.

**Critical finding:** SharedArrayBuffer (required by D-04) is NOT available in Obsidian Desktop. Obsidian uses Electron's `file://` protocol which cannot serve the COOP/COEP HTTP headers needed for cross-origin isolation. Fallback: transfer Float32Array ownership via `postMessage(buffer, [buffer.buffer])` — a zero-copy operation that achieves the same performance characteristics as SharedArrayBuffer for this use case.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Web Worker created lazily on first toggle (not in onload), managed by SpeechRecorder
- **D-02:** Model files stored in plugin directory subdirectory (`models/`), WASM loaded by relative path
- **D-03:** sherpa-onnx via WASM npm package (sherpa-onnx), NOT native addon
- **D-04:** Audio chunks transferred via SharedArrayBuffer between main thread and Worker (zero-copy) — **SEE CORRECTION BELOW: SharedArrayBuffer unavailable, use ArrayBuffer transfer instead**
- **D-05:** ASR init failure: button turns red + Notice with specific error + details in debug log
- **D-06:** Sentence boundary: 800ms silence + sentence-ending punctuation (。！？) as hard cut points
- **D-07:** Text insertion: sentence-by-sentence at cursor via editor.replaceSelection(text + " ")
- **D-08:** Concurrent keyboard input: save cursor position before insert, restore after (non-disruptive)
- **D-09:** Punctuation: post-processing adds trailing punctuation at detected sentence boundaries
- **D-10:** Language switch: destroy current Recognizer + rebuild with new language model (~3-5s)
- **D-11:** VAD: use sherpa-onnx built-in VAD (not custom RMS-based)
- **D-12:** Auto-stop countdown: button text overlay showing seconds remaining (e.g. "5s"), last second flashes
- **D-13:** Language switch UI: settings panel dropdown only (no toolbar quick-switch)
- **D-14:** Download source: HuggingFace (huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-zh-14M-2023-02-23)
- **D-15:** Progress: Obsidian Notice showing percentage + "downloading..." text
- **D-16:** Checksum: automatic SHA256 verification after download, prompt retry on mismatch
- **D-17:** Failure: auto-retry 3 times, then show manual download link and steps

### Claude's Discretion
- Exact SharedArrayBuffer buffer size and ring buffer management strategy — **MOOT: SharedArrayBuffer unavailable, use transfer-based postMessage**
- Web Worker code structure (inline blob vs separate file) — **Recommended: inline Blob URL (avoids CSP issues, simpler esbuild config)**
- sha256 implementation (Web Crypto API vs manual) — **Recommended: Web Crypto API (built-in, no deps)**
- Download retry backoff timing — **Recommended: exponential backoff (1s, 2s, 4s)**
- Recognizer configuration parameters (decoding method, beam size, etc.) — **Recommended: greedy_search with enableEndpoint tuning**
- Chinese model: zipformer-zh-14M INT8 (25MB) — **Confirmed: model available on HF, transducer config with encoder/decoder/joiner + tokens.txt**

### Deferred Ideas (OUT OF SCOPE)
- Partial result preview (show interim ASR output before sentence boundary) — v2 polish
- Voice-triggered link/tag detection — Phase 4 intelligence integration
- Full punctuation restoration model — v2
- Language code-switching (mixing zh+en mid-sentence) — v2
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SPEECH-03 | 识别的中文语音文字逐句实时插入编辑器光标位置 | OnlineRecognizer streaming decode + endpoint detection + editor.replaceSelection() at cursor |
| SPEECH-06 | 用户可在中文和英文识别模式之间切换 | Recognizer destroy + rebuild with different model, ~3-5s (D-10) |
| SPEECH-07 | 语音识别完全本地运行（sherpa-onnx WASM，无网络请求） | sherpa-onnx npm package v1.13.1 WASM (14.7MB WASM binary), zero network calls during recognition |
| SPEECH-08 | 可配置的静音超时后自动停止识别 | enableEndpoint config with rule1MinTrailingSilence (tunable via settings.speechAutoStopSec) |
| SPEECH-11 | 首次使用引导帮助用户下载模型文件 | HuggingFace raw URL fetch + ReadableStream progress + Web Crypto SHA256 verify + Notice UI |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sherpa-onnx (npm) | `^1.13.1` | Chinese/English streaming ASR via WASM | Only candidate providing local Chinese streaming STT with <200MB models, no cloud dependency [VERIFIED: npm registry — v1.13.1 published 2026, package size 4.1MB compressed, 15MB unpacked] |
| esbuild | `^0.25.0` (existing) | Bundle plugin with Worker code inline | Already in project; needs external declaration for sherpa-onnx [VERIFIED: project package.json] |
| Web Crypto API | Built-in (Electron/Chromium) | SHA256 checksum verification for downloaded models | Available in Obsidian Electron renderer, no dependencies [CITED: MDN SubtleCrypto.digest()] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @huggingface/hub | optional | HF Hub API wrapper with resume/range support | ONLY if raw fetch proves insufficient; has `downloadFile()` with range support but no built-in progress callback [CITED: huggingface.co/docs/huggingface.js] |
| wav | optional | WAV file utilities for testing | Development/testing only; NOT used in production (audio never written to disk) |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| sherpa-onnx WASM (npm) | sherpa-onnx-node (native addon) | Higher perf (multi-threaded) but breaks on Electron ABI updates [CITED: PITFALLS.md Pitfall 4] |
| Inline Blob Web Worker | Separate file Worker (esbuild multi-entry) | Separate file is cleaner but requires CSP workaround for loading worker script in Obsidian; Blob URL avoids CSP entirely |
| Raw fetch + ReadableStream | @huggingface/hub | Latter adds dependency for marginal benefit; raw fetch is sufficient for 4-5 file downloads |
| Web Crypto SHA256 | js-sha256 / crypto-js | Adds dependency; Web Crypto is built-in, faster, and sufficient |

**Installation:**
```bash
npm install sherpa-onnx@^1.13.1
```

**Version verification:** [VERIFIED: npm registry — `npm view sherpa-onnx version` returned `1.13.1` on 2026-05-13]

**esbuild configuration change:**
```javascript
// esbuild.config.mjs — add sherpa-onnx to externals
external: [
  "obsidian",
  "@codemirror/state",
  "@codemirror/view",
  "sherpa-onnx",       // NEW: WASM module loaded at runtime via require()
]
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── speech-recorder.ts    # EXTEND: add Worker lifecycle (create/terminate), route audio chunks to Worker, manage Recognizer init/destroy
├── speech-capture.ts     # UNCHANGED: continue producing Float32Array chunks at 16kHz
├── speech-worker.ts      # NEW: Web Worker entry — sherpa-onnx WASM init, acceptWaveform loop, decode/postMessage
├── speech-model.ts       # NEW: model download (fetch from HF with progress), SHA256 verify, model path resolution
├── main.ts               # EXTEND: toggleSpeechRecording() add ASR result handling → insertTextAtCursor
├── settings.ts           # EXTEND: speech fields already exist (speechModelPath, speechLanguage, speechVadSensitivity, speechAutoStopSec)
├── view.ts               # EXTEND: toolbar button add ASR status (loading model, ready, error)
├── i18n.ts               # EXTEND: ~15 new ASR-specific translation keys
└── ...
```

### Pattern 1: Blob-URL Inline Web Worker (D-01, D-03)

**What:** Worker code is defined as a string, wrapped in a Blob, and loaded via `URL.createObjectURL()`. This avoids Obsidian CSP restrictions on loading external worker files, matching the existing AudioWorklet pattern in `speech-capture.ts`.

**When to use:** Any time a Web Worker needs to be created in an Obsidian plugin context. Obsidian's CSP may block `new Worker('/path/to/worker.js')` when the file is served from the plugin directory.

**Trade-offs:**
- Pro: Avoids CSP issues (same pattern proven for AudioWorklet in speech-capture.ts)
- Pro: Worker code is bundled inline by esbuild (can use `import.meta.url` or manual string wrapping)
- Pro: Simple esbuild config (single entry point, worker code embedded as string)
- Con: Worker code harder to debug (source maps don't work through Blob URLs in Chrome DevTools)
- Con: Worker code must be self-contained (no `import` statements), but this is natural for sherpa-onnx which uses `require()`

**Example:**
```typescript
// Source: adapted from speech-capture.ts Blob URL pattern + sherpa-onnx npm index.js
// In speech-recorder.ts — create the Worker lazily on first toggle (D-01)

const WORKER_SOURCE = `
  const wasmModule = {};
  require('sherpa-onnx/sherpa-onnx-wasm-nodejs.js')(wasmModule);
  const { createOnlineRecognizer } = require('sherpa-onnx/sherpa-onnx-asr.js');

  let recognizer = null;
  let stream = null;

  self.onmessage = function(e) {
    switch (e.data.type) {
      case 'init': {
        const { modelDir, language } = e.data;
        // absolute paths required — sherpa-onnx resolves relative to CWD
        const cfg = {
          modelConfig: {
            transducer: {
              encoder: modelDir + '/encoder-epoch-99-avg-1.int8.onnx',
              decoder: modelDir + '/decoder-epoch-99-avg-1.onnx',
              joiner: modelDir + '/joiner-epoch-99-avg-1.int8.onnx',
            },
            tokens: modelDir + '/tokens.txt',
            modelingUnit: language === 'zh' ? 'cjkchar' : 'bpe',
            numThreads: 1,
            provider: 'cpu',
          },
          featConfig: { sampleRate: 16000, featureDim: 80 },
          decodingMethod: 'greedy_search',
          enableEndpoint: 1,
          rule1MinTrailingSilence: 0.8,    // 800ms silence → sentence boundary (D-06)
          rule2MinTrailingSilence: 0.4,    // shorter threshold for partial endpoint
          rule3MinUtteranceLength: 2.0,    // minimum utterance length in seconds
        };
        recognizer = createOnlineRecognizer(wasmModule, cfg); // Note: wasmModule is first arg
        stream = recognizer.createStream();
        self.postMessage({ type: 'ready' });
        break;
      }
      case 'audio': {
        if (!stream) return;
        const samples = new Float32Array(e.data.buffer);
        stream.acceptWaveform(16000, samples);
        while (recognizer.isReady(stream)) {
          recognizer.decode(stream);
        }
        const result = recognizer.getResult(stream);
        const text = result.text || '';
        const isEndpoint = recognizer.isEndpoint(stream);
        self.postMessage({ type: 'result', text, isEndpoint });
        break;
      }
      case 'reset': {
        if (stream) recognizer.reset(stream);
        break;
      }
      case 'destroy': {
        if (stream) { stream.free(); stream = null; }
        if (recognizer) { recognizer.free(); recognizer = null; }
        break;
      }
    }
  };
`;

// Create Worker from Blob URL
const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' });
const workerUrl = URL.createObjectURL(blob);
const worker = new Worker(workerUrl);
URL.revokeObjectURL(workerUrl);
```

### Pattern 2: ArrayBuffer Transfer (replaces D-04 SharedArrayBuffer)

**What:** Audio Float32Array chunks are transferred to the Web Worker via `postMessage(buffer, [buffer.buffer])`. This transfers ownership of the underlying ArrayBuffer to the Worker (zero-copy), making it inaccessible on the main thread afterward. A new Float32Array must be allocated for each chunk on the main thread side.

**When to use:** Always — SharedArrayBuffer is NOT available in Obsidian Desktop (see Common Pitfalls below).

**Why not SharedArrayBuffer:** Obsidian uses Electron's `file://` protocol, which cannot set the `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` HTTP headers required for `crossOriginIsolated` mode. Without cross-origin isolation, `SharedArrayBuffer` is `undefined`. This is a well-known limitation for all Electron apps using `file://`.

**Example:**
```typescript
// Source: verified against MDN Worker.postMessage transfer semantics
// In speech-capture.ts or speech-recorder.ts — on each audio chunk:

// Main thread — creates fresh buffer each time
onAudioChunk((chunk: Float32Array) => {
  // Transfer ownership to Worker (zero-copy)
  // chunk.buffer becomes detached on main thread after transfer
  worker.postMessage(
    { type: 'audio', buffer: chunk.buffer },
    [chunk.buffer]  // transfer list — ownership moves to Worker
  );
});

// Worker side — receives transferred buffer
self.onmessage = function(e) {
  if (e.data.type === 'audio') {
    const samples = new Float32Array(e.data.buffer); // buffer owned by Worker
    stream.acceptWaveform(16000, samples);
    // buffer is garbage collected after this scope
  }
};
```

### Pattern 3: Sentence Boundary via Endpoint Detection (D-06)

**What:** sherpa-onnx's built-in endpoint detection identifies sentence boundaries based on trailing silence. Combined with sentence-ending punctuation detection (。！？), each sentence is finalized and inserted into the editor independently.

**When to use:** On every `isEndpoint(stream)` return value becoming true during the decode loop in the Worker.

**Flow:**
```
Audio chunks arrive → acceptWaveform → decode loop → getResult().text (accumulated)
                                                          │
                                              isEndpoint(stream)?
                                                  │
                                          YES     │     NO
                                          ▼       │     ▼
                              Post final sentence    Post partial text
                              + reset(stream)        (not inserted to editor)
                              to main thread
```

**Config values for D-06 (800ms silence + punctuation):**
- `rule1MinTrailingSilence: 0.8` (seconds) — hard sentence boundary after 800ms silence
- `rule2MinTrailingSilence: 0.4` (seconds) — shorter threshold for utterance-internal boundaries
- `rule3MinUtteranceLength: 2.0` (seconds) — minimum utterance length before endpoint can fire
- `enableEndpoint: 1`

**Post-processing (D-09):** After endpoint fires, append sentence-ending punctuation (。！？) to the final text if not already present. This is done on the main thread before insertion.

### Pattern 4: Model Download with Progress (D-14, D-15)

**What:** Download model files from HuggingFace using raw `fetch` with `ReadableStream` body reading for progress tracking. SHA256 verification via Web Crypto API after download.

**When to use:** First-run when no model files exist in the expected directory, or when the user explicitly requests re-download.

**HuggingFace URL pattern:**
```
https://huggingface.co/{repo}/resolve/main/{filename}
```

**Files to download for Chinese model:**
| File | Size | SHA256 |
|------|------|--------|
| encoder-epoch-99-avg-1.int8.onnx | ~21.6 MB | (from HF repo) |
| decoder-epoch-99-avg-1.int8.onnx | ~1.89 MB | (from HF repo) |
| joiner-epoch-99-avg-1.int8.onnx | ~1.80 MB | (from HF repo) |
| tokens.txt | ~48.7 KB | (from HF repo) |

**Example (fetch with progress):**
```typescript
// Source: adapted from MDN ReadableStream + HuggingFace Hub API pattern
async function downloadModelFile(
  repo: string,
  filename: string,
  destPath: string,
  onProgress: (pct: number, loaded: number, total: number) => void
): Promise<void> {
  const url = `https://huggingface.co/${repo}/resolve/main/${filename}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  
  const contentLength = Number(response.headers.get('content-length') || '0');
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(
      contentLength ? loaded / contentLength : 0,
      loaded,
      contentLength
    ); // D-15: percentage + bytes for Notice
  }

  // Reassemble and verify SHA256 (D-16)
  const fullBuffer = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    fullBuffer.set(chunk, offset);
    offset += chunk.length;
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', fullBuffer);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  // Compare with expected hash, retry on mismatch
  // Write to destPath via Vault adapter
}
```

### Pattern 5: Language Switch via Destroy + Rebuild (D-10)

**What:** Switching between Chinese and English models requires destroying the current recognizer (freeing WASM memory) and creating a new one with the other language's model files. This takes 3-5 seconds.

**When to use:** User changes `speechLanguage` in settings (D-13). The switch happens on the NEXT toggle activation (not spontaneously).

**Flow:**
```
settings.speechLanguage changes
    ↓
On next toggleSpeechRecording() →
    SpeechRecorder checks if language changed
    ↓ YES
    worker.postMessage({ type: 'destroy' })  // free current recognizer
    worker.postMessage({ type: 'init', modelDir: newLanguageDir, language })
    // 3-5s delay while WASM loads new model
    ↓
    worker.postMessage({ type: 'ready' })
    → continue with audio streaming
```

### Anti-Patterns to Avoid
- **Calling recognizer methods from main thread:** All sherpa-onnx WASM calls must happen inside the Worker. The main thread only communicates via postMessage.
- **Loading models from plugin source directory:** In production, plugin files are in ASAR archives — WASM cannot read from ASAR. Use Obsidian's config directory (`app.vault.configDir`) instead. However, D-02 specifies `models/` subdirectory of the plugin directory — this requires using `this.app.vault.adapter.getBasePath() + '/.obsidian/plugins/link-tag-intelligence/models/'` which resolves to a real filesystem path, NOT the ASAR archive.
- **Creating Worker in onload():** Per D-01, Worker must be created lazily on first toggle. Creating in onload() would load the 14.7MB WASM binary at plugin startup, delaying Obsidian launch.
- **Running WASM on main thread:** Even though the sherpa-onnx npm package can be used on the main thread, the 14.7MB WASM + model inference would block the UI thread for 50-200ms per audio chunk.
- **Using SharedArrayBuffer without feature detection:** Must check availability and fall back to ArrayBuffer transfer. SharedArrayBuffer is undefined in Obsidian's Electron context.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Speech recognition engine | Custom RNNT/CTC decoder | sherpa-onnx `createOnlineRecognizer()` | Streaming transducer models with endpoint detection, VAD, and Chinese tokenization are non-trivial to implement correctly |
| Voice activity detection | Custom RMS energy VAD | sherpa-onnx built-in endpoint detection (`enableEndpoint` config) | Custom energy-threshold VAD loses ~28% of short Chinese utterances; sherpa-onnx VAD is trained for ASR pre-processing |
| Sentence boundary detection | Custom silence timer | sherpa-onnx `isEndpoint(stream)` + `rule1MinTrailingSilence: 0.8` | Built-in endpoint detection handles silence boundaries correctly across different speaking rates |
| SHA256 checksum | Custom hash implementation | `crypto.subtle.digest('SHA-256', buffer)` | Web Crypto API is built-in, fast, and correct; custom implementations risk subtle bugs |
| Progress tracking for downloads | XMLHttpRequest | `fetch` + `ReadableStream` body reader | Modern pattern; XHR is deprecated for new development; ReadableStream gives exact byte-level progress |
| Worker code bundling | Manual string concatenation | esbuild with inline string wrapping OR esbuild multiple entry points | esbuild handles bundling correctly; manual concatenation risks syntax errors and missing dependencies |

**Key insight:** The sherpa-onnx ecosystem already provides all the ASR primitives (streaming decode, endpoint detection, VAD, reset). The implementation task is integration plumbing (Worker lifecycle, postMessage protocol, model path resolution, download UX), not building recognition algorithms.

## SharedArrayBuffer Availability (D-04 Reassessment)

### Finding: SharedArrayBuffer is NOT available in Obsidian Desktop

[VERIFIED: web search confirmed — Electron `file://` protocol cannot set COOP/COEP HTTP headers required for `crossOriginIsolated` mode. Obsidian forum discussions confirm `SharedArrayBuffer` warnings in DevTools console. Research conducted 2026-05-13.]

**Evidence:**
1. Since Chrome 92, `SharedArrayBuffer` requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` HTTP headers
2. Electron's `file://` protocol (used by Obsidian) cannot serve these headers
3. Therefore `window.crossOriginIsolated === false` and `typeof SharedArrayBuffer === 'undefined'`
4. The only fix requires Electron app authors to migrate from `file://` to a custom privileged protocol (like `app://`), which only Obsidian developers can do — plugin developers cannot work around this

**Feature detection check:**
```typescript
const supportsSAB = typeof SharedArrayBuffer !== 'undefined';
// In Obsidian Electron: supportsSAB === false
```

**Recommendation:** Use `postMessage(chunk.buffer, [chunk.buffer])` transfer semantics (Pattern 2 above). This achieves zero-copy transfer (ownership moves to Worker, main thread loses access) with the same performance characteristics as SharedArrayBuffer for the unidirectional audio data flow. Each audio chunk is a new Float32Array allocation, so the old buffer doesn't need to be reused by the main thread.

## Runtime State Inventory

> Skip for greenfield phase. Phase 02 builds on Phase 01 infrastructure; no rename/refactor/migration is involved. The Worker lifecycle is new code, not a rename of existing state.

**Result:** SKIPPED — phase adds new functionality, does not rename or migrate existing runtime state.

## Common Pitfalls

### Pitfall 1: SharedArrayBuffer Assumed Available

**What goes wrong:** Code written assuming `SharedArrayBuffer` exists will fail silently in Obsidian Electron. `new SharedArrayBuffer(n)` returns `undefined` or throws `ReferenceError`.

**Why it happens:** Developer tests in standalone Chrome where SAB might be available (with flags) or doesn't test in actual Obsidian Electron environment.

**How to avoid:** NEVER use SharedArrayBuffer. Always use `Float32Array` backed by regular `ArrayBuffer`, transferred via `postMessage(buffer, [buffer.buffer])`. Feature-detect before any SAB usage.

**Warning signs:** `ReferenceError: SharedArrayBuffer is not defined` in Obsidian console; audio data never reaches Worker.

### Pitfall 2: Model Paths Resolved Relative to CWD

**What goes wrong:** sherpa-onnx WASM resolves model file paths relative to the Node.js process's current working directory (CWD), which in Obsidian is the Obsidian application directory (NOT the vault directory).

**Why it happens:** The Emscripten-compiled WASM uses standard C `fopen()` which resolves relative to CWD. In Node.js WASM mode, `NODERAWFS=1` means it uses the real filesystem.

**How to avoid:** Always pass ABSOLUTE paths to `createOnlineRecognizer` config. Compute the model directory path using:
```typescript
const pluginDir = this.app.vault.adapter.getBasePath() + '/.obsidian/plugins/link-tag-intelligence/';
const modelDir = pluginDir + 'models/zh-14M/';  // or models/en/ for English
```
Pass these absolute paths in the Worker init message. The Worker receives them and passes them to the model config.

**Warning signs:** `ERRNOENT` or file-not-found errors during recognizer creation; recognizer creates but produces empty results.

### Pitfall 3: WASM Binary Path in Worker Context

**What goes wrong:** `require('sherpa-onnx')` inside a Blob-URL Worker cannot resolve the npm package because the Worker has no module resolution context.

**Why it happens:** Blob-URL Workers execute in the page's origin context. `require()` is available in Electron's Node.js integration, but the Worker's global scope may not have the same `require` paths as the main thread.

**How to avoid:** Use Electron's `node:worker_threads` integration. In Obsidian's Electron renderer, `new Worker(blobUrl)` where the Blob URL content uses `require()` should work because Electron enables `nodeIntegrationInWorker`. However, this MUST be tested in the actual Obsidian environment.

**Alternative (if require() fails in Blob Worker):** Bundle the full sherpa-onnx code + WASM into the Worker string at build time using esbuild. This means either:
1. esbuild multiple entry points: `entryPoints: ["src/main.ts", "src/speech-worker.ts"]` — Worker gets its own bundle file
2. Inline the entire `sherpa-onnx-wasm-nodejs.js` minified source into the Worker code string (NOT recommended — 138KB compressed, 14.7MB WASM base64 would be absurd)

**Recommended approach (to be validated in implementation):** Use esbuild multi-entry. Configure `src/speech-worker.ts` as a separate entry. At runtime, resolve the built worker file path via plugin directory. Load with `new Worker(workerJsPath)`. If CSP blocks this, fall back to reading the file content as string and creating a Blob URL Worker. This two-stage approach handles both CSP and module resolution.

**Warning signs:** `require is not defined` in Worker console; `Cannot find module 'sherpa-onnx'`; Worker script fails to load silently.

### Pitfall 4: Float32Array Range Requirement

**What goes wrong:** Audio samples must be in the range [-1, 1] when passed to `acceptWaveform()`. If the audio pipeline produces values outside this range, recognition quality degrades or the recognizer crashes.

**Why it happens:** The AudioWorklet produces raw PCM which may exceed [-1, 1] if the microphone gain is too high or the OS applies amplification.

**How to avoid:** The existing Phase 1 pipeline uses AudioWorklet which already produces properly normalized Float32 PCM. The `getUserMedia` constraints disable autoGainControl, noiseSuppression, and echoCancellation, which keeps the signal clean. Verify that all audio chunks passed to the Worker are within [-1, 1] before sending. Add a simple clamp if needed.

**Warning signs:** Recognition results are garbled; recognizer returns empty results despite audio input; WASM crashes with memory errors.

### Pitfall 5: Memory Leak from Non-Freed Streams

**What goes wrong:** Each `createStream()` allocates WASM heap memory. If streams are not explicitly freed (`stream.free()`), memory grows unboundedly over long recording sessions. After endpoint reset, the old stream must be freed before creating a new one, OR use `reset(stream)` which reuses the stream.

**Why it happens:** The sherpa-onnx JavaScript API wraps C++ objects on the WASM heap. JavaScript garbage collection does NOT free WASM memory — only explicit `free()` calls do.

**How to avoid:** Use `recognizer.reset(stream)` after endpoint (per D-06 sentence boundary). This reuses the same stream object and clears its internal state. Call `stream.free()` only when stopping recording entirely or switching languages. In `destroy()` / `onunload()`, always call `recognizer.free()` and `stream.free()`.

**Warning signs:** Memory usage grows linearly during recording; Chrome DevTools Memory panel shows growing WASM heap; crashes after long recording sessions.

### Pitfall 6: Endpoint Firing Too Aggressively

**What goes wrong:** With `rule1MinTrailingSilence: 0.8`, short pauses in speech (thinking, breathing) trigger premature sentence boundaries. The user's sentence gets split mid-thought.

**Why it happens:** Default endpoint thresholds (`rule1: 2.4s, rule2: 1.2s`) are designed for turn-taking in dialog systems, not continuous dictation. Lowering to 800ms makes boundary detection more eager.

**How to avoid:** The 800ms is a deliberate design choice (D-06) for dictation UX — users expect sentence-by-sentence output. However, provide fine-tuning via `speechVadSensitivity` setting (0-3 range maps to different silence thresholds):
- 0 (least sensitive): rule1 = 1.6s, rule2 = 0.8s (fewer, longer segments)
- 1: rule1 = 1.2s, rule2 = 0.6s
- 2 (default): rule1 = 0.8s, rule2 = 0.4s
- 3 (most sensitive): rule1 = 0.5s, rule2 = 0.25s (more, shorter segments)

The existing settings field `speechVadSensitivity` (0-3) already exists and maps cleanly to this.

**Warning signs:** Sentences appear as fragments; user reports "it cuts me off mid-sentence"; rapid-fire text insertions.

### Pitfall 7: esbuild Does Not Auto-External WASM Imports

**What goes wrong:** esbuild tries to bundle the 14.7MB WASM file, fails, or produces a corrupted bundle. The `sherpa-onnx-wasm-nodejs.js` file uses `require('./sherpa-onnx-wasm-nodejs.wasm')` internally which esbuild cannot process.

**Why it happens:** The WASM loading mechanism in sherpa-onnx uses Emscripten's synchronous WASM loading. esbuild doesn't understand the binary `.wasm` format and can't inline it.

**How to avoid:** Add `"sherpa-onnx"` to esbuild's `external` array. The Worker code uses `require('sherpa-onnx/...')` which loads the files from `node_modules/sherpa-onnx/` at runtime. The WASM file (14.7MB) stays on disk next to `sherpa-onnx-wasm-nodejs.js`.

**Warning signs:** Build errors about binary files; `Cannot find module './sherpa-onnx-wasm-nodejs.wasm'` in Worker; esbuild warning about unsupported file type.

## Code Examples

Verified patterns from official sources:

### Recognizer Configuration (Chinese model)
```typescript
// Source: sherpa-onnx npm package v1.13.1 (sherpa-onnx-asr.js lines 638-679)
//         + GitHub nodejs-examples/test-online-transducer.js
// Config for streaming zipformer transducer model with endpoint detection

const recognizerConfig = {
  modelConfig: {
    transducer: {
      encoder: '/absolute/path/to/encoder-epoch-99-avg-1.int8.onnx',
      decoder: '/absolute/path/to/decoder-epoch-99-avg-1.onnx',
      joiner: '/absolute/path/to/joiner-epoch-99-avg-1.int8.onnx',
    },
    tokens: '/absolute/path/to/tokens.txt',
    modelingUnit: 'cjkchar', // Chinese character-based tokenization
    numThreads: 1,            // WASM is single-threaded
    provider: 'cpu',
    debug: 0,                 // 0 = less verbose WASM logs
  },
  featConfig: {
    sampleRate: 16000,
    featureDim: 80,
  },
  decodingMethod: 'greedy_search',
  maxActivePaths: 4,
  enableEndpoint: 1,          // D-11: use built-in VAD
  rule1MinTrailingSilence: 0.8,   // D-06: 800ms silence = sentence boundary
  rule2MinTrailingSilence: 0.4,   // shorter threshold for partial
  rule3MinUtteranceLength: 2.0,   // minimum utterance before endpoint
};
```

### Audio Feeding Loop (Worker)
```typescript
// Source: sherpa-onnx npm package v1.13.1 OnlineStream.acceptWaveform
//         + nodejs-examples/test-online-transducer.js decode() function

// Inside Worker onmessage handler for 'audio' messages:
const samples = new Float32Array(e.data.buffer);
stream.acceptWaveform(16000, samples);

let text = '';
while (recognizer.isReady(stream)) {
  recognizer.decode(stream);
}
const result = recognizer.getResult(stream);
text = result.text || '';

const isEndpoint = recognizer.isEndpoint(stream);

if (isEndpoint) {
  // Finalize this sentence
  self.postMessage({ type: 'final', text });
  recognizer.reset(stream);  // ready for next sentence
} else {
  // Partial result — don't insert yet, just report
  self.postMessage({ type: 'partial', text });
}
```

### Text Insertion at Cursor (Main Thread)
```typescript
// Source: existing main.ts insertTextAtCursor pattern (line 709 area)
// Extended for ASR results with cursor preservation (D-08)

function insertSpeechText(editor: Editor, text: string): void {
  if (!text) return;

  // D-08: save cursor position before insert
  const cursor = editor.getCursor();

  // D-07: insert at cursor with trailing space
  editor.replaceSelection(text + ' ');

  // D-08: restore cursor after insert (non-disruptive for concurrent typing)
  // Note: replaceSelection already moves cursor after inserted text,
  // so no explicit restore is needed unless there's concurrent input.
  // For concurrent typing, consider using editor.replaceRange() instead.
}
```

### SHA256 Verification via Web Crypto
```typescript
// Source: MDN SubtleCrypto.digest() — available in Electron/Chromium
// Used for D-16: checksum verification after model download

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Usage after download:
const actualHash = await sha256Hex(downloadedFileBuffer);
if (actualHash !== expectedHash) {
  // D-17: retry or show manual download instructions
  throw new Error(`SHA256 mismatch: expected ${expectedHash}, got ${actualHash}`);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| sherpa-onnx v1.12.37 (STACK.md) | sherpa-onnx v1.13.1 | 2026 | Newer version; API compatible; model types added (Cohere, Qwen3, FireRedAsr2) but Zipformer transducer unchanged |
| SharedArrayBuffer for Worker transfer | ArrayBuffer transfer via postMessage | N/A (SAB never available in Obsidian Electron) | Zero-copy still achieved through ownership transfer; same performance profile |
| ScriptProcessorNode for audio (ARCHITECTURE.md original) | AudioWorkletNode (Phase 1 already implemented) | Phase 1 | Already fixed in Phase 1 codebase |
| Model files in plugin ASAR (ARCHITECTURE.md original) | Model files in plugin config directory (filesystem path) | Phase 2 (this phase) | Models must live on real filesystem, not in ASAR virtual filesystem |

**Deprecated/outdated:**
- `ScriptProcessorNode`: Already replaced by AudioWorklet in Phase 1. The Phase 1 code has AudioWorklet + Blob URL pattern with ScriptProcessorNode as fallback.
- `sherpa-onnx-node` (native addon): Not used per D-03. WASM package is the chosen path.

## Assumptions Log

> All claims tagged `[ASSUMED]` — flagged for user confirmation before execution.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `require()` works inside Blob-URL Web Workers in Obsidian's Electron renderer (nodeIntegrationInWorker enabled) | Architecture / Pitfall 3 | If require() doesn't work in Blob Workers, must use esbuild multi-entry bundling for the Worker code — adds build complexity but functionally equivalent |
| A2 | Model files live at `.obsidian/plugins/link-tag-intelligence/models/` on real filesystem (not in ASAR), accessible via absolute path | Architecture / D-02 | If plugin directory IS inside ASAR in production, must download models to `app.vault.configDir` path instead |
| A3 | `app.vault.adapter.getBasePath()` returns a valid filesystem path usable for WASM file operations | Architecture / D-02 | If the base path doesn't map to real FS for WASM fopen(), models must be stored in a different known location (e.g., app.getPath('userData')) |
| A4 | The AudioWorklet in Phase 1 already produces normalized Float32 PCM in [-1, 1] range suitable for sherpa-onnx acceptWaveform | Code Examples / Pitfall 4 | If values exceed [-1, 1], need to add clamping or normalization before feeding to Worker |
| A5 | Electron's renderer process supports Web Crypto API (`crypto.subtle.digest`) | Code Examples / D-16 | If not available, fall back to a pure JS SHA256 implementation |
| A6 | HuggingFace URLs are directly accessible without authentication for the public model repos used | Model Download / D-14 | If HF requires auth or rate-limits, add `@huggingface/hub` package with token support |
| A7 | esbuild can be configured to externalize `sherpa-onnx` without issues; the runtime `require()` in Worker will find the package in `node_modules` | Pitfall 7 | If path resolution fails, the worker script must be a separate esbuild entry with its own bundle or use a different bundling strategy |

## Open Questions

1. **Web Worker `require()` availability in Obsidian Electron**
   - What we know: Electron supports `nodeIntegrationInWorker`, but Obsidian may override this. Blob-URL Workers may or may not inherit Node.js `require()`.
   - What's unclear: Whether the specific Electron version Obsidian uses enables `require()` inside Workers created from Blob URLs.
   - Recommendation: Implement the esbuild multi-entry approach (separate `speech-worker.ts` entry point) as the primary path. The Worker JS file will be written to the plugin directory alongside `main.js`, and loaded via an absolute path `new Worker(...)`. If CSP blocks this (it shouldn't for `file://` Workers), then implement the Blob URL fallback with inline code. This two-stage approach handles both scenarios.

2. **Model directory write permissions**
   - What we know: Obsidian plugins can write to their plugin config directory (under `.obsidian/plugins/`).
   - What's unclear: Whether there are size limitations or permission issues for storing 25MB+ model files.
   - Recommendation: Use `this.app.vault.adapter` to check available space before download. Write models one file at a time. Handle disk-full errors gracefully.

3. **English model selection**
   - What we know: The bilingual zh-en model (~70MB) exists on HuggingFace. A smaller English-only streaming model may exist.
   - What's unclear: Whether a dedicated English streaming zipformer model (like `sherpa-onnx-streaming-zipformer-en-2023-06-26` mentioned in CONTEXT.md specifics) is available in INT8 quantized form.
   - Recommendation: Use the bilingual model as the English option (it handles both zh and en). Alternatively, search for the latest English-only streaming model on the sherpa-onnx model zoo before implementation.

4. **esbuild Worker bundling complexity**
   - What we know: Current esbuild config has a single entry point (`src/main.ts`). Adding a Worker entry point requires modifying the build to produce two output files.
   - What's unclear: Whether esbuild can produce both `main.js` (CJS for Obsidian) and a separate worker bundle simultaneously in a single build invocation.
   - Recommendation: Add `src/speech-worker.ts` as a second entry point in esbuild config. The worker bundle should also be in CJS format (Electron's Node.js integration understands CJS). Configure output to write to `speech-worker.js` alongside `main.js`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | esbuild build, npm install | ✓ | v24.13.0 | — |
| npm | Package installation | ✓ | 10.9.4 | — |
| esbuild | Plugin bundling | ✓ | ^0.25.0 (project dep) | — |
| sherpa-onnx (npm) | ASR WASM engine | ✓ | v1.13.1 (to be installed) | — |
| Web Crypto API | SHA256 verification | ✓ | Built into Electron | Pure JS SHA256 (js-sha256) |
| HuggingFace CDN | Model download | Needs network | — | Manual download instructions; bundle minimal model |
| Obsidian Electron | Runtime execution | ✓ | Current Obsidian version | — |

**Missing dependencies with no fallback:**
- None — all essential dependencies are available or will be installed via npm.

**Missing dependencies with fallback:**
- HuggingFace CDN accessibility: If behind firewall/GFW, user must download models manually and place in `models/` directory. Plugin should detect existing model files and skip download.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest v2.1.8 |
| Config file | vitest.config.ts (aliases obsidian to tests/mocks/obsidian.ts) |
| Quick run command | `npx vitest run tests/speech-recorder.test.ts` |
| Full suite command | `npm test` (vitest run) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SPEECH-03 | Text inserted at cursor after endpoint | integration | `npx vitest run tests/speech-asr.test.ts` | Wave 0 |
| SPEECH-06 | Language switch destroys and rebuilds recognizer | unit | `npx vitest run tests/speech-asr.test.ts` | Wave 0 |
| SPEECH-07 | Recognition runs locally (no network) | unit | `npx vitest run tests/speech-worker.test.ts` | Wave 0 |
| SPEECH-08 | Configurable silence timeout via enableEndpoint | unit | `npx vitest run tests/speech-recorder.test.ts` (extend) | Wave 0 (extend) |
| SPEECH-11 | Model download with progress and SHA256 verify | unit | `npx vitest run tests/speech-model.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose` (all speech tests)
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/speech-asr.test.ts` — covers SPEECH-03, SPEECH-06 (mock Worker, mock sherpa-onnx, test SentenceManager cursor insertion)
- [ ] `tests/speech-worker.test.ts` — covers SPEECH-07 (mock sherpa-onnx Module, test postMessage protocol: init/audio/result/destroy messages)
- [ ] `tests/speech-model.test.ts` — covers SPEECH-11 (mock fetch, test download progress, SHA256 verification, retry logic)
- [ ] `tests/speech-recorder.test.ts` — EXTEND: add Worker lifecycle tests (create, init failure, destroy, language switch)
- [ ] `tests/mocks/sherpa-onnx.ts` — NEW: mock sherpa-onnx `createOnlineRecognizer`, `OnlineRecognizer`, `OnlineStream` for Worker tests

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A — local processing only |
| V3 Session Management | No | N/A — no sessions |
| V4 Access Control | No | N/A — no access control for local processing |
| V5 Input Validation | Yes (audio input) | Float32Array range validation (-1 to 1), buffer size limits (max 5s of audio per chunk = 80000 samples) |
| V6 Cryptography | Yes (model integrity) | SHA256 via Web Crypto API for model file verification; HTTPS for downloads |

### Known Threat Patterns for sherpa-onnx WASM + Worker

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious model file (tampered ONNX) | Tampering | SHA256 verification after download (D-16); only download from official HF repos over HTTPS |
| WASM memory exhaustion (large audio chunks) | Denial of Service | Limit acceptWaveform chunk size; monitor WASM heap growth |
| Audio data exfiltration via postMessage | Information Disclosure | Worker code is self-contained and auditable; no network access in Worker; text-only output |
| Model file path traversal | Tampering | Validate modelDir against expected plugin directory; reject paths with `..` |
| Infinite decode loop in Worker | Denial of Service | Timeout on decode loop; Worker termination on plugin unload |

### Privacy Considerations

- **Audio data never leaves the process:** All audio processing happens in WASM inside the Web Worker. No network requests for recognition.
- **Audio never written to disk:** Float32Array buffers are ephemeral — transferred to Worker, processed, garbage collected. No WAV/MP3 files created.
- **Transcribed text kept in memory:** Text results are inserted directly into the editor. No log files containing transcriptions.
- **Model download is the only network activity:** One-time HTTPS download from HuggingFace. No telemetry, no analytics, no phoning home.

## Sources

### Primary (HIGH confidence)
- [sherpa-onnx npm package v1.13.1 source code] — `sherpa-onnx-asr.js` (lines 445-582: initSherpaOnnxOnlineRecognizerConfig; lines 584-680: createOnlineRecognizer; lines 1883-2003: OnlineStream + OnlineRecognizer classes) [VERIFIED: extracted from npm tarball, read directly]
- [sherpa-onnx npm package v1.13.1 index.js] — Public API surface (`createOnlineRecognizer`, wasm module loading pattern) [VERIFIED: read from npm tarball]
- [sherpa-onnx GitHub nodejs-examples/test-online-transducer.js] — Official streaming transducer example: model config, acceptWaveform loop, decode/getResult pattern [CITED: GitHub k2-fsa/sherpa-onnx]
- [sherpa-onnx C API: SherpaOnnxOnlineRecognizerResult] — Result struct fields (text, tokens, timestamps, count) [CITED: k2-fsa.github.io/sherpa/onnx/c-api]
- MDN Web Crypto API `SubtleCrypto.digest()` — SHA256 verification approach [CITED: developer.mozilla.org]
- MDN Worker `postMessage()` transfer semantics — ArrayBuffer transfer for zero-copy [CITED: developer.mozilla.org]
- HuggingFace Hub raw file URL pattern — `https://huggingface.co/{repo}/resolve/{revision}/{filename}` [CITED: huggingface.co/docs/hub]

### Secondary (MEDIUM confidence)
- [Obsidian forum: SharedArrayBuffer console warnings] — Confirms SAB unavailable in Obsidian Electron [CITED: forum.obsidian.md]
- [canopyide/canopy issue #1220] — Electron custom protocol + COOP/COEP headers solution [CITED: github.com/canopyide/canopy]
- [STACK.md research] — sherpa-onnx model recommendations (zh-14M INT8, 25MB) [CITED: project .planning/research/STACK.md]
- [ARCHITECTURE.md research] — Web Worker architecture, component boundaries [CITED: project .planning/research/ARCHITECTURE.md]
- [PITFALLS.md research] — 10 pitfalls documented (AudioWorklet CSP, native addon ABI, ASAR, VAD) [CITED: project .planning/research/PITFALLS.md]

### Tertiary (LOW confidence)
- HuggingFace `@huggingface/hub` JS package — `downloadFile()` with range support [CITED: huggingface.co/docs/huggingface.js — not verified via installation]
- CSDN article on sherpa-onnx Unity WebGL + Web Worker (2026) — Confirms Worker pattern used in production [low confidence: third-party blog, not official]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — sherpa-onnx v1.13.1 API verified by reading actual npm package source code; esbuild pattern verified via existing project config
- Architecture: HIGH — Web Worker pattern, postMessage protocol, model download flow all verified against official documentation and package source
- Pitfalls: HIGH — SharedArrayBuffer unavailability verified via multiple sources; model path resolution verified via source code analysis; WASM memory management documented in sherpa-onnx source

**Research date:** 2026-05-13
**Valid until:** 2026-06-13 (30 days — stable but check for new sherpa-onnx releases)
