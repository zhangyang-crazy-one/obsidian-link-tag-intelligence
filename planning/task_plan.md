# Task Plan

## Goal

Turn the plugin settings page into a researcher workbench that can directly inspect, configure, and orchestrate companion plugins used in the vault.

## Phases

| Phase | Status | Notes |
| --- | --- | --- |
| 1. Capture context and constraints | complete | Preserved existing user changes and recorded vault/plugin paths. |
| 2. Inspect current architecture | complete | Reviewed main/settings/i18n/styles/tests and live companion configs. |
| 3. Implement companion adapter layer | complete | Added config detection, diffing, and apply flows for Zotero, PDF++, and Smart Connections. |
| 4. Rebuild settings workbench UI | complete | Replaced guide-style settings with an operational workbench, then shifted from split dashboard to a tabbed single-column workbench after screenshot review. |
| 5. Validate and sync | complete | Ran typecheck/tests/build, then bumped the local plugin to 0.1.39 and copied compiled files into the live vault plugin directory. |

## Constraints

- Chinese-first UX.
- Theme-aware styling.
- Reduce jumping to other plugin settings.
- Use explicit apply actions for companion configs.
- Home dashboard must stay summary-first, with grouped entry points instead of one long action-card wall.
- Permanent split-pane layouts are not acceptable when they compress Chinese content into narrow columns; switch to top tabs before allowing that squeeze.
- Use `apply_patch` for file edits.
- Do not revert unrelated uncommitted changes.

## Risks

- Companion plugin config schemas may differ across versions.
- Some commands/settings tabs are not typed in Obsidian API and need safe runtime casts.
