# Findings: CLI-first ingestion refactor

## Overview
This file tracks the current Zotero-heavy coupling and the concrete implementation facts that matter for moving the plugin to a CLI-first research workflow.

---

## Technical Findings

### Current product model is Zotero-first
**Date:** 2026-03-15
**Source:** `README.md`, `src/settings.ts`, `src/i18n.ts`, `src/main.ts`

**Content:**
The plugin currently frames research capture around Zotero in four places:
- README workflow and recommended stack
- workbench guide copy in `src/settings.ts`
- quick actions and workbench drawer actions
- i18n labels and mismatch descriptions

**Impact:**
The refactor must update both implementation and product language. Leaving docs/UI unchanged would make the CLI-first workflow incoherent.

---

### Existing external command support only covers semantic search
**Date:** 2026-03-15
**Source:** `src/semantic.ts`, `src/shared.ts`

**Content:**
The plugin already supports a desktop-only external shell command that returns stdout JSON for semantic search. It uses placeholder substitution and child-process execution via the desktop environment.

**Impact:**
The ingestion CLI can reuse the same shell-command pattern, but it needs a separate command template and JSON result shape because it performs import/creation rather than retrieval.

---

### Existing workbench structure can absorb a new CLI-first module
**Date:** 2026-03-15
**Source:** `src/settings.ts`, `src/modals.ts`

**Content:**
The workbench is already organized into Overview, Workflow, Plugins, and Taxonomy pages, with reusable section cards, action groups, and modal patterns.

**Impact:**
A first implementation can add ingestion settings and a trigger modal without redesigning the whole UI system.

---

### CLI layer already supports the exact first-scope source types
**Date:** 2026-03-15
**Source:** `cli/research-lib.mjs`, `cli/lti-research.mjs`

**Content:**
The new CLI already implements `resolve`, `ingest`, and `inspect`, with source resolution for:
- DOI via OpenAlex
- arXiv via the arXiv API
- PDF via local path or remote URL, plus optional metadata overrides

It also emits source-agnostic literature note frontmatter and writes attachments into the configured research folders.

**Impact:**
Plugin work should focus on command execution, modal UX, settings, and status presentation rather than rebuilding ingestion logic inside Obsidian.

---

### Shared shell templating is ready for a second external command path
**Date:** 2026-03-15
**Source:** `src/shared.ts`

**Content:**
`buildShellCommand(...)` and `buildIngestionCommand(...)` now exist alongside the semantic builder, with placeholders for source type, source value, vault path, active file, selection, literature folder, attachments folder, template path, and open-after-import preference.

**Impact:**
The ingestion bridge can mirror `src/semantic.ts` and stay consistent with the existing shell JSON execution model instead of introducing MCP-specific coupling.

---

### Zotero demotion requires behavioral changes, not just wording changes
**Date:** 2026-03-15
**Source:** `src/main.ts`, `src/settings.ts`, `src/companion-plugins.ts`

**Content:**
Zotero is currently treated as a required companion in three concrete behaviors:
- `applyResearchPreset()` applies Zotero by default
- workbench capture actions lead with Zotero import
- companion readiness counts treat Zotero as required instead of optional

**Impact:**
To make the workflow genuinely CLI-first, the refactor must change preset/application logic and readiness semantics, not only README and i18n copy.

---

### Obsidian release bot feedback must constrain new plugin code up front
**Date:** 2026-03-15
**Source:** `obsidianmd/obsidian-releases#10999`, `ObsidianReviewBot`, `github-actions`

**Content:**
The open release PR for this plugin already established a reusable Obsidian-specific preflight checklist:
- do not import Node.js builtins into runtime plugin code
- do not hardcode `.obsidian`; use `app.vault.configDir`
- avoid deprecated APIs like `activeLeaf`
- avoid async-without-await and Promise-returning void handlers
- avoid direct `element.style.*` writes in plugin UI
- use Obsidian `Setting` headings instead of raw heading markup in settings pages
- keep PR template, description text, manifest metadata, release artifacts, and release version perfectly aligned

