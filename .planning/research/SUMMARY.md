# Project Research Summary

**Project:** Obsidian Link Tag Intelligence — Speech-to-Text Module
**Domain:** Real-time local Chinese speech-to-text for note-taking (Obsidian plugin)
**Researched:** 2026-05-12
**Confidence:** HIGH (stack and pitfalls are highly confident from multiple verified sources; architecture is MEDIUM pending phase-specific validation)

## Executive Summary

This project adds real-time Chinese speech-to-text to an existing Obsidian plugin. The defining constraints are: fully local operation (no cloud, no API keys), model size under 200MB, true streaming with incremental partial results, Chinese-primary with English switching, and integration into an existing plugin with toolbar, settings, and i18n infrastructure.

The research converges on a single feasible technology path: **sherpa-onnx WASM running in a Web Worker**, with AudioWorklet for clean audio capture, Zipformer INT8 models (~25-80MB) for streaming Chinese ASR, and CodeMirror 6 transactions for sentence-by-sentence cursor insertion. No other stack simultaneously satisfies all constraints — alternatives (whisper.cpp, Vosk, cloud APIs) each fail on at least one requirement (streaming, size, accuracy, or privacy). The architecture follows the existing plugin's patterns (flat src/, signature-based UI diffing, addCommand + toolbar dual triggers).

