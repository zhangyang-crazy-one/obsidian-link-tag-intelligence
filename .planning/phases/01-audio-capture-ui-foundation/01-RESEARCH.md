# Phase 01: Audio Capture & UI Foundation - Research

**Researched:** 2026-05-12
**Domain:** Web Audio API (AudioWorklet) + Obsidian Plugin UI (toolbar, settings, i18n)
**Confidence:** HIGH

## Summary

Phase 01 delivers the recording infrastructure and user interaction surface for the speech-to-text feature. It does NOT include ASR model integration (Phase 2). The phase builds on the existing plugin architecture: toolbar snapshot system in `view.ts`, command registration in `main.ts`, settings tab in `settings.ts`, and bilingual i18n in `i18n.ts`.

The core technical challenge is AudioWorklet-based microphone capture in Obsidian's Electron environment. Obsidian's CSP blocks `audioWorklet.addModule()` from loading external files -- the Blob URL workaround (PITFALLS.md Pitfall 3) is mandatory. AudioContext must be created on user gesture, not in `onload()` (PITFALLS.md Pitfall 6). Cleanup in `onunload()` is critical for hot-reload development (PITFALLS.md Pitfall 9).

All UI follows existing conventions: `lti-` CSS prefix, `is-` state modifiers, signature-based toolbar diffing, `TranslationKey` union for i18n, and `PluginSettingTab` for settings.

**Primary recommendation:** Implement audio capture in a new `src/speech-capture.ts` module using AudioWorkletNode with Blob URL CSP workaround. Add recording state machine to plugin instance. Extend toolbar snapshot, commands, settings, and i18n following the exact patterns documented in codebase research.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Recording State Machine
- **D-01:** 5-state model: `idle` -> `initializing` -> `recording` -> `processing` -> `idle`. `error` is a separate fifth state that blocks operation until user confirms recovery.
- **D-02:** Error UI feedback: button turns red with error icon + Obsidian Notice with specific Chinese message (e.g., "麦克风权限未授予，请在系统设置中允许").
- **D-03:** Mic unplugged during recording: auto-detect device list changes, immediately stop recording, notify user via Notice.

#### Toolbar Button & VU Meter
- **D-04:** Button position: rightmost in the sidebar toolbar (independent from existing link/tag buttons).
- **D-05:** Icon: Obsidian built-in microphone icon (`mic`).
- **D-06:** Recording animation: border pulsing (breathing effect) + icon color change to signal active recording. Transparent button background.
- **D-07:** VU meter: 5-bar level indicator + readable dB numeric value, positioned next to/adjacent to the record button.
- **D-08:** Button states and CSS classes follow existing `lti-` prefix + `is-` state modifier conventions.

#### Keyboard Shortcut
- **D-09:** Single toggle command: same shortcut starts and stops recording (addCommand with toggle semantics).
- **D-10:** Default shortcut: `Ctrl+Shift+V`.
- **D-11:** Shortcut only active when a Markdown editor has focus (editor context check).
- **D-12:** If the default shortcut conflicts with another plugin: log warning to console, do NOT override. User must configure manually via Obsidian hotkey settings.

#### Settings Panel
- **D-13:** New independent "语音 / Voice" section at the top of the plugin settings page (heading + description).
- **D-14:** Settings order: model file path -> language selector -> VAD sensitivity -> auto-stop timeout (dependency-ordered).
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

### Deferred Ideas (OUT OF SCOPE)
- Audio device selection (pick input mic) -- Phase 2 or v2
- Recording duration display -- Phase 3 polish
- Earcon/audio cues for start/stop -- Phase 3 polish
- Hold-to-record mode -- explicitly rejected (v1 uses toggle only)
- Audio file saving -- explicitly out of scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SPEECH-01 | User toggle voice recording on/off via keyboard shortcut from any active Markdown editor | Command registration pattern (existing `addCommand` with `checkCallback`), audio capture module, state machine |
| SPEECH-02 | User toggle via sidebar toolbar button with visual state cycling (idle/initializing/recording/processing) | Toolbar snapshot pattern (`ToolbarButtonSnapshot`, `getToolbarActions`, `buildToolbarSnapshot`, `applyToolbarSnapshot`), CSS state classes |
| SPEECH-04 | Toolbar button shows recording state (idle/initializing/recording/processing) | CSS `lti-` prefix + `is-` state modifiers, breathing animation keyframes, mic icon |
| SPEECH-05 | Audio level VU meter (3-5 bars, green/yellow/red) updates in real-time during recording | AudioWorklet RMS calculation, throttled DOM updates via snapshot signature diffing |
| SPEECH-09 | All voice-related UI text displays bilingual (zh/en) | i18n pattern (`TranslationKey` union, `tr()` function, TRANSLATIONS object) |
| SPEECH-10 | Settings panel: model file path with browse, language selector, VAD sensitivity slider, auto-stop timeout input | PluginSettingTab pattern, Setting API (addText with button, addDropdown, addSlider, addText with number input) |
</phase_requirements>

