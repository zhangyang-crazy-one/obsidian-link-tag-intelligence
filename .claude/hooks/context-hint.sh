#!/bin/bash
# UserPromptSubmit Hook: 注入项目上下文
# 当用户提交提示词时，自动注入相关项目信息

# 读取 JSON 输入
input=$(cat)

# 提取用户提示词
prompt=$(echo "$input" | grep -o '"prompt":"[^"]*"' | head -1 | sed 's/"prompt":"//;s/"$//')

# 检查提示词中的关键词，注入相关上下文
context=""

# Obsidian 相关
if echo "$prompt" | grep -qi "obsidian\|plugin\|vault"; then
    context="$context\n[Obsidian] 当前在 Obsidian 插件开发项目中。使用 Vault.process() 而非 read+modify。"
fi

# TypeScript 相关
if echo "$prompt" | grep -qi "typescript\|type\|interface"; then
    context="$context\n[TypeScript] 使用 strict mode，遵循项目 .tsconfig.json 配置。"
fi

# 测试相关
if echo "$prompt" | grep -qi "test\|测试\|spec"; then
    context="$context\n[测试] 使用 Vitest，运行 npm test。"
fi

# 构建相关
if echo "$prompt" | grep -qi "build\|构建\|deploy"; then
    context="$context\n[构建] 使用 esbuild，运行 npm run build。"
fi

# 如果有上下文，输出到 stdout
if [ -n "$context" ]; then
    echo -e "$context"
fi

exit 0
