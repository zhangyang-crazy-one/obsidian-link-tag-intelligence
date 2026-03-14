export interface ReferencePreviewData {
  kindLabel: string;
  title: string;
  path: string;
  location?: string;
  snippet: string;
  missing?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export class ReferencePreviewPopover {
  private static readonly ROOT_SELECTOR = ".lti-hover-preview";
  private rootEl: HTMLDivElement | null = null;
  private kindEl: HTMLSpanElement | null = null;
  private locationEl: HTMLSpanElement | null = null;
  private titleEl: HTMLDivElement | null = null;
  private pathEl: HTMLDivElement | null = null;
  private snippetEl: HTMLPreElement | null = null;
  private hideTimer: number | null = null;
  private activeAnchor: HTMLElement | null = null;
  private onHide: (() => void) | null = null;
  private readonly repositionHandler = () => {
    if (this.rootEl && this.activeAnchor) {
      this.position(this.activeAnchor);
    }
  };

  setOnHide(handler: () => void): void {
    this.onHide = handler;
  }

  show(anchor: HTMLElement, data: ReferencePreviewData): void {
    this.ensureRoot();
    this.cleanupDuplicateRoots();
    this.cancelHide();
    this.activeAnchor = anchor;

    if (!this.rootEl || !this.kindEl || !this.locationEl || !this.titleEl || !this.pathEl || !this.snippetEl) {
      return;
    }

    this.rootEl.classList.toggle("is-missing", data.missing === true);
    this.kindEl.textContent = data.location ? `${data.kindLabel} · ${data.location}` : data.kindLabel;
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

  scheduleHide(delay = 140): void {
    this.cancelHide();
    this.hideTimer = window.setTimeout(() => this.hide(true), delay);
  }

  cancelHide(): void {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  hide(immediate = false): void {
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

  destroy(): void {
    this.hide(true);
    this.rootEl?.remove();
    this.rootEl = null;
    this.kindEl = null;
    this.locationEl = null;
    this.titleEl = null;
    this.pathEl = null;
    this.snippetEl = null;
  }

  private ensureRoot(): void {
    if (this.rootEl) {
      return;
    }

    for (const existing of Array.from(document.querySelectorAll<HTMLDivElement>(ReferencePreviewPopover.ROOT_SELECTOR))) {
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

  private cleanupDuplicateRoots(): void {
    for (const existing of Array.from(document.querySelectorAll<HTMLDivElement>(ReferencePreviewPopover.ROOT_SELECTOR))) {
      if (existing !== this.rootEl) {
        existing.remove();
      }
    }
  }

  private position(anchor: HTMLElement): void {
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
    const left = clamp(anchorRect.left, margin, window.innerWidth - previewRect.width - margin);

    const availableHeight = Math.max(160, window.innerHeight - margin * 2);
    const previewHeight = Math.min(previewRect.height, availableHeight);
    const spaceAbove = anchorRect.top - safeTop;
    const spaceBelow = window.innerHeight - anchorRect.bottom - margin;
    const canPlaceAbove = spaceAbove >= previewHeight + gap;
    const canPlaceBelow = spaceBelow >= previewHeight + gap;

    let top: number;
    if (canPlaceBelow) {
      top = anchorRect.bottom + gap;
    } else if (canPlaceAbove) {
      top = anchorRect.top - previewHeight - gap;
    } else if (spaceBelow >= spaceAbove) {
      top = anchorRect.bottom + gap;
    } else {
      top = anchorRect.top - previewHeight - gap;
    }

    top = clamp(top, safeTop, window.innerHeight - previewHeight - margin);

    this.rootEl.setCssProps({
      "--lti-preview-left": `${left}px`,
      "--lti-preview-top": `${top}px`
    });
  }
}
