import type { App, BlockCache, MarkdownPostProcessorContext, TFile } from "obsidian";
import type { ReadingReferenceHoverController, ReadingReferencePreviewOptions } from "./reading-hover-controller";

export interface LegacyLineReference {
  raw: string;
  kind: "block" | "line";
  target: string;
  startLine: number;
  endLine?: number;
  position: {
    start: number;
    end: number;
  };
}

export interface BlockReferenceCandidate {
  blockId: string;
  startLine: number;
  endLine: number;
  preview: string;
}

export interface NativeBlockReference {
  raw: string;
  target: string;
  blockId: string;
  alias?: string;
  position: {
    start: number;
    end: number;
  };
}

const LEGACY_LINE_REFERENCE_RE = /(?:<<\{?([^:}]+)\}?:\{?(\d+)\}?(?:-\{?(\d+)\}?)?>>(?!>)|\(\(\(([^#)]+)#(\d+)(?:-(\d+))?\)\)\))(?=(?:[^`]*`[^`]*`)*[^`]*$)/g;
const NATIVE_BLOCK_REFERENCE_RE = /\[\[([^\]|#]+)#\^([A-Za-z0-9-]+)(?:\|([^\]]+))?\]\]/g;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export function normalizeLineRange(startLine: number, endLine: number | undefined, totalLines: number): { startLine: number; endLine: number } {
  const safeTotal = Math.max(totalLines, 1);
  const safeStart = clamp(startLine, 1, safeTotal);
  const rawEnd = endLine ?? safeStart;
  const safeEnd = clamp(Math.max(rawEnd, safeStart), safeStart, safeTotal);
  return {
    startLine: safeStart,
    endLine: safeEnd
  };
}

export function extractLegacyLineReferences(content: string): LegacyLineReference[] {
  const references: LegacyLineReference[] = [];
  const regex = new RegExp(LEGACY_LINE_REFERENCE_RE.source, LEGACY_LINE_REFERENCE_RE.flags);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const target = (match[1] || match[4])?.trim();
    const startLine = Number.parseInt(match[2] || match[5], 10);
    const endLineValue = match[3] ? Number.parseInt(match[3], 10) : match[6] ? Number.parseInt(match[6], 10) : undefined;

    if (!target || !Number.isFinite(startLine)) {
      continue;
    }

    references.push({
      raw: match[0],
      kind: match[4] ? "block" : "line",
      target,
      startLine,
      endLine: endLineValue,
      position: {
        start: match.index,
        end: match.index + match[0].length
      }
    });
  }

  return references;
}

export function formatLegacyBlockReference(target: string, startLine: number, endLine?: number): string {
  if (endLine && endLine > startLine) {
    return `(((${target}#${startLine}-${endLine})))`;
  }
  return `(((${target}#${startLine})))`;
}

export function formatLegacyLineReference(target: string, startLine: number, endLine?: number): string {
  if (endLine && endLine > startLine) {
    return `<<${target}:${startLine}-${endLine}>>`;
  }
  return `<<${target}:${startLine}>>`;
}

export function extractNativeBlockReferences(content: string): NativeBlockReference[] {
  const references: NativeBlockReference[] = [];
  const regex = new RegExp(NATIVE_BLOCK_REFERENCE_RE.source, NATIVE_BLOCK_REFERENCE_RE.flags);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const target = match[1]?.trim();
    const blockId = match[2]?.trim();
    const alias = match[3]?.trim();

    if (!target || !blockId) {
      continue;
    }

    references.push({
      raw: match[0],
      target,
      blockId,
      alias,
      position: {
        start: match.index,
        end: match.index + match[0].length
      }
    });
  }

  return references;
}

export async function readFileLines(app: App, file: TFile): Promise<string[]> {
  return (await app.vault.cachedRead(file)).split("\n");
}

export function getLineRangePreviewFromLines(lines: string[], startLine: number, endLine?: number, maxLines = 6): string {
  const { startLine: safeStart, endLine: safeEnd } = normalizeLineRange(startLine, endLine, lines.length);
  const cappedEnd = Math.min(safeEnd, safeStart + Math.max(0, maxLines - 1));
  return lines
    .slice(safeStart - 1, cappedEnd)
    .join("\n")
    .trim();
}

export async function getLineRangePreview(app: App, file: TFile, startLine: number, endLine?: number): Promise<string> {
  const lines = await readFileLines(app, file);
  return getLineRangePreviewFromLines(lines, startLine, endLine);
}

function stripTrailingBlockId(line: string): string {
  return line.replace(/\s+\^[A-Za-z0-9-]+\s*$/, "").trimEnd();
}

function buildBlockReferenceCandidate(content: string, blockId: string, block: BlockCache): BlockReferenceCandidate {
  return {
    blockId,
    startLine: block.position.start.line + 1,
    endLine: block.position.end.line + 1,
    preview: stripTrailingBlockId(content.slice(block.position.start.offset, block.position.end.offset)).trim()
  };
}

export async function getBlockReferenceCandidates(app: App, file: TFile): Promise<BlockReferenceCandidate[]> {
  const cache = app.metadataCache.getFileCache(file);
  const content = await app.vault.cachedRead(file);
  const blocks = Object.entries(cache?.blocks ?? {})
    .map(([blockId, block]) => buildBlockReferenceCandidate(content, blockId, block))
    .filter((candidate) => Boolean(candidate.preview))
    .sort((left, right) => left.startLine - right.startLine);

  return blocks;
}

export async function getBlockReferencePreview(app: App, file: TFile, blockId: string): Promise<BlockReferenceCandidate | null> {
  const cache = app.metadataCache.getFileCache(file);
  const block = cache?.blocks?.[blockId];
  if (!block) {
    return null;
  }

  const content = await app.vault.cachedRead(file);
  return buildBlockReferenceCandidate(content, blockId, block);
}

function generateBlockId(existingIds: string[]): string {
  const existing = new Set(existingIds);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = `lti-${Math.random().toString(36).slice(2, 8)}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
  }
  return `lti-${Date.now().toString(36)}`;
}

function findAnchorLineIndex(lines: string[], startLine: number, endLine: number): number {
  for (let index = endLine - 1; index >= startLine - 1; index -= 1) {
    if (lines[index]?.trim()) {
      return index;
    }
  }
  return endLine - 1;
}

export async function ensureBlockIdForLineRange(
  app: App,
  file: TFile,
  startLine: number,
  endLine?: number
): Promise<BlockReferenceCandidate> {
  const original = await app.vault.read(file);
  const lines = original.split("\n");
  const normalized = normalizeLineRange(startLine, endLine, lines.length);
  const anchorLineIndex = findAnchorLineIndex(lines, normalized.startLine, normalized.endLine);
  const existingMatch = lines[anchorLineIndex]?.match(/\s+\^([A-Za-z0-9-]+)\s*$/);

  if (existingMatch?.[1]) {
    return {
      blockId: existingMatch[1],
      startLine: normalized.startLine,
      endLine: normalized.endLine,
      preview: getLineRangePreviewFromLines(lines, normalized.startLine, normalized.endLine)
    };
  }

  const cache = app.metadataCache.getFileCache(file);
  const blockId = generateBlockId(Object.keys(cache?.blocks ?? {}));
  const anchorLine = lines[anchorLineIndex] ?? "";
  const baseLine = anchorLine.trimEnd();
  lines[anchorLineIndex] = baseLine ? `${baseLine} ^${blockId}` : `^${blockId}`;
  await app.vault.modify(file, lines.join("\n"));

  return {
    blockId,
    startLine: normalized.startLine,
    endLine: normalized.endLine,
    preview: getLineRangePreviewFromLines(lines, normalized.startLine, normalized.endLine)
  };
}

function shouldSkipTextNode(node: Text): boolean {
  let current: Node | null = node.parentNode;
  while (current instanceof HTMLElement) {
    const tagName = current.tagName;
    if (tagName === "CODE" || tagName === "PRE" || tagName === "A") {
      return true;
    }
    current = current.parentNode;
  }
  return false;
}

export function buildReferenceContextSnippet(content: string, start: number, end: number, radius = 72): string {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.max(safeStart, end);
  const prefixStart = Math.max(0, safeStart - radius);
  const suffixEnd = Math.min(content.length, safeEnd + radius);
  const prefix = content.slice(prefixStart, safeStart).replace(/\s+/g, " ");
  const middle = content.slice(safeStart, safeEnd).replace(/\s+/g, " ");
  const suffix = content.slice(safeEnd, suffixEnd).replace(/\s+/g, " ");
  const leading = prefixStart > 0 ? "..." : "";
  const trailing = suffixEnd < content.length ? "..." : "";
  return `${leading}${prefix}${middle}${suffix}${trailing}`.trim();
}

function formatRangeLabel(startLine: number, endLine?: number): string {
  return endLine && endLine > startLine ? `L${startLine}-${endLine}` : `L${startLine}`;
}

function formatReferenceTitle(target: string): string {
  const strippedPath = target.split("/").pop() ?? target;
  return strippedPath.replace(/\.md$/i, "");
}

export async function renderLegacyReferences(
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  helpers: {
    app: App;
    resolveTarget: (target: string, sourcePath?: string) => TFile | null;
    openResolvedLineReference: (target: string, sourcePath: string, startLine: number, endLine?: number) => void;
    getReadingHoverController: (containerEl: HTMLElement, ctx: MarkdownPostProcessorContext) => ReadingReferenceHoverController;
  }
): Promise<void> {
  const hoverController = helpers.getReadingHoverController(el, ctx);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let currentNode: Node | null;

  while ((currentNode = walker.nextNode())) {
    if (currentNode instanceof Text && currentNode.nodeValue && !shouldSkipTextNode(currentNode)) {
      textNodes.push(currentNode);
    }
  }

  for (const textNode of textNodes) {
    const value = textNode.nodeValue;
    if (!value) {
      continue;
    }

    const references = extractLegacyLineReferences(value);
    if (references.length === 0) {
      continue;
    }

    const fragment = document.createDocumentFragment();
    let cursor = 0;

    for (const reference of references) {
      if (reference.position.start > cursor) {
        fragment.append(document.createTextNode(value.slice(cursor, reference.position.start)));
      }

      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `lti-inline-ref ${reference.kind === "block" ? "is-block" : "is-line"}`;
      const resolvedFile = helpers.resolveTarget(reference.target, ctx.sourcePath);
      const title = document.createElement("span");
      title.className = "lti-inline-ref-title";
      title.textContent = resolvedFile?.basename ?? formatReferenceTitle(reference.target);
      chip.append(title);

      const meta = document.createElement("span");
      meta.className = "lti-inline-ref-meta";
      meta.textContent = formatRangeLabel(reference.startLine, reference.endLine);
      chip.append(meta);
      chip.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        helpers.openResolvedLineReference(reference.target, ctx.sourcePath, reference.startLine, reference.endLine);
      });
      chip.addEventListener("mouseenter", () => {
        hoverController.cancelHide();
        void hoverController.show(chip, {
          kind: reference.kind,
          target: reference.target,
          sourcePath: ctx.sourcePath,
          startLine: reference.startLine,
          endLine: reference.endLine,
          raw: reference.raw
        } satisfies ReadingReferencePreviewOptions);
      });
      chip.addEventListener("mouseleave", () => {
        hoverController.scheduleHide();
      });
      chip.addEventListener("focus", () => {
        hoverController.cancelHide();
        void hoverController.show(chip, {
          kind: reference.kind,
          target: reference.target,
          sourcePath: ctx.sourcePath,
          startLine: reference.startLine,
          endLine: reference.endLine,
          raw: reference.raw
        } satisfies ReadingReferencePreviewOptions);
      });
      chip.addEventListener("blur", () => {
        hoverController.scheduleHide();
      });

      fragment.append(chip);
      cursor = reference.position.end;
    }

    if (cursor < value.length) {
      fragment.append(document.createTextNode(value.slice(cursor)));
    }

    textNode.parentNode?.replaceChild(fragment, textNode);
  }
}
