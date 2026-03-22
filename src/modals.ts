import {
  ButtonComponent,
  Modal,
  Notice,
  SuggestModal,
  TFile
} from "obsidian";

import type LinkTagIntelligencePlugin from "./main";
import { relationKeyLabel } from "./i18n";
import { collectLinkCandidates, type LinkCandidate } from "./notes";
import {
  getLineRangePreviewFromLines,
  normalizeLineRange,
  readFileLines
} from "./references";
import { runSemanticSearch, type SemanticSearchResult } from "./semantic";
import {
  appendTagsToFrontmatter,
  deleteTagAcrossVault,
  getTagStats,
  renameTagAcrossVault,
  suggestTagsForFile,
  type TagSuggestion
} from "./tags";
import type { ResearchIngestionRequest, ResearchSourceType } from "./ingestion";

function renderModalHeader(parent: HTMLElement, title: string, description?: string): void {
  const header = parent.createDiv({ cls: "lti-modal-header" });
  header.createDiv({ text: title, cls: "lti-modal-title" });
  if (description) {
    header.createDiv({ text: description, cls: "lti-modal-description" });
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<void> {
  return typeof value === "object" && value !== null && "then" in value && typeof (value as { then?: unknown }).then === "function";
}

function runModalTask(task: () => Promise<void> | void): void {
  const onError = (error: unknown): void => {
    console.error("[lti-modal] action failed", error);
    new Notice(error instanceof Error ? error.message : String(error));
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

function inferResearchSourceType(value: string): ResearchSourceType {
  const normalized = value.trim();
  if (/arxiv\.org\/(abs|pdf)\//i.test(normalized) || /^\d{4}\.\d{4,5}(v\d+)?$/i.test(normalized) || /^[a-z-]+\/\d{7}$/i.test(normalized)) {
    return "arxiv";
  }
  if (/\.pdf($|\?)/i.test(normalized) || /^(\/|\.{1,2}\/)/.test(normalized)) {
    return "pdf";
  }
  return "doi";
}

export class TextPromptModal extends Modal {
  private readonly title: string;
  private readonly placeholder: string;
  private readonly defaultValue: string;
  private readonly onSubmit: (value: string) => Promise<void> | void;

  constructor(
    plugin: LinkTagIntelligencePlugin,
    title: string,
    onSubmit: (value: string) => Promise<void> | void,
    options?: { placeholder?: string; defaultValue?: string }
  ) {
    super(plugin.app);
    this.title = title;
    this.placeholder = options?.placeholder ?? "";
    this.defaultValue = options?.defaultValue ?? "";
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
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
    new ButtonComponent(actions)
      .setButtonText("OK")
      .setCta()
      .onClick(() => this.submitValue(input));

    new ButtonComponent(actions)
      .setButtonText("Cancel")
      .onClick(() => this.close());

    input.focus();
    input.select();
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.submitValue(input);
      }
    });
  }

  private submitValue(input: HTMLInputElement): void {
    runModalTask(async () => {
      const value = input.value.trim();
      if (!value) {
        return;
      }

      await this.onSubmit(value);
      this.close();
    });
  }
}

export class RelationKeyModal extends SuggestModal<string> {
  private readonly plugin: LinkTagIntelligencePlugin;
  private readonly onChoose: (value: string) => void;

  constructor(plugin: LinkTagIntelligencePlugin, onChoose: (value: string) => void) {
    super(plugin.app);
    this.plugin = plugin;
    this.onChoose = onChoose;
    this.setPlaceholder(this.plugin.t("promptRelationKey"));
    this.emptyStateText = this.plugin.t("emptyList");
  }

  getSuggestions(query: string): string[] {
    const normalized = query.trim().toLowerCase();
    return this.plugin.settings.relationKeys.filter((key) => {
      if (!normalized) {
        return true;
      }
      const label = relationKeyLabel(this.plugin.currentLanguage(), key).toLowerCase();
      return key.toLowerCase().includes(normalized) || label.includes(normalized);
    });
  }

  renderSuggestion(value: string, el: HTMLElement): void {
    const title = relationKeyLabel(this.plugin.currentLanguage(), value);
    el.createEl("div", { text: title, cls: "suggestion-title" });
    el.createDiv({ text: value, cls: "suggestion-meta" });
  }

  onChooseSuggestion(value: string): void {
    this.onChoose(value);
  }
}

export class LinkInsertModal extends SuggestModal<LinkCandidate> {
  private readonly plugin: LinkTagIntelligencePlugin;
  private readonly mode: "wikilink" | "quick_link";
  private readonly currentFile: TFile | null;
  private readonly selectedText: string;
  private readonly onChoose: (candidate: LinkCandidate) => Promise<void> | void;

  constructor(
    plugin: LinkTagIntelligencePlugin,
    mode: "wikilink" | "quick_link",
    onChoose?: (candidate: LinkCandidate) => Promise<void> | void,
    options?: { placeholder?: string; emptyStateText?: string }
  ) {
    super(plugin.app);
    this.plugin = plugin;
    this.mode = mode;
    this.currentFile = plugin.getContextNoteFile();
    this.selectedText = plugin.getContextSelection();
    this.onChoose = onChoose ?? ((candidate) => this.plugin.insertLinkIntoEditor(candidate.file, this.mode === "quick_link" ? this.selectedText : ""));
    this.setPlaceholder(options?.placeholder ?? this.plugin.t("insertLinkPlaceholder"));
    this.emptyStateText = options?.emptyStateText ?? this.plugin.t("insertLinkEmpty");
  }

  async getSuggestions(query: string): Promise<LinkCandidate[]> {
    return (await collectLinkCandidates(
      this.app,
      this.currentFile,
      query,
      this.plugin.settings,
      this.plugin.settings.recentLinkTargets,
      this.plugin.getTagAliasMap()
    )).slice(0, 40);
  }

  renderSuggestion(candidate: LinkCandidate, el: HTMLElement): void {
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
        text: `${this.plugin.t("reason")}: ${candidate.reasons.join(" · ")}`,
        cls: "suggestion-meta"
      });
    }

    if (candidate.excerpt) {
      container.createDiv({ text: candidate.excerpt, cls: "suggestion-preview" });
    }
  }

  onChooseSuggestion(candidate: LinkCandidate): void {
    runModalTask(() => this.onChoose(candidate));
  }
}

