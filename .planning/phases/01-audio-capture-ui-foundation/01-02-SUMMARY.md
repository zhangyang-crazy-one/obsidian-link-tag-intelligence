---
phase: 01-audio-capture-ui-foundation
plan: 02
subsystem: speech-recording
tags: [speech-recorder, state-machine, keyboard-shortcut, plugin-lifecycle]
requires: [01-01]
provides: [01-03, 01-04]
affects: [src/speech-recorder.ts, src/main.ts]
tech-stack:
  added: []
  patterns: [5-state-machine, discriminated-union, toggle-semantics, throttled-rms, device-monitoring, lazy-init, onunload-cleanup]
key-files:
  created:
    - src/speech-recorder.ts
  modified:
    - src/main.ts
decisions:
  - "D-01: 5-state model (idle/initializing/recording/processing/error) implemented as RecorderPhase discriminated union"
  - "D-02: Error UI feedback via i18n-keyed Notices; acknowledgeError() transitions error->idle"
  - "D-03: devicechange event listener for mic disconnect detection during recording"
  - "D-09: Single toggle command (Ctrl+Shift+V) starts and stops recording"
  - "D-10: Default shortcut Ctrl+Shift+V registered via addCommand hotkeys array"
  - "D-11: checkCallback returns false when !activeEditor?.editor (editor focus gating)"
  - "D-12: Obsidian hotkey system handles conflicts; no manual detection needed"
duration: 49s
completed_date: "2026-05-12"
---

# Phase 01 Plan 02: Speech Recorder State Machine and Plugin Integration

**One-liner:** 5-state recording machine (idle/initializing/recording/processing/error) with Ctrl+Shift+V keyboard toggle and full plugin lifecycle integration.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Create speech-recorder.ts -- 5-state recording machine | `20ade16` | `src/speech-recorder.ts` (created) |
| 2 | Wire speech toggle command and recorder lifecycle in main.ts | `1f7b166` | `src/main.ts` (modified) |

## Task Details

### Task 1: SpeechRecorder class (speech-recorder.ts)

Created `src/speech-recorder.ts` with:

- **`RecorderPhase`** type: `"idle" | "initializing" | "recording" | "processing" | "error"`
- **`RecorderSnapshot`** interface: `{ phase, audioLevel, dbValue, errorKey? }` for toolbar UI rendering
- **`SpeechRecorder`** class with:
  - `toggle()` — start/stop recording, gated only from idle and recording states
  - `getSnapshot()` — snapshot for VU meter and toolbar button state
  - `canToggle()` / `isActive` — state query helpers
  - `acknowledgeError()` — error->idle transition (D-02)
  - `forceStop()` — immediate stop for device disconnect and cleanup
  - `destroy()` — full cleanup for plugin onunload()
  - Throttled RMS audio level tracking (~60ms / 16fps)
  - `devicechange` event monitoring for mic disconnect (D-03)
  - DOMException name-based error mapping to i18n keys (D-02)

### Task 2: Plugin integration (main.ts)

Modified `src/main.ts`:

- **Import:** `SpeechRecorder` and `RecorderSnapshot` types
- **Property:** `speechRecorder = new SpeechRecorder()` — initialized as class field (not in onload)
- **Command:** `toggle-speech-recording` registered with `Ctrl+Shift+V` hotkey and `checkCallback` editor focus gating (returns `false` when no Markdown editor has focus)
- **Method:** `toggleSpeechRecording()` — handles toggle + error acknowledge + view refresh
- **Method:** `getSpeechRecorderSnapshot()` — accessor for view.ts toolbar rendering
- **Cleanup:** `this.speechRecorder.destroy()` in `onunload()` for hot-reload resource safety

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed type mismatch: `string` not assignable to `TranslationKey`**
- **Found during:** Task 2
- **Issue:** `SpeechRecorder.toggle()` returns `string | null`, but `this.t()` expects `Parameters<typeof tr>[1]` (TranslationKey union). The plan code didn't account for this TypeScript strictness.
- **Fix:** Cast `key` parameter in toggle callback and `errorKey` to `Parameters<typeof tr>[1]` when passing to `this.t()`.
- **Files modified:** `src/main.ts` (lines ~1069, ~1072)
- **Commit:** `1f7b166`

## Verification

### Compilation
- `npx tsc --noEmit`: All new speech code compiles cleanly
- Pre-existing errors in `src/view.ts(1040,3)` and `src/main.ts(77,17)` — unrelated to this plan

### Acceptance Criteria
- [x] `src/speech-recorder.ts` exists with all exports
- [x] `RecorderPhase` type exported
- [x] `RecorderSnapshot` interface exported
- [x] `SpeechRecorder` class exported
- [x] `toggle()` method with start/stop semantics
- [x] `acknowledgeError()`, `forceStop()`, `destroy()` methods
- [x] `devicechange` event monitoring (D-03)
- [x] Error-to-i18n key mapping (D-02)
- [x] RMS calculation imports from speech-capture
- [x] Throttle interval (60ms) present
- [x] No default export
- [x] `toggle-speech-recording` command registered with `Ctrl+Shift+V`
- [x] `checkCallback` returns `false` when no Markdown editor has focus
- [x] `speechRecorder.destroy()` in `onunload()`
- [x] `getSpeechRecorderSnapshot()` accessor for view.ts

## Known Stubs

None. All interfaces are wired end-to-end. The SpeechRecorder initializes in idle state with `audioLevel: 0`, which is correct default behavior.

## Threat Flags

None. The threat model items (T-02-01 through T-02-06) are all mitigated in the implementation:
- T-02-01 (DoS toggle): `canToggle()` gates only idle/recording
- T-02-02 (Info disclosure): device enumeration checks `audioinput` kind only
- T-02-03 (Tampering): `checkCallback` verifies `activeEditor?.editor`
- T-02-04 (EoP): Permission is OS/browser-gated via `getUserMedia`
- T-02-05 (Info disclosure): Error messages use i18n keys; no raw errors exposed
- T-02-06 (DoS hot reload): `destroy()` in `onunload()` cleans all resources

## Self-Check: PASSED

- [x] `src/speech-recorder.ts` exists at expected path
- [x] Commit `20ade16` exists: `git log --oneline | grep 20ade16`
- [x] Commit `1f7b166` exists: `git log --oneline | grep 1f7b166`
- [x] All modifications to `src/main.ts` are committed
