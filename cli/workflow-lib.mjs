import { promises as fs } from "node:fs";
import path from "node:path";

import {
  buildSourceKey,
  ingestResearchSource,
  normalizeArxivId,
  normalizeDoi,
  parseArxivEntry,
  slugify
} from "./research-lib.mjs";

const DEFAULT_FOLDERS = {
  literature: "Knowledge/Research/Literature",
  attachments: "Knowledge/Research/Attachments",
  topics: "Knowledge/Research/Topics",
  analysis: "Knowledge/Research/Analysis",
  drafts: "Knowledge/Research/Drafts"
};

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const normalized = trimString(value);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function toPosix(value) {
  return value.replace(/\\/g, "/");
}

function basenameWithoutExtension(filePath) {
  return path.posix.basename(filePath, path.posix.extname(filePath));
}

function hasAsciiSignal(value) {
  return /[a-z0-9]/i.test(trimString(value));
}

function hashStringBase36(value) {
  let hash = 5381;
  for (const character of trimString(value)) {
    const codePoint = character.codePointAt(0) ?? 0;
    hash = (((hash << 5) + hash) ^ codePoint) >>> 0;
  }
  return hash.toString(36);
}

function buildStableTopicSlug(value) {
  const normalized = trimString(value);
  if (!normalized) {
    return "topic";
  }

  const asciiSlug = slugify(normalized);
  if (asciiSlug !== "item" || hasAsciiSignal(normalized)) {
    return asciiSlug;
  }

  return `topic-${hashStringBase36(normalized)}`;
}

function buildWikilink(targetPath, alias = "") {
  const base = basenameWithoutExtension(toPosix(targetPath));
  return alias ? `[[${base}|${alias}]]` : `[[${base}]]`;
}

function firstSentence(value) {
  const normalized = trimString(value).replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }
  const match = normalized.match(/^(.+?[.!?])(?:\s|$)/);
  return match?.[1] ? match[1].trim() : normalized;
}

function yamlArrayBlock(key, values) {
  const normalized = uniqueStrings(values);
  if (normalized.length === 0) {
    return [`${key}: []`];
  }
  return [
    `${key}:`,
    ...normalized.map((value) => `  - ${JSON.stringify(value)}`)
  ];
}

function buildFrontmatter({ title, tags = [], relations = {}, extra = {} }) {
  const lines = [
    "---",
    `title: ${JSON.stringify(trimString(title || "Untitled note"))}`
  ];

  for (const [key, value] of Object.entries(extra)) {
    if (Array.isArray(value)) {
      lines.push(...yamlArrayBlock(key, value.map(String)));
      continue;
    }
    lines.push(`${key}: ${JSON.stringify(value ?? "")}`);
  }

  for (const [relationKey, targets] of Object.entries(relations)) {
    lines.push(...yamlArrayBlock(relationKey, targets));
  }

  lines.push(...yamlArrayBlock("tags", tags));
  lines.push("---");
  return lines;
}

function extractCitationAuthor(metadata) {
  const authors = Array.isArray(metadata.authors) ? metadata.authors.map(String).filter(Boolean) : [];
  const author = authors[0] || trimString(metadata.author || "");
  if (!author) {
    return "Unknown";
  }
  const parts = author.split(/\s+/).filter(Boolean);
  return parts.at(-1) ?? author;
}

function getCitationCount(metadata) {
  const value = Number.parseInt(String(metadata.cited_by_count ?? ""), 10);
  return Number.isFinite(value) ? value : 0;
}

function getReferenceCount(metadata) {
  const explicit = Number.parseInt(String(metadata.referenced_works_count ?? ""), 10);
  if (Number.isFinite(explicit)) {
    return explicit;
  }
  return Array.isArray(metadata.referenced_works) ? metadata.referenced_works.length : 0;
}

function getRelatedWorkCount(metadata) {
  const explicit = Number.parseInt(String(metadata.related_works_count ?? ""), 10);
  if (Number.isFinite(explicit)) {
    return explicit;
  }
  return Array.isArray(metadata.related_works) ? metadata.related_works.length : 0;
}

