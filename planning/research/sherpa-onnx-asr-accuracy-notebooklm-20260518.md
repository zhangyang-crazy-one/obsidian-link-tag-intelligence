# Sherpa-ONNX Chinese ASR Accuracy Optimization Research

> NotebookLM: Sherpa-ONNX Chinese ASR Accuracy Optimization Research
> Notebook ID: 2e25a8f8-d70a-41b1-8966-f665935885f7
> Start Task ID: a55ef1f4-d172-4e35-a93d-49a38a61d1ea
> Completed Task ID: cd2bfffa-8e79-4341-9fc8-5f976154a88b
> Conversation ID: d99f217c-9dd3-42ea-ad1c-4eb5c6e42481
> Date: 2026-05-18
> Mode: deep
> Sources: 34 found → 32 imported → 11 deleted (C-level) → 22 final

---

## Key Finding: modified_beam_search is the Root Cause

`modified_beam_search` has a **known unresolved bug** causing accuracy degradation:
- Hallucinates letters/words during silence (GitHub #845)
- Returns empty text ~20% of the time (GitHub #3267)
- Chinese streaming Zipformer works **perfectly** with `greedy_search`

**Applied Fix (2026-05-18):** Switched to `greedy_search`, removed `maxActivePaths`, `hotwordsScore`, `blankPenalty`.

## WenetSpeech Benchmarks (Streaming Zipformer ~76M)

| Config | dev CER | test-net CER | test-meeting CER |
|--------|---------|-------------|-------------------|
| Greedy (chunk=32) | 7.84% | 8.94% | 14.92% |
| Modified Beam (chunk=32) | 7.32% | 7.61% | 12.35% |
| Greedy (chunk=16) | 8.21% | 9.77% | 16.07% |

## Additional Optimizations Identified

- **dither=0.00003** — prevents numerical edge cases causing empty output
- **blank_penalty=1.5-2.0** — significant CER improvement when using beam search (not applicable to greedy)
- GTCRN noise reduction model — ultra-lightweight speech enhancement

## Source Quality Assessment

### S-level (kept): Official sherpa docs, icefall benchmarks, hotwords docs
### A-level (kept): GitHub issues (#845, #2900, #3267), CHANGELOG, production guide
### B-level (kept): VAD article, GTCRN, KWS model ref
### C-level (deleted 11): React Native, QNN, offline models, Reddit, Google Groups, Qwen3, duplicates

## Next Steps

- Test greedy_search accuracy in real Obsidian usage
- Consider adding dither=0.00003
- Monitor for any regression from removing beam search
- If accuracy still insufficient: consider upgrading to SenseVoice (FunASR-nano) for offline + Zipformer for streaming hybrid
