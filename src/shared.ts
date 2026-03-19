export interface SemanticSearchContext {
  query: string;
  vaultPath: string;
  filePath: string;
  selection: string;
}

export interface IngestionCommandContext {
  sourceType: string;
  source: string;
  vaultPath: string;
  filePath: string;
  selection: string;
  literatureFolder: string;
  attachmentsFolder: string;
  templatePath: string;
  metadataDoi: string;
  metadataArxiv: string;
  title: string;
  authors: string;
  year: string;
  downloadPdf: string;
  openAfterImport: string;
}

export type TagFacetMap = Map<string, Map<string, string[]>>;

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [String(value).trim()].filter(Boolean);
}

export function parseTagAliasMap(text: string): Map<string, string[]> {
  if (!text.trim()) {
    return new Map();
  }

  const parsed = JSON.parse(text) as Record<string, unknown>;
  const aliasMap = new Map<string, string[]>();

  for (const [canonical, value] of Object.entries(parsed)) {
    if (!canonical.trim()) {
      continue;
    }

    const aliases = Array.isArray(value)
      ? value.map((item) => String(item).trim()).filter(Boolean)
      : [String(value).trim()].filter(Boolean);
    aliasMap.set(canonical.trim(), aliases);
  }

  return aliasMap;
}

export function parseTagFacetMap(text: string): TagFacetMap {
  if (!text.trim()) {
    return new Map();
  }

  const parsed = JSON.parse(text) as Record<string, unknown>;
  const facetMap: TagFacetMap = new Map();

  for (const [facet, rawValue] of Object.entries(parsed)) {
    const normalizedFacet = facet.trim();
    if (!normalizedFacet) {
      continue;
    }

    const entries = new Map<string, string[]>();
    if (Array.isArray(rawValue)) {
      for (const item of rawValue) {
        const canonical = String(item).trim();
        if (canonical) {
          entries.set(canonical, []);
        }
      }
    } else if (rawValue && typeof rawValue === "object") {
      for (const [canonical, aliasesValue] of Object.entries(rawValue as Record<string, unknown>)) {
        const normalizedCanonical = canonical.trim();
        if (!normalizedCanonical) {
          continue;
        }
        entries.set(normalizedCanonical, normalizeStringArray(aliasesValue));
      }
    } else {
      for (const canonical of normalizeStringArray(rawValue)) {
        entries.set(canonical, []);
      }
    }

    if (entries.size > 0) {
      facetMap.set(normalizedFacet, entries);
    }
  }

  return facetMap;
}

export function formatFacetName(facet: string): string {
  return facet
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildShellCommand(template: string, replacements: Record<string, string>): string {
  let command = template;
  for (const [key, value] of Object.entries(replacements)) {
    command = command.replaceAll(`{{${key}}}`, shellEscape(value));
  }
  return command;
}

export function buildSemanticCommand(template: string, context: SemanticSearchContext): string {
  return buildShellCommand(template, {
    query: context.query,
    vault: context.vaultPath,
    file: context.filePath,
    selection: context.selection
  });
}

export function buildIngestionCommand(template: string, context: IngestionCommandContext): string {
  return buildShellCommand(template, {
    source_type: context.sourceType,
    source: context.source,
    vault: context.vaultPath,
    file: context.filePath,
    selection: context.selection,
    literature: context.literatureFolder,
    attachments: context.attachmentsFolder,
    template: context.templatePath,
    metadata_doi: context.metadataDoi,
    metadata_arxiv: context.metadataArxiv,
    title: context.title,
    authors: context.authors,
    year: context.year,
    download_pdf: context.downloadPdf,
    open_after_import: context.openAfterImport
  });
}

export const CssClasses = {
  SECTION: "lti-section",
  SECTION_BODY: "lti-section-body",
  SECTION_HEADER: "lti-section-header",
  SECTION_TOGGLE: "lti-section-toggle",
  SECTION_CHEVRON: "lti-section-chevron",
  SECTION_TITLE: "lti-section-toggle-title",
  SECTION_COUNT: "lti-section-count",
  SECTION_COLLAPSED: "is-collapsed",
  SECTION_HIDDEN: "is-hidden",
  TRUNCATE: "lti-truncate",
  BREAK_WRAP: "lti-break-wrap",
} as const;

export const Layout = {
  GAP: 10,
  MARGIN: 12,
} as const;
