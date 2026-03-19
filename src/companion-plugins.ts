import type { App } from "obsidian";

import type { UILanguage } from "./i18n";
import type { LinkTagIntelligenceSettings } from "./settings";

export type CompanionPluginId =
  | "obsidian-zotero-desktop-connector"
  | "pdf-plus"
  | "smart-connections"
  | "semantic-bridge";

export interface ResearchWorkbenchProfile {
  language: UILanguage;
  literatureFolder: string;
  templatePath: string;
  attachmentsFolder: string;
  openNoteAfterImport: boolean;
  smartFolderExclusions: string[];
  smartHeadingExclusions: string[];
  smartResultsLimit: number;
  semanticEnabled: boolean;
  semanticCommand: string;
  semanticTimeoutMs: number;
}

export interface CompanionPluginStatus {
  id: CompanionPluginId;
  installed: boolean;
  enabled: boolean;
  ready: boolean;
  optional: boolean;
  configPath: string | null;
  mismatches: string[];
  actual: Record<string, unknown>;
}

export interface ResearchWorkbenchState {
  profile: ResearchWorkbenchProfile;
  enabledPluginIds: string[];
  companions: CompanionPluginStatus[];
}

interface ZoteroFormat {
  name: string;
  outputPathTemplate?: string;
  imageOutputPathTemplate?: string;
  imageBaseNameTemplate?: string;
  templatePath?: string;
  cslStyle?: string;
}

interface ZoteroCiteFormat {
  name: string;
  outputFormat?: string;
  formatAs?: string;
  format?: string;
  template?: string;
}

interface PdfNamedTemplate {
  name: string;
  template: string;
}

const ZOTERO_ID = "obsidian-zotero-desktop-connector";
const PDF_PLUS_ID = "pdf-plus";
const SMART_CONNECTIONS_ID = "smart-connections";
const SEMANTIC_BRIDGE_ID = "semantic-bridge";

const SMART_CONNECTIONS_CONFIG_PATH = `.smart-env/smart_env.json`;

const ZOTERO_EXPORT_FORMAT_NAME = "Research literature note";
const ZOTERO_CITE_FORMAT_NAME = "Insert literature note link";
const ZOTERO_CITE_TEMPLATE = "[[{{citekey}}]]";

const REQUIRED_PDF_DISPLAY_FORMATS: PdfNamedTemplate[] = [
  {
    name: "Title & page",
    template: "{{file.basename}}, p.{{pageLabel}}"
  },
  {
    name: "Page",
    template: "p.{{pageLabel}}"
  },
  {
    name: "Text",
    template: "{{text}}"
  }
];

const REQUIRED_PDF_COPY_COMMANDS: PdfNamedTemplate[] = [
  {
    name: "Literature quote",
    template: "> [!quote] {{linkWithDisplay}}\n> {{text}}\n"
  },
  {
    name: "Evidence callout",
    template: "> [!cite] {{linkWithDisplay}}\n> {{text}}\n"
  },
  {
    name: "Source link",
    template: "{{linkWithDisplay}}"
  }
];

function normalizeVaultPath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/$/, "")
    .trim();
}

function configPath(app: App, ...segments: string[]): string {
  return normalizeVaultPath([app.vault.configDir, ...segments].join("/"));
}

function pluginDataPath(app: App, pluginId: string): string {
  return configPath(app, "plugins", pluginId, "data.json");
}

function pluginManifestPath(app: App, pluginId: string): string {
  return configPath(app, "plugins", pluginId, "manifest.json");
}

