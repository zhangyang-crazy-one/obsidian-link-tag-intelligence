import { App, PluginSettingTab, Setting } from "obsidian";

import type LinkTagIntelligencePlugin from "./main";
import type { LanguageSetting } from "./i18n";

export interface LinkTagIntelligenceSettings {
  language: LanguageSetting;
  relationKeys: string[];
  tagAliasMapText: string;
  semanticBridgeEnabled: boolean;
  semanticCommand: string;
  semanticTimeoutMs: number;
  recentLinkMemorySize: number;
  recentLinkTargets: string[];
}

export const DEFAULT_SETTINGS: LinkTagIntelligenceSettings = {
  language: "system",
  relationKeys: ["related", "see_also", "parent", "child", "same_as"],
  tagAliasMapText: JSON.stringify(
    {
      "大语言模型": ["llm", "large-language-model"],
      "手冲咖啡": ["pour-over", "coffee-brewing"]
    },
    null,
    2
  ),
  semanticBridgeEnabled: false,
  semanticCommand: "",
  semanticTimeoutMs: 30000,
  recentLinkMemorySize: 24,
  recentLinkTargets: []
};

export class LinkTagIntelligenceSettingTab extends PluginSettingTab {
  plugin: LinkTagIntelligencePlugin;

  constructor(app: App, plugin: LinkTagIntelligencePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: this.plugin.t("pluginName") });

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
      .setName(this.plugin.t("settingsRelationKeys"))
      .setDesc("Comma-separated frontmatter keys for typed note relations.")
      .addTextArea((area) =>
        area
          .setValue(this.plugin.settings.relationKeys.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.relationKeys = value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(this.plugin.t("settingsTagAliasMap"))
      .setDesc("JSON object from canonical tag to aliases. Used for bilingual matching, not automatic rewrites.")
      .addTextArea((area) => {
        area.inputEl.rows = 10;
        area
          .setValue(this.plugin.settings.tagAliasMapText)
          .onChange(async (value) => {
            this.plugin.settings.tagAliasMapText = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName(this.plugin.t("settingsSemanticEnabled"))
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
      .setDesc("Desktop-only shell command. Supported placeholders: {{query}} {{vault}} {{file}} {{selection}}")
      .addTextArea((area) => {
        area.inputEl.rows = 4;
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
}