function getOpenAlexConcepts(metadata, limit = 5) {
  return uniqueStrings(
    (Array.isArray(metadata.concepts) ? metadata.concepts : [])
      .map((item) => trimString(typeof item === "string" ? item : item?.display_name || item?.concept?.display_name || ""))
  )
    .slice(0, Math.max(0, limit));
}

function formatConceptList(metadata, limit = 4) {
  const concepts = getOpenAlexConcepts(metadata, limit);
  return concepts.length > 0 ? concepts.join(", ") : "not available";
}

function formatRecentCitationTrend(metadata, limit = 3) {
  const counts = Array.isArray(metadata.counts_by_year) ? metadata.counts_by_year : [];
  const normalized = counts
    .map((item) => ({
      year: Number.parseInt(String(item?.year ?? ""), 10),
      citedByCount: Number.parseInt(String(item?.cited_by_count ?? ""), 10)
    }))
    .filter((item) => Number.isFinite(item.year) && Number.isFinite(item.citedByCount))
    .slice(0, Math.max(0, limit));

  return normalized.length > 0
    ? normalized.map((item) => `${item.year}:${item.citedByCount}`).join(", ")
    : "not available";
}

function getTopCitedSourceItems(sourceItems, limit = 2) {
  return [...sourceItems]
    .sort((left, right) => getCitationCount(right.metadata) - getCitationCount(left.metadata))
    .slice(0, Math.max(0, limit));
}

export function formatParentheticalCitation(metadata) {
  const authors = Array.isArray(metadata.authors) ? metadata.authors.map(String).filter(Boolean) : [];
  const year = trimString(metadata.year || "") || "n.d.";

  if (authors.length === 0) {
    return `(Unknown, ${year})`;
  }

  const surnames = authors.map((author) => {
    const parts = author.split(/\s+/).filter(Boolean);
    return parts.at(-1) ?? author;
  });

  if (surnames.length === 1) {
    return `(${surnames[0]}, ${year})`;
  }
  if (surnames.length === 2) {
    return `(${surnames[0]} & ${surnames[1]}, ${year})`;
  }
  return `(${surnames[0]} et al., ${year})`;
}

export function parseSourceSpecs(text, defaultSourceType = "arxiv") {
  const normalizedDefault = trimString(defaultSourceType).toLowerCase() || "arxiv";
  const rawSpecs = trimString(text)
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

  return rawSpecs.map((rawSpec) => {
    const separatorIndex = rawSpec.indexOf(":");
    if (separatorIndex > 0) {
      const prefix = rawSpec.slice(0, separatorIndex).trim().toLowerCase();
      const remainder = rawSpec.slice(separatorIndex + 1).trim();
      if (["doi", "arxiv", "pdf"].includes(prefix) && remainder) {
        return {
          sourceType: prefix,
          source: prefix === "doi" ? normalizeDoi(remainder) : prefix === "arxiv" ? normalizeArxivId(remainder) : remainder
        };
      }
    }

    if (/^10\.\S+/i.test(rawSpec) || /^https?:\/\/(dx\.)?doi\.org\//i.test(rawSpec)) {
      return { sourceType: "doi", source: normalizeDoi(rawSpec) };
    }
    if (/\.pdf($|\?)/i.test(rawSpec) || /^https?:\/\/.+\.pdf($|\?)/i.test(rawSpec)) {
      return { sourceType: "pdf", source: rawSpec };
    }
    return {
      sourceType: normalizedDefault,
      source: normalizedDefault === "doi" ? normalizeDoi(rawSpec) : normalizedDefault === "arxiv" ? normalizeArxivId(rawSpec) : rawSpec
    };
  }).filter((item) => trimString(item.source));
}

