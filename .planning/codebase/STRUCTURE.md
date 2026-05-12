# Codebase Structure

**Analysis Date:** 2026-05-12

## Directory Layout

```
obsidian-link-tag-intelligence/
├── src/                          # TypeScript source code (18 files, ~10K lines)
│   ├── main.ts                   # Plugin entry point
│   ├── view.ts                   # Sidebar ItemView
│   ├── modals.ts                 # All modal dialogs
│   ├── settings.ts               # Settings tab and defaults
│   ├── editor-extension.ts       # CodeMirror 6 ViewPlugin
│   ├── notes.ts                  # Note/file operations
│   ├── references.ts             # Reference parsing and formatting
│   ├── tags.ts                   # Tag management and suggestions
│   ├── ingestion.ts              # Research source ingestion
│   ├── semantic.ts               # Semantic search bridge
│   ├── companion-plugins.ts      # Research workbench companions
│   ├── reference-preview.ts      # Hover preview popover
│   ├── reading-hover-controller.ts # Reading mode hover
│   ├── shared.ts                 # Shared utilities (parsing, shell building)
│   ├── i18n.ts                   # Bilingual translations (en/zh)
│   ├── debug-log.ts              # Structured debug logging
│   ├── view-refresh.ts           # View refresh coordination
│   └── icons.ts                  # Icon constant
├── tests/                        # Vitest test files (7 files)
│   ├── mocks/
│   │   └── obsidian.ts           # Obsidian API stubs
│   ├── helpers.test.ts           # Core logic tests
│   ├── companion-plugins.test.ts # Research workbench tests
│   ├── view-refresh.test.ts      # View refresh logic tests
│   ├── paper-workflow.test.ts    # Paper workflow CLI tests
│   ├── research-cli.test.ts      # Research CLI tests
│   └── reference-cli.test.ts     # Reference CLI tests
├── cli/                          # CLI tools for shell integration
│   ├── workflow-lib.mjs          # Paper ingestion pipeline
│   ├── research-lib.mjs          # Research operations
│   ├── reference-lib.mjs         # Reference operations
│   └── lti-research.mjs          # LTI research command
├── docs/                         # Documentation
│   └── superpowers/
│       ├── plans/                # Feature plans
│       └── specs/                # Feature specifications
├── planning/                     # Development planning
│   └── brainstorms/              # Feature brainstorms
├── .planning/                    # GSD planning artifacts
│   └── codebase/                 # Codebase analysis documents
├── .github/
│   └── workflows/
│       └── ci.yml                # CI pipeline (test + type check + lint)
├── .claude/                      # Claude Code configuration
│   ├── settings.json             # Hooks and permissions
│   ├── rules/                    # Rule files
│   └── agents/                   # Agent configurations
├── styles.css                    # Plugin CSS styles (117KB)
├── main.js                       # Bundled plugin output (325KB)
├── manifest.json                 # Obsidian plugin manifest
├── versions.json                 # Version compatibility map
├── package.json                  # npm package definition
├── package-lock.json             # Dependency lock file
├── tsconfig.json                 # TypeScript configuration
├── esbuild.config.mjs            # esbuild build configuration
├── vitest.config.ts              # Vitest test configuration
├── eslint.config.cjs             # ESLint configuration
├── .mcp.json                     # MCP server configuration
└── README.md                     # Project README
```

## Directory Purposes

**src/:**
- Purpose: All TypeScript source code for the Obsidian plugin
- Contains: 18 `.ts` files with no subdirectories (flat structure)
- Key files: `main.ts` (plugin entry, 1282 lines), `settings.ts` (1565 lines), `view.ts` (1050 lines), `i18n.ts` (1054 lines), `modals.ts` (953 lines), `tags.ts` (860 lines)

**tests/:**
- Purpose: Vitest test files, co-located with `mocks/` subdirectory for Obsidian API stubs
- Contains: 6 `.test.ts` files + 1 mock file
- Key files: `helpers.test.ts` (core logic), `mocks/obsidian.ts` (API stubs used by all tests via Vitest alias)

**cli/:**
- Purpose: CLI tools written in plain `.mjs` for external shell integration; called by ingestion and semantic search commands in `src/ingestion.ts` and `src/semantic.ts`
- Contains: 4 `.mjs` files (workflow-lib.mjs is largest at 26KB)
- Key files: `workflow-lib.mjs` (paper ingestion pipeline), `lti-research.mjs` (research command entry)

**docs/:**
- Purpose: Documentation for feature plans and specifications
- Contains: `superpowers/plans/` and `superpowers/specs/`

**planning/:**
- Purpose: Development planning artifacts (brainstorms)
- Contains: `brainstorms/` with feature idea documents

**.planning/:**
- Purpose: GSD (Goal-Structured Development) planning artifacts
- Contains: `codebase/` with architecture and structure analysis documents
- Committed: Yes

**.github/:**
- Purpose: GitHub Actions CI configuration
- Contains: `workflows/ci.yml` (test job + lint job on Node 20)

