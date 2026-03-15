import { App, PluginSettingTab } from "obsidian";

import {
  type CompanionPluginId,
  type CompanionPluginStatus,
  normalizeDelimitedList,
  type ResearchWorkbenchState
} from "./companion-plugins";
import type { LanguageSetting, UILanguage } from "./i18n";
import type LinkTagIntelligencePlugin from "./main";

export type WorkflowMode = "general" | "researcher";

export const LEGACY_RELATION_KEYS = ["related", "see_also", "parent", "child", "same_as"];
export const RESEARCH_RELATION_KEYS = [
  "supports",
  "contradicts",
  "extends",
  "uses_method",
  "uses_dataset",
  "same_question",
  "evidence_for",
  "counterargument_to",
  "reviews",
  "inspired_by"
];

const RESEARCH_LITERATURE_PATH = "Knowledge/Research/Literature";
const RESEARCH_TEMPLATE_PATH = "Knowledge/Research/Templates/zotero-literature-note.md";
const RESEARCH_ATTACHMENTS_PATH = "Knowledge/Research/Attachments";
const STATIC_SMART_CONNECTIONS_EXCLUSIONS = [
  ".smart-env",
  "Archive/Imports",
  "Excalidraw",
  "note_reader"
];
const SMART_CONNECTIONS_HEADINGS = [
  "目录",
  "Contents",
  "参考文献",
  "References",
  "Acknowledgements"
];
const DEFAULT_SMART_RESULTS_LIMIT = 20;

function normalizeConfigDir(configDir: string): string {
  return configDir
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/\/$/, "")
    .trim();
}

function buildSmartConnectionsExclusions(configDir: string): string[] {
  const normalizedConfigDir = normalizeConfigDir(configDir);
  return normalizedConfigDir
    ? [normalizedConfigDir, ...STATIC_SMART_CONNECTIONS_EXCLUSIONS]
    : [...STATIC_SMART_CONNECTIONS_EXCLUSIONS];
}

export const DEFAULT_TAG_FACET_MAP_TEXT = JSON.stringify(
  {
    topic: {
      "research-question": ["研究问题", "research question", "rq"],
      "literature-review": ["文献综述", "literature review"],
      "research-gap": ["研究空白", "research gap"],
      "knowledge-synthesis": ["知识综合", "synthesis"]
    },
    method: {
      experiment: ["实验", "experimental"],
      qualitative: ["定性研究", "qualitative"],
      quantitative: ["定量研究", "quantitative"],
      "case-study": ["案例研究", "case study"],
      "mixed-methods": ["混合方法", "mixed methods"]
    },
    dataset: {
      survey: ["问卷", "survey"],
      corpus: ["语料", "corpus"],
      interview: ["访谈", "interview"],
      "field-notes": ["田野笔记", "field notes"]
    },
    theory: {
      framework: ["理论框架", "framework"],
      model: ["模型", "model"],
      proposition: ["命题", "proposition"]
    },
    status: {
      "to-read": ["待读", "to read"],
      annotated: ["已批注", "annotated"],
      cited: ["已引用", "cited"]
    },
    writing_stage: {
      outline: ["提纲", "outline"],
      draft: ["草稿", "draft"],
      revision: ["修订", "revision"],
      final: ["定稿", "final"]
    },
    source_kind: {
      "literature-note": ["文献笔记", "literature note", "paper note"],
      "source-note": ["来源笔记", "source note"],
      "reading-note": ["阅读笔记", "reading note"],
      "draft-note": ["写作草稿", "draft note"]
    }
  },
  null,
  2
);

export interface LinkTagIntelligenceSettings {
  language: LanguageSetting;
  workflowMode: WorkflowMode;
  relationKeys: string[];
  tagAliasMapText: string;
  tagFacetMapText: string;
  semanticBridgeEnabled: boolean;
  semanticCommand: string;
  semanticTimeoutMs: number;
  recentLinkMemorySize: number;
  recentLinkTargets: string[];
  researchLiteratureFolder: string;
  researchTemplatePath: string;
  researchAttachmentsFolder: string;
  researchOpenNoteAfterImport: boolean;
  smartConnectionsFolderExclusions: string;
  smartConnectionsHeadingExclusions: string;
  smartConnectionsResultsLimit: number;
}

export function buildDefaultSettings(configDir = ""): LinkTagIntelligenceSettings {
  return {
    language: "system",
    workflowMode: "researcher",
    relationKeys: [...RESEARCH_RELATION_KEYS],
    tagAliasMapText: JSON.stringify(
      {
        "文献笔记": ["literature-note", "paper-note", "source-note"],
        "研究问题": ["research-question", "rq"],
        "大语言模型": ["llm", "large-language-model"],
        "手冲咖啡": ["pour-over", "coffee-brewing"],
        "文献综述": ["literature-review", "lit review"],
        "研究空白": ["research gap"],
        "方法论": ["methodology", "framework"]
      },
      null,
      2
    ),
    tagFacetMapText: DEFAULT_TAG_FACET_MAP_TEXT,
    semanticBridgeEnabled: false,
    semanticCommand: "",
    semanticTimeoutMs: 30000,
    recentLinkMemorySize: 24,
    recentLinkTargets: [],
    researchLiteratureFolder: RESEARCH_LITERATURE_PATH,
    researchTemplatePath: RESEARCH_TEMPLATE_PATH,
    researchAttachmentsFolder: RESEARCH_ATTACHMENTS_PATH,
    researchOpenNoteAfterImport: true,
    smartConnectionsFolderExclusions: buildSmartConnectionsExclusions(configDir).join(", "),
    smartConnectionsHeadingExclusions: SMART_CONNECTIONS_HEADINGS.join(", "),
    smartConnectionsResultsLimit: DEFAULT_SMART_RESULTS_LIMIT
  };
}

export const DEFAULT_SETTINGS: LinkTagIntelligenceSettings = buildDefaultSettings();

const COMPANION_META = {
  "obsidian-zotero-desktop-connector": {
    name: "Zotero Integration",
    descriptionKey: "settingsCompanionZoteroDesc" as const
  },
  "pdf-plus": {
    name: "PDF++",
    descriptionKey: "settingsCompanionPdfDesc" as const
  },
  "smart-connections": {
    name: "Smart Connections",
    descriptionKey: "settingsCompanionSmartDesc" as const
  },
  "semantic-bridge": {
    name: "Semantic bridge",
    descriptionKey: "settingsCompanionSemanticDesc" as const
  }
} satisfies Record<CompanionPluginId, { name: string; descriptionKey: Parameters<LinkTagIntelligencePlugin["t"]>[0] }>;

interface WorkbenchGuideCopy {
  localeLabel: string;
  overviewTitle: string;
  overviewDescription: string;
  lead: string;
  bridgeLabel: string;
  bridgeValue: string;
  stackTitle: string;
  stackItems: string[];
  flowTitle: string;
  flowItems: string[];
  troubleshootTitle: string;
  troubleshootBody: string;
  workflowTitle: string;
  workflowDescription: string;
}

