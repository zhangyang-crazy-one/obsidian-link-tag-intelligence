# Obsidian API Reference

> 本参考文档提供 Obsidian 插件开发的核心 API 用法说明。

---

## 1. Vault API

### 1.1 Vault.process() (必须使用)

```typescript
// ✅ 正确：使用 Vault.process() 原子性读写
await app.vault.process(targetFile, (content) => {
  return content.replace(oldText, newText);
});

// ❌ 错误：分开读写可能导致数据丢失
const content = await app.vault.read(targetFile);  // 其他插件可能已修改文件
await app.vault.modify(targetFile, content.replace(oldText, newText));
```

### 1.2 常用 Vault 方法

| 方法 | 返回值 | 说明 |
|------|--------|------|
| `vault.read(file)` | `string` | 读取文件内容 |
| `vault.modify(file, content)` | `Promise<void>` | 修改文件内容 |
| `vault.create(path, content)` | `Promise<TFile>` | 创建新文件 |
| `vault.delete(file)` | `Promise<void>` | 删除文件 |
| `vault.rename(file, newPath)` | `Promise<void>` | 重命名文件 |
| `vault.getAbstractFileByPath(path)` | `TFile | null` | 根据路径获取文件 |
| `vault.getAllFiles()` | `TFile[]` | 获取所有文件 |
| `vault.getFiles()` | `TFile[]` | 获取普通文件（排除文件夹） |

### 1.3 File 和 Folder

```typescript
interface TFile {
  // 文件路径
  path: string;
  // 文件名
  name: string;
  // 扩展名
  extension: string;
  // 文件类型
  stat: {
    size: number;
    ctime: number;  // 创建时间
    mtime: number;  // 修改时间
  };
}

interface TFolder {
  path: string;
  name: string;
  children: (TFile | TFolder)[];
}
```

---

## 2. Workspace API

### 2.1 打开和切换视图

```typescript
// 打开侧边栏
app.workspace.leftRibbon.collapse(false);

// 获取当前活动叶
const activeLeaf = app.workspace.activeLeaf;

// 打开新视图
app.workspace.getLeaf('tab').openFile(file);
app.workspace.getLeaf('window').openFile(file);

// 拆分布局
app.workspace.createLeafBySplit('vertical').openFile(file);
```

### 2.2 WorkspaceLeaf

```typescript
interface WorkspaceLeaf {
  // 视图类型
  view: View;
  // 获取视图
  getView(): View;
  // 打开文件
  openFile(file: TFile): Promise<void>;
  // 聚焦
  focus(): void;
}
```

---

## 3. MetadataCache API

### 3.1 缓存结构

```typescript
interface CachedMetadata {
  // 文件元数据
  tags: Tag[];
  // 前置内容（YAML frontmatter）
  frontmatter: Record<string, any> | null;
  // 嵌入块列表
  embeds: LinkCache[];
  // 链接列表
  links: LinkCache[];
  // 标题
  headings: HeadingCache[];
  // 列表项
  listItems: ListItemCache[];
}

interface LinkCache {
  link: string;        // 链接文本
  original: string;    // 原始文本
  position: {
    start: { line: number; col: number; offset: number };
    end: { line: number; col: number; offset: number };
  };
}
```

### 3.2 常用方法

```typescript
// 获取文件元数据
const metadata = app.metadataCache.getFileCache(file);

// 获取所有包含标签的文件
const filesWithTag = app.metadataCache.getFilesWithTag('tagname');

// 解析链接
const resolved = app.metadataCache.getFirstLinkpathDest('link', file);

// 监听文件变化
app.metadataCache.on('changed', (file, data, cache) => {
  console.log('File changed:', file.path);
});
```

---

## 4. View API

### 4.1 创建自定义视图

```typescript
// 视图类型注册
export default class MyView extends View {
  // 视图唯一标识
  static type = 'my-view';

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  // 显示图标
  getIcon(): string {
    return 'document';
  }

  // 视图标题
  getDisplayText(): string {
    return 'My View';
  }

  // 渲染内容
  async onOpen(): Promise<void> {
    this.containerEl.empty();
    this.containerEl.createEl('div', { text: 'Hello World' });
  }

  // 清理
  async onClose(): Promise<void> {
    // 清理资源
  }
}

// 注册视图
app.workspace.registerView('my-view', (leaf) => new MyView(leaf));

// 添加侧边栏按钮
app.workspace.onload(() => {
  app.workspace.leftRibbon.addItem({
    icon: 'document',
    title: 'My View',
    action: () => {
      app.workspace.getLeaf('tab').openFile(file);
    }
  });
});
```

---

## 5. Setting Tab API

### 5.1 创建设置页