**Impact:**
The CLI-first refactor cannot be treated as “pure product work”. Every new plugin-side change must be screened against the release-bot checklist before shipping, or the upstream submission will regress even if the feature itself works.

---

### CLI-first documentation needed a full rewrite, not a patch
**Date:** 2026-03-15
**Source:** `README.md`, `cli/lti-research.mjs`

**Content:**
The codebase already had the ingestion implementation, but the public repo contract was still Zotero-first. A partial README edit would have left inconsistent mental models across:
- plugin actions
- settings placeholders
- agent shell usage
- JSON input/output expectations

The clean fix was to rewrite the README around the CLI-first architecture and add a built-in `--help` path to the ingestion CLI itself.

**Impact:**
For future changes, the CLI contract should be treated as a product surface, not just an implementation detail. When flags or JSON shapes change, README and CLI help should be updated in the same pass.

---

### Real arXiv ingestion works end-to-end against the live API
**Date:** 2026-03-15
**Source:** `cli/lti-research.mjs`, temporary vault `/tmp/lti-real-arxiv-vault`

**Content:**
The CLI was exercised against the real arXiv API with paper `1706.03762` (`Attention Is All You Need`).

Observed behavior:
- `resolve --arxiv 1706.03762` returned live metadata from arXiv
- `ingest --arxiv 1706.03762 --vault /tmp/lti-real-arxiv-vault` created:
  - `Knowledge/Research/Literature/arxiv-1706-03762v7.md`
  - `Knowledge/Research/Attachments/arxiv-1706-03762v7.pdf`
- the downloaded PDF exists and is about `2.2M`
- `inspect` confirmed `attachment_exists: true` and the expected frontmatter fields

**Impact:**
The CLI is already good enough for real DOI/arXiv/PDF workflows. Remaining work is primarily about pointing the plugin setting at the command for a live Obsidian vault and then validating the in-app trigger path.

---

### Non-ASCII research topics need deterministic ASCII vault slugs
**Date:** 2026-03-15
**Source:** `cli/workflow-lib.mjs`, temporary vault `/tmp/lti-paper-workflow-real`

**Content:**
The first version of the paper workflow reused the repo-wide ASCII-only `slugify(...)` helper for topic notes. That works for English topics, but a real Chinese topic such as `数据治理和数智转型` collapses to the fallback slug `item`, which would make topic, matrix, outline, and draft paths unstable and collision-prone.

The fix was to keep ASCII paths while adding a deterministic hash-backed fallback for non-ASCII topics, so the real paper workflow now emits stable paths such as:
- `Knowledge/Research/Topics/topic-1x2na07.md`
- `Knowledge/Research/Analysis/topic-1x2na07-comparison-matrix.md`
- `Knowledge/Research/Drafts/topic-1x2na07-draft.md`

**Impact:**
This is required for multilingual Obsidian vaults. Any future CLI or agent-generated note hierarchy that derives file paths from user topics must not rely on an ASCII-only slug fallback like `item`.

---

### Real paper drafting needs explicit arXiv source curation after search
**Date:** 2026-03-15
**Source:** `cli/lti-research.mjs search`, `cli/lti-research.mjs paper`, temporary vault `/tmp/lti-paper-workflow-real`

**Content:**
Generic arXiv searches for governance and transformation topics are usable, but noisy. Queries such as `data governance digital transformation` and `enterprise ai governance transformation` returned a mix of relevant governance/framework papers and irrelevant `Data*` author-name matches.

The stable workflow was:
1. run `search --query ... --max-results ...`
2. manually shortlist arXiv IDs
3. run `paper --sources "arxiv:...,arxiv:...,arxiv:..."`

The real validated set used for `数据治理和数智转型` was:
- `2307.03198v2` `A multilevel framework for AI governance`
- `2407.07898v1` `Central Bank Digital Currency: The Advent of its IT Governance in the financial markets`
- `2012.02454v1` `Data lakes for digital humanities`

**Impact:**
For shell agents such as Codex or Claude Code, `search` should be treated as a candidate-generation step and `paper --sources` as the deterministic execution step. This keeps the generated matrix, map, and draft materially closer to the intended topic.

---

