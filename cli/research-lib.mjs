import { promises as fs } from "node:fs";
import path from "node:path";

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

function decodeXmlEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'");
}

function firstMatch(value, pattern) {
  const match = pattern.exec(value);
  return match?.[1] ? decodeXmlEntities(match[1].trim()) : "";
}

function allMatches(value, pattern) {
  return [...value.matchAll(pattern)].map((match) => decodeXmlEntities(match[1].trim())).filter(Boolean);
}

function isUrl(value) {
  return /^https?:\/\//i.test(trimString(value));
}

function toPosix(value) {
  return value.replace(/\\/g, "/");
}

function ensureDirectory(filePath) {
  return fs.mkdir(path.dirname(filePath), { recursive: true });
}

function parseBooleanFlag(value, fallback = true) {
  if (!trimString(value)) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  return fallback;
}

export function slugify(value) {
  const normalized = trimString(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return normalized || "item";
}

export function normalizeDoi(value) {
  const normalized = trimString(value)
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim();
  return normalized.toLowerCase();
}

export function normalizeArxivId(value) {
  return trimString(value)
    .replace(/^https?:\/\/arxiv\.org\/abs\//i, "")
    .replace(/^https?:\/\/arxiv\.org\/pdf\//i, "")
    .replace(/\.pdf$/i, "")
    .trim();
}

export function buildCitationKey(metadata) {
  const firstAuthor = trimString(metadata.authors?.[0] ?? metadata.author);
  const year = trimString(metadata.year);
  const title = trimString(metadata.title);

  if (!firstAuthor && !year && !title) {
    return "";
  }

  const authorPart = slugify(firstAuthor.split(",")[0].split(/\s+/).at(-1) ?? firstAuthor).replace(/-/g, "");
  const yearPart = year.replace(/[^0-9]/g, "").slice(0, 4);
  const titlePart = slugify(title).split("-").filter(Boolean)[0] ?? "source";
  return `${authorPart || "source"}${yearPart || "undated"}${titlePart}`;
}

export function buildSourceKey(metadata) {
  if (trimString(metadata.doi)) {
    return `doi-${slugify(metadata.doi)}`;
  }
  if (trimString(metadata.arxiv_id)) {
    return `arxiv-${slugify(metadata.arxiv_id)}`;
  }
  if (trimString(metadata.source_id)) {
    return `${slugify(metadata.source_type || "source")}-${slugify(metadata.source_id)}`;
  }
  return `${slugify(metadata.source_type || "source")}-${slugify(metadata.title || "paper")}`;
}

export function buildLiteratureNotePath(options) {
  const folder = trimString(options.literatureFolder || "Knowledge/Research/Literature");
  return toPosix(path.posix.join(folder, `${buildSourceKey(options.metadata)}.md`));
}

export function buildAttachmentPath(options) {
  const folder = trimString(options.attachmentsFolder || "Knowledge/Research/Attachments");
  const extension = trimString(options.extension).startsWith(".")
    ? trimString(options.extension)
    : `.${trimString(options.extension || "pdf").replace(/^\./, "")}`;
  return toPosix(path.posix.join(folder, `${buildSourceKey(options.metadata)}${extension || ".pdf"}`));
}

export function parseCliArgs(argv) {
  if (argv.length === 0) {
    throw new Error("missing-command");
  }

  const [command, ...rest] = argv;
  const flags = {};

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = rest[index + 1];
    if (typeof next === "undefined" || next.startsWith("--")) {
      flags[key] = "true";
      continue;
    }
    flags[key] = next;
    index += 1;
  }

  return { command, flags };
}

export function resolveSourceRequest(flags) {
  const sourceType = trimString(flags["source-type"]).toLowerCase();
  const source = trimString(flags.source);
  const doi = normalizeDoi(flags.doi || "");
  const arxiv = normalizeArxivId(flags.arxiv || flags["arxiv-id"] || "");
  const pdf = trimString(flags.pdf);

  if (sourceType && source) {
    return { sourceType, source };
  }
  if (doi) {
    return { sourceType: "doi", source: doi };
  }
  if (arxiv) {
    return { sourceType: "arxiv", source: arxiv };
  }
  if (pdf) {
    return { sourceType: "pdf", source: pdf };
  }

  throw new Error("missing-source");
}

function firstPdfUrlFromOpenAlex(work) {
  const locations = Array.isArray(work.locations) ? work.locations : [];
  const candidates = [
    work.best_oa_location?.pdf_url,
    work.primary_location?.pdf_url,
    ...locations.map((location) => location?.pdf_url)
  ];
  return candidates.find((value) => trimString(value));
}

function firstLandingUrlFromOpenAlex(work) {
  const locations = Array.isArray(work.locations) ? work.locations : [];
  const candidates = [
    work.primary_location?.landing_page_url,
    work.best_oa_location?.landing_page_url,
    ...locations.map((location) => location?.landing_page_url),
    work.ids?.openalex
  ];
  return candidates.find((value) => trimString(value));
}

function firstSourceDisplayNameFromOpenAlex(work) {
  const locations = Array.isArray(work.locations) ? work.locations : [];
  const candidates = [
    work.primary_location?.source?.display_name,
    work.best_oa_location?.source?.display_name,
    ...locations.map((location) => location?.source?.display_name)
  ];
  return candidates.find((value) => trimString(value));
}

function normalizeOpenAlexIdList(values) {
  return uniqueStrings((Array.isArray(values) ? values : []).map((value) => trimString(value)));
}

function normalizeOpenAlexConcepts(values) {
  return uniqueStrings(
    (Array.isArray(values) ? values : [])
      .map((value) => trimString(typeof value === "string" ? value : value?.display_name || value?.concept?.display_name || value?.id || ""))
  );
}

function normalizeCountsByYear(values) {
  return (Array.isArray(values) ? values : [])
    .map((value) => ({
      year: Number.parseInt(String(value?.year ?? ""), 10),
      cited_by_count: Number.parseInt(String(value?.cited_by_count ?? value?.works_count ?? ""), 10)
    }))
    .filter((value) => Number.isFinite(value.year) && Number.isFinite(value.cited_by_count));
}

function reconstructOpenAlexAbstract(invertedIndex) {
  if (!invertedIndex || typeof invertedIndex !== "object") {
    return "";
  }

  const positions = [];
  for (const [token, indexes] of Object.entries(invertedIndex)) {
    if (!Array.isArray(indexes)) {
      continue;
    }
    for (const index of indexes) {
      if (Number.isFinite(index)) {
        positions.push([Number(index), token]);
      }
    }
  }

  return positions
    .sort((left, right) => left[0] - right[0])
    .map(([, token]) => token)
    .join(" ")
    .trim();
}

export function normalizeOpenAlexWork(work) {
  const authors = uniqueStrings(
    (Array.isArray(work.authorships) ? work.authorships : [])
      .map((authorship) => authorship?.author?.display_name)
  );
  const doi = normalizeDoi(work?.doi || work?.ids?.doi || "");
  const title = trimString(work.display_name || work.title);
  const year = trimString(String(work.publication_year || work.publication_date || "")).slice(0, 4);
  const pdfUrl = trimString(firstPdfUrlFromOpenAlex(work));
  const landingUrl = trimString(firstLandingUrlFromOpenAlex(work) || (doi ? `https://doi.org/${doi}` : ""));
  const referencedWorks = normalizeOpenAlexIdList(work.referenced_works);
  const relatedWorks = normalizeOpenAlexIdList(work.related_works);
  const concepts = normalizeOpenAlexConcepts(work.concepts);
  const countsByYear = normalizeCountsByYear(work.counts_by_year);
  const citedByCount = Number.parseInt(String(work.cited_by_count ?? work.citation_count ?? ""), 10);

  return {
    source_type: "doi",
    source_id: doi || trimString(work.id),
    entry_type: trimString(work.type || "journal-article"),
    title,
    authors,
    author: authors.join(", "),
    year,
    doi: doi || undefined,
    pdf_url: pdfUrl || undefined,
    source_url: landingUrl || undefined,
    abstract: reconstructOpenAlexAbstract(work.abstract_inverted_index),
    citation_key: buildCitationKey({ authors, author: authors.join(", "), year, title }),
    openalex_id: trimString(work.id || work.ids?.openalex || ""),
    cited_by_count: Number.isFinite(citedByCount) ? citedByCount : 0,
    referenced_works: referencedWorks,
    referenced_works_count: referencedWorks.length,
    related_works: relatedWorks,
    related_works_count: relatedWorks.length,
    concepts,
    counts_by_year: countsByYear,
    publication_date: trimString(work.publication_date || ""),
    primary_location_url: trimString(landingUrl || ""),
    source_display_name: trimString(firstSourceDisplayNameFromOpenAlex(work))
  };
}

export function parseArxivEntry(xml) {
  const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/i);
  if (!entryMatch) {
    throw new Error("arxiv-entry-not-found");
  }

  const entry = entryMatch[1];
  const title = firstMatch(entry, /<title>([\s\S]*?)<\/title>/i).replace(/\s+/g, " ");
  const summary = firstMatch(entry, /<summary>([\s\S]*?)<\/summary>/i).replace(/\s+/g, " ");
  const authors = uniqueStrings(allMatches(entry, /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi));
  const published = firstMatch(entry, /<published>([\s\S]*?)<\/published>/i);
  const arxivId = normalizeArxivId(firstMatch(entry, /<id>([\s\S]*?)<\/id>/i));
  const doi = normalizeDoi(firstMatch(entry, /<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/i));
  const primaryCategory = firstMatch(entry, /<arxiv:primary_category[^>]*term="([^"]+)"/i);
  const pdfUrl = trimString(
    firstMatch(entry, /<link[^>]*title="pdf"[^>]*href="([^"]+)"/i)
      || (arxivId ? `https://arxiv.org/pdf/${arxivId}.pdf` : "")
  );

  return {
    source_type: "arxiv",
    source_id: arxivId,
    entry_type: "preprint",
    title,
    authors,
    author: authors.join(", "),
    year: published.slice(0, 4),
    arxiv_id: arxivId || undefined,
    doi: doi || undefined,
    pdf_url: pdfUrl || undefined,
    source_url: arxivId ? `https://arxiv.org/abs/${arxivId}` : undefined,
    abstract: summary || undefined,
    primary_category: primaryCategory || undefined,
    citation_key: buildCitationKey({ authors, author: authors.join(", "), year: published.slice(0, 4), title })
  };
}

