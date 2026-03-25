import { ItemView, TFile, WorkspaceLeaf } from "obsidian";

import type LinkTagIntelligencePlugin from "./main";
import { isIngestionConfigured } from "./ingestion";
import { LINK_TAG_INTELLIGENCE_ICON_ID } from "./icons";
import {
  type ExactReference,
  findUnlinkedMentions,
  getAllTagsForFile,
  getBacklinkFiles,
  getIncomingExactReferences,
  getOutgoingExactReferences,
  getOutgoingLinkFiles,
  getResearchSourceMetadataForFile,
  getResolvedRelations,
  isExcalidrawFile
} from "./notes";
import { isSemanticBridgeConfigured } from "./semantic";
import {
  mergeViewRefreshRequests,
  shouldHandleViewRefresh,
  type ViewRefreshRequest
} from "./view-refresh";

export const LINK_TAG_INTELLIGENCE_VIEW = "link-tag-intelligence-view";

type ToolbarActionId =
  | "ingestionCapture"
  | "insertLink"
  | "insertBlockRef"
  | "insertLineRef"
  | "quickLink"
  | "addRelation"
  | "manageTags"
  | "suggestTags"
  | "semanticSearch";

type SidebarSectionId =
  | "current-note"
  | "outgoing-links"
  | "backlinks"
  | "outgoing-references"
  | "incoming-references"
  | "relations"
  | "tags"
  | "mentions"
  | "capture"
  | "semantic";

type ResearchMetadata = Parameters<LinkTagIntelligencePlugin["formatResearchMetadataChips"]>[0];

interface ToolbarButtonSnapshot {
  key: ToolbarActionId;
  label: string;
  disabled: boolean;
  title?: string;
}

interface FileLinkSnapshot {
  basename: string;
  path: string;
}

interface CurrentNoteSnapshot {
  title: string;
  path: string;
  metadataChips: string[];
}

interface FileSectionSnapshot {
  title: string;
  count: number;
  items: FileLinkSnapshot[];
  emptyMessage: string;
}

interface ReferenceActionSnapshot {
  path: string;
  blockId?: string;
  startLine?: number;
  endLine?: number;
}

interface ReferenceItemSnapshot {
  basename: string;
  path: string;
  typeLabel: string;
  raw: string;
  preview?: string;
  metadataChips: string[];
  action: ReferenceActionSnapshot;
}

interface ReferenceSectionSnapshot {
  title: string;
  count: number;
  items: ReferenceItemSnapshot[];
  emptyMessage: string;
}

interface RelationPillSnapshot {
  basename: string;
  path: string;
}

interface RelationGroupSnapshot {
  label: string;
  key: string;
  items: RelationPillSnapshot[];
}

interface RelationSectionSnapshot {
  title: string;
  count: number;
  groups: RelationGroupSnapshot[];
  emptyMessage: string;
}

interface TagGroupSnapshot {
  label?: string;
  count?: number;
  tags: string[];
}

interface TagSectionSnapshot {
  title: string;
  count: number;
  groups: TagGroupSnapshot[];
  emptyMessage: string;
}

interface MentionItemSnapshot {
  basename: string;
  path: string;
  matchedTerm: string;
  snippet: string;
}

interface MentionSectionSnapshot {
  title: string;
  count: number;
  explanation: string;
  items: MentionItemSnapshot[];
  emptyMessage: string;
}

interface StatusSectionSnapshot {
  title: string;
  lines: string[];
}

interface SidebarSnapshot {
  toolbar: ToolbarButtonSnapshot[];
  hasContext: boolean;
  emptyMessage: string;
  currentNote?: CurrentNoteSnapshot;
  outgoingLinks?: FileSectionSnapshot;
  backlinks?: FileSectionSnapshot;
  outgoingReferences?: ReferenceSectionSnapshot;
  incomingReferences?: ReferenceSectionSnapshot;
  relations?: RelationSectionSnapshot;
  tags?: TagSectionSnapshot;
  mentions?: MentionSectionSnapshot;
  capture?: StatusSectionSnapshot;
  semantic?: StatusSectionSnapshot;
  dependencyPaths: string[];
}

