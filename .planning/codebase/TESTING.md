# Testing Patterns

**Analysis Date:** 2026-05-12

## Test Framework

**Runner:**
- Vitest v2.1.8
- Config: `vitest.config.ts` (at project root)

**Assertion Library:**
- Vitest's built-in `expect` (no separate assertion library)

**Run Commands:**
```bash
npm test              # Run all tests (vitest run — single pass, no watch)
# No watch or coverage scripts configured in package.json
```

**Configuration (`vitest.config.ts`):**
```typescript
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      obsidian: fileURLToPath(new URL("./tests/mocks/obsidian.ts", import.meta.url))
    }
  }
});
```

Key points:
- Only configuration is the `obsidian` alias that redirects all Obsidian API imports to the mock file
- No test environment explicitly set (defaults to Node)
- No include/exclude patterns configured (uses Vitest defaults)
- No coverage configuration present

## Test File Organization

**Location:**
- All tests in `tests/` directory (separate from `src/`)
- Test files co-exist with a single mock file: `tests/mocks/obsidian.ts`

**Naming:**
- Test files: `*.test.ts`
- Descriptive names matching the module under test: `helpers.test.ts`, `companion-plugins.test.ts`, `view-refresh.test.ts`

**Structure:**
```
tests/
├── mocks/
│   └── obsidian.ts              # Global Obsidian API stub (37 lines)
├── helpers.test.ts              # Core plugin logic (407 lines)
├── companion-plugins.test.ts    # Companion preset diffing (76 lines)
├── view-refresh.test.ts         # View refresh merging (70 lines)
├── research-cli.test.ts         # CLI research library + OpenAlex (302 lines)
├── paper-workflow.test.ts       # Paper workflow + OpenAlex (249 lines)
└── reference-cli.test.ts        # Reference CLI library + routing (378 lines)
```

**Total:** 1,482 lines of test code across 7 files. Source code: 9,957 lines across 18 files.

## Test Structure

**Suite Organization (from `tests/helpers.test.ts`):**
```typescript
import { describe, expect, it } from "vitest";
import { TFile } from "obsidian";  // resolved to tests/mocks/obsidian.ts

import { parseTagAliasMap } from "../src/shared";

describe("parseTagAliasMap", () => {
  it("parses canonical tags and aliases", () => {
    const map = parseTagAliasMap('{ "手冲咖啡": ["pour-over", "coffee"] }');
    expect(map.get("手冲咖啡")).toEqual(["pour-over", "coffee"]);
  });
});
```

**Patterns:**
- Each `describe` block covers one function or feature area
- `it()` descriptions use present tense: "parses canonical tags and aliases", "formats single-line references"
- Tests are isolated and self-contained — each `it` block creates its own input
- Arrange-Act-Assert pattern followed: setup inputs, call function, assert output

**Setup Pattern (for tests needing app/file fixtures):**
```typescript
function makeFile(path: string): TFile {
  const file = Object.assign(new TFile(), { path });
  file.name = path.split("/").pop() ?? path;
  file.basename = file.name.replace(/\.[^.]+$/, "");
  return file;
}

function makeApp(options: {
  files: TFile[];
  activeFile?: TFile | null;
  contents?: Record<string, string>;
  caches?: Record<string, Record<string, unknown>>;
  destinations?: Record<string, TFile>;
  resolvedLinks?: Record<string, Record<string, number>>;
}) {
  return {
    vault: {
      getMarkdownFiles: () => options.files.filter((f) => f.path.toLowerCase().endsWith(".md")),
      getFiles: () => options.files,
      cachedRead: async (file: TFile) => options.contents?.[file.path] ?? "",
      getAbstractFileByPath: (path: string) => options.files.find((file) => file.path === path) ?? null
    },
    workspace: { getActiveFile: () => options.activeFile ?? null, getActiveViewOfType: () => null },
    metadataCache: {
      getFirstLinkpathDest: (target, sourcePath = "") =>
        options.destinations?.[`${sourcePath}::${target}`] ?? options.destinations?.[target] ?? null,
      getFileCache: (file: TFile) => options.caches?.[file.path] ?? {},
      resolvedLinks: options.resolvedLinks ?? {}
    }
  } as never;
}
```

Key pattern: `{ ... } as never` type assertion to bypass strict typing on mock objects. This avoids the need to implement the full Obsidian API surface in mocks.

**Teardown Pattern (for CLI tests using temp directories):**
```typescript
const tempDirs: string[] = [];

async function createTempDir(prefix: string) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});
```

**Assertion Patterns:**
```typescript
// Exact match for primitives and simple objects
expect(map.get("手冲咖啡")).toEqual(["pour-over", "coffee"]);

// Partial match for complex objects
expect(references[0]).toMatchObject({ kind: "block", target: "MyNote", startLine: 12, endLine: 15 });

// Array length check
expect(references).toHaveLength(2);

// String containment
expect(command).toContain("--query 'coffee notes'");

// Async rejection
await expect(fetchData()).rejects.toThrow('Network error');

// Negative assertions
expect(supported).not.toContain(pdf);

// File content assertions
await expect(fs.readFile(draftPath, "utf8")).resolves.toContain("# 数据治理和数智转型 研究论文初稿");

// Structured error matching for CLI errors
await expect(formatReferenceRange({ ... })).rejects.toMatchObject<CliCommandError>({
  code: "ambiguous-match",
  details: { match_count: 2 }
});
```

## Mocking

