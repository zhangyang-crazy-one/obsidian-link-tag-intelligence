#!/bin/bash
# pre-commit-msg.sh - Git commit message 检查
# 触发时机: PreToolUse (git commit)

COMMIT_MSG_FILE=$1
COMMIT_MSG=$(cat "$COMMIT_MSG_FILE")

# 允许的类型
ALLOWED_TYPES="feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert"

if ! echo "$COMMIT_MSG" | grep -qE "^[A-Z].*"; then
  echo "⚠️  建议: Commit message 首字母大写"
fi

if ! echo "$COMMIT_MSG" | grep -qE "^($ALLOWED_TYPES)(\([a-zA-Z0-9_-]+\))?: .+"; then
  echo "⚠️  建议格式: type(scope): description"
  echo "   类型: feat, fix, docs, style, refactor, test, chore"
fi

exit 0
