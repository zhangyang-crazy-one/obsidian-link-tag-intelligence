# OCR Evaluation Skeleton (Not Yet Implemented)

This directory is a placeholder for the future ICDAR-protocol-based
evaluator. **No code runs here yet** — the design lives in
`docs/OCR-EVALUATION.md`.

## Why this directory exists

When someone (a contributor, a future maintainer) is tempted to
"tune for MagicGrid" or "tune for the demo", they should be able to:

1. Run `python tests/eval/evaluate.py --dev-set ./data/dev/`
2. See F1 / CER / latency numbers on a 200+ image held-out set
3. Make data-driven decisions

Until that pipeline exists, this directory stays empty. The contract
in `docs/OCR-EVALUATION.md` is the guard rail.

## What goes here (future work)

- `evaluate.py` — main script (skeleton below)
- `hmean_iou.py` — ICDAR 2015 IoU-matched F1
- `cer_ned.py` — recognition metrics
- `report.md.template` — output format
- A small set of fixture images (10 max) for CI smoke testing the
  evaluator itself

## Skeleton

```python
# evaluate.py — NOT YET WIRED UP. Sketch only.
# Prerequisites (when implemented):
#   - pyclipper, shapely, opencv-python-headless
#   - 200+ image Dev set with PPOCRLabel-format GT

import argparse
from pathlib import Path

def evaluate(plugin_dir: str, gt_dir: str, out: str):
    """Compute F1, CER, 1-NED, E2E F1 on the GT set."""
    raise NotImplementedError("Not yet implemented. See docs/OCR-EVALUATION.md.")

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--plugin-dir", required=True)
    ap.add_argument("--gt-dir", required=True)
    ap.add_argument("--out", default="report.md")
    args = ap.parse_args()
    evaluate(args.plugin_dir, args.gt_dir, args.out)
```

## Acceptance criteria (when implemented)

- Reports F1, CER, 1-NED, E2E F1, P50/P95 latency
- Outputs to a single markdown file consumable by humans
- Runs the entire Dev set (200+ images) in < 1 hour on a desktop CPU
- Has a `--quick` flag that runs on 10 images in < 2 minutes (for
  CI smoke testing of the evaluator itself, not the OCR plugin)
