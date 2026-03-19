# Web Ingest

网页内容进入 Obsidian 时，先提纯成 Markdown，再决定保存路径、frontmatter 和内部链接。

## 首选工具

```bash
which defuddle
defuddle parse <url> --md
```

如未安装：

```bash
npm install -g defuddle
```

## 标准流程

1. 用 `defuddle parse <url> --md` 提取正文
2. 检查标题、分节和代码块是否完整
3. 为目标笔记补 frontmatter，例如：

```yaml
---
source_url: https://example.com/page
ingested_via: defuddle
ingested_at: 2026-03-12T00:00:00Z
tags:
  - inbox/imported
---
```

4. 存入 vault 合适路径，例如 `Inbox/Imported/Web/`
5. 如有需要，再补 `[[related notes]]`

## 何时不要直接入库

- 页面主要是导航、登录态或 SPA 壳内容
- 用户实际上要的是“查资料”，不是“存进 Obsidian”
- 提纯结果丢失关键表格或代码块，此时先人工检查再落库

## 回退策略

- `defuddle` 不可用时，先说明缺失，再决定是否改用其他抓取方式
- 不要把整页 HTML 直接写入 Markdown 笔记
