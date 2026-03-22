"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => LinkTagIntelligencePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian11 = require("obsidian");

// src/editor-extension.ts
var import_state = require("@codemirror/state");
var import_view = require("@codemirror/view");
var import_obsidian = require("obsidian");

// src/references.ts
var LEGACY_LINE_REFERENCE_RE = /(?:<<\{?([^:}]+)\}?:\{?(\d+)\}?(?:-\{?(\d+)\}?)?>>(?!>)|\(\(\(([^#)]+)#(\d+)(?:-(\d+))?\)\)\))(?=(?:[^`]*`[^`]*`)*[^`]*$)/g;
var NATIVE_BLOCK_REFERENCE_RE = /\[\[([^\]|#]+)#\^([A-Za-z0-9-]+)(?:\|([^\]]+))?\]\]/g;
function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
}
function normalizeLineRange(startLine, endLine, totalLines) {
  const safeTotal = Math.max(totalLines, 1);
  const safeStart = clamp(startLine, 1, safeTotal);
  const rawEnd = endLine ?? safeStart;
  const safeEnd = clamp(Math.max(rawEnd, safeStart), safeStart, safeTotal);
  return {
    startLine: safeStart,
    endLine: safeEnd
  };
}
function extractLegacyLineReferences(content) {
  const references = [];
  const regex = new RegExp(LEGACY_LINE_REFERENCE_RE.source, LEGACY_LINE_REFERENCE_RE.flags);
  let match;
  while ((match = regex.exec(content)) !== null) {
    const target = (match[1] || match[4])?.trim();
    const startLine = Number.parseInt(match[2] || match[5], 10);
    const endLineValue = match[3] ? Number.parseInt(match[3], 10) : match[6] ? Number.parseInt(match[6], 10) : void 0;
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
function formatLegacyBlockReference(target, startLine, endLine) {
  if (endLine && endLine > startLine) {
    return `(((${target}#${startLine}-${endLine})))`;
  }
  return `(((${target}#${startLine})))`;
}
function formatLegacyLineReference(target, startLine, endLine) {
  if (endLine && endLine > startLine) {
    return `<<${target}:${startLine}-${endLine}>>`;
  }
  return `<<${target}:${startLine}>>`;
}
function extractNativeBlockReferences(content) {
  const references = [];
  const regex = new RegExp(NATIVE_BLOCK_REFERENCE_RE.source, NATIVE_BLOCK_REFERENCE_RE.flags);
  let match;
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
async function readFileLines(app, file) {
  return (await app.vault.cachedRead(file)).split("\n");
}
function getLineRangePreviewFromLines(lines, startLine, endLine, maxLines = 6) {
  const { startLine: safeStart, endLine: safeEnd } = normalizeLineRange(startLine, endLine, lines.length);
  const cappedEnd = Math.min(safeEnd, safeStart + Math.max(0, maxLines - 1));
  return lines.slice(safeStart - 1, cappedEnd).join("\n").trim();
}
async function getLineRangePreview(app, file, startLine, endLine) {
  const lines = await readFileLines(app, file);
  return getLineRangePreviewFromLines(lines, startLine, endLine);
}
function stripTrailingBlockId(line) {
  return line.replace(/\s+\^[A-Za-z0-9-]+\s*$/, "").trimEnd();
}
function buildBlockReferenceCandidate(content, blockId, block) {
  return {
    blockId,
    startLine: block.position.start.line + 1,
    endLine: block.position.end.line + 1,
    preview: stripTrailingBlockId(content.slice(block.position.start.offset, block.position.end.offset)).trim()
  };
}
async function getBlockReferencePreview(app, file, blockId) {
  const cache = app.metadataCache.getFileCache(file);
  const block = cache?.blocks?.[blockId];
  if (!block) {
    return null;
  }
  const content = await app.vault.cachedRead(file);
  return buildBlockReferenceCandidate(content, blockId, block);
}
function shouldSkipTextNode(node) {
  let current = node.parentNode;
  while (current instanceof HTMLElement) {
    const tagName = current.tagName;
    if (tagName === "CODE" || tagName === "PRE" || tagName === "A") {
      return true;
    }
    current = current.parentNode;
  }
  return false;
}
function buildReferenceContextSnippet(content, start, end, radius = 72) {
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
function formatRangeLabel(startLine, endLine) {
  return endLine && endLine > startLine ? `L${startLine}-${endLine}` : `L${startLine}`;
}
function formatReferenceTitle(target) {
  const strippedPath = target.split("/").pop() ?? target;
  return strippedPath.replace(/\.md$/i, "");
}
function renderLegacyReferences(el, ctx, helpers) {
  const hoverController = helpers.getReadingHoverController(el, ctx);
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let currentNode;
  while (currentNode = walker.nextNode()) {
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
        });
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
        });
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

// src/editor-extension.ts
function getSourcePath(info) {
  return info?.file?.path ?? "";
}
function formatRangeLabel2(startLine, endLine) {
  return endLine && endLine > startLine ? `L${startLine}-${endLine}` : `L${startLine}`;
}
function formatReferenceTitle2(target) {
  const strippedPath = target.split("/").pop() ?? target;
  return strippedPath.replace(/\.md$/i, "");
}
function shouldOpenReference(event) {
  return event.metaKey || event.ctrlKey || event.button === 1;
}
function shouldRenderAsWidget(view, from, to) {
  if (!view.hasFocus) {
    return true;
  }
  const selection = view.state.selection.main;
  if (!selection.empty && selection.from < to && selection.to > from) {
    return false;
  }
  return !(selection.head >= from && selection.head < to);
}
function buildTooltipContent(data) {
  const root = document.createElement("div");
  root.className = "lti-cm-tooltip";
  if (data.missing) {
    root.classList.add("is-missing");
  }
  const head = root.createDiv({ cls: "lti-cm-tooltip-head" });
  head.createSpan({
    cls: "lti-cm-tooltip-kind",
    text: data.location ? `${data.kindLabel} \xB7 ${data.location}` : data.kindLabel
  });
  root.createDiv({ cls: "lti-cm-tooltip-title", text: data.title });
  if (data.path) {
    root.createDiv({ cls: "lti-cm-tooltip-path", text: data.path });
  }
  root.createEl("pre", { cls: "lti-cm-tooltip-snippet", text: data.snippet });
  return root;
}
function collectEditorReferences(text, baseOffset) {
  const references = [
    ...extractLegacyLineReferences(text).map((reference) => ({
      kind: reference.kind,
      target: reference.target,
      startLine: reference.startLine,
      endLine: reference.endLine,
      raw: reference.raw,
      from: baseOffset + reference.position.start,
      to: baseOffset + reference.position.end
    })),
    ...extractNativeBlockReferences(text).map((reference) => ({
      kind: "native-block",
      target: reference.target,
      blockId: reference.blockId,
      raw: reference.raw,
      from: baseOffset + reference.position.start,
      to: baseOffset + reference.position.end
    }))
  ];
  references.sort((left, right) => left.from - right.from || left.to - right.to);
  return references;
}
function getLineReferenceAtPosition(view, pos) {
  const line = view.state.doc.lineAt(pos);
  const offset = pos - line.from;
  for (const reference of collectEditorReferences(line.text, line.from)) {
    if (pos >= reference.from && pos <= reference.to) {
      return reference;
    }
  }
  if (offset === 0 && pos > line.from) {
    return getLineReferenceAtPosition(view, pos - 1);
  }
  return null;
}
var ReferenceWidget = class extends import_view.WidgetType {
  constructor(sourcePath, range, reference) {
    super();
    this.sourcePath = sourcePath;
    this.range = range;
    this.reference = reference;
  }
  eq(other) {
    return JSON.stringify(this.reference) === JSON.stringify(other.reference) && this.sourcePath === other.sourcePath;
  }
  ignoreEvent() {
    return false;
  }
  toDOM() {
    const chip = document.createElement("span");
    chip.className = `cm-lti-ref-chip cm-lti-ref-chip-${this.reference.kind}`;
    chip.dataset.ltiRefKind = this.reference.kind;
    chip.dataset.ltiTarget = this.reference.target;
    chip.dataset.ltiSourcePath = this.sourcePath;
    chip.dataset.ltiRangeFrom = String(this.range.from);
    chip.dataset.ltiRangeTo = String(this.range.to);
    chip.dataset.ltiRaw = this.reference.raw;
    const title = document.createElement("span");
    title.className = "cm-lti-ref-chip-title";
    title.textContent = formatReferenceTitle2(this.reference.target);
    chip.append(title);
    const meta = document.createElement("span");
    meta.className = "cm-lti-ref-chip-meta";
    meta.textContent = this.reference.kind === "native-block" ? `^${this.reference.blockId}` : formatRangeLabel2(this.reference.startLine, this.reference.endLine);
    chip.append(meta);
    if (this.reference.kind === "native-block") {
      chip.dataset.ltiBlockId = this.reference.blockId;
    } else {
      chip.dataset.ltiStartLine = String(this.reference.startLine);
      if (typeof this.reference.endLine === "number") {
        chip.dataset.ltiEndLine = String(this.reference.endLine);
      }
    }
    return chip;
  }
};
function addReferenceDecoration(builder, view, sourcePath, reference) {
  if (shouldRenderAsWidget(view, reference.from, reference.to)) {
    builder.add(
      reference.from,
      reference.to,
      import_view.Decoration.replace({
        widget: new ReferenceWidget(sourcePath, { from: reference.from, to: reference.to }, reference),
        inclusive: false
      })
    );
    return;
  }
  if (reference.kind === "native-block") {
    builder.add(
      reference.from,
      reference.to,
      import_view.Decoration.mark({
        class: "cm-lti-ref cm-lti-ref-native-block",
        attributes: {
          "data-lti-ref-kind": "native-block",
          "data-lti-target": reference.target,
          "data-lti-block-id": reference.blockId,
          "data-lti-raw": reference.raw
        }
      })
    );
    return;
  }
  builder.add(
    reference.from,
    reference.to,
    import_view.Decoration.mark({
      class: `cm-lti-ref cm-lti-ref-${reference.kind}`,
      attributes: {
        "data-lti-ref-kind": reference.kind,
        "data-lti-target": reference.target,
        "data-lti-start-line": String(reference.startLine),
        ...typeof reference.endLine === "number" ? { "data-lti-end-line": String(reference.endLine) } : {},
        "data-lti-raw": reference.raw
      }
    })
  );
}
function buildDecorations(view) {
  const builder = new import_state.RangeSetBuilder();
  const info = view.state.field(import_obsidian.editorInfoField, false);
  const sourcePath = getSourcePath(info);
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    for (const reference of collectEditorReferences(text, from)) {
      addReferenceDecoration(builder, view, sourcePath, reference);
    }
  }
  return builder.finish();
}
function buildReferenceEditorExtension(plugin) {
  const decorations = import_view.ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = buildDecorations(view);
      }
      update(update) {
        if (update.docChanged || update.viewportChanged || update.selectionSet || update.focusChanged) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    {
      decorations: (value) => value.decorations,
      eventHandlers: {
        mousedown(event, view) {
          const chip = event.target instanceof HTMLElement ? event.target.closest(".cm-lti-ref-chip") : null;
          if (chip && (event.button === 0 || event.button === 1)) {
            const refKind2 = chip.dataset.ltiRefKind;
            const refTarget2 = chip.dataset.ltiTarget;
            const sourcePath2 = chip.dataset.ltiSourcePath ?? getSourcePath(view.state.field(import_obsidian.editorInfoField, false));
            if (!refKind2 || !refTarget2) {
              return false;
            }
            event.preventDefault();
            event.stopPropagation();
            if (shouldOpenReference(event)) {
              if (refKind2 === "native-block") {
                const blockId = chip.dataset.ltiBlockId;
                if (blockId) {
                  plugin.openResolvedBlockReference(refTarget2, sourcePath2, blockId);
                  return true;
                }
                return false;
              }
              const startLine2 = Number.parseInt(chip.dataset.ltiStartLine ?? "", 10);
              const endLine2 = Number.parseInt(chip.dataset.ltiEndLine ?? "", 10);
              if (!Number.isFinite(startLine2)) {
                return false;
              }
              plugin.openResolvedLineReference(refTarget2, sourcePath2, startLine2, Number.isFinite(endLine2) ? endLine2 : void 0);
              return true;
            }
            const rangeFrom = Number.parseInt(chip.dataset.ltiRangeFrom ?? "", 10);
            const rangeTo = Number.parseInt(chip.dataset.ltiRangeTo ?? "", 10);
            if (!Number.isFinite(rangeFrom) || !Number.isFinite(rangeTo) || rangeFrom >= rangeTo) {
              return false;
            }
            plugin.hideReferencePreview();
            view.focus();
            view.dispatch({
              selection: { anchor: rangeFrom, head: rangeFrom },
              scrollIntoView: true,
              userEvent: "select.pointer"
            });
            return true;
          }
          const target = event.target instanceof HTMLElement ? event.target.closest(".cm-lti-ref") : null;
          if (!target || event.button !== 0 || !shouldOpenReference(event)) {
            return false;
          }
          const info = view.state.field(import_obsidian.editorInfoField, false);
          const sourcePath = getSourcePath(info);
          const refKind = target.dataset.ltiRefKind;
          const refTarget = target.dataset.ltiTarget;
          if (!refKind || !refTarget) {
            return false;
          }
          event.preventDefault();
          event.stopPropagation();
          if (refKind === "native-block") {
            const blockId = target.dataset.ltiBlockId;
            if (blockId) {
              plugin.openResolvedBlockReference(refTarget, sourcePath, blockId);
              return true;
            }
            return false;
          }
          const startLine = Number.parseInt(target.dataset.ltiStartLine ?? "", 10);
          const endLine = Number.parseInt(target.dataset.ltiEndLine ?? "", 10);
          if (!Number.isFinite(startLine)) {
            return false;
          }
          plugin.openResolvedLineReference(refTarget, sourcePath, startLine, Number.isFinite(endLine) ? endLine : void 0);
          return true;
        }
      }
    }
  );
  const hover = (0, import_view.hoverTooltip)(async (view, pos) => {
    const reference = getLineReferenceAtPosition(view, pos);
    if (!reference) {
      return null;
    }
    const info = view.state.field(import_obsidian.editorInfoField, false);
    const sourcePath = getSourcePath(info);
    const data = await plugin.getReferencePreviewData({
      kind: reference.kind,
      target: reference.target,
      sourcePath,
      startLine: reference.kind === "native-block" ? void 0 : reference.startLine,
      endLine: reference.kind === "native-block" ? void 0 : reference.endLine,
      blockId: reference.kind === "native-block" ? reference.blockId : void 0,
      raw: reference.raw
    });
    return {
      pos: reference.from,
      end: reference.to,
      above: true,
      arrow: true,
      create() {
        const dom = buildTooltipContent(data);
        return {
          dom,
          mount() {
            dom.parentElement?.classList.add("lti-cm-tooltip-host");
          },
          destroy() {
            dom.parentElement?.classList.remove("lti-cm-tooltip-host");
          }
        };
      }
    };
  }, {
    hoverTime: 180,
    hideOnChange: true
  });
  return [decorations, hover];
}

// src/debug-log.ts
var import_obsidian2 = require("obsidian");
var MAX_LOG_BYTES = 512 * 1024;
var writeQueues = /* @__PURE__ */ new WeakMap();
function getLogRelativePath(app) {
  return (0, import_obsidian2.normalizePath)(`${app.vault.configDir}/plugins/link-tag-intelligence/debug-runtime.log`);
}
function getParentPath(normalizedPath) {
  const lastSlash = normalizedPath.lastIndexOf("/");
  return lastSlash >= 0 ? normalizedPath.slice(0, lastSlash) : "";
}
function resolveDisplayPath(app, relativePath) {
  const adapter = app.vault.adapter;
  if (adapter instanceof import_obsidian2.FileSystemAdapter) {
    return `${adapter.getBasePath()}/${relativePath}`;
  }
  return relativePath;
}
async function ensureDirectory(adapter, filePath) {
  const directory = getParentPath(filePath);
  if (!directory) {
    return;
  }
  if (!await adapter.exists(directory)) {
    await adapter.mkdir(directory);
  }
}
function queueWrite(app, writer) {
  const next = (writeQueues.get(app) ?? Promise.resolve()).catch(() => void 0).then(writer).catch((error) => {
    console.error("[lti-debug-log] failed to write log", error);
  });
  writeQueues.set(app, next);
}
async function resetDebugLog(app) {
  const adapter = app.vault.adapter;
  const logPath = getLogRelativePath(app);
  try {
    await ensureDirectory(adapter, logPath);
    await adapter.write(logPath, "", {});
    return resolveDisplayPath(app, logPath);
  } catch (error) {
    console.error("[lti-debug-log] failed to reset log", error);
    return null;
  }
}
function debugLog(app, scope, details = {}) {
  const adapter = app.vault.adapter;
  const logPath = getLogRelativePath(app);
  const payload = {
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    scope,
    ...details
  };
  queueWrite(app, async () => {
    await ensureDirectory(adapter, logPath);
    const stat = await adapter.stat(logPath);
    if (stat && stat.size > MAX_LOG_BYTES) {
      await adapter.write(logPath, "", {});
    }
    await adapter.append(logPath, `${JSON.stringify(payload)}
`, {});
  });
}

// src/ingestion.ts
var import_obsidian3 = require("obsidian");

// src/shared.ts
function normalizeStringArray(value) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [String(value).trim()].filter(Boolean);
}
function parseTagAliasMap(text) {
  if (!text.trim()) {
    return /* @__PURE__ */ new Map();
  }
  const parsed = JSON.parse(text);
  const aliasMap = /* @__PURE__ */ new Map();
  for (const [canonical, value] of Object.entries(parsed)) {
    if (!canonical.trim()) {
      continue;
    }
    const aliases = Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [String(value).trim()].filter(Boolean);
    aliasMap.set(canonical.trim(), aliases);
  }
  return aliasMap;
}
function parseTagFacetMap(text) {
  if (!text.trim()) {
    return /* @__PURE__ */ new Map();
  }
  const parsed = JSON.parse(text);
  const facetMap = /* @__PURE__ */ new Map();
  for (const [facet, rawValue] of Object.entries(parsed)) {
    const normalizedFacet = facet.trim();
    if (!normalizedFacet) {
      continue;
    }
    const entries = /* @__PURE__ */ new Map();
    if (Array.isArray(rawValue)) {
      for (const item of rawValue) {
        const canonical = String(item).trim();
        if (canonical) {
          entries.set(canonical, []);
        }
      }
    } else if (rawValue && typeof rawValue === "object") {
      for (const [canonical, aliasesValue] of Object.entries(rawValue)) {
        const normalizedCanonical = canonical.trim();
        if (!normalizedCanonical) {
          continue;
        }
        entries.set(normalizedCanonical, normalizeStringArray(aliasesValue));
      }
    } else {
      for (const canonical of normalizeStringArray(rawValue)) {
        entries.set(canonical, []);
      }
    }
    if (entries.size > 0) {
      facetMap.set(normalizedFacet, entries);
    }
  }
  return facetMap;
}
function formatFacetName(facet) {
  return facet.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}
function shellEscape(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
function buildShellCommand(template, replacements) {
  let command = template;
  for (const [key, value] of Object.entries(replacements)) {
    command = command.replaceAll(`{{${key}}}`, shellEscape(value));
  }
  return command;
}
function buildSemanticCommand(template, context) {
  return buildShellCommand(template, {
    query: context.query,
    vault: context.vaultPath,
    file: context.filePath,
    selection: context.selection
  });
}
function buildIngestionCommand(template, context) {
  return buildShellCommand(template, {
    source_type: context.sourceType,
    source: context.source,
    vault: context.vaultPath,
    file: context.filePath,
    selection: context.selection,
    literature: context.literatureFolder,
    attachments: context.attachmentsFolder,
    template: context.templatePath,
    metadata_doi: context.metadataDoi,
    metadata_arxiv: context.metadataArxiv,
    title: context.title,
    authors: context.authors,
    year: context.year,
    download_pdf: context.downloadPdf,
    open_after_import: context.openAfterImport
  });
}

// src/ingestion.ts
function isIngestionConfigured(settings) {
  return Boolean(settings.ingestionCommand.trim());
}
function getVaultBasePath(app) {
  const adapter = app.vault.adapter;
  return adapter instanceof import_obsidian3.FileSystemAdapter ? adapter.getBasePath() : "";
}
function getDesktopRequire() {
  const desktopRequire = globalThis.require;
  return typeof desktopRequire === "function" ? desktopRequire : null;
}
function getExecFunction() {
  const desktopRequire = getDesktopRequire();
  if (!desktopRequire) {
    throw new Error("desktop-shell-unavailable");
  }
  const childProcess = desktopRequire("child_process");
  if (typeof childProcess?.exec !== "function") {
    throw new Error("desktop-shell-unavailable");
  }
  return childProcess.exec;
}
function readOptionalString(value) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return void 0;
}
function normalizeResult(result) {
  const notePath = readOptionalString(result.note_path ?? result.notePath);
  if (!notePath) {
    throw new Error("invalid-cli-response");
  }
  return {
    status: readOptionalString(result.status) ?? "created",
    sourceType: readOptionalString(result.source_type ?? result.sourceType) ?? "",
    sourceId: readOptionalString(result.source_id ?? result.sourceId),
    title: readOptionalString(result.title) ?? notePath.split("/").pop()?.replace(/\.md$/i, "") ?? notePath,
    notePath,
    attachmentPaths: Array.isArray(result.attachment_paths) ? result.attachment_paths.map(String).filter(Boolean) : [],
    warnings: Array.isArray(result.warnings) ? result.warnings.map(String).filter(Boolean) : [],
    metadata: result.metadata && typeof result.metadata === "object" ? result.metadata : {}
  };
}
async function runIngestionCommand(app, settings, request, activeFile, selection) {
  if (!import_obsidian3.Platform.isDesktopApp) {
    throw new Error("desktop-only");
  }
  if (!isIngestionConfigured(settings)) {
    throw new Error("missing-command");
  }
  const command = buildIngestionCommand(settings.ingestionCommand, {
    sourceType: request.sourceType,
    source: request.source,
    vaultPath: getVaultBasePath(app),
    filePath: activeFile?.path ?? "",
    selection,
    literatureFolder: settings.researchLiteratureFolder,
    attachmentsFolder: settings.researchAttachmentsFolder,
    templatePath: settings.researchTemplatePath,
    metadataDoi: request.metadataDoi ?? "",
    metadataArxiv: request.metadataArxiv ?? "",
    title: request.title ?? "",
    authors: request.authors ?? "",
    year: request.year ?? "",
    downloadPdf: String(request.downloadPdf !== false),
    openAfterImport: String(settings.researchOpenNoteAfterImport)
  });
  const exec = getExecFunction();
  const stdout = await new Promise((resolve, reject) => {
    exec(command, { timeout: settings.ingestionTimeoutMs, cwd: getVaultBasePath(app) || void 0 }, (error, resultStdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || error.message));
        return;
      }
      resolve(resultStdout);
    });
  });
  const parsed = JSON.parse(stdout.trim());
  if (!parsed || typeof parsed !== "object") {
    throw new Error("invalid-cli-response");
  }
  return normalizeResult(parsed);
}

// src/i18n.ts
var TRANSLATIONS = {
  en: {
    pluginName: "Link & Tag Intelligence",
    viewTitle: "Link & Tag Intelligence",
    openPanel: "Open Link & Tag Intelligence panel",
    insertLink: "Insert link with preview",
    insertBlockRef: "Insert block reference",
    insertLineRef: "Insert line reference",
    quickLink: "Quick link selected text",
    addRelation: "Add relation to current note",
    manageTags: "Manage vault tags",
    suggestTags: "Suggest tags for current note",
    ingestionCapture: "Ingest research source",
    semanticSearch: "Semantic search via external command",
    currentNote: "Current note",
    outgoingLinks: "Outgoing links",
    backlinks: "Backlinks",
    outgoingReferences: "Exact outgoing refs",
    incomingReferences: "Exact incoming refs",
    relations: "Relations",
    tags: "Tags",
    unlinkedMentions: "Unlinked mentions",
    semanticBridge: "Semantic bridge",
    notConfigured: "Not configured",
    configured: "Configured",
    noActiveNote: "Open a Markdown or Excalidraw note to use this view.",
    noActiveEditor: "Open a Markdown note, or the markdown source of an Excalidraw note, to insert links or references.",
    emptyList: "Nothing to show.",
    path: "Path",
    aliases: "Aliases",
    sharedTags: "Shared tags",
    reason: "Reason",
    searchTags: "Search tags",
    rename: "Rename",
    merge: "Merge",
    delete: "Delete",
    cancel: "Cancel",
    apply: "Apply",
    loading: "Loading...",
    query: "Query",
    selectionAlias: "Selection alias",
    insertLinkPlaceholder: "Search notes, aliases, paths, and tags",
    insertLinkEmpty: "No matching note candidates.",
    createdFrontmatterTag: "Added tags to frontmatter.",
    tagsUpdated: "Tags updated.",
    tagSuggestionsReady: "Suggested tags are ready.",
    ingestionDesktopOnly: "Research ingestion is desktop-only.",
    ingestionMissingCommand: "Ingestion command is not configured.",
    ingestionMissingSource: "Provide a DOI, arXiv ID, or PDF path/URL.",
    ingestionInvalidDoi: "The DOI input is invalid.",
    ingestionInvalidArxiv: "The arXiv input is invalid.",
    ingestionInvalidPdf: "The PDF path or URL is invalid.",
    ingestionSourceNotFound: "The requested source could not be resolved.",
    ingestionInvalidResponse: "The ingestion CLI returned an invalid response.",
    ingestionLookupFailed: "{target} lookup failed ({status}).",
    ingestionPdfDownloadFailed: "PDF download failed ({status}).",
    ingestionFailed: "Research ingestion failed: {message}",
    ingestionCreated: "Created literature note for {title}.",
    ingestionCreatedWithWarnings: "Created literature note for {title} with {count} warning(s).",
    semanticDesktopOnly: "Semantic bridge is desktop-only.",
    semanticMissingCommand: "Semantic command is not configured.",
    semanticFailed: "Semantic search failed: {message}",
    semanticNoResults: "Semantic search returned no results.",
    semanticOpen: "Open",
    semanticInsert: "Insert link",
    semanticScore: "Score",
    promptRenameTag: "Rename tag",
    promptMergeInto: "Merge into tag",
    promptRelationKey: "Select relation key",
    savedRelation: "Saved relation {relation}.",
    insertedLink: "Inserted link to {title}.",
    appendedToFile: "Appended to {title} (text added to markdown section).",
    invalidAliasMap: "Tag alias map is invalid JSON. Falling back to empty map.",
    invalidFacetMap: "Tag facet map is invalid JSON. Falling back to empty map.",
    settingsWorkflowMode: "Workflow mode",
    settingsWorkflowModeDescription: "Choose the default guidance and presets for this vault.",
    workflowModeResearcher: "Researcher",
    workflowModeGeneral: "General knowledge base",
    settingsLanguage: "Plugin language",
    settingsRelationKeys: "Relation keys",
    settingsRelationKeysDescription: "Comma-separated frontmatter keys for typed note relations. Research defaults work well for literature review and drafting.",
    settingsRelationKeysPreview: "Research default preview",
    settingsTagAliasMap: "Tag alias map JSON",
    settingsTagAliasMapDescription: "JSON object from canonical tag to aliases. Used for bilingual matching, not automatic rewrites.",
    settingsTagFacetMap: "Research tag facet map JSON",
    settingsTagFacetMapDescription: "JSON object from facet name to canonical tags and aliases. Used to boost topic / method / dataset / writing-stage tags.",
    settingsWorkbenchIngestionTitle: "External ingestion CLI",
    settingsWorkbenchIngestionDescription: "Configure the command that creates literature notes from DOI, arXiv, or PDF input.",
    settingsWorkbenchIngestionCommandTitle: "Ingestion command",
    settingsWorkbenchIngestionCommandDescription: "Desktop-only shell command. Supported placeholders: {{source_type}} {{source}} {{vault}} {{file}} {{selection}} {{literature}} {{attachments}} {{template}} {{metadata_doi}} {{metadata_arxiv}} {{title}} {{authors}} {{year}} {{download_pdf}} {{open_after_import}}.",
    settingsWorkbenchIngestionTimeoutTitle: "Ingestion timeout (ms)",
    settingsWorkbenchIngestionHint: "Recommended CLI contract: stdout JSON with note_path, attachment_paths, warnings, and metadata. This is the primary capture path for Codex or Claude Code shell workflows.",
    settingsSemanticEnabled: "Enable semantic bridge",
    settingsSemanticEnabledDescription: "Keep disabled unless you have an external retrieval CLI. Capture and import are handled separately by the ingestion CLI.",
    settingsSemanticCommand: "Semantic command",
    settingsSemanticCommandDescription: "Desktop-only shell command. Supported placeholders: {{query}} {{vault}} {{file}} {{selection}}. Prefer returning citekey / author / year / page / source_type / evidence_kind.",
    settingsSemanticTimeout: "Semantic timeout (ms)",
    settingsRecentLinks: "Recent link memory size",
    settingsResearchGuideEyebrow: "Research stack",
    settingsResearchGuideTitle: "Research workflow guide",
    settingsResearchGuideDescription: "This mode is designed for literature notes, evidence gathering, synthesis, and drafting. Keep exact references, typed relations, and controlled tags aligned.",
    settingsResearchLayoutTitle: "Vault layout",
    settingsResearchLayoutDescription: "Keep the workflow within a shallow 3-level structure so CLI-created literature notes, optional Zotero exports, and attachments stay predictable across tools.",
    settingsResearchPathLiterature: "Literature notes",
    settingsResearchPathTemplates: "Template",
    settingsResearchPathAttachments: "Annotation assets",
    settingsResearchWorkflowTitle: "Working sequence",
    settingsResearchWorkflowDescription: "A practical loop for capture, page-aware reading, argument linking, and drafting.",
    settingsResearchWorkflowStep1Title: "Import source notes",
    settingsResearchWorkflowStep1Body: "Use the ingestion CLI to create one structured literature note per DOI, arXiv ID, or PDF.",
    settingsResearchWorkflowStep2Title: "Quote with page context",
    settingsResearchWorkflowStep2Body: "Use PDF++ copy actions to move exact page evidence into literature notes or draft notes.",
    settingsResearchWorkflowStep3Title: "Link claims and tags",
    settingsResearchWorkflowStep3Body: "Use typed relations and controlled bilingual tags to connect source notes, evidence, and arguments.",
    settingsResearchWorkflowStep4Title: "Retrieve while drafting",
    settingsResearchWorkflowStep4Body: "Use Smart Connections for local semantic recall, and enable the external semantic bridge only when you have a research CLI ready.",
    settingsResearchGuideStep1: "Use the ingestion CLI or PDF++ to capture source metadata, PDFs, and page-level annotations.",
    settingsResearchGuideStep2: "Use typed relations like supports / contradicts / extends to connect notes and claims.",
    settingsResearchGuideStep3: "Maintain controlled topic, method, dataset, status, and writing-stage tags to keep recommendation quality high.",
    settingsCompanionPluginsTitle: "Recommended companion plugins",
    settingsCompanionActionLabel: "What to click",
    settingsCompanionZoteroDesc: "Optional adapter for importing an existing Zotero library, citekeys, and annotations.",
    settingsCompanionZoteroSetup: "Optional. If you keep Zotero in the stack, align it with {literaturePath}, {templatePath}, and {attachmentsPath}.",
    settingsCompanionZoteroAction: "Optional: Command palette -> Zotero Integration: Import notes",
    settingsCompanionPdfDesc: "Work with PDF highlights, page jumps, and annotation-heavy reading workflows.",
    settingsCompanionPdfSetup: "Configured for page-aware quote and cite-callout copy commands, with bibliography hover kept active for citation-heavy reading.",
    settingsCompanionPdfAction: "Open a PDF -> select text -> choose a PDF++ copy format",
    settingsCompanionSmartDesc: "Add embeddings-based semantic recall without duplicating this plugin's link and tag layer.",
    settingsCompanionSmartSetup: "Configured to keep system and archive folders out of the index: {exclusions}. Keep the local embedding model unless you intentionally re-index.",
    settingsCompanionSmartAction: "Open Smart Connections and wait for the first local index to finish",
    settingsCompanionSemanticDesc: "Use your own research-aware retrieval command when you want citation-grounded semantic results.",
    settingsCompanionSemanticSetup: "Optional. Only enable after your external command can return JSON fields like citekey, author, year, page, suggested_tags, and suggested_relations.",
    settingsCompanionSemanticAction: "Paste the command below, then enable Semantic bridge",
    settingsSemanticResearchHint: "Recommended semantic result fields: citekey, author, year, page, source_type, evidence_kind, suggested_tags, suggested_relations.",
    settingsWorkbenchEyebrow: "Research workbench",
    settingsWorkbenchTitle: "Research workflow control center",
    settingsWorkbenchDescription: "Inspect companion tools, configure CLI-first capture, sync research-critical settings, and launch the next reading or writing step from one place.",
    settingsWorkbenchPreferencesTitle: "Workbench preferences",
    settingsWorkbenchPreferencesDescription: "Keep language and default mode in the detail drawer, not on the dashboard.",
    settingsWorkbenchStatReady: "Ready companions",
    settingsWorkbenchStatMode: "Workflow mode",
    settingsWorkbenchStatIndexer: "Detected plugins",
    settingsWorkbenchStatSemantic: "Semantic bridge",
    settingsWorkbenchPageOverview: "Overview",
    settingsWorkbenchPagePlugins: "Plugins",
    settingsWorkbenchPageWorkflow: "Workflow",
    settingsWorkbenchPageTaxonomy: "Taxonomy",
    settingsWorkbenchOn: "On",
    settingsWorkbenchOff: "Off",
    settingsWorkbenchDetails: "Details",
    settingsWorkbenchClose: "Close",
    settingsWorkbenchDrawerEmptyTitle: "Choose a module",
    settingsWorkbenchDrawerEmptyDescription: "Open a dashboard card, workflow module, or plugin row to inspect and edit the detailed configuration here.",
    settingsWorkbenchApplyAll: "Sync preset",
    settingsWorkbenchRefresh: "Refresh",
    settingsWorkbenchQuickActionsTitle: "Workflow entry points",
    settingsWorkbenchQuickActionsDescription: "Group high-frequency actions by capture, recall, and organization so the workbench stays readable.",
    settingsWorkbenchActionGroupCaptureTitle: "Capture & import",
    settingsWorkbenchActionGroupCaptureDescription: "Keep the CLI capture flow, optional Zotero import, and PDF reading tools together.",
    settingsWorkbenchActionGroupRecallTitle: "Recall & retrieval",
    settingsWorkbenchActionGroupRecallDescription: "Open semantic views and current-note intelligence without leaving the workbench.",
    settingsWorkbenchActionGroupOrganizeTitle: "Tags & structure",
    settingsWorkbenchActionGroupOrganizeDescription: "Clean native tags and keep controlled suggestions aligned while drafting.",
    settingsWorkbenchActionIngestionTitle: "Ingest DOI / arXiv / PDF",
    settingsWorkbenchActionIngestionDescription: "Launch the CLI-first capture modal.",
    settingsWorkbenchActionZoteroTitle: "Import from Zotero (optional)",
    settingsWorkbenchActionZoteroDescription: "Use the Zotero adapter when you are importing from an existing Zotero library.",
    settingsWorkbenchActionSmartTitle: "Open Smart Connections",
    settingsWorkbenchActionSmartDescription: "Jump into local semantic recall.",
    settingsWorkbenchActionPanelTitle: "Open intelligence panel",
    settingsWorkbenchActionPanelDescription: "Open links, references, and current-note context.",
    settingsWorkbenchActionPdfTitle: "Check PDF++",
    settingsWorkbenchActionPdfDescription: "Verify copy formats and reading behavior.",
    settingsWorkbenchActionTagsTitle: "Manage vault tags",
    settingsWorkbenchActionTagsDescription: "Clean native tags in place.",
    settingsWorkbenchActionSuggestTitle: "Suggest tags for note",
    settingsWorkbenchActionSuggestDescription: "Generate bilingual controlled-tag suggestions.",
    settingsWorkbenchActionSemanticTitle: "Run semantic search",
    settingsWorkbenchActionSemanticDescription: "Launch the external citation-aware retrieval bridge.",
    settingsWorkbenchCompanionTitle: "Companion stack",
    settingsWorkbenchCompanionDescription: "Each row shows install state and whether the plugin is aligned with this vault's research preset.",
    settingsWorkbenchInstalled: "Installed",
    settingsWorkbenchEnabled: "Enabled",
    settingsWorkbenchYes: "Yes",
    settingsWorkbenchNo: "No",
    settingsWorkbenchMismatchCount: "{count} issues",
    settingsWorkbenchMismatchTitle: "Needs attention",
    settingsWorkbenchApplyCompanion: "Apply preset",
    settingsWorkbenchOpenSettings: "Open settings",
    settingsWorkbenchConfigTitle: "Workflow configuration",
    settingsWorkbenchConfigDescription: "Edit the research-critical defaults that control CLI capture, optional adapters, local indexing, and the semantic bridge.",
    settingsWorkbenchPathsTitle: "Workspace paths",
    settingsWorkbenchPathsDescription: "Keep note, template, and attachment paths stable so CLI imports, optional Zotero exports, and citations remain predictable.",
    settingsWorkbenchOpenImportedTitle: "Open imported note",
    settingsWorkbenchOpenImportedDescription: "When enabled, newly created literature notes should open immediately after CLI capture or Zotero import.",
    settingsWorkbenchRecallTitle: "Semantic recall scope",
    settingsWorkbenchRecallDescription: "Define what Smart Connections should skip and how many results it should return.",
    settingsWorkbenchFolderExclusionsTitle: "Folder exclusions",
    settingsWorkbenchFolderExclusionsDescription: "Comma or newline separated folders excluded from the semantic index.",
    settingsWorkbenchHeadingExclusionsTitle: "Heading exclusions",
    settingsWorkbenchHeadingExclusionsDescription: "Comma or newline separated headings that should not be embedded.",
    settingsWorkbenchResultsLimitTitle: "Semantic results limit",
    settingsWorkbenchSemanticTitle: "External semantic bridge",
    settingsWorkbenchSemanticDescription: "Keep this optional and enable it only when your research CLI returns structured citation fields.",
    settingsWorkbenchConfigHint: "Edit here, then run the CLI capture flow or sync the matching companion preset.",
    settingsWorkbenchCurrentExclusions: "Current normalized exclusions: {value}",
    settingsWorkbenchAdvancedTitle: "Advanced taxonomy",
    settingsWorkbenchAdvancedDescription: "Keep the dashboard clean and expand these panels only when relation keys or JSON vocabularies need tuning.",
    settingsWorkbenchAdvancedRelationsTitle: "Typed relations",
    settingsWorkbenchAdvancedRelationsDescription: "Frontmatter keys for argument and evidence links.",
    settingsWorkbenchAdvancedAliasTitle: "Tag alias map",
    settingsWorkbenchAdvancedAliasDescription: "Canonical tags and bilingual aliases.",
    settingsWorkbenchAdvancedFacetTitle: "Facet vocabulary",
    settingsWorkbenchAdvancedFacetDescription: "Topic, method, dataset, status, and writing-stage facets.",
    settingsWorkbenchAdvancedMemoryTitle: "Recent link memory",
    settingsWorkbenchAdvancedMemoryDescription: "How many recent targets should stay in quick recall.",
    settingsWorkbenchDefaultDisplayTitle: "Default display",
    settingsWorkbenchCopyCommandsTitle: "Research copy formats",
    settingsWorkbenchHoverPreviewTitle: "Hover preview action",
    settingsWorkbenchBacklinksTitle: "Backlink highlighting",
    settingsWorkbenchLanguageTitle: "Index language",
    settingsWorkbenchExpectedPrefix: "Expected",
    settingsWorkbenchRunIngestion: "Open capture modal",
    settingsWorkbenchRunZotero: "Run import",
    settingsWorkbenchRunSmart: "Open view",
    settingsWorkbenchRunSemantic: "Run search",
    settingsWorkbenchRunPdf: "Inspect PDF++",
    settingsWorkbenchStatusReady: "Ready",
    settingsWorkbenchStatusMissing: "Missing",
    settingsWorkbenchStatusOptional: "Optional",
    settingsWorkbenchStatusAttention: "Needs sync",
    settingsWorkbenchMismatchZoteroFolder: "Literature-note folder does not match the workspace path.",
    settingsWorkbenchMismatchZoteroTemplate: "Zotero export template path is not aligned.",
    settingsWorkbenchMismatchZoteroAttachments: "Zotero image export folder does not match the workspace attachments path.",
    settingsWorkbenchMismatchZoteroOpen: "Zotero import open-note behavior differs from this workbench setting.",
    settingsWorkbenchMismatchZoteroOutput: "Zotero output path template is not using the expected citekey layout.",
    settingsWorkbenchMismatchZoteroCite: "Zotero cite template is not the expected literature-note link format.",
    settingsWorkbenchMismatchPdfDisplayFormats: "Required PDF display formats are missing.",
    settingsWorkbenchMismatchPdfDisplayDefault: "PDF++ default display is not set to \u201CTitle & page\u201D.",
    settingsWorkbenchMismatchPdfCopy: "Required research copy commands are missing.",
    settingsWorkbenchMismatchPdfHover: "PDF++ hover action should be set to preview.",
    settingsWorkbenchMismatchPdfBacklinks: "PDF++ backlink highlighting should stay enabled.",
    settingsWorkbenchMismatchPdfSelectionMenu: "PDF++ selection menu should expose copy-format and display controls.",
    settingsWorkbenchMismatchPdfAnnotationMenu: "PDF++ annotation menu should expose copy-format and display controls.",
    settingsWorkbenchMismatchSmartLanguage: "Smart Connections language does not match the workbench language.",
    settingsWorkbenchMismatchSmartFolders: "Smart Connections folder exclusions are out of sync.",
    settingsWorkbenchMismatchSmartHeadings: "Smart Connections heading exclusions are out of sync.",
    settingsWorkbenchMismatchSmartResults: "Smart Connections results limit is not aligned.",
    settingsWorkbenchMismatchSmartRender: "Smart Connections should keep markdown rendering enabled in results.",
    settingsWorkbenchMismatchSemanticCommand: "Semantic bridge is enabled but the command is empty.",
    settingsWorkbenchPresetApplied: "Research preset synced to the installed default companions.",
    settingsWorkbenchCompanionApplied: "Applied the recommended configuration for {name}.",
    settingsWorkbenchPluginMissing: "That companion plugin is not installed in the current vault.",
    settingsWorkbenchSettingsUnavailable: "Obsidian settings could not be opened programmatically.",
    settingsWorkbenchCommandUnavailable: "The companion command is not available in this vault.",
    mentionsExplanation: "Notes that mention this note title or aliases without already linking to it.",
    selected: "Selected",
    notSelected: "Not selected",
    modalTagSuggestionsDescription: "Suggestions are ranked from aliases, research facets, existing vault tags, source paths, and recurring keywords.",
    modalRelationDescription: "Choose a typed relation to write into frontmatter.",
    modalManageTagsDescription: "Rename, merge, or delete native tags across the vault.",
    modalIngestionDescription: "Send DOI, arXiv, or PDF input to your external ingestion CLI and create a literature note.",
    modalSemanticDescription: "Run your external semantic command against the current note context.",
    ingestionSourceType: "Source type",
    ingestionTypeDoi: "DOI",
    ingestionTypeArxiv: "arXiv",
    ingestionTypePdf: "PDF",
    ingestionSourceValue: "Source",
    ingestionMetadataHeading: "PDF metadata enrichment",
    ingestionMetadataDoiPlaceholder: "Optional DOI for PDF enrichment",
    ingestionMetadataArxivPlaceholder: "Optional arXiv ID for PDF enrichment",
    ingestionDownloadPdf: "Copy PDF into attachments",
    ingestionOverrideHeading: "Metadata overrides",
    ingestionTitlePlaceholder: "Optional title override",
    ingestionAuthorsPlaceholder: "Optional authors override",
    ingestionYearPlaceholder: "Optional year override",
    ingestionContextNote: "Current note context: {path}",
    ingestionResultSummary: "Source type: {sourceType} \xB7 Attachments: {attachments}",
    ingestionWarningsTitle: "Warnings",
    ingestionOpen: "Open note",
    ingestionInsert: "Insert link",
    ingestionRun: "Run ingestion",
    ingestionArxivPlaceholder: "2403.01234 or https://arxiv.org/abs/...",
    ingestionPdfPlaceholder: "/path/to/file.pdf or https://example.com/file.pdf",
    ingestionDoiPlaceholder: "10.1145/...",
    ingestionStatusHint: "Use the CLI-first capture flow for DOI, arXiv, and PDF imports. Zotero remains optional.",
    tagSuggestionAlias: "Alias match",
    tagSuggestionFacet: "Research facet",
    tagSuggestionKnown: "Existing vault tag",
    tagSuggestionKeyword: "Keyword candidate",
    tagSuggestionSource: "Source path",
    tagSuggestionFacetLabel: "Facet: {facet}",
    tagSuggestionMatches: "Matched: {matches}",
    tagSuggestionSummary: "Primary recommendations are higher-confidence research tags. Secondary candidates are looser context hints.",
    tagSuggestionPrimaryGroup: "Primary recommendations",
    tagSuggestionSecondaryGroup: "Secondary candidates",
    tagSuggestionEvidence: "Evidence: {sources}",
    tagSuggestionSourceTitle: "Title",
    tagSuggestionSourceAlias: "Alias",
    tagSuggestionSourceHeading: "Heading",
    tagSuggestionSourceReference: "Reference",
    tagSuggestionSourceContext: "Linked context",
    tagSuggestionSourceBody: "Body",
    tagSuggestionSourcePath: "Path",
    tagSuggestionSourceFacet: "Facet map",
    tagSuggestionSourceVault: "Vault tag",
    tagFacetUnclassified: "Other tags",
    modalBlockRefDescription: "Choose a line range and insert a legacy block reference compatible with your prior note system.",
    modalLineRefDescription: "Choose a line range and insert a direct line reference.",
    referenceExistingBlocks: "Existing block IDs",
    referenceCreateBlockFromLines: "Choose block range",
    referenceCreateLineFromLines: "Choose line range",
    referenceStartLine: "Start line",
    referenceEndLine: "End line",
    referenceNoPreview: "No preview available.",
    referenceTypeBlock: "Block ref",
    referenceTypeLine: "Line ref",
    pickBlockRefTarget: "Choose a note for block reference",
    pickLineRefTarget: "Choose a note for line reference",
    blockRefInserted: "Inserted block reference to {title}.",
    lineRefInserted: "Inserted line reference to {title}."
  },
  zh: {
    pluginName: "\u94FE\u63A5\u4E0E\u6807\u7B7E\u667A\u80FD",
    viewTitle: "\u94FE\u63A5\u4E0E\u6807\u7B7E\u667A\u80FD",
    openPanel: "\u6253\u5F00\u94FE\u63A5\u4E0E\u6807\u7B7E\u667A\u80FD\u9762\u677F",
    insertLink: "\u5E26\u9884\u89C8\u63D2\u5165\u94FE\u63A5",
    insertBlockRef: "\u63D2\u5165\u5757\u5F15\u7528",
    insertLineRef: "\u63D2\u5165\u884C\u5F15\u7528",
    quickLink: "\u5C06\u9009\u4E2D\u6587\u672C\u5FEB\u901F\u94FE\u63A5",
    addRelation: "\u4E3A\u5F53\u524D\u7B14\u8BB0\u6DFB\u52A0\u5173\u7CFB",
    manageTags: "\u7BA1\u7406\u6574\u4E2A\u5E93\u7684\u6807\u7B7E",
    suggestTags: "\u4E3A\u5F53\u524D\u7B14\u8BB0\u63A8\u8350\u6807\u7B7E",
    ingestionCapture: "\u5BFC\u5165\u7814\u7A76\u6765\u6E90",
    semanticSearch: "\u901A\u8FC7\u5916\u90E8\u547D\u4EE4\u8FDB\u884C\u8BED\u4E49\u68C0\u7D22",
    currentNote: "\u5F53\u524D\u7B14\u8BB0",
    outgoingLinks: "\u51FA\u94FE",
    backlinks: "\u53CD\u94FE",
    outgoingReferences: "\u7CBE\u786E\u51FA\u94FE",
    incomingReferences: "\u7CBE\u786E\u53CD\u94FE",
    relations: "\u5173\u7CFB",
    tags: "\u6807\u7B7E",
    unlinkedMentions: "\u672A\u94FE\u63A5\u63D0\u53CA",
    semanticBridge: "\u8BED\u4E49\u6865\u63A5",
    notConfigured: "\u672A\u914D\u7F6E",
    configured: "\u5DF2\u914D\u7F6E",
    noActiveNote: "\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A Markdown \u6216 Excalidraw \u7B14\u8BB0\u3002",
    noActiveEditor: "\u8BF7\u5148\u6253\u5F00\u53EF\u7F16\u8F91\u7684 Markdown \u7B14\u8BB0\uFF0C\u6216 Excalidraw \u7B14\u8BB0\u7684 Markdown \u6E90\u6587\u4EF6\uFF0C\u518D\u63D2\u5165\u94FE\u63A5\u6216\u5F15\u7528\u3002",
    emptyList: "\u6CA1\u6709\u5185\u5BB9\u3002",
    path: "\u8DEF\u5F84",
    aliases: "\u522B\u540D",
    sharedTags: "\u5171\u4EAB\u6807\u7B7E",
    reason: "\u547D\u4E2D\u539F\u56E0",
    searchTags: "\u641C\u7D22\u6807\u7B7E",
    rename: "\u91CD\u547D\u540D",
    merge: "\u5408\u5E76",
    delete: "\u5220\u9664",
    cancel: "\u53D6\u6D88",
    apply: "\u5E94\u7528",
    loading: "\u52A0\u8F7D\u4E2D...",
    query: "\u67E5\u8BE2",
    selectionAlias: "\u9009\u4E2D\u6587\u672C\u522B\u540D",
    insertLinkPlaceholder: "\u641C\u7D22\u7B14\u8BB0\u3001\u522B\u540D\u3001\u8DEF\u5F84\u4E0E\u6807\u7B7E",
    insertLinkEmpty: "\u6CA1\u6709\u5339\u914D\u7684\u7B14\u8BB0\u5019\u9009\u3002",
    createdFrontmatterTag: "\u5DF2\u628A\u6807\u7B7E\u5199\u5165 frontmatter\u3002",
    tagsUpdated: "\u6807\u7B7E\u5DF2\u66F4\u65B0\u3002",
    tagSuggestionsReady: "\u6807\u7B7E\u5EFA\u8BAE\u5DF2\u751F\u6210\u3002",
    ingestionDesktopOnly: "\u7814\u7A76\u6765\u6E90\u5BFC\u5165\u4EC5\u652F\u6301\u684C\u9762\u7AEF\u3002",
    ingestionMissingCommand: "\u5C1A\u672A\u914D\u7F6E\u5BFC\u5165\u547D\u4EE4\u3002",
    ingestionMissingSource: "\u8BF7\u63D0\u4F9B DOI\u3001arXiv \u7F16\u53F7\u6216 PDF \u8DEF\u5F84/URL\u3002",
    ingestionInvalidDoi: "DOI \u8F93\u5165\u65E0\u6548\u3002",
    ingestionInvalidArxiv: "arXiv \u8F93\u5165\u65E0\u6548\u3002",
    ingestionInvalidPdf: "PDF \u8DEF\u5F84\u6216 URL \u65E0\u6548\u3002",
    ingestionSourceNotFound: "\u672A\u80FD\u89E3\u6790\u8FD9\u4E2A\u6765\u6E90\u3002",
    ingestionInvalidResponse: "\u5BFC\u5165 CLI \u8FD4\u56DE\u4E86\u65E0\u6548\u54CD\u5E94\u3002",
    ingestionLookupFailed: "{target} \u67E5\u8BE2\u5931\u8D25\uFF08{status}\uFF09\u3002",
    ingestionPdfDownloadFailed: "PDF \u4E0B\u8F7D\u5931\u8D25\uFF08{status}\uFF09\u3002",
    ingestionFailed: "\u7814\u7A76\u6765\u6E90\u5BFC\u5165\u5931\u8D25\uFF1A{message}",
    ingestionCreated: "\u5DF2\u4E3A {title} \u521B\u5EFA\u6587\u732E\u7B14\u8BB0\u3002",
    ingestionCreatedWithWarnings: "\u5DF2\u4E3A {title} \u521B\u5EFA\u6587\u732E\u7B14\u8BB0\uFF0C\u4F46\u6709 {count} \u6761\u8B66\u544A\u3002",
    semanticDesktopOnly: "\u8BED\u4E49\u6865\u63A5\u4EC5\u652F\u6301\u684C\u9762\u7AEF\u3002",
    semanticMissingCommand: "\u5C1A\u672A\u914D\u7F6E\u8BED\u4E49\u547D\u4EE4\u3002",
    semanticFailed: "\u8BED\u4E49\u68C0\u7D22\u5931\u8D25\uFF1A{message}",
    semanticNoResults: "\u8BED\u4E49\u68C0\u7D22\u6CA1\u6709\u8FD4\u56DE\u7ED3\u679C\u3002",
    semanticOpen: "\u6253\u5F00",
    semanticInsert: "\u63D2\u5165\u94FE\u63A5",
    semanticScore: "\u5F97\u5206",
    promptRenameTag: "\u91CD\u547D\u540D\u6807\u7B7E",
    promptMergeInto: "\u5408\u5E76\u5230\u6807\u7B7E",
    promptRelationKey: "\u9009\u62E9\u5173\u7CFB\u952E",
    savedRelation: "\u5DF2\u4FDD\u5B58\u5173\u7CFB {relation}\u3002",
    insertedLink: "\u5DF2\u63D2\u5165\u6307\u5411 {title} \u7684\u94FE\u63A5\u3002",
    appendedToFile: "\u5DF2\u8FFD\u52A0\u5230 {title}\uFF08\u6587\u672C\u5DF2\u6DFB\u52A0\u5230 Markdown \u533A\u57DF\uFF09\u3002",
    invalidAliasMap: "\u6807\u7B7E\u522B\u540D\u6620\u5C04\u4E0D\u662F\u5408\u6CD5 JSON\uFF0C\u5DF2\u56DE\u9000\u4E3A\u7A7A\u6620\u5C04\u3002",
    invalidFacetMap: "\u6807\u7B7E\u5206\u9762\u6620\u5C04\u4E0D\u662F\u5408\u6CD5 JSON\uFF0C\u5DF2\u56DE\u9000\u4E3A\u7A7A\u6620\u5C04\u3002",
    settingsWorkflowMode: "\u5DE5\u4F5C\u6D41\u6A21\u5F0F",
    settingsWorkflowModeDescription: "\u4E3A\u5F53\u524D\u5E93\u9009\u62E9\u9ED8\u8BA4\u63D0\u793A\u548C\u9884\u8BBE\u3002",
    workflowModeResearcher: "\u7814\u7A76\u5458",
    workflowModeGeneral: "\u901A\u7528\u77E5\u8BC6\u5E93",
    settingsLanguage: "\u63D2\u4EF6\u8BED\u8A00",
    settingsRelationKeys: "\u5173\u7CFB\u952E",
    settingsRelationKeysDescription: "\u4F7F\u7528\u9017\u53F7\u5206\u9694\u7684 frontmatter \u5173\u7CFB\u952E\u3002\u7814\u7A76\u9ED8\u8BA4\u5173\u7CFB\u66F4\u9002\u5408\u6587\u732E\u7EFC\u8FF0\u3001\u8BC1\u636E\u6574\u7406\u548C\u5199\u4F5C\u3002",
    settingsRelationKeysPreview: "\u7814\u7A76\u9ED8\u8BA4\u5173\u7CFB\u9884\u89C8",
    settingsTagAliasMap: "\u6807\u7B7E\u522B\u540D\u6620\u5C04 JSON",
    settingsTagAliasMapDescription: "\u4ECE\u89C4\u8303\u6807\u7B7E\u5230\u522B\u540D\u7684 JSON \u5BF9\u8C61\uFF0C\u7528\u4E8E\u4E2D\u82F1\u6587\u5339\u914D\uFF0C\u4E0D\u4F1A\u81EA\u52A8\u6539\u5199\u5DF2\u6709\u6807\u7B7E\u3002",
    settingsTagFacetMap: "\u7814\u7A76\u6807\u7B7E\u5206\u9762\u6620\u5C04 JSON",
    settingsTagFacetMapDescription: "\u4ECE\u5206\u9762\u540D\u5230\u89C4\u8303\u6807\u7B7E\u53CA\u522B\u540D\u7684 JSON \u5BF9\u8C61\uFF0C\u7528\u4E8E\u4F18\u5148\u8BC6\u522B topic / method / dataset / writing-stage \u7B49\u7814\u7A76\u6807\u7B7E\u3002",
    settingsWorkbenchIngestionTitle: "\u5916\u90E8\u5BFC\u5165 CLI",
    settingsWorkbenchIngestionDescription: "\u914D\u7F6E\u628A DOI\u3001arXiv \u6216 PDF \u8F93\u5165\u8F6C\u6210\u6587\u732E\u7B14\u8BB0\u7684\u547D\u4EE4\u3002",
    settingsWorkbenchIngestionCommandTitle: "\u5BFC\u5165\u547D\u4EE4",
    settingsWorkbenchIngestionCommandDescription: "\u4EC5\u684C\u9762\u7AEF shell \u547D\u4EE4\u3002\u652F\u6301\u5360\u4F4D\u7B26\uFF1A{{source_type}} {{source}} {{vault}} {{file}} {{selection}} {{literature}} {{attachments}} {{template}} {{metadata_doi}} {{metadata_arxiv}} {{title}} {{authors}} {{year}} {{download_pdf}} {{open_after_import}}\u3002",
    settingsWorkbenchIngestionTimeoutTitle: "\u5BFC\u5165\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
    settingsWorkbenchIngestionHint: "\u63A8\u8350 CLI \u534F\u8BAE\uFF1Astdout \u8FD4\u56DE\u5305\u542B note_path\u3001attachment_paths\u3001warnings\u3001metadata \u7684 JSON\u3002\u8FD9\u662F Codex \u6216 Claude Code shell \u5DE5\u4F5C\u6D41\u7684\u4E3B\u91C7\u96C6\u8DEF\u5F84\u3002",
    settingsSemanticEnabled: "\u542F\u7528\u8BED\u4E49\u6865\u63A5",
    settingsSemanticEnabledDescription: "\u53EA\u6709\u5728\u4F60\u6709\u5916\u90E8\u68C0\u7D22 CLI \u65F6\u518D\u5F00\u542F\u3002\u91C7\u96C6\u4E0E\u5BFC\u5165\u7531\u72EC\u7ACB\u7684 ingestion CLI \u8D1F\u8D23\u3002",
    settingsSemanticCommand: "\u8BED\u4E49\u547D\u4EE4",
    settingsSemanticCommandDescription: "\u4EC5\u684C\u9762\u7AEF\u7684 shell \u547D\u4EE4\u3002\u652F\u6301\u5360\u4F4D\u7B26\uFF1A{{query}} {{vault}} {{file}} {{selection}}\u3002\u5EFA\u8BAE\u8FD4\u56DE citekey / author / year / page / source_type / evidence_kind\u3002",
    settingsSemanticTimeout: "\u8BED\u4E49\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
    settingsRecentLinks: "\u6700\u8FD1\u94FE\u63A5\u8BB0\u5FC6\u957F\u5EA6",
    settingsResearchGuideEyebrow: "\u7814\u7A76\u6808",
    settingsResearchGuideTitle: "\u7814\u7A76\u5DE5\u4F5C\u6D41\u6307\u5357",
    settingsResearchGuideDescription: "\u8BE5\u6A21\u5F0F\u9762\u5411\u6587\u732E\u7B14\u8BB0\u3001\u8BC1\u636E\u91C7\u96C6\u3001\u7EFC\u5408\u6574\u7406\u4E0E\u8BBA\u6587\u5199\u4F5C\u3002\u5C3D\u91CF\u8BA9\u7CBE\u786E\u5F15\u7528\u3001\u5173\u7CFB\u7C7B\u578B\u4E0E\u53D7\u63A7\u6807\u7B7E\u4FDD\u6301\u4E00\u81F4\u3002",
    settingsResearchLayoutTitle: "\u76EE\u5F55\u5E03\u5C40",
    settingsResearchLayoutDescription: "\u4FDD\u6301 3 \u5C42\u4EE5\u5185\u7684\u6D45\u5C42\u7ED3\u6784\uFF0C\u8BA9 CLI \u521B\u5EFA\u7684\u6587\u732E\u7B14\u8BB0\u3001\u53EF\u9009\u7684 Zotero \u5BFC\u51FA\u548C\u9644\u4EF6\u8DEF\u5F84\u957F\u671F\u7A33\u5B9A\u3002",
    settingsResearchPathLiterature: "\u6587\u732E\u7B14\u8BB0",
    settingsResearchPathTemplates: "\u6A21\u677F",
    settingsResearchPathAttachments: "\u6279\u6CE8\u9644\u4EF6",
    settingsResearchWorkflowTitle: "\u5DE5\u4F5C\u987A\u5E8F",
    settingsResearchWorkflowDescription: "\u56F4\u7ED5\u91C7\u96C6\u3001\u5E26\u9875\u7801\u9605\u8BFB\u3001\u8BBA\u8BC1\u8FDE\u63A5\u548C\u5199\u4F5C\u68C0\u7D22\u7684\u4E00\u6761\u5B9E\u7528\u95ED\u73AF\u3002",
    settingsResearchWorkflowStep1Title: "\u5BFC\u5165\u6765\u6E90\u7B14\u8BB0",
    settingsResearchWorkflowStep1Body: "\u7528 ingestion CLI \u6309 DOI\u3001arXiv \u7F16\u53F7\u6216 PDF \u751F\u6210\u7ED3\u6784\u5316\u6587\u732E\u7B14\u8BB0\u3002",
    settingsResearchWorkflowStep2Title: "\u590D\u5236\u5E26\u9875\u7801\u8BC1\u636E",
    settingsResearchWorkflowStep2Body: "\u7528 PDF++ \u7684\u590D\u5236\u52A8\u4F5C\u628A\u7CBE\u786E\u9875\u7801\u8BC1\u636E\u5E26\u5165\u6587\u732E\u7B14\u8BB0\u6216\u8349\u7A3F\u7B14\u8BB0\u3002",
    settingsResearchWorkflowStep3Title: "\u8865\u5173\u7CFB\u4E0E\u6807\u7B7E",
    settingsResearchWorkflowStep3Body: "\u7528\u5173\u7CFB\u952E\u548C\u4E2D\u82F1\u6587\u53D7\u63A7\u6807\u7B7E\u8FDE\u63A5\u6765\u6E90\u3001\u8BC1\u636E\u4E0E\u8BBA\u70B9\u3002",
    settingsResearchWorkflowStep4Title: "\u5199\u4F5C\u65F6\u518D\u68C0\u7D22",
    settingsResearchWorkflowStep4Body: "\u7528 Smart Connections \u505A\u672C\u5730\u8BED\u4E49\u53EC\u56DE\uFF1B\u53EA\u6709\u5728\u7814\u7A76 CLI \u51C6\u5907\u597D\u540E\u518D\u542F\u7528\u5916\u90E8\u8BED\u4E49\u6865\u63A5\u3002",
    settingsResearchGuideStep1: "\u7528 ingestion CLI \u6216 PDF++ \u91C7\u96C6\u6765\u6E90\u5143\u6570\u636E\u3001PDF \u548C\u9875\u7801\u5B9A\u4F4D\u5185\u5BB9\u3002",
    settingsResearchGuideStep2: "\u7528 supports / contradicts / extends \u7B49\u5173\u7CFB\u8FDE\u63A5\u6587\u732E\u3001\u89C2\u70B9\u548C\u8BC1\u636E\u3002",
    settingsResearchGuideStep3: "\u7EF4\u62A4 topic\u3001method\u3001dataset\u3001status\u3001writing-stage \u7B49\u53D7\u63A7\u6807\u7B7E\uFF0C\u80FD\u663E\u8457\u63D0\u5347\u63A8\u8350\u8D28\u91CF\u3002",
    settingsCompanionPluginsTitle: "\u63A8\u8350\u642D\u914D\u63D2\u4EF6",
    settingsCompanionActionLabel: "\u5728 Obsidian \u91CC\u70B9\u51FB",
    settingsCompanionZoteroDesc: "\u53EF\u9009\u9002\u914D\u5668\uFF0C\u7528\u4E8E\u5BFC\u5165\u73B0\u6709 Zotero \u6587\u5E93\u3001citekey \u548C\u6279\u6CE8\u3002",
    settingsCompanionZoteroSetup: "\u8FD9\u662F\u53EF\u9009\u9879\u3002\u5982\u679C\u4F60\u7EE7\u7EED\u4FDD\u7559 Zotero\uFF0C\u8BF7\u8BA9\u5B83\u4E0E {literaturePath}\u3001{templatePath} \u548C {attachmentsPath} \u5BF9\u9F50\u3002",
    settingsCompanionZoteroAction: "\u53EF\u9009\uFF1A\u547D\u4EE4\u9762\u677F -> Zotero Integration: Import notes",
    settingsCompanionPdfDesc: "\u5904\u7406 PDF \u9AD8\u4EAE\u3001\u9875\u7801\u8DF3\u8F6C\u548C\u91CD\u6807\u6CE8\u9605\u8BFB\u6D41\u7A0B\u3002",
    settingsCompanionPdfSetup: "\u5DF2\u914D\u7F6E\u4E3A\u9002\u5408\u7814\u7A76\u6458\u5F55\u7684\u9875\u7801\u5F15\u7528\u4E0E cite callout \u590D\u5236\u52A8\u4F5C\uFF0C\u5E76\u4FDD\u7559\u5F15\u6587\u60AC\u505C\u9884\u89C8\u3002",
    settingsCompanionPdfAction: "\u6253\u5F00 PDF -> \u9009\u4E2D\u6587\u672C -> \u9009\u62E9 PDF++ \u590D\u5236\u683C\u5F0F",
    settingsCompanionSmartDesc: "\u63D0\u4F9B embedding \u8BED\u4E49\u53EC\u56DE\uFF0C\u540C\u65F6\u4E0D\u4E0E\u672C\u63D2\u4EF6\u7684\u94FE\u63A5\u4E0E\u6807\u7B7E\u5C42\u91CD\u590D\u3002",
    settingsCompanionSmartSetup: "\u5DF2\u914D\u7F6E\u4E3A\u628A\u7CFB\u7EDF\u76EE\u5F55\u548C\u5F52\u6863\u76EE\u5F55\u6392\u9664\u51FA\u7D22\u5F15\uFF1A{exclusions}\u3002\u672C\u5730 embedding \u6A21\u578B\u4FDD\u6301\u9ED8\u8BA4\uFF0C\u907F\u514D\u8BEF\u89E6\u53D1\u6574\u5E93\u91CD\u5EFA\u3002",
    settingsCompanionSmartAction: "\u6253\u5F00 Smart Connections\uFF0C\u5E76\u7B49\u5F85\u7B2C\u4E00\u6B21\u672C\u5730\u7D22\u5F15\u5B8C\u6210",
    settingsCompanionSemanticDesc: "\u5F53\u4F60\u9700\u8981\u53EF\u63A7\u7684\u7814\u7A76\u68C0\u7D22\u534F\u8BAE\u65F6\uFF0C\u4F7F\u7528\u81EA\u5DF1\u7684\u7814\u7A76\u578B\u5916\u90E8\u547D\u4EE4\u3002",
    settingsCompanionSemanticSetup: "\u8FD9\u662F\u53EF\u9009\u9879\u3002\u53EA\u6709\u5F53\u5916\u90E8\u547D\u4EE4\u80FD\u8FD4\u56DE citekey\u3001author\u3001year\u3001page\u3001suggested_tags\u3001suggested_relations \u7B49 JSON \u5B57\u6BB5\u65F6\u518D\u5F00\u542F\u3002",
    settingsCompanionSemanticAction: "\u5148\u586B\u5165\u547D\u4EE4\uFF0C\u518D\u542F\u7528\u8BED\u4E49\u6865\u63A5",
    settingsSemanticResearchHint: "\u63A8\u8350\u8BED\u4E49\u7ED3\u679C\u5B57\u6BB5\uFF1Acitekey\u3001author\u3001year\u3001page\u3001source_type\u3001evidence_kind\u3001suggested_tags\u3001suggested_relations\u3002",
    settingsWorkbenchEyebrow: "\u7814\u7A76\u5DE5\u4F5C\u53F0",
    settingsWorkbenchTitle: "\u7814\u7A76\u5DE5\u4F5C\u6D41\u63A7\u5236\u4E2D\u5FC3",
    settingsWorkbenchDescription: "\u5728\u4E00\u4E2A\u9875\u9762\u5185\u67E5\u770B companion \u72B6\u6001\u3001\u914D\u7F6E CLI-first \u91C7\u96C6\u3001\u540C\u6B65\u5173\u952E\u7814\u7A76\u8BBE\u7F6E\uFF0C\u5E76\u76F4\u63A5\u5F00\u59CB\u4E0B\u4E00\u6B65\u5BFC\u5165\u3001\u68C0\u7D22\u6216\u6574\u7406\u3002",
    settingsWorkbenchPreferencesTitle: "\u5DE5\u4F5C\u53F0\u504F\u597D",
    settingsWorkbenchPreferencesDescription: "\u628A\u8BED\u8A00\u548C\u9ED8\u8BA4\u6A21\u5F0F\u6536\u8FDB\u53F3\u4FA7\u8BE6\u60C5\u533A\uFF0C\u4E0D\u518D\u5360\u9996\u9875\u7A7A\u95F4\u3002",
    settingsWorkbenchStatReady: "\u5DF2\u5C31\u7EEA\u63D2\u4EF6",
    settingsWorkbenchStatMode: "\u5DE5\u4F5C\u6A21\u5F0F",
    settingsWorkbenchStatIndexer: "\u5DF2\u68C0\u6D4B\u63D2\u4EF6",
    settingsWorkbenchStatSemantic: "\u8BED\u4E49\u6865\u63A5",
    settingsWorkbenchPageOverview: "\u603B\u89C8",
    settingsWorkbenchPagePlugins: "\u63D2\u4EF6",
    settingsWorkbenchPageWorkflow: "\u5DE5\u4F5C\u6D41",
    settingsWorkbenchPageTaxonomy: "\u8BCD\u8868",
    settingsWorkbenchOn: "\u5F00\u542F",
    settingsWorkbenchOff: "\u5173\u95ED",
    settingsWorkbenchDetails: "\u8BE6\u60C5",
    settingsWorkbenchClose: "\u5173\u95ED",
    settingsWorkbenchDrawerEmptyTitle: "\u9009\u62E9\u4E00\u4E2A\u6A21\u5757",
    settingsWorkbenchDrawerEmptyDescription: "\u70B9\u51FB\u5DE6\u4FA7\u7684\u6458\u8981\u5361\u3001\u5DE5\u4F5C\u6D41\u6A21\u5757\u6216\u63D2\u4EF6\u884C\uFF0C\u5C31\u4F1A\u5728\u8FD9\u91CC\u6253\u5F00\u5BF9\u5E94\u8BE6\u60C5\u4E0E\u7F16\u8F91\u9879\u3002",
    settingsWorkbenchApplyAll: "\u540C\u6B65\u9884\u8BBE",
    settingsWorkbenchRefresh: "\u5237\u65B0",
    settingsWorkbenchQuickActionsTitle: "\u5DE5\u4F5C\u6D41\u5165\u53E3",
    settingsWorkbenchQuickActionsDescription: "\u6309\u91C7\u96C6\u3001\u53EC\u56DE\u3001\u6574\u7406\u5206\u7EC4\u5C55\u793A\u9AD8\u9891\u52A8\u4F5C\uFF0C\u907F\u514D\u9996\u9875\u7EE7\u7EED\u88AB\u957F\u6309\u94AE\u6324\u6EE1\u3002",
    settingsWorkbenchActionGroupCaptureTitle: "\u91C7\u96C6\u4E0E\u5BFC\u5165",
    settingsWorkbenchActionGroupCaptureDescription: "\u628A CLI \u91C7\u96C6\u6D41\u3001\u53EF\u9009\u7684 Zotero \u5BFC\u5165\u548C PDF \u9605\u8BFB\u5DE5\u5177\u653E\u5728\u4E00\u8D77\u3002",
    settingsWorkbenchActionGroupRecallTitle: "\u68C0\u7D22\u4E0E\u53EC\u56DE",
    settingsWorkbenchActionGroupRecallDescription: "\u96C6\u4E2D\u6253\u5F00\u8BED\u4E49\u68C0\u7D22\u3001\u4E0A\u4E0B\u6587\u4FA7\u680F\u548C\u53EC\u56DE\u89C6\u56FE\u3002",
    settingsWorkbenchActionGroupOrganizeTitle: "\u6807\u7B7E\u4E0E\u7ED3\u6784",
    settingsWorkbenchActionGroupOrganizeDescription: "\u5728\u6574\u7406\u7B14\u8BB0\u65F6\u540C\u6B65\u7EF4\u62A4\u539F\u751F\u6807\u7B7E\u548C\u53D7\u63A7\u6807\u7B7E\u5EFA\u8BAE\u3002",
    settingsWorkbenchActionIngestionTitle: "\u5BFC\u5165 DOI / arXiv / PDF",
    settingsWorkbenchActionIngestionDescription: "\u6253\u5F00 CLI-first \u91C7\u96C6\u6A21\u6001\u6846\u3002",
    settingsWorkbenchActionZoteroTitle: "\u4ECE Zotero \u5BFC\u5165\uFF08\u53EF\u9009\uFF09",
    settingsWorkbenchActionZoteroDescription: "\u53EA\u6709\u5728\u4F60\u8981\u5BFC\u5165\u73B0\u6709 Zotero \u6587\u5E93\u65F6\u624D\u4F7F\u7528\u8FD9\u4E2A\u9002\u914D\u5668\u3002",
    settingsWorkbenchActionSmartTitle: "\u6253\u5F00 Smart Connections",
    settingsWorkbenchActionSmartDescription: "\u76F4\u63A5\u8FDB\u5165\u672C\u5730\u8BED\u4E49\u53EC\u56DE\u89C6\u56FE\u3002",
    settingsWorkbenchActionPanelTitle: "\u6253\u5F00\u667A\u80FD\u4FA7\u680F",
    settingsWorkbenchActionPanelDescription: "\u6253\u5F00\u94FE\u63A5\u3001\u5F15\u7528\u4E0E\u5F53\u524D\u7B14\u8BB0\u4E0A\u4E0B\u6587\u4FA7\u680F\u3002",
    settingsWorkbenchActionPdfTitle: "\u68C0\u67E5 PDF++",
    settingsWorkbenchActionPdfDescription: "\u786E\u8BA4\u590D\u5236\u683C\u5F0F\u548C\u9605\u8BFB\u884C\u4E3A\u3002",
    settingsWorkbenchActionTagsTitle: "\u7BA1\u7406\u539F\u751F\u6807\u7B7E",
    settingsWorkbenchActionTagsDescription: "\u5C31\u5730\u6E05\u7406\u548C\u6574\u7406 Obsidian \u6807\u7B7E\u3002",
    settingsWorkbenchActionSuggestTitle: "\u63A8\u8350\u5F53\u524D\u7B14\u8BB0\u6807\u7B7E",
    settingsWorkbenchActionSuggestDescription: "\u751F\u6210\u4E2D\u82F1\u6587\u53D7\u63A7\u6807\u7B7E\u63A8\u8350\u3002",
    settingsWorkbenchActionSemanticTitle: "\u8FD0\u884C\u8BED\u4E49\u68C0\u7D22",
    settingsWorkbenchActionSemanticDescription: "\u542F\u52A8\u5916\u90E8\u5E26\u5F15\u6587\u8BED\u5883\u7684\u68C0\u7D22\u6865\u63A5\u3002",
    settingsWorkbenchCompanionTitle: "\u7814\u7A76\u63D2\u4EF6\u6808",
    settingsWorkbenchCompanionDescription: "\u6BCF\u4E00\u884C\u663E\u793A\u63D2\u4EF6\u662F\u5426\u53EF\u7528\uFF0C\u4EE5\u53CA\u662F\u5426\u5DF2\u4E0E\u5F53\u524D\u7814\u7A76\u9884\u8BBE\u4FDD\u6301\u4E00\u81F4\u3002",
    settingsWorkbenchInstalled: "\u5DF2\u5B89\u88C5",
    settingsWorkbenchEnabled: "\u5DF2\u542F\u7528",
    settingsWorkbenchYes: "\u662F",
    settingsWorkbenchNo: "\u5426",
    settingsWorkbenchMismatchCount: "{count} \u9879\u5F85\u540C\u6B65",
    settingsWorkbenchMismatchTitle: "\u9700\u8981\u5904\u7406",
    settingsWorkbenchApplyCompanion: "\u5E94\u7528\u9884\u8BBE",
    settingsWorkbenchOpenSettings: "\u6253\u5F00\u8BBE\u7F6E",
    settingsWorkbenchConfigTitle: "\u5DE5\u4F5C\u6D41\u914D\u7F6E",
    settingsWorkbenchConfigDescription: "\u8FD9\u91CC\u7EF4\u62A4 CLI \u91C7\u96C6\u3001\u53EF\u9009\u9002\u914D\u5668\u3001\u672C\u5730\u7D22\u5F15\u548C\u5916\u90E8\u8BED\u4E49\u6865\u63A5\u6700\u5173\u952E\u7684\u7814\u7A76\u9ED8\u8BA4\u503C\u3002",
    settingsWorkbenchPathsTitle: "\u7814\u7A76\u8DEF\u5F84",
    settingsWorkbenchPathsDescription: "\u4FDD\u6301\u7B14\u8BB0\u3001\u6A21\u677F\u548C\u9644\u4EF6\u8DEF\u5F84\u7A33\u5B9A\uFF0CCLI \u5BFC\u5165\u3001\u53EF\u9009 Zotero \u5BFC\u51FA\u548C\u5F15\u7528\u624D\u4F1A\u957F\u671F\u53EF\u9884\u6D4B\u3002",
    settingsWorkbenchOpenImportedTitle: "\u5BFC\u5165\u540E\u6253\u5F00\u7B14\u8BB0",
    settingsWorkbenchOpenImportedDescription: "\u5F00\u542F\u540E\uFF0CCLI \u5BFC\u5165\u6216 Zotero \u5BFC\u5165\u540E\u90FD\u4F1A\u81EA\u52A8\u6253\u5F00\u65B0\u751F\u6210\u7684\u6587\u732E\u7B14\u8BB0\u3002",
    settingsWorkbenchRecallTitle: "\u8BED\u4E49\u53EC\u56DE\u8303\u56F4",
    settingsWorkbenchRecallDescription: "\u63A7\u5236 Smart Connections \u8DF3\u8FC7\u54EA\u4E9B\u5185\u5BB9\uFF0C\u4EE5\u53CA\u5355\u6B21\u8FD4\u56DE\u591A\u5C11\u7ED3\u679C\u3002",
    settingsWorkbenchFolderExclusionsTitle: "\u6392\u9664\u6587\u4EF6\u5939",
    settingsWorkbenchFolderExclusionsDescription: "\u7528\u9017\u53F7\u6216\u6362\u884C\u5206\u9694\uFF0C\u9700\u8981\u6392\u9664\u51FA\u8BED\u4E49\u7D22\u5F15\u7684\u6587\u4EF6\u5939\u3002",
    settingsWorkbenchHeadingExclusionsTitle: "\u6392\u9664\u6807\u9898",
    settingsWorkbenchHeadingExclusionsDescription: "\u7528\u9017\u53F7\u6216\u6362\u884C\u5206\u9694\uFF0C\u4E0D\u9700\u8981\u8FDB\u5165 embedding \u7684\u6807\u9898\u3002",
    settingsWorkbenchResultsLimitTitle: "\u8BED\u4E49\u7ED3\u679C\u4E0A\u9650",
    settingsWorkbenchSemanticTitle: "\u5916\u90E8\u8BED\u4E49\u6865\u63A5",
    settingsWorkbenchSemanticDescription: "\u8FD9\u662F\u53EF\u9009\u5C42\u3002\u53EA\u6709\u7814\u7A76 CLI \u80FD\u8FD4\u56DE\u7ED3\u6784\u5316\u5F15\u6587\u5B57\u6BB5\u65F6\u518D\u5F00\u542F\u3002",
    settingsWorkbenchConfigHint: "\u5728\u8FD9\u91CC\u4FEE\u6539\u540E\uFF0C\u53EF\u4EE5\u76F4\u63A5\u8FD0\u884C CLI \u91C7\u96C6\u6D41\uFF0C\u6216\u5BF9\u5355\u4E2A companion \u5E94\u7528\u5BF9\u5E94\u9884\u8BBE\u3002",
    settingsWorkbenchCurrentExclusions: "\u5F53\u524D\u6807\u51C6\u5316\u6392\u9664\u9879\uFF1A{value}",
    settingsWorkbenchAdvancedTitle: "\u9AD8\u7EA7\u8BCD\u8868",
    settingsWorkbenchAdvancedDescription: "\u9ED8\u8BA4\u4FDD\u6301\u9996\u9875\u6E05\u723D\uFF1B\u53EA\u6709\u5728\u9700\u8981\u8C03\u6574\u5173\u7CFB\u952E\u6216\u5927\u6BB5 JSON \u8BCD\u8868\u65F6\uFF0C\u518D\u5C55\u5F00\u8FD9\u4E9B\u9762\u677F\u3002",
    settingsWorkbenchAdvancedRelationsTitle: "\u5173\u7CFB\u7C7B\u578B",
    settingsWorkbenchAdvancedRelationsDescription: "\u7528\u4E8E\u8BBA\u70B9\u3001\u8BC1\u636E\u548C\u6765\u6E90\u4E4B\u95F4\u7684 frontmatter \u5173\u7CFB\u952E\u3002",
    settingsWorkbenchAdvancedAliasTitle: "\u6807\u7B7E\u522B\u540D\u6620\u5C04",
    settingsWorkbenchAdvancedAliasDescription: "\u7EF4\u62A4\u89C4\u8303\u6807\u7B7E\u4E0E\u4E2D\u82F1\u6587\u522B\u540D\u3002",
    settingsWorkbenchAdvancedFacetTitle: "\u6807\u7B7E\u5206\u9762\u8BCD\u8868",
    settingsWorkbenchAdvancedFacetDescription: "\u7EF4\u62A4 topic\u3001method\u3001dataset\u3001status\u3001writing-stage \u7B49\u7814\u7A76\u5206\u9762\u3002",
    settingsWorkbenchAdvancedMemoryTitle: "\u8FD1\u671F\u94FE\u63A5\u8BB0\u5FC6",
    settingsWorkbenchAdvancedMemoryDescription: "\u63A7\u5236\u5FEB\u901F\u53EC\u56DE\u4E2D\u4FDD\u7559\u591A\u5C11\u4E2A\u6700\u8FD1\u76EE\u6807\u3002",
    settingsWorkbenchDefaultDisplayTitle: "\u9ED8\u8BA4\u663E\u793A\u683C\u5F0F",
    settingsWorkbenchCopyCommandsTitle: "\u7814\u7A76\u590D\u5236\u683C\u5F0F",
    settingsWorkbenchHoverPreviewTitle: "\u60AC\u505C\u9884\u89C8\u52A8\u4F5C",
    settingsWorkbenchBacklinksTitle: "\u53CD\u94FE\u9AD8\u4EAE",
    settingsWorkbenchLanguageTitle: "\u7D22\u5F15\u8BED\u8A00",
    settingsWorkbenchExpectedPrefix: "\u671F\u671B\u503C",
    settingsWorkbenchRunIngestion: "\u6253\u5F00\u91C7\u96C6\u6846",
    settingsWorkbenchRunZotero: "\u6267\u884C\u5BFC\u5165",
    settingsWorkbenchRunSmart: "\u6253\u5F00\u89C6\u56FE",
    settingsWorkbenchRunSemantic: "\u6267\u884C\u68C0\u7D22",
    settingsWorkbenchRunPdf: "\u68C0\u67E5 PDF++",
    settingsWorkbenchStatusReady: "\u5DF2\u5C31\u7EEA",
    settingsWorkbenchStatusMissing: "\u672A\u5B89\u88C5",
    settingsWorkbenchStatusOptional: "\u53EF\u9009",
    settingsWorkbenchStatusAttention: "\u5F85\u540C\u6B65",
    settingsWorkbenchMismatchZoteroFolder: "\u6587\u732E\u7B14\u8BB0\u76EE\u5F55\u4E0E\u5DE5\u4F5C\u53F0\u8DEF\u5F84\u4E0D\u4E00\u81F4\u3002",
    settingsWorkbenchMismatchZoteroTemplate: "Zotero \u5BFC\u51FA\u6A21\u677F\u8DEF\u5F84\u672A\u5BF9\u9F50\u3002",
    settingsWorkbenchMismatchZoteroAttachments: "Zotero \u56FE\u7247\u5BFC\u51FA\u76EE\u5F55\u4E0E\u5DE5\u4F5C\u53F0\u9644\u4EF6\u8DEF\u5F84\u4E0D\u4E00\u81F4\u3002",
    settingsWorkbenchMismatchZoteroOpen: "Zotero \u5BFC\u5165\u540E\u6253\u5F00\u7B14\u8BB0\u7684\u884C\u4E3A\u4E0E\u5F53\u524D\u8BBE\u7F6E\u4E0D\u540C\u3002",
    settingsWorkbenchMismatchZoteroOutput: "Zotero \u8F93\u51FA\u8DEF\u5F84\u6A21\u677F\u6CA1\u6709\u4F7F\u7528\u9884\u671F\u7684 citekey \u5E03\u5C40\u3002",
    settingsWorkbenchMismatchZoteroCite: "Zotero \u5F15\u6587\u6A21\u677F\u4E0D\u662F\u9884\u671F\u7684\u6587\u732E\u7B14\u8BB0\u94FE\u63A5\u683C\u5F0F\u3002",
    settingsWorkbenchMismatchPdfDisplayFormats: "\u7F3A\u5C11\u7814\u7A76\u5DE5\u4F5C\u6D41\u9700\u8981\u7684 PDF \u663E\u793A\u683C\u5F0F\u3002",
    settingsWorkbenchMismatchPdfDisplayDefault: "PDF++ \u9ED8\u8BA4\u663E\u793A\u683C\u5F0F\u5E94\u4E3A\u201CTitle & page\u201D\u3002",
    settingsWorkbenchMismatchPdfCopy: "\u7F3A\u5C11\u7814\u7A76\u6458\u5F55\u6240\u9700\u7684\u590D\u5236\u547D\u4EE4\u3002",
    settingsWorkbenchMismatchPdfHover: "PDF++ \u60AC\u505C\u52A8\u4F5C\u5E94\u8BBE\u7F6E\u4E3A preview\u3002",
    settingsWorkbenchMismatchPdfBacklinks: "PDF++ \u5E94\u4FDD\u6301\u53CD\u94FE\u9AD8\u4EAE\u5F00\u542F\u3002",
    settingsWorkbenchMismatchPdfSelectionMenu: "PDF++ \u9009\u4E2D\u6587\u672C\u83DC\u5355\u5E94\u5305\u542B copy-format \u548C display\u3002",
    settingsWorkbenchMismatchPdfAnnotationMenu: "PDF++ \u6279\u6CE8\u83DC\u5355\u5E94\u5305\u542B copy-format \u548C display\u3002",
    settingsWorkbenchMismatchSmartLanguage: "Smart Connections \u7684\u8BED\u8A00\u8BBE\u7F6E\u4E0E\u5DE5\u4F5C\u53F0\u4E0D\u4E00\u81F4\u3002",
    settingsWorkbenchMismatchSmartFolders: "Smart Connections \u7684\u6587\u4EF6\u5939\u6392\u9664\u9879\u672A\u540C\u6B65\u3002",
    settingsWorkbenchMismatchSmartHeadings: "Smart Connections \u7684\u6807\u9898\u6392\u9664\u9879\u672A\u540C\u6B65\u3002",
    settingsWorkbenchMismatchSmartResults: "Smart Connections \u7684\u7ED3\u679C\u4E0A\u9650\u672A\u5BF9\u9F50\u3002",
    settingsWorkbenchMismatchSmartRender: "Smart Connections \u5E94\u4FDD\u6301\u7ED3\u679C\u4E2D\u7684 Markdown \u6E32\u67D3\u5F00\u542F\u3002",
    settingsWorkbenchMismatchSemanticCommand: "\u8BED\u4E49\u6865\u63A5\u5DF2\u5F00\u542F\uFF0C\u4F46\u547D\u4EE4\u4ECD\u4E3A\u7A7A\u3002",
    settingsWorkbenchPresetApplied: "\u5DF2\u5C06\u7814\u7A76\u9884\u8BBE\u540C\u6B65\u5230\u5DF2\u5B89\u88C5\u7684\u9ED8\u8BA4 companion\u3002",
    settingsWorkbenchCompanionApplied: "\u5DF2\u4E3A {name} \u5E94\u7528\u63A8\u8350\u914D\u7F6E\u3002",
    settingsWorkbenchPluginMissing: "\u5F53\u524D vault \u4E2D\u6CA1\u6709\u5B89\u88C5\u8FD9\u4E2A companion \u63D2\u4EF6\u3002",
    settingsWorkbenchSettingsUnavailable: "\u65E0\u6CD5\u901A\u8FC7\u7A0B\u5E8F\u65B9\u5F0F\u6253\u5F00 Obsidian \u8BBE\u7F6E\u9875\u3002",
    settingsWorkbenchCommandUnavailable: "\u5F53\u524D vault \u4E2D\u6CA1\u6709\u627E\u5230\u53EF\u6267\u884C\u7684 companion \u547D\u4EE4\u3002",
    mentionsExplanation: "\u5217\u51FA\u63D0\u53CA\u5F53\u524D\u7B14\u8BB0\u6807\u9898\u6216\u522B\u540D\u3001\u4F46\u5C1A\u672A\u5EFA\u7ACB\u94FE\u63A5\u7684\u7B14\u8BB0\u3002",
    selected: "\u5DF2\u9009",
    notSelected: "\u672A\u9009",
    modalTagSuggestionsDescription: "\u5EFA\u8BAE\u4F1A\u4F18\u5148\u53C2\u8003\u522B\u540D\u3001\u7814\u7A76\u5206\u9762\u3001\u73B0\u6709 vault \u6807\u7B7E\u3001\u6B63\u6587\u5173\u952E\u8BCD\u4E0E\u5F15\u7528\u8BED\u5883\uFF0C\u5C3D\u91CF\u907F\u514D\u76EE\u5F55\u8DEF\u5F84\u566A\u58F0\u3002",
    modalRelationDescription: "\u9009\u62E9\u8981\u5199\u5165 frontmatter \u7684\u5173\u7CFB\u7C7B\u578B\u3002",
    modalManageTagsDescription: "\u5BF9\u6574\u4E2A\u5E93\u7684\u539F\u751F\u6807\u7B7E\u8FDB\u884C\u91CD\u547D\u540D\u3001\u5408\u5E76\u6216\u5220\u9664\u3002",
    modalIngestionDescription: "\u628A DOI\u3001arXiv \u6216 PDF \u8F93\u5165\u53D1\u9001\u5230\u5916\u90E8 ingestion CLI\uFF0C\u5E76\u521B\u5EFA\u6587\u732E\u7B14\u8BB0\u3002",
    modalSemanticDescription: "\u57FA\u4E8E\u5F53\u524D\u7B14\u8BB0\u4E0A\u4E0B\u6587\u6267\u884C\u4F60\u7684\u5916\u90E8\u8BED\u4E49\u547D\u4EE4\u3002",
    ingestionSourceType: "\u6765\u6E90\u7C7B\u578B",
    ingestionTypeDoi: "DOI",
    ingestionTypeArxiv: "arXiv",
    ingestionTypePdf: "PDF",
    ingestionSourceValue: "\u6765\u6E90\u8F93\u5165",
    ingestionMetadataHeading: "PDF \u5143\u6570\u636E\u8865\u5168",
    ingestionMetadataDoiPlaceholder: "\u53EF\u9009\uFF1A\u7528\u4E8E\u8865\u5168 PDF \u7684 DOI",
    ingestionMetadataArxivPlaceholder: "\u53EF\u9009\uFF1A\u7528\u4E8E\u8865\u5168 PDF \u7684 arXiv \u7F16\u53F7",
    ingestionDownloadPdf: "\u590D\u5236 PDF \u5230\u9644\u4EF6\u76EE\u5F55",
    ingestionOverrideHeading: "\u5143\u6570\u636E\u8986\u76D6",
    ingestionTitlePlaceholder: "\u53EF\u9009\uFF1A\u8986\u76D6\u6807\u9898",
    ingestionAuthorsPlaceholder: "\u53EF\u9009\uFF1A\u8986\u76D6\u4F5C\u8005\uFF0C\u9017\u53F7\u5206\u9694",
    ingestionYearPlaceholder: "\u53EF\u9009\uFF1A\u8986\u76D6\u5E74\u4EFD",
    ingestionContextNote: "\u5F53\u524D\u7B14\u8BB0\u4E0A\u4E0B\u6587\uFF1A{path}",
    ingestionResultSummary: "\u6765\u6E90\u7C7B\u578B\uFF1A{sourceType} \xB7 \u9644\u4EF6\u6570\uFF1A{attachments}",
    ingestionWarningsTitle: "\u8B66\u544A",
    ingestionOpen: "\u6253\u5F00\u7B14\u8BB0",
    ingestionInsert: "\u63D2\u5165\u94FE\u63A5",
    ingestionRun: "\u6267\u884C\u5BFC\u5165",
    ingestionArxivPlaceholder: "2403.01234 \u6216 https://arxiv.org/abs/...",
    ingestionPdfPlaceholder: "/path/to/file.pdf \u6216 https://example.com/file.pdf",
    ingestionDoiPlaceholder: "10.1145/...",
    ingestionStatusHint: "\u4F18\u5148\u4F7F\u7528 CLI-first \u6D41\u7A0B\u5BFC\u5165 DOI\u3001arXiv \u548C PDF\u3002Zotero \u73B0\u5728\u662F\u53EF\u9009\u9002\u914D\u5668\u3002",
    tagSuggestionAlias: "\u522B\u540D\u547D\u4E2D",
    tagSuggestionFacet: "\u7814\u7A76\u5206\u9762",
    tagSuggestionKnown: "\u5DF2\u6709\u6807\u7B7E",
    tagSuggestionKeyword: "\u5173\u952E\u8BCD\u5019\u9009",
    tagSuggestionSource: "\u6765\u6E90\u8DEF\u5F84",
    tagSuggestionFacetLabel: "\u5206\u9762\uFF1A{facet}",
    tagSuggestionMatches: "\u547D\u4E2D\uFF1A{matches}",
    tagSuggestionSummary: "\u4E3B\u63A8\u8350\u662F\u66F4\u9AD8\u7F6E\u4FE1\u5EA6\u7684\u7814\u7A76\u6807\u7B7E\uFF0C\u8865\u5145\u5019\u9009\u7528\u4E8E\u63D0\u4F9B\u8BED\u5883\u7EBF\u7D22\uFF0C\u4F18\u5148\u52FE\u9009\u4E3B\u63A8\u8350\u3002",
    tagSuggestionPrimaryGroup: "\u4E3B\u63A8\u8350",
    tagSuggestionSecondaryGroup: "\u8865\u5145\u5019\u9009",
    tagSuggestionEvidence: "\u4F9D\u636E\uFF1A{sources}",
    tagSuggestionSourceTitle: "\u6807\u9898",
    tagSuggestionSourceAlias: "\u522B\u540D",
    tagSuggestionSourceHeading: "\u5C0F\u8282",
    tagSuggestionSourceReference: "\u5F15\u7528",
    tagSuggestionSourceContext: "\u5173\u8054\u8BED\u5883",
    tagSuggestionSourceBody: "\u6B63\u6587",
    tagSuggestionSourcePath: "\u8DEF\u5F84",
    tagSuggestionSourceFacet: "\u5206\u9762\u8BCD\u8868",
    tagSuggestionSourceVault: "\u73B0\u6709\u6807\u7B7E",
    tagFacetUnclassified: "\u5176\u4ED6\u6807\u7B7E",
    modalBlockRefDescription: "\u9009\u62E9\u884C\u6BB5\uFF0C\u63D2\u5165\u4E0E\u4F60\u65E7\u7B14\u8BB0\u7CFB\u7EDF\u517C\u5BB9\u7684\u5757\u5F15\u7528\u3002",
    modalLineRefDescription: "\u9009\u62E9\u884C\u53F7\u8303\u56F4\uFF0C\u63D2\u5165\u76F4\u63A5\u5B9A\u4F4D\u7684\u884C\u5F15\u7528\u3002",
    referenceExistingBlocks: "\u73B0\u6709\u5757 ID",
    referenceCreateBlockFromLines: "\u9009\u62E9\u5757\u8303\u56F4",
    referenceCreateLineFromLines: "\u9009\u62E9\u884C\u53F7\u8303\u56F4",
    referenceStartLine: "\u8D77\u59CB\u884C",
    referenceEndLine: "\u7ED3\u675F\u884C",
    referenceNoPreview: "\u6CA1\u6709\u53EF\u9884\u89C8\u5185\u5BB9\u3002",
    referenceTypeBlock: "\u5757\u5F15\u7528",
    referenceTypeLine: "\u884C\u53F7\u5F15\u7528",
    pickBlockRefTarget: "\u9009\u62E9\u5757\u5F15\u7528\u76EE\u6807\u7B14\u8BB0",
    pickLineRefTarget: "\u9009\u62E9\u884C\u5F15\u7528\u76EE\u6807\u7B14\u8BB0",
    blockRefInserted: "\u5DF2\u63D2\u5165\u6307\u5411 {title} \u7684\u5757\u5F15\u7528\u3002",
    lineRefInserted: "\u5DF2\u63D2\u5165\u6307\u5411 {title} \u7684\u884C\u5F15\u7528\u3002"
  }
};
var RELATION_KEY_LABELS = {
  related: {
    en: "Related",
    zh: "\u76F8\u5173"
  },
  see_also: {
    en: "See also",
    zh: "\u53E6\u89C1"
  },
  parent: {
    en: "Parent",
    zh: "\u4E0A\u4F4D"
  },
  child: {
    en: "Child",
    zh: "\u4E0B\u4F4D"
  },
  same_as: {
    en: "Same as",
    zh: "\u540C\u4E49 / \u7B49\u540C"
  },
  supports: {
    en: "Supports",
    zh: "\u652F\u6301"
  },
  contradicts: {
    en: "Contradicts",
    zh: "\u53CD\u9A73"
  },
  extends: {
    en: "Extends",
    zh: "\u6269\u5C55"
  },
  uses_method: {
    en: "Uses method",
    zh: "\u4F7F\u7528\u65B9\u6CD5"
  },
  uses_dataset: {
    en: "Uses dataset",
    zh: "\u4F7F\u7528\u6570\u636E\u96C6"
  },
  same_question: {
    en: "Same question",
    zh: "\u540C\u4E00\u7814\u7A76\u95EE\u9898"
  },
  evidence_for: {
    en: "Evidence for",
    zh: "\u4E3A\u5176\u63D0\u4F9B\u8BC1\u636E"
  },
  counterargument_to: {
    en: "Counterargument to",
    zh: "\u53CD\u8BBA\u8BC1\u4E8E"
  },
  reviews: {
    en: "Reviews",
    zh: "\u7EFC\u8FF0"
  },
  inspired_by: {
    en: "Inspired by",
    zh: "\u53D7\u5176\u542F\u53D1"
  }
};
function resolveLanguage(setting, locale) {
  if (setting === "en" || setting === "zh") {
    return setting;
  }
  const detected = (locale ?? globalThis.navigator?.language ?? "en").toLowerCase();
  return detected.startsWith("zh") ? "zh" : "en";
}
function tr(language, key, vars) {
  let value = TRANSLATIONS[language][key];
  if (!vars) {
    return value;
  }
  for (const [name, replacement] of Object.entries(vars)) {
    value = value.replace(`{${name}}`, String(replacement));
  }
  return value;
}
function relationKeyLabel(language, key) {
  return RELATION_KEY_LABELS[key]?.[language] ?? key;
}

// src/modals.ts
var import_obsidian7 = require("obsidian");

// src/notes.ts
var import_obsidian4 = require("obsidian");
function getOffsetLineRange(content, start, end) {
  const normalizedStart = Math.max(0, start);
  const normalizedEnd = Math.max(normalizedStart, end);
  const startLine = content.slice(0, normalizedStart).split("\n").length;
  const endLine = startLine + Math.max(0, content.slice(normalizedStart, normalizedEnd).split("\n").length - 1);
  return { startLine, endLine };
}
var FRONTMATTER_RE = /^\s*---\n[\s\S]*?\n---\n?/;
var CJK_RE = /[\u3400-\u9fff]/;
function isSupportedNotePath(path) {
  const lower = path.trim().toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".excalidraw");
}
function isSupportedNoteFile(file) {
  return file instanceof import_obsidian4.TFile && isSupportedNotePath(file.path);
}
function isExcalidrawFile(file) {
  const lower = file.path.toLowerCase();
  return lower.endsWith(".excalidraw.md") || file.extension === "excalidraw";
}
function appendTextToMarkdownSection(content, text, isExcalidraw) {
  if (isExcalidraw) {
    const idx = content.indexOf("\n%%\n");
    if (idx >= 0) {
      const before = content.slice(0, idx);
      const after = content.slice(idx);
      const sep2 = before.endsWith("\n") ? "" : "\n";
      return `${before}${sep2}${text}
${after}`;
    }
  }
  const sep = content.endsWith("\n") ? "" : "\n";
  return `${content}${sep}${text}
`;
}
function readStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return [value.trim()].filter(Boolean);
  }
  return [];
}
function readScalarString(value) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => readScalarString(item)).find((item) => Boolean(item));
  }
  return void 0;
}
function uniq(values) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
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
function stripFrontmatter(content) {
  return content.replace(FRONTMATTER_RE, "");
}
function getNoteExcerpt(content) {
  const stripped = stripFrontmatter(content).split("\n").map((line) => line.trim()).filter((line) => Boolean(line) && !line.startsWith("#"));
  return stripped.join(" ").slice(0, 180);
}
function getAllSupportedNoteFiles(app) {
  const mdFiles = app.vault.getMarkdownFiles().filter((file) => isSupportedNoteFile(file));
  const excalidrawFiles = app.vault.getFiles().filter(
    (file) => file.extension === "excalidraw"
  );
  return [...mdFiles, ...excalidrawFiles];
}
function getAliasesFromCache(cache) {
  return uniq(readStringArray(cache?.frontmatter?.aliases ?? cache?.frontmatter?.alias));
}
function getInlineTagsFromCache(cache) {
  return uniq((cache?.tags ?? []).map((tag) => tag.tag.replace(/^#/, "").trim()));
}
function getFrontmatterTagsFromCache(cache) {
  return uniq(readStringArray(cache?.frontmatter?.tags));
}
function getAllTagsForFile(app, file) {
  const cache = app.metadataCache.getFileCache(file);
  return uniq([...getFrontmatterTagsFromCache(cache), ...getInlineTagsFromCache(cache)]);
}
function getResearchSourceMetadataFromFrontmatter(frontmatter) {
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
  const metadata = {
    citekey: readScalarString(frontmatter.citekey ?? frontmatter.citationKey ?? frontmatter.citation_key ?? frontmatter.cite_key),
    author,
    year: readScalarString(frontmatter.year ?? frontmatter.publication_year ?? frontmatter.date),
    sourceType: readScalarString(frontmatter.entry_type ?? frontmatter.itemType ?? frontmatter.source_type ?? frontmatter.sourceType),
    locator: readScalarString(frontmatter.page ?? frontmatter.pages ?? frontmatter.locator),
    evidenceKind: readScalarString(frontmatter.evidence_kind ?? frontmatter.evidenceKind ?? frontmatter.note_kind)
  };
  return Object.values(metadata).some(Boolean) ? metadata : null;
}
function getResearchSourceMetadataForFile(app, file) {
  return getResearchSourceMetadataFromFrontmatter(app.metadataCache.getFileCache(file)?.frontmatter);
}
function getRelationMap(app, file, settings) {
  const cache = app.metadataCache.getFileCache(file);
  const frontmatter = cache?.frontmatter ?? {};
  const result = {};
  for (const key of settings.relationKeys) {
    const values = uniq(readStringArray(frontmatter[key]));
    if (values.length > 0) {
      result[key] = values;
    }
  }
  return result;
}
function resolveNoteTarget(app, target, sourcePath) {
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
function buildSearchFields(app, file, aliasMap) {
  const cache = app.metadataCache.getFileCache(file);
  const tags = getAllTagsForFile(app, file);
  const metadata = getResearchSourceMetadataFromFrontmatter(cache?.frontmatter);
  const reverseAliases = [...aliasMap.entries()].filter(([, aliases]) => aliases.some((alias) => tags.some((tag) => tag.toLowerCase() === alias.toLowerCase()))).map(([canonical]) => canonical);
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
async function collectLinkCandidates(app, currentFile, query, settings, recentTargets, aliasMap) {
  const normalizedQuery = query.trim().toLowerCase();
  const fuzzy = normalizedQuery ? (0, import_obsidian4.prepareFuzzySearch)(normalizedQuery) : null;
  const currentTags = currentFile ? new Set(getAllTagsForFile(app, currentFile).map((tag) => tag.toLowerCase())) : /* @__PURE__ */ new Set();
  const currentRelations = currentFile ? getRelationMap(app, currentFile, settings) : {};
  const currentRelationTargets = new Set(Object.values(currentRelations).flat().map((value) => value.toLowerCase()));
  const candidates = await Promise.all(
    getAllSupportedNoteFiles(app).filter((file) => !currentFile || file.path !== currentFile.path).map(async (file) => {
      const cache = app.metadataCache.getFileCache(file);
      const aliases = getAliasesFromCache(cache);
      const tags = getAllTagsForFile(app, file);
      const researchMetadata = getResearchSourceMetadataFromFrontmatter(cache?.frontmatter);
      const sharedTags = tags.filter((tag) => currentTags.has(tag.toLowerCase()));
      const fields = buildSearchFields(app, file, aliasMap);
      const reasons = [];
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
  return candidates.filter((candidate) => !normalizedQuery || candidate.score > 0).sort((left, right) => right.score - left.score || left.title.localeCompare(right.title, "zh-Hans-CN"));
}
async function getOutgoingLinkFiles(app, file) {
  const cache = app.metadataCache.getFileCache(file);
  const links = [...cache?.links ?? [], ...cache?.frontmatterLinks ?? []];
  const seen = /* @__PURE__ */ new Set();
  const resolved = [];
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
async function getBacklinkFiles(app, file) {
  const resolvedLinks = app.metadataCache.resolvedLinks;
  const seen = /* @__PURE__ */ new Set();
  const backlinks = [];
  for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
    if (!targets[file.path] || sourcePath === file.path) {
      continue;
    }
    const sourceFile = app.vault.getAbstractFileByPath(sourcePath);
    if (sourceFile instanceof import_obsidian4.TFile && !seen.has(sourceFile.path)) {
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
async function getOutgoingExactReferences(app, file) {
  const content = await app.vault.cachedRead(file);
  const collected = [];
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
  return collected.sort((left, right) => left.order - right.order).map(({ order: _order, ...reference }) => reference);
}
async function getIncomingExactReferences(app, file) {
  const collected = [];
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
  return collected.sort(
    (left, right) => left.sourceFile.basename.localeCompare(right.sourceFile.basename, "zh-Hans-CN") || left.order - right.order
  ).map(({ order: _order, ...reference }) => reference);
}
function containsMention(text, term) {
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
function buildMentionSnippet(text, index, length) {
  const start = Math.max(0, index - 50);
  const end = Math.min(text.length, index + length + 80);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}
async function findUnlinkedMentions(app, file, settings, limit = 8) {
  const terms = uniq([file.basename, ...getAliasesFromCache(app.metadataCache.getFileCache(file))]).filter((term) => term.length >= 2);
  if (terms.length === 0) {
    return [];
  }
  const results = [];
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
function getResolvedRelations(app, file, settings) {
  const relationMap = getRelationMap(app, file, settings);
  const resolved = {};
  for (const [key, values] of Object.entries(relationMap)) {
    const targets = values.map((value) => resolveNoteTarget(app, value, file.path)).filter((target) => target instanceof import_obsidian4.TFile);
    if (targets.length > 0) {
      resolved[key] = targets;
    }
  }
  return resolved;
}

// src/semantic.ts
var import_obsidian5 = require("obsidian");
function isSemanticBridgeConfigured(settings) {
  return settings.semanticBridgeEnabled && Boolean(settings.semanticCommand.trim());
}
function getVaultBasePath2(app) {
  const adapter = app.vault.adapter;
  return adapter instanceof import_obsidian5.FileSystemAdapter ? adapter.getBasePath() : "";
}
function getDesktopRequire2() {
  const desktopRequire = globalThis.require;
  return typeof desktopRequire === "function" ? desktopRequire : null;
}
function getExecFunction2() {
  const desktopRequire = getDesktopRequire2();
  if (!desktopRequire) {
    throw new Error("desktop-shell-unavailable");
  }
  const childProcess = desktopRequire("child_process");
  if (typeof childProcess?.exec !== "function") {
    throw new Error("desktop-shell-unavailable");
  }
  return childProcess.exec;
}
function readOptionalString2(value) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return void 0;
}
function normalizeResult2(result) {
  if (typeof result.path !== "string" || !result.path.trim()) {
    return null;
  }
  return {
    path: result.path,
    title: typeof result.title === "string" && result.title.trim() ? result.title : result.path.split("/").pop() ?? result.path,
    score: typeof result.score === "number" ? result.score : 0,
    excerpt: typeof result.excerpt === "string" ? result.excerpt : "",
    reason: typeof result.reason === "string" ? result.reason : "",
    citekey: readOptionalString2(result.citekey ?? result.citation_key),
    author: readOptionalString2(result.author ?? result.authors),
    year: readOptionalString2(result.year),
    page: readOptionalString2(result.page ?? result.locator),
    source_type: readOptionalString2(result.source_type ?? result.sourceType),
    evidence_kind: readOptionalString2(result.evidence_kind ?? result.evidenceKind),
    suggested_tags: Array.isArray(result.suggested_tags) ? result.suggested_tags.map(String) : [],
    suggested_relations: result.suggested_relations && typeof result.suggested_relations === "object" ? Object.fromEntries(
      Object.entries(result.suggested_relations).map(([key, value]) => [
        key,
        Array.isArray(value) ? value.map(String) : []
      ])
    ) : {}
  };
}
async function runSemanticSearch(app, settings, query, activeFile, selection) {
  if (!import_obsidian5.Platform.isDesktopApp) {
    throw new Error("desktop-only");
  }
  if (!isSemanticBridgeConfigured(settings)) {
    throw new Error("missing-command");
  }
  const command = buildSemanticCommand(settings.semanticCommand, {
    query,
    vaultPath: getVaultBasePath2(app),
    filePath: activeFile?.path ?? "",
    selection
  });
  const exec = getExecFunction2();
  const stdout = await new Promise((resolve, reject) => {
    exec(command, { timeout: settings.semanticTimeoutMs, cwd: getVaultBasePath2(app) || void 0 }, (error, resultStdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || error.message));
        return;
      }
      resolve(resultStdout);
    });
  });
  const parsed = JSON.parse(stdout.trim());
  const items = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && Array.isArray(parsed.results) ? parsed.results : [];
  return items.map(normalizeResult2).filter((result) => result !== null);
}

// src/tags.ts
var import_obsidian6 = require("obsidian");
function uniq2(values) {
  const seen = /* @__PURE__ */ new Set();
  const result = [];
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
function normalizeTag(tag) {
  return tag.trim().replace(/^#/, "");
}
var EN_STOPWORDS = /* @__PURE__ */ new Set([
  "the",
  "and",
  "with",
  "from",
  "that",
  "this",
  "have",
  "into",
  "your",
  "for",
  "using",
  "about",
  "note",
  "notes",
  "book",
  "books",
  "reading",
  "chapter",
  "section",
  "title",
  "page",
  "pages",
  "data",
  "system",
  "model",
  "models",
  "file",
  "files",
  "root",
  "copy",
  "source",
  "original"
]);
var NOISY_TOKENS = /* @__PURE__ */ new Set([
  "html",
  "css",
  "js",
  "svg",
  "div",
  "span",
  "node",
  "nodes",
  "active",
  "class",
  "classes",
  "body",
  "container",
  "header",
  "footer",
  "padding",
  "margin",
  "display",
  "position",
  "width",
  "height",
  "font",
  "family",
  "shadow",
  "color",
  "background",
  "gradient",
  "rgba",
  "queryselector",
  "document",
  "dataset",
  "const",
  "function",
  "click",
  "hover",
  "legend",
  "diagram",
  "marker",
  "arrowhead",
  "import",
  "imports",
  "trilium",
  "markdown",
  "highlight",
  "clone"
]);
var STRUCTURAL_TOKENS = /* @__PURE__ */ new Set([
  "archive",
  "archives",
  "journal",
  "journals",
  "notebooklm",
  "vault",
  "folder",
  "folders",
  "reading",
  "books",
  "book",
  "import",
  "imports",
  "attachments",
  "attachment",
  "daily",
  "template",
  "templates",
  "obsidian",
  "bridge"
]);
var GENERIC_CJK_TOKENS = /* @__PURE__ */ new Set([
  "\u5185\u5BB9",
  "\u65B9\u6CD5",
  "\u7CFB\u7EDF",
  "\u6A21\u578B",
  "\u5206\u6790",
  "\u62A5\u544A",
  "\u7814\u7A76",
  "\u7B14\u8BB0",
  "\u603B\u7ED3",
  "\u5B9E\u8DF5",
  "\u7406\u8BBA",
  "\u57FA\u7840",
  "\u6982\u5FF5",
  "\u539F\u7406",
  "\u95EE\u9898",
  "\u7B56\u7565",
  "\u6D41\u7A0B",
  "\u6846\u67B6",
  "\u6807\u51C6",
  "\u8D44\u6599"
]);
var CJK_FUNCTION_CHARS = /* @__PURE__ */ new Set([
  "\u7684",
  "\u4E86",
  "\u662F",
  "\u5728",
  "\u4E0E",
  "\u548C",
  "\u53CA",
  "\u5E76",
  "\u6216",
  "\u5BF9",
  "\u4ECE",
  "\u5C06",
  "\u628A",
  "\u4E3A",
  "\u7B49",
  "\u7531",
  "\u4EE5",
  "\u5176",
  "\u8BA9",
  "\u4F7F",
  "\u6240",
  "\u800C",
  "\u5230",
  "\u4E8E",
  "\u4E2D",
  "\u4E0A",
  "\u4E0B",
  "\u5185",
  "\u5916",
  "\u524D",
  "\u540E",
  "\u518D",
  "\u5404",
  "\u5C31",
  "\u4E5F",
  "\u5F88",
  "\u66F4",
  "\u6700",
  "\u53EF",
  "\u80FD",
  "\u9700",
  "\u8981",
  "\u5DF2",
  "\u672A",
  "\u88AB",
  "\u5411",
  "\u7ED9",
  "\u6309"
]);
var EN_TOKEN_RE = /\b[A-Za-z][A-Za-z-]{2,}\b/g;
var CJK_BLOCK_RE = /[\u3400-\u9fff]{2,24}/g;
function englishKey(value) {
  return value.toLowerCase();
}
function isStructuralTerm(token) {
  const trimmed = token.trim();
  if (!trimmed) {
    return true;
  }
  if (/^[A-Za-z]/.test(trimmed)) {
    return STRUCTURAL_TOKENS.has(englishKey(trimmed));
  }
  return (/* @__PURE__ */ new Set(["\u5F52\u6863", "\u65E5\u5FD7", "\u65E5\u8BB0", "\u5BFC\u5165", "\u9644\u4EF6", "\u6A21\u677F", "\u9605\u8BFB"])).has(trimmed);
}
function isLowSignalTagTerm(token) {
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
function isCjkToken(token) {
  return /[\u3400-\u9fff]/.test(token);
}
function genericTermPenalty(term) {
  return isCjkToken(term) && GENERIC_CJK_TOKENS.has(term) ? 5 : 0;
}
function keywordLengthBonus(term) {
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
function isInvalidCjkPhrase(term) {
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
function isMostlyCodeLike(line) {
  if (/[{};]/.test(line) || /=>/.test(line)) {
    return true;
  }
  return /(function|const |let |var |document\.|querySelector|classList|addEventListener|@media|linear-gradient|rgba\(|box-shadow|font-family|display:|position:|padding:|margin:|width:|height:|cursor:|transition:)/i.test(line);
}
function looksLikeNaturalLanguageLine(line) {
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
function getNaturalLanguageBody(content) {
  return stripFrontmatter(content).split("\n").map((line) => line.trim()).filter(looksLikeNaturalLanguageLine).join("\n");
}
function splitCandidateTerms(input) {
  return input.split(/[/_|()[\]{}:：,，。.!?？、\-\s]+/).map((item) => item.trim()).filter(Boolean);
}
function splitCjkBlock(block) {
  const parts = block.split(/[的是在与和及并或对从将把为等由以其让使所而到于中上下内外前后再各就也很更最可能需要已未被向给按]/).map((item) => item.trim()).filter((item) => item.length >= 2);
  return parts.length > 0 ? parts : [block.trim()];
}
function collectCandidateTermsFromText(input) {
  const terms = /* @__PURE__ */ new Set();
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
        const boundaryPhrases = /* @__PURE__ */ new Set([
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
  return uniq2([...terms]);
}
function extractTagTermCandidates(input) {
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
function collectReferenceTargetTerms(content) {
  const directTargets = [
    ...extractLegacyLineReferences(content).map((reference) => reference.target),
    ...extractNativeBlockReferences(content).map((reference) => reference.target)
  ];
  return uniq2(
    directTargets.flatMap((target) => extractTagTermCandidates(target.replace(/\.md$/i, ""))).filter((term) => !isNoisyToken(term) && !isStructuralTerm(term) && !isLowSignalTagTerm(term))
  );
}
function isNoisyToken(token) {
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
function collectReferencedContextTerms(app, file, content) {
  const cache = app.metadataCache.getFileCache(file);
  const linkTargets = [
    ...cache?.links ?? [],
    ...cache?.frontmatterLinks ?? []
  ].map((link) => app.metadataCache.getFirstLinkpathDest(link.link, file.path)).filter((target) => target instanceof import_obsidian6.TFile);
  const legacyTargets = extractLegacyLineReferences(content).map((reference) => resolveNoteTarget(app, reference.target, file.path)).filter((target) => target instanceof import_obsidian6.TFile);
  const nativeBlockTargets = extractNativeBlockReferences(content).map((reference) => resolveNoteTarget(app, reference.target, file.path)).filter((target) => target instanceof import_obsidian6.TFile);
  const uniqueTargets = [...new Map(
    [...linkTargets, ...legacyTargets, ...nativeBlockTargets].map((target) => [target.path, target])
  ).values()];
  const terms = [];
  const tags = [];
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
    terms: uniq2(terms.filter((term) => !isNoisyToken(term) && !isStructuralTerm(term))),
    tags: uniq2(tags.filter((tag) => !isNoisyToken(tag) && !isStructuralTerm(tag)))
  };
}
function replaceInlineTagOccurrences(content, cache, fromTag, toTag) {
  const replacements = (cache?.tags ?? []).filter((tag) => normalizeTag(tag.tag).toLowerCase() === fromTag.toLowerCase()).map((tag) => ({
    start: tag.position.start.offset,
    end: tag.position.end.offset,
    text: toTag ? `#${toTag}` : ""
  })).sort((left, right) => right.start - left.start);
  let updated = content;
  for (const replacement of replacements) {
    updated = `${updated.slice(0, replacement.start)}${replacement.text}${updated.slice(replacement.end)}`;
  }
  return updated;
}
function mutateFrontmatterTags(frontmatter, oldTag, newTag) {
  const existing = uniq2(
    Array.isArray(frontmatter.tags) ? frontmatter.tags.map((tag) => String(tag)) : typeof frontmatter.tags === "string" ? [String(frontmatter.tags)] : []
  );
  if (existing.length === 0 && !newTag) {
    return;
  }
  const next = uniq2(existing.filter((tag) => tag.toLowerCase() !== oldTag.toLowerCase()).concat(newTag ? [newTag] : []));
  if (next.length === 0) {
    delete frontmatter.tags;
  } else {
    frontmatter.tags = next;
  }
}
function getTagStats(app, aliasMapText) {
  const aliasMap = (() => {
    try {
      return parseTagAliasMap(aliasMapText);
    } catch {
      return /* @__PURE__ */ new Map();
    }
  })();
  const stats = /* @__PURE__ */ new Map();
  for (const file of getAllSupportedNoteFiles(app)) {
    const tags = getAllTagsForFile(app, file);
    for (const tag of tags) {
      const key = tag.toLowerCase();
      const aliases = aliasMap.get(tag) ?? [...aliasMap.entries()].filter(([, values]) => values.some((value) => value.toLowerCase() === key)).map(([canonical]) => canonical);
      const existing = stats.get(key) ?? {
        tag,
        count: 0,
        files: [],
        aliases: uniq2(aliases)
      };
      existing.count += 1;
      existing.files.push(file);
      existing.aliases = uniq2([...existing.aliases, ...aliases]);
      stats.set(key, existing);
    }
  }
  return [...stats.values()].sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag, "zh-Hans-CN"));
}
async function updateTagInFile(app, file, oldTag, newTag) {
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
async function renameTagAcrossVault(app, oldTag, newTag) {
  let updated = 0;
  for (const file of getAllSupportedNoteFiles(app)) {
    if (await updateTagInFile(app, file, oldTag, newTag)) {
      updated += 1;
    }
  }
  return updated;
}
async function deleteTagAcrossVault(app, tag) {
  let updated = 0;
  for (const file of getAllSupportedNoteFiles(app)) {
    if (await updateTagInFile(app, file, tag, null)) {
      updated += 1;
    }
  }
  return updated;
}
async function appendTagsToFrontmatter(app, file, tags) {
  const normalized = uniq2(tags.map(normalizeTag));
  await app.fileManager.processFrontMatter(file, (frontmatter) => {
    const existing = uniq2(
      Array.isArray(frontmatter.tags) ? frontmatter.tags.map((tag) => String(tag)) : typeof frontmatter.tags === "string" ? [String(frontmatter.tags)] : []
    );
    frontmatter.tags = uniq2([...existing, ...normalized]);
  });
}
function hasPhrase(text, phrase) {
  const trimmed = phrase.trim();
  if (!trimmed) {
    return false;
  }
  if (/^[A-Za-z]/.test(trimmed)) {
    return text.toLowerCase().includes(englishKey(trimmed));
  }
  return text.includes(trimmed);
}
function normalizeCandidateTag(tag) {
  return normalizeTag(tag).replace(/\s+/g, " ").trim();
}
function facetPriorityBonus(facet) {
  if (["topic", "method", "dataset", "writing_stage", "status"].includes(facet)) {
    return 10;
  }
  if (["theory", "project"].includes(facet)) {
    return 8;
  }
  return 6;
}
function addTagTermSignal(signals, rawTerm, source, weight, matchText = rawTerm) {
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
    sources: /* @__PURE__ */ new Set(),
    matches: /* @__PURE__ */ new Set()
  };
  signal.weight += weight;
  signal.occurrences += 1;
  signal.sources.add(source);
  signal.matches.add(normalizeCandidateTag(matchText));
  signals.set(key, signal);
}
function collectSignalsFromText(signals, input, source, weight) {
  const localTerms = new Set(extractTagTermCandidates(input));
  for (const term of localTerms) {
    addTagTermSignal(signals, term, source, weight, term);
  }
}
function scoreTagTermSignal(term, signal) {
  const sourceBonus = (signal.sources.has("title") ? 10 : 0) + (signal.sources.has("heading") ? 7 : 0) + (signal.sources.has("reference") ? 6 : 0) + (signal.sources.has("alias") ? 5 : 0) + (signal.sources.has("context") ? 4 : 0) + (signal.sources.has("body") ? Math.min(6, signal.occurrences * 2) : 0);
  return signal.weight + sourceBonus + keywordLengthBonus(term) - genericTermPenalty(term);
}
function isRedundantKeywordSuggestion(term, score, accepted) {
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
function mergeSuggestion(suggestions, tag, kind, score, matches, bucket, sources, facet) {
  const normalizedTag = normalizeCandidateTag(tag);
  if (!normalizedTag || isNoisyToken(normalizedTag) || isStructuralTerm(normalizedTag)) {
    return;
  }
  if (isCjkToken(normalizedTag) && isInvalidCjkPhrase(normalizedTag)) {
    return;
  }
  const key = normalizedTag.toLowerCase();
  const existing = suggestions.get(key);
  const normalizedMatches = uniq2(matches.map(normalizeCandidateTag).filter((item) => item && !isNoisyToken(item)));
  const normalizedSources = uniq2(sources);
  if (!existing) {
    suggestions.set(key, {
      tag: normalizedTag,
      kind,
      score,
      bucket,
      facet,
      matches: normalizedMatches,
      sources: normalizedSources
    });
    return;
  }
  const shouldReplaceKind = score > existing.score;
  existing.score = Math.max(existing.score, score);
  existing.bucket = existing.bucket === "primary" || bucket === "primary" ? "primary" : "secondary";
  existing.matches = uniq2([...existing.matches, ...normalizedMatches]);
  existing.sources = uniq2([...existing.sources, ...normalizedSources]);
  existing.facet = existing.facet ?? facet;
  if (shouldReplaceKind) {
    existing.kind = kind;
    if (facet) {
      existing.facet = facet;
    }
  }
}
async function suggestTagsForFile(app, file, aliasMapText, facetMapText = "") {
  const content = await app.vault.cachedRead(file);
  const cache = app.metadataCache.getFileCache(file);
  const existing = new Set(getAllTagsForFile(app, file).map((tag) => tag.toLowerCase()));
  const knownTags = getTagStats(app, aliasMapText);
  const aliasMap = (() => {
    try {
      return parseTagAliasMap(aliasMapText);
    } catch {
      return /* @__PURE__ */ new Map();
    }
  })();
  const facetMap = (() => {
    try {
      return parseTagFacetMap(facetMapText);
    } catch {
      return /* @__PURE__ */ new Map();
    }
  })();
  const titleTerms = extractTagTermCandidates(file.basename);
  const headings = (cache?.headings ?? []).map((heading) => heading.heading).flatMap(extractTagTermCandidates);
  const referencedContext = collectReferencedContextTerms(app, file, content);
  const directReferenceTerms = collectReferenceTargetTerms(content);
  const naturalBody = getNaturalLanguageBody(content);
  const noteAliases = getAliasesFromCache(cache);
  const pathTerms = file.path.split("/").slice(0, -1).flatMap((segment) => extractTagTermCandidates(segment));
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
  const suggestions = /* @__PURE__ */ new Map();
  const keywordSignals = /* @__PURE__ */ new Map();
  const acceptedKeywordSuggestions = [];
  const sourceTexts = [
    ["title", file.basename],
    ["alias", noteAliases.join("\n")],
    ["heading", headings.join("\n")],
    ["reference", directReferenceTerms.join("\n")],
    ["context", [...referencedContext.terms, ...referencedContext.tags].join("\n")],
    ["path", pathTerms.join("\n")],
    ["body", naturalBody]
  ];
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
  for (const [facet, entries] of facetMap.entries()) {
    for (const [canonical, aliases] of entries.entries()) {
      if (existing.has(canonical.toLowerCase()) || isNoisyToken(canonical)) {
        continue;
      }
      const terms = uniq2([canonical, ...aliases]);
      const matches = [];
      const matchedSources = /* @__PURE__ */ new Set(["facet"]);
      for (const term of terms) {
        for (const [source, text] of sourceTexts) {
          if (text && hasPhrase(text, term)) {
            matches.push(term);
            matchedSources.add(source);
          }
        }
      }
      if (matches.length > 0) {
        mergeSuggestion(
          suggestions,
          canonical,
          "facet-tag",
          54 + matches.length * 4 + facetPriorityBonus(facet),
          matches,
          "primary",
          [...matchedSources],
          facet
        );
      }
    }
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
  const rankedKeywordSignals = [...keywordSignals.entries()].map(([term, signal]) => ({
    term,
    signal,
    score: scoreTagTermSignal(term, signal)
  })).sort((left, right) => right.score - left.score || left.term.localeCompare(right.term, "zh-Hans-CN"));
  for (const entry of rankedKeywordSignals) {
    const { term, signal, score } = entry;
    if (existing.has(term.toLowerCase()) || isNoisyToken(term) || isStructuralTerm(term) || isLowSignalTagTerm(term)) {
      continue;
    }
    const strongSource = signal.sources.has("title") || signal.sources.has("heading") || signal.sources.has("reference") || signal.sources.has("alias");
    if (score < 18 && !strongSource && signal.occurrences < 2) {
      continue;
    }
    if (isRedundantKeywordSuggestion(term, score, acceptedKeywordSuggestions)) {
      continue;
    }
    const kind = signal.sources.size === 1 && signal.sources.has("path") ? "source-path" : "keyword";
    const bucket = kind === "source-path" || !strongSource && score < 28 ? "secondary" : "primary";
    const suggestion = {
      tag: term,
      score,
      kind,
      bucket,
      facet: void 0,
      matches: uniq2([...signal.matches].filter((item) => item && item.toLowerCase() !== term.toLowerCase())).slice(0, 4),
      sources: uniq2([...signal.sources])
    };
    mergeSuggestion(
      suggestions,
      suggestion.tag,
      suggestion.kind,
      suggestion.score,
      suggestion.matches,
      suggestion.bucket,
      suggestion.sources,
      suggestion.facet
    );
    acceptedKeywordSuggestions.push(suggestion);
  }
  return [...suggestions.values()].filter((suggestion) => Boolean(suggestion.tag)).sort((left, right) => (left.bucket === right.bucket ? 0 : left.bucket === "primary" ? -1 : 1) || right.score - left.score || left.tag.localeCompare(right.tag, "zh-Hans-CN")).slice(0, 14);
}

// src/modals.ts
function renderModalHeader(parent, title, description) {
  const header = parent.createDiv({ cls: "lti-modal-header" });
  header.createDiv({ text: title, cls: "lti-modal-title" });
  if (description) {
    header.createDiv({ text: description, cls: "lti-modal-description" });
  }
}
function isPromiseLike(value) {
  return typeof value === "object" && value !== null && "then" in value && typeof value.then === "function";
}
function runModalTask(task) {
  const onError = (error) => {
    console.error("[lti-modal] action failed", error);
    new import_obsidian7.Notice(error instanceof Error ? error.message : String(error));
  };
  try {
    const result = task();
    if (isPromiseLike(result)) {
      void Promise.resolve(result).catch(onError);
    }
  } catch (error) {
    onError(error);
  }
}
function inferResearchSourceType(value) {
  const normalized = value.trim();
  if (/arxiv\.org\/(abs|pdf)\//i.test(normalized) || /^\d{4}\.\d{4,5}(v\d+)?$/i.test(normalized) || /^[a-z-]+\/\d{7}$/i.test(normalized)) {
    return "arxiv";
  }
  if (/\.pdf($|\?)/i.test(normalized) || /^(\/|\.{1,2}\/)/.test(normalized)) {
    return "pdf";
  }
  return "doi";
}
var TextPromptModal = class extends import_obsidian7.Modal {
  constructor(plugin, title, onSubmit, options) {
    super(plugin.app);
    this.title = title;
    this.placeholder = options?.placeholder ?? "";
    this.defaultValue = options?.defaultValue ?? "";
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    renderModalHeader(contentEl, this.title);
    const wrapper = contentEl.createDiv({ cls: "lti-form" });
    const input = wrapper.createEl("input", {
      type: "text",
      value: this.defaultValue,
      placeholder: this.placeholder
    });
    const actions = contentEl.createDiv({ cls: "lti-modal-actions" });
    new import_obsidian7.ButtonComponent(actions).setButtonText("OK").setCta().onClick(() => this.submitValue(input));
    new import_obsidian7.ButtonComponent(actions).setButtonText("Cancel").onClick(() => this.close());
    input.focus();
    input.select();
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.submitValue(input);
      }
    });
  }
  submitValue(input) {
    runModalTask(async () => {
      const value = input.value.trim();
      if (!value) {
        return;
      }
      await this.onSubmit(value);
      this.close();
    });
  }
};
var RelationKeyModal = class extends import_obsidian7.SuggestModal {
  constructor(plugin, onChoose) {
    super(plugin.app);
    this.plugin = plugin;
    this.onChoose = onChoose;
    this.setPlaceholder(this.plugin.t("promptRelationKey"));
    this.emptyStateText = this.plugin.t("emptyList");
  }
  getSuggestions(query) {
    const normalized = query.trim().toLowerCase();
    return this.plugin.settings.relationKeys.filter((key) => {
      if (!normalized) {
        return true;
      }
      const label = relationKeyLabel(this.plugin.currentLanguage(), key).toLowerCase();
      return key.toLowerCase().includes(normalized) || label.includes(normalized);
    });
  }
  renderSuggestion(value, el) {
    const title = relationKeyLabel(this.plugin.currentLanguage(), value);
    el.createEl("div", { text: title, cls: "suggestion-title" });
    el.createDiv({ text: value, cls: "suggestion-meta" });
  }
  onChooseSuggestion(value) {
    this.onChoose(value);
  }
};
var LinkInsertModal = class extends import_obsidian7.SuggestModal {
  constructor(plugin, mode, onChoose, options) {
    super(plugin.app);
    this.plugin = plugin;
    this.mode = mode;
    this.currentFile = plugin.getContextNoteFile();
    this.selectedText = plugin.getContextSelection();
    this.onChoose = onChoose ?? ((candidate) => this.plugin.insertLinkIntoEditor(candidate.file, this.mode === "quick_link" ? this.selectedText : ""));
    this.setPlaceholder(options?.placeholder ?? this.plugin.t("insertLinkPlaceholder"));
    this.emptyStateText = options?.emptyStateText ?? this.plugin.t("insertLinkEmpty");
  }
  async getSuggestions(query) {
    return (await collectLinkCandidates(
      this.app,
      this.currentFile,
      query,
      this.plugin.settings,
      this.plugin.settings.recentLinkTargets,
      this.plugin.getTagAliasMap()
    )).slice(0, 40);
  }
  renderSuggestion(candidate, el) {
    el.empty();
    const container = el.createDiv({ cls: "suggestion-content" });
    const titleRow = container.createDiv({ cls: "suggestion-title-row" });
    titleRow.createSpan({ text: candidate.title, cls: "suggestion-title" });
    titleRow.createSpan({ text: String(candidate.score), cls: "suggestion-meta" });
    if (candidate.aliases.length > 0) {
      container.createDiv({ text: `${this.plugin.t("aliases")}: ${candidate.aliases.join(", ")}`, cls: "suggestion-meta" });
    }
    const researchSummary = this.plugin.formatResearchMetadataSummary(candidate.researchMetadata);
    if (researchSummary) {
      container.createDiv({ text: researchSummary, cls: "suggestion-meta" });
    }
    container.createDiv({ text: candidate.path, cls: "suggestion-meta" });
    if (candidate.sharedTags.length > 0) {
      container.createDiv({
        text: `${this.plugin.t("sharedTags")}: ${candidate.sharedTags.join(", ")}`,
        cls: "suggestion-meta"
      });
    }
    if (candidate.reasons.length > 0) {
      container.createDiv({
        text: `${this.plugin.t("reason")}: ${candidate.reasons.join(" \xB7 ")}`,
        cls: "suggestion-meta"
      });
    }
    if (candidate.excerpt) {
      container.createDiv({ text: candidate.excerpt, cls: "suggestion-preview" });
    }
  }
  onChooseSuggestion(candidate) {
    runModalTask(() => this.onChoose(candidate));
  }
};
var ReferenceInsertModal = class extends import_obsidian7.Modal {
  constructor(plugin, file, mode) {
    super(plugin.app);
    this.lines = [];
    this.startLine = 1;
    this.endLine = 1;
    this.plugin = plugin;
    this.file = file;
    this.mode = mode;
  }
  async onOpen() {
    this.contentEl.empty();
    renderModalHeader(
      this.contentEl,
      this.mode === "block_ref" ? this.plugin.t("insertBlockRef") : this.plugin.t("insertLineRef"),
      this.mode === "block_ref" ? this.plugin.t("modalBlockRefDescription") : this.plugin.t("modalLineRefDescription")
    );
    this.contentEl.createDiv({ text: this.plugin.t("loading"), cls: "lti-empty" });
    this.lines = await readFileLines(this.plugin.app, this.file);
    this.startLine = 1;
    this.endLine = 1;
    this.render();
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    renderModalHeader(
      contentEl,
      this.mode === "block_ref" ? this.plugin.t("insertBlockRef") : this.plugin.t("insertLineRef"),
      this.mode === "block_ref" ? this.plugin.t("modalBlockRefDescription") : this.plugin.t("modalLineRefDescription")
    );
    const meta = contentEl.createDiv({ cls: "lti-section lti-ref-file-meta" });
    meta.createDiv({ text: this.file.basename, cls: "suggestion-title" });
    meta.createDiv({ text: this.file.path, cls: "suggestion-meta" });
    const rangeSection = contentEl.createDiv({ cls: "lti-section" });
    rangeSection.createDiv({
      text: this.mode === "block_ref" ? this.plugin.t("referenceCreateBlockFromLines") : this.plugin.t("referenceCreateLineFromLines"),
      cls: "lti-section-title"
    });
    const rangeRow = rangeSection.createDiv({ cls: "lti-input-row" });
    rangeRow.createDiv({ text: this.plugin.t("referenceStartLine"), cls: "suggestion-meta" });
    const startInput = rangeRow.createEl("input", {
      type: "number",
      value: String(this.startLine),
      cls: "lti-number-input"
    });
    rangeRow.createDiv({ text: this.plugin.t("referenceEndLine"), cls: "suggestion-meta" });
    const endInput = rangeRow.createEl("input", {
      type: "number",
      value: String(this.endLine),
      cls: "lti-number-input"
    });
    const syncInputs = () => {
      const normalized = normalizeLineRange(
        Number.parseInt(startInput.value, 10) || 1,
        Number.parseInt(endInput.value, 10) || void 0,
        this.lines.length || 1
      );
      this.startLine = normalized.startLine;
      this.endLine = normalized.endLine;
      startInput.value = String(this.startLine);
      endInput.value = String(this.endLine);
      preview.textContent = getLineRangePreviewFromLines(this.lines, this.startLine, this.endLine) || this.plugin.t("referenceNoPreview");
    };
    startInput.addEventListener("change", syncInputs);
    endInput.addEventListener("change", syncInputs);
    startInput.addEventListener("input", syncInputs);
    endInput.addEventListener("input", syncInputs);
    const preview = rangeSection.createDiv({
      text: getLineRangePreviewFromLines(this.lines, this.startLine, this.endLine) || this.plugin.t("referenceNoPreview"),
      cls: "lti-ref-preview"
    });
    const actions = contentEl.createDiv({ cls: "lti-modal-actions" });
    new import_obsidian7.ButtonComponent(actions).setButtonText(this.plugin.t(this.mode === "block_ref" ? "insertBlockRef" : "insertLineRef")).setCta().onClick(() => this.submitSelection());
    new import_obsidian7.ButtonComponent(actions).setButtonText(this.plugin.t("cancel")).onClick(() => this.close());
  }
  submitSelection() {
    if (this.mode === "block_ref") {
      this.plugin.insertBlockReferenceIntoEditor(this.file, this.startLine, this.endLine);
    } else {
      this.plugin.insertLineReferenceIntoEditor(this.file, this.startLine, this.endLine);
    }
    this.close();
  }
};
var TagManagerModal = class extends import_obsidian7.Modal {
  constructor(plugin) {
    super(plugin.app);
    this.search = "";
    this.searchDebounceTimer = null;
    this.plugin = plugin;
  }
  onOpen() {
    this.render();
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    renderModalHeader(contentEl, this.plugin.t("manageTags"), this.plugin.t("modalManageTagsDescription"));
    const form = contentEl.createDiv({ cls: "lti-form" });
    const input = form.createEl("input", {
      type: "text",
      value: this.search,
      placeholder: this.plugin.t("searchTags")
    });
    input.addEventListener("input", () => {
      this.search = input.value;
      if (this.searchDebounceTimer !== null) {
        window.clearTimeout(this.searchDebounceTimer);
      }
      this.searchDebounceTimer = window.setTimeout(() => {
        this.render();
        this.searchDebounceTimer = null;
      }, 150);
    });
    input.focus();
    const list = contentEl.createDiv();
    const stats = getTagStats(this.plugin.app, this.plugin.settings.tagAliasMapText).filter(
      (stat) => !this.search.trim() || stat.tag.toLowerCase().includes(this.search.trim().toLowerCase())
    );
    if (stats.length === 0) {
      list.createDiv({ text: this.plugin.t("emptyList"), cls: "lti-empty" });
      return;
    }
    for (const stat of stats) {
      const row = list.createDiv({ cls: "tag-manager-row" });
      const info = row.createDiv();
      info.createDiv({ text: `${stat.tag} (${stat.count})`, cls: "suggestion-title" });
      if (stat.aliases.length > 0) {
        info.createDiv({ text: `${this.plugin.t("aliases")}: ${stat.aliases.join(", ")}`, cls: "suggestion-meta" });
      }
      const actions = row.createDiv({ cls: "tag-manager-actions" });
      const renameButton = actions.createEl("button", { text: this.plugin.t("rename"), cls: "lti-inline-button" });
      renameButton.addEventListener("click", () => {
        new TextPromptModal(this.plugin, this.plugin.t("promptRenameTag"), async (value) => {
          const updated = await renameTagAcrossVault(this.plugin.app, stat.tag, value);
          new import_obsidian7.Notice(`${this.plugin.t("tagsUpdated")} (${updated})`);
          this.render();
          this.plugin.refreshAllViews();
        }, { defaultValue: stat.tag }).open();
      });
      const mergeButton = actions.createEl("button", { text: this.plugin.t("merge"), cls: "lti-inline-button" });
      mergeButton.addEventListener("click", () => {
        new TextPromptModal(this.plugin, this.plugin.t("promptMergeInto"), async (value) => {
          const updated = await renameTagAcrossVault(this.plugin.app, stat.tag, value);
          new import_obsidian7.Notice(`${this.plugin.t("tagsUpdated")} (${updated})`);
          this.render();
          this.plugin.refreshAllViews();
        }).open();
      });
      const deleteButton = actions.createEl("button", { text: this.plugin.t("delete"), cls: "lti-inline-button" });
      deleteButton.addEventListener("click", () => {
        runModalTask(async () => {
          const updated = await deleteTagAcrossVault(this.plugin.app, stat.tag);
          new import_obsidian7.Notice(`${this.plugin.t("tagsUpdated")} (${updated})`);
          this.render();
          this.plugin.refreshAllViews();
        });
      });
    }
  }
};
var TagSuggestionModal = class extends import_obsidian7.Modal {
  constructor(plugin, file) {
    super(plugin.app);
    this.suggestions = [];
    this.selected = /* @__PURE__ */ new Set();
    this.plugin = plugin;
    this.file = file;
  }
  async onOpen() {
    this.modalEl.addClass("lti-modal-shell", "lti-tag-suggestion-shell");
    this.contentEl.addClass("lti-modal-content", "lti-tag-suggestion-modal");
    this.contentEl.empty();
    renderModalHeader(this.contentEl, this.plugin.t("suggestTags"), this.plugin.t("modalTagSuggestionsDescription"));
    this.contentEl.createDiv({ text: this.plugin.t("loading"), cls: "lti-empty" });
    this.suggestions = await suggestTagsForFile(
      this.plugin.app,
      this.file,
      this.plugin.settings.tagAliasMapText,
      this.plugin.settings.tagFacetMapText
    );
    const preferred = this.suggestions.filter((item) => item.bucket === "primary");
    const fallback = this.suggestions.filter((item) => item.bucket === "secondary");
    this.selected = new Set(
      [...preferred.slice(0, 3), ...fallback.slice(0, Math.max(0, 4 - preferred.slice(0, 3).length))].slice(0, 4).map((item) => item.tag)
    );
    this.render();
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("lti-modal-content", "lti-tag-suggestion-modal");
    renderModalHeader(contentEl, this.plugin.t("suggestTags"), this.plugin.t("modalTagSuggestionsDescription"));
    if (this.suggestions.length === 0) {
      contentEl.createDiv({ text: this.plugin.t("emptyList"), cls: "lti-empty" });
      return;
    }
    const summary = contentEl.createDiv({ cls: "lti-tag-modal-summary" });
    summary.createDiv({ text: this.plugin.t("tagSuggestionSummary"), cls: "lti-tag-modal-summary-text" });
    summary.createDiv({
      text: `${this.selected.size}/${this.suggestions.length}`,
      cls: "lti-tag-modal-summary-count"
    });
    const primary = this.suggestions.filter((suggestion) => suggestion.bucket === "primary");
    const secondary = this.suggestions.filter((suggestion) => suggestion.bucket === "secondary");
    if (primary.length > 0) {
      this.renderSuggestionGroup(contentEl, this.plugin.t("tagSuggestionPrimaryGroup"), primary);
    }
    if (secondary.length > 0) {
      this.renderSuggestionGroup(contentEl, this.plugin.t("tagSuggestionSecondaryGroup"), secondary);
    }
    const actions = contentEl.createDiv({ cls: "lti-modal-actions" });
    new import_obsidian7.ButtonComponent(actions).setButtonText(this.plugin.t("apply")).setCta().onClick(() => {
      runModalTask(async () => {
        await appendTagsToFrontmatter(this.plugin.app, this.file, [...this.selected]);
        new import_obsidian7.Notice(this.plugin.t("createdFrontmatterTag"));
        this.plugin.refreshAllViews();
        this.close();
      });
    });
    new import_obsidian7.ButtonComponent(actions).setButtonText(this.plugin.t("cancel")).onClick(() => this.close());
  }
  renderSuggestionGroup(parent, title, suggestions) {
    const section = parent.createDiv({ cls: "lti-tag-modal-group" });
    const header = section.createDiv({ cls: "lti-tag-modal-group-head" });
    header.createDiv({ text: title, cls: "lti-tag-modal-group-title" });
    header.createDiv({ text: String(suggestions.length), cls: "lti-tag-modal-group-count" });
    const list = section.createDiv({ cls: "lti-tag-modal-list" });
    for (const suggestion of suggestions) {
      const selected = this.selected.has(suggestion.tag);
      const row = list.createDiv({ cls: `lti-tag-card${selected ? " is-selected" : ""}` });
      row.setAttribute("role", "button");
      row.tabIndex = 0;
      const toggleSelection = () => {
        if (this.selected.has(suggestion.tag)) {
          this.selected.delete(suggestion.tag);
        } else {
          this.selected.add(suggestion.tag);
        }
        this.render();
      };
      row.addEventListener("click", toggleSelection);
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleSelection();
        }
      });
      const top = row.createDiv({ cls: "lti-tag-card-head" });
      top.createDiv({ text: suggestion.tag, cls: "lti-tag-card-name" });
      top.createSpan({
        text: this.plugin.t(selected ? "selected" : "notSelected"),
        cls: `lti-tag-card-state${selected ? " is-selected" : ""}`
      });
      const meta = row.createDiv({ cls: "lti-tag-card-meta" });
      meta.createSpan({ text: this.kindLabel(suggestion.kind), cls: "lti-tag-card-kind" });
      meta.createSpan({ text: `${this.plugin.t("semanticScore")}: ${suggestion.score}`, cls: "lti-tag-card-score" });
      if (suggestion.facet) {
        row.createDiv({
          text: this.plugin.t("tagSuggestionFacetLabel", { facet: this.plugin.formatFacetLabel(suggestion.facet) }),
          cls: "lti-tag-card-evidence"
        });
      }
      if (suggestion.sources.length > 0) {
        row.createDiv({
          text: this.plugin.t("tagSuggestionEvidence", { sources: this.formatSources(suggestion.sources) }),
          cls: "lti-tag-card-evidence"
        });
      }
      if (suggestion.matches.length > 0) {
        row.createDiv({
          text: this.plugin.t("tagSuggestionMatches", { matches: suggestion.matches.slice(0, 3).join(" / ") }),
          cls: "lti-tag-card-matches"
        });
      }
    }
  }
  kindLabel(kind) {
    if (kind === "alias") {
      return this.plugin.t("tagSuggestionAlias");
    }
    if (kind === "facet-tag") {
      return this.plugin.t("tagSuggestionFacet");
    }
    if (kind === "known-tag") {
      return this.plugin.t("tagSuggestionKnown");
    }
    if (kind === "source-path") {
      return this.plugin.t("tagSuggestionSource");
    }
    return this.plugin.t("tagSuggestionKeyword");
  }
  formatSources(sources) {
    return sources.map((source) => {
      if (source === "title") {
        return this.plugin.t("tagSuggestionSourceTitle");
      }
      if (source === "alias") {
        return this.plugin.t("tagSuggestionSourceAlias");
      }
      if (source === "heading") {
        return this.plugin.t("tagSuggestionSourceHeading");
      }
      if (source === "facet") {
        return this.plugin.t("tagSuggestionSourceFacet");
      }
      if (source === "reference") {
        return this.plugin.t("tagSuggestionSourceReference");
      }
      if (source === "context") {
        return this.plugin.t("tagSuggestionSourceContext");
      }
      if (source === "path") {
        return this.plugin.t("tagSuggestionSourcePath");
      }
      if (source === "vault-tag") {
        return this.plugin.t("tagSuggestionSourceVault");
      }
      return this.plugin.t("tagSuggestionSourceBody");
    }).join(" / ");
  }
};
var ResearchIngestionModal = class extends import_obsidian7.Modal {
  constructor(plugin) {
    super(plugin.app);
    this.source = "";
    this.metadataDoi = "";
    this.metadataArxiv = "";
    this.titleOverride = "";
    this.authorsOverride = "";
    this.yearOverride = "";
    this.downloadPdf = true;
    this.result = null;
    this.inlineError = "";
    this.plugin = plugin;
    this.activeFile = plugin.getContextNoteFile();
    this.source = plugin.getContextSelection().trim();
    this.sourceType = inferResearchSourceType(this.source);
  }
  onOpen() {
    this.render();
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    renderModalHeader(contentEl, this.plugin.t("ingestionCapture"), this.plugin.t("modalIngestionDescription"));
    const form = contentEl.createDiv({ cls: "lti-form" });
    const typeRow = form.createDiv({ cls: "lti-input-row lti-input-row-2col" });
    typeRow.createDiv({ text: this.plugin.t("ingestionSourceType"), cls: "suggestion-meta" });
    const typeSelect = typeRow.createEl("select", { cls: "lti-workbench-select" });
    for (const option of [
      { value: "doi", label: this.plugin.t("ingestionTypeDoi") },
      { value: "arxiv", label: this.plugin.t("ingestionTypeArxiv") },
      { value: "pdf", label: this.plugin.t("ingestionTypePdf") }
    ]) {
      const el = typeSelect.createEl("option", { text: option.label });
      el.value = option.value;
      el.selected = option.value === this.sourceType;
    }
    typeSelect.addEventListener("change", () => {
      this.sourceType = typeSelect.value;
      this.result = null;
      this.inlineError = "";
      this.render();
    });
    const sourceRow = form.createDiv({ cls: "lti-form" });
    sourceRow.createDiv({ text: this.plugin.t("ingestionSourceValue"), cls: "suggestion-meta" });
    const sourceInput = sourceRow.createEl("input", {
      type: "text",
      value: this.source,
      placeholder: this.sourcePlaceholder()
    });
    sourceInput.addEventListener("input", () => {
      this.source = sourceInput.value;
      this.result = null;
      this.inlineError = "";
    });
    if (this.sourceType === "pdf") {
      const metadataGrid = form.createDiv({ cls: "lti-form" });
      metadataGrid.createDiv({ text: this.plugin.t("ingestionMetadataHeading"), cls: "suggestion-meta" });
      const metadataDoiInput = metadataGrid.createEl("input", {
        type: "text",
        value: this.metadataDoi,
        placeholder: this.plugin.t("ingestionMetadataDoiPlaceholder")
      });
      metadataDoiInput.addEventListener("input", () => {
        this.metadataDoi = metadataDoiInput.value;
        this.result = null;
        this.inlineError = "";
      });
      const metadataArxivInput = metadataGrid.createEl("input", {
        type: "text",
        value: this.metadataArxiv,
        placeholder: this.plugin.t("ingestionMetadataArxivPlaceholder")
      });
      metadataArxivInput.addEventListener("input", () => {
        this.metadataArxiv = metadataArxivInput.value;
        this.result = null;
        this.inlineError = "";
      });
      const toggleRow = metadataGrid.createDiv({ cls: "lti-input-row" });
      toggleRow.createDiv({ text: this.plugin.t("ingestionDownloadPdf"), cls: "suggestion-meta" });
      const downloadToggle = toggleRow.createEl("input", { type: "checkbox" });
      downloadToggle.checked = this.downloadPdf;
      downloadToggle.addEventListener("change", () => {
        this.downloadPdf = downloadToggle.checked;
        this.result = null;
        this.inlineError = "";
      });
    }
    const overrides = form.createDiv({ cls: "lti-form" });
    overrides.createDiv({ text: this.plugin.t("ingestionOverrideHeading"), cls: "suggestion-meta" });
    const titleInput = overrides.createEl("input", {
      type: "text",
      value: this.titleOverride,
      placeholder: this.plugin.t("ingestionTitlePlaceholder")
    });
    titleInput.addEventListener("input", () => {
      this.titleOverride = titleInput.value;
      this.result = null;
      this.inlineError = "";
    });
    const authorsInput = overrides.createEl("input", {
      type: "text",
      value: this.authorsOverride,
      placeholder: this.plugin.t("ingestionAuthorsPlaceholder")
    });
    authorsInput.addEventListener("input", () => {
      this.authorsOverride = authorsInput.value;
      this.result = null;
      this.inlineError = "";
    });
    const yearInput = overrides.createEl("input", {
      type: "text",
      value: this.yearOverride,
      placeholder: this.plugin.t("ingestionYearPlaceholder")
    });
    yearInput.addEventListener("input", () => {
      this.yearOverride = yearInput.value;
      this.result = null;
      this.inlineError = "";
    });
    if (this.activeFile) {
      contentEl.createDiv({
        text: this.plugin.t("ingestionContextNote", { path: this.activeFile.path }),
        cls: "suggestion-meta"
      });
    }
    if (this.inlineError) {
      contentEl.createDiv({ text: this.inlineError, cls: "lti-empty" });
    }
    if (this.result) {
      const resultCard = contentEl.createDiv({ cls: "lti-result-card" });
      resultCard.createDiv({ text: this.result.title, cls: "suggestion-title" });
      resultCard.createDiv({ text: this.result.notePath, cls: "suggestion-meta" });
      resultCard.createDiv({
        text: this.plugin.t("ingestionResultSummary", {
          sourceType: this.result.sourceType || this.sourceType,
          attachments: this.result.attachmentPaths.length
        }),
        cls: "suggestion-meta"
      });
      if (this.result.warnings.length > 0) {
        resultCard.createDiv({ text: this.plugin.t("ingestionWarningsTitle"), cls: "suggestion-meta" });
        for (const warning of this.result.warnings) {
          resultCard.createDiv({ text: warning, cls: "suggestion-preview" });
        }
      }
      const resultActions = resultCard.createDiv({ cls: "tag-manager-actions" });
      const openButton = resultActions.createEl("button", { text: this.plugin.t("ingestionOpen"), cls: "lti-inline-button" });
      openButton.addEventListener("click", () => this.plugin.openResolvedPath(this.result?.notePath ?? ""));
      const insertButton = resultActions.createEl("button", { text: this.plugin.t("ingestionInsert"), cls: "lti-inline-button" });
      insertButton.addEventListener("click", () => this.plugin.insertLinkFromPath(this.result?.notePath ?? ""));
    }
    const actions = contentEl.createDiv({ cls: "lti-modal-actions" });
    new import_obsidian7.ButtonComponent(actions).setButtonText(this.plugin.t("ingestionRun")).setCta().onClick(() => {
      void this.submit();
    });
    new import_obsidian7.ButtonComponent(actions).setButtonText(this.plugin.t("cancel")).onClick(() => this.close());
  }
  sourcePlaceholder() {
    if (this.sourceType === "arxiv") {
      return this.plugin.t("ingestionArxivPlaceholder");
    }
    if (this.sourceType === "pdf") {
      return this.plugin.t("ingestionPdfPlaceholder");
    }
    return this.plugin.t("ingestionDoiPlaceholder");
  }
  async submit() {
    const request = {
      sourceType: this.sourceType,
      source: this.source.trim(),
      metadataDoi: this.metadataDoi.trim(),
      metadataArxiv: this.metadataArxiv.trim(),
      title: this.titleOverride.trim(),
      authors: this.authorsOverride.trim(),
      year: this.yearOverride.trim(),
      downloadPdf: this.downloadPdf
    };
    try {
      this.result = await this.plugin.runResearchIngestion(request);
      this.inlineError = "";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.inlineError = this.plugin.ingestionErrorToMessage(message);
      this.result = null;
    }
    this.render();
  }
};
var SemanticSearchModal = class extends import_obsidian7.Modal {
  constructor(plugin) {
    super(plugin.app);
    this.results = [];
    this.plugin = plugin;
    this.activeFile = plugin.getContextNoteFile();
    this.initialQuery = plugin.getContextSelection();
  }
  onOpen() {
    this.render();
  }
  render(resultsError) {
    const { contentEl } = this;
    contentEl.empty();
    renderModalHeader(contentEl, this.plugin.t("semanticSearch"), this.plugin.t("modalSemanticDescription"));
    const form = contentEl.createDiv({ cls: "lti-form" });
    const input = form.createEl("input", {
      type: "text",
      value: this.initialQuery,
      placeholder: this.plugin.t("query")
    });
    const searchButton = form.createEl("button", { text: this.plugin.t("semanticSearch"), cls: "lti-action-button" });
    searchButton.addEventListener("click", () => {
      runModalTask(async () => {
        try {
          this.results = await runSemanticSearch(
            this.plugin.app,
            this.plugin.settings,
            input.value.trim(),
            this.activeFile,
            this.plugin.getContextSelection()
          );
          if (this.results.length === 0) {
            this.render(this.plugin.t("semanticNoResults"));
            return;
          }
          this.render();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.render(this.plugin.semanticErrorToMessage(message));
        }
      });
    });
    if (resultsError) {
      contentEl.createDiv({ text: resultsError, cls: "lti-empty" });
    }
    const resultsContainer = contentEl.createDiv();
    for (const result of this.results) {
      const card = resultsContainer.createDiv({ cls: "lti-result-card" });
      card.createEl("div", { text: result.title, cls: "suggestion-title" });
      card.createDiv({ text: result.path, cls: "suggestion-meta" });
      const researchSummary = this.plugin.formatResearchMetadataSummary({
        citekey: result.citekey,
        author: result.author,
        year: result.year,
        locator: result.page,
        sourceType: result.source_type,
        evidenceKind: result.evidence_kind
      });
      if (researchSummary) {
        card.createDiv({ text: researchSummary, cls: "suggestion-meta" });
      }
      if (result.reason) {
        card.createDiv({ text: `${this.plugin.t("reason")}: ${result.reason}`, cls: "suggestion-meta" });
      }
      card.createDiv({ text: `${this.plugin.t("semanticScore")}: ${result.score}`, cls: "suggestion-meta" });
      if (result.suggested_tags.length > 0) {
        card.createDiv({ text: `${this.plugin.t("tags")}: ${result.suggested_tags.join(", ")}`, cls: "suggestion-meta" });
      }
      const relationSummary = this.plugin.formatSuggestedRelationSummary(result.suggested_relations);
      if (relationSummary) {
        card.createDiv({ text: `${this.plugin.t("relations")}: ${relationSummary}`, cls: "suggestion-meta" });
      }
      if (result.excerpt) {
        card.createDiv({ text: result.excerpt, cls: "suggestion-preview" });
      }
      const actions = card.createDiv({ cls: "tag-manager-actions" });
      const openButton = actions.createEl("button", { text: this.plugin.t("semanticOpen"), cls: "lti-inline-button" });
      openButton.addEventListener("click", () => this.plugin.openResolvedPath(result.path));
      const insertButton = actions.createEl("button", { text: this.plugin.t("semanticInsert"), cls: "lti-inline-button" });
      insertButton.addEventListener("click", () => this.plugin.insertLinkFromPath(result.path));
    }
  }
};

// src/companion-plugins.ts
var ZOTERO_ID = "obsidian-zotero-desktop-connector";
var PDF_PLUS_ID = "pdf-plus";
var SMART_CONNECTIONS_ID = "smart-connections";
var SEMANTIC_BRIDGE_ID = "semantic-bridge";
var SMART_CONNECTIONS_CONFIG_PATH = `.smart-env/smart_env.json`;
var ZOTERO_EXPORT_FORMAT_NAME = "Research literature note";
var ZOTERO_CITE_FORMAT_NAME = "Insert literature note link";
var ZOTERO_CITE_TEMPLATE = "[[{{citekey}}]]";
var REQUIRED_PDF_DISPLAY_FORMATS = [
  {
    name: "Title & page",
    template: "{{file.basename}}, p.{{pageLabel}}"
  },
  {
    name: "Page",
    template: "p.{{pageLabel}}"
  },
  {
    name: "Text",
    template: "{{text}}"
  }
];
var REQUIRED_PDF_COPY_COMMANDS = [
  {
    name: "Literature quote",
    template: "> [!quote] {{linkWithDisplay}}\n> {{text}}\n"
  },
  {
    name: "Evidence callout",
    template: "> [!cite] {{linkWithDisplay}}\n> {{text}}\n"
  },
  {
    name: "Source link",
    template: "{{linkWithDisplay}}"
  }
];
function normalizeVaultPath(path) {
  return path.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\.\//, "").replace(/\/$/, "").trim();
}
function configPath(app, ...segments) {
  return normalizeVaultPath([app.vault.configDir, ...segments].join("/"));
}
function pluginDataPath(app, pluginId) {
  return configPath(app, "plugins", pluginId, "data.json");
}
function pluginManifestPath(app, pluginId) {
  return configPath(app, "plugins", pluginId, "manifest.json");
}
function ensureString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function ensureNumber(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}
function ensureBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}
function toRecord(value) {
  return value && typeof value === "object" ? value : {};
}
function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}
function stringifyJson(data) {
  return JSON.stringify(data, null, 2);
}
async function pathExists(app, path) {
  const adapter = app.vault.adapter;
  if (typeof adapter.exists === "function") {
    return adapter.exists(path);
  }
  if (typeof adapter.read === "function") {
    try {
      await adapter.read(path);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
async function ensureParentDirectory(app, filePath) {
  const adapter = app.vault.adapter;
  if (typeof adapter.mkdir !== "function") {
    return;
  }
  const parts = normalizeVaultPath(filePath).split("/").slice(0, -1);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const exists = typeof adapter.exists === "function" ? await adapter.exists(current) : true;
    if (!exists) {
      try {
        await adapter.mkdir(current);
      } catch {
      }
    }
  }
}
async function readJson(app, path) {
  if (!await pathExists(app, path)) {
    return {};
  }
  const raw = await app.vault.adapter.read(path);
  try {
    return toRecord(JSON.parse(raw));
  } catch {
    return {};
  }
}
async function writeJson(app, path, data) {
  await ensureParentDirectory(app, path);
  await app.vault.adapter.write(path, stringifyJson(data));
}
function findNamedEntry(items, name) {
  return items.find((item) => ensureString(item.name) === name) ?? null;
}
function upsertNamedEntries(current, required) {
  const requiredMap = new Map(required.map((item) => [item.name, item]));
  const remaining = current.filter((item) => !requiredMap.has(item.name));
  return [...required, ...remaining];
}
function mergeMenuConfig(current, required) {
  const seen = /* @__PURE__ */ new Set();
  const merged = [];
  for (const item of [...current, ...required]) {
    const key = item.trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(key);
  }
  return merged;
}
function normalizeDelimitedList(input) {
  const seen = /* @__PURE__ */ new Set();
  const items = [];
  for (const raw of input.split(/[\n,]/)) {
    const normalized = normalizeVaultPath(raw);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push(normalized);
  }
  return items;
}
function sameNormalizedList(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  const leftKeys = [...left].map((item) => item.toLowerCase()).sort();
  const rightKeys = [...right].map((item) => item.toLowerCase()).sort();
  return leftKeys.every((value, index) => value === rightKeys[index]);
}
function includesAll(haystack, needles) {
  const available = new Set(haystack.map((item) => item.toLowerCase()));
  return needles.every((item) => available.has(item.toLowerCase()));
}
function buildResearchWorkbenchProfile(settings, language) {
  return {
    language,
    literatureFolder: normalizeVaultPath(settings.researchLiteratureFolder),
    templatePath: normalizeVaultPath(settings.researchTemplatePath),
    attachmentsFolder: normalizeVaultPath(settings.researchAttachmentsFolder),
    openNoteAfterImport: settings.researchOpenNoteAfterImport,
    smartFolderExclusions: normalizeDelimitedList(settings.smartConnectionsFolderExclusions),
    smartHeadingExclusions: normalizeDelimitedList(settings.smartConnectionsHeadingExclusions),
    smartResultsLimit: Math.max(5, settings.smartConnectionsResultsLimit),
    semanticEnabled: settings.semanticBridgeEnabled,
    semanticCommand: settings.semanticCommand.trim(),
    semanticTimeoutMs: settings.semanticTimeoutMs
  };
}
function buildRecommendedZoteroConfig(profile) {
  return {
    noteImportFolder: profile.literatureFolder,
    citeSuggestTemplate: ZOTERO_CITE_TEMPLATE,
    openNoteAfterImport: profile.openNoteAfterImport,
    whichNotesToOpenAfterImport: "last-imported-note",
    exportFormats: [
      {
        name: ZOTERO_EXPORT_FORMAT_NAME,
        outputPathTemplate: `${profile.literatureFolder}/{{citekey}}.md`,
        imageOutputPathTemplate: `${profile.attachmentsFolder}/{{citekey}}`,
        imageBaseNameTemplate: "{{citekey}}",
        templatePath: profile.templatePath,
        cslStyle: "apa"
      }
    ],
    citeFormats: [
      {
        name: ZOTERO_CITE_FORMAT_NAME,
        outputFormat: "markdown",
        formatAs: "single",
        format: "template",
        template: ZOTERO_CITE_TEMPLATE
      }
    ]
  };
}
function buildRecommendedPdfConfig() {
  return {
    displayTextFormats: REQUIRED_PDF_DISPLAY_FORMATS,
    defaultDisplayTextFormatIndex: 0,
    syncDisplayTextFormat: true,
    highlightBacklinks: true,
    hoverHighlightAction: "preview",
    selectionProductMenuConfig: ["copy-format", "display"],
    annotationProductMenuConfig: ["copy-format", "display"],
    copyCommands: REQUIRED_PDF_COPY_COMMANDS
  };
}
function extractZoteroActual(config) {
  const exportFormat = findNamedEntry(ensureArray(config.exportFormats), ZOTERO_EXPORT_FORMAT_NAME);
  return {
    literatureFolder: ensureString(config.noteImportFolder),
    templatePath: ensureString(exportFormat?.templatePath),
    attachmentsFolder: ensureString(exportFormat?.imageOutputPathTemplate).replace(/\/\{\{citekey\}\}$/, ""),
    openNoteAfterImport: ensureBoolean(config.openNoteAfterImport, true)
  };
}
function extractPdfActual(config) {
  const displayFormats = ensureArray(config.displayTextFormats);
  const defaultDisplayIndex = ensureNumber(config.defaultDisplayTextFormatIndex, 0);
  const defaultDisplay = displayFormats[defaultDisplayIndex];
  return {
    defaultDisplayFormat: ensureString(defaultDisplay?.name),
    copyCommandNames: ensureArray(config.copyCommands).map((item) => ensureString(item.name)).filter(Boolean),
    hoverHighlightAction: ensureString(config.hoverHighlightAction),
    highlightBacklinks: ensureBoolean(config.highlightBacklinks),
    selectionProductMenuConfig: ensureArray(config.selectionProductMenuConfig).map(String),
    annotationProductMenuConfig: ensureArray(config.annotationProductMenuConfig).map(String)
  };
}
function extractSmartActual(config) {
  const smartSources = toRecord(config.smart_sources);
  const smartViewFilter = toRecord(config.smart_view_filter);
  const connectionLists = toRecord(config.connections_lists);
  return {
    language: ensureString(config.language),
    folderExclusions: normalizeDelimitedList(ensureString(smartSources.folder_exclusions)),
    headingExclusions: normalizeDelimitedList(ensureString(smartSources.excluded_headings)),
    resultsLimit: ensureNumber(connectionLists.results_limit, 20),
    renderMarkdown: ensureBoolean(smartViewFilter.render_markdown, true)
  };
}
function diffZoteroConfig(actualConfig, profile) {
  const actual = extractZoteroActual(actualConfig);
  const exportFormat = findNamedEntry(ensureArray(actualConfig.exportFormats), ZOTERO_EXPORT_FORMAT_NAME);
  const citeFormat = findNamedEntry(ensureArray(actualConfig.citeFormats), ZOTERO_CITE_FORMAT_NAME);
  const mismatches = [];
  if (actual.literatureFolder !== profile.literatureFolder) {
    mismatches.push("zotero-folder");
  }
  if (actual.templatePath !== profile.templatePath) {
    mismatches.push("zotero-template");
  }
  if (actual.attachmentsFolder !== profile.attachmentsFolder) {
    mismatches.push("zotero-attachments");
  }
  if (actual.openNoteAfterImport !== profile.openNoteAfterImport) {
    mismatches.push("zotero-open-note");
  }
  if (ensureString(exportFormat?.outputPathTemplate) !== `${profile.literatureFolder}/{{citekey}}.md`) {
    mismatches.push("zotero-output-template");
  }
  if (ensureString(citeFormat?.template) !== ZOTERO_CITE_TEMPLATE) {
    mismatches.push("zotero-cite-template");
  }
  return mismatches;
}
function diffPdfConfig(actualConfig) {
  const actual = extractPdfActual(actualConfig);
  const displayFormats = ensureArray(actualConfig.displayTextFormats);
  const displayFormatNames = displayFormats.map((item) => ensureString(item.name)).filter(Boolean);
  const copyCommandNames = ensureArray(actualConfig.copyCommands).map((item) => ensureString(item.name)).filter(Boolean);
  const mismatches = [];
  if (!includesAll(displayFormatNames, REQUIRED_PDF_DISPLAY_FORMATS.map((item) => item.name))) {
    mismatches.push("pdf-display-formats");
  }
  if (actual.defaultDisplayFormat !== "Title & page") {
    mismatches.push("pdf-default-display");
  }
  if (!includesAll(copyCommandNames, REQUIRED_PDF_COPY_COMMANDS.map((item) => item.name))) {
    mismatches.push("pdf-copy-commands");
  }
  if (actual.hoverHighlightAction !== "preview") {
    mismatches.push("pdf-hover-preview");
  }
  if (actual.highlightBacklinks !== true) {
    mismatches.push("pdf-highlight-backlinks");
  }
  if (!includesAll(ensureArray(actual.selectionProductMenuConfig), ["copy-format", "display"])) {
    mismatches.push("pdf-selection-menu");
  }
  if (!includesAll(ensureArray(actual.annotationProductMenuConfig), ["copy-format", "display"])) {
    mismatches.push("pdf-annotation-menu");
  }
  return mismatches;
}
function diffSmartConnectionsConfig(actualConfig, profile) {
  const actual = extractSmartActual(actualConfig);
  const mismatches = [];
  if (actual.language !== profile.language) {
    mismatches.push("smart-language");
  }
  if (!sameNormalizedList(ensureArray(actual.folderExclusions), profile.smartFolderExclusions)) {
    mismatches.push("smart-folder-exclusions");
  }
  if (!sameNormalizedList(ensureArray(actual.headingExclusions), profile.smartHeadingExclusions)) {
    mismatches.push("smart-heading-exclusions");
  }
  if (actual.resultsLimit !== profile.smartResultsLimit) {
    mismatches.push("smart-results-limit");
  }
  if (actual.renderMarkdown !== true) {
    mismatches.push("smart-render-markdown");
  }
  return mismatches;
}
function buildSemanticStatus(profile) {
  const mismatches = [];
  if (profile.semanticEnabled && !profile.semanticCommand) {
    mismatches.push("semantic-command");
  }
  return {
    id: SEMANTIC_BRIDGE_ID,
    installed: true,
    enabled: profile.semanticEnabled,
    ready: !profile.semanticEnabled || mismatches.length === 0,
    optional: true,
    configPath: null,
    mismatches,
    actual: {
      enabled: profile.semanticEnabled,
      command: profile.semanticCommand,
      timeoutMs: profile.semanticTimeoutMs
    }
  };
}
async function readResearchWorkbenchState(app, profile) {
  const enabledPluginRaw = await app.vault.adapter.read(configPath(app, "community-plugins.json")).catch(() => "[]");
  const zoteroConfigPath = pluginDataPath(app, ZOTERO_ID);
  const pdfConfigPath = pluginDataPath(app, PDF_PLUS_ID);
  const smartConfigPath = SMART_CONNECTIONS_CONFIG_PATH;
  let enabledPluginIds = [];
  try {
    const parsed = JSON.parse(enabledPluginRaw);
    enabledPluginIds = Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    enabledPluginIds = [];
  }
  const zoteroInstalled = await pathExists(app, pluginManifestPath(app, ZOTERO_ID));
  const zoteroConfig = await readJson(app, zoteroConfigPath);
  const zoteroStatus = {
    id: ZOTERO_ID,
    installed: zoteroInstalled,
    enabled: enabledPluginIds.includes(ZOTERO_ID),
    ready: zoteroInstalled && enabledPluginIds.includes(ZOTERO_ID) && diffZoteroConfig(zoteroConfig, profile).length === 0,
    optional: true,
    configPath: zoteroConfigPath,
    mismatches: diffZoteroConfig(zoteroConfig, profile),
    actual: extractZoteroActual(zoteroConfig)
  };
  const pdfInstalled = await pathExists(app, pluginManifestPath(app, PDF_PLUS_ID));
  const pdfConfig = await readJson(app, pdfConfigPath);
  const pdfStatus = {
    id: PDF_PLUS_ID,
    installed: pdfInstalled,
    enabled: enabledPluginIds.includes(PDF_PLUS_ID),
    ready: pdfInstalled && enabledPluginIds.includes(PDF_PLUS_ID) && diffPdfConfig(pdfConfig).length === 0,
    optional: false,
    configPath: pdfConfigPath,
    mismatches: diffPdfConfig(pdfConfig),
    actual: extractPdfActual(pdfConfig)
  };
  const smartInstalled = await pathExists(app, pluginManifestPath(app, SMART_CONNECTIONS_ID));
  const smartConfig = await readJson(app, smartConfigPath);
  const smartStatus = {
    id: SMART_CONNECTIONS_ID,
    installed: smartInstalled,
    enabled: enabledPluginIds.includes(SMART_CONNECTIONS_ID),
    ready: smartInstalled && enabledPluginIds.includes(SMART_CONNECTIONS_ID) && diffSmartConnectionsConfig(smartConfig, profile).length === 0,
    optional: false,
    configPath: smartConfigPath,
    mismatches: diffSmartConnectionsConfig(smartConfig, profile),
    actual: extractSmartActual(smartConfig)
  };
  return {
    profile,
    enabledPluginIds,
    companions: [
      zoteroStatus,
      pdfStatus,
      smartStatus,
      buildSemanticStatus(profile)
    ]
  };
}
async function applyCompanionPresetToVault(app, id, profile) {
  if (id === ZOTERO_ID) {
    const zoteroConfigPath = pluginDataPath(app, ZOTERO_ID);
    const current2 = await readJson(app, zoteroConfigPath);
    const recommended = buildRecommendedZoteroConfig(profile);
    const exportFormats = upsertNamedEntries(
      ensureArray(current2.exportFormats).map((item) => ({ ...item, name: ensureString(item.name) })),
      ensureArray(recommended.exportFormats).map((item) => ({ ...item, name: ensureString(item.name) }))
    );
    const citeFormats = upsertNamedEntries(
      ensureArray(current2.citeFormats).map((item) => ({ ...item, name: ensureString(item.name) })),
      ensureArray(recommended.citeFormats).map((item) => ({ ...item, name: ensureString(item.name) }))
    );
    const next2 = {
      ...current2,
      noteImportFolder: recommended.noteImportFolder,
      citeSuggestTemplate: recommended.citeSuggestTemplate,
      openNoteAfterImport: recommended.openNoteAfterImport,
      whichNotesToOpenAfterImport: recommended.whichNotesToOpenAfterImport,
      exportFormats,
      citeFormats
    };
    await writeJson(app, zoteroConfigPath, next2);
    return;
  }
  if (id === PDF_PLUS_ID) {
    const pdfConfigPath = pluginDataPath(app, PDF_PLUS_ID);
    const current2 = await readJson(app, pdfConfigPath);
    const recommended = buildRecommendedPdfConfig();
    const next2 = {
      ...current2,
      displayTextFormats: upsertNamedEntries(
        ensureArray(current2.displayTextFormats).map((item) => ({ ...item, name: ensureString(item.name) })),
        ensureArray(recommended.displayTextFormats).map((item) => ({ ...item, name: ensureString(item.name) }))
      ),
      copyCommands: upsertNamedEntries(
        ensureArray(current2.copyCommands).map((item) => ({ ...item, name: ensureString(item.name) })),
        ensureArray(recommended.copyCommands).map((item) => ({ ...item, name: ensureString(item.name) }))
      ),
      defaultDisplayTextFormatIndex: 0,
      syncDisplayTextFormat: true,
      highlightBacklinks: true,
      hoverHighlightAction: "preview",
      selectionProductMenuConfig: mergeMenuConfig(
        ensureArray(current2.selectionProductMenuConfig).map(String),
        ensureArray(recommended.selectionProductMenuConfig).map(String)
      ),
      annotationProductMenuConfig: mergeMenuConfig(
        ensureArray(current2.annotationProductMenuConfig).map(String),
        ensureArray(recommended.annotationProductMenuConfig).map(String)
      )
    };
    await writeJson(app, pdfConfigPath, next2);
    return;
  }
  const current = await readJson(app, SMART_CONNECTIONS_CONFIG_PATH);
  const smartSources = toRecord(current.smart_sources);
  const smartViewFilter = toRecord(current.smart_view_filter);
  const connectionLists = toRecord(current.connections_lists);
  const next = {
    ...current,
    language: profile.language,
    smart_sources: {
      ...smartSources,
      excluded_headings: profile.smartHeadingExclusions.join(","),
      folder_exclusions: profile.smartFolderExclusions.join(",")
    },
    smart_view_filter: {
      ...smartViewFilter,
      render_markdown: true
    },
    connections_lists: {
      ...connectionLists,
      results_limit: profile.smartResultsLimit
    }
  };
  await writeJson(app, SMART_CONNECTIONS_CONFIG_PATH, next);
}

// src/reference-preview.ts
function clamp2(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
var _ReferencePreviewPopover = class _ReferencePreviewPopover {
  constructor() {
    this.rootEl = null;
    this.kindEl = null;
    this.locationEl = null;
    this.titleEl = null;
    this.pathEl = null;
    this.snippetEl = null;
    this.hideTimer = null;
    this.activeAnchor = null;
    this.onHide = null;
    this.repositionHandler = () => {
      if (this.rootEl && this.activeAnchor) {
        this.position(this.activeAnchor);
      }
    };
  }
  setOnHide(handler) {
    this.onHide = handler;
  }
  show(anchor, data) {
    this.ensureRoot();
    this.cleanupDuplicateRoots();
    this.cancelHide();
    this.activeAnchor = anchor;
    if (!this.rootEl || !this.kindEl || !this.locationEl || !this.titleEl || !this.pathEl || !this.snippetEl) {
      return;
    }
    this.rootEl.classList.toggle("is-missing", data.missing === true);
    this.kindEl.textContent = data.location ? `${data.kindLabel} \xB7 ${data.location}` : data.kindLabel;
    this.locationEl.textContent = "";
    this.locationEl.hidden = true;
    this.titleEl.textContent = data.title;
    this.pathEl.textContent = data.path;
    this.pathEl.hidden = !data.path;
    this.snippetEl.textContent = data.snippet;
    this.rootEl.hidden = false;
    this.rootEl.setAttribute("aria-hidden", "false");
    this.position(anchor);
    window.requestAnimationFrame(() => {
      if (this.rootEl && this.activeAnchor === anchor && !this.rootEl.hidden) {
        this.position(anchor);
      }
    });
    window.addEventListener("scroll", this.repositionHandler, true);
    window.addEventListener("resize", this.repositionHandler);
  }
  scheduleHide(delay = 140) {
    this.cancelHide();
    this.hideTimer = window.setTimeout(() => this.hide(true), delay);
  }
  cancelHide() {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }
  hide(immediate = false) {
    this.cancelHide();
    const hadAnchor = this.activeAnchor !== null;
    this.activeAnchor = null;
    if (!this.rootEl) {
      return;
    }
    this.rootEl.hidden = true;
    this.rootEl.setAttribute("aria-hidden", "true");
    if (immediate) {
      window.removeEventListener("scroll", this.repositionHandler, true);
      window.removeEventListener("resize", this.repositionHandler);
    }
    if (hadAnchor) {
      this.onHide?.();
    }
  }
  destroy() {
    this.hide(true);
    this.rootEl?.remove();
    this.rootEl = null;
    this.kindEl = null;
    this.locationEl = null;
    this.titleEl = null;
    this.pathEl = null;
    this.snippetEl = null;
  }
  ensureRoot() {
    if (this.rootEl) {
      return;
    }
    for (const existing of Array.from(document.querySelectorAll(_ReferencePreviewPopover.ROOT_SELECTOR))) {
      existing.remove();
    }
    const root = document.createElement("div");
    root.className = "lti-hover-preview";
    root.id = "lti-hover-preview-root";
    root.hidden = true;
    root.setAttribute("aria-hidden", "true");
    const head = document.createElement("div");
    head.className = "lti-hover-preview-head";
    const kind = document.createElement("span");
    kind.className = "lti-hover-preview-kind";
    head.append(kind);
    const location = document.createElement("span");
    location.className = "lti-hover-preview-location";
    head.append(location);
    const title = document.createElement("div");
    title.className = "lti-hover-preview-title";
    const path = document.createElement("div");
    path.className = "lti-hover-preview-path";
    const snippet = document.createElement("pre");
    snippet.className = "lti-hover-preview-snippet";
    root.append(head, title, path, snippet);
    root.addEventListener("mouseenter", () => this.cancelHide());
    root.addEventListener("mouseleave", () => this.scheduleHide());
    document.body.appendChild(root);
    this.rootEl = root;
    this.kindEl = kind;
    this.locationEl = location;
    this.titleEl = title;
    this.pathEl = path;
    this.snippetEl = snippet;
  }
  cleanupDuplicateRoots() {
    for (const existing of Array.from(document.querySelectorAll(_ReferencePreviewPopover.ROOT_SELECTOR))) {
      if (existing !== this.rootEl) {
        existing.remove();
      }
    }
  }
  position(anchor) {
    if (!this.rootEl) {
      return;
    }
    const gap = 10;
    const margin = 12;
    const safeTop = 20;
    const anchorRect = anchor.getBoundingClientRect();
    this.rootEl.setCssProps({
      "--lti-preview-left": "0px",
      "--lti-preview-top": "0px",
      "--lti-preview-max-width": `min(28rem, calc(100vw - ${margin * 2}px))`,
      "--lti-preview-max-height": `calc(100vh - ${margin * 2}px)`
    });
    const previewRect = this.rootEl.getBoundingClientRect();
    const left = clamp2(anchorRect.left, margin, window.innerWidth - previewRect.width - margin);
    const availableHeight = Math.max(160, window.innerHeight - margin * 2);
    const previewHeight = Math.min(previewRect.height, availableHeight);
    const spaceAbove = anchorRect.top - safeTop;
    const spaceBelow = window.innerHeight - anchorRect.bottom - margin;
    const canPlaceAbove = spaceAbove >= previewHeight + gap;
    const canPlaceBelow = spaceBelow >= previewHeight + gap;
    let top;
    if (canPlaceBelow) {
      top = anchorRect.bottom + gap;
    } else if (canPlaceAbove) {
      top = anchorRect.top - previewHeight - gap;
    } else if (spaceBelow >= spaceAbove) {
      top = anchorRect.bottom + gap;
    } else {
      top = anchorRect.top - previewHeight - gap;
    }
    top = clamp2(top, safeTop, window.innerHeight - previewHeight - margin);
    this.rootEl.setCssProps({
      "--lti-preview-left": `${left}px`,
      "--lti-preview-top": `${top}px`
    });
  }
};
_ReferencePreviewPopover.ROOT_SELECTOR = ".lti-hover-preview";
var ReferencePreviewPopover = _ReferencePreviewPopover;

// src/reading-hover-controller.ts
var import_obsidian8 = require("obsidian");
var controllerMap = /* @__PURE__ */ new WeakMap();
function buildReadingHoverContent(doc, data) {
  const root = doc.createElement("div");
  root.className = "lti-reading-hover-content";
  const head = doc.createElement("div");
  head.className = "lti-reading-hover-head";
  const kind = doc.createElement("span");
  kind.className = "lti-reading-hover-kind";
  kind.textContent = data.location ? `${data.kindLabel} \xB7 ${data.location}` : data.kindLabel;
  head.append(kind);
  root.append(head);
  const title = doc.createElement("div");
  title.className = "lti-reading-hover-title";
  title.textContent = data.title;
  root.append(title);
  if (data.path) {
    const path = doc.createElement("div");
    path.className = "lti-reading-hover-path";
    path.textContent = data.path;
    root.append(path);
  }
  const snippet = doc.createElement("pre");
  snippet.className = "lti-reading-hover-snippet";
  snippet.textContent = data.snippet;
  root.append(snippet);
  return root;
}
function resolveFallbackHost(containerEl) {
  return containerEl.closest(".markdown-preview-view") ?? containerEl.closest(".markdown-rendered") ?? containerEl.closest(".workspace-leaf-content") ?? containerEl;
}
function findMarkdownView(app, containerEl) {
  const activeView = app.workspace.getActiveViewOfType(import_obsidian8.MarkdownView);
  const views = [];
  if (activeView) {
    views.push(activeView);
  }
  for (const leaf of app.workspace.getLeavesOfType("markdown")) {
    const view = leaf.view;
    if (view instanceof import_obsidian8.MarkdownView && !views.includes(view)) {
      views.push(view);
    }
  }
  for (const view of views) {
    if (view.previewMode?.containerEl?.contains(containerEl) || view.containerEl.contains(containerEl)) {
      return view;
    }
  }
  return views[0] ?? null;
}
function resolveHoverHost(app, containerEl) {
  const markdownView = findMarkdownView(app, containerEl);
  if (!markdownView) {
    return {
      hostEl: resolveFallbackHost(containerEl),
      hoverParent: null
    };
  }
  const hoverParent = markdownView.previewMode ?? markdownView;
  return {
    hostEl: containerEl.closest(".markdown-preview-view") ?? markdownView.previewMode?.containerEl ?? markdownView.containerEl,
    hoverParent
  };
}
var LegacyReadingHoverController = class extends import_obsidian8.MarkdownRenderChild {
  constructor(app, hostEl, sentinelEl, hoverParent, getPreviewData) {
    super(sentinelEl);
    this.popover = null;
    this.fallbackEl = null;
    this.hideTimer = null;
    this.previewToken = 0;
    this.handlePopoverEnter = () => this.cancelHide();
    this.handlePopoverLeave = () => this.scheduleHide();
    this.app = app;
    this.hostEl = hostEl;
    this.hoverParent = hoverParent;
    this.getPreviewData = getPreviewData;
    this.win = hostEl.ownerDocument.defaultView ?? window;
  }
  async show(anchor, options) {
    const token = ++this.previewToken;
    this.cancelHide();
    debugLog(this.app, "reading.hover.show-request", {
      token,
      target: options.target,
      sourcePath: options.sourcePath,
      kind: options.kind,
      startLine: options.startLine,
      endLine: options.endLine,
      hoverParentType: this.hoverParent?.constructor?.name ?? "null",
      anchorClass: anchor.className
    });
    const data = await this.getPreviewData(options);
    if (token !== this.previewToken || !anchor.isConnected) {
      debugLog(this.app, "reading.hover.show-abort", {
        token,
        currentToken: this.previewToken,
        anchorConnected: anchor.isConnected,
        target: options.target
      });
      return;
    }
    if (this.hoverParent) {
      const popover = this.ensurePopover(anchor);
      const hoverEl = popover.hoverEl;
      hoverEl.classList.add("lti-reading-hover-popover");
      hoverEl.classList.toggle("is-missing", data.missing === true);
      hoverEl.replaceChildren(buildReadingHoverContent(anchor.ownerDocument, data));
      debugLog(this.app, "reading.hover.show-commit", {
        token,
        target: options.target,
        hoverElClass: hoverEl.className,
        parentHoverPopoverMatches: this.hoverParent.hoverPopover === popover,
        snippetPreview: data.snippet.slice(0, 120)
      });
    } else {
      this.showFallbackPopover(anchor, data);
      debugLog(this.app, "reading.hover.show-fallback", {
        token,
        target: options.target,
        snippetPreview: data.snippet.slice(0, 120)
      });
    }
  }
  cancelHide() {
    if (this.hideTimer !== null) {
      this.win.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }
  scheduleHide(delay = 140) {
    this.cancelHide();
    debugLog(this.app, "reading.hover.schedule-hide", {
      delay,
      token: this.previewToken
    });
    this.hideTimer = this.win.setTimeout(() => {
      this.previewToken += 1;
      this.hide();
    }, delay);
  }
  onunload() {
    this.previewToken += 1;
    this.cancelHide();
    this.hide();
    controllerMap.delete(this.hostEl);
    this.containerEl.remove();
  }
  ensurePopover(anchor) {
    debugLog(this.app, "reading.hover.ensure-popover", {
      hadExistingPopover: Boolean(this.popover),
      parentExistingPopover: Boolean(this.hoverParent?.hoverPopover),
      hoverParentType: this.hoverParent?.constructor?.name ?? "unknown",
      targetClass: anchor.className
    });
    this.destroyPopover();
    const popover = new import_obsidian8.HoverPopover(this.hoverParent, anchor, 0);
    popover.hoverEl.addEventListener("mouseenter", this.handlePopoverEnter);
    popover.hoverEl.addEventListener("mouseleave", this.handlePopoverLeave);
    this.popover = popover;
    return popover;
  }
  showFallbackPopover(anchor, data) {
    this.destroyFallbackPopover();
    const doc = anchor.ownerDocument;
    const el = doc.createElement("div");
    el.className = "lti-reading-hover-popover lti-fallback-popover";
    el.classList.toggle("is-missing", data.missing === true);
    el.replaceChildren(buildReadingHoverContent(doc, data));
    el.addEventListener("mouseenter", this.handlePopoverEnter);
    el.addEventListener("mouseleave", this.handlePopoverLeave);
    doc.body.appendChild(el);
    this.fallbackEl = el;
    const gap = 8;
    const margin = 12;
    const rect = anchor.getBoundingClientRect();
    el.style.maxWidth = `min(28rem, calc(100vw - ${margin * 2}px))`;
    const elRect = el.getBoundingClientRect();
    const left = Math.min(rect.left, doc.documentElement.clientWidth - elRect.width - margin);
    const spaceBelow = doc.documentElement.clientHeight - rect.bottom - margin;
    const top = spaceBelow >= elRect.height + gap ? rect.bottom + gap : rect.top - elRect.height - gap;
    el.style.left = `${Math.max(margin, left)}px`;
    el.style.top = `${Math.max(margin, top)}px`;
  }
  destroyFallbackPopover() {
    if (!this.fallbackEl) {
      return;
    }
    this.fallbackEl.removeEventListener("mouseenter", this.handlePopoverEnter);
    this.fallbackEl.removeEventListener("mouseleave", this.handlePopoverLeave);
    this.fallbackEl.remove();
    this.fallbackEl = null;
  }
  hide() {
    debugLog(this.app, "reading.hover.hide", {
      token: this.previewToken
    });
    this.destroyPopover();
    this.destroyFallbackPopover();
  }
  destroyPopover() {
    if (!this.popover) {
      return;
    }
    this.popover.hoverEl.removeEventListener("mouseenter", this.handlePopoverEnter);
    this.popover.hoverEl.removeEventListener("mouseleave", this.handlePopoverLeave);
    this.popover.unload();
    debugLog(this.app, "reading.hover.destroy-popover", {
      hoverParentType: this.hoverParent?.constructor?.name ?? "null"
    });
    if (this.hoverParent?.hoverPopover === this.popover) {
      this.hoverParent.hoverPopover = null;
    }
    this.popover = null;
  }
};
function getReadingReferenceHoverController(app, containerEl, ctx, getPreviewData) {
  const { hostEl, hoverParent } = resolveHoverHost(app, containerEl);
  debugLog(app, "reading.hover.resolve-host", {
    sourcePath: ctx.sourcePath,
    hostClass: hostEl.className,
    hoverParentType: hoverParent?.constructor?.name ?? "null"
  });
  const existing = controllerMap.get(hostEl);
  if (existing) {
    debugLog(app, "reading.hover.controller-reuse", {
      sourcePath: ctx.sourcePath,
      hostClass: hostEl.className
    });
    return existing;
  }
  const sentinel = hostEl.ownerDocument.createElement("span");
  sentinel.className = "lti-reading-hover-sentinel";
  sentinel.hidden = true;
  hostEl.append(sentinel);
  const controller = new LegacyReadingHoverController(app, hostEl, sentinel, hoverParent, getPreviewData);
  controllerMap.set(hostEl, controller);
  ctx.addChild(controller);
  return controller;
}

// src/settings.ts
var import_obsidian9 = require("obsidian");
var LEGACY_RELATION_KEYS = ["related", "see_also", "parent", "child", "same_as"];
var RESEARCH_RELATION_KEYS = [
  "supports",
  "contradicts",
  "extends",
  "uses_method",
  "uses_dataset",
  "same_question",
  "evidence_for",
  "counterargument_to",
  "reviews",
  "inspired_by"
];
var RESEARCH_LITERATURE_PATH = "Knowledge/Research/Literature";
var RESEARCH_TEMPLATE_PATH = "Knowledge/Research/Templates/zotero-literature-note.md";
var RESEARCH_ATTACHMENTS_PATH = "Knowledge/Research/Attachments";
var STATIC_SMART_CONNECTIONS_EXCLUSIONS = [
  ".smart-env",
  "Archive/Imports",
  "Excalidraw",
  "note_reader"
];
var SMART_CONNECTIONS_HEADINGS = [
  "\u76EE\u5F55",
  "Contents",
  "\u53C2\u8003\u6587\u732E",
  "References",
  "Acknowledgements"
];
var DEFAULT_SMART_RESULTS_LIMIT = 20;
function normalizeConfigDir(configDir) {
  return configDir.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/\/$/, "").trim();
}
function buildSmartConnectionsExclusions(configDir) {
  const normalizedConfigDir = normalizeConfigDir(configDir);
  return normalizedConfigDir ? [normalizedConfigDir, ...STATIC_SMART_CONNECTIONS_EXCLUSIONS] : [...STATIC_SMART_CONNECTIONS_EXCLUSIONS];
}
var DEFAULT_TAG_FACET_MAP_TEXT = JSON.stringify(
  {
    topic: {
      "research-question": ["\u7814\u7A76\u95EE\u9898", "research question", "rq"],
      "literature-review": ["\u6587\u732E\u7EFC\u8FF0", "literature review"],
      "research-gap": ["\u7814\u7A76\u7A7A\u767D", "research gap"],
      "knowledge-synthesis": ["\u77E5\u8BC6\u7EFC\u5408", "synthesis"]
    },
    method: {
      experiment: ["\u5B9E\u9A8C", "experimental"],
      qualitative: ["\u5B9A\u6027\u7814\u7A76", "qualitative"],
      quantitative: ["\u5B9A\u91CF\u7814\u7A76", "quantitative"],
      "case-study": ["\u6848\u4F8B\u7814\u7A76", "case study"],
      "mixed-methods": ["\u6DF7\u5408\u65B9\u6CD5", "mixed methods"]
    },
    dataset: {
      survey: ["\u95EE\u5377", "survey"],
      corpus: ["\u8BED\u6599", "corpus"],
      interview: ["\u8BBF\u8C08", "interview"],
      "field-notes": ["\u7530\u91CE\u7B14\u8BB0", "field notes"]
    },
    theory: {
      framework: ["\u7406\u8BBA\u6846\u67B6", "framework"],
      model: ["\u6A21\u578B", "model"],
      proposition: ["\u547D\u9898", "proposition"]
    },
    status: {
      "to-read": ["\u5F85\u8BFB", "to read"],
      annotated: ["\u5DF2\u6279\u6CE8", "annotated"],
      cited: ["\u5DF2\u5F15\u7528", "cited"]
    },
    writing_stage: {
      outline: ["\u63D0\u7EB2", "outline"],
      draft: ["\u8349\u7A3F", "draft"],
      revision: ["\u4FEE\u8BA2", "revision"],
      final: ["\u5B9A\u7A3F", "final"]
    },
    source_kind: {
      "literature-note": ["\u6587\u732E\u7B14\u8BB0", "literature note", "paper note"],
      "source-note": ["\u6765\u6E90\u7B14\u8BB0", "source note"],
      "reading-note": ["\u9605\u8BFB\u7B14\u8BB0", "reading note"],
      "draft-note": ["\u5199\u4F5C\u8349\u7A3F", "draft note"]
    }
  },
  null,
  2
);
function buildDefaultSettings(configDir = "") {
  return {
    language: "system",
    workflowMode: "researcher",
    relationKeys: [...RESEARCH_RELATION_KEYS],
    tagAliasMapText: JSON.stringify(
      {
        "\u6587\u732E\u7B14\u8BB0": ["literature-note", "paper-note", "source-note"],
        "\u7814\u7A76\u95EE\u9898": ["research-question", "rq"],
        "\u5927\u8BED\u8A00\u6A21\u578B": ["llm", "large-language-model"],
        "\u624B\u51B2\u5496\u5561": ["pour-over", "coffee-brewing"],
        "\u6587\u732E\u7EFC\u8FF0": ["literature-review", "lit review"],
        "\u7814\u7A76\u7A7A\u767D": ["research gap"],
        "\u65B9\u6CD5\u8BBA": ["methodology", "framework"]
      },
      null,
      2
    ),
    tagFacetMapText: DEFAULT_TAG_FACET_MAP_TEXT,
    ingestionCommand: "",
    ingestionTimeoutMs: 6e4,
    semanticBridgeEnabled: false,
    semanticCommand: "",
    semanticTimeoutMs: 3e4,
    recentLinkMemorySize: 24,
    recentLinkTargets: [],
    researchLiteratureFolder: RESEARCH_LITERATURE_PATH,
    researchTemplatePath: RESEARCH_TEMPLATE_PATH,
    researchAttachmentsFolder: RESEARCH_ATTACHMENTS_PATH,
    researchOpenNoteAfterImport: true,
    smartConnectionsFolderExclusions: buildSmartConnectionsExclusions(configDir).join(", "),
    smartConnectionsHeadingExclusions: SMART_CONNECTIONS_HEADINGS.join(", "),
    smartConnectionsResultsLimit: DEFAULT_SMART_RESULTS_LIMIT
  };
}
var DEFAULT_SETTINGS = buildDefaultSettings();
var COMPANION_META = {
  "obsidian-zotero-desktop-connector": {
    name: "Zotero Integration",
    descriptionKey: "settingsCompanionZoteroDesc"
  },
  "pdf-plus": {
    name: "PDF++",
    descriptionKey: "settingsCompanionPdfDesc"
  },
  "smart-connections": {
    name: "Smart Connections",
    descriptionKey: "settingsCompanionSmartDesc"
  },
  "semantic-bridge": {
    name: "Semantic bridge",
    descriptionKey: "settingsCompanionSemanticDesc"
  }
};
var WORKBENCH_GUIDE = {
  zh: {
    localeLabel: "\u4E2D\u6587",
    overviewTitle: "\u7814\u7A76\u5DE5\u4F5C\u53F0\u603B\u89C8",
    overviewDescription: "\u9996\u9875\u540C\u65F6\u7ED9\u51FA\u4E2D\u82F1\u6587\u7814\u7A76\u6808\u8BF4\u660E\uFF0C\u4FBF\u4E8E\u6838\u5BF9 CLI-first \u91C7\u96C6\u3001\u8BC1\u636E\u63D0\u53D6\u548C\u8BED\u4E49\u53EC\u56DE\u7684\u804C\u8D23\u8FB9\u754C\u3002",
    lead: "\u8FD9\u4E2A\u9996\u9875\u662F\u7814\u7A76\u578B Obsidian \u5E93\u7684\u64CD\u4F5C\u603B\u89C8\u3002Link & Tag Intelligence \u8D1F\u8D23\u8FDE\u63A5\u6765\u6E90\u3001\u8BC1\u636E\u3001\u8BBA\u70B9\u3001\u5173\u7CFB\u952E\u548C\u4E2D\u82F1\u6587\u53D7\u63A7\u6807\u7B7E\uFF0C\u4E0D\u66FF\u4EE3 PDF \u9605\u8BFB\u5668\u3001\u53EF\u9009\u7684 Zotero \u9002\u914D\u5668\u6216\u5916\u90E8\u8BED\u4E49\u68C0\u7D22\u3002",
    bridgeLabel: "CLI-first \u91C7\u96C6\u57FA\u7EBF",
    bridgeValue: "\u4F18\u5148\u914D\u7F6E\u4E00\u4E2A shell JSON ingestion CLI\uFF0C\u7528 DOI\u3001arXiv \u6216 PDF \u76F4\u63A5\u751F\u6210\u6587\u732E\u7B14\u8BB0\uFF1BZotero \u53EA\u5728\u4F60\u5DF2\u6709\u6587\u5E93\u65F6\u4F5C\u4E3A\u53EF\u9009\u9002\u914D\u5668\u3002",
    stackTitle: "\u63A8\u8350\u7814\u7A76\u6808",
    stackItems: [
      "Research ingestion CLI\uFF1A\u7528 DOI\u3001arXiv \u6216 PDF \u8F93\u5165\u76F4\u63A5\u521B\u5EFA\u6587\u732E\u7B14\u8BB0\uFF0C\u5E76\u901A\u8FC7 stdout JSON \u56DE\u4F20\u7ED3\u679C\u3002",
      "PDF++\uFF1A\u628A\u5E26\u9875\u7801\u7684\u539F\u6587\u8BC1\u636E\u590D\u5236\u5230\u6587\u732E\u7B14\u8BB0\u6216\u5199\u4F5C\u8349\u7A3F\u91CC\u3002",
      "Link & Tag Intelligence\uFF1A\u8FDE\u63A5\u6765\u6E90\u3001\u8BC1\u636E\u3001\u8BBA\u70B9\u3001\u5173\u7CFB\u952E\u548C\u4E2D\u82F1\u6587\u53D7\u63A7\u6807\u7B7E\u3002",
      "Smart Connections / \u5916\u90E8\u8BED\u4E49\u6865\u63A5\uFF1A\u5728\u5199\u4F5C\u6216\u7EFC\u8FF0\u65F6\u8865\u5145\u53EC\u56DE\uFF0C\u4F46\u4E0D\u66FF\u4EE3\u7CBE\u786E\u5F15\u7528\u3002",
      "Zotero Integration + Better BibTeX\uFF1A\u53EA\u5728\u4F60\u9700\u8981\u5BFC\u5165\u73B0\u6709 Zotero \u6587\u5E93\u65F6\u4F7F\u7528\u3002"
    ],
    flowTitle: "\u5EFA\u8BAE\u5DE5\u4F5C\u6D41",
    flowItems: [
      "\u5148\u914D\u7F6E ingestion CLI\uFF0C\u5E76\u786E\u8BA4\u5B83\u80FD\u5904\u7406 DOI\u3001arXiv \u6216 PDF \u8F93\u5165\u3002",
      "\u5728 Obsidian \u4E2D\u8FD0\u884C CLI-first \u5BFC\u5165\uFF0C\u628A\u6587\u732E\u7B14\u8BB0\u5199\u5165\u7814\u7A76\u76EE\u5F55\u3002",
      "\u6253\u5F00 PDF\uFF0C\u7528 PDF++ \u590D\u5236\u5E26\u9875\u7801\u7684\u8BC1\u636E\u7247\u6BB5\u3002",
      "\u56DE\u5230\u672C\u63D2\u4EF6\u4FA7\u680F\uFF0C\u8865\u5173\u7CFB\u952E\u3001\u5F15\u7528\u5B9A\u4F4D\u548C\u4E2D\u82F1\u6587\u6807\u7B7E\u3002",
      "\u5199\u4F5C\u6216\u7EFC\u8FF0\u65F6\uFF0C\u518D\u6253\u5F00 Smart Connections \u6216\u5916\u90E8\u8BED\u4E49\u68C0\u7D22\u8865\u5145\u53EC\u56DE\u3002",
      "\u53EA\u6709\u5728\u9700\u8981\u5BFC\u5165\u65E7 Zotero \u6587\u5E93\u65F6\uFF0C\u518D\u4F7F\u7528 Zotero \u9002\u914D\u5668\u3002"
    ],
    troubleshootTitle: "\u5E38\u89C1\u95EE\u9898\u6392\u67E5",
    troubleshootBody: "\u5982\u679C CLI \u5BFC\u5165\u5931\u8D25\uFF0C\u4F18\u5148\u68C0\u67E5\u5BFC\u5165\u547D\u4EE4\u3001\u5360\u4F4D\u7B26\u3001\u7F51\u7EDC\u8BBF\u95EE\u548C PDF \u8DEF\u5F84\u3002\u53EA\u6709\u5728\u4F60\u542F\u7528\u4E86 Zotero \u9002\u914D\u5668\u65F6\uFF0CZotero \u684C\u9762\u7AEF\u548C Better BibTeX \u624D\u662F\u5FC5\u67E5\u9879\u3002",
    workflowTitle: "\u5DE5\u4F5C\u6D41\u6267\u884C\u987A\u5E8F",
    workflowDescription: "\u5148\u6267\u884C CLI \u91C7\u96C6\uFF0C\u518D\u6458\u5F55\u8BC1\u636E\u3001\u8865\u5173\u7CFB\u4E0E\u6807\u7B7E\uFF0C\u6700\u540E\u624D\u8FDB\u5165\u8BED\u4E49\u53EC\u56DE\u3002"
  },
  en: {
    localeLabel: "English",
    overviewTitle: "Research Workbench Overview",
    overviewDescription: "The home page now explains the stack in both Chinese and English so the CLI-first capture, evidence extraction, and semantic recall roles stay explicit.",
    lead: "This home page is the operating overview for a research-oriented Obsidian vault. Link & Tag Intelligence connects sources, evidence, claims, typed relations, and bilingual controlled tags. It does not replace a PDF reader, an optional Zotero adapter, or your external semantic retrieval stack.",
    bridgeLabel: "CLI-first capture baseline",
    bridgeValue: "Configure a shell JSON ingestion CLI first so DOI, arXiv, or PDF inputs can create literature notes directly. Zotero stays optional for existing libraries.",
    stackTitle: "Recommended research stack",
    stackItems: [
      "Research ingestion CLI: create literature notes directly from DOI, arXiv, or PDF input and return stdout JSON.",
      "PDF++: copy page-aware evidence into literature notes and draft notes.",
      "Link & Tag Intelligence: connect sources, evidence, claims, typed relations, and bilingual controlled tags.",
      "Smart Connections / external semantic bridge: add broader recall while drafting or synthesizing, without replacing exact references.",
      "Zotero Integration + Better BibTeX: use only when you need to import an existing Zotero library."
    ],
    flowTitle: "Suggested flow",
    flowItems: [
      "Configure the ingestion CLI first and confirm that it can handle DOI, arXiv, or PDF inputs.",
      "Run the CLI-first import inside Obsidian so literature notes land in the research folder.",
      "Open the source PDF and use PDF++ to copy page-aware evidence.",
      "Return to this plugin to add typed relations, reference context, and bilingual tags.",
      "Only then use Smart Connections or the external semantic bridge for broader recall while drafting.",
      "Use the Zotero adapter only when you need to import an existing Zotero library."
    ],
    troubleshootTitle: "Troubleshooting",
    troubleshootBody: "If CLI ingestion fails, check the command, placeholders, network access, and PDF paths first. Zotero desktop and Better BibTeX are only required when you intentionally enable the optional Zotero adapter.",
    workflowTitle: "Workflow execution order",
    workflowDescription: "Run CLI capture first, then capture evidence, add relations and tags, and only after that rely on semantic recall."
  }
};
function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
function normalizeJsonText(value, fallback) {
  return typeof value === "string" ? value : fallback;
}
function normalizeDelimitedSetting(value, fallback) {
  return typeof value === "string" && value.trim() ? value : fallback;
}
function normalizeLoadedSettings(data, configDir = "") {
  const defaults = buildDefaultSettings(configDir);
  const raw = data && typeof data === "object" ? data : {};
  const normalized = {
    ...defaults,
    ...raw
  };
  if (Array.isArray(raw.relationKeys) && arraysEqual(raw.relationKeys.map(String), LEGACY_RELATION_KEYS)) {
    normalized.relationKeys = [...RESEARCH_RELATION_KEYS];
  }
  if (!Array.isArray(normalized.relationKeys) || normalized.relationKeys.length === 0) {
    normalized.relationKeys = [...RESEARCH_RELATION_KEYS];
  } else {
    normalized.relationKeys = normalized.relationKeys.map(String).map((item) => item.trim()).filter(Boolean);
  }
  normalized.workflowMode = normalized.workflowMode === "general" ? "general" : "researcher";
  normalized.tagAliasMapText = normalizeJsonText(normalized.tagAliasMapText, defaults.tagAliasMapText);
  normalized.tagFacetMapText = normalizeJsonText(normalized.tagFacetMapText, DEFAULT_TAG_FACET_MAP_TEXT);
  normalized.ingestionCommand = typeof normalized.ingestionCommand === "string" ? normalized.ingestionCommand : "";
  normalized.ingestionTimeoutMs = Number.isFinite(normalized.ingestionTimeoutMs) && normalized.ingestionTimeoutMs > 0 ? normalized.ingestionTimeoutMs : defaults.ingestionTimeoutMs;
  normalized.semanticCommand = typeof normalized.semanticCommand === "string" ? normalized.semanticCommand : "";
  normalized.semanticTimeoutMs = Number.isFinite(normalized.semanticTimeoutMs) && normalized.semanticTimeoutMs > 0 ? normalized.semanticTimeoutMs : defaults.semanticTimeoutMs;
  normalized.recentLinkMemorySize = Number.isFinite(normalized.recentLinkMemorySize) && normalized.recentLinkMemorySize > 0 ? normalized.recentLinkMemorySize : defaults.recentLinkMemorySize;
  normalized.recentLinkTargets = Array.isArray(normalized.recentLinkTargets) ? normalized.recentLinkTargets.map(String).filter(Boolean) : [];
  normalized.researchLiteratureFolder = normalizeDelimitedSetting(normalized.researchLiteratureFolder, RESEARCH_LITERATURE_PATH);
  normalized.researchTemplatePath = normalizeDelimitedSetting(normalized.researchTemplatePath, RESEARCH_TEMPLATE_PATH);
  normalized.researchAttachmentsFolder = normalizeDelimitedSetting(normalized.researchAttachmentsFolder, RESEARCH_ATTACHMENTS_PATH);
  normalized.researchOpenNoteAfterImport = typeof normalized.researchOpenNoteAfterImport === "boolean" ? normalized.researchOpenNoteAfterImport : defaults.researchOpenNoteAfterImport;
  normalized.smartConnectionsFolderExclusions = normalizeDelimitedSetting(
    normalized.smartConnectionsFolderExclusions,
    defaults.smartConnectionsFolderExclusions
  );
  normalized.smartConnectionsHeadingExclusions = normalizeDelimitedSetting(
    normalized.smartConnectionsHeadingExclusions,
    defaults.smartConnectionsHeadingExclusions
  );
  normalized.smartConnectionsResultsLimit = Number.isFinite(normalized.smartConnectionsResultsLimit) && normalized.smartConnectionsResultsLimit > 0 ? normalized.smartConnectionsResultsLimit : defaults.smartConnectionsResultsLimit;
  return normalized;
}
var LinkTagIntelligenceSettingTab = class extends import_obsidian9.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.renderToken = 0;
    this.activePage = "overview";
    this.activeCompanionId = null;
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("lti-settings-root");
    const shell = containerEl.createDiv({ cls: "lti-workbench" });
    shell.createDiv({
      text: this.plugin.t("loading"),
      cls: "lti-workbench-loading"
    });
    const token = ++this.renderToken;
    void this.renderWorkbench(shell, token);
  }
  async renderWorkbench(containerEl, token) {
    const state = await this.plugin.getResearchWorkbenchState();
    if (token !== this.renderToken) {
      return;
    }
    containerEl.empty();
    const nav = containerEl.createDiv({ cls: "lti-workbench-page-nav" });
    this.createPageTab(nav, "overview", this.plugin.t("settingsWorkbenchPageOverview"));
    this.createPageTab(nav, "workflow", this.plugin.t("settingsWorkbenchPageWorkflow"));
    this.createPageTab(nav, "plugins", this.plugin.t("settingsWorkbenchPagePlugins"));
    this.createPageTab(nav, "taxonomy", this.plugin.t("settingsWorkbenchPageTaxonomy"));
    const page = containerEl.createDiv({ cls: "lti-workbench-page" });
    switch (this.activePage) {
      case "overview":
        this.renderOverviewPage(page, state);
        break;
      case "workflow":
        this.renderWorkflowPage(page, state);
        break;
      case "plugins":
        this.renderPluginsPage(page, state);
        break;
      case "taxonomy":
        this.renderTaxonomyPage(page);
        break;
    }
  }
  openPage(page, companionId = null) {
    this.activePage = page;
    if (companionId) {
      this.activeCompanionId = companionId;
    } else if (page !== "plugins") {
      this.activeCompanionId = null;
    }
    this.display();
  }
  createPageTab(containerEl, page, label) {
    const button = containerEl.createEl("button", {
      cls: `lti-workbench-page-tab${this.activePage === page ? " is-active" : ""}`,
      text: label,
      type: "button"
    });
    button.addEventListener("click", () => {
      if (this.activePage !== page) {
        this.openPage(page);
      }
    });
  }
  renderOverviewPage(containerEl, state) {
    this.renderHero(containerEl, state);
    this.renderOverviewGuideSection(containerEl);
    this.renderModuleSection(containerEl);
    this.renderCompanionSummarySection(containerEl, state);
  }
  renderWorkflowPage(containerEl, state) {
    this.renderWorkflowGuideSection(containerEl);
    this.renderActionsSection(containerEl);
    const grid = containerEl.createDiv({ cls: "lti-workbench-settings-grid" });
    const preferences = this.createSectionCard(
      grid,
      this.plugin.t("settingsWorkbenchPreferencesTitle"),
      this.plugin.t("settingsWorkbenchPreferencesDescription")
    );
    preferences.addClass("is-form");
    this.renderPreferencesDrawer(preferences);
    const paths = this.createSectionCard(
      grid,
      this.plugin.t("settingsWorkbenchPathsTitle"),
      this.plugin.t("settingsWorkbenchPathsDescription")
    );
    paths.addClass("is-form");
    this.renderPathsDrawer(paths);
    const ingestion = this.createSectionCard(
      grid,
      this.plugin.t("settingsWorkbenchIngestionTitle"),
      this.plugin.t("settingsWorkbenchIngestionDescription")
    );
    ingestion.addClass("is-form");
    this.renderIngestionDrawer(ingestion);
    const smart = this.createSectionCard(
      grid,
      this.plugin.t("settingsWorkbenchRecallTitle"),
      this.plugin.t("settingsWorkbenchRecallDescription")
    );
    smart.addClass("is-form");
    this.renderSmartDrawer(smart);
    const semantic = this.createSectionCard(
      grid,
      this.plugin.t("settingsWorkbenchSemanticTitle"),
      this.plugin.t("settingsWorkbenchSemanticDescription")
    );
    semantic.addClass("is-form");
    this.renderSemanticDrawer(semantic, state);
  }
  renderPluginsPage(containerEl, state) {
    const section = this.createSectionCard(
      containerEl,
      this.plugin.t("settingsWorkbenchCompanionTitle"),
      this.plugin.t("settingsWorkbenchCompanionDescription")
    );
    const list = section.createDiv({ cls: "lti-workbench-plugin-list" });
    for (const companion of state.companions) {
      this.renderCompanionPanel(list, companion, state);
    }
  }
  renderTaxonomyPage(containerEl) {
    const section = this.createSectionCard(
      containerEl,
      this.plugin.t("settingsWorkbenchAdvancedTitle"),
      this.plugin.t("settingsWorkbenchAdvancedDescription")
    );
    section.addClass("is-form");
    this.renderTaxonomyDrawer(section);
  }
  renderHero(containerEl, state) {
    const readyCompanions = state.companions.filter((item) => item.ready && !item.optional).length;
    const requiredCompanions = state.companions.filter((item) => !item.optional).length;
    const hero = containerEl.createDiv({ cls: "lti-workbench-hero" });
    const top = hero.createDiv({ cls: "lti-workbench-hero-top" });
    const copy = top.createDiv({ cls: "lti-workbench-hero-copy" });
    copy.createDiv({
      text: this.plugin.t("settingsWorkbenchEyebrow"),
      cls: "lti-workbench-eyebrow"
    });
    copy.createDiv({
      text: this.plugin.t("settingsWorkbenchTitle"),
      cls: "lti-workbench-title"
    });
    copy.createDiv({
      text: this.plugin.t("settingsWorkbenchDescription"),
      cls: "setting-item-description lti-workbench-description"
    });
    const side = top.createDiv({ cls: "lti-workbench-hero-side" });
    const buttons = side.createDiv({ cls: "lti-workbench-hero-action-grid" });
    this.createAsyncButton(buttons, this.plugin.t("settingsWorkbenchApplyAll"), async () => {
      await this.plugin.applyResearchPreset();
    });
    this.createActionButton(buttons, this.plugin.t("settingsWorkbenchRefresh"), () => this.display());
    this.createActionButton(buttons, this.plugin.t("settingsWorkbenchPageWorkflow"), () => this.openPage("workflow"));
    const prefs = side.createDiv({ cls: "lti-workbench-hero-meta-grid" });
    this.renderMetaCard(
      prefs,
      this.plugin.t("settingsLanguage"),
      this.formatLanguageLabel(this.plugin.settings.language)
    );
    this.renderMetaCard(
      prefs,
      this.plugin.t("settingsWorkflowMode"),
      this.plugin.t(this.plugin.settings.workflowMode === "researcher" ? "workflowModeResearcher" : "workflowModeGeneral")
    );
    const stats = hero.createDiv({ cls: "lti-workbench-stat-strip" });
    this.renderStat(stats, this.plugin.t("settingsWorkbenchStatReady"), `${readyCompanions}/${requiredCompanions}`);
    this.renderStat(
      stats,
      this.plugin.t("settingsWorkbenchStatMode"),
      this.plugin.t(this.plugin.settings.workflowMode === "researcher" ? "workflowModeResearcher" : "workflowModeGeneral")
    );
    this.renderStat(stats, this.plugin.t("settingsWorkbenchStatIndexer"), String(state.enabledPluginIds.length));
    this.renderStat(
      stats,
      this.plugin.t("settingsWorkbenchStatSemantic"),
      state.profile.semanticEnabled ? this.plugin.t("settingsWorkbenchOn") : this.plugin.t("settingsWorkbenchOff")
    );
  }
  currentWorkbenchGuide() {
    return WORKBENCH_GUIDE[this.plugin.currentLanguage()];
  }
  renderOverviewGuideSection(containerEl) {
    const guide = this.currentWorkbenchGuide();
    const section = this.createSectionCard(containerEl, guide.overviewTitle, guide.overviewDescription);
    const grid = section.createDiv({ cls: "lti-workbench-intro-grid" });
    this.renderGuideLocaleCard(grid, "zh");
    this.renderGuideLocaleCard(grid, "en");
  }
  renderWorkflowGuideSection(containerEl) {
    const guide = this.currentWorkbenchGuide();
    const section = this.createSectionCard(containerEl, guide.workflowTitle, guide.workflowDescription);
    section.createDiv({
      text: guide.lead,
      cls: "setting-item-description lti-workbench-intro-lead"
    });
    this.renderGuideNoteBlock(section, guide.bridgeLabel, guide.bridgeValue);
    this.renderGuideListBlock(section, guide.stackTitle, guide.stackItems);
    this.renderGuideListBlock(section, guide.flowTitle, guide.flowItems, true);
    this.renderGuideNoteBlock(section, guide.troubleshootTitle, guide.troubleshootBody);
  }
  renderGuideLocaleCard(containerEl, language) {
    const guide = WORKBENCH_GUIDE[language];
    const card = containerEl.createDiv({ cls: "lti-workbench-intro-card" });
    card.createDiv({ text: guide.localeLabel, cls: "lti-workbench-intro-locale" });
    card.createDiv({
      text: guide.lead,
      cls: "setting-item-description lti-workbench-intro-lead"
    });
    this.renderGuideNoteBlock(card, guide.bridgeLabel, guide.bridgeValue);
    this.renderGuideListBlock(card, guide.stackTitle, guide.stackItems);
    this.renderGuideListBlock(card, guide.flowTitle, guide.flowItems, true);
    this.renderGuideNoteBlock(card, guide.troubleshootTitle, guide.troubleshootBody);
  }
  renderGuideListBlock(containerEl, title, items, ordered = false) {
    const block = containerEl.createDiv({ cls: "lti-workbench-intro-block" });
    block.createDiv({ text: title, cls: "lti-workbench-intro-block-title" });
    const list = block.createEl(ordered ? "ol" : "ul", { cls: "lti-workbench-intro-list" });
    for (const item of items) {
      list.createEl("li", { text: item });
    }
  }
  renderGuideNoteBlock(containerEl, title, body) {
    const note = containerEl.createDiv({ cls: "lti-workbench-intro-note" });
    note.createDiv({ text: title, cls: "lti-workbench-intro-block-title" });
    note.createDiv({
      text: body,
      cls: "setting-item-description lti-workbench-intro-note-copy"
    });
  }
  renderActionsSection(containerEl) {
    const section = this.createSectionCard(
      containerEl,
      this.plugin.t("settingsWorkbenchQuickActionsTitle"),
      this.plugin.t("settingsWorkbenchQuickActionsDescription")
    );
    section.addClass("is-featured");
    const groups = section.createDiv({ cls: "lti-workbench-action-group-grid" });
    this.renderActionGroup(
      groups,
      this.plugin.t("settingsWorkbenchActionGroupCaptureTitle"),
      this.plugin.t("settingsWorkbenchActionGroupCaptureDescription"),
      [
        {
          title: this.plugin.t("settingsWorkbenchActionIngestionTitle"),
          description: this.plugin.t("settingsWorkbenchActionIngestionDescription"),
          onClick: () => this.plugin.openResearchIngestion()
        },
        {
          title: this.plugin.t("settingsWorkbenchActionZoteroTitle"),
          description: this.plugin.t("settingsWorkbenchActionZoteroDescription"),
          onClick: () => {
            void this.plugin.importZoteroNotes();
          }
        },
        {
          title: this.plugin.t("settingsWorkbenchActionPdfTitle"),
          description: this.plugin.t("settingsWorkbenchActionPdfDescription"),
          onClick: () => {
            void this.plugin.openPdfPlusSettings();
          }
        }
      ]
    );
    this.renderActionGroup(
      groups,
      this.plugin.t("settingsWorkbenchActionGroupRecallTitle"),
      this.plugin.t("settingsWorkbenchActionGroupRecallDescription"),
      [
        {
          title: this.plugin.t("settingsWorkbenchActionSmartTitle"),
          description: this.plugin.t("settingsWorkbenchActionSmartDescription"),
          onClick: () => {
            void this.plugin.openSmartConnectionsView();
          }
        },
        {
          title: this.plugin.t("settingsWorkbenchActionSemanticTitle"),
          description: this.plugin.t("settingsWorkbenchActionSemanticDescription"),
          onClick: () => this.plugin.openSemanticSearch()
        },
        {
          title: this.plugin.t("settingsWorkbenchActionPanelTitle"),
          description: this.plugin.t("settingsWorkbenchActionPanelDescription"),
          onClick: () => {
            void this.plugin.openIntelligencePanel();
          }
        }
      ]
    );
    this.renderActionGroup(
      groups,
      this.plugin.t("settingsWorkbenchActionGroupOrganizeTitle"),
      this.plugin.t("settingsWorkbenchActionGroupOrganizeDescription"),
      [
        {
          title: this.plugin.t("settingsWorkbenchActionTagsTitle"),
          description: this.plugin.t("settingsWorkbenchActionTagsDescription"),
          onClick: () => this.plugin.openTagManager()
        },
        {
          title: this.plugin.t("settingsWorkbenchActionSuggestTitle"),
          description: this.plugin.t("settingsWorkbenchActionSuggestDescription"),
          onClick: () => this.plugin.openTagSuggestion()
        }
      ]
    );
  }
  renderModuleSection(containerEl) {
    const section = this.createSectionCard(
      containerEl,
      this.plugin.t("settingsWorkbenchConfigTitle"),
      this.plugin.t("settingsWorkbenchConfigDescription")
    );
    const grid = section.createDiv({ cls: "lti-workbench-module-grid" });
    const preferences = this.createModuleCard(
      grid,
      this.plugin.t("settingsWorkbenchPreferencesTitle"),
      this.plugin.t("settingsWorkbenchPreferencesDescription")
    );
    this.renderMetricRow(preferences, this.plugin.t("settingsLanguage"), this.formatLanguageLabel(this.plugin.settings.language));
    this.renderMetricRow(
      preferences,
      this.plugin.t("settingsWorkflowMode"),
      this.plugin.t(this.plugin.settings.workflowMode === "researcher" ? "workflowModeResearcher" : "workflowModeGeneral")
    );
    this.attachModuleAction(preferences, () => this.openPage("workflow"));
    const paths = this.createModuleCard(
      grid,
      this.plugin.t("settingsWorkbenchPathsTitle"),
      this.plugin.t("settingsWorkbenchPathsDescription")
    );
    this.renderMetricRow(paths, this.plugin.t("settingsResearchPathLiterature"), this.compactPathLabel(this.plugin.settings.researchLiteratureFolder));
    this.renderMetricRow(paths, this.plugin.t("settingsResearchPathTemplates"), this.compactPathLabel(this.plugin.settings.researchTemplatePath));
    this.renderMetricRow(paths, this.plugin.t("settingsResearchPathAttachments"), this.compactPathLabel(this.plugin.settings.researchAttachmentsFolder));
    this.attachModuleAction(paths, () => this.openPage("workflow"));
    const ingestion = this.createModuleCard(
      grid,
      this.plugin.t("settingsWorkbenchIngestionTitle"),
      this.plugin.t("settingsWorkbenchIngestionDescription")
    );
    this.renderMetricRow(ingestion, this.plugin.t("settingsWorkbenchIngestionCommandTitle"), this.plugin.settings.ingestionCommand.trim() ? this.plugin.t("configured") : this.plugin.t("notConfigured"));
    this.renderMetricRow(ingestion, this.plugin.t("settingsWorkbenchIngestionTimeoutTitle"), String(this.plugin.settings.ingestionTimeoutMs));
    this.attachModuleAction(ingestion, () => this.openPage("workflow"));
    const smart = this.createModuleCard(
      grid,
      this.plugin.t("settingsWorkbenchRecallTitle"),
      this.plugin.t("settingsWorkbenchRecallDescription")
    );
    this.renderMetricRow(smart, this.plugin.t("settingsWorkbenchFolderExclusionsTitle"), String(normalizeDelimitedList(this.plugin.settings.smartConnectionsFolderExclusions).length));
    this.renderMetricRow(smart, this.plugin.t("settingsWorkbenchHeadingExclusionsTitle"), String(normalizeDelimitedList(this.plugin.settings.smartConnectionsHeadingExclusions).length));
    this.renderMetricRow(smart, this.plugin.t("settingsWorkbenchResultsLimitTitle"), String(this.plugin.settings.smartConnectionsResultsLimit));
    this.attachModuleAction(smart, () => this.openPage("workflow"));
    const semantic = this.createModuleCard(
      grid,
      this.plugin.t("settingsWorkbenchSemanticTitle"),
      this.plugin.t("settingsWorkbenchSemanticDescription")
    );
    this.renderMetricRow(semantic, this.plugin.t("settingsSemanticEnabled"), this.booleanText(this.plugin.settings.semanticBridgeEnabled));
    this.renderMetricRow(semantic, this.plugin.t("settingsSemanticCommand"), this.plugin.settings.semanticCommand.trim() ? this.plugin.t("configured") : this.plugin.t("notConfigured"));
    this.renderMetricRow(semantic, this.plugin.t("settingsSemanticTimeout"), String(this.plugin.settings.semanticTimeoutMs));
    this.attachModuleAction(semantic, () => this.openPage("workflow"));
    const taxonomy = this.createModuleCard(
      grid,
      this.plugin.t("settingsWorkbenchAdvancedTitle"),
      this.plugin.t("settingsWorkbenchAdvancedDescription")
    );
    this.renderMetricRow(taxonomy, this.plugin.t("settingsRelationKeys"), String(this.plugin.settings.relationKeys.length));
    this.renderMetricRow(taxonomy, this.plugin.t("settingsTagAliasMap"), String(this.countAliasEntries(this.plugin.settings.tagAliasMapText)));
    this.renderMetricRow(taxonomy, this.plugin.t("settingsTagFacetMap"), String(this.plugin.getTagFacetMap({ suppressNotice: true }).size));
    this.attachModuleAction(taxonomy, () => this.openPage("taxonomy"));
    section.createDiv({
      text: this.plugin.t("settingsWorkbenchConfigHint"),
      cls: "setting-item-description lti-workbench-hint"
    });
  }
  renderCompanionSummarySection(containerEl, state) {
    const section = this.createSectionCard(
      containerEl,
      this.plugin.t("settingsWorkbenchCompanionTitle"),
      this.plugin.t("settingsWorkbenchCompanionDescription")
    );
    const list = section.createDiv({ cls: "lti-workbench-summary-list" });
    for (const companion of state.companions) {
      this.renderCompanionSummaryRow(list, companion);
    }
  }
  renderCompanionSummaryRow(containerEl, companion) {
    const meta = COMPANION_META[companion.id];
    const row = containerEl.createDiv({ cls: "lti-workbench-summary-row" });
    const copy = row.createDiv({ cls: "lti-workbench-summary-copy" });
    copy.createDiv({ text: meta.name, cls: "lti-workbench-summary-title" });
    const chips = copy.createDiv({ cls: "lti-workbench-chip-row" });
    chips.createDiv({
      text: this.getStatusLabel(companion),
      cls: `lti-workbench-status-pill is-${this.getStatusTone(companion)}`
    });
    if (companion.mismatches.length > 0) {
      chips.createDiv({
        text: this.plugin.t("settingsWorkbenchMismatchCount", { count: companion.mismatches.length }),
        cls: "lti-workbench-chip"
      });
    }
    this.createActionButton(row, this.plugin.t("settingsWorkbenchPagePlugins"), () => {
      this.openPage("plugins", companion.id);
    });
  }
  renderPreferencesDrawer(containerEl) {
    this.createSelectField(
      containerEl,
      this.plugin.t("settingsLanguage"),
      "",
      [
        { value: "system", label: "System" },
        { value: "en", label: "English" },
        { value: "zh", label: "\u4E2D\u6587" }
      ],
      this.plugin.settings.language,
      async (value) => {
        this.plugin.settings.language = value;
        await this.plugin.saveSettings();
        this.display();
      }
    );
    this.createSelectField(
      containerEl,
      this.plugin.t("settingsWorkflowMode"),
      this.plugin.t("settingsWorkflowModeDescription"),
      [
        { value: "researcher", label: this.plugin.t("workflowModeResearcher") },
        { value: "general", label: this.plugin.t("workflowModeGeneral") }
      ],
      this.plugin.settings.workflowMode,
      async (value) => {
        this.plugin.settings.workflowMode = value;
        await this.plugin.saveSettings();
        this.display();
      }
    );
  }
  renderPathsDrawer(containerEl) {
    this.createTextField(
      containerEl,
      this.plugin.t("settingsResearchPathLiterature"),
      "",
      this.plugin.settings.researchLiteratureFolder,
      async (value) => {
        this.plugin.settings.researchLiteratureFolder = value.trim() || RESEARCH_LITERATURE_PATH;
        await this.plugin.saveSettings();
      }
    );
    this.createTextField(
      containerEl,
      this.plugin.t("settingsResearchPathTemplates"),
      "",
      this.plugin.settings.researchTemplatePath,
      async (value) => {
        this.plugin.settings.researchTemplatePath = value.trim() || RESEARCH_TEMPLATE_PATH;
        await this.plugin.saveSettings();
      }
    );
    this.createTextField(
      containerEl,
      this.plugin.t("settingsResearchPathAttachments"),
      "",
      this.plugin.settings.researchAttachmentsFolder,
      async (value) => {
        this.plugin.settings.researchAttachmentsFolder = value.trim() || RESEARCH_ATTACHMENTS_PATH;
        await this.plugin.saveSettings();
      }
    );
    this.createToggleField(
      containerEl,
      this.plugin.t("settingsWorkbenchOpenImportedTitle"),
      this.plugin.t("settingsWorkbenchOpenImportedDescription"),
      this.plugin.settings.researchOpenNoteAfterImport,
      async (value) => {
        this.plugin.settings.researchOpenNoteAfterImport = value;
        await this.plugin.saveSettings();
      }
    );
    const actions = containerEl.createDiv({ cls: "lti-workbench-drawer-actions" });
    this.createActionButton(actions, this.plugin.t("settingsWorkbenchRunIngestion"), () => {
      this.plugin.openResearchIngestion();
    });
    this.createAsyncButton(actions, this.plugin.t("settingsWorkbenchApplyCompanion"), async () => {
      await this.plugin.applyCompanionPreset("obsidian-zotero-desktop-connector");
    });
    this.createActionButton(actions, this.plugin.t("settingsWorkbenchRunZotero"), () => {
      void this.plugin.importZoteroNotes();
    });
  }
  renderIngestionDrawer(containerEl) {
    this.createTextAreaField(
      containerEl,
      this.plugin.t("settingsWorkbenchIngestionCommandTitle"),
      this.plugin.t("settingsWorkbenchIngestionCommandDescription"),
      this.plugin.settings.ingestionCommand,
      async (value) => {
        this.plugin.settings.ingestionCommand = value;
        await this.plugin.saveSettings();
      },
      6,
      "node /path/to/lti-research.mjs ingest --source-type {{source_type}} --source {{source}} --vault {{vault}}"
    );
    this.createNumberField(
      containerEl,
      this.plugin.t("settingsWorkbenchIngestionTimeoutTitle"),
      "",
      String(this.plugin.settings.ingestionTimeoutMs),
      async (value) => {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          this.plugin.settings.ingestionTimeoutMs = parsed;
          await this.plugin.saveSettings();
        }
      }
    );
    containerEl.createDiv({
      text: this.plugin.t("settingsWorkbenchIngestionHint"),
      cls: "setting-item-description lti-workbench-inline-note"
    });
    const actions = containerEl.createDiv({ cls: "lti-workbench-drawer-actions" });
    this.createActionButton(actions, this.plugin.t("settingsWorkbenchRunIngestion"), () => {
      this.plugin.openResearchIngestion();
    });
  }
  renderSmartDrawer(containerEl) {
    this.createTextAreaField(
      containerEl,
      this.plugin.t("settingsWorkbenchFolderExclusionsTitle"),
      this.plugin.t("settingsWorkbenchFolderExclusionsDescription"),
      this.plugin.settings.smartConnectionsFolderExclusions,
      async (value) => {
        this.plugin.settings.smartConnectionsFolderExclusions = normalizeDelimitedList(value).join(", ");
        await this.plugin.saveSettings();
      },
      4
    );
    this.createTextAreaField(
      containerEl,
      this.plugin.t("settingsWorkbenchHeadingExclusionsTitle"),
      this.plugin.t("settingsWorkbenchHeadingExclusionsDescription"),
      this.plugin.settings.smartConnectionsHeadingExclusions,
      async (value) => {
        this.plugin.settings.smartConnectionsHeadingExclusions = normalizeDelimitedList(value).join(", ");
        await this.plugin.saveSettings();
      },
      4
    );
    this.createNumberField(
      containerEl,
      this.plugin.t("settingsWorkbenchResultsLimitTitle"),
      "",
      String(this.plugin.settings.smartConnectionsResultsLimit),
      async (value) => {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          this.plugin.settings.smartConnectionsResultsLimit = parsed;
          await this.plugin.saveSettings();
        }
      }
    );
    const actions = containerEl.createDiv({ cls: "lti-workbench-drawer-actions" });
    this.createAsyncButton(actions, this.plugin.t("settingsWorkbenchApplyCompanion"), async () => {
      await this.plugin.applyCompanionPreset("smart-connections");
    });
    this.createActionButton(actions, this.plugin.t("settingsWorkbenchRunSmart"), () => {
      void this.plugin.openSmartConnectionsView();
    });
  }
  renderSemanticDrawer(containerEl, state) {
    this.createToggleField(
      containerEl,
      this.plugin.t("settingsSemanticEnabled"),
      this.plugin.t("settingsSemanticEnabledDescription"),
      this.plugin.settings.semanticBridgeEnabled,
      async (value) => {
        this.plugin.settings.semanticBridgeEnabled = value;
        await this.plugin.saveSettings();
        this.display();
      }
    );
    this.createTextAreaField(
      containerEl,
      this.plugin.t("settingsSemanticCommand"),
      this.plugin.t("settingsSemanticCommandDescription"),
      this.plugin.settings.semanticCommand,
      async (value) => {
        this.plugin.settings.semanticCommand = value;
        await this.plugin.saveSettings();
      },
      5,
      "python3 /path/tool.py --vault {{vault}} --query {{query}}"
    );
    this.createNumberField(
      containerEl,
      this.plugin.t("settingsSemanticTimeout"),
      "",
      String(this.plugin.settings.semanticTimeoutMs),
      async (value) => {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          this.plugin.settings.semanticTimeoutMs = parsed;
          await this.plugin.saveSettings();
        }
      }
    );
    containerEl.createDiv({
      text: this.plugin.t("settingsWorkbenchCurrentExclusions", { value: state.profile.smartFolderExclusions.join(", ") }),
      cls: "setting-item-description lti-workbench-inline-note"
    });
    const actions = containerEl.createDiv({ cls: "lti-workbench-drawer-actions" });
    this.createAsyncButton(actions, this.plugin.t("settingsWorkbenchApplyCompanion"), async () => {
      await this.plugin.applyCompanionPreset("semantic-bridge");
    });
    this.createActionButton(actions, this.plugin.t("settingsWorkbenchRunSemantic"), () => {
      this.plugin.openSemanticSearch();
    });
  }
  renderTaxonomyDrawer(containerEl) {
    this.createAdvancedPanel(
      containerEl,
      this.plugin.t("settingsWorkbenchAdvancedRelationsTitle"),
      this.plugin.t("settingsWorkbenchAdvancedRelationsDescription"),
      (contentEl) => {
        this.createTextAreaField(
          contentEl,
          this.plugin.t("settingsRelationKeys"),
          this.plugin.t("settingsRelationKeysDescription"),
          this.plugin.settings.relationKeys.join(", "),
          async (value) => {
            this.plugin.settings.relationKeys = value.split(",").map((item) => item.trim()).filter(Boolean);
            await this.plugin.saveSettings();
            this.display();
          },
          4,
          RESEARCH_RELATION_KEYS.join(", ")
        );
        const chips = contentEl.createDiv({ cls: "lti-workbench-key-chip-row" });
        for (const key of this.plugin.settings.relationKeys) {
          const chip = chips.createDiv({ cls: "lti-workbench-key-chip" });
          chip.createSpan({ text: key });
          chip.createSpan({ text: this.plugin.relationLabel(key), cls: "lti-workbench-key-chip-meta" });
        }
      }
    );
    this.createAdvancedPanel(
      containerEl,
      this.plugin.t("settingsWorkbenchAdvancedAliasTitle"),
      this.plugin.t("settingsWorkbenchAdvancedAliasDescription"),
      (contentEl) => {
        this.createTextAreaField(
          contentEl,
          this.plugin.t("settingsTagAliasMap"),
          this.plugin.t("settingsTagAliasMapDescription"),
          this.plugin.settings.tagAliasMapText,
          async (value) => {
            this.plugin.settings.tagAliasMapText = value;
            await this.plugin.saveSettings();
          },
          10
        );
      }
    );
    this.createAdvancedPanel(
      containerEl,
      this.plugin.t("settingsWorkbenchAdvancedFacetTitle"),
      this.plugin.t("settingsWorkbenchAdvancedFacetDescription"),
      (contentEl) => {
        this.createTextAreaField(
          contentEl,
          this.plugin.t("settingsTagFacetMap"),
          this.plugin.t("settingsTagFacetMapDescription"),
          this.plugin.settings.tagFacetMapText,
          async (value) => {
            this.plugin.settings.tagFacetMapText = value;
            await this.plugin.saveSettings();
          },
          14
        );
      }
    );
    this.createAdvancedPanel(
      containerEl,
      this.plugin.t("settingsWorkbenchAdvancedMemoryTitle"),
      this.plugin.t("settingsWorkbenchAdvancedMemoryDescription"),
      (contentEl) => {
        this.createNumberField(
          contentEl,
          this.plugin.t("settingsRecentLinks"),
          "",
          String(this.plugin.settings.recentLinkMemorySize),
          async (value) => {
            const parsed = Number.parseInt(value, 10);
            if (Number.isFinite(parsed) && parsed > 0) {
              this.plugin.settings.recentLinkMemorySize = parsed;
              this.plugin.settings.recentLinkTargets = this.plugin.settings.recentLinkTargets.slice(0, parsed);
              await this.plugin.saveSettings();
            }
          }
        );
      }
    );
  }
  renderPluginDrawer(containerEl, companion, state) {
    if (companion.configPath) {
      containerEl.createDiv({
        text: companion.configPath,
        cls: "lti-workbench-plugin-path"
      });
    }
    const facts = containerEl.createDiv({ cls: "lti-workbench-fact-list" });
    this.renderCompanionFacts(facts, companion, state);
    if (companion.mismatches.length > 0) {
      const mismatches = containerEl.createDiv({ cls: "lti-workbench-mismatch-list" });
      mismatches.createDiv({
        text: this.plugin.t("settingsWorkbenchMismatchTitle"),
        cls: "lti-workbench-subtitle"
      });
      for (const mismatch of companion.mismatches) {
        mismatches.createDiv({
          text: this.getMismatchLabel(mismatch),
          cls: "lti-workbench-mismatch-item"
        });
      }
    }
    const actions = containerEl.createDiv({ cls: "lti-workbench-drawer-actions" });
    this.createAsyncButton(actions, this.plugin.t("settingsWorkbenchApplyCompanion"), async () => {
      await this.plugin.applyCompanionPreset(companion.id);
    }, !companion.installed && !companion.optional);
    this.createActionButton(actions, this.plugin.t("settingsWorkbenchOpenSettings"), () => {
      this.plugin.openCompanionSettings(companion.id);
    }, !companion.installed && !companion.optional);
    const primary = this.getPrimaryCompanionAction(companion.id);
    if (primary) {
      this.createActionButton(actions, primary.label, primary.handler, primary.disabled);
    }
  }
  renderCompanionPanel(containerEl, companion, state) {
    const meta = COMPANION_META[companion.id];
    const panel = containerEl.createEl("details", { cls: "lti-workbench-plugin-panel" });
    panel.open = this.activeCompanionId === companion.id || companion.mismatches.length > 0;
    panel.addEventListener("toggle", () => {
      this.activeCompanionId = panel.open ? companion.id : this.activeCompanionId === companion.id ? null : this.activeCompanionId;
    });
    const summary = panel.createEl("summary", { cls: "lti-workbench-plugin-summary" });
    const copy = summary.createDiv({ cls: "lti-workbench-plugin-summary-copy" });
    copy.createDiv({ text: meta.name, cls: "lti-workbench-plugin-title" });
    copy.createDiv({
      text: this.plugin.t(meta.descriptionKey),
      cls: "setting-item-description lti-workbench-plugin-description"
    });
    const chips = summary.createDiv({ cls: "lti-workbench-chip-row" });
    chips.createDiv({
      text: this.getStatusLabel(companion),
      cls: `lti-workbench-status-pill is-${this.getStatusTone(companion)}`
    });
    if (companion.mismatches.length > 0) {
      chips.createDiv({
        text: this.plugin.t("settingsWorkbenchMismatchCount", { count: companion.mismatches.length }),
        cls: "lti-workbench-chip"
      });
    }
    const body = panel.createDiv({ cls: "lti-workbench-plugin-body" });
    this.renderPluginDrawer(body, companion, state);
  }
  renderCompanionFacts(containerEl, companion, state) {
    switch (companion.id) {
      case "obsidian-zotero-desktop-connector": {
        const guide = this.currentWorkbenchGuide();
        this.renderFactRow(containerEl, guide.bridgeLabel, guide.bridgeValue);
        this.renderFactRow(containerEl, this.plugin.t("settingsResearchPathLiterature"), this.valueOrFallback(companion.actual.literatureFolder), state.profile.literatureFolder, !companion.mismatches.includes("zotero-folder"));
        this.renderFactRow(containerEl, this.plugin.t("settingsResearchPathTemplates"), this.valueOrFallback(companion.actual.templatePath), state.profile.templatePath, !companion.mismatches.includes("zotero-template"));
        this.renderFactRow(containerEl, this.plugin.t("settingsResearchPathAttachments"), this.valueOrFallback(companion.actual.attachmentsFolder), state.profile.attachmentsFolder, !companion.mismatches.includes("zotero-attachments"));
        this.renderFactRow(containerEl, this.plugin.t("settingsWorkbenchOpenImportedTitle"), this.booleanText(companion.actual.openNoteAfterImport), this.booleanText(state.profile.openNoteAfterImport), !companion.mismatches.includes("zotero-open-note"));
        return;
      }
      case "pdf-plus":
        this.renderFactRow(containerEl, this.plugin.t("settingsWorkbenchDefaultDisplayTitle"), this.valueOrFallback(companion.actual.defaultDisplayFormat), "Title & page", !companion.mismatches.includes("pdf-default-display"));
        this.renderFactRow(containerEl, this.plugin.t("settingsWorkbenchCopyCommandsTitle"), this.joinList(companion.actual.copyCommandNames), "Literature quote, Evidence callout, Source link", !companion.mismatches.includes("pdf-copy-commands"));
        this.renderFactRow(containerEl, this.plugin.t("settingsWorkbenchHoverPreviewTitle"), this.valueOrFallback(companion.actual.hoverHighlightAction), "preview", !companion.mismatches.includes("pdf-hover-preview"));
        this.renderFactRow(containerEl, this.plugin.t("settingsWorkbenchBacklinksTitle"), this.booleanText(companion.actual.highlightBacklinks), this.plugin.t("settingsWorkbenchOn"), !companion.mismatches.includes("pdf-highlight-backlinks"));
        return;
      case "smart-connections":
        this.renderFactRow(containerEl, this.plugin.t("settingsWorkbenchFolderExclusionsTitle"), this.joinList(companion.actual.folderExclusions), state.profile.smartFolderExclusions.join(", "), !companion.mismatches.includes("smart-folder-exclusions"));
        this.renderFactRow(containerEl, this.plugin.t("settingsWorkbenchHeadingExclusionsTitle"), this.joinList(companion.actual.headingExclusions), state.profile.smartHeadingExclusions.join(", "), !companion.mismatches.includes("smart-heading-exclusions"));
        this.renderFactRow(containerEl, this.plugin.t("settingsWorkbenchLanguageTitle"), this.valueOrFallback(companion.actual.language), state.profile.language, !companion.mismatches.includes("smart-language"));
        this.renderFactRow(containerEl, this.plugin.t("settingsWorkbenchResultsLimitTitle"), this.valueOrFallback(companion.actual.resultsLimit), String(state.profile.smartResultsLimit), !companion.mismatches.includes("smart-results-limit"));
        return;
      case "semantic-bridge":
        this.renderFactRow(containerEl, this.plugin.t("settingsSemanticEnabled"), this.booleanText(companion.actual.enabled), void 0, companion.ready || !companion.enabled);
        this.renderFactRow(containerEl, this.plugin.t("settingsSemanticCommand"), this.valueOrFallback(companion.actual.command), void 0, !companion.mismatches.includes("semantic-command"));
        this.renderFactRow(containerEl, this.plugin.t("settingsSemanticTimeout"), this.valueOrFallback(companion.actual.timeoutMs), void 0, true);
    }
  }
  createAdvancedPanel(containerEl, title, description, renderContent) {
    const details = containerEl.createEl("details", { cls: "lti-workbench-advanced-panel" });
    const summary = details.createEl("summary", { cls: "lti-workbench-advanced-summary" });
    summary.createSpan({ text: title, cls: "lti-workbench-advanced-title" });
    summary.createSpan({ text: description, cls: "lti-workbench-advanced-description" });
    const content = details.createDiv({ cls: "lti-workbench-advanced-content" });
    renderContent(content);
  }
  createSectionCard(containerEl, title, description) {
    const card = containerEl.createDiv({ cls: "lti-workbench-section-card" });
    const header = card.createDiv({ cls: "lti-workbench-section-header" });
    header.createDiv({ text: title, cls: "lti-workbench-section-title" });
    header.createDiv({
      text: description,
      cls: "setting-item-description lti-workbench-section-description"
    });
    return card;
  }
  createModuleCard(containerEl, title, description) {
    const card = containerEl.createDiv({ cls: "lti-workbench-module-card" });
    card.createDiv({ text: title, cls: "lti-workbench-subtitle" });
    card.createDiv({
      text: description,
      cls: "setting-item-description lti-workbench-card-copy"
    });
    return card;
  }
  attachModuleAction(containerEl, onClick) {
    const actions = containerEl.createDiv({ cls: "lti-workbench-card-footer" });
    this.createActionButton(actions, this.plugin.t("settingsWorkbenchDetails"), onClick);
  }
  createFieldShell(containerEl, label, description) {
    const field = containerEl.createDiv({ cls: "lti-workbench-field" });
    field.createDiv({ text: label, cls: "lti-workbench-field-label" });
    if (description) {
      field.createDiv({
        text: description,
        cls: "setting-item-description lti-workbench-field-description"
      });
    }
    return field;
  }
  createTextField(containerEl, label, description, value, onChange, placeholder = "") {
    const field = this.createFieldShell(containerEl, label, description);
    const input = field.createEl("input", { cls: "lti-workbench-input", type: "text" });
    input.value = value;
    input.placeholder = placeholder;
    input.addEventListener("change", () => {
      void onChange(input.value);
    });
  }
  createNumberField(containerEl, label, description, value, onChange) {
    const field = this.createFieldShell(containerEl, label, description);
    const input = field.createEl("input", { cls: "lti-workbench-input", type: "number" });
    input.value = value;
    input.addEventListener("change", () => {
      void onChange(input.value);
    });
  }
  createTextAreaField(containerEl, label, description, value, onChange, rows, placeholder = "") {
    const field = this.createFieldShell(containerEl, label, description);
    const area = field.createEl("textarea", { cls: "lti-workbench-textarea" });
    area.rows = rows;
    area.value = value;
    area.placeholder = placeholder;
    area.addEventListener("change", () => {
      void onChange(area.value);
    });
  }
  createSelectField(containerEl, label, description, options, value, onChange) {
    const field = this.createFieldShell(containerEl, label, description);
    const select = field.createEl("select", { cls: "lti-workbench-select" });
    for (const option of options) {
      const el = select.createEl("option", { text: option.label });
      el.value = option.value;
      if (option.value === value) {
        el.selected = true;
      }
    }
    select.addEventListener("change", () => {
      void onChange(select.value);
    });
  }
  createToggleField(containerEl, label, description, checked, onChange) {
    const field = this.createFieldShell(containerEl, label, description);
    const row = field.createDiv({ cls: "lti-workbench-switch-row" });
    const toggle = row.createEl("label", { cls: "lti-workbench-switch" });
    const input = toggle.createEl("input", { type: "checkbox" });
    input.checked = checked;
    toggle.createSpan({ cls: "lti-workbench-switch-slider" });
    input.addEventListener("change", () => {
      void onChange(input.checked);
    });
  }
  renderStat(containerEl, label, value) {
    const stat = containerEl.createDiv({ cls: "lti-workbench-stat" });
    stat.createDiv({ text: label, cls: "lti-workbench-stat-label" });
    stat.createDiv({ text: value, cls: "lti-workbench-stat-value" });
  }
  renderMetaCard(containerEl, label, value) {
    const card = containerEl.createDiv({ cls: "lti-workbench-meta-card" });
    card.createDiv({ text: label, cls: "lti-workbench-stat-label" });
    card.createDiv({ text: value, cls: "lti-workbench-meta-value" });
  }
  renderMetricRow(containerEl, label, value) {
    const row = containerEl.createDiv({ cls: "lti-workbench-metric-row" });
    row.createDiv({ text: label, cls: "lti-workbench-metric-label" });
    row.createDiv({ text: value, cls: "lti-workbench-metric-value" });
  }
  renderFactRow(containerEl, label, actual, expected, ok = true) {
    const row = containerEl.createDiv({ cls: "lti-workbench-fact-row" });
    if (!ok) {
      row.addClass("is-alert");
    }
    row.createDiv({ text: label, cls: "lti-workbench-fact-label" });
    const values = row.createDiv({ cls: "lti-workbench-fact-values" });
    values.createDiv({ text: actual, cls: "lti-workbench-fact-actual" });
    if (expected && !ok) {
      values.createDiv({
        text: `${this.plugin.t("settingsWorkbenchExpectedPrefix")}: ${expected}`,
        cls: "lti-workbench-fact-expected"
      });
    }
  }
  renderActionGroup(containerEl, title, description, actions) {
    const card = containerEl.createDiv({ cls: "lti-workbench-action-group" });
    card.createDiv({ text: title, cls: "lti-workbench-subtitle" });
    card.createDiv({
      text: description,
      cls: "setting-item-description lti-workbench-card-copy"
    });
    const list = card.createDiv({ cls: "lti-workbench-action-list" });
    for (const action of actions) {
      this.createActionListItem(list, action.title, action.description, action.onClick);
    }
  }
  createActionListItem(containerEl, title, description, onClick) {
    const button = containerEl.createEl("button", { cls: "lti-workbench-action-item", type: "button" });
    const copy = button.createDiv({ cls: "lti-workbench-action-item-copy" });
    const text = copy.createDiv({ cls: "lti-workbench-action-item-text" });
    text.createDiv({ text: title, cls: "lti-workbench-action-item-title" });
    text.createDiv({ text: description, cls: "lti-workbench-action-item-description" });
    button.addEventListener("click", onClick);
  }
  createActionButton(containerEl, label, onClick, disabled = false) {
    const button = containerEl.createEl("button", { cls: "lti-workbench-button", text: label, type: "button" });
    button.disabled = disabled;
    button.addEventListener("click", onClick);
    return button;
  }
  createAsyncButton(containerEl, label, onClick, disabled = false) {
    const button = this.createActionButton(containerEl, label, () => {
      void (async () => {
        button.disabled = true;
        button.textContent = this.plugin.t("loading");
        try {
          await onClick();
        } finally {
          this.display();
        }
      })();
    }, disabled);
    return button;
  }
  getPrimaryCompanionAction(id) {
    switch (id) {
      case "obsidian-zotero-desktop-connector":
        return {
          label: this.plugin.t("settingsWorkbenchRunZotero"),
          handler: () => {
            void this.plugin.importZoteroNotes();
          }
        };
      case "smart-connections":
        return {
          label: this.plugin.t("settingsWorkbenchRunSmart"),
          handler: () => {
            void this.plugin.openSmartConnectionsView();
          }
        };
      case "semantic-bridge":
        return {
          label: this.plugin.t("settingsWorkbenchRunSemantic"),
          handler: () => this.plugin.openSemanticSearch()
        };
      case "pdf-plus":
        return {
          label: this.plugin.t("settingsWorkbenchRunPdf"),
          handler: () => {
            void this.plugin.openPdfPlusSettings();
          }
        };
      default:
        return null;
    }
  }
  getStatusTone(companion) {
    if (companion.optional && !companion.installed) {
      return "optional";
    }
    if (!companion.installed && !companion.optional) {
      return "missing";
    }
    if (companion.ready) {
      return companion.optional ? "optional" : "ready";
    }
    return "alert";
  }
  getStatusLabel(companion) {
    const tone = this.getStatusTone(companion);
    if (tone === "ready") {
      return this.plugin.t("settingsWorkbenchStatusReady");
    }
    if (tone === "missing") {
      return this.plugin.t("settingsWorkbenchStatusMissing");
    }
    if (tone === "optional") {
      return this.plugin.t("settingsWorkbenchStatusOptional");
    }
    return this.plugin.t("settingsWorkbenchStatusAttention");
  }
  getMismatchLabel(code) {
    const map = {
      "zotero-folder": this.plugin.t("settingsWorkbenchMismatchZoteroFolder"),
      "zotero-template": this.plugin.t("settingsWorkbenchMismatchZoteroTemplate"),
      "zotero-attachments": this.plugin.t("settingsWorkbenchMismatchZoteroAttachments"),
      "zotero-open-note": this.plugin.t("settingsWorkbenchMismatchZoteroOpen"),
      "zotero-output-template": this.plugin.t("settingsWorkbenchMismatchZoteroOutput"),
      "zotero-cite-template": this.plugin.t("settingsWorkbenchMismatchZoteroCite"),
      "pdf-display-formats": this.plugin.t("settingsWorkbenchMismatchPdfDisplayFormats"),
      "pdf-default-display": this.plugin.t("settingsWorkbenchMismatchPdfDisplayDefault"),
      "pdf-copy-commands": this.plugin.t("settingsWorkbenchMismatchPdfCopy"),
      "pdf-hover-preview": this.plugin.t("settingsWorkbenchMismatchPdfHover"),
      "pdf-highlight-backlinks": this.plugin.t("settingsWorkbenchMismatchPdfBacklinks"),
      "pdf-selection-menu": this.plugin.t("settingsWorkbenchMismatchPdfSelectionMenu"),
      "pdf-annotation-menu": this.plugin.t("settingsWorkbenchMismatchPdfAnnotationMenu"),
      "smart-language": this.plugin.t("settingsWorkbenchMismatchSmartLanguage"),
      "smart-folder-exclusions": this.plugin.t("settingsWorkbenchMismatchSmartFolders"),
      "smart-heading-exclusions": this.plugin.t("settingsWorkbenchMismatchSmartHeadings"),
      "smart-results-limit": this.plugin.t("settingsWorkbenchMismatchSmartResults"),
      "smart-render-markdown": this.plugin.t("settingsWorkbenchMismatchSmartRender"),
      "semantic-command": this.plugin.t("settingsWorkbenchMismatchSemanticCommand")
    };
    return map[code] ?? code;
  }
  compactPathLabel(value) {
    const normalized = value.trim().replace(/\\/g, "/");
    if (!normalized) {
      return this.plugin.t("notConfigured");
    }
    const segments = normalized.split("/").filter(Boolean);
    return segments.at(-1) ?? normalized;
  }
  countAliasEntries(text) {
    try {
      const parsed = JSON.parse(text);
      return Object.keys(parsed).length;
    } catch {
      return 0;
    }
  }
  formatLanguageLabel(setting) {
    if (setting === "system") {
      return this.plugin.currentLanguage() === "zh" ? "\u7CFB\u7EDF" : "System";
    }
    return setting === "zh" ? "\u4E2D\u6587" : "English";
  }
  valueOrFallback(value) {
    if (typeof value === "number") {
      return String(value);
    }
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    return this.plugin.t("notConfigured");
  }
  joinList(value) {
    return Array.isArray(value) && value.length > 0 ? value.map(String).join(", ") : this.plugin.t("notConfigured");
  }
  booleanText(value) {
    return value === true ? this.plugin.t("settingsWorkbenchOn") : this.plugin.t("settingsWorkbenchOff");
  }
};

// src/view.ts
var import_obsidian10 = require("obsidian");
var LINK_TAG_INTELLIGENCE_VIEW = "link-tag-intelligence-view";
var LinkTagIntelligenceView = class extends import_obsidian10.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.sectionState = /* @__PURE__ */ new Map();
    this.refreshTimer = null;
    this.refreshPromise = null;
    this.isRefreshing = false;
    this.plugin = plugin;
  }
  getViewType() {
    return LINK_TAG_INTELLIGENCE_VIEW;
  }
  getDisplayText() {
    return this.plugin.t("viewTitle");
  }
  async onOpen() {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.sectionState.clear();
    this.contentEl.empty();
    this.containerEl.addClass("link-tag-intelligence-view");
    await this.refresh();
    if (!this.plugin.getContextNoteFile()) {
      this.refreshTimer = window.setTimeout(() => {
        this.refreshTimer = null;
        void this.refresh();
      }, 500);
    }
  }
  async refresh(options = {}) {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.refreshPromise !== null) {
      await this.refreshPromise;
    }
    this.refreshPromise = (async () => {
      try {
        await this.doRefresh(options);
      } finally {
        this.refreshPromise = null;
      }
    })();
    return this.refreshPromise;
  }
  async doRefresh(options = {}) {
    if (this.isRefreshing) {
      return;
    }
    this.isRefreshing = true;
    try {
      const scrollContainer = this.getScrollContainer();
      const previousScrollTop = options.preserveScroll ? scrollContainer.scrollTop : null;
      const content = this.contentEl;
      content.empty();
      content.addClass("link-tag-intelligence-view");
      const toolbar = content.createDiv({ cls: "lti-toolbar" });
      const hasContext = Boolean(this.plugin.getContextNoteFile());
      const fileRequiredKeys = /* @__PURE__ */ new Set(["insertLink", "insertBlockRef", "insertLineRef", "quickLink"]);
      const buttons = [
        ["ingestionCapture", () => this.plugin.openResearchIngestion()],
        ["insertLink", () => this.plugin.openLinkInsertModal("wikilink")],
        ["insertBlockRef", () => this.plugin.openBlockReferenceFlow()],
        ["insertLineRef", () => this.plugin.openLineReferenceFlow()],
        ["quickLink", () => this.plugin.openLinkInsertModal("quick_link")],
        ["addRelation", () => this.plugin.openRelationFlow()],
        ["manageTags", () => this.plugin.openTagManager()],
        ["suggestTags", () => this.plugin.openTagSuggestion()],
        ["semanticSearch", () => this.plugin.openSemanticSearch()]
      ];
      for (const [key, handler] of buttons) {
        const needsFile = fileRequiredKeys.has(key);
        const disabled = needsFile && !hasContext;
        const button = toolbar.createEl("button", {
          text: this.plugin.t(key),
          cls: "lti-toolbar-button"
        });
        button.dataset.action = key;
        if (disabled) {
          button.disabled = true;
          button.title = this.plugin.t("noActiveNote");
          button.addClass("lti-toolbar-button-disabled");
        } else {
          button.addEventListener("click", handler);
        }
      }
      const activeFile = this.plugin.getContextNoteFile();
      if (!(activeFile instanceof import_obsidian10.TFile)) {
        content.createDiv({ text: this.plugin.t("noActiveNote"), cls: "lti-empty" });
        return;
      }
      const currentSection = this.createSection(content, "current-note", this.plugin.t("currentNote"), void 0, true, true);
      if (currentSection) {
        const noteCard = currentSection.createDiv({ cls: "lti-item lti-item-compact lti-current-note-card" });
        const currentHeader = noteCard.createDiv({ cls: "lti-item-topline" });
        const currentLink = currentHeader.createEl("button", {
          text: activeFile.basename,
          cls: "lti-note-link lti-note-title",
          attr: { type: "button" }
        });
        currentLink.addEventListener("click", (event) => {
          event.preventDefault();
          this.plugin.openFile(activeFile);
        });
        noteCard.createSpan({ text: activeFile.path, cls: "lti-item-meta lti-item-path" });
        this.renderMetadataPills(noteCard, getResearchSourceMetadataForFile(this.app, activeFile));
      }
      this.renderFileSection(content, "outgoing-links", this.plugin.t("outgoingLinks"), await getOutgoingLinkFiles(this.app, activeFile), true);
      this.renderFileSection(content, "backlinks", this.plugin.t("backlinks"), await getBacklinkFiles(this.app, activeFile), false);
      if (!isExcalidrawFile(activeFile)) {
        this.renderExactReferenceSection(content, "outgoing-references", this.plugin.t("outgoingReferences"), await getOutgoingExactReferences(this.app, activeFile), "outgoing", true);
        this.renderExactReferenceSection(content, "incoming-references", this.plugin.t("incomingReferences"), await getIncomingExactReferences(this.app, activeFile), "incoming", false);
      }
      this.renderRelationSection(content, activeFile);
      this.renderTagSection(content, activeFile);
      await this.renderMentionsSection(content, activeFile);
      this.renderCaptureSection(content);
      this.renderSemanticSection(content);
      if (previousScrollTop !== null || options.focusSectionId) {
        window.requestAnimationFrame(() => {
          if (previousScrollTop !== null) {
            scrollContainer.scrollTop = previousScrollTop;
          }
          if (options.focusSectionId) {
            const toggle = this.contentEl.querySelector(`.lti-section-toggle[data-section-id="${options.focusSectionId}"]`);
            toggle?.focus({ preventScroll: true });
          }
        });
      }
    } finally {
      this.isRefreshing = false;
    }
  }
  renderFileSection(parent, id, title, files, defaultExpanded) {
    const section = this.createSection(parent, id, title, files.length, defaultExpanded);
    if (!section) {
      return;
    }
    if (files.length === 0) {
      section.createDiv({ text: this.plugin.t("emptyList"), cls: "lti-empty" });
      return;
    }
    const list = section.createDiv({ cls: "lti-list lti-list-compact" });
    for (const file of files) {
      const row = list.createDiv({ cls: "lti-list-row" });
      const header = row.createDiv({ cls: "lti-list-row-head" });
      const link = header.createEl("button", {
        text: file.basename,
        cls: "lti-note-link lti-list-row-title",
        attr: { type: "button" }
      });
      link.addEventListener("click", (event) => {
        event.preventDefault();
        this.plugin.openFile(file);
      });
      row.createDiv({ text: file.path, cls: "lti-list-row-path" });
    }
  }
  renderExactReferenceSection(parent, id, title, references, direction, defaultExpanded) {
    const section = this.createSection(parent, id, title, references.length, defaultExpanded);
    if (!section) {
      return;
    }
    if (references.length === 0) {
      section.createDiv({ text: this.plugin.t("emptyList"), cls: "lti-empty" });
      return;
    }
    const list = section.createDiv({ cls: "lti-list lti-list-compact" });
    for (const reference of references) {
      const row = list.createDiv({ cls: "lti-list-row lti-reference-row" });
      const header = row.createDiv({ cls: "lti-list-row-head" });
      const primaryFile = direction === "outgoing" ? reference.targetFile : reference.sourceFile;
      const link = header.createEl("button", {
        text: primaryFile.basename,
        cls: "lti-note-link lti-list-row-title",
        attr: { type: "button" }
      });
      link.addEventListener("click", (event) => {
        event.preventDefault();
        this.openPrimaryReference(reference, direction);
      });
      row.createDiv({ text: primaryFile.path, cls: "lti-list-row-path" });
      const meta = row.createDiv({ cls: "lti-pill-row lti-pill-row-compact lti-reference-meta" });
      meta.createSpan({
        text: this.plugin.t(reference.kind === "block" ? "referenceTypeBlock" : "referenceTypeLine"),
        cls: "lti-pill"
      });
      meta.createSpan({ text: reference.raw, cls: "lti-ref-syntax lti-list-row-code" });
      this.renderMetadataPills(row, direction === "outgoing" ? reference.targetMetadata : reference.sourceMetadata);
      const preview = direction === "outgoing" ? reference.targetPreview : reference.sourceContext;
      if (preview) {
        row.createDiv({ text: preview, cls: "lti-list-row-snippet" });
      }
    }
  }
  renderRelationSection(parent, activeFile) {
    const section = this.createSection(parent, "relations", this.plugin.t("relations"), Object.keys(getResolvedRelations(this.app, activeFile, this.plugin.settings)).length, false);
    if (!section) {
      return;
    }
    const relationMap = getResolvedRelations(this.app, activeFile, this.plugin.settings);
    if (Object.keys(relationMap).length === 0) {
      section.createDiv({ text: this.plugin.t("emptyList"), cls: "lti-empty" });
      return;
    }
    const list = section.createDiv({ cls: "lti-list lti-compact-list" });
    for (const [key, files] of Object.entries(relationMap)) {
      const block = list.createDiv({ cls: "lti-item lti-item-compact" });
      const header = block.createDiv({ cls: "lti-section-inline-head" });
      header.createDiv({ text: this.plugin.relationLabel(key), cls: "suggestion-title" });
      header.createSpan({ text: key, cls: "suggestion-meta" });
      const pills = block.createDiv({ cls: "lti-pill-row lti-pill-grid" });
      for (const file of files) {
        const pill = pills.createEl("button", {
          text: file.basename,
          cls: "lti-pill lti-note-link lti-pill-link",
          attr: { type: "button" }
        });
        pill.addEventListener("click", (event) => {
          event.preventDefault();
          this.plugin.openFile(file);
        });
      }
    }
  }
  renderTagSection(parent, activeFile) {
    const tags = getAllTagsForFile(this.app, activeFile);
    const section = this.createSection(parent, "tags", this.plugin.t("tags"), tags.length, true);
    if (!section) {
      return;
    }
    if (tags.length === 0) {
      section.createDiv({ text: this.plugin.t("emptyList"), cls: "lti-empty" });
      return;
    }
    const grouped = /* @__PURE__ */ new Map();
    const unclassified = [];
    for (const tag of tags) {
      const facet = this.plugin.getFacetForTag(tag);
      if (!facet) {
        unclassified.push(tag);
        continue;
      }
      grouped.set(facet, [...grouped.get(facet) ?? [], tag]);
    }
    if (grouped.size === 0) {
      const pills = section.createDiv({ cls: "lti-pill-row lti-tag-grid" });
      for (const tag of tags) {
        pills.createSpan({ text: `#${tag}`, cls: "lti-pill lti-tag-chip" });
      }
      return;
    }
    for (const [facet, facetTags] of [...grouped.entries()].sort((left, right) => left[0].localeCompare(right[0], "zh-Hans-CN"))) {
      const block = section.createDiv({ cls: "lti-item lti-item-compact" });
      const header = block.createDiv({ cls: "lti-section-inline-head" });
      header.createDiv({ text: this.plugin.formatFacetLabel(facet), cls: "suggestion-title" });
      header.createSpan({ text: String(facetTags.length), cls: "suggestion-meta" });
      const pills = block.createDiv({ cls: "lti-pill-row lti-tag-grid" });
      for (const tag of facetTags) {
        pills.createSpan({ text: `#${tag}`, cls: "lti-pill lti-tag-chip" });
      }
    }
    if (unclassified.length > 0) {
      const block = section.createDiv({ cls: "lti-item lti-item-compact" });
      const header = block.createDiv({ cls: "lti-section-inline-head" });
      header.createDiv({ text: this.plugin.t("tagFacetUnclassified"), cls: "suggestion-title" });
      header.createSpan({ text: String(unclassified.length), cls: "suggestion-meta" });
      const pills = block.createDiv({ cls: "lti-pill-row lti-tag-grid" });
      for (const tag of unclassified) {
        pills.createSpan({ text: `#${tag}`, cls: "lti-pill lti-tag-chip" });
      }
    }
  }
  async renderMentionsSection(parent, activeFile) {
    const mentions = await findUnlinkedMentions(this.app, activeFile, this.plugin.settings);
    const section = this.createSection(parent, "mentions", this.plugin.t("unlinkedMentions"), mentions.length, false);
    if (!section) {
      return;
    }
    section.createDiv({ text: this.plugin.t("mentionsExplanation"), cls: "lti-item-subtext" });
    if (mentions.length === 0) {
      section.createDiv({ text: this.plugin.t("emptyList"), cls: "lti-empty" });
      return;
    }
    const list = section.createDiv({ cls: "lti-list lti-list-compact" });
    for (const mention of mentions) {
      const row = list.createDiv({ cls: "lti-list-row" });
      const header = row.createDiv({ cls: "lti-list-row-head" });
      const link = header.createEl("button", {
        text: mention.file.basename,
        cls: "lti-note-link lti-list-row-title",
        attr: { type: "button" }
      });
      link.addEventListener("click", (event) => {
        event.preventDefault();
        this.plugin.openFile(mention.file);
      });
      const meta = header.createDiv({ cls: "lti-list-row-meta" });
      meta.createSpan({ text: mention.matchedTerm, cls: "lti-pill" });
      row.createDiv({ text: mention.file.path, cls: "lti-list-row-path" });
      row.createDiv({ text: mention.snippet, cls: "lti-list-row-snippet" });
    }
  }
  renderSemanticSection(parent) {
    const section = this.createSection(parent, "semantic", this.plugin.t("semanticBridge"), void 0, false);
    if (!section) {
      return;
    }
    section.createDiv({
      text: isSemanticBridgeConfigured(this.plugin.settings) ? this.plugin.t("configured") : this.plugin.t("notConfigured"),
      cls: "lti-item-subtext"
    });
    if (this.plugin.settings.workflowMode === "researcher") {
      section.createDiv({
        text: this.plugin.t("settingsSemanticResearchHint"),
        cls: "lti-item-subtext"
      });
    }
  }
  renderCaptureSection(parent) {
    const section = this.createSection(parent, "capture", this.plugin.t("ingestionCapture"), void 0, false);
    if (!section) {
      return;
    }
    section.createDiv({
      text: isIngestionConfigured(this.plugin.settings) ? this.plugin.t("configured") : this.plugin.t("notConfigured"),
      cls: "lti-item-subtext"
    });
    section.createDiv({
      text: this.plugin.t("ingestionStatusHint"),
      cls: "lti-item-subtext"
    });
  }
  renderMetadataPills(parent, metadata) {
    const chips = this.plugin.formatResearchMetadataChips(metadata);
    if (chips.length === 0) {
      return;
    }
    const metaRow = parent.createDiv({ cls: "lti-pill-row lti-pill-row-compact lti-reference-meta" });
    for (const chip of chips) {
      metaRow.createSpan({ text: chip, cls: "lti-pill" });
    }
  }
  createSection(parent, id, title, count, defaultExpanded = false, emphasized = false) {
    const expanded = this.getSectionExpanded(id, defaultExpanded);
    const section = parent.createDiv({ cls: `lti-section${emphasized ? " lti-note-focus" : ""}` });
    section.dataset.sectionId = id;
    const header = section.createDiv({ cls: "lti-section-header" });
    header.dataset.sectionId = id;
    const toggle = header.createDiv({ cls: "lti-section-toggle" });
    toggle.dataset.sectionId = id;
    toggle.setAttribute("role", "button");
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    toggle.setAttribute("aria-label", title);
    toggle.tabIndex = 0;
    toggle.createSpan({ text: ">", cls: "lti-section-chevron" });
    toggle.createSpan({ text: title, cls: "lti-section-toggle-title" });
    if (typeof count === "number") {
      toggle.createSpan({ text: String(count), cls: "lti-section-count" });
    }
    const onToggle = () => {
      const newExpanded = !this.getSectionExpanded(id, defaultExpanded);
      this.sectionState.set(id, newExpanded);
      section.classList.toggle("is-collapsed", !newExpanded);
      body.classList.toggle("is-collapsed", !newExpanded);
    };
    toggle.addEventListener("click", onToggle);
    toggle.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onToggle();
      }
    });
    const body = section.createDiv({ cls: "lti-section-body" });
    body.dataset.sectionId = id;
    const inner = body.createDiv({ cls: "lti-section-inner" });
    if (!expanded) {
      body.addClass("is-collapsed");
    }
    return inner;
  }
  getSectionExpanded(id, defaultExpanded) {
    return this.sectionState.get(id) ?? defaultExpanded;
  }
  getScrollContainer() {
    return this.contentEl.closest(".view-content") instanceof HTMLElement ? this.contentEl.closest(".view-content") : this.contentEl;
  }
  openExactReference(reference) {
    if (reference.kind === "block" && reference.blockId) {
      this.plugin.openFileAtBlock(reference.targetFile, reference.blockId);
      return;
    }
    if (typeof reference.startLine === "number") {
      this.plugin.openFileAtLine(reference.targetFile, reference.startLine, reference.endLine);
      return;
    }
    this.plugin.openFile(reference.targetFile);
  }
  openPrimaryReference(reference, direction) {
    if (direction === "outgoing") {
      this.openExactReference(reference);
      return;
    }
    if (typeof reference.sourceStartLine === "number") {
      this.plugin.openFileAtLine(reference.sourceFile, reference.sourceStartLine, reference.sourceEndLine);
      return;
    }
    this.plugin.openFile(reference.sourceFile);
  }
  onClose() {
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.contentEl.empty();
    return Promise.resolve();
  }
};

// src/main.ts
var LinkTagIntelligencePlugin = class extends import_obsidian11.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.lastEditorLeaf = null;
    this.lastEditorFilePath = null;
    this.lastSupportedFilePath = null;
    this.lastExcalidrawFilePath = null;
    this.referencePreview = new ReferencePreviewPopover();
    this.referencePreviewToken = 0;
  }
  async onload() {
    await this.loadSettings();
    const debugLogPath = await resetDebugLog(this.app);
    debugLog(this.app, "plugin.onload", {
      version: this.manifest.version,
      debugLogPath,
      language: this.settings.language,
      ingestionCommandConfigured: Boolean(this.settings.ingestionCommand.trim()),
      semanticBridgeEnabled: this.settings.semanticBridgeEnabled
    });
    this.referencePreview.setOnHide(() => {
      this.referencePreviewToken += 1;
      debugLog(this.app, "editor.preview.hide-callback", {
        token: this.referencePreviewToken
      });
    });
    this.registerView(
      LINK_TAG_INTELLIGENCE_VIEW,
      (leaf) => new LinkTagIntelligenceView(leaf, this)
    );
    this.addRibbonIcon("links-coming-in", this.t("openPanel"), () => {
      void this.openIntelligencePanel();
    });
    this.addCommand({
      id: "open-panel",
      name: this.t("openPanel"),
      callback: () => {
        void this.openIntelligencePanel();
      }
    });
    this.addCommand({
      id: "insert-link-with-preview",
      name: this.t("insertLink"),
      checkCallback: (checking) => {
        if (!this.getContextNoteFile()) {
          return false;
        }
        if (!checking) {
          this.openLinkInsertModal("wikilink");
        }
        return true;
      }
    });
    this.addCommand({
      id: "quick-link-selection",
      name: this.t("quickLink"),
      checkCallback: (checking) => {
        if (!this.getContextNoteFile()) {
          return false;
        }
        if (!checking) {
          this.openLinkInsertModal("quick_link");
        }
        return true;
      }
    });
    this.addCommand({
      id: "insert-block-reference",
      name: this.t("insertBlockRef"),
      checkCallback: (checking) => {
        if (!this.getContextNoteFile()) {
          return false;
        }
        if (!checking) {
          this.openBlockReferenceFlow();
        }
        return true;
      }
    });
    this.addCommand({
      id: "insert-line-reference",
      name: this.t("insertLineRef"),
      checkCallback: (checking) => {
        if (!this.getContextNoteFile()) {
          return false;
        }
        if (!checking) {
          this.openLineReferenceFlow();
        }
        return true;
      }
    });
    this.addCommand({
      id: "add-relation-to-current-note",
      name: this.t("addRelation"),
      checkCallback: (checking) => {
        const activeFile2 = this.getContextNoteFile();
        if (!activeFile2) {
          return false;
        }
        if (!checking) {
          this.openRelationFlow();
        }
        return true;
      }
    });
    this.addCommand({
      id: "manage-native-tags",
      name: this.t("manageTags"),
      callback: () => this.openTagManager()
    });
    this.addCommand({
      id: "suggest-tags-for-current-note",
      name: this.t("suggestTags"),
      checkCallback: (checking) => {
        const activeFile2 = this.getContextNoteFile();
        if (!(activeFile2 instanceof import_obsidian11.TFile)) {
          return false;
        }
        if (!checking) {
          this.openTagSuggestion();
        }
        return true;
      }
    });
    this.addCommand({
      id: "ingest-research-source",
      name: this.t("ingestionCapture"),
      callback: () => this.openResearchIngestion()
    });
    this.addCommand({
      id: "semantic-search-external",
      name: this.t("semanticSearch"),
      callback: () => this.openSemanticSearch()
    });
    this.addSettingTab(new LinkTagIntelligenceSettingTab(this.app, this));
    this.registerHoverLinkSource("link-tag-intelligence", {
      display: this.t("pluginName"),
      defaultMod: false
    });
    this.captureEditorContext(this.getActiveEditorLeaf());
    const activeFile = this.getActiveSupportedFile();
    if (activeFile) {
      this.lastSupportedFilePath = activeFile.path;
    }
    if (!this.lastEditorLeaf) {
      this.captureEditorContext(this.app.workspace.getLeavesOfType("markdown")[0] ?? null);
    }
    this.registerEvent(this.app.workspace.on("file-open", (file) => {
      debugLog(this.app, "file-open", {
        file: file?.path ?? null,
        isSupported: isSupportedNoteFile(file),
        isExcalidraw: file instanceof import_obsidian11.TFile ? isExcalidrawFile(file) : false,
        lastSupportedFilePath: this.lastSupportedFilePath,
        lastExcalidrawFilePath: this.lastExcalidrawFilePath
      });
      if (file instanceof import_obsidian11.TFile && isSupportedNoteFile(file)) {
        this.captureSupportedFileContext(file);
        this.lastSupportedFilePath = file.path;
        if (isExcalidrawFile(file)) {
          this.lastExcalidrawFilePath = file.path;
        }
      }
      this.refreshAllViews();
    }));
    this.registerEvent(this.app.metadataCache.on("changed", () => this.refreshAllViews()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => {
      const viewType = leaf?.view?.getViewType() ?? null;
      const viewFile = leaf?.view instanceof import_obsidian11.FileView ? leaf.view.file?.path ?? null : null;
      debugLog(this.app, "active-leaf-change:before-timeout", {
        viewType,
        viewFile,
        lastSupportedFilePath: this.lastSupportedFilePath,
        lastExcalidrawFilePath: this.lastExcalidrawFilePath
      });
      setTimeout(() => {
        const view = leaf?.view;
        let leafFile = null;
        let isExcalidrawViewReady = false;
        if (view instanceof import_obsidian11.FileView) {
          leafFile = view.file;
          const isExcalidraw = view.getViewType() === "excalidraw";
          if (isExcalidraw) {
            if (leafFile instanceof import_obsidian11.TFile) {
              this.lastExcalidrawFilePath = leafFile.path;
              isExcalidrawViewReady = true;
            } else if (this.lastExcalidrawFilePath) {
              const lastFile = this.app.vault.getAbstractFileByPath(this.lastExcalidrawFilePath);
              if (isSupportedNoteFile(lastFile)) {
                leafFile = lastFile;
                isExcalidrawViewReady = true;
              }
            }
          }
        }
        debugLog(this.app, "active-leaf-change:after-timeout", {
          viewType: view?.getViewType() ?? null,
          leafFile: leafFile?.path ?? null,
          isExcalidrawViewReady,
          lastSupportedFilePath: this.lastSupportedFilePath,
          lastExcalidrawFilePath: this.lastExcalidrawFilePath
        });
        const fileChanged = this.captureSupportedFileContext(leafFile);
        const editorChanged = this.captureEditorContext(leaf);
        if (editorChanged || fileChanged || isExcalidrawViewReady) {
          this.refreshAllViews();
        }
      }, 0);
    }));
    this.registerEvent(this.app.vault.on("rename", () => this.refreshAllViews()));
    this.registerMarkdownPostProcessor((el, ctx) => renderLegacyReferences(el, ctx, {
      app: this.app,
      resolveTarget: (target, sourcePath) => resolveNoteTarget(this.app, target, sourcePath),
      openResolvedLineReference: (target, sourcePath, startLine, endLine) => this.openResolvedLineReference(target, sourcePath, startLine, endLine),
      getReadingHoverController: (containerEl, childCtx) => getReadingReferenceHoverController(
        this.app,
        containerEl,
        childCtx,
        (options) => this.getReferencePreviewData(options)
      )
    }));
    this.registerEditorExtension(buildReferenceEditorExtension(this));
  }
  onunload() {
    this.app.workspace.detachLeavesOfType(LINK_TAG_INTELLIGENCE_VIEW);
    this.referencePreview.destroy();
  }
  async loadSettings() {
    this.settings = normalizeLoadedSettings(await this.loadData(), this.app.vault.configDir);
  }
  async saveSettings() {
    const memory = Math.max(1, this.settings.recentLinkMemorySize);
    this.settings.recentLinkTargets = this.settings.recentLinkTargets.slice(0, memory);
    await this.saveData(this.settings);
  }
  async getResearchWorkbenchState() {
    return readResearchWorkbenchState(
      this.app,
      buildResearchWorkbenchProfile(this.settings, this.currentLanguage())
    );
  }
  async applyResearchPreset() {
    const state = await this.getResearchWorkbenchState();
    for (const companionId of ["pdf-plus", "smart-connections"]) {
      const status = state.companions.find((item) => item.id === companionId);
      if (!status?.installed) {
        continue;
      }
      await applyCompanionPresetToVault(this.app, companionId, state.profile);
    }
    this.refreshAllViews();
    new import_obsidian11.Notice(this.t("settingsWorkbenchPresetApplied"));
  }
  async applyCompanionPreset(id) {
    if (id === "semantic-bridge") {
      await this.saveSettings();
      this.refreshAllViews();
      new import_obsidian11.Notice(this.t("settingsWorkbenchCompanionApplied", { name: "Semantic bridge" }));
      return true;
    }
    const state = await this.getResearchWorkbenchState();
    const status = state.companions.find((item) => item.id === id);
    if (!status?.installed) {
      new import_obsidian11.Notice(this.t("settingsWorkbenchPluginMissing"));
      return false;
    }
    await applyCompanionPresetToVault(this.app, id, state.profile);
    this.refreshAllViews();
    new import_obsidian11.Notice(this.t("settingsWorkbenchCompanionApplied", { name: this.getCompanionDisplayName(id) }));
    return true;
  }
  openCompanionSettings(id) {
    const settingApi = this.app.setting;
    if (!settingApi?.open || !settingApi.openTabById) {
      new import_obsidian11.Notice(this.t("settingsWorkbenchSettingsUnavailable"));
      return false;
    }
    settingApi.open();
    settingApi.openTabById(id === "semantic-bridge" ? this.manifest.id : id);
    return true;
  }
  async importZoteroNotes() {
    return this.executeCommandByCandidates([
      "obsidian-zotero-desktop-connector:zdc-import-notes",
      "zdc-import-notes"
    ]);
  }
  async openSmartConnectionsView() {
    return this.executeCommandByCandidates([
      "smart-connections:smart-connections-view",
      "smart-connections-view"
    ]);
  }
  openPdfPlusSettings() {
    return this.openCompanionSettings("pdf-plus");
  }
  currentLanguage() {
    return resolveLanguage(this.settings.language);
  }
  t(key, vars) {
    return tr(this.currentLanguage(), key, vars);
  }
  relationLabel(key) {
    return relationKeyLabel(this.currentLanguage(), key);
  }
  getTagAliasMap() {
    try {
      return parseTagAliasMap(this.settings.tagAliasMapText);
    } catch (error) {
      console.warn(error);
      new import_obsidian11.Notice(this.t("invalidAliasMap"));
      return /* @__PURE__ */ new Map();
    }
  }
  getTagFacetMap(options = {}) {
    try {
      return parseTagFacetMap(this.settings.tagFacetMapText);
    } catch (error) {
      console.warn(error);
      if (!options.suppressNotice) {
        new import_obsidian11.Notice(this.t("invalidFacetMap"));
      }
      return /* @__PURE__ */ new Map();
    }
  }
  formatFacetLabel(facet) {
    return formatFacetName(facet);
  }
  getFacetForTag(tag) {
    const normalizedTag = tag.trim().toLowerCase();
    if (!normalizedTag) {
      return null;
    }
    for (const [facet, entries] of this.getTagFacetMap({ suppressNotice: true })) {
      for (const [canonical, aliases] of entries) {
        if (canonical.toLowerCase() === normalizedTag || aliases.some((alias) => alias.toLowerCase() === normalizedTag)) {
          return facet;
        }
      }
    }
    return null;
  }
  formatResearchMetadataChips(metadata) {
    if (!metadata) {
      return [];
    }
    const chips = [];
    if (metadata.citekey) {
      chips.push(`@${metadata.citekey}`);
    }
    const authorYear = [metadata.author, metadata.year].filter(Boolean).join(" ");
    if (authorYear) {
      chips.push(authorYear);
    }
    if (metadata.sourceType) {
      chips.push(formatFacetName(metadata.sourceType));
    }
    if (metadata.evidenceKind) {
      chips.push(formatFacetName(metadata.evidenceKind));
    }
    if (metadata.locator) {
      chips.push(/^(p|pp|sec|chapter|ch)\b/i.test(metadata.locator) ? metadata.locator : `p. ${metadata.locator}`);
    }
    return chips;
  }
  formatResearchMetadataSummary(metadata) {
    return this.formatResearchMetadataChips(metadata).join(" \xB7 ");
  }
  formatSuggestedRelationSummary(relations) {
    return Object.entries(relations).filter(([, values]) => values.length > 0).map(([key, values]) => `${this.relationLabel(key)} (${values.length})`).join(" \xB7 ");
  }
  getActiveSupportedFile() {
    const activeFile = this.app.workspace.getActiveFile();
    return isSupportedNoteFile(activeFile) ? activeFile : null;
  }
  getActiveEditorLeaf() {
    const activeView = this.app.workspace.getActiveViewOfType(import_obsidian11.MarkdownView);
    if (!(activeView?.file instanceof import_obsidian11.TFile) || !isSupportedNoteFile(activeView.file)) {
      return null;
    }
    return activeView.leaf;
  }
  captureSupportedFileContext(file) {
    if (!isSupportedNoteFile(file)) {
      return false;
    }
    const changed = this.lastSupportedFilePath !== file.path;
    this.lastSupportedFilePath = file.path;
    return changed;
  }
  captureEditorContext(leaf) {
    const view = leaf?.view;
    if (!(view instanceof import_obsidian11.MarkdownView) || !(view.file instanceof import_obsidian11.TFile) || !isSupportedNoteFile(view.file)) {
      return false;
    }
    const editorChanged = this.lastEditorLeaf !== leaf || this.lastEditorFilePath !== view.file.path;
    this.lastEditorLeaf = leaf;
    this.lastEditorFilePath = view.file.path;
    const fileChanged = this.captureSupportedFileContext(view.file);
    return editorChanged || fileChanged;
  }
  getContextEditorView() {
    const activeView = this.app.workspace.getActiveViewOfType(import_obsidian11.MarkdownView);
    if (activeView?.file instanceof import_obsidian11.TFile && isSupportedNoteFile(activeView.file)) {
      this.captureEditorContext(activeView.leaf);
      return activeView;
    }
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile && !isSupportedNotePath(activeFile.path)) {
      return null;
    }
    const rememberedView = this.lastEditorLeaf?.view;
    if (rememberedView instanceof import_obsidian11.MarkdownView && rememberedView.file instanceof import_obsidian11.TFile && isSupportedNoteFile(rememberedView.file)) {
      this.lastEditorFilePath = rememberedView.file.path;
      return rememberedView;
    }
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof import_obsidian11.MarkdownView) || !(view.file instanceof import_obsidian11.TFile) || !isSupportedNoteFile(view.file)) {
        continue;
      }
      if (!this.lastEditorFilePath || view.file.path === this.lastEditorFilePath) {
        this.captureEditorContext(leaf);
        return view;
      }
    }
    return null;
  }
  getContextMarkdownView() {
    return this.getContextEditorView();
  }
  getContextNoteFile() {
    const activeFile = this.app.workspace.getActiveFile();
    const activeView = this.app.workspace.getActiveViewOfType(import_obsidian11.FileView);
    const leafViewFile = activeView?.file ?? null;
    debugLog(this.app, "getContextNoteFile", {
      getActiveFile_result: activeFile?.path ?? null,
      leafViewFile: leafViewFile?.path ?? null,
      isSupported_activeFile: isSupportedNoteFile(activeFile),
      isExcalidraw_leafViewFile: leafViewFile instanceof import_obsidian11.TFile ? isExcalidrawFile(leafViewFile) : false,
      lastSupportedFilePath: this.lastSupportedFilePath,
      lastExcalidrawFilePath: this.lastExcalidrawFilePath
    });
    if (activeFile instanceof import_obsidian11.TFile) {
      if (isSupportedNoteFile(activeFile)) {
        this.captureSupportedFileContext(activeFile);
        return activeFile;
      }
    }
    if (activeView) {
      const leafFile = activeView.file;
      if (leafFile instanceof import_obsidian11.TFile && isSupportedNoteFile(leafFile)) {
        this.captureSupportedFileContext(leafFile);
        if (isExcalidrawFile(leafFile)) {
          this.lastExcalidrawFilePath = leafFile.path;
        }
        return leafFile;
      }
      if (!leafFile && activeView.getViewType() === "excalidraw" && this.lastExcalidrawFilePath) {
        const lastFile = this.app.vault.getAbstractFileByPath(this.lastExcalidrawFilePath);
        if (isSupportedNoteFile(lastFile)) {
          return lastFile;
        }
      }
    }
    const view = this.getContextEditorView();
    if (view?.file instanceof import_obsidian11.TFile && isSupportedNoteFile(view.file)) {
      return view.file;
    }
    if (!this.lastSupportedFilePath) {
      return null;
    }
    const file = this.app.vault.getAbstractFileByPath(this.lastSupportedFilePath);
    return isSupportedNoteFile(file) ? file : null;
  }
  getContextMarkdownFile() {
    return this.getContextNoteFile();
  }
  getContextSelection() {
    return this.getContextEditorView()?.editor?.getSelection() ?? "";
  }
  getNavigationLeaf() {
    const activeLeaf = this.app.workspace.getMostRecentLeaf();
    const activeFile = this.getActiveSupportedFile();
    if (activeLeaf && activeFile) {
      this.captureSupportedFileContext(activeFile);
      if (activeLeaf.view instanceof import_obsidian11.MarkdownView) {
        this.captureEditorContext(activeLeaf);
        return activeLeaf;
      }
    }
    if (this.lastEditorLeaf) {
      return this.lastEditorLeaf;
    }
    const fallbackLeaf = this.app.workspace.getLeavesOfType("markdown")[0];
    if (fallbackLeaf) {
      this.captureEditorContext(fallbackLeaf);
      return fallbackLeaf;
    }
    return this.app.workspace.getLeaf(true);
  }
  async openIntelligencePanel() {
    const existing = this.app.workspace.getLeavesOfType(LINK_TAG_INTELLIGENCE_VIEW)[0];
    const leaf = existing ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      return;
    }
    await leaf.setViewState({ type: LINK_TAG_INTELLIGENCE_VIEW, active: true });
    await this.app.workspace.revealLeaf(leaf);
    this.refreshAllViews();
  }
  refreshAllViews() {
    const leaves = this.app.workspace.getLeavesOfType(LINK_TAG_INTELLIGENCE_VIEW);
    debugLog(this.app, "refreshAllViews", { leafCount: leaves.length });
    for (const leaf of leaves) {
      const view = leaf.view;
      debugLog(this.app, "refreshAllViews:viewCheck", {
        viewType: view?.constructor.name,
        isLTIView: view instanceof LinkTagIntelligenceView
      });
      if (view instanceof LinkTagIntelligenceView) {
        void view.refresh();
      }
    }
  }
  openLinkInsertModal(mode) {
    new LinkInsertModal(this, mode).open();
  }
  openBlockReferenceFlow() {
    new LinkInsertModal(
      this,
      "wikilink",
      (candidate) => {
        new ReferenceInsertModal(this, candidate.file, "block_ref").open();
      },
      { placeholder: this.t("pickBlockRefTarget") }
    ).open();
  }
  openLineReferenceFlow() {
    new LinkInsertModal(
      this,
      "wikilink",
      (candidate) => {
        new ReferenceInsertModal(this, candidate.file, "line_ref").open();
      },
      { placeholder: this.t("pickLineRefTarget") }
    ).open();
  }
  async insertTextIntoFile(text) {
    const editor = this.getContextEditorView()?.editor;
    if (editor) {
      editor.replaceSelection(text);
      this.refreshAllViews();
      return true;
    }
    const file = this.getContextNoteFile();
    if (!file) {
      new import_obsidian11.Notice(this.t("noActiveNote"));
      return false;
    }
    await this.app.vault.process(
      file,
      (content) => appendTextToMarkdownSection(content, text, isExcalidrawFile(file))
    );
    new import_obsidian11.Notice(this.t("appendedToFile", { title: file.basename }));
    this.refreshAllViews();
    return true;
  }
  async insertLinkIntoEditor(file, alias = "") {
    const normalizedAlias = alias.trim();
    const linkText = normalizedAlias ? `[[${file.basename}|${normalizedAlias}]]` : `[[${file.basename}]]`;
    const targetFile = this.getContextNoteFile();
    debugLog(this.app, "insertLinkIntoEditor", {
      targetFile: targetFile?.path ?? null,
      isExcalidrawTarget: targetFile ? isExcalidrawFile(targetFile) : false
    });
    if (targetFile && isExcalidrawFile(targetFile)) {
      const plugins = this.app.plugins?.plugins;
      const excalidrawPlugin = plugins?.["obsidian-excalidraw-plugin"];
      debugLog(this.app, "insertLinkIntoEditor:excalidraw", {
        hasPlugins: !!plugins,
        hasExcalidrawPlugin: !!excalidrawPlugin,
        hasEa: !!excalidrawPlugin?.ea
      });
      if (excalidrawPlugin?.ea) {
        const excalidrawLeaves = this.app.workspace.getLeavesOfType("excalidraw");
        const targetView = excalidrawLeaves.find((leaf) => leaf.view?.file?.path === targetFile.path);
        debugLog(this.app, "insertLinkIntoEditor:excalidraw:view", {
          excalidrawLeafCount: excalidrawLeaves.length,
          foundTargetView: !!targetView
        });
        const ea = excalidrawPlugin.ea;
        if (targetView) {
          ea.setView(targetView.view, false);
        }
        ea.clear();
        ea.addEmbeddable(100, 100, 200, 50, void 0, file, void 0);
        await ea.addElementsToView(true, true);
        this.pushRecentTarget(file.path);
        new import_obsidian11.Notice(this.t("insertedLink", { title: file.basename }));
        this.refreshAllViews();
        return;
      }
    }
    if (await this.insertTextIntoFile(linkText)) {
      this.pushRecentTarget(file.path);
      new import_obsidian11.Notice(this.t("insertedLink", { title: file.basename }));
    }
  }
  async insertBlockReferenceIntoEditor(file, startLine, endLine) {
    const sourcePath = this.getContextNoteFile()?.path ?? "";
    const target = sourcePath ? this.app.metadataCache.fileToLinktext(file, sourcePath, true) : file.basename;
    const text = formatLegacyBlockReference(target, startLine, endLine);
    if (await this.insertTextIntoFile(text)) {
      this.pushRecentTarget(file.path);
      new import_obsidian11.Notice(this.t("blockRefInserted", { title: file.basename }));
    }
  }
  async insertLineReferenceIntoEditor(file, startLine, endLine) {
    const sourcePath = this.getContextNoteFile()?.path ?? "";
    const target = sourcePath ? this.app.metadataCache.fileToLinktext(file, sourcePath, true) : file.basename;
    const text = formatLegacyLineReference(target, startLine, endLine);
    if (await this.insertTextIntoFile(text)) {
      this.pushRecentTarget(file.path);
      new import_obsidian11.Notice(this.t("lineRefInserted", { title: file.basename }));
    }
  }
  async getReferenceTooltip(options) {
    const preview = await this.getReferencePreviewData(options);
    return [preview.path, preview.location, preview.snippet].filter(Boolean).join("\n");
  }
  async getReferencePreviewData(options) {
    const kindLabel = options.kind === "line" ? this.t("referenceTypeLine") : this.t("referenceTypeBlock");
    const fallbackLocation = this.describeReferenceLocation(options);
    const fallbackSnippet = options.raw?.trim() || this.t("referenceNoPreview");
    const file = resolveNoteTarget(this.app, options.target, options.sourcePath);
    if (!file) {
      return {
        kindLabel,
        title: options.target,
        path: "",
        location: fallbackLocation,
        snippet: fallbackSnippet,
        missing: true
      };
    }
    if (options.kind === "native-block" && options.blockId) {
      const preview = await getBlockReferencePreview(this.app, file, options.blockId);
      return {
        kindLabel,
        title: file.basename,
        path: file.path,
        location: preview ? `${this.formatRangeLabel(preview.startLine, preview.endLine)} \xB7 ^${preview.blockId}` : `^${options.blockId}`,
        snippet: preview?.preview || fallbackSnippet
      };
    }
    if (typeof options.startLine === "number") {
      const preview = await getLineRangePreview(this.app, file, options.startLine, options.endLine);
      return {
        kindLabel,
        title: file.basename,
        path: file.path,
        location: this.formatRangeLabel(options.startLine, options.endLine),
        snippet: preview || fallbackSnippet
      };
    }
    return {
      kindLabel,
      title: file.basename,
      path: file.path,
      location: fallbackLocation,
      snippet: fallbackSnippet
    };
  }
  async showReferencePreview(anchor, options) {
    const token = ++this.referencePreviewToken;
    this.cancelHideReferencePreview();
    debugLog(this.app, "editor.preview.show-request", {
      token,
      kind: options.kind,
      target: options.target,
      sourcePath: options.sourcePath,
      blockId: options.blockId,
      startLine: options.startLine,
      endLine: options.endLine,
      anchorClass: anchor.className
    });
    const data = await this.getReferencePreviewData(options);
    if (token !== this.referencePreviewToken) {
      debugLog(this.app, "editor.preview.show-abort", {
        token,
        currentToken: this.referencePreviewToken,
        target: options.target
      });
      return;
    }
    debugLog(this.app, "editor.preview.show-commit", {
      token,
      target: options.target,
      snippetPreview: data.snippet.slice(0, 120)
    });
    this.referencePreview.show(anchor, data);
  }
  triggerNativeHoverPreview(event, targetEl, hoverParent, options) {
    const file = resolveNoteTarget(this.app, options.target, options.sourcePath);
    if (!file) {
      return false;
    }
    let linktext = file.path;
    if (options.kind === "native-block" && options.blockId) {
      linktext = `${file.path}#^${options.blockId}`;
    }
    this.app.workspace.trigger("hover-link", {
      event,
      source: "link-tag-intelligence",
      hoverParent,
      targetEl,
      linktext,
      sourcePath: options.sourcePath
    });
    return true;
  }
  cancelHideReferencePreview() {
    debugLog(this.app, "editor.preview.cancel-hide", {
      token: this.referencePreviewToken
    });
    this.referencePreview.cancelHide();
  }
  scheduleHideReferencePreview() {
    this.referencePreviewToken += 1;
    debugLog(this.app, "editor.preview.schedule-hide", {
      token: this.referencePreviewToken
    });
    this.referencePreview.scheduleHide();
  }
  hideReferencePreview() {
    this.referencePreviewToken += 1;
    debugLog(this.app, "editor.preview.hide-now", {
      token: this.referencePreviewToken
    });
    this.referencePreview.hide(true);
  }
  pushRecentTarget(path) {
    this.settings.recentLinkTargets = [path, ...this.settings.recentLinkTargets.filter((item) => item !== path)].slice(
      0,
      this.settings.recentLinkMemorySize
    );
    void this.saveSettings();
  }
  openRelationFlow() {
    const currentFile = this.getContextNoteFile();
    if (!(currentFile instanceof import_obsidian11.TFile)) {
      return;
    }
    new RelationKeyModal(this, (relationKey) => {
      new LinkInsertModal(this, "wikilink", async (candidate) => {
        await this.app.fileManager.processFrontMatter(currentFile, (frontmatter) => {
          const existing = Array.isArray(frontmatter[relationKey]) ? frontmatter[relationKey].map(String) : typeof frontmatter[relationKey] === "string" ? [frontmatter[relationKey]] : [];
          const next = [.../* @__PURE__ */ new Set([...existing, candidate.file.path])];
          frontmatter[relationKey] = next;
        });
        this.pushRecentTarget(candidate.file.path);
        new import_obsidian11.Notice(this.t("savedRelation", { relation: this.relationLabel(relationKey) }));
        this.refreshAllViews();
      }).open();
    }).open();
  }
  openTagManager() {
    new TagManagerModal(this).open();
  }
  openTagSuggestion() {
    const currentFile = this.getContextNoteFile();
    if (!(currentFile instanceof import_obsidian11.TFile)) {
      return;
    }
    new TagSuggestionModal(this, currentFile).open();
  }
  openResearchIngestion() {
    new ResearchIngestionModal(this).open();
  }
  openSemanticSearch() {
    new SemanticSearchModal(this).open();
  }
  async runResearchIngestion(request) {
    const result = await runIngestionCommand(
      this.app,
      this.settings,
      request,
      this.getContextNoteFile(),
      this.getContextSelection()
    );
    this.pushRecentTarget(result.notePath);
    this.refreshAllViews();
    if (this.settings.researchOpenNoteAfterImport) {
      const importedFile = await this.waitForVaultMarkdownFile(result.notePath);
      if (importedFile) {
        this.openFile(importedFile);
      }
    }
    new import_obsidian11.Notice(
      result.warnings.length > 0 ? this.t("ingestionCreatedWithWarnings", { title: result.title, count: result.warnings.length }) : this.t("ingestionCreated", { title: result.title })
    );
    return result;
  }
  async waitForVaultMarkdownFile(path, timeoutMs = 3e3) {
    const startedAt = Date.now();
    while (Date.now() - startedAt <= timeoutMs) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof import_obsidian11.TFile) {
        return file;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
    return null;
  }
  ingestionErrorToMessage(message) {
    if (message === "desktop-only" || message === "desktop-shell-unavailable") {
      return this.t("ingestionDesktopOnly");
    }
    if (message === "missing-command") {
      return this.t("ingestionMissingCommand");
    }
    if (message === "missing-source") {
      return this.t("ingestionMissingSource");
    }
    if (message === "invalid-doi") {
      return this.t("ingestionInvalidDoi");
    }
    if (message === "invalid-arxiv") {
      return this.t("ingestionInvalidArxiv");
    }
    if (message === "invalid-pdf") {
      return this.t("ingestionInvalidPdf");
    }
    if (message === "doi-not-found" || message === "arxiv-entry-not-found") {
      return this.t("ingestionSourceNotFound");
    }
    if (message === "invalid-cli-response") {
      return this.t("ingestionInvalidResponse");
    }
    if (message.startsWith("doi-lookup-failed:")) {
      return this.t("ingestionLookupFailed", { target: "DOI", status: message.split(":")[1] ?? "error" });
    }
    if (message.startsWith("arxiv-lookup-failed:")) {
      return this.t("ingestionLookupFailed", { target: "arXiv", status: message.split(":")[1] ?? "error" });
    }
    if (message.startsWith("pdf-download-failed:")) {
      return this.t("ingestionPdfDownloadFailed", { status: message.split(":")[1] ?? "error" });
    }
    return this.t("ingestionFailed", { message });
  }
  semanticErrorToMessage(message) {
    if (message === "desktop-only") {
      return this.t("semanticDesktopOnly");
    }
    if (message === "missing-command") {
      return this.t("semanticMissingCommand");
    }
    return this.t("semanticFailed", { message });
  }
  openFile(file) {
    this.hideReferencePreview();
    const leaf = this.getNavigationLeaf();
    void leaf.openFile(file).then(() => {
      this.captureSupportedFileContext(file);
      this.captureEditorContext(leaf);
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
    });
  }
  openFileAtLine(file, startLine, endLine) {
    this.hideReferencePreview();
    const leaf = this.getNavigationLeaf();
    void leaf.openFile(file).then(() => {
      this.captureSupportedFileContext(file);
      this.captureEditorContext(leaf);
      const view = leaf.view;
      if (view instanceof import_obsidian11.MarkdownView) {
        const editor = view.editor;
        const start = Math.max(0, startLine - 1);
        const safeEndLine = Math.max(start, (endLine ?? startLine) - 1);
        const endCh = editor.getLine(safeEndLine)?.length ?? 0;
        editor.setSelection({ line: start, ch: 0 }, { line: safeEndLine, ch: endCh });
        editor.scrollIntoView({ from: { line: start, ch: 0 }, to: { line: safeEndLine, ch: endCh } }, true);
      }
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
    });
  }
  openFileAtBlock(file, blockId) {
    this.hideReferencePreview();
    const leaf = this.getNavigationLeaf();
    void leaf.openFile(file).then(() => {
      this.captureSupportedFileContext(file);
      this.captureEditorContext(leaf);
      const view = leaf.view;
      if (view instanceof import_obsidian11.MarkdownView) {
        const cache = this.app.metadataCache.getFileCache(file);
        const resolved = cache ? (0, import_obsidian11.resolveSubpath)(cache, `#^${blockId}`) : null;
        if (resolved?.type === "block") {
          const editor = view.editor;
          const start = Math.max(0, resolved.start.line);
          const safeEndLine = Math.max(start, resolved.end?.line ?? resolved.start.line);
          const endCh = editor.getLine(safeEndLine)?.length ?? 0;
          editor.setSelection({ line: start, ch: 0 }, { line: safeEndLine, ch: endCh });
          editor.scrollIntoView({ from: { line: start, ch: 0 }, to: { line: safeEndLine, ch: endCh } }, true);
        }
      }
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
    });
  }
  openResolvedPath(path) {
    const file = resolveNoteTarget(this.app, path);
    if (file) {
      this.openFile(file);
      return;
    }
    new import_obsidian11.Notice(path);
  }
  openResolvedLineReference(target, sourcePath, startLine, endLine) {
    const file = resolveNoteTarget(this.app, target, sourcePath);
    if (file) {
      this.openFileAtLine(file, startLine, endLine);
      return;
    }
    new import_obsidian11.Notice(target);
  }
  openResolvedBlockReference(target, sourcePath, blockId) {
    const file = resolveNoteTarget(this.app, target, sourcePath);
    if (file) {
      this.openFileAtBlock(file, blockId);
      return;
    }
    new import_obsidian11.Notice(target);
  }
  async insertLinkFromPath(path) {
    const file = resolveNoteTarget(this.app, path);
    if (!file) {
      return;
    }
    await this.insertLinkIntoEditor(file, this.getContextSelection());
  }
  async addSuggestedTags(tags) {
    const currentFile = this.getContextNoteFile();
    if (!(currentFile instanceof import_obsidian11.TFile)) {
      return;
    }
    await appendTagsToFrontmatter(this.app, currentFile, tags);
    this.refreshAllViews();
  }
  formatRangeLabel(startLine, endLine) {
    return endLine && endLine > startLine ? `L${startLine}-${endLine}` : `L${startLine}`;
  }
  describeReferenceLocation(options) {
    if (options.kind === "native-block" && options.blockId) {
      return `^${options.blockId}`;
    }
    if (typeof options.startLine === "number") {
      return this.formatRangeLabel(options.startLine, options.endLine);
    }
    return void 0;
  }
  getCompanionDisplayName(id) {
    switch (id) {
      case "obsidian-zotero-desktop-connector":
        return "Zotero Integration";
      case "pdf-plus":
        return "PDF++";
      case "smart-connections":
        return "Smart Connections";
      case "semantic-bridge":
        return "Semantic bridge";
    }
  }
  async executeCommandByCandidates(candidates) {
    const commands = this.app.commands;
    const commandRegistry = commands?.commands;
    const commandIds = commandRegistry ? Object.keys(commandRegistry) : [];
    const resolved = candidates.find((candidate) => commandIds.includes(candidate)) ?? candidates.map((candidate) => commandIds.find((commandId) => commandId.endsWith(`:${candidate}`) || commandId.includes(candidate))).find(Boolean);
    if (!resolved || typeof commands?.executeCommandById !== "function") {
      new import_obsidian11.Notice(this.t("settingsWorkbenchCommandUnavailable"));
      return false;
    }
    const result = await commands.executeCommandById(resolved);
    if (result === false) {
      new import_obsidian11.Notice(this.t("settingsWorkbenchCommandUnavailable"));
      return false;
    }
    return true;
  }
};
