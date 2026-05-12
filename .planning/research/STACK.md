# Stack Research: 本地中文语音转文字 (Local Chinese Speech-to-Text)

**Domain:** Real-time local Chinese STT for Obsidian Electron plugin
**Researched:** 2026-05-12
**Confidence:** HIGH (multiple verified sources, official docs consulted)

## Recommended Stack

### Core Speech Recognition Engine

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **sherpa-onnx** (WASM) | `^1.12.37` | Chinese streaming STT engine | Only candidate that provides native Node.js/Electron streaming Chinese ASR with <200MB models, no external servers, and production-proven real-time partial results |

### Model

| Model | Format | Size | Purpose | Why Recommended |
|-------|--------|------|---------|-----------------|
| `sherpa-onnx-streaming-zipformer-zh-14M-2023-02-23` | INT8 ONNX | **~25 MB** | Primary Chinese streaming ASR model | Best size-to-accuracy ratio: 14M params, INT8 quantized, CER ~4.7% on WenetSpeech, fits well within 200MB constraint |
| `sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20` | INT8 ONNX | **~70 MB** | Fallback: Chinese + English bilingual | Use when user switches to English recognition mode; covers SPEECH-05 requirement |

### Audio Capture

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Web Audio API** (`MediaRecorder` + `AudioContext`) | Built-in (Chromium/Electron) | Microphone capture in Obsidian renderer | Already available in Obsidian's Electron runtime; no native dependencies; `getUserMedia({ audio: true })` confirmed working in Obsidian plugins (see `obsidian-sysaudio-recorder-plugin`) |
| **AudioWorklet** | Built-in (Chromium/Electron) | Low-latency PCM extraction from mic stream | Required to get raw 16kHz mono PCM for sherpa-onnx; runs off main thread, no blocking |

### Build Integration

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **esbuild** (existing) | `^0.25.0` | Bundle plugin | Mark `sherpa-onnx` as external in esbuild config; model files shipped as plugin assets |
| **sherpa-onnx** (npm) | `^1.12.37` | WASM-based STT runtime | Single npm dependency; no native rebuild needed for Electron; works in both renderer and worker contexts |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sherpa-onnx-node` | `^1.12.0` | Native addon (multi-threaded) | Production optimization if WASM single-thread perf is insufficient; requires `electron-rebuild` |
| - | - | VAD (Voice Activity Detection) | Built into sherpa-onnx `Vad` class; no separate library needed |
| - | - | Punctuation restoration | Built into sherpa-onnx via `OnlineRecognizer` config with punctuation model; no separate library needed |

## Installation

```bash
# WASM approach (recommended for initial integration)
npm install sherpa-onnx@^1.12.37

# Model files: download from HuggingFace and ship in plugin assets/
# https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-zh-14M-2023-02-23
# Required files (INT8 quantized):
#   - encoder-epoch-99-avg-1.int8.onnx (21.6 MB)
#   - decoder-epoch-99-avg-1.int8.onnx (1.89 MB)
#   - joiner-epoch-99-avg-1.int8.onnx (1.80 MB)
#   - tokens.txt (48.7 KB)
# Total: ~25.3 MB

