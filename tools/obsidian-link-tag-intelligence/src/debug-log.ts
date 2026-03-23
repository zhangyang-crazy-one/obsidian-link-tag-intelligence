import { FileSystemAdapter, normalizePath, type App, type DataAdapter } from "obsidian";

const MAX_LOG_BYTES = 512 * 1024;
const writeQueues = new WeakMap<App, Promise<void>>();

function getLogRelativePath(app: App): string {
  return normalizePath(`${app.vault.configDir}/plugins/link-tag-intelligence/debug-runtime.log`);
}

function getParentPath(normalizedPath: string): string {
  const lastSlash = normalizedPath.lastIndexOf("/");
  return lastSlash >= 0 ? normalizedPath.slice(0, lastSlash) : "";
}

function resolveDisplayPath(app: App, relativePath: string): string {
  const adapter = app.vault.adapter;
  if (adapter instanceof FileSystemAdapter) {
    return `${adapter.getBasePath()}/${relativePath}`;
  }
  return relativePath;
}

async function ensureDirectory(adapter: DataAdapter, filePath: string): Promise<void> {
  const directory = getParentPath(filePath);
  if (!directory) {
    return;
  }
  if (!(await adapter.exists(directory))) {
    await adapter.mkdir(directory);
  }
}

function queueWrite(app: App, writer: () => Promise<void>): void {
  const next = (writeQueues.get(app) ?? Promise.resolve())
    .catch(() => undefined)
    .then(writer)
    .catch((error) => {
      console.error("[lti-debug-log] failed to write log", error);
    });
  writeQueues.set(app, next);
}

export function resetDebugLog(app: App): string | null {
  const adapter = app.vault.adapter;
  const logPath = getLogRelativePath(app);
  const displayPath = resolveDisplayPath(app, logPath);

  queueWrite(app, async () => {
    try {
      await ensureDirectory(adapter, logPath);
      await adapter.write(logPath, "", {});
    } catch (error) {
      console.error("[lti-debug-log] failed to reset log", error);
    }
  });

  return displayPath;
}

export function debugLog(app: App, scope: string, details: Record<string, unknown> = {}): void {
  const adapter = app.vault.adapter;
  const logPath = getLogRelativePath(app);
  const payload = {
    ts: new Date().toISOString(),
    scope,
    ...details
  };

  queueWrite(app, async () => {
    try {
      await ensureDirectory(adapter, logPath);
      const stat = await adapter.stat(logPath);
      if (stat && stat.size > MAX_LOG_BYTES) {
        await adapter.write(logPath, "", {});
      }
      await adapter.append(logPath, `${JSON.stringify(payload)}\n`, {});
    } catch (error) {
      console.error("[lti-debug-log] failed to write log", error);
    }
  });
}
