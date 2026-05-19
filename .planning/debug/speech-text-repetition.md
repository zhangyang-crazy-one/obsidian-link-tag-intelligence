---
status: awaiting_human_verify
trigger: "Speech-to-text output shows extreme text repetition - each line repeats all previous text plus new text. Also lost real-time insertion into Obsidian editor."
created: 2026-05-19T00:00:00Z
updated: 2026-05-19T00:05:00Z
---

## Current Focus

hypothesis: CONFIRMED - getResult() returns cumulative text, addPartialText() concatenated it causing quadratic repetition
test: Restored working onAsrResult pattern, build succeeds
expecting: Text inserted once per endpoint with no repetition
next_action: Await human verification in Obsidian

## Symptoms

expected: During continuous speech, ASR recognizes incremental text and inserts sentences at cursor position at each endpoint. Each sentence inserted ONCE, no repetition.
actual: Output shows cumulative accumulation pattern. Text only appears at endpoint pauses, not in real-time.
errors: No errors thrown, but output clearly shows quadratic text growth.
reproduction: Start speech recording in Obsidian, speak continuously in Chinese for ~10 seconds.
started: After commit b463953 (May 18). Changes made on May 19 broke it.

## Eliminated

## Evidence

- timestamp: 2026-05-19T00:01
  checked: asr-worker.ts getResult() behavior (current)
  found: Worker calls getResult(stream) which returns the FULL utterance text so far (CUMULATIVE). Comment says "incremental" but the actual sherpa-onnx API returns cumulative text for online streaming recognizers.
  implication: Each non-endpoint result contains ALL previous text plus new text. This is the standard sherpa-onnx behavior.

- timestamp: 2026-05-19T00:02
  checked: asr-worker.ts (working version, commit b463953)
  found: SAME getResult() behavior - returns cumulative text. Same comment claiming "incremental". The worker code is functionally identical for getResult().
  implication: The worker has always emitted cumulative text. The bug is NOT in the worker itself but in how main.ts consumes it.

- timestamp: 2026-05-19T00:03
  checked: main.ts onAsrResult (working version)
  found: Working version: (1) Non-endpoint: addPartialText(text) for preview only. (2) Endpoint: finalizeSentence(text) with text PARAMETER - uses text directly, ignores accumulated buffer. (3) Reset _speechPreviewLen = 0.
  implication: The working version NEVER inserted accumulated text. At endpoint, it used the raw text parameter directly (which is already cumulative from getResult). The partialText buffer was only for preview display, never inserted.

- timestamp: 2026-05-19T00:04
  checked: main.ts onAsrResult (current broken version)
  found: Broken version: (1) Non-endpoint: addPartialText(text) - appends cumulative text to buffer. (2) Endpoint: addPartialText(text) AGAIN - appends MORE cumulative text. Then finalizeSentence() WITHOUT parameter - returns the entire accumulated buffer.
  implication: Since getResult() returns cumulative text (e.g. "AB", then "ABC", then "ABCD"), addPartialText concatenates: partial = "" + "AB" = "AB", then "AB" + "ABC" = "ABABC", then "ABABC" + "ABCD" = "ABABCABCD". This is exactly the quadratic repetition pattern the user sees.

- timestamp: 2026-05-19T00:05
  checked: SentenceManager class definition
  found: addPartialText does this.partialText += text. finalizeSentence(text?) uses text ?? this.partialText - when text param provided, it uses that directly; when omitted, it uses accumulated buffer.
  implication: The working version passed text to finalizeSentence(), bypassing the accumulated buffer entirely. The broken version omits the parameter, using the wrongly-accumulated buffer.

## Resolution

root_cause: The onAsrResult callback was changed from the working pattern. In the working version, non-endpoint calls to addPartialText(text) were for preview only, and endpoint used finalizeSentence(text) which took the raw (already cumulative) text directly. The current version calls addPartialText(text) at BOTH non-endpoint AND endpoint, then finalizeSentence() without a parameter. Since getResult() returns CUMULATIVE text (the full utterance so far), each addPartialText call appends the full cumulative string to the buffer, creating quadratic repetition. At endpoint, the entire wrongly-accumulated buffer is inserted into the editor.
fix: Restored the working onAsrResult pattern in main.ts: at endpoint, use finalizeSentence(text) with the text parameter directly instead of addPartialText(text) + finalizeSentence(). The partialText buffer is now only used for preview display, never for insertion.
verification: Build succeeds. Awaiting human verification in Obsidian.
files_changed: [src/main.ts]
