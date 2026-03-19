# Task Plan: CLI-first ingestion refactor

## Goal
Shift the plugin from a Zotero-first research workflow to a CLI-first ingestion workflow with DOI, arXiv, and PDF support, while keeping the Obsidian plugin focused on display, triggering, preview, tags, and relations.

## Current Phase
Phase 8

## Phases

### Phase 1: Ground current implementation
- [x] Confirm current plugin worktree state
- [x] Inspect current Zotero-first settings, actions, and README coupling
- [x] Confirm the existing semantic CLI bridge shape
- [x] Record the new CLI-first design constraints
- **Status:** complete

### Phase 2: Add external research CLI
- [x] Add a shell JSON CLI with `resolve`, `ingest`, and `inspect`
- [x] Support generic `--source-type/--source` input plus DOI/arXiv/PDF convenience flags
- [x] Resolve DOI via OpenAlex and arXiv via the arXiv API
- [x] Generate source-agnostic literature notes and attachment targets
- **Status:** complete

### Phase 3: Wire plugin to CLI-first workflow
- [x] Add ingestion CLI settings and timeout
- [x] Add a modal/command/action to run ingestion from DOI/arXiv/PDF input
- [x] Reposition Zotero as an optional adapter rather than the primary capture path
- [x] Keep semantic bridge separate from ingestion CLI
- **Status:** complete

### Phase 4: Update guidance and tests
- [x] Update README to describe CLI-first workflow
- [x] Update workbench guidance copy from Zotero-first to source-agnostic CLI-first
- [x] Add tests for CLI helpers and parser/normalization logic
- [x] Run test/build validation
- **Status:** complete

### Phase 5: Learnings and handoff
- [x] Update planning findings/progress with final results
- [x] Append learnings in Brain-storm
- [x] Save durable memory if the workflow rule is reusable
- **Status:** complete

### Phase 6: Paper workflow CLI and real validation
- [x] Add `search` and `paper` CLI subcommands on top of the ingestion layer
- [x] Fix deterministic topic-note naming for non-ASCII topics such as Chinese research themes
- [x] Add workflow-level tests for source parsing, citation formatting, tag inference, and note generation
- [x] Run a real end-to-end paper workflow against the live arXiv API into a temp vault
- [x] Update README and planning files to document the paper-writing workflow
- **Status:** complete

### Phase 7: OpenAlex citation enrichment
- [x] Extend DOI resolution to expose OpenAlex citation-network metadata as stable CLI fields
- [x] Propagate OpenAlex metadata into literature-note frontmatter and `inspect`
- [x] Feed OpenAlex citation/context fields into `paper` analysis, matrix, outline, and draft outputs
- [x] Add regression coverage for DOI-bearing sources whose `pdf_url` lacks a `.pdf` suffix
- [x] Run real DOI and DOI-bearing arXiv validation against OpenAlex and verify note/draft outputs
- **Status:** complete

### Phase 8: Live Obsidian instance integration and manual guide
- [x] Sync the latest plugin build/config into the currently open vault instance
- [x] Configure the live plugin instance to call the CLI with absolute paths
- [x] Run a real integration test against the user's actual vault
- [x] Update the Brain-storm `obsidian` skill with the live-instance workflow learned here
- [x] Rewrite the vault-side research workflow guide in Chinese for the CLI + OpenAlex flow
- **Status:** complete

## Key Questions
1. Keep Zotero config-diff/apply logic in place as an optional adapter for now, rather than deleting it immediately
2. Treat the first CLI version as a local shell tool in this repo, callable by `node cli/lti-research.mjs`

## Decisions Made
| Decision | Reason |
|------|------|
| Use a new dedicated planning folder | The user explicitly requested planning-with-files in a new folder |
| Implement CLI-first as the primary path without deleting Zotero immediately | Lowers migration risk while shifting the product model |
| Keep agent integration on shell JSON I/O | Matches the user's Codex/Claude Code requirement with the least coupling |
| Use a hash-backed ASCII slug for non-ASCII research topics | Prevents Chinese topic names from collapsing to `item` and creating unstable vault paths |
| Use `search` to shortlist arXiv IDs, then run `paper --sources ...` with explicit picks for real drafting | Generic arXiv governance queries are noisy; explicit source curation keeps the generated draft coherent |
| Integrate OpenAlex as a metadata enrichment layer, not as a new first-class source type | The current workflow already captures via DOI/arXiv/PDF; the missing value was citation metadata, not another capture primitive |
| Default missing OpenAlex numeric fields to `0` and missing list fields to `[]` in CLI/frontmatter | Keeps downstream agent handling simple and avoids field-presence branching |
| For the live Obsidian instance, configure the ingestion CLI with absolute paths to both `node` and `cli/lti-research.mjs` | GUI-launched Obsidian may not inherit the interactive shell PATH reliably |
| Treat the live vault plugin directory as a deployment target and sync build artifacts when it is a plain folder instead of a symlink | The running Obsidian instance used a copied plugin directory, so repo changes alone would not update the live instance |
| Keep the manual workflow guide inside the live vault as a Chinese research note instead of an external doc | The user needs the guide beside the real generated notes and attachments, not only in the repo |

## Errors Encountered
| Error | Attempt | Solution |
|------|------|----------|
| DOI-driven attachment materialization used `.02454` as a file extension for arXiv-backed OpenAlex PDF URLs like `https://arxiv.org/pdf/2012.02454` | 1 | Added explicit attachment-extension inference so DOI/arXiv-enriched remote PDFs normalize to `.pdf` |
| `parseCliArgs(...)` treated empty-string placeholder values as missing, so GUI-sourced args like `--metadata-doi ''` became `true` and produced bogus live-vault files such as `doi-true.md` | 1 | Changed the missing-value check to only treat `undefined` or a following flag token as absent, added a regression test, and removed the bad live-vault artifacts |
| Copying new plugin files into `vault/.obsidian/plugins/link-tag-intelligence/` did not change the behavior of the already-running Obsidian process immediately | 1 | Documented the required user action to reload the plugin or restart Obsidian, and used `debug-runtime.log` as the post-reload verification point |