The critical risks are all addressable if caught early: AudioWorklet CSP restrictions require a Blob URL workaround (not file-path loading), model files must live outside the ASAR archive (in Obsidian's config directory), and AudioContext must be created inside a user-gesture handler (not during plugin load). The biggest single architectural correction needed is the current ARCHITECTURE.md's documentation of `ScriptProcessorNode` — this must become `AudioWorkletNode` before Phase 1 begins.

## Key Findings

### Recommended Stack

The entire stack centers on **sherpa-onnx** as the ASR engine. It is the only candidate that provides native Node.js/Electron streaming Chinese recognition with <200MB models and no external servers. The Zipformer zh-14M INT8 model (~25MB) achieves CER ~4.67% on WenetSpeech, which beats whisper.cpp small for Chinese at 1/18th the size. Audio capture uses Web Audio API (`getUserMedia` + `AudioWorkletNode`) which is already available in Obsidian's Electron runtime. All inference runs in a Web Worker (WASM), keeping the main thread responsive. No native addons — WASM avoids Electron ABI breakage across updates. Model files are downloaded to Obsidian's config directory on first use, not bundled in the plugin (ASAR constraint).

**Core technologies:**
- **sherpa-onnx (WASM) ^1.12.37**: Streaming Chinese STT engine — only stack option that satisfies all constraints (local, <200MB, streaming, Node.js/Electron compatible)
- **Zipformer zh-14M INT8 model (~25MB)**: Primary ASR model — best CER-to-size ratio for Chinese; bilingual zh-en model (~70MB) available as fallback for English mode
- **Web Audio API (AudioWorkletNode)**: Microphone capture with clean PCM output — must use AudioWorklet, not ScriptProcessorNode (Pitfall 1)
- **Web Worker**: Isolates WASM inference off main thread — prevents UI jank during recognition
- **esbuild (existing)**: Mark sherpa-onnx as external in build config; no native rebuild needed

### Expected Features

**Must have (table stakes — P1, v1):**
- Keyboard shortcut to start/stop recording — follows existing `addCommand` pattern
- Visual recording state indicator (5-state machine: Idle → Initializing → Recording → Processing → Done)
- Real-time sentence-by-sentence text insertion at cursor via CodeMirror 6
- Audio level VU meter during recording (3-5 bars, green/yellow/red)
- Chinese language support as primary, English as secondary
- Sidebar toolbar button integration into existing `lti-toolbar-button` pattern
- Local-only operation — zero network requests, zero API keys
- Auto-stop on silence (configurable timeout)
- Settings panel integration in existing `LinkTagIntelligenceSettingTab`
- i18n for all voice-related strings (zh/en)

**Should have (differentiators — P2, v1.x):**
- Fully offline with zero API key requirement — the single biggest competitive advantage over every existing Obsidian voice plugin
- Chinese-first optimization — no other Obsidian voice plugin treats Chinese as primary
- Partial/final result visual distinction (low-confidence text in grey, final in normal color)
- Audio device selection in settings
- Recording duration display
- Earcon audio cues (toggleable chimes on start/stop)

**Defer (v2+):**
- Voice-triggered link and tag detection (link to intelligence features)
- Automatic punctuation restoration (full model — basic period insertion at boundaries goes in v1)
- Custom vocabulary / hotword boosting for vault-specific terms
- Mobile Obsidian support
- Optional LLM polish pass for disfluency cleanup

**Explicitly excluded (anti-features):**
- Voice commands for formatting (false positive rate too high with local models)
- Speaker diarization (personal note-taking is single-speaker)
- Audio file saving and playback (vault bloat, privacy risk)
- Cloud API fallback (undermines core value proposition)
- Hold-to-record mode (unsuitable for sustained dictation)

### Architecture Approach

The architecture mirrors the existing plugin's patterns while adding three new modules in the flat `src/` directory. A Web Worker isolates all WASM-based ML inference from the main thread — audio flows in, text flows out via `postMessage`. The AudioWorklet processor (loaded via Blob URL to bypass CSP) resamples mic input to 16kHz mono and feeds it to the Worker. A centralized speech state manager in the Plugin instance coordinates the capture-worker-output lifecycle and feeds state changes to the existing signature-based UI diffing system for toolbar updates.

**Major components:**
1. **Audio Capture (`speech-capture.ts`)**: `getUserMedia` → AudioWorkletNode → 16kHz PCM Float32Array chunks. Also computes audio level for VU meter. Must handle AudioContext suspended state (Pitfall 6) and resource cleanup (Pitfall 9).
2. **Web Worker (`speech-worker.ts`)**: Loads sherpa-onnx WASM + model, accepts audio buffers, runs streaming inference, emits partial/final text segments. Isolated from Obsidian API — only communicates via structured clone `postMessage`.
3. **Speech State Manager (`speech.ts` + Plugin fields)**: Tracks recording state machine, buffers partial text, coordinates start/stop, dispatches final text to editor. Pure functions + plugin-owned state pattern (like existing `tags.ts` / `references.ts`).
4. **Toolbar Button (extended `view.ts`)**: Dual trigger (command + button click) calls same `toggleSpeechRecognition()`. Signature-based diffing updates button appearance and audio level indicator without DOM thrashing.
5. **Editor Text Insertion (`main.ts`)**: Reuses existing `insertTextIntoEditor()` with CodeMirror 6 `replaceSelection`. Only final segments inserted; partial results stay in ephemeral state.
6. **Settings (`settings.ts`)**: Model path, language preference, VAD sensitivity, auto-stop timeout. Follows existing `LinkTagIntelligenceSettingTab` pattern.
7. **i18n (`i18n.ts`)**: ~15 new translation keys for speech-related UI labels, error messages, and settings descriptions.

### Critical Pitfalls

1. **ScriptProcessorNode causes crashes and bad audio.** It runs on the main thread, produces dirty PCM, and is documented to cause Windows BSOD in Electron. Must use AudioWorkletNode exclusively. This is the single most important architectural correction — current ARCHITECTURE.md documents the wrong API. Fix before Phase 1.

2. **Obsidian CSP blocks AudioWorklet.addModule().** Obsidian's Content Security Policy blocks loading worklet processor files from disk. Must generate processor code as a string, create a Blob URL, and load from there. This is the only confirmed workaround for Obsidian plugins.

3. **Whisper is not real-time; Zipformer is.** Whisper is chunk-based (processes 30-second windows) — 2-10 second delays with no incremental output. sherpa-onnx Zipformer models produce partial and final results incrementally as audio arrives. Model selection is irreversible without rewrite.

4. **Model files must live outside ASAR.** WASM/Emscripten virtual filesystems cannot read files from Electron's ASAR archives. Models must be downloaded to Obsidian's config directory (`app.vault.configDir/plugins/link-tag-intelligence/models/`) on first run, never referenced from the plugin source directory.

5. **AudioContext starts suspended.** Chromium's autoplay policy requires AudioContext creation inside a user gesture. Creating it in `onload()` results in silent failure. Create and resume `AudioContext` inside the command/toolbar click handler.

6. **Fixed-threshold VAD loses short Chinese utterances.** 28% misclassification rate for responses like "好的" or "没问题". Use sherpa-onnx's built-in VAD with dynamic thresholding, not hand-tuned energy levels.

7. **Chinese without punctuation is unreadable.** Chinese has no word spacing — raw ASR output without segmentation is a wall of characters. Insert Chinese periods (。) at each sentence boundary (pause threshold). Full punctuation restoration model defers to v2.

8. **Hot reload leaks AudioContext and MediaStream.** Each hot-reload cycle without proper cleanup exhausts mic resources. Implement thorough `onunload()` cleanup from the first capture implementation: close AudioContext, stop MediaStream tracks, terminate Worker.

9. **Renderer process WASM is 4-5x slower than Node.js.** Acceptable for v1 single-user dictation (200ms vs 50ms still well within <2s requirement). Web Worker WASM is the pragmatic choice. WebGPU acceleration (available in Electron Chromium 113+) can be evaluated for optimization.

10. **Native addons break on every Obsidian Electron update.** NODE_MODULE_VERSION mismatches cause cryptic errors after Obsidian upgrades. WASM path avoids this entirely. If native addons are ever needed, they require multi-platform prebuilt binaries and rebuilds targeting Obsidian's exact Electron ABI.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Audio Capture & UI Foundation
**Rationale:** The audio capture pipeline is the hard prerequisite for everything. Microphone access, AudioWorklet (with CSP workaround), AudioContext lifecycle, and recording state machine must work before any ASR integration can be tested. The toolbar button and keyboard shortcut provide the interaction surface. The 5-state machine (Idle → Initializing → Recording → Processing → Done) prevents the #1 UX bug (premature recording indicator). Audio level VU meter gives users confidence the mic works.

**Delivers:** Working microphone capture with clean 16kHz PCM output verified via playback test. Recording toggle via keyboard shortcut and toolbar button. Visual state indicator cycling through all 5 states. Audio level VU meter (3-5 bars, green/yellow/red). Settings panel fields for model path, language, VAD sensitivity, auto-stop timeout. i18n strings for all voice-related UI.

**Addresses:** Mic permission handling, keyboard shortcut, recording state machine, toolbar button with state indicator, audio level indicator, settings panel integration, i18n voice strings (all P1).

**Avoids:** Pitfall 1 (ScriptProcessorNode → AudioWorkletNode), Pitfall 3 (CSP → Blob URL), Pitfall 6 (AudioContext suspended → create in user gesture), Pitfall 9 (hot reload leaks → onunload cleanup from day one).

### Phase 2: ASR Model Integration
**Rationale:** Once audio capture produces clean PCM, the ASR pipeline can be integrated. This is the core technical challenge — model loading, WASM Worker initialization, streaming inference, and sentence boundary detection. Model files must be downloaded to the config directory (not plugin directory) to survive ASAR packaging. The first-run model download flow needs a progress indicator and checksum verification. Sentence-by-sentence insertion at cursor via CodeMirror 6 transactions provides the primary user value.

**Delivers:** sherpa-onnx WASM running in Web Worker with Zipformer zh-14M INT8 model. Streaming partial results within 500ms of speech, final results within 1s of sentence end. Sentence boundary detection via configurable pause threshold. Text insertion at current cursor position via existing `insertTextIntoEditor()`. Language switch (zh/en) with model reload. Auto-stop on silence with configurable timeout and visual countdown.

**Addresses:** Local ASR model (zh+en), sentence-by-sentence cursor insertion, language switching, auto-stop on silence (all P1 core features).

**Avoids:** Pitfall 2 (chunked → streaming Zipformer), Pitfall 4 (native addon → WASM), Pitfall 5 (ASAR → config directory), Pitfall 7 (fixed VAD → sherpa-onnx built-in VAD), Pitfall 8 (no punctuation → basic period insertion at boundaries), Pitfall 10 (renderer slowdown → Web Worker, accept overhead for v1).

### Phase 3: Polish & User Experience
**Rationale:** After the core pipeline works end-to-end, UX polish closes the feedback gaps that make the difference between "functional" and "delightful." Partial/final result visual distinction helps users trust the output. Error recovery with translated messages handles the common failure modes gracefully. Earcon cues provide non-visual confirmation. Duration display and audio device selection round out the settings.

**Delivers:** Partial (low-confidence) text shown in grey, final text in normal color. Graceful error recovery for mic denial, model load failure, and recognition errors, all with Chinese + English messages. Earcon audio cues (toggleable chimes on start/stop). Recording duration timer display. Audio device selection dropdown in settings. "Resume after pause" mode.

**Addresses:** Partial/final result distinction, recording duration display, earcon audio cues, audio device selection, model download/management UI (all P2).

**Avoids:** Remaining UX pitfalls from the "Looks Done But Isn't" checklist: first-run experience testing, 10x hot-reload endurance, 30-minute recording memory stability, concurrent keyboard input handling.

### Phase 4 (Future): Intelligence Integration & Advanced Features
**Rationale:** Deferred until the core STT experience is validated. Voice-triggered link detection, custom vocabulary, and LLM polish add compound value by connecting speech to the existing link/tag intelligence features. Full punctuation restoration model provides professional-grade Chinese output. Mobile support is a separate evaluation.

**Delivers:** Voice-triggered wikilink detection (e.g., "link to 项目计划" → `[[项目计划]]`), voice-triggered tag detection, custom vocabulary for vault-specific terms, optional local LLM polish pass (Ollama), full FunASR CT-Transformer punctuation model, mobile Obsidian evaluation.

**Addresses:** Voice-triggered link detection, voice-triggered tag detection, custom vocabulary, LLM polish pass, streaming partial hypotheses display (all P3).

### Phase Ordering Rationale

- **Phase 1 before Phase 2**: Audio capture is the hard prerequisite — ASR inference has nothing to process without working mic input. The recording state machine must be correct before text output has meaning. The AudioWorklet CSP workaround must be solved before any audio code works at all.

- **Phase 2 before Phase 3**: Core transcription must work end-to-end before investing in polish. Partial/final result distinction, error recovery messages, and earcon cues are meaningless if the model doesn't produce text. Polish features are built on top of a working pipeline, not alongside it.

- **Phase 4 as stretch goal**: Intelligence integration depends on both working STT and working link/tag detection. It creates compound value but adds significant complexity (NLP on transcribed text). Validate the core STT experience before investing in integration.

- **All phases avoid the "big rewrite" pitfalls**: AudioWorklet from day one (no ScriptProcessorNode migration), WASM-only (no native addon ABI break), streaming Zipformer (no Whisper chunked rewrite). Architectural foundations are correct upfront rather than patched later.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (ASR Model Integration):** WASM Worker initialization with sherpa-onnx in Electron context — the sokuji reference implementation proves this works in Electron 40, but the exact initialization sequence, model format loading, and WebGPU availability need phase-specific validation. Model download UX (progress, checksum, resume) is under-researched.
- **Phase 4 (Intelligence Integration):** NLP on transcribed text for link/tag detection — no existing Obsidian plugin does this. Need to research false positive rates and detection patterns specific to spoken Chinese.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Audio Capture & UI):** AudioWorklet + getUserMedia is a well-documented web standard. The Blob URL CSP workaround is a confirmed pattern. The 5-state recording machine follows established UX best practices. Toolbar button integration follows existing `lti-toolbar-button` patterns.
- **Phase 3 (Polish & UX):** All features are incremental UI improvements on a working pipeline. No new architectural decisions needed.
- **Settings and i18n:** Follow existing `LinkTagIntelligenceSettingTab` and `tr()` patterns — no research needed.

