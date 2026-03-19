<!-- zh-localized -->
## 中文说明
- 功能：保存验证检查点
- 使用：`/checkpoint`

## 英文原文

# Checkpoint Command

在工作流中创建或验证检查点。

## 使用方式

`/checkpoint [create|verify|list] [name]`

## 创建检查点

创建检查点时：

1. 运行 `/verify quick` 确保当前状态干净
2. 使用检查点名称创建 git stash 或提交
3. 将检查点记录到 `.claude/checkpoints.log`：

```bash
echo "$(date +%Y-%m-%d-%H:%M) | $CHECKPOINT_NAME | $(git rev-parse --short HEAD)" >> .claude/checkpoints.log
```

4. 报告检查点已创建

## 验证检查点

验证检查点时：

1. 从日志读取检查点
2. 比较当前状态与检查点：
   - 检查点后新增的文件
   - 检查点后修改的文件
   - 测试通过率对比
   - 覆盖率对比

3. 报告：
```
检查点对比: $名称
============================
变更文件数: X
测试: +Y 通过 / -Z 失败
覆盖率: +X% / -Y%
构建: [通过/失败]
```

## 列出检查点

显示所有检查点，包括：
- 名称
- 时间戳
- Git SHA
- 状态（当前、落后、领先）

## 工作流

典型检查点流程：

```
[开始] --> /checkpoint create "feature-start"
   |
[实现] --> /checkpoint create "core-done"
   |
[测试] --> /checkpoint verify "core-done"
   |
[重构] --> /checkpoint create "refactor-done"
   |
[PR] --> /checkpoint verify "feature-start"
```

## 参数

$ARGUMENTS:
- `create <名称>` - 创建命名检查点
- `verify <名称>` - 验证命名检查点
- `list` - 显示所有检查点
- `clear` - 清除旧检查点（保留最近 5 个）