interface SectionShell {
  sectionEl: HTMLDivElement;
  toggleEl: HTMLDivElement;
  titleEl: HTMLSpanElement;
  countEl: HTMLSpanElement;
  bodyEl: HTMLDivElement;
  innerEl: HTMLDivElement;
  defaultExpanded: boolean;
  lastSignature: string | null;
}

interface SectionDefinition {
  id: SidebarSectionId;
  titleKey:
    | "currentNote"
    | "outgoingLinks"
    | "backlinks"
    | "outgoingReferences"
    | "incomingReferences"
    | "relations"
    | "tags"
    | "unlinkedMentions"
    | "ingestionCapture"
    | "semanticBridge";
  defaultExpanded: boolean;
  emphasized?: boolean;
}

const SECTION_DEFINITIONS: SectionDefinition[] = [
  { id: "current-note", titleKey: "currentNote", defaultExpanded: true, emphasized: true },
  { id: "outgoing-links", titleKey: "outgoingLinks", defaultExpanded: true },
  { id: "backlinks", titleKey: "backlinks", defaultExpanded: false },
  { id: "outgoing-references", titleKey: "outgoingReferences", defaultExpanded: true },
  { id: "incoming-references", titleKey: "incomingReferences", defaultExpanded: false },
  { id: "relations", titleKey: "relations", defaultExpanded: false },
  { id: "tags", titleKey: "tags", defaultExpanded: true },
  { id: "mentions", titleKey: "unlinkedMentions", defaultExpanded: false },
  { id: "capture", titleKey: "ingestionCapture", defaultExpanded: false },
  { id: "semantic", titleKey: "semanticBridge", defaultExpanded: false }
];

const FILE_REQUIRED_ACTIONS = new Set<ToolbarActionId>([
  "insertLink",
  "insertBlockRef",
  "insertLineRef",
  "quickLink"
]);

function serializeSnapshot(value: unknown): string {
  return JSON.stringify(value);
}

