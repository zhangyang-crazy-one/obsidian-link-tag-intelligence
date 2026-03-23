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

function renderModalHeader(parent: HTMLElement, title: string, description?: string): void {
  const header = parent.createDiv({ cls: "lti-modal-header" });
  header.createDiv({ text: title, cls: "lti-modal-title" });
  if (description) {
    header.createDiv({ text: description, cls: "lti-modal-description" });
  }
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
      .onClick(() => {
        const value = input.value.trim();
        if (!value) {
          return;
        }
        const result = this.onSubmit(value);
        if (result instanceof Promise) {
          void result.then(() => this.close());
        } else {
          this.close();
        }
      });

    new ButtonComponent(actions)
      .setButtonText("Cancel")
      .onClick(() => this.close());

    input.focus();
    input.select();
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const value = input.value.trim();
        if (!value) {
          return;
        }
        void this.onSubmit(value);
        this.close();
      }
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
    this.currentFile = plugin.getContextMarkdownFile();
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
    void this.onChoose(candidate);
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
      .onClick(() => {
        if (this.mode === "block_ref") {
          this.plugin.insertBlockReferenceIntoEditor(this.file, this.startLine, this.endLine);
        } else {
          this.plugin.insertLineReferenceIntoEditor(this.file, this.startLine, this.endLine);
        }
        this.close();
      });

    new ButtonComponent(actions)
      .setButtonText(this.plugin.t("cancel"))
      .onClick(() => this.close());
  }
}

export class TagManagerModal extends Modal {
  private readonly plugin: LinkTagIntelligencePlugin;
  private search = "";

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
      this.render();
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
        void (async () => {
          const updated = await deleteTagAcrossVault(this.plugin.app, stat.tag);
          new Notice(`${this.plugin.t("tagsUpdated")} (${updated})`);
          this.render();
          this.plugin.refreshAllViews();
        })();
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
        void appendTagsToFrontmatter(this.plugin.app, this.file, [...this.selected]).then(() => {
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

export class SemanticSearchModal extends Modal {
  private readonly plugin: LinkTagIntelligencePlugin;
  private readonly activeFile: TFile | null;
  private readonly initialQuery: string;
  private results: SemanticSearchResult[] = [];

  constructor(plugin: LinkTagIntelligencePlugin) {
    super(plugin.app);
    this.plugin = plugin;
    this.activeFile = plugin.getContextMarkdownFile();
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
      void (async () => {
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
      })();
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
}
