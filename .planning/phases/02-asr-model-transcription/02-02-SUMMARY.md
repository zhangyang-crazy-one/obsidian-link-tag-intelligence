---
phase: 02-asr-model-transcription
plan: 02
subsystem: speech
tags: [sentence-manager, auto-stop, i18n, countdown, toolbar]

# Dependency graph
requires:
  - phase: 02-01
    provides: SpeechRecorder with Web Worker ASR pipeline, RecorderSnapshot interface
provides:
  - SentenceManager: partial text accumulation, sentence boundary detection, punctuation post-processing
  - insertSpeechText: cursor-safe text insertion at editor cursor
  - Auto-stop timer: countdown from configured seconds, forceStop on expiry
  - Toolbar speech button: ASR status display (loading/ready/error), auto-stop countdown overlay
  - Speech i18n: 15 keys in en + zh covering ASR status, recording phases, auto-stop
  - Speech settings: speechLanguage, speechVadSensitivity, speechAutoStopSec with normalization
affects: 
  - 02-03 (sherpa-onnx model file management)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - SentenceManager uses simple regex SENTENCE_END_PUNCTUATION for CJK+Latin boundaries
    - Cursor save/restore pattern in insertSpeechText for concurrent typing safety
    - Auto-stop timer uses setInterval with cleanup in cancelAutoStopTimer + onunload

key-files:
  created:
    - src/speech-recorder.ts - Minimal SpeechRecorder stub (Plan 01 fills real impl)
    - tests/speech-asr.test.ts - 13 vitest tests for SentenceManager
  modified:
    - src/main.ts - SentenceManager class, insertSpeechText, toggleSpeechRecording, auto-stop timer
    - src/settings.ts - speechLanguage, speechVadSensitivity, speechAutoStopSec fields + normalization
    - src/i18n.ts - 15 speech-related translation keys (en + zh)
    - src/view.ts - speechRecord toolbar button, buildSpeechButtonSnapshot, countdown flash
    - styles.css - lti-countdown-flash keyframe animation

key-decisions:
  - "SentenceManager.finalizeSentence accepts optional explicit text parameter to override buffer"
  - "Partial ASR results (isEndpoint=false) accumulated but NOT inserted into editor"
  - "Language change only propagated to SpeechRecorder when NOT recording (mid-recording guard)"
  - "Auto-stop countdown shows seconds on button text when <=10s, CSS flash on last second"

patterns-established:
  - "Cursor save/restore: editor.getCursor() saved before editor.replaceSelection() for concurrent typing safety"
  - "Speech i18n: tooltip key derived from RecorderSnapshot phase + asrReady flag"
  - "Timer cleanup: cancelAutoStopTimer called in onunload, manual stop, error path, and forceStop"

requirements-completed:
  - SPEECH-03
  - SPEECH-06
  - SPEECH-08

# Metrics
duration: 8h 58m
completed: 2026-05-13
---

# Phase 02 Plan 02: ASR Result Processing Summary

**SentenceManager with CJK+Latin punctuation post-processing, cursor-safe text insertion, auto-stop countdown timer, and speech toolbar button with ASR status overlay**

## Performance

- **Duration:** 8h 58m
- **Started:** 2026-05-13T05:31:56Z
- **Completed:** 2026-05-13T14:29:48Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- SentenceManager class with partial text accumulation, sentence boundary detection, and CJK+Latin trailing punctuation (。！？.!?)
- Cursor-safe text insertion at editor cursor via getCursor()/replaceSelection() with concurrent typing protection
- Auto-stop countdown timer: setInterval-driven, visible on toolbar button when <=10s, CSS flash on last second
- Toolbar speech button: phase-aware ASR status display (loading/ready/recording/error) with countdown overlay
- Speech settings: speechLanguage ("zh"|"en"), speechVadSensitivity (0-3), speechAutoStopSec (0 or 10-300) with normalization
- 15 speech i18n keys in both English and Chinese

## Task Commits

Each task was committed atomically:

1. **Task 1: SentenceManager TDD** - `e7f974a` (feat)
2. **Task 2: i18n + language switching** - `92cfd4c` (feat)
3. **Task 3: Auto-stop countdown UI** - `59636d1` (feat)