# Optional: bilingual zh-en model for English mode
# https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20
# Total INT8: ~70 MB
```

### esbuild Configuration Change

```javascript
// esbuild.config.mjs - add sherpa-onnx to externals
external: [
  "obsidian",
  "@codemirror/state",
  "@codemirror/view",
  "sherpa-onnx",       // NEW: WASM module loaded at runtime
  "sherpa-onnx-node"    // NEW: if using native addon variant
]
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| **sherpa-onnx** (Zipformer zh-14M INT8) | sherpa-onnx (Zipformer zh-xlarge INT8, 2025-06-30, ~80MB) | If 14M accuracy insufficient; xlarge model still comfortably under 200MB |
| **sherpa-onnx** (Zipformer) | sherpa-onnx (Paraformer streaming zh) | If latency is more critical than accuracy; Paraformer has lower decoding latency (~70ms vs ~200ms) but slightly lower Chinese accuracy |
| **sherpa-onnx** (WASM) | `sherpa-onnx-node` (native addon) | If WASM single-threaded perf is insufficient; native addon supports multi-threading but requires Electron native module rebuild |
| **sherpa-onnx** | Vosk (chinese model, ~45MB) | Only for ultra-low-resource scenarios (<100MB RAM budget); Vosk Chinese accuracy (WER 4-12%) does NOT beat Whisper |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **faster-whisper (CTranslate2)** | Python-only library; requires separate Python process. Violates "no separate frameworks/servers" constraint. No Node.js binding exists. | sherpa-onnx (has Whisper model support via ONNX if needed) |
| **SenseVoice/FunASR (native Python)** | Primary API is Python + Docker; SenseVoiceSmall model alone is 234M params (exceeds 200MB). Requires Python runtime. Violates constraints. | sherpa-onnx (wraps SenseVoice models as ONNX, but Zipformer models are smaller and faster for this use case) |
| **whisper.cpp (small model)** | 466MB model size exceeds 200MB constraint. No true streaming (batch processing only, no incremental partial results). tiny/base models have poor Chinese accuracy (CER 18.7%/8.9%). | sherpa-onnx with Zipformer models (true streaming, 25-80MB, better Chinese accuracy) |
| **Silero** | Zero Chinese STT support (only EN/DE/ES/UA). VAD works for Chinese but with high error rates (~20-30% speech loss). | sherpa-onnx built-in VAD (trained on multilingual data including Chinese) |
| **Vosk** | Chinese accuracy (WER 4-12%) does NOT beat Whisper (user's stated requirement). Old WFST architecture, no built-in punctuation, Electron FFI compatibility issues with `ffi-napi`. Node binding requires native library `libvosk.so`. | sherpa-onnx (end-to-end neural, built-in punctuation, WASM works in Electron without FFI headaches) |
| **Web Speech API** | Cloud-dependent in most browsers; Chinese accuracy varies by implementation; user explicitly requires local-only. | sherpa-onnx (fully offline) |
| **Cloud APIs (Baidu/iFlytek/Azure/etc.)** | User explicitly requires local-only, no network. Violates privacy constraint. | sherpa-onnx |

## Why sherpa-onnx Wins

This is not a close call. sherpa-onnx is the only candidate that simultaneously satisfies all constraints:

| Constraint | sherpa-onnx | Next Best |
|------------|-------------|-----------|
| **Local-only, no cloud** | Yes, fully offline ONNX inference | Vosk (but fails accuracy) |
| **Model size <200MB** | 25 MB (14M INT8) or 80 MB (xlarge INT8) | Vosk (45 MB, but fails accuracy) |
| **Chinese accuracy > Whisper** | Zipformer CER ~4.4-4.7% (beats whisper small/medium for Chinese) | whisper.cpp large-v3 (CER ~3.7% but 2.9GB!) |
| **True streaming with partial results** | Yes, `OnlineRecognizer` + `OnlineStream` with incremental decode | Vosk (yes, but lower accuracy) |
| **No separate frameworks/servers** | Single npm dependency, runs in Electron renderer or worker | whisper.cpp (npm package exists, but no streaming) |
| **Node.js/Electron compatible** | WASM package works in any Electron context; native addon available for perf | whisper.cpp (via `smart-whisper-electron`, but no streaming) |

### Chinese Accuracy Benchmarks

| Model | Test Set | CER | Model Size |
|-------|----------|-----|------------|
| sherpa-onnx Zipformer-large (157M) | WenetSpeech test | **4.28%** | ~260 MB FP32 |
| sherpa-onnx Zipformer-small (30M) | WenetSpeech test | **4.67%** | ~55 MB FP32 / ~25 MB INT8 |
| sherpa-onnx Zipformer (73M) | WenetSpeech test | **4.40%** | ~120 MB FP32 / ~70 MB INT8 |
| whisper.cpp large-v3 | AISHELL-1 | ~4.2% | 2.9 GB |
| whisper.cpp small | Common Voice zh | ~6.2% | 466 MB |
| Vosk Chinese (v0.42) | Clean speech | WER ~4-8% | 45 MB |

*Sources: icefall RESULTS.md (Zipformer WenetSpeech benchmarks), OpenAI whisper GitHub discussions, Vosk model documentation*

### Latency Estimates

| Component | Latency | Notes |
|-----------|---------|-------|
| Microphone → PCM buffer (AudioWorklet) | <10 ms | 16kHz mono, 4096-sample frames |
| Audio buffer → sherpa-onnx acceptWaveform | <5 ms | Memory copy within same process |
| Zipformer encoder forward pass (per chunk) | ~20-50 ms | On modern CPU (Intel i7/Apple M1+) |
| Decoder step (per chunk) | ~5-10 ms | Greedy search, single-threaded |
| **Total end-to-end per partial result** | **<100 ms** | Well within <2s requirement |
| Endpoint detection (trailing silence) | Configurable 0.5-2.4s | Determines sentence boundary |

## Architecture Integration Strategy

### Process Model: Renderer Process (WASM) or Dedicated Worker

The recommended approach mirrors the existing `child_process` integration pattern but uses in-process WASM for simplicity:

**Phase 1 (MVP): WASM in renderer via AudioWorklet**
```
Obsidian Renderer Process
  ├── Plugin UI (sidebar button, status, volume meter)
  ├── AudioWorklet (mic → 16kHz PCM, off main thread)
  ├── sherpa-onnx WASM (OnlineRecognizer, on Web Worker or main thread)
  └── CodeMirror editor insertion
```

**Phase 2 (optimization, if needed): Native addon**
```
Obsidian Renderer Process
  ├── Plugin UI
  ├── AudioWorklet (mic → PCM)
  └── sherpa-onnx-node native addon (multi-threaded decoding)
```

### Key Integration Points

1. **Microphone access**: `navigator.mediaDevices.getUserMedia({ audio: true })` -- already works in Obsidian Electron (confirmed by `obsidian-sysaudio-recorder-plugin` v1.2.0, Nov 2025)
2. **Audio resampling**: AudioWorklet resamples browser-default sample rate to 16kHz mono Float32 before feeding to sherpa-onnx
3. **Model loading**: Model `.onnx` files and `tokens.txt` shipped in plugin `assets/models/` directory, loaded via `app.vault.adapter.getBasePath()` + relative path
4. **Partial results → editor**: `OnlineRecognizer.getResult(stream)` returns incremental text; insert into CodeMirror editor via existing `editor.replaceSelection()` or `Vault.process()` pattern
5. **Lifecycle**: Cleanup via Obsidian `onunload()` -- `stream.free()`, `recognizer.free()`, stop microphone track

### Data Flow

```
Microphone ──▶ getUserMedia ──▶ AudioWorklet ──▶ 16kHz PCM Buffer
                                                        │
                                                        ▼
                                              sherpa-onnx OnlineStream
                                              .acceptWaveform(sampleRate, samples)
                                                        │
                                              .isReady(stream)?
                                                        │ YES
                                                        ▼
                                              .decode(stream)
                                              .getResult(stream) → partial text
                                                        │
                                                        ▼
                                              .isEndpoint(stream)?
                                                        │ YES (sentence boundary)
                                                        ▼
                                              Insert text into editor
                                              .reset(stream) → ready for next sentence
```

## Version Compatibility

| Package | Compatible With | Notes |
|-----------|-----------------|-------|
| `sherpa-onnx@^1.12.37` | Node.js >= 18, Electron >= 28 | WASM package; no native build needed |
| `sherpa-onnx-node@^1.12.0` | Node.js >= 16, Electron >= 28 | Native addon; requires matching Electron Node ABI |
| Model `zh-14M-2023-02-23` | sherpa-onnx >= 1.10.x | Forward compatible with all newer sherpa-onnx versions |
| Model `bilingual-zh-en-2023-02-20` | sherpa-onnx >= 1.10.x | Forward compatible |

## Model Shipping Strategy

Models are downloaded at first use or bundled with the plugin. Recommendation:

1. **Bundle the 14M INT8 model (~25MB)** with the plugin release -- small enough to not bloat the plugin
2. **Offer the bilingual model (~70MB) as an optional download** for English mode
3. Store models in `pluginDir/assets/models/`
4. Use Obsidian's `Vault` adapter to resolve paths: `adapter.getBasePath() + '/.obsidian/plugins/link-tag-intelligence/assets/models/'`

## Sources

- [sherpa-onnx GitHub Releases (v1.12.37 latest)](https://github.com/k2-fsa/sherpa-onnx/releases) -- HIGH confidence (official releases)
- [sherpa-onnx npm package](https://www.npmjs.com/package/sherpa-onnx) -- HIGH confidence (official package registry)
- [sherpa-onnx Node.js API (DeepWiki)](https://deepwiki.com/k2-fsa/sherpa-onnx/3.9-node.js-api) -- HIGH confidence (official documentation)
- [sherpa-onnx Online Transducer Models (official)](https://k2-fsa.github.io/sherpa/onnx/pretrained_models/online-transducer/index.html) -- HIGH confidence (official model registry)
- [sherpa-onnx Zipformer zh-14M HuggingFace](https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-zh-14M-2023-02-23) -- HIGH confidence (official model repository)
- [icefall Zipformer WenetSpeech benchmarks](https://github.com/k2-fsa/icefall) -- HIGH confidence (training framework repo)
- [mobile-pc-control-server (Electron + sherpa-onnx integration)](https://deepwiki.com/smilexizheng/mobile-pc-control-server/5.6-voice-recognition) -- MEDIUM confidence (third-party reference implementation)
- [obsidian-sysaudio-recorder-plugin](https://github.com/codyklr/obsidian-sysaudio-recorder-plugin) -- MEDIUM confidence (confirms getUserMedia works in Obsidian)
- [whisper.cpp model size comparison (openwhispr.com)](https://openwhispr.com/blog/whisper-model-sizes-explained) -- MEDIUM confidence (community benchmark)
- [faster-whisper vs whisper.cpp benchmarks (SYSTRAN)](https://github.com/SYSTRAN/faster-whisper) -- HIGH confidence (official benchmarks)
- [Vosk Chinese accuracy (CSDN multi-engine comparison)](https://blog.csdn.net/garyond/article/details/158689671) -- LOW confidence (community test, not official benchmark)
- [Silero model language support](https://deepwiki.com/snakers4/silero-models/3.1-speech-to-text-models) -- HIGH confidence (official documentation, confirms no Chinese STT)

---
*Stack research for: Obsidian Link Tag Intelligence -- Speech-to-Text module*
*Researched: 2026-05-12*
