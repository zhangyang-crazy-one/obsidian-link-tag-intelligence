---
phase: 01
slug: audio-capture-ui-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-12
---

# Phase 01 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.8 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01-01 | 1 | SPEECH-09 | — | N/A | unit | `npx vitest run tests/i18n.test.ts -t "speech"` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01-01 | 1 | SPEECH-10 | T-3 | Settings validation in normalizeLoadedSettings (range/type checks) | unit | `npx vitest run tests/settings.test.ts -t "speech"` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01-01 | 1 | SPEECH-05 | T-1, T-4 | Audio stays in memory, never written to disk/vault | unit | `npx vitest run tests/speech-capture.test.ts -t "rms"` | ❌ W0 | ⬜ pending |
| 01-02-01 | 01-02 | 2 | SPEECH-04, SPEECH-01 | T-1 | No audio data logged; only metadata (state, chunk count) | unit | `npx vitest run tests/speech-recorder.test.ts -t "state"` | ❌ W0 | ⬜ pending |
| 01-02-02 | 01-02 | 2 | SPEECH-01, SPEECH-04 | — | N/A | unit | `npx vitest run tests/speech-recorder.test.ts -t "toggle"` | ❌ W0 | ⬜ pending |
| 01-03-01 | 01-03 | 3 | SPEECH-02, SPEECH-05 | — | N/A | unit | `npx vitest run tests/view.test.ts -t "speech"` | ❌ W0 | ⬜ pending |
| 01-03-02 | 01-03 | 3 | SPEECH-02, SPEECH-04 | — | N/A | manual | `npx vitest run tests/view.test.ts -t "speech"` | ❌ W0 | ⬜ pending |
| 01-04-01 | 01-04 | 3 | SPEECH-09, SPEECH-10 | — | N/A | unit | `npx vitest run tests/speech-capture.test.ts -t "i18n"` | ❌ W0 | ⬜ pending |
| 01-04-02 | 01-04 | 3 | SPEECH-05 | — | N/A | unit | `npx vitest run tests/speech-capture.test.ts -t "vumeter"` | ❌ W0 | ⬜ pending |
| 01-04-03 | 01-04 | 3 | SPEECH-01, SPEECH-04 | — | N/A | unit | `npx vitest run tests/speech-recorder.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/speech-capture.test.ts` — covers RMS calculation, dB conversion, VU meter thresholds (SPEECH-05)
- [ ] `tests/speech-recorder.test.ts` — covers state machine transitions (SPEECH-04), toggle logic (SPEECH-01)
- [ ] `tests/mocks/obsidian.ts` extension — add mock AudioContext, MediaStream, AudioWorkletNode, Blob, URL for speech tests
- [ ] Framework already installed: vitest ^2.1.8 in package.json

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| AudioWorklet CSP Blob URL loading | SPEECH-05 | CSP behavior varies by Obsidian/Electron version | Load plugin in dev vault, check DevTools Console for CSP errors during recording start |
| AudioContext resume on user gesture | SPEECH-01 | AudioContext.suspended state depends on Electron Chromium version | Press Ctrl+Shift+V in editor, verify no "AudioContext suspended" console warning |
| Microphone permission dialog | SPEECH-04 | OS-native permission dialog cannot be automated | Deny mic permission, verify red error button + Notice in Chinese |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
