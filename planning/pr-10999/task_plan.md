# Task Plan: PR #10999 approval

## Goal
Clear the remaining ReviewBot blockers for `obsidianmd/obsidian-releases#10999`, validate the plugin locally, and prepare the exact release and PR follow-up steps.

## Current Phase
Phase 2

## Phases

### Phase 1: Discovery and constraints
- [x] Confirm the upstream PR number and latest bot comments
- [x] Confirm the live Obsidian vault and loaded plugin directory
- [x] Inspect the plugin worktree to avoid overwriting unrelated changes
- [x] Recall any durable memory that affects the workflow
- **Status:** complete

### Phase 2: Plan tracking setup
- [x] Create `planning/pr-10999/` working files
- [x] Record the current blockers and constraints in `findings.md`
- [x] Keep `progress.md` updated after each major action
- **Status:** complete

### Phase 3: ReviewBot fix implementation
- [x] Replace hardcoded config-dir paths with `app.vault.configDir`
- [x] Remove the unnecessary `async` from `openPdfPlusSettings`
- [x] Keep existing README/settings/styles edits intact
- [x] Bump plugin version and regenerate build artifacts
- **Status:** complete

### Phase 4: Validation
- [x] Run tests
- [x] Run build
- [x] Search for remaining runtime `.obsidian` path assumptions
- [x] Sync build output into the live vault plugin directory
- [ ] Check runtime logs for regressions after plugin reload
- **Status:** in_progress

### Phase 5: Persist learnings and handoff
- [x] Update `findings.md` and `progress.md` with final verification
- [x] Append the review workflow finding to `.learnings/LEARNINGS.md`
- [x] Save durable memory in SQLite
- [x] Prepare and post the release and PR follow-up text
- **Status:** complete

## Key Questions
1. Whether you want to reload the running Obsidian plugin now to confirm `debug-runtime.log` records `0.1.36`
2. Whether to wait for the next ReviewBot scan before doing any additional cleanup

## Decisions Made
| Decision | Reason |
|------|------|
| Track this task in `planning/pr-10999/` | Keep PR-specific state separate from existing planning history |
| Preserve current uncommitted README/settings/styles work | These changes are already in progress and unrelated to the remaining ReviewBot blockers |
| Target the latest bot findings only | No human reviewer comments are currently blocking the PR |
| Derive Smart Connections exclusions from `configDir` at load time | This removes the remaining hardcoded config-folder assumption without changing user-facing behavior |
| Push and release before manual GUI reload confirmation | The upstream scan depends on the source repo and GitHub release, while the local GUI reload is a separate runtime confirmation step |

## Errors Encountered
| Error | Attempt | Solution |
|------|------|----------|
| GitHub API access blocked in sandbox | 1 | Re-ran `gh` commands with escalated permissions for read-only PR inspection |

## Notes
- Re-read this file before any release or PR-facing action.
- Do not open a new PR or rebase the existing submission branch.
