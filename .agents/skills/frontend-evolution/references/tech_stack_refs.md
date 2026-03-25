# 技术栈代码生成参考

## 目录

- React + TypeScript + Tailwind CSS
- Vue + TypeScript
- Rust WebAssembly - Leptos
- Rust WebAssembly - Dioxus
- Rust WebAssembly - Yew
- 设计令牌代码生成
- 代码生成流程
- 最佳实践

## React + TypeScript + Tailwind CSS

### 组件结构

```tsx
// Component.tsx
import { useState } from 'react';

interface Props {
  title: string;
  onClick?: () => void;
}

export function MyComponent({ title, onClick }: Props) {
  const [isActive, setIsActive] = useState(false);

  return (
    <div className="flex flex-col gap-4 p-6 bg-[#161b22] rounded-xl">
      <h2 className="text-lg font-bold text-[#c9d1d9]">{title}</h2>
      <button
        onClick={onClick}
        className={`
          px-4 py-2 rounded-lg font-medium transition-colors
          ${isActive
            ? 'bg-[#238636] text-white'
            : 'bg-[#21262d] text-[#8b949e]'
          }
          hover:bg-[#30363d]
        `}
      >
        {isActive ? 'Active' : 'Inactive'}
      </button>
    </div>
  );
}
```

### Tailwind CSS 映射规则

| Pencil 属性 | Tailwind 类 |
|-------------|-------------|
| `layout: "horizontal"` | `flex flex-row` |
| `layout: "vertical"` | `flex flex-col` |
| `width: "fill_container"` | `w-full` |
| `height: "fill_container"` | `h-full` |
| `width: "fit_content"` | `w-fit` |
| `gap: 16` | `gap-4` (×4) |
| `padding: 16` | `p-4` |
| `padding: [16, 24]` | `px-6 py-4` |
| `cornerRadius: 8` | `rounded-lg` |
| `cornerRadius: 12` | `rounded-xl` |
| `fill: "#0d1117"` | `bg-[#0d1117]` |

### 颜色变量

```css
/* globals.css */
@tailwind base;
@layer base {
  :root {
    --color-bg-primary: #0d1117;
    --color-bg-secondary: #161b22;
    --color-bg-tertiary: #21262d;
    --color-border: #30363d;
    --color-text-primary: #c9d1d9;
    --color-text-secondary: #8b949e;
    --color-accent: #58a6ff;
    --color-success: #3fb950;
    --color-danger: #da3633;
  }
}
```

## Vue + TypeScript

### 组件结构

```vue
<!-- Component.vue -->
<template>
  <div class="flex flex-col gap-4 p-6 bg-[#161b22] rounded-xl">
    <h2 class="text-lg font-bold text-[#c9d1d9]">{{ title }}</h2>
    <button
      @click="handleClick"
      :class="[
        'px-4 py-2 rounded-lg font-medium transition-colors',
        isActive ? 'bg-[#238636] text-white' : 'bg-[#21262d] text-[#8b949e]'
      ]"
    >
      {{ isActive ? 'Active' : 'Inactive' }}
    </button>
  </div>
</template>

<script setup lang="ts">
interface Props {
  title: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  click: [];
}>();

const isActive = ref(false);

function handleClick() {
  isActive.value = !isActive.value;
  emit('click');
}
</script>
```

## Rust WebAssembly - Leptos

### 组件结构

```rust
use leptos::*;

#[component]
pub fn MyComponent(cx: Scope, title: String) -> impl IntoView {
    let (is_active, set_active) = create_signal(cx, false);

    view! { cx,
        <div class="flex flex-col gap-4 p-6 bg-[#161b22] rounded-xl">
            <h2 class="text-lg font-bold text-[#c9d1d9]">{title}</h2>
            <button
                class=move || {
                    format!(
                        "px-4 py-2 rounded-lg font-medium transition-colors {}",
                        if is_active() {
                            "bg-[#238636] text-white"
                        } else {
                            "bg-[#21262d] text-[#8b949e]"
                        }
                    )
                }
                on:click=move |_| set_active(!is_active())
            >
                {move || if is_active() { "Active" } else { "Inactive" }}
            </button>
        </div>
    }
}
```

### Leptos CSS 映射

| Pencil 属性 | Leptos/Class 属性 |
|-------------|-------------------|
| `layout: "horizontal"` | `flex flex-row` |
| `layout: "vertical"` | `flex flex-col` |
| `gap: 16` | `gap-4` |
| `padding: 16` | `p-4` |
| `cornerRadius: 8` | `rounded-lg` |

## Rust WebAssembly - Dioxus

### 组件结构

```rust
use dioxus::prelude::*;

#[component]
pub fn MyComponent(cx: Scope, title: String) -> Element {
    let mut is_active = use_state(cx, || false);

    cx.render(rsx! {
        div {
            class: "flex flex-col gap-4 p-6 bg-[#161b22] rounded-xl",
            h2 {
                class: "text-lg font-bold text-[#c9d1d9]",
                "{title}"
            }
            button {
                class: "px-4 py-2 rounded-lg font-medium transition-colors {if *is_active.get() { "bg-[#238636] text-white" } else { "bg-[#21262d] text-[#8b949e]" }}",
                onclick: move |_| is_active.set(!is_active.get()),
                if *is_active.get() { "Active" } else { "Inactive" }
            }
        }
    })
}
```

## Rust WebAssembly - Yew

### 组件结构

```rust
use yew::prelude::*;

#[derive(Properties, PartialEq)]
pub struct Props {
    pub title: String,
}

#[function_component]
pub fn MyComponent(props: &Props) -> Html {
    let is_active = use_state(|| false);

    let onclick = {
        let is_active = is_active.clone();
        Callback::from(move |_| is_active.set(!*is_active))
    };

    html! {
        <div class="flex flex-col gap-4 p-6 bg-[#161b22] rounded-xl">
            <h2 class="text-lg font-bold text-[#c9d1d9]">{&props.title}</h2>
            <button
                class={format!(
                    "px-4 py-2 rounded-lg font-medium transition-colors {}",
                    if *is_active { "bg-[#238636] text-white" } else { "bg-[#21262d] text-[#8b949e]" }
                )}
                onclick={onclick}
            >
                { if *is_active { "Active" } else { "Inactive" } }
            </button>
        </div>
    }
}
```

## 设计令牌代码生成

### TypeScript 常量

```typescript
// design-tokens.ts
export const tokens = {
  colors: {
    bg: {
      primary: '#0d1117',
      secondary: '#161b22',
      tertiary: '#21262d',
    },
    border: '#30363d',
    text: {
      primary: '#c9d1d9',
      secondary: '#8b949e',
      muted: '#6e7681',
    },
    accent: '#58a6ff',
    success: '#3fb950',
    danger: '#da3633',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    '2xl': 32,
  },
  radius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
  },
} as const;
```

### Rust 常量

```rust
// design_tokens.rs
pub struct Tokens;

impl Tokens {
    pub const COLORS: Colors = Colors {
        bg_primary: "#0d1117",
        bg_secondary: "#161b22",
        bg_tertiary: "#21262d",
        border: "#30363d",
        text_primary: "#c9d1d9",
        text_secondary: "#8b949e",
        accent: "#58a6ff",
        success: "#3fb950",
        danger: "#da3633",
    };

    pub const SPACING: Spacing = Spacing {
        xs: 4,
        sm: 8,
        md: 12,
        lg: 16,
        xl: 24,
    };
}
```

## 代码生成流程

### 1. 提取组件结构

```javascript
batch_get({
  filePath: "design.pen",
  nodeIds: ["component-id"],
  readDepth: 3,
  resolveInstances: true
})
```

### 2. 分析属性

对于每个节点，提取：
- `type`: 节点类型 (frame, rectangle, text, etc.)
- `layout`: 布局方向
- `fill`: 背景颜色
- `width`, `height`: 尺寸
- `gap`, `padding`: 间距
- `cornerRadius`: 圆角

### 3. 映射到目标技术栈

根据用户选择的技术栈，选择对应的代码模板。

### 4. 生成代码

输出完整的组件文件。

## 最佳实践

1. **保持组件纯净**：一个组件做一件事
2. **使用设计令牌**：颜色、间距不要硬编码
3. **响应式设计**：考虑不同屏幕尺寸
4. **可访问性**：添加适当的 ARIA 属性
5. **类型安全**：使用 TypeScript/Rust 类型
