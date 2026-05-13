---
phase: 01-audio-capture-ui-foundation
verified: 2026-05-12T16:00:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
overrides: []
human_verification:
  - test: "Click the speech record button in the sidebar toolbar and observe visual state transitions"
    expected: "Button cycles through idle (muted mic icon) → initializing (spinning loader) → recording (pulsing border + accent icon) → processing (faded pulse) → idle. Error state shows red tint + red border."
    why_human: "CSS animations (1.5s pulse, 1s spin, fade pulse) and color transitions can only be verified visually in Obsidian's rendered DOM."
  - test: "Start recording and speak into a microphone; observe the VU meter bars and dB readout"
    expected: "During recording, 5 VU meter bars appear adjacent to the speech button. Green bars (1-3) light up at > -50, > -36, > -24 dBFS; yellow bar (4) at > -18 dBFS; red bar (5) at > -6 dBFS. dB numeric readout updates in real-time alongside bars."
    why_human: "Real-time audio level display requires actual microphone input and browser AudioContext rendering — not testable without a running Obsidian instance with microphone hardware."
  - test: "Hover over the speech button in each state (idle, recording, processing, error) with plugin language set to Chinese (zh)"
    expected: "Tooltip text displays in Chinese: '开始语音输入 (Ctrl+Shift+V)' for idle, '正在录音... 点击停止' for recording, '正在处理...' for processing, '录音出错，点击查看详情' for error."
    why_human: "Browser tooltip rendering and i18n key resolution in the live Obsidian environment cannot be verified from source code — tooltip display depends on Obsidian's i18n subsystem and CSS tooltip rendering."
  - test: "Trigger microphone permission denial (deny in browser/system dialog) and observe the Obsidian Notice"
    expected: "A Notice appears with the Chinese text '麦克风权限未授予，请在系统偏好设置 > 安全性与隐私 > 麦克风 中允许 Obsidian。' when language is zh, or the English equivalent when language is en. The speech button transitions to the error state (red tint)."
    why_human: "System-level microphone permission dialog and DOMException error handling require a real browser/Electron environment — cannot be simulated in vitest unit tests."
  - test: "During active recording, physically unplug the microphone and observe behavior"
    expected: "A Notice appears with '麦克风已断开，录音已停止。' (or English equivalent). The speech button transitions to the error state. Recording resources are cleaned up."
    why_human: "Hardware device disconnect event (devicechange) requires physical hardware change — the event listener code is present but actual triggering cannot be simulated programmatically in tests."
  - test: "Open Obsidian Settings → Link Tag Intelligence → scroll to Voice section"
    expected: "Voice section shows: model file path input with Browse button, language selector (Chinese zh / English en dropdown), VAD sensitivity slider (0-3), and auto-stop timeout number input (0-300). Browse button focuses the path input field. All labels and descriptions match the bilingual copywriting contract in UI-SPEC.md."
    why_human: "Settings panel layout, CSS styling (lti-voice-input-row, lti-voice-slider-row), and Browse button click behavior must be verified in Obsidian's settings UI rendering — layout depends on Obsidian's PluginSettingTab DOM structure."
  - test: "Open the command palette (Ctrl+P) with no Markdown editor open and search for 'Toggle voice input'"
    expected: "The command appears greyed out (disabled) when no Markdown editor has focus. Opening any Markdown note and re-opening the palette shows the command enabled."
    why_human: "Obsidian's checkCallback command availability system requires the live Obsidian workspace to verify — the gating logic exists in code but the visual greyed-out state depends on Obsidian's command palette rendering."
---

# Phase 01: Audio Capture & UI Foundation — Verification Report

