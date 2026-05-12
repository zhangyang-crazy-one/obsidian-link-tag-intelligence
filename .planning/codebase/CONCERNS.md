# Codebase Concerns

**Analysis Date:** 2026-05-12

## Tech Debt

**Large monolithic files:**
- Issue: Multiple source files exceed 1000 lines, making them difficult to navigate, test, and maintain. The plugin class in main.ts mixes lifecycle management, command registration, modal orchestration, reference preview logic, error message mapping, and companion plugin integration into a single 1282-line file. The view class in view.ts (1050 lines) handles toolbar rendering, section snapping, snapshot building, and DOM management in one class.
- Files: `src/main.ts` (1282 lines), `src/settings.ts` (1565 lines), `src/i18n.ts` (1054 lines), `src/view.ts` (1050 lines)
- Impact: Changes to any one concern touch these files. Reviewers must reason about the entire file. Testing individual concerns is impractical.
- Fix approach: Extract concerns into dedicated modules. For main.ts: extract reference preview management into its own controller, move error-to-message mapping to a dedicated file, separate command registrations into a command module. For view.ts: extract snapshot builders, section renderers, and toolbar management into separate files.

**Duplicated Node.js child_process bridge:**
- Issue: `getDesktopRequire()` and `getExecFunction()` are implemented identically in both `src/ingestion.ts` (lines 49-69) and `src/semantic.ts` (lines 41-61). The same pattern of accessing `globalThis.require` and importing `child_process` is duplicated along with type definitions for `ExecFunction` and `ChildProcessModule`.
- Files: `src/ingestion.ts`, `src/semantic.ts`
- Impact: Bug fixes or hardening of the desktop shell bridge must be applied in two places. Divergence is likely over time.
- Fix approach: Extract into a shared module (e.g., `src/desktop-shell.ts`) that both ingestion and semantic import. Export a single `getExecFunction()` with the common types.

**Hardcoded configuration defaults:**
- Issue: Default paths for research workflow (`RESEARCH_LITERATURE_PATH`, `RESEARCH_TEMPLATE_PATH`, `RESEARCH_ATTACHMENTS_PATH`) and Smart Connections exclusions are hardcoded at the top of `src/settings.ts` (lines 28-44). These represent one user's vault structure and are unlikely to match others.
- Files: `src/settings.ts`
- Impact: New users get pre-filled paths they must change. If a user doesn't notice, features that depend on these paths (Zotero export, template lookup) fail silently.
- Fix approach: Either leave defaults empty and provide clear setup guidance, or detect the user's vault structure on first load.

**Fire-and-forget async patterns (`void` operator):**
- Issue: Over 25 instances of `void` used to explicitly ignore promise rejections across the codebase. Examples include `void this.openIntelligencePanel()` (`main.ts:79`), `void this.saveSettings()` (`main.ts:993`), `void leaf.openFile(file).then(...)` (`main.ts:1130`), and `void this.renderWorkbench(shell, token)` (`settings.ts:359`). These operations can fail silently with no user-visible error.
- Files: `src/main.ts` (lines 79, 86, 993, 1130, 1140, 1159), `src/modals.ts` (lines 49, 339, 341, 800, 804, 813, 945, 949), `src/settings.ts` (lines 359, 627, 634, 648, 660, 877, 958, 1442, 1449, 1461), `src/view.ts` (line 301), `src/references.ts` (lines 331, 345)
- Impact: Operations can fail without user feedback. For example, if `saveSettings()` fails, the user has no indication their changes were not persisted.
- Fix approach: Audit each `void` usage. For genuinely non-critical operations that should be fire-and-forget, add a `.catch()` with at minimum a `console.error()`. For operations like `saveSettings()` and `openFile()`, consider showing a Notice on failure.

**Widespread unsafe type assertions:**
- Issue: Over 50 `as` type assertions scattered across the codebase, many on JSON-parsed data and Obsidian internal APIs. Examples: `(this.app as InternalApp)` (`main.ts:743`), `(parsed as Record<string, unknown>)` (`shared.ts:39`), `shell.innerEl, snapshot as CurrentNoteSnapshot` (`view.ts:785`), `(globalThis as typeof globalThis & { require?: ... })` (`ingestion.ts:50`). These bypass TypeScript's type checking.
- Files: `src/main.ts`, `src/view.ts`, `src/ingestion.ts`, `src/semantic.ts`, `src/shared.ts`, `src/settings.ts`, `src/tags.ts`, `src/companion-plugins.ts`, `src/editor-extension.ts`, `src/modals.ts`
- Impact: Runtime type errors are possible when Obsidian's internal APIs change or CLI output format shifts. Debugging cast-related failures requires tracing through the assertion chain.
- Fix approach: Introduce type guard functions for frequently-used patterns (e.g., `isRecord(value): value is Record<string, unknown>`). Replace `as` casts on JSON data with runtime validation that throws descriptive errors.

