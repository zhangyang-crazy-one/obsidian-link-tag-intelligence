# Task Plan: reference CLI extension

## Goal
Extend the `lti-research` CLI so agents can locate fine-grained evidence anchors from note text and generate Link & Tag Intelligence references without manually counting line numbers.

## Current Phase
Phase 2

## Phases

### Phase 1: Ground current reference CLI
- [x] Re-read the existing `ref inspect` / `ref format` implementation
- [x] Confirm the current gaps against the user's fine-grained citation requirement
- [x] Record the next-scope extension in a dedicated planning folder
- **Status:** complete

### Phase 2: Implement snippet-based locating
- [x] Add note-text search helpers for line/paragraph scope matching
- [x] Add `ref locate` JSON output for multiple candidate ranges
- [x] Allow `ref format` to resolve a unique match from `--query`
- **Status:** complete

### Phase 3: Validate and document
- [x] Add regression tests for locate/format query flows
- [x] Update CLI help and README examples
- [x] Run syntax checks, tests, build, and one real-vault validation
- **Status:** complete

## Decisions Made
| Decision | Reason |
| --- | --- |
| Keep this pass read-only with no note mutation | The immediate gap is locating precise evidence, not inserting or rewriting notes |
| Treat paragraph references as paragraph-to-line-span resolution | This fits the plugin's existing legacy line/block reference model without inventing a new syntax |
| Prefer explicit ambiguity errors over silently choosing the first match | Agents need reproducible citations, not best-effort guesses |

## Risks
- Paragraph boundaries in Markdown are heuristic because lists and headings are line-based, not semantic blocks.
- Common snippets may match multiple paragraphs; the CLI must fail clearly instead of producing unstable references.
