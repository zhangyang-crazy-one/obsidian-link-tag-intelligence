# Excalidraw 插件 API 调用插入链接

## 问题背景

在 LTI (Link Tag Intelligence) 插件中，当用户在 Excalidraw 文件中点击 sidebar 的"插入链接"按钮时：
1. 点击按钮导致 sidebar 获得焦点
2. Excalidraw 视图失去焦点
3. `insertLinkIntoEditor()` 被调用时，Excalidraw 已不是活动视图
4. 直接调用 `ea.addEmbeddable()` 无效

## 解决方案

### 1. 获取 ExcalidrawAutomate 对象

```typescript
const plugins = (app as any).plugins?.plugins;
const excalidrawPlugin = plugins?.['obsidian-excalidraw-plugin'];
const ea = excalidrawPlugin?.ea;
```

### 2. 找到目标 ExcalidrawView

```typescript
const excalidrawLeaves = app.workspace.getLeavesOfType('excalidraw');
const targetView = excalidrawLeaves.find(
  (leaf: any) => leaf.view?.file?.path === targetFile.path
);
```

### 3. 设置 targetView（关键步骤）

```typescript
// 设置目标视图，不抢夺焦点
ea.setView(targetView.view, false);
```

`setView(view, show)` 参数：
- `view`: ExcalidrawView 对象
- `show`: 是否显示并聚焦该视图，`false` 表示不抢夺焦点

### 4. 添加嵌入元素

```typescript
// 清空 workbench
ea.clear();

// 添加嵌入元素
// addEmbeddable(topX, topY, width, height, url, file, embeddableCustomData)
ea.addEmbeddable(100, 100, 200, 50, undefined, targetFile, undefined);

// 提交到视图
// addElementsToView(commitToHistory, select)
await ea.addElementsToView(true, true);
```

## 完整代码

```typescript
async insertLinkIntoEditor(file: TFile, alias = ""): Promise<void> {
  const targetFile = this.getContextNoteFile();

  if (targetFile && isExcalidrawFile(targetFile)) {
    const plugins = (this.app as any).plugins?.plugins;
    const excalidrawPlugin = plugins?.['obsidian-excalidraw-plugin'];

    if (excalidrawPlugin?.ea) {
      // 1. 找到目标 ExcalidrawView
      const excalidrawLeaves = this.app.workspace.getLeavesOfType('excalidraw');
      const targetView = excalidrawLeaves.find(
        (leaf: any) => leaf.view?.file?.path === targetFile.path
      );

      const ea = excalidrawPlugin.ea;

      // 2. 设置 targetView（不抢夺焦点）
      if (targetView) {
        ea.setView(targetView.view, false);
      }

      // 3. 清空并添加元素
      ea.clear();
      ea.addEmbeddable(100, 100, 200, 50, undefined, file, undefined);
      await ea.addElementsToView(true, true);

      return;
    }
  }

  // 回退到文本追加方式
  // ...
}
```

## 关键发现来源

- NotebookLM 研究表明：ExcalidrawAutomate (EA) 通过 `targetView` 属性路由所有命令
- 即使目标视图失焦，只要设置 `ea.setView(view, false)`，后续操作仍会在该视图上执行
- `addEmbeddable()` 不需要 `copyViewElementsToEAforEditing()`，因为是创建新元素而非修改现有元素

## 日期

2026-03-20
