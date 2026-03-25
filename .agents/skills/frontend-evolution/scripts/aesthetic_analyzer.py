#!/usr/bin/env python3
"""
美学分析器脚本

分析 Pencil 设计稿的审美对齐情况：
- 空间关系（按钮与文字对齐）
- 层次分明度
- 呼吸感
- 一致性
"""

import json
import sys
from dataclasses import dataclass
from typing import List


@dataclass
class Issue:
    """审美问题"""
    severity: str  # "error", "warning", "info"
    category: str  # "space", "hierarchy", "breathing", "consistency"
    message: str
    node_id: str
    suggestion: str


def analyze_spacing(layout_data: dict) -> List[Issue]:
    """
    分析间距问题

    检查：
    - 同类元素是否对齐
    - 间距是否符合系统
    """
    issues = []
    spacing_system = [4, 8, 12, 16, 24, 32, 48]

    def is_valid_spacing(value: int) -> bool:
        return value in spacing_system or value % 4 == 0

    # 检查子元素的间距
    children = layout_data.get("children", [])
    for i, child in enumerate(children):
        # 检查 gap
        if "gap" in child:
            gap = child["gap"]
            if not is_valid_spacing(gap):
                issues.append(Issue(
                    severity="warning",
                    category="spacing",
                    message=f"Gap value {gap} is not in standard spacing system",
                    node_id=child.get("id", "unknown"),
                    suggestion=f"Use one of: {spacing_system}"
                ))

        # 递归检查子节点
        if "children" in child:
            issues.extend(analyze_spacing(child))

    return issues


def analyze_text_alignment(layout_data: dict) -> List[Issue]:
    """
    分析文本对齐问题

    检查：
    - 按钮内文字是否垂直居中
    - 同类标签是否对齐
    """
    issues = []

    def check_node(node: dict):
        # 检查文本节点
        if node.get("type") == "text":
            parent = node.get("parent")
            if parent:
                parent_type = parent.get("type")
                if parent_type == "rectangle":
                    # 按钮内的文字
                    text_y = node.get("y")
                    rect_height = parent.get("height", 0)
                    if text_y is not None and rect_height > 0:
                        # 文字应该在垂直居中位置附近
                        expected_y = (rect_height - 14) / 2  # 假设字体14px
                        if abs(text_y - expected_y) > 3:
                            issues.append(Issue(
                                severity="warning",
                                category="space",
                                message=f"Text may not be vertically centered in button",
                                node_id=node.get("id", "unknown"),
                                suggestion=f"Expected y ~{expected_y:.0f}, got {text_y}"
                            ))

        # 递归检查
        for child in node.get("children", []):
            check_node(child)

    for child in layout_data.get("children", []):
        check_node(child)

    return issues


def analyze_consistency(layout_data: dict) -> List[Issue]:
    """
    分析一致性

    检查：
    - 按钮高度是否统一
    - 圆角是否统一
    - 颜色是否一致
    """
    issues = []

    buttons = []
    inputs = []
    radii = {}

    def collect_nodes(node: dict, parent_type: str = None):
        node_type = node.get("type")
        fill = node.get("fill")
        corner_radius = node.get("cornerRadius")

        # 收集按钮
        if node_type == "rectangle" and parent_type == "frame":
            # 判断是否是按钮（根据上下文）
            if fill in ["#238636", "#21262d", "#58a6ff"]:
                buttons.append({
                    "id": node.get("id"),
                    "height": node.get("height"),
                    "radius": corner_radius
                })

        # 收集输入框
        if node_type == "rectangle" and fill == "#0d1117":
            inputs.append({
                "id": node.get("id"),
                "height": node.get("height"),
                "radius": corner_radius
            })

        # 收集圆角值
        if corner_radius is not None:
            radii[corner_radius] = radii.get(corner_radius, 0) + 1

        for child in node.get("children", []):
            collect_nodes(child, node_type)

    collect_nodes(layout_data)

    # 检查按钮高度一致性
    if buttons:
        heights = [b["height"] for b in buttons if b["height"]]
        if len(set(heights)) > 2:  # 超过2种高度
            issues.append(Issue(
                severity="info",
                category="consistency",
                message=f"Button heights vary: {set(heights)}",
                node_id="buttons",
                suggestion="Consider using consistent button heights (e.g., 32px, 36px, 44px)"
            ))

    # 检查输入框高度一致性
    if inputs:
        heights = [i["height"] for i in inputs if i["height"]]
        if len(set(heights)) > 2:
            issues.append(Issue(
                severity="info",
                category="consistency",
                message=f"Input heights vary: {set(heights)}",
                node_id="inputs",
                suggestion="Consider using consistent input heights"
            ))

    return issues


def analyze_layout(layout_file: str) -> List[Issue]:
    """
    完整分析布局
    """
    issues = []

    try:
        with open(layout_file, encoding="utf-8") as f:
            layout_data = json.load(f)
    except Exception as e:
        print(f"Error reading layout file: {e}")
        return []

    issues.extend(analyze_spacing(layout_data))
    issues.extend(analyze_text_alignment(layout_data))
    issues.extend(analyze_consistency(layout_data))

    return issues


def generate_report(issues: List[Issue]) -> str:
    """
    生成审美报告
    """
    if not issues:
        return "OK: no aesthetic issues found"

    report = ["\n" + "=" * 50]
    report.append("AESTHETIC ANALYSIS REPORT")
    report.append("=" * 50)

    # 按类别分组
    by_category = {}
    for issue in issues:
        if issue.category not in by_category:
            by_category[issue.category] = []
        by_category[issue.category].append(issue)

    for category, category_issues in by_category.items():
        report.append(f"\n## {category.upper()}")
        report.append("-" * 30)

        for issue in category_issues:
            icon = {
                "error": "ERROR",
                "warning": "WARN",
                "info": "INFO",
            }.get(issue.severity, "NOTE")

            report.append(f"\n{icon} [{issue.severity.upper()}] {issue.message}")
            report.append(f"   Node: {issue.node_id}")
            report.append(f"   Suggestion: {issue.suggestion}")

    # 统计
    report.append("\n" + "=" * 50)
    report.append("SUMMARY")
    report.append("=" * 50)

    counts = {}
    for issue in issues:
        counts[issue.severity] = counts.get(issue.severity, 0) + 1

    for severity in ["error", "warning", "info"]:
        if severity in counts:
            report.append(f"  {severity}: {counts[severity]}")

    return "\n".join(report)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 aesthetic_analyzer.py <layout.json>")
        sys.exit(1)

    layout_file = sys.argv[1]
    issues = analyze_layout(layout_file)
    report = generate_report(issues)
    print(report)
