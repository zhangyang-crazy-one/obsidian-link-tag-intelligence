# Obsidian 插件开发规范

> 加载时机：SessionStart（会话开始时）
> 适用范围：Obsidian Link Tag Intelligence 插件开发
> **参考来源**：NotebookLM 深入讨论 (notebook_id: 6a1ff318-8f61-4df0-bb44-07d29ddb5021)

---

## 1. 核心开发原则

### 1.1 Vault 文件操作（必须优先使用）

**必须使用 `Vault.process()`** 而非组合使用 `Vault.read()` + `Vault.modify()`，以防止数据丢失。

```typescript
// ✅ 正确：使用 process()
await Vault.process(file, (content) => {
  return content.replace(oldText, newText);
});

// ❌ 错误：可能导致数据丢失
const content = await Vault.read(file);
content = content.replace(oldText, newText);
await Vault.modify(file, content);
```

**异步修改流程**：
1. 使用 `Vault.cachedRead()` 读取
2. 执行异步操作
3. 使用 `Vault.process()` 更新
4. 在回调中检查数据是否被其他进程修改

### 1.2 MetadataCache 使用

```typescript
// 链接解析
const cache = app.metadataCache.getCache(filePath);
const links = cache.links;           // 已解析链接
const unresolvedLinks = cache.unresolvedLinks;  // 未解析链接

// 监听变化
app.metadataCache.on('changed', (file) => { /* 处理变更 */ });
app.metadataCache.on('deleted', (file) => { /* 处理删除 */ });
app.metadataCache.on('resolved', (file) => { /* 处理解析 */ });
```

---

## 2. 插件生命周期管理

### 2.1 onload/onunload 规范

```typescript
export default class MyPlugin extends Plugin {
  async onload() {
    // 注册视图
    this.registerView(VIEW_TYPE, (leaf) => new MyView(leaf, this));

    // 注册命令
    this.addCommand({ id: 'my-command', name: 'My Command', callback: () => {} });

    // 注册事件（自动清理）
    this.registerEvent(this.app.metadataCache.on('changed', this.onFileChange));

    // 注册定时器（自动清理）
    this.registerInterval(setInterval(() => {}, 1000));

    // 注册 DOM 事件（自动清理）
    this.registerDomEvent(window, 'scroll', this.onScroll);
  }

  onunload() {
    // 清理资源（但 register* 的会自动清理）
    this.view?.unload();
  }
}
```

### 2.2 必须使用的注册方法

| 方法 | 用途 | 自动清理 |
|------|------|----------|
| `registerEvent()` | 事件监听 | ✅ |
| `registerInterval()` | 定时器 | ✅ |
| `registerDomEvent()` | DOM 事件 | ✅ |
| `registerEditorExtension()` | CodeMirror 扩展 | ✅ |

---

## 3. CodeMirror 6 集成

### 3.1 编辑器扩展注册

```typescript
// 注册扩展
this.registerEditorExtension(buildReferenceEditorExtension(this));

// 动态重配置（需要传入数组）
const extensions: Extension[] = [...];
this.registerEditorExtension(extensions);

// 修改后调用
workspace.updateOptions();
```

### 3.2 Markdown 处理器

- 使用 `MarkdownSourceView` 处理源编辑模式
- 使用 `MarkdownEditorView` 处理实时预览模式
- **禁止**直接操作 DOM，使用 CodeMirror API

---

## 4. Hot Reload 工作流

### 4.1 配置步骤

1. 安装 `pjeby/hot-reload` 插件到开发 Vault
2. 确保插件目录包含 `.git` 文件夹或空的 `.hotreload` 文件
3. 运行 `npm run dev` 启动监视模式

### 4.2 触发机制

- Hot Reload 监听 `main.js`、`styles.css`、`manifest.json` 变化
- 文件停止变化约 0.75 秒后自动禁用并重新启用插件
- 观察 Obsidian 中的 Notice 确认重载发生

### 4.3 注意事项

**良好的 `onunload()` 资源清理至关重要**。如果不正确使用 `register*()` 方法释放资源，热重载可能导致 Obsidian 处于不稳定状态，需要重启整个应用才能恢复。

---

## 5. 构建与发布

### 5.1 开发构建

```bash
npm run dev  # 监视模式，持续编译到 main.js
```

### 5.2 生产构建

```bash
npm run build  # 一次性构建
```

### 5.3 版本管理

- **必须遵循语义化版本**：`x.y.z` 格式
- 更新 `manifest.json` 中的 `version`
- 更新 `versions.json`：`"new-version": "minimum-obsidian-version"`
- GitHub Release 的 Tag 必须与 manifest.json 完全一致，**不要包含 `v` 前缀**

### 5.4 发布产物

上传到 GitHub Release：
- `main.js`
- `manifest.json`
- `styles.css`（如有）

---

## 6. 开发者政策合规

**禁止行为**：
- 混淆代码隐藏目的
- 在插件界面外插入静态广告
- 未经批准的网络使用
- 客户端遥测
- 自动更新机制

**必须披露**：
- 需要付费才能完整访问
- 需要账号才能完整访问
- 网络使用情况
- 访问 Obsidian vault 外的文件

---

## 7. 参考来源

- [obsidian-sample-plugin-plus](https://github.com/davidvkimball/obsidian-sample-plugin-plus) - AI 辅助开发模板
- [Obsidian Developer Documentation](https://docs.obsidian.md) - 官方 API 文档
- [Hot-Reload Plugin](https://github.com/pjeby/hot-reload) - 自动重载插件
- [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) - 官方发布政策
