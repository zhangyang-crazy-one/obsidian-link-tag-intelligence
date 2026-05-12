# Obsidian Link Tag Intelligence 项目配置

> **项目定位**: Obsidian 笔记软件插件，提供链接管理和标签智能功能

---

## 项目结构

```
obsidian-link-tag-intelligence/
├── src/                    # 源代码
│   ├── main.ts            # 插件主入口
│   ├── settings.ts        # 设置管理
│   ├── modals/            # 模态框
│   ├── notes.ts           # 笔记操作
│   └── ...
├── tests/                  # 测试文件
├── .claude/               # Claude Code 配置
│   ├── settings.json      # Claude Code 设置
│   └── hooks/             # Hook 脚本
└── package.json
```

---

## 核心命令

| 命令 | 描述 |
|------|------|
| `npm test` | 运行测试 (vitest) |
| `npm run build` | 构建插件 (esbuild) |
| `npm run lint` | 代码检查 |

---

## 技术栈

- **语言**: TypeScript
- **测试**: Vitest
- **构建**: esbuild
- **框架**: Obsidian API
- **编辑器**: CodeMirror 6

---

## 代码风格

1. **TypeScript 规范**
   - 使用 `type` 而非 `interface` 作为别名
   - 优先使用 `const` 和 `let`
   - 严格空值检查

2. **Obsidian 插件规范**
   - 遵循官方插件结构
   - 使用 `onload()`/`onunload()` 生命周期
   - 通过 `this.app` 访问 Obsidian API

3. **命名规范**
   - 类名: PascalCase
   - 函数/变量: camelCase
   - 常量: UPPER_SNAKE_CASE

---

## 提交规范

格式: `type(scope): description`

| 类型 | 描述 |
|------|------|
| feat | 新功能 |
| fix | 修复 bug |
| docs | 文档更新 |
| style | 代码格式（不影响功能）|
| refactor | 重构 |
| test | 测试相关 |
| chore | 构建/工具 |

---

## 注意事项

1. 修改 `src/main.ts` 后需要重新构建
2. 插件 ID 为 `link-tag-intelligence`
3. 使用 `getContextNoteFile()` 获取当前笔记文件
4. 国际化使用 `i18n.ts` 中的 `tr()` 函数

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Obsidian Link Tag Intelligence — 语音转文字功能**

在现有的 Obsidian Link Tag Intelligence 插件中新增**本地中文语音实时转文字**功能。用户通过快捷键或侧边栏按钮触发，语音被实时识别为文字，逐句插入当前打开笔记的光标位置。语音识别完全在本地运行，不依赖云服务，不引入除 Obsidian 和本插件之外的任何框架。

**Core Value:** 无需离开键盘即可通过语音将中文内容输入 Obsidian 笔记，本地运行保障隐私和离线可用。

### Constraints