**Large i18n file with growing translations:**
- Issue: `src/i18n.ts` is 1054 lines and contains two full language maps (English and Chinese) as object literals. The `TranslationKey` union type (lines 4-260+) lists 260+ string keys. Adding new UI text requires touching both maps and the type.
- Files: `src/i18n.ts`
- Impact: Adding a string requires updates to three places. Missing a translation silently falls back to English. The file is likely to keep growing.
- Fix approach: Consider splitting translations into per-language JSON files loaded at runtime. Use a build-time check to ensure all keys exist in all languages.

## Known Bugs

**`JSON.parse` without try-catch in shared utilities:**
- Symptoms: If `parseTagAliasMap()` or `parseTagFacetMap()` in `src/shared.ts` receives invalid JSON, the plugin throws an unhandled exception that can prevent the view from loading or the settings tab from rendering.
- Files: `src/shared.ts` (lines 39, 61) — `JSON.parse(text)` is called without a try-catch. Callers in `src/main.ts` (lines 413, 422) do wrap the calls in try-catch, but callers in `src/tags.ts` (lines 667-680) also do. However any new caller that skips the try-catch will cause a crash.
- Trigger: Enter malformed JSON in settings fields for tag alias map or tag facet map, then open a view that calls `getTagAliasMap()` or `getTagFacetMap()`.
- Workaround: Fix the JSON in the settings field. Reset settings to defaults.

**`setTimeout` race condition in active-leaf-change handler:**
- Symptoms: The active-leaf-change event handler in `src/main.ts` (line 250) uses `setTimeout(() => {...}, 0)` to defer processing. If the user rapidly switches tabs, multiple timeouts queue up, each reading potentially stale state from `leaf` captured in a closure. This can cause incorrect file context detection.
- Files: `src/main.ts` (lines 241-291)
- Trigger: Rapid tab switching in Obsidian (Ctrl+Tab repeatedly).
- Workaround: None. A switch back to the original tab eventually resets the state.

**Silent empty catch on community-plugins.json read:**
- Symptoms: `readResearchWorkbenchState()` (`src/companion-plugins.ts:490`) reads `community-plugins.json` with `.catch(() => "[]")`. If the file exists but is corrupt, it silently falls back to empty array. This masks configuration issues.
- Files: `src/companion-plugins.ts` (line 490)
- Trigger: Corrupt `community-plugins.json` in the vault.
- Workaround: Manually fix or regenerate the community-plugins.json file.

## Security Considerations

**Desktop shell command execution via user-configured templates:**
- Risk: Both `src/ingestion.ts` and `src/semantic.ts` allow users to configure arbitrary shell commands that are executed via Node.js `child_process.exec`. The command template uses `{{placeholder}}` substitution. While the code does shell-escape user-provided values (`shared.ts:107-116`), the command template itself is user-provided and could be set to execute arbitrary system commands. Since Obsidian plugins have full filesystem access via the Vault API anyway, this is not a privilege escalation, but it does bypass Obsidian's plugin sandbox.
- Files: `src/ingestion.ts` (lines 106-154), `src/semantic.ts` (lines 103-146), `src/shared.ts` (lines 107-145)
- Current mitigation: The feature is only enabled when the user explicitly configures a CLI command. Platform check (`Platform.isDesktopApp`) gates execution. Values are shell-escaped.
- Recommendations: Document clearly in settings UI that the ingestion/semantic commands run as shell commands with full user privileges. Consider showing the resolved command in settings for transparency.

**Accessing Obsidian internals via type assertions on App:**
- Risk: The plugin accesses internal Obsidian APIs not exposed in the public type declarations: `app.plugins` (`main.ts:743`), `app.setting` (`main.ts:372`), `app.commands` (`main.ts:1256`), and `app.vault.adapter` internals (`companion-plugins.ts:152`). These APIs can change without notice in minor Obsidian updates.
- Files: `src/main.ts` (lines 372, 743, 1256), `src/companion-plugins.ts` (lines 152, 168)
- Current mitigation: Optional chaining and runtime checks (e.g., `typeof commands?.executeCommandById !== "function"`) prevent crashes when APIs are absent.
- Recommendations: Isolate all internal API access into a single `compat.ts` module with version checks or feature detection. This makes it easy to update when Obsidian APIs change.

