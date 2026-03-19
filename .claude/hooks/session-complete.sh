#!/bin/bash
# session-complete.sh - Obsidian Link Tag Intelligence 会话完成
# 触发时机: Stop

PROJECT_DIR="/home/zhangyangrui/my_programes/obsidian-link-tag-intelligence"
cd "$PROJECT_DIR"

echo "=========================================="
echo "📊 会话完成统计"
echo "=========================================="

# 检查 git 变更
if command -v git &> /dev/null && [ -d ".git" ]; then
  CHANGES=$(git status --porcelain 2>/dev/null | wc -l)
  if [ "$CHANGES" -gt 0 ]; then
    echo "📝 未提交变更: $CHANGES 个文件"
    git status --short 2>/dev/null | head -5
  fi
fi

echo "=========================================="
echo "💡 建议: 提交前运行 npm test"
echo "=========================================="
