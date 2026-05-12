# Phase 1: Audio Capture & UI Foundation - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Delivers the recording infrastructure and user interaction surface: microphone access via AudioWorklet, 5-state recording machine, toolbar button with visual feedback, keyboard shortcut toggle, VU meter (5-bar + dB), settings panel additions (model path, language, VAD, auto-stop), and bilingual UI (zh/en). No ASR model integration — that's Phase 2.
</domain>

<decisions>
## Implementation Decisions

### Recording State Machine
- **D-01:** 5-state model: `idle` → `initializing` → `recording` → `processing` → `idle`. `error` is a separate fifth state that blocks operation until user confirms recovery.
- **D-02:** Error UI feedback: button turns red with error icon + Obsidian Notice with specific Chinese message (e.g., "麦克风权限未授予，请在系统设置中允许").
- **D-03:** Mic unplugged during recording: auto-detect device list changes, immediately stop recording, notify user via Notice.

### Toolbar Button & VU Meter
- **D-04:** Button position: rightmost in the sidebar toolbar (independent from existing link/tag buttons).
- **D-05:** Icon: Obsidian built-in microphone icon (`mic`).
- **D-06:** Recording animation: border pulsing (breathing effect) + icon color change to signal active recording. Transparent button background.
- **D-07:** VU meter: 5-bar level indicator + readable dB numeric value, positioned next to/adjacent to the record button.
- **D-08:** Button states and CSS classes follow existing `lti-` prefix + `is-` state modifier conventions.

### Keyboard Shortcut
- **D-09:** Single toggle command: same shortcut starts and stops recording (addCommand with toggle semantics).
- **D-10:** Default shortcut: `Ctrl+Shift+V`.
- **D-11:** Shortcut only active when a Markdown editor has focus (editor context check).
- **D-12:** If the default shortcut conflicts with another plugin: log warning to console, do NOT override. User must configure manually via Obsidian hotkey settings.

### Settings Panel
- **D-13:** New independent "语音 / Voice" section at the top of the plugin settings page (heading + description).
- **D-14:** Settings order: model file path → language selector → VAD sensitivity → auto-stop timeout (dependency-ordered).
- **D-15:** Model path: text input field + "Browse" button (system file picker for directory selection).
- **D-16:** Language selector: dropdown (select) with 中文 (zh) / English (en) options.
- **D-17:** VAD sensitivity: slider 0-3, default 2 (medium). 0 = least sensitive, 3 = most sensitive.
- **D-18:** Auto-stop timeout: number input, default 60 seconds, range 10-300, value 0 = disabled.

### Claude's Discretion
- Exact color thresholds for VU meter bars (green/yellow/red dB ranges)
- Specific CSS animation timing and keyframe details for button pulsing
- AudioWorklet Blob URL creation and CSP workaround implementation
- Settings section description text copy (in both zh/en)
- Toolbar button tooltip text
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project & Requirements
- `.planning/PROJECT.md` — Project vision, constraints (no extra frameworks, local-only, <200MB model), key decisions
- `.planning/REQUIREMENTS.md` — v1 requirements: SPEECH-01,02,04,05,09,10 with acceptance criteria
- `.planning/ROADMAP.md` — Phase 1 goal and 5 success criteria

### Research
- `.planning/research/STACK.md` — sherpa-onnx WASM recommendation, Zipformer 14M INT8 model specs, mic access in Electron
- `.planning/research/ARCHITECTURE.md` — Web Worker + AudioWorklet architecture, component boundaries, integration points
- `.planning/research/PITFALLS.md` — Critical: AudioWorkletNode over ScriptProcessorNode, AudioContext suspended state, CSP workaround, hot-reload cleanup

### Codebase Context
- `.planning/codebase/ARCHITECTURE.md` — Plugin-mediated service layer, toolbar snapshot pattern, command registration
- `.planning/codebase/STRUCTURE.md` — Flat `src/` directory structure, key file locations
- `.planning/codebase/CONVENTIONS.md` — CSS `lti-` prefix + `is-` modifiers, i18n pattern, TypeScript strict mode
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/view.ts`: `ToolbarButtonSnapshot` type, `getToolbarActions()`, `buildToolbarSnapshot()`, `applyToolbarSnapshot()` — add speech button here
- `src/main.ts`: `addCommand()` pattern (10+ existing commands) — add toggle speech command here
- `src/settings.ts`: `LinkTagIntelligenceSettingTab` (extends `PluginSettingTab`) — add speech settings section here
- `src/i18n.ts`: `tr(language, key, vars?)` function, `TranslationKey` union type — add ~15 speech keys
- CodeMirror 6 editor access via `this.app.workspace.activeEditor` — check editor focus for shortcut

### Established Patterns
- Toolbar: signature-based diffing via `serializeSnapshot()` — add `speechRecording` and `speechAudioLevel` fields to snapshot
- Commands: `addCommand({ id, name, editorCallback? })` with optional editor context check
- Settings: sections use `new Setting(containerEl).setName().setDesc().addText/addDropdown/addSlider()`
- i18n: all user-facing strings via `tr()` with typed `TranslationKey` union

### Integration Points
- `src/main.ts` `onload()`: register speech command + create Worker (lazy, on first use)
- `src/view.ts` `getToolbarActions()`: add `"speech-record"` action entry
- `src/settings.ts` `display()`: add voice section at top
- `src/i18n.ts`: add speech translation keys
</code_context>

<specifics>
## Specific Ideas

- Recording button uses Obsidian built-in mic icon — keeps it consistent with the Obsidian ecosystem feel
- Border pulsing during recording should be noticeable but not distracting — think Slack huddle button animation
- VU meter 5-bar design: bars fill from left to right, green → yellow → red as dB increases
- Error messages should be actionable in Chinese: not just "权限被拒" but "请在系统偏好设置 > 安全性与隐私 > 麦克风 中允许 Obsidian"
</specifics>

<deferred>
## Deferred Ideas

- Audio device selection (pick input mic) — Phase 2 or v2
- Recording duration display — Phase 3 polish
- Earcon/audio cues for start/stop — Phase 3 polish
- Hold-to-record mode — explicitly rejected (v1 uses toggle only)
- Audio file saving — explicitly out of scope
</deferred>

---

*Phase: 01-audio-capture-ui-foundation*
*Context gathered: 2026-05-12*