### arXiv DOI enrichment can switch note filenames to DOI-based keys
**Date:** 2026-03-15
**Source:** `cli/research-lib.mjs`, temporary vault `/tmp/lti-paper-workflow-real`

**Content:**
When an arXiv paper resolves to richer DOI metadata, `buildSourceKey(...)` still prefers the DOI for note naming. In the real run, source `arxiv:2012.02454v1` produced:
- note path `Knowledge/Research/Literature/doi-10-1145-3423603-3424004.md`
- frontmatter `source_type: "arxiv"`
- frontmatter `arxiv_id: "2012.02454v1"`

This is not a runtime bug because the CLI returns `note_path` explicitly and the frontmatter preserves both IDs, but it is a behavior worth remembering.

**Impact:**
Downstream automation should treat returned `note_path` as the source of truth instead of reconstructing literature note filenames from the original request string.

---

### OpenAlex was already present, but only as a DOI title/author resolver
**Date:** 2026-03-15
**Source:** `cli/research-lib.mjs`, `tests/research-cli.test.ts`

**Content:**
The repo already used OpenAlex for DOI resolution, but it only normalized basic bibliographic fields:
- title
- authors
- year
- PDF URL
- landing URL
- abstract
- citekey

It did not expose the main reason to use OpenAlex in a research-writing workflow:
- `openalex_id`
- `cited_by_count`
- `referenced_works`
- `related_works`
- `concepts`
- `counts_by_year`
- `publication_date`
- venue/source display name

**Impact:**
The missing work was not “connect OpenAlex from scratch”, but “promote OpenAlex from a hidden DOI helper into the canonical citation-metadata enrichment layer”.

---

### DOI-bearing arXiv and PDF sources can inherit OpenAlex citation metadata cleanly
**Date:** 2026-03-15
**Source:** `cli/research-lib.mjs`, real runs `resolve --arxiv 2012.02454v1`, `resolve --doi 10.1145/3423603.3424004`

**Content:**
The enrichment strategy works best when OpenAlex is treated as a secondary metadata layer rather than a new source type. In the validated implementation:
- direct DOI sources resolve through OpenAlex
- arXiv sources with a DOI inherit OpenAlex citation metadata while keeping `source_type: "arxiv"` and the original `arxiv_id`
- PDFs imported with `--metadata-doi` follow the same pattern

This preserves the user's capture model while still surfacing citation-network metadata.

**Impact:**
This is the right product model for the current plugin: capture stays source-agnostic, while citation analytics come from the best available DOI graph.

---

### OpenAlex metadata is valuable only if it reaches notes and drafting outputs
**Date:** 2026-03-15
**Source:** `cli/workflow-lib.mjs`, temporary vault `/tmp/lti-openalex-paper-uV656S`

**Content:**
Once OpenAlex fields were added only to `resolve`/`ingest`, the workflow was still incomplete. The useful end state required these fields to flow into:
- literature-note frontmatter and `inspect`
- analysis notes (`Citation context`)
- comparison matrix (`Citations`, `Concepts`)
- outline (`Citation strategy`)
- Chinese draft paragraphs (`被引次数`, `参考文献数`, `核心概念`)

The real generated draft now contains sentences such as:
- OpenAlex 目前记录其被引 6 次、参考文献 3 篇，核心概念包括 ...

**Impact:**
For agent-driven paper writing, metadata only matters if it changes the generated research artifacts, not just the raw JSON payload.

---

### OpenAlex PDF URLs cannot be trusted to end with `.pdf`
**Date:** 2026-03-15
**Source:** `cli/research-lib.mjs`, real DOI ingest into `/tmp/lti-openalex-real-c0WrmL`

**Content:**
OpenAlex can return arXiv-backed PDF URLs like `https://arxiv.org/pdf/2012.02454`, which are valid PDF endpoints but do not end with `.pdf`. The old attachment logic used `path.extname(...)` directly and therefore produced broken attachment filenames such as:
- `Knowledge/Research/Attachments/doi-10-1145-3423603-3424004.02454`

