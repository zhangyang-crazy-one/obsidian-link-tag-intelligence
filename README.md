# Link & Tag Intelligence

Native-first bilingual link and tag workflows with preview-driven references and semantic bridge hooks.

## Features

- Preview-driven link insertion
- Block reference and line reference insertion
- Sidebar for current note, outlinks, backlinks, exact references, relations, tags, unlinked mentions, and semantic bridge status
- Research-oriented relation presets for literature review and drafting
- Citation-aware exact reference cards that surface note metadata such as citekey, author, year, source type, locator, and evidence kind
- Native tag management, bilingual tag suggestion, and research tag facet boosting
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

## Researcher workflow

This plugin works best as the linking and synthesis layer in a research vault:

1. Capture bibliographic data and annotations with a companion plugin such as Zotero Integration or PDF++.
2. Use exact references, typed relations, and controlled tags to connect source notes, evidence, and draft notes.
3. Use the sidebar to inspect backlinks, exact references, relation neighborhoods, and faceted tags while drafting.
4. Use the semantic bridge only when you want citation-aware retrieval from your own external toolchain.

Recommended frontmatter fields for literature notes:

```yaml
citekey: smith2024coffee
author: Smith
year: 2024
source_type: journal-article
page: 18
evidence_kind: quote
tags:
  - literature-review
  - experiment
  - draft
```

## Recommended companion plugins

`Link & Tag Intelligence` does not try to replace literature managers, PDF readers, or generic embedding search. The recommended stack is:

- `Zotero Integration`
  Use it for citekeys, literature-note metadata, and importing annotations from Zotero.
- `PDF++`
  Use it for page-aware PDF reading, highlights, and annotation-heavy source review.
- `Smart Connections`
  Use it if you want embeddings-based recall across the vault without rebuilding semantic infrastructure here.
- `External semantic bridge CLI`
  Use it when you want fully controlled, research-aware retrieval with citation metadata in the returned results.

## Research stack preset

The current research preset assumes a shallow vault layout so imports and evidence files stay stable:

- `Knowledge/Research/Literature`
- `Knowledge/Research/Templates/zotero-literature-note.md`
- `Knowledge/Research/Attachments`

Recommended companion plugin preset:

- `Zotero Integration`
  Import notes into `Knowledge/Research/Literature`, use `Knowledge/Research/Templates/zotero-literature-note.md` as the export template, and export annotation images into `Knowledge/Research/Attachments`.
- `PDF++`
  Keep page-aware quote and cite-callout copy commands available so PDF evidence can move directly into literature notes and draft notes.
- `Smart Connections`
  Keep local embeddings enabled, but exclude `.obsidian`, `.smart-env`, `Archive/Imports`, `Excalidraw`, and `note_reader` so archive and system folders do not pollute the semantic index.
- `Link & Tag Intelligence`
  Stay in `Researcher` mode, keep typed relations for source-to-claim links, and only enable the semantic bridge after an external CLI command is ready.

Recommended click path inside Obsidian:

1. Run `Zotero Integration: Import notes`.
2. Open the imported literature note in `Knowledge/Research/Literature`.
3. Open the source PDF and use a `PDF++` copy format for quote or cite-callout snippets.
4. Open the `Link & Tag Intelligence` sidebar to add typed relations and review bilingual tag recommendations.
5. Open `Smart Connections` when drafting and let local semantic recall surface related notes.

Research workbench inside this plugin:

1. Open `Settings -> Link & Tag Intelligence`.
2. Use `Sync research preset` to write the recommended config into installed companion plugins.
3. Use the `Workflow actions` section as the primary entry for Zotero import, Smart Connections, tag cleanup, and semantic search.
4. Use the `Companion stack` cards to see drift, apply only one plugin preset, or open that plugin's native settings when deeper tuning is needed.
5. Keep long JSON vocabularies under `Advanced taxonomy`, so the first screen remains an operational workbench instead of a documentation page.

## Suggested setup order

1. Set `Workflow mode` to `Researcher`.
2. Keep the default research relation keys unless you already use a custom ontology.
3. Fill in `Tag alias map JSON` for bilingual topic names and acronyms.
4. Fill in `Research tag facet map JSON` so the recommender knows your topic / method / dataset / status vocabulary.
5. Add literature-note frontmatter like `citekey`, `author`, `year`, `source_type`, `page`, and `evidence_kind`.
6. Only then enable the semantic bridge if you have an external command ready.

## Settings

- Plugin language
- Workflow mode
- Relation keys for frontmatter-based note relations
- Tag alias map JSON for bilingual matching
- Research tag facet map JSON for topic / method / dataset / status / writing-stage boosting
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

Recommended JSON shape:

```json
{
  "results": [
    {
      "path": "Folder/Note.md",
      "title": "Note",
      "score": 0.91,
      "excerpt": "Relevant excerpt",
      "reason": "Matched by semantic retrieval",
      "citekey": "smith2024coffee",
      "author": "Smith",
      "year": 2024,
      "page": "18",
      "source_type": "journal-article",
      "evidence_kind": "quote",
      "suggested_tags": ["literature-review", "experiment"],
      "suggested_relations": {
        "supports": ["Drafts/Coffee Extraction Argument.md"]
      }
    }
  ]
}
```

Only `path` is required. The rest of the research fields are optional but recommended because the plugin can surface them in semantic result cards and exact reference workflows.
