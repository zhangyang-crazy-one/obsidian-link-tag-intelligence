---
name: self-improvement
version: 1.1.0
description: 记录用户纠正、失败复盘与稳定工作流，沉淀到 learnings/SQLite。
trigger: self improvement instinct evolve continuous learning 自我进化 复盘

# 自我进化

## 何时使用

- 用户纠正你，或明确提出应长期保留的偏好、约束、规则。
- 命令、工具、API、环境集成失败，而且这个失败值得下次避免。
- 你发现了非显而易见的更优做法，不应只留在当前会话里。
- 你要自动观测会话，把重复模式提炼成 instincts，再演化成更高层能力。

## 默认策略

1. 单次事件先写 `.learnings/`。
2. 跨轮次、跨项目的重要规则再写 SQLite memory。
3. 重复模式通过 hooks 自动观测，累计到 `observations.jsonl` 和 instincts。
4. 稳定模式再执行 `evolve` / `export` / `import`，不要把一次性噪音直接升级成技能。
5. `self-improvement` 是唯一主入口；不要再单独维护或触发 `continuous-learning-v2`。

## 核心能力

- 手动记录：`.learnings/LEARNINGS.md`、`.learnings/ERRORS.md`、`.learnings/FEATURE_REQUESTS.md`
- 提醒钩子：`scripts/activator.sh`
- 错误检测：`scripts/error-detector.sh`
- 自动观测：`hooks/observe.js`
- instinct / evolve 流水线：`scripts/instinct-cli.js`
- 技能提取：`scripts/extract-skill.sh`

## 常用工作流

### 1. 单次纠错或失败

- 先把事实和改进建议写进 `.learnings/`
- 如果是长期规则，再同步到 SQLite memory

### 2. 自动观测与 instinct 演化

以下命令默认在当前技能目录内执行；如果你从仓库根目录执行，请加上当前 agent 对应的 skill 路径前缀。

```bash
node hooks/observe.js pre
node hooks/observe.js post
node scripts/instinct-cli.js status
node scripts/instinct-cli.js evolve
```

### 3. 需要 hooks 配置

读取 [references/hooks-setup.md](references/hooks-setup.md)。

### 4. 需要 instinct / confidence / evolve 细节

读取 [references/learning-pipeline.md](references/learning-pipeline.md)。

### 5. 需要 OpenClaw 集成

读取 [references/openclaw-integration.md](references/openclaw-integration.md)。

## 输出要求

- 先记录事实，再给建议动作。
- 区分一次性错误和可复用模式。
- 自动观测脚本默认静默，不打断主工作流。
- 导出 instincts 或演化技能时，不要带出项目私有路径、秘钥或敏感内容。
