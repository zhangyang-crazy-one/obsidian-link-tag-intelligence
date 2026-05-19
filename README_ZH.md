# Link & Tag Intelligence（链接与标签智能）

为 Obsidian 笔记库提供原生双语链接管理、标签系统及研究笔记工作流。

插件采用 CLI 优先的文献摄入模型：

- 插件负责展示、触发、预览、标签和关系管理
- 外部 Shell JSON CLI 处理 DOI、arXiv 和 PDF 摄入
- Zotero 作为可选组件，适合已有 Zotero 工作流的用户

## 功能特性

- 预览驱动的链接插入
- 块引用和行引用插入
- 侧边栏：当前笔记、出链、回链、精确引用、关系、标签、未链接提及、摄入状态、语义桥状态
- 类型化研究关系，适合文献综述与写作
- 引用感知的元数据标签（citekey、作者、年份、来源类型、定位符、证据类型）
- 原生标签管理与双语标签建议
- 外部摄入 CLI，支持 DOI、arXiv 和 PDF，集成 OpenAlex 引用增强
- 可选的外部语义桥检索

## 语音识别

基于 [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) 的 Zipformer 流式 transducer 模型，实现本地实时中文语音转文字。所有处理均在本地完成，音频数据不会离开设备。

- **快捷键：** `Ctrl+Shift+V` 开始/停止录音
- **侧边栏按钮：** 点击插件工具栏的语音按钮
- **实时转写：** 说话时文字即时出现在光标位置
- **离线可用：** 无需网络连接
- **热词增强：** 通过 `models/hotwords.txt` 提升领域术语识别准确率

### 模型归属

本插件集成以下开源模型：

