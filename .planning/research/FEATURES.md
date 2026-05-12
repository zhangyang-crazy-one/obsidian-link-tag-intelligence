# Feature Research

**Domain:** Real-time local Chinese speech-to-text for note-taking (Obsidian plugin)
**Researched:** 2026-05-12
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Keyboard shortcut to start/stop recording | Industry standard. Aqua Voice, Dragon, macOS Dictation, and every Obsidian voice plugin (Voxtral, Voice Note, NeuroVox) use hotkey toggle. Users expect to invoke without touching the mouse. | LOW | Follow existing `addCommand` pattern. Toggle semantics: same shortcut starts and stops. |
| Visual recording state indicator | Universal expectation. Users must know: (1) is it recording? (2) did I stop it? The #1 UX complaint is ambiguity about recording state. Standard: red pulsing dot or icon color change. | LOW | Change toolbar button appearance. Must follow 5-state model: Idle → Initializing → Recording → Processing → Done. The Initializing state is critical — users lose first words if they see "recording" before mic is actually ready. |
| Real-time text insertion at cursor | Users expect text to appear where they're typing. Sentence-by-sentence insertion is now the standard (Aqua Voice, Voxtral Transcribe). Word-by-word creates disfluency clutter; batch-at-end creates unacceptable latency for note-taking. | MEDIUM | Requires CodeMirror 6 editor transaction at cursor position. Sentence boundary detection via pause threshold or punctuation. Must not conflict with concurrent keyboard input. |
| Audio level indicator during recording | Confirms the mic is working BEFORE the user commits to speaking. Standard patterns: VU meter bars (3-5 bars), pulsing ring, or simple amplitude bar. Avoid full waveform — overkill for dictation. | LOW | Canvas-based or CSS-animated bars. Update via `requestAnimationFrame` at ~30fps. Green/yellow/red color coding for signal quality. |
| Chinese language support as primary | This is a Chinese-first tool. 讯飞 sets the Chinese market expectation: 98% Mandarin accuracy, real-time streaming. Users will compare to what they get from 讯飞/百度 input methods. | MEDIUM | Accuracy depends on model choice. Must achieve > 90% Mandarin accuracy to be usable. Model < 200MB per constraints. |
| English language support as secondary | User explicitly requested zh/en switching. Chinese users who write bilingual notes need both. Code-switching (mixing languages mid-sentence) is a nice-to-have but not v1 table stakes. | LOW | Separate model or model config per language. Toggle in settings or quick-switch on toolbar. |
| Sidebar toolbar button | Matches existing plugin UI pattern (`lti-toolbar-button`). Users already have a sidebar panel with toolbar actions. Voice recording must integrate into this existing UX surface. | LOW | Follow existing `getToolbarActions()` pattern. Add button with `lti-toolbar-button` class. |
| Local-only operation (no cloud) | Explicit user requirement. Privacy expectation for note-taking: voice data must not leave the device. Competitors like Voice Note and Voxtral require API keys — local-only is a major differentiator. | MEDIUM | Model must run in-process (Electron/Node.js). No `child_process` to external services. No network requests for transcription. |
| Auto-stop on silence | Users expect recording to stop after extended silence. Standard: 1.5-3 second silence timeout. Prevents accidentally recording hours of silence. | LOW | Configurable timeout in settings. Visual countdown before auto-stop. |
| Settings panel integration | Users expect configuration in the existing plugin settings tab. Record hotkey, language preference, silence timeout, audio device selection. | LOW | Follow existing `LinkTagIntelligenceSettingTab` pattern. Add voice section. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Fully offline, no API key required | The single biggest differentiator. Every competing Obsidian voice plugin (Voxtral, Voice Note, NeuroVox, SpeakNote, Scribe) requires an API key (OpenAI, Mistral, Deepgram, Groq). Users must sign up, pay, and trust a cloud provider. This plugin: zero setup, zero cost, zero privacy risk. | HIGH | Depends on model selection. Models like Vosk (~100MB) or whisper.cpp small (~244MB) can run locally in Node.js. Trade-off: accuracy vs model size. |
| Chinese-first with English switching | All current Obsidian voice plugins are English-first. Voxtral supports 13 languages but Chinese is just one of many. None are optimized for Chinese recognition quality. This fills a clear gap. | MEDIUM | Requires Chinese-optimized model. Vosk CN model or whisper with Chinese fine-tuning. |
| Sentence-by-sentence live insertion (not batch) | Most Obsidian plugins are batch: record → transcribe → insert note. Voxtral is the only one doing real-time streaming, but requires Mistral API. Real-time insertion at cursor preserves writing flow — users see their thoughts appear as they speak. | MEDIUM | Sentence boundary detection + CodeMirror 6 transaction API. Must handle mid-sentence corrections smoothly. |
| Integrated with existing link/tag intelligence | Speech input can feed into the plugin's existing intelligence: spoken references resolved as links, spoken tags auto-detected as frontmatter tags. This creates a compound value — voice becomes part of the knowledge graph. | HIGH (v2) | Requires NLP on transcribed text to detect [[wikilinks]] patterns and #tag patterns. Defer to post-v1. |
| Audio level visualization with signal quality feedback | Most tools show a basic VU meter. Adding "too quiet" and "too loud/clipping" feedback helps users position their mic correctly before speaking substantive content. Reduces failed transcriptions. | LOW-MEDIUM | Canvas-based bar graph. Color thresholds: green (good), yellow (quiet), red (clipping). |
| Graceful error recovery with translated messages | Chinese users get Chinese error messages. "麦克风权限未授予" not "Microphone permission denied". Error states that tell users HOW to fix, not just WHAT went wrong. | LOW | Follow existing i18n system (zh/en). Error mapping from mic/permission/processing failures to translation keys. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Voice commands for formatting ("new paragraph", "bold that") | Users coming from Dragon/Dictate expect this. Seen in Voxtral Transcribe. | False positive rate is high with local models. "New paragraph" in normal speech gets mis-parsed as command. Adds latency waiting for command detection. Massive scope creep — becomes a voice-controlled editor. | Use keyboard for formatting. Speech for content only. v2 could add a minimal set (period/newline only) if accuracy allows. |
| Speaker diarization (multi-speaker labeling) | Meeting transcription is a common request. 讯飞's 2025 upgrade made this a headline feature. | Personal note-taking is almost always single-speaker. Diarization models are large (500MB+) and slow. Conflicts with local-only constraint. Would require different model architecture entirely. | Explicitly out of scope. If users need meeting transcription, recommend dedicated tools (讯飞听见, Otter.ai). |
| Audio file saving and playback | Users want a record of what they said. SpeakNote saves audio + transcript. | Audio files are large (10MB/minute for WAV). Vault bloat. Playback requires audio player UI embedded in notes. Privacy risk: audio files are permanent records of voice. | Text is the artifact. If audio recording is desired, use a separate tool. The plugin transcribes and discards audio. |
| Cloud API fallback ("use Whisper API when available") | Seems like a nice option for higher accuracy when online. | Undermines the core value proposition (privacy, offline). Creates a two-tier experience: online = good, offline = mediocre. Users will complain about offline quality. Adds API key management complexity. | Commit to local-only. If local accuracy is insufficient, improve the model, not fall back to cloud. |
| Hold-to-record mode (like iMessage/WeChat) | Familiar from messaging apps. Feels intuitive. | Note-taking is sustained dictation, not short messages. Holding a key while speaking for minutes is physically uncomfortable. Conflicts with keyboard shortcut toggle pattern. | Toggle mode only: press to start, press to stop. This is what Dragon, Aqua Voice, and all desktop dictation tools use. |
| Mobile support in v1 | Obsidian mobile users would benefit from voice input. | Local models (even Vosk) struggle on mobile hardware. Memory constraints are severe. Mobile microphone API differs from desktop. Would double testing surface. | Desktop-only for v1. Mobile can be evaluated after v1 validates the desktop experience. |
| Real-time translation (zh→en or en→zh) | Bilingual users might want to speak Chinese and get English text. | Adds another model (translation) on top of ASR. Doubles latency. Whisper supports this but accuracy drops significantly on the translation path. | If users want English output, switch to English recognition mode. Translation is a separate product. |
| LLM post-processing for formatting/polish | Seen in Zeddal, Scribe, and Aqua Voice. "Clean up my dictation." | Requires LLM integration (API key or local model). Adds 1-5 second latency after each sentence. Breaks local-only constraint unless running local LLM (Ollama, which adds 4GB+ overhead). | Raw transcription is sufficient for note-taking. Users can edit afterward. v2 could add optional local LLM polish if demand exists. |

