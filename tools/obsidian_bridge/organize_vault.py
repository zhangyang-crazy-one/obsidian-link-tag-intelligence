#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import os
import re
import shutil
import tarfile
from collections import Counter
from pathlib import Path
from urllib.parse import unquote


GENERIC_DELETE_STEMS = {
    "2",
    "欢迎",
    "新建笔记",
    "1_新建笔记",
    "2_新建笔记",
    "Day Note Template",
}
DEMO_PREFIXES = {"Trilium Demo", "1_Trilium Demo"}
FRONTMATTER_RE = re.compile(r"^---\n.*?\n---\n?", re.S)
MARKDOWN_LINK_RE = re.compile(r"(!?\[[^\]]*\]\()([^)]+)(\))")
HTML_ATTR_RE = re.compile(r'((?:src|href)=["\'])([^"\']+)(["\'])', re.I)
ORIGINAL_HTML_COPY_RE = re.compile(r'(?m)^(original_html_copy:\s*)(?:"([^"]*)"|([^\s]+))$')
TEXT_SUFFIXES = {".md", ".html"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Organize an Obsidian vault imported from Trilium and NotebookLM into a shallower tree."
    )
    parser.add_argument("--vault", required=True, help="Obsidian vault path")
    parser.add_argument("--dry-run", action="store_true", help="Show planned operations without changing files")
    return parser.parse_args()


