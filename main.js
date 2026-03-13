"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => LinkTagIntelligencePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian10 = require("obsidian");

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
async function renderLegacyReferences(el, ctx, helpers) {
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
  toDOM(_view) {
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
var import_node_fs = require("node:fs");
var import_node_path = __toESM(require("node:path"), 1);
var MAX_LOG_BYTES = 512 * 1024;
function resolveLogPath(app) {
  const adapter = app.vault.adapter;
  if (!(adapter instanceof import_obsidian2.FileSystemAdapter)) {
    return null;
  }
  return import_node_path.default.join(
    adapter.getBasePath(),
    app.vault.configDir,
    "plugins",
    "link-tag-intelligence",
    "debug-runtime.log"
  );
}
function resetDebugLog(app) {
  const logPath = resolveLogPath(app);
  if (!logPath) {
    return null;
  }
  (0, import_node_fs.mkdirSync)(import_node_path.default.dirname(logPath), { recursive: true });
  (0, import_node_fs.writeFileSync)(logPath, "", "utf8");
  return logPath;
}
function debugLog(app, scope, details = {}) {
  const logPath = resolveLogPath(app);
  if (!logPath) {
    return;
  }
  try {
    (0, import_node_fs.mkdirSync)(import_node_path.default.dirname(logPath), { recursive: true });
    if ((0, import_node_fs.existsSync)(logPath) && (0, import_node_fs.statSync)(logPath).size > MAX_LOG_BYTES) {
      (0, import_node_fs.writeFileSync)(logPath, "", "utf8");
    }
    const payload = {
      ts: (/* @__PURE__ */ new Date()).toISOString(),
      scope,
      ...details
    };
    (0, import_node_fs.appendFileSync)(logPath, `${JSON.stringify(payload)}
`, "utf8");
  } catch (error) {
    console.error("[lti-debug-log] failed to write log", error);
  }
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
    noActiveNote: "Open a markdown note to use this view.",
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
    invalidAliasMap: "Tag alias map is invalid JSON. Falling back to empty map.",
    settingsLanguage: "Plugin language",
    settingsRelationKeys: "Relation keys",
    settingsTagAliasMap: "Tag alias map JSON",
    settingsSemanticEnabled: "Enable semantic bridge",
    settingsSemanticCommand: "Semantic command",
    settingsSemanticTimeout: "Semantic timeout (ms)",
    settingsRecentLinks: "Recent link memory size",
    mentionsExplanation: "Notes that mention this note title or aliases without already linking to it.",
    selected: "Selected",
    notSelected: "Not selected",
    modalTagSuggestionsDescription: "Suggestions are ranked from aliases, existing vault tags, source paths, and recurring keywords.",
    modalRelationDescription: "Choose a typed relation to write into frontmatter.",
    modalManageTagsDescription: "Rename, merge, or delete native tags across the vault.",
    modalSemanticDescription: "Run your external semantic command against the current note context.",
    tagSuggestionAlias: "Alias match",
    tagSuggestionKnown: "Existing vault tag",
    tagSuggestionKeyword: "Keyword candidate",
    tagSuggestionSource: "Source path",
    tagSuggestionMatches: "Matched: {matches}",
    tagSuggestionSummary: "Primary recommendations are higher-confidence tags. Secondary candidates are looser context hints.",
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
    tagSuggestionSourceVault: "Vault tag",
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
    noActiveNote: "\u8BF7\u5148\u6253\u5F00\u4E00\u4E2A Markdown \u7B14\u8BB0\u3002",
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
    invalidAliasMap: "\u6807\u7B7E\u522B\u540D\u6620\u5C04\u4E0D\u662F\u5408\u6CD5 JSON\uFF0C\u5DF2\u56DE\u9000\u4E3A\u7A7A\u6620\u5C04\u3002",
    settingsLanguage: "\u63D2\u4EF6\u8BED\u8A00",
    settingsRelationKeys: "\u5173\u7CFB\u952E",
    settingsTagAliasMap: "\u6807\u7B7E\u522B\u540D\u6620\u5C04 JSON",
    settingsSemanticEnabled: "\u542F\u7528\u8BED\u4E49\u6865\u63A5",
    settingsSemanticCommand: "\u8BED\u4E49\u547D\u4EE4",
    settingsSemanticTimeout: "\u8BED\u4E49\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
    settingsRecentLinks: "\u6700\u8FD1\u94FE\u63A5\u8BB0\u5FC6\u957F\u5EA6",
    mentionsExplanation: "\u5217\u51FA\u63D0\u53CA\u5F53\u524D\u7B14\u8BB0\u6807\u9898\u6216\u522B\u540D\u3001\u4F46\u5C1A\u672A\u5EFA\u7ACB\u94FE\u63A5\u7684\u7B14\u8BB0\u3002",
    selected: "\u5DF2\u9009",
    notSelected: "\u672A\u9009",
    modalTagSuggestionsDescription: "\u5EFA\u8BAE\u4F1A\u4F18\u5148\u53C2\u8003\u522B\u540D\u3001\u73B0\u6709 vault \u6807\u7B7E\u3001\u6B63\u6587\u5173\u952E\u8BCD\u4E0E\u5F15\u7528\u8BED\u5883\uFF0C\u5C3D\u91CF\u907F\u514D\u76EE\u5F55\u8DEF\u5F84\u566A\u58F0\u3002",
    modalRelationDescription: "\u9009\u62E9\u8981\u5199\u5165 frontmatter \u7684\u5173\u7CFB\u7C7B\u578B\u3002",
    modalManageTagsDescription: "\u5BF9\u6574\u4E2A\u5E93\u7684\u539F\u751F\u6807\u7B7E\u8FDB\u884C\u91CD\u547D\u540D\u3001\u5408\u5E76\u6216\u5220\u9664\u3002",
    modalSemanticDescription: "\u57FA\u4E8E\u5F53\u524D\u7B14\u8BB0\u4E0A\u4E0B\u6587\u6267\u884C\u4F60\u7684\u5916\u90E8\u8BED\u4E49\u547D\u4EE4\u3002",
    tagSuggestionAlias: "\u522B\u540D\u547D\u4E2D",
    tagSuggestionKnown: "\u5DF2\u6709\u6807\u7B7E",
    tagSuggestionKeyword: "\u5173\u952E\u8BCD\u5019\u9009",
    tagSuggestionSource: "\u6765\u6E90\u8DEF\u5F84",
    tagSuggestionMatches: "\u547D\u4E2D\uFF1A{matches}",
    tagSuggestionSummary: "\u4E3B\u63A8\u8350\u662F\u66F4\u9AD8\u7F6E\u4FE1\u5EA6\u7684\u6807\u7B7E\uFF0C\u8865\u5145\u5019\u9009\u7528\u4E8E\u63D0\u4F9B\u8BED\u5883\u7EBF\u7D22\uFF0C\u4F18\u5148\u52FE\u9009\u4E3B\u63A8\u8350\u3002",
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
    tagSuggestionSourceVault: "\u73B0\u6709\u6807\u7B7E",
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
var import_obsidian6 = require("obsidian");

// src/notes.ts
var import_obsidian3 = require("obsidian");
function getOffsetLineRange(content, start, end) {
  const normalizedStart = Math.max(0, start);
  const normalizedEnd = Math.max(normalizedStart, end);
  const startLine = content.slice(0, normalizedStart).split("\n").length;
  const endLine = startLine + Math.max(0, content.slice(normalizedStart, normalizedEnd).split("\n").length - 1);
  return { startLine, endLine };
}
var FRONTMATTER_RE = /^\s*---\n[\s\S]*?\n---\n?/;
var CJK_RE = /[\u3400-\u9fff]/;
function readStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return [value.trim()].filter(Boolean);
  }
  return [];
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
function getAllMarkdownFiles(app) {
  return app.vault.getMarkdownFiles();
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
  for (const file of getAllMarkdownFiles(app)) {
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
  const reverseAliases = [...aliasMap.entries()].filter(([, aliases]) => aliases.some((alias) => tags.some((tag) => tag.toLowerCase() === alias.toLowerCase()))).map(([canonical]) => canonical);
  const aliasTerms = tags.flatMap((tag) => aliasMap.get(tag) ?? []);
  return uniq([
    file.basename,
    file.name,
    file.path,
    ...getAliasesFromCache(cache),
    ...tags,
    ...aliasTerms,
    ...reverseAliases
  ]);
}
async function collectLinkCandidates(app, currentFile, query, settings, recentTargets, aliasMap) {
  const normalizedQuery = query.trim().toLowerCase();
  const fuzzy = normalizedQuery ? (0, import_obsidian3.prepareFuzzySearch)(normalizedQuery) : null;
  const currentTags = currentFile ? new Set(getAllTagsForFile(app, currentFile).map((tag) => tag.toLowerCase())) : /* @__PURE__ */ new Set();
  const currentRelations = currentFile ? getRelationMap(app, currentFile, settings) : {};
  const currentRelationTargets = new Set(Object.values(currentRelations).flat().map((value) => value.toLowerCase()));
  const candidates = await Promise.all(
    getAllMarkdownFiles(app).filter((file) => !currentFile || file.path !== currentFile.path).map(async (file) => {
      const cache = app.metadataCache.getFileCache(file);
      const aliases = getAliasesFromCache(cache);
      const tags = getAllTagsForFile(app, file);
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
    if (sourceFile instanceof import_obsidian3.TFile && !seen.has(sourceFile.path)) {
      seen.add(sourceFile.path);
      backlinks.push(sourceFile);
    }
  }
  for (const otherFile of getAllMarkdownFiles(app)) {
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
  return collected.sort((left, right) => left.order - right.order).map(({ order, ...reference }) => reference);
}
async function getIncomingExactReferences(app, file) {
  const collected = [];
  for (const otherFile of getAllMarkdownFiles(app)) {
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
  ).map(({ order, ...reference }) => reference);
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
  for (const otherFile of getAllMarkdownFiles(app)) {
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
    const targets = values.map((value) => resolveNoteTarget(app, value, file.path)).filter((target) => target instanceof import_obsidian3.TFile);
    if (targets.length > 0) {
      resolved[key] = targets;
    }
  }
  return resolved;
}

// src/semantic.ts
var import_obsidian4 = require("obsidian");

// src/shared.ts
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
function shellEscape(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
function buildSemanticCommand(template, context) {
  return template.replaceAll("{{query}}", shellEscape(context.query)).replaceAll("{{vault}}", shellEscape(context.vaultPath)).replaceAll("{{file}}", shellEscape(context.filePath)).replaceAll("{{selection}}", shellEscape(context.selection));
}

// src/semantic.ts
function isSemanticBridgeConfigured(settings) {
  return settings.semanticBridgeEnabled && Boolean(settings.semanticCommand.trim());
}
function getVaultBasePath(app) {
  return app.vault.adapter.basePath ?? "";
}
function normalizeResult(result) {
  if (typeof result.path !== "string" || !result.path.trim()) {
    return null;
  }
  return {
    path: result.path,
    title: typeof result.title === "string" && result.title.trim() ? result.title : result.path.split("/").pop() ?? result.path,
    score: typeof result.score === "number" ? result.score : 0,
    excerpt: typeof result.excerpt === "string" ? result.excerpt : "",
    reason: typeof result.reason === "string" ? result.reason : "",
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
  if (!import_obsidian4.Platform.isDesktopApp) {
    throw new Error("desktop-only");
  }
  if (!isSemanticBridgeConfigured(settings)) {
    throw new Error("missing-command");
  }
  const command = buildSemanticCommand(settings.semanticCommand, {
    query,
    vaultPath: getVaultBasePath(app),
    filePath: activeFile?.path ?? "",
    selection
  });
  const { exec } = await import("node:child_process");
  const stdout = await new Promise((resolve, reject) => {
    exec(command, { timeout: settings.semanticTimeoutMs, cwd: getVaultBasePath(app) || void 0 }, (error, resultStdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || error.message));
        return;
      }
      resolve(resultStdout);
    });
  });
  const parsed = JSON.parse(stdout.trim());
  const items = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && Array.isArray(parsed.results) ? parsed.results : [];
  return items.map(normalizeResult).filter((result) => result !== null);
}

// src/tags.ts
var import_obsidian5 = require("obsidian");
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
  return input.split(/[\/_|()[\]{}:：,，。.!?？、\-\s]+/).map((item) => item.trim()).filter(Boolean);
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
async function collectReferencedContextTerms(app, file, content) {
  const cache = app.metadataCache.getFileCache(file);
  const linkTargets = [
    ...cache?.links ?? [],
    ...cache?.frontmatterLinks ?? []
  ].map((link) => app.metadataCache.getFirstLinkpathDest(link.link, file.path)).filter((target) => target instanceof import_obsidian5.TFile);
  const legacyTargets = extractLegacyLineReferences(content).map((reference) => resolveNoteTarget(app, reference.target, file.path)).filter((target) => target instanceof import_obsidian5.TFile);
  const nativeBlockTargets = extractNativeBlockReferences(content).map((reference) => resolveNoteTarget(app, reference.target, file.path)).filter((target) => target instanceof import_obsidian5.TFile);
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
  const aliasMap = parseTagAliasMap(aliasMapText);
  const stats = /* @__PURE__ */ new Map();
  for (const file of getAllMarkdownFiles(app)) {
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
  for (const file of getAllMarkdownFiles(app)) {
    if (await updateTagInFile(app, file, oldTag, newTag)) {
      updated += 1;
    }
  }
  return updated;
}
async function deleteTagAcrossVault(app, tag) {
  let updated = 0;
  for (const file of getAllMarkdownFiles(app)) {
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
function mergeSuggestion(suggestions, tag, kind, score, matches, bucket, sources) {
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
  if (shouldReplaceKind) {
    existing.kind = kind;
  }
}
async function suggestTagsForFile(app, file, aliasMapText) {
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
      matches: uniq2([...signal.matches].filter((item) => item && item.toLowerCase() !== term.toLowerCase())).slice(0, 4),
      sources: uniq2([...signal.sources])
    };
    mergeSuggestion(suggestions, suggestion.tag, suggestion.kind, suggestion.score, suggestion.matches, suggestion.bucket, suggestion.sources);
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
var TextPromptModal = class extends import_obsidian6.Modal {
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
    new import_obsidian6.ButtonComponent(actions).setButtonText("OK").setCta().onClick(async () => {
      const value = input.value.trim();
      if (!value) {
        return;
      }
      await this.onSubmit(value);
      this.close();
    });
    new import_obsidian6.ButtonComponent(actions).setButtonText("Cancel").onClick(() => this.close());
    input.focus();
    input.select();
    input.addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const value = input.value.trim();
        if (!value) {
          return;
        }
        await this.onSubmit(value);
        this.close();
      }
    });
  }
};
var RelationKeyModal = class extends import_obsidian6.SuggestModal {
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
var LinkInsertModal = class extends import_obsidian6.SuggestModal {
  constructor(plugin, mode, onChoose, options) {
    super(plugin.app);
    this.plugin = plugin;
    this.mode = mode;
    this.currentFile = plugin.getContextMarkdownFile();
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
  async onChooseSuggestion(candidate) {
    await this.onChoose(candidate);
  }
};
var ReferenceInsertModal = class extends import_obsidian6.Modal {
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
    new import_obsidian6.ButtonComponent(actions).setButtonText(this.plugin.t(this.mode === "block_ref" ? "insertBlockRef" : "insertLineRef")).setCta().onClick(async () => {
      if (this.mode === "block_ref") {
        await this.plugin.insertBlockReferenceIntoEditor(this.file, this.startLine, this.endLine);
      } else {
        await this.plugin.insertLineReferenceIntoEditor(this.file, this.startLine, this.endLine);
      }
      this.close();
    });
    new import_obsidian6.ButtonComponent(actions).setButtonText(this.plugin.t("cancel")).onClick(() => this.close());
  }
};
var TagManagerModal = class extends import_obsidian6.Modal {
  constructor(plugin) {
    super(plugin.app);
    this.search = "";
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
      this.render();
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
          new import_obsidian6.Notice(`${this.plugin.t("tagsUpdated")} (${updated})`);
          this.render();
          this.plugin.refreshAllViews();
        }, { defaultValue: stat.tag }).open();
      });
      const mergeButton = actions.createEl("button", { text: this.plugin.t("merge"), cls: "lti-inline-button" });
      mergeButton.addEventListener("click", () => {
        new TextPromptModal(this.plugin, this.plugin.t("promptMergeInto"), async (value) => {
          const updated = await renameTagAcrossVault(this.plugin.app, stat.tag, value);
          new import_obsidian6.Notice(`${this.plugin.t("tagsUpdated")} (${updated})`);
          this.render();
          this.plugin.refreshAllViews();
        }).open();
      });
      const deleteButton = actions.createEl("button", { text: this.plugin.t("delete"), cls: "lti-inline-button" });
      deleteButton.addEventListener("click", async () => {
        const updated = await deleteTagAcrossVault(this.plugin.app, stat.tag);
        new import_obsidian6.Notice(`${this.plugin.t("tagsUpdated")} (${updated})`);
        this.render();
        this.plugin.refreshAllViews();
      });
    }
  }
};
var TagSuggestionModal = class extends import_obsidian6.Modal {
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
    this.suggestions = await suggestTagsForFile(this.plugin.app, this.file, this.plugin.settings.tagAliasMapText);
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
    new import_obsidian6.ButtonComponent(actions).setButtonText(this.plugin.t("apply")).setCta().onClick(async () => {
      await appendTagsToFrontmatter(this.plugin.app, this.file, [...this.selected]);
      new import_obsidian6.Notice(this.plugin.t("createdFrontmatterTag"));
      this.plugin.refreshAllViews();
      this.close();
    });
    new import_obsidian6.ButtonComponent(actions).setButtonText(this.plugin.t("cancel")).onClick(() => this.close());
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
var SemanticSearchModal = class extends import_obsidian6.Modal {
  constructor(plugin) {
    super(plugin.app);
    this.results = [];
    this.plugin = plugin;
    this.activeFile = plugin.getContextMarkdownFile();
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
    searchButton.addEventListener("click", async () => {
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
    if (resultsError) {
      contentEl.createDiv({ text: resultsError, cls: "lti-empty" });
    }
    const resultsContainer = contentEl.createDiv();
    for (const result of this.results) {
      const card = resultsContainer.createDiv({ cls: "lti-result-card" });
      card.createEl("div", { text: result.title, cls: "suggestion-title" });
      card.createDiv({ text: result.path, cls: "suggestion-meta" });
      if (result.reason) {
        card.createDiv({ text: `${this.plugin.t("reason")}: ${result.reason}`, cls: "suggestion-meta" });
      }
      card.createDiv({ text: `${this.plugin.t("semanticScore")}: ${result.score}`, cls: "suggestion-meta" });
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
    const path2 = document.createElement("div");
    path2.className = "lti-hover-preview-path";
    const snippet = document.createElement("pre");
    snippet.className = "lti-hover-preview-snippet";
    root.append(head, title, path2, snippet);
    root.addEventListener("mouseenter", () => this.cancelHide());
    root.addEventListener("mouseleave", () => this.scheduleHide());
    document.body.appendChild(root);
    this.rootEl = root;
    this.kindEl = kind;
    this.locationEl = location;
    this.titleEl = title;
    this.pathEl = path2;
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
    this.rootEl.style.left = "0px";
    this.rootEl.style.top = "0px";
    this.rootEl.style.maxWidth = `min(28rem, calc(100vw - ${margin * 2}px))`;
    this.rootEl.style.maxHeight = `calc(100vh - ${margin * 2}px)`;
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
    this.rootEl.style.left = `${left}px`;
    this.rootEl.style.top = `${top}px`;
  }
};
_ReferencePreviewPopover.ROOT_SELECTOR = ".lti-hover-preview";
var ReferencePreviewPopover = _ReferencePreviewPopover;

// src/reading-hover-controller.ts
var import_obsidian7 = require("obsidian");
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
    const path2 = doc.createElement("div");
    path2.className = "lti-reading-hover-path";
    path2.textContent = data.path;
    root.append(path2);
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
  const activeView = app.workspace.getActiveViewOfType(import_obsidian7.MarkdownView);
  const views = [];
  if (activeView) {
    views.push(activeView);
  }
  for (const leaf of app.workspace.getLeavesOfType("markdown")) {
    const view = leaf.view;
    if (view instanceof import_obsidian7.MarkdownView && !views.includes(view)) {
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
var LegacyReadingHoverController = class extends import_obsidian7.MarkdownRenderChild {
  constructor(app, hostEl, sentinelEl, hoverParent, getPreviewData) {
    super(sentinelEl);
    this.popover = null;
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
    const popover = this.ensurePopover(anchor);
    const hoverEl = popover.hoverEl;
    hoverEl.classList.add("lti-reading-hover-popover");
    hoverEl.classList.toggle("is-missing", data.missing === true);
    hoverEl.replaceChildren(buildReadingHoverContent(anchor.ownerDocument, data));
    debugLog(this.app, "reading.hover.show-commit", {
      token,
      target: options.target,
      hoverElClass: hoverEl.className,
      parentHoverPopoverMatches: this.hoverParent ? this.hoverParent.hoverPopover === popover : false,
      snippetPreview: data.snippet.slice(0, 120)
    });
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
    if (!this.hoverParent) {
      debugLog(this.app, "reading.hover.ensure-popover-error", {
        reason: "missing-hover-parent"
      });
      throw new Error("Missing MarkdownView hover parent for reading hover preview");
    }
    debugLog(this.app, "reading.hover.ensure-popover", {
      hadExistingPopover: Boolean(this.popover),
      parentExistingPopover: Boolean(this.hoverParent.hoverPopover),
      hoverParentType: this.hoverParent.constructor?.name ?? "unknown",
      targetClass: anchor.className
    });
    this.destroyPopover();
    const popover = new import_obsidian7.HoverPopover(this.hoverParent, anchor, 0);
    popover.hoverEl.addEventListener("mouseenter", this.handlePopoverEnter);
    popover.hoverEl.addEventListener("mouseleave", this.handlePopoverLeave);
    this.popover = popover;
    return popover;
  }
  hide() {
    debugLog(this.app, "reading.hover.hide", {
      token: this.previewToken
    });
    this.destroyPopover();
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
var import_obsidian8 = require("obsidian");
var DEFAULT_SETTINGS = {
  language: "system",
  relationKeys: ["related", "see_also", "parent", "child", "same_as"],
  tagAliasMapText: JSON.stringify(
    {
      "\u5927\u8BED\u8A00\u6A21\u578B": ["llm", "large-language-model"],
      "\u624B\u51B2\u5496\u5561": ["pour-over", "coffee-brewing"]
    },
    null,
    2
  ),
  semanticBridgeEnabled: false,
  semanticCommand: "",
  semanticTimeoutMs: 3e4,
  recentLinkMemorySize: 24,
  recentLinkTargets: []
};
var LinkTagIntelligenceSettingTab = class extends import_obsidian8.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: this.plugin.t("pluginName") });
    new import_obsidian8.Setting(containerEl).setName(this.plugin.t("settingsLanguage")).addDropdown(
      (dropdown) => dropdown.addOption("system", "System").addOption("en", "English").addOption("zh", "\u4E2D\u6587").setValue(this.plugin.settings.language).onChange(async (value) => {
        this.plugin.settings.language = value;
        await this.plugin.saveSettings();
        this.display();
      })
    );
    new import_obsidian8.Setting(containerEl).setName(this.plugin.t("settingsRelationKeys")).setDesc("Comma-separated frontmatter keys for typed note relations.").addTextArea(
      (area) => area.setValue(this.plugin.settings.relationKeys.join(", ")).onChange(async (value) => {
        this.plugin.settings.relationKeys = value.split(",").map((item) => item.trim()).filter(Boolean);
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian8.Setting(containerEl).setName(this.plugin.t("settingsTagAliasMap")).setDesc("JSON object from canonical tag to aliases. Used for bilingual matching, not automatic rewrites.").addTextArea((area) => {
      area.inputEl.rows = 10;
      area.setValue(this.plugin.settings.tagAliasMapText).onChange(async (value) => {
        this.plugin.settings.tagAliasMapText = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian8.Setting(containerEl).setName(this.plugin.t("settingsSemanticEnabled")).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.semanticBridgeEnabled).onChange(async (value) => {
        this.plugin.settings.semanticBridgeEnabled = value;
        await this.plugin.saveSettings();
        this.plugin.refreshAllViews();
      })
    );
    new import_obsidian8.Setting(containerEl).setName(this.plugin.t("settingsSemanticCommand")).setDesc("Desktop-only shell command. Supported placeholders: {{query}} {{vault}} {{file}} {{selection}}").addTextArea((area) => {
      area.inputEl.rows = 4;
      area.setValue(this.plugin.settings.semanticCommand).setPlaceholder("python3 /path/tool.py --vault {{vault}} --query {{query}}").onChange(async (value) => {
        this.plugin.settings.semanticCommand = value;
        await this.plugin.saveSettings();
        this.plugin.refreshAllViews();
      });
    });
    new import_obsidian8.Setting(containerEl).setName(this.plugin.t("settingsSemanticTimeout")).addText(
      (text) => text.setValue(String(this.plugin.settings.semanticTimeoutMs)).onChange(async (value) => {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          this.plugin.settings.semanticTimeoutMs = parsed;
          await this.plugin.saveSettings();
        }
      })
    );
    new import_obsidian8.Setting(containerEl).setName(this.plugin.t("settingsRecentLinks")).addText(
      (text) => text.setValue(String(this.plugin.settings.recentLinkMemorySize)).onChange(async (value) => {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          this.plugin.settings.recentLinkMemorySize = parsed;
          this.plugin.settings.recentLinkTargets = this.plugin.settings.recentLinkTargets.slice(0, parsed);
          await this.plugin.saveSettings();
        }
      })
    );
  }
};

// src/view.ts
var import_obsidian9 = require("obsidian");
var LINK_TAG_INTELLIGENCE_VIEW = "link-tag-intelligence-view";
var LinkTagIntelligenceView = class extends import_obsidian9.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.sectionState = /* @__PURE__ */ new Map();
    this.plugin = plugin;
  }
  getViewType() {
    return LINK_TAG_INTELLIGENCE_VIEW;
  }
  getDisplayText() {
    return this.plugin.t("viewTitle");
  }
  async onOpen() {
    this.containerEl.addClass("link-tag-intelligence-view");
    await this.refresh();
  }
  async refresh(options = {}) {
    const scrollContainer = this.getScrollContainer();
    const previousScrollTop = options.preserveScroll ? scrollContainer.scrollTop : null;
    const content = this.contentEl;
    content.empty();
    content.addClass("link-tag-intelligence-view");
    const toolbar = content.createDiv({ cls: "lti-toolbar" });
    const buttons = [
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
      const button = toolbar.createEl("button", {
        text: this.plugin.t(key),
        cls: "lti-toolbar-button"
      });
      button.dataset.action = key;
      button.addEventListener("click", handler);
    }
    const activeFile = this.plugin.getContextMarkdownFile();
    if (!(activeFile instanceof import_obsidian9.TFile)) {
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
    }
    this.renderFileSection(content, "outgoing-links", this.plugin.t("outgoingLinks"), await getOutgoingLinkFiles(this.app, activeFile), true);
    this.renderFileSection(content, "backlinks", this.plugin.t("backlinks"), await getBacklinkFiles(this.app, activeFile), false);
    this.renderExactReferenceSection(content, "outgoing-references", this.plugin.t("outgoingReferences"), await getOutgoingExactReferences(this.app, activeFile), "outgoing", true);
    this.renderExactReferenceSection(content, "incoming-references", this.plugin.t("incomingReferences"), await getIncomingExactReferences(this.app, activeFile), "incoming", false);
    this.renderRelationSection(content, activeFile);
    this.renderTagSection(content, activeFile);
    await this.renderMentionsSection(content, activeFile);
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
        if (previousScrollTop !== null) {
          scrollContainer.scrollTop = previousScrollTop;
        }
      });
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
    const pills = section.createDiv({ cls: "lti-pill-row lti-tag-grid" });
    for (const tag of tags) {
      pills.createSpan({ text: `#${tag}`, cls: "lti-pill lti-tag-chip" });
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
  }
  createSection(parent, id, title, count, defaultExpanded = false, emphasized = false) {
    const expanded = this.getSectionExpanded(id, defaultExpanded);
    const section = parent.createDiv({ cls: `lti-section${expanded ? "" : " is-collapsed"}${emphasized ? " lti-note-focus" : ""}` });
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
      this.sectionState.set(id, !expanded);
      void this.refresh({ preserveScroll: true, focusSectionId: id });
    };
    toggle.addEventListener("click", onToggle);
    toggle.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onToggle();
      }
    });
    if (!expanded) {
      return null;
    }
    const body = section.createDiv({ cls: "lti-section-body" });
    body.dataset.sectionId = id;
    return body;
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
  async onClose() {
    this.contentEl.empty();
  }
};

// src/main.ts
var LinkTagIntelligencePlugin = class extends import_obsidian10.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.lastMarkdownLeaf = null;
    this.lastMarkdownFilePath = null;
    this.referencePreview = new ReferencePreviewPopover();
    this.referencePreviewToken = 0;
  }
  async onload() {
    await this.loadSettings();
    const debugLogPath = resetDebugLog(this.app);
    debugLog(this.app, "plugin.onload", {
      version: this.manifest.version,
      debugLogPath,
      language: this.settings.language,
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
    this.addRibbonIcon("links-coming-in", this.t("openPanel"), async () => {
      await this.openIntelligencePanel();
    });
    this.addCommand({
      id: "open-link-tag-intelligence",
      name: this.t("openPanel"),
      callback: async () => {
        await this.openIntelligencePanel();
      }
    });
    this.addCommand({
      id: "insert-link-with-preview",
      name: this.t("insertLink"),
      editorCallback: () => {
        this.openLinkInsertModal("wikilink");
      }
    });
    this.addCommand({
      id: "quick-link-selection",
      name: this.t("quickLink"),
      editorCallback: () => {
        this.openLinkInsertModal("quick_link");
      }
    });
    this.addCommand({
      id: "insert-block-reference",
      name: this.t("insertBlockRef"),
      editorCallback: () => {
        this.openBlockReferenceFlow();
      }
    });
    this.addCommand({
      id: "insert-line-reference",
      name: this.t("insertLineRef"),
      editorCallback: () => {
        this.openLineReferenceFlow();
      }
    });
    this.addCommand({
      id: "add-relation-to-current-note",
      name: this.t("addRelation"),
      checkCallback: (checking) => {
        const activeFile = this.getContextMarkdownFile();
        if (!activeFile) {
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
        const activeFile = this.getContextMarkdownFile();
        if (!(activeFile instanceof import_obsidian10.TFile)) {
          return false;
        }
        if (!checking) {
          this.openTagSuggestion();
        }
        return true;
      }
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
    this.captureMarkdownContext(this.app.workspace.activeLeaf);
    if (!this.lastMarkdownLeaf) {
      this.captureMarkdownContext(this.app.workspace.getLeavesOfType("markdown")[0] ?? null);
    }
    this.registerEvent(this.app.workspace.on("file-open", (file) => {
      if (file instanceof import_obsidian10.TFile) {
        this.lastMarkdownFilePath = file.path;
      }
      this.refreshAllViews();
    }));
    this.registerEvent(this.app.metadataCache.on("changed", () => this.refreshAllViews()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => {
      if (this.captureMarkdownContext(leaf)) {
        this.refreshAllViews();
      }
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
    this.referencePreview.destroy();
    this.app.workspace.detachLeavesOfType(LINK_TAG_INTELLIGENCE_VIEW);
  }
  async loadSettings() {
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...await this.loadData()
    };
  }
  async saveSettings() {
    const memory = Math.max(1, this.settings.recentLinkMemorySize);
    this.settings.recentLinkTargets = this.settings.recentLinkTargets.slice(0, memory);
    await this.saveData(this.settings);
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
      new import_obsidian10.Notice(this.t("invalidAliasMap"));
      return /* @__PURE__ */ new Map();
    }
  }
  captureMarkdownContext(leaf) {
    const view = leaf?.view;
    if (!(view instanceof import_obsidian10.MarkdownView) || !(view.file instanceof import_obsidian10.TFile)) {
      return false;
    }
    const changed = this.lastMarkdownLeaf !== leaf || this.lastMarkdownFilePath !== view.file.path;
    this.lastMarkdownLeaf = leaf;
    this.lastMarkdownFilePath = view.file.path;
    return changed;
  }
  getContextMarkdownView() {
    const activeLeaf = this.app.workspace.activeLeaf;
    const activeView = activeLeaf?.view;
    if (activeView instanceof import_obsidian10.MarkdownView && activeView.file instanceof import_obsidian10.TFile) {
      this.captureMarkdownContext(activeLeaf);
      return activeView;
    }
    const rememberedView = this.lastMarkdownLeaf?.view;
    if (rememberedView instanceof import_obsidian10.MarkdownView && rememberedView.file instanceof import_obsidian10.TFile) {
      this.lastMarkdownFilePath = rememberedView.file.path;
      return rememberedView;
    }
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof import_obsidian10.MarkdownView) || !(view.file instanceof import_obsidian10.TFile)) {
        continue;
      }
      if (!this.lastMarkdownFilePath || view.file.path === this.lastMarkdownFilePath) {
        this.captureMarkdownContext(leaf);
        return view;
      }
    }
    return null;
  }
  getContextMarkdownFile() {
    const view = this.getContextMarkdownView();
    if (view?.file instanceof import_obsidian10.TFile) {
      return view.file;
    }
    if (!this.lastMarkdownFilePath) {
      return null;
    }
    const file = this.app.vault.getAbstractFileByPath(this.lastMarkdownFilePath);
    return file instanceof import_obsidian10.TFile ? file : null;
  }
  getContextSelection() {
    return this.getContextMarkdownView()?.editor?.getSelection() ?? "";
  }
  getNavigationLeaf() {
    const activeLeaf = this.app.workspace.activeLeaf;
    if (activeLeaf?.view instanceof import_obsidian10.MarkdownView) {
      this.captureMarkdownContext(activeLeaf);
      return activeLeaf;
    }
    if (this.lastMarkdownLeaf) {
      return this.lastMarkdownLeaf;
    }
    const fallbackLeaf = this.app.workspace.getLeavesOfType("markdown")[0];
    if (fallbackLeaf) {
      this.captureMarkdownContext(fallbackLeaf);
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
    this.app.workspace.revealLeaf(leaf);
    await this.refreshAllViews();
  }
  refreshAllViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(LINK_TAG_INTELLIGENCE_VIEW)) {
      const view = leaf.view;
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
      async (candidate) => {
        new ReferenceInsertModal(this, candidate.file, "block_ref").open();
      },
      { placeholder: this.t("pickBlockRefTarget") }
    ).open();
  }
  openLineReferenceFlow() {
    new LinkInsertModal(
      this,
      "wikilink",
      async (candidate) => {
        new ReferenceInsertModal(this, candidate.file, "line_ref").open();
      },
      { placeholder: this.t("pickLineRefTarget") }
    ).open();
  }
  async insertTextIntoContextEditor(text) {
    const view = this.getContextMarkdownView();
    const editor = view?.editor;
    if (!editor) {
      new import_obsidian10.Notice(this.t("noActiveNote"));
      return false;
    }
    editor.replaceSelection(text);
    this.refreshAllViews();
    return true;
  }
  async insertLinkIntoEditor(file, alias = "") {
    const view = this.getContextMarkdownView();
    const editor = view?.editor;
    if (!editor) {
      new import_obsidian10.Notice(this.t("noActiveNote"));
      return;
    }
    const normalizedAlias = alias.trim();
    const linkText = normalizedAlias ? `[[${file.basename}|${normalizedAlias}]]` : `[[${file.basename}]]`;
    if (normalizedAlias && editor.getSelection().trim()) {
      editor.replaceSelection(linkText);
    } else {
      editor.replaceSelection(linkText);
    }
    this.pushRecentTarget(file.path);
    new import_obsidian10.Notice(this.t("insertedLink", { title: file.basename }));
    this.refreshAllViews();
  }
  async insertBlockReferenceIntoEditor(file, startLine, endLine) {
    const sourcePath = this.getContextMarkdownFile()?.path ?? "";
    const target = sourcePath ? this.app.metadataCache.fileToLinktext(file, sourcePath, true) : file.basename;
    const text = formatLegacyBlockReference(target, startLine, endLine);
    if (await this.insertTextIntoContextEditor(text)) {
      this.pushRecentTarget(file.path);
      new import_obsidian10.Notice(this.t("blockRefInserted", { title: file.basename }));
    }
  }
  async insertLineReferenceIntoEditor(file, startLine, endLine) {
    const sourcePath = this.getContextMarkdownFile()?.path ?? "";
    const target = sourcePath ? this.app.metadataCache.fileToLinktext(file, sourcePath, true) : file.basename;
    const text = formatLegacyLineReference(target, startLine, endLine);
    if (await this.insertTextIntoContextEditor(text)) {
      this.pushRecentTarget(file.path);
      new import_obsidian10.Notice(this.t("lineRefInserted", { title: file.basename }));
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
  pushRecentTarget(path2) {
    this.settings.recentLinkTargets = [path2, ...this.settings.recentLinkTargets.filter((item) => item !== path2)].slice(
      0,
      this.settings.recentLinkMemorySize
    );
    void this.saveSettings();
  }
  async openRelationFlow() {
    const currentFile = this.getContextMarkdownFile();
    if (!(currentFile instanceof import_obsidian10.TFile)) {
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
        new import_obsidian10.Notice(this.t("savedRelation", { relation: this.relationLabel(relationKey) }));
        this.refreshAllViews();
      }).open();
    }).open();
  }
  openTagManager() {
    new TagManagerModal(this).open();
  }
  openTagSuggestion() {
    const currentFile = this.getContextMarkdownFile();
    if (!(currentFile instanceof import_obsidian10.TFile)) {
      return;
    }
    new TagSuggestionModal(this, currentFile).open();
  }
  openSemanticSearch() {
    new SemanticSearchModal(this).open();
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
      this.captureMarkdownContext(leaf);
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
    });
  }
  openFileAtLine(file, startLine, endLine) {
    this.hideReferencePreview();
    const leaf = this.getNavigationLeaf();
    void leaf.openFile(file).then(() => {
      this.captureMarkdownContext(leaf);
      const view = leaf.view;
      if (view instanceof import_obsidian10.MarkdownView) {
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
      this.captureMarkdownContext(leaf);
      const view = leaf.view;
      if (view instanceof import_obsidian10.MarkdownView) {
        const cache = this.app.metadataCache.getFileCache(file);
        const resolved = cache ? (0, import_obsidian10.resolveSubpath)(cache, `#^${blockId}`) : null;
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
  openResolvedPath(path2) {
    const file = resolveNoteTarget(this.app, path2);
    if (file) {
      this.openFile(file);
      return;
    }
    new import_obsidian10.Notice(path2);
  }
  openResolvedLineReference(target, sourcePath, startLine, endLine) {
    const file = resolveNoteTarget(this.app, target, sourcePath);
    if (file) {
      this.openFileAtLine(file, startLine, endLine);
      return;
    }
    new import_obsidian10.Notice(target);
  }
  openResolvedBlockReference(target, sourcePath, blockId) {
    const file = resolveNoteTarget(this.app, target, sourcePath);
    if (file) {
      this.openFileAtBlock(file, blockId);
      return;
    }
    new import_obsidian10.Notice(target);
  }
  insertLinkFromPath(path2) {
    const file = resolveNoteTarget(this.app, path2);
    if (!file) {
      return;
    }
    void this.insertLinkIntoEditor(file, this.getContextSelection());
  }
  async addSuggestedTags(tags) {
    const currentFile = this.getContextMarkdownFile();
    if (!(currentFile instanceof import_obsidian10.TFile)) {
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
};
