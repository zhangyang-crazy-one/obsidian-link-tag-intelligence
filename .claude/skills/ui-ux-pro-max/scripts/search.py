#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
UI/UX Pro Max Search - BM25 search engine for UI/UX design guides.

Usage:
  python search.py "<query>" [--domain <domain>] [--stack <stack>] [--max-results 3]

Domains:
  style, prompt, color, chart, landing, product, ux, typography

Stacks:
  html-tailwind, react, nextjs, vue, nuxtjs, nuxt-ui, svelte,
  swiftui, react-native, flutter
"""

from __future__ import annotations

import argparse
import json
import sys

from core import AVAILABLE_STACKS, CSV_CONFIG, MAX_RESULTS, search, search_stack

IS_WINDOWS = sys.platform.startswith("win")

EMOJI_REPLACEMENTS = {
    "✓": "[OK]",
    "✔": "[OK]",
    "⚠": "[WARN]",
    "⚠️": "[WARN]",
    "❌": "[X]",
    "✗": "[X]",
    "⭐": "[*]",
    "🎨": "[ART]",
    "🚀": "[ROCKET]",
    "⚙️": "[GEAR]",
    "⚙": "[GEAR]",
    "💡": "[TIP]",
    "📦": "[PKG]",
    "🔧": "[TOOL]",
    "⬆": "[UP]",
    "⬇": "[DOWN]",
    "➡": "[->]",
    "⬅": "[<-]",
    "→": "->",
    "←": "<-",
    "⚡": "[FAST]",
    "🔥": "[HOT]",
    "💎": "[GEM]",
    "🎯": "[TARGET]",
    "📝": "[NOTE]",
    "🔗": "[LINK]",
    "📊": "[CHART]",
    "📈": "[UP]",
    "📉": "[DOWN]",
}


def sanitize_for_windows(text):
    """Replace emoji with ASCII text for Windows console compatibility."""
    if not IS_WINDOWS:
        return text
    for emoji, replacement in EMOJI_REPLACEMENTS.items():
        text = text.replace(emoji, replacement)
    return text


def format_output(result):
    """Format results for LLM consumption with minimal noise."""
    if "error" in result:
        return f"Error: {result['error']}"

    output = []
    if result.get("stack"):
        output.append("## UI/UX Pro Max Stack Guidelines")
        output.append(f"**Stack:** {result['stack']} | **Query:** {result['query']}")
    else:
        output.append("## UI/UX Pro Max Search Results")
        output.append(f"**Domain:** {result['domain']} | **Query:** {result['query']}")

    normalized_query = result.get("normalized_query")
    if normalized_query and normalized_query != result.get("query"):
        output.append(f"**Expanded Query:** {normalized_query}")

    output.append(f"**Source:** {result['file']} | **Found:** {result['count']} results\n")

    for i, row in enumerate(result["results"], 1):
        output.append(f"### Result {i}")
        for key, value in row.items():
            value_str = str(value)
            if len(value_str) > 300:
                value_str = value_str[:300] + "..."
            output.append(f"- **{key}:** {value_str}")
        output.append("")

    if result["count"] == 0:
        output.append("No results found. Try another domain, clearer product/type words, or a more specific style query.")

    return sanitize_for_windows("\n".join(output))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="UI/UX Pro Max Search")
    parser.add_argument("query", help="Search query")
    parser.add_argument("--domain", "-d", choices=list(CSV_CONFIG.keys()), help="Search domain")
    parser.add_argument("--stack", "-s", choices=AVAILABLE_STACKS, help="Stack-specific search")
    parser.add_argument("--max-results", "-n", type=int, default=MAX_RESULTS, help="Max results (default: 3)")
    parser.add_argument("--json", action="store_true", help="Output as JSON")

    args = parser.parse_args()

    result = search_stack(args.query, args.stack, args.max_results) if args.stack else search(args.query, args.domain, args.max_results)

    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print(format_output(result))
