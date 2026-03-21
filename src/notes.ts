import { App, CachedMetadata, MarkdownView, TFile, prepareFuzzySearch } from "obsidian";

import {
  buildReferenceContextSnippet,
  extractLegacyLineReferences,
  extractNativeBlockReferences,
  getBlockReferencePreview,
  getLineRangePreview
} from "./references";
import type { LinkTagIntelligenceSettings } from "./settings";

export interface NoteSummary {
  file: TFile;
  title: string;
  path: string;
  aliases: string[];
  tags: string[];
  excerpt: string;
  relationMap: Record<string, string[]>;
  researchMetadata: ResearchSourceMetadata | null;
}

export interface LinkCandidate extends NoteSummary {
  score: number;
  reasons: string[];
  sharedTags: string[];
}

export interface MentionCandidate {
  file: TFile;
  snippet: string;
  matchedTerm: string;
}

export interface ExactReference {
  kind: "block" | "line";
  raw: string;
  sourceFile: TFile;
  targetFile: TFile;
  sourceMetadata: ResearchSourceMetadata | null;
  targetMetadata: ResearchSourceMetadata | null;
  sourceContext: string;
  targetPreview: string;
  sourceStartLine?: number;
  sourceEndLine?: number;
  startLine?: number;
  endLine?: number;
  blockId?: string;
}

export interface ResearchSourceMetadata {
  citekey?: string;
  author?: string;
  year?: string;
  sourceType?: string;
  locator?: string;
  evidenceKind?: string;
}

function getOffsetLineRange(content: string, start: number, end: number): { startLine: number; endLine: number } {
  const normalizedStart = Math.max(0, start);
  const normalizedEnd = Math.max(normalizedStart, end);
  const startLine = content.slice(0, normalizedStart).split("\n").length;
  const endLine = startLine + Math.max(0, content.slice(normalizedStart, normalizedEnd).split("\n").length - 1);
  return { startLine, endLine };
}

const FRONTMATTER_RE = /^\s*---\n[\s\S]*?\n---\n?/;
const CJK_RE = /[\u3400-\u9fff]/;

export function isSupportedNotePath(path: string): boolean {
  const lower = path.trim().toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".excalidraw");
}

export function isSupportedNoteFile(file: TFile | null | undefined): file is TFile {
  return file instanceof TFile && isSupportedNotePath(file.path);
}

export function isExcalidrawFile(file: TFile): boolean {
  const lower = file.path.toLowerCase();
  return lower.endsWith(".excalidraw.md") || file.extension === "excalidraw";
}

export function appendTextToMarkdownSection(content: string, text: string, isExcalidraw: boolean): string {
  if (isExcalidraw) {
    const idx = content.indexOf("\n%%\n");
    if (idx >= 0) {
      const before = content.slice(0, idx);
      const after = content.slice(idx);
      const sep = before.endsWith("\n") ? "" : "\n";
      return `${before}${sep}${text}\n${after}`;
    }
  }
  const sep = content.endsWith("\n") ? "" : "\n";
  return `${content}${sep}${text}\n`;
}

function readStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return [value.trim()].filter(Boolean);
  }
  return [];
}

function readScalarString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => readScalarString(item)).find((item): item is string => Boolean(item));
  }
  return undefined;
}

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
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

export function stripFrontmatter(content: string): string {
  return content.replace(FRONTMATTER_RE, "");
}

export function getNoteExcerpt(content: string): string {
  const stripped = stripFrontmatter(content)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && !line.startsWith("#"));
  return stripped.join(" ").slice(0, 180);
}

export function getAllSupportedNoteFiles(app: App): TFile[] {
  const mdFiles = app.vault.getMarkdownFiles().filter((file) => isSupportedNoteFile(file));
  const excalidrawFiles = app.vault.getFiles().filter(
    (file) => file.extension === "excalidraw"
  );
  return [...mdFiles, ...excalidrawFiles];
}

export function getAllMarkdownFiles(app: App): TFile[] {
  return getAllSupportedNoteFiles(app);
}

export function getCurrentEditorView(app: App): MarkdownView | null {
  const activeView = app.workspace.getActiveViewOfType(MarkdownView) ?? null;
  return isSupportedNoteFile(activeView?.file ?? null) ? activeView : null;
}

