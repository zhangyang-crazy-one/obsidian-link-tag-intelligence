import { FileSystemAdapter, type App } from "obsidian";

const MAX_LOG_BYTES = 512 * 1024;

function resolveLogPath(app: App): string | null {
  const adapter = app.vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) {
    return null;
  }

  const fs = require("fs");
  const path = require("path");

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

  const fs = require("fs");
  const path = require("path");

  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, "", "utf8");
  return logPath;
}

export function debugLog(app: App, scope: string, details: Record<string, unknown> = {}): void {
  const logPath = resolveLogPath(app);
  if (!logPath) {
    return;
  }

  const fs = require("fs");
  const path = require("path");

  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    if (fs.existsSync(logPath) && fs.statSync(logPath).size > MAX_LOG_BYTES) {
      fs.writeFileSync(logPath, "", "utf8");
    }

    const payload = {
      ts: new Date().toISOString(),
      scope,
      ...details
    };

    fs.appendFileSync(logPath, `${JSON.stringify(payload)}\n`, "utf8");
  } catch (error) {
    console.error("[lti-debug-log] failed to write log", error);
  }
}