export class LinkTagIntelligenceView extends ItemView {
  plugin: LinkTagIntelligencePlugin;
  private readonly sectionState = new Map<string, boolean>();
  private readonly sectionShells = new Map<SidebarSectionId, SectionShell>();
  private readonly toolbarButtons = new Map<ToolbarActionId, HTMLButtonElement>();
  private refreshPromise: Promise<void> | null = null;
  private pendingRefresh: ViewRefreshRequest | null = null;
  private refreshFrame: number | null = null;
  private dependencyPaths = new Set<string>();
  private toolbarSignature: string | null = null;
  private sectionsContainerEl: HTMLDivElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: LinkTagIntelligencePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return LINK_TAG_INTELLIGENCE_VIEW;
  }

  getDisplayText(): string {
    return this.plugin.t("viewTitle");
  }

  getIcon(): string {
    return LINK_TAG_INTELLIGENCE_ICON_ID;
  }

  async onOpen(): Promise<void> {
    if (this.refreshFrame !== null) {
      window.cancelAnimationFrame(this.refreshFrame);
      this.refreshFrame = null;
    }

    this.pendingRefresh = null;
    this.refreshPromise = null;
    this.sectionState.clear();
    this.sectionShells.clear();
    this.toolbarButtons.clear();
    this.dependencyPaths.clear();
    this.toolbarSignature = null;
    this.sectionsContainerEl = null;

    this.contentEl.empty();
    this.contentEl.addClass("link-tag-intelligence-view");
    this.containerEl.addClass("link-tag-intelligence-view");
    this.buildShell();
    await this.performRefresh({ reason: "context", force: true });
  }

  refresh(options: Omit<ViewRefreshRequest, "reason"> = {}): Promise<void> {
    return this.performRefresh({ reason: "mutation", force: true, ...options });
  }

  requestRefresh(request: ViewRefreshRequest): void {
    if (!shouldHandleViewRefresh(request, this.dependencyPaths)) {
      return;
    }

    this.pendingRefresh = mergeViewRefreshRequests(this.pendingRefresh, request);
    this.scheduleRefresh();
  }

  private scheduleRefresh(): void {
    if (this.refreshPromise !== null || this.refreshFrame !== null) {
      return;
    }

    this.refreshFrame = window.requestAnimationFrame(() => {
      this.refreshFrame = null;
      void this.flushPendingRefresh();
    });
  }

  private async flushPendingRefresh(): Promise<void> {
    if (this.refreshPromise !== null) {
      return;
    }

    const request = this.pendingRefresh ?? { reason: "mutation" };
    this.pendingRefresh = null;

    this.refreshPromise = this.performRefresh(request);
    try {
      await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
      if (this.pendingRefresh) {
        this.scheduleRefresh();
      }
    }
  }

  private async performRefresh(request: ViewRefreshRequest): Promise<void> {
    const snapshot = await this.buildSnapshot();
    this.applySnapshot(snapshot, request);
    this.dependencyPaths = new Set(snapshot.dependencyPaths);
  }

  private buildShell(): void {
    const toolbar = this.contentEl.createDiv({ cls: "lti-toolbar" });
    for (const [key, handler] of this.getToolbarActions()) {
      const button = toolbar.createEl("button", {
        text: this.plugin.t(key),
        cls: "lti-toolbar-button",
        attr: { type: "button" }
      });
      button.dataset.action = key;
      button.addEventListener("click", handler);
      this.toolbarButtons.set(key, button);
    }

    const sections = this.contentEl.createDiv({ cls: "lti-sidebar-sections" });
    this.sectionsContainerEl = sections;
    for (const definition of SECTION_DEFINITIONS) {
      this.sectionShells.set(definition.id, this.createSectionShell(sections, definition));
    }
  }

  private getToolbarActions(): Array<[ToolbarActionId, () => void]> {
    return [
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
  }

  private createSectionShell(parent: HTMLElement, definition: SectionDefinition): SectionShell {
    const expanded = this.getSectionExpanded(definition.id, definition.defaultExpanded);
    const sectionEl = parent.createDiv({ cls: `lti-section${definition.emphasized ? " lti-note-focus" : ""}` });
    sectionEl.dataset.sectionId = definition.id;
    sectionEl.classList.toggle("is-collapsed", !expanded);

    const headerEl = sectionEl.createDiv({ cls: "lti-section-header" });
    headerEl.dataset.sectionId = definition.id;

    const toggleEl = headerEl.createDiv({ cls: "lti-section-toggle" });
    toggleEl.dataset.sectionId = definition.id;
    toggleEl.setAttribute("role", "button");
    toggleEl.setAttribute("aria-expanded", expanded ? "true" : "false");
    toggleEl.setAttribute("aria-label", this.plugin.t(definition.titleKey));
    toggleEl.tabIndex = 0;

    toggleEl.createSpan({ text: ">", cls: "lti-section-chevron" });
    const titleEl = toggleEl.createSpan({
      text: this.plugin.t(definition.titleKey),
      cls: "lti-section-toggle-title"
    });
    const countEl = toggleEl.createSpan({ text: "", cls: "lti-section-count" });
    countEl.hidden = true;

    const bodyEl = sectionEl.createDiv({ cls: "lti-section-body" });
    bodyEl.dataset.sectionId = definition.id;
    if (!expanded) {
      bodyEl.addClass("is-collapsed");
    }
    const innerEl = bodyEl.createDiv({ cls: "lti-section-inner" });

    const onToggle = (): void => {
      const nextExpanded = !this.getSectionExpanded(definition.id, definition.defaultExpanded);
      this.sectionState.set(definition.id, nextExpanded);
      sectionEl.classList.toggle("is-collapsed", !nextExpanded);
      bodyEl.classList.toggle("is-collapsed", !nextExpanded);
      toggleEl.setAttribute("aria-expanded", nextExpanded ? "true" : "false");
    };

    toggleEl.addEventListener("click", onToggle);
    toggleEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onToggle();
      }
    });

    return {
      sectionEl,
      toggleEl,
      titleEl,
      countEl,
      bodyEl,
      innerEl,
      defaultExpanded: definition.defaultExpanded,
      lastSignature: null
    };
  }

  private async buildSnapshot(): Promise<SidebarSnapshot> {
    const toolbar = this.buildToolbarSnapshot();
    const activeFile = this.plugin.getContextNoteFile();

    if (!(activeFile instanceof TFile)) {
      return {
        toolbar,
        hasContext: false,
        emptyMessage: this.plugin.t("noActiveNote"),
        dependencyPaths: []
      };
    }

    const dependencyPaths = new Set<string>([activeFile.path]);
    const currentNote: CurrentNoteSnapshot = {
      title: activeFile.basename,
      path: activeFile.path,
      metadataChips: this.formatMetadataChips(getResearchSourceMetadataForFile(this.app, activeFile))
    };

    const outgoingLinks = this.buildFileSectionSnapshot(
      this.plugin.t("outgoingLinks"),
      await getOutgoingLinkFiles(this.app, activeFile),
      dependencyPaths
    );
    const backlinks = this.buildFileSectionSnapshot(
      this.plugin.t("backlinks"),
      await getBacklinkFiles(this.app, activeFile),
      dependencyPaths
    );

    const outgoingReferences = isExcalidrawFile(activeFile)
      ? undefined
      : this.buildReferenceSectionSnapshot(
        this.plugin.t("outgoingReferences"),
        await Promise.resolve(getOutgoingExactReferences(this.app, activeFile)),
        "outgoing",
        dependencyPaths
      );

    const incomingReferences = isExcalidrawFile(activeFile)
      ? undefined
      : this.buildReferenceSectionSnapshot(
        this.plugin.t("incomingReferences"),
        await Promise.resolve(getIncomingExactReferences(this.app, activeFile)),
        "incoming",
        dependencyPaths
      );

    const relations = this.buildRelationSectionSnapshot(activeFile, dependencyPaths);
    const tags = this.buildTagSectionSnapshot(activeFile);
    const mentions = this.buildMentionSectionSnapshot(
      this.plugin.t("unlinkedMentions"),
      await findUnlinkedMentions(this.app, activeFile, this.plugin.settings),
      dependencyPaths
    );

    return {
      toolbar,
      hasContext: true,
      emptyMessage: "",
      currentNote,
      outgoingLinks,
      backlinks,
      outgoingReferences,
      incomingReferences,
      relations,
      tags,
      mentions,
      capture: this.buildCaptureSectionSnapshot(),
      semantic: this.buildSemanticSectionSnapshot(),
      dependencyPaths: [...dependencyPaths]
    };
  }

  private buildToolbarSnapshot(): ToolbarButtonSnapshot[] {
    const hasContext = Boolean(this.plugin.getContextNoteFile());
    return this.getToolbarActions().map(([key]) => {
      const disabled = FILE_REQUIRED_ACTIONS.has(key) && !hasContext;
      return {
        key,
        label: this.plugin.t(key),
        disabled,
        title: disabled ? this.plugin.t("noActiveNote") : undefined
      };
    });
  }

  private buildFileSectionSnapshot(
    title: string,
    files: TFile[],
    dependencyPaths: Set<string>
  ): FileSectionSnapshot {
    const items = files.map((file) => {
      dependencyPaths.add(file.path);
      return { basename: file.basename, path: file.path };
    });

    return {
      title,
      count: items.length,
      items,
      emptyMessage: this.plugin.t("emptyList")
    };
  }

  private buildReferenceSectionSnapshot(
    title: string,
    references: ExactReference[],
    direction: "outgoing" | "incoming",
    dependencyPaths: Set<string>
  ): ReferenceSectionSnapshot {
    const items = references.map((reference) => {
      const file = direction === "outgoing" ? reference.targetFile : reference.sourceFile;
      dependencyPaths.add(file.path);

      if (direction === "incoming") {
        dependencyPaths.add(reference.targetFile.path);
      } else {
        dependencyPaths.add(reference.sourceFile.path);
      }

      return {
        basename: file.basename,
        path: file.path,
        typeLabel: this.plugin.t(reference.kind === "block" ? "referenceTypeBlock" : "referenceTypeLine"),
        raw: reference.raw,
        preview: direction === "outgoing" ? reference.targetPreview : reference.sourceContext,
        metadataChips: this.formatMetadataChips(
          direction === "outgoing" ? reference.targetMetadata : reference.sourceMetadata
        ),
        action: direction === "outgoing"
          ? {
            path: reference.targetFile.path,
            blockId: reference.kind === "block" ? reference.blockId : undefined,
            startLine: reference.kind === "line" ? reference.startLine : undefined,
            endLine: reference.kind === "line" ? reference.endLine : undefined
          }
          : {
            path: reference.sourceFile.path,
            startLine: reference.sourceStartLine,
            endLine: reference.sourceEndLine
          }
      };
    });

    return {
      title,
      count: items.length,
      items,
      emptyMessage: this.plugin.t("emptyList")
    };
  }

  private buildRelationSectionSnapshot(
    activeFile: TFile,
    dependencyPaths: Set<string>
  ): RelationSectionSnapshot {
    const relationMap = getResolvedRelations(this.app, activeFile, this.plugin.settings);
    const groups = Object.entries(relationMap).map(([key, files]) => ({
      label: this.plugin.relationLabel(key),
      key,
      items: files.map((file) => {
        dependencyPaths.add(file.path);
        return { basename: file.basename, path: file.path };
      })
    }));

    return {
      title: this.plugin.t("relations"),
      count: groups.length,
      groups,
      emptyMessage: this.plugin.t("emptyList")
    };
  }

  private buildTagSectionSnapshot(activeFile: TFile): TagSectionSnapshot {
    const tags = getAllTagsForFile(this.app, activeFile);
    if (tags.length === 0) {
      return {
        title: this.plugin.t("tags"),
        count: 0,
        groups: [],
        emptyMessage: this.plugin.t("emptyList")
      };
    }

    const grouped = new Map<string, string[]>();
    const unclassified: string[] = [];
    for (const tag of tags) {
      const facet = this.plugin.getFacetForTag(tag);
      if (!facet) {
        unclassified.push(tag);
        continue;
      }
      grouped.set(facet, [...(grouped.get(facet) ?? []), tag]);
    }

    const groups: TagGroupSnapshot[] = [];
    if (grouped.size === 0) {
      groups.push({ tags: [...tags] });
    } else {
      for (const [facet, facetTags] of [...grouped.entries()].sort((left, right) => left[0].localeCompare(right[0], "zh-Hans-CN"))) {
        groups.push({
          label: this.plugin.formatFacetLabel(facet),
          count: facetTags.length,
          tags: facetTags
        });
      }
      if (unclassified.length > 0) {
        groups.push({
          label: this.plugin.t("tagFacetUnclassified"),
          count: unclassified.length,
          tags: unclassified
        });
      }
    }

    return {
      title: this.plugin.t("tags"),
      count: tags.length,
      groups,
      emptyMessage: this.plugin.t("emptyList")
    };
  }

  private buildMentionSectionSnapshot(
    title: string,
    mentions: Awaited<ReturnType<typeof findUnlinkedMentions>>,
    dependencyPaths: Set<string>
  ): MentionSectionSnapshot {
    const items = mentions.map((mention) => {
      dependencyPaths.add(mention.file.path);
      return {
        basename: mention.file.basename,
        path: mention.file.path,
        matchedTerm: mention.matchedTerm,
        snippet: mention.snippet
      };
    });

    return {
      title,
      count: items.length,
      explanation: this.plugin.t("mentionsExplanation"),
      items,
      emptyMessage: this.plugin.t("emptyList")
    };
  }

  private buildCaptureSectionSnapshot(): StatusSectionSnapshot {
    return {
      title: this.plugin.t("ingestionCapture"),
      lines: [
        isIngestionConfigured(this.plugin.settings) ? this.plugin.t("configured") : this.plugin.t("notConfigured"),
        this.plugin.t("ingestionStatusHint")
      ]
    };
  }

  private buildSemanticSectionSnapshot(): StatusSectionSnapshot {
    const lines = [
      isSemanticBridgeConfigured(this.plugin.settings) ? this.plugin.t("configured") : this.plugin.t("notConfigured")
    ];

    if (this.plugin.settings.workflowMode === "researcher") {
      lines.push(this.plugin.t("settingsSemanticResearchHint"));
    }

    return {
      title: this.plugin.t("semanticBridge"),
      lines
    };
  }

  private applySnapshot(snapshot: SidebarSnapshot, request: ViewRefreshRequest): void {
    this.applyToolbarSnapshot(snapshot.toolbar);
    this.applyContextVisibility(snapshot);

    if (!snapshot.hasContext) {
      return;
    }

    this.updateSection("current-note", snapshot.currentNote ?? null);
    this.updateSection("outgoing-links", snapshot.outgoingLinks ?? null);
    this.updateSection("backlinks", snapshot.backlinks ?? null);
    this.updateSection("outgoing-references", snapshot.outgoingReferences ?? null);
    this.updateSection("incoming-references", snapshot.incomingReferences ?? null);
    this.updateSection("relations", snapshot.relations ?? null);
    this.updateSection("tags", snapshot.tags ?? null);
    this.updateSection("mentions", snapshot.mentions ?? null);
    this.updateSection("capture", snapshot.capture ?? null);
    this.updateSection("semantic", snapshot.semantic ?? null);

    if (request.focusSectionId) {
      const shell = this.sectionShells.get(request.focusSectionId as SidebarSectionId);
      shell?.toggleEl.focus({ preventScroll: true });
    }
  }

  private applyToolbarSnapshot(toolbar: ToolbarButtonSnapshot[]): void {
    const signature = serializeSnapshot(toolbar);
    if (this.toolbarSignature === signature) {
      return;
    }
    this.toolbarSignature = signature;

    for (const item of toolbar) {
      const button = this.toolbarButtons.get(item.key);
      if (!button) {
        continue;
      }

      button.textContent = item.label;
      button.disabled = item.disabled;
      if (item.title) {
        button.title = item.title;
      } else {
        button.removeAttribute("title");
      }
      button.classList.toggle("lti-toolbar-button-disabled", item.disabled);
    }
  }

  private applyContextVisibility(snapshot: SidebarSnapshot): void {
    if (this.sectionsContainerEl) {
      this.sectionsContainerEl.hidden = !snapshot.hasContext;
    }
  }

  private updateSection(id: SidebarSectionId, snapshot: unknown | null): void {
    const shell = this.sectionShells.get(id);
    if (!shell) {
      return;
    }

    const visible = snapshot !== null;
    shell.sectionEl.style.display = visible ? "" : "none";
    if (!visible) {
      shell.lastSignature = null;
      shell.innerEl.empty();
      shell.countEl.hidden = true;
      return;
    }

    const { title, count } = this.getSectionMeta(snapshot);
    shell.titleEl.textContent = title;
    shell.toggleEl.setAttribute("aria-label", title);
    shell.countEl.hidden = typeof count !== "number";
    if (typeof count === "number") {
      shell.countEl.textContent = String(count);
    }

    const signature = serializeSnapshot(snapshot);
    if (shell.lastSignature === signature) {
      return;
    }
    shell.lastSignature = signature;

    shell.innerEl.empty();
    switch (id) {
      case "current-note":
        this.renderCurrentNoteBody(shell.innerEl, snapshot as CurrentNoteSnapshot);
        break;
      case "outgoing-links":
      case "backlinks":
        this.renderFileSectionBody(shell.innerEl, snapshot as FileSectionSnapshot);
        break;
      case "outgoing-references":
      case "incoming-references":
        this.renderReferenceSectionBody(shell.innerEl, snapshot as ReferenceSectionSnapshot);
        break;
      case "relations":
        this.renderRelationSectionBody(shell.innerEl, snapshot as RelationSectionSnapshot);
        break;
      case "tags":
        this.renderTagSectionBody(shell.innerEl, snapshot as TagSectionSnapshot);
        break;
      case "mentions":
        this.renderMentionSectionBody(shell.innerEl, snapshot as MentionSectionSnapshot);
        break;
      case "capture":
      case "semantic":
        this.renderStatusSectionBody(shell.innerEl, snapshot as StatusSectionSnapshot);
        break;
    }
  }

  private getSectionMeta(snapshot: unknown): { title: string; count?: number } {
    if (this.isCurrentNoteSnapshot(snapshot)) {
      return { title: this.plugin.t("currentNote") };
    }
    if (this.isStatusSectionSnapshot(snapshot)) {
      return { title: snapshot.title };
    }

    const typed = snapshot as
      | FileSectionSnapshot
      | ReferenceSectionSnapshot
      | RelationSectionSnapshot
      | TagSectionSnapshot
      | MentionSectionSnapshot;

    return {
      title: typed.title,
      count: typed.count
    };
  }

  private isCurrentNoteSnapshot(snapshot: unknown): snapshot is CurrentNoteSnapshot {
    return typeof snapshot === "object" && snapshot !== null && "path" in snapshot && "metadataChips" in snapshot && !("count" in snapshot);
  }

  private isStatusSectionSnapshot(snapshot: unknown): snapshot is StatusSectionSnapshot {
    return typeof snapshot === "object" && snapshot !== null && "lines" in snapshot;
  }

  private renderCurrentNoteBody(parent: HTMLElement, snapshot: CurrentNoteSnapshot): void {
    const noteCard = parent.createDiv({ cls: "lti-item lti-item-compact lti-current-note-card" });
    const header = noteCard.createDiv({ cls: "lti-item-topline" });
    const link = header.createEl("button", {
      text: snapshot.title,
      cls: "lti-note-link lti-note-title",
      attr: { type: "button" }
    });
    link.addEventListener("click", (event) => {
      event.preventDefault();
      this.openFileByPath(snapshot.path);
    });
    noteCard.createSpan({ text: snapshot.path, cls: "lti-item-meta lti-item-path" });
    this.renderChipRow(noteCard, snapshot.metadataChips);
  }

  private renderFileSectionBody(parent: HTMLElement, snapshot: FileSectionSnapshot): void {
    if (snapshot.items.length === 0) {
      parent.createDiv({ text: snapshot.emptyMessage, cls: "lti-empty" });
      return;
    }

    const list = parent.createDiv({ cls: "lti-list lti-list-compact" });
    for (const item of snapshot.items) {
      const row = list.createDiv({ cls: "lti-list-row" });
      const header = row.createDiv({ cls: "lti-list-row-head" });
      const link = header.createEl("button", {
        text: item.basename,
        cls: "lti-note-link lti-list-row-title",
        attr: { type: "button" }
      });
      link.addEventListener("click", (event) => {
        event.preventDefault();
        this.openFileByPath(item.path);
      });
      row.createDiv({ text: item.path, cls: "lti-list-row-path" });
    }
  }

  private renderReferenceSectionBody(parent: HTMLElement, snapshot: ReferenceSectionSnapshot): void {
    if (snapshot.items.length === 0) {
      parent.createDiv({ text: snapshot.emptyMessage, cls: "lti-empty" });
      return;
    }

    const list = parent.createDiv({ cls: "lti-list lti-list-compact" });
    for (const item of snapshot.items) {
      const row = list.createDiv({ cls: "lti-list-row lti-reference-row" });
      const header = row.createDiv({ cls: "lti-list-row-head" });
      const link = header.createEl("button", {
        text: item.basename,
        cls: "lti-note-link lti-list-row-title",
        attr: { type: "button" }
      });
      link.addEventListener("click", (event) => {
        event.preventDefault();
        this.openReferenceAction(item.action);
      });
      row.createDiv({ text: item.path, cls: "lti-list-row-path" });
      const meta = row.createDiv({ cls: "lti-pill-row lti-pill-row-compact lti-reference-meta" });
      meta.createSpan({ text: item.typeLabel, cls: "lti-pill" });
      meta.createSpan({ text: item.raw, cls: "lti-ref-syntax lti-list-row-code" });
      this.renderChipRow(row, item.metadataChips);
      if (item.preview) {
        row.createDiv({ text: item.preview, cls: "lti-list-row-snippet" });
      }
    }
  }

  private renderRelationSectionBody(parent: HTMLElement, snapshot: RelationSectionSnapshot): void {
    if (snapshot.groups.length === 0) {
      parent.createDiv({ text: snapshot.emptyMessage, cls: "lti-empty" });
      return;
    }

    const list = parent.createDiv({ cls: "lti-list lti-compact-list" });
    for (const group of snapshot.groups) {
      const block = list.createDiv({ cls: "lti-item lti-item-compact" });
      const header = block.createDiv({ cls: "lti-section-inline-head" });
      header.createDiv({ text: group.label, cls: "suggestion-title" });
      header.createSpan({ text: group.key, cls: "suggestion-meta" });
      const pills = block.createDiv({ cls: "lti-pill-row lti-pill-grid" });
      for (const item of group.items) {
        const pill = pills.createEl("button", {
          text: item.basename,
          cls: "lti-pill lti-note-link lti-pill-link",
          attr: { type: "button" }
        });
        pill.addEventListener("click", (event) => {
          event.preventDefault();
          this.openFileByPath(item.path);
        });
      }
    }
  }

  private renderTagSectionBody(parent: HTMLElement, snapshot: TagSectionSnapshot): void {
    if (snapshot.groups.length === 0) {
      parent.createDiv({ text: snapshot.emptyMessage, cls: "lti-empty" });
      return;
    }

    for (const group of snapshot.groups) {
      if (group.label) {
        const block = parent.createDiv({ cls: "lti-item lti-item-compact" });
        const header = block.createDiv({ cls: "lti-section-inline-head" });
        header.createDiv({ text: group.label, cls: "suggestion-title" });
        if (typeof group.count === "number") {
          header.createSpan({ text: String(group.count), cls: "suggestion-meta" });
        }
        const pills = block.createDiv({ cls: "lti-pill-row lti-tag-grid" });
        for (const tag of group.tags) {
          pills.createSpan({ text: `#${tag}`, cls: "lti-pill lti-tag-chip" });
        }
        continue;
      }

      const pills = parent.createDiv({ cls: "lti-pill-row lti-tag-grid" });
      for (const tag of group.tags) {
        pills.createSpan({ text: `#${tag}`, cls: "lti-pill lti-tag-chip" });
      }
    }
  }

  private renderMentionSectionBody(parent: HTMLElement, snapshot: MentionSectionSnapshot): void {
    parent.createDiv({ text: snapshot.explanation, cls: "lti-item-subtext" });
    if (snapshot.items.length === 0) {
      parent.createDiv({ text: snapshot.emptyMessage, cls: "lti-empty" });
      return;
    }

    const list = parent.createDiv({ cls: "lti-list lti-list-compact" });
    for (const item of snapshot.items) {
      const row = list.createDiv({ cls: "lti-list-row" });
      const header = row.createDiv({ cls: "lti-list-row-head" });
      const link = header.createEl("button", {
        text: item.basename,
        cls: "lti-note-link lti-list-row-title",
        attr: { type: "button" }
      });
      link.addEventListener("click", (event) => {
        event.preventDefault();
        this.openFileByPath(item.path);
      });
      const meta = header.createDiv({ cls: "lti-list-row-meta" });
      meta.createSpan({ text: item.matchedTerm, cls: "lti-pill" });
      row.createDiv({ text: item.path, cls: "lti-list-row-path" });
      row.createDiv({ text: item.snippet, cls: "lti-list-row-snippet" });
    }
  }

  private renderStatusSectionBody(parent: HTMLElement, snapshot: StatusSectionSnapshot): void {
    for (const line of snapshot.lines) {
      parent.createDiv({ text: line, cls: "lti-item-subtext" });
    }
  }

  private renderChipRow(parent: HTMLElement, chips: string[]): void {
    if (chips.length === 0) {
      return;
    }

    const row = parent.createDiv({ cls: "lti-pill-row lti-pill-row-compact lti-reference-meta" });
    for (const chip of chips) {
      row.createSpan({ text: chip, cls: "lti-pill" });
    }
  }

  private formatMetadataChips(metadata: ResearchMetadata): string[] {
    return this.plugin.formatResearchMetadataChips(metadata);
  }

  private openReferenceAction(action: ReferenceActionSnapshot): void {
    const file = this.resolveFileByPath(action.path);
    if (!file) {
      return;
    }

    if (action.blockId) {
      this.plugin.openFileAtBlock(file, action.blockId);
      return;
    }

    if (typeof action.startLine === "number") {
      this.plugin.openFileAtLine(file, action.startLine, action.endLine);
      return;
    }

    this.plugin.openFile(file);
  }

  private openFileByPath(path: string): void {
    const file = this.resolveFileByPath(path);
    if (file) {
      this.plugin.openFile(file);
    }
  }

  private resolveFileByPath(path: string): TFile | null {
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? file : null;
  }

  private getSectionExpanded(id: string, defaultExpanded: boolean): boolean {
    return this.sectionState.get(id) ?? defaultExpanded;
  }

  async onClose(): Promise<void> {
    if (this.refreshFrame !== null) {
      window.cancelAnimationFrame(this.refreshFrame);
      this.refreshFrame = null;
    }

    this.pendingRefresh = null;
    this.refreshPromise = null;
    this.contentEl.empty();
  }
}
