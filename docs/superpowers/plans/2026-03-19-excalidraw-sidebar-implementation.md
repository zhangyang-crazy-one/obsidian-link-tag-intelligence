# Excalidraw 差异化侧边栏实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Excalidraw 视图中，侧边栏隐藏块/行引用区域（renderExactReferenceSection），只显示 wikilink 相关内容（出链、反链）。

**Architecture:** 通过在 `refresh()` 方法中判断 `isExcalidrawFile(activeFile)`，条件性地渲染精确引用区域。`isExcalidrawFile` 函数已存在于 `view.ts`。

**Tech Stack:** TypeScript, Obsidian API

---

## Chunk 1: view.ts 侧边栏条件渲染

### Task 1: 添加 Excalidraw 文件判断逻辑

**Files:**
- Modify: `src/view.ts` — `refresh()` 方法（约第 100-115 行）

- [ ] **Step 1: 读取当前 refresh() 方法中 renderFileSection 和 renderExactReferenceSection 的调用位置**

```bash
grep -n "renderFileSection\|renderExactReferenceSection" src/view.ts
```

- [ ] **Step 2: 修改 refresh() 方法，在 renderExactReferenceSection 调用前添加 isExcalidrawFile 判断**

在约第 107-110 行（renderExactReferenceSection 调用处），添加条件：

```typescript
const isExcalidraw = isExcalidrawFile(activeFile);

this.renderFileSection(content, "outgoing-links", this.plugin.t("outgoingLinks"), await getOutgoingLinkFiles(this.app, activeFile), true);
this.renderFileSection(content, "backlinks", this.plugin.t("backlinks"), await getBacklinkFiles(this.app, activeFile), false);

if (!isExcalidraw) {
  this.renderExactReferenceSection(content, "outgoing-references", this.plugin.t("outgoingReferences"), await getOutgoingExactReferences(this.app, activeFile), "outgoing", true);
  this.renderExactReferenceSection(content, "incoming-references", this.plugin.t("incomingReferences"), await getIncomingExactReferences(this.app, activeFile), "incoming", false);
}
```

- [ ] **Step 3: 运行测试确认无破坏性变更**

```bash
npm test 2>&1 | tail -20
```

Expected: 所有测试通过

- [ ] **Step 4: 提交**

```bash
git add src/view.ts
git commit -m "feat(excalidraw): hide exact reference sections in sidebar for excalidraw files"
```

---

## Chunk 2: 验证与构建

### Task 2: 构建并部署到 vault

**Files:**
- Build: `main.js` → vault plugin directory

- [ ] **Step 1: 构建**

```bash
npm run build 2>&1 | tail -10
```

- [ ] **Step 2: 复制到 vault**

```bash
cp main.js /home/zhangyangrui/Datesets_4_me/note/my_notebook/.obsidian/plugins/link-tag-intelligence/main.js
```

- [ ] **Step 3: 提交**

```bash
git add main.js 2>/dev/null; git commit -m "build: deploy excalidraw sidebar changes"
```

Expected: 提交成功

---

## 验证清单

1. 在 Excalidraw 视图中打开 `.excalidraw.md` 文件：
   - [ ] 侧边栏显示"当前笔记"、"出链"、"反链"
   - [ ] **不显示**"精确出链"、"精确反链"区域
   - [ ] 工具栏按钮全部可点击

2. 在普通 Markdown 视图中：
   - [ ] 所有区域正常显示，包括"精确出链"、"精确反链"
   - [ ] 行为与修改前完全一致
