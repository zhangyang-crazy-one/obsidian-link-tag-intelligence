import { FileSystemAdapter, type App } from "obsidian";
import { appendFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const MAX_LOG_BYTES = 512 * 1024;

function resolveLogPath(app: App): string | null {
  const adapter = app.vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) {
    return null;
  }

  return path.join(
    adapter.getBasePath(),
    app.vault.configDir,
    "plugins",
    "link-tag-intelligence",
    "debug-runtime.log"
  );
}

export function resetDebugLog(app: App): string | null {
  const logPath = resolveLogPath(app);
  if (!logPath) {
    return null;
  }

  mkdirSync(path.dirname(logPath), { recursive: true });
  writeFileSync(logPath, "", "utf8");
  return logPath;
}

export function debugLog(app: App, scope: string, details: Record<string, unknown> = {}): void {
  const logPath = resolveLogPath(app);
  if (!logPath) {
    return;
  }

  try {
    mkdirSync(path.dirname(logPath), { recursive: true });
    if (existsSync(logPath) && statSync(logPath).size > MAX_LOG_BYTES) {
      writeFileSync(logPath, "", "utf8");
    }

    const payload = {
      ts: new Date().toISOString(),
      scope,
      ...details
    };

    appendFileSync(logPath, `${JSON.stringify(payload)}\n`, "utf8");
  } catch (error) {
    console.error("[lti-debug-log] failed to write log", error);
  }
}