## Architecture Corrections Needed

PITFALLS.md identifies corrections needed in the current ARCHITECTURE.md before implementation begins:

1. **Line 216: `createScriptProcessor(4096, 1, 1)` → `AudioWorkletNode`** — ScriptProcessorNode is deprecated, produces dirty audio, and causes main-thread jank. This must be corrected before Phase 1.
2. **Model file storage strategy** — ARCHITECTURE.md does not address the ASAR constraint. Models must use `app.vault.configDir`, not plugin directory.
3. **AudioWorklet CSP workaround** — Must document the Blob URL pattern, not file-path `addModule()`.
4. **Model download UX** — First-run download flow with progress indicator and checksum verification needs documentation.
5. **Worker code inlining** — esbuild configuration for bundling worker code as inline string or Blob.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Multiple verified official sources (sherpa-onnx releases, npm registry, model benchmarks). Only one viable stack option — the decision is forced by constraints, not chosen from equals. Model accuracy benchmarks from official training framework (icefall). WASM/Web Worker pattern confirmed by production Electron app (sokuji). |
| Features | HIGH | Comprehensive competitor analysis across all Obsidian voice plugins. Industry UX standards (Dragon, Aqua Voice, 讯飞) well-documented. Feature dependencies mapped. Clear MVP definition with priority matrix. |
| Architecture | MEDIUM | Component boundaries and data flow are well-defined and follow existing plugin patterns. But sherpa-onnx Worker initialization in Electron context needs phase-specific validation (sokuji reference proves concept but exact integration details differ). Worker code inlining strategy depends on esbuild configuration testing. |
| Pitfalls | HIGH | 10 pitfalls documented with specific prevention strategies, warning signs, and phase mapping. Multiple pitfalls are confirmed from official sources (Electron ASAR docs, Obsidian forum CSP reports, Chromium autoplay policy). Recovery cost estimates provided. Architecture audit identified concrete corrections needed. |

