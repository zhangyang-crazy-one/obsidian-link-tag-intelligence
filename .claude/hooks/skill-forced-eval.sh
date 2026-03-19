#!/bin/bash
# skill-forced-eval.sh - 技能路由钩子（优化版）
# 触发: UserPromptSubmit
# 目标: 更精准匹配技能、控制激活数量、输出简洁可执行提示

export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

# 全局错误兜底：任何未捕获的错误都不应导致非零退出
trap 'echo "$(date +%H:%M:%S) skill-forced-eval.sh trapped exit=$?" >> /tmp/claude-hook-debug/hook.log 2>/dev/null; exit 0' ERR

raw_input=""

# 优先从 stdin 读取
if [ ! -t 0 ]; then
    raw_input=$(timeout 3 cat 2>/dev/null || true)
fi

# 其次从环境变量
if [ -z "$raw_input" ]; then
    raw_input="${CLAUDE_USER_PROMPT:-}"
fi

# 其次从参数读取
if [ -z "$raw_input" ] && [ $# -gt 0 ]; then
    raw_input="$1"
fi

if [ -z "$raw_input" ]; then
    exit 0
fi

# 从 JSON 中提取 prompt 字段（Claude Code 传入的是 JSON）
user_prompt=$(echo "$raw_input" | python3 -c '
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get("prompt", data.get("content", "")))
except:
    print(sys.stdin.read() if hasattr(sys.stdin, "read") else "")
' 2>/dev/null)

# 如果 JSON 解析失败，用原始输入
if [ -z "$user_prompt" ]; then
    user_prompt="$raw_input"
fi

# 斜杠命令跳过
if [[ "$user_prompt" =~ ^/[a-zA-Z]+ ]]; then
    echo "[Hook] slash command detected, skip skill routing: ${user_prompt%% *}"
    exit 0
fi

if [ -z "$user_prompt" ]; then
    exit 0
fi

prompt_lower=$(echo "$user_prompt" | tr '[:upper:]' '[:lower:]')

# First-trigger-only optimization: only output on first prompt per session
FIRST_TRIGGER_FLAG="/tmp/.skill-eval-first-trigger-$PPID"
if [ -f "$FIRST_TRIGGER_FLAG" ]; then
    exit 0
fi
touch "$FIRST_TRIGGER_FLAG"

# ============================================
# Skill registry
# ============================================

declare -A SKILLS
SKILLS=(
    ["spec-interview"]="需求规格访谈"
    ["planning-with-files"]="文件规划和任务管理"
    ["context7"]="官方文档查询"
    ["web-research"]="联网调研"
    ["diagram-maker"]="图表生成"
    ["decision-matrix"]="决策矩阵"
    ["ui-ux-pro-max"]="UI/UX 设计"
    ["ai-integration"]="AI 服务集成"
    ["self-improvement"]="自我改进与经验沉淀"
    ["gog"]="Google Workspace CLI"
    ["searxng-search"]="本地隐私搜索"
    ["scheme-validator"]="方案验证审查"
    ["obsidian"]="Obsidian 笔记管理"
    ["freecad-house-design-workflow"]="FreeCAD 住宅设计"
    ["xiaohongshu-mcp-workflow"]="小红书工作流"
    ["token-budget-audit"]="Token 预算审计与优化"
    ["bug-debug"]="问题排查调试"
    ["markdown-to-pdf"]="Markdown 转 PDF"
    ["mcp-tools"]="MCP 工具开发"
    ["notebooklm-workflow"]="NotebookLM 工作流"
    ["platform-build"]="Tauri 打包构建"
    ["rag-vectordb"]="RAG 向量数据库"
    ["skill-seekers-cli"]="Skill Seekers CLI"
    ["strategic-compact"]="上下文压缩提醒"
    ["tauri-workflow"]="Tauri 全栈开发"
)

declare -A SKILL_KEYWORDS
SKILL_KEYWORDS["spec-interview"]="spec specification interview 需求 规格 讨论 方案 选型 clarify define requirements"
SKILL_KEYWORDS["planning-with-files"]="plan planning task project 任务 规划 记录 文件 multi-step"
SKILL_KEYWORDS["context7"]="context7 docs api library 官方文档 use context7 query 查询"
SKILL_KEYWORDS["web-research"]="research search 调研 搜索 趋势 trend latest 最新 调研一下 web-search deep-research deep research deep dive 报告 竞品 对比"
SKILL_KEYWORDS["diagram-maker"]="diagram 图表 架构图 flowchart 时序图 mermaid 类图 状态图 mindmap"
SKILL_KEYWORDS["decision-matrix"]="compare 对比 决策 decision 评估 evaluate matrix 矩阵 打分"
SKILL_KEYWORDS["ui-ux-pro-max"]="ui ux design 界面 交互 视觉 color typography font"
SKILL_KEYWORDS["ai-integration"]="ai llm 大模型 gemini ollama openai chat generate 对话"
SKILL_KEYWORDS["self-improvement"]="self-improving self-improvement learnings learning 错误 报错 失败 异常 debug 排查 纠正 修正 wrong actually outdated 知识过期 改进 复盘 lessons learned"
SKILL_KEYWORDS["gog"]="gog gmail calendar drive contacts sheets docs google workspace google mail google calendar google drive google docs 邮件 日历 网盘 联系人 表格 文档"
SKILL_KEYWORDS["searxng-search"]="searxng 本地搜索 隐私搜索 聚合搜索 自托管搜索 local search privacy search"
SKILL_KEYWORDS["scheme-validator"]="验证方案 方案审查 设计评审 文档验收 validate plan check scheme spec review design review"
SKILL_KEYWORDS["obsidian"]="obsidian vault wikilink callout canvas base 笔记 note-taking"
SKILL_KEYWORDS["freecad-house-design-workflow"]="freecad 住宅 房屋设计 户型 house design floor plan 建模"
SKILL_KEYWORDS["xiaohongshu-mcp-workflow"]="小红书 xiaohongshu rednote 发小红书 二维码登录"
SKILL_KEYWORDS["token-budget-audit"]="token budget audit 优化 上下文不够 token审计 配置瘦身 减少消耗 context optimization reduce tokens slim config context window 预算"
SKILL_KEYWORDS["bug-debug"]="bug 报错 错误 异常 调试 排查 问题 崩溃 performance 慢 tauri rust"
SKILL_KEYWORDS["markdown-to-pdf"]="markdown to pdf md2pdf mermaid to pdf 导出pdf"
SKILL_KEYWORDS["mcp-tools"]="mcp tools protocol server 工具 开发"
SKILL_KEYWORDS["notebooklm-workflow"]="notebooklm nlm-local research import notebook query"
SKILL_KEYWORDS["platform-build"]="打包 构建 tauri 安装包 exe dmg deb asar cargo rustup"
SKILL_KEYWORDS["rag-vectordb"]="rag 向量 检索 知识库 embedding chunk 相似性搜索"
SKILL_KEYWORDS["skill-seekers-cli"]="skill-seekers skill-seeker pdf github scrape 文档抓取 仓库分析"
SKILL_KEYWORDS["strategic-compact"]="compact 压缩 上下文 阶段切换 里程碑 milestone"
SKILL_KEYWORDS["tauri-workflow"]="tauri rust cargo ipc invoke listen react 前端 组件 hooks"

LIBRARY_KEYWORDS=(
    "react-query" "tanstack" "zustand" "jotai" "recoil" "redux"
    "next.js" "nextjs" "nuxt" "svelte" "vue" "angular"
    "tailwindcss" "shadcn" "radix" "chakra" "antd" "material-ui" "mui"
    "zod" "yup" "formik" "react-hook-form"
    "axios" "swr" "trpc" "graphql"
    "vite" "webpack" "esbuild" "rollup" "turbopack"
    "express" "fastify" "nest" "koa"
    "prisma" "drizzle" "typeorm" "sequelize"
    "vitest" "jest" "playwright" "cypress"
)

MAX_ACTIVATIONS=3

declare -A MATCH_COUNTS
declare -A MATCHED_KEYWORDS
declare -a SORTED_SKILLS
declare -a SELECTED_SKILLS

check_library_mentions() {
    local mentioned=()
    for lib in "${LIBRARY_KEYWORDS[@]}"; do
        if [[ "$prompt_lower" == *"$lib"* ]]; then
            mentioned+=("$lib")
        fi
    done
    echo "${mentioned[@]}"
}

skill_exists() {
    local skill="$1"
    if [ -f ".claude/skills/${skill}/SKILL.md" ] || [ -f ".codex/skills/${skill}/SKILL.md" ]; then
        return 0
    fi
    return 1
}

in_selected() {
    local target="$1"
    local s
    for s in "${SELECTED_SKILLS[@]}"; do
        if [ "$s" = "$target" ]; then
            return 0
        fi
    done
    return 1
}

evaluate_skills() {
    local skill keywords keyword match_count matched

    for skill in "${!SKILLS[@]}"; do
        keywords="${SKILL_KEYWORDS[$skill]}"
        match_count=0
        matched=""

        for keyword in $keywords; do
            if [[ "$prompt_lower" == *"$keyword"* ]]; then
                match_count=$((match_count + 1))
                matched="$matched $keyword"
            fi
        done

        # Scenario boosts for more stable routing.
        if [ "$skill" = "self-improvement" ] && [[ "$prompt_lower" =~ (错误|报错|失败|异常|纠正|修正|wrong|actually|outdated|复盘) ]]; then
            match_count=$((match_count + 2))
            matched="$matched error-signal"
        fi

        if [ "$skill" = "web-research" ] && [[ "$prompt_lower" =~ (调研|research|deep[[:space:]]research|趋势|最新|竞品|报告|对比) ]]; then
            match_count=$((match_count + 2))
            matched="$matched research-signal"
        fi

        if [ "$match_count" -gt 0 ]; then
            MATCH_COUNTS["$skill"]="$match_count"
            MATCHED_KEYWORDS["$skill"]="$(echo "$matched" | xargs)"
        fi
    done

    if [ "${#MATCH_COUNTS[@]}" -gt 0 ]; then
        mapfile -t SORTED_SKILLS < <(
            for skill in "${!MATCH_COUNTS[@]}"; do
                echo "${MATCH_COUNTS[$skill]}|$skill"
            done | sort -t'|' -rn -k1,1 | awk -F'|' '{print $2}'
        )
    fi
}

pick_skills() {
    local skill

    for skill in "${SORTED_SKILLS[@]}"; do
        if ! skill_exists "$skill"; then
            continue
        fi
        SELECTED_SKILLS+=("$skill")
        if [ "${#SELECTED_SKILLS[@]}" -ge "$MAX_ACTIVATIONS" ]; then
            break
        fi
    done
}

mentioned_libraries=($(check_library_mentions))
evaluate_skills
pick_skills

# If external libs are mentioned, force include context7 when available.
if [ "${#mentioned_libraries[@]}" -gt 0 ] && skill_exists "context7" && ! in_selected "context7"; then
    SELECTED_SKILLS+=("context7")
fi

echo "## Skill Router"
if [ "${#SELECTED_SKILLS[@]}" -gt 0 ]; then
    echo "- 激活技能: ${SELECTED_SKILLS[*]}"
else
    echo "- 无匹配技能"
fi

if [ "${#mentioned_libraries[@]}" -gt 0 ]; then
    echo "- 外部库: ${mentioned_libraries[*]} (先查 Context7)"
fi

exit 0