- **无额外框架**：不引入独立的 Python 服务、Docker 容器、或任何外部进程
- **本地运行**：语音数据不离开用户设备
- **Obsidian 合规**：遵循 Obsidian 开发者政策（不混淆代码、不擅自联网）
- **性能**：语音识别不显著影响 Obsidian 编辑器响应（< 100ms 主线程阻塞）
- **兼容性**：与现有插件功能共存，不破坏现有特性
- **模型体积**：模型文件尽可能小，优先 < 200MB
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.8.2 - All source code in `src/` and tests in `tests/`
- CSS - Stylesheet at `styles.css` (4975 lines)
- JavaScript (CJS) - `esbuild.config.mjs`, `eslint.config.cjs` (build and lint config)
- JSON - `package.json`, `tsconfig.json`, `manifest.json`, `versions.json`
## Runtime
- Obsidian Desktop App (Node.js integration via Electron)
- Min App Version: 1.6.0 (declared in `manifest.json`)
- Platform: Desktop required for CLI ingestion and semantic bridge features (these call `child_process.exec` via Obsidian's Node.js require). Mobile supported for all other functionality.
- npm
- Lockfile: `package-lock.json` present
- ESM (`"type": "module"` in `package.json`)
- Build output: `main.js` as CJS bundle (Obsidian plugin convention)
## Frameworks
- Obsidian API - Plugin framework providing `Plugin`, `ItemView`, `PluginSettingTab`, `MarkdownView`, `TFile`, `MetadataCache`, `Vault`, etc. Imported from `"obsidian"` (marked as external in esbuild, not bundled).
- CodeMirror 6 - Editor extensions (`@codemirror/state`, `@codemirror/view`) for inline reference decorations, hover tooltips, and widget rendering. Also marked as external in esbuild.
- Vitest 2.1.8 - Test runner with native ESM support
- Config: `vitest.config.ts` (aliases `obsidian` to `tests/mocks/obsidian.ts`)
- esbuild 0.25.0 - Bundler, configured via `esbuild.config.mjs`
- ESLint 10.0.3 with `typescript-eslint` 8.57.1 (flat config, `eslint.config.cjs`)
## Key Dependencies
- `esbuild` ^0.25.0 - Fast TypeScript/JavaScript bundler
- `typescript` ^5.8.2 - TypeScript compiler (for type checking only, esbuild does transpilation)
- `vitest` ^2.1.8 - Test runner
- `@types/node` ^22.13.10 - Node.js type definitions for tests
- `eslint` ^10.0.3 - Linter
- `typescript-eslint` ^8.57.1 - TypeScript ESLint plugin
- `obsidian` latest - Obsidian API type definitions (not bundled, external at runtime)
- `@codemirror/state` - CodeMirror state management primitives
- `@codemirror/view` - CodeMirror view layer (decorations, widgets, hover tooltips)
- `obsidian` - Obsidian plugin runtime API
- Node.js `child_process` module - Accessed via `globalThis.require` for CLI execution (desktop only)
## Configuration
- No `.env` files detected. All configuration is stored in Obsidian plugin data (`data.json` via `Plugin.loadData()`/`Plugin.saveData()`).
- Plugin ID: `link-tag-intelligence` (declared in `manifest.json`)
- Config: `tsconfig.json`
- Target: ES2021
- Module: ESNext, resolution: Bundler
- Strict mode: enabled (with `noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`)
- Path alias: `baseUrl: "."` (no custom path aliases)
- Includes: `src/**/*.ts`, `tests/**/*.ts`
- Config: `esbuild.config.mjs`
- Platform: `node` (enables `require`/`process` usage)
- Config: `eslint.config.cjs` (flat config)
- Extends: `typescript-eslint/recommended`
- Custom rule: `no-unused-vars` with `_` prefix ignore pattern
- Config: `vitest.config.ts`
- Module alias: `obsidian` -> `tests/mocks/obsidian.ts`
## Platform Requirements
- Node.js (version not specified, but esbuild 0.25.x and typescript 5.8.x suggest recent LTS)
- npm
- Obsidian Desktop App (for actual plugin testing)
- Optional: `pjeby/hot-reload` plugin for dev workflow
- Obsidian Desktop App >= 1.6.0
- `main.js`, `manifest.json`, `styles.css` deployed to Obsidian vault `.obsidian/plugins/link-tag-intelligence/`
- Desktop-only features (CLI execution) require Obsidian running on desktop OS
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- kebab-case for all source files: `debug-log.ts`, `editor-extension.ts`, `companion-plugins.ts`, `reading-hover-controller.ts`, `reference-preview.ts`, `view-refresh.ts`
- Single-word files for core modules: `tags.ts`, `notes.ts`, `references.ts`, `settings.ts`, `modals.ts`, `icons.ts`
- PascalCase: `LinkTagIntelligencePlugin`, `LinkTagIntelligenceSettingTab`, `LinkTagIntelligenceView`, `ReferenceWidget`, `ReferencePreviewPopover`
- camelCase: `getContextNoteFile()`, `buildSemanticCommand()`, `resolveNoteTarget()`, `collectLinkCandidates()`, `renderLegacyReferences()`
- Private methods use `private` keyword, no underscore prefix: `private captureEditorContext()`, `private pushRecentTarget()`
- Boolean-returning functions prefixed with `is`/`has`/`should`: `isSupportedNoteFile()`, `isExcalidrawFile()`, `hasPhrase()`, `shouldRenderAsWidget()`
- camelCase: `activeFile`, `lastEditorLeaf`, `recentLinkTargets`, `referencePreview`
- No Hungarian notation or type prefix observed
- UPPER_SNAKE_CASE at module level: `DEFAULT_SETTINGS`, `MAX_LOG_BYTES`, `LEGACY_LINE_REFERENCE_RE`, `NATIVE_BLOCK_REFERENCE_RE`
- `as const` for object constants: `CssClasses`, `Layout`
- PascalCase for both type aliases and interfaces
- Type aliases for unions and simple objects: `type WorkflowMode = "general" | "researcher"`, `type ViewRefreshRequest = { reason: string; ... }`
- Interfaces for complex object shapes with optional fields: `interface NoteSummary`, `interface LinkTagIntelligenceSettings`
- Discriminated union types use a `kind` field: `type EditorReference = { kind: "block" | "line"; ... } | { kind: "native-block"; ... }`
- BEM-like pattern with `lti-` prefix: `lti-workbench-hero`, `lti-workbench-section-card`, `lti-workbench-toggle`
- State modifiers with `is-` prefix: `is-collapsed`, `is-hidden`, `is-active`, `is-form`, `is-featured`, `is-alert`, `is-missing`
## Code Style
- `tsconfig.json` enforces `strict: true`, `noImplicitAny: true`, `noUnusedLocals: true`, `noUnusedParameters: true`
- Target `ES2021`, module `ESNext`, moduleResolution `Bundler`
- No Prettier config detected. Style enforced by ESLint only.
- Indentation: 2 spaces (observed consistently across all files)
- Semicolons: always used
- Trailing commas: not consistently used (sometimes present, sometimes absent)
- Tool: ESLint v10 with `typescript-eslint` v8
- Config: `eslint.config.cjs` — flat config format
- Rules: `@typescript-eslint/recommended` plus `no-unused-vars` with `argsIgnorePattern: "^_"`, `varsIgnorePattern: "^_"`
- Scope: `src/**/*.ts` only (tests are not linted)
- No `.editorconfig` detected
- No `.prettierrc` detected
## Import Organization
- `import type` for type-only imports: `import type LinkTagIntelligencePlugin from "./main"`
- Mixed imports separate types with `type` keyword: `import { App, FileView, type HoverParent } from "obsidian"`
- `vitest.config.ts` maps `"obsidian"` to `tests/mocks/obsidian.ts` for tests only
- No path aliases for source code; all local imports use relative paths: `"../src/i18n"`, `"./tags"`
- Named exports preferred: `export function debugLog(...)`, `export interface NoteSummary`
- Only `src/main.ts` uses `export default class`
- Re-exports not used; each file imports directly from its dependencies
## Error Handling
- try/catch wrapping async calls
- `.catch()` on Promises to surface errors via Notice
- Return `null` or `false` for failed operations (not throwing)
- Guard clauses at function entry: early returns for `null`/invalid inputs
- Type narrowing with `instanceof`: `if (!(file instanceof TFile)) return null`
- Discriminated union checks: `if (options.kind === "native-block" && options.blockId)`
- String-based error codes for structured error results: `"desktop-only"`, `"missing-command"`, `"invalid-doi"`
- Error translation via lookup: `ingestionErrorToMessage(message)` maps codes to user-facing messages
## Logging
- Logs written to `{vaultConfigDir}/plugins/link-tag-intelligence/debug-runtime.log`
- Max log size: 512 KB (auto-reset when exceeded)
- Write operations are queued per App instance (non-blocking)
- Log entries are JSON with `ts`, `scope`, and arbitrary `details`
- Logging is pervasive in `main.ts` lifecycle events, view refreshes, and reference preview operations
## Comments
- Minimal inline comments — code is largely self-documenting through naming
- Chinese comments used for context-heavy sections in `main.ts` (e.g., `// 如果当前文件是 Excalidraw 文件，使用 Excalidraw API`)
- Section-divider comments in large settings files before helper method groups
- Not used. No `@param` or `@returns` annotations observed in any source file.
- Type information is conveyed through TypeScript type annotations instead.
- None found in source files. The codebase is clean of deferred-work markers.
## Function Design
- Typical function length: 5–30 lines
- Pure utility functions are short and focused
- Private helper methods in `main.ts` and `settings.ts` can be longer (30–60 lines) for complex rendering logic
- Options objects for functions with 4+ parameters: `({ kind, target, sourcePath, startLine, endLine, blockId, raw })`
- Single-purpose functions with 2–3 named parameters preferred for simpler cases
- Destructuring in function signatures: `(app: App, file: TFile, settings: LinkTagIntelligenceSettings)`
- Consistent patterns: `T | null` for lookups, `boolean` for success/failure, `Promise<T>` for async, `string[]` for collections
- Empty arrays over `null` for "no results": `return []`
- Discriminated result objects in CLI contexts: `{ status: "ok", ... }` vs error objects
- Utility/parser functions in `shared.ts`, `references.ts`, and `tags.ts` are pure
- Functions in `notes.ts` that access `app.metadataCache` or `app.vault` are impure
- Async functions that call `app.vault.read()` / `app.vault.process()` are in `notes.ts` and `main.ts`
## Module Design
- Named exports strongly preferred. Only `main.ts` uses `export default class`
- Export pattern: declare and export in same place (no trailing export blocks)
- Type exports use `export interface` / `export type` at top of file
- Not used. Each file imports directly from its dependency files.
- `main.ts` serves as the central integration point, importing from all other modules.
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
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- Single Plugin entry point (`src/main.ts`) that registers all commands, events, and extensions
- Domain feature modules organized by noun (tags, references, notes, ingestion) with minimal cross-coupling
- Snapshot-based view rendering: data assembly is separate from DOM manipulation
- CodeMirror 6 integration via `registerEditorExtension()` for inline reference decorations and hover tooltips
- Companion plugin integration for research workflows (Zotero, PDF++, Smart Connections)
- Bilingual i18n (English/Chinese) with a centralized translation key system
- CLI tools in `cli/` for external shell-based ingestion and semantic search
- Structured debug logging to vault config directory
## Layers
- Purpose: Orchestrates all plugin behavior, registers commands/events/extensions, manages settings lifecycle, exposes public API methods that modal and view code call
- Location: `src/main.ts`
- Contains: `LinkTagIntelligencePlugin` class extending `Plugin`
- Depends on: All feature modules (`notes.ts`, `references.ts`, `tags.ts`, `ingestion.ts`, `semantic.ts`, `companion-plugins.ts`, `shared.ts`, `i18n.ts`, `settings.ts`, `modals.ts`, `editor-extension.ts`, `view.ts`, `reference-preview.ts`, `reading-hover-controller.ts`, `debug-log.ts`, `view-refresh.ts`, `icons.ts`)
- Used by: Obsidian Plugin API (loaded/unloaded by Obsidian), `view.ts` (via type-only import), `modals.ts` (via type-only import)
- Purpose: Renders the sidebar panel, modal dialogs, editor decorations, and hover previews
- Location: `src/view.ts`, `src/modals.ts`, `src/editor-extension.ts`, `src/reference-preview.ts`, `src/reading-hover-controller.ts`
- Contains: `LinkTagIntelligenceView` (ItemView subclass), modal classes (`LinkInsertModal`, `ReferenceInsertModal`, `RelationKeyModal`, `ResearchIngestionModal`, `SemanticSearchModal`, `TagManagerModal`, `TagSuggestionModal`, `TextPromptModal`), CodeMirror ViewPlugin, `ReferencePreviewPopover`, `LegacyReadingHoverController`
- Depends on: Plugin core (type-only for classes, instance methods for actions), domain modules, Obsidian ItemView/SuggestModal/HoverPopover APIs, CodeMirror state/view
- Used by: Plugin core (registers view, opens modals, registers editor extension)
- Purpose: Pure utility functions for note operations, reference parsing, tag management, and file resolution
- Location: `src/notes.ts`, `src/references.ts`, `src/tags.ts`
- Contains: `resolveNoteTarget`, `getOutgoingLinkFiles`, `getBacklinkFiles`, `getOutgoingExactReferences`, `getIncomingExactReferences`, `findUnlinkedMentions`, `getAllTagsForFile`, `extractLegacyLineReferences`, `extractNativeBlockReferences`, `suggestTagsForFile`, `appendTagsToFrontmatter`, `deleteTagAcrossVault`, `renameTagAcrossVault`
- Depends on: Obsidian App/MetadataCache/TFile/Vault APIs, `references.ts` (used by `notes.ts`), `shared.ts` (used by `tags.ts`)
- Used by: Plugin core, UI layer (view.ts calls domain functions to build snapshots)
- Purpose: Shell-based ingestion of research sources and semantic search via external CLI tools
- Location: `src/ingestion.ts`, `src/semantic.ts`, `src/companion-plugins.ts`
- Contains: `runIngestionCommand`, `runSemanticSearch`, `isIngestionConfigured`, `isSemanticBridgeConfigured`, `buildResearchWorkbenchProfile`, `readResearchWorkbenchState`, `applyCompanionPresetToVault`
- Depends on: Obsidian App, Node.js `child_process` (via desktop `require`), `shared.ts` (for shell command building), `settings.ts` types
- Used by: Plugin core (wraps shell calls in async methods)
- Purpose: Plugin settings definition, default values, loading/normalization, and settings tab UI
- Location: `src/settings.ts`
- Contains: `DEFAULT_SETTINGS`, `normalizeLoadedSettings`, `LinkTagIntelligenceSettingTab` (extends `PluginSettingTab`), `LinkTagIntelligenceSettings` type, `WorkflowMode` type, relation key constants
- Depends on: Obsidian Plugin/SettingTab, `companion-plugins.ts` types, `i18n.ts` types
- Used by: Plugin core (loads/saves/normalizes settings), view (reads settings for context)
- Purpose: Shared utilities, i18n, debug logging, view refresh coordination, CSS constants
- Location: `src/shared.ts`, `src/i18n.ts`, `src/debug-log.ts`, `src/view-refresh.ts`, `src/icons.ts`
- Contains: `parseTagAliasMap`, `parseTagFacetMap`, `buildShellCommand`, `buildSemanticCommand`, `buildIngestionCommand`, `tr()`, `relationKeyLabel`, `debugLog`, `resetDebugLog`, `mergeViewRefreshRequests`, `shouldHandleViewRefresh`, `CssClasses`, `Layout`
- Depends on: Minimal (shared.ts is leaf; i18n.ts is leaf; debug-log.ts depends on Obsidian; view-refresh.ts is leaf)
- Used by: Nearly all other modules
## Data Flow
- Plugin settings: stored persistently via Obsidian `loadData()`/`saveData()` API, normalized on load
- View context tracking: in-memory fields on the plugin instance (`lastEditorLeaf`, `lastSupportedFilePath`, etc.)
- View pending refresh: per-view `pendingRefresh` request, deduplicated by path and merged by priority
- View section expand/collapse: per-view `sectionState` Map in `LinkTagIntelligenceView`
- Toolbar/section rendering: signature-based diffing (serialized JSON comparison) to skip unnecessary DOM updates
- Reference preview token: monotonically increasing integer to cancel stale async preview requests
## Key Abstractions
- Purpose: Central plugin class; owns all state tracking, settings, and reference preview popover instance
- Examples: `src/main.ts` (1282 lines, single default export class)
- Pattern: Extends `Plugin`, provides public API methods consumed by view/modals, coordinates all feature modules
- Purpose: Sidebar panel rendered in workspace leaf; snapshots data and diff-renders sections
- Examples: `src/view.ts` (1050 lines)
- Pattern: Extends `ItemView`, builds `SidebarSnapshot` from domain functions, applies via section shells, uses `requestAnimationFrame` batching for refresh coalescing
- Purpose: Complete serializable representation of sidebar state (toolbar, 10 sections, dependency paths)
- Examples: `src/view.ts` (lines 161-176, `SidebarSnapshot` type)
- Pattern: Union of section-specific snapshot types (`CurrentNoteSnapshot | FileSectionSnapshot | ReferenceSectionSnapshot | RelationSectionSnapshot | TagSectionSnapshot | MentionSectionSnapshot | StatusSectionSnapshot`)
- Purpose: Typed representation of a precise reference (block or line) between two note files
- Examples: `src/notes.ts` (lines 35-49)
- Pattern: Includes source and target files, metadata for both, preview text, start/end lines, block ID
- Purpose: Typed refresh trigger with reason, changed paths, and options
- Examples: `src/view-refresh.ts` (lines 3-9)
- Pattern: Four reasons (`context` > `settings` > `mutation` > `metadata`), priority-based merging, path-based filtering for metadata-triggered refreshes
- Purpose: Snapshot of research companion plugin statuses and recommended configuration
- Examples: `src/companion-plugins.ts` (lines 37-41)
- Pattern: Aggregates profile settings, enabled plugin IDs, and per-plugin status with mismatch detection
- Purpose: Hierarchical classification of tags into facets (topic, method, dataset, theory, status, writing_stage, source_kind)
- Examples: `src/shared.ts` (line 26, `TagFacetMap` type), `src/settings.ts` (lines 61-100, `DEFAULT_TAG_FACET_MAP_TEXT`)
- Pattern: `Map<facetName, Map<canonicalTag, alias[]>>`, parsed from JSON user setting
## Entry Points
- Location: `src/main.ts`
- Triggers: Obsidian loads/unloads the plugin
- Responsibilities: Registers view, ribbon icon, commands, settings tab, events, editor extension, markdown post-processor, hover link source
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
- Location: `src/main.ts` (line 78)
- Triggers: User clicks sidebar ribbon icon
- Responsibilities: Opens intelligence panel via `openIntelligencePanel()`
- Location: `src/settings.ts` (`LinkTagIntelligenceSettingTab`)
- Triggers: User opens plugin settings in Obsidian
- Responsibilities: Renders all plugin configuration options
- `file-open`: Updates file context, refreshes all views
- `metadataCache.on("changed")`: Refreshes views when current file metadata changes
- `active-leaf-change`: Captures editor/file context with `setTimeout(0)` to handle Excalidraw async loading
- `vault.on("rename")`: Refreshes views for both old and new paths
- `hover-link` source registration: Enables native hover preview for custom references
- Location: `src/editor-extension.ts` (`buildReferenceEditorExtension`)
- Triggers: Registered via `registerEditorExtension` during `onload`
- Responsibilities: Decorates inline references with widgets, shows hover tooltips, handles click-to-navigate
- Location: `src/main.ts` (line 302, `registerMarkdownPostProcessor`)
- Triggers: Obsidian renders markdown in reading view
- Responsibilities: Renders legacy reference syntax with hover controllers for reading mode
## Error Handling
- Shell command failures: errors mapped to translation keys (`ingestionErrorToMessage`, `semanticErrorToMessage`) with specific error codes (`desktop-only`, `desktop-shell-unavailable`, `missing-command`, `invalid-doi`, etc.)
- Parse failures (alias map, facet map): caught in try/catch, logged to console with `console.warn`, shown as `Notice` with translated message
- File resolution failures: `resolveNoteTarget` returns null; callers check and show fallback `Notice` or return empty snapshots
- Async reference preview: token-based cancellation (`referencePreviewToken` incremented on each new request; stale results discarded)
- Modal actions: `runModalTask` wraps user actions in try/catch with `console.error` and `Notice` fallback
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| bug-debug | \| 问题排查调试指南 (Tauri/Rust/React)。 | `.claude/skills/bug-debug/SKILL.md` |
| context7 | \| Context7 MCP 官方文档查询工具。  触发场景： - 查询第三方库的官方文档和 API - 获取最新的代码示例和最佳实践 - 版本特定的文档查询  触发词：context7、文档、API、库、官方文档、查询文档、use context7 | `.claude/skills/context7/SKILL.md` |
| notebooklm-workflow |  | `.claude/skills/notebooklm-workflow/SKILL.md` |
| obsidian |  | `.claude/skills/obsidian/SKILL.md` |
| obsidian-plugin-dev | Use when creating, modifying, debugging, styling, or deploying an Obsidian plugin. Triggers for tasks involving Obsidian API, WorkspaceLeaf, custom ItemView refresh behavior, Obsidian icons, MarkdownPostProcessor, or vault plugin deployment. | `.claude/skills/obsidian-plugin-dev/SKILL.md` |
| self-improvement |  | `.claude/skills/self-improvement/SKILL.md` |
| ui-ux-pro-max | \| UI/UX 设计与前端视觉优化：界面重做、审查、配色、字体与动效。 | `.claude/skills/ui-ux-pro-max/SKILL.md` |
| frontend-evolution | 将设计需求、界面样稿、Pencil 设计稿或现有前端页面迭代成高质量前端实现。用于 UI/UX 设计、设计稿转代码、前端界面重构、视觉风格统一、设计令牌整理、Pencil 布局搭建，以及在 React、Vue 或 Rust UI 技术栈中生成或改进界面代码；当用户要求“设计一个界面”“按样稿实现前端”“优化配色、字体或布局”“把设计稿转成代码”“制作 TUI 或终端界面”时使用。 | `.agents/skills/frontend-evolution/SKILL.md` |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
