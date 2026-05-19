# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "pynini",
#     "pypinyin",
# ]
# ///
"""Generate sherpa-onnx Homophone Replacer replace.fst from hotwords.txt.

Uses pynini to compile a weighted FST that maps pinyin (with tone numbers)
to Chinese characters. Each hotword gets a rule like:
  pynini.cross("fu4li3ye4bian4huan4", "傅里叶变换")

Usage: uv run scripts/generate_replace_fst.py [--hotwords models/hotwords.txt] [--output models/replace.fst]
"""

import sys
from pathlib import Path

import pynini
from pynini.lib import rewrite
from pypinyin import lazy_pinyin, Style


def char_to_pinyin_toned(text: str) -> str:
    """Convert Chinese text to pinyin with tone numbers, e.g. 傅里叶变换 → fu4li3ye4bian4huan4"""
    return "".join(lazy_pinyin(text, style=Style.TONE3, neutral_tone_with_five=True))


def load_hotwords(path: str) -> list[tuple[str, str]]:
    """Load hotwords file, return list of (word, pinyin)."""
    words = []
    raw = Path(path).read_text(encoding="utf-8")
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        # Strip optional :score suffix
        word = line.split(":")[0].strip().rstrip(" 0-9.")
        if not word:
            continue
        try:
            py = char_to_pinyin_toned(word)
            words.append((word, py))
        except Exception as e:
            print(f"  [!] pinyin failed for '{word}': {e}", file=sys.stderr)
    return words


def main():
    import argparse

    ap = argparse.ArgumentParser(description="Generate replace.fst for sherpa-onnx Homophone Replacer")
    ap.add_argument("--hotwords", default="models/hotwords.txt", help="Path to hotwords file")
    ap.add_argument("--output", default="models/replace.fst", help="Output FST path")
    args = ap.parse_args()

    hotwords = load_hotwords(args.hotwords)
    if not hotwords:
        print("No hotwords found, nothing to do.", file=sys.stderr)
        sys.exit(1)

    print(f"Loaded {len(hotwords)} hotwords from {args.hotwords}")

    sigma = pynini.sigma_star()
    rules = []
    for word, pinyin_str in hotwords:
        rule = pynini.cross(pinyin_str, word)
        rules.append(rule)
        print(f"  {pinyin_str} → {word}")

    if not rules:
        print("No valid rules.", file=sys.stderr)
        sys.exit(1)

    # Combine all rules
    combined = rules[0]
    for r in rules[1:]:
        combined = combined | r
    combined = combined.optimize()

    # Apply as rewrite rule: match pinyin sequence anywhere, replace with Chinese
    fst = pynini.cdrewrite(combined, "", "", sigma)
    fst.write(str(Path(args.output).resolve()))
    print(f"Written: {args.output} ({fst.num_states()} states)")


if __name__ == "__main__":
    main()
