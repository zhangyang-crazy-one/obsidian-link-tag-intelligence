# External Integrations

**Analysis Date:** 2026-05-12

## APIs & External Services

**No external SaaS APIs or cloud services detected.** This plugin runs entirely within the Obsidian desktop application. All integrations are either:

1. **Obsidian internal APIs** (Vault, MetadataCache, etc.)
2. **User-configured external CLI commands** (shell subprocesses)
3. **Companion Obsidian plugins** (inter-plugin communication)

## Data Storage

**Databases:**
- None. All data is stored in the Obsidian Vault file system using the Obsidian `Vault` API (`app.vault.adapter.read`, `app.vault.adapter.write`, `app.vault.process`, etc.).
- Plugin settings persisted via `Plugin.loadData()`/`Plugin.saveData()` to `data.json` in the plugin config directory.

**File Storage:**
- Obsidian Vault (local filesystem). No cloud file storage.
- Debug log written to `.obsidian/plugins/link-tag-intelligence/debug-runtime.log` (capped at 512KB).

**Caching:**
- None external. No Redis, no memcached.
- In-memory state: recent link targets (`settings.recentLinkTargets`) persisted to plugin settings.

## Authentication & Identity

**Auth Provider:**
- No separate auth. The plugin operates within the authenticated Obsidian desktop application context.
- Plugin ID: `link-tag-intelligence`
- Author: `zhangcrazyone` (declared in `manifest.json`)

## Command-Line Integrations (Desktop-Only)

These are the only external execution surfaces. Both use Node.js `child_process.exec` accessed via Obsidian's Electron `require` at `src/ingestion.ts:49-61` and `src/semantic.ts:41-61`.

### Research Ingestion CLI

**Purpose:** Creates literature notes from DOI, arXiv ID, or PDF path/URL input.

**Configuration:**
- Setting: `settings.ingestionCommand` (user-provided shell command, stored in Obsidian plugin settings)
- Timeout: `settings.ingestionTimeoutMs` (default: 60000ms)
- Configured in settings UI at `src/settings.ts` (ingestion drawer in workbench)

**Placeholders (template substitution):**
`{{source_type}}`, `{{source}}`, `{{vault}}`, `{{file}}`, `{{selection}}`, `{{literature}}`, `{{attachments}}`, `{{template}}`, `{{metadata_doi}}`, `{{metadata_arxiv}}`, `{{title}}`, `{{authors}}`, `{{year}}`, `{{download_pdf}}`, `{{open_after_import}}`

**Expected stdout JSON contract:**
```typescript
{
  note_path: string;        // Path of created note (required)
  attachment_paths: string[];
  warnings: string[];
  metadata: Record<string, unknown>;
  status?: string;
  source_type?: string;
  source_id?: string;
  title?: string;
}
```

**Implementation:** `src/ingestion.ts` - `runIngestionCommand()` function. Shell escaping via `src/shared.ts` `buildShellCommand()`.

**Desktop-only:** Requires `Platform.isDesktopApp` check. Falls back to error message if not on desktop.

### Semantic Bridge CLI

**Purpose:** External semantic/retrieval search command for citation-aware results.

**Configuration:**
- Setting: `settings.semanticCommand` (user-provided shell command)
- Enabled toggle: `settings.semanticBridgeEnabled` (default: `false`)
- Timeout: `settings.semanticTimeoutMs` (default: 30000ms)

**Placeholders:** `{{query}}`, `{{vault}}`, `{{file}}`, `{{selection}}`

**Expected stdout JSON contract:**
```typescript
// Array of results, each with optional fields:
{
  path: string;
  title?: string;
  score?: number;
  excerpt?: string;
  reason?: string;
  citekey?: string;
  author?: string;
  year?: string;
  page?: string;
  source_type?: string;
  evidence_kind?: string;
  suggested_tags: string[];
  suggested_relations: Record<string, string[]>;
}
```

**Implementation:** `src/semantic.ts` - `runSemanticSearch()` function.

**Desktop-only:** Same as ingestion CLI.

## Companion Plugin Integrations

The plugin coordinates with other Obsidian community plugins via its "Research Workbench" system. Configured in `src/companion-plugins.ts`.

### Zotero Integration (`obsidian-zotero-desktop-connector`)

**Status:** Optional companion
**Purpose:** Import existing Zotero library, citekeys, and annotations.
**Interaction:**
- Reads Zotero plugin config from `.obsidian/plugins/obsidian-zotero-desktop-connector/data.json`
- Writes recommended config via `applyCompanionPresetToVault()` (upserts export formats, cite formats, folder paths)
- Triggers Zotero import via Obsidian command system: `executeCommandByCandidates(["obsidian-zotero-desktop-connector:zdc-import-notes", "zdc-import-notes"])`
- Reads community-plugins.json to detect if enabled
- Config keys checked: `noteImportFolder`, `exportFormats`, `citeFormats`, `openNoteAfterImport`

