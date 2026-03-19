#!/bin/bash
# session-complete.sh - 会话完成钩子（精简版，合并了 planning-save 和 session-end-summary）
# 触发时机: Stop
# 功能: 变更统计 + 简要提醒

export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

# 清理 tmp/ 目录临时文件
if [ -d "tmp" ]; then
    find "tmp" -name "*.tmp" -o -name "*.log" -o -name "*~" -o -name "*.bak" -o -name "*.swp" -type f -maxdepth 3 -delete 2>/dev/null
    find "tmp" -empty -type d -maxdepth 2 -delete 2>/dev/null
fi

# Git 变更统计
status=$(git status --porcelain 2>/dev/null)
if [ -n "$status" ]; then
    added=$(echo "$status" | grep -c '^[A?]')
    modified=$(echo "$status" | grep -c '^M')

    echo "Session Completed | ${added} added, ${modified} modified"
    echo "Changed files:"
    echo "$status" | head -15 | while read -r line; do
        echo "  $line"
    done
else
    echo "Session Completed | No changes"
fi

# 简要提醒
echo ""
echo "Reminder: 确保讨论结论已写入 planning/，关键发现记录到 findings.md"

exit 0
