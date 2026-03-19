---
name: obsidian-plugin-dev
description: Use when creating, modifying, or debugging an Obsidian plugin. Triggers for tasks involving Obsidian API, WorkspaceLeaf, MarkdownPostProcessor, or custom views.
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

### Gotchas (Common Mistakes)

1. **Memory leaks**: Always clean up in `onunload()`
2. **DOM manipulation**: Use CodeMirror API, not direct DOM
3. **Sync operations**: Use async/await, don't block main thread
4. **Mobile compatibility**: Test UI components on mobile

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