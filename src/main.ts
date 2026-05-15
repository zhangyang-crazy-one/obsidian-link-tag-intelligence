import { App, FileView, MarkdownView, Notice, Plugin, resolveSubpath, TFile, type HoverParent, WorkspaceLeaf } from "obsidian";

// Internal Obsidian app interface for accessing plugins (not part of public API)
type InternalApp = App & { plugins?: { plugins?: Record<string, { ea?: unknown }> } };

import { buildReferenceEditorExtension } from "./editor-extension";
import { debugLog, resetDebugLog } from "./debug-log";
import { runIngestionCommand, type ResearchIngestionRequest } from "./ingestion";
import { LINK_TAG_INTELLIGENCE_ICON_ID } from "./icons";
import { relationKeyLabel, tr, resolveLanguage, type UILanguage } from "./i18n";
import { LinkInsertModal, ReferenceInsertModal, RelationKeyModal, ResearchIngestionModal, SemanticSearchModal, TagManagerModal, TagSuggestionModal } from "./modals";
import {
  appendTextToMarkdownSection,
  isExcalidrawFile,
  isSupportedNoteFile,
  isSupportedNotePath,
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
import type { ViewRefreshRequest } from "./view-refresh";
import { SpeechRecorder, type RecorderSnapshot } from "./speech-recorder";
import { downloadModelFiles, getModelFileList, getModelRepo, isArchiveDownload } from "./speech-model";

const SENTENCE_END_PUNCTUATION = /[。！？\.!\?]$/;

export class SentenceManager {
  private partialText = "";
  private plugin: LinkTagIntelligencePlugin;

  constructor(plugin: LinkTagIntelligencePlugin) {
    this.plugin = plugin;
  }

  /** Called on every Worker result — accumulates partial text. */
  addPartialText(text: string): void {
    this.partialText += text;
  }

  /** Called when isEndpoint=true or recording stops — flushes accumulated text. */
  finalizeSentence(text?: string): string {
    const sentence = text ?? this.partialText;
    this.partialText = "";
    const trimmed = sentence.trim();
    if (!trimmed) return "";
    // Don't auto-append punctuation — let the ASR output be raw.
    // Users can type punctuation themselves.
    return trimmed;
  }

  /** Get current accumulated partial text (for debugging). */
  getPartialText(): string {
    return this.partialText;
  }

  /** Reset on recording stop. */
  reset(): void {
    this.partialText = "";
  }
}

export default class LinkTagIntelligencePlugin extends Plugin {
  settings: LinkTagIntelligenceSettings = DEFAULT_SETTINGS;
  private lastEditorLeaf: WorkspaceLeaf | null = null;
  private lastEditorFilePath: string | null = null;
  private lastSupportedFilePath: string | null = null;
  private lastExcalidrawFilePath: string | null = null;
  private readonly referencePreview = new ReferencePreviewPopover();
  private referencePreviewToken = 0;
  speechRecorder: SpeechRecorder = new SpeechRecorder();
  private _sentenceManager: SentenceManager | null = null;
  autoStopTimer: ReturnType<typeof setInterval> | null = null;
  autoStopSecondsRemaining = 0;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.speechRecorder.setApp(this.app);
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

    this.addRibbonIcon(LINK_TAG_INTELLIGENCE_ICON_ID, this.t("openPanel"), () => {
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
        const activeFile = this.getContextNoteFile();
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
        const activeFile = this.getContextNoteFile();
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
      id: "ingest-research-source",
      name: this.t("ingestionCapture"),
      callback: () => this.openResearchIngestion()
    });

    this.addCommand({
      id: "semantic-search-external",
      name: this.t("semanticSearch"),
      callback: () => this.openSemanticSearch()
    });

    this.addCommand({
      id: "toggle-speech-recording",
      name: this.t("speechToggleCommand"),
      hotkeys: [{ modifiers: ["Ctrl", "Shift"], key: "V" }],
      checkCallback: (checking) => {
        const editorView = this.app.workspace.activeEditor;
        if (!editorView?.editor) {
          return false;
        }
        if (!checking) {
          void this.toggleSpeechRecording();
        }
        return true;
      }
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
        isExcalidraw: file instanceof TFile ? isExcalidrawFile(file) : false,
        lastSupportedFilePath: this.lastSupportedFilePath,
        lastExcalidrawFilePath: this.lastExcalidrawFilePath,
      });
      if (file instanceof TFile && isSupportedNoteFile(file)) {
        this.captureSupportedFileContext(file);
        this.lastSupportedFilePath = file.path;
        if (isExcalidrawFile(file)) {
          this.lastExcalidrawFilePath = file.path;
        }
      }
      this.refreshAllViews({
        reason: "context",
        force: true,
        changedPaths: file instanceof TFile ? [file.path] : undefined
      });
    }));
    this.registerEvent(this.app.metadataCache.on("changed", (file) => {
      const currentFile = this.getContextNoteFile();
      if (!(file instanceof TFile) || !(currentFile instanceof TFile) || file.path !== currentFile.path) {
        return;
      }

      this.refreshAllViews({
        reason: "metadata",
        changedPaths: [file.path]
      });
    }));
    this.registerEvent(this.app.workspace.on("active-leaf-change", (leaf) => {
      const viewType = leaf?.view?.getViewType() ?? null;
      const viewFile = leaf?.view instanceof FileView ? leaf.view.file?.path ?? null : null;
      debugLog(this.app, "active-leaf-change:before-timeout", {
        viewType,
        viewFile,
        lastSupportedFilePath: this.lastSupportedFilePath,
        lastExcalidrawFilePath: this.lastExcalidrawFilePath,
      });
      setTimeout(() => {
        const view = leaf?.view;
        let leafFile: TFile | null = null;
        let isExcalidrawViewReady = false;

        if (view instanceof FileView) {
          leafFile = view.file;
          const isExcalidraw = view.getViewType() === "excalidraw";

          if (isExcalidraw) {
            if (leafFile instanceof TFile) {
              this.lastExcalidrawFilePath = leafFile.path;
              isExcalidrawViewReady = true;
            } else if (this.lastExcalidrawFilePath) {
              const lastFile = this.app.vault.getAbstractFileByPath(this.lastExcalidrawFilePath);
              if (lastFile instanceof TFile && isSupportedNoteFile(lastFile)) {
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
          lastExcalidrawFilePath: this.lastExcalidrawFilePath,
        });

        const fileChanged = this.captureSupportedFileContext(leafFile);
        const editorChanged = this.captureEditorContext(leaf);
        if (editorChanged || fileChanged || isExcalidrawViewReady) {
          this.refreshAllViews({
            reason: "context",
            force: true,
            changedPaths: leafFile instanceof TFile ? [leafFile.path] : undefined
          });
        }
      }, 0);
    }));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      if (!(file instanceof TFile)) {
        return;
      }

      this.refreshAllViews({
        reason: "metadata",
        changedPaths: [file.path, oldPath].filter((path): path is string => typeof path === "string" && path.length > 0)
      });
    }));
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
    this.speechRecorder.destroy();
    this.referencePreview.destroy();
    this.cancelAutoStopTimer();
    this.speechRecorder.destroy();
  }

  async loadSettings(): Promise<void> {
    this.settings = normalizeLoadedSettings(await this.loadData(), this.app.vault.configDir);
  }

  async saveSettings(): Promise<void> {
    const memory = Math.max(1, this.settings.recentLinkMemorySize);
    this.settings.recentLinkTargets = this.settings.recentLinkTargets.slice(0, memory);

    // Sync ASR settings to SpeechRecorder
    this.speechRecorder.setSettingsLanguage(this.settings.speechLanguage);
    this.speechRecorder.setSettingsVadSensitivity(this.settings.speechVadSensitivity);
    this.speechRecorder.setHotwordsFile(this.settings.speechHotwordsFile);
    await this.saveData(this.settings);
    return;

    // Propagation handled above — this block is unreachable
    // D-10: Language change only propagated when NOT currently recording
    if (!this.speechRecorder.isActive) {
      this.speechRecorder.setSettingsLanguage(this.settings.speechLanguage);
    }
    // VAD sensitivity can always be updated (no impact on current stream)
    this.speechRecorder.setSettingsVadSensitivity(this.settings.speechVadSensitivity);
  }

  getResearchWorkbenchState(): Promise<ResearchWorkbenchState> {
    return readResearchWorkbenchState(
      this.app,
      buildResearchWorkbenchProfile(this.settings, this.currentLanguage())
    );
  }

  async applyResearchPreset(): Promise<void> {
    const state = await this.getResearchWorkbenchState();
    for (const companionId of ["pdf-plus", "smart-connections"] as const) {
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

  importZoteroNotes(): Promise<boolean> {
    return this.executeCommandByCandidates([
      "obsidian-zotero-desktop-connector:zdc-import-notes",
      "zdc-import-notes"
    ]);
  }

  openSmartConnectionsView(): Promise<boolean> {
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

  private getActiveSupportedFile(): TFile | null {
    const activeFile = this.app.workspace.getActiveFile();
    return isSupportedNoteFile(activeFile) ? activeFile : null;
  }

  private getActiveEditorLeaf(): WorkspaceLeaf | null {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!(activeView?.file instanceof TFile) || !isSupportedNoteFile(activeView.file)) {
      return null;
    }

    return activeView.leaf;
  }

  private captureSupportedFileContext(file: TFile | null): boolean {
    if (!isSupportedNoteFile(file)) {
      return false;
    }

    const changed = this.lastSupportedFilePath !== file.path;
    this.lastSupportedFilePath = file.path;
    return changed;
  }

  private captureEditorContext(leaf: WorkspaceLeaf | null): boolean {
    const view = leaf?.view;
    if (!(view instanceof MarkdownView) || !(view.file instanceof TFile) || !isSupportedNoteFile(view.file)) {
      return false;
    }

    const editorChanged = this.lastEditorLeaf !== leaf || this.lastEditorFilePath !== view.file.path;
    this.lastEditorLeaf = leaf;
    this.lastEditorFilePath = view.file.path;
    const fileChanged = this.captureSupportedFileContext(view.file);
    return editorChanged || fileChanged;
  }

  getContextEditorView(): MarkdownView | null {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (activeView?.file instanceof TFile && isSupportedNoteFile(activeView.file)) {
      this.captureEditorContext(activeView.leaf);
      return activeView;
    }

    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile && !isSupportedNotePath(activeFile.path)) {
      return null;
    }

    const rememberedView = this.lastEditorLeaf?.view;
    if (rememberedView instanceof MarkdownView && rememberedView.file instanceof TFile && isSupportedNoteFile(rememberedView.file)) {
      this.lastEditorFilePath = rememberedView.file.path;
      return rememberedView;
    }

    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView) || !(view.file instanceof TFile) || !isSupportedNoteFile(view.file)) {
        continue;
      }
      if (!this.lastEditorFilePath || view.file.path === this.lastEditorFilePath) {
        this.captureEditorContext(leaf);
        return view;
      }
    }

    return null;
  }

  getContextMarkdownView(): MarkdownView | null {
    return this.getContextEditorView();
  }

  getContextNoteFile(): TFile | null {
    const activeFile = this.app.workspace.getActiveFile();
    const activeView = this.app.workspace.getActiveViewOfType(FileView);
    const leafViewFile = activeView?.file ?? null;

    debugLog(this.app, "getContextNoteFile", {
      getActiveFile_result: activeFile?.path ?? null,
      leafViewFile: leafViewFile?.path ?? null,
      isSupported_activeFile: isSupportedNoteFile(activeFile),
      isExcalidraw_leafViewFile: leafViewFile instanceof TFile ? isExcalidrawFile(leafViewFile) : false,
      lastSupportedFilePath: this.lastSupportedFilePath,
      lastExcalidrawFilePath: this.lastExcalidrawFilePath,
    });

    if (activeFile instanceof TFile) {
      if (isSupportedNoteFile(activeFile)) {
        this.captureSupportedFileContext(activeFile);
        return activeFile;
      }
    }

    // Fallback: try to get file from active view (handles ExcalidrawView)
    if (activeView) {
      const leafFile = activeView.file;
      if (leafFile instanceof TFile && isSupportedNoteFile(leafFile)) {
        this.captureSupportedFileContext(leafFile);
        // Track excalidraw file path separately
        if (isExcalidrawFile(leafFile)) {
          this.lastExcalidrawFilePath = leafFile.path;
        }
        return leafFile;
      }

      // If ExcalidrawView but file not yet loaded, use lastExcalidrawFilePath as fallback
      if (!leafFile && activeView.getViewType() === "excalidraw" && this.lastExcalidrawFilePath) {
        const lastFile = this.app.vault.getAbstractFileByPath(this.lastExcalidrawFilePath);
        if (lastFile instanceof TFile && isSupportedNoteFile(lastFile)) {
          return lastFile;
        }
      }
    }

    const view = this.getContextEditorView();
    if (view?.file instanceof TFile && isSupportedNoteFile(view.file)) {
      return view.file;
    }

    if (!this.lastSupportedFilePath) {
      return null;
    }

    const file = this.app.vault.getAbstractFileByPath(this.lastSupportedFilePath);
    return (file instanceof TFile && isSupportedNoteFile(file)) ? file : null;
  }

  getContextMarkdownFile(): TFile | null {
    return this.getContextNoteFile();
  }

  getContextSelection(): string {
    return this.getContextEditorView()?.editor?.getSelection() ?? "";
  }

  private getNavigationLeaf(): WorkspaceLeaf {
    const mostRecentLeaf = this.app.workspace.getMostRecentLeaf();
    const activeFile = this.getActiveSupportedFile();
    if (mostRecentLeaf && activeFile) {
      this.captureSupportedFileContext(activeFile);
      if (mostRecentLeaf.view instanceof MarkdownView) {
        this.captureEditorContext(mostRecentLeaf);
        return mostRecentLeaf;
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

  async openIntelligencePanel(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(LINK_TAG_INTELLIGENCE_VIEW)[0];
    const leaf = existing ?? this.app.workspace.getRightLeaf(false);
    if (!leaf) {
      return;
    }
    await leaf.setViewState({ type: LINK_TAG_INTELLIGENCE_VIEW, active: true });
    await this.app.workspace.revealLeaf(leaf);
    this.refreshAllViews({ reason: "context", force: true });
  }

  refreshAllViews(request: ViewRefreshRequest = { reason: "mutation" }): void {
    const leaves = this.app.workspace.getLeavesOfType(LINK_TAG_INTELLIGENCE_VIEW);
    debugLog(this.app, "refreshAllViews", { leafCount: leaves.length, reason: request.reason, changedPaths: request.changedPaths ?? [] });
    for (const leaf of leaves) {
      const view = leaf.view;
      debugLog(this.app, "refreshAllViews:viewCheck", {
        viewType: view?.constructor.name,
        isLTIView: view instanceof LinkTagIntelligenceView
      });
      if (view instanceof LinkTagIntelligenceView) {
        view.requestRefresh(request);
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

  private async insertTextIntoFile(text: string): Promise<boolean> {
    const editor = this.getContextEditorView()?.editor;
    if (editor) {
      editor.replaceSelection(text);
      this.refreshAllViews();
      return true;
    }
    const file = this.getContextNoteFile();
    if (!file) {
      new Notice(this.t("noActiveNote"));
      return false;
    }
    await this.app.vault.process(file, (content) =>
      appendTextToMarkdownSection(content, text, isExcalidrawFile(file))
    );
    new Notice(this.t("appendedToFile", { title: file.basename }));
    this.refreshAllViews();
    return true;
  }

  async insertLinkIntoEditor(file: TFile, alias = ""): Promise<void> {
    const normalizedAlias = alias.trim();
    const linkText = normalizedAlias
      ? `[[${file.basename}|${normalizedAlias}]]`
      : `[[${file.basename}]]`;

    const targetFile = this.getContextNoteFile();

    debugLog(this.app, "insertLinkIntoEditor", {
      targetFile: targetFile?.path ?? null,
      isExcalidrawTarget: targetFile ? isExcalidrawFile(targetFile) : false,
    });

    // 如果当前文件是 Excalidraw 文件，使用 Excalidraw API
    if (targetFile && isExcalidrawFile(targetFile)) {
      const plugins = (this.app as InternalApp).plugins?.plugins;
      const excalidrawPlugin = plugins?.["obsidian-excalidraw-plugin"];
      debugLog(this.app, "insertLinkIntoEditor:excalidraw", {
        hasPlugins: !!plugins,
        hasExcalidrawPlugin: !!excalidrawPlugin,
        hasEa: !!excalidrawPlugin?.ea,
      });
      if (excalidrawPlugin?.ea) {
        // Find the ExcalidrawView that has the target file open
        const excalidrawLeaves = this.app.workspace.getLeavesOfType("excalidraw");
        const targetView = excalidrawLeaves.find((leaf) => {
          const view = leaf.view as { file?: { path?: string } };
          return view.file?.path === targetFile.path;
        });
        debugLog(this.app, "insertLinkIntoEditor:excalidraw:view", {
          excalidrawLeafCount: excalidrawLeaves.length,
          foundTargetView: !!targetView,
        });

        const ea = excalidrawPlugin.ea as {
          setView: (view: unknown, show?: boolean) => boolean;
          clear: () => void;
          addEmbeddable: (topX: number, topY: number, width: number, height: number, url?: string, file?: TFile, embeddableCustomData?: unknown) => string;
          addElementsToView: (commitToHistory?: boolean, select?: boolean) => Promise<void>;
        };

        // If we found the target view, set it as the target (don't show, don't steal focus)
        if (targetView) {
          ea.setView(targetView.view, false);
        }

        // Clear workbench to avoid artifacts
        ea.clear();
        // 添加嵌入元素（在画布中心位置添加一个小元素作为链接）
        // addEmbeddable(topX, topY, width, height, url, file, embeddableCustomData)
        ea.addEmbeddable(100, 100, 200, 50, undefined, file, undefined);
        // addElementsToView(commitToHistory, select)
        await ea.addElementsToView(true, true);
        this.pushRecentTarget(file.path);
        new Notice(this.t("insertedLink", { title: file.basename }));
        this.refreshAllViews();
        return;
      }
    }

    // 否则使用原有的文本追加方式
    if (await this.insertTextIntoFile(linkText)) {
      this.pushRecentTarget(file.path);
      new Notice(this.t("insertedLink", { title: file.basename }));
    }
  }

  async insertBlockReferenceIntoEditor(file: TFile, startLine: number, endLine?: number): Promise<void> {
    const sourcePath = this.getContextNoteFile()?.path ?? "";
    const target = sourcePath
      ? this.app.metadataCache.fileToLinktext(file, sourcePath, true)
      : file.basename;
    const text = formatLegacyBlockReference(target, startLine, endLine);
    if (await this.insertTextIntoFile(text)) {
      this.pushRecentTarget(file.path);
      new Notice(this.t("blockRefInserted", { title: file.basename }));
    }
  }

  async insertLineReferenceIntoEditor(file: TFile, startLine: number, endLine?: number): Promise<void> {
    const sourcePath = this.getContextNoteFile()?.path ?? "";
    const target = sourcePath
      ? this.app.metadataCache.fileToLinktext(file, sourcePath, true)
      : file.basename;
    const text = formatLegacyLineReference(target, startLine, endLine);
    if (await this.insertTextIntoFile(text)) {
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
    const currentFile = this.getContextNoteFile();
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
    const currentFile = this.getContextNoteFile();
    if (!(currentFile instanceof TFile)) {
      return;
    }
    new TagSuggestionModal(this, currentFile).open();
  }

  openResearchIngestion(): void {
    new ResearchIngestionModal(this).open();
  }

  openSemanticSearch(): void {
    new SemanticSearchModal(this).open();
  }

  /**
   * Ensure model files exist for the current language.
   * Called before starting recording. Returns true if ready, false if download needed.
   */
  private getFs(): { existsSync(path: string): boolean; mkdirSync(path: string, opts?: { recursive?: boolean }): void; writeFileSync(path: string, data: Uint8Array): void } | null {
    try {
      const r = (globalThis as Record<string, unknown>).require as ((m: string) => Record<string, unknown>) | undefined;
      return r?.("fs") as { existsSync: (p: string) => boolean; mkdirSync: (p: string, o?: { recursive?: boolean }) => void; writeFileSync: (p: string, d: Uint8Array) => void } | null;
    } catch { return null; }
  }

  private async ensureSpeechModel(): Promise<boolean> {
    const fs = this.getFs();
    const modelDir = this.speechRecorder.getModelDirInternal();
    const lang = this.settings.speechLanguage;
    const fileList = getModelFileList(lang);

    if (!fs) {
      new Notice(this.t("speechModelNotFound"));
      return false;
    }

    let allExist = true;
    let anyExist = false;
    for (const fn of fileList) {
      if (fs.existsSync(modelDir + fn)) {
        anyExist = true;
      } else {
        allExist = false;
      }
    }

    if (allExist) return true;

    if (!anyExist) {
      new Notice(
        this.t("speechModelFirstRunTitle") + "\n\n" +
        this.t("speechModelFirstRunGuide", {
          modelDir,
          zhSize: "~167 MB",
          enSize: "~70 MB",
        }),
        12000
      );
    }

    return this.downloadSpeechModel();
  }

  private async downloadZhArchive(modelDir: string): Promise<boolean> {
    const url = getModelRepo("zh");
    const archiveName = "sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20.tar.bz2";
    const archivePath = modelDir + archiveName;

    const notice = new Notice(this.t("speechModelDownloadStart", { lang: "中文" }), 0);

    try {
      // Use curl via child_process to respect system proxy settings.
      // Node.js https.get() bypasses socks/http proxy; curl handles it natively.
      const cp = require("child_process") as { execSync: (c: string, o?: { maxBuffer?: number }) => Buffer };
      notice.setMessage("Downloading bilingual zh-en model (~80MB)...");
      cp.execSync(
        `curl -L -o "${archivePath}" "${url}" --progress-bar 2>&1`,
        { maxBuffer: 1024 * 1024 }
      );

      // Extract with tar (strip top-level directory)
      notice.setMessage("Extracting model files...");
      const cp = require("child_process") as { execSync: (c: string, o?: { cwd?: string; maxBuffer?: number }) => Buffer };
      cp.execSync(`tar -xjf "${archiveName}" --strip-components=1`, { cwd: modelDir, maxBuffer: 1024 * 1024 });

      // Delete FP32 files (keep only INT8 — saves ~330MB)
      const fs2 = require("fs") as typeof import("fs");
      const { join } = require("path") as { join: (...p: string[]) => string };
      const keepInt8 = [
        "encoder-epoch-99-avg-1.int8.onnx",
        "decoder-epoch-99-avg-1.int8.onnx",
        "joiner-epoch-99-avg-1.int8.onnx",
        "tokens.txt",
        "bpe.model",
      ];
      for (const f of fs2.readdirSync(modelDir)) {
        const p = join(modelDir, f);
        const st = fs2.statSync(p);
        if (st.isFile() && !keepInt8.includes(f)) {
          fs2.unlinkSync(p);
        }
      }

      // Clean up archive file
      try { fs2.unlinkSync(archivePath); } catch { /* ok */ }
      notice.hide();
      new Notice("中文语音模型就绪 (~80 MB)。现在可以开始录音。");
      return true;
    } catch (e) {
      notice.hide();
      new Notice("模型下载失败: " + String(e), 8000);
      return false;
    }
  }

  private async downloadSpeechModel(): Promise<boolean> {
    const fs = this.getFs();
    const lang = this.settings.speechLanguage;
    const modelDir = this.speechRecorder.getModelDirInternal();

    if (!fs) {
      new Notice(this.t("speechModelNotFound"));
      return false;
    }

    fs.mkdirSync(modelDir, { recursive: true });

    // Chinese model: single tar.bz2 from GitHub Releases
    if (isArchiveDownload(lang)) {
      return this.downloadZhArchive(modelDir);
    }

    // English model: individual files from HuggingFace (fallback)

    // D-15: Show progress Notice
    const progressNotice = new Notice(
      this.t("speechModelDownloadStart", { lang: lang === "zh" ? "中文" : "English" }),
      0
    );

    const results = await downloadModelFiles(
      lang,
      async (filename, data) => {
        const path = modelDir + filename;
        fs.writeFileSync(path, new Uint8Array(data));
      },
      (progress) => {
        const pct = Math.round(progress.fileProgress.percent * 100);
        const loadedMB = (progress.fileProgress.loadedBytes / (1024 * 1024)).toFixed(1);
        const totalMB = (progress.fileProgress.totalBytes / (1024 * 1024)).toFixed(1);
        progressNotice.setMessage(
          this.t("speechModelDownloadProgress", {
            filename: progress.currentFile,
            percent: pct,
            current: progress.fileIndex + 1,
            total: progress.totalFiles,
            loadedMB,
            totalMB,
          })
        );
      }
    );

    const failed = results.filter((r) => !r.success);
    progressNotice.hide();

    if (failed.length === 0) {
      new Notice(this.t("speechModelDownloadComplete", { lang: lang === "zh" ? "中文" : "English" }));
      return true;
    }

    this.showManualDownloadGuide(lang, failed.map((r) => r.filename));
    return false;
  }

  /**
   * Show manual download guide after automatic download fails (D-17).
   */
  private showManualDownloadGuide(lang: "zh" | "en", failedFiles: string[]): void {
    const repo = getModelRepo(lang);
    const modelDir = this.speechRecorder.getModelDirInternal();
    const baseUrl = `https://huggingface.co/${repo}/resolve/main/`;

    const message = this.t("speechModelManualDownloadTitle") + "\n\n" +
      this.t("speechModelManualDownloadSteps", {
        modelDir,
        baseUrl,
        files: failedFiles.join(", "),
      });
    new Notice(message, 15000);  // 15 second duration for reading
  }

  async runResearchIngestion(request: ResearchIngestionRequest): Promise<Awaited<ReturnType<typeof runIngestionCommand>>> {
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

    new Notice(
      result.warnings.length > 0
        ? this.t("ingestionCreatedWithWarnings", { title: result.title, count: result.warnings.length })
        : this.t("ingestionCreated", { title: result.title })
    );

    return result;
  }

  private async waitForVaultMarkdownFile(path: string, timeoutMs = 3000): Promise<TFile | null> {
    const startedAt = Date.now();
    while (Date.now() - startedAt <= timeoutMs) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) {
        return file;
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, 150));
    }
    return null;
  }

  ingestionErrorToMessage(message: string): string {
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
      this.captureSupportedFileContext(file);
      this.captureEditorContext(leaf);
      this.app.workspace.setActiveLeaf(leaf, { focus: true });
    });
  }

  openFileAtLine(file: TFile, startLine: number, endLine?: number): void {
    this.hideReferencePreview();
    const leaf = this.getNavigationLeaf();
    void leaf.openFile(file).then(() => {
      this.captureSupportedFileContext(file);
      this.captureEditorContext(leaf);
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
      this.captureSupportedFileContext(file);
      this.captureEditorContext(leaf);
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

  async insertLinkFromPath(path: string): Promise<void> {
    const file = resolveNoteTarget(this.app, path);
    if (!file) {
      return;
    }
    await this.insertLinkIntoEditor(file, this.getContextSelection());
  }

  async addSuggestedTags(tags: string[]): Promise<void> {
    const currentFile = this.getContextNoteFile();
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

  // ─── Speech methods ───────────────────────────────────────────────────

  getSpeechRecorderSnapshot(): RecorderSnapshot {
    return this.speechRecorder.getSnapshot();
  }

  async toggleSpeechRecording(): Promise<void> {
    const recorder = this.speechRecorder;

    if (!recorder.canToggle()) {
      if (recorder.getSnapshot().phase === "error") {
        recorder.acknowledgeError();
        this.refreshAllViews();
      }
      return;
    }

    // Create SentenceManager on first use
    if (!this._sentenceManager) {
      this._sentenceManager = new SentenceManager(this);
    }

    // Set ASR result handler
    recorder.onAsrResult = (text, isEndpoint) => {
      if (isEndpoint) {
        // D-06: Sentence boundary — finalize and insert at cursor (D-07)
        const finalSentence = this._sentenceManager!.finalizeSentence(text);
        if (finalSentence) {
          this.insertSpeechText(finalSentence);
        }
      } else {
        // Partial result — accumulate only (no insertion per deferred decision)
        this._sentenceManager!.addPartialText(text);
      }
    };

    // If starting recording (currently idle), ensure model files exist
    if (recorder.getSnapshot().phase === "idle") {
      const modelReady = await this.ensureSpeechModel();
      if (!modelReady) {
        // Model files missing — abort toggle (ensureSpeechModel shows Notice)
        return;
      }
    }

    const errorKey = await recorder.toggle((key, vars) => this.t(key as Parameters<typeof this.t>[0], vars));

    if (errorKey) {
      new Notice(this.t(errorKey as Parameters<typeof this.t>[0]));
      this._sentenceManager?.reset();
      this.refreshAllViews();
      return;
    }

    // D-12: Start auto-stop timer when recording with autoStopSec configured
    if (recorder.getSnapshot().phase === "recording" && this.settings.speechAutoStopSec > 0) {
      this.startAutoStopTimer();
    }

    // On stop: flush any remaining partial text
    if (!recorder.isActive && this._sentenceManager) {
      const remaining = this._sentenceManager.getPartialText();
      if (remaining.trim()) {
        const final = this._sentenceManager.finalizeSentence();
        if (final) this.insertSpeechText(final);
      }
      this._sentenceManager.reset();
      this.cancelAutoStopTimer();
    }

    this.refreshAllViews();
  }

  private insertSpeechText(text: string): void {
    if (!text) return;

    const editorView = this.getContextEditorView();
    if (!editorView?.editor) {
      debugLog(this.app, "speech.insert-no-editor", { text });
      return;
    }

    const editor = editorView.editor;

    // D-08: Save cursor position before insert (for concurrent typing protection)
    const cursor = editor.getCursor();

    // D-07: Insert sentence at current cursor with trailing space
    editor.replaceSelection(text + " ");

    // D-08: Cursor is already positioned after inserted text by replaceSelection
    debugLog(this.app, "speech.text-inserted", {
      textLen: text.length,
      cursorLine: cursor.line,
      cursorCh: cursor.ch,
    });
  }

  // ─── Auto-stop timer ─────────────────────────────────────────────────

  private startAutoStopTimer(): void {
    this.cancelAutoStopTimer();
    this.autoStopSecondsRemaining = this.settings.speechAutoStopSec;

    // D-12: Countdown visible when <= 10 seconds remain, last second flashes
    this.autoStopTimer = setInterval(() => {
      this.autoStopSecondsRemaining--;

      if (this.autoStopSecondsRemaining <= 0) {
        this.speechRecorder.forceStop();
        this.cancelAutoStopTimer();
        this.refreshAllViews();
        new Notice(this.t("speechAutoStopTimeoutReached" as Parameters<typeof this.t>[0]));
        return;
      }

      // Refresh view to update countdown display
      this.refreshAllViews();
    }, 1000);
  }

  private cancelAutoStopTimer(): void {
    if (this.autoStopTimer) {
      clearInterval(this.autoStopTimer);
      this.autoStopTimer = null;
    }
    this.autoStopSecondsRemaining = 0;
  }

  getAutoStopSecondsRemaining(): number {
    return this.autoStopSecondsRemaining;
  }
}
