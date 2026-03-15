import { MarkdownView, Notice, Plugin, resolveSubpath, TFile, type HoverParent, WorkspaceLeaf } from "obsidian";

import { buildReferenceEditorExtension } from "./editor-extension";
import { debugLog, resetDebugLog } from "./debug-log";
import { relationKeyLabel, tr, resolveLanguage, type UILanguage } from "./i18n";
import { LinkInsertModal, ReferenceInsertModal, RelationKeyModal, SemanticSearchModal, TagManagerModal, TagSuggestionModal } from "./modals";
import {
  type ResearchSourceMetadata,
  resolveNoteTarget
} from "./notes";
import {
  applyCompanionPresetToVault,
  buildResearchWorkbenchProfile,
  readResearchWorkbenchState,
  type CompanionPluginId,
  type ResearchWorkbenchState
} from "./companion-plugins";
import {
  formatLegacyBlockReference,
  formatLegacyLineReference,
  getBlockReferencePreview,
  getLineRangePreview,
  renderLegacyReferences
} from "./references";
import { ReferencePreviewPopover, type ReferencePreviewData } from "./reference-preview";
import { getReadingReferenceHoverController } from "./reading-hover-controller";
import { formatFacetName, parseTagAliasMap, parseTagFacetMap, type TagFacetMap } from "./shared";
import { appendTagsToFrontmatter } from "./tags";
import {
  DEFAULT_SETTINGS,
  LinkTagIntelligenceSettingTab,
  normalizeLoadedSettings,
  type LinkTagIntelligenceSettings
} from "./settings";
import { LINK_TAG_INTELLIGENCE_VIEW, LinkTagIntelligenceView } from "./view";

export default class LinkTagIntelligencePlugin extends Plugin {
  settings: LinkTagIntelligenceSettings = DEFAULT_SETTINGS;
  private lastMarkdownLeaf: WorkspaceLeaf | null = null;
  private lastMarkdownFilePath: string | null = null;
  private readonly referencePreview = new ReferencePreviewPopover();
  private referencePreviewToken = 0;

