---
name: frontend-evolution
description: 将设计需求、界面样稿、Pencil 设计稿或现有前端页面迭代成高质量前端实现。用于 UI/UX 设计、设计稿转代码、前端界面重构、视觉风格统一、设计令牌整理、Pencil 布局搭建，以及在 React、Vue 或 Rust UI 技术栈中生成或改进界面代码；当用户要求“设计一个界面”“按样稿实现前端”“优化配色、字体或布局”“把设计稿转成代码”“制作 TUI 或终端界面”时使用。
---

# Frontend Evolution

按照“先对齐意图，再定设计，再落代码，再做验证”的顺序工作。优先复用仓库现有技术栈、组件模式和设计系统；不要为了技能本身引入新框架。

## 执行流程

1. 捕获约束。
   - 提取目标平台、现有框架、交互需求、参考样式、内容结构、响应式要求。
   - 如果用户只给了模糊风格词，先把它们转成 2 到 3 个可执行的设计锚点，例如“高对比深色、紧凑信息密度、代码编辑器气质”。

2. 选择工作模式。
   - 设计优先：用户给的是空白需求、样稿、草图，或需要先在 Pencil 里探索。
   - 代码优先：仓库里已有界面，需要直接重构或增强。
   - 混合模式：先在 Pencil 验证布局，再映射到代码。

3. 需要 Pencil 时，先读 `references/pencil_workflow.md`。
   - 先调用 `get_editor_state` 和 `get_variables`，不要盲目新建设计。
   - 创建多组件布局前，先规划整组坐标，避免重叠。
   - 设计阶段发生明显转向时，运行 `python3 scripts/design_snapshot.py save <file.pen>` 保存快照。

4. 需要统一视觉语言时，按需读取参考。
   - `references/aesthetic_principles.md`：检查空间关系、层次、呼吸感和一致性。
   - `references/design_tokens.md`：把颜色、间距、字体、圆角整理成令牌，不要散落硬编码值。
   - `references/tech_stack_refs.md`：把 Pencil 结构映射到目标技术栈。

5. 生成或修改代码。
   - 从设计树或现有代码中提取布局、层级、状态和令牌。
   - 保持仓库既有框架、命名和组织方式。
   - 输出可运行代码，而不是只给静态样例。
   - 默认追求有辨识度的前端，而不是通用模板感界面。

6. 验证结果。
   - 视觉验证：截图、布局快照、间距与层次自检。
   - 技术验证：运行当前仓库可用的构建、测试、类型检查或 lint。
   - 如果有导出的布局 JSON，可运行 `python3 scripts/aesthetic_analyzer.py <layout.json>` 做快速审美扫描。

## 实施准则

- 先确认信息架构，再润色视觉。不要在结构未稳定前反复微调阴影、颜色或动效。
- 优先使用设计令牌和 CSS 变量。只有在仓库已有明确模式时才跟随硬编码风格。
- 设计转代码时，先处理容器和布局，再处理文本、状态和细节。
- 表单、弹窗、按钮组等高密度组件，先解决对齐和节奏，再解决装饰。
- 现有项目如果已经有设计系统，遵从它；这个技能用于提升质量，不用于推翻上下文。

## 并行研究与委派

只有在当前环境支持委派，并且用户明确要求子代理、并行代理或 delegation 时，才委派任务；否则在本地完成。

- 设计或技术调研委派：读取 `references/research_delegate.md`
- 代码生成委派：读取 `references/code_generation_delegate.md`
- 批量调研脚本：`python3 scripts/parallel_research.py <template> [output.json]`

## 资源索引

- `references/pencil_workflow.md`
  精确的 Pencil 操作、布局规则和防重叠策略。
- `references/aesthetic_principles.md`
  空间、层次、呼吸感、一致性检查表。
- `references/design_tokens.md`
  常用颜色、间距、字体、圆角和代码侧映射方式。
- `references/tech_stack_refs.md`
  React、Vue、Rust UI 栈的设计到代码映射参考。
- `references/research_delegate.md`
  设计或技术调研委派模板。
- `references/code_generation_delegate.md`
  代码落地委派模板。
- `scripts/design_snapshot.py`
  保存、列出、恢复和对比 Pencil 快照。
- `scripts/aesthetic_analyzer.py`
  对导出的布局 JSON 做快速审美检查。
- `scripts/parallel_research.py`
  并行调用 `ui-ux-pro-max` 的搜索脚本；会依次尝试项目级和用户级技能目录。