function parseArxivEntries(xml) {
  return uniqueStrings(
    [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)]
      .map((match) => {
        try {
          const parsed = parseArxivEntry(`<feed xmlns:arxiv="http://arxiv.org/schemas/atom">${match[0]}</feed>`);
          return JSON.stringify(parsed);
        } catch {
          return "";
        }
      })
      .filter(Boolean)
  ).map((entry) => JSON.parse(entry));
}

export async function searchArxivPapers(query, maxResults = 5, fetchImpl = fetch) {
  const normalizedQuery = trimString(query);
  if (!normalizedQuery) {
    throw new Error("missing-query");
  }

  const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(normalizedQuery)}&start=0&max_results=${Math.max(1, Number(maxResults) || 5)}&sortBy=relevance&sortOrder=descending`;
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/atom+xml,text/xml"
    }
  });

  if (!response.ok) {
    throw new Error(`arxiv-search-failed:${response.status}`);
  }

  const xml = await response.text();
  const results = parseArxivEntries(xml);
  return {
    status: "ok",
    query: normalizedQuery,
    count: results.length,
    results
  };
}

export function inferResearchTags(topic, metadata) {
  const normalizedTopic = trimString(topic).toLowerCase();
  const text = `${trimString(metadata.title || "")} ${trimString(metadata.abstract || "")} ${getOpenAlexConcepts(metadata, 8).join(" ")}`.toLowerCase();
  const tags = ["literature-note"];

  if (normalizedTopic.includes("data governance") || /数据治理|governance/.test(`${topic} ${text}`)) {
    tags.push("data-governance");
    tags.push("governance-mechanism");
  }
  if (normalizedTopic.includes("digital transformation") || /数智转型|数字化转型|digital transformation|transformation/.test(`${topic} ${text}`)) {
    tags.push("digital-transformation");
  }
  if (normalizedTopic.includes("intelligent") || /数智|智能|intelligent|ai|artificial intelligence/.test(`${topic} ${text}`)) {
    tags.push("intelligent-transformation");
  }
  if (/platform/.test(text)) {
    tags.push("platform-governance");
  }
  if (/organiz|enterprise|firm/.test(text)) {
    tags.push("organizational-capability");
  }
  if (/framework|model|mechanism/.test(text)) {
    tags.push("framework");
  }
  if (/case study|case-study/.test(text)) {
    tags.push("case-study");
  } else if (/empirical|experiment|survey|dataset/.test(text)) {
    tags.push("empirical");
  } else {
    tags.push("conceptual");
  }

  return uniqueStrings(tags);
}

function deriveFolders(flags = {}) {
  return {
    literature: trimString(flags["literature-folder"] || flags.literatureFolder || DEFAULT_FOLDERS.literature),
    attachments: trimString(flags["attachments-folder"] || flags.attachmentsFolder || DEFAULT_FOLDERS.attachments),
    topics: trimString(flags["topics-folder"] || flags.topicsFolder || DEFAULT_FOLDERS.topics),
    analysis: trimString(flags["analysis-folder"] || flags.analysisFolder || DEFAULT_FOLDERS.analysis),
    drafts: trimString(flags["drafts-folder"] || flags.draftsFolder || DEFAULT_FOLDERS.drafts)
  };
}

function buildTopicTags(topic, sourceItems) {
  return uniqueStrings([
    "topic-note",
    ...inferResearchTags(topic, { title: topic, abstract: "" }).filter((tag) => !["literature-note", "framework", "case-study", "empirical", "conceptual"].includes(tag)),
    ...sourceItems.flatMap((item) => item.tags.filter((tag) => !["literature-note", "framework", "case-study", "empirical", "conceptual"].includes(tag)))
  ]);
}

async function ensureDirectories(vaultPath, folders) {
  await Promise.all(Object.values(folders).map((folder) => fs.mkdir(path.join(vaultPath, folder), { recursive: true })));
}

function buildTopicPaths(topic, folders) {
  const slug = buildStableTopicSlug(topic);
  return {
    slug,
    topicPath: toPosix(path.posix.join(folders.topics, `${slug}.md`)),
    matrixPath: toPosix(path.posix.join(folders.analysis, `${slug}-comparison-matrix.md`)),
    mapPath: toPosix(path.posix.join(folders.analysis, `${slug}-literature-map.md`)),
    outlinePath: toPosix(path.posix.join(folders.drafts, `${slug}-outline.md`)),
    draftPath: toPosix(path.posix.join(folders.drafts, `${slug}-draft.md`))
  };
}

function buildAnalysisPath(folders, topicSlug, metadata) {
  return toPosix(path.posix.join(folders.analysis, `${topicSlug}-${buildSourceKey(metadata)}-analysis.md`));
}

function buildTopicNote(topic, paths, sourceItems) {
  const topicTags = buildTopicTags(topic, sourceItems);
  const lines = [
    ...buildFrontmatter({
      title: topic,
      tags: topicTags,
      relations: {
        same_question: sourceItems.map((item) => item.notePath),
        reviews: sourceItems.map((item) => item.analysisPath)
      },
      extra: {
        generated_by: "lti-research paper workflow"
      }
    }),
    "",
    `# ${topic}`,
    "",
    "## Topic overview",
    `- Topic note: ${buildWikilink(paths.topicPath)}`,
    `- Comparison matrix: ${buildWikilink(paths.matrixPath)}`,
    `- Literature map: ${buildWikilink(paths.mapPath)}`,
    `- Outline: ${buildWikilink(paths.outlinePath)}`,
    `- Draft: ${buildWikilink(paths.draftPath)}`,
    "",
    "## Source notes",
    ...sourceItems.map((item) => `- ${buildWikilink(item.notePath)} ${formatParentheticalCitation(item.metadata)}`),
    "",
    "## Analysis notes",
    ...sourceItems.map((item) => `- ${buildWikilink(item.analysisPath)} -> ${buildWikilink(item.notePath)}`)
  ];
  return `${lines.join("\n")}\n`;
}

