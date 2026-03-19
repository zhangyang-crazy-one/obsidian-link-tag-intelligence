# Obsidian Bridge

Utilities for moving real exports from `Trilium` and `NotebookLM` into an Obsidian vault.

## What This Covers

- `trilium_to_obsidian.py`
  - Input: a Trilium HTML export folder containing `index.html`, `navigation.html`, and `root/`
  - Output: either a Markdown tree, a raw preserved copy of the export, or both
- `notebooklm_to_obsidian.py`
  - Input: one NotebookLM notebook ID or all notebooks in the current profile
  - Output: NotebookLM notes plus selected generated artifacts inside an Obsidian vault
- `watch_notebooklm_artifacts.py`
  - Input: a JSON config describing artifact IDs, notebook IDs, and final output paths
  - Output: polls NotebookLM studio status and downloads artifacts automatically when they become ready
- `clean_obsidian_tags.py`
  - Input: an Obsidian vault path
  - Output: escapes accidental inline tags from imported HTML/CSS/JS and normalizes malformed headings

## Trilium HTML -> Obsidian

This script is built for the export shape found at:

- `/home/zhangyangrui/文档/my-private/My_paper/trilium笔记`

It converts the `div.ck-content` body from each HTML note into Markdown and copies linked assets.

Example:

```bash
python3 tools/obsidian_bridge/trilium_to_obsidian.py \
  --source "/home/zhangyangrui/文档/my-private/My_paper/trilium笔记" \
  --vault "/path/to/your/ObsidianVault"
```

Preserve the original HTML export unchanged:

```bash
python3 tools/obsidian_bridge/trilium_to_obsidian.py \
  --source "/home/zhangyangrui/文档/my-private/My_paper/trilium笔记" \
  --vault "/path/to/your/ObsidianVault" \
  --mode preserve
```

Do both:

```bash
python3 tools/obsidian_bridge/trilium_to_obsidian.py \
  --source "/home/zhangyangrui/文档/my-private/My_paper/trilium笔记" \
  --vault "/path/to/your/ObsidianVault" \
  --mode both
```

Optional fallback copy of the original HTML:

```bash
python3 tools/obsidian_bridge/trilium_to_obsidian.py \
  --source "/home/zhangyangrui/文档/my-private/My_paper/trilium笔记" \
  --vault "/path/to/your/ObsidianVault" \
  --keep-html
```

Current HTML coverage:

- headings, paragraphs, bold, italic, underline
- ordered/unordered/todo lists
- blockquotes
- code blocks and inline code
- tables
- images
- internal note links
- math spans such as `\( ... \)` and `\[ ... \]`

## NotebookLM -> Obsidian

This script reuses the project-local `tools/notebooklm-mcp-cli/nlm-local.sh`.

Example:

```bash
python3 tools/obsidian_bridge/notebooklm_to_obsidian.py \
  --notebook-id d08985e7-4292-49b2-8360-6948fec8ca22 \
  --vault "/path/to/your/ObsidianVault"
```

Export every notebook visible to the current NotebookLM profile:

```bash
python3 tools/obsidian_bridge/notebooklm_to_obsidian.py \
  --all-notebooks \
  --vault "/path/to/your/ObsidianVault"
```

Export only selected notes:

```bash
python3 tools/obsidian_bridge/notebooklm_to_obsidian.py \
  --notebook-id d08985e7-4292-49b2-8360-6948fec8ca22 \
  --vault "/path/to/your/ObsidianVault" \
  --note-id 64c28f75-9b92-48ab-a40f-0f4e59c226c0 \
  --note-id 9718b64d-23a7-4944-aca0-7adc93893038
```

Skip notes and only download generated artifacts:

```bash
python3 tools/obsidian_bridge/notebooklm_to_obsidian.py \
  --notebook-id b0b651bb-2be2-43aa-9ba5-647f86997bf1 \
  --vault "/path/to/your/ObsidianVault" \
  --skip-notes \
  --artifact-types slide_deck
```

## NotebookLM Artifact Watcher

When you already know the target `artifact_id` values and want them to land in fixed paths automatically, use the watcher instead of polling by hand.

Example config:

```json
{
  "profile": "default",
  "poll_interval_seconds": 20,
  "timeout_seconds": 3600,
  "jobs": [
    {
      "notebook_id": "41ea77d4-4871-4162-aec3-a25396f32c5a",
      "artifact_id": "465e92c4-ce69-4cd2-a268-82b482ce884f",
      "artifact_type": "slide_deck",
      "output_path": "/absolute/path/to/vault/Topic.assets/topic-slides.pdf",
      "slide_deck_format": "pdf"
    },
    {
      "notebook_id": "41ea77d4-4871-4162-aec3-a25396f32c5a",
      "artifact_id": "c216a3bb-29f3-4e73-ab7f-8dea7d37849c",
      "artifact_type": "infographic",
      "output_path": "/absolute/path/to/vault/Topic.assets/topic-infographic.png"
    }
  ]
}
```

Foreground mode:

```bash
python3 tools/obsidian_bridge/watch_notebooklm_artifacts.py \
  --config tools/obsidian_bridge/notebooklm_artifact_watch.example.json
```

Detached background mode:

```bash
python3 tools/obsidian_bridge/watch_notebooklm_artifacts.py \
  --config /absolute/path/to/watch.json \
  --detach
```

Detached mode prints:

- `pid`
- `state_file`
- `log_file`

Watcher behavior:

- polls `studio status`
- waits for `status=completed`
- downloads directly to the configured `output_path`
- writes progress into a sidecar `.state.json`
- writes detached stdout/stderr into a sidecar `.log`

## Output Layout

Both scripts write into a vault subfolder:

```text
Inbox/Imported/
  Trilium/<export-name>/
  NotebookLM/<notebook-title>/
```

Each import also writes an index note:

- `_trilium_import.md`
- `_index.md`

## Clean Accidental Tags

If imported notes contain CSS colors, broken fragment links, or malformed headings that Obsidian indexes as tags, run:

```bash
python3 tools/obsidian_bridge/clean_obsidian_tags.py \
  --vault "/absolute/path/to/ObsidianVault"
```

Preview only:

```bash
python3 tools/obsidian_bridge/clean_obsidian_tags.py \
  --vault "/absolute/path/to/ObsidianVault" \
  --dry-run
```

## NotebookLM Artifact Notes

- Supported direct artifact downloads: `slide_deck`, `report`, `data_table`, `quiz`, `flashcards`, `infographic`, `audio`, `video`
- `mind_map` currently does not have a working direct download path in the NotebookLM CLI used here
- In practice, current `mind_map` artifact IDs overlap with NotebookLM note IDs, so exporting notes already preserves that content in Markdown
