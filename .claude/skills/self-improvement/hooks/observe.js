#!/usr/bin/env node

/**
 * Self Improvement Observe Hook
 * Captures PreToolUse and PostToolUse events into observations.jsonl.
 */

const fs = require("fs");
const path = require("path");
const { getPaths } = require("../scripts/learning-config");

const { observationsFile } = getPaths();

function ensureObservationDir() {
  fs.mkdirSync(path.dirname(observationsFile), { recursive: true });
}

function sanitizeInput(input) {
  const sanitized = { ...(input || {}) };
  const sensitiveFields = [
    "password",
    "token",
    "secret",
    "key",
    "api_key",
    "github_token",
    "cookie",
    "authorization",
  ];

  function recursiveSanitize(obj) {
    if (typeof obj !== "object" || obj === null) {
      return obj;
    }

    for (const key of Object.keys(obj)) {
      if (sensitiveFields.some((field) => key.toLowerCase().includes(field))) {
        obj[key] = "[REDACTED]";
      } else if (typeof obj[key] === "object") {
        recursiveSanitize(obj[key]);
      }
    }
    return obj;
  }

  return recursiveSanitize(sanitized);
}

function debugLog(message) {
  if (process.env.SELF_IMPROVEMENT_DEBUG === "true") {
    console.error(`[self-improvement] ${message}`);
  }
}

function readStdin() {
  let input = "";
  process.stdin.on("data", (chunk) => {
    input += chunk;
  });

  process.stdin.on("end", () => {
    try {
      const data = input.trim() ? JSON.parse(input) : {};
      const observation = {
        timestamp: new Date().toISOString(),
        phase: process.argv[2] || "unknown",
        tool: data.tool || "unknown",
        tool_input: sanitizeInput(data.tool_input || {}),
        session_id: data.session_id || data.sessionId || null,
      };

      ensureObservationDir();
      fs.appendFileSync(observationsFile, `${JSON.stringify(observation)}\n`);
      debugLog(`observed ${observation.phase}:${observation.tool}`);
    } catch (error) {
      debugLog(`observation skipped: ${error.message}`);
    }
  });
}

readStdin();
