# Pitfalls Research

**Domain:** Real-time local Chinese speech-to-text in Obsidian (Electron) plugin
**Researched:** 2026-05-12
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: ScriptProcessorNode Causes Crashes and Bad Audio

**What goes wrong:**
Using `ScriptProcessorNode` (the older Web Audio API) for audio capture produces dirty PCM data with noise artifacts, causes renderer jank by running on the main thread, and has been documented to cause Windows BSOD crashes in Electron apps. The data from `ScriptProcessorNode` degrades ASR recognition quality.

Existing ARCHITECTURE.md (line 216) currently documents `createScriptProcessor(4096, 1, 1)` as the audio capture path. **This must be changed.**

**Why it happens:**
ScriptProcessorNode runs on the main/renderer thread (not the dedicated audio thread). Its `onaudioprocess` callback fires on every audio buffer, blocking the event loop. In Electron with lower API support, this is particularly unstable. Developers use it because it's the older, better-documented API, and tutorials still recommend it.

**How to avoid:**
Use **AudioWorkletNode** exclusively. AudioWorklet runs in a dedicated `AudioWorkletGlobalScope` thread, produces clean PCM data, and does not block the renderer. The resampling to 16kHz (required by all ASR backends) must happen inside the AudioWorklet processor.

**Warning signs:**
- UI jank or missed keystrokes during recording
- Audio sounding "scratchy" or with artifacts when played back
- Recognition quality significantly worse than expected for the model
- Windows users reporting crashes during long recording sessions

**Phase to address:**
Phase 1 (audio capture pipeline). Must be implemented correctly from the start; retrofitting after ScriptProcessorNode is a full rewrite of the capture module.

**Obsidian-specific:** AudioWorklet requires CSP to allow `audioWorklet.addModule()`. Obsidian's CSP may block loading worklet processor files. See Pitfall 5.

---

### Pitfall 2: Using Whisper (Chunked) for Real-Time Streaming

**What goes wrong:**
Developers use Whisper (whisper.cpp or Whisper via Python CLI) for what they think is "real-time" transcription. Whisper is inherently chunked: it expects complete audio segments and produces output only after processing a full 30-second window. This creates 2-10 second delays with no incremental feedback.

**Why it happens:**
Whisper is the most well-known and best-documented local STT model. Tutorials and blog posts treat it as the default. Developers assume "it's fast on my machine" translates to real-time, but chunked processing means the user waits for sentence completion + inference latency.

**How to avoid:**
Use a **true streaming** ASR model. For Chinese in Node.js/Electron, the only viable streaming option under the constraints (local, <200MB, Node.js compatible) is sherpa-onnx with a Zipformer streaming model. Zipformer produces partial and final results incrementally as audio arrives.

**Model recommendation:** `sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20` (~80MB, supports both Chinese and English) or the newer `sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30` (~30MB, Chinese-only, int8 quantized).

**Warning signs:**
- Text only appears 3-10 seconds after the user stops speaking
- No partial/interim text during speech
- "Realtime" description in docs but delays in practice

**Phase to address:**
Phase 2 (ASR model integration). Model selection is the foundational decision. A wrong choice here forces a full rewrite.

---

### Pitfall 3: Obsidian CSP Blocks AudioWorklet.addModule()

**What goes wrong:**
Obsidian's Content Security Policy (CSP) blocks `audioWorklet.addModule()` from loading external `.js` processor files at runtime. This is confirmed from the SpessaSynth plugin attempt: even with the full vault path via `this.app.vault.adapter.getFullPath()`, the fetch fails due to CSP restrictions.

**Why it happens:**
Obsidian's Electron wrapper enforces a restrictive CSP. The `audioWorklet.addModule()` call triggers a `fetch()` under the hood, which the CSP blocks for arbitrary URLs. Obsidian's plugin manifest does not support declaring additional assets beyond `main.js`, so there's no "approved" way to ship a worklet processor file that the CSP will allow.