## Standard Stack

### Core (Phase 01)

| Technology | Version | Purpose | Why Standard |
|------------|---------|---------|--------------|
| **Web Audio API** (AudioWorklet) | Built-in (Chromium 113+) | Low-latency microphone capture, PCM extraction, audio level metering | Required per PITFALLS.md -- ScriptProcessorNode deprecated and causes crashes |
| **Obsidian Plugin API** | Obsidian >= 1.4.0 | Plugin lifecycle, commands, settings, toolbar rendering | Existing codebase already uses this extensively |
| **TypeScript** | ^5.8.2 | Type-safe state machine, audio types, i18n keys | Project standard (`strict: true`) |
| **esbuild** | ^0.25.0 | Bundle plugin output | Existing build system, already configured |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **Vitest** | ^2.1.8 | Unit tests for state machine, i18n, settings normalization | Already configured; test audio modules with mock AudioContext |
| **Obsidian mocks** | tests/mocks/obsidian.ts | Mock Obsidian API in tests | Extend with AudioWorklet/Microphone-related mocks |

**Installation:** No new npm dependencies required for Phase 01. All APIs are built-in (Web Audio, Obsidian Plugin API).

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| AudioWorkletNode (Blob URL) | ScriptProcessorNode | ScriptProcessorNode runs on main thread, produces dirty audio, causes Windows BSOD (PITFALLS.md #1). Not acceptable. |
| standalone microphone permission library | navigator.mediaDevices.getUserMedia | Built-in API already works in Obsidian Electron (confirmed by `obsidian-sysaudio-recorder-plugin`). No library needed. |

**Version verification:** All stack items verified against project `package.json` and codebase analysis. No version drift concerns.

## Architecture Patterns

### Recommended Project Structure (New Files Only)

```
src/
├── speech-capture.ts      # AudioWorklet wrapper, mic access, audio level metering [NEW]
├── speech-recorder.ts     # State machine, toggle logic, device monitoring [NEW]
├── main.ts                # ADD: speech command + recorder lifecycle
├── view.ts                # ADD: speech button in toolbar + VU meter rendering
├── settings.ts            # ADD: voice section with 4 fields
├── i18n.ts                # ADD: ~15 speech translation keys
└── ... (existing files)
```

**Rationale for flat structure:** Project convention is flat `src/` directory (per CONVENTIONS.md). Three new speech files match the domain module pattern of `ingestion.ts` + `semantic.ts` + `companion-plugins.ts`.

### Pattern 1: 5-State Recording Machine

**What:** A typed state machine with 5 operational states (`idle`, `initializing`, `recording`, `processing`, `error`) and well-defined transitions. The `error` state blocks operation until user acknowledges.

**When to use:** Any recording lifecycle management. State transitions drive UI updates and audio capture lifecycle.

**State transitions:**
```
idle → initializing  (user triggers recording start)
initializing → recording  (AudioContext resumed, worklet loaded)
initializing → error  (mic permission denied, device not found)
recording → processing  (user triggers stop, silence timeout, device unplugged)
recording → error  (AudioContext crash, device disconnect)
processing → idle  (flush complete)
error → idle  (user acknowledges via Notice/button click)
```

**Example:**
```typescript
// src/speech-recorder.ts
// Follows existing type pattern (discriminated union with kind field)

type RecordingState = "idle" | "initializing" | "recording" | "processing" | "error";

interface RecorderState {
  kind: RecordingState;
  audioLevel: number;       // 0.0 - 1.0, for VU meter
  errorMessage?: string;    // TranslationKey for Notice on error entry
}
```

### Pattern 2: AudioWorklet with Blob URL CSP Workaround

**What:** AudioWorklet processor code is constructed as a JavaScript string, wrapped in a Blob, and loaded via Blob URL to bypass Obsidian's CSP restriction on `audioWorklet.addModule()`.

**When to use:** Any time AudioWorklet is needed in an Obsidian plugin. CSP blocks file-path-based `addModule()` calls.

**Example:**
```typescript
// Source: PITFALLS.md (Pitfall 3), verified against SpessaSynth plugin experience
// src/speech-capture.ts

const MIC_PROCESSOR_CODE = `
  class MicProcessor extends AudioWorkletProcessor {
    process(inputs, outputs, parameters) {
      const input = inputs[0];
      if (input && input.length > 0 && input[0].length > 0) {
        // Forward mono PCM data to main thread via port
        this.port.postMessage(input[0]);
      }
      return true; // keep processor alive
    }
  }
  registerProcessor('mic-processor', MicProcessor);
`;

async function createMicWorklet(audioContext: AudioContext): Promise<AudioWorkletNode> {
  const blob = new Blob([MIC_PROCESSOR_CODE], { type: 'application/javascript' });
  const blobUrl = URL.createObjectURL(blob);
  try {
    await audioContext.audioWorklet.addModule(blobUrl);
    return new AudioWorkletNode(audioContext, 'mic-processor');
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}
```

### Pattern 3: AudioContext User-Gesture Creation

**What:** AudioContext created lazily inside command handler or toolbar click handler (user gesture), not in `onload()`. Check for suspended state and call `resume()`.

**When to use:** Any AudioContext usage in Obsidian. Chromium autoplay policy requires user gesture.

**Example:**
```typescript
// Source: PITFALLS.md (Pitfall 6), MDN AudioContext docs
// src/speech-capture.ts

async function ensureAudioContext(): Promise<AudioContext> {
  let ctx = this.audioContext;
  if (!ctx || ctx.state === 'closed') {
    ctx = new AudioContext({ sampleRate: 16000 });
    this.audioContext = ctx;
  }
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
  return ctx;
}
```

### Pattern 4: Toolbar Button Extension (Existing, Extended)

**What:** Add `speech-record` to the existing `ToolbarActionId` union, `getToolbarActions()`, and `ToolbarButtonSnapshot`. Extend `buildToolbarSnapshot()` to read recording state from plugin.

**When to use:** Adding any new toolbar button. Follows the existing 9-button pattern.

**Example:**
```typescript
// src/view.ts — modifications to existing code
// 1. Extend type:
type ToolbarActionId = 
  | /* existing 9 actions */
  | "speechRecord";

// 2. Add to getToolbarActions():
["speechRecord", () => this.plugin.toggleSpeechRecording()]

// 3. Extend ToolbarButtonSnapshot:
interface ToolbarButtonSnapshot {
  key: ToolbarActionId;
  label: string;
  disabled: boolean;
  title?: string;
  state?: RecordingState;       // NEW — drives CSS class
  audioLevel?: number;          // NEW — drives VU meter fill
}
```

### Pattern 5: PluginSettingTab Voice Section (Existing, Extended)

**What:** Add a new "语音 / Voice" section at the top of the workbench-based settings page. Uses `this.plugin.t()` for bilingual labels and Obsidian `Setting` constructors for form fields.

**When to use:** Adding any settings group. Follows existing section card pattern.

**Example (following existing codebase patterns):**
```typescript
// src/settings.ts — Voice settings fields rendered as workbench section card
// Adding to buildDefaultSettings():
speechModelPath: "",
speechLanguage: "zh",
speechVadSensitivity: 2,
speechAutoStopSec: 60

// Adding to LinkTagIntelligenceSettings interface + normalizeLoadedSettings()
```

### Pattern 6: Command with Editor Context Check (Existing, Extended)

**What:** Single toggle command using `addCommand` with `checkCallback` that verifies a Markdown editor has focus before enabling. Default shortcut `Ctrl+Shift+V`.

**When to use:** Any command that requires editor context. Follows existing `insert-link-with-preview` pattern (main.ts line 90).

**Example:**
```typescript
// src/main.ts — following existing checkCallback pattern (lines 90-101)
this.addCommand({
  id: "toggle-speech-recording",
  name: this.t("speechToggleRecording"),
  hotkeys: [{ modifiers: ["Ctrl", "Shift"], key: "V" }],
  checkCallback: (checking) => {
    const editor = this.app.workspace.activeEditor;
    if (!editor?.editor) {
      return false;
    }
    if (!checking) {
      this.toggleSpeechRecording();
    }
    return true;
  }
});
```

### Anti-Patterns to Avoid

- **Creating AudioContext in onload():** Results in permanently suspended context (Pitfall 6). Always create on user gesture.
- **ScriptProcessorNode:** Deprecated, main-thread-blocking, audio artifacts, Windows crashes (Pitfall 1). Always use AudioWorkletNode.
- **Using file path for addModule():** Blocked by Obsidian CSP (Pitfall 3). Always use Blob URL.
- **Storing audio buffers:** Privacy risk, memory consumption (10MB/minute WAV). Audio stays in memory, discarded after processing.
- **Hardcoding Chinese-only error messages:** Violates SPEECH-09. All user-facing strings via `tr()`.
- **Full contentEl.empty() on every refresh:** Causes sidebar flicker (Obsidian skill lesson #1). Use signature-based diffing from existing pattern.
- **Adding speech button before existing buttons:** Must be rightmost per D-04.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Microphone audio capture pipeline | Custom getUserMedia + ScriptProcessorNode | AudioWorkletNode with Blob URL processor | ScriptProcessorNode is deprecated, buggy, produces dirty audio (Pitfall 1). AudioWorklet is the web standard. |
| Audio level / RMS calculation | Custom DSP math | `Float32Array.reduce()` with standard RMS formula | Standard Web Audio pattern; no library needed for basic RMS |
| Device disconnect detection | Polling loop | `navigator.mediaDevices.addEventListener('devicechange', ...)` | Built-in browser API for device list changes (D-03) |
| CSP workaround for AudioWorklet | Custom file serving or Electron IPC | Blob URL from inline processor string | Proven approach from SpessaSynth plugin experience (Pitfall 3) |
| State machine | Custom class with manual transitions | TypeScript discriminated union with exhaustive switch | Project convention: `kind`-based discriminated unions already used in codebase |
| CSS animations | JavaScript animation loop | CSS `@keyframes` with `animation` property | CSS animations offload to compositor thread; smoother than JS animations |

**Key insight:** Phase 01 uses zero external libraries beyond the Web Audio API (built into Electron/Chromium). The complexity is in correct API usage and CSP workaround, not in dependency management.

## Runtime State Inventory

> Phase 01 is greenfield (new feature), not a rename/refactor/migration. No runtime state to migrate.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None -- Phase 01 adds new settings fields (speechModelPath, speechLanguage, speechVadSensitivity, speechAutoStopSec) but no data migration needed | Settings normalization handles new fields with defaults |
| Live service config | None | N/A |
| OS-registered state | None | N/A |
| Secrets/env vars | None | N/A |
| Build artifacts | None relevant to Phase 01 | N/A |

**Nothing found in any category:** Phase 01 is a new feature addition with no pre-existing runtime state.

## Environment Availability

> Phase 01 has no external CLI/runtime dependencies beyond what the project already uses. AudioWorklet and getUserMedia are browser APIs verified at runtime in Electron.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build | Yes | v24.13.0 | -- |
| npm | Package management | Yes | 10.9.4 | -- |
| esbuild | Build | Yes | ^0.25.0 (in devDeps) | -- |
| TypeScript | Build | Yes | ^5.8.2 (in devDeps) | -- |
| Vitest | Testing | Yes | ^2.1.8 (in devDeps) | -- |
| Web Audio API | Microphone capture | N/A (runtime, Electron) | Chromium 113+ (Electron) | -- |
| AudioWorklet | Low-latency PCM | N/A (runtime, Electron) | Chromium 113+ (Electron) | -- |
| getUserMedia | Microphone access | N/A (runtime, Electron) | Built-in (Electron) | -- |

**No missing dependencies.** All build dependencies are already installed in the project. All runtime dependencies are built into Electron/Chromium and available in Obsidian's rendering process.

## Common Pitfalls

### Pitfall 1: ScriptProcessorNode Instead of AudioWorkletNode

**What goes wrong:** Using `createScriptProcessor()` produces dirty PCM data with noise artifacts, causes renderer jank, and can trigger Windows BSOD crashes in Electron.

**Why it happens:** ScriptProcessorNode runs on the main thread (not dedicated audio thread). Tutorials still recommend it because it's older and better-documented.

**How to avoid:** Use AudioWorkletNode exclusively. The processor must resample to 16kHz mono inside the worklet. Use Blob URL for CSP workaround.

**Warning signs:** UI jank during recording, scratchy audio, recognition quality degradation, Windows crashes.

**Source:** PITFALLS.md (HIGH confidence, verified against Electron issue #47512)

### Pitfall 2: AudioContext Suspended State

**What goes wrong:** AudioContext created in `onload()` starts in "suspended" state. All audio processing silently does nothing. User sees "recording" but no data flows. No error thrown.

**Why it happens:** Chromium's autoplay policy requires AudioContext `resume()` within a user gesture. Plugin `onload()` is NOT a user gesture.

**How to avoid:** Create AudioContext lazily inside the command handler or toolbar click handler. Check `ctx.state === "suspended"` and call `ctx.resume()`.

**Warning signs:** ctx.state === "suspended", no audio data in worklet, no errors in console.

**Source:** PITFALLS.md (HIGH confidence, standard Chromium behavior)

### Pitfall 3: Obsidian CSP Blocks AudioWorklet.addModule()

**What goes wrong:** `audioWorklet.addModule('/path/to/processor.js')` fails with `DOMException`. Obsidian's CSP blocks loading external JS files at runtime.

**Why it happens:** `addModule()` triggers `fetch()` under the hood. Obsidian's restrictive CSP blocks arbitrary URL fetches.

**How to avoid:** Build processor code as inline string, create Blob, load from blob URL. Blob URLs inherit origin permissions.

**Warning signs:** DOMException in console, works in development but fails in production.

**Source:** PITFALLS.md (HIGH confidence, confirmed via SpessaSynth plugin forum report)

### Pitfall 4: Hot Reload Resource Leaks

**What goes wrong:** Each hot-reload cycle (disable -> enable) creates new AudioContext and MediaStream without releasing previous ones. After 5-10 cycles, microphone resource exhausted.

**Why it happens:** Hot-reload calls `onunload()` before disable and `onload()` after enable. If `onunload()` doesn't close AudioContext and stop media tracks, they leak.

**How to avoid:** Explicit cleanup in `onunload()`: close AudioContext, stop all MediaStream tracks, terminate Worker. Verify with 10+ consecutive hot-reloads.

**Warning signs:** `getUserMedia` throws "Requested device not found" after several reloads, microphone indicator stays on after plugin disable.

**Source:** PITFALLS.md (HIGH confidence, Obsidian hot-reload known issue)

### Pitfall 5: getUserMedia on macOS Electron

**What goes wrong:** Combined video+audio `getUserMedia` is broken on macOS Electron. Audio-only works fine.

**Why it happens:** Known Electron bug with video capture on macOS.

**How to avoid:** Request audio-only: `navigator.mediaDevices.getUserMedia({ audio: true, video: false })`.

**Warning signs:** Permission dialog shows camera + microphone when only mic needed, `getUserMedia` hangs or throws on macOS.

**Source:** PITFALLS.md (HIGH confidence, confirmed via Obsidian forum)

### Pitfall 6: Missing Device Disconnect Handling

**What goes wrong:** User unplugs USB microphone during recording. Without `devicechange` listener, the plugin continues in "recording" state with no audio data flowing.

**Why it happens:** AudioWorklet continues processing (true return), but input buffers become silent. No error thrown by Web Audio API.

**How to avoid:** Register `navigator.mediaDevices.addEventListener('devicechange', handler)` on recording start. In handler: enumerate devices, check if active device still present, transition to error state if not. Remove listener on recording stop.

**Warning signs:** Recording indicator stays active, no audio level, no errors, no text output.

**Source:** Architecture decision D-03, standard Web API behavior

## Code Examples

### Audio Capture Module (speech-capture.ts)

```typescript
// Source: AudioWorklet pattern from PITFALLS.md Pitfall 3
// Verified against: MDN AudioWorklet docs, Obsidian SpessaSynth CSP workaround

import type LinkTagIntelligencePlugin from "./main";

export interface CaptureState {
  audioContext: AudioContext | null;
  mediaStream: MediaStream | null;
  workletNode: AudioWorkletNode | null;
  analyserNode: AnalyserNode | null;
}

const WORKLET_PROCESSOR = `
class MicProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0];
    if (input && input.length > 0 && input[0] && input[0].length > 0) {
      this.port.postMessage(input[0]);
    }
    return true;
  }
}
registerProcessor('mic-processor', MicProcessor);
`;

export async function startCapture(
  plugin: LinkTagIntelligencePlugin,
  onAudioChunk: (chunk: Float32Array) => void
): Promise<CaptureState> {
  const audioContext = new AudioContext({ sampleRate: 16000 });
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  const mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      sampleRate: 16000,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    },
    video: false
  });

  const blob = new Blob([WORKLET_PROCESSOR], { type: 'application/javascript' });
  const blobUrl = URL.createObjectURL(blob);
  try {
    await audioContext.audioWorklet.addModule(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }

  const source = audioContext.createMediaStreamSource(mediaStream);
  const workletNode = new AudioWorkletNode(audioContext, 'mic-processor');
  
  workletNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
    onAudioChunk(e.data);
  };

  source.connect(workletNode);

  return { audioContext, mediaStream, workletNode, analyserNode: null };
}

export function calculateRMS(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

export function rmsToDecibels(rms: number): number {
  if (rms <= 0) return -Infinity;
  return 20 * Math.log10(rms);
}
```

