export interface SemanticSearchContext {
  query: string;
  vaultPath: string;
  filePath: string;
  selection: string;
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

export function buildSemanticCommand(template: string, context: SemanticSearchContext): string {
  return template
    .replaceAll("{{query}}", shellEscape(context.query))
    .replaceAll("{{vault}}", shellEscape(context.vaultPath))
    .replaceAll("{{file}}", shellEscape(context.filePath))
    .replaceAll("{{selection}}", shellEscape(context.selection));
}