```typescript
import { PluginSettingTab, Setting } from 'obsidian';

export default class MySettingsTab extends PluginSettingTab {
  constructor(app: App, plugin: MyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    this.containerEl.empty();
    this.containerEl.createEl('h2', { text: 'My Plugin Settings' });

    // 添加设置项
    new Setting(this.containerEl)
      .setName('Setting Name')
      .setDesc('Setting Description')
      .addText(text => text
        .setValue(this.plugin.settings.settingValue)
        .onChange(async (value) => {
          this.plugin.settings.settingValue = value;
          await this.plugin.saveSettings();
        }));
  }
}
```

### 5.2 常用 Setting 组件

| 组件 | 方法 | 说明 |
|------|------|------|
| Text | `addText(cb)` | 文本输入框 |
| Toggle | `addToggle(cb)` | 开关 |
| Slider | `addSlider(cb)` | 滑块 |
| Dropdown | `addDropdown(cb)` | 下拉菜单 |
| Button | `addButton(cb)` | 按钮 |
| TextArea | `addTextArea(cb)` | 多行文本 |
| Search | `addSearch(cb)` | 搜索框 |

---

## 6. Event API

### 6.1 注册事件

```typescript
// 在 onload() 中注册
this.registerEvent(app.vault.on('modify', (file) => {
  console.log('File modified:', file.path);
}));

this.registerEvent(app.metadataCache.on('changed', (file, data, cache) => {
  console.log('Cache changed:', file.path);
}));

this.registerEvent(app.workspace.on('active-leaf-change', (leaf) => {
  console.log('Active leaf changed');
}));
```

### 6.2 常用事件

| 事件源 | 事件名 | 回调参数 | 说明 |
|--------|--------|----------|------|
| vault | create | (file) | 文件创建 |
| vault | modify | (file) | 文件修改 |
| vault | delete | (file) | 文件删除 |
| vault | rename | (file, oldPath) | 文件重命名 |
| metadataCache | changed | (file, data, cache) | 缓存更新 |
| workspace | active-leaf-change | (leaf) | 活动叶变化 |
| workspace | file-open | (file) | 文件打开 |

---

## 7. Plugin API

### 7.1 插件基类

```typescript
import { Plugin } from 'obsidian';

export default class MyPlugin extends Plugin {
  // 插件加载时调用
  async onload(): Promise<void> {
    console.log('Plugin loaded');

    // 注册视图
    this.registerView('my-view', (leaf) => new MyView(leaf));

    // 注册事件
    this.registerEvent(...);

    // 注册命令
    this.addCommand({
      id: 'my-command',
      name: 'My Command',
      checkCallback: (checking) => {
        if (checking) return true;
        // 执行命令
      }
    });
  }

  // 插件卸载时调用
  async onunload(): Promise<void> {
    console.log('Plugin unloaded');
    // 清理资源
  }

  // 保存设置
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  // 加载设置
  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
}
```

---

## 8. Command API

### 8.1 添加命令

```typescript
this.addCommand({
  id: 'my-command',
  name: 'My Command',
  // 快捷键（可选）
  hotkeys: [{ modifiers: ['Mod', 'Shift'], key: 'p' }],
  // 条件检查
  checkCallback: (checking: boolean) => {
    if (checking) {
      return app.workspace.activeLeaf?.view.getState().mode === 'preview';
    }
    // 执行
    new Notice('Command executed!');
  }
});
```

### 8.2 Callback 类型

| 类型 | 说明 |
|------|------|
| `checkCallback` | 带条件检查的命令回调 |
| `regularCallback` | 普通命令回调 |
| `editorCallback` | 编辑器命令回调（需选中内容） |

---

## 9. Notice 和 Dialog

```typescript
// 显示通知
new Notice('Operation completed!', 3000);

// 确认对话框
new ConfirmDialog({
  title: 'Confirm Action',
  content: 'Are you sure?',
  onConfirm: () => {
    console.log('Confirmed');
  }
});
```

---

## 10. 常用类型

```typescript
// App 实例
interface App {
  vault: Vault;
  workspace: Workspace;
  metadataCache: MetadataCache;
  plugins: PluginManager;
  settings: Settings;
}

// 文件
interface TFile {
  path: string;
  name: string;
  extension: string;
  stat: { ctime: number; mtime: number; size: number };
}

// 视图
interface View {
  containerEl: HTMLElement;
  icon: string;
  title: string;
}
```

---

## 11. 资源清理

```typescript
// ✅ 正确：使用 register* 方法自动清理
this.registerEvent(app.vault.on('modify', callback));
this.registerInterval(window.setInterval(callback, 1000));
this.registerDomEvent(element, 'click', callback);

// ❌ 错误：手动管理清理
const handler = () => {};
app.vault.on('modify', handler);
window.setInterval(handler, 1000);
// 必须在 onunload 中手动清理
```
