# 代码生成委派模板

仅在两件事同时满足时使用本文件：

- 当前运行环境支持委派、子代理或并行代理
- 用户明确要求 delegation、sub-agent work 或并行执行

## 目标

把已经收敛的设计方向落到具体文件，不阻塞主线程的其余工作。

## 输入要求

- 明确目标文件或目录范围。
- 给出既有技术栈、组件约束、设计令牌和交互要求。
- 指明必须保留的现有模式，例如命名、样式体系、状态管理方式。

## 约束

- 只修改分配给你的文件范围。
- 不要回滚他人的改动；如果遇到冲突，基于现状调整实现。
- 不要私自改框架、目录结构或设计方向。
- 返回结果时必须列出修改文件和运行过的验证命令。

## 提示词模板

```text
在给定文件范围内实现前端改动。

任务：
- <这里写明确实现目标，例如“把 Pencil 里的设置面板落成 React 组件”>

上下文：
- Repo: <path>
- Files you own: <file list>
- Stack: <stack>
- Design constraints: <constraints>

要求：
- 保持现有代码风格和设计系统。
- 只做完成该目标所需的修改。
- 最终返回：files changed、implementation notes、validation run、open questions。
```

## 返回格式

- Files changed：精确列出文件路径。
- Implementation notes：核心实现点和设计到代码的映射。
- Validation run：执行过的构建、测试、lint 或无法执行的原因。
- Open questions：需要主线程决定的剩余问题。
