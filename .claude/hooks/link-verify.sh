#!/bin/bash
# 链接验证 Hook
# 触发条件：Write .md 文件时

FILE_PATH="$1"

if [ -z "$FILE_PATH" ]; then
    FILE_PATH=$(cat)
fi

if [ ! -f "$FILE_PATH" ]; then
    exit 0
fi

echo "[Hook] 验证文档链接: $(basename $FILE_PATH)"

# 检查 Markdown 链接格式
LINKS=$(grep -oE '\[.+?\]\(.+?\)' "$FILE_PATH" 2>/dev/null | wc -l)
if [ "$LINKS" -gt 0 ]; then
    echo "[Hook] 发现 $LINKS 个 Markdown 链接"
    
    # 检查本地链接
    LOCAL_LINKS=$(grep -oE '\[.+?\]\(\./.+?\)' "$FILE_PATH" 2>/dev/null | wc -l)
    if [ "$LOCAL_LINKS" -gt 0 ]; then
        echo "[Hook] 发现 $LOCAL_LINKS 个本地链接"
    fi
    
    # 检查引用格式
    REF_LINKS=$(grep -oE '\]\[.+?\]' "$FILE_PATH" 2>/dev/null | wc -l)
    if [ "$REF_LINKS" -gt 0 ]; then
        # 检查引用定义是否存在
        DEF_COUNT=$(grep -cE '^\[.+?\]:' "$FILE_PATH" 2>/dev/null || echo "0")
        if [ "$DEF_COUNT" -lt "$REF_LINKS" ]; then
            echo "[Hook] ⚠️  部分引用链接缺少定义 (定义数: $DEF_COUNT, 引用数: $REF_LINKS)"
        fi
    fi
fi

# 检查来源 URL
URLS=$(grep -oE 'https?://[^ )]+' "$FILE_PATH" 2>/dev/null | wc -l)
if [ "$URLS" -gt 0 ]; then
    echo "[Hook] 发现 $URLS 个 URL 引用"
fi

echo "[Hook] ✅ 链接验证完成"
exit 0