**.claude/:**
- Purpose: Claude Code project configuration (rules, agents, hooks)
- Contains: `settings.json`, `rules/*.md`, `agents/`
- Committed: Yes

**Root files:**
- `main.js`: Bundled plugin output via esbuild (325KB), committed for direct Obsidian installation
- `styles.css`: Plugin CSS stylesheet (117KB), committed for plugin release
- `manifest.json`: Obsidian plugin manifest (id: `link-tag-intelligence`, minAppVersion: `1.6.0`)
- `versions.json`: Maps plugin versions to minimum Obsidian versions (38 versions from 0.1.0 to 0.1.38)

## Key File Locations

**Entry Points:**
- `src/main.ts`: Plugin bootstrap, `LinkTagIntelligencePlugin` class with `onload()`/`onunload()` lifecycle
- `esbuild.config.mjs`: Build entry, bundles `src/main.ts` into `main.js` with `obsidian` and `@codemirror/*` as externals
- `main.js`: Runtime entry for Obsidian (bundled output, single file)

**Configuration:**
- `tsconfig.json`: TypeScript strict mode, ES2021 target, ESNext modules, bundler moduleResolution
- `esbuild.config.mjs`: esbuild build with tree shaking, cjs format, source maps in dev
- `vitest.config.ts`: Vitest with `obsidian` alias resolving to `tests/mocks/obsidian.ts`
- `eslint.config.cjs`: ESLint configuration
- `manifest.json`: Plugin ID `link-tag-intelligence`, version 0.1.38
- `versions.json`: 38 version entries, all targeting min App version 1.6.0

**Core Logic:**
- `src/notes.ts`: Note file utilities (`resolveNoteTarget`, `collectLinkCandidates`, `getOutgoingLinkFiles`, `getBacklinkFiles`, `getOutgoingExactReferences`, `getIncomingExactReferences`, `findUnlinkedMentions`, `isSupportedNoteFile`, `isExcalidrawFile`)
- `src/references.ts`: Reference parsing (`extractLegacyLineReferences`, `extractNativeBlockReferences`), formatting (`formatLegacyBlockReference`, `formatLegacyLineReference`), preview (`getBlockReferencePreview`, `getLineRangePreview`)
- `src/tags.ts`: Tag management (`getAllTagsForFile`, `getTagStats`, `suggestTagsForFile`, `appendTagsToFrontmatter`, `deleteTagAcrossVault`, `renameTagAcrossVault`)
- `src/shared.ts`: JSON parsing (`parseTagAliasMap`, `parseTagFacetMap`), shell command building (`buildShellCommand`, `buildSemanticCommand`, `buildIngestionCommand`)
- `src/i18n.ts`: Translation function `tr(language, key, vars?)` with 100+ translation keys

**UI Components:**
- `src/view.ts`: `LinkTagIntelligenceView` (sidebar panel with 10 expandable sections)
- `src/modals.ts`: 8 modal classes (`LinkInsertModal`, `ReferenceInsertModal`, `RelationKeyModal`, `ResearchIngestionModal`, `SemanticSearchModal`, `TagManagerModal`, `TagSuggestionModal`, `TextPromptModal`)
- `src/editor-extension.ts`: CodeMirror 6 ViewPlugin with hover tooltips and widgets for inline references
- `src/reference-preview.ts`: `ReferencePreviewPopover` class for floating preview cards
- `src/reading-hover-controller.ts`: Reading mode hover controller for MarkdownPostProcessor context

**External Integration:**
- `src/ingestion.ts`: Shell-based research source ingestion via `child_process.exec`
- `src/semantic.ts`: Shell-based semantic search bridge
- `src/companion-plugins.ts`: Research workbench config for Zotero, PDF++, Smart Connections, Semantic Bridge

**Testing:**
- `tests/mocks/obsidian.ts`: Minimal Obsidian API stubs (App, TFile, Plugin, Notice, etc.)
- `tests/helpers.test.ts`: Core logic unit tests (notes.ts, references.ts, tags.ts, shared.ts, i18n.ts)
- `tests/companion-plugins.test.ts`: Config diffing and upsert logic for companion plugins
- `tests/view-refresh.test.ts`: Refresh request merging and filtering logic
- `tests/paper-workflow.test.ts`: CLI workflow-lib.mjs helpers
- `tests/research-cli.test.ts`: CLI research-lib.mjs helpers
- `tests/reference-cli.test.ts`: CLI reference-lib.mjs helpers

## Naming Conventions

**Files:**
- Kebab-case for module files: `editor-extension.ts`, `reference-preview.ts`, `companion-plugins.ts`, `reading-hover-controller.ts`, `debug-log.ts`, `view-refresh.ts`
- Single-word files for core domains: `main.ts`, `view.ts`, `tags.ts`, `notes.ts`, `modals.ts`, `references.ts`, `ingestion.ts`, `semantic.ts`, `settings.ts`, `shared.ts`, `i18n.ts`, `icons.ts`
- Test files: `{name}.test.ts` matching the source file or feature name