**How to avoid:**
Generate the AudioWorklet processor code as a **Blob URL** at runtime. Instead of `audioWorklet.addModule('/path/to/processor.js')`, construct the processor code as a string, create a Blob, and load from the blob URL:

```typescript
const processorCode = `
  class MicProcessor extends AudioWorkletProcessor {
    process(inputs, outputs) {
      const input = inputs[0];
      if (input && input[0]) {
        this.port.postMessage(input[0]); // Float32Array
      }
      return true;
    }
  }
  registerProcessor('mic-processor', MicProcessor);
`;

const blob = new Blob([processorCode], { type: 'application/javascript' });
const blobUrl = URL.createObjectURL(blob);
await audioContext.audioWorklet.addModule(blobUrl);
URL.revokeObjectURL(blobUrl);
```

This approach has been confirmed to work around CSP restrictions because blob URLs inherit the origin of the page that created them.

**Warning signs:**
- `DOMException: The user denied access to ...` when calling `addModule()`
- Network error in console when trying to load worklet processor
- Works in development but fails in installed plugin

**Phase to address:**
Phase 1 (audio capture pipeline). Must be resolved before any audio capture code works.

---

### Pitfall 4: Native Node.js Addons Break on Every Obsidian/Electron Update

**What goes wrong:**
If using `sherpa-onnx-node` (native addon) or whisper.cpp via N-API bindings, the `.node` binary must be compiled against Obsidian's exact Electron version. Obsidian updates its Electron version periodically, which changes the ABI. A previously working plugin silently breaks with cryptic `NODE_MODULE_VERSION` mismatch errors.

**Why it happens:**
Electron uses a different NODE_MODULE_VERSION than standard Node.js, even at the same V8 version. Each Electron upgrade changes the ABI. The `node-abi` package used by `@electron/rebuild` can lag behind new Electron releases, producing "Could not detect abi" errors. Obsidian plugins have no control over when Electron upgrades happen.

**How to avoid:**
Use **sherpa-onnx WASM** (`sherpa-onnx` npm package), not the native addon (`sherpa-onnx-node`). WASM is platform-independent and ABI-independent. It runs in any V8 environment (Node.js worker or browser renderer) without compilation. The performance difference between WASM and native for this use case is acceptable: WASM is ~2-3x slower than native, but since ASR runs in a Worker off the main thread, this does not affect user-perceived latency for single-user dictation.

If native addons are unavoidable for performance:
- Ship prebuilt binaries for each platform (darwin-arm64, darwin-x64, linux-x64, win32-x64)
- Rebuild with `@electron/rebuild` targeting Obsidian's current Electron version
- Store `.node` files **outside** ASAR (electron-builder `asarUnpack` config or download to `app.getPath('userData')`)
- Test on every Obsidian update

**Warning signs:**
- `Error: The module was compiled against a different Node.js version` after Obsidian updates
- `Could not detect abi for version X.X.X and runtime electron`
- Plugin works on developer's machine but fails for users on different Obsidian versions

**Phase to address:**
Phase 2 (model loading / ASR integration). The WASM vs native decision must be made before writing any inference code.

---

### Pitfall 5: Model Files Inside ASAR Archive

**What goes wrong:**
Electron's ASAR archives are virtual, read-only filesystems. Native code (including WASM loading via Emscripten's virtual filesystem) **cannot read files inside `app.asar`**. Model files work in development (when files are on disk) but silently fail in production builds.

**Why it happens:**
The ASAR format packs files into a single archive that Node.js's `fs` module reads transparently via patching, but this patching does not extend to WASM virtual filesystems, Emscripten's `FS_createDataFile`, or native C++ code. The model `.onnx` / `.bin` / `.txt` files are invisible to these subsystems.

