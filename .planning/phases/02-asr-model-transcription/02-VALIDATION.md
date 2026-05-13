---
phase: 02
slug: asr-model-transcription
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-13
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.1.8 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** `npx vitest run` (speech tests)
- **After every plan wave:** `npm test` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 02-01 | 1 | SPEECH-03, SPEECH-07 | T-3 | Audio stays in Worker, text-only output | unit | `npx vitest run tests/speech-worker.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-02 | 02-01 | 1 | SPEECH-03, SPEECH-07 | T-1 | Float32Array transferred (zero-copy), not copied | unit | `npx vitest run tests/speech-recorder.test.ts` | ❌ W0 | ⬜ pending |
| 02-01-03 | 02-01 | 1 | SPEECH-03, SPEECH-07 | T-4 | Model path validated, no path traversal | unit | `npx vitest run tests/speech-worker.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02-02 | 2 | SPEECH-03 | — | N/A | integration | `npx vitest run tests/speech-asr.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02-02 | 2 | SPEECH-06 | — | N/A | unit | `npx vitest run tests/speech-asr.test.ts` | ❌ W0 | ⬜ pending |
| 02-02-03 | 02-02 | 2 | SPEECH-08 | — | N/A | unit | `npx vitest run tests/speech-asr.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-01 | 02-03 | 2 | SPEECH-11 | T-2 | SHA256 verification, HTTPS only | unit | `npx vitest run tests/speech-model.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-02 | 02-03 | 2 | SPEECH-11 | T-2 | Download progress via ReadableStream, no file corruption | unit | `npx vitest run tests/speech-model.test.ts` | ❌ W0 | ⬜ pending |
| 02-03-03 | 02-03 | 2 | SPEECH-11 | — | N/A | unit | `npx vitest run tests/speech-model.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/speech-worker.test.ts` — covers SPEECH-03,06,07 (mock sherpa-onnx, test Worker postMessage protocol)
- [ ] `tests/speech-asr.test.ts` — covers SPEECH-03,06,08 (mock Worker, test sentence boundary, cursor insertion, language switch)
- [ ] `tests/speech-model.test.ts` — covers SPEECH-11 (mock fetch, test download progress, SHA256, retry)
- [ ] `tests/mocks/sherpa-onnx.ts` — mock sherpa-onnx createOnlineRecognizer, OnlineRecognizer, OnlineStream
- [ ] `tests/speech-recorder.test.ts` — EXTEND with Worker lifecycle tests (create, init failure, destroy, language switch)
- [ ] Framework already installed: vitest ^2.1.8 in package.json

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Actual ASR accuracy with Chinese speech | SPEECH-03 | Hardware-dependent, no test corpus | Speak Chinese sentences into mic, verify text matches in ~90% accuracy |
| Network-free operation | SPEECH-07 | Requires network monitoring | Open DevTools Network panel, record speech, verify zero requests |
| Model download from HuggingFace | SPEECH-11 | Requires real network | Initiate download via settings, verify progress Notice, verify SHA256 pass |
| Language switch with model reload | SPEECH-06 | Requires loaded model | Switch language in settings, verify model reload within 5s |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
