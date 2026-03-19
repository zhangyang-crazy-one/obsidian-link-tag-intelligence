# Progress Log

## Session: 2026-03-15

### Phase 1: Ground current implementation
- **Status:** complete
- **Start time:** 2026-03-15
- Actions:
  - Confirmed current repo state and recent release-fix commit
  - Inspected README, settings, i18n, modals, shared helpers, and main plugin actions
  - Confirmed the plugin already has a shell JSON bridge for semantic search only
  - Created a dedicated planning-with-files folder for this refactor
  - Re-grounded after an interrupted implementation and verified that the new CLI files and ingestion command builder are already present
- Created/modified files:
  - `planning/cli-first-ingestion-20260315/task_plan.md`
  - `planning/cli-first-ingestion-20260315/findings.md`
  - `planning/cli-first-ingestion-20260315/progress.md`

### Phase 2: Add external research CLI
- **Status:** complete
- Actions:
  - Verified `cli/research-lib.mjs` implements DOI, arXiv, and PDF resolution plus literature-note generation
  - Verified `cli/lti-research.mjs` exposes shell JSON subcommands for `resolve`, `ingest`, and `inspect`
  - Verified `src/shared.ts` now contains `buildShellCommand(...)` and `buildIngestionCommand(...)`
- Created/modified files:
  - `cli/research-lib.mjs`
  - `cli/lti-research.mjs`
  - `src/shared.ts`

### Phase 3: Wire plugin to CLI-first workflow
- **Status:** complete
- Actions:
  - Identified the concrete integration points in `src/main.ts`, `src/modals.ts`, `src/settings.ts`, `src/i18n.ts`, `src/view.ts`, and `src/companion-plugins.ts`
  - Confirmed the current UI still leads with Zotero import and treats Zotero as required in preset readiness
  - Pulled the current Obsidian release PR bot comments from `obsidianmd/obsidian-releases#10999` and distilled them into a reusable preflight checklist for future plugin changes
  - Wrote the Obsidian bot checklist into Brain-storm learnings and SQLite memory so future plugin work can recall it before coding/release
  - Added the plugin-side ingestion bridge, modal, commands, workbench settings, sidebar status, and Zotero demotion to optional status
- Created/modified files:
  - `planning/cli-first-ingestion-20260315/task_plan.md`
  - `planning/cli-first-ingestion-20260315/findings.md`
  - `planning/cli-first-ingestion-20260315/progress.md`
  - `/home/zhangyangrui/my_programes/Brain-storm/.learnings/LEARNINGS.md`
  - `/home/zhangyangrui/my_programes/Brain-storm/.codex/memory/project_memory.db`
  - `/home/zhangyangrui/my_programes/Brain-storm/.codex/memory/global_memory.db`
  - `src/ingestion.ts`
  - `src/main.ts`
  - `src/modals.ts`
  - `src/settings.ts`
  - `src/view.ts`
  - `src/companion-plugins.ts`
  - `src/notes.ts`
  - `src/shared.ts`

### Phase 4: Update guidance and tests
- **Status:** complete
- Actions:
  - Rewrote the README around the CLI-first ingestion architecture and agent shell JSON contract
  - Added built-in CLI help output to `cli/lti-research.mjs`
  - Added helper and CLI tests covering ingestion command templating, DOI/arXiv normalization, metadata parsing, and frontmatter source-type preference
  - Re-ran `npm test` and `npm run build` after the documentation and test updates
- Created/modified files:
  - `README.md`
  - `cli/lti-research.mjs`
  - `tests/helpers.test.ts`
  - `tests/research-cli.test.ts`

### Phase 5: Learnings and handoff
- **Status:** complete
- Actions:
  - Updated planning files to reflect the completed CLI-first workflow refactor
  - Persisted the Obsidian release-bot checklist into Brain-storm learnings and SQLite memory for future recall
  - Ran a real end-to-end CLI import against the live arXiv API using paper `1706.03762`
- Created/modified files:
  - `planning/cli-first-ingestion-20260315/task_plan.md`
  - `planning/cli-first-ingestion-20260315/findings.md`
  - `planning/cli-first-ingestion-20260315/progress.md`
  - `/home/zhangyangrui/my_programes/Brain-storm/.learnings/LEARNINGS.md`
  - `/home/zhangyangrui/my_programes/Brain-storm/.codex/memory/project_memory.db`
  - `/home/zhangyangrui/my_programes/Brain-storm/.codex/memory/global_memory.db`

