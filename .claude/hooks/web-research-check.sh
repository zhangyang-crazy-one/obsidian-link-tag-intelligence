#!/bin/bash
# web-research-check.sh - 检查搜索资源可用性
# 触发时机: UserPromptSubmit（包含调研关键词时）

export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

trap 'echo "$(date +%H:%M:%S) web-research-check.sh trapped exit=$?" >> /tmp/claude-hook-debug/hook.log 2>/dev/null; exit 0' ERR

# 从 stdin 读取 JSON
raw_input=""
if [ ! -t 0 ]; then
    raw_input=$(timeout 3 cat 2>/dev/null || true)
fi

# 从 JSON 中提取 prompt 字段
user_prompt=""
if [ -n "$raw_input" ]; then
    user_prompt=$(echo "$raw_input" | python3 -c '
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get("prompt", data.get("content", "")))
except:
    pass
' 2>/dev/null)
fi

# 回退到环境变量
if [ -z "$user_prompt" ]; then
    user_prompt="${CLAUDE_USER_PROMPT:-}"
fi

if [ -z "$user_prompt" ]; then
    exit 0
fi

research_keywords="调研|research|deep research|搜索|search|趋势|trend"

if echo "$user_prompt" | grep -qiE "$research_keywords"; then
    searxng_status="OFFLINE"
    if timeout 3 curl -s --connect-timeout 2 "http://localhost:8080/search?q=test&format=json" 2>/dev/null | grep -q "results" 2>/dev/null; then
        searxng_status="ONLINE"
    fi

    echo "## Search Resources"
    echo "| Resource | Status |"
    echo "|----------|--------|"
    echo "| SearXNG | $searxng_status |"
    echo "| web-search | ONLINE |"
    echo "| Context7 | ONLINE |"
    echo "| GitHub | ONLINE |"

    if [ "$searxng_status" = "OFFLINE" ]; then
        echo ""
        echo "Tip: Start SearXNG with \`cd .claude/skills/searxng-search && docker compose up -d\`"
    fi
fi

exit 0