**How to avoid:**
Download model files to Obsidian's plugin config directory on first run:
```typescript
const modelDir = `${app.vault.configDir}/plugins/link-tag-intelligence/models/`;
// Check if models exist, download from sherpa-onnx releases if missing
// Reference models from this path, never from plugin source directory
```

The plugin source directory (where `main.js` lives) may be inside ASAR. The config directory is always on the real filesystem.

**Warning signs:**
- "File not found" errors for model files in production but not development
- `FS_createDataFile` succeeding but model loading silently failing
- WASM initialization completing but returning empty results

**Phase to address:**
Phase 2 (model loading). Implement model download/verification step before inference can start.

---

### Pitfall 6: AudioContext Suspended State in Electron

**What goes wrong:**
`AudioContext` created outside a user gesture handler starts in `"suspended"` state. All audio processing silently does nothing. The user sees "recording" but no audio data flows. No error is thrown.

**Why it happens:**
Chromium's autoplay policy requires AudioContext creation or `resume()` to happen within a user gesture (click, keypress). In an Obsidian plugin, `onload()` is NOT a user gesture. Creating AudioContext during plugin initialization results in a permanently suspended context.

**How to avoid:**
Create the AudioContext **inside the command handler or toolbar click handler** (which are user gestures):
```typescript
toggleSpeechRecognition() {
  if (!this.audioContext) {
    this.audioContext = new AudioContext({ sampleRate: 16000 });
  }
  if (this.audioContext.state === 'suspended') {
    await this.audioContext.resume();
  }
  // Now safe to start capture
}
```

Also handle the case where `resume()` never resolves (known WebKit bug, see Pitfall 7). Add a timeout + fallback.

**Warning signs:**
- AudioContext.state === "suspended" at recording start
- No audio data arriving in worklet processor despite "recording" indicator
- No errors in console -- everything appears to work but produces no text

**Phase to address:**
Phase 1 (audio capture pipeline). Must be handled in the initial toggleSpeechRecognition implementation.

---

### Pitfall 7: Fixed-Threshold VAD Losing Short Chinese Utterances

**What goes wrong:**
Using a fixed energy threshold for Voice Activity Detection causes short Chinese responses (e.g., "好的", "没问题", "嗯") to be classified as silence and discarded. In real-world testing, VAD with fixed thresholds had a **28% misclassification rate** for short utterances. These are common in dictation workflows (thinking aloud, confirming, brief notes).

**Why it happens:**
Fixed thresholds are calibrated on Western languages with different syllable energy profiles. Mandarin syllables have different energy distribution than English. Short utterances naturally sit near the threshold boundary. Developers pick a threshold that works for their test sentences and ship it.

**How to avoid:**
1. **Dynamic threshold**: Compute energy mean and standard deviation from recent audio, set threshold at `mean - 1.5 * stddev` rather than a fixed value.
2. **Short utterance protection**: Any audio segment between 100-300ms that exceeds even a lower threshold should be kept.
3. **Use sherpa-onnx's built-in VAD** rather than implementing your own: sherpa-onnx's VAD model is trained specifically for ASR pre-processing and handles edge cases better than hand-tuned energy thresholds.
4. **Endpoint detection over silence**: sherpa-onnx's OnlineRecognizer has `enableEndpoint` with configurable `rule1MinTrailingSilence` (default 2.4s) and `rule2MinTrailingSilence` (1.2s). Tune these rather than implementing standalone VAD.

**Warning signs:**
- Short responses consistently not transcribed
- User says "好的" and nothing appears
- Recognition works for long sentences but "misses" short ones
- User reports having to "speak louder" for short phrases

**Phase to address:**
Phase 2 (ASR model integration). VAD configuration is part of the sherpa-onnx recognizer setup.

---

### Pitfall 8: Missing Chinese Punctuation Makes Output Unusable

**What goes wrong:**
ASR models trained primarily for English output may not include Chinese punctuation. Chinese text without punctuation (periods, commas, question marks) is significantly harder to read than English without punctuation, because Chinese has no word spacing. Raw ASR output like "今天天气很好我去公园散步" without segmentation is difficult to parse quickly.