### Recording State Machine (speech-recorder.ts)

```typescript
// Following PROJECT.md decision D-01: 5-state model + error

export type RecorderPhase = "idle" | "initializing" | "recording" | "processing" | "error";

export interface RecorderSnapshot {
  phase: RecorderPhase;
  audioLevel: number;    // 0.0 - 1.0
  dbValue: number;       // dB for VU meter display
  errorKey?: string;     // TranslationKey for error state
}

export class SpeechRecorder {
  private phase: RecorderPhase = "idle";
  private audioLevel = 0;
  private capture: CaptureState | null = null;
  
  getSnapshot(): RecorderSnapshot {
    return {
      phase: this.phase,
      audioLevel: this.audioLevel,
      dbValue: rmsToDecibels(this.audioLevel),
      errorKey: this.phase === "error" ? this.errorKey : undefined
    };
  }
  
  canToggle(): boolean {
    return this.phase === "idle" || this.phase === "recording";
  }
  
  get isActive(): boolean {
    return this.phase === "initializing" || this.phase === "recording" || this.phase === "processing";
  }
}
```

### Settings Fields (settings.ts additions)

```typescript
// Following existing Setting API pattern from codebase
// Source: settings.ts PluginSettingTab, existing addText/addDropdown/addSlider patterns

// New fields in LinkTagIntelligenceSettings:
speechModelPath: string;       // default ""
speechLanguage: "zh" | "en";   // default "zh"  
speechVadSensitivity: number;  // default 2, range 0-3
speechAutoStopSec: number;     // default 60, range 10-300, 0 = disabled

// In normalizeLoadedSettings():
normalized.speechModelPath = typeof normalized.speechModelPath === "string" 
  ? normalized.speechModelPath : "";
normalized.speechLanguage = normalized.speechLanguage === "en" ? "en" : "zh";
normalized.speechVadSensitivity = Number.isFinite(normalized.speechVadSensitivity) 
  ? Math.max(0, Math.min(3, Math.round(normalized.speechVadSensitivity))) : 2;
normalized.speechAutoStopSec = Number.isFinite(normalized.speechAutoStopSec)
  ? Math.max(0, Math.min(300, Math.round(normalized.speechAutoStopSec))) : 60;
```

