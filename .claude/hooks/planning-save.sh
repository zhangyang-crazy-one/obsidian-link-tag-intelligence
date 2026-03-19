#!/bin/bash
# 规划文件保存 Hook
# 触发条件：Stop 事件，保存当前进度

echo "[Hook] 保存规划进度..."

# 规划文件列表
PLANNING_FILES=(
    "planning/task_plan.md"
    "planning/progress.md"
    "planning/findings.md"
)

SAVED=0
for file in "${PLANNING_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "[Hook] 已保存: $file"
        SAVED=$((SAVED + 1))
    fi
done

echo "[Hook] 规划文件保存完成 ($SAVED 个文件)"

# 如果不存在规划文件，创建基本结构
if [ ! -f "planning/task_plan.md" ]; then
    mkdir -p planning
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
    echo "[Hook] 已创建 planning/task_plan.md 模板"
fi

exit 0
