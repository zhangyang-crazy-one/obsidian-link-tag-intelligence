# Excalidraw 视图差异化侧边栏设计

## Context

用户希望在 Excalidraw 画布视图中完全使用 LTI 插件功能（插入链接、引用，显示反链等）。

## 架构限制

Excalidraw 的 `.excalidraw.md` 文件结构：
```
---
frontmatter
---
# Markdown 区域 (Obsidian markdown 渲染器处理)
%%
## Text Elements  ← Excalidraw 画布数据，非 markdown
(((会计_第二章)))  ← 纯文本，Excalidraw SVG 渲染器处理
## Drawing
JSON 数据
%%
```

- `((()))` 块引用和 `<<>>` 行引用语法只有在 Obsidian markdown 渲染管道中才能被 `renderLegacyReferences()` 处理成可点击 DOM 芯片
- Excalidraw 的 Text Elements 完全绕过 Obsidian markdown 渲染，是 Excalidraw 自有渲染器绘制的纯文本
- `[[wikilink]]` 是 Excalidraw **原生支持**的格式，在画布上 Ctrl+点击可跳转

结论：`((()))` / `<<>>` 语法无法在 Excalidraw 画布上显示为可点击引用芯片，除非修改 Excalidraw 插件本身。

## 解决方案

Excalidraw 视图中，侧边栏只显示 wikilink 相关内容，不显示块/行引用：

| 区域 | Excalidraw 视图 | 普通 Markdown 视图 |
|------|----------------|-------------------|
| 当前笔记 | ✓ | ✓ |
| 出链（wikilink） | ✓ | ✓ |
| 反链（wikilink） | ✓ | ✓ |
| 精确出链（块/行引用） | **✗ 隐藏** | ✓ |
| 精确反链（块/行引用） | **✗ 隐藏** | ✓ |
| 插入链接 | `[[filename]]` | 编辑器插入 |

## 修改文件

### `src/view.ts` — 侧边栏条件渲染

在 `refresh()` 方法中（约第 107-110 行），判断是否为 Excalidraw 文件：

```typescript
const isExcalidraw = isExcalidrawFile(activeFile);

this.renderFileSection(content, "outgoing-links", ...);  // wikilinks，始终显示
this.renderFileSection(content, "backlinks", ...);        // wikilinks，始终显示

// 仅非 Excalidraw 时显示块/行引用
if (!isExcalidraw) {
  this.renderExactReferenceSection(content, "outgoing-references", ...);
  this.renderExactReferenceSection(content, "incoming-references", ...);
}
```

### `src/main.ts` — 插入文本使用 vault.process + wikilink

`insertTextIntoFile` 方法已实现（vault.process 回退），无需修改。但需确认 Excalidraw 文件中插入的链接格式为 `[[filename]]`（Excalidraw 原生支持）。

### `src/notes.ts` — 已有 `isExcalidrawFile` 函数

`isExcalidrawFile(file: TFile)` 已存在（line 80-83），可直接使用。

## 验证

1. Excalidraw 视图中：侧边栏只有"当前笔记"、"出链"、"反链"，无"精确出链/反链"区域
2. 点击"插入链接"→ 确认 `[[filename]]` 被追加到 `.excalidraw.md` 的 markdown 区域
3. 普通 Markdown 视图中：所有区域正常显示，行为不变
