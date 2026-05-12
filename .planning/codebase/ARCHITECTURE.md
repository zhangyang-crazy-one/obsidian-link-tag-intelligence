# Architecture

**Analysis Date:** 2026-05-12

## Pattern Overview

**Overall:** Plugin-Mediated Service Layer

A single plugin class (`LinkTagIntelligencePlugin`) acts as the central mediator, connecting Obsidian API events to domain feature modules. Feature modules export pure utility functions with no internal state. The sidebar view decouples rendering from logic using a snapshot-based pattern: the view builds a complete data snapshot asynchronously, then applies that snapshot to the DOM.

**Key Characteristics:**
- Single Plugin entry point (`src/main.ts`) that registers all commands, events, and extensions
- Domain feature modules organized by noun (tags, references, notes, ingestion) with minimal cross-coupling
- Snapshot-based view rendering: data assembly is separate from DOM manipulation
- CodeMirror 6 integration via `registerEditorExtension()` for inline reference decorations and hover tooltips
- Companion plugin integration for research workflows (Zotero, PDF++, Smart Connections)
- Bilingual i18n (English/Chinese) with a centralized translation key system
- CLI tools in `cli/` for external shell-based ingestion and semantic search
- Structured debug logging to vault config directory

## Layers

**Plugin Core:**
- Purpose: Orchestrates all plugin behavior, registers commands/events/extensions, manages settings lifecycle, exposes public API methods that modal and view code call
- Location: `src/main.ts`
- Contains: `LinkTagIntelligencePlugin` class extending `Plugin`
- Depends on: All feature modules (`notes.ts`, `references.ts`, `tags.ts`, `ingestion.ts`, `semantic.ts`, `companion-plugins.ts`, `shared.ts`, `i18n.ts`, `settings.ts`, `modals.ts`, `editor-extension.ts`, `view.ts`, `reference-preview.ts`, `reading-hover-controller.ts`, `debug-log.ts`, `view-refresh.ts`, `icons.ts`)
- Used by: Obsidian Plugin API (loaded/unloaded by Obsidian), `view.ts` (via type-only import), `modals.ts` (via type-only import)

**UI Layer:**
- Purpose: Renders the sidebar panel, modal dialogs, editor decorations, and hover previews
- Location: `src/view.ts`, `src/modals.ts`, `src/editor-extension.ts`, `src/reference-preview.ts`, `src/reading-hover-controller.ts`
- Contains: `LinkTagIntelligenceView` (ItemView subclass), modal classes (`LinkInsertModal`, `ReferenceInsertModal`, `RelationKeyModal`, `ResearchIngestionModal`, `SemanticSearchModal`, `TagManagerModal`, `TagSuggestionModal`, `TextPromptModal`), CodeMirror ViewPlugin, `ReferencePreviewPopover`, `LegacyReadingHoverController`
- Depends on: Plugin core (type-only for classes, instance methods for actions), domain modules, Obsidian ItemView/SuggestModal/HoverPopover APIs, CodeMirror state/view
- Used by: Plugin core (registers view, opens modals, registers editor extension)

**Domain Logic:**
- Purpose: Pure utility functions for note operations, reference parsing, tag management, and file resolution
- Location: `src/notes.ts`, `src/references.ts`, `src/tags.ts`
- Contains: `resolveNoteTarget`, `getOutgoingLinkFiles`, `getBacklinkFiles`, `getOutgoingExactReferences`, `getIncomingExactReferences`, `findUnlinkedMentions`, `getAllTagsForFile`, `extractLegacyLineReferences`, `extractNativeBlockReferences`, `suggestTagsForFile`, `appendTagsToFrontmatter`, `deleteTagAcrossVault`, `renameTagAcrossVault`
- Depends on: Obsidian App/MetadataCache/TFile/Vault APIs, `references.ts` (used by `notes.ts`), `shared.ts` (used by `tags.ts`)
- Used by: Plugin core, UI layer (view.ts calls domain functions to build snapshots)

