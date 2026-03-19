# Obsidian Markdown

普通 Markdown 默认已知；这里只强调 Obsidian 特有语法和写法。

## Frontmatter

```yaml
---
title: Project Alpha
tags:
  - project
  - active
aliases:
  - Alpha
cssclasses:
  - dashboard
status: in-progress
---
```

- 优先把稳定元信息放 frontmatter，不要把结构化状态散落在正文里。
- 常用字段：`tags`、`aliases`、`cssclasses`、日期、自定义状态。

## Wikilinks

```markdown
[[Note Name]]
[[Note Name|Display Text]]
[[Note Name#Heading]]
[[#Heading in same note]]
```

- Vault 内部引用优先用 wikilink，不用外链格式。

## Embeds

```markdown
![[Other Note]]
![[Architecture.png|600]]
![[document.pdf#page=3]]
```

## Callouts

```markdown
> [!note]
> Basic callout.

> [!warning] Risk
> Check this before rollout.

> [!faq]- Folded
> Hidden until expanded.
```

常用类型：`note`、`info`、`tip`、`warning`、`danger`、`bug`、`example`、`quote`。

## 其他高频语法

```markdown
==highlight==
%% hidden comment %%

Inline math: $e^{i\pi}+1=0$
```

````markdown
```mermaid
graph TD
  A --> B
```
````

## 写作默认

- 新建知识笔记优先有标题和 frontmatter。
- 需要可重命名联动的内部关系时，优先 `[[wikilink]]`。
- 图像、PDF、音频等嵌入优先 `![[...]]`。
- 如果内容来自外部导入，frontmatter 里保留来源字段比把来源混在正文更稳。
