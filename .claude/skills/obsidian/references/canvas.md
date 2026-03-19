# JSON Canvas

`.canvas` 文件是 JSON，不是 Markdown。编辑时先读现有 JSON，再增量修改，避免破坏节点引用。

## 基本结构

```json
{
  "nodes": [],
  "edges": []
}
```

## 节点最小字段

```json
{
  "id": "6f0ad84f44ce9c17",
  "type": "text",
  "x": 0,
  "y": 0,
  "width": 360,
  "height": 180,
  "text": "# Title\n\nBody"
}
```

- `id`：16 位小写十六进制字符串
- `type`：常见为 `text`、`file`、`link`、`group`
- `x/y/width/height`：像素定位

## 边最小字段

```json
{
  "id": "0123456789abcdef",
  "fromNode": "6f0ad84f44ce9c17",
  "toNode": "a1b2c3d4e5f67890",
  "toEnd": "arrow"
}
```

## 校验清单

- `nodes` 和 `edges` 的全部 `id` 都唯一
- 每条边的 `fromNode` / `toNode` 都能在 `nodes` 里找到
- JSON 可解析
- 文本节点里的换行必须是 `\n`，不要写成字面量 `\\n`

## 默认布局

- 节点之间至少留 50-100px 间距
- 组节点内部保留 20-50px 边距
- 尽量对齐到 10 或 20 的网格倍数
