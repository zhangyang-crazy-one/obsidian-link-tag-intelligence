from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from pathlib import Path


FRONTMATTER_RE = re.compile(r"\A---\n.*?\n---\n?", re.S)
FENCE_RE = re.compile(r"^(\s*)(```|~~~)")
HEX_COLOR_RE = re.compile(r"(?<!\\)(?<![\w/])#(?P<hex>[0-9A-Fa-f]{3,8})\b")
ROOT_FRAGMENT_RE = re.compile(r"(?<!\\)#(?P<frag>root/[A-Za-z0-9_-]+)\b")
FOOTNOTE_FRAGMENT_RE = re.compile(r"(?<!\\)#(?P<frag>fnref?[A-Za-z0-9_-]+)\b")
URL_RE = re.compile(r"https?://[^\s)>]+")
SVG_FRAGMENT_RE = re.compile(r"url\(#(?P<frag>[A-Za-z][A-Za-z0-9_-]*)\)")
NUMERIC_FRAGMENT_RE = re.compile(r"(?<!\\)(?<!\w)#(?P<frag>\d+)(?=\b|])")
MIXED_ID_FRAGMENT_RE = re.compile(
    r"(?<!\\)(?<!\w)#(?P<frag>(?=[A-Za-z0-9-]*[A-Za-z])(?=[A-Za-z0-9-]*\d)[A-Za-z0-9-]+)\b"
)
CAMEL_FRAGMENT_RE = re.compile(r"(?<!\\)(?<!\w)#(?P<frag>[A-Z][A-Za-z0-9]+(?:[A-Z][A-Za-z0-9]+)+)\b")
INLINE_COMMENT_HASH_RE = re.compile(r"([:：])\s*#(?=[A-Za-z\u4e00-\u9fff])")
INLINE_LABEL_HASH_RE = re.compile(r"(?<=\s)#(?P<frag>[\u4e00-\u9fff][\w\u4e00-\u9fff]+)")
HEADING_RE = re.compile(r"^(\s{0,3}#{1,6})([^ #`].*)$")


@dataclass(slots=True)
class CleanResult:
    path: Path
    changed: bool
    replacements: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Clean accidental inline tags in an Obsidian vault.")
    parser.add_argument("--vault", required=True, type=Path, help="Absolute path to the Obsidian vault")
    parser.add_argument("--dry-run", action="store_true", help="Report changes without writing files")
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Only process the first N markdown files, 0 means all files",
    )
    return parser.parse_args()


def normalize_heading_spacing(line: str) -> tuple[str, int]:
    line_ending = ""
    if line.endswith("\r\n"):
        line_ending = "\r\n"
        content = line[:-2]
    elif line.endswith("\n"):
        line_ending = "\n"
        content = line[:-1]
    else:
        content = line

    match = HEADING_RE.match(content)
    if not match:
        return line, 0
    prefix, body = match.groups()
    stripped = body.strip()
    if looks_like_accidental_fragment(stripped):
        return line, 0
    if not looks_like_heading_text(stripped):
        return line, 0
    return f"{prefix} {body}{line_ending}", 1


def looks_like_accidental_fragment(text: str) -> bool:
    return any(
        pattern.fullmatch(text)
        for pattern in (
            re.compile(r"[0-9A-Fa-f]{3,8}"),
            re.compile(r"root/[A-Za-z0-9_-]+"),
            re.compile(r"fnref?[A-Za-z0-9_-]+"),
            re.compile(r"\d+"),
        )
    )


def looks_like_heading_text(text: str) -> bool:
    if not text:
        return False
    if re.search(r"[\u4e00-\u9fff]", text):
        return True
    return bool(re.search(r"\s", text))


def escape_url_fragment(match: re.Match[str]) -> str:
    url = match.group(0)
    if "#" not in url:
        return url
    head, tail = url.split("#", 1)
    head = head.rstrip("\\")
    return f"{head}\\#{tail}"


def clean_line(line: str) -> tuple[str, int]:
    cleaned = line
    replacements = 0

    cleaned, changed = normalize_heading_spacing(cleaned)
    replacements += changed

    cleaned, changed = URL_RE.subn(escape_url_fragment, cleaned)
    replacements += changed

    cleaned, changed = HEX_COLOR_RE.subn(r"\\#\g<hex>", cleaned)
    replacements += changed

    cleaned, changed = ROOT_FRAGMENT_RE.subn(r"\\#\g<frag>", cleaned)
    replacements += changed

    cleaned, changed = FOOTNOTE_FRAGMENT_RE.subn(r"\\#\g<frag>", cleaned)
    replacements += changed

    cleaned, changed = SVG_FRAGMENT_RE.subn(r"url(\\#\g<frag>)", cleaned)
    replacements += changed

    cleaned, changed = NUMERIC_FRAGMENT_RE.subn(r"\\#\g<frag>", cleaned)
    replacements += changed

    cleaned, changed = MIXED_ID_FRAGMENT_RE.subn(r"\\#\g<frag>", cleaned)
    replacements += changed

    cleaned, changed = CAMEL_FRAGMENT_RE.subn(r"\\#\g<frag>", cleaned)
    replacements += changed

    cleaned, changed = INLINE_COMMENT_HASH_RE.subn(r"\1 ", cleaned)
    replacements += changed

    cleaned, changed = INLINE_LABEL_HASH_RE.subn(r" \g<frag>", cleaned)
    replacements += changed

    return cleaned, replacements


def clean_note_text(text: str) -> tuple[str, int]:
    frontmatter = ""
    match = FRONTMATTER_RE.match(text)
    if match:
        frontmatter = match.group(0)
        text = text[match.end() :]

    lines = text.splitlines(keepends=True)
    output: list[str] = []
    in_fence = False
    replacements = 0

    for line in lines:
        if FENCE_RE.match(line):
            in_fence = not in_fence
            output.append(line)
            continue
        if in_fence:
            output.append(line)
            continue
        cleaned, changed = clean_line(line)
        output.append(cleaned)
        replacements += changed

    return frontmatter + "".join(output), replacements


def clean_file(path: Path, *, dry_run: bool) -> CleanResult:
    original = path.read_text(encoding="utf-8")
    cleaned, replacements = clean_note_text(original)
    changed = cleaned != original
    if changed and not dry_run:
        path.write_text(cleaned, encoding="utf-8")
    return CleanResult(path=path, changed=changed, replacements=replacements)


def iter_markdown_files(vault: Path, limit: int) -> list[Path]:
    files = sorted(vault.rglob("*.md"))
    if limit > 0:
        return files[:limit]
    return files


def main() -> int:
    args = parse_args()
    vault = args.vault.expanduser().resolve()
    if not vault.exists() or not vault.is_dir():
        raise SystemExit(f"Vault not found: {vault}")

    results = [clean_file(path, dry_run=args.dry_run) for path in iter_markdown_files(vault, args.limit)]
    changed = [result for result in results if result.changed]
    total_replacements = sum(result.replacements for result in changed)

    for result in changed:
        print(f"{result.path}: replacements={result.replacements}")

    print(
        f"processed={len(results)} changed={len(changed)} replacements={total_replacements} dry_run={args.dry_run}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