## Feature Dependencies

```
[Audio Capture Pipeline]
    └──requires──> [Mic Permission Handling]
    └──requires──> [Audio Device Selection (settings)]

[Mic Permission Handling]
    └──requires──> [Error State UI + i18n messages]

[Recording State Machine]
    └──requires──> [Audio Capture Pipeline]
    └──requires──> [Visual State Indicator (toolbar button)]
    └──requires──> [Keyboard Shortcut Toggle]

[Visual State Indicator]
    └──requires──> [Toolbar Button Integration]
    └──enhances──> [Audio Level Indicator]

[Audio Level Indicator]
    └──requires──> [Audio Capture Pipeline]
    └──enhances──> [Visual State Indicator]

[Real-time Sentence Insertion]
    └──requires──> [ASR Model Running Locally]
    └──requires──> [Sentence Boundary Detection]
    └──requires──> [CodeMirror 6 Cursor Integration]
    └──requires──> [Recording State Machine]

[ASR Model Running Locally]
    └──requires──> [Model File Loading]
    └──requires──> [Language Selection (zh/en)]

[Language Switching]
    └──requires──> [ASR Model Running Locally]
    └──enhances──> [Settings Panel]

[Auto-stop on Silence]
    └──requires──> [Audio Capture Pipeline]
    └──enhances──> [Recording State Machine]

[Settings Panel Integration]
    └──requires──> [Existing Settings Tab Pattern]
    └──enhances──> [All features with configurable parameters]
```