**Directories:**
- No nested directories under `src/` (flat structure)
- Naming: lowercase, descriptive (`tests/mocks`, `cli`, `docs/superpowers`, `planning/brainstorms`)

**Functions:**
- camelCase: `getContextNoteFile`, `buildSnapshot`, `applySnapshot`, `resolveNoteTarget`, `extractLegacyLineReferences`, `parseTagAliasMap`
- Boolean predicates: prefixed with `is` or `should`: `isSupportedNoteFile`, `isExcalidrawFile`, `isIngestionConfigured`, `shouldHandleViewRefresh`
- Getter functions: prefixed with `get`: `getContextNoteFile`, `getAllTagsForFile`, `getTagStats`
- Async functions: `async function` or returning `Promise`
- Private methods: no underscore prefix

**Types/Interfaces:**
- Type aliases (preferred over interfaces): `type WorkflowMode`, `type ViewRefreshReason`, `type SidebarSectionId`, `type ExactReference`
- Interfaces used only for Obsidian API conformance (e.g., `ResearchWorkbenchState`)
- PascalCase for all type names
- Const objects for CSS classes: `CssClasses` (UPPER_SNAKE_CASE properties)

**Variables:**
- camelCase for locals and instance fields
- UPPER_SNAKE_CASE for constants: `LEGACY_RELATION_KEYS`, `RESEARCH_RELATION_KEYS`, `DEFAULT_TAG_FACET_MAP_TEXT`
- Configuration constants: `CssClasses`, `Layout`, `SECTION_DEFINITIONS`
- Module-level class instances prefixed with `new` in const: `const controllerMap = new WeakMap()`

**Exports:**
- Default export: only `LinkTagIntelligencePlugin` in `src/main.ts`
- Named exports: all other modules (functions, classes, types, constants)

**CSS Classes:**
- Prefix `lti-` for all plugin CSS classes: `lti-section`, `lti-toolbar`, `lti-list-row`, `lti-pill`, `lti-hover-preview`, `lti-cm-tooltip`
- State classes: `is-collapsed`, `is-hidden`, `is-missing`

## Where to Add New Code

**New Feature (e.g., new link type, new tag operation):**
- Primary code: Add to the appropriate domain module (`src/notes.ts`, `src/references.ts`, or `src/tags.ts`) as exported pure functions
- Tests: `tests/{feature}.test.ts` or add to `tests/helpers.test.ts` for small additions
- If feature requires new settings: add fields to `DEFAULT_SETTINGS` and the settings tab in `src/settings.ts`
- If feature requires new i18n strings: add translation keys to `src/i18n.ts`

**New Modal/Dialog:**
- Implementation: Add a new exported class to `src/modals.ts` extending `Modal` or `SuggestModal`
- Usage: Add a public method on `LinkTagIntelligencePlugin` in `src/main.ts` that instantiates and opens the modal
- Command: Register via `addCommand` in `src/main.ts` `onload()`

**New Sidebar Section:**
- Section definition: Add to `SECTION_DEFINITIONS` array in `src/view.ts`
- Snapshot type: Add new snapshot interface to `src/view.ts`
- Build logic: Add method to `buildSnapshot()` in `src/view.ts`
- Render logic: Add case to `updateSection()` switch statement in `src/view.ts`
- Command focus: Use `focusSectionId` in `ViewRefreshRequest` to focus the new section

**New Editor Decoration:**
- Implementation: Add to `src/editor-extension.ts` in the `ViewPlugin` or as a new extension
- Pattern: Follow existing `collectEditorReferences` → decoration → `hoverTooltip` pattern

**New External Integration:**
- Command building: Add template building to `src/shared.ts` if it uses shell command templates
- Core logic: Create a new file `src/{feature}.ts` following the pattern of `ingestion.ts` or `semantic.ts`
- Config: Add to companion plugins profile in `src/companion-plugins.ts` if it integrates with another Obsidian plugin

**Utilities:**
- Shared helpers: Add to `src/shared.ts` if used by 2+ modules
- Module-specific helpers: Keep private in the module file (no separate `utils/` directory)

## Special Directories

**node_modules/:**
- Purpose: npm dependencies (esbuild, typescript, eslint, vitest, obsidian types)
- Generated: Yes (by `npm install`)
- Committed: No (in `.gitignore`)

**main.js:**
- Purpose: Bundled plugin output for Obsidian runtime
- Generated: Yes (by `esbuild.config.mjs`)
- Committed: Yes (required for plugin release, loaded by Obsidian)

**styles.css:**
- Purpose: Plugin CSS stylesheet
- Generated: No (hand-written)
- Committed: Yes (required for plugin release)

**.tmp/:**
- Purpose: Temporary files from CLI operations
- Generated: Yes (by CLI tools)
- Committed: No

**.agents/skills/:**
- Purpose: Claude Code agent skill definitions (frontend-evolution)
- Generated: No (hand-written)
- Committed: Yes

---

*Structure analysis: 2026-05-12*
