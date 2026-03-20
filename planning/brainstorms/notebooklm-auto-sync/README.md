# NotebookLM 自动同步钩子方案

## 讨论结果总结

### 1. 触发条件设计

**推荐方案**: `Stop` hook + `git commit` matcher

```json
{
  "matcher": "tool == \"Bash\" && command.includes(\"git commit\")",
  "type": "command",
  "command": "$PLUGIN_DIR/hooks/sync-notebooklm.sh",
  "async": true
}
```

**原因**:
- `git commit` 代表一个功能或 Debug 阶段完成
- `async: true` 确保不阻塞 Claude 继续工作
- `Stop` hook 只在 Claude 结束响应时触发，避免频繁执行

### 2. 知识提取内容

从 git commit 中提取以下结构化知识：

| 类别 | 内容 |
|------|------|
| **Problem** | 解决了什么问题/实现了什么功能 |
| **Insight** | 背后的根本原因或核心设计思路 |
| **Implementation** | 代码改动细节（过滤无用 import/格式化） |
| **Pitfalls** | 未来应避免的错误和相关教训 |

### 3. 笔记本路由

**方案**: 通过环境变量 `NOTEBOOK_ID` 配置

```bash
# 在 .env 或 settings.local.json 中配置
NOTEBOOK_ID=9352e458-a7af-48ac-9c40-770ebf6a4362
```

**多项目场景**: 每个项目可在 `.claude/settings.local.json` 中配置不同的笔记本 ID

### 4. 实现方案

**技术选型**: Shell 钩子 + nlm CLI 直接创建笔记

**优势**:
- 无需 Google Drive 同步
- nlm CLI 支持 `note create` 命令
- 支持多路径查找 nlm 可执行文件

**脚本**: `hooks/sync-notebooklm.sh`

### 5. 批处理优化

**问题**: 频繁 commit 导致过多笔记

**解决方案**:
- 使用 `SessionEnd` hook 替代每次 commit
- 在会话结束时一次性总结所有 commit
- 或使用 `TaskCompleted` 事件（配合 Agent Teams 使用）

## 实现文件

| 文件 | 用途 |
|------|------|
| `hooks/sync-notebooklm.sh` | 核心钩子脚本 |
| `hooks/hooks.json` | hook 配置 |

## NotebookLM 对话

- 笔记本 ID: `9352e458-a7af-48ac-9c40-770ebf6a4362`
- Conversation ID: `c167a7c1-a5d3-4a0b-a177-21dfb82a026e`
