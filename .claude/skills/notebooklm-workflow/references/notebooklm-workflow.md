# NotebookLM Workflow Reference

## 目录

1. CLI 标准链路（更新版）
2. MCP 等价映射
3. 双 note 模板
4. 本地研究记录模板
5. selective import 细则（更新版）
6. 多轮 query 拆题法
7. 故障处理与环境维护

---

## 1. CLI 标准链路（更新版）

### A. 认证与 notebook 确认

```bash
./tools/notebooklm-mcp-cli/nlm-local.sh login --check
./tools/notebooklm-mcp-cli/nlm-local.sh notebook list
```

- 默认先确认认证成功，再继续后续动作。
- 需要定位具体 notebook 时，再补 `notebook get <notebook_id>`。

### B. 先查现有 research 任务

```bash
./tools/notebooklm-mcp-cli/nlm-local.sh research status <notebook_id> --max-wait 0 --compact
```

- 先判断是否已有相关任务，避免重复开题或误导入旧结果。
- 若要精确复盘，优先记录并保留 `task_id`。

### C. 用 deep research 发现来源（核心步骤）

```bash
./tools/notebooklm-mcp-cli/nlm-local.sh research start "<精确问题>" --mode deep --notebook-id <notebook_id>
```

- **先用 deep research 发现来源**，这是必须的核心步骤
- `deep` 模式返回完整的 Discovered Sources 列表，Agent 必须先评估再导入
- 查询应当窄、可证伪、可筛选，不要把多个研究问题合并成一个宽题

### D. 轮询到完成

```bash
./tools/notebooklm-mcp-cli/nlm-local.sh research status <notebook_id> --task-id <task_id> --max-wait 300 --compact
```

- 优先按 `task_id` 轮询。
- 除非明确需要完整报告，否则不要默认使用 `--full`。

### E. Agent 评估后选择性导入（关键步骤）

**在导入前，Agent 必须先评估 Discovered Sources 的质量。**

#### E.1 查看完整 Discovered Sources

```bash
./tools/notebooklm-mcp-cli/nlm-local.sh research status <notebook_id> --task-id <task_id> --full
```

返回包含：
- Discovered Sources 列表（index + title + URL）
- 完整 research 报告

#### E.2 评估来源质量

根据以下维度判断：

| 维度 | 检查项 |
|------|--------|
| 权威性 | 政府官网/权威媒体/学术机构？ |
| 相关性 | 与研究问题直接相关？ |
| 正文密度 | 有实质内容还是只有摘要？ |
| 类型 | docx/pdf/视频/首页？ |

#### E.3 执行导入

```bash
./tools/notebooklm-mcp-cli/nlm-local.sh research import <notebook_id> <task_id> --indices 1,3,5
```

- **只导入通过评估的来源**
- 记录每个 index 的采用/舍弃理由

#### E.4 导入后验证

```bash
./tools/notebooklm-mcp-cli/nlm-local.sh notebook get <notebook_id> --json | python3 -c "
import sys, json
d = json.load(sys.stdin)
sources = d.get('value', {}).get('sources', [])
print(f'实际入库: {len(sources)} 个来源')
for i, s in enumerate(sources):
    print(f'  [{i}] {s.get(\"title\", \"N/A\")[:60]}')
"
```

**⚠️ 注意**：Discovered Sources 的 index 与 notebook 实际来源不是一一对应，导入后必须验证。

### F. 做真实 notebook query

```bash
./tools/notebooklm-mcp-cli/nlm-local.sh notebook query <notebook_id> "<question>" --json
```

- research 负责找来源，不替代 notebook 内综合问答
- 至少做 1 轮真实 query，并保留 `conversation_id` 用于后续追问

### G. 写 note

```bash
./tools/notebooklm-mcp-cli/nlm-local.sh note create <notebook_id> --title "调研日志：<topic>" --content "<content>"
./tools/notebooklm-mcp-cli/nlm-local.sh note create <notebook_id> --title "对话决策：<topic>" --content "<content>"
```

- 每轮至少两条 note
- note 创建后要保留 `note_id`

---

## 2. MCP 等价映射

脚本是默认入口。只有用户明确要求 MCP，或 CLI 不可用时，才切到下列等价工具：

- 认证 / notebook：
  - `refresh_auth`
  - `notebook_list`
  - `notebook_get`
  - `notebook_describe`
- research：
  - `research_start`
  - `research_status`
  - `research_import`
- query / note：
  - `notebook_query`
  - `note`

切到 MCP 后也不能放松这些要求：
- 仍然要保存 exact ids
- 仍然要执行真实 query
- 仍然要写双 note
- 仍然要本地落盘

---

## 3. 双 note 模板

### 调研日志 note 模板

