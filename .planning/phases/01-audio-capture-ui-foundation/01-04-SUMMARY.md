---
phase: 01-audio-capture-ui-foundation
plan: 04
subsystem: speech-testing
tags: [unit-tests, RMS, decibels, state-machine, mocks, vitest, tdd]
requires: [01-02]
provides: [02-ASR-integration]
affects: [tests/mocks/obsidian.ts, src/speech-capture.ts, tests/speech-capture.test.ts, tests/speech-recorder.test.ts]
tech-stack:
  added: []
  patterns: [tdd-red-green, vi-mock, mockRejectedValue, edge-case-guarding]
key-files:
  created:
    - tests/speech-capture.test.ts
    - tests/speech-recorder.test.ts
  modified:
    - tests/mocks/obsidian.ts
    - src/speech-capture.ts
decisions:
  - "TDD cycle revealed 2 implementation bugs (empty array NaN, NaN rmsToDecibels) — fixed in GREEN phase"
  - "Audio API mocks added to tests/mocks/obsidian.ts rather than separate file to leverage existing vi.mock infrastructure via vitest.config.ts alias"
  - "vi.mock mockRejectedValue chosen over mockReturnValue to exercise SpeechRecorder error path without browser APIs"
duration: 10m12s
completed_date: "2026-05-12"
---

# Phase 01 Plan 04: Unit Tests — Audio Math and State Machine

**One-liner:** 29 Vitest unit tests covering audio level calculations (RMS/dB with NaN/empty/negative edge cases) and 5-state recording machine (transitions, toggle semantics, error mapping, cleanup safety), plus AudioContext/MediaStream/AudioWorkletNode mocks.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Extend test mocks with Audio API classes | `2853763` | `tests/mocks/obsidian.ts` (modified) |
| 2 | Create speech-capture.test.ts — RMS/dB tests (TDD) | `740b549`, `1c7c584` | `tests/speech-capture.test.ts` (created), `src/speech-capture.ts` (modified) |
| 3 | Create speech-recorder.test.ts — state machine tests | `b2c8170` | `tests/speech-recorder.test.ts` (created) |

## Task Details

### Task 1: Audio API mocks (tests/mocks/obsidian.ts)

Appended 90 lines of Web Audio API mock classes to the existing Obsidian mock file:

- **AudioContext**: sampleRate, resume/close state transitions, createMediaStreamSource, audioWorklet.addModule no-op
- **MediaStream**: track storage via `getTracks()` and `addTrack()`
- **MediaStreamTrack**: kind="audio", stop()
- **AudioWorkletNode**: `port.onmessage` hook, connect/disconnect no-ops
- **MediaStreamAudioSourceNode**: connect/disconnect no-ops
- **Blob**: size/type from constructor parts
- **URL**: `createObjectURL`/`revokeObjectURL` with internal Map tracking
- **mockGetUserMedia/clearMockGetUserMedia**: global state helpers for getUserMedia simulation

These mocks are intentionally minimal — enough API surface for TypeScript compilation and state machine unit tests. They do not simulate actual audio processing.

### Task 2: RMS and dB calculation tests (TDD cycle)

**RED phase (740b549):** Created `tests/speech-capture.test.ts` with 14 test cases. Three tests failed due to edge-case bugs in `src/speech-capture.ts`:
- `calculateRMS` on empty Float32Array produced `NaN` (0/0 division)
- `calculateRMS` on `[0, 0.5, 0, -0.5]` expected `sqrt(0.125) ≈ 0.3535`, not `0.5` (test specification corrected)
- `rmsToDecibels(NaN)` produced `NaN` (JavaScript: `NaN <= 0` is `false`)

**GREEN phase (1c7c584):** Fixed both functions in `src/speech-capture.ts`:
- `calculateRMS`: added `if (samples.length === 0) return 0;` guard
- `rmsToDecibels`: added `Number.isNaN(rms)` check before `<= 0` gate
- Corrected negative-samples test expected value to `Math.sqrt(0.125)`

All 14 tests pass after fixes:
- 7 RMS tests: zero samples, all-one, all-0.5, negative samples, empty array, single sample, large array (1000 samples)
- 7 dB tests: RMS=1.0 (~0dB), 0.5 (~-6.02dB), 0.1 (~-20dB), 0.01 (~-40dB), 0 (-Infinity), negative (-Infinity), NaN (-Infinity)

### Task 3: State machine and toggle tests

Created `tests/speech-recorder.test.ts` with 15 test cases covering:

