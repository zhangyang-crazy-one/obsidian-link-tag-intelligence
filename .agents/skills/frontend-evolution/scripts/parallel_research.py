#!/usr/bin/env python3
"""
Parallel Research Script

并行执行多种调研任务，支持：
- 设计风格检索
- 技术栈调研
- 竞品分析
"""

import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, asdict
from typing import Iterable, List
from pathlib import Path


@dataclass
class ResearchResult:
    """调研结果"""
    category: str
    query: str
    findings: List[str]
    recommendations: List[str]
    sources: List[str]


def iter_ui_ux_skill_dirs() -> Iterable[Path]:
    env_path = os.environ.get("UI_UX_PRO_MAX_SKILL_DIR")
    seen: set[Path] = set()

    def add(path: Path):
        resolved = path.expanduser()
        if resolved not in seen:
            seen.add(resolved)
            yield resolved

    if env_path:
        yield from add(Path(env_path))

    for root in (Path.cwd(), *Path.cwd().parents):
        for relative in (
            ".agents/skills/ui-ux-pro-max",
            ".codex/skills/ui-ux-pro-max",
            ".claude/skills/ui-ux-pro-max",
        ):
            yield from add(root / relative)

    home = Path.home()
    for relative in (
        ".agents/skills/ui-ux-pro-max",
        ".codex/skills/ui-ux-pro-max",
        ".claude/skills/ui-ux-pro-max",
    ):
        yield from add(home / relative)


def find_ui_ux_search_script() -> Path | None:
    for skill_dir in iter_ui_ux_skill_dirs():
        candidate = skill_dir / "scripts" / "search.py"
        if candidate.exists():
            return candidate

    return None


def run_ui_ux_search(query: str, domain: str = "style") -> dict:
    """
    使用 ui-ux-pro-max 执行搜索
    """
    search_script = find_ui_ux_search_script()

    if search_script is None:
        return {"error": "ui-ux-pro-max search script not found"}

    try:
        env = os.environ.copy()
        env.setdefault("UV_CACHE_DIR", ".tmp/uv-cache")
        result = subprocess.run(
            [
                "uv",
                "run",
                "python",
                str(search_script),
                query,
                "--domain",
                domain,
            ],
            capture_output=True,
            text=True,
            timeout=30,
            env=env,
        )

        if result.returncode == 0:
            return {
                "success": True,
                "output": result.stdout,
                "script": str(search_script),
            }
        else:
            error = result.stderr.strip() or result.stdout.strip() or "unknown error"
            return {"error": error, "script": str(search_script)}

    except subprocess.TimeoutExpired:
        return {"error": "Search timed out"}
    except Exception as e:
        return {"error": str(e)}


def parallel_research(queries: List[dict], max_workers: int = 4) -> List[ResearchResult]:
    """
    并行执行多个调研任务

    Args:
        queries: 查询列表，每项包含 category, query, domain
        max_workers: 最大并行数

    Returns:
        调研结果列表
    """
    results = []

    def do_research(query_config: dict) -> ResearchResult:
        category = query_config.get("category", query_config.get("domain", "Research"))
        query = query_config["query"]
        domain = query_config.get("domain", "style")

        print(f"Researching: {query} ({domain})...")

        search_result = run_ui_ux_search(query, domain)

        findings = []
        recommendations = []
        sources = []

        if "error" not in search_result:
            output = search_result.get("output", "")
            # 解析输出
            lines = output.strip().split("\n")
            for line in lines:
                if line.startswith("- "):
                    findings.append(line[2:])

            if not findings:
                findings = [line for line in lines if line.strip()][:5]

            # 生成建议
            recommendations = [
                f"Based on {domain} research for '{query}'",
                "Review findings and apply relevant patterns"
            ]
            sources.append(
                f"ui-ux-pro-max:{domain}:{query}:{search_result.get('script', 'unknown')}"
            )
        else:
            findings.append(f"Research failed: {search_result.get('error')}")

        return ResearchResult(
            category=category,
            query=query,
            findings=findings,
            recommendations=recommendations,
            sources=sources
        )

    # 并行执行
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(do_research, q): q
            for q in queries
        }

        for future in as_completed(futures):
            try:
                result = future.result()
                results.append(result)
                print(f"Completed: {result.query}")
            except Exception as e:
                query = futures[future]["query"]
                category = futures[future].get("category", futures[future].get("domain", "Research"))
                print(f"Failed: {query} - {e}")
                results.append(ResearchResult(
                    category=category,
                    query=query,
                    findings=[f"Error: {e}"],
                    recommendations=[],
                    sources=[]
                ))

    return results


