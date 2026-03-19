# Obsidian插件开发 - NotebookLM研究记录

**日期**: 2026-03-19
**绝对日期**: 2026年3月19日

## Notebook 信息

- **Notebook Title**: Obsidian插件开发
- **Notebook ID**: 6a1ff318-8f61-4df0-bb44-07d29ddb5021

## Research 任务

- **Research Query**: Obsidian插件开发最佳实践：社区标准、API规范、热加载机制、UI组件设计
- **Mode**: deep
- **Start Task ID**: fb2008b3-d67e-4642-905b-706ab48d1ff8
- **Completed Task ID**: 8a2317fb-567e-4c2c-a534-046c4936e1f7
- **Discovered Sources**: 75个
- **Imported Indices**: 3,4,8,9,11,12,13,14,23,24,25,40（12个来源）

## Imported Sources

| Index | Title | source_id |
|-------|-------|-----------|
| 3 | Plugin guidelines - Developer Documentation - Obsidian | - |
| 4 | pjeby/hot-reload | cf7fb7a5-3a03-47cf-831d-428a86b7a95c |
| 8 | obsidianmd/obsidian-sample-plugin | 7695e0ec-f0e6-4e7b-b649-fa4d63c32f4f |
| 9 | Plugin - Developer Documentation | 613cdd51-3249-4263-934b-0bdabeb1773e |
| 11 | Developer policies | - |
| 12 | davidvkimball/obsidian-sample-plugin-plus | defeb7fd-b819-423a-8928-73c114a52db5 |
| 13 | Vault - Developer Documentation | a02d061b-2708-4f0f-ada0-6edeb7f7fef8 |
| 14 | Build a plugin | 9604e6e0-4d69-4082-b6a2-26ba04216029 |
| 23 | Submit your plugin | - |
| 24 | CSS variables | - |
| 25 | MetadataCache | - |
| 40 | Home - Developer Documentation | - |

## Notes

| Note ID | Title | conversation_id |
|---------|-------|----------------|
| a047d4ed-7171-489c-85c5-8cc4daf453fa | 调研日志 | 06288116-ef9f-4f4d-a7d3-d6248459878f |
| 937c0549-7bfa-417a-8bcd-ce60131337f1 | 对话决策笔记 | 06288116-ef9f-4f4d-a7d3-d6248459878f |

## 核心发现

### 直接证据

1. **生命周期管理**: `onload()`/`onunload()` 是核心
2. **Managed Registration**: `register*` 系列方法自动清理资源
3. **热加载**: 依赖正确的 `onunload()` 实现
4. **Vault原子操作**: `vault.process()` 防止数据丢失

### 对 LTI 的指导意义

| 发现 | LTI 适用性 | 优先级 |
|------|-----------|--------|
| registerEvent 代替原生事件 | reading-hover 可能需改造 | 高 |
| vault.process() | notes.ts 可改为 process 模式 | 中 |
| 热加载开发 | 提升开发效率 | 高 |
| 复查 onunload | 确保资源清理完整 | 高 |

## 下一步

1. 复查 LTI 插件的 `onunload()` 实现
2. 将 notes.ts 中的 `read()`+`modify()` 改为 `vault.process()`
3. 研究 MetadataCache 事件监听
4. 考虑使用 hot-reload 提升开发效率