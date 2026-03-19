#!/bin/bash
# 会话完整初始化 Hook

echo "[Hook] 会话完整初始化..."

# 确保规划目录存在
mkdir -p planning/brainstorms
mkdir -p planning/designs
mkdir -p planning/designs/*/diagrams

# 检查规划文件
if [ ! -f "planning/task_plan.md" ]; then
    cat > planning/task_plan.md << 'TPL'
# 任务计划

## 当前状态
- 阶段: 待开始
- 开始时间: $(date '+%Y-%m-%d %H:%M:%S')

## 任务列表

## 决策记录

## 遇到的错误
| 错误 | 尝试 | 解决方案 |
|------|------|----------|
TPL
    echo "[Hook] 已创建 planning/task_plan.md"
fi

if [ ! -f "planning/progress.md" ]; then
    cat > planning/progress.md << 'TPL'
# 进度日志

## 会话历史

### $(date '+%Y-%m-%d %H:%M:%S')
- 会话开始
TPL
    echo "[Hook] 已创建 planning/progress.md"
fi

if [ ! -f "planning/findings.md" ]; then
    cat > planning/findings.md << 'TPL'
# 研究发现

## 发现记录

TPL
    echo "[Hook] 已创建 planning/findings.md"
fi

echo "[Hook] 会话初始化完成"
echo "📁 规划目录: planning/"
echo "📄 头脑风暴: planning/brainstorms/"
echo "📐 设计文档: planning/designs/"
echo "=========================================="

exit 0
