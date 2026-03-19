#!/usr/bin/env node

import {
  CliCommandError,
  formatReferenceRange,
  inspectReferenceRange,
  locateReferenceRanges
} from "./reference-lib.mjs";
import {
  ingestResearchSource,
  inspectIngestedNote,
  parseCliArgs,
  resolveResearchSource,
  resolveSourceRequest
} from "./research-lib.mjs";
import {
  runPaperWorkflow,
  searchArxivPapers
} from "./workflow-lib.mjs";

function printJson(data) {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

function printHelp() {
  process.stdout.write(`lti-research.mjs

Usage:
  node cli/lti-research.mjs help
  node cli/lti-research.mjs search --query "data governance digital transformation"
  node cli/lti-research.mjs resolve --doi 10.1145/...
  node cli/lti-research.mjs resolve --arxiv 2403.01234
  node cli/lti-research.mjs resolve --pdf /path/to/paper.pdf --metadata-doi 10.1145/...
  node cli/lti-research.mjs ingest --source-type doi --source 10.1145/... --vault /path/to/vault
  node cli/lti-research.mjs paper --topic "数据治理和数智转型" --vault /path/to/vault --sources "arxiv:1706.03762,arxiv:2403.01234"
  node cli/lti-research.mjs inspect --vault /path/to/vault --note-path Knowledge/Research/Literature/doi-....md
  node cli/lti-research.mjs ref locate --vault /path/to/vault --note-path Knowledge/Research/Literature/doi-....md --query "quoted text"
  node cli/lti-research.mjs ref inspect --vault /path/to/vault --note-path Knowledge/Research/Literature/doi-....md --start-line 18 --end-line 22
  node cli/lti-research.mjs ref format --vault /path/to/vault --note-path Knowledge/Research/Literature/doi-....md --kind line --start-line 18 --end-line 22

Source selectors:
  --source-type <doi|arxiv|pdf> --source <value>
  --doi <doi>
  --arxiv <id>
  --pdf <path-or-url>

Optional metadata overrides:
  --metadata-doi <doi>
  --metadata-arxiv <id>
  --title <title>
  --authors <comma-separated-authors>
  --year <year>

Metadata enrichment:
  DOI sources are resolved through OpenAlex.
  DOI-bearing arXiv and PDF sources inherit OpenAlex citation metadata when available.
  Enriched fields include openalex_id, cited_by_count, referenced_works, related_works, concepts, and counts_by_year.

Ingest options:
  --vault <vault-path>
  --literature-folder <vault-relative-folder>
  --attachments-folder <vault-relative-folder>
  --template-path <vault-relative-template>
  --download-pdf <true|false>

Search options:
  --query <search-query>
  --max-results <number>

Paper workflow options:
  --topic <topic>
  --vault <vault-path>
  --sources <comma/newline-separated source specs>
  --query <arXiv search query used when --sources is omitted>
  --max-sources <number>
  --literature-folder <vault-relative-folder>
  --attachments-folder <vault-relative-folder>
  --topics-folder <vault-relative-folder>
  --analysis-folder <vault-relative-folder>
  --drafts-folder <vault-relative-folder>
  --metadata-doi <doi>
  --metadata-arxiv <id>
  --download-pdf <true|false>

Paper source specs:
  arxiv:1706.03762
  doi:10.1145/123456.7890
  pdf:/absolute/path/to/paper.pdf

Inspect options:
  --vault <vault-path>
  --note-path <vault-relative-note-path>

Reference inspect options:
  --vault <vault-path>
  --note-path <vault-relative-note-path>
  --start-line <1-based line>
  --end-line <1-based line, optional>
  --max-preview-lines <number, optional>

Reference locate options:
  --vault <vault-path>
  --note-path <vault-relative-note-path>
  --query <text-snippet>
  --scope <paragraph|line, optional, default paragraph>
  --max-results <number, optional>
  --max-preview-lines <number, optional>

Reference format options:
  --vault <vault-path>
  --note-path <vault-relative-note-path>
  --kind <line|block>
  --start-line <1-based line, required when --query is omitted>
  --end-line <1-based line, optional>
  --query <text-snippet, optional alternative to line numbers>
  --scope <paragraph|line, optional, default paragraph when using --query>
  --occurrence <1-based match index, optional when using --query>
  --max-preview-lines <number, optional>

Output:
  JSON on stdout
  validation errors as JSON on stdout with a non-zero exit code
  unexpected errors on stderr with a non-zero exit code
`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }

  const argv = process.argv.slice(2);

  if (argv[0] === "ref") {
    const subcommand = argv[1];
    if (!subcommand || !["inspect", "format", "locate"].includes(subcommand)) {
      throw new CliCommandError("unsupported-command", "Unsupported ref subcommand. Use ref inspect, ref locate, or ref format.", {
        command: subcommand || ""
      });
    }

    const { flags } = parseCliArgs([subcommand, ...argv.slice(2)]);
    if (subcommand === "inspect") {
      printJson(await inspectReferenceRange({
        vaultPath: flags.vault,
        notePath: flags["note-path"],
        startLine: flags["start-line"],
        endLine: flags["end-line"],
        maxPreviewLines: flags["max-preview-lines"]
      }));
      return;
    }

    if (subcommand === "locate") {
      printJson(await locateReferenceRanges({
        vaultPath: flags.vault,
        notePath: flags["note-path"],
        query: flags.query,
        scope: flags.scope,
        maxResults: flags["max-results"],
        maxPreviewLines: flags["max-preview-lines"]
      }));
      return;
    }

    printJson(await formatReferenceRange({
      vaultPath: flags.vault,
      notePath: flags["note-path"],
      kind: flags.kind,
      startLine: flags["start-line"],
      endLine: flags["end-line"],
      query: flags.query,
      scope: flags.scope,
      occurrence: flags.occurrence,
      maxPreviewLines: flags["max-preview-lines"]
    }));
    return;
  }

  const { command, flags } = parseCliArgs(argv);

  if (command === "help") {
    printHelp();
    return;
  }

  if (command === "resolve") {
    const request = resolveSourceRequest(flags);
    const metadata = await resolveResearchSource(request, flags);
    printJson({
      status: "ok",
      source_type: request.sourceType,
      source: request.source,
      metadata
    });
    return;
  }

  if (command === "ingest") {
    const request = resolveSourceRequest(flags);
    const result = await ingestResearchSource(request, {
      ...flags,
      vaultPath: flags.vault,
      literatureFolder: flags["literature-folder"],
      attachmentsFolder: flags["attachments-folder"],
      templatePath: flags["template-path"],
      downloadPdf: flags["download-pdf"]
    });
    printJson(result);
    return;
  }

  if (command === "search") {
    const result = await searchArxivPapers(flags.query, flags["max-results"]);
    printJson(result);
    return;
  }

  if (command === "paper") {
    const result = await runPaperWorkflow(flags);
    printJson(result);
    return;
  }

  if (command === "inspect") {
    const result = await inspectIngestedNote({
      vaultPath: flags.vault,
      notePath: flags["note-path"]
    });
    printJson(result);
    return;
  }

  throw new Error(`unsupported-command:${command}`);
}

main().catch((error) => {
  if (error instanceof CliCommandError) {
    printJson({
      status: "error",
      code: error.code,
      message: error.message,
      ...error.details
    });
    process.exitCode = 1;
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