function buildAnalysisNote(topic, paths, item) {
  const citation = formatParentheticalCitation(item.metadata);
  const summary = firstSentence(item.metadata.abstract || "");
  const citationCount = getCitationCount(item.metadata);
  const referenceCount = getReferenceCount(item.metadata);
  const relatedWorkCount = getRelatedWorkCount(item.metadata);
  const lines = [
    ...buildFrontmatter({
      title: `${item.metadata.title} Analysis`,
      tags: uniqueStrings(["analysis-note", "analyzed", ...item.tags.filter((tag) => tag !== "literature-note")]),
      relations: {
        same_question: [paths.topicPath],
        reviews: [item.notePath],
        evidence_for: [paths.draftPath]
      },
      extra: {
        citekey: trimString(item.metadata.citation_key || ""),
        year: trimString(item.metadata.year || "")
      }
    }),
    "",
    `# ${item.metadata.title} Analysis`,
    "",
    "## Source linkage",
    `- Topic: ${buildWikilink(paths.topicPath)}`,
    `- Literature note: ${buildWikilink(item.notePath)}`,
    `- Citation: ${citation}`,
    "",
    "## Core claim",
    summary ? `- ${summary}` : "- Abstract summary unavailable.",
    "",
    "## Citation context",
    `- OpenAlex cited-by count: ${citationCount}`,
    `- Referenced works tracked: ${referenceCount}`,
    `- Related works tracked: ${relatedWorkCount}`,
    `- Core concepts: ${formatConceptList(item.metadata)}`,
    `- Recent citation trend: ${formatRecentCitationTrend(item.metadata)}`,
    "",
    "## Relevance to topic",
    `- This source is analyzed under the theme "${topic}".`,
    ...item.tags.filter((tag) => tag !== "literature-note").map((tag) => `- Tag lens: #${tag}`),
    "",
    "## Evidence anchors",
    `- Draft target: ${buildWikilink(paths.draftPath)}`,
    "",
    "## Limitations",
    "- Review manually against the PDF before using as final evidence.",
    ""
  ];
  return `${lines.join("\n")}\n`;
}

