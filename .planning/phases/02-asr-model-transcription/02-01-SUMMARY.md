---
phase: 02-asr-model-transcription
plan: 01
subsystem: speech
tags: [sherpa-onnx, web-worker, wasm, asr, speech-recognition, esbuild-multi-entry]

# Dependency graph
requires:
  - phase: 01-speech-ui-foundation
    provides: "SpeechRecorder with capture pipeline, RecorderSnapshot UI, VU meter, i18n system"
provides:
  - "Web Worker entry point (speech-worker.ts) with sherpa-onnx WASM integration"
  - "Worker message protocol: init/audio/reset/destroy with postMessage transfer"
  - "SpeechRecorder Worker lifecycle management (create/destroy/language switch/error handling)"
  - "esbuild multi-entry build producing main.js + speech-worker.js"
  - "Mock sherpa-onnx API surface for Vitest Worker protocol tests"
  - "Path traversal protection in Worker modelDir validation (T-02-01)"
affects: [02-02-transcription-pipeline, 02-03-model-download]

# Tech tracking
tech-stack:
  added: [sherpa-onnx@^1.13.1]
  patterns:
    - "Web Worker entry as standalone CJS module with require() for Node.js integration"
    - "Audio ArrayBuffer transfer via postMessage(buffer, [buffer.buffer]) for zero-copy"
    - "Lazy Worker creation on first toggle, reuse across recording sessions"
    - "Inline Worker handler in test for contract testing without browser Worker APIs"

key-files:
  created:
    - src/speech-worker.ts - Web Worker entry with sherpa-onnx WASM
    - tests/mocks/sherpa-onnx.ts - Mock sherpa-onnx for Vitest
    - tests/speech-worker.test.ts - 12 Worker protocol contract tests
    - speech-worker.js - Build output (CJS, sherpa-onnx externalized)
  modified:
    - src/speech-recorder.ts - Worker lifecycle, audio routing, error handling
    - src/main.ts - setApp, onAsrResult callback, settings sync
    - src/i18n.ts - speechAsrInitFailed key (en + zh)
    - esbuild.config.mjs - Multi-entry build + sherpa-onnx external
    - package.json - sherpa-onnx dependency
    - main.js - Build output (updated multi-entry)

key-decisions:
  - "Worker code uses require() for runtime sherpa-onnx loading (Electron nodeIntegrationInWorker)"
  - "Mock OnlineRecognizer tracks decode state to prevent infinite isReady() loop in tests"
  - "debugLog calls guarded behind appRef check since SpeechRecorder may not have App reference"
  - "FileSystemAdapter instanceof check for getBasePath() — not available on DataAdapter"
  - "Worker terminated in destroy(), reused across toggles (stop only sends destroy message)"
  - "VAD sensitivity 0-3 maps to rule1MinTrailingSilence/rule2MinTrailingSilence per RESEARCH.md"

patterns-established:
  - "Web Worker entry pattern: standalone CJS, require(sherpa-onnx), self.onmessage handler"
  - "Multi-entry esbuild: named entryPoints object with outdir for multiple outputs"
  - "Contract testing pattern: inline Worker handler in test verifies protocol without browser APIs"
  - "Snapshot-based state: RecorderSnapshot extended with asrReady field for UI"

requirements-completed: [SPEECH-03, SPEECH-07]

# Metrics
duration: 25min
completed: 2026-05-13
---

# Phase 02 Plan 01: ASR Worker Engine with sherpa-onnx WASM Streaming Decode

**Web Worker entry with sherpa-onnx WASM, multi-entry esbuild build, and SpeechRecorder Worker lifecycle management**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3
- **Files created:** 4 (src/speech-worker.ts, tests/mocks/sherpa-onnx.ts, tests/speech-worker.test.ts, speech-worker.js)
- **Files modified:** 6 (src/speech-recorder.ts, src/main.ts, src/i18n.ts, esbuild.config.mjs, package.json, main.js)
- **Tests passing:** 41 (12 Worker protocol, 15 SpeechRecorder, 14 speech-capture)

## Accomplishments

- Created speech-worker.ts Web Worker entry with full sherpa-onnx WASM integration supporting init/audio/reset/destroy message protocol
- Configured esbuild multi-entry build producing both main.js and speech-worker.js with sherpa-onnx externalized
- Extended SpeechRecorder with lazy Worker creation, ArrayBuffer audio transfer, init timeout/error handling, language switch support
- Wired ASR integration into main.ts with app reference, onAsrResult callback, and settings sync
- Added speechAsrInitFailed i18n key in both English and Chinese
- Implemented path traversal protection for modelDir (T-02-01 threat mitigation)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install sherpa-onnx, configure esbuild, create speech-worker.ts (TDD)** - `d089fff` (test: RED phase mock + tests), `defcb6d` (feat: GREEN phase implementation + build config)
2. **Task 2: Extend SpeechRecorder with Worker lifecycle** - `5436a35` (feat: Worker lifecycle management)
3. **Task 3: Wire ASR integration into main.ts + i18n** - `b24ff11` (feat: integration wiring + translations)

