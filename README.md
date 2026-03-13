# Link & Tag Intelligence

Native-first bilingual link and tag workflows for Obsidian.

## Features

- Preview-driven link insertion
- Block reference and line reference insertion
- Sidebar for current note, outlinks, backlinks, exact references, relations, tags, and unlinked mentions
- Native tag management and tag suggestion
- Optional desktop-only semantic bridge through an external CLI command

## Usage

After enabling the plugin, open the `Link & Tag Intelligence` sidebar from the ribbon or command palette.

Main actions:

- Insert link with preview
- Insert block reference
- Insert line reference
- Quick link selected text
- Add relation to current note
- Manage vault tags
- Suggest tags for current note
- Semantic search via external command

## Settings

- Plugin language
- Relation keys for frontmatter-based note relations
- Tag alias map JSON for bilingual matching
- Semantic bridge enable toggle, command, and timeout
- Recent link memory size

## Build

```bash
npm install --package-lock=false
npm run build
```

## Manual install

Copy these files into:

```text
<vault>/.obsidian/plugins/link-tag-intelligence/
```

- `manifest.json`
- `main.js`
- `styles.css`

## External semantic bridge

The semantic bridge is opt-in, desktop-only, and disabled by default. It runs a user-configured shell command and expects stdout JSON.

Supported placeholders inside the command string:

- `{{query}}`
- `{{vault}}`
- `{{file}}`
- `{{selection}}`

Each placeholder is shell-escaped before execution.

Expected JSON shape:

```json
{
  "results": [
    {
      "path": "Folder/Note.md",
      "title": "Note",
      "score": 0.91,
      "excerpt": "Relevant excerpt",
      "reason": "Matched by semantic retrieval",
      "suggested_tags": ["rag", "obsidian"],
      "suggested_relations": {
        "related": ["Other Note"]
      }
    }
  ]
}
```
