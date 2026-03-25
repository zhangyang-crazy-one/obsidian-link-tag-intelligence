---
name: obsidian-plugin-dev
description: Use when creating, modifying, debugging, styling, or deploying an Obsidian plugin. Triggers for tasks involving Obsidian API, WorkspaceLeaf, custom ItemView refresh behavior, Obsidian icons, MarkdownPostProcessor, or vault plugin deployment.
---

# Obsidian Plugin Development Skill

## Quick Start

### Development Workflow

1. **Setup**: Use `npm run dev` for hot-reload development
2. **Implement**: Follow Obsidian API best practices
3. **Test**: Verify with hot-reload in test vault
4. **Build**: Use `npm run build` for production

## Core Principles

### Vault.process() MUST be used

All file operations MUST use `Vault.process()` instead of `Vault.read()` + `Vault.modify()`:

```typescript
// ✅ Correct
await Vault.process(file, (content) => {
  return content.replace(oldText, newText);
});
```

### Lifecycle Management

- `onload()`: Register all events, intervals, views
- `onunload()`: Clean up resources (register* methods auto-clean)
- Use `registerEvent()`, `registerInterval()`, `registerDomEvent()`

### Recent Lessons

1. **Sidebar flicker is usually over-refresh, not CSS**
   - If an `ItemView` calls `contentEl.empty()` on every `refresh()`, the panel will visibly blink once refreshes are driven by `file-open`, `active-leaf-change`, `metadataCache.changed`, and `rename`.
   - Prefer a stable shell built once in `onOpen()` and incremental section updates.
   - Filter `metadataCache.changed` so it only refreshes the current context file or directly relevant dependencies.

2. **Ribbon icon and leaf/tab icon are different**
   - `addRibbonIcon()` only changes the left Ribbon button.
   - The icon shown on the opened custom view is controlled by `ItemView.getIcon()`.
   - If the header icon looks wrong, fix `getIcon()` first.

3. **Custom Obsidian icons are fragile**
   - `addIcon()` expects SVG inner content, not a full `<svg>` wrapper.
   - Even valid custom SVG can render badly in constrained header chrome.
   - Prefer built-in Obsidian icon names for stable leaf/tab icons.

4. **Build success does not mean vault is updated**
   - After `npm run build`, verify whether the vault plugin directory is a symlink or a real directory.
   - If it is a real directory, copy `main.js`, `styles.css`, `manifest.json`, and `versions.json`.
   - Do not overwrite `data.json` or runtime logs.

5. **Do not invent placeholder UI outside the design**
   - If the Pencil or screenshot design does not show an empty-state panel, hide the section instead of rendering a generic placeholder card.

### Gotchas (Common Mistakes)

1. **Memory leaks**: Always clean up in `onunload()`
2. **DOM manipulation**: Use CodeMirror API, not direct DOM
3. **Sync operations**: Use async/await, don't block main thread
4. **Mobile compatibility**: Test UI components on mobile
5. **Header icon confusion**: Changing only the Ribbon icon will not change the opened view's icon
6. **Full panel rebuilds**: Avoid clearing and rebuilding the whole sidebar for every refresh

## Reference Documentation

### Obsidian API Basics
Read `references/obsidian_api_reference.md` for:
- Workspace, Vault, and MetadataCache API usage
- Creating custom Views and Settings tabs

### Common Antipatterns
Review `references/common_antipatterns.md` before implementing:
- Security considerations
- Mobile compatibility
- Why use `app.vault` instead of Node's `fs`
- Why full `contentEl.empty()` refreshes cause flicker in long-lived sidebars

## Validation Scripts

Run before committing:
```bash
bash scripts/validate-manifest.sh
```

## Tech Stack

- TypeScript
- Obsidian API
- esbuild for bundling
- Vitest for testing