TDD flow for Task 1: 13 tests written first (all failing RED), then SentenceManager implemented (all passing GREEN).

## Files Created/Modified
- `src/main.ts` - SentenceManager class (exported), insertSpeechText, toggleSpeechRecording, auto-stop timer methods, speechRecorder field
- `src/speech-recorder.ts` - Minimal RecorderSnapshot interface + SpeechRecorder stub class (full impl in Plan 01)
- `src/settings.ts` - speechLanguage, speechVadSensitivity, speechAutoStopSec fields, defaults, normalization
- `src/i18n.ts` - 15 speech translation keys (speechRecord, speechAsrLoading, speechAsrReady, speechAsrError, speechAsrAutoStopCountdown, speechAutoStopTimeout*, speechRecordTooltip*)
- `src/view.ts` - speechRecord in ToolbarActionId, buildSpeechButtonSnapshot method, countdown flash in applyToolbarSnapshot
- `styles.css` - lti-countdown-flash @keyframes animation, .is-countdown-flash class
- `tests/speech-asr.test.ts` - 13 vitest tests covering partial accumulation, punctuation, reset, empty edge cases

## Decisions Made
- SentenceManager.finalizeSentence accepts optional explicit text parameter to override accumulated buffer
- Partial ASR results (isEndpoint=false) accumulated but NOT inserted per deferred design decision
- Language change propagated to SpeechRecorder via setSettingsLanguage only when NOT recording
- Auto-stop countdown shows seconds on button text when <=10s, CSS flash when 1s remaining
- SpeechRecorder stub created as minimal compilation target — real Web Worker + AudioWorkletNode impl in Plan 01

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created minimal speech-recorder.ts stub**
- **Found during:** Task 1 (SentenceManager implementation)
- **Issue:** Plan references SpeechRecorder class and RecorderSnapshot interface, but `src/speech-recorder.ts` did not exist (Plan 01 output missing)
- **Fix:** Created minimal stub with RecorderSnapshot interface and SpeechRecorder class with no-op methods. Real Web Worker + AudioWorkletNode implementation deferred to Plan 01.
- **Files modified:** src/speech-recorder.ts (created)
- **Verification:** TypeScript compilation succeeds; SpeechRecorder type satisfies all references in main.ts and view.ts
- **Committed in:** e7f974a (Task 1 commit)

**2. [Rule 3 - Blocking] Added speech settings fields to LinkTagIntelligenceSettings**
- **Found during:** Task 1 (SentenceManager constructor)
- **Issue:** SentenceManager references `plugin.settings.speechLanguage` but settings interface had no speech fields
- **Fix:** Added speechLanguage, speechVadSensitivity, speechAutoStopSec to interface, defaults in buildDefaultSettings, and normalization in normalizeLoadedSettings
- **Files modified:** src/settings.ts
- **Verification:** TypeScript compilation succeeds; defaults normalize correctly
- **Committed in:** e7f974a (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both auto-fixes were necessary for compilation and runtime correctness. No scope creep — both are prerequisite infrastructure the plan assumed would exist.

## Known Stubs

| File | Line(s) | Stub | Reason |
|------|---------|------|--------|
| src/speech-recorder.ts | Entire file | SpeechRecorder class with no-op methods, dummy RecorderSnapshot | Real implementation (Web Worker, AudioWorkletNode, sherpa-onnx WASM) belongs to Plan 01 |

## Threat Flags

None — all security-relevant surface (insertSpeechText text validation, auto-stop timer lifecycle) covered by plan's existing threat model (T-02-07, T-02-08).

## Issues Encountered
- Plan 01 artifacts (SpeechRecorder, speech-recorder.ts) not present at execution time — resolved with minimal stubs that satisfy type contracts
- Pre-existing TypeScript errors (onClose return type in view.ts, CLI mjs imports in tests) confirmed not caused by this plan's changes

## Next Phase Readiness
- SentenceManager and insertSpeechText ready for end-to-end integration when Plan 01 provides real SpeechRecorder
- Auto-stop timer infrastructure ready — timer starts/stops correctly, countdown renders on toolbar button
- Speech i18n keys available for all UI components (Plan 02-03 can reference them)
- Settings panel speech configuration fields ready for settings UI extension

---
*Phase: 02-asr-model-transcription*
*Completed: 2026-05-13*