**Overall confidence:** HIGH for technology decisions and risk identification; MEDIUM for implementation specifics that require phase-level testing.

### Gaps to Address

- **WebGPU acceleration availability:** sherpa-onnx supports WebGPU in Chromium 113+. Obsidian's bundled Electron version needs verification — if WebGPU is available, inference latency could match or exceed native performance. Handle during Phase 2 ASR integration.
- **Model download reliability from China:** Users in mainland China may have slow/unreliable access to HuggingFace (where official models are hosted). Consider mirror options or bundled model distribution. Handle during Phase 2 model download UX design.
- **Regional accent accuracy:** Zipformer 14M model is benchmarked on WenetSpeech (standard Mandarin). Performance on regional Chinese accents (Cantonese-accented Mandarin, Sichuan-accented Mandarin, etc.) is unverified. Handle during Phase 2 testing with diverse speech samples.
- **Bilingual code-switching quality:** The bilingual zh-en model handles language switching but code-switching within a single utterance (Chinese sentence with English terms) is not benchmarked. The single-model approach means one language at a time — true code-switching may require the bilingual model + custom post-processing. Handle during Phase 2 language switching testing.

## Sources

### Primary (HIGH confidence)
- [sherpa-onnx GitHub Releases](https://github.com/k2-fsa/sherpa-onnx/releases) — official releases, npm package v1.12.37, model zoo
- [sherpa-onnx Node.js API (DeepWiki)](https://deepwiki.com/k2-fsa/sherpa-onnx/3.9-node.js-api) — official API documentation
- [sherpa-onnx Pretrained Models](https://k2-fsa.github.io/sherpa/onnx/pretrained_models/online-transducer/index.html) — official model registry and downloads
- [icefall WenetSpeech benchmarks](https://github.com/k2-fsa/icefall) — training framework with official benchmark results
- [Obsidian Plugin Developer Documentation](https://docs.obsidian.md) — official API reference
- [Web Workers API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API) — web standard
- [AudioContext API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext) — web standard
- [Electron native Node modules ABI issues](https://electron.js.cn/docs/latest/tutorial/using-native-node-modules) — official Electron documentation
- [Electron renderer getUserMedia crash (Issue #47512)](https://github.com/electron/electron/issues/47512) — confirmed Electron bug
- [whisper.cpp WASM SharedArrayBuffer/CSP issues](https://github.com/ggml-org/whisper.cpp/discussions/533) — confirmed WASM loading constraints
- [FunASR CT-Transformer punctuation model](https://huggingface.co/yuekai/paraformerX) — official model documentation
- Existing codebase: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`, `.planning/codebase/CONCERNS.md` — self-documented

### Secondary (MEDIUM confidence)
- [sokuji: Electron 40 + sherpa-onnx WASM production app](https://explore.market.dev/ecosystems/typescript/projects/sokuji) — reference implementation proving architecture works
- [obsidian-sysaudio-recorder-plugin](https://github.com/codyklr/obsidian-sysaudio-recorder-plugin) — confirms getUserMedia works in Obsidian
- [Obsidian SpessaSynth AudioWorklet CSP block](https://forum.obsidian.md/t/plugin-for-spessasynth-soundfont-synth-help-fetching-local-files-on-runtime/105242) — confirms CSP blocks addModule()
- [Voxtral Transcribe - Obsidian Forum](https://forum.obsidian.md/t/voxtral-transcribe-dictate-and-type-at-the-same-time-into-your-notes-with-voice-commands-beta-testers-wanted/112674) — competitor feature analysis
- [Voice Note for Obsidian - GitHub](https://github.com/naiding/obsidian-voice-note) — competitor feature analysis
- [AudioWorklet vs ScriptProcessorNode comparison](https://blog.csdn.net/weixin_56818823/article/details/156155487) — practical Electron-specific audio capture comparison
- [VAD pitfalls in Chinese streaming ASR](https://blog.csdn.net/HySpark/article/details/160450546) — practical VAD optimization data
- [Electron WebGPU Support](https://www.electronjs.org/docs/latest/tutorial/webgpu) — official Electron docs (version-dependent)
- [Whisper model sizes comparison](https://openwhispr.com/blog/whisper-model-sizes-explained) — community benchmark
- [Obsidian hot-reload plugin known issues](https://geeksrepos.com/pjeby/hot-reload/issues/7) — confirmed onunload behavior

### Tertiary (LOW confidence)
- [Vosk Chinese accuracy (CSDN multi-engine comparison)](https://blog.csdn.net/garyond/article/details/158689671) — community test, needs official benchmark validation
- [Whisper streaming buffer management pitfalls](https://blog.gitcode.com/5af593eb7d50f1f2bcce76ac8c461e49.html) — third-party blog, core concepts verified against sherpa-onnx source

---
*Research completed: 2026-05-12*
*Ready for roadmap: yes*