export function buildFrontmatterLines(metadata, options = {}) {
  const serializeFrontmatterValue = (value) => {
    if (Array.isArray(value) || (value && typeof value === "object")) {
      return JSON.stringify(value);
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
    return JSON.stringify(trimString(value || ""));
  };

  const lines = [
    "---",
    `title: ${serializeFrontmatterValue(trimString(metadata.title || options.title || "Untitled source"))}`,
    `authors: ${serializeFrontmatterValue(uniqueStrings(metadata.authors || []))}`,
    `author: ${serializeFrontmatterValue(trimString(metadata.author || ""))}`,
    `year: ${serializeFrontmatterValue(trimString(metadata.year || ""))}`,
    `source_id: ${serializeFrontmatterValue(trimString(metadata.source_id || ""))}`,
    `source_type: ${serializeFrontmatterValue(trimString(metadata.source_type || ""))}`,
    `entry_type: ${serializeFrontmatterValue(trimString(metadata.entry_type || ""))}`,
    `citekey: ${serializeFrontmatterValue(trimString(metadata.citation_key || ""))}`,
    `doi: ${serializeFrontmatterValue(trimString(metadata.doi || ""))}`,
    `arxiv_id: ${serializeFrontmatterValue(trimString(metadata.arxiv_id || ""))}`,
    `openalex_id: ${serializeFrontmatterValue(trimString(metadata.openalex_id || ""))}`,
    `cited_by_count: ${serializeFrontmatterValue(Number.isFinite(metadata.cited_by_count) ? metadata.cited_by_count : 0)}`,
    `referenced_works: ${serializeFrontmatterValue(normalizeOpenAlexIdList(metadata.referenced_works))}`,
    `referenced_works_count: ${serializeFrontmatterValue(Number.isFinite(metadata.referenced_works_count) ? metadata.referenced_works_count : normalizeOpenAlexIdList(metadata.referenced_works).length)}`,
    `related_works: ${serializeFrontmatterValue(normalizeOpenAlexIdList(metadata.related_works))}`,
    `related_works_count: ${serializeFrontmatterValue(Number.isFinite(metadata.related_works_count) ? metadata.related_works_count : normalizeOpenAlexIdList(metadata.related_works).length)}`,
    `concepts: ${serializeFrontmatterValue(normalizeOpenAlexConcepts(metadata.concepts))}`,
    `counts_by_year: ${serializeFrontmatterValue(normalizeCountsByYear(metadata.counts_by_year))}`,
    `publication_date: ${serializeFrontmatterValue(trimString(metadata.publication_date || ""))}`,
    `primary_location_url: ${serializeFrontmatterValue(trimString(metadata.primary_location_url || ""))}`,
    `source_display_name: ${serializeFrontmatterValue(trimString(metadata.source_display_name || ""))}`,
    `pdf: ${serializeFrontmatterValue(trimString(options.attachmentPath || metadata.pdf_path || ""))}`,
    `pdf_url: ${serializeFrontmatterValue(trimString(metadata.pdf_url || ""))}`,
    `source_url: ${serializeFrontmatterValue(trimString(metadata.source_url || ""))}`,
    `imported_at: ${serializeFrontmatterValue(new Date().toISOString())}`,
    "tags:",
    "  - literature-note",
    "---"
  ];

  return lines;
}

export function buildLiteratureNoteContent(metadata, options = {}) {
  const frontmatter = buildFrontmatterLines(metadata, options);
  const concepts = normalizeOpenAlexConcepts(metadata.concepts);
  const referencedWorks = normalizeOpenAlexIdList(metadata.referenced_works);
  const relatedWorks = normalizeOpenAlexIdList(metadata.related_works);
  const countsByYear = normalizeCountsByYear(metadata.counts_by_year).slice(0, 5);
  const attachmentLine = trimString(options.attachmentPath)
    ? `- PDF: [[${trimString(options.attachmentPath)}]]`
    : trimString(metadata.pdf_url)
      ? `- PDF URL: ${trimString(metadata.pdf_url)}`
      : "- PDF: Not attached";

  return [
    ...frontmatter,
    "",
    `# ${trimString(metadata.title || "Untitled source")}`,
    "",
    "## Source",
    `- Source ID: ${trimString(metadata.source_id || "not-set")}`,
    `- Source type: ${trimString(metadata.source_type || "unknown")}`,
    `- Entry type: ${trimString(metadata.entry_type || "unknown")}`,
    trimString(metadata.doi) ? `- DOI: ${trimString(metadata.doi)}` : "",
    trimString(metadata.arxiv_id) ? `- arXiv: ${trimString(metadata.arxiv_id)}` : "",
    trimString(metadata.openalex_id) ? `- OpenAlex: ${trimString(metadata.openalex_id)}` : "",
    trimString(metadata.source_url) ? `- Landing page: ${trimString(metadata.source_url)}` : "",
    attachmentLine,
    "",
    "## Citation context",
    `- Cited by: ${Number.isFinite(metadata.cited_by_count) ? metadata.cited_by_count : 0}`,
    `- Referenced works tracked: ${Number.isFinite(metadata.referenced_works_count) ? metadata.referenced_works_count : referencedWorks.length}`,
    `- Related works tracked: ${Number.isFinite(metadata.related_works_count) ? metadata.related_works_count : relatedWorks.length}`,
    concepts.length > 0 ? `- OpenAlex concepts: ${concepts.join(", ")}` : "- OpenAlex concepts: not available",
    countsByYear.length > 0
      ? `- Recent citation counts: ${countsByYear.map((item) => `${item.year}:${item.cited_by_count}`).join(", ")}`
      : "- Recent citation counts: not available",
    "",
    "## Abstract",
    trimString(metadata.abstract || "No abstract captured."),
    "",
    "## Notes",
    "",
    "## Exact references",
    "",
    "## Relations",
    "",
    "## Tags",
    ""
  ].filter(Boolean).join("\n");
}

export async function resolveDoiMetadata(doi, fetchImpl = fetch) {
  const normalized = normalizeDoi(doi);
  if (!normalized) {
    throw new Error("invalid-doi");
  }

  const url = `https://api.openalex.org/works?filter=doi:${encodeURIComponent(normalized)}&per-page=1`;
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`doi-lookup-failed:${response.status}`);
  }

  const data = await response.json();
  const result = Array.isArray(data?.results) ? data.results[0] : null;
  if (!result) {
    throw new Error("doi-not-found");
  }

  return normalizeOpenAlexWork(result);
}

