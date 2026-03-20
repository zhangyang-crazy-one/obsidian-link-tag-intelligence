---
name: notebooklm-workflow
version: 1.6.0
description: NotebookLM 工作流：先用 deep research 搜索来源，Agent 评估筛选后再导入，支持来源去重、C级清理、批量研究和Query验证。
trigger: notebooklm nlm-local research import notebook query 去重 清理来源 批量 股票 研究

# NotebookLM Workflow

把项目里的 NotebookLM 实战沉淀成可复用的"知识沉积 + 研究助手"技能。**核心原则：先让 NotebookLM 发现来源，Agent 评估后再决定导入**。默认通过 `./tools/notebooklm-mcp-cli/nlm-local.sh` 触发和执行；只有用户明确要求，或终端入口暂时不可用时，才切换到等价 MCP 工具。

## 何时使用

- 用户要用 `NotebookLM` 做 research、deep research、来源筛选、知识沉积、研究助手问答。
- 用户要在 NotebookLM 里保留研究过程、来源依据、对话记录、决策笔记。
- 任务必须追踪 `notebook_id`、`task_id`、`source_id`、`note_id`、`conversation_id` 等 exact ids。
- 用户直接提到：`NotebookLM`、`notebooklm`、`nlm-local`、`research import`、`notebook query`、`conversation_id`、`选择性导入`、`研究日志`、`决策笔记`。
- **来源去重**：用户提到"删除重复"、"去重"、"清理来源"、"清理重复引用"时。

## ⚠️ MCP 认证失败处理

**症状**：`No authentication found` 或 MCP 工具调用失败

**解决方案**：立即切换到 CLI，不重试 MCP

```bash
# 检查 MCP 认证状态
nlm login --check

# 如果 MCP 失败，使用 CLI 替代所有命令
./tools/notebooklm-mcp-cli/nlm-local.sh notebook list
./tools/notebooklm-mcp-cli/nlm-local.sh research start "<query>" --mode deep --notebook-id <id>
./tools/notebooklm-mcp-cli/nlm-local.sh research status <id> --task-id <task_id> --max-wait 300 --compact
```

**CLI 与 MCP 命令对照表**：

| 操作 | MCP 工具 | CLI 命令 |
|------|----------|----------|
| 列表 notebooks | `notebook_list` | `nlm-local.sh notebook list` |
| 创建 notebook | `notebook_create` | `nlm-local.sh notebook create "<title>"` |
| 获取 notebook | `notebook_get` | `nlm-local.sh notebook get <id>` |
| Query | `notebook_query` | `nlm-local.sh notebook query <id> "<question>" --json` |
| 研究启动 | `research_start` | `nlm-local.sh research start "<query>" --mode deep` |
| 研究状态 | `research_status` | `nlm-local.sh research status <id> --task-id <tid>` |
| 导入来源 | `research_import` | `nlm-local.sh research import <id> <task_id> --indices 1,2` |
| 创建 note | `note_create` | `nlm-local.sh note create <notebook_id> "<content>" --title "<title>"` |

## ⚠️ 网络代理设置

**关键规则**：NotebookLM 连接**必须关闭代理**，否则会出现 SSL 超时错误。

```bash
# 在所有 NotebookLM 命令前执行
unset ALL_PROXY https_proxy http_proxy HTTP_PROXY HTTPS_PROXY all_proxy SOCKS_PROXY
```

**注意事项**：
- `nlm-local.sh` 内部默认设置了代理 (`socks5://127.0.0.1:7897`)，会与 NotebookLM 服务器断开
- 删除来源等修改操作也需关闭代理
- 如果命令执行报 SSL 错误，第一时间检查代理设置

## ⚠️ 核心工作流：先发现后导入，Agent 评估筛选

```
┌─────────────────────────────────────────────────────────────┐
│  Step 1: deep research 发现来源（NotebookLM 做搜索）         │
│  ↓                                                        │
│  Step 2: Agent 评估筛选来源（质量判断 + 过滤无效来源）        │
│  ↓                                                        │
│  Step 3: 选择性导入（只导入通过评估的来源）                   │
│  ↓                                                        │
│  Step 4: query + 写 note + 本地落盘                         │
└─────────────────────────────────────────────────────────────┘
```

**Agent 必须自己判断哪些来源值得导入，不只是按 index 数字导入。**

## 硬约束

