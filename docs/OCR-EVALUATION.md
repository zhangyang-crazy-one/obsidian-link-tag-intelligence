# OCR Evaluation Methodology

> **Status:** Methodology design only. No CI infrastructure is wired up yet.
> This document describes **how** to evaluate the OCR pipeline so that
> future tuning work is grounded in standard metrics, not visual
> inspection of one or two demo images.

## Why this document exists

The PaddleOcrService postprocessor is configurable (9 hyperparameters in
Settings → Visual → Advanced). Without a documented evaluation protocol,
anyone tempted to "tune for MagicGrid" will:

1. Adjust `dbBoxThresh` until the demo looks better
2. Not notice the same change breaks receipts / dense Chinese / etc.
3. Commit the overfit parameters into `PADDLE_DET_DEFAULTS`

This doc defines the protocol that prevents that.

## Scope

In scope:

- Detection metrics: Precision, Recall, F1 (H-mean) at IoU ≥ 0.5
- Recognition metrics: CER (Character Error Rate), 1 − N.E.D.
- End-to-end F1 (detection ∩ recognition)
- Performance: per-image latency P50 / P95
- Dataset selection (public benchmarks) and the train/dev/test split

Out of scope:

- Building a new OCR model (use PaddleOCR's published weights)
- Perspective warp (Plan B, separate effort)
- Polygon vs bbox IoU switching (currently we use polygon IoU;
  rectangle IoU is the legacy alternative if a future change reverts it)

## 1. Detection metrics

**IoU-matched Precision / Recall / F1 at IoU ≥ 0.5**, computed per the
ICDAR 2015 protocol:

| Symbol | Definition |
|---|---|
| TP | Predicted box matched to a GT box with IoU ≥ 0.5 |
| FP | Predicted box not matched to any GT |
| FN | GT box not matched to any prediction |
| Precision | TP / (TP + FP) |
| Recall | TP / (TP + FN) |
| F1 / H-mean | 2 · P · R / (P + R) |

Matching is one-to-one. On a dev set, **report F1 at the default
settings, then again at the best F1 (sweep `dbBoxThresh` ∈
{0.3, 0.4, 0.5, 0.6, 0.7})**. Both numbers are reported so the
"headroom" of the model vs the postprocessor is visible.

## 2. Recognition metrics

We use **CER** (Character Error Rate) and **1 − N.E.D.**
(Normalized Edit Distance), both of which work for CJK + Latin:

```
CER = edit_distance(predicted, ground_truth) / |ground_truth|
N.E.D. = edit_distance(predicted, ground_truth) / max(|predicted|, |ground_truth|)
```

Report both. CER punishes character-overshoot; N.E.D. is symmetric and
better for "model produced no output" cases.

## 3. End-to-end F1

A prediction is a TP iff:

- Its box IoU ≥ 0.5 against a GT box
- Its text exactly matches the GT text (case-sensitive, whitespace-sensitive)

Use the Strong-Lexicon protocol from ICDAR 2015 E2E. This is the metric
most aligned with "the user got the right text in the right place".

## 4. Performance metrics

Report these **alongside** accuracy, never in isolation:

- P50 / P95 latency per image (P95 ≪ 2s is a reasonable SLO for typical
  3000×2000 images on a desktop CPU)
- Memory peak during inference (target ≲ 500MB working set for
  det + rec with PaddleOCR mobile models)

A "more accurate" configuration that doubles latency is a regression.

## 5. Recommended test set

The two demo SVGs in `/tmp/ocr-test/` are **not** a test set. They are
2-image smoke tests only. A real evaluation needs:

### 5.1 Public benchmarks (download before evaluation)

| Dataset | Size | Language | Use case |
|---|---|---|---|
| **ICDAR 2015 Incidental** | 500 test | EN | Street view, skewed |
| **ICDAR 2017-MLT** | 9,000 | 9 langs | Multilingual, includes zh |
| **ICDAR 2019-LSVT** | 5,000 fully-annotated | zh, large vocab | Long-text Chinese street view |
| **ICDAR 2019-ReCTS** | 20,000 | zh | Shop-sign / receipt Chinese |
| **CTW1500** | 500 test | EN | Curved text |
| **MSRA-TD500** | 500 | zh/en | Multilingual long-line |

For this plugin's primary use (Obsidian note scanning), supplement
with:

- ~50 random DocVQA / FUNSD document images
- ~50 PDF page screenshots (academic papers, Chinese + English)
- ~50 chat / IDE screenshots (code / mixed scripts)
- ~50 mobile photos of paper notes

### 5.2 Split protocol (anti-overfit)

```
Total  = Train(70) + Dev(15) + Test(15)
  stratified by category and language
```

- **Train:** in-house experimentation, dataset exploration
- **Dev:** hyperparameter sweep, model comparison — this is the ONLY
  set you ever look at while tuning
- **Test:** locked, run only at release time. If you ran Test more
  than once in a release cycle, it stops being "test"

The dev/test sets **must have the same category distribution** (same
fraction of street view / document / screenshot / etc.). Stratified
sampling enforces this.

## 6. Tuning protocol

For each parameter `p` in
`{dbThresh, dbBoxThresh, unclipRatio, minSize, nmsIouThresh, maxCandidates, limitSideLen, scoreMode, useDilation}`:

1. Hold all other parameters at `PADDLE_DET_DEFAULTS`
2. Sweep `p` over a sensible range (see table below)
3. On the **Dev** set only, pick the value that maximizes F1
4. Confirm on **Test** set: F1 should not drop > 1% vs Dev
5. If it does, the parameter is overfit to Dev; revert

| Parameter | Sweep range | Step | Notes |
|---|---|---|---|
| dbThresh | 0.2 – 0.5 | 0.05 | Lower = more pixels pass binarization |
| dbBoxThresh | 0.3 – 0.7 | 0.1 | This is the biggest lever |
| unclipRatio | 1.0 – 2.5 | 0.1 | Higher = bigger boxes |
| minSize | 3 – 10 | 1 | Filters tiny contours |
| nmsIouThresh | 0.1 – 0.5 | 0.05 | Lower = more aggressive merging |
| maxCandidates | 500 – 2000 | 250 | Performance cap |
| limitSideLen | 640 – 1536 | 128 | Higher = more accurate but slower |
| scoreMode | {fast, slow} | categorical | |
| useDilation | {true, false} | categorical | True helps dense text |

**Don't sweep more than 1 parameter at a time.** Joint sweeps lose
causal attribution and you cannot tell which parameter is responsible
for a +1% gain.

## 7. Anti-patterns (do not do)

| Anti-pattern | Why it's bad |
|---|---|
| Tuning to maximize accuracy on the two demo SVGs | Single-sample metrics are noise. The "best" parameter for 1 image is wrong for 100. |
| Reporting Dev accuracy and calling it the result | Dev is the tuning set; Test is the result. |
| Looping Test evaluation until numbers are good | Test becomes contaminated; report the FIRST Test result, not the best. |
| Joint sweep of > 3 parameters | You can't attribute gains. |
| Hard-coding a setting that helps a specific image (e.g. a per-image flag) | Defeats the whole point of having a default. |
| Comparing baselines on different hardware / image sizes | Latency is meaningless without fixed env. |

## 8. Future work (not implemented)

This is the design. The actual evaluator script lives in
`tests/eval/evaluate.py` (skeleton only). To make it work:

1. Download at least 2 public datasets (ICDAR 2015 + 2017-MLT is
   the minimum)
2. Build a 200-300 image per-vault "in-the-wild" dev set
3. Wire `evaluate.py` to:
   - Read PaddleOcrService's box + text output (currently only text
     is returned — boxes must be exposed via a new method, e.g.
     `runOcrWithBoxes()`)
   - Load the corresponding GT (PPOCRLabel or LabelMe format)
   - Compute F1 / CER / 1-NED / E2E F1
   - Output a markdown report

Until all of the above is done, **no postprocessing parameter should be
changed from `PADDLE_DET_DEFAULTS` without a written justification in
the commit message referencing a specific Dev-set measurement**.
