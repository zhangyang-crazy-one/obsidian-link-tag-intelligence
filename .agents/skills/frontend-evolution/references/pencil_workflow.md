# Pencil 设计工作流

## 目录

- 核心工具
- 布局系统
- 节点类型
- 组件复用
- 设计工作流
- 最佳实践
- 关键教训：框架位置
- 关键教训：多组件布局防重叠
- 关键教训：Modal 标题和关闭按钮居中

## 核心工具

### 1. 编辑器状态

```javascript
get_editor_state()
```
获取当前打开的 `.pen` 文件信息和顶级节点列表。

**返回**：
- `filePath`: 当前文件路径
- `nodes`: 顶级节点列表（可复用组件和页面帧）
- `selectedNodeIds`: 当前选中的节点

### 2. 批量获取节点

```javascript
batch_get({
  filePath: "path/to/design.pen",
  nodeIds: ["node-id-1", "node-id-2"],
  readDepth: 3,  // 递归深度
  resolveInstances: true  // 展开组件实例
})
```

### 3. 批量设计操作

```javascript
batch_design({
  filePath: "path/to/design.pen",
  operations: [
    // Insert - 插入新节点
    "nodeId=I(parentId, {type: 'frame', name: 'Component'})",

    // Copy - 复制节点
    "newId=C(existingId, parentId, {})",

    // Update - 更新属性
    "U(nodeId, {fill: '#1a1a2e'})",

    // Replace - 替换节点
    "newId=R(oldNodeId, {type: 'frame', ...})",

    // Delete - 删除节点
    "D(nodeId)",

    // Move - 移动节点
    "M(nodeId, newParentId, index)"
  ]
})
```

### 4. 截图验证

```javascript
get_screenshot({
  filePath: "path/to/design.pen",
  nodeId: "target-node-id"
})
```

## 布局系统

### Flexbox 布局

```javascript
// 水平布局
layout: "horizontal"

// 垂直布局
layout: "vertical"

// 无布局（绝对定位）
layout: "none"
```

### 尺寸属性

```javascript
// 填充父容器
width: "fill_container"
height: "fill_container"

// 适应内容
width: "fit_content"
height: "fit_content"

// 固定尺寸
width: 240
height: 56
```

### 内边距

```javascript
// 统一内边距
padding: 16

// 水平 + 垂直
padding: [horizontal, vertical]

// 上右下左
padding: [top, right, bottom, left]
```

### 间距

```javascript
// 子元素间距
gap: 16
```

### 对齐

```javascript
// 主轴对齐
justifyContent: "start" | "center" | "end" | "space_between" | "space_around"

// 交叉轴对齐
alignItems: "start" | "center" | "end"
```

## 节点类型

### Frame (帧)

```javascript
{
  type: "frame",
  name: "MyComponent",  // 用于识别的名称
  fill: "#1a1a2e",
  width: 400,
  height: 300,
  layout: "vertical",
  gap: 16,
  padding: 24,
  cornerRadius: 12
}
```

### Rectangle (矩形)

```javascript
{
  type: "rectangle",
  fill: "#238636",
  width: 120,
  height: 44,
  cornerRadius: 8
}
```

### Text (文本)

```javascript
{
  type: "text",
  content: "Hello World",
  fill: "#c9d1d9",
  fontFamily: "Space Mono",
  fontSize: 14,
  fontWeight: "bold"
}
```

### Icon Font (图标)

```javascript
{
  type: "icon_font",
  iconFontFamily: "lucide",
  iconFontName: "settings",
  width: 24,
  height: 24,
  fill: "#c9d1d9"
}
```

### Ref (组件引用)

```javascript
{
  type: "ref",
  ref: "ButtonComponent",  // 组件 ID
  width: 120,
  height: 44
}
```

## 组件复用

### 创建可复用组件

```javascript
// 在 document 级别创建组件
button = I(document, {
  type: "frame",
  reusable: true,
  id: "Button",  // 组件 ID
  name: "Button Component"
})

// 添加子元素
I(button, {type: "rectangle", fill: "#238636"})
I(button, {type: "text", content: "Click"})
```

### 使用组件

```javascript
// 在页面中引用组件
btn = I(parentId, {type: "ref", ref: "Button"})

// 覆盖属性
U(btn + "/textId", {content: "Submit"})
```

## 设计工作流

### 新建页面

1. 打开/创建文件：
```javascript
open_document("new")
// 或
open_document("/path/to/design.pen")
```

2. 创建页面帧：
```javascript
page = I(document, {
  type: "frame",
  name: "Main Page",
  fill: "#0d1117",
  width: 1440,
  height: 900
})
```

3. 添加布局结构：
```javascript
I(page, {type: "frame", name: "Header", height: 64})
I(page, {type: "frame", name: "Content", layout: "vertical"})
I(page, {type: "frame", name: "Footer", height: 48})
```

### 迭代设计

1. 修改现有节点：
```javascript
U(nodeId, {fill: "#1a1a2e"})
```

2. 添加新组件：
```javascript
I(parentId, {type: "frame", name: "New Component"})
```

3. 截图验证：
```javascript
get_screenshot({filePath, nodeId: pageId})
```

