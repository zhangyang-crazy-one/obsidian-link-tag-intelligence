# Hook Setup

只在需要配置自动提醒、错误检测和 observation hooks 时读取本文件。

## 推荐组合

- `UserPromptSubmit` -> `scripts/activator.sh`
- `PreToolUse` -> `hooks/observe.js pre`
- `PostToolUse` -> `hooks/observe.js post`
- `PostToolUse (Bash)` -> `scripts/error-detector.sh`

这样可以同时覆盖：
- 会话内轻量提醒
- 100% 可靠的工具观测
- Bash 错误检测

## Claude Code

项目级 `.claude/settings.json` 示例：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/skills/self-improvement/scripts/activator.sh"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node ./.claude/skills/self-improvement/hooks/observe.js pre"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node ./.claude/skills/self-improvement/hooks/observe.js post"
          }
        ]
      },
      {
        "matcher": "tool == \"Bash\"",
        "hooks": [
          {
            "type": "command",
            "command": "./.claude/skills/self-improvement/scripts/error-detector.sh"
          }
        ]
      }
    ]
  }
}
```

## Codex CLI

项目级 `.codex/settings.json` 示例：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "./.codex/skills/self-improvement/scripts/activator.sh"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node ./.codex/skills/self-improvement/hooks/observe.js pre"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node ./.codex/skills/self-improvement/hooks/observe.js post"
          }
        ]
      },
      {
        "matcher": "tool == \"Bash\"",
        "hooks": [
          {
            "type": "command",
            "command": "./.codex/skills/self-improvement/scripts/error-detector.sh"
          }
        ]
      }
    ]
  }
}
```

## 环境变量

- `SELF_IMPROVEMENT_HOME`
  覆盖 observation / instincts / evolved 的数据根目录
- `SELF_IMPROVEMENT_CONFIG`
  覆盖默认 `config.json` 路径
- `SELF_IMPROVEMENT_DEBUG`
  设为 `true` 时输出 observation 调试信息

## 冒烟测试

### 1. observation hook

```bash
printf '%s' '{"tool":"Write","session_id":"demo","tool_input":{"content":"capture this"}}' \
  | SELF_IMPROVEMENT_HOME=/tmp/self-improvement-demo node hooks/observe.js pre
```

### 2. instinct status

```bash
SELF_IMPROVEMENT_HOME=/tmp/self-improvement-demo \
  node scripts/instinct-cli.js status
```

### 3. evolve / export / import

```bash
SELF_IMPROVEMENT_HOME=/tmp/self-improvement-demo \
  node scripts/instinct-cli.js evolve
SELF_IMPROVEMENT_HOME=/tmp/self-improvement-demo \
  node scripts/instinct-cli.js export --output /tmp/instincts.json
SELF_IMPROVEMENT_HOME=/tmp/self-improvement-demo \
  node scripts/instinct-cli.js import /tmp/instincts.json
```
