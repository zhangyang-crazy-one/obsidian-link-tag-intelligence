# Roadmap: Obsidian Link Tag Intelligence — Speech-to-Text

## Overview

This project adds real-time local Chinese speech-to-text to the existing Obsidian Link Tag Intelligence plugin. Phase 1 establishes the audio capture pipeline and user interaction surface (microphone access, recording state machine, toolbar button, keyboard shortcut, VU meter, settings panel, i18n). Phase 2 integrates the sherpa-onnx WASM ASR engine for streaming transcription with sentence-by-sentence cursor insertion, language switching, auto-stop, and first-run model download guidance. All processing is local — no cloud, no API keys, no network requests.

## Phases

- [ ] **Phase 1: Audio Capture & UI Foundation** - Recording infrastructure with visual feedback, settings, and bilingual UI
- [ ] **Phase 2: ASR Model & Transcription** - Local real-time speech-to-text with model onboarding

## Phase Details

### Phase 1: Audio Capture & UI Foundation
**Goal**: Users can start/stop voice recording with visual feedback and configure speech settings through a bilingual interface
**Depends on**: Nothing (first phase — builds on existing plugin architecture)
**Requirements**: SPEECH-01, SPEECH-02, SPEECH-04, SPEECH-05, SPEECH-09, SPEECH-10
**Success Criteria** (what must be TRUE):
  1. User can toggle voice recording on/off via keyboard shortcut from any active Markdown editor
  2. User can toggle voice recording via sidebar toolbar button, which visually cycles through idle, initializing, recording, and processing states
  3. Audio level VU meter (3-5 bars, green/yellow/red) updates in real-time during recording, confirming microphone input is being captured
  4. All voice-related UI text (button tooltips, state labels, error messages, settings labels) displays in Chinese when plugin language is zh and English when en
  5. Settings panel shows speech configuration fields: model file path with browse button, language selector (zh/en), VAD sensitivity slider, and auto-stop timeout input
**Plans**: 4 plans

Plans:
- [ ] 01-01-PLAN.md — i18n + Settings + Audio Capture Module (SPEECH-09, SPEECH-10, SPEECH-05)
- [ ] 01-02-PLAN.md — Recording State Machine + Main Integration (SPEECH-01, SPEECH-04)
- [ ] 01-03-PLAN.md — Toolbar UI + CSS Styling (SPEECH-02, SPEECH-05, SPEECH-04)
- [ ] 01-04-PLAN.md — Unit Tests (SPEECH-01, SPEECH-04, SPEECH-05)
**UI hint**: yes

### Phase 2: ASR Model & Transcription
**Goal**: Users' spoken Chinese (or English) is transcribed to text in real-time, inserted at the editor cursor, running entirely locally without network requests
**Depends on**: Phase 1
**Requirements**: SPEECH-03, SPEECH-06, SPEECH-07, SPEECH-08, SPEECH-11
**Success Criteria** (what must be TRUE):
  1. Spoken Chinese text appears sentence-by-sentence at the current editor cursor position, with each sentence appearing within 2 seconds of the speaker finishing it
  2. User can switch recognition language between Chinese (zh) and English (en) via settings, with the model reloading within 5 seconds after the switch
  3. Speech recognition operates fully offline — zero network requests are made during any recognition operation (verifiable via DevTools Network panel)
  4. Recording automatically stops after the configured silence duration (default 30 seconds), preceded by a visible countdown warning in the toolbar button
  5. First-time users are guided through model file download with clear steps, download progress indicator, and automatic checksum verification before first use
**Plans**: TBD

**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Audio Capture & UI Foundation | 0/0 | Not started | - |
| 2. ASR Model & Transcription | 0/0 | Not started | - |
