#!/bin/bash
# detect-console-log.sh - 检测并阻止 console.log 语句
# 触发时机: PreToolUse (Edit|Write) 针对 TypeScript 文件

set -euo pipefail

# 从 stdin 读取 JSON 输入
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.file_path // empty')

# 只检查 TypeScript/JavaScript 文件
if [[ -z "$FILE_PATH" ]] || [[ ! "$FILE_PATH" =~ \.(ts|js)$ ]]; then
    exit 0
fi

# 检查是否包含 console.log
if grep -qE 'console\.(log|debug|info|warn|error)\s*\(' "$FILE_PATH" 2>/dev/null; then
    echo "⚠️  检测到 console.* 语句，请使用 Obsidian 的 Logger 或移除调试代码" >&2
    echo "文件: $FILE_PATH" >&2
    # 警告但不阻止，允许开发者决定
    exit 0
fi

exit 0