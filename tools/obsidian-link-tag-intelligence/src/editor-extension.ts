import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, hoverTooltip, ViewPlugin, type ViewUpdate, WidgetType, type Tooltip } from "@codemirror/view";
import { editorInfoField, type MarkdownFileInfo } from "obsidian";

import type LinkTagIntelligencePlugin from "./main";
import { extractLegacyLineReferences, extractNativeBlockReferences } from "./references";
import type { ReferencePreviewData } from "./reference-preview";

function getSourcePath(info: MarkdownFileInfo | undefined): string {
  return info?.file?.path ?? "";
}

type EditorReference =
  | { kind: "block" | "line"; target: string; startLine: number; endLine?: number; raw: string; from: number; to: number }
  | { kind: "native-block"; target: string; blockId: string; raw: string; from: number; to: number };

function formatRangeLabel(startLine: number, endLine?: number): string {
  return endLine && endLine > startLine ? `L${startLine}-${endLine}` : `L${startLine}`;
}

function formatReferenceTitle(target: string): string {
  const strippedPath = target.split("/").pop() ?? target;
  return strippedPath.replace(/\.md$/i, "");
}

function shouldOpenReference(event: MouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.button === 1;
}

function shouldRenderAsWidget(view: EditorView, from: number, to: number): boolean {
  if (!view.hasFocus) {
    return true;
  }

  const selection = view.state.selection.main;
  if (!selection.empty && selection.from < to && selection.to > from) {
    return false;
  }

  return !(selection.head >= from && selection.head < to);
}

function buildTooltipContent(data: ReferencePreviewData): HTMLElement {
  const root = document.createElement("div");
  root.className = "lti-cm-tooltip";
  if (data.missing) {
    root.classList.add("is-missing");
  }

  const head = root.createDiv({ cls: "lti-cm-tooltip-head" });
  head.createSpan({
    cls: "lti-cm-tooltip-kind",
    text: data.location ? `${data.kindLabel} · ${data.location}` : data.kindLabel
  });

  root.createDiv({ cls: "lti-cm-tooltip-title", text: data.title });
  if (data.path) {
    root.createDiv({ cls: "lti-cm-tooltip-path", text: data.path });
  }
  root.createEl("pre", { cls: "lti-cm-tooltip-snippet", text: data.snippet });

  return root;
}

function collectEditorReferences(text: string, baseOffset: number): EditorReference[] {
  const references: EditorReference[] = [
    ...extractLegacyLineReferences(text).map((reference) => ({
      kind: reference.kind,
      target: reference.target,
      startLine: reference.startLine,
      endLine: reference.endLine,
      raw: reference.raw,
      from: baseOffset + reference.position.start,
      to: baseOffset + reference.position.end
    }) satisfies EditorReference),
    ...extractNativeBlockReferences(text).map((reference) => ({
      kind: "native-block" as const,
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

function getLineReferenceAtPosition(view: EditorView, pos: number): EditorReference | null {
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

class ReferenceWidget extends WidgetType {
  constructor(
    private readonly sourcePath: string,
    private readonly range: { from: number; to: number },
    private readonly reference:
      | { kind: "block" | "line"; target: string; startLine: number; endLine?: number; raw: string }
      | { kind: "native-block"; target: string; blockId: string; raw: string }
  ) {
    super();
  }

  eq(other: ReferenceWidget): boolean {
    return JSON.stringify(this.reference) === JSON.stringify(other.reference) && this.sourcePath === other.sourcePath;
  }

  ignoreEvent(): boolean {
    return false;
  }

  toDOM(_view: EditorView): HTMLElement {
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
    title.textContent = formatReferenceTitle(this.reference.target);
    chip.append(title);

    const meta = document.createElement("span");
    meta.className = "cm-lti-ref-chip-meta";
    meta.textContent = this.reference.kind === "native-block"
      ? `^${this.reference.blockId}`
      : formatRangeLabel(this.reference.startLine, this.reference.endLine);
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
}

function addReferenceDecoration(
  builder: RangeSetBuilder<Decoration>,
  view: EditorView,
  sourcePath: string,
  reference: EditorReference
): void {
  if (shouldRenderAsWidget(view, reference.from, reference.to)) {
    builder.add(
      reference.from,
      reference.to,
      Decoration.replace({
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
      Decoration.mark({
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
    Decoration.mark({
      class: `cm-lti-ref cm-lti-ref-${reference.kind}`,
      attributes: {
        "data-lti-ref-kind": reference.kind,
        "data-lti-target": reference.target,
        "data-lti-start-line": String(reference.startLine),
        ...(typeof reference.endLine === "number" ? { "data-lti-end-line": String(reference.endLine) } : {}),
        "data-lti-raw": reference.raw
      }
    })
  );
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const info = view.state.field(editorInfoField, false) as MarkdownFileInfo | undefined;
  const sourcePath = getSourcePath(info);

  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    for (const reference of collectEditorReferences(text, from)) {
      addReferenceDecoration(builder, view, sourcePath, reference);
    }
  }

  return builder.finish();
}

export function buildReferenceEditorExtension(plugin: LinkTagIntelligencePlugin) {
  const decorations = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged || update.selectionSet || update.focusChanged) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    {
      decorations: (value) => value.decorations,
      eventHandlers: {
        mousedown(event, view) {
          const chip = event.target instanceof HTMLElement ? event.target.closest(".cm-lti-ref-chip") as HTMLElement | null : null;
          if (chip && (event.button === 0 || event.button === 1)) {
            const refKind = chip.dataset.ltiRefKind;
            const refTarget = chip.dataset.ltiTarget;
            const sourcePath = chip.dataset.ltiSourcePath ?? getSourcePath(view.state.field(editorInfoField, false) as MarkdownFileInfo | undefined);

            if (!refKind || !refTarget) {
              return false;
            }

            event.preventDefault();
            event.stopPropagation();

            if (shouldOpenReference(event)) {
              if (refKind === "native-block") {
                const blockId = chip.dataset.ltiBlockId;
                if (blockId) {
                  plugin.openResolvedBlockReference(refTarget, sourcePath, blockId);
                  return true;
                }
                return false;
              }

              const startLine = Number.parseInt(chip.dataset.ltiStartLine ?? "", 10);
              const endLine = Number.parseInt(chip.dataset.ltiEndLine ?? "", 10);
              if (!Number.isFinite(startLine)) {
                return false;
              }

              plugin.openResolvedLineReference(refTarget, sourcePath, startLine, Number.isFinite(endLine) ? endLine : undefined);
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

          const target = event.target instanceof HTMLElement ? event.target.closest(".cm-lti-ref") as HTMLElement | null : null;
          if (!target || event.button !== 0 || !shouldOpenReference(event)) {
            return false;
          }

          const info = view.state.field(editorInfoField, false) as MarkdownFileInfo | undefined;
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

          plugin.openResolvedLineReference(refTarget, sourcePath, startLine, Number.isFinite(endLine) ? endLine : undefined);
          return true;
        }
      }
    }
  );

  const hover = hoverTooltip(async (view, pos) => {
    const reference = getLineReferenceAtPosition(view, pos);
    if (!reference) {
      return null;
    }

    const info = view.state.field(editorInfoField, false) as MarkdownFileInfo | undefined;
    const sourcePath = getSourcePath(info);
    const data = await plugin.getReferencePreviewData({
      kind: reference.kind,
      target: reference.target,
      sourcePath,
      startLine: reference.kind === "native-block" ? undefined : reference.startLine,
      endLine: reference.kind === "native-block" ? undefined : reference.endLine,
      blockId: reference.kind === "native-block" ? reference.blockId : undefined,
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