### i18n Keys (i18n.ts additions)

```typescript
// Following existing TranslationKey union + TRANSLATIONS object pattern
// Source: i18n.ts (lines 4-323 for en, lines 647+ for zh)

// New keys to add to TranslationKey union (~15 keys):
"speechVoice" | "speechVoiceDescription" 
| "speechModelPath" | "speechModelPathDescription" 
| "speechBrowseModel" 
| "speechLanguage" | "speechLanguageDescription"
| "speechVadSensitivity" | "speechVadSensitivityDescription"
| "speechAutoStop" | "speechAutoStopDescription"
| "speechToggleRecording" 
| "speechStateIdle" | "speechStateInitializing" 
| "speechStateRecording" | "speechStateProcessing"
| "speechMicPermissionDenied" | "speechMicDeviceNotFound"
| "speechMicUnplugged"
```

### CSS Classes (styles.css additions)

```css
/* Following existing lti- prefix + is- modifier convention */
/* Source: styles.css, CONVENTIONS.md (CSS Classes section) */

.lti-speech-button.is-idle { /* default state */ }
.lti-speech-button.is-initializing { /* spinner or pulse */ }
.lti-speech-button.is-recording { 
  animation: lti-recording-pulse 1.5s ease-in-out infinite;
  color: var(--lti-accent);
  border-color: var(--lti-accent);
}
.lti-speech-button.is-processing { opacity: 0.7; }
.lti-speech-button.is-error {
  color: var(--text-error);
  border-color: var(--text-error);
}

@keyframes lti-recording-pulse {
  0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--lti-accent) 40%, transparent); }
  50% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--lti-accent) 0%, transparent); }
}

/* VU Meter: 5 bars, green → yellow → red */
.lti-vu-meter { display: flex; gap: 2px; }
.lti-vu-bar { width: 6px; height: 16px; border-radius: 2px; background: var(--lti-border); }
.lti-vu-bar.is-active-green { background: #4caf50; }
.lti-vu-bar.is-active-yellow { background: #ffeb3b; }
.lti-vu-bar.is-active-red { background: #f44336; }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ScriptProcessorNode | AudioWorkletNode (Blob URL) | Phase 1 start | Mandatory per PITFALLS.md -- no alternative for production |
| Fixed-threshold VAD | Built-in sherpa-onnx VAD | Deferred to Phase 2 | Phase 1 settings UI foreshadows this but implementation is Phase 2 |
| AudioContext in onload() | AudioContext on user gesture | Phase 1 start | Mandatory -- Chromium autoplay policy |
| File-path addModule() | Blob URL addModule() | Phase 1 start | Mandatory -- Obsidian CSP constraint |

**Deprecated/outdated:**
- `ScriptProcessorNode`: Deprecated since Chrome 64. Replaced by AudioWorklet. Never use in new code.
- Direct file access for worklet processors: Blocked by CSP. Always use Blob URL.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `navigator.mediaDevices.getUserMedia({ audio: true })` works in Obsidian's Electron renderer without additional permissions configuration | Standard Stack | Medium -- would need to investigate Electron `ses.setPermissionRequestHandler` or Obsidian's media permission handling |
| A2 | AudioWorklet Blob URL approach works with Obsidian's CSP in all Obsidian versions >= 1.4.0 | Architecture Patterns | Medium -- CSP policy could be tightened in future Obsidian releases; need to test on target Obsidian version |
| A3 | `AudioContext({ sampleRate: 16000 })` is supported in Obsidian's Chromium version | Standard Stack | Low -- 16kHz is standard Web Audio, supported since Chrome 57 |
| A4 | `navigator.mediaDevices.addEventListener('devicechange', ...)` fires reliably when USB microphone is unplugged on all platforms | Common Pitfalls | Medium -- event timing and reliability varies by OS; macOS may not fire for some USB devices |
| A5 | The existing `ToolbarButtonSnapshot` signature diffing will correctly handle `RecordingState` and `audioLevel` fields without schema changes | Architecture Patterns | Low -- JSON.stringify handles string/number values; only risk is audioLevel updates at 30fps causing excessive snapshot rebuilds (mitigated by throttling) |

## Open Questions

1. **Does Obsidian's CSP block `Blob` URL creation for AudioWorklet or only `fetch` to external URLs?**
   - What we know: PITFALLS.md cites the SpessaSynth plugin forum thread as evidence Blob URL works
   - What's unclear: Whether this has been tested on the exact Obsidian version this project targets
   - Recommendation: Verify in Phase 1 Wave 0 by attempting Blob URL `addModule()` in the actual Obsidian vault. If it fails, investigate `data:` URI or inline worklet alternatives.

2. **What is the exact dB range for VU meter green/yellow/red thresholds?**
   - What we know: Claude's discretion to define. Common VU meter conventions: green = -60 to -20 dB, yellow = -20 to -6 dB, red = -6 to 0 dB.
   - What's unclear: Whether these thresholds feel right with actual microphone input in Chinese speech scenarios
   - Recommendation: Start with conservative thresholds (-50 green, -20 yellow, -6 red) and tune during testing

3. **How does the settings "Browse" button work for directory selection in Electron?**
   - What we know: Obsidian plugins don't have direct access to Electron's `dialog.showOpenDialog()`. The common pattern is a text input field.
   - What's unclear: Whether Obsidian exposes any file picker API, or if we need a manual path entry
   - Recommendation: Implement text input + "Browse" button using Obsidian's available APIs. If `dialog` is not available via `require('electron').remote`, fall back to manual path entry with placeholder showing expected format.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 2.1.8 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SPEECH-01 | Toggle recording via keyboard shortcut calls `toggleSpeechRecording` | unit | `npx vitest run tests/speech-recorder.test.ts -t "toggle"` | No (Wave 0) |
| SPEECH-02 | Toolbar button renders with speech-recording action and responds correctly | unit | `npx vitest run tests/view.test.ts -t "speech"` | No (Wave 0) |
| SPEECH-04 | Recording state transitions (idle->initializing->recording->processing->idle) work correctly | unit | `npx vitest run tests/speech-recorder.test.ts -t "state"` | No (Wave 0) |
| SPEECH-05 | VU meter calculates RMS and dB correctly from audio samples | unit | `npx vitest run tests/speech-capture.test.ts -t "vumeter"` | No (Wave 0) |
| SPEECH-09 | All speech translation keys resolve in zh and en | unit | `npx vitest run tests/i18n.test.ts -t "speech"` | No (Wave 0) |
| SPEECH-10 | Settings normalization handles speech fields correctly | unit | `npx vitest run tests/settings.test.ts -t "speech"` | No (Wave 0) |

### Sampling Rate
- **Per task commit:** `npx vitest run` (fast, currently ~30 tests)
- **Per wave merge:** `npx vitest run` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/speech-recorder.test.ts` -- covers state machine transitions (REQ-SPEECH-04), toggle logic (REQ-SPEECH-01)
- [ ] `tests/speech-capture.test.ts` -- covers RMS calculation, dB conversion, VU meter thresholds (REQ-SPEECH-05)
- [ ] `tests/mocks/obsidian.ts` extension -- add mock AudioContext, mock MediaStream, mock AudioWorklet for speech tests
- [ ] Framework already installed: vitest ^2.1.8 in package.json

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No authentication in this phase |
| V3 Session Management | No | No sessions in this phase |
| V4 Access Control | No (indirect) | Microphone permission is OS-level; plugin does not control access |
| V5 Input Validation | Yes | Settings values validated in `normalizeLoadedSettings()` (range checks, type checks) |
| V6 Cryptography | No | No cryptographic operations in this phase |

