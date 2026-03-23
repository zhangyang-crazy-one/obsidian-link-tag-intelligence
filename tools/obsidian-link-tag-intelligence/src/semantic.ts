import { App, FileSystemAdapter, Platform, TFile } from "obsidian";

import type { LinkTagIntelligenceSettings } from "./settings";
import { buildSemanticCommand } from "./shared";

export interface SemanticSearchResult {
  path: string;
  title: string;
  score: number;
  excerpt: string;
  reason: string;
  citekey?: string;
  author?: string;
  year?: string;
  page?: string;
  source_type?: string;
  evidence_kind?: string;
  suggested_tags: string[];
  suggested_relations: Record<string, string[]>;
}

export function isSemanticBridgeConfigured(settings: LinkTagIntelligenceSettings): boolean {
  return settings.semanticBridgeEnabled && Boolean(settings.semanticCommand.trim());
}

function getVaultBasePath(app: App): string {
  const adapter = app.vault.adapter;
  return adapter instanceof FileSystemAdapter ? adapter.getBasePath() : "";
}

type ExecFunction = (
  command: string,
  options: { timeout?: number; cwd?: string },
  callback: (error: Error | null, stdout: string, stderr: string) => void
) => void;

type ChildProcessModule = {
  exec?: ExecFunction;
};

function getDesktopRequire(): ((moduleName: string) => unknown) | null {
  const desktopRequire = (globalThis as typeof globalThis & {
    require?: (moduleName: string) => unknown;
  }).require;

  return typeof desktopRequire === "function" ? desktopRequire : null;
}

function getExecFunction(): ExecFunction {
  const desktopRequire = getDesktopRequire();
  if (!desktopRequire) {
    throw new Error("desktop-shell-unavailable");
  }

  const childProcess = desktopRequire("child_process") as ChildProcessModule | undefined;
  if (typeof childProcess?.exec !== "function") {
    throw new Error("desktop-shell-unavailable");
  }

  return childProcess.exec;
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function normalizeResult(result: Record<string, unknown>): SemanticSearchResult | null {
  if (typeof result.path !== "string" || !result.path.trim()) {
    return null;
  }

  return {
    path: result.path,
    title: typeof result.title === "string" && result.title.trim() ? result.title : result.path.split("/").pop() ?? result.path,
    score: typeof result.score === "number" ? result.score : 0,
    excerpt: typeof result.excerpt === "string" ? result.excerpt : "",
    reason: typeof result.reason === "string" ? result.reason : "",
    citekey: readOptionalString(result.citekey ?? result.citation_key),
    author: readOptionalString(result.author ?? result.authors),
    year: readOptionalString(result.year),
    page: readOptionalString(result.page ?? result.locator),
    source_type: readOptionalString(result.source_type ?? result.sourceType),
    evidence_kind: readOptionalString(result.evidence_kind ?? result.evidenceKind),
    suggested_tags: Array.isArray(result.suggested_tags) ? result.suggested_tags.map(String) : [],
    suggested_relations:
      result.suggested_relations && typeof result.suggested_relations === "object"
        ? Object.fromEntries(
            Object.entries(result.suggested_relations as Record<string, unknown>).map(([key, value]) => [
              key,
              Array.isArray(value) ? value.map(String) : []
            ])
          )
        : {}
  };
}

export async function runSemanticSearch(
  app: App,
  settings: LinkTagIntelligenceSettings,
  query: string,
  activeFile: TFile | null,
  selection: string
): Promise<SemanticSearchResult[]> {
  if (!Platform.isDesktopApp) {
    throw new Error("desktop-only");
  }
  if (!isSemanticBridgeConfigured(settings)) {
    throw new Error("missing-command");
  }

  const command = buildSemanticCommand(settings.semanticCommand, {
    query,
    vaultPath: getVaultBasePath(app),
    filePath: activeFile?.path ?? "",
    selection
  });

  const exec = getExecFunction();

  const stdout = await new Promise<string>((resolve, reject) => {
    exec(command, { timeout: settings.semanticTimeoutMs, cwd: getVaultBasePath(app) || undefined }, (error, resultStdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || error.message));
        return;
      }
      resolve(resultStdout);
    });
  });

  const parsed = JSON.parse(stdout.trim()) as unknown;
  const items = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).results)
      ? (parsed as Record<string, unknown>).results
      : [];

  return (items as Record<string, unknown>[])
    .map(normalizeResult)
    .filter((result): result is SemanticSearchResult => result !== null);
}