class VaultOrganizer:
    def __init__(self, vault_root: Path, dry_run: bool) -> None:
        self.vault_root = vault_root
        self.dry_run = dry_run
        self.stats: Counter[str] = Counter()

    def run(self) -> None:
        self.delete_root_examples()
        self.flatten_notebooklm_journals()
        self.rehome_trilium_content()
        self.flatten_trilium_journals()
        self.enforce_three_level_tree()
        self.compact_archive_backups()
        self.delete_short_and_generic_notes()
        self.remove_empty_directories()
        self.print_summary()

    def delete_root_examples(self) -> None:
        for rel in ("欢迎.md", "2.md"):
            self.delete_path(self.vault_root / rel)

    def flatten_notebooklm_journals(self) -> None:
        source_root = self.vault_root / "Inbox" / "Imported" / "NotebookLM" / "Journals"
        if not source_root.exists():
            return
        target_root = self.vault_root / "Journals" / "NotebookLM"
        for notebook_dir in sorted(path for path in source_root.iterdir() if path.is_dir()):
            dest_dir = target_root / notebook_dir.name
            self.ensure_dir(dest_dir)
            index_file = notebook_dir / "_index.md"
            if index_file.exists():
                self.move_path(index_file, dest_dir / "_index.md")
                self.rewrite_notebook_index(dest_dir / "_index.md")
            notes_dir = notebook_dir / "notes"
            if notes_dir.exists():
                for note in sorted(notes_dir.glob("*.md")):
                    self.move_path(note, dest_dir / note.name)
            artifacts_dir = notebook_dir / "artifacts"
            if artifacts_dir.exists():
                # Current journal-only import is empty; preserve only if files exist.
                if any(artifacts_dir.rglob("*")):
                    self.move_path(artifacts_dir, dest_dir / "artifacts")
                else:
                    self.delete_path(artifacts_dir)
            self.delete_path(notes_dir)
            self.delete_path(notebook_dir)

    def rehome_trilium_content(self) -> None:
        trilium_root = self.vault_root / "Inbox" / "Imported" / "Trilium" / "trilium笔记"
        converted_root = trilium_root / "converted" / "root"
        archive_root = self.vault_root / "Archive" / "Imports" / "Trilium"
        if (trilium_root / "_trilium_import.md").exists():
            self.move_path(trilium_root / "_trilium_import.md", archive_root / "_trilium_import.md")
        if (trilium_root / "raw_export").exists():
            self.move_path(trilium_root / "raw_export", archive_root / "raw_export")
        if not converted_root.exists():
            return

        for child in list(sorted(converted_root.iterdir())):
            if self.is_demo_entry(child.name):
                self.delete_path(child)

        mappings = {
            "Journal": self.vault_root / "Journals" / "Trilium" / "Journal",
            "1_Journal": self.vault_root / "Journals" / "Trilium" / "Legacy",
            "AI-Tech-Note": self.vault_root / "Knowledge" / "Tech" / "AI-Tech-Note",
            "Tech-note": self.vault_root / "Knowledge" / "Tech" / "Tech-note",
            "program": self.vault_root / "Knowledge" / "Tech" / "program",
            "软件_Debug": self.vault_root / "Knowledge" / "Tech" / "软件_Debug",
            "Master-Note": self.vault_root / "Knowledge" / "Reference" / "Master-Note",
            "批判性思维核心概念": self.vault_root / "Knowledge" / "Reference" / "批判性思维核心概念",
            "Research_scientific": self.vault_root / "Knowledge" / "Research" / "Research_scientific",
            "Discriminant_analysis": self.vault_root / "Study" / "Quant" / "Discriminant_analysis",
            "DAMA数据管理知识体系指南-阅读笔记": self.vault_root / "Reading" / "Books" / "DAMA数据管理知识体系指南-阅读笔记",
            "穿越数据的迷宫": self.vault_root / "Reading" / "Books" / "穿越数据的迷宫",
            "MY_BOOK": self.vault_root / "Reading" / "Books" / "MY_BOOK",
            "面向“十五五”时期的中国金融发展": self.vault_root / "Study" / "Finance" / "面向“十五五”时期的中国金融发展",
            "Class-note": self.vault_root / "Study" / "Courses" / "Class-note",
            "注册会计师考试": self.vault_root / "Study" / "Finance" / "注册会计师考试",
            "经济与量化分析": self.vault_root / "Study" / "Finance" / "经济与量化分析",
            "Live-Style": self.vault_root / "Life" / "Live-Style",
            "Miscellaneous": self.vault_root / "Life" / "Miscellaneous",
        }

        for stem, target in mappings.items():
            for path in self.match_cluster_items(converted_root, stem):
                if path.exists():
                    self.move_path(path, target.parent / path.name)

        metadata_root = archive_root / "metadata"
        for path in sorted(converted_root.iterdir()):
            self.move_path(path, metadata_root / path.name)

        self.delete_path(trilium_root / "converted")
        self.delete_path(trilium_root)

    def flatten_trilium_journals(self) -> None:
        target_root = self.vault_root / "Journals" / "Trilium"
        if not target_root.exists():
            return

        journal_roots = {
            "Journal": "",
            "1_Journal": "Legacy-",
            "Legacy": "Legacy-",
        }

        for root_name, prefix in journal_roots.items():
            source_root = target_root / root_name
            if not source_root.exists() or not source_root.is_dir():
                continue

            for path in sorted(source_root.rglob("*")):
                if not path.is_file():
                    continue
                if path.suffix.lower() not in {".md", ".html"}:
                    continue
                if self.is_generic_stem(path.stem):
                    self.delete_path(path)
                    continue

                flattened_name = self.flattened_trilium_journal_name(source_root, path, prefix)
                self.move_path(path, target_root / flattened_name)

            self.delete_path(source_root)

    def enforce_three_level_tree(self) -> None:
        planned_moves = self.plan_cluster_flatten_moves()
        if not planned_moves:
            return

        original_texts = self.capture_text_sources()
        self.execute_planned_moves(planned_moves)
        self.rewrite_text_sources(original_texts, planned_moves)

    def compact_archive_backups(self) -> None:
        trilium_archive = self.vault_root / "Archive" / "Imports" / "Trilium"
        raw_export = trilium_archive / "raw_export"
        if raw_export.exists() and raw_export.is_dir():
            archive_path = self.unique_archive_target(trilium_archive / "raw_export.tar.gz")
            self.archive_directory(raw_export, archive_path)

    def plan_cluster_flatten_moves(self) -> dict[Path, Path]:
        planned_moves: dict[Path, Path] = {}
        reserved = {path.resolve() for path in self.vault_root.rglob("*") if path.is_file()}

        for cluster_root in self.cluster_roots_for_flatten():
            for path in sorted(cluster_root.rglob("*")):
                if not path.is_file():
                    continue
                rel = path.relative_to(cluster_root)
                if len(rel.parts) <= 1:
                    continue
                target = self.next_flatten_target(cluster_root, rel, reserved)
                planned_moves[path.resolve()] = target
                reserved.add(target.resolve(strict=False))

        return planned_moves

    def cluster_roots_for_flatten(self) -> list[Path]:
        roots: list[Path] = []
        for path in sorted(self.vault_root.rglob("*")):
            if not path.is_dir():
                continue
            rel = path.relative_to(self.vault_root)
            if len(rel.parts) != 3:
                continue
            if rel.parts[0] in {"Archive", ".obsidian"}:
                continue
            roots.append(path)
        return roots

    def next_flatten_target(self, cluster_root: Path, rel: Path, reserved: set[Path]) -> Path:
        ext = Path(rel.name).suffix
        stem_name = self.flattened_cluster_item_stem(rel)
        candidate = cluster_root / f"{stem_name}{ext}"
        counter = 2
        while candidate.resolve(strict=False) in reserved:
            candidate = cluster_root / f"{stem_name}--{counter}{ext}"
            counter += 1
        return candidate

    def flattened_cluster_item_stem(self, rel: Path) -> str:
        file_name = Path(rel.name)
        parts = list(rel.parts[:-1]) + [file_name.stem]
        base = "__".join(self.clean_flat_part(part) for part in parts if part)
        return self.limit_flat_stem_bytes(base, rel, max_bytes=150)

    def clean_flat_part(self, part: str) -> str:
        return re.sub(r"\s+", " ", part).strip().replace("/", "_")

    def limit_flat_stem_bytes(self, stem: str, rel: Path, max_bytes: int) -> str:
        encoded = stem.encode("utf-8")
        if len(encoded) <= max_bytes:
            return stem

        digest = hashlib.sha1(str(rel).encode("utf-8")).hexdigest()[:10]
        suffix = f"__{digest}"
        budget = max_bytes - len(suffix.encode("utf-8"))
        clipped = encoded[:budget]
        while clipped:
            try:
                prefix = clipped.decode("utf-8").rstrip("_ ")
                return f"{prefix}{suffix}"
            except UnicodeDecodeError:
                clipped = clipped[:-1]
        return digest

    def capture_text_sources(self) -> dict[Path, str]:
        sources: dict[Path, str] = {}
        for path in sorted(self.vault_root.rglob("*")):
            if not path.is_file():
                continue
            if path.suffix.lower() not in TEXT_SUFFIXES:
                continue
            if ".obsidian" in path.parts or "Archive" in path.parts:
                continue
            sources[path.resolve()] = path.read_text(encoding="utf-8", errors="ignore")
        return sources

    def execute_planned_moves(self, planned_moves: dict[Path, Path]) -> None:
        for src in sorted(planned_moves, key=lambda item: len(item.parts), reverse=True):
            self.move_path_exact(src, planned_moves[src])

    def rewrite_text_sources(self, original_texts: dict[Path, str], planned_moves: dict[Path, Path]) -> None:
        for old_path, original_text in original_texts.items():
            new_path = planned_moves.get(old_path, old_path)
            if not new_path.exists() and not self.dry_run:
                continue

            updated_text = original_text
            if new_path.suffix.lower() == ".md":
                updated_text = self.rewrite_markdown_text(updated_text, old_path, new_path, planned_moves)
            elif new_path.suffix.lower() == ".html":
                updated_text = self.rewrite_html_text(updated_text, old_path, new_path, planned_moves)

            if updated_text == original_text:
                continue

            print(f"REWRITE {new_path}")
            self.stats["rewritten"] += 1
            if not self.dry_run:
                new_path.write_text(updated_text, encoding="utf-8")

    def rewrite_markdown_text(self, text: str, old_path: Path, new_path: Path, planned_moves: dict[Path, Path]) -> str:
        def replacer(match: re.Match[str]) -> str:
            target = self.rewrite_target(match.group(2), old_path, new_path, planned_moves)
            return f"{match.group(1)}{target}{match.group(3)}"

        updated = MARKDOWN_LINK_RE.sub(replacer, text)
        return self.rewrite_original_html_copy(updated, old_path, planned_moves)

    def rewrite_html_text(self, text: str, old_path: Path, new_path: Path, planned_moves: dict[Path, Path]) -> str:
        def replacer(match: re.Match[str]) -> str:
            target = self.rewrite_target(match.group(2), old_path, new_path, planned_moves)
            return f"{match.group(1)}{target}{match.group(3)}"

        return HTML_ATTR_RE.sub(replacer, text)

    def rewrite_original_html_copy(self, text: str, old_path: Path, planned_moves: dict[Path, Path]) -> str:
        old_html = old_path.with_suffix(".html")
        if old_html not in planned_moves:
            return text

        new_name = planned_moves[old_html].name

        def replacer(match: re.Match[str]) -> str:
            return f'{match.group(1)}"{new_name}"'

        return ORIGINAL_HTML_COPY_RE.sub(replacer, text, count=1)

    def rewrite_target(self, raw_target: str, old_path: Path, new_path: Path, planned_moves: dict[Path, Path]) -> str:
        if self.should_skip_target(raw_target):
            return raw_target

        target_path, anchor = self.split_anchor(raw_target)
        decoded_target = unquote(target_path)
        if self.should_skip_target(decoded_target):
            return raw_target

        old_target = (old_path.parent / decoded_target).resolve(strict=False)
        if old_target not in planned_moves and not old_target.exists():
            return raw_target

        new_target = planned_moves.get(old_target, old_target)
        relative = Path(os.path.relpath(new_target, new_path.parent)).as_posix().replace(" ", "%20")
        if anchor:
            return f"{relative}#{anchor}"
        return relative

    def split_anchor(self, target: str) -> tuple[str, str]:
        if "#" not in target:
            return target, ""
        path_part, anchor = target.split("#", 1)
        return path_part, anchor

    def should_skip_target(self, target: str) -> bool:
        lowered = target.lower()
        return (
            not target
            or target.startswith(("#", "/", "?"))
            or "://" in target
            or lowered.startswith(("mailto:", "javascript:", "data:"))
        )

    def delete_short_and_generic_notes(self) -> None:
        for note in sorted(self.vault_root.rglob("*.md")):
            if not note.exists():
                continue
            if note.name.startswith("_"):
                continue
            if note.stem in GENERIC_DELETE_STEMS:
                self.delete_path(note)
                continue
            if note.name in {"欢迎.md", "2.md"}:
                self.delete_path(note)
                continue
            body_len, total_len = self.note_lengths(note)
            if body_len < 10 and total_len < 300:
                self.delete_path(note)

        for html in sorted(self.vault_root.rglob("*.html")):
            if not html.exists():
                continue
            if "Archive" in html.parts:
                continue
            if self.is_generic_stem(html.stem):
                self.delete_path(html)

    def remove_empty_directories(self) -> None:
        for path in sorted(self.vault_root.rglob("*"), reverse=True):
            if path.is_dir():
                try:
                    next(path.iterdir())
                except StopIteration:
                    self.delete_path(path)

    def match_cluster_items(self, root: Path, stem: str) -> list[Path]:
        items: list[Path] = []
        for path in sorted(root.iterdir()):
            if path.name == stem or path.name.startswith(f"{stem}.") or path.name.startswith(f"{stem}_"):
                items.append(path)
        return items

    def rewrite_notebook_index(self, index_path: Path) -> None:
        if self.dry_run or not index_path.exists():
            return
        text = index_path.read_text(encoding="utf-8", errors="ignore")
        updated = text.replace("](notes/", "](")
        if updated != text:
            index_path.write_text(updated, encoding="utf-8")

    def note_lengths(self, path: Path) -> tuple[int, int]:
        text = path.read_text(encoding="utf-8", errors="ignore")
        total_len = len(text.strip())
        body = FRONTMATTER_RE.sub("", text).strip()
        lines = body.splitlines()
        if lines and lines[0].startswith("# "):
            body = "\n".join(lines[1:]).strip()
        return len(body), total_len

    def is_demo_entry(self, name: str) -> bool:
        return any(name == prefix or name.startswith(f"{prefix}.") or name.startswith(f"{prefix}_") for prefix in DEMO_PREFIXES)

    def is_generic_stem(self, stem: str) -> bool:
        return stem in GENERIC_DELETE_STEMS

    def flattened_trilium_journal_name(self, root: Path, path: Path, prefix: str) -> str:
        rel = path.relative_to(root)
        stem = path.stem
        suffix = path.suffix

        if len(rel.parts) >= 3 and rel.parts[0].isdigit():
            year = rel.parts[0]
            month = rel.parts[1].split(" - ", 1)[0].zfill(2)
            day_stem = rel.parts[2] if len(rel.parts) > 3 else stem
            if " - " in day_stem:
                day_num, day_label = day_stem.split(" - ", 1)
                return f"{prefix}{year}-{month}-{day_num.zfill(2)} {day_label}{suffix}"

        return f"{prefix}{stem}{suffix}"

    def ensure_dir(self, path: Path) -> None:
        if self.dry_run:
            return
        path.mkdir(parents=True, exist_ok=True)

    def unique_target(self, path: Path) -> Path:
        if not path.exists():
            return path
        counter = 2
        while True:
            candidate = path.with_name(f"{path.stem}-{counter}{path.suffix}")
            if not candidate.exists():
                return candidate
            counter += 1

    def move_path(self, src: Path, dst: Path) -> None:
        if not src.exists():
            return
        final_dst = self.unique_target(dst) if dst.exists() else dst
        print(f"MOVE {src} -> {final_dst}")
        self.stats["moved"] += 1
        if self.dry_run:
            return
        final_dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src), str(final_dst))

    def move_path_exact(self, src: Path, dst: Path) -> None:
        if not src.exists():
            return
        print(f"MOVE {src} -> {dst}")
        self.stats["moved"] += 1
        if self.dry_run:
            return
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src), str(dst))

    def archive_directory(self, src: Path, dst: Path) -> None:
        if not src.exists():
            return
        print(f"ARCHIVE {src} -> {dst}")
        self.stats["archived"] += 1
        if self.dry_run:
            return

        dst.parent.mkdir(parents=True, exist_ok=True)
        tmp_dst = dst.with_name(f"{dst.name}.tmp")
        if tmp_dst.exists():
            tmp_dst.unlink()

        with tarfile.open(tmp_dst, "w:gz") as archive:
            archive.add(src, arcname=src.name)

        tmp_dst.replace(dst)
        shutil.rmtree(src)

    def delete_path(self, path: Path) -> None:
        if not path.exists():
            return
        print(f"DELETE {path}")
        self.stats["deleted"] += 1
        if self.dry_run:
            return
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()

    def print_summary(self) -> None:
        print(
            f"SUMMARY moved={self.stats['moved']} rewritten={self.stats['rewritten']} "
            f"archived={self.stats['archived']} "
            f"deleted={self.stats['deleted']} dry_run={self.dry_run}"
        )

    def unique_archive_target(self, path: Path) -> Path:
        if not path.exists():
            return path

        suffixes = "".join(path.suffixes)
        stem = path.name[: -len(suffixes)] if suffixes else path.name
        counter = 2
        while True:
            candidate = path.with_name(f"{stem}-{counter}{suffixes}")
            if not candidate.exists():
                return candidate
            counter += 1


def main() -> int:
    args = parse_args()
    vault_root = Path(args.vault).expanduser().resolve()
    if not vault_root.is_dir():
        raise SystemExit(f"Vault path is not a directory: {vault_root}")
    organizer = VaultOrganizer(vault_root=vault_root, dry_run=args.dry_run)
    organizer.run()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