**Notes:**
- Microphone access is controlled by OS/browser permission system. The plugin requests access via `getUserMedia()` and handles denial with translated error messages (D-02).
- Audio data stays in memory only (Float32Array buffers), never written to disk or vault. This addresses the privacy concern from PITFALLS.md.
- Model file path setting is a local filesystem path; no path traversal risk since the user explicitly configures it.

### Known Threat Patterns for Obsidian Plugin + Web Audio

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Audio buffer written to vault filesystem | Information Disclosure | Keep audio in memory only; discard Float32Array after RMS calculation. No File/Blob creation for audio data. |
| Settings injection via model path | Tampering | Path normalization in `normalizeLoadedSettings()`. Model path is user-configured explicitly. |
| Logging audio content in debug log | Information Disclosure | Log only metadata (recording state, chunk count), never audio samples or transcribed text. |
| getUserMedia permission abuse | Elevation of Privilege | Request audio-only (`video: false`). Plugin cannot escalate to video without user re-granting. |

## Sources

### Primary (HIGH confidence)
- `.planning/research/STACK.md` -- sherpa-onnx WASM recommendation, Zipformer model specs (Phase 2 reference)
- `.planning/research/ARCHITECTURE.md` -- Web Worker + AudioWorklet architecture, component boundaries
- `.planning/research/PITFALLS.md` -- All pitfalls verified: AudioWorklet over ScriptProcessorNode (Pitfall 1), CSP Blob URL workaround (Pitfall 3), AudioContext suspended (Pitfall 6), hot reload cleanup (Pitfall 9)
- `.planning/codebase/ARCHITECTURE.md` -- Plugin-mediated service layer, toolbar snapshot pattern, command registration
- `.planning/codebase/CONVENTIONS.md` -- CSS `lti-` prefix + `is-` modifiers, i18n pattern, TypeScript strict mode
- `.planning/codebase/STRUCTURE.md` -- Flat `src/` directory structure
- Source code analysis: `src/view.ts` (ToolbarButtonSnapshot, getToolbarActions, applyToolbarSnapshot), `src/main.ts` (addCommand patterns, onload/onunload), `src/settings.ts` (LinkTagIntelligenceSettingTab, normalizeLoadedSettings), `src/i18n.ts` (TranslationKey, TRANSLATIONS), `styles.css` (CSS custom properties, lti- prefix)