### Phase 6: Paper workflow CLI and real validation
- **Status:** complete
- Actions:
  - Added `cli/workflow-lib.mjs` as a higher-level paper-writing workflow on top of the ingestion layer
  - Added `search` and `paper` subcommands to `cli/lti-research.mjs`
  - Fixed topic-note naming for non-ASCII topics by introducing a deterministic ASCII hash fallback instead of letting Chinese topics collapse to `item`
  - Added workflow tests for source-spec parsing, parenthetical citation formatting, arXiv search parsing, tag inference, and local-PDF paper generation
  - Updated the README to document the new `search` and `paper` contracts plus full workflow examples
  - Ran a real end-to-end paper workflow against the live arXiv API into `/tmp/lti-paper-workflow-real`
  - Verified that generated notes contain plugin-compatible wikilinks, path-based relation frontmatter, tags, downloaded PDFs, and a Chinese draft note
- Created/modified files:
  - `planning/cli-first-ingestion-20260315/task_plan.md`
  - `planning/cli-first-ingestion-20260315/findings.md`
  - `planning/cli-first-ingestion-20260315/progress.md`
  - `README.md`
  - `cli/lti-research.mjs`
  - `cli/workflow-lib.mjs`
  - `tests/paper-workflow.test.ts`
  - `/home/zhangyangrui/my_programes/Brain-storm/.learnings/LEARNINGS.md`
  - `/home/zhangyangrui/my_programes/Brain-storm/.codex/memory/project_memory.db`
  - `/home/zhangyangrui/my_programes/Brain-storm/.codex/memory/global_memory.db`

### Phase 7: OpenAlex citation enrichment
- **Status:** complete
- Actions:
  - Extended the OpenAlex normalization layer so DOI metadata now includes OpenAlex IDs, citation counts, referenced works, related works, concepts, counts by year, publication date, and venue/source display name
  - Wrote the new OpenAlex fields into literature-note frontmatter and kept `inspect` compatible by serializing arrays/objects as inline JSON-compatible YAML values
  - Added OpenAlex-aware citation sections to analysis notes, citation/concepts columns to the comparison matrix, citation-strategy bullets to the outline, and citation/context sentences to the Chinese draft note
  - Fixed attachment extension inference for DOI-enriched PDF URLs that do not end with `.pdf`, such as `https://arxiv.org/pdf/2012.02454`
  - Updated CLI help and README so external agents understand that DOI-bearing sources are enriched through OpenAlex
  - Validated the new fields with real OpenAlex DOI resolution, DOI-bearing arXiv resolution, DOI ingest, note inspection, and paper generation
- Created/modified files:
  - `planning/cli-first-ingestion-20260315/task_plan.md`
  - `planning/cli-first-ingestion-20260315/findings.md`
  - `planning/cli-first-ingestion-20260315/progress.md`
  - `README.md`
  - `cli/lti-research.mjs`
  - `cli/research-lib.mjs`
  - `cli/workflow-lib.mjs`
  - `tests/research-cli.test.ts`
  - `tests/paper-workflow.test.ts`

### Phase 8: Live Obsidian instance integration and manual guide
- **Status:** complete
- Actions:
  - Detected the active Obsidian vault from `~/.config/obsidian/obsidian.json` and confirmed `link-tag-intelligence` is enabled in the live vault's `community-plugins.json`
  - Synced the latest built plugin artifacts into `/home/zhangyangrui/Datesets_4_me/note/my_notebook/.obsidian/plugins/link-tag-intelligence` after confirming the live plugin directory is a normal folder rather than a symlink
  - Rewrote the live plugin `data.json` so the ingestion CLI uses absolute paths for both `node` and `cli/lti-research.mjs`
  - Ran real `resolve`, `ingest`, and `paper` flows against the user's actual vault and verified the generated literature, analysis, matrix, outline, and draft notes under `Knowledge/Research/...`
  - Found and fixed a placeholder parsing regression where empty-string GUI args were coerced to `true`, added regression coverage, and cleaned the bad `doi-true.*` artifacts from the live vault
  - Updated the Brain-storm `obsidian` skill with the live-instance workflow and rewrote the vault-side Chinese guide at `Knowledge/Research/研究工作流配置说明.md`
  - Verified that the running Obsidian process still shows the old `debug-runtime.log` load timestamp, so a manual plugin reload or full Obsidian restart is still required to pick up the synced files