**Debug log writes to vault filesystem with no rotation beyond size cap:**
- Risk: `src/debug-log.ts` writes structured JSON logs to the vault's plugin config directory. The log is capped at 512KB (`MAX_LOG_BYTES`), at which point it is cleared. However, the log contains detailed internal state (file paths, leaf states, settings values) that could expose vault structure.
- Files: `src/debug-log.ts` (lines 1-78)
- Current mitigation: Log is inside the vault (`.obsidian/plugins/link-tag-intelligence/debug-runtime.log`), not exposed to the network.
- Recommendations: Consider an opt-in flag for debug logging rather than always-on. Review logged fields to ensure no sensitive data (e.g., note content) is included.

## Performance Bottlenecks

**Full vault file scan in `resolveNoteTarget()`:**
- Problem: When `getFirstLinkpathDest()` fails to resolve a link target, `resolveNoteTarget()` falls back to a linear scan of ALL supported note files in the vault, checking path, basename, and aliases for each file.
- Files: `src/notes.ts` (lines 247-271)
- Cause: The fallback iterates through all vault files (from `getAllSupportedNoteFiles()`), calling `app.metadataCache.getFileCache()` for each to check aliases. In large vaults (thousands of notes), this is O(n) per unresolved link resolution.
- Improvement path: Build and cache a lookup map from lowercase basename/alias to file path. Invalidate the cache on metadata changes.

**`getAllSupportedNoteFiles()` called frequently without caching:**
- Problem: The function is called at `src/notes.ts:152` and used by `resolveNoteTarget()`, `getTagStats()`, `getAllTagsForFile()`, and other functions. Each call iterates all vault markdown files and excalidraw files.
- Files: `src/notes.ts` (lines 152-157)
- Cause: No memoization. The function is called during view snapshot building (which can trigger on every context change).
- Improvement path: Cache the file list with a TTL or invalidate on vault file create/delete events.

**Sequential file reads during view snapshot building:**
- Problem: `buildSnapshot()` in `src/view.ts:423-495` calls multiple async operations in a single promise chain. While not deeply nested, the snapshot collects outgoing links, backlinks, references, relations, tags, and mentions sequentially.
- Files: `src/view.ts` (lines 423-495)
- Cause: Operations like `getOutgoingLinkFiles()` and `findUnlinkedMentions()` are await-ed sequentially when they could run in parallel.
- Improvement path: Use `Promise.all()` for independent data fetches.

**No debounce on metadata-changed events during bulk operations:**
- Problem: Bulk operations like tag renaming across the vault (`renameTagAcrossVault`) modify many files, each triggering a metadata-changed event that fires `refreshAllViews()`. This causes many redundant view rebuilds.
- Files: `src/main.ts` (lines 230-240), `src/tags.ts` (line references in rename/delete operations)
- Cause: Each file modification triggers a separate `metadataCache.on("changed")` event, and the handler calls `refreshAllViews()`.
- Improvement path: Batch view refreshes using a short debounce window (50-100ms) on the refresh call, or suspend refresh during bulk operations.

## Fragile Areas

**`ReferencePreviewPopover` with manual DOM positioning:**
- Files: `src/reference-preview.ts` (lines 14-212)
- Why fragile: The popover uses manual `getBoundingClientRect()` calculations with CSS custom properties (`--lti-preview-left`, `--lti-preview-top`). The positioning logic checks available space above/below the anchor and adjusts accordingly. Scroll and resize listeners reposition the popover. This is easy to break with CSS changes, z-index conflicts, or Obsidian theme customizations.
- Safe modification: Changes to styling should go through CSS classes (`.lti-hover-preview`). Avoid changing the positioning algorithm unless you add visual regression tests.
- Test coverage: None. No tests exist for the popover positioning or DOM structure.