**Framework:** Vitest aliases via `vitest.config.ts` — no `vi.mock()` or `vi.fn()` usage observed.

**Global Mock (`tests/mocks/obsidian.ts`):**
```typescript
export class App {}
export class TFile {
  path = "";
  basename = "";
  name = "";
}
export class Plugin {}
export class MarkdownView {}
export class Notice {}
export class Modal {}
export class SuggestModal<T = unknown> {
  protected _placeholder?: T;
}
export class ItemView {}

export function prepareFuzzySearch(_query: string): (input: string) => boolean {
  return (input: string) => input.length >= 0;
}

export function resolveSubpath(path: string): { path: string } {
  return { path };
}
```

Key characteristics:
- Classes are stubs with empty constructors (no behavior)
- Functions return no-op or identity implementations
- `TFile` has mutable `path`, `basename`, `name` fields for test setup
- Only the minimum API surface needed by imported source code is stubbed

**What to Mock:**
- The entire `obsidian` module via alias — all Obsidian API types and functions
- Test-local factory functions (`makeFile`, `makeApp`) create configured instances
- External fetch/network in CLI tests: custom `fetchImpl` parameter passed to functions

**What NOT to Mock:**
- Source code under test is never mocked
- Node.js built-ins (`fs`, `path`, `os`) are used directly in CLI tests
- Third-party library `@codemirror/state` and `@codemirror/view` are not mocked (editor extension tests may implicitly load them)

## Fixtures and Factories

**Test Data:**
Factory functions are defined at the top of each test file that needs them:

```typescript
// In helpers.test.ts
function makeFile(path: string): TFile {
  const file = Object.assign(new TFile(), { path });
  file.name = path.split("/").pop() ?? path;
  file.basename = file.name.replace(/\.[^.]+$/, "");
  return file;
}

function makeApp(options: { files, activeFile, contents, caches, destinations, resolvedLinks }) { ... }
```

**Location:**
- Factory functions are co-located in the test file that uses them (not shared)
- CLI test files use `createTempDir()` and `writeNote()` helpers within their own scope

**Inline Fixtures:**
- JSON objects defined inline in test cases for parameters
- String literals for content inputs
- Multi-line arrays joined with `\n` for simulated file contents

## Coverage

**Requirements:** No coverage configuration, no thresholds enforced.

**View Coverage:**
```bash
# No coverage script configured in package.json
# vitest can generate coverage with --coverage flag (requires @vitest/coverage-v8 or similar)
```

**Current state:** Coverage is not measured or enforced. The `vitest.config.ts` has no coverage section. No coverage provider (`@vitest/coverage-v8` or `@vitest/coverage-istanbul`) is installed.

## Test Types

**Unit Tests:**
- Pure function tests for parsers/formatters: `parseTagAliasMap`, `shellEscape`, `formatLegacyLineReference`, `extractLegacyLineReferences`, `extractNativeBlockReferences`, `buildReferenceContextSnippet`, `extractTagTermCandidates`, `normalizeDelimitedList`, `diffZoteroConfig`
- Logic tests for state-free functions: `mergeViewRefreshRequests`, `shouldHandleViewRefresh`, `normalizeDoi`, `normalizeArxivId`, `buildCitationKey`, `buildSourceKey`, `parseSourceSpecs`, `formatParentheticalCitation`
- Assertions on Map values, string outputs, array contents

**Integration Tests:**
- Functions that cross module boundaries: `collectLinkCandidates`, `getBacklinkFiles`, `getCurrentNoteFile`, `getAllSupportedNoteFiles`, `getResearchSourceMetadataFromFrontmatter`
- Full workflow tests: `runPaperWorkflow`, `ingestResearchSource` (create temp vault, write files, run pipeline, inspect outputs)
- CLI command routing tests: spawn `node cli/lti-research.mjs` via `execFile`, parse stdout JSON, verify structured results
- File system integration: `fs.readFile` / `fs.access` assertions on generated files
- Network API integration: OpenAlex API fetch stubs that return realistic response shapes

**E2E Tests:**
- Not used. No browser/playwright/cypress tests. All tests run in Node.js.

## Common Patterns

**Async Testing:**
```typescript
it("includes Excalidraw notes in link candidate collection", async () => {
  const app = makeApp({ files: [current, canvas], contents: { ... }, caches: { ... } });
  const candidates = await collectLinkCandidates(app, current, "", { relationKeys: [] }, [], new Map());
  expect(candidates).toHaveLength(1);
});
```

**Error Testing:**
```typescript
// Rejection assertion with structured error matching
await expect(formatReferenceRange({
  vaultPath, notePath: "...", kind: "line", query: "mentions governance", scope: "paragraph"
})).rejects.toMatchObject<CliCommandError>({
  code: "ambiguous-match",
  details: { match_count: 2 }
});

// CLI error via stdout (non-zero exit is expected pattern)
await expect(execFileAsync(process.execPath, [...])).rejects.toMatchObject({
  stdout: expect.stringContaining("\"code\": \"ambiguous-match\"")
});
```

**Snapshot Testing:**
- Not used. No `toMatchSnapshot()` or `toMatchInlineSnapshot()` calls found.

**Parameterized Tests:**
- Not used. No `it.each()` or `describe.each()` patterns found. Each case gets its own `it()` block.

**Type Assertions in Tests:**
- `{ relationKeys: [] } as never` — common pattern to pass partial mock settings objects where full type is required
- `makeApp(...) as never` — the factory returns `as never` to avoid typing the incomplete mock

---

*Testing analysis: 2026-05-12*