**External Integration:**
- Purpose: Shell-based ingestion of research sources and semantic search via external CLI tools
- Location: `src/ingestion.ts`, `src/semantic.ts`, `src/companion-plugins.ts`
- Contains: `runIngestionCommand`, `runSemanticSearch`, `isIngestionConfigured`, `isSemanticBridgeConfigured`, `buildResearchWorkbenchProfile`, `readResearchWorkbenchState`, `applyCompanionPresetToVault`
- Depends on: Obsidian App, Node.js `child_process` (via desktop `require`), `shared.ts` (for shell command building), `settings.ts` types
- Used by: Plugin core (wraps shell calls in async methods)

**Settings:**
- Purpose: Plugin settings definition, default values, loading/normalization, and settings tab UI
- Location: `src/settings.ts`
- Contains: `DEFAULT_SETTINGS`, `normalizeLoadedSettings`, `LinkTagIntelligenceSettingTab` (extends `PluginSettingTab`), `LinkTagIntelligenceSettings` type, `WorkflowMode` type, relation key constants
- Depends on: Obsidian Plugin/SettingTab, `companion-plugins.ts` types, `i18n.ts` types
- Used by: Plugin core (loads/saves/normalizes settings), view (reads settings for context)

**Cross-Cutting:**
- Purpose: Shared utilities, i18n, debug logging, view refresh coordination, CSS constants
- Location: `src/shared.ts`, `src/i18n.ts`, `src/debug-log.ts`, `src/view-refresh.ts`, `src/icons.ts`
- Contains: `parseTagAliasMap`, `parseTagFacetMap`, `buildShellCommand`, `buildSemanticCommand`, `buildIngestionCommand`, `tr()`, `relationKeyLabel`, `debugLog`, `resetDebugLog`, `mergeViewRefreshRequests`, `shouldHandleViewRefresh`, `CssClasses`, `Layout`
- Depends on: Minimal (shared.ts is leaf; i18n.ts is leaf; debug-log.ts depends on Obsidian; view-refresh.ts is leaf)
- Used by: Nearly all other modules

## Data Flow

**Sidebar View Refresh Flow:**

1. Obsidian event fires (`file-open`, `metadataCache changed`, `active-leaf-change`, `vault rename`)
2. Plugin event handler determines context (file, editor leaf) and calls `refreshAllViews(request)`
3. `refreshAllViews` iterates all `LinkTagIntelligenceView` leaves and calls `view.requestRefresh(request)`
4. `requestRefresh` merges the request with any pending request and schedules via `requestAnimationFrame`
5. On animation frame, `flushPendingRefresh` calls `performRefresh` which calls `buildSnapshot`
6. `buildSnapshot` gathers all data from domain modules: outgoing links, backlinks, references, relations, tags, unlinked mentions, ingestion status, semantic status
7. `buildSnapshot` returns a `SidebarSnapshot` with all section data and dependency paths
8. `applySnapshot` updates each section shell only if the serialized signature changed (diff-based DOM update)
9. On open/resolve, file is opened in the appropriate leaf and displayed at the correct line/block

**Link Insertion Flow:**

1. User triggers command (e.g., `insert-link-with-preview`) → Plugin checks context (`getContextNoteFile`)
2. `LinkInsertModal` opens → uses `collectLinkCandidates` from `notes.ts` via `SuggestModal`
3. User selects a candidate → `insertLinkIntoEditor` is called on the plugin
4. If Excalidraw file: uses Excalidraw plugin API (`ea.addEmbeddable`) to embed a link element
5. Otherwise: inserts `[[wikilink]]` text via editor `replaceSelection` or `Vault.process`
6. Target path pushed to recent targets, settings saved, views refreshed

**Research Ingestion Flow:**

1. User opens `ResearchIngestionModal` → enters source (DOI, arXiv ID, or PDF path)
2. Plugin calls `runResearchIngestion` → delegates to `runIngestionCommand` in `ingestion.ts`
3. `ingestion.ts` builds a shell command from settings template, executes via `child_process.exec`
4. On success: note created, recent target updated, optionally opens the imported note
5. On error: maps error codes to translated user messages