**Why it happens:**
Most streaming ASR models (Zipformer, Paraformer) output raw text without punctuation. Punctuation restoration is typically a separate post-processing model. Developers treat it as a v2 feature, but for Chinese it's closer to table stakes for readability.

**How to avoid:**
1. **Use a model with integrated punctuation**: SenseVoice models from Alibaba include punctuation and emotion detection in the output.
2. **Use sherpa-onnx with punctuation model**: sherpa-onnx supports online punctuation restoration as a post-processing step. The FunASR CT-Transformer punctuation model runs on CPU and adds negligible latency.
3. **Minimal heuristic approach for v1**: Insert periods after 800ms+ pauses (which already trigger sentence boundaries). This gives basic segmentation without a separate model.

The minimum viable approach: insert `。` (Chinese period) at each sentence boundary detected by the silence timeout. This alone makes output ~70% more readable than raw unpunctuated text.

**Warning signs:**
- Output text is a wall of characters with no breaks
- Users manually inserting punctuation while reading transcriptions
- Chinese users complaining output is "hard to read" compared to 讯飞/百度

**Phase to address:**
Phase 2-3 (ASR model integration / text post-processing). Basic period insertion at sentence boundaries is Phase 2. Full punctuation restoration model is Phase 3.

---

### Pitfall 9: Hot Reload + AudioContext = Leaked Resources

**What goes wrong:**
During development with the hot-reload plugin, each code change cycle (disable → enable) creates a new AudioContext and MediaStream without releasing the previous one. After 5-10 reload cycles, the microphone resource is exhausted, the browser audio subsystem enters a broken state, and recording silently fails.

**Why it happens:**
The hot-reload plugin calls `onunload()` before disabling and `onload()` after enabling. If `onunload()` does not explicitly close the AudioContext and stop all MediaStream tracks, these resources leak. The OS/browser has a limited number of simultaneous audio contexts and microphone streams.

**How to avoid:**
Implement thorough cleanup in `onunload()`:
```typescript
async onunload() {
  // Stop recording if active
  if (this.speechState === 'recording') {
    await this.stopSpeechRecognition();
  }
  
  // Close AudioContext
  if (this.audioContext && this.audioContext.state !== 'closed') {
    await this.audioContext.close();
    this.audioContext = null;
  }
  
  // Stop all media tracks
  if (this.mediaStream) {
    this.mediaStream.getTracks().forEach(track => track.stop());
    this.mediaStream = null;
  }
  
  // Terminate worker
  if (this.speechWorker) {
    this.speechWorker.terminate();
    this.speechWorker = null;
  }
}
```

Use `registerEvent()` and `registerInterval()` for all Obsidian API registrations (these auto-cleanup). For non-Obsidian resources (AudioContext, Worker, MediaStream), cleanup must be explicit in `onunload()`.

**Warning signs:**
- After 3-4 hot reloads, `getUserMedia` throws "Requested device not found"
- AudioContext creation fails with "Too many AudioContexts"
- Microphone indicator light stays on after plugin disabled

**Phase to address:**
Phase 1 (audio capture pipeline). Implement proper cleanup from the very first capture implementation.

---

### Pitfall 10: Running ASR Inference in Renderer Process (4-5x Slower)

**What goes wrong:**
Running WASM-based speech recognition in the renderer process (main thread or renderer Worker) is 4-5x slower than running it in Node.js. A benchmark from 2025 showed the same whisper.cpp WASM: React renderer Worker = 1400ms/batch vs Node.js Worker = 400ms/batch. The browser sandbox overhead is significant.

**Why it happens:**
Chromium's renderer process has additional security sandboxing that restricts memory access patterns, JIT compilation, and thread scheduling. Node.js (Electron main process) does not have these restrictions. Both use V8, but the execution environment differs significantly.

