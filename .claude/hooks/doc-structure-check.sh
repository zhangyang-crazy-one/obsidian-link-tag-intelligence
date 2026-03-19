#!/bin/bash
# 文档结构检查 Hook
# 触发条件：Write planning 目录下的 .md 文件时

FILE_PATH="$1"

if [ -z "$FILE_PATH" ]; then
    FILE_PATH=$(cat)
fi

if [ ! -f "$FILE_PATH" ]; then
    exit 0
fi

echo "[Hook] 检查文档结构: $(basename $FILE_PATH)"

# 获取文件所在目录
DIR_PATH=$(dirname "$FILE_PATH")
FILENAME=$(basename "$FILE_PATH")

# 检查是否为 brainstorming 目录
if echo "$DIR_PATH" | grep -q "brainstorms"; then
    TOPIC_DIR=$(basename "$DIR_PATH")
    
    case "$FILENAME" in
        "README.md")
            # 检查必要章节
            if ! grep -q "^## " "$FILE_PATH"; then
                echo "[Hook] ⚠️  README.md 缺少 ## 二级标题"
            fi
            ;;
        "requirements.md")
            # 检查是否为需求文档
            if ! grep -q -i "需求\|requirement" "$FILE_PATH"; then
                echo "[Hook] ⚠️  requirements.md 标题未包含 '需求'"
            fi
            ;;
        "alternatives.md")
            # 检查备选方案数量
            ALTERNATIVES=$(grep -c "^## " "$FILE_PATH" 2>/dev/null || echo "0")
            if [ "$ALTERNATIVES" -lt 3 ]; then
                echo "[Hook] ⚠️  alternatives.md 备选方案不足 3 个 (当前: $ALTERNATIVES)"
            fi
            ;;
        "comparison.md")
            # 检查决策矩阵
            if ! grep -q "| 维度" "$FILE_PATH" && ! grep -q "决策矩阵" "$FILE_PATH"; then
                echo "[Hook] ⚠️  comparison.md 缺少决策矩阵表格"
            fi
            ;;
        "decision.md")
            # 检查是否包含最终决策
            if ! grep -q "推荐\|决定\|选择" "$FILE_PATH"; then
                echo "[Hook] ⚠️  decision.md 未明确给出推荐方案"
            fi
            ;;
    esac
fi

# 检查是否为 design 目录
if echo "$DIR_PATH" | grep -q "designs"; then
    case "$FILENAME" in
        "README.md")
            if ! grep -q "^## " "$FILE_PATH"; then
                echo "[Hook] ⚠️  设计 README.md 缺少 ## 二级标题"
            fi
            ;;
        "architecture.md")
            if ! grep -q "graph TD\|graph LR\|erDiagram" "$FILE_PATH"; then
                echo "[Hook] ⚠️  architecture.md 缺少架构图 (mermaid)"
            fi
            ;;
        "api-spec.md")
            if ! grep -q "## POST\|## GET\|## PUT\|## DELETE" "$FILE_PATH"; then
                echo "[Hook] ⚠️  api-spec.md 缺少 API 端点定义"
            fi
            ;;
    esac
fi

echo "[Hook] ✅ 文档结构检查完成"
exit 0
