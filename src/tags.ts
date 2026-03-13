import { App, CachedMetadata, TFile } from "obsidian";

import { getAllMarkdownFiles, getAliasesFromCache, getAllTagsForFile, resolveNoteTarget, stripFrontmatter } from "./notes";
import { extractLegacyLineReferences, extractNativeBlockReferences } from "./references";
import { parseTagAliasMap } from "./shared";

export interface TagStat {
  tag: string;
  count: number;
  files: TFile[];
  aliases: string[];
}

export type TagSuggestionKind = "alias" | "known-tag" | "keyword" | "source-path";
export type TagSuggestionBucket = "primary" | "secondary";
export type TagSuggestionSource =
  | "title"
  | "alias"
  | "heading"
  | "reference"
  | "context"
  | "body"
  | "path"
  | "vault-tag";

export interface TagSuggestion {
  tag: string;
  score: number;
  kind: TagSuggestionKind;
  bucket: TagSuggestionBucket;
  matches: string[];
  sources: TagSuggestionSource[];
}

interface TagTermSignal {
  weight: number;
  occurrences: number;
  sources: Set<TagSuggestionSource>;
  matches: Set<string>;
}

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, "");
}

const EN_STOPWORDS = new Set([
  "the", "and", "with", "from", "that", "this", "have", "into", "your", "for", "using", "about",
  "note", "notes", "book", "books", "reading", "chapter", "section", "title", "page", "pages",
  "data", "system", "model", "models", "file", "files", "root", "copy", "source", "original"
]);

const NOISY_TOKENS = new Set([
  "html", "css", "js", "svg", "div", "span", "node", "nodes", "active", "class", "classes",
  "body", "container", "header", "footer", "padding", "margin", "display", "position", "width",
  "height", "font", "family", "shadow", "color", "background", "gradient", "rgba", "queryselector",
  "document", "dataset", "const", "function", "click", "hover", "legend", "diagram", "marker",
  "arrowhead", "import", "imports", "trilium", "markdown", "highlight", "clone"
]);

const STRUCTURAL_TOKENS = new Set([
  "archive", "archives", "journal", "journals", "notebooklm", "vault", "folder", "folders",
  "reading", "books", "book", "import", "imports", "attachments", "attachment", "daily",
  "template", "templates", "obsidian", "bridge"
]);

const GENERIC_CJK_TOKENS = new Set([
  "内容", "方法", "系统", "模型", "分析", "报告", "研究", "笔记", "总结", "实践", "理论",
  "基础", "概念", "原理", "问题", "策略", "流程", "框架", "标准", "资料"
]);

const CJK_FUNCTION_CHARS = new Set([
  "的", "了", "是", "在", "与", "和", "及", "并", "或", "对", "从", "将", "把", "为",
  "等", "由", "以", "其", "让", "使", "所", "而", "到", "于", "中", "上", "下", "内",
  "外", "前", "后", "再", "各", "就", "也", "很", "更", "最", "可", "能", "需", "要",
  "已", "未", "被", "向", "给", "按"
]);

const EN_TOKEN_RE = /\b[A-Za-z][A-Za-z-]{2,}\b/g;
const CJK_BLOCK_RE = /[\u3400-\u9fff]{2,24}/g;

function englishKey(value: string): string {
  return value.toLowerCase();
}

function isStructuralTerm(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed) {
    return true;
  }

  if (/^[A-Za-z]/.test(trimmed)) {
    return STRUCTURAL_TOKENS.has(englishKey(trimmed));
  }

  return new Set(["归档", "日志", "日记", "导入", "附件", "模板", "阅读"]).has(trimmed);
}

function isLowSignalTagTerm(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed) {
    return true;
  }

  if (/^第[一二三四五六七八九十百千0-9]+[章节部分篇讲]$/.test(trimmed)) {
    return true;
  }

  if (/^[A-Za-z][A-Za-z0-9-]{0,2}$/.test(trimmed) && !/^[A-Za-z]\d{2}$/.test(trimmed)) {
    return true;
  }

  return false;
}

function isCjkToken(token: string): boolean {
  return /[\u3400-\u9fff]/.test(token);
}

function genericTermPenalty(term: string): number {
  return isCjkToken(term) && GENERIC_CJK_TOKENS.has(term) ? 5 : 0;
}