### Secondary (MEDIUM confidence)
- [MDN AudioWorklet API](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet) -- standard Web API reference
- [MDN AudioContext API](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext) -- standard Web API reference
- [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) -- standard Web API reference
- [Obsidian Plugin Developer Documentation](https://docs.obsidian.md) -- official Obsidian API docs
- [Electron getUserMedia macOS issue (#47512)](https://github.com/electron/electron/issues/47512) -- confirmed Electron bug

### Tertiary (LOW confidence)
- Obsidian SpessaSynth AudioWorklet CSP forum thread -- third-party confirmation of CSP blocking, verified against PITFALLS.md

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all technologies are built-in Web APIs or existing project dependencies; no new packages needed
- Architecture: HIGH -- patterns mirror existing codebase (toolbar snapshot, command checkCallback, settings PluginSettingTab, i18n tr()); AudioWorklet approach verified against PITFALLS.md
- Pitfalls: HIGH -- all 6 pitfalls verified against PITFALLS.md, MDN docs, and Obsidian/Electron bug reports
- Environment: HIGH -- all dependencies verified; Node.js v24.13.0, npm 10.9.4, existing project deps sufficient

**Research date:** 2026-05-12
**Valid until:** 2026-06-12 (30 days -- stable domain, no fast-moving dependencies)
