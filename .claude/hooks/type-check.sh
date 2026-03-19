#!/bin/bash
# type-check.sh - TypeScript 类型检查钩子
# 触发时机: PreToolUse (npm run build)

set -e

PROJECT_DIR="/home/zhangyangrui/my_programes/obsidian-link-tag-intelligence"

echo "🔍 运行 TypeScript 类型检查..."

cd "$PROJECT_DIR"

# 运行 tsc 类型检查
if npx tsc --noEmit 2>&1; then
    echo "✅ 类型检查通过"
    exit 0
else
    echo "❌ 类型检查失败，请修复上述错误"
    exit 2
fi