function keywordLengthBonus(term: string): number {
  if (/^[A-Za-z]/.test(term)) {
    return Math.min(6, Math.max(1, term.length - 2));
  }

  const length = term.length;
  if (length === 4) {
    return 8;
  }
  if (length === 3 || length === 5) {
    return 7;
  }
  if (length === 2 || length === 6) {
    return 5;
  }
  if (length <= 8) {
    return 3;
  }
  return 1;
}

function isInvalidCjkPhrase(term: string): boolean {
  const trimmed = term.trim();
  if (!trimmed || !isCjkToken(trimmed)) {
    return false;
  }

  if (trimmed.length < 2 || trimmed.length > 12) {
    return true;
  }

  if (trimmed.split("").every((char) => char === trimmed[0])) {
    return true;
  }

  if (CJK_FUNCTION_CHARS.has(trimmed[0]) || CJK_FUNCTION_CHARS.has(trimmed.slice(-1))) {
    return true;
  }

  const stopCount = trimmed.split("").filter((char) => CJK_FUNCTION_CHARS.has(char)).length;
  if (trimmed.length <= 3 && stopCount > 0) {
    return true;
  }

  if (stopCount > Math.floor(trimmed.length / 3)) {
    return true;
  }

  return false;
}

function isMostlyCodeLike(line: string): boolean {
  if (/[{};]/.test(line) || /=>/.test(line)) {
    return true;
  }

  return /(function|const |let |var |document\.|querySelector|classList|addEventListener|@media|linear-gradient|rgba\(|box-shadow|font-family|display:|position:|padding:|margin:|width:|height:|cursor:|transition:)/i.test(line);
}

function looksLikeNaturalLanguageLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  if (isMostlyCodeLike(trimmed)) {
    return false;
  }

  const cjk = (trimmed.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latin = (trimmed.match(/[A-Za-z]/g) ?? []).length;
  const digits = (trimmed.match(/[0-9]/g) ?? []).length;
  const spaces = (trimmed.match(/\s/g) ?? []).length;
  const symbols = trimmed.length - cjk - latin - digits - spaces;

  if (symbols > Math.max(8, Math.floor((cjk + latin) * 0.7))) {
    return false;
  }

  if (trimmed.length > 220 && symbols > 4) {
    return false;
  }

  return true;
}

function getNaturalLanguageBody(content: string): string {
  return stripFrontmatter(content)
    .split("\n")
    .map((line) => line.trim())
    .filter(looksLikeNaturalLanguageLine)
    .join("\n");
}

function splitCandidateTerms(input: string): string[] {
  return input
    .split(/[\/_|()[\]{}:：,，。.!?？、\-\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitCjkBlock(block: string): string[] {
  const parts = block
    .split(/[的是在与和及并或对从将把为等由以其让使所而到于中上下内外前后再各就也很更最可能需要已未被向给按]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);

  return parts.length > 0 ? parts : [block.trim()];
}

function collectCandidateTermsFromText(input: string): string[] {
  const terms = new Set<string>();

  for (const term of splitCandidateTerms(input)) {
    terms.add(term);
  }

  for (const token of input.match(EN_TOKEN_RE) ?? []) {
    terms.add(token.trim());
  }

  for (const rawBlock of input.match(CJK_BLOCK_RE) ?? []) {
    for (const block of splitCjkBlock(rawBlock)) {
      if (!block) {
        continue;
      }

      if (block.length <= 10 && !isInvalidCjkPhrase(block)) {
        terms.add(block);
      }

      const maxGram = Math.min(block.length > 12 ? 4 : 6, block.length);
      for (let size = 2; size <= maxGram; size += 1) {
        const boundaryPhrases = new Set<string>([
          block.slice(0, size).trim(),
          block.slice(block.length - size).trim()
        ]);

        for (const phrase of boundaryPhrases) {
          if (!phrase || isInvalidCjkPhrase(phrase)) {
            continue;
          }
          terms.add(phrase);
        }
      }
    }
  }

  return uniq([...terms]);
}

export function extractTagTermCandidates(input: string): string[] {
  return collectCandidateTermsFromText(input).filter((term) => {
    if (!term || isNoisyToken(term) || isStructuralTerm(term) || isLowSignalTagTerm(term)) {
      return false;
    }

    if (isCjkToken(term) && isInvalidCjkPhrase(term)) {
      return false;
    }

    return true;
  });
}

function collectReferenceTargetTerms(content: string): string[] {
  const directTargets = [
    ...extractLegacyLineReferences(content).map((reference) => reference.target),
    ...extractNativeBlockReferences(content).map((reference) => reference.target)
  ];

  return uniq(
    directTargets
      .flatMap((target) => extractTagTermCandidates(target.replace(/\.md$/i, "")))
      .filter((term) => !isNoisyToken(term) && !isStructuralTerm(term) && !isLowSignalTagTerm(term))
  );
}

function isNoisyToken(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed) {
    return true;
  }

  if (/^\d+$/.test(trimmed)) {
    return true;
  }

  if (/^[A-Za-z]/.test(trimmed)) {
    const lowered = englishKey(trimmed);
    if (trimmed.length < 3 || EN_STOPWORDS.has(lowered) || NOISY_TOKENS.has(lowered)) {
      return true;
    }
  }

  if (/^[^A-Za-z0-9\u3400-\u9fff]+$/.test(trimmed)) {
    return true;
  }

  return false;
}

async function collectReferencedContextTerms(app: App, file: TFile, content: string): Promise<{
  terms: string[];
  tags: string[];
}> {
  const cache = app.metadataCache.getFileCache(file);
  const linkTargets = [
    ...(cache?.links ?? []),
    ...(cache?.frontmatterLinks ?? [])
  ]
    .map((link) => app.metadataCache.getFirstLinkpathDest(link.link, file.path))
    .filter((target): target is TFile => target instanceof TFile);

  const legacyTargets = extractLegacyLineReferences(content)
    .map((reference) => resolveNoteTarget(app, reference.target, file.path))
    .filter((target): target is TFile => target instanceof TFile);

  const nativeBlockTargets = extractNativeBlockReferences(content)
    .map((reference) => resolveNoteTarget(app, reference.target, file.path))
    .filter((target): target is TFile => target instanceof TFile);

  const uniqueTargets = [...new Map(
    [...linkTargets, ...legacyTargets, ...nativeBlockTargets].map((target) => [target.path, target])
  ).values()];

  const terms: string[] = [];
  const tags: string[] = [];

  for (const target of uniqueTargets) {
    const targetCache = app.metadataCache.getFileCache(target);
    terms.push(
      ...extractTagTermCandidates(target.basename),
      ...getAliasesFromCache(targetCache),
      ...(targetCache?.headings ?? []).map((heading) => heading.heading).flatMap(extractTagTermCandidates)
    );
    tags.push(...getAllTagsForFile(app, target));
  }

  return {
    terms: uniq(terms.filter((term) => !isNoisyToken(term) && !isStructuralTerm(term))),
    tags: uniq(tags.filter((tag) => !isNoisyToken(tag) && !isStructuralTerm(tag)))
  };
}

function replaceInlineTagOccurrences(content: string, cache: CachedMetadata | null, fromTag: string, toTag: string | null): string {
  const replacements = (cache?.tags ?? [])
    .filter((tag) => normalizeTag(tag.tag).toLowerCase() === fromTag.toLowerCase())
    .map((tag) => ({
      start: tag.position.start.offset,
      end: tag.position.end.offset,
      text: toTag ? `#${toTag}` : ""
    }))
    .sort((left, right) => right.start - left.start);

  let updated = content;
  for (const replacement of replacements) {
    updated = `${updated.slice(0, replacement.start)}${replacement.text}${updated.slice(replacement.end)}`;
  }
  return updated;
}

function mutateFrontmatterTags(frontmatter: Record<string, unknown>, oldTag: string, newTag: string | null): void {
  const existing = uniq(
    Array.isArray(frontmatter.tags)
      ? frontmatter.tags.map((tag: unknown) => String(tag))
      : typeof frontmatter.tags === "string"
        ? [String(frontmatter.tags)]
        : []
  );
  if (existing.length === 0 && !newTag) {
    return;
  }

  const next = uniq(existing.filter((tag) => tag.toLowerCase() !== oldTag.toLowerCase()).concat(newTag ? [newTag] : []));
  if (next.length === 0) {
    delete frontmatter.tags;
  } else {
    frontmatter.tags = next;
  }
}

export function getTagStats(app: App, aliasMapText: string): TagStat[] {
  const aliasMap = parseTagAliasMap(aliasMapText);
  const stats = new Map<string, TagStat>();

  for (const file of getAllMarkdownFiles(app)) {
    const tags = getAllTagsForFile(app, file);
    for (const tag of tags) {
      const key = tag.toLowerCase();
      const aliases = aliasMap.get(tag) ?? [...aliasMap.entries()]
        .filter(([, values]) => values.some((value: string) => value.toLowerCase() === key))
        .map(([canonical]) => canonical);

      const existing = stats.get(key) ?? {
        tag,
        count: 0,
        files: [],
        aliases: uniq(aliases)
      };
      existing.count += 1;
      existing.files.push(file);
      existing.aliases = uniq([...existing.aliases, ...aliases]);
      stats.set(key, existing);
    }
  }

  return [...stats.values()].sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag, "zh-Hans-CN"));
}

async function updateTagInFile(app: App, file: TFile, oldTag: string, newTag: string | null): Promise<boolean> {
  const cache = app.metadataCache.getFileCache(file);
  const original = await app.vault.read(file);
  const updatedInline = replaceInlineTagOccurrences(original, cache, oldTag, newTag);
  const inlineChanged = updatedInline !== original;

  if (inlineChanged) {
    await app.vault.modify(file, updatedInline);
  }

  let frontmatterChanged = false;
  await app.fileManager.processFrontMatter(file, (frontmatter) => {
    const before = JSON.stringify(frontmatter.tags ?? null);
    mutateFrontmatterTags(frontmatter, oldTag, newTag);
    frontmatterChanged = JSON.stringify(frontmatter.tags ?? null) !== before;
  });

  return inlineChanged || frontmatterChanged;
}

export async function renameTagAcrossVault(app: App, oldTag: string, newTag: string): Promise<number> {
  let updated = 0;
  for (const file of getAllMarkdownFiles(app)) {
    if (await updateTagInFile(app, file, oldTag, newTag)) {
      updated += 1;
    }
  }
  return updated;
}

export async function deleteTagAcrossVault(app: App, tag: string): Promise<number> {
  let updated = 0;
  for (const file of getAllMarkdownFiles(app)) {
    if (await updateTagInFile(app, file, tag, null)) {
      updated += 1;
    }
  }
  return updated;
}

export async function appendTagsToFrontmatter(app: App, file: TFile, tags: string[]): Promise<void> {
  const normalized = uniq(tags.map(normalizeTag));
  await app.fileManager.processFrontMatter(file, (frontmatter) => {
    const existing = uniq(
      Array.isArray(frontmatter.tags)
        ? frontmatter.tags.map((tag: unknown) => String(tag))
        : typeof frontmatter.tags === "string"
          ? [String(frontmatter.tags)]
          : []
    );
    frontmatter.tags = uniq([...existing, ...normalized]);
  });
}

function hasPhrase(text: string, phrase: string): boolean {
  const trimmed = phrase.trim();
  if (!trimmed) {
    return false;
  }
  if (/^[A-Za-z]/.test(trimmed)) {
    return text.toLowerCase().includes(englishKey(trimmed));
  }
  return text.includes(trimmed);
}

function normalizeCandidateTag(tag: string): string {
  return normalizeTag(tag).replace(/\s+/g, " ").trim();
}

function addTagTermSignal(
  signals: Map<string, TagTermSignal>,
  rawTerm: string,
  source: TagSuggestionSource,
  weight: number,
  matchText = rawTerm
): void {
  const normalized = normalizeCandidateTag(rawTerm);
  if (!normalized || isNoisyToken(normalized) || isStructuralTerm(normalized) || isLowSignalTagTerm(normalized)) {
    return;
  }

  if (isCjkToken(normalized) && isInvalidCjkPhrase(normalized)) {
    return;
  }

  const key = normalized.toLowerCase();
  const signal = signals.get(key) ?? {
    weight: 0,
    occurrences: 0,
    sources: new Set<TagSuggestionSource>(),
    matches: new Set<string>()
  };

  signal.weight += weight;
  signal.occurrences += 1;
  signal.sources.add(source);
  signal.matches.add(normalizeCandidateTag(matchText));
  signals.set(key, signal);
}

function collectSignalsFromText(
  signals: Map<string, TagTermSignal>,
  input: string,
  source: TagSuggestionSource,
  weight: number
): void {
  const localTerms = new Set(extractTagTermCandidates(input));
  for (const term of localTerms) {
    addTagTermSignal(signals, term, source, weight, term);
  }
}

function scoreTagTermSignal(term: string, signal: TagTermSignal): number {
  const sourceBonus =
    (signal.sources.has("title") ? 10 : 0) +
    (signal.sources.has("heading") ? 7 : 0) +
    (signal.sources.has("reference") ? 6 : 0) +
    (signal.sources.has("alias") ? 5 : 0) +
    (signal.sources.has("context") ? 4 : 0) +
    (signal.sources.has("body") ? Math.min(6, signal.occurrences * 2) : 0);

  return signal.weight + sourceBonus + keywordLengthBonus(term) - genericTermPenalty(term);
}

function isRedundantKeywordSuggestion(term: string, score: number, accepted: TagSuggestion[]): boolean {
  return accepted.some((suggestion) => {
    if (suggestion.kind !== "keyword" && suggestion.kind !== "source-path") {
      return false;
    }

    if (suggestion.tag.includes(term) && suggestion.score >= score - 2) {
      return true;
    }

    if (term.includes(suggestion.tag) && score <= suggestion.score + 2) {
      return true;
    }

    return false;
  });
}

function mergeSuggestion(
  suggestions: Map<string, TagSuggestion>,
  tag: string,
  kind: TagSuggestionKind,
  score: number,
  matches: string[],
  bucket: TagSuggestionBucket,
  sources: TagSuggestionSource[]
): void {
  const normalizedTag = normalizeCandidateTag(tag);
  if (!normalizedTag || isNoisyToken(normalizedTag) || isStructuralTerm(normalizedTag)) {
    return;
  }

  if (isCjkToken(normalizedTag) && isInvalidCjkPhrase(normalizedTag)) {
    return;
  }

  const key = normalizedTag.toLowerCase();
  const existing = suggestions.get(key);
  const normalizedMatches = uniq(matches.map(normalizeCandidateTag).filter((item) => item && !isNoisyToken(item)));
  const normalizedSources = uniq(sources) as TagSuggestionSource[];

  if (!existing) {
    suggestions.set(key, {
      tag: normalizedTag,
      kind,
      score,
      bucket,
      matches: normalizedMatches,
      sources: normalizedSources
    });
    return;
  }

  const shouldReplaceKind = score > existing.score;
  existing.score = Math.max(existing.score, score);
  existing.bucket = existing.bucket === "primary" || bucket === "primary" ? "primary" : "secondary";
  existing.matches = uniq([...existing.matches, ...normalizedMatches]);
  existing.sources = uniq([...existing.sources, ...normalizedSources]) as TagSuggestionSource[];
  if (shouldReplaceKind) {
    existing.kind = kind;
  }
}

export async function suggestTagsForFile(app: App, file: TFile, aliasMapText: string): Promise<TagSuggestion[]> {
  const content = await app.vault.cachedRead(file);
  const cache = app.metadataCache.getFileCache(file);
  const existing = new Set(getAllTagsForFile(app, file).map((tag) => tag.toLowerCase()));
  const knownTags = getTagStats(app, aliasMapText);
  const aliasMap = parseTagAliasMap(aliasMapText);
  const titleTerms = extractTagTermCandidates(file.basename);
  const headings = (cache?.headings ?? []).map((heading) => heading.heading).flatMap(extractTagTermCandidates);
  const referencedContext = await collectReferencedContextTerms(app, file, content);
  const directReferenceTerms = collectReferenceTargetTerms(content);
  const naturalBody = getNaturalLanguageBody(content);
  const noteAliases = getAliasesFromCache(cache);
  const pathTerms = file.path
    .split("/")
    .slice(0, -1)
    .flatMap((segment) => extractTagTermCandidates(segment));
  const naturalText = [
    file.basename,
    ...noteAliases,
    ...titleTerms,
    ...headings,
    ...directReferenceTerms,
    ...referencedContext.terms,
    ...referencedContext.tags,
    naturalBody
  ].join("\n");
  const suggestions = new Map<string, TagSuggestion>();
  const keywordSignals = new Map<string, TagTermSignal>();
  const acceptedKeywordSuggestions: TagSuggestion[] = [];

  collectSignalsFromText(keywordSignals, file.basename, "title", 9);
  for (const alias of noteAliases) {
    collectSignalsFromText(keywordSignals, alias, "alias", 7);
  }
  for (const heading of cache?.headings ?? []) {
    collectSignalsFromText(keywordSignals, heading.heading, "heading", 8);
  }
  for (const term of directReferenceTerms) {
    collectSignalsFromText(keywordSignals, term, "reference", 7);
  }
  for (const term of referencedContext.terms) {
    collectSignalsFromText(keywordSignals, term, "context", 5);
  }
  for (const term of pathTerms) {
    collectSignalsFromText(keywordSignals, term, "path", 2);
  }
  for (const line of naturalBody.split("\n").slice(0, 160)) {
    collectSignalsFromText(keywordSignals, line, "body", 3);
  }

  for (const tag of referencedContext.tags) {
    if (existing.has(tag.toLowerCase())) {
      continue;
    }
    mergeSuggestion(suggestions, tag, "known-tag", 24, [tag], "primary", ["context", "vault-tag"]);
  }

  for (const [canonical, aliases] of aliasMap.entries()) {
    if (existing.has(canonical.toLowerCase()) || isNoisyToken(canonical)) {
      continue;
    }
    const matches = [canonical, ...aliases].filter((term) => hasPhrase(naturalText, term));
    if (matches.length > 0) {
      mergeSuggestion(suggestions, canonical, "alias", 46 + matches.length * 4, matches, "primary", ["alias"]);
    }
  }

  for (const stat of knownTags) {
    if (existing.has(stat.tag.toLowerCase()) || isNoisyToken(stat.tag)) {
      continue;
    }
    const matches = [stat.tag, ...stat.aliases].filter((term) => hasPhrase(naturalText, term));
    if (matches.length > 0) {
      mergeSuggestion(
        suggestions,
        stat.tag,
        "known-tag",
        28 + Math.min(stat.count, 5) + matches.length * 3,
        matches,
        "primary",
        ["vault-tag"]
      );
    }
  }

  const rankedKeywordSignals = [...keywordSignals.entries()]
    .map(([term, signal]) => ({
      term,
      signal,
      score: scoreTagTermSignal(term, signal)
    }))
    .sort((left, right) => right.score - left.score || left.term.localeCompare(right.term, "zh-Hans-CN"));

  for (const entry of rankedKeywordSignals) {
    const { term, signal, score } = entry;
    if (existing.has(term.toLowerCase()) || isNoisyToken(term) || isStructuralTerm(term) || isLowSignalTagTerm(term)) {
      continue;
    }

    const strongSource =
      signal.sources.has("title") ||
      signal.sources.has("heading") ||
      signal.sources.has("reference") ||
      signal.sources.has("alias");
    if (score < 18 && !strongSource && signal.occurrences < 2) {
      continue;
    }

    if (isRedundantKeywordSuggestion(term, score, acceptedKeywordSuggestions)) {
      continue;
    }

    const kind: TagSuggestionKind = signal.sources.size === 1 && signal.sources.has("path") ? "source-path" : "keyword";
    const bucket: TagSuggestionBucket = kind === "source-path" || (!strongSource && score < 28) ? "secondary" : "primary";
    const suggestion: TagSuggestion = {
      tag: term,
      score,
      kind,
      bucket,
      matches: uniq([...signal.matches].filter((item) => item && item.toLowerCase() !== term.toLowerCase())).slice(0, 4),
      sources: uniq([...signal.sources]) as TagSuggestionSource[]
    };
    mergeSuggestion(suggestions, suggestion.tag, suggestion.kind, suggestion.score, suggestion.matches, suggestion.bucket, suggestion.sources);
    acceptedKeywordSuggestions.push(suggestion);
  }

  return [...suggestions.values()]
    .filter((suggestion) => Boolean(suggestion.tag))
    .sort((left, right) =>
      (left.bucket === right.bucket ? 0 : left.bucket === "primary" ? -1 : 1) ||
      right.score - left.score ||
      left.tag.localeCompare(right.tag, "zh-Hans-CN"))
    .slice(0, 14);
}