```markdown
# 调研日志｜<topic>

- 日期：2026-03-11
- notebook_id：`<notebook_id>`
- task_id：`<task_id>`

## Query
- `<research query>`

## 导入来源
- `<index> -> <source_id>`：<title>

## 采用理由
- <reason>

## 舍弃理由
- <reason>

## 无效来源过滤
- <index> <title>：<过滤原因>（docx/首页/重复/不相关等）

## 本轮可执行约束
- <constraint>

## 直接证据
- <evidence>

## 证据空白
- <gap>
```

### 对话决策 note 模板

```markdown
# 对话决策｜<topic>

- 日期：2026-03-11
- conversation_id：`<conversation_id>`

## 用户约束
- <constraint>

## 范围边界
- <scope>

## 直接证据
- <evidence>

## 合理迁移
- <transfer>

## 当前空白
- <gap>

## 下一步动作
- <next step>
```

---

## 4. 本地研究记录模板

重要任务建议创建：

- `planning/research/<topic>-notebooklm-YYYYMMDD.md`

最小模板：

```markdown
# <topic> NotebookLM 记录

- 日期：2026-03-11
- notebook title：<title>
- notebook_id：<notebook_id>
- task_id：<task_id>
- imported source_ids：<source_id list>
- skipped source_ids：<skipped source_id list> （含舍弃理由）
- deleted source_ids：<deleted source_id list> （含删除原因）
- note_ids：<note_id list>
- conversation_id：<conversation_id>

## 关键结论
- <conclusion>

## 直接证据
- <evidence>

## 合理迁移
- <transfer>

## 证据空白
- <gap>

## 下一步动作
- <next step>
```

---

## 5. selective import 细则（更新版）

### 优先导入

- 国家 / 行业标准
- 官方技术文档和厂商手册
- 同行评审论文
- 机构白皮书或技术型 PDF
- 可复核、参数充分的案例
- 政府官网/权威媒体/学术机构

### 谨慎导入

- 营销页
- 经验博客
- 聚合资讯页
- 只有摘要、没有有效正文的页面
- 公司/机构首页（不是具体内容页）

### 直接删除或跳过

| 类型 | 示例 | 原因 |
|------|------|------|
| Office 文档 | `*.docx`, `*.xlsx` | NotebookLM 无法解析 Word |
| 视频/音频 | bilibili, YouTube | 解析质量差 |
| 占位页面 | 404, "页面不存在" | 无实质内容 |
| 重复来源 | 同一文章的多个镜像 | 浪费 notebook 空间 |
| 与问题无关 | 不在研究范围内的来源 | 不能支撑决策 |

### index 映射说明

`research status --full` 返回的 Discovered Sources 列表 index 是临时的导入定位编号。

**问题**：NotebookLM 可能自动过滤部分来源，导致 Discovered Sources 总数与 notebook 实际来源数不一致。

**解决**：
1. 导入后立即用 `notebook get` 验证
2. 如果实际入库数量少于预期，检查是否有来源被自动过滤
3. 必要时重新发起 research 或手动添加 URL

---

## 6. 多轮 query 拆题法

复杂主题优先拆成多轮，而不是一问塞满：

1. 先问目录 / 主线结构
2. 再问章节展开
3. 再问实操与排错
4. 再问证据分级
5. 最后问总结 / 一页版 / 文档化

如果 query 回答混入其他方法、其他设备或其他领域：

- 不直接照抄
- 明确标注"迁移"或"范围外"
- 在最终文档中与直接证据分层

---

## 7. 故障处理与环境维护

- `research status --full` 太重或超时时，优先改为按 `task_id` 的 `--compact` 精确轮询。
- 如果用户明确要求"不补充源"，不要继续导入；切换到 query / synthesis。
- 输出时尽量给出 exact ids 和绝对日期，避免只写"今天""刚才"。
- 若需手动补充 URL 来源，优先使用：

```bash
./tools/notebooklm-mcp-cli/nlm-local.sh source add <notebook_id> --url <url> --wait
```

- 维护 `tools/notebooklm-mcp-cli` 环境时，优先在该目录使用 `uv` 或项目 `.venv`，不要依赖系统 Python。
- 日常 NotebookLM 任务仍然默认走 `./tools/notebooklm-mcp-cli/nlm-local.sh`，不要直接绕过脚本调用底层命令。
- 删除来源时必须 `unset ALL_PROXY`，否则 socks 代理会报错。

---

## 8. 批量处理

多个独立研究可并行启动：

```bash
unset ALL_PROXY
./tools/notebooklm-mcp-cli/nlm-local.sh research start "主题A" --mode deep --notebook-id <id> --force &
./tools/notebooklm-mcp-cli/nlm-local.sh research start "主题B" --mode deep --notebook-id <id> --force &
wait
```

并行 research 完成后，**分别评估、分别导入**，不要混合评估。