## Files Created/Modified

- `src/speech-worker.ts` - Web Worker entry: self.onmessage handler, sherpa-onnx WASM init, streaming decode with endpoint detection, VAD sensitivity mapping
- `src/speech-recorder.ts` - Extended with Worker lifecycle: setApp, getModelDir, handleWorkerMessage, waitForWorkerReady, setLanguage, settings sync, error handling
- `src/main.ts` - SpeechRecorder.setApp() in onload, onAsrResult callback in toggleSpeechRecording, settings sync in saveSettings
- `src/i18n.ts` - Added speechAsrInitFailed key with en/zh translations
- `esbuild.config.mjs` - Multi-entry with named points (`main`, `speech-worker`), sherpa-onnx external, outdir instead of outfile
- `package.json` - Added sherpa-onnx@^1.13.1 dependency
- `tests/mocks/sherpa-onnx.ts` - Mock OnlineRecognizer, OnlineStream, createOnlineRecognizer with decode state tracking
- `tests/speech-worker.test.ts` - 12 tests covering mock API surface + 9 Worker protocol scenarios (init, audio, destroy, reset, path traversal, VAD mapping, language switch)
- `main.js` / `speech-worker.js` - Build outputs

## Decisions Made

- Worker code uses `require("sherpa-onnx")` for runtime loading in Electron's Worker context
- Mock OnlineRecognizer tracks `_readyCount` to prevent infinite decode loop (isReady returns true once per chunk)
- debugLog calls guarded behind `this.appRef` check since SpeechRecorder may not have App reference
- FileSystemAdapter instanceof check for getBasePath() since DataAdapter doesn't expose it
- Worker terminated in destroy(), but only sent destroy message (not terminated) in stop() to allow reuse

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Mock isReady() caused infinite decode loop**
- **Found during:** Task 1 (Running Worker protocol tests)
- **Issue:** Mock OnlineRecognizer.isReady() always returned true, causing infinite while loop in the audio decode handler
- **Fix:** Added `_readyCount` and `_maxReadyCalls` fields to mock; isReady returns true once then false until reset
- **Files modified:** tests/mocks/sherpa-onnx.ts
- **Committed in:** d089fff (RED phase commit)

**2. [Rule 3 - Blocking] debugLog required App parameter but plan specified null**
- **Found during:** Task 2 (TypeScript compilation of SpeechRecorder)
- **Issue:** debugLog function signature requires `App` as first parameter; plan specified `debugLog(null, ...)` which fails type checking
- **Fix:** Guarded all debugLog calls with `if (this.appRef)` conditional check
- **Files modified:** src/speech-recorder.ts
- **Committed in:** 5436a35 (Task 2 commit)

**3. [Rule 3 - Blocking] getBasePath() not available on DataAdapter type**
- **Found during:** Task 2 (TypeScript compilation of SpeechRecorder)
- **Issue:** getBasePath() is a method on FileSystemAdapter, not DataAdapter; direct call on adapter fails type check
- **Fix:** Added `instanceof FileSystemAdapter` check before calling getBasePath(), following the pattern from debug-log.ts
- **Files modified:** src/speech-recorder.ts
- **Committed in:** 5436a35 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All auto-fixes necessary for correctness and compilation. No scope creep.

## Issues Encountered

- Vitest hung on initial test run due to infinite decode loop in mock — resolved by tracking decode state in MockOnlineRecognizer
- The test file uses inline Worker handler for contract testing since actual Worker file uses require() which can't run in Vitest's ESM environment

## User Setup Required

- sherpa-onnx npm package installed as dependency (no manual action needed for development)
- Model files for actual ASR operation handled in Plan 03 (model download)
- No environment variables required at this stage

## Next Phase Readiness

- Worker protocol foundation complete — ready for Plan 02 transcription pipeline
- SpeechRecorder now manages Worker lifecycle — next plans can focus on text output handling
- All protocol tests pass — contract established for downstream consumers
- Model path resolution logic ready for Plan 03 model download integration

---
*Phase: 02-asr-model-transcription*
*Completed: 2026-05-13*
