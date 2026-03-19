#!/bin/bash
# lint-check.sh - 代码风格检查钩子
# 触发时机: PreToolUse (Edit|Write)

set -e

PROJECT_DIR="/home/zhangyangrui/my_programes/obsidian-link-tag-intelligence"

# 获取修改的文件
MODIFIED_FILES=$(git diff --name-only --cached 2>/dev/null || echo "")

if [ -z "$MODIFIED_FILES" ]; then
    # 如果没有 staged 文件，检查所有已修改的 ts 文件
    MODIFIED_FILES=$(git diff --name-only 2>/dev/null | grep '\.ts$' || echo "")
fi

if [ -z "$MODIFIED_FILES" ]; then
    echo "没有修改的 TypeScript 文件，跳过检查"
    exit 0
fi

echo "🔍 检查以下文件: $MODIFIED_FILES"

# 对修改的文件运行 ESLint
# 注意：此项目目前没有 eslint 配置，可以添加

exit 0
