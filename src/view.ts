import { ItemView, MarkdownView, TFile, WorkspaceLeaf } from "obsidian";

import type LinkTagIntelligencePlugin from "./main";
import type { RecorderSnapshot } from "./speech-recorder";
import { AIService } from "./ai-service";
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
  | "semanticSearch"
  | "speechRecord";

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
  | "semantic"
  | "ai-transcribe";

type ResearchMetadata = Parameters<LinkTagIntelligencePlugin["formatResearchMetadataChips"]>[0];

interface ToolbarButtonSnapshot {
  key: ToolbarActionId;
  label: string;
  disabled: boolean;
  title?: string;
  state?: string;
  audioLevel?: number;
  dbValue?: number;
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

type SectionSnapshot =
  | CurrentNoteSnapshot
  | FileSectionSnapshot
  | ReferenceSectionSnapshot
  | RelationSectionSnapshot
  | TagSectionSnapshot
  | MentionSectionSnapshot
  | StatusSectionSnapshot;

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
  aiTranscribe?: StatusSectionSnapshot;
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
    | "semanticBridge"
    | "aiSettingsHeading";
  defaultExpanded: boolean;
  emphasized?: boolean;
}

const SECTION_DEFINITIONS: SectionDefinition[] = [
  { id: "current-note", titleKey: "currentNote", defaultExpanded: true, emphasized: true },
  { id: "ai-transcribe", titleKey: "aiSettingsHeading", defaultExpanded: true, emphasized: true },
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
  private vuMeterFrame: number | null = null;
  private dependencyPaths = new Set<string>();
  private toolbarSignature: string | null = null;
  private sectionsContainerEl: HTMLDivElement | null = null;
  private vuMeterEl: HTMLDivElement | null = null;
  private vuMeterBars: HTMLDivElement[] = [];
  private vuMeterDbLabel: HTMLSpanElement | null = null;
  private aiTargetFile: TFile | null = null;
  private aiTemplatesCollapsed = true;
  private aiStatusText = "";
  private aiStatusType: "idle" | "progress" | "success" | "error" = "idle";
  private aiCachedSummary = "";
  private aiCachedSummaryFilePath = "";
  private debounceSelectionTimeout: number | null = null;
  private debounceSummaryTimeout: number | null = null;

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
    this.registerLiveContextListeners();
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
    // 1. Create a dedicated speech control panel at the very top of the sidebar (D-07)
    const speechPanel = this.contentEl.createDiv({ cls: "lti-speech-panel" });
    
    const speechButton = speechPanel.createEl("button", {
      text: this.plugin.t("speechRecord"),
      cls: "lti-toolbar-button lti-speech-record-btn",
      attr: { type: "button" }
    });
    speechButton.dataset.action = "speechRecord";
    speechButton.addEventListener("click", () => {
      void this.plugin.toggleSpeechRecording();
    });
    this.toolbarButtons.set("speechRecord", speechButton);

    const vuMeter = speechPanel.createDiv({ cls: "lti-vu-meter" });
    vuMeter.hidden = true;
    this.vuMeterEl = vuMeter;
    
    // Add premium live indicator dot
    vuMeter.createSpan({ cls: "lti-vu-live-dot" });

    this.vuMeterBars = [];
    for (let i = 0; i < 5; i++) {
      const bar = vuMeter.createDiv({ cls: "lti-vu-bar" });
      bar.dataset.index = String(i);
      this.vuMeterBars.push(bar);
    }
    this.vuMeterDbLabel = vuMeter.createSpan({ cls: "lti-vu-db-label", text: "" });

    // 2. Create the standard action buttons toolbar below the speech panel (3 columns)
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
      aiTranscribe: this.buildAiTranscribeSectionSnapshot(),
      dependencyPaths: [...dependencyPaths]
    };
  }

  private buildToolbarSnapshot(): ToolbarButtonSnapshot[] {
    const hasContext = Boolean(this.plugin.getContextNoteFile());
    const snapshot = this.plugin.getSpeechRecorderSnapshot();
    const buttons = this.getToolbarActions().map(([key]) => {
      const disabled = FILE_REQUIRED_ACTIONS.has(key) && !hasContext;
      return {
        key,
        label: this.plugin.t(key),
        disabled,
        title: disabled ? this.plugin.t("noActiveNote") : undefined
      };
    });
    
    // Explicitly add speechRecord button snapshot so applyToolbarSnapshot updates it
    buttons.push(this.buildSpeechButtonSnapshot("speechRecord", snapshot));
    return buttons;
  }

  private buildSpeechButtonSnapshot(
    key: ToolbarActionId,
    snapshot: RecorderSnapshot
  ): ToolbarButtonSnapshot {
    // Determine tooltip based on phase AND ASR status
    const asrLoading = snapshot.phase === "initializing" ||
      (snapshot.phase === "recording" && !snapshot.asrReady);

    let tooltipKey: string;
    let label = this.plugin.t("speechRecord");

    if (snapshot.phase === "error") {
      tooltipKey = snapshot.errorKey === "speechAsrInitFailed"
        ? "speechAsrError"
        : "speechRecordTooltipError";
    } else if (asrLoading) {
      tooltipKey = "speechAsrLoading";
    } else if (snapshot.phase === "processing") {
      tooltipKey = "speechRecordTooltipProcessing";
    } else if (snapshot.phase === "recording") {
      // D-12: Show countdown when <= 10s remaining
      const remaining = this.plugin.getAutoStopSecondsRemaining();
      if (remaining > 0 && remaining <= 10) {
        label = `${remaining}s`;
        tooltipKey = "speechAsrAutoStopCountdown";
      } else {
        tooltipKey = "speechRecordTooltipRecording";
      }
    } else if (snapshot.asrReady) {
      tooltipKey = "speechAsrReady";
    } else {
      tooltipKey = "speechRecordTooltipIdle";
    }

    return {
      key,
      label,
      disabled: false,
      title: this.plugin.t(tooltipKey as Parameters<typeof this.plugin.t>[0],
        tooltipKey === "speechAsrAutoStopCountdown"
          ? { seconds: this.plugin.getAutoStopSecondsRemaining() }
          : undefined),
      state: snapshot.phase,
      audioLevel: snapshot.phase === "recording" ? snapshot.audioLevel : undefined,
      dbValue: snapshot.phase === "recording" ? snapshot.dbValue : undefined,
    };
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

  private buildAiTranscribeSectionSnapshot(): StatusSectionSnapshot {
    const activeView = this.plugin.getContextMarkdownView();
    const selection = activeView?.editor?.getSelection() ?? "";
    return {
      title: this.plugin.t("aiSettingsHeading"),
      lines: [
        `statusType:${this.aiStatusType}`,
        `statusText:${this.aiStatusText ?? ""}`,
        `targetFile:${this.aiTargetFile?.path ?? ""}`,
        `collapsed:${this.aiTemplatesCollapsed}`,
        `summary:${this.aiCachedSummary ?? ""}`,
        `selection:${selection.substring(0, 100)}`,
        `lastTemplate:${this.plugin.settings.aiLastUsedTemplateId}`
      ]
    };
  }


  private registerLiveContextListeners(): void {
    // Listen to selectionchange event on document (handles cursor/mouse drags in any active note view)
    this.registerDomEvent(document, "selectionchange", () => {
      if (this.debounceSelectionTimeout) {
        window.clearTimeout(this.debounceSelectionTimeout);
      }
      this.debounceSelectionTimeout = window.setTimeout(() => {
        const activeView = this.plugin.getContextMarkdownView();
        if (!activeView) return;
        
        const selectionText = activeView.editor.getSelection() ?? "";
        // Update DOM previews directly for instantaneous zero-lag feedback!
        const selectionEl = this.containerEl.querySelector(".lti-ai-preview-selection");
        if (selectionEl) {
          selectionEl.textContent = selectionText.trim()
            ? `"${selectionText.trim().substring(0, 50)}${selectionText.trim().length > 50 ? "..." : ""}"`
            : `(未选择文字)`;
        }
        
        // Also hot-update the compiled prompt preview live!
        void this.updateLivePromptPreview();
      }, 150);
    });

    // Listen to workspace active editor changes (handles document updates)
    this.registerEvent(this.app.workspace.on("editor-change", (editor, info) => {
      const activeFile = this.plugin.getContextNoteFile();
      if (!activeFile || info.file?.path !== activeFile.path) return;
      
      // Debounce summary extraction and live updates
      if (this.debounceSummaryTimeout) {
        window.clearTimeout(this.debounceSummaryTimeout);
      }
      this.debounceSummaryTimeout = window.setTimeout(async () => {
        const content = await this.app.vault.cachedRead(activeFile);
        let clean = content.replace(/^---[\s\S]*?---/, "");
        clean = clean.replace(/#+\s+/g, "").replace(/\s+/g, " ").trim();
        const preview = clean.substring(0, 60);
        this.aiCachedSummary = preview ? `${preview}${clean.length > 60 ? "..." : ""}` : "(空笔记)";
        
        const summaryEl = this.containerEl.querySelector(".lti-ai-preview-summary");
        if (summaryEl) {
          summaryEl.textContent = this.aiCachedSummary;
        }
        
        // Hot-update compiled prompt preview!
        void this.updateLivePromptPreview();
      }, 500);
    }));
  }

  private async updateLivePromptPreview(): Promise<void> {
    const promptPreviewEl = this.containerEl.querySelector(".lti-ai-compiled-prompt-textarea") as HTMLTextAreaElement;
    if (!promptPreviewEl) return;
    
    const templates = this.plugin.settings.aiTemplates;
    let lastUsed = templates.find(t => t.id === this.plugin.settings.aiLastUsedTemplateId);
    if (!lastUsed) lastUsed = templates[0];
    if (!lastUsed) return;
    
    const compiled = await this.compilePromptPreview(lastUsed);
    promptPreviewEl.value = compiled;
  }

  private async compilePromptPreview(template: any): Promise<string> {
    const activeFile = this.plugin.getContextNoteFile();
    if (!activeFile) return template.prompt;

    const activeView = this.plugin.getContextMarkdownView();
    const selection = activeView?.editor?.getSelection() ?? "";
    
    let wholeFileContent = "";
    try {
      wholeFileContent = await this.app.vault.cachedRead(activeFile);
    } catch {}

    const dateStr = new Date().toLocaleDateString();
    
    // For transcription, if audio is selected, use a premium placeholder: [等待音频转录文本...] 
    // If text-only mode is selected, ASR is skipped, so transcription will be empty.
    const audioPlaceholder = this.aiTargetFile 
      ? `[等待音频 "${this.aiTargetFile.name}" 的转录文本...]`
      : "";

    let prompt = template.prompt;
    prompt = prompt.replace(/\{\{selection\}\}/g, selection.trim() || "(未选择文字)");
    prompt = prompt.replace(/\{\{file:whole\}\}/g, wholeFileContent || "(空笔记)");
    prompt = prompt.replace(/\{\{date\}\}/g, dateStr);
    
    if (prompt.includes("{{transcription}}")) {
      prompt = prompt.replace(/\{\{transcription\}\}/g, audioPlaceholder || "(无音频转录输入)");
    } else if (audioPlaceholder) {
      prompt += "\n\n" + audioPlaceholder;
    }
    
    return prompt;
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
    this.updateSection("ai-transcribe", snapshot.aiTranscribe ?? null);

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
      // Speech button state is handled separately below
      if (item.key === "speechRecord") {
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

    // Speech recording button: apply state CSS classes (D-04, D-06, D-08, D-12)
    const speechButton = this.toolbarButtons.get("speechRecord");
    if (speechButton) {
      const speechItem = toolbar.find((item) => item.key === "speechRecord");
      
      // Sync general button properties
      if (speechItem) {
        speechButton.textContent = speechItem.label;
        speechButton.disabled = speechItem.disabled;
        if (speechItem.title) {
          speechButton.title = speechItem.title;
        } else {
          speechButton.removeAttribute("title");
        }
        speechButton.classList.toggle("lti-toolbar-button-disabled", speechItem.disabled);
      }

      // Remove all state modifier classes
      speechButton.classList.remove(
        "is-idle", "is-initializing", "is-recording", "is-processing", "is-error", "is-countdown-flash"
      );
      if (speechItem?.state) {
        speechButton.classList.add(`is-${speechItem.state}`);
      }

      // Handle countdown flash when active and auto-stop is near (D-12)
      if (speechItem?.state === "recording") {
        const remaining = this.plugin.getAutoStopSecondsRemaining();
        speechButton.classList.toggle("is-countdown-flash", remaining === 1);
      }
      
      // Update VU meter visibility and real-time animation loop
      const isRecording = speechItem?.state === "recording";
      this.updateVuMeter(isRecording ? speechItem : null);
      if (isRecording) {
        this.startVuMeterLoop();
      } else {
        this.stopVuMeterLoop();
      }
    }
  }

  /**
   * Update VU meter display based on recording state audio level.
   * VU meter is hidden unless in recording state (D-07).
   * Bar thresholds from UI-SPEC:
   *   Bar 1: green  when level > -50 dBFS
   *   Bar 2: green  when level > -36 dBFS
   *   Bar 3: green  when level > -24 dBFS
   *   Bar 4: yellow when level > -18 dBFS
   *   Bar 5: red    when level >  -6 dBFS
   */
  private updateVuMeter(snapshot: ToolbarButtonSnapshot | null): void {
    if (!this.vuMeterEl) {
      return;
    }

    const show = snapshot !== null && typeof snapshot.dbValue === "number" && isFinite(snapshot.dbValue);
    this.vuMeterEl.hidden = !show;

    if (!show) {
      return;
    }

    const dbValue = snapshot!.dbValue!;
    const thresholds = [-50, -36, -24, -18, -6];
    const colors = ["is-active-green", "is-active-green", "is-active-green", "is-active-yellow", "is-active-red"];

    for (let i = 0; i < this.vuMeterBars.length; i++) {
      const bar = this.vuMeterBars[i];
      // Remove all color classes
      bar.classList.remove("is-active-green", "is-active-yellow", "is-active-red");
      if (dbValue > thresholds[i]) {
        bar.classList.add(colors[i]);
      }
    }

    if (this.vuMeterDbLabel) {
      this.vuMeterDbLabel.textContent = dbValue === -Infinity ? "-\u221E" : `${Math.round(dbValue)} dB`;
    }
  }

  private startVuMeterLoop(): void {
    if (this.vuMeterFrame !== null) {
      return;
    }
    const loop = () => {
      const snapshot = this.plugin.getSpeechRecorderSnapshot();
      if (snapshot.phase === "recording") {
        const speechItem = {
          key: "speechRecord" as ToolbarActionId,
          label: this.plugin.t("speechRecord"),
          disabled: false,
          state: snapshot.phase,
          audioLevel: snapshot.audioLevel,
          dbValue: snapshot.dbValue
        };
        this.updateVuMeter(speechItem);
        this.vuMeterFrame = window.requestAnimationFrame(loop);
      } else {
        this.vuMeterFrame = null;
        this.updateVuMeter(null);
      }
    };
    this.vuMeterFrame = window.requestAnimationFrame(loop);
  }

  private stopVuMeterLoop(): void {
    if (this.vuMeterFrame !== null) {
      window.cancelAnimationFrame(this.vuMeterFrame);
      this.vuMeterFrame = null;
    }
  }

  private applyContextVisibility(snapshot: SidebarSnapshot): void {
    if (this.sectionsContainerEl) {
      this.sectionsContainerEl.hidden = !snapshot.hasContext;
    }
  }

  private updateSection(id: SidebarSectionId, snapshot: SectionSnapshot | null): void {
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
      case "ai-transcribe":
        this.renderAiTranscribeBody(shell.innerEl);
        break;
    }
  }

  private getSectionMeta(snapshot: SectionSnapshot): { title: string; count?: number } {
    if (this.isCurrentNoteSnapshot(snapshot)) {
      return { title: this.plugin.t("currentNote") };
    }
    if (this.isStatusSectionSnapshot(snapshot)) {
      return { title: snapshot.title };
    }

    return {
      title: snapshot.title,
      count: snapshot.count
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

  private renderAiTranscribeBody(parent: HTMLElement): void {
    parent.empty();
    parent.addClass("lti-ai-transcribe-container");

    const activeFile = this.plugin.getContextNoteFile();
    if (!activeFile) {
      parent.createDiv({ text: this.plugin.t("noActiveNote"), cls: "lti-status-message" });
      return;
    }

    // Scan vault for audio files, excluding dependency and system directories
    const AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "webm", "ogg", "3gp", "flac", "aac"];
    const audioFiles = this.app.vault.getFiles().filter(file => {
      const pathLower = file.path.toLowerCase();
      if (
        pathLower.includes("node_modules/") ||
        pathLower.includes(".git/") ||
        pathLower.includes(".obsidian/") ||
        pathLower.includes("/node_modules/") ||
        pathLower.startsWith("node_modules/")
      ) {
        return false;
      }
      return AUDIO_EXTENSIONS.includes(file.extension.toLowerCase());
    });

    // Sort by modified time so the latest recording is first
    audioFiles.sort((a, b) => b.stat.mtime - a.stat.mtime);

    // Target audio selection row
    const fileRow = parent.createDiv({ cls: "lti-ai-file-row" });
    
    const labelRow = fileRow.createDiv({ cls: "lti-ai-label-row", style: "display: flex; justify-content: space-between; align-items: center;" });
    labelRow.createSpan({ text: this.plugin.t("aiSelectAudioFile") + "：", cls: "lti-ai-label" });
    
    const importBtn = labelRow.createEl("button", {
      cls: "lti-workbench-button is-compact lti-ai-import-btn",
      text: "导入音频...",
      type: "button",
      style: "margin: 0; padding: 2px 8px; font-size: 0.75rem;"
    });

    importBtn.addEventListener("click", () => {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "audio/*";
      fileInput.style.display = "none";
      document.body.appendChild(fileInput);
      
      fileInput.addEventListener("change", async () => {
        const files = fileInput.files;
        if (files && files.length > 0) {
          const file = files[0];
          const arrayBuffer = await file.arrayBuffer();
          
          // Generate a safe path in vault
          const activeFile = this.plugin.getContextNoteFile();
          const parentFolder = activeFile && activeFile.parent ? activeFile.parent.path : "";
          const targetPath = parentFolder 
            ? `${parentFolder}/${file.name}`
            : file.name;
          
          try {
            // Write binary to vault
            const newFile = await this.app.vault.createBinary(targetPath, arrayBuffer);
            this.aiTargetFile = newFile;
            new Notice(`已成功导入并选中音频：${file.name}`);
            void this.refresh();
          } catch (err: any) {
            new Notice(`导入失败: ${err.message || err}`);
          }
        }
        document.body.removeChild(fileInput);
      });
      
      fileInput.click();
    });

    const dropdownWrapper = fileRow.createDiv({ cls: "lti-custom-dropdown-wrapper" });
    
    const triggerBtn = dropdownWrapper.createEl("button", {
      cls: "lti-custom-dropdown-trigger lti-workbench-select",
      type: "button"
    });
    
    let triggerLabel = audioFiles.length === 0 ? "-- 仅使用文本 (无音频文件) --" : "-- 仅使用文本 (不选音频) --";
    if (this.aiTargetFile) {
      const folder = this.aiTargetFile.parent ? this.aiTargetFile.parent.path : "";
      if (folder && folder !== "/") {
        const displayFolder = folder.length > 25 
          ? "..." + folder.substring(folder.length - 22) 
          : folder;
        triggerLabel = `${this.aiTargetFile.name} (${displayFolder})`;
      } else {
        triggerLabel = this.aiTargetFile.name;
      }
    }
    
    dropdownWrapper.createSpan({ text: triggerLabel, cls: "lti-custom-dropdown-text" });
    triggerBtn.appendChild(dropdownWrapper.querySelector(".lti-custom-dropdown-text")!);
    triggerBtn.createSpan({ cls: "lti-custom-dropdown-chevron" });

    const optionsList = dropdownWrapper.createDiv({ cls: "lti-custom-dropdown-menu" });
    optionsList.hidden = true;

    // Always provide text-only option
    const optTextOnly = optionsList.createEl("button", {
      cls: `lti-custom-dropdown-item${!this.aiTargetFile ? " is-active" : ""}`,
      text: audioFiles.length === 0 ? "-- 仅使用文本 (无音频文件) --" : "-- 仅使用文本 (不选音频) --",
      type: "button"
    });
    optTextOnly.addEventListener("click", (e) => {
      e.stopPropagation();
      this.aiTargetFile = null;
      optionsList.hidden = true;
      void this.refresh();
    });

    audioFiles.forEach(file => {
      const folder = file.parent ? file.parent.path : "";
      let displayText = file.name;
      if (folder && folder !== "/") {
        const displayFolder = folder.length > 25 
          ? "..." + folder.substring(folder.length - 22) 
          : folder;
        displayText = `${file.name} (${displayFolder})`;
      }

      const opt = optionsList.createEl("button", {
        cls: `lti-custom-dropdown-item${this.aiTargetFile?.path === file.path ? " is-active" : ""}`,
        text: displayText,
        type: "button"
      });
      
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        this.aiTargetFile = file;
        optionsList.hidden = true;
        void this.refresh();
      });
    });

    const clickOutsideHandler = (event: MouseEvent) => {
      if (!dropdownWrapper.contains(event.target as Node)) {
        optionsList.hidden = true;
        document.removeEventListener("click", clickOutsideHandler);
      }
    };

    triggerBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isVisible = !optionsList.hidden;
      if (isVisible) {
        optionsList.hidden = true;
        document.removeEventListener("click", clickOutsideHandler);
      } else {
        optionsList.hidden = false;
        document.addEventListener("click", clickOutsideHandler);
      }
    });

    // Get templates
    const templates = this.plugin.settings.aiTemplates;
    if (templates.length === 0) {
      parent.createDiv({ text: "请在设置中配置至少一个转录模板。", cls: "lti-status-message is-error" });
      return;
    }

    // Find last used template
    let lastUsed = templates.find(t => t.id === this.plugin.settings.aiLastUsedTemplateId);
    if (!lastUsed) {
      lastUsed = templates[0];
    }

    // Quick run button row
    const btnRow = parent.createDiv({ cls: "lti-ai-btn-row" });
    const runBtn = btnRow.createEl("button", {
      cls: `lti-workbench-button is-primary lti-ai-run-btn${this.aiStatusType === "progress" ? " is-loading" : ""}`,
      type: "button"
    });
    runBtn.createSpan({ cls: "lti-ai-run-icon", text: "▶" });
    runBtn.createSpan({ text: ` 运行：${lastUsed.name}` });
    
    if (this.aiStatusType === "progress") {
      runBtn.disabled = true;
    }

    runBtn.addEventListener("click", () => {
      if (lastUsed) void this.triggerAiTranscription(lastUsed);
    });

    // Selected text & Note summary card preview (premium grid container)
    const previewGrid = parent.createDiv({ cls: "lti-ai-preview-grid" });

    // 1. Selected text preview card
    const selCard = previewGrid.createDiv({ cls: "lti-ai-preview-card" });
    selCard.createDiv({ text: this.plugin.t("aiSelectedTextPreview"), cls: "lti-ai-preview-title" });
    
    const activeView = this.plugin.getContextMarkdownView();
    const selectionText = activeView?.editor?.getSelection() ?? "";
    const selectionContent = selectionText.trim() 
      ? `"${selectionText.trim().substring(0, 50)}${selectionText.trim().length > 50 ? "..." : ""}"`
      : `(${this.plugin.t("notSelected")})`;
    selCard.createDiv({ text: selectionContent, cls: "lti-ai-preview-content lti-ai-preview-selection" });

    // 2. Note summary preview card
    const sumCard = previewGrid.createDiv({ cls: "lti-ai-preview-card" });
    sumCard.createDiv({ text: this.plugin.t("aiNoteSummaryPreview"), cls: "lti-ai-preview-title" });

    // Fetch and cache summary asynchronously if different
    if (activeFile.path !== this.aiCachedSummaryFilePath) {
      this.aiCachedSummaryFilePath = activeFile.path;
      this.aiCachedSummary = "加载中...";
      
      const cache = this.app.metadataCache.getFileCache(activeFile);
      if (cache?.frontmatter?.summary) {
        const sumVal = String(cache.frontmatter.summary);
        this.aiCachedSummary = sumVal.substring(0, 60) + (sumVal.length > 60 ? "..." : "");
      } else {
        void this.app.vault.cachedRead(activeFile).then(content => {
          let clean = content.replace(/^---[\s\S]*?---/, "");
          clean = clean.replace(/#+\s+/g, "").replace(/\s+/g, " ").trim();
          const preview = clean.substring(0, 60);
          this.aiCachedSummary = preview ? `${preview}${clean.length > 60 ? "..." : ""}` : "(空笔记)";
          void this.refresh(); // Triggers re-render
        });
      }
    }
    sumCard.createDiv({ text: this.aiCachedSummary, cls: "lti-ai-preview-content lti-ai-preview-summary" });

    // 3. Compiled Prompt Preview Box
    const promptPreviewRow = parent.createDiv({ cls: "lti-ai-prompt-preview-row" });
    promptPreviewRow.createDiv({ text: "📖 提示词预览 (包含选中与正文) ：", cls: "lti-ai-label" });

    const promptArea = promptPreviewRow.createEl("textarea", {
      cls: "lti-ai-compiled-prompt-textarea lti-workbench-textarea",
      attr: { readonly: "readonly", rows: "4" }
    });

    void this.compilePromptPreview(lastUsed).then(compiled => {
      promptArea.value = compiled;
    });

    // Collapsible other templates accordion
    const accordion = parent.createDiv({ cls: "lti-ai-accordion" });
    const accordionHeader = accordion.createDiv({ 
      cls: `lti-ai-accordion-header${this.aiTemplatesCollapsed ? " is-collapsed" : ""}` 
    });
    accordionHeader.createSpan({ 
      text: this.aiTemplatesCollapsed ? "▶ 选择其他模板..." : "▼ 选择其他模板...", 
      cls: "lti-ai-accordion-title" 
    });

    accordionHeader.addEventListener("click", () => {
      this.aiTemplatesCollapsed = !this.aiTemplatesCollapsed;
      void this.refresh();
    });

    if (!this.aiTemplatesCollapsed) {
      const accordionBody = accordion.createDiv({ cls: "lti-ai-accordion-body" });
      const grid = accordionBody.createDiv({ cls: "lti-ai-templates-grid" });
      
      templates.forEach(tpl => {
        const tplBtn = grid.createEl("button", {
          cls: `lti-ai-grid-template-btn${tpl.id === lastUsed!.id ? " is-active" : ""}`,
          text: tpl.name,
          type: "button"
        });
        if (this.aiStatusType === "progress") {
          tplBtn.disabled = true;
        }
        tplBtn.addEventListener("click", async () => {
          this.plugin.settings.aiLastUsedTemplateId = tpl.id;
          await this.plugin.saveSettings();
          void this.refresh();
        });
      });
    }

    // Status Area
    if (this.aiStatusText) {
      const statusClass = `lti-ai-status is-${this.aiStatusType}`;
      const statusDiv = parent.createDiv({ cls: statusClass });
      if (this.aiStatusType === "progress") {
        statusDiv.createSpan({ cls: "lti-ai-spinner" });
      }
      statusDiv.createSpan({ text: ` ${this.aiStatusText}` });
    }
  }

  private async triggerAiTranscription(template: AITemplate): Promise<void> {
    const activeFile = this.plugin.getContextNoteFile();
    if (!activeFile) {
      this.aiStatusType = "error";
      this.aiStatusText = "未打开有效笔记。";
      void this.refresh();
      return;
    }

    const activeView = this.plugin.getContextMarkdownView();
    if (!activeView) {
      this.aiStatusType = "error";
      this.aiStatusText = "请打开 Markdown 编辑器。";
      void this.refresh();
      return;
    }

    this.aiStatusType = "progress";
    this.aiStatusText = this.aiTargetFile ? this.plugin.t("aiStatusDecoding") : this.plugin.t("aiStatusRefining");
    void this.refresh();

    try {
      const selection = activeView.editor.getSelection();
      const wholeFileContent = await this.app.vault.read(activeFile);
      const service = new AIService(this.app, this.plugin.settings);
      
      const resultText = await service.processTranscription(
        this.aiTargetFile,
        template,
        selection,
        wholeFileContent,
        (statusKey, detail) => {
          this.aiStatusText = this.plugin.t(statusKey as any) + (detail ? ` (${detail})` : "");
          void this.refresh();
        }
      );

      // Special handling for Canvas Card template: copy to clipboard & auto-inject into active Canvas
      let insertText = resultText;
      const isCanvasCard = template.id === "canvas-card" || (resultText.trim().startsWith("{") && resultText.includes('"nodes"'));
      
      if (isCanvasCard) {
        insertText = "```json\n" + resultText.trim() + "\n```";
        try {
          // 1. Write to clipboard
          await navigator.clipboard.writeText(resultText.trim());
          new Notice("✨ Canvas 卡片已生成并自动复制到剪贴板！可直接在 Canvas 中按下 Ctrl+V 粘贴。");
          
          // 2. Direct injection into active Canvas if open
          const canvasLeaves = this.app.workspace.getLeavesOfType("canvas");
          if (canvasLeaves.length > 0) {
            let injected = false;
            for (const leaf of canvasLeaves) {
              const canvasView = leaf.view as any;
              if (canvasView && canvasView.canvas) {
                try {
                  const data = JSON.parse(resultText);
                  canvasView.canvas.importData(data);
                  canvasView.canvas.requestFrame();
                  canvasView.canvas.requestSave();
                  injected = true;
                } catch (e) {
                  console.error("Direct canvas injection failed:", e);
                }
              }
            }
            if (injected) {
              new Notice("🎉 已直接追加插入到您当前打开的 Canvas 白板中！");
            }
          }
        } catch (clipErr) {
          console.error("Clipboard / Canvas automation failed:", clipErr);
        }
      }

      // Insert at cursor or replace selection
      if (selection) {
        activeView.editor.replaceSelection(insertText);
      } else {
        const cursor = activeView.editor.getCursor();
        activeView.editor.replaceRange(insertText, cursor);
      }

      this.aiStatusType = "success";
      this.aiStatusText = this.plugin.t("aiStatusSuccess");
    } catch (err: any) {
      console.error("[lti-ai-transcribe]", err);
      this.aiStatusType = "error";
      this.aiStatusText = `${this.plugin.t("aiStatusError")}${err.message}`;
    } finally {
      void this.refresh();
    }
  }

  onClose(): void {
    if (this.refreshFrame !== null) {
      window.cancelAnimationFrame(this.refreshFrame);
      this.refreshFrame = null;
    }

    if (this.vuMeterFrame !== null) {
      window.cancelAnimationFrame(this.vuMeterFrame);
      this.vuMeterFrame = null;
    }

    this.pendingRefresh = null;
    this.refreshPromise = null;
    this.vuMeterEl = null;
    this.vuMeterBars = [];
    this.vuMeterDbLabel = null;
    this.contentEl.empty();
  }
}