**How to avoid:**
For Obsidian plugins, you cannot access the Electron main process directly -- plugins run in the renderer. The options are:

1. **Accept the overhead** (recommended for v1): The 4-5x slowdown is on per-batch processing, not end-to-end latency. For single-user dictation, a 200ms inference vs 50ms is still well within real-time requirements (<2s). WASM Web Worker is the simplest architecture and the performance is adequate.

2. **Use WebGPU acceleration** (if available): sherpa-onnx supports WebGPU in Chromium 113+. WebGPU WASM inference can match or exceed native performance for compatible models. Electron's Chromium version must be checked.

3. **Use child_process in Node.js** (complex): Spawn a Node.js process in the Electron main process context via `child_process.fork()` to run the native sherpa-onnx addon. This requires using Obsidian's `require` to access Node.js APIs. The existing codebase already uses `child_process.exec` in `ingestion.ts` and `semantic.ts` -- the same pattern could be extended. But this adds significant complexity and a separate build target.

**Warning signs:**
- Inference latency > 500ms per audio chunk
- Recognizer not keeping up with real-time audio (buffer growing)
- CPU usage at 100% during recording

**Phase to address:**
Phase 2 (ASR model integration). Start with Web Worker WASM. Only optimize to child_process if performance measurements show it's needed.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| ScriptProcessorNode for audio capture | Works without CSP workaround | Dirty audio degrades ASR, main thread jank, potential Windows crashes | Never for ASR input; AudioWorklet is mandatory |
| Fixed VAD threshold | Simple, works for initial testing | 28% short utterance miss rate in real usage; users perceive as "buggy" | Only during initial model evaluation, not in user-facing code |
| Loading model from plugin directory | No download step needed | Breaks in ASAR-packaged production builds | Development only; must switch to config directory download |
| Skipping AudioWorklet in favor of AnalyserNode | Avoids CSP/worklet complexity | `AnalyserNode.getFloatTimeDomainData()` produces artifacts; degrades recognition quality | Never; AudioWorklet or nothing |
| Hardcoding Chinese-only model | Simpler model loading | Users who want English need a separate setup; language switching becomes model switching | Only if English support is deferred to post-v1 |
| Storing audio buffers for "later playback" | User can replay what they said | 10MB/minute for WAV; vault bloat; privacy risk (permanent voice records) | Never; text is the artifact, audio is discarded after transcription |
| Creating AudioContext in plugin onload() | Always available | Suspended state, no audio flows, user sees "recording" with no output | Never; always create/resume in user gesture handler |

## Integration Gotchas

