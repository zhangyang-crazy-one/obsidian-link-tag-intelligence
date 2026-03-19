#!/bin/bash
# Mermaid 图表语法验证 Hook
# 触发条件：Write .mermaid 文件时

FILE_PATH="$1"

if [ -z "$FILE_PATH" ]; then
    # 从 stdin 读取
    FILE_PATH=$(cat)
fi

if [ ! -f "$FILE_PATH" ]; then
    echo "[Hook] Mermaid 验证: 文件不存在"
    exit 0
fi

echo "[Hook] 验证 Mermaid 语法: $FILE_PATH"

# 基础语法检查
ERRORS=0

# 检查必要元素
if ! grep -q "^mermaid" "$FILE_PATH" 2>/dev/null; then
    echo "[Hook] ⚠️  缺少 mermaid 声明"
    ERRORS=$((ERRORS + 1))
fi

# 检查 graph TD/TB/LR/BT
if grep -q "graph TD\|graph TB\|graph LR\|graph BT" "$FILE_PATH"; then
    # 检查节点定义格式
    if ! grep -qE "^[A-Z][a-zA-Z]*\[" "$FILE_PATH" 2>/dev/null; then
        echo "[Hook] ⚠️  流程图节点格式可能不正确 (应使用 A[标签])"
    fi
fi

# 检查 sequenceDiagram
if grep -q "sequenceDiagram" "$FILE_PATH"; then
    if ! grep -q "participant" "$FILE_PATH"; then
        echo "[Hook] ⚠️  时序图缺少 participant 定义"
    fi
fi

# 检查 erDiagram
if grep -q "erDiagram" "$FILE_PATH"; then
    if ! grep -q "||--o{" "$FILE_PATH"; then
        echo "[Hook] ⚠️  ER 图缺少关系定义 (应使用 ||--o{)"
    fi
fi

# 检查括号匹配
OPEN_PARENS=$(grep -o "(" "$FILE_PATH" | wc -l)
CLOSE_PARENS=$(grep -o ")" "$FILE_PATH" | wc -l)
if [ "$OPEN_PARENS" != "$CLOSE_PARENS" ]; then
    echo "[Hook] ⚠️  括号不匹配: ($OPEN_PARENS 个 '(' vs $CLOSE_PARENS 个 ')')"
    ERRORS=$((ERRORS + 1))
fi

if [ $ERRORS -eq 0 ]; then
    echo "[Hook] ✅ Mermaid 语法检查通过"
fi

exit 0
