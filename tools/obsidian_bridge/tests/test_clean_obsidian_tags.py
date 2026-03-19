from __future__ import annotations

import unittest

from tools.obsidian_bridge.clean_obsidian_tags import clean_note_text


class CleanObsidianTagsTests(unittest.TestCase):
    def test_preserves_frontmatter_and_cleans_hash_noise(self) -> None:
        original = """---
tags:
  - coffee
---
# 标题
body color: #FF2442;
[root](#root/AbCd1234)
[iso](https://www.iso.org/obp/ui/#iso:std:iso-iec:15504:-1:ed1:v1:en)
"""
        cleaned, replacements = clean_note_text(original)
        self.assertIn("  - coffee", cleaned)
        self.assertIn("color: \\#FF2442", cleaned)
        self.assertIn("(\\#root/AbCd1234)", cleaned)
        self.assertIn(
            "[iso](https://www.iso.org/obp/ui/\\#iso:std:iso-iec:15504:-1:ed1:v1:en)",
            cleaned,
        )
        self.assertGreaterEqual(replacements, 3)

    def test_normalizes_missing_heading_space(self) -> None:
        original = "#精度矩阵法\n#1]\n"
        cleaned, _ = clean_note_text(original)
        self.assertIn("# 精度矩阵法\n\\#1]\n", cleaned)
        self.assertIn("\\#1]", cleaned)

    def test_skips_fenced_code(self) -> None:
        original = """```python
color = "#FF2442"
link = "#root/AbCd1234"
```
outside #FF2442
"""
        cleaned, _ = clean_note_text(original)
        self.assertIn('color = "#FF2442"', cleaned)
        self.assertIn("outside \\#FF2442", cleaned)

    def test_removes_inline_comment_hash(self) -> None:
        original = "1:函数 generate_samples(table,c):#根据数据表和字段选取特定数量的样本返回samples\n"
        cleaned, _ = clean_note_text(original)
        self.assertIn(": 根据数据表和字段选取特定数量的样本返回samples", cleaned)


if __name__ == "__main__":
    unittest.main()