**Phase Goal:** Users can start/stop voice recording with visual feedback and configure speech settings through a bilingual interface
**Verified:** 2026-05-12T16:00:00Z
**Status:** human_needed (all 5 roadmap success criteria verified from code; 7 items need visual/hardware testing in Obsidian)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can toggle voice recording on/off via keyboard shortcut from any active Markdown editor | VERIFIED | `main.ts:197-210` — `toggle-speech-recording` command registered with `Ctrl+Shift+V` hotkey; `checkCallback` at line 202 returns `false` when `!editorView?.editor`. `toggleSpeechRecording()` method at line 1059 handles toggle + error acknowledge. |
| 2 | User can toggle voice recording via sidebar toolbar button, which visually cycles through idle, initializing, recording, and processing states | VERIFIED | `view.ts:38` — `speechRecord` added to `ToolbarActionId`; `view.ts:381` — action bound to `this.plugin.toggleSpeechRecording()`; `view.ts:536-555` — `buildSpeechButtonSnapshot()` returns per-phase state, tooltip, and audio level; `view.ts:802` — CSS state classes applied: `is-idle`, `is-initializing`, `is-recording`, `is-processing`, `is-error`. `styles.css` contains all 5 state selectors with animations. |
| 3 | Audio level VU meter (3-5 bars, green/yellow/red) updates in real-time during recording, confirming microphone input is being captured | VERIFIED | `view.ts:835` — 5-bar VU meter with thresholds at `[-50, -36, -24, -18, -6]` dBFS; bars 1-3 green (`#4caf50`), bar 4 yellow (`#ff9800`), bar 5 red (`#f44336`). Visible only during recording (`view.ts:311` — `hidden = !show`). dB readout at `view.ts:332`. Data flows: AudioWorklet → `calculateRMS` → throttled (60ms) → `RecorderSnapshot.audioLevel` → `rmsToDecibels` → `dbValue` → VU meter DOM. |
| 4 | All voice-related UI text displays in Chinese when plugin language is zh and English when en | VERIFIED | `src/i18n.ts` — 26 speech TranslationKey members verified in type union. Both `en` (lines 619-649) and `zh` (lines 966-999) TRANSLATIONS entries present. Key text verified: `speechRecord` ("Voice"/"语音"), `speechRecordTooltipIdle` ("Start voice input"/"开始语音输入"), `speechMicPermissionDenied` (full bilingual error message). All UI code uses `this.plugin.t(key)` pattern — settings.ts uses 8 `this.plugin.t()` calls for speech, view.ts uses 7 `this.plugin.t()` calls, main.ts uses `this.t("speechToggleCommand")` and error `this.t(errorKey)`. |
| 5 | Settings panel shows speech configuration fields: model file path with browse button, language selector (zh/en), VAD sensitivity slider, and auto-stop timeout input | VERIFIED | `settings.ts:1587-1665` — `renderVoiceSection()` method creates: model path text input with Browse button (line 1599-1610), language selector dropdown zh/en (line 1617-1628), VAD sensitivity slider 0-3 (line 1631-1645), auto-stop timeout number input 0-300 (line 1649-1663). Settings interface at line 129-132 has typed fields. `buildDefaultSettings()` at lines 170-171 with defaults. `normalizeLoadedSettings()` at lines 339-348 with range clamping (VAD 0-3, autoStop 0-300). |

**Score:** 5/5 truths verified

### Deferred Items

None. All Phase 1 requirements are addressed in this phase. Phase 2 (ASR Model & Transcription) covers remaining v1 requirements (SPEECH-03, SPEECH-06, SPEECH-07, SPEECH-08, SPEECH-11).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| SPEECH-01 | 01-02, 01-04 | Keyboard shortcut toggle voice recording | SATISFIED | `main.ts:197-210` — `toggle-speech-recording` with `Ctrl+Shift+V`; `checkCallback` editor focus gating |
| SPEECH-02 | 01-03 | Sidebar toolbar button for start/stop | SATISFIED | `view.ts:38,381` — `speechRecord` ToolbarActionId + toggle binding |
| SPEECH-04 | 01-02, 01-03, 01-04 | Toolbar button shows recording state (idle/initializing/recording/processing) | SATISFIED | `view.ts:802` CSS class cycling; `styles.css` 5-state selectors; `speech-recorder.ts` RecorderPhase type |
| SPEECH-05 | 01-01, 01-03, 01-04 | VU meter during recording | SATISFIED | `view.ts:835` 5-bar VU meter; `styles.css` bar color styles; `speech-capture.ts` calculateRMS/rmsToDecibels |
| SPEECH-09 | 01-01 | Bilingual UI for all voice text | SATISFIED | `src/i18n.ts` — 26 bilingual speech keys (zh + en TRANSLATIONS entries) |
| SPEECH-10 | 01-01 | Settings panel: model path, language, VAD, auto-stop | SATISFIED | `settings.ts` — 4 fields in interface, defaults, normalization, renderVoiceSection() |