**Editor Reference Decoration Flow:**

1. CodeMirror `ViewPlugin` decorates live editor with reference widgets
2. `hoverTooltip` on decorated references: calls `plugin.getReferencePreviewData` asynchronously
3. Plugin resolves the target file, reads line range or block content, returns `ReferencePreviewData`
4. Content rendered as `ReferencePreviewPopover` (in editor) or native `HoverPopover` (triggered via `hover-link` workspace event)

**Context Tracking Flow:**

1. Plugin maintains `lastEditorLeaf`, `lastEditorFilePath`, `lastSupportedFilePath`, `lastExcalidrawFilePath`
2. On leaf changes: `captureEditorContext` and `captureSupportedFileContext` update tracking
3. `getContextNoteFile` has multi-tier fallback: active file → active view file → Excalidraw fallback → editor view file → last supported file path
4. This enables consistent context even when focus moves between Excalidraw and Markdown views

**State Management:**
- Plugin settings: stored persistently via Obsidian `loadData()`/`saveData()` API, normalized on load
- View context tracking: in-memory fields on the plugin instance (`lastEditorLeaf`, `lastSupportedFilePath`, etc.)
- View pending refresh: per-view `pendingRefresh` request, deduplicated by path and merged by priority
- View section expand/collapse: per-view `sectionState` Map in `LinkTagIntelligenceView`
- Toolbar/section rendering: signature-based diffing (serialized JSON comparison) to skip unnecessary DOM updates
- Reference preview token: monotonically increasing integer to cancel stale async preview requests

## Key Abstractions

**LinkTagIntelligencePlugin:**
- Purpose: Central plugin class; owns all state tracking, settings, and reference preview popover instance
- Examples: `src/main.ts` (1282 lines, single default export class)
- Pattern: Extends `Plugin`, provides public API methods consumed by view/modals, coordinates all feature modules

**LinkTagIntelligenceView:**
- Purpose: Sidebar panel rendered in workspace leaf; snapshots data and diff-renders sections
- Examples: `src/view.ts` (1050 lines)
- Pattern: Extends `ItemView`, builds `SidebarSnapshot` from domain functions, applies via section shells, uses `requestAnimationFrame` batching for refresh coalescing

**SidebarSnapshot:**
- Purpose: Complete serializable representation of sidebar state (toolbar, 10 sections, dependency paths)
- Examples: `src/view.ts` (lines 161-176, `SidebarSnapshot` type)
- Pattern: Union of section-specific snapshot types (`CurrentNoteSnapshot | FileSectionSnapshot | ReferenceSectionSnapshot | RelationSectionSnapshot | TagSectionSnapshot | MentionSectionSnapshot | StatusSectionSnapshot`)

**ExactReference:**
- Purpose: Typed representation of a precise reference (block or line) between two note files
- Examples: `src/notes.ts` (lines 35-49)
- Pattern: Includes source and target files, metadata for both, preview text, start/end lines, block ID

**ViewRefreshRequest:**
- Purpose: Typed refresh trigger with reason, changed paths, and options
- Examples: `src/view-refresh.ts` (lines 3-9)
- Pattern: Four reasons (`context` > `settings` > `mutation` > `metadata`), priority-based merging, path-based filtering for metadata-triggered refreshes

**ResearchWorkbenchState:**
- Purpose: Snapshot of research companion plugin statuses and recommended configuration
- Examples: `src/companion-plugins.ts` (lines 37-41)
- Pattern: Aggregates profile settings, enabled plugin IDs, and per-plugin status with mismatch detection

**TagFacetMap:**
- Purpose: Hierarchical classification of tags into facets (topic, method, dataset, theory, status, writing_stage, source_kind)
- Examples: `src/shared.ts` (line 26, `TagFacetMap` type), `src/settings.ts` (lines 61-100, `DEFAULT_TAG_FACET_MAP_TEXT`)
- Pattern: `Map<facetName, Map<canonicalTag, alias[]>>`, parsed from JSON user setting

## Entry Points

