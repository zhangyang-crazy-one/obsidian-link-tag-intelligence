---
name: context7
version: 1.0.0
description: |
  Context7 MCP 官方文档查询工具。

  触发场景：
  - 查询第三方库的官方文档和 API
  - 获取最新的代码示例和最佳实践
  - 版本特定的文档查询

  触发词：context7、文档、API、库、官方文档、查询文档、use context7
---

# Context7 MCP 文档查询规范

## 技术概述

Context7 是 Upstash 提供的 MCP 服务器，为 AI 编码助手提供实时、版本特定的官方文档。

### 核心能力

- **实时文档**: 直接从官方源获取最新文档
- **版本匹配**: 自动匹配库的版本
- **代码示例**: 提供可直接使用的代码示例
- **多库支持**: 支持 1000+ 流行库

### 可用工具

| 工具 | 功能 |
|------|------|
| `resolve-library-id` | 将库名转换为 Context7 兼容的 ID |
| `query-docs` | 使用库 ID 查询文档 |

## 使用场景

### 场景 1: 查询库的使用方法

```
用户: 如何使用 React useEffect？use context7
```

```typescript
// AI 会自动使用 Context7 查询 React 文档
```

### 场景 2: 显式指定库

```
用户: 用 Context7 查询 Supabase 的认证方法
```

```typescript
// 使用 resolve-library-id 获取 Supabase 的库 ID
// 然后使用 query-docs 查询认证相关文档
```

### 场景 3: 版本特定查询

```
用户: Next.js 14 的 middleware 如何配置？use context7
```

## 集成方式

### 方式 1: 在 prompts 中添加 `use context7`

```
How do I set up Next.js 14 middleware? use context7
```

### 方式 2: 手动调用工具

```typescript
// 1. 先解析库 ID
const library = await resolveLibraryId('react');

// 2. 再查询文档
const docs = await queryDocs({
  libraryId: '/facebook/react',
  query: 'useEffect hook best practices'
});
```

## 支持的热门库

| 类别 | 库 |
|------|------|
| 前端框架 | Next.js, React, Vue, Svelte |
| 后端/数据库 | Supabase, MongoDB, PostgreSQL |
| 云服务 | Cloudflare Workers, AWS SDK |
| AI/ML | OpenAI, Anthropic, LangChain |

## MCP 配置

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
```

## 与 mcp-tools 技能的协同

Context7 与 mcp-tools 技能协同工作：
- **mcp-tools**: 负责 MCP 服务器配置和管理
- **context7**: 专注于文档查询功能

## 最佳实践

1. **主动添加 `use context7`**: 当询问第三方库 API 时，主动添加此提示
2. **指定版本**: 如需特定版本信息，在问题中明确说明
3. **验证文档时效性**: Context7 提供版本匹配，但建议验证关键信息

## 禁止事项

- ❌ 禁止假设 API 行为，应查询文档确认
- ❌ 禁止使用过时的文档（指定版本）
- ❌ 忽略文档中的废弃警告

## 参考资源

- 官方仓库: https://github.com/upstash/context7
- 库目录: https://context7.com/libs

## 检查清单

- [ ] 是否主动使用 `use context7` 查询第三方库
- [ ] 是否指定了正确的版本
- [ ] 是否验证了关键 API 的行为
- [ ] 是否提供了代码示例来源
