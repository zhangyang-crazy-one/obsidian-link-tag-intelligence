import { ItemView, TFile, WorkspaceLeaf } from "obsidian";

import type LinkTagIntelligencePlugin from "./main";
import { isIngestionConfigured } from "./ingestion";
import {
  type ExactReference,
  findUnlinkedMentions,
  getAllTagsForFile,
  getBacklinkFiles,
  getResearchSourceMetadataForFile,
  getIncomingExactReferences,
  getOutgoingLinkFiles,
  getOutgoingExactReferences,
  getResolvedRelations,
  isExcalidrawFile
} from "./notes";
import { isSemanticBridgeConfigured } from "./semantic";

export const LINK_TAG_INTELLIGENCE_VIEW = "link-tag-intelligence-view";

export class LinkTagIntelligenceView extends ItemView {
  plugin: LinkTagIntelligencePlugin;
  private readonly sectionState = new Map<string, boolean>();

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

  async onOpen(): Promise<void> {
    this.containerEl.addClass("link-tag-intelligence-view");
    await this.refresh();
    if (!this.plugin.getContextNoteFile()) {
      setTimeout(() => void this.refresh(), 500);
    }
  }

  async refresh(options: { preserveScroll?: boolean; focusSectionId?: string } = {}): Promise<void> {
    const scrollContainer = this.getScrollContainer();
    const previousScrollTop = options.preserveScroll ? scrollContainer.scrollTop : null;
    const content = this.contentEl;
    content.empty();
    content.addClass("link-tag-intelligence-view");

    const toolbar = content.createDiv({ cls: "lti-toolbar" });
    const hasContext = Boolean(this.plugin.getContextNoteFile());
    const fileRequiredKeys = new Set(["insertLink", "insertBlockRef", "insertLineRef", "quickLink"]);
    const buttons: Array<[string, () => void]> = [
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
        text: this.plugin.t(key as never),
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
    if (!(activeFile instanceof TFile)) {
      content.createDiv({ text: this.plugin.t("noActiveNote"), cls: "lti-empty" });
      return;
    }

    const currentSection = this.createSection(content, "current-note", this.plugin.t("currentNote"), undefined, true, true);
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
          const toggle = this.contentEl.querySelector<HTMLElement>(`.lti-section-toggle[data-section-id="${options.focusSectionId}"]`);
          toggle?.focus({ preventScroll: true });
        }
      });
    }
  }

  private renderFileSection(parent: HTMLElement, id: string, title: string, files: TFile[], defaultExpanded: boolean): void {
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

  private renderExactReferenceSection(
    parent: HTMLElement,
    id: string,
    title: string,
    references: ExactReference[],
    direction: "outgoing" | "incoming",
    defaultExpanded: boolean
  ): void {
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

  private renderRelationSection(parent: HTMLElement, activeFile: TFile): void {
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

  private renderTagSection(parent: HTMLElement, activeFile: TFile): void {
    const tags = getAllTagsForFile(this.app, activeFile);
    const section = this.createSection(parent, "tags", this.plugin.t("tags"), tags.length, true);
    if (!section) {
      return;
    }

    if (tags.length === 0) {
      section.createDiv({ text: this.plugin.t("emptyList"), cls: "lti-empty" });
      return;
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

  private async renderMentionsSection(parent: HTMLElement, activeFile: TFile): Promise<void> {
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

  private renderSemanticSection(parent: HTMLElement): void {
    const section = this.createSection(parent, "semantic", this.plugin.t("semanticBridge"), undefined, false);
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

  private renderCaptureSection(parent: HTMLElement): void {
    const section = this.createSection(parent, "capture", this.plugin.t("ingestionCapture"), undefined, false);
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

  private renderMetadataPills(parent: HTMLElement, metadata: Parameters<LinkTagIntelligencePlugin["formatResearchMetadataChips"]>[0]): void {
    const chips = this.plugin.formatResearchMetadataChips(metadata);
    if (chips.length === 0) {
      return;
    }

    const metaRow = parent.createDiv({ cls: "lti-pill-row lti-pill-row-compact lti-reference-meta" });
    for (const chip of chips) {
      metaRow.createSpan({ text: chip, cls: "lti-pill" });
    }
  }

  private createSection(
    parent: HTMLElement,
    id: string,
    title: string,
    count?: number,
    defaultExpanded = false,
    emphasized = false
  ): HTMLElement | null {
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

    const onToggle = (): void => {
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

    const body = section.createDiv({ cls: "lti-section-body" });
    body.dataset.sectionId = id;
    if (!expanded) {
      body.addClass("is-collapsed");
    }
    return body;
  }

  private getSectionExpanded(id: string, defaultExpanded: boolean): boolean {
    return this.sectionState.get(id) ?? defaultExpanded;
  }

  private getScrollContainer(): HTMLElement {
    return this.contentEl.closest(".view-content") instanceof HTMLElement
      ? (this.contentEl.closest(".view-content") as HTMLElement)
      : this.contentEl;
  }

  private openExactReference(reference: ExactReference): void {
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

  private openPrimaryReference(reference: ExactReference, direction: "outgoing" | "incoming"): void {
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

  onClose(): Promise<void> {
    this.contentEl.empty();
    return Promise.resolve();
  }
}