function buildMatrixNote(topic, paths, sourceItems) {
  const lines = [
    ...buildFrontmatter({
      title: `${topic} Comparison Matrix`,
      tags: ["analysis-note", "comparison-matrix", "analyzed"],
      relations: {
        same_question: [paths.topicPath],
        reviews: sourceItems.map((item) => item.analysisPath)
      }
    }),
    "",
    `# ${topic} Comparison Matrix`,
    "",
    "| Source | Year | Method | Citations | Concepts | Core contribution | Topic tags | Link |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...sourceItems.map((item) => {
      const method = item.tags.find((tag) => ["framework", "case-study", "empirical", "conceptual"].includes(tag)) ?? "conceptual";
      const contribution = firstSentence(item.metadata.abstract || "").replace(/\|/g, "/");
      return `| ${item.metadata.title.replace(/\|/g, "/")} | ${item.metadata.year || ""} | ${method} | ${getCitationCount(item.metadata)} | ${formatConceptList(item.metadata, 3).replace(/\|/g, "/")} | ${contribution} | ${item.tags.filter((tag) => tag !== "literature-note").join(", ")} | ${buildWikilink(item.analysisPath)} |`;
    }),
    ""
  ];
  return `${lines.join("\n")}\n`;
}

function buildMapNote(topic, paths, sourceItems) {
  const grouped = new Map();
  for (const item of sourceItems) {
    for (const tag of item.tags.filter((tag) => ["data-governance", "digital-transformation", "intelligent-transformation", "governance-mechanism", "organizational-capability", "platform-governance"].includes(tag))) {
      grouped.set(tag, [...(grouped.get(tag) ?? []), item]);
    }
  }

  const lines = [
    ...buildFrontmatter({
      title: `${topic} Literature Map`,
      tags: ["analysis-note", "literature-map", "analyzed"],
      relations: {
        same_question: [paths.topicPath],
        reviews: sourceItems.map((item) => item.analysisPath)
      }
    }),
    "",
    `# ${topic} Literature Map`,
    "",
    "## Grouped by analytical lens"
  ];

  for (const [tag, items] of grouped.entries()) {
    lines.push("", `### ${tag}`);
    for (const item of items) {
      lines.push(`- ${buildWikilink(item.analysisPath)} ${formatParentheticalCitation(item.metadata)}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function buildOutlineNote(topic, paths, sourceItems) {
  const topCitedItems = getTopCitedSourceItems(sourceItems, 2);
  const lines = [
    ...buildFrontmatter({
      title: `${topic} Outline`,
      tags: ["outline-note", "draft-note", "draft"],
      relations: {
        same_question: [paths.topicPath],
        reviews: sourceItems.map((item) => item.analysisPath)
      }
    }),
    "",
    `# ${topic} Outline`,
    "",
    "## Abstract",
    ...sourceItems.slice(0, 2).map((item) => `- Use ${buildWikilink(item.analysisPath)} ${formatParentheticalCitation(item.metadata)}`),
    "",
    "## Introduction",
    ...sourceItems.map((item) => `- Introduce ${item.metadata.title} ${formatParentheticalCitation(item.metadata)}`),
    "",
    "## Related research",
    ...sourceItems.map((item) => `- Review ${buildWikilink(item.analysisPath)}`),
    "",
    "## Analytical framework",
    "- Contrast data governance, digital transformation, and intelligent transformation lenses.",
    "",
    "## Comparative findings",
    "- Summarize converging and diverging viewpoints from the comparison matrix.",
    "",
    "## Citation strategy",
    ...topCitedItems.map((item) => `- Anchor with ${buildWikilink(item.analysisPath)} because OpenAlex currently reports ${getCitationCount(item.metadata)} citations.`),
    "",
    "## Discussion",
    "- Evaluate what the current literature explains well and what remains weakly specified.",
    "",
    "## Conclusion",
    "- Summarize the governance implications for digital and intelligent transformation."
  ];
  return `${lines.join("\n")}\n`;
}

function buildDraftNote(topic, paths, sourceItems) {
  const topicTags = buildTopicTags(topic, sourceItems).filter((tag) => tag !== "topic-note");
  const introCitations = sourceItems.map((item) => formatParentheticalCitation(item.metadata)).join("；");
  const topCitedItems = getTopCitedSourceItems(sourceItems, 2);
  const relatedWorkParagraphs = sourceItems.map((item) => {
    const abstractLead = firstSentence(item.metadata.abstract || "");
    return `### ${item.metadata.title}\n${formatParentheticalCitation(item.metadata)} 关注 ${item.tags.filter((tag) => !["literature-note", "framework", "case-study", "empirical", "conceptual"].includes(tag)).join("、") || "相关主题"}。其摘要中的关键信息是：${abstractLead || "需要人工补充阅读摘录"}。OpenAlex 目前记录其被引 ${getCitationCount(item.metadata)} 次、参考文献 ${getReferenceCount(item.metadata)} 篇，核心概念包括 ${formatConceptList(item.metadata, 4)}。对应分析笔记见 ${buildWikilink(item.analysisPath)}。`;
  });

  const lines = [
    ...buildFrontmatter({
      title: `${topic} Draft`,
      tags: uniqueStrings(["draft-note", "drafted", ...topicTags]),
      relations: {
        same_question: [paths.topicPath],
        reviews: sourceItems.map((item) => item.analysisPath)
      }
    }),
    "",
    `# ${topic} 研究论文初稿`,
    "",
    "## 摘要",
    `${topic} 已成为组织数智转型过程中的关键议题。基于当前文献组，本稿围绕治理机制、组织能力与转型实施三个维度，对相关研究进行结构化梳理，并形成一版可继续迭代的中文初稿。`,
    "",
    "## 引言",
    `${topic} 涉及技术部署、组织协调、数据制度与平台治理等多个层面。现有研究从不同视角展开讨论，形成了若干互补但尚未完全整合的知识脉络 ${introCitations}。本稿的目标不是给出终局性结论，而是将这些文献组织成可追溯、可编辑的研究写作工作流。`,
    "",
    "## 相关研究",
    ...relatedWorkParagraphs.flatMap((paragraph) => ["", paragraph]),
    "",
    "## 数据治理与数智转型的分析框架",
    "本稿将现有研究暂时归纳为三个分析层面：第一，数据治理机制与制度设计；第二，数字化或数智化转型中的组织能力；第三，平台、模型或框架层面的治理实现。该框架对应的比较结果见比较矩阵与文献地图。",
    "",
    "## 文献比较与综合发现",
    `综合 ${buildWikilink(paths.matrixPath)} 与 ${buildWikilink(paths.mapPath)} 可以看到，现有研究在研究对象与方法上存在差异，但普遍强调治理安排对转型稳定性与可扩展性的影响。OpenAlex 的被引统计显示，${topCitedItems.map((item) => `${item.metadata.title}（${getCitationCount(item.metadata)} 次）`).join("、") || "当前文献组中的核心来源"} 可以优先作为综述骨干。与此同时，对于跨组织协同、治理能力沉淀与数智化场景的具体落地机制，现有文献仍需要更细粒度的比较。`,
    "",
    "## 讨论",
    "从研究工作流角度看，这组文献已经足以支撑一个初步的理论综述框架，但在证据强度上仍需要更精细的 PDF 摘录、页码引用和方法对照。下一轮应补充精确引用、标注每条核心论断的页码来源，并在 analysis notes 中继续细分支持与扩展关系。",
    "",
    "## 结论",
    `${topic} 不是单一技术部署问题，而是治理结构、组织能力与转型逻辑共同作用的结果。当前 CLI-first 工作流已经能够把文献导入、分析、tag、relation 与初稿组织打通，为后续精细写作提供稳定底稿。`,
    "",
    "## 引用来源映射",
    ...sourceItems.map((item) => `- ${extractCitationAuthor(item.metadata)} (${item.metadata.year || "n.d."}) ${item.metadata.title} -> ${buildWikilink(item.notePath)} / ${trimString(item.metadata.citation_key || "no-citekey")}`)
  ];
  return `${lines.join("\n")}\n`;
}

async function writeVaultNote(vaultPath, relativePath, content) {
  const absolutePath = path.join(vaultPath, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");
}

export async function runPaperWorkflow(flags = {}, fetchImpl = fetch) {
  const topic = trimString(flags.topic);
  const vaultPath = trimString(flags.vault);
  if (!topic) {
    throw new Error("missing-topic");
  }
  if (!vaultPath) {
    throw new Error("missing-vault");
  }

  const folders = deriveFolders(flags);
  await ensureDirectories(vaultPath, folders);
  const paths = buildTopicPaths(topic, folders);

  const explicitSources = parseSourceSpecs(flags.sources || "");
  const maxSources = Math.max(1, Number.parseInt(trimString(flags["max-sources"] || flags.maxSources || "3"), 10) || 3);
  let sourceRequests = explicitSources;

  if (sourceRequests.length === 0) {
    const searchQuery = trimString(flags.query || topic);
    const searchResult = await searchArxivPapers(searchQuery, maxSources, fetchImpl);
    sourceRequests = searchResult.results.slice(0, maxSources).map((item) => ({
      sourceType: "arxiv",
      source: item.arxiv_id || item.source_id
    }));
  }

  if (sourceRequests.length === 0) {
    throw new Error("missing-sources");
  }

  const sourceItems = [];
  for (const request of sourceRequests.slice(0, maxSources)) {
    const ingestResult = await ingestResearchSource(request, {
      ...flags,
      vaultPath,
      literatureFolder: folders.literature,
      attachmentsFolder: folders.attachments,
      downloadPdf: flags["download-pdf"]
    }, fetchImpl);

    const metadata = ingestResult.metadata ?? {};
    const tags = inferResearchTags(topic, metadata);
    const analysisPath = buildAnalysisPath(folders, paths.slug, metadata);
    sourceItems.push({
      request,
      ingestResult,
      metadata,
      tags,
      notePath: ingestResult.note_path,
      analysisPath,
      citation: formatParentheticalCitation(metadata)
    });
  }

  await writeVaultNote(vaultPath, paths.topicPath, buildTopicNote(topic, paths, sourceItems));
  for (const item of sourceItems) {
    await writeVaultNote(vaultPath, item.analysisPath, buildAnalysisNote(topic, paths, item));
  }
  await writeVaultNote(vaultPath, paths.mapPath, buildMapNote(topic, paths, sourceItems));
  await writeVaultNote(vaultPath, paths.matrixPath, buildMatrixNote(topic, paths, sourceItems));
  await writeVaultNote(vaultPath, paths.outlinePath, buildOutlineNote(topic, paths, sourceItems));
  await writeVaultNote(vaultPath, paths.draftPath, buildDraftNote(topic, paths, sourceItems));

  return {
    status: "created",
    topic,
    vault_path: vaultPath,
    folders,
    source_count: sourceItems.length,
    sources: sourceItems.map((item) => ({
      source_type: item.request.sourceType,
      source: item.request.source,
      title: trimString(item.metadata.title || ""),
      note_path: item.notePath,
      analysis_path: item.analysisPath,
      attachment_paths: Array.isArray(item.ingestResult.attachment_paths) ? item.ingestResult.attachment_paths : [],
      tags: item.tags,
      citation: item.citation,
      openalex_id: trimString(item.metadata.openalex_id || ""),
      cited_by_count: getCitationCount(item.metadata),
      reference_count: getReferenceCount(item.metadata),
      related_work_count: getRelatedWorkCount(item.metadata),
      concepts: getOpenAlexConcepts(item.metadata, 8)
    })),
    topic_note_path: paths.topicPath,
    matrix_note_path: paths.matrixPath,
    map_note_path: paths.mapPath,
    outline_note_path: paths.outlinePath,
    draft_note_path: paths.draftPath
  };
}