  async onload(): Promise<void> {
    await this.loadSettings();
    const debugLogPath = await resetDebugLog(this.app);
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
        if (!(activeFile instanceof TFile)) {
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

    this.captureMarkdownContext(this.getActiveMarkdownLeaf());
    if (!this.lastMarkdownLeaf) {
      this.captureMarkdownContext(this.app.workspace.getLeavesOfType("markdown")[0] ?? null);
    }

    this.registerEvent(this.app.workspace.on("file-open", (file) => {
      if (file instanceof TFile) {
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

  onunload(): void {
    this.referencePreview.destroy();
  }

  async loadSettings(): Promise<void> {
    this.settings = normalizeLoadedSettings(await this.loadData(), this.app.vault.configDir);
  }

  async saveSettings(): Promise<void> {
    const memory = Math.max(1, this.settings.recentLinkMemorySize);
    this.settings.recentLinkTargets = this.settings.recentLinkTargets.slice(0, memory);
    await this.saveData(this.settings);
  }

  async getResearchWorkbenchState(): Promise<ResearchWorkbenchState> {
    return readResearchWorkbenchState(
      this.app,
      buildResearchWorkbenchProfile(this.settings, this.currentLanguage())
    );
  }

  async applyResearchPreset(): Promise<void> {
    const state = await this.getResearchWorkbenchState();
    for (const companionId of ["obsidian-zotero-desktop-connector", "pdf-plus", "smart-connections"] as const) {
      const status = state.companions.find((item) => item.id === companionId);
      if (!status?.installed) {
        continue;
      }
      await applyCompanionPresetToVault(this.app, companionId, state.profile);
    }
    this.refreshAllViews();
    new Notice(this.t("settingsWorkbenchPresetApplied"));
  }

  async applyCompanionPreset(id: CompanionPluginId): Promise<boolean> {
    if (id === "semantic-bridge") {
      await this.saveSettings();
      this.refreshAllViews();
      new Notice(this.t("settingsWorkbenchCompanionApplied", { name: "Semantic bridge" }));
      return true;
    }

    const state = await this.getResearchWorkbenchState();
    const status = state.companions.find((item) => item.id === id);
    if (!status?.installed) {
      new Notice(this.t("settingsWorkbenchPluginMissing"));
      return false;
    }

    await applyCompanionPresetToVault(this.app, id, state.profile);
    this.refreshAllViews();
    new Notice(this.t("settingsWorkbenchCompanionApplied", { name: this.getCompanionDisplayName(id) }));
    return true;
  }

  openCompanionSettings(id: CompanionPluginId): boolean {
    const settingApi = (this.app as { setting?: { open?: () => void; openTabById?: (tabId: string) => void } }).setting;
    if (!settingApi?.open || !settingApi.openTabById) {
      new Notice(this.t("settingsWorkbenchSettingsUnavailable"));
      return false;
    }
    settingApi.open();
    settingApi.openTabById(id === "semantic-bridge" ? this.manifest.id : id);
    return true;
  }

  async importZoteroNotes(): Promise<boolean> {
    return this.executeCommandByCandidates([
      "obsidian-zotero-desktop-connector:zdc-import-notes",
      "zdc-import-notes"
    ]);
  }

  async openSmartConnectionsView(): Promise<boolean> {
    return this.executeCommandByCandidates([
      "smart-connections:smart-connections-view",
      "smart-connections-view"
    ]);
  }

  openPdfPlusSettings(): boolean {
    return this.openCompanionSettings("pdf-plus");
  }

  currentLanguage(): UILanguage {
    return resolveLanguage(this.settings.language);
  }

  t(key: Parameters<typeof tr>[1], vars?: Record<string, string | number>): string {
    return tr(this.currentLanguage(), key, vars);
  }

  relationLabel(key: string): string {
    return relationKeyLabel(this.currentLanguage(), key);
  }

  getTagAliasMap(): Map<string, string[]> {
    try {
      return parseTagAliasMap(this.settings.tagAliasMapText);
    } catch (error) {
      console.warn(error);
      new Notice(this.t("invalidAliasMap"));
      return new Map();
    }
  }

  getTagFacetMap(options: { suppressNotice?: boolean } = {}): TagFacetMap {
    try {
      return parseTagFacetMap(this.settings.tagFacetMapText);
    } catch (error) {
      console.warn(error);
      if (!options.suppressNotice) {
        new Notice(this.t("invalidFacetMap"));
      }
      return new Map();
    }
  }

  formatFacetLabel(facet: string): string {
    return formatFacetName(facet);
  }

  getFacetForTag(tag: string): string | null {
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

  formatResearchMetadataChips(metadata: ResearchSourceMetadata | null | undefined): string[] {
    if (!metadata) {
      return [];
    }

    const chips: string[] = [];
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

  formatResearchMetadataSummary(metadata: ResearchSourceMetadata | null | undefined): string {
    return this.formatResearchMetadataChips(metadata).join(" · ");
  }

  formatSuggestedRelationSummary(relations: Record<string, string[]>): string {
    return Object.entries(relations)
      .filter(([, values]) => values.length > 0)
      .map(([key, values]) => `${this.relationLabel(key)} (${values.length})`)
      .join(" · ");
  }

  private getActiveMarkdownLeaf(): WorkspaceLeaf | null {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!(activeView?.file instanceof TFile)) {
      return null;
    }

    return activeView.leaf;
  }

  private captureMarkdownContext(leaf: WorkspaceLeaf | null): boolean {
    const view = leaf?.view;
    if (!(view instanceof MarkdownView) || !(view.file instanceof TFile)) {
      return false;
    }

    const changed = this.lastMarkdownLeaf !== leaf || this.lastMarkdownFilePath !== view.file.path;
    this.lastMarkdownLeaf = leaf;
    this.lastMarkdownFilePath = view.file.path;
    return changed;
  }

  getContextMarkdownView(): MarkdownView | null {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView?.file instanceof TFile) {
      this.captureMarkdownContext(activeView.leaf);
      return activeView;
    }

    const rememberedView = this.lastMarkdownLeaf?.view;
    if (rememberedView instanceof MarkdownView && rememberedView.file instanceof TFile) {
      this.lastMarkdownFilePath = rememberedView.file.path;
      return rememberedView;
    }

    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView) || !(view.file instanceof TFile)) {
        continue;
      }
      if (!this.lastMarkdownFilePath || view.file.path === this.lastMarkdownFilePath) {
        this.captureMarkdownContext(leaf);
        return view;
      }
    }

    return null;
  }

  getContextMarkdownFile(): TFile | null {
    const view = this.getContextMarkdownView();
    if (view?.file instanceof TFile) {
      return view.file;
    }

    if (!this.lastMarkdownFilePath) {
      return null;
    }

    const file = this.app.vault.getAbstractFileByPath(this.lastMarkdownFilePath);
    return file instanceof TFile ? file : null;
  }

  getContextSelection(): string {
    return this.getContextMarkdownView()?.editor?.getSelection() ?? "";
  }

  private getNavigationLeaf(): WorkspaceLeaf {
    const activeLeaf = this.getActiveMarkdownLeaf();
    if (activeLeaf?.view instanceof MarkdownView) {
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

  async openIntelligencePanel(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(LINK_TAG_INTELLIGENCE_VIEW)[0];
    const leaf = existing ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      return;
    }
    await leaf.setViewState({ type: LINK_TAG_INTELLIGENCE_VIEW, active: true });
    await this.app.workspace.revealLeaf(leaf);
    this.refreshAllViews();
  }

  refreshAllViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(LINK_TAG_INTELLIGENCE_VIEW)) {
      const view = leaf.view;
      if (view instanceof LinkTagIntelligenceView) {
        void view.refresh();
      }
    }
  }

  openLinkInsertModal(mode: "wikilink" | "quick_link"): void {
    new LinkInsertModal(this, mode).open();
  }

  openBlockReferenceFlow(): void {
    new LinkInsertModal(
      this,
      "wikilink",
      (candidate) => {
        new ReferenceInsertModal(this, candidate.file, "block_ref").open();
      },
      { placeholder: this.t("pickBlockRefTarget") }
    ).open();
  }

  openLineReferenceFlow(): void {
    new LinkInsertModal(
      this,
      "wikilink",
      (candidate) => {
        new ReferenceInsertModal(this, candidate.file, "line_ref").open();
      },
      { placeholder: this.t("pickLineRefTarget") }
    ).open();
  }

  private insertTextIntoContextEditor(text: string): boolean {
    const view = this.getContextMarkdownView();
    const editor = view?.editor;
    if (!editor) {
      new Notice(this.t("noActiveNote"));
      return false;
    }
    editor.replaceSelection(text);
    this.refreshAllViews();
    return true;
  }

  insertLinkIntoEditor(file: TFile, alias = ""): void {
    const view = this.getContextMarkdownView();
    const editor = view?.editor;
    if (!editor) {
      new Notice(this.t("noActiveNote"));
      return;
    }
    const normalizedAlias = alias.trim();
    const linkText = normalizedAlias
      ? `[[${file.basename}|${normalizedAlias}]]`
      : `[[${file.basename}]]`;

    editor.replaceSelection(linkText);

    this.pushRecentTarget(file.path);
    new Notice(this.t("insertedLink", { title: file.basename }));
    this.refreshAllViews();
  }

  insertBlockReferenceIntoEditor(file: TFile, startLine: number, endLine?: number): void {
    const sourcePath = this.getContextMarkdownFile()?.path ?? "";
    const target = sourcePath
      ? this.app.metadataCache.fileToLinktext(file, sourcePath, true)
      : file.basename;
    const text = formatLegacyBlockReference(target, startLine, endLine);
    if (this.insertTextIntoContextEditor(text)) {
      this.pushRecentTarget(file.path);
      new Notice(this.t("blockRefInserted", { title: file.basename }));
    }
  }

  insertLineReferenceIntoEditor(file: TFile, startLine: number, endLine?: number): void {
    const sourcePath = this.getContextMarkdownFile()?.path ?? "";
    const target = sourcePath
      ? this.app.metadataCache.fileToLinktext(file, sourcePath, true)
      : file.basename;
    const text = formatLegacyLineReference(target, startLine, endLine);
    if (this.insertTextIntoContextEditor(text)) {
      this.pushRecentTarget(file.path);
      new Notice(this.t("lineRefInserted", { title: file.basename }));
    }
  }

  async getReferenceTooltip(options: {
    kind: "block" | "line" | "native-block";
    target: string;
    sourcePath: string;
    startLine?: number;
    endLine?: number;
    blockId?: string;
    raw?: string;
  }): Promise<string> {
    const preview = await this.getReferencePreviewData(options);
    return [preview.path, preview.location, preview.snippet].filter(Boolean).join("\n");
  }

  async getReferencePreviewData(options: {
    kind: "block" | "line" | "native-block";
    target: string;
    sourcePath: string;
    startLine?: number;
    endLine?: number;
    blockId?: string;
    raw?: string;
  }): Promise<ReferencePreviewData> {
    const kindLabel = options.kind === "line"
      ? this.t("referenceTypeLine")
      : this.t("referenceTypeBlock");
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
        location: preview
          ? `${this.formatRangeLabel(preview.startLine, preview.endLine)} · ^${preview.blockId}`
          : `^${options.blockId}`,
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

  async showReferencePreview(anchor: HTMLElement, options: {
    kind: "block" | "line" | "native-block";
    target: string;
    sourcePath: string;
    startLine?: number;
    endLine?: number;
    blockId?: string;
    raw?: string;
  }): Promise<void> {
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

  triggerNativeHoverPreview(
    event: MouseEvent,
    targetEl: HTMLElement,
    hoverParent: HoverParent,
    options: {
      kind: "block" | "line" | "native-block";
      target: string;
      sourcePath: string;
      startLine?: number;
      endLine?: number;
      blockId?: string;
    }
  ): boolean {
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

  cancelHideReferencePreview(): void {
    debugLog(this.app, "editor.preview.cancel-hide", {
      token: this.referencePreviewToken
    });
    this.referencePreview.cancelHide();
  }

  scheduleHideReferencePreview(): void {
    this.referencePreviewToken += 1;
    debugLog(this.app, "editor.preview.schedule-hide", {
      token: this.referencePreviewToken
    });
    this.referencePreview.scheduleHide();
  }

  hideReferencePreview(): void {
    this.referencePreviewToken += 1;
    debugLog(this.app, "editor.preview.hide-now", {
      token: this.referencePreviewToken
    });
    this.referencePreview.hide(true);
  }

  private pushRecentTarget(path: string): void {
    this.settings.recentLinkTargets = [path, ...this.settings.recentLinkTargets.filter((item) => item !== path)].slice(
      0,
      this.settings.recentLinkMemorySize
    );
    void this.saveSettings();
  }

  openRelationFlow(): void {
    const currentFile = this.getContextMarkdownFile();
    if (!(currentFile instanceof TFile)) {
      return;
    }

    new RelationKeyModal(this, (relationKey) => {
      new LinkInsertModal(this, "wikilink", async (candidate) => {
        await this.app.fileManager.processFrontMatter(currentFile, (frontmatter) => {
          const existing = Array.isArray(frontmatter[relationKey])
            ? frontmatter[relationKey].map(String)
            : typeof frontmatter[relationKey] === "string"
              ? [frontmatter[relationKey]]
              : [];
          const next = [...new Set([...existing, candidate.file.path])];
          frontmatter[relationKey] = next;
        });
        this.pushRecentTarget(candidate.file.path);
        new Notice(this.t("savedRelation", { relation: this.relationLabel(relationKey) }));
        this.refreshAllViews();
      }).open();
    }).open();
  }

  openTagManager(): void {
    new TagManagerModal(this).open();
  }

  openTagSuggestion(): void {
    const currentFile = this.getContextMarkdownFile();
    if (!(currentFile instanceof TFile)) {
      return;
    }
    new TagSuggestionModal(this, currentFile).open();
  }

  openSemanticSearch(): void {
    new SemanticSearchModal(this).open();
  }

  semanticErrorToMessage(message: string): string {
    if (message === "desktop-only") {
      return this.t("semanticDesktopOnly");
    }
    if (message === "missing-command") {
      return this.t("semanticMissingCommand");
    }
    return this.t("semanticFailed", { message });
  }

  openFile(file: TFile): void {
    this.hideReferencePreview();
    const leaf = this.getNavigationLeaf();
    void leaf.openFile(file).then(() => {
      this.captureMarkdownContext(leaf);
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
    });
  }

  openFileAtLine(file: TFile, startLine: number, endLine?: number): void {
    this.hideReferencePreview();
    const leaf = this.getNavigationLeaf();
    void leaf.openFile(file).then(() => {
      this.captureMarkdownContext(leaf);
      const view = leaf.view;
      if (view instanceof MarkdownView) {
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

  openFileAtBlock(file: TFile, blockId: string): void {
    this.hideReferencePreview();
    const leaf = this.getNavigationLeaf();
    void leaf.openFile(file).then(() => {
      this.captureMarkdownContext(leaf);
      const view = leaf.view;
      if (view instanceof MarkdownView) {
        const cache = this.app.metadataCache.getFileCache(file);
        const resolved = cache ? resolveSubpath(cache, `#^${blockId}`) : null;
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

  openResolvedPath(path: string): void {
    const file = resolveNoteTarget(this.app, path);
    if (file) {
      this.openFile(file);
      return;
    }
    new Notice(path);
  }

  openResolvedLineReference(target: string, sourcePath: string, startLine: number, endLine?: number): void {
    const file = resolveNoteTarget(this.app, target, sourcePath);
    if (file) {
      this.openFileAtLine(file, startLine, endLine);
      return;
    }
    new Notice(target);
  }

  openResolvedBlockReference(target: string, sourcePath: string, blockId: string): void {
    const file = resolveNoteTarget(this.app, target, sourcePath);
    if (file) {
      this.openFileAtBlock(file, blockId);
      return;
    }
    new Notice(target);
  }

  insertLinkFromPath(path: string): void {
    const file = resolveNoteTarget(this.app, path);
    if (!file) {
      return;
    }
    this.insertLinkIntoEditor(file, this.getContextSelection());
  }

  async addSuggestedTags(tags: string[]): Promise<void> {
    const currentFile = this.getContextMarkdownFile();
    if (!(currentFile instanceof TFile)) {
      return;
    }
    await appendTagsToFrontmatter(this.app, currentFile, tags);
    this.refreshAllViews();
  }

  private formatRangeLabel(startLine: number, endLine?: number): string {
    return endLine && endLine > startLine ? `L${startLine}-${endLine}` : `L${startLine}`;
  }

  private describeReferenceLocation(options: {
    kind: "block" | "line" | "native-block";
    startLine?: number;
    endLine?: number;
    blockId?: string;
  }): string | undefined {
    if (options.kind === "native-block" && options.blockId) {
      return `^${options.blockId}`;
    }
    if (typeof options.startLine === "number") {
      return this.formatRangeLabel(options.startLine, options.endLine);
    }
    return undefined;
  }

  private getCompanionDisplayName(id: CompanionPluginId): string {
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

  private async executeCommandByCandidates(candidates: string[]): Promise<boolean> {
    const commands = ((this.app as unknown as {
      commands?: {
        commands?: Record<string, unknown>;
        executeCommandById?: (commandId: string) => boolean | Promise<boolean>;
      };
    }).commands);

    const commandRegistry = commands?.commands;
    const commandIds = commandRegistry ? Object.keys(commandRegistry) : [];
    const resolved = candidates.find((candidate) => commandIds.includes(candidate))
      ?? candidates
        .map((candidate) => commandIds.find((commandId) => commandId.endsWith(`:${candidate}`) || commandId.includes(candidate)))
        .find(Boolean);

    if (!resolved || typeof commands?.executeCommandById !== "function") {
      new Notice(this.t("settingsWorkbenchCommandUnavailable"));
      return false;
    }

    const result = await commands.executeCommandById(resolved);
    if (result === false) {
      new Notice(this.t("settingsWorkbenchCommandUnavailable"));
      return false;
    }
    return true;
  }
}
