# Common Antipatterns in Obsidian Plugin Development

> 本文档列出 Obsidian 插件开发中的常见错误和正确做法。

---

## 1. 文件操作错误

### 1.1 禁止使用 Vault.read() + Vault.modify()

```typescript
// ❌ 错误：分开读写不是原子操作
const content = await app.vault.read(file);
await app.vault.modify(file, content.replace(oldText, newText));

// ✅ 正确：使用 Vault.process() 保证原子性
await app.vault.process(file, (content) => {
  return content.replace(oldText, newText);
});
```

**原因**：`Vault.read()` 和 `Vault.modify()` 之间可能有其他插件修改文件，导致数据丢失。

### 1.2 禁止使用 Node.js fs 模块

```typescript
// ❌ 错误：绕过 Obsidian 虚拟文件系统
import * as fs from 'fs';
const content = fs.readFileSync('file.md', 'utf-8');

// ✅ 正确：使用 Vault API
const content = await app.vault.read(file);
```

**原因**：使用 `fs` 会绕过 Obsidian 的事件系统和缓存，导致其他插件无法感知变化。

---

## 2. 内存泄漏

### 2.1 忘记清理事件监听器

```typescript
// ❌ 错误：在 onload 中注册但不清理
async onload() {
  app.vault.on('modify', this.onModify);
}

// ✅ 正确：使用 registerEvent 自动清理
async onload() {
  this.registerEvent(app.vault.on('modify', this.onModify));
}

async onunload() {
  // registerEvent 会自动清理，无需手动
}
```

### 2.2 忘记清理定时器

```typescript
// ❌ 错误：定时器未清理
const intervalId = window.setInterval(() => {
  this.doSomething();
}, 1000);

// ✅ 正确：使用 registerInterval
this.registerInterval(window.setInterval(() => {
  this.doSomething();
}, 1000));
```

### 2.3 DOM 事件未清理

```typescript
// ❌ 错误：DOM 事件未清理
document.addEventListener('click', this.handleClick);

// ✅ 正确：使用 registerDomEvent
this.registerDomEvent(document, 'click', this.handleClick);

// 或在 onunload 中手动清理
document.removeEventListener('click', this.handleClick);
```

---

## 3. 异步错误

### 3.1 async 函数未正确等待

```typescript
// ❌ 错误：async 函数不等待
async onload() {
  this.loadData();  // 未等待
}

// ✅ 正确：确保 async 操作完成
async onload() {
  await this.loadSettings();
  await this.initialize();
}
```

### 3.2 忽略 Promise 错误

```typescript
// ❌ 错误：不处理 Promise  rejection
app.vault.modify(file, content)
  .catch(error => {
    console.error('Failed to modify file', error);
  });
```

### 3.3 在循环中顺序等待不必要的异步操作

```typescript
// ❌ 错误：顺序等待可并行的操作
for (const file of files) {
  await processFile(file);
}

// ✅ 正确：并行处理
await Promise.all(files.map(file => processFile(file)));
```

---

## 4. 视图和 DOM 错误

### 4.1 直接操作 DOM 而非使用 CodeMirror

```typescript
// ❌ 错误：直接操作编辑器 DOM
const editorEl = view.contentEl.querySelector('.cm-content');
editorEl.textContent = 'new content';

// ✅ 正确：使用 CodeMirror API
const cm = view.editor;
cm.setValue('new content');
```

### 4.2 视图生命周期错误

```typescript
// ❌ 错误：在 onOpen 中重复创建 DOM
async onOpen() {
  this.containerEl.createEl('div', { cls: 'my-class' });
  // 多次调用会重复创建
}

// ✅ 正确：先清空再创建
async onOpen() {
  this.containerEl.empty();
  this.containerEl.createEl('div', { cls: 'my-class' });
}
```

---

## 5. 设置和状态错误

### 5.1 设置未持久化

```typescript
// ❌ 错误：设置保存在内存中，重启丢失
this.settings = { key: 'value' };

// ✅ 正确：使用 saveData/loadData
async onload() {
  await this.loadSettings();
}

async saveSettings() {
  await this.saveData(this.settings);
}
```

### 5.2 设置变更后未保存

```typescript
// ❌ 错误：修改设置但不保存
setting.addText(text => {
  text.onChange((value) => {
    this.settings.key = value;
    // 没有保存！
  });
});

// ✅ 正确：立即保存或提供保存按钮
setting.addText(text => {
  text.onChange(async (value) => {
    this.settings.key = value;
    await this.saveSettings();
  });
});
```

---

## 6. 插件加载错误

### 6.1 在 onload 中执行耗时操作

