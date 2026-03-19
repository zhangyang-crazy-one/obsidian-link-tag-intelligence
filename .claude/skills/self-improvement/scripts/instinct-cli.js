#!/usr/bin/env node

/**
 * Self Improvement Instinct CLI
 */

const fs = require("fs");
const path = require("path");
const {
  getConfig,
  getPaths,
} = require("./learning-config");

const { config, observationsFile, instinctsPersonalDir, instinctsInheritedDir, evolvedDir } =
  getPaths();

function parseArgs(args) {
  const result = { _: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const nextArg = args[index + 1];
      if (nextArg !== undefined && !nextArg.startsWith("-")) {
        result[key] = nextArg;
        index += 1;
      } else if (key.includes("=")) {
        const [parsedKey, value] = key.split("=");
        result[parsedKey] = value;
      } else {
        result[key] = true;
      }
    } else if (arg.startsWith("-")) {
      const key = arg.slice(1);
      const nextArg = args[index + 1];
      if (nextArg !== undefined && !nextArg.startsWith("-")) {
        result[key] = nextArg;
        index += 1;
      } else {
        result[key] = true;
      }
    } else {
      result._.push(arg);
    }
  }
  return result;
}

function ensureDirs() {
  [instinctsPersonalDir, instinctsInheritedDir, evolvedDir].forEach((dir) => {
    fs.mkdirSync(dir, { recursive: true });
  });
}

function parseFrontmatter(yaml) {
  const result = {};
  for (const line of yaml.split("\n")) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (!match) {
      continue;
    }
    result[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return result;
}

function extractAction(body) {
  const match = body.match(/## Action\s*\n([\s\S]*?)(?:\n## |\s*$)/);
  if (!match) {
    return body.split("\n").find((line) => line.trim()) || "Analyze the situation";
  }
  return match[1].trim();
}

function readInstincts(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const content = fs.readFileSync(path.join(dir, file), "utf8");
      const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (!match) {
        return null;
      }

      const data = parseFrontmatter(match[1]);
      return {
        id: data.id || file.replace(".md", ""),
        file,
        ...data,
        confidence: Number.parseFloat(data.confidence || "0.5"),
        body: match[2].trim(),
        action: extractAction(match[2].trim()),
      };
    })
    .filter(Boolean);
}

function generateInstinctContent(instinct) {
  return `---
id: ${instinct.id}
trigger: "${instinct.trigger}"
confidence: ${instinct.confidence}
domain: "${instinct.domain}"
source: "${instinct.source}"
---

# ${instinct.title || instinct.id}

## Action
${instinct.action}

## Evidence
${instinct.evidence || `- Observed ${instinct.observations || 1} time(s)`}
`;
}

function cmdStatus() {
  ensureDirs();
  const personal = readInstincts(instinctsPersonalDir);
  const inherited = readInstincts(instinctsInheritedDir);
  const instincts = [...personal, ...inherited];

  console.log("📊 Instinct Status");
  console.log("==================\n");

  const byDomain = {};
  instincts.forEach((instinct) => {
    if (!byDomain[instinct.domain]) {
      byDomain[instinct.domain] = [];
    }
    byDomain[instinct.domain].push(instinct);
  });

  for (const [domain, items] of Object.entries(byDomain)) {
    console.log(`## ${domain} (${items.length} instincts)\n`);
    items.forEach((instinct) => {
      const filled = Math.floor(instinct.confidence * 10);
      const bar = "█".repeat(filled) + "░".repeat(10 - filled);
      console.log(`### ${instinct.id}`);
      console.log(`Confidence: ${bar} ${Math.round(instinct.confidence * 100)}%`);
      console.log(`Source: ${instinct.source}`);
      console.log("");
    });
  }

  console.log(`---\nTotal: ${personal.length} personal, ${inherited.length} inherited`);
}

function cmdObserve() {
  ensureDirs();

  if (!fs.existsSync(observationsFile)) {
    console.log("No observations found.");
    return;
  }

  const lines = fs
    .readFileSync(observationsFile, "utf8")
    .split("\n")
    .filter((line) => line.trim());
  console.log(`Processing ${lines.length} observations...`);
  console.log("Observation processing complete.");
}