- Created/modified files:
  - `planning/cli-first-ingestion-20260315/task_plan.md`
  - `planning/cli-first-ingestion-20260315/findings.md`
  - `planning/cli-first-ingestion-20260315/progress.md`
  - `cli/research-lib.mjs`
  - `tests/research-cli.test.ts`
  - `/home/zhangyangrui/my_programes/Brain-storm/.codex/skills/obsidian/SKILL.md`
  - `/home/zhangyangrui/my_programes/Brain-storm/.learnings/LEARNINGS.md`
  - `/home/zhangyangrui/Datesets_4_me/note/my_notebook/.obsidian/plugins/link-tag-intelligence/data.json`
  - `/home/zhangyangrui/Datesets_4_me/note/my_notebook/.obsidian/plugins/link-tag-intelligence/main.js`
  - `/home/zhangyangrui/Datesets_4_me/note/my_notebook/.obsidian/plugins/link-tag-intelligence/manifest.json`
  - `/home/zhangyangrui/Datesets_4_me/note/my_notebook/.obsidian/plugins/link-tag-intelligence/styles.css`
  - `/home/zhangyangrui/Datesets_4_me/note/my_notebook/.obsidian/plugins/link-tag-intelligence/versions.json`
  - `/home/zhangyangrui/Datesets_4_me/note/my_notebook/Knowledge/Research/研究工作流配置说明.md`

---

## Test Results

