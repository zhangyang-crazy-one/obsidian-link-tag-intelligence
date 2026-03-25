# 设计令牌 (Design Tokens)

## 目录

- 令牌结构
- 颜色令牌
- 间距令牌
- 字体令牌
- 圆角令牌
- 阴影令牌
- 动效令牌
- Pencil 变量设置
- 令牌使用示例
- 令牌管理原则

> 设计令牌是设计系统的基础，它们以命名变量的形式存储视觉设计决策，确保跨平台、跨组件的一致性。

## 令牌结构

```
tokens/
├── colors/        # 颜色令牌
├── spacing/       # 间距令牌
├── typography/    # 字体令牌
├── radius/       # 圆角令牌
├── shadows/      # 阴影令牌
└── motion/       # 动效令牌
```

## 颜色令牌

### GitHub Dark 主题

```json
{
  "colors": {
    "bg": {
      "primary": "#0d1117",
      "secondary": "#161b22",
      "tertiary": "#21262d",
      "inverse": "#ffffff"
    },
    "border": {
      "default": "#30363d",
      "muted": "#21262d",
      "subtle": "#484f58"
    },
    "text": {
      "primary": "#c9d1d9",
      "secondary": "#8b949e",
      "tertiary": "#6e7681",
      "placeholder": "#484f58"
    },
    "accent": {
      "fg": "#58a6ff",
      "emphasis": "#1f6feb",
      "muted": "#388bfd26"
    },
    "success": {
      "fg": "#3fb950",
      "emphasis": "#238636",
      "muted": "#3fb95026"
    },
    "danger": {
      "fg": "#da3633",
      "emphasis": "#b62324",
      "muted": "#da363326"
    },
    "warning": {
      "fg": "#d29922",
      "emphasis": "#9e6a03",
      "muted": "#d2992226"
    }
  }
}
```

### Tailwind CSS 变量

```css
/* globals.css */
@tailwind base;
@layer base {
  :root {
    /* Background */
    --color-bg-primary: #0d1117;
    --color-bg-secondary: #161b22;
    --color-bg-tertiary: #21262d;
    --color-bg-inverse: #ffffff;

    /* Border */
    --color-border-default: #30363d;
    --color-border-muted: #21262d;
    --color-border-subtle: #484f58;

    /* Text */
    --color-text-primary: #c9d1d9;
    --color-text-secondary: #8b949e;
    --color-text-tertiary: #6e7681;

    /* Accent */
    --color-accent-fg: #58a6ff;
    --color-accent-emphasis: #1f6feb;

    /* Semantic */
    --color-success: #3fb950;
    --color-danger: #da3633;
    --color-warning: #d29922;
  }
}
```

## 间距令牌

### 基础间距系统

| 令牌 | 值 | Tailwind | 用途 |
|------|-----|----------|------|
| `spacing.xs` | 4px | `gap-1` | 密集元素内部 |
| `spacing.sm` | 8px | `gap-2` | 紧密相关元素 |
| `spacing.md` | 12px | `gap-3` | 一般间距 |
| `spacing.lg` | 16px | `gap-4` | 组件之间 |
| `spacing.xl` | 24px | `gap-6` | 区块之间 |
| `spacing.2xl` | 32px | `gap-8` | 大区块之间 |
| `spacing.3xl` | 48px | `gap-12` | 页面级间距 |

### 内边距令牌

| 令牌 | 值 | Tailwind | 用途 |
|------|-----|----------|------|
| `padding.sm` | 8px | `p-2` | 小型元素 |
| `padding.md` | 12px | `p-3` | 中型元素 |
| `padding.lg` | 16px | `p-4` | 大型元素 |
| `padding.xl` | 24px | `p-6` | 面板边缘 |

## 字体令牌

### 字体栈

```css
/* 中文 + 英文 */
--font-sans: "Inter", "Noto Sans SC", system-ui, sans-serif;
--font-mono: "JetBrains Mono", "Fira Code", "SF Mono", monospace;
```