export class ReferenceInsertModal extends Modal {
  private readonly plugin: LinkTagIntelligencePlugin;
  private readonly file: TFile;
  private readonly mode: "block_ref" | "line_ref";
  private lines: string[] = [];
  private startLine = 1;
  private endLine = 1;

  constructor(plugin: LinkTagIntelligencePlugin, file: TFile, mode: "block_ref" | "line_ref") {
    super(plugin.app);
    this.plugin = plugin;
    this.file = file;
    this.mode = mode;
  }

  async onOpen(): Promise<void> {
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

  private render(): void {
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

    const syncInputs = (): void => {
      const normalized = normalizeLineRange(
        Number.parseInt(startInput.value, 10) || 1,
        Number.parseInt(endInput.value, 10) || undefined,
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
    new ButtonComponent(actions)
      .setButtonText(this.plugin.t(this.mode === "block_ref" ? "insertBlockRef" : "insertLineRef"))
      .setCta()
      .onClick(() => this.submitSelection());

    new ButtonComponent(actions)
      .setButtonText(this.plugin.t("cancel"))
      .onClick(() => this.close());
  }

  private submitSelection(): void {
    if (this.mode === "block_ref") {
      void this.plugin.insertBlockReferenceIntoEditor(this.file, this.startLine, this.endLine);
    } else {
      void this.plugin.insertLineReferenceIntoEditor(this.file, this.startLine, this.endLine);
    }

    this.close();
  }
}

export class TagManagerModal extends Modal {
  private readonly plugin: LinkTagIntelligencePlugin;
  private search = "";
  private searchDebounceTimer: number | null = null;

  constructor(plugin: LinkTagIntelligencePlugin) {
    super(plugin.app);
    this.plugin = plugin;
  }

  onOpen(): void {
    this.render();
  }

  private render(): void {
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
    const stats = getTagStats(this.plugin.app, this.plugin.settings.tagAliasMapText).filter((stat) =>
      !this.search.trim() || stat.tag.toLowerCase().includes(this.search.trim().toLowerCase())
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
          new Notice(`${this.plugin.t("tagsUpdated")} (${updated})`);
          this.render();
          this.plugin.refreshAllViews();
        }, { defaultValue: stat.tag }).open();
      });

      const mergeButton = actions.createEl("button", { text: this.plugin.t("merge"), cls: "lti-inline-button" });
      mergeButton.addEventListener("click", () => {
        new TextPromptModal(this.plugin, this.plugin.t("promptMergeInto"), async (value) => {
          const updated = await renameTagAcrossVault(this.plugin.app, stat.tag, value);
          new Notice(`${this.plugin.t("tagsUpdated")} (${updated})`);
          this.render();
          this.plugin.refreshAllViews();
        }).open();
      });

      const deleteButton = actions.createEl("button", { text: this.plugin.t("delete"), cls: "lti-inline-button" });
      deleteButton.addEventListener("click", () => {
        runModalTask(async () => {
          const updated = await deleteTagAcrossVault(this.plugin.app, stat.tag);
          new Notice(`${this.plugin.t("tagsUpdated")} (${updated})`);
          this.render();
          this.plugin.refreshAllViews();
        });
      });
    }
  }
}

