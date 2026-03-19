# Import Bridges

外部知识迁移固定复用 `tools/obsidian_bridge/`。不要为了单次任务在仓库里再造一个新导入器。

## Trilium HTML -> Obsidian

脚本：

```bash
python3 tools/obsidian_bridge/trilium_to_obsidian.py \
  --source "/absolute/path/to/trilium-export" \
  --vault "/absolute/path/to/ObsidianVault"
```

### 常用参数

- `--folder`：目标 vault 内子目录，默认 `Inbox/Imported/Trilium`
- `--mode convert|preserve|both`
- `--keep-html`：保留 HTML 备份

### 默认行为

- 读取 Trilium HTML 导出根目录里的 `root/`
- 把 HTML 页面转成 Markdown
- 复制图片、PDF 等资源
- 生成 `_trilium_import.md` 作为导入索引

## NotebookLM -> Obsidian

脚本：

```bash
python3 tools/obsidian_bridge/notebooklm_to_obsidian.py \
  --notebook-id <uuid> \
  --vault "/absolute/path/to/ObsidianVault"
```

### 常用参数

- `--all-notebooks`
- `--folder`：默认 `Inbox/Imported/NotebookLM`
- `--artifact-types report,slide_deck,data_table,quiz,flashcards,infographic,audio,video`
- `--note-id`
- `--artifact-id`
- `--skip-notes`
- `--limit-notes`

### 默认行为

- 复用本仓库 `tools/notebooklm-mcp-cli/nlm-local.sh`
- 导出笔记到 `notes/`
- 导出 studio 产物到 `artifacts/`
- 生成 `_index.md`

## 导入后检查

- 目标目录存在
- 索引笔记已生成
- frontmatter 包含来源元信息
- 链接和附件路径没有断裂

## 参考

- `tools/obsidian_bridge/README.md`
- `tools/obsidian_bridge/tests/test_obsidian_bridge.py`