**CodeMirror 6 editor extension with custom widget rendering:**
- Files: `src/editor-extension.ts` (lines 107-375)
- Why fragile: The `ReferenceWidget` extends CodeMirror's `WidgetType` and renders custom HTML into the editor DOM. It interacts with CodeMirror's internal decorator system, hover tooltip API, and selection state. CodeMirror 6 breaking changes or Obsidian editor wrapping changes could break this extension.
- Safe modification: Changes should be tested in both Source Mode and Live Preview. Keep CodeMirror version aligned with the version Obsidian ships.
- Test coverage: None. No automated tests for the editor extension.

**Companion plugin config diffing:**
- Files: `src/companion-plugins.ts` (lines 338-462)
- Why fragile: The diff functions (`diffZoteroConfig`, `diffPdfConfig`, `diffSmartConnectionsConfig`) extract specific fields from companion plugin config data using `ensureString()`, `ensureArray()`, and `ensureNumber()` helpers. If the companion plugins change their config structure, these diff functions will silently report mismatches where none exist, or miss real mismatches.
- Safe modification: When updating these functions, verify against the current version of each companion plugin. Add tests for each extraction function with real config examples.
- Test coverage: Partial. `tests/companion-plugins.test.ts` (76 lines) tests the basic diff functions but not edge cases with missing/corrupt configs.

**Settings tab render-token pattern for async UI:**
- Files: `src/settings.ts` (lines 338-359)
- Why fragile: The settings tab uses a `renderToken` counter to handle async UI rendering. If the user navigates pages rapidly, stale render completions are discarded by comparing tokens. This is a manually implemented equivalent of an AbortController but without the standard cancellation mechanics.
- Safe modification: Keep the token comparison pattern. If adding more async rendering paths, ensure they all respect the token check.
- Test coverage: None.

## Scaling Limits

**Vault size assumptions:**
- Current capacity: The codebase reads entire file contents via `app.vault.cachedRead()` and processes full frontmatter for operations like tag suggestion (`tags.ts:662-698`). Block reference preview reads entire files to extract line ranges.
- Limit: In vaults with 10,000+ notes, tag suggestion (`suggestTagsForFile`) can become slow because it iterates all vault tags via `getTagStats()`, reads the current file, and processes referenced context files. Line reference preview reads full file content rather than line ranges.
- Scaling path: For tag suggestions, limit the scope of known tag analysis (e.g., only recently modified files). For file reads, use `Vault.process()` or line-level reads where possible instead of full file reads.

**Debug log size cap:**
- Current capacity: 512KB (`MAX_LOG_BYTES` in `debug-log.ts:3`). The log is truncated (cleared to empty) when exceeded.
- Limit: During heavy usage with verbose logging enabled, 512KB could be reached quickly, losing earlier log entries that may be useful for debugging.
- Scaling path: Consider a rotating log approach (keep last N entries or last N KB) rather than binary truncation.

**Memory for view snapshots:**
- Current capacity: Each view refresh serializes the full state (toolbar, all sections, all items) into snapshot objects and compares serialized signatures (`JSON.stringify`) to detect changes.
- Limit: In vaults with many backlinks, outgoing links, references, and relations, snapshot objects can grow to contain thousands of items. The signature comparison serializes the entire snapshot for each section.
- Scaling path: Implement shallow comparison or path-based change detection instead of full serialization. Consider virtual scrolling for large lists in the sidebar view.

## Dependencies at Risk

**`obsidian: latest`:**
- Risk: The Obsidian API package is declared as `"latest"` in `package.json`, meaning `npm install` always fetches the most recent version. A breaking API change in Obsidian's type definitions could cause build failures with no warning.
- Impact: Build breakage requiring immediate type compatibility fixes. The plugin relies on non-public APIs accessed via type assertions, which would not be caught by type checking.
- Migration plan: Pin to a specific version range (e.g., `^1.6.0`). Monitor Obsidian changelogs for breaking changes.

**`vitest: ^2.1.8`:**
- Risk: Vitest 2.x is used, while Vitest 3.x is available. The config uses a minimal setup with only a path alias for the Obsidian mock.
- Impact: The `obsidian` mock in `tests/mocks/obsidian.ts` provides only stub classes with no real behavior. This means tests that import Obsidian types pass structurally but cannot verify runtime behavior with the real Obsidian API.
- Migration plan: Keep vitest up to date. Consider expanding the mock to include behavior simulation for critical paths.

