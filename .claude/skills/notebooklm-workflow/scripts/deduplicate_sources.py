#!/usr/bin/env python3
"""
NotebookLM 来源去重脚本

用法:
    # 方式1: 使用 uv，指定项目路径（推荐，不会改变工作目录）
    uv run --project tools/notebooklm-mcp-cli python .claude/skills/notebooklm-workflow/scripts/deduplicate_sources.py <notebook_id> [--dry-run]

    # 方式2: 直接使用 notebooklm-mcp-cli 的 Python 解释器（推荐，不会改变工作目录）
    tools/notebooklm-mcp-cli/.venv/bin/python .claude/skills/notebooklm-workflow/scripts/deduplicate_sources.py <notebook_id> [--dry-run]

    # 方式3: 直接运行（使用 shebang 指定的 Python，需确保 notebooklm_tools 已安装）
    .claude/skills/notebooklm-workflow/scripts/deduplicate_sources.py <notebook_id> [--dry-run]

示例:
    # 干跑（不删除，只显示待删列表）
    uv run --project tools/notebooklm-mcp-cli python .claude/skills/notebooklm-workflow/scripts/deduplicate_sources.py 74228a43-1988-479b-af7f-891d0721c61d --dry-run

    # 执行删除
    uv run --project tools/notebooklm-mcp-cli python .claude/skills/notebooklm-workflow/scripts/deduplicate_sources.py 74228a43-1988-479b-af7f-891d0721c61d
"""

import os
from pathlib import Path

# 设置认证数据路径（nlm login 默认保存到 tools/notebooklm-mcp-cli/.state/）
# 项目根目录的绝对路径
PROJECT_ROOT = Path("/home/zhangyangrui/my_programes/Brain-storm")
CLI_ROOT = PROJECT_ROOT / "tools" / "notebooklm-mcp-cli"
os.environ.setdefault("NOTEBOOKLM_MCP_CLI_PATH", str(CLI_ROOT / ".state"))

# 取消代理设置（httpx 不支持 socks:// 代理）
for var in ["ALL_PROXY", "all_proxy", "HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"]:
    os.environ.pop(var, None)

import argparse
import json
import sys

sys.path.insert(0, str(CLI_ROOT / "src"))

from notebooklm_tools.services.sources import delete_source
from notebooklm_tools.services.notebooks import get_notebook
from notebooklm_tools.core.auth import get_auth_manager
from notebooklm_tools.core.client import NotebookLMClient


def get_client():
    """获取认证后的 NotebookLM client"""
    auth = get_auth_manager()
    if not auth.profile_exists():
        raise RuntimeError("未登录，请先运行: nlm login")

    profile = auth.load_profile()
    return NotebookLMClient(
        cookies=profile.cookies,
        csrf_token=profile.csrf_token,
        session_id=profile.session_id,
    )


def analyze_duplicates(sources: list) -> tuple[list[dict], dict]:
    """分析重复来源

    Returns:
        (ids_to_delete, title_stats): 待删除 ID 列表，标题统计
    """
    title_count = {}
    title_sources = {}

    for s in sources:
        title = s.get("title", "N/A")
        if title not in title_count:
            title_count[title] = []
            title_sources[title] = []
        title_count[title].append(s.get("id"))
        title_sources[title].append(s)

    # 收集待删 ID（每组保留第一个）
    ids_to_delete = []
    stats = {"total": len(sources), "unique": len(title_count), "duplicate_groups": 0}

    for title, ids in title_count.items():
        if len(ids) > 1:
            stats["duplicate_groups"] += 1
            # 保留第一个，删除其余
            for sid in ids[1:]:
                ids_to_delete.append({"id": sid, "title": title})

    return ids_to_delete, stats


def main():
    parser = argparse.ArgumentParser(description="NotebookLM 来源去重")
    parser.add_argument("notebook_id", help="Notebook ID")
    parser.add_argument("--dry-run", action="store_true", help="干跑模式，不实际删除")
    parser.add_argument("--json", action="store_true", help="JSON 输出")
    args = parser.parse_args()

    client = get_client()

    # 获取 notebook 来源
    notebook = get_notebook(client, args.notebook_id)
    sources = notebook.get("sources", [])

    if not sources:
        print("No sources found")
        return

    # 分析重复
    to_delete, stats = analyze_duplicates(sources)

    if args.json:
        output = {
            "stats": stats,
            "sources_total": len(sources),
            "duplicates_to_delete": len(to_delete),
            "duplicates": to_delete,
        }
        print(json.dumps(output, ensure_ascii=False, indent=2))
        return

    # 人类可读输出
    print(f"来源统计:")
    print(f"  总数: {stats['total']}")
    print(f"  去重后: {stats['unique']}")
    print(f"  重复组: {stats['duplicate_groups']}")
    print(f"  待删除: {len(to_delete)}")

    if not to_delete:
        print("\n✓ 没有重复来源")
        return

    print(f"\n重复来源列表:")
    for item in to_delete:
        print(f"  - {item['title'][:60]}...")

    if args.dry_run:
        print(f"\n[干跑] 跳过删除 ({len(to_delete)} 个来源)")
        return

    # 确认删除
    confirm = input(f"\n确认删除 {len(to_delete)} 个重复来源? [y/N] ")
    if confirm.lower() != "y":
        print("取消")
        return

    # 执行删除
    success, failed = 0, 0
    for item in to_delete:
        try:
            delete_source(client, item["id"])
            print(f"✓ 删除: {item['title'][:50]}...")
            success += 1
        except Exception as e:
            print(f"✗ 失败: {item['id']} - {e}")
            failed += 1

    print(f"\n结果: {success} 成功, {failed} 失败")


if __name__ == "__main__":
    main()