function cmdEvolve() {
  ensureDirs();
  const instincts = [
    ...readInstincts(instinctsPersonalDir),
    ...readInstincts(instinctsInheritedDir),
  ];
  const threshold = config.evolution.cluster_threshold;

  console.log("🧬 Evolve Analysis");
  console.log("==================\n");

  const byDomain = {};
  instincts.forEach((instinct) => {
    if (!byDomain[instinct.domain]) {
      byDomain[instinct.domain] = [];
    }
    byDomain[instinct.domain].push(instinct);
  });

  for (const [domain, items] of Object.entries(byDomain)) {
    if (items.length < threshold) {
      continue;
    }

    console.log(`## Cluster: ${domain}`);
    console.log(`Found ${items.length} related instincts.`);
    console.log("Type: Skill (auto-triggered behavior)");
    console.log(
      `Confidence: ${(
        items.reduce((sum, instinct) => sum + instinct.confidence, 0) / items.length
      ).toFixed(2)}`
    );
    console.log("");

    const skillId = `${domain}-workflow`;
    const content = `---
name: ${skillId}
description: ${domain} workflow generated from ${items.length} related instincts
evolved_from: [${items.map((instinct) => instinct.id).join(", ")}]
---

# ${domain.charAt(0).toUpperCase() + domain.slice(1)} Workflow

Generated from ${items.length} related instincts.

## Instincts
${items.map((instinct) => `- ${instinct.id}: ${instinct.trigger}`).join("\n")}

## Workflow
1. ${items[0]?.action || "Analyze the situation"}
2. ${items[1]?.action || "Take appropriate action"}
3. Verify results
`;

    const skillDir = path.join(evolvedDir, "skills");
    fs.mkdirSync(skillDir, { recursive: true });
    const skillFile = path.join(skillDir, `${skillId}.md`);
    fs.writeFileSync(skillFile, content);
    console.log(`Created: ${skillFile}\n`);
  }

  console.log("Evolution complete.");
}

function cmdExport(args) {
  ensureDirs();
  const instincts = [
    ...readInstincts(instinctsPersonalDir),
    ...readInstincts(instinctsInheritedDir),
  ];
  const output = {
    version: "3.0",
    exported_by: "self-improvement",
    export_date: new Date().toISOString(),
    instincts: instincts.map((instinct) => ({
      id: instinct.id,
      trigger: instinct.trigger,
      action: instinct.action || instinct.body,
      confidence: instinct.confidence,
      domain: instinct.domain,
      observations: 1,
    })),
  };

  const outputFile =
    args.output ||
    `self-improvement-instincts-${new Date().toISOString().split("T")[0]}.json`;
  fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
  console.log(`Exported ${output.instincts.length} instincts to ${outputFile}`);
}

function cmdImport(args) {
  ensureDirs();
  const inputFile = args._[1] || args._[0];
  if (!inputFile) {
    console.log("Usage: node instinct-cli.js import <file>");
    return;
  }

  if (!fs.existsSync(inputFile)) {
    console.log(`File not found: ${inputFile}`);
    return;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(inputFile, "utf8"));
  } catch (_) {
    console.log("Invalid format. Expected JSON.");
    return;
  }

  let added = 0;
  let skipped = 0;

  for (const instinct of data.instincts || []) {
    const fileName = `${instinct.id}.md`;
    const personalFile = path.join(instinctsPersonalDir, fileName);
    const inheritedFile = path.join(instinctsInheritedDir, fileName);

    if (fs.existsSync(personalFile) || fs.existsSync(inheritedFile)) {
      skipped += 1;
      continue;
    }

    fs.writeFileSync(
      inheritedFile,
      generateInstinctContent({
        id: instinct.id,
        trigger: instinct.trigger,
        action: instinct.action,
        confidence: instinct.confidence || 0.5,
        domain: instinct.domain || "general",
        source: "inherited",
        observations: instinct.observations || 1,
      })
    );
    added += 1;
  }

  console.log("Import complete:");
  console.log(`  Added: ${added}`);
  console.log(`  Skipped: ${skipped}`);
}

function printHelp() {
  console.log("Usage: node scripts/instinct-cli.js <command> [options]");
  console.log("");
  console.log("Commands:");
  console.log("  status              Show all instincts with confidence");
  console.log("  observe             Process observations");
  console.log("  evolve              Cluster instincts into skills");
  console.log("  export [--output]   Export instincts for sharing");
  console.log("  import <file>       Import instincts");
}

function main() {
  getConfig();
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0] || "status";

  switch (command) {
    case "status":
      cmdStatus();
      break;
    case "observe":
      cmdObserve();
      break;
    case "evolve":
      cmdEvolve();
      break;
    case "export":
      cmdExport(args);
      break;
    case "import":
      cmdImport(args);
      break;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      console.log(`Unknown command: ${command}`);
      printHelp();
  }
}

main();
