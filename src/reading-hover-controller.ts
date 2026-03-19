import { App, HoverPopover, MarkdownRenderChild, MarkdownView, type HoverParent, type MarkdownPostProcessorContext } from "obsidian";

import { debugLog } from "./debug-log";
import type { ReferencePreviewData } from "./reference-preview";

export type ReadingReferencePreviewOptions = {
  kind: "block" | "line";
  target: string;
  sourcePath: string;
  startLine: number;
  endLine?: number;
  raw?: string;
};

export interface ReadingReferenceHoverController {
  show(anchor: HTMLElement, options: ReadingReferencePreviewOptions): Promise<void>;
  cancelHide(): void;
  scheduleHide(delay?: number): void;
}

const controllerMap = new WeakMap<HTMLElement, LegacyReadingHoverController>();

function buildReadingHoverContent(doc: Document, data: ReferencePreviewData): HTMLElement {
  const root = doc.createElement("div");
  root.className = "lti-reading-hover-content";

  const head = doc.createElement("div");
  head.className = "lti-reading-hover-head";

  const kind = doc.createElement("span");
  kind.className = "lti-reading-hover-kind";
  kind.textContent = data.location ? `${data.kindLabel} · ${data.location}` : data.kindLabel;
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

function resolveFallbackHost(containerEl: HTMLElement): HTMLElement {
  return containerEl.closest(".markdown-preview-view")
    ?? containerEl.closest(".markdown-rendered")
    ?? containerEl.closest(".workspace-leaf-content")
    ?? containerEl;
}

function findMarkdownView(app: App, containerEl: HTMLElement): MarkdownView | null {
  const activeView = app.workspace.getActiveViewOfType(MarkdownView);
  const views: MarkdownView[] = [];

  if (activeView) {
    views.push(activeView);
  }

  for (const leaf of app.workspace.getLeavesOfType("markdown")) {
    const view = leaf.view;
    if (view instanceof MarkdownView && !views.includes(view)) {
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

function resolveHoverHost(app: App, containerEl: HTMLElement): { hostEl: HTMLElement; hoverParent: HoverParent | null } {
  const markdownView = findMarkdownView(app, containerEl);
  if (!markdownView) {
    return {
      hostEl: resolveFallbackHost(containerEl),
      hoverParent: null
    };
  }

  const hoverParent = markdownView.previewMode ?? markdownView;

  return {
    hostEl: containerEl.closest(".markdown-preview-view")
      ?? markdownView.previewMode?.containerEl
      ?? markdownView.containerEl,
    hoverParent
  };
}

class LegacyReadingHoverController extends MarkdownRenderChild implements ReadingReferenceHoverController {
  private readonly app: App;
  private readonly hostEl: HTMLElement;
  private readonly hoverParent: HoverParent | null;
  private readonly getPreviewData: (options: ReadingReferencePreviewOptions) => Promise<ReferencePreviewData>;
  private popover: HoverPopover | null = null;
  private fallbackEl: HTMLDivElement | null = null;
  private hideTimer: number | null = null;
  private previewToken = 0;
  private readonly win: Window;
  private readonly handlePopoverEnter = () => this.cancelHide();
  private readonly handlePopoverLeave = () => this.scheduleHide();

  constructor(
    app: App,
    hostEl: HTMLElement,
    sentinelEl: HTMLElement,
    hoverParent: HoverParent | null,
    getPreviewData: (options: ReadingReferencePreviewOptions) => Promise<ReferencePreviewData>
  ) {
    super(sentinelEl);
    this.app = app;
    this.hostEl = hostEl;
    this.hoverParent = hoverParent;
    this.getPreviewData = getPreviewData;
    this.win = hostEl.ownerDocument.defaultView ?? window;
  }

  async show(anchor: HTMLElement, options: ReadingReferencePreviewOptions): Promise<void> {
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

  cancelHide(): void {
    if (this.hideTimer !== null) {
      this.win.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  scheduleHide(delay = 140): void {
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

  override onunload(): void {
    this.previewToken += 1;
    this.cancelHide();
    this.hide();
    controllerMap.delete(this.hostEl);
    this.containerEl.remove();
  }

  private ensurePopover(anchor: HTMLElement): HoverPopover {
    debugLog(this.app, "reading.hover.ensure-popover", {
      hadExistingPopover: Boolean(this.popover),
      parentExistingPopover: Boolean(this.hoverParent?.hoverPopover),
      hoverParentType: this.hoverParent?.constructor?.name ?? "unknown",
      targetClass: anchor.className
    });
    this.destroyPopover();

    const popover = new HoverPopover(this.hoverParent!, anchor, 0);
    popover.hoverEl.addEventListener("mouseenter", this.handlePopoverEnter);
    popover.hoverEl.addEventListener("mouseleave", this.handlePopoverLeave);
    this.popover = popover;
    return popover;
  }

  private showFallbackPopover(anchor: HTMLElement, data: ReferencePreviewData): void {
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
    el.style.position = "fixed";
    el.style.zIndex = "var(--layer-popover, 300)";

    const elRect = el.getBoundingClientRect();
    const left = Math.min(rect.left, doc.documentElement.clientWidth - elRect.width - margin);
    const spaceBelow = doc.documentElement.clientHeight - rect.bottom - margin;
    const top = spaceBelow >= elRect.height + gap
      ? rect.bottom + gap
      : rect.top - elRect.height - gap;

    el.style.left = `${Math.max(margin, left)}px`;
    el.style.top = `${Math.max(margin, top)}px`;
    el.style.maxWidth = `min(28rem, calc(100vw - ${margin * 2}px))`;
  }

  private destroyFallbackPopover(): void {
    if (!this.fallbackEl) {
      return;
    }
    this.fallbackEl.removeEventListener("mouseenter", this.handlePopoverEnter);
    this.fallbackEl.removeEventListener("mouseleave", this.handlePopoverLeave);
    this.fallbackEl.remove();
    this.fallbackEl = null;
  }

  private hide(): void {
    debugLog(this.app, "reading.hover.hide", {
      token: this.previewToken
    });
    this.destroyPopover();
    this.destroyFallbackPopover();
  }

  private destroyPopover(): void {
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
}

export function getReadingReferenceHoverController(
  app: App,
  containerEl: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  getPreviewData: (options: ReadingReferencePreviewOptions) => Promise<ReferencePreviewData>
): ReadingReferenceHoverController {
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
