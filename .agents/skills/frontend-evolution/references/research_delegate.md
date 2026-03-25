# 调研委派模板

仅在两件事同时满足时使用本文件：

- 当前运行环境支持委派、子代理或并行代理
- 用户明确要求 delegation、sub-agent work 或并行执行

## 目标

把设计灵感、技术选型或竞品研究拆给独立 worker，同时让主线程继续推进当前实现。

## 输入要求

- 给出用户原始需求和当前阶段目标。
- 给出 repo 路径、目标平台、技术栈和任何必须遵守的视觉约束。
- 只提供完成该子任务需要的局部上下文；不要把主线程的结论当成标准答案塞给 worker。

## 拆分建议

- worker 1：调研视觉方向、配色、字体和布局模式。
- worker 2：调研目标技术栈的实现模式、组件库和性能注意事项。
- worker 3：调研竞品或参考产品的交互流和信息架构。

## 提示词模板

```text
研究这个前端方向并返回可操作结论。

目标：
- <这里写明确的问题，例如“为 Obsidian 插件设置页找 2-3 个深色主题方向”>

上下文：
- Repo: <path>
- Stack: <stack>
- Constraints: <constraints>

要求：
- 聚焦一手来源、官方文档或高信号案例。
- 输出 3-5 条 findings、2-3 条 reusable patterns、主要风险和来源。
- 不要写成长文，不要擅自实现代码。
```

## 返回格式

- Findings：关键观察，按重要性排序。
- Reusable patterns：可以直接移植到当前项目的模式。
- Risks：时效性、兼容性或审美偏差风险。
- Sources：链接或资料名称。

## 本地辅助

如果 `ui-ux-pro-max` 已安装，可运行 `python3 scripts/parallel_research.py <template> [output.json]` 先批量收集候选方向，再由主线程筛选。
