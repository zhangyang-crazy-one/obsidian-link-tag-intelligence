#!/bin/bash
# ccline-wrapper.sh - ccline wrapper 脚本 (Linux版)
# 功能: 自动解析用户目录，调用 ccline

# 设置 UTF-8 编码
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

# 获取用户主目录
user_home="${HOME:-}"
if [ -z "$user_home" ]; then
    user_home=$(eval echo ~"$USER")
fi

ccline_path="$user_home/.claude/ccline/ccline"

if [ -f "$ccline_path" ]; then
    timeout 5 "$ccline_path" 2>/dev/null || true
fi

exit 0