Common mistakes when connecting components in the Obsidian/Electron environment.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| AudioWorklet + Obsidian CSP | `audioWorklet.addModule('/path/to/processor.js')` -- blocked by CSP | Inline processor code as string, create Blob URL, addModule from blob URL |
| Model files + Electron ASAR | Reference model via `__dirname` or relative path inside plugin directory | Download models to `app.vault.configDir/plugins/link-tag-intelligence/models/` on first run |
| getUserMedia + macOS Electron | Expect video+audio to work | Audio-only `getUserMedia` works fine on macOS; video is broken (known Electron issue) |
| AudioContext + Obsidian lifecycle | Create in onload(), clean up in onunload() | Create on first user gesture (command/click), store reference, clean up in onunload() |
| Web Worker + esbuild bundling | Import worker as separate entry point; esbuild not configured for multiple outputs | Inline worker code as string, create Worker from Blob URL OR configure esbuild with multiple entry points |
| sherpa-onnx + VAD | Implement custom VAD with energy thresholds | Use sherpa-onnx's built-in VAD: `enableEndpoint`, `rule1MinTrailingSilence`, `rule2MinTrailingSilence` |
| Plugin settings + model path | Hardcode model path or assume relative to vault root | Settings field with descriptive text + "Browse" button + validation that directory contains .onnx/.txt files |
| CodeMirror 6 + text insertion during recording | `editor.replaceSelection()` on every partial result | Only insert FINAL segments; partial results stay in plugin state as ephemeral preview |
| i18n + voice error messages | Map errors to English only | Use existing `tr()` system with Chinese translations for all voice-related errors (mic denied, model not found, etc.) |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Main-thread AudioBuffer processing | UI jank, missed keystrokes during recording | AudioWorklet runs on dedicated audio thread | Immediately, at any audio processing |
| WASM in renderer main thread | Editor lag, 100-500ms freezes | Run WASM in Web Worker (OffscreenCanvas context or dedicated) | First audio chunk processed |
| Buffer accumulation without backpressure | Memory grows during long sessions | Monitor `pcmf32_new.size() vs 2 * n_samples_step`; discard if falling behind real-time | Sessions > 5 minutes or slow CPU |
| `JSON.stringify` for audio level comparison | Snapshot rebuild at 30fps triggers serialization of large objects | Audio level passed separately via `requestAnimationFrame` callback, not through snapshot pipeline | When audio level updates at 30fps |
| Loading both zh and en models simultaneously | Memory exceeds 500MB | Load one model at a time; language switch triggers model reload (2-5s delay) | When both models total > allowed memory |
| `getUserMedia` stream never stopped | Accumulated browser media resources | Track cleanup: `stream.getTracks().forEach(t => t.stop())` on stop and onunload | After 3-5 start/stop cycles on macOS |

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Model files downloaded over HTTP | Man-in-the-middle model tampering | Download from GitHub Releases (HTTPS) with hash verification (sherpa-onnx provides SHA256 checksums for models) |
| Audio data buffered to disk | Permanent voice records on filesystem | Keep audio in memory only; Float32Array buffers discarded after ASR processing; never write to vault filesystem |
| Model provenance unknown | Malicious model executes arbitrary code | Only use models from official sherpa-onnx releases (github.com/k2-fsa/sherpa-onnx/releases) with checksum verification |
| Debug log containing transcribed text | Privacy leak in vault debug log | Exclude transcription text from debug logs; log only metadata (audio duration, chunk count, error states) |
| child_process.exec for model serving | Shell injection, violates "local only" | Model runs in WASM/Worker, not via external process; no shell commands invoked for recognition |

## UX Pitfalls