The fix was to add an explicit attachment-extension inference rule:
- preserve local file extensions for user-supplied PDF files
- keep `.pdf` when the remote URL already ends with `.pdf`
- force `.pdf` for DOI/arXiv-enriched remote PDF URLs under `/pdf/...`

**Impact:**
Any scholarly-ingestion workflow that trusts OA aggregators should normalize attachment extensions semantically, not by raw URL suffix alone.

---

### Live vault detection should start from Obsidian's own state file
**Date:** 2026-03-15
**Source:** `~/.config/obsidian/obsidian.json`, live vault `.obsidian/community-plugins.json`

**Content:**
For real instance integration, the reliable way to locate the active vault was reading `~/.config/obsidian/obsidian.json` and selecting the entry with `open: true`. That resolved to:
- vault `/home/zhangyangrui/Datesets_4_me/note/my_notebook`
- live plugin enablement confirmed by `.obsidian/community-plugins.json`

**Impact:**
When a user asks for live Obsidian integration, do not guess from recent repo paths or shell history. Start from Obsidian's own runtime state.

---

### Live plugin directories may be copied folders rather than symlinks
**Date:** 2026-03-15
**Source:** live plugin directory `/home/zhangyangrui/Datesets_4_me/note/my_notebook/.obsidian/plugins/link-tag-intelligence`

**Content:**
The active vault's `link-tag-intelligence` directory was a normal folder, not a symlink to the development repo. Updating the repo alone would not update the live instance. The working deployment step was to copy the built artifacts:
- `main.js`
- `manifest.json`
- `styles.css`
- `versions.json`

**Impact:**
Treat `vault/.obsidian/plugins/<plugin-id>/` as a deployment target. Before claiming real-instance validation, verify whether the live plugin path is linked or copied.

---

### GUI-launched Obsidian should use absolute CLI executable paths
**Date:** 2026-03-15
**Source:** live `data.json`, successful actual-vault `ingest` and `paper` runs

**Content:**
The live plugin configuration succeeded only after `data.json` was pointed at absolute paths for both executables:
- `/home/zhangyangrui/.nvm/versions/node/v24.13.0/bin/node`
- `/home/zhangyangrui/my_programes/obsidian-link-tag-intelligence/cli/lti-research.mjs`

The actual vault then accepted real `ingest` and `paper` runs against DOI/arXiv sources.

**Impact:**
Any community-plugin workflow that shells out from GUI Obsidian should default to absolute executable paths rather than assuming the user's interactive shell `PATH` is available.

---

### Shell placeholder parsing must preserve empty strings
**Date:** 2026-03-15
**Source:** `cli/research-lib.mjs`, `tests/research-cli.test.ts`, real actual-vault ingest run

**Content:**
The plugin's ingestion command passes placeholder arguments such as:
- `--metadata-doi ''`
- `--metadata-arxiv ''`
- `--title ''`

The original `parseCliArgs()` used a falsy check for the next token, so empty strings were misread as missing values and replaced with `"true"`. In the live vault this produced bogus artifacts like:
- `Knowledge/Research/Literature/doi-true.md`
- `Knowledge/Research/Attachments/doi-true.pdf`

The fix was to only treat the value as absent when `typeof next === "undefined"` or the following token starts with `--`.

**Impact:**
Any shell-JSON CLI that accepts GUI placeholder arguments must distinguish `undefined` from `''`, or integrations will silently corrupt identifiers and note paths.

---

### File sync is not the same as runtime reload in a running Obsidian instance
**Date:** 2026-03-15
**Source:** live `debug-runtime.log`

**Content:**
After syncing the new plugin bundle and writing `data.json`, the running Obsidian process still reported the old load event:
- `2026-03-15T02:43:00.274Z`

That proves copying files into `.obsidian/plugins/...` does not hot-reload an already running plugin process.

**Impact:**
Real instance integration is only complete after the operator reloads the plugin or restarts Obsidian and the runtime log shows a fresh load timestamp.

---

## Open Research
- [x] Confirm the smallest clean JSON contract for `resolve`, `ingest`, and `inspect`
- [x] Confirm how much of the Zotero-specific i18n should be rewritten now versus demoted but retained
