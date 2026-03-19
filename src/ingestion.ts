import { App, FileSystemAdapter, Platform, TFile } from "obsidian";

import type { LinkTagIntelligenceSettings } from "./settings";
import { buildIngestionCommand } from "./shared";

export type ResearchSourceType = "doi" | "arxiv" | "pdf";

export interface ResearchIngestionRequest {
  sourceType: ResearchSourceType;
  source: string;
  metadataDoi?: string;
  metadataArxiv?: string;
  title?: string;
  authors?: string;
  year?: string;
  downloadPdf?: boolean;
}

export interface ResearchIngestionResult {
  status: string;
  sourceType: string;
  sourceId?: string;
  title: string;
  notePath: string;
  attachmentPaths: string[];
  warnings: string[];
  metadata: Record<string, unknown>;
}

export function isIngestionConfigured(settings: LinkTagIntelligenceSettings): boolean {
  return Boolean(settings.ingestionCommand.trim());
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

function normalizeResult(result: Record<string, unknown>): ResearchIngestionResult {
  const notePath = readOptionalString(result.note_path ?? result.notePath);
  if (!notePath) {
    throw new Error("invalid-cli-response");
  }

  return {
    status: readOptionalString(result.status) ?? "created",
    sourceType: readOptionalString(result.source_type ?? result.sourceType) ?? "",
    sourceId: readOptionalString(result.source_id ?? result.sourceId),
    title: readOptionalString(result.title) ?? notePath.split("/").pop()?.replace(/\.md$/i, "") ?? notePath,
    notePath,
    attachmentPaths: Array.isArray(result.attachment_paths)
      ? result.attachment_paths.map(String).filter(Boolean)
      : [],
    warnings: Array.isArray(result.warnings)
      ? result.warnings.map(String).filter(Boolean)
      : [],
    metadata:
      result.metadata && typeof result.metadata === "object"
        ? result.metadata as Record<string, unknown>
        : {}
  };
}

export async function runIngestionCommand(
  app: App,
  settings: LinkTagIntelligenceSettings,
  request: ResearchIngestionRequest,
  activeFile: TFile | null,
  selection: string
): Promise<ResearchIngestionResult> {
  if (!Platform.isDesktopApp) {
    throw new Error("desktop-only");
  }
  if (!isIngestionConfigured(settings)) {
    throw new Error("missing-command");
  }

  const command = buildIngestionCommand(settings.ingestionCommand, {
    sourceType: request.sourceType,
    source: request.source,
    vaultPath: getVaultBasePath(app),
    filePath: activeFile?.path ?? "",
    selection,
    literatureFolder: settings.researchLiteratureFolder,
    attachmentsFolder: settings.researchAttachmentsFolder,
    templatePath: settings.researchTemplatePath,
    metadataDoi: request.metadataDoi ?? "",
    metadataArxiv: request.metadataArxiv ?? "",
    title: request.title ?? "",
    authors: request.authors ?? "",
    year: request.year ?? "",
    downloadPdf: String(request.downloadPdf !== false),
    openAfterImport: String(settings.researchOpenNoteAfterImport)
  });

  const exec = getExecFunction();
  const stdout = await new Promise<string>((resolve, reject) => {
    exec(command, { timeout: settings.ingestionTimeoutMs, cwd: getVaultBasePath(app) || undefined }, (error, resultStdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || error.message));
        return;
      }
      resolve(resultStdout);
    });
  });

  const parsed = JSON.parse(stdout.trim()) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("invalid-cli-response");
  }
  return normalizeResult(parsed as Record<string, unknown>);
}