| Test | Input | Expected | Actual | Status |
|------|------|------|------|------|
| Repo grounding | read current plugin files | confirm current model and coupling | Zotero-first + semantic-only CLI confirmed | pass |
| CLI verification | inspect `cli/*` and `src/shared.ts` | confirm prior interrupted implementation landed | CLI + shared ingestion builder confirmed present | pass |
| Release PR audit | inspect `obsidianmd/obsidian-releases#10999` comments/checks | capture durable ReviewBot constraints | bot feedback extracted and written to learnings/memory backlog | pass |
| Memory verification | search SQLite memory after update/add | confirm project/global recall works | both project `#286` and global `#15` now return the Obsidian bot checklist | pass |
| Regression test | `npm test` after new CLI tests | keep helper and CLI test coverage green | 25/25 tests passing | pass |
| Build verification | `npm run build` after CLI-first wiring and README update | ensure plugin bundle still emits successfully | build passing | pass |
| CLI UX verification | `node cli/lti-research.mjs --help` | ensure shell-facing usage contract is discoverable | help output printed with commands and flags | pass |
| Real arXiv resolve | `node cli/lti-research.mjs resolve --arxiv 1706.03762` | hit the live API and return metadata | live metadata for `Attention Is All You Need` returned | pass |
| Real arXiv ingest | `node cli/lti-research.mjs ingest --arxiv 1706.03762 --vault /tmp/lti-real-arxiv-vault` | create note + download PDF into vault | note and PDF created with no warnings | pass |
| Real arXiv inspect | `node cli/lti-research.mjs inspect --vault /tmp/lti-real-arxiv-vault --note-path Knowledge/Research/Literature/arxiv-1706-03762v7.md` | confirm attachment and frontmatter | `attachment_exists: true` and expected frontmatter returned | pass |
| Workflow syntax check | `node --check cli/workflow-lib.mjs` and `node --check cli/lti-research.mjs` | no syntax regressions after paper CLI wiring | both checks exited cleanly | pass |
| Workflow test suite | `npm test` after adding paper workflow tests | keep legacy coverage green and validate new workflow helpers | 30/30 tests passing | pass |
| Workflow build verification | `npm run build` after CLI paper workflow changes | ensure plugin bundle still builds | build passing | pass |
| Real arXiv search | `node cli/lti-research.mjs search --query "data governance digital transformation" --max-results 10` | return real candidate papers from arXiv | 10 live results returned | pass |
| Real paper workflow | `node cli/lti-research.mjs paper --topic "数据治理和数智转型" --vault /tmp/lti-paper-workflow-real --sources "arxiv:2307.03198v2,arxiv:2407.07898v1,arxiv:2012.02454v1"` | create topic note, analysis notes, matrix, map, outline, and draft | all expected notes and PDFs created; topic slug `topic-1x2na07` stayed stable | pass |
| Real paper inspect | `node cli/lti-research.mjs inspect ...` for the three generated literature notes | confirm attachment materialization and frontmatter integrity | all three notes report `attachment_exists: true` with expected IDs and citekeys | pass |
| OpenAlex helper regression | `npm test` after extending OpenAlex normalization and inspect coverage | keep OpenAlex fields and paper outputs covered | 32/32 tests passing | pass |
| OpenAlex build verification | `npm run build` after OpenAlex CLI/workflow changes | ensure plugin bundle still builds | build passing | pass |
| Real OpenAlex DOI resolve | `node cli/lti-research.mjs resolve --doi 10.1145/3423603.3424004` | return real OpenAlex citation metadata | live `openalex_id`, `cited_by_count`, `referenced_works`, `concepts`, and `counts_by_year` returned | pass |
| Real OpenAlex arXiv resolve | `node cli/lti-research.mjs resolve --arxiv 2012.02454v1` | preserve arXiv identity while inheriting OpenAlex citation metadata | output kept `source_type: arxiv` plus live OpenAlex fields | pass |
| Real OpenAlex DOI ingest | `node cli/lti-research.mjs ingest --doi 10.1145/3423603.3424004 --vault /tmp/lti-openalex-real-c0WrmL --download-pdf true` | create note + attachment with citation metadata and correct PDF extension | note created, attachment path normalized to `.pdf`, OpenAlex fields persisted in metadata | pass |
| Real OpenAlex inspect | `node cli/lti-research.mjs inspect --vault /tmp/lti-openalex-real-c0WrmL --note-path Knowledge/Research/Literature/doi-10-1145-3423603-3424004.md` | read back OpenAlex arrays and counts from frontmatter | `inspect` returned `openalex_id`, `cited_by_count`, `referenced_works`, `concepts`, `counts_by_year`, and `attachment_exists: true` | pass |
| Real OpenAlex paper workflow | `node cli/lti-research.mjs paper --topic "数据治理和数智转型" --vault /tmp/lti-openalex-paper-uV656S --sources "arxiv:2012.02454v1,arxiv:2307.03198v2"` | generate workflow notes that surface OpenAlex citation context | analysis, matrix, and Chinese draft all include citation counts and concept summaries | pass |
| Live vault discovery | read `~/.config/obsidian/obsidian.json` and live `community-plugins.json` | locate the active vault and confirm the plugin is enabled | active vault resolved to `/home/zhangyangrui/Datesets_4_me/note/my_notebook` and `link-tag-intelligence` is enabled | pass |
| Live plugin deployment check | inspect `vault/.obsidian/plugins/link-tag-intelligence` | confirm whether repo updates reach the running instance automatically | live plugin directory is a copied folder, so built assets had to be synced manually | pass |
| Live ingestion config | inspect live `data.json` | ensure GUI Obsidian will call the CLI with stable executables | `ingestionCommand` now points to absolute `node` and `cli/lti-research.mjs` paths; timeout is `120000` | pass |
| Placeholder parser regression | `npm test` after `parseCliArgs()` fix | preserve empty placeholder values like `''` instead of coercing them to `true` | 33/33 tests passing, including the empty-string regression case | pass |
| Real actual-vault ingest | `/home/zhangyangrui/.nvm/versions/node/v24.13.0/bin/node ... ingest --source-type arxiv --source 2012.02454v1 --vault /home/zhangyangrui/Datesets_4_me/note/my_notebook ... --metadata-doi '' --metadata-arxiv '' --title '' --authors '' --year '' --download-pdf true` | create the note/PDF in the user's vault with correct identifiers | actual vault ingest succeeded and produced `doi-10-1145-3423603-3424004.md` plus `.pdf` in `Knowledge/Research/...` | pass |
| Live bad-file cleanup | inspect live literature/attachments folders | remove artifacts from the placeholder bug | `doi-true.md` and `doi-true.pdf` were deleted from the live vault | pass |
| Real actual-vault paper workflow | `/home/zhangyangrui/.nvm/versions/node/v24.13.0/bin/node ... paper --topic "数据治理和数智转型" --vault /home/zhangyangrui/Datesets_4_me/note/my_notebook --sources "arxiv:2012.02454v1,arxiv:2307.03198v2" --max-sources 2` | create topic note, analysis, matrix, map, outline, and draft in the user's vault | all expected notes were generated under `Knowledge/Research/Topics`, `Analysis`, `Drafts`, and `Literature` | pass |
| Vault-side manual guide | inspect `Knowledge/Research/研究工作流配置说明.md` | ensure the user has a Chinese manual beside the live research notes | guide updated to the CLI-first + OpenAlex workflow with actual example wikilinks and reload instructions | pass |
| Running-instance reload verification | inspect live `debug-runtime.log` after file sync | confirm whether the already running Obsidian process has loaded the new build | log still shows `2026-03-15T02:43:00.274Z`, so plugin reload/restart is still required | pending_user_action |

---

## Error Log

| Timestamp | Error | Attempt | Solution |
|--------|------|------|----------|
| 2026-03-15 | No new issue yet | 1 | N/A |
| 2026-03-15 | DOI-enriched PDF attachment inherited `.02454` from `https://arxiv.org/pdf/2012.02454` instead of `.pdf` | 1 | Added semantic attachment-extension inference and regression coverage in `tests/research-cli.test.ts` |
| 2026-03-15 | `parseCliArgs()` converted empty placeholder values such as `''` into `true`, which created `doi-true` files during the live vault ingest run | 1 | Switched the parser to only treat `undefined` or a following flag token as missing, then added regression coverage and cleaned the bad live-vault files |
| 2026-03-15 | Syncing files into the live plugin directory did not reload the already-running Obsidian plugin process | 1 | Added reload/restart instructions to the vault-side guide and retained `debug-runtime.log` as the verification checkpoint after the user reloads |
