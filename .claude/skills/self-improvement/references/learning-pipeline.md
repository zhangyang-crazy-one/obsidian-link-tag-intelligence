# Learning Pipeline

只在需要 automatic observation、instinct、confidence、evolve/export/import 细节时读取本文件。

## 流程总览

```text
Session activity
  -> hooks/observe.js
  -> observations.jsonl
  -> instincts (personal / inherited)
  -> evolve / export / import
  -> skills / commands / agents
```

## 数据目录

默认数据根目录按运行环境自动选择：

- Claude：`~/.claude/homunculus`
- Codex：`~/.codex/self-improvement`

也可以通过 `SELF_IMPROVEMENT_HOME` 覆盖。

目录结构：

```text
<data-root>/
├── observations.jsonl
├── instincts/
│   ├── personal/
│   └── inherited/
└── evolved/
    └── skills/
```

## instinct 模型

一个 instinct 表示一个可复用的小行为：

```yaml
---
id: prefer_uv_over_pip
trigger: "when managing Python dependencies in this repo"
confidence: 0.8
domain: "workflow"
source: "session-observation"
---

# Prefer uv over pip

## Action
Use uv or the project .venv instead of pip --user.

## Evidence
- User corrected the workflow twice
```

原则：

- 原子：一个 trigger 对应一个 action
- 可追溯：有 evidence 或 observations
- 可加权：`confidence` 表示确信度

## confidence 约定

- `0.3`：初步观察
- `0.5`：中等确信
- `0.7`：强信号，可默认采用
- `0.9`：近乎确定，属于核心行为

## CLI 命令

以下命令默认在当前技能目录内执行；如果你从仓库根目录执行，请替换成当前 agent 对应的 skill 路径。

```bash
node scripts/instinct-cli.js status
node scripts/instinct-cli.js observe
node scripts/instinct-cli.js evolve
node scripts/instinct-cli.js export --output /tmp/instincts.json
node scripts/instinct-cli.js import /tmp/instincts.json
```

命令用途：

- `status`：查看当前 instincts
- `observe`：处理 observation 文件
- `evolve`：把足够多的相关 instincts 聚成技能
- `export` / `import`：共享或迁移 instincts

## config.json

`config.json` 现在由 `self-improvement` 统一持有，主要控制：

- observation 文件名和归档策略
- instincts 阈值与目录
- evolve 的 cluster threshold
- Claude / Codex 的默认数据根目录

运行时可以用 `SELF_IMPROVEMENT_CONFIG` 指向其他配置文件。

## 隐私与安全

- observation 只保存在本地
- hook 会对常见敏感字段做脱敏
- 导出 instincts 时不要带出项目私有路径、token 或未脱敏输入