### 设计系统

1. 创建基础组件：
```javascript
// Button
button = I(document, {
  type: "frame",
  reusable: true,
  id: "Button"
})

// Input
input = I(document, {
  type: "frame",
  reusable: true,
  id: "Input"
})
```

2. 在页面中使用：
```javascript
primaryBtn = I(container, {type: "ref", ref: "Button"})
secondaryBtn = I(container, {type: "ref", ref: "Button"})
```

## 最佳实践

1. **命名规范**：
   - 使用有意义的名称：`"LoginForm"` 而不是 `"frame_1"`
   - 组件名称用 PascalCase

2. **布局优先**：
   - 优先使用 flexbox 布局
   - 避免过度使用绝对定位

3. **设计令牌**：
   - 颜色、字体等使用变量
   - 通过 `get_variables()` 和 `set_variables()` 管理

4. **组件化**：
   - 重复元素创建为可复用组件
   - 减少硬编码

5. **截图验证**：
   - 每次重要修改后截图确认
   - 确保视觉效果符合预期

## ⚠️ 关键教训：框架位置

**问题**：新建的帧(frame)默认都堆叠在画布坐标 (0,0)，会相互遮挡看不见内容。

**错误示例**：
```javascript
// 创建了3个frame但都在(0,0)，互相遮挡
frame1 = I(document, {type: "frame", name: "Screen1"})
frame2 = I(document, {type: "frame", name: "Screen2"})
frame3 = I(document, {type: "frame", name: "Screen3"})
```

**正确做法**：创建后立即设置 x,y 坐标，将多个 frame 水平或垂直分布：

```javascript
frame1 = I(document, {type: "frame", name: "Screen1"})
frame2 = I(document, {type: "frame", name: "Screen2"})
frame3 = I(document, {type: "frame", name: "Screen3"})

// 设置位置：水平排列
U("frame1-id", {x: 0, y: 0})
U("frame2-id", {x: 400, y: 0})
U("frame3-id", {x: 800, y: 0})

// 或垂直排列
U("frame1-id", {x: 0, y: 0})
U("frame2-id", {x: 0, y: 500})
U("frame3-id", {x: 0, y: 1000})
```

**经验法则**：每次创建多个 frame 后，立即使用 `snapshot_layout` 检查布局或 `get_screenshot` 验证可见性。

## ⚠️ 关键教训：多组件布局防重叠

**问题**：创建多个组件时，手动设置位置容易重叠，导致组件相互遮挡。

**正确做法**：使用 Python 脚本计算所有组件的 (x, y) 位置，确保不重叠：

```python
# 计算无重叠的组件位置
gap = 20  # 组件间距

components = []

# Row 1: 两个组件并排
row_y = 0
components.append({"name": "Component1", "width": 320, "height": 600, "x": 0, "y": row_y})
components.append({"name": "Component2", "width": 520, "height": 600, "x": 320 + gap, "y": row_y})

# Row 2: 放在 Row 1 下方，y = Row1最高点 + gap
row_y = max(c["y"] + c["height"] for c in components if c["y"] == 0) + gap
components.append({"name": "Component3", "width": 480, "height": 320, "x": 0, "y": row_y})
components.append({"name": "Component4", "width": 500, "height": 450, "x": 480 + gap, "y": row_y})

# 依次类推，每行取上一行的最大高度
```

**关键规则**：
- 同一行并排的组件，y 坐标相同
- 下一行的 y = 上一行最高组件的 (y + height) + gap
- 使用 Python 脚本批量计算后，用 `U()` 更新位置

## ⚠️ 关键教训：Modal 标题和关闭按钮居中

**问题**：Modal 的标题文字和关闭按钮没有垂直居中，看起来歪的。

**错误做法**：
```javascript
// 标题直接放 header 里，不居中
modalTitle = I(modalHeader, {type: "text", content: "Title"})
modalClose = I(modalHeader, {type: "text", content: "×"})
```

**正确做法**：使用 flexbox 布局居中标题和关闭按钮：

```javascript
// Header 容器使用 flexbox 布局
modalHeader = I(modal, {type: "frame", layout: "horizontal", justifyContent: "space_between", alignItems: "center"})

// 左侧放标题（用 frame 包裹实现垂直居中）
titleWrapper = I(modalHeader, {type: "frame", layout: "vertical", justifyContent: "center"})
modalTitle = I(titleWrapper, {type: "text", content: "Title", fontSize: 16, fontWeight: "bold"})

// 右侧放关闭按钮（用 frame 包裹实现垂直居中）
closeWrapper = I(modalHeader, {type: "frame", layout: "vertical", justifyContent: "center"})
modalClose = I(closeWrapper, {type: "text", content: "×", fontSize: 20})
```

**要点**：
- 标题和关闭按钮都需要用 `frame` 包裹
- 外层 frame 使用 `layout: "vertical"` + `justifyContent: "center"` 实现垂直居中
- 标题用 `fontSize: 16, fontWeight: "bold"`
- 关闭按钮用 `fontSize: 20`，颜色用次要色 `#8b949e`

**验证方法**：创建后立即 `get_screenshot` 查看是否居中