**No production dependencies:**
- Risk: All dependencies are devDependencies. The plugin relies solely on what Obsidian provides at runtime (Obsidian API, CodeMirror via Obsidian). If Obsidian changes its CodeMirror integration pattern, the editor extension could break.
- Impact: Runtime failures with no version pinning protection to fall back on.
- Migration plan: None required currently (this is standard for Obsidian plugins). Stay aware of Obsidian's CodeMirror version changes.

## Missing Critical Features

**No automated test coverage for core modules:**
- Problem: The test suite (7 files, ~1482 lines) covers companion plugin config diffing, CLI command building, and view-refresh logic. Core modules with complex logic have no tests: `main.ts` (plugin lifecycle), `view.ts` (snapshot building and rendering), `modals.ts` (all user-facing modals), `tags.ts` (tag suggestion algorithm), `notes.ts` (candidate search and metadata extraction), `i18n.ts` (translation resolution).
- Blocks: Safe refactoring of core modules. Any change to how snapshots are built, tags are suggested, or modals behave requires manual testing in the Obsidian app.
- Priority: High for `notes.ts` (metadata extraction, candidate search), `tags.ts` (tag suggestion), and `shared.ts` (JSON parsing, command building).

**No visual/UI regression testing:**
- Problem: No snapshot tests, screenshot tests, or DOM-level tests. Changes to the sidebar view, modal layouts, hover popover positioning, or editor decorations require opening Obsidian and manually verifying.
- Blocks: Confident UI changes. Each UI modification risks layout breakage that only users will discover.
- Priority: Medium. At minimum, test that key DOM structures (`lti-hover-preview`, `lti-section`, modal shells) are created correctly.

**No integration testing with actual Obsidian:**
- Problem: Tests use a mock Obsidian module (`tests/mocks/obsidian.ts`) with empty stub classes. There is no way to validate that the plugin works correctly with the real Obsidian API.
- Blocks: Catching API compatibility issues before release. All Obsidian API integration testing is manual.
- Priority: Medium. Consider an Obsidian vault-based smoke test script that loads the plugin and exercises key paths.

## Test Coverage Gaps

**`src/notes.ts` (653 lines) — no tests:**
- What's not tested: `resolveNoteTarget()` fallback scanning, `getResearchSourceMetadataFromFrontmatter()` with various frontmatter formats, `collectLinkCandidates()` search and ranking, `buildSearchFields()` alias resolution, `getOutgoingExactReferences()` and `getIncomingExactReferences()` block/line reference extraction.
- Files: `src/notes.ts`
- Risk: Metadata extraction changes could silently break research source display. Link candidate ranking changes could affect which files appear in link insertion.
- Priority: High

**`src/tags.ts` (860 lines) — no tests:**
- What's not tested: `suggestTagsForFile()` tag suggestion algorithm, `getTagStats()` vault-wide tag collection, `renameTagAcrossVault()` and `deleteTagAcrossVault()` batch operations, `mergeSuggestion()` deduplication logic, term extraction from file content.
- Files: `src/tags.ts`
- Risk: Tag suggestion changes could produce irrelevant tags. Batch rename/delete could corrupt frontmatter across many files.
- Priority: High

**`src/main.ts` (1282 lines) — no tests:**
- What's not tested: Plugin lifecycle (onload/onunload), command registration and check callback logic, `insertLinkIntoEditor()` with Excalidraw path, `referencePreviewToken` race condition handling, `getReferencePreviewData()` with various reference kinds, `openFile`, `openFileAtLine`, `openFileAtBlock`.
- Files: `src/main.ts`
- Risk: Changes to command behavior or reference resolution could break core workflows.
- Priority: Medium

**`src/modals.ts` (953 lines) — no tests:**
- What's not tested: All modal interactions including `TagManagerModal` rendering, `TagSuggestionModal` selection logic, `ResearchIngestionModal` form submission, `SemanticSearchModal` result display, `LinkInsertModal` search, `ReferenceInsertModal` line range selection.
- Files: `src/modals.ts`
- Risk: Modal logic changes could break user workflows with no automated verification.
- Priority: Medium

**`src/view.ts` (1050 lines) — no tests:**
- What's not tested: Snapshot building (`buildSnapshot()`), section rendering, toolbar state management, refresh scheduling with requestAnimationFrame, signature-based change detection, scroll preservation.
- Files: `src/view.ts`, `src/view-refresh.ts` (partial: basic merge/dedupe logic is tested)
- Risk: View rendering changes could produce wrong or missing content in the sidebar.
- Priority: Medium

---

*Concerns audit: 2026-05-12*