> **sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30**  
> 由 [k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) 以 Apache 2.0 协议发布  
> 基于 [WenetSpeech](https://wenetspeech.github.io/) 和 multi-zh-hans 数据集训练  
> 由 [icefall](https://github.com/k2-fsa/icefall) 配方转换

感谢 k2-fsa 团队在开源语音处理领域的卓越工作。

## 插件工作流

启用插件后，通过侧边栏功能区或命令面板打开 `Link & Tag Intelligence` 侧边栏。

主要操作：

- `摄入研究文献`
- `预览插入链接`
- `插入块引用`
- `插入行引用`
- `快速链接选中文本`
- `为当前笔记添加关系`
- `管理笔记库标签`
- `为当前笔记推荐标签`
- `外部命令语义搜索`
- **`语音`** — 本地实时中文语音转文字

推荐研究流程：

1. 通过插件运行摄入 CLI，从 DOI、arXiv ID 或 PDF 创建文献笔记。
2. 使用 `PDF++` 打开源 PDF 进行页面级证据提取。
3. 使用本插件添加精确引用、类型化关系和受控标签。
4. 仅在需要从自有外部搜索工具链检索时使用语义桥。

## 摄入 CLI

项目仓库包含本地 CLI：`cli/lti-research.mjs`。

支持五个顶级命令和一个引用工具族：

- `search`：查询 arXiv 并返回候选论文
- `resolve`：仅获取元数据
- `ingest`：创建文献笔记及可选的附件副本
- `paper`：构建主题笔记、分析笔记、矩阵、图谱、大纲和草稿
- `inspect`：检查笔记库中已创建的笔记
- `ref inspect` / `ref locate` / `ref format`：检查精确行范围、从片段定位行或段落、为自动化工具生成行引用或块引用

当文献有 DOI 时，CLI 通过 OpenAlex 进行增强，包括：

- `openalex_id`
- `cited_by_count`
- `referenced_works`
- `related_works`
- `concepts`
- `counts_by_year`
- `publication_date`
- `source_display_name`

查看帮助：

```bash
node cli/lti-research.mjs --help
```

### 文献来源输入

可以以下列任一形式选择文献来源：

```bash
--source-type doi --source 10.1145/...
--source-type arxiv --source 2403.01234
--source-type pdf --source /path/to/paper.pdf
```

或使用便捷标志：

```bash
--doi 10.1145/...
--arxiv 2403.01234
--pdf /path/to/paper.pdf
```

### 使用示例

**Resolve（解析元数据）：**

```bash
node cli/lti-research.mjs resolve --doi 10.1145/123456.7890
node cli/lti-research.mjs resolve --arxiv 2403.01234
node cli/lti-research.mjs resolve --pdf ./papers/coffee.pdf --metadata-doi 10.1145/123456.7890
```

**Search（搜索）：**

```bash
node cli/lti-research.mjs search \
  --query "数据治理 数字化转型" \
  --max-results 10
```

**Ingest（摄入）：**

```bash
node cli/lti-research.mjs ingest \
  --doi 10.1145/123456.7890 \
  --vault /path/to/vault

node cli/lti-research.mjs ingest \
  --arxiv 2403.01234 \
  --vault /path/to/vault \
  --literature-folder Knowledge/Research/Literature \
  --attachments-folder Knowledge/Research/Attachments
```

**Paper（论文工作区）：**

```bash
node cli/lti-research.mjs paper \
  --topic "数据治理和数智转型" \
  --vault /path/to/vault \
  --sources "arxiv:1706.03762,arxiv:2403.01234" \
  --max-sources 3
```

生成的笔记包括：主题笔记、逐篇分析笔记、比较矩阵、文献图谱、大纲和草稿。

## 插件命令配置

在插件设置中将 `摄入命令` 设置为调用 CLI 的 Shell 命令，CLI 返回 JSON 到 stdout。

支持的摄入占位符：`{{source_type}}`、`{{source}}`、`{{vault}}`、`{{file}}`、`{{selection}}`、`{{literature}}`、`{{attachments}}`、`{{template}}`、`{{metadata_doi}}`、`{{metadata_arxiv}}`、`{{title}}`、`{{authors}}`、`{{year}}`、`{{download_pdf}}`。每个占位符在执行前经过 Shell 转义。

## 自动化工具使用

本设计适配 Codex、Claude Code 或任何支持 Shell 的编程助手。

契约简单明了：
- 通过 Shell 标志输入
- stdout 输出 JSON
- 验证错误以非零退出码返回 JSON
- 非预期运行时错误输出到 stderr
- 失败时返回非零退出码

摄入路径不需要 MCP 层。

## 输出格式

典型 `ingest` 输出：

```json
{
  "status": "created",
  "source_type": "doi",
  "source_id": "10.1145/123456.7890",
  "title": "Coffee Extraction Dynamics",
  "note_path": "Knowledge/Research/Literature/doi-10-1145-123456-7890.md",
  "attachment_paths": ["Knowledge/Research/Attachments/doi-10-1145-123456-7890.pdf"],
  "warnings": [],
  "metadata": {
    "entry_type": "journal-article",
    "citekey": "smith2024coffee",
    "openalex_id": "https://openalex.org/W1234567890",
    "cited_by_count": 12,
    "concepts": ["Data governance", "Digital transformation"]
  }
}
```

## 文献笔记 Frontmatter

生成的笔记包含以下字段：`title`、`authors`、`year`、`source_id`、`source_type`、`entry_type`、`citekey`、`openalex_id`、`cited_by_count`、`referenced_works`、`related_works`、`concepts`、`counts_by_year`、`publication_date`、`source_display_name`、`doi`、`arxiv_id`、`pdf`、`pdf_url`、`source_url`、`tags`。

## 配套工具

推荐工具栈：

- **PDF++**：页面级阅读和证据提取
- **Smart Connections**：基于嵌入向量的笔记库本地语义召回
- **外部语义桥 CLI**：需要引用感知检索结果时使用
- **Zotero Integration + Better BibTeX**：可选，适合已有 Zotero 工作流的用户

## 语义桥

语义桥与摄入分离——摄入创建或检查文献笔记，语义桥从外部工具检索候选笔记。

支持的语义占位符：`{{query}}`、`{{vault}}`、`{{file}}`、`{{selection}}`。

## 构建

```bash
npm install --package-lock=false
npm run build
npm test
```

## 手动安装

将以下文件复制到 `<笔记库>/.obsidian/plugins/link-tag-intelligence/`：

- `manifest.json`
- `main.js`
- `styles.css`
