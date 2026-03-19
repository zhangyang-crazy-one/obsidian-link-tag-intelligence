---
name: ui-ux-pro-max
version: 1.1.0
description: |
  UI/UX 设计与前端视觉优化：界面重做、审查、配色、字体与动效。

  触发场景：
  - 设计或重构网页、后台、移动端、设计系统
  - 优化配色、层级、排版、组件视觉与动效
  - 把空间或品牌风格映射到数字界面

  触发词：
  中文：界面设计、前端优化、配色、字体、视觉风格
  英文：ui, ux, dashboard, design system, landing page
metadata:
  short-description: UI/UX 设计提示与前端优化
---

# UI/UX Pro Max

用于两类任务：

1. 数字界面设计与前端落地：网页、落地页、仪表盘、后台、移动端、组件、设计系统、重构、审查、修复。
2. 现实世界视觉映射：家装、室内、酒店、展厅、品牌空间、材质与配色研究，再把这些规律迁移到 UI/UX，而不是生硬照搬。

## 何时使用

- 用户要设计、优化、审查、重构 UI/UX。
- 用户要做配色、字体、布局、动效、层级、视觉语言选型。
- 用户要把现实世界风格映射到数字界面，例如家装配色、空间氛围、酒店感、展陈感、材质感。
- 用户要修现有前端界面的“土、乱、糊、挤、假、高饱和、像模板站”问题。
- 用户明确提到：`UI`、`UX`、`界面`、`前端优化`、`落地页`、`dashboard`、`admin`、`配色`、`字体`、`动画`、`design system`、`家装配色`、`室内风格`、`空间视觉`、`NotebookLM`。

## 默认入口

- 默认执行器：`uv`
- 默认命令：

```bash
UV_CACHE_DIR=.tmp/uv-cache uv run python <skill-dir>/scripts/search.py "<query>" --domain <domain>
```

- `<skill-dir>` 指当前技能目录：
  - `.codex/skills/ui-ux-pro-max`
  - `.claude/skills/ui-ux-pro-max`
- `uv` 不可用时，再回退：

```bash
./.venv/bin/python <skill-dir>/scripts/search.py "<query>" --domain <domain>
```

- 不再写“先安装 Python”的泛教程；这个仓库默认按 `uv` / `.venv` 工作。
- 前端技术栈默认不做限制：
  - 在现有项目里，先遵守仓库已有栈。
  - 只有在纯新建、且用户没给任何技术上下文时，才选择最轻量的实现路径。

## 工作模式

### 1. 本地快速检索

用于秒级得到风格、产品、配色、字体、落地页结构、图表、UX 规则、栈内实现建议。

### 2. 现实世界视觉校准

当任务涉及家装、空间、酒店、展厅、材料、品牌氛围、真实配色趋势时，不只依赖本地 CSV。改为先用 NotebookLM 做现实世界视觉研究，再把结果迁移到 UI/UX。

### 3. UI 审查与修复

用于分析现有代码或页面的问题：视觉层级、间距、色彩、暗黑模式、可访问性、响应式、组件状态、动效、内容密度。

### 4. 多栈落地

用于把视觉方案落地到现有技术栈；不要因为技能里有某个栈就强行改栈。

## 最小工作流

### A. 先判断任务类型

分成以下几类之一：

- 新界面 / 新页面生成
- 旧界面翻新 / 重构
- 现有 UI 审查 / 打分 / 修复
- 设计系统 / 配色 / 字体方案
- 家装 / 空间 / 现实世界视觉映射

### B. 先跑本地检索

推荐顺序：

1. `product`
2. `style`
3. `typography`
4. `color`
5. `landing`
6. `chart`
7. `ux`
8. `stack`

只有任务真的需要，才把 8 类都跑完。

### C. 需要现实世界视觉依据时，接 NotebookLM

遇到以下场景，默认接入 NotebookLM：

- 家装 / 室内 / 住宅 / 酒店 / 餐饮 / 展陈 / 门店 / 品牌空间
- 需要真实世界的色彩趋势、材料搭配、空间氛围证据
- 用户明确说“不要只靠 UI 模板感”“要现实世界视觉设计”

执行规则：

- 走 `notebooklm-workflow` 的闭环：research -> selective import -> notebook query -> 双 note -> 本地落盘。
- 复用最接近的 notebook；没有合适 notebook 再新建。
- 输出时必须区分：
  - 直接证据
  - 合理迁移到 UI/UX
  - 证据空白

具体 query 模板和视觉研究提醒见 [references/notebooklm-visual-research.md](references/notebooklm-visual-research.md)。

### D. 把检索结果转成可执行方案

至少产出以下几项中的 4 项：

