# Obsidian Link Tag Intelligence 项目配置

> **项目定位**: Obsidian 笔记软件插件，提供链接管理和标签智能功能

---

## 项目结构

```
obsidian-link-tag-intelligence/
├── src/                    # 源代码
│   ├── main.ts            # 插件主入口
│   ├── settings.ts        # 设置管理
│   ├── modals/            # 模态框
│   ├── notes.ts           # 笔记操作
│   └── ...
├── tests/                  # 测试文件
├── .claude/               # Claude Code 配置
│   ├── settings.json      # Claude Code 设置
│   └── hooks/             # Hook 脚本
└── package.json
```

---

## 核心命令

| 命令 | 描述 |
|------|------|
| `npm test` | 运行测试 (vitest) |
| `npm run build` | 构建插件 (esbuild) |
| `npm run lint` | 代码检查 |

---

## 技术栈

- **语言**: TypeScript
- **测试**: Vitest
- **构建**: esbuild
- **框架**: Obsidian API
- **编辑器**: CodeMirror 6

---

## 代码风格

1. **TypeScript 规范**
   - 使用 `type` 而非 `interface` 作为别名
   - 优先使用 `const` 和 `let`
   - 严格空值检查

2. **Obsidian 插件规范**
   - 遵循官方插件结构
   - 使用 `onload()`/`onunload()` 生命周期
   - 通过 `this.app` 访问 Obsidian API

3. **命名规范**
   - 类名: PascalCase
   - 函数/变量: camelCase
   - 常量: UPPER_SNAKE_CASE

---

## 提交规范

格式: `type(scope): description`

| 类型 | 描述 |
|------|------|
| feat | 新功能 |
| fix | 修复 bug |
| docs | 文档更新 |
| style | 代码格式（不影响功能）|
| refactor | 重构 |
| test | 测试相关 |
| chore | 构建/工具 |

---

## 注意事项

1. 修改 `src/main.ts` 后需要重新构建
2. 插件 ID 为 `link-tag-intelligence`
3. 使用 `getContextNoteFile()` 获取当前笔记文件
4. 国际化使用 `i18n.ts` 中的 `tr()` 函数