export async function resolveArxivMetadata(arxivId, fetchImpl = fetch) {
  const normalized = normalizeArxivId(arxivId);
  if (!normalized) {
    throw new Error("invalid-arxiv");
  }

  const response = await fetchImpl(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(normalized)}`, {
    headers: {
      Accept: "application/atom+xml,text/xml"
    }
  });
  if (!response.ok) {
    throw new Error(`arxiv-lookup-failed:${response.status}`);
  }

  const xml = await response.text();
  const parsed = parseArxivEntry(xml);
  if (parsed.doi) {
    try {
      const doiMetadata = await resolveDoiMetadata(parsed.doi, fetchImpl);
      return {
        ...doiMetadata,
        source_type: "arxiv",
        source_id: parsed.arxiv_id || doiMetadata.source_id,
        entry_type: doiMetadata.entry_type || "preprint",
        arxiv_id: parsed.arxiv_id,
        pdf_url: parsed.pdf_url || doiMetadata.pdf_url,
        source_url: parsed.source_url || doiMetadata.source_url,
        citation_key: parsed.citation_key || doiMetadata.citation_key
      };
    } catch {
      // Keep the arXiv metadata if DOI enrichment fails.
    }
  }

  return parsed;
}

function withMetadataOverrides(metadata, flags) {
  const title = trimString(flags.title);
  const year = trimString(flags.year);
  const doi = normalizeDoi(flags["metadata-doi"] || "");
  const arxivId = normalizeArxivId(flags["metadata-arxiv"] || "");
  const authorList = uniqueStrings([
    ...trimString(flags.author).split(","),
    ...trimString(flags.authors).split(",")
  ]);

  return {
    ...metadata,
    title: title || metadata.title,
    year: year || metadata.year,
    doi: doi || metadata.doi,
    arxiv_id: arxivId || metadata.arxiv_id,
    authors: authorList.length > 0 ? authorList : metadata.authors,
    author: authorList.length > 0 ? authorList.join(", ") : metadata.author
  };
}

export async function resolvePdfMetadata(pdfSource, flags = {}, fetchImpl = fetch) {
  const source = trimString(pdfSource);
  if (!source) {
    throw new Error("invalid-pdf");
  }

  let baseMetadata = {
    source_type: "pdf",
    source_id: source,
    entry_type: "pdf-document",
    title: path.basename(source).replace(/\.[^.]+$/, ""),
    authors: [],
    author: "",
    year: "",
    doi: "",
    arxiv_id: "",
    pdf_url: isUrl(source) ? source : "",
    source_url: isUrl(source) ? source : "",
    abstract: "",
    citation_key: ""
  };

  const overrideDoi = normalizeDoi(flags["metadata-doi"] || "");
  const overrideArxiv = normalizeArxivId(flags["metadata-arxiv"] || "");

  if (overrideDoi) {
    try {
      baseMetadata = {
        ...baseMetadata,
        ...(await resolveDoiMetadata(overrideDoi, fetchImpl)),
        source_type: "pdf",
        source_id: overrideDoi,
        pdf_url: baseMetadata.pdf_url || undefined
      };
    } catch {
      // Keep the PDF-only fallback when DOI enrichment fails.
    }
  } else if (overrideArxiv) {
    try {
      baseMetadata = {
        ...baseMetadata,
        ...(await resolveArxivMetadata(overrideArxiv, fetchImpl)),
        source_type: "pdf",
        source_id: overrideArxiv,
        pdf_url: baseMetadata.pdf_url || undefined
      };
    } catch {
      // Keep the PDF-only fallback when arXiv enrichment fails.
    }
  }

  const merged = withMetadataOverrides(baseMetadata, flags);
  return {
    ...merged,
    citation_key: trimString(merged.citation_key || buildCitationKey(merged))
  };
}

export async function resolveResearchSource(request, flags = {}, fetchImpl = fetch) {
  switch (request.sourceType) {
    case "doi":
      return withMetadataOverrides(await resolveDoiMetadata(request.source, fetchImpl), flags);
    case "arxiv":
      return withMetadataOverrides(await resolveArxivMetadata(request.source, fetchImpl), flags);
    case "pdf":
      return resolvePdfMetadata(request.source, flags, fetchImpl);
    default:
      throw new Error(`unsupported-source-type:${request.sourceType}`);
  }
}

async function downloadRemoteFile(url, targetPath, fetchImpl = fetch) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`pdf-download-failed:${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  await ensureDirectory(targetPath);
  await fs.writeFile(targetPath, Buffer.from(arrayBuffer));
}

async function copyLocalFile(sourcePath, targetPath) {
  await ensureDirectory(targetPath);
  await fs.copyFile(sourcePath, targetPath);
}

function inferAttachmentExtension(chosenSource, metadata) {
  const normalizedSource = trimString(chosenSource).split("?")[0];
  const explicitExtension = path.extname(normalizedSource).toLowerCase();
  if (!isUrl(chosenSource) && explicitExtension) {
    return explicitExtension;
  }
  if (explicitExtension === ".pdf") {
    return ".pdf";
  }
  if (/\/pdf(?:\/|$)/i.test(normalizedSource)) {
    return ".pdf";
  }
  if (trimString(metadata.source_type).toLowerCase() !== "pdf") {
    return ".pdf";
  }
  return explicitExtension || ".pdf";
}

async function materializePdfAttachment(metadata, options, fetchImpl = fetch) {
  const pdfSource = trimString(options.pdfSource || "");
  const remotePdf = trimString(metadata.pdf_url || "");
  const wantsPdf = parseBooleanFlag(options.downloadPdf, true);
  if (!wantsPdf) {
    return { attachmentPath: "", warnings: [] };
  }

  const chosenSource = pdfSource || remotePdf;
  if (!chosenSource) {
    return {
      attachmentPath: "",
      warnings: ["No PDF source was available for attachment materialization."]
    };
  }

  const extension = inferAttachmentExtension(chosenSource, metadata);
  const relativeTarget = buildAttachmentPath({
    attachmentsFolder: options.attachmentsFolder,
    extension,
    metadata
  });
  const absoluteTarget = path.join(options.vaultPath, relativeTarget);

  if (isUrl(chosenSource)) {
    await downloadRemoteFile(chosenSource, absoluteTarget, fetchImpl);
  } else {
    const absoluteSource = path.resolve(chosenSource);
    await copyLocalFile(absoluteSource, absoluteTarget);
  }

  return { attachmentPath: relativeTarget, warnings: [] };
}

export async function ingestResearchSource(request, options = {}, fetchImpl = fetch) {
  const vaultPath = trimString(options.vaultPath);
  if (!vaultPath) {
    throw new Error("missing-vault");
  }

  const metadata = await resolveResearchSource(request, options, fetchImpl);
  const literatureFolder = trimString(options.literatureFolder || "Knowledge/Research/Literature");
  const attachmentsFolder = trimString(options.attachmentsFolder || "Knowledge/Research/Attachments");
  const notePath = buildLiteratureNotePath({ literatureFolder, metadata });
  const absoluteNotePath = path.join(vaultPath, notePath);
  const warnings = [];

  const { attachmentPath, warnings: attachmentWarnings } = await materializePdfAttachment(
    metadata,
    {
      pdfSource: request.sourceType === "pdf" ? request.source : "",
      attachmentsFolder,
      vaultPath,
      downloadPdf: options.downloadPdf
    },
    fetchImpl
  );
  warnings.push(...attachmentWarnings);

  const noteContent = buildLiteratureNoteContent(metadata, { attachmentPath });
  await ensureDirectory(absoluteNotePath);
  await fs.writeFile(absoluteNotePath, noteContent, "utf8");

  return {
    status: "created",
    source_type: request.sourceType,
    source_id: trimString(metadata.source_id || request.source),
    title: trimString(metadata.title || ""),
    note_path: notePath,
    attachment_paths: attachmentPath ? [attachmentPath] : [],
    warnings,
    metadata: {
      ...metadata,
      attachment_path: attachmentPath || undefined
    }
  };
}

function parseFrontmatterValue(raw) {
  const trimmed = trimString(raw);
  if (!trimmed) {
    return "";
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

export async function inspectIngestedNote(options = {}) {
  const vaultPath = trimString(options.vaultPath);
  const notePath = trimString(options.notePath);
  if (!vaultPath || !notePath) {
    throw new Error("missing-inspect-target");
  }

  const absolutePath = path.join(vaultPath, notePath);
  const content = await fs.readFile(absolutePath, "utf8");
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  const frontmatter = {};

  if (match?.[1]) {
    for (const line of match[1].split("\n")) {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex <= 0) {
        continue;
      }
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1);
      if (!key || key === "tags") {
        continue;
      }
      frontmatter[key] = parseFrontmatterValue(value);
    }
  }

  const attachmentPath = trimString(frontmatter.pdf || "");
  let attachmentExists = false;
  if (attachmentPath) {
    try {
      await fs.access(path.join(vaultPath, attachmentPath));
      attachmentExists = true;
    } catch {
      attachmentExists = false;
    }
  }

  return {
    status: "ok",
    note_path: notePath,
    attachment_exists: attachmentExists,
    frontmatter
  };
}
