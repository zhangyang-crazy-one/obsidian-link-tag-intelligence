# Link & Tag Intelligence

Native-first bilingual linking, tagging, and research-note workflows for an Obsidian vault.

The plugin is now designed around a CLI-first ingestion model:

- the plugin handles display, triggering, preview, tags, and relations
- an external shell JSON CLI handles DOI, arXiv, and PDF ingestion
- Zotero remains optional for users who already maintain a Zotero library

## Features

- Preview-driven link insertion
- Block reference and line reference insertion
- Sidebar for current note, outlinks, backlinks, exact references, relations, tags, unlinked mentions, ingestion status, and semantic bridge status
- Typed research relations for literature review and drafting
- Citation-aware metadata pills for citekey, author, year, source type, locator, and evidence kind
- Native tag management and bilingual tag suggestions
- External ingestion CLI for DOI, arXiv, and PDF capture with OpenAlex citation enrichment
- Optional external semantic bridge for retrieval

## Plugin Workflow

After enabling the plugin, open the `Link & Tag Intelligence` sidebar from the ribbon or command palette.

Main actions:

- `Ingest research source`
- `Insert link with preview`
- `Insert block reference`
- `Insert line reference`
- `Quick link selected text`
- `Add relation to current note`
- `Manage vault tags`
- `Suggest tags for current note`
- `Semantic search via external command`

Recommended research flow:

1. Run the ingestion CLI from the plugin to create a literature note from a DOI, arXiv ID, or PDF.
2. Open the source PDF and use `PDF++` for page-aware evidence capture.
3. Use this plugin to add exact references, typed relations, and controlled tags.
4. Use the semantic bridge only when you want retrieval from your own external search toolchain.

## Ingestion CLI

The repository ships a local CLI at [cli/lti-research.mjs](/home/zhangyangrui/my_programes/obsidian-link-tag-intelligence/cli/lti-research.mjs).

It supports five top-level commands plus a reference utility family:

- `search`: query arXiv and return candidate papers
- `resolve`: fetch metadata only
- `ingest`: create a literature note and optional attachment copy
- `paper`: build a topic note, analysis notes, matrix, map, outline, and draft
- `inspect`: inspect a created note inside a vault
- `ref inspect` / `ref locate` / `ref format`: inspect an exact line span, locate a line or paragraph from a snippet, and generate a line or block reference for agents

When a source has a DOI, the CLI enriches it through OpenAlex. That applies to:

- direct DOI ingestion
- arXiv entries that expose a DOI
- PDFs imported with `--metadata-doi`

OpenAlex-enriched fields include:

- `openalex_id`
- `cited_by_count`
- `referenced_works`
- `related_works`
- `concepts`
- `counts_by_year`
- `publication_date`
- `source_display_name`

Run help:

```bash
node cli/lti-research.mjs --help
```

### Source inputs

You can select a source in either of these forms:

```bash
--source-type doi --source 10.1145/...
--source-type arxiv --source 2403.01234
--source-type pdf --source /path/to/paper.pdf
```

Or use convenience flags:

```bash
--doi 10.1145/...
--arxiv 2403.01234
--pdf /path/to/paper.pdf
```

### Resolve examples

```bash
node cli/lti-research.mjs resolve --doi 10.1145/123456.7890
node cli/lti-research.mjs resolve --arxiv 2403.01234
node cli/lti-research.mjs resolve --pdf ./papers/coffee.pdf --metadata-doi 10.1145/123456.7890
```

### Search examples

```bash
node cli/lti-research.mjs search \
  --query "data governance digital transformation" \
  --max-results 10
```

### Ingest examples

```bash
node cli/lti-research.mjs ingest \
  --doi 10.1145/123456.7890 \
  --vault /path/to/vault

node cli/lti-research.mjs ingest \
  --arxiv 2403.01234 \
  --vault /path/to/vault \
  --literature-folder Knowledge/Research/Literature \
  --attachments-folder Knowledge/Research/Attachments

node cli/lti-research.mjs ingest \
  --pdf ./papers/coffee.pdf \
  --metadata-doi 10.1145/123456.7890 \
  --vault /path/to/vault \
  --download-pdf true
```

### Paper workflow examples

Build a paper workspace from explicit source specs:

```bash
node cli/lti-research.mjs paper \
  --topic "数据治理和数智转型" \
  --vault /path/to/vault \
  --sources "arxiv:1706.03762,arxiv:2403.01234,pdf:/absolute/path/to/local-paper.pdf" \
  --max-sources 3
```

