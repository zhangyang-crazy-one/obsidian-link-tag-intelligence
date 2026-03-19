#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");

const SKILL_ROOT = path.resolve(__dirname, "..");
const DEFAULT_CONFIG = {
  version: "3.0",
  storage: {
    mode: "auto",
    data_roots: {
      claude: "~/.claude/homunculus",
      codex: "~/.codex/self-improvement",
    },
  },
  observation: {
    enabled: true,
    file_name: "observations.jsonl",
    max_file_size_mb: 10,
    archive_after_days: 7,
  },
  instincts: {
    personal_dir: "instincts/personal",
    inherited_dir: "instincts/inherited",
    min_confidence: 0.3,
    auto_approve_threshold: 0.7,
    confidence_decay_rate: 0.05,
  },
  observer: {
    enabled: true,
    model: "haiku",
    run_interval_minutes: 5,
    patterns_to_detect: [
      "user_corrections",
      "error_resolutions",
      "repeated_workflows",
      "tool_preferences",
    ],
  },
  evolution: {
    cluster_threshold: 3,
    evolved_dir: "evolved",
  },
};

function expandHome(targetPath) {
  if (!targetPath || typeof targetPath !== "string") {
    return targetPath;
  }
  return targetPath.replace(/^~(?=\/|$)/, os.homedir());
}

function deepMerge(base, override) {
  const result = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === "object" &&
      !Array.isArray(base[key])
    ) {
      result[key] = deepMerge(base[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function detectMode() {
  const normalized = SKILL_ROOT.split(path.sep).join("/");
  if (normalized.includes("/.codex/")) {
    return "codex";
  }
  return "claude";
}

function getConfigPath() {
  return process.env.SELF_IMPROVEMENT_CONFIG || path.join(SKILL_ROOT, "config.json");
}

function getConfig() {
  const configPath = getConfigPath();
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return deepMerge(DEFAULT_CONFIG, raw);
  } catch (_) {
    return DEFAULT_CONFIG;
  }
}

function getDataRoot() {
  if (process.env.SELF_IMPROVEMENT_HOME) {
    return expandHome(process.env.SELF_IMPROVEMENT_HOME);
  }

  const config = getConfig();
  const mode = detectMode();
  return expandHome(config.storage.data_roots[mode]);
}

function getPaths() {
  const config = getConfig();
  const dataRoot = getDataRoot();

  return {
    mode: detectMode(),
    skillRoot: SKILL_ROOT,
    config,
    dataRoot,
    observationsFile: path.join(dataRoot, config.observation.file_name),
    instinctsPersonalDir: path.join(dataRoot, config.instincts.personal_dir),
    instinctsInheritedDir: path.join(dataRoot, config.instincts.inherited_dir),
    evolvedDir: path.join(dataRoot, config.evolution.evolved_dir),
  };
}

module.exports = {
  detectMode,
  expandHome,
  getConfig,
  getConfigPath,
  getDataRoot,
  getPaths,
};
