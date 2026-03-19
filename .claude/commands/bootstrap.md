# /bootstrap - 方案讨论初始化

作为初始化助手，创建新的方案讨论环境。

## 使用方式

```
/bootstrap [方案主题]
/bootstrap 设计一个实时协作编辑系统
/bootstrap 讨论 AI 助手的产品形态
```

## 执行流程

### 阶段 1: 创建规划文件

使用 `planning-with-files` 技能创建规划文件：

```
planning/
├── task_plan.md      # 任务计划和阶段跟踪
├── findings.md       # 发现和研究记录
└── progress.md       # 进度日志
```

**重要**: 按照 planning-with-files 技能的模板创建这些文件。

### 阶段 2: 需求澄清（spec-interview）

激活 `spec-interview` 技能进行深度访谈：

1. **扫描主题**
   - 分析方案主题
   - 识别关键问题
   - 确定讨论范围

2. **深度访谈**
   - 方案的约束条件（预算、时间、技术栈）
   - 目标用户/场景
   - 性能/规模要求
   - 团队经验水平

3. **记录结果**
   - 将访谈结果记录到 `planning/task_plan.md`
   - 更新 `planning/findings.md`

### 阶段 3: 资源准备

激活相关技能：

- **context7** - 查询相关技术的官方文档
- **web-research** - 调研最新趋势和案例
- **github** - 搜索开源项目实现

### 阶段 4: 开始讨论

1. 提示用户可以运行 `/brainstorm` 开始头脑风暴
2. 显示已创建的文件
3. 显示下一步操作

## 输出格式

```markdown
# ✅ 方案讨论初始化完成

## 📁 创建的文件

### 规划文件
- [x] planning/task_plan.md
- [x] planning/findings.md
- [x] planning/progress.md

## 📊 方案信息

| 属性 | 值 |
|------|-----|
| **方案主题** | [主题名] |
| **讨论范围** | [范围描述] |
| **激活技能** | spec-interview, context7, web-research |

## 🔧 准备工作

### 已激活技能
- ✅ spec-interview - 需求访谈
- ✅ context7 - 文档查询就绪
- ✅ web-research - 联网调研就绪

### 待进行
- 运行 `/brainstorm` 开始头脑风暴
- 使用 `/compare` 对比备选方案
- 使用 `/design` 进行详细设计

## 💡 下一步操作

1. 运行 `/brainstorm` 开始正式的头脑风暴
2. 或者直接描述你的需求，我会继续引导
```

## 注意事项

1. **必须调用 spec-interview**: 需求访谈是核心，不能跳过
2. **planning-with-files 模式**: 所有重要信息写入文件，不依赖上下文
3. **资源预热**: 提前激活相关技能的上下文
4. **文档驱动**: 所有决策记录在文档中

## 与其他命令协同

| 命令 | 时机 | 用途 |
|------|------|------|
| `/brainstorm` | 初始化后 | 开始正式头脑风暴 |
| `/compare` | 方案生成后 | 对比方案 |
| `/design` | 决策后 | 详细设计 |
| `/progress` | 任何时候 | 查看进度 |