- 开始前先确认认证状态和 notebook 身份，不允许盲跑 research。
- 默认先看现有 research 任务，再决定复用、忽略还是新开。
- **必须先用 deep research 发现来源**，等 NotebookLM 返回 Discovered Sources 后，Agent 自己评估质量，再决定导入哪些。
- **禁止在看到 Discovered Sources 之前就决定导入哪些**。
- deep research 必须同时保存 `start task_id` 和 `completed task_id`；若两者漂移，以 `research status` 返回的完成态 ID 作为后续 import 和记录主键。
- 在同一 notebook 中开启下一轮 research 之前，必须先显式处理上一轮候选集：要么导入、要么记录放弃并 `--force` 丢弃剩余候选；不要跳过这一步硬开新任务。
- 每轮至少执行 1 次真实 `notebook query`；research 不等于完成问答。
- 每轮至少新增 2 条 note：
  - 调研日志
  - 对话决策
- 写回 NotebookLM 的 note 内容必须使用 Markdown 结构，不允许回写成纯文本流水账、无标题大段文字或原始 JSON 堆叠。
- note 默认先按 Markdown 模板起草，再通过 CLI 或 MCP 原样写回；本地记录与 NotebookLM note 应保持同一 Markdown 结构。
- 每轮必须保存 exact ids：
  - `notebook_id`
  - `task_id`
  - `source_id`
  - `note_id`
  - `conversation_id`
- 只要发生 CLI 失败后重试、CLI/MCP 混用或重复导入风险，就必须在进入 query 之前审计当前 notebook source 列表；若出现重复来源，先删除再继续。
- 重要结论必须区分三层：
  - 直接证据
  - 合理迁移
  - 证据空白 / 待验证
- 用户一旦明确说"不要再补充源"或"现在不导入更多来源"，立即停止 import，切换到 notebook 内 query / synthesis。

## 标准流程

### 1. 认证与 notebook 确认

```bash
./tools/notebooklm-mcp-cli/nlm-local.sh login --check
./tools/notebooklm-mcp-cli/nlm-local.sh notebook list
```

- 先定位已有 notebook；只有确定不存在合适 notebook 时才新建。
- 记录绝对日期，例如 `2026-03-11`，不要只写"今天"。

### 2. 先看现有 research 任务

```bash
./tools/notebooklm-mcp-cli/nlm-local.sh research status <notebook_id> --max-wait 0 --compact
```

- 目标是避免重复开题、重复导入、误复用无关 research。
- 若已有任务与当前问题不一致，必须记录"忽略原因"。

### 3. 用 deep research 发现来源（NotebookLM 做搜索）

```bash
./tools/notebooklm-mcp-cli/nlm-local.sh research start "<精确问题>" --mode deep --notebook-id <notebook_id>
```

- **先用 NotebookLM 的 deep research 发现来源**，这是核心步骤
- 问题要窄且可验证；不要把多个大主题混成一题
- deep research 会返回 Discovered Sources 列表，Agent 必须先看这个列表再决定导入

### 3.1 Research 模式选择

| 模式 | 耗时 | 适用场景 |
|------|------|----------|
| `--mode fast` | ~30秒 | 快速验证、简单问答 |
| `--mode deep` | 更长(1-5分钟) | 深度研究、高质量来源需求（**默认使用**） |

**默认使用 `--mode deep`**，因为主要目的是发现和筛选来源。

### 3.2 轮询到完成

```bash
./tools/notebooklm-mcp-cli/nlm-local.sh research status <notebook_id> --task-id <task_id> --max-wait 300 --compact
```

- 优先按 `task_id` 轮询，不要长期依赖重型 `--full`
- deep research 返回后，会同时有 Discovered Sources 列表和完整报告

### 4. Agent 评估筛选来源（关键步骤）

**NotebookLM 返回 Discovered Sources 后，Agent 必须自己评估质量，不能盲导入。**

#### 4.1 评估维度

| 维度 | 检查项 | 权重 |
|------|--------|------|
| 来源权威性 | 政府官网/权威媒体/学术机构？ | 高 |
| 内容相关性 | 与研究问题直接相关？ | 高 |
| 正文密度 | 有实质内容还是只有摘要？ | 高 |
| 来源类型 | docx/pdf/视频/无解析能力？ | 高 |

#### 4.2 无效来源必须过滤

**以下类型一律不导入：**

| 类型 | 原因 | 示例 |
|------|------|------|
| docx/xlsx 等 Office 文档 | NotebookLM 无法解析 Word 内容 | `*.docx`, `*.xlsx` |
| PDF 扫描件 | OCR 可能失败或内容无意义 | scanned PDF |
| 视频/音频 | 解析质量差 | bilibili, YouTube |
| 占位页面 | 只有标题无实质内容 | "页面不存在" |
| 公司/机构首页 | 不是具体内容页 | 官网首页 |
| 重复来源 | 同一内容多个 URL | 同一文章的多个镜像 |

