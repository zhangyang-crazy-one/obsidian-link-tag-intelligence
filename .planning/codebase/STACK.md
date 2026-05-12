# Technology Stack

**Analysis Date:** 2026-05-12

## Languages

**Primary:**
- TypeScript 5.8.2 - All source code in `src/` and tests in `tests/`
- CSS - Stylesheet at `styles.css` (4975 lines)

**Configuration:**
- JavaScript (CJS) - `esbuild.config.mjs`, `eslint.config.cjs` (build and lint config)
- JSON - `package.json`, `tsconfig.json`, `manifest.json`, `versions.json`

## Runtime

**Environment:**
- Obsidian Desktop App (Node.js integration via Electron)
- Min App Version: 1.6.0 (declared in `manifest.json`)
- Platform: Desktop required for CLI ingestion and semantic bridge features (these call `child_process.exec` via Obsidian's Node.js require). Mobile supported for all other functionality.

**Package Manager:**
- npm
- Lockfile: `package-lock.json` present

**Module System:**
- ESM (`"type": "module"` in `package.json`)
- Build output: `main.js` as CJS bundle (Obsidian plugin convention)

## Frameworks

**Core:**
- Obsidian API - Plugin framework providing `Plugin`, `ItemView`, `PluginSettingTab`, `MarkdownView`, `TFile`, `MetadataCache`, `Vault`, etc. Imported from `"obsidian"` (marked as external in esbuild, not bundled).
- CodeMirror 6 - Editor extensions (`@codemirror/state`, `@codemirror/view`) for inline reference decorations, hover tooltips, and widget rendering. Also marked as external in esbuild.

**Testing:**
- Vitest 2.1.8 - Test runner with native ESM support
- Config: `vitest.config.ts` (aliases `obsidian` to `tests/mocks/obsidian.ts`)

**Build/Dev:**
- esbuild 0.25.0 - Bundler, configured via `esbuild.config.mjs`
  - Entry: `src/main.ts`
  - Output: `main.js` (CJS format)
  - Externals: `obsidian`, `@codemirror/state`, `@codemirror/view`
  - Target: ES2021
  - Tree shaking enabled
  - Dev mode: watch with inline sourcemaps
  - Production mode: single build, no sourcemaps

**Linting:**
- ESLint 10.0.3 with `typescript-eslint` 8.57.1 (flat config, `eslint.config.cjs`)

## Key Dependencies

All dependencies are `devDependencies` (Obsidian plugins ship a single `main.js` bundle):

**Build:**
- `esbuild` ^0.25.0 - Fast TypeScript/JavaScript bundler
- `typescript` ^5.8.2 - TypeScript compiler (for type checking only, esbuild does transpilation)

**Testing:**
- `vitest` ^2.1.8 - Test runner
- `@types/node` ^22.13.10 - Node.js type definitions for tests

**Linting:**
- `eslint` ^10.0.3 - Linter
- `typescript-eslint` ^8.57.1 - TypeScript ESLint plugin

**Type Definitions:**
- `obsidian` latest - Obsidian API type definitions (not bundled, external at runtime)

**Runtime (external, not bundled):**
- `@codemirror/state` - CodeMirror state management primitives
- `@codemirror/view` - CodeMirror view layer (decorations, widgets, hover tooltips)
- `obsidian` - Obsidian plugin runtime API
- Node.js `child_process` module - Accessed via `globalThis.require` for CLI execution (desktop only)

## Configuration

**Environment:**
- No `.env` files detected. All configuration is stored in Obsidian plugin data (`data.json` via `Plugin.loadData()`/`Plugin.saveData()`).
- Plugin ID: `link-tag-intelligence` (declared in `manifest.json`)

**TypeScript:**
- Config: `tsconfig.json`
- Target: ES2021
- Module: ESNext, resolution: Bundler
- Strict mode: enabled (with `noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`)
- Path alias: `baseUrl: "."` (no custom path aliases)
- Includes: `src/**/*.ts`, `tests/**/*.ts`

**Build:**
- Config: `esbuild.config.mjs`
- Platform: `node` (enables `require`/`process` usage)

**Lint:**
- Config: `eslint.config.cjs` (flat config)
- Extends: `typescript-eslint/recommended`
- Custom rule: `no-unused-vars` with `_` prefix ignore pattern

**Test:**
- Config: `vitest.config.ts`
- Module alias: `obsidian` -> `tests/mocks/obsidian.ts`

## Platform Requirements

**Development:**
- Node.js (version not specified, but esbuild 0.25.x and typescript 5.8.x suggest recent LTS)
- npm
- Obsidian Desktop App (for actual plugin testing)
- Optional: `pjeby/hot-reload` plugin for dev workflow

**Production:**
- Obsidian Desktop App >= 1.6.0
- `main.js`, `manifest.json`, `styles.css` deployed to Obsidian vault `.obsidian/plugins/link-tag-intelligence/`
- Desktop-only features (CLI execution) require Obsidian running on desktop OS

---

*Stack analysis: 2026-05-12*
