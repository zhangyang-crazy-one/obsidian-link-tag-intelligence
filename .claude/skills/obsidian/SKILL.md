---
name: obsidian
version: 1.0.0
description: Obsidian vault 工作流：笔记读写、wikilinks、callouts、canvas/base 文件、Trilium/NotebookLM 导入。
trigger: obsidian vault wikilink callout canvas base 笔记

# Obsidian

把官方 `obsidian-skills` 的核心能力和本仓库的 `tools/obsidian_bridge` 合并成一个技能入口。默认先判定任务类型，再选择合适的执行路径，而不是把所有任务都塞给同一个命令。

## 何时使用

- 用户要在 Obsidian vault 里搜索、读取、创建、追加、移动、重命名或批量整理笔记。
- 用户要使用官方 `obsidian` CLI，或明确提到 `obsidian-cli`、plugin reload、截图、DOM 检查、theme/plugin 开发。
- 用户要写符合 Obsidian 语法的 Markdown，包括 wikilinks、embeds、callouts、properties、Mermaid、Math。
- 用户要编辑 `.canvas` 或 `.base` 文件。
- 用户要把 Trilium HTML 导出、NotebookLM 内容或网页正文迁移到 Obsidian。

## 默认分流

1. 先确认目标 vault。
   - 用户已给 vault 路径时，直接使用。
   - 未给路径时，若 `obsidian` CLI 可用，优先按 CLI 当前 vault / 显式 `vault="<name>"` 工作。
   - 如果既没有 vault 路径，也没有可用 CLI，不要猜测 vault。
2. 再判断任务家族。
   - Vault 搜索、创建、追加、重命名、属性修改、插件调试：看 [references/cli.md](references/cli.md)
   - `.md` / wikilinks / callouts / embeds / frontmatter：看 [references/markdown.md](references/markdown.md)
   - `.canvas`：看 [references/canvas.md](references/canvas.md)
   - `.base`：看 [references/bases.md](references/bases.md)
   - Trilium / NotebookLM 导入：看 [references/imports.md](references/imports.md)
   - 网页提纯导入：看 [references/web-ingest.md](references/web-ingest.md)

## 硬约束

- 外部知识迁移默认走 `tools/obsidian_bridge/`，不要手写一次性转换脚本冒充工作流。
- `Trilium` 导入必须显式给出 HTML 导出根目录；`NotebookLM` 导入必须显式给出 `--notebook-id` 或 `--all-notebooks`。
- 只有用户明确要求时才改 `.obsidian/` 内部配置；普通笔记工作不要顺手改 workspace、插件 JSON 或缓存文件。
- 只有在官方 `obsidian` CLI 可用且需要它的能力时，才走 CLI；CLI 不可用时，只降级到普通文件编辑，不要伪造 plugin/theme 开发流程。
- `.canvas` 最终必须是可解析 JSON，`.base` 最终必须是可解析 YAML。
- 网页导入先提纯再落库；不要把整页 HTML、导航栏和广告原样塞进笔记正文。

## 标准流程

### 1. 锁定目标 vault

- 先用用户给出的绝对路径。
- 没给路径时，优先检测 `obsidian`。
- 如果只有普通文件编辑需求，也可以直接在 vault 目录下改文件；但涉及重命名联动、属性写入、插件调试时优先 CLI。

### 2. 选择执行路径

- CLI 路径：笔记搜索、创建、追加、属性更新、backlinks、plugin/theme 开发。
- 文件路径：普通 Markdown、Canvas、Base 文件内容编辑。
- Bridge 路径：`tools/obsidian_bridge/trilium_to_obsidian.py`、`tools/obsidian_bridge/notebooklm_to_obsidian.py`
- Web 路径：`defuddle parse <url> --md`

### 3. 运行前校验

- 确认命令是否存在：`which obsidian`、`which obsidian-cli`、`which defuddle`
- 导入类任务先核对源路径 / notebook id / 输出 folder
- 对结构化文件先读现有文件，避免覆盖现存节点、视图或 frontmatter

### 4. 结果验证

- CLI 改动：检查目标笔记确实存在或内容已更新
- Markdown：检查 links、callouts、frontmatter 语法
- Canvas：检查 node/edge id 唯一、边引用有效
- Base：检查 YAML 解析、filters / formulas / views 引用一致
- 导入：检查输出目录、索引笔记、frontmatter 与资源拷贝是否齐全

## 资源

- 本地 bridge 脚本：
  - `tools/obsidian_bridge/trilium_to_obsidian.py`
  - `tools/obsidian_bridge/notebooklm_to_obsidian.py`
  - `tools/obsidian_bridge/README.md`
- 官方参考来源：
  - `.tmp/obsidian-skills-reference/skills/obsidian-cli/`
  - `.tmp/obsidian-skills-reference/skills/obsidian-markdown/`
  - `.tmp/obsidian-skills-reference/skills/json-canvas/`
  - `.tmp/obsidian-skills-reference/skills/obsidian-bases/`
  - `.tmp/obsidian-skills-reference/skills/defuddle/`

## 不要这样做

- 不要在用户只想写一篇笔记时，强行走 bridge 导入。
- 不要在 CLI 缺失时假装已经验证过插件开发结果。
- 不要把 HTML、PDF、CSV 等资源随意改名到失去可追踪性。
- 不要让导入任务默认写到未知 vault。
