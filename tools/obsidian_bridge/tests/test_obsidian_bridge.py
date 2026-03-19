from __future__ import annotations

import tarfile
import tempfile
import unittest
from pathlib import Path, PurePosixPath

from tools.obsidian_bridge.common import (
    extract_conversation_id,
    normalize_notebooklm_note,
    sanitize_filename,
)
from tools.obsidian_bridge.organize_vault import VaultOrganizer
from tools.obsidian_bridge.trilium_to_obsidian import rewrite_links, build_path_map


class CommonTests(unittest.TestCase):
    def test_sanitize_filename(self) -> None:
        self.assertEqual(sanitize_filename('A:B/C*D?"E<F>G|'), "A B C D E F G")
        self.assertEqual(sanitize_filename("CON"), "CON_")

    def test_normalize_notebooklm_note(self) -> None:
        content = "日期：2026-03-12\\nconversation_id：12345678-1234-1234-1234-123456789abc"
        normalized = normalize_notebooklm_note("测试标题", content)
        self.assertTrue(normalized.startswith("# 测试标题"))
        self.assertIn("\nconversation_id：12345678-1234-1234-1234-123456789abc", normalized)

    def test_extract_conversation_id(self) -> None:
        content = "notebook_id：00000000-0000-0000-0000-000000000000 conversation_id：12345678-1234-1234-1234-123456789abc"
        self.assertEqual(
            extract_conversation_id(content),
            "12345678-1234-1234-1234-123456789abc",
        )


class LinkRewriteTests(unittest.TestCase):
    def test_rewrite_links_from_html_targets(self) -> None:
        mapping = {
            PurePosixPath("root/Folder/Note.html"): PurePosixPath("root/Folder/Note.md"),
            PurePosixPath("root/Folder/Other Note.html"): PurePosixPath("root/Folder/Other Note.md"),
            PurePosixPath("root/Folder/file.pdf"): PurePosixPath("root/Folder/file.pdf"),
        }
        content = (
            "[other](Other%20Note.html)\n"
            "[pdf](file.pdf)\n"
            '<img src="Other%20Note.html">'
        )
        rewritten = rewrite_links(
            content,
            PurePosixPath("root/Folder/Note.html"),
            PurePosixPath("root/Folder/Note.md"),
            mapping,
        )
        self.assertIn("(Other%20Note.md)", rewritten)
        self.assertIn("(file.pdf)", rewritten)
        self.assertIn('src="Other%20Note.md"', rewritten)

    def test_build_path_map_rewrites_extensions(self) -> None:
        from pathlib import Path
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "root").mkdir()
            (root / "root" / "测试.html").write_text("<html></html>", encoding="utf-8")
            (root / "root" / "图.svg").write_text("<svg></svg>", encoding="utf-8")
            mapping = build_path_map(root)
            self.assertEqual(mapping[PurePosixPath("root/测试.html")], PurePosixPath("root/测试.md"))
            self.assertEqual(mapping[PurePosixPath("root/图.svg")], PurePosixPath("root/图.svg"))


class VaultOrganizerTests(unittest.TestCase):
    def test_flattened_cluster_item_stem(self) -> None:
        organizer = VaultOrganizer(Path("/tmp/vault"), dry_run=True)
        rel = Path("论文阅读笔记") / "DAMA框架" / "A CANONICAL MODEL FOR COMPARIN.md"
        self.assertEqual(
            organizer.flattened_cluster_item_stem(rel),
            "论文阅读笔记__DAMA框架__A CANONICAL MODEL FOR COMPARIN",
        )

    def test_rewrite_target_after_flatten_move(self) -> None:
        organizer = VaultOrganizer(Path("/tmp/vault"), dry_run=True)
        old_note = Path("/tmp/vault/Reading/Books/Book/Part/Chapter.md").resolve()
        new_note = Path("/tmp/vault/Reading/Books/Book/Part__Chapter.md").resolve()
        old_asset = Path("/tmp/vault/Reading/Books/Book/Part/api/images/pic.png").resolve()
        new_asset = Path("/tmp/vault/Reading/Books/Book/Part__api__images__pic.png").resolve()
        rewritten = organizer.rewrite_target(
            "api/images/pic.png",
            old_note,
            new_note,
            {old_asset: new_asset},
        )
        self.assertEqual(rewritten, "Part__api__images__pic.png")

    def test_compact_archive_backups(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            vault = Path(tmp) / "vault"
            raw_export = vault / "Archive" / "Imports" / "Trilium" / "raw_export"
            raw_export.mkdir(parents=True)
            (raw_export / "index.html").write_text("<html></html>", encoding="utf-8")

            organizer = VaultOrganizer(vault, dry_run=False)
            organizer.compact_archive_backups()

            archive_path = vault / "Archive" / "Imports" / "Trilium" / "raw_export.tar.gz"
            self.assertFalse(raw_export.exists())
            self.assertTrue(archive_path.exists())
            with tarfile.open(archive_path, "r:gz") as archive:
                self.assertIn("raw_export/index.html", archive.getnames())


if __name__ == "__main__":
    unittest.main()
