# Obsidian Link Tag Intelligence 项目配置

> **项目定位**: Obsidian 笔记软件插件，提供链接管理和标签智能功能
> **核心约束**: TypeScript + Vitest + esbuild + CodeMirror 6

---

## 项目结构

```
obsidian-link-tag-intelligence/
├── src/                    # 源代码
│   ├── main.ts            # 插件主入口
│   ├── settings.ts        # 设置管理
│   ├── editor-extension.ts # CodeMirror 6 扩展
│   ├── tags.ts           # 标签处理
│   ├── references.ts      # 链接管理
│   └── view.ts           # 侧边栏视图
├── tests/                  # Vitest 测试
├── .claude/               # Claude Code 配置
│   ├── settings.json      # Hooks 和 permissions
│   ├── rules/             # 规则文件
│   └── agents/            # Agent 配置
└── package.json
```

---

## 核心命令

| 命令 | 描述 |
|------|------|
| `npm test` | 运行测试 (vitest) |
| `npm run build` | 构建插件 (esbuild) |
| `npm run dev` | 监视模式开发 |

---

## 技术栈

- **语言**: TypeScript (strict mode)
- **测试**: Vitest
- **构建**: esbuild
- **框架**: Obsidian API
- **编辑器**: CodeMirror 6

---

## TypeScript 规范

### 文件操作（必须优先使用 Vault.process()）

```typescript
// ✅ 正确
await Vault.process(file, (content) => {
  return content.replace(oldText, newText);
});

// ❌ 错误：可能导致数据丢失
const content = await Vault.read(file);
await Vault.modify(file, newContent);
```

### MetadataCache 使用

```typescript
const cache = app.metadataCache.getCache(filePath);
app.metadataCache.on('changed', (file) => { /* */ });
```

---

## 插件生命周期

### 必须使用的注册方法

| 方法 | 用途 |
|------|------|
| `registerEvent()` | 事件监听（自动清理） |
| `registerInterval()` | 定时器（自动清理） |
| `registerDomEvent()` | DOM 事件（自动清理） |
| `registerEditorExtension()` | CodeMirror 扩展 |

### onload/onunload

```typescript
async onload() {
  this.registerView(VIEW_TYPE, (leaf) => new MyView(leaf, this));
  this.registerEvent(this.app.metadataCache.on('changed', this.onFileChange));
}

onunload() {
  this.view?.unload();
}
```

---

## Hot Reload 工作流

1. 安装 `pjeby/hot-reload` 插件到开发 Vault
2. 确保插件目录包含 `.git` 文件夹或 `.hotreload` 文件
3. 运行 `npm run dev` 启动监视模式
4. Claude Code 编辑 → 自动编译 → 自动重载

**重要**：良好的 `onunload()` 资源清理至关重要。

---

## 发布规范

1. 更新 `manifest.json` 版本号（语义化版本 `x.y.z`）
2. 更新 `versions.json`
3. GitHub Release Tag 必须与 manifest.json 一致（**无 `v` 前缀**）
4. 上传：`main.js`、`manifest.json`、`styles.css`

---

## 提交规范

格式: `type(scope): description`

| 类型 | 描述 |
|------|------|
| feat | 新功能 |
| fix | 修复 bug |
| docs | 文档更新 |
| refactor | 重构 |
| test | 测试相关 |
| chore | 构建/工具 |

---

## 注意事项

1. 修改 `src/main.ts` 后需要重新构建
2. 插件 ID 为 `link-tag-intelligence`
3. 使用 `getContextNoteFile()` 获取当前笔记文件
4. 国际化使用 `i18n.ts` 中的 `tr()` 函数
5. **必须遵循 Obsidian 开发者政策**（禁止混淆代码、未经批准的网络使用、客户端遥测等）