Or let the CLI search arXiv first and auto-ingest the top results:

```bash
node cli/lti-research.mjs paper \
  --topic "数据治理和数智转型" \
  --query "data governance digital transformation" \
  --vault /path/to/vault \
  --max-sources 3
```

Generated notes:

- topic note in `Knowledge/Research/Topics`
- per-paper analysis notes in `Knowledge/Research/Analysis`
- comparison matrix and literature map in `Knowledge/Research/Analysis`
- outline and draft in `Knowledge/Research/Drafts`
- literature notes and workflow outputs include OpenAlex citation statistics when DOI metadata is available

### Inspect example

```bash
node cli/lti-research.mjs inspect \
  --vault /path/to/vault \
  --note-path Knowledge/Research/Literature/doi-10-1145-123456-7890.md
```

### Reference examples

Inspect an exact evidence span before writing:

```bash
node cli/lti-research.mjs ref inspect \
  --vault /path/to/vault \
  --note-path Knowledge/Research/Literature/doi-10-1093-polsoc-puaf001.md \
  --start-line 20 \
  --end-line 24
```

Locate paragraph-level evidence candidates from a snippet before choosing one:

```bash
node cli/lti-research.mjs ref locate \
  --vault /path/to/vault \
  --note-path Knowledge/Research/Literature/doi-10-1093-polsoc-puaf001.md \
  --query "the data governance program must balance control and reuse" \
  --scope paragraph
```

Generate a legacy line reference for an agent to insert into an analysis or draft:

```bash
node cli/lti-research.mjs ref format \
  --vault /path/to/vault \
  --note-path Knowledge/Research/Literature/doi-10-1093-polsoc-puaf001.md \
  --kind line \
  --start-line 20 \
  --end-line 24
```

Generate a reference directly from a unique snippet match instead of hand-counting lines:

```bash
node cli/lti-research.mjs ref format \
  --vault /path/to/vault \
  --note-path Knowledge/Research/Literature/doi-10-1093-polsoc-puaf001.md \
  --kind line \
  --query "the data governance program must balance control and reuse" \
  --scope paragraph
```

Generate the plugin's legacy block-style line-range reference:

```bash
node cli/lti-research.mjs ref format \
  --vault /path/to/vault \
  --note-path Knowledge/Research/Literature/doi-10-1093-polsoc-puaf001.md \
  --kind block \
  --start-line 20 \
  --end-line 24
```

## Plugin Command Configuration

Set the plugin's `Ingestion command` setting to a shell command that calls the CLI and returns JSON on stdout.

Example:

```bash
node /absolute/path/to/obsidian-link-tag-intelligence/cli/lti-research.mjs ingest \
  --source-type {{source_type}} \
  --source {{source}} \
  --vault {{vault}} \
  --literature-folder {{literature}} \
  --attachments-folder {{attachments}} \
  --template-path {{template}} \
  --metadata-doi {{metadata_doi}} \
  --metadata-arxiv {{metadata_arxiv}} \
  --title {{title}} \
  --authors {{authors}} \
  --year {{year}} \
  --download-pdf {{download_pdf}}
```

Supported ingestion placeholders:

- `{{source_type}}`
- `{{source}}`
- `{{vault}}`
- `{{file}}`
- `{{selection}}`
- `{{literature}}`
- `{{attachments}}`
- `{{template}}`
- `{{metadata_doi}}`
- `{{metadata_arxiv}}`
- `{{title}}`
- `{{authors}}`
- `{{year}}`
- `{{download_pdf}}`

Each placeholder is shell-escaped before execution.

## Agent Usage

This design is intended to work well with Codex, Claude Code, or any other shell-capable coding agent.

Examples:

```bash
node cli/lti-research.mjs resolve --doi 10.1145/123456.7890

node cli/lti-research.mjs ingest \
  --pdf ./papers/coffee.pdf \
  --metadata-arxiv 2403.01234 \
  --vault /path/to/vault

node cli/lti-research.mjs paper \
  --topic "数据治理和数智转型" \
  --vault /path/to/vault \
  --sources "arxiv:1706.03762,arxiv:2403.01234"
```

The contract is simple:

- input through shell flags
- stdout as JSON
- validation errors returned as JSON with a non-zero exit code
- unexpected runtime errors on stderr
- non-zero exit code on failure

