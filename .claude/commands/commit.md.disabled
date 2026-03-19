# /commit - 完成任务并提交

作为提交助手，验证任务完成状态、更新文档并提交代码。

## 使用方式

```
/commit [可选: 提交信息]
```

示例：
```
/commit
/commit feat: 完成用户认证功能
```

## 执行流程

### 阶段 1: 完成检查

读取 `planning/task_plan.md` 检查任务状态：

1. **阶段完成检查**
   - 检查所有阶段是否标记为 `complete`
   - 识别未完成的任务项

2. **如有未完成项**
   ```
   ⚠️ 检测到未完成任务：
   
   ### Phase 3: Implementation
   - [ ] 任务 A (pending)
   - [ ] 任务 B (pending)
   
   是否继续提交？(y/n)
   ```

3. **5-Question 验证** (来自 planning-with-files)
   - Where am I? → 当前阶段
   - Where am I going? → 剩余阶段
   - What's the goal? → 目标陈述
   - What have I learned? → findings.md
   - What have I done? → progress.md

### 阶段 2: 更新文档

1. **更新 `docs/PROJECT_STATUS.md`**
   - 标记已完成的功能
   - 更新开发进度百分比
   - 记录完成时间

2. **更新 `docs/TODO.md`**
   - 标记完成的任务 `[x]`
   - 移除或归档已完成项

3. **更新 `planning/progress.md`**
   - 记录本次会话完成的工作
   - 添加测试结果（如有）

### 阶段 3: 代码审查 (可选)

调用 `@code-reviewer` 进行快速审查：

1. **检查项**
   - 代码风格一致性
   - 明显的 bug 或问题
   - 类型安全（TypeScript）
   - 安全风险

2. **如发现问题**
   ```
   ⚠️ 代码审查发现以下问题：
   
   1. [问题描述]
      文件: src/xxx.ts:123
      建议: [修复建议]
   
   是否先修复再提交？(y/n)
   ```

### 阶段 4: Git 提交

1. **生成提交信息**
   - 基于 `planning/task_plan.md` 的目标
   - 基于变更的文件列表
   - 遵循 Conventional Commits 格式

2. **提交格式**
   ```
   <type>(<scope>): <subject>
   
   <body>
   
   <footer>
   ```

   类型:
   - `feat`: 新功能
   - `fix`: Bug 修复
   - `docs`: 文档更新
   - `style`: 代码格式
   - `refactor`: 重构
   - `test`: 测试
   - `chore`: 构建/工具

3. **执行提交**
   ```bash
   git add .
   git commit -m "<提交信息>"
   ```

### 阶段 5: 清理

1. **归档 planning 文件** (可选)
   - 如任务完全完成，可选择归档到 `planning/archive/`

2. **重置任务计划** (可选)
   - 为下一个任务准备空白模板

## 输出格式

```markdown
# ✅ 任务完成并提交

## 📋 完成检查

| 检查项 | 状态 |
|--------|------|
| 任务完成 | ✅ 5/5 阶段完成 |
| 文档更新 | ✅ PROJECT_STATUS.md 已更新 |
| 代码审查 | ✅ 无问题 |
| Git 提交 | ✅ 已提交 |

## 📝 提交信息

```
feat(auth): 实现用户认证功能

- 添加登录/注册页面
- 集成 JWT token 验证
- 添加会话持久化

Closes #123
```

## 📊 变更统计

| 类型 | 数量 |
|------|------|
| 新增 | 8 文件 |
| 修改 | 3 文件 |
| 删除 | 1 文件 |

## 🔄 Git 状态

```
[main abc1234] feat(auth): 实现用户认证功能
 12 files changed, 456 insertions(+), 23 deletions(-)
```

## 🎯 下一步

- 运行 `/next` 获取下一个任务建议
- 运行 `/start` 查看项目状态
```

## 注意事项

1. **先检查后提交**: 确保任务完成再提交
2. **文档同步**: 代码和文档一起更新
3. **有意义的提交信息**: 说明 "为什么" 而不是 "什么"
4. **小步提交**: 每个功能点独立提交

## 与其他命令配合

| 命令 | 时机 | 用途 |
|------|------|------|
| `/next` | 提交后 | 获取下一个任务 |
| `/progress` | 提交前 | 确认当前进度 |
| `/update-status` | 提交时自动调用 | 更新状态文档 |
