#!/bin/bash
# Claude Code Hook: 自动同步开发知识到 NotebookLM
# 触发时机: Stop hook (Claude 结束响应时)
# 使用方式: nlm note create 直接创建笔记

set -euo pipefail

# 读取 hook 输入
INPUT=$(cat)

# 从输入中提取命令信息
COMMAND=$(echo "$INPUT" | jq -r '.tool_name // empty')

# 检查是否是 git commit 命令 (通过 PreToolUse 的 Bash 工具检测)
if [[ "$COMMAND" == *"git commit"* ]] || echo "$INPUT" | jq -r '.tool_input.command // empty' | grep -q "git commit"; then
    echo "Detected git commit, extracting knowledge..." >&2

    # 获取 commit 信息
    COMMIT_MSG=$(git log -1 --pretty=%s 2>/dev/null || echo "Unknown commit")
    COMMIT_DIFF=$(git show HEAD --stat 2>/dev/null || echo "")
    COMMIT_FULL=$(git log -1 --pretty=full 2>/dev/null || echo "")

    # 获取笔记本 ID (从环境变量或配置文件)
    NOTEBOOK_ID="${NOTEBOOK_ID:-9352e458-a7af-48ac-9c40-770ebf6a4362}"

    # 构建笔记内容
    NOTE_CONTENT="# ${COMMIT_MSG}

**日期**: $(date '+%Y-%m-%d %H:%M')
**类型**: Feature/Bugfix/Refactor
**Commit**: \`$(git rev-parse HEAD 2>/dev/null || echo 'unknown')\`

## 1. 核心问题 (Problem)
[描述解决的核心问题或实现的功能]

## 2. 关键洞察 (Insight)
[解释背后的根本原因或核心设计思路]

## 3. 实现细节 (Implementation)
\`\`\`
${COMMIT_DIFF}
\`\`\`

## 4. 避坑指南 (Pitfalls)
[列出未来应避免的类似错误或相关教训]
"

    # 使用 nlm 创建笔记 (支持本地脚本路径)
    NLM_LOCAL="${HOME}/my_programes/obsidian-link-tag-intelligence/tools/notebooklm-mcp-cli/nlm-local.sh"
    NOTE_TITLE="[$(date '+%Y%m%d')] ${COMMIT_MSG:0:50}"
    if [[ -x "$NLM_LOCAL" ]]; then
        "$NLM_LOCAL" note create "$NOTEBOOK_ID" -c "$NOTE_CONTENT" -t "$NOTE_TITLE" 2>/dev/null || {
            echo "Failed to create note via nlm" >&2
            # 备用方案: 保存到本地文件
            SYNC_DIR="${HOME}/.notebooklm-sync"
            mkdir -p "$SYNC_DIR"
            echo -e "$NOTE_CONTENT" > "${SYNC_DIR}/note_$(date +%Y%m%d%H%M%S).md"
        }
        echo "Knowledge synced to NotebookLM" >&2
    elif [[ -x "${HOME}/.local/bin/nlm" ]]; then
        "${HOME}/.local/bin/nlm" note create "$NOTEBOOK_ID" -c "$NOTE_CONTENT" -t "$NOTE_TITLE" 2>/dev/null || {
            echo "Failed to create note via nlm" >&2
            # 备用方案: 保存到本地文件
            SYNC_DIR="${HOME}/.notebooklm-sync"
            mkdir -p "$SYNC_DIR"
            echo -e "$NOTE_CONTENT" > "${SYNC_DIR}/note_$(date +%Y%m%d%H%M%S).md"
        }
        echo "Knowledge synced to NotebookLM" >&2
    else
        # nlm 不可用，保存到本地
        SYNC_DIR="${HOME}/.notebooklm-sync"
        mkdir -p "$SYNC_DIR"
        echo -e "$NOTE_CONTENT" > "${SYNC_DIR}/note_$(date +%Y%m%d%H%M%S).md"
        echo "Note saved locally, nlm not found" >&2
    fi
fi

# 正常退出，不阻塞 Claude
exit 0