All 6 requirement IDs mapped to Phase 1 are SATISFIED. No orphaned requirements.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/i18n.ts` | 26 new TranslationKey members + bilingual entries | VERIFIED | 1132 lines, 26 speech keys in type union, all 26 have both en and zh entries |
| `src/settings.ts` | 4 speech fields + normalization + voice section | VERIFIED | 4 fields in LinkTagIntelligenceSettings (lines 129-132), defaults (170-171), normalization with clamping 0-3/0-300 (339-348), renderVoiceSection (1587-1665) |
| `src/speech-capture.ts` | AudioWorklet capture + RMS/dB | VERIFIED | 124 lines, 5 exports (startCapture, stopCapture, calculateRMS, rmsToDecibels, CaptureState), Blob URL CSP workaround (line 80), audio-only getUserMedia (line 68), edge case guards (lines 108, 120) |
| `src/speech-recorder.ts` | 5-state recording machine | VERIFIED | 188 lines, 3 exports (RecorderPhase, RecorderSnapshot, SpeechRecorder), devicechange monitoring (line 136), error-to-i18n mapping (lines 100-109), throttle timer (60ms, line 84) |
| `src/main.ts` | SpeechRecorder integration | VERIFIED | Import (line 54), property (line 60), command (lines 197-210), toggleSpeechRecording (1059-1078), getSpeechRecorderSnapshot (1080-1082), onunload cleanup (line 406) |
| `src/view.ts` | Speech button + VU meter in toolbar | VERIFIED | ToolbarActionId extension (line 38), action binding (381), buildSpeechButtonSnapshot (536-555), updateVuMeter (808-844), buildToolbarSnapshot enrichment (519-533) |
| `styles.css` | Speech button CSS states + VU meter + animations | VERIFIED | 5 button state selectors, 3 @keyframes (pulse/spin/fade-pulse), VU meter bar styles (4px bars, green/yellow/red), voice settings layout classes |
| `tests/mocks/obsidian.ts` | Audio API mocks | VERIFIED | AudioContext, MediaStream, AudioWorkletNode, MediaStreamAudioSourceNode, Blob, URL mocks all present |
| `tests/speech-capture.test.ts` | RMS/dB unit tests | VERIFIED | 70 lines, 14 tests (7 RMS + 7 dB), all pass |
| `tests/speech-recorder.test.ts` | State machine unit tests | VERIFIED | 166 lines, 15 tests, all pass |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `src/speech-capture.ts` | AudioWorkletNode (Blob URL) | `new Blob([WORKLET_PROCESSOR])` + `URL.createObjectURL` + `addModule` | WIRED | `speech-capture.ts:80,83,75` |
| `src/settings.ts` voice section | `src/i18n.ts` translation keys | `this.plugin.t("speech...")` x8 calls | WIRED | `settings.ts:1590-1649` — 8 distinct `this.plugin.t()` calls for speech i18n keys |
| `src/settings.ts normalizeLoadedSettings` | `LinkTagIntelligenceSettings` | TypeScript type checking + clamping | WIRED | `settings.ts:343-348` — `Math.max(0, Math.min(...))` for VAD and autoStop |
| `src/main.ts toggleSpeechRecording` | `src/speech-recorder.ts SpeechRecorder` | `this.speechRecorder.toggle()` | WIRED | `main.ts:1069` — toggle call; `main.ts:54` — import |
| `src/main.ts addCommand checkCallback` | MarkdownView editor focus | `this.app.workspace.activeEditor` | WIRED | `main.ts:201-204` — returns false when `!editorView?.editor` |
| `src/speech-recorder.ts` | `src/speech-capture.ts` | `import { startCapture, stopCapture, calculateRMS, rmsToDecibels }` | WIRED | `speech-recorder.ts:2` — all 4 functions imported and used |
| `src/view.ts buildToolbarSnapshot` | `src/main.ts getSpeechRecorderSnapshot()` | `this.plugin.getSpeechRecorderSnapshot()` | WIRED | `view.ts:521` — snapshot enrichment in toolbar rendering |
| `src/view.ts speech button click` | `src/main.ts toggleSpeechRecording()` | `this.plugin.toggleSpeechRecording()` | WIRED | `view.ts:381` — action binding in getToolbarActions |
| `styles.css .is-recording` | `@keyframes lti-speech-pulse` | `animation: lti-speech-pulse 1.5s ease-in-out infinite` | WIRED | `styles.css` — pulse animation on recording state selector |
| `tests/speech-capture.test.ts` | `src/speech-capture.ts` | `import { calculateRMS, rmsToDecibels }` | WIRED | `speech-capture.test.ts:2` — direct import verified |
| `tests/speech-recorder.test.ts` | `src/speech-recorder.ts` | `import { SpeechRecorder }` + vi.mock | WIRED | `speech-recorder.test.ts:415` — import; lines 408-413 — mock setup |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `src/speech-capture.ts` startCapture | `chunk: Float32Array` | AudioWorklet processor `port.postMessage(input[0])` | FLOWING | Real PCM data from microphone via AudioWorkletNode |
| `src/speech-recorder.ts` audioLevel | `this.audioLevel` | `calculateRMS(chunk)` from startCapture audio callback | FLOWING | Throttled at 60ms; flows to RecorderSnapshot |
| `src/view.ts` VU meter bars | `snapshot.dbValue` | `rmsToDecibels(this.audioLevel)` via `getSpeechRecorderSnapshot()` | FLOWING | `view.ts:311-333` — dbValue drives bar visibility and dB label |
| `src/view.ts` speech button state | `snapshot.phase` | `RecorderSnapshot.phase` from SpeechRecorder state machine | FLOWING | `view.ts:541-552` — phase drives tooltip key and CSS class |
| `src/settings.ts` speech fields | `this.plugin.settings.speech*` | `normalizeLoadedSettings()` from plugin data.json | FLOWING | Settings stored/loaded via Obsidian's plugin data API |

All wired artifacts that render dynamic data trace to real data sources — no disconnected or static data flows found.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| All speech tests pass | `npx vitest run tests/speech-capture.test.ts tests/speech-recorder.test.ts` | 29/29 pass | PASS |
| Full test suite no regressions | `npx vitest run` | 103/103 pass (9 files) | PASS |
| TypeScript compiles (new code) | `npx tsc --noEmit 2>&1 \| grep -E "speech-(capture\|recorder)\|speech.*i18n\|settings.*speech"` | No errors from Phase 01 code | PASS |
| calculateRMS edge: empty array | Test `returns 0 for empty array` passing | `calculateRMS(new Float32Array(0))` → 0 | PASS |
| rmsToDecibels edge: NaN | Test `returns -Infinity for NaN RMS` passing | `rmsToDecibels(NaN)` → -Infinity | PASS |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `src/view.ts` | 549 | `disabled: isError ? false : false` — tautological ternary (both branches return false) | INFO | Functionally correct: button is never disabled for speechRecord (error state uses click for acknowledgment). Stylistic redundancy only — `disabled: false` would be clearer. |
| `.planning/phases/01-.../01-01-SUMMARY.md` | N/A | Missing SUMMARY for Plan 01-01 | WARNING | Plan 01-01 (i18n + settings + speech-capture) was executed (all 3 files exist with full implementations) but no SUMMARY.md was produced. ROADMAP.md also shows 01-01 as unchecked. Plans 01-02/03/04 depend on 01-01 and all completed successfully, confirming 01-01 code is present. Process gap only — no implementation gap. |
| `src/settings.ts` | 1610 | Browse button handler only does `modelInput.focus()` — no file picker | INFO | Documented limitation in Plan 01-01: "Electron dialog API is not directly accessible from plugins; this serves as a placeholder for manual path entry." Not a stub — intentional design constraint acknowledged in the plan. |

### Human Verification Required

#### 1. Speech Button Visual State Transitions
**Test:** Click the speech record button in the sidebar toolbar and observe visual state transitions through idle → initializing → recording → processing → idle, and trigger the error state by denying microphone permission.
**Expected:** Idle: muted mic icon, transparent background. Initializing: spinning loader animation (1s linear infinite). Recording: accent-colored icon with pulsing box-shadow border (1.5s ease-in-out infinite). Processing: faded pulse animation (1s ease-in-out, 0.4-0.8 opacity). Error: red tint (#e93147) with 15% opacity red background and solid red border.
**Why human:** CSS animations (keyframes timing, color transitions, box-shadow rendering) can only be verified visually in Obsidian's rendered DOM. The CSS classes are confirmed present in styles.css but their visual effect depends on the Obsidian theme's CSS custom properties and the browser compositor.

#### 2. VU Meter Real-Time Audio Level
**Test:** Start recording and speak into a microphone at varying volumes. Observe the VU meter bars and dB readout.
**Expected:** During recording state only, 5 VU meter bars appear adjacent to the speech button. Speaking softly lights green bars 1-2 (> -24 dBFS). Normal speech lights green bars 1-3 and yellow bar 4 (> -18 dBFS). Loud speech lights all 5 bars including red bar 5 (> -6 dBFS). dB numeric readout shows the current dBFS value (e.g., "-12 dB"). Bars go dark when silent. VU meter hides completely when not recording.
**Why human:** Real-time audio level requires actual microphone hardware, browser AudioContext rendering, and the AudioWorklet pipeline — cannot be simulated in vitest. The data flow chain (AudioWorklet → calculateRMS → rmsToDecibels → getSnapshot → VU meter DOM) is verified at code level, but the end-to-end visual behavior needs hardware confirmation.

#### 3. Bilingual Tooltip Switching
**Test:** With plugin language set to Chinese (zh), hover over the speech button in each state (idle, recording, processing, error). Then switch to English (en) and repeat.
**Expected:** zh tooltips: "开始语音输入 (Ctrl+Shift+V)" idle, "正在录音... 点击停止" recording, "正在处理..." processing, "录音出错，点击查看详情" error. en tooltips: "Start voice input (Ctrl+Shift+V)" idle, "Recording... Click to stop" recording, "Processing..." processing, "Recording error, click for details" error.
**Why human:** Browser tooltip rendering depends on Obsidian's title attribute rendering and the plugin's i18n language resolution at runtime. The i18n keys and translation entries are verified present, but the resolved string in the DOM tooltip needs visual confirmation.

#### 4. Microphone Permission Denial Flow
**Test:** When prompted for microphone access, deny permission in the browser/system dialog.
**Expected:** An Obsidian Notice appears with the appropriate translated error message. The speech button transitions to the error state (red tint, error icon). Clicking the error-state button dismisses the error and returns to idle. Subsequent toggle attempts re-prompt for permission.
**Why human:** System-level permission dialog (navigator.mediaDevices.getUserMedia) and DOMException NotAllowedError handling require a real browser/Electron environment. The error mapping code path is verified (speech-recorder.ts:100-101), but the end-to-end flow including the browser permission dialog cannot be tested programmatically.

#### 5. Device Disconnect During Recording
**Test:** Start recording with a USB microphone, then physically unplug the microphone during active recording.
**Expected:** An Obsidian Notice appears: "麦克风已断开，录音已停止。" (zh) or "Microphone disconnected. Recording stopped." (en). The speech button transitions to the error state. Recording resources (AudioContext, MediaStream, devicechange listener) are cleaned up.
**Why human:** Hardware device disconnect event (navigator.mediaDevices devicechange) requires a physical hardware change. The event listener code is verified (speech-recorder.ts:136-170) but its triggering cannot be simulated in unit tests.

#### 6. Settings Panel Voice Section
**Test:** Open Obsidian Settings → Link Tag Intelligence → scroll to the Voice section.
**Expected:** Section heading "语音" (zh) or "Voice" (en) with description text. Fields: model file path text input with "浏览..." / "Browse..." button (clicking focuses the input), language selector dropdown (中文 zh / English en), VAD sensitivity slider (0-3, displays current value), auto-stop timeout number input (0-300, step 10). All labels and descriptions match the bilingual copywriting contract.
**Why human:** Settings panel layout rendering depends on Obsidian's PluginSettingTab DOM structure and the plugin's CSS classes (lti-voice-input-row, lti-voice-slider-row). The field creation code is verified but the visual layout, spacing, and responsiveness need human confirmation in the Obsidian settings UI.

#### 7. Command Palette Editor-Focus Gating
**Test:** Open the command palette (Ctrl+P) with no Markdown editor open and search for "Toggle voice input". Then open any Markdown note and repeat.
**Expected:** Without an active Markdown editor, the command appears greyed out (disabled) in the palette. With a Markdown editor focused, the command is enabled and shows the Ctrl+Shift+V shortcut.
**Why human:** Obsidian's command palette rendering and checkCallback integration determines the visual disabled/enabled state. The gating logic (`checkCallback returns false when !activeEditor?.editor`) is verified, but the visual greyed-out appearance in the palette requires the live Obsidian command system.

### Gaps Summary

No implementation gaps found. All 5 roadmap success criteria are verified from code evidence. All 6 requirement IDs (SPEECH-01, SPEECH-02, SPEECH-04, SPEECH-05, SPEECH-09, SPEECH-10) are satisfied. All artifacts exist, are substantive, are wired, and have flowing data.

Two informational items noted:
1. **Plan 01-01 missing SUMMARY.md** — Code was executed successfully (all 3 files exist with full implementations), but no SUMMARY was produced. Plans 01-02/03/04 depend on 01-01 code and completed without issues, confirming implementation is present. Process gap only.
2. **Browse button is design-level placeholder** — `modelInput.focus()` is used because Obsidian plugin API does not expose Electron file dialog. This is documented in Plan 01-01 as an intentional limitation, not a stub. The model path can be entered manually via the text input.

---

_Verified: 2026-05-12T16:00:00Z_
_Verifier: Claude (gsd-verifier)_