### Dependency Notes

- **Real-time Sentence Insertion requires ASR Model**: This is the core dependency chain. Cannot demo or test anything until a model runs locally and produces text.
- **Visual State Indicator requires Recording State Machine**: Do not build UI before the state machine is correct. The #1 UX bug in dictation tools is state mismatch (showing "recording" when mic isn't ready).
- **Audio Level Indicator enhances Visual State Indicator**: Level meter can be added after basic recording state works. It's a polish feature, not a blocker.
- **Language Switching requires ASR Model**: The model must support both languages or two models must be loadable. This affects model selection.
- **All features depend on Mic Permission Handling**: If mic access fails, nothing else works. This must be the very first thing built and tested.

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the concept.

- [ ] **Mic permission check with translated error messages** — first thing tested; blocks everything else
- [ ] **Keyboard shortcut to start/stop recording** — primary interaction; follows existing `addCommand` pattern
- [ ] **Recording state machine (5 states)** — Idle, Initializing, Recording, Processing, Done; prevents the #1 UX bug (premature recording indicator)
- [ ] **Sidebar toolbar button with state indicator** — visual anchor; follows existing `lti-toolbar-button` pattern. Button changes appearance per state (mic icon → red pulsing during recording → spinner during processing)
- [ ] **Local ASR model running in-process** — the core technical challenge. Model chosen must be < 200MB, run in Node.js/Electron, and achieve > 90% Mandarin accuracy
- [ ] **Sentence-by-sentence text insertion at cursor** — core user value. Uses CodeMirror 6 transactions. Sentence boundary detection via pause threshold (configurable, default ~800ms)
- [ ] **Language switch: Chinese/English** — must support the two languages users need. Settings toggle or quick-access on toolbar
- [ ] **Audio level indicator** — 3-5 bar VU meter with green/yellow/red color coding. Confirms mic is working. Canvas-based, 30fps via requestAnimationFrame
- [ ] **Auto-stop on silence** — configurable timeout (default 2s). Prevents accidental hours-long recordings
- [ ] **Settings panel integration** — hotkey config, language toggle, silence timeout, model selection. Follows existing `LinkTagIntelligenceSettingTab` pattern
- [ ] **i18n for all voice-related strings** — Chinese and English strings for all UI labels, error messages, settings descriptions. Follows existing `tr()` pattern