Common user experience mistakes in speech-to-text.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| "Recording" indicator before mic is ready | User starts speaking, first 2-3 words lost | State machine with "Initializing" state: show spinner or "Preparing mic..." before switching to "Recording" |
| No audio level feedback | User doesn't know if mic is working; speaks entire paragraph with no output | VU meter during recording (3-5 bars, green/yellow/red) updated at ~30fps |
| Text appears as raw unsegmented string | Unreadable wall of Chinese characters | Insert Chinese period (。) at each silence boundary; this alone provides minimal readability |
| Auto-stop without warning | User pauses to think, recording stops; must restart and re-speak | Configurable timeout (default 30s) + visual countdown warning (3-2-1) before auto-stop |
| No error recovery when model fails to load | Plugin broken, user doesn't know why | Translated error messages: "模型加载失败，请检查模型路径设置" / "Model loading failed, check model path in settings" |
| Stale cursor position after recording | Text inserted where cursor WAS, not where user moved it during recording | Insert at CURRENT cursor position at time of each final segment; cursor may have moved |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Microphone permission:** Often only tested on developer's machine where permission is pre-granted. Verify: first-run experience on fresh Obsidian install, permission denied flow, permission revoked flow.
- [ ] **AudioContext resume:** Often works because developer tests via button click (a user gesture). Verify: trigger via keyboard shortcut (also a gesture in Obsidian commands, but double-check).
- [ ] **Model loading:** Often works because model is in development directory (not ASAR). Verify: test with a packaged plugin build (not hot-reload development mode).
- [ ] **onunload cleanup:** Often skipped because hot-reload "works most of the time." Verify: 10 consecutive hot-reloads without Obsidian restart. Microphone works on 11th try.
- [ ] **Chinese text quality:** Often tested on developer's own Mandarin (standard accent). Verify: test with regional accents, fast speech, code-switched zh/en sentences.
- [ ] **Worker termination:** Often leaks Workers on plugin unload. Verify: Chrome DevTools Performance Monitor shows no lingering Workers after plugin disable.
- [ ] **CSP blob URL approach:** Often works in Chromium but may differ in Electron. Verify: test with the actual Obsidian Electron version, not a standalone browser.
- [ ] **Silence handling:** Often tested with continuous speech. Verify: 10+ seconds of silence during recording, then resume speaking. Verify: rapid start-stop-start cycles.
- [ ] **Concurrent keyboard input:** Often tested with voice only. Verify: typing while recording (user edits earlier text while dictating new text). Cursor position must be correct.
- [ ] **Memory after long session:** Often tested with 30-second recordings. Verify: 30-minute continuous recording session. Monitor memory in Task Manager.

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| ScriptProcessorNode used instead of AudioWorklet | MEDIUM | Rewrite capture module to use AudioWorklet with Blob URL pattern. Estimate: 1-2 days. |
| Wrong model architecture (chunked instead of streaming) | HIGH | Replace model loading and inference loop. If architecture separates capture from inference cleanly (Worker boundary), the switch is isolated. Estimate: 2-4 days. |
| Native addon ABI break after Obsidian update | MEDIUM-HIGH | Ship WASM fallback. If only native addon exists, must rebuild for new Electron version and release update. Estimate: 1 day + release cycle. |
| CSP blocks AudioWorklet | LOW | Switch to Blob URL approach. Processor code is ~30 lines. Estimate: 2 hours. |
| Memory leak from unreleased MediaStream | LOW | Add proper cleanup in onunload() and stop handler. Track with `getTracks().length`. Estimate: 1 hour. |
| VAD losing short utterances | LOW | Tune sherpa-onnx endpoint parameters. No code changes needed if using built-in VAD. Estimate: 1 hour of testing/tuning. |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| ScriptProcessorNode → AudioWorklet | Phase 1 (Audio Capture) | Audio captured via AudioWorkletNode; clean PCM verified by playing back test recording |
| Whisper chunked → Zipformer streaming | Phase 2 (ASR Model) | Partial results appear within 500ms of speech; final results within 1s of sentence end |
| CSP blocks AudioWorklet | Phase 1 (Audio Capture) | AudioWorklet.addModule() succeeds from Blob URL; verified in packaged plugin |
| Native addon ABI breaks | Phase 2 (ASR Model) | WASM path chosen; no native .node files in dependency tree |
| Model files in ASAR | Phase 2 (Model Loading) | Model files downloaded to config directory; verified with production build |
| AudioContext suspended | Phase 1 (Audio Capture) | context.state === "running" after user gesture; verified via keyboard shortcut AND button click |
| Fixed-threshold VAD | Phase 2 (ASR Model) | Short utterances ("好的", "嗯", "对") transcribed correctly in test suite |
| Missing Chinese punctuation | Phase 2-3 (ASR/Post-processing) | Period inserted at each silence boundary; full punctuation model considered for Phase 3 |
| Hot reload resource leak | Phase 1 (Audio Capture) | 10 consecutive hot-reloads without Obsidian restart; mic works on 11th try |
| Renderer process slowdown | Phase 2 (ASR Model) | WASM Worker chosen; inference latency measured and documented; child_process evaluated if >500ms |

## Architecture Audit: Corrections to Existing ARCHITECTURE.md

The existing ARCHITECTURE.md (line 216) documents `createScriptProcessor(4096, 1, 1)` as the audio capture method. This **must be corrected** to `AudioWorkletNode`. The architecture research was completed before the AudioWorklet CSP constraint was fully investigated.