### 字体大小

| 令牌 | 值 | Tailwind | 用途 |
|------|-----|----------|------|
| `fontSize.xs` | 11px | `text-xs` | 标签、辅助文字 |
| `fontSize.sm` | 12px | `text-sm` | 次要信息 |
| `fontSize.base` | 14px | `text-base` | 正文 |
| `fontSize.lg` | 16px | `text-lg` | 副标题 |
| `fontSize.xl` | 18px | `text-xl` | 标题 |
| `fontSize.2xl` | 20px | `text-2xl` | 大标题 |
| `fontSize.3xl` | 24px | `text-3xl` | 页面标题 |

### 字重

| 令牌 | 值 | Tailwind | 用途 |
|------|-----|----------|------|
| `fontWeight.normal` | 400 | `font-normal` | 正文 |
| `fontWeight.medium` | 500 | `font-medium` | 强调 |
| `fontWeight.semibold` | 600 | `font-semibold` | 按钮文字 |
| `fontWeight.bold` | 700 | `font-bold` | 标题 |

## 圆角令牌

| 令牌 | 值 | Tailwind | 用途 |
|------|-----|----------|------|
| `radius.none` | 0px | `rounded-none` | 分隔线 |
| `radius.sm` | 4px | `rounded-sm` | 标签 |
| `radius.md` | 6px | `rounded-md` | 按钮、输入框 |
| `radius.lg` | 8px | `rounded-lg` | 卡片 |
| `radius.xl` | 12px | `rounded-xl` | 面板 |
| `radius.full` | 9999px | `rounded-full` | 头像 |

## 阴影令牌

```css
/* GitHub 不使用阴影，保持扁平设计 */

/* 如果需要阴影： */
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
--shadow-md: 0 4px 8px rgba(0, 0, 0, 0.4);
--shadow-lg: 0 8px 16px rgba(0, 0, 0, 0.5);
```

## 动效令牌

| 令牌 | 值 | 用途 |
|------|-----|------|
| `duration.fast` | 150ms | 微交互、Hover |
| `duration.normal` | 200ms | 一般过渡 |
| `duration.slow` | 300ms | 大型动画 |
| `easing.default` | ease-out | 默认缓动 |
| `easing.bounce` | cubic-bezier(0.68, -0.55, 0.265, 1.55) | 弹性动画 |

## Pencil 变量设置

```javascript
// 设置设计变量
set_variables({
  filePath: "design.pen",
  variables: {
    "bg-primary": "#0d1117",
    "bg-secondary": "#161b22",
    "bg-tertiary": "#21262d",
    "text-primary": "#c9d1d9",
    "text-secondary": "#8b949e",
    "accent": "#58a6ff",
    "success": "#3fb950",
    "danger": "#da3633",
    "spacing-sm": 8,
    "spacing-md": 16,
    "spacing-lg": 24,
    "radius-md": 6,
    "radius-lg": 12
  }
})
```

## 令牌使用示例

### 在代码中使用

```typescript
// 使用令牌而非硬编码
const styles = {
  backgroundColor: tokens.colors.bg.primary,
  color: tokens.colors.text.primary,
  padding: tokens.spacing.lg,
  borderRadius: tokens.radius.lg,
}
```

### 在 Tailwind 中使用

```html
<!-- 使用 CSS 变量 -->
<div class="bg-[--color-bg-primary] text-[--color-text-primary] p-[--spacing-lg] rounded-[--radius-lg]">
  Content
</div>

<!-- 或使用 Tailwind 扩展 -->
<div class="bg-primary text-primary p-lg rounded-lg">
  Content
</div>
```

## 令牌管理原则

1. **单一来源**：颜色、间距等只在一个地方定义
2. **语义命名**：使用语义名称而非描述性名称
   - ✗ `blue-500`
   - ✓ `accent`
3. **层级组织**：按用途分组，便于查找
4. **文档化**：每个令牌都有用途说明
5. **版本控制**：设计变更时更新令牌版本
