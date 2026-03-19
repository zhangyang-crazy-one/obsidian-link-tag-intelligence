# Obsidian插件开发对话决策笔记

## 对话上下文

- **日期**: 2026-03-19
- **Conversation ID**: 06288116-ef9f-4f4d-a7d3-d6248459878f
- **Notebook ID**: 6a1ff318-8f61-4df0-bb44-07d29ddb5021

## 用户要求

用户要求调研 Obsidian 插件开发的优质来源，用于指导当前 Link Tag Intelligence 插件的进一步开发。

## 证据分层

### 直接证据（来自官方文档和权威来源）

1. **生命周期管理**: `onload()`/`onunload()` 是核心，正确实现资源清理是插件稳定性的基础
2. **Managed Registration**: `register*` 系列方法是官方推荐的资源管理方式，可自动清理
3. **热加载前提**: 热加载正常工作依赖正确的 `onunload()` 实现
4. **Vault原子操作**: `vault.process()` 是官方推荐的读写模式

### 合理迁移（来自非官方但高质量来源）

1. **sample-plugin-plus**: 包含 ESLint 配置和更好的开发工作流，是官方 sample 的增强版
2. **hot-reload mobile**: 实验性支持移动端热加载

### 证据空白（待验证）

1. 移动端插件开发的完整限制清单
2. 大型vault（10000+文件）下的性能优化具体方案

## 本次研究采用的来源策略

- **只导入官方文档**: 12个来源全部来自 `docs.obsidian.md` 或 GitHub官方仓库
- **过滤所有非权威来源**: 排除了 Reddit、LobeHub skill市场、博客等
- **理由**: 插件开发有明确的官方标准，第三方来源容易过时或包含错误信息

## 对 LTI 插件开发的直接指导

| 发现 | 对 LTI 的适用性 | 优先级 |
|------|----------------|--------|
| 生命周期管理 | LTI 已基本正确实现 | 复查 onunload |
| registerEvent 代替原生事件 | LTI 的 reading-hover 可能需要改造 | 高 |
| vault.process() | LTI 的 notes.ts 文件读写可改为 process | 中 |
| 热加载开发 | 当前开发效率可提升 | 高 |

## 下一步动作

1. 复查 LTI 插件的 `onunload()` 实现是否完整
2. 将 notes.ts 中的 `read()`+`modify()` 改为 `vault.process()`
3. 研究 MetadataCache 的 `changed` 事件和 `vault.on('rename')` 事件的监听