No MCP layer is required for the ingestion path.

## Output Shape

Typical `ingest` output:

```json
{
  "status": "created",
  "source_type": "doi",
  "source_id": "10.1145/123456.7890",
  "title": "Coffee Extraction Dynamics",
  "note_path": "Knowledge/Research/Literature/doi-10-1145-123456-7890.md",
  "attachment_paths": [
    "Knowledge/Research/Attachments/doi-10-1145-123456-7890.pdf"
  ],
  "warnings": [],
  "metadata": {
    "entry_type": "journal-article",
    "citekey": "smith2024coffee",
    "openalex_id": "https://openalex.org/W1234567890",
    "cited_by_count": 12,
    "referenced_works_count": 24,
    "related_works_count": 10,
    "concepts": ["Data governance", "Digital transformation"]
  }
}
```

Typical `inspect` output:

```json
{
  "status": "ok",
  "note_path": "Knowledge/Research/Literature/doi-10-1145-123456-7890.md",
  "attachment_exists": true,
  "frontmatter": {
    "title": "Coffee Extraction Dynamics",
    "source_type": "doi",
    "entry_type": "journal-article",
    "openalex_id": "https://openalex.org/W1234567890",
    "cited_by_count": 12,
    "concepts": ["Data governance", "Digital transformation"]
  }
}
```

Typical `paper` output:

```json
{
  "status": "created",
  "topic": "数据治理和数智转型",
  "source_count": 3,
  "topic_note_path": "Knowledge/Research/Topics/topic-abc123.md",
  "matrix_note_path": "Knowledge/Research/Analysis/topic-abc123-comparison-matrix.md",
  "map_note_path": "Knowledge/Research/Analysis/topic-abc123-literature-map.md",
  "outline_note_path": "Knowledge/Research/Drafts/topic-abc123-outline.md",
  "draft_note_path": "Knowledge/Research/Drafts/topic-abc123-draft.md"
}
```

## Literature Note Frontmatter

Generated notes include fields such as:

```yaml
title: "Coffee Extraction Dynamics"
authors:
  - "Jane Smith"
  - "Alex Lee"
author: "Jane Smith, Alex Lee"
year: "2024"
source_id: "10.1145/123456.7890"
source_type: "doi"
entry_type: "journal-article"
citekey: "smith2024coffee"
openalex_id: "https://openalex.org/W1234567890"
cited_by_count: 12
referenced_works: ["https://openalex.org/W1", "https://openalex.org/W2"]
related_works: ["https://openalex.org/W3"]
concepts: ["Data governance", "Digital transformation"]
counts_by_year: [{"year": 2025, "cited_by_count": 3}, {"year": 2024, "cited_by_count": 9}]
publication_date: "2024-01-15"
source_display_name: "Journal of Test Cases"
doi: "10.1145/123456.7890"
arxiv_id: ""
pdf: "Knowledge/Research/Attachments/doi-10-1145-123456-7890.pdf"
pdf_url: "https://example.com/paper.pdf"
source_url: "https://example.com/paper"
tags:
  - literature-note
```

`entry_type` is intended to represent the human-meaningful source kind such as `journal-article`, `preprint`, or `pdf-document`.

## Companion Tools

Recommended stack:

- `PDF++`
  Use it for page-aware reading and evidence extraction.
- `Smart Connections`
  Use it for local semantic recall if you want embeddings-based retrieval in the vault.
- `External semantic bridge CLI`
  Use it when you want citation-aware retrieval results.
- `Zotero Integration + Better BibTeX`
  Optional. Keep this only if you already have a Zotero-centered workflow.

## Semantic Bridge

The semantic bridge is separate from ingestion.

- ingestion creates or inspects literature notes
- semantic bridge retrieves candidate notes from an external tool

Supported semantic placeholders:

- `{{query}}`
- `{{vault}}`
- `{{file}}`
- `{{selection}}`

Recommended semantic JSON shape:

```json
{
  "results": [
    {
      "path": "Knowledge/Research/Literature/doi-10-1145-123456-7890.md",
      "title": "Coffee Extraction Dynamics",
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

## Build

```bash
npm install --package-lock=false
npm run build
npm test
```

## Manual Install

Copy these files into:

```text
<vault>/.obsidian/plugins/link-tag-intelligence/
```

- `manifest.json`
- `main.js`
- `styles.css`
