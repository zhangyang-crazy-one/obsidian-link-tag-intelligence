#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
UI/UX Pro Max Core - BM25 search engine for UI/UX style guides.

Adds lightweight multilingual query expansion so Chinese UI / interior-design
queries can hit the English CSV knowledge base without external dependencies.
"""

from __future__ import annotations

import csv
import re
from collections import defaultdict
from math import log
from pathlib import Path

# ============ CONFIGURATION ============
DATA_DIR = Path(__file__).parent.parent / "data"
MAX_RESULTS = 3

CSV_CONFIG = {
    "style": {
        "file": "styles.csv",
        "search_cols": ["Style Category", "Keywords", "Best For", "Type"],
        "output_cols": ["Style Category", "Type", "Keywords", "Primary Colors", "Effects & Animation", "Best For", "Performance", "Accessibility", "Framework Compatibility", "Complexity"],
    },
    "prompt": {
        "file": "prompts.csv",
        "search_cols": ["Style Category", "AI Prompt Keywords (Copy-Paste Ready)", "CSS/Technical Keywords"],
        "output_cols": ["Style Category", "AI Prompt Keywords (Copy-Paste Ready)", "CSS/Technical Keywords", "Implementation Checklist"],
    },
    "color": {
        "file": "colors.csv",
        "search_cols": ["Product Type", "Keywords", "Notes"],
        "output_cols": ["Product Type", "Keywords", "Primary (Hex)", "Secondary (Hex)", "CTA (Hex)", "Background (Hex)", "Text (Hex)", "Border (Hex)", "Notes"],
    },
    "chart": {
        "file": "charts.csv",
        "search_cols": ["Data Type", "Keywords", "Best Chart Type", "Accessibility Notes"],
        "output_cols": ["Data Type", "Keywords", "Best Chart Type", "Secondary Options", "Color Guidance", "Accessibility Notes", "Library Recommendation", "Interactive Level"],
    },
    "landing": {
        "file": "landing.csv",
        "search_cols": ["Pattern Name", "Keywords", "Conversion Optimization", "Section Order"],
        "output_cols": ["Pattern Name", "Keywords", "Section Order", "Primary CTA Placement", "Color Strategy", "Conversion Optimization"],
    },
    "product": {
        "file": "products.csv",
        "search_cols": ["Product Type", "Keywords", "Primary Style Recommendation", "Key Considerations"],
        "output_cols": ["Product Type", "Keywords", "Primary Style Recommendation", "Secondary Styles", "Landing Page Pattern", "Dashboard Style (if applicable)", "Color Palette Focus"],
    },
    "ux": {
        "file": "ux-guidelines.csv",
        "search_cols": ["Category", "Issue", "Description", "Platform"],
        "output_cols": ["Category", "Issue", "Platform", "Description", "Do", "Don't", "Code Example Good", "Code Example Bad", "Severity"],
    },
    "typography": {
        "file": "typography.csv",
        "search_cols": ["Font Pairing Name", "Category", "Mood/Style Keywords", "Best For", "Heading Font", "Body Font"],
        "output_cols": ["Font Pairing Name", "Category", "Heading Font", "Body Font", "Mood/Style Keywords", "Best For", "Google Fonts URL", "CSS Import", "Tailwind Config", "Notes"],
    },
}

STACK_CONFIG = {
    "html-tailwind": {"file": "stacks/html-tailwind.csv"},
    "react": {"file": "stacks/react.csv"},
    "nextjs": {"file": "stacks/nextjs.csv"},
    "vue": {"file": "stacks/vue.csv"},
    "nuxtjs": {"file": "stacks/nuxtjs.csv"},
    "nuxt-ui": {"file": "stacks/nuxt-ui.csv"},
    "svelte": {"file": "stacks/svelte.csv"},
    "swiftui": {"file": "stacks/swiftui.csv"},
    "react-native": {"file": "stacks/react-native.csv"},
    "flutter": {"file": "stacks/flutter.csv"},
}

_STACK_COLS = {
    "search_cols": ["Category", "Guideline", "Description", "Do", "Don't"],
    "output_cols": ["Category", "Guideline", "Description", "Do", "Don't", "Code Good", "Code Bad", "Severity", "Docs URL"],
}

AVAILABLE_STACKS = list(STACK_CONFIG.keys())

# Phrase expansion keeps the local CSV search useful for Chinese queries and
# reality-grounded aesthetics such as home/interior palette tasks.
QUERY_EXPANSIONS = [
    ("ui/ux", "ui ux interface user experience"),
    ("ui ux", "ui ux interface user experience"),
    ("前端", "frontend web interface component"),
    ("界面", "ui interface layout"),
    ("落地页", "landing page hero cta conversion"),
    ("着陆页", "landing page hero cta conversion"),
    ("仪表盘", "dashboard analytics kpi chart"),
    ("后台", "admin dashboard table form"),
    ("管理后台", "admin dashboard table form"),
    ("设计系统", "design system tokens components typography color"),
    ("无障碍", "accessibility wcag contrast keyboard focus"),
    ("可访问性", "accessibility wcag contrast keyboard focus"),
    ("动效", "animation motion micro-interactions transition"),
    ("动画", "animation motion micro-interactions transition"),
    ("配色", "color palette"),
    ("色彩", "color palette"),
    ("字体", "typography font pairing"),
    ("家装配色", "home interior residential decor color palette"),
    ("家装", "home interior residential decor renovation"),
    ("家居", "home decor interior residential"),
    ("室内", "interior architecture residential space"),
    ("空间", "space spatial interior atmosphere"),
    ("住宅", "residential home interior"),
    ("装修", "renovation interior residential decor"),
    ("客厅", "living room interior residential"),
    ("卧室", "bedroom interior residential"),
    ("厨房", "kitchen interior residential"),
    ("浴室", "bathroom interior residential"),
    ("卫生间", "bathroom interior residential"),
    ("酒店", "hotel hospitality luxury interior"),
    ("民宿", "hospitality boutique interior"),
    ("展厅", "showroom exhibition spatial brand"),
    ("品牌空间", "brand space retail interior"),
    ("原木", "wood oak walnut natural wood"),
    ("木质", "wood oak walnut natural wood"),
    ("奶油风", "cream ivory warm neutral soft minimal"),
    ("暖中性", "warm neutral ivory greige taupe"),
    ("米白", "ivory off-white warm neutral"),
    ("灰褐", "taupe greige mushroom"),
    ("鼠尾草绿", "sage green muted green"),
    ("陶土", "terracotta rust earthy accent"),
    ("侘寂", "wabi sabi organic earthy minimal japanese"),
    ("日式", "japanese japandi minimal wood"),
    ("北欧", "nordic scandinavian minimal"),
    ("轻奢", "luxury premium editorial gold minimal"),
    ("极简", "minimal minimalism swiss clean"),
    ("japandi", "interior minimal wood warm neutral"),
    ("organic modern", "interior earthy tactile warm neutral"),
    ("wabi sabi", "japanese organic earthy minimal"),
    ("home decor", "interior residential decor"),
    ("interior", "architecture residential home decor"),
    ("hospitality", "hotel interior premium"),
]


def _unique_preserve(items):
    seen = set()
    ordered = []
    for item in items:
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        ordered.append(item)
    return ordered


def expand_query(query):
    """Append lightweight English expansions for multilingual / spatial queries."""
    raw = str(query).strip()
    lowered = raw.lower()
    expansions = []

    for needle, expanded in QUERY_EXPANSIONS:
        if needle in lowered or needle in raw:
            expansions.extend(expanded.split())

    if not expansions:
        return raw, []

    existing_tokens = set(re.findall(r"[\w#-]+", lowered))
    appended = []
    for token in _unique_preserve(expansions):
        if token.lower() not in existing_tokens:
            appended.append(token)

    if not appended:
        return raw, []

    return f"{raw} {' '.join(appended)}", appended


# ============ BM25 IMPLEMENTATION ============
class BM25:
    """BM25 ranking algorithm for text search."""

    def __init__(self, k1=1.5, b=0.75):
        self.k1 = k1
        self.b = b
        self.corpus = []
        self.doc_lengths = []
        self.avgdl = 0
        self.idf = {}
        self.doc_freqs = defaultdict(int)
        self.N = 0

    def tokenize(self, text):
        """Lowercase, split, remove punctuation, keep short UI tokens like ui/ux."""
        text = re.sub(r"[^\w\s#-]", " ", str(text).lower())
        return [word for word in text.split() if len(word) > 1]

    def fit(self, documents):
        """Build BM25 index from documents."""
        self.corpus = [self.tokenize(doc) for doc in documents]
        self.N = len(self.corpus)
        if self.N == 0:
            return

        self.doc_lengths = [len(doc) for doc in self.corpus]
        self.avgdl = sum(self.doc_lengths) / self.N

        for doc in self.corpus:
            seen = set()
            for word in doc:
                if word not in seen:
                    self.doc_freqs[word] += 1
                    seen.add(word)

        for word, freq in self.doc_freqs.items():
            self.idf[word] = log((self.N - freq + 0.5) / (freq + 0.5) + 1)

    def score(self, query):
        """Score all documents against query."""
        query_tokens = self.tokenize(query)
        scores = []

        for idx, doc in enumerate(self.corpus):
            score = 0
            doc_len = self.doc_lengths[idx]
            term_freqs = defaultdict(int)
            for word in doc:
                term_freqs[word] += 1

            for token in query_tokens:
                if token in self.idf:
                    tf = term_freqs[token]
                    idf = self.idf[token]
                    numerator = tf * (self.k1 + 1)
                    denominator = tf + self.k1 * (1 - self.b + self.b * doc_len / self.avgdl)
                    score += idf * numerator / denominator

            scores.append((idx, score))

        return sorted(scores, key=lambda item: item[1], reverse=True)


# ============ SEARCH FUNCTIONS ============
def _load_csv(filepath):
    """Load CSV and return list of dicts."""
    with open(filepath, "r", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def _search_csv(filepath, search_cols, output_cols, query, max_results):
    """Core search function using BM25."""
    if not filepath.exists():
        return []

    data = _load_csv(filepath)
    documents = [" ".join(str(row.get(col, "")) for col in search_cols) for row in data]

    bm25 = BM25()
    bm25.fit(documents)
    ranked = bm25.score(query)

    results = []
    for idx, score in ranked[:max_results]:
        if score > 0:
            row = data[idx]
            results.append({col: row.get(col, "") for col in output_cols if col in row})

    return results


def detect_domain(query):
    """Auto-detect the most relevant domain from query."""
    normalized_query, _ = expand_query(query)
    query_lower = normalized_query.lower()

    domain_keywords = {
        "color": ["color", "palette", "hex", "rgb", "配色", "颜色", "色彩", "neutral", "sage", "terracotta"],
        "chart": ["chart", "graph", "visualization", "trend", "bar", "pie", "scatter", "heatmap", "funnel", "dashboard"],
        "landing": ["landing", "page", "cta", "conversion", "hero", "testimonial", "pricing", "section", "落地页"],
        "product": ["saas", "ecommerce", "fintech", "healthcare", "gaming", "portfolio", "crypto", "dashboard", "interior", "architecture", "hotel", "hospitality", "home", "家装", "空间", "住宅"],
        "prompt": ["prompt", "css", "implementation", "variable", "checklist", "tailwind"],
        "style": ["style", "design", "ui", "minimalism", "glassmorphism", "neumorphism", "brutalism", "dark mode", "flat", "aurora", "japandi", "wabi", "editorial"],
        "ux": ["ux", "usability", "accessibility", "wcag", "touch", "scroll", "animation", "keyboard", "navigation", "mobile", "无障碍"],
        "typography": ["font", "typography", "heading", "serif", "sans", "字体"],
    }

    scores = {
        domain: sum(1 for keyword in keywords if keyword in query_lower)
        for domain, keywords in domain_keywords.items()
    }
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "style"


def search(query, domain=None, max_results=MAX_RESULTS):
    """Main search function with auto-domain detection and query expansion."""
    normalized_query, expansions = expand_query(query)
    if domain is None:
        domain = detect_domain(normalized_query)

    config = CSV_CONFIG.get(domain, CSV_CONFIG["style"])
    filepath = DATA_DIR / config["file"]

    if not filepath.exists():
        return {"error": f"File not found: {filepath}", "domain": domain}

    results = _search_csv(
        filepath,
        config["search_cols"],
        config["output_cols"],
        normalized_query,
        max_results,
    )

    return {
        "domain": domain,
        "query": query,
        "normalized_query": normalized_query,
        "expansions": expansions,
        "file": config["file"],
        "count": len(results),
        "results": results,
    }


def search_stack(query, stack, max_results=MAX_RESULTS):
    """Search stack-specific guidelines."""
    if stack not in STACK_CONFIG:
        return {"error": f"Unknown stack: {stack}. Available: {', '.join(AVAILABLE_STACKS)}"}

    normalized_query, expansions = expand_query(query)
    filepath = DATA_DIR / STACK_CONFIG[stack]["file"]

    if not filepath.exists():
        return {"error": f"Stack file not found: {filepath}", "stack": stack}

    results = _search_csv(
        filepath,
        _STACK_COLS["search_cols"],
        _STACK_COLS["output_cols"],
        normalized_query,
        max_results,
    )

    return {
        "domain": "stack",
        "stack": stack,
        "query": query,
        "normalized_query": normalized_query,
        "expansions": expansions,
        "file": STACK_CONFIG[stack]["file"],
        "count": len(results),
        "results": results,
    }
