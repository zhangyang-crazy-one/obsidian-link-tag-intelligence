---
paths:
  - "**/*.md"
  - "**/*.ts"
  - "**/*.js"
---

# 安全规则

> 加载时机：PreToolUse（使用 Write/Edit 工具前）
> 适用范围：所有涉及敏感信息的代码操作

---

## 安全实践

<security>
严格的安全实践处理敏感信息。

### 环境变量（强制 MUST）

| 规则 | 说明 |
|------|------|
| 禁止硬编码 | **永远不要**在源代码中硬编码 API 密钥、密码、凭据或其他敏感信息 |
| 使用 .env | 所有环境特定配置**必须**通过 `.env` 文件管理 |
| 维护模板 | **必须**维护一个 `.env.template` 文件，记录所有必需的环境变量 |
| 占位符值 | `.env.template` **必须**包含占位符值，而非真实密钥 |

### .env.template 要求（强制 MUST）

当项目使用环境变量时：

1. 如果不存在，**创建** `.env.template`
2. 将所有新环境变量**添加**到 `.env.template`，附带描述性注释
3. 使用占位符格式：`VARIABLE_NAME=your_value_here` 或 `VARIABLE_NAME=`

**示例 `.env.template`**：

```bash
# Obsidian API 配置
OBSIDIAN_VAULT_PATH=/path/to/vault
OBSIDIAN_API_KEY=your_api_key_here

# 开发设置
NODE_ENV=development
```

### Gitignore（强制 MUST）

确保 `.gitignore` 包含：

```gitignore
# 环境变量文件
.env
.env.local
.env.*.local

# 任何包含真实凭据的文件
*.pem
*.key
credentials.json
```

### 安全检查清单

在提交代码前，验证：

```
□ 没有硬编码的密钥或密码
□ 所有敏感配置使用环境变量
□ .env.template 已更新（如有新变量）
□ .gitignore 包含所有敏感文件
□ 没有在日志中打印敏感信息
```

### 常见安全陷阱

| 陷阱 | 正确做法 |
|------|----------|
| `const API_KEY = "sk-xxx"` | `const API_KEY = process.env.API_KEY` |
| 日志打印密码 | 使用 `[REDACTED]` 替代敏感值 |
| URL 中包含凭据 | 使用请求头传递认证信息 |
| 硬编码数据库连接 | 使用环境变量配置连接字符串 |
</security>
