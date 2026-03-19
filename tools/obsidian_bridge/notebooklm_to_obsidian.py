#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

if __package__ in {None, ""}:
    import sys

    sys.path.append(str(Path(__file__).resolve().parent))
    from common import (
        extract_conversation_id,
        prepend_frontmatter,
        sanitize_filename,
        unique_path,
        normalize_notebooklm_note,
    )
else:
    from .common import (
        extract_conversation_id,
        prepend_frontmatter,
        sanitize_filename,
        unique_path,
        normalize_notebooklm_note,
    )


ARTIFACT_CONFIG = {
    "audio": {"command": "audio", "suffix": ".m4a"},
    "video": {"command": "video", "suffix": ".mp4"},
    "slide_deck": {"command": "slide-deck", "suffix": ".pdf", "extra_args": ["--format", "pdf"]},
    "infographic": {"command": "infographic", "suffix": ".png"},
    "report": {"command": "report", "suffix": ".md", "markdown": True},
    "data_table": {"command": "data-table", "suffix": ".csv"},
    "quiz": {"command": "quiz", "suffix": ".md", "markdown": True, "extra_args": ["--format", "markdown"]},
    "flashcards": {
        "command": "flashcards",
        "suffix": ".md",
        "markdown": True,
        "extra_args": ["--format", "markdown"],
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export NotebookLM notes and artifacts into an Obsidian vault."
    )
    parser.add_argument("--notebook-id", help="NotebookLM notebook UUID")
    parser.add_argument(
        "--all-notebooks",
        action="store_true",
        help="Export all notebooks visible to the current NotebookLM profile",
    )
    parser.add_argument("--vault", required=True, help="Obsidian vault path")
    parser.add_argument(
        "--folder",
        default="Inbox/Imported/NotebookLM",
        help="Folder inside the vault where content will be written",
    )
    parser.add_argument(
        "--artifact-types",
        default="report,slide_deck,data_table,quiz,flashcards,infographic,audio,video",
        help="Comma-separated artifact types to download",
    )
    parser.add_argument("--artifact-id", action="append", default=[], help="Download only selected artifact IDs")
    parser.add_argument("--note-id", action="append", default=[], help="Export only selected note IDs")
    parser.add_argument("--skip-notes", action="store_true", help="Skip note export")
    parser.add_argument("--limit-notes", type=int, default=0, help="Limit exported notes for smoke testing")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    vault_root = Path(args.vault).expanduser().resolve()
    export_time = datetime.now(timezone.utc).isoformat(timespec="seconds")
    notebook_ids = resolve_notebook_ids(args)
    exported_notebooks = 0
    exported_notes_total = 0
    exported_artifacts_total = 0
    for notebook_id in notebook_ids:
        note_count, artifact_count, target_root = export_notebook(
            notebook_id=notebook_id,
            vault_root=vault_root,
            folder=args.folder,
            export_time=export_time,
            artifact_types={item.strip() for item in args.artifact_types.split(",") if item.strip()},
            wanted_artifact_ids=set(args.artifact_id),
            wanted_note_ids=set(args.note_id),
            skip_notes=args.skip_notes,
            limit_notes=args.limit_notes,
        )
        exported_notebooks += 1
        exported_notes_total += note_count
        exported_artifacts_total += artifact_count
        print(f"Notebook exported to {target_root}")
        print(f"Notes: {note_count}")
        print(f"Artifacts: {artifact_count}")

    print(f"Total notebooks exported: {exported_notebooks}")
    print(f"Total notes exported: {exported_notes_total}")
    print(f"Total artifacts exported: {exported_artifacts_total}")
    return 0


def export_notebook(
    notebook_id: str,
    vault_root: Path,
    folder: str,
    export_time: str,
    artifact_types: set[str],
    wanted_artifact_ids: set[str],
    wanted_note_ids: set[str],
    skip_notes: bool,
    limit_notes: int,
) -> tuple[int, int, Path]:
    notebook_meta = read_json("notebook", "get", notebook_id, "--json")
    notebook = notebook_meta["value"]
    notebook_title = notebook["title"]

    target_root = vault_root / folder / sanitize_filename(notebook_title, fallback=notebook_id)
    notes_root = target_root / "notes"
    artifacts_root = target_root / "artifacts"
    notes_root.mkdir(parents=True, exist_ok=True)
    artifacts_root.mkdir(parents=True, exist_ok=True)

    exported_notes: list[tuple[str, Path]] = []
    exported_note_ids: set[str] = set()
    if not skip_notes:
        note_payload = read_json("note", "list", notebook_id, "--json")
        notes = note_payload["notes"]
        if wanted_note_ids:
            notes = [note for note in notes if note["id"] in wanted_note_ids]
        if limit_notes > 0:
            notes = notes[:limit_notes]
        for note in notes:
            path = export_note(note, notes_root, notebook, export_time)
            exported_notes.append((note["title"], path))
            exported_note_ids.add(str(note["id"]))

    exported_artifacts: list[tuple[str, str, Path]] = []
    skipped_artifacts: list[dict[str, object]] = []
    if artifact_types:
        artifacts = read_json("studio", "status", notebook_id, "--json")
        for artifact in artifacts:
            artifact_type = artifact["type"]
            artifact_id = artifact["id"]
            if artifact["status"] != "completed":
                continue
            if wanted_artifact_ids and artifact_id not in wanted_artifact_ids:
                continue
            if artifact_type == "mind_map":
                skipped_artifacts.append(
                    {
                        "artifact_type": artifact_type,
                        "artifact_id": artifact_id,
                        "reason": "mind_map download is unsupported in current NotebookLM CLI; note export covers same content when note IDs exist",
                        "covered_by_note_export": artifact_id in exported_note_ids,
                    }
                )
                continue
            if artifact_type not in artifact_types or artifact_type not in ARTIFACT_CONFIG:
                continue
            path = export_artifact(
                notebook_id=notebook_id,
                notebook_title=notebook_title,
                export_time=export_time,
                artifact_id=artifact_id,
                artifact_type=artifact_type,
                artifacts_root=artifacts_root,
            )
            exported_artifacts.append((artifact_type, artifact_id, path))

    write_index(
        target_root=target_root,
        notebook=notebook,
        export_time=export_time,
        exported_notes=exported_notes,
        exported_artifacts=exported_artifacts,
        skipped_artifacts=skipped_artifacts,
    )
    return len(exported_notes), len(exported_artifacts), target_root


def export_note(note: dict[str, object], notes_root: Path, notebook: dict[str, object], export_time: str) -> Path:
    title = str(note.get("title") or "Untitled Note")
    content = normalize_notebooklm_note(title, str(note.get("content") or ""))
    metadata: dict[str, object] = {
        "obsidian_bridge": "notebooklm-note",
        "notebook_id": notebook["notebook_id"],
        "notebook_title": notebook["title"],
        "note_id": note["id"],
        "exported_at": export_time,
    }
    conversation_id = extract_conversation_id(content)
    if conversation_id:
        metadata["conversation_id"] = conversation_id
    output = unique_path(notes_root, title, ".md")
    output.write_text(prepend_frontmatter(content, metadata), encoding="utf-8")
    return output


def export_artifact(
    notebook_id: str,
    notebook_title: str,
    export_time: str,
    artifact_id: str,
    artifact_type: str,
    artifacts_root: Path,
) -> Path:
    config = ARTIFACT_CONFIG[artifact_type]
    artifact_dir = artifacts_root / artifact_type
    artifact_dir.mkdir(parents=True, exist_ok=True)
    file_stem = sanitize_filename(f"{artifact_type}-{artifact_id[:8]}", fallback=artifact_type)
    output = artifact_dir / f"{file_stem}{config['suffix']}"
    command = [
        str(repo_root() / "tools/notebooklm-mcp-cli/nlm-local.sh"),
        "download",
        config["command"],
        notebook_id,
        "--id",
        artifact_id,
        "--output",
        str(output),
    ]
    if artifact_type in {"audio", "video", "slide_deck", "infographic"}:
        command.append("--no-progress")
    command.extend(config.get("extra_args", []))
    run_command(command)
    if config.get("markdown"):
        metadata = {
            "obsidian_bridge": "notebooklm-artifact",
            "artifact_id": artifact_id,
            "artifact_type": artifact_type,
            "notebook_id": notebook_id,
            "notebook_title": notebook_title,
            "exported_at": export_time,
        }
        content = output.read_text(encoding="utf-8")
        output.write_text(prepend_frontmatter(content, metadata), encoding="utf-8")
    return output


def write_index(
    target_root: Path,
    notebook: dict[str, object],
    export_time: str,
    exported_notes: list[tuple[str, Path]],
    exported_artifacts: list[tuple[str, str, Path]],
    skipped_artifacts: list[dict[str, object]],
) -> None:
    lines = [
        f"# NotebookLM Export | {notebook['title']}",
        "",
        f"- Exported at: `{export_time}`",
        f"- notebook_id: `{notebook['notebook_id']}`",
        f"- source_count: `{notebook['source_count']}`",
        f"- NotebookLM URL: {notebook['url']}",
        f"- Notes exported: `{len(exported_notes)}`",
        f"- Artifacts exported: `{len(exported_artifacts)}`",
        "",
        "## Notes",
    ]
    if exported_notes:
        for title, path in exported_notes:
            rel = path.relative_to(target_root).as_posix().replace(" ", "%20")
            lines.append(f"- [{title}]({rel})")
    else:
        lines.append("- None")
    lines.extend(["", "## Artifacts"])
    if exported_artifacts:
        for artifact_type, artifact_id, path in exported_artifacts:
            rel = path.relative_to(target_root).as_posix().replace(" ", "%20")
            lines.append(f"- `{artifact_type}` `{artifact_id}` -> [{path.name}]({rel})")
    else:
        lines.append("- None")
    lines.extend(["", "## Skipped Artifacts"])
    if skipped_artifacts:
        for artifact in skipped_artifacts:
            lines.append(
                "- "
                f"`{artifact['artifact_type']}` `{artifact['artifact_id']}` | "
                f"covered_by_note_export=`{artifact['covered_by_note_export']}` | "
                f"{artifact['reason']}"
            )
    else:
        lines.append("- None")
    (target_root / "_index.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def resolve_notebook_ids(args: argparse.Namespace) -> list[str]:
    if args.all_notebooks:
        notebooks = read_json("notebook", "list", "--json")
        return [str(notebook["id"]) for notebook in notebooks]
    if args.notebook_id:
        return [args.notebook_id]
    raise SystemExit("Provide --notebook-id or --all-notebooks.")


def read_json(*args: str) -> object:
    raw = run_command([str(repo_root() / "tools/notebooklm-mcp-cli/nlm-local.sh"), *args])
    return json.loads(raw)


def run_command(command: list[str]) -> str:
    last_error: subprocess.CalledProcessError | None = None
    for attempt in range(3):
        try:
            completed = subprocess.run(
                command,
                cwd=repo_root(),
                check=True,
                capture_output=True,
                text=True,
            )
            return completed.stdout
        except subprocess.CalledProcessError as error:
            last_error = error
            if attempt == 2:
                raise
            time.sleep(1.0)
    raise last_error if last_error else RuntimeError("unreachable")


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


if __name__ == "__main__":
    raise SystemExit(main())