- **Initial state:** starts idle, audioLevel=0, isActive=false (3 tests)
- **canToggle():** returns true for idle (1 test, error-state test via contract validation)
- **acknowledgeError():** idempotent, no-throw in idle and not-yet-error states (2 tests)
- **getSnapshot():** shape validation, -Infinity dbValue when not recording, no errorKey in non-error (3 tests)
- **toggle() error path:** error string returned when startCapture rejects, error state blocks second toggle (2 tests)
- **forceStop()/destroy():** no-throw on idle recorder (2 tests)
- **Type validation:** valid RecorderPhase enum membership (1 test)
- **Mock strangulation:** 1 additional canToggle test verifying contract semantics

Key design choice: `startCapture` is mocked with `mockRejectedValue(new DOMException(...))` to exercise the `SpeechRecorder` error-handling path — mapping DOMException `NotAllowedError` to `speechMicPermissionDenied` error key, and transitioning to the error state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed mathematically incorrect test expected value**
- **Found during:** Task 2 (TDD RED phase)
- **Issue:** Test for `calculateRMS(Float32Array([0, 0.5, 0, -0.5]))` expected `0.5`, but correct RMS is `sqrt(0.125) ≈ 0.35355`. Sum of squares = 0.5, divided by 4 samples = 0.125, sqrt = 0.3535533905932738.
- **Fix:** Changed `toBeCloseTo(0.5, 5)` to `toBeCloseTo(Math.sqrt(0.125), 5)` in `tests/speech-capture.test.ts`.
- **Files modified:** `tests/speech-capture.test.ts`
- **Commit:** `740b549`

**2. [Rule 1 - Bug] Mock startCapture needed reject to test error path**
- **Found during:** Task 3 (TDD RED phase)
- **Issue:** The plan's mock used `vi.fn()` (returns undefined), but SpeechRecorder needs `startCapture` to either resolve with CaptureState or reject. Returning undefined silently caused `toggle()` to succeed instead of failing into error state, making error-path tests fail.
- **Fix:** Changed `startCapture: vi.fn()` to `startCapture: vi.fn().mockRejectedValue(new DOMException("Permission denied", "NotAllowedError"))` in `tests/speech-recorder.test.ts`.
- **Files modified:** `tests/speech-recorder.test.ts`
- **Commit:** `b2c8170`

## Plan-Identified Bugs Fixed

The plan correctly predicted two implementation bugs in `src/speech-capture.ts`, both fixed during the TDD GREEN phase:

1. **Empty array NaN:** `calculateRMS(Float32Array(0))` returned `NaN` because `Math.sqrt(0/0) = NaN`. Fixed with `if (samples.length === 0) return 0;` guard.
2. **NaN rmsToDecibels:** `rmsToDecibels(NaN)` returned `NaN` because `NaN <= 0` evaluates to `false` in JavaScript. Fixed with `Number.isNaN(rms)` check.

## Verification

### Compilation
- `npx tsc --noEmit`: No errors from new/modified mock or test files

### Test Results
- `tests/speech-capture.test.ts`: 14/14 pass
- `tests/speech-recorder.test.ts`: 15/15 pass
- Full test suite: 103/103 pass (9 test files), no regressions

### Acceptance Criteria
- [x] `tests/mocks/obsidian.ts` extended with AudioContext, MediaStream, AudioWorkletNode, Blob, URL mocks
- [x] `tests/speech-capture.test.ts` has 14 passing tests (7 RMS + 7 dB)
- [x] `tests/speech-recorder.test.ts` has 15 passing tests
- [x] `npx vitest run` exits 0 for all speech-related tests
- [x] Bugs discovered in calculateRMS/rmsToDecibels during TDD cycle fixed

## Known Stubs

None. All test expectations are validated against actual production code. The Audio API mocks are intentionally minimal (no-op methods) but are clearly documented as mock implementations for unit testing, not stubs.

## Threat Flags

None. The threat model items (T-04-01 through T-04-03) are all accepted at the plan level:
- T-04-01 (Tampering): Float32Array test inputs are deterministic, no user-controlled values
- T-04-02 (Information Disclosure): Test files contain only test data, no secrets
- T-04-03 (Denial of Service): 1000-element array test is O(n) and completes in microseconds

## Self-Check: PASSED

- [x] `tests/speech-capture.test.ts` exists and passes
- [x] `tests/speech-recorder.test.ts` exists and passes
- [x] `tests/mocks/obsidian.ts` modified with Audio API mocks
- [x] Commit `2853763` exists: `git log --oneline | grep 2853763`
- [x] Commit `740b549` exists: `git log --oneline | grep 740b549`
- [x] Commit `1c7c584` exists: `git log --oneline | grep 1c7c584`
- [x] Commit `b2c8170` exists: `git log --oneline | grep b2c8170`
- [x] All 29 new tests pass alongside existing 74 tests (103 total)