### Add After Validation (v1.x)

Features to add once core is working.

- [ ] **Partial/final result visual distinction** — interim (low-confidence) text shown in grey, final text in normal color. Users need to know what's still being refined
- [ ] **"Resume after pause" mode** — let users pause mid-dictation and resume without creating a new recording session. Useful for thinking while writing
- [ ] **Audio device selection in settings** — pick specific microphone when multiple are available
- [ ] **Recording duration display** — simple timer showing how long the current recording has been active
- [ ] **Earcon audio cues** — short chime when recording starts/stops. Toggleable. Provides confirmation without looking at screen
- [ ] **Model download/management UI** — if models are downloaded separately, provide progress indicator and model switching

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Automatic punctuation restoration** — insert periods, commas, question marks. Requires model support or post-processing pass
- [ ] **Voice-triggered link detection** — detect spoken wikilink patterns (e.g., "link to 项目计划") and auto-insert `[[项目计划]]`
- [ ] **Voice-triggered tag detection** — detect spoken hashtag patterns and auto-insert `#标签` or frontmatter tags
- [ ] **Custom vocabulary / hotword boosting** — improve recognition of vault-specific terms (note titles, project names, jargon)
- [ ] **Streaming partial hypotheses display** — show words as they're recognized (before sentence boundary). Trade-off: visual noise vs perceived speed
- [ ] **Mobile Obsidian support** — evaluate if local models can run on mobile hardware
- [ ] **Optional LLM polish pass** — use local LLM (Ollama) to clean up disfluencies, add punctuation, improve formatting. Only if local LLM setup is acceptable

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Keyboard shortcut toggle | HIGH | LOW | P1 |
| Recording state machine | HIGH | MEDIUM | P1 |
| Toolbar button with state indicator | HIGH | LOW | P1 |
| Local ASR model (zh) | HIGH | HIGH | P1 |
| Sentence-by-sentence cursor insertion | HIGH | MEDIUM | P1 |
| Mic permission handling | CRITICAL | LOW | P1 |
| Language switch (zh/en) | HIGH | MEDIUM | P1 |
| Audio level indicator | MEDIUM | LOW | P1 |
| Auto-stop on silence | MEDIUM | LOW | P1 |
| Settings panel integration | MEDIUM | LOW | P1 |
| i18n voice strings | MEDIUM | LOW | P1 |
| Audio device selection | LOW | LOW | P2 |
| Recording duration display | LOW | LOW | P2 |
| Earcon audio cues | LOW | LOW | P2 |
| Partial/final result distinction | MEDIUM | MEDIUM | P2 |
| Model download UI | LOW | MEDIUM | P2 |
| Auto-punctuation restoration | MEDIUM | HIGH | P3 |
| Voice-triggered link detection | HIGH | HIGH | P3 |
| Custom vocabulary | MEDIUM | HIGH | P3 |
| LLM polish pass | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Voxtral Transcribe | Voice Note (naiding) | NeuroVox | SpeakNote | 讯飞听见 | Our Approach |
|---------|-------------------|---------------------|----------|-----------|---------|-------------|
| Real-time streaming | Yes (WebSocket) | Yes (OpenAI real-time) | No (batch) | No (batch) | Yes (< 500ms) | Yes (local, sentence-level) |
| Insert at cursor | Yes (merge with typing) | Yes | Yes (as callout) | No (new note) | N/A (standalone) | Yes (CodeMirror 6 transaction) |
| Offline / local | No (Mistral API) | No (OpenAI API) | No (Whisper/Groq API) | No (API keys) | Yes (offline mode) | **Yes (fully local)** |
| Chinese optimized | Listed as language | Not specified | Not specified | Not specified | Yes (98% accuracy) | **Yes (primary focus)** |
| Voice commands | Yes (headings, lists) | No | No | No | Yes (AI agent) | No (anti-feature for v1) |
| Audio level indicator | Not mentioned | No | No | No | Yes | **Yes (VU meter)** |
| API key required | Yes (Mistral) | Yes (OpenAI) | Yes (OpenAI/Groq) | Yes | No (but cloud service) | **No** |
| Multi-speaker | No | No | No | No | Yes (声纹识别) | No (anti-feature) |
| LLM post-processing | Yes (Mistral auto-correct) | Yes (GPT formatting) | Yes (custom prompts) | Yes (ChatGPT) | Yes (星火大模型) | No (v2 optional) |
| Price | Free + API costs | Free + API costs | Free + API costs | Free + API costs | Subscription | **Free, no external costs** |

