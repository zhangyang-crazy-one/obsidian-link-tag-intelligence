# Obsidian CLI

优先使用官方 `obsidian` CLI；如果环境里只有社区 `obsidian-cli`，先看它的 `--help` 再映射到等价操作。两者都不存在时，只能做普通文件级编辑，不能假装完成插件调试或 URI 驱动命令。

## 先决条件

- Obsidian 桌面端已安装并正在运行
- PATH 中存在 `obsidian`
- 需要显式指定 vault 时，使用 `vault="<name>"`

## 检测

```bash
which obsidian
which obsidian-cli
```

## 官方 `obsidian` 常用命令

```bash
obsidian help
obsidian read file="My Note"
obsidian create name="Inbox/New Note" content="# Hello" silent
obsidian append file="My Note" content="New line"
obsidian search query="search term" limit=10
obsidian property:set name="status" value="done" file="My Note"
obsidian backlinks file="My Note"
obsidian daily:read
obsidian daily:append content="- [ ] Follow up"
```

## 适用场景

- 搜索和读取现有笔记
- 新建或追加普通笔记
- 通过属性命令更新 frontmatter
- 需要让 Obsidian 自己处理活动文件、daily note、backlinks

## 插件 / 主题开发工作流

```bash
obsidian plugin:reload id=my-plugin
obsidian dev:errors
obsidian dev:screenshot path=/tmp/obsidian-plugin-check.png
obsidian dev:console level=error
obsidian eval code="app.vault.getFiles().length"
```

顺序固定为：重载 -> 查错 -> 截图或 DOM 检查 -> 继续修复。

## 什么时候不要走 CLI

- 只是编辑现有 `.md` / `.canvas` / `.base` 文件内容
- CLI 不存在，且任务不依赖运行中应用
- 用户给的是明确文件路径，直接编辑更稳

## 回退策略

- 如果只有 `obsidian-cli`，先运行：

```bash
obsidian-cli --help
```

- 只对 note 搜索、创建、移动等普通操作做等价映射。
- 涉及 plugin/theme 调试时，没有官方 `obsidian` CLI 就直接说明无法本地验收。
