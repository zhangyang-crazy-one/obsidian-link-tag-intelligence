# Coding Conventions

**Analysis Date:** 2026-05-12

## Naming Patterns

**Files:**
- kebab-case for all source files: `debug-log.ts`, `editor-extension.ts`, `companion-plugins.ts`, `reading-hover-controller.ts`, `reference-preview.ts`, `view-refresh.ts`
- Single-word files for core modules: `tags.ts`, `notes.ts`, `references.ts`, `settings.ts`, `modals.ts`, `icons.ts`

**Classes:**
- PascalCase: `LinkTagIntelligencePlugin`, `LinkTagIntelligenceSettingTab`, `LinkTagIntelligenceView`, `ReferenceWidget`, `ReferencePreviewPopover`

**Functions/Methods:**
- camelCase: `getContextNoteFile()`, `buildSemanticCommand()`, `resolveNoteTarget()`, `collectLinkCandidates()`, `renderLegacyReferences()`
- Private methods use `private` keyword, no underscore prefix: `private captureEditorContext()`, `private pushRecentTarget()`
- Boolean-returning functions prefixed with `is`/`has`/`should`: `isSupportedNoteFile()`, `isExcalidrawFile()`, `hasPhrase()`, `shouldRenderAsWidget()`

**Variables:**
- camelCase: `activeFile`, `lastEditorLeaf`, `recentLinkTargets`, `referencePreview`
- No Hungarian notation or type prefix observed

**Constants:**
- UPPER_SNAKE_CASE at module level: `DEFAULT_SETTINGS`, `MAX_LOG_BYTES`, `LEGACY_LINE_REFERENCE_RE`, `NATIVE_BLOCK_REFERENCE_RE`
- `as const` for object constants: `CssClasses`, `Layout`

**Types and Interfaces:**
- PascalCase for both type aliases and interfaces
- Type aliases for unions and simple objects: `type WorkflowMode = "general" | "researcher"`, `type ViewRefreshRequest = { reason: string; ... }`
- Interfaces for complex object shapes with optional fields: `interface NoteSummary`, `interface LinkTagIntelligenceSettings`
- Discriminated union types use a `kind` field: `type EditorReference = { kind: "block" | "line"; ... } | { kind: "native-block"; ... }`

**CSS Classes:**
- BEM-like pattern with `lti-` prefix: `lti-workbench-hero`, `lti-workbench-section-card`, `lti-workbench-toggle`
- State modifiers with `is-` prefix: `is-collapsed`, `is-hidden`, `is-active`, `is-form`, `is-featured`, `is-alert`, `is-missing`

## Code Style

**TypeScript Strict Mode:**
- `tsconfig.json` enforces `strict: true`, `noImplicitAny: true`, `noUnusedLocals: true`, `noUnusedParameters: true`
- Target `ES2021`, module `ESNext`, moduleResolution `Bundler`

**Formatting:**
- No Prettier config detected. Style enforced by ESLint only.
- Indentation: 2 spaces (observed consistently across all files)
- Semicolons: always used
- Trailing commas: not consistently used (sometimes present, sometimes absent)

**Linting:**
- Tool: ESLint v10 with `typescript-eslint` v8
- Config: `eslint.config.cjs` — flat config format
- Rules: `@typescript-eslint/recommended` plus `no-unused-vars` with `argsIgnorePattern: "^_"`, `varsIgnorePattern: "^_"`
- Scope: `src/**/*.ts` only (tests are not linted)

**Editor Configuration:**
- No `.editorconfig` detected
- No `.prettierrc` detected

## Import Organization

**Order (observed in `src/main.ts` and other files):**
1. Obsidian API: `import { App, TFile, ... } from "obsidian"`
2. Third-party libraries: `import { RangeSetBuilder } from "@codemirror/state"`
3. Local modules: `import { debugLog } from "./debug-log"`
4. (Node.js built-ins appear in CLI/test files only)

**Type Imports:**
- `import type` for type-only imports: `import type LinkTagIntelligencePlugin from "./main"`
- Mixed imports separate types with `type` keyword: `import { App, FileView, type HoverParent } from "obsidian"`

**Path Aliases:**
- `vitest.config.ts` maps `"obsidian"` to `tests/mocks/obsidian.ts` for tests only
- No path aliases for source code; all local imports use relative paths: `"../src/i18n"`, `"./tags"`

**Named vs Default Exports:**
- Named exports preferred: `export function debugLog(...)`, `export interface NoteSummary`
- Only `src/main.ts` uses `export default class`
- Re-exports not used; each file imports directly from its dependencies

## Error Handling

**Patterns for Parse/Config Failures:**
```typescript
try {
  return parseTagAliasMap(this.settings.tagAliasMapText);
} catch (error) {
  console.warn(error);
  new Notice(this.t("invalidAliasMap"));
  return new Map();  // safe fallback
}
```

