# NotebookLM Visual Research

## 何时打开

- 用户要“现实世界视觉设计”而不是纯 UI 风格词。
- 任务涉及家装、室内、酒店、咖啡店、展厅、门店、品牌空间、材料和氛围。
- 需要把物理空间或材料语言迁移到数字界面。

## 默认研究路径

1. 先复用最接近的 notebook。
2. 发起 research，不直接 bulk import。
3. 选择性导入高质量来源。
4. 至少做 1 轮真实 `notebook query`。
5. 记录 `notebook_id / task_id / source_id / note_id / conversation_id`。
6. 每轮必须双 note：
   - 调研日志
   - 对话决策

## 来源偏好

优先：

- 官方品牌或厂商趋势报告
- 建材 / 卫浴 / 涂料 / 家居品牌官方资料
- 建筑与室内设计媒体
- 可复核的高质量案例与 award 资料

谨慎：

- 纯情绪化 moodboard
- 无来源链的短视频
- 电商列表页
- 没有文本信息密度的灵感图集合

## Query 模板

### 住宅 / 家装配色

```text
Summarize durable 2025-2026 residential interior color directions for real-world home design. Focus on warm neutrals, cream/ivory, wood-floor pairings, room-level differences, and material cues. Output in Chinese with: 1) 直接证据 2) 合理迁移到 UI/UX 3) 证据空白.
```

### 酒店 / Hospitality

```text
Summarize real-world hospitality visual patterns for hotel / lounge / boutique interiors: palette temperature, lighting mood, metal/stone/wood pairings, and what should or should not transfer into digital booking / brand UI.
```

### 展厅 / 品牌空间

```text
Identify real-world showroom or brand-space design patterns: contrast rhythm, focal lighting, material hierarchy, signage readability, and translate them into digital landing page / product page design rules.
```

### 从现实世界映射到 UI

```text
Based only on these sources, explain how to translate the physical-space palette into a UI system without blindly copying room colors. Separate: background/surface, text, accent, geometry, motion, and accessibility constraints.
```

## 迁移规则

- 迁移“规律”，不迁移“表面图像”。
- 重点看：
  - 基底色温
  - 材料粗细与反光度
  - 重色出现密度
  - 曲线 / 直线比例
  - 空间层次与留白
- 输出必须写清：
  - 哪些是现实证据
  - 哪些是对 UI 的合理迁移
  - 哪些还缺证据或需要 WCAG 再验证

## 常见结论落地法

- 暖白、象牙、greige：适合做 UI 背景与 surface，而不是直接拿来做文本色。
- 木色、鼠尾草绿、陶土、炭灰：适合做 accent family，但要降饱和、过对比度。
- 空间中的“柔和感”在屏幕里通常要通过：
  - 暖灰背景
  - 柔和圆角
  - 漫反射阴影
  - 降饱和点缀色
  - 更严格的文本对比