**Plugin Lifecycle:**
- Location: `src/main.ts`
- Triggers: Obsidian loads/unloads the plugin
- Responsibilities: Registers view, ribbon icon, commands, settings tab, events, editor extension, markdown post-processor, hover link source

**Obsidian Commands (11 registered):**
| Command ID | Handler Method |
|---|---|
| `open-panel` | `openIntelligencePanel()` |
| `insert-link-with-preview` | `openLinkInsertModal("wikilink")` |
| `quick-link-selection` | `openLinkInsertModal("quick_link")` |
| `insert-block-reference` | `openBlockReferenceFlow()` |
| `insert-line-reference` | `openLineReferenceFlow()` |
| `add-relation-to-current-note` | `openRelationFlow()` |
| `manage-native-tags` | `openTagManager()` |
| `suggest-tags-for-current-note` | `openTagSuggestion()` |
| `ingest-research-source` | `openResearchIngestion()` |
| `semantic-search-external` | `openSemanticSearch()` |

**Ribbon Icon:**
- Location: `src/main.ts` (line 78)
- Triggers: User clicks sidebar ribbon icon
- Responsibilities: Opens intelligence panel via `openIntelligencePanel()`

**Settings Tab:**
- Location: `src/settings.ts` (`LinkTagIntelligenceSettingTab`)
- Triggers: User opens plugin settings in Obsidian
- Responsibilities: Renders all plugin configuration options

**Registered Events (6 auto-cleaned via `registerEvent`):**
- `file-open`: Updates file context, refreshes all views
- `metadataCache.on("changed")`: Refreshes views when current file metadata changes
- `active-leaf-change`: Captures editor/file context with `setTimeout(0)` to handle Excalidraw async loading
- `vault.on("rename")`: Refreshes views for both old and new paths
- `hover-link` source registration: Enables native hover preview for custom references

**Editor Extension:**
- Location: `src/editor-extension.ts` (`buildReferenceEditorExtension`)
- Triggers: Registered via `registerEditorExtension` during `onload`
- Responsibilities: Decorates inline references with widgets, shows hover tooltips, handles click-to-navigate

**Markdown Post-Processor:**
- Location: `src/main.ts` (line 302, `registerMarkdownPostProcessor`)
- Triggers: Obsidian renders markdown in reading view
- Responsibilities: Renders legacy reference syntax with hover controllers for reading mode

## Error Handling

**Strategy:** Graceful degradation with translated error messages

**Patterns:**
- Shell command failures: errors mapped to translation keys (`ingestionErrorToMessage`, `semanticErrorToMessage`) with specific error codes (`desktop-only`, `desktop-shell-unavailable`, `missing-command`, `invalid-doi`, etc.)
- Parse failures (alias map, facet map): caught in try/catch, logged to console with `console.warn`, shown as `Notice` with translated message
- File resolution failures: `resolveNoteTarget` returns null; callers check and show fallback `Notice` or return empty snapshots
- Async reference preview: token-based cancellation (`referencePreviewToken` incremented on each new request; stale results discarded)
- Modal actions: `runModalTask` wraps user actions in try/catch with `console.error` and `Notice` fallback

## Cross-Cutting Concerns

**Logging:** Structured JSON logs via `debugLog(app, scope, details)` → queued writes to `.obsidian/plugins/link-tag-intelligence/debug-runtime.log` (max 512KB), rotation on overflow. Writes are serialized per-App via `WeakMap`-based queue.

**Validation:** Settings normalized on load via `normalizeLoadedSettings()`. Tag alias/facet maps parsed with try/catch fallback to empty Map. Excalidraw file detection via `isExcalidrawFile()`.

**Authentication:** Not applicable (no external auth required). Companion plugin integration uses Obsidian's internal plugin API.

**Internationalization:** Centralized in `src/i18n.ts` via `tr(language, key, vars?)` function. Supports `en` and `zh`. Language resolved from settings (`system` → browser locale detection → `en` fallback). All 100+ user-facing strings have translation keys.

---

*Architecture analysis: 2026-05-12*
