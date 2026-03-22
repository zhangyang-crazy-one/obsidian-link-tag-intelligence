# UI 美化研究：Obsidian 插件文字定位与响应式布局

## 基本信息

- **日期**: 2026-03-21
- **notebook_id**: 6a1ff318-8f61-4df0-bb44-07d29ddb5021
- **research task_id**: 8426af73-65e4-44d5-9871-6495a957cad7
- **imported sources**: 15 个高质量来源（官方文档 + 权威论坛）
- **Round 1 conversation_id**: f067f3ea-a686-4d68-b20a-0bcf819ddb8f
- **Round 2 conversation_id**: f2d85f86-9180-45fc-9145-35ec37348561

## 已导入来源

| Index | 来源 | 类型 |
|-------|------|------|
| 1 | Common Selectors for Custom CSS - Obsidian Forum | 论坛 |
| 5 | Properties - CSS variables - Obsidian Developer Docs | 官方文档 |
| 7 | Sidebar - Obsidian Help | 官方帮助 |
| 8 | Table - CSS variables - Obsidian Developer Docs | 官方文档 |
| 12 | File - CSS variables - Obsidian Developer Docs | 官方文档 |
| 15 | CSS snippets - Obsidian Help | 官方帮助 |
| 33 | Icons - Developer Documentation | 官方文档 |
| 34 | Plugin guidelines - Developer Documentation | 官方文档 |
| 35 | CSS variables - Developer Documentation | 官方文档 |
| 36 | Style guide - Obsidian Help | 官方帮助 |
| 37 | Tag - CSS variables - Obsidian Developer Docs | 官方文档 |
| 43 | Settings - Developer Documentation | 官方文档 |
| 46 | Obsidian Plugins page | 官网 |
| 47 | Mobile-compatible plugins - Obsidian Hub | Hub |
| 49 | Sidebar Keyboard Navigation - Obsidian Forum | 论坛 |

## 核心发现

### 1. CSS 文字定位最佳实践

#### Flexbox 垂直/水平居中

```css
/* 垂直居中 */
display: flex;
align-items: center;

/* 水平居中 */
justify-content: center;

/* 图标+文字两端对齐 */
justify-content: space-between;
```

#### 溢出处理（防止文字溢出容器）

```css
/* 基础：宽度自适应 */
width: 100%;

/* 最大宽度限制（使用 Obsidian 变量） */
max-width: calc((var(--icon-size) + 2 * var(--size-2-3)) * 17);

/* 溢出隐藏 */
overflow: hidden;

/* 文字截断显示省略号 */
white-space: nowrap;
text-overflow: ellipsis;

/* 安全内边距 */
padding: 0 10px;
```

#### Obsidian CSS 变量（推荐使用）

| 变量 | 用途 |
|------|------|
| `--icon-size` | 图标尺寸 |
| `--size-2-3` | 间距单位 |
| `--default-button-size` | 默认按钮尺寸 |
| `--interactive-hover` | 悬停状态色 |
| `--text-normal` | 正常文本色 |
| `--text-muted` | 淡文本色 |
| `--background-secondary` | 次级背景色 |

#### 代码中动态设置 CSS

```typescript
// Element 接口提供的方法
element.setCssStyles({ display: 'flex', alignItems: 'center' });
element.setCssProps({ justifyContent: 'space-between' });
```

### 2. 响应式布局与自适应

#### onResize() 生命周期方法

View 类自带 `onResize()` 方法，当视图尺寸变化时自动调用：

```typescript
class MyView extends ItemView {
  onResize(): void {
    // 重新计算内部元素尺寸
    // 切换 CSS 类名
    // 重新渲染图表逻辑
    super.onResize();
  }
}
```

#### Workspace resize 事件监听

```typescript
// 全局监听工作区尺寸变化
this.registerEvent(
  this.app.workspace.on('resize', () => {
    // 处理响应式调整
  })
);

// 其他相关事件
// 'layout-change' - 布局改变
// 'css-change' - CSS 改变
```

#### Flexbox vs Grid 选择

| 场景 | 推荐 | 原因 |
|------|------|------|
| 单向列表（按钮组、垂直列表） | Flexbox | 符合 Obsidian 原生风格 |
| 按钮行（图标+文字） | Flexbox + `space-between` | 一维分布 |
| 复杂二维结构（Kanban、数据可视化） | CSS Grid | 二维布局能力 |
| **Sidebar 内部布局** | **Flexbox** | Obsidian 原生使用 Flexbox |

### 3. 移动端响应式

Obsidian 在 `<body>` 注入设备类名：

```css
/* 通用移动端 */
body.is-mobile .my-component { }

/* 仅手机 */
body.is-phone .my-component { }

/* 仅平板 */
body.is-tablet .my-component { }

/* 横屏手机 */
@media (orientation: landscape) and (max-height: 600px) { }
```

### 4. 触摸目标尺寸

| 输入方式 | 最小目标尺寸 | 最小间距 |
|----------|-------------|---------|
| 触摸（手机/平板） | 48x48 px | 8 px |
| 鼠标/触控笔 | 44x44 px | N/A |

## 证据分层

### 直接证据（来自官方文档）
- Obsidian CSS 变量文档（Properties, File, Table, Tag, CSS variables）
- Obsidian 官方帮助（Sidebar, CSS snippets, Style guide）
- View 类 `onResize()` API 文档

### 合理迁移（来自论坛/社区）
- Flexbox 具体用法示例（来自 Obsidian Forum 插件代码）
- `body.is-mobile` 等设备类名用法（社区验证）

### 证据空白
- Flexbox vs Grid 在 sidebar 内部布局的官方对比建议
- Container Queries 在 Obsidian 中的支持情况

## 下一步建议

### 立即可执行
1. **文字溢出修复**：在 `styles.css` 中为 `.lti-note-link`, `.lti-pill` 等添加 `overflow: hidden; white-space: nowrap; text-overflow: ellipsis;`
2. **按钮内边距**：统一使用 Obsidian 变量而非硬编码像素值
3. **onResize 监听**：在 `LinkTagIntelligenceView` 中考虑添加 `onResize()` 处理响应式

### 进一步研究
1. 审查现有 `styles.css` 中硬编码的像素值，替换为 Obsidian CSS 变量
2. 研究 Container Queries（`@container`）是否可在 Obsidian 中使用
3. 考虑将部分固定宽度改为 flex 自适应
