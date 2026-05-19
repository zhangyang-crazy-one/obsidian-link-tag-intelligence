# Phase 03: ASR Recognition Optimization — NotebookLM Research

> notebook_id: 2e25a8f8-d70a-41b1-8966-f665935885f7
> conversation_id: 66631576-f569-4103-8449-d658cbb196a4
> date: 2026-05-19
> rounds: 6

## Starting Baseline (commit 80e7506)

Already applied before research:
- greedy_search + dither=0.00003
- BPE modelingUnit + bpeVocab (verified correct for zh-2025 model)
- blankPenalty=1.5
- Aggressive endpoint rules: rule1=0.8s, rule2=0.3s, rule3=20.0s
- CONFUSION_MAP (5 domain-specific entries)
- 8 regression tests

## Research Findings by Optimization Area

### 1. HomophoneReplacer (P2 → DONE)

**Verdict:** Works with greedy_search. Integrated in commit 0fe43e1.

Pass `hr` config to `createOnlineRecognizer`:
```javascript
hr: { lexicon: "/path/lexicon.txt", ruleFsts: "/path/replace.fst", dictDir: "" }
```

Already have:
- `models/lexicon.txt` — 66,395 entries (Kaldi format pinyin dictionary)
- `models/replace.fst` — valid OpenFst binary, 5,069 states

**Evidence:** Python API examples use `--hr-lexicon` + `--hr-rule-fsts` alongside `--decoding-method=greedy_search`. Maintainer recommended as alternative when hotwords don't work.

### 2. VAD Pre-Speech Padding (P1 → NOT NEEDED)

**Verdict:** Irrelevant for our architecture. We use sherpa-onnx built-in endpoint detection (`enableEndpoint=1`), which feeds ALL audio continuously to the model. No audio is discarded before processing, so no front-end clipping occurs.

The 300ms ring buffer pattern is for **standalone VAD pipelines** (Silero, WebRTC VAD) where audio is dropped before VAD triggers. Our `isEndpoint()` only signals utterance END, not start.

**Evidence:** All audio goes through `stream.acceptWaveform()` before `recognizer.decode()`. The model decides internally what is speech vs silence.

### 3. GTCRN Speech Enhancement (P2)

**Verdict:** Feasible but adds complexity. Keep as future option.

- Ultra-lightweight: 48.2K params, 33 MMACs/s, RTF=0.07 on i5
- Node.js API exists: `test_online_speech_enhancement_gtcrn.js`
- Surpasses RNNoise (18.83 SISNR vs baseline)
- Adds latency to pipeline, WASM single-thread limitation

### 4. Punctuation Restoration (P2)

**Verdict:** Possible but needs careful integration.

- Node.js API exists: `test_online_punctuation.js`
- INT8 quantized model available (smaller)
- Operates on text (not audio), relatively fast
- WASM single-thread: running alongside ASR decoder may block

### 5. modelingUnit Verification

**Verdict:** BPE is CORRECT for zh-2025 model.

Verified against actual `tokens.txt`: 2002 tokens, 1740 contain CJK chars with `▁` prefix (sentencepiece BPE). This is a BPE model, not cjkchar. The notebook's general "cjkchar for Chinese" advice doesn't apply to this specific model.

### 6. Endpoint Rules Tradeoff

**Verdict:** Current 0.8s/0.3s rules are aggressive but appropriate for our architecture.

Key insight: endpoint rules handle BACK-end clipping (when to stop), NOT front-end. Since we use built-in endpoint (not standalone VAD), all audio is continuously fed — no front-end clipping to fix.

Tradeoff:
- Shorter rules = faster response, but risk mid-pause cutoff → hallucination
- Longer rules = more accuracy, but higher perceived latency

Current 0.8s/0.3s is working. rule3=20s is reasonable for conversational use.

### 7. modified_beam_search

**Verdict:** DO NOT USE. Has known hallucination bugs (GitHub #845, #3267).

The notebook suggests switching to modified_beam_search for hotwords support, but this contradicts our research — hallucination is the primary bug we're avoiding by using greedy_search.

### 8. Hotwords

**Verdict:** Cannot use with greedy_search. Sherpa-onnx throws error if hotwords_file is set with greedy_search.

## Optimization Priority After Research

### Applied (this phase)
- [x] HomophoneReplacer integration (commit 0fe43e1)

### P1 — Verified Not Needed
- [x] VAD pre-speech padding — irrelevant with built-in endpoint detection

### P2 — Future Options
- [ ] Expand CONFUSION_MAP with common homophone errors
- [ ] GTCRN speech enhancement (when WASM threading improves)
- [ ] Punctuation restoration (post-processing, not real-time)
- [ ] Consider rule3 increase for long dictation use cases

### Not Applicable
- [x] modelingUnit change — BPE verified correct
- [x] modified_beam_search — hallucination risk
- [x] Hotwords — greedy_search incompatible

## Evidence Boundaries

- **Direct evidence:** HomophoneReplacer config format, tokens.txt analysis, endpoint detection architecture
- **Reasonable inference:** Endpoint rule tradeoffs from sherpa-onnx defaults
- **Evidence gap:** Actual accuracy improvement from HomophoneReplacer (needs real-world testing)

## Source Quality

Notebook has 303 sources (many duplicates). Key sources used in 6 rounds:
- sherpa-onnx official docs (Hotwords, HomophoneReplacer, Endpoint, Pre-trained models)
- C API header (`SherpaOnnxHomophoneReplacerConfig` struct)
- Python API examples (offline-decode-files.py, speech-recognition-from-microphone)
- Node.js addon examples listing
- GTCRN paper and sherpa-onnx speech enhancement docs
- GitHub issues (hotwords greedy_search error, homophone replacer recommendation)