function ensureString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function ensureNumber(value: unknown, fallback: number): number {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function ensureBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function stringifyJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

async function pathExists(app: App, path: string): Promise<boolean> {
  const adapter = app.vault.adapter as { exists?: (target: string) => Promise<boolean>; read?: (target: string) => Promise<string> };
  if (typeof adapter.exists === "function") {
    return adapter.exists(path);
  }
  if (typeof adapter.read === "function") {
    try {
      await adapter.read(path);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

async function ensureParentDirectory(app: App, filePath: string): Promise<void> {
  const adapter = app.vault.adapter as { exists?: (target: string) => Promise<boolean>; mkdir?: (target: string) => Promise<void> };
  if (typeof adapter.mkdir !== "function") {
    return;
  }
  const parts = normalizeVaultPath(filePath).split("/").slice(0, -1);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const exists = typeof adapter.exists === "function"
      ? await adapter.exists(current)
      : true;
    if (!exists) {
      try {
        await adapter.mkdir(current);
      } catch {
        // Ignore duplicate mkdir races from Obsidian's adapter.
      }
    }
  }
}

async function readJson(app: App, path: string): Promise<Record<string, unknown>> {
  if (!(await pathExists(app, path))) {
    return {};
  }
  const raw = await app.vault.adapter.read(path);
  try {
    return toRecord(JSON.parse(raw));
  } catch {
    return {};
  }
}

async function writeJson(app: App, path: string, data: unknown): Promise<void> {
  await ensureParentDirectory(app, path);
  await app.vault.adapter.write(path, stringifyJson(data));
}

function findNamedEntry<T extends { name?: string }>(items: T[], name: string): T | null {
  return items.find((item) => ensureString(item.name) === name) ?? null;
}

export function upsertNamedEntries<T extends { name: string }>(current: T[], required: T[]): T[] {
  const requiredMap = new Map(required.map((item) => [item.name, item]));
  const remaining = current.filter((item) => !requiredMap.has(item.name));
  return [...required, ...remaining];
}

function mergeMenuConfig(current: string[], required: string[]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const item of [...current, ...required]) {
    const key = item.trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(key);
  }
  return merged;
}

export function normalizeDelimitedList(input: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const raw of input.split(/[\n,]/)) {
    const normalized = normalizeVaultPath(raw);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push(normalized);
  }
  return items;
}

function sameNormalizedList(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const leftKeys = [...left].map((item) => item.toLowerCase()).sort();
  const rightKeys = [...right].map((item) => item.toLowerCase()).sort();
  return leftKeys.every((value, index) => value === rightKeys[index]);
}

function includesAll(haystack: string[], needles: string[]): boolean {
  const available = new Set(haystack.map((item) => item.toLowerCase()));
  return needles.every((item) => available.has(item.toLowerCase()));
}

export function buildResearchWorkbenchProfile(
  settings: LinkTagIntelligenceSettings,
  language: UILanguage
): ResearchWorkbenchProfile {
  return {
    language,
    literatureFolder: normalizeVaultPath(settings.researchLiteratureFolder),
    templatePath: normalizeVaultPath(settings.researchTemplatePath),
    attachmentsFolder: normalizeVaultPath(settings.researchAttachmentsFolder),
    openNoteAfterImport: settings.researchOpenNoteAfterImport,
    smartFolderExclusions: normalizeDelimitedList(settings.smartConnectionsFolderExclusions),
    smartHeadingExclusions: normalizeDelimitedList(settings.smartConnectionsHeadingExclusions),
    smartResultsLimit: Math.max(5, settings.smartConnectionsResultsLimit),
    semanticEnabled: settings.semanticBridgeEnabled,
    semanticCommand: settings.semanticCommand.trim(),
    semanticTimeoutMs: settings.semanticTimeoutMs
  };
}

export function buildRecommendedZoteroConfig(profile: ResearchWorkbenchProfile): Record<string, unknown> {
  return {
    noteImportFolder: profile.literatureFolder,
    citeSuggestTemplate: ZOTERO_CITE_TEMPLATE,
    openNoteAfterImport: profile.openNoteAfterImport,
    whichNotesToOpenAfterImport: "last-imported-note",
    exportFormats: [
      {
        name: ZOTERO_EXPORT_FORMAT_NAME,
        outputPathTemplate: `${profile.literatureFolder}/{{citekey}}.md`,
        imageOutputPathTemplate: `${profile.attachmentsFolder}/{{citekey}}`,
        imageBaseNameTemplate: "{{citekey}}",
        templatePath: profile.templatePath,
        cslStyle: "apa"
      }
    ],
    citeFormats: [
      {
        name: ZOTERO_CITE_FORMAT_NAME,
        outputFormat: "markdown",
        formatAs: "single",
        format: "template",
        template: ZOTERO_CITE_TEMPLATE
      }
    ]
  };
}

export function buildRecommendedPdfConfig(): Record<string, unknown> {
  return {
    displayTextFormats: REQUIRED_PDF_DISPLAY_FORMATS,
    defaultDisplayTextFormatIndex: 0,
    syncDisplayTextFormat: true,
    highlightBacklinks: true,
    hoverHighlightAction: "preview",
    selectionProductMenuConfig: ["copy-format", "display"],
    annotationProductMenuConfig: ["copy-format", "display"],
    copyCommands: REQUIRED_PDF_COPY_COMMANDS
  };
}

export function buildRecommendedSmartConnectionsConfig(profile: ResearchWorkbenchProfile): Record<string, unknown> {
  return {
    language: profile.language,
    smart_sources: {
      excluded_headings: profile.smartHeadingExclusions.join(","),
      folder_exclusions: profile.smartFolderExclusions.join(",")
    },
    smart_view_filter: {
      render_markdown: true
    },
    connections_lists: {
      results_limit: profile.smartResultsLimit
    }
  };
}

function extractZoteroActual(config: Record<string, unknown>): Record<string, unknown> {
  const exportFormat = findNamedEntry(ensureArray<ZoteroFormat>(config.exportFormats), ZOTERO_EXPORT_FORMAT_NAME);
  return {
    literatureFolder: ensureString(config.noteImportFolder),
    templatePath: ensureString(exportFormat?.templatePath),
    attachmentsFolder: ensureString(exportFormat?.imageOutputPathTemplate).replace(/\/\{\{citekey\}\}$/, ""),
    openNoteAfterImport: ensureBoolean(config.openNoteAfterImport, true)
  };
}

function extractPdfActual(config: Record<string, unknown>): Record<string, unknown> {
  const displayFormats = ensureArray<PdfNamedTemplate>(config.displayTextFormats);
  const defaultDisplayIndex = ensureNumber(config.defaultDisplayTextFormatIndex, 0);
  const defaultDisplay = displayFormats[defaultDisplayIndex];
  return {
    defaultDisplayFormat: ensureString(defaultDisplay?.name),
    copyCommandNames: ensureArray<PdfNamedTemplate>(config.copyCommands).map((item) => ensureString(item.name)).filter(Boolean),
    hoverHighlightAction: ensureString(config.hoverHighlightAction),
    highlightBacklinks: ensureBoolean(config.highlightBacklinks),
    selectionProductMenuConfig: ensureArray<string>(config.selectionProductMenuConfig).map(String),
    annotationProductMenuConfig: ensureArray<string>(config.annotationProductMenuConfig).map(String)
  };
}

function extractSmartActual(config: Record<string, unknown>): Record<string, unknown> {
  const smartSources = toRecord(config.smart_sources);
  const smartViewFilter = toRecord(config.smart_view_filter);
  const connectionLists = toRecord(config.connections_lists);
  return {
    language: ensureString(config.language),
    folderExclusions: normalizeDelimitedList(ensureString(smartSources.folder_exclusions)),
    headingExclusions: normalizeDelimitedList(ensureString(smartSources.excluded_headings)),
    resultsLimit: ensureNumber(connectionLists.results_limit, 20),
    renderMarkdown: ensureBoolean(smartViewFilter.render_markdown, true)
  };
}

export function diffZoteroConfig(
  actualConfig: Record<string, unknown>,
  profile: ResearchWorkbenchProfile
): string[] {
  const actual = extractZoteroActual(actualConfig);
  const exportFormat = findNamedEntry(ensureArray<ZoteroFormat>(actualConfig.exportFormats), ZOTERO_EXPORT_FORMAT_NAME);
  const citeFormat = findNamedEntry(ensureArray<ZoteroCiteFormat>(actualConfig.citeFormats), ZOTERO_CITE_FORMAT_NAME);
  const mismatches: string[] = [];

  if (actual.literatureFolder !== profile.literatureFolder) {
    mismatches.push("zotero-folder");
  }
  if (actual.templatePath !== profile.templatePath) {
    mismatches.push("zotero-template");
  }
  if (actual.attachmentsFolder !== profile.attachmentsFolder) {
    mismatches.push("zotero-attachments");
  }
  if (actual.openNoteAfterImport !== profile.openNoteAfterImport) {
    mismatches.push("zotero-open-note");
  }
  if (ensureString(exportFormat?.outputPathTemplate) !== `${profile.literatureFolder}/{{citekey}}.md`) {
    mismatches.push("zotero-output-template");
  }
  if (ensureString(citeFormat?.template) !== ZOTERO_CITE_TEMPLATE) {
    mismatches.push("zotero-cite-template");
  }

  return mismatches;
}

export function diffPdfConfig(actualConfig: Record<string, unknown>): string[] {
  const actual = extractPdfActual(actualConfig);
  const displayFormats = ensureArray<PdfNamedTemplate>(actualConfig.displayTextFormats);
  const displayFormatNames = displayFormats.map((item) => ensureString(item.name)).filter(Boolean);
  const copyCommandNames = ensureArray<PdfNamedTemplate>(actualConfig.copyCommands).map((item) => ensureString(item.name)).filter(Boolean);
  const mismatches: string[] = [];

  if (!includesAll(displayFormatNames, REQUIRED_PDF_DISPLAY_FORMATS.map((item) => item.name))) {
    mismatches.push("pdf-display-formats");
  }
  if (actual.defaultDisplayFormat !== "Title & page") {
    mismatches.push("pdf-default-display");
  }
  if (!includesAll(copyCommandNames, REQUIRED_PDF_COPY_COMMANDS.map((item) => item.name))) {
    mismatches.push("pdf-copy-commands");
  }
  if (actual.hoverHighlightAction !== "preview") {
    mismatches.push("pdf-hover-preview");
  }
  if (actual.highlightBacklinks !== true) {
    mismatches.push("pdf-highlight-backlinks");
  }
  if (!includesAll(ensureArray<string>(actual.selectionProductMenuConfig), ["copy-format", "display"])) {
    mismatches.push("pdf-selection-menu");
  }
  if (!includesAll(ensureArray<string>(actual.annotationProductMenuConfig), ["copy-format", "display"])) {
    mismatches.push("pdf-annotation-menu");
  }

  return mismatches;
}

export function diffSmartConnectionsConfig(
  actualConfig: Record<string, unknown>,
  profile: ResearchWorkbenchProfile
): string[] {
  const actual = extractSmartActual(actualConfig);
  const mismatches: string[] = [];

  if (actual.language !== profile.language) {
    mismatches.push("smart-language");
  }
  if (!sameNormalizedList(ensureArray<string>(actual.folderExclusions), profile.smartFolderExclusions)) {
    mismatches.push("smart-folder-exclusions");
  }
  if (!sameNormalizedList(ensureArray<string>(actual.headingExclusions), profile.smartHeadingExclusions)) {
    mismatches.push("smart-heading-exclusions");
  }
  if (actual.resultsLimit !== profile.smartResultsLimit) {
    mismatches.push("smart-results-limit");
  }
  if (actual.renderMarkdown !== true) {
    mismatches.push("smart-render-markdown");
  }

  return mismatches;
}

function buildSemanticStatus(profile: ResearchWorkbenchProfile): CompanionPluginStatus {
  const mismatches: string[] = [];
  if (profile.semanticEnabled && !profile.semanticCommand) {
    mismatches.push("semantic-command");
  }

  return {
    id: SEMANTIC_BRIDGE_ID,
    installed: true,
    enabled: profile.semanticEnabled,
    ready: !profile.semanticEnabled || mismatches.length === 0,
    optional: true,
    configPath: null,
    mismatches,
    actual: {
      enabled: profile.semanticEnabled,
      command: profile.semanticCommand,
      timeoutMs: profile.semanticTimeoutMs
    }
  };
}

export async function readResearchWorkbenchState(
  app: App,
  profile: ResearchWorkbenchProfile
): Promise<ResearchWorkbenchState> {
  const enabledPluginRaw = await app.vault.adapter.read(configPath(app, "community-plugins.json")).catch(() => "[]");
  const zoteroConfigPath = pluginDataPath(app, ZOTERO_ID);
  const pdfConfigPath = pluginDataPath(app, PDF_PLUS_ID);
  const smartConfigPath = SMART_CONNECTIONS_CONFIG_PATH;
  let enabledPluginIds: string[] = [];
  try {
    const parsed = JSON.parse(enabledPluginRaw);
    enabledPluginIds = Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    enabledPluginIds = [];
  }

  const zoteroInstalled = await pathExists(app, pluginManifestPath(app, ZOTERO_ID));
  const zoteroConfig = await readJson(app, zoteroConfigPath);
  const zoteroStatus: CompanionPluginStatus = {
    id: ZOTERO_ID,
    installed: zoteroInstalled,
    enabled: enabledPluginIds.includes(ZOTERO_ID),
    ready: zoteroInstalled && enabledPluginIds.includes(ZOTERO_ID) && diffZoteroConfig(zoteroConfig, profile).length === 0,
    optional: true,
    configPath: zoteroConfigPath,
    mismatches: diffZoteroConfig(zoteroConfig, profile),
    actual: extractZoteroActual(zoteroConfig)
  };

  const pdfInstalled = await pathExists(app, pluginManifestPath(app, PDF_PLUS_ID));
  const pdfConfig = await readJson(app, pdfConfigPath);
  const pdfStatus: CompanionPluginStatus = {
    id: PDF_PLUS_ID,
    installed: pdfInstalled,
    enabled: enabledPluginIds.includes(PDF_PLUS_ID),
    ready: pdfInstalled && enabledPluginIds.includes(PDF_PLUS_ID) && diffPdfConfig(pdfConfig).length === 0,
    optional: false,
    configPath: pdfConfigPath,
    mismatches: diffPdfConfig(pdfConfig),
    actual: extractPdfActual(pdfConfig)
  };

  const smartInstalled = await pathExists(app, pluginManifestPath(app, SMART_CONNECTIONS_ID));
  const smartConfig = await readJson(app, smartConfigPath);
  const smartStatus: CompanionPluginStatus = {
    id: SMART_CONNECTIONS_ID,
    installed: smartInstalled,
    enabled: enabledPluginIds.includes(SMART_CONNECTIONS_ID),
    ready: smartInstalled && enabledPluginIds.includes(SMART_CONNECTIONS_ID) && diffSmartConnectionsConfig(smartConfig, profile).length === 0,
    optional: false,
    configPath: smartConfigPath,
    mismatches: diffSmartConnectionsConfig(smartConfig, profile),
    actual: extractSmartActual(smartConfig)
  };

  return {
    profile,
    enabledPluginIds,
    companions: [
      zoteroStatus,
      pdfStatus,
      smartStatus,
      buildSemanticStatus(profile)
    ]
  };
}

export async function applyCompanionPresetToVault(
  app: App,
  id: Exclude<CompanionPluginId, "semantic-bridge">,
  profile: ResearchWorkbenchProfile
): Promise<void> {
  if (id === ZOTERO_ID) {
    const zoteroConfigPath = pluginDataPath(app, ZOTERO_ID);
    const current = await readJson(app, zoteroConfigPath);
    const recommended = buildRecommendedZoteroConfig(profile);
    const exportFormats = upsertNamedEntries(
      ensureArray<ZoteroFormat>(current.exportFormats).map((item) => ({ ...item, name: ensureString(item.name) })),
      ensureArray<ZoteroFormat>(recommended.exportFormats).map((item) => ({ ...item, name: ensureString(item.name) }))
    );
    const citeFormats = upsertNamedEntries(
      ensureArray<ZoteroCiteFormat>(current.citeFormats).map((item) => ({ ...item, name: ensureString(item.name) })),
      ensureArray<ZoteroCiteFormat>(recommended.citeFormats).map((item) => ({ ...item, name: ensureString(item.name) }))
    );
    const next = {
      ...current,
      noteImportFolder: recommended.noteImportFolder,
      citeSuggestTemplate: recommended.citeSuggestTemplate,
      openNoteAfterImport: recommended.openNoteAfterImport,
      whichNotesToOpenAfterImport: recommended.whichNotesToOpenAfterImport,
      exportFormats,
      citeFormats
    };
    await writeJson(app, zoteroConfigPath, next);
    return;
  }

  if (id === PDF_PLUS_ID) {
    const pdfConfigPath = pluginDataPath(app, PDF_PLUS_ID);
    const current = await readJson(app, pdfConfigPath);
    const recommended = buildRecommendedPdfConfig();
    const next = {
      ...current,
      displayTextFormats: upsertNamedEntries(
        ensureArray<PdfNamedTemplate>(current.displayTextFormats).map((item) => ({ ...item, name: ensureString(item.name) })),
        ensureArray<PdfNamedTemplate>(recommended.displayTextFormats).map((item) => ({ ...item, name: ensureString(item.name) }))
      ),
      copyCommands: upsertNamedEntries(
        ensureArray<PdfNamedTemplate>(current.copyCommands).map((item) => ({ ...item, name: ensureString(item.name) })),
        ensureArray<PdfNamedTemplate>(recommended.copyCommands).map((item) => ({ ...item, name: ensureString(item.name) }))
      ),
      defaultDisplayTextFormatIndex: 0,
      syncDisplayTextFormat: true,
      highlightBacklinks: true,
      hoverHighlightAction: "preview",
      selectionProductMenuConfig: mergeMenuConfig(
        ensureArray<string>(current.selectionProductMenuConfig).map(String),
        ensureArray<string>(recommended.selectionProductMenuConfig).map(String)
      ),
      annotationProductMenuConfig: mergeMenuConfig(
        ensureArray<string>(current.annotationProductMenuConfig).map(String),
        ensureArray<string>(recommended.annotationProductMenuConfig).map(String)
      )
    };
    await writeJson(app, pdfConfigPath, next);
    return;
  }

  const current = await readJson(app, SMART_CONNECTIONS_CONFIG_PATH);
  const smartSources = toRecord(current.smart_sources);
  const smartViewFilter = toRecord(current.smart_view_filter);
  const connectionLists = toRecord(current.connections_lists);
  const next = {
    ...current,
    language: profile.language,
    smart_sources: {
      ...smartSources,
      excluded_headings: profile.smartHeadingExclusions.join(","),
      folder_exclusions: profile.smartFolderExclusions.join(",")
    },
    smart_view_filter: {
      ...smartViewFilter,
      render_markdown: true
    },
    connections_lists: {
      ...connectionLists,
      results_limit: profile.smartResultsLimit
    }
  };
  await writeJson(app, SMART_CONNECTIONS_CONFIG_PATH, next);
}