const WORKBENCH_GUIDE: Record<UILanguage, WorkbenchGuideCopy> = {
  zh: {
    localeLabel: "中文",
    overviewTitle: "研究工作台总览",
    overviewDescription: "首页同时给出中英文研究栈说明，便于核对 Zotero 桌面桥接、证据提取和语义召回的职责边界。",
    lead: "这个首页是研究型 Obsidian 库的操作总览。Link & Tag Intelligence 负责连接来源、证据、论点、关系键和中英文受控标签，不替代 Zotero 桌面端、Better BibTeX、PDF 阅读器或外部语义检索。",
    bridgeLabel: "Zotero 桌面桥接前置条件",
    bridgeValue: "保持 Zotero 桌面端正在运行，并在 Zotero 中安装并启用 Better BibTeX for Zotero，保证 citekey 稳定且 Obsidian 导入链路可连接。",
    stackTitle: "推荐研究栈",
    stackItems: [
      "Zotero 桌面端 + Better BibTeX：保持 Zotero 正在运行，并在 Zotero 中安装 Better BibTeX，保证 citekey 稳定、Obsidian 导入链路可连接。",
      "Zotero Integration：把文献条目、元数据和批注导入到库内文献笔记。",
      "PDF++：把带页码的原文证据复制到文献笔记或写作草稿里。",
      "Link & Tag Intelligence：连接来源、证据、论点、关系键和中英文受控标签。",
      "Smart Connections / 外部语义桥接：在写作或综述时补充召回，但不替代精确引用。"
    ],
    flowTitle: "建议工作流",
    flowItems: [
      "先启动 Zotero 桌面端，并确认 Better BibTeX 已安装且能正常生成 citekey。",
      "在 Obsidian 中运行 Zotero 导入，把文献笔记写入研究目录。",
      "打开 PDF，用 PDF++ 复制带页码的证据片段。",
      "回到本插件侧栏，补关系键、引用定位和中英文标签。",
      "写作或综述时，再打开 Smart Connections 或外部语义检索补充召回。"
    ],
    troubleshootTitle: "常见报错排查",
    troubleshootBody: "出现“Cannot connect to Zotero”这类报错时，通常不是 Obsidian 页面布局问题，而是桌面桥接前置条件未满足：先确认 Zotero 正在运行，再确认 Zotero 中已经安装并启用了 Better BibTeX。两项都满足后，再回到工作流里执行导入。",
    workflowTitle: "工作流执行顺序",
    workflowDescription: "先满足 Zotero 桌面桥接前置条件，再执行导入、摘录证据、补关系与标签，最后才进入语义召回。"
  },
  en: {
    localeLabel: "English",
    overviewTitle: "Research Workbench Overview",
    overviewDescription: "The home page now explains the stack in both Chinese and English so the Zotero desktop bridge, evidence capture, and semantic recall roles stay explicit.",
    lead: "This home page is the operating overview for a research-oriented Obsidian vault. Link & Tag Intelligence connects sources, evidence, claims, typed relations, and bilingual controlled tags. It does not replace Zotero desktop, Better BibTeX, a PDF reader, or your external semantic retrieval stack.",
    bridgeLabel: "Zotero desktop bridge prerequisite",
    bridgeValue: "Keep Zotero desktop running and install Better BibTeX for Zotero inside Zotero so citekeys stay stable and the Obsidian import bridge can connect.",
    stackTitle: "Recommended research stack",
    stackItems: [
      "Zotero desktop + Better BibTeX: keep Zotero running and install Better BibTeX inside Zotero so citekeys stay stable and the Obsidian import bridge can connect.",
      "Zotero Integration: import literature items, metadata, and annotations into vault literature notes.",
      "PDF++: copy page-aware evidence into literature notes and draft notes.",
      "Link & Tag Intelligence: connect sources, evidence, claims, typed relations, and bilingual controlled tags.",
      "Smart Connections / external semantic bridge: add broader recall while drafting or synthesizing, without replacing exact references."
    ],
    flowTitle: "Suggested flow",
    flowItems: [
      "Start Zotero desktop first and confirm that Better BibTeX is installed and generating stable citekeys.",
      "Run Zotero import inside Obsidian so literature notes land in the research folder.",
      "Open the source PDF and use PDF++ to copy page-aware evidence.",
      "Return to this plugin to add typed relations, reference context, and bilingual tags.",
      "Only then use Smart Connections or the external semantic bridge for broader recall while drafting."
    ],
    troubleshootTitle: "Troubleshooting",
    troubleshootBody: "When you see errors such as “Cannot connect to Zotero”, this is usually not a layout issue inside Obsidian. It normally means the desktop bridge prerequisites are missing: first make sure Zotero is running, then make sure Better BibTeX is installed and enabled in Zotero. After both are in place, retry the import step.",
    workflowTitle: "Workflow execution order",
    workflowDescription: "Satisfy the Zotero desktop bridge prerequisites first, then import, capture evidence, add relations and tags, and only after that rely on semantic recall."
  }
};

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizeJsonText(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeDelimitedSetting(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function normalizeLoadedSettings(data: unknown, configDir = ""): LinkTagIntelligenceSettings {
  const defaults = buildDefaultSettings(configDir);
  const raw = data && typeof data === "object" ? (data as Partial<LinkTagIntelligenceSettings>) : {};
  const normalized = {
    ...defaults,
    ...raw
  };

  if (Array.isArray(raw.relationKeys) && arraysEqual(raw.relationKeys.map(String), LEGACY_RELATION_KEYS)) {
    normalized.relationKeys = [...RESEARCH_RELATION_KEYS];
  }

  if (!Array.isArray(normalized.relationKeys) || normalized.relationKeys.length === 0) {
    normalized.relationKeys = [...RESEARCH_RELATION_KEYS];
  } else {
    normalized.relationKeys = normalized.relationKeys.map(String).map((item) => item.trim()).filter(Boolean);
  }

  normalized.workflowMode = normalized.workflowMode === "general" ? "general" : "researcher";
  normalized.tagAliasMapText = normalizeJsonText(normalized.tagAliasMapText, defaults.tagAliasMapText);
  normalized.tagFacetMapText = normalizeJsonText(normalized.tagFacetMapText, DEFAULT_TAG_FACET_MAP_TEXT);
  normalized.semanticCommand = typeof normalized.semanticCommand === "string" ? normalized.semanticCommand : "";
  normalized.semanticTimeoutMs = Number.isFinite(normalized.semanticTimeoutMs) && normalized.semanticTimeoutMs > 0
    ? normalized.semanticTimeoutMs
    : defaults.semanticTimeoutMs;
  normalized.recentLinkMemorySize = Number.isFinite(normalized.recentLinkMemorySize) && normalized.recentLinkMemorySize > 0
    ? normalized.recentLinkMemorySize
    : defaults.recentLinkMemorySize;
  normalized.recentLinkTargets = Array.isArray(normalized.recentLinkTargets)
    ? normalized.recentLinkTargets.map(String).filter(Boolean)
    : [];
  normalized.researchLiteratureFolder = normalizeDelimitedSetting(normalized.researchLiteratureFolder, RESEARCH_LITERATURE_PATH);
  normalized.researchTemplatePath = normalizeDelimitedSetting(normalized.researchTemplatePath, RESEARCH_TEMPLATE_PATH);
  normalized.researchAttachmentsFolder = normalizeDelimitedSetting(normalized.researchAttachmentsFolder, RESEARCH_ATTACHMENTS_PATH);
  normalized.researchOpenNoteAfterImport = typeof normalized.researchOpenNoteAfterImport === "boolean"
    ? normalized.researchOpenNoteAfterImport
    : defaults.researchOpenNoteAfterImport;
  normalized.smartConnectionsFolderExclusions = normalizeDelimitedSetting(
    normalized.smartConnectionsFolderExclusions,
    defaults.smartConnectionsFolderExclusions
  );
  normalized.smartConnectionsHeadingExclusions = normalizeDelimitedSetting(
    normalized.smartConnectionsHeadingExclusions,
    defaults.smartConnectionsHeadingExclusions
  );
  normalized.smartConnectionsResultsLimit = Number.isFinite(normalized.smartConnectionsResultsLimit) && normalized.smartConnectionsResultsLimit > 0
    ? normalized.smartConnectionsResultsLimit
    : defaults.smartConnectionsResultsLimit;

  return normalized;
}

type WorkbenchPage = "overview" | "workflow" | "plugins" | "taxonomy";

export class LinkTagIntelligenceSettingTab extends PluginSettingTab {
  plugin: LinkTagIntelligencePlugin;
  private renderToken = 0;
  private activePage: WorkbenchPage = "overview";
  private activeCompanionId: CompanionPluginId | null = null;

  constructor(app: App, plugin: LinkTagIntelligencePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("lti-settings-root");

    const shell = containerEl.createDiv({ cls: "lti-workbench" });
    shell.createDiv({
      text: this.plugin.t("loading"),
      cls: "lti-workbench-loading"
    });

    const token = ++this.renderToken;
    void this.renderWorkbench(shell, token);
  }

  private async renderWorkbench(containerEl: HTMLElement, token: number): Promise<void> {
    const state = await this.plugin.getResearchWorkbenchState();
    if (token !== this.renderToken) {
      return;
    }

    containerEl.empty();
    const nav = containerEl.createDiv({ cls: "lti-workbench-page-nav" });
    this.createPageTab(nav, "overview", this.plugin.t("settingsWorkbenchPageOverview"));
    this.createPageTab(nav, "workflow", this.plugin.t("settingsWorkbenchPageWorkflow"));
    this.createPageTab(nav, "plugins", this.plugin.t("settingsWorkbenchPagePlugins"));
    this.createPageTab(nav, "taxonomy", this.plugin.t("settingsWorkbenchPageTaxonomy"));

    const page = containerEl.createDiv({ cls: "lti-workbench-page" });
    switch (this.activePage) {
      case "overview":
        this.renderOverviewPage(page, state);
        break;
      case "workflow":
        this.renderWorkflowPage(page, state);
        break;
      case "plugins":
        this.renderPluginsPage(page, state);
        break;
      case "taxonomy":
        this.renderTaxonomyPage(page);
        break;
    }
  }

  private openPage(page: WorkbenchPage, companionId: CompanionPluginId | null = null): void {
    this.activePage = page;
    if (companionId) {
      this.activeCompanionId = companionId;
    } else if (page !== "plugins") {
      this.activeCompanionId = null;
    }
    this.display();
  }

  private createPageTab(containerEl: HTMLElement, page: WorkbenchPage, label: string): void {
    const button = containerEl.createEl("button", {
      cls: `lti-workbench-page-tab${this.activePage === page ? " is-active" : ""}`,
      text: label,
      type: "button"
    });
    button.addEventListener("click", () => {
      if (this.activePage !== page) {
        this.openPage(page);
      }
    });
  }

  private renderOverviewPage(containerEl: HTMLElement, state: ResearchWorkbenchState): void {
    this.renderHero(containerEl, state);
    this.renderOverviewGuideSection(containerEl);
    this.renderModuleSection(containerEl);
    this.renderCompanionSummarySection(containerEl, state);
  }

  private renderWorkflowPage(containerEl: HTMLElement, state: ResearchWorkbenchState): void {
    this.renderWorkflowGuideSection(containerEl);
    this.renderActionsSection(containerEl);

    const grid = containerEl.createDiv({ cls: "lti-workbench-settings-grid" });

    const preferences = this.createSectionCard(
      grid,
      this.plugin.t("settingsWorkbenchPreferencesTitle"),
      this.plugin.t("settingsWorkbenchPreferencesDescription")
    );
    preferences.addClass("is-form");
    this.renderPreferencesDrawer(preferences);

    const paths = this.createSectionCard(
      grid,
      this.plugin.t("settingsWorkbenchPathsTitle"),
      this.plugin.t("settingsWorkbenchPathsDescription")
    );
    paths.addClass("is-form");
    this.renderPathsDrawer(paths);

    const smart = this.createSectionCard(
      grid,
      this.plugin.t("settingsWorkbenchRecallTitle"),
      this.plugin.t("settingsWorkbenchRecallDescription")
    );
    smart.addClass("is-form");
    this.renderSmartDrawer(smart);

    const semantic = this.createSectionCard(
      grid,
      this.plugin.t("settingsWorkbenchSemanticTitle"),
      this.plugin.t("settingsWorkbenchSemanticDescription")
    );
    semantic.addClass("is-form");
    this.renderSemanticDrawer(semantic, state);
  }

  private renderPluginsPage(containerEl: HTMLElement, state: ResearchWorkbenchState): void {
    const section = this.createSectionCard(
      containerEl,
      this.plugin.t("settingsWorkbenchCompanionTitle"),
      this.plugin.t("settingsWorkbenchCompanionDescription")
    );
    const list = section.createDiv({ cls: "lti-workbench-plugin-list" });
    for (const companion of state.companions) {
      this.renderCompanionPanel(list, companion, state);
    }
  }

  private renderTaxonomyPage(containerEl: HTMLElement): void {
    const section = this.createSectionCard(
      containerEl,
      this.plugin.t("settingsWorkbenchAdvancedTitle"),
      this.plugin.t("settingsWorkbenchAdvancedDescription")
    );
    section.addClass("is-form");
    this.renderTaxonomyDrawer(section);
  }

  private renderHero(containerEl: HTMLElement, state: ResearchWorkbenchState): void {
    const readyCompanions = state.companions.filter((item) => item.ready && !item.optional).length;
    const requiredCompanions = state.companions.filter((item) => !item.optional).length;

    const hero = containerEl.createDiv({ cls: "lti-workbench-hero" });
    const top = hero.createDiv({ cls: "lti-workbench-hero-top" });
    const copy = top.createDiv({ cls: "lti-workbench-hero-copy" });
    copy.createDiv({
      text: this.plugin.t("settingsWorkbenchEyebrow"),
      cls: "lti-workbench-eyebrow"
    });
    copy.createDiv({
      text: this.plugin.t("settingsWorkbenchTitle"),
      cls: "lti-workbench-title"
    });
    copy.createDiv({
      text: this.plugin.t("settingsWorkbenchDescription"),
      cls: "setting-item-description lti-workbench-description"
    });

    const side = top.createDiv({ cls: "lti-workbench-hero-side" });
    const buttons = side.createDiv({ cls: "lti-workbench-hero-action-grid" });
    this.createAsyncButton(buttons, this.plugin.t("settingsWorkbenchApplyAll"), async () => {
      await this.plugin.applyResearchPreset();
    });
    this.createActionButton(buttons, this.plugin.t("settingsWorkbenchRefresh"), () => this.display());
    this.createActionButton(buttons, this.plugin.t("settingsWorkbenchPageWorkflow"), () => this.openPage("workflow"));

    const prefs = side.createDiv({ cls: "lti-workbench-hero-meta-grid" });
    this.renderMetaCard(
      prefs,
      this.plugin.t("settingsLanguage"),
      this.formatLanguageLabel(this.plugin.settings.language)
    );
    this.renderMetaCard(
      prefs,
      this.plugin.t("settingsWorkflowMode"),
      this.plugin.t(this.plugin.settings.workflowMode === "researcher" ? "workflowModeResearcher" : "workflowModeGeneral")
    );

    const stats = hero.createDiv({ cls: "lti-workbench-stat-strip" });
    this.renderStat(stats, this.plugin.t("settingsWorkbenchStatReady"), `${readyCompanions}/${requiredCompanions}`);
    this.renderStat(
      stats,
      this.plugin.t("settingsWorkbenchStatMode"),
      this.plugin.t(this.plugin.settings.workflowMode === "researcher" ? "workflowModeResearcher" : "workflowModeGeneral")
    );
    this.renderStat(stats, this.plugin.t("settingsWorkbenchStatIndexer"), String(state.enabledPluginIds.length));
    this.renderStat(
      stats,
      this.plugin.t("settingsWorkbenchStatSemantic"),
      state.profile.semanticEnabled ? this.plugin.t("settingsWorkbenchOn") : this.plugin.t("settingsWorkbenchOff")
    );
  }

  private currentWorkbenchGuide(): WorkbenchGuideCopy {
    return WORKBENCH_GUIDE[this.plugin.currentLanguage()];
  }

  private renderOverviewGuideSection(containerEl: HTMLElement): void {
    const guide = this.currentWorkbenchGuide();
    const section = this.createSectionCard(containerEl, guide.overviewTitle, guide.overviewDescription);
    const grid = section.createDiv({ cls: "lti-workbench-intro-grid" });
    this.renderGuideLocaleCard(grid, "zh");
    this.renderGuideLocaleCard(grid, "en");
  }

  private renderWorkflowGuideSection(containerEl: HTMLElement): void {
    const guide = this.currentWorkbenchGuide();
    const section = this.createSectionCard(containerEl, guide.workflowTitle, guide.workflowDescription);
    section.createDiv({
      text: guide.lead,
      cls: "setting-item-description lti-workbench-intro-lead"
    });
    this.renderGuideNoteBlock(section, guide.bridgeLabel, guide.bridgeValue);
    this.renderGuideListBlock(section, guide.stackTitle, guide.stackItems);
    this.renderGuideListBlock(section, guide.flowTitle, guide.flowItems, true);
    this.renderGuideNoteBlock(section, guide.troubleshootTitle, guide.troubleshootBody);
  }

  private renderGuideLocaleCard(containerEl: HTMLElement, language: UILanguage): void {
    const guide = WORKBENCH_GUIDE[language];
    const card = containerEl.createDiv({ cls: "lti-workbench-intro-card" });
    card.createDiv({ text: guide.localeLabel, cls: "lti-workbench-intro-locale" });
    card.createDiv({
      text: guide.lead,
      cls: "setting-item-description lti-workbench-intro-lead"
    });
    this.renderGuideNoteBlock(card, guide.bridgeLabel, guide.bridgeValue);
    this.renderGuideListBlock(card, guide.stackTitle, guide.stackItems);
    this.renderGuideListBlock(card, guide.flowTitle, guide.flowItems, true);
    this.renderGuideNoteBlock(card, guide.troubleshootTitle, guide.troubleshootBody);
  }

  private renderGuideListBlock(containerEl: HTMLElement, title: string, items: string[], ordered = false): void {
    const block = containerEl.createDiv({ cls: "lti-workbench-intro-block" });
    block.createDiv({ text: title, cls: "lti-workbench-intro-block-title" });
    const list = block.createEl(ordered ? "ol" : "ul", { cls: "lti-workbench-intro-list" });
    for (const item of items) {
      list.createEl("li", { text: item });
    }
  }

  private renderGuideNoteBlock(containerEl: HTMLElement, title: string, body: string): void {
    const note = containerEl.createDiv({ cls: "lti-workbench-intro-note" });
    note.createDiv({ text: title, cls: "lti-workbench-intro-block-title" });
    note.createDiv({
      text: body,
      cls: "setting-item-description lti-workbench-intro-note-copy"
    });
  }

  private renderActionsSection(containerEl: HTMLElement): void {
    const section = this.createSectionCard(
      containerEl,
      this.plugin.t("settingsWorkbenchQuickActionsTitle"),
      this.plugin.t("settingsWorkbenchQuickActionsDescription")
    );
    section.addClass("is-featured");

    const groups = section.createDiv({ cls: "lti-workbench-action-group-grid" });
    this.renderActionGroup(
      groups,
      this.plugin.t("settingsWorkbenchActionGroupCaptureTitle"),
      this.plugin.t("settingsWorkbenchActionGroupCaptureDescription"),
      [
        {
          title: this.plugin.t("settingsWorkbenchActionZoteroTitle"),
          description: this.plugin.t("settingsWorkbenchActionZoteroDescription"),
          onClick: () => {
            void this.plugin.importZoteroNotes();
          }
        },
        {
          title: this.plugin.t("settingsWorkbenchActionPdfTitle"),
          description: this.plugin.t("settingsWorkbenchActionPdfDescription"),
          onClick: () => {
            void this.plugin.openPdfPlusSettings();
          }
        }
      ]
    );
    this.renderActionGroup(
      groups,
      this.plugin.t("settingsWorkbenchActionGroupRecallTitle"),
      this.plugin.t("settingsWorkbenchActionGroupRecallDescription"),
      [
        {
          title: this.plugin.t("settingsWorkbenchActionSmartTitle"),
          description: this.plugin.t("settingsWorkbenchActionSmartDescription"),
          onClick: () => {
            void this.plugin.openSmartConnectionsView();
          }
        },
        {
          title: this.plugin.t("settingsWorkbenchActionSemanticTitle"),
          description: this.plugin.t("settingsWorkbenchActionSemanticDescription"),
          onClick: () => this.plugin.openSemanticSearch()
        },
        {
          title: this.plugin.t("settingsWorkbenchActionPanelTitle"),
          description: this.plugin.t("settingsWorkbenchActionPanelDescription"),
          onClick: () => {
            void this.plugin.openIntelligencePanel();
          }
        }
      ]
    );
    this.renderActionGroup(
      groups,
      this.plugin.t("settingsWorkbenchActionGroupOrganizeTitle"),
      this.plugin.t("settingsWorkbenchActionGroupOrganizeDescription"),
      [
        {
          title: this.plugin.t("settingsWorkbenchActionTagsTitle"),
          description: this.plugin.t("settingsWorkbenchActionTagsDescription"),
          onClick: () => this.plugin.openTagManager()
        },
        {
          title: this.plugin.t("settingsWorkbenchActionSuggestTitle"),
          description: this.plugin.t("settingsWorkbenchActionSuggestDescription"),
          onClick: () => this.plugin.openTagSuggestion()
        }
      ]
    );
  }

  private renderModuleSection(containerEl: HTMLElement): void {
    const section = this.createSectionCard(
      containerEl,
      this.plugin.t("settingsWorkbenchConfigTitle"),
      this.plugin.t("settingsWorkbenchConfigDescription")
    );
    const grid = section.createDiv({ cls: "lti-workbench-module-grid" });

    const preferences = this.createModuleCard(
      grid,
      this.plugin.t("settingsWorkbenchPreferencesTitle"),
      this.plugin.t("settingsWorkbenchPreferencesDescription")
    );
    this.renderMetricRow(preferences, this.plugin.t("settingsLanguage"), this.formatLanguageLabel(this.plugin.settings.language));
    this.renderMetricRow(
      preferences,
      this.plugin.t("settingsWorkflowMode"),
      this.plugin.t(this.plugin.settings.workflowMode === "researcher" ? "workflowModeResearcher" : "workflowModeGeneral")
    );
    this.attachModuleAction(preferences, () => this.openPage("workflow"));

    const paths = this.createModuleCard(
      grid,
      this.plugin.t("settingsWorkbenchPathsTitle"),
      this.plugin.t("settingsWorkbenchPathsDescription")
    );
    this.renderMetricRow(paths, this.plugin.t("settingsResearchPathLiterature"), this.compactPathLabel(this.plugin.settings.researchLiteratureFolder));
    this.renderMetricRow(paths, this.plugin.t("settingsResearchPathTemplates"), this.compactPathLabel(this.plugin.settings.researchTemplatePath));
    this.renderMetricRow(paths, this.plugin.t("settingsResearchPathAttachments"), this.compactPathLabel(this.plugin.settings.researchAttachmentsFolder));
    this.attachModuleAction(paths, () => this.openPage("workflow"));

    const smart = this.createModuleCard(
      grid,
      this.plugin.t("settingsWorkbenchRecallTitle"),
      this.plugin.t("settingsWorkbenchRecallDescription")
    );
    this.renderMetricRow(smart, this.plugin.t("settingsWorkbenchFolderExclusionsTitle"), String(normalizeDelimitedList(this.plugin.settings.smartConnectionsFolderExclusions).length));
    this.renderMetricRow(smart, this.plugin.t("settingsWorkbenchHeadingExclusionsTitle"), String(normalizeDelimitedList(this.plugin.settings.smartConnectionsHeadingExclusions).length));
    this.renderMetricRow(smart, this.plugin.t("settingsWorkbenchResultsLimitTitle"), String(this.plugin.settings.smartConnectionsResultsLimit));
    this.attachModuleAction(smart, () => this.openPage("workflow"));

    const semantic = this.createModuleCard(
      grid,
      this.plugin.t("settingsWorkbenchSemanticTitle"),
      this.plugin.t("settingsWorkbenchSemanticDescription")
    );
    this.renderMetricRow(semantic, this.plugin.t("settingsSemanticEnabled"), this.booleanText(this.plugin.settings.semanticBridgeEnabled));
    this.renderMetricRow(semantic, this.plugin.t("settingsSemanticCommand"), this.plugin.settings.semanticCommand.trim() ? this.plugin.t("configured") : this.plugin.t("notConfigured"));
    this.renderMetricRow(semantic, this.plugin.t("settingsSemanticTimeout"), String(this.plugin.settings.semanticTimeoutMs));
    this.attachModuleAction(semantic, () => this.openPage("workflow"));

    const taxonomy = this.createModuleCard(
      grid,
      this.plugin.t("settingsWorkbenchAdvancedTitle"),
      this.plugin.t("settingsWorkbenchAdvancedDescription")
    );
    this.renderMetricRow(taxonomy, this.plugin.t("settingsRelationKeys"), String(this.plugin.settings.relationKeys.length));
    this.renderMetricRow(taxonomy, this.plugin.t("settingsTagAliasMap"), String(this.countAliasEntries(this.plugin.settings.tagAliasMapText)));
    this.renderMetricRow(taxonomy, this.plugin.t("settingsTagFacetMap"), String(this.plugin.getTagFacetMap({ suppressNotice: true }).size));
    this.attachModuleAction(taxonomy, () => this.openPage("taxonomy"));

    section.createDiv({
      text: this.plugin.t("settingsWorkbenchConfigHint"),
      cls: "setting-item-description lti-workbench-hint"
    });
  }

  private renderCompanionSummarySection(containerEl: HTMLElement, state: ResearchWorkbenchState): void {
    const section = this.createSectionCard(
      containerEl,
      this.plugin.t("settingsWorkbenchCompanionTitle"),
      this.plugin.t("settingsWorkbenchCompanionDescription")
    );
    const list = section.createDiv({ cls: "lti-workbench-summary-list" });
    for (const companion of state.companions) {
      this.renderCompanionSummaryRow(list, companion);
    }
  }

  private renderCompanionSummaryRow(containerEl: HTMLElement, companion: CompanionPluginStatus): void {
    const meta = COMPANION_META[companion.id];
    const row = containerEl.createDiv({ cls: "lti-workbench-summary-row" });
    const copy = row.createDiv({ cls: "lti-workbench-summary-copy" });
    copy.createDiv({ text: meta.name, cls: "lti-workbench-summary-title" });
    const chips = copy.createDiv({ cls: "lti-workbench-chip-row" });
    chips.createDiv({
      text: this.getStatusLabel(companion),
      cls: `lti-workbench-status-pill is-${this.getStatusTone(companion)}`
    });
    if (companion.mismatches.length > 0) {
      chips.createDiv({
        text: this.plugin.t("settingsWorkbenchMismatchCount", { count: companion.mismatches.length }),
        cls: "lti-workbench-chip"
      });
    }
    this.createActionButton(row, this.plugin.t("settingsWorkbenchPagePlugins"), () => {
      this.openPage("plugins", companion.id);
    });
  }

  private renderPreferencesDrawer(containerEl: HTMLElement): void {
    this.createSelectField(
      containerEl,
      this.plugin.t("settingsLanguage"),
      "",
      [
        { value: "system", label: "System" },
        { value: "en", label: "English" },
        { value: "zh", label: "中文" }
      ],
      this.plugin.settings.language,
      async (value) => {
        this.plugin.settings.language = value as LanguageSetting;
        await this.plugin.saveSettings();
        this.display();
      }
    );

    this.createSelectField(
      containerEl,
      this.plugin.t("settingsWorkflowMode"),
      this.plugin.t("settingsWorkflowModeDescription"),
      [
        { value: "researcher", label: this.plugin.t("workflowModeResearcher") },
        { value: "general", label: this.plugin.t("workflowModeGeneral") }
      ],
      this.plugin.settings.workflowMode,
      async (value) => {
        this.plugin.settings.workflowMode = value as WorkflowMode;
        await this.plugin.saveSettings();
        this.display();
      }
    );
  }

  private renderPathsDrawer(containerEl: HTMLElement): void {
    this.createTextField(
      containerEl,
      this.plugin.t("settingsResearchPathLiterature"),
      "",
      this.plugin.settings.researchLiteratureFolder,
      async (value) => {
        this.plugin.settings.researchLiteratureFolder = value.trim() || RESEARCH_LITERATURE_PATH;
        await this.plugin.saveSettings();
      }
    );
    this.createTextField(
      containerEl,
      this.plugin.t("settingsResearchPathTemplates"),
      "",
      this.plugin.settings.researchTemplatePath,
      async (value) => {
        this.plugin.settings.researchTemplatePath = value.trim() || RESEARCH_TEMPLATE_PATH;
        await this.plugin.saveSettings();
      }
    );
    this.createTextField(
      containerEl,
      this.plugin.t("settingsResearchPathAttachments"),
      "",
      this.plugin.settings.researchAttachmentsFolder,
      async (value) => {
        this.plugin.settings.researchAttachmentsFolder = value.trim() || RESEARCH_ATTACHMENTS_PATH;
        await this.plugin.saveSettings();
      }
    );
    this.createToggleField(
      containerEl,
      this.plugin.t("settingsWorkbenchOpenImportedTitle"),
      this.plugin.t("settingsWorkbenchOpenImportedDescription"),
      this.plugin.settings.researchOpenNoteAfterImport,
      async (value) => {
        this.plugin.settings.researchOpenNoteAfterImport = value;
        await this.plugin.saveSettings();
      }
    );
    const actions = containerEl.createDiv({ cls: "lti-workbench-drawer-actions" });
    this.createAsyncButton(actions, this.plugin.t("settingsWorkbenchApplyCompanion"), async () => {
      await this.plugin.applyCompanionPreset("obsidian-zotero-desktop-connector");
    });
    this.createActionButton(actions, this.plugin.t("settingsWorkbenchRunZotero"), () => {
      void this.plugin.importZoteroNotes();
    });
  }

  private renderSmartDrawer(containerEl: HTMLElement): void {
    this.createTextAreaField(
      containerEl,
      this.plugin.t("settingsWorkbenchFolderExclusionsTitle"),
      this.plugin.t("settingsWorkbenchFolderExclusionsDescription"),
      this.plugin.settings.smartConnectionsFolderExclusions,
      async (value) => {
        this.plugin.settings.smartConnectionsFolderExclusions = normalizeDelimitedList(value).join(", ");
        await this.plugin.saveSettings();
      },
      4
    );
    this.createTextAreaField(
      containerEl,
      this.plugin.t("settingsWorkbenchHeadingExclusionsTitle"),
      this.plugin.t("settingsWorkbenchHeadingExclusionsDescription"),
      this.plugin.settings.smartConnectionsHeadingExclusions,
      async (value) => {
        this.plugin.settings.smartConnectionsHeadingExclusions = normalizeDelimitedList(value).join(", ");
        await this.plugin.saveSettings();
      },
      4
    );
    this.createNumberField(
      containerEl,
      this.plugin.t("settingsWorkbenchResultsLimitTitle"),
      "",
      String(this.plugin.settings.smartConnectionsResultsLimit),
      async (value) => {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          this.plugin.settings.smartConnectionsResultsLimit = parsed;
          await this.plugin.saveSettings();
        }
      }
    );
    const actions = containerEl.createDiv({ cls: "lti-workbench-drawer-actions" });
    this.createAsyncButton(actions, this.plugin.t("settingsWorkbenchApplyCompanion"), async () => {
      await this.plugin.applyCompanionPreset("smart-connections");
    });
    this.createActionButton(actions, this.plugin.t("settingsWorkbenchRunSmart"), () => {
      void this.plugin.openSmartConnectionsView();
    });
  }

  private renderSemanticDrawer(containerEl: HTMLElement, state: ResearchWorkbenchState): void {
    this.createToggleField(
      containerEl,
      this.plugin.t("settingsSemanticEnabled"),
      this.plugin.t("settingsSemanticEnabledDescription"),
      this.plugin.settings.semanticBridgeEnabled,
      async (value) => {
        this.plugin.settings.semanticBridgeEnabled = value;
        await this.plugin.saveSettings();
        this.display();
      }
    );
    this.createTextAreaField(
      containerEl,
      this.plugin.t("settingsSemanticCommand"),
      this.plugin.t("settingsSemanticCommandDescription"),
      this.plugin.settings.semanticCommand,
      async (value) => {
        this.plugin.settings.semanticCommand = value;
        await this.plugin.saveSettings();
      },
      5,
      "python3 /path/tool.py --vault {{vault}} --query {{query}}"
    );
    this.createNumberField(
      containerEl,
      this.plugin.t("settingsSemanticTimeout"),
      "",
      String(this.plugin.settings.semanticTimeoutMs),
      async (value) => {
        const parsed = Number.parseInt(value, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          this.plugin.settings.semanticTimeoutMs = parsed;
          await this.plugin.saveSettings();
        }
      }
    );
    containerEl.createDiv({
      text: this.plugin.t("settingsWorkbenchCurrentExclusions", { value: state.profile.smartFolderExclusions.join(", ") }),
      cls: "setting-item-description lti-workbench-inline-note"
    });
    const actions = containerEl.createDiv({ cls: "lti-workbench-drawer-actions" });
    this.createAsyncButton(actions, this.plugin.t("settingsWorkbenchApplyCompanion"), async () => {
      await this.plugin.applyCompanionPreset("semantic-bridge");
    });
    this.createActionButton(actions, this.plugin.t("settingsWorkbenchRunSemantic"), () => {
      this.plugin.openSemanticSearch();
    });
  }

  private renderTaxonomyDrawer(containerEl: HTMLElement): void {
    this.createAdvancedPanel(
      containerEl,
      this.plugin.t("settingsWorkbenchAdvancedRelationsTitle"),
      this.plugin.t("settingsWorkbenchAdvancedRelationsDescription"),
      (contentEl) => {
        this.createTextAreaField(
          contentEl,
          this.plugin.t("settingsRelationKeys"),
          this.plugin.t("settingsRelationKeysDescription"),
          this.plugin.settings.relationKeys.join(", "),
          async (value) => {
            this.plugin.settings.relationKeys = value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
            this.display();
          },
          4,
          RESEARCH_RELATION_KEYS.join(", ")
        );
        const chips = contentEl.createDiv({ cls: "lti-workbench-key-chip-row" });
        for (const key of this.plugin.settings.relationKeys) {
          const chip = chips.createDiv({ cls: "lti-workbench-key-chip" });
          chip.createSpan({ text: key });
          chip.createSpan({ text: this.plugin.relationLabel(key), cls: "lti-workbench-key-chip-meta" });
        }
      }
    );

    this.createAdvancedPanel(
      containerEl,
      this.plugin.t("settingsWorkbenchAdvancedAliasTitle"),
      this.plugin.t("settingsWorkbenchAdvancedAliasDescription"),
      (contentEl) => {
        this.createTextAreaField(
          contentEl,
          this.plugin.t("settingsTagAliasMap"),
          this.plugin.t("settingsTagAliasMapDescription"),
          this.plugin.settings.tagAliasMapText,
          async (value) => {
            this.plugin.settings.tagAliasMapText = value;
            await this.plugin.saveSettings();
          },
          10
        );
      }
    );

    this.createAdvancedPanel(
      containerEl,
      this.plugin.t("settingsWorkbenchAdvancedFacetTitle"),
      this.plugin.t("settingsWorkbenchAdvancedFacetDescription"),
      (contentEl) => {
        this.createTextAreaField(
          contentEl,
          this.plugin.t("settingsTagFacetMap"),
          this.plugin.t("settingsTagFacetMapDescription"),
          this.plugin.settings.tagFacetMapText,
          async (value) => {
            this.plugin.settings.tagFacetMapText = value;
            await this.plugin.saveSettings();
          },
          14
        );
      }
    );

    this.createAdvancedPanel(
      containerEl,
      this.plugin.t("settingsWorkbenchAdvancedMemoryTitle"),
      this.plugin.t("settingsWorkbenchAdvancedMemoryDescription"),
      (contentEl) => {
        this.createNumberField(
          contentEl,
          this.plugin.t("settingsRecentLinks"),
          "",
          String(this.plugin.settings.recentLinkMemorySize),
          async (value) => {
            const parsed = Number.parseInt(value, 10);
            if (Number.isFinite(parsed) && parsed > 0) {
              this.plugin.settings.recentLinkMemorySize = parsed;
              this.plugin.settings.recentLinkTargets = this.plugin.settings.recentLinkTargets.slice(0, parsed);
              await this.plugin.saveSettings();
            }
          }
        );
      }
    );
  }

  private renderPluginDrawer(containerEl: HTMLElement, companion: CompanionPluginStatus, state: ResearchWorkbenchState): void {
    if (companion.configPath) {
      containerEl.createDiv({
        text: companion.configPath,
        cls: "lti-workbench-plugin-path"
      });
    }

    const facts = containerEl.createDiv({ cls: "lti-workbench-fact-list" });
    this.renderCompanionFacts(facts, companion, state);

    if (companion.mismatches.length > 0) {
      const mismatches = containerEl.createDiv({ cls: "lti-workbench-mismatch-list" });
      mismatches.createDiv({
        text: this.plugin.t("settingsWorkbenchMismatchTitle"),
        cls: "lti-workbench-subtitle"
      });
      for (const mismatch of companion.mismatches) {
        mismatches.createDiv({
          text: this.getMismatchLabel(mismatch),
          cls: "lti-workbench-mismatch-item"
        });
      }
    }

    const actions = containerEl.createDiv({ cls: "lti-workbench-drawer-actions" });
    this.createAsyncButton(actions, this.plugin.t("settingsWorkbenchApplyCompanion"), async () => {
      await this.plugin.applyCompanionPreset(companion.id);
    }, !companion.installed && !companion.optional);
    this.createActionButton(actions, this.plugin.t("settingsWorkbenchOpenSettings"), () => {
      this.plugin.openCompanionSettings(companion.id);
    }, !companion.installed && !companion.optional);
    const primary = this.getPrimaryCompanionAction(companion.id);
    if (primary) {
      this.createActionButton(actions, primary.label, primary.handler, primary.disabled);
    }
  }

  private renderCompanionPanel(containerEl: HTMLElement, companion: CompanionPluginStatus, state: ResearchWorkbenchState): void {
    const meta = COMPANION_META[companion.id];
    const panel = containerEl.createEl("details", { cls: "lti-workbench-plugin-panel" });
    panel.open = this.activeCompanionId === companion.id || companion.mismatches.length > 0;
    panel.addEventListener("toggle", () => {
      this.activeCompanionId = panel.open ? companion.id : this.activeCompanionId === companion.id ? null : this.activeCompanionId;
    });

    const summary = panel.createEl("summary", { cls: "lti-workbench-plugin-summary" });
    const copy = summary.createDiv({ cls: "lti-workbench-plugin-summary-copy" });
    copy.createDiv({ text: meta.name, cls: "lti-workbench-plugin-title" });
    copy.createDiv({
      text: this.plugin.t(meta.descriptionKey),
      cls: "setting-item-description lti-workbench-plugin-description"
    });

    const chips = summary.createDiv({ cls: "lti-workbench-chip-row" });
    chips.createDiv({
      text: this.getStatusLabel(companion),
      cls: `lti-workbench-status-pill is-${this.getStatusTone(companion)}`
    });
    if (companion.mismatches.length > 0) {
      chips.createDiv({
        text: this.plugin.t("settingsWorkbenchMismatchCount", { count: companion.mismatches.length }),
        cls: "lti-workbench-chip"
      });
    }

    const body = panel.createDiv({ cls: "lti-workbench-plugin-body" });
    this.renderPluginDrawer(body, companion, state);
  }

  private renderCompanionFacts(containerEl: HTMLElement, companion: CompanionPluginStatus, state: ResearchWorkbenchState): void {
    switch (companion.id) {
      case "obsidian-zotero-desktop-connector": {
        const guide = this.currentWorkbenchGuide();
        this.renderFactRow(containerEl, guide.bridgeLabel, guide.bridgeValue);
        this.renderFactRow(containerEl, this.plugin.t("settingsResearchPathLiterature"), this.valueOrFallback(companion.actual.literatureFolder), state.profile.literatureFolder, !companion.mismatches.includes("zotero-folder"));
        this.renderFactRow(containerEl, this.plugin.t("settingsResearchPathTemplates"), this.valueOrFallback(companion.actual.templatePath), state.profile.templatePath, !companion.mismatches.includes("zotero-template"));
        this.renderFactRow(containerEl, this.plugin.t("settingsResearchPathAttachments"), this.valueOrFallback(companion.actual.attachmentsFolder), state.profile.attachmentsFolder, !companion.mismatches.includes("zotero-attachments"));
        this.renderFactRow(containerEl, this.plugin.t("settingsWorkbenchOpenImportedTitle"), this.booleanText(companion.actual.openNoteAfterImport), this.booleanText(state.profile.openNoteAfterImport), !companion.mismatches.includes("zotero-open-note"));
        return;
      }
      case "pdf-plus":
        this.renderFactRow(containerEl, this.plugin.t("settingsWorkbenchDefaultDisplayTitle"), this.valueOrFallback(companion.actual.defaultDisplayFormat), "Title & page", !companion.mismatches.includes("pdf-default-display"));
        this.renderFactRow(containerEl, this.plugin.t("settingsWorkbenchCopyCommandsTitle"), this.joinList(companion.actual.copyCommandNames), "Literature quote, Evidence callout, Source link", !companion.mismatches.includes("pdf-copy-commands"));
        this.renderFactRow(containerEl, this.plugin.t("settingsWorkbenchHoverPreviewTitle"), this.valueOrFallback(companion.actual.hoverHighlightAction), "preview", !companion.mismatches.includes("pdf-hover-preview"));
        this.renderFactRow(containerEl, this.plugin.t("settingsWorkbenchBacklinksTitle"), this.booleanText(companion.actual.highlightBacklinks), this.plugin.t("settingsWorkbenchOn"), !companion.mismatches.includes("pdf-highlight-backlinks"));
        return;
      case "smart-connections":
        this.renderFactRow(containerEl, this.plugin.t("settingsWorkbenchFolderExclusionsTitle"), this.joinList(companion.actual.folderExclusions), state.profile.smartFolderExclusions.join(", "), !companion.mismatches.includes("smart-folder-exclusions"));
        this.renderFactRow(containerEl, this.plugin.t("settingsWorkbenchHeadingExclusionsTitle"), this.joinList(companion.actual.headingExclusions), state.profile.smartHeadingExclusions.join(", "), !companion.mismatches.includes("smart-heading-exclusions"));
        this.renderFactRow(containerEl, this.plugin.t("settingsWorkbenchLanguageTitle"), this.valueOrFallback(companion.actual.language), state.profile.language, !companion.mismatches.includes("smart-language"));
        this.renderFactRow(containerEl, this.plugin.t("settingsWorkbenchResultsLimitTitle"), this.valueOrFallback(companion.actual.resultsLimit), String(state.profile.smartResultsLimit), !companion.mismatches.includes("smart-results-limit"));
        return;
      case "semantic-bridge":
        this.renderFactRow(containerEl, this.plugin.t("settingsSemanticEnabled"), this.booleanText(companion.actual.enabled), undefined, companion.ready || !companion.enabled);
        this.renderFactRow(containerEl, this.plugin.t("settingsSemanticCommand"), this.valueOrFallback(companion.actual.command), undefined, !companion.mismatches.includes("semantic-command"));
        this.renderFactRow(containerEl, this.plugin.t("settingsSemanticTimeout"), this.valueOrFallback(companion.actual.timeoutMs), undefined, true);
    }
  }

  private createAdvancedPanel(
    containerEl: HTMLElement,
    title: string,
    description: string,
    renderContent: (contentEl: HTMLElement) => void
  ): void {
    const details = containerEl.createEl("details", { cls: "lti-workbench-advanced-panel" });
    const summary = details.createEl("summary", { cls: "lti-workbench-advanced-summary" });
    summary.createSpan({ text: title, cls: "lti-workbench-advanced-title" });
    summary.createSpan({ text: description, cls: "lti-workbench-advanced-description" });
    const content = details.createDiv({ cls: "lti-workbench-advanced-content" });
    renderContent(content);
  }

  private createSectionCard(containerEl: HTMLElement, title: string, description: string): HTMLElement {
    const card = containerEl.createDiv({ cls: "lti-workbench-section-card" });
    const header = card.createDiv({ cls: "lti-workbench-section-header" });
    header.createDiv({ text: title, cls: "lti-workbench-section-title" });
    header.createDiv({
      text: description,
      cls: "setting-item-description lti-workbench-section-description"
    });
    return card;
  }

  private createModuleCard(containerEl: HTMLElement, title: string, description: string): HTMLElement {
    const card = containerEl.createDiv({ cls: "lti-workbench-module-card" });
    card.createDiv({ text: title, cls: "lti-workbench-subtitle" });
    card.createDiv({
      text: description,
      cls: "setting-item-description lti-workbench-card-copy"
    });
    return card;
  }

  private attachModuleAction(containerEl: HTMLElement, onClick: () => void): void {
    const actions = containerEl.createDiv({ cls: "lti-workbench-card-footer" });
    this.createActionButton(actions, this.plugin.t("settingsWorkbenchDetails"), onClick);
  }

  private createFieldShell(containerEl: HTMLElement, label: string, description: string): HTMLElement {
    const field = containerEl.createDiv({ cls: "lti-workbench-field" });
    field.createDiv({ text: label, cls: "lti-workbench-field-label" });
    if (description) {
      field.createDiv({
        text: description,
        cls: "setting-item-description lti-workbench-field-description"
      });
    }
    return field;
  }

  private createTextField(
    containerEl: HTMLElement,
    label: string,
    description: string,
    value: string,
    onChange: (value: string) => Promise<void>,
    placeholder = ""
  ): void {
    const field = this.createFieldShell(containerEl, label, description);
    const input = field.createEl("input", { cls: "lti-workbench-input", type: "text" });
    input.value = value;
    input.placeholder = placeholder;
    input.addEventListener("change", () => {
      void onChange(input.value);
    });
  }

  private createNumberField(
    containerEl: HTMLElement,
    label: string,
    description: string,
    value: string,
    onChange: (value: string) => Promise<void>
  ): void {
    const field = this.createFieldShell(containerEl, label, description);
    const input = field.createEl("input", { cls: "lti-workbench-input", type: "number" });
    input.value = value;
    input.addEventListener("change", () => {
      void onChange(input.value);
    });
  }

  private createTextAreaField(
    containerEl: HTMLElement,
    label: string,
    description: string,
    value: string,
    onChange: (value: string) => Promise<void>,
    rows: number,
    placeholder = ""
  ): void {
    const field = this.createFieldShell(containerEl, label, description);
    const area = field.createEl("textarea", { cls: "lti-workbench-textarea" });
    area.rows = rows;
    area.value = value;
    area.placeholder = placeholder;
    area.addEventListener("change", () => {
      void onChange(area.value);
    });
  }

  private createSelectField(
    containerEl: HTMLElement,
    label: string,
    description: string,
    options: Array<{ value: string; label: string }>,
    value: string,
    onChange: (value: string) => Promise<void>
  ): void {
    const field = this.createFieldShell(containerEl, label, description);
    const select = field.createEl("select", { cls: "lti-workbench-select" });
    for (const option of options) {
      const el = select.createEl("option", { text: option.label });
      el.value = option.value;
      if (option.value === value) {
        el.selected = true;
      }
    }
    select.addEventListener("change", () => {
      void onChange(select.value);
    });
  }

  private createToggleField(
    containerEl: HTMLElement,
    label: string,
    description: string,
    checked: boolean,
    onChange: (value: boolean) => Promise<void>
  ): void {
    const field = this.createFieldShell(containerEl, label, description);
    const row = field.createDiv({ cls: "lti-workbench-switch-row" });
    const toggle = row.createEl("label", { cls: "lti-workbench-switch" });
    const input = toggle.createEl("input", { type: "checkbox" });
    input.checked = checked;
    toggle.createSpan({ cls: "lti-workbench-switch-slider" });
    input.addEventListener("change", () => {
      void onChange(input.checked);
    });
  }

  private renderStat(containerEl: HTMLElement, label: string, value: string): void {
    const stat = containerEl.createDiv({ cls: "lti-workbench-stat" });
    stat.createDiv({ text: label, cls: "lti-workbench-stat-label" });
    stat.createDiv({ text: value, cls: "lti-workbench-stat-value" });
  }

  private renderMetaCard(containerEl: HTMLElement, label: string, value: string): void {
    const card = containerEl.createDiv({ cls: "lti-workbench-meta-card" });
    card.createDiv({ text: label, cls: "lti-workbench-stat-label" });
    card.createDiv({ text: value, cls: "lti-workbench-meta-value" });
  }

  private renderMetricRow(containerEl: HTMLElement, label: string, value: string): void {
    const row = containerEl.createDiv({ cls: "lti-workbench-metric-row" });
    row.createDiv({ text: label, cls: "lti-workbench-metric-label" });
    row.createDiv({ text: value, cls: "lti-workbench-metric-value" });
  }

  private renderFactRow(containerEl: HTMLElement, label: string, actual: string, expected?: string, ok = true): void {
    const row = containerEl.createDiv({ cls: "lti-workbench-fact-row" });
    if (!ok) {
      row.addClass("is-alert");
    }
    row.createDiv({ text: label, cls: "lti-workbench-fact-label" });
    const values = row.createDiv({ cls: "lti-workbench-fact-values" });
    values.createDiv({ text: actual, cls: "lti-workbench-fact-actual" });
    if (expected && !ok) {
      values.createDiv({
        text: `${this.plugin.t("settingsWorkbenchExpectedPrefix")}: ${expected}`,
        cls: "lti-workbench-fact-expected"
      });
    }
  }

  private renderActionGroup(
    containerEl: HTMLElement,
    title: string,
    description: string,
    actions: Array<{ title: string; description: string; onClick: () => void }>
  ): void {
    const card = containerEl.createDiv({ cls: "lti-workbench-action-group" });
    card.createDiv({ text: title, cls: "lti-workbench-subtitle" });
    card.createDiv({
      text: description,
      cls: "setting-item-description lti-workbench-card-copy"
    });

    const list = card.createDiv({ cls: "lti-workbench-action-list" });
    for (const action of actions) {
      this.createActionListItem(list, action.title, action.description, action.onClick);
    }
  }

  private createActionListItem(
    containerEl: HTMLElement,
    title: string,
    description: string,
    onClick: () => void
  ): void {
    const button = containerEl.createEl("button", { cls: "lti-workbench-action-item", type: "button" });
    const copy = button.createDiv({ cls: "lti-workbench-action-item-copy" });
    const text = copy.createDiv({ cls: "lti-workbench-action-item-text" });
    text.createDiv({ text: title, cls: "lti-workbench-action-item-title" });
    text.createDiv({ text: description, cls: "lti-workbench-action-item-description" });
    button.addEventListener("click", onClick);
  }

  private createActionButton(containerEl: HTMLElement, label: string, onClick: () => void, disabled = false): HTMLButtonElement {
    const button = containerEl.createEl("button", { cls: "lti-workbench-button", text: label, type: "button" });
    button.disabled = disabled;
    button.addEventListener("click", onClick);
    return button;
  }

  private createAsyncButton(containerEl: HTMLElement, label: string, onClick: () => Promise<void>, disabled = false): HTMLButtonElement {
    const button = this.createActionButton(containerEl, label, () => {
      void (async () => {
        button.disabled = true;
        button.textContent = this.plugin.t("loading");
        try {
          await onClick();
        } finally {
          this.display();
        }
      })();
    }, disabled);
    return button;
  }

  private getPrimaryCompanionAction(id: CompanionPluginId): { label: string; handler: () => void; disabled?: boolean } | null {
    switch (id) {
      case "obsidian-zotero-desktop-connector":
        return {
          label: this.plugin.t("settingsWorkbenchRunZotero"),
          handler: () => {
            void this.plugin.importZoteroNotes();
          }
        };
      case "smart-connections":
        return {
          label: this.plugin.t("settingsWorkbenchRunSmart"),
          handler: () => {
            void this.plugin.openSmartConnectionsView();
          }
        };
      case "semantic-bridge":
        return {
          label: this.plugin.t("settingsWorkbenchRunSemantic"),
          handler: () => this.plugin.openSemanticSearch()
        };
      case "pdf-plus":
        return {
          label: this.plugin.t("settingsWorkbenchRunPdf"),
          handler: () => {
            void this.plugin.openPdfPlusSettings();
          }
        };
      default:
        return null;
    }
  }

  private getStatusTone(companion: CompanionPluginStatus): "ready" | "alert" | "missing" | "optional" {
    if (!companion.installed && !companion.optional) {
      return "missing";
    }
    if (companion.ready) {
      return companion.optional ? "optional" : "ready";
    }
    return "alert";
  }

  private getStatusLabel(companion: CompanionPluginStatus): string {
    const tone = this.getStatusTone(companion);
    if (tone === "ready") {
      return this.plugin.t("settingsWorkbenchStatusReady");
    }
    if (tone === "missing") {
      return this.plugin.t("settingsWorkbenchStatusMissing");
    }
    if (tone === "optional") {
      return this.plugin.t("settingsWorkbenchStatusOptional");
    }
    return this.plugin.t("settingsWorkbenchStatusAttention");
  }

  private getMismatchLabel(code: string): string {
    const map: Record<string, string> = {
      "zotero-folder": this.plugin.t("settingsWorkbenchMismatchZoteroFolder"),
      "zotero-template": this.plugin.t("settingsWorkbenchMismatchZoteroTemplate"),
      "zotero-attachments": this.plugin.t("settingsWorkbenchMismatchZoteroAttachments"),
      "zotero-open-note": this.plugin.t("settingsWorkbenchMismatchZoteroOpen"),
      "zotero-output-template": this.plugin.t("settingsWorkbenchMismatchZoteroOutput"),
      "zotero-cite-template": this.plugin.t("settingsWorkbenchMismatchZoteroCite"),
      "pdf-display-formats": this.plugin.t("settingsWorkbenchMismatchPdfDisplayFormats"),
      "pdf-default-display": this.plugin.t("settingsWorkbenchMismatchPdfDisplayDefault"),
      "pdf-copy-commands": this.plugin.t("settingsWorkbenchMismatchPdfCopy"),
      "pdf-hover-preview": this.plugin.t("settingsWorkbenchMismatchPdfHover"),
      "pdf-highlight-backlinks": this.plugin.t("settingsWorkbenchMismatchPdfBacklinks"),
      "pdf-selection-menu": this.plugin.t("settingsWorkbenchMismatchPdfSelectionMenu"),
      "pdf-annotation-menu": this.plugin.t("settingsWorkbenchMismatchPdfAnnotationMenu"),
      "smart-language": this.plugin.t("settingsWorkbenchMismatchSmartLanguage"),
      "smart-folder-exclusions": this.plugin.t("settingsWorkbenchMismatchSmartFolders"),
      "smart-heading-exclusions": this.plugin.t("settingsWorkbenchMismatchSmartHeadings"),
      "smart-results-limit": this.plugin.t("settingsWorkbenchMismatchSmartResults"),
      "smart-render-markdown": this.plugin.t("settingsWorkbenchMismatchSmartRender"),
      "semantic-command": this.plugin.t("settingsWorkbenchMismatchSemanticCommand")
    };
    return map[code] ?? code;
  }

  private compactPathLabel(value: string): string {
    const normalized = value.trim().replace(/\\/g, "/");
    if (!normalized) {
      return this.plugin.t("notConfigured");
    }
    const segments = normalized.split("/").filter(Boolean);
    return segments.at(-1) ?? normalized;
  }

  private countAliasEntries(text: string): number {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      return Object.keys(parsed).length;
    } catch {
      return 0;
    }
  }

  private formatLanguageLabel(setting: LanguageSetting): string {
    if (setting === "system") {
      return this.plugin.currentLanguage() === "zh" ? "系统" : "System";
    }
    return setting === "zh" ? "中文" : "English";
  }

  private valueOrFallback(value: unknown): string {
    if (typeof value === "number") {
      return String(value);
    }
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    return this.plugin.t("notConfigured");
  }

  private joinList(value: unknown): string {
    return Array.isArray(value) && value.length > 0
      ? value.map(String).join(", ")
      : this.plugin.t("notConfigured");
  }

  private booleanText(value: unknown): string {
    return value === true ? this.plugin.t("settingsWorkbenchOn") : this.plugin.t("settingsWorkbenchOff");
  }
}