#### 4.3 查看 Discovered Sources 详情

```bash
./tools/notebooklm-mcp-cli/nlm-local.sh research status <notebook_id> --task-id <task_id> --full
```

返回的 Discovered Sources 列表包含：
- index 编号
- 标题（title）
- 来源 URL

**Agent 必须根据标题和 URL 判断质量，再决定导入哪些 index。**

#### 4.4 C级来源识别（投资研究场景）

> ⚠️ **此规则仅适用于投资研究场景**。学术调研、技术调研场景下官网往往是最权威来源，**不应删除**。

| 类型 | 关键词示例 |
|------|-----------|
| 公司官网 | `官网`、`官方网站`、公司名+"官网" |
| 宣传稿 | `成就辉煌`、`把握核心技术创新` |
| 软文 | 软文性质媒体 |

### 5. 选择性导入（只导入通过评估的来源）

```bash
./tools/notebooklm-mcp-cli/nlm-local.sh research import <notebook_id> <task_id> --indices 1,3,5
```

- **只导入通过 4.1-4.4 评估的来源**
- 导入时同步记录：
  - 导入的 index
  - 对应 `source_id`
  - 采用理由
  - 舍弃理由（包括被过滤的无价值来源）
- **导入后验证**：用 `notebook get <notebook_id>` 确认实际入库的来源数量和标题

### 5.1 index 映射说明

`research status --full` 返回的 Discovered Sources 列表 index 是临时的、用于导入定位的编号。
导入后 notebook 中的实际来源顺序和数量可能与 Discovered Sources 不同。

**验证方法**：
```bash
# 导入后检查实际入库的来源
./tools/notebooklm-mcp-cli/nlm-local.sh notebook get <notebook_id> --json | python3 -c "
import sys, json
d = json.load(sys.stdin)
sources = d.get('value', {}).get('sources', [])
print(f'实际入库: {len(sources)} 个来源')
for i, s in enumerate(sources):
    print(f'  [{i}] {s.get(\"title\", \"N/A\")[:60]}')
"
```

### 6. 做真实 notebook query

```bash
./tools/notebooklm-mcp-cli/nlm-local.sh notebook query <notebook_id> "<question>" --json
```

- research 负责找来源，不替代 notebook 内综合问答
- 至少进行 1 轮真实 query，并保留 `conversation_id` 以支持追问
- 多轮问答时，优先拆成"框架 -> 细节 -> 风险 -> 决策"

### 7. 写双 note

- 每轮至少写 2 条 note：
  - 调研日志：记录 query、task、sources、采用/舍弃理由、可执行约束
  - 对话决策：记录用户要求、边界、`conversation_id`、证据分层、下一步动作
- 两条 note 都必须使用 Markdown：
  - 至少包含标题或主题区块、元信息列表、分节小标题、要点列表
  - `note create` / `note update` 的 `content` 传入值默认就是 Markdown 正文，不要先压平成纯文本
- 若 NotebookLM 服务波动导致 note 暂时写不进去，先把同一份 Markdown 落到 `planning/research/`，恢复后按原文补回
- 如果没有 `note_id`，该轮默认视为没有完成知识沉积

#### 7.1 Note 创建的 CLI 陷阱与解法

**问题**：直接通过 Bash 传递 note 内容会导致命令替换失败，例如：

```bash
# ❌ 错误：内容中的特殊字符会被 Bash 解释
./tools/notebooklm-mcp-cli/nlm-local.sh note create <id> "内容含 # 标题" --title "测试"
```

**解法**：先将内容写入临时文件，再读取文件传递给 CLI：

```bash
# ✅ 正确：内容写入文件，Bash 只传递文件路径
cat > /tmp/note_content.md << 'EOF'
# Note Title

- notebook_id: xxx
- task_id: yyy

## Content
这里是正文内容
EOF

./tools/notebooklm-mcp-cli/nlm-local.sh note create <notebook_id> "$(cat /tmp/note_content.md)" --title "<title>"
```

**适用场景**：
- Note 内容较长（>100 字符）
- 内容包含 Markdown 特殊字符（`#`, `*`, `` ` ``, `-`）
- 内容包含换行符
- 内容包含 URL（`http://`, `https://`）

**工作流**：
1. 先把 note 的 Markdown 内容写入 `planning/research/<topic>-notebooklm-YYYYMMDD.md`
2. 同时用 `cat > /tmp/note_content.md << 'EOF'` 保存同一份内容
3. 用 `$(cat /tmp/note_content.md)` 读取内容传给 CLI

### 8. 本地落盘

- 重要任务默认写入：
  - `planning/research/<topic>-notebooklm-YYYYMMDD.md`