## Key Insights from Competitor Analysis

1. **The API key barrier is universal.** Every Obsidian voice plugin requires users to sign up for a cloud API. This is the single biggest friction point — and our biggest differentiator.

2. **No one does Chinese-first.** Despite Chinese being the most spoken language, all Obsidian voice plugins are developed by English-speaking developers and treat Chinese as "one of many supported languages." Chinese recognition quality is an afterthought.

3. **Real-time + cursor insertion is rare.** Only Voxtral and Voice Note do real-time insertion. Most plugins are batch (record → transcribe → insert as new note). Real-time insertion at cursor is the right UX for dictation-while-writing.

4. **Voice commands are a trap.** Voxtral's headline feature is voice commands, but the false positive rate with local models would be unacceptable. 讯飞 can do it because they have massive training data. For v1, focus on transcription quality, not command parsing.

5. **Audio level feedback is under-served.** Most tools go from "mic icon" to "recording indicator" with nothing in between. Users don't know if their mic is working until they see (or don't see) text. A VU meter closes this feedback gap.

## Sources

- [Voxtral Transcribe - Obsidian Forum](https://forum.obsidian.md/t/voxtral-transcribe-dictate-and-type-at-the-same-time-into-your-notes-with-voice-commands-beta-testers-wanted/112674) — real-time streaming, voice commands, 13 languages
- [Voice Note for Obsidian - GitHub](https://github.com/naiding/obsidian-voice-note) — real-time cursor insertion via OpenAI real-time API
- [NeuroVox - Obsidian Stats](https://www.obsidianstats.com/plugins/neurovox) — batch transcription, callout embedding
- [SpeakNote - Obsidian Forum](https://forum.obsidian.md/t/new-plugin-speaknote-record-transcribe-save-notes-with-1-click-seeking-beta-testers/108200) — lightweight, batch to new note
- [Zeddal - GitHub](https://github.com/jashutch/zeddal) — offline-capable, RAG integration
- [Scribe - Obsidian Stats](https://www.obsidianstats.com/plugins/scribe) — interactive queries, LLM post-processing
- [讯飞听见 2025 升级](https://www.iflyrec.com/zhuanxie/685385b1.html) — Chinese market leader: 98% accuracy, speaker diarization, AI summaries
- [Vosk vs Whisper Comparison](https://blog.aidec.tw/post/speech-to-text-tools-comparison) — model size, accuracy, real-time capability comparison
- [Speech-to-Text Tools 2025-2026 Comparison](https://www.unite.ai/7-best-ai-voice-typing-and-speech-to-text-tools/) — industry feature expectations
- [Aqua Voice (YC W24)](https://www.ycombinator.com/launches/MS4-aqua-voice-desktop-write-clear-well-formatted-text-using-only-your-voice) — sentence-level streaming with disfluency filtering
- [Real-time STT Table Stakes](https://deepgram.com/learn/best-speech-to-text-apis) — sub-300ms latency, streaming partial hypotheses, auto-punctuation
- [Recording UX Best Practices](https://github.com/app-vox/vox/issues/150) — 5-state machine, initialization indicator, error recovery patterns
- [Microsoft Dragon Copilot SDK - Custom Recording UI](https://learn.microsoft.com/zh-tw/industry/healthcare/dragon-copilot/sdk/browser/implement/custom-recording-ui) — event-driven state management
- [Rambler: Supporting Writing With Speech via LLM-Assisted Gist Manipulation (2024)](https://arxiv.org/abs/2401.10838) — gist-level vs word-level insertion trade-offs

---
*Feature research for: local Chinese speech-to-text in Obsidian plugin*
*Researched: 2026-05-12*
