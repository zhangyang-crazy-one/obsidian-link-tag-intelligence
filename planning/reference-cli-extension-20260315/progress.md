# Progress Log

## Session: 2026-03-15

### Phase 1: Ground current reference CLI
- **Status:** complete
- Actions:
  - Re-read `cli/reference-lib.mjs`, `cli/lti-research.mjs`, and `tests/reference-cli.test.ts`
  - Confirmed that the current extension only supports explicit line ranges
  - Chose snippet-based locate/format as the next implementation scope because it removes manual line counting for agents while preserving the existing reference syntax
- Created/modified files:
  - `planning/reference-cli-extension-20260315/task_plan.md`
  - `planning/reference-cli-extension-20260315/findings.md`
  - `planning/reference-cli-extension-20260315/progress.md`

### Phase 2: Implement snippet-based locating
- **Status:** complete
- Actions:
  - Added snippet-based locate helpers to `cli/reference-lib.mjs`
  - Added `ref locate` command routing to `cli/lti-research.mjs`
  - Extended `ref format` so `--query` + `--scope` can resolve a unique line/paragraph span without explicit line numbers
  - Added structured ambiguity and occurrence errors for query-based formatting
- Created/modified files:
  - `cli/reference-lib.mjs`
  - `cli/lti-research.mjs`
  - `tests/reference-cli.test.ts`

### Phase 3: Validate and document
- **Status:** complete
- Actions:
  - Added regression coverage for paragraph lookup, query formatting, ambiguity handling, and Markdown structural boundaries
  - Updated CLI help text and README examples to document `ref locate` and `ref format --query`
  - Real-vault validation initially exposed a paragraph-splitting bug where no-blank-line Markdown sections collapsed into a whole-file match
  - Refined paragraph heuristics to skip frontmatter and break on headings/list items, then re-ran tests and real-vault validation
  - Updated the Brain-storm `obsidian` skill and the vault-side Chinese workflow guide to make `ref locate` / `ref format --query` the default fine-grained citation path
  - Persisted the new default workflow into project/global SQLite memory; the `memory_store.py add` command required separate `project` and `global` writes because it does not accept `--scope both`
- Created/modified files:
  - `cli/reference-lib.mjs`
  - `cli/lti-research.mjs`
  - `README.md`
  - `tests/reference-cli.test.ts`
  - `/home/zhangyangrui/my_programes/Brain-storm/.codex/skills/obsidian/SKILL.md`
  - `/home/zhangyangrui/Datesets_4_me/note/my_notebook/Knowledge/Research/研究工作流配置说明.md`
  - `/home/zhangyangrui/my_programes/Brain-storm/.learnings/LEARNINGS.md`
