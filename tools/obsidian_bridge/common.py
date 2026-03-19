from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Iterable

INVALID_FILENAME_CHARS = r'[\\/:*?"<>|]'
WINDOWS_RESERVED_NAMES = {
    "CON",
    "PRN",
    "AUX",
    "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}
UUID_RE = re.compile(
    r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b"
)
CONVERSATION_RE = re.compile(
    r"(?:conversation_id|Conversation ID)[：:\s]+([0-9a-fA-F-]{36})"
)


def sanitize_filename(name: str, fallback: str = "untitled", max_length: int = 120) -> str:
    """Return a filesystem-safe name while keeping readable Unicode titles."""
    cleaned = re.sub(INVALID_FILENAME_CHARS, " ", name)
    cleaned = cleaned.replace("\x00", " ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .")
    if not cleaned:
        cleaned = fallback
    if cleaned.upper() in WINDOWS_RESERVED_NAMES:
        cleaned = f"{cleaned}_"
    if len(cleaned) > max_length:
        cleaned = cleaned[:max_length].rstrip(" .")
    return cleaned or fallback


def unique_path(directory: Path, name: str, suffix: str) -> Path:
    """Return a non-conflicting path in directory."""
    base = sanitize_filename(name)
    candidate = directory / f"{base}{suffix}"
    counter = 2
    while candidate.exists():
        candidate = directory / f"{base}-{counter}{suffix}"
        counter += 1
    return candidate


def build_frontmatter(metadata: dict[str, object]) -> str:
    lines = ["---"]
    for key, value in metadata.items():
        lines.append(f"{key}: {json.dumps(value, ensure_ascii=False)}")
    lines.append("---")
    lines.append("")
    return "\n".join(lines)


def prepend_frontmatter(content: str, metadata: dict[str, object]) -> str:
    return f"{build_frontmatter(metadata)}{content.lstrip()}"


def normalize_notebooklm_note(title: str, content: str) -> str:
    text = content.replace("\r\n", "\n").strip()
    if "\\n" in text and text.count("\n") <= 1:
        text = text.replace("\\n", "\n")
    if text.count("\\t") >= 1 and "\t" not in text:
        text = text.replace("\\t", "\t")
    text = text.strip()
    if not text.startswith("#"):
        header = sanitize_filename(title, fallback="Untitled Note", max_length=200)
        text = f"# {header}\n\n{text}" if text else f"# {header}"
    return f"{text.rstrip()}\n"


def extract_first_uuid(text: str) -> str | None:
    match = UUID_RE.search(text)
    return match.group(0) if match else None


def extract_conversation_id(text: str) -> str | None:
    match = CONVERSATION_RE.search(text)
    return match.group(1) if match else None


def relative_markdown_link(from_path: Path, to_path: Path) -> str:
    relative = to_path.relative_to(to_path.anchor) if to_path.is_absolute() else to_path
    if from_path.is_absolute():
        from_dir = from_path.parent.relative_to(from_path.anchor)
    else:
        from_dir = from_path.parent
    return _encode_link_path(_relative_parts(from_dir, relative))


def _relative_parts(from_dir: Path, to_path: Path) -> str:
    from_parts = list(from_dir.parts)
    to_parts = list(to_path.parts)
    while from_parts and to_parts and from_parts[0] == to_parts[0]:
        from_parts.pop(0)
        to_parts.pop(0)
    pieces = [".."] * len(from_parts) + to_parts
    return "/".join(pieces) if pieces else "."


def _encode_link_path(path: str) -> str:
    pieces = []
    for part in path.split("/"):
        pieces.append(part.replace(" ", "%20"))
    return "/".join(pieces)


def iter_files(root: Path) -> Iterable[Path]:
    for path in sorted(root.rglob("*")):
        if path.is_file():
            yield path