**Patterns for Async Operations:**
- try/catch wrapping async calls
- `.catch()` on Promises to surface errors via Notice
- Return `null` or `false` for failed operations (not throwing)

**Validation:**
- Guard clauses at function entry: early returns for `null`/invalid inputs
- Type narrowing with `instanceof`: `if (!(file instanceof TFile)) return null`
- Discriminated union checks: `if (options.kind === "native-block" && options.blockId)`

**CLI Error Codes:**
- String-based error codes for structured error results: `"desktop-only"`, `"missing-command"`, `"invalid-doi"`
- Error translation via lookup: `ingestionErrorToMessage(message)` maps codes to user-facing messages

## Logging

**Framework:** Custom structured logging in `src/debug-log.ts`

**Patterns:**
```typescript
// Application events with structured data
debugLog(this.app, "plugin.onload", {
  version: this.manifest.version,
  debugLogPath,
  language: this.settings.language
});

// System errors
console.error("[lti-debug-log] failed to write log", error);

// Non-fatal issues
console.warn(error);
```

**Key behaviors:**
- Logs written to `{vaultConfigDir}/plugins/link-tag-intelligence/debug-runtime.log`
- Max log size: 512 KB (auto-reset when exceeded)
- Write operations are queued per App instance (non-blocking)
- Log entries are JSON with `ts`, `scope`, and arbitrary `details`
- Logging is pervasive in `main.ts` lifecycle events, view refreshes, and reference preview operations

## Comments

**When to Comment:**
- Minimal inline comments — code is largely self-documenting through naming
- Chinese comments used for context-heavy sections in `main.ts` (e.g., `// 如果当前文件是 Excalidraw 文件，使用 Excalidraw API`)
- Section-divider comments in large settings files before helper method groups

**JSDoc/TSDoc:**
- Not used. No `@param` or `@returns` annotations observed in any source file.
- Type information is conveyed through TypeScript type annotations instead.

**TODO/FIXME:**
- None found in source files. The codebase is clean of deferred-work markers.

## Function Design

**Size:**
- Typical function length: 5–30 lines
- Pure utility functions are short and focused
- Private helper methods in `main.ts` and `settings.ts` can be longer (30–60 lines) for complex rendering logic

**Parameters:**
- Options objects for functions with 4+ parameters: `({ kind, target, sourcePath, startLine, endLine, blockId, raw })`
- Single-purpose functions with 2–3 named parameters preferred for simpler cases
- Destructuring in function signatures: `(app: App, file: TFile, settings: LinkTagIntelligenceSettings)`

**Return Values:**
- Consistent patterns: `T | null` for lookups, `boolean` for success/failure, `Promise<T>` for async, `string[]` for collections
- Empty arrays over `null` for "no results": `return []`
- Discriminated result objects in CLI contexts: `{ status: "ok", ... }` vs error objects

**Pure vs Impure:**
- Utility/parser functions in `shared.ts`, `references.ts`, and `tags.ts` are pure
- Functions in `notes.ts` that access `app.metadataCache` or `app.vault` are impure
- Async functions that call `app.vault.read()` / `app.vault.process()` are in `notes.ts` and `main.ts`

## Module Design

**Exports:**
- Named exports strongly preferred. Only `main.ts` uses `export default class`
- Export pattern: declare and export in same place (no trailing export blocks)
- Type exports use `export interface` / `export type` at top of file

**Barrel Files:**
- Not used. Each file imports directly from its dependency files.
- `main.ts` serves as the central integration point, importing from all other modules.

**File Organization by Domain:**
| File | Domain |
|------|--------|
| `src/main.ts` | Plugin lifecycle, command registration, modal orchestration |
| `src/settings.ts` | Settings tab UI, defaults, normalization |
| `src/tags.ts` | Tag parsing, suggestion algorithm, vault-wide tag operations |
| `src/notes.ts` | File utilities, note resolution, link candidate collection |
| `src/references.ts` | Legacy/block reference parsing, formatting, rendering |
| `src/modals.ts` | All modal UIs (link insert, tag manage, ingestion, semantic) |
| `src/editor-extension.ts` | CodeMirror 6 decorations, widgets, hover tooltips |
| `src/view.ts` | Sidebar panel view |
| `src/i18n.ts` | Translation strings (en + zh), relation key labels |
| `src/shared.ts` | Shell commands, tag map parsing, CSS constants |
| `src/companion-plugins.ts` | Third-party plugin config diffing/preset management |
| `src/ingestion.ts` | CLI-based research source ingestion |
| `src/semantic.ts` | External semantic search bridge |
| `src/debug-log.ts` | Structured JSON logging to vault |
| `src/reference-preview.ts` | Hover popover for reference previews |
| `src/reading-hover-controller.ts` | Hover controller for reading mode references |
| `src/view-refresh.ts` | View refresh request merging/filtering logic |
| `src/icons.ts` | Single-line icon ID constant export |

---

*Convention analysis: 2026-05-12*
