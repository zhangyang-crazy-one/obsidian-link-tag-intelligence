#!/usr/bin/env python3
from __future__ import annotations

import argparse
import html
import posixpath
import re
import shutil
from dataclasses import dataclass, field
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from typing import Iterable
from urllib.parse import unquote, urlsplit, urlunsplit

if __package__ in {None, ""}:
    import sys

    sys.path.append(str(Path(__file__).resolve().parent))
    from common import prepend_frontmatter, sanitize_filename
else:
    from .common import prepend_frontmatter, sanitize_filename


VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source"}
BLOCK_TAGS = {
    "blockquote",
    "div",
    "figure",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "li",
    "ol",
    "p",
    "pre",
    "section",
    "table",
    "thead",
    "tbody",
    "tr",
    "ul",
}
LINK_PATTERN = re.compile(r"(!?\[[^\]]*]\()([^)]+)(\))")
ATTR_PATTERN = re.compile(r'((?:href|src)=")([^"]+)(")')


@dataclass
class Node:
    tag: str
    attrs: dict[str, str] = field(default_factory=dict)
    children: list["Node"] = field(default_factory=list)
    text: str = ""


class MiniHTMLTree(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.root = Node("root")
        self.stack = [self.root]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        node = Node(tag.lower(), {key: value or "" for key, value in attrs})
        self.stack[-1].children.append(node)
        if tag.lower() not in VOID_TAGS:
            self.stack.append(node)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        node = Node(tag.lower(), {key: value or "" for key, value in attrs})
        self.stack[-1].children.append(node)

    def handle_endtag(self, tag: str) -> None:
        lowered = tag.lower()
        while len(self.stack) > 1:
            node = self.stack.pop()
            if node.tag == lowered:
                break

    def handle_data(self, data: str) -> None:
        if data:
            self.stack[-1].children.append(Node("#text", text=data))

    def handle_entityref(self, name: str) -> None:
        self.handle_data(html.unescape(f"&{name};"))

    def handle_charref(self, name: str) -> None:
        self.handle_data(html.unescape(f"&#{name};"))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Convert a Trilium HTML export folder into an Obsidian-friendly Markdown tree."
    )
    parser.add_argument("--source", required=True, help="Trilium HTML export directory")
    parser.add_argument("--vault", required=True, help="Obsidian vault path")
    parser.add_argument(
        "--folder",
        default="Inbox/Imported/Trilium",
        help="Folder inside the vault where converted notes will be written",
    )
    parser.add_argument(
        "--mode",
        choices=("convert", "preserve", "both"),
        default="convert",
        help="convert: HTML to Markdown, preserve: copy original export unchanged, both: do both",
    )
    parser.add_argument(
        "--keep-html",
        action="store_true",
        help="Copy original HTML files alongside converted Markdown for fallback review",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    source_root = Path(args.source).expanduser().resolve()
    if not source_root.is_dir():
        raise SystemExit(f"Source path is not a directory: {source_root}")
    if not (source_root / "root").exists():
        raise SystemExit("Expected a Trilium export root containing a 'root/' directory.")

    vault_root = Path(args.vault).expanduser().resolve()
    target_root = vault_root / args.folder / sanitize_filename(source_root.name, fallback="trilium-export")
    target_root.mkdir(parents=True, exist_ok=True)

    export_time = datetime.now(timezone.utc).isoformat(timespec="seconds")
    converted = 0
    copied_assets = 0
    if args.mode in {"convert", "both"}:
        convert_root = target_root if args.mode == "convert" else target_root / "converted"
        convert_root.mkdir(parents=True, exist_ok=True)
        path_map = build_path_map(source_root)
        converted, copied_assets = run_convert_import(
            source_root=source_root,
            target_root=convert_root,
            export_time=export_time,
            keep_html=args.keep_html,
            path_map=path_map,
        )

    preserved_files = 0
    if args.mode in {"preserve", "both"}:
        preserve_root = target_root / "raw_export"
        preserved_files = run_preserve_import(source_root, preserve_root)

    write_import_report(
        target_root=target_root,
        source_root=source_root,
        export_time=export_time,
        converted=converted,
        copied_assets=copied_assets,
        keep_html=args.keep_html,
        mode=args.mode,
        preserved_files=preserved_files,
    )
    print(f"Trilium export imported to {target_root}")
    print(f"Converted HTML notes: {converted}")
    print(f"Copied assets: {copied_assets}")
    print(f"Preserved raw files: {preserved_files}")
    return 0


def run_convert_import(
    source_root: Path,
    target_root: Path,
    export_time: str,
    keep_html: bool,
    path_map: dict[PurePosixPath, PurePosixPath],
) -> tuple[int, int]:
    converted = 0
    copied_assets = 0
    for source_path, destination_path in path_map.items():
        full_source = source_root / source_path
        full_destination = target_root / destination_path
        full_destination.parent.mkdir(parents=True, exist_ok=True)
        if source_path.suffix.lower() == ".html":
            if source_path.name in {"index.html", "navigation.html"}:
                continue
            markdown = convert_html_page(
                source_root=source_root,
                target_root=target_root,
                source_path=source_path,
                destination_path=destination_path,
                export_time=export_time,
                keep_html=keep_html,
                path_map=path_map,
            )
            full_destination.write_text(markdown, encoding="utf-8")
            converted += 1
            if keep_html:
                html_destination = full_destination.with_suffix(".html")
                shutil.copy2(full_source, html_destination)
        else:
            if source_path.name in {"!!!meta.json", "root_grid.json", "style.css"}:
                continue
            shutil.copy2(full_source, full_destination)
            copied_assets += 1
    return converted, copied_assets


def run_preserve_import(source_root: Path, preserve_root: Path) -> int:
    if preserve_root.exists():
        shutil.rmtree(preserve_root)
    shutil.copytree(source_root, preserve_root)
    return sum(1 for path in preserve_root.rglob("*") if path.is_file())


def build_path_map(source_root: Path) -> dict[PurePosixPath, PurePosixPath]:
    mapping: dict[PurePosixPath, PurePosixPath] = {}

    def sanitized_rel(path: Path) -> PurePosixPath:
        parts = [sanitize_filename(part, fallback="untitled") for part in path.parts]
        return PurePosixPath(*parts)

    for path in sorted(source_root.rglob("*")):
        if path.is_dir():
            continue
        rel = PurePosixPath(path.relative_to(source_root).as_posix())
        if rel.suffix.lower() == ".html":
            mapping[rel] = sanitized_rel(Path(*rel.parts)).with_suffix(".md")
        else:
            mapping[rel] = sanitized_rel(Path(*rel.parts))
    return mapping


def convert_html_page(
    source_root: Path,
    target_root: Path,
    source_path: PurePosixPath,
    destination_path: PurePosixPath,
    export_time: str,
    keep_html: bool,
    path_map: dict[PurePosixPath, PurePosixPath],
) -> str:
    raw_html = (source_root / source_path).read_text(encoding="utf-8", errors="ignore")
    tree = MiniHTMLTree()
    tree.feed(raw_html)
    content_root = find_ck_content(tree.root) or tree.root
    body = render_children(content_root.children, source_path, destination_path, path_map).strip()
    title = extract_title(tree.root, source_path.stem)
    if not body.startswith(f"# {title}"):
        body = f"# {title}\n\n{body}" if body else f"# {title}"
    body = rewrite_links(body, source_path, destination_path, path_map)
    metadata = {
        "obsidian_bridge": "trilium-html",
        "source_html": source_path.as_posix(),
        "exported_at": export_time,
    }
    if keep_html:
        metadata["original_html_copy"] = destination_path.with_suffix(".html").name
    return prepend_frontmatter(f"{body.rstrip()}\n", metadata)


def find_ck_content(node: Node) -> Node | None:
    if node.tag == "div" and "ck-content" in node.attrs.get("class", "").split():
        return node
    for child in node.children:
        found = find_ck_content(child)
        if found:
            return found
    return None


def extract_title(node: Node, fallback: str) -> str:
    for child in walk(node):
        if child.tag == "title":
            text = flatten_text(child).strip()
            if text:
                return text
    return sanitize_filename(fallback, fallback="Untitled Note", max_length=200)


def walk(node: Node) -> Iterable[Node]:
    yield node
    for child in node.children:
        yield from walk(child)


def render_children(
    nodes: list[Node],
    source_path: PurePosixPath,
    destination_path: PurePosixPath,
    path_map: dict[PurePosixPath, PurePosixPath],
    list_depth: int = 0,
) -> str:
    parts = []
    for node in nodes:
        rendered = render_node(node, source_path, destination_path, path_map, list_depth=list_depth)
        if rendered:
            parts.append(rendered)
    return "".join(parts)


def render_node(
    node: Node,
    source_path: PurePosixPath,
    destination_path: PurePosixPath,
    path_map: dict[PurePosixPath, PurePosixPath],
    list_depth: int = 0,
) -> str:
    if node.tag == "#text":
        return collapse_inline_text(node.text)
    if node.tag in {"html", "body", "div", "section"}:
        return render_block(render_children(node.children, source_path, destination_path, path_map, list_depth))
    if node.tag.startswith("h") and len(node.tag) == 2 and node.tag[1].isdigit():
        level = int(node.tag[1])
        text = render_inline(node.children, source_path, destination_path, path_map).strip()
        return f"{'#' * level} {text}\n\n" if text else ""
    if node.tag == "p":
        text = render_inline(node.children, source_path, destination_path, path_map).strip()
        return f"{text}\n\n" if text else "\n"
    if node.tag in {"ul", "ol"}:
        return render_list(node, source_path, destination_path, path_map, list_depth)
    if node.tag == "blockquote":
        inner = render_children(node.children, source_path, destination_path, path_map, list_depth).strip()
        lines = [f"> {line}".rstrip() if line else ">" for line in inner.splitlines()]
        return "\n".join(lines).rstrip() + "\n\n"
    if node.tag == "pre":
        return render_code_block(node) + "\n\n"
    if node.tag == "figure":
        if any(child.tag == "table" for child in node.children):
            table = next(child for child in node.children if child.tag == "table")
            body = render_table(table, source_path, destination_path, path_map)
            caption = next((child for child in node.children if child.tag == "figcaption"), None)
            if caption:
                caption_text = render_inline(caption.children, source_path, destination_path, path_map).strip()
                if caption_text:
                    body += f"\n*{caption_text}*\n"
            return body + "\n"
        return render_block(render_children(node.children, source_path, destination_path, path_map, list_depth))
    if node.tag == "table":
        return render_table(node, source_path, destination_path, path_map) + "\n"
    if node.tag == "hr":
        return "---\n\n"
    if node.tag == "img":
        target = node.attrs.get("src", "").strip()
        if not target:
            return ""
        alt = node.attrs.get("alt", "")
        return f"![{alt}]({target})"
    if node.tag == "span" and "math-tex" in node.attrs.get("class", "").split():
        return flatten_text(node)
    if node.tag == "br":
        return "\n"
    if node.tag in {"thead", "tbody", "tr"}:
        return render_children(node.children, source_path, destination_path, path_map, list_depth)
    return render_inline([node], source_path, destination_path, path_map)


def render_inline(
    nodes: list[Node],
    source_path: PurePosixPath,
    destination_path: PurePosixPath,
    path_map: dict[PurePosixPath, PurePosixPath],
) -> str:
    parts = []
    for node in nodes:
        if node.tag == "#text":
            parts.append(collapse_inline_text(node.text))
            continue
        if node.tag == "strong":
            parts.append(f"**{render_inline(node.children, source_path, destination_path, path_map).strip()}**")
            continue
        if node.tag == "em":
            parts.append(f"*{render_inline(node.children, source_path, destination_path, path_map).strip()}*")
            continue
        if node.tag == "u":
            parts.append(f"<u>{render_inline(node.children, source_path, destination_path, path_map).strip()}</u>")
            continue
        if node.tag == "code":
            text = flatten_text(node).strip()
            parts.append(f"`{text}`" if text else "")
            continue
        if node.tag == "a":
            href = node.attrs.get("href", "").strip()
            text = render_inline(node.children, source_path, destination_path, path_map).strip() or href
            parts.append(f"[{text}]({href})" if href else text)
            continue
        if node.tag == "img":
            src = node.attrs.get("src", "").strip()
            alt = node.attrs.get("alt", "")
            parts.append(f"![{alt}]({src})" if src else "")
            continue
        if node.tag == "span" and "math-tex" in node.attrs.get("class", "").split():
            parts.append(flatten_text(node))
            continue
        if node.tag == "br":
            parts.append("\n")
            continue
        if node.tag in BLOCK_TAGS:
            parts.append(render_node(node, source_path, destination_path, path_map).strip())
            continue
        parts.append(render_inline(node.children, source_path, destination_path, path_map))
    return normalize_spacing("".join(parts))


def render_list(
    node: Node,
    source_path: PurePosixPath,
    destination_path: PurePosixPath,
    path_map: dict[PurePosixPath, PurePosixPath],
    list_depth: int,
) -> str:
    lines = []
    index = 1
    is_todo = "todo-list" in node.attrs.get("class", "")
    for child in node.children:
        if child.tag != "li":
            continue
        marker = f"{index}. " if node.tag == "ol" and not is_todo else "- "
        if is_todo:
            checked = any(grand.tag == "input" and grand.attrs.get("checked") == "checked" for grand in walk(child))
            marker = "- [x] " if checked else "- [ ] "
        item_lines = render_list_item(child, source_path, destination_path, path_map, list_depth + 1)
        if item_lines:
            indent = "  " * list_depth
            first, *rest = item_lines
            lines.append(f"{indent}{marker}{first}")
            for line in rest:
                lines.append(f"{indent}  {line}")
        index += 1
    return "\n".join(lines).rstrip() + "\n\n" if lines else ""


def render_list_item(
    node: Node,
    source_path: PurePosixPath,
    destination_path: PurePosixPath,
    path_map: dict[PurePosixPath, PurePosixPath],
    list_depth: int,
) -> list[str]:
    parts: list[str] = []
    nested: list[str] = []
    for child in node.children:
        if child.tag in {"ul", "ol"}:
            nested.append(render_list(child, source_path, destination_path, path_map, list_depth).rstrip())
        elif child.tag == "label":
            text = render_inline(child.children, source_path, destination_path, path_map).strip()
            if text:
                parts.append(text)
        else:
            rendered = render_inline([child], source_path, destination_path, path_map).strip()
            if rendered:
                parts.append(rendered)
    lines = [" ".join(part for part in parts if part).strip()] if parts else [""]
    for block in nested:
        lines.extend(block.splitlines())
    return [line for line in lines if line]


def render_code_block(node: Node) -> str:
    code_node = next((child for child in node.children if child.tag == "code"), None)
    if code_node:
        raw = flatten_text(code_node)
        language = infer_language(code_node.attrs.get("class", ""))
    else:
        raw = flatten_text(node)
        language = ""
    return f"```{language}\n{raw.strip()}\n```".rstrip()


def infer_language(class_name: str) -> str:
    if not class_name.startswith("language-"):
        return ""
    language = class_name.removeprefix("language-")
    for prefix in ("application-", "text-x-"):
        if language.startswith(prefix):
            language = language[len(prefix) :]
    if language.endswith("-env-frontend"):
        language = language.removesuffix("-env-frontend")
    if language == "trilium-auto":
        return "text"
    return language


def render_table(
    node: Node,
    source_path: PurePosixPath,
    destination_path: PurePosixPath,
    path_map: dict[PurePosixPath, PurePosixPath],
) -> str:
    rows = []
    for row in [child for child in walk(node) if child.tag == "tr"]:
        cells = []
        for cell in row.children:
            if cell.tag not in {"th", "td"}:
                continue
            cells.append(render_inline(cell.children, source_path, destination_path, path_map).strip().replace("\n", "<br>") or " ")
        if cells:
            rows.append(cells)
    if not rows:
        return ""
    width = max(len(row) for row in rows)
    rows = [row + [" "] * (width - len(row)) for row in rows]
    header = rows[0]
    separator = ["---"] * width
    body_rows = rows[1:] if len(rows) > 1 else []
    lines = [
        "| " + " | ".join(header) + " |",
        "| " + " | ".join(separator) + " |",
    ]
    lines.extend("| " + " | ".join(row) + " |" for row in body_rows)
    return "\n".join(lines)


def flatten_text(node: Node) -> str:
    if node.tag == "#text":
        return html.unescape(node.text)
    return "".join(flatten_text(child) for child in node.children)


def render_block(text: str) -> str:
    text = text.strip()
    return f"{text}\n\n" if text else ""


def collapse_inline_text(text: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(text.replace("\xa0", " ")))


def normalize_spacing(text: str) -> str:
    text = text.replace(" \n", "\n").replace("\n ", "\n")
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


def rewrite_links(
    content: str,
    source_path: PurePosixPath,
    destination_path: PurePosixPath,
    path_map: dict[PurePosixPath, PurePosixPath],
) -> str:
    def replace_target(target: str) -> str:
        split = urlsplit(target)
        if split.scheme or split.netloc or target.startswith("#"):
            return target
        normalized_target = resolve_target(source_path, split.path, path_map)
        if not normalized_target:
            return target
        resolved = relative_destination(destination_path, normalized_target)
        return urlunsplit(("", "", resolved, split.query, split.fragment))

    content = LINK_PATTERN.sub(lambda match: f"{match.group(1)}{replace_target(match.group(2))}{match.group(3)}", content)
    content = ATTR_PATTERN.sub(lambda match: f'{match.group(1)}{replace_target(match.group(2))}{match.group(3)}', content)
    return content


def resolve_target(
    source_path: PurePosixPath,
    raw_target: str,
    path_map: dict[PurePosixPath, PurePosixPath],
) -> PurePosixPath | None:
    decoded = PurePosixPath(unquote(raw_target))
    if decoded.is_absolute():
        candidate = PurePosixPath(decoded.as_posix().lstrip("/"))
    else:
        candidate = PurePosixPath(posixpath.normpath(str(source_path.parent / decoded)))
    variants = [candidate]
    if candidate.suffix == "":
        variants.append(candidate.with_suffix(".html"))
    for variant in variants:
        if variant in path_map:
            return path_map[variant]
    return None


def relative_destination(current_destination: PurePosixPath, target_destination: PurePosixPath) -> str:
    current_parts = list(current_destination.parent.parts)
    target_parts = list(target_destination.parts)
    while current_parts and target_parts and current_parts[0] == target_parts[0]:
        current_parts.pop(0)
        target_parts.pop(0)
    pieces = [".."] * len(current_parts) + target_parts
    if not pieces:
        return "."
    return "/".join(part.replace(" ", "%20") for part in pieces)


def write_import_report(
    target_root: Path,
    source_root: Path,
    export_time: str,
    converted: int,
    copied_assets: int,
    keep_html: bool,
    mode: str,
    preserved_files: int,
) -> None:
    lines = [
        f"# Trilium Import | {source_root.name}",
        "",
        f"- Imported at: `{export_time}`",
        f"- Source: `{source_root}`",
        f"- Mode: `{mode}`",
        f"- Converted HTML notes: `{converted}`",
        f"- Copied assets: `{copied_assets}`",
        f"- Preserved raw files: `{preserved_files}`",
        f"- Original HTML copies kept: `{keep_html}`",
        "",
        "## Notes",
        "- This import was generated from Trilium HTML export, not Markdown export.",
        "- `convert` rewrites internal `.html` links to `.md` where a matching converted note exists.",
        "- `preserve` copies the original export unchanged into `raw_export/`.",
        "- Images, PDFs, SVGs and JSON attachments are copied with the folder structure preserved.",
        "- If a page relied on custom Trilium HTML or CSS, the converted Markdown may still need hand cleanup.",
    ]
    (target_root / "_trilium_import.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