def generate_research_report(results: List[ResearchResult]) -> str:
    """
    生成调研报告
    """
    report = ["\n" + "=" * 60]
    report.append("PARALLEL RESEARCH REPORT")
    report.append("=" * 60)

    for result in results:
        report.append(f"\n## {result.category.upper()}")
        report.append(f"Query: {result.query}")
        report.append("-" * 40)

        if result.findings:
            report.append("\nFindings:")
            for finding in result.findings:
                report.append(f"  • {finding}")
        else:
            report.append("\nFindings: None")

        if result.recommendations:
            report.append("\nRecommendations:")
            for rec in result.recommendations:
                report.append(f"  → {rec}")

        if result.sources:
            report.append(f"\nSources: {', '.join(result.sources)}")

    report.append("\n" + "=" * 60)
    report.append("END OF REPORT")
    report.append("=" * 60)

    return "\n".join(report)


def save_results(results: List[ResearchResult], output_file: str):
    """
    保存结果到 JSON 文件
    """
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump([asdict(r) for r in results], f, indent=2, ensure_ascii=False)
    print(f"\nResults saved to: {output_file}")


# 预定义的调研模板
RESEARCH_TEMPLATES = {
    "design_style": {
        "category": "Design Style",
        "queries": [
            {"query": "modern dark dashboard", "domain": "style"},
            {"query": "minimalist interface design", "domain": "style"},
            {"query": "terminal tui aesthetic", "domain": "style"},
        ]
    },
    "color_palette": {
        "category": "Color Palette",
        "queries": [
            {"query": "dark theme color palette", "domain": "color"},
            {"query": "github dark colors", "domain": "color"},
            {"query": "monokai code editor colors", "domain": "color"},
        ]
    },
    "tech_stack": {
        "category": "Tech Stack",
        "queries": [
            {"query": "react ratatui tauri best practices", "domain": "stack"},
            {"query": "rust webassembly ui framework", "domain": "stack"},
            {"query": "react component library dark mode", "domain": "stack"},
        ]
    },
    "typography": {
        "category": "Typography",
        "queries": [
            {"query": "monospace font coding interface", "domain": "typography"},
            {"query": "system font stack", "domain": "typography"},
        ]
    }
}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python3 parallel_research.py <template> [output_file]")
        print(f"\nAvailable templates: {', '.join(RESEARCH_TEMPLATES.keys())}")
        print("\nExamples:")
        print("  python3 parallel_research.py design_style")
        print("  python3 parallel_research.py tech_stack results.json")
        sys.exit(1)

    template_name = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) >= 3 else None

    if template_name not in RESEARCH_TEMPLATES:
        print(f"Unknown template: {template_name}")
        print(f"Available: {', '.join(RESEARCH_TEMPLATES.keys())}")
        sys.exit(1)

    template = RESEARCH_TEMPLATES[template_name]
    queries = [
        {**query_config, "category": template["category"]}
        for query_config in template["queries"]
    ]

    print(f"Starting parallel research: {template['category']}")
    print(f"Queries: {len(queries)}")

    results = parallel_research(queries)

    report = generate_research_report(results)
    print(report)

    if output_file:
        save_results(results, output_file)
