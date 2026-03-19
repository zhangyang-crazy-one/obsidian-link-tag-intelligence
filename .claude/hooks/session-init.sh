#!/bin/bash
# session-init.sh - Brain-storm 会话初始化 (精简版)
# 触发时机: SessionStart
# 功能: 仅输出动态信息（静态信息已在 CLAUDE.md 中）

export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

now=$(date "+%Y/%m/%d %H:%M:%S")

echo "## Session Started: $now"
echo ""
echo "## Brain-storm 方案讨论模式"
echo ""

# 方案库统计（动态信息）
if [ -d "planning" ]; then
    brainstorm_count=$(find planning/brainstorms -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
    design_count=$(find planning/designs -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)

    echo "方案库: ${brainstorm_count} 个头脑风暴, ${design_count} 个详细设计"

    # 最近讨论
    recent=$(ls -td planning/brainstorms/*/ planning/designs/*/ 2>/dev/null | head -3)
    if [ -n "$recent" ]; then
        echo "最近讨论:"
        echo "$recent" | while read dir; do
            echo "- $(basename "$dir")"
        done
    fi
fi

echo ""
echo "快速开始: \`/brainstorm [主题]\` | 查看进度: \`/progress\`"

exit 0
