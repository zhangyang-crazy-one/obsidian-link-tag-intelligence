#!/bin/bash
# 会话结束摘要 Hook

echo "=========================================="
echo "[Session End] 会话摘要"
echo "=========================================="

# 统计本次会话创建的文档
NEW_MD=$(find planning -name "*.md" -newer .claude/settings.json 2>/dev/null | wc -l)
NEW_MERMAID=$(find planning -name "*.mermaid" -newer .claude/settings.json 2>/dev/null | wc -l)

echo "📄 新建 Markdown 文档: $NEW_MD 个"
echo "📊 新建 Mermaid 图表: $NEW_MERMAID 个"

# 显示规划文件状态
if [ -f "planning/task_plan.md" ]; then
    echo "✅ task_plan.md 存在"
fi
if [ -f "planning/progress.md" ]; then
    echo "✅ progress.md 存在"
fi
if [ -f "planning/findings.md" ]; then
    echo "✅ findings.md 存在"
fi

echo "=========================================="
echo "[Session End] 会话结束"
echo "=========================================="

exit 0
