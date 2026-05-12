---
phase: 01-audio-capture-ui-foundation
plan: 03
subsystem: speech-ui
type: feature
requires: ["01-02"]
provides:
  - speech-record-toolbar-button
  - vu-meter-component
  - speech-css-animations
affects:
  - src/view.ts
  - styles.css
tags:
  - speech
  - ui
  - toolbar
  - css-animation
duration: 8m
files_count: 2
completed: 2026-05-12T14:38:17Z
tech-stack:
  added: []
  patterns:
    - "Snapshot-based toolbar rendering with signature diffing"
    - "CSS lti- prefix + is- state modifier convention (D-08)"
    - "CSS keyframe animations on compositor thread (box-shadow pulsing)"
key-files:
  created: []
  modified:
    - "src/view.ts — +110 lines: speechRecord ToolbarActionId, buildSpeechButtonSnapshot, updateVuMeter, VU meter DOM creation"
    - "styles.css — +157 lines: speech button 5-state CSS, pulsing/spin/fade keyframes, VU meter bar styles, voice settings layout"
decisions:
  - "Speech button positioned rightmost in toolbar (D-04)"
  - "Button uses data-action=\"speechRecord\" selector for CSS targeting"
  - "VU meter hidden when not recording; shows 5 color-coded bars with dB readout"
  - "CSS animations use box-shadow (not border/outline) to avoid layout shift"
---

# Phase 01 Plan 03: Speech Button & VU Meter UI Integration

**One-liner:** Integrated speech recording button with 5-state visual feedback and real-time VU meter (5 color-coded bars + dB readout) into the sidebar toolbar, with CSS animations matching UI-SPEC.

---

## Execution Summary

| Task | Name | Type | Status | Commit |
|------|------|------|--------|--------|
| 1 | Add speech button and VU meter to toolbar in view.ts | auto | complete | 56ed53d |
| 2 | Add speech CSS classes and animations to styles.css | auto | complete | d473356 |

---

## Changes Overview

### Task 1: src/view.ts

Extended the sidebar view toolbar with a speech recording button and VU meter:

- Added `"speechRecord"` to `ToolbarActionId` union type (rightmost position)
- Extended `ToolbarButtonSnapshot` with `state` (RecorderPhase), `audioLevel`, and `dbValue` fields
- Added speech recording action to `getToolbarActions()` calling `this.plugin.toggleSpeechRecording()`
- Implemented `buildSpeechButtonSnapshot()` with per-phase tooltip switching (idle/initializing/recording/processing/error)
- Modified `buildToolbarSnapshot()` to enrich speech button with `getSpeechRecorderSnapshot()` state
- Added speech button CSS state class cycling in `applyToolbarSnapshot()` (is-idle/is-recording/etc.)
- Implemented `updateVuMeter()` with 5-bar thresholds at -50/-36/-24/-18/-6 dBFS
- Created VU meter DOM (5 bars + dB label) in `buildShell()`
- Added VU meter cleanup in `onClose()`

### Task 2: styles.css

Added speech module CSS (157 lines at end of file):

- **Speech button states**: idle/initializing/recording/processing/error with CSS classes
- **Animation keyframes**: `lti-speech-pulse` (1.5s box-shadow breathing), `lti-speech-spin` (1s rotation), `lti-speech-fade-pulse` (1s opacity)
- **VU meter**: 5-bar flex layout (4px bars, 2px gap), per-bar color thresholds (green `#4caf50`, yellow `#ff9800`, red `#f44336`)
- **dB label**: 12px font, `text-muted` color, 42px min-width
- **Voice settings layout**: path input row, browse button, VAD slider row

---

## Verification Results

### Task 1 Acceptance Criteria

| Criterion | Expected | Actual | Status |
|-----------|----------|--------|--------|
| `grep "speechRecord" src/view.ts` | >= 6 | 12 | PASS |
| `grep "buildSpeechButtonSnapshot"` | exits 0 | 2 hits | PASS |
| `grep "updateVuMeter"` | exits 0 | 2 hits | PASS |
| `grep "getSpeechRecorderSnapshot"` | exits 0 | 1 hit | PASS |
| `grep "toggleSpeechRecording"` | exits 0 | 1 hit | PASS |
| `grep "lti-vu-meter"` | exits 0 | 1 hit | PASS |
| `grep "lti-vu-bar"` | exits 0 | 1 hit | PASS |
| `grep "lti-vu-db-label"` | exits 0 | 1 hit | PASS |
| `grep "-50"` | exits 0 | 2 hits | PASS |
| `grep "is-active-green"` | exits 0 | 2 hits | PASS |
| `grep "is-active-yellow"` | exits 0 | 2 hits | PASS |
| `grep "is-active-red"` | exits 0 | 2 hits | PASS |
| Speech button last in getToolbarActions | `];` after entry | confirmed | PASS |

### Task 2 Acceptance Criteria

| Criterion | Expected | Actual | Status |
|-----------|----------|--------|--------|
| `grep "lti-speech-pulse"` | exits 0 | 2 hits | PASS |
| `grep "lti-speech-spin"` | exits 0 | 2 hits | PASS |
| `grep "lti-speech-fade-pulse"` | exits 0 | 2 hits | PASS |
| `grep 'button[data-action="speechRecord"]'` | exits 0 | 7 hits | PASS |
| `grep ".is-recording"` | exits 0 | 1 hit | PASS |
| `grep ".is-error"` | exits 0 | 3 hits | PASS |
| `grep ".is-initializing"` | exits 0 | 1 hit | PASS |
| `grep ".lti-vu-meter"` | exits 0 | 1 hit | PASS |
| `grep "lti-vu-bar"` | exits 0 | 4 hits | PASS |
| `grep "is-active-green"` | exits 0 | 1 hit | PASS |
| `grep "#4caf50"` | exits 0 | 1 hit | PASS |
| `grep "#ff9800"` | exits 0 | 1 hit | PASS |
| `grep "#f44336"` | exits 0 | 1 hit | PASS |
| `grep "lti-voice-path-input"` | exits 0 | 1 hit | PASS |
| `grep "lti-voice-slider"` | exits 0 | 3 hits | PASS |

### TypeScript Compilation

- `npx tsc --noEmit` shows pre-existing errors only (onClose return type, test CLI imports)
- No new TypeScript errors introduced by plan changes

---

## Deviations from Plan

None. Plan executed exactly as written.

---

## Threat Surface Scan

The plan's threat model (T-03-01 through T-03-04) covers all threat surfaces introduced. No new surfaces beyond those already modeled:
- T-03-01 (dB readout info disclosure): dB values are amplitude-only, no speech content
- T-03-02 (DOM update DoS): VU meter updates throttled by SpeechRecorder at 60ms
- T-03-03 (CSS class injection): Class names derived from typed RecorderPhase, no user input
- T-03-04 (CSS animation resource): Animations on compositor thread, bounded by recording duration

---

## Known Stubs

None. All UI elements are wired to live data from `getSpeechRecorderSnapshot()`. The speech button has `disabled: false` in all states (error button remains clickable for acknowledgment, as designed). VU meter data comes from real audio level measurements.

---

## Self-Check

### Created files exist
```
MISSING: No new files created (modifications only to existing files)
```

### Commits exist
```
git log --oneline | head -2:
d473356 feat(01-audio-capture-ui-foundation): add speech CSS states, animations, VU meter and voice settings styles
56ed53d feat(01-audio-capture-ui-foundation): add speech record button and VU meter to sidebar toolbar
```

All commits verified present.

## Self-Check: PASSED