export function getCurrentMarkdownView(app: App): MarkdownView | null {
  return getCurrentEditorView(app);
}

export function getCurrentNoteFile(app: App): TFile | null {
  const activeFile = app.workspace.getActiveFile();
  return isSupportedNoteFile(activeFile) ? activeFile : null;
}

export function getCurrentMarkdownFile(app: App): TFile | null {
  return getCurrentNoteFile(app);
}

export function getCurrentSelection(app: App): string {
  return getCurrentEditorView(app)?.editor?.getSelection() ?? "";
}

export function getAliasesFromCache(cache?: CachedMetadata | null): string[] {
  return uniq(readStringArray(cache?.frontmatter?.aliases ?? cache?.frontmatter?.alias));
}

export function getInlineTagsFromCache(cache?: CachedMetadata | null): string[] {
  return uniq((cache?.tags ?? []).map((tag) => tag.tag.replace(/^#/, "").trim()));
}

export function getFrontmatterTagsFromCache(cache?: CachedMetadata | null): string[] {
  return uniq(readStringArray(cache?.frontmatter?.tags));
}

export function getAllTagsForFile(app: App, file: TFile): string[] {
  const cache = app.metadataCache.getFileCache(file);
  return uniq([...getFrontmatterTagsFromCache(cache), ...getInlineTagsFromCache(cache)]);
}

export function getResearchSourceMetadataFromFrontmatter(frontmatter?: Record<string, unknown> | null): ResearchSourceMetadata | null {
  if (!frontmatter) {
    return null;
  }

  const author = (() => {
    const authors = readStringArray(frontmatter.authors ?? frontmatter.author);
    if (authors.length > 0) {
      return authors.join(", ");
    }
    return readScalarString(frontmatter.author);
  })();

  const metadata: ResearchSourceMetadata = {
    citekey: readScalarString(frontmatter.citekey ?? frontmatter.citationKey ?? frontmatter.citation_key ?? frontmatter.cite_key),
    author,
    year: readScalarString(frontmatter.year ?? frontmatter.publication_year ?? frontmatter.date),
    sourceType: readScalarString(frontmatter.entry_type ?? frontmatter.itemType ?? frontmatter.source_type ?? frontmatter.sourceType),
    locator: readScalarString(frontmatter.page ?? frontmatter.pages ?? frontmatter.locator),
    evidenceKind: readScalarString(frontmatter.evidence_kind ?? frontmatter.evidenceKind ?? frontmatter.note_kind)
  };

  return Object.values(metadata).some(Boolean) ? metadata : null;
}

export function getResearchSourceMetadataForFile(app: App, file: TFile): ResearchSourceMetadata | null {
  return getResearchSourceMetadataFromFrontmatter(app.metadataCache.getFileCache(file)?.frontmatter);
}

export function getRelationMap(app: App, file: TFile, settings: LinkTagIntelligenceSettings): Record<string, string[]> {
  const cache = app.metadataCache.getFileCache(file);
  const frontmatter = cache?.frontmatter ?? {};
  const result: Record<string, string[]> = {};

  for (const key of settings.relationKeys) {
    const values = uniq(readStringArray(frontmatter[key]));
    if (values.length > 0) {
      result[key] = values;
    }
  }

  return result;
}

export function resolveNoteTarget(app: App, target: string, sourcePath?: string): TFile | null {
  const normalized = target.trim();
  if (!normalized) {
    return null;
  }

  const firstMatch = app.metadataCache.getFirstLinkpathDest(normalized, sourcePath ?? "");
  if (firstMatch) {
    return firstMatch;
  }

  const lower = normalized.toLowerCase();
  for (const file of getAllSupportedNoteFiles(app)) {
    if (file.path.toLowerCase() === lower || file.basename.toLowerCase() === lower || file.name.toLowerCase() === lower) {
      return file;
    }

    const aliases = getAliasesFromCache(app.metadataCache.getFileCache(file));
    if (aliases.some((alias) => alias.toLowerCase() === lower)) {
      return file;
    }
  }

  return null;
}

function buildSearchFields(app: App, file: TFile, aliasMap: Map<string, string[]>): string[] {
  const cache = app.metadataCache.getFileCache(file);
  const tags = getAllTagsForFile(app, file);
  const metadata = getResearchSourceMetadataFromFrontmatter(cache?.frontmatter);
  const reverseAliases = [...aliasMap.entries()]
    .filter(([, aliases]) => aliases.some((alias: string) => tags.some((tag) => tag.toLowerCase() === alias.toLowerCase())))
    .map(([canonical]) => canonical);

  const aliasTerms = tags.flatMap((tag) => aliasMap.get(tag) ?? []);

  return uniq([
    file.basename,
    file.name,
    file.path,
    ...getAliasesFromCache(cache),
    ...tags,
    metadata?.citekey ?? "",
    metadata?.author ?? "",
    metadata?.year ?? "",
    metadata?.sourceType ?? "",
    metadata?.locator ?? "",
    metadata?.evidenceKind ?? "",
    ...aliasTerms,
    ...reverseAliases
  ]);
}

export async function collectLinkCandidates(
  app: App,
  currentFile: TFile | null,
  query: string,
  settings: LinkTagIntelligenceSettings,
  recentTargets: string[],
  aliasMap: Map<string, string[]>
): Promise<LinkCandidate[]> {
  const normalizedQuery = query.trim().toLowerCase();
  const fuzzy = normalizedQuery ? prepareFuzzySearch(normalizedQuery) : null;
  const currentTags = currentFile ? new Set(getAllTagsForFile(app, currentFile).map((tag) => tag.toLowerCase())) : new Set<string>();
  const currentRelations = currentFile ? getRelationMap(app, currentFile, settings) : {};
  const currentRelationTargets = new Set(Object.values(currentRelations).flat().map((value) => value.toLowerCase()));

  const candidates = await Promise.all(
    getAllSupportedNoteFiles(app)
      .filter((file) => !currentFile || file.path !== currentFile.path)
      .map(async (file) => {
        const cache = app.metadataCache.getFileCache(file);
        const aliases = getAliasesFromCache(cache);
        const tags = getAllTagsForFile(app, file);
        const researchMetadata = getResearchSourceMetadataFromFrontmatter(cache?.frontmatter);
        const sharedTags = tags.filter((tag) => currentTags.has(tag.toLowerCase()));
        const fields = buildSearchFields(app, file, aliasMap);
        const reasons: string[] = [];
        let score = 0;

        if (!normalizedQuery) {
          score += 10;
        }

        for (const field of fields) {
          const lowerField = field.toLowerCase();
          if (normalizedQuery && lowerField === normalizedQuery) {
            score += 100;
            reasons.push(`exact:${field}`);
          } else if (normalizedQuery && lowerField.includes(normalizedQuery)) {
            score += 45;
            reasons.push(`contains:${field}`);
          } else if (normalizedQuery && fuzzy?.(field)) {
            score += 25;
            reasons.push(`fuzzy:${field}`);
          }
        }

        if (sharedTags.length > 0) {
          score += sharedTags.length * 8;
          reasons.push(`shared-tags:${sharedTags.join(", ")}`);
        }

        if (currentRelationTargets.has(file.path.toLowerCase()) || currentRelationTargets.has(file.basename.toLowerCase())) {
          score += 16;
          reasons.push("relation-neighbor");
        }

        const recentIndex = recentTargets.findIndex((target) => target === file.path);
        if (recentIndex >= 0) {
          score += Math.max(0, 18 - recentIndex);
          reasons.push("recent");
        }

        const content = await app.vault.cachedRead(file);

        return {
          file,
          title: file.basename,
          path: file.path,
          aliases,
          tags,
          excerpt: getNoteExcerpt(content),
          relationMap: getRelationMap(app, file, settings),
          researchMetadata,
          sharedTags,
          reasons: uniq(reasons),
          score
        };
      })
  );

  return candidates
    .filter((candidate) => !normalizedQuery || candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title, "zh-Hans-CN"));
}

export async function getOutgoingLinkFiles(app: App, file: TFile): Promise<TFile[]> {
  const cache = app.metadataCache.getFileCache(file);
  const links = [...(cache?.links ?? []), ...(cache?.frontmatterLinks ?? [])];
  const seen = new Set<string>();
  const resolved: TFile[] = [];

  for (const link of links) {
    const target = app.metadataCache.getFirstLinkpathDest(link.link, file.path);
    if (target && !seen.has(target.path)) {
      seen.add(target.path);
      resolved.push(target);
    }
  }

  const content = await app.vault.cachedRead(file);
  for (const reference of extractLegacyLineReferences(content)) {
    const target = resolveNoteTarget(app, reference.target, file.path);
    if (target && !seen.has(target.path)) {
      seen.add(target.path);
      resolved.push(target);
    }
  }

  return resolved;
}

export async function getBacklinkFiles(app: App, file: TFile): Promise<TFile[]> {
  const resolvedLinks = app.metadataCache.resolvedLinks;
  const seen = new Set<string>();
  const backlinks: TFile[] = [];

  for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
    if (!targets[file.path] || sourcePath === file.path) {
      continue;
    }
    const sourceFile = app.vault.getAbstractFileByPath(sourcePath);
    if (sourceFile instanceof TFile && !seen.has(sourceFile.path)) {
      seen.add(sourceFile.path);
      backlinks.push(sourceFile);
    }
  }

  for (const otherFile of getAllSupportedNoteFiles(app)) {
    if (otherFile.path === file.path || seen.has(otherFile.path)) {
      continue;
    }

    const content = await app.vault.cachedRead(otherFile);
    const references = extractLegacyLineReferences(content);
    if (references.some((reference) => {
      const target = resolveNoteTarget(app, reference.target, otherFile.path);
      return target?.path === file.path;
    })) {
      seen.add(otherFile.path);
      backlinks.push(otherFile);
    }
  }

  return backlinks.sort((left, right) => left.basename.localeCompare(right.basename, "zh-Hans-CN"));
}

export async function getOutgoingExactReferences(app: App, file: TFile): Promise<ExactReference[]> {
  const content = await app.vault.cachedRead(file);
  const collected: Array<ExactReference & { order: number }> = [];

  for (const reference of extractLegacyLineReferences(content)) {
    const targetFile = resolveNoteTarget(app, reference.target, file.path);
    if (!targetFile) {
      continue;
    }
    const sourceRange = getOffsetLineRange(content, reference.position.start, reference.position.end);

    collected.push({
      kind: reference.kind,
      raw: reference.raw,
      sourceFile: file,
      targetFile,
      sourceMetadata: getResearchSourceMetadataForFile(app, file),
      targetMetadata: getResearchSourceMetadataForFile(app, targetFile),
      sourceContext: buildReferenceContextSnippet(content, reference.position.start, reference.position.end),
      targetPreview: await getLineRangePreview(app, targetFile, reference.startLine, reference.endLine),
      sourceStartLine: sourceRange.startLine,
      sourceEndLine: sourceRange.endLine,
      startLine: reference.startLine,
      endLine: reference.endLine,
      order: reference.position.start
    });
  }

  for (const reference of extractNativeBlockReferences(content)) {
    const targetFile = resolveNoteTarget(app, reference.target, file.path);
    if (!targetFile) {
      continue;
    }
    const sourceRange = getOffsetLineRange(content, reference.position.start, reference.position.end);

    const blockPreview = await getBlockReferencePreview(app, targetFile, reference.blockId);
      collected.push({
        kind: "block",
        raw: reference.raw,
        sourceFile: file,
        targetFile,
        sourceMetadata: getResearchSourceMetadataForFile(app, file),
        targetMetadata: getResearchSourceMetadataForFile(app, targetFile),
        sourceContext: buildReferenceContextSnippet(content, reference.position.start, reference.position.end),
        targetPreview: blockPreview?.preview ?? "",
        sourceStartLine: sourceRange.startLine,
      sourceEndLine: sourceRange.endLine,
      blockId: reference.blockId,
      startLine: blockPreview?.startLine,
      endLine: blockPreview?.endLine,
      order: reference.position.start
    });
  }

  return collected
    .sort((left, right) => left.order - right.order)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- _order is intentionally omitted from reference object
    .map(({ order: _order, ...reference }) => reference);
}

export async function getIncomingExactReferences(app: App, file: TFile): Promise<ExactReference[]> {
  const collected: Array<ExactReference & { order: number }> = [];

  for (const otherFile of getAllSupportedNoteFiles(app)) {
    if (otherFile.path === file.path) {
      continue;
    }

    const content = await app.vault.cachedRead(otherFile);

    for (const reference of extractLegacyLineReferences(content)) {
      const targetFile = resolveNoteTarget(app, reference.target, otherFile.path);
      if (targetFile?.path !== file.path) {
        continue;
      }
      const sourceRange = getOffsetLineRange(content, reference.position.start, reference.position.end);

      collected.push({
        kind: reference.kind,
        raw: reference.raw,
        sourceFile: otherFile,
        targetFile: file,
        sourceMetadata: getResearchSourceMetadataForFile(app, otherFile),
        targetMetadata: getResearchSourceMetadataForFile(app, file),
        sourceContext: buildReferenceContextSnippet(content, reference.position.start, reference.position.end),
        targetPreview: await getLineRangePreview(app, file, reference.startLine, reference.endLine),
        sourceStartLine: sourceRange.startLine,
        sourceEndLine: sourceRange.endLine,
        startLine: reference.startLine,
        endLine: reference.endLine,
        order: reference.position.start
      });
    }

    for (const reference of extractNativeBlockReferences(content)) {
      const targetFile = resolveNoteTarget(app, reference.target, otherFile.path);
      if (targetFile?.path !== file.path) {
        continue;
      }
      const sourceRange = getOffsetLineRange(content, reference.position.start, reference.position.end);

      const blockPreview = await getBlockReferencePreview(app, file, reference.blockId);
      collected.push({
        kind: "block",
        raw: reference.raw,
        sourceFile: otherFile,
        targetFile: file,
        sourceMetadata: getResearchSourceMetadataForFile(app, otherFile),
        targetMetadata: getResearchSourceMetadataForFile(app, file),
        sourceContext: buildReferenceContextSnippet(content, reference.position.start, reference.position.end),
        targetPreview: blockPreview?.preview ?? "",
        sourceStartLine: sourceRange.startLine,
        sourceEndLine: sourceRange.endLine,
        blockId: reference.blockId,
        startLine: blockPreview?.startLine,
        endLine: blockPreview?.endLine,
        order: reference.position.start
      });
    }
  }

  return collected
    .sort((left, right) =>
      left.sourceFile.basename.localeCompare(right.sourceFile.basename, "zh-Hans-CN") || left.order - right.order
    )
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- _order is intentionally omitted from reference object
    .map(({ order: _order, ...reference }) => reference);
}

function containsMention(text: string, term: string): number {
  if (!term.trim()) {
    return -1;
  }
  if (CJK_RE.test(term)) {
    return text.indexOf(term);
  }
  const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  const match = regex.exec(text);
  return match?.index ?? -1;
}

function buildMentionSnippet(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 50);
  const end = Math.min(text.length, index + length + 80);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

export async function findUnlinkedMentions(
  app: App,
  file: TFile,
  settings: LinkTagIntelligenceSettings,
  limit = 8
): Promise<MentionCandidate[]> {
  const terms = uniq([file.basename, ...getAliasesFromCache(app.metadataCache.getFileCache(file))]).filter((term) => term.length >= 2);
  if (terms.length === 0) {
    return [];
  }

  const results: MentionCandidate[] = [];
  const resolvedLinks = app.metadataCache.resolvedLinks;

  for (const otherFile of getAllSupportedNoteFiles(app)) {
    if (otherFile.path === file.path) {
      continue;
    }
    if (resolvedLinks[otherFile.path]?.[file.path]) {
      continue;
    }

    const content = stripFrontmatter(await app.vault.cachedRead(otherFile));
    for (const term of terms) {
      const index = containsMention(content, term);
      if (index >= 0) {
        results.push({
          file: otherFile,
          snippet: buildMentionSnippet(content, index, term.length),
          matchedTerm: term
        });
        break;
      }
    }

    if (results.length >= limit) {
      break;
    }
  }

  void settings;
  return results;
}

export function getResolvedRelations(
  app: App,
  file: TFile,
  settings: LinkTagIntelligenceSettings
): Record<string, TFile[]> {
  const relationMap = getRelationMap(app, file, settings);
  const resolved: Record<string, TFile[]> = {};

  for (const [key, values] of Object.entries(relationMap)) {
    const targets = values
      .map((value) => resolveNoteTarget(app, value, file.path))
      .filter((target): target is TFile => target instanceof TFile);

    if (targets.length > 0) {
      resolved[key] = targets;
    }
  }

  return resolved;
}