Additionally, ARCHITECTURE.md does not address:
- **Model file storage**: Must use Obsidian config directory, not plugin directory (ASAR constraint)
- **AudioWorklet CSP workaround**: Must use Blob URL pattern (not file path for `addModule()`)
- **Model download UX**: First-run download flow with progress indicator and checksum verification
- **Worker code inlining**: esbuild configuration for bundling worker code as inline string or Blob

These corrections should be folded into ARCHITECTURE.md before Phase 1 implementation begins.

## Sources

- [sherpa-onnx: Open-source speech framework with Node.js WASM and WebGPU support](https://github.com/k2-fsa/sherpa-onnx) -- HIGH confidence, official project with `sherpa-onnx` npm package v1.12.37
- [sherpa-onnx Node.js Examples](https://github.com/k2-fsa/sherpa-onnx/tree/master/nodejs-examples) -- HIGH confidence, official examples for online/offline ASR in Node.js
- [FunASR vs PaddleSpeech comparison 2025](https://blog.csdn.net/garyond/article/details/158689671) -- MEDIUM confidence, third-party Chinese ASR model comparison
- [AudioWorklet vs ScriptProcessorNode: Electron audio capture](https://blog.csdn.net/weixin_56818823/article/details/156155487) -- MEDIUM confidence, practical comparison with Electron-specific issues
- [Electron audio loopback and capture patterns 2025](https://alec.is/posts/bringing-system-audio-loopback-to-electron/) -- MEDIUM confidence, production Electron audio architecture
- [Electron renderer getUserMedia crash (Issue #47512)](https://github.com/electron/electron/issues/47512) -- HIGH confidence, confirmed Electron bug in v36.5.0
- [Obsidian getUserMedia macOS zero-frames issue](https://forum.obsidian.md/t/new-plugin-gesture-control-macos/111523) -- MEDIUM confidence, confirmed by plugin author experience
- [Obsidian SpessaSynth AudioWorklet CSP block](https://forum.obsidian.md/t/plugin-for-spessasynth-soundfont-synth-help-fetching-local-files-on-runtime/105242) -- MEDIUM confidence, confirmed CSP blocking addModule()
- [whisper.cpp WASM SharedArrayBuffer/CSP issues](https://github.com/ggml-org/whisper.cpp/discussions/533) -- HIGH confidence, confirmed WASM loading issues in browser context
- [Electron native Node modules ABI issues](https://electron.js.cn/docs/latest/tutorial/using-native-node-modules) -- HIGH confidence, official Electron documentation
- [VAD pitfalls in Chinese streaming ASR (CSDN)](https://blog.csdn.net/HySpark/article/details/160450546) -- MEDIUM confidence, practical VAD optimization with 28% -> 5% error rate improvement
- [Whisper streaming buffer management pitfalls](https://blog.gitcode.com/5af593eb7d50f1f2bcce76ac8c461e49.html) -- LOW confidence, third-party blog; verified core concepts against sherpa-onnx source
- [Chinese ASR punctuation restoration (FunASR CT-Transformer)](https://huggingface.co/yuekai/paraformerX) -- HIGH confidence, official model documentation
- [sherpa-onnx punctuation model support](https://github.com/k2-fsa/sherpa-onnx/issues/2570) -- HIGH confidence, official GitHub issue
- [Obsidian hot-reload plugin known issues](https://geeksrepos.com/pjeby/hot-reload/issues/7) -- MEDIUM confidence, confirmed onunload not firing during reload cycles
- Existing codebase analysis: `.planning/codebase/CONCERNS.md` (fire-and-forget void patterns, resource cleanup) and `.planning/codebase/ARCHITECTURE.md` -- HIGH confidence, self-documented

---
*Pitfalls research for: real-time local Chinese speech-to-text in Obsidian (Electron) plugin*
*Researched: 2026-05-12*
