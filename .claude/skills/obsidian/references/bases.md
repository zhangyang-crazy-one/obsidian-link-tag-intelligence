# Obsidian Bases

`.base` 文件是 YAML，用来定义面向笔记集合的筛选、公式和视图。编辑时先保证 YAML 合法，再检查属性与公式引用。

## 最小结构

```yaml
filters:
  and:
    - 'file.hasTag("project")'

formulas:
  days_old: '(now() - file.ctime).days'

views:
  - type: table
    name: "Projects"
    order:
      - file.name
      - status
      - formula.days_old
```

## 关键块

- `filters`：全局或视图级筛选
- `formulas`：衍生字段
- `properties`：展示名或属性配置
- `summaries`：统计聚合
- `views`：`table`、`cards`、`list`、`map`

## 常用表达式

```yaml
filters: 'status == "done"'
filters:
  or:
    - 'file.hasTag("book")'
    - 'file.inFolder("Reading")'

formulas:
  due_in_days: '(date(due_date) - today()).days'
  done_icon: 'if(done, "✅", "⏳")'
```

## 校验清单

- YAML 可解析
- `formula.xxx` 先定义后引用
- `views[].order` 和 `summaries` 里引用的字段真实存在
- 日期差先取 `.days` 等数值字段，再做数值函数处理
