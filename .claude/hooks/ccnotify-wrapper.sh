#!/bin/bash
# ccnotify-wrapper.sh - ccnotify wrapper 脚本 (Linux版)
# 功能: 自动解析用户目录，调用 ccnotify.py
# 加固: 超时保护 + 错误兜底

# 设置 UTF-8 编码
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

trap 'echo "$(date +%H:%M:%S) ccnotify-wrapper.sh trapped exit=$?" >> /tmp/claude-hook-debug/hook.log 2>/dev/null; exit 0' ERR

event_type="${1:-}"

# 获取用户主目录
user_home="${HOME:-}"
if [ -z "$user_home" ]; then
    user_home=$(eval echo ~"$USER")
fi

ccnotify_path="$user_home/.claude/ccnotify/ccnotify.py"

if [ -f "$ccnotify_path" ]; then
    # stdin 透传给 ccnotify.py，加 10 秒超时保护
    timeout 10 python3 "$ccnotify_path" "$event_type" 2>/dev/null || true
fi

exit 0
