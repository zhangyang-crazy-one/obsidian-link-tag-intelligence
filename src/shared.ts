export interface SemanticSearchContext {
  query: string;
  vaultPath: string;
  filePath: string;
  selection: string;
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