export class TagSuggestionModal extends Modal {
  private readonly plugin: LinkTagIntelligencePlugin;
  private readonly file: TFile;
  private suggestions: TagSuggestion[] = [];
  private selected = new Set<string>();

  constructor(plugin: LinkTagIntelligencePlugin, file: TFile) {
    super(plugin.app);
    this.plugin = plugin;
    this.file = file;
  }

  async onOpen(): Promise<void> {
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
      [...preferred.slice(0, 3), ...fallback.slice(0, Math.max(0, 4 - preferred.slice(0, 3).length))]
        .slice(0, 4)
        .map((item) => item.tag)
    );
    this.render();
  }

  private render(): void {
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
    new ButtonComponent(actions)
      .setButtonText(this.plugin.t("apply"))
      .setCta()
      .onClick(() => {
        runModalTask(async () => {
          await appendTagsToFrontmatter(this.plugin.app, this.file, [...this.selected]);
          new Notice(this.plugin.t("createdFrontmatterTag"));
          this.plugin.refreshAllViews();
          this.close();
        });
      });

    new ButtonComponent(actions)
      .setButtonText(this.plugin.t("cancel"))
      .onClick(() => this.close());
  }

  private renderSuggestionGroup(parent: HTMLElement, title: string, suggestions: TagSuggestion[]): void {
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

      const toggleSelection = (): void => {
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

  private kindLabel(kind: TagSuggestion["kind"]): string {
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

  private formatSources(sources: TagSuggestion["sources"]): string {
    return sources
      .map((source) => {
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
      })
      .join(" / ");
  }
}

export class ResearchIngestionModal extends Modal {
  private readonly plugin: LinkTagIntelligencePlugin;
  private readonly activeFile: TFile | null;
  private sourceType: ResearchSourceType;
  private source = "";
  private metadataDoi = "";
  private metadataArxiv = "";
  private titleOverride = "";
  private authorsOverride = "";
  private yearOverride = "";
  private downloadPdf = true;
  private result: Awaited<ReturnType<LinkTagIntelligencePlugin["runResearchIngestion"]>> | null = null;
  private inlineError = "";

  constructor(plugin: LinkTagIntelligencePlugin) {
    super(plugin.app);
    this.plugin = plugin;
    this.activeFile = plugin.getContextNoteFile();
    this.source = plugin.getContextSelection().trim();
    this.sourceType = inferResearchSourceType(this.source);
  }

  onOpen(): void {
    this.render();
  }

  private render(): void {
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
      this.sourceType = typeSelect.value as ResearchSourceType;
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
      openButton.addEventListener("click", () => {
        void this.plugin.openResolvedPath(this.result?.notePath ?? "");
      });
      const insertButton = resultActions.createEl("button", { text: this.plugin.t("ingestionInsert"), cls: "lti-inline-button" });
      insertButton.addEventListener("click", () => {
        void this.plugin.insertLinkFromPath(this.result?.notePath ?? "");
      });
    }

    const actions = contentEl.createDiv({ cls: "lti-modal-actions" });
    new ButtonComponent(actions)
      .setButtonText(this.plugin.t("ingestionRun"))
      .setCta()
      .onClick(() => {
        void this.submit();
      });

    new ButtonComponent(actions)
      .setButtonText(this.plugin.t("cancel"))
      .onClick(() => this.close());
  }

  private sourcePlaceholder(): string {
    if (this.sourceType === "arxiv") {
      return this.plugin.t("ingestionArxivPlaceholder");
    }
    if (this.sourceType === "pdf") {
      return this.plugin.t("ingestionPdfPlaceholder");
    }
    return this.plugin.t("ingestionDoiPlaceholder");
  }

  private async submit(): Promise<void> {
    const request: ResearchIngestionRequest = {
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
}

export class SemanticSearchModal extends Modal {
  private readonly plugin: LinkTagIntelligencePlugin;
  private readonly activeFile: TFile | null;
  private readonly initialQuery: string;
  private results: SemanticSearchResult[] = [];

  constructor(plugin: LinkTagIntelligencePlugin) {
    super(plugin.app);
    this.plugin = plugin;
    this.activeFile = plugin.getContextNoteFile();
    this.initialQuery = plugin.getContextSelection();
  }

  onOpen(): void {
    this.render();
  }

  private render(resultsError?: string): void {
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
      openButton.addEventListener("click", () => {
        void this.plugin.openResolvedPath(result.path);
      });
      const insertButton = actions.createEl("button", { text: this.plugin.t("semanticInsert"), cls: "lti-inline-button" });
      insertButton.addEventListener("click", () => {
        void this.plugin.insertLinkFromPath(result.path);
      });
    }
  }
}
