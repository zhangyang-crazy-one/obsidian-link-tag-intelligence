# /house-design - FreeCAD 户型设计（调研先行）

作为户型设计助手，按“先调研、后建模、再校核”的闭环执行。

## 使用方式

```bash
/house-design [需求或参考图路径]
/house-design 基于参考图做两层住宅平面与楼梯优化
/house-design /home/user/图片/平面图.png
```

## 强制规则

1. 全程中文输出。
2. 必须先完成相似案例调研，再给至少 3 个方案。
3. 用户未定稿前，不进入最终 FreeCAD 建模。
4. 每轮建模后必须用 MCP 截图做俯视图一致性校核。

## 执行流程

### 阶段 1：约束冻结
- 询问是否有参考图。
- 提取并确认：外轮廓、分段尺寸、不可拆墙、楼梯起终点、厨卫与下水约束。
- 写入 `docs/requirements.md`。

### 阶段 2：调研
- 搜索相似案例与规范基准。
- 至少记录 5 个来源链接。
- 提炼动线、楼梯、湿区组织、结构边界规则。
- 写入 `docs/research.md`。

### 阶段 3：方案输出
- 输出方案 A/B/C（文字+粗线稿说明）。
- 每个方案必须给优点、风险、适配理由。
- 写入 `docs/options.md`。

### 阶段 4：用户定稿
- 让用户选择方案并提出修改。
- 将定稿约束冻结到 `docs/final-plan.md`。

### 阶段 5：FreeCAD 建模
- 使用项目初始化脚本生成骨架。
- 按定稿更新 `scripts/build_model.py`。
- 输出 `models/*.FCStd`。

### 阶段 6：MCP 截图校核
- 生成 Top / Isometric 截图。
- 核对外轮廓、隔墙、楼梯、走廊连接、阳台/外凸。
- 不一致则修正并重新截图。

### 阶段 7：迭代
- 逐条处理用户反馈并记录“改动项/未改动项”。

## 命令模板

### 初始化设计项目
```bash
python .claude/skills/freecad-house-design-workflow/scripts/init_house_project.py \
  house_design_xxx --model-name HouseModel
```

### 查看当前交付文件
```bash
find house_design_xxx -maxdepth 3 -type f | sort
```

## 交付检查清单
- `docs/requirements.md`
- `docs/research.md`
- `docs/options.md`
- `docs/final-plan.md`
- `scripts/build_model.py`
- `models/*.FCStd`
- `models/*_top.png` 与 `models/*_iso.png`