- 最少字段：
  - notebook title
  - `notebook_id`
  - `task_id`
  - 若有漂移则同时记录 `start task_id` 与 `completed task_id`
  - imported `source_id`
  - skipped / deleted source（包含舍弃理由）
  - `note_id`
  - `conversation_id`
  - 关键结论
  - 证据边界
  - 下一步动作
- 如果本轮发生 CLI/MCP fallback，还要补：
  - 使用了哪条 fallback
  - 是否删除了重复 `source_id`
  - 删除原因

## 来源去重

Deep research 容易产生重复来源（同一来源被多次导入），建议定期清理。

### 何时去重

- deep research 批量导入后
- notebook source 数量异常增长时
- 发现有重复标题的来源

### 快速去重（推荐）

使用 bundled 脚本自动完成：

```bash
# 方式1: 使用 uv 指定项目路径（推荐，不会改变工作目录）
uv run --project tools/notebooklm-mcp-cli python .claude/skills/notebooklm-workflow/scripts/deduplicate_sources.py <notebook_id> --dry-run

# 方式2: 直接使用解释器路径（推荐，不会改变工作目录）
tools/notebooklm-mcp-cli/.venv/bin/python .claude/skills/notebooklm-workflow/scripts/deduplicate_sources.py <notebook_id> --dry-run
```

### 手动流程

**Step 1: 获取来源列表**
```bash
./tools/notebooklm-mcp-cli/nlm-local.sh notebook get <notebook_id> --json
```

**Step 2: 分析重复**
用 Python 脚本分析重复（示例逻辑）：

```python
import json, sys
d = json.load(sys.stdin)
sources = d.get('value', {}).get('sources', [])

# 按 title 统计重复
title_count = {}
for s in sources:
    title = s.get('title', 'N/A')
    title_count[title] = title_count.get(title, 0) + 1

# 列出所有重复组
duplicates = [(t, c) for t, c in title_count.items() if c > 1]
print(f"重复组数: {len(duplicates)}")

# 收集待删 ID（每组保留第一个）
ids_to_delete = []
for title, count in duplicates:
    matching = [s for s in sources if s.get('title') == title]
    for s in matching[1:]:  # 保留第一个，删除其余
        ids_to_delete.append(s.get('id'))
```

**Step 3: 批量删除**
用 Python 直接调用 API 删除（绕过 CLI 确认提示）：

```python
import sys, os
sys.path.insert(0, 'tools/notebooklm-mcp-cli/src')
os.environ['NOTEBOOKLM_MCP_CLI_PATH'] = 'tools/notebooklm-mcp-cli/.state'

from notebooklm_tools.services.sources import delete_source
from notebooklm_tools.core.auth import get_auth_manager
from notebooklm_tools.core.client import NotebookLMClient

auth = get_auth_manager()
profile = auth.load_profile()
client = NotebookLMClient(cookies=profile.cookies,
                         csrf_token=profile.csrf_token,
                         session_id=profile.session_id)

for sid in ids_to_delete:
    delete_source(client, sid)
    print(f"✓ Deleted: {sid}")
```

**注意**: 删除时取消代理设置（`unset ALL_PROXY`），否则 `socks://` 代理会报错。

## 输出要求

最终回答或文档默认要包含：
- 绝对日期
- exact ids
- 已导入 / 已跳过来源（含舍弃理由）
- 若 deep research 存在 task 漂移，显式区分 start/completed task IDs
- 直接证据 / 合理迁移 / 证据空白
- 下一步建议
- 若存在范围外信息，显式标注"迁移"或"范围外"

## 不要这样做

- **不要在看到 Discovered Sources 之前就决定导入哪些**
- 不要把 research 当成最终答案
- 不要只建 note 不做 query
- 不要把 note 写成无标题的纯文本块、键值对流水账或 JSON 粘贴板
- 不要丢失 `conversation_id`
- 不要在用户已禁止的情况下偷偷继续导入新来源
- 不要混用 NotebookLM 之外的脚本冒充调研流程
- 不要在 CLI import 失败后立刻原样重试而不审计 source 列表；否则很容易制造重复来源

## 参考

- 以下场景再读取 [references/notebooklm-workflow.md](references/notebooklm-workflow.md)：
  - 需要 CLI 与 MCP 的逐项命令映射
  - 需要双 note 模板或本地研究记录模板
  - 需要 selective import 细则
  - 需要重试、故障处理或环境维护提示

- Bundled Scripts:
  - [scripts/deduplicate_sources.py](scripts/deduplicate_sources.py) - 来源去重脚本，支持干跑和批量删除
