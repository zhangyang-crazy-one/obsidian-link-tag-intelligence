# Findings: reference CLI extension

## Context

- The current CLI already supports explicit line-range inspection and formatting through `ref inspect` and `ref format`.
- The remaining workflow pain is that agents still need manual line numbers, which is brittle for real research-note drafting.
- The plugin's existing reference syntax already covers the needed output forms:
  - line reference: `<<Target:12-15>>`
  - legacy block-style line range: `(((Target#12-15)))`

## Design Direction

- Add a snippet-driven lookup layer that resolves text to a concrete line span inside a note.
- Support two scopes:
  - `line`: each matching line becomes a candidate
  - `paragraph`: contiguous non-empty lines become a candidate paragraph span
- Keep output JSON-first so Codex / Claude Code can pick a candidate deterministically.

## Implementation Findings

- `ref locate` is the right discovery primitive for agents because it can return multiple candidates without committing to one citation.
- `ref format --query ...` should fail on ambiguity instead of silently taking the first hit. That keeps downstream paper-writing steps reproducible.
- Real Markdown vault content needs stronger paragraph heuristics than test fixtures:
  - skip YAML frontmatter
  - treat headings as standalone boundaries
  - treat list items as standalone boundaries
  - otherwise summary/abstract queries can collapse into whole-file matches

## Validation Outcome

- The CLI now supports:
  - `ref locate --query ... --scope paragraph|line`
  - `ref format --query ... --scope paragraph|line [--occurrence N]`
- Real-vault validation against `doi-10-1093-polsoc-puaf001.md` resolved the snippet `adaptive, participatory, and proactive approaches` to line `46` and generated:
  - `<<Knowledge/Research/Literature/doi-10-1093-polsoc-puaf001:46>>`

## Constraints

- No native `[[note#^blockid]]` generation in this pass.
- No automatic insertion into target notes in this pass.
- Ambiguous snippet matches must return structured data or a structured error, not a silent first-hit guess.