- 视觉方向
- 色板 / token
- 字体搭配
- 组件形态
- 布局结构
- 动效原则
- 无障碍与对比度要求
- 栈内实现约束

### E. 如果是现有前端优化

必须检查：

- 视觉层级是否清楚
- 间距系统是否统一
- 色彩是否过脏、过亮、过灰或没有主次
- 交互状态是否可见
- hover / focus / active 是否完整
- 暗黑模式和浅色模式是否都成立
- 响应式是否稳定
- 是否尊重当前栈与现有设计语言

## 本地检索示例

### 数字产品

```bash
UV_CACHE_DIR=.tmp/uv-cache uv run python <skill-dir>/scripts/search.py "b2b saas trust clean" --domain product
UV_CACHE_DIR=.tmp/uv-cache uv run python <skill-dir>/scripts/search.py "minimal swiss editorial" --domain style
UV_CACHE_DIR=.tmp/uv-cache uv run python <skill-dir>/scripts/search.py "professional modern readable" --domain typography
UV_CACHE_DIR=.tmp/uv-cache uv run python <skill-dir>/scripts/search.py "dashboard comparison trend" --domain chart
UV_CACHE_DIR=.tmp/uv-cache uv run python <skill-dir>/scripts/search.py "accessibility motion layout shift" --domain ux
```

### 家装 / 空间 / 现实世界视觉

```bash
UV_CACHE_DIR=.tmp/uv-cache uv run python <skill-dir>/scripts/search.py "家装配色 原木 奶油风 温暖" --domain color
UV_CACHE_DIR=.tmp/uv-cache uv run python <skill-dir>/scripts/search.py "室内 住宅 侘寂 极简" --domain style
UV_CACHE_DIR=.tmp/uv-cache uv run python <skill-dir>/scripts/search.py "architecture interior editorial" --domain typography
UV_CACHE_DIR=.tmp/uv-cache uv run python <skill-dir>/scripts/search.py "hotel hospitality luxury warm neutral" --domain product
```

### 栈内实现

```bash
UV_CACHE_DIR=.tmp/uv-cache uv run python <skill-dir>/scripts/search.py "responsive spacing accessibility" --stack react
UV_CACHE_DIR=.tmp/uv-cache uv run python <skill-dir>/scripts/search.py "layout forms contrast dark mode" --stack vue
UV_CACHE_DIR=.tmp/uv-cache uv run python <skill-dir>/scripts/search.py "cards tables mobile nav" --stack html-tailwind
```

## 域选择规则

- `product`：产品类型、行业、项目气质、适合的总体方向
- `style`：视觉风格、氛围、质感、布局语言
- `typography`：字体搭配、品牌气质、可读性
- `color`：色板、主次色、背景/文本/边框方向
- `landing`：落地页结构、CTA、页面节奏
- `chart`：图表类型和可视化策略
- `ux`：常见 UX 反模式、可访问性、交互约束
- `stack`：现有技术栈的实现规范

## 从现实世界迁移到 UI/UX 的规则

- 不要直接把“房间配色”原样抄成界面主题。
- 要迁移的是规律，不是表面：
  - 基底色温
  - 材质感
  - 明暗节奏
  - 软硬几何
  - 点缀色密度
  - 空间层次
- 物理空间里的柔和感，到了屏幕上要重新经过：
  - 对比度
  - 发光屏适配
  - 状态色区分
  - 文本可读性
  - WCAG

## 审查 / 输出要求

最终建议默认应包含：

- 这次采用的视觉方向
- 为什么不用其他方向
- 主背景 / 表面 / 文本 / 边框 / 点缀色
- 字体和字重层级
- 组件几何和阴影策略
- 动效与响应式原则
- 如果用了 NotebookLM：
  - `notebook_id`
  - `task_id`
  - `conversation_id`
  - 直接证据 / 合理迁移 / 空白项

## 不要这样做

- 不要默认所有项目都用 `html-tailwind`。
- 不要脱离现有仓库栈去硬塞新框架。
- 不要只给“风格名”，不给可落地的色板、字体和组件规则。
- 不要把现实世界配色直接照抄成 UI 主题，不做对比度和发光屏修正。
- 不要把 `NotebookLM` 研究结果写成绝对事实而不区分证据层级。
- 不要继续保留错误路径示例或过时的安装说明。

## 参考

- 现实世界视觉研究与 NotebookLM query 模板见 [references/notebooklm-visual-research.md](references/notebooklm-visual-research.md)。
- 检索逻辑在 `scripts/search.py` 与 `scripts/core.py`。
- 数据库在 `data/` 目录；若用户问题明显超出本地数据覆盖，再用 NotebookLM 补现实依据。