**File:** `src/companion-plugins.ts` (functions: `readResearchWorkbenchState`, `applyCompanionPresetToVault`, `diffZoteroConfig`, `buildRecommendedZoteroConfig`)

### PDF++ (`pdf-plus`)

**Status:** Required companion (non-optional)
**Purpose:** PDF highlighting, page jumps, annotation work.
**Interaction:**
- Reads config from `.obsidian/plugins/pdf-plus/data.json`
- Writes recommended config (upserts display formats, copy commands, hover behavior, menu configs)
- Config keys checked: `displayTextFormats`, `defaultDisplayTextFormatIndex`, `copyCommands`, `hoverHighlightAction`, `highlightBacklinks`, `selectionProductMenuConfig`, `annotationProductMenuConfig`

### Smart Connections (`smart-connections`)

**Status:** Required companion (non-optional)
**Purpose:** Embeddings-based local semantic recall.
**Interaction:**
- Reads config from `.smart-env/smart_env.json` (vault root)
- Writes recommended config (language, folder exclusions, heading exclusions, results limit, render markdown)
- Opens Smart Connections view via `executeCommandByCandidates(["smart-connections:smart-connections-view", "smart-connections-view"])`
- Config keys checked: `language`, `smart_sources.folder_exclusions`, `smart_sources.excluded_headings`, `connections_lists.results_limit`, `smart_view_filter.render_markdown`

### Semantic Bridge (internal)

**Status:** Optional companion
**Purpose:** Not a separate plugin; this is the external CLI integration described above. Listed as a companion for workbench UI consistency.
**Implementation:** `src/companion-plugins.ts` `buildSemanticStatus()` - always returns `installed: true`, reads status from plugin's own settings.

## Excalidraw Integration

**Purpose:** The plugin has special support for Excalidraw files (`*.excalidraw.md`) including link insertion via the Excalidraw API.

**Interaction:**
- Detects Excalidraw views by view type `"excalidraw"` (`src/main.ts:754`)
- Uses `excalidrawPlugin.ea` (ExcalidrawAutomate API) for embedding links into Excalidraw canvas (`src/main.ts:743-786`)
- Tracks `lastExcalidrawFilePath` separately from general file path
- Excalidraw files are treated as supported note files (`isExcalidrawFile()` in `src/notes.ts`)

**File:** `src/main.ts` `insertLinkIntoEditor()` method (lines 728-793)

## Monitoring & Observability

**Error Tracking:**
- None external. Errors shown via Obsidian `Notice` API and logged to `console.error`.

**Logs:**
- Debug log: `src/debug-log.ts` writes structured JSON logs to `.obsidian/plugins/link-tag-intelligence/debug-runtime.log`
- Capped at 512KB (`MAX_LOG_BYTES`)
- Log entries are JSON objects with `ts` (ISO timestamp), `scope`, and arbitrary detail fields
- Uses a serialized write queue (`WeakMap<App, Promise<void>>`) to prevent concurrent write issues

## CI/CD & Deployment

**Hosting:**
- Obsidian Community Plugins (via GitHub Releases)
- No CI pipeline detected in repository
- Manual release workflow: update `manifest.json` version, update `versions.json`, create GitHub Release with `main.js`, `manifest.json`, `styles.css`

**Build:**
- `npm run build` produces `main.js`
- `npm run dev` for watch mode during development

## Environment Configuration

**No `.env` files required or present.** All plugin configuration is managed through:
1. Obsidian Settings UI (implemented in `src/settings.ts` `LinkTagIntelligenceSettingTab`)
2. Plugin data stored via `Plugin.loadData()`/`Plugin.saveData()` to plugin's `data.json`

**Key configurable settings:**
- `ingestionCommand` - External CLI command string
- `semanticCommand` - External semantic search command string
- `semanticBridgeEnabled` - Toggle for semantic bridge
- `workflowMode` - `"researcher"` or `"general"`
- `language` - `"system"`, `"en"`, or `"zh"`
- `tagAliasMapText` - JSON for tag alias mapping
- `tagFacetMapText` - JSON for tag facet categorization
- Paths: `researchLiteratureFolder`, `researchTemplatePath`, `researchAttachmentsFolder`
- Smart Connections: `smartConnectionsFolderExclusions`, `smartConnectionsHeadingExclusions`, `smartConnectionsResultsLimit`

## Webhooks & Callbacks

**Incoming:**
- None. No HTTP server or webhook endpoints.

**Outgoing:**
- None. No outbound HTTP requests detected in the codebase.

## Network Usage

The plugin itself makes no network requests. All network activity is delegated to:
1. User-configured ingestion CLI (runs as child process)
2. User-configured semantic bridge CLI (runs as child process)
3. Companion plugins (Smart Connections may download embedding models, Zotero Integration may sync with Zotero desktop)

---

*Integration audit: 2026-05-12*
