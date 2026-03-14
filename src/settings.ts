import { App, PluginSettingTab, Setting } from "obsidian";

import type LinkTagIntelligencePlugin from "./main";
import type { LanguageSetting } from "./i18n";

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

export const DEFAULT_TAG_FACET_MAP_TEXT = JSON.stringify(
  {
    topic: {
      "literature-review": ["文献综述", "literature review"],
      "research-gap": ["研究空白", "research gap"],
      "knowledge-synthesis": ["知识综合", "synthesis"]
    },
    method: {
      experiment: ["实验", "experimental"],
      qualitative: ["定性研究", "qualitative"],
      quantitative: ["定量研究", "quantitative"],
      "case-study": ["案例研究", "case study"]
    },
    dataset: {
      survey: ["问卷", "survey"],
      corpus: ["语料", "corpus"],
      interview: ["访谈", "interview"]
    },
    theory: {
      framework: ["理论框架", "framework"],
      model: ["模型", "model"]
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
}

export const DEFAULT_SETTINGS: LinkTagIntelligenceSettings = {
  language: "system",
  workflowMode: "researcher",
  relationKeys: [...RESEARCH_RELATION_KEYS],
  tagAliasMapText: JSON.stringify(
    {
      "大语言模型": ["llm", "large-language-model"],
      "手冲咖啡": ["pour-over", "coffee-brewing"],
      "文献综述": ["literature-review", "lit review"],
      "研究空白": ["research gap"]
    },
    null,
    2
  ),
  tagFacetMapText: DEFAULT_TAG_FACET_MAP_TEXT,
  semanticBridgeEnabled: false,
  semanticCommand: "",
  semanticTimeoutMs: 30000,
  recentLinkMemorySize: 24,
  recentLinkTargets: []
};

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function normalizeLoadedSettings(data: unknown): LinkTagIntelligenceSettings {
  const raw = data && typeof data === "object" ? (data as Partial<LinkTagIntelligenceSettings>) : {};
  const normalized = {
    ...DEFAULT_SETTINGS,
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
  normalized.tagAliasMapText = typeof normalized.tagAliasMapText === "string" ? normalized.tagAliasMapText : DEFAULT_SETTINGS.tagAliasMapText;
  normalized.tagFacetMapText = typeof normalized.tagFacetMapText === "string" ? normalized.tagFacetMapText : DEFAULT_TAG_FACET_MAP_TEXT;
  normalized.semanticCommand = typeof normalized.semanticCommand === "string" ? normalized.semanticCommand : "";
  normalized.semanticTimeoutMs = Number.isFinite(normalized.semanticTimeoutMs) && normalized.semanticTimeoutMs > 0
    ? normalized.semanticTimeoutMs
    : DEFAULT_SETTINGS.semanticTimeoutMs;
  normalized.recentLinkMemorySize = Number.isFinite(normalized.recentLinkMemorySize) && normalized.recentLinkMemorySize > 0
    ? normalized.recentLinkMemorySize
    : DEFAULT_SETTINGS.recentLinkMemorySize;
  normalized.recentLinkTargets = Array.isArray(normalized.recentLinkTargets)
    ? normalized.recentLinkTargets.map(String).filter(Boolean)
    : [];

  return normalized;
}

const COMPANION_PLUGINS = [
  {
    name: "Zotero Integration",
    url: "https://github.com/mgmeyers/obsidian-zotero-integration",
    descriptionKey: "settingsCompanionZoteroDesc" as const
  },
  {
    name: "PDF++",
    url: "https://github.com/RyotaUshio/obsidian-pdf-plus",
    descriptionKey: "settingsCompanionPdfDesc" as const
  },
  {
    name: "Smart Connections",
    url: "https://github.com/brianpetro/obsidian-smart-connections",
    descriptionKey: "settingsCompanionSmartDesc" as const
  },
  {
    name: "External semantic CLI",
    url: "https://github.com/zhangyang-crazy-one/obsidian-link-tag-intelligence#external-semantic-bridge",
    descriptionKey: "settingsCompanionSemanticDesc" as const
  }
];

export class LinkTagIntelligenceSettingTab extends PluginSettingTab {
  plugin: LinkTagIntelligencePlugin;

  constructor(app: App, plugin: LinkTagIntelligencePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName(this.plugin.t("pluginName"))
      .setHeading();

    new Setting(containerEl)
      .setName(this.plugin.t("settingsLanguage"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("system", "System")
          .addOption("en", "English")
          .addOption("zh", "中文")
          .setValue(this.plugin.settings.language)
          .onChange(async (value) => {
            this.plugin.settings.language = value as LanguageSetting;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    new Setting(containerEl)
      .setName(this.plugin.t("settingsWorkflowMode"))
      .setDesc(this.plugin.t("settingsWorkflowModeDescription"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("researcher", this.plugin.t("workflowModeResearcher"))
          .addOption("general", this.plugin.t("workflowModeGeneral"))
          .setValue(this.plugin.settings.workflowMode)
          .onChange(async (value) => {
            this.plugin.settings.workflowMode = value as WorkflowMode;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    this.renderResearchGuide(containerEl);

    new Setting(containerEl)
      .setName(this.plugin.t("settingsRelationKeys"))
      .setDesc(this.plugin.t("settingsRelationKeysDescription"))
      .addTextArea((area) => {
        area.inputEl.rows = 4;
        area.inputEl.addClass("lti-settings-textarea", "lti-settings-textarea-compact");
        area.inputEl.style.resize = "vertical";
        area
          .setValue(this.plugin.settings.relationKeys.join(", "))
          .setPlaceholder(RESEARCH_RELATION_KEYS.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.relationKeys = value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
          });
      });

    const relationPreview = containerEl.createDiv({ cls: "setting-item-description lti-settings-inline-note" });
    relationPreview.createSpan({ text: `${this.plugin.t("settingsRelationKeysPreview")}: ` });
    relationPreview.appendText(
      this.plugin.settings.relationKeys
        .map((key) => `${key} (${this.plugin.relationLabel(key)})`)
        .join(" · ")
    );

    new Setting(containerEl)
      .setName(this.plugin.t("settingsTagAliasMap"))
      .setDesc(this.plugin.t("settingsTagAliasMapDescription"))
      .addTextArea((area) => {
        area.inputEl.rows = 10;
        area.inputEl.addClass("lti-settings-textarea");
        area.inputEl.style.resize = "vertical";
        area
          .setValue(this.plugin.settings.tagAliasMapText)
          .onChange(async (value) => {
            this.plugin.settings.tagAliasMapText = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(this.plugin.t("settingsTagFacetMap"))
      .setDesc(this.plugin.t("settingsTagFacetMapDescription"))
      .addTextArea((area) => {
        area.inputEl.rows = 14;
        area.inputEl.addClass("lti-settings-textarea");
        area.inputEl.style.resize = "vertical";
        area
          .setValue(this.plugin.settings.tagFacetMapText)
          .onChange(async (value) => {
            this.plugin.settings.tagFacetMapText = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(this.plugin.t("settingsSemanticEnabled"))
      .setDesc(this.plugin.t("settingsSemanticEnabledDescription"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.semanticBridgeEnabled)
          .onChange(async (value) => {
            this.plugin.settings.semanticBridgeEnabled = value;
            await this.plugin.saveSettings();
            this.plugin.refreshAllViews();
          })
      );

    new Setting(containerEl)
      .setName(this.plugin.t("settingsSemanticCommand"))
      .setDesc(this.plugin.t("settingsSemanticCommandDescription"))
      .addTextArea((area) => {
        area.inputEl.rows = 4;
        area.inputEl.addClass("lti-settings-textarea", "lti-settings-textarea-compact");
        area.inputEl.style.resize = "vertical";
        area
          .setValue(this.plugin.settings.semanticCommand)
          .setPlaceholder("python3 /path/tool.py --vault {{vault}} --query {{query}}")
          .onChange(async (value) => {
            this.plugin.settings.semanticCommand = value;
            await this.plugin.saveSettings();
            this.plugin.refreshAllViews();
          });
      });

    new Setting(containerEl)
      .setName(this.plugin.t("settingsSemanticTimeout"))
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.semanticTimeoutMs))
          .onChange(async (value) => {
            const parsed = Number.parseInt(value, 10);
            if (Number.isFinite(parsed) && parsed > 0) {
              this.plugin.settings.semanticTimeoutMs = parsed;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName(this.plugin.t("settingsRecentLinks"))
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.recentLinkMemorySize))
          .onChange(async (value) => {
            const parsed = Number.parseInt(value, 10);
            if (Number.isFinite(parsed) && parsed > 0) {
              this.plugin.settings.recentLinkMemorySize = parsed;
              this.plugin.settings.recentLinkTargets = this.plugin.settings.recentLinkTargets.slice(0, parsed);
              await this.plugin.saveSettings();
            }
          })
      );
  }

  private renderResearchGuide(containerEl: HTMLElement): void {
    const guide = containerEl.createDiv({ cls: "lti-settings-guide" });
    guide.createEl("h3", { text: this.plugin.t("settingsResearchGuideTitle"), cls: "lti-settings-guide-title" });
    guide.createDiv({
      text: this.plugin.t("settingsResearchGuideDescription"),
      cls: "setting-item-description lti-settings-guide-description"
    });

    const setup = guide.createEl("ol", { cls: "lti-settings-guide-list" });
    for (const key of ["settingsResearchGuideStep1", "settingsResearchGuideStep2", "settingsResearchGuideStep3"] as const) {
      setup.createEl("li", {
        text: this.plugin.t(key),
        cls: "setting-item-description"
      });
    }

    const companionTitle = guide.createDiv({
      text: this.plugin.t("settingsCompanionPluginsTitle"),
      cls: "lti-settings-guide-subtitle"
    });
    companionTitle.setAttribute("role", "heading");
    companionTitle.setAttribute("aria-level", "4");

    const list = guide.createEl("ul", { cls: "lti-settings-guide-list" });
    for (const companion of COMPANION_PLUGINS) {
      const item = list.createEl("li", { cls: "setting-item-description" });
      const link = item.createEl("a", {
        text: companion.name,
        href: companion.url
      });
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      item.appendText(` - ${this.plugin.t(companion.descriptionKey)}`);
    }

    guide.createDiv({
      text: this.plugin.t("settingsSemanticResearchHint"),
      cls: "setting-item-description lti-settings-guide-note"
    });
  }
}
