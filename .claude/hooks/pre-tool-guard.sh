#!/bin/bash
# pre-tool-guard.sh - PreToolUse 综合守卫钩子 (Brain-storm Linux版)
# 触发时机: PreToolUse（AI 使用工具前）
# 功能: Brain-storm 模式适配 + 安全检查

export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

# 调试：启用 ERR trap
DEBUG_DIR="/tmp/claude-hook-debug"
mkdir -p "$DEBUG_DIR"
exec 2>>"$DEBUG_DIR/pre-tool-guard.log"

echo "$(date +%H:%M:%S) [START] tool=${CLAUDE_TOOL_NAME:-} args_len=${#CLAUDE_TOOL_ARGS}" >> "$DEBUG_DIR/pre-tool-guard.log"

# ERR trap for debugging
trap 'echo "$(date +%H:%M:%S) [ERROR] exit=$?" >> "$DEBUG_DIR/pre-tool-guard.log" ; exit 0' ERR

tool_name="${CLAUDE_TOOL_NAME:-}"
tool_name_lower=$(echo "$tool_name" | tr '[:upper:]' '[:lower:]')

# ============================================
# 第一部分：安全检查（改进版）
# ============================================

parse_bash_command() {
    local command=""
    local target_file=""
    args_str="${CLAUDE_TOOL_ARGS:-}"

    # 如果 CLAUDE_TOOL_ARGS 是 JSON，尝试解析 command
    if [ -n "$args_str" ] && echo "$args_str" | grep -q '"command"'; then
        parsed_command=$(python3 -c 'import json,sys
raw=sys.stdin.read()
try:
    data=json.loads(raw)
    cmd=data.get("command", "")
    if isinstance(cmd, list):
        cmd=" ".join(str(x) for x in cmd)
    if isinstance(cmd, str):
        print(cmd)
except Exception:
    pass' <<<"$args_str" 2>/dev/null)
        if [ -n "$parsed_command" ]; then
            args_str="$parsed_command"
        fi
    fi

    # 如果参数为空，尝试从 stdin 读取
    if [ -z "$args_str" ] && [ ! -t 0 ]; then
        stdin_content=$(cat 2>/dev/null)
        if [ -n "$stdin_content" ]; then
            # 尝试 JSON 解析
            if echo "$stdin_content" | grep -q '"command"'; then
                args_str=$(echo "$stdin_content" | python3 -c "import sys, json; print(json.load(sys.stdin).get('command', ''))" 2>/dev/null)
            else
                args_str="$stdin_content"
            fi
        fi
    fi

    # 如果还是空，从位置参数读取
    if [ -z "$args_str" ] && [ $# -gt 0 ]; then
        args_str="$*"
    fi

    if [ -n "$args_str" ]; then
        dash_found=false
        for arg in $args_str; do
            if [ "$arg" = "--" ]; then
                dash_found=true
                continue
            fi
            if [ "$dash_found" = false ]; then
                command="$command $arg"
            else
                if [[ "$arg" =~ ^/ ]] || [[ "$arg" =~ ^[a-z]: ]]; then
                    target_file="$arg"
                    break
                fi
            fi
        done
    fi

    command=$(echo "$command" | sed 's/^[[:space:]]*//')
    echo "$command|$target_file"
}

if [[ "$tool_name_lower" =~ ^bash$ ]]; then
    parsed=$(parse_bash_command "$@")
    command=$(echo "$parsed" | cut -d'|' -f1)
    target_file=$(echo "$parsed" | cut -d'|' -f2)
    command_lower=$(echo "$command" | tr '[:upper:]' '[:lower:]')

    if [ -n "$command" ] && [ "$command" != "bash" ]; then
        dangerous_block=false
        danger_message=""

        # 高危命令检测（保持原有逻辑）
        if echo "$command_lower" | grep -qE '(^|[[:space:]])(sudo|su|chown\s+[0-7]+|chmod\s+777|del\s|rm\s+-rf|rm\s+-r\s*/|dd\s+if=|mkfs|dd\s+if=/dev/urandom|fdisk|parted|lvm|pvcreate|vgcreate|lvcreate)'; then
            dangerous_block=true
            danger_message="High-risk command detected: $command"
        # 数据库危险操作检测（修复版：检测所有 DELETE 和 DROP）
        elif echo "$command_lower" | grep -qE '(^|[[:space:]])(drop\s+(database|table|index|view)|truncate\s+table|delete\s+from|delete\s+.*where)'; then
            dangerous_block=true
            danger_message="Dangerous database operation detected: $command"
        fi

        if [ "$dangerous_block" = true ]; then
            echo "{\"decision\":\"block\",\"reason\":\"$danger_message\",\"command\":\"${command:0:100}\",\"severity\":\"block\"}"
            exit 1
        fi

        if [ -z "$target_file" ] && [ -n "$command" ]; then
            for token in $command; do
                token_lower=$(echo "$token" | tr '[:upper:]' '[:lower:]')
                case "$token_lower" in
                    *.env|*.env.local|.env|.env.local|*password*|*secret*)
                        target_file="$token"
                        break
                        ;;
                esac
            done
        fi

        if [ -n "$target_file" ]; then
            target_file_lower=$(echo "$target_file" | tr '[:upper:]' '[:lower:]')
            # 同时检测绝对路径和相对路径的敏感文件
            case "$target_file_lower" in
                *.env|*.env.local|*password*|*secret*|.env|.env.local)
                    echo "{\"decision\":\"warn\",\"reason\":\"Target file may contain sensitive data: $target_file\",\"targetFile\":\"${target_file:0:100}\",\"severity\":\"warning\"}"
                    ;;
            esac
        fi
    fi
fi

# ============================================
# 第二部分：精简提醒（仅首次触发，避免重复消耗 token）
# ============================================

# 使用临时文件标记，每会话仅提醒一次
REMINDER_FLAG="/tmp/.brainstorm-guard-reminded-$$"

if [ ! -f "$REMINDER_FLAG" ] && [[ "$tool_name_lower" =~ ^(write|edit|bash)$ ]]; then
    touch "$REMINDER_FLAG"
    echo "[Brain-storm] 文档输出到 planning/ 目录，关键发现记录到 findings.md"
fi

echo "$(date +%H:%M:%S) [END] exit=0" >> "$DEBUG_DIR/pre-tool-guard.log"
exit 0