```typescript
// ❌ 错误：阻塞插件加载
async onload() {
  const data = await fetchLargeData();  // 耗时操作
  this.data = data;
}

// ✅ 正确：使用 requestAnimationFrame 或 setTimeout
async onload() {
  this.loadData();
}

loadData() {
  requestAnimationFrame(async () => {
    const data = await fetchLargeData();
    this.data = data;
  });
}
```

### 6.2 插件卸载后仍执行异步操作

```typescript
// ❌ 错误：卸载后继续执行
async onload() {
  this.intervalId = window.setInterval(() => {
    this.doPeriodicWork();  // 卸载后仍可能执行
  }, 1000);
}

// ✅ 正确：设置标志位检查
let unloaded = false;

async onunload() {
  this.unloaded = true;
}

doPeriodicWork() {
  if (this.unloaded) return;
  // 执行工作
}
```

---

## 7. 事件处理错误

### 7.1 事件回调中访问 this 错误

```typescript
// ❌ 错误：this 上下文丢失
app.vault.on('modify', function(file) {
  console.log(this.plugin);  // this 是 undefined
});

// ✅ 正确：使用箭头函数或绑定
app.vault.on('modify', (file) => {
  console.log(this.plugin);  // this 正确
});

// 或在构造函数中绑定
constructor() {
  this.onModify = this.onModify.bind(this);
}
```

### 7.2 事件名拼写错误

```typescript
// ❌ 错误：使用错误的事件名
app.vault.on('change', callback);  // 不存在

// ✅ 正确：使用正确的事件名
app.vault.on('modify', callback);
app.vault.on('create', callback);
app.vault.on('delete', callback);
```

---

## 8. 移动端兼容性

### 8.1 假设桌面端特有的 API 存在

```typescript
// ❌ 错误：假设 workspace.layout 管理器存在
app.workspace.layout_ready;  // 移动端可能不存在

// ✅ 正确：检查 API 是否存在
if (app.workspace.layout) {
  // 使用 layout API
}
```

### 8.2 使用移动端不支持的 CSS

```typescript
// ❌ 错误：使用 position: fixed 配合特定行为
element.style.position = 'fixed';
element.style.left = '10px';

// ✅ 正确：使用 Obsidian 提供的布局 API
```

---

## 9. 安全问题

### 9.1 执行用户输入作为代码

```typescript
// ❌ 错误：执行用户输入
eval(userInput);

// ✅ 正确：永不执行用户输入
```

### 9.2 暴露敏感 API

```typescript
// ❌ 错误：在视图中暴露内部 API
view.internalAPI = this.secretMethod;

// ✅ 正确：使用安全的通信方式
```

---

## 10. 性能问题

### 10.1 频繁访问 metadataCache

```typescript
// ❌ 错误：每次调用都重新解析
for (const file of files) {
  const cache = app.metadataCache.getFileCache(file);
  // 大量文件时很慢
}

// ✅ 正确：批量处理或缓存
const allCache = app.metadataCache.getCachedFiles();
```

### 10.2 未移除不需要的视图

```typescript
// ❌ 错误：创建视图但不移除
app.workspace.createLeaf().openFile(file);

// ✅ 正确：跟踪并关闭不需要的视图
const leaf = app.workspace.createLeaf();
leaf.openFile(file);
// 稍后关闭
await leaf.close();
```

---

## 11. 调试代码

### 11.1 使用 console.log

```typescript
// ❌ 错误：使用 console.log
console.log('Debug:', data);

// ✅ 正确：使用 Obsidian Logger
import { Plugin } from 'obsidian';

export default class MyPlugin extends Plugin {
  onload() {
    this.logger = this.logger;
  }
}

// 在 settings 中配置日志级别
```

### 11.2 生产代码保留调试断点

```typescript
// ❌ 错误：保留 debugger 语句
function process() {
  debugger;  // 生产环境不应有
}

// ✅ 正确：移除所有 debugger
function process() {
  // 仅在开发时添加日志
}
```

---

## 12. 测试问题

### 12.1 使用真实 Vault 而非模拟

```typescript
// ❌ 错误：集成测试使用真实 Vault
const realApp = new App();
await realApp.vault.create('test.md', 'content');

// ✅ 正确：使用模拟对象
const mockVault = {
  read: jest.fn().mockResolvedValue('content'),
  modify: jest.fn().mockResolvedValue(),
};
```

---

## 13. 版本兼容性

### 13.1 使用已废弃的 API

```typescript
// ❌ 错误：使用旧版 API
app.getEditor();

// ✅ 正确：使用新版 API
app.workspace.activeEditor;
```

### 13.2 未处理 API 变化

```typescript
// ❌ 错误：假设 API 始终存在
const file = app.vault.getAbstractFileByPath(path);

// ✅ 正确：检查返回值的空安全
const file = app.vault.getAbstractFileByPath(path);
if (file instanceof TFile) {
  // 处理文件
}
```
